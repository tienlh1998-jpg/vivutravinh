// api/_admin/moderation.js
// Endpoint kiểm duyệt và quản trị nội dung toàn diện cho 6 thực thể:
// 1. places (Địa điểm)
// 2. articles (Cẩm nang du lịch / Blog)
// 3. community_posts (Bài viết cộng đồng)
// 4. clubs (Câu lạc bộ)
// 5. club_activities (Lịch sinh hoạt CLB)
// 6. community_events (Sự kiện cộng đồng)
//
// Hỗ trợ 7 nghiệp vụ quản trị:
// - approve: Duyệt công khai (+ điểm đóng góp chuẩn, chống cộng trùng Idempotency)
// - reject: Từ chối có lý do (thu hồi điểm nếu có)
// - edit: Sửa trực tiếp nội dung đã duyệt mà vẫn giữ trạng thái công khai
// - return: Hoàn duyệt có lý do để tác giả chỉnh sửa và gửi lại (tạm gỡ công khai, thu hồi điểm tạm thời)
// - hide / unhide: Ẩn tạm thời (Ẩn KHÔNG tự chuyển sang chờ duyệt!) và Hiện lại
// - trash / restore: Xóa vào thùng rác (lưu trữ) và Khôi phục
//
// Bảo vệ nghiêm ngặt RBAC (chặn người dùng thường, ghi nhật ký kiểm toán admin_audit_logs đầy đủ).

import {
  authenticateAdmin,
  requireRole,
  sendJson,
  sendError,
  readBody,
  supabaseRequest,
  supabaseRpc,
  getSafeActorId,
  getCorrelationId,
  recordAuditLog
} from '../_admin-auth.js';

const MAX_PAYLOAD_SIZE = 128 * 1024; // 128KB

// Ánh xạ entity -> bảng Supabase + cấu hình trường
const MODERATION_ENTITIES = {
  community_post: {
    table: 'community_posts',
    label: 'Bài viết cộng đồng',
    idType: 'string',
    authorField: 'author_id',
    hasMetadata: true,
    hasModerationReason: false,
    actionStatusMap: {
      approve: 'approved',
      reject: 'rejected',
      archive: 'archived',
      return: 'draft',
      hide: 'hidden',
      unhide: 'approved',
      trash: 'archived',
      restore: 'approved'
    },
    allowedEditFields: ['title', 'content', 'category', 'images', 'metadata']
  },
  club: {
    table: 'clubs',
    label: 'Câu lạc bộ',
    idType: 'string',
    authorField: 'leader_id',
    hasMetadata: false,
    hasModerationReason: true,
    actionStatusMap: {
      approve: 'approved',
      reject: 'rejected',
      archive: 'archived',
      return: 'draft',
      hide: 'hidden',
      unhide: 'approved',
      trash: 'archived',
      restore: 'approved'
    },
    allowedEditFields: ['name', 'category', 'category_name', 'description', 'meeting_place', 'schedule_info', 'image', 'icon', 'color']
  },
  community_event: {
    table: 'community_events',
    label: 'Sự kiện cộng đồng',
    idType: 'string',
    authorField: 'created_by',
    hasMetadata: false,
    hasModerationReason: true,
    actionStatusMap: {
      approve: 'approved',
      reject: 'rejected',
      archive: 'archived',
      return: 'draft',
      hide: 'hidden',
      unhide: 'approved',
      trash: 'archived',
      restore: 'approved'
    },
    allowedEditFields: ['title', 'organizer', 'category', 'time_schedule', 'location', 'region', 'description', 'fee', 'fee_type', 'max_attendees', 'contact_phone']
  },
  article: {
    table: 'articles',
    label: 'Bài cẩm nang du lịch',
    idType: 'string',
    authorField: 'author_id',
    hasMetadata: true,
    hasModerationReason: true,
    actionStatusMap: {
      approve: 'approved',
      reject: 'rejected',
      archive: 'archived',
      return: 'draft',
      hide: 'hidden',
      unhide: 'approved',
      trash: 'archived',
      restore: 'approved'
    },
    allowedEditFields: ['title', 'excerpt', 'content', 'category', 'category_name', 'category_badge', 'cover_image', 'read_time', 'related_place_ids']
  },
  club_activity: {
    table: 'club_activities',
    label: 'Lịch sinh hoạt CLB',
    idType: 'string',
    authorField: 'creator_id',
    hasMetadata: false,
    hasModerationReason: true,
    actionStatusMap: {
      approve: 'approved',
      reject: 'rejected',
      archive: 'archived',
      return: 'draft',
      hide: 'hidden',
      unhide: 'approved',
      trash: 'archived',
      restore: 'approved'
    },
    allowedEditFields: ['title', 'description', 'time_schedule', 'location', 'max_attendees', 'is_free', 'icon']
  },
  place: {
    table: 'places',
    label: 'Đề xuất địa điểm',
    idType: 'integer',
    authorField: 'user_id',
    hasMetadata: false,
    hasModerationReason: false,
    noteField: 'note',
    actionStatusMap: {
      approve: 'approved',
      reject: 'archived',
      archive: 'archived',
      return: 'draft',
      hide: 'hidden',
      unhide: 'approved',
      trash: 'archived',
      restore: 'approved'
    },
    allowedEditFields: [
      'name', 'slug', 'category', 'area', 'address', 'map_link', 'price_raw',
      'description', 'note', 'contact', 'coordinates', 'rating', 'opening_time',
      'closing_time', 'display_hours', 'operating_status', 'images', 'image_link'
    ]
  }
};

