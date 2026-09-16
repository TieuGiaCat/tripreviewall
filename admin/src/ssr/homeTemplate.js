const { esc } = require("../utils");
const { tourCardHtml } = require("./sharedHtml");

const SITE_URL = process.env.SITE_URL || "https://tripreviewall.com";
const EDITORS_PICK_SLUGS = ["ohana-surf-project-sup-lessons"];

const ISLAND_META = [
  { slug: "oahu", name: "Oahu", gradient: "linear-gradient(135deg,#0B3B4F,#5C8A72)" },
  { slug: "maui", name: "Maui", gradient: "linear-gradient(135deg,#B8592F,#0B3B4F)" },
  { slug: "kauai", name: "Kauai", gradient: "linear-gradient(135deg,#5C8A72,#26313A)" },
  { slug: "big-island", name: "Big Island", gradient: "linear-gradient(135deg,#26313A,#B85C4A)" },
];

const CAT_GRADIENTS = {
  "Real Traveler Reviews & Data": "linear-gradient(135deg,#B85C4A,#0B3B4F)",
  "Tour Reviews by Type": "linear-gradient(135deg,#D97B4F,#0B3B4F)",
  "Island Guides": "linear-gradient(135deg,#0B3B4F,#5C8A72)",
  "Booking & Practical Info": "linear-gradient(135deg,#26313A,#B8592F)",
  "Planning & Comparisons": "linear-gradient(135deg,#5C8A72,#0B3B4F)",
};

function blogCardHtml(p) {
  const bg = p.featuredImage ? `url('${esc(p.featuredImage)}')` : (CAT_GRADIENTS[p.category] || "linear-gradient(135deg,#0B3B4F,#5C8A72)");
  return `
    <a href="blog/${esc(p.slug)}.html" class="blog-card">
      <div class="blog-card-image" style="background:${bg}; background-size:cover; background-position:center;"></div>
      <div class="blog-card-body">
        <div class="blog-card-cat">${esc(p.category || "")}</div>
        <h3 class="blog-card-title">${esc(p.title)}</h3>
        <div class="blog-card-meta">${new Date(p.updatedAt).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"})}${p.readTime ? " · " + p.readTime + " min read" : ""}</div>
      </div>
    </a>`;
}

function renderHomeHtml(tours, posts, islandCounts) {
  const featured = tours
    .map((t) => ({ ...t, badge: EDITORS_PICK_SLUGS.includes(t.slug) ? "Editor's Pick" : null }))
    .sort((a, b) => (b.badge ? 1 : 0) - (a.badge ? 1 : 0) || b.aggregatedRating - a.aggregatedRating)
    .slice(0, 8);
  const latestPosts = [...posts].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 3);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tripreviewall — Honest Hawaii Tour Reviews</title>
<meta name="description" content="We aggregate real Hawaii tour reviews from TripAdvisor, GetYourGuide and verified bookings — then show you the full picture, 5-star and 1-star alike.">
<link rel="canonical" href="${SITE_URL}/index.html">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Tripreviewall">
<meta property="og:title" content="Tripreviewall — Honest Hawaii Tour Reviews">
<meta property="og:description" content="We aggregate real Hawaii tour reviews — then show you the full picture, 5-star and 1-star alike.">
<meta property="og:url" content="${SITE_URL}/index.html">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Tripreviewall — Honest Hawaii Tour Reviews">
<meta name="twitter:description" content="We aggregate real Hawaii tour reviews — then show you the full picture, 5-star and 1-star alike.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/tokens.css">
<link rel="stylesheet" href="css/style.css">
</head>
<body>

<a href="#main" class="skip-link">Skip to content</a>

