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

// Hash of a random password, used so a login for an email that doesn't exist
// takes the same time as one with a wrong password (no user enumeration by timing).
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString("hex"));

function verifyPassword(plain, stored) {
  if (!stored || !stored.startsWith("scrypt:")) {
    stored = DUMMY_HASH;
    const [, salt, hashHex] = stored.split(":");
    crypto.timingSafeEqual(crypto.scryptSync(String(plain || ""), salt, 64), Buffer.from(hashHex, "hex"));
    return false;
  }
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

/* Only a SHA-256 hash of each session token is stored (A12): a leaked DB
   dump or backup can't be used to log in as anyone. The raw token lives only
   in the visitor's cookie. (Sessions created before this change no longer
   match, so everyone is asked to sign in once after the update.) */
function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

async function createSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await query(
    `INSERT INTO admin_sessions (token, user_id, email, role, name, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [hashToken(token), user.id, user.email, user.role, user.name, expiresAt]
  );
  return token;
}

/**
 * Looks the session up together with the user's CURRENT account row, so
 * disabling a user, changing their role or deleting them takes effect on
 * their very next request (previously the role copied at login stayed valid
 * until the session expired, up to 12 h later).
 */
async function getSession(token) {
  if (!token) return null;
  const result = await query(
    `SELECT s.user_id, s.expires_at, u.email, u.role, u.status, u.data->>'name' AS name
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.user_id
      WHERE s.token = $1
      LIMIT 1`,
    [hashToken(token)]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (Date.now() > new Date(row.expires_at).getTime() || row.status !== "active") {
    // Expired or account disabled — clean it up and report as logged out.
    query(`DELETE FROM admin_sessions WHERE token = $1`, [hashToken(token)]).catch(() => {});
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

/** Signs a user out everywhere (used after disable / role change / password change). */
async function destroyUserSessions(userId, exceptToken) {
  if (!userId) return;
  if (exceptToken) {
    await query(`DELETE FROM admin_sessions WHERE user_id = $1 AND token <> $2`, [userId, hashToken(exceptToken)]);
  } else {
    await query(`DELETE FROM admin_sessions WHERE user_id = $1`, [userId]);
  }
}

async function destroySession(token) {
  if (!token) return;
  await query(`DELETE FROM admin_sessions WHERE token = $1`, [hashToken(token)]);
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
  destroyUserSessions,
};
