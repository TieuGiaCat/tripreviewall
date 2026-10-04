const fs = require("fs");
const path = require("path");
const { query } = require("../db");
const { toPublicShape, toPostPublicShape } = require("../routes/publicApi");
const { renderTourPageHtml } = require("./tourTemplate");
const { renderPostPageHtml } = require("./postTemplate");
const { TOURS_PER_PAGE, renderToursIndexHtml, renderBlogIndexHtml, renderDestinationsHubHtml, renderIslandPageHtml, ISLANDS } = require("./listingTemplates");
const { renderHomeHtml } = require("./homeTemplate");
const { applyMetaTags } = require("../lib/pageSeo");
const { ensureSocialTags } = require("./sharedHtml");
const { ensureSiteInfo } = require("../lib/siteInfo");
const { PAGES_DIR } = require("../siteConfig");
const { parsePageSource, renderStaticPage } = require("./pageTemplate");
const { assetV } = require("./assetVersion");

const { SITE_ROOT } = require("../siteConfig");
const TOURS_DIR = path.join(SITE_ROOT, "tours");
const POSTS_DIR = path.join(SITE_ROOT, "blog");

// A generated file's name is `<slug>.html`. These two filenames are the
// generic dynamic templates that already live in the same folders — never
// let a tour/post slug collide with them.
const RESERVED_SLUGS = new Set(["tour-detail", "post-detail", "island", "page"]);

function isReservedSlug(slug) {
  return RESERVED_SLUGS.has(slug);
}

function tourFilePath(slug) {
  return path.join(TOURS_DIR, `${slug}.html`);
}
function postFilePath(slug) {
  return path.join(POSTS_DIR, `${slug}.html`);
}

/**
 * Injects any saved Settings → Tracking snippets (Google Tag Manager,
 * Facebook Pixel, etc.) right after the opening <head> and <body> tags.
 * Fetches fresh from the DB every call — an extra cheap local query per
 * page write, simplest way to guarantee every generated page stays in sync
 * with whatever is currently saved.
 */
/**
 * Makes a tracking snippet consent-gated: every executable <script> becomes
 * <script type="text/plain" data-consent="analytics"> (inert until
 * js/consent.js re-activates it after "Accept"), and <noscript> fallbacks —
 * e.g. GTM's tracking iframe — are dropped, since a no-JS visitor can never
 * give consent. Scripts that already declare a non-JS type (JSON etc.) are
 * left as they are.
 */
function gateForConsent(snippet) {
  return String(snippet || "")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "")
    .replace(/<script\b([^>]*)>/gi, (tag, attrs) => {
      const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
      if (type && !/^(text|application)\/(javascript|ecmascript)$|^module$/i.test(type)) return tag;
      const cleaned = attrs.replace(/\btype\s*=\s*["']?[^"'\s>]+["']?/i, "");
      return `<script type="text/plain" data-consent="analytics"${cleaned}>`;
    });
}

async function injectTracking(html) {
  html = ensureSocialTags(html);
  try {
    const { getTrackingScripts } = require("../routes/settingsRoutes");
    const { headScripts, bodyScripts } = await getTrackingScripts();
    const head = gateForConsent(headScripts).trim();
    const body = gateForConsent(bodyScripts).trim();
    // Function replacers: a "$" inside a snippet must not be read as a replacement pattern.
    if (head) html = html.replace("<head>", () => `<head>\n${head}`);
    if (body) html = html.replace("<body>", () => `<body>\n${body}`);
    if (head || body) {
      html = html.replace("</body>", () => `<script src="/js/consent.js?v=${assetV()}" defer></script>\n</body>`);
    }
  } catch (err) {
    console.error("[ssr] injectTracking failed (page still written without tracking scripts):", err.message);
  }
  return html;
}

/* ---- Writing pages (E7) ----
   Every page goes through writePage():
   - the page's Page SEO override (if any) is applied before writing, so the
     file is right the first time instead of written and then patched;
   - a page whose HTML hasn't changed is not written at all (saving one tour
     used to rewrite 8+ listing pages every time);
   - writes are async and atomic (temp file + rename), so a visitor or a
     restart in the middle never sees a half-written page. */
async function seoOverrideFor(relPath) {
  try {
    const r = await query(
      `SELECT meta_title, meta_description FROM page_seo WHERE ltrim(file_path, '/') = $1 LIMIT 1`,
      [relPath]
    );
    return r.rows[0] || null;
  } catch (err) {
    return null; // page_seo table missing on an old DB — just write the page
  }
}

