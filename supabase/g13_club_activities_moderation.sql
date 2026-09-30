-- ============================================================================
-- ViVuTraVinh - G13 Club Activities Moderation & Leader Authorization
-- Quản lý Lịch sinh hoạt định kỳ của Câu lạc bộ Du lịch Trà Vinh
--
-- NGUYÊN TẮC BẢO MẬT BẮT BUỘC:
-- 1. CHỈ CHỦ NHIỆM của CLB ĐÃ ĐƯỢC DUYỆT (clubs.leader_id = auth.uid() AND clubs.status = 'approved')
--    mới có quyền tạo lịch sinh hoạt chính thức cho CLB đó.
-- 2. KHÔNG TIN CẬY club_name hay creator_role do form client gửi lên:
--    Trigger & API tự động truy vấn tên thật từ public.clubs và gán cố định creator_role = 'Chủ nhiệm CLB'.
-- 3. Phân quyền cấp cột (Column-Level Security):
--    REVOKE ALL ON TABLE public.club_activities trước khi cấp quyền theo từng cột.
-- 4. Secure View public_club_activities:
--    Chỉ trả về các buổi sinh hoạt đã được Ban Quản Trị phê duyệt (status = 'approved').
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TẠO BẢNG GỐC CLUB_ACTIVITIES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.club_activities (
    id TEXT PRIMARY KEY DEFAULT ('act-' || floor(extract(epoch from now()) * 1000)::text || '-' || substr(md5(random()::text), 1, 6)),
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    club_name TEXT NOT NULL,
    title TEXT NOT NULL,
    time_schedule TEXT NOT NULL,
    location TEXT NOT NULL,
    max_attendees INT NOT NULL DEFAULT 50 CHECK (max_attendees > 0 AND max_attendees <= 500),
    attendees_count INT NOT NULL DEFAULT 0 CHECK (attendees_count >= 0),
    is_free BOOLEAN NOT NULL DEFAULT true,
    icon TEXT DEFAULT 'event',
    description TEXT,
    creator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    creator_name TEXT,
    creator_role TEXT NOT NULL DEFAULT 'Chủ nhiệm CLB',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'archived')),
    moderation_reason TEXT, -- Phản hồi lý do khi từ chối
    admin_notes TEXT,       -- Ghi chú nội bộ chỉ dành cho Admin
    moderated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    moderated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chỉ mục truy vấn hiệu năng cao
CREATE INDEX IF NOT EXISTS idx_club_activities_club_id ON public.club_activities(club_id);
CREATE INDEX IF NOT EXISTS idx_club_activities_status ON public.club_activities(status);
CREATE INDEX IF NOT EXISTS idx_club_activities_creator ON public.club_activities(creator_id);
CREATE INDEX IF NOT EXISTS idx_club_activities_created_at ON public.club_activities(created_at DESC);

-- ----------------------------------------------------------------------------
-- 2. TRIGGER KIỂM SOÁT BẢO MẬT & XÁC THỰC VAI TRÒ CHỦ NHIỆM CLB
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_enforce_club_activities_security()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_service_role BOOLEAN := false;
    v_club_name TEXT;
    v_club_status TEXT;
    v_club_leader_id UUID;
