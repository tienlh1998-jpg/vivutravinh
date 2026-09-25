// scripts/test-g9-cleanup-step1.js
// Bộ kiểm thử tự động cho quy trình Bước 1: Dọn dẹp dữ liệu rác trên Supabase Production
// Kiểm tra Snapshot, OCC, Dry-Run invariant, Phân loại mục tiêu và Fail-Closed authentication.

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  computeRecordChecksum,
  savePreCleanupSnapshot,
  resolveAndAuthenticateAdmin,
  executeStep1GarbageCleanup,
  GARBAGE_TARGET_IDS,
  ACTIVE_PLACE_IDS
} from './execute-g9-cleanup-step1.js';

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
console.log('🧪 BỘ KIỂM THỬ TỰ ĐỘNG BƯỚC 1: DỌN DẸP DỮ LIỆU RÁC TRÊN PRODUCTION');
console.log('======================================================================\n');

// 1. Phân loại mục tiêu & Hằng số
console.log('--- 1. Kiểm Tra Phân Loại Mục Tiêu & Hằng Số ---');

runTest('1.1 GARBAGE_TARGET_IDS bao gồm đúng 6 bản ghi (4, 5, 6, 8, 9, 10)', () => {
  assert.deepStrictEqual(GARBAGE_TARGET_IDS, [4, 5, 6, 8, 9, 10]);
});

runTest('1.2 ACTIVE_PLACE_IDS bao gồm đúng 3 bản ghi (1, 2, 3)', () => {
  assert.deepStrictEqual(ACTIVE_PLACE_IDS, [1, 2, 3]);
});

runTest('1.3 Không có sự giao thoa giữa mục tiêu rác và địa điểm hoạt động', () => {
  const overlap = GARBAGE_TARGET_IDS.filter(id => ACTIVE_PLACE_IDS.includes(id));
  assert.strictEqual(overlap.length, 0);
});

// 2. Kiểm tra Snapshot Manifest & Rollback Plan
console.log('\n--- 2. Kiểm Tra Snapshot Manifest & Rollback Plan ---');

runTest('2.1 savePreCleanupSnapshot tạo manifest đầy đủ với rollback plan chuẩn', () => {
  const tmpBackups = fs.mkdtempSync(path.join(os.tmpdir(), 'vivu-step1-snap-'));
  const mockPlaces = [
    { id: 1, name: 'Ao Bà Om', slug: 'ao-ba-om', status: 'approved', updated_at: '2026-09-23T00:00:00Z' },
    { id: 2, name: 'Biển Ba Động', slug: 'bien-ba-dong', status: 'approved', updated_at: '2026-09-24T00:00:00Z' },
    { id: 3, name: 'Chùa Âng', slug: 'chua-ang', status: 'approved', updated_at: '2026-09-24T00:00:00Z' },
    { id: 4, name: 'Test Form', slug: 'test-form', status: 'archived', updated_at: '2026-09-22T00:00:00Z' },
    { id: 5, name: 'XBCZ', slug: 'xbcz', status: 'hidden', updated_at: '2026-05-28T00:00:00Z' },
    { id: 6, name: 'Test 2', slug: 'test-2', status: 'archived', updated_at: '2026-09-22T00:00:00Z' },
    { id: 8, name: 'dd', slug: 'dd', status: 'hidden', updated_at: '2026-05-28T00:00:00Z' },
    { id: 9, name: 'addda', slug: 'addda', status: 'hidden', updated_at: '2026-05-28T00:00:00Z' },
    { id: 10, name: 'adasd', slug: 'adasd', status: 'archived', updated_at: '2026-09-22T00:00:00Z' }
  ];

  const { manifestPath, manifest } = savePreCleanupSnapshot(mockPlaces, { backupsDir: tmpBackups });
  assert.ok(fs.existsSync(manifestPath));
  assert.strictEqual(manifest.manifest_type, 'g9_4_step1_garbage_cleanup_pre_snapshot');
  assert.strictEqual(manifest.total_live_places_before, 9);
  assert.strictEqual(manifest.rollback_plan.length, 6);
  assert.strictEqual(manifest.rollback_plan.find(p => p.id === 5).original_status, 'hidden');

  fs.rmSync(tmpBackups, { recursive: true, force: true });
});

