# Sổ Tay Vận Hành Phát Hành: ViVuTraVinh Release & Operations Runbook

Tài liệu hướng dẫn phát hành chính thức, kiểm tra chất lượng trước triển khai (Pre-deploy Audit), quy trình di chuyển cơ sở dữ liệu (Migration G8), khởi tạo và quản trị tài khoản quản trị viên (Admin RBAC), xử lý sự cố (Incident Troubleshooting), và hoàn tác khẩn cấp (Emergency Rollback) cho hệ thống ViVuTraVinh (Phiên bản v2.1.0).

---

## 1. Quy Trình Trước Triển Khai (Pre-Deploy Verification)

Trước khi kích hoạt phiên bản mới lên môi trường Production (Vercel & Supabase), đội ngũ kỹ thuật phải thực hiện lần lượt các bước kiểm tra bắt buộc:

### 1.1. Kiểm tra trạng thái Git & Commit Checkpoint
- Kiểm tra working tree sạch và không có thay đổi chưa theo dõi:
  ```bash
  git status
  ```
- Xác nhận toàn bộ tính năng và bài kiểm thử đã có checkpoint commit cục bộ rõ ràng:
  ```bash
  git log -n 5 --oneline
  ```
- Tuyệt đối **không push** mã nguồn lên GitHub trước khi hoàn thành toàn bộ cổng kiểm thử cục bộ và sao lưu cơ sở dữ liệu.

### 1.2. Kiểm tra toàn bộ cổng chất lượng (Check Gate)
Chạy toàn bộ 16 bộ kiểm thử tích hợp:
```bash
npm run check:gate
```
*Yêu cầu bắt buộc:*
- Đạt 100% (16/16 test suites PASS), bao gồm kiểm thử chuyên sâu G8 (`npm run test:g8`) và kiểm thử trình duyệt CDP (`npm run test:g8:browser`).
- **Lưu ý:** Lệnh `test:g8:live` **KHÔNG** nằm trong `check:gate` mặc định vì kịch bản này yêu cầu biến môi trường bí mật và thực thi tạo fixture trên hạ tầng Production thật.

### 1.3. Kiểm tra cú pháp và định dạng mã nguồn (Syntax & Whitespace Check)
```bash
npm run check
git diff --check
```
*Yêu cầu:*
- Không có lỗi cú pháp trên toàn bộ file JavaScript được liệt kê trong npm run check.
- Không có trailing whitespace hoặc lỗi định dạng dòng.

### 1.4. Đóng gói bản phân phối tĩnh (Production Build)
```bash
npm run build
```
*Yêu cầu xác nhận trong thư mục `dist/`:*
- `dist/index.html` độc lập, 100% offline-first, không CDN.
- `dist/admin.html` cho bảng điều khiển quản trị.
- `dist/js/admin.js` và `dist/js/admin-auth.js` cho logic điều hành và xác thực.
- `dist/css/tailwind.css` biên dịch tối ưu (không phụ thuộc Tailwind Play CDN).
- `dist/vendor/fonts/material-symbols.css` và phông chữ woff2 cục bộ.
- `dist/version.json` ghi nhận chính xác phiên bản `v2.1.0`.

### 1.5. Quy Trình Sao Lưu Dữ Liệu Supabase Trước Migration (Database Backup Procedure)
Tuyệt đối không chạy migration DDL trên Production mà không có bản sao lưu hoàn chỉnh.

#### Phương án A: Sao lưu tự động qua Supabase Dashboard (UI)
1. Truy cập Supabase Dashboard: `https://supabase.com/dashboard/project/foyraoimhksfvlxndwxr`.
2. Chọn menu **Database** > **Backups** (hoặc Project Settings > Backups).
3. Kiểm tra bản sao lưu gần nhất (Daily Backup) ở trạng thái `Completed`.

#### Phương án B: Sao lưu thủ công qua PostgreSQL CLI Dump (Khuyến nghị cao trước migration lớn)
Thực hiện lệnh xuất toàn bộ schema và dữ liệu từ máy quản trị:
```bash
pg_dump "postgres://postgres.[PROJECT_REF]:[DB_PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" \
  --schema=public \
  --clean --if-exists \
  --file="backup_vivutravinh_pre_g8_$(date +%Y%m%d_%H%M%S).sql"
```

