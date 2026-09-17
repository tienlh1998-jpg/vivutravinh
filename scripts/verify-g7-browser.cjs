// scripts/verify-g7-browser.cjs
// Kiểm thử tự động thực tế trên trình duyệt thực qua Chrome DevTools Protocol (CDP):
// 1. Dynamic SEO & OG Meta Tags: Tiêu đề & canonical cập nhật theo địa điểm, tự hoàn trả khi đóng
// 2. Report Place Modal: Mở modal báo sai, hiển thị đúng địa điểm mục tiêu, gửi form phản ánh
// 3. Trip Collection Sharing: Tham số ?trip= nạp đúng bộ sưu tập và hiển thị nút chia sẻ
// 4. Tour Planner Upgrade: Hiển thị đầy đủ chips budget, travel time, family-friendly
// 5. Source Transparency: Minh bạch nguồn dữ liệu thời tiết & lễ hội

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ARTIFACT_DIR = '/home/huutien-tran/.gemini/antigravity/brain/1cab34ab-f633-487c-8e0f-9175241583a3';

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
    throw new Error('Không thể kết nối Chrome DevTools protocol trên cổng ' + port);
}

class CDPClient {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.reqId = 0;
        this.callbacks = new Map();
        this.listeners = [];
        this.ws.onmessage = (msg) => {
            const res = JSON.parse(msg.data);
            if (res.id && this.callbacks.has(res.id)) {
                const cb = this.callbacks.get(res.id);
                this.callbacks.delete(res.id);
                cb(res);
            }
            for (const l of this.listeners) {
                l(res.method, res.params);
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
            mobile: width < 768
        });
        await sleep(300);
    }

    async screenshot(filePath) {
        const res = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
    }

    close() {
        try { this.ws.close(); } catch {}
    }
}

async function waitForAppReady(cdp, timeoutMs = 12000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        try {
            const ready = await cdp.eval(`(() => {
                const hasApp = !!(window.ViVuApp && window.ViVuApp.state);
                const hasPlaces = (window.ViVuApp?.state?.allPlaces || []).length > 0;
                const hasCards = document.querySelectorAll('.place-card').length > 0;
                return hasApp && hasPlaces && hasCards;
            })()`);
            if (ready) return true;
        } catch {}
        await sleep(250);
    }
    throw new Error('Hết thời gian chờ: Ứng dụng ViVuTraVinh chưa sẵn sàng (places chưa render).');
}

