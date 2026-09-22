// scripts/test-g9-cleanup.js
// Bộ kiểm thử tự động G9.2: Controlled Test Data Cleanup, Backup & Client Resilience

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

import placesHandler from '../api/admin-places.js';
import {
  TARGET_CLEANUP_PLACES,
  generateCleanupCorrelationId,
  resolveCredentials,
  performReadBackVerification,
  verifyAuditLogsForMutations,
  executeCleanup,
  executeRollback
} from './cleanup-g9-test-data.js';

import {
  sanitizeBackupPlaces,
  sanitizeBackupComments,
  sanitizeBackupReports,
  createProductionManifest,
  validateManifestData,
  verifyManifestFile,
  verifyTargetsAgainstLive,
  EXPECTED_TARGETS
} from './backup-g9-production.js';

import {
  isPlaceSaved,
  isPlaceRecent,
  canonicalizePreferences,
  openDetailModal,
  state
} from '../js/app.js';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.stack || err.message}`);
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
    getHeader(key) {
      return resHeaders[key.toLowerCase()];
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
// Mock Supabase Server phục vụ kiểm thử Real Handler placesHandler
// ----------------------------------------------------------------------------
let mockServer;
let mockPort;
let mockPlaces = [];
let mockAuditLogs = [];

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
        if (token === 'mock-admin-token') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ id: 'uuid-admin-test', email: 'admin@vivutravinh.vn' }));
        }
        if (token === 'mock-editor-token') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ id: 'uuid-editor-test', email: 'editor@vivutravinh.vn' }));
        }
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: 'Invalid or expired JWT' }));
      }

      // 2. Admin Users Allowlist: GET /rest/v1/admin_users
      if (url.pathname === '/rest/v1/admin_users') {
        const userIdMatch = url.search.match(/user_id=eq\.([a-zA-Z0-9_-]+)/);
        const userId = userIdMatch ? userIdMatch[1] : null;

        if (userId === 'uuid-admin-test') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify([{ user_id: 'uuid-admin-test', email: 'admin@vivutravinh.vn', role: 'admin', is_active: true }]));
        }
        if (userId === 'uuid-editor-test') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify([{ user_id: 'uuid-editor-test', email: 'editor@vivutravinh.vn', role: 'editor', is_active: true }]));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify([]));
      }

      // 3. REST API: /rest/v1/places
      if (url.pathname === '/rest/v1/places') {
        const idMatch = url.search.match(/id=eq\.(\d+)/);
        const placeId = idMatch ? parseInt(idMatch[1], 10) : null;

        if (method === 'GET') {
          if (placeId !== null) {
            const found = mockPlaces.filter(p => p.id === placeId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(found));
          }

          let list = [...mockPlaces];
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Content-Range': `0-${list.length}/${list.length}`
          });
          return res.end(JSON.stringify(list));
        }
      }

      // 4. RPC: /rest/v1/rpc/admin_update_place_atomic
      if (url.pathname === '/rest/v1/rpc/admin_update_place_atomic') {
        const { p_actor_id, p_actor_email, p_actor_role, p_place_id, p_patch, p_ip, p_correlation_id } = body;
        const found = mockPlaces.find(p => p.id === p_place_id);
        if (!found) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ message: `NOT_FOUND: Không tìm thấy địa điểm ${p_place_id}` }));
        }

        const before = { ...found };
        Object.assign(found, p_patch);
        found.updated_at = new Date().toISOString();

        const action = found.status === 'archived' ? 'place.archive' : (found.status === 'approved' ? 'place.approved' : 'place.update');
        mockAuditLogs.push({
          actor_id: p_actor_id,
          actor_email: p_actor_email,
          actor_role: p_actor_role,
          action,
          entity_type: 'place',
          entity_id: String(found.id),
          payload_before: before,
          payload_after: { ...found },
          ip: p_ip,
          correlation_id: p_correlation_id,
          created_at: new Date().toISOString()
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(found));
      }

      // 5. REST API: /rest/v1/admin_audit_logs
      if (url.pathname === '/rest/v1/admin_audit_logs') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(mockAuditLogs));
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ROUTE_NOT_FOUND' }));
    });

    mockServer.listen(0, '127.0.0.1', () => {
      mockPort = mockServer.address().port;
      process.env.SUPABASE_URL = `http://127.0.0.1:${mockPort}`;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key-test';
      resolve();
    });
  });
}

function stopMockSupabaseServer() {
  return new Promise((resolve) => {
    if (mockServer) {
      mockServer.close(() => resolve());
    } else {
      resolve();
    }
  });
}

