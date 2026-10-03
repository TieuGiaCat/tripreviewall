/* ============================================================
   tripreviewall.com — blog article page
   Counts clicks on booking links pasted inside the article text
   (FareHarbor, GetYourGuide, Viator, TripAdvisor). The link itself
   is left untouched — it goes straight to the partner, so FareHarbor's
   pop-up still works — and the click is reported in the background.
   ============================================================ */
(function () {
  var PLATFORMS = [
    ["fareharbor.com", "fareharbor"],
    ["getyourguide.com", "getyourguide"],
    ["viator.com", "viator"],
    ["tripadvisor.com", "tripadvisor"],
  ];

  function platformOf(link) {
    var host = (link.hostname || "").toLowerCase();
    for (var i = 0; i < PLATFORMS.length; i++) {
      var d = PLATFORMS[i][0];
      if (host === d || host.slice(-(d.length + 1)) === "." + d) return PLATFORMS[i][1];
    }
    return null;
  }

  function report(link) {
    var article = link.closest("[data-post-slug]");
    var platform = platformOf(link);
    if (!article || !platform) return;
    var url = "/api/log-click?post=" + encodeURIComponent(article.getAttribute("data-post-slug")) +
      "&platform=" + platform;
    if (navigator.sendBeacon) navigator.sendBeacon(url);
    else fetch(url, { method: "POST", keepalive: true }).catch(function () {});
  }

  // "click" covers mouse, touch and Enter; middle-click opens a new tab via "auxclick".
  ["click", "auxclick"].forEach(function (type) {
    document.addEventListener(type, function (e) {
      if (type === "auxclick" && e.button !== 1) return;
      var link = e.target.closest && e.target.closest("a[href]");
      if (link) report(link);
    });
  });
})();
