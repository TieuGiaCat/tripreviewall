const { esc } = require("../utils");
const { headBoilerplate, scriptTags, siteHeader, siteFooter } = require("./layout");
const { starsRowHtml, tourCardHtml, imgUrl, imgSrcset, jsonLdScript } = require("./sharedHtml");

const HERO_SIZES = "(min-width: 1280px) 1200px, 100vw";
const HERO_WIDTHS = [400, 800, 1200, 1600];

const { SITE_URL } = require("../siteConfig");

/**
 * Platform cards for the "Review" tab — only the platforms ticked in admin
 * (Edit Tour → Ratings by Platform). Older tours without "show" flags keep
 * their previous behavior: any platform with a rating is shown (Google off).
 * No invented numbers: if nothing is entered, the tab says so instead.
 */
const RATING_PLATFORMS = [
  { key: "google", name: "Google Maps" },
  { key: "tripadvisor", name: "TripAdvisor" },
  { key: "getyourguide", name: "GetYourGuide" },
  { key: "viator", name: "Viator" },
];
function ratingsBySourceForDisplay(tour) {
  const rbs = tour.ratingsBySource || {};
  return RATING_PLATFORMS
    .filter((p) => {
      const r = rbs[p.key];
      if (!r || r.avg == null) return false;
      return typeof r.show === "boolean" ? r.show : p.key !== "google";
    })
    .map((p) => ({ name: p.name, avg: Number(rbs[p.key].avg), count: Number(rbs[p.key].count) || 0 }));
}

function quickFactsHtml(tour) {
  const items = [
    { label: "From", value: tour.priceFrom != null ? `$${tour.priceFrom}` : "On request" },
    { label: "Duration", value: tour.duration || "—" },
    { label: "Tour type", value: tour.tourType || "Tour" },
    { label: "Island", value: tour.island },
  ];
  const icons = {
    0: '<path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24L3 3v6.59a2 2 0 0 0 .59 1.41l9.58 9.58a2 2 0 0 0 2.82 0l4.6-4.6a2 2 0 0 0 0-2.82Z"></path><circle cx="7.5" cy="7.5" r="1.5"></circle>',
    1: '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
    2: '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line>',
    3: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle>',
  };
  return items.map((it, i) => `
    <div class="quickfact">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[i]}</svg>
      <div><div class="quickfact-label">${esc(it.label)}</div><div class="quickfact-value">${esc(it.value)}</div></div>
    </div>`).join("");
}

function variantSelectorHtml(variants) {
  const list = (variants || []).filter(Boolean);
  if (list.length <= 1) return "";
  return `
    <div class="variant-selector" id="variant-block">
      <span class="variant-label">Options</span>
      <div class="variant-options" id="variant-options">
        ${list.map((v, i) => `<button class="variant-option${i === 0 ? " active" : ""}">${esc(v)}</button>`).join("")}
      </div>
    </div>`;
}

/** Side-by-side package comparison shown at the top of the Overview tab.
 * Only rendered when the admin ticked "Show packages" and filled at least one. */
function packagesHtml(pk) {
  if (!pk || !pk.show) return "";
  const items = (pk.items || []).filter((p) => p && (p.name || (p.features && p.features.length)));
  if (!items.length) return "";
  const check = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  return `
          <div class="packages-block">
            <h2 class="detail-section-title">Packages</h2>
            <div class="package-grid">
              ${items.map((p) => `
              <div class="package-card">
                <h3 class="package-name">${esc(p.name || "")}</h3>
                ${p.price != null ? `<div class="package-price"><span class="package-price-amount">$${esc(fmt(Number(p.price)))}</span></div>` : ""}
                ${p.features && p.features.length ? `<ul class="package-features">${p.features.map((f) => `<li>${check}<span>${esc(f)}</span></li>`).join("")}</ul>` : ""}
              </div>`).join("")}
            </div>
            <p class="package-note">Prices as listed by the operator — check availability for today's rate.</p>
          </div>`;
}

