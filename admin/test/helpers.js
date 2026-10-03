/**
 * Test helpers. Tests never touch a real database: DATABASE_URL points at a
 * port nothing listens on, and anything that would query is stubbed.
 */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || "postgres://test:test@127.0.0.1:1/none";
process.env.SITE_URL = "https://tripreviewall.com";

function fakeTourRow(overrides = {}) {
  return {
    slug: "test-snorkel-tour",
    island: "Maui",
    price_from: 129,
    data: {
      name: "Molokini Snorkel <Test> & Co",
      company: "Test Co",
      tourType: "Snorkel",
      durationLabel: "5 hours",
      highlights: ["Turtles", "Breakfast"],
      fullDescription: "<p>Great tour.</p><script>alert(1)</script>",
      verdict: { summary: "Good value", pros: ["Calm water"], cons: ["Early start"] },
      gallery: ["/uploads/tours/a.jpg", "/uploads/tours/b.jpg"],
      fareharborRegularLink: "https://fareharbor.com/embeds/book/test/items/1/?asn=fhdn&asn-ref=popotours",
      bookingLinks: {
        getyourguide: { show: true, url: "https://www.getyourguide.com/x?partner_id=JMTA7LO" },
        viator: { show: true, url: "https://www.viator.com/x?pid=P00267520" },
      },
      aggregatedRating: 4.6,
      reviewCountTotal: 1234,
      ratingsBySource: { tripadvisor: { rating: 4.5, count: 800 } },
      ...overrides,
    },
  };
}

/** Inline event handlers / inline executable scripts — what a strict CSP blocks (E9). */
function findInlineCode(html) {
  const problems = [];
  const handler = html.match(/<[a-z][^>]*\son[a-z]+\s*=/gi);
  if (handler) problems.push(...handler.map((h) => "handler: " + h.slice(0, 80)));
  const scripts = html.match(/<script\b[^>]*>/gi) || [];
  scripts.forEach((tag) => {
    if (/\bsrc\s*=/.test(tag)) return;
    if (/type\s*=\s*["'](application\/ld\+json|text\/plain)["']/i.test(tag)) return;
    problems.push("inline script: " + tag);
  });
  if (/href\s*=\s*["']\s*javascript:/i.test(html)) problems.push("javascript: link");
  return problems;
}

module.exports = { fakeTourRow, findInlineCode };
