# G8 — Hệ thống quản trị nội dung và vận hành

## 1. Mục tiêu

Nâng cấp `admin.html` hiện có thành trang quản trị production an toàn, dùng được trên desktop và mobile để:

- duyệt và chỉnh sửa địa điểm;
- kiểm duyệt bình luận;
- xử lý báo sai thông tin trong `place_reports`;
- lưu nhật ký mọi thao tác quản trị;
- không đưa `ADMIN_SECRET` hoặc `SUPABASE_SERVICE_ROLE_KEY` vào trình duyệt.

G8 chỉ được đóng khi kiểm thử local, browser, security và live audit đều đạt.

## 2. Hiện trạng cần kế thừa

- `admin.html` đã có giao diện quản lý địa điểm và bình luận cơ bản.
- `api/admin-places.js` đã hỗ trợ GET, POST, PATCH, DELETE.
- `api/admin-comments.js` đã hỗ trợ GET, PATCH, DELETE.
- `public.place_reports` đã tồn tại từ G7.
- Backend đang xác thực bằng header `x-admin-secret`; giao diện lưu secret trong `sessionStorage`.
- `admin.html` còn tải Tailwind và Font Awesome qua CDN.
- Chưa có API quản trị `place_reports`, audit log, Supabase Auth cho admin hoặc test gate G8.

Phải tái sử dụng contract dữ liệu, validation, RLS và quy trình build hiện có. Không làm giảm các bảo vệ đã đạt từ G0–G7.

## 3. Phạm vi triển khai bắt buộc

### G8.0 — Baseline và thiết kế migration

1. Tạo nhánh hoặc commit checkpoint trước khi sửa.
2. Chạy và lưu kết quả:

   ```bash
   npm run check:gate
   npm run build
   ```

3. Lập migration idempotent `supabase/g8_admin.sql` và rollback tương ứng.
4. Không chạy SQL production, push hoặc deploy khi chưa hoàn tất code và test local.

### G8.1 — Supabase Auth và phân quyền admin

1. Thay cơ chế nhập `ADMIN_SECRET` trên giao diện bằng Supabase Auth email/password.
2. Tạo bảng allowlist `public.admin_users` tối thiểu gồm:
   - `user_id uuid primary key references auth.users(id)`;
   - `role text` với các giá trị `admin`, `editor`, `moderator`;
   - `is_active boolean`;
   - `created_at`, `updated_at`.
3. Bật RLS; anon và user thường không được đọc hoặc sửa allowlist.
4. Tạo middleware dùng chung cho API admin:
   - nhận `Authorization: Bearer <access_token>`;
   - xác minh JWT hợp lệ và chưa hết hạn;
   - xác minh người dùng có trong allowlist và đang hoạt động;
   - kiểm tra role theo từng hành động;
   - trả lỗi có cấu trúc `401 UNAUTHENTICATED` hoặc `403 FORBIDDEN`.
5. Mọi truy vấn cần service role chỉ chạy trong serverless API.
6. Không ghi access token, refresh token, email hoặc PII vào log/telemetry.
7. Không lưu token trong `localStorage`. Ưu tiên phiên cookie HttpOnly/SameSite/secure nếu kiến trúc phù hợp; nếu dùng token phía client thì chỉ giữ phạm vi phiên và phải có logout, refresh, hết hạn rõ ràng.
8. Gỡ hoàn toàn trường nhập secret và header `x-admin-secret` khỏi luồng UI production. Có thể giữ cơ chế cũ sau feature flag chỉ cho local test trong thời gian chuyển đổi, nhưng production phải fail-closed.

### G8.2 — API quản trị thống nhất và audit log

1. Tách các hàm dùng chung: auth, JSON response, body limit, Supabase request, validation.
2. Bổ sung `api/admin-reports.js`:
   - GET: phân trang, tìm kiếm, lọc `pending/reviewed/resolved/dismissed`;
   - PATCH: đổi trạng thái, cập nhật `admin_notes`, `reviewed_at`;
   - không cho client sửa `id`, `client_report_id`, IP hoặc thời gian tạo.
3. Tạo bảng `public.admin_audit_logs`:
   - actor user ID, role, action, entity type, entity ID;
   - before/after dạng JSONB đã loại PII không cần thiết;
   - timestamp và request correlation ID;
   - append-only đối với API thông thường.
4. Ghi audit cho các thao tác tạo/sửa/ẩn/duyệt/xóa địa điểm, bình luận và báo sai.
5. Các thao tác nguy hiểm cần xác nhận rõ trên UI. Ưu tiên soft-delete/archived; không xóa cứng địa điểm mặc định.
6. Hỗ trợ pagination thật ở server, giới hạn tối đa mỗi trang và sort ổn định.
7. Chặn mass assignment, payload quá lớn, ID sai, status sai và JSON lỗi.
8. Không trả IP hoặc liên hệ người báo sai cho role không cần xem.

### G8.3 — Giao diện quản trị production

1. Chia mã khỏi HTML thành các file rõ ràng, ví dụ:
   - `admin.html`;
   - `js/admin.js`;
   - `js/admin-auth.js`;
   - CSS dùng asset local.
2. Loại bỏ toàn bộ CDN thiết yếu trong `admin.html`.
3. Tạo màn hình đăng nhập, trạng thái loading, sai mật khẩu, hết phiên và logout.
4. Dashboard có số lượng cần xử lý:
   - địa điểm draft;
   - bình luận pending/hidden;
   - báo sai pending.
