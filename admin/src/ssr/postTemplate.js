const { esc } = require("../utils");

const SITE_URL = process.env.SITE_URL || "https://tripreviewall.com";

function fmtDate(d) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date)) return String(d).slice(0, 10);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function inlineTourCardHtml(tour) {
  if (!tour) return "";
  const img = tour.gallery && tour.gallery[0];
  return `
    <div class="inline-tour-card">
      <div class="inline-tour-img" style="${img ? `background-image:url('${esc(img)}')` : "background:linear-gradient(135deg,#5C8A72,#0B3B4F)"}; background-size:cover; background-position:center;"></div>
      <div style="flex:1;">
        <div class="inline-tour-eyebrow">Featured Tour</div>
        <h3 class="inline-tour-title">${esc(tour.title)}</h3>
        <div class="inline-tour-rating">${(tour.aggregatedRating || 0).toFixed(1)}★ · ${(tour.reviewCountTotal || 0).toLocaleString()} reviews</div>
        <div class="inline-tour-diff">${esc(tour.company)} — ${esc(tour.duration)}, ${esc((tour.tourType || "").toLowerCase())}.</div>
        <div class="inline-tour-footer">
          <span class="inline-tour-price">From $${tour.priceFrom}</span>
          <a href="/tours/${esc(tour.slug)}" class="btn btn-primary">Check Availability</a>
        </div>
        <p class="inline-tour-disclosure">This is an affiliate link. If you book, Tripreviewall may earn a commission at no extra cost to you.</p>
      </div>
    </div>`;
}

function sidebarTourCardHtml(tour) {
  if (!tour) return "";
  const img = tour.gallery && tour.gallery[0];
  return `
    <aside class="article-sidebar-col">
      <div class="sidebar-affiliate-card">
        <div class="sidebar-affiliate-label">Featured Tour</div>
        <div class="sidebar-affiliate-img" style="${img ? `background-image:url('${esc(img)}')` : "background:linear-gradient(135deg,#5C8A72,#0B3B4F)"}; background-size:cover; background-position:center;"></div>
        <h4 class="sidebar-affiliate-title">${esc(tour.title)}</h4>
        <div style="font-size:var(--text-meta);">${(tour.aggregatedRating || 0).toFixed(1)}★ (${(tour.reviewCountTotal || 0).toLocaleString()})</div>
        <ul class="sidebar-affiliate-bullets">
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>${esc(tour.duration)}</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>${esc(tour.tourType)}</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>${esc(tour.island)}</li>
        </ul>
        <div class="sidebar-affiliate-price">From $${tour.priceFrom}/person</div>
        <a href="/tours/${esc(tour.slug)}" class="btn btn-primary btn-full">Check Availability</a>
        <p class="inline-tour-disclosure">Tripreviewall may earn a commission if you book through this link, at no extra cost to you.</p>
      </div>
    </aside>`;
}

function relatedArticlesHtml(related) {
  if (related.length === 0) return `<p style="color:var(--color-text-muted);">More articles coming soon.</p>`;
  return related.map((p) => `
    <a href="/blog/${esc(p.slug)}" class="blog-card">
      <div class="blog-card-image" style="${p.featuredImage ? `background:url('${esc(p.featuredImage)}')` : "background:linear-gradient(135deg,#0B3B4F,#5C8A72)"}; background-size:cover; background-position:center;"></div>
      <div class="blog-card-body">
        <div class="blog-card-cat">${esc(p.category || "")}</div>
        <h3 class="blog-card-title">${esc(p.title)}</h3>
        <div class="blog-card-meta">${fmtDate(p.updatedAt)}${p.readTime ? " · " + p.readTime + " min read" : ""}</div>
      </div>
    </a>`).join("");
}