#### Cách xác nhận bản sao lưu sử dụng được:
1. **Kiểm tra kích thước file:** Dung lượng file sao lưu phải `> 0 byte` (thông thường từ vài trăm KB đến vài MB tùy lượng dữ liệu hiện hữu).
2. **Kiểm tra tính toàn vẹn cấu trúc file:**
   ```bash
   head -n 25 backup_vivutravinh_pre_g8_*.sql
   tail -n 25 backup_vivutravinh_pre_g8_*.sql
   ```
   Xác nhận có header PostgreSQL hợp lệ, định nghĩa các bảng `places`, `place_comments`, `place_reports` và dòng kết thúc `PostgreSQL database dump complete`.
3. **Thử nghiệm khôi phục (nếu có staging):** Chạy thử file dump trên database local hoặc staging để đảm bảo không phát sinh lỗi cú pháp hay thiếu khóa ngoại.

---

## 2. Quy Trình Di Chuyển Cơ Sở Dữ Liệu G8 (G8 Database Migration)

### 2.1. Thứ tự thực thi `supabase/g8_admin.sql`
Mở **Supabase Dashboard > SQL Editor > New query**, dán toàn bộ nội dung file `supabase/g8_admin.sql` và bấm **Run**.
Kịch bản migration thực hiện tuần tự:
1. **Tạo bảng `public.admin_users`**: Lưu trữ danh sách allowlist tài khoản quản trị và phân quyền (`admin`, `editor`, `moderator`).
2. **Kích hoạt trigger `trg_set_admin_users_updated_at`**: Tự động cập nhật thời gian sửa đổi `updated_at`.
3. **Tạo bảng `public.admin_audit_logs`**: Ghi nhận vết kiểm toán với đủ 12 cột chuẩn hóa (`id`, `actor_id`, `actor_email`, `actor_role`, `action`, `entity_type`, `entity_id`, `payload_before`, `payload_after`, `ip`, `correlation_id`, `created_at`).
4. **Thiết lập bảo mật Row Level Security (RLS)**: Khóa toàn bộ quyền truy cập trực tiếp từ công chúng (`anon`/`authenticated`) vào 2 bảng trên; chỉ cho phép `service_role` và các RPC hàm định danh thực thi.
5. **Khởi tạo 6 hàm RPC giao dịch nguyên tử (Atomic PostgreSQL Functions)**:
   - `public.admin_create_place_atomic`
   - `public.admin_update_place_atomic`
   - `public.admin_delete_place_atomic`
   - `public.admin_update_comment_atomic`
   - `public.admin_delete_comment_atomic`
   - `public.admin_update_report_atomic`

### 2.2. Kiểm tra xác nhận Migration hoàn tất
Chạy câu lệnh kiểm tra sau trong SQL Editor:
```sql
-- 1. Kiểm tra 2 bảng mới
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('admin_users', 'admin_audit_logs');

-- 2. Kiểm tra đủ 12 cột bảng admin_audit_logs
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'admin_audit_logs'
order by ordinal_position;

-- 3. Kiểm tra đủ 6 RPC functions
select routine_name from information_schema.routines
where routine_schema = 'public' and routine_name in (
  'admin_create_place_atomic',
  'admin_update_place_atomic',
  'admin_delete_place_atomic',
  'admin_update_comment_atomic',
  'admin_delete_comment_atomic',
  'admin_update_report_atomic'
);
```
*Yêu cầu:* Kết quả trả về đủ 2 bảng, đủ 12 cột kiểm toán, và đủ 6 hàm RPC.

### 2.3. Lưu ý quan trọng về PostgREST Schema Cache
Sau khi nạp các bảng hoặc RPC mới vào PostgreSQL, lớp API REST của PostgREST có thể chưa cập nhật cache ngay lập tức, dẫn đến lỗi HTTP 404 hoặc `PGRST202: Could not find the function in the schema cache`.
**Bắt buộc thực hiện một trong hai thao tác sau để tải lại cache:**
- **Cách 1 (Khuyến nghị thực hiện ngay trong SQL Editor):**
  ```sql
  NOTIFY pgrst, 'reload schema';
  ```
- **Cách 2:** Trên Supabase Dashboard, vào **Project Settings > API > Schema Cache** và bấm **Reload schema cache**.

### 2.4. Quy trình Hoàn tác Migration (Rollback Procedure)
Nếu quá trình migration gặp xung đột không thể khắc phục:
1. Mở file `supabase/g8_admin_rollback.sql`.
2. Dán và chạy trong Supabase SQL Editor.
3. Kịch bản sẽ gỡ bỏ 6 RPC, xóa bảng `admin_audit_logs` và xóa bảng `admin_users`.
4. Chạy `NOTIFY pgrst, 'reload schema';` để PostgREST cập nhật lại trạng thái trước migration.

