-- ============================================================================
-- ViVuTraVinh - G10 Migration: UGC & Moderation Architecture
-- Đồng nhất Schema, Quản lý Vòng đời Nội dung, Xác thực Supabase Auth & RLS
-- ============================================================================

-- 1. BẢNG HỒ SƠ NGƯỜI DÙNG THẬT (public.profiles)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text not null,
  avatar_url text default '/icons/icon.svg',
  phone text,
  bio text,
  role text not null default 'member' check (role in ('member', 'contributor', 'moderator', 'admin')),
  badges text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_role on public.profiles(role);

alter table public.profiles enable row level security;

drop policy if exists "profiles_public_read" on public.profiles;
create policy "profiles_public_read"
  on public.profiles
  for select
  to public
  using (true);

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_service_role_all" on public.profiles;
create policy "profiles_service_role_all"
  on public.profiles
  for all
  to service_role
  using (true)
  with check (true);

-- Trigger tự động tạo hồ sơ profile khi người dùng đăng ký qua Supabase Auth
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', '/icons/icon.svg')
  )
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================================
-- 2. BẢNG CÂU LẠC BỘ (public.clubs)
-- ============================================================================
create table if not exists public.clubs (
  id text primary key,
  name text not null,
  slug text,
  category text not null check (category in ('di-san', 'da-ngoai', 'am-thuc', 'the-thao', 'nghe-thuat', 'khac')),
  category_name text,
  badge text,
  members_count int not null default 1,
  activities_count int not null default 0,
  image text,
  description text,
  last_activity text,
  schedule_info text,
  meeting_place text,
  icon text default 'groups',
  color text default 'emerald',
  leader_id uuid references auth.users(id) on delete set null,
  leader_name text,
  leader_phone text,
  status text not null default 'pending' check (status in ('draft', 'pending', 'approved', 'rejected', 'archived')),
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz,
  moderation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bổ sung các cột nếu bảng đã tồn tại từ migration trước
alter table public.clubs
  add column if not exists leader_id uuid references auth.users(id) on delete set null,
  add column if not exists moderated_by uuid references auth.users(id) on delete set null,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderation_reason text;

-- Cập nhật check constraint trạng thái nếu cần
do $$
begin
  alter table public.clubs drop constraint if exists clubs_status_check;
  alter table public.clubs add constraint clubs_status_check check (status in ('draft', 'pending', 'approved', 'rejected', 'archived'));
exception
  when others then null;
end $$;

create index if not exists idx_clubs_category on public.clubs(category);
create index if not exists idx_clubs_status on public.clubs(status);
create index if not exists idx_clubs_leader on public.clubs(leader_id);

alter table public.clubs enable row level security;

-- Public chỉ đọc CLB đã duyệt
drop policy if exists "clubs_public_read_approved" on public.clubs;
create policy "clubs_public_read_approved"
  on public.clubs
  for select
  to public
  using (status = 'approved');

-- Chủ nhiệm CLB đọc được CLB của mình ở mọi trạng thái
drop policy if exists "clubs_leader_read_own" on public.clubs;
create policy "clubs_leader_read_own"
  on public.clubs
  for select
  to authenticated
  using (auth.uid() = leader_id);

-- Người dùng đăng nhập có quyền đăng ký thành lập CLB
drop policy if exists "clubs_leader_insert" on public.clubs;
create policy "clubs_leader_insert"
  on public.clubs
  for insert
  to authenticated
  with check (auth.uid() = leader_id);

-- Chủ nhiệm chỉ được sửa khi CLB đang ở bản nháp hoặc bị từ chối
drop policy if exists "clubs_leader_update_draft" on public.clubs;
create policy "clubs_leader_update_draft"
  on public.clubs
  for update
  to authenticated
  using (auth.uid() = leader_id and status in ('draft', 'rejected'))
  with check (auth.uid() = leader_id and status in ('draft', 'pending'));

drop policy if exists "clubs_service_role_all" on public.clubs;
create policy "clubs_service_role_all"
  on public.clubs
  for all
  to service_role
  using (true)
  with check (true);


-- ============================================================================
-- 3. BẢNG BÀI VIẾT CỘNG ĐỒNG (public.community_posts)
-- ============================================================================
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  club_id text references public.clubs(id) on delete set null,
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  author_avatar text,
  category text,
  title text,
  content text not null,
  images text[] default '{}',
  likes_count int not null default 0,
  comments_count int not null default 0,
  ai_safety_score numeric default 1.0,
  status text not null default 'pending' check (status in ('draft', 'pending', 'approved', 'rejected', 'archived')),
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz,
  moderation_reason text,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bổ sung các cột nếu bảng đã tồn tại từ migration trước
alter table public.community_posts
  add column if not exists moderated_by uuid references auth.users(id) on delete set null,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderation_reason text;

-- Cập nhật check constraint trạng thái
do $$
begin
  alter table public.community_posts drop constraint if exists community_posts_status_check;
  alter table public.community_posts add constraint community_posts_status_check check (status in ('draft', 'pending', 'approved', 'rejected', 'archived'));
exception
  when others then null;
end $$;

create index if not exists idx_community_posts_club on public.community_posts(club_id);
create index if not exists idx_community_posts_status on public.community_posts(status);
create index if not exists idx_community_posts_author on public.community_posts(author_id);
create index if not exists idx_community_posts_created on public.community_posts(created_at desc);

alter table public.community_posts enable row level security;

-- Public chỉ đọc bài đã duyệt
drop policy if exists "community_posts_public_read_approved" on public.community_posts;
create policy "community_posts_public_read_approved"
  on public.community_posts
  for select
  to public
  using (status = 'approved');

-- Tác giả đọc được bài của mình ở mọi trạng thái
drop policy if exists "community_posts_author_read_own" on public.community_posts;
create policy "community_posts_author_read_own"
  on public.community_posts
  for select
  to authenticated
  using (auth.uid() = author_id);

-- Tác giả đăng bài mới (luôn gán author_id là chính mình)
drop policy if exists "community_posts_author_insert" on public.community_posts;
create policy "community_posts_author_insert"
  on public.community_posts
  for insert
  to authenticated
  with check (auth.uid() = author_id);

-- Tác giả chỉ được sửa khi đang ở bản nháp hoặc bị từ chối
drop policy if exists "community_posts_author_update_draft" on public.community_posts;
create policy "community_posts_author_update_draft"
  on public.community_posts
  for update
  to authenticated
  using (auth.uid() = author_id and status in ('draft', 'rejected'))
  with check (auth.uid() = author_id and status in ('draft', 'pending'));

-- Tác giả chỉ được xóa bài của mình khi đang ở bản nháp hoặc bị từ chối
drop policy if exists "community_posts_author_delete_draft" on public.community_posts;
create policy "community_posts_author_delete_draft"
  on public.community_posts
  for delete
  to authenticated
  using (auth.uid() = author_id and status in ('draft', 'rejected'));

drop policy if exists "community_posts_service_role_all" on public.community_posts;
create policy "community_posts_service_role_all"
  on public.community_posts
  for all
  to service_role
  using (true)
  with check (true);
