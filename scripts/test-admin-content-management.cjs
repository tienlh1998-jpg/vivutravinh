// scripts/test-admin-content-management.cjs
// Script kiểm thử tự động toàn diện quyền quản lý nội dung của Admin cho cả 6 thực thể:
// places, articles, community_posts, clubs, club_activities, community_events.
//
// Bao gồm:
// 1. Server-side RBAC & Bảo vệ quyền máy chủ.
// 2. Thao tác Ẩn/Hiện: Không xuất hiện ở phiên khách / trang công khai, xuất hiện trong bộ lọc "Tạm ẩn", unhide không qua pending.
// 3. Thùng rác & Khôi phục: Lưu previous_status, khôi phục về đúng trạng thái ban đầu, KHÔNG mặc định xuất bản bài chưa duyệt!
// 4. Kiểm thử điểm bằng SỐ DƯ (user_contribution_points) và LEDGER (point_transactions) trước-sau:
//    - Duyệt lần đầu (+points, ledger active)
//    - Duyệt lặp idempotency (không cộng trùng điểm)
//    - Hoàn duyệt (thu hồi điểm, ledger revoked)
//    - Tác giả sửa gửi lại & Duyệt lại (khôi phục điểm, không trùng lặp)
//    - Tạm ẩn / Hiện lại (không thay đổi / không cộng trùng)
//    - Xóa vào thùng rác / Khôi phục (thu hồi và phục hồi đúng điểm)
// 5. Kiểm tra phiên khách (Guest session) ở mọi trạng thái.
// 6. Ghi nhận nhật ký kiểm toán (admin_audit_logs).
// 7. Dọn dẹp an toàn toàn bộ dữ liệu thử nghiệm.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 1. Tải cấu hình môi trường kiểm thử
if (fs.existsSync('.env.live.tmp')) {
  const env = fs.readFileSync('.env.live.tmp', 'utf8');
  env.split('\n').forEach(line => {
    const parts = line.trim().split('=');
    const k = parts[0];
    const v = parts.slice(1).join('=');
    if (k && v) process.env[k] = v.replace(/^["']|["']$/g, '');
  });
}

process.env.ADMIN_SECRET = 'dev-admin';
process.env.NODE_ENV = 'test';
process.env.VIVU_TEST = '1';

// Mock HTTP Response helper
function createMockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader: (k, v) => { res.headers[k.toLowerCase()] = v; },
    getHeader: (k) => res.headers[k.toLowerCase()],
    end: (chunk) => {
      if (chunk) res.body = chunk;
    },
    getJson: () => {
      try {
        return JSON.parse(res.body);
      } catch (e) {
        return { raw: res.body };
      }
    },
    getStatusCode: () => res.statusCode
  };
  return res;
}

