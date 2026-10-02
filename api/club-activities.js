// api/club-activities.js
// Endpoint quản lý Lịch sinh hoạt CLB (Club Activities) - Vòng đời & Kiểm duyệt
// Hỗ trợ GET (Lịch sinh hoạt đã duyệt công khai & của chính chủ nhiệm),
// POST (Chủ nhiệm CLB tạo lịch sinh hoạt mới chờ Admin duyệt).
//
// NGUYÊN TẮC BẢO MẬT BẮT BUỘC:
// 1. Chỉ chủ nhiệm của CLB đã được duyệt (clubs.leader_id = auth.uid() AND clubs.status = 'approved')
//    mới được tạo lịch chính thức cho CLB đó.
// 2. Không tin club_name hay creator_role do client gửi lên:
//    API & Trigger tự động truy vấn tên thật từ public.clubs và gán cố định creator_role = 'Chủ nhiệm CLB'.

import {
  authenticateUser,
  sendJson,
  sendError,
  readBody,
  supabaseRequest,
  getClientIp
} from './_admin-auth.js';

const TABLE_NAME = 'club_activities';
const SECURE_VIEW = 'public_club_activities';
const MAX_PAYLOAD_SIZE = 64 * 1024; // 64KB
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 giờ
const MAX_ACTIVITIES_PER_HOUR = 6;
const localRateLimitMap = new Map();

function checkUserRateLimit(userIdOrIp) {
  const now = Date.now();
  const record = localRateLimitMap.get(userIdOrIp) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + RATE_LIMIT_WINDOW_MS;
  }
  if (record.count >= MAX_ACTIVITIES_PER_HOUR) {
    const waitMinutes = Math.ceil((record.resetTime - now) / 60000);
    return { allowed: false, waitMinutes };
  }
  record.count += 1;
  localRateLimitMap.set(userIdOrIp, record);
  return { allowed: true };
}

function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str.trim()
    .replace(/[<>]/g, '')
    .slice(0, 2000);
}

/**
 * GET: Lấy danh sách lịch sinh hoạt CLB
 */
async function handleGet(request, response) {
  const url = new URL(request.url, 'http://localhost');
  const clubId = url.searchParams.get('club_id');
  const creatorId = url.searchParams.get('creator_id');
  const statusParam = url.searchParams.get('status') || 'approved';
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '30', 10), 1), 50);

  let userContext = null;
  const authHeader = request.headers['authorization'] || request.headers['Authorization'];
  if (authHeader) {
    userContext = await authenticateUser(request, response).catch(() => null);
  }

  // Khách chỉ được xem status = 'approved' trừ khi là chính chủ nhiệm tạo hoặc admin
  let effectiveStatus = 'approved';
  if (statusParam !== 'approved') {
    const isOwner = userContext && creatorId && userContext.user.id === creatorId;
    const isAdmin = userContext && ['admin', 'moderator', 'editor'].includes(userContext.user.role);
    if (isOwner || isAdmin) {
      effectiveStatus = statusParam;
    } else {
      sendError(response, 403, 'FORBIDDEN', 'Bạn chỉ có thể xem lịch sinh hoạt đã được phê duyệt công khai.');
      return;
    }
  }

  const isPrivileged = userContext && ['admin', 'moderator', 'editor'].includes(userContext.user.role);
  const isOwner = userContext && creatorId && userContext.user.id === creatorId;

  // Lấy dữ liệu an toàn
  const targetSource = (isPrivileged || isOwner || effectiveStatus !== 'approved')
    ? TABLE_NAME
    : SECURE_VIEW;

  let query = `${targetSource}?order=created_at.desc&limit=${limit}`;
  if (targetSource === TABLE_NAME && effectiveStatus !== 'all') {
    query += `&status=eq.${encodeURIComponent(effectiveStatus)}`;
  }
  if (clubId && clubId !== 'all') {
    query += `&club_id=eq.${encodeURIComponent(clubId)}`;
  }
  if (creatorId) {
    query += `&creator_id=eq.${encodeURIComponent(creatorId)}`;
  }

  try {
    const rows = await supabaseRequest(query);
    const sanitized = (Array.isArray(rows) ? rows : []).map(act => {
      if (isPrivileged) {
        return act;
      }
      if (isOwner) {
        // Chủ nhiệm xem được lý do duyệt/từ chối nhưng TUYỆT ĐỐI KHÔNG thấy admin_notes
        const { admin_notes, moderated_by, moderated_at, ...ownerSafe } = act;
        return ownerSafe;
      }
      // Khách vãng lai và thành viên khác: Ẩn toàn bộ ghi chú nội bộ và lý do kiểm duyệt
      const { admin_notes, moderation_reason, moderated_by, moderated_at, ...publicSafe } = act;
      return publicSafe;
    });

    sendJson(response, 200, {
      success: true,
      count: sanitized.length,
      activities: sanitized
    });
  } catch (err) {
    console.warn('[ClubActivities] Supabase query fallback:', err.message);
    sendJson(response, 200, {
      success: true,
      count: 0,
      activities: []
    });
  }
}