<header class="site-header">
  <div class="container header-inner">
    <a href="index.html" class="logo" aria-label="Tripreviewall home">
      <span class="part-1">Tripreview</span><span class="part-2">all</span>
    </a>
    <nav class="main-nav" aria-label="Primary">
      <a href="tours.html">Tours</a>
      <a href="destinations.html">Destinations</a>
      <a href="blog.html">Blog</a>
      <a href="about.html">About</a>
      <a href="contact.html">Contact</a>
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
      <a href="tours.html" class="mobile-nav-link">Tours</a>
      <a href="destinations.html" class="mobile-nav-link">Destinations</a>
      <a href="blog.html" class="mobile-nav-link">Blog</a>
      <a href="about.html" class="mobile-nav-link">About</a>
      <a href="contact.html" class="mobile-nav-link">Contact</a>
    </nav>
    <a href="tours.html" class="btn btn-secondary btn-full" style="margin-top:16px;">Browse Tours</a>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--color-border);font-size:14px;color:var(--color-text-muted);">
      <div><a href="tel:+18082261884" style="color:inherit;">+1 (808) 226-1884</a></div>
      <div style="margin-top:4px;">Mon–Fri 8:30–20:00 · Sat–Sun 9:30–21:30 (HST)</div>
    </div>
  </div>
</div>

<main id="main">

  <section class="hero">
    <div class="hero-bg" style="background-color:#0B3B4F; background-image:linear-gradient(160deg,#0B3B4F 0%,#134a61 60%,#0B3B4F 100%);"></div>
    <div class="container hero-content">
      <p class="hero-eyebrow">Honest Hawaii Tour Reviews</p>
      <h1 class="hero-headline">Hawaii tours, reviewed honestly — 5-star and 1-star alike.</h1>
      <p class="hero-subhead">We aggregate real reviews from TripAdvisor, GetYourGuide and verified bookings — then show you the full picture, not just the highlights.</p>

      <form class="search-bar" role="search" aria-label="Search tours">
        <label class="search-field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          <select aria-label="Island">
            <option>All Islands</option><option>Oahu</option><option>Maui</option><option>Kauai</option><option>Big Island</option>
          </select>
        </label>
        <label class="search-field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"></path></svg>
          <select aria-label="Tour type">
            <option>All Types</option><option>Snorkel</option><option>Luau</option><option>Hiking</option><option>Boat Tour</option><option>Helicopter</option>
          </select>
        </label>
        <label class="search-field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <input type="text" placeholder="Any date" aria-label="Date" onfocus="this.type='date'">
        </label>
        <button type="submit" class="btn btn-primary search-submit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          Search Tours
        </button>
      </form>
      <p class="hero-quicklinks">Popular: <a href="tours.html?q=Snorkel">Snorkel tours</a> · <a href="tours.html?q=Luau">Maui luau</a> · <a href="tours.html?q=Helicopter">Kauai helicopter</a></p>
    </div>
  </section>

  <section class="proof-strip">
    <div class="container proof-grid">
      <div class="proof-item">
        <div class="proof-number tabular">${tours.length}</div>
        <div class="proof-desc">Hawaii tours tracked</div>
        <div class="proof-caption">Oahu, Maui, Kauai &amp; Big Island · list updated continuously</div>
      </div>
      <div class="proof-item">
        <div class="proof-number tabular">4</div>
        <div class="proof-desc">platforms cross-checked per tour</div>
        <div class="proof-caption">TripAdvisor, GetYourGuide, FareHarbor &amp; Google Maps</div>
      </div>
      <div class="proof-item">
        <div class="proof-desc" style="font-size:var(--text-body-lg);font-weight:600;margin-bottom:0;">We publish every rating we collect — 1★ through 5★, no exceptions.</div>
        <div class="proof-caption" style="margin-top:8px;">This is the whole point of the site.</div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section-header-row">
        <div>
          <h2 class="section-title">Editor's Picks</h2>
          <p class="section-subtext">Ranked by aggregated rating across all platforms we track.</p>
        </div>
      </div>
      <div class="tab-row">
        <button class="tab-btn active" data-tab="top-rated">Top Rated</button>
        <button class="tab-btn" data-tab="most-reviewed">Most Reviewed</button>
      </div>
      <div class="tour-grid" id="tour-grid">${featured.map((t) => tourCardHtml(t, "", "")).join("")}</div>
      <div class="view-all-wrap"><a href="tours.html" class="btn btn-secondary">View All Tours</a></div>
    </div>
  </section>

  <section class="section" style="background:var(--color-bg-alt); border-top:1px solid var(--color-border); border-bottom:1px solid var(--color-border);">
    <div class="container">
      <div class="section-header" style="text-align:center;"><h2 class="section-title">How We Work</h2></div>
      <div class="how-grid centered">
        <div>
          <div class="how-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg></div>
          <h3 class="how-item-title">We aggregate ratings from every major platform</h3>
          <p class="how-item-desc">We pull scores from TripAdvisor, GetYourGuide and FareHarbor into one honest number — so you're not stuck checking three tabs.</p>
        </div>
        <div>
          <div class="how-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-4"></path><path d="M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4Z"></path></svg></div>
          <h3 class="how-item-title">We collect verified, booking-confirmed reviews</h3>
          <p class="how-item-desc">Reviews tagged "Verified Booking" come from travelers we've confirmed actually took the tour — not just anyone who visited the page.</p>
        </div>
        <div>
          <div class="how-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"></path><circle cx="12" cy="12" r="3"></circle></svg></div>
          <h3 class="how-item-title">We don't delete bad reviews — only rule-breaking content</h3>
          <p class="how-item-desc">1-star reviews stay up next to 5-star ones. We only remove reviews that violate our content policy — never ones we simply disagree with.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section-header"><h2 class="section-title">Explore by Island</h2></div>
      <div class="dest-grid">
        ${ISLAND_META.map((isl) => `
        <a class="dest-card" href="destinations/${isl.slug}.html" style="background-image:${isl.gradient}">
          <div class="dest-card-content"><h3 class="dest-card-name">${isl.name}</h3>
          <div class="dest-card-count">${islandCounts[isl.name] || 0} tours tracked</div></div>
        </a>`).join("")}
      </div>
    </div>
  </section>

  <section class="section" style="padding-bottom:96px;">
    <div class="container">
      <div class="section-header-row"><h2 class="section-title" style="margin-bottom:0;">From the Editors</h2></div>
      <div class="blog-grid" id="home-blog-grid">${latestPosts.length ? latestPosts.map(blogCardHtml).join("") : `<p style="color:var(--color-text-muted);">New articles are on their way.</p>`}</div>
      <div class="read-all-wrap"><a href="blog.html" class="btn btn-tertiary">Read All Articles →</a></div>
    </div>
  </section>

