-- ==========================================================
-- ViVuTraVinh - Rollback Script cho Giai Đoạn G5
-- Hoàn nguyên các thay đổi schema G5 về trạng thái G4 an toàn
-- ==========================================================

-- 1. Hoàn nguyên bảng place_comments
-- Chỉ xóa policies và triggers nếu cần giữ dữ liệu:
drop policy if exists "Public can read approved non-hidden comments" on public.place_comments;
drop policy if exists "Public can insert valid comments" on public.place_comments;
drop trigger if exists place_comments_set_updated_at on public.place_comments;

-- Nếu cần xóa hoàn toàn bảng place_comments để làm lại từ đầu:
-- drop table if exists public.place_comments cascade;

-- 2. Hoàn nguyên chính sách RLS trên bảng places
drop policy if exists "Public can read approved places" on public.places;
create policy "Public can read approved places"
on public.places
for select
to anon
using (status = 'approved');

-- 3. Hoàn nguyên chính sách Storage & Hàm dọn dẹp ảnh
drop policy if exists "Anon upload review photos" on storage.objects;
drop policy if exists "Public Access for Review Photos" on storage.objects;
drop function if exists public.cleanup_orphan_review_photos();

-- 4. Hoàn nguyên bảng và hàm distributed rate limits
drop function if exists public.check_and_record_rate_limit(text, int, int, int);
drop table if exists public.rate_limits cascade;

-- Kết thúc rollback G5
