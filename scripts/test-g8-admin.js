// scripts/test-g8-admin.js
// Bộ kiểm thử tự động G8: Quản trị nội dung & Vận hành (G8.1 Auth/RBAC + G8.2 Unified APIs & Audit Logs)

import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import placesHandler from '../api/admin-places.js';
import commentsHandler from '../api/admin-comments.js';
import reportsHandler from '../api/admin-reports.js';
import profileHandler from '../api/admin-profile.js';
import { sanitizeAuditPayload, readBody, getCorrelationId, validateCorrelationId, AUDIT_ALLOWLIST } from '../api/_admin-auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
// In-Memory Database phục vụ Mock Supabase Server
// ----------------------------------------------------------------------------
let mockAuditLogShouldFail = false;
let mockAuthDropConnection = false;
let mockAuthStatus503 = false;
let mockAdminUsers500 = false;
let nextPlaceId = 101;
let nextCommentId = 201;
const mockAuditLogs = [];
const mockRecordedRequests = [];

const mockPlaces = [
  {
    id: 1,
    slug: 'ao-ba-om',
    name: 'Ao Bà Om',
    category: 'attraction',
    area: 'tp-tra-vinh',
    status: 'approved',
    rating: 4.8,
    contact: '0912345678',
    contributor: 'Nguyen Van Contributor',
    description: 'Danh thang lich su van hoa cap quoc gia',
    note: 'Ghi chu quan tri noi bo chua PII',
    address: 'Phuong 8, TP Tra Vinh',
    client_submission_id: 'sub-test-1',
    sort_order: 1,
    is_featured: true
  },
  {
    id: 2,
    slug: 'chua-ang',
    name: 'Chùa Âng',
    category: 'pagoda',
    area: 'tp-tra-vinh',
    status: 'draft',
    rating: 4.9,
    contact: '0987654321',
    contributor: 'Admin',
    description: 'Ngoi chua Khmer co kinh',
    note: 'Noi bo',
    address: 'Quoc lo 53, Tra Vinh',
    client_submission_id: 'sub-test-2',
    sort_order: 2,
    is_featured: false
  },
  {
    id: 99,
    slug: 'diem-tam-xoa-cung',
    name: 'Điểm Tạm Xóa Cứng',
    category: 'attraction',
    area: 'tp-tra-vinh',
    status: 'draft',
    rating: 3.5
  }
];

const mockComments = [
  {
    id: 10,
    place_id: 'ao-ba-om',
    place_name: 'Ao Bà Om',
    author_name: 'Nguyen Van Visitor',
    comment_text: 'Dia diem tham quan rat thoang mat va dep',
    rating: 5,
    photo_url: 'https://example.com/photo.jpg',
    photo_metadata: { camera: 'iPhone', ip: '192.168.1.50' },
    client_review_id: 'cl-rev-001',
    is_hidden: false,
    status: 'approved',
    created_at: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 20,
    place_id: 'chua-hang',
    place_name: 'Chùa Hang',
    author_name: 'Le Thi B',
    comment_text: 'Canh dep yen tinh',
    rating: 5,
    photo_url: 'https://example.com/photo2.jpg',
    photo_metadata: { ip: '192.168.1.51' },
    client_review_id: 'cl-rev-002',
    is_hidden: false,
    status: 'pending',
    created_at: new Date(Date.now() - 7200000).toISOString()
  },
  {
    id: 30,
    place_id: 'bien-ba-dong',
    place_name: 'Biển Ba Động',
    author_name: 'Tran Van C',
    comment_text: 'Bien dep thoang dang',
    rating: 4,
    photo_url: 'https://example.com/photo3.jpg',
    photo_metadata: { ip: '192.168.1.52' },
    client_review_id: 'cl-rev-003',
    is_hidden: false,
    status: 'approved',
    created_at: new Date(Date.now() - 10800000).toISOString()
  }
];

const mockReports = [
  {
    id: '11111111-1111-1111-1111-000000000001',
    place_id: 'ao-ba-om',
    place_name: 'Ao Bà Om',
    issue_type: 'wrong_hours',
    details: 'Mở cửa từ 6h sáng chứ không phải 7h',
    reporter_contact: '0912345678',
    ip: '123.45.67.89',
    client_report_id: 'clrep-001',
    status: 'pending',
    created_at: new Date(Date.now() - 3600000).toISOString(),
    reviewed_at: null,
    admin_notes: null
  },
  {
    id: '11111111-1111-1111-1111-000000000002',
    place_id: 'chua-hang',
    place_name: 'Chùa Hang',
    issue_type: 'wrong_price',
    details: 'Vé vào cửa miễn phí không thu tiền',
    reporter_contact: 'reporter@test.vn',
    ip: '123.45.67.90',
    client_report_id: 'clrep-002',
    status: 'reviewed',
    created_at: new Date(Date.now() - 7200000).toISOString(),
    reviewed_at: new Date(Date.now() - 1800000).toISOString(),
    admin_notes: 'Đang xác minh với ban quản lý'
  },
  {
    id: '11111111-1111-1111-1111-000000000003',
    place_id: 'bien-ba-dong',
    place_name: 'Biển Ba Động',
    issue_type: 'closed',
    details: 'Bãi tắm tạm ngưng đón khách do thời tiết',
    reporter_contact: 'khach@dulich.vn',
    ip: '123.45.67.91',
    client_report_id: 'clrep-003',
    status: 'resolved',
    created_at: new Date(Date.now() - 10800000).toISOString(),
    reviewed_at: new Date(Date.now() - 3600000).toISOString(),
    admin_notes: 'Đã cập nhật operating_status tạm ngưng'
  }
];

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

      mockRecordedRequests.push({ method, pathname: url.pathname, url: req.url, body });

      // 1. Supabase Auth: GET /auth/v1/user
      if (url.pathname === '/auth/v1/user') {
        if (mockAuthDropConnection) {
          req.socket.destroy();
          return;
        }
        if (mockAuthStatus503) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'service_unavailable', message: 'Supabase Auth service is down' }));
        }
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
        if (mockAdminUsers500) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ message: 'Database connection error' }));
        }
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

      // 5. REST API: /rest/v1/admin_audit_logs
      if (url.pathname === '/rest/v1/admin_audit_logs') {
        if (mockAuditLogShouldFail) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ message: 'Simulated audit log storage failure' }));
        }
        if (method === 'POST') {
          mockAuditLogs.push(body);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify([{ id: `audit-${mockAuditLogs.length}`, ...body }]));
        }
        if (method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Range': `0-${mockAuditLogs.length}/${mockAuditLogs.length}` });
          return res.end(JSON.stringify(mockAuditLogs));
        }
      }

      // 6. REST API: RPC Functions (PostgreSQL Atomic Transactions)
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const rpcName = url.pathname.replace('/rest/v1/rpc/', '');

        if (mockAuditLogShouldFail) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ message: 'AUDIT_LOG_FAILED: Simulated audit log storage failure' }));
        }

        if (rpcName === 'admin_create_place_atomic') {
          const { p_actor_id, p_actor_email, p_actor_role, p_place_data, p_ip, p_correlation_id } = body;
          if (!['admin', 'editor'].includes(p_actor_role)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: 'FORBIDDEN: Chỉ admin hoặc editor mới có quyền tạo địa điểm' }));
          }
          if (!p_place_data?.name || !p_place_data?.slug || !p_place_data?.category) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: 'INVALID_INPUT: Thiếu trường bắt buộc' }));
          }
          const newPlace = {
            id: nextPlaceId++,
            slug: p_place_data.slug,
            name: p_place_data.name,
            category: p_place_data.category,
            area: p_place_data.area || null,
            status: p_place_data.status || 'draft',
            rating: p_place_data.rating || 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          mockPlaces.push(newPlace);
          mockAuditLogs.push({
            actor_id: p_actor_id,
            actor_email: p_actor_email,
            actor_role: p_actor_role,
            action: 'place.create',
            entity_type: 'place',
            entity_id: String(newPlace.id),
            payload_before: null,
            payload_after: { id: newPlace.id, slug: newPlace.slug, name: newPlace.name, category: newPlace.category, status: newPlace.status },
            ip: p_ip,
            correlation_id: p_correlation_id,
            created_at: new Date().toISOString()
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(newPlace));
        }

        if (rpcName === 'admin_update_place_atomic') {
          const { p_actor_id, p_actor_email, p_actor_role, p_place_id, p_patch, p_ip, p_correlation_id } = body;
          if (!['admin', 'editor'].includes(p_actor_role)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: 'FORBIDDEN: Chỉ admin hoặc editor mới có quyền cập nhật địa điểm' }));
          }
          const found = mockPlaces.find(p => p.id === p_place_id);
          if (!found) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: `NOT_FOUND: Không tìm thấy địa điểm ${p_place_id}` }));
          }
          const before = { ...found };
          Object.assign(found, p_patch);
          found.updated_at = new Date().toISOString();

          const action = found.status === 'archived' && before.status !== 'archived' ? 'place.archive' : (found.status !== before.status ? `place.${found.status}` : 'place.update');
          mockAuditLogs.push({
            actor_id: p_actor_id,
            actor_email: p_actor_email,
            actor_role: p_actor_role,
            action,
            entity_type: 'place',
            entity_id: String(found.id),
            payload_before: { id: before.id, slug: before.slug, name: before.name, category: before.category, status: before.status },
            payload_after: { id: found.id, slug: found.slug, name: found.name, category: found.category, status: found.status },
            ip: p_ip,
            correlation_id: p_correlation_id,
            created_at: new Date().toISOString()
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(found));
        }

        if (rpcName === 'admin_delete_place_atomic') {
          const { p_actor_id, p_actor_email, p_actor_role, p_place_id, p_permanent, p_ip, p_correlation_id } = body;
          if (p_actor_role !== 'admin') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: 'FORBIDDEN: Chỉ admin mới có quyền xóa hoặc lưu trữ địa điểm' }));
          }
          const idx = mockPlaces.findIndex(p => p.id === p_place_id);
          if (idx === -1) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: `NOT_FOUND: Không tìm thấy địa điểm ${p_place_id}` }));
          }
          const before = { ...mockPlaces[idx] };
          if (p_permanent) {
            mockPlaces.splice(idx, 1);
            mockAuditLogs.push({
              actor_id: p_actor_id,
              actor_email: p_actor_email,
              actor_role: p_actor_role,
              action: 'place.delete',
              entity_type: 'place',
              entity_id: String(p_place_id),
              payload_before: { id: before.id, slug: before.slug, name: before.name, category: before.category, status: before.status },
              payload_after: null,
              ip: p_ip,
              correlation_id: p_correlation_id,
              created_at: new Date().toISOString()
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ id: p_place_id, deleted: true, permanent: true }));
          } else {
            mockPlaces[idx].status = 'archived';
            mockPlaces[idx].updated_at = new Date().toISOString();
            const after = { ...mockPlaces[idx] };
            mockAuditLogs.push({
              actor_id: p_actor_id,
              actor_email: p_actor_email,
              actor_role: p_actor_role,
              action: 'place.archive',
              entity_type: 'place',
              entity_id: String(p_place_id),
              payload_before: { id: before.id, status: before.status },
              payload_after: { id: after.id, status: after.status },
              ip: p_ip,
              correlation_id: p_correlation_id,
              created_at: new Date().toISOString()
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ id: p_place_id, archived: true, status: 'archived', place: after }));
          }
        }

        if (rpcName === 'admin_update_comment_atomic') {
          const { p_actor_id, p_actor_email, p_actor_role, p_comment_id, p_patch, p_ip, p_correlation_id } = body;
          if (!['admin', 'moderator'].includes(p_actor_role)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: 'FORBIDDEN: Chỉ admin hoặc moderator mới có quyền kiểm duyệt bình luận' }));
          }
          const found = mockComments.find(c => c.id === p_comment_id);
          if (!found) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: `NOT_FOUND: Không tìm thấy bình luận ${p_comment_id}` }));
          }
          const before = { ...found };
          if (p_patch.status) found.status = p_patch.status;
          if (typeof p_patch.is_hidden === 'boolean') found.is_hidden = p_patch.is_hidden;
          found.updated_at = new Date().toISOString();

          const action = found.status === 'approved' ? 'comment.approve' : (found.is_hidden || found.status === 'hidden' ? 'comment.hide' : 'comment.moderate');
          mockAuditLogs.push({
            actor_id: p_actor_id,
            actor_email: p_actor_email,
            actor_role: p_actor_role,
            action,
            entity_type: 'comment',
            entity_id: String(found.id),
            payload_before: { id: before.id, place_id: before.place_id, status: before.status, is_hidden: before.is_hidden },
            payload_after: { id: found.id, place_id: found.place_id, status: found.status, is_hidden: found.is_hidden },
            ip: p_ip,
            correlation_id: p_correlation_id,
            created_at: new Date().toISOString()
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(found));
        }

        if (rpcName === 'admin_delete_comment_atomic') {
          const { p_actor_id, p_actor_email, p_actor_role, p_comment_id, p_ip, p_correlation_id } = body;
          if (p_actor_role !== 'admin') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: 'FORBIDDEN: Chỉ admin mới có quyền xóa cứng bình luận' }));
          }
          const idx = mockComments.findIndex(c => c.id === p_comment_id);
          if (idx === -1) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: `NOT_FOUND: Không tìm thấy bình luận ${p_comment_id}` }));
          }
          const before = { ...mockComments[idx] };
          mockComments.splice(idx, 1);
          mockAuditLogs.push({
            actor_id: p_actor_id,
            actor_email: p_actor_email,
            actor_role: p_actor_role,
            action: 'comment.delete',
            entity_type: 'comment',
            entity_id: String(p_comment_id),
            payload_before: { id: before.id, place_id: before.place_id, status: before.status },
            payload_after: null,
            ip: p_ip,
            correlation_id: p_correlation_id,
            created_at: new Date().toISOString()
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ id: p_comment_id, deleted: true }));
        }

        if (rpcName === 'admin_update_report_atomic') {
          const { p_actor_id, p_actor_email, p_actor_role, p_report_id, p_status, p_admin_notes, p_ip, p_correlation_id } = body;
          if (!['admin', 'moderator'].includes(p_actor_role)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: 'FORBIDDEN: Chỉ admin hoặc moderator mới có quyền cập nhật báo cáo' }));
          }
          const found = mockReports.find(r => r.id === p_report_id);
          if (!found) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: `NOT_FOUND: Không tìm thấy báo cáo ${p_report_id}` }));
          }
          const before = { id: found.id, place_id: found.place_id, status: found.status, admin_notes: found.admin_notes, reviewed_at: found.reviewed_at };
          if (p_status) {
            const current = found.status || 'pending';
            const validNext = {
              pending: ['pending', 'reviewed', 'resolved', 'dismissed'],
              reviewed: ['reviewed', 'resolved', 'dismissed'],
              resolved: ['resolved', 'reviewed'],
              dismissed: ['dismissed', 'reviewed']
            }[current] || [];
            if (!validNext.includes(p_status)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ message: `INVALID_STATUS_TRANSITION: Không thể chuyển từ ${current} sang ${p_status}` }));
            }
            found.status = p_status;
          }
          if (p_admin_notes !== null && p_admin_notes !== undefined) {
            found.admin_notes = p_admin_notes;
          }
          found.reviewed_at = new Date().toISOString();
          mockAuditLogs.push({
            actor_id: p_actor_id,
            actor_email: p_actor_email,
            actor_role: p_actor_role,
            action: `report.${found.status}`,
            entity_type: 'report',
            entity_id: String(found.id),
            payload_before: before,
            payload_after: { id: found.id, place_id: found.place_id, status: found.status, admin_notes: found.admin_notes, reviewed_at: found.reviewed_at },
            ip: p_ip,
            correlation_id: p_correlation_id,
            created_at: new Date().toISOString()
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(found));
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: `Unknown RPC function: ${rpcName}` }));
      }

      // 7. REST API: /rest/v1/place_reports
      if (url.pathname === '/rest/v1/place_reports') {
        if (method === 'GET') {
          let list = [...mockReports];
          const statusMatch = url.search.match(/status=eq\.([a-zA-Z0-9_]+)/);
          if (statusMatch) {
            list = list.filter(r => r.status === statusMatch[1]);
          }
          const idMatch = url.search.match(/id=eq\.([a-zA-Z0-9_-]+)/);
          if (idMatch) {
            const found = mockReports.filter(r => r.id === idMatch[1]);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(found));
          }
          const searchMatch = url.search.match(/place_name\.ilike\.\*([^*]+)\*/);
          if (searchMatch) {
            const query = decodeURIComponent(searchMatch[1]).toLowerCase();
            list = list.filter(r => (r.place_name || '').toLowerCase().includes(query) || (r.details || '').toLowerCase().includes(query));
          }

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Content-Range': `0-${list.length}/${list.length}`
          });
          return res.end(JSON.stringify(list));
        }

        // Chặn dứt khoát direct REST mutation: Bắt buộc dùng RPC atomic transaction
        res.writeHead(405, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: 'METHOD_NOT_ALLOWED: Direct REST mutation forbidden. Call /rest/v1/rpc/* instead' }));
      }

      // 8. REST API: /rest/v1/places
      if (url.pathname === '/rest/v1/places') {
        const idMatch = url.search.match(/id=eq\.(\d+)/);
        const placeId = idMatch ? parseInt(idMatch[1], 10) : null;

        if (method === 'GET') {
          if (placeId !== null) {
            const found = mockPlaces.filter(p => p.id === placeId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(found));
          }
          res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Range': `0-${mockPlaces.length}/${mockPlaces.length}` });
          return res.end(JSON.stringify(mockPlaces));
        }

        // Chặn dứt khoát direct REST mutation: Bắt buộc dùng RPC atomic transaction
        res.writeHead(405, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: 'METHOD_NOT_ALLOWED: Direct REST mutation forbidden. Call /rest/v1/rpc/* instead' }));
      }

      // 9. REST API: /rest/v1/place_comments
      if (url.pathname === '/rest/v1/place_comments') {
        const idMatch = url.search.match(/id=eq\.(\d+)/);
        const commId = idMatch ? parseInt(idMatch[1], 10) : null;

        if (method === 'GET') {
          if (commId !== null) {
            const found = mockComments.filter(c => c.id === commId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(found));
          }
          res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Range': `0-${mockComments.length}/${mockComments.length}` });
          return res.end(JSON.stringify(mockComments));
        }

        // Chặn dứt khoát direct REST mutation: Bắt buộc dùng RPC atomic transaction
        res.writeHead(405, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: 'METHOD_NOT_ALLOWED: Direct REST mutation forbidden. Call /rest/v1/rpc/* instead' }));
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

