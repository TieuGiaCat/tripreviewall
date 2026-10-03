require("./helpers");
const test = require("node:test");
const assert = require("node:assert/strict");
const { applyMetaTags, safeHtmlPath } = require("../src/lib/pageSeo");

const page = `<!DOCTYPE html><html><head><title>Old</title>
<meta name="description" content="old desc">
<meta property="og:title" content="Old"><meta name="twitter:title" content="Old">
<meta property="og:description" content="old desc"></head>
<body><svg><title>icon</title></svg></body></html>`;

test("title, description and social tags are all updated (D4)", () => {
  const out = applyMetaTags(page, "New $1 title", "New desc");
  assert.match(out, /<title>New \$1 title<\/title>/);
  assert.match(out, /<meta property="og:title" content="New \$1 title">/);
  assert.match(out, /<meta name="twitter:title" content="New \$1 title">/);
  assert.match(out, /<meta property="og:description" content="New desc">/);
  assert.match(out, /<svg><title>icon<\/title><\/svg>/, "body <title> must not change");
});

test("only .html files inside the site can be targeted", () => {
  assert.equal(safeHtmlPath("../etc/passwd.html"), null);
  assert.equal(safeHtmlPath("js/main.js"), null);
});
