const { esc } = require("../utils");
const { layout, paginationHtml } = require("../render");
const { listAuditLog } = require("../auditLog");

const TARGET_TYPES = ["tour", "post", "user", "settings"];

function actionBadge(action) {
  const colors = { create: "#2e7d32", update: "#1565c0", delete: "#c62828" };
  const color = colors[action] || "#555";
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;color:#fff;background:${color};">${esc(action)}</span>`;
}

async function showAuditLog(req, res, user, urlObj) {
  const page = Math.max(1, parseInt(urlObj.searchParams.get("page"), 10) || 1);
  const targetType = urlObj.searchParams.get("targetType") || null;
  const pageSize = 30;

  let rows = [], total = 0;
  let loadError = null;
  try {
    const result = await listAuditLog({ page, pageSize, targetType });
    rows = result.rows;
    total = result.total;
  } catch (err) {
    loadError = err.message;
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const filterOptions = TARGET_TYPES.map(
    (t) => `<option value="${esc(t)}" ${targetType === t ? "selected" : ""}>${esc(t)}</option>`
  ).join("");

  const rowsHtml = rows.length
    ? rows
        .map(
          (r) => `
      <tr>
        <td style="white-space:nowrap;color:var(--color-text-muted);">${esc(new Date(r.created_at).toLocaleString())}</td>
        <td>${esc(r.user_email || "(unknown)")}</td>
        <td>${actionBadge(r.action)}</td>
        <td>${esc(r.target_type)}</td>
        <td><code style="font-size:12px;">${esc(r.target_id || "")}</code></td>
        <td>${esc(r.summary || "")}</td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="6" style="text-align:center;color:var(--color-text-muted);padding:24px;">No audit log entries${targetType ? ` for "${esc(targetType)}"` : ""} yet.</td></tr>`;

  const body = `
    <h1 class="page-title">Audit Log</h1>
    <p class="page-sub">Records who created, updated, or deleted Tours, Posts, Users, and Settings. ${total} total entr${total === 1 ? "y" : "ies"}.</p>
    ${loadError ? `<div class="alert alert-error">Database error: ${esc(loadError)}</div>` : ""}

    <div class="form-card">
      <form method="GET" action="/admin/audit-log" style="display:flex;gap:10px;align-items:flex-end;">
        <div class="form-field" style="max-width:220px;">
          <label>Filter by type</label>
          <select name="targetType" onchange="this.form.submit()">
            <option value="">All types</option>
            ${filterOptions}
          </select>
        </div>
      </form>
    </div>

    <div class="form-card" style="overflow-x:auto;">
      <table class="data-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>Action</th>
            <th>Type</th>
            <th>Target</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>

    ${paginationHtml(page, totalPages, "/admin/audit-log", targetType ? { targetType } : {})}
  `;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Audit Log", activeNav: "audit-log", user, body }));
}

module.exports = { showAuditLog };
