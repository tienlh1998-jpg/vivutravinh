// scripts/test-g9-den-tho-bac-ho.js
// Bộ kiểm thử tự động cho quy trình G9.4-C1: Đền thờ Bác Hồ Trà Vinh
// Khẳng định 100% tiêu chuẩn an toàn Fail-Closed, Zero Production Mutation, Nguồn xác thực & Preview.

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { validatePlace } from '../js/place-validator.js';
import {
  loadProposedCandidate,
  checkLiveCollisions,
  savePreCreateSnapshot
} from './preview-g9-den-tho-bac-ho.js';
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
console.log('🧪 BỘ KIỂM THỬ TỰ ĐỘNG G9.4-C1: ĐỀN THỜ BÁC HỒ TRÀ VINH');
console.log('======================================================================\n');

// 1. Kiểm tra Hồ sơ Đề xuất & Nguồn gốc
console.log('--- 1. Kiểm Tra Hồ Sơ Đề Xuất & Nguồn Gốc Xác Thực ---');

const { candidate } = loadProposedCandidate();

runTest('1.1 loadProposedCandidate nạp đúng ứng viên den-tho-bac-ho-tra-vinh', () => {
  assert.strictEqual(candidate.slug, 'den-tho-bac-ho-tra-vinh');
  assert.strictEqual(candidate.name, 'Đền thờ Bác Hồ Trà Vinh');
  assert.strictEqual(candidate.actionType, 'create');
  assert.strictEqual(candidate.targetId, null);
  assert.strictEqual(candidate.client_submission_id, 'g9-4-create-den-tho-bac-ho-tra-vinh');
});

runTest('1.2 Nguồn tên & mô tả xuất phát từ bài viết cụ thể Báo Nhân Dân (không trang chủ, không 404)', () => {
  const fsSources = candidate.field_sources;
  assert.ok(fsSources.name.source_url);
  assert.ok(fsSources.name.source_url.includes('nhandan.vn/den-tho-bac-ho-o-tra-vinh-bieu-tuong-long-dan-nam-bo-post647000.html'));
  assert.ok(fsSources.description.source_url);
  assert.ok(fsSources.description.source_url.includes('nhandan.vn'));
  assert.ok(candidate.draft_payload.description.includes('Di tích lịch sử cấp Quốc gia'));
});

runTest('1.3 Nguồn tọa độ trỏ đúng OSM way di tích khuôn viên (không mốc giả định)', () => {
  const fsSources = candidate.field_sources;
  assert.ok(fsSources.coordinates.source_url.includes('openstreetmap.org/way/451892019'));
  assert.strictEqual(fsSources.coordinates.coordinate_precision, 'entrance_area');
  assert.strictEqual(candidate.draft_payload.coordinates, '9.9705,106.3382');
});

runTest('1.4 Địa giới hành chính tuân thủ Nghị quyết 1687/NQ-UBTVQH15', () => {
  assert.ok(candidate.draft_payload.address.includes('tỉnh Vĩnh Long'));
  assert.ok(candidate.draft_payload.address.includes('phường Long Đức'));
});

// 2. Kiểm tra Nguyên Tắc Không Suy Diễn Dữ Liệu (Zero-Speculation)
console.log('\n--- 2. Kiểm Tra Nguyên Tắc Không Suy Diễn (Zero-Speculation) ---');

runTest('2.1 price_raw phải là null (tuyệt đối không "Miễn phí")', () => {
  assert.strictEqual(candidate.draft_payload.price_raw, null);
});

runTest('2.2 rating phải là null (tuyệt đối không fake 5 sao)', () => {
  assert.strictEqual(candidate.draft_payload.rating, null);
});

runTest('2.3 opening_time, closing_time và display_hours phải là null', () => {
  assert.strictEqual(candidate.draft_payload.opening_time, null);
  assert.strictEqual(candidate.draft_payload.closing_time, null);
  assert.strictEqual(candidate.draft_payload.display_hours, null);
});

runTest('2.4 contact và note phải là null (không hotline giả mạo)', () => {
  assert.strictEqual(candidate.draft_payload.contact, null);
  assert.strictEqual(candidate.draft_payload.note, null);
});

runTest('2.5 images phải là mảng rỗng [] (placeholder trung tính SVG, không mượn ảnh chéo)', () => {
  assert.deepStrictEqual(candidate.draft_payload.images, []);
  assert.strictEqual(candidate.draft_payload.image_link, null);
});

runTest('2.6 status bắt đầu ở trạng thái "draft" (tuyệt đối chưa approve)', () => {
  assert.strictEqual(candidate.draft_payload.status, 'draft');
});

// 3. Kiểm định Contract Schema (validatePlace)
console.log('\n--- 3. Thẩm Định Tiêu Chuẩn Dữ Liệu (validatePlace) ---');

