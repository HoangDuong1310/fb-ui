/**
 * server/web/ai.js
 *
 * Server-side port of the Chrome extension AI modules (advisory.js, prompts.js,
 * ai.js spinPostContent). Runs inside Express; resolves per-user AI config
 * (api key, base, model) from the `users` table instead of chrome.storage.
 *
 * All DB access goes through getPool() with named placeholders.
 * No chrome.* APIs — pure Node.js + fetch.
 */

import { getPool, env } from "./config.js";

// ─────────────────────────────────────────────────────────────────────────────
// Prompt profiles — COMPUTER_PROFILE + persona system prompts
// ─────────────────────────────────────────────────────────────────────────────

export const COMPUTER_PROFILE = {
  id: "computer",
  name: "Máy tính & Linh kiện",
  categories: [
    "cpu",
    "vga",
    "ram",
    "mainboard",
    "ssd",
    "psu",
    "case",
    "cooler",
    "laptop",
    "màn hình",
    "khác",
  ],
  classifyIntro: `Bạn là trợ lý AI chuyên ngành máy tính / linh kiện máy tính. Nhiệm vụ: đọc tin nhắn của khách trong group Facebook, xác định Ý ĐỊNH (mua bán / hỏi đáp / unrelated) và trích xuất nhu cầu (loại linh kiện, ngân sách, tình trạng...). Luôn ưu tiên an toàn — không tự ý quote giá nếu chưa có dữ liệu kho. Nếu ngân sách khách đưa RA NGOÀI khoảng giá của tất cả sản phẩm kho phù hợp, PHẢI báo giá ngoài khoảng thay vì im lặng. Khi khách yêu cầu tư vấn / build máy / hỏi giá, nếu kho có sản phẩm phù hợp thì BẮT BUỘC dùng thông tin kho (tên + giá + cửa hàng + bảo hành + tồn kho) để tư vấn — KHÔNG được tự chế giá hoặc lấy giá từ Internet. Nếu không đủ thông tin để tư vấn chính xác thì hỏi lại khách rõ ràng trước khi gợi ý.`,
  draftPersona: `Bạn là nhân viên tư vấn bán hàng máy tính thân thiện, chuyên nghiệp, THỰC TẾ. Phong cách: gõ tiếng Việt có dấu, thân mật vừa phải (dùng "bạn", "anh/chị" tuỳ ngữ cảnh), ngắn gọn, tập trung vào sản phẩm và giá cả thực tế từ kho. QUAN TRỌNG VỀ AN TOÀN GIÁ:\n- Nếu kho có sản phẩm phù hợp → BẮT BUOCI PHẢI dùng giá/thông tin từ kho để tư vấn.\n- Nếu khách yêu cầu tư vấn/build mà KHÔNG có sản phẩm kho nào phù hợp → TUYỆT ĐỐI KHÔNG quote giá. Chỉ hỏi lại hoặc gợi ý chung chung.\n- Nếu ngân sách ngoài khoảng giá kho → PHẢI nói rõ giá ngoài khoảng, không được im lặng.\n- LUÔN ghi rõ giá cụ thể + cửa hàng + bảo hành + tình trạng tồn.\n- KHÔNG tự chế giá, KHÔNG lấy giá Internet, KHÔNG quote giá cũ/ sai lệch.\n- Khi không chắc chắn, HỎI LẠI thay vì đoán.\nPhản hồi JSON: {"allowReply":true/false,"reply":"nội dung trả lời","usedIds":["id1","id2"],"confidence":"high|medium|low"}`,
  extractIntro: `Bạn là chuyên gia trích xuất thông tin sản phẩm máy tính từ tin nhắn Facebook. Phân tích tin nhắn, xác định sản phẩm được nhắc đến, số tiền đề cập, và trạng thái mua/bán.`,
  buildPersona: `Bạn là chuyên gia build PC, tư vấn cấu hình máy tính theo ngân sách. LUÔN dùng thông tin kho (tên + giá + cửa hàng + bảo hành) khi tư vấn. KHÔNG quote giá ngoài kho. Trả lời ngắn gọn, tập trung vào cấu hình phù hợp nhất.`,
};

