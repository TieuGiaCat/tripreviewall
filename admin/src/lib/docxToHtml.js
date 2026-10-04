/**
 * Word (.docx) → Tripreviewall article HTML.
 *
 * No external packages: a .docx is a zip of XML files, so this file has a
 * tiny zip reader (zlib does the decompression) and a tiny XML parser.
 *
 * Two stages:
 *  1. Faithful conversion: headings, paragraphs, bold/italic/underline,
 *     links, bullet/numbered lists (nested), tables, embedded images.
 *     Everything Word adds for looks — fonts, colours, sizes, shading — is
 *     dropped on purpose: the site's own stylesheet decides how it looks.
 *  2. Site formatting ("smart blocks"), so a writer's draft comes out in the
 *     Tripreviewall article style without hand-editing:
 *       • first Heading 1 → the post title (removed from the body)
 *       • "Slug: … Meta description: … Focus keyphrase: … Byline: …" line
 *         → filled into the form fields (removed from the body)
 *       • "[IMAGE 3 — … Alt text: “…”]" notes → image slots: hidden on the
 *         live page, listed in the import report so photos can be added
 *       • a fully-bold paragraph near the top → "Quick answer" box
 *       • "Our stance:", "Bottom line:", "Tip:", "Warning:", "Note:" … → callouts
 *       • FAQ section → question/answer blocks
 *       • "Read next" + link lines → a related-reading box
 *       • tables → scrollable, striped comparison tables
 *       • links with no address (about:blank) → matched to our own pages
 *         where possible, otherwise flagged "#needs-link"
 *
 * docxToArticle(buffer, { linkTargets, saveImage }) → { html, fields, report }
 */
const zlib = require("zlib");

/* ============================================================
   1. Zip reader
   ============================================================ */
const MAX_UNZIPPED = 60 * 1024 * 1024; // refuse zip bombs

function readZip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error("Not a .docx file (too small).");
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a .docx file (no zip directory found). Save it from Word or Google Docs as .docx.");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Damaged .docx (bad zip entry).");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
    total += size;
    if (total > MAX_UNZIPPED) throw new Error("This .docx is too large once unpacked.");
    files[name] = () => {
      const lnLen = buf.readUInt16LE(localOffset + 26);
      const lxLen = buf.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + lnLen + lxLen;
      const raw = buf.slice(start, start + compSize);
      if (method === 0) return raw;
      if (method === 8) return zlib.inflateRawSync(raw, { maxOutputLength: Math.max(size, 1) + 1024 });
      throw new Error(`Unsupported compression in ${name}.`);
    };
  }
  return files;
}

/* ============================================================
   2. Minimal XML parser → { name, attrs, children } / text strings
   ============================================================ */
const XML_ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function xmlDecode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return XML_ENT[e] || m;
  });
}
function parseXml(xml) {
  const root = { name: "#root", attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) { top.children.push(m[1]); continue; }
    if (m[6] !== undefined) { top.children.push(xmlDecode(m[6])); continue; }
    if (!m[3]) continue; // comment / declaration
    if (m[2] === "/") {
      // Pop to the matching element (tolerates slightly malformed XML).
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].name === m[3]) { stack.length = i; break; }
      continue;
    }
    const attrs = {};
    const aRe = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a;
    while ((a = aRe.exec(m[4] || ""))) attrs[a[1]] = xmlDecode(a[3] !== undefined ? a[3] : a[4]);
    const el = { name: m[3], attrs, children: [] };
    top.children.push(el);
    if (!m[5]) stack.push(el);
  }
  return root;
}
const kids = (el, name) => (el && el.children ? el.children.filter((c) => typeof c === "object" && (!name || c.name === name)) : []);
const kid = (el, name) => kids(el, name)[0] || null;
function find(el, name, out = []) {
  if (!el || typeof el !== "object") return out;
  for (const c of el.children) {
    if (typeof c !== "object") continue;
    if (c.name === name) out.push(c);
    find(c, name, out);
  }
  return out;
}
const on = (el) => !!el && !["0", "false", "off", "none"].includes(String(el.attrs["w:val"] ?? "true").toLowerCase());

/* ============================================================
   3. Word document → neutral blocks
   ============================================================ */