5. Ba khu vực quản trị:
   - **Địa điểm:** tìm kiếm, lọc, tạo, sửa, preview, duyệt, ẩn, lưu trữ;
   - **Bình luận:** lọc theo trạng thái, duyệt, ẩn, từ chối, xem ảnh an toàn;
   - **Báo sai:** xem nội dung, mở địa điểm liên quan, ghi chú và xử lý trạng thái.
6. Validation trường địa điểm phải dùng cùng quy tắc public contract: slug, category, GPS, giờ, giá, ảnh, contact.
7. Preview địa điểm trước khi approved; cảnh báo trường thiếu và link Maps/GPS không hợp lệ.
8. Chống XSS: không render dữ liệu người dùng bằng HTML chưa escape; URL ảnh phải qua allowlist giao thức.
9. Tất cả touch target tối thiểu 44×44 px, không tràn ngang ở 360/390/414 px, focus rõ, keyboard dùng được, dialog có ARIA và focus trap.
10. Có dark mode hoặc ít nhất bảo đảm tương phản WCAG AA trong giao diện admin.

### G8.4 — Kiểm thử tự động

Thêm các lệnh:

```json
"test:g8": "node scripts/test-g8-admin.js",
"test:g8:browser": "node --experimental-websocket scripts/verify-g8-browser.cjs",
"test:g8:live": "node scripts/verify-g8-live.js"
```

`test:g8` tối thiểu phải kiểm tra:

1. Không token → 401.
2. Token hợp lệ nhưng không có allowlist → 403.
3. Moderator không được sửa/xóa địa điểm.
4. Editor được sửa draft nhưng không quản lý admin.
5. Admin thực hiện được vòng đời đầy đủ.
6. Chặn token hết hạn, token giả và role bị vô hiệu hóa.
7. Chặn mass assignment và payload vượt giới hạn.
8. Report status transition hợp lệ; transition sai bị chặn.
9. Audit log được tạo đúng một lần và không chứa secret/token.
10. XSS từ tên, bình luận, report và URL ảnh không thể thực thi.
11. Pagination/filter/search trả dữ liệu ổn định.
12. API fail-closed khi Supabase/Auth không khả dụng.

`test:g8:browser` tối thiểu phải kiểm tra:

1. Login/logout/hết phiên.
2. Dashboard và ba tab dữ liệu.
3. Duyệt một draft và xem preview.
4. Duyệt/ẩn một bình luận.
5. Xử lý một `place_report`.
6. Loading, empty state, error state và retry.
7. Mobile 360/390/414 px, touch targets, keyboard, focus và dark mode.
8. Không request tới CDN thiết yếu; không rò token trong URL, DOM hoặc console.

`test:g8:live` phải dùng bản ghi audit riêng, kiểm chứng Vercel + Supabase thật, sau đó dọn sạch mọi bản ghi test. Không in secret/token ra terminal.

### G8.5 — Release và vận hành

1. Cập nhật `check:gate` để chứa `test:g8` và `test:g8:browser`.
2. Cập nhật build để đóng gói đầy đủ asset admin local.
3. Cập nhật `docs/release-runbook.md` với:
   - cách tạo admin đầu tiên;
   - cách khóa tài khoản;
   - reset mật khẩu;
   - backup và rollback migration G8;
   - xử lý khi Auth/Supabase gián đoạn.
4. Chỉ push/deploy sau khi local gate đạt.
5. Sau deploy, chạy live audit. G8 chỉ đóng khi live audit đạt và cleanup được xác nhận.

## 4. Ngoài phạm vi G8

- Không làm ứng dụng đa tenant.
- Không xây hệ thống thanh toán.
- Không thêm AI moderation tự động.
- Không thay đổi lớn giao diện public ngoài phần cần thiết để preview/đồng bộ dữ liệu.
- Không nhập hàng loạt địa điểm thật trong giai đoạn xây admin.

## 5. Điều kiện nghiệm thu

G8 đạt khi đồng thời thỏa mãn:

- không còn nhập hoặc lưu `ADMIN_SECRET` trong UI production;
- Supabase Auth + allowlist + role enforcement hoạt động thật;
- quản lý được places, comments và place reports;
- mọi mutation có audit log;
- không CDN thiết yếu, không XSS, không lộ token/PII;
- responsive và accessibility đạt;
- toàn bộ G0–G7 không hồi quy;
- `test:g8`, `test:g8:browser`, `check:gate`, `build` đều pass;
- migration production được backup trước khi chạy;
- `test:g8:live` pass và xóa sạch dữ liệu kiểm toán.

## 6. Cách báo cáo sau mỗi mốc

Sau từng mốc G8.0–G8.5, cập nhật `walkthrough.md` với:

- file đã thay đổi;
- hành vi trước/sau;
- kết quả test và số ca pass;
- ảnh desktop/mobile liên quan;
- migration nào cần người dùng chạy thủ công;
- rủi ro hoặc việc còn lại;
- Git status và commit hiện tại.

Không tuyên bố hoàn thành dựa trên mock nếu chưa chạy live audit. Không tự ý chạy migration production hoặc thay đổi tài khoản admin mà chưa đưa script cụ thể để người dùng xem trước.