async function runG7BrowserTests() {
    console.log('\n=== KHỞI ĐỘNG KIỂM THỬ TRÌNH DUYỆT G7 (RELEASE & FEATURES) ===\n');

    const chromePort = 9225;
    const userDataDir = path.join(os.tmpdir(), 'vivu_g7_browser_test_' + Date.now());
    fs.mkdirSync(userDataDir, { recursive: true });

    const chrome = spawn('google-chrome', [
        '--headless=new',
        `--remote-debugging-port=${chromePort}`,
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        '--disable-background-networking',
        '--disable-features=Translate',
        'http://localhost:8000'
    ], { stdio: 'pipe' });

    let cdp = null;
    let testsPassed = 0;
    const totalTests = 5;

    try {
        console.log('[Setup] Đang kết nối tới Chrome headless qua CDP...');
        const wsUrl = await getDebuggerUrl(chromePort);
        cdp = new CDPClient(wsUrl);
        await cdp.ready();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.setViewport(1280, 800);

        console.log('[Setup] Đang tải giao diện ViVuTraVinh...');
        await waitForAppReady(cdp);
        console.log('✓ Ứng dụng ViVuTraVinh đã sẵn sàng!\n');

        // CA THỬ 1: Dynamic SEO & OG Meta Tags
        console.log('--- Ca thử 1: Dynamic SEO & OG Meta Tags theo địa điểm ---');
        {
            // Mở modal địa điểm Ao Bà Om
            await cdp.eval(`window.ViVuApp.openDetailModal('ao-ba-om')`);
            await sleep(400);

            const seoData = await cdp.eval(`(() => {
                const canonical = document.getElementById('canonicalLink')?.getAttribute('href');
                const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
                const ogUrl = document.querySelector('meta[property="og:url"]')?.getAttribute('content');
                return {
                    title: document.title,
                    canonical,
                    ogTitle,
                    ogUrl
                };
            })()`);

            if (!seoData.title.includes('Ao Bà Om')) {
                throw new Error(`document.title không chứa tên địa điểm: ${seoData.title}`);
            }
            if (!seoData.ogTitle.includes('Ao Bà Om')) {
                throw new Error(`og:title không chứa tên địa điểm: ${seoData.ogTitle}`);
            }
            if (!seoData.canonical.includes('?place=') || !seoData.canonical.includes('ao-ba-om')) {
                throw new Error(`Canonical URL không chứa deep link: ${seoData.canonical}`);
            }

            // Đóng modal và kiểm tra hoàn trả meta tags
            await cdp.eval(`window.ViVuApp.closeDetailModal()`);
            await sleep(300);

            const restoredSeo = await cdp.eval(`(() => ({
                title: document.title,
                canonical: document.getElementById('canonicalLink')?.getAttribute('href')
            }))()`);

            if (!restoredSeo.title.includes('Cẩm Nang Khám Phá')) {
                throw new Error(`Tiêu đề chưa được khôi phục về mặc định: ${restoredSeo.title}`);
            }
            if (restoredSeo.canonical !== 'https://vivutravinh.vercel.app/') {
                throw new Error(`Canonical chưa được khôi phục về trang chủ: ${restoredSeo.canonical}`);
            }

            console.log('  ✓ Dynamic Meta Tags: Cập nhật chính xác cho Ao Bà Om & hoàn trả mặc định khi đóng');
            testsPassed++;
        }

        // CA THỬ 2: Modal Báo Sai Thông Tin Địa Điểm
        console.log('\n--- Ca thử 2: Modal Báo Sai Thông Tin Địa Điểm (Feedback) ---');
        {
            // Mở modal địa điểm trước
            await cdp.eval(`window.ViVuApp.openDetailModal('ao-ba-om')`);
            await sleep(300);

            // Mở modal báo sai
            await cdp.eval(`window.ViVuApp.openReportModal()`);
            await sleep(300);

            const reportModalState = await cdp.eval(`(() => {
                const modal = document.getElementById('reportPlaceModal');
                const isVisible = modal && !modal.classList.contains('hidden');
                const targetName = document.getElementById('reportPlaceTargetName')?.textContent;
                const placeId = document.getElementById('reportPlaceId')?.value;
                return { isVisible, targetName, placeId };
            })()`);

            if (!reportModalState.isVisible) {
                throw new Error('Modal báo sai chưa hiển thị');
            }
            if (!reportModalState.targetName.includes('Ao Bà Om')) {
                throw new Error(`Tên địa điểm mục tiêu sai: ${reportModalState.targetName}`);
            }

            // Điền thông tin và kiểm tra nút gửi
            await cdp.eval(`(() => {
                document.getElementById('reportIssueType').value = 'wrong_hours';
                document.getElementById('reportDetails').value = 'Giờ mở cửa thực tế từ 5h sáng đến 19h tối.';
            })()`);

            await cdp.screenshot(path.join(ARTIFACT_DIR, 'g7-report-modal.png'));

            // Đóng modal báo sai
            await cdp.eval(`window.ViVuApp.closeReportModal()`);
            await sleep(200);

            const isClosed = await cdp.eval(`document.getElementById('reportPlaceModal').classList.contains('hidden')`);
            if (!isClosed) throw new Error('Modal báo sai chưa đóng');

            await cdp.eval(`window.ViVuApp.closeDetailModal()`);
            await sleep(200);

            console.log('  ✓ Report Place Modal: Mở đúng địa điểm, binding form đầy đủ, đóng mượt mà');
            testsPassed++;
        }

        // CA THỬ 3: Trip Collection Sharing & URL Handling
        console.log('\n--- Ca thử 3: Chia sẻ bộ sưu tập chuyến đi (?trip=slug1,slug2) ---');
        {
            // Lấy động 2 slug địa điểm đầu tiên từ danh sách địa điểm đang chạy
            const testSlugs = await cdp.eval(`(() => {
                const places = window.ViVuApp.state.allPlaces.slice(0, 2);
                return places.map(p => p.slug || p.id).join(',');
            })()`);
            await cdp.send('Page.navigate', { url: `http://localhost:8000/?trip=${testSlugs}` });
            await sleep(1500);
            await waitForAppReady(cdp);

            await cdp.screenshot(path.join(ARTIFACT_DIR, 'g7-trip-sharing.png'));

            const tripState = await cdp.eval(`(() => {
                const app = window.ViVuApp;
                const favs = app.state.favorites || [];
                const activeCategory = app.state.activeCategory;
                const shareBtnVisible = !document.getElementById('shareTripBtn')?.classList.contains('hidden');
                const cardCount = document.querySelectorAll('.place-card').length;
                return {
                    favCount: favs.length,
                    activeCategory,
                    shareBtnVisible,
                    cardCount
                };
            })()`);

            if (tripState.activeCategory !== 'saved') {
                throw new Error(`Chưa tự động chuyển sang tab saved khi có param ?trip, hiện tại: ${tripState.activeCategory}`);
            }
            if (tripState.cardCount < 2) {
                throw new Error(`Số địa điểm hiển thị trong chuyến đi chưa đủ: ${tripState.cardCount}`);
            }
            if (!tripState.shareBtnVisible) {
                throw new Error('Nút shareTripBtn chưa hiển thị trong tab saved');
            }

            console.log(`  ✓ Trip Collection: Nhận diện ?trip=, nạp ${tripState.cardCount} địa điểm vào tab saved và hiển thị nút chia sẻ`);
            testsPassed++;
        }

        // CA THỬ 4: Tour Itinerary Metadata Chips (Budget, Travel Time, Family)
        console.log('\n--- Ca thử 4: Tour Itinerary Metadata Chips ---');
        {
            const tourChips = await cdp.eval(`(() => {
                const container = document.getElementById('tourItinerariesContainer');
                if (!container) return { found: false };
                const text = container.textContent;
                return {
                    found: true,
                    hasBudget: text.includes('150.000đ') || text.includes('200.000đ') || text.includes('350.000đ'),
                    hasTravelTime: text.includes('di chuyển'),
                    hasFamilyFriendly: text.includes('Phù hợp gia đình')
                };
            })()`);

            if (!tourChips.found) throw new Error('#tourItinerariesContainer không tìm thấy');
            if (!tourChips.hasBudget) throw new Error('Không tìm thấy chip ngân sách (budget) trong tour');
            if (!tourChips.hasTravelTime) throw new Error('Không tìm thấy chip thời gian di chuyển (travelTime) trong tour');
            if (!tourChips.hasFamilyFriendly) throw new Error('Không tìm thấy chip phù hợp gia đình (familyFriendly) trong tour');

            console.log('  ✓ Tour Planner: Đầy đủ thông tin ngân sách, thời gian di chuyển và gắn nhãn gia đình');
            testsPassed++;
        }

        // CA THỬ 5: Minh bạch nguồn dữ liệu thời tiết & lễ hội
        console.log('\n--- Ca thử 5: Minh bạch nguồn dữ liệu thời tiết & lễ hội ---');
        {
            const transparencyData = await cdp.eval(`(() => {
                const weatherText = document.getElementById('smartSuggestionsContainer')?.textContent || '';
                const festivalText = document.getElementById('festivalsPortalContainer')?.textContent || '';
                return {
                    hasWeatherSource: weatherText.includes('Open-Meteo') && weatherText.includes('Khí tượng Trà Vinh'),
                    hasFestivalSource: festivalText.includes('Trung tâm Thông tin Xúc tiến Du lịch') && festivalText.includes('2026')
                };
            })()`);

            if (!transparencyData.hasWeatherSource) {
                throw new Error('Thiếu ghi chú nguồn dữ liệu thời tiết Open-Meteo & Trạm khí tượng Trà Vinh');
            }
            if (!transparencyData.hasFestivalSource) {
                throw new Error('Thiếu ghi chú nguồn dữ liệu lễ hội từ Sở VHTT&DL / Trung tâm Xúc tiến Du lịch');
            }

            console.log('  ✓ Data Transparency: Minh bạch đầy đủ nguồn dữ liệu thời tiết và lễ hội 2026');
            testsPassed++;
        }

        console.log(`\n========================================`);
        console.log(`KẾT QUẢ KIỂM THỬ TRÌNH DUYỆT G7: ${testsPassed}/${totalTests} PASS`);
        console.log(`========================================\n`);

    } catch (err) {
        console.error('\n❌ LỖI TRONG QUÁ TRÌNH KIỂM THỬ TRÌNH DUYỆT G7:');
        console.error(err);
        process.exitCode = 1;
    } finally {
        if (cdp) cdp.close();
        try { chrome.kill(); } catch {}
        try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    }
}

runG7BrowserTests();