> [!WARNING]
> **ĐIỀU KIỆN & RỦI RO KHI ROLLBACK:**
> - Chỉ được thực thi rollback bằng `g8_admin_rollback.sql` trong cửa sổ bảo trì triển khai (Maintenance Window), trước khi hệ thống ghi nhận các audit log vận hành thực tế.
> - **Rủi ro:** Lệnh `DROP TABLE ... CASCADE` sẽ xóa vĩnh viễn toàn bộ dữ liệu lịch sử kiểm toán trong `admin_audit_logs` và danh sách phân quyền trong `admin_users`. Nếu đã có dữ liệu vận hành, bắt buộc phải sao lưu `admin_audit_logs` ra file riêng trước khi rollback.

---

## 3. Khởi Tạo Quản Trị Viên Đầu Tiên (First Admin Provisioning)

### 3.1. Tạo người dùng trong Supabase Auth
1. Truy cập Supabase Dashboard: **Authentication > Users**.
2. Bấm nút **Add User** > Chọn **Create User**.
3. Điền email của quản trị viên (ví dụ: `admin@vivutravinh.vn`) và thiết lập mật khẩu mạnh (tối thiểu 12 ký tự gồm chữ hoa, chữ thường, số và ký tự đặc biệt).
4. Bật tùy chọn **Auto Confirm User** (để tài khoản có thể đăng nhập ngay mà không cần xác thực email qua SMTP).
5. Bấm **Create User**.

### 3.2. Lấy đúng `auth.users.id` và gán quyền `admin`
1. Tại danh sách **Authentication > Users**, tìm user vừa tạo và sao chép mã định danh **User UID** (dạng chuỗi UUID, ví dụ: `d290f1ee-6c54-4b01-90e6-d701748f0851`).
2. Mở **SQL Editor** và chạy câu lệnh sau để đưa user vào allowlist quản trị viên:
   ```sql
   insert into public.admin_users (user_id, email, role, is_active)
   values ('<USER_UID>', '<ADMIN_EMAIL>', 'admin', true)
   on conflict (user_id) do update
   set email = excluded.email,
       role = excluded.role,
       is_active = excluded.is_active;
   ```
3. Xác minh tài khoản đã sẵn sàng:
   ```sql
   select user_id, email, role, is_active from public.admin_users where email = '<ADMIN_EMAIL>';
   ```
   Xác nhận `role = 'admin'` và `is_active = true`.

> [!CAUTION]
> **NGUYÊN TẮC AN TOÀN TUYỆT ĐỐI:**
> Tuyệt đối **KHÔNG BAO GIỜ** nhúng hoặc chia sẻ `SUPABASE_SERVICE_ROLE_KEY` trong giao diện người dùng, mã nguồn frontend, hoặc gửi qua chat/email.
> Giao diện `admin.html` (qua `js/admin-auth.js`) chỉ sử dụng Supabase Anon Key và xác thực người dùng bằng Bearer Access Token sinh ra từ lời gọi trực tiếp Supabase Auth REST password grant (`/auth/v1/token?grant_type=password`).

---

## 4. Vận Hành & Quản Trị Tài Khoản (User Operations & RBAC)

### 4.1. Tạo tài khoản Editor hoặc Moderator
1. Tạo tài khoản trong Supabase Auth (**Authentication > Users > Add User**).
2. Lấy `UID` của user và thêm vào `public.admin_users`:
   ```sql
   -- Thêm Editor (Biên tập viên: được tạo/sửa địa điểm draft, không được duyệt/xóa)
   insert into public.admin_users (user_id, email, role, is_active)
   values ('<EDITOR_UID>', 'editor@vivutravinh.vn', 'editor', true);

   -- Thêm Moderator (Kiểm duyệt viên: kiểm duyệt bình luận, xử lý báo sai)
   insert into public.admin_users (user_id, email, role, is_active)
   values ('<MODERATOR_UID>', 'moderator@vivutravinh.vn', 'moderator', true);
   ```