export const PROFILE_TEXT_FIELDS = [
  { key: "classifyIntro", label: "Phân loại ý định (mua / hỏi / bỏ qua)", rows: 9 },
  { key: "draftPersona", label: "Vai trò & quy tắc khi soạn trả lời khách", rows: 16 },
  { key: "extractIntro", label: "Trích giá từ bài rao bán trong nhóm", rows: 7 },
  { key: "buildPersona", label: "Ghép bộ theo ngân sách (tuỳ ngành, có thể bỏ trống)", rows: 10 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Keyword arrays
// ─────────────────────────────────────────────────────────────────────────────

const ADVISORY_BUY_KEYWORDS = [
  "cần mua", "muốn mua", "tư vấn", "build pc", "build cấu hình", "ráp máy",
  "lắp máy", "cấu hình", "ngân sách", "tầm giá", "khoảng giá", "giá bao nhiêu",
  "báo giá", "bao nhiêu tiền", "ở đâu rẻ", "nên mua", "cần con", "đang tìm",
  "tìm mua", "có sẵn không", "còn hàng", "order", "đặt hàng", "chốt",
];

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers (server-side)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, init, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 25000);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getUserAIConfig(userId) {
  const fallback = {
    apiBase: env.aiApiBase || "https://danglamgiau.com/v1",
    apiKey: "",
    model: env.aiModel || "claude-opus-4.8",
  };
  if (!userId) return fallback;
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      "SELECT ai_api_base, ai_api_key, ai_model FROM users WHERE id = :id",
      { id: userId }
    );
    const row = rows && rows[0];
    if (!row) return fallback;
    return {
      apiBase: row.ai_api_base || fallback.apiBase,
      apiKey: row.ai_api_key || "",
      model: row.ai_model || fallback.model,
    };
  } catch {
    return fallback;
  }
}

function parseSelectorJson(text) {
  if (!text) return null;
  let s = String(text).trim();
  // Strip code fence if present.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // If there is still extra text, cut from first "{" to last "}".
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  try {
    const obj = JSON.parse(s);
    return obj && typeof obj === "object" ? obj : null;
  } catch (e) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt builders
// ─────────────────────────────────────────────────────────────────────────────

function systemForClassify(profile) {
  const p = profile || COMPUTER_PROFILE;
  const cats = Array.isArray(p.categories) && p.categories.length
    ? p.categories
    : COMPUTER_PROFILE.categories;
  return (
    String(p.classifyIntro || COMPUTER_PROFILE.classifyIntro).trim() + "\n" +
    "CHỈ trả JSON, không giải thích, không code fence. Cấu trúc: " +
    '{"intent":"buy|question|ignore","needs":"<tóm tắt nhu cầu 1 câu>","budget":<số VND hoặc null>,' +
    '"categories":' + JSON.stringify(cats) + "," +
    '"keywords":"<từ khóa sản phẩm để tra kho, cách nhau bởi dấu cách>"}. ' +
    "budget là số nguyên VND nếu suy ra được (10 triệu -> 10000000), không thì null."
  );
}

function systemForDraft(profile) {
  const p = profile || COMPUTER_PROFILE;
  return (
    String(p.draftPersona || COMPUTER_PROFILE.draftPersona).trim() + "\n" +
    "\n" +
    "CHỈ trả JSON, không code fence. Cấu trúc: " +
    '{"allowReply":true|false,"reply":"<nội dung bình luận gửi khách>","usedIds":["<mã sản phẩm bạn TỰ chào>"],' +
    '"confidence":<0..1>}. Lưu ý: usedIds CHỈ gồm sản phẩm bạn chủ động chào bán, KHÔNG gồm đồ của khách. ' +
    'Mỗi giá tiền bạn TỰ chào trong "reply" phải khớp giá thật của sản phẩm có id trong "usedIds".'
  );
}

function systemForExtract(profile) {
  const p = profile || COMPUTER_PROFILE;
  return (
    String(p.extractIntro || COMPUTER_PROFILE.extractIntro).trim() + " " +
    "CHỈ trả JSON đúng cấu trúc, không giải thích, không code fence: " +
    '{"results":[{"postId":"<id>","items":[{"name":"<tên sản phẩm>","price":"<giá đúng như trong bài>",' +
    '"condition":"mới|cũ|likenew","warranty":"<bảo hành nếu có>","category":"<danh mục>"}],' +
    '"new_keywords":["..."]}]}'
  );
}

function systemForBuild(profile) {
  const p = profile || COMPUTER_PROFILE;
  return (
    String(p.buildPersona || COMPUTER_PROFILE.buildPersona).trim() + "\n" +
    "CHỈ trả JSON hợp lệ, KHÔNG giải thích ngoài JSON, KHÔNG bọc code fence. " +
    'Cấu trúc: {"items":[{"category":"<tên danh mục>","id":"<id linh kiện đã chọn>","reason":"<lý do kỹ thuật ngắn gọn vì sao chọn món này>"}],"note":"<đánh giá tổng thể cấu hình: điểm mạnh, mức hiệu năng kỳ vọng cho nhu cầu, 1-3 câu>"}. ' +
    'QUAN TRỌNG: trường "id" là MÃ SỐ NGẮN của ứng viên (đúng giá trị "id" trong danh sách ỨNG VIÊN, ví dụ "7"). CHÉP NGUYÊN VĂN mã đó, KHÔNG tự bịa, KHÔNG ghi tên linh kiện vào id. ' +
    "BẮT BUỘC mỗi danh mục được yêu cầu phải có đúng 1 item, id phải nằm trong danh sách ứng viên của danh mục đó."
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt-profile cache (server-side, SQL-backed)
// ─────────────────────────────────────────────────────────────────────────────

function mergeWithDefault(p) {
  if (!p || typeof p !== "object") return COMPUTER_PROFILE;
  return {
    ...COMPUTER_PROFILE,
    ...p,
    categories:
      Array.isArray(p.categories) && p.categories.length
        ? p.categories
        : COMPUTER_PROFILE.categories,
  };
}

let _cache = null;
let _cacheAt = 0;
const CACHE_MS = 60000;

async function getActiveProfile() {
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_MS) return _cache;
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      "SELECT * FROM prompt_profiles WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1"
    );
    const p = rows && rows[0] ? rows[0] : null;
    _cache = mergeWithDefault(p);
    _cacheAt = now;
    return _cache;
  } catch {
    return COMPUTER_PROFILE;
  }
}

