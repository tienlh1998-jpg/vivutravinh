# Hướng Dẫn Quản Trị Cơ Sở Dữ Liệu & Backend Supabase (Giai Đoạn G5)

Tài liệu này hướng dẫn cách thiết lập, sao lưu, chạy migration, kiểm toán Row Level Security (RLS) và hoàn nguyên (rollback) cho hệ thống cơ sở dữ liệu **ViVuTraVinh** trên Supabase.

---

## 1. Trạng Thái Nghiệm Thu Kỹ Thuật (G5 Status)

```text
G0–G4:                      ✅ Đã nghiệm thu và đóng
G5 schema/client/API code:  ✅ Sẵn sàng thử nghiệm (Code readiness đạt)
G5 mock integration:        ✅ PASS (10/10 bài test tự động)
G5 Supabase migration thật: ⏸️ Đang chờ máy chủ trực tuyến (Live connection pending)
G5 RLS thật trên DB:        ⏸️ Đang chờ máy chủ trực tuyến
G5 server rate limit & API: ✅ Đã hoàn thiện (/api/submit-comment.js)
G5 tổng thể:                🟡 Chưa đóng (Code Readiness đạt, chờ Live Verification)
```

---

## 2. Cấu Trúc Schema & Chính Sách Bảo Mật

### 1. `supabase/places.sql`
- **Bảng `public.places`**: Lưu trữ thông tin chi tiết địa điểm du lịch, ẩm thực, check-in theo contract G2 (`isFree`, `hasValidGps`, `hours`, `images`).
- **RLS**: Khách vãng lai (`anon`) chỉ được phép `SELECT` các địa điểm có `status = 'approved'`. Mọi quyền `INSERT`, `UPDATE`, `DELETE` của `anon` bị chặn 103/403.

### 2. `supabase/place_comments.sql`
- **Bảng `public.place_comments`**: Lưu trữ bình luận, đánh giá sao (1–5), và metadata ảnh đính kèm (`photo_url`, `photo_metadata`).
- **Khóa Idempotency**: `UNIQUE(client_review_id)` đảm bảo mỗi lần gửi từ client chỉ tạo tối đa 1 bản ghi duy nhất, ngăn spam click hoặc gửi lặp khi mạng chập chờn.
- **Chính sách kiểm duyệt (Pre-moderation)**:
  - *Lựa chọn thiết kế*: Áp dụng **Pre-moderation** (Duyệt trước khi hiển thị). Khách vãng lai (`anon`) chỉ được phép chèn bản ghi ở trạng thái `status = 'pending'`.
  - *Lý do*: ViVuTraVinh là cẩm nang cộng đồng mở, không có đội ngũ trực kiểm duyệt 24/7. Việc cho phép hiển thị ngay (post-moderation) tiềm ẩn rủi ro bot spam, link độc hại, hoặc ngôn từ phản cảm xuất hiện trên trang công cộng.
  - *RLS SELECT*: Chỉ cho phép đọc `status = 'approved' AND is_hidden = false`. Bình luận `pending` chỉ hiển thị với admin trong trang kiểm duyệt (`admin.html`) cho đến khi được duyệt.
  - *Chặn bypass*: Nếu kẻ tấn công cố tình gửi trực tiếp `status = 'approved'` tới Supabase REST, Postgres RLS policy `WITH CHECK (status = 'pending')` sẽ từ chối với mã lỗi 403.

### 3. `supabase/storage.sql`
- **Buckets**: `review-photos` (tối đa 5MB) và `place-photos` (tối đa 10MB).
- **Ràng buộc RLS Storage**:
  - Bắt buộc cấu trúc đường dẫn: `reviews/{place_id}/{client_review_id}_{filename}`.
  - Chặn triệt để path traversal (`..`).
  - Giới hạn đuôi tệp: `jpg`, `jpeg`, `png`, `webp`.
- **Dọn dẹp ảnh mồ côi (Orphan Cleanup)**: Cung cấp hàm `public.cleanup_orphan_review_photos()` để định kỳ xóa các ảnh trong bucket `review-photos` tải lên quá 48h mà không gắn với bình luận nào trong bảng `place_comments`.

