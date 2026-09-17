const fs = require("fs");
const path = require("path");
const { query } = require("../db");
const { esc } = require("../utils");
const { layout, paginationHtml } = require("../render");
const { UPLOAD_ROOT } = require("../upload");

const KINDS = ["tours", "posts", "authors", "destinations", "media"];
const IMG_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

/**
 * Every place a URL like "/uploads/tours/xyz.jpg" could be sitting inside a
 * JSONB "data" column, across every content table. Used to tell a file
 * apart as "in use" vs "orphaned" (safe to delete).
 */
async function buildUsedUrlSet() {
  const used = new Set();
  const tables = ["tours", "posts", "authors", "destinations"];
  for (const t of tables) {
    try {
      const result = await query(`SELECT data FROM ${t}`);
      for (const row of result.rows) {
        const s = JSON.stringify(row.data || {});
        const matches = s.match(/\/uploads\/[a-zA-Z0-9/_.\-]+/g) || [];
        matches.forEach((m) => used.add(m));
      }
    } catch (err) {
      console.error(`[media] could not scan ${t} for used URLs:`, err.message);
    }
  }
  return used;
}

function listFilesOnDisk() {
  const files = [];
  for (const kind of KINDS) {
    const dir = path.join(UPLOAD_ROOT, kind);
    if (!fs.existsSync(dir)) continue;
    for (const filename of fs.readdirSync(dir)) {
      const ext = path.extname(filename).toLowerCase();
      if (!IMG_EXT.has(ext)) continue;
      const fullPath = path.join(dir, filename);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (err) {
        continue;
      }
      files.push({
        kind,
        filename,
        url: `/uploads/${kind}/${filename}`,
        sizeKB: Math.round(stat.size / 1024),
        mtime: stat.mtime,
      });
    }
  }
  return files;
}

