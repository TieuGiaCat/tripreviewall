const { esc } = require("../utils");
const { tourCardHtml } = require("./sharedHtml");
const { ISLANDS } = require("./islands");

const SITE_URL = process.env.SITE_URL || "https://tripreviewall.com";

const HEADER = (depth) => {
  const p = depth === 0 ? "" : "../";
  return `
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
</div>`;
};

const FOOTER = (depth) => {
  const p = depth === 0 ? "" : "../";
  return `
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
</footer>`;
};

/* ============================================================
   /tours
   ============================================================ */
function renderToursIndexHtml(tours) {
  const sorted = [...tours].sort((a, b) => b.reviewCountTotal - a.reviewCountTotal);
  const firstPage = sorted.slice(0, 24);
  const islandCounts = {};
  tours.forEach((t) => { islandCounts[t.island] = (islandCounts[t.island] || 0) + 1; });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>All Hawaii Tours — Tripreviewall</title>
<meta name="description" content="${tours.length} Hawaii tours compared across FareHarbor, TripAdvisor and GetYourGuide — ranked by real, honest data, updated continuously.">
<link rel="canonical" href="${SITE_URL}/tours">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Tripreviewall">
<meta property="og:title" content="All Hawaii Tours — Tripreviewall">
<meta property="og:description" content="${tours.length} Hawaii tours compared across FareHarbor, TripAdvisor and GetYourGuide.">
<meta property="og:url" content="${SITE_URL}/tours">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="All Hawaii Tours — Tripreviewall">
<meta name="twitter:description" content="${tours.length} Hawaii tours compared across FareHarbor, TripAdvisor and GetYourGuide.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/tokens.css">
<link rel="stylesheet" href="css/style.css">
<link rel="stylesheet" href="css/all-tours.css">
</head>
<body>
<a href="#main" class="skip-link">Skip to content</a>
${HEADER(0)}
<main id="main">
  <div class="container">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a><span class="sep">/</span>
      <span class="current">All Hawaii Tours</span>
    </nav>
    <div class="page-header-block">
      <h1 class="page-h1">All Hawaii Tours</h1>
      <p class="page-subline">${tours.length} tours compared across FareHarbor, TripAdvisor &amp; GetYourGuide — Oahu (${islandCounts.Oahu || 0}), Maui (${islandCounts.Maui || 0}), Kauai (${islandCounts.Kauai || 0}) &amp; Big Island (${islandCounts["Big Island"] || 0}), updated continuously.</p>
      <div class="at-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input type="text" id="at-search-input" placeholder="Search tours, e.g. 'sunset catamaran Maui'">
      </div>
    </div>
    <div id="sort-bar-anchor"></div>
    <div class="sort-bar">
      <div class="result-count" id="result-count">Showing <span class="n">1–${firstPage.length}</span> of <span class="n">${tours.length}</span> tours</div>
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
    <div class="tour-grid" id="all-tours-grid">${firstPage.map((t) => tourCardHtml(t, "", "")).join("")}</div>
    <div class="empty-state" id="empty-state" style="display:none;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      <h3>No tours match this search yet.</h3>
      <p>Try a different keyword, or browse the full list.</p>
      <button class="btn btn-secondary" onclick="document.getElementById('at-search-input').value='';document.getElementById('at-search-input').dispatchEvent(new Event('input'));">Clear search</button>
    </div>
    <div class="pagination" id="pagination"></div>
    <div class="seo-block">
      <p>Hawaii's tour market spans four main islands, each with a different mix of operators and activity types. Oahu carries the largest share of listings we track (${islandCounts.Oahu || 0} tours), Big Island follows with ${islandCounts["Big Island"] || 0}, while Maui (${islandCounts.Maui || 0}) and Kauai (${islandCounts.Kauai || 0}) round out the list. We update this list continuously as new tours are added and existing ones are re-checked.</p>
    </div>
  </div>
</main>
${FOOTER(0)}
<script src="js/data-loader.js"></script>
<script src="js/main.js"></script>
<script src="js/all-tours.js"></script>
</body>
</html>`;
}

/* ============================================================
   /blog
   ============================================================ */
function blogCardHtml(p, prefix) {
  const gradients = {
    "Real Traveler Reviews & Data": "linear-gradient(135deg,#B85C4A,#0B3B4F)",
    "Tour Reviews by Type": "linear-gradient(135deg,#D97B4F,#0B3B4F)",
    "Island Guides": "linear-gradient(135deg,#0B3B4F,#5C8A72)",
    "Booking & Practical Info": "linear-gradient(135deg,#26313A,#B8592F)",
    "Planning & Comparisons": "linear-gradient(135deg,#5C8A72,#0B3B4F)",
  };
  const bg = p.featuredImage ? `url('${esc(p.featuredImage)}')` : (gradients[p.category] || "linear-gradient(135deg,#0B3B4F,#5C8A72)");
  return `
    <a href="/blog/${esc(p.slug)}" class="blog-card">
      <div class="blog-card-image" style="background:${bg}; background-size:cover; background-position:center;"></div>
      <div class="blog-card-body">
        <div class="blog-card-tags">
          ${p.category ? `<span class="blog-card-cat" style="margin-bottom:0;">${esc(p.category)}</span>` : ""}
          ${p.island ? `<span class="blog-card-island"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>${esc(p.island)}</span>` : ""}
        </div>
        <h3 class="blog-card-title">${esc(p.title)}</h3>
        <div class="blog-card-meta">${p.author ? esc(p.author) + " · " : ""}Last updated ${esc(String(p.updatedAt).slice(0, 10))}${p.readTime ? " · " + p.readTime + " min read" : ""}</div>
      </div>
    </a>`;
}

function renderBlogIndexHtml(posts) {
  const sorted = [...posts].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>All Articles — Tripreviewall Hawaii Travel Guide</title>
<meta name="description" content="Straight talk on Hawaii tours — what's actually worth booking, what to skip, and why.">
<link rel="canonical" href="${SITE_URL}/blog">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Tripreviewall">
<meta property="og:title" content="All Articles — Tripreviewall Hawaii Travel Guide">
<meta property="og:description" content="Straight talk on Hawaii tours — what's actually worth booking, what to skip, and why.">
<meta property="og:url" content="${SITE_URL}/blog">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="All Articles — Tripreviewall">
<meta name="twitter:description" content="Straight talk on Hawaii tours — what's actually worth booking, what to skip, and why.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/tokens.css">
<link rel="stylesheet" href="css/style.css">
<link rel="stylesheet" href="css/blog.css">
</head>
<body>
<a href="#main" class="skip-link">Skip to content</a>
${HEADER(0)}
<main id="main">
  <div class="container blog-page-header">
    <nav class="breadcrumb" aria-label="Breadcrumb" style="padding:0 0 12px;">
      <a href="/">Home</a><span class="sep">/</span><span class="current">All Articles</span>
    </nav>
    <p class="hero-eyebrow" style="color:var(--color-primary);">Travel Guide</p>
    <h1 class="page-h1">All Articles</h1>
    <p class="page-subline">Straight talk on Hawaii tours — what's actually worth booking, what to skip, and why.</p>
  </div>

  <div class="pillar-band" id="pillar-band" style="display:none;" aria-label="Island and topic guides">
    <div class="container">
      <div class="pillar-eyebrow">Start Here: Island &amp; Topic Guides</div>
      <div class="pillar-row" id="pillar-row"></div>
    </div>
  </div>

  <div class="container">
    <div class="layer1-tabs" id="layer1-tabs"></div>
    <div class="layer2-row">
      <span style="font-size:var(--text-meta);color:var(--color-text-muted);">Filter by:</span>
      <select class="layer2-select" id="island-select"></select>
    </div>
    <div class="blog-grid" id="blog-grid">${sorted.map((p) => blogCardHtml(p, "")).join("")}</div>
    <div class="empty-state" id="blog-empty" style="display:none;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      <h3>No articles match these filters yet.</h3>
      <p>Try a different category, or check back soon — we're adding new reviews regularly.</p>
    </div>
    <div class="load-more-wrap">
      <button class="btn btn-secondary" id="load-more-btn" style="display:none;">Load More</button>
    </div>
  </div>
</main>
${FOOTER(0)}
<script src="js/data-loader.js"></script>
<script src="js/main.js"></script>
<script src="js/blog.js"></script>
</body>
</html>`;
}

