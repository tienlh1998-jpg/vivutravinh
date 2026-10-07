/**
 * scripts/test-live-storage-policies.cjs
 * Kiểm tra trạng thái RLS Storage và migration G16 trên Supabase Cloud live
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const envContent = fs.readFileSync(path.join(ROOT_DIR, '.env.live.tmp'), 'utf8');
const SUPABASE_URL = envContent.match(/SUPABASE_URL="([^"]+)"/)[1];
const SERVICE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)[1];
const ANON_KEY = 'sb_publishable_ThGdyDQHqdNXPFgKRr0XaA_copz_ulU';

async function main() {
    console.log('=== KIỂM TRA TRẠNG THÁI HIỆN TẠI TRÊN SUPABASE LIVE ===');
    console.log(`Supabase URL: ${SUPABASE_URL}`);

    // 1. Đăng nhập member thật
    const normalUserEmail = 'prod_norm_1791220432814@vivutest.local';
    const normalUserPass = 'TestPass123!@#';
    const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
        body: JSON.stringify({ email: normalUserEmail, password: normalUserPass })
    });

    if (!loginRes.ok) {
        throw new Error(`Đăng nhập thất bại: ${loginRes.status} ${await loginRes.text()}`);
    }
    const loginData = await loginRes.json();
    const userId = loginData.user.id;
    const userToken = loginData.access_token;
    console.log(`✓ Đã đăng nhập user: ${userId} (${normalUserEmail})`);

    const dummyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

    // TEST 1: Khách vãng lai (Anon) upload avatar
    console.log('\n--- TEST 1: Khách vãng lai (Anon) upload avatar ---');
    const anonAvatarPath = `reviews/avatars/${userId}_anon_test_${Date.now()}.png`;
    const anonRes = await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos/${anonAvatarPath}`, {
        method: 'POST',
        headers: {
            'apikey': ANON_KEY,
            'Content-Type': 'image/png'
        },
        body: dummyPng
    });
    console.log(`Anon upload status: ${anonRes.status} (${anonRes.statusText})`);
    const anonText = await anonRes.text();
    console.log(`Anon upload response:`, anonText);
    const anonBlocked = anonRes.status === 400 || anonRes.status === 401 || anonRes.status === 403 || anonText.includes('row-level security') || anonText.includes('Unauthorized');
    console.log(`-> Kết quả Test 1: Khách upload avatar ${anonBlocked ? 'ĐÃ BỊ CHẶN' : 'CHƯA BỊ CHẶN (Policy cũ vẫn mở)'}`);
    if (!anonBlocked) {
        // Dọn dẹp nếu lỡ tạo
        await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos/${anonAvatarPath}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${SERVICE_KEY}` }
        });
    }

    // TEST 2: Member upload đường dẫn của người khác (ID giả mạo)
    console.log('\n--- TEST 2: Member upload vào ID của người khác ---');
    const victimUserId = '00000000-0000-0000-0000-000000000000';
    const victimAvatarPath = `reviews/avatars/${victimUserId}_spoofed_${Date.now()}.png`;
    const victimRes = await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos/${victimAvatarPath}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${userToken}`,
            'apikey': ANON_KEY,
            'Content-Type': 'image/png'
        },
        body: dummyPng
    });
    console.log(`Member upload ID khác status: ${victimRes.status} (${victimRes.statusText})`);
    const victimText = await victimRes.text();
    console.log(`Member upload ID khác response:`, victimText);
    const victimBlocked = victimRes.status === 400 || victimRes.status === 401 || victimRes.status === 403 || victimText.includes('row-level security') || victimText.includes('Unauthorized');
    console.log(`-> Kết quả Test 2: Upload avatar người khác ${victimBlocked ? 'ĐÃ BỊ CHẶN' : 'CHƯA BỊ CHẶN (Policy cũ vẫn mở)'}`);
    if (!victimBlocked) {
        // Dọn dẹp nếu lỡ tạo
        await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos/${victimAvatarPath}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${SERVICE_KEY}` }
        });
    }

    // TEST 3: Member upload đúng ID của mình
    console.log('\n--- TEST 3: Member upload đúng ID của mình ---');
    const ownAvatarPath = `reviews/avatars/${userId}_own_test_${Date.now()}.png`;
    const ownRes = await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos/${ownAvatarPath}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${userToken}`,
            'apikey': ANON_KEY,
            'Content-Type': 'image/png'
        },
        body: dummyPng
    });
    console.log(`Member upload đúng ID status: ${ownRes.status} (${ownRes.statusText})`);
    const ownText = await ownRes.text();
    console.log(`Member upload đúng ID response:`, ownText);
    const ownSuccess = ownRes.ok;
    console.log(`-> Kết quả Test 3: Member upload đúng ID ${ownSuccess ? 'THÀNH CÔNG' : 'THẤT BẠI'}`);
    if (ownSuccess) {
        // Dọn dẹp tệp test
        await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos/${ownAvatarPath}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${SERVICE_KEY}` }
        });
    }

    // TEST 4: Kiểm tra hàm cleanup_orphan_review_photos trên Live
    console.log('\n--- TEST 4: Kiểm tra định nghĩa hàm cleanup trên Live ---');
    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cleanup_orphan_review_photos`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'apikey': SERVICE_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
    });
    console.log(`RPC cleanup status: ${rpcRes.status} (${rpcRes.statusText})`);
    const rpcText = await rpcRes.text();
    console.log(`RPC cleanup response:`, rpcText);
}

main().catch(err => {
    console.error('Lỗi:', err);
    process.exit(1);
});
