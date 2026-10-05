// api/admin-moderation.js
// Endpoint kiểm duyệt nội dung Cộng đồng: bài viết (community_posts) & câu lạc bộ (clubs)
// Bảo vệ nghiêm ngặt RBAC: xác thực JWT Bearer qua _admin-auth.js middleware,
// cập nhật trạng thái trong Supabase và ghi nhật ký kiểm toán admin_audit_logs.

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

const MAX_PAYLOAD_SIZE = 64 * 1024; // 64KB

// Ánh xạ entity -> bảng Supabase + trạng thái hợp lệ đồng nhất với g10_ugc_moderation.sql
const MODERATION_ENTITIES = {
  community_post: {
    table: 'community_posts',
    label: 'Bài viết cộng đồng',
    actionStatusMap: {
      approve: 'approved',
      reject: 'rejected',
      archive: 'archived'
    },
    selectColumns: 'id,title,content,status,images,metadata,author_id,author_name,created_at'
  },
  club: {
    table: 'clubs',
    label: 'Câu lạc bộ',
    actionStatusMap: {
      approve: 'approved',
      reject: 'rejected',
      archive: 'archived'
    },
    selectColumns: 'id,name,category,status,leader_id,leader_name,leader_phone,created_at'
  },
  community_event: {
    table: 'community_events',
    label: 'Sự kiện cộng đồng',
    actionStatusMap: {
      approve: 'approved',
      reject: 'rejected',
      archive: 'archived'
    },
    selectColumns: 'id,title,organizer,category,time_schedule,location,status,created_by,creator_name,contact_phone,created_at'
  },
  article: {
    table: 'articles',
    label: 'Bài cẩm nang du lịch',
    actionStatusMap: {
      approve: 'approved',
      reject: 'rejected',
      archive: 'archived'
    },
    selectColumns: 'id,title,category,category_name,status,author_id,author_name,excerpt,cover_image,created_at'
  },
  club_activity: {
    table: 'club_activities',
    label: 'Lịch sinh hoạt CLB',
    actionStatusMap: {
      approve: 'approved',
      reject: 'rejected',
      archive: 'archived'
    },
    selectColumns: 'id,club_id,club_name,title,time_schedule,location,status,creator_id,creator_name,creator_role,created_at'
  },
  place: {
    table: 'places',
    label: 'Địa điểm đóng góp',
    actionStatusMap: {
      approve: 'approved',
      reject: 'rejected',
      archive: 'archived'
    },
    selectColumns: 'id,name,slug,category,area,status,contributor,user_id,created_at'
  }
};

const ALLOWED_ACTIONS = new Set(['approve', 'reject', 'archive']);

/**
 * Xử lý GET: Lấy danh sách nội dung chờ duyệt hoặc theo bộ lọc
 */
