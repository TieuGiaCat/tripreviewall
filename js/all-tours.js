/* ============================================================
   tripreviewall.com — All Tours page logic
   Client-side search + sort + pagination (v1 simplification,
   no filter sidebar — see master-technical-architecture.md §11)
   ============================================================ */

const PAGE_SIZE = 24;
let atState = { query: "", sort: "most-reviewed", page: 1 };

document.addEventListener("DOMContentLoaded", () => {
  if (typeof ALL_TOURS === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const q = params.get("q");
  if (q) { document.getElementById("at-search-input").value = q; atState.query = q; }
  initSearch();
  initSort();
  renderAllTours();
});

function getFilteredSorted() {
  let list = ALL_TOURS.filter((t) => {
    if (!atState.query) return true;
    const q = atState.query.toLowerCase();
    return t.title.toLowerCase().includes(q) || t.island.toLowerCase().includes(q) ||
           (t.tourType || "").toLowerCase().includes(q) || t.company.toLowerCase().includes(q);
  });
  switch (atState.sort) {
    case "highest-rated": list.sort((a, b) => b.aggregatedRating - a.aggregatedRating); break;
    case "price-low": list.sort((a, b) => a.priceFrom - b.priceFrom); break;
    case "price-high": list.sort((a, b) => b.priceFrom - a.priceFrom); break;
    default: list.sort((a, b) => b.reviewCountTotal - a.reviewCountTotal || a.title.localeCompare(b.title));
  }
  return list;
}

function renderAllTours() {
  const all = getFilteredSorted();
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  atState.page = Math.min(atState.page, totalPages);
  const start = (atState.page - 1) * PAGE_SIZE;
  const pageItems = all.slice(start, start + PAGE_SIZE);

  const grid = document.getElementById("all-tours-grid");
  const countEl = document.getElementById("result-count");
  const emptyEl = document.getElementById("empty-state");

  countEl.innerHTML = total > 0
    ? `Showing <span class="n">${start + 1}–${Math.min(start + PAGE_SIZE, total)}</span> of <span class="n">${total}</span> tours`
    : `No results`;

  if (total === 0) {
    grid.innerHTML = "";
    emptyEl.style.display = "block";
  } else {
    emptyEl.style.display = "none";
    grid.innerHTML = pageItems.map((t) => tourCardTemplate(t, "tours/", "img/")).join("");
  }
  renderPagination(totalPages);
  window.scrollTo({ top: document.getElementById("sort-bar-anchor").offsetTop - 80, behavior: "smooth" });
}

function renderPagination(totalPages) {
  const el = document.getElementById("pagination");
  if (totalPages <= 1) { el.innerHTML = ""; return; }
  let html = `<button class="page-btn" ${atState.page === 1 ? "disabled" : ""} data-page="${atState.page - 1}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
  </button>`;
  const windowSize = 2;
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - atState.page) <= windowSize) {
      html += `<button class="page-btn ${p === atState.page ? "active" : ""}" data-page="${p}">${p}</button>`;
    } else if (Math.abs(p - atState.page) === windowSize + 1) {
      html += `<span class="page-btn" style="border:none;background:none;">…</span>`;
    }
  }
  html += `<button class="page-btn" ${atState.page === totalPages ? "disabled" : ""} data-page="${atState.page + 1}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
  </button>`;
  el.innerHTML = html;
  el.querySelectorAll(".page-btn[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = parseInt(btn.dataset.page, 10);
      if (p >= 1 && !btn.disabled) { atState.page = p; renderAllTours(); }
    });
  });
}

function initSearch() {
  const input = document.getElementById("at-search-input");
  let debounce;
  input.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { atState.query = input.value.trim(); atState.page = 1; renderAllTours(); }, 250);
  });
}

function initSort() {
  document.getElementById("sort-select").addEventListener("change", (e) => {
    atState.sort = e.target.value; atState.page = 1; renderAllTours();
  });
}
