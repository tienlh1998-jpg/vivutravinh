// api/community-events.js
// Endpoint quản lý Sự kiện & Workshop Cộng đồng (Community Events) - UGC & Vòng đời sự kiện
// Hỗ trợ GET (Public feed đã duyệt & Sự kiện của chính người tổ chức),
// POST (Đăng ký tổ chức sự kiện mới chờ duyệt), PATCH/DELETE (Quản lý hồ sơ sự kiện).

import {
  authenticateUser,
  sendJson,
  sendError,
  readBody,
  supabaseRequest,
  getClientIp
} from './_admin-auth.js';

const TABLE_NAME = 'community_events';
const MAX_PAYLOAD_SIZE = 64 * 1024; // 64KB
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 giờ
const MAX_EVENTS_PER_HOUR = 5;
const localRateLimitMap = new Map();

const VALID_CATEGORIES = new Set(['workshop', 'sports', 'community', 'ecology', 'cultural']);

function checkUserRateLimit(userIdOrIp) {
  const now = Date.now();
  const record = localRateLimitMap.get(userIdOrIp) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + RATE_LIMIT_WINDOW_MS;
  }
  if (record.count >= MAX_EVENTS_PER_HOUR) {
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
 * GET: Đọc danh sách sự kiện
 */
async function handleGet(request, response) {
  const url = new URL(request.url, 'http://localhost');
  const category = url.searchParams.get('category');
  const creatorId = url.searchParams.get('creator_id');
  const statusParam = url.searchParams.get('status') || 'approved';
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '30', 10), 1), 50);

  let userContext = null;
  const authHeader = request.headers['authorization'] || request.headers['Authorization'];
  if (authHeader) {
    userContext = await authenticateUser(request, response).catch(() => null);
  }

  // Khách chỉ được xem status = 'approved' trừ khi là chính người tạo hoặc admin
  let effectiveStatus = 'approved';
  if (statusParam !== 'approved') {
    const isOwner = userContext && creatorId && userContext.user.id === creatorId;
    const isAdmin = userContext && ['admin', 'moderator', 'editor'].includes(userContext.user.role);
    if (isOwner || isAdmin) {
      effectiveStatus = statusParam;
    } else {
      sendError(response, 403, 'FORBIDDEN', 'Bạn chỉ có thể xem danh sách sự kiện đã được phê duyệt công khai.');
      return;
    }
  }

  const isPrivileged = userContext && ['admin', 'moderator', 'editor'].includes(userContext.user.role);
  const isOwner = userContext && creatorId && userContext.user.id === creatorId;

  // Giới hạn cột trả về: Khách và thành viên khác KHÔNG được xem contact_phone, admin_notes, moderation_reason
  const selectColumns = (isPrivileged || isOwner)
    ? '*'
    : 'id,title,organizer,category,time_schedule,location,region,description,fee,fee_type,max_attendees,creator_name,status,created_at';

  let query = `${TABLE_NAME}?select=${selectColumns}&order=created_at.desc&limit=${limit}`;
  if (effectiveStatus !== 'all') {
    query += `&status=eq.${encodeURIComponent(effectiveStatus)}`;
  }
  if (category && category !== 'all') {
    query += `&category=eq.${encodeURIComponent(category)}`;
  }
  if (creatorId) {
    query += `&created_by=eq.${encodeURIComponent(creatorId)}`;
  }

  try {
    const rows = await supabaseRequest(query);
    const sanitized = (Array.isArray(rows) ? rows : []).map(e => {
      if (!isPrivileged && !isOwner) {
        const { contact_phone, admin_notes, moderation_reason, moderated_by, moderated_at, ...safe } = e;
        return safe;
      }
      return e;
    });
    sendJson(response, 200, {
      success: true,
      count: sanitized.length,
      events: sanitized
    });
  } catch (err) {
    console.warn('[CommunityEvents] Supabase query fallback:', err.message);
    sendJson(response, 200, {
      success: true,
      count: 0,
      events: []
    });
  }
}

/**
 * POST: Tạo hồ sơ sự kiện / workshop mới chờ duyệt
 */
