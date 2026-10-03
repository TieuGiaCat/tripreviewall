/* ============================================================
   tripreviewall.com — Tour Detail page interactivity
   Used only on server-generated tours/<slug>.html pages, where all
   content is already in the HTML. Adds behaviour only — never fetches
   or renders data. No inline onclick or inline script blocks in the page: everything
   is wired here through data-* attributes (E9 — keeps a strict
   Content-Security-Policy possible).
     .content-tab[data-target]   → switch tab panel
     [data-tab-link="tab-id"]    → link that opens a tab (rating link)
     [data-booking-sheet=open|close] → mobile "N options" bottom sheet
   ============================================================ */

(function () {
  function reduceMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /* ---------- Tabs (show one panel, no page jump) ---------- */
  function switchDetailTab(targetId, clickedBtn) {
    var panel = document.getElementById(targetId);
    if (!panel) return;
    document.querySelectorAll(".content-tab-panel").forEach(function (p) {
      p.style.display = p.id === targetId ? "" : "none";
    });
    document.querySelectorAll(".content-tab").forEach(function (btn) {
      var on = btn.getAttribute("data-target") === targetId;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
      btn.tabIndex = on ? 0 : -1;
      if (on && !clickedBtn) clickedBtn = btn;
    });
    if (clickedBtn) {
      // Slide the tab strip sideways so the chosen tab is fully visible (mobile).
      var strip = clickedBtn.parentElement;
      var left = clickedBtn.offsetLeft - (strip.clientWidth - clickedBtn.offsetWidth) / 2;
      strip.scrollTo({ left: Math.max(0, left), behavior: reduceMotion() ? "auto" : "smooth" });
    }
    // Only scroll the page when the new panel would start hidden under the
    // sticky header + tab strip; otherwise the page stays where it is.
    var tabsBar = document.querySelector(".content-tabs");
    if (tabsBar) {
      var barBottom = tabsBar.getBoundingClientRect().bottom;
      var panelTop = panel.getBoundingClientRect().top;
      if (panelTop < barBottom) {
        window.scrollTo({ top: window.scrollY + panelTop - barBottom - 8, behavior: reduceMotion() ? "auto" : "smooth" });
      }
    }
  }
  window.switchDetailTab = switchDetailTab; // kept global for anything that still calls it

  /* ---------- Mobile booking bottom sheet ---------- */
  var sheetOpener = null;
  function toggleBookingSheet(open) {
    var sheet = document.getElementById("booking-sheet");
    var backdrop = document.getElementById("booking-sheet-backdrop");
    if (!sheet || open === !sheet.hidden) return;
    sheet.hidden = !open;
    if (backdrop) backdrop.hidden = !open;
    document.body.style.overflow = open ? "hidden" : "";
    var more = document.querySelector(".mobile-more-btn");
    if (more) more.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      sheetOpener = document.activeElement;
      var close = sheet.querySelector(".booking-sheet-close");
      if (close) close.focus();
    } else if (sheetOpener) {
      sheetOpener.focus(); // give focus back to the button that opened it
    }
  }
  window.toggleBookingSheet = toggleBookingSheet;

  /* ---------- One delegated click handler ---------- */
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t.closest) return;
    var tab = t.closest(".content-tab[data-target]");
    if (tab) {
      e.preventDefault();
      switchDetailTab(tab.getAttribute("data-target"), tab);
      return;
    }
    var tabLink = t.closest("[data-tab-link]");
    if (tabLink) {
      e.preventDefault();
      switchDetailTab(tabLink.getAttribute("data-tab-link"));
      return;
    }
    var sheetBtn = t.closest("[data-booking-sheet]");
    if (sheetBtn) {
      e.preventDefault();
      toggleBookingSheet(sheetBtn.getAttribute("data-booking-sheet") === "open");
    }
  });

  /* ---------- Keyboard ---------- */
  document.addEventListener("keydown", function (e) {
    // Booking sheet: Esc closes, Tab stays inside the open sheet.
    var sheet = document.getElementById("booking-sheet");
    if (sheet && !sheet.hidden) {
      if (e.key === "Escape") { toggleBookingSheet(false); return; }
      if (e.key === "Tab") {
        var items = sheet.querySelectorAll("a[href], button");
        var first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    // Tab strip (WAI-ARIA tabs pattern): ← → Home End.
    var current = e.target.closest && e.target.closest('.content-tab[role="tab"]');
    if (!current) return;
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.content-tab[role="tab"]'));
    var i = tabs.indexOf(current);
    var next = null;
    if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
    else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
    else if (e.key === "Home") next = tabs[0];
    else if (e.key === "End") next = tabs[tabs.length - 1];
    if (!next) return;
    e.preventDefault();
    next.focus();
    switchDetailTab(next.getAttribute("data-target"), next);
  });

  /* ---------- Gallery thumbnails ---------- */
  function initGalleryThumbs() {
    var mainImg = document.getElementById("gallery-main-img");
    document.querySelectorAll(".gallery-thumb").forEach(function (thumb) {
      thumb.addEventListener("click", function () {
        document.querySelectorAll(".gallery-thumb").forEach(function (t) { t.classList.remove("active"); });
        thumb.classList.add("active");
        if (!mainImg) return;
        if (thumb.dataset.srcset) mainImg.srcset = thumb.dataset.srcset; else mainImg.removeAttribute("srcset");
        mainImg.src = thumb.dataset.src || thumb.dataset.url;
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initGalleryThumbs);
  else initGalleryThumbs();
})();
