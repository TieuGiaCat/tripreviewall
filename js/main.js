/* ============================================================
   tripreviewall.com — shared site behavior (every page)
   Header shrink, mobile drawer, home "Top Rated / Most Reviewed" tabs and
   the client-side tour card used when lists are re-sorted in the browser.
   Pages arrive fully rendered by the server; nothing is fetched on load.
   ============================================================ */

/* ---- Behaviour that used to be inline onclick/onload/onerror (E9) ---- */
// Google Fonts stylesheet loads as media="print" (non-blocking), then switches on.
document.querySelectorAll("link[data-async-css]").forEach((l) => { l.media = "all"; });

// A tour photo that fails to load is replaced by the brand gradient.
function tourPhotoFallback(img) {
  if (img.parentElement) img.parentElement.style.background = "linear-gradient(135deg,#0B3B4F,#5C8A72)";
  img.remove();
}
document.addEventListener("error", (e) => {
  const t = e.target;
  if (t && t.tagName === "IMG" && t.classList.contains("tour-photo") && t.closest(".tour-card")) tourPhotoFallback(t);
}, true); // "error" doesn't bubble — listen in the capture phase

document.addEventListener("DOMContentLoaded", () => {
  initHeaderScroll();
  initMobileDrawer();
  initTourTabs();
  // Images that already failed before this script ran.
  document.querySelectorAll(".tour-card img.tour-photo").forEach((img) => {
    if (img.complete && img.naturalWidth === 0 && img.currentSrc) tourPhotoFallback(img);
  });
});

// Search forms: drop empty fields so the URL stays clean (/tours?island=Maui, not ?island=Maui&type=&q=).
document.addEventListener("submit", (e) => {
  const form = e.target;
  if (!form.matches || !form.matches("form[data-strip-empty]")) return;
  Array.prototype.forEach.call(form.elements, (el) => { if (el.name && !el.value) el.disabled = true; });
  // Re-enable after navigation starts, so the Back button shows the form intact.
  setTimeout(() => Array.prototype.forEach.call(form.elements, (el) => { el.disabled = false; }), 0);
});

// "Clear search" buttons: <button data-clear-search="input-id">.
document.addEventListener("click", (e) => {
  const btn = e.target.closest && e.target.closest("[data-clear-search]");
  if (!btn) return;
  const input = document.getElementById(btn.getAttribute("data-clear-search"));
  if (!input) return;
  input.value = "";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus();
});

/* Same rule as the server-side imgUrl(): local uploads can be fetched resized. */
function resizedImg(url, w) {
  if (!url || !/\/uploads\//.test(url) || /\.svg$/i.test(url) || url.indexOf("?") !== -1) return url;
  return url + "?w=" + w;
}

function escHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
  const panel = drawer.querySelector(".mobile-drawer-panel");
  const focusables = () => Array.from(panel.querySelectorAll("a[href], button:not([disabled])"));
  const open = () => {
    drawer.classList.add("open"); openBtn.setAttribute("aria-expanded", "true");
    (closeBtn || focusables()[0])?.focus();
  };
  const close = () => {
    if (!drawer.classList.contains("open")) return;
    drawer.classList.remove("open"); openBtn.setAttribute("aria-expanded", "false");
    openBtn.focus();
  };
  openBtn.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  backdrop?.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (!drawer.classList.contains("open")) return;
    if (e.key === "Escape") { close(); return; }
    if (e.key === "Tab") { // keep keyboard focus inside the open menu
      const items = focusables();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
}

/* ---- Featured Tours tabs ---- */
function initTourTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach((tab) => {
    tab.addEventListener("click", async () => {
      tabs.forEach((t) => { t.classList.remove("active"); t.setAttribute("aria-pressed", "false"); });
      tab.classList.add("active");
      tab.setAttribute("aria-pressed", "true");
      if ((typeof ALL_TOURS === "undefined" || !ALL_TOURS.length) && typeof loadAllTours === "function") {
        window.ALL_TOURS = await loadAllTours();
      }
      if (ALL_TOURS.length) renderFeaturedTours(tab.dataset.tab); // API down → keep the server-rendered grid

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
  for (let i = 0; i < 5; i++) html += starsSvg(i < full ? "var(--color-positive)" : "var(--color-star-empty)");
  return html + "</span>";
}

/* ---- Shared Tour Card template ----
   MUST stay identical to tourCardHtml() in admin/src/ssr/sharedHtml.js —
   it's used when a list is re-sorted/filtered in the browser, and the cards
   shouldn't change look when that happens. */
function tourCardTemplate(tour) {
  const img = tour.gallery && tour.gallery[0] ? tour.gallery[0] : null;
  const bl = tour.bookingLinks || {};
  const hasFareharbor = !!tour.fareharborRegularLink && !(bl.fareharbor && bl.fareharbor.show === false);
  const price = tour.priceFrom != null ? `From <span class="tabular">$${escHtml(tour.priceFrom)}</span>` : `<span class="tabular">Price on request</span>`;
  const resized = img ? resizedImg(img, 400) : null;
  return `
    <article class="tour-card">
      <a class="tour-card-image-wrap" href="/tours/${encodeURIComponent(tour.slug)}" tabindex="-1" aria-hidden="true" style="background:${img ? "var(--color-bg-alt, #eee)" : "linear-gradient(135deg,#0B3B4F,#5C8A72)"};">
        ${tour.editorsPick ? `<span class="tour-card-badge">Editor's Pick</span>` : ""}
        ${img ? `<img class="tour-photo" src="${escHtml(resized)}"${resized !== img ? ` srcset="${escHtml(resizedImg(img, 400))} 400w, ${escHtml(resizedImg(img, 800))} 800w" sizes="(min-width: 1024px) 300px, (min-width: 640px) 50vw, 100vw"` : ""} width="400" height="300" loading="lazy" decoding="async" alt="${escHtml(tour.title)} — ${escHtml(tour.company)}">` : ""}
      </a>
      <div class="tour-card-body">
        <div class="tour-card-eyebrow">${escHtml((tour.island || "").toUpperCase())} · ${escHtml((tour.tourType || "").toUpperCase())}</div>
        <h3 class="tour-card-title"><a href="/tours/${encodeURIComponent(tour.slug)}">${escHtml(tour.title)}</a></h3>
        <div class="tour-card-rating">
          ${renderStars(tour.aggregatedRating || 0)}
          <span class="score tabular">${(tour.aggregatedRating || 0).toFixed(1)}</span>
          <span class="count tabular">(${(tour.reviewCountTotal || 0).toLocaleString()} reviews)</span>
        </div>
        <div class="tour-card-divider"></div>
        <div class="tour-card-footer">
          <div class="tour-card-price">${price}${hasFareharbor ? `<span class="via">via FareHarbor</span>` : ""}</div>
          <a href="/tours/${encodeURIComponent(tour.slug)}" class="btn btn-primary">View Tour</a>
        </div>
      </div>
    </article>`;
}

function renderFeaturedTours(mode) {
  const grid = document.getElementById("tour-grid");
  if (!grid || typeof ALL_TOURS === "undefined") return;
  const list = ALL_TOURS.slice();
  if (mode === "most-reviewed") list.sort((a, b) => (b.reviewCountTotal || 0) - (a.reviewCountTotal || 0));
  else list.sort((a, b) => (b.editorsPick ? 1 : 0) - (a.editorsPick ? 1 : 0) || (b.aggregatedRating || 0) - (a.aggregatedRating || 0));
  grid.innerHTML = list.slice(0, 8).map((t) => tourCardTemplate(t)).join("");
}
