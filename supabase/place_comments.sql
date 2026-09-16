-- ==========================================================
-- ViVuTraVinh - Schema bảng bình luận & đánh giá (place_comments)
-- Hỗ trợ: Post-moderation, Idempotency (chống trùng lặp), RLS
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
  status text not null default 'approved',
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
-- Người dùng vãng lai được tạo bình luận mới với các ràng buộc bảo mật:
-- Không được tự ý đặt is_hidden = true hoặc status khác 'approved'
drop policy if exists "Public can insert valid comments" on public.place_comments;
create policy "Public can insert valid comments"
on public.place_comments
for insert
to anon, authenticated
with check (
  is_hidden = false
  and status = 'approved'
  and length(trim(author_name)) >= 2
  and length(trim(author_name)) <= 80
  and rating >= 1
  and rating <= 5
  and length(trim(comment_text)) >= 3
  and length(trim(comment_text)) <= 1000
  and client_review_id is not null
  and length(trim(client_review_id)) > 0
);

-- 3. Quyền sửa / xóa bình luận:
-- Khách vãng lai (anon) KHÔNG ĐƯỢC PHÉP sửa hoặc xóa bất kỳ bình luận nào.
-- Toàn bộ thao tác kiểm duyệt, ẩn, xóa thuộc về service_role (thông qua /api/admin-comments).
