import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { buildApp } from "../server.js";
import { ensureDatabase, getPool } from "../config.js";
import { runMigrations } from "../schema.js";

// Registers a fresh user and returns { token, userId } so each scenario gets an
// isolated identity (emails are timestamp+suffix unique to avoid 409 collisions
// across reruns against a persistent dev database).
async function registerUser(app, suffix) {
  const email = `data${Date.now()}_${suffix}@t.io`;
  const reg = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "secret123", displayName: suffix });
  assert.equal(reg.status, 201, `register ${suffix} should succeed`);
  const userId = reg.body.user.id;
  // Tài khoản mới mặc định 'pending' (không login được tới khi admin duyệt).
  // Duyệt trực tiếp trong DB để lấy token đăng nhập cho các kịch bản bên dưới.
  await getPool().query("UPDATE users SET status = 'approved' WHERE id = :id", { id: userId });
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "secret123" });
  assert.equal(login.status, 200, `login ${suffix} should succeed`);
  return { token: login.body.token, userId, email };
}

test("data routes share-filtering", async (t) => {
  try {
    await ensureDatabase();
    await runMigrations();
  } catch {
    return t.skip("MySQL not reachable");
  }

  // Close the single shared pool exactly once after all sub-tests complete.
  t.after(() => getPool().end());

  const app = buildApp();

  await t.test(
    "B sees A's shared post; after A turns share_crawled off, B loses it but A keeps it",
    async () => {
      const A = await registerUser(app, "A");
      const B = await registerUser(app, "B");

      // A unique post id and group id so the assertions key off exactly this
      // row regardless of other data in a persistent dev database.
      const postId = `p_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const groupId = `g_${Date.now()}`;

      // A saves a post. The row inherits A's share_crawled_default (TRUE by
      // default at registration), so it starts shared.
      const save = await request(app)
        .post("/api/posts")
        .set("Authorization", `Bearer ${A.token}`)
        .send({
          posts: [
            {
              postId,
              groupId,
              groupName: "G",
              text: "shared post body",
              timestamp: Date.now(),
            },
          ],
        });
      assert.equal(save.status, 200);

      // Observation 1: B sees A's post while it is shared.
      const bSees = await request(app)
        .get("/api/posts")
        .set("Authorization", `Bearer ${B.token}`);
      assert.equal(bSees.status, 200);
      assert.ok(
        bSees.body.posts.some((p) => p.postId === postId),
        "B should see A's shared post"
      );

      // A flips the master share_crawled switch off. The PATCH handler cascades
      // to existing rows: A's posts get share_crawled=0, hiding them from others
      // while leaving the rows intact and visible to A.
      const patch = await request(app)
        .patch("/api/me/share-prefs")
        .set("Authorization", `Bearer ${A.token}`)
        .send({ share_crawled_default: false });
      assert.equal(patch.status, 200);

      // Observation 2: B no longer sees the post after A unshares.
      const bAfter = await request(app)
        .get("/api/posts")
        .set("Authorization", `Bearer ${B.token}`);
      assert.equal(bAfter.status, 200);
      assert.ok(
        !bAfter.body.posts.some((p) => p.postId === postId),
        "B should NOT see A's post after A turns share off"
      );

      // Observation 3: A still sees their own post (ownership beats the flag).
      const aAfter = await request(app)
        .get("/api/posts")
        .set("Authorization", `Bearer ${A.token}`);
      assert.equal(aAfter.status, 200);
      assert.ok(
        aAfter.body.posts.some((p) => p.postId === postId),
        "A should STILL see their own post after turning share off"
      );
    }
  );

  await t.test("data routes require authentication", async () => {
    const res = await request(app).get("/api/posts");
    assert.equal(res.status, 401);
  });

  // FIX 1: DELETE /api/products with no source must NOT wipe the shared catalog.
  await t.test(
    "DELETE /api/products with no source returns 400 and leaves products intact",
    async () => {
      const U = await registerUser(app, "delguard");
      const productId = `prod_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

      const add = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${U.token}`)
        .send({
          products: [
            { productId, source: "src_test", name: "Guard Item", price: 100 },
          ],
        });
      assert.equal(add.status, 200);

      const del = await request(app)
        .delete("/api/products")
        .set("Authorization", `Bearer ${U.token}`);
      assert.equal(del.status, 400, "unscoped bulk delete must be rejected");
      assert.equal(del.body.error, "source required for bulk delete");

      const after = await request(app)
        .get("/api/products")
        .set("Authorization", `Bearer ${U.token}`);
      assert.equal(after.status, 200);
      assert.ok(
        after.body.products.some((p) => p.productId === productId),
        "product must still exist after rejected unscoped delete"
      );
    }
  );

  // DELETE /api/products?all=1 is the intentional "Xóa toàn bộ" full wipe. The
  // dashboard sends this flag so a deliberate clear-all is distinguishable from
  // an accidental unscoped DELETE (which the guard above rejects). It must remove
  // every product and report the deleted count.
  await t.test(
    "DELETE /api/products?all=1 wipes the whole catalog and reports a count",
    async () => {
      const U = await registerUser(app, "delall");
      const productId = `prodall_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

      const add = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${U.token}`)
        .send({
          products: [
            { productId, source: "src_all", name: "Wipe Item", price: 100 },
          ],
        });
      assert.equal(add.status, 200);

      const del = await request(app)
        .delete("/api/products")
        .query({ all: 1 })
        .set("Authorization", `Bearer ${U.token}`);
      assert.equal(del.status, 200, "explicit all=1 wipe must succeed");
      assert.ok(del.body.deleted >= 1, "deleted count should include our product");

      const after = await request(app)
        .get("/api/products")
        .set("Authorization", `Bearer ${U.token}`);
      assert.equal(after.status, 200);
      assert.equal(after.body.products.length, 0, "catalog must be empty after all=1 wipe");
    }
  );

  // REGRESSION: the rich product shape (buildPrice, inStock, brand, image, stock,
  // warranty, condition) must survive the POST -> GET round-trip. These fields have
  // no dedicated columns; they live in the `raw` JSON column. POST stores the whole
  // object and mapProductRow() spreads it back on read. Without that, retail/build
  // prices and the in-stock filter silently vanish from the catalog.
  await t.test(
    "POST /api/products preserves buildPrice/inStock and other raw fields on GET",
    async () => {
      const U = await registerUser(app, "rawroundtrip");
      const productId = `praw_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const source = `src_raw_${Date.now()}`;

      const add = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${U.token}`)
        .send({
          products: [
            {
              productId,
              source,
              name: "RTX Build PC",
              price: 25000000,
              url: "https://example.com/p",
              category: "pc",
              buildPrice: 23000000,
              inStock: true,
              brand: "ACME",
              image: "https://example.com/p.jpg",
              stock: 7,
              warranty: "36T",
              condition: "new",
            },
          ],
        });
      assert.equal(add.status, 200);

      const list = await request(app)
        .get("/api/products")
        .query({ source })
        .set("Authorization", `Bearer ${U.token}`);
      assert.equal(list.status, 200);
      const row = list.body.products.find((p) => p.productId === productId);
      assert.ok(row, "the product should be returned");
      assert.equal(row.buildPrice, 23000000, "buildPrice must survive the round-trip");
      assert.equal(row.inStock, true, "inStock must survive the round-trip");
      assert.equal(row.brand, "ACME");
      assert.equal(row.stock, 7);
      assert.equal(row.warranty, "36T");
      assert.equal(row.condition, "new");
      // Canonical columns stay authoritative.
      assert.equal(row.name, "RTX Build PC");
      assert.equal(row.price, 25000000);
      assert.equal(row.category, "pc");
    }
  );

  // FIX 2: POST /api/group-prices must be idempotent on resubmit of the same batch.
  await t.test(
    "POST /api/group-prices submitting the same batch twice does not duplicate rows",
    async () => {
      const U = await registerUser(app, "gpidem");
      const postId = `gp_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const groupId = `gpg_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

      // group_prices FK requires the post to exist first.
      const savePost = await request(app)
        .post("/api/posts")
        .set("Authorization", `Bearer ${U.token}`)
        .send({
          posts: [
            { postId, groupId, groupName: "G", text: "p", timestamp: Date.now() },
          ],
        });
      assert.equal(savePost.status, 200);

      const batch = {
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
      };

      const first = await request(app)
        .post("/api/group-prices")
        .set("Authorization", `Bearer ${U.token}`)
        .send(batch);
      assert.equal(first.status, 200);

      const second = await request(app)
        .post("/api/group-prices")
        .set("Authorization", `Bearer ${U.token}`)
        .send(batch);
      assert.equal(second.status, 200);

      const list = await request(app)
        .get("/api/group-prices")
        .query({ groupId })
        .set("Authorization", `Bearer ${U.token}`);
      assert.equal(list.status, 200);
      const mine = list.body.groupPrices.filter((g) => g.postId === postId);
      assert.equal(
        mine.length,
        1,
        "resubmitting the same batch must not create a duplicate row"
      );
    }
  );

  // FIX 3: numeric filter validation on group-prices.
  await t.test(
    "GET /api/group-prices with non-numeric priceMin returns 400",
    async () => {
      const U = await registerUser(app, "gpnan");
      const res = await request(app)
        .get("/api/group-prices")
        .query({ priceMin: "abc" })
        .set("Authorization", `Bearer ${U.token}`);
      assert.equal(res.status, 400);
      assert.equal(res.body.error, "invalid price filter");
    }
  );

  // FIX 3: negative limit on products/search must not throw (clamped to >= 1).
  await t.test(
    "GET /api/products/search with negative limit does not error",
    async () => {
      const U = await registerUser(app, "srchlimit");
      const res = await request(app)
        .get("/api/products/search")
        .query({ limit: "-5" })
        .set("Authorization", `Bearer ${U.token}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.products));
    }
  );

  // FOLLOW-UP: PATCH /api/posts/:id persists parsedAt so the group-price funnel
  // (Tier 2) can skip already-parsed posts on later runs. Scoped to the owner.
  await t.test(
    "PATCH /api/posts/:id sets parsedAt on the caller's own post; foreign post is untouched",
    async () => {
      const A = await registerUser(app, "patchA");
      const B = await registerUser(app, "patchB");
      const postId = `pp_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const groupId = `ppg_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

      const save = await request(app)
        .post("/api/posts")
        .set("Authorization", `Bearer ${A.token}`)
        .send({
          posts: [
            { postId, groupId, groupName: "G", text: "p", timestamp: Date.now() },
          ],
        });
      assert.equal(save.status, 200);

      // A marks their own post parsed.
      const iso = new Date().toISOString();
      const patch = await request(app)
        .patch(`/api/posts/${encodeURIComponent(postId)}`)
        .set("Authorization", `Bearer ${A.token}`)
        .send({ parsedAt: iso });
      assert.equal(patch.status, 200);
      assert.equal(patch.body.updated, 1, "owner patch should affect exactly one row");

      const aList = await request(app)
        .get("/api/posts")
        .query({ groupId })
        .set("Authorization", `Bearer ${A.token}`);
      assert.equal(aList.status, 200);
      const aRow = aList.body.posts.find((p) => p.postId === postId);
      assert.ok(aRow, "A should see their post");
      assert.ok(aRow.parsedAt, "parsedAt should be persisted and returned");

      // B (not the owner) cannot mark A's post: ownership scope yields 0 rows.
      const foreign = await request(app)
        .patch(`/api/posts/${encodeURIComponent(postId)}`)
        .set("Authorization", `Bearer ${B.token}`)
        .send({ parsedAt: new Date().toISOString() });
      assert.equal(foreign.status, 200);
      assert.equal(foreign.body.updated, 0, "non-owner must not update the row");
    }
  );

  // Invalid parsedAt is rejected with 400 rather than writing a bad datetime.
  await t.test("PATCH /api/posts/:id with invalid parsedAt returns 400", async () => {
    const U = await registerUser(app, "patchbad");
    const postId = `pb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    await request(app)
      .post("/api/posts")
      .set("Authorization", `Bearer ${U.token}`)
      .send({ posts: [{ postId, groupId: "g", text: "p", timestamp: Date.now() }] });

    const res = await request(app)
      .patch(`/api/posts/${encodeURIComponent(postId)}`)
      .set("Authorization", `Bearer ${U.token}`)
      .send({ parsedAt: "not-a-date" });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "invalid parsedAt");
  });
});
