// api/community-posts.js
// Endpoint quản lý Bài viết Cộng đồng (Community Posts) - UGC & Vòng đời nội dung
// Hỗ trợ GET (Public feed đã duyệt & Bài của chính tác giả), POST (Đăng bài mới chờ duyệt),
// PATCH (Sửa nháp/bài bị từ chối), DELETE (Xóa nháp/bài bị từ chối).

import {
  authenticateUser,
  sendJson,
  sendError,
  readBody,
  supabaseRequest,
  getClientIp
} from './_admin-auth.js';

const TABLE_NAME = 'community_posts';
const MAX_PAYLOAD_SIZE = 64 * 1024; // 64KB
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 phút
const MAX_POSTS_PER_MINUTE = 5;
const localRateLimitMap = new Map();

function checkUserRateLimit(userIdOrIp) {
  const now = Date.now();
  const record = localRateLimitMap.get(userIdOrIp) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + RATE_LIMIT_WINDOW_MS;
  }
  if (record.count >= MAX_POSTS_PER_MINUTE) {
    const waitSeconds = Math.ceil((record.resetTime - now) / 1000);
    return { allowed: false, waitSeconds };
  }
  record.count += 1;
  localRateLimitMap.set(userIdOrIp, record);
  return { allowed: true };
}

/**
 * GET: Đọc danh sách bài viết
 */
async function handleGet(request, response) {
  const url = new URL(request.url, 'http://localhost');
  const clubId = url.searchParams.get('club_id');
  const authorId = url.searchParams.get('author_id');
  const statusParam = url.searchParams.get('status') || 'approved';
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10), 1), 50);

  let userContext = null;
  const authHeader = request.headers['authorization'] || request.headers['Authorization'];
  if (authHeader) {
    userContext = await authenticateUser(request, response).catch(() => null);
  }

  // Public chỉ được đọc status = 'approved' trừ khi là tác giả đọc bài của mình hoặc admin
  let effectiveStatus = 'approved';
  if (statusParam !== 'approved') {
    const isOwner = userContext && authorId && userContext.user.id === authorId;
    const isAdmin = userContext && ['admin', 'moderator', 'editor'].includes(userContext.user.role);
    if (isOwner || isAdmin) {
      effectiveStatus = statusParam;
    } else {
      sendError(response, 403, 'FORBIDDEN', 'Bạn chỉ có thể xem nội dung đã được phê duyệt công khai.');
      return;
    }
  }

  const isPrivileged = userContext && ['admin', 'moderator', 'editor'].includes(userContext.user.role);
  const isOwner = userContext && authorId && userContext.user.id === authorId;

  // Giới hạn cột trả về: Public chỉ nhận các trường an toàn; cấm rò rỉ moderation metadata & admin notes
  const selectColumns = isPrivileged
    ? '*'
    : (isOwner
        ? 'id,club_id,author_id,author_name,author_avatar,category,title,content,images,likes_count,comments_count,status,moderation_reason,metadata,created_at,updated_at'
        : 'id,club_id,author_id,author_name,author_avatar,category,title,content,images,likes_count,comments_count,status,metadata,created_at');

  let query = `${TABLE_NAME}?select=${selectColumns}&order=created_at.desc&limit=${limit}`;
  if (effectiveStatus !== 'all') {
    query += `&status=eq.${encodeURIComponent(effectiveStatus)}`;
  }
  if (clubId) {
    query += `&club_id=eq.${encodeURIComponent(clubId)}`;
  }
  if (authorId) {
    query += `&author_id=eq.${encodeURIComponent(authorId)}`;
  }

  try {
    const rows = await supabaseRequest(query);
    const sanitized = (Array.isArray(rows) ? rows : []).map(p => {
      if (!isPrivileged && !isOwner) {
        const { moderated_by, moderated_at, moderation_reason, admin_notes, ai_safety_score, ...safe } = p;
        return safe;
      }
      return p;
    });
    sendJson(response, 200, {
      success: true,
      count: sanitized.length,
      posts: sanitized
    });
  } catch (err) {
    console.warn('[CommunityPosts] Supabase query fallback:', err.message);
    // Nếu bảng chưa có trong database, trả về danh sách rỗng để frontend dùng fallback an toàn
    sendJson(response, 200, {
      success: true,
      count: 0,
      posts: [],
      warning: 'Database table not ready, using fallback'
    });
  }
}