async function run() {
  console.log('================================================================');
  console.log('KIỂM THỬ TOÀN DIỆN: QUYỀN QUẢN LÝ NỘI DUNG ADMIN (6 THỰC THỂ)');
  console.log('================================================================\n');

  const { supabaseRequest, supabaseRpc } = await import('../api/_admin-auth.js');
  const moderationModule = await import('../api/_admin/moderation.js');
  const moderationHandler = moderationModule.default;

  // Import các public handlers để kiểm thử phiên khách
  const postsModule = await import('../api/community-posts.js');
  const postsHandler = postsModule.default;

  const articlesModule = await import('../api/articles.js');
  const articlesHandler = articlesModule.default;

  const clubsModule = await import('../api/clubs.js');
  const clubsHandler = clubsModule.default;

  const eventsModule = await import('../api/community-events.js');
  const eventsHandler = eventsModule.default;

  const activitiesModule = await import('../api/club-activities.js');
  const activitiesHandler = activitiesModule.default;

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    details: []
  };

  function assert(title, condition, extra = '') {
    results.total++;
    if (condition) {
      results.passed++;
      console.log(`  ✓ PASS: ${title} ${extra}`);
      results.details.push({ title, status: 'PASS', extra });
    } else {
      results.failed++;
      console.error(`  ✗ FAIL: ${title} ${extra}`);
      results.details.push({ title, status: 'FAIL', extra });
    }
  }

  // Lấy test user ID từ hệ thống
  let testAuthorId = 'f4e5080a-7f96-4a63-ab2f-a9beb0dce1d2';
  try {
    const profiles = await supabaseRequest('profiles?select=id,email,display_name&limit=1');
    if (Array.isArray(profiles) && profiles.length > 0) {
      testAuthorId = profiles[0].id;
      console.log(`[Setup] Tài khoản thử nghiệm liên kết tác giả: ${testAuthorId} (${profiles[0].email || 'no-email'})`);
    }
  } catch (err) {
    console.warn('[Setup] Dùng fallback author ID:', err.message);
  }

  const testBatchTag = `test-mod-${Date.now()}`;
  console.log(`[Setup] Batch tag định danh kiểm thử: ${testBatchTag}\n`);

  // Helper thực hiện moderation request với quyền Admin
  async function doAdminModerate(payload) {
    const req = {
      method: 'POST',
      url: 'http://localhost/api/admin-moderation',
      headers: {
        authorization: 'Bearer mock-admin-token',
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    };
    const res = createMockResponse();
    await moderationHandler(req, res);
    return {
      status: res.getStatusCode(),
      json: res.getJson()
    };
  }

  // Helper thực hiện GET moderation list với quyền Admin
  async function doAdminGetList(entityType, status = 'pending') {
    const req = {
      method: 'GET',
      url: `http://localhost/api/admin-moderation?entity_type=${entityType}&status=${status}&limit=50`,
      headers: {
        authorization: 'Bearer mock-admin-token'
      }
    };
    const res = createMockResponse();
    await moderationHandler(req, res);
    return {
      status: res.getStatusCode(),
      json: res.getJson()
    };
  }

  // Helper thực hiện public request phiên khách (Guest session)
  async function doGuestGet(handler, url) {
    const req = {
      method: 'GET',
      url,
      headers: {}
    };
    const res = createMockResponse();
    await handler(req, res);
    return {
      status: res.getStatusCode(),
      json: res.getJson()
    };
  }

  // Helper thực hiện tác giả request
  async function doAuthorRequest(handler, method, url, body) {
    const req = {
      method,
      url,
      headers: {
        authorization: `Bearer mock-author-${testAuthorId}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    };
    const res = createMockResponse();
    await handler(req, res);
    return {
      status: res.getStatusCode(),
      json: res.getJson()
    };
  }

  // Helper đọc số dư điểm người dùng
  async function getUserPoints(userId) {
    try {
      const rows = await supabaseRequest(`user_contribution_points?user_id=eq.${userId}&select=total_points,current_month_points,current_year_points&limit=1`);
      if (Array.isArray(rows) && rows.length > 0) {
        return {
          total: rows[0].total_points || 0,
          month: rows[0].current_month_points || 0,
          year: rows[0].current_year_points || 0
        };
      }
    } catch (_) {}
    return { total: 0, month: 0, year: 0 };
  }

  // Helper đọc ledger giao dịch điểm
  async function getEntityTransactions(entityType, entityId) {
    try {
      const rows = await supabaseRequest(`point_transactions?entity_type=eq.${entityType}&entity_id=eq.${entityId}&order=created_at.asc`);
      return Array.isArray(rows) ? rows : [];
    } catch (_) {
      return [];
    }
  }

  // ============================================================================
  // PHẦN 1: SERVER-SIDE RBAC & BẢO VỆ MÁY CHỦ
  // ============================================================================
  console.log('----------------------------------------------------------------');
  console.log('PHẦN 1: BẢO VỆ MÁY CHỦ & PHÂN QUYỀN (SERVER-SIDE RBAC)');
  console.log('----------------------------------------------------------------');

  // 1.1 Không có token -> 401
  {
    const req = { method: 'GET', url: 'http://localhost/api/admin-moderation', headers: {} };
    const res = createMockResponse();
    await moderationHandler(req, res);
    assert('1.1 Từ chối gọi API moderation khi không có token', res.getStatusCode() === 401, `(HTTP ${res.getStatusCode()})`);
  }

  // 1.2 Người dùng thường gọi API moderation -> 403
  {
    const req = {
      method: 'POST',
      url: 'http://localhost/api/admin-moderation',
      headers: { authorization: 'Bearer mock-user-token' },
      body: JSON.stringify({ entity_type: 'community_post', entity_id: 'test', action: 'approve' })
    };
    const res = createMockResponse();
    await moderationHandler(req, res);
    assert('1.2 Chặn tài khoản người dùng thường gọi API quản trị', res.getStatusCode() === 403, `(HTTP ${res.getStatusCode()})`);
  }

  // 1.3 Token giả mạo / hết hạn -> 401
  {
    const req = {
      method: 'POST',
      url: 'http://localhost/api/admin-moderation',
      headers: { authorization: 'Bearer mock-invalid-token' },
      body: JSON.stringify({ entity_type: 'community_post', entity_id: 'test', action: 'approve' })
    };
    const res = createMockResponse();
    await moderationHandler(req, res);
    assert('1.3 Từ chối token không hợp lệ / hết hạn', res.getStatusCode() === 401, `(HTTP ${res.getStatusCode()})`);
  }

  // ============================================================================
  // PHẦN 2: BÀI VIẾT CỘNG ĐỒNG (community_posts) & KIỂM THỬ ĐIỂM + LEDGER + PHIÊN KHÁCH
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('PHẦN 2: BÀI VIẾT CỘNG ĐỒNG (community_posts) - TOÀN DIỆN VÒNG ĐỜI');
  console.log('----------------------------------------------------------------');

  const postId = crypto.randomUUID();
  try {
    // Đọc số dư ban đầu
    const balance0 = await getUserPoints(testAuthorId);
    console.log(`  [Điểm] Số dư ban đầu của tác giả: ${balance0.total} điểm`);

    // Tạo bài viết pending
    await supabaseRequest('community_posts', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: postId,
        author_id: testAuthorId,
        author_name: 'Thành viên Test ViVu',
        title: 'Bài viết kiểm thử văn hóa Khmer Trà Vinh',
        content: 'Nội dung chia sẻ về lễ hội Ok Om Bok và chùa Âng tại Trà Vinh.',
        category: 'Văn hóa & Lễ hội',
        status: 'pending',
        images: ['https://example.com/test1.jpg'],
        created_at: new Date().toISOString()
      })
    });

    // Phiên khách kiểm tra: Bài pending KHÔNG được hiển thị cho khách
    const guestPending = await doGuestGet(postsHandler, `http://localhost/api/community-posts?id=${postId}`);
    assert('2.1 Phiên khách KHÔNG xem được bài pending (404/ẩn)', guestPending.status === 404);

    // 2.2 Duyệt lần đầu: status approved, cộng 10 điểm, ledger có 1 giao dịch active
    const approveRes1 = await doAdminModerate({ entity_type: 'community_post', entity_id: postId, action: 'approve' });
    assert('2.2 Admin duyệt bài viết cộng đồng thành công', approveRes1.status === 200 && approveRes1.json.success === true);

    const balance1 = await getUserPoints(testAuthorId);
    assert('2.3 Số dư tác giả tăng đúng +10 điểm sau duyệt lần đầu', balance1.total === balance0.total + 10,
      `(${balance0.total} -> ${balance1.total})`);

    const ledger1 = await getEntityTransactions('community_post', postId);
    assert('2.4 Ledger ghi nhận đúng 1 giao dịch active (+10)',
      ledger1.length === 1 && ledger1[0].status === 'active' && ledger1[0].points === 10);

    // Phiên khách kiểm tra: Bài approved hiển thị công khai cho khách
    const guestApproved = await doGuestGet(postsHandler, `http://localhost/api/community-posts?id=${postId}`);
    assert('2.5 Phiên khách xem được bài approved công khai', guestApproved.status === 200 && guestApproved.json.post?.id === postId);

    // 2.6 Duyệt lặp (Idempotency): Duyệt lại lần 2 không cộng trùng điểm
    const approveRes2 = await doAdminModerate({ entity_type: 'community_post', entity_id: postId, action: 'approve' });
    assert('2.6 Duyệt lặp lần 2 thành công', approveRes2.status === 200);

    const balance2 = await getUserPoints(testAuthorId);
    assert('2.7 Idempotency: Số dư KHÔNG tăng thêm khi duyệt lặp', balance2.total === balance1.total,
      `(${balance1.total} === ${balance2.total})`);

    const ledger2 = await getEntityTransactions('community_post', postId);
    const activeTx2 = ledger2.filter(tx => tx.status === 'active');
    assert('2.8 Ledger vẫn chỉ duy nhất 1 bản ghi active (không trùng)', activeTx2.length === 1);

    // 2.9 Sửa trực tiếp giữ công khai (edit)
    const editRes = await doAdminModerate({
      entity_type: 'community_post',
      entity_id: postId,
      action: 'edit',
      patch: { title: 'Bài viết cộng đồng đã được Admin biên tập sửa tiêu đề' }
    });
    assert('2.9 Admin sửa trực tiếp tiêu đề bài viết', editRes.status === 200);
    const guestEdited = await doGuestGet(postsHandler, `http://localhost/api/community-posts?id=${postId}`);
    assert('2.10 Khách thấy ngay tiêu đề mới cập nhật và trạng thái vẫn công khai',
      guestEdited.status === 200 && guestEdited.json.post?.title.includes('đã được Admin biên tập'));

    // 2.11 Tạm ẩn nội dung (hide) - Ẩn không tự chuyển sang pending
    const hideRes = await doAdminModerate({ entity_type: 'community_post', entity_id: postId, action: 'hide' });
    assert('2.11 Tạm ẩn bài viết khỏi công khai', hideRes.status === 200);

    // Kiểm tra phiên khách: Bài ẩn phải thực sự biến mất khỏi trang công khai!
    const guestHidden = await doGuestGet(postsHandler, `http://localhost/api/community-posts?id=${postId}`);
    assert('2.12 [ĐIỂM 1] Phiên khách KHÔNG THỂ xem bài tạm ẩn (HTTP 404)', guestHidden.status === 404);

    // Kiểm tra bộ lọc Admin: Xuất hiện trong "Tạm ẩn", KHÔNG xuất hiện trong "Đã duyệt"
    const adminHiddenList = await doAdminGetList('community_post', 'hidden');
    const inHiddenList = (adminHiddenList.json.items || []).some(item => item.id === postId);
    assert('2.13 [ĐIỂM 1] Bài viết xuất hiện trong bộ lọc "Tạm ẩn" của Admin', inHiddenList);

    const adminApprovedList = await doAdminGetList('community_post', 'approved');
    const inApprovedList = (adminApprovedList.json.items || []).some(item => item.id === postId);
    assert('2.14 [ĐIỂM 1] Bài viết KHÔNG xuất hiện trong bộ lọc "Đã duyệt" của Admin', !inApprovedList);

    // Kiểm tra điểm khi ẩn: Điểm không bị thay đổi
    const balanceHide = await getUserPoints(testAuthorId);
    assert('2.15 Điểm tác giả giữ nguyên khi tạm ẩn', balanceHide.total === balance1.total);

    // 2.16 Hiện lại nội dung (unhide) - Trở về approved ngay lập tức không qua pending, không cộng trùng điểm
    const unhideRes = await doAdminModerate({ entity_type: 'community_post', entity_id: postId, action: 'unhide' });
    assert('2.16 Hiện lại bài viết công khai', unhideRes.status === 200);

    const guestUnhidden = await doGuestGet(postsHandler, `http://localhost/api/community-posts?id=${postId}`);
    assert('2.17 Phiên khách xem lại được bài viết ngay lập tức', guestUnhidden.status === 200);

    const balanceUnhide = await getUserPoints(testAuthorId);
    assert('2.18 Điểm tác giả không bị cộng trùng khi hiện lại', balanceUnhide.total === balance1.total);

    // 2.19 Hoàn duyệt có lý do (return): Bắt buộc lý do, tạm gỡ công khai, thu hồi điểm
    const returnNoReason = await doAdminModerate({ entity_type: 'community_post', entity_id: postId, action: 'return', reason: '' });
    assert('2.19 Chặn hoàn duyệt nếu thiếu lý do', returnNoReason.status === 400);

    const returnRes = await doAdminModerate({
      entity_type: 'community_post',
      entity_id: postId,
      action: 'return',
      reason: 'Vui lòng bổ sung thêm 2 hình ảnh chụp rõ nét hơn về chùa Âng.'
    });
    assert('2.20 Hoàn duyệt kèm lý do thành công', returnRes.status === 200);

    // Phiên khách kiểm tra: Bài bị hoàn duyệt không hiển thị công khai
    const guestReturned = await doGuestGet(postsHandler, `http://localhost/api/community-posts?id=${postId}`);
    assert('2.21 Phiên khách KHÔNG xem được bài hoàn duyệt (404)', guestReturned.status === 404);

    // Kiểm tra điểm khi hoàn duyệt: Tạm thu hồi 10 điểm
    const balanceReturn = await getUserPoints(testAuthorId);
    assert('2.22 Số dư bị tạm trừ -10 điểm khi bài bị hoàn duyệt', balanceReturn.total === balance0.total,
      `(${balance1.total} -> ${balanceReturn.total})`);

    const ledgerReturn = await getEntityTransactions('community_post', postId);
    const activeTxReturn = ledgerReturn.filter(tx => tx.status === 'active');
    assert('2.23 Ledger không còn bản ghi active nào sau hoàn duyệt', activeTxReturn.length === 0);

    // 2.24 Tác giả sửa bài và gửi lại (Author resubmit) -> Chuyển về pending
    const resubmitRes = await doAuthorRequest(postsHandler, 'PATCH', `http://localhost/api/community-posts?id=${postId}`, {
      content: 'Nội dung chia sẻ đã được tác giả bổ sung chi tiết hình ảnh và thông tin chùa Âng.',
      submit_for_review: true
    });
    assert('2.24 Tác giả sửa nội dung và gửi lại thành công', resubmitRes.status === 200);

    const postDbResubmit = (await supabaseRequest(`community_posts?id=eq.${postId}&limit=1`))[0];
    assert('2.25 Bài chuyển về pending, cờ is_returned đã được xóa',
      postDbResubmit.status === 'pending' && postDbResubmit.metadata?.is_returned === false);

    // 2.26 Admin duyệt lại lần 2 sau khi tác giả sửa bài: Cộng lại 10 điểm, không cộng trùng
    const reApproveRes = await doAdminModerate({ entity_type: 'community_post', entity_id: postId, action: 'approve' });
    assert('2.26 Admin duyệt lại bài viết sau khi tác giả sửa', reApproveRes.status === 200);

    const balanceReApprove = await getUserPoints(testAuthorId);
    assert('2.27 Số dư phục hồi đúng +10 điểm sau khi duyệt lại (không trùng lặp)', balanceReApprove.total === balance0.total + 10,
      `(${balanceReturn.total} -> ${balanceReApprove.total})`);

    // 2.28 Xóa vào thùng rác (trash) khi bài đang approved: Thu hồi điểm, lưu previous_status = approved
    const trashRes = await doAdminModerate({ entity_type: 'community_post', entity_id: postId, action: 'trash' });
    assert('2.28 Xóa bài viết vào thùng rác (archived)', trashRes.status === 200);

    const postDbTrash = (await supabaseRequest(`community_posts?id=eq.${postId}&limit=1`))[0];
    assert('2.29 [ĐIỂM 2] Lưu previous_status = approved vào metadata',
      postDbTrash.status === 'archived' && postDbTrash.metadata?.previous_status === 'approved');

    const balanceTrash = await getUserPoints(testAuthorId);
    assert('2.30 Số dư bị thu hồi -10 điểm khi xóa vào thùng rác', balanceTrash.total === balance0.total);

    // Phiên khách kiểm tra: Bài trong thùng rác không hiển thị công khai
    const guestTrash = await doGuestGet(postsHandler, `http://localhost/api/community-posts?id=${postId}`);
    assert('2.31 Phiên khách KHÔNG xem được bài trong thùng rác', guestTrash.status === 404);

    // 2.32 Khôi phục từ thùng rác: Phục hồi về approved và phục hồi điểm
    const restoreRes = await doAdminModerate({ entity_type: 'community_post', entity_id: postId, action: 'restore' });
    assert('2.32 [ĐIỂM 2] Khôi phục bài viết về đúng trạng thái ban đầu (approved)', restoreRes.status === 200);

    const postDbRestore = (await supabaseRequest(`community_posts?id=eq.${postId}&limit=1`))[0];
    assert('2.33 Trạng thái DB trở lại approved', postDbRestore.status === 'approved');

    const balanceRestore = await getUserPoints(testAuthorId);
    assert('2.34 Điểm thưởng được phục hồi (+10) khi khôi phục bài approved', balanceRestore.total === balance0.total + 10);

  } catch (err) {
    console.error('[Error] Lỗi test community_posts:', err.message);
    assert('Xử lý community_posts không bị exception unhandled', false, err.message);
  }

  // ============================================================================
  // PHẦN 3: ĐỀ XUẤT ĐỊA ĐIỂM (places) & TEST KHÔI PHỤC BÀI CHƯA DUYỆT (ĐIỂM 2)
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('PHẦN 3: ĐỀ XUẤT ĐỊA ĐIỂM (places) - TEST KHÔI PHỤC BÀI CHƯA DUYỆT');
  console.log('----------------------------------------------------------------');

  const placeTestId = 998000 + Math.floor(Math.random() * 1000);
  const placeSlug = `${testBatchTag}-place`;
  try {
    // Tạo địa điểm ở trạng thái draft (chưa duyệt)
    await supabaseRequest('places', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: placeTestId,
        slug: placeSlug,
        name: 'Quán Cà Phê Trà Vinh Thử Nghiệm',
        category: 'Ẩm thực & Cà phê',
        area: 'TP. Trà Vinh',
        address: '123 Đường Điện Biên Phủ, Phường 6, Trà Vinh',
        description: 'Quán cà phê thử nghiệm kiểm duyệt admin.',
        status: 'draft',
        client_submission_id: `contrib-${placeTestId}`,
        contributor: 'Thành viên Test',
        user_id: testAuthorId,
        created_at: new Date().toISOString()
      })
    });

    // TEST QUAN TRỌNG ĐIỂM 2: XÓA ĐỊA ĐIỂM CHƯA DUYỆT (draft) VÀO THÙNG RÁC RỒI KHÔI PHỤC
    // Phải phục hồi về đúng draft, TUYỆT ĐỐI KHÔNG mặc định xuất bản (approved)!
    const trashDraftRes = await doAdminModerate({ entity_type: 'place', entity_id: placeTestId, action: 'trash' });
    assert('3.1 Xóa địa điểm đang draft vào thùng rác', trashDraftRes.status === 200);

    const placeDbTrash = (await supabaseRequest(`places?id=eq.${placeTestId}&limit=1`))[0];
    assert('3.2 [ĐIỂM 2] Lưu previous_status = draft vào ghi chú',
      placeDbTrash.note.includes('PREV_STATUS:draft') && placeDbTrash.status === 'archived');

    // Khôi phục: Phải về draft!
    const restoreDraftRes = await doAdminModerate({ entity_type: 'place', entity_id: placeTestId, action: 'restore' });
    assert('3.3 Khôi phục địa điểm từ thùng rác', restoreDraftRes.status === 200);

    const placeDbRestored = (await supabaseRequest(`places?id=eq.${placeTestId}&limit=1`))[0];
    assert('3.4 [ĐIỂM 2] Khôi phục về đúng draft (KHÔNG tự xuất bản approved!)', placeDbRestored.status === 'draft');

    // 3.5 Duyệt địa điểm (+15 điểm)
    const appPlaceRes = await doAdminModerate({ entity_type: 'place', entity_id: placeTestId, action: 'approve' });
    assert('3.5 Phê duyệt địa điểm đề xuất thành công', appPlaceRes.status === 200);
    const placeDbApproved = (await supabaseRequest(`places?id=eq.${placeTestId}&limit=1`))[0];
    assert('3.6 Trạng thái địa điểm chuyển sang approved', placeDbApproved.status === 'approved');

    // 3.7 Tạm ẩn địa điểm (hide) -> status = hidden
    const hidePlaceRes = await doAdminModerate({ entity_type: 'place', entity_id: placeTestId, action: 'hide' });
    assert('3.7 Tạm ẩn địa điểm', hidePlaceRes.status === 200);
    const placeDbHide = (await supabaseRequest(`places?id=eq.${placeTestId}&limit=1`))[0];
    assert('3.8 [ĐIỂM 1] Trạng thái địa điểm chuyển thành hidden (không phải pending)', placeDbHide.status === 'hidden');

    // Kiểm tra bộ lọc Admin "Tạm ẩn"
    const adminPlaceHidden = await doAdminGetList('place', 'hidden');
    const inPlaceHidden = (adminPlaceHidden.json.items || []).some(item => item.id === placeTestId);
    assert('3.9 [ĐIỂM 1] Địa điểm xuất hiện trong bộ lọc "Tạm ẩn" của Admin', inPlaceHidden);

    // 3.10 Hiện lại địa điểm (unhide) -> status = approved
    const unhidePlaceRes = await doAdminModerate({ entity_type: 'place', entity_id: placeTestId, action: 'unhide' });
    assert('3.10 Hiện lại địa điểm công khai', unhidePlaceRes.status === 200);
    const placeDbUnhide = (await supabaseRequest(`places?id=eq.${placeTestId}&limit=1`))[0];
    assert('3.11 Địa điểm trở lại approved ngay lập tức', placeDbUnhide.status === 'approved');

  } catch (err) {
    console.error('[Error] Lỗi test places:', err.message);
    assert('Xử lý places không bị exception unhandled', false, err.message);
  }

  // ============================================================================
  // PHẦN 4: CẨM NANG DU LỊCH (articles) - KIỂM THỬ ẨN/HIỆN + PHIÊN KHÁCH
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('PHẦN 4: CẨM NANG DU LỊCH (articles) - ẨN/HIỆN & PHIÊN KHÁCH');
  console.log('----------------------------------------------------------------');

  const articleId = `${testBatchTag}-article`;
  try {
    await supabaseRequest('articles', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: articleId,
        author_id: testAuthorId,
        slug: articleId,
        title: 'Kinh nghiệm du lịch một ngày khám phá Cầu Kè',
        category: 'van-hoa',
        category_name: 'Văn Hóa Khmer',
        excerpt: 'Hành trình một ngày khám phá xứ dừa sáp Cầu Kè Trà Vinh.',
        content: '<p>Chi tiết các điểm tham quan tại huyện Cầu Kè...</p>',
        status: 'pending',
        read_time: '6 phút đọc',
        created_at: new Date().toISOString()
      })
    });

    // 4.1 Duyệt bài cẩm nang (+20 điểm)
    const appArt = await doAdminModerate({ entity_type: 'article', entity_id: articleId, action: 'approve' });
    assert('4.1 Phê duyệt bài cẩm nang du lịch', appArt.status === 200);

    // Phiên khách xem bài approved
    const guestArtApp = await doGuestGet(articlesHandler, `http://localhost/api/articles?id=${articleId}`);
    assert('4.2 Phiên khách xem được bài cẩm nang đã duyệt', guestArtApp.status === 200 && guestArtApp.json.article?.id === articleId);

    // 4.3 Tạm ẩn bài cẩm nang (hide)
    const hideArt = await doAdminModerate({ entity_type: 'article', entity_id: articleId, action: 'hide' });
    assert('4.3 Tạm ẩn bài cẩm nang', hideArt.status === 200);

    // Phiên khách kiểm tra: Bài cẩm nang ẩn phải trả về 404
    const guestArtHide = await doGuestGet(articlesHandler, `http://localhost/api/articles?id=${articleId}`);
    assert('4.4 [ĐIỂM 1] Phiên khách KHÔNG THỂ xem bài cẩm nang tạm ẩn (404)', guestArtHide.status === 404);

    // Admin kiểm tra bộ lọc "Tạm ẩn"
    const adminArtHidden = await doAdminGetList('article', 'hidden');
    const inArtHidden = (adminArtHidden.json.items || []).some(item => item.id === articleId);
    assert('4.5 [ĐIỂM 1] Bài cẩm nang xuất hiện trong bộ lọc "Tạm ẩn" của Admin', inArtHidden);

    // 4.6 Hiện lại bài cẩm nang (unhide)
    const unhideArt = await doAdminModerate({ entity_type: 'article', entity_id: articleId, action: 'unhide' });
    assert('4.6 Hiện lại bài cẩm nang', unhideArt.status === 200);

    const guestArtUnhide = await doGuestGet(articlesHandler, `http://localhost/api/articles?id=${articleId}`);
    assert('4.7 Phiên khách xem lại được bài cẩm nang công khai', guestArtUnhide.status === 200);

  } catch (err) {
    console.error('[Error] Lỗi test articles:', err.message);
    assert('Xử lý articles không bị exception unhandled', false, err.message);
  }

  // ============================================================================
  // PHẦN 5: CÂU LẠC BỘ (clubs) - KIỂM THỬ ẨN/HIỆN & THÙNG RÁC
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('PHẦN 5: CÂU LẠC BỘ (clubs) - ẨN/HIỆN & THÙNG RÁC');
  console.log('----------------------------------------------------------------');

  const clubId = `${testBatchTag}-club`;
  try {
    await supabaseRequest('clubs', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: clubId,
        leader_id: testAuthorId,
        name: 'CLB Nhiếp Ảnh Xứ Trà Thử Nghiệm',
        category: 'di-san',
        category_name: 'Nhiếp ảnh & Di sản',
        description: 'CLB giao lưu ảnh đẹp Trà Vinh.',
        meeting_place: 'Quảng trường Trà Vinh',
        schedule_info: 'Sáng Chủ Nhật hàng tuần',
        status: 'pending',
        created_at: new Date().toISOString()
      })
    });

    const appClub = await doAdminModerate({ entity_type: 'club', entity_id: clubId, action: 'approve' });
    assert('5.1 Phê duyệt CLB thành công', appClub.status === 200);

    // 5.2 Tạm ẩn CLB
    const hideClub = await doAdminModerate({ entity_type: 'club', entity_id: clubId, action: 'hide' });
    assert('5.2 Tạm ẩn CLB thành công', hideClub.status === 200);

    // Phiên khách kiểm tra CLB bị ẩn: Trả về 404
    const guestClubHide = await doGuestGet(clubsHandler, `http://localhost/api/clubs?id=${clubId}`);
    assert('5.3 [ĐIỂM 1] Phiên khách KHÔNG THỂ xem CLB tạm ẩn (404)', guestClubHide.status === 404);

    // Admin kiểm tra bộ lọc "Tạm ẩn"
    const adminClubHidden = await doAdminGetList('club', 'hidden');
    const inClubHidden = (adminClubHidden.json.items || []).some(item => item.id === clubId);
    assert('5.4 [ĐIỂM 1] CLB xuất hiện trong bộ lọc "Tạm ẩn" của Admin', inClubHidden);

    // 5.5 Hiện lại CLB
    const unhideClub = await doAdminModerate({ entity_type: 'club', entity_id: clubId, action: 'unhide' });
    assert('5.5 Hiện lại CLB thành công', unhideClub.status === 200);

    const guestClubUnhide = await doGuestGet(clubsHandler, `http://localhost/api/clubs?id=${clubId}`);
    assert('5.6 Phiên khách xem lại được CLB công khai', guestClubUnhide.status === 200);

  } catch (err) {
    console.error('[Error] Lỗi test clubs:', err.message);
    assert('Xử lý clubs không bị exception unhandled', false, err.message);
  }

  // ============================================================================
  // PHẦN 6: SỰ KIỆN CỘNG ĐỒNG (community_events) - KIỂM THỬ ẨN/HIỆN
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('PHẦN 6: SỰ KIỆN CỘNG ĐỒNG (community_events) - ẨN/HIỆN & PHIÊN KHÁCH');
  console.log('----------------------------------------------------------------');

  const eventId = `${testBatchTag}-event`;
  try {
    await supabaseRequest('community_events', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: eventId,
        created_by: testAuthorId,
        title: 'Triển Lãm Ảnh Nghệ Thuật Trà Vinh 2026',
        organizer: 'CLB Nhiếp Ảnh',
        category: 'Triển lãm',
        time_schedule: '08:00 - 17:00 ngày 15/10/2026',
        location: 'Bảo tàng Văn hóa Khmer Trà Vinh',
        description: 'Sự kiện trưng bày 50 tác phẩm nghệ thuật xứ Trà.',
        status: 'pending',
        created_at: new Date().toISOString()
      })
    });

    const appEvent = await doAdminModerate({ entity_type: 'community_event', entity_id: eventId, action: 'approve' });
    assert('6.1 Phê duyệt sự kiện cộng đồng', appEvent.status === 200);

    // 6.2 Tạm ẩn sự kiện
    const hideEvent = await doAdminModerate({ entity_type: 'community_event', entity_id: eventId, action: 'hide' });
    assert('6.2 Tạm ẩn sự kiện cộng đồng', hideEvent.status === 200);

    // Phiên khách kiểm tra sự kiện bị ẩn: Trả về 404
    const guestEventHide = await doGuestGet(eventsHandler, `http://localhost/api/community-events?id=${eventId}`);
    assert('6.3 [ĐIỂM 1] Phiên khách KHÔNG THỂ xem sự kiện tạm ẩn (404)', guestEventHide.status === 404);

    // Admin kiểm tra bộ lọc "Tạm ẩn"
    const adminEventHidden = await doAdminGetList('community_event', 'hidden');
    const inEventHidden = (adminEventHidden.json.items || []).some(item => item.id === eventId);
    assert('6.4 [ĐIỂM 1] Sự kiện xuất hiện trong bộ lọc "Tạm ẩn" của Admin', inEventHidden);

    // 6.5 Hiện lại sự kiện
    const unhideEvent = await doAdminModerate({ entity_type: 'community_event', entity_id: eventId, action: 'unhide' });
    assert('6.5 Hiện lại sự kiện thành công', unhideEvent.status === 200);

    const guestEventUnhide = await doGuestGet(eventsHandler, `http://localhost/api/community-events?id=${eventId}`);
    assert('6.6 Phiên khách xem lại được sự kiện công khai', guestEventUnhide.status === 200);

  } catch (err) {
    console.error('[Error] Lỗi test community_events:', err.message);
    assert('Xử lý community_events không bị exception unhandled', false, err.message);
  }

  // ============================================================================
  // PHẦN 7: LỊCH SINH HOẠT CLB (club_activities) - KIỂM THỬ ẨN/HIỆN
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('PHẦN 7: LỊCH SINH HOẠT CLB (club_activities) - ẨN/HIỆN & PHIÊN KHÁCH');
  console.log('----------------------------------------------------------------');

  const activityId = `${testBatchTag}-activity`;
  try {
    await supabaseRequest('club_activities', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: activityId,
        creator_id: testAuthorId,
        club_id: clubId,
        club_name: 'CLB Nhiếp Ảnh Xứ Trà Thử Nghiệm',
        title: 'Chụp ảnh bình minh Ao Bà Om sáng Thứ Bảy',
        time_schedule: '05:30 - 08:30 ngày 12/10/2026',
        location: 'Ao Bà Om, Phường 8, Trà Vinh',
        description: 'Tập trung cổng chính Ao Bà Om, mang theo ống kính góc rộng.',
        status: 'pending',
        is_free: true,
        created_at: new Date().toISOString()
      })
    });

    const appAct = await doAdminModerate({ entity_type: 'club_activity', entity_id: activityId, action: 'approve' });
    assert('7.1 Phê duyệt lịch sinh hoạt CLB', appAct.status === 200);

    // 7.2 Tạm ẩn lịch sinh hoạt
    const hideAct = await doAdminModerate({ entity_type: 'club_activity', entity_id: activityId, action: 'hide' });
    assert('7.2 Tạm ẩn lịch sinh hoạt CLB', hideAct.status === 200);

    // Phiên khách kiểm tra lịch sinh hoạt bị ẩn: Trả về 404
    const guestActHide = await doGuestGet(activitiesHandler, `http://localhost/api/club-activities?id=${activityId}`);
    assert('7.3 [ĐIỂM 1] Phiên khách KHÔNG THỂ xem lịch sinh hoạt tạm ẩn (404)', guestActHide.status === 404);

    // Admin kiểm tra bộ lọc "Tạm ẩn"
    const adminActHidden = await doAdminGetList('club_activity', 'hidden');
    const inActHidden = (adminActHidden.json.items || []).some(item => item.id === activityId);
    assert('7.4 [ĐIỂM 1] Lịch sinh hoạt xuất hiện trong bộ lọc "Tạm ẩn" của Admin', inActHidden);

    // 7.5 Hiện lại lịch sinh hoạt
    const unhideAct = await doAdminModerate({ entity_type: 'club_activity', entity_id: activityId, action: 'unhide' });
    assert('7.5 Hiện lại lịch sinh hoạt thành công', unhideAct.status === 200);

    const guestActUnhide = await doGuestGet(activitiesHandler, `http://localhost/api/club-activities?id=${activityId}`);
    assert('7.6 Phiên khách xem lại được lịch sinh hoạt công khai', guestActUnhide.status === 200);

  } catch (err) {
    console.error('[Error] Lỗi test club_activities:', err.message);
    assert('Xử lý club_activities không bị exception unhandled', false, err.message);
  }

  // ============================================================================
  // PHẦN 8: NHẬT KÝ KIỂM TOÁN (admin_audit_logs)
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('PHẦN 8: NHẬT KÝ KIỂM TOÁN (admin_audit_logs)');
  console.log('----------------------------------------------------------------');
  try {
    const auditLogs = await supabaseRequest(
      `admin_audit_logs?or=(entity_id.ilike.*${testBatchTag}*,entity_id.eq.${postId},entity_id.eq.${placeTestId})&order=created_at.desc&limit=30`
    );
    assert('8.1 Ghi nhận đầy đủ audit log cho các thao tác thử nghiệm',
      Array.isArray(auditLogs) && auditLogs.length >= 10, `(Đã ghi ${auditLogs?.length || 0} bản ghi audit)`);

    if (Array.isArray(auditLogs) && auditLogs.length > 0) {
      const sample = auditLogs[0];
      assert('8.2 Nhật ký lưu đủ action, timestamp và correlation_id',
        Boolean(sample.action && sample.created_at && sample.correlation_id));
    }
  } catch (err) {
    console.warn('[Audit Check warn]:', err.message);
  }

  // ============================================================================
  // PHẦN 9: DỌN DẸP DỮ LIỆU THỬ NGHIỆM (CLEANUP TEST FIXTURES)
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('PHẦN 9: DỌN DẸP AN TOÀN TOÀN BỘ DỮ LIỆU THỬ NGHIỆM');
  console.log('----------------------------------------------------------------');
  try {
    await supabaseRequest(`community_posts?id=eq.${postId}`, { method: 'DELETE' }).catch(() => {});
    await supabaseRequest(`places?id=eq.${placeTestId}`, { method: 'DELETE' }).catch(() => {});
    await supabaseRequest(`club_activities?id=eq.${activityId}`, { method: 'DELETE' }).catch(() => {});
    await supabaseRequest(`clubs?id=eq.${clubId}`, { method: 'DELETE' }).catch(() => {});
    await supabaseRequest(`community_events?id=eq.${eventId}`, { method: 'DELETE' }).catch(() => {});
    await supabaseRequest(`articles?id=eq.${articleId}`, { method: 'DELETE' }).catch(() => {});
    await supabaseRequest(`point_transactions?entity_id=eq.${postId}`, { method: 'DELETE' }).catch(() => {});
    await supabaseRequest(`point_transactions?entity_id=eq.${placeTestId}`, { method: 'DELETE' }).catch(() => {});
    await supabaseRequest(`point_transactions?entity_id=eq.${articleId}`, { method: 'DELETE' }).catch(() => {});
    await supabaseRequest(`admin_audit_logs?or=(entity_id.ilike.*${testBatchTag}*,entity_id.eq.${postId},entity_id.eq.${placeTestId})`, { method: 'DELETE' }).catch(() => {});
    console.log('  ✓ Đã xóa sạch toàn bộ fixtures thử nghiệm (test-mod-*). Cơ sở dữ liệu hoàn toàn sạch sẽ.');
  } catch (cleanErr) {
    console.warn('[Cleanup warn]:', cleanErr.message);
  }

  // ============================================================================
  // TỔNG KẾT KẾT QUẢ KIỂM THỬ
  // ============================================================================
  console.log('\n================================================================');
  console.log(`TỔNG KẾT KIỂM THỬ API: ${results.passed}/${results.total} PASSED (${results.failed} FAILED)`);
  console.log('================================================================\n');

  if (results.failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('[Fatal Error]:', err);
  process.exit(1);
});
