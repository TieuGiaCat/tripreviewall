const { esc, readFormBody, slugify } = require("../utils");
const { layout } = require("../render");
const { query } = require("../db");
const { applyPageSeoOverride, readPageForSeo, filePathToUrl } = require("../lib/pageSeo");
const { seoPanelHtml, seoPanelAssets, usedKeyphrases, scoreFor, scoreDots } = require("../lib/seoPanel");
const { logAudit } = require("../auditLog");

async function listPageSeo() {
  try {
    const result = await query(`SELECT page_key, label, file_path, meta_title, meta_description, focus_keyphrase, updated_at FROM page_seo ORDER BY label ASC`);
    return result.rows;
  } catch (err) {
    // Before migration 003 the focus_keyphrase column doesn't exist yet.
    const result = await query(`SELECT page_key, label, file_path, meta_title, meta_description, NULL AS focus_keyphrase, updated_at FROM page_seo ORDER BY label ASC`);
    return result.rows;
  }
}

/** Score for one page, read from the generated file (same analysis as the panel). */
async function pageScore(entry, page) {
  page = page || (await readPageForSeo(entry.file_path));
  if (!page) return null;
  return scoreFor({
    type: "page",
    keyphrase: entry.focus_keyphrase || "",
    title: page.h1 || entry.label,
    seoTitle: entry.meta_title || page.title,
    metaDescription: entry.meta_description || page.description,
    html: page.mainHtml,
  });
}

/**
 * Add form (simple fields) or Edit form (full Yoast-style panel, analysing
 * the page as it is currently published).
 */
