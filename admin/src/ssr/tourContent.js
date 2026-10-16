/**
 * Structured tour-page content (tour.data.content) → HTML for the tabs.
 *
 * The shape is what Admin → Tours → "4. Page content" edits and what
 * `npm run import-tour-content` loads from admin/data/tour-content/*.json:
 *
 *   content = {
 *     overview: { verdictSnippet, highlights[], whatToExpect[], included[], notIncluded[],
 *                 whatToBring[], restrictions[], cancellationPolicy },
 *     location: { meetingPoint, checkIn, parking },
 *     review:   { methodology, ratings:[{platform, rating, count, asOf}],
 *                 praise:[{title, count, summary, example}],
 *                 complaints:[{title, count, note, recency, summary, example, operatorResponse}],
 *                 operatorWide },
 *     verdict:  { intro, bookIf[], skipIf[], tips[], cta },
 *     faq:      [{ q, a }],
 *     contact:  { website, address, hours },
 *     sources:  [{ url, what }], confidence, updatedOn
 *   }
 * Every part is optional; a tab falls back to the old fields when its part is empty.
 */
const { esc } = require("../utils");

const CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
const CROSS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
const PIN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22c4.97-4.97 8-8.97 8-13a8 8 0 1 0-16 0c0 4.03 3.03 8.03 8 13Z"></path><circle cx="12" cy="9" r="1"></circle></svg>`;

const list = (items) => (items || []).filter(Boolean);
const has = (x) => Array.isArray(x) ? x.length > 0 : !!(x && String(x).trim());

/** "**bold**" inside a text → <strong>; everything else escaped. */
function inline(text) {
  return esc(String(text || "")).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}
