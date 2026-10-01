// api/submit-rsvp.js
// Tiếp nhận đăng ký vé khán đài miễn phí (Ok Om Bok 2026) - NVT7
// Rate Limit theo IP, validate số điện thoại VN, sinh mã vé OKB-2026-XXXX,
// ghi bản ghi vào bảng public.event_rsvps trên Supabase bằng service_role_key.

import crypto from 'crypto';
import {
  authenticateUser,
  sendJson,
  sendError
} from './_admin-auth.js';

const TABLE_NAME = 'event_rsvps';
const MAX_PAYLOAD_SIZE = 16 * 1024; // 16KB
const RATE_LIMIT_WINDOW_SECONDS = 300;   // 5 phút
const MAX_REQUESTS_PER_WINDOW = 5;       // tối đa 5 vé / 5 phút / IP
const MIN_INTERVAL_SECONDS = 20;         // nghỉ 20s giữa 2 lần gửi

const ALLOWED_SECTORS = new Set(['long-binh', 'ao-ba-om', 'combo']);
const ALLOWED_EVENT_SLUGS = new Set(['ok-om-bok-2026']);
const TICKET_CODE_REGEX = /^OKB-2026-[A-HJ-NP-Z2-9]{4}$/;

// VN phone: 0xxxxxxxxx (10 số, đầu 03/05/07/08/09) hoặc +84xxxxxxxxx
const VN_PHONE_REGEX = /^(?:0|\+84)(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])\d{7}$/;

const MAX_LOCAL_CACHE_ENTRIES = 500;
const localRateLimitMap = new Map();

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
    const timeSinceLast = now - record.timestamps[record.timestamps.length - 1];
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

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are not configured.');
  }

  return {
    baseUrl: supabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
    serviceRoleKey,
  };
}

