/**
 * admin.js — Trang QUẢN TRỊ cho FB Group Crawler.
 *
 * Luồng: đăng nhập (POST /api/auth/login) -> lưu token + email vào localStorage
 * -> dò quyền bằng GET /api/admin/users. Nếu là admin -> hiện khu quản trị; nếu
 * không phải admin (403) -> hiện thông báo "không có quyền". Token được gửi qua
 * header Authorization: Bearer <token> cho mọi lệnh gọi API quản trị.
 *
 * Chức năng: liệt kê người dùng (có avatar + số liệu tổng quan + tìm kiếm) và
 * duyệt/khóa/đổi vai trò/xóa; xem và sửa/xóa dữ liệu của các bảng cho phép
 * (posts, groups, comments, group_prices).
 *
 * Trải nghiệm: skeleton khi tải, empty-state khi rỗng, toast cho phản hồi thao
 * tác, modal xác nhận theo đúng hệ thiết kế (KHÔNG dùng confirm()/alert()).
 *
 * AN TOÀN (XSS): dữ liệu đến từ AI/crawl của nhiều người dùng nên KHÔNG tin cậy.
 * Mọi giá trị được chèn qua document.createElement + textContent / value (không
 * dùng innerHTML nối chuỗi).
 */

// Khoá localStorage dùng chung token + email (giống bảng dữ liệu app.js).
const TOKEN_KEY = "fb_crawler_token";
const EMAIL_KEY = "fb_crawler_email";

// Định dạng ngày giờ theo locale Việt Nam.
function fmtDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("vi-VN");
}

// Nhãn tiếng Việt cho trạng thái và vai trò (đồng thời là tên class badge).
const STATUS_LABEL = { pending: "Chờ duyệt", approved: "Đã duyệt", locked: "Đã khóa" };
const ROLE_LABEL = { admin: "Quản trị", user: "Người dùng" };

// Nhãn tiếng Việt cho tên bảng dữ liệu (hiện ở empty-state cho thân thiện).
const TABLE_LABEL = {
  posts: "bài viết",
  groups: "nhóm",
  comments: "bình luận",
  group_prices: "giá group",
};

// Bản sao danh sách trắng bảng/cột (mirror ADMIN_DATA_TABLES ở web/routes.js).
// Chỉ idCol + editable mới được hiển thị/cập nhật từ giao diện quản trị.
const DATA_TABLES = {
  posts: { idCol: "post_id", editable: ["text", "share_crawled"] },
  groups: { idCol: "group_id", editable: ["group_name"] },
  comments: { idCol: "id", editable: ["content", "share_commented"] },
  group_prices: { idCol: "id", editable: ["name", "price", "share_group_prices"] },
};

// Bảng dữ liệu đang xem (mặc định "posts" — khớp seg-btn active trong HTML).
let currentTable = "posts";

// Bộ nhớ tạm danh sách user gần nhất để lọc theo ô tìm kiếm mà không gọi lại API.
let usersCache = [];
let userQuery = "";

/* ============================ TIỆN ÍCH ============================== */

// Lấy phần tử theo id cho gọn.
function $(id) {
  return document.getElementById(id);
}

// Đặt nội dung + kiểu cho một vùng status (info/error/success/rỗng).
function setStatus(id, text, kind) {
  const el = $(id);
  if (!el) return;
  el.textContent = text || "";
  el.className = kind ? `status ${kind}` : "status";
}

/* ---------------------------- Toast ---------------------------- */
// Thông báo nổi góc phải, tự tắt. kind: "success" | "error" | "" (mặc định).
function toast(message, kind = "") {
  const root = $("toast-root");
  if (!root) return;
  const el = document.createElement("div");
  el.className = kind ? `toast ${kind}` : "toast";
  el.setAttribute("role", "status");
  const span = document.createElement("span");
  span.textContent = message;
  el.appendChild(span);
  root.appendChild(el);
  const remove = () => {
    el.classList.add("leaving");
    el.addEventListener("animationend", () => el.remove(), { once: true });
    // Phòng khi prefers-reduced-motion bỏ qua animation.
    setTimeout(() => el.remove(), 400);
  };
  setTimeout(remove, 3200);
}