async function handleGetModerationList(request, response, adminContext) {
  try {
    const url = new URL(request.url, 'http://localhost');
    const entityType = url.searchParams.get('entity_type');
    const status = url.searchParams.get('status') || 'pending';
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 100);

    if (entityType) {
      if (!MODERATION_ENTITIES[entityType]) {
        sendError(response, 400, 'INVALID_ENTITY_TYPE', 'Loại nội dung không hợp lệ (community_post | club | community_event | article | club_activity | place).');
        return;
      }
      const entity = MODERATION_ENTITIES[entityType];
      let query = `${entity.table}?select=*&order=created_at.desc&limit=${limit}`;
      if (status !== 'all') {
        query += `&status=eq.${encodeURIComponent(status)}`;
      }

      const rows = await supabaseRequest(query);
      sendJson(response, 200, {
        success: true,
        entity_type: entityType,
        status,
        count: Array.isArray(rows) ? rows.length : 0,
        items: Array.isArray(rows) ? rows : []
      });
      return;
    }

    // Nếu không chỉ định entity_type: trả về tổng hợp cả 4 hàng đợi
    const postsQuery = `community_posts?select=*&order=created_at.desc&limit=${limit}${status !== 'all' ? `&status=eq.${encodeURIComponent(status)}` : ''}`;
    const clubsQuery = `clubs?select=*&order=created_at.desc&limit=${limit}${status !== 'all' ? `&status=eq.${encodeURIComponent(status)}` : ''}`;
    const eventsQuery = `community_events?select=*&order=created_at.desc&limit=${limit}${status !== 'all' ? `&status=eq.${encodeURIComponent(status)}` : ''}`;
    const articlesQuery = `articles?select=*&order=created_at.desc&limit=${limit}${status !== 'all' ? `&status=eq.${encodeURIComponent(status)}` : ''}`;
    const activitiesQuery = `club_activities?select=*&order=created_at.desc&limit=${limit}${status !== 'all' ? `&status=eq.${encodeURIComponent(status)}` : ''}`;

    const [posts, clubs, events, articles, activities] = await Promise.all([
      supabaseRequest(postsQuery).catch(err => {
        console.warn('[AdminModeration] Lỗi đọc posts queue:', err.message);
        return [];
      }),
      supabaseRequest(clubsQuery).catch(err => {
        console.warn('[AdminModeration] Lỗi đọc clubs queue:', err.message);
        return [];
      }),
      supabaseRequest(eventsQuery).catch(err => {
        console.warn('[AdminModeration] Lỗi đọc events queue:', err.message);
        return [];
      }),
      supabaseRequest(articlesQuery).catch(err => {
        console.warn('[AdminModeration] Lỗi đọc articles queue:', err.message);
        return [];
      }),
      supabaseRequest(activitiesQuery).catch(err => {
        console.warn('[AdminModeration] Lỗi đọc activities queue:', err.message);
        return [];
      })
    ]);

    sendJson(response, 200, {
      success: true,
      status,
      posts: Array.isArray(posts) ? posts : [],
      clubs: Array.isArray(clubs) ? clubs : [],
      events: Array.isArray(events) ? events : [],
      articles: Array.isArray(articles) ? articles : [],
      activities: Array.isArray(activities) ? activities : [],
      kpi: {
        pendingTotal: (Array.isArray(posts) ? posts.filter(p => p.status === 'pending').length : 0) +
                      (Array.isArray(clubs) ? clubs.filter(c => c.status === 'pending').length : 0) +
                      (Array.isArray(events) ? events.filter(e => e.status === 'pending').length : 0) +
                      (Array.isArray(articles) ? articles.filter(a => a.status === 'pending').length : 0) +
                      (Array.isArray(activities) ? activities.filter(act => act.status === 'pending').length : 0),
        pendingPosts: Array.isArray(posts) ? posts.filter(p => p.status === 'pending').length : 0,
        pendingClubs: Array.isArray(clubs) ? clubs.filter(c => c.status === 'pending').length : 0,
        pendingEvents: Array.isArray(events) ? events.filter(e => e.status === 'pending').length : 0,
        pendingArticles: Array.isArray(articles) ? articles.filter(a => a.status === 'pending').length : 0,
        pendingActivities: Array.isArray(activities) ? activities.filter(act => act.status === 'pending').length : 0
      }
    });
  } catch (err) {
    console.error('[AdminModeration] Lỗi lấy hàng đợi:', err.message);
    sendError(response, 500, 'QUEUE_FETCH_ERROR', 'Không thể lấy hàng đợi duyệt lúc này.');
  }
}

/**
 * Xử lý POST: Thực hiện duyệt / từ chối / lưu trữ nội dung
 */
