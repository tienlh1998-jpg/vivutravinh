/**
 * scripts/verify-g15-live-db.cjs
 *
 * Kiểm tra trạng thái triển khai schema G15 trên CSDL Supabase Live (foyraoimhksfvlxndwxr):
 * - Bảng mới: point_transactions, user_contribution_points, user_badges, monthly_honors
 * - View mới: v_user_contribution_points
 * - Cột bổ sung trên bảng hiện hữu:
 *     + places.user_id (liên kết auth.users để cộng điểm địa điểm)
 *     + community_posts.metadata (lưu cờ loại trừ test/mock)
 *     + articles.metadata (lưu cờ loại trừ test/mock)
 * - RPCs: select_user_title, get_contribution_leaderboard, admin_confirm_monthly_honors,
 *         admin_moderate_entity_atomic, admin_update_place_atomic
 */

const fs = require('fs');
const path = require('path');

const PROJECT_DIR = path.resolve(__dirname, '..');
const envPath = path.join(PROJECT_DIR, '.env.live.tmp');

if (!fs.existsSync(envPath)) {
  console.error('❌ Không tìm thấy tệp .env.live.tmp chứa thông tin Supabase');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const urlMatch = envContent.match(/https:\/\/[a-z0-9-]+\.supabase\.co/);
const keyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);

if (!urlMatch || !keyMatch) {
  console.error('❌ Thiếu biến SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabaseUrl = urlMatch[0];
const serviceKey = keyMatch[1];

let cachedOpenApi = null;

async function getOpenApi() {
  if (cachedOpenApi) return cachedOpenApi;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: 'application/openapi+json'
      }
    });
    if (res.ok) {
      cachedOpenApi = await res.json();
    } else {
      cachedOpenApi = { paths: {}, definitions: {} };
    }
  } catch (e) {
    cachedOpenApi = { paths: {}, definitions: {} };
  }
  return cachedOpenApi;
}

async function checkTable(tableName) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/${tableName}?select=count`, {
      method: 'HEAD',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
      }
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function checkColumn(tableName, columnName) {
  const openapi = await getOpenApi();
  const def = openapi.definitions?.[tableName];
  if (!def || !def.properties) return false;
  return Object.prototype.hasOwnProperty.call(def.properties, columnName);
}

async function checkRpc(rpcName) {
  const openapi = await getOpenApi();
  const paths = Object.keys(openapi.paths || {});
  return paths.includes(`/rpc/${rpcName}`);
}

async function verifyLiveDb() {
  console.log('================================================================================');
  console.log(' KIỂM TRA TRẠNG THÁI TRIỂN KHAI VÀ TOÀN VẸN SCHEMA G15 TRÊN SUPABASE LIVE');
  console.log(` Mục tiêu: ${supabaseUrl}`);
  console.log('================================================================================\n');

  // 1. Kiểm tra các bảng mới
  const tables = ['point_transactions', 'user_contribution_points', 'user_badges', 'monthly_honors'];
  console.log('[1/4] Kiểm tra các bảng nghiệp vụ điểm và huy hiệu mới:');
  let allTablesReady = true;
  for (const table of tables) {
    const exists = await checkTable(table);
    if (exists) {
      console.log(`  ✓ Bảng public.${table}: ĐÃ TỒN TẠI VÀ SẴN SÀNG`);
    } else {
      console.log(`  ❌ Bảng public.${table}: CHƯA TỒN TẠI`);
      allTablesReady = false;
    }
  }

  // 2. Kiểm tra View
  console.log('\n[2/4] Kiểm tra View tính điểm tự động theo kỳ:');
  const viewExists = await checkTable('v_user_contribution_points');
  if (viewExists) {
    console.log('  ✓ View public.v_user_contribution_points: ĐÃ TỒN TẠI VÀ SẴN SÀNG');
  } else {
    console.log('  ❌ View public.v_user_contribution_points: CHƯA TỒN TẠI');
  }

  // 3. Kiểm tra các cột bắt buộc trên các bảng hiện hữu (Phát hiện thiếu cột trước khi chạy code)
  console.log('\n[3/4] Kiểm tra các cột bắt buộc trên bảng hiện hữu:');
  const requiredColumns = [
    { table: 'places', column: 'user_id', desc: 'Liên kết tác giả để ghi điểm đóng góp địa điểm' },
    { table: 'community_posts', column: 'metadata', desc: 'Lưu cờ loại trừ test/mock khi tính điểm bài cộng đồng' },
    { table: 'articles', column: 'metadata', desc: 'Lưu cờ loại trừ test/mock khi tính điểm bài blog' }
  ];

  let allColumnsReady = true;
  for (const req of requiredColumns) {
    const exists = await checkColumn(req.table, req.column);
    if (exists) {
      console.log(`  ✓ Cột public.${req.table}.${req.column}: ĐÃ TỒN TẠI (${req.desc})`);
    } else {
      console.log(`  ❌ Cột public.${req.table}.${req.column}: CHƯA TỒN TẠI - ${req.desc}`);
      allColumnsReady = false;
    }
  }

  // 4. Kiểm tra các hàm RPC
  console.log('\n[4/4] Kiểm tra các hàm RPC Stored Functions G15:');
  const rpcs = [
    'select_user_title',
    'get_contribution_leaderboard',
    'admin_confirm_monthly_honors',
    'admin_moderate_entity_atomic',
    'admin_update_place_atomic'
  ];

  let allRpcsReady = true;
  for (const rpc of rpcs) {
    const exists = await checkRpc(rpc);
    if (exists) {
      console.log(`  ✓ Hàm RPC public.${rpc}: ĐÃ TỒN TẠI VÀ SẴN SÀNG`);
    } else {
      console.log(`  ❌ Hàm RPC public.${rpc}: CHƯA TỒN TẠI`);
      allRpcsReady = false;
    }
  }

  console.log('\n--------------------------------------------------------------------------------');
  if (allTablesReady && viewExists && allColumnsReady && allRpcsReady) {
    console.log(' ✅ CƠ SỞ DỮ LIỆU SUPABASE LIVE ĐÃ ĐẦY ĐỦ 100% SCHEMA VÀ CỘT CỦA G15!');
    console.log(' Toàn bộ bảng, view, cột và RPC sẵn sàng cho kiểm thử tài khoản thật.');
  } else {
    console.log(' ❌ CSDL Supabase Live còn thiếu bảng, view hoặc cột.');
    process.exit(1);
  }
}

verifyLiveDb().catch(err => {
  console.error('Lỗi khi kiểm tra CSDL Supabase Live:', err);
  process.exit(1);
});
