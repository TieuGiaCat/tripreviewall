require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");

const { requireAuth } = require("./middleware");
const { layout } = require("./render");
const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const toursRoutes = require("./routes/toursRoutes");
const blogRoutes = require("./routes/blogRoutes");
const publicApi = require("./routes/publicApi");
const sitemapRoute = require("./routes/sitemapRoute");
const leadsRoutes = require("./routes/leadsRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const publicLeadRoutes = require("./routes/publicLeadRoutes");
const destinationsRoutes = require("./routes/destinationsRoutes");
const authorsRoutes = require("./routes/authorsRoutes");
const mediaRoutes = require("./routes/mediaRoutes");
const usersRoutes = require("./routes/usersRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const clickTrackingRoute = require("./routes/clickTrackingRoute");
const categoriesRoutes = require("./routes/categoriesRoutes");
const rssRoute = require("./routes/rssRoute");
const auditLogRoutes = require("./routes/auditLogRoutes");
const pageSeoRoutes = require("./routes/pageSeoRoutes");

const PORT = process.env.PORT || 4000;
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

const UPLOADS_DIR = path.join(__dirname, "..", "public", "uploads");
// Streaming, ETag/304 and de-duplicated resizing live in lib/uploadServer.js (E6).
const uploadServer = require("./lib/uploadServer").createUploadServer(UPLOADS_DIR);
const serveUpload = uploadServer.serveUpload;

function serveStatic(req, res, urlPath) {
  // urlPath is like "/admin/public/admin.css" — strip the "/admin/public" prefix
  const rel = urlPath.replace(/^\/admin\/public\//, "");
  const filePath = path.join(PUBLIC_DIR, rel);

  // Prevent path traversal outside PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(content);
  });
}

/**
 * All routing lives here. Handlers are called as `return handler(...)`; since
 * this is an async function, its returned promise adopts the handler's promise,
 * so the single `await routeRequest()` below catches every rejection. (Before,
 * `return handler()` inside try/catch let async errors escape the catch and an
 * unhandled rejection crashed the whole process.)
 */
/* ---- Security headers (A8) ----
   Every response gets nosniff + a referrer policy. Admin pages additionally
   can't be framed (clickjacking), aren't cached by shared caches, and get a
   Content-Security-Policy that only allows our own scripts plus the Quill
   editor CDN. (Inline scripts are still allowed — the admin uses them.) */
const ADMIN_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self'",
  "frame-src 'self' https://www.google.com https://maps.google.com https://www.youtube.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

function applySecurityHeaders(res, pathname) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/public/")) {
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", ADMIN_CSP);
    res.setHeader("Cache-Control", "no-store");
  }
}

/* ---- CSRF protection (A7) ----
   A state-changing request to /admin must come from one of our own pages.
   Browsers always send Origin on cross-site POSTs (and Referer otherwise),
   so a POST whose Origin/Referer host isn't ours — or that carries neither —
   is rejected. No per-form token needed. */
function isSameOriginRequest(req) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").toLowerCase();
  const source = req.headers.origin || req.headers.referer;
  if (!host || !source || source === "null") return false;
  try { return new URL(source).host.toLowerCase() === host; } catch (e) { return false; }
}

