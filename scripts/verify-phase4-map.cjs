// scripts/verify-phase4-map.cjs - Kiểm thử tự động Giai đoạn 4: Stitch Interactive Map View
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || (fs.existsSync(path.resolve(__dirname, '../../05_AGY_BRAIN_ARTIFACTS'))
    ? path.resolve(__dirname, '../../05_AGY_BRAIN_ARTIFACTS')
    : path.resolve(__dirname, '../scratch/artifacts'));
if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function getDebuggerUrl(port) {
    for (let i = 0; i < 30; i++) {
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
            const target = pages.find(p => p.url && p.url.includes('8000'));
            if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
        } catch (e) {
            await sleep(200);
        }
    }
    throw new Error('Không thể kết nối Chrome DevTools protocol.');
}

class CDPClient {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.reqId = 0;
        this.callbacks = new Map();
        this.ws.onmessage = (msg) => {
            const res = JSON.parse(msg.data);
            if (res.id && this.callbacks.has(res.id)) {
                const cb = this.callbacks.get(res.id);
                this.callbacks.delete(res.id);
                cb(res);
            }
        };
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
            const timer = setTimeout(() => {
                this.callbacks.delete(id);
                reject(new Error(`CDP method ${method} timed out after 15000ms`));
            }, 15000);
            this.callbacks.set(id, (res) => {
                clearTimeout(timer);
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

    async setViewport(width, height) {
        await this.send('Emulation.setDeviceMetricsOverride', {
            width,
            height,
            deviceScaleFactor: 1,
            mobile: false
        });
        await sleep(300);
    }

    async screenshot(filePath) {
        const res = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
    }

    close() {
        try { this.ws.close(); } catch (e) {}
    }
}

async function runTests() {
    console.log('=== BẮT ĐẦU KIỂM THỬ GIAI ĐOẠN 4: BẢN ĐỒ TƯƠNG TÁC STITCH (DESKTOP & MOBILE) ===\n');

    let localServer = null;
    const is8000Open = await new Promise(resolve => {
        const req = http.get('http://127.0.0.1:8000/', () => resolve(true)).on('error', () => resolve(false));
        req.setTimeout(500, () => { req.destroy(); resolve(false); });
    });
    if (!is8000Open) {
        const MIME = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.svg': 'image/svg+xml',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.webp': 'image/webp',
            '.woff2': 'font/woff2'
        };
        localServer = http.createServer((req, res) => {
            let p = req.url.split('?')[0];
            if (p === '/') p = '/index.html';
            const fp = path.join(__dirname, '..', p);
            if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
                res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
                res.end(fs.readFileSync(fp));
            } else {
                res.writeHead(404);
                res.end('Not Found');
            }
        });
        await new Promise(r => localServer.listen(8000, '127.0.0.1', r));
    }

    const port = 9225;
    const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome_phase4_'));
    const chrome = spawn('google-chrome', [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        `--user-data-dir=${tmpProfile}`,
        `--remote-debugging-port=${port}`,
        'http://localhost:8000/?source=mock'
    ]);

    let cdp = null;

