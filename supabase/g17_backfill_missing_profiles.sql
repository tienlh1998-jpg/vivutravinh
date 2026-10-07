-- ==============================================================================
-- ViVuTraVinh - Migration G17: Bổ Sung An Toàn Bản Ghi Hồ Sơ Còn Thiếu (Backfill Profiles)
-- Tệp: supabase/g17_backfill_missing_profiles.sql
-- ==============================================================================
-- 1. Mục tiêu:
--    - Bổ sung an toàn bản ghi trong public.profiles cho các tài khoản auth.users cũ
--      được tạo trước khi có trigger handle_new_user() (bao gồm cả tài khoản admin).
--    - Tuyệt đối AN TOÀN: Sử dụng "ON CONFLICT (id) DO NOTHING" để KHÔNG ghi đè bất kỳ
--      dữ liệu hồ sơ nào đã tồn tại trong hệ thống.
--    - Tự động gán đúng role ('admin', 'editor', 'moderator') nếu tài khoản đã có trong
--      bảng public.admin_users; các tài khoản còn lại mặc định nhận role 'member'.
--    - Bảo đảm trigger handle_new_user() luôn được gắn đầy đủ vào auth.users để mọi tài
--      khoản đăng ký mới trong tương lai đều tự động có hồ sơ.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. BACKFILL CÁC TÀI KHOẢN AUTH.USERS CHƯA CÓ BẢN GHI PUBLIC.PROFILES
-- ------------------------------------------------------------------------------

INSERT INTO public.profiles (
    id,
    display_name,
    avatar_url,
    bio,
    role,
    created_at,
    updated_at
)
SELECT 
    u.id,
    COALESCE(
        u.raw_user_meta_data->>'display_name',
        NULLIF(split_part(u.email, '@', 1), ''),
        'Thành viên'
    ) AS display_name,
    COALESCE(u.raw_user_meta_data->>'avatar_url', NULL) AS avatar_url,
    NULL AS bio,
    COALESCE(
        (SELECT au.role FROM public.admin_users au WHERE au.id = u.id LIMIT 1),
        'member'
    ) AS role,
    COALESCE(u.created_at, now()) AS created_at,
    now() AS updated_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 2. ĐẢM BẢO TRIGGER HANDLE_NEW_USER ĐƯỢC KÍCH HOẠT ĐẦY ĐỦ TRÊN AUTH.USERS
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    assigned_role text := 'member';
BEGIN
    -- Kiểm tra nếu user ID đã được khai báo trước trong bảng admin_users
    SELECT role INTO assigned_role
    FROM public.admin_users
    WHERE id = new.id
    LIMIT 1;

    IF assigned_role IS NULL THEN
        assigned_role := 'member';
    END IF;

    INSERT INTO public.profiles (id, display_name, avatar_url, role, created_at, updated_at)
    VALUES (
        new.id,
        COALESCE(
            new.raw_user_meta_data->>'display_name',
            NULLIF(split_part(new.email, '@', 1), ''),
            'Thành viên'
        ),
        new.raw_user_meta_data->>'avatar_url',
        assigned_role,
        now(),
        now()
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Đảm bảo trigger tồn tại trên bảng auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 3. KIỂM TRA ĐỐI SOÁT SAU KHI CHẠY (VERIFICATION QUERY)
-- ------------------------------------------------------------------------------
-- Chạy truy vấn sau để xác nhận không còn user nào thiếu hồ sơ:
-- SELECT count(*) AS missing_profiles_count
-- FROM auth.users u
-- LEFT JOIN public.profiles p ON p.id = u.id
-- WHERE p.id IS NULL;
