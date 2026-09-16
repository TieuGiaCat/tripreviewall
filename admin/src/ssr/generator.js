const fs = require("fs");
const path = require("path");
const { query } = require("../db");
const { toPublicShape, toPostPublicShape } = require("../routes/publicApi");
const { renderTourPageHtml } = require("./tourTemplate");
const { renderPostPageHtml } = require("./postTemplate");
const { renderToursIndexHtml, renderBlogIndexHtml, renderDestinationsHubHtml, renderIslandPageHtml, ISLANDS } = require("./listingTemplates");
const { renderHomeHtml } = require("./homeTemplate");

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

    const html = renderTourPageHtml(tour, similar);
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

    let relatedPosts = [];
    try {
      const result = await query(
        `SELECT slug, category, island_tag, content_format, published_at, updated_at, data
         FROM posts WHERE status = 'published' AND slug != $1 ORDER BY updated_at DESC LIMIT 3`,
        [postRow.slug]
      );
      relatedPosts = result.rows.map(toPostPublicShape);
    } catch (err) {
      console.error("[ssr] Could not load related posts:", err.message);
    }

    const html = renderPostPageHtml(post, relatedTour, relatedPosts);
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

module.exports = { generateTourFile, removeTourFile, generatePostFile, removePostFile, isReservedSlug, regenerateListingPages, SITE_ROOT };

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

    fs.writeFileSync(path.join(SITE_ROOT, "tours.html"), renderToursIndexHtml(allTours), "utf8");
    fs.writeFileSync(path.join(SITE_ROOT, "blog.html"), renderBlogIndexHtml(allPosts), "utf8");
    fs.writeFileSync(path.join(SITE_ROOT, "destinations.html"), renderDestinationsHubHtml(islandCounts), "utf8");
    fs.writeFileSync(path.join(SITE_ROOT, "index.html"), renderHomeHtml(allTours, allPosts, islandCounts), "utf8");
    for (const isl of ISLANDS) {
      fs.writeFileSync(
        path.join(SITE_ROOT, "destinations", `${isl.slug}.html`),
        renderIslandPageHtml(isl.slug, allTours, allPosts),
        "utf8"
      );
    }
  } catch (err) {
    console.error("[ssr] regenerateListingPages failed:", err.message);
  }
}
