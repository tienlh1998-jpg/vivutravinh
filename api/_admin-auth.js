// api/_admin-auth.js
// Middleware xác thực Supabase Auth & Phân quyền quản trị viên (RBAC) - G8.1
// Bảo vệ toàn bộ endpoint admin: places, comments, reports, audit logs.

const FAILED_ATTEMPTS_LIMIT = 5;
const LOCKOUT_PERIOD_MS = 15 * 60 * 1000; // 15 phút
const failedAttemptsMap = new Map();

export function getClientIp(request) {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.socket?.remoteAddress || '127.0.0.1';
}

export function checkAuthRateLimit(ip) {
  const now = Date.now();
  const record = failedAttemptsMap.get(ip);
  if (record && record.count >= FAILED_ATTEMPTS_LIMIT) {
    if (now - record.lastAttempt < LOCKOUT_PERIOD_MS) {
      const remainingMinutes = Math.ceil((LOCKOUT_PERIOD_MS - (now - record.lastAttempt)) / 60000);
      return { allowed: false, remainingMinutes };
    }
    failedAttemptsMap.delete(ip);
  }
  return { allowed: true };
}

export function recordFailedAuth(ip, path) {
  const now = Date.now();
  const record = failedAttemptsMap.get(ip) || { count: 0, lastAttempt: now };
  record.count += 1;
  record.lastAttempt = now;
  failedAttemptsMap.set(ip, record);
  // Tuyệt đối không ghi token hay PII ra log
  console.warn(`[AUDIT] Failed admin auth from IP ${ip} at ${new Date(now).toISOString()} on ${path} (${record.count}/${FAILED_ATTEMPTS_LIMIT})`);
}

export function recordSuccessfulAuth(ip) {
  failedAttemptsMap.delete(ip);
}

export function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('CONFIG_ERROR: Thiếu biến môi trường SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY');
  }

  return {
    baseUrl: supabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
    serviceRoleKey,
  };
}

export function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

export function sendError(response, statusCode, code, message) {
  sendJson(response, statusCode, {
    success: false,
    error: { code, message }
  });
}

const CORRELATION_ID_REGEX = /^[A-Za-z0-9._:-]{1,128}$/;

