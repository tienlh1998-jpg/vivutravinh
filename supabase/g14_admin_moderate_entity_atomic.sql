-- ============================================================================
-- ViVuTraVinh - G14 Atomic Moderation & Audit Logging
-- Hàm RPC admin_moderate_entity_atomic: đảm bảo tính nguyên tử (Atomicity)
-- giữa việc cập nhật trạng thái nội dung (UGC) và ghi nhật ký kiểm toán (admin_audit_logs).
--
-- QUY TẮC BẢO MẬT & KIẾN TRÚC:
-- 1. PostgreSQL Function tự chạy trong transaction của lời gọi; KHÔNG viết COMMIT/ROLLBACK bên trong.
-- 2. Khóa bi quan (FOR UPDATE) chống Race Condition khi có nhiều admin thao tác cùng lúc.
-- 3. Nếu bất kỳ bước nào thất bại (kể cả ghi audit log), toàn bộ thao tác tự động rollback,
--    trạng thái entity giữ nguyên không đổi.
-- 4. Thu hồi quyền từ public/anon/authenticated; chỉ cấp quyền thực thi cho service_role.
-- ============================================================================

-- Đảm bảo bảng public.clubs có cột admin_notes đồng nhất với các bảng UGC khác
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- Tạo hàm kiểm duyệt nguyên tử (Atomic Moderation RPC)
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
  p_correlation_id text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_new_status text;
  v_before jsonb;
  v_after jsonb;
  v_audit_action text;
