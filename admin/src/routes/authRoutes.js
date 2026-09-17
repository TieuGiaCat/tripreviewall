const { query } = require("../db");
const { readFormBody, parseCookies } = require("../utils");
const { verifyPassword, createSession, destroySession, SESSION_COOKIE_NAME, SESSION_TTL_MS } = require("../auth");
const { loginPage } = require("../render");

/* ============================================================
   Brute-force protection: locks out an IP after too many failed
   login attempts. In-memory (per-process) — same pattern as the
   public lead-form rate limiter in publicLeadRoutes.js.
   ============================================================ */
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const loginAttempts = new Map(); // ip -> { failures: [timestamps], lockedUntil: number }

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return fwd.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

function loginLockRemainingMs(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry || !entry.lockedUntil) return 0;
  return Math.max(0, entry.lockedUntil - Date.now());
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { failures: [], lockedUntil: 0 };
  entry.failures = entry.failures.filter((t) => now - t < LOGIN_WINDOW_MS);
  entry.failures.push(now);
  if (entry.failures.length >= LOGIN_MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOGIN_LOCKOUT_MS;
  }
  loginAttempts.set(ip, entry);
}

function clearLoginAttempts(ip) {
  loginAttempts.delete(ip);
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts.entries()) {
    const stillLocked = entry.lockedUntil && now < entry.lockedUntil;
    const freshFailures = entry.failures.filter((t) => now - t < LOGIN_WINDOW_MS);
    if (!stillLocked && freshFailures.length === 0) loginAttempts.delete(ip);
    else loginAttempts.set(ip, { failures: freshFailures, lockedUntil: entry.lockedUntil });
  }
}, 15 * 60 * 1000).unref();

async function handleLoginGet(req, res) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(loginPage());
}

async function handleLoginPost(req, res) {
  const ip = getClientIp(req);
  const lockedForMs = loginLockRemainingMs(ip);
  if (lockedForMs > 0) {
    const minutes = Math.ceil(lockedForMs / 60000);
    res.writeHead(429, { "Content-Type": "text/html; charset=utf-8" });
    res.end(loginPage({ error: `Too many failed login attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` }));
    return;
  }

  let body;
  try {
    body = await readFormBody(req);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(loginPage({ error: "Malformed request." }));
    return;
  }

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";

  if (!email || !password) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(loginPage({ error: "Email and password are required." }));
    return;
  }

  let result;
  try {
    result = await query(
      "SELECT id, email, password_hash, role, status, data FROM admin_users WHERE email = $1 LIMIT 1",
      [email]
    );
  } catch (err) {
    console.error("[auth] DB error on login:", err.message);
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(loginPage({ error: "Something went wrong. Please try again." }));
    return;
  }

  const row = result.rows[0];

  // Deliberately generic error message for both "no such user" and "wrong
  // password" — never reveal which one it was (prevents user enumeration).
  const genericError = "Invalid email or password.";

  if (!row || row.status !== "active" || !verifyPassword(password, row.password_hash)) {
    recordFailedLogin(ip);
    res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
    res.end(loginPage({ error: genericError }));
    return;
  }

  clearLoginAttempts(ip);

  const token = await createSession({
    id: row.id,
    email: row.email,
    role: row.role,
    name: (row.data && row.data.name) || row.email,
  });

  const cookie = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");

  res.writeHead(302, {
    Location: "/admin/dashboard",
    "Set-Cookie": cookie,
  });
  res.end();
}

async function handleLogout(req, res) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  if (token) await destroySession(token);

  res.writeHead(302, {
    Location: "/admin/login",
    "Set-Cookie": `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0`,
  });
  res.end();
}

module.exports = { handleLoginGet, handleLoginPost, handleLogout };
