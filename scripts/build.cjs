// scripts/build.js - Production Build Script for ViVuTraVinh
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

console.log('=== BẮT ĐẦU QUY TRÌNH BUILD PRODUCTION VIVUTRAVINH (DIST) ===\n');

// 1. Dọn dẹp và tạo lại thư mục dist/
if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });
fs.mkdirSync(path.join(DIST_DIR, 'css'), { recursive: true });
fs.mkdirSync(path.join(DIST_DIR, 'vendor'), { recursive: true });

// 2. Biên dịch Tailwind CSS tĩnh
console.log('1. Biên dịch Tailwind CSS tĩnh từ css/input.css sang dist/css/tailwind.css:');
try {
    execSync('npx tailwindcss -i css/input.css -o dist/css/tailwind.css --minify', {
        cwd: ROOT_DIR,
        stdio: 'inherit'
    });
    const cssStat = fs.statSync(path.join(DIST_DIR, 'css', 'tailwind.css'));
    console.log(`  ✓ Đã sinh dist/css/tailwind.css (${(cssStat.size / 1024).toFixed(1)} KB)`);
} catch (err) {
    console.error('  ❌ Lỗi khi biên dịch Tailwind CSS:', err);
    process.exit(1);
}

// 3. Sao chép tài nguyên tĩnh vendor (Leaflet, Fonts)
console.log('\n2. Sao chép thư viện cục bộ (Leaflet, Material Symbols Fonts):');
fs.cpSync(path.join(ROOT_DIR, 'vendor'), path.join(DIST_DIR, 'vendor'), { recursive: true });
console.log('  ✓ Đã sao chép vendor/ (Leaflet CSS/JS/images & Material Symbols woff2/css)');

// 4. Sao chép các thư mục ứng dụng
console.log('\n3. Sao chép module JS, dữ liệu và icons vào dist/:');
fs.cpSync(path.join(ROOT_DIR, 'js'), path.join(DIST_DIR, 'js'), { recursive: true });
fs.cpSync(path.join(ROOT_DIR, 'data'), path.join(DIST_DIR, 'data'), { recursive: true });
fs.cpSync(path.join(ROOT_DIR, 'icons'), path.join(DIST_DIR, 'icons'), { recursive: true });

// Sao chép các file ảnh JPG gốc
const files = fs.readdirSync(ROOT_DIR);
for (const file of files) {
    if (file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.png') || file === 'manifest.json' || file === 'robots.txt' || file === 'sitemap.xml' || file === 'CNAME' || file === 'admin.html') {
        fs.copyFileSync(path.join(ROOT_DIR, file), path.join(DIST_DIR, file));
    }
}
console.log('  ✓ Đã sao chép js/, data/, icons/ và hình ảnh di sản vào dist/');

// 5. Chuyển đổi index.html cho bản phân phối dist/ (loại bỏ hoàn toàn CDN)
console.log('\n4. Chuyển đổi index.html sang dist/index.html (Offline 100% không CDN):');
let indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');

// Thay thế Google Fonts & Font Awesome bằng local Material Symbols CSS
const cdnFontsRegex = /<!-- Google Fonts & Material Symbols Icons -->[\s\S]*?<!-- Leaflet CSS -->/;
indexHtml = indexHtml.replace(cdnFontsRegex, `<!-- Local Self-Hosted Material Symbols Icons & Fonts -->\n    <link rel="stylesheet" href="./vendor/fonts/material-symbols.css">\n\n    <!-- Leaflet CSS -->`);

// Thay thế unpkg Leaflet CSS bằng local Leaflet CSS
indexHtml = indexHtml.replace(
    /<link rel="stylesheet" href="https:\/\/unpkg\.com\/leaflet@[^"]+\/dist\/leaflet\.css"[^>]*>/,
    `<link rel="stylesheet" href="./vendor/leaflet/leaflet.css">`
);

// Thay thế Tailwind CDN bằng local tailwind.css
const tailwindCdnRegex = /<!-- Tailwind CSS with custom design tokens from Stitch -->[\s\S]*?<\/script>\s*<script>[\s\S]*?tailwind\.config =[\s\S]*?<\/script>/;
indexHtml = indexHtml.replace(
    tailwindCdnRegex,
    `<!-- Tailwind CSS Static Compiled Build -->\n    <link rel="stylesheet" href="./css/tailwind.css">`
);

