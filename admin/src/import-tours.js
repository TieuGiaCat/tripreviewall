require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { pool, query } = require("./db");

const IMPORT_FILE = path.join(__dirname, "..", "data", "tours-import.json");

async function main() {
  const raw = fs.readFileSync(IMPORT_FILE, "utf8");
  const tours = JSON.parse(raw);
  console.log(`Importing ${tours.length} tours from ${IMPORT_FILE}...`);

  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const t of tours) {
    const data = {
      name: t.name,
      company: t.company,
      city: t.city,
      tourType: t.tourType,
      durationLabel: t.durationLabel,
      fareharborShortname: t.fareharborShortname,
      highlights: t.highlights,
      fullDescription: t.fullDescription,
      verdict: t.verdict,
      googleSnapshot: t.googleSnapshot,
      variants: t.variants,
      aggregatedRating: t.aggregatedRating,
      reviewCountTotal: t.reviewCountTotal,
      ratingDistribution: t.ratingDistribution,
    };

    try {
      // Imported as 'published' — these are the same 265 tours already live on
      // the static site today; switching their source to the DB shouldn't make
      // any of them disappear. Review/unpublish individually in Admin as needed
      // (a few were flagged during the earlier data audit — e.g. MANA Cruises'
      // two near-duplicate Ko Olina listings, Mahina Hawaii's two adventures).
      const result = await query(
        `INSERT INTO tours (slug, status, island, price_from, published_at, data)
         VALUES ($1, 'published', $2, $3, now(), $4)
         ON CONFLICT (slug) DO UPDATE SET
           island = EXCLUDED.island,
           price_from = EXCLUDED.price_from,
           data = EXCLUDED.data,
           updated_at = now()
         RETURNING (xmax = 0) AS inserted`,
        [t.slug, t.island, t.priceFrom, JSON.stringify(data)]
      );
      if (result.rows[0].inserted) inserted++;
      else updated++;
    } catch (err) {
      failed++;
      console.error(`  ✗ Failed on "${t.slug}":`, err.message);
    }
  }

  console.log(`\nDone. ${inserted} inserted, ${updated} updated, ${failed} failed.`);
  await pool.end();
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
