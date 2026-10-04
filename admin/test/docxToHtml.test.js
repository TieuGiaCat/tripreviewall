require("./helpers");
const test = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("zlib");
const { docxToArticle, parseImageNote, matchLink } = require("../src/lib/docxToHtml");
const { sanitizeHtml } = require("../src/lib/sanitizeHtml");

/* ---- build a small .docx in memory (zip writer, deflate) ---- */
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) {
  const locals = [], centrals = []; let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, "utf8"), comp = zlib.deflateRawSync(data), nameBuf = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc32(data), 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc32(data), 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, comp); centrals.push(ch, nameBuf); offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const run = (t, { b, i } = {}) => `<w:r><w:rPr>${b ? '<w:b w:val="1"/>' : '<w:b w:val="0"/>'}${i ? "<w:i/>" : ""}<w:color w:val="4f81bd"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r>`;
const p = (runs, style = "", num = "") => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${num}</w:pPr>${runs}</w:p>`;
const li = (runs, numId = 1, lvl = 0) => p(runs, "", `<w:numPr><w:ilvl w:val="${lvl}"/><w:numId w:val="${numId}"/></w:numPr>`);
const cell = (t) => `<w:tc>${p(run(t))}</w:tc>`;
const doc = `<?xml version="1.0"?><w:document ${W}><w:body>
${p(run("Best Snorkeling in Maui &amp; Beyond"), "Heading1")}
${p(run("Slug:", { b: true }) + run(" /blog/best-snorkeling-maui ") + run("Meta description:", { b: true }) + run(" Where to snorkel on Maui. ") + run("Focus keyphrase:", { b: true }) + run(" snorkeling maui"))}
${p(run("[IMAGE 1 — Turtle at Black Rock. Alt text: “Green sea turtle at Black Rock, Maui”.]"))}
${p(run("Maui has calm reefs on the west side."))}
${p(run("The best snorkeling in Maui is at Molokini Crater, Black Rock and Honolua Bay in summer.", { b: true }))}
${p(run("Where to go"), "Heading2")}
${li(run("Black Rock.", { b: true }) + run(" Easy entry."))}
${li(run("Turtles nest nearby."), 1, 1)}
${li(run("Honolua Bay.", { b: true }) + run(" Summer only."))}
<w:tbl><w:tr><w:trPr><w:tblHeader/></w:trPr>${cell("")}${cell("Molokini")}${cell("Black Rock")}</w:tr><w:tr>${cell("Cost")}${cell("$90")}${cell("Free")}</w:tr></w:tbl>
${p(run("Our stance:", { b: true }) + run(" go early, before the wind."))}
${p(run("Warning:", { b: true }) + run(" never turn your back on the ocean."))}
${p(run("See our ") + '<w:hyperlink r:id="rId9">' + run("Maui destination page") + "</w:hyperlink>" + run(" and ") + '<w:hyperlink r:id="rId10">' + run("best beaches guide") + "</w:hyperlink>" + run("."))}
${p(run("FAQ"), "Heading2")}
${p(run("Is Molokini worth it?", { b: true }) + run(" Yes, on a calm morning."))}
${p(run("Read next", { b: true }))}
${li('<w:hyperlink r:id="rId11">' + run("Things to do in Maui") + "</w:hyperlink>", 2)}
</w:body></w:document>`;
const styles = `<w:styles ${W}><w:style w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:styleId="Heading2"><w:name w:val="heading 2"/></w:style></w:styles>`;
const numbering = `<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
const rels = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  ["rId9", "rId10", "rId11"].map((id) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="about:blank" TargetMode="External"/>`).join("") + "</Relationships>";
const DOCX = zip({ "word/document.xml": doc, "word/styles.xml": styles, "word/numbering.xml": numbering, "word/_rels/document.xml.rels": rels });
const targets = [
  { label: "Maui", href: "/destinations/maui", keys: ["maui destination page", "maui"] },
  { label: "Article", href: "/blog/things-to-do-in-maui", keys: ["things to do in maui"], priority: 5 },
];

test("title and the Slug/Meta/Keyphrase line become form fields, not body text", () => {
  const { fields, html } = docxToArticle(DOCX, { linkTargets: targets });
  assert.equal(fields.title, "Best Snorkeling in Maui & Beyond");
  assert.equal(fields.slug, "best-snorkeling-maui");
  assert.equal(fields.metaDescription, "Where to snorkel on Maui.");
  assert.equal(fields.focusKeyphrase, "snorkeling maui");
  assert.doesNotMatch(html, /Slug:|Best Snorkeling in Maui &amp; Beyond<\/h/);
});

test("Word fonts and colours are dropped; structure is kept", () => {
  const { html } = docxToArticle(DOCX, { linkTargets: targets });
  assert.doesNotMatch(html, /style=|color|4f81bd|font/i);
  assert.match(html, /<h2>Where to go<\/h2>/);
  assert.match(html, /<ul><li><strong>Black Rock\.<\/strong> Easy entry\.<ul><li>Turtles nest nearby\.<\/li><\/ul><\/li><li><strong>Honolua Bay\.<\/strong> Summer only\.<\/li><\/ul>/);
});

test("site blocks: quick answer, callouts, table, FAQ, read next, image note", () => {
  const { html, report } = docxToArticle(DOCX, { linkTargets: targets });
  assert.match(html, /<div class="answer-box"><p class="answer-box-label">Quick answer<\/p><p>The best snorkeling in Maui is at/);
  assert.match(html, /<div class="callout callout-verdict"><p><strong>Our stance<\/strong> Go early/);
  assert.match(html, /<div class="callout callout-warning"><p><strong>Warning<\/strong> Never turn/);
  assert.match(html, /<div class="table-scroll"><table class="comparison-table has-row-headers"><thead><tr><th scope="col"><\/th><th scope="col">Molokini<\/th>/);
  assert.match(html, /<tbody><tr><th scope="row">Cost<\/th><td>\$90<\/td>/);
  assert.match(html, /<div class="faq-block"><h3 class="faq-q">Is Molokini worth it\?<\/h3><p>Yes, on a calm morning\.<\/p><\/div>/);
  assert.match(html, /<div class="read-next"><p class="read-next-title">Read next<\/p><ul><li><a href="\/blog\/things-to-do-in-maui">/);
  assert.match(html, /<div class="image-slot" data-alt="Green sea turtle at Black Rock, Maui">/);
  assert.equal(report.imageSlots[0].alt, "Green sea turtle at Black Rock, Maui");
  assert.equal(report.faq, 1);
});

test("empty Word links are matched to our pages, or flagged #needs-link", () => {
  const { html, report } = docxToArticle(DOCX, { linkTargets: targets });
  assert.match(html, /<a href="\/destinations\/maui">Maui destination page<\/a>/);
  assert.match(html, /<a href="#needs-link">best beaches guide<\/a>/);
  assert.deepEqual(report.linksMissing, ["best beaches guide"]);
});

test("converted HTML survives the public sanitizer unchanged in structure", () => {
  const { html } = docxToArticle(DOCX, { linkTargets: targets });
  const clean = sanitizeHtml(html);
  ["answer-box", "callout-verdict", "table-scroll", "faq-block", "read-next", 'scope="row"'].forEach((k) => assert.ok(clean.includes(k), k));
});

test("not a docx → clear error", () => {
  assert.throws(() => docxToArticle(Buffer.from("hello world, definitely not a zip file at all")), /Not a \.docx/);
});

test("image note and link matching helpers", () => {
  assert.deepEqual(parseImageNote("[IMAGE 4 — Hanalei Bay at sunset. Alt text: “Hanalei Bay pier”. Caption: credit.]").alt, "Hanalei Bay pier");
  assert.equal(parseImageNote("Just a sentence."), null);
  assert.equal(matchLink("our Maui destination page", targets).href, "/destinations/maui");
  assert.equal(matchLink("Kauai luau", targets), null);
});
