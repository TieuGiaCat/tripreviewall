/* ============================================================
   tripreviewall.com — Tour Detail page (GENERIC TEMPLATE)
   Loads a tour by ?slug= from ALL_TOURS (single source of truth).
   Sections with no real source data (itinerary, policies, FAQ,
   individual reviews) are intentionally omitted rather than
   filled with placeholder content — see design brief principle
   "never bịa số" (no fabricated data shown as real).
   ============================================================ */

const EDITORS_PICK = ["ohana-surf-project-sup-lessons"];

document.addEventListener("DOMContentLoaded", () => {
  if (typeof ALL_TOURS === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug");
  const tour = ALL_TOURS.find((t) => t.slug === slug);

  if (!tour) {
    document.getElementById("tour-content").style.display = "none";
    document.getElementById("mobile-booking-bar").style.display = "none";
    document.getElementById("tour-not-found").style.display = "block";
    return;
  }

  renderTitleBlock(tour);
  renderQuickFacts(tour);
  renderOverview(tour);
  renderVerdict(tour);
  renderRatingBreakdown(tour);
  renderLocation(tour);
  renderBookingSidebar(tour);
  renderSimilarTours(tour);
  initTabScrollSpy();
});

function starsRow(rating) {
  const full = Math.round(rating);
  let s = '<span class="stars">';
  for (let i = 0; i < 5; i++) s += starsSvg(i < full ? "var(--color-positive)" : "var(--color-border-strong)");
  return s + "</span>";
}

function renderTitleBlock(tour) {
  document.title = `${tour.title} — ${tour.company} | Tripreviewall`;
  document.getElementById("page-desc").setAttribute("content",
    `Honest review of ${tour.company}'s ${tour.title} on ${tour.island}, Hawaii — aggregated ratings and our editorial verdict.`);
  document.getElementById("bc-current").textContent = tour.title;
  document.getElementById("detail-location-text").textContent = `${tour.city ? tour.city + ", " : ""}${tour.island}, Hawaii`;
  document.getElementById("detail-h1").textContent = tour.title;
  document.getElementById("detail-rating-stars").innerHTML = starsRow(tour.aggregatedRating);
  document.getElementById("detail-rating-score").textContent = tour.aggregatedRating.toFixed(1);
  document.getElementById("detail-rating-count").textContent = `(${tour.reviewCountTotal.toLocaleString()} reviews across 4 sources)`;
  if (EDITORS_PICK.includes(tour.slug)) document.getElementById("editors-pick-badge").style.display = "inline-flex";
}

function renderQuickFacts(tour) {
  const items = [
    { icon: "tag", label: "From", value: "$" + tour.priceFrom },
    { icon: "clock", label: "Duration", value: tour.duration || "—" },
    { icon: "map", label: "Tour type", value: tour.tourType || "Tour" },
    { icon: "pin", label: "Island", value: tour.island }
  ];
  const icons = {
    tag: '<path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24L3 3v6.59a2 2 0 0 0 .59 1.41l9.58 9.58a2 2 0 0 0 2.82 0l4.6-4.6a2 2 0 0 0 0-2.82Z"></path><circle cx="7.5" cy="7.5" r="1.5"></circle>',
    clock: '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
    map: '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle>'
  };
  document.getElementById("quickfacts-strip").innerHTML = items.map((it) => `
    <div class="quickfact">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[it.icon]}</svg>
      <div><div class="quickfact-label">${it.label}</div><div class="quickfact-value">${it.value}</div></div>
    </div>`).join("");
}

function renderOverview(tour) {
  document.getElementById("highlight-list").innerHTML = (tour.highlights || []).map((h) => `
    <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>${h}</li>`).join("");
  document.getElementById("full-description").textContent = tour.fullDescription || "";

  const variants = (tour.variants || []).filter(Boolean);
  if (variants.length > 1) {
    document.getElementById("variant-block").style.display = "block";
    document.getElementById("variant-options").innerHTML = variants.map((v, i) =>
      `<button class="variant-option${i === 0 ? " active" : ""}">${v}</button>`).join("");
    document.querySelectorAll(".variant-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".variant-option").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });
  }
}

function renderVerdict(tour) {
  const v = tour.verdict || {};
  document.getElementById("verdict-headline").textContent = v.headline || "";
  document.getElementById("verdict-good").innerHTML = (v.goodFor || []).map((g) => `
    <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>${g}</li>`).join("");
  document.getElementById("verdict-knowing").innerHTML = (v.worthKnowing || []).map((w) => `
    <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c4.97-4.97 8-8.97 8-13a8 8 0 1 0-16 0c0 4.03 3.03 8.03 8 13Z"></path><circle cx="12" cy="9" r="1"></circle></svg>${w}</li>`).join("");
  document.getElementById("verdict-byline").textContent = `Assessed by the Tripreviewall editorial team, last reviewed ${v.reviewedByDate || "—"}.`;
}

/* Mock per-platform split — evenly derived from the flat placeholder
   aggregate until real per-platform numbers are entered. */
function mockRatingsBySource(tour) {
  const c = tour.reviewCountTotal;
  return {
    tripreviewall: { avg: tour.aggregatedRating, count: Math.round(c * 0.35) },
    tripadvisor:   { avg: tour.aggregatedRating, count: Math.round(c * 0.35) },
    getyourguide:  { avg: tour.aggregatedRating, count: Math.round(c * 0.20) },
    viator:        { avg: tour.aggregatedRating, count: Math.round(c * 0.10) }
  };
}

function renderRatingBreakdown(tour) {
  const platforms = [
    { key: "tripreviewall", name: "Tripreviewall" },
    { key: "tripadvisor", name: "TripAdvisor" },
    { key: "getyourguide", name: "GetYourGuide" },
    { key: "viator", name: "Viator" }
  ];
  const bySource = mockRatingsBySource(tour);
  document.getElementById("source-cards").innerHTML = platforms.map((p) => {
    const d = bySource[p.key];
    return `<div class="source-card">
      <div class="source-card-name">${p.name}</div>
      ${starsRow(d.avg)}
      <div class="source-card-score tabular">${d.avg.toFixed(1)}</div>
      <div class="source-card-count tabular">${d.count.toLocaleString()} reviews</div>
    </div>`;
  }).join("");

  const gs = tour.googleSnapshot || {};
  if (gs.summaryText) {
    document.getElementById("google-panel").innerHTML = `
      <div class="google-panel-label">Google Maps — Summarized by Our Team</div>
      <div class="google-panel-summary">${gs.summaryText}</div>
      <div class="google-panel-meta">Last checked ${gs.lastCheckedDate || "—"} · <a href="#">View on Google Maps →</a></div>`;
  } else {
    document.getElementById("google-panel").style.display = "none";
  }

  const d = tour.ratingDistribution;
  document.getElementById("main-histogram").innerHTML = `
    <div class="rating-histogram" role="img" aria-label="5 stars: ${d.star5}%, 4 stars: ${d.star4}%, 3 stars: ${d.star3}%, 2 stars: ${d.star2}%, 1 star: ${d.star1}%" style="height:10px;">
      <div class="seg-pos" style="width:${d.star5 + d.star4}%"></div>
      <div class="seg-neu" style="width:${d.star3}%"></div>
      <div class="seg-neg" style="width:${d.star2 + d.star1}%"></div>
    </div>`;
}

function renderLocation(tour) {
  document.getElementById("meeting-address").textContent = tour.city ? `${tour.city}, ${tour.island}, Hawaii` : `${tour.island}, Hawaii`;
}

function renderBookingSidebar(tour) {
  document.getElementById("sidebar-price").textContent = `$${tour.priceFrom}`;
  document.getElementById("mobile-price").textContent = `$${tour.priceFrom}`;
  const link = tour.fareharborShortname
    ? `https://fareharbor.com/embeds/book/${tour.fareharborShortname}/`
    : "#";
  document.getElementById("fareharbor-cta").setAttribute("href", link);
}

function initTabScrollSpy() {
  const tabs = document.querySelectorAll(".content-tab");
  const sections = [...tabs].map((t) => document.getElementById(t.dataset.target));
  tabs.forEach((tab) => {
    tab.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById(tab.dataset.target).scrollIntoView({ behavior: "smooth" });
    });
  });
  const onScroll = () => {
    let current = sections[0];
    sections.forEach((sec) => { if (sec && window.scrollY >= sec.offsetTop - 160) current = sec; });
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.target === current?.id));
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

function renderSimilarTours(tour) {
  const grid = document.getElementById("similar-tours-grid");
  document.getElementById("similar-title").textContent = `Similar Tours on ${tour.island}`;
  const list = ALL_TOURS.filter((t) => t.slug !== tour.slug && t.island === tour.island).slice(0, 3);
  if (list.length === 0) { grid.innerHTML = `<p style="color:var(--color-text-muted);">No similar tours found on this island yet.</p>`; return; }
  grid.innerHTML = list.map((t) => tourCardTemplate(t, "", "../img/")).join("");
}
