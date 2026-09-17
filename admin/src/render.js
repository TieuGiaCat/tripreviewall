const { esc } = require("./utils");

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", href: "/admin/dashboard" },
  { key: "tours", label: "Tours", href: "/admin/tours" },
  { key: "blog", label: "Blog Posts", href: "/admin/posts" },
  { key: "leads", label: "Leads", href: "/admin/leads" },
  { key: "destinations", label: "Destinations", href: "/admin/destinations" },
  { key: "authors", label: "Authors", href: "/admin/authors" },
  { key: "settings", label: "Settings", href: "/admin/settings/email" },
  { key: "media", label: "Media Library", href: "/admin/media" },
  { key: "analytics", label: "Analytics", href: "/admin/analytics" },
  { key: "users", label: "Users", href: "/admin/users" },
  { key: "audit-log", label: "Audit Log", href: "/admin/audit-log" },
  { key: "page-seo", label: "Page SEO", href: "/admin/page-seo" },
];

function layout({ title, activeNav, user, body, extraHead, extraScripts }) {
  const nav = NAV_ITEMS.map(
    (item) =>
      `<a href="${item.href}" class="${item.key === activeNav ? "active" : ""}">${esc(item.label)}</a>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — Tripreviewall Admin</title>
<link rel="stylesheet" href="/admin/public/admin.css">
${extraHead || ""}
</head>
<body>
<div class="app-shell">
  <aside class="sidebar">
    <div class="sidebar-logo"><span>Tripreview</span><span class="b">all</span> Admin</div>
    <nav class="sidebar-nav">${nav}</nav>
    <div class="sidebar-user">
      Signed in as <strong>${esc(user.name || user.email)}</strong> (${esc(user.role)})<br>
      <a href="/admin/logout">Log out</a>
    </div>
  </aside>
  <main class="main-content">
    ${body}
  </main>
</div>
${extraScripts || ""}
<script>
  // Shared by every Tour/Post/Author/Destination edit form's "Browse Existing
  // Images" button — opens the Media Library in picker mode, waits for the
  // chosen image via postMessage, applies it server-side, then reloads.
  function openMediaPicker(targetType, targetId) {
    window.open("/admin/media?pick=1", "mediaPicker", "width=900,height=700");
    window.addEventListener("message", function handler(e) {
      if (!e.data || e.data.type !== "media-picked") return;
      window.removeEventListener("message", handler);
      fetch("/admin/media/apply", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ targetType: targetType, targetId: targetId, url: e.data.url }),
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.ok) location.reload();
          else alert("Could not apply the image: " + (res.error || "unknown error"));
        })
        .catch(function () { alert("Could not apply the image — network error."); });
    });
  }
</script>
</body>
</html>`;
}

function loginPage({ error } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Log in — Tripreviewall Admin</title>
<link rel="stylesheet" href="/admin/public/admin.css">
</head>
<body>
<div class="login-wrap">
  <div class="login-card">
    <div class="login-logo"><span class="a">Tripreview</span><span class="b">all</span> Admin</div>
    ${error ? `<div class="alert alert-error">${esc(error)}</div>` : ""}
    <form method="POST" action="/admin/login">
      <div class="form-field" style="margin-bottom:14px;">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required autofocus>
      </div>
      <div class="form-field" style="margin-bottom:20px;">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required>
      </div>
      <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;">Log in</button>
    </form>
  </div>
</div>
</body>
</html>`;
}

function paginationHtml(currentPage, totalPages, baseUrl, otherParams = {}) {
  if (totalPages <= 1) return "";
  const linkFor = (p) => {
    const params = new URLSearchParams(otherParams);
    params.set("page", p);
    return `${baseUrl}?${params.toString()}`;
  };
  const parts = [];
  if (currentPage > 1) parts.push(`<a href="${esc(linkFor(currentPage - 1))}" class="btn btn-secondary btn-sm">← Prev</a>`);
  parts.push(`<span style="padding:0 12px;color:var(--color-text-muted);">Page ${currentPage} of ${totalPages}</span>`);
  if (currentPage < totalPages) parts.push(`<a href="${esc(linkFor(currentPage + 1))}" class="btn btn-secondary btn-sm">Next →</a>`);
  return `<div class="pagination-nav" style="display:flex;gap:6px;align-items:center;justify-content:center;margin:24px 0;">${parts.join("")}</div>`;
}

module.exports = { layout, loginPage, paginationHtml };
