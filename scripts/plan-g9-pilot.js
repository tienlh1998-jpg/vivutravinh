// scripts/plan-g9-pilot.js
// Lập Kế Hoạch & Chuẩn Bị Dry-Run Bản Vá Pilot G9.3C (ID 1 & ID 3)
// Nghiêm cấm mutation, chặn hoàn toàn cờ --execute.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { loadPilotProductionRecords, computeRecordChecksum, PILOT_TARGET_IDS } from './audit-g9-pilot-production.js';
import { validatePlace } from '../js/place-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const BACKUPS_DIR = path.join(ROOT_DIR, 'backups');
const DATA_DIR = path.join(ROOT_DIR, 'data');

export const ALLOWED_PATCH_FIELDS = Object.freeze(new Set([
  'name',
  'slug',
  'category',
  'area',
  'address',
  'map_link',
  'price_raw',
  'description',
  'note',
  'contact',
  'coordinates',
  'contributor',
  'rating',
  'opening_time',
  'closing_time',
  'display_hours',
  'operating_status',
  'status',
  'images',
  'image_link',
  'sort_order',
  'is_featured',
  'expected_updated_at'
]));

/**
 * Xây dựng proposed after record và field_sources cho ID 1 (Ao Bà Om)
 */
export function buildProposedPatchForPlace1(beforeRecord) {
  const afterRecord = {
    ...beforeRecord,
    name: 'Ao Bà Om', // Xóa hậu tố rác "aa"
    slug: 'ao-ba-om', // Giữ nguyên slug
    category: beforeRecord.category || 'Điểm Check-in / Sống Ảo',
    area: 'TP. Trà Vinh',
    address: 'Khóm 4, phường Nguyệt Hóa, tỉnh Vĩnh Long', // NQ 1687/NQ-UBTVQH15
    coordinates: '9.9347,106.3449',
    map_link: 'https://www.google.com/maps?q=9.9347,106.3449',
    opening_time: null, // Không tự điền giờ giả
    closing_time: null,
    display_hours: null,
    price_raw: null, // Xóa "Miễn phí" chưa xác minh
    contact: null, // Không có hotline riêng
    status: 'draft', // Chuẩn bị cho bước review (hidden -> draft)
    operating_status: 'Normal',
    images: [], // Runtime enforcement: chưa xác minh bản quyền -> rỗng
    image_link: null, // Runtime enforcement: chưa xác minh bản quyền -> null
    expected_updated_at: beforeRecord.updated_at,
    updated_at: new Date().toISOString()
  };

  const fieldSources = {
    name: {
      source_url: 'https://bvhttdl.gov.vn/danh-lam-thang-canh-ao-ba-om-tinh-tra-vinh-2021.htm',
      rationale: 'Loại bỏ hậu tố rác "aa", giữ tên chuẩn Danh thắng Quốc gia QĐ 1460-QĐ/VH'
    },
    slug: {
      source_url: null,
      rationale: 'Bảo tồn slug hiện hữu "ao-ba-om", không thay đổi để tránh đứt gãy sitemap/canonical'
    },
    address: {
      source_url: 'https://bvhttdl.gov.vn/danh-lam-thang-canh-ao-ba-om-tinh-tra-vinh-2021.htm',
      rationale: 'Cập nhật theo địa giới hành chính NQ 1687/NQ-UBTVQH15, lưu legacy_address trong audit'
    },
    legacy_address: {
      source_url: null,
      rationale: 'Khóm 4, Phường 8, Thành phố Trà Vinh, Tỉnh Trà Vinh'
    },
    coordinates: {
      source_url: 'https://www.openstreetmap.org/relation/11831818',
      rationale: 'Mốc trắc địa tâm hồ và khuôn viên mặt nước Ao Bà Om (community_cartographic_source)'
    },
    opening_time: {
      source_url: null,
      rationale: 'Khuôn viên ngoài trời mở tự do; không tự điền giờ giả, giữ UNKNOWN/null'
    },
    closing_time: {
      source_url: null,
      rationale: 'Khuôn viên ngoài trời mở tự do; không tự điền giờ giả, giữ UNKNOWN/null'
    },
    price_raw: {
      source_url: null,
      rationale: 'Chưa có biểu giá chính thức; xóa chuỗi "Miễn phí" tự suy diễn, đặt về UNKNOWN/null'
    },
    contact: {
      source_url: null,
      rationale: 'Không có hotline quản lý riêng; loại bỏ số mô phỏng, đặt về null'
    },
    images: {
      source_url: null,
      can_publish: false,
      rationale: 'Ảnh nội bộ (./ao bà om.jpg) chưa được thẩm định bản quyền/giấy phép phát hành; runtime đặt images=[] và image_link=null để ngăn chặn tuyệt đối việc hiển thị công khai trước khi có bản quyền hợp pháp.'
    },
    image_link: {
      source_url: null,
      can_publish: false,
      rationale: 'Đặt null cùng với images=[] để bảo đảm runtime không phát hành ảnh chưa xác minh bản quyền.'
    },
    status: {
      source_url: null,
      rationale: 'Bước 1 trong quy trình 3 bước: chuyển từ hidden sang draft để review trước khi approve'
    }
  };

  const changedFields = Object.keys(afterRecord).filter(k => {
    if (k === 'updated_at' || k === 'expected_updated_at') return false;
    return JSON.stringify(beforeRecord[k]) !== JSON.stringify(afterRecord[k]);
  });

  // Rollback payload khôi phục nguyên trạng 100% beforeRecord
  const rollbackPayload = {};
  for (const k of changedFields) {
    rollbackPayload[k] = beforeRecord[k] !== undefined ? beforeRecord[k] : null;
  }

  return {
    afterRecord,
    fieldSources,
    changedFields,
    rollbackPayload
  };
}

