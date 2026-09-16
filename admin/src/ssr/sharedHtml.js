const { esc } = require("../utils");

function starsSvgHtml(fillVar) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="${fillVar}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
}

function starsRowHtml(rating) {
  const full = Math.round(rating || 0);
  let html = '<span class="stars">';
  for (let i = 0; i < 5; i++) html += starsSvgHtml(i < full ? "var(--color-positive)" : "var(--color-border-strong)");
  return html + "</span>";
}

function histogramHtml(d, heightPx) {
  d = d || { star5: 0, star4: 0, star3: 0, star2: 0, star1: 0 };
  return `<div class="rating-histogram" role="img" aria-label="5 stars: ${d.star5}%, 4 stars: ${d.star4}%, 3 stars: ${d.star3}%, 2 stars: ${d.star2}%, 1 star: ${d.star1}%"${heightPx ? ` style="height:${heightPx}px;"` : ""}>
    <div class="seg-pos" style="width:${d.star5 + d.star4}%"></div>
    <div class="seg-neu" style="width:${d.star3}%"></div>
    <div class="seg-neg" style="width:${d.star2 + d.star1}%"></div>
  </div>`;
}

/** Shared Tour Card markup for use inside other generated pages (Similar Tours, inline embeds). */
function tourCardHtml(tour, linkPrefix, imgPrefix) {
  linkPrefix = linkPrefix === undefined ? "" : linkPrefix;
  imgPrefix = imgPrefix === undefined ? "" : imgPrefix;
  const img = tour.gallery && tour.gallery[0] ? `${imgPrefix}${tour.gallery[0]}` : null;
  const d = tour.ratingDistribution || { star5: 0, star4: 0, star3: 0, star2: 0, star1: 0 };
  return `
    <article class="tour-card">
      <div class="tour-card-image-wrap"${img ? "" : ` style="background:linear-gradient(135deg,#0B3B4F,#5C8A72)"`}>
        ${img ? `<img class="tour-photo" src="${esc(img)}" alt="${esc(tour.title)} — ${esc(tour.company)}">` : ""}
      </div>
      <div class="tour-card-body">
        <div class="tour-card-eyebrow">${esc((tour.island || "").toUpperCase())} · ${esc((tour.tourType || "").toUpperCase())}</div>
        <h3 class="tour-card-title">${esc(tour.title)}</h3>
        <div class="tour-card-rating">
          ${starsRowHtml(tour.aggregatedRating)}
          <span class="score tabular">${(tour.aggregatedRating || 0).toFixed(1)}</span>
          <span class="count tabular">(${(tour.reviewCountTotal || 0).toLocaleString()} reviews)</span>
        </div>
        ${histogramHtml(d)}
        <div class="tour-card-divider"></div>
        <div class="tour-card-footer">
          <div class="tour-card-price">From <span class="tabular">$${tour.priceFrom}</span><span class="via">via FareHarbor</span></div>
          <a href="/tours/${esc(tour.slug)}" class="btn btn-primary">View Tour</a>
        </div>
      </div>
    </article>`;
}

module.exports = { starsRowHtml, histogramHtml, tourCardHtml };
