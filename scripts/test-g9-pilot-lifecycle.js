// scripts/test-g9-pilot-lifecycle.js
// Bộ kiểm thử tự động cho G9.3C Pilot Content Lifecycle (Read-Only, Dry-Run & Fail-Closed)

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  computeRecordChecksum,
  loadPilotProductionRecords,
  runPilotAudit,
  PILOT_TARGET_IDS
} from './audit-g9-pilot-production.js';
import {
  buildProposedPatchForPlace1,
  buildProposedPatchForPlace3,
  generatePilotPlan,
  ALLOWED_PATCH_FIELDS
} from './plan-g9-pilot.js';
import { validatePlace } from '../js/place-validator.js';
import placesHandler from '../api/admin-places.js';
import {
  savePlace,
  executeUpdatePlaceStatus,
  openPlaceEditor,
  renderPlaces
} from '../js/admin.js';
import { formatPlacePrice, renderRatingStars } from '../js/ui.js';
import {
  resolveAdminCredentials,
  authenticateAdminToken,
  executeChuaAngPilot
} from './execute-g9-pilot-chua-ang.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const BACKUPS_DIR = path.join(ROOT_DIR, 'backups');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    process.exitCode = 1;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    process.exitCode = 1;
  }
}

function createMockReqRes(options = {}) {
  const req = {
    method: options.method || 'GET',
    url: options.url || '/api/admin-places',
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

// Bật cờ test mode cho API admin
process.env.VIVU_TEST = '1';

// Mẫu fixture chuẩn ID 1 & ID 3
const mockBefore1 = {
  id: 1,
  name: 'Ao Bà Om aa',
  slug: 'ao-ba-om',
  category: 'Điểm Check-in / Sống Ảo',
  area: 'TP. Trà Vinh',
  address: 'Phường 8, TP. Trà Vinh',
  coordinates: '9.9347,106.3449',
  map_link: 'https://www.google.com/maps?q=9.9347,106.3449',
  opening_time: '07:00',
  closing_time: '18:00',
  display_hours: null,
  contact: null,
  price_raw: 'Miễn phí',
  description: 'Danh thắng nổi tiếng bậc nhất Trà Vinh với hàng cây cổ thụ trăm tuổi soi bóng.',
  note: 'Nên đi buổi sáng hoặc chiều mát để chụp ảnh đẹp hơn.',
  status: 'hidden',
  operating_status: 'Normal',
  images: ['./ao bà om.jpg'],
  image_link: './ao bà om.jpg',
  rating: 5,
  sort_order: 1,
  is_featured: true,
  created_at: '2026-05-27T02:13:13.148216+00:00',
  updated_at: '2026-05-27T09:05:21.983729+00:00'
};

const mockBefore3 = {
  id: 3,
  name: 'Chùa Âng',
  slug: 'chua-ang',
  category: 'Du Lịch Tâm Linh',
  area: 'TP. Trà Vinh',
  address: 'Khóm 4, phường 8, TP. Trà Vinh',
  coordinates: '9.9322,106.3364',
  map_link: 'https://www.google.com/maps?q=9.9322,106.3364',
  opening_time: '06:00',
  closing_time: '18:00',
  display_hours: null,
  contact: null,
  price_raw: 'Miễn phí',
  description: 'Ngôi chùa Khmer cổ kính, nổi bật với kiến trúc truyền thống và không gian yên bình.',
  note: 'Trang phục lịch sự khi vào chánh điện.',
  status: 'hidden',
  operating_status: 'Normal',
  images: ['./chùa âng.jpg'],
  image_link: './chùa âng.jpg',
  rating: 5,
  sort_order: 3,
  is_featured: true,
  created_at: '2026-05-27T02:13:13.148216+00:00',
  updated_at: '2026-05-27T09:05:21.983729+00:00'
};

console.log('\n=== G9.3C PILOT CONTENT LIFECYCLE TEST SUITE ===\n');

// 1. CHẶN THAO TÁC MUTATION & CHẶN CỜ --EXECUTE / --MUTATION
console.log('--- 1. Kiểm Soát Chế Độ & Chặn Tuyệt Đối Cờ Mutation ---');

await runAsyncTest('generatePilotPlan() ném ngoại lệ chặn đứng cờ --execute', async () => {
  await assert.rejects(
    async () => {
      await generatePilotPlan({ execute: true });
    },
    /EXECUTE_FORBIDDEN/,
    'Phải từ chối thực thi khi có cờ --execute'
  );
});

await runAsyncTest('runPilotAudit() ném ngoại lệ khi phát hiện cờ mutation', async () => {
  await assert.rejects(
    async () => {
      await runPilotAudit({ args: ['--mutation'] });
    },
    /MUTATION_FORBIDDEN/,
    'Phải chặn khi audit có cờ --mutation'
  );
});

// 2. PHẠM VI KIỂM SOÁT DANH MỤC ID (CHỈ CHO PHÉP 1 VÀ 3)
console.log('\n--- 2. Phạm Vi Kiểm Soát Danh Mục ID (Chỉ Cho Phép ID 1 và 3) ---');

await runAsyncTest('Chặn tuyệt đối nếu yêu cầu ID ngoài phạm vi (ví dụ: ID 4, 10 hoặc địa điểm chưa duyệt)', async () => {
  await assert.rejects(
    async () => {
      await generatePilotPlan({ args: ['--ids=1,3,4'], dryRun: true });
    },
    /FORBIDDEN_ID/,
    'Phải chặn ID 4 nằm ngoài phạm vi'
  );

  await assert.rejects(
    async () => {
      await generatePilotPlan({ args: ['--ids=2'], dryRun: true });
    },
    /FORBIDDEN_ID/,
    'Phải chặn ID 2 chưa có hồ sơ'
  );
});

// 3. FAIL-CLOSED KHI ĐỌC SUPABASE PRODUCTION
console.log('\n--- 3. Chính Sách Fail-Closed Khi Đọc Live Supabase ---');

await runAsyncTest('loadPilotProductionRecords() ném FAIL_CLOSED khi thiếu credentials (không tự fallback snapshot)', async () => {
  await assert.rejects(
    async () => {
      await loadPilotProductionRecords({ env: {} });
    },
    /FAIL_CLOSED/,
    'Phải fail-closed khi không có credentials'
  );
});

await runAsyncTest('loadPilotProductionRecords() ném FAIL_CLOSED khi kết nối mạng/API lỗi', async () => {
  const failingFetch = async () => {
    throw new Error('ECONNREFUSED');
  };

  await assert.rejects(
    async () => {
      await loadPilotProductionRecords({
        serviceKey: 'mock-key',
        fetchFn: failingFetch
      });
    },
    /FAIL_CLOSED/,
    'Phải fail-closed khi kết nối API lỗi'
  );
});

await runAsyncTest('loadPilotProductionRecords() ném FAIL_CLOSED khi API trả mã lỗi HTTP không thành công', async () => {
  const errorFetch = async () => ({
    ok: false,
    status: 401,
    text: async () => 'Invalid API Key'
  });

  await assert.rejects(
    async () => {
      await loadPilotProductionRecords({
        serviceKey: 'bad-key',
        fetchFn: errorFetch
      });
    },
    /FAIL_CLOSED/,
    'Phải fail-closed khi API trả lỗi HTTP 401'
  );
});

await runAsyncTest('loadPilotProductionRecords() ném FAIL_CLOSED khi kết quả thiếu mục tiêu ID 1 hoặc 3', async () => {
  const partialFetch = async (url) => {
    if (url.includes('/places?')) {
      return {
        ok: true,
        json: async () => [{ id: 1, name: 'Ao Bà Om' }] // Chỉ trả 1 thay vì 2
      };
    }
    return { ok: true, json: async () => [] };
  };

  await assert.rejects(
    async () => {
      await loadPilotProductionRecords({
        serviceKey: 'mock-key',
        fetchFn: partialFetch
      });
    },
    /FAIL_CLOSED/,
    'Phải fail-closed khi không đủ 2 bản ghi mục tiêu'
  );
});

// 4. QUY TẮC DỮ LIỆU ID 1 (AO BÀ OM) & RUNTIME IMAGE ENFORCEMENT
console.log('\n--- 4. Quy Tắc Dữ Liệu ID 1 (Ao Bà Om) & Thực Thi Ảnh Rỗng ---');

runTest('Xóa triệt để hậu tố rác "aa" khỏi tên Ao Bà Om, giữ slug ao-ba-om', () => {
  const { afterRecord, changedFields, fieldSources } = buildProposedPatchForPlace1(mockBefore1);

  assert.strictEqual(afterRecord.name, 'Ao Bà Om', 'Tên sau patch phải là Ao Bà Om không có aa');
  assert.ok(changedFields.includes('name'), 'changedFields phải ghi nhận name');
  assert.strictEqual(afterRecord.slug, 'ao-ba-om', 'Slug phải giữ nguyên ao-ba-om');
  assert.ok(!changedFields.includes('slug'), 'Slug không được thay đổi');
  assert.strictEqual(afterRecord.address, 'Khóm 4, phường Nguyệt Hóa, tỉnh Vĩnh Long', 'Địa chỉ phải cập nhật NQ 1687');
  assert.ok(fieldSources.legacy_address, 'Phải lưu trữ legacy_address');
});

runTest('Không tự điền giờ, giá, hotline giả cho ID 1 (giữ UNKNOWN/null)', () => {
  const { afterRecord } = buildProposedPatchForPlace1(mockBefore1);
  assert.strictEqual(afterRecord.opening_time, null, 'opening_time phải đặt về null');
  assert.strictEqual(afterRecord.closing_time, null, 'closing_time phải đặt về null');
  assert.strictEqual(afterRecord.display_hours, null, 'display_hours phải đặt về null');
  assert.strictEqual(afterRecord.price_raw, null, 'price_raw phải đặt về null, xóa chuỗi "Miễn phí"');
  assert.strictEqual(afterRecord.contact, null, 'contact phải đặt về null');
});

runTest('Runtime enforcement cho ID 1: images=[] và image_link=null khi ảnh chưa xác minh bản quyền', () => {
  const { afterRecord, changedFields, fieldSources } = buildProposedPatchForPlace1(mockBefore1);
  assert.deepStrictEqual(afterRecord.images, [], 'Runtime bắt buộc images=[]');
  assert.strictEqual(afterRecord.image_link, null, 'Runtime bắt buộc image_link=null');
  assert.strictEqual(fieldSources.images.can_publish, false, 'can_publish phải bằng false');
  assert.ok(changedFields.includes('images'), 'changedFields phải có images');
  assert.ok(changedFields.includes('image_link'), 'changedFields phải có image_link');
});

// 5. QUY TẮC DỮ LIỆU ID 3 (CHÙA ÂNG) & RUNTIME IMAGE ENFORCEMENT
console.log('\n--- 5. Quy Tắc Dữ Liệu ID 3 (Chùa Âng) & Thực Thi Ảnh Rỗng ---');

runTest('Chùa Âng chuẩn hóa tên, địa chỉ NQ 1687, giữ nguyên slug chua-ang', () => {
  const { afterRecord, fieldSources } = buildProposedPatchForPlace3(mockBefore3);

  assert.strictEqual(afterRecord.name, 'Chùa Âng');
  assert.strictEqual(afterRecord.slug, 'chua-ang');
  assert.strictEqual(afterRecord.address, 'Khóm 4, phường Nguyệt Hóa, tỉnh Vĩnh Long');
  assert.strictEqual(afterRecord.opening_time, null);
  assert.strictEqual(afterRecord.closing_time, null);
  assert.strictEqual(afterRecord.price_raw, null);
  assert.ok(fieldSources.name.source_url.includes('vietnamtourism.gov.vn'));
  assert.ok(fieldSources.coordinates.source_url.includes('openstreetmap.org'));
});

runTest('Runtime enforcement cho ID 3: images=[] và image_link=null khi ảnh chưa xác minh bản quyền', () => {
  const { afterRecord, changedFields, fieldSources } = buildProposedPatchForPlace3(mockBefore3);
  assert.deepStrictEqual(afterRecord.images, [], 'Runtime bắt buộc images=[]');
  assert.strictEqual(afterRecord.image_link, null, 'Runtime bắt buộc image_link=null');
  assert.strictEqual(fieldSources.images.can_publish, false, 'can_publish phải bằng false');
  assert.ok(changedFields.includes('images'), 'changedFields phải có images');
  assert.ok(changedFields.includes('image_link'), 'changedFields phải có image_link');
});

// 6. TƯƠNG THÍCH VALIDATOR KHI HÌNH ẢNH RỖNG
console.log('\n--- 6. Thẩm Định Validator Khi Hình Ảnh Bị Xóa Theo Quy Tắc Bản Quyền ---');

runTest('Bản vá rỗng ảnh của ID 1 và ID 3 vượt qua validatePlace với 0 errors', () => {
  const { afterRecord: after1 } = buildProposedPatchForPlace1(mockBefore1);
  const vDraft1 = validatePlace(after1, { mode: 'draft' });
  assert.strictEqual(vDraft1.valid, true, 'Draft validation Ao Bà Om phải valid');
  assert.strictEqual(vDraft1.errors.length, 0, 'Draft validation không được có error');
  assert.ok(vDraft1.warnings.some(w => w.code === 'WARN_MISSING_IMAGES'), 'Phải có warning thiếu ảnh');

  const vApprove1 = validatePlace(after1, { mode: 'approval' });
  assert.strictEqual(vApprove1.valid, true, 'Approval validation Ao Bà Om phải valid');
  assert.strictEqual(vApprove1.errors.length, 0, 'Approval validation không được có error');

  const { afterRecord: after3 } = buildProposedPatchForPlace3(mockBefore3);
  const vDraft3 = validatePlace(after3, { mode: 'draft' });
  assert.strictEqual(vDraft3.valid, true, 'Draft validation Chùa Âng phải valid');
  assert.strictEqual(vDraft3.errors.length, 0, 'Draft validation không được có error');
  assert.ok(vDraft3.warnings.some(w => w.code === 'WARN_MISSING_IMAGES'), 'Phải có warning thiếu ảnh');

  const vApprove3 = validatePlace(after3, { mode: 'approval' });
  assert.strictEqual(vApprove3.valid, true, 'Approval validation Chùa Âng phải valid');
  assert.strictEqual(vApprove3.errors.length, 0, 'Approval validation không được có error');
});

// 7. KHÓA LẠC QUAN THẬT (OPTIMISTIC CONCURRENCY CONTROL)
console.log('\n--- 7. Khóa Lạc Quan Thật (Optimistic Concurrency Control) ---');

runTest('Bản vá mang expected_updated_at khớp chính xác updated_at của beforeRecord', () => {
  const { afterRecord: a1 } = buildProposedPatchForPlace1(mockBefore1);
  assert.strictEqual(a1.expected_updated_at, mockBefore1.updated_at, 'expected_updated_at phải khớp beforeRecord');

  const { afterRecord: a3 } = buildProposedPatchForPlace3(mockBefore3);
  assert.strictEqual(a3.expected_updated_at, mockBefore3.updated_at, 'expected_updated_at phải khớp beforeRecord');
});

runTest('Phát hiện và chặn đứng khi checksum SHA-256 hoặc timestamp bị thay đổi', () => {
  const beforeSnapshot = { id: 1, name: 'Ao Bà Om aa', status: 'hidden', updated_at: '2026-05-27T02:00:00Z' };
  const expectedToken = computeRecordChecksum(beforeSnapshot);

  const alteredProduction = { id: 1, name: 'Ao Bà Om Đổi Tên', status: 'hidden', updated_at: '2026-09-23T12:00:00Z' };
  const alteredToken = computeRecordChecksum(alteredProduction);

  assert.notStrictEqual(expectedToken, alteredToken, 'Checksum phải khác biệt khi dữ liệu bị thay đổi');

  function verifyConcurrency(currentRecord, expectedSha) {
    const currentSha = computeRecordChecksum(currentRecord);
    if (currentSha !== expectedSha) {
      throw new Error('CONCURRENCY_CONFLICT: Dữ liệu production đã thay đổi sau snapshot. Chặn cập nhật.');
    }
    return true;
  }

  assert.ok(verifyConcurrency(beforeSnapshot, expectedToken), 'Khớp checksum thì qua');
  assert.throws(
    () => verifyConcurrency(alteredProduction, expectedToken),
    /CONCURRENCY_CONFLICT/,
    'Lệch checksum phải quăng lỗi CONCURRENCY_CONFLICT'
  );
});

await runAsyncTest('API PATCH /api/admin-places thiếu expected_updated_at bị chặn với HTTP 428 PRECONDITION_REQUIRED (không mutation)', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let rpcCalled = false;

  try {
    process.env.SUPABASE_URL = 'https://mock.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';

    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/rpc/')) {
        rpcCalled = true;
      }
      if (u.includes('/places?id=eq.1')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{
            ...mockBefore1,
            updated_at: '2026-09-23T08:21:45.915Z'
          }],
          text: async () => JSON.stringify([{
            ...mockBefore1,
            updated_at: '2026-09-23T08:21:45.915Z'
          }])
        };
      }
      return { ok: true, status: 200, json: async () => [], text: async () => '[]' };
    };

    // Gửi request PATCH không có expected_updated_at
    const { req, res } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-places',
      headers: {
        authorization: 'Bearer mock-admin-token',
        'content-type': 'application/json'
      },
      body: {
        id: 1,
        name: 'Ao Bà Om Thử Nghiệm Thiếu OCC'
      }
    });

    await placesHandler(req, res);

    assert.strictEqual(res.getStatus(), 428, 'Phải trả về HTTP 428 PRECONDITION_REQUIRED khi thiếu expected_updated_at');
    const body = res.getBody();
    assert.strictEqual(body.error?.code, 'EXPECTED_UPDATED_AT_REQUIRED', 'Error code phải là EXPECTED_UPDATED_AT_REQUIRED');
    assert.ok(body.error?.message?.includes('expected_updated_at'), 'Thông điệp phải ghi rõ thiếu expected_updated_at');
    assert.strictEqual(rpcCalled, false, 'Tuyệt đối không được gọi RPC mutation khi thiếu expected_updated_at');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl !== undefined) process.env.SUPABASE_URL = originalUrl; else delete process.env.SUPABASE_URL;
    if (originalKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey; else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
});

