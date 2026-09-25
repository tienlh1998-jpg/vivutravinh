// scripts/execute-g9-rehab-ao-ba-om.js
// Bước 2: Chuẩn hóa & Nghiệm thu danh thắng Ao Bà Om (ID 1) trên Supabase Production.
// Khử sạch dữ liệu rác/suy diễn: rating=null (bỏ fake 5 sao), note=null, description chính thức từ Báo Nhân Dân / Bộ VHTTDL.
// Bảo đảm OCC khóa lạc quan, Snapshot backup trước mutation, Fail-closed admin token, bắt buộc --execute và --confirm.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { validatePlace } from '../js/place-validator.js';
import { SUPABASE_ANON_KEY } from '../js/config.js';
import { loadLiveEnvConfig, resolveAndAuthenticateAdmin } from './execute-g9-cleanup-step1.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const BACKUPS_DIR = path.join(REPO_ROOT, 'backups');

export const AO_BA_OM_ID = 1;

export const REHAB_AO_BA_OM_PAYLOAD = Object.freeze({
  name: 'Ao Bà Om',
  slug: 'ao-ba-om',
  category: 'Điểm Check-in / Sống Ảo',
  area: 'TP. Trà Vinh',
  address: 'Khóm 4, phường Nguyệt Hóa, tỉnh Vĩnh Long', // NQ 1687/NQ-UBTVQH15
  coordinates: '9.9347,106.3449', // Mốc tâm danh thắng theo OSM relation 11831818
  map_link: 'https://www.google.com/maps?q=9.9347,106.3449',
  description: 'Ao Bà Om là di tích danh lam thắng cảnh cấp Quốc gia nổi tiếng của Trà Vinh, gắn liền với quần thể không gian văn hóa Chùa Âng và Bảo tàng Văn hóa dân tộc Khmer.',
  price_raw: null,
  rating: null,
  note: null,
  contact: null,
  opening_time: null,
  closing_time: null,
  display_hours: null,
  images: [],
  image_link: null,
  status: 'approved'
});

export const AO_BA_OM_SOURCES = Object.freeze({
  identity: {
    source_url: 'https://nhandan.vn/doc-dao-chua-khmer-o-tra-vinh-post769288.html',
    rationale: 'Di tích lịch sử - văn hóa cấp Quốc gia loại hình danh lam thắng cảnh (QĐ 1460-QĐ/VH năm 1994)'
  },
  address: {
    source_url: 'https://nhandan.vn/doc-dao-chua-khmer-o-tra-vinh-post769288.html',
    rationale: 'Khóm 4, phường Nguyệt Hóa, tỉnh Vĩnh Long theo Nghị quyết 1687/NQ-UBTVQH15'
  },
  coordinates: {
    source_url: 'https://www.openstreetmap.org/relation/11831818',
    coordinate_precision: 'approximate_area_center',
    rationale: 'Tọa độ tâm mặt nước khuôn viên danh thắng Ao Bà Om theo OSM relation 11831818'
  },
  description: {
    source_url: 'https://nhandan.vn/doc-dao-chua-khmer-o-tra-vinh-post769288.html',
    rationale: 'Trích xuất dữ kiện lịch sử và danh lam thắng cảnh Ao Bà Om từ Báo Nhân Dân chuyên đề'
  }
});

/**
 * Đọc bản ghi ID 1 trực tiếp từ live Supabase
 */
