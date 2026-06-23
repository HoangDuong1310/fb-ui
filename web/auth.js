import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env, getPool } from "./config.js";

export async function hashPassword(pw) { return bcrypt.hash(pw, 10); }
export async function verifyPassword(pw, hash) { return bcrypt.compare(pw, hash); }
export function signToken(payload) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpires });
}
export function verifyToken(token) { return jwt.verify(token, env.jwtSecret); }

export function authRequired(req, res, next) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ error: "missing token" });
  try { req.userId = verifyToken(m[1]).userId; next(); }
  catch { return res.status(401).json({ error: "invalid token" }); }
}

// Middleware quyền admin: chạy SAU authRequired (đã set req.userId). Vì JWT chỉ
// mang userId nên phải tra role trong DB. Chỉ tài khoản role 'admin' mới đi tiếp;
// còn lại trả 403 kèm thông báo tiếng Việt. Gắn req.userRole để handler dùng lại.
export async function adminRequired(req, res, next) {
  try {
    const [rows] = await getPool().query(
      "SELECT role FROM users WHERE id = :id",
      { id: req.userId }
    );
    const user = rows[0];
    if (!user || user.role !== "admin") {
      return res.status(403).json({ error: "admin only", message: "Chỉ quản trị viên mới có quyền truy cập." });
    }
    req.userRole = user.role;
    next();
  } catch {
    return res.status(500).json({ error: "server error", message: "Lỗi máy chủ khi kiểm tra quyền admin." });
  }
}
