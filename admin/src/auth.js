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
   Sessions — in-memory Map for this MVP core.
   NOTE: sessions are lost on server restart / do not work across
   multiple processes (e.g. a PM2 cluster). Fine for a single-process
   admin panel MVP; upgrade path is a `sessions` Postgres table with
   the exact same get/set/destroy interface below, swapped in later
   without touching any route code.
   ============================================================ */

const sessions = new Map(); // token -> { userId, email, role, name, expiresAt }

function createSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return s;
}

function destroySession(token) {
  sessions.delete(token);
}

// Periodically sweep expired sessions so the Map doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [token, s] of sessions.entries()) {
    if (now > s.expiresAt) sessions.delete(token);
  }
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
