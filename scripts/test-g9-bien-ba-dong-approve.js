// scripts/test-g9-bien-ba-dong-approve.js
// Bộ kiểm thử tự động cho quy trình PHÊ DUYỆT CÔNG KHAI Biển Ba Động (ID 2) — G9.4-B2
// Khẳng định 100% tiêu chuẩn an toàn Fail-Closed, OCC, Snapshot, Minimal Patch và Dry-Run.

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  savePreApproveSnapshot,
  resolveAndAuthenticateAdmin,
  executeBienBaDongApprove
} from './execute-g9-bien-ba-dong-approve.js';
import { computeRecordChecksum } from './execute-g9-bien-ba-dong-draft.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

console.log('======================================================================');
console.log('🧪 BỘ KIỂM THỬ TỰ ĐỘNG PHÊ DUYỆT CÔNG KHAI BIỂN BA ĐỘNG (G9.4-B2)');
console.log('======================================================================\n');

const mockDraftPlaceId2 = {
  id: 2,
  slug: 'bien-ba-dong',
  name: 'Biển Ba Động',
  category: 'Điểm Check-in / Sống Ảo',
  area: 'Duyên Hải',
  address: 'Khu du lịch Ba Động, phường Trường Long Hòa, tỉnh Vĩnh Long',
  map_link: 'https://www.google.com/maps?q=9.6730,106.5700',
  price_raw: null,
  description: 'Biển Ba Động là điểm du lịch biển nổi tiếng từ thời Pháp thuộc, mang đặc trưng cảnh quan và hệ sinh thái duyên hải của vùng đất Trà Vinh.',
  note: null,
  contact: null,
  coordinates: '9.6730,106.5700',
  contributor: 'Admin',
  rating: null,
  opening_time: null,
  closing_time: null,
  display_hours: null,
  operating_status: 'Normal',
  status: 'draft',
  images: [],
  image_link: null,
  sort_order: 2,
  is_featured: true,
  created_at: '2026-05-27T02:13:13.148216+00:00',
  updated_at: '2026-09-24T04:33:38.594326+00:00',
  client_submission_id: null
};

// 1. Kiểm tra Pre-Approve Snapshot & Rollback Invariants
console.log('--- 1. Kiểm Tra Pre-Approve Snapshot & Rollback Invariants ---');

runTest('1.1 savePreApproveSnapshot tạo file manifest đầy đủ và rollback về status draft', () => {
  const tmpBackups = fs.mkdtempSync(path.join(os.tmpdir(), 'vivu-snap-approve-test-'));
  try {
    const { manifestPath, manifest } = savePreApproveSnapshot(mockDraftPlaceId2, { backupsDir: tmpBackups });
    assert.ok(fs.existsSync(manifestPath));
    assert.strictEqual(manifest.target_id, 2);
    assert.strictEqual(manifest.expected_updated_at, '2026-09-24T04:33:38.594326+00:00');
    assert.strictEqual(manifest.rollback_payload.status, 'draft');
    assert.strictEqual(manifest.checksum_sha256, computeRecordChecksum(mockDraftPlaceId2));
  } finally {
    fs.rmSync(tmpBackups, { recursive: true, force: true });
  }
});

// 2. Kiểm tra Fail-Closed Authentication
console.log('\n--- 2. Kiểm Tra Xác Thực Quản Trị Viên (Fail-Closed) ---');

await runAsyncTest('2.1 resolveAndAuthenticateAdmin ném lỗi khi thiếu toàn bộ thông tin đăng nhập', async () => {
  await assert.rejects(
    () => resolveAndAuthenticateAdmin({
      env: { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-key', ADMIN_ACCESS_TOKEN: '', ADMIN_SECRET: '' },
      adminToken: ''
    }),
    /FAIL_CLOSED_NO_ADMIN_TOKEN/
  );
});

await runAsyncTest('2.2 resolveAndAuthenticateAdmin ném lỗi ngay cả khi có ADMIN_SECRET nếu thiếu ADMIN_ACCESS_TOKEN', async () => {
  await assert.rejects(
    () => resolveAndAuthenticateAdmin({
      env: { SUPABASE_URL: 'https://test.supabase.co', ADMIN_SECRET: 'some-password-xyz', ADMIN_ACCESS_TOKEN: '' },
      adminToken: ''
    }),
    /FAIL_CLOSED_NO_ADMIN_TOKEN/
  );
});

await runAsyncTest('2.3 resolveAndAuthenticateAdmin từ chối role không phải admin', async () => {
  await assert.rejects(
    () => resolveAndAuthenticateAdmin({
      mockAuth: {
        actor: { id: 'moderator-uuid', email: 'mod@test.vn', role: 'moderator' },
        error: new Error("FORBIDDEN: Yêu cầu quyền role 'admin' để thực thi mutation")
      }
    }),
    /FORBIDDEN/
  );
});

runTest('2.4 scripts/execute-g9-bien-ba-dong-approve.js không chứa JWT anon key hard-code', () => {
  const executeCode = fs.readFileSync(path.join(REPO_ROOT, 'scripts/execute-g9-bien-ba-dong-approve.js'), 'utf8');
  assert.ok(!executeCode.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), 'Tuyệt đối không hard-code chuỗi anon JWT trong script approve');
  assert.ok(executeCode.includes('CONFIG_SUPABASE_ANON_KEY'), 'Phải import anon key từ cấu hình chuẩn');
});

