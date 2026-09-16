/* ============================================================
   tripreviewall.com — All Blog page logic
   Loads posts live from /api/posts (falls back to the bundled
   snapshot if the API is unreachable — see js/data-loader.js).
   ============================================================ */

const LAYER1_CATEGORIES = ["All", "Island Guides", "Tour Reviews by Type", "Planning & Comparisons", "Booking & Practical Info", "Real Traveler Reviews & Data"];
let blogState = { layer1: "All", island: "All", visibleCount: 6 };

document.addEventListener("DOMContentLoaded", async () => {
  window.BLOG_POSTS = await loadAllPosts();
  renderPillarStrip();
  renderLayer1Tabs();
  initLayer2();
  renderArticleGrid();
  document.getElementById("load-more-btn")?.addEventListener("click", () => {
    blogState.visibleCount += 6;
    renderArticleGrid();
  });
});

function renderPillarStrip() {
  // No CMS-curated pillar flag exists in the DB schema yet (see
  // tripreviewall-all-blog-brief.md §3.2) — hide the strip entirely
  // rather than show something that isn't real, per the fallback
  // rule in that brief ("if zero results, hide the whole band").
  const band = document.getElementById("pillar-band");
  if (band) band.style.display = "none";
}

function renderLayer1Tabs() {
  document.getElementById("layer1-tabs").innerHTML = LAYER1_CATEGORIES.map((c) =>
    `<button class="layer1-tab${c === blogState.layer1 ? " active" : ""}" data-cat="${c}">${c}</button>`).join("");
  document.querySelectorAll(".layer1-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      blogState.layer1 = btn.dataset.cat; blogState.visibleCount = 6;
      renderLayer1Tabs(); renderArticleGrid();
    });
  });
}

function initLayer2() {
  const islands = ["All", ...new Set(BLOG_POSTS.map((p) => p.island).filter(Boolean))];
  document.getElementById("island-select").innerHTML = islands.map((i) => `<option value="${i}">${i === "All" ? "Island: All" : i}</option>`).join("");
  document.getElementById("island-select").addEventListener("change", (e) => {
    blogState.island = e.target.value; blogState.visibleCount = 6; renderArticleGrid();
  });
}

const CAT_GRADIENTS = {
  "Comparison": "linear-gradient(135deg,#5C8A72,#0B3B4F)",
  "Real Traveler Reviews & Data": "linear-gradient(135deg,#B85C4A,#0B3B4F)",
  "Tour Reviews by Type": "linear-gradient(135deg,#D97B4F,#0B3B4F)",
  "Island Guides": "linear-gradient(135deg,#0B3B4F,#5C8A72)",
  "Booking & Practical Info": "linear-gradient(135deg,#26313A,#B8592F)",
  "Planning & Comparisons": "linear-gradient(135deg,#5C8A72,#0B3B4F)"
};

function fmtDate(d) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date)) return String(d).slice(0, 10);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function articleCard(p) {
  const grad = p.featuredImage ? null : (CAT_GRADIENTS[p.category] || "linear-gradient(135deg,#0B3B4F,#5C8A72)");
  const bg = p.featuredImage ? `url('${p.featuredImage}')` : grad;
  return `
    <a href="blog/post-detail.html?slug=${encodeURIComponent(p.slug)}" class="blog-card">
      <div class="blog-card-image" style="background:${bg}; background-size:cover; background-position:center;"></div>
      <div class="blog-card-body">
        <div class="blog-card-tags">
          ${p.category ? `<span class="blog-card-cat" style="margin-bottom:0;">${p.category}</span>` : ""}
          ${p.island ? `<span class="blog-card-island"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>${p.island}</span>` : ""}
        </div>
        <h3 class="blog-card-title">${p.title}</h3>
        <div class="blog-card-meta">${p.author ? p.author + " · " : ""}Last updated ${fmtDate(p.updatedAt)}${p.readTime ? " · " + p.readTime + " min read" : ""}</div>
      </div>
    </a>`;
}

function renderArticleGrid() {
  let list = BLOG_POSTS.filter((p) =>
    (blogState.layer1 === "All" || p.category === blogState.layer1) &&
    (blogState.island === "All" || p.island === blogState.island)
  );
  const grid = document.getElementById("blog-grid");
  const empty = document.getElementById("blog-empty");
  if (list.length === 0) {
    grid.innerHTML = ""; empty.style.display = "block";
    document.getElementById("load-more-btn").style.display = "none";
    return;
  }
  empty.style.display = "none";
  const visible = list.slice(0, blogState.visibleCount);
  grid.innerHTML = visible.map(articleCard).join("");
  document.getElementById("load-more-btn").style.display = visible.length < list.length ? "inline-flex" : "none";
}
