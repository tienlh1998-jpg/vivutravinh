-- ============================================================================
-- ViVuTraVinh - G12 UGC Travel Articles & Magazine Moderation
-- Bổ sung bảng articles, Trigger chống tự duyệt, RLS & Secure View public_articles
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TẠO BẢNG GỐC ARTICLES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.articles (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'van-hoa',
    category_name TEXT DEFAULT 'Văn Hóa Khmer',
    category_badge TEXT DEFAULT 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40',
    cover_image TEXT,
    read_time TEXT DEFAULT '4 phút đọc',
    excerpt TEXT,
    content TEXT NOT NULL,
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    author_name TEXT,
    author_role TEXT DEFAULT 'Thành viên Xứ Trà',
    author_avatar TEXT,
    is_editorial BOOLEAN NOT NULL DEFAULT false,
    related_place_ids TEXT[] DEFAULT '{}'::TEXT[],
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'archived')),
    moderation_reason TEXT, -- Chỉ tác giả & Admin
    admin_notes TEXT, -- TUYỆT ĐỐI CHỈ DÀNH CHO ADMIN
    moderated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    moderated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tạo chỉ mục tối ưu truy vấn
CREATE INDEX IF NOT EXISTS idx_articles_status ON public.articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_author_id ON public.articles(author_id);
CREATE INDEX IF NOT EXISTS idx_articles_created_at ON public.articles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_slug ON public.articles(slug);