await runAsyncTest('UI edit gửi expected_updated_at từ updated_at hiện tại của địa điểm', async () => {
  const currentUpdatedAt = '2026-09-23T08:21:45.915Z';
  const mockPlace = {
    id: 1,
    name: 'Ao Bà Om',
    slug: 'ao-ba-om',
    category: 'attraction',
    status: 'draft',
    area: 'TP. Trà Vinh',
    address: 'Phường 8, TP. Trà Vinh',
    coordinates: '9.9347, 106.3449',
    map_link: 'https://maps.app.goo.gl/AoBaOm',
    rating: 4.5,
    updated_at: currentUpdatedAt
  };

  const formElements = {
    placeId: { value: '' },
    placeExpectedUpdatedAt: { value: '' },
    placeName: { value: '' },
    placeSlug: { value: '' },
    placeCategory: { value: '' },
    placeStatus: { value: 'draft' },
    placeArea: { value: '' },
    placeAddress: { value: '' },
    placeMapLink: { value: '' },
    placePriceRaw: { value: '' },
    placeOpeningTime: { value: '' },
    placeClosingTime: { value: '' },
    placeOperatingStatus: { value: 'Normal' },
    placeRating: { value: '0' },
    placeCoordinates: { value: '' },
    placeContact: { value: '' },
    placeContributor: { value: '' },
    placeSortOrder: { value: '0' },
    placeIsFeatured: { checked: false },
    placeImageLink: { value: '' },
    placeImages: { value: '' },
    placeDescription: { value: '' },
    placeNote: { value: '' },
    placeEditor: { classList: { remove() {}, add() {} }, scrollIntoView() {} },
    placeEditorTitle: { textContent: '' },
    placeEditorMeta: { textContent: '' },
    placeCount: { textContent: '' },
    placesContainer: { innerHTML: '' },
    placesPaginationContainer: { innerHTML: '' },
    placeSearch: { value: '' },
    placeStatusFilter: { value: 'all' },
    placeCategoryFilter: { value: '' }
  };

  const oldDoc = globalThis.document;
  const oldStorage = globalThis.sessionStorage;
  let interceptedPayload = null;

  try {
    const mockStorage = {
      vivu_admin_session: JSON.stringify({
        access_token: 'mock-admin-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { role: 'admin', email: 'admin@vivutravinh.test' }
      })
    };
    globalThis.sessionStorage = {
      getItem(key) { return mockStorage[key] || null; },
      setItem(key, val) { mockStorage[key] = String(val); },
      removeItem(key) { delete mockStorage[key]; }
    };

    globalThis.document = {
      getElementById(id) { return formElements[id] || null; },
      addEventListener() {},
      removeEventListener() {}
    };

    // Nạp địa điểm vào adminPlaces
    renderPlaces([mockPlace], { page: 1, total_pages: 1, total: 1 });

    // Mở form chỉnh sửa
    openPlaceEditor(1);

    // Kiểm tra input hidden placeExpectedUpdatedAt được gán đúng timestamp
    assert.strictEqual(
      formElements.placeExpectedUpdatedAt.value,
      currentUpdatedAt,
      'placeExpectedUpdatedAt trong DOM phải khớp updated_at của địa điểm'
    );

    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, opts) => {
        if (opts && opts.body) {
          interceptedPayload = JSON.parse(opts.body);
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            place: { ...mockPlace, name: 'Ao Bà Om Sau Edit', updated_at: '2026-09-23T08:30:00.000Z' },
            places: []
          }),
          text: async () => JSON.stringify({
            success: true,
            place: { ...mockPlace, name: 'Ao Bà Om Sau Edit', updated_at: '2026-09-23T08:30:00.000Z' },
            places: []
          })
        };
      };

      await savePlace();

      assert.ok(interceptedPayload !== null, 'Phải gửi request PATCH tới API');
      assert.strictEqual(
        interceptedPayload.expected_updated_at,
        currentUpdatedAt,
        'Payload PATCH từ UI edit bắt buộc phải chứa expected_updated_at khớp updated_at ban đầu'
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    globalThis.document = oldDoc;
    globalThis.sessionStorage = oldStorage;
  }
});