function paragraphs(text) {
  return String(text || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p class="detail-body-text">${inline(p)}</p>`).join("");
}
function ul(items, cls = "highlight-list", icon = CHECK) {
  const arr = list(items);
  return arr.length ? `<ul class="${cls}">${arr.map((i) => `<li>${icon}<span>${inline(i)}</span></li>`).join("")}</ul>` : "";
}
function ol(items) {
  const arr = list(items);
  return arr.length ? `<ol class="steps-list">${arr.map((i) => `<li>${inline(i)}</li>`).join("")}</ol>` : "";
}
function h3(text) { return `<h3 class="detail-sub-title">${esc(text)}</h3>`; }

/* ---------------- Overview ---------------- */
function overviewHtml(c, tour) {
  const o = (c && c.overview) || {};
  if (!has(o.verdictSnippet) && !has(o.whatToExpect) && !has(o.included)) return "";
  const parts = [];
  if (has(o.verdictSnippet)) parts.push(`<p class="verdict-snippet">${inline(o.verdictSnippet)}</p>`);
  const highlights = has(o.highlights) ? o.highlights : tour.highlights;
  if (has(highlights)) parts.push(h3("Highlights") + ul(highlights));
  if (has(o.whatToExpect)) parts.push(h3("What to Expect") + ol(o.whatToExpect));
  if (has(o.included) || has(o.notIncluded)) {
    parts.push(`<div class="policy-grid">
      ${has(o.included) ? `<div>${h3("What's Included")}${ul(o.included, "policy-list included")}</div>` : ""}
      ${has(o.notIncluded) ? `<div>${h3("What's Not Included")}${ul(o.notIncluded, "policy-list excluded", CROSS)}</div>` : ""}
    </div>`);
  }
  if (has(o.whatToBring)) parts.push(h3("What to Bring") + ul(o.whatToBring, "plain-list", ""));
  if (has(o.restrictions)) parts.push(h3("Restrictions and Requirements") + ul(o.restrictions, "plain-list", ""));
  if (has(o.cancellationPolicy)) parts.push(h3("Cancellation Policy") + paragraphs(o.cancellationPolicy));
  return parts.join("\n");
}

/* ---------------- Location ---------------- */
function locationHtml(c) {
  const l = (c && c.location) || {};
  if (!has(l.meetingPoint) && !has(l.checkIn) && !has(l.parking)) return "";
  return [
    has(l.meetingPoint) ? h3("Meeting Point") + paragraphs(l.meetingPoint) : "",
    has(l.checkIn) ? h3("Check-In") + paragraphs(l.checkIn) : "",
    has(l.parking) ? h3("Parking and Getting There") + paragraphs(l.parking) : "",
  ].join("\n");
}

/* ---------------- Review ---------------- */
function themeBlock(t, kind) {
  const meta = [t.count, kind === "complaint" ? t.note : "", t.recency].filter(Boolean).map(esc).join(" · ");
  return `<div class="review-theme review-theme-${kind}">
    <p class="review-theme-title"><strong>${esc(t.title || "")}</strong>${meta ? ` <span class="review-theme-meta">(${meta})</span>` : ""}</p>
    ${has(t.summary) ? `<p>${inline(t.summary)}</p>` : ""}
    ${has(t.example) ? `<p class="review-example">${inline(t.example)}</p>` : ""}
    ${has(t.operatorResponse) ? `<p class="review-operator-response"><strong>Operator response:</strong> ${inline(t.operatorResponse)}</p>` : ""}
  </div>`;
}
function reviewHtml(c, opts = {}) {
  const r = (c && c.review) || {};
  if (!has(r.methodology) && !has(r.praise) && !has(r.complaints) && !has(r.ratings)) return "";
  const praise = list(r.praise), complaints = list(r.complaints);
  // The template's "Ratings from every source" cards already show these when
  // Admin tab 2 has no ratings, so the table is skipped there (skipRatings).
  const ratings = opts.skipRatings ? [] : list(r.ratings).filter((x) => x && x.platform && (x.rating != null || x.count != null));
  return `
    ${has(r.methodology) ? `<p class="review-methodology">${inline(r.methodology)}</p>` : ""}
    ${ratings.length ? `<div class="table-scroll"><table class="comparison-table ratings-table"><caption class="visually-hidden">Public ratings by platform</caption><thead><tr><th scope="col">Platform</th><th scope="col">Rating</th><th scope="col">Reviews</th><th scope="col">Checked</th></tr></thead><tbody>
      ${ratings.map((x) => `<tr><td>${esc(x.platform)}</td><td>${x.rating != null ? esc(Number(x.rating).toFixed(1)) + " / 5" : "—"}</td><td>${x.count != null ? esc(Number(x.count).toLocaleString("en-US")) : "—"}</td><td>${esc(x.asOf || "")}</td></tr>`).join("")}
    </tbody></table></div>` : ""}
    ${praise.length ? h3("What Reviewers Praise") + praise.map((t) => themeBlock(t, "praise")).join("") : ""}
    ${complaints.length ? h3("What Reviewers Complain About") + complaints.map((t) => themeBlock(t, "complaint")).join("") : ""}
    ${has(r.operatorWide) ? h3("About the Operator in General") + paragraphs(r.operatorWide) : ""}`;
}

/* ---------------- Verdict ---------------- */
function verdictHtml(c, ctaHref) {
  const v = (c && c.verdict) || {};
  if (!has(v.intro) && !has(v.bookIf)) return "";
  return `
    <div class="verdict-box">
      <div class="verdict-eyebrow">Tripreviewall's Take</div>
      ${paragraphs(v.intro)}
      ${has(v.bookIf) || has(v.skipIf) ? `<div class="verdict-cols">
        ${has(v.bookIf) ? `<div><div class="verdict-col-title">Book This Tour If…</div>${ul(v.bookIf, "verdict-list good")}</div>` : ""}
        ${has(v.skipIf) ? `<div><div class="verdict-col-title">Skip This Tour If…</div>${ul(v.skipIf, "verdict-list knowing", PIN)}</div>` : ""}
      </div>` : ""}
      ${has(v.tips) ? `<div class="verdict-col-title" style="margin-top:20px;">Tips From Reviewers and Operator Notes</div>${ul(v.tips, "plain-list", "")}` : ""}
      ${has(v.cta) && ctaHref ? `<p class="verdict-cta"><a href="${esc(ctaHref)}" target="_blank" rel="noopener sponsored">${esc(v.cta)} →</a></p>` : ""}
      ${c && c.updatedOn ? `<p class="verdict-byline">Assessed by the Tripreviewall editorial team, last reviewed ${esc(c.updatedOn)}.</p>` : ""}
    </div>`;
}

/* ---------------- FAQ ---------------- */
function faqItems(c) {
  return list(c && c.faq).filter((f) => f && has(f.q) && has(f.a));
}
function faqHtml(c) {
  const items = faqItems(c);
  if (!items.length) return "";
  return items.map((f) => `<div class="faq-block"><h3 class="faq-q">${esc(f.q)}</h3><p class="detail-body-text">${inline(f.a)}</p></div>`).join("");
}
function faqJsonLd(c) {
  const items = faqItems(c);
  if (!items.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

/* ---------------- Contact extras ---------------- */
function contactExtraHtml(c) {
  const k = (c && c.contact) || {};
  const rows = [];
  if (has(k.website) && /^https?:\/\//i.test(k.website)) rows.push(`<li><span>Website:</span> <a href="${esc(k.website)}" target="_blank" rel="noopener nofollow">${esc(k.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a></li>`);
  if (has(k.address)) rows.push(`<li><span>Address:</span> ${esc(k.address)}</li>`);
  if (has(k.hours)) rows.push(`<li><span>Hours:</span> ${esc(k.hours)}</li>`);
  return rows.length ? `<ul class="contact-extra">${rows.join("")}</ul>` : "";
}

module.exports = { overviewHtml, locationHtml, reviewHtml, verdictHtml, faqHtml, faqJsonLd, contactExtraHtml, has };
