import { Router } from "express";
import { getPool } from "./config.js";
import { pushCommand } from "./realtime.js";

export const remoteCommandsRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Command types the system accepts. Unknown types are rejected at creation
// time to prevent accidental misuse or abuse.
const ALLOWED_TYPES = new Set([
  "create_post",
  "create_comment",
  "crawl_group",
  "scan_groups",
  "approve_advisory",
  "approve_conversation",
  "delete_post",
]);

// Maximum number of pending commands a single user may have at any time.
const MAX_PENDING = 10;

// Auto-expire pending commands older than this (ms).
const EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// Simple row → response mapper for remote_commands rows.
function mapCommandRow(r) {
  return {
    id: Number(r.id),
    type: r.type,
    payload: typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload,
    status: r.status,
    result: r.result
      ? typeof r.result === "string"
        ? JSON.parse(r.result)
        : r.result
      : null,
    error: r.error || null,
    createdAt: r.created_at,
    startedAt: r.started_at,
    completedAt: r.completed_at,
  };
}

// Expire stale pending commands (pending for > EXPIRY_MS).
async function expireStaleCommands(pool, userId) {
  await pool.query(
    `UPDATE remote_commands
       SET status = 'expired'
     WHERE user_id = ?
       AND status = 'pending'
       AND created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
    [userId]
  );
}

// ---------------------------------------------------------------------------
// POST / — Create a new command
// ---------------------------------------------------------------------------
remoteCommandsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { type, payload, targetUserId } = req.body;

    if (!type || !ALLOWED_TYPES.has(type)) {
      return res.status(400).json({
        error: `invalid type; allowed: ${[...ALLOWED_TYPES].join(", ")}`,
      });
    }
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "payload object required" });
    }

    // Determine the target user. Non-admin users can only create commands for
    // themselves. Admins may optionally target another user via targetUserId.
    const callerId = req.userId;
    const isAdmin = req.admin === true || req.isAdmin === true;
    const userId = isAdmin && targetUserId ? targetUserId : callerId;

    const conn = await getPool().getConnection();
    try {
      // Expire stale commands first so the pending count is accurate.
      await expireStaleCommands(conn, userId);

      // Rate-limit: check current pending count.
      const [[{ cnt }]] = await conn.query(
        `SELECT COUNT(*) AS cnt
           FROM remote_commands
          WHERE user_id = ? AND status = 'pending'`,
        [userId]
      );
      if (cnt >= MAX_PENDING) {
        return res
          .status(429)
          .json({ error: `max ${MAX_PENDING} pending commands per user` });
      }

      const [result] = await conn.query(
        `INSERT INTO remote_commands (user_id, type, payload, created_by)
         VALUES (?, ?, ?, ?)`,
        [userId, type, JSON.stringify(payload), callerId]
      );

      // Push the command via WebSocket for instant delivery. If no WS connection
      // is open (service worker sleeping), the extension will still pick it up on
      // its next 30-second poll — the push is a best-effort accelerator, not the
      // sole delivery path. Push fires-and-forgets; errors are intentionally
      // swallowed so a WS hiccup never blocks the HTTP response.
      const cmdObj = {
        id: Number(result.insertId),
        type,
        payload,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      try { pushCommand(userId, cmdObj); } catch { /* best-effort */ }

      return res.status(201).json({ command: cmdObj });
    } finally {
      conn.release();
    }
  })
);

// ---------------------------------------------------------------------------
// GET /pending — Poll for pending commands (extension calls this)
// NOTE: This route MUST be defined BEFORE /:id to avoid Express matching
//       "pending" as an id parameter.
// ---------------------------------------------------------------------------
remoteCommandsRouter.get(
  "/pending",
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    const pool = getPool();

    // Expire stale commands before polling.
    await expireStaleCommands(pool, userId);

    const [rows] = await pool.query(
      `SELECT id, type, payload, created_at
         FROM remote_commands
        WHERE user_id = ?
          AND status = 'pending'
        ORDER BY created_at ASC`,
      [userId]
    );

    return res.json({
      commands: rows.map((r) => ({
        id: Number(r.id),
        type: r.type,
        payload: typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload,
        createdAt: r.created_at,
      })),
    });
  })
);

// ---------------------------------------------------------------------------
// PATCH /:id — Update command status (extension calls this)
// ---------------------------------------------------------------------------
remoteCommandsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, result, error } = req.body;
    const userId = req.userId;

    const ALLOWED_STATUS = new Set(["running", "completed", "failed"]);
    if (!status || !ALLOWED_STATUS.has(status)) {
      return res.status(400).json({
        error: `invalid status; allowed: ${[...ALLOWED_STATUS].join(", ")}`,
      });
    }

    const pool = getPool();

    // Verify ownership and current status in a single query.
    const [[row]] = await pool.query(
      `SELECT id, status FROM remote_commands WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    if (!row) {
      return res.status(404).json({ error: "command not found" });
    }

    // Only allow forward transitions: pending → running → completed/failed.
    const validTransitions = {
      pending: ["running", "failed", "expired"],
      running: ["completed", "failed"],
    };
    if (
      !validTransitions[row.status] ||
      !validTransitions[row.status].includes(status)
    ) {
      return res.status(409).json({
        error: `cannot transition from '${row.status}' to '${status}'`,
      });
    }

    // Build dynamic SET clause.
    const sets = ["status = ?"];
    const params = [status];

    if (status === "running") {
      sets.push("started_at = NOW()");
    }
    if (status === "completed" || status === "failed") {
      sets.push("completed_at = NOW()");
    }
    if (result !== undefined) {
      sets.push("result = ?");
      params.push(JSON.stringify(result));
    }
    if (error !== undefined) {
      sets.push("error = ?");
      params.push(error);
    }

    params.push(id);
    await pool.query(
      `UPDATE remote_commands SET ${sets.join(", ")} WHERE id = ?`,
      params
    );

    return res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// GET / — List commands with optional filters (web UI calls this)
// ---------------------------------------------------------------------------
remoteCommandsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    const { status, page = "1", limit = "20" } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const pool = getPool();

    // Build WHERE clause.
    const conditions = ["user_id = ?"];
    const params = [userId];

    if (status) {
      conditions.push("status = ?");
      params.push(status);
    }

    const where = conditions.join(" AND ");

    // Get total count.
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM remote_commands WHERE ${where}`,
      params
    );

    // Get page of results.
    const [rows] = await pool.query(
      `SELECT id, type, payload, status, result, error,
              created_at, started_at, completed_at
         FROM remote_commands
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    return res.json({
      commands: rows.map(mapCommandRow),
      total,
      page: pageNum,
      limit: limitNum,
    });
  })
);

// ---------------------------------------------------------------------------
// GET /:id — Get single command detail
// ---------------------------------------------------------------------------
remoteCommandsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.userId;
    const pool = getPool();

    const [[row]] = await pool.query(
      `SELECT id, type, payload, status, result, error,
              created_at, started_at, completed_at
         FROM remote_commands
        WHERE id = ? AND user_id = ?`,
      [id, userId]
    );

    if (!row) {
      return res.status(404).json({ error: "command not found" });
    }

    return res.json({ command: mapCommandRow(row) });
  })
);