async function writePage(outPath, html) {
  const rel = path.relative(SITE_ROOT, outPath).split(path.sep).join("/");
  const seo = await seoOverrideFor(rel);
  if (seo && (seo.meta_title || seo.meta_description)) html = applyMetaTags(html, seo.meta_title, seo.meta_description);
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
  try {
    if ((await fs.promises.readFile(outPath, "utf8")) === html) return false; // unchanged
  } catch (err) { /* new file */ }
  const tmp = `${outPath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await fs.promises.writeFile(tmp, html, "utf8");
    await fs.promises.rename(tmp, outPath);
  } catch (err) {
    fs.promises.unlink(tmp).catch(() => {});
    throw err;
  }
  return true;
}

async function removeFile(p, what) {
  try {
    await fs.promises.unlink(p);
  } catch (err) {
    if (err.code !== "ENOENT") console.error(`[ssr] Failed to remove ${what}:`, err.message);
  }
}

/** Writes/updates the static file for a published tour. No-ops silently if SITE_ROOT isn't configured yet. */
async function generateTourFile(tourRow) {
  await ensureSiteInfo();
  if (isReservedSlug(tourRow.slug)) {
    console.error(`[ssr] Refusing to generate a tour file for reserved slug "${tourRow.slug}".`);
    return { ok: false, error: `"${tourRow.slug}" is a reserved name — page not generated.` };
  }
  try {
    const tour = toPublicShape(tourRow);

    let similar = [];
    try {
      const result = await query(
        `SELECT slug, island, price_from, data FROM tours WHERE status = 'published' AND island = $1 AND slug != $2 LIMIT 3`,
        [tourRow.island, tourRow.slug]
      );
      similar = result.rows.map(toPublicShape);
    } catch (err) {
      console.error("[ssr] Could not load similar tours:", err.message);
    }

    let html = renderTourPageHtml(tour, similar);
    html = await injectTracking(html);
    await writePage(tourFilePath(tourRow.slug), html);
    return { ok: true };
  } catch (err) {
    console.error(`[ssr] Failed to generate tour page for "${tourRow.slug}":`, err.message);
    return { ok: false, error: `Tour page "${tourRow.slug}" could not be written: ${err.message}` };
  }
}

function removeTourFile(slug) {
  return removeFile(tourFilePath(slug), `tour page for "${slug}"`);
}

/** Writes/updates the static file for a published post. */
async function generatePostFile(postRow) {
  await ensureSiteInfo();
  if (isReservedSlug(postRow.slug)) {
    console.error(`[ssr] Refusing to generate a post file for reserved slug "${postRow.slug}".`);
    return;
  }
  try {
    const post = toPostPublicShape(postRow);

    let relatedTour = null;
    if (post.relatedTourSlug) {
      try {
        const result = await query(
          `SELECT slug, island, price_from, data FROM tours WHERE status = 'published' AND slug = $1 LIMIT 1`,
          [post.relatedTourSlug]
        );
        if (result.rows[0]) relatedTour = toPublicShape(result.rows[0]);
      } catch (err) {
        console.error("[ssr] Could not load related tour:", err.message);
      }
    }

    let author = null;
    if (post.authorSlug) {
      try {
        const result = await query(`SELECT slug, data FROM authors WHERE slug = $1 LIMIT 1`, [post.authorSlug]);
        if (result.rows[0]) {
          author = { slug: result.rows[0].slug, ...(result.rows[0].data || {}) };
          const countResult = await query(
            `SELECT count(*)::int AS n FROM posts WHERE status = 'published' AND data->>'authorSlug' = $1`,
            [post.authorSlug]
          );
          author.postCount = countResult.rows[0].n;
        }
      } catch (err) {
        console.error("[ssr] Could not load author:", err.message);
      }
    }

    let relatedPosts = [];
    try {
      // Smarter than plain "most recent": same category + same island tag
      // scores highest, then same category, then same island, then just
      // recency as the fallback — so "Read Next" actually relates.
      const result = await query(
        `SELECT slug, category, island_tag, content_format, published_at, updated_at, data,
           (CASE WHEN category = $2 AND category IS NOT NULL THEN 2 ELSE 0 END +
            CASE WHEN island_tag = $3 AND island_tag IS NOT NULL THEN 1 ELSE 0 END) AS relevance
         FROM posts WHERE status = 'published' AND slug != $1
         ORDER BY relevance DESC, updated_at DESC LIMIT 3`,
        [postRow.slug, postRow.category, postRow.island_tag]
      );
      relatedPosts = result.rows.map(toPostPublicShape);
    } catch (err) {
      console.error("[ssr] Could not load related posts:", err.message);
    }

    let html = renderPostPageHtml(post, relatedTour, relatedPosts, author);
    html = await injectTracking(html);
    await writePage(postFilePath(postRow.slug), html);
    return { ok: true };
  } catch (err) {
    console.error(`[ssr] Failed to generate post page for "${postRow.slug}":`, err.message);
    return { ok: false, error: `Article page "${postRow.slug}" could not be written: ${err.message}` };
  }
}

function removePostFile(slug) {
  return removeFile(postFilePath(slug), `article page for "${slug}"`);
}

/* ============================================================
   Listing / hub pages — regenerated wholesale (queries are cheap
   at this scale) any time a tour or post is published/unpublished.
   ============================================================ */
/**
 * Hand-written pages (admin/pages/*.html → SITE_ROOT). They're build output now,
 * not tracked in git, so Page SEO edits on the server can never block a
 * `git pull` again. Returns the list of files written.
 */
async function generateStaticPages(allTours, allPosts) {
  const written = [];
  const toursBySlug = {};
  (allTours || []).forEach((t) => { toursBySlug[t.slug] = t; });
  const walk = async (dir) => (await Promise.all((await fs.promises.readdir(dir, { withFileTypes: true })).map((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : (e.name.endsWith(".html") ? [path.join(dir, e.name)] : [])))).flat();
  let sources = [];
  try { sources = await walk(PAGES_DIR); } catch (err) { console.error("[ssr] no pages directory:", err.message); return written; }
  for (const file of sources) {
    try {
      const page = parsePageSource(await fs.promises.readFile(file, "utf8"));
      const html = await injectTracking(renderStaticPage(page, { toursBySlug, posts: allPosts || [] }));
      await writePage(path.join(SITE_ROOT, page.output), html);
      written.push(page.output);
    } catch (err) {
      console.error(`[ssr] static page ${path.relative(PAGES_DIR, file)} failed:`, err.message);
      generationErrors.push(`Page ${path.relative(PAGES_DIR, file)}: ${err.message}`);
    }
  }
  return written;
}

// Errors collected during the current regenerateListingPages() run.
let generationErrors = [];

/**
 * Rebuilds home, /tours (+ pages), /blog, /destinations, island pages and the
 * hand-written pages. Returns { ok, errors } so callers can tell the admin
 * when something couldn't be written (B5) instead of failing silently.
 */
/* Saving several tours quickly used to start several full rebuilds at the
   same time. Now only one runs; requests that arrive meanwhile share ONE
   follow-up rebuild, which starts when the current one finishes (so their
   changes are always included). */
let regenRunning = null;
let regenQueued = null;
function regenerateListingPages() {
  if (!regenRunning) {
    regenRunning = rebuildListingPages().finally(() => { regenRunning = null; });
    return regenRunning;
  }
  if (!regenQueued) {
    regenQueued = regenRunning.then(() => {
      regenQueued = null;
      return regenerateListingPages();
    });
  }
  return regenQueued;
}

async function rebuildListingPages() {
  generationErrors = [];
  try {
    await ensureSiteInfo();

    let allTours = [];
    let allPosts = [];
    try {
      const toursResult = await query(`SELECT slug, island, price_from, data FROM tours WHERE status = 'published'`);
      allTours = toursResult.rows.map(toPublicShape);
    } catch (err) {
      console.error("[ssr] regenerateListingPages: could not load tours:", err.message);
    }
    try {
      const postsResult = await query(
        `SELECT slug, category, island_tag, content_format, published_at, updated_at, data FROM posts WHERE status = 'published'`
      );
      allPosts = postsResult.rows.map(toPostPublicShape);
    } catch (err) {
      console.error("[ssr] regenerateListingPages: could not load posts:", err.message);
    }

    // Blog tabs follow Admin → Categories (active ones, in the same order).
    let blogCategories = null;
    try {
      const catResult = await query(`SELECT name FROM categories WHERE status = 'active' ORDER BY name ASC`);
      blogCategories = catResult.rows.map((r) => r.name);
    } catch (err) {
      console.error("[ssr] regenerateListingPages: could not load categories (using defaults):", err.message);
    }

    let blogTopics = null;
    try {
      const topicResult = await query(`SELECT name FROM topics WHERE status = 'active' ORDER BY name ASC`);
      blogTopics = topicResult.rows.map((r) => r.name);
    } catch (err) {
      console.error("[ssr] regenerateListingPages: could not load topics (run npm run migrate):", err.message);
    }

    const islandCounts = {};
    allTours.forEach((t) => { islandCounts[t.island] = (islandCounts[t.island] || 0) + 1; });

    // Destinations admin content (intro text + hero photo) — falls back to
    // the static defaults in ./islands.js for any island not yet edited
    // (or if the "destinations" table doesn't exist yet on an older DB).
    let destinationsBySlug = {};
    try {
      const destResult = await query(`SELECT slug, data FROM destinations`);
      destResult.rows.forEach((row) => { destinationsBySlug[row.slug] = row.data || {}; });
    } catch (err) {
      console.error("[ssr] regenerateListingPages: could not load destinations (using defaults):", err.message);
    }

    await writePage(path.join(SITE_ROOT, "tours.html"), await injectTracking(renderToursIndexHtml(allTours, 1)));
    // /tours/page/2, /tours/page/3 … — pages past the current count are removed
    // so a shrinking tour list never leaves stale pages behind.
    const pagesDir = path.join(TOURS_DIR, "page");
    const totalTourPages = Math.ceil(allTours.length / TOURS_PER_PAGE);
    for (let n = 2; n <= totalTourPages; n++) {
      await writePage(path.join(pagesDir, `${n}.html`), await injectTracking(renderToursIndexHtml(allTours, n)));
    }
    try {
      for (const f of await fs.promises.readdir(pagesDir)) {
        const n = parseInt(f, 10);
        if (!(n >= 2 && n <= totalTourPages && f === `${n}.html`)) await removeFile(path.join(pagesDir, f), `old listing page ${f}`);
      }
    } catch (err) { /* no page folder yet */ }
    await writePage(path.join(SITE_ROOT, "blog.html"), await injectTracking(renderBlogIndexHtml(allPosts, allPosts.filter((p) => p.featuredPillar), blogCategories, blogTopics)));
    await writePage(path.join(SITE_ROOT, "destinations.html"), await injectTracking(renderDestinationsHubHtml(islandCounts, destinationsBySlug)));
    await writePage(path.join(SITE_ROOT, "index.html"), await injectTracking(renderHomeHtml(allTours, allPosts, islandCounts, destinationsBySlug)));
    for (const isl of ISLANDS) {
      const html = await injectTracking(renderIslandPageHtml(isl.slug, allTours, allPosts, destinationsBySlug[isl.slug]));
      await writePage(path.join(SITE_ROOT, "destinations", `${isl.slug}.html`), html);
    }

    await generateStaticPages(allTours, allPosts);
    // Page SEO overrides are applied inside writePage().
  } catch (err) {
    console.error("[ssr] regenerateListingPages failed:", err.message);
    generationErrors.push(`Listing pages could not be rebuilt: ${err.message}`);
  }
  return { ok: generationErrors.length === 0, errors: generationErrors.slice() };
}

/**
 * Full site regeneration — every published tour + post + all listing pages.
 * Same work as `npm run regenerate-all`, callable from within the running
 * server (used by Settings → Tracking so a saved snippet applies everywhere
 * immediately, without needing to SSH in and run the script by hand).
 */
async function regenerateAllPages() {
  const errors = [];
  const toursResult = await query(`SELECT slug, status, island, price_from, data FROM tours WHERE status = 'published'`);
  for (const row of toursResult.rows) {
    const r = await generateTourFile(row);
    if (r && !r.ok) errors.push(r.error);
  }
  const postsResult = await query(
    `SELECT slug, status, category, island_tag, content_format, published_at, updated_at, data FROM posts WHERE status = 'published'`
  );
  for (const row of postsResult.rows) {
    const r = await generatePostFile(row);
    if (r && !r.ok) errors.push(r.error);
  }
  const listing = await regenerateListingPages();
  errors.push(...listing.errors);
  return { ok: errors.length === 0, errors, tours: toursResult.rows.length, posts: postsResult.rows.length };
}

/** Resolves once no listing rebuild is running or queued (used by the graceful shutdown). */
async function whenIdle() {
  while (regenRunning || regenQueued) {
    await (regenQueued || regenRunning).catch(() => {});
  }
}

module.exports = {
  whenIdle,
  generateTourFile, removeTourFile, generatePostFile, removePostFile,
  isReservedSlug, regenerateListingPages, regenerateAllPages, generateStaticPages, SITE_ROOT,
};
