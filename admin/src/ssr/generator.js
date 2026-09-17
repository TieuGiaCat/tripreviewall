const fs = require("fs");
const path = require("path");
const { query } = require("../db");
const { toPublicShape, toPostPublicShape } = require("../routes/publicApi");
const { renderTourPageHtml } = require("./tourTemplate");
const { renderPostPageHtml } = require("./postTemplate");
const { renderToursIndexHtml, renderBlogIndexHtml, renderDestinationsHubHtml, renderIslandPageHtml, ISLANDS } = require("./listingTemplates");
const { renderHomeHtml } = require("./homeTemplate");
const { applyAllPageSeoOverrides } = require("../lib/pageSeo");

const SITE_ROOT = process.env.SITE_ROOT || path.join(__dirname, "..", "..", "..", "site-not-configured");
const TOURS_DIR = path.join(SITE_ROOT, "tours");
const POSTS_DIR = path.join(SITE_ROOT, "blog");

// A generated file's name is `<slug>.html`. These two filenames are the
// generic dynamic templates that already live in the same folders — never
// let a tour/post slug collide with them.
const RESERVED_SLUGS = new Set(["tour-detail", "post-detail", "island"]);

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
async function injectTracking(html) {
  try {
    const { getTrackingScripts } = require("../routes/settingsRoutes");
    const { headScripts, bodyScripts } = await getTrackingScripts();
    if (headScripts) html = html.replace("<head>", `<head>\n${headScripts}`);
    if (bodyScripts) html = html.replace("<body>", `<body>\n${bodyScripts}`);
  } catch (err) {
    console.error("[ssr] injectTracking failed (page still written without tracking scripts):", err.message);
  }
  return html;
}

/** Writes/updates the static file for a published tour. No-ops silently if SITE_ROOT isn't configured yet. */
async function generateTourFile(tourRow) {
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
async function regenerateListingPages() {
  try {
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

    fs.writeFileSync(path.join(SITE_ROOT, "tours.html"), await injectTracking(renderToursIndexHtml(allTours)), "utf8");
    fs.writeFileSync(path.join(SITE_ROOT, "blog.html"), await injectTracking(renderBlogIndexHtml(allPosts, allPosts.filter((p) => p.featuredPillar))), "utf8");
    fs.writeFileSync(path.join(SITE_ROOT, "destinations.html"), await injectTracking(renderDestinationsHubHtml(islandCounts, destinationsBySlug)), "utf8");
    fs.writeFileSync(path.join(SITE_ROOT, "index.html"), await injectTracking(renderHomeHtml(allTours, allPosts, islandCounts, destinationsBySlug)), "utf8");
    for (const isl of ISLANDS) {
      const html = await injectTracking(renderIslandPageHtml(isl.slug, allTours, allPosts, destinationsBySlug[isl.slug]));
      fs.writeFileSync(path.join(SITE_ROOT, "destinations", `${isl.slug}.html`), html, "utf8");
    }

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
  isReservedSlug, regenerateListingPages, regenerateAllPages, SITE_ROOT,
};
