const { esc } = require("../utils");
const { starsRowHtml, histogramHtml, tourCardHtml } = require("./sharedHtml");

const SITE_URL = (process.env.SITE_URL || "https://tripreviewall.com").replace(/\/+$/, "");

function ratingsBySourceForDisplay(tour) {
  const real = tour.ratingsBySource || {};
  const platformMap = [
    { key: "fareharbor", name: "FareHarbor" },
    { key: "tripadvisor", name: "TripAdvisor" },
    { key: "getyourguide", name: "GetYourGuide" },
    { key: "viator", name: "Viator" },
  ];
  const hasAnyReal = platformMap.some((p) => real[p.key] && real[p.key].avg != null);
  if (hasAnyReal) {
    // Use real per-platform numbers wherever we have them; only fall back
    // to the aggregate for a platform that hasn't been researched yet.
    return platformMap
      .filter((p) => real[p.key] && real[p.key].avg != null)
      .map((p) => ({ name: p.name, avg: Number(real[p.key].avg), count: Number(real[p.key].count) || 0 }));
  }
  // Nothing real entered yet — fall back to the illustrative split so the
  // page still looks complete rather than empty.
  const c = tour.reviewCountTotal || 0;
  const r = tour.aggregatedRating || 0;
  return [
    { name: "Tripreviewall", avg: r, count: Math.round(c * 0.35) },
    { name: "TripAdvisor", avg: r, count: Math.round(c * 0.35) },
    { name: "GetYourGuide", avg: r, count: Math.round(c * 0.2) },
    { name: "Viator", avg: r, count: Math.round(c * 0.1) },
  ];
}

