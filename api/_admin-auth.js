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

/**
 * Xác thực quản trị viên qua Supabase Auth Bearer Token hoặc legacy secret (chỉ test mode)
 * @param {object} request 
 * @param {object} response 
 * @returns {Promise<object|null>} Trả về adminContext nếu hợp lệ, ngược lại trả về null (đã tự gửi response lỗi)
 */
export async function authenticateAdmin(request, response) {
  const ip = getClientIp(request);
  const path = request.url || '/api/admin';

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
        return { user: { id: 'mock-admin-uuid', email: 'admin@vivutravinh.test', role: 'admin' }, ip };
      }
      if (bearerToken === 'mock-editor-token') {
        recordSuccessfulAuth(ip);
        return { user: { id: 'mock-editor-uuid', email: 'editor@vivutravinh.test', role: 'editor' }, ip };
      }
      if (bearerToken === 'mock-moderator-token') {
        recordSuccessfulAuth(ip);
        return { user: { id: 'mock-moderator-uuid', email: 'moderator@vivutravinh.test', role: 'moderator' }, ip };
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
        ip
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
