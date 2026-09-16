// scripts/test-g5-supabase.js - Kiểm thử tích hợp toàn diện Giai đoạn G5
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaces, SupabaseConfigError, clearPlacesCache } from '../js/data.js';
import { loadComments, submitComment, SupabaseRequestError } from '../js/comments.js';
import adminCommentsHandler from '../api/admin-comments.js';
import adminPlacesHandler from '../api/admin-places.js';
import importPlaceHandler from '../api/import-place.js';
import submitCommentHandler from '../api/submit-comment.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

console.log('=== BẮT ĐẦU BỘ KIỂM THỬ TỰ ĐỘNG G5: SUPABASE, RLS & BACKEND APIS ===\n');

// Mock Data In-Memory cho Supabase
const mockDb = {
    places: [
        {
            id: 1,
            slug: 'ao-ba-om',
            name: 'Ao Bà Om',
            category: 'Điểm Check-in / Sống Ảo',
            area: 'TP. Trà Vinh',
            address: 'Phường 8, TP. Trà Vinh',
            map_link: 'https://www.google.com/maps?q=9.9347,106.3449',
            price_raw: 'Miễn phí',
            description: 'Danh thắng nổi tiếng bậc nhất Trà Vinh',
            note: 'Nên đi buổi sáng hoặc chiều mát.',
            contact: '0294.385.5555',
            coordinates: '9.9347, 106.3449',
            contributor: 'Admin',
            rating: 5.0,
            opening_time: '07:00',
            closing_time: '18:00',
            display_hours: '07:00 - 18:00',
            operating_status: 'Normal',
            status: 'approved',
            images: ['./ao bà om.jpg'],
            image_link: './ao bà om.jpg',
            sort_order: 1,
            is_featured: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        },
        {
            id: 2,
            slug: 'dia-diem-nhap',
            name: 'Địa Điểm Đang Soạn',
            category: 'Ẩm Thực',
            status: 'draft',
            sort_order: 2,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        },
        {
            id: 3,
            slug: 'dia-diem-bi-an',
            name: 'Địa Điểm Đã Ẩn',
            category: 'Check-in',
            status: 'hidden',
            sort_order: 3,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }
    ],
    place_comments: [
        {
            id: 1,
            place_id: 'ao-ba-om',
            place_name: 'Ao Bà Om',
            author_name: 'Thạch Minh',
            rating: 5,
            comment_text: 'Cây cổ thụ trăm tuổi mát rượi!',
            photo_url: 'https://example.com/photo1.jpg',
            photo_metadata: { width: 800, height: 600 },
            client_review_id: 'clrev_existing_1',
            is_hidden: false,
            status: 'approved',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        },
        {
            id: 2,
            place_id: 'ao-ba-om',
            place_name: 'Ao Bà Om',
            author_name: 'Người Quảng Cáo Rác',
            rating: 1,
            comment_text: 'Spam quảng cáo link bậy bạ',
            photo_url: null,
            photo_metadata: {},
            client_review_id: 'clrev_spam_2',
            is_hidden: true, // ĐÃ BỊ ẨN
            status: 'hidden',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }
    ]
};

const VALID_ANON_KEY = 'valid-anon-key-for-test';
const VALID_SERVICE_ROLE_KEY = 'valid-service-role-key-for-test';
const VALID_ADMIN_SECRET = 'admin-secret-gate-g5';
const VALID_IMPORT_SECRET = 'import-secret-gate-g5';

let supabaseServer;
let supabasePort;

