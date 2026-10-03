/**
 * Allow-list HTML sanitizer for blog post bodies (Quill editor output).
 *
 * It does NOT try to strip "bad" things out of the input. Instead it tokenizes
 * the HTML and rebuilds it from scratch, emitting only tags and attributes on
 * the allow-list below. Anything else is dropped (tags) or escaped (stray "<").
 * <script>/<style>/etc. are removed together with their contents, every on*
 * attribute and style attribute is dropped, and href/src must be http(s),
 * mailto:, tel:, a site-relative path or an #anchor.
 *
 * Bonus: links to affiliate platforms automatically get
 * rel="sponsored noopener" target="_blank".
 */

const ALLOWED_TAGS = {
  p: [], br: [], hr: [],
  h2: ["id"], h3: ["id"], h4: ["id"], h5: ["id"], h6: ["id"],
  strong: [], b: [], em: [], i: [], u: [], s: [], sub: [], sup: [], mark: [], small: [],
  a: ["href", "title", "target", "rel"],
  ul: [], ol: ["start"], li: [],
  blockquote: [], pre: [], code: [],
  img: ["src", "alt", "width", "height", "title", "loading"],
  figure: [], figcaption: [],
  table: [], thead: [], tbody: [], tfoot: [], tr: [], th: ["colspan", "rowspan", "scope"], td: ["colspan", "rowspan"],
  span: [], div: [],
  iframe: ["src", "width", "height", "title", "allowfullscreen", "frameborder", "allow"],
};
// "class" is allowed on every tag (Quill uses ql-align-*, ql-indent-*, ql-video…).
const GLOBAL_ATTRS = ["class"];
const VOID_TAGS = new Set(["br", "hr", "img"]);
// Removed together with everything inside them.
const DROP_WITH_CONTENT = new Set(["script", "style", "noscript", "template", "object", "embed", "svg", "math", "textarea", "select", "button", "form", "head", "title"]);
const IFRAME_HOSTS = ["www.youtube.com", "youtube.com", "www.youtube-nocookie.com", "player.vimeo.com", "www.google.com"];
const AFFILIATE_DOMAINS = ["fareharbor.com", "tripadvisor.com", "getyourguide.com", "viator.com"];

function escapeText(s) {
  return s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s) {
  return String(s).replace(/&(?!(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function decodeEntitiesLoose(s) {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (m, d) => String.fromCharCode(Number(d)))
    .replace(/&colon;/gi, ":").replace(/&tab;/gi, "\t").replace(/&newline;/gi, "\n").replace(/&amp;/gi, "&");
}

function safeUrl(raw, { forIframe = false } = {}) {
  const value = String(raw || "").trim();
  // Browsers ignore control chars/whitespace inside the scheme ("java\tscript:") — check a normalized copy.
  const probe = decodeEntitiesLoose(value).replace(/[\u0000- \u007f-\u009f]+/g, "").toLowerCase();
  if (forIframe) {
    try {
      const u = new URL(decodeEntitiesLoose(value));
      return u.protocol === "https:" && IFRAME_HOSTS.includes(u.hostname) ? value : null;
    } catch (e) { return null; }
  }
  if (probe.startsWith("#") || (probe.startsWith("/") && !probe.startsWith("//"))) return value;
  if (/^(https?:|mailto:|tel:)/.test(probe)) return value;
  if (!/^[a-z][a-z0-9+.-]*:/.test(probe) && !probe.startsWith("//")) return value; // plain relative path
  return null;
}

function isAffiliateUrl(href) {
  try {
    const host = new URL(href).hostname.toLowerCase();
    return AFFILIATE_DOMAINS.some((d) => host === d || host.endsWith("." + d));
  } catch (e) { return false; }
}

const ATTR_RE = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function buildTag(name, rawAttrs, selfClosing) {
  const allowed = ALLOWED_TAGS[name];
  const out = [];
  let href = null;
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(rawAttrs || ""))) {
    const attr = m[1].toLowerCase();
    let value = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : "";
    if (!allowed.includes(attr) && !GLOBAL_ATTRS.includes(attr)) continue;
    if (attr === "href" || attr === "src") {
      const ok = safeUrl(value, { forIframe: name === "iframe" && attr === "src" });
      if (!ok) continue;
      value = ok;
      if (attr === "href") href = value;
    }
    if (attr === "target" && value !== "_blank") continue;
    if (attr === "rel") continue; // rebuilt below
    if (attr === "allowfullscreen") { out.push("allowfullscreen"); continue; }
    out.push(`${attr}="${escapeAttr(value)}"`);
  }
  if (name === "iframe" && !out.some((a) => a.startsWith("src="))) return ""; // no safe src → drop the embed
  if (name === "a") {
    if (href && isAffiliateUrl(href)) {
      if (!out.some((a) => a.startsWith("target="))) out.push('target="_blank"');
      out.push('rel="sponsored noopener"');
    } else if (out.some((a) => a.startsWith("target="))) {
      out.push('rel="noopener"');
    }
  }
  if (name === "img" && !out.some((a) => a.startsWith("loading="))) out.push('loading="lazy"');
  return `<${name}${out.length ? " " + out.join(" ") : ""}${selfClosing && VOID_TAGS.has(name) ? "" : ""}>`;
}

const TOKEN_RE = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;

function sanitizeHtml(input) {
  if (!input) return "";
  const html = String(input);
  let out = "";
  let last = 0;
  let dropDepth = 0;
  let dropTag = null;
  const open = []; // stack of open allowed tags, to close anything left dangling
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(html))) {
    const text = html.slice(last, m.index);
    if (!dropDepth && text) out += escapeText(text);
    last = TOKEN_RE.lastIndex;
    if (!m[2]) continue; // comment / doctype / cdata → dropped
    const closing = m[1] === "/";
    const name = m[2].toLowerCase();

    if (DROP_WITH_CONTENT.has(name)) {
      if (!closing && !m[4]) {
        if (!dropDepth) dropTag = name;
        if (name === dropTag) dropDepth++;
      } else if (closing && name === dropTag && dropDepth) {
        dropDepth--;
        if (!dropDepth) dropTag = null;
      }
      continue;
    }
    if (dropDepth) continue;
    if (!ALLOWED_TAGS[name]) continue; // unknown tag: drop the tag, keep its text

    if (closing) {
      if (VOID_TAGS.has(name)) continue;
      const idx = open.lastIndexOf(name);
      if (idx === -1) continue;
      while (open.length > idx) out += `</${open.pop()}>`;
      continue;
    }
    const tag = buildTag(name, m[3], m[4] === "/");
    if (!tag) continue;
    out += tag;
    if (name === "iframe") { out += "</iframe>"; continue; }
    if (!VOID_TAGS.has(name)) open.push(name);
  }
  if (!dropDepth) out += escapeText(html.slice(last));
  while (open.length) out += `</${open.pop()}>`;
  return out;
}

module.exports = { sanitizeHtml, safeUrl };
