const { query } = require("../db");
const { readFormBody, slugify, esc, linesToArray } = require("../utils");
const { layout, paginationHtml } = require("../render");
const { generatePostFile, removePostFile, isReservedSlug, regenerateListingPages } = require("../ssr/generator");
const { listActiveAuthorsForDropdown } = require("./authorsRoutes");
const { listActiveCategoryNames } = require("./categoriesRoutes");

const ISLANDS = ["", "Oahu", "Maui", "Kauai", "Big Island"];
const FORMATS = ["listicle", "comparison", "deep_dive_review", "honest_take"];

/* ============================================================
   List
   ============================================================ */
async function listPosts(req, res, user, urlObj) {
  const search = (urlObj.searchParams.get("q") || "").trim();
  const statusFilter = urlObj.searchParams.get("status") || "";
  const page = Math.max(1, parseInt(urlObj.searchParams.get("page"), 10) || 1);
  const PAGE_SIZE = 10;

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
  let totalCount = 0;
  let dbError = null;
  try {
    const countResult = await query(`SELECT count(*)::int AS n FROM posts ${whereClause}`, params);
    totalCount = countResult.rows[0].n;

    const result = await query(
      `SELECT id, slug, status, category, island_tag, updated_at, data
       FROM posts ${whereClause}
       ORDER BY updated_at DESC
       LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
      params
    );
    rows = result.rows;
  } catch (err) {
    console.error("[posts] list query failed:", err.message);
    dbError = err.message;
  }
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

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
    <p class="page-sub">${totalCount} post${totalCount === 1 ? "" : "s"} total — showing ${rows.length ? (page - 1) * PAGE_SIZE + 1 : 0}–${(page - 1) * PAGE_SIZE + rows.length}.</p>
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
      <a href="/admin/categories" class="btn btn-secondary">Manage Categories</a>
    </div>

    <table class="data-table">
      <thead><tr><th>Title</th><th>Category</th><th>Author</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead>
      <tbody>${tableRows || `<tr><td colspan="6" style="text-align:center;color:var(--color-text-muted);padding:32px;">No posts yet — click "+ New Post" to write your first one.</td></tr>`}</tbody>
    </table>
    ${paginationHtml(page, totalPages, "/admin/posts", { q: search, status: statusFilter })}
  `;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Blog Posts", activeNav: "blog", user, body }));
}

/* ============================================================
   Form (shared between New and Edit)
   ============================================================ */
const QUILL_CDN_CSS = '<link href="https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.snow.css" rel="stylesheet">';
const QUILL_CDN_JS = "https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.min.js";

/**
 * Builds the <head> link + end-of-body <script> needed for the Quill
 * rich-text editor on a post form. `postId` is null on the New Post form
 * (image insertion is disabled there — a post needs an id to upload to).
 */
function quillAssets(postId, initialBodyHtml) {
  const b64 = Buffer.from(initialBodyHtml || "", "utf8").toString("base64");
  const head = QUILL_CDN_CSS;
  const scripts = `
<script src="${QUILL_CDN_JS}"></script>
<script>
(function () {
  function b64DecodeUnicode(str) {
    return decodeURIComponent(Array.prototype.map.call(atob(str), function (c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
  }

  // Quill has no native table support — register a simple custom embed
  // block that stores the table's data as JSON on the node and renders it
  // as plain HTML. Not editable cell-by-cell inside Quill (re-open the
  // insert dialog to change it) — but the saved body HTML (read directly
  // via quill.root.innerHTML on submit, never through Quill's own
  // HTML export) contains a completely normal <table>, so it displays
  // and reads correctly on the live article regardless of this limitation.
  var BlockEmbed = Quill.import('blots/block/embed');
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function buildComparisonTableHtml(value) {
    var headHtml = '<tr>' + value.headers.map(function (h) { return '<th>' + escHtml(h) + '</th>'; }).join('') + '</tr>';
    var bodyHtml = value.rows.map(function (row) {
      return '<tr>' + row.map(function (cell) { return '<td>' + escHtml(cell) + '</td>'; }).join('') + '</tr>';
    }).join('');
    return '<table class="comparison-table"><thead>' + headHtml + '</thead><tbody>' + bodyHtml + '</tbody></table>';
  }
  class ComparisonTableBlot extends BlockEmbed {
    static create(value) {
      var node = super.create();
      node.setAttribute('contenteditable', 'false');
      node.setAttribute('data-table-json', JSON.stringify(value));
      node.innerHTML = buildComparisonTableHtml(value);
      return node;
    }
    static value(node) {
      try { return JSON.parse(node.getAttribute('data-table-json')); } catch (e) { return null; }
    }
  }
  ComparisonTableBlot.blotName = 'comparisonTable';
  ComparisonTableBlot.tagName = 'div';
  ComparisonTableBlot.className = 'ql-comparison-table-wrapper';
  Quill.register(ComparisonTableBlot);
  Quill.import('ui/icons').comparisonTable = '&#9638;';

  var quill = new Quill('#quill-editor', {
    theme: 'snow',
    modules: {
      toolbar: [
        ['bold', 'italic', 'underline'],
        ['blockquote'],
        [{ header: [2, 3, false] }],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link', 'image'],
        ['comparisonTable'],
        ['clean']
      ]
    }
  });
  var initialHtml = "${b64}" ? b64DecodeUnicode("${b64}") : "";
  if (initialHtml) quill.root.innerHTML = initialHtml;

  var postId = ${postId ? `"${postId}"` : "null"};
  quill.getModule('toolbar').addHandler('image', function () {
    if (!postId) {
      alert('Save this post first, then come back to insert images.');
      return;
    }
    var input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', '.jpg,.jpeg,.png,.webp');
    input.click();
    input.onchange = function () {
      var file = input.files[0];
      if (!file) return;
      var formData = new FormData();
      formData.append('images', file);
      fetch('/admin/posts/' + postId + '/upload-inline-image', { method: 'POST', body: formData })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.url) {
            var range = quill.getSelection(true) || { index: quill.getLength() };
            quill.insertEmbed(range.index, 'image', data.url);
            quill.setSelection(range.index + 1);
            var altText = prompt('Alt text for this image (describe it for SEO and screen readers):', '');
            if (altText) {
              var imgs = quill.root.querySelectorAll('img[src="' + data.url + '"]');
              var justInserted = imgs[imgs.length - 1];
              if (justInserted) justInserted.setAttribute('alt', altText);
            }
          } else {
            alert('Upload failed: ' + (data.error || 'unknown error'));
          }
        })
        .catch(function () { alert('Upload failed — check your connection and try again.'); });
    };
  });

  quill.getModule('toolbar').addHandler('comparisonTable', function () {
    var input = prompt(
      'Enter table data.\\n\\nFirst line = column headers. Then one row per line.\\nSeparate columns with a | character.\\n\\nExample:\\nFeature | Option A | Option B\\nPrice | $50 | $75\\nDuration | 2 hours | 4 hours',
      'Feature | Option A | Option B\\n | | '
    );
    if (!input) return;
    var lines = input.split('\\n')
      .map(function (l) { return l.split('|').map(function (c) { return c.trim(); }); })
      .filter(function (l) { return l.length > 0 && l.some(function (c) { return c !== ''; }); });
    if (lines.length < 2) {
      alert('Need at least a header row and one data row.');
      return;
    }
    var value = { headers: lines[0], rows: lines.slice(1) };
    var range = quill.getSelection(true) || { index: quill.getLength() };
    quill.insertEmbed(range.index, 'comparisonTable', value, 'user');
    quill.setSelection(range.index + 1);
  });

  var form = document.getElementById('quill-editor').closest('form');
  form.addEventListener('submit', function () {
    document.getElementById('body-hidden-input').value = quill.root.innerHTML;
  });
})();
</script>`;
  return { head, scripts };
}

function renderPostForm({ post = {}, errors = [], formAction, isEdit, authorsList = [], categoriesList = [] }) {
  const d = post.data || {};

  const categoryOptions = categoriesList.map(
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
          <div class="form-field"><label>Category</label><select name="category"><option value="">— Select —</option>${categoryOptions}</select><div class="hint"><a href="/admin/categories" target="_blank">Manage categories →</a></div></div>
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
          <div class="form-field">
            <label>Author (optional — select to show a full credentialed Author Box on the page)</label>
            <select name="authorSlug">
              <option value="">— Plain name only (below) —</option>
              ${(authorsList || []).map((a) => `<option value="${esc(a.slug)}" ${d.authorSlug === a.slug ? "selected" : ""}>${esc(a.name)}</option>`).join("")}
            </select>
            <div class="hint">Manage authors under Authors in the sidebar.</div>
          </div>
          <div class="form-field"><label>Author Name (used if no Author selected above)</label><input type="text" name="authorName" value="${esc(d.authorName || "")}"></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>Read Time (minutes)</label><input type="number" min="1" name="readTimeMinutes" value="${esc(d.readTimeMinutes != null ? d.readTimeMinutes : "")}"></div>
        </div>
      </div>

      <div class="form-card">
        <h2>SEO</h2>
        <div class="form-row">
          <div class="form-field"><label>Meta Title (optional — falls back to Title above)</label><input type="text" name="metaTitle" value="${esc(d.metaTitle || "")}" maxlength="70"></div>
          <div class="form-field"><label>Meta Description (optional — falls back to Excerpt below)</label><input type="text" name="metaDescription" value="${esc(d.metaDescription || "")}" maxlength="160"></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>Canonical URL Override (optional — leave blank unless this content is duplicated elsewhere)</label><input type="text" name="canonicalUrl" value="${esc(d.canonicalUrl || "")}" placeholder="https://tripreviewall.com/blog/..."></div>
          <div class="form-field">
            <label style="display:flex;align-items:center;gap:8px;font-weight:600;">
              <input type="checkbox" name="featuredPillar" value="1" ${d.featuredPillar ? "checked" : ""} style="width:auto;">
              Featured Pillar (show in the "Start Here" band on the Blog page)
            </label>
          </div>
        </div>
      </div>

      <div class="form-card">
        <h2>Content</h2>
        <div class="form-row full">
          <div class="form-field"><label>Excerpt (shown on the article grid card)</label><textarea name="excerpt" style="min-height:70px;">${esc(d.excerpt || "")}</textarea></div>
        </div>
        <div class="form-row full">
          <div class="form-field">
            <label>Body</label>
            <div id="quill-editor" style="background:#fff;height:400px;margin-bottom:42px;"></div>
            <textarea name="body" id="body-hidden-input" style="display:none;"></textarea>
            <div class="hint">${isEdit ? "Use the toolbar to insert images anywhere in the article." : "Image insertion is available after you save this post the first time."}</div>
          </div>
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
          <button type="button" class="btn btn-secondary" style="margin-top:10px;" onclick="openMediaPicker('post', '${post.id}')">Browse Existing Images</button>
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
    authorSlug: (body.authorSlug || "").trim() || null,
    authorName: (body.authorName || "").trim(),
    readTimeMinutes: body.readTimeMinutes !== "" ? Number(body.readTimeMinutes) : null,
    body: (body.body || "").trim(),
    tags: (body.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
    disclosureText: (body.disclosureText || "").trim(),
    relatedTourSlug: (body.relatedTourSlug || "").trim(),
    metaTitle: (body.metaTitle || "").trim() || null,
    metaDescription: (body.metaDescription || "").trim() || null,
    canonicalUrl: (body.canonicalUrl || "").trim() || null,
    featuredPillar: body.featuredPillar === "1",
    // Not edited by this form — preserved so uploading a featured image
    // never gets wiped out by an unrelated content edit.
    featuredImage: existingData.featuredImage || null,
  };
}

/* ============================================================
   New
   ============================================================ */
async function newPostForm(req, res, user) {
  const authorsList = await listActiveAuthorsForDropdown();
  const categoriesList = await listActiveCategoryNames();
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  const qa = quillAssets(null, "");
  res.end(layout({ title: "New Post", activeNav: "blog", user, body: renderPostForm({ formAction: "/admin/posts/new", isEdit: false, authorsList, categoriesList }), extraHead: qa.head, extraScripts: qa.scripts }));
}

async function createPost(req, res, user) {
  const authorsList = await listActiveAuthorsForDropdown();
  const categoriesList = await listActiveCategoryNames();
  let body;
  try {
    body = await readFormBody(req);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    const qa0 = quillAssets(null, "");
    res.end(layout({ title: "New Post", activeNav: "blog", user, body: renderPostForm({ formAction: "/admin/posts/new", isEdit: false, errors: ["Malformed request."], authorsList, categoriesList }), extraHead: qa0.head, extraScripts: qa0.scripts }));
    return;
  }

  const errors = [];
  if (!body.title || !body.title.trim()) errors.push("Title is required.");
  const slug = slugify(body.slug || body.title);
  if (!slug) errors.push("Could not generate a valid slug — please set one manually.");
  if (isReservedSlug(slug)) errors.push(`"${slug}" is a reserved page name — please choose a different slug.`);

  const data = bodyToPostData(body);
  const status = body.status === "published" ? "published" : "draft";
  const category = (body.category || "").trim() || null;
  const islandTag = ISLANDS.includes(body.islandTag) && body.islandTag ? body.islandTag : null;
  const contentFormat = FORMATS.includes(body.contentFormat) ? body.contentFormat : "listicle";

  if (errors.length) {
    const qa1 = quillAssets(null, data.body);
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      layout({
        title: "New Post",
        activeNav: "blog",
        user,
        body: renderPostForm({ post: { slug, status, category, island_tag: islandTag, content_format: contentFormat, data }, errors, formAction: "/admin/posts/new", isEdit: false, authorsList, categoriesList }),
        extraHead: qa1.head,
        extraScripts: qa1.scripts,
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
    if (status === "published") {
      await generatePostFile({ slug, status, category, island_tag: islandTag, content_format: contentFormat, published_at: new Date(), updated_at: new Date(), data });
      await regenerateListingPages();
    }
  } catch (err) {
    console.error("[posts] create failed:", err.message);
    const dbErrors = err.code === "23505" ? ["A post with this slug already exists."] : [`Database error: ${err.message}`];
    const qa2 = quillAssets(null, data.body);
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      layout({
        title: "New Post",
        activeNav: "blog",
        user,
        body: renderPostForm({ post: { slug, status, category, island_tag: islandTag, content_format: contentFormat, data }, errors: dbErrors, formAction: "/admin/posts/new", isEdit: false, authorsList, categoriesList }),
        extraHead: qa2.head,
        extraScripts: qa2.scripts,
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
  const authorsList = await listActiveAuthorsForDropdown();
  const categoriesList = await listActiveCategoryNames();
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  const qa3 = quillAssets(id, (post.data && post.data.body) || "");
  res.end(layout({ title: "Edit Post", activeNav: "blog", user, body: renderPostForm({ post, formAction: `/admin/posts/${id}/edit`, isEdit: true, authorsList, categoriesList }), extraHead: qa3.head, extraScripts: qa3.scripts }));
}

async function updatePost(req, res, user, id) {
  const authorsList = await listActiveAuthorsForDropdown();
  const categoriesList = await listActiveCategoryNames();
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
    const existingResult = await query("SELECT slug, status, data FROM posts WHERE id = $1", [id]);
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
  if (isReservedSlug(slug)) errors.push(`"${slug}" is a reserved page name — please choose a different slug.`);

  const data = bodyToPostData(body, existing.data || {});
  const status = body.status === "published" ? "published" : "draft";
  const category = (body.category || "").trim() || null;
  const islandTag = ISLANDS.includes(body.islandTag) && body.islandTag ? body.islandTag : null;
  const contentFormat = FORMATS.includes(body.contentFormat) ? body.contentFormat : "listicle";

  if (errors.length) {
    const qa4 = quillAssets(id, data.body);
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      layout({
        title: "Edit Post",
        activeNav: "blog",
        user,
        body: renderPostForm({ post: { id, slug, status, category, island_tag: islandTag, content_format: contentFormat, data }, errors, formAction: `/admin/posts/${id}/edit`, isEdit: true, authorsList, categoriesList }),
        extraHead: qa4.head,
        extraScripts: qa4.scripts,
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

    if (existing.slug !== slug) removePostFile(existing.slug);
    if (status === "published") {
      const fresh = await query("SELECT slug, status, category, island_tag, content_format, published_at, updated_at, data FROM posts WHERE id = $1", [id]);
      await generatePostFile(fresh.rows[0]);
    } else {
      removePostFile(slug);
    }
    await regenerateListingPages();
  } catch (err) {
    console.error("[posts] update failed:", err.message);
    const dbErrors = err.code === "23505" ? ["Another post already uses this slug."] : [`Database error: ${err.message}`];
    const qa5 = quillAssets(id, data.body);
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      layout({
        title: "Edit Post",
        activeNav: "blog",
        user,
        body: renderPostForm({ post: { id, slug, status, category, island_tag: islandTag, content_format: contentFormat, data }, errors: dbErrors, formAction: `/admin/posts/${id}/edit`, isEdit: true, authorsList, categoriesList }),
        extraHead: qa5.head,
        extraScripts: qa5.scripts,
      })
    );
    return;
  }

  res.writeHead(302, { Location: "/admin/posts" });
  res.end();
}

async function deletePost(req, res, user, id) {
  try {
    const result = await query("DELETE FROM posts WHERE id = $1 RETURNING slug", [id]);
    if (result.rows[0]) { removePostFile(result.rows[0].slug); await regenerateListingPages(); }
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
    const result = await query("SELECT slug, status, category, island_tag, content_format, data FROM posts WHERE id = $1", [id]);
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
      if (existing.status === "published") {
        const fresh = await query("SELECT slug, status, category, island_tag, content_format, published_at, updated_at, data FROM posts WHERE id = $1", [id]);
        await generatePostFile(fresh.rows[0]);
        await regenerateListingPages();
      }
    } catch (err) {
      console.error("[posts] saving featured image url failed:", err.message);
    }
  }

  res.writeHead(302, { Location: `/admin/posts/${id}/edit` });
  res.end();
}

/* ============================================================
   Inline image upload (Quill editor "insert image" button)
   ============================================================ */
async function uploadInlineImage(req, res, user, id) {
  const { parseImageUpload } = require("../upload");

  let existing;
  try {
    const result = await query("SELECT slug FROM posts WHERE id = $1", [id]);
    existing = result.rows[0];
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: err.message }));
    return;
  }
  if (!existing) {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Post not found." }));
    return;
  }

  let uploadResult;
  try {
    uploadResult = await parseImageUpload(req, "posts", existing.slug);
  } catch (err) {
    console.error("[posts] inline image upload parse failed:", err.message);
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Could not process the upload." }));
    return;
  }

  if (uploadResult.urls.length === 0) {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "No valid image file received (jpg/png/webp, max 8MB)." }));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ url: uploadResult.urls[0] }));
}

module.exports = { listPosts, newPostForm, createPost, editPostForm, updatePost, deletePost, uploadPostImage, uploadInlineImage };