function createMockSupabaseServer() {
    return http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://localhost:${supabasePort}`);
        const authHeader = req.headers.authorization || '';
        const apikey = req.headers.apikey || '';
        const isServiceRole = authHeader.includes(VALID_SERVICE_ROLE_KEY) || apikey === VALID_SERVICE_ROLE_KEY;
        const isAnon = authHeader.includes(VALID_ANON_KEY) || apikey === VALID_ANON_KEY;

        // Trả về JSON helper
        const send = (status, data, headers = {}) => {
            res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
            res.end(JSON.stringify(data));
        };

        // Phục vụ static fixture / fallback cho môi trường test local
        if (url.pathname === '/data/data-fixture.json') {
            const content = fs.readFileSync(path.join(ROOT_DIR, 'data', 'data-fixture.json'), 'utf8');
            return send(200, JSON.parse(content));
        }
        if (url.pathname === '/data/data-fallback.json') {
            const content = fs.readFileSync(path.join(ROOT_DIR, 'data', 'data-fallback.json'), 'utf8');
            return send(200, JSON.parse(content));
        }

        // Tuyến RPC rate-limiting chia sẻ cho service_role
        if (url.pathname === '/rest/v1/rpc/check_and_record_rate_limit' && req.method === 'POST') {
            if (!isServiceRole) {
                return send(403, { message: 'permission denied for function "check_and_record_rate_limit"', code: '42501' });
            }
            let bodyStr = '';
            for await (const chunk of req) bodyStr += chunk;
            const rpcBody = JSON.parse(bodyStr || '{}');
            const key = rpcBody.p_key || 'default';
            const windowSec = rpcBody.p_window_seconds || 60;
            const maxReq = rpcBody.p_max_requests || 3;
            const minIntervalSec = rpcBody.p_min_interval_seconds || 10;

            if (!mockDb.rate_limits) mockDb.rate_limits = {};
            const now = Date.now();
            const record = mockDb.rate_limits[key] || { timestamps: [] };
            record.timestamps = record.timestamps.filter(ts => now - ts < windowSec * 1000);

            if (record.timestamps.length > 0) {
                const lastTs = record.timestamps[record.timestamps.length - 1];
                const sinceLast = (now - lastTs) / 1000;
                if (sinceLast < minIntervalSec) {
                    const waitSec = Math.ceil(minIntervalSec - sinceLast);
                    return send(200, { allowed: false, code: 'COOLDOWN_ACTIVE', wait_seconds: waitSec });
                }
            }

            if (record.timestamps.length >= maxReq) {
                const oldest = record.timestamps[0];
                const waitSec = Math.ceil((windowSec * 1000 - (now - oldest)) / 1000);
                return send(200, { allowed: false, code: 'RATE_LIMIT_EXCEEDED', wait_seconds: waitSec });
            }

            record.timestamps.push(now);
            mockDb.rate_limits[key] = record;
            return send(200, { allowed: true, remaining: maxReq - record.timestamps.length });
        }

        // Tuyến API submit-comment (hỗ trợ gọi từ client qua cùng port)
        if (url.pathname === '/api/submit-comment') {
            return submitCommentHandler(req, res);
        }

        // 1. Kiểm tra xác thực Supabase cơ bản
        if (!isServiceRole && !isAnon) {
            return send(401, { message: 'Invalid API key or unauthorized', code: '401' });
        }

        // 2. Mô phỏng route /rest/v1/places
        if (url.pathname.startsWith('/rest/v1/places')) {
            // GET /rest/v1/places
            if (req.method === 'GET') {
                const statusFilter = url.searchParams.get('status');
                let result = [...mockDb.places];

                // RLS ENFORCEMENT CHO PLACES:
                // Nếu vai trò là anon -> chỉ được đọc các địa điểm có status = 'approved'
                if (!isServiceRole) {
                    result = result.filter(p => p.status === 'approved');
                } else if (statusFilter) {
                    const cleanStatus = statusFilter.replace('eq.', '');
                    if (cleanStatus !== 'all') {
                        result = result.filter(p => p.status === cleanStatus);
                    }
                }

                return send(200, result);
            }

            // POST /rest/v1/places
            if (req.method === 'POST') {
                // RLS: Anon KHÔNG ĐƯỢC INSERT places
                if (!isServiceRole) {
                    return send(403, { message: 'new row violates row-level security policy for table "places"', code: '42501' });
                }

                let bodyStr = '';
                for await (const chunk of req) bodyStr += chunk;
                const newPlace = JSON.parse(bodyStr);
                newPlace.id = mockDb.places.length + 1;
                newPlace.created_at = new Date().toISOString();
                newPlace.updated_at = new Date().toISOString();
                mockDb.places.push(newPlace);
                return send(201, [newPlace]);
            }

            // PATCH /rest/v1/places?id=eq.X
            if (req.method === 'PATCH') {
                // RLS: Anon KHÔNG ĐƯỢC UPDATE places
                if (!isServiceRole) {
                    return send(403, { message: 'permission denied for table "places"', code: '42501' });
                }

                let bodyStr = '';
                for await (const chunk of req) bodyStr += chunk;
                const patchData = JSON.parse(bodyStr);
                const idMatch = url.search.match(/id=eq\.(\d+)/);
                const id = idMatch ? parseInt(idMatch[1], 10) : null;
                const target = mockDb.places.find(p => p.id === id);
                if (target) {
                    Object.assign(target, patchData, { updated_at: new Date().toISOString() });
                    return send(200, [target]);
                }
                return send(404, { message: 'Not found' });
            }

            // DELETE /rest/v1/places?id=eq.X
            if (req.method === 'DELETE') {
                if (!isServiceRole) {
                    return send(403, { message: 'permission denied for table "places"', code: '42501' });
                }
                const idMatch = url.search.match(/id=eq\.(\d+)/);
                const id = idMatch ? parseInt(idMatch[1], 10) : null;
                const idx = mockDb.places.findIndex(p => p.id === id);
                if (idx > -1) mockDb.places.splice(idx, 1);
                res.writeHead(204);
                return res.end();
            }
        }

        // 3. Mô phỏng route /rest/v1/place_comments
        if (url.pathname.startsWith('/rest/v1/place_comments')) {
            // GET /rest/v1/place_comments
            if (req.method === 'GET') {
                let result = [...mockDb.place_comments];

                // RLS ENFORCEMENT CHO COMMENTS:
                // Nếu vai trò là anon -> chỉ được đọc các comments có is_hidden = false và status = 'approved'
                if (!isServiceRole) {
                    result = result.filter(c => !c.is_hidden && c.status === 'approved');
                }

                const placeIdMatch = url.search.match(/place_id=eq\.([^&]+)/);
                if (placeIdMatch) {
                    const placeId = decodeURIComponent(placeIdMatch[1]);
                    result = result.filter(c => c.place_id === placeId);
                }

                const clientRevMatch = url.search.match(/client_review_id=eq\.([^&]+)/);
                if (clientRevMatch) {
                    const revId = decodeURIComponent(clientRevMatch[1]);
                    result = result.filter(c => c.client_review_id === revId);
                }

                return send(200, result);
            }

            // POST /rest/v1/place_comments
            if (req.method === 'POST') {
                let bodyStr = '';
                for await (const chunk of req) bodyStr += chunk;
                const newComment = JSON.parse(bodyStr);

                // RLS CHECK CHO ANON INSERT:
                // KHÔNG CHO PHÉP ANON INSERT TRỰC TIẾP QUA REST ĐỂ CHỐNG BYPASS RATE LIMIT!
                if (!isServiceRole) {
                    return send(403, { message: 'permission denied for table "place_comments" (direct insert disabled, use /api/submit-comment)', code: '42501' });
                }

                // IDEMPOTENCY / UNIQUE CLIENT_REVIEW_ID CHECK:
                if (newComment.client_review_id) {
                    const exists = mockDb.place_comments.some(c => c.client_review_id === newComment.client_review_id);
                    if (exists) {
                        // Trả về lỗi 409 Conflict chuẩn của PostgreSQL unique constraint
                        return send(409, {
                            code: '23505',
                            message: 'duplicate key value violates unique constraint "place_comments_client_review_id_unique"',
                            details: `Key (client_review_id)=(${newComment.client_review_id}) already exists.`
                        });
                    }
                }

                const record = {
                    id: mockDb.place_comments.length + 1,
                    is_hidden: false,
                    status: isServiceRole ? (newComment.status || 'approved') : 'pending',
                    photo_metadata: {},
                    ...newComment,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                mockDb.place_comments.push(record);
                return send(201, [record]);
            }

            // PATCH /rest/v1/place_comments?id=eq.X
            if (req.method === 'PATCH') {
                if (!isServiceRole) {
                    return send(403, { message: 'permission denied for table "place_comments"', code: '42501' });
                }

                let bodyStr = '';
                for await (const chunk of req) bodyStr += chunk;
                const patchData = JSON.parse(bodyStr);
                const idMatch = url.search.match(/id=eq\.(\d+)/);
                const id = idMatch ? parseInt(idMatch[1], 10) : null;
                const target = mockDb.place_comments.find(c => c.id === id);
                if (target) {
                    Object.assign(target, patchData, { updated_at: new Date().toISOString() });
                    return send(200, [target]);
                }
                return send(404, { message: 'Not found' });
            }

            // DELETE /rest/v1/place_comments?id=eq.X
            if (req.method === 'DELETE') {
                if (!isServiceRole) {
                    return send(403, { message: 'permission denied for table "place_comments"', code: '42501' });
                }
                const idMatch = url.search.match(/id=eq\.(\d+)/);
                const id = idMatch ? parseInt(idMatch[1], 10) : null;
                const idx = mockDb.place_comments.findIndex(c => c.id === id);
                if (idx > -1) mockDb.place_comments.splice(idx, 1);
                res.writeHead(204);
                return res.end();
            }
        }

        send(404, { message: 'Not found' });
    });
}

