/* ============================================================
   tripreviewall.com — All Articles page: search, filter, sort
   Every article card is rendered by the server; this only shows, hides
   and re-orders the cards already on the page (no fetch, no flash).
   Filters live in the URL (?q=&category=&topic=&sort=) so a filtered
   view can be shared or bookmarked — same idea as the /tours page.
   ============================================================ */

(function () {
  const STEP = 9;
  const state = { q: "", category: "All", topic: "All", sort: "newest", visible: STEP };
  let grid, cards, countEl, emptyEl, moreBtn, searchInput, topicSelect, sortSelect;

  document.addEventListener("DOMContentLoaded", () => {
    grid = document.getElementById("blog-grid");
    if (!grid) return;
    cards = Array.from(grid.querySelectorAll(".blog-card"));
    countEl = document.getElementById("blog-result-count");
    emptyEl = document.getElementById("blog-empty");
    moreBtn = document.getElementById("load-more-btn");
    searchInput = document.getElementById("blog-search-input");
    topicSelect = document.getElementById("island-select");
    sortSelect = document.getElementById("blog-sort-select");

    readUrl();
    syncControls();

    document.querySelectorAll(".layer1-tab").forEach((btn) => {
      btn.addEventListener("click", () => { state.category = btn.dataset.cat; state.visible = STEP; update(); });
    });
    topicSelect?.addEventListener("change", () => { state.topic = topicSelect.value; state.visible = STEP; update(); });
    sortSelect?.addEventListener("change", () => { state.sort = sortSelect.value; update(); });
    let t = null;
    searchInput?.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => { state.q = searchInput.value.trim(); state.visible = STEP; update({ scroll: false }); }, 200);
    });
    moreBtn?.addEventListener("click", () => { state.visible += STEP; update({ scroll: false }); });
    document.getElementById("blog-clear-filters")?.addEventListener("click", clearAll);
    countEl?.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-clear]");
      if (!chip) return;
      const key = chip.dataset.clear;
      state[key] = key === "q" ? "" : "All";
      state.visible = STEP;
      update();
    });

    if (isFiltered() || state.sort !== "newest") update({ scroll: false });
  });

  function isFiltered() { return !!state.q || state.category !== "All" || state.topic !== "All"; }

  function readUrl() {
    const p = new URLSearchParams(location.search);
    state.q = (p.get("q") || "").trim();
    state.category = p.get("category") || "All";
    state.topic = p.get("topic") || p.get("island") || "All";
    state.sort = p.get("sort") || "newest";
  }
  function writeUrl() {
    const p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    if (state.category !== "All") p.set("category", state.category);
    if (state.topic !== "All") p.set("topic", state.topic);
    if (state.sort !== "newest") p.set("sort", state.sort);
    const qs = p.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
  }
  function syncControls() {
    if (searchInput) searchInput.value = state.q;
    if (topicSelect) {
      if (![...topicSelect.options].some((o) => o.value === state.topic)) state.topic = "All";
      topicSelect.value = state.topic;
    }
    if (sortSelect) sortSelect.value = state.sort;
    document.querySelectorAll(".layer1-tab").forEach((b) => {
      const on = b.dataset.cat === state.category;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function matches(card) {
    if (state.category !== "All" && card.dataset.category !== state.category) return false;
    if (state.topic !== "All" && card.dataset.topic !== state.topic) return false;
    if (state.q) {
      const hay = card.dataset.search || "";
      return state.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
    }
    return true;
  }

  function compare(a, b) {
    switch (state.sort) {
      case "oldest": return a.dataset.date.localeCompare(b.dataset.date);
      case "quick": return (+a.dataset.read || 999) - (+b.dataset.read || 999);
      case "deep": return (+b.dataset.read || 0) - (+a.dataset.read || 0);
      case "az": return (a.dataset.title || "").localeCompare(b.dataset.title || "");
      default: return b.dataset.date.localeCompare(a.dataset.date);
    }
  }

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  function update({ scroll = true } = {}) {
    syncControls();
    writeUrl();
    const matching = cards.filter(matches).sort(compare);
    // Re-order the DOM so the visible order follows the chosen sort.
    matching.forEach((c) => grid.appendChild(c));
    cards.filter((c) => !matching.includes(c)).forEach((c) => grid.appendChild(c));
    cards.forEach((c) => { c.hidden = true; });
    matching.slice(0, state.visible).forEach((c) => { c.hidden = false; });
    // The big "lead" card only makes sense on the default, unfiltered view.
    grid.classList.toggle("has-lead", !isFiltered() && state.sort === "newest");

    const shown = Math.min(matching.length, state.visible);
    const chips = [];
    if (state.q) chips.push(["q", `“${state.q}”`]);
    if (state.category !== "All") chips.push(["category", state.category]);
    if (state.topic !== "All") chips.push(["topic", state.topic]);
    if (countEl) {
      countEl.innerHTML = (matching.length
        ? `Showing <span class="n">${shown}</span> of <span class="n">${matching.length}</span> article${matching.length === 1 ? "" : "s"}`
        : "No results") +
        chips.map(([k, label]) => ` <button type="button" class="filter-chip" data-clear="${k}" aria-label="Remove filter ${esc(label)}">${esc(label)} ✕</button>`).join("");
    }
    if (emptyEl) emptyEl.style.display = matching.length ? "none" : "block";
    if (moreBtn) moreBtn.style.display = matching.length > state.visible ? "inline-flex" : "none";

    if (scroll) {
      const anchor = document.getElementById("sort-bar-anchor");
      const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (anchor && anchor.getBoundingClientRect().top < 0) window.scrollTo({ top: anchor.offsetTop - 80, behavior: reduce ? "auto" : "smooth" });
    }
  }

  function clearAll() {
    state.q = ""; state.category = "All"; state.topic = "All"; state.visible = STEP;
    update();
    searchInput?.focus();
  }
})();