function injectTOC(bodyHtml) {
  const headings = [];
  let idx = 0;
  const processedBody = bodyHtml.replace(/<h([23])([^>]*)>([\s\S]*?)<\/h\1>/gi, (match, level, attrs, text) => {
    idx++;
    const id = `toc-${idx}`;
    const plainText = text.replace(/<[^>]+>/g, "").trim();
    if (plainText) headings.push({ level: Number(level), id, text: plainText });
    const cleanAttrs = (attrs || "").replace(/\sid="[^"]*"/i, "");
    return `<h${level}${cleanAttrs} id="${id}">${text}</h${level}>`;
  });
  return { processedBody, headings };
}

function tocHtml(headings) {
  if (headings.length < 2) return ""; // not worth a TOC box for 0-1 headings
  return `
    <div style="background:var(--color-bg-alt);border:1px solid var(--color-border);border-radius:8px;padding:20px 24px;margin:0 0 32px;">
      <div style="font-weight:700;margin-bottom:10px;">In This Guide</div>
      <ul style="margin:0;padding-left:20px;">
        ${headings.map((h) => `<li style="margin-bottom:6px;${h.level === 3 ? "margin-left:16px;" : ""}"><a href="#${h.id}" style="color:var(--color-primary);text-decoration:none;">${esc(h.text)}</a></li>`).join("")}
      </ul>
    </div>`;
}

function jsonLd(post, relatedTour) {
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: { "@type": "Person", name: post.author || "Tripreviewall Editorial Team" },
    publisher: { "@type": "Organization", name: "Tripreviewall" },
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
      { "@type": "ListItem", position: 3, name: post.title },
    ],
  };
  const scripts = [
    `<script type="application/ld+json">${JSON.stringify(article)}</script>`,
    `<script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>`,
  ];

  // Review schema — only when this is a deep-dive review of one specific
  // tour, and we actually have that tour's aggregate rating to cite.
  if (post.contentFormat === "deep_dive_review" && relatedTour && relatedTour.aggregatedRating) {
    const review = {
      "@context": "https://schema.org",
      "@type": "Review",
      itemReviewed: { "@type": "TouristTrip", name: relatedTour.title },
      author: { "@type": "Person", name: post.author || "Tripreviewall Editorial Team" },
      datePublished: post.publishedAt,
      reviewRating: {
        "@type": "Rating",
        ratingValue: String(relatedTour.aggregatedRating),
        bestRating: "5",
        worstRating: "1",
      },
    };
    scripts.push(`<script type="application/ld+json">${JSON.stringify(review)}</script>`);
  }

  return scripts.join("\n");
}

/**
 * Renders the full static Blog Post page HTML.
 * `relatedTour` — the tour object for post.relatedTourSlug, or null.
 * `relatedPosts` — up to 3 other published posts, already fetched by the caller.
 */
