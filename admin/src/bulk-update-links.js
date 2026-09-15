require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { pool, query } = require("./db");
const { parseCsv } = require("./lib/csv");

const DEFAULT_FILE = path.join(__dirname, "..", "data", "booking-links-template.csv");

function truthy(v) {
  return String(v || "").trim().toUpperCase() === "TRUE";
}

async function main() {
  const filePath = process.argv[2] || DEFAULT_FILE;
  if (!fs.existsSync(filePath)) {
    console.error(`✗ File not found: ${filePath}`);
    console.error(`  Usage: npm run bulk-update-links -- path/to/your-file.csv`);
    process.exit(1);
  }

  const rows = parseCsv(fs.readFileSync(filePath, "utf8"));
  console.log(`Read ${rows.length} rows from ${filePath}\n`);

  let updated = 0, skippedEmpty = 0, notFound = 0, failed = 0;

  for (const row of rows) {
    const slug = row.slug;
    if (!slug) { skippedEmpty++; continue; }

    const hasAnyContent =
      row.fareharborShortname || row.tripadvisorUrl || row.getyourguideUrl || row.viatorUrl ||
      truthy(row.showFareharbor) || truthy(row.showTripadvisor) || truthy(row.showGetyourguide) || truthy(row.showViator);
    if (!hasAnyContent) { skippedEmpty++; continue; }

    try {
      const existingResult = await query("SELECT data FROM tours WHERE slug = $1", [slug]);
      const existing = existingResult.rows[0];
      if (!existing) { notFound++; console.warn(`  ✗ No tour found for slug "${slug}" — skipped.`); continue; }

      const data = existing.data || {};
      if (row.fareharborShortname) data.fareharborShortname = row.fareharborShortname.trim();
      data.bookingLinks = {
        fareharbor: { show: row.showFareharbor !== "" ? truthy(row.showFareharbor) : (data.bookingLinks && data.bookingLinks.fareharbor ? data.bookingLinks.fareharbor.show : true) },
        tripadvisor: { url: row.tripadvisorUrl || (data.bookingLinks && data.bookingLinks.tripadvisor && data.bookingLinks.tripadvisor.url) || "", show: truthy(row.showTripadvisor) },
        getyourguide: { url: row.getyourguideUrl || (data.bookingLinks && data.bookingLinks.getyourguide && data.bookingLinks.getyourguide.url) || "", show: truthy(row.showGetyourguide) },
        viator: { url: row.viatorUrl || (data.bookingLinks && data.bookingLinks.viator && data.bookingLinks.viator.url) || "", show: truthy(row.showViator) },
      };

      await query("UPDATE tours SET data = $1, updated_at = now() WHERE slug = $2", [JSON.stringify(data), slug]);
      updated++;
    } catch (err) {
      failed++;
      console.error(`  ✗ Failed on "${slug}":`, err.message);
    }
  }

  console.log(`\nDone. ${updated} updated, ${skippedEmpty} skipped (no data in row), ${notFound} not found, ${failed} failed.`);
  await pool.end();
}

main().catch((err) => { console.error("Bulk update failed:", err); process.exit(1); });
