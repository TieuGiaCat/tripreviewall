require("./helpers");
const test = require("node:test");
const assert = require("node:assert/strict");
const SeoAnalysis = require("../public/seo-analysis.js");

const body = `<p>Snorkeling in Maui is best on calm mornings, when the trade winds are still asleep.</p>
<h2>Best snorkeling spots in Maui</h2><p>${"Black Rock and Honolua Bay are easy to reach. However, the wind picks up after ten. ".repeat(25)}</p>
<h2>What to bring</h2><p>${"Bring reef-safe sunscreen because Hawaii bans the others. ".repeat(15)}</p>
<p>Book a <a href="/tours/molokini">Molokini tour</a> or read the <a href="https://dlnr.hawaii.gov">state guide</a>.</p>
<img src="/uploads/a.jpg" alt="Snorkeling in Maui at Black Rock">`;
const base = { keyphrase: "snorkeling in maui", title: "Snorkeling in Maui: 7 Best Spots", seoTitle: "Snorkeling in Maui: 7 Best Spots | Tripreviewall",
  metaDescription: "Where to go snorkeling in Maui, ranked by calm water, reef life and easy entry — with the spots to skip and when to go for the clearest water.", slug: "snorkeling-in-maui", html: body, type: "post" };
const byId = (r, id) => r.seo.concat(r.readability).find((c) => c.id === id);

test("a well-optimised post scores green", () => {
  const r = SeoAnalysis.analyze(base);
  assert.equal(r.seoScore, "good");
  ["keyphraseInSeoTitle", "keyphraseInMeta", "keyphraseInSlug", "keyphraseInIntro", "imageAlt", "internalLinks", "outboundLinks", "metaLength"].forEach((id) => assert.equal(byId(r, id).status, "good", id));
});

test("no keyphrase → red warning, score 'na'", () => {
  const r = SeoAnalysis.analyze({ ...base, keyphrase: "" });
  assert.equal(byId(r, "keyphraseLength").status, "bad");
  assert.equal(r.seoScore, "na");
});

test("matching ignores case, accents and the Hawaiian ʻokina", () => {
  assert.equal(SeoAnalysis.match("Things to do on Kauaʻi", "things to do on kauai"), "exact");
  assert.equal(SeoAnalysis.match("Kauai snorkel tours", "snorkel tour kauai"), "words");
  assert.equal(SeoAnalysis.match("Maui luau", "kauai luau"), "none");
});

test("problems are detected", () => {
  const r = SeoAnalysis.analyze({ ...base, seoTitle: "A very long title that goes on and on about Maui snorkeling and much more | Tripreviewall",
    metaDescription: "", slug: "spots", html: body + '<a href="#needs-link">x</a><h1>Second H1</h1>', usedElsewhere: ["Article “Old”"] });
  assert.equal(byId(r, "seoTitleWidth").status, "bad");
  assert.equal(byId(r, "metaLength").status, "bad");
  assert.equal(byId(r, "keyphraseInSlug").status, "bad");
  assert.equal(byId(r, "emptyLinks").status, "bad");
  assert.equal(byId(r, "singleH1").status, "bad");
  assert.equal(byId(r, "previouslyUsed").status, "bad");
});

test("content-word length: 'things to do in kauai' counts as 2", () => {
  const r = SeoAnalysis.analyze({ ...base, keyphrase: "things to do in kauai" });
  assert.equal(byId(r, "keyphraseLength").status, "good");
});

test("readability checks run on long text", () => {
  const r = SeoAnalysis.analyze(base);
  ["sentenceLength", "paragraphLength", "fleschReadingEase", "transitionWords"].forEach((id) => assert.ok(byId(r, id), id));
  assert.notEqual(r.readabilityScore, "na");
});

test("tour page text is built from the tour fields", () => {
  const html = SeoAnalysis.tourHtml({ name: "Molokini <Snorkel>", company: "Co", fullDescription: "Line one\nLine two", highlights: ["Turtles"], verdict: { headline: "Worth it" }, gallery: ["a"] });
  assert.match(html, /<h2>Overview<\/h2><p>Line one<\/p><p>Line two<\/p><h2>Highlights<\/h2><ul><li>Turtles<\/li><\/ul><h2>Our Verdict<\/h2><p>Worth it<\/p>/);
  assert.match(html, /alt="Molokini &lt;Snorkel&gt; — Co"/);
});