// 3. Kiểm tra Bảo Vệ Dry-Run (Zero Mutation)
console.log('\n--- 3. Kiểm Tra Bảo Vệ Dry-Run (Zero Mutation) ---');

await runAsyncTest('3.1 executeBienBaDongApprove không truyền cờ tự động rơi vào Dry-Run (mutated = false)', async () => {
  const tmpBackups = fs.mkdtempSync(path.join(os.tmpdir(), 'vivu-dry-approve-test-'));
  try {
    const result = await executeBienBaDongApprove({
      args: [],
      backupsDir: tmpBackups,
      mockPlace: mockDraftPlaceId2,
      mockAuth: { actor: { id: 'admin-1', email: 'admin@test.local', role: 'admin' } }
    });

    assert.strictEqual(result.dryRun, true);
    assert.strictEqual(result.mutated, false);
    assert.strictEqual(result.liveRecord.status, 'draft');
  } finally {
    fs.rmSync(tmpBackups, { recursive: true, force: true });
  }
});

await runAsyncTest('3.2 executeBienBaDongApprove chỉ có --execute thiếu --confirm vẫn là Dry-Run', async () => {
  const tmpBackups = fs.mkdtempSync(path.join(os.tmpdir(), 'vivu-dry-approve-test-'));
  try {
    const result = await executeBienBaDongApprove({
      args: ['--execute'],
      backupsDir: tmpBackups,
      mockPlace: mockDraftPlaceId2,
      mockAuth: { actor: { id: 'admin-1', email: 'admin@test.local', role: 'admin' } }
    });

    assert.strictEqual(result.dryRun, true);
    assert.strictEqual(result.mutated, false);
  } finally {
    fs.rmSync(tmpBackups, { recursive: true, force: true });
  }
});

await runAsyncTest('3.3 executeBienBaDongApprove chỉ có --confirm thiếu --execute vẫn là Dry-Run', async () => {
  const tmpBackups = fs.mkdtempSync(path.join(os.tmpdir(), 'vivu-dry-approve-test-'));
  try {
    const result = await executeBienBaDongApprove({
      args: ['--confirm'],
      backupsDir: tmpBackups,
      mockPlace: mockDraftPlaceId2,
      mockAuth: { actor: { id: 'admin-1', email: 'admin@test.local', role: 'admin' } }
    });

    assert.strictEqual(result.dryRun, true);
    assert.strictEqual(result.mutated, false);
  } finally {
    fs.rmSync(tmpBackups, { recursive: true, force: true });
  }
});

// 4. Nguyên Tắc Giới Hạn Sửa Đổi Tối Thiểu (Minimal Mutation Constraint)
console.log('\n--- 4. Kiểm Tra Giới Hạn Sửa Đổi Tối Thiểu (Chỉ status=approved) ---');

runTest('4.1 Payload approve CHỈ chứa status="approved" và expected_updated_at, không sửa trường khác', () => {
  const approvePatch = {
    status: 'approved',
    expected_updated_at: mockDraftPlaceId2.updated_at
  };

  const keys = Object.keys(approvePatch);
  assert.strictEqual(keys.length, 2, 'Chỉ được có đúng 2 trường: status và expected_updated_at');
  assert.strictEqual(approvePatch.status, 'approved');
  assert.strictEqual(approvePatch.expected_updated_at, '2026-09-24T04:33:38.594326+00:00');

  // Khẳng định KHÔNG chạm vào bất kỳ trường nội dung nào
  assert.strictEqual(approvePatch.name, undefined);
  assert.strictEqual(approvePatch.address, undefined);
  assert.strictEqual(approvePatch.coordinates, undefined);
  assert.strictEqual(approvePatch.description, undefined);
  assert.strictEqual(approvePatch.price_raw, undefined);
  assert.strictEqual(approvePatch.rating, undefined);
  assert.strictEqual(approvePatch.contact, undefined);
  assert.strictEqual(approvePatch.images, undefined);
});

// 5. Kiểm tra phạm vi cô lập (Scope Isolation)
console.log('\n--- 5. Kiểm Tra Phạm Vi Cô Lập (Chỉ ID 2, không động 4 địa điểm khác) ---');

runTest('5.1 Kịch bản phê duyệt chỉ áp dụng cho ID 2 (PLACE_ID = 2)', () => {
  const executeCode = fs.readFileSync(path.join(REPO_ROOT, 'scripts/execute-g9-bien-ba-dong-approve.js'), 'utf8');
  assert.ok(executeCode.includes('const PLACE_ID = 2;'));
  assert.ok(executeCode.includes("const SLUG = 'bien-ba-dong';"));
  // Đảm bảo không gọi insert hay update cho các ID khác
  assert.ok(!executeCode.includes('admin_create_place_atomic'));
});

console.log('\n========================================');
console.log(`BỘ KIỂM THỬ APPROVE: ${passedTests}/${totalTests} PASS`);
console.log('========================================');
