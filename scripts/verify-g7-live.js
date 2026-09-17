#!/usr/bin/env node

/**
 * scripts/verify-g7-live.js
 *
 * Kiểm toán endpoint Vercel THỰC TẾ và cơ sở dữ liệu Supabase cho Giai đoạn G7:
 * - Không mock fetch. Toàn bộ request gửi trực tiếp qua mạng Internet tới Vercel serverless API hoặc URL chỉ định.
 * - Kiểm tra endpoint /api/report-place:
 *     1. Từ chối payload vượt quá 64KB với HTTP 413 PAYLOAD_TOO_LARGE.
 *     2. Tiếp nhận báo cáo sai hợp lệ (HTTP 200, status: pending).
 *     3. Retry NGAY LẬP TỨC từ cùng IP với cùng client_report_id:
 *        Chứng minh Idempotency được xử lý TRƯỚC rate-limit, phản hồi ngay HTTP 200 Idempotent (không bị 429).
 * - Kiểm tra Dynamic SEO / Open Graph thô cho bot (api/og-place):
 *     4. Gửi raw HTTP GET tới /?place=ao-ba-om hoặc /api/og-place?place=ao-ba-om (giả lập bot mạng xã hội không chạy JS):
 *        Xác nhận thẻ <title> và <meta property="og:title"> chứa "Ao Bà Om - ViVu Trà Vinh".
 * - Kiểm tra cơ sở dữ liệu Supabase (public.place_reports):
 *     5. Xác nhận bản ghi tồn tại duy nhất 1 dòng trong bảng public.place_reports.
 *     6. Dọn dẹp bản ghi kiểm toán test sạch sẽ khỏi DB.
 *
 * Cờ tùy chọn:
 *   --allow-offline : Thoát mã 0 nếu Vercel chưa deploy hoặc chưa có kết nối mạng (dành cho môi trường dev local).
 *   (Mặc định: Thoát mã 1 nếu Vercel 404 hoặc thiếu quyền kiểm toán DB để đảm bảo tính trung thực).
 */

const allowOffline = process.argv.includes("--allow-offline");

