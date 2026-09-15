// scripts/verify-g2-browser.cjs - Kiểm thử trình duyệt thực tế cho G2: Tìm kiếm, Bộ lọc giá, Vừa xem, Empty state
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
    for (let i = 0; i < 25; i++) {
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
        const res = await this.send('Page.captureScreenshot', { format: 'png' });
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

async function runG2BrowserTests() {
    console.log('--- BẮT ĐẦU KIỂM THỬ TRÌNH DUYỆT G2 (CHROME CDP) ---');

    const port = 9226;
    const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome_g2_'));
    const chrome = spawn('google-chrome', [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        `--user-data-dir=${tmpProfile}`,
        `--remote-debugging-port=${port}`,
        'http://localhost:8000/?source=mock'
    ]);

    try {
        const wsUrl = await getDebuggerUrl(port);
        const cdp = new CDPClient(wsUrl);
        await cdp.ready();

        console.log('Đang chờ ứng dụng khởi động và nạp xong dữ liệu...');
        await waitForAppReady(cdp);
        console.log('  ✓ Ứng dụng đã sẵn sàng!');

        // Thiết lập màn hình di động chuẩn (390x844)
        await cdp.setViewport(390, 844);

        // 1. Kiểm thử tìm kiếm không dấu "bun nuoc leo"
        console.log('\n[1] KIỂM THỬ TÌM KIẾM TIẾNG VIỆT KHÔNG DẤU TRÊN GIAO DIỆN:');
        const searchResult = await cdp.eval(`(() => {
            const input = document.getElementById('discoverySearchInput');
            input.value = 'bun nuoc leo';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            const cards = Array.from(document.querySelectorAll('#placesDiscoveryGrid .place-card'));
            const titles = cards.map(c => c.querySelector('h3')?.textContent?.trim());
            return {
                cardCount: cards.length,
                titles,
                hasInvalidTitle: titles.some(t => !t || t.length === 0),
                hasBunNuocLeo: titles.some(t => t && t.includes('Bún Nước Lèo'))
            };
        })()`);
        console.log(`  ✅ Kết quả tìm "bun nuoc leo": ${searchResult.cardCount} thẻ (${searchResult.titles.join(', ')})`);
        if (searchResult.hasInvalidTitle) throw new Error('Phát hiện title thẻ bị undefined hoặc rỗng');
        if (searchResult.cardCount !== 1) throw new Error(`Số lượng thẻ tìm kiếm không khớp: kỳ vọng 1 thẻ, thực tế có ${searchResult.cardCount} thẻ`);
        if (!searchResult.hasBunNuocLeo) throw new Error('Không tìm thấy Bún Nước Lèo bằng từ khóa không dấu');

        const searchPic = path.join(ARTIFACT_DIR, 'g2-search-unaccented.png');
        await cdp.screenshot(searchPic);
        console.log(`  📸 Đã chụp: ${searchPic}`);

        // 2. Kiểm thử bộ lọc "Dưới 50k"
        console.log('\n[2] KIỂM THỬ BỘ LỌC GIÁ "DƯỚI 50K":');
        const priceFilterResult = await cdp.eval(`(() => {
            // Xóa ô tìm kiếm
            const input = document.getElementById('discoverySearchInput');
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));

            // Chọn option "under50" trong priceFilterSelect
            const select = document.getElementById('priceFilterSelect');
            select.value = 'under50';
            select.dispatchEvent(new Event('change', { bubbles: true }));

            const cards = Array.from(document.querySelectorAll('#placesDiscoveryGrid .place-card'));
            const countEl = document.getElementById('resultsCountLabel');
            const titles = cards.map(c => c.querySelector('h3')?.textContent?.trim());
            return {
                cardCount: cards.length,
                countText: countEl?.textContent?.trim(),
                titles,
                hasInvalidTitle: titles.some(t => !t || t.length === 0),
                hasUnder50Place: titles.some(t => t && t.includes('Bún Nước Lèo')),
                hasResort: titles.some(t => t && t.includes('Resort'))
            };
        })()`);
        console.log(`  ✅ Lọc Dưới 50k: ${priceFilterResult.cardCount} địa điểm (${priceFilterResult.countText})`);
        console.log(`  ✅ Có quán bún nước lèo: ${priceFilterResult.hasUnder50Place}, Không chứa resort: ${!priceFilterResult.hasResort}`);
        if (priceFilterResult.hasInvalidTitle) throw new Error('Phát hiện title thẻ bị undefined hoặc rỗng trong bộ lọc giá');
        if (priceFilterResult.cardCount !== 2) throw new Error(`Số lượng thẻ lọc dưới 50k không khớp: kỳ vọng 2 thẻ, thực tế có ${priceFilterResult.cardCount} thẻ`);
        if (!priceFilterResult.hasUnder50Place || priceFilterResult.hasResort) {
            throw new Error('Bộ lọc Dưới 50k chưa chuẩn xác');
        }

        const pricePic = path.join(ARTIFACT_DIR, 'g2-filter-under50.png');
        await cdp.screenshot(pricePic);
        console.log(`  📸 Đã chụp: ${pricePic}`);

        // 3. Kiểm thử luồng "Vừa xem" (Recently Viewed)
        console.log('\n[3] KIỂM THỬ TÍNH NĂNG "VỪA XEM" (RECENTLY VIEWED):');
        const recentResult = await cdp.eval(`(() => {
            try {
                // Reset bộ lọc
                window.ViVuApp.resetAllFilters();

                // Mở modal địa điểm đầu tiên qua API hoặc click
                const firstCard = document.querySelector('#placesDiscoveryGrid .place-card');
                const placeId = firstCard?.getAttribute('data-place-id');
                const placeTitle = firstCard?.querySelector('h3')?.textContent?.trim();

                if (placeId) {
                    window.ViVuApp.openDetailModal(placeId);
                }

                return {
                    placeId,
                    placeTitle,
                    storedRecent: localStorage.getItem('vivu_recent'),
                    modalOpen: !document.getElementById('detailModal')?.classList.contains('hidden')
                };
            } catch (err) {
                return { error: String(err), stack: err.stack };
            }
        })()`);
        await sleep(500);

        // Đóng modal
        await cdp.eval(`(() => {
            window.ViVuApp.closeDetailModal();
        })()`);
        await sleep(300);

        // Bấm vào tab "Vừa xem"
        const recentTabResult = await cdp.eval(`(() => {
            const recentTab = document.querySelector('[data-category="recent"]');
            if (recentTab) recentTab.click();

            const banner = document.getElementById('recentActiveBanner');
            const cards = Array.from(document.querySelectorAll('#placesDiscoveryGrid .place-card'));
            const titles = cards.map(c => c.querySelector('h3')?.textContent?.trim());
            return {
                bannerVisible: banner ? !banner.classList.contains('hidden') : false,
                cardsCount: cards.length,
                titles,
                hasInvalidTitle: titles.some(t => !t || t.length === 0)
            };
        })()`);
        console.log(`  ✅ Tab Vừa xem: bannerVisible=${recentTabResult.bannerVisible}, cardsCount=${recentTabResult.cardsCount}`);
        console.log(`  ✅ Danh sách vừa xem: ${recentTabResult.titles.join(', ')}`);
        if (recentTabResult.hasInvalidTitle) throw new Error('Phát hiện title thẻ bị undefined hoặc rỗng trong Vừa xem');
        if (!recentTabResult.bannerVisible) throw new Error('Banner Vừa xem không hiển thị');
        if (recentTabResult.cardsCount !== 1) throw new Error(`Số lượng thẻ vừa xem không khớp: kỳ vọng 1 thẻ, thực tế có ${recentTabResult.cardsCount} thẻ`);

        const recentPic = path.join(ARTIFACT_DIR, 'g2-recently-viewed.png');
        await cdp.screenshot(recentPic);
        console.log(`  📸 Đã chụp: ${recentPic}`);

        // 4. Kiểm thử Empty State khi không tìm thấy kết quả và nút "Xóa bộ lọc"
        console.log('\n[4] KIỂM THỬ TRẠNG THÁI RỖNG (EMPTY STATE) & NÚT XÓA BỘ LỌC:');
        const emptyResult = await cdp.eval(`(() => {
            const input = document.getElementById('discoverySearchInput');
            input.value = 'dia_diem_hoan_toan_khong_ton_tai_xyz_123';
            input.dispatchEvent(new Event('input', { bubbles: true }));

            const emptyContainer = document.querySelector('#placesDiscoveryGrid .text-center');
            const emptyText = emptyContainer?.textContent || '';
            const resetBtn = document.getElementById('btnResetAllFilters');

            return {
                hasZeroMatch: emptyText.includes('0 địa điểm phù hợp') || emptyText.includes('Không tìm thấy địa điểm'),
                hasResetBtn: Boolean(resetBtn)
            };
        })()`);
        console.log(`  ✅ Thông báo rỗng chuẩn: ${emptyResult.hasZeroMatch}, có nút Reset: ${emptyResult.hasResetBtn}`);
        if (!emptyResult.hasZeroMatch || !emptyResult.hasResetBtn) {
            throw new Error('Empty state không đúng chuẩn yêu cầu');
        }

        const emptyPic = path.join(ARTIFACT_DIR, 'g2-empty-state.png');
        await cdp.screenshot(emptyPic);
        console.log(`  📸 Đã chụp: ${emptyPic}`);

        // Thử click nút Xóa bộ lọc
        const afterResetResult = await cdp.eval(`(() => {
            const resetBtn = document.getElementById('btnResetAllFilters');
            if (resetBtn) resetBtn.click();
            const cards = Array.from(document.querySelectorAll('#placesDiscoveryGrid .place-card'));
            const titles = cards.map(c => c.querySelector('h3')?.textContent?.trim());
            return {
                cardsCount: cards.length,
                titles,
                hasInvalidTitle: titles.some(t => !t || t.length === 0)
            };
        })()`);
        console.log(`  ✅ Sau khi bấm "Xóa bộ lọc & Xem tất cả": phục hồi ${afterResetResult.cardsCount} địa điểm.`);
        if (afterResetResult.hasInvalidTitle) throw new Error('Phát hiện title thẻ bị undefined hoặc rỗng sau khi reset');
        if (afterResetResult.cardsCount !== 10) throw new Error(`Số lượng địa điểm sau reset không khớp: kỳ vọng 10 thẻ fixture, thực tế có ${afterResetResult.cardsCount} thẻ`);

        console.log('\n--- TẤT CẢ KIỂM THỬ TRÌNH DUYỆT G2 ĐẠT 100% THÀNH CÔNG ---');
        cdp.close();
    } finally {
        chrome.kill('SIGKILL');
        try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch {}
    }
}

runG2BrowserTests().catch(err => {
    console.error('❌ Kiểm thử thất bại:', err);
    process.exit(1);
});