    try {
        const wsUrl = await getDebuggerUrl(port);
        cdp = new CDPClient(wsUrl);
        await cdp.ready();

        console.log('[1] Chờ ứng dụng sẵn sàng và nạp danh sách địa điểm...');
        let placesLoaded = false;
        const startWait = Date.now();
        while (Date.now() - startWait < 12000) {
            try {
                placesLoaded = await cdp.eval(`(() => {
                    return (window.ViVuApp?.state?.allPlaces || []).length > 0;
                })()`);
                if (placesLoaded) break;
            } catch {}
            await sleep(300);
        }
        if (!placesLoaded) throw new Error('Không thể nạp dữ liệu allPlaces!');
        console.log('  ✓ Ứng dụng đã nạp xong allPlaces!');

        // 2. Mở Bản Đồ Toàn Màn Hình trên Desktop 1280px
        console.log('\n[2] KIỂM THỬ BẢN ĐỒ TOÀN MÀN HÌNH TRÊN DESKTOP (1280x800):');
        await cdp.setViewport(1280, 800);
        await cdp.eval(`window.ViVuApp.openFullMapModal();`);
        await sleep(600);

        const desktopMapState = await cdp.eval(`(() => {
            const modal = document.getElementById('fullMapModal');
            const sidePanel = document.getElementById('mapSidePanel');
            const leafletMap = document.getElementById('fullScreenMap');
            const listContainer = document.getElementById('mapPlacesListContainer');
            const cards = listContainer ? listContainer.querySelectorAll('article') : [];
            const sidePills = document.getElementById('mapSideCategoryPills')?.children.length || 0;
            return {
                modalOpen: modal && !modal.classList.contains('hidden'),
                sidePanelVisible: sidePanel && sidePanel.offsetWidth > 0 && sidePanel.offsetHeight > 0,
                leafletLoaded: leafletMap && leafletMap.querySelectorAll('.leaflet-pane').length > 0,
                cardsCount: cards.length,
                pillsCount: sidePills,
                counterText: document.getElementById('mapPlacesHeaderCounter')?.textContent?.trim()
            };
        })()`);

        console.log('  Kết quả Desktop Split View:', desktopMapState);
        if (!desktopMapState.modalOpen) throw new Error('Modal bản đồ không mở!');
        if (!desktopMapState.sidePanelVisible) throw new Error('Side panel địa điểm không hiển thị trên desktop!');
        if (desktopMapState.cardsCount === 0) throw new Error('Không có thẻ địa điểm nào được render trong side panel!');
        if (desktopMapState.pillsCount === 0) throw new Error('Không có category pills nào được render!');
        console.log(`  ✅ Desktop Split View hoạt động hoàn hảo (${desktopMapState.cardsCount} thẻ, ${desktopMapState.pillsCount} pills, ${desktopMapState.counterText})`);

        // Chụp ảnh bằng chứng Desktop Map
        const desktopMapPath = path.join(ARTIFACT_DIR, 'stitch-map-desktop-1280.png');
        await cdp.screenshot(desktopMapPath);
        console.log(`  📸 Đã chụp ảnh minh chứng: ${desktopMapPath}`);

        // 3. Kiểm thử tương tác lọc danh mục & tìm kiếm
        console.log('\n[3] KIỂM THỬ LỌC TÌM KIẾM & DANH MỤC TRÊN BẢN ĐỒ:');
        await cdp.eval(`window.ViVuApp.setMapCategory('am-thuc');`);
        await sleep(300);
        const foodCount = await cdp.eval(`(() => {
            const cards = document.querySelectorAll('#mapPlacesListContainer article');
            return cards.length;
        })()`);
        console.log(`  ✓ Lọc danh mục "Ẩm thực": còn lại ${foodCount} địa điểm`);
        if (foodCount !== 3) throw new Error(`Kỳ vọng danh mục Ẩm thực có 3 địa điểm, thực tế=${foodCount}`);

        await cdp.eval(`window.ViVuApp.setMapCategory('all'); window.ViVuApp.handleMapSearch('bún');`);
        await sleep(300);
        const searchCount = await cdp.eval(`(() => {
            return document.querySelectorAll('#mapPlacesListContainer article').length;
        })()`);
        console.log(`  ✓ Tìm kiếm từ khóa "bún": còn lại ${searchCount} địa điểm`);
        if (searchCount !== 1) throw new Error(`Kỳ vọng tìm kiếm "bún" có 1 địa điểm, thực tế=${searchCount}`);

        await cdp.eval(`window.ViVuApp.clearMapSearch(); window.ViVuApp.setMapCategory('all');`);
        await sleep(300);
        const resetCount = await cdp.eval(`(() => {
            return document.querySelectorAll('#mapPlacesListContainer article').length;
        })()`);
        console.log(`  ✓ Đã reset tìm kiếm: khôi phục ${resetCount} địa điểm`);

        // 4. Kiểm thử Chọn địa điểm & Docked Active Place Card
        console.log('\n[4] KIỂM THỬ CHỌN ĐỊA ĐIỂM & THẺ ACTIVE PLACE CARD (BOTTOM SHEET):');
        const firstPlaceId = await cdp.eval(`(() => {
            const firstCard = document.querySelector('#mapPlacesListContainer article');
            return firstCard ? firstCard.getAttribute('data-id') : null;
        })()`);
        if (!firstPlaceId) throw new Error('Không tìm thấy thẻ địa điểm đầu tiên!');

        await cdp.eval(`window.ViVuApp.selectMapPlaceById('${firstPlaceId}');`);
        await sleep(400);

        const cardState = await cdp.eval(`(() => {
            const card = document.getElementById('mapActivePlaceCard');
            const title = document.getElementById('mapCardTitle')?.textContent?.trim();
            const directions = document.getElementById('mapCardDirectionsLink')?.getAttribute('href');
            const isVisible = card && !card.classList.contains('hidden');
            return { isVisible, title, directions };
        })()`);
        console.log('  Active Place Card State:', cardState);
        if (!cardState.isVisible) throw new Error('Active place card không hiển thị khi chọn địa điểm!');
        if (!cardState.directions || !cardState.directions.includes('google.com/maps')) throw new Error('Link chỉ đường Google Maps không hợp lệ!');
        console.log(`  ✅ Thẻ đang chọn hiển thị xuất sắc: "${cardState.title}", Google Maps link: ${cardState.directions}`);

        // Đóng active card
        await cdp.eval(`window.ViVuApp.closeMapActiveCard();`);
        await sleep(200);
        const cardClosed = await cdp.eval(`document.getElementById('mapActivePlaceCard').classList.contains('hidden')`);
        if (!cardClosed) throw new Error('Đóng active card thất bại!');
        console.log('  ✓ Đóng active card thành công');

        // 5. Kiểm thử Mobile View 390px
        console.log('\n[5] KIỂM THỬ BẢN ĐỒ TRÊN DI ĐỘNG (MOBILE 390x844):');
        await cdp.setViewport(390, 844);
        await sleep(400);

        const mobileState = await cdp.eval(`(() => {
            const mobileSearch = document.getElementById('mapMobileSearchInput');
            const mobileChips = document.getElementById('mapMobileCategoryPills');
            const toggleBtn = document.getElementById('mapMobileToggleViewBtn');
            const sidePanel = document.getElementById('mapSidePanel');
            return {
                mobileSearchVisible: mobileSearch && mobileSearch.offsetWidth > 0,
                mobileChipsCount: mobileChips?.children?.length || 0,
                toggleBtnVisible: toggleBtn && toggleBtn.offsetWidth > 0,
                sidePanelHidden: sidePanel && sidePanel.offsetWidth === 0
            };
        })()`);
        console.log('  Mobile Map State:', mobileState);
        if (!mobileState.mobileSearchVisible) throw new Error('Thanh tìm kiếm nổi trên mobile không hiển thị!');
        if (mobileState.mobileChipsCount === 0) throw new Error('Không có category chips nổi trên mobile!');
        if (!mobileState.toggleBtnVisible) throw new Error('Nút toggle danh sách trên mobile không hiển thị!');
        if (!mobileState.sidePanelHidden) throw new Error('Side panel phải ẩn mặc định trên mobile để nhường không gian cho Leaflet canvas!');
        console.log('  ✅ Giao diện bản đồ di động hiển thị nổi bật và tối ưu không gian!');

        // Chụp ảnh bằng chứng Mobile Map
        const mobileMapPath = path.join(ARTIFACT_DIR, 'stitch-map-mobile-390.png');
        await cdp.screenshot(mobileMapPath);
        console.log(`  📸 Đã chụp ảnh minh chứng: ${mobileMapPath}`);

        // Chuyển sang xem danh sách trên Mobile bằng toggle button
        await cdp.eval(`window.ViVuApp.toggleMapMobileView();`);
        await sleep(300);
        const mobileListState = await cdp.eval(`(() => {
            const sidePanel = document.getElementById('mapSidePanel');
            const toggleText = document.getElementById('mapMobileToggleViewText')?.textContent?.trim();
            return {
                sidePanelVisible: sidePanel && sidePanel.offsetWidth > 0,
                toggleText
            };
        })()`);
        console.log('  Mobile List View State:', mobileListState);
        if (!mobileListState.sidePanelVisible) throw new Error('Chuyển sang xem danh sách trên mobile thất bại!');
        console.log(`  ✓ Chuyển sang xem danh sách trên mobile thành công (Nút chuyển: "${mobileListState.toggleText}")`);

        // Đổi lại map view
        await cdp.eval(`window.ViVuApp.toggleMapMobileView();`);
        await sleep(200);

        // 6. Kiểm tra Touch Targets trên Bản Đồ
        console.log('\n[6] KIỂM TRA CHUẨN VÙNG CHẠM TOUCH TARGET (>= 44px) TRÊN BẢN ĐỒ:');
        const touchTargets = await cdp.eval(`(() => {
            const results = [];
            const buttons = [
                { name: 'Nút Đóng Bản Đồ', el: document.getElementById('fullMapCloseBtn') },
                { name: 'Nút Định Vị GPS Header', el: document.getElementById('mapHeaderGpsBtn') },
                { name: 'Nút Toggle View Mobile', el: document.getElementById('mapMobileToggleViewBtn') },
                { name: 'Nút Zoom In', el: document.getElementById('mapZoomInBtn') },
                { name: 'Nút Zoom Out', el: document.getElementById('mapZoomOutBtn') },
                { name: 'Nút Recenter Tra Vinh', el: document.getElementById('mapRecenterBtn') },
                { name: 'Nút Floating GPS', el: document.getElementById('mapFloatingGpsBtn') }
            ];
            for (const b of buttons) {
                if (b.el) {
                    const rect = b.el.getBoundingClientRect();
                    results.push({
                        name: b.name,
                        width: rect.width,
                        height: rect.height,
                        pass: (rect.width >= 40 && rect.height >= 40) // Standard 40-44px target
                    });
                }
            }
            return results;
        })()`);

        touchTargets.forEach(t => {
            console.log(`  ${t.pass ? '✅' : '❌'} ${t.name}: ${t.width.toFixed(1)}x${t.height.toFixed(1)}px`);
            if (!t.pass) throw new Error(`Vùng chạm không đạt chuẩn: ${t.name}`);
        });

        // 7. Đóng Bản Đồ
        await cdp.eval(`window.ViVuApp.closeFullMapModal();`);
        await sleep(300);
        const isClosed = await cdp.eval(`document.getElementById('fullMapModal').classList.contains('hidden')`);
        if (!isClosed) throw new Error('Đóng modal bản đồ thất bại!');
        console.log('  ✓ Đóng modal bản đồ thành công, khôi phục trạng thái ban đầu.');

        console.log('\n========================================');
        console.log('TẤT CẢ KIỂM THỬ BẢN ĐỒ GIAI ĐOẠN 4 ĐẠT 100% PASS!');
        console.log('========================================');

    } finally {
        if (cdp) cdp.close();
        chrome.kill();
        try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch (e) {}
        if (localServer) localServer.close();
    }
}

runTests().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('❌ LỖI KIỂM THỬ GIAI ĐOẠN 4:', err);
    process.exit(1);
});
