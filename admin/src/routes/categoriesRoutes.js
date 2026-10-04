const { query } = require("../db");
const { logAudit } = require("../auditLog");
const { readFormBody, esc } = require("../utils");
const { layout } = require("../render");

/* The public All Articles page builds its tabs from this table, so every
   change here rebuilds the listing pages (and, after a rename, the articles
   that use the category). Errors are shown as a warning, never lost. */
async function rebuildAfterChange(renamedPosts = []) {
  const { regenerateListingPages, generatePostFile } = require("../ssr/generator");
  const errors = [];
  for (const row of renamedPosts) {
    const r = await generatePostFile(row);
    if (r && !r.ok) errors.push(r.error);
  }
  const listing = await regenerateListingPages();
  errors.push(...(listing.errors || []));
  return errors;
}

function redirectWithWarn(res, errors) {
  const warn = errors.length ? "?warn=" + encodeURIComponent(errors.slice(0, 3).join(" · ")) : "";
  res.writeHead(302, { Location: "/admin/categories" + warn });
  res.end();
}

async function listCategories(req, res, user) {
  const warn = new URL(req.url, "http://x").searchParams.get("warn") || "";
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
    <p class="page-sub">The list Blog Posts choose from — and the tabs on the public <a href="/blog" target="_blank">All Articles</a> page (active categories only, A–Z). Changes here update the live page right away. Renaming a category also moves its posts to the new name.</p>
    ${dbError ? `<div class="alert alert-error">Database error: ${esc(dbError)}. Run <code>npm run migrate</code> if the "categories" table doesn't exist yet.</div>` : ""}
    ${warn ? `<div class="alert alert-error">⚠ Saved, but the public page wasn't fully updated: ${esc(warn)}</div>` : ""}

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
    await logAudit(user, "create", "category", name, `Created category "${name}"`);
  } catch (err) {
    const dbErrors = err.code === "23505" ? ["A category with this name already exists."] : [`Database error: ${err.message}`];
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "New Category", activeNav: "blog", user, body: renderCategoryForm({ category: { name }, errors: dbErrors, formAction: "/admin/categories/new", isEdit: false }) }));
    return;
  }

  redirectWithWarn(res, await rebuildAfterChange());
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

  let renamedPosts = [];
  try {
    const before = await query(`SELECT name FROM categories WHERE id = $1`, [id]);
    const oldName = before.rows[0] && before.rows[0].name;
    await query(`UPDATE categories SET name = $1, status = $2 WHERE id = $3`, [name, status, id]);
    let note = "";
    if (oldName && oldName !== name) {
      // Move the posts to the new name so they stay under the renamed tab.
      const moved = await query(
        `UPDATE posts SET category = $1, updated_at = now() WHERE category = $2
         RETURNING slug, status, category, island_tag, content_format, published_at, updated_at, data`,
        [name, oldName]
      );
      renamedPosts = moved.rows.filter((r) => r.status === "published");
      note = ` — renamed from "${oldName}", ${moved.rowCount} post(s) moved`;
    }
    await logAudit(user, "update", "category", name, `Updated category "${name}" (${status})${note}`);
  } catch (err) {
    const dbErrors = err.code === "23505" ? ["Another category already uses this name."] : [`Database error: ${err.message}`];
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Edit Category", activeNav: "blog", user, body: renderCategoryForm({ category: { id, name, status }, errors: dbErrors, formAction: `/admin/categories/${id}/edit`, isEdit: true }) }));
    return;
  }

  redirectWithWarn(res, await rebuildAfterChange(renamedPosts));
}

async function deleteCategory(req, res, user, id) {
  try { await query("DELETE FROM categories WHERE id = $1", [id]); await logAudit(user, "delete", "category", String(id), "Deleted a category"); }
  catch (err) { console.error("[categories] delete failed:", err.message); }
  redirectWithWarn(res, await rebuildAfterChange());
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
