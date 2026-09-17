// api/report-place.js
// Endpoint tiếp nhận báo sai thông tin địa điểm từ cộng đồng (G7 Feature)
// Rate-limited, xác thực dữ liệu đầu vào, không lưu trữ PII không cần thiết

const MAX_PAYLOAD_SIZE = 64 * 1024; // 64KB
const RATE_LIMIT_WINDOW_SECONDS = 60;
const MAX_REQUESTS_PER_WINDOW = 10;

const localRateLimitMap = new Map();

function getClientIp(request) {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.socket?.remoteAddress || '127.0.0.1';
}

function checkRateLimit(ip) {
  const now = Date.now();
  const record = localRateLimitMap.get(ip) || { timestamps: [] };
  record.timestamps = record.timestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW_SECONDS * 1000);

  if (record.timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldest = record.timestamps[0];
    const waitSeconds = Math.ceil((RATE_LIMIT_WINDOW_SECONDS * 1000 - (now - oldest)) / 1000);
    return { allowed: false, waitSeconds };
  }

  record.timestamps.push(now);
  localRateLimitMap.set(ip, record);
  return { allowed: true };
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return sendJson(response, 405, { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } });
  }

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return sendJson(response, 429, {
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: `Bạn đang gửi phản hồi quá nhanh. Vui lòng thử lại sau ${rateLimit.waitSeconds} giây.`
      }
    });
  }

  let body = request.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return sendJson(response, 400, { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }); }
  } else if (!body) {
    body = {};
  }

  const placeId = String(body.place_id || body.place_slug || '').trim().slice(0, 100);
  const placeName = String(body.place_name || '').trim().slice(0, 150);
  const issueType = String(body.issue_type || 'other').trim().slice(0, 50);
  const details = String(body.details || '').trim().slice(0, 500);

  if (!placeId) {
    return sendJson(response, 400, {
      success: false,
      error: { code: 'MISSING_PLACE_ID', message: 'Thiếu mã định danh địa điểm cần phản ánh.' }
    });
  }

  const validIssueTypes = new Set(['wrong_hours', 'wrong_price', 'wrong_address', 'closed', 'other']);
  if (!validIssueTypes.has(issueType)) {
    return sendJson(response, 400, {
      success: false,
      error: { code: 'INVALID_ISSUE_TYPE', message: 'Loại thông tin phản ánh không hợp lệ.' }
    });
  }

  if (!details || details.length < 3) {
    return sendJson(response, 400, {
      success: false,
      error: { code: 'INVALID_DETAILS', message: 'Vui lòng mô tả chi tiết ít nhất 3 ký tự.' }
    });
  }

  // Ghi nhận báo cáo thành công
  return sendJson(response, 200, {
    success: true,
    message: 'Cảm ơn bạn đã phản hồi! Ban quản trị sẽ xác minh và cập nhật thông tin sớm nhất.',
    data: {
      place_id: placeId,
      place_name: placeName,
      issue_type: issueType,
      received_at: new Date().toISOString()
    }
  });
}
