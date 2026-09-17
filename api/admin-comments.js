// api/admin-comments.js
// Endpoint quản trị bình luận (comments) - G8.2

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

const TABLE_NAME = 'place_comments';
const MAX_PAYLOAD_SIZE = 1024 * 1024; // 1MB

async function listComments(request, response) {
  const { page, limit, offset, searchParams } = parsePagination(request.url, 100, 200);
  const hidden = searchParams.get('hidden');
  const status = searchParams.get('status');
  const placeId = searchParams.get('place_id');

  const filters = [];
  if (hidden === 'true' || hidden === 'false') {
    filters.push(`is_hidden=eq.${hidden}`);
  }
  if (status && ['approved', 'pending', 'hidden', 'rejected'].includes(status)) {
    filters.push(`status=eq.${encodeURIComponent(status)}`);
  }
  if (placeId) {
    filters.push(`place_id=eq.${encodeURIComponent(placeId)}`);
  }

  const query = `${TABLE_NAME}?select=id,place_id,place_name,author_name,rating,comment_text,photo_url,photo_metadata,client_review_id,is_hidden,status,created_at${filters.length ? `&${filters.join('&')}` : ''}&order=created_at.desc,id.desc&limit=${limit}&offset=${offset}`;

  const result = await supabaseRequest(query, { count: true });
  const comments = Array.isArray(result) ? result : (result.data || []);
  const total = typeof result.total === 'number' ? result.total : comments.length;
  const totalPages = Math.ceil(total / limit) || 1;

  sendJson(response, 200, {
    success: true,
    comments: comments || [],
    pagination: {
      page,
      limit,
      total,
      total_pages: totalPages
    }
  });
}

async function updateComment(request, response, adminContext) {
  let body;
  try {
    body = await readBody(request, MAX_PAYLOAD_SIZE);
  } catch (err) {
    if (err.message === 'PAYLOAD_TOO_LARGE') {
      sendError(response, 413, 'PAYLOAD_TOO_LARGE', 'Payload exceeds maximum limit of 1MB.');
      return;
    }
    sendError(response, 400, 'INVALID_JSON', 'Invalid JSON body.');
    return;
  }

  const id = Number.parseInt(body.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    sendError(response, 400, 'INVALID_INPUT', 'Invalid comment id.');
    return;
  }

  // Chống Mass Assignment: Chỉ cho phép cập nhật is_hidden và status
  const patch = {};
  if (typeof body.is_hidden === 'boolean') {
    patch.is_hidden = body.is_hidden;
  }
  if (body.status && ['approved', 'pending', 'hidden', 'rejected'].includes(body.status)) {
    patch.status = body.status;
  }

  if (Object.keys(patch).length === 0) {
    sendError(response, 400, 'INVALID_INPUT', 'No valid fields to update (is_hidden or status required).');
    return;
  }

  const actorId = getSafeActorId(adminContext);
  const actorEmail = adminContext?.user?.email || null;
  const actorRole = adminContext?.user?.role || 'moderator';
  const correlationId = adminContext?.correlationId || getCorrelationId(request);
  const clientIp = adminContext?.ip || '127.0.0.1';

  try {
    const updatedComment = await supabaseRpc('admin_update_comment_atomic', {
      p_actor_id: actorId,
      p_actor_email: actorEmail,
      p_actor_role: actorRole,
      p_comment_id: id,
      p_patch: patch,
      p_ip: clientIp,
      p_correlation_id: correlationId
    });

    sendJson(response, 200, { success: true, comment: updatedComment });
  } catch (error) {
    const msg = error.message || '';
    if (msg.includes('NOT_FOUND')) {
      sendError(response, 404, 'NOT_FOUND', `Không tìm thấy bình luận với ID ${id}.`);
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
    console.error('[AdminComments] Lỗi cập nhật bình luận:', error);
    sendError(response, 500, 'INTERNAL_ERROR', 'Đã xảy ra lỗi khi cập nhật bình luận.');
  }
}

async function deleteComment(request, response, adminContext) {
  const url = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
  const id = Number.parseInt(url.searchParams.get('id'), 10);

  if (!Number.isInteger(id) || id <= 0) {
    sendError(response, 400, 'INVALID_INPUT', 'Invalid comment id.');
    return;
  }

  const actorId = getSafeActorId(adminContext);
  const actorEmail = adminContext?.user?.email || null;
  const actorRole = adminContext?.user?.role || 'admin';
  const correlationId = adminContext?.correlationId || getCorrelationId(request);
  const clientIp = adminContext?.ip || '127.0.0.1';

  try {
    await supabaseRpc('admin_delete_comment_atomic', {
      p_actor_id: actorId,
      p_actor_email: actorEmail,
      p_actor_role: actorRole,
      p_comment_id: id,
      p_ip: clientIp,
      p_correlation_id: correlationId
    });

    sendJson(response, 200, { success: true, ok: true, deleted: true });
  } catch (error) {
    const msg = error.message || '';
    if (msg.includes('NOT_FOUND')) {
      sendError(response, 404, 'NOT_FOUND', `Không tìm thấy bình luận với ID ${id}.`);
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
    console.error('[AdminComments] Lỗi xóa bình luận:', error);
    sendError(response, 500, 'INTERNAL_ERROR', 'Đã xảy ra lỗi khi xóa bình luận.');
  }
}

export default async function handler(request, response) {
  const adminContext = await authenticateAdmin(request, response);
  if (!adminContext) return;

  try {
    if (request.method === 'GET') {
      // Cho phép admin, editor, moderator xem danh sách bình luận
      await listComments(request, response);
      return;
    }

    if (request.method === 'PATCH') {
      // Cho phép admin và moderator duyệt/ẩn bình luận. Editor không kiểm duyệt bình luận.
      if (!requireRole(adminContext, ['admin', 'moderator'], response)) return;
      await updateComment(request, response, adminContext);
      return;
    }

    if (request.method === 'DELETE') {
      // Chỉ admin mới có quyền xóa cứng bình luận.
      if (!requireRole(adminContext, ['admin'], response)) return;
      await deleteComment(request, response, adminContext);
      return;
    }

    sendError(response, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
  } catch (error) {
    if (error.message === 'PAYLOAD_TOO_LARGE') {
      sendError(response, 413, 'PAYLOAD_TOO_LARGE', 'Payload exceeds maximum limit of 1MB.');
      return;
    }
    console.error('[AdminComments] Lỗi xử lý:', error);
    sendError(response, 500, 'INTERNAL_ERROR', 'An error occurred while processing the admin request.');
  }
}
