const { query } = require("../db");
const { readFormBody, slugify, esc, linesToArray } = require("../utils");
const { layout } = require("../render");
const { generateTourFile, removeTourFile, isReservedSlug } = require("../ssr/generator");

const ISLANDS = ["Oahu", "Maui", "Kauai", "Big Island"];

/* ============================================================
   List
   ============================================================ */
async function listTours(req, res, user, urlObj) {
  const search = (urlObj.searchParams.get("q") || "").trim();
  const statusFilter = urlObj.searchParams.get("status") || "";

  const conditions = [];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(data->>'name' ILIKE $${params.length} OR slug ILIKE $${params.length})`);
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
      `SELECT id, slug, status, island, price_from, updated_at, data
       FROM tours ${whereClause}
       ORDER BY updated_at DESC
       LIMIT 100`,
      params
    );
    rows = result.rows;
  } catch (err) {
    console.error("[tours] list query failed:", err.message);
    dbError = err.message;
  }

  const tableRows = rows
    .map((t) => {
      const name = (t.data && t.data.name) || t.slug;
      const rating = t.data && t.data.aggregatedRating;
      return `<tr>
        <td><a href="/admin/tours/${t.id}/edit" style="color:var(--color-primary);font-weight:600;">${esc(name)}</a><br>
            <span style="color:var(--color-text-muted);font-size:12px;">${esc(t.slug)}</span></td>
        <td>${esc(t.island || "—")}</td>
        <td><span class="badge ${t.status === "published" ? "badge-published" : "badge-draft"}">${esc(t.status)}</span></td>
        <td>${t.price_from != null ? "$" + esc(t.price_from) : "—"}</td>
        <td>${rating != null ? esc(rating) + "★" : "—"}</td>
        <td>${new Date(t.updated_at).toLocaleDateString()}</td>
        <td>
          <a href="/admin/tours/${t.id}/edit" class="btn btn-secondary btn-sm">Edit</a>
          <form method="POST" action="/admin/tours/${t.id}/delete" style="display:inline;"
                onsubmit="return confirm('Delete this tour? This cannot be undone.');">
            <button type="submit" class="btn btn-danger btn-sm">Delete</button>
          </form>
        </td>
      </tr>`;
    })
    .join("");

  const body = `
    <h1 class="page-title">Tours</h1>
    <p class="page-sub">${rows.length} tour${rows.length === 1 ? "" : "s"} shown (max 100). Search and status filter run against the live database.</p>
    ${dbError ? `<div class="alert alert-error">Database error: ${esc(dbError)}. Check DATABASE_URL and that migrations have run.</div>` : ""}

    <div class="toolbar">
      <form method="GET" action="/admin/tours" style="display:flex;gap:8px;">
        <input type="search" name="q" placeholder="Search by name or slug…" value="${esc(search)}">
        <select name="status" style="padding:8px 12px;border:1px solid var(--color-border);border-radius:4px;">
          <option value="">All statuses</option>
          <option value="published" ${statusFilter === "published" ? "selected" : ""}>Published</option>
          <option value="draft" ${statusFilter === "draft" ? "selected" : ""}>Draft</option>
        </select>
        <button type="submit" class="btn btn-secondary">Filter</button>
      </form>
      <a href="/admin/tours/new" class="btn btn-primary">+ New Tour</a>
    </div>

    <table class="data-table">
      <thead><tr><th>Name</th><th>Island</th><th>Status</th><th>Price</th><th>Rating</th><th>Updated</th><th>Actions</th></tr></thead>
      <tbody>${tableRows || `<tr><td colspan="7" style="text-align:center;color:var(--color-text-muted);padding:32px;">No tours match this search yet.</td></tr>`}</tbody>
    </table>
  `;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Tours", activeNav: "tours", user, body }));
}

/* ============================================================
   Form (shared between New and Edit)
   ============================================================ */
function renderTourForm({ tour = {}, errors = [], formAction, isEdit }) {
  const d = tour.data || {};
  const v = d.verdict || {};
  const gs = d.googleSnapshot || {};
  const rd = d.ratingDistribution || {};
  const bl = d.bookingLinks || {};
  const gallery = d.gallery || [];

  const islandOptions = ISLANDS.map(
    (isl) => `<option value="${isl}" ${tour.island === isl ? "selected" : ""}>${isl}</option>`
  ).join("");

  const galleryThumbs = gallery
    .map(
      (url) => `
      <div style="position:relative;">
        <img src="${esc(url)}" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:4px;border:1px solid var(--color-border);">
        <form method="POST" action="/admin/tours/${tour.id}/remove-image" style="position:absolute;top:4px;right:4px;">
          <input type="hidden" name="imageUrl" value="${esc(url)}">
          <button type="submit" class="btn btn-danger btn-sm" style="padding:2px 8px;" onclick="return confirm('Remove this image?');">✕</button>
        </form>
      </div>`
    )
    .join("");

  return `
    <h1 class="page-title">${isEdit ? "Edit Tour" : "New Tour"}</h1>
    <p class="page-sub">${isEdit ? esc(tour.slug) : "Fields marked with a real dash (—) below don't exist in the imported dataset yet — fill them in here."}</p>

    ${errors.length ? `<div class="alert alert-error">${errors.map(esc).join("<br>")}</div>` : ""}

    <form method="POST" action="${formAction}">
      <div class="form-card">
        <h2>General</h2>
        <div class="form-row">
          <div class="form-field"><label>Tour Name</label><input type="text" name="name" required value="${esc(d.name || "")}"></div>
          <div class="form-field"><label>Slug</label><input type="text" name="slug" value="${esc(tour.slug || "")}"><div class="hint">Leave blank on create to auto-generate from the name.</div></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>Company / Operator</label><input type="text" name="company" value="${esc(d.company || "")}"></div>
          <div class="form-field"><label>Island</label><select name="island"><option value="">— Select —</option>${islandOptions}</select></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>City</label><input type="text" name="city" value="${esc(d.city || "")}"></div>
          <div class="form-field"><label>Tour Type</label><input type="text" name="tourType" value="${esc(d.tourType || "")}" placeholder="e.g. Snorkel Tour"></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>Duration</label><input type="text" name="durationLabel" value="${esc(d.durationLabel || "")}" placeholder="e.g. Half Day"></div>
          <div class="form-field"><label>Status</label>
            <select name="status">
              <option value="draft" ${tour.status !== "published" ? "selected" : ""}>Draft</option>
              <option value="published" ${tour.status === "published" ? "selected" : ""}>Published</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>Price From (USD)</label><input type="number" step="1" min="0" name="priceFrom" value="${esc(tour.price_from != null ? tour.price_from : "")}"></div>
        </div>
      </div>

      <div class="form-card">
        <h2>Booking Links</h2>
        <p class="hint" style="margin:-8px 0 16px;">Each toggle controls whether that button shows on the live Tour Detail page. FareHarbor uses the shortname below to build its link; the other three need a full affiliate URL from that platform's partner dashboard.</p>

        <div class="form-row">
          <div class="form-field"><label>FareHarbor Shortname</label><input type="text" name="fareharborShortname" value="${esc(d.fareharborShortname || "")}"></div>
          <div class="form-field">
            <label><input type="checkbox" name="showFareharbor" value="1" ${bl.fareharbor && bl.fareharbor.show === false ? "" : "checked"}> Show FareHarbor button</label>
          </div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>TripAdvisor Affiliate URL</label><input type="text" name="tripadvisorUrl" value="${esc((bl.tripadvisor && bl.tripadvisor.url) || "")}" placeholder="https://..."></div>
          <div class="form-field">
            <label><input type="checkbox" name="showTripadvisor" value="1" ${bl.tripadvisor && bl.tripadvisor.show ? "checked" : ""}> Show TripAdvisor button</label>
          </div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>GetYourGuide Affiliate URL</label><input type="text" name="getyourguideUrl" value="${esc((bl.getyourguide && bl.getyourguide.url) || "")}" placeholder="https://..."></div>
          <div class="form-field">
            <label><input type="checkbox" name="showGetyourguide" value="1" ${bl.getyourguide && bl.getyourguide.show ? "checked" : ""}> Show GetYourGuide button</label>
          </div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>Viator Affiliate URL</label><input type="text" name="viatorUrl" value="${esc((bl.viator && bl.viator.url) || "")}" placeholder="https://..."></div>
          <div class="form-field">
            <label><input type="checkbox" name="showViator" value="1" ${bl.viator && bl.viator.show ? "checked" : ""}> Show Viator button</label>
          </div>
        </div>
      </div>

      <div class="form-card">
        <h2>Content</h2>
        <div class="form-row full">
          <div class="form-field"><label>Highlights (one per line)</label><textarea name="highlights">${esc((d.highlights || []).join("\n"))}</textarea></div>
        </div>
        <div class="form-row full">
          <div class="form-field"><label>Full Description</label><textarea name="fullDescription" style="min-height:140px;">${esc(d.fullDescription || "")}</textarea></div>
        </div>
      </div>

      <div class="form-card">
        <h2>Our Verdict</h2>
        <div class="form-row full">
          <div class="form-field"><label>Verdict Headline</label><input type="text" name="verdictHeadline" value="${esc(v.headline || "")}"></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>Good For (one per line)</label><textarea name="verdictGoodFor">${esc((v.goodFor || []).join("\n"))}</textarea></div>
          <div class="form-field"><label>Worth Knowing (one per line)</label><textarea name="verdictWorthKnowing">${esc((v.worthKnowing || []).join("\n"))}</textarea></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>Closing Note</label><input type="text" name="verdictClosingNote" value="${esc(v.closingNote || "")}"></div>
          <div class="form-field"><label>Reviewed-By Date</label><input type="date" name="verdictReviewedByDate" value="${esc(v.reviewedByDate || "")}"></div>
        </div>
      </div>

      <div class="form-card">
        <h2>Ratings (manual entry — see tripreviewall-tour-detail-brief.md §7)</h2>
        <div class="form-row">
          <div class="form-field"><label>Aggregated Rating (0–5)</label><input type="number" step="0.1" min="0" max="5" name="aggregatedRating" value="${esc(d.aggregatedRating != null ? d.aggregatedRating : "")}"></div>
          <div class="form-field"><label>Total Review Count</label><input type="number" min="0" name="reviewCountTotal" value="${esc(d.reviewCountTotal != null ? d.reviewCountTotal : "")}"></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>5★ %</label><input type="number" min="0" max="100" name="star5" value="${esc(rd.star5 != null ? rd.star5 : "")}"></div>
          <div class="form-field"><label>4★ %</label><input type="number" min="0" max="100" name="star4" value="${esc(rd.star4 != null ? rd.star4 : "")}"></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>3★ %</label><input type="number" min="0" max="100" name="star3" value="${esc(rd.star3 != null ? rd.star3 : "")}"></div>
          <div class="form-field"><label>2★ %</label><input type="number" min="0" max="100" name="star2" value="${esc(rd.star2 != null ? rd.star2 : "")}"></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>1★ %</label><input type="number" min="0" max="100" name="star1" value="${esc(rd.star1 != null ? rd.star1 : "")}"></div>
        </div>
      </div>

      <div class="form-card">
        <h2>Google Maps Snapshot</h2>
        <div class="form-row full">
          <div class="form-field"><label>Summary (your own paraphrase — never a verbatim quote)</label><textarea name="googleSummary">${esc(gs.summaryText || "")}</textarea></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>Last Checked Date</label><input type="date" name="googleLastChecked" value="${esc(gs.lastCheckedDate || "")}"></div>
        </div>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${isEdit ? "Save Changes" : "Create Tour"}</button>
        <a href="/admin/tours" class="btn btn-secondary">Cancel</a>
      </div>
    </form>

    <div class="form-card">
      <h2>Gallery</h2>
      ${
        !isEdit
          ? `<p class="hint">Save the tour first — image upload becomes available once it has an id.</p>`
          : `
        ${gallery.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-bottom:20px;">${galleryThumbs}</div>` : `<p class="hint" style="margin-bottom:16px;">No images yet.</p>`}
        <form method="POST" action="/admin/tours/${tour.id}/upload-image" enctype="multipart/form-data">
          <div class="form-field">
            <label>Upload image(s) — jpg, png or webp, max 8MB each</label>
            <input type="file" name="images" accept=".jpg,.jpeg,.png,.webp" multiple>
          </div>
          <button type="submit" class="btn btn-secondary" style="margin-top:10px;">Upload</button>
        </form>
      `
      }
    </div>
  `;
}

