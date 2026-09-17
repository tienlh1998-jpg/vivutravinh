// api/admin-profile.js
// Endpoint xác thực phiên làm việc và cung cấp profile/role đã xác minh từ bảng admin_users

import { authenticateAdmin, sendJson, sendError } from './_admin-auth.js';

export default async function handler(request, response) {
  if (request.method === 'OPTIONS') {
    response.statusCode = 204;
    response.setHeader('Allow', 'GET, OPTIONS');
    response.end();
    return;
  }

  if (request.method !== 'GET') {
    sendError(response, 405, 'METHOD_NOT_ALLOWED', 'Chỉ hỗ trợ phương thức GET.');
    return;
  }

  const adminContext = await authenticateAdmin(request, response);
  if (!adminContext) {
    // Đã tự động gửi mã lỗi 401 hoặc 403 với cấu trúc chuẩn
    return;
  }

  sendJson(response, 200, {
    success: true,
    user: {
      id: adminContext.user.id,
      email: adminContext.user.email,
      role: adminContext.user.role
    }
  });
}
