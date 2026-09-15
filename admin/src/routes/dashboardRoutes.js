const { query } = require("../db");
const { layout } = require("../render");
const { esc } = require("../utils");

async function showDashboard(req, res, user) {
  let published = 0;
  let draft = 0;
  let dbError = null;

  try {
    const result = await query(
      `SELECT status, count(*)::int AS n FROM tours GROUP BY status`
    );
    for (const row of result.rows) {
      if (row.status === "published") published = row.n;
      if (row.status === "draft") draft = row.n;
    }
  } catch (err) {
    console.error("[dashboard] query failed:", err.message);
    dbError = err.message;
  }

  const body = `
    <h1 class="page-title">Dashboard</h1>
    <p class="page-sub">Welcome back, ${esc(user.name || user.email)}.</p>
    ${dbError ? `<div class="alert alert-error">Database error: ${esc(dbError)}. Check DATABASE_URL and that migrations have run (see SETUP.md).</div>` : ""}

    <div class="stat-grid">
      <div class="stat-card"><div class="stat-number">${published}</div><div class="stat-label">Published Tours</div></div>
      <div class="stat-card"><div class="stat-number">${draft}</div><div class="stat-label">Draft Tours</div></div>
      <div class="stat-card"><div class="stat-number">—</div><div class="stat-label">Blog Posts (module not built yet)</div></div>
      <div class="stat-card"><div class="stat-number">—</div><div class="stat-label">New Leads (module not built yet)</div></div>
    </div>

    <div class="form-card">
      <h2>Quick Links</h2>
      <div class="form-actions">
        <a href="/admin/tours/new" class="btn btn-primary">+ New Tour</a>
        <a href="/admin/tours" class="btn btn-secondary">View All Tours</a>
      </div>
    </div>

    <div class="form-card">
      <h2>What's built so far</h2>
      <p style="color:var(--color-text-muted);line-height:1.6;">
        This is the admin panel <strong>core</strong>: authentication, session handling,
        and a complete Tours CRUD module (list, create, edit, delete), matching the
        <code>tours</code> table schema in <code>sql/schema.sql</code>. Blog Posts,
        Destinations, Authors, Leads, Analytics, Media Library, Settings and Users
        are scaffolded in the sidebar but not built yet — see
        <code>master-technical-architecture.md</code> §12 for the intended build order.
      </p>
    </div>
  `;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Dashboard", activeNav: "dashboard", user, body }));
}

module.exports = { showDashboard };