async function routeRequest(req, res) {
  const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = urlObj.pathname;
  const method = req.method;

  applySecurityHeaders(res, pathname);
  if (method !== "GET" && method !== "HEAD" && pathname.startsWith("/admin") && !isSameOriginRequest(req)) {
    console.warn(`[csrf] blocked ${method} ${pathname} (origin: ${req.headers.origin || "-"}, referer: ${req.headers.referer || "-"})`);
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Request blocked: it didn't come from the Tripreviewall admin. Reload the page and try again.");
  }

  // ---- Static assets ----
  if (method === "GET" && pathname.startsWith("/admin/public/")) {
    return serveStatic(req, res, pathname);
  }
  if ((method === "GET" || method === "HEAD") && pathname.startsWith("/uploads/")) {
    return serveUpload(req, res, pathname);
  }
  // Self-hosted Quill editor (npm package) — only these two files.
  const quillMatch = method === "GET" && pathname.match(/^\/admin\/vendor\/quill\/(quill\.min\.js|quill\.snow\.css)$/);
  if (quillMatch) {
    let file;
    try { file = require.resolve(`quill/dist/${quillMatch[1]}`); } catch (e) { res.writeHead(404); return res.end("Not found"); }
    return fs.readFile(file, (err, content) => {
      if (err) { res.writeHead(404); return res.end("Not found"); }
      res.writeHead(200, { "Content-Type": quillMatch[1].endsWith(".js") ? "application/javascript; charset=utf-8" : "text/css; charset=utf-8", "Cache-Control": "public, max-age=604800" });
      res.end(content);
    });
  }

  // ---- Root ----
  if (method === "GET" && (pathname === "/" || pathname === "/admin")) {
    res.writeHead(302, { Location: "/admin/dashboard" });
    return res.end();
  }

  // ---- Auth (no session required) ----
  if (method === "GET" && pathname === "/admin/login") return authRoutes.handleLoginGet(req, res);
  if (method === "POST" && pathname === "/admin/login") return authRoutes.handleLoginPost(req, res);
  // Logout is a POST (from the sidebar button) so a link or image on another
  // site can't sign you out; a plain GET just shows a confirm button.
  if (method === "POST" && pathname === "/admin/logout") return authRoutes.handleLogout(req, res);
  if (method === "GET" && pathname === "/admin/logout") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Log out</title><link rel="stylesheet" href="/admin/public/admin.css"></head><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;"><form method="POST" action="/admin/logout"><button type="submit" class="btn btn-primary">Log out of Tripreviewall Admin</button></form></body></html>`);
  }

  // ---- Public read-only API (no session required) — the public website
  // fetches from these to render tours live from the database. ----
  if (method === "GET" && pathname === "/sitemap.xml") {
    return sitemapRoute.generateSitemap(req, res);
  }
  if (method === "GET" && pathname === "/rss.xml") {
    return rssRoute.generateFeed(req, res);
  }
  if (method === "GET" && pathname === "/api/tours") {
    return publicApi.listPublishedTours(req, res);
  }
  const apiTourMatch = pathname.match(/^\/api\/tours\/([^/]+)$/);
  if (method === "GET" && apiTourMatch) {
    return publicApi.getPublishedTourBySlug(req, res, apiTourMatch[1]);
  }
  if (method === "GET" && pathname === "/api/posts") {
    return publicApi.listPublishedPosts(req, res);
  }
  const apiPostMatch = pathname.match(/^\/api\/posts\/([^/]+)$/);
  if (method === "GET" && apiPostMatch) {
    return publicApi.getPublishedPostBySlug(req, res, apiPostMatch[1]);
  }

  // ---- Public WRITE API (no session required) — form submissions from
  // the public site (Contact + Transportation pages). Rate-limited and
  // validated inside the handler; never trusts the client beyond that. ----
  if (method === "POST" && pathname === "/api/leads") {
    return publicLeadRoutes.createLead(req, res);
  }
  if (method === "GET" && pathname === "/api/track-click") {
    return clickTrackingRoute.trackClick(req, res, urlObj);
  }
  if (method === "POST" && pathname === "/api/log-click") {
    return clickTrackingRoute.logClick(req, res, urlObj);
  }

  // ---- Everything below requires a session ----
  const session = await requireAuth(req, res);
  if (!session) return; // requireAuth already sent the redirect response

  if (method === "GET" && pathname === "/admin/dashboard") {
    return dashboardRoutes.showDashboard(req, res, session);
  }

  // ---- Tours ----
  if (method === "GET" && pathname === "/admin/tours") {
    return toursRoutes.listTours(req, res, session, urlObj);
  }
  if (method === "GET" && pathname === "/admin/tours/new") {
    return toursRoutes.newTourForm(req, res, session);
  }
  if (method === "POST" && pathname === "/admin/tours/new") {
    return toursRoutes.createTour(req, res, session);
  }
  const editMatch = pathname.match(/^\/admin\/tours\/([^/]+)\/edit$/);
  if (editMatch) {
    const id = editMatch[1];
    if (method === "GET") return toursRoutes.editTourForm(req, res, session, id);
    if (method === "POST") return toursRoutes.updateTour(req, res, session, id);
  }
  const deleteMatch = pathname.match(/^\/admin\/tours\/([^/]+)\/delete$/);
  if (deleteMatch && method === "POST") {
    return toursRoutes.deleteTour(req, res, session, deleteMatch[1]);
  }
  const uploadMatch = pathname.match(/^\/admin\/tours\/([^/]+)\/upload-image$/);
  if (uploadMatch && method === "POST") {
    return toursRoutes.uploadTourImage(req, res, session, uploadMatch[1]);
  }
  const removeImageMatch = pathname.match(/^\/admin\/tours\/([^/]+)\/remove-image$/);
  if (removeImageMatch && method === "POST") {
    return toursRoutes.removeTourImage(req, res, session, removeImageMatch[1]);
  }
  if (method === "GET" && pathname === "/admin/tours/export") {
    return toursRoutes.exportToursCsv(req, res, session);
  }
  if (method === "GET" && pathname === "/admin/tours/import") {
    return toursRoutes.showImportForm(req, res, session);
  }
  if (method === "POST" && pathname === "/admin/tours/import") {
    return toursRoutes.importToursCsv(req, res, session);
  }
  if (method === "POST" && pathname === "/admin/tours/backfill-fareharbor-ids") {
    return toursRoutes.backfillFareharborIds(req, res, session);
  }

  // ---- Blog Posts ----
  if (method === "GET" && pathname === "/admin/posts") {
    return blogRoutes.listPosts(req, res, session, urlObj);
  }
  if (method === "GET" && pathname === "/admin/posts/new") {
    return blogRoutes.newPostForm(req, res, session);
  }
  if (method === "POST" && pathname === "/admin/posts/new") {
    return blogRoutes.createPost(req, res, session);
  }
  const postEditMatch = pathname.match(/^\/admin\/posts\/([^/]+)\/edit$/);
  if (postEditMatch) {
    const id = postEditMatch[1];
    if (method === "GET") return blogRoutes.editPostForm(req, res, session, id);
    if (method === "POST") return blogRoutes.updatePost(req, res, session, id);
  }
  const postDeleteMatch = pathname.match(/^\/admin\/posts\/([^/]+)\/delete$/);
  if (postDeleteMatch && method === "POST") {
    return blogRoutes.deletePost(req, res, session, postDeleteMatch[1]);
  }
  const postUploadMatch = pathname.match(/^\/admin\/posts\/([^/]+)\/upload-image$/);
  if (postUploadMatch && method === "POST") {
    return blogRoutes.uploadPostImage(req, res, session, postUploadMatch[1]);
  }
  const postInlineUploadMatch = pathname.match(/^\/admin\/posts\/([^/]+)\/upload-inline-image$/);
  if (postInlineUploadMatch && method === "POST") {
    return blogRoutes.uploadInlineImage(req, res, session, postInlineUploadMatch[1]);
  }

  // ---- Categories (Blog Posts sub-page) ----
  if (method === "GET" && pathname === "/admin/categories") {
    return categoriesRoutes.listCategories(req, res, session);
  }
  if (method === "GET" && pathname === "/admin/categories/new") {
    return categoriesRoutes.newCategoryForm(req, res, session);
  }
  if (method === "POST" && pathname === "/admin/categories/new") {
    return categoriesRoutes.createCategory(req, res, session);
  }
  const catEditMatch = pathname.match(/^\/admin\/categories\/([^/]+)\/edit$/);
  if (catEditMatch) {
    const id = catEditMatch[1];
    if (method === "GET") return categoriesRoutes.editCategoryForm(req, res, session, id);
    if (method === "POST") return categoriesRoutes.updateCategory(req, res, session, id);
  }
  const catDeleteMatch = pathname.match(/^\/admin\/categories\/([^/]+)\/delete$/);
  if (catDeleteMatch && method === "POST") {
    return categoriesRoutes.deleteCategory(req, res, session, catDeleteMatch[1]);
  }

  // ---- Leads ----
  if (method === "GET" && pathname === "/admin/leads") {
    return leadsRoutes.listLeads(req, res, session, urlObj);
  }
  const leadDetailMatch = pathname.match(/^\/admin\/leads\/([^/]+)$/);
  if (method === "GET" && leadDetailMatch) {
    return leadsRoutes.leadDetail(req, res, session, leadDetailMatch[1]);
  }
  const leadStatusMatch = pathname.match(/^\/admin\/leads\/([^/]+)\/status$/);
  if (method === "POST" && leadStatusMatch) {
    return leadsRoutes.updateLeadStatus(req, res, session, leadStatusMatch[1]);
  }
  const leadDeleteMatch = pathname.match(/^\/admin\/leads\/([^/]+)\/delete$/);
  if (method === "POST" && leadDeleteMatch) {
    return leadsRoutes.deleteLead(req, res, session, leadDeleteMatch[1]);
  }

  // ---- Settings (admin role only) ----
  // Tracking snippets are injected raw into every public page and the email
  // settings decide where leads go, so editors must not be able to change them.
  if (pathname.startsWith("/admin/settings/") && session.role !== "admin") {
    res.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(layout({ title: "Access denied", activeNav: "settings", user: session, body: `<div class="alert alert-error">Only Admin accounts can view or change Settings.</div><a href="/admin/dashboard" class="btn btn-secondary">Back to Dashboard</a>` }));
  }

  // ---- Settings → Email ----
  if (method === "GET" && pathname === "/admin/settings/email") {
    return settingsRoutes.showEmailSettings(req, res, session);
  }
  if (method === "POST" && pathname === "/admin/settings/email") {
    return settingsRoutes.saveEmailSettings(req, res, session);
  }

  // ---- Settings → Tracking ----
  if (method === "GET" && pathname === "/admin/settings/tracking") {
    return settingsRoutes.showTrackingSettings(req, res, session);
  }
  if (method === "POST" && pathname === "/admin/settings/tracking") {
    return settingsRoutes.saveTrackingSettings(req, res, session);
  }

  // ---- Settings → Site Info ----
  if (method === "GET" && pathname === "/admin/settings/site-info") {
    return settingsRoutes.showSiteInfoSettings(req, res, session);
  }
  if (method === "POST" && pathname === "/admin/settings/site-info") {
    return settingsRoutes.saveSiteInfoSettings(req, res, session);
  }

  // ---- Destinations ----
  if (method === "GET" && pathname === "/admin/destinations") {
    return destinationsRoutes.listDestinations(req, res, session);
  }
  const destEditMatch = pathname.match(/^\/admin\/destinations\/([^/]+)\/edit$/);
  if (destEditMatch) {
    const id = destEditMatch[1];
    if (method === "GET") return destinationsRoutes.editDestinationForm(req, res, session, id);
    if (method === "POST") return destinationsRoutes.updateDestination(req, res, session, id);
  }
  const destUploadMatch = pathname.match(/^\/admin\/destinations\/([^/]+)\/upload-image$/);
  if (destUploadMatch && method === "POST") {
    return destinationsRoutes.uploadDestinationImage(req, res, session, destUploadMatch[1]);
  }

  // ---- Authors ----
  if (method === "GET" && pathname === "/admin/authors") {
    return authorsRoutes.listAuthors(req, res, session);
  }
  if (method === "GET" && pathname === "/admin/authors/new") {
    return authorsRoutes.newAuthorForm(req, res, session);
  }
  if (method === "POST" && pathname === "/admin/authors/new") {
    return authorsRoutes.createAuthor(req, res, session);
  }
  const authorEditMatch = pathname.match(/^\/admin\/authors\/([^/]+)\/edit$/);
  if (authorEditMatch) {
    const id = authorEditMatch[1];
    if (method === "GET") return authorsRoutes.editAuthorForm(req, res, session, id);
    if (method === "POST") return authorsRoutes.updateAuthor(req, res, session, id);
  }
  const authorDeleteMatch = pathname.match(/^\/admin\/authors\/([^/]+)\/delete$/);
  if (authorDeleteMatch && method === "POST") {
    return authorsRoutes.deleteAuthor(req, res, session, authorDeleteMatch[1]);
  }
  const authorUploadMatch = pathname.match(/^\/admin\/authors\/([^/]+)\/upload-photo$/);
  if (authorUploadMatch && method === "POST") {
    return authorsRoutes.uploadAuthorPhoto(req, res, session, authorUploadMatch[1]);
  }

  // ---- Media Library ----
  if (method === "GET" && pathname === "/admin/media") {
    return mediaRoutes.listMedia(req, res, session, urlObj);
  }
  if (method === "POST" && pathname === "/admin/media/upload") {
    return mediaRoutes.uploadGeneralImage(req, res, session);
  }
  if (method === "POST" && pathname === "/admin/media/delete") {
    return mediaRoutes.deleteMediaFile(req, res, session);
  }
  if (method === "POST" && pathname === "/admin/media/apply") {
    return mediaRoutes.applyPickedImage(req, res, session);
  }
  if (method === "POST" && pathname === "/admin/media/fetch-url") {
    return mediaRoutes.fetchImageFromUrl(req, res, session);
  }

  // ---- Users (admin role only — enforced inside usersRoutes.js) ----
  if (method === "GET" && pathname === "/admin/users") {
    return usersRoutes.listUsers(req, res, session);
  }
  if (method === "GET" && pathname === "/admin/users/new") {
    return usersRoutes.newUserForm(req, res, session);
  }
  if (method === "POST" && pathname === "/admin/users/new") {
    return usersRoutes.createUser(req, res, session);
  }
  const userEditMatch = pathname.match(/^\/admin\/users\/([^/]+)\/edit$/);
  if (userEditMatch) {
    const id = userEditMatch[1];
    if (method === "GET") return usersRoutes.editUserForm(req, res, session, id);
    if (method === "POST") return usersRoutes.updateUser(req, res, session, id);
  }
  const userDeleteMatch = pathname.match(/^\/admin\/users\/([^/]+)\/delete$/);
  if (userDeleteMatch && method === "POST") {
    return usersRoutes.deleteUser(req, res, session, userDeleteMatch[1]);
  }

  // ---- Analytics ----
  if (method === "GET" && pathname === "/admin/analytics") {
    return analyticsRoutes.showAnalytics(req, res, session);
  }

  // ---- Audit Log ----
  if (method === "GET" && pathname === "/admin/audit-log") {
    return auditLogRoutes.showAuditLog(req, res, session, urlObj);
  }

  // ---- Page SEO ----
  if (method === "GET" && pathname === "/admin/page-seo") {
    return pageSeoRoutes.showPageSeoList(req, res, session);
  }
  if (method === "POST" && pathname === "/admin/page-seo/new") {
    return pageSeoRoutes.createPageSeo(req, res, session);
  }
  const pageSeoEditMatch = pathname.match(/^\/admin\/page-seo\/([^/]+)\/edit$/);
  if (pageSeoEditMatch) {
    const pageKey = decodeURIComponent(pageSeoEditMatch[1]);
    if (method === "GET") return pageSeoRoutes.editPageSeoForm(req, res, session, pageKey);
    if (method === "POST") return pageSeoRoutes.updatePageSeo(req, res, session, pageKey);
  }
  const pageSeoDeleteMatch = pathname.match(/^\/admin\/page-seo\/([^/]+)\/delete$/);
  if (pageSeoDeleteMatch && method === "POST") {
    return pageSeoRoutes.deletePageSeo(req, res, session, decodeURIComponent(pageSeoDeleteMatch[1]));
  }

  // ---- 404 ----
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("404 Not Found");
}

