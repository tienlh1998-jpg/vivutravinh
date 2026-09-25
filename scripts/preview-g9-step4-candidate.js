#!/usr/bin/env node
/**
 * scripts/preview-g9-step4-candidate.js
 * Tạo ảnh chụp màn hình xem trước (Chrome CDP) cho các ứng viên Bước 4:
 * - Chùa Hang (chua-hang)
 * - Cồn Chim (con-chim)
 * - Chùa Vàm Rây (chua-vam-ray)
 *
 * Chụp đầy đủ 6 ảnh cho mỗi ứng viên:
 * 1. Admin Preview Light (Desktop)
 * 2. Admin Preview Dark (Desktop)
 * 3. Public Detail Light (Desktop 1280x850)
 * 4. Public Detail Dark (Desktop 1280x850)
 * 5. Public Detail Light (Mobile 390x844)
 * 6. Public Detail Dark (Mobile 390x844)
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePlace } from '../js/place-validator.js';
import { fetchAllLivePlaces } from './execute-g9-cleanup-step1.js';
import { CDPClient } from './preview-g9-den-tho-bac-ho.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const ARTIFACT_DIR = path.resolve('/home/huutien-tran/.gemini/antigravity/brain/1cab34ab-f633-487c-8e0f-9175241583a3');

const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
};

export function loadStep4Candidate(targetSlug, options = {}) {
  const patchesPath = options.patchesPath || path.join(REPO_ROOT, 'data', 'g9-expansion-proposed-patches.json');
  if (!fs.existsSync(patchesPath)) {
    throw new Error(`File không tồn tại: ${patchesPath}`);
  }
  const data = JSON.parse(fs.readFileSync(patchesPath, 'utf8'));
  const candidate = (data.candidates || []).find(c => c.slug === targetSlug);
  if (!candidate) {
    throw new Error(`Không tìm thấy ứng viên '${targetSlug}' trong ${patchesPath}`);
  }
  return { candidate, patchesPath };
}

async function getDebuggerUrl(port, retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const pageTarget = data.find(p => p.type === 'page');
          if (pageTarget?.webSocketDebuggerUrl) return pageTarget.webSocketDebuggerUrl;
          if (data[0]?.webSocketDebuggerUrl) return data[0].webSocketDebuggerUrl;
        }
      }
    } catch {
      await sleep(200);
    }
  }
  throw new Error(`Không thể kết nối Chrome Remote Debugging trên cổng ${port}`);
}

export async function captureCandidatePreviews(candidate, options = {}) {
  const artifactDir = options.artifactDir || ARTIFACT_DIR;
  if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });

  const draftPlace = { ...candidate.draft_payload, id: candidate.targetId || 999 };
  const slug = candidate.slug;
  const coords = draftPlace.coordinates.split(',').map(c => parseFloat(c.trim()));

  const serverPort = options.serverPort || (9000 + Math.floor(Math.random() * 800));
  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/') reqPath = '/index.html';
    let filePath = path.join(REPO_ROOT, reqPath);
    if (filePath.endsWith('/')) filePath += 'index.html';

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_MAP[ext] || 'application/octet-stream' });
      res.end(fs.readFileSync(filePath));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  await new Promise(r => server.listen(serverPort, '127.0.0.1', r));

  const chromePort = options.chromePort || (9300 + Math.floor(Math.random() * 500));
  const chromeProfile = fs.mkdtempSync(path.join(os.tmpdir(), `vivu_${slug}_preview_`));
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--user-data-dir=${chromeProfile}`,
    `--remote-debugging-port=${chromePort}`,
    'about:blank'
  ], { stdio: 'pipe' });

  let cdp = null;
  const screenshots = {};

  try {
    const wsUrl = await getDebuggerUrl(chromePort);
    cdp = new CDPClient(wsUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    // ==========================================
    // 1. ADMIN PREVIEW MODAL
    // ==========================================
    console.log(`\n--- [${slug}] Chụp Ảnh Admin Preview Modal (Desktop Light & Dark) ---`);
    await cdp.setViewport(1280, 850, false);
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/admin.html` });

    for (let i = 0; i < 25; i++) {
      const hasVivuAdmin = await cdp.eval(`Boolean(window.VivuAdmin)`);
      if (hasVivuAdmin) break;
      await sleep(200);
    }

    await cdp.eval(`(() => {
      const session = {
        user: { id: 'admin-qc', email: 'admin@vivutravinh.vn', role: 'admin' },
        access_token: 'fake-jwt-for-preview',
        profile: { user_id: 'admin-qc', role: 'admin', full_name: 'Quản Trị Viên QC' }
      };
      sessionStorage.setItem('vivu_admin_session', JSON.stringify(session));
      window.dispatchEvent(new CustomEvent('vivu:auth-login', { detail: { session } }));
    })()`);
    await sleep(400);

    await cdp.eval(`(() => {
      const placeData = ${JSON.stringify(draftPlace)};
      window.VivuAdmin.openPlacePreview(placeData);
    })()`);
    await sleep(400);

    // Admin Light
    const adminLightPath = path.join(artifactDir, `g9-${slug}-admin-preview-light.png`);
    await cdp.screenshot(adminLightPath);
    screenshots.adminLight = adminLightPath;
    console.log(`  ✓ Đã lưu Admin Preview Light: ${path.basename(adminLightPath)}`);

    // Admin Dark
    await cdp.eval(`document.documentElement.classList.add('dark');`);
    await sleep(200);
    const adminDarkPath = path.join(artifactDir, `g9-${slug}-admin-preview-dark.png`);
    await cdp.screenshot(adminDarkPath);
    screenshots.adminDark = adminDarkPath;
    console.log(`  ✓ Đã lưu Admin Preview Dark: ${path.basename(adminDarkPath)}`);

    // ==========================================
    // 2. PUBLIC DETAIL MODAL PREVIEW
    // ==========================================
    console.log(`\n--- [${slug}] Chụp Ảnh Public Detail Modal Preview (Desktop/Mobile, Light/Dark) ---`);
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/index.html` });
    await sleep(600);

    for (let i = 0; i < 30; i++) {
      const isReady = await cdp.eval(`Boolean(window.ViVuApp && window.ViVuApp.state && Array.isArray(window.ViVuApp.state.allPlaces))`);
      if (isReady) break;
      await sleep(200);
    }

    const publicPlace = {
      ...draftPlace,
      _source: 'supabase',
      status: 'approved',
      mapLink: draftPlace.map_link,
      hasValidGps: true,
      parsedCoordinates: coords
    };

    await cdp.eval(`(() => {
      document.documentElement.classList.remove('dark');
      const p = ${JSON.stringify(publicPlace)};
      window.ViVuApp.state.allPlaces.unshift(p);
      window.ViVuApp.openDetailModal(p);
      document.getElementById('offlineSyncToast')?.classList.add('hidden');
    })()`);
    await sleep(2000);

    const publicCheck = await cdp.eval(`(() => {
      const modal = document.getElementById('detailModal');
      const text = modal ? modal.innerText : '';
      const mapEl = document.getElementById('modalLeafletMap');
      const tileImages = mapEl ? Array.from(mapEl.querySelectorAll('img.leaflet-tile')).map(i => i.src) : [];
      const dirLink = document.getElementById('modalDirections');
      return {
        text,
        price: document.getElementById('modalPrice')?.innerText || '',
        tileImagesCount: tileImages.length,
        hasOsmTile: tileImages.some(src => src.includes('tile.openstreetmap.org')),
        hasCartoTile: tileImages.some(src => src.includes('cartocdn.com')),
        contactHidden: document.getElementById('modalContactBlock')?.classList.contains('hidden'),
        directionsHref: dirLink ? dirLink.href : ''
      };
    })()`);

    console.log('  • Xác thực DOM Public Modal:');
    assert.ok(publicCheck.text.includes(draftPlace.name), `Public Modal phải chứa tên ${draftPlace.name}`);
    assert.strictEqual(publicCheck.price, 'Liên hệ', 'Public Modal giá phải là "Liên hệ"');
    assert.ok(!publicCheck.text.includes('Miễn phí'), 'Public Modal TUYỆT ĐỐI không hiển thị "Miễn phí"');
    assert.ok(publicCheck.text.includes('Chưa có đánh giá'), 'Public Modal phải hiển thị "Chưa có đánh giá"');
    assert.ok(publicCheck.text.includes('Chưa rõ giờ mở'), 'Public Modal phải hiển thị trạng thái giờ "Chưa rõ giờ mở"');
    assert.strictEqual(publicCheck.contactHidden, true, 'Khối liên hệ phải ẩn khi contact=null');
    assert.ok(!publicCheck.hasCartoTile, 'Modal TUYỆT ĐỐI không chứa tile cartocdn có lỗi watermark');
    console.log('    ✓ Public Modal: Tên chuẩn, Giá Liên hệ, 0 Miễn phí, 0 Fake Rating, Tile OSM sạch');

    // Desktop Light
    await cdp.eval(`(() => { document.getElementById('offlineSyncToast')?.remove(); })()`);
    await sleep(100);
    const pubDeskLightPath = path.join(artifactDir, `g9-${slug}-public-preview-desktop-light.png`);
    await cdp.screenshot(pubDeskLightPath);
    screenshots.publicDesktopLight = pubDeskLightPath;
    console.log(`  ✓ Đã lưu Public Preview Desktop Light: ${path.basename(pubDeskLightPath)}`);

    // Desktop Dark
    await cdp.eval(`(() => {
      document.documentElement.classList.add('dark');
      document.getElementById('offlineSyncToast')?.remove();
    })()`);
    await sleep(200);
    const pubDeskDarkPath = path.join(artifactDir, `g9-${slug}-public-preview-desktop-dark.png`);
    await cdp.screenshot(pubDeskDarkPath);
    screenshots.publicDesktopDark = pubDeskDarkPath;
    console.log(`  ✓ Đã lưu Public Preview Desktop Dark: ${path.basename(pubDeskDarkPath)}`);

    // Mobile Viewport (390x844)
    await cdp.setViewport(390, 844, true);
    await cdp.eval(`(() => {
      if (window.ViVuApp?.state?.modalMap) window.ViVuApp.state.modalMap.invalidateSize();
      document.getElementById('offlineSyncToast')?.remove();
      return true;
    })()`);
    await sleep(600);

    // Mobile Light
    await cdp.eval(`(() => {
      document.documentElement.classList.remove('dark');
      document.getElementById('offlineSyncToast')?.remove();
    })()`);
    await sleep(200);
    const pubMobLightPath = path.join(artifactDir, `g9-${slug}-public-preview-mobile-light.png`);
    await cdp.screenshot(pubMobLightPath);
    screenshots.publicMobileLight = pubMobLightPath;
    console.log(`  ✓ Đã lưu Public Preview Mobile Light: ${path.basename(pubMobLightPath)}`);

    // Mobile Dark
    await cdp.eval(`(() => {
      document.documentElement.classList.add('dark');
      document.getElementById('offlineSyncToast')?.remove();
    })()`);
    await sleep(200);
    const pubMobDarkPath = path.join(artifactDir, `g9-${slug}-public-preview-mobile-dark.png`);
    await cdp.screenshot(pubMobDarkPath);
    screenshots.publicMobileDark = pubMobDarkPath;
    console.log(`  ✓ Đã lưu Public Preview Mobile Dark: ${path.basename(pubMobDarkPath)}`);

  } finally {
    if (cdp) cdp.close();
    chrome.kill('SIGTERM');
    server.close();
    try { fs.rmSync(chromeProfile, { recursive: true, force: true }); } catch {}
  }

  return screenshots;
}

// Chạy trực tiếp qua CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const targetSlug = process.argv[2] || 'chua-hang';
  const { candidate } = loadStep4Candidate(targetSlug);
  console.log(`Bắt đầu chụp preview cho: ${candidate.name} (${candidate.slug})`);
  captureCandidatePreviews(candidate)
    .then(shots => {
      console.log('Hoàn tất chụp 6 ảnh preview:', shots);
      process.exit(0);
    })
    .catch(err => {
      console.error('Lỗi khi chụp preview:', err);
      process.exit(1);
    });
}
