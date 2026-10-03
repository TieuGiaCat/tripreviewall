const { esc } = require("../utils");

/** JSON for <script type="application/ld+json">: "<" escaped so a title containing "</script>" can't break out. */
function jsonLdScript(obj) {
  const json = JSON.stringify(obj).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return `<script type="application/ld+json">${json}</script>`;
}

/**
 * Every page gets a share image: pages without their own photo fall back to
 * the branded /og-default.jpg (1200×630), and twitter:card is upgraded to the
 * large-image layout. Run on every generated page (see generator.js).
 */
const { SITE_URL: SITE_URL_FOR_OG } = require("../siteConfig");
const OG_DEFAULT_IMAGE = `${SITE_URL_FOR_OG}/og-default.jpg`;
function ensureSocialTags(html) {
  const headEnd = html.indexOf("</head>");
  if (headEnd === -1) return html;
  let head = html.slice(0, headEnd);
  const add = [];
  if (!/property="og:image"/.test(head)) {
    add.push(`<meta property="og:image" content="${OG_DEFAULT_IMAGE}">`, `<meta property="og:image:width" content="1200">`, `<meta property="og:image:height" content="630">`, `<meta property="og:image:alt" content="Tripreviewall — honest Hawaii tour reviews">`);
  }
  if (!/name="twitter:image"/.test(head)) {
    const og = head.match(/property="og:image" content="([^"]+)"/);
    add.push(`<meta name="twitter:image" content="${og ? og[1] : OG_DEFAULT_IMAGE}">`);
  }
  if (/name="twitter:card" content="summary"/.test(head)) {
    head = head.replace(/name="twitter:card" content="summary"/, 'name="twitter:card" content="summary_large_image"');
  } else if (!/name="twitter:card"/.test(head)) {
    add.push(`<meta name="twitter:card" content="summary_large_image">`);
  }
  return head + (add.length ? add.join("\n") + "\n" : "") + html.slice(headEnd);
}

/* ---- Responsive images ----
   Locally uploaded images (/uploads/...) can be requested at a smaller width
   with ?w=N — the admin server resizes once with sharp, caches the WebP on
   disk and serves the cached copy afterwards (see server.js serveUpload).
   External URLs and SVGs are returned untouched. */
const IMG_WIDTHS = [160, 400, 800, 1200, 1600];
function imgUrl(url, w) {
  if (!url) return url;
  if (!/\/uploads\//.test(url) || /\.svg$/i.test(url) || url.includes("?")) return url;
  return `${url}?w=${w}`;
}
/** Absolute URL for share tags / JSON-LD ("/uploads/x.jpg" → "https://tripreviewall.com/uploads/x.jpg"). */
function absUrl(url) {
  if (!url) return url;
  return /^https?:\/\//i.test(url) ? url : `${SITE_URL_FOR_OG}${url.startsWith("/") ? "" : "/"}${url}`;
}

// Publisher block shared by every Article JSON-LD (D7).
const PUBLISHER_LD = {
  "@type": "Organization",
  name: "Tripreviewall",
  url: `${SITE_URL_FOR_OG}/`,
  logo: { "@type": "ImageObject", url: `${SITE_URL_FOR_OG}/icon-512.png`, width: 512, height: 512 },
};

function imgSrcset(url, widths) {
  if (!url || imgUrl(url, 1) === url) return "";
  return widths.map((w) => `${imgUrl(url, w)} ${w}w`).join(", ");
}

/**
 * <img> that fills its (position:relative) container like background-size:cover
 * did — but lazy-loads, picks the right size from srcset, has alt text, and can
 * be the eager/high-priority LCP image when `eager` is set (C13).
 */
/** <link rel="preload"> for the page's LCP image, matching coverImg()'s srcset. */
function preloadImg(url, { widths = [800, 1200, 1600], sizes = "100vw" } = {}) {
  if (!url) return "";
  const srcset = imgSrcset(url, widths);
  return `<link rel="preload" as="image" href="${esc(imgUrl(url, widths[Math.min(1, widths.length - 1)]))}"${srcset ? ` imagesrcset="${esc(srcset)}" imagesizes="${sizes}"` : ""} fetchpriority="high">`;
}

function coverImg(url, { widths = [400, 800], sizes = "100vw", alt = "", eager = false } = {}) {
  if (!url) return "";
  const src = imgUrl(url, widths[Math.min(1, widths.length - 1)]);
  const srcset = imgSrcset(url, widths);
  return `<img class="cover-img" src="${esc(src)}"${srcset ? ` srcset="${esc(srcset)}" sizes="${sizes}"` : ""} alt="${esc(alt)}" decoding="async"${eager ? ' fetchpriority="high"' : ' loading="lazy"'}>`;
}

function starsSvgHtml(fillVar) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="${fillVar}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
}

function starsRowHtml(rating) {
  const full = Math.round(rating || 0);
  let html = '<span class="stars">';
  for (let i = 0; i < 5; i++) html += starsSvgHtml(i < full ? "var(--color-positive)" : "var(--color-star-empty)");
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
  const bl = tour.bookingLinks || {};
  const hasFareharbor = !!tour.fareharborRegularLink && !(bl.fareharbor && bl.fareharbor.show === false);
  const price = tour.priceFrom != null ? `From <span class="tabular">$${esc(tour.priceFrom)}</span>` : `<span class="tabular">Price on request</span>`;
  return `
    <article class="tour-card">
      <a class="tour-card-image-wrap" href="/tours/${esc(tour.slug)}" tabindex="-1" aria-hidden="true" style="background:${img ? "var(--color-bg-alt, #eee)" : "linear-gradient(135deg,#0B3B4F,#5C8A72)"};">
        ${tour.editorsPick ? `<span class="tour-card-badge">Editor's Pick</span>` : ""}
        ${img ? `<img class="tour-photo" src="${esc(imgUrl(img, 400))}"${imgSrcset(img, [400, 800]) ? ` srcset="${esc(imgSrcset(img, [400, 800]))}" sizes="(min-width: 1024px) 300px, (min-width: 640px) 50vw, 100vw"` : ""} width="400" height="300" loading="lazy" decoding="async" alt="${esc(tour.title)} — ${esc(tour.company)}">` : ""}
      </a>
      <div class="tour-card-body">
        <div class="tour-card-eyebrow">${esc((tour.island || "").toUpperCase())} · ${esc((tour.tourType || "").toUpperCase())}</div>
        <h3 class="tour-card-title"><a href="/tours/${esc(tour.slug)}">${esc(tour.title)}</a></h3>
        <div class="tour-card-rating">
          ${starsRowHtml(tour.aggregatedRating)}
          <span class="score tabular">${(tour.aggregatedRating || 0).toFixed(1)}</span>
          <span class="count tabular">(${(tour.reviewCountTotal || 0).toLocaleString()} reviews)</span>
        </div>
        <div class="tour-card-divider"></div>
        <div class="tour-card-footer">
          <div class="tour-card-price">${price}${hasFareharbor ? `<span class="via">via FareHarbor</span>` : ""}</div>
          <a href="/tours/${esc(tour.slug)}" class="btn btn-primary">View Tour</a>
        </div>
      </div>
    </article>`;
}

module.exports = { starsRowHtml, histogramHtml, tourCardHtml, imgUrl, imgSrcset, IMG_WIDTHS, jsonLdScript, ensureSocialTags, coverImg, preloadImg, absUrl, PUBLISHER_LD };
