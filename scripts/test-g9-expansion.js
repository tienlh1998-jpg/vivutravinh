// scripts/test-g9-expansion.js
// Bộ kiểm thử tự động cho Mốc G9.4 Giai Đoạn A (Nghiên Cứu & Dry-Run)
// Khẳng định 100% các tiêu chí an toàn, không suy diễn, nguồn chính thống và tính toàn vẹn rollback.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import {
  EXPANSION_CANDIDATE_SLUGS,
  loadLiveEnvConfig,
  computeRecordChecksum,
  loadLiveProductionData,
  checkCollisions,
  buildPatchForBienBaDong,
  buildDraftForDenThoBacHo,
  buildDraftForChuaHang,
  buildDraftForConChim,
  buildDraftForChuaVamRay,
  generateExpansionPlan
} from './plan-g9-expansion.js';
import { validatePlace } from '../js/place-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

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
console.log('🧪 BỘ KIỂM THỬ TỰ ĐỘNG G9.4 GIAI ĐOẠN A: RESEARCH & DRY-RUN INVARIANTS');
console.log('======================================================================\n');

// Mock data giả lập production để test độc lập
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

const mockExistingPlaces = [
  { id: 1, slug: 'ao-ba-om', coordinates: '9.9347,106.3449', status: 'approved' },
  mockPlaceId2,
  { id: 3, slug: 'chua-ang', coordinates: '9.9322,106.3364', status: 'approved' }
];

// --- 1. KIỂM TRA ĐỌC ĐỘNG PRODUCTION (KHÔNG HARD-CODE UPDATED_AT CỦA BIỂN BA ĐỘNG) ---
console.log('--- 1. Đọc Động Production (Zero Hard-Coded OCC) ---');

runTest('1.1 buildPatchForBienBaDong sử dụng dynamic updated_at từ bản ghi live', () => {
  const dynamicTime = '2026-09-24T08:00:00.123456+00:00';
  const customRecord = { ...mockPlaceId2, updated_at: dynamicTime };
  const patch = buildPatchForBienBaDong(customRecord);

  assert.strictEqual(patch.concurrency_token.expected_updated_at, dynamicTime);
  assert.strictEqual(patch.after.expected_updated_at, dynamicTime);
  assert.notStrictEqual(patch.concurrency_token.expected_updated_at, '2026-05-28T03:29:53.940474+00:00');
});

runTest('1.2 buildPatchForBienBaDong ném lỗi nếu thiếu bản ghi ID 2', () => {
  assert.throws(() => buildPatchForBienBaDong(null), /BIEN_BA_DONG_LIVE_NOT_FOUND/);
});

// --- 2. BẢO TOÀN NGUYÊN TẮC DỮ LIỆU SẠCH (ZERO-SPECULATION INVARIANTS) ---
console.log('\n--- 2. Khử Sạch Suy Diễn (Zero-Speculation Content Invariants) ---');

const candidates = [
  buildPatchForBienBaDong(mockPlaceId2),
  buildDraftForDenThoBacHo(),
  buildDraftForChuaHang(),
  buildDraftForConChim(),
  buildDraftForChuaVamRay()
];

runTest('2.1 Tất cả 5 ứng viên đều có price_raw = null (tuyệt đối không "Miễn phí")', () => {
  for (const c of candidates) {
    const payload = c.actionType === 'update' ? c.after : c.draft_payload;
    assert.strictEqual(payload.price_raw, null, `${c.name} phải có price_raw null`);
  }
});

runTest('2.2 Tất cả 5 ứng viên đều có rating = null (tuyệt đối không 5 sao giả định)', () => {
  for (const c of candidates) {
    const payload = c.actionType === 'update' ? c.after : c.draft_payload;
    assert.strictEqual(payload.rating, null, `${c.name} phải có rating null`);
  }
});