BEGIN
    -- Kiểm tra quyền service_role từ Supabase JWT
    IF coalesce(auth.role(), '') = 'service_role'
       OR coalesce(auth.jwt() ->> 'role', '') = 'service_role'
       OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
        v_is_service_role := true;
    END IF;

    -- Cho phép service_role thực hiện toàn quyền quản trị / duyệt lịch
    IF v_is_service_role THEN
        IF TG_OP = 'UPDATE' THEN
            NEW.updated_at := now();
        END IF;
        RETURN NEW;
    END IF;

    -- THAO TÁC INSERT: Người dùng xác thực (Chủ nhiệm CLB)
    IF TG_OP = 'INSERT' THEN
        -- Bắt buộc phải đăng nhập
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Yêu cầu đăng nhập để tạo lịch sinh hoạt CLB.'
                USING ERRCODE = '42501';
        END IF;

        -- Xác minh CLB tồn tại, đã được phê duyệt, và người dùng đang đăng nhập chính là Chủ nhiệm
        SELECT name, status, leader_id INTO v_club_name, v_club_status, v_club_leader_id
        FROM public.clubs
        WHERE id = NEW.club_id;

        IF v_club_name IS NULL THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Câu lạc bộ không tồn tại.'
                USING ERRCODE = '42501';
        END IF;

        IF v_club_status IS DISTINCT FROM 'approved' THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Chỉ câu lạc bộ đã được phê duyệt mới có thể tạo lịch sinh hoạt chính thức.'
                USING ERRCODE = '42501';
        END IF;

        IF v_club_leader_id IS DISTINCT FROM auth.uid() THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Bạn không phải Chủ nhiệm của câu lạc bộ này. Thành viên thông thường vui lòng đề xuất qua luồng Sự kiện Cộng đồng.'
                USING ERRCODE = '42501';
        END IF;

        -- TUYỆT ĐỐI KHÔNG TIN CẬY DỮ LIỆU TỪ CLIENT:
        -- Tự động điền thông tin chính xác từ cơ sở dữ liệu
        NEW.club_name := v_club_name;
        NEW.creator_id := auth.uid();
        NEW.creator_role := 'Chủ nhiệm CLB';
        NEW.status := 'pending'; -- Luôn bắt buộc ở trạng thái chờ duyệt
        NEW.attendees_count := 0;
        NEW.admin_notes := NULL;
        NEW.moderation_reason := NULL;
        NEW.moderated_by := NULL;
        NEW.moderated_at := NULL;
        NEW.created_at := coalesce(NEW.created_at, now());
        NEW.updated_at := now();

        RETURN NEW;
    END IF;

    -- THAO TÁC UPDATE: Người dùng xác thực
    IF TG_OP = 'UPDATE' THEN
        -- Không cho phép chỉnh sửa nếu không phải người tạo
        IF OLD.creator_id IS DISTINCT FROM auth.uid() THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Bạn không có quyền chỉnh sửa lịch sinh hoạt của người khác.'
                USING ERRCODE = '42501';
        END IF;

        -- Không cho phép thay đổi CLB, người tạo, vai trò
        NEW.club_id := OLD.club_id;
        NEW.club_name := OLD.club_name;
        NEW.creator_id := OLD.creator_id;
        NEW.creator_role := OLD.creator_role;

        -- Chặn tự nâng quyền duyệt
        IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Người dùng không có quyền tự phê duyệt lịch sinh hoạt.'
                USING ERRCODE = '42501';
        END IF;

        IF NEW.status NOT IN ('draft', 'pending') THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Lịch sinh hoạt chỉ có thể chuyển về draft hoặc pending.'
                USING ERRCODE = '42501';
        END IF;

        -- Chặn can thiệp ghi chú nội bộ và kiểm duyệt
        IF NEW.admin_notes IS DISTINCT FROM OLD.admin_notes
           OR NEW.moderated_by IS DISTINCT FROM OLD.moderated_by
           OR NEW.moderated_at IS DISTINCT FROM OLD.moderated_at THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Không được phép thay đổi dữ liệu kiểm duyệt hoặc ghi chú quản trị.'
                USING ERRCODE = '42501';
        END IF;

        NEW.updated_at := now();
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_club_activities_security ON public.club_activities;
CREATE TRIGGER trg_enforce_club_activities_security
    BEFORE INSERT OR UPDATE ON public.club_activities
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_enforce_club_activities_security();

-- ----------------------------------------------------------------------------
-- 3. CẤU HÌNH ROW-LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------
ALTER TABLE public.club_activities ENABLE ROW LEVEL SECURITY;

-- 3.1 Chủ nhiệm xem lịch của chính mình (thấy được cả trạng thái pending / rejected và reason)
DROP POLICY IF EXISTS "club_activities_creator_read_own" ON public.club_activities;
CREATE POLICY "club_activities_creator_read_own"
    ON public.club_activities
    FOR SELECT
    TO authenticated
    USING (creator_id = auth.uid());

