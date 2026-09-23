// api/og-place.js
// Server-Side Dynamic HTML & Open Graph Renderer cho Social Crawlers & Direct Place URLs
// - Phục vụ Facebook crawler (facebookexternalhit), ZaloBot, TelegramBot, TwitterBot, Googlebot
// - Tiêm trực tiếp tiêu đề, mô tả, hình ảnh và canonical URL của từng địa điểm vào thẻ <head> của HTML thô
// - Đảm bảo bot xem trước mạng xã hội không cần chạy JavaScript vẫn hiển thị đúng 100%

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

let cachedHtml = null;
let cachedPlaces = null;

/**
 * Chuẩn hóa toàn bộ tài nguyên runtime sang URL root tuyệt đối:
 * - Đảm bảo thẻ <base href="/"> hiện diện trong <head>
 * - href="./..." -> href="/..."
 * - src="./..." -> src="/..."
 * - from './js/...' -> from '/js/...'
 * - navigator.serviceWorker.register('./service-worker.js') -> register('/service-worker.js')
 * - <a href="./" -> <a href="/"
 * - href="css/tailwind.css", src="js/app.js", etc. -> root /
 */
export function normalizeRuntimeAssets(html) {
  if (!html || typeof html !== 'string') return html;
  let res = html;

  // 1. Đảm bảo thẻ <base href="/"> hiện diện trong <head>
  if (!/<base\s+[^>]*href=["']\/["'][^>]*>/i.test(res)) {
    if (/<head[^>]*>/i.test(res)) {
      res = res.replace(/(<head[^>]*>)/i, '$1\n    <base href="/">');
    }
  }

  // 2. Chuyển đổi href="./..." và src="./..." thành root-relative /...
  res = res.replace(/(href=["'])\.\/([^"']*)/gi, (match, p1, p2) => {
    return p2 === '' ? `${p1}/` : `${p1}/${p2}`;
  });
  res = res.replace(/(src=["'])\.\/([^"']*)/gi, (match, p1, p2) => {
    return `${p1}/${p2}`;
  });

  // 3. Chuyển đổi inline ES module imports: from './js/...' -> from '/js/...'
  res = res.replace(/from\s+['"]\.\/js\/([^'"]+)['"]/g, "from '/js/$1'");

  // 4. Chuyển đổi serviceWorker register
  res = res.replace(/register\(\s*['"]\.\/service-worker\.js['"]\s*\)/g, "register('/service-worker.js')");

  // 5. Chuyển đổi các đường dẫn tương đối không có dấu chấm nếu có
  res = res.replace(/(href=["'])(css\/tailwind\.css|vendor\/|icons\/|data\/|manifest\.json)/gi, '$1/$2');
  res = res.replace(/(src=["'])(js\/|vendor\/|icons\/)/gi, '$1/$2');

  return res;
}

function loadHtmlTemplate() {
  if (cachedHtml && process.env.NODE_ENV === 'production') {
    return cachedHtml;
  }
  // Ưu tiên đọc từ dist/index.html, nếu chưa build thì đọc index.html gốc
  const distPath = path.join(ROOT_DIR, 'dist', 'index.html');
  const rootPath = path.join(ROOT_DIR, 'index.html');
  const targetPath = fs.existsSync(distPath) ? distPath : rootPath;
  cachedHtml = normalizeRuntimeAssets(fs.readFileSync(targetPath, 'utf8'));
  return cachedHtml;
}

function loadPlacesData() {
  if (cachedPlaces && process.env.NODE_ENV === 'production') {
    return cachedPlaces;
  }
  try {
    const fallbackPath = path.join(ROOT_DIR, 'data', 'data-fallback.json');
    if (fs.existsSync(fallbackPath)) {
      cachedPlaces = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
      return cachedPlaces;
    }
  } catch {}

  try {
    const fixturePath = path.join(ROOT_DIR, 'data', 'data-fixture.json');
    if (fs.existsSync(fixturePath)) {
      cachedPlaces = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
      return cachedPlaces;
    }
  } catch {}

  return [];
}

export function findPlace(slugOrId, places) {
  if (!slugOrId || !Array.isArray(places)) return null;
  const q = String(slugOrId).trim().toLowerCase();

  return places.find(p => {
    const pSlug = String(p.Slug || p.slug || '').toLowerCase();
    const pId = String(p.ID || p.id || '').toLowerCase();
    const pDbId = p.dbId ? String(p.dbId).toLowerCase() : '';
    const pName = String(p['Tên địa điểm'] || p.name || p.Name || '').toLowerCase();

    return (
      pSlug === q ||
      pId === q ||
      pDbId === q ||
      pSlug.includes(q) ||
      (q === 'ao-ba-om' && (pSlug.includes('ao-ba-om') || pName.includes('ao ba om') || pName.includes('ao bà om'))) ||
      (q === 'chua-hang' && (pSlug.includes('chua-hang') || pName.includes('chùa hang'))) ||
      pName.includes(q)
    );
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export const ALLOWED_CANONICAL_HOSTS = Object.freeze(['vivutravinh.id.vn', 'www.vivutravinh.id.vn']);
export const PRIMARY_CANONICAL_ORIGIN = 'https://vivutravinh.id.vn';

export function isAllowedHost(host) {
  if (!host || typeof host !== 'string') return false;
  const cleanHost = host.split(':')[0].trim().toLowerCase();
  return ALLOWED_CANONICAL_HOSTS.includes(cleanHost);
}

export function isValidSiteUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:') return false;
    return isAllowedHost(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Trả về base URL cho Canonical và OpenGraph tags
 * Chống triệt để Canonical Host Injection / Cache Poisoning:
 * - Không tin tùy ý header host hay x-forwarded-host
 * - Chỉ chấp nhận hostname nằm trong allowlist: vivutravinh.id.vn và www.vivutravinh.id.vn
 * - www.vivutravinh.id.vn luôn được chuẩn hóa canonical về https://vivutravinh.id.vn
 * - Host lạ (evil.example), javascript:, http:, preview domain (.vercel.app) luôn fallback về PRIMARY_CANONICAL_ORIGIN
 * - Biến môi trường SITE_URL chỉ được dùng khi là HTTPS URL hợp lệ và nằm trong allowlist
 */
export function getBaseUrl(request) {
  if (process.env.SITE_URL) {
    if (isValidSiteUrl(process.env.SITE_URL)) {
      return PRIMARY_CANONICAL_ORIGIN;
    }
  }

  const rawHost = request?.headers?.['x-forwarded-host'] || request?.headers?.host;
  if (rawHost && isAllowedHost(rawHost)) {
    return PRIMARY_CANONICAL_ORIGIN;
  }

  return PRIMARY_CANONICAL_ORIGIN;
}

export function renderPlaceHtml(rawHtmlOrSlug, maybePlace, maybeRequest) {
  let rawHtml;
  let place;
  let request = maybeRequest;

  if (typeof rawHtmlOrSlug === 'string' && (rawHtmlOrSlug.includes('<html') || rawHtmlOrSlug.includes('<!DOCTYPE') || rawHtmlOrSlug.includes('<head>'))) {
    rawHtml = rawHtmlOrSlug;
    place = maybePlace;
  } else {
    rawHtml = loadHtmlTemplate();
    const places = loadPlacesData();
    if (maybePlace && (maybePlace.headers || maybePlace.url)) {
      request = maybePlace;
      place = findPlace(rawHtmlOrSlug, places);
    } else if (maybePlace !== undefined) {
      place = maybePlace;
    } else {
      place = findPlace(rawHtmlOrSlug, places);
    }
  }

  let html = normalizeRuntimeAssets(rawHtml);

  if (!place) return html;

  const baseUrl = getBaseUrl(request);
  const name = place['Tên địa điểm'] || place.name || place.Name || 'Địa Điểm Trà Vinh';
  const rawDesc = place['Mô tả chi tiết'] || place['Mô Tả'] || place.description || place.Description || 'Khám phá điểm đến đặc sắc tại Trà Vinh.';
  const desc = rawDesc.length > 160 ? rawDesc.slice(0, 157) + '...' : rawDesc;
  const slug = place.Slug || place.slug || place.ID || place.id || 'dia-diem';

  let image = place['Link Hình Ảnh'] || place.imageLink || place.image_link;
  if (image && typeof image === 'string') {
    image = image.split('\n')[0].trim();
  }
  if (!image || !image.startsWith('http')) {
    image = `${baseUrl}/icons/icon-512.png`;
  }

  const title = `${escapeHtml(name)} - ViVu Trà Vinh`;
  const canonicalUrl = `${baseUrl}/place/${encodeURIComponent(slug)}`;
  const escapedDesc = escapeHtml(desc);
  const escapedImage = escapeHtml(image);

  // 1. Title tag
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);

  // 2. Canonical Link
  html = html.replace(
    /<link rel="canonical" id="canonicalLink" href="[\s\S]*?">/i,
    `<link rel="canonical" id="canonicalLink" href="${canonicalUrl}">`
  );

  // 3. Open Graph Meta Tags
  html = html.replace(
    /<meta property="og:title" content="[\s\S]*?">/i,
    `<meta property="og:title" content="${title}">`
  );
  html = html.replace(
    /<meta property="og:description" content="[\s\S]*?">/i,
    `<meta property="og:description" content="${escapedDesc}">`
  );
  html = html.replace(
    /<meta property="og:url" content="[\s\S]*?">/i,
    `<meta property="og:url" content="${canonicalUrl}">`
  );
  html = html.replace(
    /<meta property="og:image" content="[\s\S]*?">/i,
    `<meta property="og:image" content="${escapedImage}">`
  );

  // 4. Twitter Card Meta Tags
  html = html.replace(
    /<meta name="twitter:title" content="[\s\S]*?">/i,
    `<meta name="twitter:title" content="${title}">`
  );
  html = html.replace(
    /<meta name="twitter:description" content="[\s\S]*?">/i,
    `<meta name="twitter:description" content="${escapedDesc}">`
  );
  html = html.replace(
    /<meta name="twitter:image" content="[\s\S]*?">/i,
    `<meta name="twitter:image" content="${escapedImage}">`
  );

  // 5. Meta Description
  html = html.replace(
    /<meta name="description" content="[\s\S]*?">/i,
    `<meta name="description" content="${escapedDesc}">`
  );

  return html;
}

export default async function handler(request, response) {
  const url = new URL(request.url || '/', `http://${request.headers?.host || 'localhost'}`);
  const pathnameMatch = url.pathname.match(/^\/places?\/([^/?#]+)/i);
  const pathSlug = pathnameMatch ? decodeURIComponent(pathnameMatch[1]) : null;
  const placeParam = url.searchParams.get('place') || url.searchParams.get('slug') || pathSlug || request.query?.place || request.query?.slug;

  const baseHtml = loadHtmlTemplate();
  const places = loadPlacesData();

  const place = findPlace(placeParam, places);
  const finalHtml = renderPlaceHtml(baseHtml, place, request);

  response.statusCode = 200;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=600');
  response.end(finalHtml);
}
