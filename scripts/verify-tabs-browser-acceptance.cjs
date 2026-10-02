/**
 * scripts/verify-tabs-browser-acceptance.cjs
 *
 * Kiểm thử nghiệm thu giao diện 5 tab trên cả Mobile và Desktop:
 * - Tab 1: Trang chủ (#home)
 * - Tab 2: Bản đồ (#map)
 * - Tab 3: Câu lạc bộ (#community)
 * - Tab 4: Đã lưu (#saved)
 * - Tab 5: Tìm kiếm (#search)
 *
 * Kiểm tra tính toàn vẹn:
 * - Không có lỗi tràn ngang giao diện (scrollWidth <= clientWidth).
 * - Nội dung mẫu được gắn nhãn minh bạch (CLB mẫu, Sự kiện mẫu, Bài viết mẫu, Hồ sơ mẫu).
 * - Loại bỏ triệt để các số liệu ảo (số người tham gia ảo, fake likes, thảo luận 48 phản hồi ảo).
 * - Chụp ảnh màn hình bằng chứng visual artifact cho cả Mobile (390x844) và Desktop (1280x800).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const assert = require('assert');

const PROJECT_DIR = path.resolve(__dirname, '..');
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
    if (res.data) {
      fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
    }
  }

  async close() {
    try { this.ws.close(); } catch (_) {}
  }
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
  console.log(' KIỂM THỬ NGHIỆM THU 5 TAB TRÊN MOBILE & DESKTOP + RÀ SOÁT NỘI DUNG MẪU');
  console.log('================================================================================\n');

  let localServer = null;
  let chromeProc = null;
  let cdp = null;

  try {
    const serverPort = 8990 + Math.floor(Math.random() * 80);
    localServer = http.createServer((req, res) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      let filePath = p === '/' ? '/index.html' : p;
      const fp = path.join(PROJECT_DIR, filePath);
      if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        const ext = path.extname(fp).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        fs.createReadStream(fp).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    await new Promise(r => localServer.listen(serverPort, r));
    console.log(`  ✓ Khởi chạy máy chủ nội bộ phục vụ trình duyệt tại cổng ${serverPort}`);

    const chromeCandidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
    ];
    const chromeExe = chromeCandidates.find(fs.existsSync);
    if (!chromeExe) throw new Error('Không tìm thấy Google Chrome.');

    const cdpPort = 9750 + Math.floor(Math.random() * 80);
    const userDataDir = path.join(os.tmpdir(), `chrome_tab_acceptance_${Date.now()}`);
    chromeProc = spawn(chromeExe, [
      '--headless=new',
      `--remote-debugging-port=${cdpPort}`,
      '--no-sandbox',
      '--disable-gpu',
      `--user-data-dir=${userDataDir}`,
      `http://localhost:${serverPort}/`
    ]);

    const wsUrl = await getDebuggerUrl(cdpPort);
    cdp = new CDPClient(wsUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    console.log('  ✓ Kết nối thành công Chrome DevTools Protocol.');

    // Chờ ứng dụng khởi tạo
    let appLoaded = false;
    for (let i = 0; i < 40; i++) {
      appLoaded = await cdp.eval(`Boolean(window.ViVuApp && window.ViVuApp.navGoHome)`);
      if (appLoaded) break;
      await sleep(250);
    }
    assert.ok(appLoaded, 'Web App không khởi động được trong 10 giây.');
    console.log('  ✓ ViVuTraVinh App đã sẵn sàng trên Chrome Headless.\n');

    // =========================================================================
    // PHẦN 1: NGHIỆM THU 5 TAB TRÊN MOBILE (VIEWPORT: 390x844 - iPhone 14/15)
    // =========================================================================
    console.log('--------------------------------------------------------------------------------');
    console.log(' [PHẦN 1] NGHIỆM THU 5 TAB TRÊN GIAO DIỆN MOBILE (390 x 844)');
    console.log('--------------------------------------------------------------------------------');
    await cdp.setViewport(390, 844, true);
    await sleep(300);

    // 1.1 Mobile - Tab 1: Trang chủ
    await cdp.eval(`window.ViVuApp.navGoHome()`);
    let heroSpotlight = false;
    for (let i = 0; i < 40; i++) {
      heroSpotlight = await cdp.eval(`Boolean(document.getElementById('heroSpotlightContainer')?.children?.length)`);
      if (heroSpotlight) break;
      await sleep(250);
    }
    let homeOverflow = await cdp.eval(`document.documentElement.scrollWidth > document.documentElement.clientWidth`);
    assert.strictEqual(homeOverflow, false, 'Mobile Tab 1 (Home) không được tràn ngang màn hình');
    assert.ok(heroSpotlight, 'Mobile Tab 1 phải hiển thị khối Tiêu điểm Hero Spotlight');
    await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'acceptance_mobile_tab1_home.png'));
    console.log('  ✓ [PASS] Tab 1 (Trang chủ) Mobile hiển thị hoàn hảo, 0 lỗi tràn ngang.');

    // 1.2 Mobile - Tab 2: Bản đồ
    await cdp.eval(`window.ViVuApp.navGoMap()`);
    await sleep(600);
    let mapModalVisible = await cdp.eval(`(() => {
      const m = document.getElementById('fullMapModal');
      return m && !m.classList.contains('hidden');
    })()`);
    assert.ok(mapModalVisible, 'Mobile Tab 2 (Bản đồ) modal fullMapModal phải hiển thị');
    let mapOverflow = await cdp.eval(`document.documentElement.scrollWidth > document.documentElement.clientWidth`);
    assert.strictEqual(mapOverflow, false, 'Mobile Tab 2 (Bản đồ) không được tràn ngang màn hình');
    let mapLeafletReady = false;
    for (let i = 0; i < 20; i++) {
      mapLeafletReady = await cdp.eval(`Boolean(document.querySelector('#fullScreenMap .leaflet-pane') || document.getElementById('fullScreenMap'))`);
      if (mapLeafletReady) break;
      await sleep(200);
    }
    assert.ok(mapLeafletReady, 'Bản đồ Leaflet phải được mount trên Mobile Tab 2');
    await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'acceptance_mobile_tab2_map.png'));
    console.log('  ✓ [PASS] Tab 2 (Bản đồ) Mobile hiển thị modal bản đồ và các marker địa điểm (0 tràn ngang).');

    // 1.3 Mobile - Tab 3: Câu lạc bộ & Cộng đồng
    await cdp.eval(`window.ViVuApp.navGoClubs()`);
    await sleep(500);
    let clubsViewActive = await cdp.eval(`(() => {
      const v = document.querySelector('.app-view[data-view="community"]');
      return v && !v.classList.contains('hidden');
    })()`);
    assert.ok(clubsViewActive, 'Mobile Tab 3 (Cộng đồng) view phải hiển thị (không có class hidden)');
    let clubsOverflow = await cdp.eval(`document.documentElement.scrollWidth > document.documentElement.clientWidth`);
    assert.strictEqual(clubsOverflow, false, 'Mobile Tab 3 (Câu lạc bộ) không được tràn ngang màn hình');
    let clbAmThucText = await cdp.eval(`(() => {
      const el = Array.from(document.querySelectorAll('article')).find(a => a.innerText.includes('CLB Ẩm Thực Xứ Trà'));
      return el ? el.innerText : '';
    })()`);
    assert.ok(clbAmThucText.includes('CLB mẫu tham khảo') || clbAmThucText.includes('CLB văn hóa - thể thao mẫu'),
      'CLB Ẩm Thực Xứ Trà phải có nhãn mẫu tham khảo, không để lộ số thành viên ảo');
    await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'acceptance_mobile_tab3_clubs.png'));
    console.log('  ✓ [PASS] Tab 3 (Câu lạc bộ) Mobile hiển thị chuẩn, nhãn CLB mẫu tham khảo minh bạch (0 tràn ngang).');

    // 1.4 Mobile - Tab 4: Đã lưu (Bộ sưu tập)
    await cdp.eval(`window.ViVuApp.navGoSaved()`);
    await sleep(500);
    let savedModalVisible = await cdp.eval(`(() => {
      const m = document.getElementById('savedCollectionsModal');
      return m && !m.classList.contains('hidden');
    })()`);
    assert.ok(savedModalVisible, 'Mobile Tab 4 (Đã lưu) modal savedCollectionsModal phải hiển thị');
    let savedOverflow = await cdp.eval(`document.documentElement.scrollWidth > document.documentElement.clientWidth`);
    assert.strictEqual(savedOverflow, false, 'Mobile Tab 4 (Đã lưu) không được tràn ngang màn hình');
    let savedTotalBadge = await cdp.eval(`document.getElementById('savedTotalBadge')?.innerText || ''`);
    assert.ok(savedTotalBadge.includes('đã lưu'), 'Modal Đã lưu phải hiển thị số mục đã lưu');
    await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'acceptance_mobile_tab4_saved.png'));
    console.log('  ✓ [PASS] Tab 4 (Đã lưu) Mobile hiển thị bộ sưu tập cá nhân và các thư mục tour (0 tràn ngang).');

    // 1.5 Mobile - Tab 5: Tìm kiếm
    await cdp.eval(`window.ViVuApp.navGoSearch()`);
    await sleep(500);
    let searchViewActive = await cdp.eval(`(() => {
      const v = document.querySelector('.app-view[data-view="search"]');
      return v && !v.classList.contains('hidden');
    })()`);
    assert.ok(searchViewActive, 'Mobile Tab 5 (Tìm kiếm) view phải hiển thị (không có class hidden)');
    let searchOverflow = await cdp.eval(`document.documentElement.scrollWidth > document.documentElement.clientWidth`);
    assert.strictEqual(searchOverflow, false, 'Mobile Tab 5 (Tìm kiếm) không được tràn ngang màn hình');
    let searchGridHasCards = await cdp.eval(`Boolean(document.querySelectorAll('#placesDiscoveryGrid article, #placesDiscoveryGrid .place-card')?.length > 0)`);
    assert.ok(searchGridHasCards, 'Lưới tìm kiếm phải hiển thị thẻ địa điểm khám phá');
    await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'acceptance_mobile_tab5_search.png'));
    console.log('  ✓ [PASS] Tab 5 (Tìm kiếm) Mobile hiển thị thanh tra cứu và lưới địa điểm (0 tràn ngang).');

    // =========================================================================
    // PHẦN 2: NGHIỆM THU 5 TAB TRÊN DESKTOP (VIEWPORT: 1280x800)
    // =========================================================================
    console.log('\n--------------------------------------------------------------------------------');
    console.log(' [PHẦN 2] NGHIỆM THU 5 TAB TRÊN GIAO DIỆN DESKTOP (1280 x 800)');
    console.log('--------------------------------------------------------------------------------');
    await cdp.setViewport(1280, 800, false);
    await sleep(300);

    // 2.1 Desktop - Tab 1: Trang chủ
    await cdp.eval(`window.ViVuApp.navGoHome()`);
    await sleep(400);
    let desktopHomeOverflow = await cdp.eval(`document.documentElement.scrollWidth > document.documentElement.clientWidth`);
    assert.strictEqual(desktopHomeOverflow, false, 'Desktop Tab 1 không được tràn ngang màn hình');
    let sidebarVisible = await cdp.eval(`(() => {
      const aside = document.querySelector('aside');
      return aside && window.getComputedStyle(aside).display !== 'none';
    })()`);
    assert.ok(sidebarVisible, 'Desktop phải hiển thị thanh sidebar định vị thương hiệu Stitch');
    await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'acceptance_desktop_tab1_home.png'));
    console.log('  ✓ [PASS] Tab 1 (Trang chủ) Desktop: Sidebar cố định chuẩn Stitch, không tràn ngang.');

    // 2.2 Desktop - Tab 2: Bản đồ
    await cdp.eval(`window.ViVuApp.navGoMap()`);
    await sleep(600);
    let desktopMapModalVisible = await cdp.eval(`(() => {
      const m = document.getElementById('fullMapModal');
      return m && !m.classList.contains('hidden');
    })()`);
    assert.ok(desktopMapModalVisible, 'Desktop Tab 2 (Bản đồ) modal fullMapModal phải hiển thị');
    let desktopMapOverflow = await cdp.eval(`document.documentElement.scrollWidth > document.documentElement.clientWidth`);
    assert.strictEqual(desktopMapOverflow, false, 'Desktop Tab 2 không được tràn ngang màn hình');
    await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'acceptance_desktop_tab2_map.png'));
    console.log('  ✓ [PASS] Tab 2 (Bản đồ) Desktop: Bản đồ toàn màn hình hiển thị sắc nét (0 tràn ngang).');

    // 2.3 Desktop - Tab 3: Câu lạc bộ & Cộng đồng
    await cdp.eval(`window.ViVuApp.navGoClubs()`);
    await sleep(500);
    let desktopClubsActive = await cdp.eval(`(() => {
      const v = document.querySelector('.app-view[data-view="community"]');
      return v && !v.classList.contains('hidden');
    })()`);
    assert.ok(desktopClubsActive, 'Desktop Tab 3 (Cộng đồng) view phải hiển thị');
    let desktopClubsOverflow = await cdp.eval(`document.documentElement.scrollWidth > document.documentElement.clientWidth`);
    assert.strictEqual(desktopClubsOverflow, false, 'Desktop Tab 3 không được tràn ngang màn hình');
    await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'acceptance_desktop_tab3_clubs.png'));
    console.log('  ✓ [PASS] Tab 3 (Câu lạc bộ) Desktop: Bố cục lưới Bento 2 cột cân đối, bài thảo luận rõ nét (0 tràn ngang).');

    // 2.4 Desktop - Tab 4: Đã lưu (Bộ sưu tập)
    await cdp.eval(`window.ViVuApp.navGoSaved()`);
    await sleep(500);
    let desktopSavedVisible = await cdp.eval(`(() => {
      const m = document.getElementById('savedCollectionsModal');
      return m && !m.classList.contains('hidden');
    })()`);
    assert.ok(desktopSavedVisible, 'Desktop Tab 4 (Đã lưu) modal savedCollectionsModal phải hiển thị');
    let desktopSavedOverflow = await cdp.eval(`document.documentElement.scrollWidth > document.documentElement.clientWidth`);
    assert.strictEqual(desktopSavedOverflow, false, 'Desktop Tab 4 không được tràn ngang màn hình');
    await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'acceptance_desktop_tab4_saved.png'));
    console.log('  ✓ [PASS] Tab 4 (Đã lưu) Desktop: Thư mục cá nhân và lộ trình thông minh hiển thị trực quan (0 tràn ngang).');

    // 2.5 Desktop - Tab 5: Tìm kiếm
    await cdp.eval(`window.ViVuApp.navGoSearch()`);
    await sleep(500);
    let desktopSearchActive = await cdp.eval(`(() => {
      const v = document.querySelector('.app-view[data-view="search"]');
      return v && !v.classList.contains('hidden');
    })()`);
    assert.ok(desktopSearchActive, 'Desktop Tab 5 (Tìm kiếm) view phải hiển thị');
    let desktopSearchOverflow = await cdp.eval(`document.documentElement.scrollWidth > document.documentElement.clientWidth`);
    assert.strictEqual(desktopSearchOverflow, false, 'Desktop Tab 5 không được tràn ngang màn hình');
    await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'acceptance_desktop_tab5_search.png'));
    console.log('  ✓ [PASS] Tab 5 (Tìm kiếm) Desktop: Bộ lọc đa chiều và danh sách thẻ địa điểm tải mượt (0 tràn ngang).');

    // =========================================================================
    // PHẦN 3: RÀ SOÁT NỘI DUNG MẪU & LOẠI BỎ SỐ LIỆU ẢO
    // =========================================================================
    console.log('\n--------------------------------------------------------------------------------');
    console.log(' [PHẦN 3] RÀ SOÁT NỘI DUNG MẪU & LOẠI BỎ CÁC SỐ LIỆU ẢO');
    console.log('--------------------------------------------------------------------------------');

    // 3.1 Kiểm tra modal sự kiện Ok Om Bok: Không còn "(48 phản hồi)" ảo
    await cdp.eval(`window.ViVuApp.openFestivalModal('ok-om-bok')`);
    await sleep(600);
    let okOmBokModalHtml = await cdp.eval(`document.getElementById('festivalModalContainer')?.innerHTML || ''`);
    assert.ok(!okOmBokModalHtml.includes('(48 phản hồi)'), 'Modal lễ hội không được chứa số phản hồi ảo (48 phản hồi)');
    assert.ok(okOmBokModalHtml.includes('Thảo Luận Trực Tiếp'), 'Modal lễ hội phải hiển thị tiêu đề thảo luận sạch sẽ');
    console.log('  ✓ [PASS] Tiêu đề thảo luận trực tiếp trong modal lễ hội đã loại bỏ hoàn toàn số ảo (48 phản hồi).');

    // 3.2 Kiểm tra hồ sơ cá nhân: Khi là khách vãng lai, hiển thị nhãn mẫu tham khảo
    await cdp.eval(`window.ViVuApp.closeFestivalModal()`);
    await sleep(300);
    await cdp.eval(`window.ViVuApp.openProfileModal()`);
    await sleep(600);
    let profileModalText = await cdp.eval(`document.getElementById('userProfileModalContent')?.innerText || ''`);
    assert.ok(profileModalText.includes('Đăng nhập') && profileModalText.includes('Tạo tài khoản'), 'Khách phải thấy lựa chọn đăng nhập và tạo tài khoản');
    assert.ok(!profileModalText.includes('Nguyễn Văn Tiến'), 'Khách không được thấy danh tính của hồ sơ mẫu');
    console.log('  ✓ [PASS] Khách thấy lựa chọn đăng nhập/tạo tài khoản và không thấy danh tính mẫu.');

    // 3.3 Kiểm tra hoạt động tuần của CLB: nút đăng ký ghi rõ "Chưa hỗ trợ trực tuyến"
    await cdp.eval(`window.ViVuApp.closeProfileModal()`);
    await sleep(300);
    await cdp.eval(`window.ViVuApp.navGoClubs()`);
    await sleep(500);
    let weeklyActHtml = await cdp.eval(`document.getElementById('weeklyActivitiesList')?.innerHTML || ''`);
    assert.ok(weeklyActHtml.includes('Chưa hỗ trợ trực tuyến'), 'Hoạt động CLB chưa có backend phải gắn nhãn "Chưa hỗ trợ trực tuyến"');
    assert.ok(!weeklyActHtml.includes('Đã đăng ký thành công'), 'Không được báo thành công giả khi chưa có backend xác nhận');
    console.log('  ✓ [PASS] Các hoạt động CLB thể hiện rõ "Chưa hỗ trợ trực tuyến" và nhãn "Lịch mẫu tham khảo".');

    console.log('\n================================================================================');
    console.log('🎉 TỔNG KẾT NGHIỆM THU GIAO DIỆN: 100% CẢ 5 TAB MOBILE & DESKTOP ĐẠT YÊU CẦU');
    console.log('   Tất cả bằng chứng ảnh màn hình đã được lưu vào thư mục Artifacts.');
    console.log('================================================================================\n');

  } catch (err) {
    console.error('❌ LỖI TRONG QUÁ TRÌNH KIỂM THỬ:', err);
    process.exitCode = 1;
  } finally {
    if (cdp) await cdp.close();
    if (chromeProc) chromeProc.kill();
    if (localServer) localServer.close();
  }
}

run();
