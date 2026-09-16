const { query } = require("../db");
const { layout } = require("../render");
const { esc, readFormBody } = require("../utils");
const { encrypt } = require("../lib/crypto-secret");
const mailer = require("../lib/mailer");

async function getSmtpSettings() {
  const result = await query("SELECT data FROM settings WHERE key = 'email_smtp' LIMIT 1");
  return result.rows[0] ? result.rows[0].data : {};
}

function renderForm({ s = {}, errors = [], notice = null }) {
  return `
    <h1 class="page-title">Settings — Email (SMTP)</h1>
    <p class="page-sub">Used to notify you by email whenever a Contact or Transportation form is submitted. Leads are always saved even if email sending fails.</p>

    ${errors.length ? `<div class="alert alert-error">${errors.map(esc).join("<br>")}</div>` : ""}
    ${notice ? `<div class="alert alert-success">${esc(notice)}</div>` : ""}

    <div class="form-card">
      <h2>Gmail App Password setup</h2>
      <p style="color:var(--color-text-muted);line-height:1.6;font-size:13px;margin:0;">
        1. Turn on 2-Step Verification on the Gmail account you'll send from (myaccount.google.com/security).<br>
        2. Go to myaccount.google.com/apppasswords, create an app password named "Tripreviewall", and copy the 16-character code.<br>
        3. Use that code below as the password — not your normal Gmail login password.
      </p>
    </div>

    <form method="POST" action="/admin/settings/email">
      <div class="form-card">
        <h2>SMTP Connection</h2>
        <div class="form-row">
          <div class="form-field"><label>SMTP Host</label><input type="text" name="host" required value="${esc(s.host || "smtp.gmail.com")}"></div>
          <div class="form-field"><label>Port</label><input type="number" name="port" required value="${esc(s.port || 587)}"></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>Encryption</label>
            <select name="secure">
              <option value="false" ${!s.secure ? "selected" : ""}>STARTTLS (port 587 — Gmail default)</option>
              <option value="true" ${s.secure ? "selected" : ""}>SSL/TLS (port 465)</option>
            </select>
          </div>
          <div class="form-field"><label>Gmail Address (SMTP username)</label><input type="email" name="authUser" required value="${esc(s.authUser || "")}"></div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>App Password</label>
            <input type="password" name="authPass" autocomplete="new-password" placeholder="${s.authPassEncrypted ? "•••••••••••••••• (leave blank to keep current)" : "16-character Gmail App Password"}">
          </div>
        </div>
      </div>

      <div class="form-card">
        <h2>Sending &amp; Notification</h2>
        <div class="form-row">
          <div class="form-field"><label>"From" Name</label><input type="text" name="fromName" value="${esc(s.fromName || "Tripreviewall")}"></div>
          <div class="form-field"><label>"From" Email</label><input type="email" name="fromEmail" value="${esc(s.fromEmail || s.authUser || "")}"></div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>Send lead notifications to</label>
            <input type="email" name="notifyToEmail" required value="${esc(s.notifyToEmail || s.authUser || "")}">
            <div class="hint">This inbox gets an email every time someone submits Contact or Transportation.</div>
          </div>
        </div>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Save Settings</button>
        <button type="submit" name="action" value="test" class="btn btn-secondary">Save &amp; Send Test Email</button>
      </div>
    </form>
  `;
}

async function showEmailSettings(req, res, user) {
  let s = {};
  try {
    s = await getSmtpSettings();
  } catch (err) {
    console.error("[settings] load failed:", err.message);
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Settings — Email", activeNav: "settings", user, body: renderForm({ s }) }));
}

async function saveEmailSettings(req, res, user) {
  let body;
  try {
    body = await readFormBody(req);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end("Malformed request.");
    return;
  }

  let existing = {};
  try {
    existing = await getSmtpSettings();
  } catch (err) {
    console.error("[settings] load existing failed:", err.message);
  }

  const errors = [];
  if (!body.host || !body.host.trim()) errors.push("SMTP host is required.");
  if (!body.authUser || !body.authUser.trim()) errors.push("SMTP username (Gmail address) is required.");
  if (!body.notifyToEmail || !body.notifyToEmail.trim()) errors.push("Notification email is required.");
  if (!existing.authPassEncrypted && !body.authPass) errors.push("App Password is required on first setup.");

  if (errors.length) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(layout({ title: "Settings — Email", activeNav: "settings", user, body: renderForm({ s: body, errors }) }));
    return;
  }

  const data = {
    host: body.host.trim(),
    port: Number(body.port) || 587,
    secure: body.secure === "true",
    authUser: body.authUser.trim(),
    authPassEncrypted: body.authPass ? encrypt(body.authPass) : existing.authPassEncrypted,
    fromName: (body.fromName || "Tripreviewall").trim(),
    fromEmail: (body.fromEmail || body.authUser).trim(),
    notifyToEmail: body.notifyToEmail.trim(),
  };

  try {
    await query(
      `INSERT INTO settings (key, data, updated_at) VALUES ('email_smtp', $1, now())
       ON CONFLICT (key) DO UPDATE SET data = $1, updated_at = now()`,
      [JSON.stringify(data)]
    );
  } catch (err) {
    console.error("[settings] save failed:", err.message);
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      layout({
        title: "Settings — Email",
        activeNav: "settings",
        user,
        body: renderForm({ s: data, errors: [`Database error: ${err.message}`] }),
      })
    );
    return;
  }

  if (body.action === "test") {
    try {
      await mailer.sendTestEmail(data.notifyToEmail);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        layout({
          title: "Settings — Email",
          activeNav: "settings",
          user,
          body: renderForm({ s: data, notice: `Settings saved. Test email sent to ${data.notifyToEmail} — check your inbox (and spam folder).` }),
        })
      );
    } catch (err) {
      console.error("[settings] test email failed:", err.message);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        layout({
          title: "Settings — Email",
          activeNav: "settings",
          user,
          body: renderForm({ s: data, errors: [`Settings saved, but the test email failed to send: ${err.message}`] }),
        })
      );
    }
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(layout({ title: "Settings — Email", activeNav: "settings", user, body: renderForm({ s: data, notice: "Settings saved." }) }));
}

module.exports = { showEmailSettings, saveEmailSettings };
