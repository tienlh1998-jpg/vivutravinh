// scripts/test-g9-step4.js
// Bộ kiểm thử tự động cho quy trình G9.4 Bước 4: 3 Ứng viên Mở rộng
// (Chùa Hang, Du Lịch Cộng Đồng Cồn Chim, Chùa Vàm Rây)
// Khẳng định 100% tiêu chuẩn an toàn Fail-Closed, Zero-Speculation, Sourcing & Schema.

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { validatePlace } from '../js/place-validator.js';
import { loadStep4Candidate } from './preview-g9-step4-candidate.js';
import { savePreCreationManifest } from './execute-g9-step4-candidate.js';

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

console.log('======================================================================');
console.log('🧪 BỘ KIỂM THỬ TỰ ĐỘNG G9.4 BƯỚC 4: 3 ỨNG VIÊN MỞ RỘNG');
console.log('======================================================================\n');

const CANDIDATE_SLUGS = ['chua-hang', 'con-chim', 'chua-vam-ray'];

for (const slug of CANDIDATE_SLUGS) {
  console.log(`--- Kiểm Tra Hồ Sơ Ứng Viên [${slug}] ---`);
  const { candidate } = loadStep4Candidate(slug);

  runTest(`1. [${slug}] Nạp đúng cấu trúc ứng viên`, () => {
    assert.strictEqual(candidate.slug, slug);
    assert.ok(candidate.name && candidate.name.length > 3);
    assert.strictEqual(candidate.actionType, 'create');
    assert.strictEqual(candidate.targetId, null);
    assert.strictEqual(candidate.client_submission_id, `g9-4-create-${slug}`);
  });

  runTest(`2. [${slug}] Nguồn gốc báo chí chính thống & OSM`, () => {
    const fsSources = candidate.field_sources;
    assert.ok(fsSources.name.source_url);
    assert.ok(fsSources.name.source_url.includes('nhandan.vn'));
    assert.ok(fsSources.coordinates.source_url);
    assert.ok(fsSources.coordinates.source_url.includes('openstreetmap.org'));
    assert.ok(fsSources.description.source_url.includes('nhandan.vn'));
  });

  runTest(`3. [${slug}] Địa chỉ tuân thủ Nghị quyết 1687/NQ-UBTVQH15 (tỉnh Vĩnh Long)`, () => {
    assert.ok(candidate.draft_payload.address.includes('tỉnh Vĩnh Long'));
  });

  runTest(`4. [${slug}] Tuân thủ 100% Zero-Speculation`, () => {
    const p = candidate.draft_payload;
    assert.strictEqual(p.price_raw, null, 'price_raw phải là null');
    assert.strictEqual(p.rating, null, 'rating phải là null');
    assert.strictEqual(p.opening_time, null, 'opening_time phải là null');
    assert.strictEqual(p.closing_time, null, 'closing_time phải là null');
    assert.strictEqual(p.contact, null, 'contact phải là null');
    assert.deepStrictEqual(p.images, [], 'images phải là mảng rỗng []');
  });

  runTest(`5. [${slug}] Thẩm định Schema contract: 0 error, 4 warnings kiểm soát`, () => {
    const vDraft = validatePlace(candidate.draft_payload, { mode: 'draft' });
    assert.strictEqual(vDraft.valid, true);
    assert.strictEqual(vDraft.errors.length, 0);
    assert.strictEqual(vDraft.warnings.length, 4);

    const vApprove = validatePlace({ ...candidate.draft_payload, status: 'approved' }, { mode: 'approval' });
    assert.strictEqual(vApprove.valid, true);
    assert.strictEqual(vApprove.errors.length, 0);
    assert.strictEqual(vApprove.warnings.length, 4);
  });

  runTest(`6. [${slug}] Snapshot manifest và kế hoạch rollback hợp lệ`, () => {
    const tmpBackups = fs.mkdtempSync(path.join(os.tmpdir(), `vivu_test_backups_${slug}_`));
    try {
      const { manifestPath, manifest } = savePreCreationManifest(candidate, [], { backupsDir: tmpBackups });
      assert.ok(fs.existsSync(manifestPath));
      assert.strictEqual(manifest.target_slug, slug);
      assert.strictEqual(manifest.rollback_strategy.action, 'archive');
      assert.strictEqual(manifest.rollback_strategy.client_submission_id, `g9-4-create-${slug}`);
      assert.ok(manifest.checksum_sha256);
    } finally {
      fs.rmSync(tmpBackups, { recursive: true, force: true });
    }
  });
}

console.log('\n======================================================================');
console.log(`🎉 TẤT CẢ ${passedTests}/${totalTests} BÀI KIỂM THỬ BƯỚC 4 ĐÃ PASS 100%!`);
console.log('======================================================================\n');