-- 3.2 Chủ nhiệm tạo lịch sinh hoạt cho CLB mình quản lý
DROP POLICY IF EXISTS "club_activities_leader_insert" ON public.club_activities;
CREATE POLICY "club_activities_leader_insert"
    ON public.club_activities
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND status IN ('draft', 'pending')
        AND EXISTS (
            SELECT 1 FROM public.clubs
            WHERE id = club_id
              AND leader_id = auth.uid()
              AND status = 'approved'
        )
    );

-- 3.3 Chủ nhiệm chỉnh sửa lịch khi chưa được duyệt
DROP POLICY IF EXISTS "club_activities_creator_update" ON public.club_activities;
CREATE POLICY "club_activities_creator_update"
    ON public.club_activities
    FOR UPDATE
    TO authenticated
    USING (creator_id = auth.uid() AND status IN ('draft', 'pending', 'rejected'))
    WITH CHECK (creator_id = auth.uid() AND status IN ('draft', 'pending'));

-- 3.4 Chủ nhiệm xóa lịch nháp hoặc bị từ chối
DROP POLICY IF EXISTS "club_activities_creator_delete" ON public.club_activities;
CREATE POLICY "club_activities_creator_delete"
    ON public.club_activities
    FOR DELETE
    TO authenticated
    USING (creator_id = auth.uid() AND status IN ('draft', 'pending', 'rejected'));

-- ----------------------------------------------------------------------------
-- 4. BẢO VỆ CỘT RIÊNG TƯ & THU HẸP QUYỀN GHI (COLUMN-LEVEL SECURITY)
-- ----------------------------------------------------------------------------
-- Thu hồi TOÀN BỘ quyền cấp bảng đối với anon, authenticated, public
-- Chặn đứng hành vi ghi đè trái phép club_name, creator_role, status, admin_notes
REVOKE ALL ON TABLE public.club_activities FROM anon, authenticated, public;

-- Cấp SELECT các cột an toàn cho authenticated (LOẠI BỎ admin_notes)
GRANT SELECT (
    id,
    club_id,
    club_name,
    title,
    time_schedule,
    location,
    max_attendees,
    attendees_count,
    is_free,
    icon,
    description,
    creator_id,
    creator_name,
    creator_role,
    status,
    moderation_reason,
    created_at,
    updated_at
) ON TABLE public.club_activities TO authenticated;

-- Cấp INSERT các cột cần thiết cho authenticated
-- TUYỆT ĐỐI KHÔNG CẤP: club_name, creator_role, creator_id, attendees_count, admin_notes, moderation_reason, moderated_by, moderated_at
GRANT INSERT (
    id,
    club_id,
    title,
    time_schedule,
    location,
    max_attendees,
    is_free,
    icon,
    description,
    creator_name,
    status,
    created_at,
    updated_at
) ON TABLE public.club_activities TO authenticated;

-- Cấp UPDATE các trường an toàn cho authenticated
GRANT UPDATE (
    title,
    time_schedule,
    location,
    max_attendees,
    is_free,
    icon,
    description,
    creator_name,
    status,
    updated_at
) ON TABLE public.club_activities TO authenticated;

GRANT DELETE ON TABLE public.club_activities TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. SECURE VIEW CÔNG KHAI: public_club_activities
-- ----------------------------------------------------------------------------
-- Khách vãng lai và thành viên chỉ đọc các buổi sinh hoạt đã được Admin duyệt
-- Hoàn toàn không để lộ admin_notes hay moderation_reason
CREATE OR REPLACE VIEW public.public_club_activities
WITH (security_invoker = false)
AS
SELECT
    id,
    club_id,
    club_name,
    title,
    time_schedule,
    location,
    max_attendees,
    attendees_count,
    is_free,
    icon,
    description,
    creator_name,
    creator_role,
    status,
    created_at,
    updated_at
FROM public.club_activities
WHERE status = 'approved';

-- Phân quyền cho Secure View
GRANT SELECT ON public.public_club_activities TO anon;
GRANT SELECT ON public.public_club_activities TO authenticated;

-- Service Role có toàn quyền quản trị
GRANT ALL ON TABLE public.club_activities TO service_role;
GRANT ALL ON public.public_club_activities TO service_role;