await runAsyncTest('UI approve gửi expected_updated_at từ updated_at hiện tại của record đang preview', async () => {
  const currentUpdatedAt = '2026-09-23T08:21:45.915Z';
  const mockPlace = {
    id: 3,
    name: 'Chùa Âng',
    slug: 'chua-ang',
    category: 'Du Lịch Tâm Linh',
    status: 'draft',
    area: 'TP. Trà Vinh',
    address: 'Quốc lộ 53, Khóm 4, Phường 8, TP Trà Vinh',
    coordinates: '9.9515, 106.3191',
    map_link: 'https://maps.app.goo.gl/ChuaAng',
    rating: 4.8,
    images: [],
    image_link: null,
    updated_at: currentUpdatedAt
  };

  let interceptedPayload = null;
  const originalFetch = globalThis.fetch;
  const oldStorage = globalThis.sessionStorage;

  try {
    const mockStorage = {
      vivu_admin_session: JSON.stringify({
        access_token: 'mock-admin-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { role: 'admin', email: 'admin@vivutravinh.test' }
      })
    };
    globalThis.sessionStorage = {
      getItem(key) { return mockStorage[key] || null; },
      setItem(key, val) { mockStorage[key] = String(val); },
      removeItem(key) { delete mockStorage[key]; }
    };

    globalThis.fetch = async (url, opts) => {
      if (opts && opts.body) {
        interceptedPayload = JSON.parse(opts.body);
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          place: { ...mockPlace, status: 'approved', updated_at: '2026-09-23T08:35:00.000Z' },
          places: []
        }),
        text: async () => JSON.stringify({
          success: true,
          place: { ...mockPlace, status: 'approved', updated_at: '2026-09-23T08:35:00.000Z' },
          places: []
        })
      };
    };

    renderPlaces([mockPlace], { page: 1, total_pages: 1, total: 1 });

    // Gọi executeUpdatePlaceStatus với updated_at của record đang preview
    await executeUpdatePlaceStatus(mockPlace.id, 'approved', mockPlace.updated_at);

    assert.ok(interceptedPayload !== null, 'Phải gửi request PATCH duyệt');
    assert.strictEqual(interceptedPayload.status, 'approved');
    assert.strictEqual(
      interceptedPayload.expected_updated_at,
      currentUpdatedAt,
      'Luồng Duyệt phải gửi expected_updated_at lấy từ updated_at của record đang preview'
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.sessionStorage = oldStorage;
  }
});

