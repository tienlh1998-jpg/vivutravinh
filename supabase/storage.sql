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

-- Cho phép người dùng tải ảnh lên review-photos
-- Ràng buộc bảo mật đường dẫn chặt chẽ:
-- 1. Chỉ được tải vào bucket 'review-photos'
-- 2. Bắt buộc đúng cấu trúc 2 cấp thư mục: reviews/{place_id}/{client_review_id}_{filename}
-- 3. place_id hợp lệ (chữ, số, gạch nối/dưới)
-- 4. Tên tệp bắt buộc có tiền tố client_review_id hợp lệ
-- 5. Ngăn chặn triệt để path traversal ('..')
-- 6. Chỉ chấp nhận phần mở rộng hợp lệ: jpg, jpeg, png, webp
-- 2.1. Cho phép người dùng tải ảnh đánh giá lên review-photos (Giữ nguyên luồng đánh giá hiện có)
drop policy if exists "Anon upload review photos" on storage.objects;
create policy "Anon upload review photos"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'review-photos'
  and (storage.foldername(name))[1] = 'reviews'
  and (storage.foldername(name))[2] != 'avatars'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[2] ~ '^[a-zA-Z0-9_-]{2,100}$'
  and storage.filename(name) ~ '^[a-zA-Z0-9_-]{5,128}_[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$'
  and name not like '%..%'
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
);

-- 2.2. Cho phép người dùng ĐÃ ĐĂNG NHẬP tải ảnh đại diện vào đúng ID của chính mình
drop policy if exists "Authenticated upload own avatar" on storage.objects;
create policy "Authenticated upload own avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'review-photos'
  and (
    (
      (storage.foldername(name))[1] = 'reviews'
      and (storage.foldername(name))[2] = 'avatars'
      and storage.filename(name) like (auth.uid())::text || '_%'
    )
    or
    (
      (storage.foldername(name))[1] = 'avatars'
      and (storage.foldername(name))[2] = (auth.uid())::text
    )
  )
  and name not like '%..%'
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
);

-- 2.3. Cho phép người dùng ĐÃ ĐĂNG NHẬP tự xóa ảnh đại diện của chính mình
drop policy if exists "Authenticated delete own avatar" on storage.objects;
create policy "Authenticated delete own avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'review-photos'
  and (
    (
      (storage.foldername(name))[1] = 'reviews'
      and (storage.foldername(name))[2] = 'avatars'
      and storage.filename(name) like (auth.uid())::text || '_%'
    )
    or
    (
      (storage.foldername(name))[1] = 'avatars'
      and (storage.foldername(name))[2] = (auth.uid())::text
    )
  )
);

-- Khách vãng lai (anon) KHÔNG ĐƯỢC PHÉP sửa hoặc xóa ảnh đã tải lên
-- Thao tác xóa hoặc dọn dẹp ảnh vi phạm chỉ thực hiện qua service_role (Admin API)
drop policy if exists "Anon cannot update review photos" on storage.objects;
drop policy if exists "Anon cannot delete review photos" on storage.objects;

-- ==========================================================
-- 3. THỦ TỤC DỌN DẸP ẢNH MỒ CÔI (ORPHAN PHOTOS CLEANUP)
-- Bảo vệ tuyệt đối ảnh đại diện và ảnh bình luận khỏi việc dọn dẹp
-- ==========================================================
create or replace function public.cleanup_orphan_review_photos()
returns table(orphan_name text)
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  return query
    select o.name
    from storage.objects o
    where o.bucket_id = 'review-photos'
      and o.created_at < now() - interval '48 hours'
      -- 1. Tuyệt đối KHÔNG quét hoặc xóa ảnh đại diện trong thư mục avatars
      and coalesce((storage.foldername(o.name))[1], '') != 'avatars'
      and coalesce((storage.foldername(o.name))[2], '') != 'avatars'
      -- 2. Tuyệt đối KHÔNG xóa ảnh đang được liên kết trong place_comments
      and not exists (
        select 1 from public.place_comments pc
        where pc.photo_url like '%' || o.name || '%'
      )
      -- 3. Tuyệt đối KHÔNG xóa ảnh đang được liên kết trong profiles (avatar_url)
      and not exists (
        select 1 from public.profiles p
        where p.avatar_url like '%' || o.name || '%'
      );
end;
$$;

revoke all on function public.cleanup_orphan_review_photos() from public;
revoke all on function public.cleanup_orphan_review_photos() from anon, authenticated;
grant execute on function public.cleanup_orphan_review_photos() to service_role;
