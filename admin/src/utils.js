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
    out[key] = decodeURIComponent(val);
  });
  return out;
}

module.exports = { slugify, esc, linesToArray, readFormBody, parseCookies };
