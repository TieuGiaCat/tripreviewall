const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { formidable } = require("formidable");

const UPLOAD_ROOT = path.join(__dirname, "..", "public", "uploads");
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB per image

/**
 * Parses a multipart/form-data POST request containing one or more files
 * under the field name "images". `kind` picks the subfolder — "tours" or
 * "posts" — so each module's uploads stay organized on disk.
 * Returns { urls: string[] } — public URLs (relative to site root) for
 * whatever was successfully saved.
 */
function parseImageUpload(req, kind, itemSlug) {
  const uploadDir = path.join(UPLOAD_ROOT, kind);
  fs.mkdirSync(uploadDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const form = formidable({
      multiples: true,
      maxFileSize: MAX_FILE_BYTES,
      uploadDir,
      keepExtensions: true,
    });

    form.parse(req, (err, fields, files) => {
      if (err) {
        reject(err);
        return;
      }

      let list = files.images;
      if (!list) list = [];
      else if (!Array.isArray(list)) list = [list];

      const urls = [];
      for (const file of list) {
        if (!file || !file.filepath) continue;
        const originalExt = path.extname(file.originalFilename || "").toLowerCase();
        if (!ALLOWED_EXT.has(originalExt)) {
          fs.unlink(file.filepath, () => {});
          continue;
        }
        const safeName = `${slugSafe(itemSlug)}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${originalExt}`;
        const finalPath = path.join(uploadDir, safeName);
        try {
          fs.renameSync(file.filepath, finalPath);
          urls.push(`/uploads/${kind}/${safeName}`);
        } catch (renameErr) {
          console.error("[upload] could not move uploaded file:", renameErr.message);
        }
      }
      resolve({ urls });
    });
  });
}

function slugSafe(s) {
  return String(s || "item").replace(/[^a-z0-9-]/gi, "").slice(0, 60);
}

/**
 * Reads an uploaded CSV file's text content (field name "csvFile") without
 * permanently storing it — used by the Tours Export/Import admin feature.
 * Returns the raw file text, or null if no file was actually uploaded.
 */
function parseCsvUpload(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({ multiples: false, maxFileSize: 5 * 1024 * 1024 });
    form.parse(req, (err, fields, files) => {
      if (err) {
        reject(err);
        return;
      }
      const file = Array.isArray(files.csvFile) ? files.csvFile[0] : files.csvFile;
      if (!file || !file.filepath) {
        resolve(null);
        return;
      }
      try {
        const text = fs.readFileSync(file.filepath, "utf8");
        fs.unlink(file.filepath, () => {});
        resolve(text);
      } catch (readErr) {
        reject(readErr);
      }
    });
  });
}

module.exports = { parseImageUpload, parseCsvUpload, fetchAndConvertToWebp, UPLOAD_ROOT };

/* ============================================================
   Fetch-from-URL → convert to WebP (Media Library "paste a link" feature).
   Uses `sharp` for the actual conversion — this is the one part of the
   project needing a native/compiled dependency, unlike everything else
   here. Run `npm install sharp` on the server before using this.
   ============================================================ */
const MAX_FETCH_BYTES = 15 * 1024 * 1024; // 15MB — generous, since we decode it in memory before shrinking to webp

function isPrivateOrLocalHost(hostname) {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "0.0.0.0") return true;
  const m = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 127) return true;
  }
  return false;
}

/** Fetches a URL's raw bytes, following redirects, refusing non-image responses and private/internal hosts. */
function fetchImageBuffer(url, redirectsLeft) {
  if (redirectsLeft === undefined) redirectsLeft = 5;
  return new Promise((resolve, reject) => {
    if (redirectsLeft < 0) { reject(new Error("Too many redirects.")); return; }

    let parsed;
    try { parsed = new URL(url); } catch (e) { reject(new Error("That doesn't look like a valid URL.")); return; }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") { reject(new Error("URL must start with http:// or https://")); return; }
    if (isPrivateOrLocalHost(parsed.hostname)) { reject(new Error("Refusing to fetch from a private/internal address.")); return; }

    const lib = parsed.protocol === "https:" ? require("https") : require("http");
    const req = lib.get(url, { timeout: 15000, headers: { "User-Agent": "Mozilla/5.0 (Tripreviewall Media Fetcher)" } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        let nextUrl;
        try { nextUrl = new URL(res.headers.location, url).toString(); } catch (e) { reject(new Error("Invalid redirect location.")); return; }
        resolve(fetchImageBuffer(nextUrl, redirectsLeft - 1));
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`The URL responded with status ${res.statusCode}.`)); return; }

      const contentType = res.headers["content-type"] || "";
      if (!contentType.startsWith("image/")) { res.resume(); reject(new Error(`That URL didn't return an image (got "${contentType}").`)); return; }

      const chunks = [];
      let size = 0;
      res.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_FETCH_BYTES) { req.destroy(); reject(new Error("Image is too large (max 15MB).")); return; }
        chunks.push(chunk);
      });
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", (err) => reject(new Error(`Could not reach that URL: ${err.message}`)));
    req.on("timeout", () => { req.destroy(); reject(new Error("Request to that URL timed out.")); });
  });
}

/**
 * Downloads an image from `url`, converts it to WebP via sharp, and saves
 * it into public/uploads/media/. Returns the public URL of the new file.
 * `name` is just used to build a friendly filename.
 */
async function fetchAndConvertToWebp(url, name) {
  let sharp;
  try {
    sharp = require("sharp");
  } catch (err) {
    throw new Error('The "sharp" package isn\'t installed yet — run "npm install sharp" on the server, then try again.');
  }
  const { slugify } = require("./utils");

  const buffer = await fetchImageBuffer(url);
  const webpBuffer = await sharp(buffer).webp({ quality: 85 }).toBuffer();

  const uploadDir = path.join(UPLOAD_ROOT, "media");
  fs.mkdirSync(uploadDir, { recursive: true });
  const filename = `${slugify(name) || "image"}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.webp`;
  fs.writeFileSync(path.join(uploadDir, filename), webpBuffer);

  return `/uploads/media/${filename}`;
}