/**
 * POST: Chủ nhiệm CLB đề xuất lịch sinh hoạt mới chờ Ban Quản Trị duyệt
 */
async function handlePost(request, response) {
  const userContext = await authenticateUser(request, response);
  if (!userContext) return;

  const clientIp = getClientIp(request);
  const rateKey = userContext.user.id || clientIp;
  const rateLimit = checkUserRateLimit(rateKey);
  if (!rateLimit.allowed) {
    sendError(response, 429, 'RATE_LIMITED', `Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau ${rateLimit.waitMinutes} phút.`);
    return;
  }

  let body;
  try {
    body = await readBody(request, MAX_PAYLOAD_SIZE);
  } catch (err) {
    if (err.message === 'PAYLOAD_TOO_LARGE') {
      sendError(response, 413, 'PAYLOAD_TOO_LARGE', 'Nội dung yêu cầu vượt quá giới hạn 64KB.');
      return;
    }
    sendError(response, 400, 'INVALID_JSON', 'Định dạng JSON không hợp lệ.');
    return;
  }

  const clubId = sanitizeText(body.club_id || body.clubId);
  const title = sanitizeText(body.title);
  const timeSchedule = sanitizeText(body.time_schedule || body.timeSchedule || body.time);
  const location = sanitizeText(body.location);
  const description = sanitizeText(body.description);
  const maxAttendees = Math.min(Math.max(parseInt(body.max_attendees || body.maxAttendees || '50', 10) || 50, 5), 500);
  const isFree = body.is_free !== undefined ? Boolean(body.is_free) : true;
  const icon = sanitizeText(body.icon || 'event') || 'event';

  // 1. Validation đầu vào cơ bản
  if (!clubId) {
    sendError(response, 400, 'INVALID_CLUB_ID', 'Mã câu lạc bộ (club_id) không được để trống.');
    return;
  }
  if (!title || title.length < 3 || title.length > 150) {
    sendError(response, 400, 'INVALID_TITLE', 'Tiêu đề buổi sinh hoạt phải từ 3 đến 150 ký tự.');
    return;
  }
  if (!timeSchedule || timeSchedule.length < 3) {
    sendError(response, 400, 'INVALID_SCHEDULE', 'Thời gian sinh hoạt không được để trống.');
    return;
  }
  if (!location || location.length < 3) {
    sendError(response, 400, 'INVALID_LOCATION', 'Địa điểm sinh hoạt không được để trống.');
    return;
  }

  // 2. BẢO MẬT CỐT LÕI: ĐỐI CHIẾU CHỦ NHIỆM & CLB ĐÃ ĐƯỢC DUYỆT TRONG DATABASE
  try {
    const clubRows = await supabaseRequest(`clubs?id=eq.${encodeURIComponent(clubId)}&select=id,name,status,leader_id`);
    if (!Array.isArray(clubRows) || clubRows.length === 0) {
      sendError(response, 404, 'CLUB_NOT_FOUND', 'Không tìm thấy câu lạc bộ tương ứng.');
      return;
    }

    const club = clubRows[0];

    // Điều kiện: CLB phải có status = 'approved'
    if (club.status !== 'approved') {
      sendError(response, 403, 'CLUB_NOT_APPROVED', 'Chỉ câu lạc bộ đã được phê duyệt chính thức mới có thể tạo lịch sinh hoạt.');
      return;
    }

    // Điều kiện: Người dùng đang gửi request phải là Chủ nhiệm của CLB (clubs.leader_id = auth.uid())
    if (!club.leader_id || club.leader_id !== userContext.user.id) {
      sendError(
        response,
        403,
        'FORBIDDEN_NOT_LEADER',
        'Chỉ chủ nhiệm của CLB đã được duyệt mới được tạo lịch chính thức cho CLB đó. Thành viên khác có thể gửi đề xuất qua luồng sự kiện cộng đồng.'
      );
      return;
    }

    // 3. KHÔNG TIN CẬY DỮ LIỆU TỪ CLIENT: Gán cố định từ DB và tài khoản đã xác thực
    const activityId = `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const creatorName = userContext.user.user_metadata?.display_name || userContext.user.email?.split('@')[0] || 'Chủ nhiệm CLB';

    const newActivityRecord = {
      id: activityId,
      club_id: club.id,
      club_name: club.name, // Lấy từ DB, không tin form
      title,
      time_schedule: timeSchedule,
      location,
      max_attendees: maxAttendees,
      attendees_count: 0,
      is_free: isFree,
      icon,
      description,
      creator_id: userContext.user.id,
      creator_name: creatorName,
      creator_role: 'Chủ nhiệm CLB', // Cố định vai trò
      status: 'pending',              // Luôn chờ Admin duyệt
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await supabaseRequest(TABLE_NAME, {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(newActivityRecord)
    });

    sendJson(response, 201, {
      success: true,
      message: 'Lịch sinh hoạt CLB đã được gửi và đang chờ Ban Quản Trị phê duyệt.',
      activity: {
        id: activityId,
        club_id: club.id,
        club_name: club.name,
        title,
        time_schedule: timeSchedule,
        location,
        status: 'pending',
        created_at: newActivityRecord.created_at
      }
    });
  } catch (err) {
    console.error('[ClubActivities] Lỗi kiểm tra / lưu hoạt động:', err.message);
    sendError(response, 500, 'DATABASE_ERROR', 'Không thể tạo lịch sinh hoạt lúc này. Vui lòng thử lại sau.');
  }
}

/**
 * PATCH: Chỉnh sửa hoặc gửi lại lịch sinh hoạt sau khi bị từ chối / nháp
 */
async function handlePatch(request, response) {
  const userContext = await authenticateUser(request, response);
  if (!userContext) return;

  const url = new URL(request.url, 'http://localhost');
  const activityId = url.searchParams.get('id');
  if (!activityId) {
    sendError(response, 400, 'MISSING_ID', 'Thiếu mã định danh lịch sinh hoạt cần sửa (id).');
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
    const rows = await supabaseRequest(`${TABLE_NAME}?id=eq.${encodeURIComponent(activityId)}&select=*&limit=1`);
    const activity = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!activity) {
      sendError(response, 404, 'NOT_FOUND', 'Lịch sinh hoạt không tồn tại.');
      return;
    }

    const isOwner = activity.creator_id === userContext.user.id;
    const isAdmin = ['admin', 'moderator', 'editor'].includes(userContext.user.role);

    if (!isOwner && !isAdmin) {
      sendError(response, 403, 'FORBIDDEN', 'Bạn không có quyền chỉnh sửa lịch sinh hoạt này.');
      return;
    }

    if (!isAdmin && !['draft', 'rejected', 'pending'].includes(activity.status)) {
      sendError(response, 400, 'CANNOT_EDIT', 'Chỉ có thể chỉnh sửa lịch sinh hoạt khi đang ở bản nháp, chờ duyệt hoặc bị từ chối.');
      return;
    }

    const patch = {};
    if (body.title !== undefined) {
      const title = sanitizeText(body.title);
      if (title.length < 3 || title.length > 150) {
        sendError(response, 400, 'INVALID_TITLE', 'Tiêu đề buổi sinh hoạt phải từ 3 đến 150 ký tự.');
        return;
      }
      patch.title = title;
    }
    if (body.time_schedule !== undefined || body.timeSchedule !== undefined || body.time !== undefined) {
      const timeSchedule = sanitizeText(body.time_schedule || body.timeSchedule || body.time);
      if (timeSchedule.length < 3) {
        sendError(response, 400, 'INVALID_SCHEDULE', 'Thời gian sinh hoạt không được để trống.');
        return;
      }
      patch.time_schedule = timeSchedule;
    }
    if (body.location !== undefined) {
      const location = sanitizeText(body.location);
      if (location.length < 3) {
        sendError(response, 400, 'INVALID_LOCATION', 'Địa điểm sinh hoạt không được để trống.');
        return;
      }
      patch.location = location;
    }
    if (body.description !== undefined) patch.description = sanitizeText(body.description);
    if (body.max_attendees !== undefined || body.maxAttendees !== undefined) {
      patch.max_attendees = Math.min(Math.max(parseInt(body.max_attendees || body.maxAttendees || '50', 10) || 50, 5), 500);
    }
    if (body.is_free !== undefined) patch.is_free = Boolean(body.is_free);
    if (body.icon !== undefined) patch.icon = sanitizeText(body.icon) || 'event';

    // Resubmit / đưa về pending khi tác giả sửa bài bị từ chối
    if (!isAdmin || body.submit_for_review === true || body.status === 'pending') {
      patch.status = 'pending';
      patch.moderation_reason = null;
    } else if (isAdmin && body.status) {
      patch.status = body.status;
    }

    patch.updated_at = new Date().toISOString();

    const updated = await supabaseRequest(`${TABLE_NAME}?id=eq.${encodeURIComponent(activityId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch)
    });

    sendJson(response, 200, {
      success: true,
      message: 'Cập nhật lịch sinh hoạt thành công.',
      activity: Array.isArray(updated) && updated.length > 0 ? updated[0] : { ...activity, ...patch }
    });
  } catch (err) {
    console.error('[ClubActivities] Error updating activity:', err.message);
    sendError(response, 500, 'UPDATE_ACTIVITY_FAILED', 'Không thể cập nhật lịch sinh hoạt lúc này.');
  }
}

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-secret');

  if (request.method === 'OPTIONS') {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (request.method === 'GET') {
    await handleGet(request, response);
  } else if (request.method === 'POST') {
    await handlePost(request, response);
  } else if (request.method === 'PATCH') {
    await handlePatch(request, response);
  } else {
    sendError(response, 405, 'METHOD_NOT_ALLOWED', 'Phương thức HTTP không được hỗ trợ.');
  }
}
