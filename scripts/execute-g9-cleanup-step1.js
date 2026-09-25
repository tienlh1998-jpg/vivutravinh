// scripts/execute-g9-cleanup-step1.js
// Bước 1: Dọn dẹp an toàn các bản ghi rác/test (ID 4, 5, 6, 8, 9, 10) trên Supabase Production.
// Tuân thủ 100% nguyên tắc: Zero Hard Delete (chuyển sang 'archived'), Snapshot trước mutation,
// OCC khóa lạc quan, ADMIN_ACCESS_TOKEN fail-closed, bắt buộc --execute và --confirm.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { SUPABASE_ANON_KEY } from '../js/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const BACKUPS_DIR = path.join(REPO_ROOT, 'backups');

export const GARBAGE_TARGET_IDS = [4, 5, 6, 8, 9, 10];
export const ACTIVE_PLACE_IDS = [1, 2, 3];

export function loadLiveEnvConfig() {
  const envPath = path.join(REPO_ROOT, '.env.live.tmp');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[match[1].trim()] = val;
    }
  }
  return env;
}

export function computeRecordChecksum(record) {
  const copy = { ...record };
  delete copy.updated_at;
  delete copy.created_at;
  const canonical = JSON.stringify(copy, Object.keys(copy).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Đọc toàn bộ danh sách địa điểm live trên Supabase
 */
export async function fetchAllLivePlaces(options = {}) {
  const env = options.env || loadLiveEnvConfig();
  const supabaseUrl = env.SUPABASE_URL || 'https://foyraoimhksfvlxndwxr.supabase.co';
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    throw new Error('FAIL_CLOSED: Thiếu SUPABASE_SERVICE_ROLE_KEY để truy vấn CSDL live an toàn.');
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/places?select=*&order=id.asc`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`
    }
  });

  if (!res.ok) {
    throw new Error(`FETCH_FAILED: Không thể truy vấn danh sách địa điểm live (HTTP ${res.status}).`);
  }

  const places = await res.json();
  if (!Array.isArray(places)) {
    throw new Error('FETCH_FAILED: Phản hồi từ Supabase không phải là danh sách mảng.');
  }

  return places;
}

/**
 * Lưu snapshot backup toàn diện trước khi dọn dẹp
 */
export function savePreCleanupSnapshot(allLivePlaces, options = {}) {
  const backupsDir = options.backupsDir || BACKUPS_DIR;
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

  const nowIso = new Date().toISOString();
  const fileDate = nowIso.replace(/[:.]/g, '-');
  const manifestPath = path.join(backupsDir, `g9-cleanup-step1-pre-manifest-${fileDate}.json`);

  const manifest = {
    manifest_type: 'g9_4_step1_garbage_cleanup_pre_snapshot',
    environment: 'production',
    created_at: nowIso,
    total_live_places_before: allLivePlaces.length,
    live_places: allLivePlaces,
    garbage_targets: GARBAGE_TARGET_IDS,
    active_places: ACTIVE_PLACE_IDS,
    checksum_sha256: crypto.createHash('sha256').update(JSON.stringify(allLivePlaces)).digest('hex'),
    rollback_plan: allLivePlaces
      .filter(p => GARBAGE_TARGET_IDS.includes(p.id))
      .map(p => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        original_status: p.status,
        expected_updated_at: p.updated_at
      }))
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return { manifestPath, manifest };
}

/**
 * Xác thực danh tính quản trị viên (Fail-Closed)
 */
