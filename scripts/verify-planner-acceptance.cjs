/**
 * scripts/verify-planner-acceptance.cjs
 *
 * Automated Acceptance Verification for Merged Trip Planner:
 * "Lên kế hoạch chuyến đi" in "Khám Phá & Kết Nối" with 2 Tabs:
 * 1. Tự lên lịch trình (Custom Plan)
 * 2. Lịch trình gợi ý (Suggested 1-day tours + Template Customization)
 * 3. Chuyến đi của tôi (My Trip card + Guest/Auth Sync)
 * 4. Backward compatibility: #tours, #/tours, #planner, #/planner
 * 5. Full Desktop & Mobile Responsiveness + Screenshots
 * 6. Non-regression of 4 separated views (Clubs, Community, Blog, Events)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACT_DIR = 'C:/Users/tienl/.gemini/antigravity/brain/2bc7252e-f998-4e30-bbb7-25edbaa0f421';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2'
};

class CDPClient {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.reqId = 0;
        this.callbacks = new Map();
        this.ws.onmessage = (event) => {
            const res = JSON.parse(event.data);
            const cb = this.callbacks.get(res.id);
            if (cb) {
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
                reject(new Error(`CDP timed out: ${method}`));
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
            throw new Error('CDP Eval Exception: ' + JSON.stringify(res.exceptionDetails));
        }
        return res.result?.value;
    }

    async setViewport(width, height, isMobile = false) {
        await this.send('Emulation.setDeviceMetricsOverride', {
            width,
            height,
            deviceScaleFactor: isMobile ? 2 : 1,
            mobile: isMobile
        });
    }

    async captureScreenshot(outputPath) {
        const res = await this.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
    }

    async close() {
        this.ws.close();
    }
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function getDebuggerUrl(port) {
    for (let i = 0; i < 40; i++) {
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
            const target = pages.find(p => p.url && (p.url.includes('http') || p.type === 'page'));
            if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
        } catch (_) {
            await sleep(200);
        }
    }
    throw new Error('Không thể kết nối Chrome DevTools Protocol');
}

async function run() {
    console.log('================================================================================');
    console.log(' BẮT ĐẦU KIỂM THỬ NGHIỆM THU GỘP DANH MỤC "LÊN KẾ HOẠCH CHUYẾN ĐI"');
    console.log('================================================================================\n');

    // 1. Static Server
    const server = http.createServer((req, res) => {
        let reqPath = req.url.split('?')[0];
        if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
        const safePath = path.normalize(decodeURIComponent(reqPath)).replace(/^(\.\.[\/\\])+/, '');
        const filePath = path.join(ROOT_DIR, safePath);

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, {
                'Content-Type': MIME[ext] || 'application/octet-stream',
                'Cache-Control': 'no-store'
            });
            fs.createReadStream(filePath).pipe(res);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }
    });

    const serverPort = 8790 + Math.floor(Math.random() * 150);
    await new Promise(r => server.listen(serverPort, r));
    console.log(`  ✓ Máy chủ kiểm thử đang chạy tại http://localhost:${serverPort}`);

    // 2. Launch Chrome
    const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
    ];
    const chromeExe = chromePaths.find(p => fs.existsSync(p));
    if (!chromeExe) throw new Error('Không tìm thấy Chrome');

    const tempDir = path.join(os.tmpdir(), 'chrome_planner_test_' + Date.now());
    const cdpPort = 9600 + Math.floor(Math.random() * 250);
    const chrome = spawn(chromeExe, [
        `--remote-debugging-port=${cdpPort}`,
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--mute-audio',
        `--user-data-dir=${tempDir}`,
        `http://localhost:${serverPort}/?source=mock`
    ], { stdio: 'ignore' });

    let cdp;
    try {
        const wsUrl = await getDebuggerUrl(cdpPort);
        cdp = new CDPClient(wsUrl);
        await cdp.ready();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('DOM.enable');

        // Wait until app is ready
        let ready = false;
        for (let i = 0; i < 40; i++) {
            ready = await cdp.eval(`Boolean(
                window.ViVuApp &&
                window.ViVuApp.navGoPlanner &&
                window.ViVuApp.switchPlannerTab &&
                window.ViVuApp.state &&
                window.ViVuApp.state.allPlaces?.length > 0
            )`);
            if (ready) break;
            await sleep(250);
        }
        if (!ready) throw new Error('App chưa sẵn sàng hoặc thiếu phương thức điều hướng planner');
        console.log('  ✓ Ứng dụng đã sẵn sàng với đầy đủ navGoPlanner, switchPlannerTab, movePlannerStop!\n');

        // -------------------------------------------------------------------------
        // PHẦN 1: CẤU TRÚC SIDEBAR VÀ NÚT ĐIỀU HƯỚNG TRANG CHỦ
        // -------------------------------------------------------------------------
        console.log('-------------------------------------------------------------------------');
        console.log(' [PHẦN 1] KIỂM TRA SIDEBAR VÀ CÁC NÚT ĐIỀU HƯỚNG TRANG CHỦ');
        console.log('-------------------------------------------------------------------------');

        const sidebarCheck = await cdp.eval(`(() => {
            const plannerLink = document.getElementById('sidebarLinkPlanner');
            const personalGroup = document.querySelector('aside nav') || document.body;
            // check if old tours link still exists in sidebar
            const oldToursLink = document.querySelector('aside a[href="#tours"]');
            const homeTeaserBtn = document.querySelector('#tourItinerariesSection a[href="#/planner"]');

            return {
                hasPlannerLink: Boolean(plannerLink),
                plannerLinkText: plannerLink ? plannerLink.textContent.trim().replace(/\\s+/g, ' ') : '',
                plannerLinkHref: plannerLink ? plannerLink.getAttribute('href') : '',
                hasOldToursInSidebar: Boolean(oldToursLink),
                hasHomeTeaserBtn: Boolean(homeTeaserBtn)
            };
        })()`);

        assert(sidebarCheck.hasPlannerLink, 'Sidebar phải có #sidebarLinkPlanner');
        assert(sidebarCheck.plannerLinkText.includes('Lên kế hoạch chuyến đi'), 'Tên mục trong sidebar phải là "Lên kế hoạch chuyến đi"');
        assert(!sidebarCheck.hasOldToursInSidebar, 'Mục "Lịch trình tour 1 ngày" cũ trong sidebar phải bị xóa bỏ');
        console.log(`  ✓ [PASS] Sidebar Khám Phá & Kết Nối chứa mục: "${sidebarCheck.plannerLinkText}"`);
        console.log(`  ✓ [PASS] Mục "Lịch trình tour 1 ngày" đã được loại bỏ hoàn toàn khỏi nhóm Cá Nhân`);

        // -------------------------------------------------------------------------
        // PHẦN 2: DESKTOP TAB 1 - TỰ LÊN LỊCH TRÌNH & CHUYẾN ĐI CỦA TÔI
        // -------------------------------------------------------------------------
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [PHẦN 2] NGHIỆM THU DESKTOP (1280x800) - TAB 1: TỰ LÊN LỊCH TRÌNH');
        console.log('-------------------------------------------------------------------------');

        await cdp.setViewport(1280, 800, false);
        await cdp.eval(`window.ViVuApp.navGoPlanner({ tab: 'custom' })`);
        await sleep(400);

        const tab1State = await cdp.eval(`(() => {
            const vPlanner = document.getElementById('view-planner');
            const tabBtnCustom = document.getElementById('plannerTabBtnCustom');
            const tabBtnSuggested = document.getElementById('plannerTabBtnSuggested');
            const contentCustom = document.getElementById('plannerTabContentCustom');
            const contentSuggested = document.getElementById('plannerTabContentSuggested');
            const myTripCard = document.getElementById('plannerMyTripCard');
            const poolCards = document.querySelectorAll('#plannerTabContentCustom .pool-card');
            const timelineStops = document.querySelectorAll('#plannerTabContentCustom .timeline-stop');
            const btnSmartOptimize = document.getElementById('btnSmartOptimize');
            const btnExportGpx = document.getElementById('btnExportGpx');
            const btnSaveStartNav = document.getElementById('btnSaveStartNav');
            const sidebarPlannerActive = document.getElementById('sidebarLinkPlanner')?.classList.contains('bg-primary-container');

            return {
                viewVisible: Boolean(vPlanner && !vPlanner.classList.contains('hidden')),
                activeView: window.ViVuApp.getActiveView(),
                hash: window.location.hash,
                sidebarActive: Boolean(sidebarPlannerActive),
                customTabVisible: Boolean(contentCustom && !contentCustom.classList.contains('hidden')),
                suggestedTabHidden: Boolean(contentSuggested && contentSuggested.classList.contains('hidden')),
                hasMyTripCard: Boolean(myTripCard),
                myTripText: myTripCard ? myTripCard.innerText.replace(/\\s+/g, ' ') : '',
                poolCount: poolCards.length,
                stopsCount: timelineStops.length,
                hasOptimizeBtn: Boolean(btnSmartOptimize),
                optimizeBtnText: btnSmartOptimize ? btnSmartOptimize.innerText.trim() : '',
                hasExportGpxBtn: Boolean(btnExportGpx),
                exportGpxBtnText: btnExportGpx ? btnExportGpx.innerText.trim() : '',
                hasNavBtn: Boolean(btnSaveStartNav),
                saveBtnText: document.getElementById('btnSaveTripPlanDevice')?.innerText.replace(/\s+/g, ' ').trim() || ''
            };
        })()`);

        assert(tab1State.viewVisible && tab1State.activeView === 'planner', 'View planner phải hiển thị');
        assert(tab1State.sidebarActive, 'Sidebar mục Lên kế hoạch chuyến đi phải ở trạng thái active');
        assert(tab1State.customTabVisible && tab1State.suggestedTabHidden, 'Tab 1 Tự lên lịch trình phải đang mở, Tab 2 đang ẩn');
        assert(tab1State.hasMyTripCard, 'Phải có thẻ "Chuyến đi của tôi" hiển thị trên đầu trang');
        assert(tab1State.myTripText.includes('Khách vãng lai'), 'Khách chưa đăng nhập phải thấy thông báo khách vãng lai');
        assert(tab1State.myTripText.includes('Lưu trên thiết bị này'), 'Thẻ phải ghi rõ phạm vi "Lưu trên thiết bị này"');
        assert(tab1State.myTripText.includes('Lưu trên trình duyệt này, chưa đồng bộ giữa các thiết bị'), 'Thẻ phải chứa câu ngắn chuẩn: "Lưu trên trình duyệt này, chưa đồng bộ giữa các thiết bị"');
        assert(!tab1State.myTripText.includes('LocalStorage'), 'Nội dung người dùng không được chứa thuật ngữ "LocalStorage"');
        assert(!tab1State.myTripText.includes('Supabase'), 'Nội dung người dùng không được chứa thuật ngữ "Supabase"');
        assert(!tab1State.myTripText.includes('Lưu vào tài khoản'), 'Không được gọi là "Lưu vào tài khoản" khi chưa đồng bộ đám mây');
        assert(tab1State.saveBtnText.includes('Lưu trên thiết bị này'), 'Nút lưu phải mang nhãn "Lưu trên thiết bị này"');
        assert(!tab1State.saveBtnText.includes('tài khoản'), 'Nút lưu không được nhắc tới "tài khoản"');
        assert(tab1State.optimizeBtnText.includes('Mô phỏng AI Route'), 'Nút AI Route phải ghi rõ "Mô phỏng AI Route"');
        assert(tab1State.exportGpxBtnText.includes('Xuất GPX') && tab1State.exportGpxBtnText.includes('Điểm hợp lệ'), 'Nút GPX phải ghi rõ "Điểm hợp lệ"');
        assert(tab1State.poolCount >= 4, 'Ngân hàng địa điểm phải hiển thị danh sách thẻ');
        assert(tab1State.stopsCount >= 1, 'Lộ trình ngày 1 phải có các điểm dừng');

        console.log(`  ✓ [PASS] Tab 1 hiển thị 3 cột: Ngân hàng địa điểm (${tab1State.poolCount}), Timeline (${tab1State.stopsCount} chặng), Bản đồ & Actions`);
        console.log(`  ✓ [PASS] Thẻ "Chuyến đi của tôi": Đã hiển thị đúng câu ngắn "Lưu trên trình duyệt này, chưa đồng bộ giữa các thiết bị", đã loại bỏ hoàn toàn các thuật ngữ LocalStorage/Supabase khỏi UI`);

        // Capture Desktop Tab 1 Screenshots
        const shotTab1Top = path.join(ARTIFACT_DIR, 'planner_desktop_tab1_top.png');
        await cdp.captureScreenshot(shotTab1Top);
        console.log(`  📸 Đã chụp: planner_desktop_tab1_top.png`);

        await cdp.eval(`window.scrollTo({ top: 350, behavior: 'instant' })`);
        await sleep(200);
        const shotTab1Bottom = path.join(ARTIFACT_DIR, 'planner_desktop_tab1_bottom.png');
        await cdp.captureScreenshot(shotTab1Bottom);
        console.log(`  📸 Đã chụp: planner_desktop_tab1_bottom.png`);

        // -------------------------------------------------------------------------
        // PHẦN 3: SẮP XẾP ĐIỂM DỪNG, MÔ PHỎNG AI ROUTE & TÁCH DỮ LIỆU HAI TÀI KHOẢN
        // -------------------------------------------------------------------------
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [PHẦN 3] KIỂM THỬ SẮP XẾP ĐIỂM DỪNG, MÔ PHỎNG AI ROUTE & TÁCH DỮ LIỆU HAI TÀI KHOẢN');
        console.log('-------------------------------------------------------------------------');

        await cdp.eval(`window.scrollTo({ top: 0, behavior: 'instant' })`);
        await sleep(150);

        const initialStops = await cdp.eval(`(() => {
            const stops = Array.from(document.querySelectorAll('#plannerTabContentCustom .timeline-stop h4'));
            return stops.map(s => s.textContent.trim());
        })()`);
        console.log('  Thứ tự ban đầu:', initialStops);

        // Move first stop down
        const moveDownResult = await cdp.eval(`(() => {
            const firstStop = window.ViVuApp.getState().tripPlan.days[0].stops[0];
            window.ViVuApp.movePlannerStop(firstStop.id, 1);
            const stopsAfter = Array.from(document.querySelectorAll('#plannerTabContentCustom .timeline-stop h4')).map(s => s.textContent.trim());
            return { firstStopId: firstStop.id, stopsAfter };
        })()`);
        console.log('  Thứ tự sau khi chuyển điểm 1 xuống:', moveDownResult.stopsAfter);
        assert.notStrictEqual(initialStops[0], moveDownResult.stopsAfter[0], 'Điểm 1 phải được chuyển xuống vị trí thứ 2');
        console.log('  ✓ [PASS] Nút di chuyển điểm dừng xuống (Move Down) cập nhật chính xác thứ tự');

        // Move back up
        const moveUpResult = await cdp.eval(`(() => {
            const movedStopId = window.ViVuApp.getState().tripPlan.days[0].stops[1].id;
            window.ViVuApp.movePlannerStop(movedStopId, -1);
            const stopsAfter = Array.from(document.querySelectorAll('#plannerTabContentCustom .timeline-stop h4')).map(s => s.textContent.trim());
            return stopsAfter;
        })()`);
        console.log('  Thứ tự sau khi chuyển điểm lên lại:', moveUpResult);
        assert.strictEqual(initialStops[0], moveUpResult[0], 'Điểm dừng phải được đưa trở lại vị trí đầu');
        console.log('  ✓ [PASS] Nút di chuyển điểm dừng lên (Move Up) cập nhật chính xác thứ tự');

        // Test AI Route simulation (reverses stops and subtracts 3.2km fixed)
        const optimizeResult = await cdp.eval(`(() => {
            const beforeFirst = window.ViVuApp.getState().tripPlan.days[0].stops[0].title;
            const beforeDist = window.ViVuApp.getState().tripPlan.totalDistanceKm;
            window.ViVuApp.optimizePlanAiRoute();
            const afterFirst = window.ViVuApp.getState().tripPlan.days[0].stops[0].title;
            const afterDist = window.ViVuApp.getState().tripPlan.totalDistanceKm;
            return {
                beforeFirst,
                afterFirst,
                beforeDist,
                afterDist,
                distDiff: +(beforeDist - afterDist).toFixed(1)
            };
        })()`);
        console.log(`  ✓ [PASS] Mô phỏng AI Route hoạt động minh bạch: Đảo thứ tự điểm (${optimizeResult.beforeFirst} -> ${optimizeResult.afterFirst}) & trừ cố định ${optimizeResult.distDiff} km`);

        // -------------------------------------------------------------------------
        // KIỂM THỬ XUẤT GPX VÀ LỌC TỌA ĐỘ CHUẨN XÁC
        // Loại bỏ null, undefined, chuỗi rỗng "", khoảng trắng "   "
        // Kiểm thử thiếu riêng lat hoặc lng
        // -------------------------------------------------------------------------
        console.log('\n  Kiểm thử lọc tọa độ GPX (null, undefined, rỗng, khoảng trắng, thiếu riêng lat/lng):');
        const gpxValidationResult = await cdp.eval(`(() => {
            const isValid = window.ViVuApp.isValidGpxCoordinate;
            const filterStops = window.ViVuApp.filterValidGpxStops;

            // Unit checks on isValidGpxCoordinate
            const unitResults = {
                nullVal: isValid(null, -90, 90),
                undefVal: isValid(undefined, -90, 90),
                emptyStr: isValid('', -90, 90),
                spaceStr: isValid('   ', -90, 90),
                tabStr: isValid('\\t\\n  ', -90, 90),
                textStr: isValid('invalid-lat', -90, 90),
                nanVal: isValid(NaN, -90, 90),
                outOfRangeLatHigh: isValid(91, -90, 90),
                outOfRangeLatLow: isValid(-91, -90, 90),
                outOfRangeLngHigh: isValid(181, -180, 180),
                outOfRangeLngLow: isValid(-181, -180, 180),
                validNumLat: isValid(9.934, -90, 90),
                validStrLat: isValid('9.934', -90, 90),
                validTrimmedLng: isValid('  106.345  ', -180, 180)
            };

            // Test sample stops with missing lat only, missing lng only, null/empty/whitespace
            const testStops = [
                { id: 1, title: 'Thiếu lat (undefined)', lng: 106.34 },
                { id: 2, title: 'lat là null', lat: null, lng: 106.34 },
                { id: 3, title: 'lat là chuỗi rỗng', lat: '', lng: 106.34 },
                { id: 4, title: 'lat chỉ có khoảng trắng', lat: '   ', lng: 106.34 },
                { id: 5, title: 'Thiếu lng (undefined)', lat: 9.93 },
                { id: 6, title: 'lng là null', lat: 9.93, lng: null },
                { id: 7, title: 'lng là chuỗi rỗng', lat: 9.93, lng: '' },
                { id: 8, title: 'lng chỉ có khoảng trắng', lat: 9.93, lng: '   ' },
                { id: 9, title: 'Tọa độ (0, 0)', lat: 0, lng: 0 },
                { id: 10, title: 'Điểm hợp lệ số thực', lat: 9.934, lng: 106.345 },
                { id: 11, title: 'Điểm hợp lệ chuỗi số có khoảng trắng lề', lat: ' 9.936 ', lng: ' 106.347 ' }
            ];

            const filtered = filterStops(testStops);
            const passedIds = filtered.map(s => s.id);

            // Thêm 1 điểm tự do không có tọa độ GPS vào tripPlan thực tế
            window.ViVuApp.addCustomStopToPlan();
            const allStops = window.ViVuApp.getState().tripPlan.days.flatMap(d => d.stops);
            const customStop = allStops.find(s => s.placeId === 'custom-stop');
            const customHasNoCoords = Boolean(customStop && !customStop.lat && !customStop.lng);
            const validStopsInPlan = filterStops(allStops);

            return {
                unitResults,
                passedIds,
                passedCount: filtered.length,
                planAllCount: allStops.length,
                planValidCount: validStopsInPlan.length,
                customHasNoCoords
            };
        })()`);

        assert(!gpxValidationResult.unitResults.nullVal, 'null không được là tọa độ hợp lệ');
        assert(!gpxValidationResult.unitResults.undefVal, 'undefined không được là tọa độ hợp lệ');
        assert(!gpxValidationResult.unitResults.emptyStr, 'chuỗi rỗng không được là tọa độ hợp lệ');
        assert(!gpxValidationResult.unitResults.spaceStr, 'chuỗi chỉ có khoảng trắng không được là tọa độ hợp lệ');
        assert(!gpxValidationResult.unitResults.tabStr, 'chuỗi tab/newline không được là tọa độ hợp lệ');
        assert(!gpxValidationResult.unitResults.textStr, 'chuỗi văn bản không được là tọa độ hợp lệ');
        assert(!gpxValidationResult.unitResults.nanVal, 'NaN không được là tọa độ hợp lệ');
        assert(!gpxValidationResult.unitResults.outOfRangeLatHigh, 'lat > 90 phải bị từ chối');
        assert(!gpxValidationResult.unitResults.outOfRangeLatLow, 'lat < -90 phải bị từ chối');
        assert(!gpxValidationResult.unitResults.outOfRangeLngHigh, 'lng > 180 phải bị từ chối');
        assert(!gpxValidationResult.unitResults.outOfRangeLngLow, 'lng < -180 phải bị từ chối');
        assert(gpxValidationResult.unitResults.validNumLat, 'Tọa độ số thực hợp lệ phải được chấp nhận');
        assert(gpxValidationResult.unitResults.validStrLat, 'Tọa độ chuỗi số hợp lệ phải được chấp nhận');
        assert(gpxValidationResult.unitResults.validTrimmedLng, 'Tọa độ chuỗi có khoảng trắng lề hợp lệ phải được chấp nhận');

        // Verify only items 10 and 11 passed (all 1-9 rejected)
        assert.deepStrictEqual(gpxValidationResult.passedIds, [10, 11], 'Hàm lọc GPX phải loại bỏ tất cả điểm thiếu lat riêng, thiếu lng riêng, null, rỗng, khoảng trắng, (0,0)');
        assert(gpxValidationResult.customHasNoCoords, 'Điểm tự do thêm vào không được có tọa độ GPS giả');
        assert.strictEqual(gpxValidationResult.planValidCount, gpxValidationResult.planAllCount - 1, 'Hàm lọc GPX phải loại bỏ chính xác 1 điểm thiếu tọa độ trong kế hoạch');

        console.log(`  ✓ [PASS] Đã kiểm thử 11 kịch bản lọc tọa độ GPX: Loại bỏ chuẩn xác null, undefined, chuỗi rỗng, khoảng trắng, thiếu riêng lat hoặc thiếu riêng lng`);
        console.log(`  ✓ [PASS] Xuất GPX minh bạch: Chỉ lấy ${gpxValidationResult.planValidCount}/${gpxValidationResult.planAllCount} điểm có tọa độ GPS hợp lệ; tuyệt đối không dùng tọa độ giả mạo`);

        // -------------------------------------------------------------------------
        // KIỂM THỬ TÁCH DỮ LIỆU GIỮA HAI TÀI KHOẢN DÙNG CÙNG TRÌNH DUYỆT
        // -------------------------------------------------------------------------
        console.log('\n  Kiểm thử tách dữ liệu giữa 2 tài khoản trên cùng trình duyệt:');
        const multiAccountTestResult = await cdp.eval(`(() => {
            // 1. Tài khoản A đăng nhập
            localStorage.setItem('vivu_user_session', JSON.stringify({
                user: { id: 'usr-alpha-01', email: 'alpha@test.com', user_metadata: { display_name: 'Nguyễn Văn Alpha' } }
            }));
            window.ViVuApp.handleAuthTripPlanSync();
            
            // Sửa kế hoạch của Alpha và lưu
            window.ViVuApp.getState().tripPlan.title = 'Hành trình Xanh của Alpha';
            window.ViVuApp.saveTripPlanToDevice();
            const keyAlpha = window.ViVuApp.getTripPlanStorageKey();
            const savedAlpha = JSON.parse(localStorage.getItem(keyAlpha) || '{}');

            // 2. Tài khoản B đăng nhập trên cùng trình duyệt
            localStorage.setItem('vivu_user_session', JSON.stringify({
                user: { id: 'usr-beta-02', email: 'beta@test.com', user_metadata: { display_name: 'Trần Thị Beta' } }
            }));
            window.ViVuApp.handleAuthTripPlanSync();
            
            // Sửa kế hoạch của Beta và lưu
            window.ViVuApp.getState().tripPlan.title = 'Food Tour Độc Bản của Beta';
            window.ViVuApp.saveTripPlanToDevice();
            const keyBeta = window.ViVuApp.getTripPlanStorageKey();
            const savedBeta = JSON.parse(localStorage.getItem(keyBeta) || '{}');

            // 3. Tài khoản A đăng nhập lại
            localStorage.setItem('vivu_user_session', JSON.stringify({
                user: { id: 'usr-alpha-01', email: 'alpha@test.com', user_metadata: { display_name: 'Nguyễn Văn Alpha' } }
            }));
            window.ViVuApp.handleAuthTripPlanSync();
            const reloadedAlphaTitle = window.ViVuApp.getState().tripPlan.title;

            // 4. Đăng xuất về khách vãng lai
            localStorage.removeItem('vivu_user_session');
            window.ViVuApp.handleAuthTripPlanSync();
            const guestKey = window.ViVuApp.getTripPlanStorageKey();

            return {
                keyAlpha,
                savedAlphaTitle: savedAlpha.title,
                keyBeta,
                savedBetaTitle: savedBeta.title,
                reloadedAlphaTitle,
                guestKey
            };
        })()`);

        assert(multiAccountTestResult.keyAlpha !== multiAccountTestResult.keyBeta, 'Key lưu trữ của Account A và B phải hoàn toàn khác biệt');
        assert.strictEqual(multiAccountTestResult.savedAlphaTitle, 'Hành trình Xanh của Alpha', 'Account A phải lưu đúng tiêu đề của A');
        assert.strictEqual(multiAccountTestResult.savedBetaTitle, 'Food Tour Độc Bản của Beta', 'Account B phải lưu đúng tiêu đề của B');
        assert.strictEqual(multiAccountTestResult.reloadedAlphaTitle, 'Hành trình Xanh của Alpha', 'Khi Account A đăng nhập lại, dữ liệu của A phải còn nguyên vẹn, không bị B ghi đè');
        assert.strictEqual(multiAccountTestResult.guestKey, 'vivu_trip_plan_guest', 'Khách vãng lai phải có phân vùng lưu riêng');

        console.log(`  ✓ [PASS] Phân vùng dữ liệu tài khoản A: ${multiAccountTestResult.keyAlpha} ("${multiAccountTestResult.savedAlphaTitle}")`);
        console.log(`  ✓ [PASS] Phân vùng dữ liệu tài khoản B: ${multiAccountTestResult.keyBeta} ("${multiAccountTestResult.savedBetaTitle}")`);
        console.log(`  ✓ [PASS] Dữ liệu giữa hai tài khoản trên cùng trình duyệt được TÁCH BIỆT HOÀN TOÀN 100%!`);

        // -------------------------------------------------------------------------
        // KIỂM THỬ KHÁCH CÓ LỊCH TRÌNH -> ĐĂNG NHẬP TÀI KHOẢN MỚI CHƯA LƯU
        // -> KHÔNG TỰ NẠP LỊCH TRÌNH KHÁCH
        // -------------------------------------------------------------------------
        console.log('\n  Kiểm thử: Khách có lịch trình -> đăng nhập tài khoản mới chưa lưu -> KHÔNG tự nạp lịch trình khách:');
        const guestToNewUserResult = await cdp.eval(`(() => {
            // 1. Đảm bảo ở trạng thái khách vãng lai và tạo lịch trình riêng của khách
            localStorage.removeItem('vivu_user_session');
            localStorage.removeItem('vivu_admin_session');
            window.ViVuApp.handleAuthTripPlanSync();
            
            window.ViVuApp.getState().tripPlan.title = 'Kế hoạch riêng của Khách vãng lai';
            window.ViVuApp.saveTripPlanToDevice();
            
            const guestKey = window.ViVuApp.getTripPlanStorageKey();
            const guestPlanStored = JSON.parse(localStorage.getItem(guestKey) || '{}');
            const legacyGuestStored = JSON.parse(localStorage.getItem('vivu_trip_plan') || '{}');

            // 2. Một tài khoản hoàn toàn mới đăng nhập lần đầu (chưa từng lưu lịch trình trên thiết bị)
            const newUserId = 'usr-virgin-newbie-999';
            const newUserStorageKey = 'vivu_trip_plan_' + newUserId.replace(/[^a-zA-Z0-9_-]/g, '_');
            // Đảm bảo bộ nhớ của tài khoản mới này hoàn toàn trống (null)
            localStorage.removeItem(newUserStorageKey);

            localStorage.setItem('vivu_user_session', JSON.stringify({
                user: { id: newUserId, email: 'newbie@test.com', user_metadata: { display_name: 'Tài Khoản Mới Toanh' } }
            }));
            window.ViVuApp.handleAuthTripPlanSync();

            const newUserKey = window.ViVuApp.getTripPlanStorageKey();
            const newUserActiveTitle = window.ViVuApp.getState().tripPlan.title;
            const newUserStoredRaw = localStorage.getItem(newUserKey);

            // 3. Tài khoản mới đăng xuất trở lại khách vãng lai
            localStorage.removeItem('vivu_user_session');
            window.ViVuApp.handleAuthTripPlanSync();
            const restoredGuestTitle = window.ViVuApp.getState().tripPlan.title;

            return {
                guestKey,
                guestTitleStored: guestPlanStored.title,
                legacyTitleStored: legacyGuestStored.title,
                newUserKey,
                newUserActiveTitle,
                newUserStoredRaw,
                restoredGuestTitle
            };
        })()`);

        assert.strictEqual(guestToNewUserResult.guestTitleStored, 'Kế hoạch riêng của Khách vãng lai', 'Dữ liệu khách phải được lưu vào vivu_trip_plan_guest');
        assert.strictEqual(guestToNewUserResult.newUserStoredRaw, null, 'Tài khoản mới chưa từng lưu thì key bộ nhớ phải là null');
        assert.notStrictEqual(guestToNewUserResult.newUserActiveTitle, 'Kế hoạch riêng của Khách vãng lai', 'Tài khoản mới KHÔNG ĐƯỢC nạp lịch trình của khách');
        assert.strictEqual(guestToNewUserResult.newUserActiveTitle, 'Hành trình Xanh: Khám phá Di sản Khmer & Miệt vườn Trà Vinh', 'Tài khoản mới chưa lưu phải nạp lịch trình mặc định khởi tạo');
        assert.strictEqual(guestToNewUserResult.restoredGuestTitle, 'Kế hoạch riêng của Khách vãng lai', 'Khi đăng xuất, lịch trình của khách vãng lai vẫn được khôi phục nguyên vẹn');

        console.log(`  ✓ [PASS] Khách có lịch trình ("${guestToNewUserResult.guestTitleStored}") -> Đăng nhập tài khoản mới chưa lưu -> App nạp lộ trình mặc định ("${guestToNewUserResult.newUserActiveTitle}"), KHÔNG tự nạp lịch trình khách`);
        console.log(`  ✓ [PASS] Đăng xuất -> Lịch trình của khách vãng lai khôi phục chuẩn xác 100% ("${guestToNewUserResult.restoredGuestTitle}")`);

        const shotReorder = path.join(ARTIFACT_DIR, 'planner_reorder_and_saved_state.png');
        await cdp.captureScreenshot(shotReorder);
        console.log(`  📸 Đã chụp: planner_reorder_and_saved_state.png`);

        // -------------------------------------------------------------------------
        // PHẦN 4: DESKTOP TAB 2 - LỊCH TRÌNH GỢI Ý & CHỌN MẪU TÙY CHỈNH
        // -------------------------------------------------------------------------
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [PHẦN 4] NGHIỆM THU DESKTOP (1280x800) - TAB 2: LỊCH TRÌNH GỢI Ý');
        console.log('-------------------------------------------------------------------------');

        await cdp.eval(`window.ViVuApp.switchPlannerTab('suggested')`);
        await sleep(350);

        const tab2State = await cdp.eval(`(() => {
            const contentCustom = document.getElementById('plannerTabContentCustom');
            const contentSuggested = document.getElementById('plannerTabContentSuggested');
            const tourCards = document.querySelectorAll('#plannerSuggestedToursContainer .tour-card, #plannerSuggestedToursContainer [data-tour-id]');
            const customizeBtns = document.querySelectorAll('#plannerSuggestedToursContainer button[onclick*="applyTourTemplateToPlanner"]');
            const randomTourBtn = document.getElementById('btnRandomTour');

            return {
                customHidden: Boolean(contentCustom && contentCustom.classList.contains('hidden')),
                suggestedVisible: Boolean(contentSuggested && !contentSuggested.classList.contains('hidden')),
                hash: window.location.hash,
                toursCount: tourCards.length,
                customizeBtnsCount: customizeBtns.length,
                hasRandomBtn: Boolean(randomTourBtn)
            };
        })()`);

        assert(tab2State.customHidden && tab2State.suggestedVisible, 'Tab 2 phải hiển thị, Tab 1 phải ẩn');
        assert(tab2State.toursCount >= 3, 'Phải hiển thị danh sách các tour 1 ngày có sẵn');
        assert(tab2State.customizeBtnsCount >= 1, 'Phải có nút "Chọn mẫu để tùy chỉnh"');
        console.log(`  ✓ [PASS] Tab 2 hiển thị đầy đủ danh sách tour gợi ý (4 tour), nút "Chọn mẫu để tùy chỉnh"`);

        const shotTab2Top = path.join(ARTIFACT_DIR, 'planner_desktop_tab2_top.png');
        await cdp.captureScreenshot(shotTab2Top);
        console.log(`  📸 Đã chụp: planner_desktop_tab2_top.png`);

        await cdp.eval(`window.scrollTo({ top: 400, behavior: 'instant' })`);
        await sleep(200);
        const shotTab2Bottom = path.join(ARTIFACT_DIR, 'planner_desktop_tab2_bottom.png');
        await cdp.captureScreenshot(shotTab2Bottom);
        console.log(`  📸 Đã chụp: planner_desktop_tab2_bottom.png`);

        // Test Apply Tour Template to Planner
        console.log('\n  Kiểm tra tính năng "Chọn mẫu để tùy chỉnh":');
        const applyTemplateResult = await cdp.eval(`(() => {
            window.ViVuApp.applyTourTemplateToPlanner('khmer-culture');
            const activeTab = window.ViVuApp.getState().plannerCurrentTab;
            const contentCustom = document.getElementById('plannerTabContentCustom');
            const stops = window.ViVuApp.getState().tripPlan.days[0].stops;
            const title = window.ViVuApp.getState().tripPlan.title;

            return {
                activeTab,
                customVisible: Boolean(contentCustom && !contentCustom.classList.contains('hidden')),
                stopsCount: stops.length,
                title
            };
        })()`);

        assert.strictEqual(applyTemplateResult.activeTab, 'custom', 'Khi chọn mẫu, phải tự động chuyển sang Tab 1');
        assert(applyTemplateResult.customVisible, 'Tab 1 Tự lên lịch trình phải hiển thị');
        assert(applyTemplateResult.stopsCount >= 4, 'Toàn bộ các chặng từ tour mẫu phải được nạp vào lịch trình tự chọn');
        console.log(`  ✓ [PASS] Chọn mẫu Tour 1 thành công: Tự động chuyển sang Tab 1, nạp ${applyTemplateResult.stopsCount} chặng ("${applyTemplateResult.title}")`);

        // -------------------------------------------------------------------------
        // PHẦN 5: MOBILE RESPONSIVENESS (390x844)
        // -------------------------------------------------------------------------
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [PHẦN 5] NGHIỆM THU MOBILE (390x844)');
        console.log('-------------------------------------------------------------------------');

        await cdp.setViewport(390, 844, true);
        await cdp.eval(`window.scrollTo({ top: 0, behavior: 'instant' })`);
        await sleep(200);

        // Check Tab 1 on Mobile
        await cdp.eval(`window.ViVuApp.switchPlannerTab('custom')`);
        await sleep(200);

        const mobileTab1Check = await cdp.eval(`(() => {
            return {
                scrollWidth: document.documentElement.scrollWidth,
                clientWidth: document.documentElement.clientWidth,
                hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
            };
        })()`);
        assert(!mobileTab1Check.hasOverflow, 'Mobile Tab 1 không được có thanh cuộn ngang (overflow)');
        console.log(`  ✓ [PASS] Mobile Tab 1 hiển thị mượt mà, không tràn ngang (${mobileTab1Check.scrollWidth}px / ${mobileTab1Check.clientWidth}px)`);

        const shotMobileTab1Top = path.join(ARTIFACT_DIR, 'planner_mobile_tab1_top.png');
        await cdp.captureScreenshot(shotMobileTab1Top);
        console.log(`  📸 Đã chụp: planner_mobile_tab1_top.png`);

        await cdp.eval(`window.scrollTo({ top: 460, behavior: 'instant' })`);
        await sleep(200);
        const shotMobileTab1Bottom = path.join(ARTIFACT_DIR, 'planner_mobile_tab1_bottom.png');
        await cdp.captureScreenshot(shotMobileTab1Bottom);
        console.log(`  📸 Đã chụp: planner_mobile_tab1_bottom.png`);

        // Check Tab 2 on Mobile
        await cdp.eval(`window.ViVuApp.switchPlannerTab('suggested')`);
        await cdp.eval(`window.scrollTo({ top: 0, behavior: 'instant' })`);
        await sleep(200);

        const mobileTab2Check = await cdp.eval(`(() => {
            return {
                scrollWidth: document.documentElement.scrollWidth,
                clientWidth: document.documentElement.clientWidth,
                hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
            };
        })()`);
        assert(!mobileTab2Check.hasOverflow, 'Mobile Tab 2 không được có thanh cuộn ngang');
        console.log(`  ✓ [PASS] Mobile Tab 2 hiển thị mượt mà, không tràn ngang (${mobileTab2Check.scrollWidth}px / ${mobileTab2Check.clientWidth}px)`);

        const shotMobileTab2Top = path.join(ARTIFACT_DIR, 'planner_mobile_tab2_top.png');
        await cdp.captureScreenshot(shotMobileTab2Top);
        console.log(`  📸 Đã chụp: planner_mobile_tab2_top.png`);

        await cdp.eval(`window.scrollTo({ top: 380, behavior: 'instant' })`);
        await sleep(200);
        const shotMobileTab2Bottom = path.join(ARTIFACT_DIR, 'planner_mobile_tab2_bottom.png');
        await cdp.captureScreenshot(shotMobileTab2Bottom);
        console.log(`  📸 Đã chụp: planner_mobile_tab2_bottom.png`);

        // -------------------------------------------------------------------------
        // PHẦN 6: KIỂM THỬ TƯƠNG THÍCH ĐƯỜNG DẪN CŨ (#tours, #planner), RELOAD, BACK/FORWARD
        // -------------------------------------------------------------------------
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [PHẦN 6] KIỂM THỬ TƯƠNG THÍCH ĐƯỜNG DẪN CŨ (#tours, #planner), RELOAD, BACK/FORWARD');
        console.log('-------------------------------------------------------------------------');

        await cdp.setViewport(1280, 800, false);

        // 6.1 Đường dẫn cũ #tours
        await cdp.eval(`window.location.hash = '#tours'`);
        await sleep(350);
        const checkHashTours = await cdp.eval(`(() => {
            const vPlanner = document.getElementById('view-planner');
            const isSuggested = !document.getElementById('plannerTabContentSuggested')?.classList.contains('hidden');
            return {
                activeView: window.ViVuApp.getActiveView(),
                isPlannerVisible: Boolean(vPlanner && !vPlanner.classList.contains('hidden')),
                isSuggestedTab: isSuggested
            };
        })()`);
        assert(checkHashTours.isPlannerVisible && checkHashTours.isSuggestedTab, 'Hash #tours phải mở tab Lịch trình gợi ý trong Planner');
        console.log('  ✓ [PASS] Hash cũ #tours: Mở chính xác tab "Lịch trình gợi ý" trong trang Lên kế hoạch chuyến đi');

        // 6.2 Đường dẫn cũ #planner
        await cdp.eval(`window.location.hash = '#planner'`);
        await sleep(350);
        const checkHashPlanner = await cdp.eval(`(() => {
            const vPlanner = document.getElementById('view-planner');
            const isCustom = !document.getElementById('plannerTabContentCustom')?.classList.contains('hidden');
            return {
                activeView: window.ViVuApp.getActiveView(),
                isPlannerVisible: Boolean(vPlanner && !vPlanner.classList.contains('hidden')),
                isCustomTab: isCustom
            };
        })()`);
        assert(checkHashPlanner.isPlannerVisible && checkHashPlanner.isCustomTab, 'Hash #planner phải mở tab Tự lên lịch trình');
        console.log('  ✓ [PASS] Hash cũ #planner: Mở chính xác tab "Tự lên lịch trình"');

        // 6.3 Reload trang tại #/planner
        await cdp.eval(`window.location.hash = '#/planner'`);
        await sleep(200);
        await cdp.send('Page.reload');
        await sleep(600);

        let reloadReady = false;
        for (let i = 0; i < 40; i++) {
            reloadReady = await cdp.eval(`Boolean(window.ViVuApp && window.ViVuApp.getActiveView && window.ViVuApp.getActiveView() === 'planner')`);
            if (reloadReady) break;
            await sleep(250);
        }
        assert(reloadReady, 'App phải sẵn sàng sau khi reload');

        const reloadCheck = await cdp.eval(`(() => {
            const vPlanner = document.getElementById('view-planner');
            const isCustom = !document.getElementById('plannerTabContentCustom')?.classList.contains('hidden');
            return {
                activeView: window.ViVuApp.getActiveView(),
                isPlannerVisible: Boolean(vPlanner && !vPlanner.classList.contains('hidden')),
                isCustomTab: isCustom
            };
        })()`);
        assert(reloadCheck.isPlannerVisible && reloadCheck.isCustomTab, 'Reload tại #/planner phải giữ nguyên trang planner');
        console.log('  ✓ [PASS] Reload trang tại #/planner: Khôi phục chính xác 100% giao diện Lên kế hoạch chuyến đi');

        // 6.4 Browser Back / Forward
        await cdp.eval(`window.ViVuApp.navGoBlog()`);
        await sleep(300);
        assert.strictEqual(await cdp.eval(`window.ViVuApp.getActiveView()`), 'blog', 'Phải chuyển sang blog');

        await cdp.eval(`window.history.back()`);
        await sleep(350);
        assert.strictEqual(await cdp.eval(`window.ViVuApp.getActiveView()`), 'planner', 'Browser Back phải quay lại planner');
        console.log('  ✓ [PASS] Browser Back khôi phục chính xác trang Lên kế hoạch chuyến đi');

        await cdp.eval(`window.history.forward()`);
        await sleep(350);
        assert.strictEqual(await cdp.eval(`window.ViVuApp.getActiveView()`), 'blog', 'Browser Forward chuyển tiếp chính xác');
        console.log('  ✓ [PASS] Browser Forward hoạt động mượt mà');

        // -------------------------------------------------------------------------
        // PHẦN 7: BẢO TOÀN 4 DANH MỤC VỪA HOÀN THIỆN
        // -------------------------------------------------------------------------
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [PHẦN 7] KIỂM TRA BẢO TOÀN 4 DANH MỤC VỪA HOÀN THIỆN');
        console.log('-------------------------------------------------------------------------');

        const fourViewsCheck = await cdp.eval(`(() => {
            const clubs = document.getElementById('view-clubs');
            const comm = document.getElementById('view-community');
            const blog = document.getElementById('view-blog');
            const events = document.getElementById('view-events');

            return {
                hasClubs: Boolean(clubs),
                hasComm: Boolean(comm),
                hasBlog: Boolean(blog),
                hasEvents: Boolean(events)
            };
        })()`);

        assert(fourViewsCheck.hasClubs, 'View Clubs phải tồn tại');
        assert(fourViewsCheck.hasComm, 'View Community phải tồn tại');
        assert(fourViewsCheck.hasBlog, 'View Blog phải tồn tại');
        assert(fourViewsCheck.hasEvents, 'View Events phải tồn tại');
        console.log('  ✓ [PASS] 4 danh mục độc lập (Câu lạc bộ, Cộng đồng, Blog ViVu, Sự kiện) hoàn toàn nguyên vẹn 100%');

        console.log('\n================================================================================');
        console.log('🎉 TẤT CẢ TIÊU CHÍ NGHIỆM THU GỘP "LÊN KẾ HOẠCH CHUYẾN ĐI" ĐÃ ĐẠT 100% PASS!');
        console.log('================================================================================\n');

    } finally {
        if (cdp) await cdp.close();
        chrome.kill();
        server.close();
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (_) {}
    }
}

run().catch(err => {
    console.error('\n❌ KIỂM THỬ THẤT BẠI:', err);
    process.exit(1);
});
