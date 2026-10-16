const test = require("node:test");
const assert = require("node:assert");
const tc = require("../src/ssr/tourContent");
const f = require("../src/lib/tourContentFields");

const sample = {
  overview: { verdictSnippet: "A **4-hour** river paddle.", highlights: ["Flat water"], whatToExpect: ["Check in", "Paddle"], included: ["Kayak"], notIncluded: ["Guide"], whatToBring: [], restrictions: [], cancellationPolicy: "48 hours." },
  location: { meetingPoint: "134B Hamakua Dr.", checkIn: "", parking: "Free lot." },
  review: { methodology: "We read 3 excerpts.", ratings: [{ platform: "Google", rating: 4.8, count: 360, asOf: "October 2026" }],
    praise: [{ title: "Good for kids", count: "2 of 3", summary: "Parents liked it.", example: "— operator site: a parent said so" }],
    complaints: [{ title: "Low reseller scores", count: "1 listing", note: "operator issue", recency: "most recent: unknown", summary: "No text shown.", example: "", operatorResponse: "None." }], operatorWide: "" },
  verdict: { intro: "Worth it for families.", bookIf: ["You have a car"], skipIf: ["You want a guide"], tips: ["Bring water"], cta: "Check availability" },
  faq: [{ q: "Is it guided?", a: "No, it is self-guided." }],
  contact: { website: "https://example.com/", address: "Kailua", hours: "9–5" },
  updatedOn: "October 2026",
};

test("overview renders snippet, steps, included/excluded and escapes html", () => {
  const html = tc.overviewHtml({ ...sample, overview: { ...sample.overview, verdictSnippet: "A <b>4-hour</b> **paddle**" } }, { highlights: [] });
  assert.match(html, /verdict-snippet/);
  assert.match(html, /&lt;b&gt;/);
  assert.match(html, /<strong>paddle<\/strong>/);
  assert.match(html, /steps-list/);
  assert.match(html, /What&#39;s Not Included/);
  assert.strictEqual(tc.overviewHtml(null, {}), "");
});

test("review renders themes with counts, and skipRatings hides the table", () => {
  const html = tc.reviewHtml(sample);
  assert.match(html, /ratings-table/);
  assert.match(html, /Good for kids<\/strong> <span class="review-theme-meta">\(2 of 3\)/);
  assert.match(html, /operator issue · most recent: unknown/);
  assert.doesNotMatch(tc.reviewHtml(sample, { skipRatings: true }), /ratings-table/);
});

test("faq renders tab html + FAQPage json-ld; contact extras render only http links", () => {
  assert.match(tc.faqHtml(sample), /faq-q">Is it guided\?/);
  assert.strictEqual(tc.faqJsonLd(sample)["@type"], "FAQPage");
  assert.strictEqual(tc.faqJsonLd({ faq: [] }), null);
  assert.match(tc.contactExtraHtml(sample), /href="https:\/\/example.com\/"/);
  assert.doesNotMatch(tc.contactExtraHtml({ contact: { website: "javascript:alert(1)" } }), /href/);
});

test("verdict uses the cta only when a booking href exists", () => {
  assert.match(tc.verdictHtml(sample, "/api/track-click?x"), /verdict-cta/);
  assert.doesNotMatch(tc.verdictHtml(sample, ""), /verdict-cta/);
});

test("admin fields round-trip the structured content", () => {
  const fields = f.contentToFields(sample);
  assert.match(fields.c_complaints, /\[operator issue · most recent: unknown\]/);
  assert.match(fields.c_faq, /^Q: Is it guided\?\nA: No, it is self-guided\.$/);
  const back = f.bodyToContent(fields, { sources: [{ url: "x" }] });
  assert.deepStrictEqual(back.review.complaints, sample.review.complaints);
  assert.deepStrictEqual(back.review.praise, sample.review.praise);
  assert.deepStrictEqual(back.review.ratings[0], { ...sample.review.ratings[0] });
  assert.deepStrictEqual(back.faq, sample.faq);
  assert.deepStrictEqual(back.verdict, sample.verdict);
  assert.deepStrictEqual(back.sources, [{ url: "x" }], "untouched keys are preserved");
  assert.strictEqual(back.updatedOn, "October 2026");
});