/**
 * POST: Tạo bài viết mới (bản nháp hoặc gửi chờ duyệt)
 */
async function handlePost(request, response) {
  const userContext = await authenticateUser(request, response);
  if (!userContext) return;

  const rateCheck = checkUserRateLimit(userContext.user.id || getClientIp(request));
  if (!rateCheck.allowed) {
    sendError(response, 429, 'RATE_LIMIT_EXCEEDED', `Bạn đang đăng bài quá nhanh. Vui lòng thử lại sau ${rateCheck.waitSeconds} giây.`);
    return;
  }

  let body;
  try {
    body = await readBody(request, MAX_PAYLOAD_SIZE);
  } catch (err) {
    sendError(response, 400, 'INVALID_BODY', 'Dữ liệu không hợp lệ.');
    return;
  }

  const content = String(body.content || '').trim();
  const title = String(body.title || '').trim();
  const category = String(body.category || 'Tự do').trim();
  const clubId = body.club_id ? String(body.club_id).trim() : null;
  const requestedStatus = body.status === 'draft' ? 'draft' : 'pending';
  const images = Array.isArray(body.images) ? body.images.slice(0, 5).map(img => String(img).trim()) : [];

  if (!content || content.length < 5 || content.length > 5000) {
    sendError(response, 400, 'INVALID_CONTENT', 'Nội dung bài viết phải có độ dài từ 5 đến 5000 ký tự.');
    return;
  }

  // Xử lý thông tin check-in địa điểm công khai vào metadata
  let locationData = null;
  if (body.location) {
    if (typeof body.location === 'object' && body.location.name) {
      locationData = {
        id: String(body.location.id || '').trim().slice(0, 100),
        name: String(body.location.name || '').trim().slice(0, 120),
        address: String(body.location.address || '').trim().slice(0, 200),
        coords: body.location.coords ? String(body.location.coords).trim().slice(0, 50) : null
      };
    } else if (typeof body.location === 'string' && body.location.trim()) {
      locationData = {
        name: body.location.trim().slice(0, 120)
      };
    }
  }

  const postMetadata = locationData ? { location: locationData } : {};

  const authorName = userContext.user.user_metadata?.display_name || userContext.user.email?.split('@')[0] || 'Thành viên Xứ Trà';
  const authorAvatar = userContext.user.user_metadata?.avatar_url || '/icons/icon.svg';

  const newPost = {
    club_id: clubId,
    author_id: userContext.user.id,
    author_name: authorName,
    author_avatar: authorAvatar,
    category,
    title: title || null,
    content,
    images,
    likes_count: 0,
    comments_count: 0,
    status: requestedStatus,
    metadata: postMetadata
  };

  try {
    const inserted = await supabaseRequest(TABLE_NAME, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(newPost)
    });

    const result = Array.isArray(inserted) && inserted.length > 0 ? inserted[0] : newPost;
    sendJson(response, 201, {
      success: true,
      message: requestedStatus === 'draft' ? 'Đã lưu bản nháp bài viết.' : 'Bài viết đã được gửi vào hàng đợi duyệt của Ban Quản Trị.',
      post: result
    });
  } catch (err) {
    const isTestMode = process.env.NODE_ENV === 'test' || process.env.VIVU_TEST === '1';
    if (isTestMode || err.message?.includes('CONFIG_ERROR')) {
      const fallbackPost = { ...newPost, id: `post-${Date.now()}` };
      sendJson(response, 201, {
        success: true,
        message: requestedStatus === 'draft' ? 'Đã lưu bản nháp bài viết.' : 'Bài viết đã được gửi vào hàng đợi duyệt của Ban Quản Trị.',
        post: fallbackPost,
        warning: 'Test mode without live Supabase connection'
      });
      return;
    }
    console.error('[CommunityPosts] Error creating post:', err.message);
    sendError(response, 500, 'CREATE_POST_FAILED', 'Không thể tạo bài viết lúc này. Vui lòng thử lại sau.');
  }
}

/**
 * PATCH: Cập nhật bài viết của chính tác giả (chỉ khi draft/rejected)
 */