-- ----------------------------------------------------------------------------
-- 2. TRIGGER BẢO VỆ TRẠNG THÁI: CHỐNG TỰ NÂNG QUYỀN DUYỆT (SELF-APPROVAL)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_enforce_articles_status()
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
        -- Bắt buộc author_id phải gắn với tài khoản đang đăng nhập
        IF NEW.author_id IS DISTINCT FROM auth.uid() THEN
            NEW.author_id := auth.uid();
        END IF;

        -- Chặn tự gán status khác draft hoặc pending
        IF NEW.status NOT IN ('draft', 'pending') THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Bài viết do người dùng gửi chỉ được ở trạng thái draft hoặc pending.'
                USING ERRCODE = '42501';
        END IF;

        -- Chặn người dùng thường tự gán dữ liệu kiểm duyệt hoặc admin_notes khi tạo
        IF NEW.moderated_by IS NOT NULL OR NEW.moderated_at IS NOT NULL OR NEW.admin_notes IS NOT NULL THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Người dùng không được can thiệp dữ liệu kiểm duyệt hoặc ghi chú quản trị viên.'
                USING ERRCODE = '42501';
        END IF;

        -- Chặn người dùng thường tự gán is_editorial
        IF NEW.is_editorial IS TRUE THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Chỉ Ban Biên Tập / Quản trị viên mới được gắn cờ bài viết biên tập.'
                USING ERRCODE = '42501';
        END IF;

        -- Thiết lập role tác giả mặc định cho người dùng thường (chống mạo danh)
        NEW.author_role := 'Thành viên Xứ Trà';

        -- Tự động ánh xạ category_name và category_badge an toàn từ category slug
        CASE NEW.category
            WHEN 'van-hoa' THEN
                NEW.category_name := 'Văn Hóa Khmer';
                NEW.category_badge := 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40';
            WHEN 'am-thuc' THEN
                NEW.category_name := 'Ẩm Thực Bản Địa';
                NEW.category_badge := 'bg-orange-100 text-orange-900 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-200 dark:border-amber-800/40';
            WHEN 'ky-su' THEN
                NEW.category_name := 'Ký Sự Du Lịch';
                NEW.category_badge := 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40';
            WHEN 'le-hoi' THEN
                NEW.category_name := 'Lễ Hội & Sự Kiện';
                NEW.category_badge := 'bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800/40';
            WHEN 'dia-diem' THEN
                NEW.category_name := 'Điểm Đến Mới';
                NEW.category_badge := 'bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40';
            ELSE
                NEW.category := 'van-hoa';
                NEW.category_name := 'Văn Hóa Khmer';
                NEW.category_badge := 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40';
        END CASE;

        NEW.created_at := coalesce(NEW.created_at, now());
        NEW.updated_at := now();
        RETURN NEW;
    END IF;

    -- Thao tác UPDATE: Người dùng thường
    IF TG_OP = 'UPDATE' THEN
        -- Không cho phép chỉnh sửa bài viết của người khác
        IF OLD.author_id IS DISTINCT FROM auth.uid() THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Không có quyền chỉnh sửa bài viết của người khác.'
                USING ERRCODE = '42501';
        END IF;

        -- Không cho phép thay đổi tác giả bài viết
        IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Không được phép thay đổi tác giả bài viết.'
                USING ERRCODE = '42501';
        END IF;

        -- Không cho phép người dùng thường đổi author_role
        NEW.author_role := OLD.author_role;

        -- Chặn người dùng tự nâng quyền xuất bản: tự chuyển sang 'approved' hoặc bất kỳ trạng thái nào ngoài draft/pending
        IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Người dùng không có quyền tự phê duyệt bài viết.'
                USING ERRCODE = '42501';
        END IF;

        IF NEW.status NOT IN ('draft', 'pending') THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Người dùng chỉ có thể cập nhật trạng thái bài viết về draft hoặc pending.'
                USING ERRCODE = '42501';
        END IF;

        -- Khi người dùng cập nhật category, tự động chuẩn hóa category_name và category_badge an toàn
        IF NEW.category IS DISTINCT FROM OLD.category THEN
            CASE NEW.category
                WHEN 'van-hoa' THEN
                    NEW.category_name := 'Văn Hóa Khmer';
                    NEW.category_badge := 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40';
                WHEN 'am-thuc' THEN
                    NEW.category_name := 'Ẩm Thực Bản Địa';
                    NEW.category_badge := 'bg-orange-100 text-orange-900 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-200 dark:border-amber-800/40';
                WHEN 'ky-su' THEN
                    NEW.category_name := 'Ký Sự Du Lịch';
                    NEW.category_badge := 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40';
                WHEN 'le-hoi' THEN
                    NEW.category_name := 'Lễ Hội & Sự Kiện';
                    NEW.category_badge := 'bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800/40';
                WHEN 'dia-diem' THEN
                    NEW.category_name := 'Điểm Đến Mới';
                    NEW.category_badge := 'bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40';
                ELSE
                    NEW.category := 'van-hoa';
                    NEW.category_name := 'Văn Hóa Khmer';
                    NEW.category_badge := 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40';
            END CASE;
        ELSE
            NEW.category_name := OLD.category_name;
            NEW.category_badge := OLD.category_badge;
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

        -- Chặn người dùng sửa cờ biên tập
        IF NEW.is_editorial IS DISTINCT FROM OLD.is_editorial THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Người dùng không thể thay đổi cờ bài viết biên tập.'
                USING ERRCODE = '42501';
        END IF;

        NEW.updated_at := now();
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_articles_status ON public.articles;
CREATE TRIGGER trg_enforce_articles_status
    BEFORE INSERT OR UPDATE ON public.articles
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_enforce_articles_status();

-- ----------------------------------------------------------------------------
-- 3. CẤU HÌNH ROW-LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

-- 3.1 Tác giả đọc bản ghi của chính mình (thấy moderation_reason của mình)
DROP POLICY IF EXISTS "articles_author_read_own" ON public.articles;
CREATE POLICY "articles_author_read_own"
    ON public.articles
    FOR SELECT
    TO authenticated
    USING (author_id = auth.uid());

-- 3.2 Tác giả tạo bản ghi mới (chỉ được draft hoặc pending)
DROP POLICY IF EXISTS "articles_author_insert" ON public.articles;
CREATE POLICY "articles_author_insert"
    ON public.articles
    FOR INSERT
    TO authenticated
    WITH CHECK (
        author_id = auth.uid()
        AND status IN ('draft', 'pending')
    );