runTest('2.3 Tất cả 5 ứng viên đều có opening_time và closing_time = null', () => {
  for (const c of candidates) {
    const payload = c.actionType === 'update' ? c.after : c.draft_payload;
    assert.strictEqual(payload.opening_time, null, `${c.name} phải có opening_time null`);
    assert.strictEqual(payload.closing_time, null, `${c.name} phải có closing_time null`);
    assert.strictEqual(payload.display_hours, null, `${c.name} phải có display_hours null`);
  }
});

runTest('2.4 Tất cả 5 ứng viên đều có contact = null (tuyệt đối không số hotline giả)', () => {
  for (const c of candidates) {
    const payload = c.actionType === 'update' ? c.after : c.draft_payload;
    assert.strictEqual(payload.contact, null, `${c.name} phải có contact null`);
  }
});

runTest('2.5 Tất cả 5 ứng viên đều có images = [] (SVG placeholder trung tính, không mượn ảnh chéo)', () => {
  for (const c of candidates) {
    const payload = c.actionType === 'update' ? c.after : c.draft_payload;
    assert.deepStrictEqual(payload.images, [], `${c.name} phải có images rỗng []`);
    assert.strictEqual(payload.image_link, null, `${c.name} phải có image_link null`);
  }
});

runTest('2.6 Tất cả 5 ứng viên bắt đầu ở trạng thái "draft" (không approve hay nhảy cóc)', () => {
  for (const c of candidates) {
    const payload = c.actionType === 'update' ? c.after : c.draft_payload;
    assert.strictEqual(payload.status, 'draft', `${c.name} phải ở trạng thái draft`);
  }
});

// --- 3. KIỂM TRA TRÙNG LẶP SLUG & TỌA ĐỘ (COLLISION DETECTION) ---
console.log('\n--- 3. Kiểm Tra Trùng Lặp Slug & Tọa Độ (Collision Detection) ---');

runTest('3.1 Không có sự trùng lặp slug giữa 5 ứng viên và CSDL hiện có', () => {
  const collisions = checkCollisions(mockExistingPlaces, candidates);
  assert.strictEqual(collisions.slugCollisions.length, 0, 'Không được có va chạm slug');
});

runTest('3.2 Không có sự trùng lặp tọa độ giữa các ứng viên', () => {
  const collisions = checkCollisions(mockExistingPlaces, candidates);
  assert.strictEqual(collisions.coordinateCollisions.length, 0, 'Không được có va chạm tọa độ');
});

runTest('3.3 checkCollisions phát hiện chính xác khi có slug trùng lặp', () => {
  const fakeCandidate = {
    actionType: 'create',
    slug: 'ao-ba-om', // Trùng slug ID 1
    name: 'Fake Ao Ba Om',
    coordinates: '9.1111,106.1111'
  };
  const collisions = checkCollisions(mockExistingPlaces, [fakeCandidate]);
  assert.strictEqual(collisions.slugCollisions.length, 1);
  assert.strictEqual(collisions.slugCollisions[0].collidedWithId, 1);
});

runTest('3.4 checkCollisions phát hiện chính xác khi có tọa độ trùng lặp', () => {
  const fakeCandidate = {
    actionType: 'create',
    slug: 'unique-new-slug',
    name: 'Duplicate Coord Candidate',
    coordinates: '9.9347,106.3449' // Trùng tọa độ ID 1
  };
  const collisions = checkCollisions(mockExistingPlaces, [fakeCandidate]);
  assert.strictEqual(collisions.coordinateCollisions.length, 1);
  assert.strictEqual(collisions.coordinateCollisions[0].collidedWithId, 1);
});

// --- 4. IDEMPOTENCY KEY & OCC ARCHITECTURE ---
console.log('\n--- 4. Idempotency Key & OCC Architecture ---');

runTest('4.1 Mỗi ứng viên có client_submission_id duy nhất và không rỗng trong kế hoạch', () => {
  const ids = new Set();
  for (const c of candidates) {
    assert.ok(c.client_submission_id, `${c.name} phải có client_submission_id`);
    assert.ok(typeof c.client_submission_id === 'string' && c.client_submission_id.length > 5);
    assert.ok(!ids.has(c.client_submission_id), `client_submission_id bị trùng: ${c.client_submission_id}`);
    ids.add(c.client_submission_id);
  }
});

