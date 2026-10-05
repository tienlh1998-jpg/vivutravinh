-- ============================================================================
-- ViVuTraVinh - G15 Hệ thống Điểm đóng góp, Huy hiệu & Danh hiệu (Contribution Points & Badges)
-- Hệ thống vinh danh thành tích thật cho người dùng:
-- 1. Bảng public.point_transactions: Lưu lịch sử cộng/trừ điểm nguyên tử, chống cộng trùng (Idempotency).
-- 2. Bảng public.user_contribution_points: Tổng hợp điểm tích lũy, điểm tháng, điểm năm và danh hiệu chọn.
-- 3. Bảng public.user_badges: Lưu các huy hiệu đạt được theo điều kiện (không mua bằng điểm).
-- 4. Bảng public.monthly_honors: Bảng vinh danh tháng/năm có xác nhận của Admin.
-- 5. Bổ sung cột user_id vào bảng public.places để liên kết đóng góp địa điểm với tài khoản người dùng.
-- 6. Đồng bộ nguyên tử (Atomic ACID): Duyệt địa điểm, ghi sổ cái điểm, đồng bộ huy hiệu và audit log trong CÙNG GIAO DỊCH.
-- 7. Quy tắc thu hồi kỳ trước rõ ràng: Thu hồi bài cũ trừ điểm tích lũy & điểm năm, KHÔNG trừ điểm tháng hiện tại.
-- 8. Cho phép duyệt lại sau thu hồi: Tác giả sửa bài và được duyệt lại sẽ được cộng lại điểm chuẩn xác.
--
-- QUY TẮC BẢO MẬT & KIẾN TRÚC:
-- 1. Tuyệt đối KHÔNG có lệnh cam kết giao dịch (lệnh kết thúc thủ công) bên trong PostgreSQL function.
-- 2. Dùng múi giờ Việt Nam ('Asia/Ho_Chi_Minh', UTC+7) để tính chu kỳ tháng và năm.
-- 3. Khóa bi quan (FOR UPDATE) chống Race Condition khi cộng/trừ điểm đồng thời.
-- 4. Thu hồi quyền từ public/anon/authenticated; chỉ cấp quyền thực thi cho service_role và các RPC SECURITY DEFINER.
-- 5. Người dùng không được phép tự sửa điểm hoặc tự cấp huy hiệu qua API.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CẬP NHẬT SCHEMA BẢNG HIỆN HỮU: Bổ sung user_id và metadata
-- ----------------------------------------------------------------------------
ALTER TABLE public.places 
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_places_user_id ON public.places(user_id);

ALTER TABLE public.community_posts 
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.articles 
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- ----------------------------------------------------------------------------
-- 2. BẢNG POINT_TRANSACTIONS: Lịch sử sổ cái điểm đóng góp
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.point_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  points integer NOT NULL,
  action_type text NOT NULL, -- 'community_post_approved', 'article_approved', 'place_approved', 'special_bonus', 'revocation'
  entity_type text NOT NULL, -- 'community_post', 'article', 'place', 'admin_special'
  entity_id text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'adjusted')),
  is_special boolean NOT NULL DEFAULT false,
  created_month text NOT NULL, -- 'YYYY-MM' theo múi giờ Việt Nam
  created_year integer NOT NULL, -- YYYY theo múi giờ Việt Nam
  created_by uuid, -- Actor ID của admin thực hiện duyệt
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Chỉ mục tối ưu truy vấn
CREATE INDEX IF NOT EXISTS idx_point_trans_user ON public.point_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_point_trans_entity ON public.point_transactions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_point_trans_period ON public.point_transactions(created_month);
CREATE INDEX IF NOT EXISTS idx_point_trans_status ON public.point_transactions(status);

-- Ràng buộc chống cộng điểm trùng lặp cho các giao dịch ĐANG HOẠT ĐỘNG (Idempotency):
-- Một nội dung chỉ được có tối đa 1 bản ghi duyệt đang 'active' với points > 0
-- Khi bị thu hồi, bản ghi cũ được đánh dấu 'revoked', cho phép duyệt lại sau đó nếu nội dung được sửa đạt chuẩn!
CREATE UNIQUE INDEX IF NOT EXISTS idx_point_trans_unique_active_approved 
  ON public.point_transactions(entity_type, entity_id, action_type) 
  WHERE status = 'active' AND points > 0 AND is_special = false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_point_trans_unique_active_special 
  ON public.point_transactions(entity_type, entity_id) 
  WHERE status = 'active' AND points > 0 AND is_special = true;

-- ----------------------------------------------------------------------------
-- 3. BẢNG USER_CONTRIBUTION_POINTS: Số dư điểm & Danh hiệu được chọn
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_contribution_points (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_points integer NOT NULL DEFAULT 0 CHECK (total_points >= 0),
  current_month_points integer NOT NULL DEFAULT 0 CHECK (current_month_points >= 0),
  current_year_points integer NOT NULL DEFAULT 0 CHECK (current_year_points >= 0),
  last_active_month text DEFAULT NULL, -- Ghi nhận tháng hoạt động gần nhất để tự động reset chu kỳ
  last_active_year integer DEFAULT NULL, -- Ghi nhận năm hoạt động gần nhất
  selected_title text DEFAULT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- View v_user_contribution_points:
-- Tự động trả về current_month_points = 0 nếu bước sang tháng mới mà người dùng chưa có giao dịch
-- Tự động trả về current_year_points = 0 nếu bước sang năm mới mà người dùng chưa có giao dịch
CREATE OR REPLACE VIEW public.v_user_contribution_points AS
SELECT 
  ucp.user_id,
  ucp.total_points,
  CASE 
    WHEN ucp.last_active_month = to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM') 
    THEN ucp.current_month_points 
    ELSE 0 
  END AS current_month_points,
  CASE 
    WHEN ucp.last_active_year = EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer 
    THEN ucp.current_year_points 
    ELSE 0 
  END AS current_year_points,
  ucp.last_active_month,
  ucp.last_active_year,
  ucp.selected_title,
  ucp.updated_at
FROM public.user_contribution_points ucp;

-- ----------------------------------------------------------------------------
-- 4. BẢNG USER_BADGES: Huy hiệu người dùng đạt được
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id text NOT NULL, -- 'buoc-chan-dau-tien', 'nguoi-ke-chuyen-xu-tra', 'ban-dong-hanh-vivu', 'nguoi-kham-pha-xu-tra'
  badge_name text NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  unlocked_reason text,
  UNIQUE(user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON public.user_badges(user_id);

-- ----------------------------------------------------------------------------
-- 5. BẢNG MONTHLY_HONORS: Bảng vinh danh tháng/năm có thẩm định
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.monthly_honors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text NOT NULL, -- Định dạng: 'YYYY-MM'
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name text NOT NULL,
  rank integer NOT NULL CHECK (rank >= 1),
  points integer NOT NULL CHECK (points >= 0),
  title_awarded text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'published')),
  has_revocations boolean NOT NULL DEFAULT false, -- Đánh dấu nếu có nội dung trong kỳ bị thu hồi sau khi chốt
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(period, user_id)
);

