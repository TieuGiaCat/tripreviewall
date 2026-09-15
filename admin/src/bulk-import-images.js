require("dotenv").config();

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pool, query } = require("./db");
const { findBestMatch } = require("./lib/matchTitle");

const UPLOAD_DIR = path.join(__dirname, "..", "public", "uploads", "tours");
const LOG_FILE = path.join(__dirname, "..", "data", "image-import-log.json");
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const AUTO_THRESHOLD = 0.65;   // auto-copy + assign at or above this score
const REVIEW_THRESHOLD = 0.4;  // between this and AUTO_THRESHOLD -> flagged for manual review, not auto-assigned

function walkImages(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkImages(full));
    else if (ALLOWED_EXT.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

function loadLog() {
  try { return JSON.parse(fs.readFileSync(LOG_FILE, "utf8")); } catch { return { imported: {} }; }
}
function saveLog(log) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

async function main() {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(dir)) {
    console.error("✗ Usage: npm run bulk-import-images -- /path/to/image-folder");
    process.exit(1);
  }

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const log = loadLog();

  console.log("Loading tours from database...");
  const toursResult = await query("SELECT id, slug, data FROM tours");
  const tours = toursResult.rows.map((r) => ({ id: r.id, slug: r.slug, name: (r.data && r.data.name) || r.slug, data: r.data || {} }));
  console.log(`Loaded ${tours.length} tours.\n`);

  const files = walkImages(dir);
  console.log(`Found ${files.length} image files in ${dir}\n`);

  const reviewRows = [["filename", "bestMatchSlug", "bestMatchTitle", "score"]];
  let autoMatched = 0, alreadyDone = 0, needsReview = 0, noMatch = 0, copyFailed = 0;

  for (const filePath of files) {
    const filename = path.basename(filePath);

    if (log.imported[filePath]) { alreadyDone++; continue; }

    const { tour, score } = findBestMatch(filename, tours);

    if (!tour || score < REVIEW_THRESHOLD) {
      noMatch++;
      continue;
    }

    if (score < AUTO_THRESHOLD) {
      needsReview++;
      reviewRows.push([filename, tour.slug, tour.name, score.toFixed(2)]);
      continue;
    }

    // Auto-match: copy the file and append to that tour's gallery.
    const ext = path.extname(filename).toLowerCase();
    const safeSlug = tour.slug.replace(/[^a-z0-9-]/gi, "").slice(0, 60);
    const targetName = `${safeSlug}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}${ext}`;
    const targetPath = path.join(UPLOAD_DIR, targetName);

    try {
      fs.copyFileSync(filePath, targetPath);
    } catch (err) {
      copyFailed++;
      console.error(`  ✗ Could not copy "${filename}":`, err.message);
      continue;
    }

    const publicUrl = `/uploads/tours/${targetName}`;
    tour.data.gallery = [...(tour.data.gallery || []), publicUrl];

    try {
      await query("UPDATE tours SET data = $1, updated_at = now() WHERE id = $2", [JSON.stringify(tour.data), tour.id]);
      autoMatched++;
      log.imported[filePath] = { slug: tour.slug, url: publicUrl, score: Number(score.toFixed(2)), at: new Date().toISOString() };
    } catch (err) {
      copyFailed++;
      console.error(`  ✗ Matched "${filename}" to "${tour.slug}" but DB update failed:`, err.message);
    }
  }

  saveLog(log);

  if (reviewRows.length > 1) {
    const reviewPath = path.join(__dirname, "..", "data", "image-import-needs-review.csv");
    fs.writeFileSync(reviewPath, reviewRows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"));
    console.log(`\nWrote ${reviewRows.length - 1} borderline matches to ${reviewPath} for manual review.`);
  }

  console.log(`\n============================`);
  console.log(`${autoMatched} auto-matched & imported`);
  console.log(`${alreadyDone} already imported in a previous run (skipped)`);
  console.log(`${needsReview} borderline matches — see review CSV above`);
  console.log(`${noMatch} files with no reasonable match at all`);
  console.log(`${copyFailed} failed to copy/save`);
  console.log(`============================`);
  console.log(`\nSafe to re-run this script after fixing filenames or the review CSV — already-imported files are skipped automatically.`);

  await pool.end();
}

main().catch((err) => { console.error("Bulk image import failed:", err); process.exit(1); });
