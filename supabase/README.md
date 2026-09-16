# Hướng Dẫn Quản Trị Cơ Sở Dữ Liệu Supabase (Giai Đoạn G5)

Tài liệu này hướng dẫn cách thiết lập, sao lưu, chạy migration và hoàn nguyên (rollback) cho hệ thống cơ sở dữ liệu **ViVuTraVinh** trên Supabase.

---

## 1. Cấu Trúc Schema

1. **`supabase/places.sql`**:
   - Bảng `public.places`: Lưu trữ thông tin chi tiết địa điểm du lịch, ẩm thực, check-in.
   - RLS: Khách vãng lai (`anon`) chỉ được xem các địa điểm có `status = 'approved'`.
2. **`supabase/place_comments.sql`**:
   - Bảng `public.place_comments`: Lưu trữ bình luận, đánh giá sao, và ảnh đính kèm.
   - Chống trùng lặp: Ràng buộc `UNIQUE(client_review_id)` đảm bảo mỗi lần gửi chỉ tạo 1 bản ghi duy nhất.
   - RLS: Khách vãng lai chỉ được đọc bình luận đã duyệt (`status = 'approved'`) và không bị ẩn (`is_hidden = false`). Chỉ được phép gửi bản ghi hợp lệ.
3. **`supabase/storage.sql`**:
   - Bucket `review-photos` (tối đa 5MB) và `place-photos` (tối đa 10MB).
   - RLS: Cho phép đọc công khai và cho phép tải ảnh đánh giá mới với định dạng JPEG/PNG/WebP.

---

## 2. Quy Trình Chạy Migration Khi Kết Nối Server

1. Đăng nhập vào Supabase Dashboard: `https://supabase.com/dashboard`.
2. Chọn dự án tương ứng.
3. Vào mục **SQL Editor**:
   - Bước 1: Mở tệp `supabase/places.sql` -> Bấm **Run**.
   - Bước 2: Mở tệp `supabase/place_comments.sql` -> Bấm **Run**.
   - Bước 3: Mở tệp `supabase/storage.sql` -> Bấm **Run**.
4. Kiểm tra các bảng đã được kích hoạt Row Level Security (RLS) với biểu tượng ổ khóa màu xanh.

---

## 3. Quy Trình Sao Lưu Trước Khi Migration (Backup Plan)

Trước khi thực hiện migration trên môi trường production:
1. Trong Supabase Dashboard, vào mục **Database** -> **Backups**.
2. Bấm **Take backup** để lưu trữ snapshot tức thời.
3. Hoặc sử dụng công cụ CLI:
   ```bash
   supabase db dump --data-only > backup_data_$(date +%Y%m%d).sql
   ```
4. Ứng dụng luôn duy trì tệp snapshot dự phòng tĩnh tại `data/data-fallback.json` để đảm bảo hệ thống frontend không bao giờ bị gián đoạn.

---

## 4. Quy Trình Hoàn Nguyên Khẩn Cấp (Rollback Plan)

Nếu có sự cố phát sinh sau khi migration:
1. Mở **SQL Editor** trong Supabase Dashboard.
2. Sao chép nội dung tệp `supabase/rollback_g5.sql` và bấm **Run**.
3. Khôi phục lại bản sao lưu đã tạo ở bước 3 nếu dữ liệu có dấu hiệu bất thường.
