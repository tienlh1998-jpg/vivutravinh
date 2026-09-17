-- ==========================================================
-- ViVuTraVinh - G6 Migration: Places Idempotency & Contribution Storage
-- ==========================================================

-- 1. Bổ sung cột client_submission_id cho bảng places
alter table public.places
  add column if not exists client_submission_id text;

-- 2. Tạo Partial Unique Index đảm bảo tính Idempotency tuyệt đối
-- Không dùng name hoặc slug làm khóa. Bất kể tên địa điểm gửi lại có thay đổi hay không,
-- cùng một client_submission_id chỉ tồn tại duy nhất một bản ghi trong cơ sở dữ liệu.
create unique index if not exists places_client_submission_id_unique
  on public.places(client_submission_id)
  where client_submission_id is not null;

-- 3. Tạo Bucket contribution-photos cho Supabase Storage (nếu chưa có)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values 
  ('contribution-photos', 'contribution-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 4. RLS Policies cho storage.objects (Bucket contribution-photos)
-- Cho phép đọc công khai tất cả ảnh đã duyệt/tải lên trong bucket contribution-photos
drop policy if exists "Public Access for Contribution Photos" on storage.objects;
create policy "Public Access for Contribution Photos"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'contribution-photos');

-- Cho phép người dùng (anon, authenticated) tải ảnh đóng góp lên với quy tắc đường dẫn nghiêm ngặt:
-- - Bucket bắt buộc là 'contribution-photos'
-- - Cấu trúc thư mục: contributions/{client_submission_id}/{filename}
-- - client_submission_id hợp lệ (chữ, số, gạch dưới, gạch ngang từ 2-100 ký tự)
-- - Tên tệp có tiền tố an toàn và phần mở rộng jpg, jpeg, png, webp
-- - Không chứa ký tự duyệt thư mục (path traversal '%..%')
drop policy if exists "Anon upload contribution photos" on storage.objects;
create policy "Anon upload contribution photos"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'contribution-photos'
  and (storage.foldername(name))[1] = 'contributions'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[2] ~ '^[a-zA-Z0-9_-]{2,100}$'
  and storage.filename(name) ~ '^[a-zA-Z0-9_-]{5,128}_[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$'
  and name not like '%..%'
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
);

-- Khách vãng lai (anon) KHÔNG ĐƯỢC PHÉP sửa hoặc xóa ảnh đã tải lên
drop policy if exists "Anon cannot update contribution photos" on storage.objects;
drop policy if exists "Anon cannot delete contribution photos" on storage.objects;

-- 5. Thủ tục dọn dẹp ảnh đóng góp mồ côi (Orphan Photos Cleanup)
-- Ảnh tải lên quá 48h nhưng không được gắn vào địa điểm nào trong places
create or replace function public.cleanup_orphan_contribution_photos()
returns table(deleted_name text)
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  obj record;
begin
  for obj in
    select o.name
    from storage.objects o
    where o.bucket_id = 'contribution-photos'
      and o.created_at < now() - interval '48 hours'
      and not exists (
        select 1 from public.places p
        where p.image_link like '%' || o.name || '%'
           or p.images::text like '%' || o.name || '%'
      )
  loop
    delete from storage.objects where bucket_id = 'contribution-photos' and name = obj.name;
    deleted_name := obj.name;
    return next;
  end loop;
end;
$$;

revoke all on function public.cleanup_orphan_contribution_photos() from public;
revoke all on function public.cleanup_orphan_contribution_photos() from anon, authenticated;
grant execute on function public.cleanup_orphan_contribution_photos() to service_role;