const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => escHtml(s).replace(/"/g, "&quot;");

function loadStyles(files) {
  const styles = {};
  if (!files["word/styles.xml"]) return styles;
  const tree = parseXml(files["word/styles.xml"]().toString("utf8"));
  find(tree, "w:style").forEach((s) => {
    const id = s.attrs["w:styleId"];
    const name = (kid(s, "w:name") || { attrs: {} }).attrs["w:val"] || "";
    const basedOn = (kid(s, "w:basedOn") || { attrs: {} }).attrs["w:val"] || "";
    const ppr = kid(s, "w:pPr");
    const outline = ppr && kid(ppr, "w:outlineLvl") ? Number(kid(ppr, "w:outlineLvl").attrs["w:val"]) : null;
    styles[id] = { name: name.toLowerCase(), basedOn, outline };
  });
  return styles;
}
function headingLevel(styleId, styles, ppr) {
  const outline = ppr && kid(ppr, "w:outlineLvl") ? Number(kid(ppr, "w:outlineLvl").attrs["w:val"]) : null;
  if (outline != null && outline < 6) return outline + 1;
  let id = styleId, guard = 0;
  while (id && guard++ < 10) {
    const st = styles[id];
    const name = st ? st.name : id.toLowerCase();
    const m = name.match(/^heading\s*(\d)$/) || String(id).match(/^Heading(\d)$/i);
    if (m) return Number(m[1]);
    if (name === "title") return 1;
    if (name === "subtitle") return 2;
    if (st && st.outline != null && st.outline < 6) return st.outline + 1;
    id = st && st.basedOn;
  }
  return 0;
}
function isQuoteStyle(styleId, styles) {
  const st = styles[styleId];
  return /quote/i.test((st && st.name) || styleId || "");
}

function loadNumbering(files) {
  const fmt = {}; // numId → { ilvl: "bullet" | "decimal" … }
  if (!files["word/numbering.xml"]) return fmt;
  const tree = parseXml(files["word/numbering.xml"]().toString("utf8"));
  const abstract = {};
  find(tree, "w:abstractNum").forEach((an) => {
    const levels = {};
    kids(an, "w:lvl").forEach((l) => { levels[l.attrs["w:ilvl"]] = (kid(l, "w:numFmt") || { attrs: {} }).attrs["w:val"] || "bullet"; });
    abstract[an.attrs["w:abstractNumId"]] = levels;
  });
  find(tree, "w:num").forEach((n) => {
    const a = kid(n, "w:abstractNumId");
    if (a) fmt[n.attrs["w:numId"]] = abstract[a.attrs["w:val"]] || {};
  });
  return fmt;
}

function loadRels(files) {
  const rels = {};
  const f = files["word/_rels/document.xml.rels"];
  if (!f) return rels;
  find(parseXml(f().toString("utf8")), "Relationship").forEach((r) => {
    rels[r.attrs.Id] = { target: r.attrs.Target || "", external: r.attrs.TargetMode === "External", type: r.attrs.Type || "" };
  });
  return rels;
}

/** Runs of one paragraph → [{ text, b, i, u, s, sup, sub, href, br, image }] */
function paragraphRuns(p, ctx, link = null) {
  const out = [];
  for (const c of p.children) {
    if (typeof c !== "object") continue;
    if (c.name === "w:hyperlink") {
      let href = "";
      if (c.attrs["r:id"] && ctx.rels[c.attrs["r:id"]]) href = ctx.rels[c.attrs["r:id"]].target;
      else if (c.attrs["w:anchor"]) href = "#" + c.attrs["w:anchor"];
      out.push(...paragraphRuns(c, ctx, { href }));
    } else if (c.name === "w:r") {
      const rpr = kid(c, "w:rPr");
      const vert = rpr && kid(rpr, "w:vertAlign") ? kid(rpr, "w:vertAlign").attrs["w:val"] : "";
      const fmt = {
        b: rpr ? on(kid(rpr, "w:b")) : false,
        i: rpr ? on(kid(rpr, "w:i")) : false,
        u: rpr ? (kid(rpr, "w:u") ? !["none", "0", "false"].includes(kid(rpr, "w:u").attrs["w:val"] || "single") : false) : false,
        s: rpr ? on(kid(rpr, "w:strike")) : false,
        sup: vert === "superscript", sub: vert === "subscript",
        href: link ? link.href : null,
      };
      for (const r of c.children) {
        if (typeof r !== "object") continue;
        if (r.name === "w:t") out.push({ ...fmt, text: r.children.filter((x) => typeof x === "string").join("") });
        else if (r.name === "w:tab") out.push({ ...fmt, text: " " });
        else if (r.name === "w:br" || r.name === "w:cr") out.push({ ...fmt, text: "", br: true });
        else if (r.name === "w:drawing" || r.name === "w:pict") {
          const blip = find(r, "a:blip")[0] || find(r, "v:imagedata")[0];
          const docPr = find(r, "wp:docPr")[0];
          const rid = blip && (blip.attrs["r:embed"] || blip.attrs["r:id"]);
          if (rid && ctx.rels[rid]) out.push({ image: { target: ctx.rels[rid].target, alt: docPr ? (docPr.attrs.descr || docPr.attrs.title || "") : "" } });
        }
      }
    } else if (c.name === "w:smartTag" || c.name === "w:sdt" || c.name === "w:sdtContent" || c.name === "w:ins" || c.name === "w:fldSimple") {
      out.push(...paragraphRuns(c, ctx, link));
    }
  }
  return out;
}

function runsToHtml(runs, ctx) {
  // Merge neighbours with identical formatting, then render.
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && !r.br && !r.image && !last.br && !last.image &&
        ["b", "i", "u", "s", "sup", "sub", "href"].every((k) => last[k] === r[k])) last.text += r.text;
    else merged.push({ ...r });
  }
  let html = "";
  for (const r of merged) {
    if (r.image) { html += ctx.renderImage(r.image); continue; }
    if (r.br) { html += "<br>"; continue; }
    if (!r.text) continue;
    // Keep surrounding spaces outside the tags: "<strong>Tip:</strong> text".
    const lead = r.text.match(/^\s*/)[0], trail = r.text.match(/\s*$/)[0];
    let t = escHtml(r.text.trim());
    if (!t) { html += escHtml(r.text); continue; }
    if (r.sup) t = `<sup>${t}</sup>`;
    if (r.sub) t = `<sub>${t}</sub>`;
    if (r.s) t = `<s>${t}</s>`;
    if (r.u && !r.href) t = `<u>${t}</u>`;
    if (r.i) t = `<em>${t}</em>`;
    if (r.b) t = `<strong>${t}</strong>`;
    if (r.href != null) t = `<a href="${escAttr(ctx.resolveLink(r.href, r.text.trim()))}">${t}</a>`;
    html += escHtml(lead) + t + escHtml(trail);
  }
  return html.replace(/<\/strong>(\s*)<strong>/g, "$1").replace(/<\/em>(\s*)<em>/g, "$1").trim();
}

