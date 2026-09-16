-- ==========================================================
-- ViVuTraVinh - Supabase Storage Configuration (Buckets & RLS)
-- ==========================================================

-- 1. Tạo bucket lưu trữ ảnh đánh giá và ảnh địa điểm (nếu chưa có)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values 
  ('review-photos', 'review-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('place-photos', 'place-photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2. RLS Policies cho storage.objects
-- Cho phép đọc công khai tất cả ảnh trong bucket review-photos và place-photos
drop policy if exists "Public Access for Review Photos" on storage.objects;
create policy "Public Access for Review Photos"
on storage.objects for select
to anon, authenticated
using (bucket_id in ('review-photos', 'place-photos'));

-- Cho phép người dùng vãng lai (anon) tải ảnh lên review-photos
-- Ràng buộc dung lượng tối đa 5MB và định dạng MIME hợp lệ
drop policy if exists "Anon upload review photos" on storage.objects;
create policy "Anon upload review photos"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'review-photos'
);

-- Khách vãng lai (anon) KHÔNG ĐƯỢC PHÉP sửa hoặc xóa ảnh đã tải lên
-- Thao tác xóa hoặc dọn dẹp ảnh vi phạm chỉ thực hiện qua service_role (Admin API)
