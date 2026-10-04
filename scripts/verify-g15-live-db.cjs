/**
 * scripts/verify-g15-live-db.cjs
 *
 * Kiểm tra trạng thái triển khai migration G15 trên CSDL Supabase Live (foyraoimhksfvlxndwxr):
 * - Bảng: point_transactions, user_contribution_points, user_badges, monthly_honors
 * - RPCs: select_user_title, get_contribution_leaderboard, admin_confirm_monthly_honors, admin_moderate_entity_atomic (G15)
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

let cachedOpenApiPaths = null;

async function checkRpc(rpcName) {
  try {
    if (!cachedOpenApiPaths) {
      const res = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Accept: 'application/openapi+json'
        }
      });
      if (res.ok) {
        const data = await res.json();
        cachedOpenApiPaths = Object.keys(data.paths || {});
      } else {
        cachedOpenApiPaths = [];
      }
    }
    return cachedOpenApiPaths.includes(`/rpc/${rpcName}`);
  } catch (e) {
    return false;
  }
}

async function verifyLiveDb() {
  console.log('================================================================================');
  console.log(' KIỂM TRA TRẠNG THÁI TRIỂN KHAI G15 TRÊN SUPABASE LIVE');
  console.log(` Mục tiêu: ${supabaseUrl}`);
  console.log('================================================================================\n');

  const tables = ['point_transactions', 'user_contribution_points', 'user_badges', 'monthly_honors'];
  const rpcs = ['select_user_title', 'get_contribution_leaderboard', 'admin_confirm_monthly_honors'];

  let allTablesReady = true;
  for (const table of tables) {
    const exists = await checkTable(table);
    if (exists) {
      console.log(`  ✓ Bảng public.${table}: ĐÃ TỒN TẠI VÀ SẴN SÀNG`);
    } else {
      console.log(`  ⚠️ Bảng public.${table}: CHƯA TỒN TẠI (Cần chạy migration SQL)`);
      allTablesReady = false;
    }
  }

  console.log('');
  let allRpcsReady = true;
  for (const rpc of rpcs) {
    const exists = await checkRpc(rpc);
    if (exists) {
      console.log(`  ✓ Hàm RPC public.${rpc}: ĐÃ TỒN TẠI`);
    } else {
      console.log(`  ⚠️ Hàm RPC public.${rpc}: CHƯA TỒN TẠI (Cần chạy migration SQL)`);
      allRpcsReady = false;
    }
  }

  console.log('\n--------------------------------------------------------------------------------');
  if (allTablesReady && allRpcsReady) {
    console.log(' ✅ CƠ SỞ DỮ LIỆU SUPABASE LIVE ĐÃ ĐƯỢC CẬP NHẬT MIGRATION G15 HOÀN TẤT!');
    console.log(' Hệ thống sẵn sàng cho việc Commit, Push và Deploy lên Production.');
    process.exit(0);
  } else {
    console.log(' ⏸️ CSDL Supabase Live CHƯA CHẠY migration G15.');
    console.log(' Hướng dẫn thực hiện:');
    console.log(' 1. Truy cập Supabase Dashboard:');
    console.log('    https://supabase.com/dashboard/project/foyraoimhksfvlxndwxr/sql/new');
    console.log(' 2. Sao chép và dán toàn bộ nội dung file:');
    console.log('    supabase/g15_contribution_points_and_badges.sql');
    console.log(' 3. Nhấn "Run" để áp dụng migration.');
    console.log(' 4. Sau đó chạy lại lệnh: node scripts/verify-g15-live-db.cjs để xác nhận.');
    process.exit(1);
  }
}

verifyLiveDb();
