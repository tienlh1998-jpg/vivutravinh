// scripts/test-g9.js
// Bộ kiểm thử tự động G9.1: Data Quality Contract & Shared Validator
// Kiểm tra toàn diện các quy tắc validation, edge cases, immutability, API 422 behavior và UI approve blocking.

import assert from 'assert';
import http from 'http';
import {
  validatePlace,
  validatePatchForApprovedLegacy,
  validateCoordinates,
  validateGoogleMapsUrl,
  validateTimeFormat,
  inspectSafeUrl,
  hasPriceValue,
  hasTimeValue,
  TRA_VINH_BOUNDS,
  VALID_PLACE_STATUSES,
  ALLOWED_GOOGLE_MAPS_HOSTS
} from '../js/place-validator.js';
import placesHandler from '../api/admin-places.js';
import { openPlacePreview } from '../js/admin.js';

let passedTests = 0;
let totalTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.stack || err.message}`);
    throw err;
  }
}

function createMockReqRes(options = {}) {
  const req = {
    method: options.method || 'GET',
    url: options.url || '/api/admin-places',
    headers: {
      host: 'localhost',
      'x-forwarded-for': options.ip || '127.0.0.1',
      ...(options.headers || {})
    },
    body: options.body || null,
    async *[Symbol.asyncIterator]() {
      if (options.body) {
        yield Buffer.from(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }
    }
  };

  let resData = '';
  let resStatus = 200;
  const resHeaders = {};

  const res = {
    statusCode: 200,
    setHeader(key, val) {
      resHeaders[key.toLowerCase()] = val;
    },
    end(data) {
      if (data) resData += data;
      resStatus = this.statusCode;
    },
    getStatus() {
      return resStatus;
    },
    getHeader(key) {
      return resHeaders[key.toLowerCase()];
    },
    getBody() {
      try {
        return JSON.parse(resData);
      } catch {
        return resData;
      }
    }
  };

  return { req, res };
}

// ----------------------------------------------------------------------------
// Mock Server phục vụ Test API Backend
// ----------------------------------------------------------------------------
let mockRpcCalled = false;
let mockRpcCalls = [];
let mockPlacesDb = [];
let mockServer;
let mockPort;

function startMockSupabaseServer() {
  return new Promise((resolve) => {
    mockServer = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${mockPort}`);
      const method = req.method;

      let bodyData = '';
      for await (const chunk of req) {
        bodyData += chunk;
      }
      let body = {};
      try { body = JSON.parse(bodyData); } catch {}

      // Mock Supabase Auth
      if (url.pathname === '/auth/v1/user') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ id: 'uuid-admin-test', email: 'admin@vivutravinh.vn' }));
      }

      // Mock admin_users
      if (url.pathname === '/rest/v1/admin_users') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify([{ user_id: 'uuid-admin-test', email: 'admin@vivutravinh.vn', role: 'admin', is_active: true }]));
      }

      // Mock REST GET places
      if (url.pathname === '/rest/v1/places') {
        const idMatch = url.search.match(/id=eq\.(\d+)/);
        const placeId = idMatch ? parseInt(idMatch[1], 10) : null;
        if (placeId !== null) {
          const found = mockPlacesDb.filter(p => p.id === placeId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(found));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(mockPlacesDb));
      }

      // Mock RPC functions
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const rpcName = url.pathname.replace('/rest/v1/rpc/', '');
        mockRpcCalled = true;
        mockRpcCalls.push({ rpcName, body });

        if (rpcName === 'admin_create_place_atomic') {
          const newPlace = {
            id: 999,
            ...body.p_place_data,
            created_at: new Date().toISOString()
          };
          mockPlacesDb.push(newPlace);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(newPlace));
        }

        if (rpcName === 'admin_update_place_atomic') {
          const found = mockPlacesDb.find(p => p.id === body.p_place_id);
          if (found) {
            Object.assign(found, body.p_patch);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(found || { id: body.p_place_id, ...body.p_patch }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found in test mock' }));
    });

    mockServer.listen(0, '127.0.0.1', () => {
      mockPort = mockServer.address().port;
      process.env.SUPABASE_URL = `http://127.0.0.1:${mockPort}`;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key-test-g9';
      process.env.VIVU_TEST = '1';
      resolve();
    });
  });
}

console.log('=== BẮT ĐẦU KIỂM THỬ G9.1: DATA QUALITY CONTRACT & SHARED VALIDATOR ===\n');

