#!/usr/bin/env node

/**
 * scripts/test-g9-audit.js
 *
 * Kiểm thử tự động tính toàn vẹn và an toàn của script kiểm toán G9.0 (audit-g9-production.js):
 * 1. Chặn toàn diện mọi HTTP method ngoài GET/HEAD (Zero Mutation Guard).
 * 2. Public Mode không được trả số liệu nội bộ giả (draft, archived, reports, comments pending phải là null/unknown).
 * 3. Admin Mode thực sự gọi đúng các endpoint Vercel /api/admin-*, gửi Bearer token và xử lý phân trang đa trang.
 * 4. Không rò rỉ secret, token hoặc PII trong log và báo cáo.
 * 5. Lỗi kết nối hoặc lỗi máy chủ không bị nuốt thành số 0 (phải giữ total = null và verified = false).
 * 6. Báo cáo Markdown xuất ra khớp 100% với dữ liệu kiểm toán thực tế (không số liệu viết cứng).
 * 7. Ngữ nghĩa báo cáo: cảnh báo scope, completeness, tách biệt matchedApproved vs matchedAnyStatus, status đề xuất archive và NOTE theo authMode.
 */

import assert from 'assert';
import {
  auditFetch,
  isLikelyTestData,
  analyzeMissingFields,
  classifyPlace,
  computeFallbackComparison,
  generateMarkdownReport,
  runProductionAudit
} from './audit-g9-production.js';

console.log('=== BẮT ĐẦU KIỂM THỬ SCRIPT KIỂM TOÁN G9.0 (scripts/test-g9-audit.js) ===\n');