await runAsyncTest('API PATCH /api/admin-places trả HTTP 409 CONFLICT và chặn mutation khi expected_updated_at không khớp', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    process.env.SUPABASE_URL = 'https://mock.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';

    // Stub global fetch để giả lập Supabase CSDL trả về bản ghi hiện tại có updated_at = 2026-09-23T14:00:00Z
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/places?id=eq.1')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{
            ...mockBefore1,
            updated_at: '2026-09-23T14:00:00.000Z' // Đã bị sửa đổi sau snapshot!
          }],
          text: async () => JSON.stringify([{
            ...mockBefore1,
            updated_at: '2026-09-23T14:00:00.000Z'
          }])
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => [],
        text: async () => '[]'
      };
    };

    // Gửi request PATCH với expected_updated_at cũ (snapshot cũ 2026-05-27)
    const { req, res } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-places',
      headers: {
        authorization: 'Bearer mock-admin-token',
        'content-type': 'application/json'
      },
      body: {
        id: 1,
        name: 'Ao Bà Om',
        expected_updated_at: '2026-05-27T09:05:21.983729+00:00' // Cũ, lệch với 2026-09-23
      }
    });

    await placesHandler(req, res);

    assert.strictEqual(res.getStatus(), 409, 'Phải trả về HTTP 409 CONFLICT');
    const body = res.getBody();
    assert.strictEqual(body.error?.code, 'CONFLICT', 'Error code phải là CONFLICT');
    assert.ok(body.error?.message?.includes('Xung đột cập nhật đồng thời'), 'Thông điệp phải ghi rõ xung đột đồng thời');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl !== undefined) process.env.SUPABASE_URL = originalUrl; else delete process.env.SUPABASE_URL;
    if (originalKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey; else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
});