### 4.2. Khóa và mở khóa tài khoản (Deactivation & Activation)
Khi cần đình chỉ quyền truy cập của một nhân sự:
```sql
-- Khóa tài khoản ngay lập tức (API trả về HTTP 403 ACCOUNT_DISABLED)
update public.admin_users set is_active = false where email = 'user@vivutravinh.vn';

-- Mở khóa lại tài khoản
update public.admin_users set is_active = true where email = 'user@vivutravinh.vn';
```

### 4.3. Thay đổi vai trò (Role Modification)
```sql
-- Nâng quyền từ editor lên admin
update public.admin_users set role = 'admin' where email = 'user@vivutravinh.vn';

-- Chuyển quyền sang moderator
update public.admin_users set role = 'moderator' where email = 'user@vivutravinh.vn';
```

### 4.4. Đặt lại mật khẩu (Password Reset)
- **Cách 1:** Quản trị viên vào Supabase Dashboard > **Authentication > Users** > Tìm user > Nhấp menu ba chấm > Chọn **Send Password Recovery**. Người dùng sẽ nhận email chứa liên kết đặt lại mật khẩu.
- **Cách 2:** Người quản trị có thể trực tiếp đặt mật khẩu mới cho user tại Supabase Dashboard > **Users > Edit User > Set new password**.

### 4.5. Thu hồi phiên đăng nhập khẩn cấp (Session Revocation)
Khi phát hiện nghi vấn lộ thông tin đăng nhập:
1. Khóa tài khoản trong database:
   ```sql
   update public.admin_users set is_active = false where email = 'compromised@vivutravinh.vn';
   ```
2. Tại Supabase Dashboard > **Authentication > Users**, chọn user bị xâm nhập và bấm **Sign out user** (hoặc xóa refresh token của user) để vô hiệu hóa phiên làm việc ngay lập tức.

---

## 5. Hướng Dẫn Xử Lý Sự Cố (Troubleshooting & Incident Runbook)

### 5.1. Supabase Auth gián đoạn
- **Dấu hiệu:** API quản trị trả về HTTP 503 với mã lỗi `AUTH_UNAVAILABLE` hoặc `fetch failed`, giao diện hiển thị thông báo "Dịch vụ xác thực tạm thời không khả dụng."
- **Hành vi hệ thống:** Đối chiếu trực tiếp với `api/_admin-auth.js`, hệ thống tuân thủ nghiêm ngặt nguyên tắc **Fail-closed**, trả về HTTP 503 `AUTH_UNAVAILABLE` khi không thể kết nối tới máy chủ Supabase Auth hoặc mạng bị ngắt.
- **Cách xử lý:**
  1. Kiểm tra trạng thái dịch vụ tại `https://status.supabase.com`.
  2. Tuyệt đối không tắt lớp xác thực hay kích hoạt bypass token.
  3. Chờ dịch vụ Auth hồi phục; phiên làm việc của người dùng trên `admin.html` sẽ tự động kích hoạt retry khi người dùng thao tác lại.

### 5.2. Database hoặc PostgREST gián đoạn
- **Dấu hiệu:** API quản trị trả về HTTP 500 với mã lỗi `DATABASE_ERROR`, các thao tác lưu trữ, kiểm duyệt bị đình trệ.
- **Hành vi hệ thống:** Đối chiếu trực tiếp với `api/_admin-auth.js`, khi truy vấn bảng `admin_users` thất bại, API trả về HTTP 500 `DATABASE_ERROR` ("Không thể xác minh quyền quản trị viên.").
- **Cách xử lý:**
  1. Truy cập Supabase Dashboard > **Reports > Database** kiểm tra mức sử dụng CPU, RAM và số lượng Connection Pool.
  2. Nếu vượt ngưỡng kết nối, kiểm tra các truy vấn treo trong SQL Editor:
     ```sql
     select pid, query, state, age(clock_timestamp(), query_start)
     from pg_stat_activity
     where state != 'idle' and query not like '%pg_stat_activity%';
     ```
  3. Hủy bỏ truy vấn nghẽn bằng `select pg_terminate_backend(<PID>);`.

### 5.3. Migration thiếu hoặc Schema Cache chưa cập nhật
- **Dấu hiệu:** Gửi yêu cầu qua API nhận phản hồi `PGRST202 Could not find the function...` hoặc thiếu bảng `admin_audit_logs`.
- **Cách xử lý:**
  1. Chạy lệnh:
     ```sql
     NOTIFY pgrst, 'reload schema';
     ```
  2. Kiểm tra lại sự tồn tại của cả 6 RPC trong Schema Viewer.
  3. Nếu thiếu hàm nào, chạy lại đoạn định nghĩa của hàm đó từ `supabase/g8_admin.sql`.