const ALLOWED_ACTIONS = new Set([
  'approve',
  'reject',
  'archive',
  'return',
  'hide',
  'unhide',
  'trash',
  'restore',
  'edit'
]);

// Bộ lọc định danh đề xuất địa điểm do người dùng gửi chờ duyệt
const PLACES_PENDING_FILTER = 'or=(and(status.eq.draft,or(client_submission_id.ilike.contrib*,slug.ilike.contrib*,and(contributor.neq.BQT%20ViVuTraVinh,contributor.neq.Admin))),status.eq.pending)';

/**
 * Truy vấn tổng số lượng mục đang chờ duyệt chính xác
 */
async function fetchExactPendingCounts() {
  const [postsRes, clubsRes, eventsRes, articlesRes, actsRes, placesRes] = await Promise.all([
    supabaseRequest('community_posts?select=id&status=eq.pending', { count: true }).catch(() => ({ total: 0 })),
    supabaseRequest('clubs?select=id&status=eq.pending', { count: true }).catch(() => ({ total: 0 })),
    supabaseRequest('community_events?select=id&status=eq.pending', { count: true }).catch(() => ({ total: 0 })),
    supabaseRequest('articles?select=id&status=eq.pending', { count: true }).catch(() => ({ total: 0 })),
    supabaseRequest('club_activities?select=id&status=eq.pending', { count: true }).catch(() => ({ total: 0 })),
    supabaseRequest(`places?select=id&${PLACES_PENDING_FILTER}`, { count: true }).catch(() => ({ total: 0 }))
  ]);

  const pPosts = typeof postsRes?.total === 'number' ? postsRes.total : (Array.isArray(postsRes?.data) ? postsRes.data.length : 0);
  const pClubs = typeof clubsRes?.total === 'number' ? clubsRes.total : (Array.isArray(clubsRes?.data) ? clubsRes.data.length : 0);
  const pEvents = typeof eventsRes?.total === 'number' ? eventsRes.total : (Array.isArray(eventsRes?.data) ? eventsRes.data.length : 0);
  const pArticles = typeof articlesRes?.total === 'number' ? articlesRes.total : (Array.isArray(articlesRes?.data) ? articlesRes.data.length : 0);
  const pActivities = typeof actsRes?.total === 'number' ? actsRes.total : (Array.isArray(actsRes?.data) ? actsRes.data.length : 0);
  const pPlaces = typeof placesRes?.total === 'number' ? placesRes.total : (Array.isArray(placesRes?.data) ? placesRes.data.length : 0);

  return {
    pendingTotal: pPosts + pClubs + pEvents + pArticles + pActivities + pPlaces,
    pendingPosts: pPosts,
    pendingClubs: pClubs,
    pendingEvents: pEvents,
    pendingArticles: pArticles,
    pendingActivities: pActivities,
    pendingPlaces: pPlaces,
    hasError: false
  };
}

