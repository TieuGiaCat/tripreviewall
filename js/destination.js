/* ============================================================
   tripreviewall.com — Destination pillar page logic
   Real tour/article counts pulled from ALL_TOURS / BLOG_POSTS
   (the same single source of truth used site-wide).
   ============================================================ */

const ISLANDS = [
  { slug: "oahu", name: "Oahu", gradient: "linear-gradient(135deg,#0B3B4F,#5C8A72)",
    intro: "Oahu carries the largest share of tours we track — Honolulu-area snorkel and dive operators, Pearl Harbor historic tours, and North Shore surf schools and shark dives make up most of the island's listings." },
  { slug: "maui", name: "Maui", gradient: "linear-gradient(135deg,#B8592F,#0B3B4F)",
    intro: "Maui's tour scene centers on boat charters out of Lahaina and Ma'alaea, the Road to Hana (both self-drive and guided), and Haleakala sunrise/sunset tours." },
  { slug: "kauai", name: "Kauai", gradient: "linear-gradient(135deg,#5C8A72,#26313A)",
    intro: "Kauai's tours are dominated by Na Pali Coast boat and raft trips, helicopter air tours, and a smaller set of land-based hiking and ranch adventures." },
  { slug: "big-island", name: "Big Island", gradient: "linear-gradient(135deg,#26313A,#B85C4A)",
    intro: "Big Island tours split between Kona-side snorkel and dive charters (including manta ray night snorkels), and volcano/waterfall tours based out of Hilo." }
];

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
    `<a class="dest-island-tab${i.slug === current.slug ? " active" : ""}" href="island.html?slug=${i.slug}">${i.name}</a>`).join("");
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
