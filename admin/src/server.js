require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");

const { requireAuth } = require("./middleware");
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

function serveUpload(req, res, urlPath) {
  // urlPath is like "/uploads/tours/xyz.jpg" — strip the "/uploads" prefix
  const rel = urlPath.replace(/^\/uploads\//, "");
  const filePath = path.join(UPLOADS_DIR, rel);

  if (!filePath.startsWith(UPLOADS_DIR)) {
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
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "public, max-age=86400",
    });
    res.end(content);
  });
}

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

const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = urlObj.pathname;
    const method = req.method;

    // ---- Static assets ----
    if (method === "GET" && pathname.startsWith("/admin/public/")) {
      return serveStatic(req, res, pathname);
    }
    if (method === "GET" && pathname.startsWith("/uploads/")) {
      return serveUpload(req, res, pathname);
    }

    // ---- Root ----
    if (method === "GET" && (pathname === "/" || pathname === "/admin")) {
      res.writeHead(302, { Location: "/admin/dashboard" });
      return res.end();
    }

    // ---- Auth (no session required) ----
    if (method === "GET" && pathname === "/admin/login") return authRoutes.handleLoginGet(req, res);
    if (method === "POST" && pathname === "/admin/login") return authRoutes.handleLoginPost(req, res);
    if (method === "GET" && pathname === "/admin/logout") return authRoutes.handleLogout(req, res);

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

    // ---- Everything below requires a session ----
    const session = requireAuth(req, res);
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

    // ---- 404 ----
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
  } catch (err) {
    console.error("[server] Unhandled error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("500 Internal Server Error");
    }
  }
});

server.listen(PORT, () => {
  console.log(`Tripreviewall admin panel running at http://localhost:${PORT}`);
  console.log(`Log in at http://localhost:${PORT}/admin/login`);
});
