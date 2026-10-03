/**
 * Shared page chrome for EVERY public page — home, listings, tour, post and
 * the hand-written pages in /pages. Change the header, drawer, footer or the
 * common <head> tags here once instead of in 13 copies.
 */
const { esc } = require("../utils");
const { assetV } = require("./assetVersion");
const { currentSiteInfo, telHref } = require("../lib/siteInfo");
const { BRAND } = require("../siteConfig");

const FONTS_URL = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap";

const NAV = [
  { href: "/tours", label: "Tours" },
  { href: "/destinations", label: "Destinations" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

/** Favicons, theme color, fonts (non-blocking) and the two core stylesheets + any page CSS. */
function headBoilerplate(extraCss = []) {
  const v = assetV();
  return `<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="mask-icon" href="/safari-pinned-tab.svg" color="#0B3B4F">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#0B3B4F">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="${FONTS_URL}">
<link rel="stylesheet" href="${FONTS_URL}" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="${FONTS_URL}"></noscript>
<link rel="stylesheet" href="/css/tokens.css?v=${v}">
<link rel="stylesheet" href="/css/style.css?v=${v}">
${extraCss.map((name) => `<link rel="stylesheet" href="/css/${name}.css?v=${v}">`).join("\n")}`;
}

/** <script> tags for the site's own JS files, cache-busted. */
function scriptTags(names = []) {
  const v = assetV();
  return names.map((name) => `<script src="/js/${name}.js?v=${v}"></script>`).join("\n");
}

function logoHtml(extraClass = "") {
  return `<span class="logo${extraClass ? " " + extraClass : ""}"><span class="part-1">Tripreview</span><span class="part-2">all</span></span>`;
}

function siteHeader() {
  const info = currentSiteInfo();
  return `<a href="#main" class="skip-link">Skip to content</a>

<header class="site-header">
  <div class="container header-inner">
    <a href="/" class="logo" aria-label="${BRAND} home"><span class="part-1">Tripreview</span><span class="part-2">all</span></a>
    <nav class="main-nav" aria-label="Primary">
      ${NAV.map((n) => `<a href="${n.href}">${n.label}</a>`).join("\n      ")}
    </nav>
    <div class="header-actions">
      <button class="hamburger" data-drawer-open aria-label="Open menu" aria-expanded="false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
      </button>
    </div>
  </div>
</header>

<div class="mobile-drawer">
  <div class="mobile-drawer-backdrop" data-drawer-backdrop></div>
  <div class="mobile-drawer-panel" role="dialog" aria-modal="true" aria-label="Site menu">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      ${logoHtml()}
      <button class="close-btn" data-drawer-close aria-label="Close menu">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
    <nav>
      ${NAV.map((n) => `<a href="${n.href}" class="mobile-nav-link">${n.label}</a>`).join("\n      ")}
    </nav>
    <a href="/tours" class="btn btn-secondary btn-full" style="margin-top:16px;">Browse Tours</a>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--color-border);font-size:14px;color:var(--color-text-muted);">
      <div><a href="tel:${esc(telHref(info.phone))}" style="color:inherit;">${esc(info.phone)}</a></div>
      ${info.hours ? `<div style="margin-top:4px;">${esc(info.hours)}</div>` : ""}
    </div>
  </div>
</div>`;
}

function siteFooter() {
  const info = currentSiteInfo();
  const year = new Date().getFullYear();
  return `<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div>
        ${logoHtml("reversed")}
        <p class="footer-tagline">Independent Hawaii tour reviews — five-star and one-star alike.</p>
      </div>
      <div class="footer-col"><h4>Explore</h4><a href="/tours">Tours</a><a href="/destinations">Destinations</a><a href="/blog">Blog</a><a href="/transportation">Transportation</a></div>
      <div class="footer-col"><h4>Company</h4><a href="/about">About</a><a href="/contact">Contact</a><a href="/affiliate-disclosure">Affiliate Disclosure</a><a href="/privacy-policy">Privacy Policy</a></div>
      <div class="footer-col"><h4>Contact Us</h4>
        <div class="footer-contact-row"><a href="tel:${esc(telHref(info.phone))}">${esc(info.phone)}</a></div>
        <div class="footer-contact-row"><a href="mailto:${esc(info.email)}">${esc(info.email)}</a></div>
      </div>
    </div>
    <div class="footer-disclosure">${BRAND} earns a commission when you book through links on this site (FareHarbor, Viator, GetYourGuide, TripAdvisor). This never affects which reviews we show or how we rate a tour.</div>
    <div class="footer-bottom"><span>© ${year} ${BRAND}, operated by ${esc(info.operatorName)}. All rights reserved.</span></div>
  </div>
</footer>`;
}

module.exports = { headBoilerplate, scriptTags, siteHeader, siteFooter, FONTS_URL };
