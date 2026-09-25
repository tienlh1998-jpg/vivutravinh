// scripts/test-g9-step6-food.js
// Bộ kiểm thử tự động cho quy trình G9.4 Bước 6: Xử lý 3 món ẩm thực / đặc sản
// (Bún Nước Lèo Cô Ba, Bánh Tét Trà Cuôn Hai Lý, Dừa Sáp Cầu Kè Út Nhi)
// Khẳng định 100% Zero-Speculation và cơ chế giữ trạng thái draft khi chưa đủ nguồn.

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { validatePlace } from '../js/place-validator.js';
import { FOOD_CANDIDATES, saveStep6Manifest } from './execute-g9-step6-food-drafts.js';

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

console.log('======================================================================');
console.log('🧪 BỘ KIỂM THỬ TỰ ĐỘNG G9.4 BƯỚC 6: 3 ỨNG VIÊN ẨM THỰC / ĐẶC SẢN');
console.log('======================================================================\n');

runTest('1. Đủ 3 ứng viên ẩm thực theo yêu cầu', () => {
  assert.strictEqual(FOOD_CANDIDATES.length, 3);
  const slugs = FOOD_CANDIDATES.map(c => c.slug);
  assert.ok(slugs.includes('bun-nuoc-leo-co-ba-tra-vinh'));
  assert.ok(slugs.includes('banh-tet-tra-cuon-hai-ly'));
  assert.ok(slugs.includes('dua-sap-cau-ke-ut-nhi'));
});

for (const c of FOOD_CANDIDATES) {
  runTest(`2. [${c.slug}] Quyết định không approve (approved_eligible = false)`, () => {
    assert.strictEqual(c.evaluation.approved_eligible, false);
    assert.ok(c.evaluation.reason.length > 20);
  });

  runTest(`3. [${c.slug}] Tuân thủ 100% Zero-Speculation`, () => {
    assert.strictEqual(c.price_raw, null);
    assert.strictEqual(c.rating, null);
    assert.strictEqual(c.opening_time, null);
    assert.strictEqual(c.closing_time, null);
    assert.strictEqual(c.contact, null);
    assert.deepStrictEqual(c.images, []);
  });

  runTest(`4. [${c.slug}] Đạt chuẩn Schema mode draft`, () => {
    const val = validatePlace(c, { mode: 'draft' });
    assert.strictEqual(val.valid, true);
    assert.strictEqual(val.errors.length, 0);
    assert.strictEqual(val.warnings.length, 4);
  });

  runTest(`5. [${c.slug}] Địa chỉ tuân thủ Nghị quyết 1687/NQ-UBTVQH15 (tỉnh Vĩnh Long)`, () => {
    assert.ok(c.address.includes('tỉnh Vĩnh Long'));
  });
}

runTest('6. Snapshot manifest dự phòng tạo hợp lệ với checksum SHA-256', () => {
  const tmpBackups = fs.mkdtempSync(path.join(os.tmpdir(), 'vivu_test_step6_backups_'));
  try {
    const { manifestPath, manifest } = saveStep6Manifest(FOOD_CANDIDATES, [], { backupsDir: tmpBackups });
    assert.ok(fs.existsSync(manifestPath));
    assert.strictEqual(manifest.candidates.length, 3);
    assert.ok(manifest.checksum_sha256);
  } finally {
    fs.rmSync(tmpBackups, { recursive: true, force: true });
  }
});

console.log('\n======================================================================');
console.log(`🎉 TẤT CẢ ${passedTests}/${totalTests} BÀI KIỂM THỬ BƯỚC 6 ĐÃ PASS 100%!`);
console.log('======================================================================\n');