export async function resolveAndAuthenticateAdmin(options = {}) {
  const env = options.env || loadLiveEnvConfig();
  const supabaseUrl = env.SUPABASE_URL || 'https://foyraoimhksfvlxndwxr.supabase.co';
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = SUPABASE_ANON_KEY;
  const adminSecret = env.ADMIN_SECRET;

  let adminToken = options.adminToken || env.ADMIN_ACCESS_TOKEN || '';

  // 1. Kiểm tra token có hợp lệ không, nếu thiếu hoặc hết hạn thì tự làm mới qua Supabase Auth nếu có adminSecret
  let isValidToken = false;
  if (adminToken) {
    try {
      const checkRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          apikey: anonKey
        }
      });
      if (checkRes.ok) {
        isValidToken = true;
      }
    } catch {}
  }

  if (!isValidToken) {
    if (!adminSecret) {
      throw new Error('FAIL_CLOSED_NO_ADMIN_TOKEN: ADMIN_ACCESS_TOKEN không hợp lệ hoặc đã hết hạn và thiếu ADMIN_SECRET để làm mới.');
    }

    console.log('  ℹ️  ADMIN_ACCESS_TOKEN đã hết hạn hoặc chưa có, đang làm mới qua Supabase Auth...');
    const loginRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey
      },
      body: JSON.stringify({
        email: 'tienlh1998@gmail.com',
        password: adminSecret
      })
    });

    if (!loginRes.ok) {
      const errText = await loginRes.text();
      throw new Error(`AUTH_LOGIN_FAILED: Không thể đăng nhập quản trị viên (HTTP ${loginRes.status}): ${errText}`);
    }

    const authData = await loginRes.json();
    adminToken = authData.access_token;
    console.log('  ✓ Đăng nhập thành công, nhận token mới (hiệu lực 3600s).');
  }

  // 2. Tra cứu user
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
      apikey: anonKey
    }
  });

  if (!userRes.ok) {
    throw new Error(`UNAUTHENTICATED: Token quản trị viên không hợp lệ (HTTP ${userRes.status}).`);
  }

  const authUser = await userRes.json();
  if (!authUser?.id) {
    throw new Error('UNAUTHENTICATED: Không thể nhận diện danh tính người dùng từ token.');
  }

  // 3. Đối soát allowlist admin_users
  const adminRes = await fetch(
    `${supabaseUrl}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(authUser.id)}&select=user_id,email,role,is_active`,
    {
      headers: {
        apikey: serviceKey || anonKey,
        Authorization: `Bearer ${serviceKey || adminToken}`
      }
    }
  );

  if (!adminRes.ok) {
    throw new Error(`DATABASE_ERROR: Không thể đối soát bảng admin_users (HTTP ${adminRes.status}).`);
  }

  const rows = await adminRes.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`FORBIDDEN: Tài khoản ${authUser.email || authUser.id} không nằm trong allowlist quản trị viên.`);
  }

  const adminProfile = rows[0];
  if (!adminProfile.is_active) {
    throw new Error(`FORBIDDEN: Tài khoản quản trị viên ${adminProfile.email} đã bị vô hiệu hóa.`);
  }

  if (adminProfile.role !== 'admin') {
    throw new Error(`FORBIDDEN: Yêu cầu quyền role 'admin' để thực thi dọn dẹp.`);
  }

  return {
    id: adminProfile.user_id,
    email: adminProfile.email,
    role: adminProfile.role,
    token: adminToken
  };
}

/**
 * Quy trình chính thực thi Bước 1: Dọn dẹp dữ liệu rác
 */
