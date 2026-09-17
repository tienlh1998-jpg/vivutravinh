// api/admin-reports.js
// Endpoint quản trị xử lý báo cáo sai thông tin địa điểm (place_reports) - G8.2

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
  parsePagination
} from './_admin-auth.js';

const TABLE_NAME = 'place_reports';
const VALID_STATUSES = ['pending', 'reviewed', 'resolved', 'dismissed'];

// Định nghĩa ma trận chuyển đổi trạng thái hợp lệ
// Luồng xử lý: pending -> reviewed -> resolved / dismissed
// Luồng mở lại (Re-open): resolved / dismissed -> reviewed (để thẩm định lại)
// Bị chặn: Không thể chuyển trực tiếp resolved <-> dismissed hoặc quay lại pending
export const VALID_TRANSITIONS = {
  pending: ['pending', 'reviewed', 'resolved', 'dismissed'],
  reviewed: ['reviewed', 'resolved', 'dismissed'],
  resolved: ['resolved', 'reviewed'],
  dismissed: ['dismissed', 'reviewed']
};

export async function listReports(request, response, adminContext) {
  const { page, limit, offset, searchParams } = parsePagination(request.url, 20, 100);
  const statusFilter = searchParams.get('status');
  const searchQuery = searchParams.get('search');
  const placeIdFilter = searchParams.get('place_id');

  const queryParts = [
    'select=id,place_id,place_name,issue_type,details,reporter_contact,ip,client_report_id,status,created_at,reviewed_at,admin_notes',
    'order=created_at.desc,id.desc',
    `limit=${limit}`,
    `offset=${offset}`
  ];

  if (statusFilter && VALID_STATUSES.includes(statusFilter)) {
    queryParts.push(`status=eq.${encodeURIComponent(statusFilter)}`);
  }

  if (placeIdFilter) {
    queryParts.push(`place_id=eq.${encodeURIComponent(placeIdFilter)}`);
  }

  if (searchQuery) {
    const cleanSearch = searchQuery.trim();
    if (cleanSearch) {
      queryParts.push(`or=(place_name.ilike.*${encodeURIComponent(cleanSearch)}*,details.ilike.*${encodeURIComponent(cleanSearch)}*,place_id.ilike.*${encodeURIComponent(cleanSearch)}*)`);
    }
  }

  const endpoint = `${TABLE_NAME}?${queryParts.join('&')}`;
  const result = await supabaseRequest(endpoint, { count: true });
  const rawReports = Array.isArray(result) ? result : (result.data || []);
  const total = typeof result.total === 'number' ? result.total : rawReports.length;

  // Lọc PII: Chỉ Admin và Moderator mới được xem reporter_contact và IP
  const canViewPII = ['admin', 'moderator'].includes(adminContext.user.role);
  const sanitizedReports = rawReports.map(report => {
    if (canViewPII) return report;
    return {
      ...report,
      reporter_contact: null,
      ip: null
    };
  });

  const totalPages = Math.ceil(total / limit) || 1;

  sendJson(response, 200, {
    success: true,
    reports: sanitizedReports,
    pagination: {
      page,
      limit,
      total,
      total_pages: totalPages
    }
  });
}

