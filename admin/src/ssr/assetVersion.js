const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/**
 * Cache-busting token for the site's own CSS/JS (e.g. css/style.css?v=3f9a1c2b).
 * Nginx tells browsers to keep CSS/JS for 30 days; this hash of every file in
 * /css and /js changes whenever any of them changes, so after a deploy +
 * `npm run regenerate-all` visitors fetch the new files immediately.
 */
const SITE_ROOT = path.join(__dirname, "..", "..", "..");

function computeAssetVersion() {
  const hash = crypto.createHash("md5");
  for (const dir of ["css", "js"]) {
    let files = [];
    try { files = fs.readdirSync(path.join(SITE_ROOT, dir)).filter((f) => /\.(css|js)$/.test(f)).sort(); } catch (e) { /* folder missing in tests */ }
    for (const f of files) {
      try { hash.update(f); hash.update(fs.readFileSync(path.join(SITE_ROOT, dir, f))); } catch (e) { /* skip unreadable */ }
    }
  }
  return hash.digest("hex").slice(0, 8);
}

const ASSET_V = computeAssetVersion();

module.exports = { ASSET_V };
