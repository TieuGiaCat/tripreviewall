require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { pool, query } = require("./db");

const DEFAULT_OUT = path.join(__dirname, "..", "data", "tours-export.csv");

const COLUMNS = [
  "slug", "title", "status", "island", "city", "tourType", "company",
  "priceFrom", "fareharborShortname", "galleryCount",
  "aggregatedRating", "reviewCountTotal", "publishedAt", "updatedAt",
];

function csvCell(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toRow(r) {
  const d = r.data || {};
  return {
    slug: r.slug,
    title: d.name || r.slug,
    status: r.status,
    island: r.island || "",
    city: d.city || "",
    tourType: d.tourType || "",
    company: d.company || "",
    priceFrom: r.price_from != null ? r.price_from : "",
    fareharborShortname: d.fareharborShortname || "",
    galleryCount: (d.gallery || []).length,
    aggregatedRating: d.aggregatedRating != null ? d.aggregatedRating : "",
    reviewCountTotal: d.reviewCountTotal != null ? d.reviewCountTotal : "",
    publishedAt: r.published_at ? new Date(r.published_at).toISOString() : "",
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : "",
  };
}

async function main() {
  // Pass "published" as the first arg to export only live tours; default is all tours.
  const filter = process.argv[2] === "published" ? "WHERE status = 'published'" : "";
  const outPath = process.argv[3] || DEFAULT_OUT;

  const result = await query(
    `SELECT slug, status, island, price_from, published_at, updated_at, data FROM tours ${filter} ORDER BY updated_at DESC`
  );

  const lines = [COLUMNS.join(",")];
  for (const row of result.rows) {
    const rowObj = toRow(row);
    lines.push(COLUMNS.map((c) => csvCell(rowObj[c])).join(","));
  }

  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`✓ Wrote ${result.rows.length} tours to ${outPath}`);

  await pool.end();
}

main().catch((err) => { console.error("Export failed:", err); process.exit(1); });
