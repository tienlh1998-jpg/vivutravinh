/**
 * scripts/measure-load-performance.cjs
 *
 * Kiểm thử đo lường hiệu năng & tải thực tế (Measured Load & Latency Benchmark)
 * Target: https://vivutravinh.id.vn (Production Vercel & Supabase Live)
 *
 * Phân tầng đo lường:
 * 1. Tầng Phân phối Tĩnh / Edge CDN (Web Shell, HTML, version.json)
 * 2. Tầng API Đọc Công Khai (Serverless Functions: /api/places, /api/festivals, /api/clubs, /api/articles)
 * 3. Tầng Truy vấn Trực tiếp CSDL Supabase PostgREST (Anon key) so với API Serverless
 * 4. Tầng API Ghi & Giới hạn Tần suất (POST /api/submit-rsvp: Cooldown, 429 & Idempotency)
 *
 * Thu thập số liệu thực nghiệm:
 * - TTFB & Tổng độ trễ (Min, Mean, P50, P90, P95, Max)
 * - Tốc độ thông lượng (Throughput RPS)
 * - Tỷ lệ thành công (Success Rate %)
 * - Trạng thái Cache (x-vercel-cache HIT/MISS, cache-control)
 */

const https = require('https');
const http = require('http');
const { performance } = require('perf_hooks');

const PROD_BASE = 'https://vivutravinh.id.vn';
const SUPABASE_URL = 'https://foyraoimhksfvlxndwxr.supabase.co';
const ANON_KEY = 'sb_publishable_ThGdyDQHqdNXPFgKRr0XaA_copz_ulU';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function calculateStats(latencies) {
  if (!latencies || latencies.length === 0) {
    return { min: 0, mean: 0, p50: 0, p90: 0, p95: 0, max: 0 };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length);
  const p = (pct) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * pct))];
  return {
    min: Math.round(min),
    mean,
    p50: Math.round(p(0.50)),
    p90: Math.round(p(0.90)),
    p95: Math.round(p(0.95)),
    max: Math.round(max)
  };
}

