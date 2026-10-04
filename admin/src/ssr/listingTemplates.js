const { esc } = require("../utils");
const { headBoilerplate, scriptTags, siteHeader, siteFooter } = require("./layout");
const { tourCardHtml, imgUrl, coverImg, preloadImg, absUrl } = require("./sharedHtml");
const { ISLANDS } = require("./islands");

const { SITE_URL, CATEGORY_GRADIENTS, DEFAULT_GRADIENT, BLOG_CATEGORIES: DEFAULT_CATEGORY_LIST } = require("../siteConfig");


/* ============================================================
   /tours
   ============================================================ */
const TOURS_PER_PAGE = 24;
function toursPageUrl(n) { return n <= 1 ? "/tours" : `/tours/page/${n}`; }

/** Real <a href> pagination so every tour is reachable by crawlers without JS. */
function toursPaginationHtml(page, totalPages) {
  if (totalPages <= 1) return "";
  const arrowL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
  const arrowR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
  let html = page > 1 ? `<a class="page-btn" href="${toursPageUrl(page - 1)}" rel="prev" aria-label="Previous page">${arrowL}</a>` : `<span class="page-btn" aria-disabled="true" style="opacity:.4;">${arrowL}</span>`;
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 2) {
      html += p === page ? `<span class="page-btn active" aria-current="page">${p}</span>` : `<a class="page-btn" href="${toursPageUrl(p)}">${p}</a>`;
    } else if (Math.abs(p - page) === 3) {
      html += `<span class="page-btn" style="border:none;background:none;">…</span>`;
    }
  }
  html += page < totalPages ? `<a class="page-btn" href="${toursPageUrl(page + 1)}" rel="next" aria-label="Next page">${arrowR}</a>` : `<span class="page-btn" aria-disabled="true" style="opacity:.4;">${arrowR}</span>`;
  return `<nav class="pagination" id="pagination" aria-label="Tour pages">${html}</nav>`;
}

