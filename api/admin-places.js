// api/admin-places.js
// Endpoint quản trị địa điểm (places) - G8.2

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
import { validatePlace, validatePatchForApprovedLegacy } from '../js/place-validator.js';

function sanitizeValidationIssues(issues = []) {
  return issues.map(i => ({
    code: String(i.code || ''),
    field: String(i.field || ''),
    message: String(i.message || '')
  }));
}

const TABLE_NAME = 'places';
const VALID_STATUSES = new Set(['approved', 'draft', 'hidden', 'archived']);
const MAX_PAYLOAD_SIZE = 2 * 1024 * 1024; // 2MB
const PATCH_FIELDS = new Set([
  'name',
  'slug',
  'category',
  'area',
  'address',
  'map_link',
  'price_raw',
  'description',
  'note',
  'contact',
  'coordinates',
  'contributor',
  'rating',
  'opening_time',
  'closing_time',
  'display_hours',
  'operating_status',
  'status',
  'images',
  'image_link',
  'sort_order',
  'is_featured',
  'expected_updated_at',
]);

function normalizeText(value) {
  return String(value || '').trim();
}

function sanitizeStatus(value) {
  const status = normalizeText(value || 'draft');
  if (!VALID_STATUSES.has(status)) {
    throw new Error('Invalid place status.');
  }
  return status;
}

function sanitizePatch(body) {
  const patch = {};

  for (const [field, value] of Object.entries(body)) {
    if (!PATCH_FIELDS.has(field)) continue;

    if (field === 'status') {
      patch.status = sanitizeStatus(value);
      continue;
    }

    if (field === 'rating') {
      const rating = Number.parseFloat(value);
      if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
        throw new Error('rating must be a number from 0 to 5.');
      }
      patch.rating = rating;
      continue;
    }

    if (field === 'sort_order') {
      const sortOrder = Number.parseInt(value, 10);
      if (!Number.isInteger(sortOrder)) {
        throw new Error('sort_order must be an integer.');
      }
      patch.sort_order = sortOrder;
      continue;
    }

    if (field === 'images') {
      if (!Array.isArray(value)) {
        throw new Error('images must be an array.');
      }
      patch.images = value.map(normalizeText).filter(Boolean);
      continue;
    }

    if (field === 'is_featured') {
      patch.is_featured = Boolean(value);
      continue;
    }

    patch[field] = typeof value === 'string' ? normalizeText(value) : value;
  }

  if ('name' in patch && !patch.name) throw new Error('name is required.');
  if ('slug' in patch && !patch.slug) throw new Error('slug is required.');
  if ('category' in patch && !patch.category) throw new Error('category is required.');

  return patch;
}

function encodeLike(value) {
  return encodeURIComponent(`*${value.replace(/[*,]/g, ' ')}*`);
}

async function listPlaces(request, response) {
  const { page, limit, offset, searchParams } = parsePagination(request.url, 100, 200);
  const status = searchParams.get('status') || 'all';
  const category = normalizeText(searchParams.get('category'));
  const q = normalizeText(searchParams.get('q') || searchParams.get('search'));

  if (status !== 'all' && !VALID_STATUSES.has(status)) {
    sendError(response, 400, 'INVALID_INPUT', 'Invalid status filter.');
    return;
  }

  const filters = [];
  if (status !== 'all') filters.push(`status=eq.${encodeURIComponent(status)}`);
  if (category) filters.push(`category=eq.${encodeURIComponent(category)}`);
  if (q) filters.push(`or=(name.ilike.${encodeLike(q)},slug.ilike.${encodeLike(q)},address.ilike.${encodeLike(q)})`);

  const query = `${TABLE_NAME}?select=id,slug,name,category,area,address,map_link,price_raw,description,note,contact,coordinates,contributor,rating,opening_time,closing_time,display_hours,operating_status,status,images,image_link,sort_order,is_featured,client_submission_id,created_at,updated_at${filters.length ? `&${filters.join('&')}` : ''}&order=sort_order.asc,updated_at.desc&limit=${limit}&offset=${offset}`;

  const result = await supabaseRequest(query, { count: true });
  const places = Array.isArray(result) ? result : (result.data || []);
  const total = typeof result.total === 'number' ? result.total : places.length;
  const totalPages = Math.ceil(total / limit) || 1;

  sendJson(response, 200, {
    success: true,
    places: places || [],
    pagination: {
      page,
      limit,
      total,
      total_pages: totalPages
    }
  });
}

