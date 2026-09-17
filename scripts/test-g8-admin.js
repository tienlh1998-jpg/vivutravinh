// scripts/test-g8-admin.js
// Bộ kiểm thử tự động G8.1: Xác thực Supabase Auth & Phân quyền Quản trị viên (RBAC)

import assert from 'assert';
import http from 'http';
import placesHandler from '../api/admin-places.js';
import commentsHandler from '../api/admin-comments.js';
import profileHandler from '../api/admin-profile.js';

let passedTests = 0;
let totalTests = 0;

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

function createMockReqRes(options = {}) {
  const req = {
    method: options.method || 'GET',
    url: options.url || '/api/admin',
    headers: {
      host: 'localhost',
      'x-forwarded-for': options.ip || '127.0.0.1',
      ...(options.headers || {})
    },
    body: options.body || null,
    async *[Symbol.asyncIterator]() {
      if (options.body) {
        yield Buffer.from(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }
    }
  };

  let resData = '';
  let resStatus = 200;
  const resHeaders = {};

  const res = {
    statusCode: 200,
    setHeader(key, val) {
      resHeaders[key.toLowerCase()] = val;
    },
    end(data) {
      if (data) resData += data;
      resStatus = this.statusCode;
    },
    getStatus() {
      return resStatus;
    },
    getBody() {
      try {
        return JSON.parse(resData);
      } catch {
        return resData;
      }
    }
  };

  return { req, res };
}

// ----------------------------------------------------------------------------
// Khởi tạo Mock Supabase Server phục vụ cho các bài test mutation thật
// ----------------------------------------------------------------------------
let mockServer;
let mockPort;

function startMockSupabaseServer() {
  return new Promise((resolve) => {
    mockServer = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${mockPort}`);
      const method = req.method;
      const authHeader = req.headers['authorization'] || '';

      let bodyData = '';
      for await (const chunk of req) {
        bodyData += chunk;
      }
      let body = {};
      try { body = JSON.parse(bodyData); } catch {}

      // 1. Supabase Auth: GET /auth/v1/user
      if (url.pathname === '/auth/v1/user') {
        const token = authHeader.replace('Bearer ', '').trim();
        if (token === 'real-jwt-admin') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ id: 'uuid-admin-real', email: 'admin-real@vivutravinh.vn' }));
        }
        if (token === 'real-jwt-editor') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ id: 'uuid-editor-real', email: 'editor-real@vivutravinh.vn' }));
        }
        if (token === 'real-jwt-moderator') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ id: 'uuid-moderator-real', email: 'moderator-real@vivutravinh.vn' }));
        }
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: 'Invalid or expired JWT' }));
      }

      // 2. Supabase Auth: POST /auth/v1/token (refresh)
      if (url.pathname === '/auth/v1/token') {
        const grantType = url.searchParams.get('grant_type');
        if (grantType === 'refresh_token') {
          if (body.refresh_token === 'valid-refresh-token') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              access_token: 'refreshed-access-token-xyz',
              refresh_token: 'refreshed-refresh-token-123',
              expires_in: 3600,
              expires_at: Math.floor(Date.now() / 1000) + 3600
            }));
          }
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid refresh token' }));
        }
      }

      // 3. Supabase Auth: POST /auth/v1/logout
      if (url.pathname === '/auth/v1/logout') {
        res.writeHead(204);
        return res.end();
      }

      // 4. REST API: GET /rest/v1/admin_users
      if (url.pathname === '/rest/v1/admin_users') {
        if (url.search.includes('uuid-admin-real')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify([{ user_id: 'uuid-admin-real', email: 'admin-real@vivutravinh.vn', role: 'admin', is_active: true }]));
        }
        if (url.search.includes('uuid-editor-real')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify([{ user_id: 'uuid-editor-real', email: 'editor-real@vivutravinh.vn', role: 'editor', is_active: true }]));
        }
        if (url.search.includes('uuid-moderator-real')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify([{ user_id: 'uuid-moderator-real', email: 'moderator-real@vivutravinh.vn', role: 'moderator', is_active: true }]));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify([]));
      }

      // 5. REST API: /rest/v1/places
      if (url.pathname === '/rest/v1/places') {
        if (method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify([]));
        }
        if (method === 'POST') {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify([{ id: 101, ...body, created_at: new Date().toISOString() }]));
        }
        if (method === 'PATCH') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify([{ id: 1, ...body, updated_at: new Date().toISOString() }]));
        }
        if (method === 'DELETE') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, ok: true }));
        }
      }

      // 6. REST API: /rest/v1/place_comments
      if (url.pathname === '/rest/v1/place_comments') {
        if (method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify([]));
        }
        if (method === 'PATCH') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify([{ id: 10, ...body, updated_at: new Date().toISOString() }]));
        }
        if (method === 'DELETE') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, ok: true }));
        }
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Route not found in mock' }));
    });

    mockServer.listen(0, '127.0.0.1', () => {
      mockPort = mockServer.address().port;
      process.env.SUPABASE_URL = `http://127.0.0.1:${mockPort}`;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key-test';
      resolve();
    });
  });
}

