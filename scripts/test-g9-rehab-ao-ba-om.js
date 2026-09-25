// scripts/test-g9-rehab-ao-ba-om.js
// Bộ kiểm thử tự động cho quy trình Bước 2: Chuẩn hóa & Nghiệm thu Ao Bà Om (ID 1)
// Thẩm định Zero-Speculation, Snapshot, OCC, Dry-Run invariant và Schema Validator.

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { validatePlace } from '../js/place-validator.js';
import {
  REHAB_AO_BA_OM_PAYLOAD,
  AO_BA_OM_SOURCES,
  AO_BA_OM_ID,
  savePreRehabSnapshot,
  executeStep2RehabAoBaOm
} from './execute-g9-rehab-ao-ba-om.js';

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
console.log('🧪 BỘ KIỂM THỬ TỰ ĐỘNG BƯỚC 2: CHUẨN HÓA AO BÀ OM (ID 1)');
console.log('======================================================================\n');

// 1. Thẩm định Nguyên Tắc Không Suy Diễn (Zero-Speculation)
console.log('--- 1. Kiểm Tra Nguyên Tắc Không Suy Diễn (Zero-Speculation) ---');

runTest('1.1 rating phải là null (khử fake 5 sao)', () => {
  assert.strictEqual(REHAB_AO_BA_OM_PAYLOAD.rating, null);
});

runTest('1.2 note phải là null (khử ghi chú cảm tính)', () => {
  assert.strictEqual(REHAB_AO_BA_OM_PAYLOAD.note, null);
});

runTest('1.3 price_raw phải là null (hiển thị "Liên hệ")', () => {
  assert.strictEqual(REHAB_AO_BA_OM_PAYLOAD.price_raw, null);
});

runTest('1.4 opening_time, closing_time và display_hours phải là null', () => {
  assert.strictEqual(REHAB_AO_BA_OM_PAYLOAD.opening_time, null);
  assert.strictEqual(REHAB_AO_BA_OM_PAYLOAD.closing_time, null);
  assert.strictEqual(REHAB_AO_BA_OM_PAYLOAD.display_hours, null);
});

runTest('1.5 contact phải là null (ẩn khối liên hệ)', () => {
  assert.strictEqual(REHAB_AO_BA_OM_PAYLOAD.contact, null);
});

runTest('1.6 images phải là mảng rỗng [] (khung SVG trung tính)', () => {
  assert.deepStrictEqual(REHAB_AO_BA_OM_PAYLOAD.images, []);
  assert.strictEqual(REHAB_AO_BA_OM_PAYLOAD.image_link, null);
});

// 2. Kiểm tra Nguồn Gốc Xác Thực & Địa Giới NQ 1687
console.log('\n--- 2. Kiểm Tra Nguồn Gốc Xác Thực & Địa Giới NQ 1687 ---');

runTest('2.1 Địa chỉ tuân thủ Nghị quyết 1687/NQ-UBTVQH15 (phường Nguyệt Hóa, tỉnh Vĩnh Long)', () => {
  assert.ok(REHAB_AO_BA_OM_PAYLOAD.address.includes('tỉnh Vĩnh Long'));
  assert.ok(REHAB_AO_BA_OM_PAYLOAD.address.includes('phường Nguyệt Hóa'));
});

runTest('2.2 Nguồn gốc xác thực đầy đủ và liên kết Báo Nhân Dân / OSM relation', () => {
  assert.ok(AO_BA_OM_SOURCES.identity.source_url.includes('nhandan.vn'));
  assert.ok(AO_BA_OM_SOURCES.coordinates.source_url.includes('openstreetmap.org/relation/11831818'));
  assert.strictEqual(REHAB_AO_BA_OM_PAYLOAD.coordinates, '9.9347,106.3449');
});

// 3. Thẩm định Contract Schema (validatePlace)
console.log('\n--- 3. Thẩm Định Hợp Đồng Schema (validatePlace) ---');

runTest('3.1 validatePlace đạt 100% ở chế độ draft', () => {
  const vDraft = validatePlace(REHAB_AO_BA_OM_PAYLOAD, { mode: 'draft' });
  assert.strictEqual(vDraft.valid, true);
  assert.strictEqual(vDraft.errors.length, 0);
  assert.strictEqual(vDraft.warnings.length, 4);
});

runTest('3.2 validatePlace đạt 100% ở chế độ approval', () => {
  const vApprove = validatePlace(REHAB_AO_BA_OM_PAYLOAD, { mode: 'approval' });
  assert.strictEqual(vApprove.valid, true);
  assert.strictEqual(vApprove.errors.length, 0);
  assert.strictEqual(vApprove.warnings.length, 4);
});

// 4. Kiểm tra Snapshot Manifest & Rollback Plan
console.log('\n--- 4. Kiểm Tra Snapshot Manifest & Rollback Plan ---');

runTest('4.1 savePreRehabSnapshot tạo manifest đầy đủ kèm rollback payload nguyên trạng', () => {
  const tmpBackups = fs.mkdtempSync(path.join(os.tmpdir(), 'vivu-step2-snap-'));
  const mockRecord = {
    id: AO_BA_OM_ID,
    name: 'Ao Bà Om',
    slug: 'ao-ba-om',
    rating: 5,
    note: 'Nên đi buổi sáng...',
    status: 'approved',
    updated_at: '2026-09-23T00:00:00Z'
  };

  const { manifestPath, manifest } = savePreRehabSnapshot(mockRecord, { backupsDir: tmpBackups });
  assert.ok(fs.existsSync(manifestPath));
  assert.strictEqual(manifest.target_id, AO_BA_OM_ID);
  assert.strictEqual(manifest.rollback_payload.rating, 5);
  assert.strictEqual(manifest.rollback_payload.note, 'Nên đi buổi sáng...');

  fs.rmSync(tmpBackups, { recursive: true, force: true });
});

// 5. Kiểm tra Cơ Chế Dry-Run (Zero Mutation)
console.log('\n--- 5. Kiểm Tra Cơ Chế Dry-Run (Zero Mutation) ---');

await runAsyncTest('5.1 executeStep2RehabAoBaOm không cờ tự động rơi vào Dry-Run (mutated = false)', async () => {
  const result = await executeStep2RehabAoBaOm({
    args: [],
    backupsDir: fs.mkdtempSync(path.join(os.tmpdir(), 'vivu-step2-dry-'))
  });
  assert.strictEqual(result.dryRun, true);
  assert.strictEqual(result.mutated, false);
});

await runAsyncTest('5.2 executeStep2RehabAoBaOm chỉ có --execute thiếu --confirm vẫn là Dry-Run', async () => {
  const result = await executeStep2RehabAoBaOm({
    args: ['--execute'],
    backupsDir: fs.mkdtempSync(path.join(os.tmpdir(), 'vivu-step2-dry-'))
  });
  assert.strictEqual(result.dryRun, true);
  assert.strictEqual(result.mutated, false);
});

await runAsyncTest('5.3 executeStep2RehabAoBaOm chỉ có --confirm thiếu --execute vẫn là Dry-Run', async () => {
  const result = await executeStep2RehabAoBaOm({
    args: ['--confirm'],
    backupsDir: fs.mkdtempSync(path.join(os.tmpdir(), 'vivu-step2-dry-'))
  });
  assert.strictEqual(result.dryRun, true);
  assert.strictEqual(result.mutated, false);
});

console.log('\n========================================');
console.log(`BỘ KIỂM THỬ BƯỚC 2: ${passedTests}/${totalTests} PASS`);
console.log('========================================\n');
