import { ensureDatabase, getPool, env } from "./config.js";
import { PROMPT_PROFILE_SEEDS } from "./seed-prompt-profile.js";

const TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS user_share_prefs (
    user_id INT PRIMARY KEY,
    share_crawled_default BOOL DEFAULT 1,
    share_commented_default BOOL DEFAULT 1,
    share_group_prices_default BOOL DEFAULT 1,
    CONSTRAINT fk_usp_user FOREIGN KEY (user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS posts (
    post_id VARCHAR(64) PRIMARY KEY,
    group_id VARCHAR(64),
    group_name VARCHAR(255),
    author_name VARCHAR(255),
    author_profile VARCHAR(512),
    text MEDIUMTEXT,
    images JSON,
    timestamp BIGINT,
    permalink VARCHAR(1024),
    crawled_by_user_id INT NULL,
    crawled_at DATETIME,
    updated_at DATETIME,
    share_crawled BOOL DEFAULT 1,
    parsed_at DATETIME NULL,
    CONSTRAINT fk_posts_user FOREIGN KEY (crawled_by_user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS \`groups\` (
    group_id VARCHAR(64) PRIMARY KEY,
    group_name VARCHAR(255),
    crawled_by_user_id INT NULL,
    created_at DATETIME,
    updated_at DATETIME
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS comments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    post_id VARCHAR(64),
    user_id INT NULL,
    content MEDIUMTEXT,
    commented_at DATETIME,
    share_commented BOOL DEFAULT 1,
    CONSTRAINT fk_comments_post FOREIGN KEY (post_id) REFERENCES posts(post_id),
    CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS conversations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    post_id VARCHAR(64),
    user_id INT NULL,
    comment_permalink VARCHAR(1024),
    comment_id VARCHAR(64),
    replies JSON,
    status VARCHAR(32),
    post_url TEXT,
    group_id VARCHAR(64),
    group_name VARCHAR(255),
    my_comment MEDIUMTEXT,
    my_comment_url TEXT,
    post_text MEDIUMTEXT,
    draft JSON,
    job_id VARCHAR(64),
    last_watched_at BIGINT,
    created_at DATETIME,
    updated_at DATETIME
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS advisories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    post_id VARCHAR(64),
    user_id INT NULL,
    content MEDIUMTEXT,
    status VARCHAR(32),
    used_products JSON,
    needs_human_check BOOL DEFAULT 0,
    check_note VARCHAR(512),
    created_at DATETIME,
    updated_at DATETIME,
    UNIQUE KEY uq_advisory_post_user (post_id, user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS products (
    product_id VARCHAR(128) PRIMARY KEY,
    source VARCHAR(64),
    name VARCHAR(512),
    price BIGINT,
    url VARCHAR(1024),
    category VARCHAR(128),
    raw JSON,
    updated_at DATETIME
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS group_prices (
    id INT PRIMARY KEY AUTO_INCREMENT,
    post_id VARCHAR(64),
    name VARCHAR(512),
    price BIGINT,
    \`condition\` VARCHAR(64),
    warranty VARCHAR(128),
    category VARCHAR(128),
    seller_name VARCHAR(255),
    seller_profile VARCHAR(512),
    group_id VARCHAR(64),
    posted_at BIGINT,
    parsed_at DATETIME,
    parser VARCHAR(64),
    confidence FLOAT,
    crawled_by_user_id INT NULL,
    share_group_prices BOOL DEFAULT 1,
    UNIQUE KEY uq_gp_line (post_id, name(255), price, seller_name(255)),
    CONSTRAINT fk_gp_post FOREIGN KEY (post_id) REFERENCES posts(post_id),
    CONSTRAINT fk_gp_user FOREIGN KEY (crawled_by_user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS sources (
    id VARCHAR(64) PRIMARY KEY,
    config JSON,
    updated_at DATETIME
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // HỒ SƠ NGÀNH (prompt profile): gom phần ĐẶC THÙ NGÀNH của các system prompt
  // AI (phân loại / soạn tư vấn / trích giá / build) thành bản ghi sửa được trong
  // dashboard, lưu ở BACKEND nên CHIA SẺ được. Mô phỏng theo bảng `sources`, thêm
  // `name` (tên hiển thị) và `is_active` (đúng 1 hồ sơ kích hoạt mỗi user/global).
  `CREATE TABLE IF NOT EXISTS prompt_profiles (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255),
    config JSON,
    is_active BOOL DEFAULT 0,
    updated_at DATETIME
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS learned_keywords (
    id INT PRIMARY KEY AUTO_INCREMENT,
    keyword VARCHAR(128),
    type VARCHAR(32),
    added_by VARCHAR(64),
    enabled BOOL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_keyword_type (keyword, type)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS remote_commands (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       INT          NOT NULL,
    type          VARCHAR(64)  NOT NULL,
    payload       JSON         NOT NULL,
    status        ENUM('pending','running','completed','failed','expired') NOT NULL DEFAULT 'pending',
    result        JSON         DEFAULT NULL,
    error         TEXT         DEFAULT NULL,
    created_by    INT          DEFAULT NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at    DATETIME     DEFAULT NULL,
    completed_at  DATETIME     DEFAULT NULL,
    INDEX idx_pending_user (status, user_id, created_at),
    CONSTRAINT fk_rc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

const SELL_SIGNALS = [
  "bán", "pass", "thanh lý", "ib giá", "fix nhẹ",
  "fix", "cần bán", "để lại", "ra đi",
];

/* ----------------------- LEAD-FILTER BASE KEYWORDS ----------------------- *
 * Bộ từ khoá nền cho "Lọc thông minh" (src/dashboard/leadfilter.js). Trước
 * đây chúng hardcode phía extension + lưu từ tùy chỉnh ở chrome.storage. Nay
 * gộp về DB để dùng chung toàn hệ thống và quản lý ở tab "Từ khóa học".
 *   - buy     : KHÁCH CẦN MUA (ý định mua).
 *   - support : CẦN HỖ TRỢ (hỏi kỹ thuật / sự cố / hỏng hóc).
 *   - seller  : NGƯỜI BÁN — gộp vào type 'sell' (cùng là tín hiệu rao bán).
 * PHẢI mirror các mảng *_BASE trong src/dashboard/leadfilter.js (đó là bản
 * fallback offline khi chưa đăng nhập / chưa tải được DB).
 * ------------------------------------------------------------------------- */
const BUY_BASE = [
  "cần mua", "muốn mua", "tìm mua", "đang tìm", "cần tư vấn", "tư vấn giúp",
  "tư vấn cho", "build pc", "build cấu hình", "build dàn", "ráp máy", "lắp máy",
  "lên cấu hình", "lên đời", "ngân sách", "tầm giá", "khoảng giá", "tầm tiền",
  "giá bao nhiêu", "bao nhiêu tiền", "báo giá", "ở đâu rẻ", "nên mua", "cần con",
  "có sẵn không", "còn hàng không", "shop nào", "chỗ nào bán", "mua ở đâu",
  "order", "đặt hàng", "muốn lấy", "cần lấy",
];

const SUPPORT_BASE = [
  "có nên", "loại nào", "con nào", "hãng nào", "so sánh", "khác gì",
  "dùng được không", "chạy được không", "hợp không", "tương thích",
  "có tốt không", "review", "đánh giá", "thắc mắc", "cho hỏi", "xin hỏi",
  "ai biết", "giúp với", "giúp em", "giúp mình", "cứu với",
  "bị lỗi", "bị hư", "bị hỏng", "lỗi gì", "hư gì", "hỏng gì", "bị sao",
  "bị làm sao", "không lên", "không vào", "không nhận", "không khởi động",
  "màn hình đen", "đèn đỏ", "tự tắt", "tự khởi động lại", "kêu bíp", "giật lag",
  "sửa", "khắc phục", "cách fix", "bị gì", "bị treo", "đơ máy",
];

const SELLER_BASE = [
  "cần pass", "pass lại", "pass nhanh", "thanh lí",
  "nhượng lại", "bán nhanh", "bán gấp", "lên đời nên bán",
  "giá bán", "giá fix", "fixnhẹ", "bớt lộc", "có fix", "đã qua sử dụng",
  "hàng còn bảo hành", "còn bảo hành", "còn bh", "fullbox", "full box", "newseal",
  "new seal", "like new", "likenew", "freeship", "free ship", "ship cod", "ship toàn quốc",
  "ib zalo", "inbox zalo", "liên hệ zalo", "call zalo", "alo zalo", "sđt", "số đt",
  "giao lưu", "bao test", "bao ship", "bảo hành shop", "shop mình",
  "bên mình có", "cửa hàng mình", "có hoá đơn", "xuất hoá đơn", "nhận order sỉ",
];

// Bản đồ seed: type -> danh sách từ khoá (đã loại trùng trong từng type).
// Là NGUỒN DUY NHẤT cho cả migration lẫn test (web/test/schema.test.js).
export const KEYWORD_SEEDS = {
  sell: [...new Set([...SELL_SIGNALS, ...SELLER_BASE])],
  buy: [...new Set(BUY_BASE)],
  support: [...new Set(SUPPORT_BASE)],
};

/* ------------------------- SEED PRICE SOURCES ---------------------------- *
 * 4 nguồn giá bán lẻ mẫu (HACOM + 3 store nền tảng Hura). Trước đây chỉ được
 * seed phía extension (qua POST /api/sources sau khi đăng nhập), nên DB mới
 * tinh có bảng `sources` rỗng. Seed luôn ở migration để DB sạch đã có sẵn 4
 * nguồn. Dùng INSERT IGNORE -> tôn trọng chỉnh sửa/xoá của người dùng về sau.
 * Cấu hình PHẢI khớp SEED_PRICE_SOURCES trong src/prices.js.
 * -------------------------------------------------------------------------- */
const HURA_HEADERS = {
  Authorization: "Basic ssaaAS76DAs6faFFghs1",
  "X-Requested-With": "XMLHttpRequest",
};
const HURA_MAPPING = {
  productId: "id",
  name: "productName",
  price: "price",
  retailOffer: "specialOffer",
  list: "marketPrice",
  brand: "brand",
  url: "productUrl",
  image: "productImage.small",
  stock: "quantity",
  sku: "productSKU",
  warranty: "warranty",
  condition: "condition",
};
function huraCatUrl(host, cat) {
  return (
    host +
    "/ajax/get_json.php?action=product&action_type=product-list&category=" +
    cat
  );
}

const SEED_PRICE_SOURCES = [
  {
    id: "hacom",
    name: "HACOM",
    parse: "html-rsc",
    urls: [
      "https://hacom.vn/cpu-bo-vi-xu-ly",
      "https://hacom.vn/mainboard-bo-mach-chu",
      "https://hacom.vn/ram-bo-nho-trong",
      "https://hacom.vn/vga-card-man-hinh",
      "https://hacom.vn/o-cung-ssd",
      "https://hacom.vn/o-cung-hdd-desktop",
      "https://hacom.vn/nguon-may-tinh",
      "https://hacom.vn/vo-case",
    ],
    url: "https://hacom.vn/cpu-bo-vi-xu-ly",
    itemsPath: "list",
    pageParam: "page",
    pageStart: 1,
    pageSize: 36,
    maxPages: 50,
    mapping: {
      productId: "itemCode",
      name: "itemName",
      price: "unitSellingPrice",
      buildPrice: "giaBuildPcKoVga",
      list: "marketPrice",
      brand: "brandName",
      url: "url",
      image: "primaryImage",
      stock: "onhandQuantity",
      stockFlag: "hasStock",
      retailFlag: "coBanLe",
      sku: "itemCode",
      warranty: "warrantyDescrition",
    },
    enabled: true,
  },
  {
    id: "nguyencong",
    name: "Nguyễn Công PC",
    headers: HURA_HEADERS,
    url: huraCatUrl("https://nguyencongpc.vn", 3431),
    itemsPath: "list",
    totalPath: "total",
    pageParam: "page",
    pageSizeParam: "show",
    pageStart: 1,
    pageSize: 50,
    maxPages: 50,
    mapping: HURA_MAPPING,
    enabled: true,
  },
  {
    id: "hoangha",
    name: "Hoàng Hà PC",
    headers: HURA_HEADERS,
    urls: [
      huraCatUrl("https://hoanghapc.vn", 2), // CPU
      huraCatUrl("https://hoanghapc.vn", 3), // Mainboard
      huraCatUrl("https://hoanghapc.vn", 4), // RAM
      huraCatUrl("https://hoanghapc.vn", 6), // VGA
      huraCatUrl("https://hoanghapc.vn", 16), // SSD
      huraCatUrl("https://hoanghapc.vn", 15), // HDD
      huraCatUrl("https://hoanghapc.vn", 7), // Nguồn
      huraCatUrl("https://hoanghapc.vn", 8), // Case
    ],
    url: huraCatUrl("https://hoanghapc.vn", 2),
    itemsPath: "list",
    totalPath: "total",
    pageParam: "page",
    pageSizeParam: "show",
    pageStart: 1,
    pageSize: 50,
    maxPages: 50,
    mapping: HURA_MAPPING,
    enabled: true,
  },
  {
    id: "anphat",
    name: "An Phát PC",
    headers: HURA_HEADERS,
    urls: [
      huraCatUrl("https://anphatpc.com.vn", 1025), // CPU
      huraCatUrl("https://anphatpc.com.vn", 1024), // Mainboard
      huraCatUrl("https://anphatpc.com.vn", 1234), // RAM
      huraCatUrl("https://anphatpc.com.vn", 1155), // VGA
      huraCatUrl("https://anphatpc.com.vn", 1030), // SSD
      huraCatUrl("https://anphatpc.com.vn", 1047), // HDD
      huraCatUrl("https://anphatpc.com.vn", 1051), // Nguồn
      huraCatUrl("https://anphatpc.com.vn", 1050), // Case
    ],
    url: huraCatUrl("https://anphatpc.com.vn", 1025),
    itemsPath: "list",
    totalPath: "total",
    pageParam: "page",
    pageSizeParam: "show",
    pageStart: 1,
    pageSize: 50,
    maxPages: 50,
    mapping: HURA_MAPPING,
    enabled: true,
  },
];

// Thêm các cột còn thiếu vào một bảng đã tồn tại (idempotent). Đọc danh sách
// cột thực tế từ INFORMATION_SCHEMA rồi chỉ ALTER ADD những cột chưa có. Tên
// cột/DDL ở đây do code định nghĩa (không phải input người dùng) nên nối chuỗi
// an toàn. Bỏ qua lỗi "duplicate column" phòng khi chạy song song.
async function ensureColumns(pool, table, columns) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  const have = new Set(rows.map((r) => String(r.name).toLowerCase()));
  for (const col of columns) {
    if (have.has(col.name.toLowerCase())) continue;
    try {
      await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${col.ddl}`);
    } catch (e) {
      // ER_DUP_FIELDNAME (cột đã tồn tại do chạy song song) -> bỏ qua an toàn.
      if (e && e.code !== "ER_DUP_FIELDNAME") throw e;
    }
  }
}

export async function runMigrations() {
  await ensureDatabase();
  const pool = getPool();
  for (const sql of TABLES) {
    await pool.query(sql);
  }
  // Phê duyệt tài khoản: thêm cột role + status cho bảng users (idempotent).
  // - role: 'user' | 'admin' (mặc định 'user').
  // - status: 'pending' | 'approved' | 'locked' (mặc định 'pending' cho tài
  //   khoản đăng ký mới -> không login được tới khi admin duyệt).
  await ensureColumns(pool, "users", [
    { name: "role", ddl: "role VARCHAR(20) NOT NULL DEFAULT 'user'" },
    { name: "status", ddl: "status VARCHAR(20) NOT NULL DEFAULT 'pending'" },
  ]);
  // Backfill: các tài khoản ĐÃ tồn tại từ trước (DB cũ chưa có cột status) khi
  // ALTER ADD sẽ nhận DEFAULT 'pending' -> sẽ bị khóa oan. Nâng tất cả tài khoản
  // cũ lên 'approved' đúng MỘT lần (chỉ ảnh hưởng hàng đang 'pending' hiện có,
  // và chạy TRƯỚC khi có route đăng ký mới nên an toàn cho dữ liệu hiện hữu).
  await pool.query("UPDATE users SET status = 'approved' WHERE status = 'pending'");
  // Bootstrap admin đầu tiên qua ADMIN_EMAIL trong .env: tự lên role 'admin' +
  // status 'approved'. So sánh không phân biệt hoa thường. Idempotent.
  if (env.adminEmail) {
    await pool.query(
      "UPDATE users SET role = 'admin', status = 'approved' WHERE LOWER(email) = ?",
      [env.adminEmail]
    );
  }
  // Backfill cột còn THIẾU trên các bảng đã tồn tại từ bản schema cũ. Lý do:
  // `CREATE TABLE IF NOT EXISTS` KHÔNG thêm cột mới vào bảng đã có sẵn, nên DB
  // tạo từ trước bị "schema drift" — ví dụ bảng conversations thiếu post_url,
  // group_id, my_comment... khiến INSERT trong routes.js văng
  // "Unknown column 'post_url'". Ở đây so cột thực tế (INFORMATION_SCHEMA) với
  // cột MONG MUỐN rồi ALTER ADD những cột vắng. Idempotent: chạy lại không hại.
  await ensureColumns(pool, "conversations", [
    { name: "comment_id", ddl: "comment_id VARCHAR(64)" },
    { name: "post_url", ddl: "post_url TEXT" },
    { name: "group_id", ddl: "group_id VARCHAR(64)" },
    { name: "group_name", ddl: "group_name VARCHAR(255)" },
    { name: "my_comment", ddl: "my_comment MEDIUMTEXT" },
    { name: "my_comment_url", ddl: "my_comment_url TEXT" },
    { name: "post_text", ddl: "post_text MEDIUMTEXT" },
    { name: "draft", ddl: "draft JSON" },
    { name: "job_id", ddl: "job_id VARCHAR(64)" },
    { name: "last_watched_at", ddl: "last_watched_at BIGINT" },
  ]);
  // Nới rộng cột my_comment cũ (TEXT ~21k ký tự) -> MEDIUMTEXT để chứa bình luận
  // rất dài (tới ~200k ký tự). ensureColumns ở trên CHỈ ADD cột vắng, KHÔNG sửa
  // kiểu cột đã tồn tại; nên bảng tạo từ bản cũ vẫn là TEXT -> MODIFY tại đây.
  // Idempotent: MODIFY về đúng kiểu hiện có không gây hại.
  try {
    await pool.query("ALTER TABLE `conversations` MODIFY COLUMN my_comment MEDIUMTEXT");
  } catch (e) {
    // Bảng/cột chưa có (DB mới) -> CREATE TABLE ở trên đã đặt đúng MEDIUMTEXT.
  }
  // Seed base keyword lists for ALL filter categories from KEYWORD_SEEDS:
  //   sell    -> phễu trích giá group + "Người bán" của Lọc thông minh.
  //   buy     -> KHÁCH CẦN MUA (Lọc thông minh).
  //   support -> CẦN HỖ TRỢ (Lọc thông minh).
  // Toàn bộ ứng dụng (dashboard keywordStore, background ADD_KEYWORD, AI học ở
  // group-prices, leadfilter) lọc theo cột `type`, nên seed PHẢI khớp type hoặc
  // dashboard sẽ lọc hết. added_by='system' để phân biệt từ khoá nền (không xoá
  // được nhầm) với từ người dùng/AI tự thêm. INSERT IGNORE -> tôn trọng chỉnh
  // sửa của người dùng (bật/tắt/xoá) ở các lần chạy sau.
  for (const [type, words] of Object.entries(KEYWORD_SEEDS)) {
    for (const kw of words) {
      await pool.query(
        "INSERT IGNORE INTO learned_keywords (keyword, type, added_by, enabled) VALUES (?, ?, 'system', 1)",
        [kw, type]
      );
    }
  }
  // Migrate any legacy rows seeded with the wrong type. UPDATE IGNORE skips
  // rows that would collide with an existing (keyword,'sell') pair; the trailing
  // DELETE clears those leftover duplicates so no stale 'sell_signal' rows remain.
  await pool.query(
    "UPDATE IGNORE learned_keywords SET type='sell' WHERE type='sell_signal'"
  );
  await pool.query("DELETE FROM learned_keywords WHERE type='sell_signal'");
  for (const src of SEED_PRICE_SOURCES) {
    await pool.query(
      "INSERT IGNORE INTO sources (id, config, updated_at) VALUES (?, ?, NOW())",
      [src.id, JSON.stringify(src)]
    );
  }
  // Seed hồ sơ ngành mặc định (máy tính). INSERT IGNORE -> tôn trọng chỉnh sửa
  // của người dùng ở các lần chạy sau. `name` lưu riêng để liệt kê nhanh không
  // cần parse config; is_active đánh dấu hồ sơ AI đang dùng (mặc định: máy tính).
  for (const prof of PROMPT_PROFILE_SEEDS) {
    await pool.query(
      "INSERT IGNORE INTO prompt_profiles (id, name, config, is_active, updated_at) VALUES (?, ?, ?, ?, NOW())",
      [prof.id, prof.name, JSON.stringify(prof), prof.isActive ? 1 : 0]
    );
  }
}