/* ---------------------------- Modal xác nhận ---------------------------- */
// Trả về Promise<boolean>: true nếu người dùng xác nhận, false nếu hủy/đóng.
function confirmModal({ title, message, confirmText = "Xác nhận", danger = false }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";

    const modal = document.createElement("div");
    modal.className = "modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");

    const h = document.createElement("h3");
    h.textContent = title;
    const p = document.createElement("p");
    p.textContent = message;

    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn ghost";
    cancel.textContent = "Hủy";
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = danger ? "btn solid-danger" : "btn primary";
    ok.textContent = confirmText;

    actions.append(cancel, ok);
    modal.append(h, p, actions);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    ok.focus();

    const close = (result) => {
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    };
    cancel.addEventListener("click", () => close(false));
    ok.addEventListener("click", () => close(true));
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close(false);
    });
    document.addEventListener("keydown", onKey);
  });
}

/* ---------------------------- Avatar ---------------------------- */
// Màu nền graphite mờ theo tên (không cầu vồng) — khớp colorFor() của dashboard.
function avatarColor(str) {
  let h = 0;
  const s = str || "?";
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `hsl(${h}, 10%, 36%)`;
}
function initials(name, email) {
  const base = (name || email || "?").trim();
  const parts = base.split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

/* ---------------------------- Cell builders ---------------------------- */
// Tạo <td> chứa text thuần (an toàn XSS qua textContent). cls tùy chọn.
function textCell(value, cls) {
  const td = document.createElement("td");
  if (cls) td.className = cls;
  td.textContent = value == null ? "" : String(value);
  return td;
}

// Tạo <td> chứa một badge (span.badge.<cls>) với nhãn tiếng Việt.
function badgeCell(text, cls) {
  const td = document.createElement("td");
  const span = document.createElement("span");
  span.className = `badge ${cls}`;
  span.textContent = text;
  td.appendChild(span);
  return td;
}

// Tạo một <button> hành động (dùng cho các ô thao tác trong bảng).
function actionBtn(label, cls, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `btn sm ${cls}`;
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

// Dựng một <table> từ danh sách tiêu đề + danh sách hàng (mỗi hàng là mảng <td>).
// headers có thể là chuỗi hoặc { label, cls } để căn phải cột Hành động.
function buildTable(headers, rowCells) {
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const htr = document.createElement("tr");
  for (const h of headers) {
    const th = document.createElement("th");
    th.scope = "col"; // hỗ trợ trình đọc màn hình điều hướng bảng theo cột.
    if (typeof h === "object") {
      th.textContent = h.label;
      if (h.cls) th.className = h.cls;
    } else {
      th.textContent = h;
    }
    htr.appendChild(th);
  }
  thead.appendChild(htr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const cells of rowCells) {
    const tr = document.createElement("tr");
    for (const td of cells) tr.appendChild(td);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

// Thay thế nội dung một container bằng node mới (xoá sạch trước khi gắn).
function setContent(id, node) {
  const el = $(id);
  el.replaceChildren();
  if (node) el.appendChild(node);
}

// Dựng empty-state dạy giao diện (tiêu đề + mô tả).
function emptyState(title, desc) {
  const wrap = document.createElement("div");
  wrap.className = "empty";
  const t = document.createElement("div");
  t.className = "empty-title";
  t.textContent = title;
  const d = document.createElement("div");
  d.className = "empty-desc";
  d.textContent = desc;
  wrap.append(t, d);
  return wrap;
}

// Skeleton bảng: vài hàng giả lập trong khi chờ dữ liệu (thay cho spinner).
function skeletonTable(cols, rows = 4, withAvatar = false) {
  const table = document.createElement("table");
  const tbody = document.createElement("tbody");
  for (let r = 0; r < rows; r++) {
    const tr = document.createElement("tr");
    for (let c = 0; c < cols; c++) {
      const td = document.createElement("td");
      if (withAvatar && c === 0) {
        const cell = document.createElement("div");
        cell.className = "user-cell";
        const av = document.createElement("span");
        av.className = "skeleton avatar-sk";
        const bar = document.createElement("span");
        bar.className = "skeleton";
        bar.style.width = "120px";
        cell.append(av, bar);
        td.appendChild(cell);
      } else {
        const bar = document.createElement("span");
        bar.className = "skeleton";
        bar.style.width = `${40 + Math.round(Math.random() * 50)}%`;
        td.appendChild(bar);
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

/* ============================ XÁC THỰC ============================== */

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

// Lỗi nội bộ: 401 -> phiên hết hạn (đăng xuất); 403 -> không có quyền admin.
class UnauthorizedError extends Error {}
class ForbiddenError extends Error {}

// apiFetch(path, { method, body }): gửi Bearer token + Accept JSON; nếu có body
// thì gửi JSON. Trả về JSON đã parse. 401 -> UnauthorizedError, 403 ->
// ForbiddenError để caller phân luồng (đăng xuất / báo không có quyền).
async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) throw new UnauthorizedError("unauthorized");
  if (res.status === 403) throw new ForbiddenError("forbidden");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ============================ HIỂN THỊ KHU VỰC ============================== */

// Về form đăng nhập, ẩn mọi khu quản trị, dọn các bảng đã render.
function showLogin() {
  $("login-card").classList.remove("hidden");
  $("forbidden").classList.add("hidden");
  $("admin").classList.add("hidden");
  $("userbox").classList.add("hidden");
  $("user-email").textContent = "";
  setContent("users-table", null);
  setContent("data-table", null);
  setContent("user-stats", null);
  $("users-count").textContent = "";
  $("data-count").textContent = "";
  setStatus("users-status", "", null);
  setStatus("data-status", "", null);
}

// Đã đăng nhập nhưng không phải admin.
function showForbidden(email) {
  $("login-card").classList.add("hidden");
  $("forbidden").classList.remove("hidden");
  $("admin").classList.add("hidden");
  $("userbox").classList.remove("hidden");
  $("user-email").textContent = email || "";
}

// Đã đăng nhập bằng tài khoản admin -> hiện khu quản trị.
function showAdmin(email) {
  $("login-card").classList.add("hidden");
  $("forbidden").classList.add("hidden");
  $("admin").classList.remove("hidden");
  $("userbox").classList.remove("hidden");
  $("user-email").textContent = email || "";
}

// Đăng xuất: xoá token + email, quay về form đăng nhập.
function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
  usersCache = [];
  userQuery = "";
  const search = $("user-search");
  if (search) search.value = "";
  showLogin();
}

// Xử lý lỗi chung cho các thao tác: 401 -> đăng xuất; 403 -> báo mất quyền; còn
// lại -> báo lỗi nhẹ tại vùng status tương ứng + toast.
function handleError(err, statusId) {
  if (err instanceof UnauthorizedError) {
    logout();
    setStatus("login-status", "Phiên đã hết hạn, vui lòng đăng nhập lại.", "error");
    return;
  }
  if (err instanceof ForbiddenError) {
    setStatus(statusId, "Bạn không có quyền thực hiện thao tác này.", "error");
    toast("Bạn không có quyền thực hiện thao tác này.", "error");
    return;
  }
  setStatus(statusId, "Đã xảy ra lỗi. Thử lại sau.", "error");
  toast("Đã xảy ra lỗi. Thử lại sau.", "error");
}

/* ============================ NGƯỜI DÙNG ============================== */

// Dải số liệu tổng quan: tổng, chờ duyệt, đã duyệt, đã khóa.
function renderUserStats(users) {
  const counts = { total: users.length, pending: 0, approved: 0, locked: 0 };
  for (const u of users) {
    if (u.status in counts) counts[u.status]++;
  }
  const items = [
    { label: "Tổng", value: counts.total, cls: "" },
    { label: "Chờ duyệt", value: counts.pending, cls: "is-pending" },
    { label: "Đã duyệt", value: counts.approved, cls: "" },
    { label: "Đã khóa", value: counts.locked, cls: "is-locked" },
  ];
  const frag = document.createDocumentFragment();
  for (const it of items) {
    const cell = document.createElement("div");
    cell.className = `stat ${it.cls}`.trim();
    const label = document.createElement("span");
    label.className = "stat-label";
    label.textContent = it.label;
    const value = document.createElement("span");
    value.className = "stat-value";
    value.textContent = String(it.value);
    cell.append(label, value);
    frag.appendChild(cell);
  }
  setContent("user-stats", frag);
}

// Ô danh tính người dùng: avatar (initials) + tên + email.
function userIdentityCell(u) {
  const td = document.createElement("td");
  const wrap = document.createElement("div");
  wrap.className = "user-cell";
  const av = document.createElement("span");
  av.className = "avatar";
  av.style.background = avatarColor(u.email || u.displayName || "");
  av.textContent = initials(u.displayName, u.email);
  const meta = document.createElement("div");
  meta.className = "user-meta";
  const name = document.createElement("span");
  name.className = "user-name";
  name.textContent = u.displayName || u.email || "(không tên)";
  const mail = document.createElement("span");
  mail.className = "user-mail";
  mail.textContent = u.email || "";
  meta.append(name, mail);
  wrap.append(av, meta);
  td.appendChild(wrap);
  return td;
}

// Dựng các ô (cells) cho một hàng người dùng, kèm các nút thao tác.
function buildUserRow(u, myEmail) {
  const isSelf = u.email === myEmail; // chặn tự khóa/xóa/bỏ quyền chính mình.
  const cells = [
    textCell(u.id, "col-id"),
    userIdentityCell(u),
    badgeCell(ROLE_LABEL[u.role] || u.role, u.role === "admin" ? "role-admin" : "role-user"),
    badgeCell(STATUS_LABEL[u.status] || u.status, u.status),
    textCell(fmtDate(u.createdAt), "col-date"),
  ];

  const actions = document.createElement("td");
  actions.className = "row-actions right";

  // Duyệt — chỉ hiện khi chưa "approved".
  if (u.status !== "approved") {
    actions.appendChild(
      actionBtn("Duyệt", "primary", () =>
        userAction(`/api/admin/users/${u.id}/approve`, "PATCH", undefined, `Đã duyệt ${u.email}.`)
      )
    );
  }
  // Khóa — ẩn nếu đã khóa hoặc là chính mình.
  if (u.status !== "locked" && !isSelf) {
    actions.appendChild(
      actionBtn("Khóa", "danger", async () => {
        const ok = await confirmModal({
          title: "Khóa tài khoản",
          message: `Khóa ${u.email}? Người dùng sẽ không đăng nhập được cho tới khi được duyệt lại.`,
          confirmText: "Khóa",
          danger: true,
        });
        if (ok) userAction(`/api/admin/users/${u.id}/lock`, "PATCH", undefined, `Đã khóa ${u.email}.`);
      })
    );
  }
  // Đổi vai trò.
  if (u.role === "user") {
    actions.appendChild(
      actionBtn("Cấp admin", "ghost", () =>
        userAction(`/api/admin/users/${u.id}`, "PATCH", { role: "admin" }, `Đã cấp quyền admin cho ${u.email}.`)
      )
    );
  } else if (u.role === "admin" && !isSelf) {
    actions.appendChild(
      actionBtn("Bỏ admin", "ghost", () =>
        userAction(`/api/admin/users/${u.id}`, "PATCH", { role: "user" }, `Đã bỏ quyền admin của ${u.email}.`)
      )
    );
  }
  // Xóa — ẩn với chính mình, có xác nhận qua modal.
  if (!isSelf) {
    actions.appendChild(
      actionBtn("Xóa", "danger", async () => {
        const ok = await confirmModal({
          title: "Xóa tài khoản",
          message: `Xóa vĩnh viễn ${u.email} cùng toàn bộ dữ liệu liên quan? Không thể hoàn tác.`,
          confirmText: "Xóa",
          danger: true,
        });
        if (ok) userAction(`/api/admin/users/${u.id}`, "DELETE", undefined, `Đã xóa ${u.email}.`);
      })
    );
  }

  cells.push(actions);
  return cells;
}

// Lọc danh sách user theo ô tìm kiếm (email hoặc tên, không phân biệt hoa thường).
function filterUsers(users, q) {
  const query = q.trim().toLowerCase();
  if (!query) return users;
  return users.filter((u) => {
    const email = (u.email || "").toLowerCase();
    const name = (u.displayName || "").toLowerCase();
    return email.includes(query) || name.includes(query);
  });
}

// Vẽ lại bảng người dùng từ cache + bộ lọc tìm kiếm hiện tại.
function paintUsers() {
  const total = usersCache.length;
  $("users-count").textContent = total ? String(total) : "";
  renderUserStats(usersCache);

  if (total === 0) {
    setContent(
      "users-table",
      emptyState("Chưa có người dùng nào", "Tài khoản mới sẽ xuất hiện ở đây sau khi đăng ký.")
    );
    setStatus("users-status", "", null);
    return;
  }

  const filtered = filterUsers(usersCache, userQuery);
  if (filtered.length === 0) {
    setContent(
      "users-table",
      emptyState("Không tìm thấy", `Không có người dùng khớp với “${userQuery}”.`)
    );
    setStatus("users-status", "", null);
    return;
  }

  setStatus("users-status", "", null);
  const headers = [
    "ID",
    "Người dùng",
    "Vai trò",
    "Trạng thái",
    "Tạo lúc",
    { label: "Hành động", cls: "right" },
  ];
  const myEmail = localStorage.getItem(EMAIL_KEY) || "";
  const rows = filtered.map((u) => buildUserRow(u, myEmail));
  setContent("users-table", buildTable(headers, rows));
}

function renderUsers(data) {
  usersCache = Array.isArray(data && data.users) ? data.users : [];
  paintUsers();
}

async function loadUsers() {
  setContent("users-table", skeletonTable(6, 4, true));
  setStatus("users-status", "", null);
  try {
    const data = await apiFetch("/api/admin/users");
    renderUsers(data);
  } catch (err) {
    handleError(err, "users-status");
  }
}

// Thực thi một thao tác trên user (approve/lock/đổi vai trò/xóa) rồi tải lại.
async function userAction(path, method, body, successMsg) {
  setStatus("users-status", "Đang xử lý…", "info");
  try {
    await apiFetch(path, { method, body });
    setStatus("users-status", "", null);
    if (successMsg) toast(successMsg, "success");
    await loadUsers();
  } catch (err) {
    handleError(err, "users-status");
  }
}

/* ============================ DỮ LIỆU ============================== */

// Dựng các ô cho một hàng dữ liệu: idCol (chỉ đọc) + các cột editable (ô nhập)
// + nút Lưu/Xóa. Cột share_* dùng <select> 0/1; text/content dùng <textarea>.
function buildDataRow(table, spec, row) {
  const cells = [textCell(row[spec.idCol], "col-id")];
  const inputs = {};

  for (const col of spec.editable) {
    const td = document.createElement("td");
    let field;
    if (col.startsWith("share_")) {
      field = document.createElement("select");
      for (const [v, label] of [["1", "Có"], ["0", "Không"]]) {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = label;
        field.appendChild(opt);
      }
      field.value = row[col] != null && Number(row[col]) ? "1" : "0";
    } else if (col === "text" || col === "content") {
      field = document.createElement("textarea");
      field.value = row[col] == null ? "" : String(row[col]);
    } else {
      field = document.createElement("input");
      field.type = col === "price" ? "number" : "text";
      field.value = row[col] == null ? "" : String(row[col]);
    }
    td.appendChild(field);
    inputs[col] = field;
    cells.push(td);
  }

  const actions = document.createElement("td");
  actions.className = "row-actions right";
  actions.appendChild(
    actionBtn("Lưu", "primary", () => saveDataRow(table, spec, row[spec.idCol], inputs))
  );
  actions.appendChild(
    actionBtn("Xóa", "danger", async () => {
      const ok = await confirmModal({
        title: "Xóa bản ghi",
        message: "Xóa bản ghi này khỏi cơ sở dữ liệu? Không thể hoàn tác.",
        confirmText: "Xóa",
        danger: true,
      });
      if (ok) deleteDataRow(table, row[spec.idCol]);
    })
  );
  cells.push(actions);
  return cells;
}

function renderData(table, spec, data) {
  const rows = Array.isArray(data && data.rows) ? data.rows : [];
  $("data-count").textContent = rows.length ? String(rows.length) : "";
  if (rows.length === 0) {
    setContent(
      "data-table",
      emptyState("Chưa có dữ liệu", `Chưa có ${TABLE_LABEL[table] || "bản ghi"} nào để hiển thị.`)
    );
    setStatus("data-status", "", null);
    return;
  }
  setStatus("data-status", "", null);
  const headers = [
    spec.idCol,
    ...spec.editable,
    { label: "Hành động", cls: "right" },
  ];
  const rowCells = rows.map((row) => buildDataRow(table, spec, row));
  setContent("data-table", buildTable(headers, rowCells));
}

async function loadData(table) {
  const spec = DATA_TABLES[table];
  if (!spec) return;
  $("data-count").textContent = "";
  setContent("data-table", skeletonTable(spec.editable.length + 2, 4, false));
  setStatus("data-status", "", null);
  try {
    const data = await apiFetch(`/api/admin/data/${table}`);
    renderData(table, spec, data);
  } catch (err) {
    handleError(err, "data-status");
  }
}

// Thu thập giá trị từ các ô nhập rồi PATCH lên server. share_* và price chuyển
// về số; các cột chữ giữ nguyên chuỗi.
async function saveDataRow(table, spec, id, inputs) {
  const body = {};
  for (const col of spec.editable) {
    const raw = inputs[col].value;
    if (col.startsWith("share_")) {
      body[col] = Number(raw) ? 1 : 0;
    } else if (col === "price") {
      const n = Number(raw);
      body[col] = Number.isFinite(n) ? n : 0;
    } else {
      body[col] = raw;
    }
  }
  setStatus("data-status", "Đang lưu…", "info");
  try {
    await apiFetch(`/api/admin/data/${table}/${id}`, { method: "PATCH", body });
    setStatus("data-status", "", null);
    toast("Đã lưu thay đổi.", "success");
  } catch (err) {
    handleError(err, "data-status");
  }
}

async function deleteDataRow(table, id) {
  setStatus("data-status", "Đang xóa…", "info");
  try {
    await apiFetch(`/api/admin/data/${table}/${id}`, { method: "DELETE" });
    setStatus("data-status", "", null);
    toast("Đã xóa bản ghi.", "success");
    await loadData(table);
  } catch (err) {
    handleError(err, "data-status");
  }
}

// Gắn sự kiện cho thanh chọn bảng (segmented). Đổi trạng thái active + tải bảng.
function bindSeg() {
  const seg = $("table-seg");
  seg.addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    const table = btn.dataset.table;
    if (!table || table === currentTable) return;
    for (const b of seg.querySelectorAll(".seg-btn")) {
      b.classList.toggle("active", b === btn);
    }
    currentTable = table;
    loadData(table);
  });
}

// Ô tìm kiếm người dùng: lọc trên cache, vẽ lại bảng (không gọi lại API).
function bindUserSearch() {
  const input = $("user-search");
  if (!input) return;
  input.addEventListener("input", () => {
    userQuery = input.value;
    paintUsers();
  });
}

/* ============================ ĐIỀU PHỐI ============================== */

// Sau khi có token: dò quyền bằng GET /api/admin/users. Thành công -> khu quản
// trị + nạp bảng dữ liệu mặc định; 403 -> màn "không có quyền"; 401 -> đăng xuất.
async function enterAdmin(email) {
  try {
    const data = await apiFetch("/api/admin/users");
    showAdmin(email);
    renderUsers(data);
    await loadData(currentTable);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      showForbidden(email);
      return;
    }
    if (err instanceof UnauthorizedError) {
      logout();
      setStatus("login-status", "Phiên đã hết hạn, vui lòng đăng nhập lại.", "error");
      return;
    }
    // Lỗi mạng/máy chủ: vẫn vào khu quản trị nhưng báo lỗi để thử lại.
    showAdmin(email);
    setStatus("users-status", "Không tải được danh sách người dùng. Thử lại sau.", "error");
  }
}

// Xử lý đăng nhập: POST /api/auth/login với email/mật khẩu dạng JSON.
async function handleLogin(event) {
  event.preventDefault();
  const email = $("email").value.trim();
  const password = $("password").value;
  const status = $("login-status");
  status.textContent = "Đang đăng nhập…";
  status.className = "status info";
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
    if (res.status === 401) {
      status.textContent = "Sai email hoặc mật khẩu";
      status.className = "status error";
      return;
    }
    // Tài khoản chưa duyệt hoặc đã bị khóa thì không đăng nhập được.
    if (res.status === 403) {
      status.textContent = "Tài khoản chưa được duyệt hoặc đã bị khóa.";
      status.className = "status error";
      return;
    }
    if (!res.ok) {
      status.textContent = "Đăng nhập thất bại. Thử lại sau.";
      status.className = "status error";
      return;
    }
    let data;
    try {
      data = await res.json();
    } catch {
      status.textContent = "Đăng nhập thất bại. Thử lại sau.";
      status.className = "status error";
      return;
    }
    if (!data.token) {
      status.textContent = "Đăng nhập thất bại. Thử lại sau.";
      status.className = "status error";
      return;
    }
    const userEmail = (data.user && data.user.email) || email;
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(EMAIL_KEY, userEmail);
    status.textContent = "";
    status.className = "status";
    $("password").value = "";
    await enterAdmin(userEmail);
  } catch {
    status.textContent = "Không kết nối được máy chủ.";
    status.className = "status error";
  }
}

/* ============================ KHỞI ĐỘNG ============================== */

function init() {
  $("login-form").addEventListener("submit", handleLogin);
  $("logout-btn").addEventListener("click", logout);
  const forbiddenLogout = $("forbidden-logout");
  if (forbiddenLogout) forbiddenLogout.addEventListener("click", logout);
  bindSeg();
  bindUserSearch();

  // Nếu đã có token -> dò quyền và vào thẳng khu quản trị (enterAdmin tự xử lý
  // 401/403 để quay lại form đăng nhập hoặc báo không có quyền).
  const token = getToken();
  if (token) {
    enterAdmin(localStorage.getItem(EMAIL_KEY) || "");
  } else {
    showLogin();
  }
}

init();
