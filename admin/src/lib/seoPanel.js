/**
 * Yoast-style SEO panel for the admin forms (blog posts, tours, Page SEO).
 *
 *   seoPanelHtml({...})      → the panel markup + its JSON config
 *   seoPanelAssets()         → <script> tags to add at the end of the page
 *   usedKeyphrases(selfKey)  → { "normalized keyphrase": ["Post: Title", …] }
 *                              for the "previously used keyphrase" check
 *   scoreFor({...})          → { seoScore, readabilityScore } computed on the
 *                              server with the SAME analyzer as the browser
 *                              (saved with the item, shown as list dots)
 *
 * The analysis itself lives in admin/public/seo-analysis.js.
 */
const { query } = require("../db");
const { esc } = require("../utils");
const SeoAnalysis = require("../../public/seo-analysis.js");

function seoPanelAssets() {
  return `<script src="/admin/public/seo-analysis.js"></script>\n<script src="/admin/public/seo-panel.js"></script>`;
}

/**
 * opts = {
 *   type: "post" | "tour" | "page",
 *   keyphrase, metaTitle, metaDescription,
 *   titleField: 'input[name="title"]',   // the H1/name input in the same form (optional)
 *   slugField:  'input[name="slug"]',    // the slug input in the same form (optional)
 *   slug, hasSlug,                       // static slug when there's no slug field
 *   urlPrefix: "/blog/",
 *   titleSuffix: " | Tripreviewall",
 *   seoTitleFallbackText,                // shown/used when SEO title is empty (default: the title field)
 *   descFallback,                        // what Google would likely show when meta description is empty
 *   image, date,                         // for the mobile preview
 *   used,                                // usedKeyphrases() result
 *   staticHtml,                          // page text when there is no editor (Page SEO)
 *   extraHtml,                           // extra fields shown under "Search appearance"
 * }
 */
function seoPanelHtml(opts) {
  const o = opts || {};
  const config = {
    type: o.type || "post",
    titleField: o.titleField || null,
    slugField: o.slugField || null,
    slug: o.slug || "",
    hasSlug: o.hasSlug !== false,
    urlPrefix: o.urlPrefix || "/",
    titleSuffix: o.titleSuffix || "",
    seoTitleFallback: o.seoTitleFallbackText ? "text" : "title",
    seoTitleFallbackText: o.seoTitleFallbackText || "",
    descFallback: o.descFallback || "",         // what's published when the meta description box is empty
    descFallbackField: o.descFallbackField || null, // live source of that fallback (e.g. the Excerpt box)
    image: o.image || "",
    date: o.date || "",
    used: o.used || {},
    staticHtml: o.staticHtml || "",
    titleFallback: o.titleFallback || "",
    checkSlug: o.type !== "page",               // a page's URL can't be changed here, so it isn't scored
    usedUrl: o.usedUrl || null,                 // fetch the "used keyphrases" map instead of passing it in
    fallbackFields: o.fallbackFields || null,   // e.g. ["name", "company"] → "Name — Company"
    contentBuilder: o.contentBuilder || null,   // "tour": build the page text from the tour fields
    galleryCount: o.galleryCount || 0,
  };
  const json = JSON.stringify(config).replace(/</g, "\\u003c");
  const showSlugField = config.hasSlug && !!o.slugField;

  return `
<div class="form-card seo-panel" data-seo-panel>
  <div class="seo-tabs" role="tablist" aria-label="SEO analysis">
    <button type="button" role="tab" data-seo-tab="seo" aria-selected="true"><span class="seo-dot seo-dot-na" data-seo-tabdot="seo"></span>SEO</button>
    <button type="button" role="tab" data-seo-tab="readability" aria-selected="false"><span class="seo-dot seo-dot-na" data-seo-tabdot="readability"></span>Readability</button>
  </div>

  <div data-seo-pane="seo">
    <div class="seo-brand"><strong>Search optimization</strong><span>Optimize this page for Google — and for the people searching.</span></div>

    <details class="seo-section" open>
      <summary>Focus keyphrase</summary>
      <div class="seo-section-body">
        <label class="seo-label" for="seo-kp">Focus keyphrase</label>
        <input type="text" id="seo-kp" name="focusKeyphrase" data-seo="keyphrase" value="${esc(o.keyphrase || "")}" placeholder="Type here — e.g. things to do in kauai" autocomplete="off">
        <p class="seo-kp-warning" data-seo-kp-warning ${o.keyphrase ? "hidden" : ""}>Please enter a focus keyphrase first to track keyphrase performance</p>
        <p class="hint">The main word or phrase people type into Google to find this page. One keyphrase per page — don't reuse it on another page.</p>
      </div>
    </details>

    <details class="seo-section" open>
      <summary>Search appearance</summary>
      <div class="seo-section-body">
        <p class="hint" style="margin-top:0;">How this page should look in the search results.</p>
        <div class="gp-toolbar">
          <span class="seo-label" style="margin:0;">Google preview</span>
          <span class="gp-toggle" role="group" aria-label="Preview as">
            <button type="button" data-gp-mode="mobile" aria-pressed="true">Mobile</button>
            <button type="button" data-gp-mode="desktop" aria-pressed="false">Desktop</button>
          </span>
        </div>
        <div class="google-preview gp-mobile" data-seo-preview></div>

        <label class="seo-label" for="seo-title">SEO title</label>
        <input type="text" id="seo-title" name="metaTitle" data-seo="seoTitle" value="${esc(o.metaTitle || "")}">
        <div class="seo-bar" data-seo-bar="title"><span></span></div>
        <div class="seo-meta-row"><span class="hint">Leave empty to use the ${config.seoTitleFallback === "title" ? "title above" : "default title"}.${config.titleSuffix ? ` “${esc(config.titleSuffix.trim())}” is added automatically.` : ""}</span><span class="hint" data-seo-count="title"></span></div>

        ${showSlugField ? `
        <label class="seo-label" for="seo-slug">Slug</label>
        <input type="text" id="seo-slug" data-seo="slug" value="">
        <p class="hint">Same as the Slug field above — edit either one.</p>` : config.hasSlug ? `
        <label class="seo-label">URL</label>
        <p class="seo-static-url">tripreviewall.com${esc(config.urlPrefix)}${esc(config.slug)}</p>` : ""}

        <label class="seo-label" for="seo-desc">Meta description</label>
        <textarea id="seo-desc" name="metaDescription" data-seo="metaDescription" rows="3">${esc(o.metaDescription || "")}</textarea>
        <div class="seo-bar" data-seo-bar="desc"><span></span></div>
        <div class="seo-meta-row"><span class="hint">120–156 characters is the sweet spot.</span><span class="hint" data-seo-count="desc"></span></div>
        ${o.extraHtml || ""}
      </div>
    </details>

    <details class="seo-section" open>
      <summary>SEO analysis</summary>
      <div class="seo-section-body" data-seo-results="seo"></div>
    </details>
  </div>

  <div data-seo-pane="readability" hidden>
    <div class="seo-brand"><strong>Readability analysis</strong><span data-seo-words></span></div>
    <div class="seo-section-body" data-seo-results="readability"></div>
  </div>
</div>
<script type="application/json" id="seo-panel-config">${json}</script>`;
}