### 5.4. Vercel thiếu biến môi trường
- **Dấu hiệu:** Endpoint `/api/admin-*` trả về HTTP 500 kèm mã `CONFIG_ERROR: Thiếu biến môi trường SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY`.
- **Danh sách biến môi trường bắt buộc trên Vercel:**
  - `SUPABASE_URL`: Đường dẫn dự án Supabase (`https://<project-ref>.supabase.co`).
  - `SUPABASE_SERVICE_ROLE_KEY`: Khóa bí mật máy chủ Supabase.
- **Ghi chú:**
  Supabase anon key là khóa công khai phía client và hiện được cấu hình trong mã frontend; `SUPABASE_ANON_KEY` trên Vercel chưa được runtime sử dụng.
- **Cách xử lý:**
  1. Truy cập Vercel Dashboard > Dự án `vivutravinh` > **Settings > Environment Variables**.
  2. Kiểm tra và bổ sung đầy đủ 2 biến bắt buộc trên cho môi trường **Production**, **Preview**, và **Development**.
  3. Vào **Deployments** > Bấm **Redeploy** bản deploy gần nhất để nhận biến mới.

### 5.5. Live Audit hoặc Cleanup thất bại & Dọn dẹp Fixture an toàn
- **Dấu hiệu:** Lệnh `npm run test:g8:live` báo lỗi `cleanupFailed = true` hoặc mạng bị ngắt kết nối giữa chừng khi kiểm toán trực tiếp.
- **Cách xử lý an toàn:**
  Toàn bộ fixture do kịch bản kiểm toán `scripts/verify-g8-live.js` sinh ra đều có tiền tố nhận diện chuẩn xác:
  - `places.slug like 'audit-g8-live-place-%'`
  - `place_comments.client_review_id like 'audit_rev_%'`
  - `place_reports.client_report_id like 'audit_rep_%'`
  - `admin_audit_logs.correlation_id like 'audit_g8_live_%'`

  > [!IMPORTANT]
  > Chỉ chạy lệnh cleanup thủ công này sau khi xác nhận đúng 4 prefix kiểm thử trên (`audit-g8-live-place-%`, `audit_rev_%`, `audit_rep_%`, `audit_g8_live_%`) để đảm bảo tuyệt đối không xóa nhầm dữ liệu thực tế của người dùng.

  Mở Supabase SQL Editor và chạy đoạn lệnh sau để làm sạch 100% dữ liệu thử nghiệm:
  ```sql
  -- 1. Xóa địa điểm kiểm toán
  delete from public.places where slug like 'audit-g8-live-place-%';

  -- 2. Xóa bình luận kiểm toán
  delete from public.place_comments where client_review_id like 'audit_rev_%';

  -- 3. Xóa báo sai kiểm toán
  delete from public.place_reports where client_report_id like 'audit_rep_%';

  -- 4. Xóa nhật ký kiểm toán sinh ra từ live audit
  delete from public.admin_audit_logs where correlation_id like 'audit_g8_live_%';
  ```
  Sau khi chạy xong, xác nhận đủ 4 câu truy vấn đều trả về 0 dòng còn sót:
  ```sql
  select count(*) from public.places where slug like 'audit-g8-live-place-%';
  select count(*) from public.place_comments where client_review_id like 'audit_rev_%';
  select count(*) from public.place_reports where client_report_id like 'audit_rep_%';
  select count(*) from public.admin_audit_logs where correlation_id like 'audit_g8_live_%';
  ```

---

## 6. Quy Trình Triển Khai Phát Hành (Release Deployment Sequence)

Thực hiện chuẩn xác theo chuỗi tuần tự sau:

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Quản Trị Viên
    participant Supa as Supabase Production
    participant Git as GitHub Repo
    participant Vercel as Vercel Production
    participant Live as Live Audit (Local)

    Dev->>Supa: 1. Sao lưu CSDL (Backup Database)
    Dev->>Supa: 2. Chạy Migration (supabase/g8_admin.sql) & Reload Cache
    Dev->>Supa: 3. Tạo tài khoản Admin đầu tiên & gán quyền vào admin_users
    Dev->>Git: 4. Push commit lên nhánh main
    Git->>Vercel: 5. Kích hoạt tự động Build & Deploy Production
    Dev->>Vercel: 6. Khói thử nghiệm (Smoke Test) giao diện /admin.html
    Dev->>Live: 7. Chạy Live Audit (npm run test:g8:live)
    Live-->>Dev: Kết quả: 100% PASS & Dọn dẹp 0 dòng
