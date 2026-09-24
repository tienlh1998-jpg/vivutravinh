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
    const pSlug = String(p.Slug || p.slug || '').trim().toLowerCase();
    const pId = String(p.ID || p.id || '').trim().toLowerCase();
    const pDbId = p.dbId ? String(p.dbId).trim().toLowerCase() : '';

    return pSlug === q || pId === q || pDbId === q;
  }) || null;
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

export function renderNotFoundHtml(rawHtml, slug, request) {
  const baseUrl = getBaseUrl(request);
  let html = normalizeRuntimeAssets(rawHtml || loadHtmlTemplate());

  const title = 'ViVuTraVinh - Không Tìm Thấy Địa Điểm';
  const desc = 'Địa điểm không tồn tại hoặc chưa được xuất bản trên ViVu Trà Vinh.';
  const canonicalUrl = baseUrl;
  const imageUrl = `${baseUrl}/icons/icon-512.png`;

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  html = html.replace(
    /<link rel="canonical" id="canonicalLink" href="[\s\S]*?">/i,
    `<link rel="canonical" id="canonicalLink" href="${canonicalUrl}">`
  );
  html = html.replace(/<meta property="og:title" content="[\s\S]*?">/i, `<meta property="og:title" content="${title}">`);
  html = html.replace(/<meta property="og:description" content="[\s\S]*?">/i, `<meta property="og:description" content="${desc}">`);
  html = html.replace(/<meta property="og:url" content="[\s\S]*?">/i, `<meta property="og:url" content="${canonicalUrl}">`);
  html = html.replace(/<meta property="og:image" content="[\s\S]*?">/i, `<meta property="og:image" content="${imageUrl}">`);
  html = html.replace(/<meta name="twitter:title" content="[\s\S]*?">/i, `<meta name="twitter:title" content="${title}">`);
  html = html.replace(/<meta name="twitter:description" content="[\s\S]*?">/i, `<meta name="twitter:description" content="${desc}">`);
  html = html.replace(/<meta name="twitter:image" content="[\s\S]*?">/i, `<meta name="twitter:image" content="${imageUrl}">`);
  html = html.replace(/<meta name="description" content="[\s\S]*?">/i, `<meta name="description" content="${desc}">`);

  return html;
}

export async function querySupabasePlace(slug, options = {}) {
  if (!slug || typeof slug !== 'string') return null;
  const cleanSlug = slug.trim().toLowerCase();
  if (!cleanSlug) return null;

  if (options.mockPlace !== undefined) {
    if (!options.mockPlace) return null;
    const mpSlug = String(options.mockPlace.slug || options.mockPlace.Slug || '').trim().toLowerCase();
    const mpStatus = String(options.mockPlace.status || options.mockPlace['Trạng Thái'] || '').trim().toLowerCase();
    if (mpSlug === cleanSlug && (mpStatus === 'approved' || mpStatus === 'duyệt')) {
      return options.mockPlace;
    }
    return null;
  }

  const env = options.env || process.env;

  // Trong unit test chạy không có test server (VIVU_TEST=1 và không có options.supabaseUrl):
  // cho phép tra cứu trong test dataset nếu đã được duyệt
  if (env.VIVU_TEST === '1' && !options.supabaseUrl) {
    const places = loadPlacesData();
    const p = findPlace(cleanSlug, places);
    if (p) {
      const s = String(p.status || p['Trạng Thái'] || '').trim().toLowerCase();
      if (s === 'approved' || s === 'duyệt') return p;
    }
    return null;
  }

  const fetchFn = options.fetchFn || globalThis.fetch;
  const supabaseUrl = (options.supabaseUrl || env.SUPABASE_URL || 'https://foyraoimhksfvlxndwxr.supabase.co').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
  const supabaseKey = options.supabaseKey || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZveXJhb2ltaGtzZnZseG5kd3hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjkwNzAsImV4cCI6MjA5NTMwNTA3MH0.ARJ173UkVNCichCiJmVrbp2aTByVoXnSEAIsIvbnYJ8';

  try {
    const url = `${supabaseUrl}/rest/v1/places?slug=eq.${encodeURIComponent(cleanSlug)}&status=eq.approved&select=*`;
    const res = await fetchFn(url, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const place = data[0];
    const placeSlug = String(place.slug || place.Slug || '').trim().toLowerCase();
    const placeStatus = String(place.status || place['Trạng Thái'] || '').trim().toLowerCase();
    if (placeSlug !== cleanSlug || (placeStatus !== 'approved' && placeStatus !== 'duyệt')) {
      return null;
    }
    return place;
  } catch (err) {
    if (env.VIVU_TEST === '1' && !options.supabaseUrl) {
      const places = loadPlacesData();
      const p = findPlace(cleanSlug, places);
      if (p) {
        const s = String(p.status || p['Trạng Thái'] || '').trim().toLowerCase();
        if (s === 'approved' || s === 'duyệt') return p;
      }
    }
    return null;
  }
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

  if (!place) {
    return renderNotFoundHtml(html, typeof rawHtmlOrSlug === 'string' ? rawHtmlOrSlug : '', request);
  }

  const baseUrl = getBaseUrl(request);
  const name = place['Tên địa điểm'] || place.name || place.Name || 'Địa Điểm Trà Vinh';
  const rawDesc = place['Mô tả chi tiết'] || place['Mô Tả'] || place.description || place.Description || 'Khám phá điểm đến đặc sắc tại Trà Vinh.';
  const desc = rawDesc.length > 160 ? rawDesc.slice(0, 157) + '...' : rawDesc;
  const slug = place.Slug || place.slug || place.ID || place.id || 'dia-diem';

  let image = null;
  if (Array.isArray(place.images) && place.images.length > 0 && typeof place.images[0] === 'string' && place.images[0].trim()) {
    image = place.images[0].trim();
  } else if (place['Link Hình Ảnh'] || place.imageLink || place.image_link) {
    const rawImg = place['Link Hình Ảnh'] || place.imageLink || place.image_link;
    if (typeof rawImg === 'string' && rawImg.trim()) {
      image = rawImg.split('\n')[0].trim();
    }
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

export default async function handler(request, response, options = {}) {
  const url = new URL(request.url || '/', `http://${request.headers?.host || 'localhost'}`);
  const pathnameMatch = url.pathname.match(/^\/places?\/([^/?#]+)/i);
  const pathSlug = pathnameMatch ? decodeURIComponent(pathnameMatch[1]) : null;
  const placeParam = url.searchParams.get('place') || url.searchParams.get('slug') || pathSlug || request.query?.place || request.query?.slug;

  const baseHtml = loadHtmlTemplate();

  if (!placeParam) {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=600');
    response.end(baseHtml);
    return;
  }

  const slug = String(placeParam).trim().toLowerCase();

  // Production query live Supabase theo exact slug và status=approved
  // Tuyệt đối không dùng data-fixture.json hoặc data-fallback.json để công khai slug chưa approved
  const place = await querySupabasePlace(slug, options);

  if (!place) {
    response.statusCode = 404;
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.end(renderNotFoundHtml(baseHtml, slug, request));
    return;
  }

  const finalHtml = renderPlaceHtml(baseHtml, place, request);

  response.statusCode = 200;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=600');
  response.end(finalHtml);
}
