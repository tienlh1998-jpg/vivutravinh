// api/articles.js
// Endpoint quản lý Bài viết Cẩm nang du lịch (Articles & Travel Magazine)
// Hỗ trợ GET (Public feed đã duyệt & Bài của tác giả/admin),
// POST (Gửi bài cẩm nang mới: pending cho thành viên, approved cho Admin),
// PATCH/PUT (Biên tập bài viết), DELETE (Gỡ bài viết).

import {
  authenticateUser,
  sendJson,
  sendError,
  readBody,
  supabaseRequest,
  getClientIp
} from './_admin-auth.js';

const TABLE_NAME = 'articles';
const MAX_PAYLOAD_SIZE = 256 * 1024; // 256KB cho bài viết dài kèm ảnh/markdown
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 giờ
const MAX_ARTICLES_PER_HOUR = 10;
const localRateLimitMap = new Map();

const VALID_CATEGORIES = new Set([
  'van-hoa',
  'am-thuc',
  'ky-su',
  'le-hoi',
  'dia-diem',
  'Văn Hóa Khmer',
  'Ẩm Thực Bản Địa',
  'Ký Sự & Phượt',
  'Lễ Hội & Sự Kiện',
  'Cẩm Nang Phượt'
]);

const CATEGORY_MAP = {
  'van-hoa': { name: 'Văn Hóa Khmer', badge: 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40' },
  'am-thuc': { name: 'Ẩm Thực Bản Địa', badge: 'bg-orange-100 text-orange-900 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-200 dark:border-orange-800/40' },
  'ky-su': { name: 'Ký Sự & Phượt', badge: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40' },
  'le-hoi': { name: 'Lễ Hội & Sự Kiện', badge: 'bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800/40' },
  'dia-diem': { name: 'Địa Điểm Mới', badge: 'bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40' }
};

function checkUserRateLimit(userIdOrIp) {
  const now = Date.now();
  const record = localRateLimitMap.get(userIdOrIp) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + RATE_LIMIT_WINDOW_MS;
  }
  if (record.count >= MAX_ARTICLES_PER_HOUR) {
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
    .slice(0, 1000);
}

/**
 * Bộ lọc HTML server-side cho nội dung bài cẩm nang (XSS Prevention)
 * Loại bỏ toàn bộ thẻ script, style, iframe, handler on*, href="javascript:..."
 */
function sanitizeArticleHtml(raw) {
  if (typeof raw !== 'string') return '';
  let text = raw.trim();
  // Xóa toàn bộ cặp thẻ nguy hiểm
  text = text.replace(/<(script|style|iframe|object|embed|svg|math|applet|meta|link|form|input|button|textarea|select|img|picture|canvas)[^>]*>[\s\S]*?<\/\1>/gi, '');
  text = text.replace(/<(script|style|iframe|object|embed|svg|math|applet|meta|link|form|input|button|textarea|select|img|picture|canvas)[^>]*\/?\s*>/gi, '');
  // Xóa toàn bộ handler on* (onload, onerror, onclick, onmouseover...)
  text = text.replace(/\s+on\w+\s*=\s*(["'][^"']*["']|[^\s>]+)/gi, '');
  // Xóa javascript: trong thuộc tính href hoặc src
  text = text.replace(/(href|src)\s*=\s*(["']\s*javascript:[^"']*["']|javascript:[^\s>]+)/gi, '');
  // Xóa style attributes
  text = text.replace(/\s+style\s*=\s*(["'][^"']*["']|[^\s>]+)/gi, '');
  return text;
}

function createSlug(text, suffix) {
  const base = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${base || 'bai-viet'}-${suffix || Date.now().toString(36)}`;
}

function calculateReadingTime(content) {
  const words = String(content || '').trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return `${minutes} phút đọc`;
}

/**
 * GET: Đọc danh sách hoặc chi tiết bài viết cẩm nang
 */
async function handleGet(request, response) {
  const url = new URL(request.url, 'http://localhost');
  const articleId = url.searchParams.get('id');
  const slug = url.searchParams.get('slug');
  const category = url.searchParams.get('category');
  const authorId = url.searchParams.get('author_id');
  const statusParam = url.searchParams.get('status') || 'approved';
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '30', 10), 1), 50);

  let userContext = null;
  const authHeader = request.headers['authorization'] || request.headers['Authorization'];
  if (authHeader) {
    userContext = await authenticateUser(request, response).catch(() => null);
  }

  // Quyền truy cập: Khách chỉ được xem status = 'approved' trừ khi là chính tác giả hoặc admin
  let effectiveStatus = 'approved';
  if (statusParam !== 'approved') {
    const isOwner = userContext && authorId && userContext.user.id === authorId;
    const isAdmin = userContext && ['admin', 'moderator', 'editor'].includes(userContext.user.role);
    if (isOwner || isAdmin) {
      effectiveStatus = statusParam;
    } else {
      sendError(response, 403, 'FORBIDDEN', 'Bạn chỉ có thể xem danh sách bài viết đã được phê duyệt công khai.');
      return;
    }
  }

  const isPrivileged = userContext && ['admin', 'moderator', 'editor'].includes(userContext.user.role);
  const isOwner = userContext && authorId && userContext.user.id === authorId;

  // Giới hạn cột trả về: Khách và thành viên khác KHÔNG được xem admin_notes, moderation_reason
  const selectColumns = (isPrivileged || isOwner)
    ? '*'
    : 'id,slug,title,category,category_name,category_badge,cover_image,read_time,excerpt,content,author_id,author_name,author_role,author_avatar,is_editorial,related_place_ids,status,created_at,updated_at';

  let query = `${TABLE_NAME}?select=${selectColumns}&order=created_at.desc&limit=${limit}`;

  if (articleId) {
    query += `&id=eq.${encodeURIComponent(articleId)}`;
  } else if (slug) {
    query += `&slug=eq.${encodeURIComponent(slug)}`;
  }

  if (effectiveStatus !== 'all') {
    query += `&status=eq.${encodeURIComponent(effectiveStatus)}`;
  }
  if (category && category !== 'all') {
    query += `&category=eq.${encodeURIComponent(category)}`;
  }
  if (authorId) {
    query += `&author_id=eq.${encodeURIComponent(authorId)}`;
  }

  try {
    const rows = await supabaseRequest(query);
    const sanitized = (Array.isArray(rows) ? rows : []).map(a => {
      if (!isPrivileged && !isOwner) {
        const { admin_notes, moderation_reason, moderated_by, moderated_at, ...safe } = a;
        return safe;
      }
      return a;
    });

    if ((articleId || slug) && sanitized.length > 0) {
      sendJson(response, 200, {
        success: true,
        article: sanitized[0]
      });
      return;
    }

    sendJson(response, 200, {
      success: true,
      count: sanitized.length,
      articles: sanitized
    });
  } catch (err) {
    console.warn('[Articles] Supabase query fallback:', err.message);
    sendJson(response, 200, {
      success: true,
      count: 0,
      articles: []
    });
  }
}

/**
 * POST: Tạo bài viết cẩm nang mới (Thành viên gửi pending, Admin xuất bản approved)
 */
async function handlePost(request, response) {
  const userContext = await authenticateUser(request, response);
  if (!userContext) return;

  const clientIp = getClientIp(request);
  const rateKey = userContext.user.id || clientIp;
  const rateLimit = checkUserRateLimit(rateKey);
  if (!rateLimit.allowed) {
    sendError(response, 429, 'RATE_LIMITED', `Bạn đã gửi quá nhiều bài viết. Vui lòng thử lại sau ${rateLimit.waitMinutes} phút.`);
    return;
  }

  let body;
  try {
    body = await readBody(request, MAX_PAYLOAD_SIZE);
  } catch (err) {
    if (err.message === 'PAYLOAD_TOO_LARGE') {
      sendError(response, 413, 'PAYLOAD_TOO_LARGE', 'Nội dung bài viết vượt quá giới hạn 256KB.');
      return;
    }
    sendError(response, 400, 'INVALID_JSON', 'Định dạng JSON không hợp lệ.');
    return;
  }

  const title = sanitizeText(body.title);
  const categoryKey = String(body.category || 'van-hoa').trim().toLowerCase();
  const categoryInfo = CATEGORY_MAP[categoryKey] || {
    name: 'Văn Hóa Khmer',
    badge: 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40'
  };

  const coverImage = String(body.cover_image || body.coverImage || '/ao bà om.jpg').trim();
  const rawContent = String(body.content || body.contentHtml || '').trim();
  const content = sanitizeArticleHtml(rawContent);
  const excerpt = sanitizeText(body.excerpt) || (content.replace(/<[^>]*>/g, '').slice(0, 160) + '...');
  const readTime = body.read_time || body.readTime || calculateReadingTime(content);
  const relatedPlaceIds = Array.isArray(body.related_place_ids) ? body.related_place_ids : [];

  // 1. Validation đầu vào
  if (!title || title.length < 5 || title.length > 200) {
    sendError(response, 400, 'INVALID_TITLE', 'Tiêu đề bài viết phải từ 5 đến 200 ký tự.');
    return;
  }
  if (!content || content.length < 30) {
    sendError(response, 400, 'INVALID_CONTENT', 'Nội dung bài viết phải tối thiểu 30 ký tự.');
    return;
  }

  const isAdmin = ['admin', 'moderator', 'editor'].includes(userContext.user.role);

  // 2. Quyết định trạng thái bài viết & quyền biên tập
  let status = 'pending';
  let isEditorial = false;
  let moderatedBy = null;
  let moderatedAt = null;

  if (isAdmin) {
    // Admin có thể xuất bản ngay (status = 'approved') hoặc lưu nháp ('draft')
    status = body.status === 'draft' ? 'draft' : 'approved';
    isEditorial = body.is_editorial === true || body.isEditorial === true;
    if (status === 'approved') {
      moderatedBy = userContext.user.id;
      moderatedAt = new Date().toISOString();
    }
  } else {
    // Thành viên thông thường bắt buộc pending
    status = 'pending';
    isEditorial = false;
  }

  const articleId = `art-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const slug = createSlug(title, Math.random().toString(36).substring(2, 6));
  const authorName = userContext.user.user_metadata?.display_name || userContext.user.email?.split('@')[0] || 'Thành viên Xứ Trà';
  const authorRole = isEditorial ? 'Ban Biên Tập ViVuTraVinh' : (isAdmin ? 'Biên Tập Viên' : 'Thành viên Xứ Trà');
  const authorAvatar = userContext.user.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${authorName}`;

  const newArticle = {
    id: articleId,
    slug,
    title,
    category: categoryKey,
    category_name: categoryInfo.name,
    category_badge: categoryInfo.badge,
    cover_image: coverImage,
    read_time: readTime,
    excerpt,
    content,
    author_id: userContext.user.id,
    author_name: authorName,
    author_role: authorRole,
    author_avatar: authorAvatar,
    is_editorial: isEditorial,
    related_place_ids: relatedPlaceIds,
    status,
    moderated_by: moderatedBy,
    moderated_at: moderatedAt,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    await supabaseRequest(TABLE_NAME, {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(newArticle)
    });

    sendJson(response, 201, {
      success: true,
      message: isAdmin && status === 'approved'
        ? 'Bài viết cẩm nang đã được xuất bản công khai!'
        : 'Bài viết cẩm nang đã được gửi và đang chờ Ban Quản Trị phê duyệt.',
      article: {
        id: articleId,
        slug,
        title,
        category: categoryInfo.name,
        category_badge: categoryInfo.badge,
        cover_image: coverImage,
        read_time: readTime,
        excerpt,
        status,
        is_editorial: isEditorial,
        created_at: newArticle.created_at
      }
    });
  } catch (err) {
    console.error('[Articles] Lỗi lưu bài viết vào Supabase:', err.message);
    sendError(response, 500, 'DATABASE_ERROR', 'Không thể tạo bài viết cẩm nang lúc này. Vui lòng thử lại sau.');
  }
}

/**
 * PATCH / PUT: Biên tập hoặc cập nhật bài viết cẩm nang
 */
async function handlePatch(request, response) {
  const userContext = await authenticateUser(request, response);
  if (!userContext) return;

  let body;
  try {
    body = await readBody(request, MAX_PAYLOAD_SIZE);
  } catch (err) {
    sendError(response, 400, 'INVALID_JSON', 'Định dạng JSON không hợp lệ.');
    return;
  }

  const url = new URL(request.url, 'http://localhost');
  const articleId = url.searchParams.get('id') || body?.id;

  if (!articleId) {
    sendError(response, 400, 'MISSING_ID', 'Thiếu mã bài viết (id).');
    return;
  }

  try {
    // 1. Kiểm tra bài viết hiện tại
    const rows = await supabaseRequest(`${TABLE_NAME}?id=eq.${encodeURIComponent(articleId)}&limit=1`);
    if (!Array.isArray(rows) || rows.length === 0) {
      sendError(response, 404, 'NOT_FOUND', 'Bài viết không tồn tại.');
      return;
    }

    const current = rows[0];
    const isAdmin = ['admin', 'moderator', 'editor'].includes(userContext.user.role);
    const isOwner = current.author_id === userContext.user.id;

    if (!isAdmin && !isOwner) {
      sendError(response, 403, 'FORBIDDEN', 'Bạn không có quyền chỉnh sửa bài viết này.');
      return;
    }

    // Nếu là tác giả thường: chỉ sửa khi bài chưa approved, và không được tự gán approved
    if (!isAdmin) {
      if (current.status === 'approved') {
        sendError(response, 403, 'FORBIDDEN', 'Bài viết đã được duyệt công khai, vui lòng liên hệ Admin nếu cần chỉnh sửa.');
        return;
      }
      if (body.status === 'approved') {
        sendError(response, 403, 'FORBIDDEN', 'Người dùng không có quyền tự phê duyệt bài viết.');
        return;
      }
    }

    // 2. Chuẩn bị trường cập nhật
    const patch = {
      updated_at: new Date().toISOString()
    };

    if (body.title) patch.title = sanitizeText(body.title);
    if (body.content) {
      patch.content = sanitizeArticleHtml(String(body.content));
      patch.read_time = calculateReadingTime(patch.content);
    }
    if (body.excerpt) patch.excerpt = sanitizeText(body.excerpt);
    if (body.cover_image || body.coverImage) patch.cover_image = String(body.cover_image || body.coverImage).trim();
    if (body.category) {
      const catKey = String(body.category).trim().toLowerCase();
      patch.category = catKey;
      if (CATEGORY_MAP[catKey]) {
        patch.category_name = CATEGORY_MAP[catKey].name;
        patch.category_badge = CATEGORY_MAP[catKey].badge;
      } else {
        patch.category_name = 'Văn Hóa Khmer';
        patch.category_badge = CATEGORY_MAP['van-hoa'].badge;
      }
    }
    if (Array.isArray(body.related_place_ids)) patch.related_place_ids = body.related_place_ids;

    if (isAdmin) {
      if (body.status && ['draft', 'pending', 'approved', 'rejected', 'archived'].includes(body.status)) {
        patch.status = body.status;
      }
      if (body.is_editorial !== undefined) {
        patch.is_editorial = Boolean(body.is_editorial);
      }
      if (body.admin_notes !== undefined) {
        patch.admin_notes = sanitizeText(body.admin_notes);
      }
    } else {
      // Người dùng chỉnh sửa bài thì đưa về pending để duyệt lại
      patch.status = 'pending';
      patch.moderation_reason = null;
    }

    await supabaseRequest(`${TABLE_NAME}?id=eq.${encodeURIComponent(articleId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(patch)
    });

    sendJson(response, 200, {
      success: true,
      message: 'Cập nhật bài viết thành công!',
      articleId
    });
  } catch (err) {
    console.error('[Articles] Lỗi cập nhật bài viết:', err.message);
    sendError(response, 500, 'DATABASE_ERROR', 'Không thể cập nhật bài viết lúc này.');
  }
}

/**
 * DELETE: Xóa bài viết cẩm nang
 */
async function handleDelete(request, response) {
  const userContext = await authenticateUser(request, response);
  if (!userContext) return;

  const url = new URL(request.url, 'http://localhost');
  const articleId = url.searchParams.get('id');

  if (!articleId) {
    sendError(response, 400, 'MISSING_ID', 'Thiếu mã bài viết (id).');
    return;
  }

  try {
    const rows = await supabaseRequest(`${TABLE_NAME}?id=eq.${encodeURIComponent(articleId)}&limit=1`);
    if (!Array.isArray(rows) || rows.length === 0) {
      sendError(response, 404, 'NOT_FOUND', 'Bài viết không tồn tại.');
      return;
    }

    const current = rows[0];
    const isAdmin = ['admin', 'moderator', 'editor'].includes(userContext.user.role);
    const isOwner = current.author_id === userContext.user.id;

    if (!isAdmin && !isOwner) {
      sendError(response, 403, 'FORBIDDEN', 'Bạn không có quyền xóa bài viết này.');
      return;
    }

    await supabaseRequest(`${TABLE_NAME}?id=eq.${encodeURIComponent(articleId)}`, {
      method: 'DELETE'
    });

    sendJson(response, 200, {
      success: true,
      message: 'Đã xóa bài viết thành công.'
    });
  } catch (err) {
    console.error('[Articles] Lỗi xóa bài viết:', err.message);
    sendError(response, 500, 'DATABASE_ERROR', 'Không thể xóa bài viết lúc này.');
  }
}

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
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
  } else if (request.method === 'PATCH' || request.method === 'PUT') {
    await handlePatch(request, response);
  } else if (request.method === 'DELETE') {
    await handleDelete(request, response);
  } else {
    sendError(response, 405, 'METHOD_NOT_ALLOWED', 'Phương thức HTTP không được hỗ trợ.');
  }
}
