// js/auth.js
// Quản lý xác thực người dùng thật (End-User Supabase Auth) cho ViVuTraVinh
// Tuyệt đối không dùng localStorage giả lập danh tính; quản lý JWT Bearer token và refresh token.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './admin-auth.js';

export const USER_SESSION_KEY = 'vivu_user_session';

/**
 * Trích xuất an toàn payload từ chuỗi JWT
 * @param {string} token
 * @returns {object|null}
 */
export function getJwtPayload(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) {
      b64 += '=';
    }
    const jsonStr = typeof atob === 'function'
      ? decodeURIComponent(
          atob(b64)
            .split('')
            .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        )
      : (typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64').toString('utf8') : null);
    return jsonStr ? JSON.parse(jsonStr) : null;
  } catch {
    return null;
  }
}

/**
 * Đọc phiên đăng nhập hiện tại từ localStorage (có fallback sang phiên admin nếu cần)
 */
export function getUserSession() {
  try {
    const raw = localStorage.getItem(USER_SESSION_KEY);
    if (raw) return JSON.parse(raw);

    // Fallback: nếu chưa có vivu_user_session, kiểm tra vivu_admin_session để chia sẻ phiên
    const rawAdmin = sessionStorage.getItem('vivu_admin_session') || localStorage.getItem('vivu_admin_session');
    if (rawAdmin) return JSON.parse(rawAdmin);

    return null;
  } catch {
    return null;
  }
}

/**
 * Lưu phiên đăng nhập người dùng
 */
export function saveUserSession(session) {
  try {
    localStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
    window.dispatchEvent(new CustomEvent('vivu:user-auth-changed', { detail: { session } }));
  } catch (err) {
    console.error('[UserAuth] Không thể lưu phiên:', err);
  }
}

/**
 * Xóa phiên đăng nhập người dùng và dọn sạch phiên admin đi kèm
 */
export function clearUserSession() {
  try {
    localStorage.removeItem(USER_SESSION_KEY);
    sessionStorage.removeItem('vivu_admin_session');
    localStorage.removeItem('vivu_admin_session');
    window.dispatchEvent(new CustomEvent('vivu:user-auth-changed', { detail: { session: null } }));
  } catch (err) {
    console.error('[UserAuth] Không thể xóa phiên:', err);
  }
}

let activeUserRefreshPromise = null;

/**
 * Lấy Access Token còn hạn; tự động làm mới nếu sắp hết hạn
 * - Đồng bộ các request refresh chạy đồng thời (tránh race condition / gọi trùng)
 * - Tuyệt đối không trả về token đã hết hạn nếu refresh thất bại
 */
