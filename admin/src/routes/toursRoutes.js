const { query } = require("../db");
const { readFormBody, slugify, esc, linesToArray } = require("../utils");
const { layout, paginationHtml } = require("../render");
const { generateTourFile, removeTourFile, isReservedSlug, regenerateListingPages } = require("../ssr/generator");
const { logAudit } = require("../auditLog");
const { LEGACY_EDITORS_PICK_SLUGS } = require("../siteConfig");
const { tourAffiliateIssues, SQL_HAS_AFFILIATE_ISSUE, clientRulesJson } = require("../lib/affiliateLinks");

const ISLANDS = ["Oahu", "Maui", "Kauai", "Big Island"];

/* ============================================================
   List
   ============================================================ */
async function listTours(req, res, user, urlObj) {
  const search = (urlObj.searchParams.get("q") || "").trim();
  const statusFilter = urlObj.searchParams.get("status") || "";
  const islandFilter = urlObj.searchParams.get("island") || "";
  const linksFilter = urlObj.searchParams.get("links") === "missing" ? "missing" : "";
  const SORTS = {
    updated_desc: { label: "Updated — newest first", sql: "updated_at DESC" },
    updated_asc: { label: "Updated — oldest first", sql: "updated_at ASC" },
    name_asc: { label: "Name A → Z", sql: "lower(coalesce(data->>'name', slug)) ASC" },
    name_desc: { label: "Name Z → A", sql: "lower(coalesce(data->>'name', slug)) DESC" },
  };
  const sort = SORTS[urlObj.searchParams.get("sort")] ? urlObj.searchParams.get("sort") : "updated_desc";
  const page = Math.max(1, parseInt(urlObj.searchParams.get("page"), 10) || 1);
  const PAGE_SIZE = 10;

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
  if (ISLANDS.includes(islandFilter)) {
    params.push(islandFilter);
    conditions.push(`island = $${params.length}`);
  } else if (islandFilter === "none") {
    conditions.push(`(island IS NULL OR island = '')`);
  }
  if (linksFilter === "missing") conditions.push(SQL_HAS_AFFILIATE_ISSUE);
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  let rows = [];
  let totalCount = 0;
  let dbError = null;
  try {
    const countResult = await query(`SELECT count(*)::int AS n FROM tours ${whereClause}`, params);
    totalCount = countResult.rows[0].n;

    const result = await query(
      `SELECT id, slug, status, island, price_from, updated_at, data
       FROM tours ${whereClause}
       ORDER BY ${SORTS[sort].sql}, id ASC
       LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
      params
    );
    rows = result.rows;
  } catch (err) {
    console.error("[tours] list query failed:", err.message);
    dbError = err.message;
  }
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Clickable column headers: keep the current search/filters, flip the sort.
  const sortLink = (label, nextSort, arrow) => {
    const qs = new URLSearchParams({ q: search, status: statusFilter, island: islandFilter, links: linksFilter, sort: nextSort });
    return `<a href="/admin/tours?${esc(qs.toString())}" style="color:inherit;text-decoration:none;">${label}${arrow}</a>`;
  };

  const tableRows = rows
    .map((t) => {
      const name = (t.data && t.data.name) || t.slug;
      const rating = t.data && t.data.aggregatedRating;
      return `<tr>
        <td><a href="/admin/tours/${t.id}/edit" style="color:var(--color-primary);font-weight:600;">${esc(name)}</a><br>
            <span style="color:var(--color-text-muted);font-size:12px;">${esc(t.slug)}</span>
            ${(() => { const issues = tourAffiliateIssues(t.data); return issues.length ? `<br><span title="${esc(issues.map((i) => i.message).join("\n"))}" style="display:inline-block;margin-top:4px;padding:1px 8px;border-radius:999px;background:#fff8e1;border:1px solid #f0c36d;color:#7a5a00;font-size:11px;font-weight:600;">⚠ ${issues.length} link${issues.length > 1 ? "s" : ""} without affiliate ID</span>` : ""; })()}</td>
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
    <p class="page-sub">${totalCount} tour${totalCount === 1 ? "" : "s"} total — showing ${rows.length ? (page - 1) * PAGE_SIZE + 1 : 0}–${(page - 1) * PAGE_SIZE + rows.length}. Search, filters and sorting run against the live database.</p>
    ${dbError ? `<div class="alert alert-error">Database error: ${esc(dbError)}. Check DATABASE_URL and that migrations have run.</div>` : ""}

    <div class="toolbar">
      <form method="GET" action="/admin/tours" style="display:flex;gap:8px;">
        <input type="search" name="q" placeholder="Search by name or slug…" value="${esc(search)}">
        <select name="status" style="padding:8px 12px;border:1px solid var(--color-border);border-radius:4px;">
          <option value="">All statuses</option>
          <option value="published" ${statusFilter === "published" ? "selected" : ""}>Published</option>
          <option value="draft" ${statusFilter === "draft" ? "selected" : ""}>Draft</option>
        </select>
        <select name="island" style="padding:8px 12px;border:1px solid var(--color-border);border-radius:4px;">
          <option value="">All islands</option>
          ${ISLANDS.map((isl) => `<option value="${isl}" ${islandFilter === isl ? "selected" : ""}>${isl}</option>`).join("")}
          <option value="none" ${islandFilter === "none" ? "selected" : ""}>No island set</option>
        </select>
        <select name="links" style="padding:8px 12px;border:1px solid var(--color-border);border-radius:4px;">
          <option value="">All booking links</option>
          <option value="missing" ${linksFilter === "missing" ? "selected" : ""}>⚠ Missing affiliate ID</option>
        </select>
        <select name="sort" style="padding:8px 12px;border:1px solid var(--color-border);border-radius:4px;">
          ${Object.entries(SORTS).map(([key, o]) => `<option value="${key}" ${sort === key ? "selected" : ""}>${o.label}</option>`).join("")}
        </select>
        <button type="submit" class="btn btn-secondary">Filter</button>
      </form>
      <a href="/admin/tours/new" class="btn btn-primary">+ New Tour</a>
      <a href="/admin/tours/import" class="btn btn-secondary">Import / Export</a>
    </div>

    <table class="data-table">
      <thead><tr><th>${sortLink("Name", sort === "name_asc" ? "name_desc" : "name_asc", sort.startsWith("name_") ? (sort === "name_asc" ? " ▲" : " ▼") : "")}</th><th>Island</th><th>Status</th><th>Price</th><th>Rating</th><th>${sortLink("Updated", sort === "updated_desc" ? "updated_asc" : "updated_desc", sort.startsWith("updated_") ? (sort === "updated_desc" ? " ▼" : " ▲") : "")}</th><th>Actions</th></tr></thead>
      <tbody>${tableRows || `<tr><td colspan="7" style="text-align:center;color:var(--color-text-muted);padding:32px;">No tours match this search yet.</td></tr>`}</tbody>
    </table>
    ${paginationHtml(page, totalPages, "/admin/tours", { q: search, status: statusFilter, island: islandFilter, links: linksFilter, sort })}
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
  const loc = d.location || {};
  const gallery = d.gallery || [];
  const pk = d.packages || {};
  const pkItems = Array.isArray(pk.items) ? pk.items : [];
  // JSON for the client-side package editor; "<" escaped so a value can never close the <script>.
  const pkJson = JSON.stringify(pkItems.map((p) => ({ name: p.name || "", price: p.price != null ? p.price : "", features: (p.features || []).join("\n") }))).replace(/</g, "\\u003c");

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
      <div class="tab-nav" style="display:flex;gap:8px;margin-bottom:16px;">
        <button type="button" class="btn btn-secondary tour-tab-btn" data-tab="basics" onclick="switchTourTab('basics')" style="background:var(--color-primary,#c1440e);color:#fff;">1. Basics</button>
        <button type="button" class="btn btn-secondary tour-tab-btn" data-tab="content" onclick="switchTourTab('content')">2. Content &amp; Reviews</button>
        <button type="button" class="btn btn-secondary tour-tab-btn" data-tab="packages" onclick="switchTourTab('packages')">3. Packages</button>
      </div>

      <div class="tour-tab-panel" data-tab-panel="basics">
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
          <div class="form-field"><label>Operator Contact Phone</label><input type="text" name="contactPhone" value="${esc(d.contactPhone || "")}" placeholder="e.g. (808) 555-0123"></div>
          <div class="form-field"><label>Operator Contact Email</label><input type="email" name="contactEmail" value="${esc(d.contactEmail || "")}" placeholder="e.g. info@operator.com"></div>
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
          <div class="form-field"><label><input type="checkbox" name="editorsPick" value="1" ${(typeof d.editorsPick === "boolean" ? d.editorsPick : LEGACY_EDITORS_PICK_SLUGS.includes(tour.slug)) ? "checked" : ""}> Editor's Pick</label><div class="hint">Shows an "Editor's Pick" badge on the tour card and puts it first on the home page.</div></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>FareHarbor Item ID</label><input type="text" name="fareharborItemId" value="${esc(d.fareharborItemId || "")}" placeholder="e.g. 115595"><div class="hint">The primary item_id for this tour — used to match FareHarbor import files.</div></div>
        </div>
      </div>

      <div class="form-card">
        <h2>Booking Links</h2>
        ${(() => { const issues = tourAffiliateIssues(d); return issues.length ? `<div class="alert" style="background:#fff8e1;border:1px solid #f0c36d;color:#7a5a00;margin-bottom:16px;"><strong>⚠ ${issues.length} booking link${issues.length > 1 ? "s are" : " is"} missing our affiliate ID</strong> — visitors can still book, but we earn no commission:<br>${issues.map((i) => "• " + esc(i.message)).join("<br>")}</div>` : ""; })()}
        <p class="hint" style="margin:-8px 0 16px;">Each toggle controls whether that button shows on the live Tour Detail page. FareHarbor uses the full "regular_link" URL from its own partner export (not a shortname) — the other three need a full affiliate URL from that platform's partner dashboard.</p>

        <div class="form-row">
          <div class="form-field"><label>FareHarbor Regular Link</label><input type="text" name="fareharborRegularLink" data-aff="fareharbor" value="${esc(d.fareharborRegularLink || "")}" placeholder="https://fareharbor.com/embeds/book/.../items/.../"><div class="aff-warn" hidden></div></div>
          <div class="form-field">
            <label><input type="checkbox" name="showFareharbor" value="1" ${bl.fareharbor && bl.fareharbor.show === false ? "" : "checked"}> Show FareHarbor button</label>
          </div>
        </div>
        <div class="form-row full">
          <div class="form-field"><label>FareHarbor Calendar Script</label><textarea name="fareharborCalendarScript" style="min-height:80px;font-family:monospace;font-size:12px;" data-aff="fareharbor-script" placeholder='&lt;script src="https://fareharbor.com/embeds/script/calendar/..."&gt;&lt;/script&gt;'>${esc(d.fareharborCalendarScript || "")}</textarea><div class="aff-warn" hidden></div><div class="hint">Paste the "calendar_script" cell from the FareHarbor export — renders the real booking calendar on the live page.</div></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>TripAdvisor Affiliate URL</label><input type="text" name="tripadvisorUrl" value="${esc((bl.tripadvisor && bl.tripadvisor.url) || "")}" placeholder="https://..."></div>
          <div class="form-field">
            <label><input type="checkbox" name="showTripadvisor" value="1" ${bl.tripadvisor && bl.tripadvisor.show ? "checked" : ""}> Show TripAdvisor button</label>
          </div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>GetYourGuide Affiliate URL</label><input type="text" name="getyourguideUrl" data-aff="getyourguide" value="${esc((bl.getyourguide && bl.getyourguide.url) || "")}" placeholder="https://..."><div class="aff-warn" hidden></div></div>
          <div class="form-field">
            <label><input type="checkbox" name="showGetyourguide" value="1" ${bl.getyourguide && bl.getyourguide.show ? "checked" : ""}> Show GetYourGuide button</label>
          </div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>Viator Affiliate URL</label><input type="text" name="viatorUrl" data-aff="viator" value="${esc((bl.viator && bl.viator.url) || "")}" placeholder="https://..."><div class="aff-warn" hidden></div></div>
          <div class="form-field">
            <label><input type="checkbox" name="showViator" value="1" ${bl.viator && bl.viator.show ? "checked" : ""}> Show Viator button</label>
          </div>
        </div>
      </div>

      <div class="form-card">
        <h2>Location</h2>
        <p class="hint" style="margin:-8px 0 16px;">Powers the Google Maps embed on the live Tour Detail page. Latitude is the N/S coordinate (roughly 19–22 for Hawaii); Longitude is E/W (roughly -155 to -160). Leave both blank to hide the map.</p>
        <div class="form-row">
          <div class="form-field"><label>Latitude</label><input type="text" name="locationLat" value="${esc(loc.lat != null ? loc.lat : "")}" placeholder="e.g. 21.51245"></div>
          <div class="form-field"><label>Longitude</label><input type="text" name="locationLng" value="${esc(loc.lng != null ? loc.lng : "")}" placeholder="e.g. -157.837"></div>
        </div>
      </div>
      </div>

      <div class="tour-tab-panel" data-tab-panel="content" style="display:none;">
      <div class="form-card">
        <h2>Content</h2>
        <div class="form-row full">
          <div class="form-field"><label>Highlights (one per line)</label><textarea name="highlights">${esc((d.highlights || []).join("\n"))}</textarea></div>
        </div>
        <div class="form-row full">
          <div class="form-field"><label>Full Description</label><textarea name="fullDescription" style="min-height:140px;">${esc(d.fullDescription || "")}</textarea></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>Meta Title (optional — falls back to Tour Name + Company)</label><input type="text" name="metaTitle" value="${esc(d.metaTitle || "")}" maxlength="70"></div>
          <div class="form-field"><label>Meta Description (optional — falls back to Full Description)</label><input type="text" name="metaDescription" value="${esc(d.metaDescription || "")}" maxlength="160"></div>
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
        <h2>Ratings by Platform</h2>
        <p class="hint" style="margin:-8px 0 16px;">Tick a platform to show its card in the "Review" tab of the live page, then enter that platform's star rating (0–5) and review count. The overall rating and total review count at the top of the page are calculated automatically from the ticked platforms (weighted by review count).</p>
        ${RATING_PLATFORMS.map((p) => {
          const r = (d.ratingsBySource || {})[p.key] || {};
          const shown = ratingShown(d.ratingsBySource || {}, p.key);
          return `
        <div class="form-row" style="align-items:end;border-top:1px solid var(--color-border);padding-top:12px;margin-top:4px;">
          <div class="form-field" style="max-width:220px;"><label><input type="checkbox" name="rating_${p.key}_show" value="1" ${shown ? "checked" : ""}> Show ${p.label}</label></div>
          <div class="form-field"><label>${p.label} stars (0–5)</label><input type="number" step="0.1" min="0" max="5" name="rating_${p.key}_avg" value="${esc(r.avg != null ? r.avg : "")}" placeholder="e.g. 4.7"></div>
          <div class="form-field"><label>${p.label} review count</label><input type="number" step="1" min="0" name="rating_${p.key}_count" value="${esc(r.count != null ? r.count : "")}" placeholder="e.g. 1250"></div>
        </div>`;
        }).join("")}
        <p class="hint" style="margin-top:12px;">Current overall: ${d.aggregatedRating != null ? esc(d.aggregatedRating) + "★" : "—"} from ${d.reviewCountTotal != null ? esc(d.reviewCountTotal) : "—"} reviews.</p>
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
      </div>

      <div class="tour-tab-panel" data-tab-panel="packages" style="display:none;">
      <div class="form-card">
        <h2>Packages</h2>
        <p class="hint" style="margin:-8px 0 16px;">For tours sold in several tiers (e.g. Classic / Premium / Royal). When shown, a side-by-side comparison appears at the top of the Overview tab on the live page, above the "Overview" heading.</p>
        <div class="form-row">
          <div class="form-field">
            <label><input type="checkbox" name="showPackages" value="1" ${pk.show ? "checked" : ""}> Show packages on the live page</label>
          </div>
          <div class="form-field">
            <label>Number of packages</label>
            <input type="number" id="packageCount" name="packageCount" min="0" max="10" step="1" value="${pkItems.length}" oninput="renderPackageFields()">
            <div class="hint">Type 1, 2, 3… — that many package boxes appear below. Lowering the number removes the last boxes when you save.</div>
          </div>
        </div>
        <div id="packageFields"></div>
      </div>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${isEdit ? "Save Changes" : "Create Tour"}</button>
        <a href="/admin/tours" class="btn btn-secondary">Cancel</a>
      </div>
    </form>
    <style>
      .aff-warn { margin-top:6px; padding:8px 10px; border-radius:4px; background:#fff8e1; border:1px solid #f0c36d; color:#7a5a00; font-size:12px; line-height:1.4; }
      .aff-warn button { margin-left:6px; padding:2px 8px; font-size:12px; border:1px solid #b88a00; background:#fff; color:#7a5a00; border-radius:3px; cursor:pointer; }
      .aff-ok { border-color:#9cc5a1 !important; }
    </style>
    <script>
      // Live check: does each booking link carry OUR affiliate ID? (rules from lib/affiliateLinks.js)
      var AFF_RULES = ${clientRulesJson()};
      function affParse(v) { try { return new URL(String(v || "").trim().replace(/&amp;/g, "&")); } catch (e) { return null; } }
      function affHostOk(u, hosts) { var h = u.hostname.toLowerCase(); return hosts.some(function (d) { return h === d || h.slice(-(d.length + 1)) === "." + d; }); }
      function affCheck(platform, value) {
        var rule = AFF_RULES[platform]; if (!rule || !String(value || "").trim()) return null;
        var u = affParse(value); if (!u) return rule.label + " link is not a valid URL.";
        if (!affHostOk(u, rule.hosts)) return rule.label + " link doesn't point to " + rule.hosts[0] + ".";
        var missing = Object.keys(rule.required).filter(function (k) { return u.searchParams.get(k) !== rule.required[k]; }).map(function (k) { return k + "=" + rule.required[k]; });
        return missing.length ? "Missing our affiliate ID (" + missing.join(", ") + ") — bookings through this link earn no commission." : null;
      }
      function affFix(platform, value) {
        var rule = AFF_RULES[platform]; var u = affParse(value); if (!rule || !u) return value;
        Object.keys(rule.add).forEach(function (k) { u.searchParams.set(k, rule.add[k]); });
        return u.toString();
      }
      function affScriptSrc(v) { var m = String(v || "").match(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i); return m ? m[1] : null; }
      function affRefresh(input) {
        var kind = input.getAttribute("data-aff");
        var box = input.parentElement.querySelector(".aff-warn");
        if (!box) return;
        var problem = null, fixed = null;
        if (kind === "fareharbor-script") {
          if (String(input.value).trim()) {
            var src = affScriptSrc(input.value);
            if (!src) problem = 'No <script src="…"> found — paste the full calendar_script cell from FareHarbor.';
            else { problem = affCheck("fareharbor", src); if (problem) fixed = input.value.replace(src, affFix("fareharbor", src)); }
          }
        } else {
          problem = affCheck(kind, input.value);
          if (problem && affParse(input.value) && affHostOk(affParse(input.value), AFF_RULES[kind].hosts)) fixed = affFix(kind, input.value);
        }
        input.classList.toggle("aff-ok", !problem && !!String(input.value).trim());
        if (!problem) { box.hidden = true; box.innerHTML = ""; return; }
        box.hidden = false;
        box.textContent = "⚠ " + problem;
        if (fixed) {
          var btn = document.createElement("button");
          btn.type = "button"; btn.textContent = "Add our affiliate ID";
          btn.addEventListener("click", function () { input.value = fixed; affRefresh(input); });
          box.appendChild(btn);
        }
      }
      document.querySelectorAll("[data-aff]").forEach(function (input) {
        input.addEventListener("input", function () { affRefresh(input); });
        affRefresh(input);
      });

      var PACKAGE_DATA = ${pkJson};
      function escAttr(v) {
        return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      }
      function renderPackageFields() {
        var box = document.getElementById('packageFields');
        if (!box) return;
        // Keep whatever was already typed before rebuilding the boxes.
        box.querySelectorAll('.package-edit').forEach(function (el, i) {
          PACKAGE_DATA[i] = {
            name: el.querySelector('[name="pkgName_' + i + '"]').value,
            price: el.querySelector('[name="pkgPrice_' + i + '"]').value,
            features: el.querySelector('[name="pkgItems_' + i + '"]').value
          };
        });
        var n = parseInt(document.getElementById('packageCount').value, 10);
        if (isNaN(n) || n < 0) n = 0;
        if (n > 10) n = 10;
        var html = '';
        for (var i = 0; i < n; i++) {
          var p = PACKAGE_DATA[i] || { name: '', price: '', features: '' };
          html += '<div class="package-edit" style="border:1px solid var(--color-border);border-radius:6px;padding:16px;margin-top:16px;">' +
            '<h3 style="margin:0 0 12px;font-size:15px;">Package ' + (i + 1) + '</h3>' +
            '<div class="form-row">' +
              '<div class="form-field"><label>Package name</label><input type="text" name="pkgName_' + i + '" value="' + escAttr(p.name) + '" placeholder="e.g. Premium Package"></div>' +
              '<div class="form-field"><label>Price (USD)</label><input type="number" step="0.01" min="0" name="pkgPrice_' + i + '" value="' + escAttr(p.price) + '" placeholder="e.g. 169"></div>' +
            '</div>' +
            '<div class="form-row full">' +
              '<div class="form-field"><label>What&#39;s included (one per line)</label><textarea name="pkgItems_' + i + '" style="min-height:120px;" placeholder="Fresh flower lei greeting&#10;All-you-can-eat luau feast&#10;Front section seating">' + escAttr(p.features) + '</textarea></div>' +
            '</div>' +
          '</div>';
        }
        box.innerHTML = html;
      }
      renderPackageFields();
      function switchTourTab(tab) {
        document.querySelectorAll('.tour-tab-panel').forEach(function (el) {
          el.style.display = el.getAttribute('data-tab-panel') === tab ? '' : 'none';
        });
        document.querySelectorAll('.tour-tab-btn').forEach(function (btn) {
          var active = btn.getAttribute('data-tab') === tab;
          btn.style.background = active ? 'var(--color-primary, #c1440e)' : '';
          btn.style.color = active ? '#fff' : '';
        });
      }
    </script>

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
          <button type="button" class="btn btn-secondary" style="margin-top:10px;" onclick="openMediaPicker('tour', '${tour.id}')">Browse Existing Images</button>
        </form>
      `
      }
    </div>
  `;
}

/* ---- Ratings by platform ----
   data.ratingsBySource = { google|tripadvisor|getyourguide|viator: { avg, count, show } }
   Older tours have no "show" flag yet: there, a platform counts as shown when
   it has a rating (same as the page behaved before), Google defaults hidden. */
const RATING_PLATFORMS = [
  { key: "google", label: "Google Maps" },
  { key: "tripadvisor", label: "TripAdvisor" },
  { key: "getyourguide", label: "GetYourGuide" },
  { key: "viator", label: "Viator" },
];
function ratingShown(rbs, key) {
  const r = (rbs || {})[key];
  if (!r) return false;
  if (typeof r.show === "boolean") return r.show;
  return key !== "google" && r.avg != null;
}
/** Overall rating = review-count-weighted average of the shown platforms. */
function computeAggregate(rbs) {
  let total = 0, weighted = 0, plain = [], n = 0;
  RATING_PLATFORMS.forEach((p) => {
    const r = rbs[p.key];
    if (!ratingShown(rbs, p.key) || r.avg == null) return;
    n++;
    const c = Number(r.count) || 0;
    total += c; weighted += Number(r.avg) * c; plain.push(Number(r.avg));
  });
  if (!n) return null;
  const avg = total > 0 ? weighted / total : plain.reduce((a, b) => a + b, 0) / plain.length;
  return { aggregatedRating: Math.round(avg * 10) / 10, reviewCountTotal: total };
}
function ratingsFromBody(body, existingData) {
  const rbs = { ...(existingData.ratingsBySource || {}) };
  RATING_PLATFORMS.forEach((p) => {
    const avgRaw = (body[`rating_${p.key}_avg`] || "").trim();
    const countRaw = (body[`rating_${p.key}_count`] || "").trim();
    const avg = avgRaw !== "" && !isNaN(Number(avgRaw)) ? Math.min(5, Math.max(0, Number(avgRaw))) : null;
    const count = countRaw !== "" && !isNaN(Number(countRaw)) ? Math.max(0, Math.round(Number(countRaw))) : null;
    rbs[p.key] = { avg, count, show: body[`rating_${p.key}_show`] === "1" };
  });
  const agg = computeAggregate(rbs);
  return {
    ratingsBySource: rbs,
    aggregatedRating: agg ? agg.aggregatedRating : (existingData.aggregatedRating != null ? existingData.aggregatedRating : null),
    reviewCountTotal: agg ? agg.reviewCountTotal : (existingData.reviewCountTotal != null ? existingData.reviewCountTotal : null),
  };
}

function bodyToTourData(body, existingData = {}) {
  return {
    // Keep every existing field the form doesn't edit (anything imported or
    // added later) — the form only overwrites the keys listed below.
    ...existingData,
    name: (body.name || "").trim(),
    company: (body.company || "").trim(),
    contactPhone: (body.contactPhone || "").trim() || null,
    contactEmail: (body.contactEmail || "").trim() || null,
    city: (body.city || "").trim(),
    tourType: (body.tourType || "").trim(),
    durationLabel: (body.durationLabel || "").trim(),
    fareharborRegularLink: (body.fareharborRegularLink || "").trim(),
    fareharborCalendarScript: (body.fareharborCalendarScript || "").trim(),
    fareharborItemId: (body.fareharborItemId || "").trim() || null,
    editorsPick: body.editorsPick === "1",
    highlights: linesToArray(body.highlights),
    fullDescription: (body.fullDescription || "").trim(),
    metaTitle: (body.metaTitle || "").trim() || null,
    metaDescription: (body.metaDescription || "").trim() || null,
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
    ...ratingsFromBody(body, existingData),
    // No longer edited in the form — kept so tour cards' bar still has data.
    ratingDistribution: existingData.ratingDistribution || { star5: 0, star4: 0, star3: 0, star2: 0, star1: 0 },
    bookingLinks: {
      fareharbor: { show: body.showFareharbor === "1" },
      tripadvisor: { url: (body.tripadvisorUrl || "").trim(), show: body.showTripadvisor === "1" },
      getyourguide: { url: (body.getyourguideUrl || "").trim(), show: body.showGetyourguide === "1" },
      viator: { url: (body.viatorUrl || "").trim(), show: body.showViator === "1" },
    },
    location: (() => {
      const lat = body.locationLat !== undefined && body.locationLat !== "" ? Number(body.locationLat) : (existingData.location ? existingData.location.lat : undefined);
      const lng = body.locationLng !== undefined && body.locationLng !== "" ? Number(body.locationLng) : (existingData.location ? existingData.location.lng : undefined);
      if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) return existingData.location || null;
      return { lat, lng };
    })(),
    packages: (() => {
      let count = parseInt(body.packageCount, 10);
      if (isNaN(count) || count < 0) count = 0;
      if (count > 10) count = 10;
      const items = [];
      for (let i = 0; i < count; i++) {
        const name = (body[`pkgName_${i}`] || "").trim();
        const priceRaw = (body[`pkgPrice_${i}`] || "").trim();
        const price = priceRaw !== "" && !isNaN(Number(priceRaw)) ? Number(priceRaw) : null;
        const features = linesToArray(body[`pkgItems_${i}`]);
        if (!name && price === null && !features.length) continue; // fully blank box
        items.push({ name, price, features });
      }
      return { show: body.showPackages === "1", items };
    })(),
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
      await regenerateListingPages();
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

  await logAudit(user, "create", "tour", slug, `Created tour "${data.name || slug}"`);

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
    await regenerateListingPages();
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

  await logAudit(user, "update", "tour", slug, `Updated tour "${data.name || slug}"`);

  res.writeHead(302, { Location: "/admin/tours" });
  res.end();
}

async function deleteTour(req, res, user, id) {
  try {
    const result = await query("DELETE FROM tours WHERE id = $1 RETURNING slug", [id]);
    if (result.rows[0]) {
      removeTourFile(result.rows[0].slug);
      await regenerateListingPages();
      await logAudit(user, "delete", "tour", result.rows[0].slug, `Deleted tour "${result.rows[0].slug}"`);
    }
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
      await regenerateListingPages();
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
      await regenerateListingPages();
    }
  } catch (err) {
    console.error("[tours] removing image failed:", err.message);
  }

  res.writeHead(302, { Location: `/admin/tours/${id}/edit` });
  res.end();
}

/**
 * Handles a raw FareHarbor partner export uploaded directly (columns:
 * item_id, location_lat, location_long, regular_link, calendar_script, ...).
 * Matches item_id against each tour's stored variants[].fareharborItemId
 * and sets location, the FareHarbor booking link and the calendar embed.
 * Corrects FareHarbor's own export, which has location_lat/location_long
 * swapped (confirmed against real coordinates across multiple islands).
 */
async function applyFareharborLocationImport(csvRows) {
  const infoByItemId = {};
  let badRows = 0;
  for (const row of csvRows) {
    const itemId = (row.item_id || "").trim();
    const lat = Number(row.location_long);
    const lng = Number(row.location_lat);
    if (!itemId || isNaN(lat) || isNaN(lng)) { badRows++; continue; }
    infoByItemId[itemId] = {
      lat, lng,
      regularLink: (row.regular_link || "").trim(),
      calendarScript: (row.calendar_script || "").trim(),
    };
  }

  let toursResult;
  try {
    toursResult = await query(`SELECT slug, status, island, price_from, data FROM tours`);
  } catch (err) {
    return { updated: 0, unchanged: 0, errors: [`Database error: ${err.message}`] };
  }

  let matched = 0, noMatch = 0;
  const errors = badRows > 0 ? [`${badRows} row(s) in the file had no item_id or coordinates — skipped.`] : [];
  let anyPublishedTouched = false;

  for (const tourRow of toursResult.rows) {
    const variants = (tourRow.data && tourRow.data.variants) || [];
    let info = null;
    let matchedItemId = null;
    for (const v of variants) {
      const itemId = String(v.fareharborItemId || "").trim();
      if (itemId && infoByItemId[itemId]) { info = infoByItemId[itemId]; matchedItemId = itemId; break; }
    }
    if (!info) { noMatch++; continue; }

    const data = { ...(tourRow.data || {}), location: { lat: info.lat, lng: info.lng } };
    if (!data.fareharborItemId && matchedItemId) data.fareharborItemId = matchedItemId; // keep the new top-level field in sync going forward
    if (info.regularLink) data.fareharborRegularLink = info.regularLink;
    if (info.calendarScript) data.fareharborCalendarScript = info.calendarScript;
    try {
      await query("UPDATE tours SET data = $1, updated_at = now() WHERE slug = $2", [JSON.stringify(data), tourRow.slug]);
      matched++;
      if (tourRow.status === "published") {
        anyPublishedTouched = true;
        await generateTourFile({ slug: tourRow.slug, status: tourRow.status, island: tourRow.island, price_from: tourRow.price_from, data });
      }
    } catch (err) {
      errors.push(`${tourRow.slug}: failed to save — ${err.message}`);
    }
  }

  if (anyPublishedTouched) {
    try { await regenerateListingPages(); } catch (err) { errors.push(`Listing pages regeneration failed: ${err.message}`); }
  }

  return {
    updated: matched,
    unchanged: 0,
    notice: `Detected a raw FareHarbor export — matched ${matched} tour(s) by item_id, updating location, the FareHarbor booking link and the calendar embed. ${noMatch} tour(s) had no matching item_id.`,
    errors,
  };
}

module.exports = {
  listTours, newTourForm, createTour, editTourForm, updateTour, deleteTour, uploadTourImage, removeTourImage,
  exportToursCsv, showImportForm, importToursCsv, backfillFareharborIds,
};

/* ============================================================
   Export / Import (bulk price, ratings, location — via CSV, no
   code/SSH required). Deliberately scoped to just these numeric
   fields, not full tour editing, to keep bulk edits low-risk.
   ============================================================ */
const { parseCsv } = require("../lib/csv");

const EXPORT_COLUMNS = [
  "slug", "name", "island", "status", // reference only — ignored on import
  "priceFrom",
  "location_lat", "location_lng",
  "fareharborItemId",
  "metaTitle", "metaDescription",
  "fareharborRegularLink", "fareharborCalendarScript", "showFareharbor",
  "tripadvisorUrl", "showTripadvisor",
  "getyourguideUrl", "showGetyourguide",
  "viatorUrl", "showViator",
  "aggregatedRating", "reviewCountTotal", "star5", "star4", "star3", "star2", "star1",
  "google_rating", "google_count", "google_show",
  "tripadvisor_rating", "tripadvisor_count", "tripadvisor_show",
  "getyourguide_rating", "getyourguide_count", "getyourguide_show",
  "viator_rating", "viator_count", "viator_show",
];
const REFERENCE_ONLY_COLUMNS = new Set(["slug", "name", "island", "status"]);

function csvEscape(value) {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function exportToursCsv(req, res, user) {
  let rows = [];
  try {
    const result = await query(`SELECT slug, status, island, price_from, data FROM tours ORDER BY slug ASC`);
    rows = result.rows;
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Database error: ${err.message}`);
    return;
  }

  const lines = [EXPORT_COLUMNS.join(",")];
  for (const row of rows) {
    const d = row.data || {};
    const dist = d.ratingDistribution || {};
    const rbs = d.ratingsBySource || {};
    const loc = d.location || {};
    const bl = d.bookingLinks || {};
    const values = {
      slug: row.slug, name: d.name || "", island: row.island || "", status: row.status,
      priceFrom: row.price_from != null ? row.price_from : "",
      aggregatedRating: d.aggregatedRating != null ? d.aggregatedRating : "",
      reviewCountTotal: d.reviewCountTotal != null ? d.reviewCountTotal : "",
      star5: dist.star5 != null ? dist.star5 : "", star4: dist.star4 != null ? dist.star4 : "",
      star3: dist.star3 != null ? dist.star3 : "", star2: dist.star2 != null ? dist.star2 : "",
      star1: dist.star1 != null ? dist.star1 : "",
      ...Object.fromEntries(RATING_PLATFORMS.flatMap((p) => [
        [`${p.key}_rating`, rbs[p.key] && rbs[p.key].avg != null ? rbs[p.key].avg : ""],
        [`${p.key}_count`, rbs[p.key] && rbs[p.key].count != null ? rbs[p.key].count : ""],
        [`${p.key}_show`, ratingShown(rbs, p.key) ? "TRUE" : "FALSE"],
      ])),
      location_lat: loc.lat != null ? loc.lat : "", location_lng: loc.lng != null ? loc.lng : "",
      fareharborItemId: d.fareharborItemId || "",
      metaTitle: d.metaTitle || "",
      metaDescription: d.metaDescription || "",
      fareharborRegularLink: d.fareharborRegularLink || "",
      fareharborCalendarScript: d.fareharborCalendarScript || "",
      showFareharbor: bl.fareharbor && bl.fareharbor.show === false ? "FALSE" : "TRUE",
      tripadvisorUrl: (bl.tripadvisor && bl.tripadvisor.url) || "",
      showTripadvisor: bl.tripadvisor && bl.tripadvisor.show ? "TRUE" : "FALSE",
      getyourguideUrl: (bl.getyourguide && bl.getyourguide.url) || "",
      showGetyourguide: bl.getyourguide && bl.getyourguide.show ? "TRUE" : "FALSE",
      viatorUrl: (bl.viator && bl.viator.url) || "",
      showViator: bl.viator && bl.viator.show ? "TRUE" : "FALSE",
    };
    lines.push(EXPORT_COLUMNS.map((c) => csvEscape(values[c])).join(","));
  }

  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="tours-export-${new Date().toISOString().slice(0, 10)}.csv"`,
  });
  // Leading BOM so Excel opens the file as UTF-8 (em dashes, accents in meta
  // text would otherwise show as garbage). parseCsv strips it on re-import.
  res.end("\uFEFF" + lines.join("\n"));
}

function renderImportForm({ report = null, backfillReport = null } = {}) {
  return `
    <h1 class="page-title">Import Tours (Price, Ratings, Location &amp; Booking Links)</h1>
    <p class="page-sub">Bulk-update real prices, ratings and map coordinates without touching code. Matches rows to tours by <strong>FareHarbor Item ID</strong> — never renames a tour or changes its Published/Draft status.</p>

    <div class="form-card">
      <h2>One-time: backfill FareHarbor IDs from existing variants</h2>
      <p style="margin-bottom:12px;color:var(--color-text-muted);">Since Import now matches by FareHarbor Item ID instead of slug, run this once so your existing tours have that field filled in (copied from the item_id already stored on their first variant). Safe to run more than once — it only fills in tours that don't have a FareHarbor Item ID yet.</p>
      ${backfillReport ? `<div class="alert alert-success">${esc(backfillReport)}</div>` : ""}
      <form method="POST" action="/admin/tours/backfill-fareharbor-ids">
        <button type="submit" class="btn btn-secondary">Backfill FareHarbor IDs Now</button>
      </form>
    </div>

    <div class="form-card">
      <h2>Step 1 — Export the current data</h2>
      <p style="margin-bottom:12px;">Download every tour's current values as a spreadsheet, fill in real numbers in Excel/Google Sheets, then come back and upload it below. Leave a cell blank to keep that tour's current value unchanged.</p>
      <a href="/admin/tours/export" class="btn btn-secondary">Download Current Data (CSV)</a>
    </div>

    <div class="form-card">
      <h2>Step 2 — Upload your edited file</h2>
      <p style="margin-bottom:12px;color:var(--color-text-muted);">Also accepts a raw FareHarbor partner export directly (the file with an "item_id" column) — it's auto-detected and matched by FareHarbor item ID instead of slug, to fill in real map coordinates.</p>
      ${report ? `
        <div class="alert ${report.errors.length ? "alert-error" : "alert-success"}">
          ${report.notice ? esc(report.notice) + "<br>" : `${report.updated} tour${report.updated === 1 ? "" : "s"} updated. `}
          ${report.unchanged ? `${report.unchanged} row(s) had no changes.` : ""}
          ${report.errors.length ? `<br>${report.errors.map(esc).join("<br>")}` : ""}
        </div>
        ${report.warnings && report.warnings.length ? `<div class="alert" style="background:#fff8e1;border:1px solid #f0c36d;color:#7a5a00;">⚠ ${report.warnings.map(esc).join("<br>⚠ ")}</div>` : ""}` : ""}
      <form method="POST" action="/admin/tours/import" enctype="multipart/form-data">
        <div class="form-field">
          <label>CSV file (must include the "fareharborItemId" column — everything else is optional)</label>
          <input type="file" name="csvFile" accept=".csv" required>
        </div>
        <button type="submit" class="btn btn-primary" style="margin-top:12px;">Import</button>
      </form>
    </div>

    <div class="form-card">
      <h2>Columns this tool updates</h2>
      <p style="color:var(--color-text-muted);">priceFrom, location_lat, location_lng, metaTitle, metaDescription, fareharborRegularLink, fareharborCalendarScript, showFareharbor, tripadvisorUrl, showTripadvisor, getyourguideUrl, showGetyourguide, viatorUrl, showViator, aggregatedRating, reviewCountTotal, star5–star1, google/tripadvisor/getyourguide/viator _rating, _count and _show (TRUE/FALSE = show that platform's card on the live page). When platform ratings are present, the overall rating and total count are recalculated from the shown platforms.
      The slug/name/island/status columns are shown for reference only — editing them in the spreadsheet has no effect. <strong>fareharborItemId is the match key</strong> — it must be present and correct for a row to update anything.</p>
      <p style="color:var(--color-text-muted);margin-top:8px;"><strong>Meta Title / Meta Description:</strong> aim for ≤ 60 characters (title) and ≤ 160 characters (description). Longer values are still saved but Google will cut them off in search results. A blank cell keeps the current value.</p>
      <p style="color:var(--color-text-muted);margin-top:8px;"><strong>Important:</strong> all rating fields (including "fareharbor_rating") must be on a <strong>0–5 scale</strong> to match the star display — not FareHarbor's own internal 0–100 "quality score."</p>
    </div>

    <a href="/admin/tours" class="btn btn-secondary">← Back to Tours</a>
  `;
}

async function showImportForm(req, res, user) {
  const urlObj = new URL(req.url, "http://x");
  const backfillReport = urlObj.searchParams.get("backfillReport") || null;
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Import Tours", activeNav: "tours", user, body: renderImportForm({ backfillReport }) }));
}

/** One-click, browser-triggered migration: copies each tour's first variant's
 * fareharborItemId up to the new top-level data.fareharborItemId field, for
 * any tour that doesn't already have one set. Safe to run repeatedly. */
async function backfillFareharborIds(req, res, user) {
  let rows;
  try {
    const result = await query(`SELECT slug, data FROM tours`);
    rows = result.rows;
  } catch (err) {
    res.writeHead(302, { Location: "/admin/tours/import?backfillReport=" + encodeURIComponent(`Database error: ${err.message}`) });
    res.end();
    return;
  }

  let filled = 0, alreadySet = 0, noVariants = 0;
  for (const row of rows) {
    const data = row.data || {};
    if (data.fareharborItemId) { alreadySet++; continue; }
    const variants = data.variants || [];
    const firstWithId = variants.find((v) => v && v.fareharborItemId);
    if (!firstWithId) { noVariants++; continue; }
    data.fareharborItemId = String(firstWithId.fareharborItemId).trim();
    try {
      await query("UPDATE tours SET data = $1, updated_at = now() WHERE slug = $2", [JSON.stringify(data), row.slug]);
      filled++;
    } catch (err) {
      console.error(`[backfill-fareharbor-ids] ${row.slug}: ${err.message}`);
    }
  }

  const message = `${filled} tour(s) backfilled. ${alreadySet} already had a FareHarbor Item ID. ${noVariants} had no variants to copy from — fill those in manually.`;
  res.writeHead(302, { Location: "/admin/tours/import?backfillReport=" + encodeURIComponent(message) });
  res.end();
}

/** Reads a CSV boolean cell — TRUE/true/1/yes all count as true. */
function csvTruthy(v) {
  return ["true", "1", "yes"].includes(String(v || "").trim().toLowerCase());
}

function numOrUndefined(v) {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

async function importToursCsv(req, res, user) {
  const { parseCsvUpload } = require("../upload");

  let csvText;
  try {
    csvText = await parseCsvUpload(req);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Import Tours", activeNav: "tours", user, body: renderImportForm({ report: { updated: 0, unchanged: 0, errors: [`Could not read the uploaded file: ${err.message}`] } }) }));
    return;
  }
  if (!csvText) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Import Tours", activeNav: "tours", user, body: renderImportForm({ report: { updated: 0, unchanged: 0, errors: ["No file was uploaded."] } }) }));
    return;
  }

  let csvRows;
  try {
    csvRows = parseCsv(csvText);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Import Tours", activeNav: "tours", user, body: renderImportForm({ report: { updated: 0, unchanged: 0, errors: [`Could not parse this as CSV: ${err.message}`] } }) }));
    return;
  }

  // Auto-detect: a raw FareHarbor partner export (has "item_id", no "slug")
  // gets routed to the location-matching importer instead of the standard
  // slug-based one — same upload button handles both file types.
  const looksLikeFareharborExport = csvRows.length > 0 && csvRows[0].item_id !== undefined && csvRows[0].slug === undefined;
  if (looksLikeFareharborExport) {
    const report = await applyFareharborLocationImport(csvRows);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Import Tours", activeNav: "tours", user, body: renderImportForm({ report }) }));
    return;
  }

  let updated = 0, unchanged = 0;
  const errors = [];
  const warnings = [];
  let anyPublishedTouched = false;

  // Look tours up by fareharborItemId now (not slug) — build the lookup once.
  let allTours;
  try {
    const result = await query(`SELECT slug, status, island, price_from, data FROM tours`);
    allTours = result.rows;
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Import Tours", activeNav: "tours", user, body: renderImportForm({ report: { updated: 0, unchanged: 0, errors: [`Database error: ${err.message}`] } }) }));
    return;
  }
  const tourByFareharborId = {};
  for (const t of allTours) {
    const id = String((t.data && t.data.fareharborItemId) || "").trim();
    if (id) tourByFareharborId[id] = t;
  }

  for (const csvRow of csvRows) {
    const fhId = (csvRow.fareharborItemId || "").trim();
    const rowLabel = fhId || csvRow.slug || "(blank row)";
    if (!fhId) { errors.push(`${rowLabel}: no fareharborItemId — skipped.`); continue; }

    const existing = tourByFareharborId[fhId];
    if (!existing) { errors.push(`${fhId}: no tour with this FareHarbor Item ID — skipped.`); continue; }
    const slug = existing.slug;

    const data = existing.data || {};
    let changed = false;

    const priceFrom = numOrUndefined(csvRow.priceFrom);
    if (priceFrom !== undefined) { changed = true; }
    const aggregatedRating = numOrUndefined(csvRow.aggregatedRating);
    if (aggregatedRating !== undefined) { data.aggregatedRating = aggregatedRating; changed = true; }
    const reviewCountTotal = numOrUndefined(csvRow.reviewCountTotal);
    if (reviewCountTotal !== undefined) { data.reviewCountTotal = reviewCountTotal; changed = true; }

    const dist = { ...(data.ratingDistribution || {}) };
    ["star5", "star4", "star3", "star2", "star1"].forEach((k) => {
      const v = numOrUndefined(csvRow[k]);
      if (v !== undefined) { dist[k] = v; changed = true; }
    });
    data.ratingDistribution = dist;

    const rbs = { ...(data.ratingsBySource || {}) };
    ["fareharbor", ...RATING_PLATFORMS.map((p) => p.key)].forEach((platform) => {
      const avg = numOrUndefined(csvRow[`${platform}_rating`]);
      const count = numOrUndefined(csvRow[`${platform}_count`]);
      const showCell = csvRow[`${platform}_show`];
      if (avg !== undefined || count !== undefined) {
        rbs[platform] = { ...(rbs[platform] || {}), ...(avg !== undefined ? { avg } : {}), ...(count !== undefined ? { count } : {}) };
        changed = true;
      }
      if (showCell !== undefined && showCell !== "") {
        rbs[platform] = { ...(rbs[platform] || {}), show: csvTruthy(showCell) };
        changed = true;
      }
    });
    data.ratingsBySource = rbs;
    // Overall rating follows the shown platforms (an explicit aggregatedRating
    // cell in the same row still wins, for tours with no platform data).
    const aggFromPlatforms = computeAggregate(rbs);
    if (aggFromPlatforms && aggregatedRating === undefined) data.aggregatedRating = aggFromPlatforms.aggregatedRating;
    if (aggFromPlatforms && reviewCountTotal === undefined) data.reviewCountTotal = aggFromPlatforms.reviewCountTotal;

    const lat = numOrUndefined(csvRow.location_lat);
    const lng = numOrUndefined(csvRow.location_lng);
    if (lat !== undefined || lng !== undefined) {
      data.location = { ...(data.location || {}), ...(lat !== undefined ? { lat } : {}), ...(lng !== undefined ? { lng } : {}) };
      changed = true;
    }

    const fareharborRegularLink = (csvRow.fareharborRegularLink || "").trim();
    if (fareharborRegularLink) { data.fareharborRegularLink = fareharborRegularLink; changed = true; }
    const fareharborCalendarScript = (csvRow.fareharborCalendarScript || "").trim();
    if (fareharborCalendarScript) { data.fareharborCalendarScript = fareharborCalendarScript; changed = true; }

    // SEO meta — blank cell = keep current value. Whitespace/newlines collapsed
    // because a title/description must be a single line in <head>.
    const metaWarnings = [];
    [["metaTitle", 60], ["metaDescription", 160]].forEach(([key, limit]) => {
      const v = String(csvRow[key] || "").replace(/\s+/g, " ").trim();
      if (!v) return;
      if (v.length > limit) metaWarnings.push(`${key} is ${v.length} chars (recommended ≤ ${limit})`);
      if (v !== (data[key] || "")) { data[key] = v; changed = true; }
    });
    if (metaWarnings.length) warnings.push(`${fhId} (${slug}): saved, but ${metaWarnings.join("; ")} — Google may truncate it.`);

    const blImport = { ...(data.bookingLinks || {}) };
    if (csvRow.showFareharbor !== undefined && csvRow.showFareharbor !== "") {
      blImport.fareharbor = { ...(blImport.fareharbor || {}), show: csvTruthy(csvRow.showFareharbor) };
      changed = true;
    }
    [["tripadvisor", "Tripadvisor"], ["getyourguide", "Getyourguide"], ["viator", "Viator"]].forEach(([key, label]) => {
      const url = (csvRow[`${key}Url`] || "").trim();
      const showCell = csvRow[`show${label}`];
      if (url) { blImport[key] = { ...(blImport[key] || {}), url }; changed = true; }
      if (showCell !== undefined && showCell !== "") { blImport[key] = { ...(blImport[key] || {}), show: csvTruthy(showCell) }; changed = true; }
    });
    data.bookingLinks = blImport;

    const linkIssues = tourAffiliateIssues(data);
    if (linkIssues.length) warnings.push(`${fhId} (${slug}): ${linkIssues.map((i) => i.message).join(" ")}`);

    if (!changed) { unchanged++; continue; }

    try {
      await query(
        priceFrom !== undefined
          ? "UPDATE tours SET data = $1, price_from = $2, updated_at = now() WHERE slug = $3"
          : "UPDATE tours SET data = $1, updated_at = now() WHERE slug = $2",
        priceFrom !== undefined ? [JSON.stringify(data), priceFrom, slug] : [JSON.stringify(data), slug]
      );
      updated++;
      if (existing.status === "published") {
        anyPublishedTouched = true;
        await generateTourFile({ slug: existing.slug, status: existing.status, island: existing.island, price_from: priceFrom !== undefined ? priceFrom : existing.price_from, data });
      }
    } catch (err) {
      errors.push(`${slug}: failed to save — ${err.message}`);
    }
  }

  if (anyPublishedTouched) {
    try { await regenerateListingPages(); } catch (err) { errors.push(`Listing pages regeneration failed: ${err.message}`); }
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Import Tours", activeNav: "tours", user, body: renderImportForm({ report: { updated, unchanged, errors, warnings } }) }));
}
