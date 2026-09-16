const { query } = require("../db");
const { readFormBody, slugify, esc, linesToArray } = require("../utils");
const { layout } = require("../render");

/* ============================================================
   List
   ============================================================ */
async function listAuthors(req, res, user) {
  let rows = [];
  let dbError = null;
  try {
    const result = await query(`SELECT id, slug, status, updated_at, data FROM authors ORDER BY updated_at DESC LIMIT 200`);
    rows = result.rows;
  } catch (err) {
    console.error("[authors] list failed:", err.message);
    dbError = err.message;
  }

  const tableRows = rows
    .map((a) => {
      const d = a.data || {};
      return `<tr>
        <td>
          ${d.photoUrl ? `<img src="${esc(d.photoUrl)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:10px;">` : ""}
          <a href="/admin/authors/${a.id}/edit" style="color:var(--color-primary);font-weight:600;">${esc(d.name || a.slug)}</a>
        </td>
        <td>${esc(d.roleTitle || "—")}</td>
        <td><span class="badge ${a.status === "active" ? "badge-published" : "badge-draft"}">${esc(a.status)}</span></td>
        <td>${new Date(a.updated_at).toLocaleDateString()}</td>
        <td>
          <a href="/admin/authors/${a.id}/edit" class="btn btn-secondary btn-sm">Edit</a>
          <form method="POST" action="/admin/authors/${a.id}/delete" style="display:inline;"
                onsubmit="return confirm('Delete this author? Posts already crediting them keep the plain author name — this only removes the rich profile.');">
            <button type="submit" class="btn btn-danger btn-sm">Delete</button>
          </form>
        </td>
      </tr>`;
    })
    .join("");

  const body = `
    <h1 class="page-title">Authors</h1>
    <p class="page-sub">${rows.length} author${rows.length === 1 ? "" : "s"}. Assign one to a post from the Blog Post editor to show a full credentialed Author Box (photo, role, experience) instead of a plain name.</p>
    ${dbError ? `<div class="alert alert-error">Database error: ${esc(dbError)}. Run <code>npm run migrate</code> if the "authors" table doesn't exist yet.</div>` : ""}

    <div class="toolbar">
      <div></div>
      <a href="/admin/authors/new" class="btn btn-primary">+ New Author</a>
    </div>

    <table class="data-table">
      <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead>
      <tbody>${tableRows || `<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted);padding:32px;">No authors yet — click "+ New Author" to add one.</td></tr>`}</tbody>
    </table>
  `;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Authors", activeNav: "authors", user, body }));
}

/* ============================================================
   Form (shared between New and Edit)
   ============================================================ */
function renderAuthorForm({ author = {}, errors = [], formAction, isEdit }) {
  const d = author.data || {};

  return `
    <h1 class="page-title">${isEdit ? "Edit Author" : "New Author"}</h1>
    <p class="page-sub">${isEdit ? esc(author.slug) : "The experience statement is the whole point of this profile — vague \u201Ctravel enthusiast\u201D copy defeats the purpose. Be concrete: number of tours taken, years covering Hawaii, etc."}</p>

    ${errors.length ? `<div class="alert alert-error">${errors.map(esc).join("<br>")}</div>` : ""}

    <form method="POST" action="${formAction}">
      <div class="form-card">
        <h2>General</h2>
        <div class="form-row">
          <div class="form-field"><label>Name</label><input type="text" name="name" required value="${esc(d.name || "")}"></div>
          <div class="form-field"><label>Slug</label><input type="text" name="slug" value="${esc(author.slug || "")}"><div class="hint">Leave blank on create to auto-generate from the name.</div></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>Role Title</label><input type="text" name="roleTitle" value="${esc(d.roleTitle || "")}" placeholder="e.g. Hawaii Tours Editor"></div>
          <div class="form-field"><label>Status</label>
            <select name="status">
              <option value="active" ${author.status !== "inactive" ? "selected" : ""}>Active</option>
              <option value="inactive" ${author.status === "inactive" ? "selected" : ""}>Inactive</option>
            </select>
          </div>
        </div>
      </div>

      <div class="form-card">
        <h2>Credentials</h2>
        <div class="form-row full">
          <div class="form-field">
            <label>Experience Statement (required — this is what makes the byline credible)</label>
            <textarea name="experienceStatement" required style="min-height:90px;">${esc(d.experienceStatement || "")}</textarea>
            <div class="hint">e.g. "Has personally taken 40+ Maui boat and snorkel tours since 2019 and interviewed 100+ travelers for this guide." Not: "Loves to travel."</div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>Stats Line (optional)</label><input type="text" name="statsLine" value="${esc(d.statsLine || "")}" placeholder="e.g. 34 guides written · 12 islands covered"></div>
          <div class="form-field"><label>Profile Link (optional)</label><input type="text" name="profileLink" value="${esc(d.profileLink || "")}" placeholder="https://..."></div>
        </div>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${isEdit ? "Save Changes" : "Create Author"}</button>
        <a href="/admin/authors" class="btn btn-secondary">Cancel</a>
      </div>
    </form>

    <div class="form-card">
      <h2>Photo</h2>
      ${
        !isEdit
          ? `<p class="hint">Save the author first — photo upload becomes available once it has an id.</p>`
          : `
        ${d.photoUrl ? `<img src="${esc(d.photoUrl)}" style="width:120px;height:120px;border-radius:50%;object-fit:cover;border:1px solid var(--color-border);margin-bottom:16px;display:block;">` : `<p class="hint" style="margin-bottom:16px;">No photo yet.</p>`}
        <form method="POST" action="/admin/authors/${author.id}/upload-photo" enctype="multipart/form-data">
          <div class="form-field">
            <label>Upload photo — jpg, png or webp, max 8MB (replaces the current one)</label>
            <input type="file" name="images" accept=".jpg,.jpeg,.png,.webp">
          </div>
          <button type="submit" class="btn btn-secondary" style="margin-top:10px;">Upload</button>
        </form>
      `
      }
    </div>
  `;
}

function bodyToAuthorData(body, existingData = {}) {
  return {
    name: (body.name || "").trim(),
    roleTitle: (body.roleTitle || "").trim(),
    experienceStatement: (body.experienceStatement || "").trim(),
    statsLine: (body.statsLine || "").trim(),
    profileLink: (body.profileLink || "").trim() || null,
    // Not edited by this form — preserved so uploading a photo never gets
    // wiped out by an unrelated content edit (same pattern as Tours gallery).
    photoUrl: existingData.photoUrl || null,
  };
}

/* ============================================================
   New
   ============================================================ */
async function newAuthorForm(req, res, user) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "New Author", activeNav: "authors", user, body: renderAuthorForm({ formAction: "/admin/authors/new", isEdit: false }) }));
}

async function createAuthor(req, res, user) {
  let body;
  try {
    body = await readFormBody(req);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "New Author", activeNav: "authors", user, body: renderAuthorForm({ formAction: "/admin/authors/new", isEdit: false, errors: ["Malformed request."] }) }));
    return;
  }

  const errors = [];
  if (!body.name || !body.name.trim()) errors.push("Name is required.");
  if (!body.experienceStatement || !body.experienceStatement.trim()) errors.push("Experience statement is required.");
  const slug = slugify(body.slug || body.name);
  if (!slug) errors.push("Could not generate a valid slug — please set one manually.");

  const data = bodyToAuthorData(body);
  const status = body.status === "inactive" ? "inactive" : "active";

  if (errors.length) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      layout({
        title: "New Author",
        activeNav: "authors",
        user,
        body: renderAuthorForm({ author: { slug, status, data }, errors, formAction: "/admin/authors/new", isEdit: false }),
      })
    );
    return;
  }

  try {
    await query(`INSERT INTO authors (slug, status, data) VALUES ($1, $2, $3)`, [slug, status, JSON.stringify(data)]);
  } catch (err) {
    console.error("[authors] create failed:", err.message);
    const dbErrors = err.code === "23505" ? ["An author with this slug already exists."] : [`Database error: ${err.message}`];
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      layout({
        title: "New Author",
        activeNav: "authors",
        user,
        body: renderAuthorForm({ author: { slug, status, data }, errors: dbErrors, formAction: "/admin/authors/new", isEdit: false }),
      })
    );
    return;
  }

  res.writeHead(302, { Location: "/admin/authors" });
  res.end();
}

/* ============================================================
   Edit / Update / Delete
   ============================================================ */
async function editAuthorForm(req, res, user, id) {
  let result;
  try {
    result = await query("SELECT * FROM authors WHERE id = $1", [id]);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Error", activeNav: "authors", user, body: `<div class="alert alert-error">Database error: ${esc(err.message)}</div>` }));
    return;
  }
  const author = result.rows[0];
  if (!author) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Not found", activeNav: "authors", user, body: `<div class="alert alert-error">Author not found.</div><a href="/admin/authors" class="btn btn-secondary">Back to Authors</a>` }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Edit Author", activeNav: "authors", user, body: renderAuthorForm({ author, formAction: `/admin/authors/${id}/edit`, isEdit: true }) }));
}

async function updateAuthor(req, res, user, id) {
  let body;
  try {
    body = await readFormBody(req);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end("Malformed request.");
    return;
  }

  let existing;
  try {
    const existingResult = await query("SELECT data FROM authors WHERE id = $1", [id]);
    existing = existingResult.rows[0];
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Error", activeNav: "authors", user, body: `<div class="alert alert-error">Database error: ${esc(err.message)}</div>` }));
    return;
  }
  if (!existing) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Not found", activeNav: "authors", user, body: `<div class="alert alert-error">Author not found.</div><a href="/admin/authors" class="btn btn-secondary">Back to Authors</a>` }));
    return;
  }

  const errors = [];
  if (!body.name || !body.name.trim()) errors.push("Name is required.");
  if (!body.experienceStatement || !body.experienceStatement.trim()) errors.push("Experience statement is required.");
  const slug = slugify(body.slug || body.name);
  if (!slug) errors.push("Could not generate a valid slug.");

  const data = bodyToAuthorData(body, existing.data || {});
  const status = body.status === "inactive" ? "inactive" : "active";

  if (errors.length) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      layout({
        title: "Edit Author",
        activeNav: "authors",
        user,
        body: renderAuthorForm({ author: { id, slug, status, data }, errors, formAction: `/admin/authors/${id}/edit`, isEdit: true }),
      })
    );
    return;
  }

  try {
    await query(`UPDATE authors SET slug = $1, status = $2, data = $3, updated_at = now() WHERE id = $4`, [slug, status, JSON.stringify(data), id]);
  } catch (err) {
    console.error("[authors] update failed:", err.message);
    const dbErrors = err.code === "23505" ? ["Another author already uses this slug."] : [`Database error: ${err.message}`];
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      layout({
        title: "Edit Author",
        activeNav: "authors",
        user,
        body: renderAuthorForm({ author: { id, slug, status, data }, errors: dbErrors, formAction: `/admin/authors/${id}/edit`, isEdit: true }),
      })
    );
    return;
  }

  res.writeHead(302, { Location: "/admin/authors" });
  res.end();
}

async function deleteAuthor(req, res, user, id) {
  try {
    await query("DELETE FROM authors WHERE id = $1", [id]);
  } catch (err) {
    console.error("[authors] delete failed:", err.message);
  }
  res.writeHead(302, { Location: "/admin/authors" });
  res.end();
}

/* ============================================================
   Photo upload
   ============================================================ */
async function uploadAuthorPhoto(req, res, user, id) {
  const { parseImageUpload } = require("../upload");

  let existing;
  try {
    const result = await query("SELECT slug, data FROM authors WHERE id = $1", [id]);
    existing = result.rows[0];
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`Database error: ${esc(err.message)}`);
    return;
  }
  if (!existing) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end("Author not found.");
    return;
  }

  let uploadResult;
  try {
    uploadResult = await parseImageUpload(req, "authors", existing.slug);
  } catch (err) {
    console.error("[authors] photo upload parse failed:", err.message);
    res.writeHead(302, { Location: `/admin/authors/${id}/edit` });
    res.end();
    return;
  }

  if (uploadResult.urls.length > 0) {
    const data = existing.data || {};
    data.photoUrl = uploadResult.urls[0]; // single photo — replaces any previous one
    try {
      await query("UPDATE authors SET data = $1, updated_at = now() WHERE id = $2", [JSON.stringify(data), id]);
    } catch (err) {
      console.error("[authors] saving photo url failed:", err.message);
    }
  }

  res.writeHead(302, { Location: `/admin/authors/${id}/edit` });
  res.end();
}

/**
 * Used by blogRoutes.js to populate the Author dropdown on the Post form.
 * Returns [{slug, name}] for active authors only.
 */
async function listActiveAuthorsForDropdown() {
  try {
    const result = await query(`SELECT slug, data FROM authors WHERE status = 'active' ORDER BY (data->>'name') ASC`);
    return result.rows.map((r) => ({ slug: r.slug, name: (r.data && r.data.name) || r.slug }));
  } catch (err) {
    console.error("[authors] listActiveAuthorsForDropdown failed:", err.message);
    return [];
  }
}

module.exports = {
  listAuthors, newAuthorForm, createAuthor, editAuthorForm, updateAuthor, deleteAuthor,
  uploadAuthorPhoto, listActiveAuthorsForDropdown,
};