await runAsyncTest('API PATCH /api/admin-places thành công (HTTP 200) và nhận updated_at mới khi expected_updated_at khớp', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const validSnapshotTime = '2026-09-23T08:21:45.915Z';
  const newUpdateTime = '2026-09-23T08:40:00.000Z';
  let rpcReceivedPatch = null;

  try {
    process.env.SUPABASE_URL = 'https://mock.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';

    globalThis.fetch = async (url, opts) => {
      const u = String(url);
      if (u.includes('/places?id=eq.1')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{
            ...mockBefore1,
            status: 'draft',
            area: 'TP. Trà Vinh',
            updated_at: validSnapshotTime
          }],
          text: async () => JSON.stringify([{
            ...mockBefore1,
            status: 'draft',
            area: 'TP. Trà Vinh',
            updated_at: validSnapshotTime
          }])
        };
      }

      if (u.includes('/rpc/admin_update_place_atomic')) {
        const reqBody = JSON.parse(opts.body);
        rpcReceivedPatch = reqBody.p_patch;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ...mockBefore1,
            ...rpcReceivedPatch,
            updated_at: newUpdateTime
          }),
          text: async () => JSON.stringify({
            ...mockBefore1,
            ...rpcReceivedPatch,
            updated_at: newUpdateTime
          })
        };
      }

      return { ok: true, status: 200, json: async () => [], text: async () => '[]' };
    };

    const { req, res } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-places',
      headers: {
        authorization: 'Bearer mock-admin-token',
        'content-type': 'application/json'
      },
      body: {
        id: 1,
        name: 'Ao Bà Om Đạt Chuẩn',
        expected_updated_at: validSnapshotTime
      }
    });

    await placesHandler(req, res);

    assert.strictEqual(res.getStatus(), 200, 'Khớp timestamp phải cập nhật thành công HTTP 200');
    const body = res.getBody();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.place.name, 'Ao Bà Om Đạt Chuẩn');
    assert.strictEqual(body.place.updated_at, newUpdateTime, 'Phải nhận được updated_at mới từ database');
    assert.strictEqual(rpcReceivedPatch.expected_updated_at, validSnapshotTime, 'RPC phải nhận được expected_updated_at để kiểm tra');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl !== undefined) process.env.SUPABASE_URL = originalUrl; else delete process.env.SUPABASE_URL;
    if (originalKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey; else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
});

// 8. KHẢ NĂNG PHỤC HỒI & ROLLBACK TOÀN VẸN 100%
console.log('\n--- 8. Khả Năng Phục Hồi (Rollback Đạt 100% Nguyên Trạng) ---');

runTest('Chứng minh apply patch rồi rollback thì record về nguyên trạng 100% (trừ updated_at)', () => {
  const { afterRecord, rollbackPayload, changedFields } = buildProposedPatchForPlace1(mockBefore1);

  // 1. Áp dụng bản vá lên snapshot before
  const appliedRecord = { ...mockBefore1, ...afterRecord };
  assert.strictEqual(appliedRecord.name, 'Ao Bà Om');
  assert.deepStrictEqual(appliedRecord.images, []);
  assert.strictEqual(appliedRecord.image_link, null);

  // 2. Áp dụng rollback payload lên applied record
  const rollbackTimestamp = '2026-09-23T15:00:00.000Z';
  const rolledBackRecord = { ...appliedRecord, ...rollbackPayload, updated_at: rollbackTimestamp };

  // 3. So khớp 100% các trường giữa before gốc và rolledBackRecord (trừ updated_at)
  for (const key of Object.keys(mockBefore1)) {
    if (key === 'updated_at') {
      assert.strictEqual(rolledBackRecord.updated_at, rollbackTimestamp, 'updated_at ghi nhận thời điểm rollback');
      continue;
    }
    assert.deepStrictEqual(
      rolledBackRecord[key],
      mockBefore1[key],
      `Trường '${key}' sau rollback phải khớp hoàn toàn giá trị before gốc`
    );
  }

  // 4. Kiểm tra rollback payload chứa đúng các trường trong changedFields
  assert.deepStrictEqual(
    Object.keys(rollbackPayload).sort(),
    [...changedFields].sort(),
    'Rollback payload phải chứa chính xác các trường trong changedFields'
  );
});

runTest('Rollback payload của Chùa Âng khôi phục 100% giá trị gốc', () => {
  const { afterRecord, rollbackPayload, changedFields } = buildProposedPatchForPlace3(mockBefore3);

  const appliedRecord = { ...mockBefore3, ...afterRecord };
  const rollbackTimestamp = '2026-09-23T15:05:00.000Z';
  const rolledBackRecord = { ...appliedRecord, ...rollbackPayload, updated_at: rollbackTimestamp };

  for (const key of Object.keys(mockBefore3)) {
    if (key === 'updated_at') continue;
    assert.deepStrictEqual(rolledBackRecord[key], mockBefore3[key], `Trường '${key}' sau rollback phải khớp Chùa Âng gốc`);
  }

  assert.deepStrictEqual(
    Object.keys(rollbackPayload).sort(),
    [...changedFields].sort()
  );
});

