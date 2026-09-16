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

    // ---- Everything below requires a session ----
    const session = requireAuth(req, res);
    if (!session) return; // requireAuth already sent the redirect response

    if (method === "GET" && pathname === "/admin/dashboard") {
      return dashboardRoutes.showDashboard(req, res, session);
    }

    if (method === "GET" && pathname === "/admin/tours") {
      return toursRoutes.listTours(req, res, session, urlObj);
    }
    if (method === "GET" && pathname === "/admin/tours/new") {
      return toursRoutes.newTourForm(req, res, session);
    }
    if (method === "POST" && pathname === "/admin/tours/new") {
      return toursRoutes.createTour(req, res, session);
    }

    // Dynamic routes: /admin/tours/:id/edit , /admin/tours/:id/delete
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
