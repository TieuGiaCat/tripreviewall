const { query } = require("../db");
const { readFormBody, slugify, esc, linesToArray } = require("../utils");
const { layout } = require("../render");

const CATEGORIES = ["Island Guides", "Tour Reviews by Type", "Planning & Comparisons", "Booking & Practical Info", "Real Traveler Reviews & Data"];
const ISLANDS = ["", "Oahu", "Maui", "Kauai", "Big Island"];
const FORMATS = ["listicle", "comparison", "deep_dive_review", "honest_take"];

/* ============================================================
   List
   ============================================================ */
async function listPosts(req, res, user, urlObj) {
  const search = (urlObj.searchParams.get("q") || "").trim();
  const statusFilter = urlObj.searchParams.get("status") || "";

  const conditions = [];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(data->>'title' ILIKE $${params.length} OR slug ILIKE $${params.length})`);
  }
  if (statusFilter === "draft" || statusFilter === "published") {
    params.push(statusFilter);
    conditions.push(`status = $${params.length}`);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  let rows = [];
  let dbError = null;
  try {
    const result = await query(
      `SELECT id, slug, status, category, island_tag, updated_at, data
       FROM posts ${whereClause}
       ORDER BY updated_at DESC
       LIMIT 100`,
      params
    );
    rows = result.rows;
  } catch (err) {
    console.error("[posts] list query failed:", err.message);
    dbError = err.message;
  }

  const tableRows = rows
    .map((p) => {
      const title = (p.data && p.data.title) || p.slug;
      const author = p.data && p.data.authorName;
      return `<tr>
        <td><a href="/admin/posts/${p.id}/edit" style="color:var(--color-primary);font-weight:600;">${esc(title)}</a><br>
            <span style="color:var(--color-text-muted);font-size:12px;">${esc(p.slug)}</span></td>
        <td>${esc(p.category || "—")}</td>
        <td>${esc(author || "—")}</td>
        <td><span class="badge ${p.status === "published" ? "badge-published" : "badge-draft"}">${esc(p.status)}</span></td>
        <td>${new Date(p.updated_at).toLocaleDateString()}</td>
        <td>
          <a href="/admin/posts/${p.id}/edit" class="btn btn-secondary btn-sm">Edit</a>
          <form method="POST" action="/admin/posts/${p.id}/delete" style="display:inline;"
                onsubmit="return confirm('Delete this post? This cannot be undone.');">
            <button type="submit" class="btn btn-danger btn-sm">Delete</button>
          </form>
        </td>
      </tr>`;
    })
    .join("");

  const body = `
    <h1 class="page-title">Blog Posts</h1>
    <p class="page-sub">${rows.length} post${rows.length === 1 ? "" : "s"} shown (max 100).</p>
    ${dbError ? `<div class="alert alert-error">Database error: ${esc(dbError)}. Run <code>npm run migrate</code> if the "posts" table doesn't exist yet.</div>` : ""}

    <div class="toolbar">
      <form method="GET" action="/admin/posts" style="display:flex;gap:8px;">
        <input type="search" name="q" placeholder="Search by title or slug…" value="${esc(search)}">
        <select name="status" style="padding:8px 12px;border:1px solid var(--color-border);border-radius:4px;">
          <option value="">All statuses</option>
          <option value="published" ${statusFilter === "published" ? "selected" : ""}>Published</option>
          <option value="draft" ${statusFilter === "draft" ? "selected" : ""}>Draft</option>
        </select>
        <button type="submit" class="btn btn-secondary">Filter</button>
      </form>
      <a href="/admin/posts/new" class="btn btn-primary">+ New Post</a>
    </div>

    <table class="data-table">
      <thead><tr><th>Title</th><th>Category</th><th>Author</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead>
      <tbody>${tableRows || `<tr><td colspan="6" style="text-align:center;color:var(--color-text-muted);padding:32px;">No posts yet — click "+ New Post" to write your first one.</td></tr>`}</tbody>
    </table>
  `;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Blog Posts", activeNav: "blog", user, body }));
}

/* ============================================================
   Form (shared between New and Edit)
   ============================================================ */
function renderPostForm({ post = {}, errors = [], formAction, isEdit }) {
  const d = post.data || {};

  const categoryOptions = CATEGORIES.map(
    (c) => `<option value="${esc(c)}" ${post.category === c ? "selected" : ""}>${esc(c)}</option>`
  ).join("");
  const islandOptions = ISLANDS.map(
    (i) => `<option value="${esc(i)}" ${post.island_tag === i ? "selected" : ""}>${i || "— None —"}</option>`
  ).join("");
  const formatOptions = FORMATS.map(
    (f) => `<option value="${f}" ${post.content_format === f ? "selected" : ""}>${f.replace(/_/g, " ")}</option>`
  ).join("");

  return `
    <h1 class="page-title">${isEdit ? "Edit Post" : "New Post"}</h1>
    <p class="page-sub">${isEdit ? esc(post.slug) : "Body is plain text for now — paragraphs render as-is on the public page."}</p>

    ${errors.length ? `<div class="alert alert-error">${errors.map(esc).join("<br>")}</div>` : ""}

    <form method="POST" action="${formAction}">
      <div class="form-card">
        <h2>General</h2>
        <div class="form-row">
          <div class="form-field"><label>Title</label><input type="text" name="title" required value="${esc(d.title || "")}"></div>
          <div class="form-field"><label>Slug</label><input type="text" name="slug" value="${esc(post.slug || "")}"><div class="hint">Leave blank on create to auto-generate from the title.</div></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>Category</label><select name="category"><option value="">— Select —</option>${categoryOptions}</select></div>
          <div class="form-field"><label>Island Tag (optional)</label><select name="islandTag">${islandOptions}</select></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>Content Format</label><select name="contentFormat">${formatOptions}</select></div>
          <div class="form-field"><label>Status</label>
            <select name="status">
              <option value="draft" ${post.status !== "published" ? "selected" : ""}>Draft</option>
              <option value="published" ${post.status === "published" ? "selected" : ""}>Published</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>Author Name</label><input type="text" name="authorName" value="${esc(d.authorName || "")}"></div>
          <div class="form-field"><label>Read Time (minutes)</label><input type="number" min="1" name="readTimeMinutes" value="${esc(d.readTimeMinutes != null ? d.readTimeMinutes : "")}"></div>
        </div>
      </div>

      <div class="form-card">
        <h2>Content</h2>
        <div class="form-row full">
          <div class="form-field"><label>Excerpt (shown on the article grid card)</label><textarea name="excerpt" style="min-height:70px;">${esc(d.excerpt || "")}</textarea></div>
        </div>
        <div class="form-row full">
          <div class="form-field"><label>Body</label><textarea name="body" style="min-height:320px;">${esc(d.body || "")}</textarea><div class="hint">Plain text — line breaks become paragraphs. A rich-text editor is a future upgrade, not built yet.</div></div>
        </div>
        <div class="form-row full">
          <div class="form-field"><label>Tags (comma-separated)</label><input type="text" name="tags" value="${esc((d.tags || []).join(", "))}"></div>
        </div>
      </div>

      <div class="form-card">
        <h2>Disclosure &amp; Internal Links</h2>
        <div class="form-row full">
          <div class="form-field"><label>Affiliate Disclosure Text</label><textarea name="disclosureText" style="min-height:60px;">${esc(d.disclosureText || "This guide contains affiliate links. If you book through one, we may earn a commission — it never affects our ratings or what we choose to feature.")}</textarea></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>Related Tour Slug (optional — for inline Tour Card embed)</label><input type="text" name="relatedTourSlug" value="${esc(d.relatedTourSlug || "")}" placeholder="e.g. unique-maui-tours-road-to-hana"></div>
        </div>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${isEdit ? "Save Changes" : "Create Post"}</button>
        <a href="/admin/posts" class="btn btn-secondary">Cancel</a>
      </div>
    </form>

    <div class="form-card">
      <h2>Featured Image</h2>
      ${
        !isEdit
          ? `<p class="hint">Save the post first — image upload becomes available once it has an id.</p>`
          : `
        ${d.featuredImage ? `<img src="${esc(d.featuredImage)}" style="max-width:320px;border-radius:4px;border:1px solid var(--color-border);margin-bottom:16px;display:block;">` : `<p class="hint" style="margin-bottom:16px;">No featured image yet.</p>`}
        <form method="POST" action="/admin/posts/${post.id}/upload-image" enctype="multipart/form-data">
          <div class="form-field">
            <label>Upload featured image — jpg, png or webp, max 8MB (replaces the current one)</label>
            <input type="file" name="images" accept=".jpg,.jpeg,.png,.webp">
          </div>
          <button type="submit" class="btn btn-secondary" style="margin-top:10px;">Upload</button>
        </form>
      `
      }
    </div>
  `;
}

function bodyToPostData(body, existingData = {}) {
  return {
    title: (body.title || "").trim(),
    excerpt: (body.excerpt || "").trim(),
    authorName: (body.authorName || "").trim(),
    readTimeMinutes: body.readTimeMinutes !== "" ? Number(body.readTimeMinutes) : null,
    body: (body.body || "").trim(),
    tags: (body.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
    disclosureText: (body.disclosureText || "").trim(),
    relatedTourSlug: (body.relatedTourSlug || "").trim(),
    // Not edited by this form — preserved so uploading a featured image
    // never gets wiped out by an unrelated content edit.
    featuredImage: existingData.featuredImage || null,
  };
}

/* ============================================================
   New
   ============================================================ */
async function newPostForm(req, res, user) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "New Post", activeNav: "blog", user, body: renderPostForm({ formAction: "/admin/posts/new", isEdit: false }) }));
}

async function createPost(req, res, user) {
  let body;
  try {
    body = await readFormBody(req);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "New Post", activeNav: "blog", user, body: renderPostForm({ formAction: "/admin/posts/new", isEdit: false, errors: ["Malformed request."] }) }));
    return;
  }

  const errors = [];
  if (!body.title || !body.title.trim()) errors.push("Title is required.");
  const slug = slugify(body.slug || body.title);
  if (!slug) errors.push("Could not generate a valid slug — please set one manually.");

  const data = bodyToPostData(body);
  const status = body.status === "published" ? "published" : "draft";
  const category = CATEGORIES.includes(body.category) ? body.category : null;
  const islandTag = ISLANDS.includes(body.islandTag) && body.islandTag ? body.islandTag : null;
  const contentFormat = FORMATS.includes(body.contentFormat) ? body.contentFormat : "listicle";

  if (errors.length) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      layout({
        title: "New Post",
        activeNav: "blog",
        user,
        body: renderPostForm({ post: { slug, status, category, island_tag: islandTag, content_format: contentFormat, data }, errors, formAction: "/admin/posts/new", isEdit: false }),
      })
    );
    return;
  }

  try {
    await query(
      `INSERT INTO posts (slug, status, category, island_tag, content_format, published_at, created_by, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [slug, status, category, islandTag, contentFormat, status === "published" ? new Date() : null, user.userId, JSON.stringify(data)]
    );
  } catch (err) {
    console.error("[posts] create failed:", err.message);
    const dbErrors = err.code === "23505" ? ["A post with this slug already exists."] : [`Database error: ${err.message}`];
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      layout({
        title: "New Post",
        activeNav: "blog",
        user,
        body: renderPostForm({ post: { slug, status, category, island_tag: islandTag, content_format: contentFormat, data }, errors: dbErrors, formAction: "/admin/posts/new", isEdit: false }),
      })
    );
    return;
  }

  res.writeHead(302, { Location: "/admin/posts" });
  res.end();
}

