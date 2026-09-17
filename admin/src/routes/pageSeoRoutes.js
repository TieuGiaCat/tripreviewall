const { esc, readFormBody, slugify } = require("../utils");
const { layout } = require("../render");
const { query } = require("../db");
const { applyPageSeoOverride } = require("../lib/pageSeo");
const { logAudit } = require("../auditLog");

async function listPageSeo() {
  const result = await query(`SELECT page_key, label, file_path, meta_title, meta_description, updated_at FROM page_seo ORDER BY label ASC`);
  return result.rows;
}

function renderForm({ entry = {}, errors = [], isEdit = false } = {}) {
  const formAction = isEdit ? `/admin/page-seo/${encodeURIComponent(entry.page_key)}/edit` : "/admin/page-seo/new";
  return `
    ${errors.length ? `<div class="alert alert-error">${errors.map(esc).join("<br>")}</div>` : ""}
    <form method="POST" action="${formAction}">
      <div class="form-card">
        <div class="form-row">
          <div class="form-field"><label>Label (for your reference)</label><input type="text" name="label" value="${esc(entry.label || "")}" placeholder="e.g. Contact" required></div>
          <div class="form-field"><label>File Path (relative to site root)</label><input type="text" name="filePath" value="${esc(entry.file_path || "")}" placeholder="e.g. contact.html or index.html" ${isEdit ? "readonly" : ""} required><div class="hint">${isEdit ? "Can't be changed after creation — delete and re-add to point at a different file." : "The exact filename as it sits in your site's root folder."}</div></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>Meta Title</label><input type="text" name="metaTitle" value="${esc(entry.meta_title || "")}" maxlength="70"></div>
          <div class="form-field"><label>Meta Description</label><input type="text" name="metaDescription" value="${esc(entry.meta_description || "")}" maxlength="160"></div>
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${isEdit ? "Save Changes" : "Add Page"}</button>
        <a href="/admin/page-seo" class="btn btn-secondary">Cancel</a>
      </div>
    </form>
  `;
}

async function showPageSeoList(req, res, user) {
  let rows = [], loadError = null;
  try {
    rows = await listPageSeo();
  } catch (err) {
    loadError = err.message;
  }

  const rowsHtml = rows.length
    ? rows
        .map(
          (r) => `
      <tr>
        <td>${esc(r.label)}</td>
        <td><code style="font-size:12px;">${esc(r.file_path)}</code></td>
        <td>${esc(r.meta_title || "")}</td>
        <td>${esc(r.meta_description || "")}</td>
        <td style="white-space:nowrap;">
          <a href="/admin/page-seo/${encodeURIComponent(r.page_key)}/edit" class="btn btn-secondary btn-sm">Edit</a>
          <form method="POST" action="/admin/page-seo/${encodeURIComponent(r.page_key)}/delete" style="display:inline;" onsubmit="return confirm('Remove this page from SEO management? This does not delete the actual page — just stops managing its meta tags here.');">
            <button type="submit" class="btn btn-danger btn-sm">Delete</button>
          </form>
        </td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted);padding:24px;">No pages registered yet — add one below.</td></tr>`;

  const body = `
    <h1 class="page-title">Page SEO</h1>
    <p class="page-sub">Meta Title and Meta Description for standalone pages — Home, Contact, Transportation, and anything else that isn't a Tour or Blog Post (those have their own SEO fields on their own edit forms).</p>
    ${loadError ? `<div class="alert alert-error">Database error: ${esc(loadError)}</div>` : ""}

    <div class="form-card" style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr><th>Page</th><th>File</th><th>Meta Title</th><th>Meta Description</th><th></th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>

    <div class="form-card">
      <h2>Add a page</h2>
      ${renderForm({})}
    </div>
  `;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Page SEO", activeNav: "page-seo", user, body }));
}

async function createPageSeo(req, res, user) {
  let body;
  try {
    body = await readFormBody(req);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end("Malformed request.");
    return;
  }

  const label = (body.label || "").trim();
  const filePath = (body.filePath || "").trim().replace(/^\/+/, ""); // strip any leading slash the user typed
  const metaTitle = (body.metaTitle || "").trim() || null;
  const metaDescription = (body.metaDescription || "").trim() || null;

  const errors = [];
  if (!label) errors.push("Label is required.");
  if (!filePath) errors.push("File Path is required.");
  if (filePath.includes("..")) errors.push("File Path can't contain \"..\".");

  const pageKey = slugify(label) || slugify(filePath);
  if (!pageKey) errors.push("Could not generate a valid identifier from that label.");

  if (errors.length) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Page SEO", activeNav: "page-seo", user, body: `<h1 class="page-title">Add a page</h1>${renderForm({ entry: { label, file_path: filePath, meta_title: metaTitle, meta_description: metaDescription }, errors })}` }));
    return;
  }

  try {
    await query(
      `INSERT INTO page_seo (page_key, label, file_path, meta_title, meta_description) VALUES ($1, $2, $3, $4, $5)`,
      [pageKey, label, filePath, metaTitle, metaDescription]
    );
  } catch (err) {
    console.error("[page-seo] create failed:", err.message);
    const dbErrors = err.code === "23505" ? ["A page with this identifier already exists — try a different Label."] : [`Database error: ${err.message}`];
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Page SEO", activeNav: "page-seo", user, body: `<h1 class="page-title">Add a page</h1>${renderForm({ entry: { label, file_path: filePath, meta_title: metaTitle, meta_description: metaDescription }, errors: dbErrors })}` }));
    return;
  }

  let applyResult;
  try {
    applyResult = await applyPageSeoOverride(pageKey);
  } catch (err) {
    applyResult = { applied: false, reason: err.message };
  }

  await logAudit(user, "create", "page_seo", pageKey, `Registered page "${label}" (${filePath})`);

  if (applyResult && !applyResult.applied && applyResult.reason && applyResult.reason.startsWith("File not found")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Page SEO", activeNav: "page-seo", user, body: `<div class="alert alert-error">Saved, but couldn't find "${esc(filePath)}" on disk to apply it yet — double-check the path. It'll apply automatically once the file exists.</div><a href="/admin/page-seo" class="btn btn-secondary">Back to Page SEO</a>` }));
    return;
  }

  res.writeHead(302, { Location: "/admin/page-seo" });
  res.end();
}

