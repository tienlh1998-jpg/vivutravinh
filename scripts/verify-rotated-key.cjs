/**
 * scripts/verify-rotated-key.cjs
 *
 * Kiểm tra kết nối bí mật của khóa service_role mới.
 * Tuyệt đối KHÔNG in ra chuỗi khóa trong log hoặc console.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_DIR = path.resolve(__dirname, '..');
const envPath = path.join(PROJECT_DIR, '.env.live.tmp');

if (!fs.existsSync(envPath)) {
  console.error('❌ Không tìm thấy file .env.live.tmp');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const urlMatch = envContent.match(/SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);

if (!urlMatch || !keyMatch) {
  console.error('❌ Không trích xuất được SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY từ file .env.live.tmp');
  process.exit(1);
}

const supabaseUrl = urlMatch[1];
const serviceKey = keyMatch[1];

async function verify() {
  console.log('================================================================================');
  console.log(' KIỂM TRA XÁC THỰC SERVICE_ROLE KEY MỚI (ZERO-LEAK VERIFICATION)');
  console.log('================================================================================\n');

  try {
    // 1. Kiểm tra PostgREST API với quyền service_role
    const restRes = await fetch(`${supabaseUrl}/rest/v1/articles?limit=1`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
      }
    });

    console.log(`  [PostgREST API] Trạng thái phản hồi HTTP: ${restRes.status}`);

    // 2. Kiểm tra Auth Admin API với quyền service_role
    const authRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=1`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
      }
    });

    console.log(`  [Auth Admin API] Trạng thái phản hồi HTTP: ${authRes.status}`);

    if (restRes.status === 200 && authRes.status === 200) {
      console.log('\n✅ XÁC NHẬN HOẠT ĐỘNG: Khóa mới đã được xác thực thành công 100% trên cả PostgREST và Auth Admin API!');
      console.log('Bạn có thể an tâm vô hiệu hóa / thu hồi khóa cũ trên Supabase Dashboard.');
    } else {
      console.error('\n❌ XÁC THỰC THẤT BẠI: Khóa không được chấp nhận bởi Supabase.');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Lỗi kết nối mạng:', err.message);
    process.exit(1);
  }
}

verify();
