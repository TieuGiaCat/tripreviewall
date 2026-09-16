const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const formidable = require("formidable");

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

module.exports = { parseImageUpload, UPLOAD_ROOT };
