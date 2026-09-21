# ViVuTraVinh

ViVuTraVinh là website/PWA khám phá địa điểm ăn uống, cà phê, du lịch và dịch vụ tại Trà Vinh. Dự án dùng HTML, CSS và JavaScript thuần, dữ liệu địa điểm lấy từ Supabase `places`, có fallback JSON khi nguồn dữ liệu chính không khả dụng.

## Tính năng chính

- Tìm kiếm, lọc và chia địa điểm theo nhóm: ẩm thực, cà phê, du lịch, dịch vụ.
- Khu vực nổi bật và mới cập nhật.
- Gợi ý thông minh theo thời gian và giờ hoạt động của địa điểm.
- Modal chi tiết địa điểm với hình ảnh, giá, giờ mở cửa, địa chỉ, liên hệ, GPS, bản đồ và chia sẻ.
- Bản đồ tương tác bằng Leaflet.
- Bình luận, đánh giá và báo sai thông tin địa điểm qua Supabase & serverless API.
- Dashboard quản trị bảo mật tại `admin.html` (3 tab: Địa điểm, Bình luận, Báo sai; phân quyền RBAC admin/editor/moderator; audit logs).
- PWA: manifest, service worker, cache offline, nút cài đặt app.
- SEO cơ bản: meta tags, structured data, sitemap và robots.txt.

## Chạy local

```bash
npm install
npm run dev
```

Sau đó mở:

```text
http://localhost:8000
```

Có thể chạy thay thế bằng:

```bash
python -m http.server 8000
# hoặc
npx http-server -p 8000
```

Nên chạy qua HTTP/HTTPS, không mở trực tiếp bằng `file://`, vì ES modules, service worker và PWA cần browser security context phù hợp.

## Scripts

```bash
# Chạy máy chủ phát triển (tắt cache để kiểm thử UI)
npm run dev

# Đóng gói sản phẩm phát hành độc lập (Zero-CDN, tài nguyên local)
npm run build

# Xem trước bản đóng gói dist/
npm run preview

# Kiểm tra cú pháp toàn bộ JavaScript modules và serverless API
npm run check

# Chạy kiểm thử tự động bộ fixture và tính hợp lệ dữ liệu
npm run test:fixtures

# Chạy kiểm thử chuyên sâu giao diện quản trị G8 (48 test cases)
npm run test:g8

# Chạy kiểm thử trình duyệt CDP cho giao diện quản trị G8
npm run test:g8:browser

# Chạy kiểm toán trực tiếp Vercel serverless API & Supabase production (Live Audit)
npm run test:g8:live

# Chạy kiểm toán đường cơ sở dữ liệu production chỉ đọc (G9.0 Baseline Audit)
npm run audit:g9

# Chạy toàn bộ cổng chất lượng (gate check gồm 16 test suites)
npm run check:gate

# Chạy toàn bộ kiểm thử
npm test
```

## Cấu trúc dự án