CREATE INDEX IF NOT EXISTS idx_monthly_honors_period ON public.monthly_honors(period, rank);

-- ----------------------------------------------------------------------------
-- 6. HÀM TÍNH TOÁN & ĐỒNG BỘ HUY HIỆU THEO ĐIỀU KIỆN (Không mua bằng điểm)
-- Loại trừ 100% dữ liệu mẫu, bài nháp, bài test và tài khoản hệ thống
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_user_badges(p_user_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_approved_posts integer := 0;
  v_approved_articles integer := 0;
  v_approved_places integer := 0;
  v_total_approved integer := 0;
  v_badges_unlocked text[] := ARRAY[]::text[];
  v_badges_revoked text[] := ARRAY[]::text[];
  v_current_title text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_ID_REQUIRED');
  END IF;

  -- 1. Đếm số lượng nội dung thực tế đã được phê duyệt (loại trừ bài nháp / test / mock)
  SELECT count(*) INTO v_approved_posts
  FROM public.community_posts
  WHERE author_id = p_user_id 
    AND status = 'approved'
    AND coalesce((metadata->>'is_mock')::boolean, false) = false
    AND coalesce((metadata->>'is_test')::boolean, false) = false;

  SELECT count(*) INTO v_approved_articles
  FROM public.articles
  WHERE author_id = p_user_id 
    AND status = 'approved'
    AND coalesce((metadata->>'is_mock')::boolean, false) = false
    AND coalesce((metadata->>'is_test')::boolean, false) = false;

  SELECT count(*) INTO v_approved_places
  FROM public.places
  WHERE user_id = p_user_id 
    AND status = 'approved'
    AND coalesce(contributor, '') NOT ILIKE '%Admin%'
    AND coalesce(contributor, '') NOT ILIKE '%System%';

  v_total_approved := v_approved_posts + v_approved_articles + v_approved_places;

  -- 2. Kiểm tra điều kiện từng huy hiệu:

  -- Huy hiệu 1: Bước chân đầu tiên (>= 1 đóng góp được duyệt bất kỳ)
  IF v_total_approved >= 1 THEN
    INSERT INTO public.user_badges (user_id, badge_id, badge_name, unlocked_reason)
    VALUES (p_user_id, 'buoc-chan-dau-tien', 'Bước chân đầu tiên', 'Có đóng góp đầu tiên được phê duyệt')
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    v_badges_unlocked := array_append(v_badges_unlocked, 'buoc-chan-dau-tien');
  ELSE
    DELETE FROM public.user_badges 
    WHERE user_id = p_user_id AND badge_id = 'buoc-chan-dau-tien';
    v_badges_revoked := array_append(v_badges_revoked, 'buoc-chan-dau-tien');
  END IF;

  -- Huy hiệu 2: Người kể chuyện Xứ Trà (>= 5 bài Blog được duyệt)
  IF v_approved_articles >= 5 THEN
    INSERT INTO public.user_badges (user_id, badge_id, badge_name, unlocked_reason)
    VALUES (p_user_id, 'nguoi-ke-chuyen-xu-tra', 'Người kể chuyện Xứ Trà', 'Có 5 bài cẩm nang du lịch / blog được phê duyệt')
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    v_badges_unlocked := array_append(v_badges_unlocked, 'nguoi-ke-chuyen-xu-tra');
  ELSE
    DELETE FROM public.user_badges 
    WHERE user_id = p_user_id AND badge_id = 'nguoi-ke-chuyen-xu-tra';
    v_badges_revoked := array_append(v_badges_revoked, 'nguoi-ke-chuyen-xu-tra');
  END IF;

  -- Huy hiệu 3: Bạn đồng hành ViVu (>= 10 bài Cộng đồng được duyệt)
  IF v_approved_posts >= 10 THEN
    INSERT INTO public.user_badges (user_id, badge_id, badge_name, unlocked_reason)
    VALUES (p_user_id, 'ban-dong-hanh-vivu', 'Bạn đồng hành ViVu', 'Có 10 bài viết chia sẻ cộng đồng được phê duyệt')
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    v_badges_unlocked := array_append(v_badges_unlocked, 'ban-dong-hanh-vivu');
  ELSE
    DELETE FROM public.user_badges 
    WHERE user_id = p_user_id AND badge_id = 'ban-dong-hanh-vivu';
    v_badges_revoked := array_append(v_badges_revoked, 'ban-dong-hanh-vivu');
  END IF;

  -- Huy hiệu 4: Người khám phá Xứ Trà (>= 5 đóng góp địa điểm được duyệt)
  IF v_approved_places >= 5 THEN
    INSERT INTO public.user_badges (user_id, badge_id, badge_name, unlocked_reason)
    VALUES (p_user_id, 'nguoi-kham-pha-xu-tra', 'Người khám phá Xứ Trà', 'Có 5 địa điểm mới được phê duyệt đưa lên bản đồ')
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    v_badges_unlocked := array_append(v_badges_unlocked, 'nguoi-kham-pha-xu-tra');
  ELSE
    DELETE FROM public.user_badges 
    WHERE user_id = p_user_id AND badge_id = 'nguoi-kham-pha-xu-tra';
    v_badges_revoked := array_append(v_badges_revoked, 'nguoi-kham-pha-xu-tra');
  END IF;

  -- 3. Nếu danh hiệu đang chọn bị thu hồi do không còn đủ điều kiện, reset về NULL
  SELECT selected_title INTO v_current_title
  FROM public.user_contribution_points
  WHERE user_id = p_user_id;

  IF v_current_title IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = p_user_id AND badge_name = v_current_title) THEN
      UPDATE public.user_contribution_points
      SET selected_title = NULL, updated_at = now()
      WHERE user_id = p_user_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'approved_posts', v_approved_posts,
    'approved_articles', v_approved_articles,
    'approved_places', v_approved_places,
    'total_approved', v_total_approved,
    'badges_unlocked', to_jsonb(v_badges_unlocked),
    'badges_revoked', to_jsonb(v_badges_revoked)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- 7. HÀM CỘNG/TRỪ ĐIỂM NGUYÊN TỬ CÙNG GIAO DỊCH DUYỆT NỘI DUNG (Atomic Point Ledger)
