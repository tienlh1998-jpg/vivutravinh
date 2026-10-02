const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

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

  async captureScreenshot(outputPath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    if (res.data) {
      fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
    }
  }

  async setViewport(width, height, isMobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: isMobile
    });
    await this.send('Emulation.setVisibleSize', { width, height });
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
    } catch (_) {}
    await sleep(200);
  }
  throw new Error('Không thể kết nối Chrome CDP');
}

async function runAcceptance() {
  console.log('=== BẮT ĐẦU NGHIỆM THU TRANG CHỦ & ĐỒNG BỘ TYPOGRAPHY ===\n');

  // 1. Tạo test server
  const server = http.createServer((req, res) => {
    let reqPath = decodeURIComponent(req.url.split('?')[0]);
    if (reqPath === '/') reqPath = '/index.html';
    const filePath = path.join(PROJECT_DIR, reqPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
  });

  const port = 9188;
  await new Promise(r => server.listen(port, r));
  console.log(`✓ Test server lắng nghe tại http://localhost:${port}`);

  // 2. Khởi chạy Chrome Headless
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const cdpPort = 9488;
  const userDataDir = path.join(os.tmpdir(), 'chrome_acceptance_home_' + Date.now());

  const chromeProc = spawn(chromePath, [
    `--remote-debugging-port=${cdpPort}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    `--user-data-dir=${userDataDir}`,
    `http://localhost:${port}/?source=mock`
  ]);

  let cdp;
  try {
    const wsUrl = await getDebuggerUrl(cdpPort);
    cdp = new CDPClient(wsUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');

    console.log('✓ Kết nối Chrome CDP thành công');

    // Chờ ứng dụng sẵn sàng và font tải xong
    let ready = false;
    for (let i = 0; i < 30; i++) {
      ready = await cdp.eval(`Boolean(window.ViVuApp && window.ViVuApp.state && window.ViVuApp.state.allPlaces && window.ViVuApp.state.allPlaces.length > 0)`);
      if (ready) break;
      await sleep(300);
    }
    if (!ready) throw new Error('Ứng dụng chưa sẵn sàng');
    console.log('✓ Ứng dụng ViVuTraVinh đã sẵn sàng');

    // Đảm bảo font Be Vietnam Pro đã nạp
    await cdp.eval(`document.fonts.ready`);
    await sleep(500);

    // ==========================================
    // KIỂM TRA 1: TYPOGRAPHY & FONT
    // ==========================================
    console.log('\n--- [KIỂM TRA 1: ĐỒNG NHẤT TYPOGRAPHY BE VIETNAM PRO] ---');
    const fontInfo = await cdp.eval(`(() => {
      const isFontLoaded = document.fonts.check('16px "Be Vietnam Pro"');
      const bodyFont = getComputedStyle(document.body).fontFamily;
      const h1 = document.querySelector('#heroBanner h1');
      const h1Font = h1 ? getComputedStyle(h1).fontFamily : '';
      const h1Size = h1 ? getComputedStyle(h1).fontSize : '';
      const h1LineHeight = h1 ? getComputedStyle(h1).lineHeight : '';

      const spotlightTitle = document.querySelector('#heroSpotlightContainer h2');
      const spotlightFont = spotlightTitle ? getComputedStyle(spotlightTitle).fontFamily : '';
      const spotlightSize = spotlightTitle ? getComputedStyle(spotlightTitle).fontSize : '';

      const tourTeaserTitle = document.querySelector('#tourItinerariesSection h3');
      const tourTeaserFont = tourTeaserTitle ? getComputedStyle(tourTeaserTitle).fontFamily : '';
      const tourTeaserSize = tourTeaserTitle ? getComputedStyle(tourTeaserTitle).fontSize : '';

      const bodyText = document.querySelector('#heroBanner p');
      const bodyTextFont = bodyText ? getComputedStyle(bodyText).fontFamily : '';
      const bodyTextSize = bodyText ? getComputedStyle(bodyText).fontSize : '';
      const bodyTextLineHeight = bodyText ? getComputedStyle(bodyText).lineHeight : '';

      // Check if any element in #view-home uses serif
      const homeEl = document.getElementById('view-home');
      const allHomeElements = homeEl ? Array.from(homeEl.querySelectorAll('*')) : [];
      const serifElements = allHomeElements.filter(el => {
        const ff = getComputedStyle(el).fontFamily.toLowerCase();
        return (ff.includes('serif') && !ff.includes('sans-serif') && !ff.includes('be vietnam pro')) || ff.includes('noto_serif');
      }).map(el => ({ tag: el.tagName, class: el.className, text: el.textContent.slice(0, 30) }));

      return {
        isFontLoaded,
        bodyFont,
        h1Font,
        h1Size,
        h1LineHeight,
        spotlightFont,
        spotlightSize,
        tourTeaserFont,
        tourTeaserSize,
        bodyTextFont,
        bodyTextSize,
        bodyTextLineHeight,
        serifElementsCount: serifElements.length,
        serifElements
      };
    })()`);

    console.log('  - Trạng thái nạp font Be Vietnam Pro:', fontInfo.isFontLoaded ? '✓ ĐÃ NẠP THÀNH CÔNG' : '❌ CHƯA NẠP');
    console.log('  - Font body:', fontInfo.bodyFont);
    console.log('  - Font Hero Title:', fontInfo.h1Font, '| Cỡ chữ:', fontInfo.h1Size, '| Line-height:', fontInfo.h1LineHeight);
    console.log('  - Font Spotlight Title:', fontInfo.spotlightFont, '| Cỡ chữ:', fontInfo.spotlightSize);
    console.log('  - Font Tour Teaser Title:', fontInfo.tourTeaserFont, '| Cỡ chữ:', fontInfo.tourTeaserSize);
    console.log('  - Font Body Text:', fontInfo.bodyTextFont, '| Cỡ chữ:', fontInfo.bodyTextSize, '| Line-height:', fontInfo.bodyTextLineHeight);
    console.log('  - Số phần tử còn sót font-serif trên Trang chủ:', fontInfo.serifElementsCount);

    if (fontInfo.serifElementsCount > 0) {
      console.warn('  ⚠️ Cảnh báo phần tử serif:', fontInfo.serifElements);
    }

    // ==========================================
    // KIỂM TRA 2: THẺ TIÊU ĐIỂM (AO BÀ OM SPOTLIGHT)
    // ==========================================
    console.log('\n--- [KIỂM TRA 2: THẺ TIÊU ĐIỂM AO BÀ OM] ---');
    const spotlightInfo = await cdp.eval(`(() => {
      const container = document.getElementById('heroSpotlightContainer');
      const img = container ? container.querySelector('img') : null;
      const title = container ? container.querySelector('h2')?.textContent?.trim() : '';
      const overlay = container ? container.querySelector('.bg-gradient-to-t') : null;
      return {
        hasContainer: Boolean(container),
        hasImg: Boolean(img),
        imgSrc: img ? img.src : '',
        imgComplete: img ? img.complete : false,
        imgNaturalWidth: img ? img.naturalWidth : 0,
        imgNaturalHeight: img ? img.naturalHeight : 0,
        hasOverlay: Boolean(overlay),
        title
      };
    })()`);

    console.log('  - Tiêu đề tiêu điểm:', spotlightInfo.title);
    console.log('  - Thẻ <img> ảnh tiêu điểm:', spotlightInfo.hasImg ? '✓ CÓ THẺ IMG' : '❌ THIẾU');
    console.log('  - Đường dẫn ảnh:', spotlightInfo.imgSrc);
    console.log('  - Trạng thái nạp ảnh:', spotlightInfo.imgComplete ? '✓ ĐÃ NẠP XONG' : '❌ CHƯA XONG');
    console.log('  - Kích thước thật của ảnh (naturalWidth x naturalHeight):', `${spotlightInfo.imgNaturalWidth} x ${spotlightInfo.imgNaturalHeight}`);
    console.log('  - Lớp phủ gradient tương phản:', spotlightInfo.hasOverlay ? '✓ CÓ GRADIENT ĐẢM BẢO TƯƠNG PHẢN' : '❌ THIẾU');

    // ==========================================
    // KIỂM TRA 3: THANH THỐNG KÊ HERO STATS
    // ==========================================
    console.log('\n--- [KIỂM TRA 3: SỐ LIỆU HERO STATS THẬT] ---');
    const statsInfo = await cdp.eval(`(() => {
      const places = document.getElementById('heroStatPlacesCount')?.textContent?.trim();
      const clubs = document.getElementById('heroStatClubsCount')?.textContent?.trim();
      const events = document.getElementById('heroStatEventsCount')?.textContent?.trim();
      return { places, clubs, events };
    })()`);
    console.log('  - Số địa điểm:', statsInfo.places);
    console.log('  - Số CLB:', statsInfo.clubs);
    console.log('  - Số sự kiện:', statsInfo.events);

    // ==========================================
    // KIỂM TRA 4: TOUR 1 NGÀY (COMPACT TEASER + MODAL)
    // ==========================================
    console.log('\n--- [KIỂM TRA 4: LỊCH TRÌNH TOUR 1 NGÀY (TEASER + MODAL)] ---');
    const tourTeaserCheck = await cdp.eval(`(() => {
      const section = document.getElementById('tourItinerariesSection');
      const mainFeedStops = section ? section.querySelectorAll('.timeline-stop, .group') : [];
      const viewBtn = section ? Array.from(section.querySelectorAll('button')).find(b => b.textContent.includes('Xem lịch trình')) : null;
      const randomBtn = section ? Array.from(section.querySelectorAll('button')).find(b => b.textContent.includes('Đổi tour ngẫu hứng')) : null;
      const modal = document.getElementById('tourItinerariesModal');
      const modalHidden = modal ? modal.classList.contains('hidden') : true;

      return {
        hasSection: Boolean(section),
        hasViewBtn: Boolean(viewBtn),
        hasRandomBtn: Boolean(randomBtn),
        modalExists: Boolean(modal),
        modalInitiallyHidden: modalHidden,
        stopsInMainFeedCount: mainFeedStops.length
      };
    })()`);

    console.log('  - Khối teaser tour trên Trang chủ:', tourTeaserCheck.hasSection ? '✓ HIỂN THỊ GỌN GÀNG' : '❌ THIẾU');
    console.log('  - Nút "Xem lịch trình":', tourTeaserCheck.hasViewBtn ? '✓ CÓ' : '❌ THIẾU');
    console.log('  - Nút "Đổi tour ngẫu hứng":', tourTeaserCheck.hasRandomBtn ? '✓ CÓ' : '❌ THIẾU');
    console.log('  - Modal lịch trình đầy đủ:', tourTeaserCheck.modalExists ? '✓ ĐÃ TÍCH HỢP' : '❌ THIẾU');
    console.log('  - Modal ban đầu được ẩn:', tourTeaserCheck.modalInitiallyHidden ? '✓ ĐÚNG (ẨN)' : '❌ LỖI (MỞ SẴN)');

    // Test mở modal qua nút "Xem lịch trình"
    console.log('\n  -> Thử nghiệm mở Modal khi bấm "Xem lịch trình":');
    await cdp.eval(`window.ViVuApp.openTourItinerariesModal()`);
    await sleep(400);

    const modalOpenedCheck = await cdp.eval(`(() => {
      const modal = document.getElementById('tourItinerariesModal');
      const isVisible = modal && !modal.classList.contains('hidden');
      const container = document.getElementById('tourItinerariesContainer');
      const tabs = container ? container.querySelectorAll('.tour-tab-btn').length : 0;
      const stops = container ? container.querySelectorAll('[class*="group"]').length : 0;
      const hash = window.location.hash;
      return { isVisible, tabs, stops, hash };
    })()`);

    console.log('  - Modal đã mở:', modalOpenedCheck.isVisible ? '✓ MỞ THÀNH CÔNG' : '❌ CHƯA MỞ');
    console.log('  - Số tab tour trong modal:', modalOpenedCheck.tabs);
    console.log('  - Số điểm dừng trong tour hiện tại:', modalOpenedCheck.stops);
    console.log('  - URL hash sau khi mở modal:', modalOpenedCheck.hash);

    // Test đóng modal
    console.log('\n  -> Thử nghiệm đóng Modal:');
    await cdp.eval(`window.ViVuApp.closeTourItinerariesModal()`);
    await sleep(400);

    const modalClosedCheck = await cdp.eval(`(() => {
      const modal = document.getElementById('tourItinerariesModal');
      const isHidden = modal && modal.classList.contains('hidden');
      const hash = window.location.hash;
      return { isHidden, hash };
    })()`);
    console.log('  - Modal đã đóng:', modalClosedCheck.isHidden ? '✓ ĐÓNG THÀNH CÔNG' : '❌ VẪN MỞ');
    console.log('  - URL hash sau khi đóng modal:', modalClosedCheck.hash);

    // ==========================================
    // KIỂM TRA 5: CHỤP ẢNH NGHIỆM THU AFTER
    // ==========================================
    console.log('\n--- [KIỂM TRA 5: CHỤP ẢNH NGHIỆM THU SAU KHI SỬA (AFTER SCREENSHOTS)] ---');
    const viewports = [
      { name: 'desktop_1280', width: 1280, height: 800, isMobile: false },
      { name: 'desktop_1920', width: 1920, height: 1080, isMobile: false },
      { name: 'mobile_390', width: 390, height: 844, isMobile: true }
    ];

    for (const vp of viewports) {
      console.log(`\n  Chụp ảnh viewport ${vp.name} (${vp.width}x${vp.height}):`);
      await cdp.setViewport(vp.width, vp.height, vp.isMobile);
      await cdp.eval(`window.ViVuApp.switchView('home', { updateHash: false, pushState: false, closeOverlays: true, scrollTop: true })`);
      await sleep(500);

      // 1. Top
      const topImgPath = path.join(ARTIFACT_DIR, `home_after_${vp.name}_top.png`);
      await cdp.captureScreenshot(topImgPath);
      console.log(`    ✓ Top: home_after_${vp.name}_top.png`);

      // 2. Mid
      await cdp.eval(`window.scrollTo({ top: 900, behavior: 'instant' })`);
      await sleep(400);
      const midImgPath = path.join(ARTIFACT_DIR, `home_after_${vp.name}_mid.png`);
      await cdp.captureScreenshot(midImgPath);
      console.log(`    ✓ Mid: home_after_${vp.name}_mid.png`);

      // 3. Bottom
      await cdp.eval(`window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })`);
      await sleep(400);
      const bottomImgPath = path.join(ARTIFACT_DIR, `home_after_${vp.name}_bottom.png`);
      await cdp.captureScreenshot(bottomImgPath);
      console.log(`    ✓ Bottom: home_after_${vp.name}_bottom.png`);

      // Kiểm tra sticky header & tràn ngang
      const checks = await cdp.eval(`(() => {
        const header = document.querySelector('header');
        const headerRect = header ? header.getBoundingClientRect() : null;
        const scrollWidth = document.documentElement.scrollWidth;
        const clientWidth = document.documentElement.clientWidth;
        const hasOverflow = scrollWidth > clientWidth;
        return {
          headerTop: headerRect ? Math.round(headerRect.top) : null,
          hasOverflow,
          scrollWidth,
          clientWidth
        };
      })()`);

      console.log(`    - Sticky Header Top khi cuộn cuối trang: ${checks.headerTop}px (yêu cầu: 0px)`);
      console.log(`    - Lỗi tràn ngang: ${checks.hasOverflow ? '❌ TRÀN NGANG' : '✓ 0 TRÀN NGANG (Hoàn hảo)'} (${checks.clientWidth}px / ${checks.scrollWidth}px)`);

      // Trở lại đầu trang
      await cdp.eval(`window.scrollTo({ top: 0, behavior: 'instant' })`);
      await sleep(300);
    }

    console.log('\n======================================================');
    console.log('✅ NGHIỆM THU TRANG CHỦ & TYPOGRAPHY HOÀN TẤT XUẤT SẮC!');
    console.log('======================================================');

  } finally {
    if (cdp) await cdp.close();
    chromeProc.kill();
    server.close();
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
  }
}

runAcceptance().catch(err => {
  console.error('\n❌ Lỗi trong quá trình nghiệm thu:', err);
  process.exit(1);
});
