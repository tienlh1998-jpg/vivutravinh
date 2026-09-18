// js/admin-auth.js
// Client-side authentication and session manager for ViVuTraVinh Admin (G8.3)

export const SUPABASE_URL = 'https://foyraoimhksfvlxndwxr.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZveXJhb2ltaGtzZnZseG5kd3hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjkwNzAsImV4cCI6MjA5NTMwNTA3MH0.ARJ173UkVNCichCiJmVrbp2aTByVoXnSEAIsIvbnYJ8';
export const SESSION_KEY = 'vivu_admin_session';

/**
 * Lấy phiên đăng nhập hiện tại từ sessionStorage
 * @returns {object|null}
 */
export function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Lưu phiên đăng nhập vào sessionStorage
 * @param {object} session
 */
export function saveSession(session) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (err) {
    console.error('[AdminAuth] Không thể lưu phiên đăng nhập:', err);
  }
}

/**
 * Xóa sạch phiên đăng nhập cục bộ
 */
export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (err) {
    console.error('[AdminAuth] Không thể xóa phiên đăng nhập:', err);
  }
}

/**
 * Lấy Access Token còn hạn sử dụng; tự động refresh nếu sắp hoặc đã hết hạn
 * @returns {Promise<string|null>}
 */
export async function getValidToken() {
  const session = getSession();
  if (!session || !session.access_token) return null;

  const now = Math.floor(Date.now() / 1000);

  // Nếu token còn hạn trên 60 giây, sử dụng trực tiếp
  if (session.expires_at && session.expires_at - now > 60) {
    return session.access_token;
  }

  // Token sắp hết hạn hoặc đã hết hạn, thử refresh nếu có refresh_token
  if (session.refresh_token) {
    try {
      const refreshRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ refresh_token: session.refresh_token })
      });

      const refreshData = await refreshRes.json();
      if (refreshRes.ok && refreshData.access_token) {
        session.access_token = refreshData.access_token;
        if (refreshData.refresh_token) session.refresh_token = refreshData.refresh_token;
        session.expires_at = refreshData.expires_at || (Math.floor(Date.now() / 1000) + (refreshData.expires_in || 3600));
        saveSession(session);
        return session.access_token;
      }
    } catch (err) {
      console.warn('[AdminAuth] Lỗi khi làm mới token:', err.message);
    }
  }

  // Nếu đã quá thời hạn mà không refresh được -> coi như hết phiên
  if (session.expires_at && now >= session.expires_at) {
    clearSession();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vivu:auth-expired', {
        detail: { message: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.' }
      }));
    }
    return null;
  }

  return session.access_token;
}

/**
 * Đăng nhập với Supabase Auth và xác minh role từ admin_users
 * @param {string} email
 * @param {string} password
 * @returns {Promise<object>} session
 */
export async function login(email, password) {
  const cleanEmail = String(email || '').trim();
  const cleanPass = String(password || '');

  if (!cleanEmail || !cleanPass) {
    throw new Error('Vui lòng cung cấp đầy đủ email và mật khẩu.');
  }

  // 1. Xác thực danh tính qua Supabase Auth API
  let authRes;
  try {
    authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ email: cleanEmail, password: cleanPass })
    });
  } catch (err) {
    throw new Error('Không thể kết nối đến máy chủ xác thực. Vui lòng kiểm tra kết nối mạng.');
  }

  const authData = await authRes.json().catch(() => ({}));
  if (!authRes.ok || !authData.access_token) {
    const errorMsg = authData.error_description || authData.message || 'Email hoặc mật khẩu không chính xác.';
    throw new Error(errorMsg);
  }

  // 2. Lấy profile và role thật đã xác minh từ admin_users qua API serverless
  let profileRes;
  try {
    profileRes = await fetch('/api/admin-profile', {
      headers: {
        'Authorization': `Bearer ${authData.access_token}`
      }
    });
  } catch (err) {
    throw new Error('Không thể kiểm tra phân quyền tài khoản. Vui lòng thử lại sau.');
  }

  const profileData = await profileRes.json().catch(() => ({}));
  if (!profileRes.ok || !profileData.success) {
    const roleErr = profileData.error?.message || 'Tài khoản không có quyền truy cập khu vực quản trị (không thuộc danh sách cho phép).';
    throw new Error(roleErr);
  }

  const now = Math.floor(Date.now() / 1000);
  const session = {
    access_token: authData.access_token,
    refresh_token: authData.refresh_token || null,
    expires_at: authData.expires_at || (now + (authData.expires_in || 3600)),
    user: {
      id: profileData.user?.id || authData.user?.id,
      email: profileData.user?.email || authData.user?.email || cleanEmail,
      role: profileData.user?.role || 'moderator'
    }
  };

  saveSession(session);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vivu:auth-login', { detail: { session } }));
  }

  return session;
}

/**
 * Đăng xuất khỏi Supabase Auth và xóa phiên làm việc
 * @returns {Promise<void>}
 */
export async function logout() {
  const session = getSession();
  if (session?.access_token) {
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_ANON_KEY
        }
      });
    } catch {
      // Bỏ qua lỗi mạng khi logout để dọn sạch phiên phía client
    }
  }

  clearSession();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vivu:auth-logout', {
      detail: { message: 'Đã đăng xuất khỏi hệ thống.' }
    }));
  }
}

/**
 * Gọi API quản trị với Bearer token tự động
 * @param {string} path
 * @param {object} options
 * @returns {Promise<any>}
 */
export async function adminRequest(path, options = {}) {
  const token = await getValidToken();
  if (!token) {
    throw new Error('Yêu cầu đăng nhập quản trị để thực hiện tác vụ này.');
  }

  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
  } catch (err) {
    throw new Error('Lỗi kết nối mạng khi gửi yêu cầu tới máy chủ.');
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vivu:auth-expired', {
          detail: { message: 'Phiên làm việc đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.' }
        }));
      }
      throw new Error('Phiên làm việc đã hết hạn.');
    }
    const errMsg = (payload.error && typeof payload.error === 'object' ? payload.error.message : payload.error) ||
      `Yêu cầu thất bại (HTTP ${response.status})`;
    throw new Error(errMsg);
  }

  return payload;
}

/**
 * Tiện ích kiểm tra phân quyền (RBAC)
 */
export function getUserRole() {
  const session = getSession();
  return session?.user?.role || null;
}

export function canManagePlaces() {
  const role = getUserRole();
  return ['admin', 'editor'].includes(role);
}

export function canDeletePlaces() {
  const role = getUserRole();
  return role === 'admin';
}

export function canModerateComments() {
  const role = getUserRole();
  return ['admin', 'moderator'].includes(role);
}

export function canDeleteComments() {
  const role = getUserRole();
  return role === 'admin';
}

export function canManageReports() {
  const role = getUserRole();
  return ['admin', 'moderator'].includes(role);
}

export function canViewPII() {
  const role = getUserRole();
  return ['admin', 'moderator'].includes(role);
}
