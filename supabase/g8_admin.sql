-- supabase/g8_admin.sql
-- Migration G8: Hệ thống Quản trị Nội dung và Vận hành (G8.0 - G8.2)
-- Bản migration hoàn toàn Idempotent, có thể chạy lặp lại an toàn.

-- ============================================================================
-- 1. BẢNG ALLOWLIST QUẢN TRỊ VIÊN (admin_users)
-- ============================================================================

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null check (role in ('admin', 'editor', 'moderator')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chỉ mục tối ưu truy vấn allowlist và trạng thái
create index if not exists idx_admin_users_role on public.admin_users(role);
create index if not exists idx_admin_users_active on public.admin_users(is_active);

-- Kích hoạt Row Level Security (RLS)
alter table public.admin_users enable row level security;

-- Strict RLS: Khóa toàn diện anon và authenticated, chỉ cấp quyền cho service_role
drop policy if exists "Chỉ service_role mới có quyền thao tác trên admin_users" on public.admin_users;
create policy "Chỉ service_role mới có quyền thao tác trên admin_users"
  on public.admin_users
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Explicit Table Privileges: Thu hồi mọi quyền từ public/anon/authenticated, chỉ cấp cho service_role
revoke all on table public.admin_users from public, anon, authenticated;
grant all on table public.admin_users to service_role;

-- Trigger cập nhật updated_at tự động
create or replace function public.set_admin_users_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_admin_users_updated_at on public.admin_users;
create trigger trg_set_admin_users_updated_at
  before update on public.admin_users
  for each row
  execute function public.set_admin_users_updated_at();

-- ============================================================================
-- 2. BẢNG NHẬT KÝ KIỂM TOÁN THAO TÁC QUẢN TRỊ (admin_audit_logs)
-- ============================================================================

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  actor_role text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  payload_before jsonb,
  payload_after jsonb,
  ip text,
  correlation_id text,
  created_at timestamptz not null default now()
);

-- Chỉ mục cho truy vấn kiểm toán và sắp xếp thời gian
create index if not exists idx_admin_audit_logs_created on public.admin_audit_logs(created_at desc);
create index if not exists idx_admin_audit_logs_entity on public.admin_audit_logs(entity_type, entity_id);
create index if not exists idx_admin_audit_logs_actor on public.admin_audit_logs(actor_id);

-- Kích hoạt Row Level Security (RLS)
alter table public.admin_audit_logs enable row level security;

-- Strict RLS: Khóa toàn diện anon và authenticated, chỉ cấp quyền cho service_role
drop policy if exists "Chỉ service_role mới có quyền thao tác trên admin_audit_logs" on public.admin_audit_logs;
create policy "Chỉ service_role mới có quyền thao tác trên admin_audit_logs"
  on public.admin_audit_logs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Explicit Table Privileges: Thu hồi mọi quyền từ public/anon/authenticated, chỉ cấp cho service_role
revoke all on table public.admin_audit_logs from public, anon, authenticated;
grant all on table public.admin_audit_logs to service_role;

-- ============================================================================
-- 3. HÀM RPC GIAO DỊCH NGUYÊN TỬ CHO THAO TÁC QUẢN TRỊ (PostgreSQL Transaction Atomicity)
-- ============================================================================

-- 3.1. Tạo địa điểm (Place Create Atomic Transaction)
create or replace function public.admin_create_place_atomic(
  p_actor_id uuid,
  p_actor_email text,
  p_actor_role text,
  p_place_data jsonb,
  p_ip text,
  p_correlation_id text
) returns jsonb as $$
declare
  v_new_record public.places%rowtype;
  v_audit_after jsonb;
