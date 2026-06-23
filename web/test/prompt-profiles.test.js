import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { buildApp } from "../server.js";
import { ensureDatabase, getPool } from "../config.js";
import { runMigrations } from "../schema.js";

// Đăng ký một user mới và trả về token. Hồ sơ ngành là bảng GLOBAL nhưng mọi
// route /api/* vẫn nằm sau authRequired nên cần Bearer token hợp lệ.
async function registerUser(app, suffix) {
  const email = `prof${Date.now()}_${suffix}@t.io`;
  const reg = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "secret123", displayName: suffix });
  assert.equal(reg.status, 201, `register ${suffix} should succeed`);
  const userId = reg.body.user.id;
  // Tài khoản mới mặc định 'pending'; duyệt trực tiếp trong DB rồi đăng nhập lấy token.
  await getPool().query("UPDATE users SET status = 'approved' WHERE id = :id", { id: userId });
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "secret123" });
  assert.equal(login.status, 200, `login ${suffix} should succeed`);
  return { token: login.body.token, userId, email };
}

test("prompt-profiles CRUD + exactly-one-active invariant", async (t) => {
  try {
    await ensureDatabase();
    await runMigrations();
  } catch {
    return t.skip("MySQL not reachable");
  }

  // Đóng pool dùng chung đúng một lần sau khi mọi sub-test xong.
  t.after(() => getPool().end());

  const app = buildApp();
  const A = await registerUser(app, "owner");
  const auth = (r) => r.set("Authorization", `Bearer ${A.token}`);

  // id duy nhất theo timestamp để không đụng seed/hồ sơ chạy trước.
  const idA = `phone_${Date.now()}`;
  const idB = `realestate_${Date.now()}`;

  await t.test("auth required: không có Bearer token bị 401", async () => {
    const res = await request(app).get("/api/prompt-profiles");
    assert.equal(res.status, 401);
    assert.equal(res.body.error, "missing token");
  });

  await t.test("POST không có id trả 400", async () => {
    const res = await auth(
      request(app).post("/api/prompt-profiles")
    ).send({ name: "thiếu id" });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "id required");
  });

  await t.test("POST upsert trả { id } và GET list chứa hồ sơ vừa tạo", async () => {
    const res = await auth(
      request(app).post("/api/prompt-profiles")
    ).send({
      id: idA,
      name: "Bán điện thoại",
      config: { classifyIntro: "Bạn phân loại nhu cầu mua điện thoại." },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.id, idA);

    const list = await auth(request(app).get("/api/prompt-profiles"));
    assert.equal(list.status, 200);
    const found = list.body.profiles.find((p) => p.id === idA);
    assert.ok(found, "list phải chứa hồ sơ vừa upsert");
    assert.equal(found.name, "Bán điện thoại");
    assert.equal(
      found.config.classifyIntro,
      "Bạn phân loại nhu cầu mua điện thoại.",
      "config JSON được parse trả về dạng object"
    );
  });

  await t.test("POST upsert lần 2 cập nhật name/config (không tạo bản ghi mới)", async () => {
    const before = await auth(request(app).get("/api/prompt-profiles"));
    const countBefore = before.body.profiles.filter((p) => p.id === idA).length;

    const res = await auth(
      request(app).post("/api/prompt-profiles")
    ).send({
      id: idA,
      name: "Bán điện thoại (v2)",
      config: { classifyIntro: "Phiên bản 2." },
    });
    assert.equal(res.status, 200);

    const after = await auth(request(app).get("/api/prompt-profiles"));
    const rows = after.body.profiles.filter((p) => p.id === idA);
    assert.equal(rows.length, countBefore, "upsert không nhân đôi bản ghi");
    assert.equal(rows[0].name, "Bán điện thoại (v2)");
    assert.equal(rows[0].config.classifyIntro, "Phiên bản 2.");
  });

  await t.test("activate -> GET /active trả đúng hồ sơ đó", async () => {
    const res = await auth(
      request(app).post(`/api/prompt-profiles/${idA}/activate`)
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.activated, idA);

    const active = await auth(request(app).get("/api/prompt-profiles/active"));
    assert.equal(active.status, 200);
    assert.ok(active.body.profile, "phải có hồ sơ active");
    assert.equal(active.body.profile.id, idA);
    assert.equal(active.body.profile.isActive, true);
  });

  await t.test("kích hoạt hồ sơ B làm A không còn active (đúng MỘT active)", async () => {
    // Tạo hồ sơ B rồi activate.
    await auth(request(app).post("/api/prompt-profiles")).send({
      id: idB,
      name: "Cho thuê phòng trọ",
      config: {},
    });
    await auth(request(app).post(`/api/prompt-profiles/${idB}/activate`));

    const active = await auth(request(app).get("/api/prompt-profiles/active"));
    assert.equal(active.body.profile.id, idB, "active mới phải là B");

    const list = await auth(request(app).get("/api/prompt-profiles"));
    const activeOnes = list.body.profiles.filter((p) => p.isActive);
    assert.equal(activeOnes.length, 1, "luôn đúng MỘT hồ sơ active");
    assert.equal(activeOnes[0].id, idB);
    const a = list.body.profiles.find((p) => p.id === idA);
    assert.equal(a.isActive, false, "A không còn active sau khi B được kích hoạt");
  });

  await t.test("DELETE trả { deleted: 1 } và hồ sơ biến mất khỏi list", async () => {
    const res = await auth(request(app).delete(`/api/prompt-profiles/${idA}`));
    assert.equal(res.status, 200);
    assert.equal(res.body.deleted, 1);

    const list = await auth(request(app).get("/api/prompt-profiles"));
    assert.ok(
      !list.body.profiles.some((p) => p.id === idA),
      "hồ sơ đã xoá không còn trong list"
    );

    // Dọn dẹp hồ sơ B để không tích luỹ rác qua các lần chạy.
    await auth(request(app).delete(`/api/prompt-profiles/${idB}`));
  });
});