async function editPageSeoForm(req, res, user, pageKey) {
  const result = await query(`SELECT page_key, label, file_path, meta_title, meta_description FROM page_seo WHERE page_key = $1`, [pageKey]);
  const entry = result.rows[0];
  if (!entry) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Not found", activeNav: "page-seo", user, body: `<div class="alert alert-error">Page not found.</div><a href="/admin/page-seo" class="btn btn-secondary">Back to Page SEO</a>` }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Edit Page SEO", activeNav: "page-seo", user, body: `<h1 class="page-title">Edit "${esc(entry.label)}"</h1>${renderForm({ entry, isEdit: true })}` }));
}

async function updatePageSeo(req, res, user, pageKey) {
  let body;
  try {
    body = await readFormBody(req);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end("Malformed request.");
    return;
  }

  const label = (body.label || "").trim();
  const metaTitle = (body.metaTitle || "").trim() || null;
  const metaDescription = (body.metaDescription || "").trim() || null;

  const errors = [];
  if (!label) errors.push("Label is required.");

  const existingResult = await query(`SELECT file_path FROM page_seo WHERE page_key = $1`, [pageKey]);
  const existing = existingResult.rows[0];
  if (!existing) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Not found", activeNav: "page-seo", user, body: `<div class="alert alert-error">Page not found.</div>` }));
    return;
  }

  if (errors.length) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Edit Page SEO", activeNav: "page-seo", user, body: renderForm({ entry: { page_key: pageKey, label, file_path: existing.file_path, meta_title: metaTitle, meta_description: metaDescription }, errors, isEdit: true }) }));
    return;
  }

  try {
    await query(
      `UPDATE page_seo SET label = $1, meta_title = $2, meta_description = $3, updated_at = now() WHERE page_key = $4`,
      [label, metaTitle, metaDescription, pageKey]
    );
  } catch (err) {
    console.error("[page-seo] update failed:", err.message);
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Edit Page SEO", activeNav: "page-seo", user, body: renderForm({ entry: { page_key: pageKey, label, file_path: existing.file_path, meta_title: metaTitle, meta_description: metaDescription }, errors: [`Database error: ${err.message}`], isEdit: true }) }));
    return;
  }

  let applyResult;
  try {
    applyResult = await applyPageSeoOverride(pageKey);
  } catch (err) {
    applyResult = { applied: false, reason: err.message };
  }

  await logAudit(user, "update", "page_seo", pageKey, `Updated SEO for page "${label}"`);

  if (applyResult && !applyResult.applied && applyResult.reason && applyResult.reason.startsWith("File not found")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Page SEO", activeNav: "page-seo", user, body: `<div class="alert alert-error">Saved, but couldn't find "${esc(existing.file_path)}" on disk to apply it — double-check the path.</div><a href="/admin/page-seo" class="btn btn-secondary">Back to Page SEO</a>` }));
    return;
  }

  res.writeHead(302, { Location: "/admin/page-seo" });
  res.end();
}

async function deletePageSeo(req, res, user, pageKey) {
  try {
    const result = await query(`DELETE FROM page_seo WHERE page_key = $1 RETURNING label`, [pageKey]);
    if (result.rows[0]) await logAudit(user, "delete", "page_seo", pageKey, `Removed page "${result.rows[0].label}" from SEO management`);
  } catch (err) {
    console.error("[page-seo] delete failed:", err.message);
  }
  res.writeHead(302, { Location: "/admin/page-seo" });
  res.end();
}

module.exports = { showPageSeoList, createPageSeo, editPageSeoForm, updatePageSeo, deletePageSeo };
