const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  // Loaded here too (not just server.js) so `npm run migrate` also picks up .env
  require("dotenv").config();
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (err) => {
  // Unexpected error on an idle client — log and keep the process alive;
  // individual queries will surface their own errors to the caller.
  console.error("[db] Unexpected PostgreSQL pool error:", err.message);
});

/**
 * Run a parameterized query. Always use $1, $2... placeholders —
 * never string-concatenate user input into `text`.
 */
async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
