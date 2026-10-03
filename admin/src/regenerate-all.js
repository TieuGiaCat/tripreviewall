require("dotenv").config();

const { pool } = require("./db");
const { regenerateAllPages, SITE_ROOT } = require("./ssr/generator");

async function main() {
  console.log(`Writing generated pages under: ${SITE_ROOT}`);
  if (SITE_ROOT.includes("site-not-configured")) {
    console.error("✗ SITE_ROOT is not set in .env — see .env.example. Aborting.");
    process.exit(1);
  }

  const result = await regenerateAllPages();
  const tourFails = result.errors.filter((e) => e.startsWith("Tour page")).length;
  const postFails = result.errors.filter((e) => e.startsWith("Article page")).length;
  console.log(`\nTours: ${result.tours - tourFails} OK, ${tourFails} failed. Posts: ${result.posts - postFails} OK, ${postFails} failed.`);
  console.log("Listing pages (home, /tours + pages, /blog, /destinations, islands) and hand-written pages (about, contact, privacy…) rebuilt.");
  if (result.errors.length) {
    console.error(`\n✗ ${result.errors.length} problem(s):`);
    result.errors.forEach((e) => console.error("  - " + e));
    process.exitCode = 1;
  } else {
    console.log("Done — no errors.");
  }
  await pool.end();
}

main().catch((err) => { console.error("Regeneration failed:", err); process.exit(1); });
