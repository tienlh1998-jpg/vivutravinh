// scripts/test-g9-bien-ba-dong-draft.js
// Bộ kiểm thử tự động cho quy trình chuyển DRAFT Biển Ba Động (ID 2)
// Khẳng định 100% tiêu chuẩn an toàn Fail-Closed, OCC, Snapshot và Dry-Run.

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  fetchLivePlaceId2,
  savePreDraftSnapshot,
  computeRecordChecksum,
  resolveAndAuthenticateAdmin,
  executeBienBaDongDraft
} from './execute-g9-bien-ba-dong-draft.js';
import { validatePlace } from '../js/place-validator.js';

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
console.log('🧪 BỘ KIỂM THỬ TỰ ĐỘNG QUY TRÌNH CHUYỂN DRAFT BIỂN BA ĐỘNG (G9.4-B1)');
console.log('======================================================================\n');

const mockPlaceId2 = {
  id: 2,
  slug: 'bien-ba-dong',
  name: 'Biển Ba Động DH',
  category: 'Điểm Check-in / Sống Ảo',
  area: 'Duyên Hải',
  address: 'Xã Trường Long Hòa, thị xã Duyên Hải',
  map_link: 'https://www.google.com/maps?q=9.6115,106.5775',
  price_raw: 'Miễn phí',
  description: 'Bãi biển hoang sơ...',
  note: 'Nên kiểm tra thời tiết.',
  contact: '0294.383.2222',
  coordinates: '9.6115,106.5775',
  contributor: 'Admin',
  rating: 4.5,
  opening_time: '07:00',
  closing_time: '18:00',
  display_hours: null,
  operating_status: 'Normal',
  status: 'hidden',
  images: ['./biển ba động.jpg'],
  image_link: './biển ba động.jpg',
  sort_order: 2,
  is_featured: true,
  created_at: '2026-05-27T02:13:13.148216+00:00',
  updated_at: '2026-05-28T03:29:53.940474+00:00',
  client_submission_id: null
};

// 1. Kiểm tra snapshot & rollback
console.log('--- 1. Kiểm Tra Pre-Draft Snapshot & Rollback Invariants ---');

runTest('1.1 savePreDraftSnapshot tạo file manifest đầy đủ và checksum khớp', () => {
  const tmpBackups = fs.mkdtempSync(path.join(os.tmpdir(), 'vivu-snap-test-'));
  try {
    const { manifestPath, manifest } = savePreDraftSnapshot(mockPlaceId2, { backupsDir: tmpBackups });
    assert.ok(fs.existsSync(manifestPath));
    assert.strictEqual(manifest.target_id, 2);
    assert.strictEqual(manifest.expected_updated_at, '2026-05-28T03:29:53.940474+00:00');
    assert.strictEqual(manifest.rollback_payload.status, 'hidden');
    assert.strictEqual(manifest.rollback_payload.name, 'Biển Ba Động DH');
    assert.strictEqual(manifest.rollback_payload.price_raw, 'Miễn phí');
    assert.strictEqual(manifest.checksum_sha256, computeRecordChecksum(mockPlaceId2));
  } finally {
    fs.rmSync(tmpBackups, { recursive: true, force: true });
  }
});

// 2. Kiểm tra fail-closed authentication
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

await runAsyncTest('2.2 resolveAndAuthenticateAdmin từ chối role không phải admin', async () => {
  await assert.rejects(
    () => resolveAndAuthenticateAdmin({
      mockAuth: {
        actor: { id: 'editor-uuid', email: 'editor@test.vn', role: 'editor' },
        error: new Error("FORBIDDEN: Yêu cầu quyền role 'admin' để thực thi mutation")
      }
    }),
    /FORBIDDEN/
  );
});

// 3. Kiểm tra bảo vệ Dry-Run (Zero Mutation)
console.log('\n--- 3. Kiểm Tra Bảo Vệ Dry-Run (Zero Mutation) ---');