async function listMedia(req, res, user, urlObj) {
  const kindFilter = urlObj.searchParams.get("kind") || "";
  const usageFilter = urlObj.searchParams.get("usage") || "";
  const searchQuery = (urlObj.searchParams.get("q") || "").trim().toLowerCase();
  const page = Math.max(1, parseInt(urlObj.searchParams.get("page"), 10) || 1);
  const PAGE_SIZE = 30;
  const pickMode = urlObj.searchParams.get("pick") === "1";

  let files = [];
  let dbError = null;
  try {
    const usedUrls = await buildUsedUrlSet();
    files = listFilesOnDisk().map((f) => ({ ...f, used: usedUrls.has(f.url) }));
  } catch (err) {
    console.error("[media] list failed:", err.message);
    dbError = err.message;
    files = listFilesOnDisk().map((f) => ({ ...f, used: null })); // unknown usage if DB scan failed
  }

  files.sort((a, b) => b.mtime - a.mtime);

  if (kindFilter) files = files.filter((f) => f.kind === kindFilter);
  if (usageFilter === "used") files = files.filter((f) => f.used === true);
  if (usageFilter === "unused") files = files.filter((f) => f.used === false);
  if (searchQuery) files = files.filter((f) => f.filename.toLowerCase().includes(searchQuery));

  const totalKB = files.reduce((sum, f) => sum + f.sizeKB, 0);
  const unusedCount = files.filter((f) => f.used === false).length;

  const totalPages = Math.max(1, Math.ceil(files.length / PAGE_SIZE));
  const shown = files.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const cards = shown
    .map((f) => {
      const sizeLabel = f.sizeKB >= 1024 ? `${(f.sizeKB / 1024).toFixed(1)} MB` : `${f.sizeKB} KB`;
      const usedBadge =
        f.used === null
          ? `<span class="badge badge-draft">Unknown</span>`
          : f.used
          ? `<span class="badge badge-published">In use</span>`
          : `<span class="badge badge-draft">Unused</span>`;
      const actionHtml = pickMode
        ? `<button type="button" class="btn btn-primary btn-sm" style="width:100%;margin-top:6px;" onclick="pickImage('${esc(f.url)}')">Select</button>`
        : f.used === false
        ? `<form method="POST" action="/admin/media/delete" onsubmit="return confirm('Delete this unused file? This cannot be undone.');" style="margin-top:6px;">
             <input type="hidden" name="kind" value="${esc(f.kind)}">
             <input type="hidden" name="filename" value="${esc(f.filename)}">
             <button type="submit" class="btn btn-danger btn-sm" style="width:100%;">Delete</button>
           </form>`
        : "";
      return `
      <div class="media-card">
        <a href="${esc(f.url)}" target="_blank" rel="noopener">
          <img src="${esc(f.url)}" loading="lazy" style="width:100%;height:120px;object-fit:cover;border-radius:4px;border:1px solid var(--color-border);">
        </a>
        <div style="font-size:12px;margin-top:6px;word-break:break-all;color:var(--color-text-muted);">${esc(f.filename)}</div>
        <div style="display:flex;gap:6px;align-items:center;margin-top:4px;flex-wrap:wrap;">
          <span class="badge badge-draft">${esc(f.kind)}</span>
          ${usedBadge}
          <span style="font-size:11px;color:var(--color-text-muted);">${sizeLabel}</span>
        </div>
        ${actionHtml}
      </div>`;
    })
    .join("");

  const kindOptions = ["", ...KINDS]
    .map((k) => `<option value="${k}" ${kindFilter === k ? "selected" : ""}>${k === "" ? "All folders" : k}</option>`)
    .join("");

  const gridHtml = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:14px;margin-top:20px;">
      ${cards || `<p style="color:var(--color-text-muted);grid-column:1/-1;">No images match this filter.</p>`}
    </div>
    ${paginationHtml(page, totalPages, "/admin/media", pickMode ? { kind: kindFilter, usage: usageFilter, q: searchQuery, pick: "1" } : { kind: kindFilter, usage: usageFilter, q: searchQuery })}`;

  if (pickMode) {
    // Standalone popup page (no sidebar) — opened via window.open() from an
    // edit form's "Browse Existing Images" button; posts the chosen URL back
    // to the opener window and closes itself.
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Choose an Image</title>
<link rel="stylesheet" href="/admin/public/admin.css"></head>
<body style="padding:20px;">
  <h1 class="page-title" style="font-size:20px;">Choose an Image</h1>
  <div class="toolbar">
    <form method="GET" action="/admin/media" style="display:flex;gap:8px;flex-wrap:wrap;">
      <input type="hidden" name="pick" value="1">
      <input type="search" name="q" placeholder="Search by filename…" value="${esc(searchQuery)}" style="flex:1;min-width:160px;">
      <select name="kind" onchange="this.form.submit()" style="padding:8px 12px;border:1px solid var(--color-border);border-radius:4px;">${kindOptions}</select>
      <button type="submit" class="btn btn-secondary">Search</button>
    </form>
  </div>
  ${gridHtml}
  <script>
    function pickImage(url) {
      if (window.opener) {
        window.opener.postMessage({ type: "media-picked", url: url }, "*");
      }
      window.close();
    }
  </script>
</body></html>`);
    return;
  }

  const body = `
    <h1 class="page-title">Media Library</h1>
    <p class="page-sub">
      ${files.length} image${files.length === 1 ? "" : "s"} match this filter — showing ${shown.length ? (page - 1) * PAGE_SIZE + 1 : 0}–${(page - 1) * PAGE_SIZE + shown.length},
      ${totalKB >= 1024 ? (totalKB / 1024).toFixed(1) + " MB" : totalKB + " KB"} total.
      ${unusedCount > 0 ? `<strong>${unusedCount} unused</strong> and safe to delete.` : "No unused files right now."}
    </p>
    ${dbError ? `<div class="alert alert-error">Could not check which files are in use (database error: ${esc(dbError)}) — showing all files with unknown usage status. Deletion is disabled until this is resolved.</div>` : ""}

    <div class="toolbar">
      <form method="GET" action="/admin/media" style="display:flex;gap:8px;flex-wrap:wrap;">
        <input type="search" name="q" placeholder="Search by filename…" value="${esc(searchQuery)}">
        <select name="kind" onchange="this.form.submit()" style="padding:8px 12px;border:1px solid var(--color-border);border-radius:4px;">${kindOptions}</select>
        <select name="usage" onchange="this.form.submit()" style="padding:8px 12px;border:1px solid var(--color-border);border-radius:4px;">
          <option value="">All files</option>
          <option value="used" ${usageFilter === "used" ? "selected" : ""}>In use only</option>
          <option value="unused" ${usageFilter === "unused" ? "selected" : ""}>Unused only</option>
        </select>
        <button type="submit" class="btn btn-secondary">Filter</button>
      </form>
    </div>

    <div class="form-card">
      <h2>Upload a general-purpose image</h2>
      <p class="hint" style="margin-bottom:10px;">Not tied to a specific Tour, Post, Author or Destination — use this to grab a URL you can paste manually somewhere (e.g. into a blog post body).</p>
      <form method="POST" action="/admin/media/upload" enctype="multipart/form-data">
        <input type="file" name="images" accept=".jpg,.jpeg,.png,.webp">
        <button type="submit" class="btn btn-secondary" style="margin-top:10px;">Upload</button>
      </form>
    </div>

    ${gridHtml}
  `;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Media Library", activeNav: "media", user, body }));
}

