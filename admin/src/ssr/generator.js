const fs = require("fs");
const path = require("path");
const { query } = require("../db");
const { toPublicShape, toPostPublicShape } = require("../routes/publicApi");
const { renderTourPageHtml } = require("./tourTemplate");
const { renderPostPageHtml } = require("./postTemplate");
const { TOURS_PER_PAGE, renderToursIndexHtml, renderBlogIndexHtml, renderDestinationsHubHtml, renderIslandPageHtml, ISLANDS } = require("./listingTemplates");
const { renderHomeHtml } = require("./homeTemplate");
const { applyAllPageSeoOverrides } = require("../lib/pageSeo");
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

/** Writes/updates the static file for a published tour. No-ops silently if SITE_ROOT isn't configured yet. */
async function generateTourFile(tourRow) {
  await ensureSiteInfo();
  if (isReservedSlug(tourRow.slug)) {
    console.error(`[ssr] Refusing to generate a tour file for reserved slug "${tourRow.slug}".`);
    return;
  }
  try {
    fs.mkdirSync(TOURS_DIR, { recursive: true });
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
    fs.writeFileSync(tourFilePath(tourRow.slug), html, "utf8");
  } catch (err) {
    console.error(`[ssr] Failed to generate tour page for "${tourRow.slug}":`, err.message);
  }
}

function removeTourFile(slug) {
  try {
    const p = tourFilePath(slug);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (err) {
    console.error(`[ssr] Failed to remove tour page for "${slug}":`, err.message);
  }
}

/** Writes/updates the static file for a published post. */
async function generatePostFile(postRow) {
  await ensureSiteInfo();
  if (isReservedSlug(postRow.slug)) {
    console.error(`[ssr] Refusing to generate a post file for reserved slug "${postRow.slug}".`);
    return;
  }
  try {
    fs.mkdirSync(POSTS_DIR, { recursive: true });
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
    fs.writeFileSync(postFilePath(postRow.slug), html, "utf8");
  } catch (err) {
    console.error(`[ssr] Failed to generate post page for "${postRow.slug}":`, err.message);
  }
}

function removePostFile(slug) {
  try {
    const p = postFilePath(slug);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (err) {
    console.error(`[ssr] Failed to remove post page for "${slug}":`, err.message);
  }
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
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : (e.name.endsWith(".html") ? [path.join(dir, e.name)] : []));
  let sources = [];
  try { sources = walk(PAGES_DIR); } catch (err) { console.error("[ssr] no pages directory:", err.message); return written; }
  for (const file of sources) {
    try {
      const page = parsePageSource(fs.readFileSync(file, "utf8"));
      const html = await injectTracking(renderStaticPage(page, { toursBySlug, posts: allPosts || [] }));
      const outPath = path.join(SITE_ROOT, page.output);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, html, "utf8");
      written.push(page.output);
    } catch (err) {
      console.error(`[ssr] static page ${path.relative(PAGES_DIR, file)} failed:`, err.message);
    }
  }
  return written;
}

async function regenerateListingPages() {
  try {
    await ensureSiteInfo();
    fs.mkdirSync(path.join(SITE_ROOT, "destinations"), { recursive: true });

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

    fs.writeFileSync(path.join(SITE_ROOT, "tours.html"), await injectTracking(renderToursIndexHtml(allTours, 1)), "utf8");
    // /tours/page/2, /tours/page/3 … — rebuilt from scratch so a shrinking
    // tour count never leaves stale pages behind.
    const pagesDir = path.join(TOURS_DIR, "page");
    fs.rmSync(pagesDir, { recursive: true, force: true });
    const totalTourPages = Math.ceil(allTours.length / TOURS_PER_PAGE);
    if (totalTourPages > 1) fs.mkdirSync(pagesDir, { recursive: true });
    for (let n = 2; n <= totalTourPages; n++) {
      fs.writeFileSync(path.join(pagesDir, `${n}.html`), await injectTracking(renderToursIndexHtml(allTours, n)), "utf8");
    }
    fs.writeFileSync(path.join(SITE_ROOT, "blog.html"), await injectTracking(renderBlogIndexHtml(allPosts, allPosts.filter((p) => p.featuredPillar))), "utf8");
    fs.writeFileSync(path.join(SITE_ROOT, "destinations.html"), await injectTracking(renderDestinationsHubHtml(islandCounts, destinationsBySlug)), "utf8");
    fs.writeFileSync(path.join(SITE_ROOT, "index.html"), await injectTracking(renderHomeHtml(allTours, allPosts, islandCounts, destinationsBySlug)), "utf8");
    for (const isl of ISLANDS) {
      const html = await injectTracking(renderIslandPageHtml(isl.slug, allTours, allPosts, destinationsBySlug[isl.slug]));
      fs.writeFileSync(path.join(SITE_ROOT, "destinations", `${isl.slug}.html`), html, "utf8");
    }

    await generateStaticPages(allTours, allPosts);
    await applyAllPageSeoOverrides();
  } catch (err) {
    console.error("[ssr] regenerateListingPages failed:", err.message);
  }
}

/**
 * Full site regeneration — every published tour + post + all listing pages.
 * Same work as `npm run regenerate-all`, callable from within the running
 * server (used by Settings → Tracking so a saved snippet applies everywhere
 * immediately, without needing to SSH in and run the script by hand).
 */
async function regenerateAllPages() {
  const toursResult = await query(`SELECT slug, status, island, price_from, data FROM tours WHERE status = 'published'`);
  for (const row of toursResult.rows) {
    await generateTourFile(row);
  }
  const postsResult = await query(
    `SELECT slug, status, category, island_tag, content_format, published_at, updated_at, data FROM posts WHERE status = 'published'`
  );
  for (const row of postsResult.rows) {
    await generatePostFile(row);
  }
  await regenerateListingPages();
}

module.exports = {
  generateTourFile, removeTourFile, generatePostFile, removePostFile,
  isReservedSlug, regenerateListingPages, regenerateAllPages, generateStaticPages, SITE_ROOT,
};