function plain(runs) { return runs.map((r) => (r.br ? " " : r.text || "")).join("").replace(/\s+/g, " ").trim(); }
function boldShare(runs) {
  const total = runs.reduce((n, r) => n + (r.text || "").trim().length, 0);
  const bold = runs.reduce((n, r) => n + (r.b ? (r.text || "").trim().length : 0), 0);
  return total ? bold / total : 0;
}

function bodyBlocks(body, ctx) {
  const blocks = [];
  for (const el of body.children) {
    if (typeof el !== "object") continue;
    if (el.name === "w:p") {
      const ppr = kid(el, "w:pPr");
      const styleId = ppr && kid(ppr, "w:pStyle") ? kid(ppr, "w:pStyle").attrs["w:val"] : "";
      const runs = paragraphRuns(el, ctx);
      const text = plain(runs);
      const hasImage = runs.some((r) => r.image);
      if (!text && !hasImage) continue;
      const numPr = ppr && kid(ppr, "w:numPr");
      const level = headingLevel(styleId, ctx.styles, ppr);
      const block = { type: "p", runs, text, boldShare: boldShare(runs) };
      if (level) Object.assign(block, { type: "h", level });
      else if (numPr && kid(numPr, "w:numId") && kid(numPr, "w:numId").attrs["w:val"] !== "0") {
        const numId = kid(numPr, "w:numId").attrs["w:val"];
        const ilvl = kid(numPr, "w:ilvl") ? Number(kid(numPr, "w:ilvl").attrs["w:val"]) : 0;
        const f = (ctx.numbering[numId] || {})[String(ilvl)] || "bullet";
        Object.assign(block, { type: "li", numId, ilvl, ordered: f !== "bullet" && f !== "none" });
      } else if (isQuoteStyle(styleId, ctx.styles)) block.type = "quote";
      blocks.push(block);
    } else if (el.name === "w:tbl") {
      const rows = kids(el, "w:tr").map((tr) => {
        const trpr = kid(tr, "w:trPr");
        return {
          header: !!(trpr && kid(trpr, "w:tblHeader")),
          cells: kids(tr, "w:tc").map((tc) => {
            const tcpr = kid(tc, "w:tcPr");
            const span = tcpr && kid(tcpr, "w:gridSpan") ? Number(kid(tcpr, "w:gridSpan").attrs["w:val"]) : 1;
            const vmerge = tcpr && kid(tcpr, "w:vMerge");
            const paras = kids(tc, "w:p").map((p) => paragraphRuns(p, ctx)).filter((r) => plain(r) || r.some((x) => x.image));
            return { span, vcontinue: !!vmerge && vmerge.attrs["w:val"] !== "restart", paras };
          }),
        };
      });
      blocks.push({ type: "table", rows });
    } else if (el.name === "w:sdt") {
      const content = kid(el, "w:sdtContent");
      if (content) blocks.push(...bodyBlocks(content, ctx));
    }
  }
  return blocks;
}

