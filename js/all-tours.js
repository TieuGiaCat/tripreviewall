/* ============================================================
   tripreviewall.com — All Tours page logic
   The page arrives fully rendered by the server (24 tours per page,
   real /tours/page/N links). Nothing is fetched on load unless the URL
   carries a search (?q= / ?island= / ?type= from the home hero form).
   As soon as the visitor searches or changes the sort, the full list is
   fetched once and filtering/sorting/paging happens client-side.
   ============================================================ */

const PAGE_SIZE = 24;
let atState = { query: "", island: "", type: "", sort: "most-reviewed", page: 1 };
let atClientMode = false;

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  atState.query = (params.get("q") || "").trim();
  atState.island = (params.get("island") || "").trim();
  atState.type = (params.get("type") || "").trim();
  const input = document.getElementById("at-search-input");
  if (input && atState.query) input.value = atState.query;
  initSearch();
  initSort();
  if (atState.query || atState.island || atState.type) {
    await enterClientMode();
    renderAllTours({ scroll: false });
  }
});

async function enterClientMode() {
  if (atClientMode) return;
  if (typeof ALL_TOURS === "undefined") window.ALL_TOURS = await loadAllTours();
  atClientMode = true;
}

function matchesKeyword(t, keyword) {
  const k = keyword.toLowerCase();
  return (t.title || "").toLowerCase().includes(k) || (t.island || "").toLowerCase().includes(k) ||
         (t.tourType || "").toLowerCase().includes(k) || (t.company || "").toLowerCase().includes(k);
}

// The hero form's tour types map to several words operators actually use.
const TYPE_ALIASES = {
  "hiking": ["hik", "trek", "trail"],
  "boat tour": ["boat", "sail", "catamaran", "cruise", "yacht", "raft"],
  "surf lessons": ["surf"],
  "zipline": ["zip"],
  "snorkel": ["snorkel"],
  "luau": ["luau"],
  "helicopter": ["helicopter"],
};
function matchesType(t, type) {
  const words = TYPE_ALIASES[type.toLowerCase()] || [type];
  return words.some((w) => matchesKeyword(t, w));
}

function getFilteredSorted() {
  let list = ALL_TOURS.filter((t) =>
    (!atState.island || (t.island || "").toLowerCase() === atState.island.toLowerCase()) &&
    (!atState.type || matchesType(t, atState.type)) &&
    (!atState.query || matchesKeyword(t, atState.query))
  );
  switch (atState.sort) {
    case "highest-rated": list.sort((a, b) => (b.aggregatedRating || 0) - (a.aggregatedRating || 0)); break;
    case "price-low": list.sort((a, b) => (a.priceFrom ?? Infinity) - (b.priceFrom ?? Infinity)); break;
    case "price-high": list.sort((a, b) => (b.priceFrom ?? -1) - (a.priceFrom ?? -1)); break;
    default: list.sort((a, b) => (b.reviewCountTotal || 0) - (a.reviewCountTotal || 0) || a.title.localeCompare(b.title));
  }
  return list;
}

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function activeFilterChips() {
  const chips = [];
  if (atState.island) chips.push({ key: "island", label: `Island: ${atState.island}` });
  if (atState.type) chips.push({ key: "type", label: `Type: ${atState.type}` });
  if (!chips.length) return "";
  return " " + chips.map((c) => `<button type="button" class="filter-chip" data-clear="${c.key}" aria-label="Remove filter ${escHtml(c.label)}">${escHtml(c.label)} ✕</button>`).join(" ");
}

function renderAllTours({ scroll = true } = {}) {
  const all = getFilteredSorted();
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  atState.page = Math.min(atState.page, totalPages);
  const start = (atState.page - 1) * PAGE_SIZE;
  const pageItems = all.slice(start, start + PAGE_SIZE);

  const grid = document.getElementById("all-tours-grid");
  const countEl = document.getElementById("result-count");
  const emptyEl = document.getElementById("empty-state");

  countEl.innerHTML = (total > 0
    ? `Showing <span class="n">${start + 1}–${Math.min(start + PAGE_SIZE, total)}</span> of <span class="n">${total}</span> tours`
    : `No results`) + activeFilterChips();
  countEl.querySelectorAll("[data-clear]").forEach((btn) => {
    btn.addEventListener("click", () => {
      atState[btn.dataset.clear] = ""; atState.page = 1;
      syncUrl(); renderAllTours();
    });
  });

  if (total === 0) {
    grid.innerHTML = "";
    emptyEl.style.display = "block";
  } else {
    emptyEl.style.display = "none";
    grid.innerHTML = pageItems.map((t) => tourCardTemplate(t)).join("");
  }
  renderPagination(totalPages);
  // Only scroll in response to something the visitor did — never on first paint.
  if (scroll) {
    const anchor = document.getElementById("sort-bar-anchor");
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (anchor && anchor.getBoundingClientRect().top < 0) {
      window.scrollTo({ top: anchor.offsetTop - 80, behavior: reduce ? "auto" : "smooth" });
    }
  }
}

/** Keep the address bar in step with the search so it can be shared/bookmarked. */
function syncUrl() {
  const params = new URLSearchParams();
  if (atState.query) params.set("q", atState.query);
  if (atState.island) params.set("island", atState.island);
  if (atState.type) params.set("type", atState.type);
  const qs = params.toString();
  history.replaceState(null, "", "/tours" + (qs ? "?" + qs : ""));
}

function renderPagination(totalPages) {
  const el = document.getElementById("pagination");
  if (!el) return;
  if (totalPages <= 1) { el.innerHTML = ""; return; }
  let html = `<button type="button" class="page-btn" ${atState.page === 1 ? "disabled" : ""} data-page="${atState.page - 1}" aria-label="Previous page">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
  </button>`;
  const windowSize = 2;
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - atState.page) <= windowSize) {
      html += `<button type="button" class="page-btn ${p === atState.page ? "active" : ""}" data-page="${p}"${p === atState.page ? ' aria-current="page"' : ""}>${p}</button>`;
    } else if (Math.abs(p - atState.page) === windowSize + 1) {
      html += `<span class="page-btn" style="border:none;background:none;">…</span>`;
    }
  }
  html += `<button type="button" class="page-btn" ${atState.page === totalPages ? "disabled" : ""} data-page="${atState.page + 1}" aria-label="Next page">
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
  if (!input) return;
  let debounce;
  input.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      atState.query = input.value.trim(); atState.page = 1;
      await enterClientMode();
      syncUrl();
      renderAllTours();
    }, 250);
  });
}

function initSort() {
  const select = document.getElementById("sort-select");
  if (!select) return;
  select.addEventListener("change", async (e) => {
    atState.sort = e.target.value; atState.page = 1;
    await enterClientMode();
    renderAllTours();
  });
}
