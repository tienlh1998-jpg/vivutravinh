-- ==========================================================
-- ViVuTraVinh - Schema bảng bình luận & đánh giá (place_comments)
-- Hỗ trợ: Pre-moderation, Idempotency (chống trùng lặp), RLS
-- ==========================================================

create table if not exists public.place_comments (
  id bigserial primary key,
  place_id text not null,
  place_name text not null,
  author_name text not null,
  rating smallint not null,
  comment_text text not null,
  photo_url text,
  photo_metadata jsonb not null default '{}'::jsonb,
  client_review_id text not null,
  is_hidden boolean not null default false,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint place_comments_rating_check check (rating >= 1 and rating <= 5),
  constraint place_comments_author_len check (length(trim(author_name)) >= 2 and length(trim(author_name)) <= 80),
  constraint place_comments_text_len check (length(trim(comment_text)) >= 3 and length(trim(comment_text)) <= 1000),
  constraint place_comments_status_check check (status in ('approved', 'pending', 'hidden', 'rejected')),
  constraint place_comments_client_review_id_unique unique (client_review_id)
);

-- Chỉ mục tối ưu truy vấn nạp bình luận theo địa điểm & thứ tự thời gian
create index if not exists place_comments_place_idx on public.place_comments(place_id, is_hidden, created_at desc);
create index if not exists place_comments_client_review_idx on public.place_comments(client_review_id);
create index if not exists place_comments_status_idx on public.place_comments(status, is_hidden);

-- Trigger cập nhật updated_at tự động
drop trigger if exists place_comments_set_updated_at on public.place_comments;
create trigger place_comments_set_updated_at
before update on public.place_comments
for each row
execute function public.set_updated_at();

-- ==========================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================================
alter table public.place_comments enable row level security;

-- 1. Quyền đọc công khai (Public / Anon Read):
-- Chỉ được đọc các bình luận đã duyệt (status = 'approved') và không bị ẩn (is_hidden = false)
drop policy if exists "Public can read approved non-hidden comments" on public.place_comments;
create policy "Public can read approved non-hidden comments"
on public.place_comments
for select
to anon, authenticated
using (is_hidden = false and status = 'approved');

-- 2. Quyền gửi bình luận công khai (Public / Anon Insert):
-- BẢO VỆ RATE LIMIT & CHỐNG SPAM: KHÔNG CẤP QUYỀN ANON INSERT TRỰC TIẾP QUA REST API!
-- Toàn bộ việc gửi bình luận bắt buộc phải đi qua API backend trung gian (/api/submit-comment).
-- API này kiểm tra IP rate limit (dùng chung trong DB), giới hạn payload 64KB, validate máy chủ,
-- và sử dụng service_role để ghi vào DB với trạng thái mặc định 'pending'.
-- Việc không cấp policy INSERT cho anon đảm bảo kẻ tấn công KHÔNG THỂ bypass rate limit bằng cách gọi REST trực tiếp.
drop policy if exists "Public can insert valid comments" on public.place_comments;

-- 3. Quyền sửa / xóa bình luận:
-- Khách vãng lai (anon) KHÔNG ĐƯỢC PHÉP sửa hoặc xóa bất kỳ bình luận nào.
-- Toàn bộ thao tác kiểm duyệt, đổi trạng thái sang 'approved', ẩn, xóa thuộc về service_role (thông qua /api/admin-comments).
drop policy if exists "Public cannot update comments" on public.place_comments;
drop policy if exists "Public cannot delete comments" on public.place_comments;

-- ==========================================================
-- BẢNG & HÀM RATE LIMITING CHIA SẺ (DISTRIBUTED RATE LIMITING STORE)
-- Giải quyết triệt để vấn đề mất trạng thái trên serverless đa instance / cold start
-- ==========================================================
create table if not exists public.rate_limits (
  key text primary key,
  timestamps timestamptz[] not null default '{}'::timestamptz[],
  updated_at timestamptz not null default now()
);

-- RLS bảng rate_limits: Chặn tuyệt đối public/anon truy cập trực tiếp
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from public, anon, authenticated;
grant all on public.rate_limits to service_role;

-- Hàm RPC kiểm tra và ghi nhận rate limit một cách nguyên tử (Atomic Check-and-Record)
create or replace function public.check_and_record_rate_limit(
  p_key text,
  p_window_seconds int default 60,
  p_max_requests int default 3,
  p_min_interval_seconds int default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_cutoff timestamptz := v_now - (p_window_seconds || ' seconds')::interval;
  v_recent_timestamps timestamptz[];
  v_last_ts timestamptz;
  v_seconds_since_last int;
  v_wait_seconds int;
begin
  -- Khóa dòng theo key hoặc tạo mới nếu chưa có
  insert into public.rate_limits (key, timestamps, updated_at)
  values (p_key, array[v_now], v_now)
  on conflict (key) do nothing;

  select array_agg(ts order by ts asc)
  into v_recent_timestamps
  from (
    select unnest(timestamps) as ts
    from public.rate_limits
    where key = p_key
  ) t
  where ts > v_cutoff;

  if v_recent_timestamps is null then
    v_recent_timestamps := '{}'::timestamptz[];
  end if;

  -- Kiểm tra khoảng cách tối thiểu giữa 2 request (cooldown)
  if array_length(v_recent_timestamps, 1) > 0 then
    v_last_ts := v_recent_timestamps[array_length(v_recent_timestamps, 1)];
    v_seconds_since_last := extract(epoch from (v_now - v_last_ts))::int;
    if v_seconds_since_last < p_min_interval_seconds then
      v_wait_seconds := p_min_interval_seconds - v_seconds_since_last;
      return jsonb_build_object(
        'allowed', false,
        'code', 'COOLDOWN_ACTIVE',
        'wait_seconds', v_wait_seconds
      );
    end if;
  end if;

  -- Kiểm tra tổng số request trong cửa sổ trượt (sliding window)
  if array_length(v_recent_timestamps, 1) >= p_max_requests then
    v_wait_seconds := extract(epoch from (v_recent_timestamps[1] + (p_window_seconds || ' seconds')::interval - v_now))::int;
    if v_wait_seconds < 1 then v_wait_seconds := 1; end if;
    return jsonb_build_object(
      'allowed', false,
      'code', 'RATE_LIMIT_EXCEEDED',
      'wait_seconds', v_wait_seconds
    );
  end if;

  -- Hợp lệ: Thêm timestamp hiện tại và cập nhật
  v_recent_timestamps := array_append(v_recent_timestamps, v_now);
  update public.rate_limits
  set timestamps = v_recent_timestamps,
      updated_at = v_now
  where key = p_key;

  return jsonb_build_object(
    'allowed', true,
    'remaining', p_max_requests - array_length(v_recent_timestamps, 1)
  );
end;
$$;

revoke all on function public.check_and_record_rate_limit(text, int, int, int) from public, anon, authenticated;
grant execute on function public.check_and_record_rate_limit(text, int, int, int) to service_role;
