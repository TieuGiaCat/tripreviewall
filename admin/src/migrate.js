require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { pool, query } = require("./db");
const { hashPassword } = require("./auth");

async function runSchema() {
  const sql = fs.readFileSync(path.join(__dirname, "..", "sql", "schema.sql"), "utf8");
  await query(sql);
  console.log("✓ Schema applied (tables created if they didn't already exist).");
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

async function main() {
  const shouldSeed = process.argv.includes("--seed-admin");
  try {
    await runSchema();
    if (shouldSeed) await seedAdmin();
  } catch (err) {
    console.error("✗ Migration failed:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
