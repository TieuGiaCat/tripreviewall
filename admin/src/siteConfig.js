/**
 * Single source of truth for site-wide constants (server side).
 * Import from here instead of re-declaring SITE_URL, colors, affiliate IDs…
 *
 * Contact details (phone, email, hours) are editable in
 * Admin → Settings → Site Info; DEFAULT_SITE_INFO is only the fallback used
 * before anything is saved.
 */
const path = require("path");

const SITE_URL = (process.env.SITE_URL || "https://tripreviewall.com").replace(/\/+$/, "");
const SITE_ROOT = process.env.SITE_ROOT || path.join(__dirname, "..", "..", "site-not-configured");
// Sources for the hand-written pages (About, Contact, Privacy…). The generator
// renders them into SITE_ROOT with the shared header/footer. Kept inside
// admin/ on purpose: nginx proxies /admin/* to Node, so these raw sources can
// never be served as public pages.
const PAGES_DIR = path.join(__dirname, "..", "pages");

const BRAND = "Tripreviewall";

const DEFAULT_SITE_INFO = {
  operatorName: "Popotours",
  phone: "+1 (808) 226-1884",
  email: "contact@tripreviewall.com",
  hours: "Mon–Fri 8:30–20:00 · Sat–Sun 9:30–21:30 (HST)",
  address: "1948 Kealakai St Unit D, Honolulu, HI 96817",
  // Operator phone/email on tour pages: "after-click" = shown only after the
  // visitor has opened one of the booking links (FareHarbor, TripAdvisor,
  // GetYourGuide, Viator); "always" = shown right away; "never" = hidden.
  operatorContact: "after-click",
};

// Blog category → card gradient (used when a post has no featured image).
const CATEGORY_GRADIENTS = {
  "Comparison": "linear-gradient(135deg,#5C8A72,#0B3B4F)",
  "Real Traveler Reviews & Data": "linear-gradient(135deg,#B85C4A,#0B3B4F)",
  "Tour Reviews by Type": "linear-gradient(135deg,#D97B4F,#0B3B4F)",
  "Island Guides": "linear-gradient(135deg,#0B3B4F,#5C8A72)",
  "Booking & Practical Info": "linear-gradient(135deg,#26313A,#B8592F)",
  "Planning & Comparisons": "linear-gradient(135deg,#5C8A72,#0B3B4F)",
};
const DEFAULT_GRADIENT = "linear-gradient(135deg,#0B3B4F,#5C8A72)";

const BLOG_CATEGORIES = ["Island Guides", "Tour Reviews by Type", "Planning & Comparisons", "Booking & Practical Info", "Real Traveler Reviews & Data"];

// Our partner IDs — a booking link without them earns no commission.
// See lib/affiliateLinks.js for the exact rules.
const AFFILIATE_IDS = {
  fareharborAsn: "fhdn",
  fareharborAsnRef: "popotours",
  getyourguidePartnerId: "JMTA7LO",
  viatorPid: "P00267520",
  viatorMcid: "42383",
};

// Tours that were "Editor's Pick" before it became a checkbox in Admin.
// Only applies to tours whose editorsPick flag has never been saved.
const LEGACY_EDITORS_PICK_SLUGS = ["ohana-surf-project-sup-lessons"];

module.exports = {
  SITE_URL, SITE_ROOT, PAGES_DIR, BRAND, DEFAULT_SITE_INFO,
  CATEGORY_GRADIENTS, DEFAULT_GRADIENT, BLOG_CATEGORIES, AFFILIATE_IDS, LEGACY_EDITORS_PICK_SLUGS,
};
