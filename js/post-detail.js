/* ============================================================
   tripreviewall.com — Blog Detail page (GENERIC TEMPLATE)
   Loads a post by ?slug= from the live API (or fallback snapshot).
   Sections with no data (featured image, related tour, island tag)
   are omitted rather than shown empty.
   ============================================================ */

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug");
  const post = await loadOnePost(slug);

  if (!post) {
    document.getElementById("post-content").style.display = "none";
    document.getElementById("post-not-found").style.display = "block";
    return;
  }

  renderHeader(post);
  renderDisclosure(post);
  renderHero(post);
  renderBody(post);
  renderAuthorAndLinks(post);

  if (post.relatedTourSlug) {
    const tour = await loadOneTour(post.relatedTourSlug);
    if (tour) {
      renderInlineTourCard(tour);
      renderSidebarCard(tour);
    }
  }

  const allPosts = await loadAllPosts();
  renderRelatedArticles(post, allPosts);
});

function fmtDate(d) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date)) return String(d).slice(0, 10);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function renderHeader(post) {
  document.title = `${post.title} | Tripreviewall`;
  document.getElementById("page-desc").setAttribute("content", post.excerpt || post.title);
  document.getElementById("bc-current").textContent = post.title;
  document.getElementById("article-headline").textContent = post.title;

  const tags = [];
  if (post.category) tags.push(`<span class="tag-pill tag-category">${post.category}</span>`);
  if (post.island) tags.push(`<span class="tag-pill tag-island">${post.island}</span>`);
  document.getElementById("article-tags").innerHTML = tags.join("");

  const metaParts = [];
  if (post.author) metaParts.push(`<span class="author-name">${post.author}</span>`);
  if (post.publishedAt) metaParts.push(`<span>Published ${fmtDate(post.publishedAt)}</span>`);
  if (post.updatedAt && post.publishedAt && fmtDate(post.updatedAt) !== fmtDate(post.publishedAt)) {
    metaParts.push(`<span class="updated">Updated ${fmtDate(post.updatedAt)}</span>`);
  }
  if (post.readTime) metaParts.push(`<span>${post.readTime} min read</span>`);
  document.getElementById("article-meta").innerHTML = metaParts.join('<span>·</span>');
}

function renderDisclosure(post) {
  const wrap = document.getElementById("disclosure-wrap");
  if (!post.disclosureText) { wrap.innerHTML = ""; return; }
  wrap.innerHTML = `
    <div class="disclosure-banner">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
      <span>${post.disclosureText}</span>
    </div>`;
}

function renderHero(post) {
  const wrap = document.getElementById("hero-wrap");
  if (!post.featuredImage) { wrap.innerHTML = ""; return; }
  wrap.innerHTML = `<div class="article-hero-img" style="background-image:url('${post.featuredImage}')"></div><p class="article-hero-caption">Photo: Operator</p>`;
}

function renderBody(post) {
  const paragraphs = (post.body || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  document.getElementById("article-body").innerHTML = paragraphs.map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
}

function renderAuthorAndLinks(post) {
  const box = document.getElementById("author-box");
  if (!post.author && !post.island && !post.relatedTourSlug) { box.style.display = "none"; return; }
  box.style.display = "block";

  if (post.author) {
    document.getElementById("author-name").textContent = post.author;
  } else {
    document.querySelector(".author-card").style.display = "none";
  }

  const links = [];
  if (post.island) {
    links.push(`<a href="../destinations/island.html?slug=${post.island.toLowerCase().replace(" ", "-")}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
      More ${post.island} guides</a>`);
  }
  if (post.relatedTourSlug) {
    links.push(`<a href="../tours/tour-detail.html?slug=${post.relatedTourSlug}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
      See tour details & availability</a>`);
  }
  document.getElementById("internal-links-box").innerHTML = links.join("");
  if (links.length === 0) document.getElementById("internal-links-box").style.display = "none";
}

function renderInlineTourCard(tour) {
  const el = document.getElementById("inline-tour-embed");
  el.innerHTML = `
    <div class="inline-tour-card">
      <div class="inline-tour-img" style="background-image:${tour.gallery && tour.gallery[0] ? `url('${tour.gallery[0]}')` : "linear-gradient(135deg,#5C8A72,#0B3B4F)"}; background-size:cover; background-position:center;"></div>
      <div style="flex:1;">
        <div class="inline-tour-eyebrow">Featured Tour</div>
        <h3 class="inline-tour-title">${tour.title}</h3>
        <div class="inline-tour-rating">${tour.aggregatedRating.toFixed(1)}★ · ${tour.reviewCountTotal.toLocaleString()} reviews</div>
        <div class="inline-tour-diff">${tour.company} — ${tour.duration}, ${(tour.tourType || "").toLowerCase()}.</div>
        <div class="inline-tour-footer">
          <span class="inline-tour-price">From $${tour.priceFrom}</span>
          <a href="../tours/tour-detail.html?slug=${tour.slug}" class="btn btn-primary">Check Availability</a>
        </div>
        <p class="inline-tour-disclosure">This is an affiliate link. If you book, Tripreviewall may earn a commission at no extra cost to you.</p>
      </div>
    </div>`;
}

function renderSidebarCard(tour) {
  const wrap = document.getElementById("sidebar-tour-wrap");
  wrap.innerHTML = `
    <div class="sidebar-affiliate-card">
      <div class="sidebar-affiliate-label">Featured Tour</div>
      <div class="sidebar-affiliate-img" style="background-image:${tour.gallery && tour.gallery[0] ? `url('${tour.gallery[0]}')` : "linear-gradient(135deg,#5C8A72,#0B3B4F)"}; background-size:cover; background-position:center;"></div>
      <h4 class="sidebar-affiliate-title">${tour.title}</h4>
      <div style="font-size:var(--text-meta);">${tour.aggregatedRating.toFixed(1)}★ (${tour.reviewCountTotal.toLocaleString()})</div>
      <ul class="sidebar-affiliate-bullets">
        <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>${tour.duration}</li>
        <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>${tour.tourType}</li>
        <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>${tour.island}</li>
      </ul>
      <div class="sidebar-affiliate-price">From $${tour.priceFrom}/person</div>
      <a href="../tours/tour-detail.html?slug=${tour.slug}" class="btn btn-primary btn-full">Check Availability</a>
      <p class="inline-tour-disclosure">Tripreviewall may earn a commission if you book through this link, at no extra cost to you.</p>
    </div>`;
}

function renderRelatedArticles(post, allPosts) {
  const el = document.getElementById("related-articles");
  const list = allPosts
    .filter((p) => p.slug !== post.slug)
    .sort((a, b) => (a.category === post.category ? -1 : 1)) // same-category first
    .slice(0, 3);
  if (list.length === 0) { el.innerHTML = `<p style="color:var(--color-text-muted);">More articles coming soon.</p>`; return; }
  el.innerHTML = list.map((p) => `
    <a href="post-detail.html?slug=${encodeURIComponent(p.slug)}" class="blog-card">
      <div class="blog-card-image" style="background:${p.featuredImage ? `url('${p.featuredImage}')` : "linear-gradient(135deg,#0B3B4F,#5C8A72)"}; background-size:cover; background-position:center;"></div>
      <div class="blog-card-body">
        <div class="blog-card-cat">${p.category || ""}</div>
        <h3 class="blog-card-title">${p.title}</h3>
        <div class="blog-card-meta">${fmtDate(p.updatedAt)}${p.readTime ? " · " + p.readTime + " min read" : ""}</div>
      </div>
    </a>`).join("");
}