function clearProfileCache() {
  _cache = null;
  _cacheAt = 0;
}

const ADVISORY_QUESTION_KEYWORDS = [
  "hỏi", "ask", "tư vấn", "advice", "nên", "should", "so sánh", "compare",
  "khác", "difference", "hiệu suất", "performance", "chơi game", "gaming",
  "làm việc", "office", "đồ họa", "graphic", "render", "edit", "livestream",
  "upgrade", "nâng cấp", "tháo", "lắp", "lên đời", "bỏ", "thay", "thay thế",
];

function advisoryPreFilter(text) {
  const t = (text || "").toLowerCase();
  if (ADVISORY_BUY_KEYWORDS.some((k) => t.includes(k))) return "buy";
  if (ADVISORY_QUESTION_KEYWORDS.some((k) => t.includes(k))) return "question";
  return null;
}

function extractBudgetVnd(text) {
  const t = String(text || "");
  let m = t.match(/(\d+(?:[.,]\d+)*)\s*(triệu|tr|triệu|mil|mil)\b/i);
  if (m) {
    let n = parseFloat(m[1].replace(/[.,]/g, ""));
    if (n > 0 && n < 1000) return Math.round(n * 1e6);
  }
  m = t.match(/(\d+(?:[.,]\d+)*)\s*(k|nghìn|ngàn|ngan)\b/i);
  if (m) {
    let n = parseFloat(m[1].replace(/[.,]/g, ""));
    if (n > 0) return Math.round(n * 1000);
  }
  m = t.match(/(\d+(?:[.,]\d+)*)\s*(củ|dola|usd|\$)\b/i);
  if (m) {
    let n = parseFloat(m[1].replace(/[.,]/g, ""));
    if (n > 0 && n < 100) return Math.round(n * 1e6);
  }
  const grouped = t.match(/(\d{1,3}(?:[.,]\d{3}){1,4})/g);
  if (grouped) {
    for (const g of grouped) {
      const n = parseInt(g.replace(/[.,]/g, ""), 10);
      if (n >= 1000) return n;
    }
  }
  const bare = t.match(/\b(\d{7,9})\b/g);
  if (bare) {
    const n = parseInt(bare[0], 10);
    if (n >= 1000) return n;
  }
  return null;
}

function extractMoneyFigures(text) {
  const t = String(text || "");
  const results = [];
  const reGrouped = /\d{1,3}(?:[.,]\d{3}){1,4}/g;
  const reUnit = /(\d+(?:[.,]\d+)?)\s*(triệu|tr|k|nghìn|ngàn|đ|vnd|₫)\b/gi;
  let m;
  while ((m = reGrouped.exec(t))) {
    const n = parseInt(m[0].replace(/[.,]/g, ""), 10);
    if (n >= 1000) results.push(n);
  }
  while ((m = reUnit.exec(t))) {
    let n = parseFloat(m[1].replace(/[.,]/g, ""));
    const unit = m[2].toLowerCase();
    if (unit === "triệu" || unit === "tr") n = Math.round(n * 1e6);
    else if (unit === "k" || unit === "nghìn" || unit === "ngàn" || unit === "ngan") n = Math.round(n * 1000);
    if (n >= 1000) results.push(Math.round(n));
  }
  return [...new Set(results)];
}