/**
 * Xây dựng chuỗi filter truy vấn theo trạng thái
 */
function buildStatusFilter(entityType, status) {
  if (status === 'all') return '';
  if (status === 'pending') {
    if (entityType === 'place') return `&${PLACES_PENDING_FILTER}`;
    return '&status=eq.pending';
  }
  if (status === 'returned') {
    if (entityType === 'place') {
      return '&status=eq.draft';
    }
    return '&or=(status.eq.returned,and(status.eq.draft,moderation_reason.neq.null))';
  }
  if (status === 'approved') {
    return '&status=eq.approved';
  }
  if (status === 'hidden') {
    if (entityType === 'place') {
      return '&status=eq.hidden';
    }
    if (entityType === 'community_post') {
      return '&or=(status.eq.hidden,metadata->>is_hidden.eq.true)';
    }
    if (entityType === 'article') {
      return '&or=(status.eq.hidden,metadata->>is_hidden.eq.true,admin_notes.ilike.*TẠM ẨN*)';
    }
    return '&or=(status.eq.hidden,admin_notes.ilike.*TẠM ẨN*)';
  }
  if (status === 'archived' || status === 'trash') {
    return '&status=eq.archived';
  }
  return `&status=eq.${encodeURIComponent(status)}`;
}

/**
 * Bộ lọc in-memory bảo đảm danh sách trả về khớp 100% tiêu chí trạng thái
 */
function filterItemsByModerationStatus(rows, entityType, status) {
  if (!Array.isArray(rows)) return [];
  if (status === 'all') return rows;
  if (status === 'hidden') {
    return rows.filter(item => {
      if (item.status === 'hidden') return true;
      if (item.metadata?.is_hidden === true) return true;
      if (typeof item.admin_notes === 'string' && item.admin_notes.includes('TẠM ẨN')) return true;
      return false;
    });
  }
  if (status === 'approved') {
    return rows.filter(item => {
      if (item.status !== 'approved') return false;
      if (item.metadata?.is_hidden === true) return false;
      if (typeof item.admin_notes === 'string' && item.admin_notes.includes('TẠM ẨN')) return false;
      return true;
    });
  }
  if (status === 'returned') {
    return rows.filter(item => {
      if (item.status === 'returned') return true;
      if (item.metadata?.is_returned === true) return true;
      if (item.status === 'draft' && (item.moderation_reason || (typeof item.note === 'string' && item.note.includes('chỉnh sửa')))) return true;
      return false;
    });
  }
  if (status === 'archived' || status === 'trash') {
    return rows.filter(item => item.status === 'archived' || item.metadata?.is_trash === true);
  }
  if (status === 'pending') {
    return rows.filter(item => {
      if (entityType === 'place') {
        const isContrib = (typeof item.client_submission_id === 'string' && item.client_submission_id.startsWith('contrib')) ||
                          (typeof item.slug === 'string' && item.slug.startsWith('contrib')) ||
                          (item.contributor && !item.contributor.includes('BQT'));
        return (item.status === 'draft' && isContrib) || item.status === 'pending';
      }
      return item.status === 'pending';
    });
  }
  return rows.filter(item => item.status === status);
}

/**
 * Xử lý GET: Lấy danh sách nội dung chờ duyệt hoặc theo bộ lọc
 */
