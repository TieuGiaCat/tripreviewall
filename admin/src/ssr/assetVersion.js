const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/**
 * Cache-busting token for the site's own CSS/JS (e.g. /css/style.css?v=3f9a1c2b).
 * Nginx lets browsers keep CSS/JS for 30 days; this hash of every file in
 * /css and /js changes whenever any of them changes.
 *
 * Computed when pages are generated (memoized for a few seconds so a full
 * regenerate of ~270 pages hashes the files once), not when the admin
 * process starts — so a CSS-only deploy followed by `npm run regenerate-all`
 * always picks up the new hash, even without restarting the admin.
 */
const SITE_ROOT = process.env.SITE_ROOT || path.join(__dirname, "..", "..", "..");
const ASSET_ROOTS = [SITE_ROOT, path.join(__dirname, "..", "..", "..")]; // live site root, then repo root (tests / local)
const MEMO_MS = 5000;

let memo = { value: null, at: 0 };

function computeAssetVersion() {
  const hash = crypto.createHash("md5");
  const root = ASSET_ROOTS.find((r) => fs.existsSync(path.join(r, "css"))) || ASSET_ROOTS[1];
  for (const dir of ["css", "js"]) {
    let files = [];
    try { files = fs.readdirSync(path.join(root, dir)).filter((f) => /\.(css|js)$/.test(f)).sort(); } catch (e) { /* folder missing in tests */ }
    for (const f of files) {
      try { hash.update(f); hash.update(fs.readFileSync(path.join(root, dir, f))); } catch (e) { /* skip unreadable */ }
    }
  }
  return hash.digest("hex").slice(0, 8);
}

function assetV() {
  const now = Date.now();
  if (!memo.value || now - memo.at > MEMO_MS) memo = { value: computeAssetVersion(), at: now };
  return memo.value;
}

module.exports = { assetV };
