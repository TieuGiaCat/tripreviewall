/**
 * Site Info (phone, email, opening hours, operator name) — saved in the
 * `settings` table under key 'site_info', edited in Admin → Settings → Site Info.
 *
 * Templates are synchronous, so the generator calls `loadSiteInfo()` once
 * before writing pages; `currentSiteInfo()` then returns that value (or the
 * defaults from siteConfig.js if nothing is saved / the DB is unreachable).
 */
const { query } = require("../db");
const { DEFAULT_SITE_INFO } = require("../siteConfig");

let cached = { ...DEFAULT_SITE_INFO };
let loadedAt = 0;

function normalize(data) {
  const out = { ...DEFAULT_SITE_INFO };
  Object.keys(DEFAULT_SITE_INFO).forEach((k) => {
    if (data && typeof data[k] === "string" && data[k].trim()) out[k] = data[k].trim();
  });
  return out;
}

async function loadSiteInfo() {
  try {
    const result = await query("SELECT data FROM settings WHERE key = 'site_info' LIMIT 1");
    cached = normalize(result.rows[0] && result.rows[0].data);
    loadedAt = Date.now();
  } catch (err) {
    console.error("[site-info] could not load, using defaults:", err.message);
  }
  return cached;
}

async function saveSiteInfo(data) {
  const clean = normalize(data);
  await query(
    `INSERT INTO settings (key, data, updated_at) VALUES ('site_info', $1, now())
     ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [JSON.stringify(clean)]
  );
  cached = clean;
  return clean;
}

/** loadSiteInfo() at most every few seconds — called before each page write. */
async function ensureSiteInfo() {
  if (Date.now() - loadedAt > 5000) await loadSiteInfo();
  return cached;
}

function currentSiteInfo() {
  return cached;
}

/** "+1 (808) 226-1884" → "+18082261884" for tel: links. */
function telHref(phone) {
  return String(phone || "").replace(/[^\d+]/g, "");
}

module.exports = { loadSiteInfo, ensureSiteInfo, saveSiteInfo, currentSiteInfo, telHref };