---

## 3. Tầng API Backend & Chống Spam Phía Server (`api/`)

1. **`api/submit-comment.js`**:
   - **Rate Limiting theo IP**: Giới hạn tối đa 3 bình luận/phút và khoảng cách tối thiểu 10 giây giữa 2 bình luận liên tiếp từ cùng một IP. Khi vượt ngưỡng, trả về HTTP 429 `RATE_LIMITED` kèm header `Retry-After`.
   - **Giới hạn Payload**: Đo kích thước thực tế bằng `Buffer.byteLength(JSON.stringify(body), 'utf8') <= 64KB`. Từ chối 413 `PAYLOAD_TOO_LARGE` nếu vượt quá.
   - **Validation Server-side**: Xác thực nghiêm ngặt độ dài tên tác giả (2–80 ký tự), rating (1–5 sao), nội dung (3–1000 ký tự), URL ảnh và metadata.
   - **Xử lý Bất Biến (Idempotency)**: Kiểm tra `client_review_id` trước khi chèn. Nếu đã tồn tại, trả về bản ghi hiện tại với mã 200 OK mà không tạo thêm dòng mới.
   - **Thực thi Pre-moderation**: Ghi nhận bình luận với trạng thái `pending` thông qua `SUPABASE_SERVICE_ROLE_KEY`.

2. **`api/admin-places.js`, `api/admin-comments.js`, `api/import-place.js`**:
   - **Đo kích thước object body**: Hỗ trợ đo chính xác payload object đã được runtime parse sẵn bằng `Buffer.byteLength(JSON.stringify(request.body), 'utf8') <= MAX_PAYLOAD_SIZE` (1MB - 2MB).
   - **Chống Brute-force Secret**: Khóa tạm thời 15 phút (HTTP 429 `AUTH_RATE_LIMITED`) nếu một IP thử sai secret quá 5 lần.
   - **Audit Logging**: Ghi nhận nhật ký cảnh báo cho mọi nỗ lực xác thực thất bại.
   - **Cấu trúc lỗi chuẩn**: Luôn trả về `{ success: false, error: { code, message } }`, che giấu stack trace và bí mật nội bộ khi gặp lỗi 500.

---

## 4. Danh Mục Kiểm Tra Khi Supabase Hoạt Động Lại (10-Step Checklist)

Khi máy chủ Supabase staging/production sẵn sàng:

1. [ ] **Sao lưu (Backup)**: Tạo snapshot database staging hiện có.
2. [ ] **Chạy Migration**: Thực thi lần lượt `places.sql`, `place_comments.sql`, `storage.sql`.
3. [ ] **Xác nhận Pre-moderation**: Xác nhận policy `status = 'pending'` được áp dụng cho vai trò `anon`.
4. [ ] **Kiểm tra Rate Limit Server**: Gửi 2 request liên tiếp qua `/api/submit-comment` và xác nhận nhận HTTP 429.
5. [ ] **Chạy Test Trực Tiếp**: Chạy lệnh `npm run test:g5:live` để kiểm toán kết nối thật.
6. [ ] **Xác thực Đọc Public**: Xác nhận `anon` chỉ đọc được địa điểm/bình luận `approved`, không đọc được `draft` hoặc `hidden`.
7. [ ] **Xác thực Chặn Ghi Public**: Xác nhận `anon` không thể sửa hoặc xóa bất kỳ địa điểm hay bình luận nào.
8. [ ] **Kiểm tra Idempotency Thật**: Gửi cùng 1 `client_review_id` 2 lần và xác nhận DB chỉ có 1 dòng.
9. [ ] **Kiểm tra Storage Upload**: Tải lên thử file sai đuôi hoặc vượt 5MB và xác nhận bị chặn.
10. [ ] **Nghiệm Thu Đóng Cổng G5**: Sau khi hoàn thành 9 bước trên, chuyển trạng thái từ "Readiness" sang "Hoàn Thành G5".
