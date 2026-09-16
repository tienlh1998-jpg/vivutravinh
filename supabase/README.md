# Hướng Dẫn Quản Trị Cơ Sở Dữ Liệu & Backend Supabase (Giai Đoạn G5)

Tài liệu này hướng dẫn cách thiết lập, sao lưu, chạy migration, kiểm toán Row Level Security (RLS) và hoàn nguyên (rollback) cho hệ thống cơ sở dữ liệu **ViVuTraVinh** trên Supabase.

---

## 1. Trạng Thái Nghiệm Thu Kỹ Thuật (G5 Status)

```text
G0–G4:                      ✅ Đã nghiệm thu và đóng
G5 schema/client/API code:  ✅ Sẵn sàng thử nghiệm (Code readiness đạt)
G5 mock integration:        ✅ PASS (8/8 ca kiểm thử mô phỏng contract & bảo mật)
G5 Supabase migration thật: ⏸️ Đang chờ máy chủ trực tuyến (Live connection pending)
G5 RLS thật trên DB:        ⏸️ Đang chờ máy chủ trực tuyến
G5 server rate limit & API: ✅ Đã hoàn thiện (Distributed Rate-Limiting qua DB RPC & /api/submit-comment.js)
G5 bypass prevention:       ✅ Đã đóng (Chặn 100% anon INSERT trực tiếp vào DB)
G5 tổng thể:                🟡 Chưa đóng (Code Readiness đạt, chờ Live Verification)
```

---

## 2. Cấu Trúc Schema & Chính Sách Bảo Mật

### 1. `supabase/places.sql`
- **Bảng `public.places`**: Lưu trữ thông tin chi tiết địa điểm du lịch, ẩm thực, check-in theo contract G2 (`isFree`, `hasValidGps`, `hours`, `images`).
- **RLS**: Khách vãng lai (`anon`) chỉ được phép `SELECT` các địa điểm có `status = 'approved'`. Mọi quyền `INSERT`, `UPDATE`, `DELETE` của `anon` bị chặn 403 Forbidden.

### 2. `supabase/place_comments.sql`
- **Bảng `public.place_comments`**: Lưu trữ bình luận, đánh giá sao (1–5), và metadata ảnh đính kèm (`photo_url`, `photo_metadata`).
- **Trạng thái mặc định**: Cột `status text not null default 'pending'` đảm bảo an toàn ngay cả khi payload thiếu trường `status`.
- **Khóa Idempotency**: `UNIQUE(client_review_id)` ngăn spam click hoặc gửi lặp khi mạng chập chờn.
- **Bảo Vệ Rate Limit & Chống Bypass**:
  - **Không cấp quyền `anon INSERT`**: Toàn bộ policy INSERT cho `anon` đã bị gỡ bỏ khỏi bảng `place_comments`.
  - Mọi request gửi bình luận bắt buộc phải đi qua endpoint `/api/submit-comment`.
  - Endpoint sử dụng `SUPABASE_SERVICE_ROLE_KEY` để ghi vào DB với trạng thái `pending`.
  - Nếu kẻ tấn công gọi trực tiếp Supabase REST endpoint bằng anon key, PostgreSQL RLS sẽ từ chối ngay lập tức với mã lỗi **403 Forbidden**.
- **Bảng & Hàm Rate Limit Chia Sẻ (Distributed Rate Limiting)**:
  - Bảng `public.rate_limits` lưu trữ mảng timestamps theo key (`comment_ip_{IP}`).
  - Hàm RPC `public.check_and_record_rate_limit()` chạy nguyên tử (atomic transaction) với `security definer` và `set search_path = public`.
  - Quyền thực thi RPC bị thu hồi khỏi `public, anon, authenticated` và chỉ cấp cho `service_role`.
  - Hoạt động nhất quán trên toàn bộ serverless instances và sau các đợt cold start.

### 3. `supabase/storage.sql`
- **Buckets**: `review-photos` (tối đa 5MB) và `place-photos` (tối đa 10MB).
- **Ràng buộc RLS Storage**:
  - Bắt buộc đúng cấu trúc 2 cấp thư mục: `reviews/{place_id}/{client_review_id}_{filename}`.
  - Kiểm tra regex: `(storage.foldername(name))[2] ~ '^[a-zA-Z0-9_-]{2,100}$'` và `storage.filename(name) ~ '^[a-zA-Z0-9_-]{5,128}_[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$'`.
  - Chặn triệt để path traversal (`..`).
