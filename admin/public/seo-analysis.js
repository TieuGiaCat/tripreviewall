/* ============================================================
   Tripreviewall — SEO & readability analysis (Yoast-style)
   One file used in two places:
     • the admin browser (live panel, admin/public/seo-panel.js)
     • the server (scores saved with each post/tour/page — lib/seoScore.js)
   so both always agree. Pure functions, no DOM: HTML is read with
   regular expressions.

   SeoAnalysis.analyze({
     keyphrase, title, seoTitle, metaDescription, slug, html,
     type: "post" | "tour" | "page", usedElsewhere: ["Label", …]
   }) → { seo: [check…], readability: [check…], seoScore, readabilityScore, stats }
   check = { id, status: "good" | "ok" | "bad", label, text }
   ============================================================ */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SeoAnalysis = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------------- text helpers ---------------- */
  var ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…" };
  function decode(s) {
    return String(s || "").replace(/&(#x?[0-9a-f]+|\w+);/gi, function (m, e) {
      if (e[0] === "#") {
        var n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return isNaN(n) ? m : String.fromCharCode(n);
      }
      return Object.prototype.hasOwnProperty.call(ENTITIES, e.toLowerCase()) ? ENTITIES[e.toLowerCase()] : m;
    });
  }
  function stripTags(html) {
    return decode(String(html || "").replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, " ").replace(/<\/(p|li|h[1-6]|td|th|div|tr)>/gi, " </$1>").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  }
  /** lower-case, no accents, no ʻokina/apostrophes, punctuation → spaces. "Kauaʻi's" → "kauais" */
  function norm(s) {
    var t = String(s || "").toLowerCase();
    if (t.normalize) t = t.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return t.replace(/[ʻʼ’‘'`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  }
  var STOP = ("a an the and or of in on at to for with by from is are be your you our we it its this that these those as into than then " +
    "what which who how why when where do does can i my me vs").split(" ");
  function stem(w) {
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + "y";
    if (w.length > 4 && /(sses|xes|ches|shes)$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function words(s) { var n = norm(s); return n ? n.split(" ") : []; }
  function contentWords(s) {
    var all = words(s);
    var c = all.filter(function (w) { return STOP.indexOf(w) === -1; });
    return (c.length ? c : all).map(stem);
  }
  /** "exact" (whole phrase, any accents/case), "words" (every content word present, any order/plural) or "none". */
  function match(text, keyphrase) {
    var t = " " + norm(text) + " ";
    var k = norm(keyphrase);
    if (!k) return "none";
    if (t.indexOf(" " + k + " ") !== -1) return "exact";
    var have = {};
    words(text).forEach(function (w) { have[stem(w)] = true; });
    var need = contentWords(keyphrase);
    return need.length && need.every(function (w) { return have[w]; }) ? "words" : "none";
  }
  function countExact(text, keyphrase) {
    var t = " " + norm(text) + " ", k = " " + norm(keyphrase) + " ";
    if (k.trim() === "") return 0;
    var n = 0, i = t.indexOf(k);
    while (i !== -1) { n++; i = t.indexOf(k, i + k.length - 1); }
    return n;
  }
  function splitSentences(text) {
    return String(text || "").replace(/([.!?])\s+(?=[A-Z0-9“"(])/g, "$1\n").split(/\n+/).map(function (s) { return s.trim(); }).filter(function (s) { return words(s).length > 0; });
  }

  /* ---------------- HTML structure ---------------- */
  function parse(html) {
    html = String(html || "");
    var headings = [], m;
    var hRe = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
    while ((m = hRe.exec(html))) headings.push({ level: +m[1], text: stripTags(m[2]) });
    var paragraphs = [];
    var pRe = /<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    while ((m = pRe.exec(html))) {
      var t = stripTags(m[2]);
      if (t) paragraphs.push({ tag: m[1].toLowerCase(), text: t });
    }
    var links = [];
    var aRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    while ((m = aRe.exec(html))) {
      var href = (m[1].match(/\bhref\s*=\s*["']([^"']*)["']/i) || [])[1];
      links.push({ href: href == null ? "" : decode(href).trim(), text: stripTags(m[2]) });
    }
    var images = [];
    var iRe = /<img\b([^>]*)>/gi;
    while ((m = iRe.exec(html))) images.push({ alt: decode((m[1].match(/\balt\s*=\s*["']([^"']*)["']/i) || [])[1] || "") });
    // Text blocks between subheadings (for "subheading distribution").
    var sections = html.split(/<h[2-6]\b[^>]*>[\s\S]*?<\/h[2-6]>/i).map(function (part) { return words(stripTags(part)).length; });
    return { headings: headings, paragraphs: paragraphs, links: links, images: images, sections: sections, text: stripTags(html) };
  }

  /* Rough Google title width (Arial 20px) — same everywhere, so browser and server agree. */
  function titleWidth(s) {
    var w = 0;
    String(s || "").split("").forEach(function (ch) {
      if (/[ilj.,:;'|!ʻ’ ]/.test(ch)) w += 5.6;
      else if (/[ft r()\[\]\-]/.test(ch)) w += 6.7;
      else if (/[mwMW]/.test(ch)) w += 16.7;
      else if (/[A-Z]/.test(ch)) w += 13.3;
      else if (/[0-9]/.test(ch)) w += 11.1;
      else w += 10.6;
    });
    return Math.round(w);
  }
  var TITLE_MAX_PX = 580;

  function syllables(word) {
    word = word.toLowerCase().replace(/[^a-z]/g, "");
    if (!word) return 0;
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
    var g = word.match(/[aeiouy]{1,2}/g);
    return Math.max(1, g ? g.length : 1);
  }

  var TRANSITIONS = ("also,although,as a result,because,besides,but,consequently,despite,during,especially,finally,first,firstly,for example,for instance," +
    "furthermore,hence,however,in addition,in contrast,in fact,in short,in other words,indeed,instead,likewise,meanwhile,moreover,nevertheless," +
    "next,nonetheless,otherwise,overall,second,secondly,similarly,since,so,still,then,therefore,third,though,thus,ultimately,unless,whereas,while," +
    "yet,above all,after that,afterwards,at the same time,before,by contrast,even so,for this reason,if,in the end,on the other hand,once,unlike,until,when").split(",");

  /* ---------------- the checks ---------------- */
  function check(id, status, label, text) { return { id: id, status: status, label: label, text: text }; }
  function pct(n) { return Math.round(n * 10) / 10; }

  function analyze(input) {
    var o = input || {};
    var type = o.type || "post";
    var kp = String(o.keyphrase || "").trim();
    var p = parse(o.html);
    var allText = [o.title || "", p.text].join(" ");
    var wordCount = words(p.text).length;
    var seo = [];
    var kpWords = words(kp).length;
    // Yoast counts only content words for length ("things to do in kauai" = 2: things, kauai).
    var kpContent = kp ? contentWords(kp).length : 0;

    /* -- keyphrase checks -- */
    if (!kp) {
      seo.push(check("keyphraseLength", "bad", "Focus keyphrase", "No focus keyphrase set. Enter the main word or phrase people would search for to find this page."));
    } else {
      seo.push(kpContent <= 4
        ? check("keyphraseLength", "good", "Keyphrase length", "Good length (" + kpContent + " content word" + (kpContent === 1 ? "" : "s") + ").")
        : check("keyphraseLength", kpContent <= 8 ? "ok" : "bad", "Keyphrase length", "The keyphrase has " + kpContent + " content words. Keep it to 4 or fewer — the phrase people actually type."));

      var used = (o.usedElsewhere || []).filter(Boolean);
      seo.push(used.length
        ? check("previouslyUsed", "bad", "Previously used keyphrase", "Already the focus keyphrase of: " + used.slice(0, 3).join(", ") + ". Two pages chasing the same search compete with each other — pick a different angle.")
        : check("previouslyUsed", "good", "Previously used keyphrase", "You haven't used this keyphrase before."));

      var finalTitle = o.seoTitle || o.title || "";
      var tm = match(finalTitle, kp);
      var startsWith = norm(finalTitle).indexOf(norm(kp)) === 0;
      seo.push(tm === "exact" && startsWith
        ? check("keyphraseInSeoTitle", "good", "Keyphrase in SEO title", "The exact keyphrase is at the start of the SEO title.")
        : tm === "exact" ? check("keyphraseInSeoTitle", "ok", "Keyphrase in SEO title", "The keyphrase is in the SEO title, but not at the start. Move it to the front if it reads naturally.")
        : tm === "words" ? check("keyphraseInSeoTitle", "ok", "Keyphrase in SEO title", "All keyphrase words are in the SEO title, but not as the exact phrase.")
        : check("keyphraseInSeoTitle", "bad", "Keyphrase in SEO title", "The SEO title doesn't contain the keyphrase."));

      if (type !== "page") {
        var hm = match(o.title || "", kp);
        seo.push(hm !== "none"
          ? check("keyphraseInH1", "good", "Keyphrase in H1", "The main heading (H1) contains the keyphrase.")
          : check("keyphraseInH1", "ok", "Keyphrase in H1", "The page heading (H1) doesn't contain the keyphrase."));
      }

      var md = o.metaDescription || "";
      var mdCount = countExact(md, kp) || (match(md, kp) !== "none" ? 1 : 0);
      seo.push(!md ? check("keyphraseInMeta", "bad", "Keyphrase in meta description", "No meta description, so this can't be checked.")
        : mdCount === 0 ? check("keyphraseInMeta", "bad", "Keyphrase in meta description", "The meta description doesn't contain the keyphrase. Google bolds it in results when it does.")
        : mdCount <= 2 ? check("keyphraseInMeta", "good", "Keyphrase in meta description", "The keyphrase appears in the meta description.")
        : check("keyphraseInMeta", "ok", "Keyphrase in meta description", "The keyphrase appears " + mdCount + " times in the meta description — that reads as stuffing."));

      if (o.slug !== undefined) {
        var slugWords = String(o.slug || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(stem);
        var need = contentWords(kp);
        var found = need.filter(function (w) { return slugWords.indexOf(w) !== -1; }).length;
        seo.push(found === need.length && need.length ? check("keyphraseInSlug", "good", "Keyphrase in slug", "The URL slug contains the keyphrase.")
          : found ? check("keyphraseInSlug", "ok", "Keyphrase in slug", "The slug contains only part of the keyphrase.")
          : check("keyphraseInSlug", "bad", "Keyphrase in slug", "The slug doesn't contain the keyphrase."));
      }

      var intro = p.paragraphs.length ? p.paragraphs[0].text : p.text.split(" ").slice(0, 80).join(" ");
      var introSentenceHit = splitSentences(intro).some(function (s) { return match(s, kp) !== "none"; });
      seo.push(introSentenceHit ? check("keyphraseInIntro", "good", "Keyphrase in introduction", "The keyphrase appears in the first paragraph.")
        : check("keyphraseInIntro", "bad", "Keyphrase in introduction", "The keyphrase isn't in the first paragraph. Say what the page is about straight away."));

      var subs = p.headings.filter(function (h) { return h.level === 2 || h.level === 3; });
      if (subs.length) {
        var hits = subs.filter(function (h) { return match(h.text, kp) !== "none"; }).length;
        var ratio = hits / subs.length;
        seo.push(ratio >= 0.3 && ratio <= 0.75 ? check("keyphraseInSubheadings", "good", "Keyphrase in subheadings", hits + " of " + subs.length + " subheadings mention the keyphrase or its words. Nice balance.")
          : hits === 0 ? check("keyphraseInSubheadings", "bad", "Keyphrase in subheadings", "None of the " + subs.length + " H2/H3 subheadings mention the keyphrase.")
          : ratio < 0.3 ? check("keyphraseInSubheadings", "ok", "Keyphrase in subheadings", "Only " + hits + " of " + subs.length + " subheadings mention the keyphrase. Aim for about a third.")
          : check("keyphraseInSubheadings", "ok", "Keyphrase in subheadings", hits + " of " + subs.length + " subheadings repeat the keyphrase — vary them so it doesn't read as stuffing."));
      }

      var occurrences = countExact(allText, kp);
      if (!occurrences && match(allText, kp) !== "none") {
        occurrences = splitSentences(allText).filter(function (s) { return match(s, kp) !== "none"; }).length;
      }
      var density = wordCount ? (occurrences * Math.max(1, kpWords) / wordCount) * 100 : 0;
      var minTimes = Math.max(1, Math.round(wordCount * 0.005 / Math.max(1, kpWords)));
      seo.push(wordCount < 100 ? check("keyphraseDensity", "ok", "Keyphrase density", "Not enough text yet to measure density.")
        : density >= 0.5 && density <= 3 ? check("keyphraseDensity", "good", "Keyphrase density", "Found " + occurrences + " time" + (occurrences === 1 ? "" : "s") + " (" + pct(density) + "%). Great.")
        : density < 0.5 ? check("keyphraseDensity", occurrences ? "ok" : "bad", "Keyphrase density", "Found " + occurrences + " time" + (occurrences === 1 ? "" : "s") + " (" + pct(density) + "%). For " + wordCount + " words, use it about " + minTimes + "+ times — naturally.")
        : check("keyphraseDensity", "bad", "Keyphrase density", "Found " + occurrences + " times (" + pct(density) + "%) — too often. Use synonyms."));

      if (p.images.length) {
        var altHits = p.images.filter(function (im) { return match(im.alt, kp) !== "none"; }).length;
        var noAlt = p.images.filter(function (im) { return !im.alt.trim(); }).length;
        seo.push(noAlt ? check("imageAlt", "bad", "Image alt text", noAlt + " of " + p.images.length + " images have no alt text.")
          : altHits ? check("imageAlt", "good", "Image keyphrase", altHits + " of " + p.images.length + " image alt texts mention the keyphrase.")
          : check("imageAlt", "ok", "Image keyphrase", "Images have alt text, but none mention the keyphrase."));
      }
    }

    /* -- checks that don't need a keyphrase -- */
    var st = o.seoTitle || o.title || "";
    var px = titleWidth(st);
    seo.push(!st ? check("seoTitleWidth", "bad", "SEO title width", "No SEO title.")
      : px > TITLE_MAX_PX ? check("seoTitleWidth", "bad", "SEO title width", "Too long (" + st.length + " characters) — Google will cut it off. Shorten to ~60 characters including the site name.")
      : px < 300 ? check("seoTitleWidth", "ok", "SEO title width", "Short (" + st.length + " characters). There's room to add a benefit or detail.")
      : check("seoTitleWidth", "good", "SEO title width", "Good length (" + st.length + " characters)."));

    var mdLen = (o.metaDescription || "").length;
    seo.push(!mdLen ? check("metaLength", "bad", "Meta description length", "No meta description. Google will invent one from the page text.")
      : mdLen < 120 ? check("metaLength", "ok", "Meta description length", "Short (" + mdLen + " characters). Up to 156 are shown.")
      : mdLen > 156 ? check("metaLength", "ok", "Meta description length", "Long (" + mdLen + " characters). Anything past ~156 is cut off.")
      : check("metaLength", "good", "Meta description length", "Well done (" + mdLen + " characters)."));

    var minWords = type === "page" ? 150 : 300;
    seo.push(wordCount >= minWords ? check("textLength", "good", "Text length", wordCount.toLocaleString("en-US") + " words. Good.")
      : wordCount >= minWords * 0.6 ? check("textLength", "ok", "Text length", wordCount + " words — a little thin. Aim for at least " + minWords + ".")
      : check("textLength", "bad", "Text length", wordCount + " words — far below the recommended minimum of " + minWords + "."));

    var EMPTY = /^(#|#needs-link|about:blank|javascript:.*)?$/i;
    var empty = p.links.filter(function (l) { return EMPTY.test(l.href); });
    if (empty.length) {
      seo.push(check("emptyLinks", "bad", "Links without an address", empty.length + " link" + (empty.length === 1 ? " has" : "s have") + " no URL yet: " +
        empty.slice(0, 4).map(function (l) { return "“" + l.text + "”"; }).join(", ") + (empty.length > 4 ? "…" : "") + ". On the live page they show as plain text until fixed."));
    }
    var real = p.links.filter(function (l) { return !EMPTY.test(l.href); });
    var internal = real.filter(function (l) { return /^\/(?!\/)/.test(l.href) || /^https?:\/\/(www\.)?tripreviewall\.com/i.test(l.href); });
    var outbound = real.filter(function (l) { return /^https?:\/\//i.test(l.href) && internal.indexOf(l) === -1; });
    if (type === "post") { // tour pages get their links (similar tours, booking buttons) from the template
      seo.push(internal.length ? check("internalLinks", "good", "Internal links", internal.length + " link" + (internal.length === 1 ? "" : "s") + " to other Tripreviewall pages.")
        : check("internalLinks", "bad", "Internal links", "No links to other Tripreviewall pages. Link to related tours and guides."));
      seo.push(outbound.length ? check("outboundLinks", "good", "Outbound links", outbound.length + " outbound link" + (outbound.length === 1 ? "" : "s") + ".")
        : check("outboundLinks", "ok", "Outbound links", "No outbound links (sources, booking partners, official sites)."));
      if (!p.images.length && type === "post") seo.push(check("images", "ok", "Images", "No images in the text. Add at least one photo with descriptive alt text."));
    }
    var h1s = p.headings.filter(function (h) { return h.level === 1; }).length;
    if (h1s && type !== "page") seo.push(check("singleH1", "bad", "Single title", "The text contains " + h1s + " H1 heading" + (h1s === 1 ? "" : "s") + ". The page title is already the H1 — use H2/H3 inside the article."));

    /* -- readability -- */
    var rd = [];
    var sentences = splitSentences(p.text);
    if (wordCount >= 50 && sentences.length) {
      var long = sentences.filter(function (s) { return words(s).length > 20; }).length;
      var longPct = long / sentences.length * 100;
      rd.push(longPct <= 25 ? check("sentenceLength", "good", "Sentence length", "Great — " + pct(longPct) + "% of sentences are over 20 words.")
        : longPct <= 30 ? check("sentenceLength", "ok", "Sentence length", pct(longPct) + "% of sentences are over 20 words (aim for 25% or less).")
        : check("sentenceLength", "bad", "Sentence length", pct(longPct) + "% of sentences are over 20 words — too many. Split some up."));

      var longParas = p.paragraphs.filter(function (x) { return words(x.text).length > 150; });
      rd.push(!longParas.length ? check("paragraphLength", "good", "Paragraph length", "No paragraph is too long.")
        : check("paragraphLength", longParas.some(function (x) { return words(x.text).length > 200; }) ? "bad" : "ok", "Paragraph length", longParas.length + " paragraph" + (longParas.length === 1 ? " is" : "s are") + " over 150 words. Break them up — most readers are on phones."));

      if (wordCount > 300) {
        var longSections = p.sections.filter(function (n) { return n > 300; });
        rd.push(!longSections.length ? check("subheadingDistribution", "good", "Subheading distribution", "Great job using subheadings.")
          : check("subheadingDistribution", longSections.some(function (n) { return n > 350; }) ? "bad" : "ok", "Subheading distribution", longSections.length + " section" + (longSections.length === 1 ? "" : "s") + " run over 300 words without a subheading."));
      }

      var trans = sentences.filter(function (s) {
        var lower = " " + norm(s) + " ";
        return TRANSITIONS.some(function (t) { return lower.indexOf(" " + t + " ") !== -1; });
      }).length;
      var transPct = trans / sentences.length * 100;
      rd.push(transPct >= 30 ? check("transitionWords", "good", "Transition words", pct(transPct) + "% of sentences use transition words. Well done.")
        : transPct >= 20 ? check("transitionWords", "ok", "Transition words", "Only " + pct(transPct) + "% of sentences use transition words (however, because, so…). Aim for 30%.")
        : check("transitionWords", "bad", "Transition words", "Only " + pct(transPct) + "% of sentences use transition words. They help readers follow your reasoning."));

      var starts = sentences.map(function (s) { return words(s)[0] || ""; });
      var run = 1, maxRun = 1;
      for (var i = 1; i < starts.length; i++) { run = starts[i] && starts[i] === starts[i - 1] ? run + 1 : 1; if (run > maxRun) maxRun = run; }
      rd.push(maxRun >= 3 ? check("sentenceBeginnings", "ok", "Consecutive sentences", maxRun + " sentences in a row start with the same word. Mix it up.")
        : check("sentenceBeginnings", "good", "Consecutive sentences", "Sentence beginnings are varied."));

      var syl = 0;
      words(p.text).forEach(function (w) { syl += syllables(w); });
      var flesch = 206.835 - 1.015 * (wordCount / sentences.length) - 84.6 * (syl / wordCount);
      flesch = Math.max(0, Math.min(100, Math.round(flesch * 10) / 10));
      rd.push(flesch >= 60 ? check("fleschReadingEase", "good", "Flesch Reading Ease", "Scores " + flesch + " — easy to read.")
        : flesch >= 50 ? check("fleschReadingEase", "ok", "Flesch Reading Ease", "Scores " + flesch + " — fairly difficult. Shorter words and sentences help.")
        : check("fleschReadingEase", "bad", "Flesch Reading Ease", "Scores " + flesch + " — difficult. Use shorter sentences and simpler words."));
    } else {
      rd.push(check("notEnoughText", "ok", "Not enough text", "Write at least 50 words to get a readability analysis."));
    }

    return {
      seo: seo,
      readability: rd,
      seoScore: kp ? score(seo) : "na",
      readabilityScore: wordCount >= 50 ? score(rd) : "na",
      stats: { words: wordCount, sentences: sentences.length, internalLinks: internal.length, outboundLinks: outbound.length, emptyLinks: empty.length, titleWidth: px, titleMaxWidth: TITLE_MAX_PX },
    };
  }

  /** Yoast-like overall traffic light: average of good=9 / ok=6 / bad=3. */
  function score(checks) {
    if (!checks.length) return "na";
    var pts = { good: 9, ok: 6, bad: 3 };
    var avg = checks.reduce(function (s, c) { return s + pts[c.status]; }, 0) / checks.length;
    return avg >= 7 ? "good" : avg >= 5 ? "ok" : "bad";
  }

  /**
   * The text of a tour page as visitors see it, built from the tour's fields
   * (used by both the admin panel and the server score, so they agree).
   * t = { name, company, fullDescription, highlights[], verdict{headline, goodFor[], worthKnowing[], closingNote}, gallery[] }
   */
  function tourHtml(t) {
    t = t || {};
    var e = function (x) { return String(x == null ? "" : x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
    var desc = String(t.fullDescription || "");
    var descHtml = /<p[\s>]/i.test(desc) ? desc : desc.split(/\n\s*\n|\n/).filter(function (x) { return x.trim(); }).map(function (x) { return "<p>" + e(x.trim()) + "</p>"; }).join("");
    var list = function (arr) { return (arr || []).filter(Boolean).map(function (x) { return "<li>" + e(x) + "</li>"; }).join(""); };
    var v = t.verdict || {};
    var alt = e((t.name || "") + (t.company ? " — " + t.company : ""));
    return "<h2>Overview</h2>" + descHtml +
      ((t.highlights || []).length ? "<h2>Highlights</h2><ul>" + list(t.highlights) + "</ul>" : "") +
      (v.headline || (v.goodFor || []).length ? "<h2>Our Verdict</h2>" + (v.headline ? "<p>" + e(v.headline) + "</p>" : "") +
        ((v.goodFor || []).length ? "<h3>Good for</h3><ul>" + list(v.goodFor) + "</ul>" : "") +
        ((v.worthKnowing || []).length ? "<h3>Worth knowing</h3><ul>" + list(v.worthKnowing) + "</ul>" : "") +
        (v.closingNote ? "<p>" + e(v.closingNote) + "</p>" : "") : "") +
      (t.gallery || []).map(function () { return '<img src="x" alt="' + alt + '">'; }).join("");
  }

  return { analyze: analyze, tourHtml: tourHtml, match: match, norm: norm, titleWidth: titleWidth, stripTags: stripTags, TITLE_MAX_PX: TITLE_MAX_PX };
});
