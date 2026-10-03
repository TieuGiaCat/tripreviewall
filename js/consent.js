/* ============================================================
   tripreviewall.com — cookie consent
   Tracking snippets saved in Admin → Settings → Tracking (Google Tag
   Manager, GA, Meta Pixel…) are written into pages as
   <script type="text/plain" data-consent="analytics"> — inert.
   They only run after the visitor clicks "Accept". "Reject" (or no
   choice) keeps them off. The choice can be changed any time from the
   "Cookie settings" link added to the footer.
   This file is only included on pages that actually carry such scripts.
   ============================================================ */
(function () {
  var KEY = "trv_consent_v1";
  var blocked = document.querySelectorAll('script[type="text/plain"][data-consent]');
  if (!blocked.length) return;

  function readChoice() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || "null"); return v && v.choice; } catch (e) { return null; }
  }
  function saveChoice(choice) {
    try { localStorage.setItem(KEY, JSON.stringify({ choice: choice, at: new Date().toISOString() })); } catch (e) { /* private mode: ask again next page */ }
  }

  var activated = false;
  function activate() {
    if (activated) return;
    activated = true;
    // Re-create each script so the browser executes it; keep document order
    // (external scripts get async=false so they still run in sequence).
    Array.prototype.forEach.call(document.querySelectorAll('script[type="text/plain"][data-consent]'), function (old) {
      var s = document.createElement("script");
      Array.prototype.forEach.call(old.attributes, function (a) {
        if (a.name !== "type" && a.name !== "data-consent") s.setAttribute(a.name, a.value);
      });
      if (old.src) s.async = false;
      s.text = old.text;
      old.parentNode.replaceChild(s, old);
    });
  }

  function clearAnalyticsCookies() {
    var host = location.hostname.replace(/^www\./, "");
    document.cookie.split(";").forEach(function (c) {
      var name = c.split("=")[0].trim();
      if (/^(_ga|_gid|_gat|_gcl|_fbp|_fbc)/.test(name)) {
        ["", "; domain=" + host, "; domain=." + host].forEach(function (d) {
          document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/" + d;
        });
      }
    });
  }

  var style = document.createElement("style");
  style.textContent =
    ".trv-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:90;max-width:560px;margin:0 auto;background:var(--color-bg-alt,#fff);color:var(--color-text,#26313A);" +
    "border:1px solid var(--color-border,#D8D2C4);border-radius:12px;box-shadow:0 8px 32px rgba(11,59,79,.18);padding:18px 20px;font-family:var(--font-sans,Inter,sans-serif)}" +
    ".trv-consent[hidden]{display:none}" +
    ".trv-consent h2{font-family:var(--font-serif,serif);font-size:1.1rem;margin:0 0 6px}" +
    ".trv-consent p{font-size:.875rem;line-height:1.5;margin:0 0 14px;color:var(--color-text-muted,#5C6670)}" +
    ".trv-consent a{color:var(--color-primary,#0B3B4F);text-decoration:underline}" +
    ".trv-consent-actions{display:flex;gap:10px;flex-wrap:wrap}" +
    ".trv-consent-actions button{flex:1 1 140px;min-height:44px;border-radius:6px;font-weight:600;font-size:.9rem;cursor:pointer;border:1.5px solid var(--color-primary,#0B3B4F)}" +
    ".trv-consent-accept{background:var(--color-primary,#0B3B4F);color:#fff}" +
    ".trv-consent-reject{background:transparent;color:var(--color-primary,#0B3B4F)}" +
    ".trv-cookie-link{background:none;border:none;padding:0;color:inherit;font:inherit;text-decoration:underline;cursor:pointer;opacity:.85}" +
    "@media (max-width:1023px){.has-booking-bar .trv-consent{bottom:88px}}";
  document.head.appendChild(style);

  var banner = document.createElement("div");
  banner.className = "trv-consent";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-live", "polite");
  banner.setAttribute("aria-labelledby", "trv-consent-title");
  banner.hidden = true;
  banner.innerHTML =
    '<h2 id="trv-consent-title">Cookies on Tripreviewall</h2>' +
    "<p>We'd like to use optional analytics and marketing cookies (Google Tag Manager / Google Analytics) to see which guides are useful. " +
    "They stay off unless you accept. Reading the site and booking links work the same either way. " +
    '<a href="/privacy-policy">Privacy Policy</a></p>' +
    '<div class="trv-consent-actions">' +
    '<button type="button" class="trv-consent-reject">Reject</button>' +
    '<button type="button" class="trv-consent-accept">Accept</button>' +
    "</div>";

  function show() { banner.hidden = false; var b = banner.querySelector(".trv-consent-reject"); if (b) b.focus({ preventScroll: true }); }
  function hide() { banner.hidden = true; }

  banner.querySelector(".trv-consent-accept").addEventListener("click", function () {
    saveChoice("granted"); hide(); activate();
  });
  banner.querySelector(".trv-consent-reject").addEventListener("click", function () {
    var wasActive = activated;
    saveChoice("denied"); hide(); clearAnalyticsCookies();
    if (wasActive) location.reload(); // scripts already running can't be unloaded — reload without them
  });

  function mount() {
    document.body.appendChild(banner);
    if (document.getElementById("mobile-booking-bar")) document.body.classList.add("has-booking-bar");

    // "Cookie settings" link in the footer so the choice can be changed later.
    var footerBottom = document.querySelector(".footer-bottom");
    if (footerBottom && !footerBottom.querySelector(".trv-cookie-link")) {
      var link = document.createElement("button");
      link.type = "button";
      link.className = "trv-cookie-link";
      link.textContent = "Cookie settings";
      link.addEventListener("click", show);
      footerBottom.appendChild(document.createTextNode(" · "));
      footerBottom.appendChild(link);
    }

    var choice = readChoice();
    // Global Privacy Control = an opt-out request; never auto-run tracking for it.
    if (choice === "granted" && !navigator.globalPrivacyControl) activate();
    else if (!choice) show();
  }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
