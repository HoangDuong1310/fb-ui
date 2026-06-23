# Hướng dẫn deploy `server/` lên VPS

Tài liệu này hướng dẫn deploy **backend Express (`server/web`)** và **frontend Next.js (`server/web-ui`)** lên một server **đang chạy sẵn các web khác**.

> ⚠️ **QUAN TRỌNG — server đã có web khác đang chạy.** Trước khi cài đặt, BẮT BUỘC làm theo phần [0. Kiểm tra trước khi cài](#0-kiểm-tra-trước-khi-cài-bắt-buộc) để tránh:
> - Trùng cổng (port conflict) với app đang chạy
> - Ghi đè cấu hình Nginx của site khác
> - Trùng tên process trong PM2 / systemd
> - Dùng nhầm database của dự án khác

---

## Kiến trúc tổng quan

```
server/
├── web/        → Backend Express + MySQL (API /api/*, mặc định cổng 3300)
└── web-ui/     → Frontend Next.js (dashboard quản trị, mặc định cổng 3000)
```

Luồng request:

```
Trình duyệt ──▶ Nginx (443) ──▶ Next.js (web-ui :3000)
                                     │ proxy /api/* (rewrites trong next.config.ts)
                                     ▼
                                Express (web :3300) ──▶ MySQL
```

- `web-ui` proxy mọi `/api/*` sang `web` qua biến môi trường `API_ORIGIN` (xem [next.config.ts](web-ui/next.config.ts:4)).
- Extension Chrome gọi thẳng API qua domain công khai (`https://your-domain/api/...`).

---

## 0. Kiểm tra trước khi cài (BẮT BUỘC)

Chạy các lệnh sau **trên server** và ghi lại kết quả trước khi quyết định cổng/đường dẫn.

### 0.1. Cổng nào đang bị chiếm

```bash
# Liệt kê toàn bộ cổng đang LISTEN kèm tên process
sudo ss -tlnp

# Kiểm tra cụ thể 2 cổng mặc định của dự án này
sudo ss -tlnp | grep -E ':3000|:3300' || echo "3000 & 3300 đang trống"
```

➡️ Nếu **3000** hoặc **3300** đã bị app khác chiếm, ĐỪNG dùng cổng đó. Chọn cổng trống (ví dụ 3001 / 3301) và đặt lại trong `.env` (xem mục 3) + `API_ORIGIN`.

### 0.2. Các app PM2 đang chạy (nếu dùng PM2)

```bash
pm2 list
```

➡️ Đảm bảo tên process bạn sắp tạo (`fb-web`, `fb-web-ui`) **chưa tồn tại**. Nếu trùng, đổi tên để không kill nhầm app khác.

### 0.3. Cấu hình Nginx hiện có

```bash
ls -la /etc/nginx/sites-enabled/
sudo nginx -T | grep -E 'server_name|listen' | head -50
```

➡️ Ghi lại các `server_name` đã dùng. Tạo **file config riêng** cho domain mới, KHÔNG sửa file của site khác.

### 0.4. MySQL — database & user đang có

```bash
sudo mysql -e "SHOW DATABASES;"
sudo mysql -e "SELECT user, host FROM mysql.user;"
```

➡️ Tạo **database mới riêng** (ví dụ `fb_crawler`) và **user MySQL riêng** cho dự án này. KHÔNG dùng chung DB/user với app khác.

### 0.5. Phiên bản Node

```bash
node -v   # cần >= 20 (Next.js 16 + backend ESM)
```

➡️ Nếu server đang dùng Node cũ cho app khác, cài thêm bản mới qua [nvm](https://github.com/nvm-sh/nvm) thay vì nâng cấp global (tránh làm hỏng app khác).

---

## 1. Yêu cầu môi trường

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| Node.js | >= 20 LTS | Khuyến nghị dùng nvm để cô lập |
| npm | >= 10 | Đi kèm Node 20 |
| MySQL | >= 8.0 (hoặc MariaDB 10.5+) | Tạo DB + user riêng |
| Nginx | bất kỳ | Reverse proxy + TLS |
| PM2 | mới nhất | `npm i -g pm2` (hoặc dùng systemd) |

---

## 2. Lấy code lên server

```bash
# Trên server, vào thư mục chứa các project (KHÔNG đặt chung với web khác)
cd /var/www
git clone <repo-url> fb-group-crawler
cd fb-group-crawler/server
```

Cấu trúc sau khi clone: `server/web` và `server/web-ui` (node_modules & .next KHÔNG có trong repo, sẽ cài ở bước sau).

---

## 3. Cấu hình biến môi trường

### 3.1. Backend — `server/web/.env`

```bash
cd /var/www/fb-group-crawler/server/web
cp .env.example .env
nano .env
```

Nội dung `.env`:

```dotenv
# DB riêng cho dự án này — KHÔNG dùng chung với app khác trên server
DATABASE_URL="mysql://fbcrawler_user:MAT_KHAU_MANH@localhost:3306/fb_crawler"

# BẮT BUỘC ở production — tạo chuỗi ngẫu nhiên dài (xem lệnh bên dưới)
JWT_SECRET="<chuỗi-bí-mật-ngẫu-nhiên>"
JWT_EXPIRES="30d"

# Đổi nếu 3300 đã bị chiếm (xem mục 0.1)
PORT=3300

# Email đăng ký đầu tiên → tự nâng lên admin + approved khi migrate
ADMIN_EMAIL="admin@your-domain.com"
```

Tạo `JWT_SECRET` an toàn:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> ⚠️ Ở `NODE_ENV=production`, backend sẽ **throw lỗi nếu `JWT_SECRET` chưa đặt** (xem [config.js](web/config.js:20)). Bắt buộc phải có.

### 3.2. Frontend — `server/web-ui/.env.local`

```bash
cd /var/www/fb-group-crawler/server/web-ui
nano .env.local
```

```dotenv
# Trỏ tới backend Express. Nếu đổi PORT ở mục 3.1 thì sửa lại cho khớp.
API_ORIGIN="http://localhost:3300"
```

---

## 4. Tạo database & user MySQL riêng

```bash
sudo mysql
```

```sql
CREATE DATABASE IF NOT EXISTS fb_crawler
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'fbcrawler_user'@'localhost' IDENTIFIED BY 'MAT_KHAU_MANH';
GRANT ALL PRIVILEGES ON fb_crawler.* TO 'fbcrawler_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

> Backend tự tạo bảng + seed keyword/giá khi khởi động lần đầu (`ensureDatabase()` + `runMigrations()` trong [server.js](web/server.js:49)). Không cần import SQL thủ công.

---

## 5. Cài dependencies & build

### 5.1. Backend

```bash
cd /var/www/fb-group-crawler/server/web
npm ci --omit=dev   # hoặc: npm install --production
```

### 5.2. Frontend (build production)

```bash
cd /var/www/fb-group-crawler/server/web-ui
npm ci
npm run build        # tạo thư mục .next
```

---

## 6. Chạy bằng PM2 (khuyến nghị)

Dùng tên process **riêng biệt** để không đụng app khác (đã kiểm tra ở mục 0.2).

```bash
# Backend
cd /var/www/fb-group-crawler/server/web
NODE_ENV=production pm2 start npm --name fb-web -- start

# Frontend
cd /var/www/fb-group-crawler/server/web-ui
pm2 start npm --name fb-web-ui -- start

# Lưu danh sách + tự khởi động lại khi reboot
pm2 save
pm2 startup   # chạy theo lệnh được in ra
```

Kiểm tra:

```bash
pm2 status
pm2 logs fb-web --lines 50
pm2 logs fb-web-ui --lines 50
```

---

## 7. Cấu hình Nginx (file riêng, không động vào site khác)

Tạo file MỚI cho domain của dự án:

```bash
sudo nano /etc/nginx/sites-available/fb-group-crawler
```

```nginx
server {
    listen 80;
    server_name your-domain.com;   # đổi thành domain thật, KHÁC server_name của app khác

    # Frontend Next.js (đã tự proxy /api/* sang backend nội bộ qua next.config.ts)
    location / {
        proxy_pass http://127.0.0.1:3000;   # đổi nếu bạn đổi cổng web-ui
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Tăng giới hạn body cho các batch sync lớn (backend đặt 25mb)
    client_max_body_size 25m;
}
```

Bật site & reload (an toàn, không ảnh hưởng site khác):

```bash
sudo ln -s /etc/nginx/sites-available/fb-group-crawler /etc/nginx/sites-enabled/
sudo nginx -t          # PHẢI pass trước khi reload
sudo systemctl reload nginx
```

> 💡 Có thể để Nginx trỏ thẳng `/api/` sang backend `:3300` thay vì qua Next.js. Nhưng giữ proxy qua Next (mặc định) đơn giản hơn vì `next.config.ts` đã xử lý rewrite sẵn.

---

## 8. Cấp HTTPS (Let's Encrypt)

```bash
sudo certbot --nginx -d your-domain.com
```

Certbot chỉ sửa block `server` của domain này, không đụng cấu hình domain khác.

---

## 9. Kiểm tra sau deploy

```bash
# Backend trả JSON (chưa có token → 401 là đúng)
curl -i http://localhost:3300/api/stats

# Frontend render được trang login
curl -i http://localhost:3000

# Qua domain công khai
curl -i https://your-domain.com
```

Truy cập `https://your-domain.com` → đăng ký bằng email = `ADMIN_EMAIL` để có tài khoản admin đầu tiên.

---

## 10. Cập nhật code về sau

```bash
cd /var/www/fb-group-crawler
git pull

# Backend
cd server/web && npm ci --omit=dev && pm2 restart fb-web

# Frontend
cd ../web-ui && npm ci && npm run build && pm2 restart fb-web-ui
```

---

## 11. Khắc phục sự cố thường gặp

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `EADDRINUSE :::3300` hoặc `:::3000` | Cổng đã bị app khác chiếm | Đổi `PORT` (mục 3.1) + `API_ORIGIN` + cổng trong Nginx |
| Backend crash: `JWT_SECRET must be set in production` | Thiếu `JWT_SECRET` | Đặt `JWT_SECRET` trong `server/web/.env` |
| `ER_ACCESS_DENIED_ERROR` | Sai user/mật khẩu MySQL | Kiểm tra `DATABASE_URL` khớp user đã tạo ở mục 4 |
| Frontend gọi API lỗi 502 | `API_ORIGIN` sai cổng hoặc backend chưa chạy | `pm2 logs fb-web`, kiểm tra cổng |
| Web khác trên server bị ảnh hưởng | Sửa nhầm Nginx/PM2 dùng chung | Luôn dùng **file Nginx riêng** + **tên PM2 riêng** |

---

## Checklist nhanh trước khi go-live

- [ ] Đã kiểm tra cổng trống (mục 0.1), không trùng app khác
- [ ] Tên PM2 (`fb-web`, `fb-web-ui`) không trùng (mục 0.2)
- [ ] File Nginx **riêng**, `server_name` riêng (mục 0.3, 7)
- [ ] DB + user MySQL **riêng** cho dự án (mục 4)
- [ ] `JWT_SECRET` đã đặt, `.env` KHÔNG bị commit lên git
- [ ] `npm run build` web-ui thành công
- [ ] `nginx -t` pass trước khi reload
- [ ] HTTPS đã cấp, truy cập domain ra trang login