begin
  -- Validate role: Chỉ admin hoặc editor mới có quyền tạo địa điểm
  if p_actor_role is null or p_actor_role not in ('admin', 'editor') then
    raise exception 'FORBIDDEN: Chỉ admin hoặc editor mới có quyền tạo địa điểm' using errcode = '42501';
  end if;

  -- Validate required fields
  if p_place_data->>'name' is null or trim(p_place_data->>'name') = '' then
    raise exception 'INVALID_INPUT: Tên địa điểm không được để trống' using errcode = '22023';
  end if;
  if p_place_data->>'slug' is null or trim(p_place_data->>'slug') = '' then
    raise exception 'INVALID_INPUT: Slug địa điểm không được để trống' using errcode = '22023';
  end if;
  if p_place_data->>'category' is null or trim(p_place_data->>'category') = '' then
    raise exception 'INVALID_INPUT: Danh mục địa điểm không được để trống' using errcode = '22023';
  end if;

  -- Chèn chỉ các trường trong allowlist
  insert into public.places (
    slug, name, category, area, address, map_link, price_raw,
    description, note, contact, coordinates, contributor,
    rating, opening_time, closing_time, display_hours,
    operating_status, status, images, image_link,
    sort_order, is_featured, client_submission_id,
    created_at, updated_at
  ) values (
    trim(p_place_data->>'slug'),
    trim(p_place_data->>'name'),
    trim(p_place_data->>'category'),
    p_place_data->>'area',
    p_place_data->>'address',
    p_place_data->>'map_link',
    p_place_data->>'price_raw',
    p_place_data->>'description',
    p_place_data->>'note',
    p_place_data->>'contact',
    p_place_data->>'coordinates',
    coalesce(p_place_data->>'contributor', 'Ẩn danh'),
    coalesce((p_place_data->>'rating')::numeric, 0),
    p_place_data->>'opening_time',
    p_place_data->>'closing_time',
    p_place_data->>'display_hours',
    coalesce(p_place_data->>'operating_status', 'Normal'),
    coalesce(p_place_data->>'status', 'draft'),
    coalesce(p_place_data->'images', '[]'::jsonb),
    p_place_data->>'image_link',
    coalesce((p_place_data->>'sort_order')::integer, 0),
    coalesce((p_place_data->>'is_featured')::boolean, false),
    p_place_data->>'client_submission_id',
    now(),
    now()
  )
  returning * into v_new_record;

  -- Audit payload allowlist nghiêm ngặt: KHÔNG chứa contact, contributor, address, note, coordinates
  v_audit_after := jsonb_build_object(
    'id', v_new_record.id,
    'slug', v_new_record.slug,
    'name', v_new_record.name,
    'category', v_new_record.category,
    'area', v_new_record.area,
    'status', v_new_record.status,
    'operating_status', v_new_record.operating_status,
    'rating', v_new_record.rating,
    'opening_time', v_new_record.opening_time,
    'closing_time', v_new_record.closing_time,
    'display_hours', v_new_record.display_hours,
    'sort_order', v_new_record.sort_order,
    'is_featured', v_new_record.is_featured,
    'updated_at', v_new_record.updated_at
  );

  -- Ghi audit log trong cùng transaction (tự động rollback nếu insert lỗi)
  insert into public.admin_audit_logs (
    actor_id, actor_email, actor_role, action,
    entity_type, entity_id,
    payload_before, payload_after,
    ip, correlation_id, created_at
  ) values (
    p_actor_id, p_actor_email, p_actor_role, 'place.create',
    'place', v_new_record.id::text,
    null, v_audit_after,
    p_ip, p_correlation_id, now()
  );

  return to_jsonb(v_new_record);
end;
$$ language plpgsql security definer
set search_path = public, pg_temp;