function renderForm({ entry = {}, errors = [], isEdit = false, page = null, used = {} } = {}) {
  const formAction = isEdit ? `/admin/page-seo/${encodeURIComponent(entry.page_key)}/edit` : "/admin/page-seo/new";
  const panel = isEdit
    ? seoPanelHtml({
        type: "page",
        keyphrase: entry.focus_keyphrase || "",
        metaTitle: entry.meta_title || "",
        metaDescription: entry.meta_description || "",
        hasSlug: true,
        slug: filePathToUrl(entry.file_path).replace(/^\//, ""),
        urlPrefix: "/",
        seoTitleFallbackText: page ? page.title : entry.label,
        descFallback: page ? page.description : "",
        staticHtml: page ? page.mainHtml : "",
        titleFallback: page ? page.h1 : entry.label,
        used,
      })
    : `
      <div class="form-card">
        <div class="form-row">
          <div class="form-field"><label>Focus keyphrase</label><input type="text" name="focusKeyphrase" value="${esc(entry.focus_keyphrase || "")}" placeholder="e.g. hawaii tour reviews"><div class="hint">You'll get the full SEO analysis after adding the page.</div></div>
          <div class="form-field"><label>Meta Title</label><input type="text" name="metaTitle" value="${esc(entry.meta_title || "")}"></div>
        </div>
        <div class="form-row full">
          <div class="form-field"><label>Meta Description</label><input type="text" name="metaDescription" value="${esc(entry.meta_description || "")}"></div>
        </div>
      </div>`;
  return `
    ${errors.length ? `<div class="alert alert-error">${errors.map(esc).join("<br>")}</div>` : ""}
    ${isEdit && !page ? `<div class="alert alert-error">“${esc(entry.file_path)}” wasn't found in the site folder, so the content can't be analysed. Run <code>npm run regenerate-all</code> or check the path.</div>` : ""}
    <form method="POST" action="${formAction}">
      <div class="form-card">
        <div class="form-row">
          <div class="form-field"><label>Label (for your reference)</label><input type="text" name="label" value="${esc(entry.label || "")}" placeholder="e.g. Contact" required></div>
          <div class="form-field"><label>File Path (relative to site root)</label><input type="text" name="filePath" value="${esc(entry.file_path || "")}" placeholder="e.g. contact.html or index.html" ${isEdit ? "readonly" : ""} required><div class="hint">${isEdit ? "Can't be changed after creation — delete and re-add to point at a different file." : "The exact filename as it sits in your site's root folder."}</div></div>
        </div>
      </div>
      ${panel}
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${isEdit ? "Save Changes" : "Add Page"}</button>
        <a href="/admin/page-seo" class="btn btn-secondary">Cancel</a>
      </div>
    </form>
    ${isEdit ? seoPanelAssets() : ""}
  `;
}

async function showPageSeoList(req, res, user) {
  let rows = [], loadError = null;
  try {
    rows = await listPageSeo();
    rows = await Promise.all(rows.map(async (r) => ({ ...r, score: await pageScore(r) })));
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
        <td>${r.score ? scoreDots(r.score.seoScore, r.score.readabilityScore, r.focus_keyphrase) : `<span class="hint">file missing</span>`}${r.focus_keyphrase ? `<br><span style="color:var(--color-text-muted);font-size:11px;">${esc(r.focus_keyphrase)}</span>` : ""}</td>
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
    : `<tr><td colspan="6" style="text-align:center;color:var(--color-text-muted);padding:24px;">No pages registered yet — add one below.</td></tr>`;

  const body = `
    <h1 class="page-title">Page SEO</h1>
    <p class="page-sub">Focus keyphrase, Meta Title and Meta Description for standalone pages — Home, Contact, Transportation, and anything else that isn't a Tour or Blog Post (those have their own SEO fields on their own edit forms).</p>
    ${loadError ? `<div class="alert alert-error">Database error: ${esc(loadError)}</div>` : ""}

    <div class="form-card" style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr><th>Page</th><th>File</th><th title="SEO · Readability">SEO</th><th>Meta Title</th><th>Meta Description</th><th></th></tr></thead>
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
  const focusKeyphrase = (body.focusKeyphrase || "").trim() || null;

  const errors = [];
  if (!label) errors.push("Label is required.");
  if (!filePath) errors.push("File Path is required.");
  if (filePath.includes("..")) errors.push("File Path can't contain \"..\".");
  else if (!/\.html$/i.test(filePath)) errors.push("File Path must be an .html page (e.g. about.html).");

  const pageKey = slugify(label) || slugify(filePath);
  if (!pageKey) errors.push("Could not generate a valid identifier from that label.");

  if (errors.length) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Page SEO", activeNav: "page-seo", user, body: `<h1 class="page-title">Add a page</h1>${renderForm({ entry: { label, file_path: filePath, meta_title: metaTitle, meta_description: metaDescription, focus_keyphrase: focusKeyphrase }, errors })}` }));
    return;
  }

  try {
    await query(
      `INSERT INTO page_seo (page_key, label, file_path, meta_title, meta_description) VALUES ($1, $2, $3, $4, $5)`,
      [pageKey, label, filePath, metaTitle, metaDescription]
    );
    if (focusKeyphrase) await query(`UPDATE page_seo SET focus_keyphrase = $1 WHERE page_key = $2`, [focusKeyphrase, pageKey]).catch(() => {});
  } catch (err) {
    console.error("[page-seo] create failed:", err.message);
    const dbErrors = err.code === "23505" ? ["A page with this identifier already exists — try a different Label."] : [`Database error: ${err.message}`];
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Page SEO", activeNav: "page-seo", user, body: `<h1 class="page-title">Add a page</h1>${renderForm({ entry: { label, file_path: filePath, meta_title: metaTitle, meta_description: metaDescription, focus_keyphrase: focusKeyphrase }, errors: dbErrors })}` }));
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
  const entry = (await listPageSeo()).find((r) => r.page_key === pageKey);
  if (!entry) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Not found", activeNav: "page-seo", user, body: `<div class="alert alert-error">Page not found.</div><a href="/admin/page-seo" class="btn btn-secondary">Back to Page SEO</a>` }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  const [page, used] = await Promise.all([readPageForSeo(entry.file_path), usedKeyphrases(`page:${pageKey}`)]);
  res.end(layout({ title: "Edit Page SEO", activeNav: "page-seo", user, body: `<h1 class="page-title">Edit "${esc(entry.label)}"</h1>${renderForm({ entry, isEdit: true, page, used })}` }));
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
  const focusKeyphrase = (body.focusKeyphrase || "").trim() || null;

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
    res.end(layout({ title: "Edit Page SEO", activeNav: "page-seo", user, body: renderForm({ entry: { page_key: pageKey, label, file_path: existing.file_path, meta_title: metaTitle, meta_description: metaDescription, focus_keyphrase: focusKeyphrase }, errors, isEdit: true, page: await readPageForSeo(existing.file_path) }) }));
    return;
  }

  try {
    await query(
      `UPDATE page_seo SET label = $1, meta_title = $2, meta_description = $3, updated_at = now() WHERE page_key = $4`,
      [label, metaTitle, metaDescription, pageKey]
    );
    await query(`UPDATE page_seo SET focus_keyphrase = $1 WHERE page_key = $2`, [focusKeyphrase, pageKey])
      .catch((e) => console.error("[page-seo] focus keyphrase not saved (run npm run migrate):", e.message));
  } catch (err) {
    console.error("[page-seo] update failed:", err.message);
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Edit Page SEO", activeNav: "page-seo", user, body: renderForm({ entry: { page_key: pageKey, label, file_path: existing.file_path, meta_title: metaTitle, meta_description: metaDescription, focus_keyphrase: focusKeyphrase }, errors: [`Database error: ${err.message}`], isEdit: true, page: await readPageForSeo(existing.file_path) }) }));
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
