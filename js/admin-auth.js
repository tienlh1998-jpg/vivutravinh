// js/admin-auth.js
// Client-side authentication and session manager for ViVuTraVinh Admin (G8.3)

export const SUPABASE_URL = 'https://foyraoimhksfvlxndwxr.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_ThGdyDQHqdNXPFgKRr0XaA_copz_ulU';
export const SESSION_KEY = 'vivu_admin_session';

/**
 * Lấy phiên đăng nhập hiện tại từ sessionStorage
 * @returns {object|null}
 */
export function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.user) {
        if (parsed.user.email?.toLowerCase() === 'tienlh1998@gmail.com' && (!parsed.user.role || parsed.user.role === 'authenticated')) {
          parsed.user.role = 'admin';
        }
        return parsed;
      }
    }

    // Fallback: Nếu có phiên người dùng mang quyền quản trị viên trong vivu_user_session
    const rawUser = localStorage.getItem('vivu_user_session');
    if (rawUser) {
      const parsedUser = JSON.parse(rawUser);
      const user = parsedUser?.user;
      if (user) {
        const email = String(user.email || '').toLowerCase().trim();
        const role = user.role;
        const metaRole = user.user_metadata?.role || user.app_metadata?.role;

        let profileRole = null;
        try {
          const rawProfile = localStorage.getItem('vivu_user_profile');
          if (rawProfile) {
            const p = JSON.parse(rawProfile);
            if (p?.role && ['admin', 'editor', 'moderator'].includes(p.role)) {
              profileRole = p.role;
            }
          }
        } catch (_) {}

        const effectiveRole = ['admin', 'editor', 'moderator'].includes(role)
          ? role
          : (['admin', 'editor', 'moderator'].includes(metaRole)
            ? metaRole
            : (profileRole || (email === 'tienlh1998@gmail.com' ? 'admin' : null)));

        if (effectiveRole) {
          const adminSession = {
            ...parsedUser,
            user: {
              ...user,
              role: effectiveRole
            }
          };
          try {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(adminSession));
            localStorage.setItem(SESSION_KEY, JSON.stringify(adminSession));
          } catch (_) {}
          return adminSession;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Lưu phiên đăng nhập vào sessionStorage và localStorage để chia sẻ phiên giữa trang chính và admin
 * @param {object} session
 */
export function saveSession(session) {
  try {
    const str = JSON.stringify(session);
    sessionStorage.setItem(SESSION_KEY, str);
    localStorage.setItem(SESSION_KEY, str);

    // Đồng bộ sang vivu_user_session để thống nhất token và UID của cùng một tài khoản
    localStorage.setItem('vivu_user_session', str);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vivu:user-auth-changed', { detail: { session } }));
    }
  } catch (err) {
    console.error('[AdminAuth] Không thể lưu phiên đăng nhập:', err);
  }
}

/**
 * Xóa riêng phiên làm việc của Quản trị viên (SESSION_KEY)
 * TUYỆT ĐỐI KHÔNG xóa hoặc can thiệp vào phiên người dùng thường (vivu_user_session)
 */
export function clearAdminSessionOnly() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch (err) {
    console.error('[AdminAuth] Không thể xóa phiên quản trị:', err);
  }
}

/**
 * Xóa phiên đăng nhập quản trị
 * Tách biệt hoàn toàn thao tác xóa quyền quản trị khỏi đăng xuất toàn bộ.
 * Chỉ xóa phiên người dùng khi options.clearUserSession === true (đăng xuất toàn bộ).
 *
 * @param {object} [options]
 * @param {boolean} [options.clearUserSession=false] Có xóa luôn phiên người dùng thường hay không
 */
export function clearSession(options = {}) {
  clearAdminSessionOnly();

  if (options && options.clearUserSession === true) {
    try {
      localStorage.removeItem('vivu_user_session');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vivu:user-auth-changed', { detail: { session: null } }));
      }
    } catch (err) {
      console.error('[AdminAuth] Không thể xóa phiên người dùng:', err);
    }
  }
}

export const clearAdminSession = clearAdminSessionOnly;

let activeAdminRefreshPromise = null;

function normalizeExpiresAt(expiresAt) {
  if (!expiresAt) return null;
  const n = Number(expiresAt);
  if (isNaN(n)) return null;
  return n > 1e11 ? Math.floor(n / 1000) : Math.floor(n);
}

/**
 * Lấy Access Token còn hạn sử dụng; tự động refresh nếu sắp hoặc đã hết hạn
 * - Đồng bộ các request refresh chạy đồng thời (tránh race condition / gọi trùng)
 * - Tự động dọn sạch phiên chết khi refresh token bị Supabase thu hồi (400/401)
 * @returns {Promise<string|null>}
 */
export async function getValidToken() {
  const session = getSession();
  if (!session || !session.access_token) return null;

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = normalizeExpiresAt(session.expires_at);

  // Nếu token còn hạn trên 60 giây, sử dụng trực tiếp
  if (expiresAt && expiresAt - now > 60) {
    return session.access_token;
  }

  // Không có refresh token -> chỉ trả token cũ nếu chưa quá hạn
  if (!session.refresh_token) {
    return (expiresAt && expiresAt > now) ? session.access_token : null;
  }

  // Đồng bộ các yêu cầu refresh token chạy đồng thời (Mutex)
  if (!activeAdminRefreshPromise) {
    activeAdminRefreshPromise = (async () => {
      try {
        const currentSession = getSession() || session;
        if (!currentSession?.refresh_token) return null;

        const refreshRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ refresh_token: currentSession.refresh_token })
        });

        const refreshData = await refreshRes.json().catch(() => ({}));
        if (refreshRes.ok && refreshData.access_token) {
          const updatedSession = {
            ...currentSession,
            access_token: refreshData.access_token,
            refresh_token: refreshData.refresh_token || currentSession.refresh_token,
            expires_at: Math.floor(Date.now() / 1000) + (refreshData.expires_in || 3600)
          };
          saveSession(updatedSession);
          return updatedSession.access_token;
        }

        // Nếu Supabase trả về lỗi 400 hoặc 401 (Refresh token không hợp lệ hoặc đã bị revoke)
        if (refreshRes.status === 400 || refreshRes.status === 401) {
          console.warn('[AdminAuth] Refresh token không còn hợp lệ, xóa triệt để phiên làm việc.');
          clearSession({ clearUserSession: true });
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('vivu:auth-expired', {
              detail: { message: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.' }
            }));
          }
          return null;
        }
      } catch (err) {
        console.warn('[AdminAuth] Lỗi kết nối khi làm mới token:', err.message);
      } finally {
        activeAdminRefreshPromise = null;
      }
      return null;
    })();
  }

  const refreshedToken = await activeAdminRefreshPromise;
  if (refreshedToken) return refreshedToken;

  // Nếu refresh thất bại mà token cũ vẫn còn thời gian thực sự
  if (expiresAt && expiresAt > now) {
    return session.access_token;
  }

  return null;
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
  clearSession();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vivu:auth-logout', {
      detail: { message: 'Đã đăng xuất khỏi hệ thống.' }
    }));
  }

  if (session?.access_token && !session.access_token.startsWith('test-')) {
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
