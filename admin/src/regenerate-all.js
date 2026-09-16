require("dotenv").config();

const { pool, query } = require("./db");
const { generateTourFile, generatePostFile, regenerateListingPages, SITE_ROOT } = require("./ssr/generator");

async function main() {
  console.log(`Writing generated pages under: ${SITE_ROOT}`);
  if (SITE_ROOT.includes("site-not-configured")) {
    console.error("✗ SITE_ROOT is not set in .env — see .env.example. Aborting.");
    process.exit(1);
  }

  const toursResult = await query(`SELECT slug, status, island, price_from, data FROM tours WHERE status = 'published'`);
  console.log(`Generating ${toursResult.rows.length} tour pages...`);
  let tourFail = 0;
  for (const row of toursResult.rows) {
    try {
      await generateTourFile(row);
    } catch (err) {
      tourFail++;
      console.error(`  ✗ ${row.slug}:`, err.message);
    }
  }

  const postsResult = await query(`SELECT slug, status, category, island_tag, content_format, published_at, updated_at, data FROM posts WHERE status = 'published'`);
  console.log(`Generating ${postsResult.rows.length} blog post pages...`);
  let postFail = 0;
  for (const row of postsResult.rows) {
    try {
      await generatePostFile(row);
    } catch (err) {
      postFail++;
      console.error(`  ✗ ${row.slug}:`, err.message);
    }
  }

  console.log(`\nDone. Tours: ${toursResult.rows.length - tourFail} OK, ${tourFail} failed. Posts: ${postsResult.rows.length - postFail} OK, ${postFail} failed.`);

  console.log("Regenerating listing pages (tours.html, blog.html, destinations.html + 4 island pages)...");
  await regenerateListingPages();
  console.log("Done.");

  await pool.end();
}

main().catch((err) => { console.error("Regeneration failed:", err); process.exit(1); });