/**
 * Xây dựng proposed after record và field_sources cho ID 3 (Chùa Âng)
 */
export function buildProposedPatchForPlace3(beforeRecord) {
  const afterRecord = {
    ...beforeRecord,
    name: 'Chùa Âng',
    slug: 'chua-ang',
    category: beforeRecord.category || 'Du Lịch Tâm Linh',
    area: 'TP. Trà Vinh',
    address: 'Khóm 4, phường Nguyệt Hóa, tỉnh Vĩnh Long', // NQ 1687/NQ-UBTVQH15
    coordinates: '9.9322,106.3364',
    map_link: 'https://www.google.com/maps?q=9.9322,106.3364',
    opening_time: null, // Không tự điền giờ giả
    closing_time: null,
    display_hours: null,
    price_raw: null, // Xóa "Miễn phí" chưa xác minh
    rating: null, // Xóa rating 5 chưa có đánh giá người dùng thực tế
    description: 'Ngôi chùa Khmer cổ kính và tiêu biểu bậc nhất Nam Bộ khởi dựng từ năm 990, tọa lạc trong khuôn viên danh thắng Ao Bà Om và được công nhận là Di tích lịch sử - văn hóa cấp quốc gia.',
    note: null, // Xóa note tự suy diễn
    contact: null,
    status: 'draft', // Chuẩn bị cho bước review
    operating_status: 'Normal',
    images: [], // Runtime enforcement: chưa xác minh bản quyền -> rỗng
    image_link: null, // Runtime enforcement: chưa xác minh bản quyền -> null
    expected_updated_at: beforeRecord.updated_at,
    updated_at: new Date().toISOString()
  };

  const fieldSources = {
    name: {
      source_url: 'https://dantoc.vietnamtourism.gov.vn/chua-ang-ngoi-co-tu-khmer-tuyet-dep-o-vinh-long/',
      rationale: 'Tên ngôi cổ tự Chùa Âng theo bài viết Cổng thông tin Cục Du lịch Quốc gia Việt Nam'
    },
    slug: {
      source_url: null,
      rationale: 'Bảo tồn slug hiện hữu "chua-ang", không thay đổi'
    },
    address: {
      source_url: 'https://dantoc.vietnamtourism.gov.vn/chua-ang-ngoi-co-tu-khmer-tuyet-dep-o-vinh-long/',
      rationale: 'Cập nhật theo địa giới NQ 1687/NQ-UBTVQH15, lưu legacy_address'
    },
    legacy_address: {
      source_url: null,
      rationale: 'Khóm 4, phường 8, TP. Trà Vinh'
    },
    coordinates: {
      source_url: 'https://www.openstreetmap.org/node/5347209172',
      rationale: 'Mốc trắc địa chánh điện Chùa Âng (community_cartographic_source)'
    },
    opening_time: {
      source_url: null,
      rationale: 'Chưa có quy định giờ mở cửa chính thức từ Ban Quản trị; giữ UNKNOWN/null'
    },
    closing_time: {
      source_url: null,
      rationale: 'Chưa có quy định giờ đóng cửa chính thức; giữ UNKNOWN/null'
    },
    price_raw: {
      source_url: null,
      rationale: 'Xóa "Miễn phí" tự suy diễn, đặt về UNKNOWN/null'
    },
    rating: {
      source_url: null,
      rationale: 'Chưa có lượt đánh giá người dùng thực tế nào được kiểm duyệt; xóa điểm 5 tự gán, đặt về null (hiển thị "Chưa có đánh giá")'
    },
    description: {
      source_url: 'https://dantoc.vietnamtourism.gov.vn/chua-ang-ngoi-co-tu-khmer-tuyet-dep-o-vinh-long/',
      rationale: 'Mô tả chuẩn xác theo bài viết trên Cổng thông tin Cục Du lịch Quốc gia Việt Nam: Chùa Âng là ngôi chùa Khmer cổ kính khởi dựng từ năm 990, tọa lạc trong cụm danh thắng Ao Bà Om.'
    },
    note: {
      source_url: null,
      rationale: 'Xóa ghi chú nhắc nhở chưa có nguồn quy định chính thức; giữ null'
    },
    contact: {
      source_url: null,
      rationale: 'Chưa có số hotline công bố chính thức; giữ null'
    },
    images: {
      source_url: null,
      can_publish: false,
      rationale: 'Ảnh nội bộ (./chùa âng.jpg) chưa được thẩm định bản quyền/giấy phép phát hành; runtime đặt images=[] và image_link=null để ngăn chặn tuyệt đối việc hiển thị công khai trước khi có bản quyền hợp pháp.'
    },
    image_link: {
      source_url: null,
      can_publish: false,
      rationale: 'Đặt null cùng với images=[] để bảo đảm runtime không phát hành ảnh chưa xác minh bản quyền.'
    },
    status: {
      source_url: null,
      rationale: 'Bước 1 trong quy trình 3 bước: chuyển từ hidden sang draft để review trước khi approve'
    }
  };

  const changedFields = Object.keys(afterRecord).filter(k => {
    if (k === 'updated_at' || k === 'expected_updated_at') return false;
    return JSON.stringify(beforeRecord[k]) !== JSON.stringify(afterRecord[k]);
  });

  const rollbackPayload = {};
  for (const k of changedFields) {
    rollbackPayload[k] = beforeRecord[k] !== undefined ? beforeRecord[k] : null;
  }

  return {
    afterRecord,
    fieldSources,
    changedFields,
    rollbackPayload
  };
}

