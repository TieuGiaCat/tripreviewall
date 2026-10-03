/* ============================================================
   tripreviewall.com — All Blog page logic
   Every article card, the category tabs and the island filter are
   rendered by the server. This script only filters/reveals the cards
   that are already on the page — no fetch, no re-render, so there is
   no flash or layout shift after load.
   ============================================================ */

const BLOG_PAGE_STEP = 6;
let blogState = { layer1: "All", island: "All", visibleCount: BLOG_PAGE_STEP };

document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("blog-grid");
  if (!grid) return;

  document.querySelectorAll(".layer1-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      blogState.layer1 = btn.dataset.cat;
      blogState.visibleCount = BLOG_PAGE_STEP;
      document.querySelectorAll(".layer1-tab").forEach((b) => b.classList.toggle("active", b === btn));
      applyBlogFilters();
    });
  });
  document.getElementById("island-select")?.addEventListener("change", (e) => {
    blogState.island = e.target.value;
    blogState.visibleCount = BLOG_PAGE_STEP;
    applyBlogFilters();
  });
  document.getElementById("load-more-btn")?.addEventListener("click", () => {
    blogState.visibleCount += BLOG_PAGE_STEP;
    applyBlogFilters();
  });
});

function applyBlogFilters() {
  const cards = Array.from(document.querySelectorAll("#blog-grid .blog-card"));
  const matching = cards.filter((c) =>
    (blogState.layer1 === "All" || c.dataset.category === blogState.layer1) &&
    (blogState.island === "All" || c.dataset.island === blogState.island)
  );
  cards.forEach((c) => { c.hidden = true; });
  matching.slice(0, blogState.visibleCount).forEach((c) => { c.hidden = false; });

  const empty = document.getElementById("blog-empty");
  const more = document.getElementById("load-more-btn");
  if (empty) empty.style.display = matching.length ? "none" : "block";
  if (more) more.style.display = matching.length > blogState.visibleCount ? "inline-flex" : "none";
}