function verdictHtml(v) {
  v = v || {};
  return `
    <section class="detail-section">
      <div class="verdict-box">
        <div class="verdict-eyebrow">Tripreviewall's Take</div>
        <h3 class="verdict-headline">${esc(v.headline || "")}</h3>
        <div class="verdict-cols">
          <div>
            <div class="verdict-col-title">Good for</div>
            <ul class="verdict-list good">${(v.goodFor || []).map((g) => `<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>${esc(g)}</li>`).join("")}</ul>
          </div>
          <div>
            <div class="verdict-col-title">Worth knowing</div>
            <ul class="verdict-list knowing">${(v.worthKnowing || []).map((w) => `<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c4.97-4.97 8-8.97 8-13a8 8 0 1 0-16 0c0 4.03 3.03 8.03 8 13Z"></path><circle cx="12" cy="9" r="1"></circle></svg>${esc(w)}</li>`).join("")}</ul>
          </div>
        </div>
        <p class="verdict-byline">Assessed by the Tripreviewall editorial team, last reviewed ${esc(v.reviewedByDate || "—")}.</p>
      </div>
    </section>`;
}

function ratingsSectionHtml(tour) {
  const sources = ratingsBySourceForDisplay(tour);
  const gs = tour.googleSnapshot || {};
  return `
    <section class="detail-section" id="ratings">
      <h2 class="detail-section-title">Ratings from every source we could find</h2>
      ${sources.length ? `<div class="source-cards">
        ${sources.map((s) => `
          <div class="source-card">
            <div class="source-card-name">${esc(s.name)}</div>
            ${starsRowHtml(s.avg)}
            <div class="source-card-score tabular">${s.avg.toFixed(1)}</div>
            <div class="source-card-count tabular">${s.count.toLocaleString()} reviews</div>
          </div>`).join("")}
      </div>` : `<p class="detail-body-text">We haven't collected platform ratings for this tour yet.</p>`}
      ${gs.summaryText ? `
      <div class="google-panel">
        <div class="google-panel-label">Google Maps — Summarized by Our Team</div>
        <div class="google-panel-summary">${esc(gs.summaryText)}</div>
        <div class="google-panel-meta">Last checked ${esc(gs.lastCheckedDate || "—")}</div>
      </div>` : ""}
      <p class="freshness-note">Ratings and review counts are checked periodically and may not reflect same-day changes on each platform.</p>
    </section>`;
}

function trackingUrl(tourSlug, platform, realUrl) {
  return `/api/track-click?tour=${encodeURIComponent(tourSlug)}&platform=${platform}&url=${encodeURIComponent(realUrl)}`;
}

/** Every booking option that is switched on for this tour, FareHarbor first. */
function bookingOptions(tour) {
  const bl = tour.bookingLinks || {};
  const list = [];
  if ((!bl.fareharbor || bl.fareharbor.show !== false) && tour.fareharborRegularLink) {
    list.push({ key: "fareharbor", label: "FareHarbor", note: "Operator's own booking system — no third-party markup", url: tour.fareharborRegularLink });
  }
  [["viator", "Viator"], ["getyourguide", "GetYourGuide"], ["tripadvisor", "TripAdvisor"]].forEach(([key, label]) => {
    if (bl[key] && bl[key].show && bl[key].url) list.push({ key, label, note: "Book on " + label, url: bl[key].url });
  });
  return list;
}

/** Sticky bottom bar on phones/tablets + a bottom sheet listing every booking site. */
function mobileBookingHtml(tour) {
  const options = bookingOptions(tour);
  const primary = options[0];
  const arrow = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
  return `
<div class="mobile-booking-bar" id="mobile-booking-bar">
  <div class="mobile-booking-price"><div style="font-size:11px;color:var(--color-text-muted);">From</div><div class="price tabular">${tour.priceFrom != null ? "$" + esc(tour.priceFrom) : "On request"}</div></div>
  <div class="mobile-booking-actions">
    ${options.length > 1 ? `<button type="button" class="btn btn-secondary mobile-more-btn" onclick="toggleBookingSheet(true)" aria-haspopup="dialog" aria-controls="booking-sheet">${options.length} options</button>` : ""}
    ${primary ? `<a href="${esc(trackingUrl(tour.slug, primary.key, primary.url))}" class="btn btn-primary" target="_blank" rel="noopener sponsored">${primary.key === "fareharbor" ? "Check Availability" : "Book on " + esc(primary.label)}</a>` : ""}
  </div>
</div>
${options.length > 1 ? `
<div class="booking-sheet-backdrop" id="booking-sheet-backdrop" onclick="toggleBookingSheet(false)" hidden></div>
<div class="booking-sheet" id="booking-sheet" role="dialog" aria-modal="true" aria-labelledby="booking-sheet-title" hidden>
  <div class="booking-sheet-head">
    <h3 id="booking-sheet-title">Book this tour on</h3>
    <button type="button" class="booking-sheet-close" onclick="toggleBookingSheet(false)" aria-label="Close">&times;</button>
  </div>
  <div class="booking-sheet-list">
    ${options.map((o) => `<a class="booking-sheet-item${o.key === "fareharbor" ? " is-primary" : ""}" href="${esc(trackingUrl(tour.slug, o.key, o.url))}" target="_blank" rel="noopener sponsored"><span><strong>${esc(o.label)}</strong><small>${esc(o.note)}</small></span>${arrow}</a>`).join("")}
  </div>
  <p class="booking-disclosure">Tripreviewall may earn a commission if you book through these links, at no extra cost to you.</p>
</div>
<script>
  function toggleBookingSheet(open) {
    var sheet = document.getElementById('booking-sheet');
    var backdrop = document.getElementById('booking-sheet-backdrop');
    sheet.hidden = !open; backdrop.hidden = !open;
    document.body.style.overflow = open ? 'hidden' : '';
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggleBookingSheet(false); });
</script>` : ""}`;
}

/**
 * The calendar embed is pasted by editors / imported from CSV. Instead of
 * printing that raw HTML, pull out the script URL and only accept FareHarbor's
 * own calendar embed — anything else (or extra tags) renders nothing.
 */
function fareharborCalendarTag(raw) {
  const m = String(raw || "").match(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  if (!m) return "";
  let u;
  try { u = new URL(m[1].replace(/&amp;/g, "&")); } catch (e) { return ""; }
  if (u.protocol !== "https:" || u.hostname !== "fareharbor.com" || !u.pathname.startsWith("/embeds/script/calendar/")) return "";
  return `<script src="${esc(u.toString())}"></script>`;
}

function bookingSidebarHtml(tour) {
  const bl = tour.bookingLinks || {};
  const showFareharbor = !bl.fareharbor || bl.fareharbor.show !== false;
  const fareharborLink = tour.fareharborRegularLink || null;

  const platforms = [
    { key: "tripadvisor", label: "TripAdvisor" },
    { key: "getyourguide", label: "GetYourGuide" },
    { key: "viator", label: "Viator" },
  ];
  const enabled = platforms.filter((p) => bl[p.key] && bl[p.key].show && bl[p.key].url);

  return `
    <aside class="detail-sidebar-col" id="booking">
      <div class="booking-card">
        <div class="booking-price-label">From</div>
        <div class="booking-price tabular">${tour.priceFrom != null ? "$" + esc(tour.priceFrom) : "On request"}</div>
        ${showFareharbor && fareharborLink ? `<div class="booking-trust-line">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Real-time availability via FareHarbor
        </div>` : ""}
        ${showFareharbor && fareharborLink ? `<a href="${esc(trackingUrl(tour.slug, "fareharbor", fareharborLink))}" class="btn btn-primary btn-full" target="_blank" rel="noopener sponsored">Check Availability</a>
        <p style="font-size:var(--text-meta);color:var(--color-text-muted);margin:10px 0 0;">This is the tour operator's own booking system — no third-party markup.</p>` : ""}
        ${showFareharbor && fareharborCalendarTag(tour.fareharborCalendarScript) ? `<div class="booking-widget-frame">
          <h4>Select a date</h4>
          ${fareharborCalendarTag(tour.fareharborCalendarScript)}
        </div>` : ""}
        ${enabled.length > 0 ? `
        <div class="booking-secondary-label">Also available on</div>
        <div class="booking-secondary-list">
          ${enabled.map((p) => `<a href="${esc(trackingUrl(tour.slug, p.key, bl[p.key].url))}" class="btn btn-secondary btn-full" target="_blank" rel="noopener sponsored">${p.label}</a>`).join("")}
        </div>` : ""}
        <p class="booking-disclosure">Tripreviewall may earn a commission if you book through the links above, at no extra cost to you.</p>
      </div>
    </aside>`;
}

function jsonLd(tour) {
  // TouristTrip (not Product): this site reviews tours, it doesn't sell them,
  // so Product/Offer triggers Google's Merchant listing requirements (return
  // policy, shipping, availability) that can never apply here.
  // No aggregateRating: Google's review-snippet rules forbid marking up
  // ratings aggregated from other websites (TripAdvisor, GetYourGuide...),
  // and TouristTrip isn't an eligible parent type for it anyway — that was
  // the "Invalid object type for field <parent_node>" error.
  const data = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: tour.title,
    url: `${SITE_URL}/tours/${tour.slug}`,
    description: (tour.fullDescription || "").slice(0, 300),
    image: tour.gallery && tour.gallery[0] ? `${SITE_URL}${tour.gallery[0]}` : undefined,
    touristType: tour.tourType || undefined,
    provider: tour.company ? { "@type": "Organization", name: tour.company } : undefined,
    offers: tour.priceFrom ? { "@type": "Offer", price: String(tour.priceFrom), priceCurrency: "USD" } : undefined,
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Hawaii Tours", item: `${SITE_URL}/tours` },
      { "@type": "ListItem", position: 3, name: tour.title },
    ],
  };
  return `${jsonLdScript(data)}\n${jsonLdScript(breadcrumb)}`;
}

/**
 * Renders the full static Tour Detail page HTML.
 * `similarTours` — an array of up to 3 tour objects (same shape), already
 * fetched by the caller (see ssr/generator.js) from the same island.
 */
function renderTourPageHtml(tour, similarTours) {
  const canonical = `${SITE_URL}/tours/${tour.slug}`;
  const pageTitle = tour.metaTitle || `${tour.title} — ${tour.company}`;
  const metaDesc = (tour.metaDescription || tour.fullDescription || `Honest review of ${tour.title}.`).slice(0, 155);
  const heroImg = tour.gallery && tour.gallery[0];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(pageTitle)} | Tripreviewall</title>
<meta name="description" content="${esc(metaDesc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(pageTitle)} — Tripreviewall">
<meta property="og:description" content="${esc(metaDesc)}">
${heroImg ? `<meta property="og:image" content="${SITE_URL}${imgUrl(heroImg, 1200)}">` : ""}
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="Tripreviewall">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(pageTitle)} — Tripreviewall">
<meta name="twitter:description" content="${esc(metaDesc)}">
${heroImg ? `<meta name="twitter:image" content="${SITE_URL}${imgUrl(heroImg, 1200)}">` : ""}
${jsonLd(tour)}
${heroImg ? `<link rel="preload" as="image" href="${esc(imgUrl(heroImg, 800))}"${imgSrcset(heroImg, HERO_WIDTHS) ? ` imagesrcset="${esc(imgSrcset(heroImg, HERO_WIDTHS))}" imagesizes="${HERO_SIZES}"` : ""} fetchpriority="high">` : ""}
${headBoilerplate(["tour-detail"])}
</head>
<body>

${siteHeader()}

<main id="main">
  <div class="container">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a><span class="sep">/</span>
      <a href="/tours">Hawaii Tours</a><span class="sep">/</span>
      <span class="current">${esc(tour.title)}</span>
    </nav>

    <div class="detail-title-block">
      <div class="detail-location">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>
        <span>${esc(tour.city ? tour.city + ", " : "")}${esc(tour.island)}, Hawaii</span>
      </div>
      <h1 class="detail-h1">${esc(tour.title)}</h1>
      <div class="detail-rating-row">
        <a href="#tab-review" class="detail-rating-link" onclick="switchDetailTab('tab-review', document.querySelector('.content-tab[data-target=&quot;tab-review&quot;]'), event);">
          ${starsRowHtml(tour.aggregatedRating)}
          <span class="score tabular">${(tour.aggregatedRating || 0).toFixed(1)}</span>
          <span class="count">(${(tour.reviewCountTotal || 0).toLocaleString()} reviews${ratingsBySourceForDisplay(tour).length > 1 ? ` across ${ratingsBySourceForDisplay(tour).length} sources` : ""})</span>
        </a>
      </div>
    </div>

    <div class="gallery">
      <div class="gallery-main tour-photo" id="gallery-main"${heroImg ? "" : ` style="background:linear-gradient(135deg,#0B3B4F,#5C8A72);"`}>
        ${heroImg ? `<img id="gallery-main-img" src="${esc(imgUrl(heroImg, 800))}"${imgSrcset(heroImg, HERO_WIDTHS) ? ` srcset="${esc(imgSrcset(heroImg, HERO_WIDTHS))}" sizes="${HERO_SIZES}"` : ""} width="1600" height="900" fetchpriority="high" decoding="async" alt="${esc(tour.title)} — ${esc(tour.company)}">` : ""}
      </div>
    </div>
    ${(tour.gallery || []).length > 1 ? `
    <div class="gallery-thumbs" id="gallery-thumbs">
      ${tour.gallery.map((url, i) => `<button type="button" class="gallery-thumb tour-photo${i === 0 ? " active" : ""}" data-src="${esc(imgUrl(url, 800))}" data-srcset="${esc(imgSrcset(url, HERO_WIDTHS))}" aria-label="Show photo ${i + 1} of ${tour.gallery.length}"><img src="${esc(imgUrl(url, 160))}" width="160" height="120" loading="lazy" decoding="async" alt=""></button>`).join("")}
    </div>` : ""}
    <p class="gallery-caption">Photo: Operator</p>

    <div class="quickfacts">${quickFactsHtml(tour)}</div>

    <div class="content-tabs">
      <button class="content-tab active" data-target="tab-overview" onclick="switchDetailTab('tab-overview', this, event)">Overview</button>
      <button class="content-tab" data-target="tab-location" onclick="switchDetailTab('tab-location', this, event)">Location</button>
      <button class="content-tab" data-target="tab-review" onclick="switchDetailTab('tab-review', this, event)">Review</button>
      <button class="content-tab" data-target="tab-verdict" onclick="switchDetailTab('tab-verdict', this, event)">Our Verdict</button>
      <button class="content-tab" data-target="tab-contact" onclick="switchDetailTab('tab-contact', this, event)">Contact</button>
    </div>

    <div class="detail-layout">
      <div class="detail-main">
        <section class="detail-section content-tab-panel" id="tab-overview">
          ${packagesHtml(tour.packages)}
          <h2 class="detail-section-title">Overview</h2>
          <ul class="highlight-list">${(tour.highlights || []).map((h) => `<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>${esc(h)}</li>`).join("")}</ul>
          <p class="detail-body-text">${esc(tour.fullDescription || "")}</p>
          ${variantSelectorHtml(tour.variants)}
        </section>

        <section class="detail-section content-tab-panel" id="tab-location" style="display:none;">
          <h2 class="detail-section-title">Location</h2>
          ${tour.location && tour.location.lat != null && tour.location.lng != null
            ? `<iframe src="https://maps.google.com/maps?q=${tour.location.lat},${tour.location.lng}&z=14&output=embed" class="map-embed" style="width:100%;height:320px;border:0;" loading="lazy" title="Map showing the approximate location of ${esc(tour.title)}"></iframe>
               <p style="margin-top:10px;"><a href="https://www.google.com/maps?q=${tour.location.lat},${tour.location.lng}" target="_blank" rel="noopener">Open in Google Maps →</a></p>`
            : ""}
          <p class="detail-body-text">${esc(tour.city ? tour.city + ", " : "")}${esc(tour.island)}, Hawaii</p>
          <p style="font-size:var(--text-meta); color:var(--color-text-muted);">Exact meeting point and pickup details are confirmed at booking via FareHarbor.</p>
        </section>

        <div class="content-tab-panel" id="tab-review" style="display:none;">
          ${ratingsSectionHtml(tour)}
        </div>

        <div class="content-tab-panel" id="tab-verdict" style="display:none;">
          ${verdictHtml(tour.verdict)}
        </div>

        <section class="detail-section content-tab-panel" id="tab-contact" style="display:none;">
          <h2 class="detail-section-title">Contact</h2>
          ${tour.contactPhone || tour.contactEmail ? `
          <ul class="highlight-list">
            ${tour.company ? `<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect></svg>${esc(tour.company)}</li>` : ""}
            ${tour.contactPhone ? `<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"></path></svg><a href="tel:${esc(tour.contactPhone)}">${esc(tour.contactPhone)}</a></li>` : ""}
            ${tour.contactEmail ? `<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg><a href="mailto:${esc(tour.contactEmail)}">${esc(tour.contactEmail)}</a></li>` : ""}
          </ul>
          <p style="font-size:var(--text-meta); color:var(--color-text-muted); margin-top:12px;">This is the tour operator's own contact info, shared for general questions — not for bookings. Book directly through the "Check Availability" button for real-time availability.</p>
          ` : `<p class="detail-body-text">No direct contact info on file for this operator yet. The fastest way to reach them is by starting a booking via FareHarbor — you'll get their confirmation details and support contact right away.</p>`}
        </section>
      </div>

      ${bookingSidebarHtml(tour)}
    </div>

    <section class="section" style="padding-top:0;">
      <h2 class="detail-section-title">Similar Tours on ${esc(tour.island)}</h2>
      <div class="similar-tours-scroll">
        ${similarTours.length > 0 ? similarTours.map((t) => tourCardHtml(t, "../", "")).join("") : `<p style="color:var(--color-text-muted);">No similar tours found on this island yet.</p>`}
      </div>
    </section>
  </div>
</main>

${mobileBookingHtml(tour)}

${siteFooter()}

${scriptTags(["main"])}
<script>
  function switchDetailTab(targetId, clickedBtn, evt) {
    if (evt) { evt.preventDefault(); evt.stopPropagation(); }
    var panel = document.getElementById(targetId);
    document.querySelectorAll('.content-tab-panel').forEach(function (p) {
      p.style.display = p.id === targetId ? '' : 'none';
    });
    document.querySelectorAll('.content-tab').forEach(function (btn) {
      btn.classList.remove('active');
    });
    if (clickedBtn) {
      clickedBtn.classList.add('active');
      // Slide the tab strip sideways so the chosen tab is fully visible (mobile).
      var strip = clickedBtn.parentElement;
      var left = clickedBtn.offsetLeft - (strip.clientWidth - clickedBtn.offsetWidth) / 2;
      strip.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    }
    // Only scroll the page when the new panel would start hidden under the
    // sticky header + tab strip; otherwise the page stays exactly where it is.
    var tabsBar = document.querySelector('.content-tabs');
    if (panel && tabsBar) {
      var barBottom = tabsBar.getBoundingClientRect().bottom;
      var panelTop = panel.getBoundingClientRect().top;
      if (panelTop < barBottom) {
        window.scrollTo({ top: window.scrollY + panelTop - barBottom - 8, behavior: 'smooth' });
      }
    }
    return false;
  }
</script>
${scriptTags(["tour-static-hydrate"])}
</body>
</html>`;
}

module.exports = { renderTourPageHtml };