/* ============================================================
   Edit / Update / Delete
   ============================================================ */
async function editPostForm(req, res, user, id) {
  let result;
  try {
    result = await query("SELECT * FROM posts WHERE id = $1", [id]);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Error", activeNav: "blog", user, body: `<div class="alert alert-error">Database error: ${esc(err.message)}</div>` }));
    return;
  }
  const post = result.rows[0];
  if (!post) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Not found", activeNav: "blog", user, body: `<div class="alert alert-error">Post not found.</div><a href="/admin/posts" class="btn btn-secondary">Back to Posts</a>` }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Edit Post", activeNav: "blog", user, body: renderPostForm({ post, formAction: `/admin/posts/${id}/edit`, isEdit: true }) }));
}

async function updatePost(req, res, user, id) {
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
    const existingResult = await query("SELECT data FROM posts WHERE id = $1", [id]);
    existing = existingResult.rows[0];
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Error", activeNav: "blog", user, body: `<div class="alert alert-error">Database error: ${esc(err.message)}</div>` }));
    return;
  }
  if (!existing) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Not found", activeNav: "blog", user, body: `<div class="alert alert-error">Post not found.</div><a href="/admin/posts" class="btn btn-secondary">Back to Posts</a>` }));
    return;
  }

  const errors = [];
  if (!body.title || !body.title.trim()) errors.push("Title is required.");
  const slug = slugify(body.slug || body.title);
  if (!slug) errors.push("Could not generate a valid slug.");

  const data = bodyToPostData(body, existing.data || {});
  const status = body.status === "published" ? "published" : "draft";
  const category = CATEGORIES.includes(body.category) ? body.category : null;
  const islandTag = ISLANDS.includes(body.islandTag) && body.islandTag ? body.islandTag : null;
  const contentFormat = FORMATS.includes(body.contentFormat) ? body.contentFormat : "listicle";

  if (errors.length) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      layout({
        title: "Edit Post",
        activeNav: "blog",
        user,
        body: renderPostForm({ post: { id, slug, status, category, island_tag: islandTag, content_format: contentFormat, data }, errors, formAction: `/admin/posts/${id}/edit`, isEdit: true }),
      })
    );
    return;
  }

  try {
    await query(
      `UPDATE posts SET slug = $1, status = $2, category = $3, island_tag = $4, content_format = $5,
       published_at = CASE WHEN $2 = 'published' AND published_at IS NULL THEN now() ELSE published_at END,
       updated_at = now(), data = $6
       WHERE id = $7`,
      [slug, status, category, islandTag, contentFormat, JSON.stringify(data), id]
    );
  } catch (err) {
    console.error("[posts] update failed:", err.message);
    const dbErrors = err.code === "23505" ? ["Another post already uses this slug."] : [`Database error: ${err.message}`];
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      layout({
        title: "Edit Post",
        activeNav: "blog",
        user,
        body: renderPostForm({ post: { id, slug, status, category, island_tag: islandTag, content_format: contentFormat, data }, errors: dbErrors, formAction: `/admin/posts/${id}/edit`, isEdit: true }),
      })
    );
    return;
  }

  res.writeHead(302, { Location: "/admin/posts" });
  res.end();
}