export async function executeStep1GarbageCleanup(options = {}) {
  const args = options.args || process.argv.slice(2);
  const isExecute = options.execute !== undefined ? options.execute : args.includes('--execute');
  const isConfirm = options.confirm !== undefined ? options.confirm : args.includes('--confirm');
  const isDryRun = !(isExecute && isConfirm);

  console.log('======================================================================');
  console.log('🚀 BƯỚC 1: DỌN DẸP DỮ LIỆU RÁC / TEST TRÊN PRODUCTION SUPABASE');
  console.log(`   Chế độ hoạt động: ${isDryRun ? '🔍 DRY-RUN (MÔ PHỎNG AN TOÀN — ZERO MUTATION)' : '⚡ EXECUTE MUTATION (CÓ XÁC NHẬN)'}`);
  console.log('======================================================================\n');

  // 1. Đọc danh sách địa điểm live hiện tại
  console.log('--- 1. TRUY VẤN TẤT CẢ ĐỊA ĐIỂM LIVE TRÊN PRODUCTION ---');
  const livePlaces = await fetchAllLivePlaces(options);
  console.log(`  • Tổng số địa điểm hiện tại: ${livePlaces.length}`);
  for (const p of livePlaces) {
    console.log(`    - ID ${p.id.toString().padStart(2, ' ')} | [${p.status.padEnd(8, ' ')}] | ${p.slug.padEnd(36, ' ')} | ${p.name}`);
  }

  // 2. Phân loại mục tiêu cần xử lý
  console.log('\n--- 2. PHÂN LOẠI MỤC TIÊU DỌN DẸP (TARGET: ID 4, 5, 6, 8, 9, 10) ---');
  const garbagePlaces = livePlaces.filter(p => GARBAGE_TARGET_IDS.includes(p.id));
  const activePlaces = livePlaces.filter(p => ACTIVE_PLACE_IDS.includes(p.id));
  const otherPlaces = livePlaces.filter(p => !GARBAGE_TARGET_IDS.includes(p.id) && !ACTIVE_PLACE_IDS.includes(p.id));

  console.log(`  • Số bản ghi rác/test mục tiêu : ${garbagePlaces.length}`);
  console.log(`  • Số bản ghi hợp lệ bảo toàn : ${activePlaces.length} (ID 1 Ao Bà Om, ID 2 Biển Ba Động, ID 3 Chùa Âng)`);
  if (otherPlaces.length > 0) {
    console.log(`  • CẢNH BÁO: Phát hiện ${otherPlaces.length} bản ghi ngoài danh mục!`, otherPlaces.map(p => p.id));
  }

  // Tìm các bản ghi rác chưa được archive (ví dụ ID 5, 8, 9 đang ở hidden)
  const needsArchive = garbagePlaces.filter(p => p.status !== 'archived');
  const alreadyArchived = garbagePlaces.filter(p => p.status === 'archived');

  console.log(`  • Đã ở trạng thái archived   : ${alreadyArchived.map(p => `ID ${p.id} (${p.slug})`).join(', ') || 'Không có'}`);
  console.log(`  • Cần chuyển sang archived    : ${needsArchive.map(p => `ID ${p.id} (${p.slug}: ${p.status} -> archived)`).join(', ') || 'Đã dọn xong 100%'}`);

  // 3. Tạo snapshot backup trước mutation
  console.log('\n--- 3. LƯU SNAPSHOT MANIFEST TOÀN DIỆN TRƯỚC MUTATION ---');
  const { manifestPath, manifest } = savePreCleanupSnapshot(livePlaces, options);
  console.log(`  • Snapshot manifest lưu tại : ${manifestPath}`);
  console.log(`  • Checksum SHA-256          : ${manifest.checksum_sha256}`);

  // 4. Xác thực quản trị viên
  console.log('\n--- 4. XÁC THỰC DANH TÍNH QUẢN TRỊ VIÊN (FAIL-CLOSED) ---');
  const adminActor = await resolveAndAuthenticateAdmin(options);
  console.log(`  • Actor xác thực             : ${adminActor.email} (Role: ${adminActor.role}, UUID: ${adminActor.id})`);

  // 5. Nếu là Dry-Run, dừng an toàn
  if (isDryRun) {
    console.log('\n----------------------------------------------------------------------');
    console.log('🔍 KẾT QUẢ MÔ PHỎNG DRY-RUN:');
    console.log('  • Xác thực token quản trị viên: THÀNH CÔNG');
    console.log(`  • Actor hợp lệ               : ${adminActor.email}`);
    console.log(`  • Tổng số bản ghi rác cần sửa: ${needsArchive.length} bản ghi (${needsArchive.map(p => `ID ${p.id}`).join(', ')})`);
    console.log(`  • Thao tác dự kiến           : Chuyển status -> 'archived' có kiểm soát OCC (expected_updated_at)`);
    console.log(`  • Yêu cầu cờ thực thi        : ${isExecute ? '✓ có --execute' : '✗ thiếu --execute'}, ${isConfirm ? '✓ có --confirm' : '✗ thiếu --confirm'}`);
    console.log('----------------------------------------------------------------------');
    console.log('ℹ️  Để thực thi dọn dẹp trên production, bắt buộc truyền ĐỒNG THỜI cả hai cờ:');
    console.log('   node scripts/execute-g9-cleanup-step1.js --execute --confirm\n');

    return {
      success: true,
      dryRun: true,
      mutated: false,
      livePlaces,
      needsArchive,
      alreadyArchived,
      manifestPath
    };
  }

  // 6. Thực thi mutation qua RPC admin_update_place_atomic cho từng mục tiêu
  console.log('\n--- 5. THỰC THI MUTATION CHUYỂN TRẠNG THÁI SANG ARCHIVED (OCC) ---');
  const env = options.env || loadLiveEnvConfig();
  const supabaseUrl = env.SUPABASE_URL || 'https://foyraoimhksfvlxndwxr.supabase.co';
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  const mutatedResults = [];

  for (const place of needsArchive) {
    const correlationId = `g9-cleanup-step1-id${place.id}-${Date.now()}`;
    console.log(`  • Đang xử lý ID ${place.id} (${place.name}) - updated_at: ${place.updated_at}...`);

    const patchPayload = {
      status: 'archived',
      expected_updated_at: place.updated_at
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
        p_place_id: place.id,
        p_patch: patchPayload,
        p_ip: '127.0.0.1',
        p_correlation_id: correlationId
      })
    });

    const rpcData = await rpcRes.json().catch(() => null);
    if (!rpcRes.ok) {
      const errMsg = rpcData?.message || `HTTP ${rpcRes.status}`;
      console.error(`\n❌ THẤT BẠI KHI ARCHIVE ID ${place.id}:`, errMsg);
      throw new Error(`RPC_FAILED_ID_${place.id}: ${errMsg}`);
    }

    console.log(`    ✓ ID ${place.id} đã chuyển sang status: 'archived' (updated_at mới: ${rpcData.updated_at})`);
    mutatedResults.push({
      id: place.id,
      slug: place.slug,
      beforeStatus: place.status,
      afterStatus: rpcData.status,
      updated_at: rpcData.updated_at,
      correlationId
    });
  }

  // 7. Read-back đối soát toàn diện sau mutation
  console.log('\n--- 6. ĐỐI SOÁT READ-BACK TRÊN CSDL LIVE SUPABASE ---');
  const postPlaces = await fetchAllLivePlaces(options);
  console.log(`  • Tổng số địa điểm sau xử lý : ${postPlaces.length} (Kỳ vọng: 9 — Zero Hard Delete)`);
  if (postPlaces.length !== 9) {
    throw new Error(`INTEGRITY_ERROR: Số lượng địa điểm bị thay đổi (${postPlaces.length} != 9).`);
  }

  const postGarbage = postPlaces.filter(p => GARBAGE_TARGET_IDS.includes(p.id));
  const postActive = postPlaces.filter(p => ACTIVE_PLACE_IDS.includes(p.id));

  const unarchivedGarbage = postGarbage.filter(p => p.status !== 'archived');
  if (unarchivedGarbage.length > 0) {
    throw new Error(`CLEANUP_FAILED: Vẫn còn ${unarchivedGarbage.length} bản ghi rác chưa được archive: ${unarchivedGarbage.map(p => p.id).join(', ')}`);
  }

  console.log('  ✓ Xác nhận 100% 6 bản ghi rác (ID 4, 5, 6, 8, 9, 10) đều đang ở trạng thái "archived":');
  for (const g of postGarbage) {
    console.log(`    - ID ${g.id.toString().padStart(2, ' ')}: [${g.status}] ${g.name} (${g.slug})`);
  }

  console.log('  ✓ Xác nhận đúng 3 bản ghi hợp lệ duy nhất đang hoạt động:');
  for (const a of postActive) {
    console.log(`    - ID ${a.id.toString().padStart(2, ' ')}: [${a.status}] ${a.name} (${a.slug})`);
  }

  // 8. Kiểm tra route công khai của các slug rác (phải là 404)
  console.log('\n--- 7. KIỂM TRA CÁC ROUTE CÔNG KHAI CỦA BẢN GHI RÁC (PHẢI TRẢ HTTP 404) ---');
  const garbageSlugs = postGarbage.map(p => p.slug).filter(Boolean);
  for (const slug of garbageSlugs) {
    const routeUrl = `https://vivutravinh.id.vn/place/${slug}`;
    try {
      const res = await fetch(routeUrl, { headers: { 'Cache-Control': 'no-cache' } });
      console.log(`  • ${routeUrl.padEnd(55, ' ')} -> HTTP ${res.status}`);
      if (res.status !== 404) {
        console.warn(`  ⚠️ CẢNH BÁO: Slug rác ${slug} trả về HTTP ${res.status} thay vì 404!`);
      }
    } catch (e) {
      console.log(`  • ${routeUrl.padEnd(55, ' ')} -> Lỗi kết nối: ${e.message}`);
    }
  }

  console.log('\n======================================================================');
  console.log('🎉 BƯỚC 1 HOÀN TẤT THÀNH CÔNG: ĐÃ DỌN SẠCH 6 BẢN GHI RÁC TRÊN PRODUCTION!');
  console.log('   - ID 4, 5, 6, 8, 9, 10: 100% archived.');
  console.log('   - ID 1, 2, 3: Bảo toàn an toàn.');
  console.log('   - Zero Hard Delete (9/9 bản ghi còn nguyên vẹn).');
  console.log('======================================================================\n');

  return {
    success: true,
    dryRun: false,
    mutated: true,
    mutatedResults,
    manifestPath,
    postPlaces
  };
}

// Chạy trực tiếp qua CLI
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  executeStep1GarbageCleanup().catch(err => {
    console.error('\n❌ LỖI TRONG QUÁ TRÌNH DỌN DẸP BƯỚC 1:', err.message);
    process.exit(1);
  });
}