/* ============================================================
   /destinations
   ============================================================ */
function renderDestinationsHubHtml(islandCounts) {
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/tokens.css">
<link rel="stylesheet" href="css/style.css">
<link rel="stylesheet" href="css/pages.css">
</head>
<body>
<a href="#main" class="skip-link">Skip to content</a>
${HEADER(0)}
<main id="main">
  <div class="container">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a><span class="sep">/</span><span class="current">Destinations</span>
    </nav>
    <div class="page-header-block">
      <h1 class="page-h1">Explore Hawaii by Island</h1>
      <p class="page-subline">Four islands, one honest rating system. Pick an island to see every tour we track there.</p>
    </div>
    <div class="dest-grid" style="margin-bottom:96px;">
      ${ISLANDS.map((isl) => `
      <a class="dest-card" href="/destinations/${isl.slug}" style="background-image:${isl.gradient}">
        <div class="dest-card-content"><h3 class="dest-card-name">${isl.name}</h3>
        <div class="dest-card-count">${islandCounts[isl.name] || 0} tours tracked</div></div>
      </a>`).join("")}
    </div>
  </div>
</main>
${FOOTER(0)}
<script src="js/main.js"></script>
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
${heroImage ? `<meta property="og:image" content="${SITE_URL}${heroImage}">` : ""}
<meta property="og:url" content="${SITE_URL}/destinations/${island.slug}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/tokens.css">
<link rel="stylesheet" href="../css/style.css">
<link rel="stylesheet" href="../css/pages.css">
</head>
<body>
<a href="#main" class="skip-link">Skip to content</a>
${HEADER(1)}
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

    <div class="dest-hero" style="background-image:${heroImage ? `url('${esc(heroImage)}')` : island.gradient}; background-size:cover; background-position:center;">
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
${FOOTER(1)}
<script src="../js/main.js"></script>
</body>
</html>`;
}

module.exports = { renderToursIndexHtml, renderBlogIndexHtml, renderDestinationsHubHtml, renderIslandPageHtml, ISLANDS };