export function generateCorrelationId() {
  return `corr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function validateCorrelationId(rawId) {
  if (typeof rawId !== 'string') return null;
  const trimmed = rawId.trim();
  if (trimmed.length === 0 || trimmed.length > 128) return null;
  if (!CORRELATION_ID_REGEX.test(trimmed)) return null;
  return trimmed;
}

export function getCorrelationId(request) {
  const raw = request?.headers?.['x-correlation-id'] ||
    request?.headers?.['x-request-id'] ||
    request?.headers?.['X-Correlation-ID'] ||
    request?.headers?.['X-Request-ID'];
  const valid = validateCorrelationId(raw);
  if (valid) return valid;
  return generateCorrelationId();
}

/**
 * Xác thực quản trị viên qua Supabase Auth Bearer Token hoặc legacy secret (chỉ test mode)
 * @param {object} request
 * @param {object} response
 * @returns {Promise<object|null>} Trả về adminContext nếu hợp lệ, ngược lại trả về null (đã tự gửi response lỗi)
 */
export async function authenticateAdmin(request, response) {
  const ip = getClientIp(request);
  const path = request.url || '/api/admin';
  const correlationId = getCorrelationId(request);

  if (response && typeof response.setHeader === 'function') {
    response.setHeader('X-Correlation-ID', correlationId);
  }

  // 1. Kiểm tra rate-limit chống brute-force
  const rateCheck = checkAuthRateLimit(ip);
  if (!rateCheck.allowed) {
    sendError(response, 429, 'AUTH_RATE_LIMITED', `Quá nhiều lần thử xác thực thất bại. Vui lòng thử lại sau ${rateCheck.remainingMinutes} phút.`);
    return null;
  }

  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  const isTestMode = !isProduction && (process.env.NODE_ENV === 'test' || process.env.VIVU_TEST === '1' || process.env.ALLOW_LEGACY_ADMIN_SECRET === 'true' || Boolean(process.env.ADMIN_SECRET));

  // 2. Bóc tách Bearer token
  const authHeader = request.headers['authorization'] || request.headers['Authorization'] || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  // 3. Xử lý xác thực qua Supabase Auth Bearer Token
  if (bearerToken) {
    // 3.0. Chặn tuyệt đối Mock Token trên Production (kể cả khi VIVU_TEST=1 hoặc ALLOW_LEGACY_ADMIN_SECRET=true)
    if (isProduction && bearerToken.startsWith('mock-')) {
      recordFailedAuth(ip, path);
      sendError(response, 401, 'UNAUTHENTICATED', 'Mock tokens bị từ chối tuyệt đối trên môi trường Production.');
      return null;
    }

    // 3.1. Hỗ trợ Mock Token trong môi trường TEST/DEV độc lập (CHỈ khi KHÔNG PHẢI Production)
    if (!isProduction && bearerToken.startsWith('mock-')) {
      if (bearerToken === 'mock-admin-token') {
        recordSuccessfulAuth(ip);
        return { user: { id: 'mock-admin-uuid', email: 'admin@vivutravinh.test', role: 'admin' }, ip, correlationId };
      }
      if (bearerToken === 'mock-editor-token') {
        recordSuccessfulAuth(ip);
        return { user: { id: 'mock-editor-uuid', email: 'editor@vivutravinh.test', role: 'editor' }, ip, correlationId };
      }
      if (bearerToken === 'mock-moderator-token') {
        recordSuccessfulAuth(ip);
        return { user: { id: 'mock-moderator-uuid', email: 'moderator@vivutravinh.test', role: 'moderator' }, ip, correlationId };
      }
      if (bearerToken === 'mock-inactive-token') {
        recordFailedAuth(ip, path);
        sendError(response, 403, 'FORBIDDEN', 'Tài khoản quản trị viên đã bị vô hiệu hóa.');
        return null;
      }
      if (bearerToken === 'mock-unlisted-token') {
        recordFailedAuth(ip, path);
        sendError(response, 403, 'FORBIDDEN', 'Tài khoản không nằm trong allowlist quản trị viên.');
        return null;
      }
      if (bearerToken === 'mock-expired-token' || bearerToken === 'mock-invalid-token') {
        recordFailedAuth(ip, path);
        sendError(response, 401, 'UNAUTHENTICATED', 'Token xác thực không hợp lệ hoặc đã hết hạn.');
        return null;
      }
    }

    // 3.2. Xác minh JWT thực tế qua Supabase Auth API
    let config;
    try {
      config = getSupabaseConfig();
    } catch (err) {
      console.error('[AdminAuth] Lỗi cấu hình Supabase:', err.message);
      sendError(response, 500, 'CONFIG_ERROR', 'Hệ thống xác thực quản trị chưa được cấu hình.');
      return null;
    }

    try {
      // Gọi Supabase Auth để giải mã và xác minh JWT
      const authRes = await fetch(`${config.baseUrl}/auth/v1/user`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
          'apikey': config.serviceRoleKey
        }
      });

      if (!authRes.ok) {
        recordFailedAuth(ip, path);
        sendError(response, 401, 'UNAUTHENTICATED', 'Phiên làm việc không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.');
        return null;
      }

      const authUser = await authRes.json();
      if (!authUser || !authUser.id) {
        recordFailedAuth(ip, path);
        sendError(response, 401, 'UNAUTHENTICATED', 'Không nhận diện được người dùng từ token.');
        return null;
      }

      // Truy vấn bảng allowlist public.admin_users
      const adminRes = await fetch(`${config.baseUrl}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(authUser.id)}&select=user_id,email,role,is_active`, {
        method: 'GET',
        headers: {
          'apikey': config.serviceRoleKey,
          'Authorization': `Bearer ${config.serviceRoleKey}`
        }
      });

      if (!adminRes.ok) {
        console.error('[AdminAuth] Lỗi truy vấn bảng admin_users:', adminRes.status);
        sendError(response, 500, 'DATABASE_ERROR', 'Không thể xác minh quyền quản trị viên.');
        return null;
      }

      const adminUsers = await adminRes.json();
      if (!Array.isArray(adminUsers) || adminUsers.length === 0) {
        recordFailedAuth(ip, path);
        sendError(response, 403, 'FORBIDDEN', 'Tài khoản không có quyền truy cập khu vực quản trị (không nằm trong allowlist).');
        return null;
      }

      const adminProfile = adminUsers[0];
      if (!adminProfile.is_active) {
        recordFailedAuth(ip, path);
        sendError(response, 403, 'FORBIDDEN', 'Tài khoản quản trị của bạn đã bị khóa hoặc tạm dừng.');
        return null;
      }

      recordSuccessfulAuth(ip);
      return {
        user: {
          id: adminProfile.user_id,
          email: adminProfile.email || authUser.email,
          role: adminProfile.role
        },
        ip,
        correlationId
      };
    } catch (networkErr) {
      console.error('[AdminAuth] Lỗi kết nối Supabase Auth:', networkErr.message);
      sendError(response, 503, 'AUTH_UNAVAILABLE', 'Dịch vụ xác thực tạm thời không khả dụng.');
      return null;
    }
  }

  // 4. Cơ chế tương thích ngược (Legacy x-admin-secret) - CHỈ cho phép trong môi trường TEST/DEV
  const providedSecret = request.headers['x-admin-secret'];
  if (providedSecret) {
    if (isProduction || !isTestMode) {
      // Production fail-closed: Từ chối hoàn toàn header x-admin-secret trên production
      recordFailedAuth(ip, path);
      sendError(response, 401, 'UNAUTHENTICATED', 'Cơ chế xác thực secret đã ngừng hoạt động trên Production. Vui lòng đăng nhập bằng tài khoản Supabase.');
      return null;
    }

    const configuredSecret = process.env.ADMIN_SECRET;
    if (!configuredSecret || providedSecret !== configuredSecret) {
      recordFailedAuth(ip, path);
      sendError(response, 401, 'UNAUTHORIZED', 'Unauthorized: Invalid x-admin-secret.');
      return null;
    }

    recordSuccessfulAuth(ip);
    return {
      user: {
        id: 'legacy-admin',
        email: 'admin-secret@test.local',
        role: 'admin' // Legacy secret có toàn quyền admin để test G5/G6 không lỗi
      },
      ip,
      correlationId,
      isLegacy: true
    };
  }

  // 5. Không có bất kỳ thông tin xác thực nào
  recordFailedAuth(ip, path);
  sendError(response, 401, 'UNAUTHENTICATED', 'Yêu cầu xác thực: Vui lòng cung cấp Bearer token hợp lệ.');
  return null;
}

/**
 * Kiểm tra phân quyền RBAC
 * @param {object} adminContext
 * @param {string[]} allowedRoles Danh sách các role được phép thao tác
 * @param {object} response
 * @returns {boolean} true nếu được phép, false nếu bị chặn (đã tự gửi response 403)
 */
export function requireRole(adminContext, allowedRoles, response) {
  if (!adminContext || !adminContext.user) {
    sendError(response, 401, 'UNAUTHENTICATED', 'Chưa được xác thực.');
    return false;
  }

  const role = adminContext.user.role;
  if (!allowedRoles.includes(role)) {
    sendError(response, 403, 'FORBIDDEN', `Vai trò '${role}' không có quyền thực hiện thao tác này. Yêu cầu quyền: [${allowedRoles.join(', ')}].`);
    return false;
  }

  return true;
}

/**
 * Đọc body request an toàn hỗ trợ object, string, Buffer và stream, kèm giới hạn dung lượng
 * @param {object|string|Buffer} request
 * @param {number} limit Giới hạn bytes (mặc định 1MB = 1048576)
 * @returns {Promise<object>}
 */
export async function readBody(request, limit = 1048576) {
  if (!request) return {};

  // Trường hợp 1: request là Buffer trực tiếp
  if (Buffer.isBuffer(request)) {
    if (request.length > limit) {
      throw new Error('PAYLOAD_TOO_LARGE');
    }
    const raw = request.toString('utf8').trim();
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error('INVALID_JSON');
    }
  }

  // Trường hợp 2: request là string trực tiếp
  if (typeof request === 'string') {
    const byteLen = Buffer.byteLength(request, 'utf8');
    if (byteLen > limit) {
      throw new Error('PAYLOAD_TOO_LARGE');
    }
    const raw = request.trim();
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error('INVALID_JSON');
    }
  }

  // Trường hợp 3: request.body đã được phân tích trước (object, Buffer hoặc string)
  if (request.body !== undefined && request.body !== null) {
    if (Buffer.isBuffer(request.body)) {
      if (request.body.length > limit) {
        throw new Error('PAYLOAD_TOO_LARGE');
      }
      const raw = request.body.toString('utf8').trim();
      if (!raw) return {};
      try {
        return JSON.parse(raw);
      } catch {
        throw new Error('INVALID_JSON');
      }
    }

    if (typeof request.body === 'string') {
      const byteLen = Buffer.byteLength(request.body, 'utf8');
      if (byteLen > limit) {
        throw new Error('PAYLOAD_TOO_LARGE');
      }
      const raw = request.body.trim();
      if (!raw) return {};
      try {
        return JSON.parse(raw);
      } catch {
        throw new Error('INVALID_JSON');
      }
    }

    if (typeof request.body === 'object' && typeof request.body[Symbol.asyncIterator] !== 'function') {
      const rawLen = Buffer.byteLength(JSON.stringify(request.body), 'utf8');
      if (rawLen > limit) {
        throw new Error('PAYLOAD_TOO_LARGE');
      }
      return request.body;
    }
  }

  // Trường hợp 4: request là async iterable / stream (IncomingMessage tiêu chuẩn)
  if (typeof request[Symbol.asyncIterator] === 'function') {
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
      const chunkBuf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += chunkBuf.length;
      if (size > limit) {
        throw new Error('PAYLOAD_TOO_LARGE');
      }
      chunks.push(chunkBuf);
    }

    if (chunks.length === 0) return {};
    const rawString = Buffer.concat(chunks).toString('utf8').trim();
    if (!rawString) return {};
    try {
      return JSON.parse(rawString);
    } catch {
      throw new Error('INVALID_JSON');
    }
  }

  return {};
}

/**
 * Thực hiện yêu cầu HTTP tới Supabase REST API dùng service role key
 * @param {string} path
 * @param {object} options
 */
export async function supabaseRequest(path, options = {}) {
  const { baseUrl, serviceRoleKey } = getSupabaseConfig();
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (options.count) {
    headers['Prefer'] = headers['Prefer'] ? `${headers['Prefer']},count=exact` : 'count=exact';
  }

  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(errorText);
    } catch {
      parsed = null;
    }
    const message = parsed?.message || errorText || `Supabase request failed: ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.code = parsed?.code;
    err.details = parsed?.details;
    err.hint = parsed?.hint;
    throw err;
  }

  if (response.status === 204) return null;

  const data = await response.json();
  if (options.count) {
    let contentRange = null;
    if (response.headers) {
      contentRange = typeof response.headers.get === 'function'
        ? response.headers.get('content-range')
        : response.headers['content-range'];
    }
    let total = null;
    if (contentRange) {
      const match = String(contentRange).match(/\/(\d+)/);
      if (match) total = parseInt(match[1], 10);
    }
    return { data, total };
  }

  return data;
}

