const { query } = require("../db");
const { readFormBody, slugify, esc, linesToArray } = require("../utils");
const { layout, paginationHtml } = require("../render");
const { generatePostFile, removePostFile, isReservedSlug, regenerateListingPages } = require("../ssr/generator");
const { listActiveAuthorsForDropdown } = require("./authorsRoutes");
const { listActiveCategoryNames } = require("./categoriesRoutes");
const { logAudit } = require("../auditLog");
const { seoPanelHtml, seoPanelAssets, usedKeyphrases, scoreFor, scoreDots, SeoAnalysis } = require("../lib/seoPanel");
const { docxToArticle } = require("../lib/docxToHtml");

// A post's Topic (Admin → Topics) is stored in the posts.island_tag column.
const { listActiveTopicNames } = require("./topicsRoutes");
/** Topic from the form: any active topic, or the value the post already had. */
function cleanTopic(value, topics, current = null) {
  const v = String(value || "").trim();
  if (!v) return null;
  return topics.includes(v) || v === current ? v : null;
}
const FORMATS = ["listicle", "comparison", "deep_dive_review", "honest_take"];

/* ============================================================
   List
   ============================================================ */
/* B5: if the public page couldn't be written, say so after saving. */
function collectGenErrors(list, result) {
  if (!result) return;
  if (result.error) list.push(result.error);
  if (Array.isArray(result.errors)) list.push(...result.errors);
}
function postsRedirect(genErrors) {
  return genErrors.length
    ? "/admin/posts?warn=" + encodeURIComponent("Saved, but the public page wasn't fully updated: " + genErrors.slice(0, 3).join(" · ") + " — check SITE_ROOT / disk space, then run npm run regenerate-all.")
    : "/admin/posts";
}

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
        <td>${esc(p.category || "—")}${p.island_tag ? `<br><span style="color:var(--color-text-muted);font-size:11px;">Topic: ${esc(p.island_tag)}</span>` : ""}</td>
        <td>${(() => { const sc = (p.data && p.data.seo) || withSeoScores(p.data || {}, p.slug, {}).seo; return scoreDots(sc.seoScore, sc.readabilityScore, p.data && p.data.focusKeyphrase); })()}${p.data && p.data.focusKeyphrase ? `<br><span style="color:var(--color-text-muted);font-size:11px;">${esc(p.data.focusKeyphrase)}</span>` : ""}</td>
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
    ${urlObj.searchParams.get("warn") ? `<div class="alert alert-error">⚠ ${esc(urlObj.searchParams.get("warn"))}</div>` : ""}

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
      <a href="/admin/topics" class="btn btn-secondary">Manage Topics</a>
    </div>

    <table class="data-table">
      <thead><tr><th>Title</th><th>Category</th><th title="SEO · Readability (saved when the post is saved)">SEO</th><th>Author</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead>
      <tbody>${tableRows || `<tr><td colspan="7" style="text-align:center;color:var(--color-text-muted);padding:32px;">No posts yet — click "+ New Post" to write your first one.</td></tr>`}</tbody>
    </table>
    ${paginationHtml(page, totalPages, "/admin/posts", { q: search, status: statusFilter })}
  `;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Blog Posts", activeNav: "blog", user, body }));
}

/* ============================================================
   Form (shared between New and Edit)
   ============================================================ */
// Quill is served from our own server (npm package "quill", route
// /admin/vendor/quill/* in server.js) so the admin doesn't run third-party
// CDN code. Falls back to the CDN only if the package isn't installed yet.
function quillLocal() {
  try { require.resolve("quill/dist/quill.min.js"); return true; } catch (e) { return false; }
}
function quillCss() {
  return quillLocal()
    ? '<link href="/admin/vendor/quill/quill.snow.css" rel="stylesheet">'
    : '<link href="https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.snow.css" rel="stylesheet" crossorigin="anonymous">';
}
function quillJsSrc() {
  return quillLocal() ? "/admin/vendor/quill/quill.min.js" : "https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.min.js";
}

/**
 * Editor scripts for the post form.
 *
 * Two editing modes for the body:
 *   • Visual  — the Quill editor (simple posts written in the admin)
 *   • Formatted HTML — the article HTML as-is, with a live preview of the real
 *     page. Imported Word files use this mode, because Quill would strip their
 *     tables, quick-answer box, callouts and FAQ blocks.
 * The current mode is saved with the post (data.bodyMode).
 */
function editorAssets(postId, initialBodyHtml, bodyMode) {
  const b64 = Buffer.from(initialBodyHtml || "", "utf8").toString("base64");
  const head = quillCss();
  const scripts = `
