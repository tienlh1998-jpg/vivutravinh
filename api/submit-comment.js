const TABLE_NAME = 'place_comments';
const MAX_PAYLOAD_SIZE = 64 * 1024; // 64KB for comment submissions
const RATE_LIMIT_WINDOW_SECONDS = 60;
const MAX_REQUESTS_PER_WINDOW = 3;
const MIN_INTERVAL_SECONDS = 10;

// Bounded local LRU cache phòng ngừa khi backend RPC tạm thời chưa sẵn sàng hoặc môi trường mock
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
    // Xóa bớt mục cũ nhất khi vượt ngưỡng bộ nhớ
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

/**
 * Kiểm tra rate limit phân tán thông qua Supabase RPC check_and_record_rate_limit.
 * Đảm bảo dữ liệu rate-limit nhất quán trên toàn bộ instance serverless.
 */
async function checkDistributedRateLimit(ip) {
  try {
    const rpcResult = await supabaseRequest('rpc/check_and_record_rate_limit', {
      method: 'POST',
      body: JSON.stringify({
        p_key: `comment_ip_${ip}`,
        p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
        p_max_requests: MAX_REQUESTS_PER_WINDOW,
        p_min_interval_seconds: MIN_INTERVAL_SECONDS
      })
    });

    if (rpcResult && typeof rpcResult.allowed === 'boolean') {
      return rpcResult;
    }
  } catch (err) {
    // Chỉ cho phép fallback bộ nhớ local khi có cờ rõ ràng dành cho môi trường dev/test.
    // Trên môi trường production, lỗi kết nối RPC sẽ bị chặn lập tức với mã 503 để tránh bypass rate-limit.
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

function validatePayload(body) {
  const authorName = String(body.author_name || '').trim();
  const placeId = String(body.place_id || '').trim();
  const placeName = String(body.place_name || '').trim();
  const commentText = String(body.comment_text || '').trim();
  const rating = Number(body.rating);
  const clientReviewId = String(body.client_review_id || '').trim();

  if (!placeId) {
    throw { code: 'INVALID_PLACE_ID', message: 'Thiếu mã định danh địa điểm (place_id).' };
  }
  if (!placeName) {
    throw { code: 'INVALID_PLACE_NAME', message: 'Thiếu tên địa điểm (place_name).' };
  }
  if (!authorName || authorName.length < 2 || authorName.length > 80) {
    throw { code: 'INVALID_AUTHOR_NAME', message: 'Tên người đánh giá phải từ 2 đến 80 ký tự.' };
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw { code: 'INVALID_RATING', message: 'Số sao đánh giá phải là số nguyên từ 1 đến 5.' };
  }
  if (!commentText || commentText.length < 3 || commentText.length > 1000) {
    throw { code: 'INVALID_COMMENT_TEXT', message: 'Nội dung nhận xét phải từ 3 đến 1000 ký tự.' };
  }
  if (!clientReviewId) {
    throw { code: 'INVALID_CLIENT_REVIEW_ID', message: 'Thiếu mã idempotency khóa duy nhất (client_review_id).' };
  }

  let photoUrl = null;
  let photoMetadata = {};
  if (body.photo_url) {
    const rawUrl = String(body.photo_url).trim();
    if (!/^https?:\/\/.+\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(rawUrl) && !/^\/storage\/v1\/.+\.(jpg|jpeg|png|webp)/i.test(rawUrl)) {
      throw { code: 'INVALID_PHOTO_URL', message: 'Định dạng đường dẫn ảnh không hợp lệ (chỉ chấp nhận JPG, PNG, WebP).' };
    }
    photoUrl = rawUrl;
    if (body.photo_metadata && typeof body.photo_metadata === 'object') {
      photoMetadata = {
        size: Number(body.photo_metadata.size || 0),
        mime: String(body.photo_metadata.mime || 'image/jpeg').toLowerCase(),
        width: Number(body.photo_metadata.width || 0),
        height: Number(body.photo_metadata.height || 0),
      };
    }
  }

  return {
    place_id: placeId,
    place_name: placeName,
    author_name: authorName,
    rating,
    comment_text: commentText,
    client_review_id: clientReviewId,
    photo_url: photoUrl,
    photo_metadata: photoMetadata,
  };
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return sendError(response, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed. Use POST.');
  }

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
      `Bạn đang gửi bình luận quá nhanh. Vui lòng chờ ${waitSeconds} giây trước khi gửi tiếp.`,
      { 'Retry-After': String(waitSeconds) }
    );
  }

  let body;
  try {
    body = await readBody(request, MAX_PAYLOAD_SIZE);
  } catch (err) {
    if (err.message === 'PAYLOAD_TOO_LARGE') {
      return sendError(response, 413, 'PAYLOAD_TOO_LARGE', 'Nội dung yêu cầu vượt quá giới hạn 64KB.');
    }
    return sendError(response, 400, 'BAD_REQUEST', 'Định dạng JSON không hợp lệ.');
  }

  let validated;
  try {
    validated = validatePayload(body);
  } catch (valErr) {
    return sendError(response, 400, valErr.code || 'VALIDATION_ERROR', valErr.message || 'Dữ liệu không hợp lệ.');
  }

  // Check idempotency: check if client_review_id exists
  try {
    const existing = await supabaseRequest(
      `${TABLE_NAME}?client_review_id=eq.${encodeURIComponent(validated.client_review_id)}&select=id,place_id,place_name,author_name,rating,comment_text,photo_url,photo_metadata,status,created_at,client_review_id&limit=1`
    );

    if (Array.isArray(existing) && existing.length > 0) {
      return sendJson(response, 200, {
        success: true,
        idempotent: true,
        status: existing[0].status,
        data: existing[0],
        message: 'Bình luận này đã được tiếp nhận trước đó.'
      });
    }
  } catch (checkErr) {
    console.warn('[SubmitComment] Không thể kiểm tra idempotency, tiếp tục ghi mới:', checkErr.message);
  }

  // Pre-moderation: always set status to 'pending'
  const recordToInsert = {
    ...validated,
    status: 'pending',
    is_hidden: false,
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
      status: 'pending',
      data: saved,
      message: 'Cảm ơn bạn! Đánh giá đã được tiếp nhận và đang chờ duyệt trước khi hiển thị công khai.'
    });
  } catch (dbErr) {
    if (/duplicate key|unique constraint|23505/i.test(dbErr.message)) {
      return sendJson(response, 200, {
        success: true,
        idempotent: true,
        status: 'pending',
        data: { client_review_id: validated.client_review_id },
        message: 'Bình luận này đã được tiếp nhận trước đó.'
      });
    }

    console.error('[SubmitComment] Database insert error:', dbErr.message);
    return sendError(response, 500, 'DATABASE_ERROR', 'Không thể lưu bình luận vào hệ thống lúc này. Vui lòng thử lại sau.');
  }
}
