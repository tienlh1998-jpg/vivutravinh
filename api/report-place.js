// api/report-place.js
// Endpoint tiếp nhận báo sai thông tin địa điểm từ cộng đồng (G7 Production Ready)
// - Thực thi giới hạn dung lượng tải lên (MAX_PAYLOAD_SIZE = 64KB, trả 413 nếu vượt)
// - Rate-limiting phân tán qua RPC check_and_record_rate_limit (fallback Map bộ nhớ)
// - Đảm bảo tính Idempotency dựa trên client_report_id (kiểm tra trước rate-limit)
// - Ghi nhận bền vững vào bảng public.place_reports trên Supabase bằng Service Role Key
// - Không để lộ PII, bảo vệ an toàn danh tính người gửi

const TABLE_NAME = 'place_reports';
const MAX_PAYLOAD_SIZE = 64 * 1024; // 64KB
const RATE_LIMIT_WINDOW_SECONDS = 60;
const MAX_REQUESTS_PER_WINDOW = 5;
const MIN_INTERVAL_SECONDS = 5;

const MAX_LOCAL_CACHE_ENTRIES = 500;
const localRateLimitMap = new Map();
const localReportCache = new Map();

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
    return null;
  }

  return {
    baseUrl: supabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
    serviceRoleKey,
  };
}

async function supabaseRequest(path, options = {}) {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error('SUPABASE_NOT_CONFIGURED');
  }

  const { baseUrl, serviceRoleKey } = config;
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    headers: response.headers,
    data,
  };
}

function isDevOrTestEnvironment() {
  if (process.env.VIVU_TEST === '1') return true;
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') return true;
  if (process.env.ALLOW_LOCAL_RATE_LIMIT_FALLBACK === 'true' || process.env.ALLOW_MOCK_FALLBACK === 'true') return true;
  return false;
}