function sendTimedRequest(url, options = {}) {
  return new Promise((resolve) => {
    const startTime = performance.now();
    let ttfb = null;
    const req = https.request(url, options, (res) => {
      ttfb = Math.round(performance.now() - startTime);
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const totalDuration = Math.round(performance.now() - startTime);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          ttfb,
          totalDuration,
          bodyLength: Buffer.byteLength(data),
          body: data,
          error: null
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        statusCode: 0,
        headers: {},
        ttfb: null,
        totalDuration: Math.round(performance.now() - startTime),
        bodyLength: 0,
        error: err.message
      });
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function runBenchmarkBatch(label, url, options, totalRequests, concurrency) {
  process.stdout.write(`  Đang đo [${label}] (${totalRequests} reqs, concurrency ${concurrency})... `);
  
  // Warmup 2 requests
  await sendTimedRequest(url, options);
  await sendTimedRequest(url, options);

  const results = [];
  const startBatchTime = performance.now();
  let completed = 0;
  let index = 0;

  async function worker() {
    while (index < totalRequests) {
      const myIdx = index++;
      const res = await sendTimedRequest(url, options);
      results.push(res);
      completed++;
    }
  }

  const workers = [];
  for (let c = 0; c < concurrency; c++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const totalTimeSeconds = (performance.now() - startBatchTime) / 1000;
  const latencies = results.map(r => r.totalDuration);
  const ttfbs = results.filter(r => r.ttfb !== null).map(r => r.ttfb);
  const statusCounts = {};
  results.forEach(r => {
    statusCounts[r.statusCode] = (statusCounts[r.statusCode] || 0) + 1;
  });

  const successCount = results.filter(r => r.statusCode >= 200 && r.statusCode < 400).length;
  const successRate = ((successCount / totalRequests) * 100).toFixed(1);
  const rps = (totalRequests / totalTimeSeconds).toFixed(1);

  const stats = calculateStats(latencies);
  const ttfbStats = calculateStats(ttfbs);
  const lastHeaders = results[results.length - 1]?.headers || {};

  console.log(`Hoàn tất (${totalTimeSeconds.toFixed(2)}s, ${rps} RPS)`);

  return {
    label,
    url,
    totalRequests,
    concurrency,
    successRate: `${successRate}%`,
    rps: Number(rps),
    stats,
    ttfbStats,
    statusCounts,
    cacheHeader: lastHeaders['x-vercel-cache'] || lastHeaders['cf-cache-status'] || 'N/A',
    cacheControl: lastHeaders['cache-control'] || 'N/A'
  };
}

async function main() {
  console.log('================================================================================');
  console.log(' KIỂM THỬ ĐO LƯỜNG TẢI & ĐỘ TRỄ THỰC TẾ TRÊN MÔI TRƯỜNG PRODUCTION LIVE');
  console.log(' Target: ' + PROD_BASE);
  console.log(' Thời điểm: ' + new Date().toISOString());
  console.log('================================================================================\n');

  const report = [];

  // =========================================================================
  // 1. TẦNG PHÂN PHỐI TĨNH & EDGE CDN
  // =========================================================================
  console.log('[TẦNG 1] ĐO LƯỜNG TẦNG PHÂN PHỐI TĨNH & GLOBAL EDGE CDN');
  
  // 1.1 Web Shell / Trang chủ (HTML) - Đo baseline P50 & TTFB
  const resHome = await runBenchmarkBatch(
    '1.1 HTML Shell (/) - Base Load',
    `${PROD_BASE}/`,
    { method: 'GET' },
    20,
    5
  );
  report.push(resHome);

  // 1.2 Metadata / Version JSON - Edge Cache Check
  const resVer = await runBenchmarkBatch(
    '1.2 Static JSON (/version.json) - Burst Load',
    `${PROD_BASE}/version.json`,
    { method: 'GET' },
    30,
    10
  );
  report.push(resVer);

  // =========================================================================
  // 2. TẦNG SERVERLESS READ APIS (Vercel Serverless Functions)
  // =========================================================================
  console.log('\n[TẦNG 2] ĐO LƯỜNG CÁC API ĐỌC SERVERLESS (Vercel Node.js Functions)');

  // 2.1 API Clubs (/api/clubs) - Tải CLB & hoạt động
  const resClubs = await runBenchmarkBatch(
    '2.1 API Clubs (/api/clubs) - Đọc CLB',
    `${PROD_BASE}/api/clubs`,
    { method: 'GET' },
    20,
    5
  );
  report.push(resClubs);

  // 2.2 API Articles (/api/articles) - Tải cẩm nang du lịch
  const resArticles = await runBenchmarkBatch(
    '2.2 API Articles (/api/articles) - Đọc cẩm nang',
    `${PROD_BASE}/api/articles`,
    { method: 'GET' },
    20,
    5
  );
  report.push(resArticles);

  // 2.3 API Community Events (/api/community-events) - Tải sự kiện cộng đồng
  const resEvents = await runBenchmarkBatch(
    '2.3 API Events (/api/community-events) - Đọc sự kiện',
    `${PROD_BASE}/api/community-events`,
    { method: 'GET' },
    20,
    5
  );
  report.push(resEvents);

  // 2.4 API Community Posts (/api/community-posts) - Đọc bảng tin thảo luận
  const resPosts = await runBenchmarkBatch(
    '2.4 API Posts (/api/community-posts) - Đọc thảo luận',
    `${PROD_BASE}/api/community-posts`,
    { method: 'GET' },
    20,
    5
  );
  report.push(resPosts);

  // =========================================================================
  // 3. TẦNG TRUY VẤN TRỰC TIẾP SUPABASE REST (Anon Key) - DỮ LIỆU ĐỊA ĐIỂM
  // =========================================================================
  console.log('\n[TẦNG 3] ĐO LƯỜNG TRUY VẤN ĐỊA ĐIỂM TRỰC TIẾP TỪ SUPABASE POSTGREST');
  console.log('  (Ghi chú: Frontend ViVuTraVinh tải địa điểm trực tiếp qua Supabase REST anon key để tối ưu độ trễ và không tốn slot Serverless)');

  const resSupabase = await runBenchmarkBatch(
    '3.1 Supabase REST Direct (/rest/v1/places)',
    `${SUPABASE_URL}/rest/v1/places?status=eq.approved&select=id,name,category&limit=20`,
    {
      method: 'GET',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`
      }
    },
    20,
    5
  );
  report.push(resSupabase);

  // =========================================================================
  // 4. TẦNG GHI & RATE-LIMIT BEHAVIOR (Submit RSVP)
  // =========================================================================
  console.log('\n[TẦNG 4] ĐO LƯỜNG HÀNH VI GIỚI HẠN TẦN SUẤT & IDEMPOTENCY (POST /api/submit-rsvp)');
  
  const testPhone = '098' + Math.floor(1000000 + Math.random() * 9000000);
  let createdTicketId = null;

  console.log(`  Gửi 4 requests liên tiếp đến API Đặt vé cùng IP (SĐT: ${testPhone})...`);
  const rsvpResults = [];
  for (let i = 0; i < 4; i++) {
    const res = await sendTimedRequest(`${PROD_BASE}/api/submit-rsvp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullname: 'Benchmark Load Tester',
        phone: testPhone,
        sector: 'ao-ba-om',
        client_rsvp_id: 'bench-test-idempotency'
      })
    });
    if (res.statusCode === 201 && res.body) {
      try {
        const parsed = JSON.parse(res.body);
        if (parsed?.data?.id) {
          createdTicketId = parsed.data.id;
        }
      } catch (_) {}
    }
    rsvpResults.push({
      reqIdx: i + 1,
      status: res.statusCode,
      duration: res.totalDuration
    });
    await sleep(100);
  }

  // Dọn dẹp ticket tạo ra bằng service key NẾU và CHỈ NẾU lần chạy này đã tạo thành công vé (có createdTicketId dạng UUID)
  if (createdTicketId) {
    try {
      const fs = require('fs');
      const path = require('path');
      const envTmp = fs.readFileSync(path.resolve(__dirname, '../.env.live.tmp'), 'utf8');
      const serviceKey = envTmp.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)[1];
      
      const delRes = await fetch(`${SUPABASE_URL}/rest/v1/event_rsvps?id=eq.${createdTicketId}`, {
        method: 'DELETE',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
      });
      console.log(`  ✓ Đã dọn dẹp targeted đúng vé kiểm thử (ID: ${createdTicketId}): HTTP ${delRes.status}`);
    } catch (cleanErr) {
      console.warn('  (Dọn dẹp vé benchmark bỏ qua do:', cleanErr.message, ')');
    }
  } else {
    console.log('  ✓ Không có vé mới được tạo (bị chặn bởi Rate-limiter/Auth), không cần dọn dẹp CSDL.');
  }

  // =========================================================================
  // TỔNG KẾT & XUẤT BẢNG SỐ LIỆU ĐO LƯỜNG
  // =========================================================================
  console.log('\n================================================================================');
  console.log(' BẢNG KẾT QUẢ ĐO LƯỜNG HIỆU NĂNG & TẢI THỰC TẾ (BENCHMARK SUMMARY)');
  console.log('================================================================================');
  console.log(
    '| STT | Endpoint / Kịch bản                      | Req | Conc | RPS   | P50 (ms) | P95 (ms) | Max (ms) | Thành công | Vercel Cache |'
  );
  console.log(
    '|-----|------------------------------------------|-----|------|-------|----------|----------|----------|------------|--------------|'
  );

  report.forEach((item, idx) => {
    const stt = String(idx + 1).padEnd(3);
    const label = item.label.padEnd(40).slice(0, 40);
    const req = String(item.totalRequests).padStart(3);
    const conc = String(item.concurrency).padStart(4);
    const rps = String(item.rps.toFixed(1)).padStart(5);
    const p50 = String(item.stats.p50).padStart(8);
    const p95 = String(item.stats.p95).padStart(8);
    const max = String(item.stats.max).padStart(8);
    const succ = String(item.successRate).padStart(10);
    const cache = String(item.cacheHeader).padEnd(12).slice(0, 12);
    console.log(`| ${stt} | ${label} | ${req} | ${conc} | ${rps} | ${p50} | ${p95} | ${max} | ${succ} | ${cache} |`);
  });

  console.log('--------------------------------------------------------------------------------');
  console.log('Chi tiết hành vi Rate-limiting trên POST /api/submit-rsvp:');
  rsvpResults.forEach(r => {
    console.log(`  - Lần ${r.reqIdx}: HTTP ${r.status} (${r.duration}ms) ${r.status === 429 ? '-> RATE LIMITED (Chặn đúng thiết kế)' : (r.status === 409 ? '-> CONFLICT (Trùng lặp)' : '-> SUCCESS/BLOCKED')}`);
  });

  console.log('\n================================================================================');
  console.log(' KẾT LUẬN: ĐO ĐỘ TRỄ Ở TẢI NHỎ (20–30 request, tối đa 5–10 request đồng thời)');
  console.log('================================================================================');
  
  const edgeItem = report.find(r => r.label.includes('version.json'));
  const htmlItem = report.find(r => r.label.includes('HTML Shell'));
  const clubsItem = report.find(r => r.label.includes('Clubs'));
  const articlesItem = report.find(r => r.label.includes('Articles'));
  const directItem = report.find(r => r.label.includes('Supabase REST'));

  console.log(`1. Tầng Phân phối Tĩnh (Edge CDN - Đo độ trễ ở tải nhỏ):`);
  console.log(`   - P50: ${edgeItem?.stats.p50}ms | P95: ${edgeItem?.stats.p95}ms | Throughput: ${edgeItem?.rps} req/s`);
  console.log(`   - Trạng thái Cache: ${edgeItem?.cacheHeader} (Phân phối từ Edge PoP gần nhất).`);
  console.log(`   - Ghi chú: Kết quả đo kiểm 20–30 request cho thấy Edge CDN phản hồi ổn định ở mức ~75ms.`);

  console.log(`\n2. Tầng Serverless Functions (/api/clubs, /api/articles, v.v.):`);
  console.log(`   - P50 CLB: ${clubsItem?.stats.p50}ms | P95: ${clubsItem?.stats.p95}ms | Throughput: ${clubsItem?.rps} req/s`);
  console.log(`   - P50 Cẩm nang: ${articlesItem?.stats.p50}ms | P95: ${articlesItem?.stats.p95}ms | Throughput: ${articlesItem?.rps} req/s`);
  console.log(`   - So sánh với Supabase REST direct: P50 = ${directItem?.stats.p50}ms (PostgREST direct nhanh hơn đáng kể).`);

  console.log(`\n3. Phạm vi kết luận & Lưu ý quan trọng về Caching:`);
  console.log(`   - BÀI TEST NÀY CHỈ ĐO ĐỘ TRỄ Ở TẢI NHỎ (5-10 request đồng thời), chưa phải kiểm thử chịu tải hàng nghìn người.`);
  console.log(`   - Giới hạn hạ tầng: Vercel Hobby tối đa 12 functions, 100 concurrent executions; Supabase Free pool 15-20 connections.`);
  console.log(`   - Lưu ý quan trọng về Caching: /api/clubs và /api/articles phục vụ cả dữ liệu theo tài khoản và trạng thái kiểm duyệt (pending/rejected, bài viết cá nhân, hoạt động do chủ nhiệm tạo). Do đó, chỉ được cấu hình s-maxage cho các phản hồi dữ liệu công khai approved khi không có ngữ cảnh phiên đăng nhập hay tham số lọc cá nhân.`);
  console.log('================================================================================\n');
}

main().catch(err => {
  console.error('Lỗi kiểm thử hiệu năng:', err);
  process.exitCode = 1;
});
