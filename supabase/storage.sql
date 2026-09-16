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
-- Ràng buộc bảo mật:
-- 1. Chỉ được tải vào bucket 'review-photos'
-- 2. Bắt buộc cấu trúc đường dẫn: reviews/{place_id}/{client_review_id}_{filename}
-- 3. Ngăn chặn triệt để path traversal ('..')
-- 4. Chỉ chấp nhận phần mở rộng hợp lệ: jpg, jpeg, png, webp
drop policy if exists "Anon upload review photos" on storage.objects;
create policy "Anon upload review photos"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'review-photos'
  and (storage.foldername(name))[1] = 'reviews'
  and name not like '%..%'
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
);

-- Khách vãng lai (anon) KHÔNG ĐƯỢC PHÉP sửa hoặc xóa ảnh đã tải lên
-- Thao tác xóa hoặc dọn dẹp ảnh vi phạm chỉ thực hiện qua service_role (Admin API)
drop policy if exists "Anon cannot update review photos" on storage.objects;
drop policy if exists "Anon cannot delete review photos" on storage.objects;

-- ==========================================================
-- 3. THỦ TỤC DỌN DẸP ẢNH MỒ CÔI (ORPHAN PHOTOS CLEANUP)
-- Ảnh tải lên sau 48h nhưng không được liên kết với bất kỳ bình luận nào
-- trong bảng place_comments sẽ được đánh dấu để dọn dẹp định kỳ
-- ==========================================================
create or replace function public.cleanup_orphan_review_photos()
returns table(deleted_name text)
language plpgsql
security definer
as $$
declare
  obj record;
begin
  for obj in
    select o.name
    from storage.objects o
    where o.bucket_id = 'review-photos'
      and o.created_at < now() - interval '48 hours'
      and not exists (
        select 1 from public.place_comments pc
        where pc.photo_url like '%' || o.name || '%'
      )
  loop
    delete from storage.objects where bucket_id = 'review-photos' and name = obj.name;
    deleted_name := obj.name;
    return next;
  end loop;
end;
$$;
