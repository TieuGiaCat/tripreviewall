const crypto = require("crypto");

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "trv_admin_session";
const SESSION_TTL_MS = (Number(process.env.SESSION_TTL_HOURS) || 12) * 60 * 60 * 1000;

/* ============================================================
   Password hashing — Node's built-in crypto.scrypt, so this
   module has zero extra native dependencies (no bcrypt build step).
   Format stored in DB: "scrypt:<saltHex>:<hashHex>"
   ============================================================ */

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(plain, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(plain, stored) {
  if (!stored || !stored.startsWith("scrypt:")) return false;
  const [, salt, hashHex] = stored.split(":");
  const candidate = crypto.scryptSync(plain, salt, 64);
  const expected = Buffer.from(hashHex, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

/* ============================================================
   Sessions — stored in the admin_sessions Postgres table so they
   survive `pm2 restart` (previously an in-memory Map, lost on every
   restart). Same function names/shapes as before — no caller outside
   this file needed to change beyond adding `await`.
   ============================================================ */

const { query } = require("./db");

async function createSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await query(
    `INSERT INTO admin_sessions (token, user_id, email, role, name, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [token, user.id, user.email, user.role, user.name, expiresAt]
  );
  return token;
}

async function getSession(token) {
  if (!token) return null;
  const result = await query(
    `SELECT user_id, email, role, name, expires_at FROM admin_sessions WHERE token = $1 LIMIT 1`,
    [token]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (Date.now() > new Date(row.expires_at).getTime()) {
    // Expired — clean it up lazily and report as logged out.
    query(`DELETE FROM admin_sessions WHERE token = $1`, [token]).catch(() => {});
    return null;
  }
  return {
    userId: row.user_id,
    email: row.email,
    role: row.role,
    name: row.name,
    expiresAt: new Date(row.expires_at).getTime(),
  };
}

async function destroySession(token) {
  if (!token) return;
  await query(`DELETE FROM admin_sessions WHERE token = $1`, [token]);
}

// Periodically sweep expired session rows so the table doesn't grow forever.
setInterval(() => {
  query(`DELETE FROM admin_sessions WHERE expires_at < now()`).catch((err) => {
    console.error("[auth] Failed to sweep expired sessions:", err.message);
  });
}, 15 * 60 * 1000).unref();

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  hashPassword,
  verifyPassword,
  createSession,
  getSession,
  destroySession,
};