async function checkDistributedRateLimit(ip, supabaseConfig) {
  if (supabaseConfig) {
    try {
      const res = await fetch(`${supabaseConfig.baseUrl}/rest/v1/rpc/check_and_record_rate_limit`, {
        method: 'POST',
        headers: {
          apikey: supabaseConfig.serviceRoleKey,
          Authorization: `Bearer ${supabaseConfig.serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_ip: ip,
          window_seconds: RATE_LIMIT_WINDOW_SECONDS,
          max_requests: MAX_REQUESTS_PER_WINDOW,
          min_interval_seconds: MIN_INTERVAL_SECONDS,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.allowed === 'boolean') {
          return data;
        }
      } else {
        const errText = await res.text();
        throw new Error(`RPC status ${res.status}: ${errText}`);
      }
    } catch (err) {
      if (!isDevOrTestEnvironment()) {
        console.error('[RateLimit RPC Production Error]', err.message);
        const error = new Error('Dịch vụ kiểm tra giới hạn tần suất tạm thời không khả dụng. Vui lòng thử lại sau.');
        error.status = 503;
        error.code = 'RATE_LIMIT_UNAVAILABLE';
        throw error;
      }

      console.warn('[RateLimit RPC Fallback] Sử dụng local cache fallback (chế độ DEV/TEST):', err.message);
    }
  }

  // Local in-memory check (dành riêng cho TEST/DEV)
  return checkLocalRateLimit(ip);
}

async function readBody(request, limit = MAX_PAYLOAD_SIZE) {
  // Kiểm tra Content-Length header trước nếu có
  const contentLength = request.headers?.['content-length'];
  if (contentLength && parseInt(contentLength, 10) > limit) {
    throw new Error('PAYLOAD_TOO_LARGE');
  }

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
  const placeId = String(body.place_id || body.place_slug || '').trim().slice(0, 100);
  const placeName = String(body.place_name || '').trim().slice(0, 150);
  const issueType = String(body.issue_type || '').trim().toLowerCase();
  const details = String(body.details || '').trim();
  const reporterContact = String(body.reporter_contact || body.contact || '').trim().slice(0, 120);
  const clientReportId = body.client_report_id ? String(body.client_report_id).trim().slice(0, 100) : null;

  if (!placeId) {
    throw { code: 'MISSING_PLACE_ID', message: 'Thiếu mã định danh địa điểm cần phản ánh.' };
  }

  const validIssueTypes = new Set(['wrong_hours', 'wrong_price', 'wrong_address', 'closed', 'other']);
  if (!validIssueTypes.has(issueType)) {
    throw { code: 'INVALID_ISSUE_TYPE', message: 'Loại thông tin phản ánh không hợp lệ.' };
  }

  if (!details || details.length < 3) {
    throw { code: 'INVALID_DETAILS', message: 'Vui lòng mô tả chi tiết ít nhất 3 ký tự.' };
  }

  if (details.length > 1000) {
    throw { code: 'DETAILS_TOO_LONG', message: 'Mô tả chi tiết không được vượt quá 1000 ký tự.' };
  }

  return {
    place_id: placeId,
    place_name: placeName,
    issue_type: issueType,
    details: details,
    reporter_contact: reporterContact || null,
    client_report_id: clientReportId
  };
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return sendError(response, 405, 'METHOD_NOT_ALLOWED', 'Chỉ hỗ trợ phương thức POST.');
  }

  // 1. Đọc body và thực thi giới hạn dung lượng 64KB
  let body;
  try {
    body = await readBody(request, MAX_PAYLOAD_SIZE);
  } catch (err) {
    if (err.message === 'PAYLOAD_TOO_LARGE') {
      return sendError(response, 413, 'PAYLOAD_TOO_LARGE', 'Nội dung phản ánh vượt quá giới hạn 64KB.');
    }
    return sendError(response, 400, 'BAD_REQUEST', 'Định dạng JSON không hợp lệ.');
  }

  // 2. Validate dữ liệu đầu vào
  let validated;
  try {
    validated = validatePayload(body);
  } catch (valErr) {
    return sendError(response, 400, valErr.code || 'VALIDATION_ERROR', valErr.message || 'Dữ liệu không hợp lệ.');
  }

  const ip = getClientIp(request);
  const supabaseConfig = getSupabaseConfig();

  // Kiểm tra cấu hình Supabase trên môi trường production (chặn thành công giả)
  if (!supabaseConfig && !isDevOrTestEnvironment()) {
    console.error('[ReportPlace] Thiếu biến môi trường SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trên Production');
    return sendError(response, 500, 'CONFIG_ERROR', 'Dịch vụ cơ sở dữ liệu chưa được cấu hình trên máy chủ.');
  }

  // 3. Kiểm tra Idempotency qua client_report_id TRƯỚC rate-limit
  if (validated.client_report_id) {
    if (supabaseConfig) {
      try {
        const existingRes = await supabaseRequest(
          `${TABLE_NAME}?select=id,place_id,place_name,issue_type,status,created_at&client_report_id=eq.${encodeURIComponent(validated.client_report_id)}&limit=1`
        );
        if (existingRes.ok && Array.isArray(existingRes.data) && existingRes.data.length > 0) {
          const existing = existingRes.data[0];
          return sendJson(response, 200, {
            success: true,
            message: 'Báo cáo này đã được tiếp nhận trước đó (Idempotent). Ban quản trị đang xử lý.',
            idempotent: true,
            data: existing
          }, {
            'X-Idempotent-Replay': 'true'
          });
        }
      } catch (err) {
        console.warn('[Idempotency Check] Lỗi kiểm tra trùng lặp:', err.message);
      }
    } else if (localReportCache.has(validated.client_report_id)) {
      const existing = localReportCache.get(validated.client_report_id);
      return sendJson(response, 200, {
        success: true,
        message: 'Báo cáo này đã được tiếp nhận trước đó (Idempotent). Ban quản trị đang xử lý.',
        idempotent: true,
        data: existing
      }, {
        'X-Idempotent-Replay': 'true'
      });
    }
  }

  // 4. Rate-limiting phân tán (Supabase RPC, fail-closed 503 trên Production)
  let rateLimitResult;
  try {
    rateLimitResult = await checkDistributedRateLimit(ip, supabaseConfig);
  } catch (rateErr) {
    if (rateErr.status === 503) {
      return sendError(response, 503, rateErr.code || 'RATE_LIMIT_UNAVAILABLE', rateErr.message);
    }
    throw rateErr;
  }

  if (!rateLimitResult.allowed) {
    const waitSec = rateLimitResult.wait_seconds || 10;
    return sendError(
      response,
      429,
      rateLimitResult.code || 'RATE_LIMITED',
      `Bạn đang gửi phản ánh quá nhanh. Vui lòng thử lại sau ${waitSec} giây.`,
      { 'Retry-After': String(waitSec) }
    );
  }

  // 5. Ghi nhận báo cáo vào cơ sở dữ liệu Supabase
  const insertPayload = {
    place_id: validated.place_id,
    place_name: validated.place_name,
    issue_type: validated.issue_type,
    details: validated.details,
    reporter_contact: validated.reporter_contact,
    ip: ip,
    client_report_id: validated.client_report_id,
    status: 'pending'
  };

  let createdReport = null;
  if (supabaseConfig) {
    try {
      const insertRes = await supabaseRequest(TABLE_NAME, {
        method: 'POST',
        headers: {
          Prefer: 'return=representation',
        },
        body: JSON.stringify(insertPayload),
      });

      if (!insertRes.ok) {
        // Trường hợp bị race condition cùng client_report_id (Unique constraint violation HTTP 409)
        if (insertRes.status === 409 || String(insertRes.data?.message || '').includes('unique')) {
          const fetchExisting = await supabaseRequest(
            `${TABLE_NAME}?select=id,place_id,place_name,issue_type,status,created_at&client_report_id=eq.${encodeURIComponent(validated.client_report_id)}&limit=1`
          );
          if (fetchExisting.ok && Array.isArray(fetchExisting.data) && fetchExisting.data.length > 0) {
            return sendJson(response, 200, {
              success: true,
              message: 'Báo cáo này đã được tiếp nhận trước đó (Idempotent).',
              idempotent: true,
              data: fetchExisting.data[0]
            }, {
              'X-Idempotent-Replay': 'true'
            });
          }
        }

        console.error('[Supabase Insert Error]', insertRes.status, insertRes.data);
        return sendError(response, 500, 'DATABASE_ERROR', 'Không thể lưu phản ánh vào cơ sở dữ liệu.');
      }

      createdReport = Array.isArray(insertRes.data) ? insertRes.data[0] : insertRes.data;
    } catch (dbErr) {
      console.error('[Supabase Exception]', dbErr);
      return sendError(response, 500, 'DATABASE_EXCEPTION', 'Lỗi kết nối cơ sở dữ liệu khi lưu phản ánh.');
    }
  } else if (isDevOrTestEnvironment()) {
    // Chế độ DEV/TEST không có cấu hình Supabase
    createdReport = {
      id: 'mock-report-' + Date.now(),
      ...insertPayload,
      created_at: new Date().toISOString(),
      _mode: 'mock_local'
    };
  } else {
    return sendError(response, 500, 'CONFIG_ERROR', 'Dịch vụ cơ sở dữ liệu chưa được cấu hình.');
  }

  // Ghi nhận thành công vào local cache
  recordLocalSubmission(ip);
  if (validated.client_report_id) {
    localReportCache.set(validated.client_report_id, {
      id: createdReport?.id,
      place_id: createdReport?.place_id,
      place_name: createdReport?.place_name,
      issue_type: createdReport?.issue_type,
      status: createdReport?.status,
      created_at: createdReport?.created_at
    });
  }

  return sendJson(response, 200, {
    success: true,
    message: 'Cảm ơn bạn đã phản hồi! Ban quản trị sẽ xác minh và cập nhật thông tin sớm nhất.',
    data: {
      id: createdReport?.id,
      place_id: createdReport?.place_id,
      place_name: createdReport?.place_name,
      issue_type: createdReport?.issue_type,
      status: createdReport?.status,
      created_at: createdReport?.created_at
    }
  });
}
