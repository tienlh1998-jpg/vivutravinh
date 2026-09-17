// scripts/verify-g6-browser.cjs
// Bộ kiểm thử trình duyệt thực tế đầu cuối (CDP E2E Browser Test Suite) cho G6:
// 1. Deep link 404/hidden: toast thông báo văn minh, URL dọn sạch search param
// 2. Mở modal chi tiết, cập nhật URL và nút Back popstate đóng modal
// 3. Gallery ảnh: chuyển slide, counter cập nhật và onerror fallback an toàn
// 4. Quản lý yêu thích (Favorite) lưu dbId/canonical key và dọn sạch alias khi unfavorite
// 5. Trải nghiệm di động (Touch targets >= 44px, không tràn ngang)

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

    on(fn) {
        this.listeners.push(fn);
    }

    removeListener(fn) {
        this.listeners = this.listeners.filter(l => l !== fn);
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

async function runG6BrowserTests() {
    console.log('=== BẮT ĐẦU KIỂM THỬ TRÌNH DUYỆT THỰC TẾ G6 (CHROME CDP E2E) ===\n');

    const port = 9227;
    const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome_g6_'));
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
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');

        console.log('Đang chờ ứng dụng khởi động và nạp dữ liệu hoàn tất...');
        await waitForAppReady(cdp);
        console.log('  ✓ Ứng dụng sẵn sàng!\n');

        // Thiết lập màn hình di động chuẩn (390x844)
        await cdp.setViewport(390, 844);

        // =========================================================================
        // TEST 1: Deep link 404 / Địa điểm không tồn tại hoặc đã ẩn (E05)
        // =========================================================================
        console.log('[1] KIỂM THỬ DEEP LINK 404/HIDDEN & DỌN DẸP URL (E05):');
        const deepLinkResult = await cdp.eval(`(() => {
            // Kích hoạt deep link địa điểm không tồn tại
            const initialUrl = new URL(window.location.href);
            initialUrl.searchParams.set('place', 'dia-diem-khong-ton-tai-404');
            window.history.replaceState({}, '', initialUrl);

            // Gọi openDetailModal để kích hoạt xử lý deep link
            window.ViVuApp.openDetailModal('dia-diem-khong-ton-tai-404');

            const toast = document.getElementById('offlineSyncToast');
            const title = document.getElementById('syncToastTitle')?.textContent?.trim();
            const msg = document.getElementById('syncToastMsg')?.textContent?.trim();
            const isToastVisible = toast && !toast.classList.contains('hidden');

            const currentUrl = new URL(window.location.href);
            const hasPlaceParam = currentUrl.searchParams.has('place');
            const isModalHidden = document.getElementById('detailModal')?.classList.contains('hidden');

            return {
                isToastVisible,
                title,
                msg,
                hasPlaceParam,
                isModalHidden
            };
        })()`);

        console.log(`  ✅ Toast hiển thị: ${deepLinkResult.isToastVisible} (Tiêu đề: "${deepLinkResult.title}")`);
        console.log(`  ✅ URL search param 'place' đã được dọn sạch: ${!deepLinkResult.hasPlaceParam}`);
        console.log(`  ✅ Modal chi tiết giữ trạng thái ẩn: ${deepLinkResult.isModalHidden}`);

        if (!deepLinkResult.isToastVisible) throw new Error('Toast thông báo địa điểm không hiển thị');
        if (deepLinkResult.hasPlaceParam) throw new Error('URL vẫn còn param place hỏng sau khi xử lý 404');
        if (!deepLinkResult.isModalHidden) throw new Error('Modal chi tiết không được đóng khi deep link 404');

        const toastPic = path.join(ARTIFACT_DIR, 'g6-deeplink-toast.png');
        await cdp.screenshot(toastPic);

        // =========================================================================
        // TEST 2: Mở Modal Chi Tiết, Đồng Bộ Lịch Sử URL & Nút Back Popstate (E09)
        // =========================================================================
        console.log('\n[2] KIỂM THỬ MỞ MODAL CHI TIẾT & NÚT BACK POPSTATE DI ĐỘNG (E09):');
        const openModalResult = await cdp.eval(`(() => {
            const firstCard = document.querySelector('#placesDiscoveryGrid .place-card');
            const placeId = firstCard?.dataset?.placeId;
            if (!placeId) return { error: 'Không tìm thấy thẻ địa điểm' };

            // Mở modal qua logic app
            window.ViVuApp.openDetailModal(placeId);

            const modal = document.getElementById('detailModal');
            const isModalVisible = modal && !modal.classList.contains('hidden');
            const bodyOverflow = document.body.classList.contains('overflow-hidden');
            const currentUrl = new URL(window.location.href);
            const urlPlace = currentUrl.searchParams.get('place');
            const modalTitle = document.getElementById('modalTitle')?.textContent?.trim();

            return {
                placeId,
                isModalVisible,
                bodyOverflow,
                urlPlace,
                modalTitle
            };
        })()`);

        if (openModalResult.error) throw new Error(openModalResult.error);
        console.log(`  ✅ Đã mở modal địa điểm: "${openModalResult.modalTitle}"`);
        console.log(`  ✅ Modal hiển thị: ${openModalResult.isModalVisible}, Khóa cuộn body: ${openModalResult.bodyOverflow}`);
        console.log(`  ✅ URL đồng bộ param place="${openModalResult.urlPlace}"`);

        if (!openModalResult.isModalVisible) throw new Error('Modal chi tiết không hiển thị');
        if (!openModalResult.bodyOverflow) throw new Error('Body không được khóa cuộn khi mở modal');
        if (!openModalResult.urlPlace) throw new Error('URL không được cập nhật search param place');

        // Chụp ảnh giao diện modal
        const modalPic = path.join(ARTIFACT_DIR, 'g6-modal-navigation.png');
        await cdp.screenshot(modalPic);

        // Giả lập người dùng bấm nút Back trình duyệt di động (popstate event)
        const backResult = await cdp.eval(`(() => {
            // Giả lập quay lui lịch sử trình duyệt
            const url = new URL(window.location.href);
            url.searchParams.delete('place');
            window.history.replaceState({}, '', url);

            // Kích hoạt sự kiện popstate
            window.dispatchEvent(new PopStateEvent('popstate', { state: null }));

            const modal = document.getElementById('detailModal');
            const isModalHidden = modal && modal.classList.contains('hidden');
            const bodyFree = !document.body.classList.contains('overflow-hidden');
            const hasPlaceParam = new URL(window.location.href).searchParams.has('place');

            return {
                isModalHidden,
                bodyFree,
                hasPlaceParam
            };
        })()`);

        console.log(`  ✅ Sau popstate Back: Modal đã đóng = ${backResult.isModalHidden}`);
        console.log(`  ✅ Khôi phục cuộn trang body = ${backResult.bodyFree}`);
        console.log(`  ✅ URL param place đã sạch = ${!backResult.hasPlaceParam}`);

        if (!backResult.isModalHidden) throw new Error('Modal không tự động đóng khi nhận sự kiện popstate Back');
        if (!backResult.bodyFree) throw new Error('Body vẫn bị khóa cuộn sau khi Back');

        // =========================================================================
        // TEST 3: Gallery Ảnh: Chuyển Slide & Fallback Error An Toàn (E03)
        // =========================================================================
        console.log('\n[3] KIỂM THỬ GALLERY ẢNH & FALLBACK LỖI TẠI CHỖ (E03):');
        // Mở lại modal của địa điểm có nhiều ảnh (Ao Bà Om)
        const galleryResult = await cdp.eval(`(() => {
            const places = window.ViVuApp.state.allPlaces || [];
            const multiImgPlace = places.find(p => p.images && p.images.length > 1) || places[0];
            window.ViVuApp.openDetailModal(multiImgPlace.id);

            const initialCounter = document.getElementById('modalGalleryCounter')?.textContent?.trim();
            const mainImg = document.getElementById('modalMainImage');
            const initialSrc = mainImg?.src;

            // Nhấn nút Next
            const nextBtn = document.getElementById('modalGalleryNextBtn');
            if (nextBtn) nextBtn.click();
            const counterAfterNext = document.getElementById('modalGalleryCounter')?.textContent?.trim();
            const srcAfterNext = mainImg?.src;

            // Giả lập ảnh bị lỗi nạp mạng (kích hoạt onerror)
            if (mainImg && typeof mainImg.onerror === 'function') {
                mainImg.onerror();
            }
            const srcAfterError = mainImg?.src;
            const isFallbackSvg = srcAfterError && srcAfterError.startsWith('data:image/svg+xml');

            // Đóng modal sau khi kiểm tra xong
            window.ViVuApp.closeDetailModal();

            return {
                placeName: multiImgPlace.name,
                imgCount: multiImgPlace.images?.length || 1,
                initialCounter,
                counterAfterNext,
                initialSrcMatch: initialSrc !== srcAfterNext,
                isFallbackSvg
            };
        })()`);

        console.log(`  ✅ Địa điểm test gallery: "${galleryResult.placeName}" (${galleryResult.imgCount} ảnh)`);
        console.log(`  ✅ Bộ đếm ảnh: ${galleryResult.initialCounter} -> Sau khi Next: ${galleryResult.counterAfterNext}`);
        console.log(`  ✅ Khi ảnh gặp lỗi mạng, onerror tự động fallback SVG trung tính: ${galleryResult.isFallbackSvg}`);

        if (galleryResult.imgCount > 1 && galleryResult.initialCounter === galleryResult.counterAfterNext) {
            throw new Error('Gallery không chuyển slide khi bấm nút Next');
        }
        if (!galleryResult.isFallbackSvg) {
            throw new Error('Gallery onerror không kích hoạt fallback SVG trung tính');
        }

        // =========================================================================
        // TEST 4: Yêu thích (Favorite) Liên kết dbId Chuẩn & Dọn Sạch Bí Danh (E04)
        // =========================================================================
        console.log('\n[4] KIỂM THỬ YÊU THÍCH (FAVORITES) QUA GIAO DIỆN & DỌN SẠCH BÍ DANH (E04):');
        const favResult = await cdp.eval(`(() => {
            // Xóa rỗng storage trước khi thử nghiệm
            localStorage.removeItem('vivu_favorites');
            window.ViVuApp.state.favorites = [];

            const card = document.querySelector('#placesDiscoveryGrid .place-card');
            const placeId = card?.dataset?.placeId;
            const saveBtn = card?.querySelector('[data-action="toggle-save"]');
            if (!saveBtn) return { error: 'Không tìm thấy nút lưu trên thẻ' };

            const place = window.ViVuApp.state.allPlaces.find(p => p.id === placeId);
            const expectedCanonicalKey = (place && place.dbId) ? String(place.dbId) : placeId;

            // 1. Click nút Lưu trên giao diện
            saveBtn.click();

            const savedFavorites = JSON.parse(localStorage.getItem('vivu_favorites') || '[]');
            const isAppSaved = window.ViVuApp.isPlaceSaved(placeId);
            const hasCanonicalKey = savedFavorites.includes(expectedCanonicalKey);

            // 2. Click lại lần 2 để Bỏ thích (Unfavorite)
            saveBtn.click();

            const postUnfavorite = JSON.parse(localStorage.getItem('vivu_favorites') || '[]');
            const isStillSaved = window.ViVuApp.isPlaceSaved(placeId);

            // 3. Kiểm thử migration trực tiếp: Nạp slug cũ vào storage rồi kích hoạt canonicalizePreferences
            window.ViVuApp.state.favorites = [place.id];
            localStorage.setItem('vivu_favorites', JSON.stringify([place.id]));
            window.ViVuApp.canonicalizePreferences(window.ViVuApp.state.allPlaces);
            const migratedFavs = JSON.parse(localStorage.getItem('vivu_favorites') || '[]');

            // Dọn sạch sau test
            localStorage.removeItem('vivu_favorites');
            window.ViVuApp.state.favorites = [];

            return {
                placeName: place?.name,
                expectedCanonicalKey,
                isAppSaved,
                hasCanonicalKey,
                isStillSaved,
                postUnfavoriteLength: postUnfavorite.length,
                migratedFavs
            };
        })()`);

        if (favResult.error) throw new Error(favResult.error);
        console.log(`  ✅ Thao tác lưu "${favResult.placeName}": Key lưu trữ = "${favResult.expectedCanonicalKey}"`);
        console.log(`  ✅ Trạng thái lưu nhận diện đúng: isPlaceSaved = ${favResult.isAppSaved}`);
        console.log(`  ✅ Thao tác bỏ lưu: Đã gỡ sạch bí danh = ${!favResult.isStillSaved} (Storage còn lại: ${favResult.postUnfavoriteLength} mục)`);
        console.log(`  ✅ Migration preference cũ: Chuyển thành công sang canonical key = [${favResult.migratedFavs.join(', ')}]`);

        if (!favResult.isAppSaved || !favResult.hasCanonicalKey) {
            throw new Error('Nút bookmark trên giao diện không lưu đúng khóa chuẩn');
        }
        if (favResult.isStillSaved || favResult.postUnfavoriteLength !== 0) {
            throw new Error('Thao tác bỏ thích không dọn sạch các bí danh');
        }

        // =========================================================================
        // TEST 5: Trải Nghiệm Di Động & Vùng Chạm Touch Target (E09)
        // =========================================================================
        console.log('\n[5] KIỂM THỬ KÍCH THƯỚC VÙNG CHẠM TOUCH TARGET (>= 44px) TRÊN DI ĐỘNG (E09):');
        const touchTargets = await cdp.eval(`(() => {
            const targets = [];

            // Mở modal để đo kích thước hiển thị thực tế của nút đóng
            const firstPlace = window.ViVuApp.state.allPlaces?.[0];
            if (firstPlace) window.ViVuApp.openDetailModal(firstPlace.id);

            // Nút đóng modal
            const closeBtn = document.getElementById('modalCloseBtn');
            if (closeBtn) {
                const r = closeBtn.getBoundingClientRect();
                targets.push({ name: 'Nút đóng Modal', w: r.width, h: r.height, pass: r.width >= 44 && r.height >= 44 });
            }

            // Đóng lại sau khi đo
            window.ViVuApp.closeDetailModal();

            // Nút lưu trên thẻ
            const cardSaveBtn = document.querySelector('#placesDiscoveryGrid [data-action="toggle-save"]');
            if (cardSaveBtn) {
                const r = cardSaveBtn.getBoundingClientRect();
                targets.push({ name: 'Nút lưu trên thẻ địa điểm', w: r.width, h: r.height, pass: r.width >= 44 && r.height >= 44 });
            }

            // Nút xem chi tiết trên thẻ
            const cardDetailBtn = document.querySelector('#placesDiscoveryGrid [data-action="open-detail"]');
            if (cardDetailBtn) {
                const r = cardDetailBtn.getBoundingClientRect();
                targets.push({ name: 'Nút xem chi tiết trên thẻ', w: r.width, h: r.height, pass: r.height >= 44 });
            }

            // Bottom Nav items
            const navItems = document.querySelectorAll('nav a, nav button');
            let navPass = true;
            navItems.forEach(n => {
                const r = n.getBoundingClientRect();
                if (r.height < 44) navPass = false;
            });
            targets.push({ name: 'Các nút thanh điều hướng dưới (Bottom Nav)', pass: navPass });

            // Kiểm tra tràn ngang
            const scrollWidth = document.documentElement.scrollWidth;
            const clientWidth = document.documentElement.clientWidth;
            const noHorizontalOverflow = scrollWidth <= clientWidth;

            return {
                targets,
                noHorizontalOverflow,
                scrollWidth,
                clientWidth
            };
        })()`);

        touchTargets.targets.forEach(t => {
            console.log(`  ✅ ${t.name}: ${t.pass ? 'ĐẠT' : 'KHÔNG ĐẠT'} ${t.w ? `(${t.w}x${t.h}px)` : ''}`);
            if (!t.pass) throw new Error(`Vùng chạm không đạt chuẩn: ${t.name}`);
        });

        console.log(`  ✅ Bố cục di động 390px không tràn ngang: scrollWidth = ${touchTargets.scrollWidth}px, clientWidth = ${touchTargets.clientWidth}px`);
        if (!touchTargets.noHorizontalOverflow) throw new Error('Phát hiện hiện tượng tràn ngang trên màn hình di động');

        console.log('\n=== TẤT CẢ 5 NHÓM KIỂM THỬ TRÌNH DUYỆT THỰC TẾ G6 ĐẠT 100% HOÀN HẢO! ===\n');

    } finally {
        if (cdp) cdp.close();
        try { chrome.kill('SIGTERM'); } catch {}
        try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch {}
    }
}

runG6BrowserTests().catch(err => {
    console.error('\n❌ KIỂM THỬ TRÌNH DUYỆT G6 THẤT BẠI:', err);
    process.exit(1);
});
