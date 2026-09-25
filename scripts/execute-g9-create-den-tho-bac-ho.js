// scripts/execute-g9-create-den-tho-bac-ho.js
// Bước 3: Tạo & Phê duyệt Đền thờ Bác Hồ Trà Vinh (den-tho-bac-ho-tra-vinh) trên Supabase Production.
// Quy trình: Tạo draft -> Kiểm tra route HTTP 404 -> Duyệt approved với OCC -> Xác minh route HTTP 200 OK.
// Tuân thủ 100% nguyên tắc: Zero-Speculation, Snapshot trước mutation, Fail-closed token, bắt buộc --execute và --confirm.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { validatePlace } from '../js/place-validator.js';
import { SUPABASE_ANON_KEY } from '../js/config.js';
import { loadLiveEnvConfig, resolveAndAuthenticateAdmin, fetchAllLivePlaces } from './execute-g9-cleanup-step1.js';
import { loadProposedCandidate } from './preview-g9-den-tho-bac-ho.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const BACKUPS_DIR = path.join(REPO_ROOT, 'backups');
const PUBLIC_ROUTE_URL = 'https://vivutravinh.id.vn/place/den-tho-bac-ho-tra-vinh';

/**
 * Lưu snapshot manifest dự phòng trước khi tạo
 */