/* ============================================================
   4. Site formatting
   ============================================================ */
const META_LABELS = {
  slug: /^(slug|url)$/i,
  metaTitle: /^(meta title|seo title|title tag)$/i,
  metaDescription: /^(meta description|meta desc|description)$/i,
  focusKeyphrase: /^(focus keyphrase|focus keyword|focus key phrase|keyphrase|primary keyword|main keyword|keyword)$/i,
  byline: /^(byline|author)$/i,
  excerpt: /^(excerpt|summary)$/i,
  category: /^(category)$/i,
  island: /^(island)$/i,
};
function parseMetaParagraph(block) {
  // Split on bold labels ("Slug:") — or plain "Label:" at line starts.
  const segs = [];
  let cur = null;
  for (const r of block.runs) {
    const t = r.text || "";
    const lab = r.b && t.trim().match(/^(.{2,30}?):\s*$/);
    if (lab) { cur = { label: lab[1].trim(), value: "" }; segs.push(cur); continue; }
    if (cur) cur.value += r.br ? " " : t;
  }
  if (!segs.length) {
    const re = /(Slug|URL|Meta title|SEO title|Meta description|Focus keyphrase|Focus keyword|Keyword|Byline|Excerpt|Category|Island)\s*:\s*/gi;
    const parts = block.text.split(re);
    for (let i = 1; i < parts.length; i += 2) segs.push({ label: parts[i], value: parts[i + 1] || "" });
  }
  const fields = {};
  let known = 0;
  segs.forEach((s) => {
    const key = Object.keys(META_LABELS).find((k) => META_LABELS[k].test(s.label.trim()));
    if (key) { fields[key] = s.value.replace(/\s+/g, " ").trim(); known++; }
  });
  return known >= 1 && (fields.slug || fields.metaDescription || fields.focusKeyphrase || known >= 2) ? fields : null;
}

