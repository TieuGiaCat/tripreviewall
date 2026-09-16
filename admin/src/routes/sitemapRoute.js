const { query } = require("../db");

const SITE_URL = "https://tripreviewall.com";

// Static pages that always exist, independent of DB content.
const STATIC_PAGES = [
  { path: "/index.html", priority: "1.0" },
  { path: "/tours.html", priority: "0.9" },
  { path: "/blog.html", priority: "0.9" },
  { path: "/destinations.html", priority: "0.8" },
  { path: "/destinations/island.html?slug=oahu", priority: "0.7" },
  { path: "/destinations/island.html?slug=maui", priority: "0.7" },
  { path: "/destinations/island.html?slug=kauai", priority: "0.7" },
  { path: "/destinations/island.html?slug=big-island", priority: "0.7" },
  { path: "/transportation.html", priority: "0.6" },
  { path: "/about.html", priority: "0.4" },
  { path: "/contact.html", priority: "0.4" },
  { path: "/affiliate-disclosure.html", priority: "0.3" },
  { path: "/privacy-policy.html", priority: "0.3" },
];

function urlEntry(loc, lastmod, priority) {
  return `  <url>
    <loc>${loc}</loc>
    ${lastmod ? `<lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : ""}
    <priority>${priority}</priority>
  </url>`;
}

async function generateSitemap(req, res) {
  let tourRows = [];
  let postRows = [];
  try {
    const toursResult = await query(`SELECT slug, updated_at FROM tours WHERE status = 'published'`);
    tourRows = toursResult.rows;
    const postsResult = await query(`SELECT slug, updated_at FROM posts WHERE status = 'published'`);
    postRows = postsResult.rows;
  } catch (err) {
    console.error("[sitemap] query failed:", err.message);
    // Fall through and still emit the static pages — a partial sitemap
    // beats a 500 error for a crawler.
  }

  const entries = [
    ...STATIC_PAGES.map((p) => urlEntry(`${SITE_URL}${p.path}`, null, p.priority)),
    ...tourRows.map((t) => urlEntry(`${SITE_URL}/tours/${t.slug}.html`, t.updated_at, "0.8")),
    ...postRows.map((p) => urlEntry(`${SITE_URL}/blog/${p.slug}.html`, p.updated_at, "0.6")),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</urlset>`;

  res.writeHead(200, {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  });
  res.end(xml);
}

module.exports = { generateSitemap };
