import {
  authenticateAdmin,
  requireRole,
  sendJson,
  sendError,
  getSupabaseConfig
} from './_admin-auth.js';

const TABLE_NAME = 'place_comments';
const MAX_PAYLOAD_SIZE = 1024 * 1024; // 1MB

async function readBody(request, limit = MAX_PAYLOAD_SIZE) {
  if (typeof request.body === 'string') {
    if (Buffer.byteLength(request.body, 'utf8') > limit) {
      throw new Error('PAYLOAD_TOO_LARGE');
    }
    return request.body ? JSON.parse(request.body) : {};
  }

  if (Buffer.isBuffer(request.body)) {
    if (request.body.length > limit) {
      throw new Error('PAYLOAD_TOO_LARGE');
    }
    return request.body.length ? JSON.parse(request.body.toString('utf8')) : {};
  }

  if (request.body && typeof request.body === 'object' && typeof request.body[Symbol.asyncIterator] !== 'function') {
    const rawLen = Buffer.byteLength(JSON.stringify(request.body), 'utf8');
    if (rawLen > limit) {
      throw new Error('PAYLOAD_TOO_LARGE');
    }
    return request.body;
  }

  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      throw new Error('PAYLOAD_TOO_LARGE');
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function supabaseRequest(path, options = {}) {
  const { baseUrl, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Supabase request failed: ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function listComments(request, response) {
  const url = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
  const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '100', 10), 200);
  const hidden = url.searchParams.get('hidden');
  const hiddenFilter = hidden === 'true' || hidden === 'false' ? `&is_hidden=eq.${hidden}` : '';
  const query = `${TABLE_NAME}?select=id,place_id,place_name,author_name,rating,comment_text,photo_url,photo_metadata,client_review_id,is_hidden,status,created_at${hiddenFilter}&order=created_at.desc&limit=${limit}`;
  const comments = await supabaseRequest(query);
  sendJson(response, 200, { success: true, comments: comments || [] });
}

async function updateComment(request, response) {
  const body = await readBody(request);
  const id = Number.parseInt(body.id, 10);

  if (!Number.isInteger(id) || id <= 0) {
    sendError(response, 400, 'INVALID_INPUT', 'Invalid comment id.');
    return;
  }

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

  const rows = await supabaseRequest(`${TABLE_NAME}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });

  sendJson(response, 200, { success: true, comment: rows?.[0] || null });
}

async function deleteComment(request, response) {
  const url = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
  const id = Number.parseInt(url.searchParams.get('id'), 10);

  if (!Number.isInteger(id) || id <= 0) {
    sendError(response, 400, 'INVALID_INPUT', 'Invalid comment id.');
    return;
  }

  await supabaseRequest(`${TABLE_NAME}?id=eq.${id}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });

  sendJson(response, 200, { success: true, ok: true });
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
      await updateComment(request, response);
      return;
    }

    if (request.method === 'DELETE') {
      // Chỉ admin mới có quyền xóa cứng bình luận.
      if (!requireRole(adminContext, ['admin'], response)) return;
      await deleteComment(request, response);
      return;
    }

    sendError(response, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
  } catch (error) {
    if (error.message === 'PAYLOAD_TOO_LARGE') {
      sendError(response, 413, 'PAYLOAD_TOO_LARGE', 'Payload exceeds maximum limit of 1MB.');
      return;
    }
    sendError(response, 500, 'INTERNAL_ERROR', 'An error occurred while processing the admin request.');
  }
}