```text
.
├── index.html              # Giao diện chính và điều phối UI
├── admin.html              # Dashboard quản trị địa điểm, bình luận và báo sai (3 tab RBAC)
├── api/
│   ├── _admin-auth.js      # Middleware xác thực Supabase Auth & RBAC (admin/editor/moderator)
│   ├── admin-profile.js    # Lấy thông tin profile & vai trò quản trị viên
│   ├── admin-places.js     # API quản trị địa điểm (CRUD atomic RPC)
│   ├── admin-comments.js   # API kiểm duyệt bình luận (ẩn/hiện/xóa atomic RPC)
│   ├── admin-reports.js    # API xử lý phản ánh báo sai thông tin (atomic RPC)
│   ├── submit-comment.js   # API gửi bình luận (rate-limit theo IP, pre-moderation)
│   ├── submit-place.js     # API tiếp nhận đóng góp địa điểm
│   ├── report-place.js     # API tiếp nhận phản ánh báo sai (idempotency)
│   ├── import-place.js     # API webhook tiếp nhận import từ Google Apps Script
│   └── og-place.js         # Dynamic Open Graph meta tags cho bot mạng xã hội
├── js/
│   ├── config.js           # Cấu hình Supabase, nguồn dữ liệu & mô phỏng
│   ├── data.js             # Load/normalize/cache đa nguồn (mock/fallback/supabase)
│   ├── app.js              # State controller và điều phối sự kiện
│   ├── ui.js               # Render Bento Grid, card, modal, stories, tabs
│   ├── offline-sync.js     # IndexedDB offline store & Background Sync
│   ├── admin-auth.js       # Quản lý phiên, đăng nhập Supabase Auth & JWT token
│   ├── admin.js            # Controller bảng quản trị 3 tab, modal preview, filter
│   ├── telemetry.js        # Web Vitals & đo lường hiệu năng
│   ├── festivals-data.js   # Dữ liệu lễ hội & countdown
│   ├── articles-data.js    # Dữ liệu ký sự & chuyện xứ Trà
│   └── comments.js         # Load/gửi/tổng hợp bình luận
├── data/
│   ├── data-fixture.json   # 10 ca thử nghiệm nghiệp vụ cho môi trường dev local
│   └── data-fallback.json  # Snapshot dữ liệu địa điểm local đang chờ xác minh nguồn
├── scripts/
│   ├── build.cjs           # Script đóng gói production build (dist/)
│   ├── test-g8-admin.js    # Bộ kiểm thử chuyên sâu G8 (48 test cases)
│   ├── verify-g8-live.js   # Script kiểm toán trực tiếp Vercel API & Supabase production
│   └── audit-g9-production.js # Script kiểm toán đường cơ sở dữ liệu chỉ đọc G9.0
├── manifest.json           # PWA manifest
├── service-worker.js       # Offline cache & background sync
├── sitemap.xml             # Sitemap SEO
├── robots.txt              # Robots directives
├── vercel.json             # Cấu hình deploy Vercel / serverless routing
├── supabase/
│   ├── places.sql          # Schema, RLS và chỉ mục bảng places
│   ├── place_comments.sql  # Schema, RLS, trigger bảng place_comments
│   ├── g7_place_reports.sql # Schema, RLS bảng place_reports
│   ├── g8_admin.sql        # Bảng admin_users, admin_audit_logs & 6 PostgreSQL RPC nguyên tử
│   └── g8_admin_rollback.sql # Kịch bản hoàn tác rollback an toàn cho G8
└── CLAUDE.md               # Hướng dẫn cho AI Pair Programming
```

## Nguồn dữ liệu & Môi trường kiểm thử Local

Hệ thống hỗ trợ 3 chế độ nguồn dữ liệu được chuẩn hóa cùng một Place schema:

1. **`mock` (Mặc định cho Local Development)**:
   - Nạp trực tiếp từ `data/data-fixture.json` (10 ca thử nghiệp vụ biên: bún nước lèo <50k, cafe nhiều ảnh, điểm miễn phí, lưu trú >200k, thiếu ảnh, ảnh 404, thiếu thông tin, tạm đóng, mở qua đêm, tên và địa chỉ rất dài).
   - **Hoàn toàn KHÔNG phát bất kỳ network request nào tới Supabase**.
   - Có badge hiển thị nhận diện `🧪 Mock Fixture (10)` trên giao diện.

2. **`fallback` (Snapshot phát hành)**:
   - Nạp trực tiếp từ `data/data-fallback.json` (12 địa điểm dạng snapshot local đang chờ xác minh nguồn).
   - Dùng để kiểm thử giao diện với tập dữ liệu chuẩn bị cho production.

3. **`supabase` (Kết nối máy chủ Backend)**:
   - Kết nối tới Supabase REST API `places`.
   - Nếu kết nối thất bại (mạng yếu hoặc máy chủ bảo trì), tự động fallback về `data/data-fallback.json`.

