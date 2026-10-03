const querystring = require("querystring");

/** Turn a title into a URL-safe slug. */
function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Escape a string for safe HTML output (prevents stored-XSS in admin pages). */
function esc(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Parse a textarea's newline-separated lines into a clean string array. */
function linesToArray(str) {
  return String(str || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Read and parse an application/x-www-form-urlencoded POST body. */
function readFormBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let size = 0;
    const MAX_BYTES = 2 * 1024 * 1024; // 2MB safety cap
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(querystring.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/**
 * Read and parse a JSON POST body. Used by public write endpoints (e.g.
 * POST /api/leads) that the frontend calls via fetch() with a JSON payload,
 * as opposed to the form-encoded POSTs used throughout Admin.
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let size = 0;
    const MAX_BYTES = 200 * 1024; // 200KB — generous for a contact form, small enough to block abuse
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/** Parse the Cookie header into a plain object. */
function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    try { out[key] = decodeURIComponent(val); } catch (e) { out[key] = val; } // malformed cookie must not 500 every page
  });
  return out;
}

/**
 * The visitor's real IP. Nginx (our only front door) sends it in X-Real-IP
 * and connects from loopback, so that header is only trusted when the TCP
 * connection itself comes from 127.0.0.1 / ::1. X-Forwarded-For is ignored:
 * its first value is whatever the client typed, which made the login lockout
 * and lead-form limits trivially bypassable.
 */
function getClientIp(req) {
  const socketIp = (req.socket && req.socket.remoteAddress) || "unknown";
  const fromLoopback = socketIp === "127.0.0.1" || socketIp === "::1" || socketIp === "::ffff:127.0.0.1";
  const realIp = req.headers["x-real-ip"];
  if (fromLoopback && realIp && /^[0-9a-fA-F:.]{3,45}$/.test(realIp.trim())) return realIp.trim();
  // Fallback when nginx doesn't set X-Real-IP: with $proxy_add_x_forwarded_for
  // nginx APPENDS the real address, so the LAST entry is the trustworthy one.
  const fwd = req.headers["x-forwarded-for"];
  if (fromLoopback && fwd) {
    const last = fwd.split(",").pop().trim();
    if (/^[0-9a-fA-F:.]{3,45}$/.test(last)) return last;
  }
  return socketIp;
}

/** Keeps a URL only if it's http(s) — blocks javascript:, data: and other schemes in link fields. */
function httpUrlOrEmpty(value) {
  const v = String(value || "").trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(v) ? v : "";
}

module.exports = { slugify, esc, linesToArray, readFormBody, readJsonBody, parseCookies, getClientIp, httpUrlOrEmpty };
