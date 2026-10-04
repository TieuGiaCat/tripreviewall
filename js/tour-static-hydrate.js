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

  /* ---------- Operator contact: shown after a booking click ----------
     The Contact tab (when Admin → Site Info → "Operator contact" is
     "after-click") holds the phone/email base64-encoded in data-contact.
     They're revealed once the visitor opens any booking link (FareHarbor,
     TripAdvisor, GetYourGuide, Viator — they all go through
     /api/track-click) or uses the FareHarbor calendar, and stay revealed
     for that tour on this browser. */
  var gate = document.querySelector(".contact-gate[data-contact]");
  var contactKey = gate ? "trv-contact-" + gate.getAttribute("data-tour") : "";
  function storageGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function storageSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  function decodeContact(b64) {
    try {
      var bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) { return null; }
  }
  function revealContact() {
    if (!gate || gate.classList.contains("is-unlocked")) return;
    var c = decodeContact(gate.getAttribute("data-contact"));
    if (!c) return;
    var list = gate.querySelector("[data-contact-list]");
    var icons = { company: "M3 4h18v18H3z", phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z", email: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6" };
    function row(kind, text, href) {
      var li = document.createElement("li");
      li.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + icons[kind] + '"></path></svg>';
      var el = document.createElement(href ? "a" : "span");
      if (href) el.href = href;
      el.textContent = text;
      li.appendChild(el);
      list.appendChild(li);
    }
    if (c.company) row("company", c.company);
    if (c.phone) row("phone", c.phone, "tel:" + c.phone.replace(/[^\d+]/g, ""));
    if (c.email) row("email", c.email, "mailto:" + c.email);
    gate.querySelector(".contact-locked").hidden = true;
    gate.querySelector(".contact-unlocked").hidden = false;
    gate.classList.add("is-unlocked");
  }
  function markBookingClick() {
    if (!gate) return;
    storageSet(contactKey, "1");
    revealContact();
  }
  if (gate) {
    if (storageGet(contactKey) === "1") revealContact();
    // Any booking link on the page (sidebar, mobile bar, bottom sheet, Contact tab).
    ["click", "auxclick"].forEach(function (type) {
      document.addEventListener(type, function (e) {
        var a = e.target.closest && e.target.closest('a[href*="/api/track-click"], a[href*="fareharbor.com/"]');
        if (a) markBookingClick();
      }, true);
    });
    // Clicking inside the FareHarbor calendar iframe moves focus into it.
    window.addEventListener("blur", function () {
      setTimeout(function () {
        var f = document.activeElement;
        if (f && f.tagName === "IFRAME" && /fareharbor/i.test(f.src || "")) markBookingClick();
      }, 0);
    });
  }

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