async function handleGetModerationList(request, response, adminContext) {
  try {
    const url = new URL(request.url, 'http://localhost');
    const entityType = url.searchParams.get('entity_type');
    const status = url.searchParams.get('status') || 'pending';
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 100);
    const countsOnly = url.searchParams.get('counts_only') === 'true' || url.searchParams.get('counts_only') === '1';

    if (countsOnly) {
      try {
        const kpi = await fetchExactPendingCounts();
        sendJson(response, 200, { success: true, kpi });
        return;
      } catch (countErr) {
        console.error('[AdminModeration] Lỗi fetchExactPendingCounts:', countErr.message);
        sendError(response, 500, 'COUNT_FETCH_ERROR', 'Không thể lấy số lượng chờ duyệt lúc này.');
        return;
      }
    }

    if (entityType) {
      if (!MODERATION_ENTITIES[entityType]) {
        sendError(response, 400, 'INVALID_ENTITY_TYPE', 'Loại nội dung không hợp lệ.');
        return;
      }
      const entity = MODERATION_ENTITIES[entityType];
      const filter = buildStatusFilter(entityType, status);
      const query = `${entity.table}?select=*&order=created_at.desc&limit=${limit}${filter}`;

      const [rawRows, kpi] = await Promise.all([
        supabaseRequest(query).catch(e => {
          console.warn(`[AdminModeration] Query error ${entity.table}:`, e.message);
          return [];
        }),
        fetchExactPendingCounts().catch(() => ({ hasError: true }))
      ]);

      const items = filterItemsByModerationStatus(rawRows, entityType, status);

      sendJson(response, 200, {
        success: true,
        entity_type: entityType,
        status,
        count: items.length,
        items,
        kpi
      });
      return;
    }

    // Không chỉ định entity: lấy cả 6
    const [posts, clubs, events, articles, activities, places, kpi] = await Promise.all([
      supabaseRequest(`community_posts?select=*&order=created_at.desc&limit=${limit}${buildStatusFilter('community_post', status)}`).catch(() => []),
      supabaseRequest(`clubs?select=*&order=created_at.desc&limit=${limit}${buildStatusFilter('club', status)}`).catch(() => []),
      supabaseRequest(`community_events?select=*&order=created_at.desc&limit=${limit}${buildStatusFilter('community_event', status)}`).catch(() => []),
      supabaseRequest(`articles?select=*&order=created_at.desc&limit=${limit}${buildStatusFilter('article', status)}`).catch(() => []),
      supabaseRequest(`club_activities?select=*&order=created_at.desc&limit=${limit}${buildStatusFilter('club_activity', status)}`).catch(() => []),
      supabaseRequest(`places?select=*&order=created_at.desc&limit=${limit}${buildStatusFilter('place', status)}`).catch(() => []),
      fetchExactPendingCounts().catch(() => ({ hasError: true }))
    ]);

    sendJson(response, 200, {
      success: true,
      status,
      posts: filterItemsByModerationStatus(posts, 'community_post', status),
      clubs: filterItemsByModerationStatus(clubs, 'club', status),
      events: filterItemsByModerationStatus(events, 'community_event', status),
      articles: filterItemsByModerationStatus(articles, 'article', status),
      activities: filterItemsByModerationStatus(activities, 'club_activity', status),
      places: filterItemsByModerationStatus(places, 'place', status),
      kpi
    });
  } catch (err) {
    console.error('[AdminModeration] Lỗi lấy hàng đợi:', err.message);
    sendError(response, 500, 'QUEUE_FETCH_ERROR', 'Không thể lấy hàng đợi duyệt lúc này.');
  }
}

/**
 * Xử lý POST: Thực hiện duyệt / từ chối / sửa / hoàn duyệt / ẩn / hiện / thùng rác / khôi phục
 */
