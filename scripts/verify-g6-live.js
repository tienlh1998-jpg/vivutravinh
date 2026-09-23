#!/usr/bin/env node

/**
 * scripts/verify-g6-live.js
 *
 * Kiểm toán endpoint Vercel THỰC TẾ và cơ sở dữ liệu Supabase cho Giai đoạn G6:
 * - Không mock fetch. Toàn bộ request gửi trực tiếp qua mạng Internet tới Vercel serverless API.
 * - Kiểm tra endpoint /api/submit-place:
 *     1. Tiếp nhận bản ghi hợp lệ, cưỡng chế status: draft (HTTP 201), images rỗng.
 *     2. Retry NGAY LẬP TỨC từ cùng IP với cùng client_submission_id nhưng thay đổi name:
 *        Chứng minh Idempotency được xử lý TRƯỚC rate-limit, phản hồi ngay HTTP 200 Idempotent (không bị 429 cooldown).
 *     3. Xác minh trực tiếp trên DB (yêu cầu SUPABASE_SERVICE_ROLE_KEY hoặc ADMIN_SECRET):
 *        Không được PASS nếu thiếu quyền kiểm tra DB (phải FAIL và exit 1).
 *     4. Xác nhận dọn dẹp (cleanup) bản ghi test bắt buộc phải thành công qua Admin API hoặc Service Role.
 *
 * Cờ tùy chọn:
 *   --allow-offline : Thoát mã 0 nếu Vercel chưa deploy hoặc chưa có kết nối mạng (dành cho môi trường dev local).
 *   (Mặc định: Thoát mã 1 nếu Vercel 404 hoặc thiếu quyền kiểm toán DB để đảm bảo tính trung thực).
 */

const allowOffline = process.argv.includes('--allow-offline');

