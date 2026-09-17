const fs = require("fs");
const path = require("path");
const { query } = require("../db");
const { esc } = require("../utils");

const SITE_ROOT = process.env.SITE_ROOT || path.join(__dirname, "..", "..", "..", "site-not-configured");

/**
 * Rewrites the <title> and <meta name="description"> tags inside an HTML
 * string. Replaces the existing tag if present; inserts a new one right
 * after <head> if missing. Leaves the tag alone entirely if no override
 * value was given for it.
 *
 * Only touches content strictly inside <head>...</head> — some pages have
 * inline SVG icons with their own accessibility <title> elements in the
 * body, and this must never match those.
 */
function applyMetaTags(html, metaTitle, metaDescription) {
  const headMatch = html.match(/<head[^>]*>[\s\S]*?<\/head>/i);
  if (!headMatch) return html; // no <head> section at all — refuse rather than guess where to inject

  let headSection = headMatch[0];

  if (metaTitle) {
    const titleTag = `<title>${esc(metaTitle)}</title>`;
    if (/<title[^>]*>[\s\S]*?<\/title>/i.test(headSection)) {
      headSection = headSection.replace(/<title[^>]*>[\s\S]*?<\/title>/i, titleTag);
    } else {
      headSection = headSection.replace(/<head[^>]*>/i, (m) => `${m}\n${titleTag}`);
    }
  }

  if (metaDescription) {
    const descTag = `<meta name="description" content="${esc(metaDescription)}">`;
    // Matches <meta ... name="description" ...> regardless of attribute order/quote style.
    const descRe = /<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*>/i;
    if (descRe.test(headSection)) {
      headSection = headSection.replace(descRe, descTag);
    } else {
      headSection = headSection.replace(/<head[^>]*>/i, (m) => `${m}\n${descTag}`);
    }
  }

  // Splice the (possibly modified) head section back into the full document,
  // replacing only the original <head>...</head> span.
  return html.slice(0, headMatch.index) + headSection + html.slice(headMatch.index + headMatch[0].length);
}

/** Applies one page_seo row (by page_key) to its file on disk, if the file exists. */
async function applyPageSeoOverride(pageKey) {
  const result = await query(`SELECT file_path, meta_title, meta_description FROM page_seo WHERE page_key = $1`, [pageKey]);
  const row = result.rows[0];
  if (!row) return { applied: false, reason: "No SEO entry for this page." };
  return applyToFile(row.file_path, row.meta_title, row.meta_description);
}

async function applyToFile(filePath, metaTitle, metaDescription) {
  if (!metaTitle && !metaDescription) return { applied: false, reason: "Nothing to apply." };
  const fullPath = path.join(SITE_ROOT, filePath);
  if (!fs.existsSync(fullPath)) return { applied: false, reason: `File not found: ${filePath}` };
  const html = fs.readFileSync(fullPath, "utf8");
  const updated = applyMetaTags(html, metaTitle, metaDescription);
  fs.writeFileSync(fullPath, updated, "utf8");
  return { applied: true };
}

/**
 * Re-applies every saved SEO override. Called after regenerateListingPages()
 * so overrides on Home/Tours-hub/Blog-hub/Destinations-hub survive being
 * regenerated from scratch — and can also be called any time to refresh
 * every registered static page.
 */
async function applyAllPageSeoOverrides() {
  let rows;
  try {
    const result = await query(`SELECT page_key, file_path, meta_title, meta_description FROM page_seo`);
    rows = result.rows;
  } catch (err) {
    console.error("[page-seo] Could not load page_seo rows:", err.message);
    return;
  }
  for (const row of rows) {
    try {
      await applyToFile(row.file_path, row.meta_title, row.meta_description);
    } catch (err) {
      console.error(`[page-seo] Failed to apply override for "${row.page_key}" (${row.file_path}):`, err.message);
    }
  }
}

module.exports = { applyMetaTags, applyPageSeoOverride, applyAllPageSeoOverrides };