async function uploadGeneralImage(req, res, user) {
  const { parseImageUpload } = require("../upload");
  try {
    const result = await parseImageUpload(req, "media", "general");
    if (result.urls.length === 0) {
      // Nothing valid uploaded — just bounce back, the list page has no
      // dedicated error slot for this minor case.
    }
  } catch (err) {
    console.error("[media] general upload failed:", err.message);
  }
  res.writeHead(302, { Location: "/admin/media" });
  res.end();
}

async function deleteMediaFile(req, res, user) {
  const { readFormBody } = require("../utils");
  let body;
  try {
    body = await readFormBody(req);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end("Malformed request.");
    return;
  }

  const kind = body.kind;
  const filename = body.filename;

  if (!KINDS.includes(kind) || !filename || filename.includes("/") || filename.includes("..")) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end("Invalid file reference.");
    return;
  }

  const url = `/uploads/${kind}/${filename}`;

  // Re-check usage server-side right before deleting — never trust that the
  // list page's "Unused" badge is still accurate (something may have been
  // saved in Admin in the seconds since the page loaded).
  try {
    const usedUrls = await buildUsedUrlSet();
    if (usedUrls.has(url)) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        layout({
          title: "Media Library",
          activeNav: "media",
          user,
          body: `<div class="alert alert-error">This file is now referenced somewhere — refusing to delete it. Refresh the Media Library to see its current status.</div><a href="/admin/media" class="btn btn-secondary">Back to Media Library</a>`,
        })
      );
      return;
    }
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      layout({
        title: "Media Library",
        activeNav: "media",
        user,
        body: `<div class="alert alert-error">Could not verify this file is unused (database error: ${esc(err.message)}) — refusing to delete.</div><a href="/admin/media" class="btn btn-secondary">Back to Media Library</a>`,
      })
    );
    return;
  }

  try {
    const fullPath = path.join(UPLOAD_ROOT, kind, filename);
    if (!fullPath.startsWith(UPLOAD_ROOT)) throw new Error("Path escapes upload root.");
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  } catch (err) {
    console.error("[media] delete failed:", err.message);
  }

  res.writeHead(302, { Location: "/admin/media" });
  res.end();
}

module.exports = { listMedia, uploadGeneralImage, deleteMediaFile, applyPickedImage };

/* ============================================================
   Apply a Media Library-picked image to a Tour/Post/Author/Destination —
   used by the "Browse Existing Images" picker (window.open + postMessage)
   on each of those edit forms, as an alternative to uploading a new file.
   ============================================================ */
const VALID_URL_RE = /^\/uploads\/(tours|posts|authors|destinations|media)\/[a-zA-Z0-9._-]+$/;

