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
  const main = document.getElementById("gallery-main");
  document.querySelectorAll(".gallery-thumb").forEach((thumb) => {
    thumb.addEventListener("click", () => {
      document.querySelectorAll(".gallery-thumb").forEach((t) => t.classList.remove("active"));
      thumb.classList.add("active");
      main.style.backgroundImage = `url('${thumb.dataset.url}')`;
    });
  });
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

function initVariantSelector() {
  document.querySelectorAll(".variant-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".variant-option").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}