try {
  await startMockSupabaseServer();

  // --------------------------------------------------------------------------
  // TEST GROUP 1: SLUG VALIDATION
  // --------------------------------------------------------------------------
  console.log('[Nhóm 1] Kiểm tra quy tắc URL Slug:');

  await runTest('1.1 Từ chối slug rỗng, chứa Unicode tiếng Việt, khoảng trắng và gạch nối sai', () => {
    const invalidSlugs = [
      '',
      '   ',
      'ao-bà-om',
      'chùa-âng',
      'ao ba om',
      'Ao-Ba-Om',
      'ao--ba-om',
      '-ao-ba-om',
      'ao-ba-om-',
      'ao_ba_om',
      'ao@ba#om'
    ];

    for (const badSlug of invalidSlugs) {
      const res = validatePlace({
        name: 'Địa điểm hợp lệ',
        slug: badSlug,
        category: 'attraction',
        area: 'tp-tra-vinh',
        status: 'approved'
      }, { mode: 'approval' });

      assert.strictEqual(res.valid, false, `Slug "${badSlug}" phải bị coi là không hợp lệ`);
      assert.ok(res.errors.some(e => e.code === 'INVALID_SLUG'), `Slug "${badSlug}" phải có lỗi INVALID_SLUG`);
    }
  });

  await runTest('1.2 Chấp nhận slug chuẩn ASCII lowercase, số và gạch nối đơn hợp lệ', () => {
    const validSlugs = [
      'ao-ba-om',
      'chua-ang',
      'bien-ba-dong-2026',
      'bun-nuoc-leo-co-ba',
      'quan-1'
    ];

    for (const goodSlug of validSlugs) {
      const res = validatePlace({
        name: 'Địa điểm hợp lệ',
        slug: goodSlug,
        category: 'attraction',
        area: 'tp-tra-vinh',
        status: 'approved'
      }, { mode: 'approval' });

      assert.ok(!res.errors.some(e => e.code === 'INVALID_SLUG'), `Slug "${goodSlug}" phải hợp lệ`);
    }
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 2: NAME CONTRACT BOUNDARY TESTS (3–150 CHARACTERS)
  // --------------------------------------------------------------------------
  console.log('\n[Nhóm 2] Kiểm tra Ranh giới Tên Địa Điểm (3–150 ký tự):');

  await runTest('2.1 Tên dưới 3 ký tự (length 0, 1, 2) bị từ chối với INVALID_NAME', () => {
    const tooShortNames = ['', '   ', 'A', 'Ao', ' Ô '];
    for (const badName of tooShortNames) {
      const resApproval = validatePlace({
        name: badName,
        slug: 'slug-chuan',
        category: 'attraction',
        area: 'tp-tra-vinh',
        status: 'approved'
      }, { mode: 'approval' });

      assert.strictEqual(resApproval.valid, false, `Tên "${badName}" phải bị từ chối trong approval mode`);
      assert.ok(resApproval.errors.some(e => e.code === 'INVALID_NAME'));

      if (badName.trim().length > 0) {
        const resDraft = validatePlace({ name: badName }, { mode: 'draft' });
        assert.strictEqual(resDraft.valid, false, `Tên có nhập nhưng quá ngắn "${badName}" phải bị từ chối cả ở draft mode`);
        assert.ok(resDraft.errors.some(e => e.code === 'INVALID_NAME'));
      }
    }
  });

  await runTest('2.2 Boundary: Đúng 3 ký tự và đúng 150 ký tự phải hợp lệ', () => {
    // 3 ký tự
    const name3Chars = 'Cồn';
    assert.strictEqual(name3Chars.length, 3);
    const res3 = validatePlace({
      name: name3Chars,
      slug: 'con',
      category: 'attraction',
      area: 'tp-tra-vinh',
      status: 'approved'
    }, { mode: 'approval' });
    assert.ok(!res3.errors.some(e => e.code === 'INVALID_NAME'), 'Tên đúng 3 ký tự phải hợp lệ');

    // 150 ký tự
    const name150Chars = 'A'.repeat(150);
    assert.strictEqual(name150Chars.length, 150);
    const res150 = validatePlace({
      name: name150Chars,
      slug: 'dia-diem-dai-150-ky-tu',
      category: 'attraction',
      area: 'tp-tra-vinh',
      status: 'approved'
    }, { mode: 'approval' });
    assert.ok(!res150.errors.some(e => e.code === 'INVALID_NAME'), 'Tên đúng 150 ký tự phải hợp lệ');
  });

  await runTest('2.3 Boundary: Vượt quá 150 ký tự (length 151) bị từ chối với INVALID_NAME', () => {
    const name151Chars = 'B'.repeat(151);
    assert.strictEqual(name151Chars.length, 151);
    const res = validatePlace({
      name: name151Chars,
      slug: 'dia-diem-151-ky-tu',
      category: 'attraction',
      area: 'tp-tra-vinh',
      status: 'approved'
    }, { mode: 'approval' });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some(e => e.code === 'INVALID_NAME'), 'Tên 151 ký tự phải bị từ chối với INVALID_NAME');
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 3: AREA REQUIREMENT & NO SPECULATION
  // --------------------------------------------------------------------------
  console.log('\n[Nhóm 3] Kiểm tra Quy tắc Khu vực (Area - Không tự suy đoán):');

  await runTest('3.1 Phê duyệt thiếu area phải bị chặn với mã lỗi MISSING_AREA', () => {
    const placeNoArea = {
      name: 'Chùa Hang Trà Vinh',
      slug: 'chua-hang-tra-vinh',
      category: 'pagoda',
      // area bị thiếu
      status: 'approved'
    };
    const res = validatePlace(placeNoArea, { mode: 'approval' });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some(e => e.code === 'MISSING_AREA'));
  });

  await runTest('3.2 Bản ghi draft được phép thiếu area mà không bị báo lỗi', () => {
    const draftNoArea = {
      name: 'Bản Nháp Chưa Chọn Huyện Thị',
      category: 'attraction',
      status: 'draft'
      // area thiếu
    };
    const res = validatePlace(draftNoArea, { mode: 'draft' });
    assert.strictEqual(res.valid, true);
    assert.ok(!res.errors.some(e => e.code === 'MISSING_AREA'));
  });

  await runTest('3.3 POST create place trực tiếp với status=approved thiếu area trả HTTP 422 MISSING_AREA và chặn RPC', async () => {
    mockRpcCalled = false;
    mockRpcCalls.length = 0;

    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/admin-places',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: {
        name: 'Địa Điểm Thiếu Area Khi Duyệt',
        slug: 'dia-diem-thieu-area',
        category: 'attraction',
        status: 'approved'
        // Không truyền area
      }
    });

    await placesHandler(req, res);

    assert.strictEqual(res.getStatus(), 422, 'Phải trả về HTTP 422 khi tạo status=approved mà thiếu area');
    const body = res.getBody();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error?.code, 'DATA_QUALITY_FAILED');
    assert.ok(body.error.errors.some(e => e.code === 'MISSING_AREA'), 'Phải có mã lỗi MISSING_AREA');
    assert.strictEqual(mockRpcCalled, false, 'RPC tuyệt đối không được gọi khi vi phạm area');
  });

  await runTest('3.4 POST create place với status=draft thiếu area thành công HTTP 201 và không tự gán tp-tra-vinh', async () => {
    mockRpcCalled = false;
    mockRpcCalls.length = 0;

    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/admin-places',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: {
        name: 'Bản Nháp Không Có Area',
        category: 'attraction',
        status: 'draft'
      }
    });

    await placesHandler(req, res);

    assert.strictEqual(res.getStatus(), 201);
    assert.strictEqual(mockRpcCalled, true);
    const calledData = mockRpcCalls[0].body.p_place_data;
    assert.strictEqual(calledData.area, undefined, 'createPlace không được tự suy đoán patch.area = tp-tra-vinh');
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 4: COORDINATES & TRA VINH BOUNDING BOX
  // --------------------------------------------------------------------------
  console.log('\n[Nhóm 4] Kiểm tra Tọa độ GPS & Bounding Box Trà Vinh:');

  await runTest('4.1 Bắt lỗi định dạng GPS sai cú pháp, NaN, Infinity hoặc không đủ 2 trục', () => {
    const badCoords = [
      'sai-dinh-dang',
      '9.9347',
      '9.9347,106.3449,15',
      'NaN,106.3449',
      '9.9347,Infinity',
      '-Infinity,106.3449',
      'abc,def',
      ',106.3449',
      '9.9347,'
    ];

    for (const coord of badCoords) {
      const res = validateCoordinates(coord);
      assert.strictEqual(res.valid, false, `Tọa độ "${coord}" phải bị từ chối format`);
      assert.strictEqual(res.code, 'INVALID_COORDINATES_FORMAT');
    }
  });

  await runTest('4.2 Bắt lỗi tọa độ bị đảo ngược (lat/lng inverted)', () => {
    const res = validateCoordinates('106.3449,9.9347');
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.code, 'COORDINATES_OUT_OF_BOUNDS');
  });

  await runTest('4.3 Bắt lỗi tọa độ ngoài tỉnh Trà Vinh (TP.HCM, Hà Nội, Quốc tế)', () => {
    const outOfBounds = [
      { name: 'TP Hồ Chí Minh', coords: '10.7769,106.7009' },
      { name: 'Hà Nội', coords: '21.0285,105.8542' },
      { name: 'Đà Nẵng', coords: '16.0544,108.2022' },
      { name: 'Cực nam Cà Mau', coords: '8.6000,104.7000' },
      { name: 'Tokyo', coords: '35.6762,139.6503' }
    ];

    for (const item of outOfBounds) {
      const res = validateCoordinates(item.coords);
      assert.strictEqual(res.valid, false, `Tọa độ "${item.name}" phải ngoài phạm vi Trà Vinh`);
      assert.strictEqual(res.code, 'COORDINATES_OUT_OF_BOUNDS');
    }
  });

  await runTest('4.4 Chấp nhận các tọa độ thực tế bên trong tỉnh Trà Vinh', () => {
    const inBounds = [
      { name: 'Ao Bà Om (TP Trà Vinh)', coords: '9.9347,106.3449' },
      { name: 'Biển Ba Động (Duyên Hải)', coords: '9.6115,106.5775' },
      { name: 'Cù Lao Tân Qui (Cầu Kè)', coords: '9.8750,106.0800' },
      { name: 'Chùa Cò (Trà Cú)', coords: '9.6670,106.2580' }
    ];

    for (const item of inBounds) {
      const res = validateCoordinates(item.coords);
      assert.strictEqual(res.valid, true, `Tọa độ "${item.name}" (${item.coords}) phải hợp lệ`);
      assert.ok(res.parsed.lat >= TRA_VINH_BOUNDS.MIN_LAT && res.parsed.lat <= TRA_VINH_BOUNDS.MAX_LAT);
      assert.ok(res.parsed.lng >= TRA_VINH_BOUNDS.MIN_LNG && res.parsed.lng <= TRA_VINH_BOUNDS.MAX_LNG);
    }
  });

  await runTest('4.5 Strict Decimal Parser: từ chối 9.9347abc, 106.3449xyz, 9e0, Infinity, NaN, 9..3; chấp nhận khoảng trắng và dấu +/-', () => {
    // Các trường hợp từ chối nghiêm ngặt trước khi parse số
    const strictRejections = [
      '9.9347abc,106.3449',
      '9.9347,106.3449xyz',
      '9e0,106.3',
      '9.9347,106.3e0',
      'Infinity,106.3',
      '9.9347,Infinity',
      '-Infinity,106.3',
      'NaN,106.3',
      '9.9347,NaN',
      '9..3,106.3',
      '9.9347,106..3'
    ];

    for (const badCoord of strictRejections) {
      const res = validateCoordinates(badCoord);
      assert.strictEqual(res.valid, false, `Tọa độ "${badCoord}" phải bị từ chối bởi strict decimal parser`);
      assert.strictEqual(res.code, 'INVALID_COORDINATES_FORMAT');
    }

    // Các trường hợp chấp nhận: chuẩn, khoảng trắng quanh dấu phẩy, dấu +/-
    const strictAccepts = [
      '9.9347,106.3449',
      '9.9347, 106.3449',
      ' 9.9347 , 106.3449 ',
      '+9.9347,+106.3449',
      '+9.9347, +106.3449'
    ];

    for (const goodCoord of strictAccepts) {
      const res = validateCoordinates(goodCoord);
      assert.strictEqual(res.valid, true, `Tọa độ "${goodCoord}" phải hợp lệ`);
      assert.strictEqual(res.parsed.lat, 9.9347);
      assert.strictEqual(res.parsed.lng, 106.3449);
    }
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 5: GOOGLE MAPS ALLOWLIST & URL SECURITY
  // --------------------------------------------------------------------------
  console.log('\n[Nhóm 5] Kiểm tra bảo mật URL Google Maps & Allowlist:');

  await runTest('5.1 Chấp nhận các dạng link Google Maps HTTPS chuẩn', () => {
    const validMaps = [
      'https://www.google.com/maps?q=9.9347,106.3449',
      'https://maps.google.com/maps/@9.9347,106.3449,15z',
      'https://maps.app.goo.gl/hCS86nXM8mQjbxm9',
      'https://goo.gl/maps/dKJH8736412',
      'https://google.com.vn/maps/place/Tra+Vinh/@9.9347,106.3449,15z',
      'https://www.google.com/maps/place/Ao+Ba+Om'
    ];

    for (const mapUrl of validMaps) {
      const res = validateGoogleMapsUrl(mapUrl);
      assert.strictEqual(res.valid, true, `URL Maps "${mapUrl}" phải hợp lệ`);
    }
  });

  await runTest('5.2 Chặn dứt khoát HTTP không bảo mật và các giao thức độc hại (javascript:, data:, //)', () => {
    const dangerousUrls = [
      'http://www.google.com/maps?q=9.9347,106.3449',
      'javascript:alert(document.cookie)',
      'JAVASCRIPT:console.log(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox("xss")',
      '//www.google.com/maps?q=9.9347,106.3449'
    ];

    for (const badUrl of dangerousUrls) {
      const res = validateGoogleMapsUrl(badUrl);
      assert.strictEqual(res.valid, false, `URL Maps độc hại "${badUrl}" phải bị chặn`);
      assert.strictEqual(res.code, 'INSECURE_MAP_URL');
    }
  });

  await runTest('5.3 Chặn hostname giả mạo hoặc không thuộc Google Maps allowlist', () => {
    const spoofedUrls = [
      'https://google.com.evil.test/maps',
      'https://maps.google.com.attacker.com/place',
      'https://evil-maps.com/maps',
      'https://fakegoogle.com/maps',
      'https://www.google.com/about',
      'https://goo.gl/other-link'
    ];

    for (const spoofUrl of spoofedUrls) {
      const res = validateGoogleMapsUrl(spoofUrl);
      assert.strictEqual(res.valid, false, `URL giả mạo "${spoofUrl}" phải bị từ chối hostname`);
      assert.strictEqual(res.code, 'DISALLOWED_MAP_HOST');
    }
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 6: 24H TIME FORMAT & OPERATING HOURS
  // --------------------------------------------------------------------------
  console.log('\n[Nhóm 6] Kiểm tra Định dạng Giờ 24h & Ca Hoạt Động:');

  await runTest('6.1 Kiểm tra các mốc giờ 24h hợp lệ: 00:00, 18:00, 02:00 và ca qua đêm', () => {
    const validHours = ['00:00', '06:30', '12:00', '18:00', '23:59', '02:00'];
    for (const h of validHours) {
      const res = validateTimeFormat(h);
      assert.strictEqual(res.valid, true, `Giờ "${h}" phải hợp lệ`);
    }

    // Ca qua đêm: 18:00 - 02:00
    const overnightPlace = {
      name: 'Quán Ốc Đêm Trà Vinh',
      slug: 'quan-oc-dem-tra-vinh',
      category: 'food',
      area: 'tp-tra-vinh',
      status: 'approved',
      opening_time: '18:00',
      closing_time: '02:00'
    };
    const res = validatePlace(overnightPlace, { mode: 'approval' });
    assert.strictEqual(res.valid, true, 'Ca qua đêm 18:00-02:00 phải hoàn toàn hợp lệ');
    assert.ok(!res.errors.some(e => e.code === 'INVALID_TIME_FORMAT'));
    assert.ok(!res.warnings.some(w => w.code === 'WARN_MISSING_HOURS'));
    assert.ok(!res.warnings.some(w => w.code === 'WARN_INCOMPLETE_HOURS'));
  });

  await runTest('6.2 Từ chối các mốc giờ sai cú pháp: 24:00, 25:00, 12:60, 9:00, abc sinh INVALID_TIME_FORMAT ở cả approval lẫn draft', () => {
    const badHours = ['24:00', '25:00', '12:60', '9:00', 'abc', '12:0', '12:000', '23:61'];
    for (const badH of badHours) {
      const res = validateTimeFormat(badH);
      assert.strictEqual(res.valid, false, `Giờ "${badH}" phải bị từ chối format`);
      assert.strictEqual(res.code, 'INVALID_TIME_FORMAT');

      // Kiểm tra trong mode approval
      const placeApproval = {
        name: 'Quán Giờ Sai',
        slug: 'quan-gio-sai',
        category: 'cafe',
        area: 'tp-tra-vinh',
        status: 'approved',
        opening_time: badH
      };
      const resApp = validatePlace(placeApproval, { mode: 'approval' });
      assert.strictEqual(resApp.valid, false);
      assert.ok(resApp.errors.some(e => e.code === 'INVALID_TIME_FORMAT'), `Giờ "${badH}" phải là ERROR ở approval mode`);

      // Kiểm tra trong mode draft: giờ sai cú pháp cũng là ERROR vì là dữ liệu không an toàn/sử dụng được
      const placeDraft = {
        name: 'Bản Nháp Giờ Sai',
        status: 'draft',
        closing_time: badH
      };
      const resDr = validatePlace(placeDraft, { mode: 'draft' });
      assert.strictEqual(resDr.valid, false);
      assert.ok(resDr.errors.some(e => e.code === 'INVALID_TIME_FORMAT'), `Giờ "${badH}" phải là ERROR ở draft mode`);
    }
  });

  await runTest('6.3 display_hours không được dùng để hợp thức hóa opening_time/closing_time sai cú pháp', () => {
    const deceptivePlace = {
      name: 'Quán Cà Phê Ngụy Trang Giờ',
      slug: 'quan-ca-phe-nguy-trang',
      category: 'cafe',
      area: 'tp-tra-vinh',
      status: 'approved',
      opening_time: '25:00', // Sai cú pháp nghiêm trọng
      display_hours: 'Mở cửa cả ngày 24/7'
    };
    const res = validatePlace(deceptivePlace, { mode: 'approval' });
    assert.strictEqual(res.valid, false, 'display_hours không được nuốt lỗi INVALID_TIME_FORMAT');
    assert.ok(res.errors.some(e => e.code === 'INVALID_TIME_FORMAT'));
  });

  await runTest('6.4 Giá "Miễn phí" / "0đ" hợp lệ; cảnh báo khi chỉ có 1 đầu giờ', () => {
    const freeValues = ['0đ', 'Miễn phí', '0', 'Free', 'mien phi'];
    for (const val of freeValues) {
      assert.strictEqual(hasPriceValue(val), true, `Giá "${val}" phải được coi là đã cung cấp`);
    }

    const oneSided = {
      name: 'Quán Cà Phê Sáng',
      slug: 'quan-ca-phe-sang',
      category: 'cafe',
      area: 'tp-tra-vinh',
      status: 'approved',
      opening_time: '06:00'
      // closing_time thiếu
    };
    const res = validatePlace(oneSided, { mode: 'approval' });
    assert.ok(res.warnings.some(w => w.code === 'WARN_INCOMPLETE_HOURS'));
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 7: IMAGE SECURITY & LOCAL ASSET ALLOWLIST
  // --------------------------------------------------------------------------
  console.log('\n[Nhóm 7] Kiểm tra An toàn Hình ảnh & Đường dẫn Local Asset:');

  await runTest('7.1 Chấp nhận các URL ảnh an toàn: https://, http:// và đường dẫn local an toàn', () => {
    const safeImages = [
      'https://cdn.vivutravinh.vn/ao-ba-om.jpg',
      'http://static.example.com/photo.png',
      '/images/ao-ba-om.jpg',
      './images/bien-ba-dong.png',
      'images/chua-ang.jpg',
      'assets/banner.jpg',
      '/icons/icon-192.png'
    ];

    for (const imgPath of safeImages) {
      const inspect = inspectSafeUrl(imgPath);
      assert.strictEqual(inspect.isSafe, true, `Đường dẫn ảnh "${imgPath}" phải an toàn`);
    }
  });

  await runTest('7.2 Chặn dứt khoát các giao thức không an toàn và giao thức lạ (ftp:, blob:, javascript:, data:, //)', () => {
    const unsafeImages = [
      'ftp://files.example.com/photo.jpg',
      'FTP://example.com/pic.jpg',
      'blob:https://example.com/uuid-1234',
      'custom-proto://evil.test/img.png',
      'javascript:alert("xss")',
      'JAVASCRIPT:console.log(1)',
      'data:image/svg+xml;base64,PHN2Zz4...',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      '//evil.com/xss.png',
      '/images/bad<script>.jpg'
    ];

    for (const badImg of unsafeImages) {
      const inspect = inspectSafeUrl(badImg);
      assert.strictEqual(inspect.isSafe, false, `Đường dẫn nguy hiểm "${badImg}" phải bị chặn`);

      const placeWithBadImg = {
        name: 'Điểm Test Ảnh Độc',
        slug: 'diem-test-anh-doc',
        category: 'attraction',
        area: 'tp-tra-vinh',
        status: 'approved',
        image_link: badImg
      };
      const res = validatePlace(placeWithBadImg, { mode: 'approval' });
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.code === 'INSECURE_IMAGE_URL'));
    }
  });

  await runTest('7.3 Cảnh báo đối với ảnh lưu trên Google Drive do nguy cơ thiếu quyền công khai', () => {
    const driveImagePlace = {
      name: 'Điểm Test Ảnh Drive',
      slug: 'diem-test-anh-drive',
      category: 'attraction',
      area: 'tp-tra-vinh',
      status: 'approved',
      image_link: 'https://drive.google.com/file/d/1234567890/view?usp=sharing'
    };
    const res = validatePlace(driveImagePlace, { mode: 'approval' });
    assert.ok(res.warnings.some(w => w.code === 'WARN_DRIVE_IMAGE_LINK'));
  });

  await runTest('7.4 Chặn triệt để path traversal trong local asset (.., ., backslash, %2e%2e, %5c) và chấp nhận local hợp lệ', () => {
    const traversalPaths = [
      '/../secret',
      './../../../etc/passwd',
      'assets/../../x',
      'images/%2e%2e/secret',
      'images/%2E%2E/secret',
      'assets\\..\\secret',
      'assets\\secret',
      'images/./place.jpg',
      '././images/place.jpg',
      'images/%5csecret',
      'images/%5Csecret',
      'images/%2e/place.jpg'
    ];

    for (const badPath of traversalPaths) {
      const inspect = inspectSafeUrl(badPath);
      assert.strictEqual(inspect.isSafe, false, `Đường dẫn traversal "${badPath}" phải bị từ chối`);

      const placeWithBadPath = {
        name: 'Điểm Test Traversal',
        slug: 'diem-test-traversal',
        category: 'attraction',
        area: 'tp-tra-vinh',
        status: 'approved',
        image_link: badPath
      };
      const res = validatePlace(placeWithBadPath, { mode: 'approval' });
      assert.strictEqual(res.valid, false, `Địa điểm với ảnh "${badPath}" phải bị từ chối duyệt`);
      assert.ok(res.errors.some(e => e.code === 'INSECURE_IMAGE_URL'));
    }

    // Các đường dẫn local hợp lệ bắt buộc phải chấp nhận
    const validLocalPaths = [
      '/images/place.jpg',
      './images/place.jpg',
      'images/place.jpg',
      'assets/places/place.webp'
    ];

    for (const goodPath of validLocalPaths) {
      const inspect = inspectSafeUrl(goodPath);
      assert.strictEqual(inspect.isSafe, true, `Đường dẫn local "${goodPath}" phải hợp lệ`);
      assert.strictEqual(inspect.isLocal, true);
    }
  });

  await runTest('7.5 Không throw nếu decodeURIComponent gặp chuỗi percent-encoding lỗi; trả isSafe=false', () => {
    const malformedEncoded = [
      'images/%E0%A4%A/place.jpg',
      'images/%zz/pic.jpg',
      'images/%/pic.jpg',
      'images/%2/pic.jpg',
      'assets/%25zz',
      'https://example.com/malformed%E0%A4%A'
    ];

    for (const badUrl of malformedEncoded) {
      assert.doesNotThrow(() => {
        const inspect = inspectSafeUrl(badUrl);
        assert.strictEqual(inspect.isSafe, false, `Chuỗi malformed encoding "${badUrl}" phải trả về isSafe=false`);
      }, `inspectSafeUrl không được ném ngoại lệ khi gặp "${badUrl}"`);
    }
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 8: MISSING VERIFIED FIELDS & WARNINGS
  // --------------------------------------------------------------------------
  console.log('\n[Nhóm 8] Kiểm tra Cảnh báo thiếu các trường verified:');

  await runTest('8.1 Thiếu các trường verified sinh đầy đủ cảnh báo tương ứng (không thành error)', () => {
    const minimalPlace = {
      name: 'Ao Bà Om Chuẩn',
      slug: 'ao-ba-om-chuan',
      category: 'attraction',
      area: 'tp-tra-vinh',
      status: 'approved'
      // thiếu: address, coordinates, map_link, contact, price_raw, images, hours, description
    };

    const res = validatePlace(minimalPlace, { mode: 'approval' });
    assert.strictEqual(res.valid, true, 'Thiếu trường verified không được sinh error chặn duyệt');
    assert.strictEqual(res.errors.length, 0);

    const warnCodes = new Set(res.warnings.map(w => w.code));
    assert.ok(warnCodes.has('WARN_MISSING_ADDRESS'));
    assert.ok(warnCodes.has('WARN_MISSING_COORDINATES'));
    assert.ok(warnCodes.has('WARN_MISSING_MAP_LINK'));
    assert.ok(warnCodes.has('WARN_MISSING_HOURS'));
    assert.ok(warnCodes.has('WARN_MISSING_CONTACT'));
    assert.ok(warnCodes.has('WARN_MISSING_PRICE'));
    assert.ok(warnCodes.has('WARN_MISSING_IMAGES'));
    assert.ok(warnCodes.has('WARN_SHORT_DESCRIPTION'));
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 9: IMMUTABILITY & DRAFT LEGACY TOLERANCE
  // --------------------------------------------------------------------------
  console.log('\n[Nhóm 9] Kiểm tra Tính bất biến & Tương thích Draft Legacy:');

  await runTest('9.1 Input object hoàn toàn không bị mutation (kể cả Object.freeze)', () => {
    const frozenPlace = Object.freeze({
      name: 'Ao Bà Om Bất Biến',
      slug: 'ao-ba-om-bat-bien',
      category: 'attraction',
      area: 'tp-tra-vinh',
      status: 'approved',
      coordinates: '9.9347,106.3449',
      images: Object.freeze(['https://example.com/img1.jpg', 'https://example.com/img2.jpg'])
    });

    assert.doesNotThrow(() => {
      const res = validatePlace(frozenPlace, { mode: 'approval' });
      assert.strictEqual(res.valid, true);
    });
  });

  await runTest('9.2 Bản ghi draft legacy thiếu trường bắt buộc của approval vẫn hợp lệ ở mode draft', () => {
    const legacyDraft = {
      name: 'Bản nháp cũ chưa hoàn thiện',
      notes: 'Đang biên tập dở'
    };

    const resDraft = validatePlace(legacyDraft, { mode: 'draft' });
    assert.strictEqual(resDraft.valid, true, 'Draft legacy phải hợp lệ trong mode draft');
    assert.strictEqual(resDraft.errors.length, 0);

    const resApproval = validatePlace(legacyDraft, { mode: 'approval' });
    assert.strictEqual(resApproval.valid, false);
    assert.ok(resApproval.errors.some(e => e.code === 'INVALID_SLUG'));
    assert.ok(resApproval.errors.some(e => e.code === 'MISSING_CATEGORY'));
    assert.ok(resApproval.errors.some(e => e.code === 'MISSING_AREA'));
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 10: PATCH APPROVED LEGACY & API 422 ZERO RPC
  // --------------------------------------------------------------------------
  console.log('\n[Nhóm 10] Kiểm tra Chính sách PATCH Approved Legacy & API 422:');

  await runTest('10.1 Approved legacy thiếu verified fields vẫn sửa note thành công HTTP 200 (không bị chặn trường cũ)', async () => {
    // Bản ghi approved legacy ID 701 trong DB mock: thiếu coordinates, address, hours, area...
    mockPlacesDb.push({
      id: 701,
      slug: 'legacy-approved-place',
      name: 'Địa Điểm Legacy Đã Approved',
      category: 'attraction',
      status: 'approved',
      area: null,
      note: 'Ghi chú cũ',
      updated_at: '2026-05-27T02:00:00.000Z'
    });

    mockRpcCalled = false;
    mockRpcCalls.length = 0;

    const { req, res } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-places',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: {
        id: 701,
        note: 'Cập nhật ghi chú mới an toàn',
        expected_updated_at: '2026-05-27T02:00:00.000Z'
      }
    });

    await placesHandler(req, res);

    assert.strictEqual(res.getStatus(), 200, 'Approved legacy sửa note phải thành công HTTP 200');
    assert.strictEqual(mockRpcCalled, true, 'RPC phải được gọi khi cập nhật note an toàn');
    assert.strictEqual(mockRpcCalls[0].body.p_patch.note, 'Cập nhật ghi chú mới an toàn');
  });

  await runTest('10.2 Chuyển trạng thái draft -> approved thiếu trường required bị trả về HTTP 422 và RPC không được gọi', async () => {
    // Bản ghi draft ID 702 trong DB mock: thiếu area
    mockPlacesDb.push({
      id: 702,
      slug: 'draft-place-no-area',
      name: 'Điểm Draft Thiếu Area',
      category: 'attraction',
      status: 'draft',
      area: null,
      updated_at: '2026-05-27T02:00:00.000Z'
    });

    mockRpcCalled = false;
    mockRpcCalls.length = 0;

    const { req, res } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-places',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: {
        id: 702,
        status: 'approved',
        expected_updated_at: '2026-05-27T02:00:00.000Z'
      }
    });

    await placesHandler(req, res);

    assert.strictEqual(res.getStatus(), 422, 'Chuyển draft sang approved thiếu required phải trả HTTP 422');
    const body = res.getBody();
    assert.strictEqual(body.error?.code, 'DATA_QUALITY_FAILED');
    assert.ok(body.error.errors.some(e => e.code === 'MISSING_AREA'));
    assert.strictEqual(mockRpcCalled, false, 'RPC tuyệt đối không được gọi khi chuyển draft sang approved thiếu required');
  });

  await runTest('10.3 Approved legacy PATCH map_link=javascript:... bị trả về HTTP 422 và RPC không được gọi', async () => {
    mockRpcCalled = false;
    mockRpcCalls.length = 0;

    const { req, res } = createMockReqRes({
      method: 'PATCH',
      url: '/api/admin-places',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: {
        id: 701, // Bản ghi approved legacy
        map_link: 'javascript:alert("hacked")',
        expected_updated_at: '2026-05-27T02:00:00.000Z'
      }
    });

    await placesHandler(req, res);

    assert.strictEqual(res.getStatus(), 422, 'PATCH map_link javascript phải bị từ chối HTTP 422');
    const body = res.getBody();
    assert.strictEqual(body.error?.code, 'DATA_QUALITY_FAILED');
    assert.ok(body.error.errors.some(e => e.code === 'INSECURE_MAP_URL'));
    assert.strictEqual(mockRpcCalled, false, 'RPC tuyệt đối không được gọi khi patch chứa dữ liệu nguy hiểm');
  });

  await runTest('10.4 POST create place với status approved vi phạm contract bị HTTP 422 và RPC không được gọi', async () => {
    mockRpcCalled = false;
    mockRpcCalls.length = 0;

    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/admin-places',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: {
        name: 'Địa điểm lỗi slug và tọa độ',
        slug: 'slug-chứa-unicode-sai',
        category: 'attraction',
        area: 'tp-tra-vinh',
        status: 'approved',
        coordinates: '10.7769,106.7009' // TPHCM
      }
    });

    await placesHandler(req, res);

    assert.strictEqual(res.getStatus(), 422);
    assert.strictEqual(mockRpcCalled, false, 'RPC admin_create_place_atomic TUYỆT ĐỐI KHÔNG ĐƯỢC GỌI');
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 11: PRIVACY & SECRET LEAK PREVENTION
  // --------------------------------------------------------------------------
  console.log('\n[Nhóm 11] Kiểm tra Bảo mật & Chống rò rỉ PII/Secret:');

  await runTest('11.1 Phản hồi lỗi 422 không phản chiếu thông tin liên hệ hay bí mật token', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/admin-places',
      headers: { Authorization: 'Bearer mock-admin-token' },
      body: {
        name: 'A', // quá ngắn (< 3 ký tự)
        category: 'attraction',
        status: 'approved',
        contact: '0909123456',
        address: 'Địa chỉ nhà riêng bí mật'
      }
    });

    await placesHandler(req, res);

    assert.strictEqual(res.getStatus(), 422);
    const rawResStr = JSON.stringify(res.getBody());
    assert.ok(!rawResStr.includes('0909123456'), 'Không được phản chiếu số điện thoại PII trong body lỗi');
    assert.ok(!rawResStr.includes('mock-service-role-key'), 'Không được rò rỉ secret key');
    assert.ok(!rawResStr.includes('mock-admin-token'), 'Không được rò rỉ bearer token');
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 12: UI APPROVAL BLOCKING & PREVIEW MODAL
  // --------------------------------------------------------------------------
  console.log('\n[Nhóm 12] Kiểm tra Giao diện Quản trị (UI Approve Blocking):');

  globalThis.sessionStorage = {
    getItem(key) {
      if (key === 'vivu_admin_session') {
        return JSON.stringify({ user: { role: 'admin', email: 'admin@vivutravinh.vn' }, access_token: 'mock-token' });
      }
      return null;
    },
    setItem() {},
    removeItem() {}
  };

  await runTest('12.1 Preview modal hiển thị khối ERROR và vô hiệu hóa nút Duyệt khi có lỗi bắt buộc', () => {
    const modal = {
      classList: { remove() {}, add() {} },
      setAttribute() {}
    };
    const content = { innerHTML: '' };
    const elements = {
      placePreviewModal: modal,
      placePreviewContent: content,
      closePreviewBtn: { onclick: null, focus() {} },
      placePreviewCloseBtn: { onclick: null },
      approveFromPreviewBtn: { onclick: null }
    };

    globalThis.document = {
      activeElement: null,
      getElementById(id) {
        return elements[id] || null;
      },
      addEventListener() {},
      removeEventListener() {}
    };

    const badPlace = {
      id: 901,
      name: 'Ao Bà Om Lỗi Slug',
      slug: 'ao--ba--om', // Lỗi slug gạch nối kép
      category: 'attraction',
      area: 'tp-tra-vinh',
      status: 'draft',
      coordinates: '21.0285,105.8542' // Lỗi tọa độ ngoài Trà Vinh
    };

    openPlacePreview(badPlace);

    assert.ok(content.innerHTML.includes('id="previewValidationErrors"'), 'Phải render khối báo lỗi màu đỏ');
    assert.ok(content.innerHTML.includes('Lỗi vi phạm tiêu chuẩn'), 'Phải có tiêu đề lỗi vi phạm');
    assert.ok(content.innerHTML.includes('id="approveFromPreviewBtn" disabled'), 'Nút Duyệt phải có thuộc tính disabled');
    assert.ok(content.innerHTML.includes('Không thể duyệt (Còn lỗi)'), 'Nút Duyệt phải hiển thị nhãn Không thể duyệt');
  });

  await runTest('12.2 Preview modal chỉ hiển thị khối WARNING và cho phép kích hoạt nút Duyệt khi chỉ có cảnh báo', () => {
    const modal = {
      classList: { remove() {}, add() {} },
      setAttribute() {}
    };
    const content = { innerHTML: '' };
    const elements = {
      placePreviewModal: modal,
      placePreviewContent: content,
      closePreviewBtn: { onclick: null, focus() {} },
      placePreviewCloseBtn: { onclick: null },
      approveFromPreviewBtn: { onclick: null }
    };

    globalThis.document = {
      activeElement: null,
      getElementById(id) {
        return elements[id] || null;
      },
      addEventListener() {},
      removeEventListener() {}
    };

    const warningOnlyPlace = {
      id: 902,
      name: 'Chùa Âng Hợp Lệ Thiếu Ảnh',
      slug: 'chua-ang-hop-le',
      category: 'pagoda',
      area: 'tp-tra-vinh',
      status: 'draft',
      coordinates: '9.9347,106.3449'
    };

    openPlacePreview(warningOnlyPlace);

    assert.ok(!content.innerHTML.includes('id="previewValidationErrors"'), 'Không được render khối lỗi đỏ');
    assert.ok(content.innerHTML.includes('id="previewValidationWarnings"'), 'Phải render khối cảnh báo vàng');
    assert.ok(!content.innerHTML.includes('id="approveFromPreviewBtn" disabled'), 'Nút Duyệt không được bị disabled');
    assert.ok(content.innerHTML.includes('Duyệt xuất bản'), 'Nút Duyệt phải sẵn sàng với nhãn Duyệt xuất bản');
  });

  console.log('\n========================================');
  console.log(`KẾT QUẢ KIỂM THỬ G9.1: ${passedTests}/${totalTests} TEST CASES PASS`);
  console.log('========================================\n');

} finally {
  if (mockServer) {
    mockServer.close();
  }
}