- **Dọn dẹp ảnh mồ côi (Orphan Cleanup)**:
  - Hàm `public.cleanup_orphan_review_photos()` có `security definer` và `set search_path = public, storage`.
  - Quyền thực thi bị thu hồi khỏi `public, anon, authenticated` và chỉ cấp riêng cho `service_role`.

---

## 3. Tầng API Backend & Client Offline Queue (`api/` & `js/`)

1. **`api/submit-comment.js`**:
   - **Distributed Rate Limiting**: Gọi RPC `check_and_record_rate_limit` ở backend. Giới hạn 3 bình luận/phút, khoảng cách tối thiểu 10s. Vượt ngưỡng trả về **HTTP 429 `RATE_LIMITED`** kèm `Retry-After`.
   - **Local LRU Cache Bounded**: Giới hạn tối đa 500 mục làm cơ chế dự phòng nếu DB RPC chưa sẵn sàng.
   - **Đo kích thước Payload**: Đo `Buffer.byteLength(JSON.stringify(body), 'utf8') <= 64KB`, trả về **HTTP 413 `PAYLOAD_TOO_LARGE`**.
   - **Server Validation**: Kiểm tra tên tác giả (2–80 ký tự), rating (1–5), nội dung (3–1000 ký tự), định dạng ảnh.
   - **Idempotency**: Trả về 200 OK bản ghi hiện có nếu `client_review_id` đã tồn tại.

2. **`js/comments.js` & `js/offline-sync.js`**:
   - Gỡ bỏ hoàn toàn fallback gửi Supabase REST trực tiếp.
   - Khi API không khả dụng hoặc mất mạng, lưu bản nháp vào IndexedDB offline queue.
   - Khi đồng bộ nếu gặp HTTP 429, tiến trình đồng bộ tạm dừng duyên dáng, giữ các bản ghi trong hàng đợi thay vì spam máy chủ.

3. **`api/admin-places.js`, `api/admin-comments.js`, `api/import-place.js`**:
   - Đo kích thước object body bằng `Buffer.byteLength(JSON.stringify(body))`.
   - Chống brute-force secret: Khóa 15 phút (HTTP 429) khi thử sai quá 5 lần.

---

## 4. Công Cụ Kiểm Toán Trực Tiếp (`scripts/verify-g5-live.js`)

- Chạy: `npm run test:g5:live`
- Thoát mã 1 khi không kết nối được máy chủ Supabase để CI nhận diện chính xác live audit chưa hoàn thành.
- Hỗ trợ cờ `--allow-offline` để chủ động đánh dấu trạng thái SKIPPED (thoát mã 0) trong môi trường thử nghiệm cô lập.

---

## 5. Danh Mục Kiểm Tra Khi Supabase Hoạt Động Lại (10-Step Checklist)

1. [ ] **Sao lưu (Backup)**: Tạo snapshot database staging hiện có.
2. [ ] **Chạy Migration**: Thực thi lần lượt `places.sql`, `place_comments.sql`, `storage.sql`.
3. [ ] **Xác nhận Pre-moderation & Default Status**: Kiểm tra bảng `place_comments` có `default 'pending'`.
4. [ ] **Xác nhận Anon Insert Bị Chặn**: Thử gửi POST trực tiếp tới `/rest/v1/place_comments` bằng anon key -> Phải nhận HTTP 403 Forbidden.
5. [ ] **Kiểm tra Rate Limit Server**: Gửi 2 request liên tiếp qua `/api/submit-comment` và xác nhận nhận HTTP 429.
6. [ ] **Chạy Test Trực Tiếp**: Chạy lệnh `npm run test:g5:live` để kiểm toán toàn bộ RLS thật.
7. [ ] **Xác thực Đọc Public**: Xác nhận `anon` chỉ đọc được địa điểm/bình luận `approved`, không đọc được `draft` hoặc `hidden`.
8. [ ] **Xác thực Chặn Ghi Public**: Xác nhận `anon` không thể sửa hoặc xóa bất kỳ địa điểm hay bình luận nào.
9. [ ] **Kiểm tra Idempotency Thật**: Gửi cùng 1 `client_review_id` 2 lần qua API và xác nhận DB chỉ có 1 dòng.
10. [ ] **Nghiệm Thu Đóng Cổng G5**: Sau khi hoàn thành 9 bước trên, chuyển trạng thái từ "Readiness" sang "Hoàn Thành G5".