<script src="${quillJsSrc()}"></script>
<script>
(function () {
  function b64DecodeUnicode(str) {
    return decodeURIComponent(Array.prototype.map.call(atob(str), function (c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // If the Quill script couldn't load, the form still works in Formatted HTML mode.
  var hasQuill = typeof window.Quill !== 'undefined';
  var quill = null;
  if (hasQuill) {
  // Quill has no native table support — a custom block stores the table as
  // JSON and renders plain HTML (the saved body contains a normal <table>).
  var BlockEmbed = Quill.import('blots/block/embed');
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

  quill = new Quill('#quill-editor', {
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
  }

  var htmlArea = document.getElementById('body-html-editor');
  var modeInput = document.getElementById('body-mode-input');
  var mode = hasQuill ? ${JSON.stringify(bodyMode === "html" ? "html" : "visual")} : 'html';
  if (!hasQuill) {
    var vBtn = document.querySelector('[data-body-mode="visual"]');
    if (vBtn) { vBtn.disabled = true; vBtn.title = 'The visual editor could not be loaded'; }
  }
  var initialHtml = "${b64}" ? b64DecodeUnicode("${b64}") : "";
  if (mode === 'html') htmlArea.value = initialHtml;
  else if (initialHtml && quill) quill.root.innerHTML = initialHtml;

  var RICH = /class="[^"]*(answer-box|callout|table-scroll|faq-block|read-next|image-slot)/;
  function showMode(m) {
    mode = m;
    modeInput.value = m;
    document.getElementById('visual-editor-wrap').hidden = m !== 'visual';
    document.getElementById('html-editor-wrap').hidden = m !== 'html';
    document.querySelectorAll('[data-body-mode]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-body-mode') === m ? 'true' : 'false'); });
    if (window.SeoPanel) window.SeoPanel.refresh();
  }
  document.querySelectorAll('[data-body-mode]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = btn.getAttribute('data-body-mode');
      if (target === mode || (target === 'visual' && !quill)) return;
      if (target === 'visual') {
        if (RICH.test(htmlArea.value) && !confirm('The visual editor removes tables, the quick-answer box, callouts, FAQ blocks and image notes.\\n\\nKeep editing as formatted HTML instead?\\n(OK = switch anyway, Cancel = stay)')) return;
        quill.root.innerHTML = htmlArea.value;
      } else {
        htmlArea.value = quill.root.innerHTML;
      }
      showMode(target);
    });
  });
  showMode(mode);

  function currentHtml() { return mode === 'html' || !quill ? htmlArea.value : quill.root.innerHTML; }
  window.SeoPanelContent = currentHtml;
  if (quill) quill.on('text-change', function () { if (window.SeoPanel) window.SeoPanel.refresh(); });

  var postId = ${postId ? `"${postId}"` : "null"};
  function uploadImage(done) {
    if (!postId) { alert('Save this post first, then come back to insert images.'); return; }
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
        .then(function (data) { if (data.url) done(data.url); else alert('Upload failed: ' + (data.error || 'unknown error')); })
        .catch(function () { alert('Upload failed — check your connection and try again.'); });
    };
  }

  if (quill) quill.getModule('toolbar').addHandler('image', function () {
    uploadImage(function (url) {
      var range = quill.getSelection(true) || { index: quill.getLength() };
      quill.insertEmbed(range.index, 'image', url);
      quill.setSelection(range.index + 1);
      var altText = prompt('Alt text for this image (describe it for SEO and screen readers):', '');
      if (altText) {
        var imgs = quill.root.querySelectorAll('img[src="' + url + '"]');
        var justInserted = imgs[imgs.length - 1];
        if (justInserted) justInserted.setAttribute('alt', altText);
      }
    });
  });

  if (quill) quill.getModule('toolbar').addHandler('comparisonTable', function () {
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

  // Formatted-HTML mode: "Insert image" fills the image note under (or after)
  // the cursor — reusing the writer's alt text — or inserts at the cursor.
  var insertBtn = document.getElementById('html-insert-image');
  if (insertBtn) insertBtn.addEventListener('click', function () {
    uploadImage(function (url) {
      var v = htmlArea.value, pos = htmlArea.selectionStart || 0;
      var re = /<div class="image-slot"[^>]*?data-alt="([^"]*)"[^>]*>[\\s\\S]*?<\\/div>/g, m, slot = null, first = null;
      while ((m = re.exec(v))) {
        if (!first) first = m;
        if (m.index + m[0].length >= pos) { slot = m; break; }
      }
      slot = slot || first;
      var alt = prompt('Alt text for this image:', slot ? slot[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : '');
      if (alt === null) return;
      var fig = '<figure><img src="' + url + '" alt="' + escHtml(alt) + '"></figure>';
      if (slot) htmlArea.value = v.slice(0, slot.index) + fig + v.slice(slot.index + slot[0].length);
      else htmlArea.value = v.slice(0, pos) + fig + v.slice(pos);
      if (window.SeoPanel) window.SeoPanel.refresh();
      refreshPreview();
    });
  });

  // Import report: paste a URL for a link the writer left empty.
  document.querySelectorAll('[data-fix-link]').forEach(function (row) {
    row.querySelector('button').addEventListener('click', function () {
      var text = row.getAttribute('data-fix-link');
      var url = row.querySelector('input').value.trim();
      if (!url) return;
      var target = '<a href="#needs-link">';
      var v = currentHtml();
      var i = v.indexOf(target + escHtml(text).replace(/&quot;/g, '"') + '</a>');
      if (i === -1) i = v.indexOf(target);
      if (i === -1) { alert('That link is no longer in the text.'); return; }
      v = v.slice(0, i) + '<a href="' + escHtml(url) + '">' + v.slice(i + target.length);
      if (mode === 'html' || !quill) htmlArea.value = v; else quill.root.innerHTML = v;
      row.classList.add('is-fixed');
      row.querySelector('button').textContent = 'Added ✓';
      if (window.SeoPanel) window.SeoPanel.refresh();
    });
  });

  var form = document.getElementById('post-form');
  form.addEventListener('submit', function () {
    document.getElementById('body-hidden-input').value = currentHtml();
    modeInput.value = mode;
  });

  // Live preview of the real article page (HTML mode).
  var previewTimer = null;
  function refreshPreview() {
    var frame = document.getElementById('post-preview-frame');
    if (!frame || mode !== 'html' || frame.closest('[hidden]')) return;
    document.getElementById('body-hidden-input').value = currentHtml();
    modeInput.value = mode;
    // Submit the unsaved form to the preview page, shown in the frame.
    var oldAction = form.getAttribute('action'), oldTarget = form.getAttribute('target');
    form.setAttribute('action', '/admin/posts/preview');
    form.setAttribute('target', 'post-preview');
    form.submit(); // (doesn't fire "submit", so the real Save is never triggered)
    form.setAttribute('action', oldAction);
    if (oldTarget) form.setAttribute('target', oldTarget); else form.removeAttribute('target');
  }
  var refreshBtn = document.getElementById('preview-refresh');
  if (refreshBtn) refreshBtn.addEventListener('click', refreshPreview);
  if (mode === 'html') setTimeout(refreshPreview, 300);
  document.querySelectorAll('[data-body-mode="html"]').forEach(function (b) { b.addEventListener('click', function () { setTimeout(refreshPreview, 100); }); });
  htmlArea.addEventListener('input', function () { clearTimeout(previewTimer); previewTimer = setTimeout(refreshPreview, 1500); });
})();
</script>`;
  return { head, scripts };
}

function importReportHtml(report) {
  if (!report) return "";
  const chips = [
    [report.words, "words"], [report.headings, "headings"], [report.tables, "tables"], [report.lists, "lists"],
    [report.callouts, "boxes & callouts"], [report.faq, "FAQ answers"], [report.imageSlots.length, "image notes"],
  ].filter(([n]) => n).map(([n, l]) => `<span class="import-chip"><strong>${Number(n).toLocaleString("en-US")}</strong> ${l}</span>`).join("");
  const slots = report.imageSlots.map((s) => `<tr><td>${s.n}</td><td>${esc(s.description)}${s.caption ? `<br><small>Caption: ${esc(s.caption)}</small>` : ""}</td><td>${s.alt ? `<code>${esc(s.alt)}</code>` : "—"}</td></tr>`).join("");
  const matched = report.linksMatched.map((l) => `<li>“${esc(l.text)}” → <code>${esc(l.href)}</code></li>`).join("");
  const missing = [...new Set(report.linksMissing)].map((t) => `
      <div class="fix-link-row" data-fix-link="${esc(t)}"><span>“${esc(t)}”</span><input type="text" placeholder="/blog/… or https://…"><button type="button" class="btn btn-secondary btn-sm">Add link</button></div>`).join("");
  return `
    <div class="form-card import-report">
      <h2>Imported from Word — not saved yet</h2>
      <p class="hint" style="margin-top:-8px;">Check the fields below, then click <strong>Create Post</strong> / <strong>Save Changes</strong>. Formatting was converted to the site's article style.</p>
      <div class="import-chips">${chips}</div>
      ${report.warnings.length ? `<div class="alert alert-error" style="margin:12px 0 0;">${report.warnings.map(esc).join("<br>")}</div>` : ""}
      ${slots ? `<h3>Photos to add (${report.imageSlots.length})</h3>
      <p class="hint">The writer's image notes are kept in the text but hidden on the live page. ${"Save the post, then use “Insert image” above the HTML editor — it fills the nearest note and reuses its alt text."} Image 1 is usually the hero: upload it as the Featured Image.</p>
      <table class="data-table import-table"><thead><tr><th>#</th><th>What the photo should show</th><th>Alt text</th></tr></thead><tbody>${slots}</tbody></table>` : ""}
      ${missing ? `<h3>Links without an address (${new Set(report.linksMissing).size})</h3>
      <p class="hint">The Word file had these as empty links. Until you add a URL they show as plain text on the live page.</p>
      <div class="fix-links">${missing}</div>` : ""}
      ${matched ? `<details><summary>${report.linksMatched.length} link(s) matched to our own pages automatically</summary><ul class="import-matched">${matched}</ul></details>` : ""}
    </div>`;
}

function renderPostForm({ post = {}, errors = [], formAction, isEdit, authorsList = [], categoriesList = [], topicsList = [], used = {}, importReport = null }) {
  const d = post.data || {};
  const bodyMode = d.bodyMode === "html" ? "html" : "visual";

  const categoryOptions = categoriesList.map(
    (c) => `<option value="${esc(c)}" ${post.category === c ? "selected" : ""}>${esc(c)}</option>`
  ).join("");
  // Active topics, plus the post's current one if it was deactivated since.
  const topicChoices = [...new Set([...(topicsList || []), ...(post.island_tag ? [post.island_tag] : [])])];
  const topicOptions = [`<option value="">— None —</option>`, ...topicChoices.map(
    (t) => `<option value="${esc(t)}" ${post.island_tag === t ? "selected" : ""}>${esc(t)}${topicsList.includes(t) ? "" : " (inactive)"}</option>`
  )].join("");
  const formatOptions = FORMATS.map(
    (f) => `<option value="${f}" ${post.content_format === f ? "selected" : ""}>${f.replace(/_/g, " ")}</option>`
  ).join("");

  const seoPanel = seoPanelHtml({
    type: "post",
    keyphrase: d.focusKeyphrase || "",
    metaTitle: d.metaTitle || "",
    metaDescription: d.metaDescription || "",
    titleField: 'input[name="title"]',
    slugField: 'input[name="slug"]',
    urlPrefix: "/blog/",
    titleSuffix: " | Tripreviewall",
    descFallback: d.excerpt || "",
    descFallbackField: 'textarea[name="excerpt"]',
    image: d.featuredImage || "",
    date: post.published_at ? new Date(post.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "",
    used,
    extraHtml: `
        <label class="seo-label" for="seo-canonical">Canonical URL (optional)</label>
        <input type="text" id="seo-canonical" name="canonicalUrl" value="${esc(d.canonicalUrl || "")}" placeholder="https://tripreviewall.com/blog/...">
        <p class="hint">Leave blank unless this content is duplicated elsewhere.</p>
        <label style="display:flex;align-items:center;gap:8px;font-weight:600;margin-top:14px;font-size:13px;">
          <input type="checkbox" name="featuredPillar" value="1" ${d.featuredPillar ? "checked" : ""} style="width:auto;">
          Featured Pillar (show in the "Start Here" band on the Blog page)
        </label>`,
  });

  return `
    <h1 class="page-title">${isEdit ? "Edit Post" : "New Post"}</h1>
    <p class="page-sub">${isEdit ? esc(post.slug) : "Write in the editor, or import a finished draft from Word."}</p>

    ${errors.length ? `<div class="alert alert-error">${errors.map(esc).join("<br>")}</div>` : ""}

    <form method="POST" action="${isEdit ? `/admin/posts/${post.id}/import-docx` : "/admin/posts/import-docx"}" enctype="multipart/form-data" class="form-card docx-import">
      <h2>${isEdit ? "Replace the article from a Word file" : "Import from Word (.docx)"}</h2>
      <p class="hint" style="margin:-8px 0 12px;">Headings, lists, tables, links and bold/italic come across; fonts and colours are replaced by the site's style. A first line like <code>Slug: … Meta description: … Focus keyphrase: …</code> fills the SEO fields. ${isEdit ? "Only the body (and any empty SEO fields) is replaced — nothing is saved until you click Save Changes." : "Nothing is saved until you click Create Post."}</p>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <input type="file" name="docxFile" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required>
        <button type="submit" class="btn btn-secondary">Import</button>
      </div>
    </form>

    ${importReportHtml(importReport)}

    <form method="POST" action="${formAction}" id="post-form">
      <div class="form-card">
        <h2>General</h2>
        <div class="form-row">
          <div class="form-field"><label>Title</label><input type="text" name="title" required value="${esc(d.title || "")}"></div>
          <div class="form-field"><label>Slug</label><input type="text" name="slug" value="${esc(post.slug || "")}"><div class="hint">Leave blank on create to auto-generate from the title.</div></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>Category</label><select name="category"><option value="">— Select —</option>${categoryOptions}</select><div class="hint"><a href="/admin/categories" target="_blank">Manage categories →</a></div></div>
          <div class="form-field"><label>Topic (optional)</label><select name="topic">${topicOptions}</select><div class="hint"><a href="/admin/topics" target="_blank">Manage topics →</a> · shown as a tag on the article and in the blog's Topic filter</div></div>
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

      ${seoPanel}

      <div class="form-card">
        <h2>Content</h2>
        <div class="form-row full">
          <div class="form-field"><label>Excerpt (shown on the article grid card)</label><textarea name="excerpt" style="min-height:70px;">${esc(d.excerpt || "")}</textarea></div>
        </div>
        <div class="form-row full">
          <div class="form-field">
            <div class="body-toolbar">
              <label style="margin:0;">Body</label>
              <span class="gp-toggle" role="group" aria-label="Editor">
                <button type="button" data-body-mode="visual" aria-pressed="${bodyMode === "visual"}">Visual editor</button>
                <button type="button" data-body-mode="html" aria-pressed="${bodyMode === "html"}">Formatted HTML</button>
              </span>
            </div>
            <input type="hidden" name="bodyMode" id="body-mode-input" value="${bodyMode}">
            <div id="visual-editor-wrap"${bodyMode === "html" ? " hidden" : ""}>
              <div id="quill-editor" style="background:#fff;height:400px;margin-bottom:42px;"></div>
              <div class="hint">${isEdit ? "Use the toolbar to insert images anywhere in the article." : "Image insertion is available after you save this post the first time."}</div>
            </div>
            <div id="html-editor-wrap"${bodyMode === "visual" ? " hidden" : ""}>
              <div class="html-editor-actions">
                <button type="button" class="btn btn-secondary btn-sm" id="html-insert-image">Insert image${isEdit ? "" : " (after first save)"}</button>
                <button type="button" class="btn btn-secondary btn-sm" id="preview-refresh">Refresh preview</button>
                <span class="hint">Blocks: <code>answer-box</code> · <code>callout callout-verdict / -tip / -warning / -note</code> · <code>table-scroll</code> · <code>faq-block</code> · <code>read-next</code></span>
              </div>
              <div class="html-editor-split">
                <textarea id="body-html-editor" spellcheck="false" aria-label="Article HTML"></textarea>
                <iframe name="post-preview" id="post-preview-frame" title="Article preview" src="about:blank"></iframe>
              </div>
            </div>
            <textarea name="body" id="body-hidden-input" style="display:none;"></textarea>
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
        <button type="submit" class="btn btn-secondary" formaction="/admin/posts/preview" formtarget="_blank" formnovalidate>Preview article ↗</button>
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
    // Keep every existing field the form doesn't edit (anything imported or
    // added later) — the form only overwrites the keys listed below.
    ...existingData,
    title: (body.title || "").trim(),
    excerpt: (body.excerpt || "").trim(),
    authorSlug: (body.authorSlug || "").trim() || null,
    authorName: (body.authorName || "").trim(),
    readTimeMinutes: body.readTimeMinutes !== "" && body.readTimeMinutes != null ? Number(body.readTimeMinutes) : null,
    body: (body.body || "").trim(),
    bodyMode: body.bodyMode === "html" ? "html" : "visual",
    tags: (body.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
    disclosureText: (body.disclosureText || "").trim(),
    relatedTourSlug: (body.relatedTourSlug || "").trim(),
    focusKeyphrase: (body.focusKeyphrase || "").trim() || null,
    metaTitle: (body.metaTitle || "").trim() || null,
    metaDescription: (body.metaDescription || "").trim() || null,
    canonicalUrl: /^https:\/\/[^\s"'<>]+$/.test((body.canonicalUrl || "").trim()) ? body.canonicalUrl.trim() : null,
    featuredPillar: body.featuredPillar === "1",
    // Not edited by this form — preserved so uploading a featured image
    // never gets wiped out by an unrelated content edit.
    featuredImage: existingData.featuredImage || null,
  };
}

