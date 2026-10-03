require("./helpers");
const test = require("node:test");
const assert = require("node:assert/strict");
const { checkLink, fixLink, checkCalendarScript, tourAffiliateIssues } = require("../src/lib/affiliateLinks");

test("FareHarbor link with our asn passes, without it is flagged", () => {
  assert.equal(checkLink("fareharbor", "https://fareharbor.com/embeds/book/x/items/1/?asn=fhdn&asn-ref=popotours"), null);
  assert.match(checkLink("fareharbor", "https://fareharbor.com/embeds/book/x/items/1/"), /missing our affiliate ID/);
});

test("look-alike domains are rejected", () => {
  assert.match(checkLink("viator", "https://evilviator.com/x?pid=P00267520"), /doesn't point to viator.com/);
});

test("fixLink adds the missing IDs and keeps other parameters", () => {
  const fixed = new URL(fixLink("getyourguide", "https://www.getyourguide.com/tour-t1/?date=2026-11-01"));
  assert.equal(fixed.searchParams.get("partner_id"), "JMTA7LO");
  assert.equal(fixed.searchParams.get("date"), "2026-11-01");
});

test("calendar script is checked through its src", () => {
  assert.equal(checkCalendarScript('<script src="https://fareharbor.com/embeds/script/calendar/x/items/1/?asn=fhdn&amp;asn-ref=popotours"></script>'), null);
  assert.match(checkCalendarScript('<script src="https://fareharbor.com/embeds/script/calendar/x/items/1/"></script>'), /calendar script/);
});

test("switched-off platforms are not reported", () => {
  const issues = tourAffiliateIssues({ bookingLinks: { viator: { show: false, url: "https://www.viator.com/x" } } });
  assert.deepEqual(issues, []);
});