const FALLBACK_DEPLOYMENT_URL = 'https://vivutravinh.vercel.app';
const rawVercelUrl = process.env.VERCEL_URL || process.env.APP_URL || FALLBACK_DEPLOYMENT_URL;
const VERCEL_BASE = rawVercelUrl.startsWith('http') ? rawVercelUrl.replace(/\/$/, '') : `https://${rawVercelUrl.replace(/\/$/, '')}`;
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://foyraoimhksfvlxndwxr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function runLiveAudit() {
  console.log('=== KIỂM TOÁN TÍCH HỢP VERCEL & SUPABASE THỰC TẾ (G6 LIVE AUDIT) ===\n');
  console.log(`Đang kiểm tra kết nối tới Vercel API: ${VERCEL_BASE}/api/submit-place`);

  // 1. Kiểm tra tính sẵn sàng của endpoint thật trên Vercel
  let endpointReady = false;
  try {
    const probeRes = await fetch(`${VERCEL_BASE}/api/submit-place`, {
      method: 'GET',
      signal: AbortSignal.timeout(8000)
    });

    // submit-place chỉ chấp nhận POST; nếu trả về 405 Method Not Allowed nghĩa là hàm serverless ĐÃ DEPLOY và HOẠT ĐỘNG
    if (probeRes.status === 405 || probeRes.ok || probeRes.status === 400) {
      console.log(`✓ Endpoint /api/submit-place trên Vercel phản hồi sẵn sàng (HTTP ${probeRes.status})\n`);
      endpointReady = true;
    } else if (probeRes.status === 404) {
      console.warn(`⚠️ [G6 LIVE AUDIT] Endpoint trả về HTTP 404 Not Found.`);
    } else {
      console.warn(`⚠️ [G6 LIVE AUDIT] Phản hồi bất thường: HTTP ${probeRes.status}`);
    }
  } catch (probeErr) {
    console.warn(`⚠️ [G6 LIVE AUDIT] Không thể kết nối tới ${VERCEL_BASE}: ${probeErr.message}`);
  }

  if (!endpointReady) {
    console.warn('\n⏸️ [G6 LIVE AUDIT] ENDPOINT VERCEL CHƯA SẴN SÀNG HOẶC CHƯA DEPLOY');
    console.warn(`- URL mục tiêu: ${VERCEL_BASE}/api/submit-place`);
    console.warn('📌 NGUYÊN NHÂN:');
    console.warn('  • Các commit G6 chứa api/submit-place.js chưa được git push lên GitHub kết nối với Vercel.');
    console.warn('  • File SQL migration supabase/g6_contributions.sql chưa được chạy trong Supabase Dashboard.');
    console.warn('\n📋 CÁC BƯỚC CẦN THỰC HIỆN ĐỂ HOÀN TẤT LIVE AUDIT:');
    console.warn('  1. Chạy migration supabase/g6_contributions.sql trong Supabase SQL Editor.');
    console.warn('  2. Đẩy commit lên branch main (git push) để Vercel tự động build & deploy serverless endpoint.');
    console.warn('  3. Cấu hình biến môi trường SUPABASE_SERVICE_ROLE_KEY hoặc ADMIN_SECRET để kiểm toán DB.');
    console.warn('  4. Chạy lại lệnh: npm run test:g6:live để hoàn tất nghiệm thu trực tiếp.\n');

    if (allowOffline) {
      console.warn('⚠️ [SKIPPED] Chạy ở chế độ --allow-offline: Thoát mã 0.');
      process.exit(0);
    } else {
      console.error('❌ [FAILED] G6 Live Audit yêu cầu Vercel endpoint hoạt động thực tế. Thoát mã 1.');
      process.exit(1);
    }
  }

  let passCount = 0;
  let totalCount = 0;

  async function assertCase(name, fn) {
    totalCount++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passCount++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    }
  }

  console.log('--- BẮT ĐẦU KIỂM TOÁN ENDPOINT VERCEL & SUPABASE THỰC TẾ ---');

  const testSubmissionId = `audit_g6_live_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  let createdPlaceId = null;
  let createdSlug = null;

  // Case 1: Gửi địa điểm đóng góp hợp lệ lần đầu (Yêu cầu HTTP 201 Created, status: 'draft', images: [])
  await assertCase('Vercel API tiếp nhận đóng góp hợp lệ, ép status draft (Không mock, images rỗng)', async () => {
    const res = await fetch(`${VERCEL_BASE}/api/submit-place`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_submission_id: testSubmissionId,
        name: 'Địa Điểm Kiểm Toán Live G6 - Lần 1',
        category: 'Điểm Check-in / Sống Ảo',
        area: 'TP. Trà Vinh',
        address: '123 Đường Phạm Thái Bường, Phường 3, TP. Trà Vinh',
        price_raw: 'Miễn phí',
        display_hours: '08:00 - 18:00',
        description: 'Bản ghi tạo tự động bởi scripts/verify-g6-live.js để kiểm toán luồng đóng góp địa điểm thật.',
        contributor: '[TEST AUDIT - VUI LÒNG XÓA]',
        contact: 'audit-bot@vivutravinh.test',
        images: []
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    const json = await res.json();
    if (!json.success) throw new Error(`API trả về success: false: ${JSON.stringify(json)}`);
    if (json.status !== 'draft') throw new Error(`API không ép status: draft (nhận được: ${json.status})`);

    createdPlaceId = json.data?.id;
    createdSlug = json.data?.slug;
  });

  // Case 2: Retry NGAY LẬP TỨC từ CÙNG IP với cùng client_submission_id nhưng THAY ĐỔI TÊN ĐỊA ĐIỂM
  // Bắt buộc phản hồi HTTP 200 Idempotent ngay (chứng minh kiểm tra idempotency đi trước rate-limit và không bị chặn 429)
  await assertCase('Retry cùng client_submission_id, cùng IP chạy ngay: Idempotent 200 (đi trước rate-limit)', async () => {
    const res = await fetch(`${VERCEL_BASE}/api/submit-place`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_submission_id: testSubmissionId,
        name: 'Địa Điểm Kiểm Toán Live G6 - TÊN ĐÃ ĐỔI HOÀN TOÀN',
        category: 'Điểm Check-in / Sống Ảo',
        area: 'TP. Trà Vinh',
        address: 'Địa chỉ đã thay đổi',
        description: 'Nội dung retry thay đổi để kiểm chứng tính độc lập của khóa client_submission_id.',
        contributor: '[TEST AUDIT - VUI LÒNG XÓA]',
        images: []
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    const json = await res.json();
    if (!json.idempotent) throw new Error('API không trả về cờ idempotent: true khi retry cùng client_submission_id');
    if (json.status !== 'draft') throw new Error(`Trạng thái không phải draft: ${json.status}`);
  });

  // Case 3: Xác minh trên Supabase Database (YÊU CẦU BẮT BUỘC SUPABASE_SERVICE_ROLE_KEY HOẶC ADMIN_SECRET)
  // Tuyệt đối không được PASS nếu thiếu quyền kiểm tra DB (phải FAIL/SKIPPED và thoát mã 1)
  await assertCase('Xác minh cơ sở dữ liệu Supabase: Duy nhất 1 bản ghi draft tồn tại (Bắt buộc quyền quản trị)', async () => {
    if (!SUPABASE_SERVICE_ROLE_KEY && !ADMIN_SECRET) {
      throw new Error('THIẾU QUYỀN: Bắt buộc cấu hình SUPABASE_SERVICE_ROLE_KEY hoặc ADMIN_SECRET để kiểm toán bản ghi trong cơ sở dữ liệu. Không cho phép PASS giả!');
    }

    let records = [];

    if (SUPABASE_SERVICE_ROLE_KEY) {
      const checkRes = await fetch(
        `${SUPABASE_URL}/rest/v1/places?client_submission_id=eq.${encodeURIComponent(testSubmissionId)}&select=id,name,status,client_submission_id`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          }
        }
      );
      if (!checkRes.ok) throw new Error(`Không thể truy vấn Supabase REST: HTTP ${checkRes.status}`);
      records = await checkRes.json();
    } else if (ADMIN_SECRET) {
      const adminRes = await fetch(`${VERCEL_BASE}/api/admin-places?status=draft`, {
        headers: { 'x-admin-secret': ADMIN_SECRET }
      });
      if (!adminRes.ok) throw new Error(`Không thể truy vấn qua Admin API: HTTP ${adminRes.status}`);
      const adminData = await adminRes.json();
      const allDrafts = adminData.places || [];
      records = allDrafts.filter(p => p.client_submission_id === testSubmissionId || p.id === createdPlaceId);
    }

    if (!Array.isArray(records) || records.length !== 1) {
      throw new Error(`Phát hiện số lượng bản ghi không hợp lệ trong DB: ${records.length} (yêu cầu đúng 1 bản ghi duy nhất, không duplicate)`);
    }

    if (records[0].status !== 'draft') {
      throw new Error(`Bản ghi trong database không ở trạng thái draft: ${records[0].status}`);
    }
  });

  // Case 4: Xác nhận dọn dẹp bản ghi test bắt buộc phải thành công (Cleanup Verified)
  await assertCase('Xác nhận dọn dẹp bản ghi audit sau kiểm toán (Cleanup Verified)', async () => {
    let deleted = false;

    // 1. Thử xóa qua Admin API nếu có ADMIN_SECRET
    if (ADMIN_SECRET && createdPlaceId) {
      try {
        const delRes = await fetch(`${VERCEL_BASE}/api/admin-places?id=${encodeURIComponent(createdPlaceId)}`, {
          method: 'DELETE',
          headers: { 'x-admin-secret': ADMIN_SECRET }
        });
        if (delRes.ok) {
          deleted = true;
          console.log(`    [CLEANUP] Đã xóa bản ghi test ID ${createdPlaceId} qua Admin API.`);
        }
      } catch (cleanErr) {
        console.warn(`    ⚠️ Lỗi khi gọi DELETE /api/admin-places: ${cleanErr.message}`);
      }
    }

    // 2. Thử xóa qua Supabase Service Role nếu có SUPABASE_SERVICE_ROLE_KEY
    if (!deleted && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const delDb = await fetch(
          `${SUPABASE_URL}/rest/v1/places?client_submission_id=eq.${encodeURIComponent(testSubmissionId)}`,
          {
            method: 'DELETE',
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
            }
          }
        );
        if (delDb.ok) {
          deleted = true;
          console.log(`    [CLEANUP] Đã xóa bản ghi test client_submission_id=${testSubmissionId} qua Service Role.`);
        }
      } catch (e) {
        console.warn(`    ⚠️ Lỗi khi xóa qua Service Role: ${e.message}`);
      }
    }

    if (!deleted) {
      throw new Error(`KHÔNG THỂ XÁC NHẬN DỌN DẸP: Thiếu quyền quản trị (ADMIN_SECRET hoặc SUPABASE_SERVICE_ROLE_KEY) để xóa bản ghi test "${testSubmissionId}". Bắt buộc phải cleanup thành công!`);
    }
  });

  console.log(`\n=== KẾT QUẢ KIỂM TOÁN VERCEL & SUPABASE LIVE: ${passCount}/${totalCount} ĐẠT ===\n`);
  if (passCount === totalCount && totalCount > 0) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runLiveAudit().catch((err) => {
  console.error('Fatal error during G6 live audit:', err);
  process.exit(1);
});
