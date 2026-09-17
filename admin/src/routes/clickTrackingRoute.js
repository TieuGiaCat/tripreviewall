const { query } = require("../db");

const PLATFORMS = new Set(["fareharbor", "tripadvisor", "getyourguide", "viator"]);

// Only ever redirect to a domain one of our affiliate partners actually
// owns — this endpoint takes a URL from a query string, so without this
// whitelist it would be an open redirect (a spammer could craft a link like
// tripreviewall.com/api/track-click?url=https://evil.com and use our
// trusted domain to mask a phishing link).
const ALLOWED_HOST_SUFFIXES = [
  ".fareharbor.com", "fareharbor.com",
  ".tripadvisor.com", "tripadvisor.com",
  ".getyourguide.com", "getyourguide.com",
  ".viator.com", "viator.com",
];

function isAllowedDestination(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:") return false;
    return ALLOWED_HOST_SUFFIXES.some((suffix) => u.hostname === suffix.replace(/^\./, "") || u.hostname.endsWith(suffix));
  } catch (err) {
    return false;
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

  try {
    await query(`INSERT INTO click_logs (tour_slug, platform) VALUES ($1, $2)`, [tourSlug, platform]);
  } catch (err) {
    console.error("[click-tracking] failed to log click (redirecting anyway):", err.message);
  }

  res.writeHead(302, { Location: destination });
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

  try {
    await query(`INSERT INTO click_logs (tour_slug, platform) VALUES ($1, $2)`, [tourSlug, platform]);
  } catch (err) {
    console.error("[click-tracking] failed to log click:", err.message);
  }

  res.writeHead(204);
  res.end();
}

module.exports = { trackClick, logClick };
