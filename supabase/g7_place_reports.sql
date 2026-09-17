-- ==========================================================
-- ViVuTraVinh - G7 Migration: Place Reports & Issue Feedback
-- ==========================================================

-- 1. Tạo bảng lưu trữ phản ánh sai thông tin địa điểm từ cộng đồng
create table if not exists public.place_reports (
  id uuid primary key default gen_random_uuid(),
  place_id text not null,
  place_name text,
  issue_type text not null check (issue_type in ('wrong_hours', 'wrong_price', 'wrong_address', 'closed', 'other')),
  details text not null,
  reporter_contact text,
  ip text,
  client_report_id text,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  admin_notes text
);

-- 2. Partial unique index trên client_report_id chống duplicate/retry cùng mã
create unique index if not exists place_reports_client_report_id_unique
  on public.place_reports(client_report_id)
  where client_report_id is not null;

-- 3. Chỉ mục hỗ trợ tra cứu theo địa điểm và thời gian
create index if not exists place_reports_place_id_idx on public.place_reports(place_id);
create index if not exists place_reports_created_at_idx on public.place_reports(created_at desc);

-- 4. Kích hoạt Row Level Security (RLS)
alter table public.place_reports enable row level security;

-- 5. Chính sách bảo mật nghiêm ngặt:
-- Chặn tuyệt đối anon/public truy cập đọc, sửa hoặc xóa bảng place_reports.
-- Chỉ có Backend Serverless (Service Role Key) mới có quyền đọc và ghi dữ liệu sau khi kiểm duyệt.
drop policy if exists "place_reports_service_role_all" on public.place_reports;
create policy "place_reports_service_role_all"
  on public.place_reports
  for all
  to service_role
  using (true)
  with check (true);
