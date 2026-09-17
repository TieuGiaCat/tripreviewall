const { query } = require("../db");
const { readFormBody, esc } = require("../utils");
const { layout } = require("../render");
const { hashPassword } = require("../auth");

const ROLES = ["admin", "editor"];

/** Blocks non-admins from every route in this file. Called first by each handler. */
function requireAdminRole(user, res) {
  if (user.role === "admin") return true;
  res.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
  res.end(
    layout({
      title: "Access denied",
      activeNav: "users",
      user,
      body: `<div class="alert alert-error">Only Admin accounts can manage Users. You're signed in as an Editor.</div>`,
    })
  );
  return false;
}

/* ============================================================
   List
   ============================================================ */
async function listUsers(req, res, user) {
  if (!requireAdminRole(user, res)) return;

  let rows = [];
  let dbError = null;
  try {
    const result = await query(`SELECT id, email, role, status, created_at, data FROM admin_users ORDER BY created_at ASC`);
    rows = result.rows;
  } catch (err) {
    console.error("[users] list failed:", err.message);
    dbError = err.message;
  }

  const activeAdminCount = rows.filter((r) => r.role === "admin" && r.status === "active").length;

  const tableRows = rows
    .map((r) => {
      const d = r.data || {};
      const isSelf = r.id === user.userId;
      return `<tr>
        <td>${esc(d.name || "—")}${isSelf ? ' <span class="badge badge-published">You</span>' : ""}</td>
        <td>${esc(r.email)}</td>
        <td><span class="badge ${r.role === "admin" ? "badge-published" : "badge-draft"}">${esc(r.role)}</span></td>
        <td><span class="badge ${r.status === "active" ? "badge-published" : "badge-draft"}">${esc(r.status)}</span></td>
        <td>${new Date(r.created_at).toLocaleDateString()}</td>
        <td>
          <a href="/admin/users/${r.id}/edit" class="btn btn-secondary btn-sm">Edit</a>
          ${!isSelf ? `<form method="POST" action="/admin/users/${r.id}/delete" style="display:inline;"
                onsubmit="return confirm('Delete this user account? This cannot be undone.');">
            <button type="submit" class="btn btn-danger btn-sm">Delete</button>
          </form>` : ""}
        </td>
      </tr>`;
    })
    .join("");

  const body = `
    <h1 class="page-title">Users</h1>
    <p class="page-sub">${rows.length} account${rows.length === 1 ? "" : "s"}. Only Admin accounts can reach this page.</p>
    ${dbError ? `<div class="alert alert-error">Database error: ${esc(dbError)}.</div>` : ""}

    <div class="toolbar">
      <div></div>
      <a href="/admin/users/new" class="btn btn-primary">+ New User</a>
    </div>

    <table class="data-table">
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  `;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Users", activeNav: "users", user, body }));
}

/* ============================================================
   Form (shared between New and Edit)
   ============================================================ */
function renderUserForm({ target = {}, errors = [], formAction, isEdit }) {
  const d = target.data || {};
  const roleOptions = ROLES.map((r) => `<option value="${r}" ${target.role === r ? "selected" : ""}>${r === "admin" ? "Admin (full access, incl. Users)" : "Editor (everything except Users)"}</option>`).join("");

  return `
    <h1 class="page-title">${isEdit ? "Edit User" : "New User"}</h1>
    ${errors.length ? `<div class="alert alert-error">${errors.map(esc).join("<br>")}</div>` : ""}

    <form method="POST" action="${formAction}">
      <div class="form-card">
        <h2>Account</h2>
        <div class="form-row">
          <div class="form-field"><label>Name</label><input type="text" name="name" required value="${esc(d.name || "")}"></div>
          <div class="form-field"><label>Email</label><input type="email" name="email" required value="${esc(target.email || "")}"></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>Role</label><select name="role">${roleOptions}</select></div>
          ${isEdit ? `<div class="form-field"><label>Status</label>
            <select name="status">
              <option value="active" ${target.status !== "disabled" ? "selected" : ""}>Active</option>
              <option value="disabled" ${target.status === "disabled" ? "selected" : ""}>Disabled (can't log in)</option>
            </select>
          </div>` : ""}
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>Password${isEdit ? " (leave blank to keep the current one)" : ""}</label>
            <input type="password" name="password" autocomplete="new-password" ${isEdit ? "" : "required"} minlength="8">
            <div class="hint">At least 8 characters.</div>
          </div>
        </div>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${isEdit ? "Save Changes" : "Create User"}</button>
        <a href="/admin/users" class="btn btn-secondary">Cancel</a>
      </div>
    </form>
  `;
}

/* ============================================================
   New
   ============================================================ */
async function newUserForm(req, res, user) {
  if (!requireAdminRole(user, res)) return;
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "New User", activeNav: "users", user, body: renderUserForm({ formAction: "/admin/users/new", isEdit: false }) }));
}

async function createUser(req, res, user) {
  if (!requireAdminRole(user, res)) return;

  let body;
  try {
    body = await readFormBody(req);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end("Malformed request.");
    return;
  }

  const errors = [];
  const email = (body.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("A valid email is required.");
  if (!body.name || !body.name.trim()) errors.push("Name is required.");
  if (!body.password || body.password.length < 8) errors.push("Password must be at least 8 characters.");
  const role = ROLES.includes(body.role) ? body.role : "editor";

  if (errors.length) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "New User", activeNav: "users", user, body: renderUserForm({ target: { email, role, data: { name: body.name } }, errors, formAction: "/admin/users/new", isEdit: false }) }));
    return;
  }

  try {
    await query(
      `INSERT INTO admin_users (email, password_hash, role, status, data) VALUES ($1, $2, $3, 'active', $4)`,
      [email, hashPassword(body.password), role, JSON.stringify({ name: body.name.trim() })]
    );
  } catch (err) {
    console.error("[users] create failed:", err.message);
    const dbErrors = err.code === "23505" ? ["An account with this email already exists."] : [`Database error: ${err.message}`];
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "New User", activeNav: "users", user, body: renderUserForm({ target: { email, role, data: { name: body.name } }, errors: dbErrors, formAction: "/admin/users/new", isEdit: false }) }));
    return;
  }

  res.writeHead(302, { Location: "/admin/users" });
  res.end();
}

