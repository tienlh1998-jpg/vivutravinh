/**
 * scripts/test-sanitizer-browser.cjs
 *
 * Kiểm tra độc lập bộ lọc sanitizeArticleContent trên môi trường trình duyệt thật (Chrome DevTools Protocol).
 * Đảm bảo 100% không có XSS bypass qua cấu trúc lồng nhau (nested unallowed tags).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const assert = require('assert');

const PROJECT_DIR = path.resolve(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
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
          res.on('data', chunk => d += chunk);
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
  console.log(' KIỂM THỬ ĐỘC LẬP BROWSER: BỘ LỌC ĐỆ QUY sanitizeArticleContent CHỐNG XSS');
  console.log('================================================================================\n');

  // Khởi tạo máy chủ tĩnh
  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/') reqPath = '/index.html';
    const filePath = path.join(PROJECT_DIR, reqPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  const serverPort = 8955;
  await new Promise(r => server.listen(serverPort, r));
  console.log(`  ✓ Máy chủ tĩnh phục vụ web đã khởi chạy tại cổng ${serverPort}`);

  // Tìm Chrome
  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
  ];
  const chromePath = chromePaths.find(p => fs.existsSync(p));
  if (!chromePath) throw new Error('Không tìm thấy trình duyệt Google Chrome trên hệ thống!');

  const cdpPort = 9235;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-sanitizer-test-'));

  const chromeProc = spawn(chromePath, [
    `--remote-debugging-port=${cdpPort}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${userDataDir}`,
    `http://127.0.0.1:${serverPort}/index.html`
  ]);

  try {
    const wsUrl = await getDebuggerUrl(cdpPort);
    const cdp = new CDPClient(wsUrl);
    await cdp.ready();
    console.log('  ✓ Đã kết nối Chrome DevTools Protocol.');

    // Chờ web app load
    for (let i = 0; i < 30; i++) {
      const ready = await cdp.eval('Boolean(window.ViVuApp && window.ViVuApp.sanitizeArticleContent)');
      if (ready) break;
      await sleep(200);
    }

    // ============================================================================
    // TEST CASE 1: Thẻ img lồng sâu trong <section><custom-tag>
    // ============================================================================
    console.log('\n[Test 1] Thẻ <img> có onerror lồng sâu trong <section><custom-tag>:');
    const test1 = await cdp.eval(`(() => {
      const payload = '<section id="sec-1"><custom-tag><img src="https://invalid.test/1.jpg" onerror="window.__xss1 = true;"></custom-tag></section>';
      const clean = window.ViVuApp.sanitizeArticleContent(payload);
      
      const el = document.createElement('div');
      el.innerHTML = clean;
      document.body.appendChild(el);
      
      const imgs = el.querySelectorAll('img');
      const sections = el.querySelectorAll('section');
      const customTags = el.querySelectorAll('custom-tag');
      const onerrors = el.querySelectorAll('*[onerror]');
      
      return {
        clean,
        hasImg: imgs.length > 0,
        hasSection: sections.length > 0,
        hasCustomTag: customTags.length > 0,
        hasOnError: onerrors.length > 0,
        xssExecuted: window.__xss1
      };
    })()`);

    assert.strictEqual(test1.hasImg, false, 'DOM không được có thẻ img');
    assert.strictEqual(test1.hasSection, false, 'DOM không được có thẻ section');
    assert.strictEqual(test1.hasCustomTag, false, 'DOM không được có thẻ custom-tag');
    assert.strictEqual(test1.hasOnError, false, 'DOM không được có thuộc tính onerror');
    assert.strictEqual(test1.xssExecuted, undefined, 'Mã độc XSS 1 tuyệt đối không được thực thi');
    console.log('  ✓ PASS: Thẻ img và các thẻ bọc không hợp lệ bị xóa sạch, 0% XSS.');

    // ============================================================================
    // TEST CASE 2: Thẻ img lồng trong <section> có nội dung văn bản hợp lệ
    // ============================================================================
    console.log('\n[Test 2] Thẻ <img> lồng trong <section> kèm đoạn văn bản hợp lệ:');
    const test2 = await cdp.eval(`(() => {
      const payload = '<section><p class="lead">Đoạn văn mở đầu</p><img src="x" onerror="window.__xss2 = true;"><p>Đoạn văn kết thúc</p></section>';
      const clean = window.ViVuApp.sanitizeArticleContent(payload);
      
      const el = document.createElement('div');
      el.innerHTML = clean;
      document.body.appendChild(el);
      
      const imgs = el.querySelectorAll('img');
      const paragraphs = el.querySelectorAll('p');
      const text = el.textContent;
      
      return {
        clean,
        hasImg: imgs.length > 0,
        paragraphCount: paragraphs.length,
        hasLead: el.querySelector('.lead') !== null,
        textHasBoth: text.includes('Đoạn văn mở đầu') && text.includes('Đoạn văn kết thúc'),
        xssExecuted: window.__xss2
      };
    })()`);

    assert.strictEqual(test2.hasImg, false, 'Thẻ img phải bị loại bỏ');
    assert.strictEqual(test2.paragraphCount, 2, 'Phải giữ lại đúng 2 đoạn văn hợp lệ');
    assert.ok(test2.hasLead, 'Class hợp lệ "lead" trên thẻ p phải được giữ lại');
    assert.ok(test2.textHasBoth, 'Nội dung văn bản hợp lệ phải được giữ lại');
    assert.strictEqual(test2.xssExecuted, undefined, 'Mã độc XSS 2 tuyệt đối không được thực thi');
    console.log('  ✓ PASS: Loại bỏ img, giữ nguyên vẹn 2 thẻ <p> và class hợp lệ.');

    // ============================================================================
    // TEST CASE 3: Lồng nhiều tầng thẻ nguy hại (<script>, <svg>, <style>) & handlers (on*)
    // ============================================================================
    console.log('\n[Test 3] Hỗn hợp thẻ nguy hại đa tầng (<script>, <svg onload>, <div onmouseover>):');
    const test3 = await cdp.eval(`(() => {
      const payload = '<div class="main-content" onmouseover="window.__xss3_hover = true;" style="color:red;"><script>window.__xss3_script = true;</script><p>Nội dung chuẩn</p><svg onload="window.__xss3_svg = true;"></svg></div>';
      const clean = window.ViVuApp.sanitizeArticleContent(payload);
      
      const el = document.createElement('div');
      el.innerHTML = clean;
      document.body.appendChild(el);
      
      const scripts = el.querySelectorAll('script');
      const svgs = el.querySelectorAll('svg');
      const onmouseover = el.querySelectorAll('*[onmouseover]');
      const styleAttr = el.querySelectorAll('*[style]');
      
      return {
        clean,
        hasScripts: scripts.length > 0,
        hasSvgs: svgs.length > 0,
        hasOnmouseover: onmouseover.length > 0,
        hasStyle: styleAttr.length > 0,
        xssScript: window.__xss3_script,
        xssSvg: window.__xss3_svg,
        xssHover: window.__xss3_hover
      };
    })()`);

    assert.strictEqual(test3.hasScripts, false, 'Không còn thẻ script');
    assert.strictEqual(test3.hasSvgs, false, 'Không còn thẻ svg');
    assert.strictEqual(test3.hasOnmouseover, false, 'Không còn thuộc tính onmouseover');
    assert.strictEqual(test3.hasStyle, false, 'Không còn thuộc tính style');
    assert.strictEqual(test3.xssScript, undefined, 'Script không được chạy');
    assert.strictEqual(test3.xssSvg, undefined, 'SVG onload không được chạy');
    assert.strictEqual(test3.xssHover, undefined, 'Onmouseover không được chạy');
    console.log('  ✓ PASS: Triệt tiêu hoàn toàn script, svg, thuộc tính style và on*.');

    // ============================================================================
    // TEST CASE 4: Thẻ <a> chứa javascript: protocol
    // ============================================================================
    console.log('\n[Test 4] Thẻ <a> với giao thức javascript: (unwrapped):');
    const test4 = await cdp.eval(`(() => {
      const payload = '<p>Bấm vào <a href="javascript:window.__xss4 = true;">đây</a> để nhận thưởng</p>';
      const clean = window.ViVuApp.sanitizeArticleContent(payload);
      
      const el = document.createElement('div');
      el.innerHTML = clean;
      document.body.appendChild(el);
      
      const links = el.querySelectorAll('a');
      const text = el.textContent;
      
      return {
        clean,
        hasLink: links.length > 0,
        textPreserved: text.includes('Bấm vào đây để nhận thưởng'),
        xssExecuted: window.__xss4
      };
    })()`);

    assert.strictEqual(test4.hasLink, false, 'Thẻ <a> không nằm trong allowlist nên phải được unwrap thành văn bản thuần');
    assert.ok(test4.textPreserved, 'Nội dung chữ "đây" phải được giữ lại');
    assert.strictEqual(test4.xssExecuted, undefined, 'javascript: link không chạy');
    console.log('  ✓ PASS: Thẻ <a> bị unwrap an toàn, không còn nguy cơ javascript: URI.');

    // ============================================================================
    // TEST CASE 5: getArticleCategoryBadgeClass với payload phá vỡ chuỗi
    // ============================================================================
    console.log('\n[Test 5] getArticleCategoryBadgeClass chống class breakout:');
    const test5 = await cdp.eval(`(() => {
      const malicious = '"><script>window.__xss5 = true;</script><span class="';
      const badgeClass = window.ViVuApp.getArticleCategoryBadgeClass(malicious);
      const isSafe = !badgeClass.includes('<') && !badgeClass.includes('>') && !badgeClass.includes('"');
      return { badgeClass, isSafe, xssExecuted: window.__xss5 };
    })()`);

    assert.ok(test5.isSafe, 'Badge class phải tuyệt đối an toàn');
    assert.strictEqual(test5.xssExecuted, undefined, 'Script trong category không thể kích hoạt');
    console.log(`  ✓ PASS: Badge class trả về an toàn: "${test5.badgeClass}"`);

    console.log('\n================================================================================');
    console.log(' TẤT CẢ 5/5 BÀI KIỂM THỬ XSS VỚI CẤU TRÚC LỒNG NHAU ĐÃ ĐẠT TUYỆT ĐỐI!');
    console.log('================================================================================\n');

    await cdp.close();
  } finally {
    try { chromeProc.kill(); } catch (_) {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
    server.close();
  }
}

run().catch(err => {
  console.error('\n❌ KIỂM THỬ THẤT BẠI:', err);
  process.exit(1);
});