### Cách chuyển đổi nguồn dữ liệu

- **Qua URL Param**: `http://localhost:8000/?source=mock` hoặc `?source=fallback` hoặc `?source=supabase`.
- **Qua UI**: Bấm trực tiếp vào badge `[Mock Fixture]` bên cạnh bộ đếm số lượng địa điểm trên trang chủ.
- **Qua Console**: `window.ViVuData.setDataSource('mock' | 'fallback' | 'supabase')`.
- **Xóa Cache**: `window.ViVuData.clearPlacesCache()`.

### Chế độ mô phỏng mạng (Simulation Modes)

Dành cho kiểm thử độ chịu tải và xử lý ngoại lệ giao diện:
- **Mô phỏng độ trễ mạng**: `?simDelay=1500` (độ trễ 1.5 giây để quan sát hiệu ứng skeleton loading).
- **Mô phỏng lỗi kết nối**: `?simError=true` (kiểm tra màn hình báo lỗi và nút tải lại).
- **Mô phỏng danh sách rỗng**: `?simEmpty=true` (kiểm tra empty state khi không tìm thấy địa điểm).
- **Hủy mô phỏng qua Console**: `window.ViVuData.resetSimulation()`.

## Tương tác người dùng & Hệ thống quản trị nội dung

### Tương tác cộng đồng (Public Flow)

- **Xem dữ liệu**: `index.html` gọi Supabase REST `places` và `place_comments` bằng `anon key`. Row Level Security (RLS) đảm bảo người dùng chỉ đọc được các địa điểm `status = 'approved'` và bình luận `status = 'approved' AND is_hidden = false`.
- **Gửi bình luận**: Thực hiện qua serverless API `POST /api/submit-comment` (bảo vệ bằng IP rate limit, chống trùng lặp `client_review_id`, giới hạn payload 64KB, kiểm duyệt trước với `status = 'pending'`).
- **Phản ánh báo sai**: Thực hiện qua serverless API `POST /api/report-place` (chống trùng lặp `client_report_id`, bảo vệ bằng rate limit, `status = 'pending'`).

### Hệ thống quản trị nội dung (Admin Operations & Security)

Hệ thống quản trị tại `admin.html` được thiết kế bảo mật cấp doanh nghiệp, tuân thủ nguyên tắc Zero-CDN, RBAC nghiêm ngặt và giao dịch nguyên tử:

1. **Xác thực danh tính (Authentication):**
   - Sử dụng Supabase Auth REST Password Grant (`/auth/v1/token?grant_type=password`).
   - Quản trị viên đăng nhập bằng tài khoản và mật khẩu định danh cá nhân qua Supabase Auth.
   - Quản lý phiên qua JWT token ngắn hạn với cơ chế tự động làm mới và đăng xuất an toàn khi hết hạn.
   - **Production đã vô hiệu hóa ADMIN_SECRET; legacy chỉ còn trong test/non-production.**

2. **Phân quyền truy cập dựa trên vai trò (RBAC):**
   Bảng `public.admin_users` quản lý danh sách quản trị viên được phép truy cập theo 3 vai trò:
   - **`admin`**: Toàn quyền vận hành hệ thống — tạo, chỉnh sửa, lưu trữ (`archive`) địa điểm; duyệt/ẩn/xóa bình luận; tiếp nhận và giải quyết phản ánh báo sai.
   - **`editor`**: Quản trị viên nội dung — tạo mới bản nháp (`draft`), xem trước và cập nhật thông tin địa điểm. Không có quyền xóa bình luận hoặc xử lý báo sai.
   - **`moderator`**: Quản trị viên kiểm duyệt cộng đồng — duyệt/ẩn bình luận và xử lý phản ánh báo sai. Không có quyền sửa hoặc xóa địa điểm.