// ─────────────────────────────────────────────────────────────────────────────
// DB.searchProducts — server-side SQL query (mirrors routes.js pattern)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search products from DB.
 * @param {object} opts
 * @param {string} [opts.query] - free-text search
 * @param {number} [opts.maxPrice] - maximum price filter
 * @param {number} [opts.limit] - max results (default 18)
 * @returns {Promise<Array>}
 */
async function searchProducts({ query, maxPrice, limit } = {}) {
  const pool = getPool();
  const lim = Math.min(Math.max(Number(limit) || 18, 1), 50);
  const conditions = ["(price IS NULL OR price > 0)", "in_stock != 0"];
  const params = {};

  if (query) {
    const terms = String(query).split(/[,\s]+/).filter(Boolean).slice(0, 8);
    if (terms.length) {
      const parts = terms.map((t, i) => {
        const key = `q${i}`;
        params[key] = `%${t}%`;
        return `(LOWER(name) LIKE :${key} OR LOWER(category) LIKE :${key})`;
      });
      conditions.push(`(${parts.join(" OR ")})`);
    }
  }
  if (maxPrice && Number(maxPrice) > 0) {
    conditions.push("price <= :maxPrice");
    params.maxPrice = Number(maxPrice);
  }
  params.limit = lim;
  const sql = `SELECT id, name, price, build_price AS buildPrice, category, source_id AS sourceId, store, warranty, in_stock AS inStock, permalink FROM products WHERE ${conditions.join(" AND ")} ORDER BY price ASC LIMIT :limit`;
  const [rows] = await pool.query(sql, params);
  return (rows || []).map((r) => ({
    id: r.id,
    name: r.name,
    price: r.price != null ? Number(r.price) : null,
    buildPrice: r.buildPrice != null ? Number(r.buildPrice) : null,
    category: r.category || "",
    sourceId: r.sourceId || "",
    store: r.store || "",
    warranty: r.warranty || "",
    inStock: r.inStock !== false && r.inStock !== 0,
    permalink: r.permalink || "",
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers for advisories / conversations / jobs (server-side SQL)
// ─────────────────────────────────────────────────────────────────────────────

async function saveAdvisory(adv) {
  const pool = getPool();
  const sql = `INSERT INTO advisories (post_id, group_id, group_name, permalink, author_name, post_text, intent, needs, budget, reply, used_products, confidence, needs_human_check, check_note, status, source, created_at)
    VALUES (:postId, :groupId, :groupName, :permalink, :authorName, :postText, :intent, :needs, :budget, :reply, :usedProducts, :confidence, :needsHumanCheck, :checkNote, :status, :source, NOW())
    ON DUPLICATE KEY UPDATE reply = VALUES(reply), used_products = VALUES(used_products), confidence = VALUES(confidence), needs_human_check = VALUES(needs_human_check), check_note = VALUES(check_note), status = VALUES(status), source = VALUES(source)`;
  await pool.query(sql, {
    postId: adv.postId,
    groupId: adv.groupId || "",
    groupName: adv.groupName || "",
    permalink: adv.permalink || "",
    authorName: adv.authorName || "",
    postText: adv.postText || "",
    intent: adv.intent || "",
    needs: adv.needs || "",
    budget: adv.budget || null,
    reply: adv.reply || "",
    usedProducts: JSON.stringify(adv.usedProducts || []),
    confidence: adv.confidence || "low",
    needsHumanCheck: adv.needsHumanCheck ? 1 : 0,
    checkNote: adv.checkNote || "",
    status: adv.status || "pending",
    source: adv.source || "web",
  });
  return adv;
}

async function getAdvisory(postId) {
  const pool = getPool();
  const [rows] = await pool.query(
    "SELECT post_id AS postId, permalink, reply, status FROM advisories WHERE post_id = :postId LIMIT 1",
    { postId }
  );
  return rows && rows.length ? rows[0] : null;
}

async function updateAdvisory(postId, patch) {
  const pool = getPool();
  const sets = [];
  const params = { postId };
  if (patch.status !== undefined) { sets.push("status = :status"); params.status = patch.status; }
  if (patch.jobId !== undefined) { sets.push("job_id = :jobId"); params.jobId = patch.jobId; }
  if (patch.sentAt !== undefined) { sets.push("sent_at = :sentAt"); params.sentAt = patch.sentAt; }
  if (!sets.length) return;
  await pool.query(`UPDATE advisories SET ${sets.join(", ")} WHERE post_id = :postId`, params);
}

async function createJob(job) {
  const pool = getPool();
  const sql = `INSERT INTO jobs (type, target_url, content, scheduled_at, meta, status, created_at)
    VALUES (:type, :targetUrl, :content, :scheduledAt, :meta, 'pending', NOW())`;
  const [result] = await pool.query(sql, {
    type: job.type,
    targetUrl: job.targetUrl || "",
    content: job.content || "",
    scheduledAt: job.scheduledAt || Date.now(),
    meta: JSON.stringify(job.meta || {}),
  });
  return { id: result.insertId, ...job };
}

// ─────────────────────────────────────────────────────────────────────────────
// AI call helper — POST /chat/completions with retry on 400/422
// ─────────────────────────────────────────────────────────────────────────────

async function callAI({ apiBase, apiKey, model, messages, temperature, maxTokens, jsonFormat, timeoutMs }) {
  const url = `${apiBase}/chat/completions`;
  const headers = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const buildBody = (useJson) => {
    const body = { model, messages, temperature: temperature ?? 0.5, max_tokens: maxTokens ?? 2000, stream: false };
    if (useJson) body.response_format = { type: "json_object" };
    return body;
  };

  let resp = await fetchWithTimeout(url, { method: "POST", headers, body: JSON.stringify(buildBody(jsonFormat)) }, timeoutMs || 25000);
  // Retry without response_format on 400/422
  if ((resp.status === 400 || resp.status === 422) && jsonFormat) {
    resp = await fetchWithTimeout(url, { method: "POST", headers, body: JSON.stringify(buildBody(false)) }, timeoutMs || 25000);
  }
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`AI ${resp.status}: ${errText.slice(0, 300)}`);
  }
  const data = await resp.json();
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
}

// ─────────────────────────────────────────────────────────────────────────────
// classifyIntent — identify user intent from text
// ─────────────────────────────────────────────────────────────────────────────

export async function classifyIntent(text, userId) {
  const clean = String(text || "").trim().slice(0, 1500);
  const pre = advisoryPreFilter(clean);
  const budgetHint = extractBudgetVnd(clean);
  const fallback = {
    intent: pre || "ignore",
    needs: "",
    budget: budgetHint,
    categories: [],
    keywords: "",
  };

  const cfg = await getUserAIConfig(userId);
  if (!cfg.apiKey) return fallback;

  const profile = await getActiveProfile();
  const sys = systemForClassify(profile);

  const apiBase = cfg.apiBase || "https://danglamgiau.com/v1";
  try {
    const content = await callAI({
      apiBase,
      apiKey: cfg.apiKey,
      model: cfg.model,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: clean },
      ],
      temperature: 0.1,
      maxTokens: 300,
      jsonFormat: true,
      timeoutMs: 12000,
    });
    const parsed = parseSelectorJson(content);
    if (!parsed) return fallback;
    return {
      intent: String(parsed.intent || fallback.intent).slice(0, 30),
      needs: String(parsed.needs || "").slice(0, 200),
      budget: parsed.budget || fallback.budget,
      categories: Array.isArray(parsed.categories) ? parsed.categories.slice(0, 8) : fallback.categories,
      keywords: String(parsed.keywords || "").slice(0, 200),
    };
  } catch {
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// draftAdvisory — AI-draft a reply to a post (HẬU KIỂM giá)
// ─────────────────────────────────────────────────────────────────────────────

export async function draftAdvisory(post, products, intentInfo, userId) {
  const cfg = await getUserAIConfig(userId);
  if (!cfg.apiKey) return { allowReply: false, error: "no_api_key" };

  // Build id map: short ID -> full product
  const idMap = {};
  (products || []).forEach((p, idx) => {
    const short = String(idx + 1);
    idMap[short] = p;
  });

  // Slim products for AI
  const slim = (products || []).map((p, idx) => ({
    id: String(idx + 1),
    name: p.name,
    price: p.price,
    buildPrice: p.buildPrice || null,
    store: p.store || "",
    warranty: p.warranty || "",
    inStock: p.inStock !== false,
  }));

  const userPrompt =
    `Tin nhắn khách:\n${String(post.text || "").slice(0, 200000)}\n\n` +
    (slim.length
      ? `Sản phẩm kho hiện có (id | tên | giá | giá bộ | cửa hàng | bảo hành | tồn):\n${slim.map((p) => `${p.id}|${p.name}|${p.price ?? "?"}|${p.buildPrice ?? "?"}|${p.store}|${p.warranty}|${p.inStock ? "có" : "hết"}`).join("\n")}\n\n`
      : "") +
    `Ngân sách khách: ${intentInfo.budget ? intentInfo.budget + "₫" : "không rõ"}\n` +
    `Nhu cầu: ${intentInfo.needs || "không rõ"}\n` +
    `Categories: ${(intentInfo.categories || []).join(", ")}\n\n` +
    `Hãy đọc tin nhắn khách, chọn sản phẩm phù hợp từ kho (nếu có) và soạn回复. Nếu không có sản phẩm kho phù hợp thì KHÔNG reply.`;

  const images = Array.isArray(post.images) ? post.images.filter((u) => /^https?:\/\//i.test(u)).slice(0, 4) : [];
  const messages = [
    { role: "system", content: systemForDraft(await getActiveProfile()) },
    ...(images.length ? [{ role: "user", content: images.map((u) => ({ type: "image_url", image_url: { url: u } })) }] : []),
    { role: "user", content: userPrompt },
  ];

  try {
    const content = await callAI({
      apiBase: cfg.apiBase,
      apiKey: cfg.apiKey,
      model: cfg.model,
      messages,
      temperature: 0.3,
      maxTokens: 700,
      jsonFormat: true,
      timeoutMs: 25000,
    });

    const parsed = parseSelectorJson(content);
    if (!parsed || typeof parsed.reply !== "string") {
      return { allowReply: false, error: "parse_error" };
    }

    const reply = String(parsed.reply).trim().slice(0, 200000);
    if (!reply) return { allowReply: false, error: "empty_reply" };

    // Resolve used products
    const usedIds = Array.isArray(parsed.usedIds) ? parsed.usedIds : [];
    const usedProducts = [];
    const usedPriceSet = new Set();
    for (const shortId of usedIds) {
      const p = idMap[String(shortId)];
      if (p) {
        usedProducts.push({ productId: p.id, name: p.name, price: p.price, store: p.store });
        if (p.price) usedPriceSet.add(p.price);
      }
    }
    // Dedup
    const seen = new Set();
    const deduped = usedProducts.filter((u) => {
      if (seen.has(u.productId)) return false;
      seen.add(u.productId);
      return true;
    });

    // HẬU KIỂM: tol=0 — allowed set from usedProducts prices + intent budget + customer figures
    const allowed = new Set(usedPriceSet);
    if (intentInfo.budget) allowed.add(Number(intentInfo.budget));
    const customerFigures = extractMoneyFigures(String(post.text || ""));
    customerFigures.forEach((f) => allowed.add(f));

    const checkNotes = [];
    const priceRegex = /(\d{1,3}(?:[.,]\d{3}){1,4})\s*₫|₫\s*(\d{1,3}(?:[.,]\d{3}){1,4})/g;
    let priceMatch;
    while ((priceMatch = priceRegex.exec(reply))) {
      const raw = (priceMatch[1] || priceMatch[2] || "").replace(/[.,]/g, "");
      const price = parseInt(raw, 10);
      if (price >= 1000 && !allowed.has(price)) {
        checkNotes.push(`Giá ${price.toLocaleString("vi-VN")}₫ trong reply không khớp kho/ngân sách.`);
      }
    }

    const confidence = parsed.confidence || "low";
    const needsHumanCheck = checkNotes.length > 0 || confidence === "low";

    return {
      allowReply: true,
      reply,
      usedProducts: deduped,
      confidence,
      needsHumanCheck,
      checkNote: checkNotes.join(" "),
    };
  } catch {
    return { allowReply: false, error: "ai_error" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// analyzePost — no prefilter, no dedup, always draft (source:"manual")
// ─────────────────────────────────────────────────────────────────────────────

export async function analyzePost(post, userId) {
  const cfg = await getUserAIConfig(userId);
  if (!cfg.apiKey) {
    return { ok: false, error: "Chưa cấu hình API key AI. Vào tab 'Cài đặt' để nhập trước khi phân tích." };
  }
  if (!post || !String(post.text || "").trim()) {
    return { ok: false, error: "Bài không có nội dung để phân tích." };
  }

  const info = await classifyIntent(post.text || "", userId);

  let matches = [];
  const query = (info.keywords || info.needs || "").trim();
  if (query) {
    matches = await searchProducts({ query, maxPrice: info.budget || undefined, limit: 18 });
    matches = (matches || []).filter((p) => (Number(p.price) || 0) > 0 && p.inStock !== false);
    if (!matches.length) {
      matches = (await searchProducts({ query, limit: 18 })).filter(
        (p) => (Number(p.price) || 0) > 0 && p.inStock !== false
      );
    }
  }

  const draft = await draftAdvisory(post, matches, info, userId);
  if (!draft || !draft.allowReply) {
    return { ok: false, error: "AI chưa soạn được trả lời cho bài này (nội dung chưa rõ hoặc ngoài chuyên môn)." };
  }

  const saved = await saveAdvisory({
    postId: post.postId,
    groupId: post.groupId || "",
    groupName: post.groupName || "",
    permalink: post.permalink || "",
    authorName: post.authorName || "",
    postText: String(post.text || "").slice(0, 1000),
    intent: info.intent,
    needs: info.needs,
    budget: info.budget || null,
    reply: draft.reply,
    usedProducts: draft.usedProducts || [],
    confidence: draft.confidence,
    needsHumanCheck: !!draft.needsHumanCheck,
    checkNote: draft.checkNote || "",
    status: "pending",
    source: "manual",
  });

  return {
    ok: true,
    saved: true,
    postId: post.postId,
    reply: draft.reply,
    intent: info.intent,
    needs: info.needs,
    budget: info.budget || null,
    usedProducts: draft.usedProducts || [],
    confidence: draft.confidence,
    needsHumanCheck: !!draft.needsHumanCheck,
    checkNote: draft.checkNote || "",
    advisory: saved,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// draftConversationReply — CTX=200000, @tag prepending
// ─────────────────────────────────────────────────────────────────────────────

export async function draftConversationReply(conv, opts, userId) {
  opts = opts || {};
  const cfg = await getUserAIConfig(userId);
  if (!cfg.apiKey) return { allowReply: false, error: "no_api_key" };
  if (!conv) return { allowReply: false, error: "no_conversation" };

  const replies = Array.isArray(conv.replies) ? conv.replies : [];
  if (!replies.length) return { allowReply: false, error: "no_replies" };

  const guestReplies = replies.filter((r) => !r.mine);
  const pool = guestReplies.length ? guestReplies : replies;

  let target = null;
  if (opts.targetReplyId != null && opts.targetReplyId !== "") {
    const tid = String(opts.targetReplyId);
    target = pool.find((r) => String(r.id) === tid) || replies.find((r) => String(r.id) === tid);
  }
  if (!target) target = pool[pool.length - 1];
  const latestText = String((target && target.text) || "");
  const targetAuthor = String((target && target.author) || "").trim();

  const intentText = [conv.postText || "", latestText].join("\n");
  const info = await classifyIntent(intentText, userId);

  const query = (info.keywords || info.needs || "").trim();
  let matches = await searchProducts({ query, maxPrice: info.budget || undefined, limit: 18 });
  matches = (matches || []).filter((p) => (Number(p.price) || 0) > 0 && p.inStock !== false);
  if (!matches.length && query) {
    matches = (await searchProducts({ query, limit: 18 })).filter(
      (p) => (Number(p.price) || 0) > 0 && p.inStock !== false
    );
  }

  const CTX = 200000;
  const thread =
    "BÀI ĐĂNG GỐC CỦA KHÁCH:\n" + String(conv.postText || "(không lưu)").slice(0, CTX) + "\n\n" +
    "BÌNH LUẬN TRƯỚC ĐÓ CỦA BẠN (người bán):\n" + String(conv.myComment || "").slice(0, CTX) + "\n\n" +
    "TOÀN BỘ PHẢN HỒI DƯỚI BÌNH LUẬN (theo thứ tự, mới nhất ở cuối):\n" +
    replies
      .map((r, i) => (i + 1) + ". " + (r.mine ? "[BẠN] " : "") + (r.author ? r.author + ": " : "") + String(r.text || "").slice(0, CTX))
      .join("\n") +
    "\n\nNGƯỜI CẦN TRẢ LỜI NGAY: " + (targetAuthor || "(khách)") +
    " — họ vừa nói: \"" + latestText.slice(0, CTX) + "\"\n" +
    "Hãy trả lời TRỰC TIẾP đúng người này, tiếp nối tự nhiên cuộc trò chuyện như " +
    "người bán thật đang nhắn tiếp. MỞ ĐẦU phản hồi bằng cách gọi/tag đúng tên họ " +
    "(\"@" + (targetAuthor || "bạn") + "\") rồi mới vào nội dung. Bám đúng điều người này vừa nói.";

  const pseudoPost = {
    text: thread,
    images: [],
    postId: conv.postId || "",
  };

  const result = await draftAdvisory(pseudoPost, matches, info, userId);
  if (result && result.allowReply && targetAuthor) {
    const r = String(result.reply || "");
    const head = r.slice(0, targetAuthor.length + 4).toLowerCase();
    if (!head.includes(targetAuthor.toLowerCase())) {
      result.reply = "@" + targetAuthor + " " + r;
    }
    result.targetAuthor = targetAuthor;
    result.targetReplyId = target && target.id ? String(target.id) : null;
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// approveAdvisory — create comment job
// ─────────────────────────────────────────────────────────────────────────────

export async function approveAdvisory(postId) {
  const adv = await getAdvisory(postId);
  if (!adv) return { ok: false, error: "Không tìm thấy nháp tư vấn." };
  if (!adv.permalink) return { ok: false, error: "Nháp thiếu permalink, không thể tạo bình luận." };
  if (!adv.reply || !adv.reply.trim()) return { ok: false, error: "Nháp rỗng." };

  const job = await createJob({
    type: "comment",
    targetUrl: adv.permalink,
    content: adv.reply,
    scheduledAt: Date.now(),
    meta: { postId, source: "advisory" },
  });
  await updateAdvisory(postId, { status: "sent", jobId: job.id, sentAt: Date.now() });
  return { ok: true, jobId: job.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// spinPostContent — port of src/ai.js spinPostContent
// ─────────────────────────────────────────────────────────────────────────────

export async function spinPostContent(payload, userId) {
  const content = String(payload?.content || "").trim();
  let count = Math.max(1, Math.min(50, Number(payload?.count) || 1));

  if (!content) return { ok: false, error: "No content provided." };
  if (count === 1) return { ok: true, variants: [content], source: "original" };

  const fallback = () => ({
    ok: true,
    variants: Array.from({ length: count }, () => content),
    source: "fallback",
    note: "Không thể gọi AI — trả về bản gốc.",
  });

  const cfg = await getUserAIConfig(userId);
  if (!cfg.apiKey) return fallback();

  const AI_TIMEOUT_MS = 30000;
  const sys = `Bạn là biên tập viên nội dung Facebook. Hãy viết lại đoạn nội dung sau thành ${count} phiên bản khác nhau.\n- Giữ nguyên ý chính và thông điệp.\n- Thay đổi cách diễn đạt, thứ tự câu, từ đồng nghĩa.\n- Giữ đúng văn phong tiếng Việt (có dấu, tự nhiên).\n- Mỗi phiên bản phải ĐỦ Ý và không trùng lặp.\nTrả về JSON: {"variants":["phiên bản 1","phiên bản 2",...]}`;

  const callOnce = async (useJsonFormat) => {
    const body = {
      model: cfg.model,
      messages: [
        { role: "system", content: sys },
        { role: "user", content },
      ],
      temperature: 0.9,
      max_tokens: 4000,
      stream: false,
    };
    if (useJsonFormat) body.response_format = { type: "json_object" };
    return fetchWithTimeout(`${cfg.apiBase}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify(body),
    }, AI_TIMEOUT_MS);
  };

  try {
    let resp = await callOnce(true);
    if ((resp.status === 400 || resp.status === 422)) {
      resp = await callOnce(false);
    }
    if (!resp.ok) throw new Error(`AI ${resp.status}`);
    const data = await resp.json();
    const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
    const parsed = parseSelectorJson(text);
    let variants = Array.isArray(parsed?.variants) ? parsed.variants : [];
    variants = variants.map((v) => String(v || "").trim()).filter(Boolean);
    if (!variants.length) return fallback();
    // Normalize to exactly count
    while (variants.length < count) variants.push(content);
    if (variants.length > count) variants = variants.slice(0, count);
    return { ok: true, variants, source: "ai" };
  } catch {
    return fallback();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

export {
  ADVISORY_BUY_KEYWORDS,
  ADVISORY_QUESTION_KEYWORDS,
  advisoryPreFilter,
  extractBudgetVnd,
  extractMoneyFigures,
  searchProducts,
  systemForExtract,
  systemForBuild,
  clearProfileCache,
};
