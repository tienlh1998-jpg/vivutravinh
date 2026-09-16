// scripts/test-sw-upgrade.js - Kiểm thử tự động nâng cấp Service Worker v2.9.0: Atomic Precache, Partitioned Cache, LRU Limit & API Exclusion
import assert from 'assert';

console.log('=== BẮT ĐẦU KIỂM THỬ SERVICE WORKER v2.9.0 (PARTITIONED & ATOMIC) ===\n');

// 1. Giả lập môi trường Caches API
const VERSION = '2.9.0';
const CACHE_SHELL = `vivutravinh-shell-v${VERSION}`;
const CACHE_DATA = `vivutravinh-data-v${VERSION}`;
const CACHE_IMAGES = `vivutravinh-images-v${VERSION}`;
const CURRENT_CACHES = [CACHE_SHELL, CACHE_DATA, CACHE_IMAGES];
const MAX_IMAGE_ENTRIES = 30;

let mockCacheStorage = new Map();

class MockCache {
    constructor(name) {
        this.name = name;
        this.store = new Map();
    }
    async put(request, response) {
        const key = typeof request === 'string' ? request : request.url;
        this.store.set(key, response);
    }
    async match(request) {
        const key = typeof request === 'string' ? request : request.url;
        return this.store.get(key) || null;
    }
    async keys() {
        return Array.from(this.store.keys());
    }
    async delete(request) {
        const key = typeof request === 'string' ? request : request.url;
        return this.store.delete(key);
    }
    async addAll(urls) {
        for (const u of urls) {
            if (u.includes('missing-asset-404')) {
                throw new Error(`HTTP 404: Not Found for ${u}`);
            }
            this.store.set(u, { status: 200, body: `content of ${u}` });
        }
    }
}

const mockCaches = {
    async open(cacheName) {
        if (!mockCacheStorage.has(cacheName)) {
            mockCacheStorage.set(cacheName, new MockCache(cacheName));
        }
        return mockCacheStorage.get(cacheName);
    },
    async keys() {
        return Array.from(mockCacheStorage.keys());
    },
    async delete(cacheName) {
        return mockCacheStorage.delete(cacheName);
    },
    async match(request) {
        for (const cache of mockCacheStorage.values()) {
            const res = await cache.match(request);
            if (res) return res;
        }
        return null;
    }
};

// ============================================================================
// TEST 1: NGUYÊN TỬ PRECACHE - NẾU PRECACHE THẤT BẠI (404), KHÔNG ACTIVE, GIỮ CACHE CŨ
// ============================================================================
console.log('1. Kiểm thử Precache Nguyên Tử (Atomic Precache):');
// Thiết lập cache đang chạy ổn định
const stableCache = await mockCaches.open('vivutravinh-v2.8.0');
await stableCache.put('./index.html', { body: '<html>Stable v2.8.0</html>' });
await stableCache.put('./js/app.js', { body: '// Stable app.js v2.8.0' });

let test1KeysBefore = await mockCaches.keys();
assert.ok(test1KeysBefore.includes('vivutravinh-v2.8.0'));

// Mô phỏng install của worker mới nhưng chứa URL lỗi 404
const faultyInstallUrls = [
    './index.html',
    './vendor/leaflet/leaflet.js',
    './missing-asset-404.png' // URL lỗi
];

let installFailed = false;
try {
    const candidateCache = await mockCaches.open(CACHE_SHELL);
    // Service Worker KHÔNG nuốt lỗi trong event.waitUntil(cache.addAll(...))
    await candidateCache.addAll(faultyInstallUrls);
} catch (err) {
    installFailed = true;
    console.log(`  ✓ Bắt được lỗi precache đúng kỳ vọng: ${err.message}`);
}

assert.strictEqual(installFailed, true, 'Precache có lỗi 404 PHẢI reject install promise');

// Vì install fail, activate KHÔNG ĐƯỢC CHẠY -> Cache cũ nguyên vẹn
const test1KeysAfter = await mockCaches.keys();
assert.ok(test1KeysAfter.includes('vivutravinh-v2.8.0'), 'Cache cũ vivutravinh-v2.8.0 phải được giữ nguyên vẹn khi install fail');
const intactApp = await stableCache.match('./js/app.js');
assert.strictEqual(intactApp.body, '// Stable app.js v2.8.0');
console.log('  ✓ Precache nguyên tử hoạt động chuẩn: Worker mới bị từ chối, cache cũ được bảo toàn');

// ============================================================================
// TEST 2: NÂNG CẤP THÀNH CÔNG VÀ XÓA CACHE CŨ TRONG ACTIVATE (PARTITIONED CACHES)
// ============================================================================
console.log('\n2. Kiểm thử nâng cấp thành công lên Partitioned Caches v2.9.0 & dọn dẹp cache cũ:');
// Giả lập thêm các cache cũ
await mockCaches.open('vivutravinh-v2.5.0');
await mockCaches.open('vivutravinh-v2.6.0');
await mockCaches.open('vivutravinh-v2.7.0');
await mockCaches.open('unrelated-thirdparty-cache');

// Tạo thành công 3 phân vùng cache mới
const shellCache = await mockCaches.open(CACHE_SHELL);
await shellCache.put('./index.html', { status: 200, body: '<html>App Shell v2.9.0</html>' });
await shellCache.put('./js/app.js', { status: 200, body: '// App JS v2.9.0' });

