/**
 * scripts/test-live-rsvp-duplicate.cjs
 *
 * Kiểm tra xác thực luồng đăng ký vé Ok Om Bok & Bảo mật quyền sở hữu vé:
 * 1. Đăng ký vé hợp lệ lần đầu -> CSDL lưu vé, server cấp secret token (claim_token), trả về 201.
 * 2. Người sở hữu gửi lại request trùng lặp VỚI TOKEN BÍ MẬT DO SERVER CẤP
 *    -> API xác minh thành công và trả về vé (200, idempotent).
 * 3. [BÀI TEST TRỌNG TÂM THEO YÊU CẦU NGHIỆM THU]:
 *    - Người biết đủ client_rsvp_id, họ tên và SĐT nhưng THIẾU TOKEN XÁC THỰC BÍ MẬT
 *      -> BẮT BUỘC TỪ CHỐI HTTP 403 UNAUTHORIZED_TICKET_ACCESS, TUYỆT ĐỐI KHÔNG TRẢ VỀ VÉ!
 * 4. Kẻ xấu dùng token giả mạo -> Bị từ chối HTTP 403, không trả vé.
 * 5. Kẻ khác gửi client_rsvp_id mới với SĐT đã đăng ký -> Bị từ chối HTTP 409 DUPLICATE_REGISTRATION.
 * 6. Kiểm tra validation dữ liệu đầu vào -> HTTP 400.
 * 7. DỌN DẸP AN TOÀN TUYỆT ĐỐI THEO UUID:
 *    - Sử dụng số điện thoại ngẫu nhiên có kiểm soát.
 *    - Chỉ xóa ĐÚNG CÁC ID bản ghi được tạo ra trong lần chạy kiểm thử này (id=eq.UUID).
 *    - TUYỆT ĐỐI KHÔNG XÓA THEO SỐ ĐIỆN THOẠI để tránh xóa nhầm dữ liệu người khác.
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const PROJECT_DIR = path.resolve(__dirname, '..');
const envPath = path.join(PROJECT_DIR, '.env.live.tmp');

if (!fs.existsSync(envPath)) {
  console.log('Không tìm thấy file .env.live.tmp. Bỏ qua.');
  process.exit(0);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const supabaseUrlMatch = envContent.match(/SUPABASE_URL="([^"]+)"/);
const serviceKeyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);

if (!supabaseUrlMatch || !serviceKeyMatch) {
  console.log('Thiếu URL hoặc Service Key Supabase. Bỏ qua.');
  process.exit(0);
}

const baseUrl = supabaseUrlMatch[1].replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const serviceRoleKey = serviceKeyMatch[1];
process.env.SUPABASE_URL = baseUrl;
process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;

let passed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Failed: ${message}`);
  }
}

async function run() {
  console.log('================================================================================');
  console.log(' KIỂM THỬ XÁC MINH QUYỀN SỞ HỮU VÉ BẰNG TOKEN BÍ MẬT & CHỐNG RÒ RỈ DỮ LIỆU');
  console.log('================================================================================\n');

  const rsvpModule = await import(pathToFileURL(path.join(PROJECT_DIR, 'api', 'submit-rsvp.js')).href);
  const handler = rsvpModule.default;

  // Tạo số điện thoại ngẫu nhiên kiểm soát được cho mỗi lần chạy test
  const testPhone = '098' + Math.floor(1000000 + Math.random() * 9000000);
  const testClientRsvpId = `test-rsvp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const testTicketCode = `TST-${Date.now().toString().slice(-4)}`;
  const testAuthorName = 'Nguyễn Văn Chính Chủ';

  // Danh sách ID bản ghi được tạo ra trong phiên test này (chỉ xóa đúng các ID này khi dọn dẹp)
  const createdTicketIds = [];

  function createMockRes() {
    return {
      statusCode: 200,
      headers: {},
      data: null,
      status(code) { this.statusCode = code; return this; },
      setHeader(k, v) { this.headers[k] = v; },
      json(payload) { this.data = payload; return this; },
      end(str) {
        if (str) {
          try { this.data = JSON.parse(str); } catch (e) { this.data = str; }
        }
      }
    };
  }

  function getTestIp() {
    return `10.88.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`;
  }

  try {
    // 1. Gửi đăng ký vé lần đầu hợp lệ
    console.log('[Test 1] Đăng ký vé hợp lệ lần đầu -> Server cấp token bí mật (claim_token):');
    const req1 = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': getTestIp()
      },
      body: JSON.stringify({
        fullname: testAuthorName,
        phone: testPhone,
        sector: 'long-binh',
        event_slug: 'ok-om-bok-2026',
        client_rsvp_id: testClientRsvpId,
        client_ticket_code: testTicketCode
      })
    };
    const res1 = createMockRes();
    await handler(req1, res1);

    assert(res1.statusCode === 201, `API tiếp nhận đăng ký vé thành công với HTTP 201 (Status ${res1.statusCode})`);
    assert(res1.data?.success === true, 'Phản hồi báo success = true');
    assert(res1.data?.data?.ticket_code, `Mã vé đã được cấp phát: ${res1.data?.data?.ticket_code}`);
    assert(res1.data?.data?.seat, `Số ghế đã được chỉ định: ${res1.data?.data?.seat}`);
    assert(res1.data?.data?.claim_token, `Server đã cấp token bí mật claim_token: ${res1.data?.data?.claim_token?.slice(0, 10)}...`);
    assert(res1.data?.data?.client_rsvp_id === testClientRsvpId, `Server bảo toàn client_rsvp_id: ${res1.data?.data?.client_rsvp_id}`);
    assert(res1.data?.data?.id, `Bản ghi có ID CSDL: ${res1.data?.data?.id}`);

    const savedTicketCode = res1.data?.data?.ticket_code;
    const serverClaimToken = res1.data?.data?.claim_token;
    const createdId = res1.data?.data?.id;
    if (createdId) {
      createdTicketIds.push(createdId);
    }

    // 2. Gửi lại request trùng lặp VỚI TOKEN BÍ MẬT DO SERVER CẤP (Chính chủ phiên gửi lại)
    console.log('\n[Test 2] Gửi lại request KÈM TOKEN BÍ MẬT (claim_token) -> Xác minh sở hữu thành công (200 OK):');
    const req2 = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': getTestIp(),
        'x-ticket-claim-token': serverClaimToken
      },
      body: JSON.stringify({
        fullname: testAuthorName,
        phone: testPhone,
        sector: 'long-binh',
        event_slug: 'ok-om-bok-2026',
        client_rsvp_id: testClientRsvpId,
        client_ticket_code: testTicketCode,
        claim_token: serverClaimToken
      })
    };
    const res2 = createMockRes();
    await handler(req2, res2);

    assert(res2.statusCode === 200, 'API trả về HTTP 200 khi có token xác thực bí mật hợp lệ');
    assert(res2.data?.idempotent === true, 'Xác nhận cờ idempotent = true');
    assert(res2.data?.data?.ticket_code === savedTicketCode, 'Trả về ĐÚNG mã vé của chính chủ');
    assert(res2.data?.data?.client_rsvp_id === testClientRsvpId, 'Vé trả về vẫn giữ nguyên client_rsvp_id');

    // 3. BÀI TEST TRỌNG TÂM: Người biết đủ client_rsvp_id, họ tên và SĐT nhưng THIẾU TOKEN XÁC THỰC BÍ MẬT
    console.log('\n[Test 3] An ninh: Người biết đủ client_rsvp_id, họ tên và SĐT nhưng THIẾU TOKEN XÁC THỰC:');
    const req3 = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': getTestIp()
        // Cố tình KHÔNG gửi header x-ticket-claim-token và KHÔNG có Authorization
      },
      body: JSON.stringify({
        fullname: testAuthorName,   // Biết chính xác họ tên
        phone: testPhone,           // Biết chính xác SĐT
        sector: 'long-binh',
        event_slug: 'ok-om-bok-2026',
        client_rsvp_id: testClientRsvpId, // Biết chính xác client_rsvp_id
        client_ticket_code: testTicketCode
        // Cố tình KHÔNG gửi claim_token trong body
      })
    };
    const res3 = createMockRes();
    await handler(req3, res3);

    assert(res3.statusCode === 403, `BẮT BUỘC BỊ TỪ CHỐI HTTP 403 UNAUTHORIZED_TICKET_ACCESS (Status ${res3.statusCode})`);
    assert(res3.data?.success === false, 'Phản hồi báo success = false');
    assert(res3.data?.error?.code === 'UNAUTHORIZED_TICKET_ACCESS', 'Mã lỗi UNAUTHORIZED_TICKET_ACCESS chính xác');
    assert(!res3.data?.data, 'CHỐNG RÒ RỈ DỮ LIỆU: Tuyệt đối KHÔNG trả về trường data khi thiếu token');
    assert(!JSON.stringify(res3.data).includes(savedTicketCode), 'CHỐNG RÒ RỈ DỮ LIỆU: Không để lộ mã vé khi thiếu token');

    // 4. Kẻ xấu gửi token bí mật giả mạo / sai lệch
    console.log('\n[Test 4] Kẻ xấu gửi claim_token giả mạo -> Bị từ chối HTTP 403:');
    const req4 = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': getTestIp()
      },
      body: JSON.stringify({
        fullname: testAuthorName,
        phone: testPhone,
        sector: 'long-binh',
        event_slug: 'ok-om-bok-2026',
        client_rsvp_id: testClientRsvpId,
        claim_token: 'clm_fake_invalid_token_999999999999999999999999'
      })
    };
    const res4 = createMockRes();
    await handler(req4, res4);

    assert(res4.statusCode === 403, 'Token bí mật sai bị từ chối dứt khoát với HTTP 403');
    assert(!res4.data?.data, 'Không rò rỉ dữ liệu vé với token sai');

    // 5. Kẻ khác gửi client_rsvp_id mới với SĐT đã đăng ký -> Bị chặn 409 DUPLICATE_REGISTRATION
    console.log('\n[Test 5] Đăng ký mới với SĐT đã có vé nhưng không có token chính chủ -> Bị chặn 409:');
    const req5 = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': getTestIp()
      },
      body: JSON.stringify({
        fullname: 'Người Dùng Khác',
        phone: testPhone,
        sector: 'long-binh',
        event_slug: 'ok-om-bok-2026',
        client_rsvp_id: `other-${Date.now()}`
      })
    };
    const res5 = createMockRes();
    await handler(req5, res5);

    assert(res5.statusCode === 409, 'SĐT đã đăng ký bị từ chối tạo mới với HTTP 409');
    assert(!res5.data?.data, 'Không để lộ vé của người dùng trước');

    // 6. Gửi Bearer Token KHÔNG HỢP LỆ HOẶC HẾT HẠN -> Dừng xử lý ngay lập tức (HTTP 401)
    console.log('\n[Test 6] Bearer token không hợp lệ / hết hạn -> Dừng ngay lập tức với HTTP 401:');
    const req6Auth = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer mock-expired-token',
        'x-forwarded-for': getTestIp()
      },
      body: JSON.stringify({
        fullname: 'Thử Nghiệm JWT Lỗi',
        phone: '0981112233',
        sector: 'long-binh',
        event_slug: 'ok-om-bok-2026',
        client_rsvp_id: `jwt-fail-${Date.now()}`
      })
    };
    const res6Auth = createMockRes();
    await handler(req6Auth, res6Auth);

    assert(res6Auth.statusCode === 401, `Bearer token không hợp lệ bị từ chối ngay với HTTP 401 (Status ${res6Auth.statusCode})`);
    assert(res6Auth.data?.error?.code === 'UNAUTHENTICATED', 'Mã lỗi UNAUTHENTICATED chính xác');
    assert(!res6Auth.data?.data, 'Không tạo bất kỳ vé nào khi JWT lỗi');

    // 7. Kiểm tra validation dữ liệu đầu vào
    console.log('\n[Test 7] Kiểm tra validation dữ liệu đầu vào:');
    const req7 = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': getTestIp()
      },
      body: JSON.stringify({
        fullname: 'A',
        phone: '123',
        sector: 'Z'
      })
    };
    const res7 = createMockRes();
    await handler(req7, res7);
    assert(res7.statusCode === 400, 'API từ chối dữ liệu không hợp lệ với HTTP 400');
    assert(res7.data?.error?.code === 'INVALID_FULLNAME', 'Báo lỗi INVALID_FULLNAME rõ ràng');

  } finally {
    // Dọn dẹp AN TOÀN TUYỆT ĐỐI: CHỈ XÓA ĐÚNG CÁC ID DO PHIÊN KIỂM THỬ NÀY TẠO RA
    console.log('\n--- DỌN DẸP DỮ LIỆU THỬ NGHIỆM TRÊN SUPABASE (TARGETED ID CLEANUP) ---');
    for (const ticketId of createdTicketIds) {
      if (!ticketId) continue;
      const cleanUrl = `${baseUrl}/rest/v1/event_rsvps?id=eq.${encodeURIComponent(ticketId)}`;
      const cleanRes = await fetch(cleanUrl, {
        method: 'DELETE',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`
        }
      });
      console.log(`  Dọn dẹp chính xác vé ID ${ticketId}: HTTP ${cleanRes.status}`);
    }
    console.log('--- HOÀN TẤT DỌN DẸP AN TOÀN: 0% ẢNH HƯỞNG ĐẾN CÁC DỮ LIỆU KHÁC ---');
  }

  console.log('\n================================================================================');
  console.log(` TỔNG KẾT: ${passed}/${total} BÀI KIỂM THỬ ĐẠT CHUẨN HOÀN TOÀN`);
  console.log('================================================================================');
}

run().catch(err => {
  console.error('\n❌ Lỗi kiểm thử:', err.message);
  process.exit(1);
});