async function supabaseRequest(path, options = {}) {
  const { baseUrl, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Supabase error: ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

/**
 * Rate limit phân tán qua Supabase RPC check_and_record_rate_limit
 * (thống nhất trên toàn bộ instance serverless), fallback local chỉ dành cho DEV/TEST.
 */
async function checkDistributedRateLimit(ip) {
  try {
    const rpcResult = await supabaseRequest('rpc/check_and_record_rate_limit', {
      method: 'POST',
      body: JSON.stringify({
        p_key: `rsvp_ip_${ip}`,
        p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
        p_max_requests: MAX_REQUESTS_PER_WINDOW,
        p_min_interval_seconds: MIN_INTERVAL_SECONDS
      })
    });

    if (rpcResult && typeof rpcResult.allowed === 'boolean') {
      return rpcResult;
    }
  } catch (err) {
    const isDevOrTest = process.env.NODE_ENV === 'test' ||
                        process.env.NODE_ENV === 'development' ||
                        process.env.ALLOW_LOCAL_RATE_LIMIT_FALLBACK === 'true';

    if (!isDevOrTest) {
      console.error('[RSVP RateLimit RPC Error]', err.message);
      const error = new Error('Dịch vụ kiểm tra giới hạn tần suất tạm thời không khả dụng. Vui lòng thử lại sau.');
      error.status = 503;
      error.code = 'RATE_LIMIT_UNAVAILABLE';
      throw error;
    }

    console.warn('[RSVP RateLimit RPC Fallback] Sử dụng local cache fallback (chế độ DEV/TEST):', err.message);
  }

  const localCheck = checkLocalRateLimit(ip);
  if (localCheck.allowed) {
    recordLocalSubmission(ip);
  }
  return localCheck;
}

async function readBody(request, limit = MAX_PAYLOAD_SIZE) {
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
    const chunkBuf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += chunkBuf.length;
    if (size > limit) {
      throw new Error('PAYLOAD_TOO_LARGE');
    }
    chunks.push(chunkBuf);
  }

  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Chuẩn hóa số điện thoại Việt Nam về dạng +84xxxxxxxxx */
function normalizePhone(raw) {
  const trimmed = String(raw || '').replace(/[\s.\-()]/g, '');
  if (!VN_PHONE_REGEX.test(trimmed)) {
    throw { code: 'INVALID_PHONE', message: 'Số điện thoại Việt Nam không hợp lệ (VD: 0901234567 hoặc +84901234567).' };
  }
  return trimmed.replace(/^0/, '+84');
}

function validatePayload(body) {
  const fullname = String(body.fullname || '').trim();
  const sector = String(body.sector || '').trim();
  const eventSlug = String(body.event_slug || 'ok-om-bok-2026').trim();
  const clientRsvpId = String(body.client_rsvp_id || '').trim();
  const clientTicketCode = String(body.ticket_code || '').trim();
  const clientSeat = String(body.seat || '').trim();

  if (!fullname || fullname.length < 2 || fullname.length > 80) {
    throw { code: 'INVALID_FULLNAME', message: 'Họ và tên phải từ 2 đến 80 ký tự.' };
  }
  if (!ALLOWED_SECTORS.has(sector)) {
    throw { code: 'INVALID_SECTOR', message: 'Khu vực khán đài không hợp lệ (long-binh | ao-ba-om | combo).' };
  }
  if (!ALLOWED_EVENT_SLUGS.has(eventSlug)) {
    throw { code: 'INVALID_EVENT', message: 'Sự kiện không được hỗ trợ đăng ký vé.' };
  }
  if (!clientRsvpId || clientRsvpId.length > 128) {
    throw { code: 'INVALID_CLIENT_RSVP_ID', message: 'Thiếu mã idempotency (client_rsvp_id).' };
  }
  // Nếu client tự sinh mã vé (offline-first), kiểm tra định dạng chặt để chống giả mạo
  if (clientTicketCode && !TICKET_CODE_REGEX.test(clientTicketCode)) {
    throw { code: 'INVALID_TICKET_CODE', message: 'Định dạng mã vé không hợp lệ.' };
  }

  const phone = normalizePhone(body.phone);

  return {
    fullname,
    phone,
    sector,
    event_slug: eventSlug,
    client_rsvp_id: clientRsvpId,
    client_ticket_code: clientTicketCode || null,
    client_seat: clientSeat || null
  };
}

/** Sinh mã vé server-side OKB-2026-XXXX (loại ký tự dễ nhầm O/0, I/1) */
function generateTicketCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `OKB-2026-${suffix}`;
}

/** Sinh số ghế ngẫu nhiên A/B/C, hàng 1-20, chỗ 01-40 */
function generateSeat() {
  const row = ['A', 'B', 'C'][Math.floor(Math.random() * 3)];
  const num1 = 1 + Math.floor(Math.random() * 20);
  const num2 = 1 + Math.floor(Math.random() * 40);
  return `${row}${num1}-${String(num2).padStart(2, '0')}`;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return sendError(response, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed. Use POST.');
  }

  const ip = getClientIp(request);

  // Đọc ngữ cảnh người dùng đăng nhập nếu có (Supabase Auth Bearer)
  let userContext = null;
  const authHeader = request.headers['authorization'] || request.headers['Authorization'];
  if (authHeader) {
    userContext = await authenticateUser(request, response).catch(() => null);
    if (!userContext) {
      // authenticateUser đã gửi response 401 hoặc lỗi tương ứng. Dừng xử lý ngay lập tức!
      if (!response.headersSent) {
        return sendError(response, 401, 'UNAUTHENTICATED', 'Phiên làm việc không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.');
      }
      return;
    }
  }

  let rateLimitCheck;
  try {
    rateLimitCheck = await checkDistributedRateLimit(ip);
  } catch (rateErr) {
    if (rateErr.status === 503 || rateErr.code === 'RATE_LIMIT_UNAVAILABLE') {
      return sendError(
        response,
        503,
        'RATE_LIMIT_UNAVAILABLE',
        rateErr.message || 'Dịch vụ kiểm tra giới hạn tần suất tạm thời không khả dụng. Vui lòng thử lại sau.'
      );
    }
    throw rateErr;
  }

  if (!rateLimitCheck.allowed) {
    const waitSeconds = rateLimitCheck.wait_seconds || 20;
    return sendError(
      response,
      429,
      'RATE_LIMITED',
      `Bạn đang đăng ký vé quá nhanh. Vui lòng chờ ${waitSeconds} giây trước khi gửi tiếp.`,
      { 'Retry-After': String(waitSeconds) }
    );
  }

  let body;
  try {
    body = await readBody(request, MAX_PAYLOAD_SIZE);
  } catch (err) {
    if (err.message === 'PAYLOAD_TOO_LARGE') {
      return sendError(response, 413, 'PAYLOAD_TOO_LARGE', 'Nội dung yêu cầu vượt quá giới hạn 16KB.');
    }
    return sendError(response, 400, 'BAD_REQUEST', 'Định dạng JSON không hợp lệ.');
  }

  let validated;
  try {
    validated = validatePayload(body);
  } catch (valErr) {
    return sendError(response, 400, valErr.code || 'VALIDATION_ERROR', valErr.message || 'Dữ liệu không hợp lệ.');
  }

  function formatRsvpRecord(row, fallbackSeat = null, fallbackSector = null, includeClaimToken = null) {
    let parsed = {};
    if (row?.qr_data) {
      try {
        parsed = JSON.parse(row.qr_data);
      } catch (e) {}
    }
    const res = {
      id: row.id,
      ticket_code: row.ticket_code,
      client_rsvp_id: row.client_rsvp_id || null,
      fullname: row.attendee_name,
      phone: row.phone,
      stand_zone: row.stand_zone,
      sector: parsed.sector || fallbackSector || (row.stand_zone?.includes('Long Bình') ? 'long-binh' : 'ao-ba-om'),
      seat: parsed.seat || fallbackSeat || 'A1-01',
      status: row.status || 'confirmed',
      created_at: row.created_at
    };
    if (includeClaimToken) {
      res.claim_token = includeClaimToken;
    }
    return res;
  }

  /**
   * Xác minh quyền sở hữu vé:
   * 1. Bằng phiên đăng nhập (Supabase Auth Session) nếu userContext trùng user_id của vé.
   * 2. Bằng token bí mật do server cấp (Server-Issued Claim Token).
   * TUYỆT ĐỐI KHÔNG DÙNG HỌ TÊN VÀ SĐT LÀM BẰNG CHỨNG SỞ HỮU!
   */
  function verifyTicketOwnership(storedRow, requestBody, requestHeaders, currentAuthUser) {
    let parsed = {};
    if (storedRow?.qr_data) {
      try {
        parsed = JSON.parse(storedRow.qr_data);
      } catch (e) {}
    }

    // Cách 1: Xác minh qua phiên đăng nhập người dùng (User Auth Session)
    if (parsed.user_id && currentAuthUser?.user?.id) {
      if (parsed.user_id === currentAuthUser.user.id) {
        return { verified: true, method: 'auth_session' };
      }
    }

    // Cách 2: Xác minh qua token bí mật do server cấp (Server-Issued Claim Token)
    const clientClaimToken = requestBody?.claim_token ||
                             requestHeaders['x-ticket-claim-token'] ||
                             requestHeaders['x-claim-token'];

    if (clientClaimToken && typeof clientClaimToken === 'string' && parsed.claim_token_hash) {
      const providedHash = crypto.createHash('sha256').update(clientClaimToken.trim()).digest('hex');
      try {
        const isMatch = crypto.timingSafeEqual(
          Buffer.from(providedHash, 'hex'),
          Buffer.from(parsed.claim_token_hash, 'hex')
        );
        if (isMatch) {
          return { verified: true, method: 'claim_token' };
        }
      } catch {
        // Buffer length mismatch
      }
    }

    return { verified: false };
  }

  const SELECT_COLUMNS = 'id,event_id,client_rsvp_id,attendee_name,phone,stand_zone,ticket_code,qr_data,status,created_at';

  // Idempotency: nếu client_rsvp_id đã tồn tại, BẮT BUỘC XÁC MINH QUYỀN SỞ HỮU
  try {
    const existing = await supabaseRequest(
      `${TABLE_NAME}?client_rsvp_id=eq.${encodeURIComponent(validated.client_rsvp_id)}&select=${SELECT_COLUMNS}&limit=1`
    );
    if (Array.isArray(existing) && existing.length > 0) {
      const stored = existing[0];
      const ownership = verifyTicketOwnership(stored, body, request.headers, userContext);

      if (ownership.verified) {
        const clientClaimToken = body?.claim_token || request.headers['x-ticket-claim-token'] || request.headers['x-claim-token'];
        const formatted = formatRsvpRecord(stored, null, null, clientClaimToken);
        return sendJson(response, 200, {
          success: true,
          idempotent: true,
          status: formatted.status,
          data: formatted,
          message: `Đăng ký vé này đã được tiếp nhận trước đó. Mã vé: ${formatted.ticket_code}, ghế: ${formatted.seat}.`
        });
      }

      // Người biết đủ client_rsvp_id, họ tên và SĐT nhưng thiếu thông tin xác thực (không có token bí mật hoặc phiên đăng nhập)
      // -> BẮT BUỘC TỪ CHỐI HTTP 403, TUYỆT ĐỐI KHÔNG TRẢ VỀ DỮ LIỆU VÉ!
      return sendError(
        response,
        403,
        'UNAUTHORIZED_TICKET_ACCESS',
        'Từ chối truy cập: Thiếu token xác thực bí mật hoặc phiên đăng nhập của người sở hữu vé.'
      );
    }
  } catch (checkErr) {
    console.warn('[SubmitRsvp] Không thể kiểm tra idempotency, tiếp tục ghi mới:', checkErr.message);
  }

  // Xác thực duy nhất theo số điện thoại: Mỗi số điện thoại chỉ được đăng ký tối đa 1 vé cho sự kiện
  try {
    const phoneCheck = await supabaseRequest(
      `${TABLE_NAME}?phone=eq.${encodeURIComponent(validated.phone)}&event_id=eq.ok-om-bok&select=${SELECT_COLUMNS}&order=created_at.desc&limit=1`
    );
    if (Array.isArray(phoneCheck) && phoneCheck.length > 0) {
      const stored = phoneCheck[0];
      const ownership = verifyTicketOwnership(stored, body, request.headers, userContext);

      // Nếu có bằng chứng sở hữu xác thực (Auth session hoặc Claim token hợp lệ)
      if (ownership.verified) {
        const clientClaimToken = body?.claim_token || request.headers['x-ticket-claim-token'] || request.headers['x-claim-token'];
        const formatted = formatRsvpRecord(stored, null, null, clientClaimToken);
        return sendJson(response, 200, {
          success: true,
          idempotent: true,
          status: formatted.status,
          data: formatted,
          message: `Đăng ký vé này đã được tiếp nhận trước đó. Mã vé: ${formatted.ticket_code}, ghế: ${formatted.seat}.`
        });
      }

      // Số điện thoại đã được đăng ký nhưng request KHÔNG CHỨNG MINH ĐƯỢC QUYỀN SỞ HỮU (thiếu token / auth):
      // Tuyệt đối không trả về bất kỳ dữ liệu vé nào của người khác, trả về HTTP 409 DUPLICATE_REGISTRATION
      return sendError(
        response,
        409,
        'DUPLICATE_REGISTRATION',
        'Số điện thoại này đã được đăng ký vé trước đó. Mỗi số điện thoại chỉ được đăng ký tối đa 1 vé.'
      );
    }
  } catch (phoneErr) {
    console.warn('[SubmitRsvp] Lỗi kiểm tra số điện thoại:', phoneErr.message);
  }

  const ticketCode = validated.client_ticket_code || generateTicketCode();
  const seat = validated.client_seat || generateSeat();

  const standZoneMap = {
    'long-binh': 'Khán đài Sông Long Bình',
    'ao-ba-om': 'Khán đài Danh Thắng Ao Bà Om',
    'combo': 'Khán đài Danh Dự Combo'
  };
  const standZone = standZoneMap[validated.sector] || 'Khán đài A';

  // Sinh token bí mật do server cấp (32 bytes cryptographically secure)
  const serverClaimToken = 'clm_' + crypto.randomBytes(32).toString('hex');
  const claimTokenHash = crypto.createHash('sha256').update(serverClaimToken).digest('hex');

  const recordToInsert = {
    event_id: 'ok-om-bok',
    client_rsvp_id: validated.client_rsvp_id,
    attendee_name: validated.fullname,
    phone: validated.phone,
    email: typeof body.email === 'string' && body.email.trim() ? body.email.trim() : null,
    stand_zone: standZone,
    ticket_code: ticketCode,
    qr_data: JSON.stringify({
      ticket_code: ticketCode,
      seat,
      sector: validated.sector,
      event_slug: validated.event_slug,
      user_id: userContext?.user?.id || null,
      claim_token_hash: claimTokenHash
    }),
    status: 'confirmed'
  };

  try {
    const inserted = await supabaseRequest(TABLE_NAME, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(recordToInsert),
    });

    const rawSaved = Array.isArray(inserted) ? inserted[0] : inserted;
    if (rawSaved && !rawSaved.client_rsvp_id) {
      rawSaved.client_rsvp_id = validated.client_rsvp_id;
    }
    const saved = formatRsvpRecord(rawSaved, seat, validated.sector, serverClaimToken);
    return sendJson(response, 201, {
      success: true,
      status: 'confirmed',
      data: saved,
      message: `Đăng ký vé thành công! Mã vé ${ticketCode}, ghế ${seat}.`
    });
  } catch (dbErr) {
    if (/duplicate key|unique constraint|23505/i.test(dbErr.message)) {
      try {
        const existing = await supabaseRequest(
          `${TABLE_NAME}?client_rsvp_id=eq.${encodeURIComponent(validated.client_rsvp_id)}&select=${SELECT_COLUMNS}&limit=1`
        );
        if (Array.isArray(existing) && existing.length > 0) {
          const stored = existing[0];
          const ownership = verifyTicketOwnership(stored, body, request.headers, userContext);

          if (ownership.verified) {
            const clientClaimToken = body?.claim_token || request.headers['x-ticket-claim-token'] || request.headers['x-claim-token'];
            const actualSaved = formatRsvpRecord(stored, null, null, clientClaimToken);
            return sendJson(response, 200, {
              success: true,
              idempotent: true,
              status: actualSaved.status || 'confirmed',
              data: actualSaved,
              message: `Đăng ký vé này đã được tiếp nhận trước đó. Mã vé: ${actualSaved.ticket_code}, ghế: ${actualSaved.seat}.`
            });
          } else {
            return sendError(
              response,
              403,
              'UNAUTHORIZED_TICKET_ACCESS',
              'Từ chối truy cập: Thiếu token xác thực bí mật hoặc phiên đăng nhập của người sở hữu vé.'
            );
          }
        }
      } catch (lookupErr) {
        console.warn('[SubmitRsvp] Lỗi truy vấn vé trùng khóa:', lookupErr.message);
      }

      // Trùng số điện thoại hoặc mã vé -> 409 không rò rỉ dữ liệu
      return sendError(
        response,
        409,
        'DUPLICATE_REGISTRATION',
        'Thông tin đăng ký vé bị trùng lặp trong hệ thống (số điện thoại hoặc mã yêu cầu đã tồn tại).'
      );
    }

    console.error('[SubmitRsvp] Database insert error:', dbErr.message);
    return sendError(response, 500, 'DATABASE_ERROR', 'Không thể lưu đăng ký vé vào hệ thống lúc này. Vui lòng thử lại sau.');
  }
}
