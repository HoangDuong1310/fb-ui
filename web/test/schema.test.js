import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureDatabase, getPool } from "../config.js";
import { runMigrations, KEYWORD_SEEDS } from "../schema.js";

test("runMigrations creates all 12 tables, seeds keyword categories, and is idempotent", async (t) => {
  try { await ensureDatabase(); } catch { return t.skip("MySQL not reachable"); }
  await runMigrations();
  const [rows] = await getPool().query("SHOW TABLES");
  const names = rows.map((r) => Object.values(r)[0]);
  for (const want of [
    "users","user_share_prefs","posts","groups","comments","conversations",
    "advisories","products","group_prices","sources","learned_keywords",
    "prompt_profiles",
  ]) assert.ok(names.includes(want), `missing table ${want}`);

  // Each seeded category (sell/buy/support) must have AT LEAST its base words.
  // Other rows (user/AI added) may exist, so assert >= not ==.
  for (const [type, words] of Object.entries(KEYWORD_SEEDS)) {
    const [seed] = await getPool().query(
      "SELECT COUNT(*) AS n FROM learned_keywords WHERE type = ?",
      [type]
    );
    assert.ok(
      seed[0].n >= words.length,
      `expected >= ${words.length} seeded '${type}' keywords, got ${seed[0].n}`
    );
  }
  const [legacy] = await getPool().query(
    "SELECT COUNT(*) AS n FROM learned_keywords WHERE type='sell_signal'"
  );
  assert.equal(legacy[0].n, 0, "no stale sell_signal rows should remain");

  const [src] = await getPool().query("SELECT COUNT(*) AS n FROM sources");
  assert.equal(src[0].n, 4, "expected 4 seeded price sources");
  const [srcIds] = await getPool().query("SELECT id FROM sources ORDER BY id ASC");
  assert.deepEqual(
    srcIds.map((r) => r.id),
    ["anphat", "hacom", "hoangha", "nguyencong"],
    "expected the 4 sample source ids"
  );

  // Idempotency: a second run must not throw and must not duplicate seeds.
  const countSeeds = async () => {
    const [r] = await getPool().query(
      "SELECT COUNT(*) AS n FROM learned_keywords WHERE added_by='system'"
    );
    return r[0].n;
  };
  const before = await countSeeds();
  await runMigrations();
  const after = await countSeeds();
  assert.equal(after, before, "system seed count must stay stable after re-run (INSERT IGNORE)");
  const [src2] = await getPool().query("SELECT COUNT(*) AS n FROM sources");
  assert.equal(src2[0].n, 4, "source count must stay 4 after re-run (INSERT IGNORE)");

  await getPool().end();
});