-- Có quy tắc rõ ràng khi thu hồi nội dung từ kỳ trước & Hỗ trợ duyệt lại sau thu hồi
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_content_moderation_points(
  p_actor_id uuid,
  p_user_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_action text, -- 'approve' | 'reject' | 'archive'
  p_is_special boolean DEFAULT false,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb AS $$
DECLARE
  v_points_to_award integer := 0;
  v_action_type text;
  v_current_month text;
  v_current_year integer;
  v_existing_award_id uuid;
  v_previously_awarded integer := 0;
  v_points_in_current_month integer := 0;
  v_points_in_current_year integer := 0;
  v_orig_month text;
  v_orig_year integer;
  v_delta_total integer := 0;
  v_delta_month integer := 0;
  v_delta_year integer := 0;
  v_user_row public.user_contribution_points%rowtype;
  v_new_total integer := 0;
  v_new_month integer := 0;
  v_new_year integer := 0;
BEGIN
  -- Người dùng không hợp lệ -> bỏ qua không lỗi để không chặn duyệt dữ liệu khách/hệ thống
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'ANONYMOUS_OR_NO_USER_ID');
  END IF;

  -- Loại trừ dữ liệu thử nghiệm hoặc mock
  IF coalesce((p_metadata->>'is_mock')::boolean, false) IS TRUE THEN
    RETURN jsonb_build_object('success', false, 'reason', 'EXCLUDED_MOCK_DATA');
  END IF;

  IF coalesce((p_metadata->>'is_test')::boolean, false) IS TRUE THEN
    RETURN jsonb_build_object('success', false, 'reason', 'EXCLUDED_TEST_DATA');
  END IF;

  -- Xác định chu kỳ thời gian theo múi giờ Việt Nam (Asia/Ho_Chi_Minh)
  v_current_month := to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM');
  v_current_year := EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer;

  -- 1. XỬ LÝ DUYỆT NỘI DUNG (p_action = 'approve')
  IF p_action = 'approve' THEN
    -- Xác định số điểm theo loại đóng góp đã được chuẩn hóa:
    -- - Bài đăng Cộng đồng: 10 điểm
    -- - Bài Blog ViVu: 20 điểm
    -- - Đóng góp địa điểm: 15 điểm
    -- - Đóng góp đặc biệt hữu ích: +10 điểm
    CASE p_entity_type
      WHEN 'community_post' THEN 
        v_points_to_award := 10;
        v_action_type := 'community_post_approved';
      WHEN 'article' THEN 
        v_points_to_award := 20;
        v_action_type := 'article_approved';
      WHEN 'place' THEN 
        v_points_to_award := 15;
        v_action_type := 'place_approved';
      ELSE
        v_points_to_award := 0;
        v_action_type := 'other_approved';
    END CASE;

    IF v_points_to_award > 0 THEN
      -- Kiểm tra Idempotency: Nội dung này đã có bản ghi điểm duyệt 'active' chưa?
      SELECT id INTO v_existing_award_id
      FROM public.point_transactions
      WHERE entity_type = p_entity_type 
        AND entity_id = p_entity_id 
        AND action_type = v_action_type 
        AND status = 'active'
        AND points > 0
      LIMIT 1;

      -- Nếu chưa có bản ghi active (kể cả trường hợp từng bị thu hồi rồi nay được duyệt lại) -> Ghi nhận giao dịch
      IF v_existing_award_id IS NULL THEN
        INSERT INTO public.point_transactions (
          user_id, points, action_type, entity_type, entity_id, status,
          is_special, created_month, created_year, created_by, metadata
        ) VALUES (
          p_user_id, v_points_to_award, v_action_type, p_entity_type, p_entity_id, 'active',
          false, v_current_month, v_current_year, p_actor_id, p_metadata
        );
        v_delta_total := v_delta_total + v_points_to_award;
        v_delta_month := v_delta_month + v_points_to_award;
        v_delta_year := v_delta_year + v_points_to_award;
      END IF;
    END IF;

    -- Thưởng đặc biệt nếu admin đánh dấu có ích vượt trội (+10 điểm)
    IF p_is_special IS TRUE THEN
      SELECT id INTO v_existing_award_id
      FROM public.point_transactions
      WHERE entity_type = p_entity_type 
        AND entity_id = p_entity_id 
        AND is_special = true 
        AND status = 'active'
        AND points > 0
      LIMIT 1;

      IF v_existing_award_id IS NULL THEN
        INSERT INTO public.point_transactions (
          user_id, points, action_type, entity_type, entity_id, status,
          is_special, created_month, created_year, created_by, metadata
        ) VALUES (
          p_user_id, 10, 'special_bonus', p_entity_type, p_entity_id, 'active',
          true, v_current_month, v_current_year, p_actor_id, p_metadata
        );
        v_delta_total := v_delta_total + 10;
        v_delta_month := v_delta_month + 10;
        v_delta_year := v_delta_year + 10;
      END IF;
    END IF;

  -- 2. XỬ LÝ THU HỒI NỘI DUNG (p_action IN ('reject', 'archive'))
  -- Quy tắc theo kỳ:
  -- - Tổng điểm trọn đời (total_points): Trừ toàn bộ số điểm đã cấp trước đó.
  -- - Điểm năm (current_year_points): Chỉ trừ nếu bài viết được duyệt trong cùng năm hiện tại.
  -- - Điểm tháng (current_month_points): Chỉ trừ nếu bài viết được duyệt trong cùng tháng hiện tại.
  --   Bài của tháng trước (kỳ trước) bị thu hồi KHÔNG trừ vào current_month_points của tháng này!
  ELSIF p_action IN ('reject', 'archive') THEN
    -- Truy vấn các giao dịch điểm dương đang 'active' của thực thể này
    SELECT 
      coalesce(sum(points), 0),
      coalesce(sum(CASE WHEN created_month = v_current_month THEN points ELSE 0 END), 0),
      coalesce(sum(CASE WHEN created_year = v_current_year THEN points ELSE 0 END), 0),
      max(created_month),
      max(created_year)
    INTO 
      v_previously_awarded,
      v_points_in_current_month,
      v_points_in_current_year,
      v_orig_month,
      v_orig_year
    FROM public.point_transactions
    WHERE entity_type = p_entity_type 
      AND entity_id = p_entity_id
      AND status = 'active'
      AND points > 0;

    IF v_previously_awarded > 0 THEN
      -- Đánh dấu các bản ghi điểm duyệt cũ sang trạng thái 'revoked' (để cho phép duyệt lại sau nếu tác giả sửa bài)
      UPDATE public.point_transactions
      SET status = 'revoked'
      WHERE entity_type = p_entity_type 
        AND entity_id = p_entity_id
        AND status = 'active'
        AND points > 0;

      -- Ghi nhận giao dịch âm (revocation) vào sổ cái
      INSERT INTO public.point_transactions (
        user_id, points, action_type, entity_type, entity_id, status,
        is_special, created_month, created_year, created_by, metadata
      ) VALUES (
        p_user_id, -v_previously_awarded, 'revocation', p_entity_type, p_entity_id, 'adjusted',
        false, v_current_month, v_current_year, p_actor_id, 
        jsonb_build_object(
          'revocation_action', p_action, 
          'original_points', v_previously_awarded,
          'original_month', v_orig_month,
          'original_year', v_orig_year,
          'points_deducted_current_month', v_points_in_current_month,
          'points_deducted_current_year', v_points_in_current_year,
          'is_cross_period', (v_orig_month <> v_current_month)
        )
      );

      v_delta_total := -v_previously_awarded;
      v_delta_year := -v_points_in_current_year;
      v_delta_month := -v_points_in_current_month;

      -- Nếu kỳ gốc trước đó đã có bảng vinh danh, đánh dấu cờ has_revocations để phục vụ đối soát
      IF v_orig_month IS NOT NULL AND v_orig_month <> v_current_month THEN
        UPDATE public.monthly_honors
        SET has_revocations = true
        WHERE period = v_orig_month AND user_id = p_user_id;
      END IF;
    END IF;
  END IF;

  -- 3. CẬP NHẬT TỔNG ĐIỂM NGƯỜI DÙNG (Khóa bi quan FOR UPDATE & Xử lý chuyển kỳ)
  IF v_delta_total <> 0 OR v_delta_month <> 0 OR v_delta_year <> 0 THEN
    -- Khóa dòng dữ liệu người dùng
    SELECT * INTO v_user_row 
    FROM public.user_contribution_points 
    WHERE user_id = p_user_id 
    FOR UPDATE;

    IF NOT FOUND THEN
      -- Khởi tạo bản ghi điểm mới
      INSERT INTO public.user_contribution_points (
        user_id, total_points, current_month_points, current_year_points,
        last_active_month, last_active_year, updated_at
      ) VALUES (
        p_user_id, 
        greatest(0, v_delta_total), 
        greatest(0, v_delta_month), 
        greatest(0, v_delta_year),
        v_current_month,
        v_current_year,
        now()
      )
      RETURNING total_points, current_month_points, current_year_points
      INTO v_new_total, v_new_month, v_new_year;
    ELSE
      -- Tự động reset chu kỳ nếu chuyển sang tháng mới
      IF v_user_row.last_active_month IS DISTINCT FROM v_current_month THEN
        v_user_row.current_month_points := 0;
      END IF;

      -- Tự động reset chu kỳ nếu chuyển sang năm mới
      IF v_user_row.last_active_year IS DISTINCT FROM v_current_year THEN
        v_user_row.current_year_points := 0;
      END IF;

      UPDATE public.user_contribution_points
      SET
        total_points = greatest(0, v_user_row.total_points + v_delta_total),
        current_month_points = greatest(0, v_user_row.current_month_points + v_delta_month),
        current_year_points = greatest(0, v_user_row.current_year_points + v_delta_year),
        last_active_month = v_current_month,
        last_active_year = v_current_year,
        updated_at = now()
      WHERE user_id = p_user_id
      RETURNING total_points, current_month_points, current_year_points
      INTO v_new_total, v_new_month, v_new_year;
    END IF;

    -- 4. Tính toán lại điều kiện huy hiệu sau khi thay đổi điểm/trạng thái nội dung
    PERFORM public.recalculate_user_badges(p_user_id);
  ELSE
    SELECT total_points, current_month_points, current_year_points 
    INTO v_new_total, v_new_month, v_new_year
    FROM public.user_contribution_points
    WHERE user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'delta_total', v_delta_total,
    'delta_month', v_delta_month,
    'delta_year', v_delta_year,
    'total_points', coalesce(v_new_total, 0),
    'current_month_points', coalesce(v_new_month, 0),
    'current_year_points', coalesce(v_new_year, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- 8. GIAO DỊCH NGUYÊN TỬ CẬP NHẬT ĐỊA ĐIỂM (admin_update_place_atomic)
-- Đồng bộ nguyên tử 4 trong 1: Cập nhật địa điểm + Khóa bi quan + Cộng/trừ điểm + Audit log
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_place_atomic(
  p_actor_id uuid,
  p_actor_email text,
  p_actor_role text,
  p_place_id bigint,
  p_patch jsonb,
  p_ip text,
  p_correlation_id text
) RETURNS jsonb AS $$
DECLARE
  v_old_record public.places%rowtype;
  v_new_record public.places%rowtype;
  v_audit_before jsonb;
  v_audit_after jsonb;
  v_action text;
  v_target_user_id uuid;
  v_is_special boolean := false;
BEGIN
  -- 1. Validate role: Chỉ admin hoặc editor mới có quyền sửa địa điểm
  IF p_actor_role IS NULL OR p_actor_role NOT IN ('admin', 'editor') THEN
    RAISE EXCEPTION 'FORBIDDEN: Chỉ admin hoặc editor mới có quyền cập nhật địa điểm' USING errcode = '42501';
  END IF;

  -- 2. Khóa dòng dữ liệu (Pessimistic Row Lock) và kiểm tra tồn tại
  SELECT * INTO v_old_record FROM public.places WHERE id = p_place_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy địa điểm %', p_place_id USING errcode = 'P0002';
  END IF;

  -- 3. Khóa lạc quan (Optimistic Concurrency Control)
  IF p_patch ? 'expected_updated_at' AND p_patch->>'expected_updated_at' IS NOT NULL AND trim(p_patch->>'expected_updated_at') <> '' THEN
    IF v_old_record.updated_at IS DISTINCT FROM (p_patch->>'expected_updated_at')::timestamptz THEN
      RAISE EXCEPTION 'CONFLICT: Bản ghi đã bị sửa đổi đồng thời (expected_updated_at không khớp)' USING errcode = '40001';
    END IF;
  END IF;

  -- 4. Cập nhật các trường trong allowlist
  UPDATE public.places
  SET
    name = CASE WHEN p_patch ? 'name' THEN trim(p_patch->>'name') ELSE name END,
    slug = CASE WHEN p_patch ? 'slug' THEN trim(p_patch->>'slug') ELSE slug END,
    category = CASE WHEN p_patch ? 'category' THEN trim(p_patch->>'category') ELSE category END,
    area = CASE WHEN p_patch ? 'area' THEN p_patch->>'area' ELSE area END,
    address = CASE WHEN p_patch ? 'address' THEN p_patch->>'address' ELSE address END,
    map_link = CASE WHEN p_patch ? 'map_link' THEN p_patch->>'map_link' ELSE map_link end,
    price_raw = CASE WHEN p_patch ? 'price_raw' THEN p_patch->>'price_raw' ELSE price_raw END,
    description = CASE WHEN p_patch ? 'description' THEN p_patch->>'description' ELSE description END,
    note = CASE WHEN p_patch ? 'note' THEN p_patch->>'note' ELSE note END,
    contact = CASE WHEN p_patch ? 'contact' THEN p_patch->>'contact' ELSE contact END,
    coordinates = CASE WHEN p_patch ? 'coordinates' THEN p_patch->>'coordinates' ELSE coordinates END,
    contributor = CASE WHEN p_patch ? 'contributor' THEN p_patch->>'contributor' ELSE contributor END,
    rating = CASE WHEN p_patch ? 'rating' THEN (p_patch->>'rating')::numeric ELSE rating END,
    opening_time = CASE WHEN p_patch ? 'opening_time' THEN p_patch->>'opening_time' ELSE opening_time END,
    closing_time = CASE WHEN p_patch ? 'closing_time' THEN p_patch->>'closing_time' ELSE closing_time END,
    display_hours = CASE WHEN p_patch ? 'display_hours' THEN p_patch->>'display_hours' ELSE display_hours END,
    operating_status = CASE WHEN p_patch ? 'operating_status' THEN p_patch->>'operating_status' ELSE operating_status END,
    status = CASE WHEN p_patch ? 'status' THEN p_patch->>'status' ELSE status END,
    user_id = CASE WHEN p_patch ? 'user_id' THEN (p_patch->>'user_id')::uuid ELSE user_id END,
    images = CASE WHEN p_patch ? 'images' THEN (p_patch->'images') ELSE images END,
    image_link = CASE WHEN p_patch ? 'image_link' THEN p_patch->>'image_link' ELSE image_link END,
    sort_order = CASE WHEN p_patch ? 'sort_order' THEN (p_patch->>'sort_order')::integer ELSE sort_order END,
    is_featured = CASE WHEN p_patch ? 'is_featured' THEN (p_patch->>'is_featured')::boolean ELSE is_featured END,
    updated_at = now()
  WHERE id = p_place_id
  RETURNING * INTO v_new_record;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFLICT: Bản ghi không thể cập nhật' USING errcode = '40001';
  END IF;

  -- 5. ĐỒNG BỘ ĐIỂM ĐÓNG GÓP TRONG CÙNG GIAO DỊCH (G15 ATOMIC)
  v_target_user_id := coalesce(v_new_record.user_id, v_old_record.user_id);
  v_is_special := coalesce((p_patch->>'is_special')::boolean, false);

  -- Chỉ ghi nhận điểm nếu địa điểm liên kết với người dùng thật (loại trừ admin seed data)
  IF v_target_user_id IS NOT NULL 
     AND coalesce(v_new_record.contributor, '') NOT ILIKE '%Admin%' 
     AND coalesce(v_new_record.contributor, '') NOT ILIKE '%System%' THEN

    IF v_new_record.status = 'approved' AND v_old_record.status <> 'approved' THEN
      -- Chuyển sang approved -> Cộng 15 điểm
      PERFORM public.record_content_moderation_points(
        p_actor_id,
        v_target_user_id,
        'place',
        p_place_id::text,
        'approve',
        v_is_special,
        jsonb_build_object('place_name', v_new_record.name, 'moderator', p_actor_email)
      );
    ELSIF v_old_record.status = 'approved' AND v_new_record.status <> 'approved' THEN
      -- Chuyển từ approved sang rejected/archived -> Thu hồi điểm
      PERFORM public.record_content_moderation_points(
        p_actor_id,
        v_target_user_id,
        'place',
        p_place_id::text,
        CASE WHEN v_new_record.status = 'archived' THEN 'archive' ELSE 'reject' END,
        false,
        jsonb_build_object('place_name', v_new_record.name, 'previous_status', v_old_record.status, 'new_status', v_new_record.status)
      );
    END IF;
  END IF;

  -- 6. Chuẩn bị payload audit log (không PII)
  v_audit_before := jsonb_build_object(
    'id', v_old_record.id, 'slug', v_old_record.slug, 'name', v_old_record.name,
    'status', v_old_record.status, 'user_id', v_old_record.user_id, 'updated_at', v_old_record.updated_at
  );

  v_audit_after := jsonb_build_object(
    'id', v_new_record.id, 'slug', v_new_record.slug, 'name', v_new_record.name,
    'status', v_new_record.status, 'user_id', v_new_record.user_id, 'updated_at', v_new_record.updated_at
  );

  v_action := CASE
    WHEN v_new_record.status = 'archived' AND v_old_record.status <> 'archived' THEN 'place.archive'
    WHEN v_new_record.status IS DISTINCT FROM v_old_record.status THEN 'place.' || v_new_record.status
    ELSE 'place.update'
  END;

  -- 7. Ghi nhật ký audit trong CÙNG TRANSACTION (Nếu lỗi, toàn bộ thao tác tự rollback)
  INSERT INTO public.admin_audit_logs (
    actor_id, actor_email, actor_role, action,
    entity_type, entity_id, payload_before, payload_after,
    ip, correlation_id, created_at
  ) VALUES (
    p_actor_id, p_actor_email, p_actor_role, v_action,
    'place', v_new_record.id::text, v_audit_before, v_audit_after,
    p_ip, p_correlation_id, now()
  );

  RETURN to_jsonb(v_new_record);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- 9. TÍCH HỢP ĐIỂM VÀO RPC KIỂM DUYỆT NGUYÊN TỬ (admin_moderate_entity_atomic)
-- ----------------------------------------------------------------------------
-- Đảm bảo loại bỏ hàm 10 tham số của G14 để tránh nảy sinh Overload gây gọi nhầm hàm cũ
-- hoặc gây lỗi 'Could not choose a best candidate function' trong PostgREST (Supabase RPC)
DROP FUNCTION IF EXISTS public.admin_moderate_entity_atomic(uuid, text, text, text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.admin_moderate_entity_atomic(
  p_actor_id uuid,
  p_actor_email text,
  p_actor_role text,
  p_entity_type text,
  p_entity_id text,
  p_action text,
  p_reason text DEFAULT NULL,
  p_admin_notes text DEFAULT NULL,
  p_ip text DEFAULT NULL,
  p_correlation_id text DEFAULT NULL,
  p_is_special boolean DEFAULT false
) RETURNS jsonb AS $$
DECLARE
  v_new_status text;
  v_before jsonb;
  v_after jsonb;
  v_audit_action text;
  v_target_user_id uuid := NULL;
  v_point_result jsonb;
BEGIN
  -- 1. Validate quyền hạn (RBAC)
  IF p_actor_role IS NULL OR p_actor_role NOT IN ('admin', 'moderator', 'editor') THEN
    RAISE EXCEPTION 'FORBIDDEN: Chỉ admin, moderator hoặc editor mới có quyền kiểm duyệt nội dung'
      USING errcode = '42501';
  END IF;

  -- 2. Validate loại nội dung
  IF p_entity_type IS NULL OR p_entity_type NOT IN ('community_post', 'club', 'community_event', 'article', 'club_activity', 'place') THEN
    RAISE EXCEPTION 'INVALID_ENTITY_TYPE: Loại nội dung không hợp lệ (community_post | club | community_event | article | club_activity | place)'
      USING errcode = '22023';
  END IF;

  -- 3. Validate mã định danh nội dung
  IF p_entity_id IS NULL OR trim(p_entity_id) = '' OR length(p_entity_id) > 128 THEN
    RAISE EXCEPTION 'INVALID_ENTITY_ID: Thiếu mã định danh nội dung hợp lệ'
      USING errcode = '22023';
  END IF;

  -- 4. Validate hành động
  IF p_action IS NULL OR p_action NOT IN ('approve', 'reject', 'archive') THEN
    RAISE EXCEPTION 'INVALID_ACTION: Hành động không hợp lệ (approve | reject | archive)'
      USING errcode = '22023';
  END IF;

  -- 5. Validate lý do khi từ chối
  IF p_action = 'reject' AND (p_reason IS NULL OR length(trim(p_reason)) < 3 OR length(p_reason) > 500) THEN
    RAISE EXCEPTION 'INVALID_REASON: Từ chối nội dung phải kèm lý do từ 3 đến 500 ký tự'
      USING errcode = '22023';
  END IF;

  v_new_status := CASE p_action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    WHEN 'archive' THEN 'archived'
  END;

  v_audit_action := 'moderation.' || p_action || '.' || p_entity_type;

  -- 6. Khóa dòng dữ liệu (FOR UPDATE) & Lấy tác giả để cộng/trừ điểm
  CASE p_entity_type
    WHEN 'community_post' THEN
      SELECT jsonb_build_object(
        'id', p.id,
        'title', p.title,
        'status', p.status,
        'author_id', p.author_id,
        'author_name', p.author_name
      ) INTO v_before
      FROM public.community_posts p
      WHERE p.id::text = p_entity_id
      FOR UPDATE;

      IF v_before IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Bài viết cộng đồng với mã % không tồn tại', p_entity_id USING errcode = 'P0002';
      END IF;

      v_target_user_id := (v_before->>'author_id')::uuid;

      UPDATE public.community_posts
      SET status = v_new_status,
          moderated_by = p_actor_id,
          moderated_at = now(),
          moderation_reason = CASE WHEN p_action = 'reject' THEN p_reason ELSE moderation_reason END,
          admin_notes = coalesce(p_admin_notes, admin_notes),
          updated_at = now()
      WHERE id::text = p_entity_id
      RETURNING jsonb_build_object(
        'id', id, 'title', title, 'status', status, 'author_id', author_id, 'updated_at', updated_at
      ) INTO v_after;

    WHEN 'article' THEN
      SELECT jsonb_build_object(
        'id', a.id,
        'title', a.title,
        'status', a.status,
        'author_id', a.author_id,
        'author_name', a.author_name
      ) INTO v_before
      FROM public.articles a
      WHERE a.id = p_entity_id
      FOR UPDATE;

      IF v_before IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Bài cẩm nang du lịch với mã % không tồn tại', p_entity_id USING errcode = 'P0002';
      END IF;

      v_target_user_id := (v_before->>'author_id')::uuid;

      UPDATE public.articles
      SET status = v_new_status,
          moderated_by = p_actor_id,
          moderated_at = now(),
          moderation_reason = CASE WHEN p_action = 'reject' THEN p_reason ELSE moderation_reason END,
          admin_notes = coalesce(p_admin_notes, admin_notes),
          updated_at = now()
      WHERE id = p_entity_id
      RETURNING jsonb_build_object(
        'id', id, 'title', title, 'status', status, 'author_id', author_id, 'updated_at', updated_at
      ) INTO v_after;

    WHEN 'place' THEN
      SELECT jsonb_build_object(
        'id', pl.id,
        'name', pl.name,
        'status', pl.status,
        'user_id', pl.user_id,
        'contributor', pl.contributor
      ) INTO v_before
      FROM public.places pl
      WHERE pl.id::text = p_entity_id
      FOR UPDATE;

      IF v_before IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Địa điểm với mã % không tồn tại', p_entity_id USING errcode = 'P0002';
      END IF;

      IF v_before->>'user_id' IS NOT NULL THEN
        v_target_user_id := (v_before->>'user_id')::uuid;
      END IF;

      UPDATE public.places
      SET status = v_new_status,
          updated_at = now()
      WHERE id::text = p_entity_id
      RETURNING jsonb_build_object(
        'id', id, 'name', name, 'status', status, 'user_id', user_id, 'updated_at', updated_at
      ) INTO v_after;

    WHEN 'club' THEN
      SELECT jsonb_build_object('id', c.id, 'status', c.status) INTO v_before
      FROM public.clubs c WHERE c.id = p_entity_id FOR UPDATE;
      IF v_before IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Câu lạc bộ không tồn tại' USING errcode = 'P0002'; END IF;
      UPDATE public.clubs SET status = v_new_status, updated_at = now() WHERE id = p_entity_id
      RETURNING jsonb_build_object('id', id, 'status', status) INTO v_after;

    WHEN 'community_event' THEN
      SELECT jsonb_build_object('id', e.id, 'status', e.status) INTO v_before
      FROM public.community_events e WHERE e.id = p_entity_id FOR UPDATE;
      IF v_before IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Sự kiện không tồn tại' USING errcode = 'P0002'; END IF;
      UPDATE public.community_events SET status = v_new_status, updated_at = now() WHERE id = p_entity_id
      RETURNING jsonb_build_object('id', id, 'status', status) INTO v_after;

    WHEN 'club_activity' THEN
      SELECT jsonb_build_object('id', ca.id, 'status', ca.status) INTO v_before
      FROM public.club_activities ca WHERE ca.id = p_entity_id FOR UPDATE;
      IF v_before IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Lịch sinh hoạt không tồn tại' USING errcode = 'P0002'; END IF;
      UPDATE public.club_activities SET status = v_new_status, updated_at = now() WHERE id = p_entity_id
      RETURNING jsonb_build_object('id', id, 'status', status) INTO v_after;
  END CASE;

  -- 7. Ghi nhận điểm đóng góp trong CÙNG GIAO DỊCH (Atomic Point Operation)
  IF v_target_user_id IS NOT NULL THEN
    v_point_result := public.record_content_moderation_points(
      p_actor_id,
      v_target_user_id,
      p_entity_type,
      p_entity_id,
      p_action,
      p_is_special,
      jsonb_build_object('moderator_email', p_actor_email, 'notes', p_admin_notes)
    );
  END IF;

  -- 8. Ghi nhật ký kiểm toán trong CÙNG TRANSACTION
  INSERT INTO public.admin_audit_logs (
    actor_id, actor_email, actor_role, action, entity_type, entity_id,
    payload_before, payload_after, ip, correlation_id, created_at
  ) VALUES (
    p_actor_id, p_actor_email, p_actor_role, v_audit_action, p_entity_type, p_entity_id,
    v_before, v_after, p_ip, p_correlation_id, now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'action', p_action,
    'entity_type', p_entity_type,
    'entity_id', p_entity_id,
    'status', v_new_status,
    'points_awarded', v_point_result,
    'data', v_after
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- 10. RPC NGƯỜI DÙNG: CHỌN DANH HIỆU HIỂN THỊ CẠNH TÊN (Chống tự gán danh hiệu chưa đạt)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.select_user_title(p_title_name text)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_badge_exists boolean := false;
BEGIN
  -- Lấy user_id từ JWT phiên đăng nhập Supabase Auth
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Bạn cần đăng nhập để chọn danh hiệu' USING errcode = '42501';
  END IF;

  -- Nếu bỏ chọn danh hiệu (gửi chuỗi rỗng hoặc null)
  IF p_title_name IS NULL OR trim(p_title_name) = '' THEN
    UPDATE public.user_contribution_points
    SET selected_title = NULL, updated_at = now()
    WHERE user_id = v_user_id;

    RETURN jsonb_build_object('success', true, 'selected_title', NULL);
  END IF;

  -- Kiểm tra người dùng có thực sự mở khóa danh hiệu/huy hiệu này chưa:
  SELECT EXISTS(
    SELECT 1 FROM public.user_badges
    WHERE user_id = v_user_id AND badge_name = trim(p_title_name)
  ) INTO v_badge_exists;

  IF NOT v_badge_exists THEN
    RAISE EXCEPTION 'TITLE_NOT_UNLOCKED: Bạn chưa mở khóa danh hiệu "%"', trim(p_title_name) USING errcode = '42501';
  END IF;

  -- Cập nhật danh hiệu được chọn
  INSERT INTO public.user_contribution_points (user_id, selected_title, updated_at)
  VALUES (v_user_id, trim(p_title_name), now())
  ON CONFLICT (user_id) DO UPDATE SET
    selected_title = trim(p_title_name),
    updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'selected_title', trim(p_title_name)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- 11. RPC: BẢNG XẾP HẠNG ĐÓNG GÓP THÁNG/NĂM (Múi giờ Việt Nam, Đồng điểm minh bạch)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_contribution_leaderboard(p_period text DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  v_period text;
  v_rows jsonb;
BEGIN
  -- Mặc định lấy tháng hiện tại theo múi giờ Việt Nam
  IF p_period IS NULL OR trim(p_period) = '' THEN
    v_period := to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM');
  ELSE
    v_period := trim(p_period);
  END IF;

  -- Xếp hạng theo điểm giảm dần.
  -- Quy tắc đồng điểm: ai đạt mốc điểm đó sớm hơn sẽ xếp trước (min(created_at) ASC).
  -- Nếu cùng thời điểm sẽ xếp đồng hạng (DENSE_RANK).
  WITH monthly_totals AS (
    SELECT 
      pt.user_id,
      sum(pt.points)::integer as period_points,
      min(pt.created_at) as earliest_point_time
    FROM public.point_transactions pt
    WHERE pt.created_month = v_period
    GROUP BY pt.user_id
    HAVING sum(pt.points) > 0
  ),
  ranked AS (
    SELECT 
      mt.user_id,
      mt.period_points,
      mt.earliest_point_time,
      coalesce(ucp.selected_title, 'Thành viên đóng góp') as display_title,
      coalesce(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1)) as display_name,
      dense_rank() OVER (ORDER BY mt.period_points DESC, mt.earliest_point_time ASC) as calculated_rank
    FROM monthly_totals mt
    JOIN auth.users u ON u.id = mt.user_id
    LEFT JOIN public.user_contribution_points ucp ON ucp.user_id = mt.user_id
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'rank', r.calculated_rank,
      'user_id', r.user_id,
      'user_name', r.display_name,
      'points', r.period_points,
      'title', r.display_title,
      'earliest_time', r.earliest_point_time
    ) ORDER BY r.calculated_rank ASC
  ), '[]'::jsonb) INTO v_rows
  FROM ranked r
  LIMIT 20;

  RETURN jsonb_build_object(
    'period', v_period,
    'timezone', 'Asia/Ho_Chi_Minh (UTC+7)',
    'tie_breaker_rule', 'Điểm cao hơn xếp trước -> Đạt điểm sớm hơn xếp trước -> Đồng thời thì đồng hạng',
    'leaderboard', v_rows
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- 12. RPC ADMIN: XÁC NHẬN VÀ CÔNG BỐ VINH DANH THÁNG (Draft -> Confirmed)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_confirm_monthly_honors(
  p_actor_id uuid,
  p_period text
) RETURNS jsonb AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF p_period IS NULL OR trim(p_period) = '' THEN
    RAISE EXCEPTION 'PERIOD_REQUIRED: Cần nhập kỳ vinh danh (YYYY-MM)' USING errcode = '22023';
  END IF;

  -- Tạo hoặc cập nhật snapshot vinh danh đã được duyệt
  INSERT INTO public.monthly_honors (period, user_id, user_name, rank, points, title_awarded, status, confirmed_by, confirmed_at)
  SELECT 
    p_period,
    mt.user_id,
    coalesce(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1)),
    dense_rank() OVER (ORDER BY sum(pt.points) DESC, min(pt.created_at) ASC)::integer,
    sum(pt.points)::integer,
    coalesce(ucp.selected_title, 'Ngôi sao Đóng góp Tháng'),
    'confirmed',
    p_actor_id,
    now()
  FROM public.point_transactions pt
  JOIN auth.users u ON u.id = pt.user_id
  LEFT JOIN public.user_contribution_points ucp ON ucp.user_id = pt.user_id
  WHERE pt.created_month = p_period
  GROUP BY pt.user_id, u.raw_user_meta_data, u.email, ucp.selected_title
  HAVING sum(pt.points) > 0
  ON CONFLICT (period, user_id) DO UPDATE SET
    rank = EXCLUDED.rank,
    points = EXCLUDED.points,
    title_awarded = EXCLUDED.title_awarded,
    status = 'confirmed',
    confirmed_by = p_actor_id,
    confirmed_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'period', p_period,
    'confirmed_entries', v_count,
    'confirmed_by', p_actor_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- 13. PHÂN QUYỀN VÀ BẢO VỆ CHẶT CHẼ HÀNG (ROW-LEVEL SECURITY)
-- ----------------------------------------------------------------------------
ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_contribution_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_honors ENABLE ROW LEVEL SECURITY;

-- 1. point_transactions: Người dùng chỉ được xem lịch sử điểm của chính mình; cấm tự ghi/sửa
DROP POLICY IF EXISTS "Users can read own point transactions" ON public.point_transactions;
CREATE POLICY "Users can read own point transactions"
  ON public.point_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 2. user_contribution_points: Người dùng xem được điểm của mình, công chúng xem được danh hiệu
DROP POLICY IF EXISTS "Public can view contribution points" ON public.user_contribution_points;
CREATE POLICY "Public can view contribution points"
  ON public.user_contribution_points FOR SELECT
  TO public
  USING (true);

GRANT SELECT ON public.v_user_contribution_points TO public;

-- 3. user_badges: Công khai huy hiệu để hiển thị hồ sơ cá nhân và bảng vinh danh
DROP POLICY IF EXISTS "Public can view user badges" ON public.user_badges;
CREATE POLICY "Public can view user badges"
  ON public.user_badges FOR SELECT
  TO public
  USING (true);

-- 4. monthly_honors: Công chúng chỉ xem danh sách đã được xác nhận (confirmed/published)
DROP POLICY IF EXISTS "Public can view confirmed monthly honors" ON public.monthly_honors;
CREATE POLICY "Public can view confirmed monthly honors"
  ON public.monthly_honors FOR SELECT
  TO public
  USING (status IN ('confirmed', 'published'));

-- 5. Cấp quyền thực thi:
REVOKE ALL ON FUNCTION public.admin_moderate_entity_atomic(uuid, text, text, text, text, text, text, text, text, text, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_moderate_entity_atomic(uuid, text, text, text, text, text, text, text, text, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.admin_update_place_atomic(uuid, text, text, bigint, jsonb, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_place_atomic(uuid, text, text, bigint, jsonb, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.record_content_moderation_points(uuid, uuid, text, text, text, boolean, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_content_moderation_points(uuid, uuid, text, text, text, boolean, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.recalculate_user_badges(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_user_badges(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_confirm_monthly_honors(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_confirm_monthly_honors(uuid, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.select_user_title(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_contribution_leaderboard(text) TO public, anon, authenticated;
