/**
 * npm run import-tour-content [-- --dir=data/tour-content] [--keep-names] [--overwrite-prices] [--dry-run] [--no-regenerate]
 *   --keep-names        keep the current tour names (don't apply the proposed clearer names)
 *   --overwrite-prices  replace price_from with the researched "from" price even when a price exists
 *   --dry-run           report only, write nothing
 *   --no-regenerate     skip rebuilding the static pages afterwards
 *
 * Loads researched tour-page content (JSON files, one array per file, in the
 * schema produced by the content research brief) into tours.data:
 *   - data.content        ← overview / location / review / verdict / faq / contact / sources / confidence / updatedOn
 *   - metaTitle, metaDescription, focusKeyphrase  ← seo.* (only when present)
 *   - durationLabel, tourType, city, priceFrom     ← cards.* (only when present; priceFrom only when the tour has none)
 *   - contactPhone / contactEmail                  ← contact.* (only when the tour has none)
 *   - location {lat,lng}                           ← location.lat/lng (only when the tour has none)
 *   - highlights                                   ← overview.highlights (when 3+)
 *   - fullDescription                              ← overview.verdictSnippet (keeps the old text if the snippet is empty)
 *   - name                                         ← when nameChanged, unless --keep-names
 * Tours are matched by slug; unmatched entries and "needsData" notes are listed
 * at the end. Afterwards every changed tour page and the listing pages are rebuilt.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { pool, query } = require("./db");

const args = process.argv.slice(2);
const opt = (name, def) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : def; };
const flag = (name) => args.includes(`--${name}`);
const DIR = path.resolve(__dirname, "..", opt("dir", "data/tour-content"));
const KEEP_NAMES = flag("keep-names");
const OVERWRITE_PRICES = flag("overwrite-prices");
const DRY = flag("dry-run");
const NO_REGEN = flag("no-regenerate");

const BANNED = /\b(breathtaking|unforgettable|must-do|once-in-a-lifetime|hidden gem|paradise|bucket list|stunning|amazing|incredible)\b/i;
const LEAK = /\[NEEDS DATA|\bdataset\b|\[TODO|\bNEEDS DATA\b/i;

const s = (v) => (v == null ? "" : String(v)).trim();
const arr = (v) => (Array.isArray(v) ? v.map(s).filter(Boolean) : []);
const num = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));

function toContent(t, updatedOn) {
  const o = t.overview || {}, l = t.location || {}, r = t.review || {}, v = t.verdict || {}, k = t.contact || {};
  return {
    overview: {
      verdictSnippet: s(o.verdictSnippet), highlights: arr(o.highlights), whatToExpect: arr(o.whatToExpect),
      included: arr(o.included), notIncluded: arr(o.notIncluded), whatToBring: arr(o.whatToBring),
      restrictions: arr(o.restrictions), cancellationPolicy: s(o.cancellationPolicy),
    },
    location: { meetingPoint: s(l.meetingPoint), checkIn: s(l.checkIn), parking: s(l.parking) },
    review: {
      methodology: s(r.methodology),
      ratings: (Array.isArray(r.ratings) ? r.ratings : []).filter((x) => x && s(x.platform)).map((x) => ({ platform: s(x.platform), rating: num(x.rating), count: num(x.count), asOf: s(x.asOf), sourceUrl: s(x.sourceUrl) })),
      praise: (Array.isArray(r.praise) ? r.praise : []).filter((x) => x && s(x.title)).map((x) => ({ title: s(x.title), count: s(x.count), summary: s(x.summary), example: s(x.example) })),
      complaints: (Array.isArray(r.complaints) ? r.complaints : []).filter((x) => x && s(x.title)).map((x) => ({ title: s(x.title), count: s(x.count), note: s(x.note), recency: s(x.recency), summary: s(x.summary), example: s(x.example), operatorResponse: s(x.operatorResponse) })),
      operatorWide: s(r.operatorWide),
    },
    verdict: { intro: s(v.intro), bookIf: arr(v.bookIf), skipIf: arr(v.skipIf), tips: arr(v.tips), cta: s(v.cta) },
    faq: (Array.isArray(t.faq) ? t.faq : []).filter((f) => f && s(f.q) && s(f.a)).map((f) => ({ q: s(f.q), a: s(f.a) })),
    contact: { website: s(k.website), address: s(k.address), hours: s(k.hours) },
    sources: (Array.isArray(t.sources) ? t.sources : []).filter((x) => x && s(x.url)).map((x) => ({ url: s(x.url), what: s(x.what), fetchedOn: s(x.fetchedOn) })),
    confidence: s(t.confidence) || "medium",
    needsData: arr(t.needsData),
    updatedOn,
  };
}

/** Walk every public text field and flag leaks / banned marketing words. */
function lint(slug, content, seo) {
  const problems = [];
  const visit = (val, where) => {
    if (typeof val === "string") {
      if (LEAK.test(val)) problems.push(`${slug}: internal note leaked in ${where}`);
      if (BANNED.test(val)) problems.push(`${slug}: banned word "${val.match(BANNED)[0]}" in ${where}`);
    } else if (Array.isArray(val)) val.forEach((x, i) => visit(x, `${where}[${i}]`));
    else if (val && typeof val === "object") Object.keys(val).forEach((k) => { if (k !== "sources" && k !== "needsData" && !/url$/i.test(k)) visit(val[k], `${where}.${k}`); });
  };
  visit(content, "content");
  if (seo.metaTitle && (seo.metaTitle.length < 50 || seo.metaTitle.length > 70)) problems.push(`${slug}: metaTitle is ${seo.metaTitle.length} chars (want 50–70)`);
  if (seo.metaDescription && (seo.metaDescription.length < 150 || seo.metaDescription.length > 170)) problems.push(`${slug}: metaDescription is ${seo.metaDescription.length} chars (want 150–170)`);
  const words = content.overview.verdictSnippet.split(/\s+/).filter(Boolean).length;
  if (words > 70) problems.push(`${slug}: verdictSnippet is ${words} words (want ≤ 60)`);
  return problems;
}