```

### Bước 1: Sao lưu cơ sở dữ liệu
Thực hiện sao lưu theo Mục 1.5.

### Bước 2: Chạy Migration CSDL
Chạy file `supabase/g8_admin.sql` trên Supabase SQL Editor và chạy `NOTIFY pgrst, 'reload schema';`.

### Bước 3: Tạo Quản trị viên đầu tiên
Tạo tài khoản theo Mục 3 để có quyền đăng nhập hệ thống.

### Bước 4: Đẩy mã nguồn và Triển khai Vercel
1. **Kiểm tra checklist biến môi trường trên Vercel:**
   - Truy cập **Vercel Dashboard > Settings > Environment Variables**.
   - Xác nhận 2 biến môi trường bắt buộc đã được cấu hình:
     - `SUPABASE_URL`
     - `SUPABASE_SERVICE_ROLE_KEY`
   - *Ghi chú:* Supabase anon key là khóa công khai phía client và hiện được cấu hình trong mã frontend; `SUPABASE_ANON_KEY` trên Vercel chưa được runtime sử dụng.
2. **Đẩy các commit checkpoint lên nhánh chính:**
```bash
# Đẩy các commit checkpoint lên nhánh chính
git push origin main
```
Theo dõi tiến trình build trên Vercel Dashboard. Xác nhận build hoàn tất thành công.

### Bước 5: Smoke Test giao diện Admin
1. Truy cập `https://vivutravinh.id.vn/admin.html` (URL chính thức).
   *(Lưu ý: Có thể sử dụng `https://vivutravinh.vercel.app/admin.html` làm fallback deployment URL kiểm tra kỹ thuật trực tiếp trên Vercel, nhưng không phải canonical production URL).*
2. Kiểm tra giao diện hiển thị màn hình đăng nhập sạch sẽ, không tải CDN bên ngoài.
3. Đăng nhập bằng tài khoản admin vừa tạo: kiểm tra nạp dữ liệu thống kê Dashboard, danh sách địa điểm, bình luận và báo sai.
4. Kiểm tra bật/tắt chế độ tối (Dark Mode) và đăng xuất.

### Bước 6: Kiểm toán trực tiếp (Post-Deploy Live Audit)
Sau khi deploy thành công, xuất access token của tài khoản admin và khóa service role:
```bash
export SUPABASE_SERVICE_ROLE_KEY="<supabase_service_role_key>"
export ADMIN_ACCESS_TOKEN="<admin_access_token_vừa_đăng_nhập>"
npm run test:g8:live
```
*Điều kiện hoàn tất G8: Lệnh `test:g8:live` đạt 100% PASS và xác nhận trạng thái `TRẠNG THÁI CLEANUP: HOÀN TẤT & ĐÃ XÁC MINH 0 DÒNG ✅`.*

---

## 7. Quy Trình Hoàn Tác Khẩn Cấp (Instant Rollback Procedure)

Khi phát hiện lỗi nghiêm trọng sau khi triển khai lên Production (HTTP 500 diện rộng, lỗi RLS, hỏng giao diện di động):

### Bước 1: Hoàn tác ứng dụng trên Vercel (Thời gian: ~30 giây)
1. Truy cập Vercel Dashboard > Dự án `vivutravinh` > **Deployments**.
2. Tìm bản deploy thành công gần nhất (ngay trước bản release bị lỗi).
3. Nhấp vào menu ba chấm (`...`) của bản deploy đó > Chọn **Instant Rollback** (hoặc **Promote to Production**).
4. Xác nhận. Vercel sẽ chuyển hướng 100% traffic về bản build ổn định trước đó ngay lập tức mà không cần build lại.

### Bước 2: Hoàn tác mã nguồn trên Git
```bash
# Kiểm tra lịch sử commit
git log -n 5 --oneline

# Tạo commit đảo ngược (revert) commit phát hành
git revert HEAD --no-edit

# Đẩy commit revert lên repository
git push origin main
```

### Bước 3: Phục hồi cấu trúc Database (nếu có sự cố schema)
Nếu migration gây lỗi, sử dụng file backup đã xuất ở Mục 1.5 để nạp lại hoặc thực thi file `supabase/g8_admin_rollback.sql` trong Supabase SQL Editor theo Mục 2.4.