BEGIN
  -- 1. Validate quyền hạn (RBAC)
  IF p_actor_role IS NULL OR p_actor_role NOT IN ('admin', 'moderator', 'editor') THEN
    RAISE EXCEPTION 'FORBIDDEN: Chỉ admin, moderator hoặc editor mới có quyền kiểm duyệt nội dung'
      USING errcode = '42501';
  END IF;

  -- 2. Validate loại nội dung (Allowlist Entity Type)
  IF p_entity_type IS NULL OR p_entity_type NOT IN ('community_post', 'club', 'community_event', 'article', 'club_activity') THEN
    RAISE EXCEPTION 'INVALID_ENTITY_TYPE: Loại nội dung không hợp lệ (community_post | club | community_event | article | club_activity)'
      USING errcode = '22023';
  END IF;

  -- 3. Validate mã định danh nội dung
  IF p_entity_id IS NULL OR trim(p_entity_id) = '' OR length(p_entity_id) > 128 THEN
    RAISE EXCEPTION 'INVALID_ENTITY_ID: Thiếu mã định danh nội dung hợp lệ'
      USING errcode = '22023';
  END IF;

  -- 4. Validate hành động kiểm duyệt
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

  -- 6. Khóa dòng dữ liệu (FOR UPDATE) & Đọc trạng thái trước khi sửa (payload_before)
  -- Cập nhật trạng thái mới & Lấy trạng thái sau khi sửa (payload_after)
  CASE p_entity_type
    WHEN 'community_post' THEN
      SELECT jsonb_build_object(
        'id', p.id,
        'title', p.title,
        'content', p.content,
        'status', p.status,
        'author_id', p.author_id,
        'author_name', p.author_name,
        'moderated_by', p.moderated_by,
        'moderated_at', p.moderated_at,
        'moderation_reason', p.moderation_reason,
        'admin_notes', p.admin_notes,
        'created_at', p.created_at
      ) INTO v_before
      FROM public.community_posts p
      WHERE p.id::text = p_entity_id
      FOR UPDATE;

      IF v_before IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Bài viết cộng đồng với mã % không tồn tại', p_entity_id
          USING errcode = 'P0002';
      END IF;

      UPDATE public.community_posts
      SET status = v_new_status,
          moderated_by = p_actor_id,
          moderated_at = now(),
          moderation_reason = CASE WHEN p_action = 'reject' THEN p_reason ELSE moderation_reason END,
          admin_notes = coalesce(p_admin_notes, admin_notes),
          updated_at = now()
      WHERE id::text = p_entity_id
      RETURNING jsonb_build_object(
        'id', id,
        'title', title,
        'content', content,
        'status', status,
        'author_id', author_id,
        'author_name', author_name,
        'moderated_by', moderated_by,
        'moderated_at', moderated_at,
        'moderation_reason', moderation_reason,
        'admin_notes', admin_notes,
        'updated_at', updated_at
      ) INTO v_after;

    WHEN 'club' THEN
      SELECT jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'category', c.category,
        'status', c.status,
        'leader_id', c.leader_id,
        'leader_name', c.leader_name,
        'moderated_by', c.moderated_by,
        'moderated_at', c.moderated_at,
        'moderation_reason', c.moderation_reason,
        'admin_notes', c.admin_notes,
        'created_at', c.created_at
      ) INTO v_before
      FROM public.clubs c
      WHERE c.id = p_entity_id
      FOR UPDATE;

      IF v_before IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Câu lạc bộ với mã % không tồn tại', p_entity_id
          USING errcode = 'P0002';
      END IF;

      UPDATE public.clubs
      SET status = v_new_status,
          moderated_by = p_actor_id,
          moderated_at = now(),
          moderation_reason = CASE WHEN p_action = 'reject' THEN p_reason ELSE moderation_reason END,
          admin_notes = coalesce(p_admin_notes, admin_notes),
          updated_at = now()
      WHERE id = p_entity_id
      RETURNING jsonb_build_object(
        'id', id,
        'name', name,
        'category', category,
        'status', status,
        'leader_id', leader_id,
        'leader_name', leader_name,
        'moderated_by', moderated_by,
        'moderated_at', moderated_at,
        'moderation_reason', moderation_reason,
        'admin_notes', admin_notes,
        'updated_at', updated_at
      ) INTO v_after;

    WHEN 'community_event' THEN
      SELECT jsonb_build_object(
        'id', e.id,
        'title', e.title,
        'organizer', e.organizer,
        'category', e.category,
        'time_schedule', e.time_schedule,
        'location', e.location,
        'status', e.status,
        'created_by', e.created_by,
        'creator_name', e.creator_name,
        'moderated_by', e.moderated_by,
        'moderated_at', e.moderated_at,
        'moderation_reason', e.moderation_reason,
        'admin_notes', e.admin_notes,
        'created_at', e.created_at
      ) INTO v_before
      FROM public.community_events e
      WHERE e.id = p_entity_id
      FOR UPDATE;

      IF v_before IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Sự kiện cộng đồng với mã % không tồn tại', p_entity_id
          USING errcode = 'P0002';
      END IF;

      UPDATE public.community_events
      SET status = v_new_status,
          moderated_by = p_actor_id,
          moderated_at = now(),
          moderation_reason = CASE WHEN p_action = 'reject' THEN p_reason ELSE moderation_reason END,
          admin_notes = coalesce(p_admin_notes, admin_notes),
          updated_at = now()
      WHERE id = p_entity_id
      RETURNING jsonb_build_object(
        'id', id,
        'title', title,
        'organizer', organizer,
        'category', category,
        'time_schedule', time_schedule,
        'location', location,
        'status', status,
        'created_by', created_by,
        'creator_name', creator_name,
        'moderated_by', moderated_by,
        'moderated_at', moderated_at,
        'moderation_reason', moderation_reason,
        'admin_notes', admin_notes,
        'updated_at', updated_at
      ) INTO v_after;

    WHEN 'article' THEN
      SELECT jsonb_build_object(
        'id', a.id,
        'slug', a.slug,
        'title', a.title,
        'category', a.category,
        'category_name', a.category_name,
        'status', a.status,
        'author_id', a.author_id,
        'author_name', a.author_name,
        'moderated_by', a.moderated_by,
        'moderated_at', a.moderated_at,
        'moderation_reason', a.moderation_reason,
        'admin_notes', a.admin_notes,
        'created_at', a.created_at
      ) INTO v_before
      FROM public.articles a
      WHERE a.id = p_entity_id
      FOR UPDATE;

      IF v_before IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Bài cẩm nang du lịch với mã % không tồn tại', p_entity_id
          USING errcode = 'P0002';
      END IF;

      UPDATE public.articles
      SET status = v_new_status,
          moderated_by = p_actor_id,
          moderated_at = now(),
          moderation_reason = CASE WHEN p_action = 'reject' THEN p_reason ELSE moderation_reason END,
          admin_notes = coalesce(p_admin_notes, admin_notes),
          updated_at = now()
      WHERE id = p_entity_id
      RETURNING jsonb_build_object(
        'id', id,
        'slug', slug,
        'title', title,
        'category', category,
        'category_name', category_name,
        'status', status,
        'author_id', author_id,
        'author_name', author_name,
        'moderated_by', moderated_by,
        'moderated_at', moderated_at,
        'moderation_reason', moderation_reason,
        'admin_notes', admin_notes,
        'updated_at', updated_at
      ) INTO v_after;

    WHEN 'club_activity' THEN
      SELECT jsonb_build_object(
        'id', act.id,
        'club_id', act.club_id,
        'club_name', act.club_name,
        'title', act.title,
        'time_schedule', act.time_schedule,
        'location', act.location,
        'status', act.status,
        'creator_id', act.creator_id,
        'creator_name', act.creator_name,
        'creator_role', act.creator_role,
        'moderated_by', act.moderated_by,
        'moderated_at', act.moderated_at,
        'moderation_reason', act.moderation_reason,
        'admin_notes', act.admin_notes,
        'created_at', act.created_at
      ) INTO v_before
      FROM public.club_activities act
      WHERE act.id = p_entity_id
      FOR UPDATE;

      IF v_before IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Lịch sinh hoạt CLB với mã % không tồn tại', p_entity_id
          USING errcode = 'P0002';
      END IF;

      UPDATE public.club_activities
      SET status = v_new_status,
          moderated_by = p_actor_id,
          moderated_at = now(),
          moderation_reason = CASE WHEN p_action = 'reject' THEN p_reason ELSE moderation_reason END,
          admin_notes = coalesce(p_admin_notes, admin_notes),
          updated_at = now()
      WHERE id = p_entity_id
      RETURNING jsonb_build_object(
        'id', id,
        'club_id', club_id,
        'club_name', club_name,
        'title', title,
        'time_schedule', time_schedule,
        'location', location,
        'status', status,
        'creator_id', creator_id,
        'creator_name', creator_name,
        'creator_role', creator_role,
        'moderated_by', moderated_by,
        'moderated_at', moderated_at,
        'moderation_reason', moderation_reason,
        'admin_notes', admin_notes,
        'updated_at', updated_at
      ) INTO v_after;
  END CASE;

  -- 7. Ghi nhật ký kiểm toán trong CÙNG TRANSACTION
  INSERT INTO public.admin_audit_logs (
    actor_id,
    actor_email,
    actor_role,
    action,
    entity_type,
    entity_id,
    payload_before,
    payload_after,
    ip,
    correlation_id,
    created_at
  ) VALUES (
    p_actor_id,
    p_actor_email,
    p_actor_role,
    v_audit_action,
    p_entity_type,
    p_entity_id,
    v_before,
    v_after,
    p_ip,
    p_correlation_id,
    now()
  );

  -- 8. Trả về kết quả nguyên tử
  RETURN jsonb_build_object(
    'success', true,
    'action', p_action,
    'entity_type', p_entity_type,
    'entity_id', p_entity_id,
    'status', v_new_status,
    'moderated_by', p_actor_email,
    'correlation_id', p_correlation_id,
    'data', v_after
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- 9. Phân quyền thực thi: Chỉ cho phép service_role
REVOKE ALL ON FUNCTION public.admin_moderate_entity_atomic(
  uuid, text, text, text, text, text, text, text, text, text
) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_moderate_entity_atomic(
  uuid, text, text, text, text, text, text, text, text, text
) TO service_role;
