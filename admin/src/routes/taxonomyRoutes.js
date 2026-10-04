/**
 * Admin screens for a simple list of names that blog posts are tagged with.
 * Used twice:
 *   Categories — posts.category    (tabs on the public All Articles page)
 *   Topics     — posts.island_tag  (topic tag on each article + Topic filter;
 *                the column keeps its old name, it used to hold only islands)
 *
 * Both lists feed the public blog, so every change rebuilds the listing pages,
 * and a rename moves the posts that used the old name.
 */
const { query } = require("../db");
const { logAudit } = require("../auditLog");
const { readFormBody, esc } = require("../utils");
const { layout } = require("../render");

function createTaxonomyRoutes(cfg) {
  // cfg = { table, postColumn, base, singular, plural, intro, auditEntity, otherLink }
  const { table, postColumn, base, singular, plural } = cfg;
  const lower = singular.toLowerCase();

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
    res.writeHead(302, { Location: base + warn });
    res.end();
  }

  async function list(req, res, user) {
    const warn = new URL(req.url, "http://x").searchParams.get("warn") || "";
    let rows = [];
    let dbError = null;
    try {
      const result = await query(`SELECT id, name, status, created_at FROM ${table} ORDER BY name ASC`);
      rows = result.rows;
      const usage = await query(`SELECT ${postColumn} AS name, count(*)::int AS n FROM posts WHERE ${postColumn} IS NOT NULL GROUP BY ${postColumn}`);
      const byName = {};
      usage.rows.forEach((r) => { byName[r.name] = r.n; });
      rows = rows.map((r) => ({ ...r, postCount: byName[r.name] || 0 }));
    } catch (err) {
      console.error(`[${table}] list failed:`, err.message);
      dbError = err.message;
    }

    const tableRows = rows.map((c) => `<tr>
        <td>${esc(c.name)}</td>
        <td><span class="badge ${c.status === "active" ? "badge-published" : "badge-draft"}">${esc(c.status)}</span></td>
        <td>${c.postCount} post${c.postCount === 1 ? "" : "s"}</td>
        <td>
          <a href="${base}/${c.id}/edit" class="btn btn-secondary btn-sm">Edit</a>
          <form method="POST" action="${base}/${c.id}/delete" style="display:inline;"
                onsubmit="return confirm('${c.postCount > 0 ? `${c.postCount} post(s) use this ${lower} — they keep the text, but it disappears from the list and the filter. ` : ""}Delete this ${lower}?');">
            <button type="submit" class="btn btn-danger btn-sm">Delete</button>
          </form>
        </td>
      </tr>`).join("");

    const body = `
    <h1 class="page-title">${plural}</h1>
    <p class="page-sub">${cfg.intro}</p>
    ${dbError ? `<div class="alert alert-error">Database error: ${esc(dbError)}. Run <code>npm run migrate</code> if the "${table}" table doesn't exist yet.</div>` : ""}
    ${warn ? `<div class="alert alert-error">⚠ Saved, but the public page wasn't fully updated: ${esc(warn)}</div>` : ""}

    <div class="toolbar">
      <a href="/admin/posts" class="btn btn-secondary">← Back to Blog Posts</a>
      ${cfg.otherLink ? `<a href="${cfg.otherLink.href}" class="btn btn-secondary">${cfg.otherLink.label}</a>` : ""}
      <a href="${base}/new" class="btn btn-primary">+ New ${singular}</a>
    </div>

    <table class="data-table">
      <thead><tr><th>Name</th><th>Status</th><th>Used By</th><th>Actions</th></tr></thead>
      <tbody>${tableRows || `<tr><td colspan="4" style="text-align:center;color:var(--color-text-muted);padding:32px;">No ${plural.toLowerCase()} yet.</td></tr>`}</tbody>
    </table>
  `;
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: plural, activeNav: "blog", user, body }));
  }

  function renderForm({ item = {}, errors = [], formAction, isEdit }) {
    return `
    <h1 class="page-title">${isEdit ? `Edit ${singular}` : `New ${singular}`}</h1>
    ${errors.length ? `<div class="alert alert-error">${errors.map(esc).join("<br>")}</div>` : ""}
    <form method="POST" action="${formAction}">
      <div class="form-card">
        <div class="form-row">
          <div class="form-field"><label>Name</label><input type="text" name="name" required value="${esc(item.name || "")}">${isEdit ? `<div class="hint">Renaming also updates every post that uses this ${lower}.</div>` : ""}</div>
          ${isEdit ? `<div class="form-field"><label>Status</label>
            <select name="status">
              <option value="active" ${item.status !== "inactive" ? "selected" : ""}>Active</option>
              <option value="inactive" ${item.status === "inactive" ? "selected" : ""}>Inactive (hidden from the list and the public filter; posts keep it)</option>
            </select>
          </div>` : ""}
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${isEdit ? "Save Changes" : `Create ${singular}`}</button>
        <a href="${base}" class="btn btn-secondary">Cancel</a>
      </div>
    </form>`;
  }

  function sendForm(res, user, status, opts) {
    res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: opts.isEdit ? `Edit ${singular}` : `New ${singular}`, activeNav: "blog", user, body: renderForm(opts) }));
  }

  async function newForm(req, res, user) {
    sendForm(res, user, 200, { formAction: `${base}/new`, isEdit: false });
  }

  async function create(req, res, user) {
    let body;
    try { body = await readFormBody(req); } catch (err) { res.writeHead(400); res.end("Malformed request."); return; }
    const name = (body.name || "").trim();
    if (!name) return sendForm(res, user, 400, { item: { name }, errors: ["Name is required."], formAction: `${base}/new`, isEdit: false });
    try {
      await query(`INSERT INTO ${table} (name, status) VALUES ($1, 'active')`, [name]);
      await logAudit(user, "create", cfg.auditEntity, name, `Created ${lower} "${name}"`);
    } catch (err) {
      const errors = err.code === "23505" ? [`A ${lower} with this name already exists.`] : [`Database error: ${err.message}`];
      return sendForm(res, user, 400, { item: { name }, errors, formAction: `${base}/new`, isEdit: false });
    }
    redirectWithWarn(res, await rebuildAfterChange());
  }

  async function editForm(req, res, user, id) {
    let result;
    try { result = await query(`SELECT * FROM ${table} WHERE id = $1`, [id]); }
    catch (err) { res.writeHead(500); res.end(`Database error: ${esc(err.message)}`); return; }
    const item = result.rows[0];
    if (!item) { res.writeHead(404); res.end(`${singular} not found.`); return; }
    sendForm(res, user, 200, { item, formAction: `${base}/${id}/edit`, isEdit: true });
  }

  async function update(req, res, user, id) {
    let body;
    try { body = await readFormBody(req); } catch (err) { res.writeHead(400); res.end("Malformed request."); return; }
    const name = (body.name || "").trim();
    const status = body.status === "inactive" ? "inactive" : "active";
    const opts = { item: { id, name, status }, formAction: `${base}/${id}/edit`, isEdit: true };
    if (!name) return sendForm(res, user, 400, { ...opts, errors: ["Name is required."] });

    let renamedPosts = [];
    try {
      const before = await query(`SELECT name FROM ${table} WHERE id = $1`, [id]);
      const oldName = before.rows[0] && before.rows[0].name;
      await query(`UPDATE ${table} SET name = $1, status = $2 WHERE id = $3`, [name, status, id]);
      let note = "";
      if (oldName && oldName !== name) {
        const moved = await query(
          `UPDATE posts SET ${postColumn} = $1, updated_at = now() WHERE ${postColumn} = $2
           RETURNING slug, status, category, island_tag, content_format, published_at, updated_at, data`,
          [name, oldName]
        );
        renamedPosts = moved.rows.filter((r) => r.status === "published");
        note = ` — renamed from "${oldName}", ${moved.rowCount} post(s) moved`;
      }
      await logAudit(user, "update", cfg.auditEntity, name, `Updated ${lower} "${name}" (${status})${note}`);
    } catch (err) {
      const errors = err.code === "23505" ? [`Another ${lower} already uses this name.`] : [`Database error: ${err.message}`];
      return sendForm(res, user, 400, { ...opts, errors });
    }
    redirectWithWarn(res, await rebuildAfterChange(renamedPosts));
  }

  async function remove(req, res, user, id) {
    try {
      const r = await query(`DELETE FROM ${table} WHERE id = $1 RETURNING name`, [id]);
      if (r.rows[0]) await logAudit(user, "delete", cfg.auditEntity, r.rows[0].name, `Deleted ${lower} "${r.rows[0].name}"`);
    } catch (err) { console.error(`[${table}] delete failed:`, err.message); }
    redirectWithWarn(res, await rebuildAfterChange());
  }

  /** Active names, A–Z (post form dropdown, public filter). */
  async function listActiveNames() {
    try {
      const result = await query(`SELECT name FROM ${table} WHERE status = 'active' ORDER BY name ASC`);
      return result.rows.map((r) => r.name);
    } catch (err) {
      console.error(`[${table}] listActiveNames failed:`, err.message);
      return [];
    }
  }

  /** Wires the routes into server.js. Returns true when it handled the request. */
  function route(method, pathname, req, res, session) {
    if (pathname === base && method === "GET") return list(req, res, session);
    if (pathname === `${base}/new`) {
      if (method === "GET") return newForm(req, res, session);
      if (method === "POST") return create(req, res, session);
    }
    const edit = pathname.match(new RegExp(`^${base.replace(/\//g, "\\/")}\\/([^/]+)\\/edit$`));
    if (edit) {
      if (method === "GET") return editForm(req, res, session, edit[1]);
      if (method === "POST") return update(req, res, session, edit[1]);
    }
    const del = pathname.match(new RegExp(`^${base.replace(/\//g, "\\/")}\\/([^/]+)\\/delete$`));
    if (del && method === "POST") return remove(req, res, session, del[1]);
    return null;
  }

  return { list, newForm, create, editForm, update, remove, listActiveNames, route };
}

module.exports = { createTaxonomyRoutes };
