/**
 * Checks that booking links carry OUR affiliate parameters — a link without
 * them still works for the visitor but pays us nothing.
 *
 * Rules (from real partner links):
 *   FareHarbor link / calendar script  → ?asn=fhdn&asn-ref=popotours
 *   GetYourGuide                       → ?partner_id=JMTA7LO
 *   Viator                             → ?pid=P00267520 (mcid=42383)
 *   TripAdvisor                        → no rule yet (not checked)
 * The IDs live in siteConfig.js (AFFILIATE_IDS).
 *
 * The same rules are shipped to the admin form as JSON (clientRulesJson) so
 * the warning updates live while typing.
 */
const { AFFILIATE_IDS } = require("../siteConfig");

const RULES = {
  fareharbor: {
    label: "FareHarbor",
    hosts: ["fareharbor.com"],
    required: { asn: AFFILIATE_IDS.fareharborAsn, "asn-ref": AFFILIATE_IDS.fareharborAsnRef },
    add: { asn: AFFILIATE_IDS.fareharborAsn, "asn-ref": AFFILIATE_IDS.fareharborAsnRef, ref: AFFILIATE_IDS.fareharborAsnRef },
  },
  getyourguide: {
    label: "GetYourGuide",
    hosts: ["getyourguide.com"],
    required: { partner_id: AFFILIATE_IDS.getyourguidePartnerId },
    add: { partner_id: AFFILIATE_IDS.getyourguidePartnerId, utm_medium: "online_publisher" },
  },
  viator: {
    label: "Viator",
    hosts: ["viator.com"],
    required: { pid: AFFILIATE_IDS.viatorPid },
    add: { pid: AFFILIATE_IDS.viatorPid, mcid: AFFILIATE_IDS.viatorMcid, medium: "link" },
  },
};

function parseUrl(raw) {
  try { return new URL(String(raw || "").trim().replace(/&amp;/g, "&")); } catch (e) { return null; }
}

function hostMatches(u, hosts) {
  const h = u.hostname.toLowerCase();
  return hosts.some((d) => h === d || h.endsWith("." + d));
}

/** Returns null when the link is fine (or empty), otherwise a short problem description. */
function checkLink(platform, raw) {
  const rule = RULES[platform];
  if (!rule || !String(raw || "").trim()) return null;
  const u = parseUrl(raw);
  if (!u) return `${rule.label} link is not a valid URL.`;
  if (!hostMatches(u, rule.hosts)) return `${rule.label} link doesn't point to ${rule.hosts[0]}.`;
  const missing = Object.entries(rule.required).filter(([k, v]) => u.searchParams.get(k) !== v).map(([k, v]) => `${k}=${v}`);
  return missing.length ? `${rule.label} link is missing our affiliate ID (${missing.join(", ")}) — bookings through it earn no commission.` : null;
}

function calendarScriptSrc(script) {
  const m = String(script || "").match(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  return m ? m[1] : null;
}

function checkCalendarScript(script) {
  if (!String(script || "").trim()) return null;
  const src = calendarScriptSrc(script);
  if (!src) return "FareHarbor calendar script has no <script src=\"…\"> — paste the full calendar_script cell.";
  const problem = checkLink("fareharbor", src);
  return problem ? problem.replace("FareHarbor link", "FareHarbor calendar script") : null;
}

/** Adds any missing affiliate parameters, keeping everything else in the URL. */
function fixLink(platform, raw) {
  const rule = RULES[platform];
  const u = parseUrl(raw);
  if (!rule || !u || !hostMatches(u, rule.hosts)) return raw;
  Object.entries(rule.add).forEach(([k, v]) => { if (u.searchParams.get(k) !== v) u.searchParams.set(k, v); });
  return u.toString();
}

/**
 * All problems for a tour's data object (only for links that are switched on).
 * → [{ field, message }]
 */
function tourAffiliateIssues(d) {
  d = d || {};
  const bl = d.bookingLinks || {};
  const issues = [];
  const push = (field, message) => { if (message) issues.push({ field, message }); };
  const fhOn = !(bl.fareharbor && bl.fareharbor.show === false);
  if (fhOn) {
    push("fareharborRegularLink", checkLink("fareharbor", d.fareharborRegularLink));
    push("fareharborCalendarScript", checkCalendarScript(d.fareharborCalendarScript));
  }
  if (bl.getyourguide && bl.getyourguide.show) push("getyourguideUrl", checkLink("getyourguide", bl.getyourguide.url));
  if (bl.viator && bl.viator.show) push("viatorUrl", checkLink("viator", bl.viator.url));
  return issues;
}

/** SQL condition (no params) matching tours with at least one non-affiliate link that is switched on. */
const SQL_HAS_AFFILIATE_ISSUE = `(
  (coalesce(data->'bookingLinks'->'fareharbor'->>'show', 'true') <> 'false' AND (
     (coalesce(data->>'fareharborRegularLink', '') <> '' AND NOT (data->>'fareharborRegularLink' ~ '[?&]asn=${AFFILIATE_IDS.fareharborAsn}(&|$)' AND data->>'fareharborRegularLink' ~ '[?&]asn-ref=${AFFILIATE_IDS.fareharborAsnRef}(&|$)'))
  OR (coalesce(data->>'fareharborCalendarScript', '') <> '' AND NOT (data->>'fareharborCalendarScript' ~ '[?&](amp;)?asn=${AFFILIATE_IDS.fareharborAsn}(&|"|$)' AND data->>'fareharborCalendarScript' ~ '[?&](amp;)?asn-ref=${AFFILIATE_IDS.fareharborAsnRef}(&|"|$)'))))
  OR (data->'bookingLinks'->'getyourguide'->>'show' = 'true' AND coalesce(data->'bookingLinks'->'getyourguide'->>'url', '') <> ''
      AND data->'bookingLinks'->'getyourguide'->>'url' !~ '[?&]partner_id=${AFFILIATE_IDS.getyourguidePartnerId}(&|$)')
  OR (data->'bookingLinks'->'viator'->>'show' = 'true' AND coalesce(data->'bookingLinks'->'viator'->>'url', '') <> ''
      AND data->'bookingLinks'->'viator'->>'url' !~ '[?&]pid=${AFFILIATE_IDS.viatorPid}(&|$)')
)`;

/** Rules for the browser (admin form live check). */
function clientRulesJson() {
  const out = {};
  Object.entries(RULES).forEach(([k, r]) => { out[k] = { label: r.label, hosts: r.hosts, required: r.required, add: r.add }; });
  return JSON.stringify(out).replace(/</g, "\\u003c");
}

module.exports = { checkLink, checkCalendarScript, fixLink, tourAffiliateIssues, SQL_HAS_AFFILIATE_ISSUE, clientRulesJson, calendarScriptSrc };
