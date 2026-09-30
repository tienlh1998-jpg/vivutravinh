-- ============================================================================
-- ViVuTraVinh - G10 Rollback: UGC & Moderation Architecture
-- Kịch bản hoàn tác an toàn (Rollback Script)
-- ============================================================================

-- 1. Hoàn tác Policies & Trigger Profiles
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

drop policy if exists "profiles_public_read" on public.profiles;
drop policy if exists "profiles_self_update" on public.profiles;
drop policy if exists "profiles_service_role_all" on public.profiles;
-- Không DROP TABLE public.profiles để tránh mất mát dữ liệu hồ sơ nếu đã tạo

-- 2. Hoàn tác Policies Bảng Câu Lạc Bộ
drop policy if exists "clubs_public_read_approved" on public.clubs;
drop policy if exists "clubs_leader_read_own" on public.clubs;
drop policy if exists "clubs_leader_insert" on public.clubs;
drop policy if exists "clubs_leader_update_draft" on public.clubs;
drop policy if exists "clubs_service_role_all" on public.clubs;

-- Khôi phục policy public read ban đầu
create policy "clubs_public_read_approved"
  on public.clubs
  for select
  to public
  using (status = 'approved');

-- 3. Hoàn tác Policies Bảng Bài Viết Cộng Đồng
drop policy if exists "community_posts_public_read_approved" on public.community_posts;
drop policy if exists "community_posts_author_read_own" on public.community_posts;
drop policy if exists "community_posts_author_insert" on public.community_posts;
drop policy if exists "community_posts_author_update_draft" on public.community_posts;
drop policy if exists "community_posts_author_delete_draft" on public.community_posts;
drop policy if exists "community_posts_service_role_all" on public.community_posts;

-- Khôi phục policy ban đầu
create policy "community_posts_public_read"
  on public.community_posts
  for select
  to public
  using (status = 'approved');
