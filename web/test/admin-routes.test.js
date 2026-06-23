import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { buildApp } from "../server.js";
import { ensureDatabase, getPool } from "../config.js";
import { runMigrations } from "../schema.js";

// Đăng ký một tài khoản thường. Trả về { userId, email } — tài khoản mới luôn ở
// trạng thái 'pending' (chưa đăng nhập được tới khi admin duyệt).
async function registerPending(app, suffix) {
  const email = `adm_${Date.now()}_${suffix}@t.io`;
  const reg = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "secret123", displayName: suffix });
  assert.equal(reg.status, 201, `register ${suffix} should return 201`);
  return { userId: reg.body.user.id, email };
}

// Tạo một admin sẵn sàng dùng: đăng ký -> set role='admin'+status='approved'
// trực tiếp trong DB (mô phỏng đúng cách migration bootstrap ADMIN_EMAIL) ->
// đăng nhập lấy token. Trả về { token, userId, email }.
async function makeAdmin(app, suffix) {
  const { userId, email } = await registerPending(app, `admin_${suffix}`);
  await getPool().query(
    "UPDATE users SET role = 'admin', status = 'approved' WHERE id = :id",
    { id: userId }
  );
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "secret123" });
  assert.equal(login.status, 200, `admin ${suffix} login should succeed`);
  return { token: login.body.token, userId, email };
}

// Đăng nhập một tài khoản đã được duyệt, trả về token.
async function loginToken(app, email) {
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "secret123" });
  assert.equal(login.status, 200, `login ${email} should succeed`);
  return login.body.token;
}

