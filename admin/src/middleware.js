const { parseCookies } = require("./utils");
const { SESSION_COOKIE_NAME, getSession } = require("./auth");

/**
 * Reads the session cookie and returns the session object, or null.
 * Does not redirect — callers decide what to do with a missing session
 * (route handlers use requireAuth() below for the common case).
 */
function getCurrentUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  return getSession(token);
}

/**
 * Guard for routes that require a logged-in user.
 * Returns the session if present; otherwise redirects to /admin/login
 * and returns null — callers must `return` immediately when this
 * returns null so the response isn't written twice.
 */
function requireAuth(req, res) {
  const session = getCurrentUser(req);
  if (!session) {
    res.writeHead(302, { Location: "/admin/login" });
    res.end();
    return null;
  }
  return session;
}

module.exports = { getCurrentUser, requireAuth };