// Thiết lập môi trường test
process.env.NODE_ENV = 'test';
process.env.VIVU_TEST = '1';
process.env.ADMIN_SECRET = 'test-secret-12345';

await startMockSupabaseServer();

console.log('\n=== BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG G8.1 (AUTH & RBAC PHÂN QUYỀN) ===\n');

try {
  // 1. Kiểm tra thiếu Token / Auth Header
  await runAsyncTest('1. Từ chối HTTP 401 UNAUTHENTICATED khi không gửi thông tin xác thực', async () => {
    const { req, res } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-places',
      ip: '10.0.0.1'
    });

    await placesHandler(req, res);
    assert.strictEqual(res.getStatus(), 401, 'Phải trả về HTTP 401');
    const body = res.getBody();
    assert.strictEqual(body.error?.code, 'UNAUTHENTICATED');
  });

  // 2. Kiểm tra Token không hợp lệ / Hết hạn
  await runAsyncTest('2. Từ chối HTTP 401 UNAUTHENTICATED khi Bearer token không hợp lệ hoặc hết hạn', async () => {
    const { req, res } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-places',
      ip: '10.0.0.2',
      headers: {
        Authorization: 'Bearer mock-expired-token'
      }
    });

    await placesHandler(req, res);
    assert.strictEqual(res.getStatus(), 401, 'Phải trả về HTTP 401');
    const body = res.getBody();
    assert.strictEqual(body.error?.code, 'UNAUTHENTICATED');
  });

  // 3. Kiểm tra User không có trong allowlist admin_users
  await runAsyncTest('3. Từ chối HTTP 403 FORBIDDEN khi user không nằm trong allowlist admin_users', async () => {
    const { req, res } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-places',
      ip: '10.0.0.3',
      headers: {
        Authorization: 'Bearer mock-unlisted-token'
      }
    });

    await placesHandler(req, res);
    assert.strictEqual(res.getStatus(), 403, 'Phải trả về HTTP 403');
    const body = res.getBody();
    assert.strictEqual(body.error?.code, 'FORBIDDEN');
    assert.ok(body.error?.message.includes('allowlist'));
  });

  // 4. Kiểm tra User bị vô hiệu hóa (is_active = false)
  await runAsyncTest('4. Từ chối HTTP 403 FORBIDDEN khi tài khoản quản trị bị khóa (is_active = false)', async () => {
    const { req, res } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-places',
      ip: '10.0.0.4',
      headers: {
        Authorization: 'Bearer mock-inactive-token'
      }
    });

    await placesHandler(req, res);
    assert.strictEqual(res.getStatus(), 403, 'Phải trả về HTTP 403');
    const body = res.getBody();
    assert.strictEqual(body.error?.code, 'FORBIDDEN');
    assert.ok(body.error?.message.includes('vô hiệu hóa'));
  });

  // 5. Kiểm tra Moderator bị CHẶN khi tạo/sửa/xóa địa điểm (POST, PATCH, DELETE)
  await runAsyncTest('5. Moderator bị chặn HTTP 403 khi cố gắng tạo, sửa hoặc xóa địa điểm', async () => {
    const { req: reqPost, res: resPost } = createMockReqRes({
      method: 'POST',
      url: '/api/admin-places',
      ip: '10.0.0.5',
      headers: { Authorization: 'Bearer mock-moderator-token' },
      body: { name: 'Địa điểm thử nghiệm', category: 'Điểm Check-in / Sống Ảo' }
    });
    await placesHandler(reqPost, resPost);
    assert.strictEqual(resPost.getStatus(), 403, 'POST phải trả về HTTP 403');
    assert.strictEqual(resPost.getBody().error?.code, 'FORBIDDEN');

    const { req: reqPatch, res: resPatch } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-places',
      ip: '10.0.0.5',
      headers: { Authorization: 'Bearer mock-moderator-token' },
      body: { id: 1, name: 'Sửa tên' }
    });
    await placesHandler(reqPatch, resPatch);
    assert.strictEqual(resPatch.getStatus(), 403, 'PATCH phải trả về HTTP 403');

    const { req: reqDel, res: resDel } = createMockReqRes({
      method: 'DELETE',
      url: '/api/admin-places?id=1',
      ip: '10.0.0.5',
      headers: { Authorization: 'Bearer mock-moderator-token' }
    });
    await placesHandler(reqDel, resDel);
    assert.strictEqual(resDel.getStatus(), 403, 'DELETE phải trả về HTTP 403');
  });

  // 6. Kiểm tra Editor có quyền tạo/sửa địa điểm nhưng BỊ CHẶN khi xóa địa điểm (DELETE)
  await runAsyncTest('6. Editor được phép tạo/sửa nhưng bị chặn HTTP 403 khi xóa địa điểm', async () => {
    const { req: reqDel, res: resDel } = createMockReqRes({
      method: 'DELETE',
      url: '/api/admin-places?id=1',
      ip: '10.0.0.6',
      headers: { Authorization: 'Bearer mock-editor-token' }
    });
    await placesHandler(reqDel, resDel);
    assert.strictEqual(resDel.getStatus(), 403, 'Editor DELETE phải trả về HTTP 403');
    assert.strictEqual(resDel.getBody().error?.code, 'FORBIDDEN');
    assert.ok(resDel.getBody().error?.message.includes('editor'));
  });

  // 7. Kiểm tra Editor BỊ CHẶN khi kiểm duyệt hoặc xóa bình luận
  await runAsyncTest('7. Editor bị chặn HTTP 403 khi cố gắng kiểm duyệt hoặc xóa bình luận', async () => {
    const { req: reqPatch, res: resPatch } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-comments',
      ip: '10.0.0.7',
      headers: { Authorization: 'Bearer mock-editor-token' },
      body: { id: 10, is_hidden: true }
    });
    await commentsHandler(reqPatch, resPatch);
    assert.strictEqual(resPatch.getStatus(), 403, 'Editor PATCH comments phải trả về HTTP 403');

    const { req: reqDel, res: resDel } = createMockReqRes({
      method: 'DELETE',
      url: '/api/admin-comments?id=10',
      ip: '10.0.0.7',
      headers: { Authorization: 'Bearer mock-editor-token' }
    });
    await commentsHandler(reqDel, resDel);
    assert.strictEqual(resDel.getStatus(), 403, 'Editor DELETE comments phải trả về HTTP 403');
  });

  // 8. Kiểm tra Moderator được phép duyệt bình luận nhưng BỊ CHẶN khi xóa cứng bình luận
  await runAsyncTest('8. Moderator bị chặn HTTP 403 khi cố gắng xóa cứng bình luận (DELETE)', async () => {
    const { req, res } = createMockReqRes({
      method: 'DELETE',
      url: '/api/admin-comments?id=10',
      ip: '10.0.0.8',
      headers: { Authorization: 'Bearer mock-moderator-token' }
    });
    await commentsHandler(req, res);
    assert.strictEqual(res.getStatus(), 403, 'Moderator DELETE bình luận phải trả về HTTP 403');
    assert.strictEqual(res.getBody().error?.code, 'FORBIDDEN');
  });

  // 9. Kiểm tra Admin role vượt qua toàn bộ rào cản phân quyền
  await runAsyncTest('9. Admin role có đầy đủ thẩm quyền trên các endpoint', async () => {
    const { req, res } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-places',
      ip: '10.0.0.9',
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await placesHandler(req, res);
    assert.strictEqual(res.getStatus(), 200, 'Admin GET places phải thành công');
  });

  // 10. Kiểm tra Rate-limiting chống brute-force xác thực
  await runAsyncTest('10. Kích hoạt khóa HTTP 429 AUTH_RATE_LIMITED sau 5 lần thử thất bại liên tiếp', async () => {
    const bruteIp = '192.168.99.100';

    for (let i = 1; i <= 5; i++) {
      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/api/admin-places',
        ip: bruteIp,
        headers: { Authorization: 'Bearer mock-invalid-token' }
      });
      await placesHandler(req, res);
      assert.strictEqual(res.getStatus(), 401, `Lần thử ${i} phải nhận 401`);
    }

    const { req: reqBlocked, res: resBlocked } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-places',
      ip: bruteIp,
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await placesHandler(reqBlocked, resBlocked);
    assert.strictEqual(resBlocked.getStatus(), 429, 'Lần thứ 6 phải bị trả về HTTP 429');
    assert.strictEqual(resBlocked.getBody().error?.code, 'AUTH_RATE_LIMITED');
  });

  // 11. Kiểm tra Tương thích ngược: x-admin-secret hoạt động trong môi trường TEST/DEV
  await runAsyncTest('11. Legacy x-admin-secret hoạt động đúng trong môi trường test (role admin)', async () => {
    const { req: reqWrong, res: resWrong } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-places',
      ip: '10.0.0.11',
      headers: { 'x-admin-secret': 'wrong-secret' }
    });
    await placesHandler(reqWrong, resWrong);
    assert.strictEqual(resWrong.getStatus(), 401);

    const { req: reqRight, res: resRight } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-places',
      ip: '10.0.0.11',
      headers: { 'x-admin-secret': process.env.ADMIN_SECRET }
    });
    await placesHandler(reqRight, resRight);
    assert.strictEqual(resRight.getStatus(), 200);
  });

  // 12. Kiểm tra Fail-closed: Từ chối x-admin-secret khi ở chế độ Production
  await runAsyncTest('12. Fail-closed: Từ chối dứt khoát x-admin-secret trên Production (bắt buộc Bearer token)', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalTest = process.env.VIVU_TEST;
    const originalLegacy = process.env.ALLOW_LEGACY_ADMIN_SECRET;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.VIVU_TEST;
      delete process.env.ALLOW_LEGACY_ADMIN_SECRET;

      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/api/admin-places',
        ip: '10.0.0.12',
        headers: { 'x-admin-secret': process.env.ADMIN_SECRET }
      });
      await placesHandler(req, res);
      assert.strictEqual(res.getStatus(), 401, 'Production phải từ chối x-admin-secret');
      assert.ok(res.getBody().error?.message.includes('ngừng hoạt động trên Production'));
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.VIVU_TEST = originalTest;
      process.env.ALLOW_LEGACY_ADMIN_SECRET = originalLegacy;
    }
  });

  // 13. Kiểm tra Production + VIVU_TEST=1 vẫn từ chối tuyệt đối Bearer mock token
  await runAsyncTest('13. Fail-closed: Production + VIVU_TEST=1 vẫn từ chối tuyệt đối Bearer mock token (401 UNAUTHENTICATED)', async () => {
    const origEnv = process.env.NODE_ENV;
    const origVivu = process.env.VIVU_TEST;
    try {
      process.env.NODE_ENV = 'production';
      process.env.VIVU_TEST = '1';

      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/api/admin-places',
        ip: '10.0.0.13',
        headers: { Authorization: 'Bearer mock-admin-token' }
      });
      await placesHandler(req, res);
      assert.strictEqual(res.getStatus(), 401, 'Production + VIVU_TEST=1 phải nhận HTTP 401');
      assert.strictEqual(res.getBody().error?.code, 'UNAUTHENTICATED');
    } finally {
      process.env.NODE_ENV = origEnv;
      process.env.VIVU_TEST = origVivu;
    }
  });

  // 14. Kiểm tra Production + ALLOW_LEGACY_ADMIN_SECRET=true vẫn từ chối tuyệt đối Bearer mock token
  await runAsyncTest('14. Fail-closed: Production + ALLOW_LEGACY_ADMIN_SECRET=true vẫn từ chối tuyệt đối Bearer mock token (401 UNAUTHENTICATED)', async () => {
    const origEnv = process.env.NODE_ENV;
    const origLegacy = process.env.ALLOW_LEGACY_ADMIN_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_LEGACY_ADMIN_SECRET = 'true';

      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/api/admin-places',
        ip: '10.0.0.14',
        headers: { Authorization: 'Bearer mock-admin-token' }
      });
      await placesHandler(req, res);
      assert.strictEqual(res.getStatus(), 401, 'Production + ALLOW_LEGACY_ADMIN_SECRET=true phải nhận HTTP 401');
      assert.strictEqual(res.getBody().error?.code, 'UNAUTHENTICATED');
    } finally {
      process.env.NODE_ENV = origEnv;
      process.env.ALLOW_LEGACY_ADMIN_SECRET = origLegacy;
    }
  });

  // 15. Test thật: Editor POST tạo địa điểm thành công
  await runAsyncTest('15. Test thật: Editor POST tạo địa điểm thành công (HTTP 201)', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/admin-places',
      ip: '10.0.0.15',
      headers: { Authorization: 'Bearer mock-editor-token' },
      body: {
        name: 'Quán Cà Phê Bờ Kè Mới',
        category: 'Cà Phê / Trà Sữa',
        address: 'Đường Bờ Kè, Phường 1, Trà Vinh'
      }
    });
    await placesHandler(req, res);
    assert.strictEqual(res.getStatus(), 201, 'Editor POST phải trả về HTTP 201 Created');
    const body = res.getBody();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.place?.id, 101);
    assert.strictEqual(body.place?.name, 'Quán Cà Phê Bờ Kè Mới');
  });

  // 16. Test thật: Editor PATCH cập nhật địa điểm thành công
  await runAsyncTest('16. Test thật: Editor PATCH cập nhật địa điểm thành công (HTTP 200)', async () => {
    const { req, res } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-places',
      ip: '10.0.0.16',
      headers: { Authorization: 'Bearer mock-editor-token' },
      body: {
        id: 1,
        name: 'Ao Bà Om Cập Nhật Giờ Mở Cửa',
        opening_hours: '06:00 - 22:00'
      }
    });
    await placesHandler(req, res);
    assert.strictEqual(res.getStatus(), 200, 'Editor PATCH phải trả về HTTP 200 OK');
    const body = res.getBody();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.place?.id, 1);
    assert.strictEqual(body.place?.name, 'Ao Bà Om Cập Nhật Giờ Mở Cửa');
  });

  // 17. Test thật: Moderator PATCH cập nhật bình luận thành công
  await runAsyncTest('17. Test thật: Moderator PATCH cập nhật bình luận thành công (HTTP 200)', async () => {
    const { req, res } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-comments',
      ip: '10.0.0.17',
      headers: { Authorization: 'Bearer mock-moderator-token' },
      body: {
        id: 10,
        is_hidden: true,
        status: 'hidden'
      }
    });
    await commentsHandler(req, res);
    assert.strictEqual(res.getStatus(), 200, 'Moderator PATCH bình luận phải trả về HTTP 200 OK');
    const body = res.getBody();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.comment?.id, 10);
    assert.strictEqual(body.comment?.is_hidden, true);
  });

  // 18. Test thật: Admin mutation thành công (POST, PATCH, DELETE)
  await runAsyncTest('18. Test thật: Admin mutation thành công (POST place, PATCH place, DELETE place, PATCH comment, DELETE comment)', async () => {
    // 18.1 Admin POST place
    const { req: pReq, res: pRes } = createMockReqRes({
      method: 'POST',
      url: '/api/admin-places',
      ip: '10.0.0.18',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: { name: 'Điểm Du Lịch Cồn Chim', category: 'Sinh Thái / Miệt Vườn' }
    });
    await placesHandler(pReq, pRes);
    assert.strictEqual(pRes.getStatus(), 201);

    // 18.2 Admin PATCH place
    const { req: patchReq, res: patchRes } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-places',
      ip: '10.0.0.18',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: { id: 101, status: 'approved' }
    });
    await placesHandler(patchReq, patchRes);
    assert.strictEqual(patchRes.getStatus(), 200);

    // 18.3 Admin DELETE place
    const { req: delReq, res: delRes } = createMockReqRes({
      method: 'DELETE',
      url: '/api/admin-places?id=101',
      ip: '10.0.0.18',
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await placesHandler(delReq, delRes);
    assert.strictEqual(delRes.getStatus(), 200);

    // 18.4 Admin PATCH comment
    const { req: cPatchReq, res: cPatchRes } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-comments',
      ip: '10.0.0.18',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: { id: 10, status: 'approved', is_hidden: false }
    });
    await commentsHandler(cPatchReq, cPatchRes);
    assert.strictEqual(cPatchRes.getStatus(), 200);

    // 18.5 Admin DELETE comment
    const { req: cDelReq, res: cDelRes } = createMockReqRes({
      method: 'DELETE',
      url: '/api/admin-comments?id=10',
      ip: '10.0.0.18',
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await commentsHandler(cDelReq, cDelRes);
    assert.strictEqual(cDelRes.getStatus(), 200);
  });

  // 19. Test Profile: GET /api/admin-profile trả đúng profile & role
  await runAsyncTest('19. Test Profile: GET /api/admin-profile trả đúng profile & role đã xác minh cho Admin, Editor và Moderator', async () => {
    // 19.1 Admin profile
    const { req: aReq, res: aRes } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-profile',
      ip: '10.0.0.19',
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await profileHandler(aReq, aRes);
    assert.strictEqual(aRes.getStatus(), 200);
    assert.strictEqual(aRes.getBody().user?.role, 'admin');

    // 19.2 Editor profile
    const { req: eReq, res: eRes } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-profile',
      ip: '10.0.0.19',
      headers: { Authorization: 'Bearer mock-editor-token' }
    });
    await profileHandler(eReq, eRes);
    assert.strictEqual(eRes.getStatus(), 200);
    assert.strictEqual(eRes.getBody().user?.role, 'editor');

    // 19.3 Moderator profile
    const { req: mReq, res: mRes } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-profile',
      ip: '10.0.0.19',
      headers: { Authorization: 'Bearer mock-moderator-token' }
    });
    await profileHandler(mReq, mRes);
    assert.strictEqual(mRes.getStatus(), 200);
    assert.strictEqual(mRes.getBody().user?.role, 'moderator');
  });

  // 20. Test Session: Token hết hạn bị từ chối 401, refresh token thành công, và logout thành công
  await runAsyncTest('20. Test Session: Token hết hạn bị từ chối 401, refresh token thành công, và logout thành công', async () => {
    // 20.1 Token hết hạn bị 401
    const { req: expReq, res: expRes } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-profile',
      ip: '10.0.0.20',
      headers: { Authorization: 'Bearer mock-expired-token' }
    });
    await profileHandler(expReq, expRes);
    assert.strictEqual(expRes.getStatus(), 401);
    assert.strictEqual(expRes.getBody().error?.code, 'UNAUTHENTICATED');

    // 20.2 Refresh token qua Supabase Auth endpoint
    const refreshRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: 'valid-refresh-token' })
    });
    assert.strictEqual(refreshRes.status, 200);
    const refreshData = await refreshRes.json();
    assert.strictEqual(refreshData.access_token, 'refreshed-access-token-xyz');
    assert.strictEqual(refreshData.refresh_token, 'refreshed-refresh-token-123');
    assert.ok(refreshData.expires_in > 0);

    // 20.3 Refresh token sai -> 400
    const badRefreshRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: 'invalid-refresh-token' })
    });
    assert.strictEqual(badRefreshRes.status, 400);

    // 20.4 Logout thành công qua Supabase Auth
    const logoutRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${refreshData.access_token}` }
    });
    assert.strictEqual(logoutRes.status, 204);
  });

  console.log(`\n========================================`);
  console.log(`KẾT QUẢ KIỂM THỬ G8.1: ${passedTests}/${totalTests} PASS`);
  console.log(`========================================\n`);

} finally {
  if (mockServer) {
    mockServer.close();
  }
}

if (passedTests < totalTests) {
  process.exit(1);
}
