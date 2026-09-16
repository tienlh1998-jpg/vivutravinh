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

-- Đảm bảo tương thích ngược và bổ sung cột cho cơ sở dữ liệu đã tồn tại từ trước:
alter table public.place_comments add column if not exists photo_metadata jsonb not null default '{}'::jsonb;
alter table public.place_comments add column if not exists client_review_id text;
alter table public.place_comments add column if not exists is_hidden boolean not null default false;
alter table public.place_comments add column if not exists status text not null default 'pending';

-- Cập nhật giá trị mặc định cho bảng đã tồn tại:
alter table public.place_comments alter column status set default 'pending';
alter table public.place_comments alter column photo_metadata set default '{}'::jsonb;
alter table public.place_comments alter column is_hidden set default false;

-- 1. Chuẩn hóa và backfill dữ liệu cũ trước khi áp đặt ràng buộc:
update public.place_comments
set client_review_id = 'legacy_comment_' || id
where client_review_id is null or trim(client_review_id) = '';

update public.place_comments
set status = 'pending'
where status is null or status not in ('approved', 'pending', 'hidden', 'rejected');

update public.place_comments
set rating = 1
where rating is null or rating < 1 or rating > 5;

update public.place_comments
set photo_metadata = '{}'::jsonb
where photo_metadata is null;

update public.place_comments
set is_hidden = false
where is_hidden is null;

-- 2. Xử lý triệt để trùng lặp client_review_id trong dữ liệu cũ trước khi tạo unique constraint:
-- Dùng vòng lặp kiểm tra dứt điểm, gán hậu tố ngẫu nhiên kết hợp ID duy nhất để không bao giờ tạo khóa trùng mới
do $$
declare
  v_dup_count int;
begin
  loop
    with dups as (
      select id, row_number() over (partition by client_review_id order by id asc) as rn
      from public.place_comments
    )
    update public.place_comments c
    set client_review_id = 'dedup_rev_' || c.id || '_' || substr(md5(random()::text || clock_timestamp()::text || c.id::text), 1, 10)
    from dups d
    where c.id = d.id and d.rn > 1;

    select count(*) into v_dup_count
    from (
      select client_review_id from public.place_comments group by client_review_id having count(*) > 1
    ) t;

    exit when v_dup_count = 0;
  end loop;
end $$;

-- 3. Tái lập đầy đủ thuộc tính NOT NULL cho các cột của bảng đã tồn tại:
alter table public.place_comments alter column client_review_id set not null;
alter table public.place_comments alter column status set not null;
alter table public.place_comments alter column photo_metadata set not null;
alter table public.place_comments alter column is_hidden set not null;

-- 4. Bổ sung unique constraint cho client_review_id nếu chưa có:
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'place_comments_client_review_id_unique'
  ) then
    alter table public.place_comments
      add constraint place_comments_client_review_id_unique unique (client_review_id);
  end if;
end $$;

-- 5. Bổ sung check constraint cho status nếu chưa có:
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'place_comments_status_check'
  ) then
    alter table public.place_comments
      add constraint place_comments_status_check check (status in ('approved', 'pending', 'hidden', 'rejected'));
  end if;
end $$;

-- Bổ sung check constraint cho rating nếu chưa có:
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'place_comments_rating_check'
  ) then
    alter table public.place_comments
      add constraint place_comments_rating_check check (rating >= 1 and rating <= 5);
  end if;
end $$;

-- Chỉ mục tối ưu truy vấn nạp bình luận theo địa điểm & thứ tự thời gian
create index if not exists place_comments_place_idx on public.place_comments(place_id, is_hidden, created_at desc);
create index if not exists place_comments_client_review_idx on public.place_comments(client_review_id);
create index if not exists place_comments_status_idx on public.place_comments(status, is_hidden);

-- Hàm trigger cập nhật updated_at tự động
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

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
-- Dọn policy legacy từng cho role public đọc toàn bộ bình luận.
drop policy if exists "Public can read comments" on public.place_comments;
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
-- Dọn cả tên policy legacy từng cấp INSERT cho role public.
drop policy if exists "Public can insert comments" on public.place_comments;
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
-- Sử dụng clock_timestamp(), SELECT ... FOR UPDATE khóa dòng tránh race condition,
-- và khởi tạo mảng rỗng để không bị nhận định nhầm request đầu tiên thành cooldown.
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
  v_now timestamptz := clock_timestamp();
  v_cutoff timestamptz;
  v_existing_timestamps timestamptz[];
  v_recent_timestamps timestamptz[] := '{}'::timestamptz[];
  v_count int;
  v_last_ts timestamptz;
  v_seconds_since_last int;
  v_wait_seconds int;
  v_ts timestamptz;
begin
  v_cutoff := v_now - (p_window_seconds || ' seconds')::interval;

  -- 1. Đảm bảo bản ghi tồn tại với mảng rỗng (không chứa v_now để không hiểu nhầm là đã có request trước đó)
  insert into public.rate_limits (key, timestamps, updated_at)
  values (p_key, '{}'::timestamptz[], v_now)
  on conflict (key) do nothing;

  -- 2. Khóa dòng với FOR UPDATE để ngăn ngừa race condition giữa các request đồng thời
  select timestamps
  into v_existing_timestamps
  from public.rate_limits
  where key = p_key
  for update;

  -- 3. Lọc các timestamp còn hiệu lực trong sliding window
  if v_existing_timestamps is not null then
    foreach v_ts in array v_existing_timestamps loop
      if v_ts > v_cutoff then
        v_recent_timestamps := array_append(v_recent_timestamps, v_ts);
      end if;
    end loop;
  end if;

  v_count := coalesce(cardinality(v_recent_timestamps), 0);

  -- 4. Kiểm tra khoảng cách tối thiểu giữa 2 request (cooldown)
  if v_count > 0 then
    v_last_ts := v_recent_timestamps[v_count];
    v_seconds_since_last := extract(epoch from (v_now - v_last_ts))::int;
    if v_seconds_since_last < p_min_interval_seconds then
      v_wait_seconds := p_min_interval_seconds - v_seconds_since_last;
      if v_wait_seconds < 1 then v_wait_seconds := 1; end if;
      return jsonb_build_object(
        'allowed', false,
        'code', 'COOLDOWN_ACTIVE',
        'wait_seconds', v_wait_seconds
      );
    end if;
  end if;

  -- 5. Kiểm tra tổng số request trong sliding window
  if v_count >= p_max_requests then
    v_wait_seconds := extract(epoch from (v_recent_timestamps[1] + (p_window_seconds || ' seconds')::interval - v_now))::int;
    if v_wait_seconds < 1 then v_wait_seconds := 1; end if;
    return jsonb_build_object(
      'allowed', false,
      'code', 'RATE_LIMIT_EXCEEDED',
      'wait_seconds', v_wait_seconds
    );
  end if;

  -- 6. Yêu cầu hợp lệ: Thêm v_now vào mảng và cập nhật dòng
  v_recent_timestamps := array_append(v_recent_timestamps, v_now);
  update public.rate_limits
  set timestamps = v_recent_timestamps,
      updated_at = v_now
  where key = p_key;

  return jsonb_build_object(
    'allowed', true,
    'remaining', p_max_requests - coalesce(cardinality(v_recent_timestamps), 0)
  );
end;
$$;

-- Bảo mật quyền thực thi hàm rate limit: Chỉ cho phép backend (service_role) thực thi
revoke all on function public.check_and_record_rate_limit(text, int, int, int) from public, anon, authenticated;
grant execute on function public.check_and_record_rate_limit(text, int, int, int) to service_role;
