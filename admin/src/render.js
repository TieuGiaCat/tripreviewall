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
  // Future modules — routes not built yet in this core, listed here so the
  // sidebar shape matches master-technical-architecture.md §2 and doesn't
  // need restructuring later. Unbuilt links intentionally point to "#".
  { key: "analytics", label: "Analytics", href: "#" },
  { key: "users", label: "Users", href: "#" },
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