function loadEntries() {
  if (!fs.existsSync(DIR)) throw new Error(`Content folder not found: ${DIR}`);
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
  const entries = new Map();
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    const list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.tours) ? raw.tours : [raw];
    for (const t of list) if (t && t.slug) entries.set(t.slug, { ...t, _file: f }); // later files win
  }
  return { files, entries };
}

async function main() {
  const { files, entries } = loadEntries();
  console.log(`Read ${entries.size} tour entries from ${files.length} file(s) in ${DIR}${DRY ? " (dry run — nothing written)" : ""}`);
  const updatedOn = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const { rows } = await query("SELECT id, slug, data, price_from FROM tours");
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const changed = [];
  const unmatched = [];
  const warnings = [];
  const needs = [];
  const seenTitles = new Map();

  for (const [slug, t] of entries) {
    const row = bySlug.get(slug);
    if (!row) { unmatched.push(`${slug} (${t._file})`); continue; }
    const d = { ...row.data };
    const content = toContent(t, s(t.updatedOn) || updatedOn);
    const seo = t.seo || {};
    warnings.push(...lint(slug, content, { metaTitle: s(seo.metaTitle), metaDescription: s(seo.metaDescription) }));
    if (s(seo.metaTitle)) { const prev = seenTitles.get(s(seo.metaTitle).toLowerCase()); if (prev) warnings.push(`${slug}: metaTitle duplicates ${prev}`); seenTitles.set(s(seo.metaTitle).toLowerCase(), slug); }
    (content.needsData || []).forEach((n) => needs.push(`${slug}: ${n}`));

    d.content = content;
    if (s(seo.metaTitle)) d.metaTitle = s(seo.metaTitle);
    if (s(seo.metaDescription)) d.metaDescription = s(seo.metaDescription);
    if (s(seo.focusKeyphrase)) d.focusKeyphrase = s(seo.focusKeyphrase);
    const c = t.cards || {};
    if (s(c.durationLabel)) d.durationLabel = s(c.durationLabel);
    if (s(c.tourType)) d.tourType = s(c.tourType);
    if (s(c.city)) d.city = s(c.city);
    let priceFrom = null;
    if (num(c.priceFrom) != null && (OVERWRITE_PRICES || !(num(row.price_from) > 0))) { d.priceFrom = num(c.priceFrom); priceFrom = num(c.priceFrom); }
    const k = t.contact || {};
    if (s(k.phone) && !s(d.contactPhone)) d.contactPhone = s(k.phone);
    if (s(k.email) && !s(d.contactEmail)) d.contactEmail = s(k.email);
    const l = t.location || {};
    if (num(l.lat) != null && num(l.lng) != null && !(d.location && num(d.location.lat) != null && num(d.location.lng) != null)) d.location = { lat: num(l.lat), lng: num(l.lng) };
    if (content.overview.highlights.length >= 3) d.highlights = content.overview.highlights;
    if (content.overview.verdictSnippet) d.fullDescription = content.overview.verdictSnippet;
    if (t.nameChanged && s(t.name) && !KEEP_NAMES) d.name = s(t.name);
    d.contentImportedAt = new Date().toISOString();

    changed.push({ id: row.id, slug, data: d, priceFrom });
  }

  if (!DRY) {
    for (const c of changed) {
      if (c.priceFrom != null) await query("UPDATE tours SET data = $1, price_from = $2, updated_at = NOW() WHERE id = $3", [JSON.stringify(c.data), c.priceFrom, c.id]);
      else await query("UPDATE tours SET data = $1, updated_at = NOW() WHERE id = $2", [JSON.stringify(c.data), c.id]);
    }
  }
  console.log(`\n${DRY ? "Would update" : "Updated"} ${changed.length} tour(s). Unmatched: ${unmatched.length}.`);
  if (unmatched.length) { console.log("\nNo tour with this slug in the database:"); unmatched.forEach((u) => console.log("  - " + u)); }
  if (warnings.length) { console.log(`\n${warnings.length} content warning(s) (imported anyway — fix in Admin → Tours → 4. Page content):`); warnings.forEach((w) => console.log("  - " + w)); }
  if (needs.length) { console.log(`\n${needs.length} "still needs data" note(s) from the research:`); needs.slice(0, 60).forEach((n) => console.log("  - " + n)); if (needs.length > 60) console.log(`  … and ${needs.length - 60} more (see data.content.needsData per tour)`); }

  if (!DRY && !NO_REGEN && changed.length) {
    const { regenerateAllPages, SITE_ROOT } = require("./ssr/generator");
    if (SITE_ROOT.includes("site-not-configured")) {
      console.log("\nSITE_ROOT not set — skipping page regeneration (run `npm run regenerate-all` where it is set).");
    } else {
      console.log(`\nRebuilding pages under ${SITE_ROOT} …`);
      const result = await regenerateAllPages();
      console.log(`Tours: ${result.tours}, posts: ${result.posts}, errors: ${result.errors.length}`);
      result.errors.forEach((e) => console.error("  - " + e));
      if (result.errors.length) process.exitCode = 1;
    }
  }
  await pool.end();
}

main().catch((err) => { console.error("Import failed:", err); process.exit(1); });
