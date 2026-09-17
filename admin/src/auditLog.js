const { query } = require("./db");

/**
 * Records an admin action (create/update/delete). Never throws — a logging
 * failure is caught and only console.error'd, so it can never break the
 * operation it's recording. Call with `await` for predictable ordering;
 * it's safe to await even on failure.
 *
 * @param {object} user - the session object (from middleware), or null
 * @param {"create"|"update"|"delete"} action
 * @param {string} targetType - e.g. "tour", "post", "user", "settings"
 * @param {string} targetId - slug, id, or other human-identifiable key
 * @param {string} summary - short human-readable description
 */
async function logAudit(user, action, targetType, targetId, summary) {
  try {
    await query(
      `INSERT INTO audit_log (user_id, user_email, action, target_type, target_id, summary)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user ? user.userId : null, user ? user.email : null, action, targetType, targetId || null, summary || null]
    );
  } catch (err) {
    console.error("[audit] Failed to log action:", err.message);
  }
}

/**
 * Lists recent audit log entries, newest first, with simple pagination.
 * Returns { rows, total }.
 */
async function listAuditLog({ page = 1, pageSize = 30, targetType = null } = {}) {
  const offset = (page - 1) * pageSize;
  const whereClause = targetType ? "WHERE target_type = $3" : "";
  const params = targetType ? [pageSize, offset, targetType] : [pageSize, offset];

  const [rowsResult, countResult] = await Promise.all([
    query(
      `SELECT id, user_email, action, target_type, target_id, summary, created_at
       FROM audit_log ${whereClause}
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      params
    ),
    query(
      `SELECT COUNT(*) AS total FROM audit_log ${targetType ? "WHERE target_type = $1" : ""}`,
      targetType ? [targetType] : []
    ),
  ]);

  return { rows: rowsResult.rows, total: Number(countResult.rows[0].total) };
}

module.exports = { logAudit, listAuditLog };