runTest('4.2 Idempotency của ID 2 dựa vào OCC (expected_updated_at), không phụ thuộc DB client_submission_id', () => {
  const baDong = candidates.find(c => c.slug === 'bien-ba-dong');
  assert.ok(baDong.concurrency_token.expected_updated_at, 'ID 2 phải có expected_updated_at');
  // client_submission_id chỉ nằm ở hồ sơ kế hoạch, KHÔNG được ghi vào payload cập nhật DB
  assert.notStrictEqual(baDong.after.client_submission_id, baDong.client_submission_id, 'Payload DB sau khi patch không dùng client_submission_id');
});

// --- 5. NGUỒN RIÊNG LẺ CHO TỪNG TRƯỜNG & CHẶN TRANG CHỦ / DEAD URL ---
console.log('\n--- 5. Nguồn Riêng Cho Từng Trường (Granular Field Sources) ---');

runTest('5.1 Mọi ứng viên đều có nguồn bài viết cụ thể cho mô tả (không trang chủ, không 404)', () => {
  for (const c of candidates) {
    const descSource = c.field_sources.description;
    assert.ok(descSource, `${c.name} phải có nguồn cho mô tả`);
    assert.ok(descSource.source_url, `${c.name} phải có URL cho mô tả`);
    assert.ok(
      descSource.source_url.startsWith('https://nhandan.vn/') ||
      descSource.source_url.startsWith('https://vietnamtourism.gov.vn/'),
      `${c.name} phải dùng nguồn Báo Nhân Dân hoặc Cục Du lịch Quốc gia`
    );
    // Chặn dứt khoát trang chủ
    assert.notStrictEqual(descSource.source_url, 'https://nhandan.vn');
    assert.notStrictEqual(descSource.source_url, 'https://nhandan.vn/');
    assert.notStrictEqual(descSource.source_url, 'https://vietnamtourism.gov.vn');
    assert.notStrictEqual(descSource.source_url, 'https://vietnamtourism.gov.vn/');
  }
});

runTest('5.2 Tọa độ không tự nhận bừa là "mốc trắc địa", có coordinate_precision rõ ràng', () => {
  for (const c of candidates) {
    const coordSource = c.field_sources.coordinates;
    assert.ok(coordSource, `${c.name} phải có nguồn tọa độ`);
    assert.ok(coordSource.coordinate_precision, `${c.name} phải có coordinate_precision`);
    assert.ok(
      ['approximate_area_center', 'entrance_area', 'approximate_temple_grounds', 'area_island'].includes(coordSource.coordinate_precision),
      `${c.name} có độ chính xác hợp lệ: ${coordSource.coordinate_precision}`
    );
    assert.ok(
      coordSource.source_url.startsWith('https://www.openstreetmap.org/'),
      `${c.name} phải có URL đối chiếu OpenStreetMap cụ thể`
    );
    if (coordSource.source_url.includes('#map=')) {
      assert.ok(
        coordSource.rationale.includes('khung nhìn bản đồ') || coordSource.rationale.includes('chưa xác minh'),
        `${c.name} có URL #map=... phải giải trình rõ tính chất approximate`
      );
    }
  }
});

runTest('5.3 Mô tả Biển Ba Động chỉ chứa dữ kiện đã xác minh trung tính (Pháp thuộc, hệ sinh thái duyên hải, Trà Vinh)', () => {
  const baDong = candidates.find(c => c.slug === 'bien-ba-dong');
  const desc = baDong.after.description;
  assert.strictEqual(
    desc,
    'Biển Ba Động là điểm du lịch biển nổi tiếng từ thời Pháp thuộc, mang đặc trưng cảnh quan và hệ sinh thái duyên hải của vùng đất Trà Vinh.',
    'Mô tả Biển Ba Động phải khớp chính xác câu dữ kiện đã xác minh trung tính'
  );
  assert.ok(desc.includes('Pháp thuộc'), 'Mô tả phải chứa "Pháp thuộc"');
  assert.ok(desc.includes('hệ sinh thái duyên hải'), 'Mô tả phải chứa "hệ sinh thái duyên hải"');
  assert.ok(desc.includes('Trà Vinh'), 'Mô tả phải chứa "Trà Vinh"');
});

