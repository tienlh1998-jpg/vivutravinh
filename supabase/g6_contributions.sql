-- ==========================================================
-- ViVuTraVinh - G6 Migration: Places Idempotency
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