/**
 * Tạo gói kế hoạch G9.3C dry-run
 */
export async function generatePilotPlan(options = {}) {
  const args = options.args || process.argv.slice(2);
  const isExecute = args.includes('--execute') || options.execute;
  const isDryRun = args.includes('--dry-run') || options.dryRun || true;

  if (isExecute) {
    throw new Error('EXECUTE_FORBIDDEN: Mốc G9.3C chỉ cho phép dry-run và lập kế hoạch. Cờ --execute bị nghiêm cấm.');
  }

  // Phân tích tham số --ids
  const idsArg = args.find(a => a.startsWith('--ids='));
  let requestedIds = PILOT_TARGET_IDS;
  if (idsArg) {
    const rawIds = idsArg.replace('--ids=', '').split(',').map(s => Number(s.trim())).filter(Boolean);
    for (const id of rawIds) {
      if (!PILOT_TARGET_IDS.includes(id)) {
        throw new Error(`FORBIDDEN_ID: ID ${id} không thuộc phạm vi cho phép của pilot G9.3C (chỉ gồm [1, 3]).`);
      }
    }
    requestedIds = rawIds;
  }

  console.log('\n=== LẬP KẾ HOẠCH & CHUẨN BỊ DRY-RUN BẢN VÁ PILOT G9.3C ===');
  console.log(`Chế độ thực thi      : DRY-RUN ONLY (Zero Mutation)`);
  console.log(`Mục tiêu được duyệt   : ID [${requestedIds.join(', ')}]\n`);

  // Tải dữ liệu production hiện tại
  const { source, places, comments, reports, auditLogs } = await loadPilotProductionRecords(options);

  if (places.length < requestedIds.length) {
    throw new Error(`MISSING_RECORDS: Chỉ tìm thấy ${places.length}/${requestedIds.length} bản ghi mục tiêu.`);
  }

  const backupsDir = options.backupsDir || BACKUPS_DIR;
  const dataDir = options.dataDir || DATA_DIR;
  const shouldSaveFiles = options.saveFiles !== false;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const manifestFileName = `g9-pilot-1-3-manifest-${timestamp}.json`;
  const manifestFilePath = path.join(backupsDir, manifestFileName);

  const manifestData = {
    manifest_type: 'pilot_pre_patch_snapshot',
    environment: 'production',
    data_source: source,
    captured_at: new Date().toISOString(),
    target_ids: requestedIds,
    places: places.filter(p => requestedIds.includes(p.id)),
    comments: comments.filter(c => ['ao-ba-om', 'chua-ang'].includes(c.place_id)),
    reports: reports.filter(r => requestedIds.includes(r.place_id)),
    audit_logs: auditLogs,
    checksums: {}
  };

  for (const p of manifestData.places) {
    manifestData.checksums[`place_${p.id}_sha256`] = computeRecordChecksum(p);
  }
  manifestData.checksums['combined_sha256'] = crypto
    .createHash('sha256')
    .update(JSON.stringify(manifestData.places))
    .digest('hex');

  // Ghi snapshot manifest ra backups/ nếu cho phép lưu file
  if (shouldSaveFiles) {
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
    fs.writeFileSync(manifestFilePath, JSON.stringify(manifestData, null, 2), 'utf8');
    console.log(`✓ Đã lưu snapshot manifest: ${path.relative(ROOT_DIR, manifestFilePath)}`);
  }

  // Xây dựng proposed patches
  const patches = [];

  for (const targetId of requestedIds) {
    const beforeRecord = places.find(p => p.id === targetId);
    let patchDetail;

    if (targetId === 1) {
      patchDetail = buildProposedPatchForPlace1(beforeRecord);
    } else if (targetId === 3) {
      patchDetail = buildProposedPatchForPlace3(beforeRecord);
    } else {
      continue;
    }

    const { afterRecord, fieldSources, changedFields, rollbackPayload } = patchDetail;

    // Chạy validator trên after payload
    const draftValidation = validatePlace(afterRecord, { mode: 'draft' });
    const approvalValidation = validatePlace(afterRecord, { mode: 'approval' });

    if (!draftValidation.valid) {
      throw new Error(`VALIDATOR_ERROR: Bản vá ID ${targetId} không vượt qua validator draft: ${JSON.stringify(draftValidation.errors)}`);
    }

    // Kiểm tra tính toàn vẹn trường thay đổi phải thuộc allowlist
    for (const f of changedFields) {
      if (!ALLOWED_PATCH_FIELDS.has(f)) {
        throw new Error(`DISALLOWED_FIELD: Trường '${f}' không nằm trong allowlist cập nhật.`);
      }
    }

    const beforeChecksum = computeRecordChecksum(beforeRecord);
    const afterChecksum = computeRecordChecksum(afterRecord);

    patches.push({
      place_id: targetId,
      slug: beforeRecord.slug,
      concurrency_token: {
        expected_before_sha256: beforeChecksum,
        expected_updated_at: beforeRecord.updated_at
      },
      before: beforeRecord,
      after: afterRecord,
      changed_fields: changedFields,
      field_sources: fieldSources,
      rollback_payload: rollbackPayload,
      patch_payload: {
        id: targetId,
        expected_updated_at: beforeRecord.updated_at,
        ...Object.fromEntries(changedFields.map(f => [f, afterRecord[f]]))
      },
      checksums: {
        before_sha256: beforeChecksum,
        after_sha256: afterChecksum
      },
      expected_validator_result: {
        draft_valid: draftValidation.valid,
        draft_errors: draftValidation.errors,
        draft_warnings: draftValidation.warnings,
        approval_valid: approvalValidation.valid,
        approval_errors: approvalValidation.errors,
        approval_warnings: approvalValidation.warnings
      }
    });

    console.log(`✓ [ID ${targetId}] ${afterRecord.name}: Chuẩn bị bản vá thành công (${changedFields.length} trường thay đổi)`);
  }

  const isValidProductionPatch = manifestData.data_source === 'live_supabase';
  const proposedPatchesData = {
    plan_version: '1.0.0',
    generated_at: new Date().toISOString(),
    mode: 'DRY_RUN_ONLY',
    data_source: manifestData.data_source,
    captured_at: manifestData.captured_at,
    is_valid_production_patch: isValidProductionPatch,
    ...(isValidProductionPatch ? {} : {
      notice: 'Tệp này chỉ là bản vá mẫu kiểm thử cú pháp (dry-run fixture), không được tạo từ live_supabase. KHÔNG ĐƯỢC COI LÀ BẢN VÁ PRODUCTION HỢP LỆ.'
    }),
    target_ids: requestedIds,
    manifest_reference: manifestFileName,
    patches
  };

  const proposedPatchesFilePath = path.join(dataDir, 'g9-pilot-1-3-proposed-patches.json');
  if (shouldSaveFiles) {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(proposedPatchesFilePath, JSON.stringify(proposedPatchesData, null, 2), 'utf8');
    console.log(`✓ Đã lưu proposed patches JSON: ${path.relative(ROOT_DIR, proposedPatchesFilePath)}\n`);
  }

  console.log('========================================');
  console.log('KẾT QUẢ DRY-RUN: 2/2 BẢN VÁ ĐẠT TIÊU CHUẨN');
  console.log('========================================\n');

  return {
    manifestFileName,
    manifestData,
    proposedPatchesData
  };
}

// Chạy trực tiếp qua CLI
if (process.argv[1] && process.argv[1].endsWith('plan-g9-pilot.js')) {
  generatePilotPlan()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('\n❌ LỖI TRONG QUÁ TRÌNH LẬP KẾ HOẠCH DRY-RUN:', err.message);
      process.exit(1);
    });
}