function renderPostPageHtml(post, relatedTour, relatedPosts, author) {
  const canonical = post.canonicalUrl || `${SITE_URL}/blog/${post.slug}`;
  const metaTitle = post.metaTitle || post.title;
  const metaDesc = (post.metaDescription || post.excerpt || post.title).slice(0, 155);
  const { processedBody, headings } = injectTOC(post.body || "");

  const tags = [];
  if (post.category) tags.push(`<span class="tag-pill tag-category">${esc(post.category)}</span>`);
  if (post.island) tags.push(`<span class="tag-pill tag-island">${esc(post.island)}</span>`);

  const metaParts = [];
  if (post.author) metaParts.push(`<span class="author-name">${esc(post.author)}</span>`);
  if (post.publishedAt) metaParts.push(`<span>Published ${fmtDate(post.publishedAt)}</span>`);
  if (post.updatedAt && post.publishedAt && fmtDate(post.updatedAt) !== fmtDate(post.publishedAt)) {
    metaParts.push(`<span class="updated">Updated ${fmtDate(post.updatedAt)}</span>`);
  }
  if (post.readTime) metaParts.push(`<span>${post.readTime} min read</span>`);

  const internalLinks = [];
  if (post.island) {
    internalLinks.push(`<a href="/destinations/${post.island.toLowerCase().replace(" ", "-")}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
      More ${esc(post.island)} guides</a>`);
  }
  if (relatedTour) {
    internalLinks.push(`<a href="/tours/${esc(relatedTour.slug)}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
      See tour details & availability</a>`);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(metaTitle)} | Tripreviewall</title>
<meta name="description" content="${esc(metaDesc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(metaTitle)}">
<meta property="og:description" content="${esc(metaDesc)}">
${post.featuredImage ? `<meta property="og:image" content="${SITE_URL}${post.featuredImage}">` : ""}
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="Tripreviewall">
<meta property="article:published_time" content="${esc(String(post.publishedAt || ""))}">
<meta property="article:modified_time" content="${esc(String(post.updatedAt || ""))}">
${post.author ? `<meta property="article:author" content="${esc(post.author)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(metaTitle)}">
<meta name="twitter:description" content="${esc(metaDesc)}">
${post.featuredImage ? `<meta name="twitter:image" content="${SITE_URL}${post.featuredImage}">` : ""}
${jsonLd(post, relatedTour)}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/tokens.css">
<link rel="stylesheet" href="../css/style.css">
<link rel="stylesheet" href="../css/blog-detail.css">
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
      <a href="/blog">Blog</a><span class="sep">/</span>
      <span class="current">${esc(post.title)}</span>
    </nav>

    <div class="article-header">
      <div class="article-tags">${tags.join("")}</div>
      <h1 class="article-headline">${esc(post.title)}</h1>
      <div class="article-meta-row">${metaParts.join('<span>·</span>')}</div>
      <hr class="article-divider">
    </div>

    ${post.disclosureText ? `
    <div class="disclosure-banner">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
      <span>${esc(post.disclosureText)}</span>
    </div>` : ""}

    ${post.featuredImage ? `<div class="article-hero-img" style="background-image:url('..${esc(post.featuredImage)}')"></div><p class="article-hero-caption">Photo: Operator</p>` : ""}

    <div class="article-body-grid">
      <div class="article-body-main">
        ${tocHtml(headings)}
        <div class="article-prose">${processedBody}</div>

        ${inlineTourCardHtml(relatedTour)}

        ${(author || post.author || post.island || relatedTour) ? `
        <div class="author-box">
          ${author ? `
          <div class="author-card">
            <div class="author-photo"${author.photoUrl ? ` style="background-image:url('..${esc(author.photoUrl)}');background-size:cover;background-position:center;"` : ""}></div>
            <div>
              <p class="author-name">${esc(author.name)}</p>
              ${author.roleTitle ? `<p class="author-role">${esc(author.roleTitle)}</p>` : ""}
              ${author.experienceStatement ? `<p class="author-experience">${esc(author.experienceStatement)}</p>` : ""}
              ${author.statsLine ? `<p class="author-stats">${esc(author.statsLine)}</p>` : ""}
              ${author.postCount != null ? `<p class="author-stats">${author.postCount} article${author.postCount === 1 ? "" : "s"} published on Tripreviewall</p>` : ""}
              ${author.profileLink ? `<a class="author-profile-link" href="${esc(author.profileLink)}">Full profile →</a>` : ""}
            </div>
          </div>` : `
          <div class="author-card"${post.author ? "" : ' style="display:none;"'}>
            <div class="author-photo"></div>
            <div>
              <p class="author-name">${esc(post.author || "")}</p>
              <p class="author-role">Tripreviewall Editorial Team</p>
            </div>
          </div>`}
          ${internalLinks.length > 0 ? `<div class="internal-links-box">${internalLinks.join("")}</div>` : ""}
        </div>` : ""}
      </div>

      ${sidebarTourCardHtml(relatedTour)}
    </div>

    <section class="section" style="padding-top:0;">
      <h2 class="detail-section-title">Read Next</h2>
      <div class="blog-grid">${relatedArticlesHtml(relatedPosts)}</div>
    </section>
  </div>
</main>

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
</body>
</html>`;
}

module.exports = { renderPostPageHtml };
