// scripts/preview.js - Lightweight static preview server for dist/
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST_DIR = path.resolve(__dirname, '../dist');

let port = 8080;
for (const arg of process.argv) {
    if (arg.startsWith('--port=')) {
        port = parseInt(arg.split('=')[1], 10);
    }
}
if (process.env.PORT) {
    port = parseInt(process.env.PORT, 10);
}

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8'
};

const server = http.createServer((req, res) => {
    let reqPath = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${port}`).pathname);
    if (reqPath.endsWith('/') || reqPath === '') {
        reqPath += 'index.html';
    }

    const filePath = path.join(DIST_DIR, reqPath);
    if (!filePath.startsWith(DIST_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not Found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': stats.size,
            'Cache-Control': 'no-cache'
        });

        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(port, () => {
    console.log(`[Preview Server] Đang phục vụ dist/ tại: http://localhost:${port}`);
});

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
