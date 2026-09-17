const { query } = require("../db");
const { esc } = require("../utils");
const { layout } = require("../render");

async function showAnalytics(req, res, user) {
  let totalAllTime = 0, total7d = 0, total30d = 0;
  let byPlatform = [];
  let topTours = [];
  let dbError = null;

  try {
    const totalResult = await query(`SELECT count(*)::int AS n FROM click_logs`);
    totalAllTime = totalResult.rows[0].n;

    const total7dResult = await query(`SELECT count(*)::int AS n FROM click_logs WHERE clicked_at >= now() - interval '7 days'`);
    total7d = total7dResult.rows[0].n;

    const total30dResult = await query(`SELECT count(*)::int AS n FROM click_logs WHERE clicked_at >= now() - interval '30 days'`);
    total30d = total30dResult.rows[0].n;

    const platformResult = await query(`
      SELECT platform,
        count(*)::int AS all_time,
        count(*) FILTER (WHERE clicked_at >= now() - interval '30 days')::int AS last_30d
      FROM click_logs GROUP BY platform ORDER BY all_time DESC
    `);
    byPlatform = platformResult.rows;

    const topToursResult = await query(`
      SELECT cl.tour_slug, count(*)::int AS clicks, max(t.data->>'name') AS tour_name
      FROM click_logs cl
      LEFT JOIN tours t ON t.slug = cl.tour_slug
      WHERE cl.tour_slug IS NOT NULL
      GROUP BY cl.tour_slug ORDER BY clicks DESC LIMIT 20
    `);
    topTours = topToursResult.rows;
  } catch (err) {
    console.error("[analytics] query failed:", err.message);
    dbError = err.message;
  }

  const platformRows = byPlatform
    .map((p) => `<tr><td style="text-transform:capitalize;">${esc(p.platform)}</td><td class="tabular">${p.all_time}</td><td class="tabular">${p.last_30d}</td></tr>`)
    .join("");

  const tourRows = topTours
    .map((t) => `<tr>
      <td>${t.tour_name ? esc(t.tour_name) : `<span style="color:var(--color-text-muted);">${esc(t.tour_slug)} (tour no longer exists)</span>`}</td>
      <td class="tabular">${t.clicks}</td>
    </tr>`)
    .join("");

  const body = `
    <h1 class="page-title">Analytics</h1>
    <p class="page-sub">Tracks clicks on the "Check Availability" / booking buttons on each Tour Detail page — this is the closest signal we have to actual bookings, since FareHarbor and the other platforms don't share conversion data back with us.</p>
    ${dbError ? `<div class="alert alert-error">Database error: ${esc(dbError)}. Run <code>npm run migrate</code> if the "click_logs" table doesn't exist yet.</div>` : ""}

    <div class="stat-grid">
      <div class="stat-card"><div class="stat-number">${totalAllTime}</div><div class="stat-label">Total Clicks (all time)</div></div>
      <div class="stat-card"><div class="stat-number">${total30d}</div><div class="stat-label">Last 30 Days</div></div>
      <div class="stat-card"><div class="stat-number">${total7d}</div><div class="stat-label">Last 7 Days</div></div>
    </div>

    <div class="form-card">
      <h2>Clicks by Platform</h2>
      <table class="data-table">
        <thead><tr><th>Platform</th><th>All Time</th><th>Last 30 Days</th></tr></thead>
        <tbody>${platformRows || `<tr><td colspan="3" style="text-align:center;color:var(--color-text-muted);padding:32px;">No clicks recorded yet.</td></tr>`}</tbody>
      </table>
    </div>

    <div class="form-card">
      <h2>Top 20 Tours by Clicks</h2>
      <table class="data-table">
        <thead><tr><th>Tour</th><th>Clicks</th></tr></thead>
        <tbody>${tourRows || `<tr><td colspan="2" style="text-align:center;color:var(--color-text-muted);padding:32px;">No clicks recorded yet.</td></tr>`}</tbody>
      </table>
    </div>
  `;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Analytics", activeNav: "analytics", user, body }));
}

module.exports = { showAnalytics };