revoke all on function public.admin_create_place_atomic(uuid, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.admin_create_place_atomic(uuid, text, text, jsonb, text, text) to service_role;

-- 3.2. Cập nhật địa điểm (Place Update Atomic Transaction)
create or replace function public.admin_update_place_atomic(
  p_actor_id uuid,
  p_actor_email text,
  p_actor_role text,
  p_place_id bigint,
  p_patch jsonb,
  p_ip text,
  p_correlation_id text
) returns jsonb as $$
declare
  v_old_record public.places%rowtype;
  v_new_record public.places%rowtype;
  v_audit_before jsonb;
  v_audit_after jsonb;
  v_action text;
begin
  -- Validate role: Chỉ admin hoặc editor mới có quyền sửa địa điểm
  if p_actor_role is null or p_actor_role not in ('admin', 'editor') then
    raise exception 'FORBIDDEN: Chỉ admin hoặc editor mới có quyền cập nhật địa điểm' using errcode = '42501';
  end if;

  -- Khóa dòng dữ liệu và kiểm tra NOT_FOUND
  select * into v_old_record from public.places where id = p_place_id for update;
  if not found then
    raise exception 'NOT_FOUND: Không tìm thấy địa điểm %', p_place_id using errcode = 'P0002';
  end if;

  -- Khóa lạc quan (Optimistic Concurrency Control - G9.3C)
  if p_patch ? 'expected_updated_at' and p_patch->>'expected_updated_at' is not null and trim(p_patch->>'expected_updated_at') <> '' then
    if v_old_record.updated_at is distinct from (p_patch->>'expected_updated_at')::timestamptz then
      raise exception 'CONFLICT: Bản ghi đã bị sửa đổi đồng thời (expected_updated_at không khớp)' using errcode = '40001';
    end if;
  end if;

  -- Cập nhật chỉ các trường trong allowlist (chống mass assignment: không cho sửa id, created_at, client_submission_id)
  update public.places
  set
    name = case when p_patch ? 'name' then trim(p_patch->>'name') else name end,
    slug = case when p_patch ? 'slug' then trim(p_patch->>'slug') else slug end,
    category = case when p_patch ? 'category' then trim(p_patch->>'category') else category end,
    area = case when p_patch ? 'area' then p_patch->>'area' else area end,
    address = case when p_patch ? 'address' then p_patch->>'address' else address end,
    map_link = case when p_patch ? 'map_link' then p_patch->>'map_link' else map_link end,
    price_raw = case when p_patch ? 'price_raw' then p_patch->>'price_raw' else price_raw end,
    description = case when p_patch ? 'description' then p_patch->>'description' else description end,
    note = case when p_patch ? 'note' then p_patch->>'note' else note end,
    contact = case when p_patch ? 'contact' then p_patch->>'contact' else contact end,
    coordinates = case when p_patch ? 'coordinates' then p_patch->>'coordinates' else coordinates end,
    contributor = case when p_patch ? 'contributor' then p_patch->>'contributor' else contributor end,
    rating = case when p_patch ? 'rating' then (p_patch->>'rating')::numeric else rating end,
    opening_time = case when p_patch ? 'opening_time' then p_patch->>'opening_time' else opening_time end,
    closing_time = case when p_patch ? 'closing_time' then p_patch->>'closing_time' else closing_time end,
    display_hours = case when p_patch ? 'display_hours' then p_patch->>'display_hours' else display_hours end,
    operating_status = case when p_patch ? 'operating_status' then p_patch->>'operating_status' else operating_status end,
    status = case when p_patch ? 'status' then p_patch->>'status' else status end,
    images = case when p_patch ? 'images' then (p_patch->'images') else images end,
    image_link = case when p_patch ? 'image_link' then p_patch->>'image_link' else image_link end,
    sort_order = case when p_patch ? 'sort_order' then (p_patch->>'sort_order')::integer else sort_order end,
    is_featured = case when p_patch ? 'is_featured' then (p_patch->>'is_featured')::boolean else is_featured end,
    updated_at = now()
  where id = p_place_id
    and (
      not (p_patch ? 'expected_updated_at')
      or p_patch->>'expected_updated_at' is null
      or trim(p_patch->>'expected_updated_at') = ''
      or updated_at = (p_patch->>'expected_updated_at')::timestamptz
    )
  returning * into v_new_record;

  if not found then
    raise exception 'CONFLICT: Bản ghi không thể cập nhật (có thể do xung đột updated_at hoặc id không tồn tại)' using errcode = '40001';
  end if;

  -- Audit payload allowlist nghiêm ngặt (không PII)
  v_audit_before := jsonb_build_object(
    'id', v_old_record.id,
    'slug', v_old_record.slug,
    'name', v_old_record.name,
    'category', v_old_record.category,
    'area', v_old_record.area,
    'status', v_old_record.status,
    'operating_status', v_old_record.operating_status,
    'rating', v_old_record.rating,
    'opening_time', v_old_record.opening_time,
    'closing_time', v_old_record.closing_time,
    'display_hours', v_old_record.display_hours,
    'sort_order', v_old_record.sort_order,
    'is_featured', v_old_record.is_featured,
    'updated_at', v_old_record.updated_at
  );

  v_audit_after := jsonb_build_object(
    'id', v_new_record.id,
    'slug', v_new_record.slug,
    'name', v_new_record.name,
    'category', v_new_record.category,
    'area', v_new_record.area,
    'status', v_new_record.status,
    'operating_status', v_new_record.operating_status,
    'rating', v_new_record.rating,
    'opening_time', v_new_record.opening_time,
    'closing_time', v_new_record.closing_time,
    'display_hours', v_new_record.display_hours,
    'sort_order', v_new_record.sort_order,
    'is_featured', v_new_record.is_featured,
    'updated_at', v_new_record.updated_at
  );

  v_action := case
    when v_new_record.status = 'archived' and v_old_record.status <> 'archived' then 'place.archive'
    when v_new_record.status is distinct from v_old_record.status then 'place.' || v_new_record.status
    else 'place.update'
  end;

  insert into public.admin_audit_logs (
    actor_id, actor_email, actor_role, action,
    entity_type, entity_id,
    payload_before, payload_after,
    ip, correlation_id, created_at
  ) values (
    p_actor_id, p_actor_email, p_actor_role, v_action,
    'place', v_new_record.id::text,
    v_audit_before, v_audit_after,
    p_ip, p_correlation_id, now()
  );

  return to_jsonb(v_new_record);
end;
$$ language plpgsql security definer
set search_path = public, pg_temp;

revoke all on function public.admin_update_place_atomic(uuid, text, text, bigint, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.admin_update_place_atomic(uuid, text, text, bigint, jsonb, text, text) to service_role;

-- 3.3. Xóa / Lưu trữ địa điểm (Place Delete/Archive Atomic Transaction)
create or replace function public.admin_delete_place_atomic(
  p_actor_id uuid,
  p_actor_email text,
  p_actor_role text,
  p_place_id bigint,
  p_permanent boolean,
  p_ip text,
  p_correlation_id text
) returns jsonb as $$
declare
  v_old_record public.places%rowtype;
  v_new_record public.places%rowtype;
  v_audit_before jsonb;
  v_audit_after jsonb;
begin
  -- Validate role: Chỉ admin mới có quyền xóa hoặc lưu trữ địa điểm
  if p_actor_role is null or p_actor_role <> 'admin' then
    raise exception 'FORBIDDEN: Chỉ admin mới có quyền xóa hoặc lưu trữ địa điểm' using errcode = '42501';
  end if;

  -- Khóa dòng dữ liệu và kiểm tra NOT_FOUND
  select * into v_old_record from public.places where id = p_place_id for update;
  if not found then
    raise exception 'NOT_FOUND: Không tìm thấy địa điểm %', p_place_id using errcode = 'P0002';
  end if;

  v_audit_before := jsonb_build_object(
    'id', v_old_record.id,
    'slug', v_old_record.slug,
    'name', v_old_record.name,
    'category', v_old_record.category,
    'area', v_old_record.area,
    'status', v_old_record.status,
    'operating_status', v_old_record.operating_status,
    'rating', v_old_record.rating,
    'sort_order', v_old_record.sort_order,
    'is_featured', v_old_record.is_featured,
    'updated_at', v_old_record.updated_at
  );

  if p_permanent is true then
    -- Xóa cứng hoàn toàn
    delete from public.places where id = p_place_id;

    insert into public.admin_audit_logs (
      actor_id, actor_email, actor_role, action,
      entity_type, entity_id,
      payload_before, payload_after,
      ip, correlation_id, created_at
    ) values (
      p_actor_id, p_actor_email, p_actor_role, 'place.delete',
      'place', p_place_id::text,
      v_audit_before, null,
      p_ip, p_correlation_id, now()
    );

    return jsonb_build_object('id', p_place_id, 'deleted', true, 'permanent', true);
  else
    -- Lưu trữ (soft-delete / archived)
    update public.places
    set status = 'archived', updated_at = now()
    where id = p_place_id
    returning * into v_new_record;

    v_audit_after := jsonb_build_object(
      'id', v_new_record.id,
      'slug', v_new_record.slug,
      'name', v_new_record.name,
      'category', v_new_record.category,
      'area', v_new_record.area,
      'status', v_new_record.status,
      'operating_status', v_new_record.operating_status,
      'rating', v_new_record.rating,
      'sort_order', v_new_record.sort_order,
      'is_featured', v_new_record.is_featured,
      'updated_at', v_new_record.updated_at
    );

    insert into public.admin_audit_logs (
      actor_id, actor_email, actor_role, action,
      entity_type, entity_id,
      payload_before, payload_after,
      ip, correlation_id, created_at
    ) values (
      p_actor_id, p_actor_email, p_actor_role, 'place.archive',
      'place', p_place_id::text,
      v_audit_before, v_audit_after,
      p_ip, p_correlation_id, now()
    );

    return jsonb_build_object('id', p_place_id, 'archived', true, 'status', 'archived', 'place', to_jsonb(v_new_record));
  end if;
end;
$$ language plpgsql security definer
set search_path = public, pg_temp;

revoke all on function public.admin_delete_place_atomic(uuid, text, text, bigint, boolean, text, text) from public, anon, authenticated;
grant execute on function public.admin_delete_place_atomic(uuid, text, text, bigint, boolean, text, text) to service_role;

-- 3.4. Cập nhật / Kiểm duyệt bình luận (Comment Update Atomic Transaction)
create or replace function public.admin_update_comment_atomic(
  p_actor_id uuid,
  p_actor_email text,
  p_actor_role text,
  p_comment_id bigint,
  p_patch jsonb,
  p_ip text,
  p_correlation_id text
) returns jsonb as $$
declare
  v_old_record public.place_comments%rowtype;
  v_new_record public.place_comments%rowtype;
  v_audit_before jsonb;
  v_audit_after jsonb;
  v_action text;
begin
  -- Validate role: Chỉ admin hoặc moderator mới có quyền kiểm duyệt bình luận
  if p_actor_role is null or p_actor_role not in ('admin', 'moderator') then
    raise exception 'FORBIDDEN: Chỉ admin hoặc moderator mới có quyền kiểm duyệt bình luận' using errcode = '42501';
  end if;

  -- Khóa dòng dữ liệu và kiểm tra NOT_FOUND
  select * into v_old_record from public.place_comments where id = p_comment_id for update;
  if not found then
    raise exception 'NOT_FOUND: Không tìm thấy bình luận %', p_comment_id using errcode = 'P0002';
  end if;

  -- Cập nhật chỉ các trường kiểm duyệt cho phép (status, is_hidden)
  update public.place_comments
  set
    status = case when p_patch ? 'status' then p_patch->>'status' else status end,
    is_hidden = case when p_patch ? 'is_hidden' then (p_patch->>'is_hidden')::boolean else is_hidden end,
    updated_at = now()
  where id = p_comment_id
  returning * into v_new_record;

  -- Audit payload allowlist nghiêm ngặt (TUYỆT ĐỐI KHÔNG LƯU author_name, comment_text, photo_url, photo_metadata, client_review_id)
  v_audit_before := jsonb_build_object(
    'id', v_old_record.id,
    'place_id', v_old_record.place_id,
    'place_name', v_old_record.place_name,
    'status', v_old_record.status,
    'is_hidden', v_old_record.is_hidden,
    'rating', v_old_record.rating,
    'updated_at', v_old_record.updated_at
  );

  v_audit_after := jsonb_build_object(
    'id', v_new_record.id,
    'place_id', v_new_record.place_id,
    'place_name', v_new_record.place_name,
    'status', v_new_record.status,
    'is_hidden', v_new_record.is_hidden,
    'rating', v_new_record.rating,
    'updated_at', v_new_record.updated_at
  );

  v_action := case
    when v_new_record.status = 'approved' then 'comment.approve'
    when v_new_record.is_hidden is true or v_new_record.status = 'hidden' then 'comment.hide'
    else 'comment.moderate'
  end;

  insert into public.admin_audit_logs (
    actor_id, actor_email, actor_role, action,
    entity_type, entity_id,
    payload_before, payload_after,
    ip, correlation_id, created_at
  ) values (
    p_actor_id, p_actor_email, p_actor_role, v_action,
    'comment', v_new_record.id::text,
    v_audit_before, v_audit_after,
    p_ip, p_correlation_id, now()
  );

  return to_jsonb(v_new_record);
end;
$$ language plpgsql security definer
set search_path = public, pg_temp;

revoke all on function public.admin_update_comment_atomic(uuid, text, text, bigint, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.admin_update_comment_atomic(uuid, text, text, bigint, jsonb, text, text) to service_role;

-- 3.5. Xóa cứng bình luận (Comment Delete Atomic Transaction)
create or replace function public.admin_delete_comment_atomic(
  p_actor_id uuid,
  p_actor_email text,
  p_actor_role text,
  p_comment_id bigint,
  p_ip text,
  p_correlation_id text
) returns jsonb as $$
declare
  v_old_record public.place_comments%rowtype;
  v_audit_before jsonb;
begin
  -- Validate role: Chỉ admin mới có quyền xóa cứng bình luận
  if p_actor_role is null or p_actor_role <> 'admin' then
    raise exception 'FORBIDDEN: Chỉ admin mới có quyền xóa cứng bình luận' using errcode = '42501';
  end if;

  -- Khóa dòng dữ liệu và kiểm tra NOT_FOUND
  select * into v_old_record from public.place_comments where id = p_comment_id for update;
  if not found then
    raise exception 'NOT_FOUND: Không tìm thấy bình luận %', p_comment_id using errcode = 'P0002';
  end if;

  delete from public.place_comments where id = p_comment_id;

  v_audit_before := jsonb_build_object(
    'id', v_old_record.id,
    'place_id', v_old_record.place_id,
    'place_name', v_old_record.place_name,
    'status', v_old_record.status,
    'is_hidden', v_old_record.is_hidden,
    'rating', v_old_record.rating,
    'updated_at', v_old_record.updated_at
  );

  insert into public.admin_audit_logs (
    actor_id, actor_email, actor_role, action,
    entity_type, entity_id,
    payload_before, payload_after,
    ip, correlation_id, created_at
  ) values (
    p_actor_id, p_actor_email, p_actor_role, 'comment.delete',
    'comment', p_comment_id::text,
    v_audit_before, null,
    p_ip, p_correlation_id, now()
  );

  return jsonb_build_object('id', p_comment_id, 'deleted', true);
end;
$$ language plpgsql security definer
set search_path = public, pg_temp;

revoke all on function public.admin_delete_comment_atomic(uuid, text, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.admin_delete_comment_atomic(uuid, text, text, bigint, text, text) to service_role;

-- 3.6. Cập nhật báo sai (Report Update Atomic Transaction)
create or replace function public.admin_update_report_atomic(
  p_actor_id uuid,
  p_actor_email text,
  p_actor_role text,
  p_report_id uuid,
  p_status text,
  p_admin_notes text,
  p_ip text,
  p_correlation_id text
) returns jsonb as $$
declare
  v_old_record public.place_reports%rowtype;
  v_new_record public.place_reports%rowtype;
  v_target_status text;
  v_audit_before jsonb;
  v_audit_after jsonb;
begin
  -- 1. Validate role trong SQL
  if p_actor_role is null or p_actor_role not in ('admin', 'moderator') then
    raise exception 'FORBIDDEN: Chỉ admin hoặc moderator mới có quyền cập nhật báo cáo' using errcode = '42501';
  end if;

  -- 2. Khóa bản ghi và kiểm tra NOT_FOUND
  select * into v_old_record from public.place_reports where id = p_report_id for update;
  if not found then
    raise exception 'NOT_FOUND: Không tìm thấy báo cáo %', p_report_id using errcode = 'P0002';
  end if;

  -- 3. Validate transition
  v_target_status := coalesce(nullif(trim(p_status), ''), v_old_record.status);
  if v_target_status not in ('pending', 'reviewed', 'resolved', 'dismissed') then
    raise exception 'INVALID_STATUS: Trạng thái % không hợp lệ', v_target_status using errcode = '22023';
  end if;

  if v_old_record.status = 'pending' and v_target_status not in ('pending', 'reviewed', 'resolved', 'dismissed') then
    raise exception 'INVALID_STATUS_TRANSITION: Không thể chuyển từ pending sang %', v_target_status using errcode = '22023';
  elsif v_old_record.status = 'reviewed' and v_target_status not in ('reviewed', 'resolved', 'dismissed') then
    raise exception 'INVALID_STATUS_TRANSITION: Không thể chuyển từ reviewed sang %', v_target_status using errcode = '22023';
  elsif v_old_record.status = 'resolved' and v_target_status not in ('resolved', 'reviewed') then
    raise exception 'INVALID_STATUS_TRANSITION: Không thể chuyển từ resolved sang %', v_target_status using errcode = '22023';
  elsif v_old_record.status = 'dismissed' and v_target_status not in ('dismissed', 'reviewed') then
    raise exception 'INVALID_STATUS_TRANSITION: Không thể chuyển từ dismissed sang %', v_target_status using errcode = '22023';
  end if;

  -- 4. Cập nhật chỉ các field allowlist (status, admin_notes, reviewed_at)
  update public.place_reports
  set status = v_target_status,
      admin_notes = coalesce(p_admin_notes, admin_notes),
      reviewed_at = now()
  where id = p_report_id
  returning * into v_new_record;

  -- 5. Tạo audit payload loại bỏ toàn bộ PII (chỉ dùng field trong allowlist)
  -- Không lưu reporter_contact, details, ip, client_report_id
  v_audit_before := jsonb_build_object(
    'id', v_old_record.id,
    'place_id', v_old_record.place_id,
    'place_name', v_old_record.place_name,
    'issue_type', v_old_record.issue_type,
    'status', v_old_record.status,
    'admin_notes', v_old_record.admin_notes,
    'reviewed_at', v_old_record.reviewed_at
  );

  v_audit_after := jsonb_build_object(
    'id', v_new_record.id,
    'place_id', v_new_record.place_id,
    'place_name', v_new_record.place_name,
    'issue_type', v_new_record.issue_type,
    'status', v_new_record.status,
    'admin_notes', v_new_record.admin_notes,
    'reviewed_at', v_new_record.reviewed_at
  );

  -- 6. Insert audit log trong cùng transaction (tự động rollback nếu lỗi)
  insert into public.admin_audit_logs (
    actor_id, actor_email, actor_role, action,
    entity_type, entity_id,
    payload_before, payload_after,
    ip, correlation_id, created_at
  ) values (
    p_actor_id, p_actor_email, p_actor_role, 'report.' || v_new_record.status,
    'report', p_report_id::text,
    v_audit_before, v_audit_after,
    p_ip, p_correlation_id, now()
  );

  return to_jsonb(v_new_record);
end;
$$ language plpgsql security definer
set search_path = public, pg_temp;

revoke all on function public.admin_update_report_atomic(uuid, text, text, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_update_report_atomic(uuid, text, text, uuid, text, text, text, text) to service_role;
