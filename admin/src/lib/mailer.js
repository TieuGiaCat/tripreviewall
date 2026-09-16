const nodemailer = require("nodemailer");
const { query } = require("../db");
const { decrypt } = require("./crypto-secret");

async function getSmtpSettings() {
  const result = await query("SELECT data FROM settings WHERE key = 'email_smtp' LIMIT 1");
  return result.rows[0] ? result.rows[0].data : null;
}

async function buildTransport() {
  const s = await getSmtpSettings();
  if (!s || !s.host || !s.authUser || !s.authPassEncrypted) {
    throw new Error("SMTP is not configured yet — go to Settings → Email.");
  }
  const pass = decrypt(s.authPassEncrypted);
  const transporter = nodemailer.createTransport({
    host: s.host,
    port: Number(s.port) || 587,
    secure: !!s.secure, // false = STARTTLS on 587 (Gmail default), true = SSL on 465
    auth: { user: s.authUser, pass },
  });
  return { transporter, settings: s };
}

async function sendTestEmail(toOverride) {
  const { transporter, settings } = await buildTransport();
  const to = toOverride || settings.notifyToEmail || settings.authUser;
  await transporter.sendMail({
    from: `"${settings.fromName || "Tripreviewall"}" <${settings.fromEmail || settings.authUser}>`,
    to,
    subject: "Tripreviewall — SMTP test email",
    text: "If you're reading this, your SMTP settings are working correctly.",
  });
}

const FIELD_LABELS = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  message: "Message",
  service: "Service Type",
  date: "Preferred Date",
  pickup: "Pickup Location",
  passengers: "Passengers",
  notes: "Additional Notes",
};
const SKIP_FIELDS = new Set(["ipAddress", "userAgent", "emailSentAt", "emailError"]);

async function sendLeadNotification(lead) {
  const { transporter, settings } = await buildTransport();
  const to = settings.notifyToEmail || settings.authUser;
  const d = lead.data || {};

  const lines = Object.entries(d)
    .filter(([k, v]) => !SKIP_FIELDS.has(k) && v !== "" && v != null)
    .map(([k, v]) => `${FIELD_LABELS[k] || k}: ${v}`)
    .join("\n");

  const siteUrl = process.env.SITE_URL || "";

  await transporter.sendMail({
    from: `"${settings.fromName || "Tripreviewall"}" <${settings.fromEmail || settings.authUser}>`,
    to,
    replyTo: d.email || undefined,
    subject: `New ${lead.source} lead — ${d.name || "Unknown"}`,
    text:
      `New lead received via the ${lead.source} form on tripreviewall.com\n\n${lines}\n\n` +
      (siteUrl ? `View in Admin: ${siteUrl}/admin/leads/${lead.id}\n` : ""),
  });
}

module.exports = { getSmtpSettings, sendTestEmail, sendLeadNotification };