runTest('3.1 validatePlace ở chế độ draft: 0 error, đúng 4 warnings kiểm soát', () => {
  const result = validatePlace(candidate.draft_payload, { mode: 'draft' });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.errors.length, 0);
  assert.strictEqual(result.warnings.length, 4);

  const warnCodes = result.warnings.map(w => w.code).sort();
  assert.deepStrictEqual(warnCodes, [
    'WARN_MISSING_CONTACT',
    'WARN_MISSING_HOURS',
    'WARN_MISSING_IMAGES',
    'WARN_MISSING_PRICE'
  ]);
});

runTest('3.2 validatePlace ở chế độ approval: 0 error bắt buộc (sẵn sàng duyệt khi đủ điều kiện)', () => {
  const result = validatePlace({ ...candidate.draft_payload, status: 'approved' }, { mode: 'approval' });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.errors.length, 0);
});

// 4. Kiểm tra Snapshot Manifest & Kế Hoạch Rollback
console.log('\n--- 4. Kiểm Tra Snapshot & Kế Hoạch Rollback ---');

runTest('4.1 savePreCreateSnapshot tạo manifest chuẩn với rollback action=archive', () => {
  const tmpBackups = fs.mkdtempSync(path.join(os.tmpdir(), 'vivu-snap-bac-ho-test-'));
  try {
    const mockCollision = { totalLivePlaces: 9, hasCollision: false };
    const { manifestPath, manifest } = savePreCreateSnapshot(candidate, mockCollision, { backupsDir: tmpBackups });

    assert.ok(fs.existsSync(manifestPath));
    assert.strictEqual(manifest.target_id, null);
    assert.strictEqual(manifest.slug, 'den-tho-bac-ho-tra-vinh');
    assert.strictEqual(manifest.client_submission_id, 'g9-4-create-den-tho-bac-ho-tra-vinh');
    assert.strictEqual(manifest.rollback_strategy.action, 'archive');
    assert.strictEqual(manifest.draft_checksum_sha256, computeRecordChecksum(candidate.draft_payload));
  } finally {
    fs.rmSync(tmpBackups, { recursive: true, force: true });
  }
});

// 5. Kiểm tra Đối Soát Xung Đột (Collision Detection)
console.log('\n--- 5. Kiểm Tra Đối Soát Xung Đột (Collision Detection) ---');

await runAsyncTest('5.1 checkLiveCollisions phát hiện trùng lặp slug', async () => {
  const mockPlaces = [{ id: 101, slug: 'den-tho-bac-ho-tra-vinh', coordinates: '9.000,106.000' }];
  const res = await checkLiveCollisions(candidate, { mockLivePlaces: mockPlaces });
  assert.strictEqual(res.hasCollision, true);
  assert.ok(res.slugCollision);
});

await runAsyncTest('5.2 checkLiveCollisions phát hiện trùng lặp tọa độ', async () => {
  const mockPlaces = [{ id: 102, slug: 'khac-slug', coordinates: '9.9705,106.3382' }];
  const res = await checkLiveCollisions(candidate, { mockLivePlaces: mockPlaces });
  assert.strictEqual(res.hasCollision, true);
  assert.ok(res.coordCollision);
});

await runAsyncTest('5.3 checkLiveCollisions xác nhận an toàn khi không có xung đột', async () => {
  const mockPlaces = [{ id: 1, slug: 'ao-ba-om', coordinates: '9.9500,106.3100' }];
  const res = await checkLiveCollisions(candidate, { mockLivePlaces: mockPlaces });
  assert.strictEqual(res.hasCollision, false);
});

// 6. Kiểm tra An Toàn Mã Nguồn (Zero Production Mutation Invariants)
console.log('\n--- 6. Kiểm Tra An Toàn Mã Nguồn (Zero Production Mutation) ---');

runTest('6.1 scripts/preview-g9-den-tho-bac-ho.js TUYỆT ĐỐI không gọi RPC admin_create_place_atomic', () => {
  const code = fs.readFileSync(path.join(REPO_ROOT, 'scripts/preview-g9-den-tho-bac-ho.js'), 'utf8');
  assert.ok(!code.includes('admin_create_place_atomic'), 'Không được chứa lời gọi admin_create_place_atomic trong kịch bản preview');
  assert.ok(!code.includes('admin_update_place_atomic'), 'Không được chứa lời gọi admin_update_place_atomic trong kịch bản preview');
});

runTest('6.2 Kịch bản preview không chứa JWT anon key hard-code', () => {
  const code = fs.readFileSync(path.join(REPO_ROOT, 'scripts/preview-g9-den-tho-bac-ho.js'), 'utf8');
  assert.ok(!code.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), 'Tuyệt đối không hard-code anon JWT');
  assert.ok(code.includes('CONFIG_SUPABASE_ANON_KEY'), 'Phải import anon key từ cấu hình');
});

console.log('\n========================================');
console.log(`BỘ KIỂM THỬ ĐỀN THỜ BÁC HỒ: ${passedTests}/${totalTests} PASS`);
console.log('========================================');
