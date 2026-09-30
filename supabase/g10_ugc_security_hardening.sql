-- ============================================================================
-- ViVuTraVinh - G10 Security Hardening & Privilege Escalation Prevention Patch
-- Tệp bản vá an toàn: Chạy trực tiếp trên trạng thái DB hiện tại (Idempotent)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. BẢO VỆ PROFILES: CHỐNG NÂNG QUYỀN (ROLE ESCALATION) & BẢO VỆ EMAIL / PHONE
-- ----------------------------------------------------------------------------

-- 1.1 Trigger bảo vệ các trường bất biến: role, email trên public.profiles
create or replace function public.protect_profile_immutable_fields()
returns trigger as $$
declare
  is_admin_or_service boolean := false;
begin
  -- Kiểm tra xem caller có phải service_role không
  if (current_user = 'service_role' or 
      coalesce(auth.jwt()->>'role', '') = 'service_role' or 
      coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role') then
    is_admin_or_service := true;
  end if;

  -- Nếu không phải service_role:
  if not is_admin_or_service then
    -- Cấm tuyệt đối người dùng tự ý thay đổi vai trò (role) của chính mình qua REST
    if (OLD.role is distinct from NEW.role) then
      raise exception 'SECURITY_VIOLATION: Người dùng không có quyền thay đổi vai trò (role).' using errcode = '42501';
    end if;

    -- Email chỉ được đồng bộ từ auth.users qua trigger hệ thống, không cho sửa qua client REST
    if (OLD.email is distinct from NEW.email) then
      raise exception 'SECURITY_VIOLATION: Email được quản lý tự động bởi hệ thống xác thực Auth.' using errcode = '42501';
    end if;
  end if;

  NEW.updated_at := now();
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_protect_profile_immutable_fields on public.profiles;
create trigger trg_protect_profile_immutable_fields
  before update on public.profiles
  for each row execute function public.protect_profile_immutable_fields();

-- 1.2 Thu hẹp RLS SELECT trên public.profiles: Người dùng CHỈ xem được profile của chính mình
-- Khách vãng lai và người dùng khác không thể đọc email/phone của người khác
drop policy if exists "profiles_public_read" on public.profiles;
drop policy if exists "profiles_self_read" on public.profiles;
create policy "profiles_self_read"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- 1.3 Tạo Secure View công khai (public_profiles) chỉ trả về thông tin an toàn (Display Name, Avatar, Bio, Badges)
-- Hoàn toàn loại bỏ email, phone, role nhạy cảm
drop view if exists public.public_profiles;
create or replace view public.public_profiles as
  select 
    id, 
    display_name, 
    avatar_url, 
    bio, 
    badges, 
    created_at
  from public.profiles;

grant select on public.public_profiles to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. BẢO VỆ BÀI VIẾT CỘNG ĐỒNG: BUỘC CHỈ TẠO/SỬA Ở TRẠNG THÁI DRAFT / PENDING
-- ----------------------------------------------------------------------------

-- 2.1 Cập nhật RLS Policy INSERT cho community_posts: Cấm tự gán status = 'approved'
drop policy if exists "community_posts_author_insert" on public.community_posts;
create policy "community_posts_author_insert"
  on public.community_posts
  for insert
  to authenticated
  with check (
    auth.uid() = author_id 
    and status in ('draft', 'pending')
    and moderated_by is null
    and moderated_at is null
  );

-- 2.2 Cập nhật RLS Policy UPDATE cho community_posts: Tác giả chỉ sửa được draft/rejected và chỉ đưa về draft/pending
drop policy if exists "community_posts_author_update_draft" on public.community_posts;
create policy "community_posts_author_update_draft"
  on public.community_posts
  for update
  to authenticated
  using (
    auth.uid() = author_id 
    and status in ('draft', 'rejected')
  )
  with check (
    auth.uid() = author_id 
    and status in ('draft', 'pending')
    and moderated_by is null
    and moderated_at is null
  );

-- 2.3 Trigger bảo vệ cấp cơ sở dữ liệu (Defense-in-depth) cho community_posts
create or replace function public.enforce_community_post_author_guard()
returns trigger as $$
declare
  is_privileged boolean := false;
begin
  if (current_user = 'service_role' or 
      coalesce(auth.jwt()->>'role', '') = 'service_role' or 
      coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role') then
    is_privileged := true;
  end if;

  if not is_privileged then
    -- Bắt buộc author_id phải là auth.uid()
    if (TG_OP = 'INSERT') then
      if (NEW.author_id is distinct from auth.uid()) then
        raise exception 'SECURITY_VIOLATION: author_id phải trùng khớp với tài khoản đăng nhập.' using errcode = '42501';
      end if;
      if (NEW.status not in ('draft', 'pending')) then
        raise exception 'SECURITY_VIOLATION: Bài viết do người dùng tạo chỉ được ở trạng thái draft hoặc pending.' using errcode = '42501';
      end if;
      if (NEW.moderated_by is not null or NEW.moderated_at is not null) then
        raise exception 'SECURITY_VIOLATION: Người dùng không được can thiệp dữ liệu kiểm duyệt.' using errcode = '42501';
      end if;
    elsif (TG_OP = 'UPDATE') then
      if (OLD.author_id is distinct from auth.uid()) then
        raise exception 'SECURITY_VIOLATION: Không có quyền sửa bài viết của người khác.' using errcode = '42501';
      end if;
      if (NEW.status not in ('draft', 'pending')) then
        raise exception 'SECURITY_VIOLATION: Người dùng không thể tự phê duyệt bài viết.' using errcode = '42501';
      end if;
      if (NEW.moderated_by is not null or NEW.moderated_at is not null) then
        raise exception 'SECURITY_VIOLATION: Người dùng không được can thiệp dữ liệu kiểm duyệt.' using errcode = '42501';
      end if;
    end if;
  end if;

  NEW.updated_at := now();
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_enforce_community_post_author_guard on public.community_posts;
create trigger trg_enforce_community_post_author_guard
  before insert or update on public.community_posts
  for each row execute function public.enforce_community_post_author_guard();

-- ----------------------------------------------------------------------------
-- 3. BẢO VỆ CÂU LẠC BỘ: BUỘC CHỈ TẠO/SỬA Ở TRẠNG THÁI DRAFT / PENDING & BẢO VỆ SĐT
-- ----------------------------------------------------------------------------

-- 3.1 Cập nhật RLS Policy INSERT cho clubs: Cấm tự gán status = 'approved'
drop policy if exists "clubs_leader_insert" on public.clubs;
create policy "clubs_leader_insert"
  on public.clubs
  for insert
  to authenticated
  with check (
    auth.uid() = leader_id 
    and status in ('draft', 'pending')
    and moderated_by is null
    and moderated_at is null
  );

-- 3.2 Cập nhật RLS Policy UPDATE cho clubs: Leader chỉ sửa draft/rejected và đưa về draft/pending
drop policy if exists "clubs_leader_update_draft" on public.clubs;
create policy "clubs_leader_update_draft"
  on public.clubs
  for update
  to authenticated
  using (
    auth.uid() = leader_id 
    and status in ('draft', 'rejected')
  )
  with check (
    auth.uid() = leader_id 
    and status in ('draft', 'pending')
    and moderated_by is null
    and moderated_at is null
  );

-- 3.3 Trigger bảo vệ cấp cơ sở dữ liệu (Defense-in-depth) cho clubs
create or replace function public.enforce_club_leader_guard()
returns trigger as $$
declare
  is_privileged boolean := false;
begin
  if (current_user = 'service_role' or 
      coalesce(auth.jwt()->>'role', '') = 'service_role' or 
      coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role') then
    is_privileged := true;
  end if;

  if not is_privileged then
    if (TG_OP = 'INSERT') then
      if (NEW.leader_id is distinct from auth.uid()) then
        raise exception 'SECURITY_VIOLATION: leader_id phải trùng khớp với tài khoản đăng nhập.' using errcode = '42501';
      end if;
      if (NEW.status not in ('draft', 'pending')) then
        raise exception 'SECURITY_VIOLATION: Hồ sơ CLB mới chỉ được ở trạng thái draft hoặc pending.' using errcode = '42501';
      end if;
      if (NEW.moderated_by is not null or NEW.moderated_at is not null) then
        raise exception 'SECURITY_VIOLATION: Người dùng không được can thiệp dữ liệu kiểm duyệt.' using errcode = '42501';
      end if;
    elsif (TG_OP = 'UPDATE') then
      if (OLD.leader_id is distinct from auth.uid()) then
        raise exception 'SECURITY_VIOLATION: Không có quyền sửa CLB của người khác.' using errcode = '42501';
      end if;
      if (NEW.status not in ('draft', 'pending')) then
        raise exception 'SECURITY_VIOLATION: Người dùng không thể tự cấp phép duyệt CLB.' using errcode = '42501';
      end if;
      if (NEW.moderated_by is not null or NEW.moderated_at is not null) then
        raise exception 'SECURITY_VIOLATION: Người dùng không được can thiệp dữ liệu kiểm duyệt.' using errcode = '42501';
      end if;
    end if;
  end if;

  NEW.updated_at := now();
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_enforce_club_leader_guard on public.clubs;
create trigger trg_enforce_club_leader_guard
  before insert or update on public.clubs
  for each row execute function public.enforce_club_leader_guard();

-- 3.4 Tạo Secure View công khai cho CLB (public_clubs): Loại bỏ hoàn toàn leader_phone và cột kiểm duyệt
drop view if exists public.public_clubs;
create or replace view public.public_clubs as
  select 
    id, 
    name, 
    slug, 
    category, 
    category_name, 
    badge, 
    members_count, 
    activities_count, 
    image, 
    description, 
    last_activity, 
    schedule_info, 
    meeting_place, 
    icon, 
    color, 
    leader_id, 
    leader_name, 
    status, 
    created_at
  from public.clubs
  where status = 'approved';

grant select on public.public_clubs to anon, authenticated;