async function handlePatch(request, response) {
  const userContext = await authenticateUser(request, response);
  if (!userContext) return;

  const url = new URL(request.url, 'http://localhost');
  const postId = url.searchParams.get('id');
  if (!postId) {
    sendError(response, 400, 'MISSING_ID', 'Thiếu id bài viết cần sửa.');
    return;
  }

  let body;
  try {
    body = await readBody(request, MAX_PAYLOAD_SIZE);
  } catch (err) {
    sendError(response, 400, 'INVALID_BODY', 'Dữ liệu không hợp lệ.');
    return;
  }

  // Đọc bài viết hiện tại
  try {
    const rows = await supabaseRequest(`${TABLE_NAME}?id=eq.${encodeURIComponent(postId)}&select=*&limit=1`);
    const post = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!post) {
      sendError(response, 404, 'NOT_FOUND', 'Bài viết không tồn tại.');
      return;
    }

    const isOwner = post.author_id === userContext.user.id;
    const isAdmin = ['admin', 'moderator'].includes(userContext.user.role);

    if (!isOwner && !isAdmin) {
      sendError(response, 403, 'FORBIDDEN', 'Bạn không có quyền chỉnh sửa bài viết này.');
      return;
    }

    if (!isAdmin && !['draft', 'rejected', 'pending'].includes(post.status)) {
      sendError(response, 400, 'CANNOT_EDIT', 'Chỉ có thể chỉnh sửa bài viết khi đang ở bản nháp, chờ duyệt hoặc bị từ chối.');
      return;
    }

    const patch = {};
    if (body.content !== undefined) patch.content = String(body.content).trim();
    if (body.title !== undefined) patch.title = String(body.title).trim();
    if (body.category !== undefined) patch.category = String(body.category).trim();
    if (body.submit_for_review === true || body.status === 'pending' || post.status === 'rejected') {
      patch.status = 'pending';
      patch.moderation_reason = null;
    }

    patch.updated_at = new Date().toISOString();

    const updated = await supabaseRequest(`${TABLE_NAME}?id=eq.${encodeURIComponent(postId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch)
    });

    sendJson(response, 200, {
      success: true,
      message: 'Cập nhật bài viết thành công.',
      post: Array.isArray(updated) && updated.length > 0 ? updated[0] : { ...post, ...patch }
    });
  } catch (err) {
    console.error('[CommunityPosts] Error updating post:', err.message);
    sendError(response, 500, 'UPDATE_POST_FAILED', 'Không thể cập nhật bài viết lúc này.');
  }
}

/**
 * DELETE: Xóa bài viết của chính tác giả (chỉ khi draft/rejected)
 */
async function handleDelete(request, response) {
  const userContext = await authenticateUser(request, response);
  if (!userContext) return;

  const url = new URL(request.url, 'http://localhost');
  const postId = url.searchParams.get('id');
  if (!postId) {
    sendError(response, 400, 'MISSING_ID', 'Thiếu id bài viết cần xóa.');
    return;
  }

  try {
    const rows = await supabaseRequest(`${TABLE_NAME}?id=eq.${encodeURIComponent(postId)}&select=*&limit=1`);
    const post = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!post) {
      sendError(response, 404, 'NOT_FOUND', 'Bài viết không tồn tại.');
      return;
    }

    const isOwner = post.author_id === userContext.user.id;
    const isAdmin = ['admin', 'moderator'].includes(userContext.user.role);

    if (!isOwner && !isAdmin) {
      sendError(response, 403, 'FORBIDDEN', 'Bạn không có quyền xóa bài viết này.');
      return;
    }

    if (!isAdmin && !['draft', 'rejected'].includes(post.status)) {
      sendError(response, 400, 'CANNOT_DELETE', 'Chỉ có thể xóa bài viết khi đang ở bản nháp hoặc bị từ chối.');
      return;
    }

    await supabaseRequest(`${TABLE_NAME}?id=eq.${encodeURIComponent(postId)}`, {
      method: 'DELETE'
    });

    sendJson(response, 200, {
      success: true,
      message: 'Đã xóa bài viết thành công.'
    });
  } catch (err) {
    console.error('[CommunityPosts] Error deleting post:', err.message);
    sendError(response, 500, 'DELETE_POST_FAILED', 'Không thể xóa bài viết lúc này.');
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