function renderToursIndexHtml(tours, page = 1) {
  const sorted = [...tours].sort((a, b) => b.reviewCountTotal - a.reviewCountTotal || a.title.localeCompare(b.title));
  const totalPages = Math.max(1, Math.ceil(sorted.length / TOURS_PER_PAGE));
  page = Math.min(Math.max(1, page), totalPages);
  const start = (page - 1) * TOURS_PER_PAGE;
  const firstPage = sorted.slice(start, start + TOURS_PER_PAGE);
  const pageSuffix = page > 1 ? ` — Page ${page} of ${totalPages}` : "";
  const canonicalPath = toursPageUrl(page);
  const islandCounts = {};
  tours.forEach((t) => { islandCounts[t.island] = (islandCounts[t.island] || 0) + 1; });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>All Hawaii Tours${pageSuffix} — Tripreviewall</title>
<meta name="description" content="${tours.length} Hawaii tours compared across FareHarbor, TripAdvisor and GetYourGuide — ranked by real, honest data, updated continuously.">
<link rel="canonical" href="${SITE_URL}${canonicalPath}">
${page > 1 ? `<link rel="prev" href="${SITE_URL}${toursPageUrl(page - 1)}">` : ""}
${page < totalPages ? `<link rel="next" href="${SITE_URL}${toursPageUrl(page + 1)}">` : ""}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Tripreviewall">
<meta property="og:title" content="All Hawaii Tours${pageSuffix} — Tripreviewall">
<meta property="og:description" content="${tours.length} Hawaii tours compared across FareHarbor, TripAdvisor and GetYourGuide.">
<meta property="og:url" content="${SITE_URL}${canonicalPath}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="All Hawaii Tours — Tripreviewall">
<meta name="twitter:description" content="${tours.length} Hawaii tours compared across FareHarbor, TripAdvisor and GetYourGuide.">
${headBoilerplate(["all-tours"])}
</head>
<body>
${siteHeader()}
<main id="main">
  <div class="container">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a><span class="sep">/</span>
      ${page > 1 ? `<a href="/tours">All Hawaii Tours</a><span class="sep">/</span><span class="current">Page ${page}</span>` : `<span class="current">All Hawaii Tours</span>`}
    </nav>
    <div class="page-header-block">
      <h1 class="page-h1">All Hawaii Tours${page > 1 ? ` <span style="font-weight:500;color:var(--color-text-muted);font-size:0.6em;">Page ${page}</span>` : ""}</h1>
      <p class="page-subline">${tours.length} tours compared across FareHarbor, TripAdvisor &amp; GetYourGuide — Oahu (${islandCounts.Oahu || 0}), Maui (${islandCounts.Maui || 0}), Kauai (${islandCounts.Kauai || 0}) &amp; Big Island (${islandCounts["Big Island"] || 0}), updated continuously.</p>
      <div class="at-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input type="text" id="at-search-input" placeholder="Search tours, e.g. 'sunset catamaran Maui'">
      </div>
    </div>
    <div id="sort-bar-anchor"></div>
    <div class="sort-bar">
      <div class="result-count" id="result-count">Showing <span class="n">${start + 1}–${start + firstPage.length}</span> of <span class="n">${tours.length}</span> tours</div>
      <div class="sort-select-wrap">
        <label for="sort-select">Sort</label>
        <select class="sort-select" id="sort-select">
          <option value="most-reviewed">Most Reviewed</option>
          <option value="highest-rated">Highest Rated</option>
          <option value="price-low">Price: Low to High</option>
          <option value="price-high">Price: High to Low</option>
        </select>
      </div>
    </div>
    <h2 class="visually-hidden">Tour list</h2>
    <div class="tour-grid" id="all-tours-grid" data-page="${page}">${firstPage.map((t) => tourCardHtml(t, "", "")).join("")}</div>
    <div class="empty-state" id="empty-state" style="display:none;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      <h3>No tours match this search yet.</h3>
      <p>Try a different keyword, or browse the full list.</p>
      <button type="button" class="btn btn-secondary" data-clear-search="at-search-input">Clear search</button>
    </div>
    ${toursPaginationHtml(page, totalPages) || `<div class="pagination" id="pagination"></div>`}
    <div class="seo-block">
      <p>Hawaii's tour market spans four main islands, each with a different mix of operators and activity types. Oahu carries the largest share of listings we track (${islandCounts.Oahu || 0} tours), Big Island follows with ${islandCounts["Big Island"] || 0}, while Maui (${islandCounts.Maui || 0}) and Kauai (${islandCounts.Kauai || 0}) round out the list. We update this list continuously as new tours are added and existing ones are re-checked.</p>
    </div>
  </div>
</main>
${siteFooter()}
${scriptTags(["data-loader", "main", "all-tours"])}
</body>
</html>`;
}

/* ============================================================
   /blog
   ============================================================ */
/** Same date format the old client-side renderer used ("Sep 10, 2026"), so nothing changes on hydrate. */
function fmtPostDate(d) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date)) return String(d).slice(0, 10);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

const BLOG_INITIAL_VISIBLE = 6;

function blogCardHtml(p, prefix, hidden) {
  return `
    <a href="/blog/${esc(p.slug)}" class="blog-card" data-category="${esc(p.category || "")}" data-island="${esc(p.island || "")}"${hidden ? " hidden" : ""}>
      <div class="blog-card-image" style="background:${CATEGORY_GRADIENTS[p.category] || DEFAULT_GRADIENT};">${coverImg(p.featuredImage, { sizes: "(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw" })}</div>
      <div class="blog-card-body">
        <div class="blog-card-tags">
          ${p.category ? `<span class="blog-card-cat" style="margin-bottom:0;">${esc(p.category)}</span>` : ""}
          ${p.island ? `<span class="blog-card-island"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>${esc(p.island)}</span>` : ""}
        </div>
        <h3 class="blog-card-title">${esc(p.title)}</h3>
        <div class="blog-card-meta">${p.author ? esc(p.author) + " · " : ""}Last updated ${esc(fmtPostDate(p.updatedAt))}${p.readTime ? " · " + p.readTime + " min read" : ""}</div>
      </div>
    </a>`;
}

/**
 * `categories` = active category names from Admin → Blog Posts → Categories
 * (passed in by the generator). Falls back to the old fixed list only if the
 * categories table can't be read.
 */
function renderBlogIndexHtml(posts, pillarPosts = [], categories = null) {
  const sorted = [...posts].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const tabs = ["All", ...(Array.isArray(categories) ? categories : DEFAULT_CATEGORY_LIST)];
  const pillarCards = pillarPosts
    .map((p) => `
      <a class="pillar-card" href="/blog/${esc(p.slug)}">
        <div class="pillar-card-img" style="background:linear-gradient(135deg,#0B3B4F,#5C8A72);">${coverImg(p.featuredImage, { sizes: "(min-width: 1024px) 300px, 60vw" })}</div>
        <div class="pillar-card-title">${esc(p.title)}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        </div>
      </a>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>All Articles — Tripreviewall Hawaii Travel Guide</title>
<meta name="description" content="Straight talk on Hawaii tours — what's actually worth booking, what to skip, and why.">
<link rel="canonical" href="${SITE_URL}/blog">
<link rel="alternate" type="application/rss+xml" title="Tripreviewall Blog RSS Feed" href="${SITE_URL}/rss.xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Tripreviewall">
<meta property="og:title" content="All Articles — Tripreviewall Hawaii Travel Guide">
<meta property="og:description" content="Straight talk on Hawaii tours — what's actually worth booking, what to skip, and why.">
<meta property="og:url" content="${SITE_URL}/blog">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="All Articles — Tripreviewall">
<meta name="twitter:description" content="Straight talk on Hawaii tours — what's actually worth booking, what to skip, and why.">
${headBoilerplate(["blog"])}
</head>
<body>
${siteHeader()}
<main id="main">
  <div class="container blog-page-header">
    <nav class="breadcrumb" aria-label="Breadcrumb" style="padding:0 0 12px;">
      <a href="/">Home</a><span class="sep">/</span><span class="current">All Articles</span>
    </nav>
    <p class="hero-eyebrow" style="color:var(--color-primary);">Travel Guide</p>
    <h1 class="page-h1">All Articles</h1>
    <p class="page-subline">Straight talk on Hawaii tours — what's actually worth booking, what to skip, and why.</p>
  </div>

  <div class="pillar-band" id="pillar-band"${pillarCards ? "" : ' style="display:none;"'} role="region" aria-label="Island and topic guides">
    <div class="container">
      <div class="pillar-eyebrow">Start Here: Island &amp; Topic Guides</div>
      <div class="pillar-row" id="pillar-row">${pillarCards}</div>
    </div>
  </div>

  <div class="container">
    <div class="layer1-tabs" id="layer1-tabs" role="group" aria-label="Filter articles by category">${tabs.map((c, i) => `<button type="button" class="layer1-tab${i === 0 ? " active" : ""}" data-cat="${esc(c)}" aria-pressed="${i === 0 ? "true" : "false"}">${esc(c)}</button>`).join("")}</div>
    <div class="layer2-row">
      <label for="island-select" style="font-size:var(--text-meta);color:var(--color-text-muted);">Filter by:</label>
      <select class="layer2-select" id="island-select">${["All", ...new Set(sorted.map((p) => p.island).filter(Boolean))].map((i) => `<option value="${esc(i)}">${i === "All" ? "Island: All" : esc(i)}</option>`).join("")}</select>
    </div>
    <h2 class="visually-hidden">Articles</h2>
    <div class="blog-grid" id="blog-grid">${sorted.map((p, i) => blogCardHtml(p, "", i >= BLOG_INITIAL_VISIBLE)).join("")}</div>
    <div class="empty-state" id="blog-empty" style="display:none;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      <h3>No articles match these filters yet.</h3>
      <p>Try a different category, or check back soon — we're adding new reviews regularly.</p>
    </div>
    <div class="load-more-wrap">
      <button type="button" class="btn btn-secondary" id="load-more-btn"${sorted.length > BLOG_INITIAL_VISIBLE ? "" : ' style="display:none;"'}>Load More</button>
    </div>
  </div>
</main>
${siteFooter()}
${scriptTags(["main", "blog"])}
</body>
</html>`;
}

/* ============================================================
   /destinations
   ============================================================ */
function renderDestinationsHubHtml(islandCounts, destinationsBySlug = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Explore Hawaii by Island — Tripreviewall</title>
<meta name="description" content="Browse honest, aggregated Hawaii tour reviews by island — Oahu, Maui, Kauai and Big Island.">
<link rel="canonical" href="${SITE_URL}/destinations">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Tripreviewall">
<meta property="og:title" content="Explore Hawaii by Island — Tripreviewall">
<meta property="og:description" content="Browse honest, aggregated Hawaii tour reviews by island.">
<meta property="og:url" content="${SITE_URL}/destinations">
${headBoilerplate(["pages"])}
</head>
<body>
${siteHeader()}
<main id="main">
  <div class="container">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a><span class="sep">/</span><span class="current">Destinations</span>
    </nav>
    <div class="page-header-block">
      <h1 class="page-h1">Explore Hawaii by Island</h1>
      <p class="page-subline">Four islands, one honest rating system. Pick an island to see every tour we track there.</p>
    </div>
    <h2 class="visually-hidden">Islands</h2>
    <div class="dest-grid" style="margin-bottom:96px;">
      ${ISLANDS.map((isl) => {
        const heroImage = destinationsBySlug[isl.slug] && destinationsBySlug[isl.slug].heroImage;
        return `
      <a class="dest-card" href="/destinations/${isl.slug}" style="background:${isl.gradient};">
        ${coverImg(heroImage, { sizes: "(min-width: 1024px) 300px, 50vw" })}
        <div class="dest-card-content"><h3 class="dest-card-name">${isl.name}</h3>
        <div class="dest-card-count">${islandCounts[isl.name] || 0} tours tracked</div></div>
      </a>`;
      }).join("")}
    </div>
  </div>
</main>
${siteFooter()}
${scriptTags(["main"])}
</body>
</html>`;
}