const IMAGE_NOTE = /^\[\s*(?:image|photo|img|picture)\s*(\d+)?\s*[—–\-:]\s*([\s\S]*)\]$/i;
function parseImageNote(text) {
  const m = text.trim().match(IMAGE_NOTE);
  if (!m) return null;
  const body = m[2];
  const alt = (body.match(/alt(?:\s*text)?\s*:\s*[“"]([^”"]+)[”"]/i) || body.match(/alt(?:\s*text)?\s*:\s*([^.]+)\./i) || [])[1] || "";
  const caption = (body.match(/caption\s*:\s*([^\]]+?)\.?\s*$/i) || [])[1] || "";
  const description = body.split(/\balt(?:\s*text)?\s*:/i)[0].replace(/[.\s]+$/, "").trim();
  return { n: m[1] ? Number(m[1]) : null, description, alt: alt.trim(), caption: caption.trim() };
}

const CALLOUTS = [
  { re: /^(our (stance|verdict|take|pick)|the verdict|verdict|bottom line|the bottom line|our recommendation|recommendation)\b/i, cls: "callout-verdict" },
  { re: /^(pro tip|tip|insider tip|local tip|good to know|money[- ]saving tip)\b/i, cls: "callout-tip" },
  { re: /^(warning|caution|danger|safety|important|heads up|skip it)\b/i, cls: "callout-warning" },
  { re: /^(note|when it rains|if it rains|budget|cost|time|best for)\b/i, cls: "callout-note" },
];
function calloutFor(block) {
  if (block.type !== "p") return null;
  const first = block.runs.find((r) => (r.text || "").trim());
  if (!first || !first.b) return null;
  const lead = first.text.trim();
  if (!/:$/.test(lead) && !/^[^.]{2,40}:/.test(lead)) return null;
  const hit = CALLOUTS.find((c) => c.re.test(lead));
  return hit ? hit.cls : null;
}

function docxToArticle(buffer, opts = {}) {
  const files = readZip(buffer);
  if (!files["word/document.xml"]) throw new Error("This file has no Word document inside. Is it really a .docx?");
  const report = { headings: 0, paragraphs: 0, lists: 0, tables: 0, images: 0, imageSlots: [], linksMatched: [], linksMissing: [], callouts: 0, faq: 0, warnings: [] };
  const linkTargets = opts.linkTargets || [];
  const ctx = {
    styles: loadStyles(files),
    numbering: loadNumbering(files),
    rels: loadRels(files),
    resolveLink(href, text) {
      const h = String(href || "").trim();
      if (h && !/^about:blank$/i.test(h) && h !== "#") return h;
      const found = matchLink(text, linkTargets);
      if (found) { report.linksMatched.push({ text, href: found.href, label: found.label }); return found.href; }
      report.linksMissing.push(text);
      return "#needs-link";
    },
    renderImage(img) {
      report.images++;
      const target = img.target.replace(/^\/+/, "");
      const path = target.startsWith("word/") ? target : "word/" + target;
      let src = "";
      if (opts.saveImage && files[path]) {
        try { src = opts.saveImage(files[path](), path.split("/").pop()); } catch (e) { report.warnings.push(`Image ${path} could not be saved: ${e.message}`); }
      }
      if (!src) {
        report.imageSlots.push({ n: report.imageSlots.length + 1, description: "Embedded image from the Word file", alt: img.alt, caption: "" });
        return `<span class="image-slot-inline">[image]</span>`;
      }
      return `<img src="${escAttr(src)}" alt="${escAttr(img.alt || "")}">`;
    },
  };
  const doc = parseXml(files["word/document.xml"]().toString("utf8"));
  const body = find(doc, "w:body")[0];
  if (!body) throw new Error("Empty Word document.");
  let blocks = bodyBlocks(body, ctx);

  /* ---- title + meta line ---- */
  const fields = {};
  const h1 = blocks.findIndex((b) => b.type === "h" && b.level === 1);
  if (h1 !== -1 && h1 < 5) { fields.title = blocks[h1].text; blocks.splice(h1, 1); }
  for (let i = 0; i < Math.min(blocks.length, 6); i++) {
    const meta = blocks[i].type === "p" ? parseMetaParagraph(blocks[i]) : null;
    if (meta) { Object.assign(fields, meta); blocks.splice(i, 1); break; }
  }
  // A heading at the top repeating the title adds nothing.
  const firstHead = blocks.findIndex((b) => b.type === "h");
  if (firstHead !== -1 && firstHead < 3 && fields.title && norm(blocks[firstHead].text) === norm(fields.title)) blocks.splice(firstHead, 1);
  if (!fields.title) {
    const h = blocks.find((b) => b.type === "h");
    if (h) fields.title = h.text;
  }
  // "Promote" headings so the article's top level is H2 (the page title is the H1).
  const minLevel = Math.min(...blocks.filter((b) => b.type === "h").map((b) => b.level), 9);
  if (minLevel === 1 || minLevel > 2) blocks.forEach((b) => { if (b.type === "h") b.level = Math.min(4, Math.max(2, b.level - minLevel + 2)); });

  /* ---- render with smart blocks ---- */
  const out = [];
  let i = 0;
  let inFaq = false;
  let answerDone = false;
  let paraSeen = 0;
  const liveHtml = (runs) => runsToHtml(runs, ctx);

  while (i < blocks.length) {
    const b = blocks[i];

    if (b.type === "h") {
      report.headings++;
      inFaq = /\b(faq|frequently asked|questions)\b/i.test(b.text);
      out.push(`<h${b.level}>${liveHtml(b.runs)}</h${b.level}>`);
      i++; continue;
    }

    if (b.type === "table") {
      report.tables++;
      out.push(renderTable(b, ctx));
      i++; continue;
    }

    if (b.type === "li") {
      report.lists++;
      const start = i;
      while (i < blocks.length && blocks[i].type === "li") i++;
      out.push(renderList(blocks.slice(start, i), liveHtml));
      continue;
    }

    if (b.type === "quote") {
      out.push(`<blockquote><p>${liveHtml(b.runs)}</p></blockquote>`);
      i++; continue;
    }

    // ---- paragraphs ----
    const note = parseImageNote(b.text);
    if (note) {
      report.imageSlots.push({ ...note, n: note.n || report.imageSlots.length + 1 });
      out.push(`<div class="image-slot" data-alt="${escAttr(note.alt)}"><strong>Image ${note.n || report.imageSlots.length}</strong> — ${escHtml(note.description)}${note.alt ? ` <em>Alt: ${escHtml(note.alt)}</em>` : ""}</div>`);
      i++; continue;
    }

    // "Read next" heading line followed by short link-only lines.
    if (/^(read next|related (reading|articles|guides)|keep reading|more guides|you might also like)\b/i.test(b.text) && b.text.length < 40) {
      const items = [];
      let j = i + 1;
      while (j < blocks.length && (
        (blocks[j].type === "li" && blocks[j].text.length < 140) ||
        (blocks[j].type === "p" && blocks[j].text.length < 90 && blocks[j].runs.some((r) => r.href != null) && !/[?:]\s/.test(blocks[j].text)))) {
        items.push(`<li>${liveHtml(blocks[j].runs)}</li>`);
        j++;
      }
      if (items.length) {
        out.push(`<div class="read-next"><p class="read-next-title">${escHtml(b.text.replace(/:$/, ""))}</p><ul>${items.join("")}</ul></div>`);
        i = j; continue;
      }
    }

    // FAQ: "<strong>Question?</strong> Answer…"
    if (inFaq && b.runs[0] && b.runs.find((r) => (r.text || "").trim())?.b) {
      const qRuns = [], aRuns = [];
      let inQ = true;
      for (const r of b.runs) {
        if (inQ && (r.b || !(r.text || "").trim())) qRuns.push(r);
        else { inQ = false; aRuns.push(r); }
      }
      const q = plain(qRuns);
      if (/\?$/.test(q) && plain(aRuns)) {
        report.faq++;
        out.push(`<div class="faq-block"><h3 class="faq-q">${escHtml(q)}</h3><p>${liveHtml(aRuns)}</p></div>`);
        i++; continue;
      }
    }

    paraSeen++;
    report.paragraphs++;
    const html = liveHtml(b.runs);

    // Quick answer: the first fully-bold, sentence-length paragraph near the top.
    if (!answerDone && paraSeen <= 4 && b.boldShare > 0.45 && b.text.split(/\s+/).length >= 12) {
      answerDone = true;
      report.callouts++;
      out.push(`<div class="answer-box"><p class="answer-box-label">Quick answer</p><p>${html.replace(/^<strong>([\s\S]*?)<\/strong>/, "$1")}</p></div>`);
      i++; continue;
    }

    const callout = calloutFor(b);
    if (callout) {
      report.callouts++;
      // "<strong>Our stance:</strong> if you…" → label on its own line, sentence capitalised.
      const tidy = html.replace(/^<strong>([^<]+?):\s*<\/strong>\s*([a-z])/, (m, label, ch) => `<strong>${label}</strong> ${ch.toUpperCase()}`)
        .replace(/^<strong>([^<]+?):\s*<\/strong>/, "<strong>$1</strong>");
      out.push(`<div class="callout ${callout}"><p>${tidy}</p></div>`);
      i++; continue;
    }

    out.push(`<p>${html}</p>`);
    i++;
  }

  if (!fields.title) report.warnings.push("No title found — add a Heading 1 at the top of the Word file, or type the title in the form.");
  if (!fields.metaDescription) report.warnings.push("No meta description line found (e.g. “Meta description: …”).");

  // Field clean-up and sensible defaults.
  if (fields.slug) fields.slug = fields.slug.replace(/^https?:\/\/[^/]+/i, "").replace(/^\/?blog\//i, "").replace(/^\/+|\/+$/g, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (fields.byline) fields.authorName = fields.byline.split(/\s+[·|•]\s+/)[0].trim();
  if (!fields.focusKeyphrase && fields.slug) {
    fields.focusKeyphrase = fields.slug.replace(/-/g, " ");
    fields.focusKeyphraseGuessed = true;
  }
  const html = out.join("\n");
  const wordsCount = html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  fields.readTimeMinutes = Math.max(1, Math.round(wordsCount / 230));
  if (!fields.excerpt) {
    const answer = html.match(/<div class="answer-box">[\s\S]*?<p>([\s\S]*?)<\/p><\/div>/);
    const firstP = html.match(/<p>([\s\S]*?)<\/p>/);
    const src = (fields.metaDescription || (answer && answer[1]) || (firstP && firstP[1]) || "").replace(/<[^>]+>/g, "");
    fields.excerpt = src.length > 200 ? src.slice(0, 200).replace(/\s+\S*$/, "") + "…" : src;
  }
  report.words = wordsCount;
  return { html, fields, report };
}

function norm(s) {
  let t = String(s || "").toLowerCase();
  if (t.normalize) t = t.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return t.replace(/[ʻʼ’‘'`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Match link text to one of our pages: linkTargets = [{ label, href, keys: ["kauai", …] }]. */
function matchLink(text, targets) {
  const t = norm(text);
  if (!t) return null;
  let best = null, bestScore = 0;
  for (const target of targets) {
    for (const key of target.keys || [norm(target.label)]) {
      if (!key) continue;
      let s = 0;
      if (t === key) s = 100;
      else if (key.length > 6 && (t.includes(key) || key.includes(t))) s = 60 + Math.min(key.length, t.length) / Math.max(key.length, t.length) * 30;
      else {
        const tw = new Set(t.split(" ")), kw = key.split(" ");
        const hit = kw.filter((w) => tw.has(w)).length;
        if (kw.length >= 2 && hit === kw.length) s = 55;
      }
      s += target.priority || 0;
      if (s > bestScore) { bestScore = s; best = target; }
    }
  }
  return bestScore >= 55 ? best : null;
}

function renderList(items, liveHtml) {
  // Nested <ul>/<ol> from Word's list levels (ilvl).
  let html = "";
  const stack = []; // open list tags; each has an open <li> once it has an item
  for (const it of items) {
    const tag = it.ordered ? "ol" : "ul";
    const depth = it.ilvl + 1;
    if (!stack.length || depth > stack.length) {
      while (stack.length < depth) { html += `<${tag}>`; stack.push(tag); }
    } else {
      while (stack.length > depth) html += `</li></${stack.pop()}>`;
      html += "</li>";
      if (stack[stack.length - 1] !== tag) { html += `</${stack.pop()}><${tag}>`; stack.push(tag); }
    }
    html += `<li>${liveHtml(it.runs)}`;
  }
  while (stack.length) html += `</li></${stack.pop()}>`;
  return html;
}

function renderTable(t, ctx) {
  const rows = t.rows.filter((r) => r.cells.length);
  if (!rows.length) return "";
  let headerCount = 0;
  while (headerCount < rows.length && rows[headerCount].header) headerCount++;
  // No marked header rows — or every row marked (Google Docs does that) → the first row is the header.
  if (headerCount === 0 || headerCount === rows.length) headerCount = 1;
  const firstCellEmpty = rows[0].cells[0] && !rows[0].cells[0].paras.length;
  const cellHtml = (c) => c.paras.map((p) => runsToHtml(p, ctx)).join("<br>");
  const head = rows.slice(0, headerCount).map((r) => `<tr>${r.cells.filter((c) => !c.vcontinue).map((c) => `<th scope="col"${c.span > 1 ? ` colspan="${c.span}"` : ""}>${cellHtml(c).replace(/<\/?strong>/g, "")}</th>`).join("")}</tr>`).join("");
  const bodyRows = rows.slice(headerCount).map((r) => `<tr>${r.cells.filter((c) => !c.vcontinue).map((c, ci) => {
    const span = c.span > 1 ? ` colspan="${c.span}"` : "";
    return ci === 0 && firstCellEmpty ? `<th scope="row"${span}>${cellHtml(c).replace(/<\/?strong>/g, "")}</th>` : `<td${span}>${cellHtml(c)}</td>`;
  }).join("")}</tr>`).join("");
  const cols = Math.max(...rows.map((r) => r.cells.reduce((n, c) => n + c.span, 0)));
  const cls = ["comparison-table", firstCellEmpty ? "has-row-headers" : "", cols >= 6 ? "is-wide" : ""].filter(Boolean).join(" ");
  return `<div class="table-scroll"><table class="${cls}"><thead>${head}</thead><tbody>${bodyRows}</tbody></table></div>`;
}

module.exports = { docxToArticle, readZip, parseXml, matchLink, parseImageNote };
