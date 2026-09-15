/**
 * Normalizes a string (filename or tour title) into a set of lowercase
 * words, stripping punctuation, extensions, and common noise so that
 * "Full Day Circle Island Tour See it All.jpg" and
 * "full-day-circle-island-tour-see-it-all" score as a near-perfect match.
 */
function normalizeWords(str) {
  return String(str || "")
    .replace(/\.[a-z0-9]{2,4}$/i, "")           // strip file extension
    .replace(/[_\-]+/g, " ")                     // separators -> spaces
    .replace(/[^\w\s]/g, " ")                    // strip punctuation/mangled encoding artifacts
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);                // drop single letters/empties
}

/** Jaccard similarity between two word sets — 0 (no overlap) to 1 (identical). */
function similarity(a, b) {
  const setA = new Set(normalizeWords(a));
  const setB = new Set(normalizeWords(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

/**
 * Finds the best-matching tour for a given filename.
 * tours: array of { slug, name } — a light projection is enough.
 * Returns { tour, score } for the best match, or { tour: null, score: 0 }.
 */
function findBestMatch(filename, tours) {
  let best = { tour: null, score: 0 };
  for (const t of tours) {
    const score = similarity(filename, t.name);
    if (score > best.score) best = { tour: t, score };
  }
  return best;
}

module.exports = { normalizeWords, similarity, findBestMatch };
