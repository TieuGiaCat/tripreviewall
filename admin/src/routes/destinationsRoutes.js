const { query } = require("../db");
const { readFormBody, esc } = require("../utils");
const { layout } = require("../render");

/* ============================================================
   List — always exactly 4 rows (Oahu, Maui, Kauai, Big Island).
   Not creatable/deletable by editors, per master-technical-architecture.md §6.6.
   ============================================================ */
async function listDestinations(req, res, user) {
  let rows = [];
  let dbError = null;
  try {
    const result = await query(`SELECT id, slug, status, updated_at, data FROM destinations ORDER BY slug ASC`);
    rows = result.rows;
  } catch (err) {
    console.error("[destinations] list failed:", err.message);
    dbError = err.message;
  }

  const tableRows = rows
    .map((d) => {
      const data = d.data || {};
      return `<tr>
        <td><a href="/admin/destinations/${d.id}/edit" style="color:var(--color-primary);font-weight:600;">${esc(data.islandName || d.slug)}</a></td>
        <td>${data.heroImage ? `<img src="${esc(data.heroImage)}" style="width:60px;height:38px;object-fit:cover;border-radius:4px;">` : `<span style="color:var(--color-text-muted);">No photo</span>`}</td>
        <td>${(data.introText || "").length > 80 ? esc(data.introText.slice(0, 80)) + "…" : esc(data.introText || "—")}</td>
        <td>${new Date(d.updated_at).toLocaleDateString()}</td>
        <td><a href="/admin/destinations/${d.id}/edit" class="btn btn-secondary btn-sm">Edit</a></td>
      </tr>`;
    })
    .join("");

  const body = `
    <h1 class="page-title">Destinations</h1>
    <p class="page-sub">The 4 island pillar pages. These aren't created or deleted here — just edit the intro copy and hero photo for each.</p>
    ${dbError ? `<div class="alert alert-error">Database error: ${esc(dbError)}. Run <code>npm run migrate</code> if the "destinations" table doesn't exist yet — it auto-seeds the 4 islands.</div>` : ""}
    ${!dbError && rows.length === 0 ? `<div class="alert alert-error">No destination rows found yet. Run <code>npm run migrate</code> once — it auto-seeds the 4 islands.</div>` : ""}

    <table class="data-table">
      <thead><tr><th>Island</th><th>Hero Photo</th><th>Intro (preview)</th><th>Updated</th><th>Actions</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  `;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Destinations", activeNav: "destinations", user, body }));
}

/* ============================================================
   Edit
   ============================================================ */
function renderDestinationForm({ destination, errors = [] }) {
  const d = destination.data || {};
  const seo = d.seo || {};

  return `
    <h1 class="page-title">Edit Destination — ${esc(d.islandName || destination.slug)}</h1>
    <p class="page-sub">${esc(destination.slug)}</p>

    ${errors.length ? `<div class="alert alert-error">${errors.map(esc).join("<br>")}</div>` : ""}

    <form method="POST" action="/admin/destinations/${destination.id}/edit">
      <div class="form-card">
        <h2>Intro Copy</h2>
        <div class="form-row full">
          <div class="form-field">
            <label>Intro Text (shown on the island page, under the hero)</label>
            <textarea name="introText" required style="min-height:110px;">${esc(d.introText || "")}</textarea>
          </div>
        </div>
      </div>

      <div class="form-card">
        <h2>SEO (optional — falls back to the default title/description if left blank)</h2>
        <div class="form-row">
          <div class="form-field"><label>Meta Title</label><input type="text" name="metaTitle" value="${esc(seo.metaTitle || "")}"></div>
          <div class="form-field"><label>Meta Description</label><input type="text" name="metaDescription" value="${esc(seo.metaDescription || "")}"></div>
        </div>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Save Changes</button>
        <a href="/admin/destinations" class="btn btn-secondary">Cancel</a>
      </div>
    </form>

    <div class="form-card">
      <h2>Hero Photo</h2>
      ${d.heroImage ? `<img src="${esc(d.heroImage)}" style="max-width:400px;border-radius:4px;border:1px solid var(--color-border);margin-bottom:16px;display:block;">` : `<p class="hint" style="margin-bottom:16px;">No hero photo yet — the page uses a flat color gradient until one is uploaded.</p>`}
      <form method="POST" action="/admin/destinations/${destination.id}/upload-image" enctype="multipart/form-data">
        <div class="form-field">
          <label>Upload hero photo — jpg, png or webp, max 8MB (replaces the current one)</label>
          <input type="file" name="images" accept=".jpg,.jpeg,.png,.webp">
        </div>
        <button type="submit" class="btn btn-secondary" style="margin-top:10px;">Upload</button>
        <button type="button" class="btn btn-secondary" style="margin-top:10px;" onclick="openMediaPicker('destination', '${destination.id}')">Browse Existing Images</button>
      </form>
    </div>
  `;
}

async function editDestinationForm(req, res, user, id) {
  let result;
  try {
    result = await query("SELECT * FROM destinations WHERE id = $1", [id]);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Error", activeNav: "destinations", user, body: `<div class="alert alert-error">Database error: ${esc(err.message)}</div>` }));
    return;
  }
  const destination = result.rows[0];
  if (!destination) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Not found", activeNav: "destinations", user, body: `<div class="alert alert-error">Destination not found.</div><a href="/admin/destinations" class="btn btn-secondary">Back to Destinations</a>` }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Edit Destination", activeNav: "destinations", user, body: renderDestinationForm({ destination }) }));
}

async function updateDestination(req, res, user, id) {
  const { regenerateListingPages } = require("../ssr/generator");

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
    const result = await query("SELECT * FROM destinations WHERE id = $1", [id]);
    existing = result.rows[0];
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Error", activeNav: "destinations", user, body: `<div class="alert alert-error">Database error: ${esc(err.message)}</div>` }));
    return;
  }
  if (!existing) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Not found", activeNav: "destinations", user, body: `<div class="alert alert-error">Destination not found.</div>` }));
    return;
  }

  const errors = [];
  if (!body.introText || !body.introText.trim()) errors.push("Intro text is required.");

  const existingData = existing.data || {};
  const data = {
    islandName: existingData.islandName, // never editable — fixed to the seeded island
    heroImage: existingData.heroImage || null, // preserved — this form doesn't touch it
    introText: (body.introText || "").trim(),
    seo: {
      metaTitle: (body.metaTitle || "").trim() || null,
      metaDescription: (body.metaDescription || "").trim() || null,
    },
  };

  if (errors.length) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Edit Destination", activeNav: "destinations", user, body: renderDestinationForm({ destination: { ...existing, data }, errors }) }));
    return;
  }

  try {
    await query("UPDATE destinations SET data = $1, updated_at = now() WHERE id = $2", [JSON.stringify(data), id]);
    await regenerateListingPages();
  } catch (err) {
    console.error("[destinations] update failed:", err.message);
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Edit Destination", activeNav: "destinations", user, body: renderDestinationForm({ destination: { ...existing, data }, errors: [`Database error: ${err.message}`] }) }));
    return;
  }

  res.writeHead(302, { Location: "/admin/destinations" });
  res.end();
}

/* ============================================================
   Hero image upload
   ============================================================ */
async function uploadDestinationImage(req, res, user, id) {
  const { parseImageUpload } = require("../upload");
  const { regenerateListingPages } = require("../ssr/generator");

  let existing;
  try {
    const result = await query("SELECT slug, data FROM destinations WHERE id = $1", [id]);
    existing = result.rows[0];
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`Database error: ${esc(err.message)}`);
    return;
  }
  if (!existing) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end("Destination not found.");
    return;
  }

  let uploadResult;
  try {
    uploadResult = await parseImageUpload(req, "destinations", existing.slug);
  } catch (err) {
    console.error("[destinations] image upload parse failed:", err.message);
    res.writeHead(302, { Location: `/admin/destinations/${id}/edit` });
    res.end();
    return;
  }

  if (uploadResult.urls.length > 0) {
    const data = existing.data || {};
    data.heroImage = uploadResult.urls[0];
    try {
      await query("UPDATE destinations SET data = $1, updated_at = now() WHERE id = $2", [JSON.stringify(data), id]);
      await regenerateListingPages();
    } catch (err) {
      console.error("[destinations] saving hero image url failed:", err.message);
    }
  }

  res.writeHead(302, { Location: `/admin/destinations/${id}/edit` });
  res.end();
}

module.exports = { listDestinations, editDestinationForm, updateDestination, uploadDestinationImage };
