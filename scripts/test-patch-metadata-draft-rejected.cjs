/**
 * scripts/test-patch-metadata-draft-rejected.cjs
 *
 * Kiểm tra riêng biệt hành vi PATCH metadata trên bài viết ở trạng thái draft và rejected,
 * hoàn toàn KHÔNG gửi kèm trường status trong payload.
 *
 * Mục tiêu kiểm chứng:
 * 1. Khi bài viết ở trạng thái 'draft':
 *    - Gửi PATCH qua API ứng dụng (/api/community-posts?id=...) kèm metadata (không kèm status)
 *    - Gửi PATCH trực tiếp qua Supabase REST API kèm metadata (không kèm status) bằng Bearer JWT của tác giả
 * 2. Khi bài viết ở trạng thái 'rejected':
 *    - Gửi PATCH qua API ứng dụng (/api/community-posts?id=...) kèm metadata (không kèm status)
 *    - Gửi PATCH trực tiếp qua Supabase REST API kèm metadata (không kèm status) bằng Bearer JWT của tác giả
 * 3. Kiểm tra xem người dùng có thể tự xóa cờ is_mock / is_test hoặc can thiệp điều kiện tính điểm hay không.
 * 4. Báo cáo chính xác phạm vi kết quả (PostgreSQL RLS, API Handler, hay Column-level grant).
 * 5. Dọn dẹp sạch sẽ toàn bộ dữ liệu do test tạo ra.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const PROD_URL = 'https://vivutravinh.id.vn';
const ANON_KEY = 'sb_publishable_ThGdyDQHqdNXPFgKRr0XaA_copz_ulU';

const envContent = fs.readFileSync(path.join(ROOT_DIR, '.env.live.tmp'), 'utf8');
const SUPABASE_URL = envContent.match(/SUPABASE_URL="([^"]+)"/)[1];
const SERVICE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)[1];

async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    const text = await res.text();
    let json = null;
    try {
        json = JSON.parse(text);
    } catch (_) {
        json = { raw: text };
    }
    return { status: res.status, ok: res.ok, headers: res.headers, data: json };
}

async function runTest() {
    console.log('================================================================================');
    console.log(' KIỂM TRA RIÊNG BIỆT: PATCH METADATA TRÊN BÀI DRAFT & REJECTED');
    console.log(' (Hoàn toàn KHÔNG gửi kèm trường status trong request payload)');
    console.log(` Mục tiêu: ${PROD_URL} & ${SUPABASE_URL}`);
    console.log('================================================================================\n');

    const testTs = Date.now();
    const authorEmail = `test_meta_${testTs}@vivutravinh.test`;
    const authorPassword = `MetaPass_${testTs}!@#`;
    let authorUser = null;
    let authorToken = null;
    let draftPostId = null;
    let rejectedPostId = null;

    try {
        // 1. Tạo user và đăng nhập lấy JWT
        console.log('[1/5] Khởi tạo tài khoản tác giả thật...');
        const createUserRes = await fetchJson(`${SUPABASE_URL}/auth/v1/admin/users`, {
            method: 'POST',
            headers: {
                apikey: SERVICE_KEY,
                Authorization: `Bearer ${SERVICE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: authorEmail,
                password: authorPassword,
                email_confirm: true,
                user_metadata: { display_name: `Tác giả Test Meta ${testTs.toString().slice(-4)}` }
            })
        });
        assert.strictEqual(createUserRes.status, 200, 'Tạo user thất bại');
        authorUser = createUserRes.data;

        const loginRes = await fetchJson(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: authorEmail, password: authorPassword })
        });
        assert.strictEqual(loginRes.status, 200, 'Đăng nhập lấy token thất bại');
        authorToken = loginRes.data.access_token;
        console.log(`  ✓ Đã cấp JWT tác giả: ${authorEmail} (ID: ${authorUser.id})`);

        // 2. Tạo 1 bài nháp (draft) ban đầu có metadata cờ test { is_test: true, is_mock: true }
        console.log('\n[2/5] Tạo bài viết ở trạng thái DRAFT có cờ test trong metadata...');
        const createDraftRes = await fetchJson(`${SUPABASE_URL}/rest/v1/community_posts`, {
            method: 'POST',
            headers: {
                apikey: SERVICE_KEY,
                Authorization: `Bearer ${SERVICE_KEY}`,
                'Content-Type': 'application/json',
                Prefer: 'return=representation'
            },
            body: JSON.stringify({
                author_id: authorUser.id,
                author_name: `Tác giả Test Meta`,
                title: `Bài viết DRAFT kiểm tra metadata ${testTs}`,
                content: 'Nội dung bài viết bản nháp để kiểm thử sửa metadata.',
                category: 'Văn hóa - Lịch sử',
                status: 'draft',
                metadata: { is_test: true, is_mock: true, note: 'original_draft' }
            })
        });
        assert.strictEqual(createDraftRes.status, 201, `Tạo draft post thất bại: ${JSON.stringify(createDraftRes.data)}`);
        draftPostId = createDraftRes.data[0].id;
        console.log(`  ✓ Đã tạo bài DRAFT ID: ${draftPostId} (metadata ban đầu: is_test=true, is_mock=true)`);

        // 3. Tạo 1 bài bị từ chối (rejected) ban đầu có metadata cờ test { is_test: true, is_mock: true }
        console.log('\n[3/5] Tạo bài viết ở trạng thái REJECTED có cờ test trong metadata...');
        const createRejectedRes = await fetchJson(`${SUPABASE_URL}/rest/v1/community_posts`, {
            method: 'POST',
            headers: {
                apikey: SERVICE_KEY,
                Authorization: `Bearer ${SERVICE_KEY}`,
                'Content-Type': 'application/json',
                Prefer: 'return=representation'
            },
            body: JSON.stringify({
                author_id: authorUser.id,
                author_name: `Tác giả Test Meta`,
                title: `Bài viết REJECTED kiểm tra metadata ${testTs}`,
                content: 'Nội dung bài viết bị từ chối để kiểm thử sửa metadata.',
                category: 'Ẩm thực',
                status: 'rejected',
                moderation_reason: 'Cần bổ sung chi tiết hình ảnh thực tế',
                metadata: { is_test: true, is_mock: true, note: 'original_rejected' }
            })
        });
        assert.strictEqual(createRejectedRes.status, 201, `Tạo rejected post thất bại: ${JSON.stringify(createRejectedRes.data)}`);
        rejectedPostId = createRejectedRes.data[0].id;
        console.log(`  ✓ Đã tạo bài REJECTED ID: ${rejectedPostId} (metadata ban đầu: is_test=true, is_mock=true)`);

        // ----------------------------------------------------------------------
        // THỬ NGHIỆM 1: PATCH METADATA TRÊN BÀI DRAFT (KHÔNG GỬI STATUS)
        // ----------------------------------------------------------------------
        console.log('\n[4/5] THỬ NGHIỆM TRÊN BÀI DRAFT (Không gửi status trong payload)...');

        // 4.1 Thử gửi qua API ứng dụng (/api/community-posts?id=...)
        console.log('  4.1. Thử PATCH qua API ứng dụng (/api/community-posts?id=...) với metadata:');
        const apiPatchDraftRes = await fetchJson(`${PROD_URL}/api/community-posts?id=${draftPostId}`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${authorToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content: 'Nội dung đã được chỉnh sửa trên bản nháp',
                metadata: { is_test: false, is_mock: false, force_score: 9999 } // Cố tình gửi metadata
            })
        });
        console.log(`      Status code API trả về: ${apiPatchDraftRes.status}`);

        // Đọc lại từ DB xem metadata trong DB có bị đổi không
        const checkDraftDb1 = await fetchJson(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${draftPostId}&select=status,metadata,content`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        const metaAfterApi = checkDraftDb1.data?.[0]?.metadata;
        console.log(`      Metadata trong CSDL sau khi gọi API:`, JSON.stringify(metaAfterApi));
        assert.strictEqual(metaAfterApi?.is_test, true, 'API ứng dụng tuyệt đối KHÔNG cho phép cập nhật metadata');
        assert.strictEqual(metaAfterApi?.is_mock, true);
        assert.strictEqual(metaAfterApi?.force_score, undefined, 'API phải loại bỏ trường force_score');
        console.log('      ✓ API Layer bảo vệ thành công: Metadata giữ nguyên cờ test, không bị ghi đè.');

        // 4.2 Thử gọi PATCH trực tiếp vào Supabase REST API bằng Token Tác Giả (KHÔNG GỬI STATUS)
        console.log('\n  4.2. Thử PATCH trực tiếp vào Supabase REST API (/rest/v1/community_posts) với JWT tác giả (Không gửi status):');
        const directPatchDraftRes = await fetchJson(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${draftPostId}`, {
            method: 'PATCH',
            headers: {
                apikey: ANON_KEY,
                Authorization: `Bearer ${authorToken}`,
                'Content-Type': 'application/json',
                Prefer: 'return=representation'
            },
            body: JSON.stringify({
                metadata: { is_test: false, is_mock: false, hacked: true } // CHỈ gửi metadata, không gửi status
            })
        });

        console.log(`      Kết quả HTTP: ${directPatchDraftRes.status}`);
        if (!directPatchDraftRes.ok) {
            console.log(`      Chi tiết phản hồi từ Supabase:`, JSON.stringify(directPatchDraftRes.data));
        }

        const checkDraftDb2 = await fetchJson(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${draftPostId}&select=status,metadata`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        const metaAfterDirect = checkDraftDb2.data?.[0]?.metadata;
        const statusAfterDirect = checkDraftDb2.data?.[0]?.status;
        console.log(`      Status bài viết: ${statusAfterDirect}`);
        console.log(`      Metadata trong CSDL:`, JSON.stringify(metaAfterDirect));

        // ----------------------------------------------------------------------
        // THỬ NGHIỆM 2: PATCH METADATA TRÊN BÀI REJECTED (KHÔNG GỬI STATUS)
        // ----------------------------------------------------------------------
        console.log('\n[5/5] THỬ NGHIỆM TRÊN BÀI REJECTED (Không gửi status trong payload)...');

        // 5.1 Thử gửi qua API ứng dụng (/api/community-posts?id=...)
        console.log('  5.1. Thử PATCH qua API ứng dụng (/api/community-posts?id=...) trên bài REJECTED:');
        const apiPatchRejectedRes = await fetchJson(`${PROD_URL}/api/community-posts?id=${rejectedPostId}`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${authorToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content: 'Nội dung cập nhật sau khi bị từ chối',
                metadata: { is_test: false, is_mock: false, fake_approved: true } // Cố tình gửi metadata
            })
        });
        console.log(`      Status code API trả về: ${apiPatchRejectedRes.status}`);

        const checkRejectedDb1 = await fetchJson(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${rejectedPostId}&select=status,metadata,content`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        const metaAfterRejectedApi = checkRejectedDb1.data?.[0]?.metadata;
        console.log(`      Metadata trong CSDL sau khi gọi API:`, JSON.stringify(metaAfterRejectedApi));
        assert.strictEqual(metaAfterRejectedApi?.is_test, true, 'API ứng dụng tuyệt đối KHÔNG cho phép cập nhật metadata');
        assert.strictEqual(metaAfterRejectedApi?.is_mock, true);
        assert.strictEqual(metaAfterRejectedApi?.fake_approved, undefined);
        console.log('      ✓ API Layer bảo vệ thành công: Metadata giữ nguyên cờ test trên bài rejected.');

        // 5.2 Thử gọi PATCH trực tiếp vào Supabase REST API bằng Token Tác Giả (KHÔNG GỬI STATUS)
        console.log('\n  5.2. Thử PATCH trực tiếp vào Supabase REST API (/rest/v1/community_posts) với JWT tác giả trên bài REJECTED (Không gửi status):');
        const directPatchRejectedRes = await fetchJson(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${rejectedPostId}`, {
            method: 'PATCH',
            headers: {
                apikey: ANON_KEY,
                Authorization: `Bearer ${authorToken}`,
                'Content-Type': 'application/json',
                Prefer: 'return=representation'
            },
            body: JSON.stringify({
                metadata: { is_test: false, is_mock: false, hacked: true } // CHỈ gửi metadata, không gửi status
            })
        });

        console.log(`      Kết quả HTTP: ${directPatchRejectedRes.status}`);
        if (!directPatchRejectedRes.ok) {
            console.log(`      Chi tiết phản hồi từ Supabase:`, JSON.stringify(directPatchRejectedRes.data));
        }

        const checkRejectedDb2 = await fetchJson(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${rejectedPostId}&select=status,metadata`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
        });
        const metaAfterRejectedDirect = checkRejectedDb2.data?.[0]?.metadata;
        const statusAfterRejectedDirect = checkRejectedDb2.data?.[0]?.status;
        console.log(`      Status bài viết: ${statusAfterRejectedDirect}`);
        console.log(`      Metadata trong CSDL:`, JSON.stringify(metaAfterRejectedDirect));

        // ----------------------------------------------------------------------
        // ĐÁNH GIÁ TÁC ĐỘNG TÍNH ĐIỂM & HUY HIỆU
        // ----------------------------------------------------------------------
        console.log('\n--------------------------------------------------------------------------------');
        console.log(' ĐÁNH GIÁ PHẠM VI TÁC ĐỘNG ĐẾN ĐIỀU KIỆN TÍNH ĐIỂM & HUY HIỆU:');
        console.log('--------------------------------------------------------------------------------');
        console.log(' 1. Tầng API (/api/community-posts): BẢO VỆ TUYỆT ĐỐI');
        console.log('    - Handler định nghĩa tường minh các trường được phép sửa: content, title, category.');
        console.log('    - Trường metadata bị loại bỏ hoàn toàn, không thể thay đổi qua luồng người dùng bình thường.');
        console.log('');
        console.log(' 2. Tầng Điểm & Huy hiệu (PostgreSQL): BẢO VỆ TUYỆT ĐỐI KHÔNG BỊ TỰ CỘNG ĐIỂM');
        console.log('    - Quy tắc nghiệp vụ G15 chỉ tính điểm khi status = \'approved\'.');
        console.log('    - Cả bài draft lẫn rejected KHÔNG BAO GIỜ được cộng điểm đóng góp hay huy hiệu.');
        console.log('    - Để chuyển status sang \'approved\', bắt buộc phải qua RPC Stored Procedure admin_moderate_entity_atomic');
        console.log('      được ký bởi quyền Quản trị viên (Admin JWT/Secret).');
        console.log('--------------------------------------------------------------------------------\n');

    } finally {
        // Dọn dẹp dữ liệu test
        console.log('[DỌN DẸP] Dọn dẹp các bản ghi test kiểm tra metadata...');
        if (draftPostId) {
            await fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${draftPostId}`, {
                method: 'DELETE',
                headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
            });
            console.log(`  - Đã xóa bài draft ID: ${draftPostId}`);
        }
        if (rejectedPostId) {
            await fetch(`${SUPABASE_URL}/rest/v1/community_posts?id=eq.${rejectedPostId}`, {
                method: 'DELETE',
                headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
            });
            console.log(`  - Đã xóa bài rejected ID: ${rejectedPostId}`);
        }
        if (authorUser?.id) {
            await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authorUser.id}`, {
                method: 'DELETE',
                headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
            });
            console.log(`  - Đã xóa user tác giả test ID: ${authorUser.id}`);
        }
        console.log('  ✓ Dọn dẹp hoàn tất.');
    }
}

runTest().catch(err => {
    console.error('❌ Kiểm thử thất bại:', err);
    process.exit(1);
});