async function handlePost(request, response) {
  const userContext = await authenticateUser(request, response);
  if (!userContext) return;

  const clientIp = getClientIp(request);
  const rateKey = userContext.user.id || clientIp;
  const rateLimit = checkUserRateLimit(rateKey);
  if (!rateLimit.allowed) {
    sendError(response, 429, 'RATE_LIMITED', `Bạn đã gửi quá nhiều sự kiện. Vui lòng thử lại sau ${rateLimit.waitMinutes} phút.`);
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

  const title = sanitizeText(body.title || body.eventTitle);
  const organizer = sanitizeText(body.organizer);
  const category = String(body.category || 'community').trim().toLowerCase();
  const timeSchedule = sanitizeText(body.time_schedule || body.datetime);
  const location = sanitizeText(body.location);
  const region = String(body.region || 'tp-tra-vinh').trim();
  const description = sanitizeText(body.description);
  const fee = sanitizeText(body.fee || 'Miễn phí');
  const feeType = String(body.fee_type || 'free').trim();
  const contactPhone = String(body.contact_phone || body.phone || '').trim();
  const maxAttendees = parseInt(body.max_attendees || '50', 10) || 50;

  // 1. Validation đầu vào
  if (!title || title.length < 3 || title.length > 150) {
    sendError(response, 400, 'INVALID_TITLE', 'Tên sự kiện phải từ 3 đến 150 ký tự.');
    return;
  }
  if (!organizer || organizer.length < 2 || organizer.length > 100) {
    sendError(response, 400, 'INVALID_ORGANIZER', 'Tên đơn vị / người tổ chức phải từ 2 đến 100 ký tự.');
    return;
  }
  if (!timeSchedule || timeSchedule.length < 3) {
    sendError(response, 400, 'INVALID_SCHEDULE', 'Thời gian tổ chức không được để trống.');
    return;
  }
  if (!location || location.length < 3) {
    sendError(response, 400, 'INVALID_LOCATION', 'Địa điểm tổ chức không được để trống.');
    return;
  }
  if (!VALID_CATEGORIES.has(category)) {
    sendError(response, 400, 'INVALID_CATEGORY', 'Lĩnh vực sự kiện không hợp lệ (workshop, sports, community, ecology, cultural).');
    return;
  }

  // 2. Tạo bản ghi sự kiện với status mặc định bắt buộc là pending
  const eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const creatorName = userContext.user.user_metadata?.display_name || userContext.user.email?.split('@')[0] || 'Thành viên Xứ Trà';

  const newEventRecord = {
    id: eventId,
    title,
    organizer,
    category,
    time_schedule: timeSchedule,
    location,
    region,
    description,
    fee,
    fee_type: feeType,
    max_attendees: maxAttendees,
    contact_phone: contactPhone,
    status: 'pending',
    created_by: userContext.user.id,
    creator_name: creatorName,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    await supabaseRequest(TABLE_NAME, {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(newEventRecord)
    });

    sendJson(response, 201, {
      success: true,
      message: 'Hồ sơ sự kiện đã được gửi và đang chờ Ban Quản Trị phê duyệt.',
      event: {
        id: eventId,
        title,
        organizer,
        category,
        time_schedule: timeSchedule,
        location,
        status: 'pending',
        created_at: newEventRecord.created_at
      }
    });
  } catch (err) {
    console.error('[CommunityEvents] Lỗi lưu sự kiện vào Supabase:', err.message);
    sendError(response, 500, 'DATABASE_ERROR', 'Không thể tạo hồ sơ sự kiện lúc này. Vui lòng thử lại sau.');
  }
}

/**
 * PATCH: Chỉnh sửa hoặc gửi lại sự kiện sau khi bị từ chối / nháp
 */
async function handlePatch(request, response) {
  const userContext = await authenticateUser(request, response);
  if (!userContext) return;

  const url = new URL(request.url, 'http://localhost');
  const eventId = url.searchParams.get('id');
  if (!eventId) {
    sendError(response, 400, 'MISSING_ID', 'Thiếu mã định danh sự kiện cần sửa (id).');
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
    const rows = await supabaseRequest(`${TABLE_NAME}?id=eq.${encodeURIComponent(eventId)}&select=*&limit=1`);
    const event = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!event) {
      sendError(response, 404, 'NOT_FOUND', 'Sự kiện không tồn tại.');
      return;
    }

    const isOwner = event.created_by === userContext.user.id;
    const isAdmin = ['admin', 'moderator', 'editor'].includes(userContext.user.role);

    if (!isOwner && !isAdmin) {
      sendError(response, 403, 'FORBIDDEN', 'Bạn không có quyền chỉnh sửa sự kiện này.');
      return;
    }

    if (!isAdmin && !['draft', 'rejected', 'pending'].includes(event.status)) {
      sendError(response, 400, 'CANNOT_EDIT', 'Chỉ có thể chỉnh sửa sự kiện khi đang ở bản nháp, chờ duyệt hoặc bị từ chối.');
      return;
    }

    const patch = {};
    if (body.title !== undefined) {
      const title = sanitizeText(body.title);
      if (title.length < 3 || title.length > 150) {
        sendError(response, 400, 'INVALID_TITLE', 'Tên sự kiện phải từ 3 đến 150 ký tự.');
        return;
      }
      patch.title = title;
    }
    if (body.organizer !== undefined) {
      const organizer = sanitizeText(body.organizer);
      if (organizer.length < 2 || organizer.length > 100) {
        sendError(response, 400, 'INVALID_ORGANIZER', 'Tên đơn vị / người tổ chức phải từ 2 đến 100 ký tự.');
        return;
      }
      patch.organizer = organizer;
    }
    if (body.category !== undefined) {
      const category = String(body.category).trim().toLowerCase();
      if (!VALID_CATEGORIES.has(category)) {
        sendError(response, 400, 'INVALID_CATEGORY', 'Lĩnh vực sự kiện không hợp lệ.');
        return;
      }
      patch.category = category;
    }
    if (body.time_schedule !== undefined || body.datetime !== undefined) {
      const timeSchedule = sanitizeText(body.time_schedule || body.datetime);
      if (timeSchedule.length < 3) {
        sendError(response, 400, 'INVALID_SCHEDULE', 'Thời gian tổ chức không được để trống.');
        return;
      }
      patch.time_schedule = timeSchedule;
    }
    if (body.location !== undefined) {
      const location = sanitizeText(body.location);
      if (location.length < 3) {
        sendError(response, 400, 'INVALID_LOCATION', 'Địa điểm tổ chức không được để trống.');
        return;
      }
      patch.location = location;
    }
    if (body.region !== undefined) patch.region = String(body.region).trim();
    if (body.description !== undefined) patch.description = sanitizeText(body.description);
    if (body.fee !== undefined) patch.fee = sanitizeText(body.fee);
    if (body.fee_type !== undefined) patch.fee_type = String(body.fee_type).trim();
    if (body.contact_phone !== undefined || body.phone !== undefined) patch.contact_phone = String(body.contact_phone || body.phone || '').trim();
    if (body.max_attendees !== undefined) patch.max_attendees = parseInt(body.max_attendees, 10) || 50;

    // Resubmit / đưa về pending khi tác giả sửa bài bị từ chối
    if (!isAdmin || body.submit_for_review === true || body.status === 'pending') {
      patch.status = 'pending';
    } else if (isAdmin && body.status) {
      patch.status = body.status;
    }

    patch.updated_at = new Date().toISOString();

    const updated = await supabaseRequest(`${TABLE_NAME}?id=eq.${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch)
    });

    sendJson(response, 200, {
      success: true,
      message: 'Cập nhật hồ sơ sự kiện thành công.',
      event: Array.isArray(updated) && updated.length > 0 ? updated[0] : { ...event, ...patch }
    });
  } catch (err) {
    console.error('[CommunityEvents] Error updating event:', err.message);
    sendError(response, 500, 'UPDATE_EVENT_FAILED', 'Không thể cập nhật hồ sơ sự kiện lúc này.');
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
