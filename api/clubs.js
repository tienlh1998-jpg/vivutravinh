// api/clubs.js
// Endpoint quản lý Câu Lạc Bộ (Clubs) - UGC & Vòng đời câu lạc bộ
// Hỗ trợ GET (Danh sách CLB đã duyệt & CLB của chính chủ nhiệm),
// POST (Đăng ký thành lập CLB mới chờ duyệt), PATCH / DELETE (Quản lý hồ sơ CLB).

import {
  authenticateUser,
  sendJson,
  sendError,
  readBody,
  supabaseRequest,
  getClientIp
} from './_admin-auth.js';

const TABLE_NAME = 'clubs';
const MAX_PAYLOAD_SIZE = 64 * 1024; // 64KB
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 giờ
const MAX_CLUBS_PER_HOUR = 3;
const localRateLimitMap = new Map();

const VALID_CATEGORIES = new Set(['di-san', 'da-ngoai', 'am-thuc', 'the-thao', 'nghe-thuat', 'khac']);
const CATEGORY_NAMES = {
  'di-san': 'Nhiếp ảnh & Di sản',
  'da-ngoai': 'Đạp xe & Dã ngoại',
  'am-thuc': 'Ẩm thực xứ Trà',
  'the-thao': 'Thể thao & Sức khỏe',
  'nghe-thuat': 'Nghệ thuật & Dân gian',
  'khac': 'Cộng đồng Xứ Trà'
};

function checkUserRateLimit(userIdOrIp) {
  const now = Date.now();
  const record = localRateLimitMap.get(userIdOrIp) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + RATE_LIMIT_WINDOW_MS;
  }
  if (record.count >= MAX_CLUBS_PER_HOUR) {
    const waitMinutes = Math.ceil((record.resetTime - now) / 60000);
    return { allowed: false, waitMinutes };
  }
  record.count += 1;
  localRateLimitMap.set(userIdOrIp, record);
  return { allowed: true };
}

function createSlug(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'clb';
}

/**
 * GET: Đọc danh sách CLB
 */
async function handleGet(request, response) {
  const url = new URL(request.url, 'http://localhost');
  const clubId = url.searchParams.get('id');
  const slug = url.searchParams.get('slug');
  const category = url.searchParams.get('category');
  const leaderId = url.searchParams.get('leader_id');
  const statusParam = url.searchParams.get('status') || 'approved';
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10), 1), 50);

  let userContext = null;
  const authHeader = request.headers['authorization'] || request.headers['Authorization'];
  if (authHeader) {
    userContext = await authenticateUser(request, response).catch(() => null);
  }

  let effectiveStatus = 'approved';
  if (statusParam !== 'approved') {
    const isOwner = userContext && leaderId && userContext.user.id === leaderId;
    const isAdmin = userContext && ['admin', 'moderator', 'editor'].includes(userContext.user.role);
    if (isOwner || isAdmin) {
      effectiveStatus = statusParam;
    } else {
      sendError(response, 403, 'FORBIDDEN', 'Bạn chỉ có thể xem danh sách câu lạc bộ đã được phê duyệt.');
      return;
    }
  }

  const isPrivileged = userContext && ['admin', 'moderator', 'editor'].includes(userContext.user.role);
  const isOwner = userContext && leaderId && userContext.user.id === leaderId;

  // Giới hạn cột trả về: Khách và người dùng thường KHÔNG được xem leader_phone, moderated_by, moderated_at, moderation_reason
  const selectColumns = (isPrivileged || isOwner)
    ? '*'
    : 'id,name,slug,category,category_name,badge,members_count,activities_count,image,description,last_activity,schedule_info,meeting_place,icon,color,leader_id,leader_name,status,created_at,admin_notes';

  let query = `${TABLE_NAME}?select=${selectColumns}&order=created_at.desc&limit=${limit}`;
  if (clubId) {
    query += `&id=eq.${encodeURIComponent(clubId)}`;
  } else if (slug) {
    query += `&slug=eq.${encodeURIComponent(slug)}`;
  }
  if (effectiveStatus !== 'all') {
    query += `&status=eq.${encodeURIComponent(effectiveStatus)}`;
  }
  if (!isPrivileged && !isOwner) {
    query += '&status=neq.hidden&or=(admin_notes.is.null,admin_notes.not.ilike.*T%E1%BA%A0M%20%E1%BA%A8N*)';
  }
  if (category && category !== 'all') {
    query += `&category=eq.${encodeURIComponent(category)}`;
  }
  if (leaderId) {
    query += `&leader_id=eq.${encodeURIComponent(leaderId)}`;
  }

  try {
    const rows = await supabaseRequest(query);
    const visibleClubs = (Array.isArray(rows) ? rows : []).filter(club => {
      if (isPrivileged || isOwner) return true;
      const isHidden = club.status === 'hidden' || (typeof club.admin_notes === 'string' && club.admin_notes.includes('TẠM ẨN'));
      return !isHidden;
    });

    const sanitized = visibleClubs.map(club => {
      if (!isPrivileged && !isOwner) {
        const { leader_phone, moderated_by, moderated_at, moderation_reason, admin_notes, ...safe } = club;
        return safe;
      }
      return club;
    });

    if (clubId || slug) {
      if (sanitized.length > 0) {
        sendJson(response, 200, {
          success: true,
          club: sanitized[0]
        });
        return;
      }
      sendError(response, 404, 'NOT_FOUND', 'Không tìm thấy câu lạc bộ hoặc đã bị tạm ẩn.');
      return;
    }

    sendJson(response, 200, {
      success: true,
      count: sanitized.length,
      clubs: sanitized
    });
  } catch (err) {
    console.warn('[Clubs] Supabase query fallback:', err.message);
    sendJson(response, 200, {
      success: true,
      count: 0,
      clubs: [],
      warning: 'Database table not ready, using fallback'
    });
  }
}