function sendJson(res, statusCode, obj) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

async function applyPickedImage(req, res, user) {
  const { readFormBody } = require("../utils");
  let body;
  try {
    body = await readFormBody(req);
  } catch (err) {
    sendJson(res, 400, { ok: false, error: "Malformed request." });
    return;
  }

  const { targetType, targetId, url } = body;
  if (!VALID_URL_RE.test(url || "")) {
    sendJson(res, 400, { ok: false, error: "That doesn't look like a valid uploaded image URL." });
    return;
  }
  if (!targetId) {
    sendJson(res, 400, { ok: false, error: "Missing target id." });
    return;
  }

  try {
    if (targetType === "tour") {
      const result = await query("SELECT slug, status, island, price_from, data FROM tours WHERE id = $1", [targetId]);
      if (!result.rows[0]) { sendJson(res, 404, { ok: false, error: "Tour not found." }); return; }
      const row = result.rows[0];
      const data = row.data || {};
      data.gallery = [...(data.gallery || []), url];
      await query("UPDATE tours SET data = $1, updated_at = now() WHERE id = $2", [JSON.stringify(data), targetId]);
      if (row.status === "published") {
        const { generateTourFile, regenerateListingPages } = require("../ssr/generator");
        await generateTourFile({ slug: row.slug, status: row.status, island: row.island, price_from: row.price_from, data });
        await regenerateListingPages();
      }
    } else if (targetType === "post") {
      const result = await query("SELECT slug, status, category, island_tag, content_format, published_at, updated_at, data FROM posts WHERE id = $1", [targetId]);
      if (!result.rows[0]) { sendJson(res, 404, { ok: false, error: "Post not found." }); return; }
      const row = result.rows[0];
      const data = row.data || {};
      data.featuredImage = url;
      await query("UPDATE posts SET data = $1, updated_at = now() WHERE id = $2", [JSON.stringify(data), targetId]);
      if (row.status === "published") {
        const { generatePostFile, regenerateListingPages } = require("../ssr/generator");
        await generatePostFile({ ...row, data });
        await regenerateListingPages();
      }
    } else if (targetType === "author") {
      const result = await query("SELECT slug, data FROM authors WHERE id = $1", [targetId]);
      if (!result.rows[0]) { sendJson(res, 404, { ok: false, error: "Author not found." }); return; }
      const row = result.rows[0];
      const data = row.data || {};
      data.photoUrl = url;
      await query("UPDATE authors SET data = $1, updated_at = now() WHERE id = $2", [JSON.stringify(data), targetId]);
      // Regenerate any already-published posts crediting this author, so the
      // new photo shows up on their Author Box without a separate post edit.
      try {
        const postsResult = await query(
          `SELECT slug, status, category, island_tag, content_format, published_at, updated_at, data
           FROM posts WHERE status = 'published' AND data->>'authorSlug' = $1`,
          [row.slug]
        );
        if (postsResult.rows.length > 0) {
          const { generatePostFile } = require("../ssr/generator");
          for (const p of postsResult.rows) await generatePostFile(p);
        }
      } catch (err) {
        console.error("[media] could not refresh posts crediting this author:", err.message);
      }
    } else if (targetType === "destination") {
      const result = await query("SELECT slug, data FROM destinations WHERE id = $1", [targetId]);
      if (!result.rows[0]) { sendJson(res, 404, { ok: false, error: "Destination not found." }); return; }
      const row = result.rows[0];
      const data = row.data || {};
      data.heroImage = url;
      await query("UPDATE destinations SET data = $1, updated_at = now() WHERE id = $2", [JSON.stringify(data), targetId]);
      const { regenerateListingPages } = require("../ssr/generator");
      await regenerateListingPages();
    } else {
      sendJson(res, 400, { ok: false, error: "Unknown target type." });
      return;
    }
  } catch (err) {
    console.error("[media] applyPickedImage failed:", err.message);
    sendJson(res, 500, { ok: false, error: `Database error: ${err.message}` });
    return;
  }

  sendJson(res, 200, { ok: true });
}