async function updatePlace(request, response, adminContext) {
  let body;
  try {
    body = await readBody(request, MAX_PAYLOAD_SIZE);
  } catch (err) {
    if (err.message === 'PAYLOAD_TOO_LARGE') {
      sendError(response, 413, 'PAYLOAD_TOO_LARGE', 'Payload exceeds maximum limit of 2MB.');
      return;
    }
    sendError(response, 400, 'INVALID_JSON', 'Invalid JSON body.');
    return;
  }

  const id = Number.parseInt(body.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    sendError(response, 400, 'INVALID_INPUT', 'Invalid place id.');
    return;
  }

  let patch;
  try {
    patch = sanitizePatch(body);
  } catch (err) {
    sendError(response, 400, 'VALIDATION_ERROR', err.message);
    return;
  }

  delete patch.id;

  if (Object.keys(patch).length === 0) {
    sendError(response, 400, 'INVALID_INPUT', 'No valid fields to update.');
    return;
  }

  // Đọc bản ghi hiện tại để kiểm tra tính toàn vẹn chất lượng dữ liệu
  let existingPlace = null;
  try {
    const existingRows = await supabaseRequest(`${TABLE_NAME}?id=eq.${id}&select=*&limit=1`);
    existingPlace = Array.isArray(existingRows) && existingRows.length > 0 ? existingRows[0] : null;
  } catch (err) {
    console.error('[AdminPlaces] Lỗi truy vấn địa điểm:', err);
    sendError(response, 500, 'INTERNAL_ERROR', 'Đã xảy ra lỗi khi kiểm tra địa điểm.');
    return;
  }

  if (!existingPlace) {
    sendError(response, 404, 'NOT_FOUND', `Không tìm thấy địa điểm với ID ${id}.`);
    return;
  }

  const isRollback = body.is_rollback === true;

  // Khóa lạc quan bắt buộc (Optimistic Concurrency Control - G9.3C Hotfix)
  // Mọi PATCH thông thường bắt buộc phải gửi expected_updated_at. Chỉ luồng rollback được miễn trừ.
  if (!isRollback) {
    const rawExpected = body.expected_updated_at !== undefined ? body.expected_updated_at : patch.expected_updated_at;
    if (!rawExpected || typeof rawExpected !== 'string' || !rawExpected.trim()) {
      sendError(
        response,
        428,
        'EXPECTED_UPDATED_AT_REQUIRED',
        'Thiếu trường expected_updated_at bắt buộc để kiểm soát khóa lạc quan (Optimistic Concurrency Control).'
      );
      return;
    }
  }

  // Khóa lạc quan (Optimistic Concurrency Control - G9.3C)
  const expectedUpdatedAt = (body.expected_updated_at || patch.expected_updated_at || '').trim();
  if (expectedUpdatedAt) {
    const existingTime = existingPlace.updated_at ? new Date(existingPlace.updated_at).getTime() : 0;
    const expectedTime = new Date(expectedUpdatedAt).getTime();
    if (isNaN(expectedTime) || existingTime !== expectedTime) {
      sendError(
        response,
        409,
        'CONFLICT',
        `Xung đột cập nhật đồng thời: Bản ghi đã bị sửa đổi sau snapshot (expected_updated_at: "${expectedUpdatedAt}", current: "${existingPlace.updated_at}"). Không thực hiện mutation.`
      );
      return;
    }
    patch.expected_updated_at = expectedUpdatedAt;
  }

  const currentStatus = existingPlace.status || 'draft';
  const targetStatus = patch.status !== undefined ? patch.status : currentStatus;
  const isTransitionToApproved = targetStatus === 'approved' && currentStatus !== 'approved';
  const isAlreadyApproved = currentStatus === 'approved' && targetStatus === 'approved';

  if (isRollback) {
    if (adminContext?.user?.role !== 'admin') {
      sendError(response, 403, 'FORBIDDEN', 'Chỉ tài khoản Admin mới có quyền thực hiện khôi phục (rollback) trạng thái địa điểm.');
      return;
    }

    const allowedRollbackKeys = new Set(['id', 'status', 'is_rollback']);
    const extraKeys = Object.keys(body).filter(k => !allowedRollbackKeys.has(k));
    if (extraKeys.length > 0) {
      sendError(response, 400, 'INVALID_INPUT', `Khi thực hiện rollback, chỉ được phép gửi các trường: id, status, is_rollback (phát hiện trường thừa: ${extraKeys.join(', ')}).`);
      return;
    }

    if (currentStatus !== 'archived') {
      sendError(response, 400, 'INVALID_ROLLBACK_STATE', `Chỉ được phép thực hiện rollback đối với địa điểm đang ở trạng thái "archived" (trạng thái hiện tại: "${currentStatus}").`);
      return;
    }

    if (targetStatus !== 'approved' && targetStatus !== 'draft') {
      sendError(response, 400, 'INVALID_INPUT', `Trạng thái rollback không hợp lệ: "${targetStatus}". Chỉ cho phép khôi phục về "approved" hoặc "draft".`);
      return;
    }
  }

  let validation;
  if (isRollback) {
    // Khi rollback, chỉ role admin được phép khôi phục trạng thái trước đó của địa điểm.
    // Vẫn kiểm tra an toàn URL và cấu trúc nhưng không chặn vì các trường thiếu của bản ghi legacy.
    validation = validatePatchForApprovedLegacy({ ...existingPlace, ...patch });
  } else if (isTransitionToApproved) {
    const mergedPlace = { ...existingPlace, ...patch };
    validation = validatePlace(mergedPlace, { mode: 'approval' });
  } else if (isAlreadyApproved) {
    validation = validatePatchForApprovedLegacy(patch);
  } else {
    const mergedPlace = { ...existingPlace, ...patch };
    validation = validatePlace(mergedPlace, { mode: 'draft' });
  }

  if (!validation.valid) {
    sendJson(response, 422, {
      success: false,
      error: {
        code: 'DATA_QUALITY_FAILED',
        message: isTransitionToApproved
          ? 'Địa điểm không đạt tiêu chuẩn chất lượng dữ liệu để phê duyệt.'
          : 'Dữ liệu địa điểm chứa trường không an toàn hoặc không hợp lệ.',
        errors: sanitizeValidationIssues(validation.errors),
        warnings: sanitizeValidationIssues(validation.warnings)
      }
    });
    return;
  }

  const actorId = getSafeActorId(adminContext);
  const actorEmail = adminContext?.user?.email || null;
  const actorRole = adminContext?.user?.role || 'editor';
  const correlationId = adminContext?.correlationId || getCorrelationId(request);
  const clientIp = adminContext?.ip || '127.0.0.1';

  try {
    const updatedPlace = await supabaseRpc('admin_update_place_atomic', {
      p_actor_id: actorId,
      p_actor_email: actorEmail,
      p_actor_role: actorRole,
      p_place_id: id,
      p_patch: patch,
      p_ip: clientIp,
      p_correlation_id: correlationId
    });

    sendJson(response, 200, { success: true, place: updatedPlace });
  } catch (error) {
    const msg = error.message || '';
    if (msg.includes('NOT_FOUND')) {
      sendError(response, 404, 'NOT_FOUND', `Không tìm thấy địa điểm với ID ${id}.`);
      return;
    }
    if (msg.includes('CONFLICT') || msg.includes('40001')) {
      sendError(response, 409, 'CONFLICT', msg);
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
    console.error('[AdminPlaces] Lỗi cập nhật địa điểm:', error);
    sendError(response, 500, 'INTERNAL_ERROR', 'Đã xảy ra lỗi khi cập nhật địa điểm.');
  }
}

async function deletePlace(request, response, adminContext) {
  const url = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
  const id = Number.parseInt(url.searchParams.get('id'), 10);
  const permanent = url.searchParams.get('permanent') === 'true';

  if (!Number.isInteger(id) || id <= 0) {
    sendError(response, 400, 'INVALID_INPUT', 'Invalid place id.');
    return;
  }

  const actorId = getSafeActorId(adminContext);
  const actorEmail = adminContext?.user?.email || null;
  const actorRole = adminContext?.user?.role || 'admin';
  const correlationId = adminContext?.correlationId || getCorrelationId(request);
  const clientIp = adminContext?.ip || '127.0.0.1';

  try {
    const result = await supabaseRpc('admin_delete_place_atomic', {
      p_actor_id: actorId,
      p_actor_email: actorEmail,
      p_actor_role: actorRole,
      p_place_id: id,
      p_permanent: permanent,
      p_ip: clientIp,
      p_correlation_id: correlationId
    });

    if (permanent) {
      sendJson(response, 200, { success: true, ok: true, deleted: true, permanent: true });
    } else {
      sendJson(response, 200, { success: true, ok: true, archived: true, place: result?.place || result });
    }
  } catch (error) {
    const msg = error.message || '';
    if (msg.includes('NOT_FOUND')) {
      sendError(response, 404, 'NOT_FOUND', `Không tìm thấy địa điểm với ID ${id}.`);
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
    console.error('[AdminPlaces] Lỗi xóa/lưu trữ địa điểm:', error);
    sendError(response, 500, 'INTERNAL_ERROR', 'Đã xảy ra lỗi khi xóa địa điểm.');
  }
}

function createSlug(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `dia-diem-${Date.now()}`;
}

async function slugExists(slug) {
  const rows = await supabaseRequest(`${TABLE_NAME}?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`);
  return Array.isArray(rows) && rows.length > 0;
}

async function ensureUniqueSlug(preferredSlug, name) {
  const baseSlug = createSlug(preferredSlug || name);
  if (!(await slugExists(baseSlug))) return baseSlug;

  return `${baseSlug}-${Date.now().toString(36)}`;
}

async function createPlace(request, response, adminContext) {
  let body;
  try {
    body = await readBody(request, MAX_PAYLOAD_SIZE);
  } catch (err) {
    if (err.message === 'PAYLOAD_TOO_LARGE') {
      sendError(response, 413, 'PAYLOAD_TOO_LARGE', 'Payload exceeds maximum limit of 2MB.');
      return;
    }
    sendError(response, 400, 'INVALID_JSON', 'Invalid JSON body.');
    return;
  }

  let patch;
  try {
    patch = sanitizePatch(body);
  } catch (err) {
    sendError(response, 400, 'VALIDATION_ERROR', err.message);
    return;
  }

  if (!patch.name) {
    sendError(response, 400, 'INVALID_INPUT', 'name is required.');
    return;
  }

  if (!patch.category) {
    sendError(response, 400, 'INVALID_INPUT', 'category is required.');
    return;
  }

  if (patch.slug) {
    if (await slugExists(patch.slug)) {
      patch.slug = `${patch.slug}-${Date.now().toString(36)}`;
    }
  } else {
    patch.slug = await ensureUniqueSlug(null, patch.name);
  }
  patch.status = patch.status || 'draft';
  patch.operating_status = patch.operating_status || 'Normal';
  patch.contributor = patch.contributor || 'Admin';

  const validationMode = patch.status === 'approved' ? 'approval' : 'draft';
  const validation = validatePlace(patch, { mode: validationMode });

  if (!validation.valid) {
    sendJson(response, 422, {
      success: false,
      error: {
        code: 'DATA_QUALITY_FAILED',
        message: validationMode === 'approval'
          ? 'Địa điểm không đạt tiêu chuẩn chất lượng dữ liệu để phê duyệt.'
          : 'Dữ liệu địa điểm chứa trường không an toàn hoặc không hợp lệ.',
        errors: sanitizeValidationIssues(validation.errors),
        warnings: sanitizeValidationIssues(validation.warnings)
      }
    });
    return;
  }

  const actorId = getSafeActorId(adminContext);
  const actorEmail = adminContext?.user?.email || null;
  const actorRole = adminContext?.user?.role || 'editor';
  const correlationId = adminContext?.correlationId || getCorrelationId(request);
  const clientIp = adminContext?.ip || '127.0.0.1';

  try {
    const createdPlace = await supabaseRpc('admin_create_place_atomic', {
      p_actor_id: actorId,
      p_actor_email: actorEmail,
      p_actor_role: actorRole,
      p_place_data: patch,
      p_ip: clientIp,
      p_correlation_id: correlationId
    });

    sendJson(response, 201, { success: true, place: createdPlace });
  } catch (error) {
    const msg = error.message || '';
    if (msg.includes('FORBIDDEN')) {
      sendError(response, 403, 'FORBIDDEN', msg);
      return;
    }
    if (msg.includes('INVALID_INPUT')) {
      sendError(response, 400, 'INVALID_INPUT', msg);
      return;
    }
    if (msg.includes('AUDIT_LOG_FAILED') || msg.includes('audit')) {
      sendError(response, 500, 'AUDIT_LOG_FAILED', 'Ghi nhật ký kiểm toán thất bại. Thao tác đã tự động rollback.');
      return;
    }
    console.error('[AdminPlaces] Lỗi tạo địa điểm:', error);
    sendError(response, 500, 'INTERNAL_ERROR', 'Đã xảy ra lỗi khi tạo địa điểm.');
  }
}

export default async function handler(request, response) {
  const adminContext = await authenticateAdmin(request, response);
  if (!adminContext) return;

  try {
    if (request.method === 'GET') {
      // Cho phép tất cả các vai trò quản trị (admin, editor, moderator) xem danh sách địa điểm
      await listPlaces(request, response);
      return;
    }

    if (request.method === 'POST') {
      // Chỉ admin và editor mới được tạo địa điểm. Moderator bị chặn 403.
      if (!requireRole(adminContext, ['admin', 'editor'], response)) return;
      await createPlace(request, response, adminContext);
      return;
    }

    if (request.method === 'PATCH') {
      // Chỉ admin và editor mới được sửa địa điểm. Moderator bị chặn 403.
      if (!requireRole(adminContext, ['admin', 'editor'], response)) return;
      await updatePlace(request, response, adminContext);
      return;
    }

    if (request.method === 'DELETE') {
      // Chỉ admin mới có quyền xóa/lưu trữ địa điểm. Editor và Moderator bị chặn 403.
      if (!requireRole(adminContext, ['admin'], response)) return;
      await deletePlace(request, response, adminContext);
      return;
    }

    sendError(response, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
  } catch (error) {
    if (error.message === 'PAYLOAD_TOO_LARGE') {
      sendError(response, 413, 'PAYLOAD_TOO_LARGE', 'Payload exceeds maximum limit of 2MB.');
      return;
    }
    console.error('[AdminPlaces] Lỗi xử lý:', error);
    sendError(response, 500, 'INTERNAL_ERROR', 'An error occurred while processing the admin request.');
  }
}
