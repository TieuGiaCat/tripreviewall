/* ============================================================
   tripreviewall.com — live data loader
   Pages are rendered by the server; this is only used when a visitor
   re-sorts or filters a tour list in the browser (home tabs, /tours search).
   Returns [] if the API can't be reached — the server-rendered list stays.
   ============================================================ */

async function loadAllTours() {
  try {
    const res = await fetch("/api/tours?fields=card"); // card fields only — much smaller download
    if (!res.ok) throw new Error("API responded with " + res.status);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn("[data-loader] Could not load tours:", err.message);
    return [];
  }
}