/* ============================================================
   Edit / Update / Delete
   ============================================================ */
async function editUserForm(req, res, user, id) {
  if (!requireAdminRole(user, res)) return;

  let result;
  try {
    result = await query("SELECT * FROM admin_users WHERE id = $1", [id]);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Error", activeNav: "users", user, body: `<div class="alert alert-error">Database error: ${esc(err.message)}</div>` }));
    return;
  }
  const target = result.rows[0];
  if (!target) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Not found", activeNav: "users", user, body: `<div class="alert alert-error">User not found.</div><a href="/admin/users" class="btn btn-secondary">Back to Users</a>` }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Edit User", activeNav: "users", user, body: renderUserForm({ target, formAction: `/admin/users/${id}/edit`, isEdit: true }) }));
}

async function updateUser(req, res, user, id) {
  if (!requireAdminRole(user, res)) return;

  let body;
  try {
    body = await readFormBody(req);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end("Malformed request.");
    return;
  }

  let existing;
  try {
    const result = await query("SELECT * FROM admin_users WHERE id = $1", [id]);
    existing = result.rows[0];
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Error", activeNav: "users", user, body: `<div class="alert alert-error">Database error: ${esc(err.message)}</div>` }));
    return;
  }
  if (!existing) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Not found", activeNav: "users", user, body: `<div class="alert alert-error">User not found.</div>` }));
    return;
  }

  const errors = [];
  const email = (body.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("A valid email is required.");
  if (!body.name || !body.name.trim()) errors.push("Name is required.");
  if (body.password && body.password.length < 8) errors.push("New password must be at least 8 characters.");
  const role = ROLES.includes(body.role) ? body.role : existing.role;
  const status = body.status === "disabled" ? "disabled" : "active";

  const isSelf = existing.id === user.userId;
  const wouldRemoveLastAdmin = existing.role === "admin" && (role !== "admin" || status !== "active");
  if (wouldRemoveLastAdmin) {
    try {
      const countResult = await query(`SELECT count(*)::int AS n FROM admin_users WHERE role = 'admin' AND status = 'active' AND id != $1`, [id]);
      if (countResult.rows[0].n === 0) errors.push("Can't do that — this is the last active Admin account. Promote another account to Admin first.");
    } catch (err) {
      errors.push(`Could not verify this isn't the last admin (database error: ${err.message}) — refusing to proceed.`);
    }
  }
  if (isSelf && status === "disabled") errors.push("You can't disable your own account while signed in as it.");

  if (errors.length) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Edit User", activeNav: "users", user, body: renderUserForm({ target: { ...existing, email, role, status, data: { name: body.name } }, errors, formAction: `/admin/users/${id}/edit`, isEdit: true }) }));
    return;
  }

  const data = { ...(existing.data || {}), name: body.name.trim() };

  try {
    if (body.password) {
      await query(
        `UPDATE admin_users SET email = $1, role = $2, status = $3, password_hash = $4, data = $5 WHERE id = $6`,
        [email, role, status, hashPassword(body.password), JSON.stringify(data), id]
      );
    } else {
      await query(
        `UPDATE admin_users SET email = $1, role = $2, status = $3, data = $4 WHERE id = $5`,
        [email, role, status, JSON.stringify(data), id]
      );
    }
  } catch (err) {
    console.error("[users] update failed:", err.message);
    const dbErrors = err.code === "23505" ? ["Another account already uses this email."] : [`Database error: ${err.message}`];
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Edit User", activeNav: "users", user, body: renderUserForm({ target: { ...existing, email, role, status, data: { name: body.name } }, errors: dbErrors, formAction: `/admin/users/${id}/edit`, isEdit: true }) }));
    return;
  }

  res.writeHead(302, { Location: "/admin/users" });
  res.end();
}

async function deleteUser(req, res, user, id) {
  if (!requireAdminRole(user, res)) return;

  if (id === user.userId) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Error", activeNav: "users", user, body: `<div class="alert alert-error">You can't delete your own account while signed in as it.</div><a href="/admin/users" class="btn btn-secondary">Back to Users</a>` }));
    return;
  }

  try {
    const target = await query("SELECT role, status FROM admin_users WHERE id = $1", [id]);
    if (target.rows[0] && target.rows[0].role === "admin" && target.rows[0].status === "active") {
      const countResult = await query(`SELECT count(*)::int AS n FROM admin_users WHERE role = 'admin' AND status = 'active' AND id != $1`, [id]);
      if (countResult.rows[0].n === 0) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(layout({ title: "Error", activeNav: "users", user, body: `<div class="alert alert-error">Can't delete the last active Admin account.</div><a href="/admin/users" class="btn btn-secondary">Back to Users</a>` }));
        return;
      }
    }
    await query("DELETE FROM admin_users WHERE id = $1", [id]);
  } catch (err) {
    console.error("[users] delete failed:", err.message);
  }
  res.writeHead(302, { Location: "/admin/users" });
  res.end();
}

module.exports = { listUsers, newUserForm, createUser, editUserForm, updateUser, deleteUser };
