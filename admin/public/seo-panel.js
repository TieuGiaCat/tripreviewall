/* ============================================================
   Tripreviewall admin — Yoast-style SEO panel
   Markup comes from src/lib/seoPanel.js; analysis from seo-analysis.js.
   The page tells the panel where the article text lives with
       window.SeoPanelContent = function () { return "<p>…html…</p>"; };
   and calls SeoPanel.refresh() when that content changes (the panel also
   re-checks every few seconds and on every input in the form).
   ============================================================ */
(function () {
  var panel = document.querySelector("[data-seo-panel]");
  if (!panel || !window.SeoAnalysis) return;
  var cfg = {};
  try { cfg = JSON.parse(document.getElementById("seo-panel-config").textContent); } catch (e) { cfg = {}; }
  var form = panel.closest("form") || document;

  var $ = function (sel) { return panel.querySelector(sel); };
  var kpInput = $('[data-seo="keyphrase"]');
  var titleInput = $('[data-seo="seoTitle"]');
  var descInput = $('[data-seo="metaDescription"]');
  var slugMirror = $('[data-seo="slug"]');
  var mainTitle = cfg.titleField ? form.querySelector(cfg.titleField) : null;
  var mainSlug = cfg.slugField ? form.querySelector(cfg.slugField) : null;

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  function field(name) { var el = form.querySelector('[name="' + name + '"]'); return el ? el.value : ""; }
  function lines(name) { return field(name).split("\n").map(function (x) { return x.trim(); }).filter(Boolean); }
  function currentTitle() { return mainTitle && mainTitle.value.trim() ? mainTitle.value.trim() : (cfg.titleFallback || ""); }
  /** Default SEO title when the box is empty, e.g. tours: "Name — Company". */
  function defaultSeoTitle() {
    if (cfg.fallbackFields) return cfg.fallbackFields.map(field).map(function (x) { return x.trim(); }).filter(Boolean).join(" — ");
    return cfg.seoTitleFallback === "title" ? currentTitle() : (cfg.seoTitleFallbackText || currentTitle());
  }
  /** The <title> as it will be published (fallback + " | Tripreviewall" suffix, like the templates). */
  function finalSeoTitle() {
    var base = titleInput && titleInput.value.trim() ? titleInput.value.trim() : defaultSeoTitle();
    return base ? base + (cfg.titleSuffix || "") : "";
  }
  /** The description that will actually be published: the box, or the page's automatic fallback. */
  function finalDescription() {
    if (descInput && descInput.value.trim()) return descInput.value.trim();
    var live = cfg.descFallbackField ? form.querySelector(cfg.descFallbackField) : null;
    var fb = live ? SeoAnalysis.stripTags(live.value) : (cfg.descFallback || "");
    return fb.slice(0, 155);
  }
  function slug() {
    if (mainSlug) return mainSlug.value.trim();
    return slugMirror ? slugMirror.value.trim() : (cfg.slug || "");
  }
  function contentHtml() {
    try { if (typeof window.SeoPanelContent === "function") return window.SeoPanelContent() || ""; } catch (e) { /* editor not ready */ }
    if (cfg.contentBuilder === "tour") {
      return SeoAnalysis.tourHtml({
        name: field("name"), company: field("company"), fullDescription: field("fullDescription"), highlights: lines("highlights"),
        verdict: { headline: field("verdictHeadline"), goodFor: lines("verdictGoodFor"), worthKnowing: lines("verdictWorthKnowing"), closingNote: field("verdictClosingNote") },
        gallery: new Array(cfg.galleryCount || 0),
      });
    }
    return cfg.staticHtml || "";
  }

  /* ---------- slug mirror ↔ main slug field ---------- */
  if (slugMirror && mainSlug) {
    slugMirror.value = mainSlug.value;
    slugMirror.addEventListener("input", function () { mainSlug.value = slugMirror.value; });
    mainSlug.addEventListener("input", function () { slugMirror.value = mainSlug.value; });
  }

  /* ---------- placeholders show what's used when a field is empty ---------- */
  function updatePlaceholders() {
    if (titleInput) titleInput.placeholder = defaultSeoTitle() || "SEO title";
    if (descInput) descInput.placeholder = finalDescription() || "Meta description";
  }

  /* ---------- progress bars ---------- */
  function bar(el, value, good, max) {
    if (!el) return;
    var fill = el.querySelector("span");
    var pctW = Math.min(100, Math.round(value / max * 100));
    fill.style.width = pctW + "%";
    var cls = value === 0 ? "bad" : value > max ? "bad" : value >= good ? "good" : "ok";
    el.className = "seo-bar seo-bar-" + cls;
  }

  /* ---------- Google preview ---------- */
  var mode = "mobile";
  function truncatePx(text, maxPx) {
    if (SeoAnalysis.titleWidth(text) <= maxPx) return text;
    var out = text;
    while (out.length && SeoAnalysis.titleWidth(out + " …") > maxPx) out = out.slice(0, -1);
    return out.replace(/\s+\S*$/, "") + " …";
  }
  function renderPreview() {
    var box = $("[data-seo-preview]");
    if (!box) return;
    var t = finalSeoTitle() || "Add an SEO title";
    var d = finalDescription() || "Add a meta description — otherwise Google picks a sentence from the page.";
    if (d.length > 156) d = d.slice(0, 156).replace(/\s+\S*$/, "") + " …";
    var path = (cfg.urlPrefix || "/") + slug();
    var crumbs = ["tripreviewall.com"].concat(path.split("/").filter(Boolean)).join(" › ");
    var date = cfg.date ? '<span class="gp-date">' + esc(cfg.date) + " — </span>" : "";
    var img = mode === "mobile" && cfg.image ? '<img class="gp-thumb" src="' + esc(cfg.image) + '" alt="">' : "";
    box.className = "google-preview gp-" + mode;
    box.innerHTML =
      '<div class="gp-site"><span class="gp-favicon"><img src="/favicon-32x32.png" alt=""></span><span><span class="gp-name">Tripreviewall</span><span class="gp-url">' + esc(crumbs) + "</span></span></div>" +
      '<div class="gp-title">' + esc(mode === "desktop" ? truncatePx(t, SeoAnalysis.TITLE_MAX_PX) : t) + "</div>" +
      '<div class="gp-body">' + img + '<div class="gp-desc">' + date + highlight(esc(d)) + "</div></div>";
  }
  function highlight(htmlText) {
    var kp = kpInput ? kpInput.value.trim() : "";
    if (!kp) return htmlText;
    var re = new RegExp("(" + kp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig");
    return htmlText.replace(re, "<strong>$1</strong>");
  }
  panel.querySelectorAll("[data-gp-mode]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      mode = btn.getAttribute("data-gp-mode");
      panel.querySelectorAll("[data-gp-mode]").forEach(function (b) { b.setAttribute("aria-pressed", b === btn ? "true" : "false"); });
      renderPreview();
    });
  });

  /* ---------- results ---------- */
  var DOT = { good: "Good", ok: "OK", bad: "Needs improvement", na: "Not analyzed" };
  function renderList(el, checks) {
    if (!el) return;
    var groups = [["bad", "Problems"], ["ok", "Improvements"], ["good", "Good results"]];
    el.innerHTML = groups.map(function (g) {
      var items = checks.filter(function (c) { return c.status === g[0]; });
      if (!items.length) return "";
      return '<details class="seo-group" ' + (g[0] !== "good" ? "open" : "") + "><summary>" + g[1] + " (" + items.length + ")</summary><ul>" +
        items.map(function (c) { return '<li><span class="seo-dot seo-dot-' + c.status + '" aria-hidden="true"></span><span><strong>' + esc(c.label) + ":</strong> " + esc(c.text) + "</span></li>"; }).join("") +
        "</ul></details>";
    }).join("");
  }
  function setTabDot(name, value) {
    var dot = panel.querySelector('[data-seo-tabdot="' + name + '"]');
    if (dot) { dot.className = "seo-dot seo-dot-" + value; dot.title = DOT[value] || ""; }
  }

  function run() {
    updatePlaceholders();
    var kp = kpInput ? kpInput.value.trim() : "";
    if (kpInput) {
      kpInput.classList.toggle("seo-input-missing", !kp);
      var warn = $("[data-seo-kp-warning]");
      if (warn) warn.hidden = !!kp;
    }
    var used = (cfg.used || {})[SeoAnalysis.norm(kp)] || [];
    var result = SeoAnalysis.analyze({
      keyphrase: kp,
      title: currentTitle(),
      seoTitle: finalSeoTitle(),
      metaDescription: finalDescription(),
      slug: cfg.hasSlug === false || cfg.checkSlug === false ? undefined : slug(),
      html: contentHtml(),
      type: cfg.type || "post",
      usedElsewhere: used,
    });
    bar($('[data-seo-bar="title"]'), result.stats.titleWidth, 300, result.stats.titleMaxWidth);
    bar($('[data-seo-bar="desc"]'), finalDescription().length, 120, 156);
    var tc = $('[data-seo-count="title"]'); if (tc) tc.textContent = finalSeoTitle().length + " characters";
    var usingFallback = !(descInput && descInput.value.trim()) && finalDescription();
    var dc = $('[data-seo-count="desc"]'); if (dc) dc.textContent = finalDescription().length + " / 156 characters" + (usingFallback ? " (automatic — type your own to improve it)" : "");
    renderPreview();
    renderList($('[data-seo-results="seo"]'), result.seo);
    renderList($('[data-seo-results="readability"]'), result.readability);
    setTabDot("seo", result.seoScore);
    setTabDot("readability", result.readabilityScore);
    var wc = $("[data-seo-words]"); if (wc) wc.textContent = result.stats.words.toLocaleString("en-US") + " words";
    return result;
  }

  /* ---------- tabs ---------- */
  panel.querySelectorAll("[data-seo-tab]").forEach(function (tab) {
    tab.addEventListener("click", function () {
      var name = tab.getAttribute("data-seo-tab");
      panel.querySelectorAll("[data-seo-tab]").forEach(function (t) { t.setAttribute("aria-selected", t === tab ? "true" : "false"); });
      panel.querySelectorAll("[data-seo-pane]").forEach(function (p) { p.hidden = p.getAttribute("data-seo-pane") !== name; });
    });
  });

  /* ---------- live updates ---------- */
  var timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(run, 300); }
  form.addEventListener("input", schedule);
  form.addEventListener("change", schedule);
  setInterval(run, 4000); // catches editor changes that don't fire input events
  window.SeoPanel = { refresh: schedule, run: run };
  // Keyphrases used on other pages (for the "previously used" check).
  if (cfg.usedUrl) {
    fetch(cfg.usedUrl, { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (map) { cfg.used = map || {}; run(); }).catch(function () {});
  }
  run();
})();
