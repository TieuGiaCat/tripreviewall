const { fakeTourRow, findInlineCode } = require("./helpers");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { toPublicShape, toPostPublicShape } = require("../src/routes/publicApi");
const { renderTourPageHtml } = require("../src/ssr/tourTemplate");
const { renderPostPageHtml } = require("../src/ssr/postTemplate");
const { renderHomeHtml } = require("../src/ssr/homeTemplate");
const { renderToursIndexHtml } = require("../src/ssr/listingTemplates");
const { parsePageSource, renderStaticPage } = require("../src/ssr/pageTemplate");
const { PAGES_DIR } = require("../src/siteConfig");

const tour = toPublicShape(fakeTourRow());

function postRow() {
  return {
    slug: "test-post", category: "Island Guides", island_tag: "Maui", content_format: "standard",
    published_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-02T00:00:00Z",
    data: {
      title: "Test </script> post", body: '<h2>Part</h2><p>See <a href="https://www.viator.com/x?pid=P00267520">this</a>.</p>',
      excerpt: "Short", author: "Hoa", featuredImage: "/uploads/posts/p.jpg", relatedTourSlug: tour.slug,
    },
  };
}

test("tour page has no inline handlers or inline scripts (E9)", () => {
  const html = renderTourPageHtml(tour, []);
  assert.deepEqual(findInlineCode(html), []);
  assert.match(html, /data-booking-sheet="open"/);
  assert.match(html, /tour-static-hydrate\.js/);
  assert.doesNotMatch(html, /<script>alert/);
});

test("tour JSON-LD can't be broken by a title with </script>", () => {
  const html = renderTourPageHtml(toPublicShape(fakeTourRow({ name: "Bad </script><b>x" })), []);
  const blocks = html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g);
  blocks.forEach((b) => JSON.parse(b.replace(/^<script[^>]*>|<\/script>$/g, "")));
});

test("article page: JSON-LD has image, mainEntityOfPage and publisher logo (D7)", () => {
  const post = toPostPublicShape(postRow());
  const html = renderPostPageHtml(post, tour, [], null);
  assert.deepEqual(findInlineCode(html), []);
  const article = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)
    .map((b) => JSON.parse(b.replace(/^<script[^>]*>|<\/script>$/g, "")))
    .find((o) => o["@type"] === "Article");
  assert.ok(article.image[0].startsWith("https://tripreviewall.com/uploads/posts/p.jpg"));
  assert.equal(article.mainEntityOfPage["@id"], "https://tripreviewall.com/blog/test-post");
  assert.equal(article.publisher.logo.url, "https://tripreviewall.com/icon-512.png");
});

test("article page: topic/category tags link to the filtered blog, mobile tour bar shown", () => {
  const html = renderPostPageHtml(toPostPublicShape({ ...postRow(), island_tag: "Snorkeling" }), tour, [], null);
  assert.match(html, /href="\/blog\?topic=Snorkeling"/);
  assert.match(html, /href="\/blog\?category=Island%20Guides"/);
  assert.match(html, /<div class="article-tour-bar"[\s\S]*View tour &amp; reviews/);
  assert.doesNotMatch(html, /More Snorkeling guides/, "island link only for island topics");
});

test("article links are tracked: prose carries the slug and article.js is loaded (D8)", () => {
  const html = renderPostPageHtml(toPostPublicShape(postRow()), null, [], null);
  assert.match(html, /class="article-prose" data-post-slug="test-post"/);
  assert.match(html, /\/js\/article\.js/);
  assert.match(html, /rel="sponsored noopener"/);
});

test("home and /tours listing have no inline code", () => {
  assert.deepEqual(findInlineCode(renderHomeHtml([tour], [], { Maui: 1 }, {})), []);
  assert.deepEqual(findInlineCode(renderToursIndexHtml([tour], 1)), []);
});

test("every hand-written page in admin/pages renders without inline code", () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".html") ? [path.join(dir, e.name)] : []);
  const files = walk(PAGES_DIR);
  assert.ok(files.length >= 7);
  for (const f of files) {
    const page = parsePageSource(fs.readFileSync(f, "utf8"));
    const html = renderStaticPage(page, { toursBySlug: { [tour.slug]: tour, "unique-maui-tours-road-to-hana": tour }, posts: [] });
    assert.deepEqual(findInlineCode(html), [], path.basename(f));
    assert.doesNotMatch(html, /\{\{\w+/, `${path.basename(f)} has an unreplaced token`);
  }
});

test("All Articles tabs come from the categories passed in (Admin → Categories)", () => {
  const { renderBlogIndexHtml } = require("../src/ssr/listingTemplates");
  const posts = [toPostPublicShape({ ...postRow(), slug: "a", category: "Kauai", island_tag: "Snorkeling" }), toPostPublicShape({ ...postRow(), slug: "b", category: "Oahu" })];
  const html = renderBlogIndexHtml(posts, [], ["Kauai", "Oahu", "Empty one"], ["Snorkeling", "Unused"]);
  assert.match(html, /data-cat="All"[\s\S]*data-cat="Kauai"[\s\S]*data-cat="Oahu"/);
  assert.doesNotMatch(html, /data-cat="Island Guides"|data-cat="Empty one"/, "default list ignored, empty categories hidden");
  assert.match(html, /<option value="Snorkeling">Snorkeling<\/option>/, "topic filter lists used topics");
  assert.doesNotMatch(html, /value="Unused"/);
  assert.match(html, /data-topic="Snorkeling"/);
});

test("links left empty by the Word import render as plain text", () => {
  const post = toPostPublicShape({ ...postRow(), data: { ...postRow().data, body: '<p>See <a href="#needs-link">best beaches</a> and <a href="/tours">tours</a>.</p>' } });
  const html = renderPostPageHtml(post, null, [], null);
  assert.match(html, /See best beaches and <a href="\/tours">tours<\/a>/);
});