</main>

<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div>
        <span class="logo reversed"><span class="part-1">Tripreview</span><span class="part-2">all</span></span>
        <p class="footer-tagline">Independent Hawaii tour reviews — five-star and one-star alike.</p>
      </div>
      <div class="footer-col"><h4>Explore</h4><a href="tours.html">Tours</a><a href="destinations.html">Destinations</a><a href="blog.html">Blog</a><a href="transportation.html">Transportation</a></div>
      <div class="footer-col"><h4>Company</h4><a href="about.html">About</a><a href="contact.html">Contact</a><a href="affiliate-disclosure.html">Affiliate Disclosure</a><a href="privacy-policy.html">Privacy Policy</a></div>
      <div class="footer-col"><h4>Contact Us</h4>
        <div class="footer-contact-row"><a href="tel:+18082261884">+1 (808) 226-1884</a></div>
        <div class="footer-contact-row"><a href="mailto:contact@tripreviewall.com">contact@tripreviewall.com</a></div>
      </div>
    </div>
    <div class="footer-disclosure">Tripreviewall earns a commission when you book through links on this site (FareHarbor, TripAdvisor, GetYourGuide). This never affects which reviews we show or how we rate a tour.</div>
    <div class="footer-bottom"><span>© 2026 Tripreviewall, operated by Popotours. All rights reserved.</span></div>
  </div>
</footer>

<script src="js/data-loader.js"></script>
<script src="js/main.js"></script>
</body>
</html>`;
}

module.exports = { renderHomeHtml };