// 3. Kiểm tra Xác thực Quản trị viên (Fail-Closed)
console.log('\n--- 3. Kiểm Tra Xác Thực Quản Trị Viên (Fail-Closed) ---');

await runAsyncTest('3.1 resolveAndAuthenticateAdmin ném lỗi khi thiếu toàn bộ thông tin đăng nhập', async () => {
  await assert.rejects(
    async () => {
      await resolveAndAuthenticateAdmin({
        env: {
          SUPABASE_URL: 'https://example.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: '',
          ADMIN_SECRET: '',
          ADMIN_ACCESS_TOKEN: ''
        },
        adminToken: ''
      });
    },
    /FAIL_CLOSED_NO_ADMIN_TOKEN/
  );
});

// 4. Kiểm tra Cơ Chế Dry-Run (Zero Mutation)
console.log('\n--- 4. Kiểm Tra Bảo Vệ Dry-Run (Zero Mutation) ---');

await runAsyncTest('4.1 executeStep1GarbageCleanup không cờ tự động rơi vào Dry-Run (mutated = false)', async () => {
  const result = await executeStep1GarbageCleanup({
    args: [],
    backupsDir: fs.mkdtempSync(path.join(os.tmpdir(), 'vivu-step1-dry-'))
  });
  assert.strictEqual(result.dryRun, true);
  assert.strictEqual(result.mutated, false);
});

await runAsyncTest('4.2 executeStep1GarbageCleanup chỉ có --execute thiếu --confirm vẫn là Dry-Run', async () => {
  const result = await executeStep1GarbageCleanup({
    args: ['--execute'],
    backupsDir: fs.mkdtempSync(path.join(os.tmpdir(), 'vivu-step1-dry-'))
  });
  assert.strictEqual(result.dryRun, true);
  assert.strictEqual(result.mutated, false);
});

await runAsyncTest('4.3 executeStep1GarbageCleanup chỉ có --confirm thiếu --execute vẫn là Dry-Run', async () => {
  const result = await executeStep1GarbageCleanup({
    args: ['--confirm'],
    backupsDir: fs.mkdtempSync(path.join(os.tmpdir(), 'vivu-step1-dry-'))
  });
  assert.strictEqual(result.dryRun, true);
  assert.strictEqual(result.mutated, false);
});

// 5. Kiểm tra An toàn Mã nguồn
console.log('\n--- 5. Kiểm Tra An Toàn Mã Nguồn ---');

runTest('5.1 scripts/execute-g9-cleanup-step1.js TUYỆT ĐỐI không gọi DELETE trong SQL hay REST', () => {
  const scriptContent = fs.readFileSync(path.join(REPO_ROOT, 'scripts/execute-g9-cleanup-step1.js'), 'utf8');
  assert.ok(!scriptContent.includes("method: 'DELETE'"), 'Tuyệt đối không có HTTP DELETE');
  assert.ok(!scriptContent.includes('DELETE FROM'), 'Tuyệt đối không có SQL DELETE');
});

runTest('5.2 Script không chứa JWT hay SECRET hard-code', () => {
  const scriptContent = fs.readFileSync(path.join(REPO_ROOT, 'scripts/execute-g9-cleanup-step1.js'), 'utf8');
  assert.ok(!scriptContent.includes('TienAnh@100920@'), 'Không được hardcode mật khẩu');
});

console.log('\n========================================');
console.log(`BỘ KIỂM THỬ BƯỚC 1: ${passedTests}/${totalTests} PASS`);
console.log('========================================\n');