const rawVercelUrl = process.env.VERCEL_URL || process.env.APP_URL || "https://vivutravinh.vercel.app";
const VERCEL_BASE = rawVercelUrl.startsWith("http") ? rawVercelUrl.replace(/\/$/, "") : `https://${rawVercelUrl.replace(/\/$/, "")}`;
const SUPABASE_URL = process.env.SUPABASE_URL || "https://foyraoimhksfvlxndwxr.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function runLiveAudit() {
  console.log("=== KIỂM TOÁN TÍCH HỢP VERCEL & SUPABASE THỰC TẾ (G7 LIVE AUDIT) ===\n");
  console.log(`Đang kiểm tra kết nối tới Vercel API: ${VERCEL_BASE}/api/report-place`);

  // 1. Kiểm tra tính sẵn sàng của endpoint thật trên Vercel
  let endpointReady = false;
  try {
    const probeRes = await fetch(`${VERCEL_BASE}/api/report-place`, {
      method: "GET",
      signal: AbortSignal.timeout(8000)
    });

    if (probeRes.status === 405 || probeRes.ok || probeRes.status === 400) {
      console.log(`✓ Endpoint /api/report-place trên Vercel phản hồi sẵn sàng (HTTP ${probeRes.status})\n`);
      endpointReady = true;
    } else if (probeRes.status === 404) {
      console.warn("⚠️ [G7 LIVE AUDIT] Endpoint trả về HTTP 404 Not Found.");
    } else {
      console.warn(`⚠️ [G7 LIVE AUDIT] Phản hồi bất thường: HTTP ${probeRes.status}`);
    }
  } catch (probeErr) {
    console.warn(`⚠️ [G7 LIVE AUDIT] Không thể kết nối tới ${VERCEL_BASE}: ${probeErr.message}`);
  }

  if (!endpointReady) {
    console.warn("\n⏸️ [G7 LIVE AUDIT] ENDPOINT VERCEL CHƯA SẴN SÀNG HOẶC CHƯA DEPLOY");
    console.warn(`- URL mục tiêu: ${VERCEL_BASE}/api/report-place`);
    console.warn("📌 NGUYÊN NHÂN:");
    console.warn("  • Các commit G7 chứa api/report-place.js và api/og-place.js chưa được git push lên GitHub kết nối với Vercel.");
    console.warn("  • File SQL migration supabase/g7_place_reports.sql chưa được chạy trong Supabase Dashboard.");
    console.warn("\n📋 CÁC BƯỚC CẦN THỰC HIỆN ĐỂ HOÀN TẤT LIVE AUDIT:");
    console.warn("  1. Chạy migration supabase/g7_place_reports.sql trong Supabase SQL Editor.");
    console.warn("  2. Đẩy commit lên branch main (git push) để Vercel tự động build & deploy serverless endpoints.");
    console.warn("  3. Cấu hình biến môi trường SUPABASE_SERVICE_ROLE_KEY để kiểm toán trực tiếp DB.");
    console.warn("  4. Chạy lại lệnh: npm run test:g7:live để hoàn tất nghiệm thu trực tiếp.\n");

    if (allowOffline) {
      console.warn("⚠️ [SKIPPED] Chạy ở chế độ --allow-offline: Thoát mã 0.");
      process.exit(0);
    } else {
      console.error("❌ [FAILED] G7 Live Audit yêu cầu Vercel endpoint hoạt động thực tế. Thoát mã 1.");
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

  console.log("--- BẮT ĐẦU KIỂM TOÁN ENDPOINT VERCEL & SUPABASE THỰC TẾ ---");

  const testReportId = `audit_g7_live_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  let createdRecordId = null;

  // Case 1: Giới hạn payload 64KB (Phải từ chối HTTP 413)
  await assertCase("Từ chối payload vượt quá 64KB với mã HTTP 413 PAYLOAD_TOO_LARGE", async () => {
    const hugeDetails = "A".repeat(65 * 1024);
    const res = await fetch(`${VERCEL_BASE}/api/report-place`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        place_id: "ao-ba-om",
        place_name: "Ao Bà Om",
        issue_type: "wrong_hours",
        details: hugeDetails
      })
    });

    if (res.status !== 413) {
      throw new Error(`Kỳ vọng HTTP 413 nhưng nhận được HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.error?.code !== "PAYLOAD_TOO_LARGE") {
      throw new Error(`Mã lỗi không đúng: ${JSON.stringify(data.error)}`);
    }
  });

  // Case 2: Gửi báo cáo hợp lệ lần đầu (HTTP 200)
  await assertCase("Tiếp nhận báo cáo sai hợp lệ (HTTP 200, status: pending)", async () => {
    const res = await fetch(`${VERCEL_BASE}/api/report-place`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        place_id: "ao-ba-om",
        place_name: "Ao Bà Om",
        issue_type: "wrong_hours",
        details: "[G7 AUDIT TEST] Phản ánh kiểm toán live audit tự động",
        client_report_id: testReportId
      })
    });

    if (res.status !== 200) {
      const errText = await res.text();
      throw new Error(`Kỳ vọng HTTP 200 nhưng nhận được HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    if (!data.success) {
      throw new Error(`Response không có success: true: ${JSON.stringify(data)}`);
    }
    createdRecordId = data.data?.id;
  });

  // Case 3: Retry NGAY LẬP TỨC với cùng client_report_id (Idempotency trước rate limit)
  await assertCase("Retry tức thì cùng client_report_id trả về HTTP 200 Idempotent không bị 429", async () => {
    const res = await fetch(`${VERCEL_BASE}/api/report-place`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        place_id: "ao-ba-om",
        place_name: "Ao Bà Om",
        issue_type: "wrong_hours",
        details: "[G7 AUDIT TEST RETRY] Nội dung sửa đổi nhưng giữ nguyên client_report_id",
        client_report_id: testReportId
      })
    });

    if (res.status !== 200) {
      const errText = await res.text();
      throw new Error(`Kỳ vọng HTTP 200 Idempotent nhưng bị HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    if (!data.success) {
      throw new Error(`Response không thành công: ${JSON.stringify(data)}`);
    }
  });

  // Case 4: Server-side Dynamic SEO & Open Graph cho crawler (Raw HTTP, 0 JavaScript)
  await assertCase("Crawler raw HTTP GET nhận HTML chứa tiêu đề & OG tags địa điểm Ao Bà Om", async () => {
    const ogUrl = `${VERCEL_BASE}/api/og-place?place=ao-ba-om`;
    const res = await fetch(ogUrl, {
      method: "GET",
      headers: {
        "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
      }
    });

    if (res.status !== 200) {
      throw new Error(`Kỳ vọng HTTP 200 nhưng nhận được HTTP ${res.status}`);
    }

    const rawHtml = await res.text();
    if (!rawHtml.includes("<title>Ao Bà Om - ViVu Trà Vinh</title>")) {
      throw new Error("Raw HTML không chứa <title>Ao Bà Om - ViVu Trà Vinh</title>");
    }
    if (!rawHtml.includes("property=\"og:title\" content=\"Ao Bà Om - ViVu Trà Vinh\"")) {
      throw new Error("Raw HTML không chứa thẻ meta og:title chính xác");
    }
    if (!rawHtml.includes("https://vivutravinh.vercel.app/?place=ao-ba-om")) {
      throw new Error("Raw HTML không chứa canonical / og:url chính xác");
    }
  });

  // Case 5 & 6: Xác minh trong cơ sở dữ liệu Supabase & Dọn dẹp
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("\n⚠️ [DB AUDIT SKIPPED] Thiếu biến môi trường SUPABASE_SERVICE_ROLE_KEY để kiểm toán trực tiếp DB.");
    console.warn("  Vui lòng cấu hình: export SUPABASE_SERVICE_ROLE_KEY=\"...\" để xác minh và dọn dẹp bản ghi.");
    if (!allowOffline) {
      console.error("❌ [FAILED] Yêu cầu SUPABASE_SERVICE_ROLE_KEY để hoàn tất live audit đầy đủ.");
      process.exit(1);
    }
  } else {
    const supaBase = SUPABASE_URL.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");

    await assertCase("Xác minh trong Supabase DB: Có đúng 1 bản ghi với client_report_id này", async () => {
      const qRes = await fetch(`${supaBase}/rest/v1/place_reports?client_report_id=eq.${encodeURIComponent(testReportId)}&select=id,place_id,status,client_report_id`, {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      });

      if (!qRes.ok) {
        throw new Error(`Không thể truy vấn place_reports: HTTP ${qRes.status}`);
      }

      const rows = await qRes.json();
      if (!Array.isArray(rows) || rows.length !== 1) {
        throw new Error(`Kỳ vọng đúng 1 bản ghi nhưng có: ${rows?.length || 0}`);
      }
      createdRecordId = rows[0].id;
    });

    await assertCase("Dọn dẹp bản ghi kiểm toán test sạch sẽ khỏi bảng place_reports và xác nhận còn 0 dòng", async () => {
      const delRes = await fetch(`${supaBase}/rest/v1/place_reports?client_report_id=eq.${encodeURIComponent(testReportId)}`, {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      });

      if (!delRes.ok) {
        throw new Error(`Không thể dọn dẹp bản ghi kiểm toán: HTTP ${delRes.status}`);
      }

      // Truy vấn lại để xác nhận bản ghi đã bị xóa hoàn toàn (còn 0 dòng)
      const verifyRes = await fetch(`${supaBase}/rest/v1/place_reports?client_report_id=eq.${encodeURIComponent(testReportId)}&select=id`, {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      });

      if (!verifyRes.ok) {
        throw new Error(`Không thể truy vấn kiểm tra sau xóa: HTTP ${verifyRes.status}`);
      }

      const remainingRows = await verifyRes.json();
      if (!Array.isArray(remainingRows) || remainingRows.length !== 0) {
        throw new Error(`Kỳ vọng 0 dòng sau khi dọn dẹp nhưng còn lại: ${remainingRows?.length || 0}`);
      }
    });
  }

  console.log(`\n========================================`);
  console.log(`KẾT QUẢ G7 LIVE AUDIT: ${passCount}/${totalCount} PASS`);
  console.log(`========================================\n`);

  if (passCount < totalCount) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runLiveAudit();
