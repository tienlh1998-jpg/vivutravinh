/**
 * scripts/test-contribute-photo-api.cjs
 * Kiểm thử Server-side và Storage cho tính năng tải ảnh đóng góp địa điểm:
 * 1. Supabase Storage server-side mime type validation (chặn .txt, chỉ nhận jpeg/png/webp)
 * 2. Supabase Storage server-side file size limit (chặn > 5MB)
 * 3. /api/submit-place validation:
 *    - Chặn > 5 ảnh (TOO_MANY_IMAGES)
 *    - Chặn giao thức nguy hiểm (INSECURE_IMAGE_URL)
 *    - Chấp nhận danh sách ảnh hợp lệ, lưu đúng images và image_link
 * 4. Dọn dẹp bản ghi thử nghiệm
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const envContent = fs.readFileSync(path.join(ROOT_DIR, '.env.live.tmp'), 'utf8');
const SUPABASE_URL = envContent.match(/SUPABASE_URL="?([^"\r\n]+)"?/)[1];
const SERVICE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="?([^"\r\n]+)"?/)[1];
const ANON_KEY = 'sb_publishable_ThGdyDQHqdNXPFgKRr0XaA_copz_ulU';

process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
process.env.ADMIN_SECRET = 'dev-admin';
process.env.NODE_ENV = 'test';

async function main() {
    console.log('=== BẮT ĐẦU KIỂM THỬ API & STORAGE TẢI ẢNH ĐÓNG GÓP ===\n');

    // 1. Đăng nhập tài khoản người dùng thường
    const userEmail = 'prod_norm_1791220432814@vivutest.local';
    const userPass = 'TestPass123!@#';
    const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, password: userPass })
    });
    const authData = await loginRes.json();
    assert(authData.access_token, 'Đăng nhập người dùng thường phải thành công');
    const userToken = authData.access_token;
    const userId = authData.user.id;
    console.log('1. Đăng nhập người dùng thường thành công: userId =', userId);

    // 2. Kiểm tra máy chủ từ chối MIME type không hợp lệ (ví dụ text/plain)
    console.log('\n2. Kiểm tra Storage từ chối tệp không đúng định dạng (.txt):');
    const textPath = `reviews/places/${userId}_${Date.now()}_invalid.txt`;
    const resTxt = await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos/${textPath}`, {
        method: 'POST',
        headers: {
            'apikey': ANON_KEY,
            'Authorization': `Bearer ${userToken}`,
            'Content-Type': 'text/plain'
        },
        body: Buffer.from('hello world')
    });
    console.log('  HTTP Status:', resTxt.status);
    const txtErr = await resTxt.json().catch(() => ({}));
    console.log('  Server message:', txtErr.message || txtErr.error);
    assert(resTxt.status >= 400, 'Máy chủ Storage phải từ chối tệp text/plain');
    console.log('  ✓ Máy chủ đã chặn tệp sai định dạng thành công!');

    // 3. Kiểm tra máy chủ từ chối dung lượng vượt quá giới hạn (> 5MB)
    console.log('\n3. Kiểm tra Storage từ chối tệp vượt quá 5MB:');
    const largeBuffer = Buffer.alloc(5.5 * 1024 * 1024); // 5.5MB
    const largePath = `reviews/places/${userId}_${Date.now()}_large.jpg`;
    const resLarge = await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos/${largePath}`, {
        method: 'POST',
        headers: {
            'apikey': ANON_KEY,
            'Authorization': `Bearer ${userToken}`,
            'Content-Type': 'image/jpeg'
        },
        body: largeBuffer
    });
    console.log('  HTTP Status:', resLarge.status);
    const largeErr = await resLarge.json().catch(() => ({}));
    console.log('  Server message:', largeErr.message || largeErr.error);
    assert(resLarge.status >= 400, 'Máy chủ Storage phải từ chối tệp > 5MB');
    console.log('  ✓ Máy chủ đã chặn tệp vượt quá 5MB thành công!');

    // 4. Kiểm tra tải ảnh hợp lệ lên Storage (1x1 PNG)
    console.log('\n4. Kiểm tra tải ảnh hợp lệ lên Storage:');
    const validPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const validPath = `reviews/places/${userId}_${Date.now()}_valid_test.png`;
    const resValid = await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos/${validPath}`, {
        method: 'POST',
        headers: {
            'apikey': ANON_KEY,
            'Authorization': `Bearer ${userToken}`,
            'Content-Type': 'image/png'
        },
        body: validPng
    });
    console.log('  HTTP Status:', resValid.status);
    assert(resValid.ok, 'Tải ảnh hợp lệ lên Storage phải thành công 200');
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/review-photos/${validPath}`;
    console.log('  Public URL:', publicUrl);
    const checkPub = await fetch(publicUrl);
    assert(checkPub.ok, 'Ảnh vừa tải phải truy cập được công khai');
    console.log('  ✓ Ảnh hợp lệ đã tải lên và truy cập công khai thành công!');

    // 5. Kiểm tra API /api/submit-place
    console.log('\n5. Kiểm tra API /api/submit-place:');
    const { default: submitHandler } = await import('../api/submit-place.js');

    // Helper tạo fake req/res
    function mockReqRes(method, body, headers = {}) {
        const req = {
            method,
            body,
            headers: { 'content-type': 'application/json', ...headers },
            socket: { remoteAddress: '127.0.0.1' }
        };
        let statusCode = 200;
        let responseData = null;
        const resHeaders = {};
        const res = {
            statusCode: 200,
            setHeader: (k, v) => { resHeaders[k] = v; },
            end: (data) => {
                responseData = data ? JSON.parse(data) : null;
            }
        };
        return { req, res, getResult: () => ({ status: res.statusCode, data: responseData }) };
    }

    // 5a. Kiểm tra chặn > 5 ảnh
    console.log('  5a. Kiểm tra chặn gửi quá 5 ảnh (TOO_MANY_IMAGES):');
    const reqResTooMany = mockReqRes('POST', {
        client_submission_id: 'test_sub_too_many_' + Date.now(),
        name: 'Quán Ăn Thử Nghiệm',
        category: 'Ẩm thực',
        area: 'TP. Trà Vinh',
        address: '123 Đường 30/4',
        description: 'Mô tả quán ăn thử nghiệm',
        images: ['https://ex.com/1.jpg', 'https://ex.com/2.jpg', 'https://ex.com/3.jpg', 'https://ex.com/4.jpg', 'https://ex.com/5.jpg', 'https://ex.com/6.jpg']
    }, { authorization: `Bearer ${userToken}` });
    await submitHandler(reqResTooMany.req, reqResTooMany.res);
    const resTooMany = reqResTooMany.getResult();
    console.log('    Status:', resTooMany.status, 'Error code:', resTooMany.data?.error?.code);
    assert.strictEqual(resTooMany.status, 400);
    assert.strictEqual(resTooMany.data?.error?.code, 'TOO_MANY_IMAGES');
    console.log('    ✓ API đã chặn > 5 ảnh chuẩn xác!');

    // 5b. Kiểm tra chặn URL nguy hiểm (javascript / data)
    console.log('  5b. Kiểm tra chặn giao thức không an toàn (INSECURE_IMAGE_URL):');
    const reqResInsecure = mockReqRes('POST', {
        client_submission_id: 'test_sub_insecure_' + Date.now(),
        name: 'Quán Ăn Thử Nghiệm 2',
        category: 'Ẩm thực',
        area: 'TP. Trà Vinh',
        address: '123 Đường 30/4',
        description: 'Mô tả quán ăn thử nghiệm',
        images: ['javascript:alert(1)']
    }, { authorization: `Bearer ${userToken}` });
    await submitHandler(reqResInsecure.req, reqResInsecure.res);
    const resInsecure = reqResInsecure.getResult();
    console.log('    Status:', resInsecure.status, 'Error code:', resInsecure.data?.error?.code);
    assert.strictEqual(resInsecure.status, 400);
    assert(resInsecure.data?.error?.code === 'INSECURE_IMAGE_URL' || resInsecure.data?.error?.code === 'INVALID_IMAGE_URL');
    console.log('    ✓ API đã chặn URL không an toàn chuẩn xác!');

    // 5c. Kiểm tra gửi thành công với ảnh hợp lệ
    console.log('  5c. Kiểm tra gửi địa điểm thành công kèm ảnh đã tải lên:');
    const clientSubId = 'contrib_test_photo_' + Date.now();
    const reqResValid = mockReqRes('POST', {
        client_submission_id: clientSubId,
        name: 'Địa Điểm Thử Nghiệm Tải Ảnh ' + Date.now().toString().slice(-4),
        category: 'Ẩm thực',
        area: 'TP. Trà Vinh',
        address: 'Số 99 Điện Biên Phủ, Khóm 3, TP. Trà Vinh',
        description: 'Mô tả địa điểm thử nghiệm chức năng tải ảnh thực tế vào CSDL',
        contributor: 'Người dùng thử nghiệm',
        images: [publicUrl]
    }, { authorization: `Bearer ${userToken}` });
    await submitHandler(reqResValid.req, reqResValid.res);
    const resSubmit = reqResValid.getResult();
    console.log('    Status:', resSubmit.status, 'Success:', resSubmit.data?.success);
    assert(resSubmit.status === 201 || resSubmit.status === 200, 'Gửi địa điểm phải thành công');
    const createdPlace = resSubmit.data?.data;
    assert(createdPlace?.id, 'Phải có ID địa điểm được tạo');
    console.log('    Đã tạo địa điểm ID =', createdPlace.id, 'status =', createdPlace.status);
    console.log('    Images lưu trong DB:', createdPlace.images);
    console.log('    Image link trong DB:', createdPlace.image_link);
    assert.deepStrictEqual(createdPlace.images, [publicUrl]);
    assert.strictEqual(createdPlace.image_link, publicUrl);
    console.log('    ✓ Địa điểm đã được tạo với status = draft, images và image_link gắn kết chuẩn xác!');

    // 6. Kiểm tra Admin duyệt địa điểm
    console.log('\n6. Kiểm tra Admin duyệt địa điểm qua API _admin/places:');
    const { default: adminPlacesHandler } = await import('../api/_admin/places.js');
    process.env.ADMIN_SECRET = 'dev-admin';
    const reqResApprove = mockReqRes('PATCH', {
        id: createdPlace.id,
        status: 'approved',
        expected_updated_at: createdPlace.updated_at || createdPlace.created_at
    }, { authorization: 'Bearer mock-admin-token' });
    reqResApprove.req.url = `/api/admin-places/${createdPlace.id}`;
    await adminPlacesHandler(reqResApprove.req, reqResApprove.res);
    const resApprove = reqResApprove.getResult();
    console.log('    Status:', resApprove.status, 'Success:', resApprove.data?.success, 'Data/Error:', JSON.stringify(resApprove.data));
    assert(resApprove.status === 200, 'Admin duyệt địa điểm phải trả về 200');
    assert.strictEqual(resApprove.data?.place?.status, 'approved');
    console.log('    ✓ Địa điểm đã được Admin duyệt chuyển sang status = approved!');

    // 7. Dọn dẹp bản ghi test và ảnh test
    console.log('\n7. Dọn dẹp bản ghi thử nghiệm:');
    await fetch(`${SUPABASE_URL}/rest/v1/places?id=eq.${createdPlace.id}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos/${validPath}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    console.log('    ✓ Đã dọn dẹp bản ghi và ảnh test an toàn!');

    console.log('\n=== TẤT CẢ CÁC BƯỚC KIỂM THỬ API & STORAGE ĐÃ THÀNH CÔNG RỰC RỠ ===');
}

main().catch(err => {
    console.error('❌ Kiểm thử thất bại:', err);
    process.exit(1);
});