3. **Giao diện Dashboard 3 Tab (`admin.html`):**
   - **Tab Địa điểm**: Quản lý vòng đời địa điểm (Draft → Preview → Approve → Archive), bộ lọc đa tiêu chí (trạng thái, phân loại, tìm kiếm theo tên/slug/địa chỉ), modal xem trước chuẩn giao diện người dùng (Bento Card & Modal chi tiết), form biên tập đầy đủ.
   - **Tab Bình luận**: Danh sách đánh giá từ cộng đồng, lọc theo trạng thái/địa điểm, thao tác duyệt, ẩn hoặc xóa kèm xác nhận modal hai lớp.
   - **Tab Báo sai**: Danh mục phản ánh thông tin từ người dùng (sai giờ, sai giá, sai địa chỉ, đóng cửa, khác), luồng cập nhật trạng thái (`pending` → `reviewed` → `resolved` / `dismissed`) và ghi chú xử lý.

4. **Giao dịch nguyên tử & Nhật ký kiểm toán (Atomic Transactions & Audit Logs):**
   - Mọi thao tác thay đổi dữ liệu nhạy cảm được thực thi qua **6 hàm PostgreSQL RPC giao dịch nguyên tử** (`supabase/g8_admin.sql`):
     - `admin_create_place_atomic`
     - `admin_update_place_atomic`
     - `admin_delete_place_atomic` (chuyển trạng thái sang `archived`)
     - `admin_update_comment_atomic`
     - `admin_delete_comment_atomic`
     - `admin_update_report_atomic`
   - Mỗi mutation tự động ghi đúng 1 bản ghi vào bảng `public.admin_audit_logs` gồm 12 trường tiêu chuẩn (`id`, `actor_id`, `actor_email`, `actor_role`, `action`, `entity_type`, `entity_id`, `payload_before`, `payload_after`, `ip`, `correlation_id`, `created_at`).
   - Tuyệt đối không ghi access token, mật khẩu hay dữ liệu nhạy cảm vào audit log.

5. **API Backend Quản trị (`api/*`):**
   - `GET /api/admin-profile`: Kiểm tra phiên đăng nhập và truy vấn vai trò RBAC của người dùng.
   - `GET /api/admin-places`: Danh sách địa điểm có phân trang, lọc theo `status`, `category` và tìm kiếm text.
   - `POST /api/admin-places`: Tạo địa điểm mới (atomic RPC).
   - `PATCH /api/admin-places`: Chỉnh sửa thông tin địa điểm (atomic RPC).
   - `DELETE /api/admin-places`: Lưu trữ địa điểm (archive atomic RPC).
   - `GET /api/admin-comments`: Danh sách bình luận có phân trang và lọc theo trạng thái.
   - `PATCH /api/admin-comments`: Cập nhật trạng thái ẩn/hiện hoặc trạng thái kiểm duyệt (is_hidden, status) của bình luận (atomic RPC); không cho phép sửa đổi nội dung bình luận.
   - `DELETE /api/admin-comments`: Xóa bình luận vi phạm (atomic RPC).
   - `GET /api/admin-reports`: Danh sách báo sai phân trang theo trạng thái và loại phản ánh.
   - `PATCH /api/admin-reports`: Xử lý phản ánh báo sai (atomic RPC).

## Quy trình đóng góp địa điểm

Luồng đóng góp khuyến nghị:

```text
Google Form → Google Sheets → Apps Script → /api/import-place → Supabase places draft → Admin duyệt → Trang chính
```

Thiết lập Apps Script:

1. Vào Google Sheet nhận form responses.
2. Mở Extensions → Apps Script.
3. Copy nội dung `google-apps-script/import-place.gs` vào script editor.
4. Đổi `IMPORT_SECRET` trong script cho khớp biến môi trường Vercel.
5. Chạy `testImportPlace()` để test thủ công.
6. Tạo trigger cho hàm `onFormSubmit`: event source `From spreadsheet`, event type `On form submit`.
7. Gửi thử Google Form, rồi vào admin tab `Địa điểm` lọc `Nháp` để duyệt.

