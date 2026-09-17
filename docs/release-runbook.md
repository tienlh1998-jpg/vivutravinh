# Sổ Tay Vận Hành Phát Hành: ViVuTraVinh Release Runbook

Tài liệu hướng dẫn phát hành chính thức, kiểm tra chất lượng trước triển khai (Pre-release Audit), quy trình sao lưu cơ sở dữ liệu và hoàn tác (Rollback) khẩn cấp khi gặp sự cố.

---

## 1. Quy Trình Kiểm Tra Trước Phát Hành (10-Step Pre-Release Checklist)

Trước khi kích hoạt phiên bản mới lên môi trường Production (Vercel & Supabase), đội ngũ kỹ thuật phải thực hiện lần lượt 10 bước kiểm tra bắt buộc:

1. **Kiểm tra cú pháp và kiểu dữ liệu (Syntax Gate)**:
   ```bash
   npm run check
   ```
   *Yêu cầu: Tất cả các file JS cốt lõi và API serverless không có lỗi cú pháp.*

2. **Kiểm tra độ nguyên vẹn dữ liệu mẫu (Data Fixtures Gate)**:
   ```bash
   npm run test:fixtures
   ```
   *Yêu cầu: 10/10 ca thử nghiệp vụ đặc thù trong `data/data-fixture.json` hợp lệ.*

3. **Kiểm tra bộ lọc, tìm kiếm và định danh bền vững (G2 Gate)**:
   ```bash
   npm run test:g2 && npm run test:g2:browser
   ```
   *Yêu cầu: Tìm kiếm tiếng Việt không dấu, bộ lọc giá/khu vực và liên kết favorite/recent bằng `dbId` hoạt động chính xác.*

4. **Kiểm tra an toàn đánh giá và chống XSS (G3 Gate)**:
   ```bash
   npm run test:g3 && npm run test:g3:browser
   ```
   *Yêu cầu: Chặn 0 sao, tên ngắn, spam, XSS; mã hóa HTML entity; hàng đợi IndexedDB an toàn.*

5. **Kiểm tra nâng cấp Service Worker & Offline PWA (G4 Gate)**:
   ```bash
   npm run test:sw && npm run test:g4:browser
   ```
   *Yêu cầu: Service Worker vòng đời chuẩn, thông báo cập nhật, IndexedDB đồng bộ 1 lần duy nhất.*

6. **Kiểm toán Row Level Security, RPC Rate-limit & Storage (G5 Gate)**:
   ```bash
   npm run test:g5
   ```
   *Yêu cầu: 8/8 ca kiểm toán mock đạt chuẩn, anon bị chặn sửa/xóa bảng dữ liệu.*

7. **Kiểm thử đầu cuối đóng góp địa điểm & Idempotency (G6 Gate)**:
   ```bash
   npm run test:g6 && npm run test:g6:browser
   ```
   *Yêu cầu: Tiếp nhận đóng góp ép `draft`, kiểm tra `client_submission_id` trước rate-limit, retry 200 Idempotent.*

8. **Kiểm toán SEO, Sitemaps, Robots & Telemetry PII (G7 Gate)**:
   ```bash
   npm run test:g7 && npm run test:g7:browser
   ```
   *Yêu cầu: Sitemap chuẩn XML (0 hash `#`), robots.txt đúng domain, dynamic meta tags cập nhật chuẩn, telemetry lọc sạch 100% PII.*

9. **Toàn bộ cổng kiểm thử hồi quy (Full Regression Gate)**:
   ```bash
   npm run check:gate
   ```
   *Yêu cầu: Toàn bộ các bộ kiểm thử đều trả về exit code 0 (`GATE_EXIT=0`).*

10. **Kiểm tra bản build tĩnh phân phối (Dist Build)**:
    ```bash
    npm run build
    ```
    *Yêu cầu: Thư mục `dist/` được sinh hoàn chỉnh, CSS tĩnh tối ưu, `dist/version.json` được tạo.*

---

## 2. Quy Trình Sao Lưu Dữ Liệu (Database Backup Procedure)

### A. Sao lưu tự động qua Supabase Dashboard
1. Truy cập Supabase Dashboard: `https://supabase.com/dashboard/project/foyraoimhksfvlxndwxr`.
2. Chọn menu **Database** > **Backups** (hoặc Project Settings > Backups).
3. Xác nhận bản sao lưu gần nhất (Daily Backup) ở trạng thái `Completed`.

### B. Sao lưu thủ công qua PostgreSQL Dump (Khuyến nghị trước migration lớn)
Thực hiện lệnh xuất cấu trúc và dữ liệu từ máy quản trị:
```bash
# Xuất cấu trúc bảng và RLS policies
pg_dump "postgres://postgres.[PROJECT_REF]:[DB_PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" \
  --schema=public \
  --clean --if-exists \
  --file="backup_vivutravinh_$(date +%Y%m%d_%H%M%S).sql"
```

---

## 3. Quy Trình Hoàn Tác Khẩn Cấp (Instant Rollback Procedure)

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
Nếu migration gây lỗi, sử dụng file backup đã xuất ở Mục 2 để nạp lại hoặc thực thi file down-migration tương ứng trong Supabase SQL Editor.