export function savePreCreationManifest(candidate, livePlaces, options = {}) {
  const backupsDir = options.backupsDir || BACKUPS_DIR;
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

  const nowIso = new Date().toISOString();
  const fileDate = nowIso.replace(/[:.]/g, '-');
  const manifestPath = path.join(backupsDir, `g9-create-den-tho-bac-ho-pre-manifest-${fileDate}.json`);

  const manifest = {
    manifest_type: 'g9_4_step3_create_den_tho_bac_ho_pre_snapshot',
    environment: 'production',
    created_at: nowIso,
    target_slug: candidate.slug,
    total_live_places_before: livePlaces.length,
    proposed_draft_payload: candidate.draft_payload,
    field_sources: candidate.field_sources,
    rollback_strategy: {
      action: 'archive',
      slug: candidate.slug,
      client_submission_id: candidate.client_submission_id
    },
    checksum_sha256: crypto.createHash('sha256').update(JSON.stringify(candidate.draft_payload)).digest('hex')
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return { manifestPath, manifest };
}

/**
 * Quy trình chính thực thi Bước 3: Tạo & Approve Đền thờ Bác Hồ Trà Vinh
 */
export async function executeStep3DenThoBacHo(options = {}) {
  const args = options.args || process.argv.slice(2);
  const isExecute = options.execute !== undefined ? options.execute : args.includes('--execute');
  const isConfirm = options.confirm !== undefined ? options.confirm : args.includes('--confirm');
  const isDryRun = !(isExecute && isConfirm);

  console.log('======================================================================');
  console.log('🚀 BƯỚC 3: TẠO & PHÊ DUYỆT ĐỀN THỜ BÁC HỒ TRÀ VINH TRÊN PRODUCTION');
  console.log(`   Chế độ hoạt động: ${isDryRun ? '🔍 DRY-RUN (MÔ PHỎNG AN TOÀN — ZERO MUTATION)' : '⚡ EXECUTE MUTATION (CÓ XÁC NHẬN)'}`);
  console.log('======================================================================\n');

  // 1. Tải hồ sơ ứng viên chuẩn hóa
  console.log('--- 1. NẠP HỒ SƠ ỨNG VIÊN TỪ MANIFEST G9.4 ---');
  const { candidate } = loadProposedCandidate(options);
  console.log(`  • Tên ứng viên         : ${candidate.name}`);
  console.log(`  • Slug canonical       : ${candidate.slug}`);
  console.log(`  • Danh mục             : ${candidate.draft_payload.category}`);
  console.log(`  • Tọa độ GPS           : ${candidate.draft_payload.coordinates}`);
  console.log(`  • Địa chỉ              : ${candidate.draft_payload.address}`);
  console.log(`  • Idempotency key      : ${candidate.client_submission_id}`);

  // 2. Thẩm định schema
  console.log('\n--- 2. THẨM ĐỊNH HỢP ĐỒNG SCHEMA (validatePlace) ---');
  const valDraft = validatePlace(candidate.draft_payload, { mode: 'draft' });
  const valApprove = validatePlace({ ...candidate.draft_payload, status: 'approved' }, { mode: 'approval' });
  console.log(`  • Draft mode   : valid=${valDraft.valid}, errors=${valDraft.errors.length}, warnings=${valDraft.warnings.length}`);
  console.log(`  • Approval mode: valid=${valApprove.valid}, errors=${valApprove.errors.length}, warnings=${valApprove.warnings.length}`);
  if (!valDraft.valid || valDraft.errors.length > 0 || !valApprove.valid || valApprove.errors.length > 0) {
    throw new Error('VALIDATION_FAILED: Dữ liệu Đền thờ Bác Hồ không vượt qua kiểm tra schema');
  }
  console.log('  ✓ Đạt chuẩn 100% schema cả ở chế độ draft và approval!');

  // 3. Đối soát va chạm trên CSDL Live Supabase
  console.log('\n--- 3. ĐỐI SOÁT VA CHẠM TRÊN CSDL LIVE SUPABASE ---');
  const livePlaces = await fetchAllLivePlaces(options);
  console.log(`  • Tổng số địa điểm hiện tại: ${livePlaces.length}`);

  const existingSlug = livePlaces.find(p => p.slug === candidate.slug);
  const existingCoord = livePlaces.find(p => p.coordinates === candidate.draft_payload.coordinates && p.status !== 'archived');

  if (existingCoord && existingCoord.slug !== candidate.slug) {
    throw new Error(`COORDINATES_COLLISION: Tọa độ ${candidate.draft_payload.coordinates} đã bị trùng với địa điểm ID ${existingCoord.id} (${existingCoord.name}).`);
  }

  // 4. Kiểm tra route public hiện tại
  console.log('\n--- 4. KIỂM TRA ROUTE CÔNG KHAI TRƯỚC KHI TẠO ---');
  const preRouteRes = await fetch(PUBLIC_ROUTE_URL, { headers: { 'Cache-Control': 'no-cache' } });
  console.log(`  • ${PUBLIC_ROUTE_URL} -> HTTP ${preRouteRes.status}`);
  if (!existingSlug && preRouteRes.status !== 404) {
    console.warn(`  ⚠️ Cảnh báo: Địa điểm chưa tạo nhưng route trả về HTTP ${preRouteRes.status} thay vì 404!`);
  }

  // 5. Lưu snapshot manifest dự phòng
  console.log('\n--- 5. TẠO SNAPSHOT MANIFEST & KẾ HOẠCH ROLLBACK ---');
  const { manifestPath, manifest } = savePreCreationManifest(candidate, livePlaces, options);
  console.log(`  • Snapshot manifest    : ${manifestPath}`);
  console.log(`  • Checksum SHA-256     : ${manifest.checksum_sha256}`);

  // 6. Xác thực quản trị viên
  console.log('\n--- 6. XÁC THỰC DANH TÍNH QUẢN TRỊ VIÊN (FAIL-CLOSED) ---');
  const adminActor = await resolveAndAuthenticateAdmin(options);
  console.log(`  • Actor xác thực       : ${adminActor.email} (Role: ${adminActor.role}, UUID: ${adminActor.id})`);

  // 7. Nếu là Dry-Run, dừng an toàn
  if (isDryRun) {
    console.log('\n----------------------------------------------------------------------');
    console.log('🔍 KẾT QUẢ MÔ PHỎNG DRY-RUN:');
    console.log('  • Xác thực token quản trị viên: THÀNH CÔNG');
    console.log(`  • Actor hợp lệ               : ${adminActor.email}`);
    console.log(`  • Mục tiêu tạo mới           : ${candidate.name} (${candidate.slug})`);
    console.log(`  • Va chạm slug               : ${existingSlug ? `ĐÃ TỒN TẠI (ID ${existingSlug.id})` : 'KHÔNG (CHUẨN)'}`);
    console.log('  • Thao tác dự kiến           : Tạo status="draft" -> Check 404 -> Chuyển status="approved" -> Check 200');
    console.log(`  • Yêu cầu cờ thực thi        : ${isExecute ? '✓ có --execute' : '✗ thiếu --execute'}, ${isConfirm ? '✓ có --confirm' : '✗ thiếu --confirm'}`);
    console.log('----------------------------------------------------------------------');
    console.log('ℹ️  Để thực thi tạo & phê duyệt trên production, bắt buộc truyền ĐỒNG THỜI cả hai cờ:');
    console.log('   node scripts/execute-g9-create-den-tho-bac-ho.js --execute --confirm\n');
    return {
      success: true,
      dryRun: true,
      mutated: false,
      candidate,
      adminActor,
      manifestPath
    };
  }

  const env = options.env || loadLiveEnvConfig();
  const supabaseUrl = env.SUPABASE_URL || 'https://foyraoimhksfvlxndwxr.supabase.co';
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  let createdPlace = existingSlug;

  // 8. Tạo bản ghi draft (nếu chưa tồn tại)
  if (!createdPlace) {
    console.log('\n--- 7. THỰC THI TẠO BẢN GHI DRAFT TRÊN SUPABASE LIVE ---');
    const correlationIdCreate = `g9-create-den-tho-bac-ho-${Date.now()}`;

    const createRes = await fetch(`${supabaseUrl}/rest/v1/rpc/admin_create_place_atomic`, {
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
        p_place_data: {
          ...candidate.draft_payload,
          status: 'draft',
          client_submission_id: candidate.client_submission_id
        },
        p_ip: '127.0.0.1',
        p_correlation_id: correlationIdCreate
      })
    });

    const createData = await createRes.json().catch(() => null);
    if (!createRes.ok) {
      const errMsg = createData?.message || `HTTP ${createRes.status}`;
      throw new Error(`RPC_CREATE_FAILED: ${errMsg}`);
    }

    createdPlace = createData;
    console.log('  ✓ Tạo bản ghi draft thành công!');
    console.log(`  • ID được cấp phát    : ${createdPlace.id}`);
    console.log(`  • Trạng thái ban đầu  : ${createdPlace.status}`);
    console.log(`  • updated_at ban đầu  : ${createdPlace.updated_at}`);

    // Kiểm tra route public khi còn là draft (phải là 404)
    console.log('\n--- 8. KIỂM TRA ROUTE CÔNG KHAI KHI Ở TRẠNG THÁI DRAFT (HTTP 404) ---');
    const draftRouteRes = await fetch(PUBLIC_ROUTE_URL, { headers: { 'Cache-Control': 'no-cache' } });
    console.log(`  • ${PUBLIC_ROUTE_URL} -> HTTP ${draftRouteRes.status}`);
    if (draftRouteRes.status !== 404) {
      console.warn(`  ⚠️ Cảnh báo: Route draft trả về HTTP ${draftRouteRes.status} thay vì 404!`);
    } else {
      console.log('  ✓ Xác nhận: Route công khai trả về HTTP 404 Not Found an toàn khi ở trạng thái draft.');
    }
  } else {
    console.log(`\nℹ️ Bản ghi ${candidate.slug} đã tồn tại với ID ${createdPlace.id}, status: ${createdPlace.status}. Tiếp tục bước phê duyệt.`);
  }

  // 9. Phê duyệt bản ghi sang status: "approved"
  console.log('\n--- 9. THỰC THI PHÊ DUYỆT (APPROVE) VỚI KHÓA LẠC QUAN (OCC) ---');
  let approvedPlace = createdPlace;

  if (createdPlace.status !== 'approved') {
    const correlationIdApprove = `g9-approve-den-tho-bac-ho-${Date.now()}`;
    const approveRes = await fetch(`${supabaseUrl}/rest/v1/rpc/admin_update_place_atomic`, {
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
        p_place_id: createdPlace.id,
        p_patch: {
          status: 'approved',
          expected_updated_at: createdPlace.updated_at
        },
        p_ip: '127.0.0.1',
        p_correlation_id: correlationIdApprove
      })
    });

    const approveData = await approveRes.json().catch(() => null);
    if (!approveRes.ok) {
      const errMsg = approveData?.message || `HTTP ${approveRes.status}`;
      throw new Error(`RPC_APPROVE_FAILED: ${errMsg}`);
    }

    approvedPlace = approveData;
    console.log('  ✓ admin_update_place_atomic thành công!');
    console.log(`  • ID ${approvedPlace.id} Trạng thái mới: ${approvedPlace.status}`);
    console.log(`  • updated_at mới              : ${approvedPlace.updated_at}`);
  } else {
    console.log('  ℹ️ Bản ghi đã ở trạng thái approved.');
  }

  // 10. Read-back đối soát trực tiếp từ CSDL live
  console.log('\n--- 10. ĐỐI SOÁT READ-BACK TRỰC TIẾP TỪ SUPABASE LIVE ---');
  const allPlacesAfter = await fetchAllLivePlaces(options);
  const liveTarget = allPlacesAfter.find(p => p.id === approvedPlace.id);
  if (!liveTarget) throw new Error(`Không tìm thấy bản ghi ID ${approvedPlace.id} sau khi tạo`);
  if (liveTarget.status !== 'approved') throw new Error(`Trạng thái không phải approved: ${liveTarget.status}`);
  if (liveTarget.slug !== candidate.slug) throw new Error(`Slug không khớp: ${liveTarget.slug}`);
  console.log(`  • Tổng số địa điểm sau khi thêm: ${allPlacesAfter.length} (Kỳ vọng: 10)`);
  console.log(`  • Bản ghi đối soát: ID ${liveTarget.id} | [${liveTarget.status}] | ${liveTarget.name} (${liveTarget.slug})`);

  // 11. Xác minh route live công khai chuyển sang HTTP 200 OK
  console.log('\n--- 11. XÁC MINH ROUTE CÔNG KHAI https://vivutravinh.id.vn/place/den-tho-bac-ho-tra-vinh ---');
  const postRouteRes = await fetch(PUBLIC_ROUTE_URL, { headers: { 'Cache-Control': 'no-cache' } });
  console.log(`  • HTTP Status: ${postRouteRes.status}`);
  if (postRouteRes.status !== 200) {
    throw new Error(`ROUTE_VERIFICATION_FAILED: Route công khai ${PUBLIC_ROUTE_URL} trả về HTTP ${postRouteRes.status} (kỳ vọng 200).`);
  }
  console.log('  ✓ Route công khai đã mở và trả về HTTP 200 OK!');

  console.log('\n======================================================================');
  console.log('🎉 BƯỚC 3 HOÀN TẤT THÀNH CÔNG: ĐÃ TẠO & PHÊ DUYỆT ĐỀN THỜ BÁC HỒ TRÀ VINH!');
  console.log(`   - ID được tạo: ${approvedPlace.id}`);
  console.log(`   - Slug: ${approvedPlace.slug}`);
  console.log(`   - Trạng thái: ${approvedPlace.status}`);
  console.log(`   - Route: ${PUBLIC_ROUTE_URL} -> HTTP 200 OK`);
  console.log('======================================================================\n');

  return {
    success: true,
    dryRun: false,
    mutated: true,
    approvedPlace,
    manifestPath
  };
}

// Chạy trực tiếp qua CLI
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  executeStep3DenThoBacHo().catch(err => {
    console.error('\n❌ LỖI TRONG QUÁ TRÌNH TẠO & DUYỆT BƯỚC 3:', err.message);
    process.exit(1);
  });
}
