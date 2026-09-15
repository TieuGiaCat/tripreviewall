const { query } = require("../db");
const { readFormBody, parseCookies } = require("../utils");
const { verifyPassword, createSession, destroySession, SESSION_COOKIE_NAME, SESSION_TTL_MS } = require("../auth");
const { loginPage } = require("../render");

async function handleLoginGet(req, res) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(loginPage());
}

async function handleLoginPost(req, res) {
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
    res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
    res.end(loginPage({ error: genericError }));
    return;
  }

  const token = createSession({
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
  if (token) destroySession(token);

  res.writeHead(302, {
    Location: "/admin/login",
    "Set-Cookie": `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0`,
  });
  res.end();
}

module.exports = { handleLoginGet, handleLoginPost, handleLogout };
