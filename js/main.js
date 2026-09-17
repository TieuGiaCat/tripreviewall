/* ============================================================
   tripreviewall.com — Home page behavior
   Vanilla JS, no build step required.
   Uses ALL_TOURS (data/tours-full.js) as single source of truth.
   ============================================================ */

document.addEventListener("DOMContentLoaded", async () => {
  initHeaderScroll();
  initMobileDrawer();
  initTourTabs();
  if (document.getElementById("tour-grid")) {
    window.ALL_TOURS = await loadAllTours();
    renderFeaturedTours("top-rated");
  }
  if (document.getElementById("home-blog-grid")) {
    window.BLOG_POSTS = await loadAllPosts();
    renderHomeBlogPreview();
  }
});

const HOME_CAT_GRADIENTS = {
  "Comparison": "linear-gradient(135deg,#5C8A72,#0B3B4F)",
  "Real Traveler Reviews & Data": "linear-gradient(135deg,#B85C4A,#0B3B4F)",
  "Tour Reviews by Type": "linear-gradient(135deg,#D97B4F,#0B3B4F)",
  "Island Guides": "linear-gradient(135deg,#0B3B4F,#5C8A72)",
  "Booking & Practical Info": "linear-gradient(135deg,#26313A,#B8592F)",
  "Planning & Comparisons": "linear-gradient(135deg,#5C8A72,#0B3B4F)"
};

function renderHomeBlogPreview() {
  const grid = document.getElementById("home-blog-grid");
  if (!grid || typeof BLOG_POSTS === "undefined") return;
  const latest = [...BLOG_POSTS].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 3);
  if (latest.length === 0) {
    grid.parentElement.style.display = "none"; // whole "From the Editors" section hides if there's truly nothing yet
    return;
  }
  grid.innerHTML = latest.map((p) => {
    const bg = p.featuredImage ? `url('${p.featuredImage}')` : (HOME_CAT_GRADIENTS[p.category] || "linear-gradient(135deg,#0B3B4F,#5C8A72)");
    return `
    <a href="/blog/${p.slug}" class="blog-card">
      <div class="blog-card-image" style="background:${bg}; background-size:cover; background-position:center;"></div>
      <div class="blog-card-body">
        <div class="blog-card-cat">${p.category || ""}</div>
        <h3 class="blog-card-title">${p.title}</h3>
        <div class="blog-card-meta">${new Date(p.updatedAt).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"})}${p.readTime ? " · " + p.readTime + " min read" : ""}</div>
      </div>
    </a>`;
  }).join("");
}

/* ---- Sticky header shrink-on-scroll ---- */
function initHeaderScroll() {
  const header = document.querySelector(".site-header");
  if (!header) return;
  const onScroll = () => {
    if (window.scrollY > 80) header.classList.add("scrolled");
    else header.classList.remove("scrolled");
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/* ---- Mobile drawer ---- */
function initMobileDrawer() {
  const openBtn = document.querySelector("[data-drawer-open]");
  const closeBtn = document.querySelector("[data-drawer-close]");
  const backdrop = document.querySelector("[data-drawer-backdrop]");
  const drawer = document.querySelector(".mobile-drawer");
  if (!openBtn || !drawer) return;
  const open = () => { drawer.classList.add("open"); openBtn.setAttribute("aria-expanded", "true"); };
  const close = () => { drawer.classList.remove("open"); openBtn.setAttribute("aria-expanded", "false"); };
  openBtn.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  backdrop?.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
}

/* ---- Featured Tours tabs ---- */
function initTourTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      renderFeaturedTours(tab.dataset.tab);
    });
  });
}

/* ---- Shared star rendering (used by Home, All Tours, Tour Detail) ---- */
function starsSvg(fillColor) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="${fillColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
}
function renderStars(rating) {
  const full = Math.round(rating);
  let html = '<span class="stars">';
  for (let i = 0; i < 5; i++) html += starsSvg(i < full ? "var(--color-positive)" : "var(--color-border-strong)");
  return html + "</span>";
}

/* ---- Shared Tour Card template ----
   basePath: "tours/" from site root (Home, All Tours) or "" from within /tours/ folder (Similar Tours) */
function tourCardTemplate(tour, basePath) {
  basePath = basePath === undefined ? "tours/" : basePath;
  const d = tour.ratingDistribution;
  const badge = tour.badge ? `<span class="tour-card-badge">${tour.badge}</span>` : "";
  const linkFile = `/tours/${tour.slug}`;
  const imgSrc = tour.gallery && tour.gallery[0] ? tour.gallery[0] : null;
  return `
    <article class="tour-card">
      <div class="tour-card-image-wrap" style="background:${imgSrc ? "var(--color-bg-alt, #eee)" : "linear-gradient(135deg,#0B3B4F,#5C8A72)"};">
        ${imgSrc ? `<img class="tour-photo" src="${imgSrc}" alt="${tour.title} — ${tour.company}"
             style="opacity:0;transition:opacity 0.35s ease;" onload="this.style.opacity='1';"
             onerror="this.parentElement.style.background='linear-gradient(135deg,#0B3B4F,#5C8A72)'; this.remove();">` : ""}
        ${badge}
      </div>
      <div class="tour-card-body">
        <div class="tour-card-eyebrow">${tour.island.toUpperCase()} · ${tour.tourType.toUpperCase()}</div>
        <h3 class="tour-card-title">${tour.title}</h3>
        <div class="tour-card-rating">
          ${renderStars(tour.aggregatedRating)}
          <span class="score tabular">${tour.aggregatedRating.toFixed(1)}</span>
          <span class="count tabular">(${tour.reviewCountTotal.toLocaleString()} reviews)</span>
        </div>
        <div class="rating-histogram" role="img"
             aria-label="5 stars: ${d.star5}%, 4 stars: ${d.star4}%, 3 stars: ${d.star3}%, 2 stars: ${d.star2}%, 1 star: ${d.star1}%">
          <div class="seg-pos" style="width:${d.star5 + d.star4}%"></div>
          <div class="seg-neu" style="width:${d.star3}%"></div>
          <div class="seg-neg" style="width:${d.star2 + d.star1}%"></div>
        </div>
        <div class="tour-card-divider"></div>
        <div class="tour-card-footer">
          <div class="tour-card-price">
            From <span class="tabular">$${tour.priceFrom}</span>
            <span class="via">via FareHarbor</span>
          </div>
          <a href="${linkFile}" class="btn btn-primary">View Tour</a>
        </div>
      </div>
    </article>`;
}

const EDITORS_PICK_SLUGS = ["ohana-surf-project-sup-lessons"];

function renderFeaturedTours(mode) {
  const grid = document.getElementById("tour-grid");
  if (!grid || typeof ALL_TOURS === "undefined") return;
  let list = ALL_TOURS.map((t) => ({ ...t, badge: EDITORS_PICK_SLUGS.includes(t.slug) ? "Editor's Pick" : null }));
  if (mode === "most-reviewed") list.sort((a, b) => b.reviewCountTotal - a.reviewCountTotal);
  else list.sort((a, b) => (b.badge ? 1 : 0) - (a.badge ? 1 : 0) || b.aggregatedRating - a.aggregatedRating);
  grid.innerHTML = list.slice(0, 8).map((t) => tourCardTemplate(t, "tours/")).join("");
}
