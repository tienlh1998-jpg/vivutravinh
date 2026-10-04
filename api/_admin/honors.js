// api/_admin/honors.js
// Endpoint quản lý và phê duyệt Bảng Vinh Danh Tháng/Năm (Monthly Honors & Leaderboard)
// Xác thực RBAC admin qua _admin-auth.js. Admin xác nhận kết quả trước khi công bố ra công chúng.

import {
  authenticateAdmin,
  requireRole,
  sendJson,
  sendError,
  readBody,
  supabaseRpc,
  getSafeActorId
} from '../_admin-auth.js';

export default async function handler(request, response) {
  if (request.method === 'OPTIONS') {
    response.statusCode = 204;
    response.setHeader('Allow', 'GET, POST, OPTIONS');
    response.end();
    return;
  }

  const adminContext = await authenticateAdmin(request, response);
  if (!adminContext) return;

  const url = new URL(request.url, 'http://localhost');
  const period = url.searchParams.get('period') || undefined;

  // 1. GET: Đọc danh sách xếp hạng theo kỳ tháng/năm
  if (request.method === 'GET') {
    try {
      const data = await supabaseRpc('get_contribution_leaderboard', {
        p_period: period || null
      });

      return sendJson(response, 200, {
        success: true,
        data
      });
    } catch (err) {
      console.error('[AdminHonors] Lỗi lấy bảng xếp hạng:', err.message);
      return sendError(response, 500, 'LEADERBOARD_ERROR', 'Không thể lấy dữ liệu bảng xếp hạng.');
    }
  }

  // 2. POST: Admin xác nhận kết quả vinh danh kỳ cụ thể (Draft -> Confirmed)
  if (request.method === 'POST') {
    if (!requireRole(adminContext, ['admin'], response)) {
      return;
    }

    let body = {};
    try {
      body = await readBody(request, 16 * 1024);
    } catch (_) {}

    const targetPeriod = String(body.period || period || '').trim();
    if (!targetPeriod || !/^\d{4}-\d{2}$/.test(targetPeriod)) {
      return sendError(response, 400, 'INVALID_PERIOD', 'Kỳ vinh danh phải có định dạng YYYY-MM (ví dụ: 2024-10).');
    }

    const actorId = getSafeActorId(adminContext);

    try {
      const result = await supabaseRpc('admin_confirm_monthly_honors', {
        p_actor_id: actorId,
        p_period: targetPeriod
      });

      return sendJson(response, 200, {
        success: true,
        period: targetPeriod,
        message: `Đã xác nhận và lưu bảng vinh danh kỳ ${targetPeriod}.`,
        result
      });
    } catch (err) {
      console.error('[AdminHonors] Lỗi xác nhận vinh danh:', err.message);
      return sendError(response, 500, 'HONORS_CONFIRM_ERROR', 'Không thể xác nhận bảng vinh danh lúc này.');
    }
  }

  return sendError(response, 405, 'METHOD_NOT_ALLOWED', 'Chỉ hỗ trợ phương thức GET hoặc POST.');
}