// ----------------------------------------------------------------------------
// TEST SUITE CHÍNH
// ----------------------------------------------------------------------------
async function main() {
  console.log('=== BẮT ĐẦU KIỂM THỬ G9.2: CONTROLLED TEST DATA CLEANUP & RESILIENCE ===\n');

  await startMockSupabaseServer();

  function resetMockPlaces() {
    mockPlaces = [
      {
        id: 4,
        name: 'Địa điểm test Google Form',
        slug: 'dia-diem-test-google-form',
        category: 'attraction',
        area: 'tp-tra-vinh',
        status: 'approved',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 10,
        name: 'ádasdasd',
        slug: 'adasdasd',
        category: 'attraction',
        area: 'tp-tra-vinh',
        status: 'approved',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 6,
        name: 'Địa điểm test Google Form',
        slug: 'dia-diem-test-google-form-mpozjzkv',
        category: 'attraction',
        area: 'tp-tra-vinh',
        status: 'draft',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 1,
        name: 'Ao Bà Om',
        slug: 'ao-ba-om',
        category: 'attraction',
        area: 'tp-tra-vinh',
        status: 'approved',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    mockAuditLogs = [];
  }

  function createValidTestManifest(overrides = {}) {
    return {
      manifest_type: 'cleanup_manifest_snapshot',
      created_at: new Date().toISOString(),
      environment: 'production',
      auth_mode: 'admin_access_token',
      live_verification: {
        verified: true,
        issues: []
      },
      target_records: [
        { id: 4, name: 'Địa điểm test Google Form', slug: 'dia-diem-test-google-form', current_status: 'approved', verified_match: true },
        { id: 6, name: 'Địa điểm test Google Form', slug: 'dia-diem-test-google-form-mpozjzkv', current_status: 'draft', verified_match: true },
        { id: 10, name: 'ádasdasd', slug: 'adasdasd', current_status: 'approved', verified_match: true }
      ],
      metadata: {
        total_places: 4,
        total_comments: 0,
        total_reports: 0,
        places_pages: 1,
        comments_pages: 1,
        reports_pages: 1
      },
      places: [
        { id: 4, name: 'Địa điểm test Google Form', slug: 'dia-diem-test-google-form', status: 'approved' },
        { id: 10, name: 'ádasdasd', slug: 'adasdasd', status: 'approved' },
        { id: 6, name: 'Địa điểm test Google Form', slug: 'dia-diem-test-google-form-mpozjzkv', status: 'draft' },
        { id: 1, name: 'Ao Bà Om', slug: 'ao-ba-om', status: 'approved' }
      ],
      comments: [],
      reports: [],
      ...overrides
    };
  }

  resetMockPlaces();

  try {
    // ------------------------------------------------------------------------
    // NHÓM 1: CONTRACT & DANH SÁCH MỤC TIÊU DỌN DẸP
    // ------------------------------------------------------------------------
    console.log('[Nhóm 1] Kiểm tra Quy chuẩn Mục tiêu Dọn dẹp (Target Places):');

    await runTest('1.1 Danh sách mục tiêu chứa chính xác 3 ID (4, 10, 6) và ưu tiên archived (không hard delete)', () => {
      assert.strictEqual(TARGET_CLEANUP_PLACES.length, 3);
      const ids = TARGET_CLEANUP_PLACES.map(p => p.id);
      assert.deepStrictEqual(ids.sort((a, b) => a - b), [4, 6, 10]);

      for (const item of TARGET_CLEANUP_PLACES) {
        assert.strictEqual(item.targetStatus, 'archived', 'Mục tiêu bắt buộc phải là archived, cấm deleted');
        assert.ok(item.reason && item.reason.length > 5, 'Bắt buộc phải có lý do minh bạch');
      }

      const p4 = TARGET_CLEANUP_PLACES.find(p => p.id === 4);
      assert.strictEqual(p4.currentStatus, 'approved');
      const p10 = TARGET_CLEANUP_PLACES.find(p => p.id === 10);
      assert.strictEqual(p10.currentStatus, 'approved');
      const p6 = TARGET_CLEANUP_PLACES.find(p => p.id === 6);
      assert.strictEqual(p6.currentStatus, 'draft');
    });

    await runTest('1.2 Sinh correlation ID duy nhất chuẩn format g9-2-cleanup-<timestamp>-id<id>', () => {
      const corr1 = generateCleanupCorrelationId(4);
      const corr2 = generateCleanupCorrelationId(10);
      assert.ok(/^g9-2-cleanup-\d+-id4$/.test(corr1));
      assert.ok(/^g9-2-cleanup-\d+-id10$/.test(corr2));
      assert.notStrictEqual(corr1, corr2);
    });

    // ------------------------------------------------------------------------
    // NHÓM 2: API CONTRACT CHO PATCH & XỬ LÝ LỖI
    // ------------------------------------------------------------------------
    console.log('\n[Nhóm 2] Kiểm tra API Contract PATCH /api/admin-places với Real Handler:');

    await runTest('2.1 Từ chối HTTP 400 INVALID_INPUT khi thiếu id trong JSON body', async () => {
      const { req, res } = createMockReqRes({
        method: 'PATCH',
        url: '/api/admin-places',
        headers: { Authorization: 'Bearer mock-admin-token' },
        body: { status: 'archived' } // THIẾU ID trong body
      });

      await placesHandler(req, res);
      assert.strictEqual(res.getStatus(), 400);
      const body = res.getBody();
      assert.strictEqual(body.error.code, 'INVALID_INPUT');
      assert.ok(body.error.message.includes('id'));
    });

    await runTest('2.2 Từ chối HTTP 400 INVALID_INPUT khi id <= 0 hoặc không phải số nguyên', async () => {
      const { req: req1, res: res1 } = createMockReqRes({
        method: 'PATCH',
        url: '/api/admin-places',
        headers: { Authorization: 'Bearer mock-admin-token' },
        body: { id: -5, status: 'archived' }
      });
      await placesHandler(req1, res1);
      assert.strictEqual(res1.getStatus(), 400);

      const { req: req2, res: res2 } = createMockReqRes({
        method: 'PATCH',
        url: '/api/admin-places',
        headers: { Authorization: 'Bearer mock-admin-token' },
        body: { id: 'invalid-id', status: 'archived' }
      });
      await placesHandler(req2, res2);
      assert.strictEqual(res2.getStatus(), 400);
    });

    // ------------------------------------------------------------------------
    // NHÓM 3: FAIL-CLOSED & TOKEN SEPARATION (VERCEL VS SUPABASE)
    // ------------------------------------------------------------------------
    console.log('\n[Nhóm 3] Kiểm tra Cơ chế Fail-Closed & Phân Tách Token:');

    await runTest('3.1 createProductionManifest dừng ngay (FAIL_CLOSED) khi thiếu credentials và không có cờ --local-test', async () => {
      const origAdmin = process.env.ADMIN_ACCESS_TOKEN;
      const origService = process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.ADMIN_ACCESS_TOKEN;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      try {
        await assert.rejects(
          async () => {
            await createProductionManifest();
          },
          /FAIL_CLOSED/
        );
      } finally {
        if (origAdmin) process.env.ADMIN_ACCESS_TOKEN = origAdmin;
        if (origService) process.env.SUPABASE_SERVICE_ROLE_KEY = origService;
      }
    });

    await runTest('3.2 Chỉ có Service Role Key nhưng thiếu ADMIN_ACCESS_TOKEN phải chặn mutation và rollback qua Vercel', async () => {
      const origAdmin = process.env.ADMIN_ACCESS_TOKEN;
      delete process.env.ADMIN_ACCESS_TOKEN;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-key-only';

      try {
        await assert.rejects(
          async () => {
            await executeCleanup({ dryRun: false });
          },
          /FAIL_CLOSED_NO_ADMIN_TOKEN/
        );

        await assert.rejects(
          async () => {
            await executeRollback();
          },
          /FAIL_CLOSED_NO_ADMIN_TOKEN/
        );
      } finally {
        if (origAdmin) process.env.ADMIN_ACCESS_TOKEN = origAdmin;
      }
    });

    await runTest('3.3 Chặn và thông báo lỗi INVALID_ENV_VAR nếu còn dùng ADMIN_TOKEN cũ', () => {
      const origAdmin = process.env.ADMIN_ACCESS_TOKEN;
      const origOldToken = process.env.ADMIN_TOKEN;
      delete process.env.ADMIN_ACCESS_TOKEN;
      process.env.ADMIN_TOKEN = 'legacy-token';

      try {
        assert.throws(
          () => {
            resolveCredentials();
          },
          /INVALID_ENV_VAR/
        );
      } finally {
        delete process.env.ADMIN_TOKEN;
        if (origAdmin) process.env.ADMIN_ACCESS_TOKEN = origAdmin;
        if (origOldToken) process.env.ADMIN_TOKEN = origOldToken;
      }
    });

    // ------------------------------------------------------------------------
    // NHÓM 4: READ-BACK VERIFICATION FAIL-CLOSED
    // ------------------------------------------------------------------------
    console.log('\n[Nhóm 4] Kiểm tra Read-Back Verification Fail-Closed:');

    await runTest('4.1 Read-back: HTTP lỗi (status 500) phải fail-stop', async () => {
      const mockFetch = async () => ({
        ok: false,
        status: 500
      });
      const check = await performReadBackVerification(4, 'archived', {
        adminToken: 'mock-admin-token',
        fetchFn: mockFetch
      });
      assert.strictEqual(check.success, false);
      assert.ok(check.error.includes('READBACK_HTTP_ERROR'));
    });

    await runTest('4.2 Read-back: Không tìm thấy target ID phải fail-stop', async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ places: [{ id: 999, status: 'archived' }] })
      });
      const check = await performReadBackVerification(4, 'archived', {
        adminToken: 'mock-admin-token',
        fetchFn: mockFetch
      });
      assert.strictEqual(check.success, false);
      assert.ok(check.error.includes('READBACK_TARGET_NOT_FOUND'));
    });

    await runTest('4.3 Read-back: Status là null hoặc undefined phải fail-stop', async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ places: [{ id: 4, status: null }] })
      });
      const check = await performReadBackVerification(4, 'archived', {
        adminToken: 'mock-admin-token',
        fetchFn: mockFetch
      });
      assert.strictEqual(check.success, false);
      assert.ok(check.error.includes('READBACK_STATUS_NULL'));
    });

    await runTest('4.4 Read-back: Status khác target status phải fail-stop', async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ places: [{ id: 4, status: 'approved' }] }) // Vẫn là approved, chưa sang archived
      });
      const check = await performReadBackVerification(4, 'archived', {
        adminToken: 'mock-admin-token',
        fetchFn: mockFetch
      });
      assert.strictEqual(check.success, false);
      assert.ok(check.error.includes('READBACK_STATUS_MISMATCH'));
    });

    await runTest('4.5 Read-back phân trang: Tìm thấy target place trên trang 2 khi duyệt Admin API', async () => {
      const mockFetch = async (url) => {
        const parsed = new URL(url);
        const page = parseInt(parsed.searchParams.get('page') || '1', 10);
        if (page === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              places: [{ id: 1, status: 'approved' }, { id: 2, status: 'approved' }],
              pagination: { page: 1, limit: 2, total: 3, total_pages: 2 }
            })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            places: [{ id: 4, status: 'archived' }],
            pagination: { page: 2, limit: 2, total: 3, total_pages: 2 }
          })
        };
      };

      const check = await performReadBackVerification(4, 'archived', {
        adminToken: 'mock-admin-token',
        serviceKey: null,
        fetchFn: mockFetch
      });

      assert.strictEqual(check.success, true);
      assert.strictEqual(check.place.id, 4);
      assert.strictEqual(check.place.status, 'archived');
    });

    await runTest('4.6 Read-back qua Supabase (serviceKey) ưu tiên query trực tiếp đúng ID, fail-stop nếu ID không khớp', async () => {
      let calledUrl = '';
      const mockFetch = async (url) => {
        calledUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: 4, status: 'archived' }]
        };
      };

      const check = await performReadBackVerification(4, 'archived', {
        adminToken: 'mock-admin-token',
        serviceKey: 'mock-service-key',
        fetchFn: mockFetch
      });

      assert.strictEqual(check.success, true);
      assert.ok(calledUrl.includes('id=eq.4'), 'Phải truy vấn trực tiếp id=eq.4');
    });

    // ------------------------------------------------------------------------
    // NHÓM 5: BACKUP FAIL-ALL, PHÂN TRANG & PERMISSIONS 0600
    // ------------------------------------------------------------------------
    console.log('\n[Nhóm 5] Kiểm tra Snapshot Backup (Fail-All, Pagination & File Mode 0600):');

    await runTest('5.1 Khử sạch PII (email, IP, phone) khỏi snapshot manifest', () => {
      const dirtyPlaces = [{
        id: 99,
        name: 'Điểm test',
        slug: 'diem-test',
        contributor: 'secret_user@gmail.com',
        contact: '0912345678',
        status: 'approved'
      }];
      const dirtyComments = [{
        id: 1,
        place_id: 99,
        content: 'Bình luận test',
        author_email: 'a@gmail.com',
        client_ip: '192.168.1.1',
        status: 'approved'
      }];
      const dirtyReports = [{
        id: 1,
        place_id: 99,
        reason: 'Sai giờ',
        reporter_email: 'reporter@gmail.com',
        reporter_ip: '10.0.0.1',
        status: 'pending'
      }];

      const cleanPlaces = sanitizeBackupPlaces(dirtyPlaces);
      const cleanComments = sanitizeBackupComments(dirtyComments);
      const cleanReports = sanitizeBackupReports(dirtyReports);

      assert.strictEqual(cleanPlaces[0].contributor, undefined);
      assert.strictEqual(cleanComments[0].author_email, undefined);
      assert.strictEqual(cleanComments[0].client_ip, undefined);
      assert.strictEqual(cleanReports[0].reporter_email, undefined);
      assert.strictEqual(cleanReports[0].reporter_ip, undefined);
    });

    await runTest('5.2 Backup FAIL TOÀN BỘ nếu bất kỳ endpoint nào trả về lỗi (HTTP != 200)', async () => {
      const mockFetch = async (url) => {
        if (url.includes('places')) {
          return { ok: true, status: 200, json: async () => ({ places: [], pagination: { total_pages: 1 } }) };
        }
        if (url.includes('comments')) {
          return { ok: false, status: 500, statusText: 'Internal Error' }; // Lỗi ở endpoint comments
        }
        return { ok: true, status: 200, json: async () => ({ reports: [], pagination: { total_pages: 1 } }) };
      };

      await assert.rejects(
        async () => {
          await createProductionManifest({
            adminToken: 'mock-admin-token',
            fetchFn: mockFetch,
            allowTargetMismatch: true
          });
        },
        /BACKUP_ENDPOINT_FAILED/
      );
    });

    await runTest('5.3 Backup gom đủ toàn bộ các trang khi số lượng bản ghi > 100', async () => {
      const requestedPages = [];
      const mockFetch = async (url) => {
        const parsedUrl = new URL(url);
        const page = parseInt(parsedUrl.searchParams.get('page') || '1', 10);
        requestedPages.push(page);

        if (parsedUrl.pathname.includes('admin-places')) {
          const items = Array.from({ length: page === 3 ? 20 : 50 }, (_, i) => ({
            id: (page - 1) * 50 + i + 1,
            name: `Địa điểm ${(page - 1) * 50 + i + 1}`,
            slug: `dia-diem-${(page - 1) * 50 + i + 1}`,
            status: 'approved'
          }));

          return {
            ok: true,
            status: 200,
            json: async () => ({
              places: items,
              pagination: { page, limit: 50, total: 120, total_pages: 3 }
            })
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [], pagination: { total_pages: 1 } })
        };
      };

      const manifest = await createProductionManifest({
        adminToken: 'mock-admin-token',
        fetchFn: mockFetch,
        allowTargetMismatch: true
      });

      assert.strictEqual(manifest.places.length, 120, 'Phải lấy đủ 120 địa điểm từ cả 3 trang');
      assert.strictEqual(manifest.metadata.places_pages, 3);
      assert.deepStrictEqual(requestedPages.slice(0, 3), [1, 2, 3], 'Phải duyệt tuần tự trang 1 -> 2 -> 3');
    });

    await runTest('5.4 Tệp manifest ghi ra đĩa bắt buộc có file mode 0600 (POSIX rw-------)', async () => {
      const testManifestPath = path.join(ROOT_DIR, 'scratch', 'test-perm-0600.json');
      fs.mkdirSync(path.dirname(testManifestPath), { recursive: true });

      fs.writeFileSync(testManifestPath, JSON.stringify({ test: true }), { encoding: 'utf8', mode: 0o600 });
      try {
        fs.chmodSync(testManifestPath, 0o600);
      } catch {}

      const stat = fs.statSync(testManifestPath);
      const perm = stat.mode & 0o777;
      assert.strictEqual(perm, 0o600, 'Quyền hạn file bắt buộc phải là 0600');

      fs.unlinkSync(testManifestPath);
    });

    // ------------------------------------------------------------------------
    // NHÓM 6: MANIFEST VALIDATION (INLINE, AGE & TARGET INTEGRITY)
    // ------------------------------------------------------------------------
    console.log('\n[Nhóm 6] Kiểm tra Xác Thực Manifest (Inline, Tuổi & Tính Toàn Vẹn):');

    await runTest('6.1 validateManifestData: Chặn inline manifest giả hoặc thiếu trường bắt buộc', () => {
      const fakeManifest1 = {
        manifest_type: 'fake_type'
      };
      assert.strictEqual(validateManifestData(fakeManifest1).valid, false);

      const fakeManifest2 = {
        manifest_type: 'cleanup_manifest_snapshot',
        created_at: new Date().toISOString(),
        environment: 'production',
        auth_mode: 'admin_access_token',
        live_verification: { verified: false }, // live verification không verified
        target_records: [{ id: 4, verified_match: true }]
      };
      assert.strictEqual(validateManifestData(fakeManifest2).valid, false);

      const fakeManifest3 = {
        manifest_type: 'cleanup_manifest_snapshot',
        created_at: new Date().toISOString(),
        environment: 'production',
        auth_mode: 'admin_access_token',
        live_verification: { verified: true },
        target_records: [
          { id: 4, verified_match: true },
          { id: 10, verified_match: false }, // ID 10 verified_match = false
          { id: 6, verified_match: true }
        ],
        places: [], comments: [], reports: []
      };
      const check3 = validateManifestData(fakeManifest3);
      assert.strictEqual(check3.valid, false);
      assert.ok(check3.error.includes('ID 10'));
    });

    await runTest('6.2 validateManifestData: Chặn manifest quá hạn (> 30 phút)', () => {
      const oldTime = new Date(Date.now() - 40 * 60 * 1000).toISOString(); // 40 phút trước
      const oldManifest = {
        manifest_type: 'cleanup_manifest_snapshot',
        created_at: oldTime,
        environment: 'production',
        auth_mode: 'admin_access_token',
        live_verification: { verified: true },
        target_records: [
          { id: 4, verified_match: true },
          { id: 10, verified_match: true },
          { id: 6, verified_match: true }
        ],
        places: [], comments: [], reports: []
      };

      const check = validateManifestData(oldManifest);
      assert.strictEqual(check.valid, false);
      assert.ok(check.error.includes('MANIFEST_EXPIRED'));
    });

    await runTest('6.3 verifyTargetsAgainstLive: Tính verified_match độc lập cho từng target ID', () => {
      const livePlaces = [
        { id: 4, name: 'Địa điểm test Google Form', slug: 'dia-diem-test-google-form', status: 'approved' }, // KHỚP
        { id: 10, name: 'Tên khác', slug: 'adasdasd', status: 'approved' }, // LỆCH NAME
        { id: 6, name: 'Địa điểm test Google Form', slug: 'dia-diem-test-google-form-mpozjzkv', status: 'draft' } // KHỚP
      ];

      const res = verifyTargetsAgainstLive(livePlaces, EXPECTED_TARGETS);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.matchedTargets.length, 3);

      const t4 = res.matchedTargets.find(t => t.id === 4);
      const t10 = res.matchedTargets.find(t => t.id === 10);
      const t6 = res.matchedTargets.find(t => t.id === 6);

      assert.strictEqual(t4.verified_match, true, 'Target 4 phải có verified_match riêng là true');
      assert.strictEqual(t10.verified_match, false, 'Target 10 phải có verified_match riêng là false');
      assert.strictEqual(t6.verified_match, true, 'Target 6 phải có verified_match riêng là true');
    });

    await runTest('6.4 validateManifestData: Chặn target_records có độ dài khác 3, chứa ID trùng lặp, hoặc không đúng [4, 6, 10]', () => {
      // 1. Độ dài khác 3 (chỉ có 2)
      const m1 = createValidTestManifest({
        target_records: [
          { id: 4, verified_match: true },
          { id: 10, verified_match: true }
        ]
      });
      const c1 = validateManifestData(m1);
      assert.strictEqual(c1.valid, false);
      assert.ok(c1.error.includes('3 phần tử'));

      // 2. Trùng lặp ID
      const m2 = createValidTestManifest({
        target_records: [
          { id: 4, verified_match: true },
          { id: 4, verified_match: true },
          { id: 10, verified_match: true }
        ]
      });
      const c2 = validateManifestData(m2);
      assert.strictEqual(c2.valid, false);
      assert.ok(c2.error.includes('trùng lặp'));

      // 3. Sai danh sách ID (chứa ID 99 thay vì 6)
      const m3 = createValidTestManifest({
        target_records: [
          { id: 4, verified_match: true },
          { id: 99, verified_match: true },
          { id: 10, verified_match: true }
        ]
      });
      const c3 = validateManifestData(m3);
      assert.strictEqual(c3.valid, false);
      assert.ok(c3.error.includes('[4, 6, 10]'));
    });

    await runTest('6.5 validateManifestData: Chặn created_at nằm trong tương lai (> 1 phút)', () => {
      const futureTime = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 phút sau
      const m = createValidTestManifest({ created_at: futureTime });
      const c = validateManifestData(m);
      assert.strictEqual(c.valid, false);
      assert.ok(c.error.includes('MANIFEST_FUTURE_DATE'));
    });

    // ------------------------------------------------------------------------
    // NHÓM 7: PRE-FLIGHT LIVE CHECK & FAIL-STOP MUTATION
    // ------------------------------------------------------------------------
    console.log('\n[Nhóm 7] Kiểm tra Pre-flight Live Verification & Fail-Stop:');

    await runTest('7.1 Pre-flight: Abort mutation ngay lập tức khi live targets lệch slug/name/status', async () => {
      const mismatchedLive = [
        { id: 4, name: 'Tên đã bị sửa khác', slug: 'dia-diem-test-google-form', status: 'approved' },
        { id: 10, name: 'ádasdasd', slug: 'adasdasd', status: 'approved' },
        { id: 6, name: 'Địa điểm test Google Form', slug: 'dia-diem-test-google-form-mpozjzkv', status: 'draft' }
      ];

      let mutationCalled = false;
      const mockFetch = async () => {
        mutationCalled = true;
        return { ok: true, status: 200, json: async () => ({}) };
      };

      const dummyManifest = {
        manifest_type: 'cleanup_manifest_snapshot',
        created_at: new Date().toISOString(),
        environment: 'production',
        auth_mode: 'admin_access_token',
        live_verification: { verified: true },
        target_records: [
          { id: 4, verified_match: true },
          { id: 10, verified_match: true },
          { id: 6, verified_match: true }
        ],
        places: [], comments: [], reports: []
      };

      await assert.rejects(
        async () => {
          await executeCleanup({
            dryRun: false,
            adminToken: 'mock-admin-token',
            manifest: dummyManifest,
            mockLivePlaces: mismatchedLive,
            fetchFn: mockFetch
          });
        },
        /LIVE_TARGET_MISMATCH_ABORT/
      );

      assert.strictEqual(mutationCalled, false, 'Tuyệt đối không được gửi mutation khi preflight đối soát thất bại');
    });

    await runTest('7.2 Fail-stop: Dừng ngay khi có lỗi ở bản ghi giữa chừng, xuất lệnh rollback cho đúng các ID đã sửa', async () => {
      const validLive = [
        { id: 4, name: 'Địa điểm test Google Form', slug: 'dia-diem-test-google-form', status: 'approved' },
        { id: 10, name: 'ádasdasd', slug: 'adasdasd', status: 'approved' },
        { id: 6, name: 'Địa điểm test Google Form', slug: 'dia-diem-test-google-form-mpozjzkv', status: 'draft' }
      ];

      const dummyManifest = {
        manifest_type: 'cleanup_manifest_snapshot',
        created_at: new Date().toISOString(),
        environment: 'production',
        auth_mode: 'admin_access_token',
        live_verification: { verified: true },
        target_records: [
          { id: 4, verified_match: true },
          { id: 10, verified_match: true },
          { id: 6, verified_match: true }
        ],
        places: validLive, comments: [], reports: []
      };

      const calls = [];
      const mockFetch = async (url, opts) => {
        const body = JSON.parse(opts.body);
        calls.push(body.id);

        if (body.id === 4) {
          return { ok: true, status: 200, json: async () => ({ success: true, place: { id: 4, status: 'archived' } }) };
        }
        if (body.id === 10) {
          return { ok: false, status: 500, json: async () => ({ error: { message: 'Database lock timeout' } }) };
        }
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      };

      const outcome = await executeCleanup({
        dryRun: false,
        adminToken: 'mock-admin-token',
        manifest: dummyManifest,
        mockLivePlaces: validLive,
        readBackFn: async (id) => ({ id, status: 'archived' }),
        fetchFn: mockFetch
      });

      assert.strictEqual(outcome.success, false, 'Thao tác phải dừng lại và báo thất bại');
      assert.strictEqual(outcome.failedTarget.id, 10, 'Target lỗi phải là ID 10');
      assert.deepStrictEqual(calls, [4, 10], 'Chỉ gọi ID 4 và 10, ID 6 phải bị hủy');

      assert.strictEqual(outcome.mutatedTargets.length, 1);
      assert.strictEqual(outcome.mutatedTargets[0].id, 4);

      assert.strictEqual(outcome.unmutatedTargets.length, 2);
      assert.deepStrictEqual(outcome.unmutatedTargets.map(u => u.id), [10, 6]);

      assert.ok(outcome.rollbackCommand.includes('--target-ids=4'), 'Lệnh rollback phải chứa ID 4 đã bị sửa');
      assert.ok(!outcome.rollbackCommand.includes('10'), 'Lệnh rollback không được chứa ID 10');
      assert.ok(!outcome.rollbackCommand.includes('6'), 'Lệnh rollback không được chứa ID 6');
    });

    // ------------------------------------------------------------------------
    // NHÓM 8: AUDIT LOG VERIFICATION (STRICT CORRELATION & ACTION MATCH)
    // ------------------------------------------------------------------------
    console.log('\n[Nhóm 8] Kiểm tra Xác Minh Nhật Ký Kiểm Toán (Audit Verification):');

    await runTest('8.1 Thiếu 1/3 audit logs bắt buộc trả về AUDIT_VERIFICATION_FAILED (cấm báo VERIFIED)', async () => {
      const mutations = [
        { id: 4, correlationId: 'corr-id-4', targetStatus: 'archived' },
        { id: 10, correlationId: 'corr-id-10', targetStatus: 'archived' },
        { id: 6, correlationId: 'corr-id-6', targetStatus: 'archived' }
      ];

      // Giả lập bảng audit logs chỉ lưu được 2/3 bản ghi (thiếu log của ID 6)
      const mockAuditLogsRes = [
        { id: 1, entity_id: '4', correlation_id: 'corr-id-4', action: 'place.archive', actor_email: 'admin@vivutravinh.vn' },
        { id: 2, entity_id: '10', correlation_id: 'corr-id-10', action: 'place.archive', actor_email: 'admin@vivutravinh.vn' }
      ];

      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => mockAuditLogsRes
      });

      const auditCheck = await verifyAuditLogsForMutations(mutations, {
        serviceKey: 'mock-service-key',
        fetchFn: mockFetch
      });

      assert.strictEqual(auditCheck.status, 'AUDIT_VERIFICATION_FAILED');
      assert.notStrictEqual(auditCheck.status, 'AUDIT_VERIFIED');
      assert.ok(auditCheck.details.some(d => d.id === 6 && d.verified === false));
    });

    await runTest('8.2 Thiếu SUPABASE_SERVICE_ROLE_KEY trả về AUDIT_VERIFICATION_DEFERRED và complete = false', async () => {
      const dummyManifest = createValidTestManifest();
      const validLive = [
        { id: 4, name: 'Địa điểm test Google Form', slug: 'dia-diem-test-google-form', status: 'approved' },
        { id: 10, name: 'ádasdasd', slug: 'adasdasd', status: 'approved' },
        { id: 6, name: 'Địa điểm test Google Form', slug: 'dia-diem-test-google-form-mpozjzkv', status: 'draft' }
      ];

      const outcome = await executeCleanup({
        dryRun: false,
        adminToken: 'mock-admin-token',
        serviceKey: null, // Không cung cấp serviceKey
        manifest: dummyManifest,
        mockLivePlaces: validLive,
        readBackFn: async (id) => ({ id, status: 'archived' }),
        fetchFn: async () => ({ ok: true, status: 200, json: async () => ({ success: true }) })
      });

      assert.strictEqual(outcome.mutationSuccess, true);
      assert.strictEqual(outcome.readBackSuccess, true);
      assert.strictEqual(outcome.auditStatus, 'AUDIT_VERIFICATION_DEFERRED');
      assert.strictEqual(outcome.complete, false, 'complete bắt buộc phải là false khi audit bị deferred');
    });

    await runTest('8.3 Audit logs thiếu bản ghi trả về AUDIT_VERIFICATION_FAILED và complete = false', async () => {
      const dummyManifest = createValidTestManifest();
      const validLive = [
        { id: 4, name: 'Địa điểm test Google Form', slug: 'dia-diem-test-google-form', status: 'approved' },
        { id: 10, name: 'ádasdasd', slug: 'adasdasd', status: 'approved' },
        { id: 6, name: 'Địa điểm test Google Form', slug: 'dia-diem-test-google-form-mpozjzkv', status: 'draft' }
      ];

      const mockFetch = async (url) => {
        if (url.includes('admin_audit_logs')) {
          // Chỉ trả về 1 log thay vì 3
          return {
            ok: true,
            status: 200,
            json: async () => [{ entity_id: '4', correlation_id: 'corr-wrong', action: 'place.archive' }]
          };
        }
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      };

      const outcome = await executeCleanup({
        dryRun: false,
        adminToken: 'mock-admin-token',
        serviceKey: 'mock-service-key',
        manifest: dummyManifest,
        mockLivePlaces: validLive,
        readBackFn: async (id) => ({ id, status: 'archived' }),
        fetchFn: mockFetch
      });

      assert.strictEqual(outcome.mutationSuccess, true);
      assert.strictEqual(outcome.readBackSuccess, true);
      assert.strictEqual(outcome.auditStatus, 'AUDIT_VERIFICATION_FAILED');
      assert.strictEqual(outcome.complete, false, 'complete bắt buộc phải là false khi audit verification failed');
    });

    await runTest('8.4 Execute complete = true CHỈ KHI mutation, readBack thành công và auditStatus = AUDIT_VERIFIED', async () => {
      const dummyManifest = createValidTestManifest();
      const validLive = [
        { id: 4, name: 'Địa điểm test Google Form', slug: 'dia-diem-test-google-form', status: 'approved' },
        { id: 10, name: 'ádasdasd', slug: 'adasdasd', status: 'approved' },
        { id: 6, name: 'Địa điểm test Google Form', slug: 'dia-diem-test-google-form-mpozjzkv', status: 'draft' }
      ];

      const capturedCorrelationIds = [];
      const mockFetch = async (url, opts) => {
        if (url.includes('admin-places')) {
          const corr = opts.headers['x-correlation-id'];
          capturedCorrelationIds.push(corr);
          return { ok: true, status: 200, json: async () => ({ success: true }) };
        }
        if (url.includes('admin_audit_logs')) {
          return {
            ok: true,
            status: 200,
            json: async () => [
              { id: 1, entity_id: '4', correlation_id: capturedCorrelationIds[0], action: 'place.archive', actor_email: 'admin@vivutravinh.vn' },
              { id: 2, entity_id: '10', correlation_id: capturedCorrelationIds[1], action: 'place.archive', actor_email: 'admin@vivutravinh.vn' },
              { id: 3, entity_id: '6', correlation_id: capturedCorrelationIds[2], action: 'place.archive', actor_email: 'admin@vivutravinh.vn' }
            ]
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      };

      const outcome = await executeCleanup({
        dryRun: false,
        adminToken: 'mock-admin-token',
        serviceKey: 'mock-service-key',
        manifest: dummyManifest,
        mockLivePlaces: validLive,
        readBackFn: async (id) => ({ id, status: 'archived' }),
        fetchFn: mockFetch
      });

      assert.strictEqual(outcome.mutationSuccess, true);
      assert.strictEqual(outcome.readBackSuccess, true);
      assert.strictEqual(outcome.auditStatus, 'AUDIT_VERIFIED');
      assert.strictEqual(outcome.complete, true, 'complete phải là true khi cả 3 điều kiện đạt');
    });

    // ------------------------------------------------------------------------
    // NHÓM 9: ROLLBACK CONSTRAINTS & REAL API HANDLER
    // ------------------------------------------------------------------------
    console.log('\n[Nhóm 9] Kiểm tra Ràng Buộc Rollback & Real API Handler:');

    await runTest('9.1 Rollback CLI: Không có cờ --confirm bị từ chối với lỗi', async () => {
      try {
        await execFileAsync(process.execPath, [
          path.join(ROOT_DIR, 'scripts', 'cleanup-g9-test-data.js'),
          '--rollback',
          '--manifest=dummy.json',
          '--target-ids=4'
        ]);
        assert.fail('Bắt buộc phải fail khi thiếu --confirm');
      } catch (err) {
        assert.ok(err.stderr.includes('--confirm') || err.stdout.includes('--confirm'));
      }
    });

    await runTest('9.2 Rollback địa điểm KHÔNG PHẢI ARCHIVED bị API từ chối với HTTP 400 INVALID_ROLLBACK_STATE', async () => {
      resetMockPlaces();
      // ID 1 đang là 'approved', không phải 'archived'
      const { req, res } = createMockReqRes({
        method: 'PATCH',
        url: '/api/admin-places',
        headers: { Authorization: 'Bearer mock-admin-token' },
        body: {
          id: 1,
          status: 'approved',
          is_rollback: true
        }
      });

      await placesHandler(req, res);
      assert.strictEqual(res.getStatus(), 400);
      const body = res.getBody();
      assert.strictEqual(body.error.code, 'INVALID_ROLLBACK_STATE');
    });

    await runTest('9.3 Rollback gửi kèm field ngoài allowlist (chỉ cho id, status, is_rollback) bị từ chối HTTP 400', async () => {
      resetMockPlaces();
      const place4 = mockPlaces.find(p => p.id === 4);
      place4.status = 'archived';

      const { req, res } = createMockReqRes({
        method: 'PATCH',
        url: '/api/admin-places',
        headers: { Authorization: 'Bearer mock-admin-token' },
        body: {
          id: 4,
          status: 'approved',
          is_rollback: true,
          name: 'Tên sửa trái phép' // FIELD BỊ CẤM
        }
      });

      await placesHandler(req, res);
      assert.strictEqual(res.getStatus(), 400);
      const body = res.getBody();
      assert.strictEqual(body.error.code, 'INVALID_INPUT');
      assert.ok(body.error.message.includes('name'));
    });

    await runTest('9.4 Rollback với is_rollback: true bị từ chối HTTP 403 khi role là editor', async () => {
      resetMockPlaces();
      const place4 = mockPlaces.find(p => p.id === 4);
      place4.status = 'archived';

      const { req, res } = createMockReqRes({
        method: 'PATCH',
        url: '/api/admin-places',
        headers: { Authorization: 'Bearer mock-editor-token' }, // Role editor
        body: {
          id: 4,
          status: 'approved',
          is_rollback: true
        }
      });

      await placesHandler(req, res);
      assert.strictEqual(res.getStatus(), 403);
      const body = res.getBody();
      assert.strictEqual(body.error.code, 'FORBIDDEN');
    });

    await runTest('9.5 Rollback với is_rollback: true THÀNH CÔNG (HTTP 200) khi role là admin và địa điểm đang archived', async () => {
      resetMockPlaces();
      const place4 = mockPlaces.find(p => p.id === 4);
      place4.status = 'archived';

      const { req, res } = createMockReqRes({
        method: 'PATCH',
        url: '/api/admin-places',
        headers: { Authorization: 'Bearer mock-admin-token' }, // Role admin
        body: {
          id: 4,
          status: 'approved',
          is_rollback: true
        }
      });

      await placesHandler(req, res);
      assert.strictEqual(res.getStatus(), 200);
      const body = res.getBody();
      assert.strictEqual(body.success, true);
      assert.strictEqual(mockPlaces.find(p => p.id === 4).status, 'approved');
      assert.ok(mockAuditLogs.some(l => l.entity_id === '4' && l.action === 'place.approved'));
    });

    // ------------------------------------------------------------------------
    // NHÓM 10: DRY-RUN FAIL-CLOSED & CLIENT UI RESILIENCE
    // ------------------------------------------------------------------------
    console.log('\n[Nhóm 10] Kiểm tra Dry-run Fail-Closed, Không Mutation & Bền Vững Client UI:');

    await runTest('10.1 Dry-run fail-closed: Manifest thiếu hoặc không hợp lệ trả về success = false', async () => {
      const outcome = await executeCleanup({
        dryRun: true,
        adminToken: 'mock-admin-token',
        mockLivePlaces: mockPlaces,
        manifest: { manifest_type: 'invalid' }
      });

      assert.strictEqual(outcome.success, false);
      assert.strictEqual(outcome.dryRun, true);
      assert.ok(outcome.error.includes('DRY_RUN_MANIFEST_FAILED'));
      assert.strictEqual(outcome.results.length, 0);
    });

    await runTest('10.2 Dry-run fail-closed: Preflight live lỗi (mismatch target) trả về success = false', async () => {
      const dummyManifest = createValidTestManifest();
      const mismatchedLive = [
        { id: 4, name: 'Tên đã đổi khác', slug: 'dia-diem-test-google-form', status: 'approved' },
        { id: 10, name: 'ádasdasd', slug: 'adasdasd', status: 'approved' },
        { id: 6, name: 'Địa điểm test Google Form', slug: 'dia-diem-test-google-form-mpozjzkv', status: 'draft' }
      ];

      const outcome = await executeCleanup({
        dryRun: true,
        adminToken: 'mock-admin-token',
        manifest: dummyManifest,
        mockLivePlaces: mismatchedLive
      });

      assert.strictEqual(outcome.success, false);
      assert.strictEqual(outcome.dryRun, true);
      assert.ok(outcome.error.includes('DRY_RUN_PREFLIGHT_FAILED'));
      assert.strictEqual(outcome.results.length, 0);
    });

    await runTest('10.3 Dry-run thành công khi CẢ manifest và live preflight đều hợp lệ (success = true, 0 mutation)', async () => {
      const initialDbState = JSON.stringify(mockPlaces);
      const dummyManifest = createValidTestManifest();
      const validLive = [
        { id: 4, name: 'Địa điểm test Google Form', slug: 'dia-diem-test-google-form', status: 'approved' },
        { id: 10, name: 'ádasdasd', slug: 'adasdasd', status: 'approved' },
        { id: 6, name: 'Địa điểm test Google Form', slug: 'dia-diem-test-google-form-mpozjzkv', status: 'draft' }
      ];

      const outcome = await executeCleanup({
        dryRun: true,
        adminToken: 'mock-admin-token',
        manifest: dummyManifest,
        mockLivePlaces: validLive
      });

      assert.strictEqual(outcome.success, true);
      assert.strictEqual(outcome.dryRun, true);
      assert.strictEqual(outcome.results.length, 3);
      for (const r of outcome.results) {
        assert.strictEqual(r.action, 'DRY_RUN_SKIP');
      }
      assert.strictEqual(JSON.stringify(mockPlaces), initialDbState, 'DB tuyệt đối không bị thay đổi khi dry-run');
    });

    await runTest('10.4 Dry-run CLI exit code 1 khi manifest thiếu hoặc không hợp lệ', async () => {
      try {
        await execFileAsync(process.execPath, [
          path.join(ROOT_DIR, 'scripts', 'cleanup-g9-test-data.js'),
          '--dry-run',
          '--manifest=non-existent-manifest-snapshot.json'
        ]);
        assert.fail('Bắt buộc phải fail khi manifest không tồn tại');
      } catch (err) {
        assert.strictEqual(err.code, 1);
        assert.ok(err.stderr.includes('DRY-RUN THẤT BẠI') || err.stdout.includes('DRY-RUN THẤT BẠI'));
      }
    });

    await runTest('10.5 Public Places List loại trừ địa điểm archived, favorites và recent không bị crash', () => {
      const publicApprovedPlaces = [
        { id: '1', dbId: 1, name: 'Ao Bà Om', slug: 'ao-ba-om' },
        { id: '2', dbId: 2, name: 'Biển Ba Động', slug: 'bien-ba-dong' }
      ];

      state.allPlaces = publicApprovedPlaces;
      state.favorites = ['1', '4', '10', 'adasdasd'];
      state.recent = ['2', '4', 'dia-diem-test-google-form'];

      const savedPlaces = publicApprovedPlaces.filter(p => isPlaceSaved(p));
      assert.strictEqual(savedPlaces.length, 1);
      assert.strictEqual(savedPlaces[0].id, '1');

      canonicalizePreferences(publicApprovedPlaces);
      assert.ok(Array.isArray(state.favorites));
      assert.ok(Array.isArray(state.recent));
    });

    await runTest('10.6 Deep Link / Open Modal với địa điểm đã archived không ném exception', () => {
      state.allPlaces = [
        { id: '1', dbId: 1, name: 'Ao Bà Om', slug: 'ao-ba-om' }
      ];

      globalThis.document = {
        getElementById() {
          return {
            classList: { add() {}, remove() {} },
            textContent: ''
          };
        }
      };
      globalThis.window = {
        location: new URL('http://localhost:8000/place/adasdasd'),
        history: { replaceState() {} }
      };

      assert.doesNotThrow(() => {
        openDetailModal('adasdasd');
      });

      assert.doesNotThrow(() => {
        openDetailModal(4);
      });
    });

  } finally {
    await stopMockSupabaseServer();
  }

  console.log('\n========================================');
  console.log(`KẾT QUẢ KIỂM THỬ G9.2: ${passedTests}/${totalTests} PASS`);
  console.log('========================================\n');
}

main().catch(err => {
  console.error('Lỗi bộ kiểm thử G9.2:', err);
  process.exit(1);
});