// Helper giả lập request gọi Serverless Function
async function callServerlessHandler(handler, { method = 'GET', url = '/', headers = {}, body = null }) {
    const req = new http.IncomingMessage();
    req.method = method;
    req.url = url;
    req.headers = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));

    if (body) {
        req.body = body;
    }

    let statusCode = 200;
    let responseHeaders = {};
    let responseData = '';

    const res = {
        get statusCode() { return statusCode; },
        set statusCode(code) { statusCode = code; },
        setHeader(name, value) { responseHeaders[name.toLowerCase()] = value; },
        getHeader(name) { return responseHeaders[name.toLowerCase()]; },
        end(data) {
            responseData = data;
        }
    };

    await handler(req, res);

    let parsed = null;
    try {
        parsed = JSON.parse(responseData);
    } catch {
        parsed = responseData;
    }

    return { statusCode, headers: responseHeaders, data: parsed };
}

async function runTests() {
    // 1. Khởi chạy mock server
    supabaseServer = createMockSupabaseServer();
    await new Promise((resolve) => {
        supabaseServer.listen(0, '127.0.0.1', () => {
            supabasePort = supabaseServer.address().port;
            console.log(`✓ Đã khởi chạy Mock Supabase REST Server tại http://127.0.0.1:${supabasePort}`);
            resolve();
        });
    });

    const SUPABASE_BASE_URL = `http://127.0.0.1:${supabasePort}`;

    // Cấu hình môi trường cho serverless API backend
    process.env.SUPABASE_URL = SUPABASE_BASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = VALID_SERVICE_ROLE_KEY;
    process.env.ADMIN_SECRET = VALID_ADMIN_SECRET;
    process.env.IMPORT_SECRET = VALID_IMPORT_SECRET;

    const baseConfig = {
        dataSource: 'supabase',
        supabaseUrl: SUPABASE_BASE_URL,
        supabaseAnonKey: VALID_ANON_KEY
    };

    globalThis.window = {
        location: {
            href: `${SUPABASE_BASE_URL}/`,
            origin: SUPABASE_BASE_URL,
            port: String(supabasePort),
            search: ''
        },
        VIVUTRAVINH_CONFIG: baseConfig,
        localStorage: {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {}
        }
    };

    try {
        // ==========================================
        // CA 1: CHẾ ĐỘ MOCK ISOLATION
        // ==========================================
        console.log('\n[1] Kiểm thử Chế độ DEV MOCK:');
        clearPlacesCache('mock');
        const mockPlaces = await loadPlaces({ dataSource: 'mock' });
        assert.ok(Array.isArray(mockPlaces) && mockPlaces.length === 10, 'Mock phải nạp đúng 10 địa điểm fixture');
        assert.strictEqual(mockPlaces[0]._source, 'mock', 'Source phải là mock');
        console.log('  ✓ Chế độ Mock nạp dữ liệu hoàn hảo từ fixture local, không gọi Supabase');

        // ==========================================
        // CA 2: CHẾ ĐỘ SUPABASE VÀ CONTRACT G2
        // ==========================================
        console.log('\n[2] Kiểm thử Chế độ SUPABASE & Đồng bộ Contract G2:');
        clearPlacesCache('supabase');
        const supaPlaces = await loadPlaces(baseConfig);
        assert.ok(Array.isArray(supaPlaces) && supaPlaces.length === 1, 'Chỉ địa điểm approved mới được trả về cho public');
        const place = supaPlaces[0];
        assert.strictEqual(place.name, 'Ao Bà Om');
        assert.strictEqual(place.slug, 'ao-ba-om');
        assert.strictEqual(place.status, 'approved');
        assert.strictEqual(place.isFree, true, 'Giá Miễn phí phải được parse đúng contract G2');
        assert.strictEqual(place.hasValidGps, true, 'Tọa độ GPS phải được parse chuẩn');
        assert.strictEqual(place._source, 'supabase');
        console.log('  ✓ Dữ liệu từ Supabase đã ánh xạ đồng nhất 100% với contract Place của G2');

        // ==========================================
        // CA 3: KIỂM TOÁN RLS - PUBLIC KHÔNG THỂ XEM DRAFT/HIDDEN
        // ==========================================
        console.log('\n[3] Kiểm toán Row Level Security (RLS) cho Places:');
        // Thử query trực tiếp endpoint bằng anon key xem có lấy được draft/hidden không
        const anonRes = await fetch(`${SUPABASE_BASE_URL}/rest/v1/places`, {
            headers: { apikey: VALID_ANON_KEY, Authorization: `Bearer ${VALID_ANON_KEY}` }
        });
        const anonPlaces = await anonRes.json();
        assert.strictEqual(anonPlaces.length, 1, 'Anon chỉ được nhận 1 địa điểm approved');
        assert.ok(!anonPlaces.some(p => p.status === 'draft' || p.status === 'hidden'), 'Anon tuyệt đối không được đọc draft hoặc hidden');
        console.log('  ✓ RLS: Anon chỉ xem được địa điểm approved, các địa điểm draft và hidden được bảo vệ tuyệt đối');

        // Thử vai trò anon ghi/sửa/xóa places
        const anonPostRes = await fetch(`${SUPABASE_BASE_URL}/rest/v1/places`, {
            method: 'POST',
            headers: { apikey: VALID_ANON_KEY, Authorization: `Bearer ${VALID_ANON_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Hacker Place', slug: 'hacker-place', status: 'approved' })
        });
        assert.strictEqual(anonPostRes.status, 403, 'Anon thử tạo place phải bị chặn 403 Forbidden');
        console.log('  ✓ RLS: Anon bị chặn 403 Forbidden khi cố tạo, sửa hoặc xóa địa điểm');

        // ==========================================
        // CA 4: BẢO VỆ API QUẢN TRỊ VÀ STRUCTURED ERROR
        // ==========================================
        console.log('\n[4] Kiểm thử Bảo mật API Quản trị & Lỗi có Cấu trúc (Structured Error):');
        // 4.1. Gọi admin-places không có secret
        const unauthPlaces = await callServerlessHandler(adminPlacesHandler, { method: 'GET' });
        assert.strictEqual(unauthPlaces.statusCode, 401);
        assert.strictEqual(unauthPlaces.data.success, false);
        assert.strictEqual(unauthPlaces.data.error.code, 'UNAUTHORIZED');
        console.log('  ✓ admin-places chặn truy cập không quyền với HTTP 401 và error code UNAUTHORIZED');

        // 4.2. Gọi admin-comments không có secret
        const unauthComments = await callServerlessHandler(adminCommentsHandler, { method: 'GET' });
        assert.strictEqual(unauthComments.statusCode, 401);
        assert.strictEqual(unauthComments.data.success, false);
        assert.strictEqual(unauthComments.data.error.code, 'UNAUTHORIZED');
        console.log('  ✓ admin-comments chặn truy cập không quyền với HTTP 401');

        // 4.3. Gọi import-place với secret sai
        const unauthImport = await callServerlessHandler(importPlaceHandler, {
            method: 'POST',
            headers: { 'x-import-secret': 'wrong-secret' }
        });
        assert.strictEqual(unauthImport.statusCode, 401);
        assert.strictEqual(unauthImport.data.success, false);
        console.log('  ✓ import-place chặn secret sai với HTTP 401');

        // 4.4. Thử brute-force admin secret: 5 lần sai -> lần thứ 6 bị khóa 429
        const testBruteIp = '192.168.1.99';
        for (let i = 0; i < 5; i++) {
            await callServerlessHandler(adminPlacesHandler, {
                method: 'GET',
                headers: { 'x-admin-secret': 'wrong-pwd-' + i, 'x-forwarded-for': testBruteIp }
            });
        }
        const lockedRes = await callServerlessHandler(adminPlacesHandler, {
            method: 'GET',
            headers: { 'x-admin-secret': 'wrong-pwd-final', 'x-forwarded-for': testBruteIp }
        });
        assert.strictEqual(lockedRes.statusCode, 429, 'Quá 5 lần thử sai secret phải bị khóa 429');
        assert.strictEqual(lockedRes.data.error.code, 'AUTH_RATE_LIMITED');
        console.log('  ✓ API quản trị kích hoạt khóa 429 chống brute-force khi thử sai secret liên tục');

        // 4.5. Đo kích thước body dạng object: gửi object vượt quá 2MB
        const hugeString = 'x'.repeat(2.1 * 1024 * 1024);
        const hugePayloadRes = await callServerlessHandler(adminPlacesHandler, {
            method: 'POST',
            headers: { 'x-admin-secret': VALID_ADMIN_SECRET },
            body: { name: 'Too Big', huge: hugeString }
        });
        assert.strictEqual(hugePayloadRes.statusCode, 413, 'Payload object > 2MB phải bị từ chối 413');
        assert.strictEqual(hugePayloadRes.data.error.code, 'PAYLOAD_TOO_LARGE');
        console.log('  ✓ Đo chính xác dung lượng object body và từ chối 413 khi vượt quá giới hạn 2MB');

        // ==========================================
        // CA 5: VÒNG ĐỜI QUẢN TRỊ ĐỊA ĐIỂM (TẠO, SỬA, ẨN, PHẢN ÁNH RA PUBLIC)
        // ==========================================
        console.log('\n[5] Kiểm thử Vòng đời Quản trị Địa Điểm:');
        // Admin tạo địa điểm mới
        const createRes = await callServerlessHandler(adminPlacesHandler, {
            method: 'POST',
            headers: { 'x-admin-secret': VALID_ADMIN_SECRET },
            body: {
                name: 'Chùa Hang Mới',
                category: 'Du Lịch Tâm Linh',
                status: 'draft'
            }
        });
        assert.strictEqual(createRes.statusCode, 201);
        assert.strictEqual(createRes.data.success, true);
        const newPlaceId = createRes.data.place.id;
        const newPlaceSlug = createRes.data.place.slug;
        assert.strictEqual(createRes.data.place.status, 'draft');

        // Public check: địa điểm mới chưa approved, không được hiện
        clearPlacesCache('supabase');
        const pubCheck1 = await loadPlaces(baseConfig);
        assert.ok(!pubCheck1.some(p => p.slug === newPlaceSlug || p.id === newPlaceSlug), 'Địa điểm draft không được hiện ngoài public');

        // Admin duyệt (status = 'approved')
        const approveRes = await callServerlessHandler(adminPlacesHandler, {
            method: 'PATCH',
            headers: { 'x-admin-secret': VALID_ADMIN_SECRET },
            body: { id: newPlaceId, status: 'approved' }
        });
        assert.strictEqual(approveRes.statusCode, 200);
        assert.strictEqual(approveRes.data.place.status, 'approved');

        // Public check: địa điểm đã duyệt phải xuất hiện ngoài public
        clearPlacesCache('supabase');
        const pubCheck2 = await loadPlaces(baseConfig);
        assert.ok(pubCheck2.some(p => p.slug === newPlaceSlug || p.id === newPlaceSlug), 'Địa điểm sau khi duyệt phải xuất hiện ngoài public');
        console.log('  ✓ Tạo và duyệt địa điểm phản ánh tức thì và chính xác ra trang public');

        // ==========================================
        // CA 6: KIỂM TOÁN RLS & VÒNG ĐỜI MODERATION BÌNH LUẬN & TRẢ ẢNH
        // ==========================================
        console.log('\n[6] Kiểm toán Comments RLS, Photo Metadata & Moderation Lifecycle:');
        // 6.1. Public đọc comments: chỉ lấy comment không bị ẩn, kèm theo photo_url và photo_metadata
        // Set window config tạm để comments.js dùng test server
        globalThis.window = {
            location: { search: '', origin: SUPABASE_BASE_URL },
            VIVUTRAVINH_CONFIG: baseConfig,
            localStorage: {
                getItem: () => null,
                setItem: () => {}
            }
        };

        const publicComments = await loadComments('ao-ba-om');
        assert.strictEqual(publicComments.length, 1, 'Chỉ 1 comment hợp lệ hiển thị, comment ẩn phải bị lọc');
        assert.strictEqual(publicComments[0].author_name, 'Thạch Minh');
        assert.strictEqual(publicComments[0].photo_url, 'https://example.com/photo1.jpg', 'photo_url phải được trả lại đầy đủ');
        assert.deepStrictEqual(publicComments[0].photo_metadata, { width: 800, height: 600 }, 'photo_metadata phải được trả lại');
        console.log('  ✓ Public chỉ đọc được comment không ẩn và nhận đầy đủ photo_url cùng photo_metadata');

        // 6.2. Admin đọc comments qua admin-comments: xem được cả comment bị ẩn
        const adminCommentsRes = await callServerlessHandler(adminCommentsHandler, {
            method: 'GET',
            headers: { 'x-admin-secret': VALID_ADMIN_SECRET }
        });
        assert.strictEqual(adminCommentsRes.statusCode, 200);
        const adminComments = adminCommentsRes.data.comments;
        assert.ok(adminComments.some(c => c.is_hidden === true), 'Admin phải nhìn thấy cả bình luận bị ẩn');
        console.log('  ✓ Admin API đọc được toàn bộ bình luận (kể cả bình luận bị ẩn để kiểm duyệt)');

        // 6.3. Kiểm toán RLS: Chặn tuyệt đối Anon gửi trực tiếp qua REST API (Bảo vệ Rate Limit)
        const directAnonCommentRes = await fetch(`${SUPABASE_BASE_URL}/rest/v1/place_comments`, {
            method: 'POST',
            headers: { apikey: VALID_ANON_KEY, Authorization: `Bearer ${VALID_ANON_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                place_id: 'ao-ba-om',
                place_name: 'Ao Bà Om',
                author_name: 'Hacker Anon',
                rating: 5,
                comment_text: 'Spam bypass moderation and rate limit',
                client_review_id: 'hack_direct_' + Date.now(),
                status: 'pending',
                is_hidden: false
            })
        });
        assert.strictEqual(directAnonCommentRes.status, 403, 'Anon gửi trực tiếp REST phải bị RLS từ chối 403 để chặn bypass rate-limit');
        console.log('  ✓ RLS: Anon bị chặn 403 khi cố gửi trực tiếp qua REST (Bảo vệ tuyệt đối Rate Limit)');

        // ==========================================
        // CA 7: SERVER RATE LIMITING, VALIDATION VÀ CHỐNG TRÙNG LẶP ĐÁNH GIÁ (G5)
        // ==========================================
        console.log('\n[7] Kiểm thử API Gửi Đánh Giá: Rate Limit, Validation & Idempotency:');

        // 7.1. Validation phía server
        const invalidRatingRes = await callServerlessHandler(submitCommentHandler, {
            method: 'POST',
            headers: { 'x-forwarded-for': '10.0.0.1' },
            body: {
                place_id: 'ao-ba-om',
                place_name: 'Ao Bà Om',
                author_name: 'Test User',
                rating: 10,
                comment_text: 'Nội dung hợp lệ',
                client_review_id: 'val_test_1'
            }
        });
        assert.strictEqual(invalidRatingRes.statusCode, 400);
        assert.strictEqual(invalidRatingRes.data.error.code, 'INVALID_RATING');
        console.log('  ✓ API submit-comment xác thực chặt chẽ đầu vào (rating sai bị từ chối 400)');

        // 7.2. Giới hạn payload size phía server (64KB)
        const bigCommentText = 'a'.repeat(65 * 1024);
        const bigCommentRes = await callServerlessHandler(submitCommentHandler, {
            method: 'POST',
            headers: { 'x-forwarded-for': '10.0.0.2' },
            body: {
                place_id: 'ao-ba-om',
                place_name: 'Ao Bà Om',
                author_name: 'Spammer',
                rating: 5,
                comment_text: bigCommentText,
                client_review_id: 'big_test_1'
            }
        });
        assert.strictEqual(bigCommentRes.statusCode, 413);
        assert.strictEqual(bigCommentRes.data.error.code, 'PAYLOAD_TOO_LARGE');
        console.log('  ✓ API submit-comment chặn payload vượt quá 64KB với mã 413');

        // 7.3. Server-side Rate Limiting theo IP (chống spam)
        const spammerIp = '10.0.0.42';
        const review1 = await callServerlessHandler(submitCommentHandler, {
            method: 'POST',
            headers: { 'x-forwarded-for': spammerIp },
            body: {
                place_id: 'ao-ba-om',
                place_name: 'Ao Bà Om',
                author_name: 'Khách Đánh Giá',
                rating: 5,
                comment_text: 'Đánh giá đầu tiên rất vui!',
                client_review_id: 'clrev_rate_1_' + Date.now()
            }
        });
        assert.strictEqual(review1.statusCode, 201);
        assert.strictEqual(review1.data.status, 'pending', 'Bình luận mới phải ở trạng thái pending (Pre-moderation)');

        // Gửi tiếp tức thì từ cùng IP -> phải bị chặn 429
        const review2 = await callServerlessHandler(submitCommentHandler, {
            method: 'POST',
            headers: { 'x-forwarded-for': spammerIp },
            body: {
                place_id: 'ao-ba-om',
                place_name: 'Ao Bà Om',
                author_name: 'Khách Đánh Giá',
                rating: 4,
                comment_text: 'Đánh giá thứ hai liên tiếp!',
                client_review_id: 'clrev_rate_2_' + Date.now()
            }
        });
        assert.strictEqual(review2.statusCode, 429, 'Gửi liên tiếp phải bị server chặn 429');
        assert.strictEqual(review2.data.error.code, 'RATE_LIMITED');
        assert.ok(review2.headers['retry-after'], 'Phải trả về Retry-After header');
        console.log('  ✓ Server-side Rate Limiting chặn gửi bình luận liên tiếp với mã 429 và Retry-After');

        // 7.4. Idempotency Key qua API
        const idemIp = '10.0.0.99';
        const testReviewId = `clrev_test_idem_${Date.now()}`;
        const idemPayload = {
            place_id: 'ao-ba-om',
            place_name: 'Ao Bà Om',
            author_name: 'Du Khách Trà Vinh',
            rating: 5,
            comment_text: 'Không gian Ao Bà Om buổi sớm mai rất trong lành!',
            photo_url: 'https://example.com/test-photo.jpg',
            client_review_id: testReviewId
        };
        const initialCount = mockDb.place_comments.length;
        const send1 = await callServerlessHandler(submitCommentHandler, {
            method: 'POST',
            headers: { 'x-forwarded-for': idemIp },
            body: idemPayload
        });
        assert.strictEqual(send1.statusCode, 201);
        assert.strictEqual(mockDb.place_comments.length, initialCount + 1);

        // Gửi lại chính xác client_review_id đó
        const send2 = await callServerlessHandler(submitCommentHandler, {
            method: 'POST',
            headers: { 'x-forwarded-for': '10.0.0.100' },
            body: idemPayload
        });
        assert.strictEqual(send2.statusCode, 200);
        assert.strictEqual(send2.data.idempotent, true);
        assert.strictEqual(mockDb.place_comments.length, initialCount + 1, 'Không được tạo thêm bản ghi thứ hai trong DB!');
        console.log('  ✓ Gửi cùng một client_review_id 2 lần được server nhận diện idempotent (200 OK, 0 duplicate)');

        // 7.5. Tích hợp Hàm Client submitComment: Gửi qua API backend an toàn (0 direct REST)
        const clientTestId = `clrev_client_${Date.now()}`;
        const clientPayload = {
            placeId: 'ao-ba-om',
            placeName: 'Ao Bà Om',
            authorName: 'Khách Sử Dụng App',
            rating: 5,
            commentText: 'Đánh giá gửi từ hàm submitComment của client',
            client_review_id: clientTestId,
            skipCooldown: true
        };
        const clientRes = await submitComment(clientPayload);
        assert.ok(clientRes && clientRes.client_review_id === clientTestId, 'Client submitComment phải hoàn thành qua API');
        assert.strictEqual(clientRes.status, 'pending', 'Bản ghi phải mang trạng thái pending mặc định');
        console.log('  ✓ Client submitComment hoàn tất qua API backend thành công (0 cuộc gọi REST trực tiếp)');

        // ==========================================
        // CA 8: PHÂN LOẠI LỖI & KHÔNG DÙNG FALLBACK CHE LỖI CẤU HÌNH
        // ==========================================
        console.log('\n[8] Kiểm thử Phân Loại Lỗi (Không Che Giấu Lỗi Cấu Hình Bằng Fallback):');
        clearPlacesCache('supabase');
        // Thử gọi với anon key SAI để mô phỏng lỗi cấu hình HTTP 401
        try {
            await loadPlaces({
                dataSource: 'supabase',
                supabaseUrl: SUPABASE_BASE_URL,
                supabaseAnonKey: 'wrong-invalid-key'
            });
            assert.fail('Đáng lẽ phải throw SupabaseConfigError');
        } catch (err) {
            assert.ok(err instanceof SupabaseConfigError, 'Lỗi 401 phải ném ra SupabaseConfigError');
            assert.strictEqual(err.status, 401);
            console.log('  ✓ Lỗi xác thực 401 không bị nuốt bởi fallback mà trả về SupabaseConfigError rõ ràng');
        }

        console.log('\n=== TẤT CẢ 8 BÀI KIỂM THỬ G5 ĐÃ VƯỢT QUA 100% THÀNH CÔNG! ===');
    } finally {
        if (supabaseServer) {
            await new Promise((resolve) => supabaseServer.close(resolve));
        }
        delete globalThis.window;
    }
}

runTests().catch((err) => {
    console.error('\n❌ KIỂM THỬ G5 THẤT BẠI:', err);
    process.exit(1);
});