/** Saves the SEO / readability traffic lights with the post (same analysis as the panel). */
function withSeoScores(data, slug, used) {
  const scores = scoreFor({
    type: "post",
    keyphrase: data.focusKeyphrase || "",
    title: data.title,
    seoTitle: `${data.metaTitle || data.title} | Tripreviewall`,
    metaDescription: (data.metaDescription || data.excerpt || "").slice(0, 155), // same fallback as the article template
    slug,
    html: data.body,
    used,
  });
  return { ...data, seo: scores };
}

/** Renders the New/Edit form with everything it needs (authors, categories, editor, SEO panel). */
async function sendPostForm(res, user, statusCode, { post = {}, errors = [], isEdit, importReport = null }) {
  const [authorsList, categoriesList, topicsList, used] = await Promise.all([
    listActiveAuthorsForDropdown(),
    listActiveCategoryNames(),
    listActiveTopicNames(),
    usedKeyphrases(isEdit && post.id ? `post:${post.id}` : ""),
  ]);
  const d = post.data || {};
  const assets = editorAssets(isEdit ? post.id : null, d.body || "", d.bodyMode);
  const formAction = isEdit ? `/admin/posts/${post.id}/edit` : "/admin/posts/new";
  res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({
    title: isEdit ? "Edit Post" : "New Post",
    activeNav: "blog",
    user,
    body: renderPostForm({ post, errors, formAction, isEdit, authorsList, categoriesList, topicsList, used, importReport }),
    extraHead: assets.head,
    extraScripts: assets.scripts + "\n" + seoPanelAssets(),
  }));
}

