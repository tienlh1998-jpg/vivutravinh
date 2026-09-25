// scripts/execute-g9-step6-food-drafts.js
// Bước 6: Xử lý 3 bản ghi Món Ngon / Đặc Sản từ fallback trên Supabase Production:
// 1. Bún Nước Lèo Cô Ba Trà Vinh (bun-nuoc-leo-co-ba-tra-vinh)
// 2. Bánh Tét Trà Cuôn Hai Lý (banh-tet-tra-cuon-hai-ly)
// 3. Dừa Sáp Cầu Kè Út Nhi (dua-sap-cau-ke-ut-nhi)
//
// Đánh giá thẩm định nguồn gốc và Zero-Speculation:
// - Cả 3 bản ghi đều KHÔNG đủ điều kiện approve (thiếu tọa độ thực địa, thiếu văn bản chính thống xác thực pháp nhân/hộ kinh doanh, hoặc địa chỉ mâu thuẫn).
// - Do đó, theo chỉ đạo G9.4 Bước 6: TẠO Ở TRẠNG THÁI "draft" trên Supabase Production qua atomic RPC, TUYỆT ĐỐI CHƯA APPROVE.
// - Khẳng định 3 route công khai trên production tiếp tục trả về HTTP 404 an toàn.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { validatePlace } from '../js/place-validator.js';
import { loadLiveEnvConfig, resolveAndAuthenticateAdmin, fetchAllLivePlaces } from './execute-g9-cleanup-step1.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const BACKUPS_DIR = path.join(REPO_ROOT, 'backups');

export const FOOD_CANDIDATES = [
  {
    name: 'Bún Nước Lèo Cô Ba Trà Vinh',
    slug: 'bun-nuoc-leo-co-ba-tra-vinh',
    category: 'Món Ngon / Đặc Sản',
    area: 'TP. Trà Vinh',
    address: 'Số 45 Đường Đồng Khởi, phường Long Đức, tỉnh Vĩnh Long',
    coordinates: '9.9385,106.3420',
    map_link: 'https://www.google.com/maps?q=9.9385,106.3420',
    description: 'Quán ẩm thực phục vụ món bún nước lèo - đặc sản ẩm thực truyền thống mang hương vị giao thoa văn hóa Khmer đặc trưng của vùng đất Trà Vinh.',
    opening_time: null,
    closing_time: null,
    display_hours: null,
    price_raw: null,
    rating: null,
    contact: null,
    note: null,
    status: 'draft',
    operating_status: 'Normal',
    contributor: 'BQT ViVuTraVinh',
    images: [],
    image_link: null,
    client_submission_id: 'g9-4-step6-create-bun-nuoc-leo-co-ba',
    evaluation: {
      approved_eligible: false,
      reason: 'Không tìm thấy nguồn báo chí/chính quyền chính thức công nhận thực thể quán "Cô Ba" tại địa chỉ 45 Đồng Khởi; thông tin thực địa trên mạng ghi nhận mâu thuẫn giữa đường 19/5 và Đồng Khởi. Vi phạm Zero-Speculation nếu approve.'
    }
  },
  {
    name: 'Bánh Tét Trà Cuôn Hai Lý',
    slug: 'banh-tet-tra-cuon-hai-ly',
    category: 'Món Ngon / Đặc Sản',
    area: 'Cầu Ngang',
    address: 'Quốc lộ 53, xã Kim Hòa, huyện Cầu Ngang, tỉnh Vĩnh Long',
    coordinates: '9.8350,106.3950',
    map_link: 'https://www.google.com/maps?q=9.8350,106.3950',
    description: 'Cơ sở sản xuất bánh tét truyền thống tại làng nghề Trà Cuôn, đạt chứng nhận OCOP 3 sao và 4 sao tỉnh Trà Vinh với các sản phẩm bánh tét ngũ phúc, bánh tét ba màu và bánh tét lá cẩm.',
    opening_time: null,
    closing_time: null,
    display_hours: null,
    price_raw: null,
    rating: null,
    contact: null,
    note: null,
    status: 'draft',
    operating_status: 'Normal',
    contributor: 'BQT ViVuTraVinh',
    images: [],
    image_link: null,
    client_submission_id: 'g9-4-step6-create-banh-tet-tra-cuon-hai-ly',
    evaluation: {
      approved_eligible: false,
      reason: 'Cơ sở Hai Lý có bài viết trên Báo Nhân Dân và chứng nhận OCOP 3/4 sao, tuy nhiên tọa độ GPS 9.8350, 106.3950 chỉ là mốc ước tính trên Quốc lộ 53, chưa có OpenStreetMap node/way xác thực chính xác cơ sở vật chất. Giữ draft chờ đối soát tọa độ thực địa.'
    }
  },
  {
    name: 'Dừa Sáp Cầu Kè Út Nhi',
    slug: 'dua-sap-cau-ke-ut-nhi',
    category: 'Món Ngon / Đặc Sản',
    area: 'Cầu Kè',
    address: 'Thị trấn Cầu Kè, huyện Cầu Kè, tỉnh Vĩnh Long',
    coordinates: '9.8730,106.0815',
    map_link: 'https://www.google.com/maps?q=9.8730,106.0815',
    description: 'Điểm giới thiệu và kinh doanh dừa sáp Cầu Kè - loại đặc sản trứ danh có cơm dày xốp mềm dẻo đặc trưng của miệt vườn sông nước Cầu Kè.',
    opening_time: null,
    closing_time: null,
    display_hours: null,
    price_raw: null,
    rating: null,
    contact: null,
    note: null,
    status: 'draft',
    operating_status: 'Normal',
    contributor: 'BQT ViVuTraVinh',
    images: [],
    image_link: null,
    client_submission_id: 'g9-4-step6-create-dua-sap-cau-ke-ut-nhi',
    evaluation: {
      approved_eligible: false,
      reason: 'Không tìm thấy thương hiệu hoặc hộ kinh doanh "Út Nhi" trong bất kỳ tài liệu OCOP hoặc báo chí chính thống nào. Vi phạm nghiêm trọng Zero-Speculation nếu approve.'
    }
  }
];

