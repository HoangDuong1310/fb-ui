# Group Radar — Web Dashboard

Tài liệu này mô tả kiến trúc web của dự án sau khi tách thành **hai ứng dụng** chạy song song. Cả hai nằm trong thư mục `server/` của repo:

- **`server/web/`** — API backend (Node.js + Express + MySQL, đăng nhập JWT). Đây là nguồn dữ liệu duy nhất cho cả extension lẫn dashboard.
- **`server/web-ui/`** — Frontend dashboard (Next.js + shadcn/ui). Chỉ là lớp giao diện; mọi request `/api/*` được proxy sang Express.

Extension Chrome (`src/`, `manifest.json`) ở thư mục gốc repo **không đổi** — vẫn gọi thẳng API ở backend.

> 🚀 **Deploy lên server:** xem hướng dẫn chi tiết tại [`server/DEPLOY.md`](../DEPLOY.md). Lưu ý kiểm tra cổng/Nginx/DB nếu server đã chạy sẵn web khác.

---

## Kiến trúc tổng quan

```
┌──────────────────┐        /api/*          ┌──────────────────────┐
│  web-ui (Next.js)│ ─────── proxy ───────▶ │  web (Express API)   │
│  shadcn/ui       │   rewrites trong       │  JWT + MySQL         │
│  http://:3000    │   next.config.ts       │  http://:3300        │
└──────────────────┘                        └──────────┬───────────┘
                                                        │
┌──────────────────┐        /api/* trực tiếp           │
│ Extension Chrome │ ──────────────────────────────────┘
│ (src/, vanilla)  │
└──────────────────┘
```

- Frontend không giữ logic dữ liệu riêng. Nó gọi `/api/*` cùng host, Next.js `rewrites()` chuyển tiếp tới `API_ORIGIN` (mặc định `http://localhost:3300`).
- Backend giữ nguyên 53 test, không phụ thuộc vào frontend.

---

## 1. Backend — `web/`

### Yêu cầu
- Node.js 18+
- MySQL 8 (hoặc MariaDB tương thích)

### Cài đặt & cấu hình
```bash
cd web
npm install
cp .env.example .env
```

Các biến môi trường trong `.env`:

| Biến | Ví dụ | Ý nghĩa |
|------|-------|---------|
| `DATABASE_URL` | `mysql://root:@localhost:3306/fb_crawler` | Chuỗi kết nối MySQL |
| `JWT_SECRET` | `(chuỗi ngẫu nhiên dài)` | Khóa ký token JWT |
| `JWT_EXPIRES` | `30d` | Thời hạn token |
| `PORT` | `3300` | Cổng API |
| `ADMIN_EMAIL` | `admin@example.com` | Email được **tự động cấp quyền admin + duyệt** khi chạy migration |

> Tài khoản đăng ký bằng đúng `ADMIN_EMAIL` sẽ được nâng role `admin` và đặt trạng thái `approved` ngay khi migration chạy. Các tài khoản khác mặc định ở trạng thái chờ duyệt.

### Chạy
```bash
npm start        # node server.js — khởi động API + chạy migration (PORT=3300)
```

### Test
```bash
npm test         # node --test — 53 test (auth, admin, data, prompt-profiles, ...)
```

---

## 2. Frontend — `web-ui/`

Next.js (App Router, Turbopack) + TypeScript + Tailwind v4 + shadcn/ui. Theme "market terminal" (graphite OKLCH, dark).

### Cài đặt
```bash
cd web-ui
npm install
```

### Cấu hình proxy
Proxy được khai báo trong [`web-ui/next.config.ts`](../web-ui/next.config.ts:8):

```ts
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3300";
// rewrites: /api/:path*  ->  ${API_ORIGIN}/api/:path*
```

Để trỏ tới backend khác, đặt biến `API_ORIGIN` trong `web-ui/.env.local`:
```
API_ORIGIN=http://localhost:3300
```

### Chạy
```bash
npm run dev      # dev server (mặc định http://localhost:3000)
npm run build    # build production (kiểm tra TypeScript + prerender)
npm start        # chạy bản build production
```

---

## 3. Chạy cả hai cho môi trường dev

Mở hai terminal:

```bash
# (chạy từ thư mục server/)
# Terminal 1 — API
cd web && npm start            # http://localhost:3300

# Terminal 2 — Dashboard
cd web-ui && npm run dev       # http://localhost:3000
```

Truy cập `http://localhost:3000`, đăng nhập, mọi lệnh gọi `/api/*` sẽ tự proxy sang Express ở cổng 3300.

---

## 4. Dashboard hợp nhất theo quyền (role-based)

Chỉ có **một** dashboard, hiển thị menu/trang theo role của người dùng (lấy từ JWT):

### Trang cho mọi người dùng đã đăng nhập
- `/` — Tổng quan (thống kê nhóm/bài viết)
- `/groups` — Danh sách nhóm
- `/posts` — Bài viết đã thu thập
- `/group-prices` — Giá theo nhóm

### Trang chỉ dành cho admin
- `/admin/users` — Quản lý người dùng (duyệt / khóa / đổi role / xóa)
- `/admin/data` — Sửa dữ liệu các bảng

Cơ chế bảo vệ:
- `useAuth()` cung cấp `{ user, isAuthenticated, isAdmin, login, logout }`, lưu token (`gr_token`) và user (`gr_user`) ở `localStorage`.
- Layout nhóm `(dashboard)` bọc `AuthGuard`; thư mục `admin/` thêm một `AuthGuard requireAdmin` nữa.

---

## 5. Cấu trúc thư mục rút gọn

```
web/                  # Express API + MySQL (giữ nguyên, 53 test)
  server.js           # buildApp() + start()
  routes.js           # toàn bộ endpoint /api/*
  auth.js             # authRequired / adminRequired
  config.js, schema.js
  test/               # 53 test (node --test)

web-ui/               # Next.js frontend
  next.config.ts      # proxy /api/* -> API_ORIGIN
  src/app/
    login/            # trang đăng nhập
    (dashboard)/      # shell hợp nhất (sidebar + topbar + AuthGuard)
      page.tsx        # tổng quan
      groups/ posts/ group-prices/
      admin/          # AuthGuard requireAdmin
        users/ data/
  src/lib/
    api.ts auth.tsx use-api.ts types.ts format.ts nav.ts
  src/components/     # app-sidebar, auth-guard, page-parts, ui/*
```

---

## Lưu ý

- Backend là nguồn dữ liệu duy nhất; frontend không nên truy cập DB trực tiếp.
- Khi đổi cổng/host của API, chỉ cần chỉnh `API_ORIGIN` ở `web-ui/.env.local` — không sửa code.
- 53 test backend phải luôn xanh trước khi phát hành; frontend được thêm vào hoàn toàn tách biệt, không ảnh hưởng API.