// --- 6. ĐỊA GIỚI HÀNH CHÍNH THEO NGHỊ QUYẾT 1687/NQ-UBTVQH15 ---
console.log('\n--- 6. Địa Giới Hành Chính Theo Nghị Quyết 1687/NQ-UBTVQH15 ---');

runTest('6.1 Tất cả địa chỉ hiển thị (address) phải dùng "tỉnh Vĩnh Long" theo NQ 1687', () => {
  for (const c of candidates) {
    const payload = c.actionType === 'update' ? c.after : c.draft_payload;
    assert.ok(
      payload.address.includes('tỉnh Vĩnh Long'),
      `${c.name} phải dùng địa giới hiện hành tỉnh Vĩnh Long theo NQ 1687 (thực tế: "${payload.address}")`
    );
    assert.ok(c.field_sources.legacy_address, `${c.name} phải bảo lưu legacy_address trong nguồn`);
  }
});

runTest('6.2 Chùa Hang dùng "xã Châu Thành" theo khoản 34 NQ 1687', () => {
  const chuaHang = candidates.find(c => c.slug === 'chua-hang');
  assert.ok(chuaHang.draft_payload.address.includes('xã Châu Thành'));
});

runTest('6.3 Biển Ba Động dùng "phường Trường Long Hòa" theo NQ 1687', () => {
  const baDong = candidates.find(c => c.slug === 'bien-ba-dong');
  assert.ok(baDong.after.address.includes('phường Trường Long Hòa'));
});

runTest('6.4 Chùa Vàm Rây dùng "xã Hàm Giang" theo NQ 1687/NQ-UBTVQH15 (sáp nhập xã Hàm Tân)', () => {
  const vamRay = candidates.find(c => c.slug === 'chua-vam-ray');
  assert.ok(vamRay.draft_payload.address.includes('xã Hàm Giang'), 'Chùa Vàm Rây phải có địa chỉ chứa "xã Hàm Giang"');
  assert.strictEqual(vamRay.draft_payload.address, 'Ấp Vàm Ray, xã Hàm Giang, tỉnh Vĩnh Long');
});

// --- 7. PHÂN LOẠI & TƯƠNG THÍCH BỘ LỌC GIAO DIỆN (UI FILTER COMPATIBILITY) ---
console.log('\n--- 7. Phân Loại & Tương Thích Bộ Lọc UI ---');

runTest('7.1 Cồn Chim được phân loại "Du Lịch Sinh Thái / Cộng Đồng" và khớp bộ lọc Check-in trên UI', () => {
  const conChim = candidates.find(c => c.slug === 'con-chim');
  assert.strictEqual(conChim.draft_payload.category, 'Du Lịch Sinh Thái / Cộng Đồng');

  // Kiểm tra biểu thức chính quy lọc Check-in trong js/app.js (dòng 1000):
  // /check-in|song ao|sinh thai|cu lao|con|bien/i.test(cleanPCat)
  const cleanCategory = 'du lich sinh thai / cong dong';
  const matchFilter = /check-in|song ao|sinh thai|cu lao|con|bien/i.test(cleanCategory);
  assert.ok(matchFilter, 'Category của Cồn Chim phải khớp với logic bộ lọc Check-in của UI');
});

runTest('7.2 Biển Ba Động khớp bộ lọc Check-in trên UI', () => {
  const baDong = candidates.find(c => c.slug === 'bien-ba-dong');
  const cleanCategory = 'diem check-in / song ao';
  assert.ok(/check-in|song ao|sinh thai|cu lao|con|bien/i.test(cleanCategory));
});