function bodyToTourData(body, existingData = {}) {
  return {
    name: (body.name || "").trim(),
    company: (body.company || "").trim(),
    city: (body.city || "").trim(),
    tourType: (body.tourType || "").trim(),
    durationLabel: (body.durationLabel || "").trim(),
    fareharborShortname: (body.fareharborShortname || "").trim(),
    highlights: linesToArray(body.highlights),
    fullDescription: (body.fullDescription || "").trim(),
    verdict: {
      headline: (body.verdictHeadline || "").trim(),
      goodFor: linesToArray(body.verdictGoodFor),
      worthKnowing: linesToArray(body.verdictWorthKnowing),
      closingNote: (body.verdictClosingNote || "").trim() || null,
      reviewedByDate: body.verdictReviewedByDate || null,
    },
    googleSnapshot: {
      summaryText: (body.googleSummary || "").trim(),
      lastCheckedDate: body.googleLastChecked || null,
    },
    aggregatedRating: body.aggregatedRating !== "" ? Number(body.aggregatedRating) : null,
    reviewCountTotal: body.reviewCountTotal !== "" ? Number(body.reviewCountTotal) : null,
    ratingDistribution: {
      star5: Number(body.star5) || 0,
      star4: Number(body.star4) || 0,
      star3: Number(body.star3) || 0,
      star2: Number(body.star2) || 0,
      star1: Number(body.star1) || 0,
    },
    bookingLinks: {
      fareharbor: { show: body.showFareharbor === "1" },
      tripadvisor: { url: (body.tripadvisorUrl || "").trim(), show: body.showTripadvisor === "1" },
      getyourguide: { url: (body.getyourguideUrl || "").trim(), show: body.showGetyourguide === "1" },
      viator: { url: (body.viatorUrl || "").trim(), show: body.showViator === "1" },
    },
    // Not edited by this form — preserved from whatever the tour already had,
    // so saving the main form never wipes out uploaded images or variants.
    variants: existingData.variants || [],
    gallery: existingData.gallery || [],
  };
}

