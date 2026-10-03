/* ============================================================
   tripreviewall.com — Tour Detail STATIC page hydration
   Used only on server-generated tours/<slug>.html pages, where all
   content is already in the HTML. This file adds interactivity only
   (gallery thumbnail switching, tab scroll-spy, variant selector) —
   it never fetches or renders data.
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  initGalleryThumbs();
  initTabScrollSpy();
});

function initGalleryThumbs() {
  const mainImg = document.getElementById("gallery-main-img");
  document.querySelectorAll(".gallery-thumb").forEach((thumb) => {
    thumb.addEventListener("click", () => {
      document.querySelectorAll(".gallery-thumb").forEach((t) => t.classList.remove("active"));
      thumb.classList.add("active");
      if (!mainImg) return;
      if (thumb.dataset.srcset) mainImg.srcset = thumb.dataset.srcset; else mainImg.removeAttribute("srcset");
      mainImg.src = thumb.dataset.src || thumb.dataset.url;
    });
  });
}

/* Tabs are handled by switchDetailTab() inline in the page (show one panel,
   no page jump). The old scroll-spy was removed: with hidden panels it
   scrolled panels under the sticky header and highlighted the wrong tab. */
function initTabScrollSpy() {
  // Keyboard support for the tab strip (WAI-ARIA tabs pattern): ← → Home End.
  const tabs = Array.from(document.querySelectorAll('.content-tab[role="tab"]'));
  tabs.forEach((tab, i) => {
    tab.addEventListener("keydown", (e) => {
      let next = null;
      if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
      else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === "Home") next = tabs[0];
      else if (e.key === "End") next = tabs[tabs.length - 1];
      if (!next) return;
      e.preventDefault();
      next.focus();
      if (typeof switchDetailTab === "function") switchDetailTab(next.dataset.target, next);
    });
  });
}
