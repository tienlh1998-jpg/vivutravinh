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
  assert.ok(fieldSources.name.source_url.includes('bvhttdl.gov.vn'));
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

console.log('\n========================================');
console.log(`G9.3C TEST SUMMARY: ${passedTests}/${totalTests} PASS`);
console.log('========================================\n');