/* ============================================================
   New
   ============================================================ */
async function newPostForm(req, res, user) {
  await sendPostForm(res, user, 200, { isEdit: false });
}

async function createPost(req, res, user) {
  let body;
  try {
    body = await readFormBody(req);
  } catch (err) {
    await sendPostForm(res, user, 400, { isEdit: false, errors: ["Malformed request (or the article is larger than 2 MB)."] });
    return;
  }

  const errors = [];
  if (!body.title || !body.title.trim()) errors.push("Title is required.");
  const slug = slugify(body.slug || body.title);
  if (!slug) errors.push("Could not generate a valid slug — please set one manually.");
  if (isReservedSlug(slug)) errors.push(`"${slug}" is a reserved page name — please choose a different slug.`);

  const data = withSeoScores(bodyToPostData(body), slug, await usedKeyphrases(""));
  const status = body.status === "published" ? "published" : "draft";
  const category = (body.category || "").trim() || null;
  const islandTag = cleanTopic(body.topic, await listActiveTopicNames());
  const contentFormat = FORMATS.includes(body.contentFormat) ? body.contentFormat : "listicle";
  const postForForm = { slug, status, category, island_tag: islandTag, content_format: contentFormat, data };

  if (errors.length) {
    await sendPostForm(res, user, 400, { isEdit: false, post: postForForm, errors });
    return;
  }

  const genErrors = [];
  try {
    await query(
      `INSERT INTO posts (slug, status, category, island_tag, content_format, published_at, created_by, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [slug, status, category, islandTag, contentFormat, status === "published" ? new Date() : null, user.userId, JSON.stringify(data)]
    );
    if (status === "published") {
      collectGenErrors(genErrors, await generatePostFile({ slug, status, category, island_tag: islandTag, content_format: contentFormat, published_at: new Date(), updated_at: new Date(), data }));
      collectGenErrors(genErrors, await regenerateListingPages());
    }
  } catch (err) {
    console.error("[posts] create failed:", err.message);
    const dbErrors = err.code === "23505" ? ["A post with this slug already exists."] : [`Database error: ${err.message}`];
    await sendPostForm(res, user, 400, { isEdit: false, post: postForForm, errors: dbErrors });
    return;
  }

  await logAudit(user, "create", "post", slug, `Created post "${data.title || slug}"`);

  res.writeHead(302, { Location: postsRedirect(genErrors) });
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
  await sendPostForm(res, user, 200, { isEdit: true, post });
}

async function updatePost(req, res, user, id) {
  let body;
  try {
    body = await readFormBody(req);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end("Malformed request (or the article is larger than 2 MB).");
    return;
  }

  let existing;
  try {
    const existingResult = await query("SELECT slug, status, published_at, island_tag, data FROM posts WHERE id = $1", [id]);
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

  const data = withSeoScores(bodyToPostData(body, existing.data || {}), slug, await usedKeyphrases(`post:${id}`));
  const status = body.status === "published" ? "published" : "draft";
  const category = (body.category || "").trim() || null;
  const islandTag = cleanTopic(body.topic, await listActiveTopicNames(), existing.island_tag);
  const contentFormat = FORMATS.includes(body.contentFormat) ? body.contentFormat : "listicle";
  const postForForm = { id, slug, status, category, island_tag: islandTag, content_format: contentFormat, published_at: existing.published_at, data };

  if (errors.length) {
    await sendPostForm(res, user, 400, { isEdit: true, post: postForForm, errors });
    return;
  }

  const genErrors = [];
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
      collectGenErrors(genErrors, await generatePostFile(fresh.rows[0]));
    } else {
      removePostFile(slug);
    }
    collectGenErrors(genErrors, await regenerateListingPages());
  } catch (err) {
    console.error("[posts] update failed:", err.message);
    const dbErrors = err.code === "23505" ? ["Another post already uses this slug."] : [`Database error: ${err.message}`];
    await sendPostForm(res, user, 400, { isEdit: true, post: postForForm, errors: dbErrors });
    return;
  }

  await logAudit(user, "update", "post", slug, `Updated post "${data.title || slug}"`);

  res.writeHead(302, { Location: postsRedirect(genErrors) });
  res.end();
}

/* ============================================================
   Word import + preview
   ============================================================ */
/** Our own pages the converter can link to when the Word file left a link empty. */
async function buildLinkTargets() {
  const targets = [];
  const n = (s) => SeoAnalysis.norm(s);
  [["Oahu", "oahu"], ["Maui", "maui"], ["Kauai", "kauai"], ["Big Island", "big-island"]].forEach(([name, slug]) => {
    const k = n(name);
    targets.push({ label: `${name} destination page`, href: `/destinations/${slug}`, keys: [k, `${k} tours`, `${k} tours page`, `${k} tour page`, `${k} destination page`, `${k} destination`, `${k} guide`, `${k} island guide`] });
  });
  try {
    const posts = await query(`SELECT slug, data->>'title' AS title, data->>'focusKeyphrase' AS kp FROM posts WHERE status = 'published'`);
    posts.rows.forEach((r) => {
      const keys = [n(r.title), n(String(r.title || "").split(/[:—–|]/)[0]), n(r.slug.replace(/-/g, " "))];
      if (r.kp) keys.push(n(r.kp), n(`${r.kp} guide`));
      targets.push({ label: `Article “${r.title}”`, href: `/blog/${r.slug}`, keys: keys.filter(Boolean), priority: 5 });
    });
  } catch (err) { /* no posts table */ }
  try {
    const tours = await query(`SELECT slug, data->>'name' AS name FROM tours WHERE status = 'published'`);
    tours.rows.forEach((r) => targets.push({ label: `Tour “${r.name}”`, href: `/tours/${r.slug}`, keys: [n(r.name)].filter(Boolean) }));
  } catch (err) { /* no tours table */ }
  return targets;
}

/** Saves a picture embedded in the Word file into /uploads/posts and returns its URL. */
function saveDocxImage(slugHint) {
  const fs = require("fs");
  const path = require("path");
  const crypto = require("crypto");
  const { UPLOAD_ROOT } = require("../upload");
  return (buffer, name) => {
    const ext = path.extname(name).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) throw new Error(`${ext || "this"} images aren't supported — re-insert it as JPG or PNG`);
    if (buffer.length > 8 * 1024 * 1024) throw new Error("image is larger than 8 MB");
    const dir = path.join(UPLOAD_ROOT, "posts");
    fs.mkdirSync(dir, { recursive: true });
    const file = `${String(slugHint || "article").replace(/[^a-z0-9-]/gi, "").slice(0, 50)}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}${ext}`;
    fs.writeFileSync(path.join(dir, file), buffer);
    return `/uploads/posts/${file}`;
  };
}

async function importDocx(req, res, user, id = null) {
  const { parseDocxUpload } = require("../upload");
  let existing = null;
  if (id) {
    try {
      const r = await query("SELECT * FROM posts WHERE id = $1", [id]);
      existing = r.rows[0];
    } catch (err) { /* handled below */ }
    if (!existing) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(layout({ title: "Not found", activeNav: "blog", user, body: `<div class="alert alert-error">Post not found.</div>` }));
      return;
    }
  }

  let converted;
  try {
    const buffer = await parseDocxUpload(req);
    if (!buffer) throw new Error("Choose a .docx file first.");
    converted = docxToArticle(buffer, { linkTargets: await buildLinkTargets(), saveImage: saveDocxImage(existing ? existing.slug : "article") });
  } catch (err) {
    console.error("[posts] docx import failed:", err.message);
    await sendPostForm(res, user, 400, { isEdit: !!existing, post: existing || {}, errors: [`Word import failed: ${err.message}`] });
    return;
  }

  const f = converted.fields;
  const categoriesList = await listActiveCategoryNames();
  // Topic: a "Topic:"/"Island:" line in the file, else the first topic named in the title.
  const topicsList = await listActiveTopicNames();
  const wanted = f.topic || f.island || "";
  const guessIsland = (wanted && topicsList.find((t) => t.toLowerCase() === wanted.toLowerCase()))
    || topicsList.find((t) => SeoAnalysis.match(f.title || "", t) === "exact") || null;
  if (wanted && !topicsList.some((t) => t.toLowerCase() === wanted.toLowerCase())) converted.report.warnings.push(`Topic “${wanted}” doesn't exist in Admin → Topics — pick one below or add it there.`);
  const guessCategory = f.category ? categoriesList.find((c) => c.toLowerCase() === f.category.toLowerCase()) || null : null;
  if (f.focusKeyphraseGuessed) converted.report.warnings.push(`No “Focus keyphrase:” line in the file — suggested “${f.focusKeyphrase}” from the slug. Check it in the SEO panel.`);
  if (f.category && !guessCategory) converted.report.warnings.push(`Category “${f.category}” doesn't exist in Admin → Categories — pick one below.`);

  let post;
  if (existing) {
    const d = existing.data || {};
    post = {
      ...existing,
      data: {
        ...d,
        body: converted.html,
        bodyMode: "html",
        title: d.title || f.title || "",
        focusKeyphrase: d.focusKeyphrase || f.focusKeyphrase || null,
        metaTitle: d.metaTitle || f.metaTitle || null,
        metaDescription: d.metaDescription || f.metaDescription || null,
        excerpt: d.excerpt || f.excerpt || "",
        readTimeMinutes: f.readTimeMinutes || d.readTimeMinutes,
      },
    };
  } else {
    post = {
      slug: f.slug || "",
      status: "draft",
      category: guessCategory,
      island_tag: guessIsland,
      content_format: /\bvs\b|versus|compar/i.test(f.title || "") ? "comparison" : "listicle",
      data: {
        title: f.title || "",
        excerpt: f.excerpt || "",
        authorName: f.authorName || "",
        readTimeMinutes: f.readTimeMinutes,
        body: converted.html,
        bodyMode: "html",
        focusKeyphrase: f.focusKeyphrase || null,
        metaTitle: f.metaTitle || null,
        metaDescription: f.metaDescription || null,
        tags: [],
      },
    };
  }
  await sendPostForm(res, user, 200, { isEdit: !!existing, post, importReport: converted.report });
}

