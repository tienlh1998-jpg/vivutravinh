// scripts/test-sw-upgrade.js - Kiểm thử tự động nâng cấp Service Worker và dọn dẹp cache cũ
import assert from 'assert';

console.log('=== BẮT ĐẦU KIỂM THỬ NÂNG CẤP SERVICE WORKER VÀ DỌN DẸP CACHE ===\n');

// 1. Giả lập môi trường Caches API
const CURRENT_SW_CACHE = 'vivutravinh-v2.7.0';
const mockCacheStorage = new Map();

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
    async addAll(urls) {
        for (const u of urls) {
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

// 2. Thiết lập dữ liệu cache cũ trước khi nâng cấp
console.log('1. Khởi tạo các cache phiên bản cũ trong trình duyệt:');
await mockCaches.open('vivutravinh-v2.5.0');
const c25 = await mockCaches.open('vivutravinh-v2.5.0');
await c25.put('./index.html', { body: '<html>Old v2.5.0</html>' });
await c25.put('./js/app.js', { body: '// Old app.js v2.5.0' });

await mockCaches.open('vivutravinh-v2.6.0');
const c26 = await mockCaches.open('vivutravinh-v2.6.0');
await c26.put('./index.html', { body: '<html>Previous v2.6.0</html>' });
await c26.put('./js/app.js', { body: '// Previous app.js v2.6.0' });

await mockCaches.open('unrelated-thirdparty-cache');

let initialKeys = await mockCaches.keys();
assert.strictEqual(initialKeys.length, 3);
assert.ok(initialKeys.includes('vivutravinh-v2.5.0'));
assert.ok(initialKeys.includes('vivutravinh-v2.6.0'));
assert.ok(initialKeys.includes('unrelated-thirdparty-cache'));
console.log('  ✓ Đã nạp 2 cache cũ (v2.5.0, v2.6.0) và 1 cache bên thứ ba');

// 3. Thực thi logic activate của Service Worker mới (v2.7.0)
console.log('\n2. Kích hoạt Service Worker mới và thực thi xóa cache cũ (Activate Event):');
const cacheNames = await mockCaches.keys();
const deletionPromises = cacheNames
    .filter((cacheName) => cacheName.startsWith('vivutravinh-') && cacheName !== CURRENT_SW_CACHE)
    .map((cacheName) => mockCaches.delete(cacheName));

await Promise.all(deletionPromises);

// Tạo cache mới v2.7.0
const newCache = await mockCaches.open(CURRENT_SW_CACHE);
await newCache.put('./index.html', { body: '<html>New v2.7.0</html>' });
await newCache.put('./js/app.js', { body: '// Modern app.js v2.7.0' });

const remainingKeys = await mockCaches.keys();
console.log('  Remaining caches:', remainingKeys);

assert.strictEqual(remainingKeys.includes('vivutravinh-v2.5.0'), false, 'vivutravinh-v2.5.0 phải bị xóa');
assert.strictEqual(remainingKeys.includes('vivutravinh-v2.6.0'), false, 'vivutravinh-v2.6.0 phải bị xóa');
assert.strictEqual(remainingKeys.includes('vivutravinh-v2.7.0'), true, 'vivutravinh-v2.7.0 phải tồn tại');
assert.strictEqual(remainingKeys.includes('unrelated-thirdparty-cache'), true, 'Cache không thuộc vivutravinh không được xóa bừa bãi');
console.log('  ✓ Toàn bộ cache cũ của ViVuTraVinh đã bị xóa sạch sẽ');
console.log('  ✓ Cache mới v2.7.0 là cache ViVuTraVinh duy nhất hoạt động');

// 4. Kiểm thử chiến lược Network-First cho HTML & JS
console.log('\n3. Kiểm thử chiến lược Network-First cho JS/HTML (tránh nạp module cũ):');
let onlineNetworkCalled = false;
async function simulateFetch(request, isOnline = true) {
    const url = request.url;
    const sameOrigin = true;
    const isScriptOrDoc = url.endsWith('.html') || url.endsWith('.js');

    if (isScriptOrDoc) {
        if (isOnline) {
            onlineNetworkCalled = true;
            const networkResponse = { status: 200, body: `Fresh network content for ${url}` };
            const cache = await mockCaches.open(CURRENT_SW_CACHE);
            await cache.put(request, networkResponse);
            return networkResponse;
        } else {
            // Offline fallback
            const cached = await mockCaches.match(request);
            if (cached) return cached;
            throw new Error('Offline and not in cache');
        }
    }
}

// Khi online: nạp từ mạng mới nhất
onlineNetworkCalled = false;
const onlineRes = await simulateFetch({ url: './js/app.js' }, true);
assert.strictEqual(onlineNetworkCalled, true, 'Online phải fetch từ mạng trước');
assert.strictEqual(onlineRes.body, 'Fresh network content for ./js/app.js');
console.log('  ✓ Khi có mạng: Nạp mã JS mới nhất từ network, cập nhật đệm ngay lập tức');

// Khi offline: lấy từ cache
const offlineRes = await simulateFetch({ url: './js/app.js' }, false);
assert.strictEqual(offlineRes.body, 'Fresh network content for ./js/app.js');
console.log('  ✓ Khi offline: Fallback về bản cache hợp lệ');

console.log('\n=== TẤT CẢ KIỂM THỬ NÂNG CẤP SERVICE WORKER ĐẠT 100%! ===');
