#!/usr/bin/env node

/**
 * scripts/test-g9-pilot.js
 *
 * Bộ kiểm thử tự động G9.3A: Thẩm định cấu trúc hợp đồng dữ liệu Pilot (Structural Contract Validation)
 *
 * Lưu ý quan trọng: Bộ kiểm thử này thẩm định tính tuân thủ cấu trúc hợp đồng dữ liệu (schema & contract conformance),
 * KHÔNG thay thế kiểm chứng thực tế ngoài đời (not factual on-ground verification).
 *
 * Các tiêu chuẩn kiểm thử:
 * 1. Chặn source URL chỉ là origin/homepage (bắt buộc deep link đến đúng bài viết/hồ sơ).
 * 2. Bắt buộc có field_sources cho từng field có giá trị cụ thể (khác UNKNOWN).
 * 3. Ràng buộc độ chính xác tọa độ (center, building, approximate không được HIGH; chỉ entrance được HIGH).
 * 4. Chặn phân loại VERIFIED_CANDIDATE / VERIFIED_IDENTITY_CANDIDATE nếu còn xung đột chưa giải quyết.
 * 5. Chặn địa giới hành chính cũ trong current_address theo NQ 1687/NQ-UBTVQH15.
 * 6. Thẩm định timestamp verified_at / accessed_at / checked_at (chặn tương lai & thiếu timezone).
 * 7. Cấm source dead hoặc 404 cho các ứng viên xác minh (VERIFIED_CANDIDATE / VERIFIED_IDENTITY_CANDIDATE).
 * 8. Ràng buộc bằng chứng bao phủ (evidence_scope coverage) cho toàn bộ các trường đạt độ tin cậy HIGH.
 * 9. Thẩm định tính phù hợp giữa extracted_fact và evidence_scope.
 * 10. Loại trừ hoàn toàn ID test cũ (4, 6, 10) và slug thử nghiệm.
 * 11. Phát hiện và chặn trùng lặp Candidate ID hoặc Proposed Slug.
 * 12. Chặn xuất bản ảnh chưa rõ quyền sở hữu trí tuệ (can_publish = false nếu chưa VERIFIED_PERMITTED).
 * 13. Zero Mutation Guard: Chặn toàn bộ HTTP POST, PUT, PATCH, DELETE.
 * 14. Toàn bộ 10 hồ sơ ứng viên đạt 100% thẩm định cấu trúc với phân loại trung thực (Zero inflation).
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  DEFAULT_CANDIDATES_PATH,
  ALLOWED_CATEGORIES,
  ALLOWED_AREAS,
  ALLOWED_RECOMMENDATIONS,
  ALLOWED_CONFIDENCE_LEVELS,
  ALLOWED_SOURCE_STATUS,
  ALLOWED_EVIDENCE_SCOPES,
  ALLOWED_RIGHTS_STATUS,
  ALLOWED_COORDINATE_PRECISION,
  FORBIDDEN_TEST_IDS,
  FORBIDDEN_CURRENT_ADMIN_KEYWORDS,
  KNOWN_MOCK_PHONES,
  checkNoMutationGuard,
  isDeepLink,
  validateIsoTimestamp,
  validatePilotCandidate,
  auditPilotCandidates,
  checkForbiddenCurrentAdminUnits,
  isFactRelevantToScope
} from './audit-g9-pilot.js';

import {
  isSemanticMatch,
  isKnownUnrelated,
  isGenericKeywordOnly,
  FORBIDDEN_GENERIC_KEYWORDS,
  CANDIDATE_KEYWORDS
} from './audit-g9-pilot-links.js';

import { TRA_VINH_BOUNDS } from '../js/place-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

console.log('=== BẮT ĐẦU KIỂM THỬ G9.3A: STRUCTURAL CONTRACT VALIDATION ===\n');
console.log('Phạm vi: Thẩm định cấu trúc hợp đồng dữ liệu (Structural Validation), không tuyên bố xác minh thực tế.\n');

let totalTests = 0;
let passedTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.stack || err.message}`);
    throw err;
  }
}

async function runAllTests() {
  const rawData = fs.readFileSync(DEFAULT_CANDIDATES_PATH, 'utf8');
  const candidates = JSON.parse(rawData);

  // ---------------------------------------------------------------------------
  // Test 1: Chặn source URL chỉ là origin/homepage (bắt buộc deep link)
  // ---------------------------------------------------------------------------
  await runTest('Test 1: Chặn source URL chỉ là origin/homepage (bắt buộc deep link đến đúng bài viết/hồ sơ)', () => {
    // 1.1 Kiểm tra helper isDeepLink
    assert.strictEqual(isDeepLink('https://dulichtravinh.com.vn'), false, 'Homepage không có path phải bị từ chối');
    assert.strictEqual(isDeepLink('https://dulichtravinh.com.vn/'), false, 'Homepage với path / phải bị từ chối');
    assert.strictEqual(isDeepLink('https://dulichtravinh.com.vn/danh-thang-ao-ba-om'), true, 'Deep link hợp lệ');
    assert.strictEqual(isDeepLink('http://banhtet2ly.com/lien-he'), true, 'Deep link HTTP hợp lệ');

    // 1.2 Tất cả các source_urls trong tập dữ liệu thật phải là deep link
    for (const c of candidates) {
      for (const url of c.source_urls) {
        assert.ok(isDeepLink(url), `Ứng viên ${c.id} có URL nguồn không phải deep link: ${url}`);
      }
    }

    // 1.3 Tiêm homepage vào source_urls phải bị validator từ chối
    const candWithHomepage = {
      ...candidates[0],
      source_urls: ['https://dulichtravinh.com.vn']
    };
    const res = validatePilotCandidate(candWithHomepage);
    assert.strictEqual(res.valid, false, 'Homepage trong source_urls phải bị từ chối');
    assert.ok(res.errors.some(e => e.code === 'HOMEPAGE_SOURCE_REJECTED'));
  });

  // ---------------------------------------------------------------------------
  // Test 2: Bắt buộc field_sources cho từng trường có dữ liệu thực tế (khác UNKNOWN)
  // ---------------------------------------------------------------------------
  await runTest('Test 2: Bắt buộc field_sources cho từng field có giá trị cụ thể (khác UNKNOWN)', () => {
    for (const c of candidates) {
      assert.ok(c.field_sources && typeof c.field_sources === 'object', `Ứng viên ${c.id} thiếu field_sources`);
      if (c.address && c.address !== 'UNKNOWN') {
        assert.ok(c.field_sources.address && c.field_sources.address.length >= 1, `Ứng viên ${c.id} thiếu field_sources.address`);
      }
      if (c.coordinates && c.coordinates !== 'UNKNOWN') {
        assert.ok(c.field_sources.coordinates && c.field_sources.coordinates.length >= 1, `Ứng viên ${c.id} thiếu field_sources.coordinates`);
      }
      if (c.price_raw && c.price_raw !== 'UNKNOWN') {
        assert.ok(c.field_sources.price && c.field_sources.price.length >= 1, `Ứng viên ${c.id} thiếu field_sources.price`);
      }
      if (c.opening_time && c.opening_time !== 'UNKNOWN') {
        assert.ok(c.field_sources.hours && c.field_sources.hours.length >= 1, `Ứng viên ${c.id} thiếu field_sources.hours`);
      }
      if (c.contact && c.contact !== 'UNKNOWN') {
        assert.ok(c.field_sources.contact && c.field_sources.contact.length >= 1, `Ứng viên ${c.id} thiếu field_sources.contact`);
      }
    }

    // Tiêm trường có giá trị nhưng thiếu field_sources
    const candMissingFieldSource = {
      ...candidates[0],
      field_sources: {
        address: candidates[0].field_sources.address
        // Thiếu coordinates và price
      }
    };
    const res = validatePilotCandidate(candMissingFieldSource);
    assert.strictEqual(res.valid, false, 'Thiếu field_sources cho coordinates/price phải bị chặn');
    assert.ok(res.errors.some(e => e.code === 'MISSING_FIELD_SOURCE_ENTRY'));
  });

  // ---------------------------------------------------------------------------
  // Test 3: Ràng buộc độ chính xác tọa độ (center, building, approximate != HIGH)
  // ---------------------------------------------------------------------------
  await runTest('Test 3: Ràng buộc độ chính xác tọa độ (center, building, approximate tối đa MEDIUM; chỉ entrance được HIGH)', () => {
    for (const c of candidates) {
      if (c.coordinate_precision === 'approximate') {
        assert.notStrictEqual(c.confidence.coordinates, 'HIGH', `Ứng viên ${c.id} có tọa độ approximate nhưng gán confidence HIGH`);
      }
      if (c.coordinate_precision === 'center') {
        assert.notStrictEqual(c.confidence.coordinates, 'HIGH', `Ứng viên ${c.id} có tọa độ center nhưng gán confidence HIGH`);
      }
      if (c.coordinate_precision === 'building') {
        assert.notStrictEqual(c.confidence.coordinates, 'HIGH', `Ứng viên ${c.id} có tọa độ building nhưng gán confidence HIGH`);
      }
    }

    // 3.1 Tiêm approximate kèm HIGH
    const candApproxHigh = {
      ...candidates[0],
      coordinate_precision: 'approximate',
      confidence: { ...candidates[0].confidence, coordinates: 'HIGH' }
    };
    const resApprox = validatePilotCandidate(candApproxHigh);
    assert.strictEqual(resApprox.valid, false, 'approximate kèm HIGH phải bị chặn');
    assert.ok(resApprox.errors.some(e => e.code === 'APPROXIMATE_COORDS_CANNOT_BE_HIGH'));

    // 3.2 Tiêm center kèm HIGH
    const candCenterHigh = {
      ...candidates[0],
      coordinate_precision: 'center',
      confidence: { ...candidates[0].confidence, coordinates: 'HIGH' }
    };
    const resCenter = validatePilotCandidate(candCenterHigh);
    assert.strictEqual(resCenter.valid, false, 'center kèm HIGH phải bị chặn');
    assert.ok(resCenter.errors.some(e => e.code === 'CENTER_COORDS_CANNOT_BE_HIGH'));

    // 3.3 Tiêm building kèm HIGH
    const candBuildingHigh = {
      ...candidates[0],
      coordinate_precision: 'building',
      confidence: { ...candidates[0].confidence, coordinates: 'HIGH' }
    };
    const resBuilding = validatePilotCandidate(candBuildingHigh);
    assert.strictEqual(resBuilding.valid, false, 'building kèm HIGH phải bị chặn');
    assert.ok(resBuilding.errors.some(e => e.code === 'BUILDING_COORDS_CANNOT_BE_HIGH'));

    // 3.4 entrance kèm HIGH được phép
    const candEntranceHigh = {
      ...candidates[2] // pilot-03 Đền thờ Bác Hồ: entrance, HIGH
    };
    const resEntrance = validatePilotCandidate(candEntranceHigh);
    assert.strictEqual(resEntrance.valid, true, 'entrance kèm HIGH phải hợp lệ');
  });

  // ---------------------------------------------------------------------------
  // Test 4: Chặn phân loại VERIFIED_CANDIDATE và VERIFIED_IDENTITY_CANDIDATE nếu còn xung đột chưa giải quyết
  // ---------------------------------------------------------------------------
  await runTest('Test 4: Chặn phân loại VERIFIED_CANDIDATE / VERIFIED_IDENTITY_CANDIDATE nếu còn xung đột chưa giải quyết', () => {
    // Ứng viên VERIFIED_IDENTITY_CANDIDATE trong tập thật không được có xung đột UNRESOLVED
    const verifiedIdList = candidates.filter(c => c.recommendation === 'VERIFIED_IDENTITY_CANDIDATE');
    for (const c of verifiedIdList) {
      const hasUnresolved = c.conflicts.some(item => typeof item === 'object' && item.status === 'UNRESOLVED');
      assert.strictEqual(hasUnresolved, false, `VERIFIED_IDENTITY_CANDIDATE ${c.id} không được có xung đột UNRESOLVED`);
    }

    // 4.1 Tiêm conflict UNRESOLVED vào VERIFIED_IDENTITY_CANDIDATE
    const candConflictVerId = {
      ...candidates[0],
      recommendation: 'VERIFIED_IDENTITY_CANDIDATE',
      conflicts: [
        {
          field: 'address',
          description: 'Mâu thuẫn địa chỉ chưa giải quyết',
          status: 'UNRESOLVED'
        }
      ]
    };
    const resVerId = validatePilotCandidate(candConflictVerId);
    assert.strictEqual(resVerId.valid, false, 'Xung đột UNRESOLVED phải chặn VERIFIED_IDENTITY_CANDIDATE');
    assert.ok(resVerId.errors.some(e => e.code === 'UNRESOLVED_CONFLICT_CANNOT_BE_VERIFIED_IDENTITY'));

    // 4.2 Tiêm conflict UNRESOLVED vào VERIFIED_CANDIDATE
    const candConflictVer = {
      ...candidates[2],
      recommendation: 'VERIFIED_CANDIDATE',
      conflicts: [
        {
          field: 'address',
          description: 'Mâu thuẫn địa chỉ chưa giải quyết',
          status: 'UNRESOLVED'
        }
      ]
    };
    const resVer = validatePilotCandidate(candConflictVer);
    assert.strictEqual(resVer.valid, false, 'Xung đột UNRESOLVED phải chặn VERIFIED_CANDIDATE');
    assert.ok(resVer.errors.some(e => e.code === 'UNRESOLVED_CONFLICT_CANNOT_BE_VERIFIED'));
  });

  // ---------------------------------------------------------------------------
  // Test 5: Phân tách địa chỉ hành chính & Chặn địa giới cũ theo NQ 1687/NQ-UBTVQH15
  // ---------------------------------------------------------------------------
  await runTest('Test 5: Phân tách legacy_address và current_address (chặn địa giới hành chính cũ theo NQ 1687/NQ-UBTVQH15)', () => {
    // 5.1 Helper checkForbiddenCurrentAdminUnits
    assert.strictEqual(checkForbiddenCurrentAdminUnits('Khóm 4, phường Nguyệt Hóa, tỉnh Vĩnh Long'), null);
    assert.strictEqual(checkForbiddenCurrentAdminUnits('Ấp Vĩnh Hội, phường Long Đức, tỉnh Vĩnh Long'), null);
    assert.strictEqual(checkForbiddenCurrentAdminUnits('97 Phạm Ngũ Lão, Khóm 4, phường Trà Vinh, tỉnh Vĩnh Long'), null);
    assert.strictEqual(checkForbiddenCurrentAdminUnits('Khu du lịch Ba Động, phường Trường Long Hòa, tỉnh Vĩnh Long'), null);
    assert.strictEqual(checkForbiddenCurrentAdminUnits('Khóm 3, xã Châu Thành, tỉnh Vĩnh Long'), null);

    assert.notStrictEqual(checkForbiddenCurrentAdminUnits('Khóm 4, Phường 8, Thành phố Trà Vinh, Tỉnh Trà Vinh'), null);
    assert.notStrictEqual(checkForbiddenCurrentAdminUnits('Ấp Long Bình, Phường 4, Thành phố Trà Vinh'), null);
    assert.notStrictEqual(checkForbiddenCurrentAdminUnits('Ấp Vĩnh Hội, Xã Long Đức, Thành phố Trà Vinh'), null);
    assert.notStrictEqual(checkForbiddenCurrentAdminUnits('Xã Trường Long Hòa, Thị xã Duyên Hải'), null);
    assert.notStrictEqual(checkForbiddenCurrentAdminUnits('Khóm 3, Thị trấn Châu Thành, Huyện Châu Thành'), null);
    // Chặn "thị trấn Châu Thành" kể cả khi chuỗi KHÔNG chứa "Huyện Châu Thành"
    assert.notStrictEqual(checkForbiddenCurrentAdminUnits('Khóm 3, thị trấn Châu Thành, tỉnh Vĩnh Long'), null, 'Thị trấn Châu Thành phải bị chặn kể cả không có Huyện Châu Thành');
    assert.notStrictEqual(checkForbiddenCurrentAdminUnits('Khóm 3, TT Châu Thành, tỉnh Vĩnh Long'), null);

    // 5.2 Toàn bộ 10 ứng viên thật phải có current_address chuẩn
    for (const c of candidates) {
      assert.ok(c.legacy_address && c.legacy_address.length >= 5, `Ứng viên ${c.id} thiếu legacy_address`);
      assert.ok(c.current_address && c.current_address.length >= 5, `Ứng viên ${c.id} thiếu current_address`);
      if (c.current_address !== 'UNKNOWN') {
        assert.strictEqual(checkForbiddenCurrentAdminUnits(c.current_address), null, `current_address của ${c.id} chứa đơn vị cũ: ${c.current_address}`);
        assert.ok(c.current_address.endsWith('tỉnh Vĩnh Long'), `current_address của ${c.id} phải kết thúc bằng "tỉnh Vĩnh Long"`);
      } else {
        assert.ok(Array.isArray(c.address_candidates) && c.address_candidates.length >= 1, `Ứng viên ${c.id} có current_address=UNKNOWN bắt buộc phải có address_candidates`);
      }
    }

    // 5.3 Tiêm các đơn vị hành chính cũ vào current_address
    const oldUnitCases = [
      'Khóm 4, Phường 8, Thành phố Trà Vinh, Tỉnh Trà Vinh',
      'Đường Chu Văn An, Ấp Long Bình, Phường 4, Thành phố Trà Vinh',
      'Ấp Vĩnh Hội, Xã Long Đức, Thành phố Trà Vinh',
      'Xã Trường Long Hòa, Thị xã Duyên Hải, Tỉnh Trà Vinh',
      'Khóm 3, Thị trấn Châu Thành, Huyện Châu Thành, Tỉnh Trà Vinh',
      'Khóm 3, thị trấn Châu Thành, tỉnh Vĩnh Long'
    ];

    for (const oldAddr of oldUnitCases) {
      const candOld = { ...candidates[0], current_address: oldAddr };
      const res = validatePilotCandidate(candOld);
      assert.strictEqual(res.valid, false, `Địa chỉ cũ '${oldAddr}' phải bị từ chối`);
      assert.ok(res.errors.some(e => e.code === 'OLD_ADMIN_UNIT_USED_AS_CURRENT'));
    }

    // 5.4 Kiểm tra Chùa Hang (pilot-10) theo Khoản 34 NQ 1687/NQ-UBTVQH15
    const chuaHang = candidates.find(c => c.id === 'pilot-10');
    assert.strictEqual(chuaHang.current_address, 'Khóm 3, xã Châu Thành, tỉnh Vĩnh Long', 'Chùa Hang phải dùng xã Châu Thành theo Khoản 34 NQ 1687/NQ-UBTVQH15');
    assert.strictEqual(chuaHang.address, 'Khóm 3, xã Châu Thành, tỉnh Vĩnh Long');
  });

  // ---------------------------------------------------------------------------
  // Test 6: Thẩm định timestamp verified_at / accessed_at / checked_at
  // ---------------------------------------------------------------------------
  await runTest('Test 6: Thẩm định timestamp verified_at / accessed_at / checked_at (chặn tương lai & thiếu timezone)', () => {
    // 6.1 Helper validateIsoTimestamp
    assert.strictEqual(validateIsoTimestamp('2026-09-22T11:45:00+07:00').valid, true);
    assert.strictEqual(validateIsoTimestamp('2026-09-22T04:45:00Z').valid, true);
    assert.strictEqual(validateIsoTimestamp('2026-09-22 11:45:00').valid, false, 'Thiếu T và timezone phải lỗi');
    assert.strictEqual(validateIsoTimestamp('2026-09-22T11:45:00').valid, false, 'Thiếu timezone phải lỗi');
    assert.strictEqual(validateIsoTimestamp('2099-01-01T00:00:00Z').valid, false, 'Thời gian tương lai phải lỗi');

    // 6.2 Dữ liệu thật phải hợp lệ
    for (const c of candidates) {
      assert.ok(validateIsoTimestamp(c.verified_at).valid, `verified_at của ${c.id} không hợp lệ`);
      if (Array.isArray(c.sources_metadata)) {
        for (const meta of c.sources_metadata) {
          assert.ok(validateIsoTimestamp(meta.checked_at).valid, `checked_at trong sources_metadata của ${c.id} không hợp lệ`);
        }
      }
      for (const fieldKey of Object.keys(c.field_sources || {})) {
        for (const s of c.field_sources[fieldKey]) {
          assert.ok(validateIsoTimestamp(s.accessed_at).valid, `accessed_at trong field_sources.${fieldKey} của ${c.id} không hợp lệ`);
          if (s.checked_at) {
            assert.ok(validateIsoTimestamp(s.checked_at).valid, `checked_at trong field_sources.${fieldKey} của ${c.id} không hợp lệ`);
          }
        }
      }
    }

    // 6.3 Tiêm verified_at tương lai
    const candFuture = {
      ...candidates[0],
      verified_at: '2029-01-01T00:00:00+07:00'
    };
    const res = validatePilotCandidate(candFuture);
    assert.strictEqual(res.valid, false, 'verified_at tương lai phải bị chặn');
    assert.ok(res.errors.some(e => e.code === 'FUTURE_TIMESTAMP'));
  });

  // ---------------------------------------------------------------------------
  // Test 7: Cấm source dead hoặc 404 cho các bản ghi xác minh
  // ---------------------------------------------------------------------------
  await runTest('Test 7: Cấm nguồn dead hoặc 404 cho các bản ghi xác minh (VERIFIED_CANDIDATE / VERIFIED_IDENTITY_CANDIDATE)', () => {
    // 7.1 Toàn bộ ứng viên xác minh thật phải có nguồn active_relevant 200 trong field_sources
    const verifiedCandidates = candidates.filter(c => c.recommendation === 'VERIFIED_CANDIDATE' || c.recommendation === 'VERIFIED_IDENTITY_CANDIDATE');
    for (const c of verifiedCandidates) {
      if (Array.isArray(c.sources_metadata)) {
        for (const m of c.sources_metadata) {
          assert.notStrictEqual(m.source_status, 'dead', `Nguồn ${m.url} của ${c.id} không được có status dead`);
          assert.notStrictEqual(m.source_status, 'unreachable', `Nguồn ${m.url} của ${c.id} không được có status unreachable`);
        }
      }
      for (const [key, sources] of Object.entries(c.field_sources || {})) {
        for (const s of sources) {
          assert.strictEqual(s.source_status, 'active_relevant', `Nguồn ${s.url} của ${c.id} trong ${key} không được có status ${s.source_status}`);
          assert.strictEqual(s.http_status, 200, `Nguồn ${s.url} của ${c.id} trong ${key} không được có http_status ${s.http_status}`);
        }
      }
    }

    // 7.2 Tiêm nguồn dead vào sources_metadata của ứng viên xác minh
    const candDeadMeta = {
      ...candidates[0],
      sources_metadata: [
        {
          ...candidates[0].sources_metadata[0],
          source_status: 'dead'
        }
      ]
    };
    const resDeadMeta = validatePilotCandidate(candDeadMeta);
    assert.strictEqual(resDeadMeta.valid, false, 'Nguồn dead trong sources_metadata phải bị chặn');
    assert.ok(resDeadMeta.errors.some(e => e.code === 'DEAD_SOURCE_FOR_VERIFIED_CANDIDATE'));

    // 7.3 Tiêm nguồn 404 vào field_sources của ứng viên xác minh
    const cand404Field = {
      ...candidates[0],
      field_sources: {
        ...candidates[0].field_sources,
        address: [
          {
            ...candidates[0].field_sources.address[0],
            http_status: 404,
            source_status: 'dead'
          }
        ]
      }
    };
    const res404Field = validatePilotCandidate(cand404Field);
    assert.strictEqual(res404Field.valid, false, 'Nguồn 404 trong field_sources phải bị chặn');
    assert.ok(res404Field.errors.some(e => e.code === 'DEAD_SOURCE_FOR_VERIFIED_CANDIDATE' || e.code === 'UNUSABLE_FIELD_SOURCE_FOR_EVIDENCE'));
  });

  // ---------------------------------------------------------------------------
  // Test 8: Ràng buộc evidence_scope coverage cho toàn bộ trường có confidence HIGH
  // ---------------------------------------------------------------------------
  await runTest('Test 8: Ràng buộc evidence_scope coverage cho toàn bộ các trường đạt độ tin cậy HIGH', () => {
    const scopeMap = {
      name: 'identity',
      address: 'address',
      coordinates: 'coordinates',
      hours: 'hours',
      contact: 'contact',
      price: 'price'
    };

    // 8.1 Dữ liệu thật phải đảm bảo coverage
    for (const c of candidates) {
      const activeScopes = new Set();
      if (Array.isArray(c.sources_metadata)) {
        c.sources_metadata.forEach(m => {
          if (m.source_status === 'active_relevant' && m.evidence_scope) activeScopes.add(m.evidence_scope);
        });
      }
      if (c.field_sources && typeof c.field_sources === 'object') {
        Object.values(c.field_sources).forEach(list => {
          if (Array.isArray(list)) {
            list.forEach(s => {
              if (s.source_status === 'active_relevant' && s.evidence_scope) activeScopes.add(s.evidence_scope);
            });
          }
        });
      }

      for (const [fieldKey, targetScope] of Object.entries(scopeMap)) {
        if (c.confidence[fieldKey] === 'HIGH') {
          assert.ok(activeScopes.has(targetScope), `Ứng viên ${c.id} có ${fieldKey}=HIGH nhưng thiếu active_relevant source bao phủ scope '${targetScope}'`);
        }
      }
    }

    // 8.2 Tiêm trường HIGH nhưng xóa bỏ toàn bộ nguồn bao phủ scope đó
    const candMissingScope = {
      ...candidates[0],
      confidence: { ...candidates[0].confidence, hours: 'HIGH' } // Ao Bà Om không có nguồn hours
    };
    const res = validatePilotCandidate(candMissingScope);
    assert.strictEqual(res.valid, false, 'Field HIGH thiếu nguồn bao phủ scope phải bị chặn');
    assert.ok(res.errors.some(e => e.code === 'HIGH_CONFIDENCE_LACKS_ACTIVE_RELEVANT_EVIDENCE'));
  });

  // ---------------------------------------------------------------------------
  // Test 9: Thẩm định tính phù hợp giữa extracted_fact và evidence_scope
  // ---------------------------------------------------------------------------
  await runTest('Test 9: Thẩm định tính phù hợp giữa extracted_fact và evidence_scope (isFactRelevantToScope)', () => {
    // 9.1 Kiểm tra helper isFactRelevantToScope
    assert.strictEqual(isFactRelevantToScope('Khu di tích lịch sử Quốc gia Đền thờ Bác', 'identity'), true);
    assert.strictEqual(isFactRelevantToScope('Tọa độ tham chiếu trắc địa tâm hồ tại 9.9347, 106.3449', 'coordinates'), true);
    assert.strictEqual(isFactRelevantToScope('Mở cửa đón khách tham quan hàng ngày từ 07:00 đến 17:00', 'hours'), true);
    assert.strictEqual(isFactRelevantToScope('Miễn phí vé vào cửa tham quan', 'price'), true);
    assert.strictEqual(isFactRelevantToScope('Hotline liên hệ 0294 3826 002', 'contact'), true);
    assert.strictEqual(isFactRelevantToScope('Tọa lạc tại Khóm 4, phường Nguyệt Hóa, tỉnh Vĩnh Long', 'address'), true);

    // Không phù hợp
    assert.strictEqual(isFactRelevantToScope('Không liên quan', 'coordinates'), false);
    assert.strictEqual(isFactRelevantToScope('Tọa độ mốc trắc địa 9.93, 106.34', 'price'), false);

    // 9.2 Toàn bộ extracted_fact trong dữ liệu thật phải phù hợp với scope
    for (const c of candidates) {
      if (c.field_sources && typeof c.field_sources === 'object') {
        for (const [key, sources] of Object.entries(c.field_sources)) {
          for (const s of sources) {
            if (s.evidence_scope) {
              assert.ok(
                isFactRelevantToScope(s.extracted_fact, s.evidence_scope),
                `Ứng viên ${c.id} trong ${key} có fact không phù hợp scope: "${s.extracted_fact}" vs "${s.evidence_scope}"`
              );
            }
          }
        }
      }
    }

    // 9.3 Tiêm fact không phù hợp
    const candIrrelevantFact = {
      ...candidates[0],
      field_sources: {
        ...candidates[0].field_sources,
        address: [
          {
            ...candidates[0].field_sources.address[0],
            extracted_fact: 'Bài viết chỉ giới thiệu chung về phong cảnh thiên nhiên miền Tây.'
          }
        ]
      }
    };
    const res = validatePilotCandidate(candIrrelevantFact);
    assert.strictEqual(res.valid, false, 'Fact không khớp scope phải bị từ chối');
    assert.ok(res.errors.some(e => e.code === 'FACT_NOT_RELEVANT_TO_SCOPE'));
  });

  // ---------------------------------------------------------------------------
  // Test 10: Loại trừ ID test cũ (4, 6, 10) và slug thử nghiệm
  // ---------------------------------------------------------------------------
  await runTest('Test 10: Loại trừ hoàn toàn ID test cũ (4, 6, 10) và slug thử nghiệm khỏi danh sách pilot', () => {
    for (const c of candidates) {
      assert.ok(!FORBIDDEN_TEST_IDS.has(c.id), `ID ${c.id} không được trùng với test ID đã archive`);
      assert.ok(!FORBIDDEN_TEST_IDS.has(c.proposed_slug), `Slug ${c.proposed_slug} không được trùng với slug test cũ`);
      assert.ok(!c.proposed_name.toLowerCase().includes('test'), `Tên ${c.proposed_name} không được chứa từ khóa test`);
    }

    const fakeCandId = { ...candidates[0], id: 4 };
    const resId = validatePilotCandidate(fakeCandId);
    assert.strictEqual(resId.valid, false, 'Phải chặn candidate có ID 4');
    assert.ok(resId.errors.some(e => e.code === 'FORBIDDEN_TEST_ID'));

    const fakeCandSlug = { ...candidates[0], proposed_slug: 'dia-diem-test-google-form' };
    const resSlug = validatePilotCandidate(fakeCandSlug);
    assert.strictEqual(resSlug.valid, false, 'Phải chặn candidate có slug test cũ');
    assert.ok(resSlug.errors.some(e => e.code === 'FORBIDDEN_TEST_SLUG'));
  });

  // ---------------------------------------------------------------------------
  // Test 11: Phát hiện và chặn trùng lặp ID hoặc proposed slug
  // ---------------------------------------------------------------------------
  await runTest('Test 11: Phát hiện và chặn trùng lặp ID hoặc proposed slug giữa các ứng viên', () => {
    const auditRes = auditPilotCandidates(candidates);
    assert.strictEqual(auditRes.errors.filter(e => e.code === 'DUPLICATE_CANDIDATE_ID').length, 0);
    assert.strictEqual(auditRes.errors.filter(e => e.code === 'DUPLICATE_CANDIDATE_SLUG').length, 0);

    const dupList = [{ ...candidates[0], id: 'pilot-same' }, { ...candidates[1], id: 'pilot-same' }];
    const dupAudit = auditPilotCandidates(dupList);
    assert.ok(dupAudit.errors.some(e => e.code === 'DUPLICATE_CANDIDATE_ID'));
  });

  // ---------------------------------------------------------------------------
  // Test 12: Chặn xuất bản ảnh chưa rõ bản quyền
  // ---------------------------------------------------------------------------
  await runTest('Test 12: Chặn xuất bản ảnh chưa rõ bản quyền (can_publish = false nếu chưa VERIFIED_PERMITTED)', () => {
    for (const c of candidates) {
      for (const img of c.image_candidates) {
        if (img.rights_status !== 'VERIFIED_PERMITTED') {
          assert.strictEqual(img.can_publish, false, `Ảnh ${img.url} của ${c.id} chưa xác minh quyền không được xuất bản`);
        }
      }
    }

    const candBreach = {
      ...candidates[0],
      image_candidates: [
        { url: './ao bà om.jpg', type: 'local_asset', rights_status: 'PENDING_VERIFICATION', can_publish: true }
      ]
    };
    const res = validatePilotCandidate(candBreach);
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some(e => e.code === 'UNVERIFIED_IMAGE_PUBLISH_BLOCKED'));
  });

  // ---------------------------------------------------------------------------
  // Test 13: Zero Mutation Guard chặn POST/PUT/PATCH/DELETE
  // ---------------------------------------------------------------------------
  await runTest('Test 13: Zero Mutation Guard chặn đứng toàn bộ HTTP POST, PUT, PATCH, DELETE', () => {
    const blockedMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    for (const m of blockedMethods) {
      let threw = false;
      try {
        checkNoMutationGuard({ method: m });
      } catch (err) {
        threw = true;
        assert.ok(err.message.includes('MUTATION_FORBIDDEN'));
      }
      assert.strictEqual(threw, true, `Method ${m} phải bị chặn`);
    }

    assert.doesNotThrow(() => checkNoMutationGuard({ method: 'GET' }));
    assert.doesNotThrow(() => checkNoMutationGuard({ method: 'HEAD' }));
  });

  // ---------------------------------------------------------------------------
  // Test 14: Toàn bộ 10 ứng viên đạt 100% Structural Validation với phân loại trung thực
  // ---------------------------------------------------------------------------
  await runTest('Test 14: Toàn bộ danh sách 10 ứng viên đạt 100% thẩm định cấu trúc với phân loại trung thực (Zero inflation)', () => {
    const auditRes = auditPilotCandidates(candidates);
    assert.strictEqual(auditRes.success, true, 'Thẩm định cấu trúc danh sách ứng viên phải đạt 100%');
    assert.strictEqual(auditRes.errors.length, 0, 'Số lỗi cấu trúc phải bằng 0');
    assert.strictEqual(auditRes.totalCandidates, 10, 'Tổng số ứng viên phải là 10');
    assert.strictEqual(auditRes.verifiedCount, 0, 'Số lượng VERIFIED_CANDIDATE phải là 0 (chưa có khảo sát thực địa)');
    assert.strictEqual(auditRes.verifiedIdentityCount, 3, 'Số lượng VERIFIED_IDENTITY_CANDIDATE chuẩn xác là 3');
    assert.strictEqual(auditRes.breakdown.byRecommendation.VERIFIED_CANDIDATE, 0);
    assert.strictEqual(auditRes.breakdown.byRecommendation.VERIFIED_IDENTITY_CANDIDATE, 3);
    assert.strictEqual(auditRes.breakdown.byRecommendation.NEEDS_FIELD_VERIFICATION, 0);
    assert.strictEqual(auditRes.breakdown.byRecommendation.SOURCE_CONFLICT, 2);
    assert.strictEqual(auditRes.breakdown.byRecommendation.NEEDS_RESEARCH, 5);
  });

  // ---------------------------------------------------------------------------
  // Test 15: Thẩm định Cafe 1985 (pilot-06) - UNKNOWN address, candidates, rebranding
  // ---------------------------------------------------------------------------
  await runTest('Test 15: Thẩm định hồ sơ Cafe 1985 (pilot-06: UNKNOWN address, address_candidates, POSSIBLY_REBRANDED)', () => {
    const cafe1985 = candidates.find(c => c.id === 'pilot-06');
    assert.ok(cafe1985, 'Không tìm thấy pilot-06 Cafe 1985');
    assert.strictEqual(cafe1985.address, 'UNKNOWN', 'Cafe 1985 phải để address là UNKNOWN do xung đột nguồn');
    assert.strictEqual(cafe1985.current_address, 'UNKNOWN', 'Cafe 1985 phải để current_address là UNKNOWN do xung đột nguồn');
    assert.deepStrictEqual(cafe1985.address_candidates, [
      '97 Phạm Ngũ Lão, Khóm 4, phường Trà Vinh, tỉnh Vĩnh Long',
      'A3/55 Phạm Ngũ Lão, Khóm 4, phường Trà Vinh, tỉnh Vĩnh Long'
    ], 'Cafe 1985 phải lưu cả 2 địa chỉ khả dĩ vào address_candidates');
    assert.strictEqual(cafe1985.operating_status, 'POSSIBLY_REBRANDED', 'operating_status của Cafe 1985 phải là POSSIBLY_REBRANDED');
    assert.strictEqual(cafe1985.confidence.address, 'UNKNOWN', 'confidence.address của Cafe 1985 phải là UNKNOWN');
    assert.strictEqual(cafe1985.recommendation, 'SOURCE_CONFLICT', 'recommendation của Cafe 1985 phải là SOURCE_CONFLICT');

    const statusConflict = cafe1985.conflicts.find(c => c.field === 'operating_status');
    assert.ok(statusConflict, 'Cafe 1985 phải có conflict về operating_status');
    assert.strictEqual(
      statusConflict.description,
      'Có dấu hiệu đổi thương hiệu hoặc ngừng hoạt động dưới tên Cafe 1985; chưa có nguồn trực tiếp còn hoạt động để xác nhận.',
      'Mô tả xung đột operating_status của Cafe 1985 phải chính xác'
    );

    // Tiêm cố định 97 vào current_address của ứng viên SOURCE_CONFLICT
    const candFixedAddr = {
      ...cafe1985,
      address: '97 Phạm Ngũ Lão, Khóm 4, phường Trà Vinh, tỉnh Vĩnh Long',
      current_address: '97 Phạm Ngũ Lão, Khóm 4, phường Trà Vinh, tỉnh Vĩnh Long',
      confidence: { ...cafe1985.confidence, address: 'HIGH' }
    };
    const resFixed = validatePilotCandidate(candFixedAddr);
    // Phải bị chặn vì address=HIGH nhưng không có active source bao phủ address
    assert.strictEqual(resFixed.valid, false, 'Cố định 97 kèm HIGH khi nguồn chết phải bị chặn');
  });

  // ---------------------------------------------------------------------------
  // Test 16: Tính chân thực của liên kết nguồn (Real HTTP status probe & classification)
  // ---------------------------------------------------------------------------
  await runTest('Test 16: Thẩm định tính chân thực của liên kết nguồn (3 URL 404 dead, lỗi DNS/TLS là unreachable, không tự khai 200)', () => {
    // 16.1 Kiểm tra 3 URL đã xác nhận 404 thực tế trong dataset
    const banhTet2LyMeta = candidates.find(c => c.id === 'pilot-05').sources_metadata.find(m => m.url === 'http://banhtet2ly.com/lien-he');
    assert.strictEqual(banhTet2LyMeta.source_status, 'dead', 'banhtet2ly phải là dead');
    assert.strictEqual(banhTet2LyMeta.http_status, 404, 'banhtet2ly http_status phải là 404');
    assert.strictEqual(banhTet2LyMeta.effective_url, 'https://www.banhtet2ly.com/lien-he');

    const benThanhMeta = candidates.find(c => c.id === 'pilot-06').sources_metadata.find(m => m.url.includes('benthanhtourist'));
    assert.strictEqual(benThanhMeta.source_status, 'dead', 'benthanhtourist phải là dead');
    assert.strictEqual(benThanhMeta.http_status, 404, 'benthanhtourist http_status phải là 404');

    const myTourMeta = candidates.find(c => c.id === 'pilot-06').sources_metadata.find(m => m.url.includes('mytour'));
    assert.strictEqual(myTourMeta.source_status, 'dead', 'mytour phải là dead');
    assert.strictEqual(myTourMeta.http_status, 404, 'mytour http_status phải là 404');
    assert.strictEqual(myTourMeta.effective_url, 'https://mytour.vn/404', 'mytour chuyển hướng tới /404 phải ghi nhận');

    // 16.2 Các cổng thông tin lỗi DNS/TLS phải là unreachable với http_status null
    const unreachableDomains = ['sovhttdl.travinh.gov.vn', 'baotravinh.vn', 'dulichtravinh.com.vn'];
    for (const c of candidates) {
      if (Array.isArray(c.sources_metadata)) {
        for (const m of c.sources_metadata) {
          if (unreachableDomains.some(d => m.url.includes(d))) {
            assert.strictEqual(m.source_status, 'unreachable', `Domain ${m.url} phải ghi unreachable`);
            assert.strictEqual(m.http_status, null, `Domain ${m.url} phải có http_status null`);
          }
        }
      }
    }

    // 16.3 Toàn bộ ứng viên xác minh (VERIFIED_IDENTITY_CANDIDATE) tuyệt đối không chứa nguồn dead hoặc unreachable
    const verifiedCandidates = candidates.filter(c => c.recommendation === 'VERIFIED_IDENTITY_CANDIDATE');
    assert.strictEqual(verifiedCandidates.length, 3);
    for (const c of verifiedCandidates) {
      for (const m of c.sources_metadata) {
        assert.notStrictEqual(m.source_status, 'dead', `Ứng viên xác minh ${c.id} không được có nguồn dead: ${m.url}`);
        assert.notStrictEqual(m.source_status, 'unreachable', `Ứng viên xác minh ${c.id} không được có nguồn unreachable: ${m.url}`);
      }
      for (const [key, list] of Object.entries(c.field_sources || {})) {
        for (const s of list) {
          assert.strictEqual(s.source_status, 'active_relevant', `Bằng chứng ${key} của ${c.id} phải là active_relevant: ${s.url}`);
          assert.strictEqual(s.http_status, 200, `Bằng chứng ${key} của ${c.id} phải có http_status 200: ${s.url}`);
        }
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Test 17: Rà soát biểu giá toàn diện (price_raw UNKNOWN & confidence.price UNKNOWN)
  // ---------------------------------------------------------------------------
  await runTest('Test 17: Rà soát biểu giá toàn diện (không tự suy đoán miễn phí, toàn bộ 10 ứng viên hạ UNKNOWN nếu chưa có văn bản pháp quy)', () => {
    // 17.1 Toàn bộ 10 ứng viên phải có price_raw = UNKNOWN và confidence.price = UNKNOWN
    for (const c of candidates) {
      assert.strictEqual(c.price_raw, 'UNKNOWN', `Ứng viên ${c.id} (${c.proposed_name}) có price_raw khác UNKNOWN: ${c.price_raw}`);
      assert.strictEqual(c.confidence.price, 'UNKNOWN', `Ứng viên ${c.id} (${c.proposed_name}) có confidence.price khác UNKNOWN: ${c.confidence.price}`);
      assert.strictEqual(c.field_sources?.price, undefined, `Ứng viên ${c.id} không được có field_sources.price khi price là UNKNOWN`);
    }

    // 17.2 Tiêm confidence.price = HIGH khi price_raw = UNKNOWN phải bị validator từ chối
    const candPriceBreach = {
      ...candidates[0],
      confidence: { ...candidates[0].confidence, price: 'HIGH' }
    };
    const resBreach = validatePilotCandidate(candPriceBreach);
    assert.strictEqual(resBreach.valid, false, 'Gán confidence.price=HIGH khi price_raw=UNKNOWN phải bị chặn');
    assert.ok(resBreach.errors.some(e => e.code === 'PRICE_UNKNOWN_CANNOT_BE_HIGH'));
  });

  // ---------------------------------------------------------------------------
  // Test 18: Loại trừ nguồn redirect sai nội dung khỏi bằng chứng (redirected_unrelated)
  // ---------------------------------------------------------------------------
  await runTest('Test 18: Loại trừ nguồn redirect sai nội dung khỏi bằng chứng (redirected_unrelated -> UNUSABLE_FIELD_SOURCE_FOR_EVIDENCE)', () => {
    // 18.1 Các URL chuyển hướng lạc đề không được xuất hiện trong field_sources
    const unrelatedUrls = [
      'https://baocantho.com.vn/dam-da-bun-nuoc-leo-tra-vinh-a120415.html',
      'https://thuonghieucongluan.com.vn/kdl-huynh-kha-diem-du-lich-tieu-bieu-dbscl-a198214.html',
      'https://baovephapluat.vn/van-hoa-xa-hoi/du-lich-am-thuc/tra-vinh-cong-nhan-diem-du-lich-huynh-kha-145210.html',
      'https://nhandan.vn/lang-nghe-banh-tet-tra-cuon-post689123.html'
    ];
    for (const c of candidates) {
      if (c.field_sources && typeof c.field_sources === 'object') {
        for (const list of Object.values(c.field_sources)) {
          if (Array.isArray(list)) {
            for (const s of list) {
              assert.ok(!unrelatedUrls.includes(s.url), `Nguồn chuyển hướng sai '${s.url}' không được có trong field_sources của ${c.id}`);
            }
          }
        }
      }
    }

    // 18.2 Tiêm nguồn redirected_unrelated vào field_sources phải bị chặn
    const candWithUnrelated = {
      ...candidates[0],
      field_sources: {
        ...candidates[0].field_sources,
        address: [
          {
            ...candidates[0].field_sources.address[0],
            source_status: 'redirected_unrelated'
          }
        ]
      }
    };
    const res = validatePilotCandidate(candWithUnrelated);
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some(e => e.code === 'UNUSABLE_FIELD_SOURCE_FOR_EVIDENCE'));
  });

  // ---------------------------------------------------------------------------
  // Test 19: Tiêu đề không liên quan hoặc phần tử lệch nội dung (content_mismatch) bị chặn khỏi field_sources
  // ---------------------------------------------------------------------------
  await runTest('Test 19: Tiêu đề không liên quan hoặc phần tử lệch nội dung (content_mismatch) bị chặn khỏi field_sources', () => {
    // 19.1 Helper isSemanticMatch và isKnownUnrelated
    assert.strictEqual(isSemanticMatch('Khu di tích danh thắng Ao Bà Om', 'pilot-01'), true);
    assert.strictEqual(isSemanticMatch('Chùa Âng cổ kính tại Trà Vinh', 'pilot-02'), true);
    assert.strictEqual(isSemanticMatch('Thịt heo nhập khẩu không dễ mua', 'pilot-04'), false);
    assert.strictEqual(isKnownUnrelated('Thịt heo nhập khẩu không dễ mua'), true);
    assert.strictEqual(isKnownUnrelated('Giá vàng hôm nay 30/7 tăng nhẹ'), true);
    assert.strictEqual(isKnownUnrelated('Nhóm đối tượng trộm chó dùng súng điện'), true);

    // 19.2 Chặn keyword chung (Trà Vinh, du lịch...) làm bằng chứng thực thể
    assert.strictEqual(isGenericKeywordOnly('Trà Vinh'), true);
    assert.strictEqual(isGenericKeywordOnly('Du lịch'), true);
    assert.strictEqual(isGenericKeywordOnly('Ẩm thực'), true);
    assert.strictEqual(isSemanticMatch('Trà Vinh', 'pilot-01'), false);
    assert.strictEqual(isSemanticMatch('Du lịch Trà Vinh', 'pilot-01'), false);
    assert.strictEqual(isSemanticMatch('ẩm thực Trà Vinh', 'pilot-04'), false);

    // 19.3 Tiêm nguồn content_mismatch vào field_sources phải bị chặn
    const candWithMismatch = {
      ...candidates[0],
      field_sources: {
        ...candidates[0].field_sources,
        address: [
          {
            ...candidates[0].field_sources.address[0],
            source_status: 'content_mismatch'
          }
        ]
      }
    };
    const res = validatePilotCandidate(candWithMismatch);
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some(e => e.code === 'UNUSABLE_FIELD_SOURCE_FOR_EVIDENCE'));
  });

  // ---------------------------------------------------------------------------
  // Test 20: Chặn dùng OSM Search URL để làm bằng chứng tọa độ
  // ---------------------------------------------------------------------------
  await runTest('Test 20: Chặn dùng OSM Search URL (/search?query=) làm bằng chứng tọa độ (OSM_SEARCH_URL_CANNOT_PROVE_COORDINATES)', () => {
    const candSearchCoord = {
      ...candidates[0],
      field_sources: {
        ...candidates[0].field_sources,
        coordinates: [
          {
            url: 'https://www.openstreetmap.org/search?query=9.9347%2C106.3449',
            title: 'OpenStreetMap - Search Query',
            accessed_at: '2026-09-22T13:45:00+07:00',
            source_status: 'content_mismatch',
            http_status: 200,
            evidence_scope: 'coordinates',
            extracted_fact: 'Tọa độ tìm kiếm trên bản đồ OSM',
            source_type: 'community_cartographic_source'
          }
        ]
      }
    };
    const res = validatePilotCandidate(candSearchCoord);
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some(e => e.code === 'OSM_SEARCH_URL_CANNOT_PROVE_COORDINATES'));
  });

  // ---------------------------------------------------------------------------
  // Test 21: Thẩm tra OSM elements: 3 ứng viên xác minh có OSM element khớp thực thể (community_cartographic_source)
  // ---------------------------------------------------------------------------
  await runTest('Test 21: Thẩm tra OSM elements: 3 ứng viên xác minh có OSM element khớp thực thể (community_cartographic_source), chặn element sai tên hoặc vô danh', () => {
    const verifiedCandidates = candidates.filter(c => c.recommendation === 'VERIFIED_IDENTITY_CANDIDATE');
    for (const c of verifiedCandidates) {
      const osmSource = c.field_sources.coordinates.find(s => s.url.includes('openstreetmap.org'));
      assert.ok(osmSource, `Ứng viên xác minh ${c.id} phải có nguồn OSM trong field_sources.coordinates`);
      assert.ok(!osmSource.url.includes('/search'), `Ứng viên xác minh ${c.id} không được dùng URL search: ${osmSource.url}`);
      assert.ok(osmSource.url.includes('/way/'), `Ứng viên xác minh ${c.id} phải tham chiếu đến OSM element có tên/tag khớp thực thể: ${osmSource.url}`);
      assert.strictEqual(osmSource.source_type, 'community_cartographic_source', `Nguồn OSM của ${c.id} phải khai báo source_type là community_cartographic_source`);
    }

    // 21.2 Mô phỏng phần tử OSM sai tên (way 789123450 tại Nhật Bản không có tên thực thể)
    const candWrongOsm = {
      ...candidates[0],
      field_sources: {
        ...candidates[0].field_sources,
        coordinates: [
          {
            url: 'https://www.openstreetmap.org/way/789123450',
            title: 'OSM Unnamed Element in Japan',
            accessed_at: '2026-09-22T13:45:00+07:00',
            source_status: 'content_mismatch',
            http_status: 200,
            evidence_scope: 'coordinates',
            extracted_fact: 'Phần tử không khớp thực thể',
            source_type: 'community_cartographic_source'
          }
        ]
      }
    };
    const res = validatePilotCandidate(candWrongOsm);
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some(e => e.code === 'NON_ACTIVE_RELEVANT_SOURCE_FOR_VERIFIED_CANDIDATE' || e.code === 'UNUSABLE_FIELD_SOURCE_FOR_EVIDENCE'));
  });

  // ---------------------------------------------------------------------------
  // Test 22: VERIFIED_IDENTITY_CANDIDATE bắt buộc có ít nhất 1 nguồn identity active_relevant
  // ---------------------------------------------------------------------------
  await runTest('Test 22: VERIFIED_IDENTITY_CANDIDATE bắt buộc có tối thiểu một nguồn identity active_relevant', () => {
    const candNoActiveIdentity = {
      ...candidates[0],
      recommendation: 'VERIFIED_IDENTITY_CANDIDATE',
      sources_metadata: [
        {
          ...candidates[0].sources_metadata[0],
          source_status: 'unreachable',
          http_status: null
        }
      ]
    };
    const res = validatePilotCandidate(candNoActiveIdentity);
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some(e => e.code === 'VERIFIED_IDENTITY_REQUIRES_ACTIVE_RELEVANT_IDENTITY_SOURCE'));
  });

  // ---------------------------------------------------------------------------
  // Test 23: Mức tin cậy HIGH bắt buộc có nguồn active_relevant tương ứng
  // ---------------------------------------------------------------------------
  await runTest('Test 23: Ràng buộc độ tin cậy HIGH: bắt buộc có nguồn active_relevant bao phủ scope', () => {
    // 23.1 Gán HIGH cho address nhưng nguồn address là unreachable
    const candHighUnreachable = {
      ...candidates[3], // pilot-04 Bún Cô Ba
      confidence: {
        ...candidates[3].confidence,
        address: 'HIGH'
      }
    };
    const res = validatePilotCandidate(candHighUnreachable);
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some(e => e.code === 'HIGH_CONFIDENCE_LACKS_ACTIVE_RELEVANT_EVIDENCE'));
  });

  // ---------------------------------------------------------------------------
  // Test 24: KDL Huỳnh Kha (pilot-07) hạ xuống NEEDS_RESEARCH, loại bỏ hoàn toàn nguồn sai
  // ---------------------------------------------------------------------------
  await runTest('Test 24: KDL Huỳnh Kha (pilot-07) hạ xuống NEEDS_RESEARCH, confidence LOW, loại bỏ nguồn sai', () => {
    const huynhKha = candidates.find(c => c.id === 'pilot-07');
    assert.ok(huynhKha, 'Không tìm thấy pilot-07 Huỳnh Kha');
    assert.strictEqual(huynhKha.recommendation, 'NEEDS_RESEARCH');
    assert.strictEqual(huynhKha.confidence.name, 'LOW');
    assert.strictEqual(huynhKha.confidence.address, 'UNKNOWN');
    assert.strictEqual(huynhKha.confidence.coordinates, 'UNKNOWN');
    assert.strictEqual(huynhKha.address, 'UNKNOWN');
    assert.strictEqual(huynhKha.current_address, 'UNKNOWN');
    assert.strictEqual(huynhKha.coordinates, 'UNKNOWN');
    assert.deepStrictEqual(huynhKha.address_candidates, [
      'Đường Chu Văn An, Ấp Long Bình, phường Long Đức, tỉnh Vĩnh Long'
    ]);
    assert.deepStrictEqual(huynhKha.field_sources, {});
  });

  console.log(`\n=== TỔNG KẾT: ${passedTests}/${totalTests} BÀI KIỂM THỬ THẨM ĐỊNH CẤU TRÚC G9.3A THÀNH CÔNG ===\n`);
}

runAllTests().catch(err => {
  console.error('\nBỘ KIỂM THỬ G9.3A THẤT BẠI:');
  console.error(err);
  process.exit(1);
});
