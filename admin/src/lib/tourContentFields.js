/**
 * Admin form ⇄ tour.data.content (structured page content).
 *
 * The admin edits plain textareas; this file turns them into the structured
 * object that ssr/tourContent.js renders, and back. Formats:
 *   - lists:   one item per line
 *   - text:    paragraphs separated by a blank line
 *   - review themes: blocks separated by a blank line —
 *         Title — 4 of 11 reviews we read
 *         [operator issue · most recent: May 2026]        (optional, complaints only)
 *         Summary sentence(s).
 *         — GetYourGuide, 5★, June 2026: paraphrased example
 *         Operator response: …                            (optional)
 *   - ratings: one per line  "TripAdvisor | 4.8 | 312 | October 2026"
 *   - FAQ: blocks separated by a blank line —  "Q: …" then "A: …"
 */
const lines = (s) => String(s || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const text = (s) => String(s || "").replace(/\r\n/g, "\n").trim();
const blocks = (s) => text(s).split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);

function parseThemes(s, kind) {
  return blocks(s).map((b) => {
    const ls = lines(b);
    const first = ls.shift() || "";
    const m = first.match(/^(.*?)\s+[—–-]\s+(.*)$/);
    const t = { title: m ? m[1].trim() : first, count: m ? m[2].trim() : "", summary: "", example: "" };
    if (kind === "complaint") { t.note = ""; t.recency = ""; t.operatorResponse = ""; }
    const summary = [];
    for (const l of ls) {
      if (/^\[.*\]$/.test(l) && kind === "complaint") {
        l.slice(1, -1).split("·").map((x) => x.trim()).forEach((part) => {
          if (/^most recent/i.test(part)) t.recency = part; else t.note = t.note ? `${t.note} · ${part}` : part;
        });
      } else if (/^operator response:/i.test(l) && kind === "complaint") t.operatorResponse = l.replace(/^operator response:\s*/i, "");
      else if (/^[—–]\s/.test(l)) t.example = l;
      else summary.push(l);
    }
    t.summary = summary.join(" ");
    return t;
  });
}
function themesText(arr, kind) {
  return (arr || []).map((t) => {
    const out = [`${t.title || ""}${t.count ? ` — ${t.count}` : ""}`];
    if (kind === "complaint" && (t.note || t.recency)) out.push(`[${[t.note, t.recency].filter(Boolean).join(" · ")}]`);
    if (t.summary) out.push(t.summary);
    if (t.example) out.push(/^[—–]/.test(t.example) ? t.example : `— ${t.example}`);
    if (kind === "complaint" && t.operatorResponse) out.push(`Operator response: ${t.operatorResponse}`);
    return out.join("\n");
  }).join("\n\n");
}
function parseRatings(s) {
  return lines(s).map((l) => {
    const [platform, rating, count, asOf] = l.split("|").map((x) => x.trim());
    if (!platform) return null;
    return { platform, rating: rating && !isNaN(Number(rating)) ? Number(rating) : null, count: count && !isNaN(Number(String(count).replace(/,/g, ""))) ? Number(String(count).replace(/,/g, "")) : null, asOf: asOf || "" };
  }).filter(Boolean);
}
function ratingsText(arr) {
  return (arr || []).map((r) => [r.platform, r.rating != null ? r.rating : "", r.count != null ? r.count : "", r.asOf || ""].join(" | ")).join("\n");
}
function parseFaq(s) {
  return blocks(s).map((b) => {
    const q = (b.match(/^Q:\s*(.*)$/m) || [])[1];
    const a = (b.match(/^A:\s*([\s\S]*)$/m) || [])[1];
    return q && a ? { q: q.trim(), a: a.trim().replace(/\s*\n\s*/g, " ") } : null;
  }).filter(Boolean);
}
function faqText(arr) { return (arr || []).map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n"); }

/** Form body → content object (merged over what the tour already had). */
function bodyToContent(body, existing = {}) {
  const b = (k) => body[k];
  const c = {
    ...existing,
    overview: {
      verdictSnippet: text(b("c_verdictSnippet")), highlights: lines(b("c_highlights")), whatToExpect: lines(b("c_whatToExpect")),
      included: lines(b("c_included")), notIncluded: lines(b("c_notIncluded")), whatToBring: lines(b("c_whatToBring")),
      restrictions: lines(b("c_restrictions")), cancellationPolicy: text(b("c_cancellationPolicy")),
    },
    location: { meetingPoint: text(b("c_meetingPoint")), checkIn: text(b("c_checkIn")), parking: text(b("c_parking")) },
    review: {
      methodology: text(b("c_methodology")), ratings: parseRatings(b("c_ratings")),
      praise: parseThemes(b("c_praise"), "praise"), complaints: parseThemes(b("c_complaints"), "complaint"), operatorWide: text(b("c_operatorWide")),
    },
    verdict: { intro: text(b("c_verdictIntro")), bookIf: lines(b("c_bookIf")), skipIf: lines(b("c_skipIf")), tips: lines(b("c_tips")), cta: text(b("c_cta")) },
    faq: parseFaq(b("c_faq")),
    contact: { website: text(b("c_website")), address: text(b("c_address")), hours: text(b("c_hours")) },
    updatedOn: text(b("c_updatedOn")) || existing.updatedOn || "",
  };
  return c;
}

/** content object → values for the textareas. */
function contentToFields(c) {
  c = c || {}; const o = c.overview || {}, l = c.location || {}, r = c.review || {}, v = c.verdict || {}, k = c.contact || {};
  return {
    c_verdictSnippet: o.verdictSnippet || "", c_highlights: (o.highlights || []).join("\n"), c_whatToExpect: (o.whatToExpect || []).join("\n"),
    c_included: (o.included || []).join("\n"), c_notIncluded: (o.notIncluded || []).join("\n"), c_whatToBring: (o.whatToBring || []).join("\n"),
    c_restrictions: (o.restrictions || []).join("\n"), c_cancellationPolicy: o.cancellationPolicy || "",
    c_meetingPoint: l.meetingPoint || "", c_checkIn: l.checkIn || "", c_parking: l.parking || "",
    c_methodology: r.methodology || "", c_ratings: ratingsText(r.ratings), c_praise: themesText(r.praise, "praise"),
    c_complaints: themesText(r.complaints, "complaint"), c_operatorWide: r.operatorWide || "",
    c_verdictIntro: v.intro || "", c_bookIf: (v.bookIf || []).join("\n"), c_skipIf: (v.skipIf || []).join("\n"), c_tips: (v.tips || []).join("\n"), c_cta: v.cta || "",
    c_faq: faqText(c.faq), c_website: k.website || "", c_address: k.address || "", c_hours: k.hours || "", c_updatedOn: c.updatedOn || "",
  };
}

module.exports = { bodyToContent, contentToFields, parseThemes, themesText, parseFaq, faqText, parseRatings };