export async function getValidUserToken() {
  const session = getUserSession();
  if (!session || !session.access_token) return null;

  const now = Math.floor(Date.now() / 1000);
  // Token còn hạn nhiều hơn 60s -> dùng an toàn
  if (session.expires_at && session.expires_at - now > 60) {
    return session.access_token;
  }

  // Không có refresh token -> chỉ trả token cũ nếu chưa hết hạn
  if (!session.refresh_token) {
    return (session.expires_at && session.expires_at > now) ? session.access_token : null;
  }

  // Đồng bộ các yêu cầu refresh token chạy đồng thời
  if (!activeUserRefreshPromise) {
    activeUserRefreshPromise = (async () => {
      try {
        const currentSession = getUserSession() || session;
        if (!currentSession?.refresh_token) return null;

        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ refresh_token: currentSession.refresh_token })
        });

        if (res.ok) {
          const refreshed = await res.json();
          const updatedSession = {
            ...currentSession,
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token || currentSession.refresh_token,
            expires_at: Math.floor(Date.now() / 1000) + (refreshed.expires_in || 3600),
            user: refreshed.user || currentSession.user
          };
          saveUserSession(updatedSession);
          try {
            const rawAdmin = sessionStorage.getItem('vivu_admin_session') || localStorage.getItem('vivu_admin_session');
            if (rawAdmin) {
              const parsedAdmin = JSON.parse(rawAdmin);
              if (parsedAdmin?.user?.id === updatedSession.user?.id) {
                const strAdmin = JSON.stringify({ ...parsedAdmin, access_token: updatedSession.access_token, refresh_token: updatedSession.refresh_token, expires_at: updatedSession.expires_at });
                sessionStorage.setItem('vivu_admin_session', strAdmin);
                localStorage.setItem('vivu_admin_session', strAdmin);
              }
            }
          } catch (_) {}
          return updatedSession.access_token;
        } else {
          console.warn('[UserAuth] Refresh token endpoint trả về lỗi:', res.status);
          return null;
        }
      } catch (e) {
        console.warn('[UserAuth] Refresh token thất bại:', e.message);
        return null;
      } finally {
        activeUserRefreshPromise = null;
      }
    })();
  }

  const refreshedToken = await activeUserRefreshPromise;
  if (refreshedToken) {
    return refreshedToken;
  }

  // Refresh thất bại: Kiểm tra token cũ có còn hạn hay không, TUYỆT ĐỐI không trả token đã hết hạn
  const latestSession = getUserSession();
  const currentTime = Math.floor(Date.now() / 1000);
  if (latestSession && latestSession.expires_at && latestSession.expires_at > currentTime) {
    return latestSession.access_token;
  }

  return null;
}

/**
 * Đăng ký tài khoản người dùng mới qua Supabase Auth
 */
export async function signUpWithEmail(email, password, displayName = '') {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPassword = String(password || '');
  const cleanName = String(displayName || '').trim() || cleanEmail.split('@')[0];

  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Email không hợp lệ.');
  }
  if (cleanPassword.length < 6) {
    throw new Error('Mật khẩu phải có ít nhất 6 ký tự.');
  }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY
    },
    body: JSON.stringify({
      email: cleanEmail,
      password: cleanPassword,
      data: {
        display_name: cleanName
      }
    })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.msg || data.message || 'Đăng ký thất bại.');
  }

  if (data.access_token) {
    const session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      user: data.user
    };
    saveUserSession(session);
  }

  return data;
}

/**
 * Đăng nhập người dùng bằng email và mật khẩu
 */
export async function signInWithEmail(email, password) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPassword = String(password || '');

  if (!cleanEmail || !cleanPassword) {
    throw new Error('Vui lòng nhập đầy đủ email và mật khẩu.');
  }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY
    },
    body: JSON.stringify({
      email: cleanEmail,
      password: cleanPassword
    })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.msg || data.message || 'Email hoặc mật khẩu không chính xác.');
  }

  const session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    user: data.user
  };
  saveUserSession(session);
  return session;
}

/**
 * Đăng xuất
 */
export async function signOutUser() {
  const token = await getValidUserToken();
  if (token) {
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (_) {}
  }
  clearUserSession();
}

/**
 * Lấy hồ sơ người dùng từ bảng public.profiles
 */
export async function fetchUserProfile(userId) {
  if (!userId) return null;
  try {
    const token = await getValidUserToken();
    const headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const endpoint = token ? 'profiles' : 'public_profiles';
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}?id=eq.${encodeURIComponent(userId)}&select=*&limit=1`, {
      headers
    });
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0) return rows[0];
    }

    // Nếu là user xem profile của người khác (bị RLS profiles_self_read chặn), fallback sang public_profiles
    if (token) {
      const fallbackRes = await fetch(`${SUPABASE_URL}/rest/v1/public_profiles?id=eq.${encodeURIComponent(userId)}&select=*&limit=1`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      });
      if (fallbackRes.ok) {
        const rows = await fallbackRes.json();
        return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      }
    }
  } catch (err) {
    console.warn('[UserAuth] Không thể tải profile:', err.message);
  }
  return null;
}