// Thay thế unpkg Leaflet JS bằng local Leaflet JS
indexHtml = indexHtml.replace(
    /<script src="https:\/\/unpkg\.com\/leaflet@[^"]+\/dist\/leaflet\.js"[^>]*><\/script>/,
    `<script src="./vendor/leaflet/leaflet.js"></script>`
);

fs.writeFileSync(path.join(DIST_DIR, 'index.html'), indexHtml, 'utf8');
console.log('  ✓ Đã tạo dist/index.html độc lập hoàn toàn');

// 6. Sao chép service-worker.js vào dist/
console.log('\n5. Sao chép Service Worker và tạo metadata version:');
fs.copyFileSync(path.join(ROOT_DIR, 'service-worker.js'), path.join(DIST_DIR, 'service-worker.js'));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));

// Tính toán chính xác dung lượng gói precache ngoại tuyến từ service-worker.js
const swContent = fs.readFileSync(path.join(ROOT_DIR, 'service-worker.js'), 'utf8');
const shellMatch = swContent.match(/const APP_SHELL_URLS = \[([\s\S]*?)\];/);
const dataMatch = swContent.match(/const DATA_URLS = \[([\s\S]*?)\];/);

let precacheUrls = [];
if (shellMatch) {
    const urls = shellMatch[1].match(/'([^']+)'/g)?.map(s => s.replace(/'/g, '')) || [];
    precacheUrls.push(...urls);
}
if (dataMatch) {
    const urls = dataMatch[1].match(/'([^']+)'/g)?.map(s => s.replace(/'/g, '')) || [];
    precacheUrls.push(...urls);
}

const uniquePrecacheFiles = new Set();
for (const relUrl of precacheUrls) {
    let clean = relUrl.replace(/^\.\//, '');
    if (!clean || clean === '/') clean = 'index.html';
    uniquePrecacheFiles.add(clean);
}

let precacheSizeBytes = 0;
for (const file of uniquePrecacheFiles) {
    const filePath = path.join(DIST_DIR, file);
    if (fs.existsSync(filePath)) {
        precacheSizeBytes += fs.statSync(filePath).size;
    }
}
const precacheMib = (precacheSizeBytes / (1024 * 1024)).toFixed(2);
const precacheMb = (precacheSizeBytes / 1000000).toFixed(1);

const versionInfo = {
    version: pkg.version,
    name: pkg.name,
    buildTime: new Date().toISOString(),
    environment: 'production',
    precacheSizeBytes,
    precacheSizeMib: `${precacheMib} MiB`,
    precacheSizeFormatted: `~${precacheMb} MB (Precache ${precacheMib} MiB)`
};
fs.writeFileSync(path.join(DIST_DIR, 'version.json'), JSON.stringify(versionInfo, null, 2), 'utf8');
console.log(`  ✓ Đã sinh dist/version.json (v${pkg.version}, Precache: ~${precacheMb} MB / ${precacheMib} MiB)`);

// 7. Thống kê kích thước bundle
console.log('\n6. Thống kê kích thước bản build dist/:');
function getDirSize(dir) {
    let total = 0;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            total += getDirSize(full);
        } else {
            total += fs.statSync(full).size;
        }
    }
    return total;
}

const htmlSize = fs.statSync(path.join(DIST_DIR, 'index.html')).size;
const cssSize = fs.statSync(path.join(DIST_DIR, 'css', 'tailwind.css')).size;
const jsSize = getDirSize(path.join(DIST_DIR, 'js'));
const totalSize = getDirSize(DIST_DIR);

console.log(`  - HTML chính: ${(htmlSize / 1024).toFixed(1)} KB`);
console.log(`  - CSS tĩnh: ${(cssSize / 1024).toFixed(1)} KB`);
console.log(`  - JS modules: ${(jsSize / 1024).toFixed(1)} KB`);
console.log(`  - Gói dữ liệu ngoại tuyến (Precache App Shell + Data): ${precacheMib} MiB (~${precacheMb} MB)`);
console.log(`  - Tổng dung lượng dist/ (bao gồm ảnh & font local): ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);

console.log('\n=== BUILD PRODUCTION THÀNH CÔNG RỰC RỠ! ===');