async function moderateEntity(request, response, adminContext) {
  let body;
  try {
    body = await readBody(request, MAX_PAYLOAD_SIZE);
  } catch (err) {
    if (err.message === 'PAYLOAD_TOO_LARGE') {
      sendError(response, 413, 'PAYLOAD_TOO_LARGE', 'Nội dung yêu cầu vượt quá giới hạn.');
      return;
    }
    sendError(response, 400, 'INVALID_JSON', 'Định dạng JSON không hợp lệ.');
    return;
  }

  const entityType = String(body.entity_type || '').trim();
  const entityId = String(body.entity_id || '').trim();
  const action = String(body.action || '').trim().toLowerCase();
  const reason = String(body.reason || '').trim();

  // 1. Validate cơ bản
  if (!MODERATION_ENTITIES[entityType]) {
    sendError(response, 400, 'INVALID_ENTITY_TYPE', 'Loại nội dung không hợp lệ (community_post | club | community_event | article | club_activity | place).');
    return;
  }
  if (!entityId || entityId.length > 128) {
    sendError(response, 400, 'INVALID_ENTITY_ID', 'Thiếu mã định danh nội dung (entity_id).');
    return;
  }
  if (!ALLOWED_ACTIONS.has(action)) {
    sendError(response, 400, 'INVALID_ACTION', 'Hành động không hợp lệ (approve | reject | archive | return | hide | unhide | trash | restore | edit).');
    return;
  }

  // 2. Validate lý do đối với reject & return
  if (action === 'reject' && (!reason || reason.length < 3 || reason.length > 500)) {
    sendError(response, 400, 'INVALID_REASON', 'Từ chối nội dung phải kèm lý do từ 3 đến 500 ký tự.');
    return;
  }
  if (action === 'return' && (!reason || reason.length < 3 || reason.length > 500)) {
    sendError(response, 400, 'INVALID_REASON', 'Hoàn duyệt yêu cầu chỉnh sửa phải kèm lý do và hướng dẫn từ 3 đến 500 ký tự.');
    return;
  }

  // 3. Validate dữ liệu edit
  if (action === 'edit') {
    const patchData = body.patch || body.data;
    if (!patchData || typeof patchData !== 'object' || Object.keys(patchData).length === 0) {
      sendError(response, 400, 'INVALID_PAYLOAD', 'Hành động sửa trực tiếp yêu cầu trường "patch" hoặc "data" chứa thông tin cần cập nhật.');
      return;
    }
  }

  const entity = MODERATION_ENTITIES[entityType];
  const correlationId = adminContext?.correlationId || getCorrelationId(request);
  const actorId = getSafeActorId(adminContext);
  const actorEmail = adminContext?.user?.email || adminContext?.user?.id || 'admin@vivutravinh.id.vn';
  const actorRole = adminContext?.user?.role || adminContext?.role || 'admin';
  const adminNotes = typeof body.admin_notes === 'string' && body.admin_notes.trim() ? body.admin_notes.trim() : null;

  try {
    // 4. Lấy bản ghi hiện tại (payloadBefore)
    const existingRows = await supabaseRequest(`${entity.table}?id=eq.${encodeURIComponent(entityId)}&limit=1`);
    const current = Array.isArray(existingRows) && existingRows.length > 0 ? existingRows[0] : null;

    if (!current) {
      sendError(response, 404, 'NOT_FOUND', `${entity.label} với mã '${entityId}' không tồn tại.`);
      return;
    }

    const authorId = current[entity.authorField] || null;
    const nowIso = new Date().toISOString();
    let newStatus = current.status;
    let patchToApply = { updated_at: nowIso };

    // Bổ sung audit tracking vào patch nếu bảng hỗ trợ
    if (entityType !== 'place') {
      patchToApply.moderated_by = actorId;
      patchToApply.moderated_at = nowIso;
      if (adminNotes) patchToApply.admin_notes = adminNotes;
    }

    let actionMessage = '';

    // 5. Xử lý logic cụ thể theo từng action
    if (action === 'approve') {
      newStatus = 'approved';
      patchToApply.status = 'approved';
      if (entity.hasModerationReason) {
        patchToApply.moderation_reason = null;
      }
      if (entity.hasMetadata && current.metadata) {
        patchToApply.metadata = { ...current.metadata, is_returned: false, is_hidden: false, is_trash: false };
      }
      actionMessage = `${entity.label} đã được DUYỆT CÔNG KHAI.`;

      // Cộng điểm đóng góp an toàn (Idempotency)
      if (authorId) {
        try {
          await supabaseRpc('record_content_moderation_points', {
            p_actor_id: actorId,
            p_user_id: authorId,
            p_entity_type: entityType,
            p_entity_id: entityId,
            p_action: 'approve',
            p_is_special: Boolean(body.is_special),
            p_metadata: { moderator_email: actorEmail, notes: adminNotes }
          });
        } catch (pointErr) {
          console.warn('[AdminModeration] Điểm thưởng warn:', pointErr.message);
        }
      }
    } else if (action === 'reject') {
      newStatus = (entityType === 'place') ? 'archived' : 'rejected';
      patchToApply.status = newStatus;
      if (entity.hasModerationReason) {
        patchToApply.moderation_reason = reason;
        patchToApply.admin_notes = adminNotes || `[TỪ CHỐI] ${reason}`;
      } else if (entity.noteField) {
        patchToApply.note = `[Từ chối bởi BQT]: ${reason}`;
      }
      if (entity.hasMetadata) {
        const currentMeta = current.metadata || {};
        patchToApply.metadata = {
          ...currentMeta,
          rejection_reason: reason,
          rejected_at: nowIso
        };
      }
      actionMessage = `${entity.label} đã bị TỪ CHỐI với lý do: "${reason}".`;

      // Thu hồi điểm nếu trước đó đã được duyệt
      if (authorId && current.status === 'approved') {
        try {
          await supabaseRpc('record_content_moderation_points', {
            p_actor_id: actorId,
            p_user_id: authorId,
            p_entity_type: entityType,
            p_entity_id: entityId,
            p_action: 'reject',
            p_is_special: false,
            p_metadata: { revocation_reason: reason, moderator_email: actorEmail }
          });
        } catch (pointErr) {
          console.warn('[AdminModeration] Điểm thu hồi warn:', pointErr.message);
        }
      }
    } else if (action === 'return') {
      // Hoàn duyệt để tác giả chỉnh sửa và gửi lại
      // Tạm gỡ công khai: status chuyển thành draft kèm lý do & hướng dẫn sửa
      newStatus = 'draft';
      patchToApply.status = 'draft';
      if (entity.hasModerationReason) {
        patchToApply.moderation_reason = reason;
        patchToApply.admin_notes = adminNotes || `[YÊU CẦU CHỈNH SỬA] ${reason}`;
      } else if (entity.noteField) {
        patchToApply.note = `[Yêu cầu chỉnh sửa từ BQT]: ${reason}`;
      }
      if (entity.hasMetadata) {
        const currentMeta = current.metadata || {};
        patchToApply.metadata = {
          ...currentMeta,
          is_returned: true,
          return_reason: reason,
          returned_at: nowIso,
          previous_status: current.status
        };
      }
      actionMessage = `${entity.label} đã được HOÀN DUYỆT để tác giả chỉnh sửa với lý do: "${reason}".`;

      // Nếu trước đó đang approved, tạm thu hồi điểm để không hiển thị thành tích khi chưa hoàn thiện
      if (authorId && current.status === 'approved') {
        try {
          await supabaseRpc('record_content_moderation_points', {
            p_actor_id: actorId,
            p_user_id: authorId,
            p_entity_type: entityType,
            p_entity_id: entityId,
            p_action: 'reject',
            p_is_special: false,
            p_metadata: { revocation_reason: `Hoàn duyệt: ${reason}`, moderator_email: actorEmail }
          });
        } catch (pointErr) {
          console.warn('[AdminModeration] Tạm thu hồi điểm hoàn duyệt warn:', pointErr.message);
        }
      }
    } else if (action === 'hide') {
      // ẨN NỘI DUNG: Ẩn không tự chuyển sang chờ duyệt!
      newStatus = 'hidden';
      if (entityType === 'place') {
        patchToApply.status = 'hidden';
      } else {
        if (entity.hasMetadata) {
          const currentMeta = current.metadata || {};
          patchToApply.metadata = {
            ...currentMeta,
            is_hidden: true,
            hidden_at: nowIso,
            previous_status: current.status
          };
        }
        if (entity.hasModerationReason) {
          patchToApply.admin_notes = `[TẠM ẨN BỞI BQT - ${nowIso}] ${adminNotes || current.admin_notes || ''}`.trim();
        }

        // Thử áp dụng status hidden nếu DB đã cập nhật
        try {
          await supabaseRequest(`${entity.table}?id=eq.${encodeURIComponent(entityId)}`, {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({ status: 'hidden' })
          });
          patchToApply.status = 'hidden';
        } catch (_) {
          // Fallback giữ nguyên status cũ kèm flag
          patchToApply.status = current.status;
          newStatus = current.status;
        }
      }
      actionMessage = `${entity.label} đã được TẠM ẨN khỏi trang công khai (không chuyển về chờ duyệt).`;
    } else if (action === 'unhide') {
      // HIỆN LẠI NỘI DUNG: Chuyển lại trạng thái công khai approved, không qua pending
      newStatus = 'approved';
      patchToApply.status = 'approved';
      if (entity.hasMetadata) {
        const currentMeta = current.metadata || {};
        patchToApply.metadata = {
          ...currentMeta,
          is_hidden: false,
          unhidden_at: nowIso
        };
      }
      if (entity.hasModerationReason) {
        const cleanNotes = (current.admin_notes || '')
          .replace(/\[TẠM ẨN[^\]]*\]/g, '')
          .trim();
        patchToApply.admin_notes = `[HIỆN LẠI CÔNG KHAI - ${nowIso}] ${cleanNotes}`.trim();
      }
      if (entity.noteField) {
        const cleanNote = (current.note || '')
          .replace(/\[TẠM ẨN[^\]]*\]/g, '')
          .trim();
        patchToApply.note = `[HIỆN LẠI CÔNG KHAI - ${nowIso}] ${cleanNote}`.trim();
      }
      actionMessage = `${entity.label} đã được HIỆN LẠI công khai trên hệ thống.`;
      // Không cộng thêm điểm trùng lặp
    } else if (action === 'trash' || action === 'archive') {
      // XÓA VÀO THÙNG RÁC: status = 'archived'
      newStatus = 'archived';
      patchToApply.status = 'archived';
      if (entity.hasMetadata) {
        const currentMeta = current.metadata || {};
        patchToApply.metadata = {
          ...currentMeta,
          is_trash: true,
          trashed_at: nowIso,
          previous_status: current.status
        };
      }
      if (entity.hasModerationReason) {
        patchToApply.admin_notes = `[PREV_STATUS:${current.status}][THÙNG RÁC - ${nowIso}] ${current.admin_notes || ''}`.trim();
      } else if (entity.noteField) {
        patchToApply.note = `[PREV_STATUS:${current.status}][THÙNG RÁC - ${nowIso}] ${current.note || ''}`.trim();
      }
      actionMessage = `${entity.label} đã được chuyển vào THÙNG RÁC (lưu trữ).`;

      // Thu hồi điểm nếu trước đó đang approved
      if (authorId && current.status === 'approved') {
        try {
          await supabaseRpc('record_content_moderation_points', {
            p_actor_id: actorId,
            p_user_id: authorId,
            p_entity_type: entityType,
            p_entity_id: entityId,
            p_action: 'archive',
            p_is_special: false,
            p_metadata: { revocation_reason: 'Chuyển vào thùng rác', moderator_email: actorEmail }
          });
        } catch (pointErr) {
          console.warn('[AdminModeration] Thu hồi điểm thùng rác warn:', pointErr.message);
        }
      }
    } else if (action === 'restore') {
      // KHÔI PHỤC TỪ THÙNG RÁC: Khôi phục về đúng previous_status, không mặc định approved!
      let targetRestoredStatus = 'pending';
      if (entity.hasMetadata && current.metadata?.previous_status) {
        targetRestoredStatus = current.metadata.previous_status;
      } else if (entity.hasModerationReason && typeof current.admin_notes === 'string') {
        const m = current.admin_notes.match(/\[PREV_STATUS:([a-zA-Z0-9_-]+)\]/);
        if (m) targetRestoredStatus = m[1];
      } else if (entity.noteField && typeof current.note === 'string') {
        const m = current.note.match(/\[PREV_STATUS:([a-zA-Z0-9_-]+)\]/);
        if (m) targetRestoredStatus = m[1];
      }

      newStatus = targetRestoredStatus;
      patchToApply.status = targetRestoredStatus;
      if (entity.hasMetadata) {
        const currentMeta = current.metadata || {};
        patchToApply.metadata = {
          ...currentMeta,
          is_trash: false,
          restored_at: nowIso
        };
      }
      if (entity.hasModerationReason) {
        const cleanNotes = (current.admin_notes || '')
          .replace(/\[PREV_STATUS:[^\]]+\]/g, '')
          .replace(/\[THÙNG RÁC[^\]]*\]/g, '')
          .trim();
        patchToApply.admin_notes = `[KHÔI PHỤC - ${nowIso}] ${cleanNotes}`.trim();
      }
      if (entity.noteField) {
        const cleanNote = (current.note || '')
          .replace(/\[PREV_STATUS:[^\]]+\]/g, '')
          .replace(/\[THÙNG RÁC[^\]]*\]/g, '')
          .trim();
        patchToApply.note = `[KHÔI PHỤC - ${nowIso}] ${cleanNote}`.trim();
      }

      actionMessage = `${entity.label} đã được KHÔI PHỤC thành công về trạng thái ban đầu: ${targetRestoredStatus}.`;

      // Nếu trạng thái phục hồi là approved thì mới phục hồi điểm thưởng
      if (authorId && targetRestoredStatus === 'approved') {
        try {
          await supabaseRpc('record_content_moderation_points', {
            p_actor_id: actorId,
            p_user_id: authorId,
            p_entity_type: entityType,
            p_entity_id: entityId,
            p_action: 'approve',
            p_is_special: false,
            p_metadata: { notes: 'Khôi phục từ thùng rác về approved', moderator_email: actorEmail }
          });
        } catch (pointErr) {
          console.warn('[AdminModeration] Phục hồi điểm thùng rác warn:', pointErr.message);
        }
      }
    } else if (action === 'edit') {
      // SỬA TRỰC TIẾP NỘI DUNG ĐÃ DUYỆT MÀ GIỮ NGUYÊN TRẠNG THÁI CÔNG KHAI
      const rawPatch = body.patch || body.data || {};
      const allowedKeys = new Set(entity.allowedEditFields);
      let editedCount = 0;

      for (const [key, val] of Object.entries(rawPatch)) {
        if (allowedKeys.has(key)) {
          patchToApply[key] = val;
          editedCount++;
        }
      }

      if (editedCount === 0) {
        sendError(response, 400, 'NO_VALID_FIELDS', 'Không có trường dữ liệu hợp lệ nào được cung cấp để chỉnh sửa.');
        return;
      }

      // Giữ nguyên trạng thái hiện tại (nếu đang approved thì vẫn là approved)
      patchToApply.status = current.status;
      newStatus = current.status;
      actionMessage = `${entity.label} đã được CẬP NHẬT TRỰC TIẾP (giữ nguyên trạng thái ${current.status}).`;
    }

    // 6. Thực hiện UPDATE vào Supabase REST API
    const updateResult = await supabaseRequest(`${entity.table}?id=eq.${encodeURIComponent(entityId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patchToApply)
    });

    const updatedRow = Array.isArray(updateResult) && updateResult.length > 0 ? updateResult[0] : { ...current, ...patchToApply };

    // 7. Ghi nhật ký kiểm toán (admin_audit_logs)
    const auditAction = `moderation.${action}.${entityType}`;
    await recordAuditLog({
      adminContext,
      action: auditAction,
      entityType,
      entityId,
      payloadBefore: current,
      payloadAfter: updatedRow,
      correlationId,
      ip: adminContext?.ip
    }).catch(auditErr => {
      console.warn('[AdminModeration] Ghi audit log cảnh báo (không chặn trả lời):', auditErr.message);
    });

    sendJson(response, 200, {
      success: true,
      action,
      entity_type: entityType,
      entity_id: entityId,
      status: newStatus,
      moderated_by: actorEmail,
      moderated_at: nowIso,
      correlation_id: correlationId,
      message: actionMessage,
      data: updatedRow
    });
  } catch (err) {
    console.error('[AdminModeration] Database error:', err.message);
    sendError(response, 500, 'DATABASE_ERROR', `Không thể thực hiện thao tác ${action} lúc này: ${err.message}`);
  }
}

export default async function handler(request, response) {
  // RBAC: JWT Bearer bắt buộc - chỉ admin / moderator / editor có quyền truy cập
  const adminContext = await authenticateAdmin(request, response);
  if (!adminContext) {
    return; // authenticateAdmin đã tự gửi response 401/403/429
  }

  if (!requireRole(adminContext, ['admin', 'moderator', 'editor'], response)) {
    return; // requireRole đã tự gửi response 403
  }

  if (request.method === 'GET') {
    await handleGetModerationList(request, response, adminContext);
    return;
  }

  if (request.method === 'POST') {
    await moderateEntity(request, response, adminContext);
    return;
  }

  sendError(response, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed. Use GET or POST.');
}