/* ============================================================
   /destinations/<island>
   ============================================================ */
function renderIslandPageHtml(islandSlug, tours, posts, destinationOverride) {
  const island = ISLANDS.find((i) => i.slug === islandSlug);
  const islandTours = tours.filter((t) => t.island === island.name);
  const islandPosts = posts.filter((p) => p.island === island.name);

  // Admin-edited intro/hero photo (Destinations module) take priority over
  // the static defaults in ./islands.js, which remain the bootstrap fallback.
  const introText = (destinationOverride && destinationOverride.introText) || island.intro;
  const heroImage = destinationOverride && destinationOverride.heroImage;
  const seo = (destinationOverride && destinationOverride.seo) || {};
  const metaTitle = seo.metaTitle || `${island.name} Tours — Tripreviewall`;
  const metaDescription = seo.metaDescription || `Honest, aggregated ${island.name} tour reviews — every rating we collect, 5-star and 1-star alike.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(metaTitle)}</title>
<meta name="description" content="${esc(metaDescription)}">
<link rel="canonical" href="${SITE_URL}/destinations/${island.slug}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Tripreviewall">
<meta property="og:title" content="${esc(metaTitle)}">
<meta property="og:description" content="${esc(metaDescription)}">
${heroImage ? `<meta property="og:image" content="${esc(absUrl(imgUrl(heroImage, 1200)))}">` : ""}
<meta property="og:url" content="${SITE_URL}/destinations/${island.slug}">
${preloadImg(heroImage, { sizes: "(min-width: 1280px) 1200px, 100vw" })}
${headBoilerplate(["pages"])}
</head>
<body>
${siteHeader()}
<main id="main">
  <div class="container">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a><span class="sep">/</span>
      <a href="/destinations">Destinations</a><span class="sep">/</span>
      <span class="current">${island.name}</span>
    </nav>

    <div class="dest-island-tabs">
      ${ISLANDS.map((i) => `<a class="dest-island-tab${i.slug === island.slug ? " active" : ""}" href="/destinations/${i.slug}">${i.name}</a>`).join("")}
    </div>

    <div class="dest-hero" style="background:${island.gradient};">
      ${coverImg(heroImage, { widths: [800, 1200, 1600], sizes: "(min-width: 1280px) 1200px, 100vw", alt: `${island.name}, Hawaii`, eager: true })}
      <div class="dest-hero-content">
        <h1>${island.name}</h1>
        <p>${islandTours.length} tours tracked</p>
      </div>
    </div>
    <p class="dest-intro">${esc(introText)}</p>

    <div class="section-header-row"><h2 class="section-title">Tours on ${island.name}</h2></div>
    <div class="tour-grid">${islandTours.slice(0, 8).map((t) => tourCardHtml(t, "../", "")).join("") || `<p style="color:var(--color-text-muted);">No tours tracked yet.</p>`}</div>
    <div class="view-all-wrap"><a href="/tours?q=${encodeURIComponent(island.name)}" class="btn btn-secondary">View All Tours on This Island</a></div>

    <section class="section">
      <div class="section-header-row"><h2 class="section-title">Articles About ${island.name}</h2></div>
      <div class="blog-grid">${islandPosts.length ? islandPosts.map((p) => blogCardHtml(p, "../")).join("") : ""}</div>
      ${islandPosts.length === 0 ? `<p style="color:var(--color-text-muted);">No articles tagged for this island yet — check back soon.</p>` : ""}
    </section>
  </div>
</main>
${siteFooter()}
${scriptTags(["main"])}
</body>
</html>`;
}

module.exports = { TOURS_PER_PAGE, renderToursIndexHtml, renderBlogIndexHtml, renderDestinationsHubHtml, renderIslandPageHtml, ISLANDS };
