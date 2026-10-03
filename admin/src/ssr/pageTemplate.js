/**
 * Renders the hand-written pages in admin/pages (About, Contact, Privacy, 404…)
 * into full HTML files in the site root, wrapped in the shared head, header
 * and footer from layout.js.
 *
 * Source format (admin/pages/<name>.html):
 *
 *   <!--page
 *   output: about.html                 file written under SITE_ROOT
 *   title: About Tripreviewall …
 *   description: …
 *   path: /about                       canonical path (leave empty for 404)
 *   robots: noindex, follow            optional
 *   ogType: website                    optional (website | article)
 *   css: pages, transportation         optional extra stylesheets from /css
 *   scripts: transportation            optional extra scripts from /js (main.js is always loaded)
 *   -->
 *   <!--head--> …extra <head> HTML (JSON-LD)… <!--/head-->   optional
 *   <main id="main"> … </main>
 *   <!--scripts--> …inline <script> blocks… <!--/scripts-->   optional
 *
 * Tokens replaced in the body:
 *   {{phone}} {{phoneHref}} {{email}} {{hours}} {{address}} {{operatorName}} {{year}}
 *   {{inlineTourCard:<tour-slug>}}  {{sidebarTourCard:<tour-slug>}}
 *   {{relatedPosts:<slug-to-exclude>}}  {{islandCards}}
 */
const { esc } = require("../utils");
const { SITE_URL, BRAND } = require("../siteConfig");
const { currentSiteInfo, telHref } = require("../lib/siteInfo");
const { headBoilerplate, scriptTags, siteHeader, siteFooter } = require("./layout");
const { ISLANDS } = require("./islands");
const { inlineTourCardHtml, sidebarTourCardInner, relatedArticlesHtml } = require("./postTemplate");

function parsePageSource(raw) {
  const m = raw.match(/^\s*<!--page\s*\n([\s\S]*?)\n-->\s*\n?/);
  if (!m) throw new Error("missing <!--page … --> header");
  const meta = {};
  m[1].split("\n").forEach((line) => {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  });
  let rest = raw.slice(m[0].length);
  let headExtra = "";
  let inlineScripts = "";
  rest = rest.replace(/<!--head-->\n?([\s\S]*?)<!--\/head-->\n?/, (_, h) => { headExtra = h.trim(); return ""; });
  rest = rest.replace(/<!--scripts-->\n?([\s\S]*?)<!--\/scripts-->\n?/, (_, sc) => { inlineScripts = sc.trim(); return ""; });
  const list = (v) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean) : []);
  if (!meta.output || !/^[\w./-]+\.html$/.test(meta.output) || meta.output.includes("..")) throw new Error(`bad "output" (${meta.output})`);
  return {
    output: meta.output,
    title: meta.title || BRAND,
    description: meta.description || "",
    path: meta.path || "",
    robots: meta.robots || "",
    ogType: meta.ogType || "website",
    css: list(meta.css),
    scripts: list(meta.scripts),
    headExtra,
    body: rest.trim(),
    inlineScripts,
  };
}

function islandCardsHtml() {
  return ISLANDS.map((isl) => `
        <a class="nf-island" href="/destinations/${esc(isl.slug)}" style="background:${isl.gradient};"><span>${esc(isl.name)}${isl.tagline ? `<small>${esc(isl.tagline)}</small>` : ""}</span></a>`).join("");
}

/**
 * ctx = { toursBySlug: { slug: publicTour }, posts: [publicPost…] }
 */
function applyTokens(html, ctx) {
  const info = currentSiteInfo();
  const simple = {
    phone: esc(info.phone),
    phoneHref: esc(telHref(info.phone)),
    email: esc(info.email),
    hours: esc(info.hours || ""),
    address: esc(info.address || ""),
    operatorName: esc(info.operatorName),
    year: String(new Date().getFullYear()),
  };
  return html.replace(/\{\{(\w+)(?::([\w-]*))?\}\}/g, (match, name, arg) => {
    if (Object.prototype.hasOwnProperty.call(simple, name)) return simple[name];
    if (name === "inlineTourCard") return inlineTourCardHtml((ctx.toursBySlug || {})[arg]) || "";
    if (name === "sidebarTourCard") return sidebarTourCardInner((ctx.toursBySlug || {})[arg]) || "";
    if (name === "relatedPosts") {
      const list = (ctx.posts || []).filter((p) => p.slug !== arg)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 3);
      return relatedArticlesHtml(list);
    }
    if (name === "islandCards") return islandCardsHtml();
    console.error(`[pages] unknown token ${match}`);
    return "";
  });
}

function renderStaticPage(page, ctx = {}) {
  const canonical = page.path ? `${SITE_URL}${page.path}` : "";
  const title = esc(page.title.replace(/&amp;/g, "&"));
  const description = esc(page.description.replace(/&amp;/g, "&"));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">
${page.robots ? `<meta name="robots" content="${esc(page.robots)}">\n` : ""}${canonical ? `<link rel="canonical" href="${canonical}">\n` : ""}<meta property="og:type" content="${esc(page.ogType)}">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
${canonical ? `<meta property="og:url" content="${canonical}">\n` : ""}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
${page.headExtra ? page.headExtra + "\n" : ""}${headBoilerplate(page.css)}
</head>
<body>
${siteHeader()}

${applyTokens(page.body, ctx)}

${siteFooter()}

${scriptTags(["main", ...page.scripts])}
${page.inlineScripts}
</body>
</html>`;
}

module.exports = { parsePageSource, renderStaticPage, applyTokens };
