require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { pool, query } = require("./db");
const { parseCsv } = require("./lib/csv");
const { generateTourFile, regenerateListingPages } = require("./ssr/generator");

async function main() {
  const filePath = process.argv[2];
  if (!filePath || !fs.existsSync(filePath)) {
    console.error("✗ Usage: npm run bulk-import-locations -- /path/to/fareharbor-tours.csv");
    process.exit(1);
  }

  const rows = parseCsv(fs.readFileSync(filePath, "utf8"));
  console.log(`Read ${rows.length} rows from ${filePath}`);

  // FareHarbor's own export has these two columns swapped — every row's
  // "location_lat" value is actually the longitude (~-155 to -160 for
  // Hawaii) and "location_long" is actually the latitude (~19 to 22).
  // Confirmed against real coordinates for multiple islands before writing
  // this script. Build item_id -> corrected {lat, lng} here, once.
  const locationByItemId = {};
  let badRows = 0;
  for (const row of rows) {
    const itemId = (row.item_id || "").trim();
    const lat = Number(row.location_long);
    const lng = Number(row.location_lat);
    if (!itemId || isNaN(lat) || isNaN(lng)) { badRows++; continue; }
    locationByItemId[itemId] = { lat, lng };
  }
  console.log(`Parsed ${Object.keys(locationByItemId).length} usable item_id → location rows (${badRows} rows skipped — missing id or coordinates).\n`);

  const toursResult = await query(`SELECT slug, status, island, price_from, data FROM tours`);
  console.log(`Checking ${toursResult.rows.length} tours in the database...\n`);

  let matched = 0, alreadySet = 0, noMatch = 0, regenerated = 0;

  for (const tourRow of toursResult.rows) {
    const variants = (tourRow.data && tourRow.data.variants) || [];
    let location = null;
    for (const v of variants) {
      const itemId = String(v.fareharborItemId || "").trim();
      if (itemId && locationByItemId[itemId]) {
        location = locationByItemId[itemId];
        break; // first matching variant wins — all variants of one tour share a meeting point
      }
    }
    if (!location) {
      noMatch++;
      continue;
    }

    const data = { ...tourRow.data, location };
    try {
      await query("UPDATE tours SET data = $1, updated_at = now() WHERE slug = $2", [JSON.stringify(data), tourRow.slug]);
      matched++;
      if (tourRow.status === "published") {
        await generateTourFile({ slug: tourRow.slug, status: tourRow.status, island: tourRow.island, price_from: tourRow.price_from, data });
        regenerated++;
      }
    } catch (err) {
      console.error(`  ✗ ${tourRow.slug}: failed to save — ${err.message}`);
    }
  }

  if (regenerated > 0) {
    console.log("\nRegenerating listing pages...");
    await regenerateListingPages();
  }

  console.log(`\n============================`);
  console.log(`${matched} tours matched and updated with real coordinates`);
  console.log(`${noMatch} tours had no matching item_id in the CSV (no location set)`);
  console.log(`${regenerated} published tour pages regenerated`);
  console.log(`============================`);

  await pool.end();
}

main().catch((err) => { console.error("Bulk location import failed:", err); process.exit(1); });
