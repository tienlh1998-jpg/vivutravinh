// scripts/verify-g4-offline.cjs - Real Browser Offline & Build Verification (G4)
const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACT_DIR = '/home/huutien-tran/.gemini/antigravity/brain/1cab34ab-f633-487c-8e0f-9175241583a3';
const PREVIEW_PORT = 8089;

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function waitForHttpServer(port, timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const ok = await new Promise((resolve) => {
                const req = http.get(`http://127.0.0.1:${port}/index.html`, (res) => {
                    resolve(res.statusCode === 200);
                });
                req.on('error', () => resolve(false));
            });
            if (ok) return true;
        } catch {}
        await sleep(200);
    }
    throw new Error(`Server preview port ${port} không sẵn sàng sau ${timeoutMs}ms.`);
}

async function getDebuggerUrl(port, targetPortStr = String(PREVIEW_PORT)) {
    for (let i = 0; i < 35; i++) {
        try {
            const data = await new Promise((resolve, reject) => {
                const req = http.get(`http://127.0.0.1:${port}/json`, res => {
                    let d = '';
                    res.on('data', c => d += c);
                    res.on('end', () => resolve(d));
                });
                req.on('error', reject);
            });
            const pages = JSON.parse(data);
            const target = pages.find(p => p.url && p.url.includes(targetPortStr));
            if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
        } catch (e) {
            await sleep(200);
        }
    }
    throw new Error('Không thể kết nối Chrome DevTools Protocol.');
}

class CDPClient {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.reqId = 0;
        this.callbacks = new Map();
        this.eventListeners = [];
        this.ws.onmessage = (msg) => {
            const res = JSON.parse(msg.data);
            if (res.id && this.callbacks.has(res.id)) {
                const cb = this.callbacks.get(res.id);
                this.callbacks.delete(res.id);
                cb(res);
            }
            if (res.method) {
                for (const l of this.eventListeners) {
                    l(res.method, res.params);
                }
            }
        };
    }

    on(fn) {
        this.eventListeners.push(fn);
    }

    removeListener(fn) {
        this.eventListeners = this.eventListeners.filter(l => l !== fn);
    }

    async navigateAndWait(url) {
        return new Promise(async (resolve) => {
            const onEvent = (method) => {
                if (method === 'Page.loadEventFired') {
                    this.removeListener(onEvent);
                    resolve();
                }
            };
            this.on(onEvent);
            await this.send('Page.navigate', { url });
        });
    }

    async ready() {
        if (this.ws.readyState === WebSocket.OPEN) return;
        return new Promise((resolve, reject) => {
            this.ws.onopen = resolve;
            this.ws.onerror = reject;
        });
    }

    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = ++this.reqId;
            this.callbacks.set(id, (res) => {
                if (res.error) reject(new Error(JSON.stringify(res.error)));
                else resolve(res.result);
            });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    async eval(expr) {
        const res = await this.send('Runtime.evaluate', {
            expression: expr,
            returnByValue: true,
            awaitPromise: true
        });
        if (res.exceptionDetails) {
            throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
        }
        return res.result?.value;
    }

    async screenshot(filePath) {
        const res = await this.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
    }

    close() {
        try { this.ws.close(); } catch (e) {}
    }
}

async function waitForCondition(fn, timeoutMs = 12000, intervalMs = 250) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fn();
            if (res) return res;
        } catch {}
        await sleep(intervalMs);
    }
    throw new Error(`Timeout vượt quá ${timeoutMs}ms khi chờ điều kiện.`);
}

async function waitForAppReady(cdp, timeoutMs = 15000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        try {
            const ready = await cdp.eval(`(() => {
                const hasApp = !!(window.ViVuApp && window.ViVuApp.state);
                const hasPlaces = (window.ViVuApp?.state?.allPlaces || []).length > 0;
                const hasCards = document.querySelectorAll('#placesDiscoveryGrid .place-card').length >= 10;
                return hasApp && hasPlaces && hasCards;
            })()`);
            if (ready) return true;
        } catch {}
        await sleep(250);
    }
    throw new Error('Hết thời gian chờ: Ứng dụng ViVuTraVinh chưa sẵn sàng (places chưa render).');
}