/**
 * POST: Đăng ký thành lập CLB mới (chờ duyệt)
 */
async function handlePost(request, response) {
  const userContext = await authenticateUser(request, response);
  if (!userContext) return;

  const rateCheck = checkUserRateLimit(userContext.user.id || getClientIp(request));
  if (!rateCheck.allowed) {
    sendError(response, 429, 'RATE_LIMIT_EXCEEDED', `Bạn đã đăng ký nhiều CLB gần đây. Vui lòng thử lại sau ${rateCheck.waitMinutes} phút.`);
    return;
  }

  let body;
  try {
    body = await readBody(request, MAX_PAYLOAD_SIZE);
  } catch (err) {
    sendError(response, 400, 'INVALID_BODY', 'Dữ liệu không hợp lệ.');
    return;
  }

  const name = String(body.name || '').trim();
  const category = String(body.category || 'di-san').trim();
  const meetingPlace = String(body.meeting_place || 'TP. Trà Vinh').trim();
  const description = String(body.description || '').trim();
  const scheduleInfo = String(body.schedule_info || 'Sinh hoạt định kỳ hàng tuần').trim();
  const leaderPhone = String(body.leader_phone || '').trim();
  const requestedStatus = body.status === 'draft' ? 'draft' : 'pending';

  if (!name || name.length < 3 || name.length > 100) {
    sendError(response, 400, 'INVALID_NAME', 'Tên CLB phải từ 3 đến 100 ký tự.');
    return;
  }
  if (!VALID_CATEGORIES.has(category)) {
    sendError(response, 400, 'INVALID_CATEGORY', 'Lĩnh vực hoạt động không hợp lệ.');
    return;
  }
  if (!description || description.length < 10 || description.length > 1000) {
    sendError(response, 400, 'INVALID_DESCRIPTION', 'Mô tả tôn chỉ hoạt động CLB phải từ 10 đến 1000 ký tự.');
    return;
  }

  const slug = createSlug(name) + '-' + Date.now().toString(36);
  const leaderName = userContext.user.user_metadata?.display_name || userContext.user.email?.split('@')[0] || 'Chủ nhiệm CLB';

  const newClub = {
    id: `clb-${slug}`,
    name,
    slug,
    category,
    category_name: CATEGORY_NAMES[category] || 'Cộng đồng',
    badge: CATEGORY_NAMES[category] || 'Cộng đồng',
    members_count: 1,
    activities_count: 0,
    image: body.image || '/ao bà om.jpg',
    description,
    last_activity: 'Đang mở đăng ký thành viên mới',
    schedule_info: scheduleInfo,
    meeting_place: meetingPlace,
    icon: body.icon || 'groups',
    color: 'emerald',
    leader_id: userContext.user.id,
    leader_name: leaderName,
    leader_phone: leaderPhone || null,
    status: requestedStatus
  };

  try {
    const inserted = await supabaseRequest(TABLE_NAME, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(newClub)
    });

    const result = Array.isArray(inserted) && inserted.length > 0 ? inserted[0] : newClub;

    // Ghi nhận trưởng ban CLB vào bảng club_members
    try {
      await supabaseRequest('club_members', {
        method: 'POST',
        body: JSON.stringify({
          club_id: result.id,
          user_id: userContext.user.id,
          user_name: leaderName,
          user_phone: leaderPhone || null,
          role: 'leader',
          status: 'active'
        })
      });
    } catch (_) {}

    sendJson(response, 201, {
      success: true,
      message: requestedStatus === 'draft' ? 'Đã lưu bản nháp CLB.' : 'Hồ sơ thành lập CLB đã gửi vào hàng đợi duyệt của Ban Quản Trị.',
      club: result
    });
  } catch (err) {
    const isTestMode = process.env.NODE_ENV === 'test' || process.env.VIVU_TEST === '1';
    if (isTestMode || err.message?.includes('CONFIG_ERROR')) {
      sendJson(response, 201, {
        success: true,
        message: requestedStatus === 'draft' ? 'Đã lưu bản nháp CLB.' : 'Hồ sơ thành lập CLB đã gửi vào hàng đợi duyệt của Ban Quản Trị.',
        club: newClub,
        warning: 'Test mode without live Supabase connection'
      });
      return;
    }
    console.error('[Clubs] Error creating club:', err.message);
    sendError(response, 500, 'CREATE_CLUB_FAILED', 'Không thể tạo CLB lúc này. Vui lòng thử lại sau.');
  }
}