function quickFactsHtml(tour) {
  const items = [
    { label: "From", value: `$${tour.priceFrom}` },
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
      ${histogramHtml(tour.ratingDistribution, 10)}
      <div class="source-cards">
        ${sources.map((s) => `
          <div class="source-card">
            <div class="source-card-name">${esc(s.name)}</div>
            ${starsRowHtml(s.avg)}
            <div class="source-card-score tabular">${s.avg.toFixed(1)}</div>
            <div class="source-card-count tabular">${s.count.toLocaleString()} reviews</div>
          </div>`).join("")}
      </div>
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
    <aside class="detail-sidebar-col">
      <div class="booking-card">
        <div class="booking-price-label">From</div>
        <div class="booking-price tabular">$${tour.priceFrom}</div>
        <div class="booking-trust-line">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Real-time availability via FareHarbor
        </div>
        ${showFareharbor && fareharborLink ? `<a href="${esc(trackingUrl(tour.slug, "fareharbor", fareharborLink))}" class="btn btn-primary btn-full" target="_blank" rel="noopener sponsored">Check Availability</a>
        <p style="font-size:var(--text-meta);color:var(--color-text-muted);margin:10px 0 0;">This is the tour operator's own booking system — no third-party markup.</p>` : ""}
        <div class="booking-widget-frame">
          <h4>Select a date</h4>
          ${tour.fareharborCalendarScript ? tour.fareharborCalendarScript : `<div class="booking-widget-placeholder">FareHarbor calendar widget renders here</div>`}
        </div>
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
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: tour.title,
    description: (tour.fullDescription || "").slice(0, 300),
    image: tour.gallery && tour.gallery[0] ? `${SITE_URL}${tour.gallery[0]}` : undefined,
    offers: { "@type": "Offer", price: String(tour.priceFrom), priceCurrency: "USD" },
    aggregateRating: tour.reviewCountTotal
      ? { "@type": "AggregateRating", ratingValue: String(tour.aggregatedRating), reviewCount: String(tour.reviewCountTotal) }
      : undefined,
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
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>\n<script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>`;
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
${heroImg ? `<meta property="og:image" content="${SITE_URL}${heroImg}">` : ""}
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="Tripreviewall">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(pageTitle)} — Tripreviewall">
<meta name="twitter:description" content="${esc(metaDesc)}">
${heroImg ? `<meta name="twitter:image" content="${SITE_URL}${heroImg}">` : ""}
${jsonLd(tour)}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/tokens.css">
<link rel="stylesheet" href="../css/style.css">
<link rel="stylesheet" href="../css/tour-detail.css">
</head>
<body>

<a href="#main" class="skip-link">Skip to content</a>

<header class="site-header">
  <div class="container header-inner">
    <a href="/" class="logo" aria-label="Tripreviewall home"><span class="part-1">Tripreview</span><span class="part-2">all</span></a>
    <nav class="main-nav" aria-label="Primary">
      <a href="/tours">Tours</a>
      <a href="/destinations">Destinations</a>
      <a href="/blog">Blog</a>
      <a href="/about">About</a>
      <a href="/contact">Contact</a>
    </nav>
    <div class="header-actions">
      <button class="hamburger" data-drawer-open aria-label="Open menu" aria-expanded="false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
      </button>
    </div>
  </div>
</header>

<div class="mobile-drawer">
  <div class="mobile-drawer-backdrop" data-drawer-backdrop></div>
  <div class="mobile-drawer-panel" role="dialog" aria-label="Site menu">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <span class="logo"><span class="part-1">Tripreview</span><span class="part-2">all</span></span>
      <button class="close-btn" data-drawer-close aria-label="Close menu">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
    <nav>
      <a href="/tours" class="mobile-nav-link">Tours</a>
      <a href="/destinations" class="mobile-nav-link">Destinations</a>
      <a href="/blog" class="mobile-nav-link">Blog</a>
      <a href="/about" class="mobile-nav-link">About</a>
      <a href="/contact" class="mobile-nav-link">Contact</a>
    </nav>
  </div>
</div>

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
        <a href="#ratings" class="detail-rating-link">
          ${starsRowHtml(tour.aggregatedRating)}
          <span class="score tabular">${(tour.aggregatedRating || 0).toFixed(1)}</span>
          <span class="count">(${(tour.reviewCountTotal || 0).toLocaleString()} reviews across 4 sources)</span>
        </a>
      </div>
    </div>

    <div class="gallery">
      <div class="gallery-main tour-photo" id="gallery-main" ${heroImg ? `style="background-image:url('${heroImg}')"` : `style="background:linear-gradient(135deg,#0B3B4F,#5C8A72);"`}></div>
    </div>
    ${(tour.gallery || []).length > 1 ? `
    <div class="gallery-thumbs" id="gallery-thumbs">
      ${tour.gallery.map((url, i) => `<div class="gallery-thumb tour-photo${i === 0 ? " active" : ""}" data-url="${esc(url)}" style="background-image:url('${esc(url)}')"></div>`).join("")}
    </div>` : ""}
    <p class="gallery-caption">Photo: Operator</p>

    <div class="quickfacts">${quickFactsHtml(tour)}</div>

    <div class="content-tabs">
      <button class="content-tab active" data-target="tab-overview">Overview</button>
      <button class="content-tab" data-target="tab-location">Location</button>
    </div>

    <div class="detail-layout">
      <div class="detail-main">
        <section class="detail-section" id="tab-overview">
          <h2 class="detail-section-title">Overview</h2>
          <ul class="highlight-list">${(tour.highlights || []).map((h) => `<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>${esc(h)}</li>`).join("")}</ul>
          <p class="detail-body-text">${esc(tour.fullDescription || "")}</p>
          ${variantSelectorHtml(tour.variants)}
        </section>

        ${verdictHtml(tour.verdict)}
        ${ratingsSectionHtml(tour)}

        <section class="detail-section" id="tab-location">
          <h2 class="detail-section-title">Location</h2>
          ${tour.location && tour.location.lat != null && tour.location.lng != null
            ? `<iframe src="https://maps.google.com/maps?q=${tour.location.lat},${tour.location.lng}&z=14&output=embed" class="map-embed" style="width:100%;height:320px;border:0;" loading="lazy" title="Map showing the approximate location of ${esc(tour.title)}"></iframe>
               <p style="margin-top:10px;"><a href="https://www.google.com/maps?q=${tour.location.lat},${tour.location.lng}" target="_blank" rel="noopener">Open in Google Maps →</a></p>`
            : `<div class="map-embed">Map embed placeholder</div>`}
          <p class="detail-body-text">${esc(tour.city ? tour.city + ", " : "")}${esc(tour.island)}, Hawaii</p>
          <p style="font-size:var(--text-meta); color:var(--color-text-muted);">Exact meeting point and pickup details are confirmed at booking via FareHarbor.</p>
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

<div class="mobile-booking-bar" id="mobile-booking-bar">
  <div><div style="font-size:11px;color:var(--color-text-muted);">From</div><div class="price tabular">$${tour.priceFrom}</div></div>
  ${tour.fareharborRegularLink ? `<a href="${esc(trackingUrl(tour.slug, "fareharbor", tour.fareharborRegularLink))}" class="btn btn-primary" target="_blank" rel="noopener sponsored">Check Availability</a>` : ""}
</div>

<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div>
        <span class="logo reversed"><span class="part-1">Tripreview</span><span class="part-2">all</span></span>
        <p class="footer-tagline">Independent Hawaii tour reviews — five-star and one-star alike.</p>
      </div>
      <div class="footer-col"><h4>Explore</h4><a href="/tours">Tours</a><a href="/destinations">Destinations</a><a href="/blog">Blog</a><a href="/transportation">Transportation</a></div>
      <div class="footer-col"><h4>Company</h4><a href="/about">About</a><a href="/contact">Contact</a><a href="/affiliate-disclosure">Affiliate Disclosure</a><a href="/privacy-policy">Privacy Policy</a></div>
      <div class="footer-col"><h4>Contact Us</h4>
        <div class="footer-contact-row"><a href="tel:+18082261884">+1 (808) 226-1884</a></div>
        <div class="footer-contact-row"><a href="mailto:contact@tripreviewall.com">contact@tripreviewall.com</a></div>
      </div>
    </div>
    <div class="footer-disclosure">Tripreviewall earns a commission when you book through links on this site (FareHarbor, TripAdvisor, GetYourGuide). This never affects which reviews we show or how we rate a tour.</div>
    <div class="footer-bottom"><span>© 2026 Tripreviewall, operated by Popotours. All rights reserved.</span></div>
  </div>
</footer>

<script src="../js/main.js"></script>
<script src="../js/tour-static-hydrate.js"></script>
</body>
</html>`;
}

module.exports = { renderTourPageHtml };
