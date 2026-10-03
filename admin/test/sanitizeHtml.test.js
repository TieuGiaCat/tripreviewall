require("./helpers");
const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeHtml } = require("../src/lib/sanitizeHtml");

test("scripts, handlers and javascript: links are removed", () => {
  const out = sanitizeHtml('<p onclick="x()">Hi<script>alert(1)</script></p><a href="javascript:alert(1)">x</a><img src=x onerror=alert(1)>');
  assert.doesNotMatch(out, /script|onclick|onerror|javascript:/i);
  assert.match(out, /<p>Hi<\/p>/);
});

test("affiliate links get rel=sponsored and open in a new tab", () => {
  const out = sanitizeHtml('<a href="https://www.viator.com/tours/x?pid=P00267520">Book</a>');
  assert.match(out, /rel="sponsored noopener"/);
  assert.match(out, /target="_blank"/);
});

test("normal links are left alone", () => {
  const out = sanitizeHtml('<a href="/tours/abc">Tour</a>');
  assert.equal(out, '<a href="/tours/abc">Tour</a>');
});