## PWA và cache

`service-worker.js` precache app shell, module JS, fallback JSON và ảnh local. Khi thay đổi file cache quan trọng, nên tăng `CACHE_NAME` để trình duyệt nhận bản mới.

Kiểm tra PWA:

1. Chạy app qua HTTP server.
2. Mở Chrome DevTools > Application.
3. Kiểm tra Manifest và Service Worker.
4. Bật Network > Offline để kiểm tra offline mode.

## Kiểm thử thủ công

Sau thay đổi frontend, nên kiểm tra:

- Trang chủ load được dữ liệu từ Supabase `places` hoặc fallback JSON.
- Search/filter hoạt động.
- Các section Featured, Latest, Food, Cafe, Travel, Service hiển thị đúng.
- Smart suggestions cuộn tới section đúng.
- Modal địa điểm mở/đóng đúng và hiển thị đủ thông tin.
- Bản đồ Leaflet hiển thị marker đúng.
- Share buttons và copy link hoạt động.
- Gửi bình luận, hiển thị rating trung bình và danh sách bình luận.
- Admin có thể list/sửa trạng thái địa điểm và ẩn/hiện/xoá bình luận.
- Dark mode và responsive mobile.
- Service worker/PWA không gây lỗi console.

## Deploy

Repo có `vercel.json` định tuyến cho Vercel serverless functions và ưu tiên `/api/*` trước SPA fallback.

### Biến môi trường bắt buộc trên Vercel:

Chỉ cần cấu hình **2 biến môi trường** duy nhất trên Vercel Project Settings:

1. `SUPABASE_URL`: URL của dự án Supabase (ví dụ: `https://foyraoimhksfvlxndwxr.supabase.co`).
2. `SUPABASE_SERVICE_ROLE_KEY`: Khóa dịch vụ đặc quyền máy chủ của Supabase (dùng trong môi trường Node.js serverless để xác thực JWT token và thực thi RPC kiểm toán).

*(Lưu ý: `SUPABASE_ANON_KEY` là khóa công khai phía client đã tích hợp sẵn trong frontend tĩnh; production đã vô hiệu hóa ADMIN_SECRET (legacy chỉ còn trong test/non-production); `IMPORT_SECRET` chỉ cấu hình nếu có sử dụng webhook Google Apps Script).*

## Ghi chú bảo trì

- Tuyệt đối không commit Supabase Service Role Key, Database Password hoặc Admin Access Token vào kho mã nguồn.
- Supabase Anon Key chỉ được cấp quyền đọc giới hạn thông qua Row Level Security (RLS).
- Mọi thay đổi schema CSDL phải tuân thủ tính Idempotent và có kịch bản Rollback tương ứng:
  - `supabase/places.sql`: Thiết lập bảng địa điểm và chính sách đọc công khai.
  - `supabase/place_comments.sql`: Thiết lập bảng bình luận, ràng buộc độ dài và trigger cập nhật.
  - `supabase/g7_place_reports.sql`: Thiết lập bảng báo sai và chính sách RLS riêng cho service_role.
  - `supabase/g8_admin.sql`: Thiết lập RBAC `admin_users`, `admin_audit_logs` và 6 hàm RPC nguyên tử.
  - `supabase/g8_admin_rollback.sql`: Kịch bản hoàn tác an toàn cho hệ thống quản trị G8.
- Trước khi release phiên bản mới, bắt buộc chạy kiểm toán chất lượng:
  - `npm run check:gate`: Đảm bảo 16/16 test suites pass và mã build sạch.
  - `npm run test:g8:live`: Kiểm toán tính sẵn sàng trên Vercel & Supabase production.
  - `npm run audit:g9`: Kiểm toán đường cơ sở dữ liệu production chỉ đọc.
