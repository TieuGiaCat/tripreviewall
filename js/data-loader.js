/* ============================================================
   tripreviewall.com — live data loader
   ------------------------------------------------------------
   Tries the public API (backed by Postgres, kept in sync with
   Admin) first. Falls back to the bundled static snapshot in
   data/tours-full.js (ALL_TOURS_FALLBACK) if the API is
   unreachable — e.g. when previewing this site as local files
   with no backend running. Every page loads this before
   rendering anything that depends on tour data.
   ============================================================ */

async function loadAllTours() {
  try {
    const res = await fetch("/api/tours", { cache: "no-store" });
    if (!res.ok) throw new Error("API responded with " + res.status);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("API response was not an array");
    if (data.length === 0) throw new Error("API returned zero tours");
    return data;
  } catch (err) {
    console.warn("[data-loader] Live API unavailable, using bundled snapshot instead:", err.message);
    return typeof ALL_TOURS_FALLBACK !== "undefined" ? ALL_TOURS_FALLBACK : [];
  }
}

async function loadOneTour(slug) {
  try {
    const res = await fetch(`/api/tours/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!res.ok) throw new Error("API responded with " + res.status);
    return await res.json();
  } catch (err) {
    console.warn("[data-loader] Live API unavailable for single tour, checking bundled snapshot:", err.message);
    const list = typeof ALL_TOURS_FALLBACK !== "undefined" ? ALL_TOURS_FALLBACK : [];
    return list.find((t) => t.slug === slug) || null;
  }
}

async function loadAllPosts() {
  try {
    const res = await fetch("/api/posts", { cache: "no-store" });
    if (!res.ok) throw new Error("API responded with " + res.status);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("API response was not an array");
    if (data.length === 0) throw new Error("API returned zero posts");
    return data;
  } catch (err) {
    console.warn("[data-loader] Live posts API unavailable, using bundled snapshot instead:", err.message);
    return typeof BLOG_POSTS_FALLBACK !== "undefined" ? BLOG_POSTS_FALLBACK : [];
  }
}

async function loadOnePost(slug) {
  try {
    const res = await fetch(`/api/posts/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!res.ok) throw new Error("API responded with " + res.status);
    return await res.json();
  } catch (err) {
    console.warn("[data-loader] Live post API unavailable, checking bundled snapshot:", err.message);
    const list = typeof BLOG_POSTS_FALLBACK !== "undefined" ? BLOG_POSTS_FALLBACK : [];
    return list.find((p) => p.slug === slug) || null;
  }
}
