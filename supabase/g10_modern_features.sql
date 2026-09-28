-- ============================================================================
-- ViVuTraVinh - G10 Migration: Modern Features Architecture
-- Các tính năng mới từ Phase 5 đến Phase 11:
-- 1. CLB Du Lịch Trà Vinh (Clubs, Members)
-- 2. Bài viết & Thảo luận Cộng đồng (Community Posts & Comments)
-- 3. Sự Kiện & Lễ Hội Ok Om Bok (Events & Grandstand RSVPs)
-- 4. Quỹ Tri Ân & Ủng Hộ ViVuTraVinh (Donations & Supporter Wall)
-- 5. Lộ Trình & Thư Mục Lịch Trình Lưu Trữ (Saved Itineraries)
-- 6. Hồ Sơ Người Dùng & Huy Hiệu Du Lịch (User Profiles & Badges)
-- 7. Làm Giàu Dữ Liệu Di Sản Chuyên Sâu (Places Heritage Enrichment)
-- Bản migration hoàn toàn Idempotent (an toàn khi chạy lặp lại).
-- ============================================================================

-- ============================================================================
-- 1. BẢNG CÂU LẠC BỘ DU LỊCH (clubs)
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
  icon text default 'group',
  color text default 'emerald',
  leader_name text,
  leader_phone text,
  status text not null default 'approved' check (status in ('pending', 'approved', 'rejected', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clubs_category on public.clubs(category);
create index if not exists idx_clubs_status on public.clubs(status);

alter table public.clubs enable row level security;

-- RLS: Public & Anon chỉ đọc các CLB đã được phê duyệt
drop policy if exists "clubs_public_read_approved" on public.clubs;
create policy "clubs_public_read_approved"
  on public.clubs
  for select
  to public
  using (status = 'approved');

-- RLS: Service Role có toàn quyền quản trị
drop policy if exists "clubs_service_role_all" on public.clubs;
create policy "clubs_service_role_all"
  on public.clubs
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================================
-- 2. BẢNG THÀNH VIÊN CLB (club_members)
-- ============================================================================
create table if not exists public.club_members (
  id uuid primary key default gen_random_uuid(),
  club_id text not null references public.clubs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  user_name text not null,
  user_phone text,
  role text not null default 'member' check (role in ('leader', 'moderator', 'member')),
  status text not null default 'active' check (status in ('active', 'pending', 'banned')),
  joined_at timestamptz not null default now(),
  unique(club_id, user_id)
);

create index if not exists idx_club_members_club on public.club_members(club_id);
create index if not exists idx_club_members_user on public.club_members(user_id);

alter table public.club_members enable row level security;

drop policy if exists "club_members_public_read" on public.club_members;
create policy "club_members_public_read"
  on public.club_members
  for select
  to public
  using (status = 'active');

drop policy if exists "club_members_service_role_all" on public.club_members;
create policy "club_members_service_role_all"
  on public.club_members
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================================
-- 3. BẢNG BÀI VIẾT & THẢO LUẬN CỘNG ĐỒNG (community_posts)
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
  status text not null default 'approved' check (status in ('pending', 'approved', 'flagged', 'rejected')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_community_posts_club on public.community_posts(club_id);
create index if not exists idx_community_posts_status on public.community_posts(status);
create index if not exists idx_community_posts_created on public.community_posts(created_at desc);

alter table public.community_posts enable row level security;

drop policy if exists "community_posts_public_read" on public.community_posts;
create policy "community_posts_public_read"
  on public.community_posts
  for select
  to public
  using (status = 'approved');

drop policy if exists "community_posts_service_role_all" on public.community_posts;
create policy "community_posts_service_role_all"
  on public.community_posts
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================================
-- 4. BẢNG SỰ KIỆN & LỄ HỘI (events)
-- ============================================================================
create table if not exists public.events (
  id text primary key,
  name text not null,
  original_name text,
  season text check (season in ('spring', 'summer', 'autumn', 'winter', 'year_round')),
  season_name text,
  badge text,
  lunar_date text,
  solar_date_estimate text,
  target_date timestamptz,
  location_name text,
  location_place_id text,
  hero_image text,
  summary text,
  significance text,
  timeline jsonb default '[]'::jsonb,
  total_slots int not null default 1000,
  booked_slots int not null default 0,
  is_free boolean not null default true,
  status text not null default 'upcoming' check (status in ('upcoming', 'happening', 'ended', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists idx_events_status on public.events(status);

alter table public.events enable row level security;

drop policy if exists "events_public_read" on public.events;
create policy "events_public_read"
  on public.events
  for select
  to public
  using (true);

drop policy if exists "events_service_role_all" on public.events;
create policy "events_service_role_all"
  on public.events
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================================
-- 5. BẢNG ĐĂNG KÝ VÉ KHÁN ĐÀI LỄ HỘI (event_rsvps)
-- ============================================================================
create table if not exists public.event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events(id) on delete cascade,
  client_rsvp_id text unique,
  attendee_name text not null,
  phone text not null,
  email text,
  stand_zone text not null default 'Khán đài A',
  ticket_code text not null unique,
  qr_data text,
  status text not null default 'confirmed' check (status in ('confirmed', 'checked_in', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists idx_event_rsvps_event on public.event_rsvps(event_id);
create index if not exists idx_event_rsvps_ticket on public.event_rsvps(ticket_code);

alter table public.event_rsvps enable row level security;

drop policy if exists "event_rsvps_service_role_all" on public.event_rsvps;
create policy "event_rsvps_service_role_all"
  on public.event_rsvps
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================================
-- 6. BẢNG QUỸ TRI ÂN & ỦNG HỘ DỰ ÁN (donations)
-- ============================================================================
create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  donor_name text not null,
  amount numeric not null check (amount > 0),
  message text,
  payment_method text not null default 'vietqr' check (payment_method in ('vietqr', 'momo', 'bank_transfer', 'other')),
  transaction_id text unique,
  is_anonymous boolean not null default false,
  status text not null default 'completed' check (status in ('pending', 'completed', 'refunded')),
  created_at timestamptz not null default now()
);

create index if not exists idx_donations_status on public.donations(status);
create index if not exists idx_donations_created on public.donations(created_at desc);

alter table public.donations enable row level security;

-- Cho phép xem danh sách tri ân công khai
drop policy if exists "donations_public_read_completed" on public.donations;
create policy "donations_public_read_completed"
  on public.donations
  for select
  to public
  using (status = 'completed');

drop policy if exists "donations_service_role_all" on public.donations;
create policy "donations_service_role_all"
  on public.donations
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================================
-- 7. BẢNG LƯU TRỮ LỊCH TRÌNH DU LỊCH (saved_itineraries)
-- ============================================================================
create table if not exists public.saved_itineraries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  client_folder_id text,
  folder_name text not null,
  title text not null,
  stops jsonb not null default '[]'::jsonb,
  estimated_cost numeric default 0,
  total_distance_km numeric default 0,
  total_duration_hours numeric default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_saved_itineraries_user on public.saved_itineraries(user_id);

alter table public.saved_itineraries enable row level security;

-- Người dùng đăng nhập chỉ đọc và ghi lịch trình của chính mình
drop policy if exists "itineraries_owner_select" on public.saved_itineraries;
create policy "itineraries_owner_select"
  on public.saved_itineraries
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "itineraries_owner_insert" on public.saved_itineraries;
create policy "itineraries_owner_insert"
  on public.saved_itineraries
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "itineraries_owner_update" on public.saved_itineraries;
create policy "itineraries_owner_update"
  on public.saved_itineraries
  for update
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "itineraries_service_role_all" on public.saved_itineraries;
create policy "itineraries_service_role_all"
  on public.saved_itineraries
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================================
-- 8. LÀM GIÀU DỮ LIỆU DI SẢN CHUYÊN SÂU TRÊN BẢNG PLACES
-- ============================================================================
alter table public.places
  add column if not exists heritage_details jsonb default '{}'::jsonb,
  add column if not exists audio_guide_url text;

-- ============================================================================
-- 9. SEED DỮ LIỆU KHỞI TẠO MẪU (CLB & SỰ KIỆN OK OM BOK & TRI ÂN)
-- ============================================================================

-- Chèn 4 CLB tiêu biểu xứ Trà
insert into public.clubs (id, name, slug, category, category_name, badge, members_count, activities_count, image, description, schedule_info, meeting_place, icon, color, status)
values
  ('clb-nhiep-anh-khmer', 'CLB Nhiếp Ảnh & Văn Hóa Khmer', 'clb-nhiep-anh-khmer', 'di-san', 'Nhiếp ảnh & Di sản', 'Văn hóa & Di sản', 215, 14, '/chùa hang.jpg', 'Giao lưu nhiếp ảnh kiến trúc chùa Khmer, workshop làm đèn hoa sen và lưu giữ nét đẹp văn hóa Nam Bộ.', '1 buổi photo walk cuối tuần', 'Cổng Chùa Hang, TT. Châu Thành', 'camera_enhance', 'amber', 'approved'),
  ('clb-phuot-checkin', 'CLB Phượt & Check-in Trà Vinh', 'clb-phuot-checkin', 'da-ngoai', 'Đạp xe & Trekking', 'Dã ngoại & Khám phá', 340, 28, '/cù lao tân qui.jpg', 'Chuyên các cung đường cồn Hưng Phong, cù lao Long Trị, đạp xe xuyên vườn dừa và săn ảnh bình minh.', '3 buổi đạp rèn thể lực / tuần', 'Cổng Ao Bà Om, Phường 8, TP. Trà Vinh', 'hiking', 'emerald', 'approved'),
  ('clb-am-thuc-xu-tra', 'CLB Ẩm Thực Xứ Trà & Cafe Vườn', 'clb-am-thuc-xu-tra', 'am-thuc', 'Ẩm thực xứ Trà', 'Ẩm thực & Cà phê', 480, 36, '/ao bà om.jpg', 'Tìm kiếm những quán bún nước lèo chuẩn vị cổ truyền, không gian cafe vườn yên tĩnh và bánh tét Trà Cuôn.', 'Sinh hoạt định kỳ sáng Chủ Nhật', 'Các quán cafe sân vườn TP. Trà Vinh', 'restaurant', 'emerald', 'approved'),
  ('clb-chay-bo-long-binh', 'CLB Chạy Bộ Bờ Kè Long Bình', 'clb-chay-bo-long-binh', 'the-thao', 'Thể thao & Sức khỏe', 'Thể thao & Sức khỏe', 510, 42, '/ao bà om.jpg', 'Cộng đồng chạy bộ rèn luyện sức khỏe, ngắm hoàng hôn bên dòng sông Long Bình thơ mộng mỗi chiều.', 'Thứ 4, Thứ 6 (17:30) & Sáng CN (06:00)', 'Bờ kè Sông Long Bình, TP. Trà Vinh', 'directions_run', 'blue', 'approved')
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  members_count = excluded.members_count;

-- Chèn Sự kiện Đại Lễ Ok Om Bok
insert into public.events (id, name, original_name, season, season_name, badge, lunar_date, solar_date_estimate, target_date, location_name, location_place_id, hero_image, summary, total_slots, booked_slots, is_free, status)
values
  ('ok-om-bok', 'Đại Lễ Ok Om Bok (Lễ Cúng Trăng)', 'ពិធីបុណ្យអកអំបុក (Bon Ok Om Bok)', 'winter', 'Mùa Đông', 'Di Sản Văn Hóa Phi Vật Thể Quốc Gia', 'Rằm tháng 10 Âm lịch (14 – 15/10 Âm lịch)', 'Khoảng giữa đến cuối tháng 11 Dương lịch', '2026-11-24T18:00:00+07:00', 'Danh thắng Ao Bà Om & Sông Long Bình, TP. Trà Vinh', 'ao-ba-om', '/ao bà om.jpg', 'Lễ hội lớn nhất và rực rỡ nhất trong năm của đồng bào Khmer Nam Bộ tại Trà Vinh với đua ghe Ngo và thả hoa đăng.', 1000, 342, true, 'upcoming')
on conflict (id) do update set
  name = excluded.name,
  target_date = excluded.target_date,
  booked_slots = excluded.booked_slots;

-- Chèn dữ liệu mẫu Quỹ Tri Ân
insert into public.donations (donor_name, amount, message, payment_method, is_anonymous, status)
values
  ('Nguyễn Văn Tiến', 100000, 'Tiếp sức server mùa Ok Om Bok!', 'vietqr', false, 'completed'),
  ('Thạch Sô Phol', 50000, 'Cảm ơn admin đã số hóa văn hóa Khmer', 'vietqr', false, 'completed'),
  ('Kim Thị Sa Rây', 35000, 'Gửi tặng admin 1 tô bún nước lèo', 'vietqr', false, 'completed'),
  ('Lâm Thị Mỹ Duyên', 20000, 'Cafe sáng vui vẻ nhé admin', 'vietqr', false, 'completed')
on conflict do nothing;

-- ============================================================================
-- HOÀN TẤT MIGRATION G10
-- ============================================================================
