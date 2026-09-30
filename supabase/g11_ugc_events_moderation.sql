-- ============================================================================
-- ViVuTraVinh - G11 UGC Community Events & Workshop Moderation
-- Bổ sung bảng community_events, Trigger chống tự duyệt, RLS & Secure View
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TẠO BẢNG GỐC COMMUNITY_EVENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    organizer TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'community',
    time_schedule TEXT NOT NULL,
    location TEXT NOT NULL,
    region TEXT DEFAULT 'tp-tra-vinh',
    description TEXT,
    fee TEXT DEFAULT 'Miễn phí',
    fee_type TEXT DEFAULT 'free',
    max_attendees INTEGER DEFAULT 50,
    contact_phone TEXT, -- CỘT RIÊNG TƯ: Chỉ tác giả & Admin
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'archived')),
    moderation_reason TEXT, -- Chỉ tác giả & Admin
    admin_notes TEXT, -- TUYỆT ĐỐI CHỈ DÀNH CHO ADMIN
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    creator_name TEXT,
    moderated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    moderated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tạo chỉ mục tối ưu truy vấn
CREATE INDEX IF NOT EXISTS idx_community_events_status ON public.community_events(status);
CREATE INDEX IF NOT EXISTS idx_community_events_created_by ON public.community_events(created_by);
CREATE INDEX IF NOT EXISTS idx_community_events_created_at ON public.community_events(created_at DESC);

-- ----------------------------------------------------------------------------
-- 2. TRIGGER BẢO VỆ TRẠNG THÁI: CHỐNG TỰ NÂNG QUYỀN DUYỆT (SELF-APPROVAL)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_enforce_community_events_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_service_role BOOLEAN := false;
BEGIN
    -- Xác thực quyền từ JWT đáng tin cậy của Supabase Auth (KHÔNG dùng current_user trong hàm SECURITY DEFINER)
    IF coalesce(auth.role(), '') = 'service_role' 
       OR coalesce(auth.jwt() ->> 'role', '') = 'service_role'
       OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
        v_is_service_role := true;
    END IF;

    -- Nếu là service_role: cho phép thực hiện mọi thao tác quản trị / phê duyệt
    IF v_is_service_role THEN
        IF TG_OP = 'UPDATE' THEN
            NEW.updated_at := now();
        END IF;
        RETURN NEW;
    END IF;

    -- Thao tác INSERT: Người dùng thường
    IF TG_OP = 'INSERT' THEN
        -- Bắt buộc created_by phải gắn với tài khoản đang đăng nhập
        IF NEW.created_by IS DISTINCT FROM auth.uid() THEN
            NEW.created_by := auth.uid();
        END IF;

        -- Chặn tự gán status khác draft hoặc pending
        IF NEW.status NOT IN ('draft', 'pending') THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Sự kiện do người dùng tạo chỉ được ở trạng thái draft hoặc pending.'
                USING ERRCODE = '42501';
        END IF;

        -- Chặn người dùng thường tự gán dữ liệu kiểm duyệt hoặc admin_notes khi tạo
        IF NEW.moderated_by IS NOT NULL OR NEW.moderated_at IS NOT NULL OR NEW.admin_notes IS NOT NULL THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Người dùng không được can thiệp dữ liệu kiểm duyệt hoặc ghi chú quản trị viên.'
                USING ERRCODE = '42501';
        END IF;

        NEW.created_at := coalesce(NEW.created_at, now());
        NEW.updated_at := now();
        RETURN NEW;
    END IF;

    -- Thao tác UPDATE: Người dùng thường
    IF TG_OP = 'UPDATE' THEN
        -- Không cho phép chỉnh sửa sự kiện của người khác
        IF OLD.created_by IS DISTINCT FROM auth.uid() THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Không có quyền chỉnh sửa sự kiện của người khác.'
                USING ERRCODE = '42501';
        END IF;

        -- Không cho phép thay đổi người tạo
        IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Không được phép thay đổi người tạo sự kiện.'
                USING ERRCODE = '42501';
        END IF;

        -- Chặn người dùng tự nâng quyền xuất bản: tự chuyển sang 'approved' hoặc bất kỳ trạng thái nào ngoài draft/pending
        IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Người dùng không có quyền tự phê duyệt sự kiện.'
                USING ERRCODE = '42501';
        END IF;

        IF NEW.status NOT IN ('draft', 'pending') THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Người dùng chỉ có thể cập nhật trạng thái sự kiện về draft hoặc pending.'
                USING ERRCODE = '42501';
        END IF;

        -- Chặn người dùng sửa admin_notes
        IF NEW.admin_notes IS DISTINCT FROM OLD.admin_notes THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Không có quyền chỉnh sửa ghi chú quản trị viên.'
                USING ERRCODE = '42501';
        END IF;

        -- Chặn người dùng sửa dữ liệu kiểm duyệt
        IF NEW.moderated_by IS DISTINCT FROM OLD.moderated_by OR NEW.moderated_at IS DISTINCT FROM OLD.moderated_at THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Người dùng không được can thiệp dữ liệu kiểm duyệt.'
                USING ERRCODE = '42501';
        END IF;

        NEW.updated_at := now();
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_community_events_status ON public.community_events;
CREATE TRIGGER trg_enforce_community_events_status
    BEFORE INSERT OR UPDATE ON public.community_events
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_enforce_community_events_status();

