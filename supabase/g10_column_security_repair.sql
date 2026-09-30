-- ============================================================================
-- ViVuTraVinh - G10 Comprehensive Privacy & Privilege Hardening Patch (v3)
-- Giữ nguyên cột admin_notes, bảo vệ cột riêng tư qua Column-Level Privileges & RLS
-- 1. Gỡ bỏ mọi policy đọc công khai cũ & mới trên bảng gốc:
--    - clubs_public_read, clubs_public_read_approved
--    - community_posts_public_read (từ migration cũ g10_modern_features.sql)
--    - community_posts_public_read_approved (từ g10_ugc_moderation.sql)
-- 2. Chỉ cho tác giả / chủ nhiệm đọc dòng của mình trên bảng gốc qua RLS:
--    - clubs: auth.uid() = leader_id
--    - community_posts: auth.uid() = author_id
-- 3. Thu hồi SELECT toàn bảng của authenticated và anon, chỉ cấp quyền các cột cần thiết:
--    - clubs: cấp các cột cần thiết bao gồm leader_phone (chỉ leader đọc được qua RLS)
--    - community_posts: cấp các cột cần thiết bao gồm moderation_reason, LOẠI TRỪ admin_notes
-- 4. Giữ các Secure Views (public_clubs, public_community_posts, public_profiles) cho feed công khai
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. BẢO VỆ BẢNG GỐC CLUBS: THU HỒI ĐỌC CÔNG KHAI & PHÂN QUYỀN CỘT
-- ----------------------------------------------------------------------------

-- 1.1 Gỡ bỏ toàn bộ policy đọc công khai trên bảng gốc clubs
drop policy if exists "clubs_public_read" on public.clubs;
drop policy if exists "clubs_public_read_approved" on public.clubs;
drop policy if exists "clubs_leader_read_own" on public.clubs;

-- 1.2 Chỉ cho phép chủ nhiệm đọc bản ghi CLB của chính mình trên bảng gốc
create policy "clubs_leader_read_own"
  on public.clubs
  for select
  to authenticated
  using (auth.uid() = leader_id);

-- 1.3 Thu hồi quyền SELECT toàn bảng clubs đối với anon, authenticated, public
revoke select on table public.clubs from anon, authenticated, public;

-- 1.4 Cấp quyền SELECT trên các cột cần thiết cho authenticated (bao gồm leader_phone cho chủ nhiệm)
grant select (
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
  leader_phone,
  status,
  created_at,
  updated_at
) on table public.clubs to authenticated;

-- 1.5 Cập nhật Secure View public_clubs: Điểm truy cập công khai duy nhất cho CLB đã duyệt (Loại bỏ 100% leader_phone)
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


-- ----------------------------------------------------------------------------
-- 2. BẢO VỆ BẢNG GỐC COMMUNITY_POSTS: THU HỒI ĐỌC CÔNG KHAI & LOẠI TRỪ ADMIN_NOTES
-- ----------------------------------------------------------------------------

-- 2.1 Gỡ bỏ toàn bộ policy đọc công khai trên bảng gốc community_posts (kể cả từ migration cũ)
drop policy if exists "community_posts_public_read" on public.community_posts;
drop policy if exists "community_posts_public_read_approved" on public.community_posts;
drop policy if exists "community_posts_author_read_own" on public.community_posts;

-- 2.2 Chỉ cho phép tác giả đọc bài viết của chính mình trên bảng gốc
create policy "community_posts_author_read_own"
  on public.community_posts
  for select
  to authenticated
  using (auth.uid() = author_id);

-- 2.3 Thu hồi quyền SELECT toàn bảng community_posts đối với anon, authenticated, public
revoke select on table public.community_posts from anon, authenticated, public;

-- 2.4 Cấp quyền SELECT trên các cột cần thiết cho authenticated:
-- Cho phép tác giả xem moderation_reason (để xem lý do từ chối nếu có),
-- LOẠI TRỪ HOÀN TOÀN admin_notes (admin_notes chỉ dành riêng cho admin qua service_role)
grant select (
  id,
  club_id,
  author_id,
  author_name,
  author_avatar,
  category,
  title,
  content,
  images,
  likes_count,
  comments_count,
  ai_safety_score,
  status,
  moderated_by,
  moderated_at,
  moderation_reason,
  created_at,
  updated_at
) on table public.community_posts to authenticated;

-- 2.5 Tạo Secure View public_community_posts: Điểm truy cập công khai duy nhất cho bài viết đã duyệt
-- (Loại bỏ 100% moderation_reason, admin_notes, ai_safety_score, moderated_by, moderated_at)
drop view if exists public.public_community_posts;
create or replace view public.public_community_posts as
  select 
    id, 
    club_id, 
    author_id, 
    author_name, 
    author_avatar, 
    category, 
    title, 
    content, 
    images, 
    likes_count, 
    comments_count, 
    status, 
    created_at, 
    updated_at
  from public.community_posts
  where status = 'approved';

grant select on public.public_community_posts to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3. BẢO ĐẢM SECURE VIEW PUBLIC_PROFILES VẪN HOẠT ĐỘNG
-- ----------------------------------------------------------------------------
grant select on public.public_profiles to anon, authenticated;
