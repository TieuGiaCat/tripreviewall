const { query } = require("../db");
const { readFormBody, esc } = require("../utils");
const { layout } = require("../render");

async function listCategories(req, res, user) {
  let rows = [];
  let dbError = null;
  try {
    const result = await query(`SELECT id, name, status, created_at FROM categories ORDER BY name ASC`);
    rows = result.rows;
    // How many posts currently use each name — shown so deleting doesn't
    // silently orphan posts without warning.
    const usageResult = await query(`SELECT category, count(*)::int AS n FROM posts WHERE category IS NOT NULL GROUP BY category`);
    const usageByName = {};
    usageResult.rows.forEach((r) => { usageByName[r.category] = r.n; });
    rows = rows.map((r) => ({ ...r, postCount: usageByName[r.name] || 0 }));
  } catch (err) {
    console.error("[categories] list failed:", err.message);
    dbError = err.message;
  }

  const tableRows = rows
    .map(
      (c) => `<tr>
        <td>${esc(c.name)}</td>
        <td><span class="badge ${c.status === "active" ? "badge-published" : "badge-draft"}">${esc(c.status)}</span></td>
        <td>${c.postCount} post${c.postCount === 1 ? "" : "s"}</td>
        <td>
          <a href="/admin/categories/${c.id}/edit" class="btn btn-secondary btn-sm">Edit</a>
          <form method="POST" action="/admin/categories/${c.id}/delete" style="display:inline;"
                onsubmit="return confirm('${c.postCount > 0 ? `${c.postCount} post(s) currently use this category — they will keep the text but it will disappear from the dropdown. ` : ""}Delete this category?');">
            <button type="submit" class="btn btn-danger btn-sm">Delete</button>
          </form>
        </td>
      </tr>`
    )
    .join("");

  const body = `
    <h1 class="page-title">Categories</h1>
    <p class="page-sub">The list Blog Posts choose from. Renaming here does <strong>not</strong> update posts already using the old name — edit those posts individually if you rename a category.</p>
    ${dbError ? `<div class="alert alert-error">Database error: ${esc(dbError)}. Run <code>npm run migrate</code> if the "categories" table doesn't exist yet.</div>` : ""}

    <div class="toolbar">
      <a href="/admin/posts" class="btn btn-secondary">← Back to Blog Posts</a>
      <a href="/admin/categories/new" class="btn btn-primary">+ New Category</a>
    </div>

    <table class="data-table">
      <thead><tr><th>Name</th><th>Status</th><th>Used By</th><th>Actions</th></tr></thead>
      <tbody>${tableRows || `<tr><td colspan="4" style="text-align:center;color:var(--color-text-muted);padding:32px;">No categories yet.</td></tr>`}</tbody>
    </table>
  `;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Categories", activeNav: "blog", user, body }));
}

function renderCategoryForm({ category = {}, errors = [], formAction, isEdit }) {
  return `
    <h1 class="page-title">${isEdit ? "Edit Category" : "New Category"}</h1>
    ${errors.length ? `<div class="alert alert-error">${errors.map(esc).join("<br>")}</div>` : ""}
    <form method="POST" action="${formAction}">
      <div class="form-card">
        <div class="form-row">
          <div class="form-field"><label>Name</label><input type="text" name="name" required value="${esc(category.name || "")}"></div>
          ${isEdit ? `<div class="form-field"><label>Status</label>
            <select name="status">
              <option value="active" ${category.status !== "inactive" ? "selected" : ""}>Active</option>
              <option value="inactive" ${category.status === "inactive" ? "selected" : ""}>Inactive (hidden from the dropdown, existing posts keep it)</option>
            </select>
          </div>` : ""}
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${isEdit ? "Save Changes" : "Create Category"}</button>
        <a href="/admin/categories" class="btn btn-secondary">Cancel</a>
      </div>
    </form>
  `;
}

async function newCategoryForm(req, res, user) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "New Category", activeNav: "blog", user, body: renderCategoryForm({ formAction: "/admin/categories/new", isEdit: false }) }));
}

async function createCategory(req, res, user) {
  let body;
  try { body = await readFormBody(req); } catch (err) { res.writeHead(400); res.end("Malformed request."); return; }

  const name = (body.name || "").trim();
  const errors = [];
  if (!name) errors.push("Name is required.");

  if (errors.length) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "New Category", activeNav: "blog", user, body: renderCategoryForm({ category: { name }, errors, formAction: "/admin/categories/new", isEdit: false }) }));
    return;
  }

  try {
    await query(`INSERT INTO categories (name, status) VALUES ($1, 'active')`, [name]);
  } catch (err) {
    const dbErrors = err.code === "23505" ? ["A category with this name already exists."] : [`Database error: ${err.message}`];
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "New Category", activeNav: "blog", user, body: renderCategoryForm({ category: { name }, errors: dbErrors, formAction: "/admin/categories/new", isEdit: false }) }));
    return;
  }

  res.writeHead(302, { Location: "/admin/categories" });
  res.end();
}

async function editCategoryForm(req, res, user, id) {
  let result;
  try { result = await query("SELECT * FROM categories WHERE id = $1", [id]); }
  catch (err) { res.writeHead(500); res.end(`Database error: ${esc(err.message)}`); return; }
  const category = result.rows[0];
  if (!category) { res.writeHead(404); res.end("Category not found."); return; }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Edit Category", activeNav: "blog", user, body: renderCategoryForm({ category, formAction: `/admin/categories/${id}/edit`, isEdit: true }) }));
}

async function updateCategory(req, res, user, id) {
  let body;
  try { body = await readFormBody(req); } catch (err) { res.writeHead(400); res.end("Malformed request."); return; }

  const name = (body.name || "").trim();
  const status = body.status === "inactive" ? "inactive" : "active";
  const errors = [];
  if (!name) errors.push("Name is required.");

  if (errors.length) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Edit Category", activeNav: "blog", user, body: renderCategoryForm({ category: { id, name, status }, errors, formAction: `/admin/categories/${id}/edit`, isEdit: true }) }));
    return;
  }

  try {
    await query(`UPDATE categories SET name = $1, status = $2 WHERE id = $3`, [name, status, id]);
  } catch (err) {
    const dbErrors = err.code === "23505" ? ["Another category already uses this name."] : [`Database error: ${err.message}`];
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Edit Category", activeNav: "blog", user, body: renderCategoryForm({ category: { id, name, status }, errors: dbErrors, formAction: `/admin/categories/${id}/edit`, isEdit: true }) }));
    return;
  }

  res.writeHead(302, { Location: "/admin/categories" });
  res.end();
}

async function deleteCategory(req, res, user, id) {
  try { await query("DELETE FROM categories WHERE id = $1", [id]); }
  catch (err) { console.error("[categories] delete failed:", err.message); }
  res.writeHead(302, { Location: "/admin/categories" });
  res.end();
}

/** Used by blogRoutes.js to populate the category dropdown on the Post form. */
async function listActiveCategoryNames() {
  try {
    const result = await query(`SELECT name FROM categories WHERE status = 'active' ORDER BY name ASC`);
    return result.rows.map((r) => r.name);
  } catch (err) {
    console.error("[categories] listActiveCategoryNames failed:", err.message);
    return [];
  }
}

module.exports = { listCategories, newCategoryForm, createCategory, editCategoryForm, updateCategory, deleteCategory, listActiveCategoryNames };
