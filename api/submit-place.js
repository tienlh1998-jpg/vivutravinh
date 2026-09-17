// api/submit-place.js
// Endpoint tiếp nhận địa điểm đóng góp mới từ cộng đồng
// - Luôn ép status: "draft"
// - Xác thực dữ liệu đầu vào chặt chẽ
// - Giới hạn kích thước payload (tối đa 128KB)
// - Rate-limiting phân tán qua RPC check_and_record_rate_limit
// - Đảm bảo tính Idempotency dựa trên client_submission_id

const TABLE_NAME = 'places';
const MAX_PAYLOAD_SIZE = 128 * 1024; // 128KB
const RATE_LIMIT_WINDOW_SECONDS = 60;
const MAX_REQUESTS_PER_WINDOW = 3;
const MIN_INTERVAL_SECONDS = 10;

const MAX_LOCAL_CACHE_ENTRIES = 500;
const localRateLimitMap = new Map();

function getClientIp(request) {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.socket?.remoteAddress || '127.0.0.1';
}

function checkLocalRateLimit(ip) {
  const now = Date.now();
  const record = localRateLimitMap.get(ip) || { timestamps: [] };

  record.timestamps = record.timestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW_SECONDS * 1000);

  if (record.timestamps.length > 0) {
    const lastTimestamp = record.timestamps[record.timestamps.length - 1];
    const timeSinceLast = now - lastTimestamp;
    if (timeSinceLast < MIN_INTERVAL_SECONDS * 1000) {
      const waitSeconds = Math.ceil((MIN_INTERVAL_SECONDS * 1000 - timeSinceLast) / 1000);
      return { allowed: false, wait_seconds: waitSeconds, code: 'COOLDOWN_ACTIVE' };
    }
  }

  if (record.timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldest = record.timestamps[0];
    const waitSeconds = Math.ceil((RATE_LIMIT_WINDOW_SECONDS * 1000 - (now - oldest)) / 1000);
    return { allowed: false, wait_seconds: waitSeconds, code: 'RATE_LIMIT_EXCEEDED' };
  }

  return { allowed: true };
}

function recordLocalSubmission(ip) {
  const now = Date.now();
  if (localRateLimitMap.size >= MAX_LOCAL_CACHE_ENTRIES) {
    const firstKey = localRateLimitMap.keys().next().value;
    if (firstKey) localRateLimitMap.delete(firstKey);
  }
  const record = localRateLimitMap.get(ip) || { timestamps: [] };
  record.timestamps.push(now);
  localRateLimitMap.set(ip, record);
}

