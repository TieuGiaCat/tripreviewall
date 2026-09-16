/* ============================================================
   tripreviewall.com — Destination pillar page logic
   Real tour/article counts pulled from ALL_TOURS / BLOG_POSTS
   (the same single source of truth used site-wide).
   Island list itself comes from js/islands-data.js (shared, single
   source — see that file's header comment).
   ============================================================ */

const ISLANDS = ISLANDS_DATA;

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug") || "oahu";
  const island = ISLANDS.find((i) => i.slug === slug) || ISLANDS[0];

  renderTabs(island);
  renderHero(island);
  window.ALL_TOURS = await loadAllTours();
  renderTours(island);
  window.BLOG_POSTS = await loadAllPosts();
  renderArticles(island);
});

function renderTabs(current) {
  document.getElementById("island-tabs").innerHTML = ISLANDS.map((i) =>
    `<a class="dest-island-tab${i.slug === current.slug ? " active" : ""}" href="${i.slug}.html">${i.name}</a>`).join("");
}

function renderHero(island) {
  document.title = `${island.name} Tours — Tripreviewall`;
  document.getElementById("page-desc").setAttribute("content", `Honest, aggregated ${island.name} tour reviews — every rating we collect, 5-star and 1-star alike.`);
  document.getElementById("bc-current").textContent = island.name;
  document.getElementById("dest-hero").style.backgroundImage = island.gradient;
  document.getElementById("dest-h1").textContent = island.name;
  document.getElementById("dest-intro").textContent = island.intro;
  document.getElementById("tours-heading-island").textContent = island.name;
  document.getElementById("articles-heading-island").textContent = island.name;
  document.getElementById("view-all-link").href = `../tours.html?q=${encodeURIComponent(island.name)}`;
}

function renderTours(island) {
  const list = ALL_TOURS.filter((t) => t.island === island.name);
  document.getElementById("dest-count").textContent = `${list.length} tours tracked`;
  const grid = document.getElementById("dest-tour-grid");
  grid.innerHTML = list.slice(0, 8).map((t) => tourCardTemplate(t, "../tours/", "../img/")).join("");
}

function renderArticles(island) {
  const grid = document.getElementById("dest-blog-grid");
  const empty = document.getElementById("dest-blog-empty");
  const list = (typeof BLOG_POSTS !== "undefined" ? BLOG_POSTS : []).filter((p) => p.island === island.name);
  if (list.length === 0) { grid.innerHTML = ""; empty.style.display = "block"; return; }
  empty.style.display = "none";
  grid.innerHTML = list.map((p) => `
    <a href="../blog/${p.slug}.html" class="blog-card">
      <div class="blog-card-image" style="background:${p.featuredImage ? `url('${p.featuredImage}')` : "linear-gradient(135deg,#0B3B4F,#5C8A72)"}; background-size:cover; background-position:center;"></div>
      <div class="blog-card-body">
        <div class="blog-card-cat">${p.category || ""}</div>
        <h3 class="blog-card-title">${p.title}</h3>
        <div class="blog-card-meta">${p.updatedAt} · ${p.readTime || ""} min read</div>
      </div>
    </a>`).join("");
}