export async function fetchLivePlaceId1(options = {}) {
  const env = options.env || loadLiveEnvConfig();
  const supabaseUrl = env.SUPABASE_URL || 'https://foyraoimhksfvlxndwxr.supabase.co';
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    throw new Error('FAIL_CLOSED: Thiếu SUPABASE_SERVICE_ROLE_KEY để truy vấn CSDL live.');
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/places?id=eq.${AO_BA_OM_ID}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`
    }
  });

  if (!res.ok) {
    throw new Error(`FETCH_FAILED: Không thể truy vấn bản ghi ID 1 (HTTP ${res.status}).`);
  }

  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`NOT_FOUND: Không tìm thấy bản ghi ID ${AO_BA_OM_ID} trên Supabase live.`);
  }

  return rows[0];
}

/**
 * Lưu snapshot backup bản ghi ID 1 trước khi phục hồi
 */
export function savePreRehabSnapshot(liveRecord, options = {}) {
  const backupsDir = options.backupsDir || BACKUPS_DIR;
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

  const nowIso = new Date().toISOString();
  const fileDate = nowIso.replace(/[:.]/g, '-');
  const manifestPath = path.join(backupsDir, `g9-rehab-ao-ba-om-pre-manifest-${fileDate}.json`);

  const manifest = {
    manifest_type: 'g9_4_step2_rehab_ao_ba_om_pre_snapshot',
    environment: 'production',
    created_at: nowIso,
    target_id: AO_BA_OM_ID,
    slug: liveRecord.slug,
    live_record_before: liveRecord,
    rehab_payload: REHAB_AO_BA_OM_PAYLOAD,
    field_sources: AO_BA_OM_SOURCES,
    checksum_sha256: crypto.createHash('sha256').update(JSON.stringify(liveRecord)).digest('hex'),
    rollback_payload: {
      name: liveRecord.name,
      category: liveRecord.category,
      area: liveRecord.area,
      address: liveRecord.address,
      map_link: liveRecord.map_link,
      price_raw: liveRecord.price_raw,
      description: liveRecord.description,
      note: liveRecord.note,
      contact: liveRecord.contact,
      coordinates: liveRecord.coordinates,
      rating: liveRecord.rating,
      opening_time: liveRecord.opening_time,
      closing_time: liveRecord.closing_time,
      status: liveRecord.status,
      images: liveRecord.images
    }
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return { manifestPath, manifest };
}

/**
 * Quy trình chính thực thi Bước 2: Chuẩn hóa & Nghiệm thu Ao Bà Om (ID 1)
 */
export async function executeStep2RehabAoBaOm(options = {}) {
  const args = options.args || process.argv.slice(2);
  const isExecute = options.execute !== undefined ? options.execute : args.includes('--execute');
  const isConfirm = options.confirm !== undefined ? options.confirm : args.includes('--confirm');
  const isDryRun = !(isExecute && isConfirm);

  console.log('======================================================================');
  console.log('🚀 BƯỚC 2: PHỤC HỒI & CHUẨN HÓA AO BÀ OM (ID 1) TRÊN PRODUCTION');
  console.log(`   Chế độ hoạt động: ${isDryRun ? '🔍 DRY-RUN (MÔ PHỎNG AN TOÀN — ZERO MUTATION)' : '⚡ EXECUTE MUTATION (CÓ XÁC NHẬN)'}`);
  console.log('======================================================================\n');

  // 1. Đọc lại bản ghi ID 1 trực tiếp từ production
  console.log('--- 1. TRUY VẤN LIVE SUPABASE ID 1 & UPDATED_AT ---');
  const liveRecord = await fetchLivePlaceId1(options);
  console.log(`  • ID                   : ${liveRecord.id}`);
  console.log(`  • Slug                 : ${liveRecord.slug}`);
  console.log(`  • Tên hiện tại         : ${liveRecord.name}`);
  console.log(`  • Trạng thái hiện tại  : ${liveRecord.status}`);
  console.log(`  • Rating cũ (cần khử) : ${liveRecord.rating} (-> null)`);
  console.log(`  • Note cũ (cần khử)   : "${liveRecord.note}" (-> null)`);
  console.log(`  • updated_at live      : ${liveRecord.updated_at}`);

  // 2. Thẩm định Schema & Invariant
  console.log('\n--- 2. THẨM ĐỊNH HỢP ĐỒNG SCHEMA (validatePlace) ---');
  const val = validatePlace(REHAB_AO_BA_OM_PAYLOAD, { mode: 'approval' });
  console.log(`  • Kết quả validate     : valid=${val.valid}, errors=${val.errors.length}, warnings=${val.warnings.length}`);
  if (!val.valid || val.errors.length > 0) {
    throw new Error(`VALIDATION_FAILED: Payload phục hồi không đạt chuẩn: ${JSON.stringify(val.errors)}`);
  }
  console.log('  ✓ Đạt chuẩn 100% validatePlace ở chế độ approval!');

  // 3. Lưu snapshot manifest & rollback payload
  console.log('\n--- 3. TẠO SNAPSHOT & ROLLBACK PAYLOAD ---');
  const { manifestPath, manifest } = savePreRehabSnapshot(liveRecord, options);
  console.log(`  • Snapshot manifest    : ${manifestPath}`);
  console.log(`  • Checksum SHA-256     : ${manifest.checksum_sha256}`);

  // 4. Xác thực danh tính quản trị viên (Fail-Closed)
  console.log('\n--- 4. XÁC THỰC DANH TÍNH QUẢN TRỊ VIÊN ---');
  const adminActor = await resolveAndAuthenticateAdmin(options);
  console.log(`  • Actor xác thực       : ${adminActor.email} (Role: ${adminActor.role}, UUID: ${adminActor.id})`);

  // 5. Nếu là Dry-Run, dừng an toàn
  if (isDryRun) {
    console.log('\n----------------------------------------------------------------------');
    console.log('🔍 KẾT QUẢ MÔ PHỎNG DRY-RUN:');
    console.log('  • Xác thực token quản trị viên: THÀNH CÔNG');
    console.log(`  • Actor hợp lệ               : ${adminActor.email}`);
    console.log(`  • Mục tiêu live              : ID ${liveRecord.id} (${liveRecord.name})`);
    console.log(`  • Khử dữ liệu suy diễn       : rating: ${liveRecord.rating} -> null, note: "${liveRecord.note}" -> null`);
    console.log(`  • Mô tả chuẩn hóa            : Nguồn Báo Nhân Dân / Bộ VHTTDL QĐ 1460-QĐ/VH`);
    console.log(`  • Yêu cầu cờ thực thi        : ${isExecute ? '✓ có --execute' : '✗ thiếu --execute'}, ${isConfirm ? '✓ có --confirm' : '✗ thiếu --confirm'}`);
    console.log('----------------------------------------------------------------------');
    console.log('ℹ️  Để thực thi phục hồi trên production, bắt buộc truyền ĐỒNG THỜI cả hai cờ:');
    console.log('   node scripts/execute-g9-rehab-ao-ba-om.js --execute --confirm\n');
    return {
      success: true,
      dryRun: true,
      mutated: false,
      liveRecord,
      adminActor,
      manifestPath
    };
  }

  // 6. Thực thi mutation qua RPC admin_update_place_atomic kèm OCC
  console.log('\n--- 5. THỰC THI CHUẨN HÓA VỚI KHÓA LẠC QUAN (OCC) ---');
  const env = options.env || loadLiveEnvConfig();
  const supabaseUrl = env.SUPABASE_URL || 'https://foyraoimhksfvlxndwxr.supabase.co';
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const correlationId = `g9-rehab-ao-ba-om-${Date.now()}`;

  const patchPayload = {
    ...REHAB_AO_BA_OM_PAYLOAD,
    expected_updated_at: liveRecord.updated_at
  };

  const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/admin_update_place_atomic`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_actor_id: adminActor.id,
      p_actor_email: adminActor.email,
      p_actor_role: adminActor.role,
      p_place_id: AO_BA_OM_ID,
      p_patch: patchPayload,
      p_ip: '127.0.0.1',
      p_correlation_id: correlationId
    })
  });

  const rpcData = await rpcRes.json().catch(() => null);
  if (!rpcRes.ok) {
    const errMsg = rpcData?.message || `HTTP ${rpcRes.status}`;
    if (rpcRes.status === 409 || errMsg.includes('CONFLICT') || errMsg.includes('40001')) {
      console.error('\n❌ 409 CONFLICT: updated_at đã bị thay đổi đồng thời trên production!');
      throw new Error(`409 CONFLICT: OCC mismatch (${liveRecord.updated_at}). Mutation bị chặn đứng an toàn.`);
    }
    throw new Error(`RPC_FAILED: admin_update_place_atomic thất bại: ${errMsg}`);
  }

  console.log('  ✓ admin_update_place_atomic thành công!');
  console.log(`  • ID 1 Trạng thái mới  : ${rpcData.status}`);
  console.log(`  • Tên chuẩn mới        : ${rpcData.name}`);
  console.log(`  • Rating mới           : ${rpcData.rating} (Đã khử fake rating)`);
  console.log(`  • Note mới             : ${rpcData.note} (Đã khử ghi chú cảm tính)`);
  console.log(`  • updated_at mới       : ${rpcData.updated_at}`);

  // 7. Read-back đối soát trực tiếp
  console.log('\n--- 6. ĐỐI SOÁT READ-BACK TRỰC TIẾP TỪ SUPABASE ---');
  const verifiedRecord = await fetchLivePlaceId1(options);
  if (verifiedRecord.name !== 'Ao Bà Om') throw new Error('Đối soát tên thất bại');
  if (verifiedRecord.rating !== null) throw new Error('Đối soát rating thất bại');
  if (verifiedRecord.note !== null) throw new Error('Đối soát note thất bại');
  if (verifiedRecord.status !== 'approved') throw new Error('Đối soát status thất bại');
  console.log('  ✓ Xác nhận toàn bộ dữ liệu đối soát đạt chuẩn 100%!');

  // 8. Xác minh route live công khai
  console.log('\n--- 7. XÁC MINH ROUTE CÔNG KHAI https://vivutravinh.id.vn/place/ao-ba-om ---');
  const routeUrl = 'https://vivutravinh.id.vn/place/ao-ba-om';
  const routeRes = await fetch(routeUrl, { headers: { 'Cache-Control': 'no-cache' } });
  console.log(`  • HTTP Status: ${routeRes.status}`);
  if (routeRes.status !== 200) {
    throw new Error(`ROUTE_VERIFICATION_FAILED: Route công khai ${routeUrl} trả về HTTP ${routeRes.status} (kỳ vọng 200).`);
  }
  console.log('  ✓ Route công khai trả về HTTP 200 OK!');

  console.log('\n======================================================================');
  console.log('🎉 BƯỚC 2 HOÀN TẤT THÀNH CÔNG: ĐÃ CHUẨN HÓA & NGHIỆM THU AO BÀ OM (ID 1)!');
  console.log('   - Tên: "Ao Bà Om"');
  console.log('   - Rating: null (Hiển thị "Chưa có đánh giá")');
  console.log('   - Note: null');
  console.log('   - Route /place/ao-ba-om: HTTP 200 OK');
  console.log('======================================================================\n');

  return {
    success: true,
    dryRun: false,
    mutated: true,
    verifiedRecord,
    manifestPath
  };
}

// Chạy trực tiếp qua CLI
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  executeStep2RehabAoBaOm().catch(err => {
    console.error('\n❌ LỖI TRONG QUÁ TRÌNH PHỤC HỒI BƯỚC 2:', err.message);
    process.exit(1);
  });
}