const server = http.createServer(async (req, res) => {
  try {
    await routeRequest(req, res);
  } catch (err) {
    console.error("[server] Unhandled error:", req.method, req.url, err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("500 Internal Server Error");
    } else if (!res.writableEnded) {
      res.end();
    }
  }
});

// Last-resort safety nets: log instead of letting one bad request take the
// whole admin + public API down.
process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  // State may be corrupted after a synchronous throw outside any request —
  // log it and exit; PM2 restarts the process within a second.
  console.error("[server] Uncaught exception — exiting so PM2 restarts cleanly:", err);
  process.exit(1);
});

// Listen on loopback only: the public reaches the admin through nginx
// (which proxies to 127.0.0.1:4000). Set HOST=0.0.0.0 in .env to expose it.
const HOST = process.env.HOST || "127.0.0.1";
server.listen(PORT, HOST, () => {
  console.log(`Tripreviewall admin panel running at http://localhost:${PORT}`);
  console.log(`Log in at http://localhost:${PORT}/admin/login`);
  if (process.send) process.send("ready"); // PM2 wait_ready (see ecosystem.config.js)
});

/* ---- Graceful shutdown (E8) ----
   `pm2 restart` / `pm2 stop` sends SIGINT (systemd/docker send SIGTERM).
   Instead of dying mid-request — or in the middle of rebuilding pages — we
   stop accepting new connections, let running requests and any page rebuild
   finish, close the database pool, then exit. Hard stop after
   SHUTDOWN_TIMEOUT_MS in case something hangs. */
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS) || 8000;
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received — finishing open requests, then exiting.`);
  setTimeout(() => {
    console.error("[server] Shutdown took too long — forcing exit.");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  await new Promise((resolve) => {
    server.close(resolve);                                         // stop accepting; resolves when all requests are done
    if (server.closeIdleConnections) server.closeIdleConnections(); // drop idle keep-alive sockets now
  });
  try {
    await require("./ssr/generator").whenIdle();
  } catch (err) {
    console.error("[server] page rebuild failed during shutdown:", err.message);
  }
  try {
    await require("./db").pool.end();
  } catch (err) {
    console.error("[server] closing database pool failed:", err.message);
  }
  console.log("[server] Clean shutdown.");
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
