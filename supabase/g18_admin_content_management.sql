-- ============================================================================
-- ViVuTraVinh - G18 Quyền Quản trị Nội dung Toàn diện & Đồng bộ 6 Thực thể
-- Hỗ trợ 7 nghiệp vụ: Duyệt, Từ chối có lý do, Sửa trực tiếp giữ công khai,
-- Hoàn duyệt để tác giả chỉnh sửa, Ẩn/Hiện lại, Xóa vào thùng rác & Khôi phục.
-- ============================================================================

-- 1. Bổ sung các cột phục vụ kiểm duyệt cho bảng places nếu chưa có
ALTER TABLE public.places ADD COLUMN IF NOT EXISTS moderation_reason TEXT;
ALTER TABLE public.places ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE public.places ADD COLUMN IF NOT EXISTS moderated_by UUID;
ALTER TABLE public.places ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;
ALTER TABLE public.places ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Bổ sung metadata cho các bảng UGC nếu chưa có
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.club_activities ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.community_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 2. Cập nhật Check Constraints trên cột status để hỗ trợ 'returned' và 'hidden'
DO $$
BEGIN
  -- places
  ALTER TABLE public.places DROP CONSTRAINT IF EXISTS places_status_check;
  ALTER TABLE public.places ADD CONSTRAINT places_status_check
    CHECK (status IN ('approved', 'draft', 'hidden', 'archived', 'returned', 'pending'));

  -- community_posts
  ALTER TABLE public.community_posts DROP CONSTRAINT IF EXISTS community_posts_status_check;
  ALTER TABLE public.community_posts ADD CONSTRAINT community_posts_status_check
    CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'archived', 'returned', 'hidden'));

  -- clubs
  ALTER TABLE public.clubs DROP CONSTRAINT IF EXISTS clubs_status_check;
  ALTER TABLE public.clubs ADD CONSTRAINT clubs_status_check
    CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'archived', 'returned', 'hidden'));

  -- club_activities
  ALTER TABLE public.club_activities DROP CONSTRAINT IF EXISTS club_activities_status_check;
  ALTER TABLE public.club_activities ADD CONSTRAINT club_activities_status_check
    CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'archived', 'returned', 'hidden'));

  -- community_events
  ALTER TABLE public.community_events DROP CONSTRAINT IF EXISTS community_events_status_check;
  ALTER TABLE public.community_events ADD CONSTRAINT community_events_status_check
    CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'archived', 'returned', 'hidden'));

  -- articles
  ALTER TABLE public.articles DROP CONSTRAINT IF EXISTS articles_status_check;
  ALTER TABLE public.articles ADD CONSTRAINT articles_status_check
    CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'archived', 'returned', 'hidden'));
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Constraint update notice: %', SQLERRM;
END $$;

-- 3. Nâng cấp PostgreSQL Function admin_moderate_entity_atomic
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
  v_current_status text;
