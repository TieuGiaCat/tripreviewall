const { query } = require("../db");

/**
 * Maps a DB row (id, slug, status, island, price_from, data{...}) to the
 * exact JSON shape the public website already expects (matches the field
 * names in the former static data/tours-full.js), so the frontend rendering
 * code (tourCardTemplate, tour-detail.js, etc.) needs zero changes beyond
 * swapping its data source.
 */
function toPublicShape(row) {
  const d = row.data || {};
  return {
    slug: row.slug,
    title: d.name || row.slug,
    company: d.company || "",
    island: row.island || "",
    city: d.city || "",
    tourType: d.tourType || "Tour",
    duration: d.durationLabel || "—",
    highlights: d.highlights || [],
    fullDescription: d.fullDescription || "",
    verdict: d.verdict || {},
    googleSnapshot: d.googleSnapshot || {},
    variants: d.variants || [],
    fareharborShortname: d.fareharborShortname || "",
    gallery: d.gallery || [],
    bookingLinks: d.bookingLinks || {},
    priceFrom: row.price_from != null ? Number(row.price_from) : null,
    aggregatedRating: d.aggregatedRating != null ? Number(d.aggregatedRating) : null,
    reviewCountTotal: d.reviewCountTotal != null ? Number(d.reviewCountTotal) : null,
    ratingDistribution: d.ratingDistribution || { star5: 0, star4: 0, star3: 0, star2: 0, star1: 0 },
  };
}

async function listPublishedTours(req, res) {
  try {
    const result = await query(
      `SELECT slug, island, price_from, data FROM tours WHERE status = 'published' ORDER BY updated_at DESC`
    );
    const body = JSON.stringify(result.rows.map(toPublicShape));
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60", // light caching — data changes only when an editor publishes
      "Access-Control-Allow-Origin": "*",
    });
    res.end(body);
  } catch (err) {
    console.error("[public-api] listPublishedTours failed:", err.message);
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Could not load tours." }));
  }
}

async function getPublishedTourBySlug(req, res, slug) {
  try {
    const result = await query(
      `SELECT slug, island, price_from, data FROM tours WHERE status = 'published' AND slug = $1 LIMIT 1`,
      [slug]
    );
    if (result.rows.length === 0) {
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Not found." }));
      return;
    }
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify(toPublicShape(result.rows[0])));
  } catch (err) {
    console.error("[public-api] getPublishedTourBySlug failed:", err.message);
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Could not load tour." }));
  }
}

module.exports = { listPublishedTours, getPublishedTourBySlug };
