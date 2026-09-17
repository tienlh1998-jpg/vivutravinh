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
