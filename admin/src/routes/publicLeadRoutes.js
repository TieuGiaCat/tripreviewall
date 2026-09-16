const { query } = require("../db");
const { readJsonBody } = require("../utils");
const mailer = require("../lib/mailer");

// Simple in-memory per-IP rate limit — mirrors the sessions Map pattern in
// auth.js. Not shared across PM2 cluster instances; fine for a single
// process. Resets on server restart, which is an acceptable tradeoff here.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 5;
const rateLimitLog = new Map(); // ip -> [timestamps]

function isRateLimited(ip) {
  const now = Date.now();
  const hits = (rateLimitLog.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  rateLimitLog.set(ip, hits);
  return hits.length > RATE_LIMIT_MAX;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, hits] of rateLimitLog.entries()) {
    const fresh = hits.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (fresh.length === 0) rateLimitLog.delete(ip);
    else rateLimitLog.set(ip, fresh);
  }
}, 15 * 60 * 1000).unref();

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return fwd.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

function sendJson(res, statusCode, obj) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/leads
 * Body (JSON): { source: "contact" | "transportation", name, email, ...fields }
 * Public, unauthenticated. Always tries to save the lead first; email
 * notification is best-effort and never blocks or fails the save.
 */
async function createLead(req, res) {
  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    sendJson(res, 429, { ok: false, error: "Too many submissions — please try again later." });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, { ok: false, error: "Malformed request." });
    return;
  }

  const source = body.source === "transportation" ? "transportation" : body.source === "contact" ? "contact" : null;
  if (!source) {
    sendJson(res, 400, { ok: false, error: "Invalid source." });
    return;
  }

  // Honeypot: a hidden field real users never fill in (bots often do).
  // Pretend success but don't actually save or email anything.
  if (body.companyWebsite) {
    sendJson(res, 201, { ok: true });
    return;
  }

  const name = String(body.name || "").trim().slice(0, 200);
  const email = String(body.email || "").trim().slice(0, 200);
  if (!name || !email || !EMAIL_RE.test(email)) {
    sendJson(res, 400, { ok: false, error: "A valid name and email are required." });
    return;
  }

  const data = {
    name,
    email,
    ipAddress: ip,
    userAgent: String(req.headers["user-agent"] || "").slice(0, 300),
  };

  if (source === "contact") {
    const message = String(body.message || "").trim().slice(0, 5000);
    if (!message) {
      sendJson(res, 400, { ok: false, error: "Message is required." });
      return;
    }
    data.message = message;
  } else {
    data.phone = String(body.phone || "").trim().slice(0, 50);
    data.service = String(body.service || "").trim().slice(0, 100);
    data.date = String(body.date || "").trim().slice(0, 20);
    data.pickup = String(body.pickup || "").trim().slice(0, 300);
    data.passengers = Number(body.passengers) || null;
    data.notes = String(body.notes || "").trim().slice(0, 5000);
    if (!data.phone || !data.pickup) {
      sendJson(res, 400, { ok: false, error: "Phone and pickup location are required." });
      return;
    }
  }

  let leadId;
  try {
    const result = await query(`INSERT INTO leads (source, status, data) VALUES ($1, 'new', $2) RETURNING id`, [
      source,
      JSON.stringify(data),
    ]);
    leadId = result.rows[0].id;
  } catch (err) {
    console.error("[leads] insert failed:", err.message);
    sendJson(res, 500, { ok: false, error: "Something went wrong saving your message. Please try again or email us directly." });
    return;
  }

  // Respond immediately — the lead is safely saved regardless of email outcome.
  sendJson(res, 201, { ok: true });

  // Fire-and-forget notification email; record the outcome back onto the lead
  // so Admin → Leads shows whether the notification went out.
  mailer
    .sendLeadNotification({ id: leadId, source, data })
    .then(() =>
      query("UPDATE leads SET data = data || $1::jsonb WHERE id = $2", [
        JSON.stringify({ emailSentAt: new Date().toISOString() }),
        leadId,
      ])
    )
    .catch((err) => {
      console.error("[leads] notification email failed:", err.message);
      query("UPDATE leads SET data = data || $1::jsonb WHERE id = $2", [JSON.stringify({ emailError: err.message }), leadId]).catch(
        () => {}
      );
    });
}

module.exports = { createLead };