-- 3.3 Tác giả cập nhật bản ghi của mình khi chưa được duyệt
DROP POLICY IF EXISTS "articles_author_update" ON public.articles;
CREATE POLICY "articles_author_update"
    ON public.articles
    FOR UPDATE
    TO authenticated
    USING (author_id = auth.uid() AND status IN ('draft', 'pending', 'rejected'))
    WITH CHECK (author_id = auth.uid() AND status IN ('draft', 'pending'));

-- 3.4 Tác giả xóa bản ghi nháp / bị từ chối
DROP POLICY IF EXISTS "articles_author_delete" ON public.articles;
CREATE POLICY "articles_author_delete"
    ON public.articles
    FOR DELETE
    TO authenticated
    USING (author_id = auth.uid() AND status IN ('draft', 'pending', 'rejected'));

-- ----------------------------------------------------------------------------
-- 4. BẢO VỆ CỘT RIÊNG TƯ & THU HẸP QUYỀN GHI (COLUMN-LEVEL SECURITY)
-- ----------------------------------------------------------------------------
-- BƯỚC QUAN TRỌNG: Thu hồi TOÀN BỘ quyền cấp bảng đối với anon, authenticated, public
-- (bao gồm SELECT, INSERT, UPDATE, DELETE) trước khi cấp quyền theo từng cột.
-- Điều này loại bỏ hoàn toàn việc thừa hưởng quyền ghi cấp bảng, đảm bảo các yêu cầu
-- ghi/chỉnh sửa vào các cột không được cấp phép (category_badge, author_role, is_editorial,
-- admin_notes) sẽ bị PostgreSQL chặn đứng ngay ở tầng phân quyền (HTTP 403 / SQLSTATE 42501).
REVOKE ALL ON TABLE public.articles FROM anon, authenticated, public;

-- Cấp SELECT trên các cột an toàn cho authenticated (LOẠI TRỪ admin_notes!)
GRANT SELECT (
    id,
    slug,
    title,
    category,
    category_name,
    category_badge,
    cover_image,
    read_time,
    excerpt,
    content,
    author_id,
    author_name,
    author_role,
    author_avatar,
    is_editorial,
    related_place_ids,
    status,
    moderation_reason,
    created_at,
    updated_at
) ON TABLE public.articles TO authenticated;

-- Cấp INSERT các cột cần thiết cho authenticated (TUYỆT ĐỐI KHÔNG CẤP category_badge, category_name, author_role, is_editorial!)
GRANT INSERT (
    id,
    slug,
    title,
    category,
    cover_image,
    read_time,
    excerpt,
    content,
    author_id,
    author_name,
    author_avatar,
    related_place_ids,
    status,
    created_at,
    updated_at
) ON TABLE public.articles TO authenticated;

-- Cấp UPDATE các cột an toàn cho authenticated (TUYỆT ĐỐI KHÔNG CẤP category_badge, category_name, author_role!)
GRANT UPDATE (
    title,
    slug,
    category,
    cover_image,
    read_time,
    excerpt,
    content,
    author_name,
    author_avatar,
    related_place_ids,
    status,
    updated_at
) ON TABLE public.articles TO authenticated;

GRANT DELETE ON TABLE public.articles TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. SECURE VIEW CÔNG KHAI: public_articles
-- ----------------------------------------------------------------------------
-- View chỉ trả về bài viết đã được phê duyệt (status = 'approved')
-- Che chắn hoàn toàn admin_notes, moderation_reason
CREATE OR REPLACE VIEW public.public_articles
WITH (security_invoker = false)
AS
SELECT
    id,
    slug,
    title,
    category,
    category_name,
    category_badge,
    cover_image,
    read_time,
    excerpt,
    content,
    author_id,
    author_name,
    author_role,
    author_avatar,
    is_editorial,
    related_place_ids,
    status,
    created_at,
    updated_at
FROM public.articles
WHERE status = 'approved';

-- Cấp quyền SELECT Secure View cho khách vãng lai và thành viên
GRANT SELECT ON public.public_articles TO anon;
GRANT SELECT ON public.public_articles TO authenticated;

-- Đảm bảo service_role toàn quyền quản trị
GRANT ALL ON TABLE public.articles TO service_role;
GRANT ALL ON public.public_articles TO service_role;
