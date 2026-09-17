import {
  authenticateAdmin,
  requireRole,
  sendJson,
  sendError,
  getSupabaseConfig
} from './_admin-auth.js';

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
]);

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
  const url = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
  const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '100', 10), 200);
  const status = url.searchParams.get('status') || 'all';
  const category = normalizeText(url.searchParams.get('category'));
  const q = normalizeText(url.searchParams.get('q'));

  if (status !== 'all' && !VALID_STATUSES.has(status)) {
    sendError(response, 400, 'INVALID_INPUT', 'Invalid status filter.');
    return;
  }

  const filters = [];
  if (status !== 'all') filters.push(`status=eq.${encodeURIComponent(status)}`);
  if (category) filters.push(`category=eq.${encodeURIComponent(category)}`);
  if (q) filters.push(`or=(name.ilike.${encodeLike(q)},slug.ilike.${encodeLike(q)},address.ilike.${encodeLike(q)})`);

  const query = `${TABLE_NAME}?select=id,slug,name,category,area,address,map_link,price_raw,description,note,contact,coordinates,contributor,rating,opening_time,closing_time,display_hours,operating_status,status,images,image_link,sort_order,is_featured,client_submission_id,created_at,updated_at${filters.length ? `&${filters.join('&')}` : ''}&order=sort_order.asc,updated_at.desc&limit=${limit}`;
  const places = await supabaseRequest(query);
  sendJson(response, 200, { success: true, places: places || [] });
}

async function updatePlace(request, response) {
  const body = await readBody(request);
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

  const rows = await supabaseRequest(`${TABLE_NAME}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });

  sendJson(response, 200, { success: true, place: rows?.[0] || null });
}

async function deletePlace(request, response) {
  const url = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
  const id = Number.parseInt(url.searchParams.get('id'), 10);

  if (!Number.isInteger(id) || id <= 0) {
    sendError(response, 400, 'INVALID_INPUT', 'Invalid place id.');
    return;
  }

  await supabaseRequest(`${TABLE_NAME}?id=eq.${id}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });

  sendJson(response, 200, { success: true, ok: true });
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

async function createPlace(request, response) {
  const body = await readBody(request);
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

  patch.slug = await ensureUniqueSlug(patch.slug, patch.name);
  patch.status = patch.status || 'draft';
  patch.operating_status = patch.operating_status || 'Normal';
  patch.contributor = patch.contributor || 'Admin';

  const rows = await supabaseRequest(TABLE_NAME, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });

  sendJson(response, 201, { success: true, place: rows?.[0] || null });
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
      // Chỉ admin và editor được phép tạo địa điểm mới. Moderator bị chặn.
      if (!requireRole(adminContext, ['admin', 'editor'], response)) return;
      await createPlace(request, response);
      return;
    }

    if (request.method === 'PATCH') {
      // Chỉ admin và editor được phép chỉnh sửa / duyệt địa điểm. Moderator bị chặn.
      if (!requireRole(adminContext, ['admin', 'editor'], response)) return;
      await updatePlace(request, response);
      return;
    }

    if (request.method === 'DELETE') {
      // Chỉ admin mới có quyền xóa địa điểm. Editor và Moderator bị chặn.
      if (!requireRole(adminContext, ['admin'], response)) return;
      await deletePlace(request, response);
      return;
    }

    sendError(response, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
  } catch (error) {
    if (error.message === 'PAYLOAD_TOO_LARGE') {
      sendError(response, 413, 'PAYLOAD_TOO_LARGE', 'Payload exceeds maximum limit of 2MB.');
      return;
    }
    sendError(response, 500, 'INTERNAL_ERROR', 'An error occurred while processing the admin places request.');
  }
}