export async function updateReport(request, response, adminContext) {
  let body;
  try {
    body = await readBody(request);
  } catch (err) {
    if (err.message === 'PAYLOAD_TOO_LARGE') {
      sendError(response, 413, 'PAYLOAD_TOO_LARGE', 'Payload vượt quá giới hạn 1MB.');
      return;
    }
    sendError(response, 400, 'INVALID_JSON', 'Dữ liệu JSON không hợp lệ.');
    return;
  }

  const id = body.id;
  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    sendError(response, 400, 'INVALID_INPUT', 'Yêu cầu cung cấp id báo cáo hợp lệ.');
    return;
  }

  // Validate UUID format
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
  if (!isUuid) {
    // Nếu ID không phải UUID, chắc chắn không tồn tại trong cơ sở dữ liệu
    sendError(response, 404, 'NOT_FOUND', 'Không tìm thấy báo cáo yêu cầu.');
    return;
  }

  // Chống Mass Assignment ở tầng API
  if (body.status !== undefined) {
    const nextStatus = String(body.status).trim().toLowerCase();
    if (!VALID_STATUSES.includes(nextStatus)) {
      sendError(response, 400, 'INVALID_STATUS', `Trạng thái không hợp lệ: '${nextStatus}'. Hợp lệ: [${VALID_STATUSES.join(', ')}].`);
      return;
    }
  }

  if (body.status === undefined && body.admin_notes === undefined) {
    sendError(response, 400, 'INVALID_INPUT', 'Không có trường dữ liệu hợp lệ để cập nhật (chỉ chấp nhận status hoặc admin_notes).');
    return;
  }

  const actorId = getSafeActorId(adminContext);
  const actorEmail = adminContext?.user?.email || null;
  const actorRole = adminContext?.user?.role || 'moderator';
  const correlationId = adminContext?.correlationId || getCorrelationId(request);
  const clientIp = adminContext?.ip || '127.0.0.1';

  try {
    const updatedReport = await supabaseRpc('admin_update_report_atomic', {
      p_actor_id: actorId,
      p_actor_email: actorEmail,
      p_actor_role: actorRole,
      p_report_id: id.trim(),
      p_status: body.status !== undefined ? String(body.status).trim().toLowerCase() : null,
      p_admin_notes: body.admin_notes !== undefined ? (typeof body.admin_notes === 'string' ? body.admin_notes.trim() : String(body.admin_notes || '')) : null,
      p_ip: clientIp,
      p_correlation_id: correlationId
    });

    sendJson(response, 200, {
      success: true,
      report: updatedReport
    });
  } catch (error) {
    const msg = error.message || '';
    if (msg.includes('NOT_FOUND')) {
      sendError(response, 404, 'NOT_FOUND', 'Không tìm thấy báo cáo yêu cầu.');
      return;
    }
    if (msg.includes('INVALID_STATUS_TRANSITION')) {
      sendError(response, 400, 'INVALID_STATUS_TRANSITION', msg);
      return;
    }
    if (msg.includes('INVALID_STATUS') || msg.includes('INVALID_INPUT')) {
      sendError(response, 400, 'INVALID_INPUT', msg);
      return;
    }
    if (msg.includes('FORBIDDEN')) {
      sendError(response, 403, 'FORBIDDEN', msg);
      return;
    }
    if (msg.includes('AUDIT_LOG_FAILED') || msg.includes('audit')) {
      sendError(response, 500, 'AUDIT_LOG_FAILED', 'Ghi nhật ký kiểm toán thất bại. Thao tác đã tự động rollback.');
      return;
    }
    console.error('[AdminReports] Lỗi cập nhật báo cáo:', error);
    sendError(response, 500, 'INTERNAL_ERROR', 'Đã xảy ra lỗi khi cập nhật báo cáo.');
  }
}

export default async function handler(request, response) {
  if (request.method === 'OPTIONS') {
    response.statusCode = 204;
    response.setHeader('Allow', 'GET, PATCH, OPTIONS');
    response.end();
    return;
  }

  const adminContext = await authenticateAdmin(request, response);
  if (!adminContext) return;

  try {
    if (request.method === 'GET') {
      // Cho phép Admin, Editor, Moderator xem báo cáo
      await listReports(request, response, adminContext);
      return;
    }

    if (request.method === 'PATCH') {
      // Chỉ Admin và Moderator mới có quyền xử lý báo cáo. Editor bị chặn 403.
      if (!requireRole(adminContext, ['admin', 'moderator'], response)) return;
      await updateReport(request, response, adminContext);
      return;
    }

    sendError(response, 405, 'METHOD_NOT_ALLOWED', 'Phương thức không được hỗ trợ.');
  } catch (error) {
    console.error('[AdminReports] Lỗi xử lý request:', error);
    sendError(response, 500, 'INTERNAL_ERROR', 'Đã xảy ra lỗi khi xử lý báo cáo quản trị.');
  }
}