// 9. AN TOÀN SCHEMA: ALLOWLIST TRƯỜNG THAY ĐỔI
console.log('\n--- 9. An Toàn Schema: Giới Hạn Trường Sửa Trong Allowlist ---');

runTest('Toàn bộ changedFields phải thuộc ALLOWED_PATCH_FIELDS', () => {
  const { changedFields: c1 } = buildProposedPatchForPlace1(mockBefore1);
  for (const f of c1) {
    assert.ok(ALLOWED_PATCH_FIELDS.has(f), `Trường '${f}' không có trong allowlist`);
  }

  const { changedFields: c3 } = buildProposedPatchForPlace3(mockBefore3);
  for (const f of c3) {
    assert.ok(ALLOWED_PATCH_FIELDS.has(f), `Trường '${f}' không có trong allowlist`);
  }
});

// 10. DRY-RUN VỚI THƯ MỤC TẠM (CÁCH LY HOÀN TOÀN KHỎI BACKUPS/ CỦA REPO)
console.log('\n--- 10. Chạy Dry-Run Với Thư Mục Tạm (Không Sinh Rác Trong backups/) ---');

await runAsyncTest('generatePilotPlan() sinh file trong thư mục tạm và backups/ repo được giữ nguyên', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vivu-pilot-test-'));
  const tempBackupsDir = path.join(tempDir, 'backups');
  const tempDataDir = path.join(tempDir, 'data');

  const initialRepoManifests = fs.readdirSync(BACKUPS_DIR).filter(f => f.startsWith('g9-pilot-1-3-manifest-'));

  try {
    const mockData = {
      places: [mockBefore1, mockBefore3],
      comments: [],
      reports: [],
      auditLogs: []
    };

    const result = await generatePilotPlan({
      dryRun: true,
      args: ['--ids=1,3', '--dry-run'],
      mockData,
      backupsDir: tempBackupsDir,
      dataDir: tempDataDir,
      saveFiles: true
    });

    assert.ok(result.manifestFileName.startsWith('g9-pilot-1-3-manifest-'), 'Tên manifest đúng định dạng');
    assert.strictEqual(result.proposedPatchesData.patches.length, 2, 'Phải có 2 bản vá cho ID 1 và ID 3');
    assert.strictEqual(result.proposedPatchesData.mode, 'DRY_RUN_ONLY');
    assert.strictEqual(result.manifestData.data_source, 'mock_data');
    assert.ok(result.manifestData.captured_at, 'Manifest phải có captured_at');

    // Kiểm tra file được ghi trong tempDir
    const tempManifestPath = path.join(tempBackupsDir, result.manifestFileName);
    const tempPatchesPath = path.join(tempDataDir, 'g9-pilot-1-3-proposed-patches.json');

    assert.ok(fs.existsSync(tempManifestPath), 'Manifest phải tồn tại trong tempDir');
    assert.ok(fs.existsSync(tempPatchesPath), 'Proposed patches phải tồn tại trong tempDir');

    // Kiểm tra cấu trúc bản vá trong tempDir
    const savedPatches = JSON.parse(fs.readFileSync(tempPatchesPath, 'utf8'));
    assert.strictEqual(savedPatches.patches[0].place_id, 1);
    assert.deepStrictEqual(savedPatches.patches[0].after.images, []);
    assert.strictEqual(savedPatches.patches[0].after.image_link, null);
    assert.strictEqual(savedPatches.patches[0].patch_payload.expected_updated_at, mockBefore1.updated_at);

    // Kiểm tra các trường metadata bắt buộc: data_source, captured_at, is_valid_production_patch, notice
    assert.strictEqual(savedPatches.data_source, 'mock_data', 'data_source phải lấy đúng từ manifest');
    assert.strictEqual(savedPatches.captured_at, result.manifestData.captured_at, 'captured_at phải khớp 100% manifest');
    assert.strictEqual(savedPatches.is_valid_production_patch, false, 'is_valid_production_patch phải false khi không phải live_supabase');
    assert.ok(typeof savedPatches.notice === 'string' && savedPatches.notice.includes('KHÔNG ĐƯỢC COI LÀ BẢN VÁ PRODUCTION HỢP LỆ'), 'Phải có notice cảnh báo');
  } finally {
    // Dọn dẹp triệt để thư mục tạm
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  // Khẳng định thư mục backups/ của repo KHÔNG bị sinh thêm file manifest g9-pilot nào từ test
  const finalRepoManifests = fs.readdirSync(BACKUPS_DIR).filter(f => f.startsWith('g9-pilot-1-3-manifest-'));
  assert.strictEqual(
    finalRepoManifests.length,
    initialRepoManifests.length,
    `Thư mục backups/ của repo bị sinh thêm file test manifest: ${finalRepoManifests.length - initialRepoManifests.length} file`
  );
});

// 11. THẨM ĐỊNH METADATA BẢN VÁ PRODUCTION (LIVE_SUPABASE VÀ IS_VALID_PRODUCTION_PATCH)
console.log('\n--- 11. Thẩm Định Metadata Bản Vá Production (live_supabase & is_valid_production_patch) ---');

