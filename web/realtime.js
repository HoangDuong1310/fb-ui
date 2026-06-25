import { WebSocketServer } from "ws";
import { verifyToken } from "./auth.js";

// Real-time command delivery over WebSocket. This is the "instant" half of the
// hybrid model: when a Chrome extension service worker is awake it holds a WS
// connection here, so newly-created commands are pushed immediately instead of
// waiting for the 30s cmdPoll alarm. The polling path stays as a fallback for
// when the SW is asleep or the socket has dropped, and the extension dedupes by
// command id so a command delivered by both paths only executes once.

// userId (number) -> Set<WebSocket>. A single user may have multiple awake
// service workers (e.g. several browser profiles), so we fan out to all of them.
const connections = new Map();

// Heartbeat interval. ws does not detect half-open TCP connections on its own;
// we ping every 30s and terminate sockets that did not pong since the last tick.
const HEARTBEAT_MS = 30000;

let wss = null;
let heartbeatTimer = null;

function addConnection(userId, ws) {
  let set = connections.get(userId);
  if (!set) {
    set = new Set();
    connections.set(userId, set);
  }
  set.add(ws);
}

function removeConnection(userId, ws) {
  const set = connections.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) connections.delete(userId);
}

// Extract the bearer token from the upgrade request. Browsers cannot set custom
// headers on a WebSocket handshake, so the extension passes the JWT as a query
// param (?token=...). We verify it the same way authRequired does for HTTP.
function authFromRequest(req) {
  try {
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");
    if (!token) return null;
    const payload = verifyToken(token);
    if (!payload || !payload.userId) return null;
    return Number(payload.userId);
  } catch {
    return null;
  }
}

// Attach a WebSocketServer to an existing http.Server. We use noServer mode and
// handle the 'upgrade' event ourselves so we can authenticate BEFORE completing
// the handshake and so only our own path (/ws/commands) is upgraded — other
// upgrade requests are rejected without interfering with the HTTP app.
export function attachRealtime(server) {
  if (wss) return wss;
  wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    let pathname = "";
    try {
      pathname = new URL(req.url, "http://localhost").pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== "/ws/commands") {
      socket.destroy();
      return;
    }
    const userId = authFromRequest(req);
    if (!userId) {
      // 401 then close: the handshake never completes for unauthenticated peers.
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.userId = userId;
      ws.isAlive = true;
      addConnection(userId, ws);

      ws.on("pong", () => {
        ws.isAlive = true;
      });
      // Clients are not expected to send anything meaningful; a message just
      // keeps the socket considered alive. We ignore the contents.
      ws.on("message", () => {
        ws.isAlive = true;
      });
      ws.on("close", () => removeConnection(userId, ws));
      ws.on("error", () => removeConnection(userId, ws));

      // Greet the client so it can confirm the channel is live.
      safeSend(ws, { type: "connected" });
    });
  });

  heartbeatTimer = setInterval(() => {
    if (!wss) return;
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        // ignore; a failed ping will be cleaned up on the next tick / close
      }
    }
  }, HEARTBEAT_MS);
  // Do not let the heartbeat keep the process alive on its own.
  if (heartbeatTimer.unref) heartbeatTimer.unref();

  return wss;
}

function safeSend(ws, obj) {
  // ws.OPEN === 1; guard so we never throw on a closing/closed socket.
  if (ws.readyState !== 1) return false;
  try {
    ws.send(JSON.stringify(obj));
    return true;
  } catch {
    return false;
  }
}

// Push a newly-created command to every awake service worker of the owning user.
// Returns the number of sockets the command was delivered to (0 means nobody is
// connected right now — the extension will pick it up via the poll fallback).
export function pushCommand(userId, command) {
  const set = connections.get(Number(userId));
  if (!set || set.size === 0) return 0;
  let delivered = 0;
  for (const ws of set) {
    if (safeSend(ws, { type: "command", command })) delivered += 1;
  }
  return delivered;
}

// Number of currently connected sockets for a user — handy for tests/diagnostics.
export function connectionCount(userId) {
  const set = connections.get(Number(userId));
  return set ? set.size : 0;
}

// Tear everything down (used by tests so the server can close cleanly).
export function closeRealtime() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (wss) {
    for (const ws of wss.clients) {
      try {
        ws.terminate();
      } catch {
        // ignore
      }
    }
    wss.close();
    wss = null;
  }
  connections.clear();
}
