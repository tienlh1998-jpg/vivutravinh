const TABLE_NAME = 'places';
const MAX_PAYLOAD_SIZE = 2 * 1024 * 1024; // 2MB

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, code, message) {
  sendJson(response, statusCode, {
    success: false,
    error: { code, message }
  });
}

function requireImportSecret(request, response) {
  const configuredSecret = process.env.IMPORT_SECRET;
  const providedSecret = request.headers['x-import-secret'];

  if (!configuredSecret) {
    sendError(response, 500, 'CONFIG_ERROR', 'IMPORT_SECRET is not configured on server.');
    return false;
  }

  if (!providedSecret || providedSecret !== configuredSecret) {
    sendError(response, 401, 'UNAUTHORIZED', 'Unauthorized: Invalid or missing x-import-secret.');
    return false;
  }

  return true;
}

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase import environment variables are not configured.');
  }

  return {
    baseUrl: supabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
    serviceRoleKey,
  };
}

async function readBody(request, limit = MAX_PAYLOAD_SIZE) {
  if (typeof request.body === 'string') {
    if (Buffer.byteLength(request.body) > limit) {
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

function normalizeKey(key) {
  return normalizeText(key)
    .toLowerCase()
    .replace(/[📍🗺️🏘️⭐✍️📸🎯💰⏰📞📝]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pick(input, names) {
  for (const name of names) {
    const wantedKey = normalizeKey(name);
    const actualKey = Object.keys(input).find(key => normalizeKey(key) === wantedKey);
    if (actualKey && input[actualKey] !== undefined) {
      return normalizeText(input[actualKey]);
    }
  }

  return '';
}

function createSlug(text) {
  return normalizeText(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `dia-diem-${Date.now()}`;
}

function parseImages(rawImages) {
  return normalizeText(rawImages)
    .split(/[\n,]+/)
    .map(normalizeText)
    .filter(Boolean);
}

function parseRating(value) {
  const rating = Number.parseFloat(value);
  if (!Number.isFinite(rating) || rating < 0 || rating > 5) return 0;
  return rating;
}

async function slugExists(slug) {
  const rows = await supabaseRequest(`${TABLE_NAME}?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`);
  return Array.isArray(rows) && rows.length > 0;
}

async function createUniqueSlug(preferredSlug, name) {
  const baseSlug = createSlug(preferredSlug || name);
  if (!(await slugExists(baseSlug))) return baseSlug;

  const timestampSlug = `${baseSlug}-${Date.now().toString(36)}`;
  if (!(await slugExists(timestampSlug))) return timestampSlug;

  return `${baseSlug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function mapPlacePayload(input) {
  const name = pick(input, ['Tên địa điểm', 'Tên Địa Điểm / Cơ Sở', 'name', 'Tên']);
  const category = pick(input, ['Phân loại', 'Loại Hình Địa Điểm', 'category', 'Loại']);

  if (!name) throw new Error('Thiếu tên địa điểm.');
  if (!category) throw new Error('Thiếu phân loại địa điểm.');

  const imageLink = pick(input, ['Link Hình Ảnh', 'Ảnh Đại Diện Chất Lượng Cao', 'image_link', 'Image']);
  const images = parseImages(imageLink);

  return {
    slug: await createUniqueSlug(pick(input, ['Slug', 'slug']), name),
    name,
    category,
    area: pick(input, ['Khu vực', 'Thuộc Huyện / Thị xã nào?', 'area', 'Location']),
    address: pick(input, ['Địa chỉ', 'Địa chỉ Chi Tiết (Số nhà, đường, khóm/ấp)', 'address']),
    map_link: pick(input, ['Link Google Maps', 'map_link', 'Map Link', 'Maps']),
    price_raw: pick(input, ['Mức Giá', 'Mức Giá Tham Khảo (Chi phí trung bình cho một người/lần ghé thăm)', 'price_raw', 'Giá']),
    description: pick(input, ['Mô Tả', 'Mô tả', 'Mô tả Ngắn Hấp Dẫn về Địa Điểm (Ít nhất 50 từ)', 'description']),
    note: pick(input, ['Ghi Chú Thêm', 'Ghi Chú Thêm (Tiện ích, lưu ý quan trọng, kinh nghiệm...)', 'note', 'Ghi chú']),
    contact: pick(input, ['Số Điện Thoại / Fanpage / Website', 'contact', 'Liên hệ']),
    coordinates: pick(input, ['Tọa Độ GPS (Latitude và Longitude)', 'coordinates', 'Tọa độ', 'GPS']),
    contributor: pick(input, ['Người Đóng Góp', 'contributor']) || 'Ẩn danh',
    rating: parseRating(pick(input, ['Chấm Điểm', 'Chấm Điểm?', 'rating', 'Đánh Giá'])),
    opening_time: pick(input, ['Giờ Mở Cửa', 'Giờ Mở Cửa / Giờ Hoạt Động (Nếu có)', 'opening_time', 'Opening Time']),
    closing_time: pick(input, ['Giờ Đóng Cửa', 'closing_time', 'Closing Time']),
    operating_status: pick(input, ['Trạng Thái Hoạt Động', 'operating_status', 'Operating Status']) || 'Normal',
    status: 'draft',
    images,
    image_link: images[0] || imageLink,
    sort_order: 0,
    is_featured: false,
  };
}

async function importPlace(request, response) {
  const body = await readBody(request);
  let place;
  try {
    place = await mapPlacePayload(body);
  } catch (err) {
    sendError(response, 400, 'VALIDATION_ERROR', err.message);
    return;
  }

  const rows = await supabaseRequest(TABLE_NAME, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(place),
  });

  sendJson(response, 201, { success: true, place: rows?.[0] || null });
}

export default async function handler(request, response) {
  if (!requireImportSecret(request, response)) return;

  try {
    if (request.method !== 'POST') {
      sendError(response, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
      return;
    }

    await importPlace(request, response);
  } catch (error) {
    if (error.message === 'PAYLOAD_TOO_LARGE') {
      sendError(response, 413, 'PAYLOAD_TOO_LARGE', 'Payload exceeds maximum limit of 2MB.');
      return;
    }
    sendError(response, 500, 'INTERNAL_ERROR', 'An error occurred while importing place.');
  }
}