-- ----------------------------------------------------------------------------
-- 3. CẤU HÌNH ROW-LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------
ALTER TABLE public.community_events ENABLE ROW LEVEL SECURITY;

-- 3.1 Tác giả đọc bản ghi của chính mình (thấy contact_phone và moderation_reason của mình)
DROP POLICY IF EXISTS "community_events_creator_read_own" ON public.community_events;
CREATE POLICY "community_events_creator_read_own"
    ON public.community_events
    FOR SELECT
    TO authenticated
    USING (created_by = auth.uid());

-- 3.2 Tác giả tạo bản ghi mới (chỉ được draft hoặc pending)
DROP POLICY IF EXISTS "community_events_creator_insert" ON public.community_events;
CREATE POLICY "community_events_creator_insert"
    ON public.community_events
    FOR INSERT
    TO authenticated
    WITH CHECK (
        created_by = auth.uid()
        AND status IN ('draft', 'pending')
    );

-- 3.3 Tác giả cập nhật bản ghi của mình khi chưa được duyệt
DROP POLICY IF EXISTS "community_events_creator_update" ON public.community_events;
CREATE POLICY "community_events_creator_update"
    ON public.community_events
    FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid() AND status IN ('draft', 'pending', 'rejected'))
    WITH CHECK (created_by = auth.uid() AND status IN ('draft', 'pending'));

-- 3.4 Tác giả xóa bản ghi nháp / bị từ chối
DROP POLICY IF EXISTS "community_events_creator_delete" ON public.community_events;
CREATE POLICY "community_events_creator_delete"
    ON public.community_events
    FOR DELETE
    TO authenticated
    USING (created_by = auth.uid() AND status IN ('draft', 'pending', 'rejected'));

-- ----------------------------------------------------------------------------
-- 4. BẢO VỆ CỘT RIÊNG TƯ (COLUMN-LEVEL SECURITY)
-- ----------------------------------------------------------------------------
-- Thu hồi SELECT toàn bảng đối với anon, authenticated, public
REVOKE SELECT ON TABLE public.community_events FROM anon, authenticated, public;

-- Cấp SELECT trên các cột an toàn cho authenticated (LOẠI TRỪ admin_notes!)
GRANT SELECT (
    id,
    title,
    organizer,
    category,
    time_schedule,
    location,
    region,
    description,
    fee,
    fee_type,
    max_attendees,
    contact_phone,
    status,
    moderation_reason,
    created_by,
    creator_name,
    created_at,
    updated_at
) ON TABLE public.community_events TO authenticated;

-- Cấp INSERT các cột cần thiết cho authenticated
GRANT INSERT (
    id,
    title,
    organizer,
    category,
    time_schedule,
    location,
    region,
    description,
    fee,
    fee_type,
    max_attendees,
    contact_phone,
    status,
    created_by,
    creator_name,
    created_at,
    updated_at
) ON TABLE public.community_events TO authenticated;

-- Cấp UPDATE các cột an toàn cho authenticated
GRANT UPDATE (
    title,
    organizer,
    category,
    time_schedule,
    location,
    region,
    description,
    fee,
    fee_type,
    max_attendees,
    contact_phone,
    status,
    updated_at
) ON TABLE public.community_events TO authenticated;

GRANT DELETE ON TABLE public.community_events TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. SECURE VIEW CÔNG KHAI: public_community_events
-- ----------------------------------------------------------------------------
-- View chỉ trả về sự kiện đã được phê duyệt (status = 'approved')
-- Che chắn hoàn toàn contact_phone, admin_notes, moderation_reason
CREATE OR REPLACE VIEW public.public_community_events
WITH (security_invoker = false)
AS
SELECT
    id,
    title,
    organizer,
    category,
    time_schedule,
    location,
    region,
    description,
    fee,
    fee_type,
    max_attendees,
    creator_name,
    status,
    created_at
FROM public.community_events
WHERE status = 'approved';

-- Cấp quyền SELECT Secure View cho khách vãng lai và thành viên
GRANT SELECT ON public.public_community_events TO anon;
GRANT SELECT ON public.public_community_events TO authenticated;

-- Đảm bảo service_role toàn quyền quản trị
GRANT ALL ON TABLE public.community_events TO service_role;
GRANT ALL ON public.public_community_events TO service_role;