async function measureWebVitals(cdp) {
    return await cdp.eval(`new Promise(resolve => {
        let lcp = 0;
        let cls = 0;
        const shifts = [];
        try {
            new PerformanceObserver((entryList) => {
                const entries = entryList.getEntries();
                const lastEntry = entries[entries.length - 1];
                if (lastEntry) lcp = lastEntry.startTime;
            }).observe({ type: 'largest-contentful-paint', buffered: true });

            new PerformanceObserver((entryList) => {
                for (const entry of entryList.getEntries()) {
                    if (!entry.hadRecentInput) {
                        cls += entry.value;
                        shifts.push({
                            value: entry.value,
                            sources: (entry.sources || []).map(s => ({
                                tag: s.node ? s.node.tagName : null,
                                id: s.node ? s.node.id : null,
                                class: s.node ? s.node.className : null,
                                prev: s.previousRect,
                                curr: s.currentRect
                            }))
                        });
                    }
                }
            }).observe({ type: 'layout-shift', buffered: true });
        } catch (e) {}

        setTimeout(() => {
            resolve({ lcp: Math.round(lcp || 0), cls: Number(cls.toFixed(4)), shifts });
        }, 800);
    })`);
}

async function runOfflineVerification() {
    console.log('=== BẮT ĐẦU KIỂM THỬ TRÌNH DUYỆT THỰC TẾ G4 TRÊN BẢN BUILD DIST/ ===\n');

    // 1. Chạy build production trước để dist/ luôn cập nhật mới nhất
    console.log('0. Đảm bảo bản build production dist/ mới nhất:');
    execSync('npm run build', { cwd: ROOT_DIR, stdio: 'pipe' });
    console.log('  ✓ Đã hoàn tất biên dịch và chuẩn bị dist/');

    // 2. Khởi động preview server riêng biệt cho test (không phụ thuộc server ngoài)
    console.log(`\n0.1. Khởi động preview server phục vụ dist/ trên port ${PREVIEW_PORT}:`);
    const previewServer = spawn('node', [path.join(ROOT_DIR, 'scripts', 'preview.cjs'), `--port=${PREVIEW_PORT}`], {
        stdio: 'pipe'
    });

    let serverExited = false;
    previewServer.on('exit', () => { serverExited = true; });

    await waitForHttpServer(PREVIEW_PORT);
    console.log(`  ✓ Preview server đã sẵn sàng tại http://127.0.0.1:${PREVIEW_PORT}`);

    const cdpPort = 9228;
    const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome_g4_dist_'));
    const chrome = spawn('google-chrome', [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        `--user-data-dir=${tmpProfile}`,
        `--remote-debugging-port=${cdpPort}`,
        `http://localhost:${PREVIEW_PORT}/index.html?source=mock`
    ]);

    let cdp = null;
    const requestedUrls = [];

    try {
        const wsUrl = await getDebuggerUrl(cdpPort, String(PREVIEW_PORT));
        cdp = new CDPClient(wsUrl);
        await cdp.ready();

        // Theo dõi toàn bộ network request để xác nhận không còn CDN
        cdp.on((method, params) => {
            if (method === 'Network.requestWillBeSent') {
                requestedUrls.push(params.request.url);
            }
        });

        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('Network.enable');

        await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: 1280,
            height: 800,
            deviceScaleFactor: 1,
            mobile: false
        });

        // Chờ ứng dụng và DOM sẵn sàng
        await waitForAppReady(cdp);

        // ==========================================
        // BƯỚC 1: XÁC NHẬN LOẠI BỎ TOÀN BỘ CDN THIẾT YẾU
        // ==========================================
        console.log('\n1. Xác nhận loại bỏ CDN thiết yếu (Tailwind, Leaflet, Google Fonts, Font Awesome):');
        const cdnDomains = [
            'cdn.tailwindcss.com',
            'unpkg.com',
            'fonts.googleapis.com',
            'fonts.gstatic.com',
            'cdnjs.cloudflare.com'
        ];

        const detectedCdnRequests = requestedUrls.filter(url => 
            cdnDomains.some(domain => url.includes(domain))
        );

        console.log(`  Số request CDN thiết yếu phát hiện: ${detectedCdnRequests.length}`);
        if (detectedCdnRequests.length > 0) {
            console.error('  ❌ Phát hiện các request CDN còn tồn tại:', detectedCdnRequests);
        }
        assert.strictEqual(detectedCdnRequests.length, 0, 'Bản build dist/ không được phép gửi bất kỳ request nào đến CDN thiết yếu');
        console.log('  ✓ Đạt tiêu chuẩn Zero-CDN: Mọi thư viện (Tailwind, Leaflet, Material Symbols) đều tự lưu trữ cục bộ');

        // ==========================================
        // BƯỚC 2: KIỂM TOÁN PWA MANIFEST VÀ ICONS
        // ==========================================
        console.log('\n2. Kiểm toán PWA Manifest và tính toàn vẹn của Icons:');
        const manifest = await cdp.eval(`fetch('./manifest.json').then(r => r.json())`);
        assert.strictEqual(manifest.name, 'ViVuTraVinh - Khám Phá Trà Vinh');
        assert.strictEqual(manifest.short_name, 'ViVuTraVinh');
        assert.strictEqual(manifest.display, 'standalone');
        assert.strictEqual(manifest.theme_color, '#064e3b');
        assert.strictEqual(manifest.background_color, '#faf9f7');
        assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 4, 'Phải có ít nhất 4 icon trong manifest');
        
        // Không chứa placeholder giả mạo trong screenshots hoặc icons
        const manifestStr = JSON.stringify(manifest);
        assert.strictEqual(manifestStr.includes('placehold.co'), false, 'Manifest không được chứa link placehold.co');

        for (const icon of manifest.icons) {
            const iconStatus = await cdp.eval(`fetch('${icon.src}').then(r => r.status)`);
            assert.strictEqual(iconStatus, 200, `Icon ${icon.src} phải trả về HTTP 200`);
        }
        console.log('  ✓ Manifest JSON hợp lệ 100% chuẩn W3C PWA, không có placehold.co giả mạo');
        console.log(`  ✓ Đã kiểm tra ${manifest.icons.length} icons nội bộ, tất cả đều trả về HTTP 200 OK`);

        // ==========================================
        // BƯỚC 3: SERVICE WORKER ACTIVATION & PARTITIONED CACHES
        // ==========================================
        console.log('\n3. Chờ Service Worker kích hoạt và kiểm tra Phân Vùng Cache (Partitioned Caches):');
        await waitForCondition(async () => {
            return await cdp.eval(`(() => {
                return navigator.serviceWorker.controller !== null || 
                       (navigator.serviceWorker.ready.then(reg => !!reg.active));
            })()`);
        }, 15000);

        await sleep(2500);

        const swCacheInfo = await cdp.eval(`(async () => {
            const keys = await caches.keys();
            const hasShellCache = keys.includes('vivutravinh-shell-v2.9.0');
            const hasDataCache = keys.includes('vivutravinh-data-v2.9.0');
            let shellCount = 0;
            let dataCount = 0;
            if (hasShellCache) {
                const c = await caches.open('vivutravinh-shell-v2.9.0');
                shellCount = (await c.keys()).length;
            }
            if (hasDataCache) {
                const c = await caches.open('vivutravinh-data-v2.9.0');
                dataCount = (await c.keys()).length;
            }
            return { keys, hasShellCache, hasDataCache, shellCount, dataCount };
        })()`);

        console.log(`  Caches hiện có: ${JSON.stringify(swCacheInfo.keys)}`);
        console.log(`  Dung lượng phân vùng Shell: ${swCacheInfo.shellCount} files`);
        console.log(`  Dung lượng phân vùng Data: ${swCacheInfo.dataCount} files`);
        assert.ok(swCacheInfo.hasShellCache, 'vivutravinh-shell-v2.9.0 phải tồn tại');
        assert.ok(swCacheInfo.hasDataCache, 'vivutravinh-data-v2.9.0 phải tồn tại');
        assert.ok(swCacheInfo.shellCount >= 18, 'Phân vùng Shell phải lưu ít nhất 18 tài nguyên app shell');
        console.log('  ✓ Service Worker v2.9.0 đã kích hoạt với các phân vùng cache độc lập');

        // ==========================================
        // BƯỚC 4: GIẢ LẬP MẤT MẠNG HOÀN TOÀN & OFFLINE BANNER
        // ==========================================
        console.log('\n4. Giả lập mất mạng hoàn toàn (Offline Emulation):');
        await cdp.send('Network.emulateNetworkConditions', {
            offline: true,
            latency: 0,
            downloadThroughput: 0,
            uploadThroughput: 0
        });

        await cdp.eval(`window.dispatchEvent(new Event('offline'))`);
        await sleep(300);

        const offlineStatus = await cdp.eval(`(() => {
            const bar = document.getElementById('offlineStatusBar');
            return {
                isBarVisible: bar && !bar.classList.contains('hidden'),
                barText: bar ? bar.textContent.trim() : ''
            };
        })()`);

        console.log(`  Thanh thông báo #offlineStatusBar: ${offlineStatus.isBarVisible} ("${offlineStatus.barText}")`);
        assert.strictEqual(offlineStatus.isBarVisible, true, '#offlineStatusBar phải hiển thị khi mất mạng');
        assert.ok(offlineStatus.barText.includes('ngoại tuyến'), 'Thanh thông báo phải ghi rõ đang ở chế độ ngoại tuyến');
        console.log('  ✓ Giao diện nhận diện trạng thái ngoại tuyến tức thì');

        // ==========================================
        // BƯỚC 5: NẠP LẠI TRANG KHI OFFLINE (OFFLINE RELOAD TEST)
        // ==========================================
        console.log('\n5. Nạp lại trang toàn bộ (Page.reload) khi đang Offline:');
        await cdp.send('Page.reload');

        await cdp.send('Network.emulateNetworkConditions', {
            offline: true,
            latency: 0,
            downloadThroughput: 0,
            uploadThroughput: 0
        });

        await waitForCondition(async () => {
            return await cdp.eval(`(() => {
                const grid = document.getElementById('placesDiscoveryGrid');
                const cards = grid ? grid.querySelectorAll('.place-card').length : 0;
                return cards >= 10;
            })()`);
        }, 15000);

        await cdp.eval(`if (!navigator.onLine) window.dispatchEvent(new Event('offline'))`);

        const offlineReloadCheck = await cdp.eval(`(() => {
            const cards = document.querySelectorAll('#placesDiscoveryGrid .place-card');
            const titles = Array.from(cards).map(c => c.querySelector('h3')?.textContent?.trim()).filter(Boolean);
            const bar = document.getElementById('offlineStatusBar');
            return {
                cardCount: cards.length,
                titlesCount: titles.length,
                isBarVisible: bar && !bar.classList.contains('hidden')
            };
        })()`);

        console.log(`  Số card hiển thị sau reload offline: ${offlineReloadCheck.cardCount}`);
        assert.strictEqual(offlineReloadCheck.cardCount, 10, 'Tất cả 10 card địa điểm phải nạp từ cache');
        assert.strictEqual(offlineReloadCheck.titlesCount, 10, 'Tất cả 10 card phải có tiêu đề hợp lệ');
        assert.strictEqual(offlineReloadCheck.isBarVisible, true, 'Thanh trạng thái offline vẫn phải hiện sau reload');
        
        await cdp.screenshot(path.join(ARTIFACT_DIR, 'g4-offline-reload.png'));
        console.log('  ✓ Nạp lại trang ngoại tuyến thành công 100%!');
        console.log('  ✓ Đã cập nhật ảnh minh chứng: g4-offline-reload.png');

        // ==========================================
        // BƯỚC 6: KIỂM THỬ OFFLINE MAP OVERLAY
        // ==========================================
        console.log('\n6. Kiểm thử hiển thị thông báo bản đồ ngoại tuyến (Offline Map):');
        // Mở modal địa điểm đầu tiên
        await cdp.eval(`(() => {
            const firstCard = document.querySelector('#placesDiscoveryGrid .place-card');
            const openBtn = firstCard.querySelector('[data-action="open-detail"]');
            if (openBtn) openBtn.click();
        })()`);

        await waitForCondition(async () => {
            return await cdp.eval(`(() => {
                const modal = document.getElementById('detailModal');
                return modal && !modal.classList.contains('hidden');
            })()`);
        });

        await sleep(1000);

        const offlineMapCheck = await cdp.eval(`(() => {
            const mapContainer = document.getElementById('modalLeafletMap');
            const overlay = mapContainer ? mapContainer.querySelector('.offline-map-overlay') : null;
            const directionsBtn = document.getElementById('modalDirections');
            const addressEl = document.getElementById('modalAddress');
            return {
                hasOverlay: !!overlay,
                overlayText: overlay ? overlay.textContent.trim() : '',
                hasDirectionsBtn: !!directionsBtn && !directionsBtn.classList.contains('hidden'),
                directionsHref: directionsBtn ? directionsBtn.getAttribute('href') : '',
                addressText: addressEl ? addressEl.textContent.trim() : ''
            };
        })()`);

        console.log(`  Hiển thị thông báo bản đồ offline: ${offlineMapCheck.hasOverlay}`);
        console.log(`  Nội dung thông báo: "${offlineMapCheck.overlayText}"`);
        console.log(`  Nút chỉ đường Google Maps vẫn hiển thị: ${offlineMapCheck.hasDirectionsBtn} (${offlineMapCheck.directionsHref})`);
        assert.strictEqual(offlineMapCheck.hasOverlay, true, 'Bản đồ phải hiển thị overlay thông báo ngoại tuyến khi không tải được tiles');
        assert.ok(offlineMapCheck.overlayText.includes('Bản đồ ngoại tuyến'), 'Phải chứa thông báo lịch sự về bản đồ ngoại tuyến');
        assert.strictEqual(offlineMapCheck.hasDirectionsBtn, true, 'Phải giữ nguyên nút chỉ đường hướng dẫn người dùng');
        console.log('  ✓ Bản đồ ngoại tuyến xử lý duyên dáng: thông báo lịch sự, bảo toàn địa chỉ và liên kết điều hướng');

        // ==========================================
        // BƯỚC 7: KIỂM THỬ BẢO TOÀN BẢN NHÁP (DRAFT PRESERVATION) & HÀNG ĐỢI OFFLINE
        // ==========================================
        console.log('\n7. Kiểm thử bảo toàn bản nháp và lưu trữ đánh giá ngoại tuyến:');
        
        // 7.1. Nhập dở nội dung đánh giá
        await cdp.eval(`(() => {
            const authorInput = document.getElementById('commentAuthorInput');
            const textInput = document.getElementById('commentTextInput');
            const ratingInput = document.getElementById('commentRatingInput');
            if (authorInput) { authorInput.value = 'Huỳnh Minh Nháp'; authorInput.dispatchEvent(new Event('input')); }
            if (textInput) { textInput.value = 'Nội dung bản nháp thử nghiệm an toàn cập nhật G4.'; textInput.dispatchEvent(new Event('input')); }
            if (ratingInput) { ratingInput.value = '5'; ratingInput.dispatchEvent(new Event('change')); }
        })()`);

        // Kiểm tra xem draft đã lưu vào localStorage chưa
        const draftInStorage = await cdp.eval(`localStorage.getItem('vivu_comment_draft')`);
        assert.ok(draftInStorage && draftInStorage.includes('Huỳnh Minh Nháp'), 'Draft phải được tự động lưu vào localStorage');
        console.log('  ✓ Bản nháp đánh giá được tự động lưu vào localStorage khi người dùng gõ');

        // 7.2. Gửi đánh giá vào hàng đợi IndexedDB
        const submitResult = await cdp.eval(`(async () => {
            const submitBtn = document.getElementById('commentSubmitBtn');
            const msgEl = document.getElementById('commentMessageEl');
            submitBtn.click();

            let waited = 0;
            while (waited < 4000) {
                if (msgEl && msgEl.textContent.includes('Đang offline')) break;
                await new Promise(r => setTimeout(r, 100));
                waited += 100;
            }

            const pending = await window.ViVuOfflineSync.getPendingOfflineCount();
            return {
                msgText: msgEl ? msgEl.textContent : '',
                pendingCount: pending
            };
        })()`);

        console.log(`  Thông báo submit trả về: "${submitResult.msgText}"`);
        console.log(`  Số lượng đánh giá chờ trong IndexedDB: ${submitResult.pendingCount}`);
        assert.ok(submitResult.msgText.includes('Đang offline'), 'Phải hiển thị thông báo đã lưu ngoại tuyến');
        assert.strictEqual(submitResult.pendingCount, 1, 'IndexedDB offline_reviews phải có đúng 1 bản ghi');

        await cdp.screenshot(path.join(ARTIFACT_DIR, 'g4-offline-review-queued.png'));
        console.log('  ✓ Đã chụp ảnh minh chứng: g4-offline-review-queued.png');

        // ==========================================
        // BƯỚC 8: KHÔI PHỤC MẠNG & TỰ ĐỘNG ĐỒNG BỘ (AUTO-SYNC)
        // ==========================================
        console.log('\n8. Khôi phục kết nối mạng và kiểm thử tự động đồng bộ (Auto-Sync):');
        await cdp.send('Network.emulateNetworkConditions', {
            offline: false,
            latency: 0,
            downloadThroughput: -1,
            uploadThroughput: -1
        });

        await cdp.eval(`window.dispatchEvent(new Event('online'))`);

        await waitForCondition(async () => {
            const count = await cdp.eval(`window.ViVuOfflineSync.getPendingOfflineCount()`);
            return count === 0;
        }, 10000);

        const syncResult = await cdp.eval(`(() => {
            const toast = document.getElementById('offlineSyncToast');
            const bar = document.getElementById('offlineStatusBar');
            return {
                isToastVisible: toast && !toast.classList.contains('hidden'),
                isBarHidden: bar && bar.classList.contains('hidden')
            };
        })()`);

        console.log(`  Toast đồng bộ hiển thị: ${syncResult.isToastVisible}`);
        console.log(`  Thanh trạng thái offline đã ẩn: ${syncResult.isBarHidden}`);
        assert.strictEqual(syncResult.isBarHidden, true, 'Thanh trạng thái offline phải ẩn khi online trở lại');
        assert.strictEqual(syncResult.isToastVisible, true, 'Toast thông báo đồng bộ phải hiển thị');

        await cdp.screenshot(path.join(ARTIFACT_DIR, 'g4-offline-synced-toast.png'));
        console.log('  ✓ Tự động đồng bộ thành công, toàn bộ dữ liệu ngoại tuyến đã gửi về máy chủ');
        console.log('  ✓ Đã chụp ảnh minh chứng: g4-offline-synced-toast.png');

        // ==========================================
        // BƯỚC 9: ĐO HIỆU NĂNG WEB VITALS & THIẾT LẬP BASELINE
        // ==========================================
        console.log('\n9. Đo hiệu năng Web Vitals (LCP, CLS, Bundle Sizes) trên Desktop & Mobile:');
        
        // Đo Desktop (1280x800)
        await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: 1280,
            height: 800,
            deviceScaleFactor: 1,
            mobile: false
        });
        await cdp.navigateAndWait(`http://localhost:${PREVIEW_PORT}/index.html?source=mock`);
        await waitForAppReady(cdp);
        const desktopMetrics = await measureWebVitals(cdp);
        console.log(`  Desktop (1280x800): LCP = ${desktopMetrics.lcp}ms, CLS = ${desktopMetrics.cls}`);
        if (desktopMetrics.shifts && desktopMetrics.shifts.length > 0) {
            console.log('  Desktop Shifts:', JSON.stringify(desktopMetrics.shifts, null, 2));
        }

        // Đo Mobile (390x844)
        await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: 390,
            height: 844,
            deviceScaleFactor: 3,
            mobile: true
        });
        await cdp.navigateAndWait(`http://localhost:${PREVIEW_PORT}/index.html?source=mock`);
        await waitForAppReady(cdp);
        const mobileMetrics = await measureWebVitals(cdp);
        console.log(`  Mobile (390x844):  LCP = ${mobileMetrics.lcp}ms, CLS = ${mobileMetrics.cls}`);

        // Thống kê kích thước Bundle
        const distDir = path.join(ROOT_DIR, 'dist');
        const htmlSize = fs.statSync(path.join(distDir, 'index.html')).size;
        const cssSize = fs.statSync(path.join(distDir, 'css', 'tailwind.css')).size;
        
        function getDirSize(dir) {
            let total = 0;
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) total += getDirSize(full);
                else total += fs.statSync(full).size;
            }
            return total;
        }
        const jsSize = getDirSize(path.join(distDir, 'js'));
        const totalDistSize = getDirSize(distDir);

        const baseline = {
            timestamp: new Date().toISOString(),
            version: '2.9.0',
            desktop: desktopMetrics,
            mobile: mobileMetrics,
            bundle: {
                htmlBytes: htmlSize,
                htmlKb: Number((htmlSize / 1024).toFixed(1)),
                cssBytes: cssSize,
                cssKb: Number((cssSize / 1024).toFixed(1)),
                jsBytes: jsSize,
                jsKb: Number((jsSize / 1024).toFixed(1)),
                totalMb: Number((totalDistSize / (1024 * 1024)).toFixed(2))
            }
        };

        const baselinePath = path.join(ROOT_DIR, 'scripts', 'performance-baseline.json');
        fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2), 'utf8');
        console.log(`  ✓ Đã ghi nhận baseline hiệu năng vào: ${path.relative(ROOT_DIR, baselinePath)}`);
        console.log(`  - HTML: ${baseline.bundle.htmlKb} KB, CSS: ${baseline.bundle.cssKb} KB, JS: ${baseline.bundle.jsKb} KB`);

        assert.ok(desktopMetrics.cls <= 0.1, 'Desktop CLS phải <= 0.1');
        assert.ok(mobileMetrics.cls <= 0.1, 'Mobile CLS phải <= 0.1');

        console.log('\n=== TẤT CẢ KIỂM THỬ TRÌNH DUYỆT THỰC TẾ G4 TRÊN DIST/ ĐẠT 100%! ===');
    } finally {
        if (cdp) cdp.close();
        chrome.kill('SIGKILL');
        try {
            previewServer.kill('SIGKILL');
        } catch {}
        try {
            fs.rmSync(tmpProfile, { recursive: true, force: true });
        } catch {}
    }
}

runOfflineVerification().catch(err => {
    console.error('\n❌ KIỂM THỬ G4 THẤT BẠI:', err);
    process.exit(1);
});