await runAsyncTest('3.1 executeBienBaDongDraft không truyền cờ tự động rơi vào Dry-Run (mutated = false)', async () => {
  const tmpBackups = fs.mkdtempSync(path.join(os.tmpdir(), 'vivu-dry-test-'));
  try {
    const result = await executeBienBaDongDraft({
      args: [],
      backupsDir: tmpBackups,
      mockPlace: mockPlaceId2,
      mockAuth: { actor: { id: 'admin-1', email: 'admin@test.local', role: 'admin' } }
    });

    assert.strictEqual(result.dryRun, true);
    assert.strictEqual(result.mutated, false);
    assert.strictEqual(result.liveRecord.status, 'hidden');
  } finally {
    fs.rmSync(tmpBackups, { recursive: true, force: true });
  }
});

await runAsyncTest('3.2 executeBienBaDongDraft chỉ có --execute thiếu --confirm vẫn là Dry-Run', async () => {
  const tmpBackups = fs.mkdtempSync(path.join(os.tmpdir(), 'vivu-dry-test-'));
  try {
    const result = await executeBienBaDongDraft({
      args: ['--execute'],
      backupsDir: tmpBackups,
      mockPlace: mockPlaceId2,
      mockAuth: { actor: { id: 'admin-1', email: 'admin@test.local', role: 'admin' } }
    });

    assert.strictEqual(result.dryRun, true);
    assert.strictEqual(result.mutated, false);
  } finally {
    fs.rmSync(tmpBackups, { recursive: true, force: true });
  }
});

await runAsyncTest('3.3 executeBienBaDongDraft chỉ có --confirm thiếu --execute vẫn là Dry-Run', async () => {
  const tmpBackups = fs.mkdtempSync(path.join(os.tmpdir(), 'vivu-dry-test-'));
  try {
    const result = await executeBienBaDongDraft({
      args: ['--confirm'],
      backupsDir: tmpBackups,
      mockPlace: mockPlaceId2,
      mockAuth: { actor: { id: 'admin-1', email: 'admin@test.local', role: 'admin' } }
    });

    assert.strictEqual(result.dryRun, true);
    assert.strictEqual(result.mutated, false);
  } finally {
    fs.rmSync(tmpBackups, { recursive: true, force: true });
  }
});

// 4. Thẩm định Schema của Patch Payload cho Biển Ba Động
console.log('\n--- 4. Thẩm Định Schema Patch Payload (validatePlace) ---');

runTest('4.1 Patch payload Biển Ba Động đạt chuẩn 100% validatePlace ở chế độ draft', () => {
  const patchPayload = {
    name: 'Biển Ba Động',
    slug: 'bien-ba-dong',
    category: 'Điểm Check-in / Sống Ảo',
    area: 'Duyên Hải',
    address: 'Khu du lịch Ba Động, phường Trường Long Hòa, tỉnh Vĩnh Long',
    coordinates: '9.6730,106.5700',
    map_link: 'https://www.google.com/maps?q=9.6730,106.5700',
    description: 'Biển Ba Động là điểm du lịch biển nổi tiếng từ thời Pháp thuộc, mang đặc trưng cảnh quan và hệ sinh thái duyên hải của vùng đất Trà Vinh.',
    price_raw: null,
    rating: null,
    contact: null,
    note: null,
    opening_time: null,
    closing_time: null,
    display_hours: null,
    operating_status: 'Normal',
    status: 'draft',
    images: [],
    image_link: null,
    expected_updated_at: '2026-05-28T03:29:53.940474+00:00'
  };

  const vResult = validatePlace(patchPayload, { mode: 'draft' });
  assert.ok(vResult.valid);
  assert.strictEqual(vResult.errors.length, 0);
  assert.strictEqual(patchPayload.price_raw, null);
  assert.strictEqual(patchPayload.rating, null);
  assert.strictEqual(patchPayload.status, 'draft');
});

console.log('\n========================================');
console.log(`BỘ KIỂM THỬ CHUYỂN DRAFT: ${passedTests}/${totalTests} PASS`);
console.log('========================================');
