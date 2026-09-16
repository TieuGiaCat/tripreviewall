const { query } = require("../db");
const { layout } = require("../render");
const { esc, readFormBody } = require("../utils");

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

async function listLeads(req, res, user, urlObj) {
  const statusFilter = urlObj.searchParams.get("status") || "";
  const sourceFilter = urlObj.searchParams.get("source") || "";

  const conditions = [];
  const params = [];
  if (statusFilter) {
    params.push(statusFilter);
    conditions.push(`status = $${params.length}`);
  }
  if (sourceFilter) {
    params.push(sourceFilter);
    conditions.push(`source = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  let rows = [];
  let dbError = null;
  try {
    const result = await query(
      `SELECT id, source, status, created_at, data FROM leads ${where} ORDER BY created_at DESC LIMIT 200`,
      params
    );
    rows = result.rows;
  } catch (err) {
    console.error("[leads] list failed:", err.message);
    dbError = err.message;
  }

  const tableRows = rows
    .map((r) => {
      const d = r.data || {};
      return `<tr>
        <td>${fmtDate(r.created_at)}</td>
        <td><span class="badge ${r.source === "contact" ? "badge-draft" : "badge-published"}">${esc(r.source)}</span></td>
        <td>${esc(d.name || "—")}</td>
        <td>${esc(d.email || "—")}</td>
        <td>${esc(d.phone || "—")}</td>
        <td><span class="badge ${r.status === "new" ? "badge-published" : "badge-draft"}">${esc(r.status)}</span></td>
        <td><a href="/admin/leads/${r.id}" class="btn btn-secondary btn-sm">View</a></td>
      </tr>`;
    })
    .join("");

  const body = `
    <h1 class="page-title">Leads</h1>
    <p class="page-sub">${rows.length} lead${rows.length === 1 ? "" : "s"} shown (max 200). Contact and Transportation form submissions land here automatically.</p>
    ${dbError ? `<div class="alert alert-error">Database error: ${esc(dbError)}. Run <code>npm run migrate</code> if the "leads" table doesn't exist yet.</div>` : ""}

    <div class="toolbar">
      <form method="GET" action="/admin/leads" style="display:flex;gap:8px;">
        <select name="source" style="padding:8px 12px;border:1px solid var(--color-border);border-radius:4px;">
          <option value="">All sources</option>
          <option value="contact" ${sourceFilter === "contact" ? "selected" : ""}>Contact</option>
          <option value="transportation" ${sourceFilter === "transportation" ? "selected" : ""}>Transportation</option>
        </select>
        <select name="status" style="padding:8px 12px;border:1px solid var(--color-border);border-radius:4px;">
          <option value="">All statuses</option>
          <option value="new" ${statusFilter === "new" ? "selected" : ""}>New</option>
          <option value="contacted" ${statusFilter === "contacted" ? "selected" : ""}>Contacted</option>
          <option value="closed" ${statusFilter === "closed" ? "selected" : ""}>Closed</option>
        </select>
        <button type="submit" class="btn btn-secondary">Filter</button>
      </form>
    </div>

    <table class="data-table">
      <thead><tr><th>Received</th><th>Source</th><th>Name</th><th>Email</th><th>Phone</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${tableRows || `<tr><td colspan="7" style="text-align:center;color:var(--color-text-muted);padding:32px;">No leads yet.</td></tr>`}</tbody>
    </table>
  `;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Leads", activeNav: "leads", user, body }));
}

const FIELD_LABELS = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  message: "Message",
  service: "Service Type",
  date: "Preferred Date",
  pickup: "Pickup Location",
  passengers: "Passengers",
  notes: "Additional Notes",
};
const HIDDEN_FIELDS = new Set(["ipAddress", "userAgent", "emailSentAt", "emailError"]);

async function leadDetail(req, res, user, id) {
  let row;
  try {
    const result = await query("SELECT id, source, status, created_at, updated_at, data FROM leads WHERE id = $1", [id]);
    row = result.rows[0];
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Error", activeNav: "leads", user, body: `<div class="alert alert-error">Database error: ${esc(err.message)}</div>` }));
    return;
  }
  if (!row) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      layout({
        title: "Not found",
        activeNav: "leads",
        user,
        body: `<div class="alert alert-error">Lead not found.</div><a href="/admin/leads" class="btn btn-secondary">Back to Leads</a>`,
      })
    );
    return;
  }

  const d = row.data || {};
  const fieldRows = Object.entries(d)
    .filter(([k, v]) => !HIDDEN_FIELDS.has(k) && v !== "" && v != null)
    .map(
      ([k, v]) =>
        `<div class="form-row full"><div class="form-field"><label>${esc(FIELD_LABELS[k] || k)}</label><div style="padding:9px 0;">${esc(String(v)).replace(/\n/g, "<br>")}</div></div></div>`
    )
    .join("");

  const emailStatusLine = d.emailSentAt
    ? `<span style="color:var(--color-positive);">✓ Notification email sent ${fmtDate(d.emailSentAt)}</span>`
    : d.emailError
    ? `<span style="color:var(--color-error);">✕ Notification email failed: ${esc(d.emailError)}</span>`
    : `<span style="color:var(--color-text-muted);">Notification email not sent yet (SMTP may not be configured — see Settings → Email).</span>`;

  const body = `
    <h1 class="page-title">Lead — ${esc(d.name || "Unknown")}</h1>
    <p class="page-sub">Submitted via ${esc(row.source)} form, ${fmtDate(row.created_at)}</p>

    <div class="form-card">
      <h2>Submission</h2>
      ${fieldRows}
      <div class="form-row full"><div class="form-field"><label>Email Delivery</label><div style="padding:9px 0;">${emailStatusLine}</div></div></div>
    </div>

    <div class="form-card">
      <h2>Status</h2>
      <form method="POST" action="/admin/leads/${row.id}/status" style="display:flex;gap:10px;align-items:center;">
        <select name="status" style="padding:9px 12px;border:1px solid var(--color-border);border-radius:4px;">
          <option value="new" ${row.status === "new" ? "selected" : ""}>New</option>
          <option value="contacted" ${row.status === "contacted" ? "selected" : ""}>Contacted</option>
          <option value="closed" ${row.status === "closed" ? "selected" : ""}>Closed</option>
        </select>
        <button type="submit" class="btn btn-primary">Update Status</button>
      </form>
    </div>

    <div class="form-actions">
      <a href="/admin/leads" class="btn btn-secondary">Back to Leads</a>
      <form method="POST" action="/admin/leads/${row.id}/delete" onsubmit="return confirm('Delete this lead? This cannot be undone.');">
        <button type="submit" class="btn btn-danger">Delete Lead</button>
      </form>
    </div>
  `;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Lead Detail", activeNav: "leads", user, body }));
}

async function updateLeadStatus(req, res, user, id) {
  let body;
  try {
    body = await readFormBody(req);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end("Malformed request.");
    return;
  }
  const status = ["new", "contacted", "closed"].includes(body.status) ? body.status : "new";
  try {
    await query("UPDATE leads SET status = $1, updated_at = now() WHERE id = $2", [status, id]);
  } catch (err) {
    console.error("[leads] status update failed:", err.message);
  }
  res.writeHead(302, { Location: `/admin/leads/${id}` });
  res.end();
}

async function deleteLead(req, res, user, id) {
  try {
    await query("DELETE FROM leads WHERE id = $1", [id]);
  } catch (err) {
    console.error("[leads] delete failed:", err.message);
  }
  res.writeHead(302, { Location: "/admin/leads" });
  res.end();
}

module.exports = { listLeads, leadDetail, updateLeadStatus, deleteLead };
