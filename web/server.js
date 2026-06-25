import http from "node:http";
import { pathToFileURL, fileURLToPath } from "node:url";
import express from "express";
import { authRouter, dataRouter, adminRouter } from "./routes.js";
import { remoteCommandsRouter } from "./remote-commands.js";
import { authRequired, adminRequired } from "./auth.js";
import { env, ensureDatabase } from "./config.js";
import { runMigrations } from "./schema.js";
import { attachRealtime } from "./realtime.js";

// Absolute path to the static dashboard assets. Resolved from this module's URL
// (not process.cwd()) so `npm start` works regardless of the caller's directory.
const publicDir = fileURLToPath(new URL("./public", import.meta.url));

export function buildApp() {
  const app = express();
  // Source-sync POSTs (e.g. /api/products) can carry the full product catalog of
  // a store in one batch — observed up to ~1MB. The body-parser default cap is
  // 100KB, which rejected those with PayloadTooLargeError -> 500. Raise the limit
  // so large but legitimate sync payloads are accepted.
  app.use(express.json({ limit: "25mb" }));
  // Serve the read-only web dashboard (index.html/app.js) at the site root. The
  // static paths (/, /index.html, /app.js) do not overlap with /api/*, so this
  // never shadows the API routers below. The terminal error middleware stays last.
  app.use(express.static(publicDir));
  app.use("/api/auth", authRouter);
  // All data routes require a valid Bearer token; authRequired sets req.userId
  // which every data handler relies on for attribution and share-filtering.
  app.use("/api", authRequired, dataRouter);
  // Admin-only routes: authRequired sets req.userId, then adminRequired does a
  // DB role lookup and rejects non-admins with 403 before any handler runs.
  app.use("/api/admin", authRequired, adminRequired, adminRouter);
  // Remote commands: authenticated users create/poll/update commands that the
  // Chrome extension picks up and executes. Mounted on its own sub-path so
  // route ordering (especially /pending before /:id) is self-contained.
  app.use("/api/remote-commands", authRequired, remoteCommandsRouter);
  // Debug probe used to exercise authRequired. Gated so it never ships to
  // production; tests do not set NODE_ENV=production, so it stays mounted there.
  if (process.env.NODE_ENV !== "production") {
    app.get("/api/_whoami", authRequired, (req, res) => {
      res.json({ userId: req.userId });
    });
  }
  // Terminal error-handling middleware. Mounted AFTER all routers so that any
  // error forwarded via next(err) (e.g. from asyncHandler-wrapped async route
  // handlers) produces a clean 500 instead of an unhandled rejection / hung
  // request. Internals are logged server-side and never leaked to the client.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  });
  return app;
}

export async function start() {
  await ensureDatabase();
  await runMigrations();
  const app = buildApp();
  // Wrap the Express app in an explicit http.Server so the WebSocket server can
  // share the same port: ws attaches to the server's "upgrade" event rather than
  // listening on a separate port. This keeps the hybrid model (instant WS push +
  // 30s polling fallback) behind a single host/port for the extension to reach.
  const server = http.createServer(app);
  attachRealtime(server);
  server.listen(env.port, () => {
    console.log(`web backend listening on :${env.port}`);
  });
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  start();
}