/**
 * Gọi PostgreSQL Function (RPC) thông qua Supabase REST API
 * @param {string} rpcName Tên hàm RPC trong public schema
 * @param {object} params Các tham số truyền vào hàm
 * @returns {Promise<any>}
 */
export async function supabaseRpc(rpcName, params = {}) {
  return await supabaseRequest(`rpc/${rpcName}`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * Trích xuất UUID an toàn cho actor_id, trả về null nếu không phải định dạng UUID hợp lệ
 * @param {object} adminContext
 * @returns {string|null}
 */
export function getSafeActorId(adminContext) {
  const id = adminContext?.user?.id;
  if (!id || typeof id !== 'string') return null;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  return isUuid ? id : null;
}


/**
 * Phân tích pagination an toàn từ URL
 * @param {string} url
 * @param {number} defaultLimit
 * @param {number} maxLimit
 */
export function parsePagination(url, defaultLimit = 20, maxLimit = 100) {
  const parsedUrl = new URL(url, 'http://localhost');
  let page = parseInt(parsedUrl.searchParams.get('page') || '1', 10);
  let limit = parseInt(parsedUrl.searchParams.get('limit') || String(defaultLimit), 10);

  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  const offset = (page - 1) * limit;
  return { page, limit, offset, searchParams: parsedUrl.searchParams };
}

// Allowlist các trường an toàn cho từng đối tượng trong Audit Log
export const AUDIT_ALLOWLIST = {
  place: [
    'id', 'slug', 'name', 'category', 'area', 'status',
    'operating_status', 'rating', 'opening_time', 'closing_time',
    'display_hours', 'sort_order', 'is_featured', 'updated_at'
  ],
  comment: [
    'id', 'place_id', 'place_name', 'status', 'is_hidden', 'rating', 'updated_at'
  ],
  report: [
    'id', 'place_id', 'place_name', 'issue_type', 'status', 'admin_notes', 'reviewed_at'
  ]
};

const PII_AND_SENSITIVE_KEYS = new Set([
  'password', 'token', 'access_token', 'refresh_token',
  'secret', 'admin_secret', 'service_role_key', 'apikey',
  'authorization',
  'contact', 'reporter_contact', 'author_name', 'comment_text', 'details',
  'photo_url', 'photo_metadata', 'ip', 'email', 'contributor', 'address', 'map_link',
  'client_review_id', 'client_report_id'
]);

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const IP_REGEX = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

function scrubSensitiveFields(data) {
  if (data === null || data === undefined) return null;
  if (typeof data !== 'object') {
    if (typeof data === 'string') {
      if (data.startsWith('ey') && data.length > 50) return '[REDACTED_JWT]';
      let s = data.replace(EMAIL_REGEX, '[REDACTED_EMAIL]');
      s = s.replace(IP_REGEX, '[REDACTED_IP]');
      return s;
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => scrubSensitiveFields(item));
  }

  const sanitized = {};
  for (const [key, val] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (PII_AND_SENSITIVE_KEYS.has(lowerKey) ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('password') ||
        lowerKey.includes('contact') ||
        lowerKey.includes('email') ||
        lowerKey.includes('photo')) {
      // Loại bỏ hoàn toàn trường nhạy cảm / PII khỏi audit payload
      continue;
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = scrubSensitiveFields(val);
    } else if (typeof val === 'string') {
      if (val.startsWith('ey') && val.length > 50) {
        sanitized[key] = '[REDACTED_JWT]';
      } else {
        let s = val.replace(EMAIL_REGEX, '[REDACTED_EMAIL]');
        s = s.replace(IP_REGEX, '[REDACTED_IP]');
        sanitized[key] = s;
      }
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

/**
 * Lọc bỏ thông tin nhạy cảm và PII theo allowlist chặt chẽ trước khi lưu audit log
 * @param {any} data
 * @param {string|null} entityType 'place' | 'comment' | 'report' | null
 */
export function sanitizeAuditPayload(data, entityType = null) {
  if (data === null || data === undefined) return null;
  if (typeof data !== 'object') return scrubSensitiveFields(data);

  // Nếu có entityType trong AUDIT_ALLOWLIST, lọc theo allowlist của entity đó
  if (entityType && AUDIT_ALLOWLIST[entityType] && !Array.isArray(data)) {
    const allowedKeys = new Set(AUDIT_ALLOWLIST[entityType]);
    const filtered = {};
    for (const key of Object.keys(data)) {
      if (allowedKeys.has(key)) {
        filtered[key] = data[key];
      }
    }
    return scrubSensitiveFields(filtered);
  }

  return scrubSensitiveFields(data);
}

/**
 * Ghi nhật ký kiểm toán quản trị viên vào bảng public.admin_audit_logs.
 * NÉM LỖI (THROW) nếu thất bại để đảm bảo tính nguyên tử, không nuốt lỗi!
 */
export async function recordAuditLog({
  adminContext,
  action,
  entityType,
  entityId,
  payloadBefore = null,
  payloadAfter = null,
  correlationId = null,
  ip = null
}) {
  const cid = correlationId || adminContext?.correlationId || generateCorrelationId();
  const clientIp = ip || adminContext?.ip || '127.0.0.1';

  const auditEntry = {
    actor_id: adminContext?.user?.id || null,
    actor_email: adminContext?.user?.email || null,
    actor_role: adminContext?.user?.role || 'unknown',
    action,
    entity_type: entityType,
    entity_id: String(entityId || ''),
    payload_before: payloadBefore ? sanitizeAuditPayload(payloadBefore, entityType) : null,
    payload_after: payloadAfter ? sanitizeAuditPayload(payloadAfter, entityType) : null,
    ip: clientIp,
    correlation_id: cid,
    created_at: new Date().toISOString()
  };

  try {
    await supabaseRequest('admin_audit_logs', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(auditEntry)
    });
  } catch (err) {
    console.error(`[AUDIT_LOG_ERROR] Không thể ghi audit log (${action} trên ${entityType}/${entityId}):`, err.message);
    const auditErr = new Error(`AUDIT_LOG_FAILED: ${err.message}`);
    auditErr.code = 'AUDIT_LOG_FAILED';
    throw auditErr;
  }

  return auditEntry;
}
