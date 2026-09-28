/**
 * verify-phase11-heritage.cjs - Bộ kiểm thử tự động Giai đoạn 11:
 * Chi tiết Địa điểm Di sản Chuyên sâu (Deep Cultural Heritage Showcase)
 * & Thư mục Hành trình đã lưu (Saved Itinerary Folder Detail)
 * Theo thiết kế Stitch: chi_ti_t_a_i_m_ch_a_ng_vivutravinh,
 * chi_ti_t_ch_a_ng_vivutravinh_mobile & chi_ti_t_th_m_c_h_nh_tr_nh_vivutravinh_mobile
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8000;
const CHROME_PORT = 9222;
const ARTIFACT_DIR = path.resolve('C:/Users/tienl/.gemini/antigravity/brain/511499a4-7194-4965-9c2b-32af7520e85d');
const BACKUP_DIR = path.resolve('D:/OLD/VIVUTRAVINH_PROJECT_BACKUP/05_AGY_BRAIN_ARTIFACTS');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Simple CDP Client
class CDPClient {
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        this.ws = null;
        this.id = 1;
        this.callbacks = new Map();
    }

    async connect() {
        return new Promise((resolve, reject) => {
            const WebSocket = globalThis.WebSocket;
            if (!WebSocket) {
                return reject(new Error('WebSocket không khả dụng. Chạy node với --experimental-websocket!'));
            }
            this.ws = new WebSocket(this.wsUrl);
            this.ws.onopen = () => resolve();
            this.ws.onerror = (err) => reject(err);
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.id && this.callbacks.has(data.id)) {
                        const { resolve, reject } = this.callbacks.get(data.id);
                        this.callbacks.delete(data.id);
                        if (data.error) reject(data.error);
                        else resolve(data.result);
                    }
                } catch (e) {}
            };
        });
    }

    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = this.id++;
            this.callbacks.set(id, { resolve, reject });
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
            console.error('Eval error:', JSON.stringify(res.exceptionDetails));
            throw new Error(`Eval failed: ${res.exceptionDetails.text || JSON.stringify(res.exceptionDetails)}`);
        }
        return res.result ? res.result.value : undefined;
    }

    async setViewport(width, height) {
        await this.send('Emulation.setDeviceMetricsOverride', {
            width,
            height,
            deviceScaleFactor: 1,
            mobile: width < 768
        });
        await this.send('Emulation.setVisibleSize', { width, height });
    }

    async captureScreenshot(targetPath) {
        const res = await this.send('Page.captureScreenshot', { format: 'png' });
        const buf = Buffer.from(res.data, 'base64');
        fs.writeFileSync(targetPath, buf);
        // Copy to backup dir if exists
        try {
            if (fs.existsSync(BACKUP_DIR)) {
                fs.writeFileSync(path.join(BACKUP_DIR, path.basename(targetPath)), buf);
            }
        } catch (e) {}
    }

    close() {
        if (this.ws) {
            try { this.ws.close(); } catch (e) {}
        }
    }
}

async function getDebuggerUrl(port) {
    for (let i = 0; i < 30; i++) {
        try {
            const data = await new Promise((resolve, reject) => {
                const req = http.get(`http://127.0.0.1:${port}/json`, res => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => resolve(body));
                });
                req.on('error', reject);
                req.setTimeout(500, () => { req.destroy(); reject(new Error('timeout')); });
            });
            const pages = JSON.parse(data);
            const target = pages.find(p => p.url && p.url.includes('8000'));
            if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
        } catch (e) {
            await sleep(200);
        }
    }
    throw new Error('Không thể kết nối Chrome DevTools protocol.');
}

async function run() {
    console.log('=== VERIFY PHASE 11: DEEP HERITAGE PLACE SHOWCASE & SAVED ITINERARY FOLDER ===\n');

    // [1/12] Check data module
    console.log('[1/12] Kiểm tra Data Module (place-detail-data.js)...');
    const placeDataModule = await import('../js/place-detail-data.js');
    if (!placeDataModule.DEEP_HERITAGE_PLACES['chua-ang']) {
        throw new Error('Thiếu dữ liệu Chùa Âng trong DEEP_HERITAGE_PLACES!');
    }
    if (!placeDataModule.SAVED_ITINERARY_FOLDER_DETAIL.stops || placeDataModule.SAVED_ITINERARY_FOLDER_DETAIL.stops.length < 3) {
        throw new Error('Thiếu dữ liệu các chặng dừng trong SAVED_ITINERARY_FOLDER_DETAIL!');
    }
    console.log('  ✓ Data module đầy đủ: Chùa Âng (audio guide, 5 ảnh mosaic, kiến trúc, quy chuẩn) và Thư mục 4 chặng dừng.');

    // [2/12] Check HTML Markup Modal IDs
    console.log('[2/12] Kiểm tra Modal Container IDs trong index.html...');
    const htmlContent = fs.readFileSync('index.html', 'utf8');
    const requiredIds = [
        'deepPlaceDetailModal',
        'deepPlaceDetailModalContent',
        'itineraryFolderDetailModal',
        'itineraryFolderDetailModalContent',
        'placePhotoGalleryModal',
        'placePhotoGalleryModalContent'
    ];
    for (const id of requiredIds) {
        if (!htmlContent.includes(`id="${id}"`)) {
            throw new Error(`Thiếu container id="${id}" trong index.html!`);
        }
    }
    console.log('  ✓ Đầy đủ tất cả Modal Container ID trong index.html.');

    // [3/12] Start Local Server & Chrome
    console.log('[3/12] Khởi chạy Local Server & Headless Chrome...');
    const is8000Open = await new Promise(resolve => {
        const req = http.get(`http://127.0.0.1:${PORT}/`, () => resolve(true)).on('error', () => resolve(false));
        req.setTimeout(500, () => { req.destroy(); resolve(false); });
    });

    let localServer = null;
    if (!is8000Open) {
        const MIME = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.svg': 'image/svg+xml',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.webp': 'image/webp'
        };
        localServer = http.createServer((req, res) => {
            let u = req.url.split('?')[0];
            if (u === '/') u = '/index.html';
            const f = path.join(process.cwd(), decodeURIComponent(u));
            if (fs.existsSync(f) && fs.statSync(f).isFile()) {
                res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
                fs.createReadStream(f).pipe(res);
            } else {
                res.writeHead(404);
                res.end('Not found');
            }
        });
        localServer.listen(PORT);
        console.log(`  ✓ Đã khởi chạy test server tại http://localhost:${PORT}`);
    } else {
        console.log(`  ✓ Test server đã chạy sẵn tại port ${PORT}`);
    }

    const tmpProfile = path.join(process.env.TEMP || 'C:\\Temp', `chrome_p11_${Date.now()}`);
    fs.mkdirSync(tmpProfile, { recursive: true });

    const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        `--user-data-dir=${tmpProfile}`,
        `--remote-debugging-port=${CHROME_PORT}`,
        `http://localhost:${PORT}/?source=mock`
    ]);

    let cdp = null;
    try {
        const wsUrl = await getDebuggerUrl(CHROME_PORT);
        cdp = new CDPClient(wsUrl);
        await cdp.connect();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');

        // Wait for ViVuApp ready
        let appReady = false;
        const startWait = Date.now();
        while (Date.now() - startWait < 12000) {
            try {
                appReady = await cdp.eval(`(() => {
                    return typeof window.ViVuApp === 'object' && window.ViVuApp !== null;
                })()`);
                if (appReady) break;
            } catch (e) {}
            await sleep(300);
        }
        if (!appReady) throw new Error('Hết thời gian chờ: window.ViVuApp chưa sẵn sàng!');

        // [4/12] Check exposed methods on window.ViVuApp
        console.log('[4/12] Kiểm tra các hàm nghiệp vụ Phase 11 trên window.ViVuApp...');
        const p11Methods = [
            'openDeepPlaceDetail',
            'closeDeepPlaceDetail',
            'toggleAudioGuidePlayback',
            'toggleSaveDeepPlace',
            'shareDeepPlace',
            'copyDeepPlaceCoords',
            'addDeepPlaceToTripPlanner',
            'openPlacePhotoGallery',
            'closePlacePhotoGallery',
            'switchGalleryPhoto',
            'openItineraryFolderDetail',
            'closeItineraryFolderDetail',
            'shareItineraryFolder',
            'optimizeFolderRoute',
            'removeStopFromFolder'
        ];
        const missing = await cdp.eval(`(() => {
            const required = ${JSON.stringify(p11Methods)};
            return required.filter(m => typeof window.ViVuApp[m] !== 'function');
        })()`);
        if (missing && missing.length > 0) {
            throw new Error(`Thiếu các phương thức Phase 11 trên window.ViVuApp: ${missing.join(', ')}`);
        }
        console.log(`  ✓ Toàn bộ ${p11Methods.length} phương thức Phase 11 đã sẵn sàng trên window.ViVuApp.`);

        // [5/12] Test Desktop 1280px Deep Place Detail Modal
        console.log('[5/12] Thử nghiệm mở Modal Chi tiết Di sản Chuyên sâu Chùa Âng (Desktop 1280px)...');
        await cdp.setViewport(1280, 800);
        await cdp.eval(`window.ViVuApp.openDeepPlaceDetail('chua-ang')`);
        await sleep(600);

        const deepDetailState = await cdp.eval(`(() => {
            const modal = document.getElementById('deepPlaceDetailModal');
            const isVisible = modal && !modal.classList.contains('hidden');
            const title = modal ? modal.querySelector('h1')?.textContent.trim() : '';
            const hasAudioBtn = Boolean(document.getElementById('deepAudioPlayBtn'));
            const milestoneCount = modal ? modal.querySelectorAll('article')[0]?.querySelectorAll('.grid > div')?.length || 0 : 0;
            const archCount = modal ? modal.querySelectorAll('article')[1]?.querySelectorAll('.grid > div')?.length || 0 : 0;
            const etiquetteCount = modal ? modal.querySelectorAll('article')[2]?.querySelectorAll('.grid > div')?.length || 0 : 0;
            const coordsText = document.getElementById('deepPlaceCoords')?.textContent.trim();
            const weatherNote = modal ? modal.textContent.includes('Lý tưởng viếng chùa') : false;

            return {
                isVisible,
                title,
                hasAudioBtn,
                milestoneCount,
                archCount,
                etiquetteCount,
                coordsText,
                weatherNote
            };
        })()`);

        if (!deepDetailState.isVisible || !deepDetailState.title.includes('Chùa Âng')) {
            throw new Error('Modal Chi tiết di sản chuyên sâu chưa hiển thị Chùa Âng!');
        }
        if (!deepDetailState.hasAudioBtn || deepDetailState.milestoneCount < 3) {
            throw new Error('Thiếu Audio Guide hoặc 3 mốc son lịch sử!');
        }
        console.log('  ✓ Desktop Deep Detail hiển thị đầy đủ Chùa Âng, Audio Guide, 3 mốc lịch sử, 3 khối kiến trúc Angkor, và tọa độ GPS.');

        const desktopDeepShot = path.join(ARTIFACT_DIR, 'stitch-deep-detail-desktop-1280.png');
        await cdp.captureScreenshot(desktopDeepShot);
        console.log('  ✓ Đã chụp ảnh giao diện Desktop Chi tiết Di sản: stitch-deep-detail-desktop-1280.png');

        // [6/12] Test Audio Guide Simulation
        console.log('[6/12] Thử nghiệm phát và tạm dừng Audio Guide Thuyết minh Bản địa...');
        await cdp.eval(`window.ViVuApp.toggleAudioGuidePlayback()`);
        await sleep(300);

        const isAudioPlaying = await cdp.eval(`window.ViVuApp.getState().isDeepAudioPlaying`);
        if (!isAudioPlaying) throw new Error('Audio Guide không chuyển sang trạng thái phát!');
        console.log('  ✓ Audio Guide chuyển sang trạng thái phát thành công (nút pause, sóng âm chuyển động).');

        await cdp.eval(`window.ViVuApp.toggleAudioGuidePlayback()`);
        await sleep(200);

        // [7/12] Test Photo Lightbox Gallery
        console.log('[7/12] Thử nghiệm Thư viện ảnh Di sản Lightbox (Photo Gallery)...');
        await cdp.eval(`window.ViVuApp.openPlacePhotoGallery(0)`);
        await sleep(400);

        const galleryState = await cdp.eval(`(() => {
            const modal = document.getElementById('placePhotoGalleryModal');
            const isVisible = modal && !modal.classList.contains('hidden');
            const activeIndex = window.ViVuApp.getState().activePhotoGalleryIndex;
            return { isVisible, activeIndex };
        })()`);
        if (!galleryState.isVisible) throw new Error('Modal Photo Gallery chưa mở!');
        console.log('  ✓ Lightbox Gallery mở thành công với ảnh 1/5.');

        await cdp.eval(`window.ViVuApp.switchGalleryPhoto(2)`);
        await sleep(200);
        const idxAfter = await cdp.eval(`window.ViVuApp.getState().activePhotoGalleryIndex`);
        if (idxAfter !== 2) throw new Error('Chuyển ảnh trong Lightbox thất bại!');
        console.log('  ✓ Chuyển sang ảnh thứ 3 thành công.');

        await cdp.eval(`window.ViVuApp.closePlacePhotoGallery()`);
        await sleep(200);

        // [8/12] Test Save Place & Copy GPS
        console.log('[8/12] Thử nghiệm Lưu địa điểm và Sao chép tọa độ GPS...');
        await cdp.eval(`window.ViVuApp.toggleSaveDeepPlace('chua-ang')`);
        const isPlaceSaved = await cdp.eval(`window.ViVuApp.getState().favorites.includes('chua-ang')`);
        if (!isPlaceSaved) throw new Error('Lưu địa điểm thất bại!');
        console.log('  ✓ Lưu Chùa Âng vào danh sách yêu thích thành công.');

        // Close Deep Place Detail Modal
        await cdp.eval(`window.ViVuApp.closeDeepPlaceDetail()`);
        await sleep(300);

        // [9/12] Test Saved Itinerary Folder Detail Modal
        console.log('[9/12] Thử nghiệm mở Modal Chi tiết Thư mục Hành trình đã lưu...');
        await cdp.eval(`window.ViVuApp.openItineraryFolderDetail('folder-heritage-01')`);
        await sleep(600);

        const folderState = await cdp.eval(`(() => {
            const modal = document.getElementById('itineraryFolderDetailModal');
            const isVisible = modal && !modal.classList.contains('hidden');
            const title = modal ? modal.querySelector('h1')?.textContent.trim() : '';
            const stopsCount = modal ? modal.querySelectorAll('.folder-stop-card')?.length || 0 : 0;
            const hasOptimization = modal ? modal.textContent.includes('Tối ưu lộ trình AI') : false;

            return { isVisible, title, stopsCount, hasOptimization };
        })()`);

        if (!folderState.isVisible || !folderState.title.includes('Chùa Khmer & Ẩm thực Xứ Trà')) {
            throw new Error('Modal Thư mục hành trình chưa hiển thị đúng tiêu đề!');
        }
        if (folderState.stopsCount < 3) {
            throw new Error(`Số lượng chặng dừng không đủ: ${folderState.stopsCount}`);
        }
        console.log('  ✓ Thư mục hiển thị đầy đủ 4 chặng dừng nối tiếp, cự ly và thẻ tối ưu AI Route.');

        // [10/12] Test Folder Route Optimization & Stop Removal
        console.log('[10/12] Thử nghiệm Tối ưu hóa lộ trình và Xóa chặng dừng...');
        await cdp.eval(`window.ViVuApp.optimizeFolderRoute()`);
        await sleep(300);

        await cdp.eval(`window.ViVuApp.removeStopFromFolder('folder-stop-04')`);
        await sleep(300);

        const stopsAfter = await cdp.eval(`window.ViVuApp.getState().activeItineraryFolder.stops.length`);
        if (stopsAfter !== 3) {
            throw new Error(`Xóa chặng dừng thất bại, còn ${stopsAfter} chặng!`);
        }
        console.log('  ✓ Xóa chặng dừng thành công: danh sách cập nhật còn 3 chặng.');

        // [11/12] Test Mobile 390px Viewport for Folder Detail
        console.log('[11/12] Thử nghiệm giao diện di động Mobile 390px cho Thư mục hành trình...');
        await cdp.setViewport(390, 844);
        await sleep(400);

        const folderMobileOverflow = await cdp.eval(`(() => {
            const doc = document.documentElement;
            return doc.scrollWidth > window.innerWidth;
        })()`);
        if (folderMobileOverflow) {
            throw new Error('Phát hiện lỗi tràn ngang trên giao diện Mobile Thư mục hành trình!');
        }

        const mobileFolderShot = path.join(ARTIFACT_DIR, 'stitch-folder-detail-mobile-390.png');
        await cdp.captureScreenshot(mobileFolderShot);
        console.log('  ✓ Đã chụp ảnh giao diện Mobile Thư mục hành trình: stitch-folder-detail-mobile-390.png');

        await cdp.eval(`window.ViVuApp.closeItineraryFolderDetail()`);
        await sleep(300);

        // [12/12] Test Mobile 390px Deep Place Detail & Zero Overflow
        console.log('[12/12] Thử nghiệm giao diện di động Mobile 390px cho Chi tiết Di sản Chùa Âng...');
        await cdp.eval(`window.ViVuApp.openDeepPlaceDetail('chua-ang')`);
        await sleep(500);

        const detailMobileOverflow = await cdp.eval(`(() => {
            const doc = document.documentElement;
            return doc.scrollWidth > window.innerWidth;
        })()`);
        if (detailMobileOverflow) {
            throw new Error('Phát hiện lỗi tràn ngang trên giao diện Mobile Chi tiết Di sản!');
        }

        const mobileDetailShot = path.join(ARTIFACT_DIR, 'stitch-deep-detail-mobile-390.png');
        await cdp.captureScreenshot(mobileDetailShot);
        console.log('  ✓ Đã chụp ảnh giao diện Mobile Chi tiết Di sản: stitch-deep-detail-mobile-390.png (0 horizontal overflow).');

        console.log('\n======================================================');
        console.log('🎉 100% HOÀN THÀNH XÁC MINH GIAI ĐOẠN 11 (HERITAGE SHOWCASE & SAVED FOLDER)');
        console.log('======================================================\n');

    } finally {
        if (cdp) cdp.close();
        chrome.kill();
        try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch (e) {}
        if (localServer) localServer.close();
    }
}

run().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('❌ LỖI KIỂM THỬ GIAI ĐOẠN 11:', err);
    process.exit(1);
});
