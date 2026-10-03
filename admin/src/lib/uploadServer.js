/**
 * Serves /uploads/* (E6).
 *
 *   /uploads/<path>        → the original file
 *   /uploads/<path>?w=800  → a WebP resized to 800px wide (never upscaled),
 *                            made once with sharp and cached under
 *                            uploads/.resized/w800/<path>.webp
 *
 * - Files are streamed (not read whole into RAM).
 * - ETag + Last-Modified, so a browser that already has the image gets a
 *   tiny 304 instead of the file again.
 * - If many visitors ask for the same not-yet-cached size at once, sharp runs
 *   ONCE and everyone waits for that result; at most MAX_PARALLEL resizes run
 *   at the same time, so a page full of new photos can't max out the CPU.
 * - Any resize failure falls back to the original file, so a page never loses
 *   an image because of this.
 */
const fs = require("fs");
const path = require("path");

const MIME_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

const RESIZE_WIDTHS = new Set([160, 400, 800, 1200, 1600]);
const RESIZABLE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
// Upload filenames carry a timestamp + random suffix, so a URL's content never
// changes — safe for browsers/CDNs to cache for a long time.
const CACHE_HEADER = "public, max-age=2592000";
const MAX_PARALLEL = 2;

function createUploadServer(uploadsDir) {
  const root = path.resolve(uploadsDir);
  const resizedDir = path.join(root, ".resized");
  const inFlight = new Map(); // cachedPath -> Promise<boolean>
  let running = 0;
  const queue = [];

  function withSlot(fn) {
    return new Promise((resolve, reject) => {
      const run = () => {
        running++;
        Promise.resolve().then(fn).then(resolve, reject).finally(() => {
          running--;
          const next = queue.shift();
          if (next) next();
        });
      };
      if (running < MAX_PARALLEL) run(); else queue.push(run);
    });
  }

  function notFound(res) {
    if (res.headersSent) return res.end();
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }

  /** Streams a file with caching headers; answers 304 when the browser's copy is current. */
  async function sendFile(req, res, filePath, contentType) {
    let stat;
    try {
      stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) return notFound(res);
    } catch (err) {
      return notFound(res);
    }
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const headers = {
      "Content-Type": contentType,
      "Cache-Control": CACHE_HEADER,
      ETag: etag,
      "Last-Modified": stat.mtime.toUTCString(),
    };
    const inm = req.headers["if-none-match"];
    if (inm && inm.split(/\s*,\s*/).includes(etag)) {
      res.writeHead(304, headers);
      return res.end();
    }
    headers["Content-Length"] = stat.size;
    if (req.method === "HEAD") {
      res.writeHead(200, headers);
      return res.end();
    }
    res.writeHead(200, headers);
    const stream = fs.createReadStream(filePath);
    stream.on("error", (err) => {
      console.error(`[uploads] read failed for ${filePath}: ${err.message}`);
      res.destroy(err);
    });
    stream.pipe(res);
  }

  /** Makes the resized copy (once, even if asked for many times at once). Resolves true on success. */
  function ensureResized(srcPath, cachedPath, w, rel) {
    if (inFlight.has(cachedPath)) return inFlight.get(cachedPath);
    const job = withSlot(async () => {
      let sharp;
      try { sharp = require("sharp"); } catch (e) { return false; }
      const tmpPath = `${cachedPath}.${process.pid}.${Date.now()}.tmp`;
      try {
        await fs.promises.mkdir(path.dirname(cachedPath), { recursive: true });
        await sharp(srcPath).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 72 }).toFile(tmpPath);
        await fs.promises.rename(tmpPath, cachedPath);
        return true;
      } catch (e) {
        console.error(`[uploads] resize failed for ${rel} @${w}px: ${e.message}`);
        fs.promises.unlink(tmpPath).catch(() => {});
        return false;
      }
    }).finally(() => inFlight.delete(cachedPath));
    inFlight.set(cachedPath, job);
    return job;
  }

  /** Request handler for any /uploads/… URL. */
  async function serveUpload(req, res, urlPath) {
    let rel;
    try { rel = decodeURIComponent(urlPath.replace(/^\/uploads\//, "")); } catch (e) { rel = ""; }
    const filePath = path.join(root, rel);
    if (!rel || !filePath.startsWith(root + path.sep) || rel.split(/[\\/]/).some((part) => part.startsWith("."))) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Forbidden");
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const w = Number(new URL(req.url, "http://x").searchParams.get("w"));
    if (!RESIZE_WIDTHS.has(w) || !RESIZABLE_EXT.has(ext)) return sendFile(req, res, filePath, contentType);

    let origStat;
    try { origStat = await fs.promises.stat(filePath); } catch (e) { return notFound(res); }
    const cachedPath = path.join(resizedDir, `w${w}`, rel + ".webp");
    try {
      const cacheStat = await fs.promises.stat(cachedPath);
      if (cacheStat.mtimeMs >= origStat.mtimeMs) return sendFile(req, res, cachedPath, "image/webp");
    } catch (e) { /* not cached yet */ }

    const ok = await ensureResized(filePath, cachedPath, w, rel);
    return ok ? sendFile(req, res, cachedPath, "image/webp") : sendFile(req, res, filePath, contentType);
  }

  /** Deletes every resized copy of one upload (used when the original is deleted). */
  async function removeResized(rel) {
    await Promise.all([...RESIZE_WIDTHS].map((w) =>
      fs.promises.unlink(path.join(resizedDir, `w${w}`, rel + ".webp")).catch(() => {})));
  }

  return { serveUpload, removeResized, _inFlight: inFlight };
}

module.exports = { createUploadServer, RESIZE_WIDTHS };
