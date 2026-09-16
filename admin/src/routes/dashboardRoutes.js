const { query } = require("../db");
const { layout } = require("../render");
const { esc } = require("../utils");

async function showDashboard(req, res, user) {
  let publishedTours = 0, draftTours = 0, publishedPosts = 0, draftPosts = 0;
  let dbError = null;

  try {
    const tourCounts = await query(`SELECT status, count(*)::int AS n FROM tours GROUP BY status`);
    for (const row of tourCounts.rows) {
      if (row.status === "published") publishedTours = row.n;
      if (row.status === "draft") draftTours = row.n;
    }
    const postCounts = await query(`SELECT status, count(*)::int AS n FROM posts GROUP BY status`);
    for (const row of postCounts.rows) {
      if (row.status === "published") publishedPosts = row.n;
      if (row.status === "draft") draftPosts = row.n;
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
      <div class="stat-card"><div class="stat-number">${publishedTours}</div><div class="stat-label">Published Tours</div></div>
      <div class="stat-card"><div class="stat-number">${draftTours}</div><div class="stat-label">Draft Tours</div></div>
      <div class="stat-card"><div class="stat-number">${publishedPosts}</div><div class="stat-label">Published Posts</div></div>
      <div class="stat-card"><div class="stat-number">${draftPosts}</div><div class="stat-label">Draft Posts</div></div>
    </div>

    <div class="form-card">
      <h2>Quick Links</h2>
      <div class="form-actions">
        <a href="/admin/tours/new" class="btn btn-primary">+ New Tour</a>
        <a href="/admin/posts/new" class="btn btn-primary">+ New Post</a>
        <a href="/admin/tours" class="btn btn-secondary">View All Tours</a>
        <a href="/admin/posts" class="btn btn-secondary">View All Posts</a>
      </div>
    </div>

    <div class="form-card">
      <h2>What's built so far</h2>
      <p style="color:var(--color-text-muted);line-height:1.6;">
        Tours, Blog Posts, Leads, Destinations and Authors all have full CRUD plus image upload
        where relevant. Settings → Email is configured for lead notifications. Analytics,
        Media Library and Users are scaffolded in the sidebar but not built yet — see
        <code>master-technical-architecture.md</code> §12 for the intended build order.
      </p>
    </div>
  `;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Dashboard", activeNav: "dashboard", user, body }));
}

module.exports = { showDashboard };