function sendJson(response, statusCode, payload, headers = {}) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  for (const [key, value] of Object.entries(headers)) {
    response.setHeader(key, value);
  }
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, code, message, headers = {}) {
  sendJson(response, statusCode, {
    success: false,
    error: { code, message }
  }, headers);
}

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are not configured.');
  }

  return {
    baseUrl: supabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
    serviceRoleKey,
  };
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
    throw new Error(message || `Supabase error: ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function checkDistributedRateLimit(ip) {
  try {
    const rpcResult = await supabaseRequest('rpc/check_and_record_rate_limit', {
      method: 'POST',
      body: JSON.stringify({
        p_key: `submit_place_ip_${ip}`,
        p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
        p_max_requests: MAX_REQUESTS_PER_WINDOW,
        p_min_interval_seconds: MIN_INTERVAL_SECONDS
      })
    });

    if (rpcResult && typeof rpcResult.allowed === 'boolean') {
      return rpcResult;
    }
  } catch (err) {
    const isDevOrTest = process.env.NODE_ENV === 'test' ||
                        process.env.NODE_ENV === 'development' ||
                        process.env.ALLOW_LOCAL_RATE_LIMIT_FALLBACK === 'true';

    if (!isDevOrTest) {
      console.error('[RateLimit RPC Error]', err.message);
      const error = new Error('Dịch vụ kiểm tra giới hạn tần suất tạm thời không khả dụng. Vui lòng thử lại sau.');
      error.status = 503;
      error.code = 'RATE_LIMIT_UNAVAILABLE';
      throw error;
    }

    console.warn('[RateLimit RPC Fallback] Sử dụng local cache fallback (chế độ DEV/TEST):', err.message);
  }

  const localCheck = checkLocalRateLimit(ip);
  if (localCheck.allowed) {
    recordLocalSubmission(ip);
  }
  return localCheck;
}

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

function createSlug(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'dia-diem';
}

function validatePayload(body) {
  const name = String(body.name || '').trim();
  const category = String(body.category || '').trim();
  const area = String(body.area || '').trim();
  const address = String(body.address || '').trim();
  const description = String(body.description || '').trim();
  const clientSubmissionId = String(body.client_submission_id || '').trim();

  if (!name || name.length < 2 || name.length > 120) {
    throw { code: 'INVALID_NAME', message: 'Tên địa điểm phải từ 2 đến 120 ký tự.' };
  }
  if (!category || category.length < 2 || category.length > 80) {
    throw { code: 'INVALID_CATEGORY', message: 'Danh mục địa điểm không hợp lệ.' };
  }
  if (!area || area.length < 2 || area.length > 100) {
    throw { code: 'INVALID_AREA', message: 'Khu vực / huyện thị không hợp lệ.' };
  }
  if (!address || address.length < 3 || address.length > 255) {
    throw { code: 'INVALID_ADDRESS', message: 'Địa chỉ chi tiết phải từ 3 đến 255 ký tự.' };
  }
  if (!description || description.length < 5 || description.length > 2000) {
    throw { code: 'INVALID_DESCRIPTION', message: 'Mô tả địa điểm phải từ 5 đến 2000 ký tự.' };
  }
  if (!clientSubmissionId || clientSubmissionId.length < 5 || clientSubmissionId.length > 100) {
    throw { code: 'INVALID_CLIENT_SUBMISSION_ID', message: 'Thiếu mã định danh duy nhất (client_submission_id).' };
  }

  // Coordinates
  let coordinates = null;
  if (body.coordinates) {
    const rawCoords = String(body.coordinates).trim();
    if (rawCoords) {
      const parts = rawCoords.split(',').map(s => s.trim());
      if (parts.length === 2) {
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          coordinates = `${lat},${lng}`;
        }
      }
    }
  }

  // Images array: G6 tạm khóa chức năng tải ảnh đóng góp, API chỉ chấp nhận mảng rỗng []
  if (Array.isArray(body.images) && body.images.length > 0) {
    throw {
      code: 'IMAGES_DISABLED',
      message: 'Tính năng gửi ảnh đóng góp đang tạm khóa. Vui lòng để trống hình ảnh.'
    };
  }
  const images = [];

  const priceRaw = String(body.price_raw || 'Liên hệ').trim().slice(0, 80);
  const displayHours = String(body.display_hours || '07:00 - 18:00').trim().slice(0, 100);
  const contributor = String(body.contributor || 'Ẩn danh').trim().slice(0, 80);
  const contact = String(body.contact || '').trim().slice(0, 120);
  const mapLink = coordinates
    ? `https://www.google.com/maps?q=${coordinates}`
    : (body.map_link ? String(body.map_link).trim().slice(0, 500) : null);

  return {
    name,
    category,
    area,
    address,
    coordinates,
    map_link: mapLink,
    price_raw: priceRaw,
    display_hours: displayHours,
    description,
    contributor,
    contact,
    images,
    image_link: null,
    client_submission_id: clientSubmissionId
  };
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return sendError(response, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed. Use POST.');
  }

  // 1. Đọc body và kiểm tra giới hạn dung lượng trước
  let body;
  try {
    body = await readBody(request, MAX_PAYLOAD_SIZE);
  } catch (err) {
    if (err.message === 'PAYLOAD_TOO_LARGE') {
      return sendError(response, 413, 'PAYLOAD_TOO_LARGE', 'Nội dung yêu cầu vượt quá giới hạn 128KB.');
    }
    return sendError(response, 400, 'BAD_REQUEST', 'Định dạng JSON không hợp lệ.');
  }

  // 2. Validate dữ liệu đầu vào trước
  let validated;
  try {
    validated = validatePayload(body);
  } catch (valErr) {
    return sendError(response, 400, valErr.code || 'VALIDATION_ERROR', valErr.message || 'Dữ liệu không hợp lệ.');
  }

  // 3. Kiểm tra Idempotency trực tiếp bằng client_submission_id TRƯỚC rate-limit
  // Nếu đã tồn tại: trả về HTTP 200 idempotent ngay lập tức (KHÔNG kích hoạt rate limit và không bị cooldown)
  try {
    const existing = await supabaseRequest(
      `${TABLE_NAME}?client_submission_id=eq.${encodeURIComponent(validated.client_submission_id)}&select=id,name,slug,category,area,status,client_submission_id,created_at&limit=1`
    );

    if (Array.isArray(existing) && existing.length > 0) {
      return sendJson(response, 200, {
        success: true,
        idempotent: true,
        status: existing[0].status,
        data: existing[0],
        message: 'Địa điểm đóng góp này đã được tiếp nhận trước đó và đang chờ kiểm duyệt.'
      });
    }
  } catch (checkErr) {
    console.warn('[SubmitPlace] Không thể kiểm tra client_submission_id trước, tiếp tục thử ghi:', checkErr.message);
  }

  // 4. CHỈ ÁP DỤNG RATE-LIMIT CHO SUBMISSION MỚI (chưa tồn tại trong database)
  const ip = getClientIp(request);
  let rateLimitCheck;
  try {
    rateLimitCheck = await checkDistributedRateLimit(ip);
  } catch (rateErr) {
    if (rateErr.status === 503 || rateErr.code === 'RATE_LIMIT_UNAVAILABLE') {
      return sendError(
        response,
        503,
        'RATE_LIMIT_UNAVAILABLE',
        rateErr.message || 'Dịch vụ kiểm tra giới hạn tần suất tạm thời không khả dụng. Vui lòng thử lại sau.'
      );
    }
    throw rateErr;
  }

  if (!rateLimitCheck.allowed) {
    const waitSeconds = rateLimitCheck.wait_seconds || 10;
    return sendError(
      response,
      429,
      'RATE_LIMITED',
      `Bạn đang gửi yêu cầu quá nhanh. Vui lòng chờ ${waitSeconds} giây trước khi gửi tiếp.`,
      { 'Retry-After': String(waitSeconds) }
    );
  }

  // Khóa slug duy nhất kết hợp client_submission_id để không xung đột DB slug unique
  const baseSlug = createSlug(validated.name);
  const cleanSubId = validated.client_submission_id.replace(/[^a-zA-Z0-9_-]/g, '').slice(-16);
  const deterministicSlug = `contrib-${baseSlug}-${cleanSubId}`;

  // Luôn ép status: "draft" và ghi nhận client_submission_id trực tiếp
  const recordToInsert = {
    client_submission_id: validated.client_submission_id,
    name: validated.name,
    slug: deterministicSlug,
    category: validated.category,
    area: validated.area,
    address: validated.address,
    price_raw: validated.price_raw,
    display_hours: validated.display_hours,
    coordinates: validated.coordinates,
    map_link: validated.map_link,
    description: validated.description,
    contributor: validated.contributor,
    contact: validated.contact,
    images: validated.images,
    image_link: validated.image_link,
    status: 'draft',
    operating_status: 'Normal',
    rating: 0,
    is_featured: false,
    sort_order: 9999
  };

  try {
    const inserted = await supabaseRequest(TABLE_NAME, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(recordToInsert),
    });

    const saved = Array.isArray(inserted) ? inserted[0] : inserted;
    return sendJson(response, 201, {
      success: true,
      status: 'draft',
      data: saved,
      message: 'Cảm ơn bạn! Địa điểm đóng góp đã được tiếp nhận và lưu ở trạng thái bản nháp (draft) chờ Ban Quản Trị duyệt.'
    });
  } catch (dbErr) {
    // Xử lý duplicate key / unique constraint (idempotency an toàn khi có race condition trên client_submission_id hoặc slug)
    if (/duplicate key|unique constraint|23505/i.test(dbErr.message)) {
      try {
        const existingAfterConflict = await supabaseRequest(
          `${TABLE_NAME}?client_submission_id=eq.${encodeURIComponent(validated.client_submission_id)}&select=id,name,slug,category,area,status,client_submission_id,created_at&limit=1`
        );
        if (Array.isArray(existingAfterConflict) && existingAfterConflict.length > 0) {
          return sendJson(response, 200, {
            success: true,
            idempotent: true,
            status: existingAfterConflict[0].status,
            data: existingAfterConflict[0],
            message: 'Địa điểm đóng góp này đã được tiếp nhận trước đó.'
          });
        }
      } catch (e) {
        // Fallback response nếu query lại thất bại
      }

      return sendJson(response, 200, {
        success: true,
        idempotent: true,
        status: 'draft',
        data: { client_submission_id: validated.client_submission_id, slug: deterministicSlug },
        message: 'Địa điểm đóng góp này đã được tiếp nhận trước đó.'
      });
    }

    console.error('[SubmitPlace] Database insert error:', dbErr.message);
    return sendError(response, 500, 'DATABASE_ERROR', 'Không thể lưu địa điểm đóng góp lúc này. Vui lòng thử lại sau.');
  }
}
