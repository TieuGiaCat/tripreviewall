const { esc } = require("./utils");

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", href: "/admin/dashboard" },
  { key: "tours", label: "Tours", href: "/admin/tours" },
  { key: "blog", label: "Blog Posts", href: "/admin/posts" },
  { key: "leads", label: "Leads", href: "/admin/leads" },
  { key: "settings", label: "Settings", href: "/admin/settings/email" },
  // Future modules — routes not built yet in this core, listed here so the
  // sidebar shape matches master-technical-architecture.md §2 and doesn't
  // need restructuring later. Unbuilt links intentionally point to "#".
  { key: "destinations", label: "Destinations", href: "#" },
  { key: "authors", label: "Authors", href: "#" },
  { key: "analytics", label: "Analytics", href: "#" },
  { key: "media", label: "Media Library", href: "#" },
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

module.exports = { layout, loginPage };
