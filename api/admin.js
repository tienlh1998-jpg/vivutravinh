// api/admin.js
// Serverless Function điều phối (Dispatcher) cho toàn bộ các chức năng quản trị hệ thống:
// - /api/admin-profile     (route=profile)
// - /api/admin-places      (route=places)
// - /api/admin-comments    (route=comments)
// - /api/admin-reports     (route=reports)
// - /api/admin-moderation  (route=moderation)
//
// Giữ nguyên 100% logic xác thực RBAC, kiểm toán admin_audit_logs và phân quyền từng route.
// Giúp tối ưu số lượng Serverless Functions trên Vercel Hobby (không vượt quá giới hạn 12 Functions).

import profileHandler from './_admin/profile.js';
import placesHandler from './_admin/places.js';
import commentsHandler from './_admin/comments.js';
import reportsHandler from './_admin/reports.js';
import moderationHandler from './_admin/moderation.js';

export {
  profileHandler,
  placesHandler,
  commentsHandler,
  reportsHandler,
  moderationHandler
};

export default async function handler(request, response) {
  // CORS Headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-secret, x-correlation-id, x-client-request-id');

  if (request.method === 'OPTIONS') {
    response.statusCode = 204;
    response.end();
    return;
  }

  const url = new URL(request.url, 'http://localhost');
  let route = url.searchParams.get('route') || url.searchParams.get('action');

  if (!route) {
    const matchPath = url.pathname.match(/\/api\/admin[-/]([a-z0-9_-]+)/i);
    if (matchPath) {
      route = matchPath[1];
    }
  }

  const normalizedRoute = String(route || '').trim().toLowerCase();

  switch (normalizedRoute) {
    case 'profile':
      return profileHandler(request, response);
    case 'places':
      return placesHandler(request, response);
    case 'comments':
      return commentsHandler(request, response);
    case 'reports':
      return reportsHandler(request, response);
    case 'moderation':
      return moderationHandler(request, response);
    default:
      response.statusCode = 404;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({
        success: false,
        error: {
          code: 'ROUTE_NOT_FOUND',
          message: `Admin route '${normalizedRoute || 'unknown'}' không tồn tại. Các route hợp lệ: profile, places, comments, reports, moderation.`
        }
      }));
  }
}
