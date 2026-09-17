const { query } = require("../db");
const { esc } = require("../utils");

const SITE_URL = process.env.SITE_URL || "https://tripreviewall.com";

/**
 * GET /rss.xml — RSS 2.0 feed of the 30 most recently updated published
 * posts. Public, unauthenticated, dynamic (queries the live DB — same
 * pattern as sitemap.xml).
 */
async function generateFeed(req, res) {
  let rows = [];
  try {
    const result = await query(
      `SELECT slug, category, published_at, updated_at, data
       FROM posts WHERE status = 'published'
       ORDER BY updated_at DESC LIMIT 30`
    );
    rows = result.rows;
  } catch (err) {
    console.error("[rss] query failed:", err.message);
  }

  const items = rows
    .map((row) => {
      const d = row.data || {};
      const link = `${SITE_URL}/blog/${row.slug}`;
      const pubDate = new Date(row.published_at || row.updated_at).toUTCString();
      return `  <item>
    <title>${esc(d.title || row.slug)}</title>
    <link>${link}</link>
    <guid isPermaLink="true">${link}</guid>
    <pubDate>${pubDate}</pubDate>
    ${row.category ? `<category>${esc(row.category)}</category>` : ""}
    <description>${esc(d.excerpt || "")}</description>
  </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Tripreviewall — Hawaii Travel Guide</title>
  <link>${SITE_URL}/blog</link>
  <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
  <description>Straight talk on Hawaii tours — what's actually worth booking, what to skip, and why.</description>
  <language>en-us</language>
${items}
</channel>
</rss>`;

  res.writeHead(200, {
    "Content-Type": "application/rss+xml; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  });
  res.end(xml);
}

module.exports = { generateFeed };