test("admin routes", async (t) => {
  try {
    await ensureDatabase();
    await runMigrations();
  } catch {
    return t.skip("MySQL not reachable");
  }

  const app = buildApp();

  await t.test(
    "tài khoản pending bị chặn login; admin duyệt qua /approve thì login được",
    async () => {
      const admin = await makeAdmin(app, "approve");
      const { userId, email } = await registerPending(app, "pendingUser");

      // Chưa duyệt -> login 403.
      const blocked = await request(app)
        .post("/api/auth/login")
        .send({ email, password: "secret123" });
      assert.equal(blocked.status, 403);

      // Admin duyệt qua API.
      const approve = await request(app)
        .patch(`/api/admin/users/${userId}/approve`)
        .set("Authorization", `Bearer ${admin.token}`);
      assert.equal(approve.status, 200);
      assert.equal(approve.body.status, "approved");

      // Sau khi duyệt -> login 200.
      const ok = await request(app)
        .post("/api/auth/login")
        .send({ email, password: "secret123" });
      assert.equal(ok.status, 200);
      assert.ok(ok.body.token);
    }
  );

  await t.test("admin khóa tài khoản -> tài khoản đó không login được nữa", async () => {
    const admin = await makeAdmin(app, "lock");
    const { userId, email } = await registerPending(app, "victim");
    // Duyệt trước để có thể đăng nhập.
    await request(app)
      .patch(`/api/admin/users/${userId}/approve`)
      .set("Authorization", `Bearer ${admin.token}`);
    await loginToken(app, email); // xác nhận login được khi đã duyệt

    // Admin khóa.
    const lock = await request(app)
      .patch(`/api/admin/users/${userId}/lock`)
      .set("Authorization", `Bearer ${admin.token}`);
    assert.equal(lock.status, 200);
    assert.equal(lock.body.status, "locked");

    // Bị khóa -> login 403.
    const blocked = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "secret123" });
    assert.equal(blocked.status, 403);
  });

  await t.test("GET /api/admin/users liệt kê tài khoản có role + status", async () => {
    const admin = await makeAdmin(app, "list");
    const { userId } = await registerPending(app, "listee");

    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${admin.token}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.users));
    const row = res.body.users.find((u) => u.id === userId);
    assert.ok(row, "user mới phải xuất hiện trong danh sách");
    assert.equal(row.status, "pending");
    assert.equal(row.role, "user");
  });

  await t.test("PATCH /api/admin/users/:id đổi role + status linh hoạt", async () => {
    const admin = await makeAdmin(app, "patch");
    const { userId } = await registerPending(app, "promoted");

    const res = await request(app)
      .patch(`/api/admin/users/${userId}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ role: "admin", status: "approved" });
    assert.equal(res.status, 200);
    assert.equal(res.body.role, "admin");
    assert.equal(res.body.status, "approved");

    // Trạng thái không hợp lệ bị từ chối.
    const bad = await request(app)
      .patch(`/api/admin/users/${userId}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ status: "banished" });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, "invalid status");
  });

  await t.test("admin không thể tự khóa / tự hạ quyền / tự xóa", async () => {
    const admin = await makeAdmin(app, "selfguard");

    const selfLock = await request(app)
      .patch(`/api/admin/users/${admin.userId}/lock`)
      .set("Authorization", `Bearer ${admin.token}`);
    assert.equal(selfLock.status, 400);
    assert.equal(selfLock.body.error, "cannot lock self");

    const selfDemote = await request(app)
      .patch(`/api/admin/users/${admin.userId}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ role: "user" });
    assert.equal(selfDemote.status, 400);
    assert.equal(selfDemote.body.error, "cannot demote self");

    const selfDelete = await request(app)
      .delete(`/api/admin/users/${admin.userId}`)
      .set("Authorization", `Bearer ${admin.token}`);
    assert.equal(selfDelete.status, 400);
    assert.equal(selfDelete.body.error, "cannot delete self");
  });

  await t.test("DELETE /api/admin/users/:id xóa tài khoản khác", async () => {
    const admin = await makeAdmin(app, "del");
    const { userId } = await registerPending(app, "doomed");

    const del = await request(app)
      .delete(`/api/admin/users/${userId}`)
      .set("Authorization", `Bearer ${admin.token}`);
    assert.equal(del.status, 200);
    assert.equal(del.body.deleted, true);

    // Không còn trong danh sách.
    const list = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${admin.token}`);
    assert.ok(!list.body.users.some((u) => u.id === userId));
  });

  await t.test("user thường truy cập /api/admin/* bị 403", async () => {
    const { userId, email } = await registerPending(app, "plainuser");
    // Duyệt để có token (vẫn role 'user').
    await getPool().query(
      "UPDATE users SET status = 'approved' WHERE id = :id",
      { id: userId }
    );
    const token = await loginToken(app, email);

    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 403);
  });

  await t.test("/api/admin/* không token -> 401", async () => {
    const res = await request(app).get("/api/admin/users");
    assert.equal(res.status, 401);
  });

  await t.test(
    "admin sửa & xóa dữ liệu group_prices (id số nguyên) qua /data",
    async () => {
      const admin = await makeAdmin(app, "data");

      // Cần một post + một group_price thuộc về admin trước (FK -> posts).
      const postId = `adp_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const groupId = `adg_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const savePost = await request(app)
        .post("/api/posts")
        .set("Authorization", `Bearer ${admin.token}`)
        .send({
          posts: [
            { postId, groupId, groupName: "G", text: "p", timestamp: Date.now() },
          ],
        });
      assert.equal(savePost.status, 200);

      const saveGp = await request(app)
        .post("/api/group-prices")
        .set("Authorization", `Bearer ${admin.token}`)
        .send({
          groupPrices: [
            {
              postId,
              groupId,
              name: "iPhone 13",
              price: 12000000,
              sellerName: "Seller One",
              condition: "used",
            },
          ],
        });
      assert.equal(saveGp.status, 200);

      // Liệt kê bảng group_prices, tìm dòng vừa tạo theo post_id.
      const listed = await request(app)
        .get("/api/admin/data/group_prices")
        .set("Authorization", `Bearer ${admin.token}`);
      assert.equal(listed.status, 200);
      assert.equal(listed.body.table, "group_prices");
      const row = listed.body.rows.find((r) => r.post_id === postId);
      assert.ok(row, "phải thấy dòng group_price vừa tạo");
      const rowId = row.id;
      assert.ok(Number.isInteger(rowId));

      // Sửa cột được phép (name + price).
      const patch = await request(app)
        .patch(`/api/admin/data/group_prices/${rowId}`)
        .set("Authorization", `Bearer ${admin.token}`)
        .send({ name: "iPhone 14", price: 15000000 });
      assert.equal(patch.status, 200);
      assert.equal(patch.body.updated, true);

      // Xác nhận sửa thật trong DB.
      const [check] = await getPool().query(
        "SELECT name, price FROM group_prices WHERE id = :id",
        { id: rowId }
      );
      assert.equal(check[0].name, "iPhone 14");
      assert.equal(Number(check[0].price), 15000000);

      // Xóa dòng.
      const del = await request(app)
        .delete(`/api/admin/data/group_prices/${rowId}`)
        .set("Authorization", `Bearer ${admin.token}`);
      assert.equal(del.status, 200);
      assert.equal(del.body.deleted, true);

      // Đã biến mất.
      const after = await request(app)
        .get("/api/admin/data/group_prices")
        .set("Authorization", `Bearer ${admin.token}`);
      assert.ok(!after.body.rows.some((r) => r.id === rowId));
    }
  );

  await t.test("/api/admin/data/:table với bảng lạ -> 404", async () => {
    const admin = await makeAdmin(app, "unknowntbl");
    const res = await request(app)
      .get("/api/admin/data/secret_table")
      .set("Authorization", `Bearer ${admin.token}`);
    assert.equal(res.status, 404);
    assert.equal(res.body.error, "unknown table");
  });

  await t.test("PATCH /api/admin/data/group_prices/:id với id không hợp lệ -> 400", async () => {
    const admin = await makeAdmin(app, "badid");
    const res = await request(app)
      .patch("/api/admin/data/group_prices/abc")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ name: "x" });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "invalid id");
  });

  await t.test(
    "GET /api/admin/users/:id/overview tổng hợp dữ liệu user (posts + group_prices + counts)",
    async () => {
      const admin = await makeAdmin(app, "overview");

      // Tạo một user thường đã duyệt, đăng nhập để có token tự tạo dữ liệu.
      const { userId, email } = await registerPending(app, "ovOwner");
      await getPool().query(
        "UPDATE users SET status = 'approved' WHERE id = :id",
        { id: userId }
      );
      const userToken = await loginToken(app, email);

      // User tự crawl 1 post + 1 group_price (gắn crawled_by_user_id = userId).
      const postId = `ovp_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const groupId = `ovg_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const savePost = await request(app)
        .post("/api/posts")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          posts: [
            { postId, groupId, groupName: "G-OV", text: "bài của tôi", timestamp: Date.now() },
          ],
        });
      assert.equal(savePost.status, 200);

      const saveGp = await request(app)
        .post("/api/group-prices")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          groupPrices: [
            { postId, groupId, name: "RAM 16GB", price: 800000, sellerName: "S", condition: "used" },
          ],
        });
      assert.equal(saveGp.status, 200);

      // Admin xem overview của user đó.
      const res = await request(app)
        .get(`/api/admin/users/${userId}/overview`)
        .set("Authorization", `Bearer ${admin.token}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.user.id, userId);
      assert.equal(res.body.user.email, email);
      assert.ok(res.body.counts.posts >= 1, "phải đếm ít nhất 1 post");
      assert.ok(res.body.counts.groupPrices >= 1, "phải đếm ít nhất 1 group_price");
      assert.ok(
        res.body.posts.some((p) => p.postId === postId),
        "mẫu posts phải chứa bài vừa tạo"
      );
      assert.ok(
        res.body.groupPrices.some((g) => g.name === "RAM 16GB"),
        "mẫu groupPrices phải chứa dòng vừa tạo"
      );
    }
  );

  await t.test("GET /api/admin/users/:id/overview với user không tồn tại -> 404", async () => {
    const admin = await makeAdmin(app, "ovmissing");
    const res = await request(app)
      .get("/api/admin/users/99999999/overview")
      .set("Authorization", `Bearer ${admin.token}`);
    assert.equal(res.status, 404);
    assert.equal(res.body.error, "not found");
  });

  await t.test("GET /api/admin/users/:id/overview với id không hợp lệ -> 400", async () => {
    const admin = await makeAdmin(app, "ovbadid");
    const res = await request(app)
      .get("/api/admin/users/abc/overview")
      .set("Authorization", `Bearer ${admin.token}`);
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "invalid id");
  });

  await getPool().end();
});