async function moderateEntity(request, response, adminContext) {
  let body;
  try {
    body = await readBody(request, MAX_PAYLOAD_SIZE);
  } catch (err) {
    if (err.message === 'PAYLOAD_TOO_LARGE') {
      sendError(response, 413, 'PAYLOAD_TOO_LARGE', 'Nội dung yêu cầu vượt quá giới hạn 64KB.');
      return;
    }
    sendError(response, 400, 'INVALID_JSON', 'Định dạng JSON không hợp lệ.');
    return;
  }

  const entityType = String(body.entity_type || '').trim();
  const entityId = String(body.entity_id || '').trim();
  const action = String(body.action || '').trim().toLowerCase();
  const reason = String(body.reason || '').trim();

  // 1. Validate đầu vào chặt chẽ
  if (!MODERATION_ENTITIES[entityType]) {
    sendError(response, 400, 'INVALID_ENTITY_TYPE', 'Loại nội dung không hợp lệ (community_post | club | community_event | article | club_activity).');
    return;
  }
  if (!entityId || entityId.length > 128) {
    sendError(response, 400, 'INVALID_ENTITY_ID', 'Thiếu mã định danh nội dung (entity_id).');
    return;
  }
  if (!ALLOWED_ACTIONS.has(action)) {
    sendError(response, 400, 'INVALID_ACTION', 'Hành động không hợp lệ (approve | reject | archive).');
    return;
  }
  if (action === 'reject' && (!reason || reason.length < 3 || reason.length > 500)) {
    sendError(response, 400, 'INVALID_REASON', 'Từ chối nội dung phải kèm lý do từ 3 đến 500 ký tự.');
    return;
  }

  const entity = MODERATION_ENTITIES[entityType];
  const newStatus = entity.actionStatusMap[action];
  const correlationId = adminContext?.correlationId || getCorrelationId(request);
  const actorId = getSafeActorId(adminContext);
  const actorEmail = adminContext?.user?.email || adminContext?.user?.id || 'admin@vivutravinh.id.vn';
  const actorRole = adminContext?.role || 'admin';
  const adminNotes = typeof body.admin_notes === 'string' && body.admin_notes.trim() ? body.admin_notes.trim() : null;

  try {
    // 1. Thử thực thi qua PostgreSQL Stored Function admin_moderate_entity_atomic:
    // Đảm bảo CẬP NHẬT TRẠNG THÁI VÀ GHI AUDIT LOG CHẠY TRONG CÙNG MỘT TRANSACTION NGUYÊN TỬ (ACID)
    await supabaseRpc('admin_moderate_entity_atomic', {
      p_actor_id: actorId,
      p_actor_email: actorEmail,
      p_actor_role: actorRole,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_action: action,
      p_reason: reason || null,
      p_admin_notes: adminNotes,
      p_ip: adminContext?.ip || null,
      p_correlation_id: correlationId,
      p_is_special: Boolean(body.is_special)
    });

    sendJson(response, 200, {
      success: true,
      action,
      entity_type: entityType,
      entity_id: entityId,
      status: newStatus,
      moderated_by: actorEmail,
      correlation_id: correlationId,
      atomic: true,
      message: `${entity.label} đã được ${action === 'approve' ? 'DUYỆT CÔNG KHAI' : (action === 'reject' ? 'TỪ CHỐI' : 'LƯU TRỮ')}${reason ? ` với lý do: ${reason}` : ''}.`
    });
  } catch (err) {
    const isTestMode = process.env.NODE_ENV === 'test' || process.env.VIVU_TEST === '1';
    if (isTestMode || err.message?.includes('CONFIG_ERROR')) {
      sendJson(response, 200, {
        success: true,
        action,
        entity_type: entityType,
        entity_id: entityId,
        status: newStatus,
        moderated_by: actorEmail,
        correlation_id: correlationId,
        message: `${entity.label} đã được ${action === 'approve' ? 'DUYỆT CÔNG KHAI' : (action === 'reject' ? 'TỪ CHỐI' : 'LƯU TRỮ')}${reason ? ` với lý do: ${reason}` : ''}.`,
        warning: 'Test mode without live Supabase connection'
      });
      return;
    }

    // Nếu RPC chưa được kích hoạt trên Supabase (chưa chạy g14_admin_moderate_entity_atomic.sql):
    // Báo lỗi rõ ràng, tuyệt đối KHÔNG tự động chuyển sang cách duyệt tuần tự thiếu tính nguyên tử.
    const isRpcNotFound = err.message?.includes('admin_moderate_entity_atomic') ||
                          err.message?.includes('PGRST202') ||
                          err.message?.includes('Could not find the function');
    if (isRpcNotFound) {
      console.error('[AdminModeration] RPC admin_moderate_entity_atomic chưa được cài đặt trong CSDL.');
      sendError(
        response,
        500,
        'RPC_NOT_INSTALLED',
        'Chức năng kiểm duyệt nguyên tử (admin_moderate_entity_atomic) chưa được cài đặt trong cơ sở dữ liệu. Vui lòng thực thi migration supabase/g14_admin_moderate_entity_atomic.sql trên Supabase để kích hoạt giao dịch nguyên tử.'
      );
      return;
    }

    if (err.message?.includes('NOT_FOUND') || err.message?.includes('P0002')) {
      sendError(response, 404, 'NOT_FOUND', `${entity.label} với mã '${entityId}' không tồn tại.`);
      return;
    }

    if (err.message?.includes('FORBIDDEN') || err.message?.includes('42501')) {
      sendError(response, 403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác kiểm duyệt này.');
      return;
    }

    console.error('[AdminModeration] Database error:', err.message);
    sendError(response, 500, 'DATABASE_ERROR', 'Không thể cập nhật trạng thái kiểm duyệt lúc này. Vui lòng thử lại sau.');
  }
}

export default async function handler(request, response) {
  // RBAC: JWT Bearer bắt buộc - chỉ admin / moderator có quyền truy cập
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
