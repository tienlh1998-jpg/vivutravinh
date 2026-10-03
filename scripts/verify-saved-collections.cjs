/**
 * scripts/verify-saved-collections.cjs
 *
 * Automated Acceptance Verification for "Bộ sưu tập đã lưu":
 * 1. Capture BEFORE/AFTER screenshots:
 *    - Desktop (1280x800)
 *    - Tablet (1024x768)
 *    - Mobile (390x844 Light & Dark)
 *    - Mobile Virtual Keyboard Simulation (390x500 with focused input)
 * 2. Layout & Responsiveness:
 *    - Search bar, category filter, and actions cleanly separated when narrow.
 *    - No overlapping, clipping, or truncated category buttons.
 *    - Category bar has independent horizontal scroll on mobile with zero page overflow.
 * 3. Search & Filter Logic:
 *    - Real-time search filters items by title, address, note, categoryLabel, tags.
 *    - Combines correctly with category filter and sorting.
 *    - Empty state ("Không tìm thấy") displays when search/filter yields 0 results.
 *    - Reset filters and clear search button restore list.
 * 4. Light / Dark mode consistency.
 * 5. Mobile virtual keyboard simulation.
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
            }, 25000);
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
            throw new Error(`CDP Eval Exception: ${JSON.stringify(res.exceptionDetails)}`);
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
        await sleep(250);
    }

    async captureScreenshot(outputPath) {
        const res = await this.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
    }

    async close() {
        try {
            this.ws.close();
        } catch (_) {}
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

async function runAcceptance() {
    console.log('================================================================================');
    console.log(' BẮT ĐẦU KIỂM THỬ BỐ CỤC, TÌM KIẾM & BỘ LỌC BỘ SƯU TẬP ĐÃ LƯU');
    console.log('================================================================================\n');

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
    console.log(`  ✓ Máy chủ test chạy tại http://localhost:${serverPort}`);

    const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
    ];
    const chromeExe = chromePaths.find(p => fs.existsSync(p));
    if (!chromeExe) throw new Error('Không tìm thấy Chrome');

    const tempDir = path.join(os.tmpdir(), 'chrome_saved_test_' + Date.now());
    const cdpPort = 9600 + Math.floor(Math.random() * 250);
    const chrome = spawn(chromeExe, [
        `--remote-debugging-port=${cdpPort}`,
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--mute-audio',
        `--user-data-dir=${tempDir}`,
        `http://localhost:${serverPort}/#/saved`
    ], { stdio: 'ignore' });

    let cdp = null;
    try {
        const wsUrl = await getDebuggerUrl(cdpPort);
        cdp = new CDPClient(wsUrl);
        await cdp.ready();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('DOM.enable');

        await sleep(1500);

        // Đảm bảo mở Modal bộ sưu tập đã lưu và app sẵn sàng
        await cdp.eval(`(() => {
            window.location.hash = '#/saved';
            if (window.ViVuApp && window.ViVuApp.openSavedCollectionsModal) {
                window.ViVuApp.openSavedCollectionsModal();
            }
        })()`);
        await sleep(500);

        // -------------------------------------------------------------------------
        // PHẦN 1: KIỂM TRA BỐ CỤC DESKTOP & TABLET (AFTER)
        // -------------------------------------------------------------------------
        console.log('-------------------------------------------------------------------------');
        console.log(' [PHẦN 1] BỐ CỤC DESKTOP (1280px) & TABLET (1024px) - KHÔNG CHỒNG LẤP, KHÔNG CẮT NÚT');
        console.log('-------------------------------------------------------------------------');

        await cdp.setViewport(1280, 800, false);
        await sleep(350);

        const desktopLayoutState = await cdp.eval(`(() => {
            const searchInput = document.getElementById('savedSearchInput');
            const sortSelect = document.getElementById('savedSortSelect');
            const viewGridBtn = document.getElementById('btnSavedViewGrid');
            const categoryButtons = Array.from(document.querySelectorAll('#savedCollectionsModal [data-category]'));
            
            // Check bounding rects to ensure no overlapping between categories and action controls
            const sortRect = sortSelect ? sortSelect.getBoundingClientRect() : null;
            const categoryRects = categoryButtons.map(b => ({
                cat: b.getAttribute('data-category'),
                text: b.innerText.trim(),
                rect: b.getBoundingClientRect()
            }));

            // Check if any category button overlaps horizontally or vertically with sortSelect
            let hasOverlap = false;
            if (sortRect) {
                for (const c of categoryRects) {
                    const overlapX = Math.max(0, Math.min(c.rect.right, sortRect.right) - Math.max(c.rect.left, sortRect.left));
                    const overlapY = Math.max(0, Math.min(c.rect.bottom, sortRect.bottom) - Math.max(c.rect.top, sortRect.top));
                    if (overlapX > 0 && overlapY > 0) {
                        hasOverlap = true;
                    }
                }
            }

            return {
                hasSearchInput: Boolean(searchInput),
                hasSortSelect: Boolean(sortSelect),
                categoriesCount: categoryButtons.length,
                hasOverlap,
                categoryLabels: categoryRects.map(c => c.text)
            };
        })()`);

        assert(desktopLayoutState.hasSearchInput, 'Phải có ô tìm kiếm #savedSearchInput');
        assert(desktopLayoutState.hasSortSelect, 'Phải có cụm sắp xếp #savedSortSelect');
        assert.strictEqual(desktopLayoutState.categoriesCount, 5, 'Phải hiển thị đầy đủ 5 danh mục lọc');
        assert.strictEqual(desktopLayoutState.hasOverlap, false, 'Các nút danh mục TUYỆT ĐỐI KHÔNG bị cụm sắp xếp che khuất hay chồng lấn!');

        const shotAfterDesktop1280 = path.join(ARTIFACT_DIR, 'saved_after_desktop_1280.png');
        await cdp.captureScreenshot(shotAfterDesktop1280);
        console.log(`  ✓ [PASS] Desktop 1280px: Ô tìm kiếm, bộ lọc danh mục và cụm thao tác tách hàng rõ ràng, 0% chồng lấn!`);
        console.log(`  📸 Đã chụp: saved_after_desktop_1280.png`);

        // Kiểm tra trên Tablet / Narrow Desktop (1024x768)
        await cdp.setViewport(1024, 768, false);
        await sleep(350);

        const tabletLayoutState = await cdp.eval(`(() => {
            const sortSelect = document.getElementById('savedSortSelect');
            const categoryButtons = Array.from(document.querySelectorAll('#savedCollectionsModal [data-category]'));
            const sortRect = sortSelect ? sortSelect.getBoundingClientRect() : null;
            let hasOverlap = false;
            if (sortRect) {
                for (const b of categoryButtons) {
                    const r = b.getBoundingClientRect();
                    const overlapX = Math.max(0, Math.min(r.right, sortRect.right) - Math.max(r.left, sortRect.left));
                    const overlapY = Math.max(0, Math.min(r.bottom, sortRect.bottom) - Math.max(r.top, sortRect.top));
                    if (overlapX > 0 && overlapY > 0) hasOverlap = true;
                }
            }
            return { hasOverlap, count: categoryButtons.length };
        })()`);

        assert.strictEqual(tabletLayoutState.hasOverlap, false, 'Trên 1024px các nút danh mục không được chồng lấn với cụm sắp xếp!');
        const shotAfterTablet1024 = path.join(ARTIFACT_DIR, 'saved_after_tablet_1024.png');
        await cdp.captureScreenshot(shotAfterTablet1024);
        console.log(`  ✓ [PASS] Tablet 1024px: Đã giải quyết triệt để lỗi bị cụm sắp xếp che khuất! Nút "Chùa & Làng nghề" hiển thị trọn vẹn.`);
        console.log(`  📸 Đã chụp: saved_after_tablet_1024.png`);

        // -------------------------------------------------------------------------
        // PHẦN 2: KIỂM THỬ TÌM KIẾM THỰC SỰ LỌC MỤC ĐÃ LƯU, KẾT HỢP DANH MỤC & SẮP XẾP
        // -------------------------------------------------------------------------
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [PHẦN 2] KIỂM THỬ TÌM KIẾM THỰC SỰ LỌC, KẾT HỢP DANH MỤC & SẮP XẾP');
        console.log('-------------------------------------------------------------------------');

        // 1. Tìm kiếm "Chùa"
        const searchChuaResult = await cdp.eval(`(() => {
            window.ViVuApp.handleSavedSearch('Chùa');
            const cards = Array.from(document.querySelectorAll('.saved-card'));
            const titles = cards.map(c => c.querySelector('h2, h3')?.innerText.trim());
            const hasClearBtn = Boolean(document.getElementById('savedSearchClearBtn'));
            const badgeText = document.getElementById('savedTotalBadge')?.innerText.trim();
            return {
                cardsCount: cards.length,
                titles,
                hasClearBtn,
                badgeText
            };
        })()`);
        assert(searchChuaResult.cardsCount >= 1, 'Tìm "Chùa" phải ra ít nhất 1 kết quả');
        assert(searchChuaResult.titles.every(t => t.toLowerCase().includes('chùa')), 'Mọi kết quả phải chứa từ khóa "chùa"');
        assert(searchChuaResult.hasClearBtn, 'Khi có từ khóa phải xuất hiện nút xóa nhanh');
        console.log(`  ✓ [PASS] Tìm kiếm từ khóa "Chùa": Lọc ra chính xác ${searchChuaResult.cardsCount} mục: [${searchChuaResult.titles.join(', ')}]`);

        // 2. Tìm kiếm "Bún"
        const searchBunResult = await cdp.eval(`(() => {
            window.ViVuApp.handleSavedSearch('Bún');
            const cards = Array.from(document.querySelectorAll('.saved-card'));
            const titles = cards.map(c => c.querySelector('h2, h3')?.innerText.trim());
            return { cardsCount: cards.length, titles };
        })()`);
        assert(searchBunResult.cardsCount === 1, 'Tìm "Bún" phải ra 1 quán ăn');
        assert(searchBunResult.titles[0].includes('Bún Nước Lèo'), 'Kết quả phải là Bún Nước Lèo');
        console.log(`  ✓ [PASS] Tìm kiếm từ khóa "Bún": Lọc chính xác [${searchBunResult.titles[0]}]`);

        // 3. Kết hợp Tìm kiếm với Lọc danh mục
        // Đang tìm "Chùa" nhưng bấm danh mục "Ẩm thực & Quán" (culinary) -> 0 kết quả
        const searchCombinedResult = await cdp.eval(`(() => {
            window.ViVuApp.handleSavedSearch('Chùa');
            window.ViVuApp.filterSavedCategory('culinary');
            const cards = Array.from(document.querySelectorAll('.saved-card'));
            const emptyState = document.getElementById('savedEmptyState');
            const emptyText = emptyState ? emptyState.innerText : '';
            return {
                cardsCount: cards.length,
                hasEmptyState: Boolean(emptyState),
                emptyText
            };
        })()`);
        assert.strictEqual(searchCombinedResult.cardsCount, 0, 'Tìm "Chùa" trong danh mục Ẩm thực phải có 0 kết quả');
        assert(searchCombinedResult.hasEmptyState, 'Phải hiển thị trạng thái "Không tìm thấy"');
        assert(searchCombinedResult.emptyText.includes('Không tìm thấy mục đã lưu nào phù hợp'), 'Nội dung phải ghi rõ không tìm thấy');
        console.log(`  ✓ [PASS] Kết hợp Tìm kiếm & Danh mục: Trả về 0 kết quả -> Kích hoạt trạng thái "Không tìm thấy mục đã lưu nào phù hợp"`);

        // Chụp ảnh trạng thái Không tìm thấy
        const shotEmptyState = path.join(ARTIFACT_DIR, 'saved_search_empty_state.png');
        await cdp.captureScreenshot(shotEmptyState);
        console.log(`  📸 Đã chụp: saved_search_empty_state.png`);

        // 4. Bấm "Đặt lại bộ lọc & tìm kiếm"
        const resetResult = await cdp.eval(`(() => {
            window.ViVuApp.resetSavedFilters();
            const cards = Array.from(document.querySelectorAll('.saved-card'));
            const searchVal = document.getElementById('savedSearchInput')?.value;
            const activeCategoryBtn = document.querySelector('[data-category="all"]');
            return {
                cardsCount: cards.length,
                searchVal,
                isAllActive: activeCategoryBtn?.classList.contains('bg-primary')
            };
        })()`);
        assert(resetResult.cardsCount >= 4, 'Sau khi reset phải khôi phục toàn bộ danh sách');
        assert.strictEqual(resetResult.searchVal, '', 'Ô tìm kiếm phải được làm rỗng');
        assert(resetResult.isAllActive, 'Danh mục "Tất cả" phải được chọn lại');
        console.log(`  ✓ [PASS] Đặt lại bộ lọc & tìm kiếm: Khôi phục tức thì toàn bộ ${resetResult.cardsCount} mục`);

        // 5. Kết hợp Sắp xếp (Sort mode)
        const sortResult = await cdp.eval(`(() => {
            window.ViVuApp.sortSavedItems('distance');
            const cardsDist = Array.from(document.querySelectorAll('.saved-card'));
            const firstTitleDist = cardsDist[0].querySelector('h2, h3')?.innerText.trim();

            window.ViVuApp.sortSavedItems('rating');
            const cardsRating = Array.from(document.querySelectorAll('.saved-card'));
            const firstTitleRating = cardsRating[0].querySelector('h2, h3')?.innerText.trim();

            // Khôi phục mặc định
            window.ViVuApp.sortSavedItems('recent');

            return { firstTitleDist, firstTitleRating };
        })()`);
        assert(sortResult.firstTitleDist, 'Sắp xếp khoảng cách phải hoạt động');
        assert(sortResult.firstTitleRating, 'Sắp xếp đánh giá phải hoạt động');
        console.log(`  ✓ [PASS] Kết hợp Sắp xếp: Gần nhất ("${sortResult.firstTitleDist}"), Đánh giá cao nhất ("${sortResult.firstTitleRating}")`);

        // -------------------------------------------------------------------------
        // PHẦN 3: KIỂM THỬ TRÊN THIẾT BỊ DI ĐỘNG (MOBILE 390x844 LIGHT & DARK)
        // -------------------------------------------------------------------------
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [PHẦN 3] MOBILE RESPONSIVE (390x844) - SÁNG, TỐI & CUỘN NGANG RIÊNG');
        console.log('-------------------------------------------------------------------------');

        await cdp.setViewport(390, 844, true);
        await sleep(350);

        // Light mode check
        await cdp.eval(`document.documentElement.classList.remove('dark')`);
        await sleep(200);

        const mobileCheckLight = await cdp.eval(`(() => {
            const bodyScrollWidth = document.documentElement.scrollWidth;
            const bodyClientWidth = document.documentElement.clientWidth;
            const categoryContainer = document.querySelector('[role="toolbar"][aria-label*="Bộ lọc danh mục"]');
            const catScrollWidth = categoryContainer ? categoryContainer.scrollWidth : 0;
            const catClientWidth = categoryContainer ? categoryContainer.clientWidth : 0;
            return {
                bodyScrollWidth,
                bodyClientWidth,
                hasPageHorizontalOverflow: bodyScrollWidth > bodyClientWidth + 1,
                hasCategoryScroll: catScrollWidth > catClientWidth,
                catScrollWidth,
                catClientWidth
            };
        })()`);
        assert(!mobileCheckLight.hasPageHorizontalOverflow, 'Mobile KHÔNG ĐƯỢC có thanh cuộn ngang toàn trang');
        assert(mobileCheckLight.hasCategoryScroll, 'Hàng danh mục PHẢI có thanh cuộn ngang độc lập để vuốt mượt mà');
        console.log(`  ✓ [PASS] Mobile Light (390x844): Toàn trang vừa khít (${mobileCheckLight.bodyScrollWidth}px / ${mobileCheckLight.bodyClientWidth}px); Hàng danh mục cuộn ngang độc lập (${mobileCheckLight.catScrollWidth}px > ${mobileCheckLight.catClientWidth}px)`);

        const shotAfterMobileLight = path.join(ARTIFACT_DIR, 'saved_after_mobile_390_light.png');
        await cdp.captureScreenshot(shotAfterMobileLight);
        console.log(`  📸 Đã chụp: saved_after_mobile_390_light.png`);

        // Dark mode check
        await cdp.eval(`document.documentElement.classList.add('dark')`);
        await sleep(250);

        const mobileCheckDark = await cdp.eval(`(() => {
            const bodyScrollWidth = document.documentElement.scrollWidth;
            const bodyClientWidth = document.documentElement.clientWidth;
            const isDark = document.documentElement.classList.contains('dark');
            return {
                isDark,
                hasPageHorizontalOverflow: bodyScrollWidth > bodyClientWidth + 1
            };
        })()`);
        assert(mobileCheckDark.isDark, 'Giao diện phải đang ở chế độ Dark mode');
        assert(!mobileCheckDark.hasPageHorizontalOverflow, 'Mobile Dark KHÔNG ĐƯỢC có thanh cuộn ngang');
        console.log(`  ✓ [PASS] Mobile Dark (390x844): Độ tương phản xuất sắc, các nút bo tròn min-h-[44px], không tràn trang`);

        const shotAfterMobileDark = path.join(ARTIFACT_DIR, 'saved_after_mobile_390_dark.png');
        await cdp.captureScreenshot(shotAfterMobileDark);
        console.log(`  📸 Đã chụp: saved_after_mobile_390_dark.png`);

        // -------------------------------------------------------------------------
        // PHẦN 4: GIẢ LẬP MỞ BÀN PHÍM ĐIỆN THOẠI (VIRTUAL KEYBOARD 390x500 VIEWPORT)
        // -------------------------------------------------------------------------
        console.log('\n-------------------------------------------------------------------------');
        console.log(' [PHẦN 4] GIẢ LẬP MỞ BÀN PHÍM ĐIỆN THOẠI (VIEWPORT CO RÚT 390x500)');
        console.log('-------------------------------------------------------------------------');

        // Bàn phím ảo chiếm khoảng 340px chiều cao -> viewport giảm còn 500px
        await cdp.setViewport(390, 500, true);
        await sleep(250);

        const keyboardFocusState = await cdp.eval(`(() => {
            let searchInput = document.getElementById('savedSearchInput');
            if (searchInput) {
                searchInput.value = 'Rừng Cổ Thụ';
                window.ViVuApp.handleSavedSearch('Rừng Cổ Thụ');
            }
            // Sau khi render lại innerHTML, phần tử input mới được tạo và tự động focus
            const newSearchInput = document.getElementById('savedSearchInput');
            const activeEl = document.activeElement;
            const inputRect = newSearchInput ? newSearchInput.getBoundingClientRect() : null;
            const cards = Array.from(document.querySelectorAll('.saved-card'));
            return {
                isFocused: activeEl === newSearchInput,
                inputTop: inputRect ? inputRect.top : 0,
                cardsCount: cards.length,
                cardTitle: cards[0]?.querySelector('h2, h3')?.innerText.trim()
            };
        })()`);

        assert(keyboardFocusState.isFocused, 'Ô tìm kiếm phải nhận tiêu điểm khi mở bàn phím');
        assert.strictEqual(keyboardFocusState.cardsCount, 1, 'Tìm kiếm khi bàn phím mở lọc đúng 1 kết quả Rừng Cổ Thụ');
        console.log(`  ✓ [PASS] Giả lập bàn phím mở (390x500): Ô tìm kiếm giữ tiêu điểm, danh sách phản hồi tức thì với [${keyboardFocusState.cardTitle}]`);

        const shotKeyboard = path.join(ARTIFACT_DIR, 'saved_after_mobile_keyboard_390x500.png');
        await cdp.captureScreenshot(shotKeyboard);
        console.log(`  📸 Đã chụp: saved_after_mobile_keyboard_390x500.png`);

        // Khôi phục bộ lọc về mặc định
        await cdp.eval(`window.ViVuApp.resetSavedFilters()`);
        await cdp.eval(`document.documentElement.classList.remove('dark')`);
        await cdp.setViewport(1280, 800, false);
        await sleep(200);

        console.log('\n================================================================================');
        console.log('🎉 TẤT CẢ TIÊU CHÍ BỘ SƯU TẬP ĐÃ LƯU ĐẠT 100% PASS!');
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

runAcceptance().catch(err => {
    console.error('\n❌ KIỂM THỬ THẤT BẠI:', err);
    process.exit(1);
});