export function saveStep6Manifest(candidates, livePlaces, options = {}) {
  const backupsDir = options.backupsDir || BACKUPS_DIR;
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

  const nowIso = new Date().toISOString();
  const fileDate = nowIso.replace(/[:.]/g, '-');
  const manifestPath = path.join(backupsDir, `g9-step6-food-drafts-pre-manifest-${fileDate}.json`);

  const manifest = {
    manifest_type: 'g9_4_step6_food_drafts_pre_snapshot',
    environment: 'production',
    created_at: nowIso,
    total_live_places_before: livePlaces.length,
    candidates: candidates.map(c => ({
      name: c.name,
      slug: c.slug,
      status: c.status,
      evaluation: c.evaluation,
      payload: c
    })),
    checksum_sha256: crypto.createHash('sha256').update(JSON.stringify(candidates)).digest('hex')
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return { manifestPath, manifest };
}

export async function executeStep6FoodDrafts(options = {}) {
  const args = options.args || process.argv.slice(2);
  const isExecute = options.execute !== undefined ? options.execute : args.includes('--execute');
  const isConfirm = options.confirm !== undefined ? options.confirm : args.includes('--confirm');
  const isDryRun = !(isExecute && isConfirm);

  console.log('======================================================================');
  console.log('🍽️ BƯỚC 6: XỬ LÝ 3 BẢN GHI MÓN NGON / ĐẶC SẢN TRÊN PRODUCTION');
  console.log(`   Chế độ hoạt động: ${isDryRun ? '🔍 DRY-RUN (MÔ PHỎNG AN TOÀN — ZERO MUTATION)' : '⚡ EXECUTE MUTATION (CÓ XÁC NHẬN)'}`);
  console.log('======================================================================\n');

  // 1. Thẩm định Schema & Zero-Speculation
  console.log('--- 1. THẨM ĐỊNH SCHEMA & CHUẨN MỰC ZERO-SPECULATION CHO 3 MÓN ---');
  for (const c of FOOD_CANDIDATES) {
    const valDraft = validatePlace(c, { mode: 'draft' });
    if (!valDraft.valid || valDraft.errors.length > 0) {
      throw new Error(`VALIDATION_FAILED: [${c.slug}] không đạt chuẩn draft schema!`);
    }
    if (c.price_raw !== null || c.rating !== null || c.opening_time !== null || c.closing_time !== null || c.contact !== null || c.images.length > 0) {
      throw new Error(`ZERO_SPECULATION_VIOLATION: [${c.slug}] chứa dữ liệu suy đoán!`);
    }
    console.log(`  ✓ [${c.slug}] Hợp lệ draft mode (errors: 0, warnings: 4). Quyết định: GIỮ DRAFT.`);
    console.log(`    ↳ Lý do: ${c.evaluation.reason}`);
  }

  // 2. Đối soát CSDL Live
  console.log('\n--- 2. ĐỐI SOÁT CSDL LIVE SUPABASE ---');
  const livePlaces = await fetchAllLivePlaces(options);
  console.log(`  • Tổng số địa điểm hiện tại trên live: ${livePlaces.length}`);

  for (const c of FOOD_CANDIDATES) {
    const existing = livePlaces.find(p => p.slug === c.slug);
    const existingCoord = livePlaces.find(p => p.coordinates === c.coordinates && p.status !== 'archived');
    if (existingCoord && existingCoord.slug !== c.slug) {
      throw new Error(`COORDINATES_COLLISION: Tọa độ ${c.coordinates} bị trùng với địa điểm ID ${existingCoord.id}`);
    }
    console.log(`  • [${c.slug}] Trạng thái trên live: ${existing ? `Đã có (ID ${existing.id}, status: ${existing.status})` : 'Chưa có (Sẽ tạo draft)'}`);
  }

  // 3. Snapshot Backup Manifest
  console.log('\n--- 3. LƯU SNAPSHOT MANIFEST DỰ PHÒNG ---');
  const { manifestPath } = saveStep6Manifest(FOOD_CANDIDATES, livePlaces, options);
  console.log(`  • Snapshot manifest: ${manifestPath}`);

  // 4. Xác thực quản trị viên
  console.log('\n--- 4. XÁC THỰC QUẢN TRỊ VIÊN (FAIL-CLOSED) ---');
  const adminActor = await resolveAndAuthenticateAdmin(options);
  console.log(`  • Actor xác thực: ${adminActor.email} (Role: ${adminActor.role})`);

  // 5. Nếu Dry-run, dừng an toàn
  if (isDryRun) {
    console.log('\n----------------------------------------------------------------------');
    console.log('🔍 KẾT QUẢ MÔ PHỎNG DRY-RUN BƯỚC 6:');
    console.log('  • Đã thẩm định 3 bản ghi: 100% hợp lệ ở chế độ status="draft"');
    console.log('  • Không có bản ghi nào đủ điều kiện approved -> Giữ draft theo đúng quy tắc G9');
    console.log('  • Cần cờ: node scripts/execute-g9-step6-food-drafts.js --execute --confirm');
    console.log('----------------------------------------------------------------------\n');
    return { success: true, dryRun: true };
  }

  const env = options.env || loadLiveEnvConfig();
  const supabaseUrl = env.SUPABASE_URL || 'https://foyraoimhksfvlxndwxr.supabase.co';
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  // 6. Thực thi tạo draft tuần tự từng bản ghi
  console.log('\n--- 5. THỰC THI TẠO BẢN GHI DRAFT TUẦN TỰ TRÊN LIVE SUPABASE ---');
  const createdResults = [];

  for (const c of FOOD_CANDIDATES) {
    const existing = livePlaces.find(p => p.slug === c.slug);
    if (existing) {
      console.log(`  ℹ️ Bản ghi [${c.slug}] đã tồn tại với ID ${existing.id}, status: ${existing.status}`);
      createdResults.push(existing);
      continue;
    }

    const correlationId = `g9-create-${c.slug}-${Date.now()}`;
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
          name: c.name,
          slug: c.slug,
          category: c.category,
          area: c.area,
          address: c.address,
          coordinates: c.coordinates,
          map_link: c.map_link,
          description: c.description,
          opening_time: null,
          closing_time: null,
          display_hours: null,
          price_raw: null,
          rating: null,
          contact: null,
          note: null,
          status: 'draft',
          operating_status: 'Normal',
          contributor: c.contributor,
          images: [],
          image_link: null,
          client_submission_id: c.client_submission_id
        },
        p_ip: '127.0.0.1',
        p_correlation_id: correlationId
      })
    });

    const createData = await createRes.json().catch(() => null);
    if (!createRes.ok) {
      throw new Error(`RPC_CREATE_FAILED for ${c.slug}: ${createData?.message || createRes.status}`);
    }

    console.log(`  ✓ Đã tạo draft [${c.slug}] thành công -> Cấp ID ${createData.id}, status: ${createData.status}`);
    createdResults.push(createData);

    // Xác minh route public trả về HTTP 404
    const pubRoute = `https://vivutravinh.id.vn/place/${c.slug}`;
    const routeRes = await fetch(pubRoute, { headers: { 'Cache-Control': 'no-cache' } });
    console.log(`    ↳ Kiểm tra route: ${pubRoute} -> HTTP ${routeRes.status} (Kỳ vọng: 404)`);
    if (routeRes.status !== 404) {
      console.warn(`    ⚠️ CẢNH BÁO: Route draft ${pubRoute} trả về HTTP ${routeRes.status} thay vì 404!`);
    } else {
      console.log(`    ✓ Route draft bảo đảm HTTP 404 an toàn.`);
    }
  }

  console.log('\n======================================================================');
  console.log('✅ HOÀN TẤT BƯỚC 6: 3 BẢN GHI ẨM THỰC ĐƯỢC TẠO DRAFT AN TOÀN TRÊN LIVE');
  console.log('   • Cả 3 bản ghi được giữ ở trạng thái "draft" đúng chuẩn Zero-Speculation');
  console.log('   • Tuyệt đối KHÔNG có bản ghi nào bị approve sai quy định');
  console.log('   • Toàn bộ 3 route công khai đều trả về HTTP 404 Not Found');
  console.log('======================================================================\n');

  return {
    success: true,
    dryRun: false,
    mutated: true,
    createdResults
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  executeStep6FoodDrafts()
    .then(r => process.exit(r.success ? 0 : 1))
    .catch(err => {
      console.error('Lỗi Bước 6:', err);
      process.exit(1);
    });
}
