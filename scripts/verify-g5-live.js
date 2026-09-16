#!/usr/bin/env node

/**
 * scripts/verify-g5-live.js
 *
 * Kiểm toán kết nối và chính sách Row Level Security (RLS) trên môi trường Supabase THỰC TẾ.
 * Lưu ý: Bộ kiểm thử này chỉ chạy thành công khi dự án Supabase đang hoạt động trực tuyến
 * và đã hoàn tất chạy migration SQL (supabase/place_comments.sql, supabase/storage.sql).
 *
 * Tùy chọn cờ:
 *   --allow-offline : Cho phép thoát mã 0 (đánh dấu SKIPPED) nếu máy chủ chưa kết nối được.
 *   (Mặc định không có cờ: Thoát mã 1 khi không kết nối được để CI không nhận nhầm là PASS).
 */

const allowOffline = process.argv.includes('--allow-offline');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://foyraoimhksfvlxndwxr.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZveXJhb2ltaGtzZnZseG5kd3hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjkwNzAsImV4cCI6MjA5NTMwNTA3MH0.ARJ173UkVNCichCiJmVrbp2aTByVoXnSEAIsIvbnYJ8';

async function checkLiveConnection() {
  console.log('=== KIỂM TOÁN TÍCH HỢP SUPABASE THỰC TẾ (G5 LIVE AUDIT) ===\n');
  console.log(`Đang kiểm tra kết nối tới: ${SUPABASE_URL}`);

  const baseUrl = SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    const testRes = await fetch(`${baseUrl}/rest/v1/places?select=count&limit=1`, {
      method: 'HEAD',
      headers,
      signal: AbortSignal.timeout(5000),
    });

    console.log(`✓ Kết nối mạng tới Supabase thành công (HTTP ${testRes.status})`);
  } catch (connErr) {
    console.warn('\n⏸️ [G5 LIVE AUDIT] KHÔNG THỂ KẾT NỐI TỚI MÁY CHỦ SUPABASE');
    console.warn(`- URL mục tiêu: ${baseUrl}`);
    console.warn(`- Chi tiết lỗi: ${connErr.message}`);
    console.warn('\n📌 TRẠNG THÁI HIỆN TẠI:');
    console.warn('  • G5 Code Readiness: ĐẠT (Schema, API backend, Rate limit, Pre-moderation đã sẵn sàng).');
    console.warn('  • Live Integration: Đang tạm hoãn chờ máy chủ Supabase staging/production hoạt động.');
    console.warn('\n📋 CÁC BƯỚC CẦN THỰC HIỆN KHI MÁY CHỦ SẴN SÀNG:');
    console.warn('  1. Đảm bảo cấu hình biến môi trường SUPABASE_URL và SUPABASE_ANON_KEY chính xác.');
    console.warn('  2. Chạy file SQL migration: supabase/place_comments.sql và supabase/storage.sql.');
    console.warn('  3. Chạy lại lệnh: npm run test:g5:live để hoàn tất nghiệm thu trực tiếp.\n');

    if (allowOffline) {
      console.warn('⚠️ [SKIPPED] Chạy ở chế độ --allow-offline: Thoát mã 0 (bỏ qua kiểm thử live).');
      process.exit(0);
    } else {
      console.error('❌ [FAILED] Live audit không thể hoàn thành vì máy chủ offline. Thoát mã 1 (yêu cầu server hoạt động).');
      process.exit(1);
    }
  }

  // --- NẾU KẾT NỐI THÀNH CÔNG, TIẾN HÀNH KIỂM TOÁN RLS THỰC TẾ ---
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

  console.log('\n--- BẮT ĐẦU KIỂM TOÁN RLS TRÊN POSTGRESQL THẬT ---');

  // Case 1: Public đọc địa điểm approved
  await assertCase('Public đọc được địa điểm approved', async () => {
    const res = await fetch(`${baseUrl}/rest/v1/places?select=id,status&status=eq.approved&limit=5`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Không trả về mảng dữ liệu');
  });

  // Case 2: Anon không được đọc địa điểm draft hoặc hidden
  await assertCase('Anon bị RLS chặn không đọc được địa điểm draft/hidden', async () => {
    const res = await fetch(`${baseUrl}/rest/v1/places?select=id,status&status=eq.draft`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.length > 0) throw new Error(`RLS bị hở: Anon đọc được ${data.length} địa điểm draft`);
  });

  // Case 3: Anon bị chặn khi cố tạo địa điểm (payload hợp lệ nhưng bị RLS chặn)
  await assertCase('Anon bị chặn 403 khi cố tạo địa điểm mới', async () => {
    const res = await fetch(`${baseUrl}/rest/v1/places`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Hacker Place',
        slug: 'hacker-place-' + Date.now(),
        category: 'Điểm Check-in / Sống Ảo',
        area: 'TP. Trà Vinh',
        address: '123 Đường Test, TP. Trà Vinh',
        status: 'approved'
      }),
    });
    if (res.ok) throw new Error('Anon tạo được địa điểm thành công (RLS chưa bật hoặc policy sai)!');
    if (res.status !== 401 && res.status !== 403) throw new Error(`Mã trạng thái trả về không phải 401/403: ${res.status}`);
  });

  // Case 4: Chặn tuyệt đối Anon gửi bình luận trực tiếp qua REST (phải qua /api/submit-comment)
  await assertCase('Anon bị RLS chặn 403 khi cố gửi bình luận trực tiếp qua REST (Bảo vệ Rate Limit)', async () => {
    const res = await fetch(`${baseUrl}/rest/v1/place_comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        place_id: 'ao-ba-om',
        place_name: 'Ao Bà Om',
        author_name: 'Hacker Anon',
        rating: 5,
        comment_text: 'Bình luận thử nghiệm bypass rate limit',
        client_review_id: 'test_audit_direct_' + Date.now(),
        status: 'pending',
        is_hidden: false,
      }),
    });
    if (res.ok) throw new Error('Anon gửi được bình luận trực tiếp qua REST (Hở lỗ hổng bypass rate limit)!');
    if (res.status !== 401 && res.status !== 403) throw new Error(`Mã trạng thái không phải 401/403: ${res.status}`);
  });

  // Case 5: Anon chỉ đọc được bình luận approved và is_hidden = false
  await assertCase('Anon chỉ đọc được bình luận approved và không bị ẩn', async () => {
    const res = await fetch(`${baseUrl}/rest/v1/place_comments?select=id,status,is_hidden&limit=10`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const comments = await res.json();
    const violation = comments.find(c => c.status !== 'approved' || c.is_hidden === true);
    if (violation) throw new Error(`Phát hiện bình luận vi phạm chính sách RLS: id=${violation.id}, status=${violation.status}, hidden=${violation.is_hidden}`);
  });

  // Case 6: Anon bị chặn sửa/xóa bình luận (RLS UPDATE & DELETE)
  await assertCase('Anon bị chặn sửa/xóa bình luận (chứng minh bản ghi không bị thay đổi hoặc xóa)', async () => {
    // 1. Tìm một bản ghi approved hiện có để thử nghiệm
    const checkRes = await fetch(`${baseUrl}/rest/v1/place_comments?select=id,comment_text&status=eq.approved&limit=1`, { headers });
    const existing = checkRes.ok ? await checkRes.json() : [];

    if (Array.isArray(existing) && existing.length > 0) {
      const target = existing[0];
      const targetId = target.id;
      const originalText = target.comment_text;

      // 2. Thử DELETE: Yêu cầu PostgREST trả về representation để đo số lượng hàng bị tác động
      const delRes = await fetch(`${baseUrl}/rest/v1/place_comments?id=eq.${targetId}`, {
        method: 'DELETE',
        headers: { ...headers, Prefer: 'return=representation' },
      });

      // Nếu HTTP status là 200 hoặc 204: Kiểm tra representation
      if (delRes.ok) {
        const deletedRows = await delRes.json().catch(() => []);
        if (Array.isArray(deletedRows) && deletedRows.length > 0) {
          throw new Error(`Anon đã xóa thành công bản ghi id=${targetId}! RLS DELETE bị hở!`);
        }
      }

      // 3. Đọc lại để chứng minh bản ghi vẫn còn nguyên vẹn trong DB
      const verifyDelRes = await fetch(`${baseUrl}/rest/v1/place_comments?id=eq.${targetId}&select=id`, { headers });
      const verifyDelRows = verifyDelRes.ok ? await verifyDelRes.json() : [];
      if (!Array.isArray(verifyDelRows) || verifyDelRows.length === 0) {
        throw new Error(`Bản ghi id=${targetId} đã bị xóa sau yêu cầu DELETE của anon!`);
      }

      // 4. Thử PATCH (UPDATE): Cố gắng sửa nội dung bình luận
      const patchRes = await fetch(`${baseUrl}/rest/v1/place_comments?id=eq.${targetId}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ comment_text: 'Bị sửa trái phép bởi Anon Hacker' }),
      });

      if (patchRes.ok) {
        const patchedRows = await patchRes.json().catch(() => []);
        if (Array.isArray(patchedRows) && patchedRows.length > 0) {
          throw new Error(`Anon đã sửa thành công bản ghi id=${targetId}! RLS UPDATE bị hở!`);
        }
      }

      // 5. Đọc lại để chứng minh comment_text không bị biến dạng
      const verifyPatchRes = await fetch(`${baseUrl}/rest/v1/place_comments?id=eq.${targetId}&select=comment_text`, { headers });
      const verifyPatchRows = verifyPatchRes.ok ? await verifyPatchRes.json() : [];
      if (verifyPatchRows.length > 0 && verifyPatchRows[0].comment_text !== originalText) {
        throw new Error(`Nội dung bản ghi id=${targetId} đã bị sửa đổi trái phép bởi anon!`);
      }
    } else {
      // Khi DB chưa có bình luận approved nào: Thử DELETE với filter bất kỳ kèm Prefer: return=representation
      const delRes = await fetch(`${baseUrl}/rest/v1/place_comments?id=gt.0`, {
        method: 'DELETE',
        headers: { ...headers, Prefer: 'return=representation' },
      });
      if (delRes.ok) {
        const deletedRows = await delRes.json().catch(() => []);
        if (Array.isArray(deletedRows) && deletedRows.length > 0) {
          throw new Error('Anon đã xóa được dữ liệu qua REST! RLS DELETE bị hở!');
        }
      }
    }
  });

  console.log(`\n=== KẾT QUẢ KIỂM TOÁN RLS THỰC TẾ: ${passCount}/${totalCount} ĐẠT ===\n`);
  if (passCount < totalCount) {
    process.exit(1);
  }
}

checkLiveConnection();