await runAsyncTest('generatePilotPlan() với live_supabase đặt is_valid_production_patch=true và captured_at từ manifest', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vivu-pilot-live-test-'));
  const tempBackupsDir = path.join(tempDir, 'backups');
  const tempDataDir = path.join(tempDir, 'data');

  const mockLiveFetch = async (url) => {
    const u = String(url);
    if (u.includes('/places?')) {
      return {
        ok: true,
        status: 200,
        json: async () => [mockBefore1, mockBefore3]
      };
    }
    return { ok: true, status: 200, json: async () => [] };
  };

  try {
    const result = await generatePilotPlan({
      dryRun: true,
      args: ['--ids=1,3', '--dry-run'],
      serviceKey: 'mock-valid-service-key',
      fetchFn: mockLiveFetch,
      backupsDir: tempBackupsDir,
      dataDir: tempDataDir,
      saveFiles: true
    });

    const { manifestData, proposedPatchesData } = result;

    assert.strictEqual(manifestData.data_source, 'live_supabase', 'Manifest phải ghi nhận live_supabase');
    assert.ok(manifestData.captured_at, 'Manifest phải có captured_at');

    assert.strictEqual(proposedPatchesData.data_source, 'live_supabase', 'data_source phải lấy từ manifest');
    assert.strictEqual(proposedPatchesData.captured_at, manifestData.captured_at, 'captured_at phải khớp chính xác manifest');
    assert.strictEqual(proposedPatchesData.is_valid_production_patch, true, 'is_valid_production_patch phải bằng true khi data_source là live_supabase');
    assert.strictEqual(proposedPatchesData.notice, undefined, 'Không được có notice cảnh báo khi is_valid_production_patch là true');

    // Đọc từ file đã lưu trong tempDataDir
    const tempPatchesPath = path.join(tempDataDir, 'g9-pilot-1-3-proposed-patches.json');
    const saved = JSON.parse(fs.readFileSync(tempPatchesPath, 'utf8'));
    assert.strictEqual(saved.data_source, 'live_supabase');
    assert.strictEqual(saved.captured_at, manifestData.captured_at);
    assert.strictEqual(saved.is_valid_production_patch, true);
    assert.strictEqual(saved.notice, undefined);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// 12. THẨM ĐỊNH TOÀN DIỆN CHÙA ÂNG (ID 3): LOẠI BỎ TRIỆT ĐỂ MIỄN PHÍ, SĐT CŨ, GIỜ CŨ, ẢNH CŨ VÀ FAKE RATING
console.log('\n--- 12. Thẩm Định Toàn Diện Chùa Âng (ID 3): Loại Bỏ Triệt Để Dữ Liệu Chưa Xác Minh ---');

runTest('Khẳng định 0 xuất hiện Miễn phí, 0 SĐT cũ, 0 giờ cũ, 0 ảnh cũ, 0 fake rating trong patch Chùa Âng', () => {
  const { afterRecord } = buildProposedPatchForPlace3(mockBefore3);

  // 1. Không xuất hiện "Miễn phí" (price_raw = null)
  assert.strictEqual(afterRecord.price_raw, null, 'price_raw phải là null');
  const serialized = JSON.stringify(afterRecord);
  assert.ok(!serialized.includes('Miễn phí'), 'afterRecord TUYỆT ĐỐI không chứa chuỗi "Miễn phí"');

  // 2. Không xuất hiện số điện thoại cũ 0294.385.1111
  assert.strictEqual(afterRecord.contact, null, 'contact phải là null');
  assert.ok(!serialized.includes('0294.385.1111'), 'afterRecord TUYỆT ĐỐI không chứa SĐT cũ 0294.385.1111');

  // 3. Không xuất hiện giờ cũ 06:00 hoặc 18:00
  assert.strictEqual(afterRecord.opening_time, null, 'opening_time phải là null');
  assert.strictEqual(afterRecord.closing_time, null, 'closing_time phải là null');
  assert.strictEqual(afterRecord.display_hours, null, 'display_hours phải là null');
  assert.ok(!serialized.includes('06:00'), 'afterRecord TUYỆT ĐỐI không chứa giờ cũ 06:00');
  assert.ok(!serialized.includes('18:00'), 'afterRecord TUYỆT ĐỐI không chứa giờ cũ 18:00');

  // 4. Không xuất hiện ảnh chưa xác minh ./chùa âng.jpg
  assert.deepStrictEqual(afterRecord.images, [], 'images phải là mảng rỗng []');
  assert.strictEqual(afterRecord.image_link, null, 'image_link phải là null');
  assert.ok(!serialized.includes('./chùa âng.jpg'), 'afterRecord TUYỆT ĐỐI không chứa đường dẫn ảnh chưa xác minh');

  // 5. Không xuất hiện rating 5 khi chưa có đánh giá thực tế
  assert.strictEqual(afterRecord.rating, null, 'rating phải là null khi chưa có review thực tế');
  assert.strictEqual(afterRecord.note, null, 'note phải là null khi chưa có nguồn chính thức');

  // 6. Mô tả chuẩn xác từ nguồn bài viết chính thống Cục Du lịch Quốc gia Việt Nam
  assert.ok(afterRecord.description.includes('Ao Bà Om'), 'Mô tả phải có thông tin nằm trong cụm danh thắng Ao Bà Om');
  assert.ok(afterRecord.description.includes('năm 990'), 'Mô tả phải phản ánh đúng năm khởi dựng 990');

  // 7. Nguồn bài viết chính xác, không dùng mã quyết định chưa có bằng chứng trực tiếp
  const { fieldSources } = buildProposedPatchForPlace3(mockBefore3);
  assert.strictEqual(fieldSources.description.source_url, 'https://dantoc.vietnamtourism.gov.vn/chua-ang-ngoi-co-tu-khmer-tuyet-dep-o-vinh-long/');
  assert.ok(!fieldSources.description.rationale.includes('123/QĐ-BVHTT'), 'Rationale không được chứa mã quyết định chưa có tài liệu đối soát');
  assert.ok(fieldSources.description.rationale.includes('năm 990'), 'Rationale phải phản ánh năm khởi dựng 990');
});

runTest('Giao diện Admin Preview & Public Modal hiển thị đúng "Liên hệ / Chưa rõ" và "Chưa có đánh giá", không bao giờ "Miễn phí"', () => {
  const { afterRecord } = buildProposedPatchForPlace3(mockBefore3);

  // Admin Preview format
  const adminPriceDisplay = afterRecord.price_raw || 'Liên hệ / Chưa rõ';
  const adminRatingDisplay = Number(afterRecord.rating) > 0 ? `⭐ ${afterRecord.rating}/5` : 'Chưa có đánh giá';
  assert.strictEqual(adminPriceDisplay, 'Liên hệ / Chưa rõ', 'Admin Preview phải hiển thị "Liên hệ / Chưa rõ"');
  assert.ok(!adminPriceDisplay.includes('Miễn phí'), 'Admin Preview TUYỆT ĐỐI không được hiển thị "Miễn phí"');
  assert.strictEqual(adminRatingDisplay, 'Chưa có đánh giá', 'Admin Preview phải hiển thị "Chưa có đánh giá"');

  // Public UI format
  const publicPriceDisplay = formatPlacePrice(afterRecord);
  const publicStarsDisplay = renderRatingStars(afterRecord.rating);
  assert.strictEqual(publicPriceDisplay, 'Liên hệ', 'Public UI formatPlacePrice phải trả về "Liên hệ"');
  assert.ok(!publicPriceDisplay.includes('Miễn phí'), 'Public UI TUYỆT ĐỐI không được trả về "Miễn phí"');
  assert.ok(publicStarsDisplay.includes('Chưa có đánh giá'), 'Public UI renderRatingStars phải trả về "Chưa có đánh giá"');
});

// ============================================================================
// 13. KIỂM THỬ HARDENING CUỐI G9.3C: BẮT BUỘC ADMIN_ACCESS_TOKEN & CỜ --EXECUTE --CONFIRM
// ============================================================================
console.log('\n--- 13. Hardening Cuối G9.3C: Token & Cờ Thực Thi Fail-Closed ---');

runTest('13.1 resolveAdminCredentials ném lỗi FAIL_CLOSED_NO_ADMIN_TOKEN khi thiếu ADMIN_ACCESS_TOKEN', () => {
  assert.throws(() => {
    resolveAdminCredentials({ env: { ADMIN_ACCESS_TOKEN: '' }, adminToken: '' });
  }, /FAIL_CLOSED_NO_ADMIN_TOKEN/);

  assert.throws(() => {
    resolveAdminCredentials({ env: { ADMIN_TOKEN: 'legacy_val', ADMIN_ACCESS_TOKEN: '' }, adminToken: '' });
  }, /INVALID_ENV_VAR/);
});

await runAsyncTest('13.2 authenticateAdminToken từ chối token không hợp lệ với UNAUTHENTICATED', async () => {
  const mockFetch = async (url) => {
    if (url.includes('/auth/v1/user')) {
      return { ok: false, status: 401, json: async () => ({ message: 'Invalid JWT' }) };
    }
    return { ok: false, status: 404 };
  };

  await assert.rejects(async () => {
    await authenticateAdminToken('invalid_token', { fetchFn: mockFetch });
  }, /UNAUTHENTICATED/);
});

await runAsyncTest('13.3 authenticateAdminToken từ chối user không phải role "admin" với FORBIDDEN', async () => {
  const mockFetch = async (url) => {
    if (url.includes('/auth/v1/user')) {
      return { ok: true, json: async () => ({ id: 'editor-uuid-001', email: 'editor@vivutravinh.test' }) };
    }
    if (url.includes('/rest/v1/admin_users')) {
      return {
        ok: true,
        json: async () => [{ user_id: 'editor-uuid-001', email: 'editor@vivutravinh.test', role: 'editor', is_active: true }]
      };
    }
    return { ok: false, status: 404 };
  };

  await assert.rejects(async () => {
    await authenticateAdminToken('valid_editor_token', { fetchFn: mockFetch });
  }, /FORBIDDEN.*admin/);
});

await runAsyncTest('13.4 authenticateAdminToken trích xuất actor duy nhất từ token đã xác thực, không tự chọn từ CSDL', async () => {
  const mockFetch = async (url) => {
    if (url.includes('/auth/v1/user')) {
      return { ok: true, json: async () => ({ id: 'admin-uuid-999', email: 'superadmin@vivutravinh.test' }) };
    }
    if (url.includes('/rest/v1/admin_users')) {
      return {
        ok: true,
        json: async () => [{ user_id: 'admin-uuid-999', email: 'superadmin@vivutravinh.test', role: 'admin', is_active: true }]
      };
    }
    return { ok: false, status: 404 };
  };

  const actor = await authenticateAdminToken('valid_admin_token', { fetchFn: mockFetch });
  assert.strictEqual(actor.id, 'admin-uuid-999', 'Actor ID phải lấy trực tiếp từ token auth');
  assert.strictEqual(actor.email, 'superadmin@vivutravinh.test', 'Actor email phải lấy trực tiếp từ token auth');
  assert.strictEqual(actor.role, 'admin', 'Actor role phải là admin');
});

await runAsyncTest('13.5 executeChuaAngPilot chạy ở chế độ Dry-Run an toàn khi thiếu cờ --execute hoặc --confirm (Zero Mutation)', async () => {
  let rpcCalled = false;
  const mockFetch = async (url, opts) => {
    if (url.includes('/rest/v1/places?id=eq.3')) {
      return {
        ok: true,
        json: async () => [{
          id: 3,
          slug: 'chua-ang',
          name: 'Chùa Âng',
          status: 'draft',
          updated_at: '2026-09-23T09:10:54.041501+00:00'
        }]
      };
    }
    if (url.includes('/rpc/admin_update_place_atomic')) {
      rpcCalled = true;
      return { ok: true, text: async () => JSON.stringify({ id: 3, status: 'approved' }) };
    }
    return { ok: true, json: async () => [] };
  };

  const mockAuth = {
    actor: { id: 'admin-uuid-test', email: 'admin@test.local', role: 'admin' }
  };

  // Ca 1: Không có cờ nào
  const res1 = await executeChuaAngPilot({
    args: [],
    adminToken: 'test_token',
    mockAuth,
    fetchFn: mockFetch
  });
  assert.strictEqual(res1.dryRun, true, 'Thiếu cờ phải chạy dryRun');
  assert.strictEqual(res1.mutated, false, 'Tuyệt đối không mutation');
  assert.strictEqual(rpcCalled, false, 'RPC tuyệt đối không được gọi');

  // Ca 2: Chỉ có --execute nhưng thiếu --confirm
  const res2 = await executeChuaAngPilot({
    args: ['--execute'],
    adminToken: 'test_token',
    mockAuth,
    fetchFn: mockFetch
  });
  assert.strictEqual(res2.dryRun, true, 'Thiếu --confirm phải chạy dryRun');
  assert.strictEqual(res2.mutated, false, 'Tuyệt đối không mutation');
  assert.strictEqual(rpcCalled, false, 'RPC tuyệt đối không được gọi');

  // Ca 3: Chỉ có --confirm nhưng thiếu --execute
  const res3 = await executeChuaAngPilot({
    args: ['--confirm'],
    adminToken: 'test_token',
    mockAuth,
    fetchFn: mockFetch
  });
  assert.strictEqual(res3.dryRun, true, 'Thiếu --execute phải chạy dryRun');
  assert.strictEqual(res3.mutated, false, 'Tuyệt đối không mutation');
  assert.strictEqual(rpcCalled, false, 'RPC tuyệt đối không được gọi');
});

console.log('\n========================================');
console.log(`G9.3C TEST SUMMARY: ${passedTests}/${totalTests} PASS`);
console.log('========================================\n');
