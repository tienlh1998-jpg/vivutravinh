/**
 * scripts/verify-old-key-invalidated.cjs
 *
 * Kiểm tra xem khóa cũ đã thực sự bị vô hiệu hóa trên Supabase hay chưa.
 * Tuyệt đối KHÔNG in ra chuỗi khóa trong log hoặc console.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_DIR = path.resolve(__dirname, '..');
const envPath = path.join(PROJECT_DIR, '.env.live.tmp');
const envContent = fs.readFileSync(envPath, 'utf8');
const supabaseUrl = envContent.match(/SUPABASE_URL="([^"]+)"/)[1];

// Cung cấp khóa cũ qua biến môi trường khi cần kiểm tra; không lưu credential trong mã nguồn.
const OLD_LEAKED_KEY = process.env.OLD_SUPABASE_SERVICE_ROLE_KEY;
if (!OLD_LEAKED_KEY) {
  console.error('Thiếu OLD_SUPABASE_SERVICE_ROLE_KEY. Không lưu khóa cũ vào script.');
  process.exit(1);
}

async function checkOldKey() {
  console.log('================================================================================');
  console.log(' KIỂM TRA TRẠNG THÁI VÔ HIỆU HÓA CỦA KHÓA SERVICE_ROLE CŨ (ZERO-LEAK)');
  console.log('================================================================================\n');

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/articles?limit=1`, {
      headers: {
        apikey: OLD_LEAKED_KEY,
        Authorization: `Bearer ${OLD_LEAKED_KEY}`
      }
    });

    console.log(`  [PostgREST] Trạng thái phản hồi HTTP khi dùng khóa cũ: ${res.status}`);

    const authRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=1`, {
      headers: {
        apikey: OLD_LEAKED_KEY,
        Authorization: `Bearer ${OLD_LEAKED_KEY}`
      }
    });

    console.log(`  [Auth Admin] Trạng thái phản hồi HTTP khi dùng khóa cũ: ${authRes.status}`);

    if ((res.status === 401 || res.status === 403) && (authRes.status === 401 || authRes.status === 403)) {
      console.log('\n🔒 XÁC NHẬN: Khóa cũ ĐÃ BỊ VÔ HIỆU HÓA HOÀN TOÀN trên Supabase!');
      console.log('Mọi request dùng khóa cũ đều bị từ chối truy cập.');
      return true;
    } else {
      console.log('\n⚠️ CẢNH BÁO: Khóa cũ VẪN CÒN HOẠT ĐỘNG (HTTP ' + res.status + ')!');
      console.log('Vui lòng vào Supabase Dashboard để nhấn nút "Disable legacy API keys" hoặc đổi JWT Secret.');
      return false;
    }
  } catch (err) {
    console.error('Lỗi kiểm tra:', err.message);
    return false;
  }
}

checkOldKey().then(isInvalidated => {
  process.exit(isInvalidated ? 0 : 1);
});