console.log('\n=== BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG G8 (G8.1 AUTH & RBAC + G8.2 APIS & AUDIT LOGS) ===\n');

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
        area: 'tp-tra-vinh',
        address: 'Đường Bờ Kè, Phường 1, Trà Vinh'
      }
    });
    await placesHandler(req, res);
    assert.strictEqual(res.getStatus(), 201, 'Editor POST phải trả về HTTP 201 Created');
    const body = res.getBody();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.place?.id, 101);
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
  });

  // 18. Test thật: Admin mutation thành công
  await runAsyncTest('18. Test thật: Admin mutation thành công (POST, PATCH, DELETE)', async () => {
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

    // 18.3 Admin DELETE place (soft-delete default)
    const { req: delReq, res: delRes } = createMockReqRes({
      method: 'DELETE',
      url: '/api/admin-places?id=101',
      ip: '10.0.0.18',
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await placesHandler(delReq, delRes);
    assert.strictEqual(delRes.getStatus(), 200);
    assert.strictEqual(delRes.getBody().archived, true);

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
      url: '/api/admin-comments?id=20',
      ip: '10.0.0.18',
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await commentsHandler(cDelReq, cDelRes);
    assert.strictEqual(cDelRes.getStatus(), 200);
  });

  // 19. Test Profile: GET /api/admin-profile trả đúng profile & role
  await runAsyncTest('19. Test Profile: GET /api/admin-profile trả đúng profile & role đã xác minh cho Admin, Editor và Moderator', async () => {
    const { req: aReq, res: aRes } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-profile',
      ip: '10.0.0.19',
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await profileHandler(aReq, aRes);
    assert.strictEqual(aRes.getStatus(), 200);
    assert.strictEqual(aRes.getBody().user?.role, 'admin');

    const { req: eReq, res: eRes } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-profile',
      ip: '10.0.0.19',
      headers: { Authorization: 'Bearer mock-editor-token' }
    });
    await profileHandler(eReq, eRes);
    assert.strictEqual(eRes.getStatus(), 200);
    assert.strictEqual(eRes.getBody().user?.role, 'editor');

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
    const { req: expReq, res: expRes } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-profile',
      ip: '10.0.0.20',
      headers: { Authorization: 'Bearer mock-expired-token' }
    });
    await profileHandler(expReq, expRes);
    assert.strictEqual(expRes.getStatus(), 401);
    assert.strictEqual(expRes.getBody().error?.code, 'UNAUTHENTICATED');

    const refreshRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: 'valid-refresh-token' })
    });
    assert.strictEqual(refreshRes.status, 200);
    const refreshData = await refreshRes.json();
    assert.strictEqual(refreshData.access_token, 'refreshed-access-token-xyz');
    assert.strictEqual(refreshData.refresh_token, 'refreshed-refresh-token-123');

    const badRefreshRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: 'invalid-refresh-token' })
    });
    assert.strictEqual(badRefreshRes.status, 400);

    const logoutRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${refreshData.access_token}` }
    });
    assert.strictEqual(logoutRes.status, 204);
  });

  // --------------------------------------------------------------------------
  // BẮT ĐẦU CÁC BÀI KIỂM THỬ G8.2 (REPORTS, AUDIT LOGS, PAGINATION, RBAC)
  // --------------------------------------------------------------------------

  // 21. GET /api/admin-reports: phân trang, lọc và tìm kiếm ổn định
  await runAsyncTest('21. GET /api/admin-reports: phân trang, lọc trạng thái và tìm kiếm ổn định', async () => {
    // 21.1 Lấy toàn bộ reports
    const { req, res } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-reports?page=1&limit=10',
      ip: '10.0.0.21',
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await reportsHandler(req, res);
    assert.strictEqual(res.getStatus(), 200);
    const body = res.getBody();
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.reports));
    assert.ok(body.pagination);
    assert.strictEqual(body.pagination.page, 1);
    assert.strictEqual(body.pagination.limit, 10);

    // 21.2 Lọc theo trạng thái pending
    const { req: reqFilter, res: resFilter } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-reports?status=pending',
      ip: '10.0.0.21',
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await reportsHandler(reqFilter, resFilter);
    assert.strictEqual(resFilter.getStatus(), 200);
    const filterBody = resFilter.getBody();
    assert.ok(filterBody.reports.every(r => r.status === 'pending'));

    // 21.3 Tìm kiếm theo từ khóa
    const { req: reqSearch, res: resSearch } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-reports?search=Ao+Bà+Om',
      ip: '10.0.0.21',
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await reportsHandler(reqSearch, resSearch);
    assert.strictEqual(resSearch.getStatus(), 200);
    assert.ok(resSearch.getBody().reports.some(r => r.place_name.includes('Ao Bà Om')));
  });

  // 22. GET /api/admin-reports: lọc PII (Editor bị ẩn số điện thoại và IP, Admin/Moderator xem được)
  await runAsyncTest('22. GET /api/admin-reports lọc PII: Editor bị ẩn liên hệ/IP, Admin & Moderator xem được', async () => {
    // 22.1 Editor xem báo cáo -> IP và reporter_contact phải bị NULL
    const { req: eReq, res: eRes } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-reports',
      ip: '10.0.0.22',
      headers: { Authorization: 'Bearer mock-editor-token' }
    });
    await reportsHandler(eReq, eRes);
    assert.strictEqual(eRes.getStatus(), 200);
    const eBody = eRes.getBody();
    for (const rep of eBody.reports) {
      assert.strictEqual(rep.reporter_contact, null, 'Editor không được xem reporter_contact');
      assert.strictEqual(rep.ip, null, 'Editor không được xem IP người báo');
    }

    // 22.2 Moderator xem báo cáo -> Có số điện thoại/IP
    const { req: mReq, res: mRes } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-reports',
      ip: '10.0.0.22',
      headers: { Authorization: 'Bearer mock-moderator-token' }
    });
    await reportsHandler(mReq, mRes);
    assert.strictEqual(mRes.getStatus(), 200);
    const mBody = mRes.getBody();
    const repWithContact = mBody.reports.find(r => r.id === '11111111-1111-1111-1111-000000000001');
    assert.ok(repWithContact && repWithContact.reporter_contact !== null, 'Moderator được xem reporter_contact');
  });

  // 23. Editor bị chặn HTTP 403 khi cố gắng PATCH cập nhật báo sai (place_reports)
  await runAsyncTest('23. Editor bị chặn HTTP 403 khi cố gắng PATCH cập nhật báo sai (place_reports)', async () => {
    const { req, res } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-reports',
      ip: '10.0.0.23',
      headers: { Authorization: 'Bearer mock-editor-token' },
      body: { id: '11111111-1111-1111-1111-000000000001', status: 'reviewed' }
    });
    await reportsHandler(req, res);
    assert.strictEqual(res.getStatus(), 403, 'Editor phải bị chặn 403 khi PATCH báo cáo');
    assert.strictEqual(res.getBody().error?.code, 'FORBIDDEN');
  });

  // 24. Moderator & Admin xử lý báo sai thành công (PATCH status và admin_notes)
  await runAsyncTest('24. Moderator & Admin xử lý báo sai thành công (cập nhật status và admin_notes)', async () => {
    // 24.1 Moderator đổi pending -> reviewed
    const { req: mReq, res: mRes } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-reports',
      ip: '10.0.0.24',
      headers: { Authorization: 'Bearer mock-moderator-token' },
      body: {
        id: '11111111-1111-1111-1111-000000000001',
        status: 'reviewed',
        admin_notes: 'Đã xác nhận với người dân khu vực Ao Bà Om'
      }
    });
    await reportsHandler(mReq, mRes);
    assert.strictEqual(mRes.getStatus(), 200);
    const mBody = mRes.getBody();
    assert.strictEqual(mBody.success, true);
    assert.strictEqual(mBody.report.status, 'reviewed');
    assert.strictEqual(mBody.report.admin_notes, 'Đã xác nhận với người dân khu vực Ao Bà Om');

    // 24.2 Admin đổi reviewed -> resolved
    const { req: aReq, res: aRes } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-reports',
      ip: '10.0.0.24',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: {
        id: '11111111-1111-1111-1111-000000000001',
        status: 'resolved',
        admin_notes: 'Đã sửa giờ mở cửa địa điểm thành 06:00'
      }
    });
    await reportsHandler(aReq, aRes);
    assert.strictEqual(aRes.getStatus(), 200);
    assert.strictEqual(aRes.getBody().report.status, 'resolved');
  });

  // 25. Chặn chuyển đổi trạng thái báo sai không hợp lệ và hỗ trợ reopen hợp lệ
  await runAsyncTest('25. Chặn chuyển đổi trạng thái báo sai không hợp lệ (INVALID_STATUS_TRANSITION) và hỗ trợ reopen hợp lệ', async () => {
    // 25.1 Trạng thái bịa đặt
    const { req: reqFake, res: resFake } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-reports',
      ip: '10.0.0.25',
      headers: { Authorization: 'Bearer mock-moderator-token' },
      body: { id: '11111111-1111-1111-1111-000000000002', status: 'approved_fake' }
    });
    await reportsHandler(reqFake, resFake);
    assert.strictEqual(resFake.getStatus(), 400);
    assert.strictEqual(resFake.getBody().error?.code, 'INVALID_STATUS');

    // 25.2 Chuyển đổi cấm: resolved -> pending trực tiếp
    const { req: reqInv1, res: resInv1 } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-reports',
      ip: '10.0.0.25',
      headers: { Authorization: 'Bearer mock-moderator-token' },
      body: { id: '11111111-1111-1111-1111-000000000003', status: 'pending' }
    });
    await reportsHandler(reqInv1, resInv1);
    assert.strictEqual(resInv1.getStatus(), 400);
    assert.strictEqual(resInv1.getBody().error?.code, 'INVALID_STATUS_TRANSITION');

    // 25.3 Chuyển đổi cấm: resolved -> dismissed trực tiếp
    const { req: reqInv2, res: resInv2 } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-reports',
      ip: '10.0.0.25',
      headers: { Authorization: 'Bearer mock-moderator-token' },
      body: { id: '11111111-1111-1111-1111-000000000003', status: 'dismissed' }
    });
    await reportsHandler(reqInv2, resInv2);
    assert.strictEqual(resInv2.getStatus(), 400);
    assert.strictEqual(resInv2.getBody().error?.code, 'INVALID_STATUS_TRANSITION');

    // 25.4 Chuyển đổi hợp lệ: Reopen resolved -> reviewed
    const { req: reqReopen, res: resReopen } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-reports',
      ip: '10.0.0.25',
      headers: { Authorization: 'Bearer mock-moderator-token' },
      body: { id: '11111111-1111-1111-1111-000000000003', status: 'reviewed', admin_notes: 'Mở lại thẩm định bổ sung' }
    });
    await reportsHandler(reqReopen, resReopen);
    assert.strictEqual(resReopen.getStatus(), 200);
    assert.strictEqual(resReopen.getBody().report.status, 'reviewed');
  });

  // 26. Chặn Mass Assignment trên place_reports: cấm sửa id, client_report_id, IP, created_at
  await runAsyncTest('26. Chặn Mass Assignment trên place_reports: cấm sửa id, client_report_id, IP, created_at', async () => {
    const { req, res } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-reports',
      ip: '10.0.0.26',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: {
        id: '11111111-1111-1111-1111-000000000002',
        client_report_id: 'malicious-injected-id',
        ip: '1.1.1.1',
        created_at: '2020-01-01T00:00:00.000Z',
        admin_notes: 'Cập nhật ghi chú an toàn'
      }
    });
    await reportsHandler(req, res);
    assert.strictEqual(res.getStatus(), 200);
    const updated = mockReports.find(r => r.id === '11111111-1111-1111-1111-000000000002');
    assert.strictEqual(updated.client_report_id, 'clrep-002', 'client_report_id không được phép bị thay đổi');
    assert.strictEqual(updated.ip, '123.45.67.90', 'IP gốc của người báo không được phép bị thay đổi');
  });

  // 27. Chặn payload vượt quá giới hạn 1MB trên admin-reports (HTTP 413)
  await runAsyncTest('27. Chặn payload vượt quá giới hạn 1MB trên admin-reports (HTTP 413)', async () => {
    const largeString = 'x'.repeat(1024 * 1024 + 100);
    const { req, res } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-reports',
      ip: '10.0.0.27',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: { id: '11111111-1111-1111-1111-000000000002', admin_notes: largeString }
    });
    await reportsHandler(req, res);
    assert.strictEqual(res.getStatus(), 413);
    assert.strictEqual(res.getBody().error?.code, 'PAYLOAD_TOO_LARGE');
  });

  // 28. Ghi audit log tự động cho thao tác xử lý báo sai (report.update / report.resolved)
  await runAsyncTest('28. Ghi audit log tự động cho thao tác xử lý báo sai (report)', async () => {
    mockAuditLogs.length = 0; // Reset audit logs

    const { req, res } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-reports',
      ip: '10.0.0.28',
      headers: {
        Authorization: 'Bearer mock-moderator-token',
        'x-correlation-id': 'corr-report-test-01'
      },
      body: {
        id: '11111111-1111-1111-1111-000000000002',
        status: 'dismissed',
        admin_notes: 'Báo cáo không đúng thực tế'
      }
    });
    await reportsHandler(req, res);
    assert.strictEqual(res.getStatus(), 200);

    assert.strictEqual(mockAuditLogs.length, 1, 'Phải ghi nhận đúng 1 audit log');
    const log = mockAuditLogs[0];
    assert.strictEqual(log.entity_type, 'report');
    assert.strictEqual(log.entity_id, '11111111-1111-1111-1111-000000000002');
    assert.strictEqual(log.action, 'report.dismissed');
    assert.strictEqual(log.actor_role, 'moderator');
    assert.strictEqual(log.correlation_id, 'corr-report-test-01');
    assert.strictEqual(log.ip, '10.0.0.28');
    assert.ok(log.payload_before);
    assert.ok(log.payload_after);
  });

  // 29. Ghi audit log tự động cho thao tác địa điểm (place.create, place.update, place.archive)
  await runAsyncTest('29. Ghi audit log tự động cho thao tác địa điểm (place.create, update, archive)', async () => {
    mockAuditLogs.length = 0;

    // 29.1 Create place audit log
    const { req: cReq, res: cRes } = createMockReqRes({
      method: 'POST',
      url: '/api/admin-places',
      ip: '10.0.0.29',
      headers: {
        Authorization: 'Bearer mock-editor-token',
        'x-correlation-id': 'corr-place-create-01'
      },
      body: {
        name: 'Vườn Cam Trà Vinh',
        category: 'Sinh Thái / Miệt Vườn'
      }
    });
    await placesHandler(cReq, cRes);
    assert.strictEqual(cRes.getStatus(), 201);
    const createLog = mockAuditLogs.find(l => l.action === 'place.create');
    assert.ok(createLog, 'Phải có audit log place.create');
    assert.strictEqual(createLog.entity_type, 'place');
    assert.strictEqual(createLog.actor_role, 'editor');
    assert.strictEqual(createLog.correlation_id, 'corr-place-create-01');

    // 29.2 Archive place audit log
    const { req: aReq, res: aRes } = createMockReqRes({
      method: 'DELETE',
      url: '/api/admin-places?id=1',
      ip: '10.0.0.29',
      headers: {
        Authorization: 'Bearer mock-admin-token',
        'x-correlation-id': 'corr-place-archive-01'
      }
    });
    await placesHandler(aReq, aRes);
    assert.strictEqual(aRes.getStatus(), 200);
    const archiveLog = mockAuditLogs.find(l => l.action === 'place.archive');
    assert.ok(archiveLog, 'Phải có audit log place.archive');
    assert.strictEqual(archiveLog.entity_id, '1');
  });

  // 30. Ghi audit log tự động cho thao tác bình luận (comment.moderate, comment.delete)
  await runAsyncTest('30. Ghi audit log tự động cho thao tác bình luận (comment.moderate, comment.delete)', async () => {
    mockAuditLogs.length = 0;

    // 30.1 Moderate comment
    const { req: mReq, res: mRes } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-comments',
      ip: '10.0.0.30',
      headers: {
        Authorization: 'Bearer mock-moderator-token',
        'x-correlation-id': 'corr-comm-mod-01'
      },
      body: { id: 10, is_hidden: true, status: 'hidden' }
    });
    await commentsHandler(mReq, mRes);
    assert.strictEqual(mRes.getStatus(), 200);
    const modLog = mockAuditLogs.find(l => l.entity_type === 'comment' && l.action === 'comment.hide');
    assert.ok(modLog, 'Phải có audit log comment.hide');
    assert.strictEqual(modLog.entity_id, '10');

    // 30.2 Delete comment
    const { req: dReq, res: dRes } = createMockReqRes({
      method: 'DELETE',
      url: '/api/admin-comments?id=10',
      ip: '10.0.0.30',
      headers: {
        Authorization: 'Bearer mock-admin-token',
        'x-correlation-id': 'corr-comm-del-01'
      }
    });
    await commentsHandler(dReq, dRes);
    assert.strictEqual(dRes.getStatus(), 200);
    const delLog = mockAuditLogs.find(l => l.entity_type === 'comment' && l.action === 'comment.delete');
    assert.ok(delLog, 'Phải có audit log comment.delete');
  });

  // 31. Sanitize Audit Payload: Lọc sạch PII theo allowlist và loại bỏ hoàn toàn contact/author_name/comment_text/photos/IP
  await runAsyncTest('31. Lọc PII khỏi audit payload theo allowlist và khử sạch dữ liệu nhạy cảm lồng nhau', () => {
    // 31.1 Kiểm tra allowlist place: loại bỏ contact, contributor, note, address
    const dirtyPlace = {
      id: 1,
      name: 'Ao Bà Om',
      slug: 'ao-ba-om',
      category: 'attraction',
      status: 'approved',
      contact: '0912345678',
      contributor: 'Admin Test',
      note: 'Ghi chú bảo mật',
      address: '123 Đường Số 1',
      description: 'Mô tả chi tiết',
      rating: 4.8
    };
    const cleanPlace = sanitizeAuditPayload(dirtyPlace, 'place');
    assert.strictEqual(cleanPlace.id, 1);
    assert.strictEqual(cleanPlace.name, 'Ao Bà Om');
    assert.strictEqual(cleanPlace.status, 'approved');
    assert.strictEqual(cleanPlace.rating, 4.8);
    assert.strictEqual(cleanPlace.contact, undefined, 'contact phải bị lọc hoàn toàn khỏi place audit');
    assert.strictEqual(cleanPlace.contributor, undefined, 'contributor phải bị lọc hoàn toàn');
    assert.strictEqual(cleanPlace.note, undefined, 'note phải bị lọc hoàn toàn');
    assert.strictEqual(cleanPlace.address, undefined, 'address phải bị lọc hoàn toàn');
    assert.strictEqual(cleanPlace.description, undefined, 'description phải bị lọc hoàn toàn');

    // 31.2 Kiểm tra allowlist comment: loại bỏ author_name, comment_text, photo_url, photo_metadata
    const dirtyComment = {
      id: 10,
      place_id: 'ao-ba-om',
      place_name: 'Ao Bà Om',
      author_name: 'Nguyen Van A',
      comment_text: 'Bình luận chứa thông tin cá nhân',
      photo_url: 'https://cdn.example.com/photos/user.jpg',
      photo_metadata: { ip: '10.0.0.1' },
      rating: 5,
      is_hidden: false,
      status: 'approved'
    };
    const cleanComment = sanitizeAuditPayload(dirtyComment, 'comment');
    assert.strictEqual(cleanComment.id, 10);
    assert.strictEqual(cleanComment.status, 'approved');
    assert.strictEqual(cleanComment.is_hidden, false);
    assert.strictEqual(cleanComment.author_name, undefined, 'author_name phải bị loại bỏ');
    assert.strictEqual(cleanComment.comment_text, undefined, 'comment_text phải bị loại bỏ');
    assert.strictEqual(cleanComment.photo_url, undefined, 'photo_url phải bị loại bỏ');
    assert.strictEqual(cleanComment.photo_metadata, undefined, 'photo_metadata phải bị loại bỏ');

    // 31.3 Kiểm tra allowlist report: loại bỏ reporter_contact, details, ip
    const dirtyReport = {
      id: 'rep-001',
      place_id: 'ao-ba-om',
      place_name: 'Ao Bà Om',
      issue_type: 'wrong_hours',
      status: 'reviewed',
      details: 'Nội dung phản ánh chi tiết',
      reporter_contact: '0987654321',
      ip: '192.168.1.1',
      admin_notes: 'Ghi chú quản trị'
    };
    const cleanReport = sanitizeAuditPayload(dirtyReport, 'report');
    assert.strictEqual(cleanReport.id, 'rep-001');
    assert.strictEqual(cleanReport.status, 'reviewed');
    assert.strictEqual(cleanReport.admin_notes, 'Ghi chú quản trị');
    assert.strictEqual(cleanReport.details, undefined, 'details phải bị loại bỏ');
    assert.strictEqual(cleanReport.reporter_contact, undefined, 'reporter_contact phải bị loại bỏ');
    assert.strictEqual(cleanReport.ip, undefined, 'ip phải bị loại bỏ');

    // 31.4 Khử dữ liệu nhạy cảm lồng nhau (JWT, token, password, email, ip)
    const nestedData = {
      token: 'secret-token-value',
      user: {
        password: 'nested-password',
        jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
        raw_info: 'Liên hệ: test@domain.vn và IP 192.168.1.100'
      }
    };
    const cleanNested = sanitizeAuditPayload(nestedData);
    assert.strictEqual(cleanNested.token, undefined);
    assert.strictEqual(cleanNested.user.password, undefined);
    assert.strictEqual(cleanNested.user.jwt, '[REDACTED_JWT]');
    assert.ok(cleanNested.user.raw_info.includes('[REDACTED_EMAIL]'));
    assert.ok(cleanNested.user.raw_info.includes('[REDACTED_IP]'));
  });

  // 32. Ưu tiên Soft-delete / Archived: DELETE địa điểm mặc định lưu trữ (archived), chỉ xóa cứng khi permanent=true
  await runAsyncTest('32. Ưu tiên Soft-delete / Archived: DELETE mặc định archived, chỉ xóa cứng khi permanent=true', async () => {
    // 32.1 Mặc định: soft-delete
    const { req: sReq, res: sRes } = createMockReqRes({
      method: 'DELETE',
      url: '/api/admin-places?id=2',
      ip: '10.0.0.32',
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await placesHandler(sReq, sRes);
    assert.strictEqual(sRes.getStatus(), 200);
    assert.strictEqual(sRes.getBody().archived, true);
    assert.strictEqual(sRes.getBody().deleted, undefined);

    // 32.2 Khi truyền permanent=true: xóa cứng
    const { req: pReq, res: pRes } = createMockReqRes({
      method: 'DELETE',
      url: '/api/admin-places?id=99&permanent=true',
      ip: '10.0.0.32',
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await placesHandler(pReq, pRes);
    assert.strictEqual(pRes.getStatus(), 200);
    assert.strictEqual(pRes.getBody().deleted, true);
  });

  // 33. Pagination server-side trên places và comments trả về cấu trúc pagination ổn định
  await runAsyncTest('33. Pagination server-side trên places và comments trả về pagination ổn định', async () => {
    // 33.1 Places pagination
    const { req: pReq, res: pRes } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-places?page=2&limit=5',
      ip: '10.0.0.33',
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await placesHandler(pReq, pRes);
    assert.strictEqual(pRes.getStatus(), 200);
    const pBody = pRes.getBody();
    assert.ok(pBody.pagination);
    assert.strictEqual(pBody.pagination.page, 2);
    assert.strictEqual(pBody.pagination.limit, 5);

    // 33.2 Comments pagination
    const { req: cReq, res: cRes } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-comments?page=1&limit=20',
      ip: '10.0.0.33',
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await commentsHandler(cReq, cRes);
    assert.strictEqual(cRes.getStatus(), 200);
    const cBody = cRes.getBody();
    assert.ok(cBody.pagination);
    assert.strictEqual(cBody.pagination.page, 1);
    assert.strictEqual(cBody.pagination.limit, 20);
  });

  // 34. Fail-closed: admin-reports từ chối khi không có token (401), token giả (401), hoặc unlisted user (403)
  await runAsyncTest('34. Fail-closed: admin-reports từ chối khi không có token (401), token giả (401), unlisted (403)', async () => {
    // 34.1 Không có token -> 401
    const { req: req1, res: res1 } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-reports',
      ip: '10.0.0.34'
    });
    await reportsHandler(req1, res1);
    assert.strictEqual(res1.getStatus(), 401);

    // 34.2 Token giả -> 401
    const { req: req2, res: res2 } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-reports',
      ip: '10.0.0.34',
      headers: { Authorization: 'Bearer mock-invalid-token' }
    });
    await reportsHandler(req2, res2);
    assert.strictEqual(res2.getStatus(), 401);

    // 34.3 Unlisted user -> 403
    const { req: req3, res: res3 } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-reports',
      ip: '10.0.0.34',
      headers: { Authorization: 'Bearer mock-unlisted-token' }
    });
    await reportsHandler(req3, res3);
    assert.strictEqual(res3.getStatus(), 403);
  });

  // 35. Validate x-correlation-id: giới hạn độ dài <= 128, ký tự hợp lệ, thay thế ID lỗi và trả header
  await runAsyncTest('35. Validate x-correlation-id: kiểm tra định dạng, độ dài <= 128, thay thế chuỗi sai và đính kèm header', async () => {
    // 35.1 Correlation ID hợp lệ [A-Za-z0-9._:-]
    const validCid = 'corr-req.123_abc:999-XYZ';
    assert.strictEqual(validateCorrelationId(validCid), validCid);

    // 35.2 Quá dài (> 128 ký tự) -> phải bị null/thay thế
    const tooLongCid = 'a'.repeat(129);
    assert.strictEqual(validateCorrelationId(tooLongCid), null);

    // 35.3 Ký tự xuống dòng hoặc ký tự không hợp lệ -> phải bị null/thay thế
    assert.strictEqual(validateCorrelationId('corr\ninvalid'), null);
    assert.strictEqual(validateCorrelationId('corr with spaces'), null);
    assert.strictEqual(validateCorrelationId('corr<script>alert(1)</script>'), null);

    // 35.4 Gửi request với correlation ID hợp lệ -> Header trả về giữ nguyên ID
    const { req: rValid, res: resValid } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-profile',
      ip: '10.0.0.35',
      headers: {
        Authorization: 'Bearer mock-admin-token',
        'x-correlation-id': validCid
      }
    });
    await profileHandler(rValid, resValid);
    assert.strictEqual(resValid.getHeader('x-correlation-id'), validCid);

    // 35.5 Gửi request với correlation ID sai (chứa ký tự lạ) -> Tự động sinh ID mới dạng corr-*
    const { req: rBad, res: resBad } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-profile',
      ip: '10.0.0.35',
      headers: {
        Authorization: 'Bearer mock-admin-token',
        'x-correlation-id': 'bad\ncorrelation\nid'
      }
    });
    await profileHandler(rBad, resBad);
    const returnedCid = resBad.getHeader('x-correlation-id');
    assert.ok(returnedCid && returnedCid.startsWith('corr-'), 'Phải tự sinh ID mới an toàn');
    assert.ok(!returnedCid.includes('\n'), 'ID không được chứa ký tự xuống dòng');
  });

  // 36. Khôi phục readBody hỗ trợ object, string, Buffer, stream và xử lý lỗi cú pháp JSON
  await runAsyncTest('36. Khôi phục readBody hỗ trợ object, string, Buffer, stream và kiểm tra lỗi cú pháp', async () => {
    // 36.1 Object
    const objRes = await readBody({ body: { hello: 'world' } });
    assert.strictEqual(objRes.hello, 'world');

    // 36.2 JSON string trong body
    const strRes = await readBody({ body: JSON.stringify({ testStr: 123 }) });
    assert.strictEqual(strRes.testStr, 123);

    // 36.3 Buffer trong body
    const bufRes = await readBody({ body: Buffer.from(JSON.stringify({ testBuf: true })) });
    assert.strictEqual(bufRes.testBuf, true);

    // 36.4 Direct string request
    const directStr = await readBody('{"direct":999}');
    assert.strictEqual(directStr.direct, 999);

    // 36.5 Direct Buffer request
    const directBuf = await readBody(Buffer.from('{"bufDirect":true}'));
    assert.strictEqual(directBuf.bufDirect, true);

    // 36.6 Stream request
    const streamReq = {
      async *[Symbol.asyncIterator]() {
        yield Buffer.from('{"stream":');
        yield Buffer.from('"success"}');
      }
    };
    const streamRes = await readBody(streamReq);
    assert.strictEqual(streamRes.stream, 'success');

    // 36.7 JSON lỗi trong string -> ném INVALID_JSON
    await assert.rejects(async () => {
      await readBody('{"invalid_json":');
    }, /INVALID_JSON/);

    // 36.8 JSON lỗi trong Buffer -> ném INVALID_JSON
    await assert.rejects(async () => {
      await readBody(Buffer.from('{bad:json}'));
    }, /INVALID_JSON/);

    // 36.9 Vượt quá payload limit -> ném PAYLOAD_TOO_LARGE
    await assert.rejects(async () => {
      await readBody('x'.repeat(200), 100);
    }, /PAYLOAD_TOO_LARGE/);
  });

  // 37. PATCH và DELETE ID không tồn tại phải trả 404 và không ghi audit giả
  await runAsyncTest('37. PATCH và DELETE ID không tồn tại phải trả 404 và không ghi audit log', async () => {
    const initialAuditCount = mockAuditLogs.length;

    // 37.1 PATCH place non-existent ID
    const { req: pPatchReq, res: pPatchRes } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-places',
      ip: '10.0.0.37',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: { id: 999999, name: 'Dia diem khong ton tai' }
    });
    await placesHandler(pPatchReq, pPatchRes);
    assert.strictEqual(pPatchRes.getStatus(), 404);
    assert.strictEqual(pPatchRes.getBody().error?.code, 'NOT_FOUND');

    // 37.2 DELETE place non-existent ID
    const { req: pDelReq, res: pDelRes } = createMockReqRes({
      method: 'DELETE',
      url: '/api/admin-places?id=999999',
      ip: '10.0.0.37',
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await placesHandler(pDelReq, pDelRes);
    assert.strictEqual(pDelRes.getStatus(), 404);
    assert.strictEqual(pDelRes.getBody().error?.code, 'NOT_FOUND');

    // 37.3 PATCH comment non-existent ID
    const { req: cPatchReq, res: cPatchRes } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-comments',
      ip: '10.0.0.37',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: { id: 999999, is_hidden: true }
    });
    await commentsHandler(cPatchReq, cPatchRes);
    assert.strictEqual(cPatchRes.getStatus(), 404);
    assert.strictEqual(cPatchRes.getBody().error?.code, 'NOT_FOUND');

    // 37.4 DELETE comment non-existent ID
    const { req: cDelReq, res: cDelRes } = createMockReqRes({
      method: 'DELETE',
      url: '/api/admin-comments?id=999999',
      ip: '10.0.0.37',
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await commentsHandler(cDelReq, cDelRes);
    assert.strictEqual(cDelRes.getStatus(), 404);
    assert.strictEqual(cDelRes.getBody().error?.code, 'NOT_FOUND');

    // 37.5 PATCH report non-existent UUID -> gọi RPC và trả 404 NOT_FOUND
    const { req: rPatchReq, res: rPatchRes } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-reports',
      ip: '10.0.0.37',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: { id: '99999999-9999-9999-9999-999999999999', status: 'reviewed' }
    });
    await reportsHandler(rPatchReq, rPatchRes);
    assert.strictEqual(rPatchRes.getStatus(), 404);
    assert.strictEqual(rPatchRes.getBody().error?.code, 'NOT_FOUND');

    // 37.6 PATCH report chuỗi ID không phải UUID -> 404 NOT_FOUND
    const { req: rInvReq, res: rInvRes } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-reports',
      ip: '10.0.0.37',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: { id: 'rep-non-existent-uuid', status: 'reviewed' }
    });
    await reportsHandler(rInvReq, rInvRes);
    assert.strictEqual(rInvRes.getStatus(), 404);
    assert.strictEqual(rInvRes.getBody().error?.code, 'NOT_FOUND');

    // Tuyệt đối không ghi audit log cho các ID không tồn tại
    assert.strictEqual(mockAuditLogs.length, initialAuditCount, 'Không được sinh ra bất kỳ audit log giả nào');
  });

  // 38. Nguyên tử hóa Mutation & Rollback khi ghi Audit Log thất bại (ép lỗi storage)
  await runAsyncTest('38. Nguyên tử hóa Mutation: Khi audit log lỗi trong transaction, trả 500 và không lưu mutation', async () => {
    // Kích hoạt cờ ép lỗi lưu trữ audit log
    mockAuditLogShouldFail = true;

    try {
      // 38.1 Cập nhật địa điểm khi audit log lỗi -> Trả 500 AUDIT_LOG_FAILED & Rollback dữ liệu
      const originalPlaceRating = mockPlaces.find(p => p.id === 1).rating;
      const { req: pReq, res: pRes } = createMockReqRes({
        method: 'PATCH',
        url: '/api/admin-places',
        ip: '10.0.0.38',
        headers: { Authorization: 'Bearer mock-admin-token' },
        body: { id: 1, rating: 1.0 }
      });
      await placesHandler(pReq, pRes);
      assert.strictEqual(pRes.getStatus(), 500, 'Phải trả HTTP 500 khi audit log lỗi');
      assert.strictEqual(pRes.getBody().error?.code, 'AUDIT_LOG_FAILED');
      // Xác minh DB mock đã được hoàn tác về giá trị gốc (transaction rollback)
      const currentPlaceRating = mockPlaces.find(p => p.id === 1).rating;
      assert.strictEqual(currentPlaceRating, originalPlaceRating, 'Địa điểm phải giữ nguyên rating ban đầu do transaction rollback');

      // 38.2 Cập nhật bình luận khi audit log lỗi -> Trả 500 AUDIT_LOG_FAILED & Rollback
      const originalCommentHidden = mockComments.find(c => c.id === 30).is_hidden;
      const { req: cReq, res: cRes } = createMockReqRes({
        method: 'PATCH',
        url: '/api/admin-comments',
        ip: '10.0.0.38',
        headers: { Authorization: 'Bearer mock-admin-token' },
        body: { id: 30, is_hidden: true }
      });
      await commentsHandler(cReq, cRes);
      assert.strictEqual(cRes.getStatus(), 500);
      assert.strictEqual(cRes.getBody().error?.code, 'AUDIT_LOG_FAILED');
      const currentCommentHidden = mockComments.find(c => c.id === 30).is_hidden;
      assert.strictEqual(currentCommentHidden, originalCommentHidden, 'Bình luận phải giữ nguyên trạng thái is_hidden ban đầu');

      // 38.3 Xử lý báo cáo khi audit log lỗi -> Trả 500 AUDIT_LOG_FAILED & Rollback
      const targetReportId = '11111111-1111-1111-1111-000000000001';
      const originalReportStatus = mockReports.find(r => r.id === targetReportId).status;
      const { req: rReq, res: rRes } = createMockReqRes({
        method: 'PATCH',
        url: '/api/admin-reports',
        ip: '10.0.0.38',
        headers: { Authorization: 'Bearer mock-admin-token' },
        body: { id: targetReportId, status: 'resolved' }
      });
      await reportsHandler(rReq, rRes);
      assert.strictEqual(rRes.getStatus(), 500);
      assert.strictEqual(rRes.getBody().error?.code, 'AUDIT_LOG_FAILED');
      const currentReportStatus = mockReports.find(r => r.id === targetReportId).status;
      assert.strictEqual(currentReportStatus, originalReportStatus, 'Báo cáo phải giữ nguyên trạng thái ban đầu do rollback');

      // 38.4 Tạo địa điểm khi audit log lỗi -> Trả 500 & Không tạo bản ghi
      const placeCountBefore = mockPlaces.length;
      const { req: cpReq, res: cpRes } = createMockReqRes({
        method: 'POST',
        url: '/api/admin-places',
        ip: '10.0.0.38',
        headers: { Authorization: 'Bearer mock-admin-token' },
        body: { name: 'Điểm du lịch hỏng audit', category: 'attraction' }
      });
      await placesHandler(cpReq, cpRes);
      assert.strictEqual(cpRes.getStatus(), 500);
      assert.strictEqual(cpRes.getBody().error?.code, 'AUDIT_LOG_FAILED');
      assert.strictEqual(mockPlaces.length, placeCountBefore, 'Bản ghi không được tạo trong DB khi audit log lỗi');

    } finally {
      // Tắt cờ lỗi giả lập
      mockAuditLogShouldFail = false;
    }
  });

  // 39. Kiểm tra Database Transaction Atomicity: API bắt buộc gọi /rest/v1/rpc/*, cấm REST direct mutation và compensating rollback
  await runAsyncTest('39. Kiểm tra Database Transaction Atomicity: API bắt buộc gọi /rest/v1/rpc/*, cấm REST direct mutation và compensating rollback', async () => {
    // Xóa lịch sử request đã ghi nhận
    mockRecordedRequests.length = 0;

    // 39.1 POST create place qua RPC
    const { req: pPostReq, res: pPostRes } = createMockReqRes({
      method: 'POST',
      url: '/api/admin-places',
      ip: '10.0.0.39',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: { name: 'Chùa Hang Atomic Test', category: 'attraction' }
    });
    await placesHandler(pPostReq, pPostRes);
    assert.strictEqual(pPostRes.getStatus(), 201);
    const createdPlaceId = pPostRes.getBody().place?.id || pPostRes.getBody().id;

    // 39.2 PATCH update place qua RPC
    const { req: pPatchReq, res: pPatchRes } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-places',
      ip: '10.0.0.39',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: { id: createdPlaceId, name: 'Chùa Hang Atomic Test Đã Cập Nhật' }
    });
    await placesHandler(pPatchReq, pPatchRes);
    assert.strictEqual(pPatchRes.getStatus(), 200);

    // 39.3 DELETE archive place qua RPC
    const { req: pDelReq, res: pDelRes } = createMockReqRes({
      method: 'DELETE',
      url: `/api/admin-places?id=${createdPlaceId}`,
      ip: '10.0.0.39',
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await placesHandler(pDelReq, pDelRes);
    assert.strictEqual(pDelRes.getStatus(), 200);

    // 39.4 Chuẩn bị comment mẫu cho RPC test
    mockComments.push({
      id: 99,
      place_id: 'ao-ba-om',
      place_name: 'Ao Bà Om',
      author_name: 'Test RPC User',
      comment_text: 'Test rpc comment',
      rating: 5,
      is_hidden: false,
      status: 'pending',
      created_at: new Date().toISOString()
    });

    // PATCH update comment qua RPC
    const { req: cPatchReq, res: cPatchRes } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-comments',
      ip: '10.0.0.39',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: { id: 99, status: 'approved' }
    });
    await commentsHandler(cPatchReq, cPatchRes);
    assert.strictEqual(cPatchRes.getStatus(), 200);

    // 39.5 DELETE comment qua RPC
    const { req: cDelReq, res: cDelRes } = createMockReqRes({
      method: 'DELETE',
      url: '/api/admin-comments?id=99',
      ip: '10.0.0.39',
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await commentsHandler(cDelReq, cDelRes);
    assert.strictEqual(cDelRes.getStatus(), 200);

    // 39.6 PATCH update report qua RPC
    const { req: rPatchReq, res: rPatchRes } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-reports',
      ip: '10.0.0.39',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: { id: '11111111-1111-1111-1111-000000000001', status: 'reviewed', admin_notes: 'RPC verification test' }
    });
    await reportsHandler(rPatchReq, rPatchRes);
    assert.strictEqual(rPatchRes.getStatus(), 200);

    // Kiểm tra danh sách các request đã gửi tới mock Supabase server
    const rpcCalls = mockRecordedRequests.filter(r => r.pathname.startsWith('/rest/v1/rpc/'));
    assert.strictEqual(rpcCalls.length, 6, 'Tất cả 6 mutation phải gọi trực tiếp qua RPC transaction');

    const expectedRpcs = [
      'admin_create_place_atomic',
      'admin_update_place_atomic',
      'admin_delete_place_atomic',
      'admin_update_comment_atomic',
      'admin_delete_comment_atomic',
      'admin_update_report_atomic'
    ];
    for (const expRpc of expectedRpcs) {
      assert.ok(
        rpcCalls.some(r => r.pathname === `/rest/v1/rpc/${expRpc}`),
        `Bắt buộc phải gọi RPC: /rest/v1/rpc/${expRpc}`
      );
    }

    // Tuyệt đối không có direct REST mutation (PATCH, DELETE, POST) vào các bảng dữ liệu
    const directRestMutations = mockRecordedRequests.filter(r => {
      const isMutationMethod = ['PATCH', 'DELETE', 'POST'].includes(r.method);
      const isDirectTable = r.pathname.startsWith('/rest/v1/places') ||
                            r.pathname.startsWith('/rest/v1/place_comments') ||
                            r.pathname.startsWith('/rest/v1/place_reports') ||
                            r.pathname.startsWith('/rest/v1/admin_audit_logs');
      return isMutationMethod && isDirectTable && !r.pathname.startsWith('/rest/v1/rpc/');
    });
    assert.strictEqual(
      directRestMutations.length,
      0,
      'Tuyệt đối không được gửi direct REST mutation hoặc insert audit log riêng rẽ ngoài transaction RPC'
    );
  });

  // 40. API fail-closed khi Supabase/Auth không khả dụng
  await runAsyncTest('40. API fail-closed khi Supabase/Auth không khả dụng (mạng đứt, 503, DB error, config lỗi)', async () => {
    // 40.1 Mạng gián đoạn hoặc socket đóng bất ngờ khi gọi /auth/v1/user -> Trả 503 AUTH_UNAVAILABLE
    mockAuthDropConnection = true;
    try {
      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/api/admin-profile',
        ip: '10.0.0.40',
        headers: { Authorization: 'Bearer real-jwt-admin' }
      });
      await profileHandler(req, res);
      assert.strictEqual(res.getStatus(), 503, 'Phải trả HTTP 503 khi kết nối Supabase Auth bị gián đoạn');
      assert.strictEqual(res.getBody().error?.code, 'AUTH_UNAVAILABLE');
    } finally {
      mockAuthDropConnection = false;
    }

    // 40.2 Supabase Auth trả lỗi 503 Service Unavailable -> Trả 401 UNAUTHENTICATED
    mockAuthStatus503 = true;
    try {
      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/api/admin-places',
        ip: '10.0.0.40',
        headers: { Authorization: 'Bearer real-jwt-admin' }
      });
      await placesHandler(req, res);
      assert.strictEqual(res.getStatus(), 401, 'Phải từ chối 401 khi Supabase Auth không xác thực được JWT');
      assert.strictEqual(res.getBody().error?.code, 'UNAUTHENTICATED');
    } finally {
      mockAuthStatus503 = false;
    }

    // 40.3 Supabase DB bảng admin_users trả lỗi 500 -> Trả 500 DATABASE_ERROR
    mockAdminUsers500 = true;
    try {
      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/api/admin-profile',
        ip: '10.0.0.40',
        headers: { Authorization: 'Bearer real-jwt-admin' }
      });
      await profileHandler(req, res);
      assert.strictEqual(res.getStatus(), 500, 'Phải trả HTTP 500 khi DB admin_users lỗi');
      assert.strictEqual(res.getBody().error?.code, 'DATABASE_ERROR');
    } finally {
      mockAdminUsers500 = false;
    }

    // 40.4 Thiếu cấu hình SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY -> Trả 500 CONFIG_ERROR
    const origUrl = process.env.SUPABASE_URL;
    try {
      delete process.env.SUPABASE_URL;
      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/api/admin-profile',
        ip: '10.0.0.40',
        headers: { Authorization: 'Bearer real-jwt-admin' }
      });
      await profileHandler(req, res);
      assert.strictEqual(res.getStatus(), 500, 'Phải trả 500 khi thiếu cấu hình Supabase');
      assert.strictEqual(res.getBody().error?.code, 'CONFIG_ERROR');
    } finally {
      process.env.SUPABASE_URL = origUrl;
    }
  });

  // 41. Audit log được tạo đúng một lần cho mỗi mutation
  await runAsyncTest('41. Audit log được tạo đúng một lần cho mỗi mutation (không thiếu, không duplicate)', async () => {
    const baselineAuditCount = mockAuditLogs.length;

    // 41.1 Create place -> +1 log (place.create)
    const { req: p1Req, res: p1Res } = createMockReqRes({
      method: 'POST',
      url: '/api/admin-places',
      ip: '10.0.0.41',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: { name: 'Điểm Test Audit Đúng 1 Lần', slug: 'diem-test-audit-1-lan', category: 'attraction' }
    });
    await placesHandler(p1Req, p1Res);
    assert.strictEqual(p1Res.getStatus(), 201);
    assert.strictEqual(mockAuditLogs.length, baselineAuditCount + 1, 'Create place phải tạo đúng 1 audit log');
    assert.strictEqual(mockAuditLogs[mockAuditLogs.length - 1].action, 'place.create');

    const createdPlaceId = p1Res.getBody().place?.id || p1Res.getBody().id;

    // 41.2 Update place -> +1 log (place.update)
    const { req: p2Req, res: p2Res } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-places',
      ip: '10.0.0.41',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: { id: createdPlaceId, name: 'Điểm Test Audit Đã Sửa' }
    });
    await placesHandler(p2Req, p2Res);
    assert.strictEqual(p2Res.getStatus(), 200);
    assert.strictEqual(mockAuditLogs.length, baselineAuditCount + 2, 'Update place phải tạo đúng 1 audit log');
    assert.strictEqual(mockAuditLogs[mockAuditLogs.length - 1].action, 'place.update');

    // 41.3 Archive place -> +1 log (place.archive)
    const { req: p3Req, res: p3Res } = createMockReqRes({
      method: 'DELETE',
      url: `/api/admin-places?id=${createdPlaceId}`,
      ip: '10.0.0.41',
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await placesHandler(p3Req, p3Res);
    assert.strictEqual(p3Res.getStatus(), 200);
    assert.strictEqual(mockAuditLogs.length, baselineAuditCount + 3, 'Archive place phải tạo đúng 1 audit log');
    assert.strictEqual(mockAuditLogs[mockAuditLogs.length - 1].action, 'place.archive');

    // 41.4 Permanent delete place -> +1 log (place.delete_permanent)
    const { req: p4Req, res: p4Res } = createMockReqRes({
      method: 'DELETE',
      url: `/api/admin-places?id=${createdPlaceId}&permanent=true`,
      ip: '10.0.0.41',
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await placesHandler(p4Req, p4Res);
    assert.strictEqual(p4Res.getStatus(), 200);
    assert.strictEqual(mockAuditLogs.length, baselineAuditCount + 4, 'Permanent delete place phải tạo đúng 1 audit log');
    assert.strictEqual(mockAuditLogs[mockAuditLogs.length - 1].action, 'place.delete');

    // 41.5 Moderate comment -> +1 log (comment.moderate)
    mockComments.push({
      id: 777,
      place_id: 'ao-ba-om',
      place_name: 'Ao Bà Om',
      author_name: 'Audit Once User',
      comment_text: 'Bình luận test audit',
      rating: 5,
      is_hidden: false,
      status: 'pending',
      created_at: new Date().toISOString()
    });

    const { req: c1Req, res: c1Res } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-comments',
      ip: '10.0.0.41',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: { id: 777, is_hidden: true }
    });
    await commentsHandler(c1Req, c1Res);
    assert.strictEqual(c1Res.getStatus(), 200);
    assert.strictEqual(mockAuditLogs.length, baselineAuditCount + 5, 'Moderate comment phải tạo đúng 1 audit log');
    assert.ok(['comment.hide', 'comment.moderate'].includes(mockAuditLogs[mockAuditLogs.length - 1].action));

    // 41.6 Delete comment -> +1 log (comment.delete)
    const { req: c2Req, res: c2Res } = createMockReqRes({
      method: 'DELETE',
      url: '/api/admin-comments?id=777',
      ip: '10.0.0.41',
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await commentsHandler(c2Req, c2Res);
    assert.strictEqual(c2Res.getStatus(), 200);
    assert.strictEqual(mockAuditLogs.length, baselineAuditCount + 6, 'Delete comment phải tạo đúng 1 audit log');
    assert.strictEqual(mockAuditLogs[mockAuditLogs.length - 1].action, 'comment.delete');

    // 41.7 Update report -> +1 log (report.update / report.resolved)
    const testRepId = '77777777-7777-7777-7777-000000000001';
    mockReports.push({
      id: testRepId,
      place_id: 'chua-ang',
      place_name: 'Chùa Âng',
      issue_type: 'wrong_info',
      details: 'Test audit report details',
      status: 'pending',
      created_at: new Date().toISOString()
    });

    const { req: r1Req, res: r1Res } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-reports',
      ip: '10.0.0.41',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: { id: testRepId, status: 'resolved', admin_notes: 'Đã xử lý xong' }
    });
    await reportsHandler(r1Req, r1Res);
    assert.strictEqual(r1Res.getStatus(), 200);
    assert.strictEqual(mockAuditLogs.length, baselineAuditCount + 7, 'Update report phải tạo đúng 1 audit log');
    assert.ok(['report.update', 'report.resolved'].includes(mockAuditLogs[mockAuditLogs.length - 1].action));
  });

  // 42. Kiểm toán bảo mật toàn bộ Audit Logs: Không chứa Secret, Token hay PII ngoài allowlist
  await runAsyncTest('42. Toàn bộ Audit Logs không chứa Secret, Token hoặc PII ngoài allowlist (deep inspection)', async () => {
    assert.ok(mockAuditLogs.length > 0, 'Phải có audit logs để kiểm tra');

    const BANNED_KEYS = new Set([
      'token', 'access_token', 'refresh_token', 'secret', 'password', 'api_key', 'apikey',
      'bearer', 'auth', 'authorization', 'email', 'ip', 'contact', 'reporter_contact',
      'author_name', 'comment_text', 'details', 'photo_url', 'photo_metadata'
    ]);

    function inspectObject(obj, path = '') {
      if (!obj || typeof obj !== 'object') return;

      for (const [key, val] of Object.entries(obj)) {
        const fullPath = path ? `${path}.${key}` : key;
        const lowerKey = key.toLowerCase();

        // 1. Kiểm tra tên trường không được nằm trong danh sách cấm
        assert.ok(
          !BANNED_KEYS.has(lowerKey),
          `Phát hiện trường nhạy cảm bị cấm trong audit log: "${fullPath}"`
        );

        // 2. Kiểm tra giá trị chuỗi không chứa token hoặc thông tin nhạy cảm
        if (typeof val === 'string') {
          assert.ok(!val.toLowerCase().startsWith('bearer '), `Giá trị chứa Bearer token tại "${fullPath}"`);
          assert.ok(!val.includes('@vivutravinh'), `Giá trị chứa email nội bộ tại "${fullPath}"`);
          assert.ok(!val.startsWith('eyJ'), `Giá trị chứa JWT base64 header tại "${fullPath}"`);
        }

        if (typeof val === 'object' && val !== null) {
          inspectObject(val, fullPath);
        }
      }
    }

    for (const log of mockAuditLogs) {
      // Kiểm tra cấu trúc bản ghi audit log
      assert.ok(log.action, 'Audit log phải có action');
      assert.ok(log.entity_type, 'Audit log phải có entity_type');

      // Kiểm tra allowlist chặt chẽ của payload_before và payload_after
      const allowedKeys = new Set(AUDIT_ALLOWLIST[log.entity_type] || []);

      if (log.payload_before && typeof log.payload_before === 'object') {
        inspectObject(log.payload_before, `log[${log.action}].payload_before`);
        for (const k of Object.keys(log.payload_before)) {
          assert.ok(
            allowedKeys.has(k) || k === 'action' || k === 'id',
            `Trường "${k}" trong payload_before không nằm trong allowlist của ${log.entity_type}`
          );
        }
      }

      if (log.payload_after && typeof log.payload_after === 'object') {
        inspectObject(log.payload_after, `log[${log.action}].payload_after`);
        for (const k of Object.keys(log.payload_after)) {
          assert.ok(
            allowedKeys.has(k) || k === 'action' || k === 'id',
            `Trường "${k}" trong payload_after không nằm trong allowlist của ${log.entity_type}`
          );
        }
      }
    }
  });

  // 43. Chống Mass Assignment trên places và comments
  await runAsyncTest('43. Chống Mass Assignment trên places và comments: Loại bỏ triệt để các trường cấm', async () => {
    // 43.1 PATCH place: Gửi các trường nguy hiểm nhằm leo quyền hoặc sửa trường hệ thống
    const { req: pReq, res: pRes } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-places',
      ip: '10.0.0.43',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: {
        id: 1,
        name: 'Ao Bà Om Cập Nhật An Toàn',
        is_admin: true,
        role: 'superadmin',
        audit_logs: 'fake_audit',
        created_at: '2000-01-01T00:00:00Z',
        custom_dangerous_prop: 'injected'
      }
    });
    await placesHandler(pReq, pRes);
    assert.strictEqual(pRes.getStatus(), 200);

    const placeInDb = mockPlaces.find(p => p.id === 1);
    assert.strictEqual(placeInDb.name, 'Ao Bà Om Cập Nhật An Toàn');
    assert.strictEqual(placeInDb.is_admin, undefined, 'Không được phép thêm trường is_admin vào địa điểm');
    assert.strictEqual(placeInDb.role, undefined, 'Không được phép thêm trường role vào địa điểm');
    assert.strictEqual(placeInDb.audit_logs, undefined, 'Không được phép ghi đè audit_logs');
    assert.notStrictEqual(placeInDb.created_at, '2000-01-01T00:00:00Z', 'created_at không được phép bị ghi đè');

    // 43.2 PATCH comment: Cố tình ghi đè author_name, comment_text hoặc id
    const targetComment = mockComments.find(c => c.id === 30);
    const originalAuthor = targetComment.author_name;
    const originalText = targetComment.comment_text;

    const { req: cReq, res: cRes } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-comments',
      ip: '10.0.0.43',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: {
        id: 30,
        is_hidden: false,
        author_name: 'Hacked Author Name',
        comment_text: 'Hacked Injected Comment Text',
        role: 'admin',
        is_admin: true
      }
    });
    await commentsHandler(cReq, cRes);
    assert.strictEqual(cRes.getStatus(), 200);

    const updatedCommentInDb = mockComments.find(c => c.id === 30);
    assert.strictEqual(updatedCommentInDb.author_name, originalAuthor, 'author_name không được phép bị thay đổi');
    assert.strictEqual(updatedCommentInDb.comment_text, originalText, 'comment_text không được phép bị thay đổi');
    assert.strictEqual(updatedCommentInDb.role, undefined);
  });

  // 44. Giới hạn kích thước payload (HTTP 413) trên places và comments
  await runAsyncTest('44. Chặn dứt khoát payload vượt kích thước tối đa với HTTP 413 PAYLOAD_TOO_LARGE', async () => {
    // 44.1 admin-places: Payload > 2MB
    const hugePlacePayload = {
      name: 'Điểm du lịch payload khổng lồ',
      category: 'attraction',
      description: 'X'.repeat(2.1 * 1024 * 1024)
    };
    const { req: pReq, res: pRes } = createMockReqRes({
      method: 'POST',
      url: '/api/admin-places',
      ip: '10.0.0.44',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: hugePlacePayload
    });
    await placesHandler(pReq, pRes);
    assert.strictEqual(pRes.getStatus(), 413, 'Phải trả HTTP 413 khi payload place > 2MB');
    assert.strictEqual(pRes.getBody().error?.code, 'PAYLOAD_TOO_LARGE');

    // 44.2 admin-comments: Payload > 1MB
    const hugeCommentPayload = {
      id: 30,
      is_hidden: true,
      extra_junk: 'Y'.repeat(1.2 * 1024 * 1024)
    };
    const { req: cReq, res: cRes } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-comments',
      ip: '10.0.0.44',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: hugeCommentPayload
    });
    await commentsHandler(cReq, cRes);
    assert.strictEqual(cRes.getStatus(), 413, 'Phải trả HTTP 413 khi payload comment > 1MB');
    assert.strictEqual(cRes.getBody().error?.code, 'PAYLOAD_TOO_LARGE');
  });

  // 45. Xử lý an toàn dữ liệu XSS và kiểm tra ràng buộc Transition trạng thái
  await runAsyncTest('45. Xử lý an toàn dữ liệu XSS và ràng buộc chuyển đổi trạng thái (Transition Validation)', async () => {
    // 45.1 Tạo địa điểm với payload XSS phức tạp -> API xử lý bình thường, không sập server
    const xssPlaceName = '<script>alert("xss")</script><img src=x onerror=console.log(1)>';
    const { req: pXssReq, res: pXssRes } = createMockReqRes({
      method: 'POST',
      url: '/api/admin-places',
      ip: '10.0.0.45',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: {
        name: xssPlaceName,
        slug: 'diem-xss-test',
        category: 'attraction'
      }
    });
    await placesHandler(pXssReq, pXssRes);
    assert.strictEqual(pXssRes.getStatus(), 201, 'API phải tiếp nhận an toàn chuỗi XSS mà không sập');
    assert.strictEqual(pXssRes.getBody().place?.name, xssPlaceName);

    // 45.2 Cập nhật place với status không hợp lệ -> Từ chối HTTP 400
    const { req: pBadReq, res: pBadRes } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-places',
      ip: '10.0.0.45',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: { id: 1, status: 'super_approved_hack' }
    });
    await placesHandler(pBadReq, pBadRes);
    assert.strictEqual(pBadRes.getStatus(), 400);

    // 45.3 Cập nhật place với rating sai định dạng -> Từ chối HTTP 400
    const { req: pBadRatingReq, res: pBadRatingRes } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-places',
      ip: '10.0.0.45',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: { id: 1, rating: 99 }
    });
    await placesHandler(pBadRatingReq, pBadRatingRes);
    assert.strictEqual(pBadRatingRes.getStatus(), 400);

    // 45.4 Chuyển trạng thái report trái phép (ví dụ dismissed sang resolved trực tiếp) -> Từ chối 400
    // Trước tiên đưa report sang dismissed
    const repTarget = '11111111-1111-1111-1111-000000000003';
    mockReports.find(r => r.id === repTarget).status = 'dismissed';

    const { req: rBadTransReq, res: rBadTransRes } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-reports',
      ip: '10.0.0.45',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: { id: repTarget, status: 'resolved' }
    });
    await reportsHandler(rBadTransReq, rBadTransRes);
    assert.strictEqual(rBadTransRes.getStatus(), 400, 'Dismissed report không được chuyển thẳng sang resolved');
    assert.strictEqual(rBadTransRes.getBody().error?.code, 'INVALID_STATUS_TRANSITION');
  });

  // 46. Phân trang bền vững & Chuẩn hóa tham số (Pagination & Filter Stability)
  await runAsyncTest('46. Phân trang bền vững: Chuẩn hóa page/limit âm, vượt ngưỡng và tìm kiếm ổn định', async () => {
    // 46.1 admin-places: page âm và limit âm -> Chuẩn hóa về page=1, limit mặc định
    const { req: pNegReq, res: pNegRes } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-places?page=-10&limit=-5',
      ip: '10.0.0.46',
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await placesHandler(pNegReq, pNegRes);
    assert.strictEqual(pNegRes.getStatus(), 200);
    const pBody = pNegRes.getBody();
    assert.strictEqual(pBody.pagination.page, 1, 'Page âm phải chuẩn hóa về 1');
    assert.ok(pBody.pagination.limit > 0, 'Limit âm phải chuẩn hóa về giá trị mặc định');

    // 46.2 admin-places: limit quá lớn -> Giới hạn ở max limit (50)
    const { req: pMaxReq, res: pMaxRes } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-places?limit=99999',
      ip: '10.0.0.46',
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await placesHandler(pMaxReq, pMaxRes);
    assert.strictEqual(pMaxRes.getStatus(), 200);
    assert.ok(pMaxRes.getBody().pagination.limit <= 200, 'Limit quá lớn phải bị chặn ở max_limit (200)');

    // 46.3 admin-comments: page chuỗi chữ -> Chuẩn hóa về page=1
    const { req: cStrReq, res: cStrRes } = createMockReqRes({
      method: 'GET',
      url: '/api/admin-comments?page=invalid_string&limit=xyz',
      ip: '10.0.0.46',
      headers: { Authorization: 'Bearer mock-admin-token' }
    });
    await commentsHandler(cStrReq, cStrRes);
    assert.strictEqual(cStrRes.getStatus(), 200);
    assert.strictEqual(cStrRes.getBody().pagination.page, 1);
  });

  // 47. Contract Test: scripts/verify-g8-live.js tuân thủ đầy đủ chuẩn kiểm toán live
  await runAsyncTest('47. Contract Test: scripts/verify-g8-live.js tuân thủ đầy đủ chuẩn kiểm toán live', async () => {
    const liveScriptPath = path.join(__dirname, 'verify-g8-live.js');
    assert.ok(fs.existsSync(liveScriptPath), 'scripts/verify-g8-live.js bắt buộc phải tồn tại');
    const content = fs.readFileSync(liveScriptPath, 'utf8');

    // 47.1. Đúng 6 RPC trong supabase/g8_admin.sql
    const expectedRpcs = [
      'admin_create_place_atomic',
      'admin_update_place_atomic',
      'admin_delete_place_atomic',
      'admin_update_comment_atomic',
      'admin_delete_comment_atomic',
      'admin_update_report_atomic'
    ];
    for (const rpc of expectedRpcs) {
      assert.ok(content.includes(`'${rpc}'`), `scripts/verify-g8-live.js thiếu RPC bắt buộc: ${rpc}`);
    }

    // 47.2. Đúng 12 tên cột audit schema
    const expectedColumns = [
      'id',
      'actor_id',
      'actor_email',
      'actor_role',
      'action',
      'entity_type',
      'entity_id',
      'payload_before',
      'payload_after',
      'ip',
      'correlation_id',
      'created_at'
    ];
    for (const col of expectedColumns) {
      assert.ok(content.includes(`'${col}'`), `scripts/verify-g8-live.js thiếu cột audit schema: ${col}`);
    }

    // 47.3. Không log secret hoặc cắt chuỗi secret (chỉ in 'đã cấu hình' / 'chưa cấu hình')
    assert.ok(content.includes("'đã cấu hình' : 'chưa cấu hình'"), 'Chỉ được in trạng thái đã cấu hình / chưa cấu hình');
    assert.ok(!content.includes('maskSecret'), 'Không được dùng hàm maskSecret in một phần secret');
    assert.ok(!content.includes('.slice(0, 4)'), 'Không được in một phần substring của secret');
    assert.ok(!content.includes('SUPABASE_SERVICE_ROLE_KEY.slice') && !content.includes('ADMIN_ACCESS_TOKEN.slice'), 'Không được cắt chuỗi secret/token bằng slice');
    assert.ok(!content.includes('SUPABASE_SERVICE_ROLE_KEY.substring') && !content.includes('ADMIN_ACCESS_TOKEN.substring'), 'Không được cắt chuỗi secret/token bằng substring');
    assert.ok(!content.includes('console.log(process.env.SUPABASE_SERVICE_ROLE_KEY)'));
    assert.ok(!content.includes('console.log(process.env.ADMIN_ACCESS_TOKEN)'));

    // 47.4. Không gọi process.exit() bên trong khối try/finally (toàn bộ code dùng process.exitCode)
    const codeWithoutComments = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
    assert.ok(!codeWithoutComments.includes('process.exit('), 'Tuyệt đối không gọi process.exit() trong scripts/verify-g8-live.js');
    assert.ok(content.includes('process.exitCode ='), 'Phải thiết lập process.exitCode sau khi cleanup hoàn tất');

    // 47.5. Cleanup có xác minh 0 dòng
    assert.ok(content.includes('rows.length !== 0'), 'Cleanup phải kiểm tra và xác nhận 0 dòng còn lại');
    assert.ok(content.includes('cleanupFailed = true'), 'Cleanup thất bại phải đánh dấu cleanupFailed');
    assert.ok(content.includes('0 dòng còn lại') || content.includes('0 bản ghi'), 'Cleanup phải có thông báo xác nhận 0 dòng');

    // 47.6. Contract response: profData.user và body.place?.id
    assert.ok(content.includes('profData.user'), 'scripts/verify-g8-live.js phải lấy profile từ profData.user');
    assert.ok(content.includes('body.place?.id') || content.includes('body.place.id'), 'scripts/verify-g8-live.js phải lấy createdPlaceId từ body.place?.id');

    // 47.7. Yêu cầu role === "admin"
    assert.ok(content.includes("adminProfile.role !== 'admin'"), 'scripts/verify-g8-live.js phải bắt buộc role === "admin"');

    // 47.8. RPC probe có đầy đủ tham số và role probe "__migration_probe__"
    assert.ok(content.includes("'__migration_probe__'"), 'scripts/verify-g8-live.js phải probe RPC bằng role __migration_probe__');
    assert.ok(content.includes('RPC_PROBES'), 'scripts/verify-g8-live.js phải khai báo cấu trúc tham số RPC_PROBES');
    for (const rpc of expectedRpcs) {
      assert.ok(content.includes(`${rpc}:`), `RPC_PROBES phải chứa cấu hình tham số cho ${rpc}`);
    }

    // 47.9. Audit count theo action/entity (fail nếu duplicate hoặc thiếu)
    assert.ok(content.includes('l.action === expected.action') && content.includes('l.entity_id'), 'Audit verification phải đối soát chính xác theo action và entity_id');
    assert.ok(content.includes('matches.length > 1'), 'Audit verification phải phát hiện và fail khi có duplicate log');
    assert.ok(content.includes('matches.length === 0'), 'Audit verification phải phát hiện và fail khi thiếu log');
    assert.ok(content.includes('logs.length !== expectedMutations.length'), 'Audit verification phải kiểm tra tổng số log khớp số mutation');

    // 47.10. Cleanup dự phòng theo prefix / slug / correlation_id
    assert.ok(content.includes('Fallback Cleanup') || content.includes('cleanup dự phòng'), 'Phải có bước cleanup dự phòng');
    assert.ok(content.includes('testPlaceSlug') && content.includes('testClientReviewId') && content.includes('testClientReportId') && content.includes('testCorrelationId'), 'Cleanup dự phòng phải bao gồm slug, client_review_id, client_report_id và correlation_id');

    // 47.11. Bắt buộc expected action place.archive và cấm chuỗi place.update_status
    assert.ok(content.includes("'place.archive'"), 'verify-g8-live.js phải dùng action place.archive khi archive');
    assert.ok(!content.includes('place.update_status'), 'verify-g8-live.js cấm chuỗi place.update_status');

    // 47.12. RPC probe chỉ pass FORBIDDEN/42501; không coi response khác là sẵn sàng
    assert.ok(
      (content.includes("resText.includes('FORBIDDEN')") || content.includes('resText.includes("FORBIDDEN")')) &&
      (content.includes("resText.includes('42501')") || content.includes('resText.includes("42501")')),
      'RPC probe phải kiểm tra FORBIDDEN hoặc SQLSTATE 42501'
    );
    assert.ok(!content.includes('Response khác chứng minh hàm tồn tại'), 'Cấm coi response khác là RPC sẵn sàng');

    // 47.13. Kiểm tra response.ok cho đủ 4 DELETE fallback và 4 GET verify fallback
    assert.ok(content.includes('!delPlaceRes.ok'), 'Fallback places phải kiểm tra response.ok cho DELETE');
    assert.ok(content.includes('!verPlaceRes.ok'), 'Fallback places phải kiểm tra response.ok cho GET verify');
    assert.ok(content.includes('!delCommRes.ok'), 'Fallback comments phải kiểm tra response.ok cho DELETE');
    assert.ok(content.includes('!verCommRes.ok'), 'Fallback comments phải kiểm tra response.ok cho GET verify');
    assert.ok(content.includes('!delRepRes.ok'), 'Fallback reports phải kiểm tra response.ok cho DELETE');
    assert.ok(content.includes('!verRepRes.ok'), 'Fallback reports phải kiểm tra response.ok cho GET verify');
    assert.ok(content.includes('!delAuditRes.ok'), 'Fallback audit logs phải kiểm tra response.ok cho DELETE');
    assert.ok(content.includes('!verAuditRes.ok'), 'Fallback audit logs phải kiểm tra response.ok cho GET verify');
  });

  // 48. G8.5 Release Runbook, Packaging & Post-Deploy Verification
  await runAsyncTest('48. G8.5 Release Runbook, Packaging & Post-Deploy Verification', async () => {
    const ROOT_DIR = path.resolve(__dirname, '..');
    // 48.1 Xác nhận docs/release-runbook.md tồn tại và chứa đủ 6 phần nghiệp vụ G8
    const runbookPath = path.join(ROOT_DIR, 'docs', 'release-runbook.md');
    assert.ok(fs.existsSync(runbookPath), 'docs/release-runbook.md bắt buộc phải tồn tại');
    const runbook = fs.readFileSync(runbookPath, 'utf8');

    // Pre-deploy checks
    assert.ok(runbook.includes('check:gate') && runbook.includes('git diff --check') && runbook.includes('npm run build'), 'Runbook phải có pre-deploy audit');
    assert.ok(runbook.includes('Database Backup Procedure') || runbook.includes('Sao Lưu Dữ Liệu') || runbook.includes('Sao lưu cơ sở dữ liệu'), 'Runbook phải có phần sao lưu DB bắt buộc');
    assert.ok(runbook.includes('Cách xác nhận bản sao lưu sử dụng được') || runbook.includes('PostgreSQL database dump complete'), 'Runbook phải hướng dẫn xác nhận bản sao lưu');

    // Migration G8
    assert.ok(runbook.includes('g8_admin.sql'), 'Runbook phải nêu rõ file migration g8_admin.sql');
    assert.ok(runbook.includes('admin_users') && runbook.includes('admin_audit_logs'), 'Runbook phải kiểm tra 2 bảng mới');
    assert.ok(runbook.includes('reload schema') || runbook.includes('Schema Cache'), 'Runbook phải lưu ý reload PostgREST schema cache');
    assert.ok(runbook.includes('g8_admin_rollback.sql'), 'Runbook phải có quy trình rollback bằng g8_admin_rollback.sql');
    assert.ok(runbook.includes('ĐIỀU KIỆN & RỦI RO KHI ROLLBACK') || runbook.includes('RỦI RO'), 'Runbook phải cảnh báo rủi ro mất audit/admin allowlist khi rollback');

    // Tạo admin đầu tiên và kiểm tra schema admin_users
    assert.ok(runbook.includes('Khởi Tạo Quản Trị Viên Đầu Tiên') || runbook.includes('First Admin Provisioning'), 'Runbook phải có mục khởi tạo admin đầu tiên');
    assert.ok(runbook.includes('auth.users') && runbook.includes('admin_users'), 'Runbook phải hướng dẫn liên kết auth.users với admin_users');
    assert.ok(runbook.includes('user_id'), 'Runbook phải sử dụng cột user_id cho bảng admin_users');
    assert.ok(!runbook.includes('admin_users (id,'), 'Cấm mẫu admin_users (id, trong runbook');
    assert.ok(!runbook.includes('on conflict (id)'), 'Cấm mẫu on conflict (id) trong runbook');
    assert.ok(!runbook.includes('select id,'), 'Cấm mẫu select id, từ admin_users trong runbook');
    assert.ok(runbook.includes('is_active = true') && runbook.includes("role = 'admin'"), 'Runbook phải hướng dẫn gán role admin và is_active=true');
    assert.ok(runbook.includes('KHÔNG BAO GIỜ') && runbook.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Runbook phải cảnh báo cấm dùng service_role trong frontend');

    // Vận hành tài khoản
    assert.ok(runbook.includes('editor') && runbook.includes('moderator'), 'Runbook phải hướng dẫn tạo editor và moderator');
    assert.ok(runbook.includes('ACCOUNT_DISABLED') || runbook.includes('is_active = false'), 'Runbook phải hướng dẫn khóa tài khoản');
    assert.ok(runbook.includes('Send Password Recovery') || runbook.includes('Đặt lại mật khẩu'), 'Runbook phải hướng dẫn đặt lại mật khẩu');
    assert.ok(runbook.includes('Sign out user') || runbook.includes('Thu hồi phiên đăng nhập'), 'Runbook phải hướng dẫn thu hồi session');

    // Xử lý sự cố (Troubleshooting)
    assert.ok(runbook.includes('503') && runbook.includes('AUTH_UNAVAILABLE'), 'Runbook phải ghi HTTP 503 AUTH_UNAVAILABLE khi Supabase Auth gián đoạn');
    assert.ok(runbook.includes('500') && runbook.includes('DATABASE_ERROR'), 'Runbook phải ghi HTTP 500 DATABASE_ERROR khi query admin_users thất bại');
    assert.ok(runbook.includes('CONFIG_ERROR') || runbook.includes('Vercel thiếu biến môi trường'), 'Runbook phải hướng dẫn xử lý khi thiếu biến môi trường Vercel');
    assert.ok(runbook.includes('SUPABASE_URL') && runbook.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Runbook phải liệt kê các biến môi trường bắt buộc SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY');
    assert.ok(runbook.includes('SUPABASE_ANON_KEY') && runbook.includes('chưa được runtime sử dụng'), 'Runbook phải có ghi chú SUPABASE_ANON_KEY chưa được runtime sử dụng');
    assert.ok(runbook.includes("'audit-g8-live-place-%'"), 'Runbook phải có tiền tố places audit-g8-live-place-%');
    assert.ok(runbook.includes("'audit_rev_%'"), 'Runbook phải có tiền tố comments audit_rev_%');
    assert.ok(runbook.includes("'audit_rep_%'"), 'Runbook phải có tiền tố reports audit_rep_%');
    assert.ok(runbook.includes("'audit_g8_live_%'"), 'Runbook phải có tiền tố audit logs audit_g8_live_%');
    assert.ok(runbook.includes("select count(*) from public.places where slug like 'audit-g8-live-place-%';"), 'Runbook phải có câu count(*) xác nhận places');
    assert.ok(runbook.includes("select count(*) from public.place_comments where client_review_id like 'audit_rev_%';"), 'Runbook phải có câu count(*) xác nhận comments');
    assert.ok(runbook.includes("select count(*) from public.place_reports where client_report_id like 'audit_rep_%';"), 'Runbook phải có câu count(*) xác nhận reports');
    assert.ok(runbook.includes("select count(*) from public.admin_audit_logs where correlation_id like 'audit_g8_live_%';"), 'Runbook phải có câu count(*) xác nhận audit logs');

    // Deploy sequence
    assert.ok(runbook.includes('Release Deployment Sequence') || runbook.includes('Quy Trình Triển Khai Phát Hành'), 'Runbook phải có chuỗi tuần tự deploy');
    assert.ok(runbook.includes('Smoke Test') || runbook.includes('Khói thử nghiệm'), 'Runbook phải có bước smoke test giao diện admin');
    assert.ok(runbook.includes('npm run test:g8:live'), 'Runbook phải yêu cầu chạy live audit sau khi deploy');

    // 48.2 Kiểm tra tĩnh scripts/build.cjs có đầy đủ contract cho các tài nguyên quản trị runtime thật
    const buildScriptPath = path.join(ROOT_DIR, 'scripts', 'build.cjs');
    const buildSource = fs.readFileSync(buildScriptPath, 'utf8');
    assert.ok(buildSource.includes('admin.html'), 'build.cjs contract phải chứa admin.html');
    assert.ok(buildSource.includes('css/tailwind.css'), 'build.cjs contract phải chứa css/tailwind.css');
    assert.ok(buildSource.includes('js/admin.js'), 'build.cjs contract phải chứa js/admin.js');
    assert.ok(buildSource.includes('js/admin-auth.js'), 'build.cjs contract phải chứa js/admin-auth.js');
    assert.ok(buildSource.includes('vendor/fonts/material-symbols.css') || buildSource.includes('material-symbols.css'), 'build.cjs contract phải chứa vendor/fonts/material-symbols.css');

    // 48.3 Xác nhận package.json: check:gate chứa test:g8 và test:g8:browser, KHÔNG chứa test:g8:live
    const pkgPath = path.join(ROOT_DIR, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const gateCmd = pkg.scripts['check:gate'];
    assert.ok(gateCmd.includes('npm run test:g8'), 'check:gate phải chứa npm run test:g8');
    assert.ok(gateCmd.includes('npm run test:g8:browser'), 'check:gate phải chứa npm run test:g8:browser');
    assert.ok(!gateCmd.includes('test:g8:live'), 'check:gate TUYỆT ĐỐI KHÔNG chứa test:g8:live (vì cần credentials và tạo fixture production)');
    assert.ok(pkg.scripts['test:build'], 'package.json phải có script test:build');

    // 48.4 Xác nhận mã nguồn gốc chứa đầy đủ 5 tài nguyên runtime quản trị trước khi build (độc lập với dist/)
    const srcAdminHtml = path.join(ROOT_DIR, 'admin.html');
    const srcAdminJs = path.join(ROOT_DIR, 'js', 'admin.js');
    const srcAdminAuthJs = path.join(ROOT_DIR, 'js', 'admin-auth.js');
    const srcTailwindCss = path.join(ROOT_DIR, 'css', 'tailwind.css');
    const srcFontCss = path.join(ROOT_DIR, 'vendor', 'fonts', 'material-symbols.css');

    assert.ok(fs.existsSync(srcAdminHtml), 'admin.html phải tồn tại trong mã nguồn');
    assert.ok(fs.existsSync(srcAdminJs), 'js/admin.js phải tồn tại trong mã nguồn');
    assert.ok(fs.existsSync(srcAdminAuthJs), 'js/admin-auth.js phải tồn tại trong mã nguồn');
    assert.ok(fs.existsSync(srcTailwindCss), 'css/tailwind.css phải tồn tại trong mã nguồn');
    assert.ok(fs.existsSync(srcFontCss), 'vendor/fonts/material-symbols.css phải tồn tại trong mã nguồn');
  });

  console.log(`\n========================================`);
  console.log(`KẾT QUẢ KIỂM THỬ G8 TOÀN DIỆN: ${passedTests}/${totalTests} PASS`);
  console.log(`========================================\n`);

} finally {
  if (mockServer) {
    mockServer.close();
  }
}

if (passedTests < totalTests) {
  process.exit(1);
}