/** POST /admin/posts/preview — the real article page, rendered from the unsaved form. */
async function previewPost(req, res, user) {
  const { renderPostPageHtml } = require("../ssr/postTemplate");
  const { toPublicShape, toPostPublicShape } = require("./publicApi");
  let body;
  try { body = await readFormBody(req); } catch (err) { res.writeHead(400); res.end("Malformed request."); return; }
  const slug = slugify(body.slug || body.title) || "preview";
  const data = bodyToPostData(body);
  const row = {
    slug, category: (body.category || "").trim() || null,
    island_tag: String(body.topic || "").trim() || null,
    content_format: body.contentFormat, published_at: new Date(), updated_at: new Date(), data,
  };
  let relatedTour = null, author = null;
  try {
    if (data.relatedTourSlug) {
      const t = await query(`SELECT slug, island, price_from, data FROM tours WHERE slug = $1 LIMIT 1`, [data.relatedTourSlug]);
      if (t.rows[0]) relatedTour = toPublicShape(t.rows[0]);
    }
    if (data.authorSlug) {
      const a = await query(`SELECT slug, data FROM authors WHERE slug = $1 LIMIT 1`, [data.authorSlug]);
      if (a.rows[0]) author = { slug: a.rows[0].slug, ...(a.rows[0].data || {}) };
    }
  } catch (err) { /* preview without extras */ }
  let html = renderPostPageHtml(toPostPublicShape(row), relatedTour, [], author);
  html = html.replace("<head>", '<head>\n<meta name="robots" content="noindex, nofollow">')
    .replace("<body>", '<body>\n<div style="position:sticky;top:0;z-index:999;background:#B8592F;color:#fff;font:600 13px/1 Inter,sans-serif;padding:8px 16px;text-align:center;">Preview — not published</div>');
  // This page is shown inside the admin's preview frame.
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'self'");
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

async function deletePost(req, res, user, id) {
  try {
    const result = await query("DELETE FROM posts WHERE id = $1 RETURNING slug", [id]);
    if (result.rows[0]) {
      removePostFile(result.rows[0].slug);
      await regenerateListingPages();
      await logAudit(user, "delete", "post", result.rows[0].slug, `Deleted post "${result.rows[0].slug}"`);
    }
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

module.exports = { listPosts, newPostForm, createPost, editPostForm, updatePost, deletePost, uploadPostImage, uploadInlineImage, importDocx, previewPost };
