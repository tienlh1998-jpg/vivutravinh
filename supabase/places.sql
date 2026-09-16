create table if not exists public.places (
  id bigserial primary key,
  slug text not null unique,
  name text not null,
  category text not null,
  area text,
  address text,
  map_link text,
  price_raw text,
  description text,
  note text,
  contact text,
  coordinates text,
  contributor text default 'Ẩn danh',
  rating numeric(2,1) default 0,
  opening_time text,
  closing_time text,
  display_hours text,
  operating_status text default 'Normal',
  status text not null default 'draft',
  images jsonb not null default '[]'::jsonb,
  image_link text,
  sort_order integer default 0,
  is_featured boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint places_status_check check (status in ('approved', 'draft', 'hidden', 'archived')),
  constraint places_rating_check check (rating is null or (rating >= 0 and rating <= 5))
);

-- Đảm bảo tương thích ngược và bổ sung cột cho bảng places đã tồn tại từ trước:
alter table public.places add column if not exists slug text;
alter table public.places add column if not exists operating_status text default 'Normal';
alter table public.places add column if not exists status text not null default 'draft';
alter table public.places add column if not exists images jsonb not null default '[]'::jsonb;
alter table public.places add column if not exists sort_order integer default 0;
alter table public.places add column if not exists is_featured boolean default false;

-- Cập nhật giá trị mặc định cho bảng đã tồn tại:
alter table public.places alter column status set default 'draft';
alter table public.places alter column images set default '[]'::jsonb;

-- 1. Chuẩn hóa và backfill dữ liệu cũ trước khi áp đặt ràng buộc:
update public.places
set slug = 'place-' || id
where slug is null or trim(slug) = '';

update public.places
set status = 'draft'
where status is null or status not in ('approved', 'draft', 'hidden', 'archived');

update public.places
set rating = 0
where rating is not null and (rating < 0 or rating > 5);

update public.places
set images = '[]'::jsonb
where images is null;

-- 2. Xử lý triệt để trùng lặp slug trong dữ liệu cũ trước khi tạo unique constraint:
-- Dùng vòng lặp kiểm tra dứt điểm, gán hậu tố ngẫu nhiên kết hợp ID duy nhất để không bao giờ tạo khóa trùng mới
do $$
declare
  v_dup_count int;
begin
  loop
    with dups as (
      select id, row_number() over (partition by slug order by id asc) as rn
      from public.places
    )
    update public.places p
    set slug = p.slug || '-dedup-' || p.id || '-' || substr(md5(random()::text || clock_timestamp()::text || p.id::text), 1, 6)
    from dups d
    where p.id = d.id and d.rn > 1;

    select count(*) into v_dup_count
    from (
      select slug from public.places group by slug having count(*) > 1
    ) t;

    exit when v_dup_count = 0;
  end loop;
end $$;

-- 3. Tái lập đầy đủ thuộc tính NOT NULL cho các cột của bảng đã tồn tại:
alter table public.places alter column slug set not null;
alter table public.places alter column status set not null;
alter table public.places alter column images set not null;

-- 4. Bổ sung unique constraint cho slug nếu chưa có:
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'places_slug_unique' or conname = 'places_slug_key'
  ) then
    alter table public.places
      add constraint places_slug_unique unique (slug);
  end if;
end $$;

-- 5. Bổ sung check constraint cho status nếu chưa có:
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'places_status_check'
  ) then
    alter table public.places
      add constraint places_status_check check (status in ('approved', 'draft', 'hidden', 'archived'));
  end if;
end $$;

-- 6. Bổ sung check constraint cho rating nếu chưa có:
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'places_rating_check'
  ) then
    alter table public.places
      add constraint places_rating_check check (rating is null or (rating >= 0 and rating <= 5));
  end if;
end $$;

create index if not exists places_status_sort_idx on public.places(status, sort_order, created_at desc);
create index if not exists places_category_idx on public.places(category);
create index if not exists places_slug_idx on public.places(slug);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists places_set_updated_at on public.places;
create trigger places_set_updated_at
before update on public.places
for each row
execute function public.set_updated_at();

alter table public.places enable row level security;

drop policy if exists "Public can read approved places" on public.places;
create policy "Public can read approved places"
on public.places
for select
to anon
using (status = 'approved');
