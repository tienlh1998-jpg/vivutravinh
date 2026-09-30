-- ============================================================================
-- ViVuTraVinh - G10 Column-Level Security Hardening Patch
-- Khóa quyền đọc các cột riêng tư trên bảng gốc clubs & community_posts
-- Bảo vệ leader_phone, moderation_reason, admin_notes trước anon key
-- Idempotent & Non-destructive: Có thể chạy trực tiếp trên trạng thái DB hiện tại
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. KHÓA CỘT RIÊNG TƯ TRÊN BẢNG GỐC CLUBS
-- ----------------------------------------------------------------------------

-- 1.1 Thu hồi toàn bộ quyền SELECT trên bảng gốc clubs đối với anon và authenticated
revoke select on table public.clubs from anon;
revoke select on table public.clubs from authenticated;

-- 1.2 Chỉ cấp quyền SELECT trên các cột CÔNG KHAI cho anon:
-- Loại bỏ hoàn toàn: leader_phone, moderated_by, moderated_at, moderation_reason
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
  status,
  created_at,
  updated_at
) on table public.clubs to anon;

-- 1.3 Cấp quyền SELECT trên các cột công khai cho authenticated:
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
  status,
  created_at,
  updated_at
) on table public.clubs to authenticated;


-- ----------------------------------------------------------------------------
-- 2. KHÓA CỘT RIÊNG TƯ TRÊN BẢNG GỐC COMMUNITY_POSTS
-- ----------------------------------------------------------------------------

-- 2.1 Thu hồi toàn bộ quyền SELECT trên bảng gốc community_posts đối với anon và authenticated
revoke select on table public.community_posts from anon;
revoke select on table public.community_posts from authenticated;

-- 2.2 Cấp quyền SELECT trên các cột CÔNG KHAI cho anon:
-- Loại bỏ hoàn toàn: moderation_reason, admin_notes, moderated_by, moderated_at, ai_safety_score
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
  status,
  created_at,
  updated_at
) on table public.community_posts to anon;

-- 2.3 Cấp quyền SELECT cho authenticated:
-- Cho phép tác giả xem moderation_reason (để biết lý do từ chối nếu có),
-- nhưng KHÓA HOÀN TOÀN: admin_notes, ai_safety_score, moderated_by, moderated_at
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
  status,
  moderation_reason,
  created_at,
  updated_at
) on table public.community_posts to authenticated;


-- ----------------------------------------------------------------------------
-- 3. BẢO ĐẢM QUYỀN ĐỌC TRÊN CÁC SECURE VIEW CÔNG KHAI
-- ----------------------------------------------------------------------------

-- Secure View public_clubs: Đã được định nghĩa sẵn chỉ chứa 19 cột công khai an toàn
grant select on public.public_clubs to anon, authenticated;

-- Secure View public_profiles: Đã được định nghĩa sẵn chỉ chứa các trường hiển thị công khai
grant select on public.public_profiles to anon, authenticated;