async function runTests() {
  let passed = 0;

  // -------------------------------------------------------------------------
  // Test 1: Method Guard - Chặn toàn bộ mutation
  // -------------------------------------------------------------------------
  console.log('[Test 1] Zero Mutation Guard: Chặn dứt khoát mọi HTTP method ngoài GET/HEAD');
  const blockedMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  for (const m of blockedMethods) {
    let errorThrown = false;
    try {
      await auditFetch('https://example.com', { method: m });
    } catch (err) {
      errorThrown = true;
      assert.ok(err.message.includes('MUTATION_FORBIDDEN'), `Lỗi phải chứa MUTATION_FORBIDDEN, nhận được: ${err.message}`);
    }
    assert.strictEqual(errorThrown, true, `Method ${m} phải bị chặn`);
  }

  // GET và HEAD phải được chuyển tiếp an toàn
  let getPassed = false;
  let headPassed = false;
  const dummyFetch = async (url, opts) => {
    if (opts.method === 'GET') getPassed = true;
    if (opts.method === 'HEAD') headPassed = true;
    return { ok: true, status: 200, json: async () => ({}) };
  };

  await auditFetch('https://example.com', { method: 'GET' }, dummyFetch);
  await auditFetch('https://example.com', { method: 'HEAD' }, dummyFetch);
  assert.strictEqual(getPassed, true, 'GET phải được chấp nhận');
  assert.strictEqual(headPassed, true, 'HEAD phải được chấp nhận');
  console.log('  ✓ Đạt: Chặn thành công POST/PUT/PATCH/DELETE; cho phép GET/HEAD.\n');
  passed++;

  // -------------------------------------------------------------------------
  // Test 2: Public Mode - Không trả tổng nội bộ giả
  // -------------------------------------------------------------------------
  console.log('[Test 2] Public Mode Integrity: Không trả số liệu nội bộ giả');
  const mockPublicFetch = async (url) => {
    if (url.includes('/places')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-range': '0-1/2' }),
        json: async () => [
          { id: 4, name: 'Địa điểm test Google Form', slug: 'dia-diem-test-google-form', status: 'approved' },
          { id: 10, name: 'ádasdasd', slug: 'adasdasd', status: 'approved' }
        ]
      };
    }
    if (url.includes('/place_comments')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-range': '*/0' }),
        json: async () => []
      };
    }
    throw new Error(`Unexpected URL in mock: ${url}`);
  };

  const publicResult = await runProductionAudit({
    env: {
      SUPABASE_URL: 'https://mock.supabase.co',
      SUPABASE_ANON_KEY: 'mock_anon_key',
      SUPABASE_SERVICE_ROLE_KEY: '',
      ADMIN_ACCESS_TOKEN: ''
    },
    fetchFn: mockPublicFetch,
    writeDocs: false
  });

  assert.strictEqual(publicResult.authMode, 'public_anon', 'authMode phải là public_anon');
  assert.strictEqual(publicResult.scope, 'public_only', 'scope phải là public_only');
  assert.ok(publicResult.baselineStatus.includes('BASELINE PARTIAL'), 'Phải đánh dấu BASELINE PARTIAL');
  assert.strictEqual(publicResult.placesSummary.total, null, 'places total không được là số 2 mà phải là null (chưa đọc toàn diện)');
  assert.strictEqual(publicResult.placesSummary.observedPublicTotal, 2, 'observedPublicTotal phải là 2');
  assert.strictEqual(publicResult.placesSummary.byStatus.draft, null, 'draft places phải là null (không quan sát được)');
  assert.strictEqual(publicResult.placesSummary.byStatus.archived, null, 'archived places phải là null');
  assert.strictEqual(publicResult.commentsSummary.total, null, 'comments total phải là null');
  assert.strictEqual(publicResult.commentsSummary.byStatus.pending, null, 'pending comments phải là null');
  assert.strictEqual(publicResult.reportsSummary.total, null, 'reports total phải là null');
  assert.strictEqual(publicResult.reportsSummary.verified, false, 'reports verified phải là false');
  assert.strictEqual(publicResult.reportsSummary.scope, 'unknown', 'reports scope phải là unknown');
  console.log('  ✓ Đạt: Chế độ public_anon trả đúng null cho draft, archived, reports và pending comments.\n');
  passed++;

  // -------------------------------------------------------------------------
  // Test 3: Admin Mode - Phân trang qua 3 endpoint Vercel
  // -------------------------------------------------------------------------
  console.log('[Test 3] Admin Token Mode: Gọi đủ 3 API Vercel, Bearer token và xử lý phân trang');
  const calledUrls = [];
  const authHeaders = [];

  const mockAdminFetch = async (url, opts) => {
    calledUrls.push(url);
    authHeaders.push(opts?.headers?.Authorization || '');

    if (url.includes('/api/admin-places')) {
      if (url.includes('page=1')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            places: [{ id: 1, name: 'Ao Bà Om', slug: 'ao-ba-om', status: 'approved' }],
            pagination: { page: 1, limit: 1, total: 2, total_pages: 2 }
          })
        };
      }
      if (url.includes('page=2')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            places: [{ id: 2, name: 'Chùa Âng', slug: 'chua-ang', status: 'draft' }],
            pagination: { page: 2, limit: 1, total: 2, total_pages: 2 }
          })
        };
      }
    }

    if (url.includes('/api/admin-comments')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          comments: [{ id: 101, place_name: 'Ao Bà Om', is_hidden: false, status: 'approved' }],
          pagination: { page: 1, limit: 50, total: 1, total_pages: 1 }
        })
      };
    }

    if (url.includes('/api/admin-reports')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          reports: [{ id: 'rep_1', place_name: 'Ao Bà Om', status: 'pending', issue_type: 'wrong_hours' }],
          pagination: { page: 1, limit: 50, total: 1, total_pages: 1 }
        })
      };
    }

    throw new Error(`Unexpected URL in admin mock: ${url}`);
  };

  const adminResult = await runProductionAudit({
    env: {
      SUPABASE_URL: 'https://mock.supabase.co',
      SUPABASE_ANON_KEY: 'mock_anon_key',
      SUPABASE_SERVICE_ROLE_KEY: '',
      ADMIN_ACCESS_TOKEN: 'test_admin_jwt_secret_token',
      VERCEL_URL: 'https://mock-vivu.vercel.app'
    },
    fetchFn: mockAdminFetch,
    writeDocs: false
  });

  assert.strictEqual(adminResult.authMode, 'admin_token', 'authMode phải là admin_token');
  assert.strictEqual(adminResult.scope, 'admin_visible', 'scope phải là admin_visible');
  assert.ok(adminResult.baselineStatus.includes('BASELINE COMPLETE'), 'Phải là BASELINE COMPLETE');
  assert.strictEqual(adminResult.placesSummary.total, 2, 'places total phải là 2 (qua 2 trang phân trang)');
  assert.strictEqual(adminResult.placesSummary.byStatus.approved, 1, '1 approved place');
  assert.strictEqual(adminResult.placesSummary.byStatus.draft, 1, '1 draft place');
  assert.strictEqual(adminResult.commentsSummary.total, 1, '1 comment total');
  assert.strictEqual(adminResult.reportsSummary.total, 1, '1 report total');
  assert.strictEqual(adminResult.reportsSummary.byStatus.pending, 1, '1 pending report');

  // Kiểm tra Authorization header được gửi đúng
  for (const h of authHeaders) {
    assert.strictEqual(h, 'Bearer test_admin_jwt_secret_token', 'Header phải chứa đúng Bearer token');
  }
  // Xác nhận trang 1 và trang 2 của admin-places đều được gọi
  assert.ok(calledUrls.some(u => u.includes('/api/admin-places') && u.includes('page=1')), 'Phải gọi page 1');
  assert.ok(calledUrls.some(u => u.includes('/api/admin-places') && u.includes('page=2')), 'Phải gọi page 2');
  console.log('  ✓ Đạt: Admin mode gửi Bearer token, phân trang 2 trang thành công và đọc đủ 3 endpoint.\n');
  passed++;

  // -------------------------------------------------------------------------
  // Test 4: Credential & PII Protection
  // -------------------------------------------------------------------------
  console.log('[Test 4] Secret & PII Protection: Không rò rỉ token hoặc PII trong output');
  const mockPlaceWithPii = {
    id: 99,
    name: 'Quán Ăn Thử Nghiệm',
    slug: 'quan-an-thu-nghiem',
    contributor: 'Nguyen Van A - 0912345678 - a@gmail.com',
    status: 'approved'
  };

  const mdReport = generateMarkdownReport({
    authMode: 'public_anon',
    timestamp: '2026-09-21T10:00:00.000Z',
    scope: 'public_only',
    baselineStatus: 'BASELINE PARTIAL',
    placesSummary: {
      total: null,
      observedPublicTotal: 1,
      scope: 'public_only',
      byStatus: { approved: 1, draft: null, hidden: null, archived: null },
      evaluationNote: 'Ghi chú',
      missingFields: { images: 0, address: 0, coordinates: 0, hours: 0, price: 0, contact: 0, mapLink: 0 },
      duplicateSlugs: [],
      records: [{
        id: 99,
        name: mockPlaceWithPii.name,
        slug: mockPlaceWithPii.slug,
        status: mockPlaceWithPii.status,
        classification: 'nghi dữ liệu test',
        recommendation: 'đề xuất archive',
        reason: 'Chứa từ khóa thử nghiệm'
      }]
    },
    commentsSummary: {
      total: null,
      observedPublicTotal: 0,
      scope: 'public_only',
      byStatus: { approved: 0, pending: null, hidden: null, rejected: null },
      evaluationNote: 'Bình luận trống'
    },
    reportsSummary: {
      total: null,
      scope: 'unknown',
      byStatus: { pending: null, reviewed: null, resolved: null, dismissed: null },
      evaluationNote: 'UNKNOWN'
    },
    fallbackComparison: {
      fallbackTotal: 8,
      sitemapTotal: 8,
      matchedInProduction: 0,
      missingInProduction: []
    }
  });

  // Xác nhận không có PII trong markdown
  assert.ok(!mdReport.includes('Nguyen Van A'), 'Báo cáo không được chứa tên người đóng góp');
  assert.ok(!mdReport.includes('0912345678'), 'Báo cáo không được chứa số điện thoại');
  assert.ok(!mdReport.includes('a@gmail.com'), 'Báo cáo không được chứa email');
  assert.ok(!mdReport.includes('test_admin_jwt_secret_token'), 'Báo cáo không được chứa token');
  console.log('  ✓ Đạt: Báo cáo đã khử sạch hoàn toàn PII và bí mật xác thực.\n');
  passed++;

  // -------------------------------------------------------------------------
  // Test 5: Error Resilience - Lỗi đọc không được biến thành số 0
  // -------------------------------------------------------------------------
  console.log('[Test 5] Error Handling: Lỗi đọc bảng không được biến thành số 0');
  const mockFailingFetch = async (url) => {
    if (url.includes('/places')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-range': '0-0/1' }),
        json: async () => [{ id: 1, name: 'Chùa Hang', slug: 'chua-hang', status: 'approved' }]
      };
    }
    if (url.includes('/place_comments')) {
      throw new Error('Database connection failed (500)');
    }
    if (url.includes('/place_reports')) {
      return {
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable'
      };
    }
    throw new Error(`Unexpected: ${url}`);
  };

  const failingResult = await runProductionAudit({
    env: {
      SUPABASE_URL: 'https://mock.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'mock_service_key',
      SUPABASE_ANON_KEY: 'mock_anon_key'
    },
    fetchFn: mockFailingFetch,
    writeDocs: false
  });

  assert.strictEqual(failingResult.commentsSummary.total, null, 'Khi comments bị lỗi, total phải là null, không được gán 0');
  assert.strictEqual(failingResult.commentsSummary.verified, false, 'verified phải là false khi gặp lỗi');
  assert.ok(failingResult.commentsSummary.error.includes('Database connection failed'), 'Phải lưu lại thông báo lỗi');

  assert.strictEqual(failingResult.reportsSummary.total, null, 'Khi reports bị lỗi 503, total phải là null, không được gán 0');
  assert.strictEqual(failingResult.reportsSummary.verified, false, 'verified phải là false khi gặp lỗi 503');
  console.log('  ✓ Đạt: Lỗi đọc CSDL/mạng giữ nguyên total = null và verified = false, không bị nuốt thành số 0.\n');
  passed++;

  // -------------------------------------------------------------------------
  // Test 6: Báo cáo Markdown phản ánh đúng fixture và không chứa dữ liệu viết cứng
  // -------------------------------------------------------------------------
  console.log('[Test 6] Dynamic Markdown Report: Khớp fixture độc lập và không chứa số liệu viết cứng');

  const customFixture = {
    authMode: 'public_anon',
    timestamp: '2026-09-21T15:30:00.000Z',
    scope: 'public_only',
    baselineStatus: 'BASELINE PARTIAL (PUBLIC-ONLY SCOPE)',
    placesSummary: {
      total: null,
      observedPublicTotal: 2,
      scope: 'public_only',
      verified: false,
      byStatus: { approved: 2, draft: null, hidden: null, archived: null },
      evaluationNote: 'Có 1 bản ghi nghi dữ liệu thử nghiệm cần xem xét xử lý.',
      missingFields: {
        images: 0,
        address: 1,
        coordinates: 1,
        hours: 1,
        price: 1,
        contact: 2,
        mapLink: 1
      },
      duplicateSlugs: [],
      records: [
        {
          id: 77,
          name: 'Quán Cơm Thử Nghiệm Mock',
          slug: 'quan-com-thu-nghiem-mock',
          status: 'approved',
          classification: 'nghi dữ liệu test',
          recommendation: 'đề xuất archive',
          reason: 'Chứa từ khóa/mẫu dữ liệu thử nghiệm: "thử nghiệm"',
          images: ['https://cdn.example.com/mock77.jpg'],
          image_link: null
        },
        {
          id: 88,
          name: 'Điểm Du Lịch Mock Hợp Lệ',
          slug: 'diem-du-lich-mock-hop-le',
          status: 'approved',
          classification: 'cần xác minh',
          recommendation: 'giữ lại & bổ sung',
          reason: 'Thiếu các trường: địa chỉ, GPS, giờ mở cửa',
          images: ['https://cdn.example.com/mock88.jpg'],
          image_link: null
        }
      ]
    },
    commentsSummary: {
      total: null,
      observedPublicTotal: 0,
      scope: 'public_only',
      verified: false,
      byStatus: { approved: 0, pending: null, hidden: null, rejected: null },
      evaluationNote: 'Quan sát công khai 0 bình luận approved. Các bình luận pending/hidden/rejected nội bộ là UNKNOWN.'
    },
    reportsSummary: {
      total: null,
      scope: 'unknown',
      verified: false,
      byStatus: { pending: null, reviewed: null, resolved: null, dismissed: null },
      evaluationNote: 'UNKNOWN: Bảng place_reports được bảo vệ RLS nghiêm ngặt (chỉ cấp cho service_role); không thể quan sát ở chế độ public_anon.'
    },
    fallbackComparison: {
      fallbackTotal: 5,
      sitemapTotal: 7,
      matchedApproved: 1,
      matchedAnyStatus: 1,
      matchedInProduction: 1,
      sitemapApprovedCount: 1,
      missingInProduction: [
        { name: 'Mock Chùa Khơ-me', slug: 'mock-chua-kho-me', category: 'Chùa' }
      ],
      slugVariations: [
        { fallback: 'mock-dac-san-tra-vinh', sitemap: 'mock-dac-san' }
      ],
      sitemapOnlyUnpaired: ['mock-sitemap-extra'],
      fallbackOnlyUnpaired: ['mock-fallback-extra']
    }
  };

  const md6 = generateMarkdownReport(customFixture);

  // 1. Xác minh Markdown phản ánh đúng fixture mới
  assert.ok(md6.includes('| **77** |'), 'Bảng địa điểm phải chứa ID 77');
  assert.ok(md6.includes('| **88** |'), 'Bảng địa điểm phải chứa ID 88');
  assert.ok(md6.includes('`quan-com-thu-nghiem-mock`'), 'Bảng địa điểm phải chứa slug 77');
  assert.ok(md6.includes('`diem-du-lich-mock-hop-le`'), 'Bảng địa điểm phải chứa slug 88');
  assert.ok(md6.includes('7 đường dẫn canonical `/place/{slug}`'), 'Phải phản ánh đúng 7 đường dẫn sitemap');
  assert.ok(md6.includes('Chứa **7** canonical URLs.'), 'Phải phản ánh 7 canonical URLs');
  assert.ok(md6.includes('Chứa **5** địa điểm mẫu dạng local snapshot'), 'Phải phản ánh 5 địa điểm fallback');
  assert.ok(md6.includes('Hiện **1/5** địa điểm tồn tại trên Supabase Production'), 'Phải phản ánh đúng 1/5 địa điểm');
  assert.ok(md6.includes('Fallback dùng `mock-dac-san-tra-vinh` ↔ Sitemap dùng `mock-dac-san`'), 'Phải sinh đúng cặp slug variation');
  assert.ok(md6.includes('`mock-sitemap-extra`'), 'Phải chứa sitemapOnlyUnpaired');
  assert.ok(md6.includes('`mock-fallback-extra`'), 'Phải chứa fallbackOnlyUnpaired');
  assert.ok(md6.includes('ID 77 (approved)'), 'Đề xuất archive phải chứa ID 77 (approved)');
  assert.ok(!md6.includes('ID 88'), 'ID 88 giữ lại không được nằm trong danh sách đề xuất archive');

  // 2. Xác minh Markdown TUYỆT ĐỐI KHÔNG chứa số liệu hoặc slug/ID viết cứng từ production hiện tại
  assert.ok(!md6.includes('| **4** |'), 'Không được chứa ID 4');
  assert.ok(!md6.includes('| **10** |'), 'Không được chứa ID 10');
  assert.ok(!md6.includes('ID 4'), 'Không được chứa chuỗi ID 4');
  assert.ok(!md6.includes('ID 10'), 'Không được chứa chuỗi ID 10');
  assert.ok(!md6.includes('dia-diem-test-google-form'), 'Không được chứa slug dia-diem-test-google-form');
  assert.ok(!md6.includes('adasdasd'), 'Không được chứa slug adasdasd');
  assert.ok(!md6.includes('12 đường dẫn'), 'Không được chứa chuỗi viết cứng "12 đường dẫn"');
  assert.ok(!md6.includes('12 canonical'), 'Không được chứa chuỗi viết cứng "12 canonical"');
  assert.ok(!md6.includes('0/12'), 'Không được chứa chuỗi viết cứng "0/12"');
  assert.ok(!md6.includes('Chứa **12**'), 'Không được chứa chuỗi viết cứng "Chứa **12**"');
  assert.ok(!md6.includes('bun-nuoc-leo-co-ba-tra-vinh'), 'Không được chứa slug fallback production');
  assert.ok(!md6.includes('dua-sap-cau-ke-ut-nhi'), 'Không được chứa slug fallback production');
  assert.ok(!md6.includes('den-tho-bac-ho-tra-vinh'), 'Không được chứa slug fallback production');
  assert.ok(!md6.includes('cu-lao-tan-qui'), 'Không được chứa slug fallback production');
  assert.ok(!md6.includes('nha-co-huynh-ky'), 'Không được chứa slug fallback production');
  assert.ok(!md6.includes('banh-tet-tra-cuon-hai-ly'), 'Không được chứa slug fallback production');
  assert.ok(!md6.includes('khu-du-lich-sinh-thai-huynh-kha'), 'Không được chứa slug sitemap production');

  console.log('  ✓ Đạt: Báo cáo Markdown phản ánh trung thực 100% fixture độc lập, không còn dấu vết số liệu/slug viết cứng.\n');
  passed++;

  // -------------------------------------------------------------------------
  // Test 7: Kiểm thử ngữ nghĩa báo cáo với fixture hỗn hợp (approved + draft + hidden)
  // -------------------------------------------------------------------------
  console.log('[Test 7] Semantic Reporting: Scope warning, completeness, fallback separation và status đề xuất archive');

  const placesMixedFixture = [
    {
      id: 10,
      name: 'Địa Điểm Test A',
      slug: 'dia-diem-test-a',
      status: 'approved',
      classification: 'nghi dữ liệu test',
      recommendation: 'đề xuất archive',
      reason: 'Chứa từ khóa test'
    },
    {
      id: 6,
      name: 'Địa Điểm Test B',
      slug: 'dia-diem-test-b',
      status: 'draft',
      classification: 'nghi dữ liệu test',
      recommendation: 'đề xuất archive',
      reason: 'Chứa từ khóa test'
    },
    {
      id: 4,
      name: 'Địa Điểm Test C',
      slug: 'dia-diem-test-c',
      status: 'approved',
      classification: 'nghi dữ liệu test',
      recommendation: 'đề xuất archive',
      reason: 'Chứa từ khóa test'
    },
    {
      id: 99,
      name: 'Địa Điểm Hợp Lệ D',
      slug: 'dia-diem-hop-le-d',
      status: 'draft',
      classification: 'cần xác minh',
      recommendation: 'giữ lại & bổ sung',
      reason: 'Bản nháp hợp lệ đang chờ duyệt'
    }
  ];

  const fallbackListFixture = [
    { name: 'Địa Điểm Test A', slug: 'dia-diem-test-a' },
    { name: 'Địa Điểm Test B', slug: 'dia-diem-test-b' },
    { name: 'Địa Điểm Chưa Có E', slug: 'dia-diem-chua-co-e' }
  ];

  const sitemapContentFixture = `
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://vivutravinh.vercel.app/place/dia-diem-test-a</loc></url>
      <url><loc>https://vivutravinh.vercel.app/place/dia-diem-test-b</loc></url>
    </urlset>
  `;

  // 1. Kiểm tra hàm computeFallbackComparison với dữ liệu hỗn hợp
  const fbMixedResult = computeFallbackComparison(fallbackListFixture, sitemapContentFixture, placesMixedFixture);
  assert.strictEqual(fbMixedResult.fallbackTotal, 3, 'Tổng fallback phải là 3');
  assert.strictEqual(fbMixedResult.matchedAnyStatus, 2, 'matchedAnyStatus phải là 2 (gồm cả approved dia-diem-test-a và draft dia-diem-test-b)');
  assert.strictEqual(fbMixedResult.matchedApproved, 1, 'matchedApproved phải là 1 (CHỈ tính dia-diem-test-a approved)');
  assert.strictEqual(fbMixedResult.matchedNonApproved, 1, 'matchedNonApproved phải là 1 (dia-diem-test-b draft)');
  assert.strictEqual(fbMixedResult.sitemapApprovedCount, 1, 'sitemapApprovedCount phải là 1 (chỉ dia-diem-test-a approved)');
  assert.strictEqual(fbMixedResult.sitemapNonApprovedSlugs.length, 1, 'Có 1 slug sitemap chưa approved');
  assert.strictEqual(fbMixedResult.sitemapNonApprovedSlugs[0].slug, 'dia-diem-test-b');
  assert.strictEqual(fbMixedResult.sitemapNonApprovedSlugs[0].status, 'draft');

  // 2. Kiểm tra ngữ nghĩa báo cáo ở chế độ admin_token
  const adminMixedReport = generateMarkdownReport({
    authMode: 'admin_token',
    timestamp: '2026-09-21T15:45:00.000Z',
    scope: 'admin_visible',
    baselineStatus: 'BASELINE COMPLETE (ADMIN_VISIBLE)',
    placesSummary: {
      total: 4,
      observedPublicTotal: null,
      scope: 'admin_visible',
      verified: true,
      byStatus: { approved: 2, draft: 2, hidden: 0, archived: 0 },
      evaluationNote: 'Có 3 bản ghi nghi dữ liệu thử nghiệm.',
      missingFields: { images: 0, address: 0, coordinates: 0, hours: 0, price: 0, contact: 0, mapLink: 0 },
      duplicateSlugs: [],
      records: placesMixedFixture
    },
    commentsSummary: {
      total: 3,
      observedPublicTotal: null,
      scope: 'admin_visible',
      verified: true,
      byStatus: { approved: 1, pending: 1, hidden: 1, rejected: 0 },
      evaluationNote: 'Tổng 3 bình luận.'
    },
    reportsSummary: {
      total: 1,
      scope: 'admin_visible',
      verified: true,
      byStatus: { pending: 1, reviewed: 0, resolved: 0, dismissed: 0 },
      evaluationNote: '1 báo sai.'
    },
    fallbackComparison: fbMixedResult
  });

  // Xác minh Section 2: Cảnh báo admin_token ghi rõ toàn bộ bản ghi qua API quản trị, không tuyên bố tất cả xuất hiện trên public UI
  assert.ok(adminMixedReport.includes('toàn bộ bản ghi quan sát được qua API Quản trị'), 'admin_token warning phải ghi toàn bộ bản ghi qua API Quản trị');
  assert.ok(adminMixedReport.includes('gồm mọi trạng thái'), 'Phải nêu rõ gồm mọi trạng thái');
  assert.ok(adminMixedReport.includes('Chỉ các bản ghi có trạng thái `approved` mới hiển thị trên giao diện người dùng công khai'), 'Phải làm rõ chỉ approved mới hiển thị công khai');
  assert.ok(!adminMixedReport.includes('Các bản ghi dưới đây hiện đang ở trạng thái `status = \'approved\'` trên Supabase Production và xuất hiện trên giao diện người dùng'), 'Không được tuyên bố mọi bản ghi đều là approved');

  // Xác minh Section 3: Completeness label đúng scope admin-visible
  assert.ok(adminMixedReport.includes('bản ghi production/admin-visible đã quan sát'), 'Completeness phải ghi "bản ghi production/admin-visible đã quan sát"');
  assert.ok(!adminMixedReport.includes('bản ghi công khai đã quan sát'), 'admin_token không được ghi "bản ghi công khai đã quan sát"');

  // Xác minh Section 4: Đối soát phân biệt matchedAnyStatus vs matchedApproved
  assert.ok(adminMixedReport.includes('matchedAnyStatus'), 'Báo cáo phải ghi rõ matchedAnyStatus');
  assert.ok(adminMixedReport.includes('matchedApproved'), 'Báo cáo phải ghi rõ matchedApproved');
  assert.ok(adminMixedReport.includes('**2/3** địa điểm'), 'matchedAnyStatus phải là 2/3');
  assert.ok(adminMixedReport.includes('**1/3** địa điểm'), 'matchedApproved phải là 1/3');
  assert.ok(!adminMixedReport.includes('Hiện **2/3** địa điểm tồn tại trên Supabase Production dưới trạng thái `approved`'), 'Cấm ghi 2/3 dưới trạng thái approved');
  assert.ok(adminMixedReport.includes('Cảnh báo SEO: 1 URL trong Sitemap tương ứng với địa điểm chưa approved trong CSDL: `dia-diem-test-b` (draft)'), 'Phải cảnh báo URL sitemap chưa approved');

  // Xác minh Section 5: Đề xuất archive giữ đúng status từng bản ghi
  assert.ok(adminMixedReport.includes('ID 10 (approved)'), 'Phải hiển thị ID 10 (approved)');
  assert.ok(adminMixedReport.includes('ID 6 (draft)'), 'Phải hiển thị ID 6 (draft)');
  assert.ok(adminMixedReport.includes('ID 4 (approved)'), 'Phải hiển thị ID 4 (approved)');
  assert.ok(!adminMixedReport.includes('từ `approved` sang `archived`'), 'Cấm ghi tất cả bản ghi test là "từ approved sang archived"');
  assert.ok(adminMixedReport.includes('ZERO MUTATION trong G9.0'), 'Phải nhấn mạnh ZERO MUTATION');

  // Xác minh Section 1: NOTE block cho admin_token xác nhận hoàn thành, không chứa hướng dẫn nâng cấp bằng token
  assert.ok(adminMixedReport.includes('ADMIN_VISIBLE) đã hoàn thành đầy đủ'), 'NOTE phải xác nhận ADMIN_VISIBLE hoàn thành đầy đủ');
  assert.ok(!adminMixedReport.includes('Để nâng cấp lên **BASELINE COMPLETE**, quản trị viên cần chạy lại script với biến môi trường `ADMIN_ACCESS_TOKEN`'), 'Không chứa hướng dẫn nâng cấp khi đã là admin_token');

  // 3. Kiểm tra ngữ nghĩa báo cáo ở chế độ public_anon
  const publicMixedReport = generateMarkdownReport({
    authMode: 'public_anon',
    timestamp: '2026-09-21T15:45:00.000Z',
    scope: 'public_only',
    baselineStatus: 'BASELINE PARTIAL (PUBLIC-ONLY SCOPE)',
    placesSummary: {
      total: null,
      observedPublicTotal: 2,
      scope: 'public_only',
      verified: false,
      byStatus: { approved: 2, draft: null, hidden: null, archived: null },
      evaluationNote: 'Quan sát 2 approved.',
      missingFields: { images: 0, address: 0, coordinates: 0, hours: 0, price: 0, contact: 0, mapLink: 0 },
      duplicateSlugs: [],
      records: [placesMixedFixture[0], placesMixedFixture[2]]
    },
    commentsSummary: {
      total: null,
      observedPublicTotal: 1,
      scope: 'public_only',
      verified: false,
      byStatus: { approved: 1, pending: null, hidden: null, rejected: null },
      evaluationNote: '1 approved comment.'
    },
    reportsSummary: {
      total: null,
      scope: 'unknown',
      verified: false,
      byStatus: { pending: null, reviewed: null, resolved: null, dismissed: null },
      evaluationNote: 'UNKNOWN'
    },
    fallbackComparison: {
      fallbackTotal: 3,
      sitemapTotal: 2,
      matchedApproved: 1,
      matchedAnyStatus: 1,
      matchedInProduction: 1
    }
  });

  assert.ok(publicMixedReport.includes('approved công khai'), 'public_anon warning phải ghi rõ approved công khai');
  assert.ok(publicMixedReport.includes('bản ghi công khai đã quan sát'), 'public_anon completeness phải ghi "bản ghi công khai đã quan sát"');
  assert.ok(publicMixedReport.includes('Hướng dẫn nâng cấp Baseline'), 'public_anon NOTE phải chứa hướng dẫn nâng cấp Baseline');

  console.log('  ✓ Đạt: Ngữ nghĩa báo cáo phân biệt chuẩn xác phạm vi quan sát, tách biệt matchedApproved vs matchedAnyStatus, hiển thị status từng ID đề xuất archive và cấu hình NOTE theo authMode.\n');
  passed++;

  console.log(`========================================`);
  console.log(`KẾT QUẢ KIỂM THỬ G9 AUDIT: ${passed}/7 TEST CASES PASS`);
  console.log(`========================================\n`);
}

runTests().catch(err => {
  console.error('FAIL test-g9-audit:', err);
  process.exit(1);
});