/** Every focus keyphrase already in use, except the item being edited. selfKey = "post:<id>" | "tour:<id>" | "page:<page_key>". */
async function usedKeyphrases(selfKey = "") {
  const map = {};
  const add = (kp, label, key) => {
    const n = SeoAnalysis.norm(kp);
    if (!n || key === selfKey) return;
    (map[n] = map[n] || []).push(label);
  };
  try {
    const posts = await query(`SELECT id, data->>'title' AS t, data->>'focusKeyphrase' AS kp FROM posts WHERE coalesce(data->>'focusKeyphrase', '') <> ''`);
    posts.rows.forEach((r) => add(r.kp, `Article “${r.t}”`, `post:${r.id}`));
  } catch (err) { /* posts table missing */ }
  try {
    const tours = await query(`SELECT id, data->>'name' AS t, data->>'focusKeyphrase' AS kp FROM tours WHERE coalesce(data->>'focusKeyphrase', '') <> ''`);
    tours.rows.forEach((r) => add(r.kp, `Tour “${r.t}”`, `tour:${r.id}`));
  } catch (err) { /* tours table missing */ }
  try {
    const pages = await query(`SELECT page_key, label, focus_keyphrase AS kp FROM page_seo WHERE coalesce(focus_keyphrase, '') <> ''`);
    pages.rows.forEach((r) => add(r.kp, `Page “${r.label}”`, `page:${r.page_key}`));
  } catch (err) { /* column added by migration 003 */ }
  return map;
}

/** GET /admin/seo/used-keyphrases?self=tour:<id> */
async function usedKeyphrasesJson(req, res, urlObj) {
  const map = await usedKeyphrases(String(urlObj.searchParams.get("self") || ""));
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(map));
}

/** Server-side score (same analyzer as the panel). */
function scoreFor({ type, keyphrase, title, seoTitle, metaDescription, slug, html, used }) {
  const r = SeoAnalysis.analyze({
    type, keyphrase, title, seoTitle, metaDescription, slug, html,
    usedElsewhere: (used || {})[SeoAnalysis.norm(keyphrase)] || [],
  });
  return { seoScore: r.seoScore, readabilityScore: r.readabilityScore };
}

/** Two small dots for list tables (SEO / Readability). */
function scoreDots(seoScore, readabilityScore, keyphrase) {
  const label = { good: "good", ok: "OK", bad: "needs work", na: "not analyzed" };
  const s = seoScore || "na";
  const r = readabilityScore || "na";
  return `<span class="seo-dots" title="SEO: ${label[s]} · Readability: ${label[r]}${keyphrase ? ` · Keyphrase: ${esc(keyphrase)}` : " · no focus keyphrase"}">` +
    `<span class="seo-dot seo-dot-${s}"></span><span class="seo-dot seo-dot-${r}"></span></span>`;
}

module.exports = { seoPanelHtml, seoPanelAssets, usedKeyphrases, usedKeyphrasesJson, scoreFor, scoreDots, SeoAnalysis };