async function deletePost(req, res, user, id) {
  try {
    await query("DELETE FROM posts WHERE id = $1", [id]);
  } catch (err) {
    console.error("[posts] delete failed:", err.message);
  }
  res.writeHead(302, { Location: "/admin/posts" });
  res.end();
}

/* ============================================================
   Featured image upload
   ============================================================ */
async function uploadPostImage(req, res, user, id) {
  const { parseImageUpload } = require("../upload");

  let existing;
  try {
    const result = await query("SELECT slug, data FROM posts WHERE id = $1", [id]);
    existing = result.rows[0];
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`Database error: ${esc(err.message)}`);
    return;
  }
  if (!existing) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end("Post not found.");
    return;
  }

  let uploadResult;
  try {
    uploadResult = await parseImageUpload(req, "posts", existing.slug);
  } catch (err) {
    console.error("[posts] image upload parse failed:", err.message);
    res.writeHead(302, { Location: `/admin/posts/${id}/edit` });
    res.end();
    return;
  }

  if (uploadResult.urls.length > 0) {
    const data = existing.data || {};
    data.featuredImage = uploadResult.urls[0]; // single featured image — replaces any previous one
    try {
      await query("UPDATE posts SET data = $1, updated_at = now() WHERE id = $2", [JSON.stringify(data), id]);
    } catch (err) {
      console.error("[posts] saving featured image url failed:", err.message);
    }
  }

  res.writeHead(302, { Location: `/admin/posts/${id}/edit` });
  res.end();
}

module.exports = { listPosts, newPostForm, createPost, editPostForm, updatePost, deletePost, uploadPostImage };
