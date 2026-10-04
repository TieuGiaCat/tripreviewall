require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { pool, query } = require("./db");
const { hashPassword } = require("./auth");
const { ISLANDS } = require("./ssr/islands");

async function runSchema() {
  const sql = fs.readFileSync(path.join(__dirname, "..", "sql", "schema.sql"), "utf8");
  await query(sql);
  console.log("✓ Schema applied (tables created if they didn't already exist).");
}

/**
 * Versioned migrations (B7): admin/sql/migrations/NNN_name.sql, applied once
 * each, in order, inside a transaction, and recorded in schema_migrations.
 */
async function runMigrations() {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const dir = path.join(__dirname, "..", "sql", "migrations");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort(); } catch (e) { return; }
  const done = new Set((await query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`✓ Migration applied: ${file}`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw new Error(`migration ${file} failed (nothing from it was applied): ${err.message}`);
    } finally {
      client.release();
    }
  }
}

async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "";
  const name = process.env.SEED_ADMIN_NAME || "Admin";

  if (!email || !password) {
    console.error("✗ SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in .env to seed an admin.");
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error("✗ SEED_ADMIN_PASSWORD is too short — use at least 8 characters.");
    process.exitCode = 1;
    return;
  }

  const existing = await query("SELECT id FROM admin_users WHERE email = $1", [email]);
  if (existing.rows.length > 0) {
    console.log(`✓ Admin user ${email} already exists — skipping seed.`);
    return;
  }

  const passwordHash = hashPassword(password);
  await query(
    `INSERT INTO admin_users (email, password_hash, role, status, data)
     VALUES ($1, $2, 'admin', 'active', $3)`,
    [email, passwordHash, JSON.stringify({ name })]
  );
  console.log(`✓ Seeded first admin user: ${email}`);
  console.log("  IMPORTANT: change SEED_ADMIN_PASSWORD in .env now (or log in and note it's stored, this script never reads plaintext passwords back).");
}

/**
 * Destinations are a fixed set of 4 rows (one per island) — never
 * created/deleted from Admin, only edited. Seed them once here, using
 * admin/src/ssr/islands.js's default intro text as the starting content.
 * Idempotent: skips any island slug that already has a row.
 */
async function seedDestinations() {
  for (const isl of ISLANDS) {
    const existing = await query("SELECT id FROM destinations WHERE slug = $1", [isl.slug]);
    if (existing.rows.length > 0) continue;
    await query(
      `INSERT INTO destinations (slug, status, data) VALUES ($1, 'published', $2)`,
      [isl.slug, JSON.stringify({ islandName: isl.name, heroImage: null, introText: isl.intro, seo: {} })]
    );
    console.log(`✓ Seeded destination: ${isl.name}`);
  }
}

/**
 * Categories are edited in Admin → Categories. The original 5 are seeded only
 * into an EMPTY table (a brand-new database). Before, every `npm run migrate`
 * re-added any default category the admin had deleted.
 */
async function seedCategories() {
  const DEFAULT_CATEGORIES = ["Island Guides", "Tour Reviews by Type", "Planning & Comparisons", "Booking & Practical Info", "Real Traveler Reviews & Data"];
  const count = await query("SELECT count(*)::int AS n FROM categories");
  if (count.rows[0].n > 0) return;
  for (const name of DEFAULT_CATEGORIES) {
    await query(`INSERT INTO categories (name, status) VALUES ($1, 'active')`, [name]);
    console.log(`✓ Seeded category: ${name}`);
  }
}

async function main() {
  const shouldSeed = process.argv.includes("--seed-admin");
  try {
    await runSchema();
    await runMigrations();
    await seedDestinations();
    await seedCategories();
    if (shouldSeed) await seedAdmin();
  } catch (err) {
    console.error("✗ Migration failed:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
