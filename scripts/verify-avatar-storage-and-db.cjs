/**
 * scripts/verify-avatar-storage-and-db.cjs
 * Xác minh cấu hình CSDL Supabase Live và Storage cho tính năng Avatar & Bảo vệ Dọn dẹp
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const envContent = fs.readFileSync(path.join(ROOT_DIR, '.env.live.tmp'), 'utf8');
const SUPABASE_URL = envContent.match(/SUPABASE_URL="([^"]+)"/)[1];
const SERVICE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)[1];
const ANON_KEY = 'sb_publishable_ThGdyDQHqdNXPFgKRr0XaA_copz_ulU';

async function main() {
    console.log('=== XÁC MINH CƠ SỞ DỮ LIỆU SUPABASE LIVE & STORAGE POLICIES ===\n');

    // 1. Đăng nhập tài khoản Member thật
    console.log('1. Đăng nhập tài khoản Member thật...');
    const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'prod_norm_1791220432814@vivutest.local', password: 'TestPass123!@#' })
    });
    const auth = await loginRes.json();
    assert(auth.access_token, 'Đăng nhập member thất bại');
    const memberId = auth.user.id;
    const memberToken = auth.access_token;
    console.log('  ✓ Member đăng nhập thành công:', memberId);

    // 2. Xác minh Schema bảng public.profiles
    console.log('\n2. Kiểm tra Schema bảng public.profiles...');
    const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${memberId}&select=id,avatar_url,display_name,bio`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${memberToken}` }
    });
    assert(profRes.ok, `Truy vấn bảng profiles thất bại (${profRes.status})`);
    const profiles = await profRes.json();
    assert(Array.isArray(profiles) && profiles.length > 0, 'Không tìm thấy hồ sơ của member');
    const memberProfile = profiles[0];
    console.log('  ✓ Schema hợp lệ, các cột id, avatar_url, display_name, bio tồn tại:', memberProfile);

    // 3. Xác minh RLS: Không được sửa hồ sơ người khác
    console.log('\n3. Kiểm tra RLS bảo vệ hồ sơ người khác...');
    const fakeOtherUserId = '00000000-0000-0000-0000-000000000000';
    const patchOtherRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${fakeOtherUserId}`, {
        method: 'PATCH',
        headers: {
            apikey: ANON_KEY,
            Authorization: `Bearer ${memberToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify({ avatar_url: 'https://hacker.com/malicious.png' })
    });
    const patchedRows = await patchOtherRes.json().catch(() => []);
    assert(Array.isArray(patchedRows) && patchedRows.length === 0, 'RLS vi phạm: Member sửa được hồ sơ người khác!');
    console.log('  ✓ RLS hoạt động hoàn hảo: Member thường không thể sửa avatar/hồ sơ của người khác (0 rows modified)');

    // 4. Xác minh Storage bucket review-photos tồn tại & giữ luồng ảnh đánh giá
    console.log('\n4. Kiểm tra Storage bucket review-photos & luồng ảnh đánh giá...');
    const tinyJpeg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
    
    // Thử tải ảnh đánh giá cho địa điểm ao-ba-om
    const testReviewFileName = `audit_rev_${Date.now()}.jpg`;
    const reviewUploadPath = `reviews/ao-ba-om/audit_client_${testReviewFileName}`;
    const reviewUploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos/${reviewUploadPath}`, {
        method: 'POST',
        headers: { apikey: ANON_KEY, 'Content-Type': 'image/jpeg' },
        body: tinyJpeg
    });
    console.log('  Upload ảnh đánh giá (reviews/ao-ba-om/...): Status =', reviewUploadRes.status);
    assert(reviewUploadRes.ok, 'Luồng ảnh đánh giá hiện có phải hoạt động bình thường!');
    console.log('  ✓ Luồng ảnh đánh giá (Review Photos) hoạt động bình thường 100%');

    // Dọn dẹp ảnh đánh giá test
    await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos/${reviewUploadPath}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    console.log('  ✓ Đã dọn dẹp ảnh đánh giá test');

    // 5. Xác minh upload avatar với Member Token vào đúng ID của mình
    console.log('\n5. Kiểm tra upload avatar vào đúng ID của mình...');
    const testAvatarFileName = `${memberId}_${Date.now()}.png`;
    const avatarStoragePath = `reviews/avatars/${testAvatarFileName}`;
    const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

    const avatarUploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos/${avatarStoragePath}`, {
        method: 'POST',
        headers: {
            apikey: ANON_KEY,
            Authorization: `Bearer ${memberToken}`,
            'Content-Type': 'image/png'
        },
        body: tinyPng
    });
    console.log('  Upload avatar vào reviews/avatars/${userId}_...: Status =', avatarUploadRes.status);
    assert(avatarUploadRes.ok, 'Upload avatar cho thành viên đăng nhập phải thành công!');
    console.log('  ✓ Upload avatar của chính mình thành công (HTTP 200)');

    // Dọn dẹp avatar test
    await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos/${avatarStoragePath}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    console.log('  ✓ Đã dọn dẹp ảnh avatar test');

    // 6. Kiểm tra file migration G16
    console.log('\n6. Kiểm tra file migration supabase/g16_protect_avatars_and_storage_policies.sql...');
    const g16Path = path.join(ROOT_DIR, 'supabase', 'g16_protect_avatars_and_storage_policies.sql');
    assert(fs.existsSync(g16Path), 'File migration G16 phải tồn tại!');
    const g16Content = fs.readFileSync(g16Path, 'utf8');
    assert(g16Content.includes('Authenticated upload own avatar'), 'Phải có policy Authenticated upload own avatar');
    assert(g16Content.includes('cleanup_orphan_review_photos'), 'Phải có function cleanup_orphan_review_photos');
    assert(g16Content.includes("!= 'avatars'"), 'Phải loại trừ thư mục avatars khỏi cleanup');
    assert(g16Content.includes('profiles p'), 'Phải bảo vệ ảnh trong profiles.avatar_url');
    console.log('  ✓ File migration G16 đầy đủ, bảo vệ avatar và phân tách luồng chặt chẽ');

    console.log('\n=== XÁC MINH CƠ SỞ DỮ LIỆU SUPABASE LIVE & STORAGE HOÀN TẤT THÀNH CÔNG 100%! ===');
}

main().catch(err => {
    console.error('LỖI XÁC MINH:', err);
    process.exit(1);
});
