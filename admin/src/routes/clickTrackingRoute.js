const { query } = require("../db");

const PLATFORMS = new Set(["fareharbor", "tripadvisor", "getyourguide", "viator"]);

// Only ever redirect to a domain one of our affiliate partners actually
// owns — this endpoint takes a URL from a query string, so without this
// whitelist it would be an open redirect (a spammer could craft a link like
// tripreviewall.com/api/track-click?url=https://evil.com and use our
// trusted domain to mask a phishing link).
// Exact registrable domains. A host is allowed only if it IS one of these or
// a real subdomain of one ("www.viator.com"). The old check used a bare
// endsWith("viator.com"), which also let "evilviator.com" through.
const ALLOWED_DOMAINS = ["fareharbor.com", "tripadvisor.com", "getyourguide.com", "viator.com"];

function isAllowedDestination(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:") return false;
    if (u.username || u.password) return false; // no "https://viator.com@evil.com" tricks
    const host = u.hostname.toLowerCase().replace(/\.$/, "");
    return ALLOWED_DOMAINS.some((d) => host === d || host.endsWith("." + d));
  } catch (err) {
    return false;
  }
}

/* ---- Keeping click analytics honest (A9) ----
   A click is only recorded when: the tour slug is a real published tour, the
   visitor isn't a known bot, and the same IP hasn't already logged more than
   CLICK_LIMIT clicks in the last minute. The visitor is ALWAYS redirected —
   these checks only decide whether the click is counted. */
const { getClientIp } = require("../utils");

const CLICK_LIMIT = 20;
const CLICK_WINDOW_MS = 60 * 1000;
const clickHits = new Map(); // ip -> [timestamps]
setInterval(() => {
  const now = Date.now();
  for (const [ip, hits] of clickHits) {
    const fresh = hits.filter((t) => now - t < CLICK_WINDOW_MS);
    if (fresh.length) clickHits.set(ip, fresh); else clickHits.delete(ip);
  }
}, 5 * 60 * 1000).unref();

let slugCache = { set: null, at: 0 };
async function isPublishedSlug(slug) {
  if (!slug) return false;
  if (!slugCache.set || Date.now() - slugCache.at > 5 * 60 * 1000) {
    try {
      const r = await query(`SELECT slug FROM tours WHERE status = 'published'`);
      slugCache = { set: new Set(r.rows.map((x) => x.slug)), at: Date.now() };
    } catch (err) {
      console.error("[click-tracking] could not load slugs:", err.message);
      return true; // DB hiccup: don't drop real clicks
    }
  }
  return slugCache.set.has(slug);
}

const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|python-requests|curl|wget|httpclient|monitor/i;

async function shouldCount(req, tourSlug) {
  if (BOT_UA.test(req.headers["user-agent"] || "")) return false;
  const ip = getClientIp(req);
  const now = Date.now();
  const hits = (clickHits.get(ip) || []).filter((t) => now - t < CLICK_WINDOW_MS);
  if (hits.length >= CLICK_LIMIT) return false;
  hits.push(now);
  clickHits.set(ip, hits);
  return isPublishedSlug(tourSlug);
}

async function recordClick(req, tourSlug, platform) {
  try {
    if (await shouldCount(req, tourSlug)) {
      await query(`INSERT INTO click_logs (tour_slug, platform) VALUES ($1, $2)`, [tourSlug, platform]);
    }
  } catch (err) {
    console.error("[click-tracking] failed to log click:", err.message);
  }
}

/**
 * GET /api/track-click?tour=<slug>&platform=<fareharbor|tripadvisor|getyourguide|viator>&url=<encoded destination>
 * Public, unauthenticated. Logs the click (best-effort — never blocks the
 * redirect if logging fails) then 302s the visitor on to the real booking
 * link. Every "Check Availability" button on a Tour Detail page points here
 * instead of the affiliate URL directly.
 */
async function trackClick(req, res, urlObj) {
  const tourSlug = (urlObj.searchParams.get("tour") || "").slice(0, 200) || null;
  const platform = urlObj.searchParams.get("platform") || "";
  const destination = urlObj.searchParams.get("url") || "";

  if (!PLATFORMS.has(platform) || !isAllowedDestination(destination)) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Invalid tracking link.");
    return;
  }

  await recordClick(req, tourSlug, platform);

  res.writeHead(302, { Location: destination, "X-Robots-Tag": "noindex", "Cache-Control": "no-store" });
  res.end();
}

/**
 * POST /api/log-click?tour=<slug>&platform=fareharbor
 * Public, unauthenticated, fire-and-forget (called via navigator.sendBeacon
 * from the client). Logs the click WITHOUT redirecting — used only for the
 * FareHarbor "Check Availability" button, whose href must point directly at
 * fareharbor.com (not through our redirect) so FareHarbor's own lightframe
 * script recognizes and intercepts the click to show the booking iframe.
 */
async function logClick(req, res, urlObj) {
  const tourSlug = (urlObj.searchParams.get("tour") || "").slice(0, 200) || null;
  const platform = urlObj.searchParams.get("platform") || "";

  if (!PLATFORMS.has(platform)) {
    res.writeHead(204);
    res.end();
    return;
  }

  await recordClick(req, tourSlug, platform);

  res.writeHead(204);
  res.end();
}

module.exports = { trackClick, logClick };