/* ============================================================
   New
   ============================================================ */
async function newTourForm(req, res, user) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(
    layout({
      title: "New Tour",
      activeNav: "tours",
      user,
      body: renderTourForm({ formAction: "/admin/tours/new", isEdit: false }),
    })
  );
}

async function createTour(req, res, user) {
  let body;
  try {
    body = await readFormBody(req);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "New Tour", activeNav: "tours", user, body: renderTourForm({ formAction: "/admin/tours/new", isEdit: false, errors: ["Malformed request."] }) }));
    return;
  }

  const errors = [];
  if (!body.name || !body.name.trim()) errors.push("Tour name is required.");

  const slug = slugify(body.slug || body.name);
  if (!slug) errors.push("Could not generate a valid slug — please set one manually.");
  if (isReservedSlug(slug)) errors.push(`"${slug}" is a reserved page name — please choose a different slug.`);

  if (errors.length) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      layout({
        title: "New Tour",
        activeNav: "tours",
        user,
        body: renderTourForm({
          tour: { slug: body.slug, status: body.status, island: body.island, price_from: body.priceFrom, data: bodyToTourData(body) },
          errors,
          formAction: "/admin/tours/new",
          isEdit: false,
        }),
      })
    );
    return;
  }

  const data = bodyToTourData(body);
  const status = body.status === "published" ? "published" : "draft";
  const island = ISLANDS.includes(body.island) ? body.island : null;
  const priceFrom = body.priceFrom !== "" ? Number(body.priceFrom) : null;

  try {
    await query(
      `INSERT INTO tours (slug, status, island, price_from, published_at, created_by, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [slug, status, island, priceFrom, status === "published" ? new Date() : null, user.userId, JSON.stringify(data)]
    );
    if (status === "published") {
      await generateTourFile({ slug, status, island, price_from: priceFrom, data });
    }
  } catch (err) {
    console.error("[tours] create failed:", err.message);
    const dbErrors = err.code === "23505" ? ["A tour with this slug already exists."] : [`Database error: ${err.message}`];
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      layout({
        title: "New Tour",
        activeNav: "tours",
        user,
        body: renderTourForm({ tour: { slug, status, island, price_from: priceFrom, data }, errors: dbErrors, formAction: "/admin/tours/new", isEdit: false }),
      })
    );
    return;
  }

  res.writeHead(302, { Location: "/admin/tours" });
  res.end();
}

/* ============================================================
   Edit / Update / Delete
   ============================================================ */
async function editTourForm(req, res, user, id) {
  let result;
  try {
    result = await query("SELECT * FROM tours WHERE id = $1", [id]);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Error", activeNav: "tours", user, body: `<div class="alert alert-error">Database error: ${esc(err.message)}</div>` }));
    return;
  }
  const tour = result.rows[0];
  if (!tour) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Not found", activeNav: "tours", user, body: `<div class="alert alert-error">Tour not found.</div><a href="/admin/tours" class="btn btn-secondary">Back to Tours</a>` }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Edit Tour", activeNav: "tours", user, body: renderTourForm({ tour, formAction: `/admin/tours/${id}/edit`, isEdit: true }) }));
}

async function updateTour(req, res, user, id) {
  let body;
  try {
    body = await readFormBody(req);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end("Malformed request.");
    return;
  }

  // Fetch the current row first so gallery/variants (not edited by this form)
  // survive the save instead of being wiped out.
  let existing;
  try {
    const existingResult = await query("SELECT slug, status, data FROM tours WHERE id = $1", [id]);
    existing = existingResult.rows[0];
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Error", activeNav: "tours", user, body: `<div class="alert alert-error">Database error: ${esc(err.message)}</div>` }));
    return;
  }
  if (!existing) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Not found", activeNav: "tours", user, body: `<div class="alert alert-error">Tour not found.</div><a href="/admin/tours" class="btn btn-secondary">Back to Tours</a>` }));
    return;
  }

  const errors = [];
  if (!body.name || !body.name.trim()) errors.push("Tour name is required.");
  const slug = slugify(body.slug || body.name);
  if (!slug) errors.push("Could not generate a valid slug.");
  if (isReservedSlug(slug)) errors.push(`"${slug}" is a reserved page name — please choose a different slug.`);

  const data = bodyToTourData(body, existing.data || {});
  const status = body.status === "published" ? "published" : "draft";
  const island = ISLANDS.includes(body.island) ? body.island : null;
  const priceFrom = body.priceFrom !== "" ? Number(body.priceFrom) : null;

  if (errors.length) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      layout({
        title: "Edit Tour",
        activeNav: "tours",
        user,
        body: renderTourForm({ tour: { id, slug, status, island, price_from: priceFrom, data }, errors, formAction: `/admin/tours/${id}/edit`, isEdit: true }),
      })
    );
    return;
  }

  try {
    await query(
      `UPDATE tours SET slug = $1, status = $2, island = $3, price_from = $4,
       published_at = CASE WHEN $2 = 'published' AND published_at IS NULL THEN now() ELSE published_at END,
       updated_at = now(), data = $5
       WHERE id = $6`,
      [slug, status, island, priceFrom, JSON.stringify(data), id]
    );

    // Keep the generated static file (used for SEO/crawlers) in sync.
    // Slug can change on edit, so always clean up the old file first.
    if (existing.slug !== slug) removeTourFile(existing.slug);
    if (status === "published") {
      await generateTourFile({ slug, status, island, price_from: priceFrom, data });
    } else {
      removeTourFile(slug);
    }
  } catch (err) {
    console.error("[tours] update failed:", err.message);
    const dbErrors = err.code === "23505" ? ["Another tour already uses this slug."] : [`Database error: ${err.message}`];
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      layout({
        title: "Edit Tour",
        activeNav: "tours",
        user,
        body: renderTourForm({ tour: { id, slug, status, island, price_from: priceFrom, data }, errors: dbErrors, formAction: `/admin/tours/${id}/edit`, isEdit: true }),
      })
    );
    return;
  }

  res.writeHead(302, { Location: "/admin/tours" });
  res.end();
}

async function deleteTour(req, res, user, id) {
  try {
    const result = await query("DELETE FROM tours WHERE id = $1 RETURNING slug", [id]);
    if (result.rows[0]) removeTourFile(result.rows[0].slug);
  } catch (err) {
    console.error("[tours] delete failed:", err.message);
  }
  res.writeHead(302, { Location: "/admin/tours" });
  res.end();
}

/* ============================================================
   Gallery — upload / remove images
   ============================================================ */
async function uploadTourImage(req, res, user, id) {
  const { parseImageUpload } = require("../upload");

  let existing;
  try {
    const result = await query("SELECT slug, status, island, price_from, data FROM tours WHERE id = $1", [id]);
    existing = result.rows[0];
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`Database error: ${esc(err.message)}`);
    return;
  }
  if (!existing) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end("Tour not found.");
    return;
  }

  let uploadResult;
  try {
    uploadResult = await parseImageUpload(req, "tours", existing.slug);
  } catch (err) {
    console.error("[tours] image upload parse failed:", err.message);
    res.writeHead(302, { Location: `/admin/tours/${id}/edit` });
    res.end();
    return;
  }

  const data = existing.data || {};
  data.gallery = [...(data.gallery || []), ...uploadResult.urls];

  try {
    await query("UPDATE tours SET data = $1, updated_at = now() WHERE id = $2", [JSON.stringify(data), id]);
    if (existing.status === "published") {
      await generateTourFile({ slug: existing.slug, status: existing.status, island: existing.island, price_from: existing.price_from, data });
    }
  } catch (err) {
    console.error("[tours] saving uploaded image urls failed:", err.message);
  }

  res.writeHead(302, { Location: `/admin/tours/${id}/edit` });
  res.end();
}

async function removeTourImage(req, res, user, id) {
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
    const result = await query("SELECT slug, status, island, price_from, data FROM tours WHERE id = $1", [id]);
    existing = result.rows[0];
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`Database error: ${esc(err.message)}`);
    return;
  }
  if (!existing) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end("Tour not found.");
    return;
  }

  const data = existing.data || {};
  data.gallery = (data.gallery || []).filter((url) => url !== body.imageUrl);

  try {
    await query("UPDATE tours SET data = $1, updated_at = now() WHERE id = $2", [JSON.stringify(data), id]);
    if (existing.status === "published") {
      await generateTourFile({ slug: existing.slug, status: existing.status, island: existing.island, price_from: existing.price_from, data });
    }
  } catch (err) {
    console.error("[tours] removing image failed:", err.message);
  }

  res.writeHead(302, { Location: `/admin/tours/${id}/edit` });
  res.end();
}

module.exports = { listTours, newTourForm, createTour, editTourForm, updateTour, deleteTour, uploadTourImage, removeTourImage };
