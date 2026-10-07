-- ==============================================================================
-- ViVuTraVinh - Migration G16: Bảo Vệ Ảnh Đại Diện & RLS Storage Policies
-- Tệp: supabase/g16_protect_avatars_and_storage_policies.sql
-- ==============================================================================
-- 1. Mục tiêu:
--    - Phân tách và bảo vệ độc lập 2 luồng tải ảnh trên bucket 'review-photos':
--      + Luồng 1: Ảnh đánh giá địa điểm (Review photos) - Giữ nguyên cho khách vãng lai (anon)
--        và người dùng đăng nhập (authenticated) gửi ảnh đánh giá theo cấu trúc reviews/{place_id}/...
--      + Luồng 2: Ảnh đại diện người dùng (User avatars) - Ràng buộc CHẶT CHẼ:
--        * Chỉ người dùng ĐÃ ĐĂNG NHẬP (authenticated) mới được tải lên.
--        * Bắt buộc lưu đúng thư mục/tiền tố ID của chính họ (auth.uid()).
--        * Ngăn chặn tuyệt đối người dùng này tải lên đè hoặc giả mạo avatar của người dùng khác.
--        * Cho phép người dùng tự xóa avatar cũ trong thư mục/tiền tố của chính mình.
--    - Bảo vệ ảnh đại diện khỏi thủ tục dọn dẹp ảnh mồ côi (cleanup orphan photos):
--      + Loại trừ vĩnh viễn mọi ảnh trong thư mục avatars hoặc được liên kết bởi public.profiles.avatar_url.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CẬP NHẬT RLS POLICIES TRÊN storage.objects CHO BUCKET review-photos
-- ------------------------------------------------------------------------------

-- 1.1. Luồng ảnh đánh giá địa điểm (Giữ nguyên luồng hiện có, loại trừ thư mục avatars)
DROP POLICY IF EXISTS "Anon upload review photos" ON storage.objects;
CREATE POLICY "Anon upload review photos"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'review-photos'
  AND (storage.foldername(name))[1] = 'reviews'
  AND (storage.foldername(name))[2] != 'avatars'
  AND array_length(storage.foldername(name), 1) = 2
  AND (storage.foldername(name))[2] ~ '^[a-zA-Z0-9_-]{2,100}$'
  AND storage.filename(name) ~ '^[a-zA-Z0-9_-]{5,128}_[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$'
  AND name NOT LIKE '%..%'
  AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
);

-- 1.2. Luồng ảnh đại diện người dùng (Chỉ cho phép authenticated và đúng ID của chính mình)
-- Hỗ trợ cấu trúc reviews/avatars/{auth.uid()}_... (tương thích client hiện tại)
-- và cấu trúc chuẩn avatars/{auth.uid()}/...
DROP POLICY IF EXISTS "Authenticated upload own avatar" ON storage.objects;
CREATE POLICY "Authenticated upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'review-photos'
  AND (
    -- Dạng 1: reviews/avatars/{auth.uid()}_timestamp.ext
    (
      (storage.foldername(name))[1] = 'reviews'
      AND (storage.foldername(name))[2] = 'avatars'
      AND storage.filename(name) LIKE (auth.uid())::text || '_%'
    )
    OR
    -- Dạng 2: avatars/{auth.uid()}/filename.ext
    (
      (storage.foldername(name))[1] = 'avatars'
      AND (storage.foldername(name))[2] = (auth.uid())::text
    )
  )
  AND name NOT LIKE '%..%'
  AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
);

-- 1.3. Cho phép người dùng đã đăng nhập tự xóa avatar của chính mình
DROP POLICY IF EXISTS "Authenticated delete own avatar" ON storage.objects;
CREATE POLICY "Authenticated delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'review-photos'
  AND (
    (
      (storage.foldername(name))[1] = 'reviews'
      AND (storage.foldername(name))[2] = 'avatars'
      AND storage.filename(name) LIKE (auth.uid())::text || '_%'
    )
    OR
    (
      (storage.foldername(name))[1] = 'avatars'
      AND (storage.foldername(name))[2] = (auth.uid())::text
    )
  )
);

-- ------------------------------------------------------------------------------
-- 2. CẬP NHẬT THỦ TỤC DỌN DẸP ẢNH MỒ CÔI (ORPHAN CLEANUP GUARD)
-- Bảo vệ tuyệt đối ảnh đại diện khỏi việc dọn dẹp tự động
-- Giữ nguyên kiểu trả về TABLE(deleted_name text) để 100% tương thích với hàm cũ
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.cleanup_orphan_review_photos();
CREATE OR REPLACE FUNCTION public.cleanup_orphan_review_photos()
RETURNS TABLE(deleted_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  -- Trả về danh sách tệp mồ côi (tải lên quá 48h không gắn với bình luận nào)
  -- để Service Role có thể dọn dẹp an toàn qua Storage API.
  RETURN QUERY
    SELECT o.name AS deleted_name
    FROM storage.objects o
    WHERE o.bucket_id = 'review-photos'
      AND o.created_at < now() - interval '48 hours'
      -- 1. Tuyệt đối KHÔNG quét hoặc xóa ảnh đại diện trong thư mục avatars
      AND coalesce((storage.foldername(o.name))[1], '') != 'avatars'
      AND coalesce((storage.foldername(o.name))[2], '') != 'avatars'
      -- 2. Tuyệt đối KHÔNG xóa ảnh đang được liên kết trong place_comments
      AND NOT EXISTS (
        SELECT 1 FROM public.place_comments pc
        WHERE pc.photo_url LIKE '%' || o.name || '%'
      )
      -- 3. Tuyệt đối KHÔNG xóa ảnh đang được liên kết trong profiles (avatar_url)
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.avatar_url LIKE '%' || o.name || '%'
      );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_orphan_review_photos() FROM public;
REVOKE ALL ON FUNCTION public.cleanup_orphan_review_photos() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_orphan_review_photos() TO service_role;