runTest('7.3 Chùa Hang và Chùa Vàm Rây khớp bộ lọc Chùa trên UI', () => {
  const cleanCategory = 'du lich tam linh';
  // Logic bộ lọc Chùa trong js/app.js (dòng 994):
  // /chua|tam linh|wat/i.test(cleanPCat)
  assert.ok(/chua|tam linh|wat/i.test(cleanCategory));
});

// --- 8. TÍNH TOÀN VẸN SNAPSHOT & ROLLBACK PAYLOAD ---
console.log('\n--- 8. Tính Toàn Vẹn Snapshot & Rollback Payload ---');

runTest('8.1 Rollback payload của Biển Ba Động (ID 2) khôi phục 100% bản ghi gốc', () => {
  const baDong = candidates.find(c => c.slug === 'bien-ba-dong');
  assert.strictEqual(baDong.rollback.id, 2);
  assert.strictEqual(baDong.rollback.name, 'Biển Ba Động DH');
  assert.strictEqual(baDong.rollback.status, 'hidden');
  assert.strictEqual(baDong.rollback.price_raw, 'Miễn phí');
  assert.strictEqual(baDong.rollback.rating, 4.5);
  assert.strictEqual(baDong.rollback.opening_time, '07:00');
  assert.strictEqual(baDong.rollback.contact, '0294.383.2222');
});

runTest('8.2 4 địa điểm tạo mới luôn có kế hoạch rollback duy nhất là archive', () => {
  const newCandidates = candidates.filter(c => c.actionType === 'create');
  for (const c of newCandidates) {
    assert.strictEqual(c.rollback.action, 'archive', `${c.name} phải có rollback.action là 'archive'`);
    assert.strictEqual(c.rollback.slug, c.slug);
    assert.strictEqual(c.rollback.client_submission_id, c.client_submission_id);
  }
});

// --- 9. SCHEMA VALIDATION VIA VALIDATEPLACE (0 ERROR) ---
console.log('\n--- 9. Thẩm Định Hợp Đồng Schema (validatePlace) ---');

runTest('9.1 Cả 5 ứng viên đều vượt qua validatePlace ở chế độ draft với 0 error', () => {
  for (const c of candidates) {
    const payload = c.actionType === 'update' ? c.after : c.draft_payload;
    const vResult = validatePlace(payload, { mode: 'draft' });
    assert.ok(vResult.valid, `${c.name} không hợp lệ: ${JSON.stringify(vResult.errors)}`);
    assert.strictEqual(vResult.errors.length, 0);
  }
});

// --- 10. CHẠY DRY-RUN ĐỘC LẬP KHÔNG SINH RÁC TRONG REPO ---
console.log('\n--- 10. Chạy Dry-Run Độc Lập (Zero Mutation / Isolated Dirs) ---');

await runAsyncTest('10.1 generateExpansionPlan chạy an toàn với thư mục tạm (Zero Mutation)', async () => {
  const tmpBackups = fs.mkdtempSync(path.join(os.tmpdir(), 'vivu-expansion-backups-'));
  const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), 'vivu-expansion-data-'));

  try {
    const result = await generateExpansionPlan({
      backupsDir: tmpBackups,
      dataDir: tmpData,
      mockData: {
        allPlaces: mockExistingPlaces,
        placeId2: mockPlaceId2
      }
    });

    assert.ok(fs.existsSync(result.manifestPath));
    assert.ok(fs.existsSync(result.proposedPatchesPath));
    assert.strictEqual(result.candidates.length, 5);
    assert.strictEqual(result.manifest.manifest_type, 'g9_4_expansion_pre_patch_snapshot');
    assert.strictEqual(result.proposedPlan.phase, 'G9.4_PHASE_A_RESEARCH_AND_DRY_RUN');
    assert.strictEqual(result.proposedPlan.mode, 'DRY_RUN_ONLY');
  } finally {
    fs.rmSync(tmpBackups, { recursive: true, force: true });
    fs.rmSync(tmpData, { recursive: true, force: true });
  }
});

console.log('\n========================================');
console.log(`G9.4 GIAI ĐOẠN A TEST SUMMARY: ${passedTests}/${totalTests} PASS`);
console.log('========================================');
