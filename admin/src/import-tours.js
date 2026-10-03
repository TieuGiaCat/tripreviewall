require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { pool, query } = require("./db");

const IMPORT_FILE = path.join(__dirname, "..", "data", "tours-import.json");

/*
 * SAFE BY DEFAULT. The live database is now the source of truth (gallery,
 * location, booking links, ratings, meta, packages… are edited in Admin), so:
 *   npm run import-tours                      → only ADDS tours whose slug isn't in the DB yet.
 *                                               Existing tours are never touched.
 *   npm run import-tours -- --fill-missing    → also fills in fields an existing tour
 *                                               doesn't have yet; anything already set
 *                                               in Admin always wins.
 * (Previously a re-run replaced each tour's whole data column and wiped every
 * Admin edit for all 265 tours.)
 */
const FILL_MISSING = process.argv.includes("--fill-missing");

async function main() {
  const raw = fs.readFileSync(IMPORT_FILE, "utf8");
  const tours = JSON.parse(raw);
  console.log(`Importing ${tours.length} tours from ${IMPORT_FILE}...`);

  let inserted = 0;
  let updated = 0;
  let failed = 0;
  let skipped = 0;
  console.log(FILL_MISSING ? "Mode: --fill-missing (existing Admin data always wins)" : "Mode: add new tours only (existing tours are skipped)");

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
         ON CONFLICT (slug) DO ${FILL_MISSING ? `UPDATE SET
           island = COALESCE(tours.island, EXCLUDED.island),
           price_from = COALESCE(tours.price_from, EXCLUDED.price_from),
           -- jsonb "||": keys on the right win, so existing Admin data overrides the file
           data = EXCLUDED.data || tours.data,
           updated_at = now()` : "NOTHING"}
         RETURNING (xmax = 0) AS inserted`,
        [t.slug, t.island, t.priceFrom, JSON.stringify(data)]
      );
      if (!result.rows[0]) skipped++; // already in DB, left untouched
      else if (result.rows[0].inserted) inserted++;
      else updated++;
    } catch (err) {
      failed++;
      console.error(`  ✗ Failed on "${t.slug}":`, err.message);
    }
  }

  console.log(`\nDone. ${inserted} inserted, ${updated} filled in, ${skipped} skipped (already in DB), ${failed} failed.`);
  await pool.end();
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