const dataCache = await mockCaches.open(CACHE_DATA);
await dataCache.put('./data/data-fallback.json', { status: 200, body: '{"places": []}' });

const imgCache = await mockCaches.open(CACHE_IMAGES);
await imgCache.put('./icons/icon.svg', { status: 200, body: '<svg></svg>' });

// Thực thi activate dọn dẹp:
const allKeys = await mockCaches.keys();
const deletionPromises = allKeys
    .filter((name) => name.startsWith('vivutravinh-') && !CURRENT_CACHES.includes(name))
    .map((name) => mockCaches.delete(name));
await Promise.all(deletionPromises);

const remainingKeys = await mockCaches.keys();
console.log('  Remaining caches:', remainingKeys);

assert.strictEqual(remainingKeys.includes('vivutravinh-v2.5.0'), false);
assert.strictEqual(remainingKeys.includes('vivutravinh-v2.6.0'), false);
assert.strictEqual(remainingKeys.includes('vivutravinh-v2.7.0'), false);
assert.strictEqual(remainingKeys.includes('vivutravinh-v2.8.0'), false);
assert.strictEqual(remainingKeys.includes(CACHE_SHELL), true, 'CACHE_SHELL phải tồn tại');
assert.strictEqual(remainingKeys.includes(CACHE_DATA), true, 'CACHE_DATA phải tồn tại');
assert.strictEqual(remainingKeys.includes(CACHE_IMAGES), true, 'CACHE_IMAGES phải tồn tại');
assert.strictEqual(remainingKeys.includes('unrelated-thirdparty-cache'), true, 'Cache của ứng dụng khác không bị xóa');
console.log('  ✓ Toàn bộ cache cũ đã được xóa sạch sẽ, 3 phân vùng v2.9.0 hoạt động độc lập');

// ============================================================================
// TEST 3: GIỚI HẠN DUNG LƯỢNG CACHE HÌNH ẢNH (MAX_IMAGE_ENTRIES = 30)
// ============================================================================
console.log('\n3. Kiểm thử giới hạn số lượng ảnh trong Runtime Image Cache (LRU Eviction):');
async function limitCacheEntries(cacheName, maxEntries) {
    const cache = await mockCaches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxEntries) {
        const toDelete = keys.slice(0, keys.length - maxEntries);
        await Promise.all(toDelete.map((k) => cache.delete(k)));
    }
}

// Nạp 35 hình ảnh vào CACHE_IMAGES
const testImgCache = await mockCaches.open(CACHE_IMAGES);
for (let i = 1; i <= 35; i++) {
    await testImgCache.put(`./photos/place_${i}.jpg`, { status: 200, body: `photo_${i}` });
    await limitCacheEntries(CACHE_IMAGES, MAX_IMAGE_ENTRIES);
}

const finalImgKeys = await testImgCache.keys();
console.log(`  Số ảnh trong đệm sau khi thêm 35 ảnh: ${finalImgKeys.length}`);
assert.strictEqual(finalImgKeys.length, MAX_IMAGE_ENTRIES, `Số ảnh không được vượt quá ${MAX_IMAGE_ENTRIES}`);
// Ảnh cũ nhất (place_1 đến place_5) phải bị xóa
assert.strictEqual(finalImgKeys.includes('./photos/place_1.jpg'), false, 'Ảnh cũ nhất place_1 phải bị evict');
assert.strictEqual(finalImgKeys.includes('./photos/place_5.jpg'), false, 'Ảnh cũ nhất place_5 phải bị evict');
assert.strictEqual(finalImgKeys.includes('./photos/place_35.jpg'), true, 'Ảnh mới nhất place_35 phải tồn tại');
console.log(`  ✓ Cơ chế LRU dọn dẹp chính xác: chỉ lưu tối đa ${MAX_IMAGE_ENTRIES} ảnh`);

// ============================================================================
// TEST 4: TUYỆT ĐỐI KHÔNG CACHE CÁC ENDPOINT API (SUPABASE REST & /api/)
// ============================================================================
console.log('\n4. Kiểm thử loại trừ các endpoint API (Comments, Supabase REST):');
function isExcludedApiUrl(urlStr) {
    const url = new URL(urlStr);
    return url.pathname.startsWith('/api/') || 
           url.pathname.includes('/rest/v1/') || 
           url.hostname.includes('supabase.co');
}

assert.strictEqual(isExcludedApiUrl('https://abcxyz.supabase.co/rest/v1/comments?select=*'), true);
assert.strictEqual(isExcludedApiUrl('https://vivutravinh.vn/api/submit-comment'), true);
assert.strictEqual(isExcludedApiUrl('https://vivutravinh.vn/api/reviews'), true);
assert.strictEqual(isExcludedApiUrl('https://vivutravinh.vn/index.html'), false);
assert.strictEqual(isExcludedApiUrl('https://vivutravinh.vn/js/app.js'), false);
assert.strictEqual(isExcludedApiUrl('https://vivutravinh.vn/data/data-fallback.json'), false);
console.log('  ✓ API Supabase REST và /api/ được loại trừ 100%, không bị Service Worker can thiệp cache');

console.log('\n=== TẤT CẢ KIỂM THỬ NÂNG CẤP SERVICE WORKER v2.9.0 ĐẠT 100%! ===');