BEGIN
  -- 1. Validate quyền hạn (RBAC)
  IF p_actor_role IS NULL OR p_actor_role NOT IN ('admin', 'moderator', 'editor') THEN
    RAISE EXCEPTION 'FORBIDDEN: Chỉ admin, moderator hoặc editor mới có quyền kiểm duyệt nội dung'
      USING errcode = '42501';
  END IF;

  -- 2. Validate loại nội dung
  IF p_entity_type IS NULL OR p_entity_type NOT IN ('community_post', 'club', 'community_event', 'article', 'club_activity', 'place') THEN
    RAISE EXCEPTION 'INVALID_ENTITY_TYPE: Loại nội dung không hợp lệ'
      USING errcode = '22023';
  END IF;

  -- 3. Validate mã định danh nội dung
  IF p_entity_id IS NULL OR trim(p_entity_id) = '' OR length(p_entity_id) > 128 THEN
    RAISE EXCEPTION 'INVALID_ENTITY_ID: Thiếu mã định danh nội dung hợp lệ'
      USING errcode = '22023';
  END IF;

  -- 4. Validate hành động
  IF p_action IS NULL OR p_action NOT IN ('approve', 'reject', 'archive', 'return', 'hide', 'unhide', 'trash', 'restore') THEN
    RAISE EXCEPTION 'INVALID_ACTION: Hành động không hợp lệ (%s)', p_action
      USING errcode = '22023';
  END IF;

  -- 5. Validate lý do khi từ chối hoặc hoàn duyệt
  IF (p_action IN ('reject', 'return')) AND (p_reason IS NULL OR length(trim(p_reason)) < 3 OR length(p_reason) > 500) THEN
    RAISE EXCEPTION 'INVALID_REASON: Từ chối hoặc hoàn duyệt nội dung phải kèm lý do từ 3 đến 500 ký tự'
      USING errcode = '22023';
  END IF;

  -- Ánh xạ trạng thái mới
  v_new_status := CASE p_action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN CASE WHEN p_entity_type = 'place' THEN 'archived' ELSE 'rejected' END
    WHEN 'archive' THEN 'archived'
    WHEN 'trash' THEN 'archived'
    WHEN 'return' THEN 'draft'
    WHEN 'hide' THEN 'hidden'
    WHEN 'unhide' THEN 'approved'
    WHEN 'restore' THEN 'approved'
  END;

  v_audit_action := 'moderation.' || p_action || '.' || p_entity_type;

  -- 6. Khóa dòng dữ liệu (FOR UPDATE) & Đọc dữ liệu trước khi sửa
  CASE p_entity_type
    WHEN 'community_post' THEN
      SELECT jsonb_build_object(
        'id', p.id, 'title', p.title, 'status', p.status, 'author_id', p.author_id, 'author_name', p.author_name
      ) INTO v_before
      FROM public.community_posts p WHERE p.id::text = p_entity_id FOR UPDATE;

      IF v_before IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Bài viết cộng đồng không tồn tại' USING errcode = 'P0002'; END IF;
      v_target_user_id := (v_before->>'author_id')::uuid;
      v_current_status := v_before->>'status';

      UPDATE public.community_posts
      SET status = v_new_status,
          moderated_by = p_actor_id,
          moderated_at = now(),
          moderation_reason = CASE WHEN p_action IN ('reject', 'return') THEN p_reason ELSE moderation_reason END,
          admin_notes = coalesce(p_admin_notes, admin_notes),
          updated_at = now()
      WHERE id::text = p_entity_id
      RETURNING jsonb_build_object('id', id, 'title', title, 'status', status, 'author_id', author_id, 'updated_at', updated_at) INTO v_after;

    WHEN 'article' THEN
      SELECT jsonb_build_object(
        'id', a.id, 'title', a.title, 'status', a.status, 'author_id', a.author_id, 'author_name', a.author_name
      ) INTO v_before
      FROM public.articles a WHERE a.id = p_entity_id FOR UPDATE;

      IF v_before IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Bài cẩm nang du lịch không tồn tại' USING errcode = 'P0002'; END IF;
      v_target_user_id := (v_before->>'author_id')::uuid;
      v_current_status := v_before->>'status';

      UPDATE public.articles
      SET status = v_new_status,
          moderated_by = p_actor_id,
          moderated_at = now(),
          moderation_reason = CASE WHEN p_action IN ('reject', 'return') THEN p_reason ELSE moderation_reason END,
          admin_notes = coalesce(p_admin_notes, admin_notes),
          updated_at = now()
      WHERE id = p_entity_id
      RETURNING jsonb_build_object('id', id, 'title', title, 'status', status, 'author_id', author_id, 'updated_at', updated_at) INTO v_after;

    WHEN 'place' THEN
      SELECT jsonb_build_object(
        'id', pl.id, 'name', pl.name, 'status', pl.status, 'user_id', pl.user_id, 'contributor', pl.contributor
      ) INTO v_before
      FROM public.places pl WHERE pl.id::text = p_entity_id FOR UPDATE;

      IF v_before IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Địa điểm không tồn tại' USING errcode = 'P0002'; END IF;
      IF v_before->>'user_id' IS NOT NULL THEN v_target_user_id := (v_before->>'user_id')::uuid; END IF;
      v_current_status := v_before->>'status';

      UPDATE public.places
      SET status = v_new_status,
          note = CASE 
            WHEN p_action = 'return' THEN '[Yêu cầu chỉnh sửa]: ' || p_reason
            WHEN p_action = 'reject' THEN '[Từ chối]: ' || p_reason
            ELSE note 
          END,
          updated_at = now()
      WHERE id::text = p_entity_id
      RETURNING jsonb_build_object('id', id, 'name', name, 'status', status, 'user_id', user_id, 'updated_at', updated_at) INTO v_after;

    WHEN 'club' THEN
      SELECT jsonb_build_object('id', c.id, 'status', c.status) INTO v_before
      FROM public.clubs c WHERE c.id = p_entity_id FOR UPDATE;
      IF v_before IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Câu lạc bộ không tồn tại' USING errcode = 'P0002'; END IF;
      v_current_status := v_before->>'status';

      UPDATE public.clubs
      SET status = v_new_status,
          moderated_by = p_actor_id,
          moderated_at = now(),
          moderation_reason = CASE WHEN p_action IN ('reject', 'return') THEN p_reason ELSE moderation_reason END,
          admin_notes = coalesce(p_admin_notes, admin_notes),
          updated_at = now()
      WHERE id = p_entity_id
      RETURNING jsonb_build_object('id', id, 'status', status) INTO v_after;

    WHEN 'community_event' THEN
      SELECT jsonb_build_object('id', e.id, 'status', e.status) INTO v_before
      FROM public.community_events e WHERE e.id = p_entity_id FOR UPDATE;
      IF v_before IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Sự kiện không tồn tại' USING errcode = 'P0002'; END IF;
      v_current_status := v_before->>'status';

      UPDATE public.community_events
      SET status = v_new_status,
          moderated_by = p_actor_id,
          moderated_at = now(),
          moderation_reason = CASE WHEN p_action IN ('reject', 'return') THEN p_reason ELSE moderation_reason END,
          admin_notes = coalesce(p_admin_notes, admin_notes),
          updated_at = now()
      WHERE id = p_entity_id
      RETURNING jsonb_build_object('id', id, 'status', status) INTO v_after;

    WHEN 'club_activity' THEN
      SELECT jsonb_build_object('id', ca.id, 'status', ca.status) INTO v_before
      FROM public.club_activities ca WHERE ca.id = p_entity_id FOR UPDATE;
      IF v_before IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Lịch sinh hoạt không tồn tại' USING errcode = 'P0002'; END IF;
      v_current_status := v_before->>'status';

      UPDATE public.club_activities
      SET status = v_new_status,
          moderated_by = p_actor_id,
          moderated_at = now(),
          moderation_reason = CASE WHEN p_action IN ('reject', 'return') THEN p_reason ELSE moderation_reason END,
          admin_notes = coalesce(p_admin_notes, admin_notes),
          updated_at = now()
      WHERE id = p_entity_id
      RETURNING jsonb_build_object('id', id, 'status', status) INTO v_after;
  END CASE;

  -- 7. Ghi nhận/thu hồi điểm đóng góp nguyên tử
  IF v_target_user_id IS NOT NULL THEN
    IF p_action = 'approve' THEN
      v_point_result := public.record_content_moderation_points(
        p_actor_id, v_target_user_id, p_entity_type, p_entity_id,
        'approve', p_is_special,
        jsonb_build_object('moderator_email', p_actor_email, 'notes', p_admin_notes)
      );
    ELSIF p_action IN ('reject', 'archive', 'trash', 'return') AND v_current_status = 'approved' THEN
      v_point_result := public.record_content_moderation_points(
        p_actor_id, v_target_user_id, p_entity_type, p_entity_id,
        'reject', false,
        jsonb_build_object('moderator_email', p_actor_email, 'revocation_action', p_action)
      );
    END IF;
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

REVOKE ALL ON FUNCTION public.admin_moderate_entity_atomic(
  uuid, text, text, text, text, text, text, text, text, text, boolean
) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_moderate_entity_atomic(
  uuid, text, text, text, text, text, text, text, text, text, boolean
) TO service_role;