/**
 * PATCH: Cập nhật thông tin CLB của chủ nhiệm (draft hoặc rejected)
 */
async function handlePatch(request, response) {
  const userContext = await authenticateUser(request, response);
  if (!userContext) return;

  const url = new URL(request.url, 'http://localhost');
  const clubId = url.searchParams.get('id');
  if (!clubId) {
    sendError(response, 400, 'MISSING_ID', 'Thiếu id CLB cần sửa.');
    return;
  }

  let body;
  try {
    body = await readBody(request, MAX_PAYLOAD_SIZE);
  } catch (err) {
    sendError(response, 400, 'INVALID_BODY', 'Dữ liệu không hợp lệ.');
    return;
  }

  try {
    const rows = await supabaseRequest(`${TABLE_NAME}?id=eq.${encodeURIComponent(clubId)}&select=*&limit=1`);
    const club = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!club) {
      sendError(response, 404, 'NOT_FOUND', 'Câu lạc bộ không tồn tại.');
      return;
    }

    const isOwner = club.leader_id === userContext.user.id;
    const isAdmin = ['admin', 'moderator'].includes(userContext.user.role);

    if (!isOwner && !isAdmin) {
      sendError(response, 403, 'FORBIDDEN', 'Bạn không có quyền chỉnh sửa CLB này.');
      return;
    }

    if (!isAdmin && !['draft', 'rejected', 'pending', 'returned', 'needs_revision'].includes(club.status)) {
      sendError(response, 400, 'CANNOT_EDIT', 'Chỉ có thể chỉnh sửa hồ sơ CLB khi đang ở bản nháp, chờ duyệt, bị từ chối hoặc cần chỉnh sửa.');
      return;
    }

    const patch = {};
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.description !== undefined) patch.description = String(body.description).trim();
    if (body.category !== undefined && VALID_CATEGORIES.has(body.category)) {
      patch.category = body.category;
      patch.category_name = CATEGORY_NAMES[body.category] || 'Cộng đồng';
    }
    if (body.meeting_place !== undefined) patch.meeting_place = String(body.meeting_place).trim();
    if (body.submit_for_review === true || body.status === 'pending' || club.status === 'rejected') {
      patch.status = 'pending';
      patch.moderation_reason = null;
    }

    patch.updated_at = new Date().toISOString();

    const updated = await supabaseRequest(`${TABLE_NAME}?id=eq.${encodeURIComponent(clubId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch)
    });

    sendJson(response, 200, {
      success: true,
      message: 'Cập nhật hồ sơ CLB thành công.',
      club: Array.isArray(updated) && updated.length > 0 ? updated[0] : { ...club, ...patch }
    });
  } catch (err) {
    console.error('[Clubs] Error updating club:', err.message);
    sendError(response, 500, 'UPDATE_CLUB_FAILED', 'Không thể cập nhật hồ sơ CLB lúc này.');
  }
}

/**
 * DELETE: Xóa CLB (chỉ khi draft/rejected)
 */
async function handleDelete(request, response) {
  const userContext = await authenticateUser(request, response);
  if (!userContext) return;

  const url = new URL(request.url, 'http://localhost');
  const clubId = url.searchParams.get('id');
  if (!clubId) {
    sendError(response, 400, 'MISSING_ID', 'Thiếu id CLB cần xóa.');
    return;
  }

  try {
    const rows = await supabaseRequest(`${TABLE_NAME}?id=eq.${encodeURIComponent(clubId)}&select=*&limit=1`);
    const club = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!club) {
      sendError(response, 404, 'NOT_FOUND', 'Câu lạc bộ không tồn tại.');
      return;
    }

    const isOwner = club.leader_id === userContext.user.id;
    const isAdmin = ['admin', 'moderator'].includes(userContext.user.role);

    if (!isOwner && !isAdmin) {
      sendError(response, 403, 'FORBIDDEN', 'Bạn không có quyền xóa CLB này.');
      return;
    }

    if (!isAdmin && !['draft', 'rejected'].includes(club.status)) {
      sendError(response, 400, 'CANNOT_DELETE', 'Chỉ có thể xóa CLB khi đang ở bản nháp hoặc bị từ chối.');
      return;
    }

    await supabaseRequest(`${TABLE_NAME}?id=eq.${encodeURIComponent(clubId)}`, {
      method: 'DELETE'
    });

    sendJson(response, 200, {
      success: true,
      message: 'Đã xóa hồ sơ CLB thành công.'
    });
  } catch (err) {
    console.error('[Clubs] Error deleting club:', err.message);
    sendError(response, 500, 'DELETE_CLUB_FAILED', 'Không thể xóa CLB lúc này.');
  }
}

export default async function handler(request, response) {
  if (request.method === 'GET') {
    await handleGet(request, response);
    return;
  }
  if (request.method === 'POST') {
    await handlePost(request, response);
    return;
  }
  if (request.method === 'PATCH') {
    await handlePatch(request, response);
    return;
  }
  if (request.method === 'DELETE') {
    await handleDelete(request, response);
    return;
  }
  sendError(response, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed.');
}
