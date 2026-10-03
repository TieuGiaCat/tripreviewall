const { esc } = require("../utils");
const { headBoilerplate, scriptTags, siteHeader, siteFooter } = require("./layout");
const { tourCardHtml, imgUrl, coverImg } = require("./sharedHtml");
const { ISLANDS } = require("./islands");

const { SITE_URL, CATEGORY_GRADIENTS, DEFAULT_GRADIENT } = require("../siteConfig");

function blogCardHtml(p) {
  return `
    <a href="/blog/${esc(p.slug)}" class="blog-card">
      <div class="blog-card-image" style="background:${CATEGORY_GRADIENTS[p.category] || DEFAULT_GRADIENT};">${coverImg(p.featuredImage, { sizes: "(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw" })}</div>
      <div class="blog-card-body">
        <div class="blog-card-cat">${esc(p.category || "")}</div>
        <h3 class="blog-card-title">${esc(p.title)}</h3>
        <div class="blog-card-meta">${new Date(p.updatedAt).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric",timeZone:"UTC"})}${p.readTime ? " · " + p.readTime + " min read" : ""}</div>
      </div>
    </a>`;
}

function renderHomeHtml(tours, posts, islandCounts, destinationsBySlug = {}) {
  const featured = tours
    .slice()
    .sort((a, b) => (b.editorsPick ? 1 : 0) - (a.editorsPick ? 1 : 0) || (b.aggregatedRating || 0) - (a.aggregatedRating || 0))
    .slice(0, 8);
  const latestPosts = [...posts].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 3);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tripreviewall — Honest Hawaii Tour Reviews</title>
<meta name="description" content="We aggregate real Hawaii tour reviews from TripAdvisor, GetYourGuide and verified bookings — then show you the full picture, 5-star and 1-star alike.">
<link rel="canonical" href="${SITE_URL}/">
<link rel="alternate" type="application/rss+xml" title="Tripreviewall Blog RSS Feed" href="${SITE_URL}/rss.xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Tripreviewall">
<meta property="og:title" content="Tripreviewall — Honest Hawaii Tour Reviews">
<meta property="og:description" content="We aggregate real Hawaii tour reviews — then show you the full picture, 5-star and 1-star alike.">
<meta property="og:url" content="${SITE_URL}/">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Tripreviewall — Honest Hawaii Tour Reviews">
<meta name="twitter:description" content="We aggregate real Hawaii tour reviews — then show you the full picture, 5-star and 1-star alike.">
${headBoilerplate()}
</head>
<body>

${siteHeader()}

<main id="main">

  <section class="hero">
    <div class="hero-bg" style="background-color:#0B3B4F; background-image:linear-gradient(160deg,#0B3B4F 0%,#134a61 60%,#0B3B4F 100%);"></div>
    <div class="container hero-content">
      <p class="hero-eyebrow">Honest Hawaii Tour Reviews</p>
      <h1 class="hero-headline">Hawaii tours, reviewed honestly — 5-star and 1-star alike.</h1>
      <p class="hero-subhead">We aggregate real reviews from TripAdvisor, GetYourGuide and verified bookings — then show you the full picture, not just the highlights.</p>

      <form class="search-bar" role="search" aria-label="Search tours" action="/tours" method="get">
        <label class="search-field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          <select name="island" aria-label="Island">
            <option value="">All Islands</option><option value="Oahu">Oahu</option><option value="Maui">Maui</option><option value="Kauai">Kauai</option><option value="Big Island">Big Island</option>
          </select>
        </label>
        <label class="search-field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"></path></svg>
          <select name="type" aria-label="Tour type">
            <option value="">All Types</option><option value="Snorkel">Snorkel</option><option value="Luau">Luau</option><option value="Hiking">Hiking</option><option value="Boat Tour">Boat Tour</option><option value="Helicopter">Helicopter</option><option value="Zipline">Zipline</option><option value="Surf Lessons">Surf Lessons</option>
          </select>
        </label>
        <label class="search-field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="search" name="q" placeholder="Keyword, e.g. sunset" aria-label="Keyword">
        </label>
        <button type="submit" class="btn btn-primary search-submit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          Search Tours
        </button>
      </form>
      <script>
        // Drop empty fields so the results URL stays clean (/tours?island=Maui, not ?island=Maui&type=&q=).
        document.currentScript.previousElementSibling.addEventListener("submit", function () {
          Array.prototype.forEach.call(this.elements, function (el) { if (el.name && !el.value) el.disabled = true; });
        });
      </script>
      <p class="hero-quicklinks">Popular: <a href="/tours?type=Snorkel">Snorkel tours</a> · <a href="/tours?island=Maui&amp;type=Luau">Maui luau</a> · <a href="/tours?island=Kauai&amp;type=Helicopter">Kauai helicopter</a></p>
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
        <button type="button" class="tab-btn active" data-tab="top-rated" aria-pressed="true">Top Rated</button>
        <button type="button" class="tab-btn" data-tab="most-reviewed" aria-pressed="false">Most Reviewed</button>
      </div>
      <div class="tour-grid" id="tour-grid">${featured.map((t) => tourCardHtml(t, "", "")).join("")}</div>
      <div class="view-all-wrap"><a href="/tours" class="btn btn-secondary">View All Tours</a></div>
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
  </section>

  <section class="section" style="padding-bottom:96px;">
    <div class="container">
      <div class="section-header-row"><h2 class="section-title" style="margin-bottom:0;">From the Editors</h2></div>
      <div class="blog-grid" id="home-blog-grid">${latestPosts.length ? latestPosts.map(blogCardHtml).join("") : `<p style="color:var(--color-text-muted);">New articles are on their way.</p>`}</div>
      <div class="read-all-wrap"><a href="/blog" class="btn btn-tertiary">Read All Articles →</a></div>
    </div>
  </section>

</main>

${siteFooter()}

${scriptTags(["data-loader", "main"])}
</body>
</html>`;
}

module.exports = { renderHomeHtml };
