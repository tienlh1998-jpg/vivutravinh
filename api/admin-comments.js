const TABLE_NAME = 'place_comments';
const MAX_PAYLOAD_SIZE = 1024 * 1024; // 1MB

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, code, message) {
  sendJson(response, statusCode, {
    success: false,
    error: { code, message }
  });
}

const FAILED_ATTEMPTS_LIMIT = 5;
const LOCKOUT_PERIOD_MS = 15 * 60 * 1000;
const failedAttemptsMap = new Map();

function getClientIp(request) {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.socket?.remoteAddress || '127.0.0.1';
}

function checkAuthRateLimit(ip) {
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

function recordFailedAuth(ip, path) {
  const now = Date.now();
  const record = failedAttemptsMap.get(ip) || { count: 0, lastAttempt: now };
  record.count += 1;
  record.lastAttempt = now;
  failedAttemptsMap.set(ip, record);
  console.warn(`[AUDIT] Failed admin auth from IP ${ip} at ${new Date(now).toISOString()} on ${path} (${record.count}/${FAILED_ATTEMPTS_LIMIT})`);
}

function recordSuccessfulAuth(ip) {
  failedAttemptsMap.delete(ip);
}

function requireAdmin(request, response) {
  const ip = getClientIp(request);
  const rateCheck = checkAuthRateLimit(ip);
  if (!rateCheck.allowed) {
    sendError(response, 429, 'AUTH_RATE_LIMITED', `Quá nhiều lần thử xác thực thất bại. Vui lòng thử lại sau ${rateCheck.remainingMinutes} phút.`);
    return false;
  }

  const configuredSecret = process.env.ADMIN_SECRET;
  const providedSecret = request.headers['x-admin-secret'];

  if (!configuredSecret) {
    sendError(response, 500, 'CONFIG_ERROR', 'ADMIN_SECRET is not configured on server.');
    return false;
  }

  if (!providedSecret || providedSecret !== configuredSecret) {
    recordFailedAuth(ip, request.url || '/api/admin-comments');
    sendError(response, 401, 'UNAUTHORIZED', 'Unauthorized: Invalid or missing x-admin-secret.');
    return false;
  }

  recordSuccessfulAuth(ip);
  return true;
}

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase admin environment variables are not configured.');
  }

  return {
    baseUrl: supabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
    serviceRoleKey,
  };
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
    size += chunk.length;
    if (size > limit) {
      throw new Error('PAYLOAD_TOO_LARGE');
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
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
    throw new Error(message || `Supabase request failed: ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function listComments(request, response) {
  const url = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
  const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '100', 10), 200);
  const hidden = url.searchParams.get('hidden');
  const hiddenFilter = hidden === 'true' || hidden === 'false' ? `&is_hidden=eq.${hidden}` : '';
  const query = `${TABLE_NAME}?select=id,place_id,place_name,author_name,rating,comment_text,photo_url,photo_metadata,client_review_id,is_hidden,status,created_at${hiddenFilter}&order=created_at.desc&limit=${limit}`;
  const comments = await supabaseRequest(query);
  sendJson(response, 200, { success: true, comments: comments || [] });
}

async function updateComment(request, response) {
  const body = await readBody(request);
  const id = Number.parseInt(body.id, 10);

  if (!Number.isInteger(id) || id <= 0) {
    sendError(response, 400, 'INVALID_INPUT', 'Invalid comment id.');
    return;
  }

  const patch = {};
  if (typeof body.is_hidden === 'boolean') {
    patch.is_hidden = body.is_hidden;
  }
  if (body.status && ['approved', 'pending', 'hidden', 'rejected'].includes(body.status)) {
    patch.status = body.status;
  }

  if (Object.keys(patch).length === 0) {
    sendError(response, 400, 'INVALID_INPUT', 'No valid fields to update (is_hidden or status required).');
    return;
  }

  const rows = await supabaseRequest(`${TABLE_NAME}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });

  sendJson(response, 200, { success: true, comment: rows?.[0] || null });
}

async function deleteComment(request, response) {
  const url = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
  const id = Number.parseInt(url.searchParams.get('id'), 10);

  if (!Number.isInteger(id) || id <= 0) {
    sendError(response, 400, 'INVALID_INPUT', 'Invalid comment id.');
    return;
  }

  await supabaseRequest(`${TABLE_NAME}?id=eq.${id}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });

  sendJson(response, 200, { success: true, ok: true });
}

export default async function handler(request, response) {
  if (!requireAdmin(request, response)) return;

  try {
    if (request.method === 'GET') {
      await listComments(request, response);
      return;
    }

    if (request.method === 'PATCH') {
      await updateComment(request, response);
      return;
    }

    if (request.method === 'DELETE') {
      await deleteComment(request, response);
      return;
    }

    sendError(response, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
  } catch (error) {
    if (error.message === 'PAYLOAD_TOO_LARGE') {
      sendError(response, 413, 'PAYLOAD_TOO_LARGE', 'Payload exceeds maximum limit of 1MB.');
      return;
    }
    sendError(response, 500, 'INTERNAL_ERROR', 'An error occurred while processing the admin request.');
  }
}
