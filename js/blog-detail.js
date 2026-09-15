/* ============================================================
   tripreviewall.com — Blog Detail page behavior
   Populates the inline Tour Card + sticky sidebar CTA from a
   real tour in ALL_TOURS (single source of truth), and renders
   Related Articles from BLOG_POSTS.
   ============================================================ */

const FEATURED_TOUR_SLUG = "unique-maui-tours-road-to-hana";
const CURRENT_ARTICLE_SLUG = "road-to-hana-self-drive-vs-guided";

document.addEventListener("DOMContentLoaded", async () => {
  window.ALL_TOURS = await loadAllTours();
  const tour = ALL_TOURS.find((t) => t.slug === FEATURED_TOUR_SLUG);
  if (tour) {
    renderInlineTourCard(tour);
    renderSidebarCard(tour);
    const link = document.getElementById("internal-tour-link");
    if (link) link.href = `../tours/tour-detail.html?slug=${tour.slug}`;
  }
  if (typeof BLOG_POSTS !== "undefined") renderRelatedArticles();
});

function renderInlineTourCard(tour) {
  const el = document.getElementById("inline-tour-embed");
  if (!el) return;
  el.innerHTML = `
    <div class="inline-tour-card">
      <div class="inline-tour-img" style="background:linear-gradient(135deg,#5C8A72,#0B3B4F);"></div>
      <div style="flex:1;">
        <div class="inline-tour-eyebrow">Featured Tour</div>
        <h3 class="inline-tour-title">${tour.title}</h3>
        <div class="inline-tour-rating">${tour.aggregatedRating.toFixed(1)}★ · ${tour.reviewCountTotal.toLocaleString()} reviews</div>
        <div class="inline-tour-diff">${tour.company} — ${tour.duration}, ${tour.tourType.toLowerCase()}.</div>
        <div class="inline-tour-footer">
          <span class="inline-tour-price">From $${tour.priceFrom}</span>
          <a href="../tours/tour-detail.html?slug=${tour.slug}" class="btn btn-primary">Check Availability</a>
        </div>
        <p class="inline-tour-disclosure">This is an affiliate link. If you book, Tripreviewall may earn a commission at no extra cost to you.</p>
      </div>
    </div>`;
}

function renderSidebarCard(tour) {
  const el = document.getElementById("sidebar-tour-card");
  if (!el) return;
  el.innerHTML = `
    <div class="sidebar-affiliate-label">Featured Tour</div>
    <div class="sidebar-affiliate-img" style="background:linear-gradient(135deg,#5C8A72,#0B3B4F);"></div>
    <h4 class="sidebar-affiliate-title">${tour.title}</h4>
    <div style="font-size:var(--text-meta);">${tour.aggregatedRating.toFixed(1)}★ (${tour.reviewCountTotal.toLocaleString()})</div>
    <ul class="sidebar-affiliate-bullets">
      <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>${tour.duration}</li>
      <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>${tour.tourType}</li>
      <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>${tour.island}</li>
    </ul>
    <div class="sidebar-affiliate-price">From $${tour.priceFrom}/person</div>
    <a href="../tours/tour-detail.html?slug=${tour.slug}" class="btn btn-primary btn-full">Check Availability</a>
    <p class="inline-tour-disclosure">Tripreviewall may earn a commission if you book through this link, at no extra cost to you.</p>`;
}

function renderRelatedArticles() {
  const el = document.getElementById("related-articles");
  if (!el) return;
  const list = BLOG_POSTS.filter((p) => p.slug !== CURRENT_ARTICLE_SLUG).slice(0, 3);
  el.innerHTML = list.map((p) => `
    <a href="${p.hasDetailPage ? p.slug + '.html' : '#'}" class="blog-card">
      <div class="blog-card-image" style="background:linear-gradient(135deg,#0B3B4F,#5C8A72);"></div>
      <div class="blog-card-body">
        <div class="blog-card-cat">${p.category}</div>
        <h3 class="blog-card-title">${p.title}</h3>
        <div class="blog-card-meta">${p.updatedAt} · ${p.readTime} min read</div>
      </div>
    </a>`).join("");
}
