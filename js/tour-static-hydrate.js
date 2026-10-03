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
  initVariantSelector();
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
function initTabScrollSpy() {}

function initVariantSelector() {
  document.querySelectorAll(".variant-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".variant-option").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}
