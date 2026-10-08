// scripts/test-public-filter-four-cases.cjs
// Suite kiểm thử tự động chuyên biệt cho bộ lọc công khai (Public API Filter):
// Kiểm thử 4 trường hợp ghi chú và cờ ẩn:
// 1. Ghi chú null (admin_notes IS NULL)
// 2. Ghi chú rỗng (admin_notes = "")
// 3. Ghi chú bình thường (không chứa dấu tạm ẩn)
// 4. Nội dung bị ẩn (admin_notes chứa "[TẠM ẨN BỞI BQT]" hoặc metadata.is_hidden = true)
//
// Yêu cầu kiểm tra:
// - Kiểm tra cả dạng danh sách công khai (List Query): 3 trường hợp đầu PHẢI xuất hiện, trường hợp bị ẩn PHẢI bị loại bỏ.
// - Kiểm tra cả truy vấn theo ID (Single Query): 3 trường hợp đầu trả về HTTP 200, trường hợp bị ẩn trả về HTTP 404.
// - Kiểm tra cho các thực thể: Blog/Cẩm nang du lịch (articles - kèm metadata.is_hidden), Clubs, Community Events, Club Activities.
// - Dọn dẹp sạch sẽ 100% fixtures thử nghiệm sau khi hoàn tất.

const fs = require('fs');

if (fs.existsSync('.env.live.tmp')) {
  const env = fs.readFileSync('.env.live.tmp', 'utf8');
  env.split('\n').forEach(line => {
    const parts = line.trim().split('=');
    const k = parts[0];
    const v = parts.slice(1).join('=');
    if (k && v) process.env[k] = v.replace(/^["']|["']$/g, '');
  });
}

process.env.ADMIN_SECRET = 'dev-admin';
process.env.NODE_ENV = 'test';
process.env.VIVU_TEST = '1';

function createMockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader: (k, v) => { res.headers[k.toLowerCase()] = v; },
    getHeader: (k) => res.headers[k.toLowerCase()],
    end: (chunk) => {
      if (chunk) res.body = chunk;
    },
    getJson: () => {
      try {
        return JSON.parse(res.body);
      } catch (e) {
        return { raw: res.body };
      }
    },
    getStatusCode: () => res.statusCode
  };
  return res;
}

async function runTests() {
  console.log('========================================================================');
  console.log('KIỂM THỬ BỘ LỌC CÔNG KHAI: 4 TRƯỜNG HỢP (NULL, RỖNG, BÌNH THƯỜNG, TẠM ẨN)');
  console.log('========================================================================\n');

  const { supabaseRequest } = await import('../api/_admin-auth.js');
  const articlesModule = await import('../api/articles.js');
  const clubsModule = await import('../api/clubs.js');
  const eventsModule = await import('../api/community-events.js');
  const activitiesModule = await import('../api/club-activities.js');

  const articlesHandler = articlesModule.default;
  const clubsHandler = clubsModule.default;
  const eventsHandler = eventsModule.default;
  const activitiesHandler = activitiesModule.default;

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    details: []
  };

  function assert(title, condition, extra = '') {
    results.total++;
    if (condition) {
      results.passed++;
      console.log(`  ✓ PASS: ${title} ${extra}`);
      results.details.push({ title, status: 'PASS', extra });
    } else {
      results.failed++;
      console.error(`  ✗ FAIL: ${title} ${extra}`);
      results.details.push({ title, status: 'FAIL', extra });
    }
  }

  const batchTag = `test-filter-${Date.now()}`;
  console.log(`[Khởi tạo] Batch tag kiểm thử: ${batchTag}\n`);

  // Lấy 1 test author id và 1 test club id sẵn có trong hệ thống
  let testAuthorId = 'f4e5080a-7f96-4a63-ab2f-a9beb0dce1d2';
  let testClubId = `test-parent-club-${Date.now()}`;
  try {
    const profs = await supabaseRequest('profiles?select=id&limit=1');
    if (Array.isArray(profs) && profs[0]?.id) testAuthorId = profs[0].id;
    const clbs = await supabaseRequest('clubs?select=id&status=eq.approved&limit=1');
    if (Array.isArray(clbs) && clbs[0]?.id) testClubId = clbs[0].id;
  } catch (_) {}

  // Danh sách để cleanup
  const cleanupQueue = [];

  try {
    // ========================================================================
    // PHẦN 1: BÀI VIẾT CẨM NANG DU LỊCH (articles - Blog)
    // Kiểm tra 4 trường hợp ghi chú + cờ metadata.is_hidden
    // ========================================================================
    console.log('------------------------------------------------------------------------');
    console.log('PHẦN 1: BÀI CẨM NANG DU LỊCH (articles - Blog)');
    console.log('------------------------------------------------------------------------');

    const artNullId = `${batchTag}-art-null`;
    const artEmptyId = `${batchTag}-art-empty`;
    const artNormalId = `${batchTag}-art-normal`;
    const artHideNoteId = `${batchTag}-art-hidenote`;
    const artHideMetaId = `${batchTag}-art-hidemeta`;

    cleanupQueue.push(
      { table: 'articles', id: artNullId },
      { table: 'articles', id: artEmptyId },
      { table: 'articles', id: artNormalId },
      { table: 'articles', id: artHideNoteId },
      { table: 'articles', id: artHideMetaId }
    );

    await supabaseRequest('articles', {
      method: 'POST',
      body: JSON.stringify([
        {
          id: artNullId,
          slug: artNullId,
          title: '[Filter Test] Bài viết ghi chú NULL',
          category: 'van-hoa',
          content: '<p>Nội dung bài viết ghi chú null</p>',
          author_id: testAuthorId,
          status: 'approved',
          admin_notes: null,
          metadata: {}
        },
        {
          id: artEmptyId,
          slug: artEmptyId,
          title: '[Filter Test] Bài viết ghi chú RỖNG',
          category: 'van-hoa',
          content: '<p>Nội dung bài viết ghi chú rỗng</p>',
          author_id: testAuthorId,
          status: 'approved',
          admin_notes: '',
          metadata: {}
        },
        {
          id: artNormalId,
          slug: artNormalId,
          title: '[Filter Test] Bài viết ghi chú BÌNH THƯỜNG',
          category: 'van-hoa',
          content: '<p>Nội dung bài viết ghi chú bình thường</p>',
          author_id: testAuthorId,
          status: 'approved',
          admin_notes: 'Bài viết biên tập đạt tiêu chuẩn chất lượng cao',
          metadata: { views: 42 }
        },
        {
          id: artHideNoteId,
          slug: artHideNoteId,
          title: '[Filter Test] Bài viết BỊ TẠM ẨN BẰNG GHI CHÚ',
          category: 'van-hoa',
          content: '<p>Nội dung bài viết bị ẩn bằng ghi chú</p>',
          author_id: testAuthorId,
          status: 'approved',
          admin_notes: '[TẠM ẨN BỞI BQT - 2026-10-08] Cần kiểm tra lại bản quyền hình ảnh',
          metadata: {}
        },
        {
          id: artHideMetaId,
          slug: artHideMetaId,
          title: '[Filter Test] Bài viết BỊ TẠM ẨN BẰNG METADATA',
          category: 'van-hoa',
          content: '<p>Nội dung bài viết bị ẩn bằng metadata</p>',
          author_id: testAuthorId,
          status: 'approved',
          admin_notes: null,
          metadata: { is_hidden: true, hidden_at: new Date().toISOString() }
        }
      ])
    });

    // 1.1 Kiểm tra DANH SÁCH CÔNG KHAI (Public List Query)
    const artListRes = createMockResponse();
    await articlesHandler({ method: 'GET', url: '/api/articles?limit=50', headers: {} }, artListRes);
    const artListJson = artListRes.getJson();
    const artListArticles = Array.isArray(artListJson.articles) ? artListJson.articles : [];
    const artListIds = artListArticles.map(a => a.id);

    assert('1.1 [Articles - List] Ghi chú NULL xuất hiện trong danh sách công khai', artListIds.includes(artNullId));
    assert('1.2 [Articles - List] Ghi chú RỖNG xuất hiện trong danh sách công khai', artListIds.includes(artEmptyId));
    assert('1.3 [Articles - List] Ghi chú BÌNH THƯỜNG xuất hiện trong danh sách công khai', artListIds.includes(artNormalId));
    assert('1.4 [Articles - List] Bài TẠM ẨN bằng ghi chú KHÔNG xuất hiện trong danh sách', !artListIds.includes(artHideNoteId));
    assert('1.5 [Articles - List] Bài TẠM ẨN bằng metadata.is_hidden KHÔNG xuất hiện trong danh sách', !artListIds.includes(artHideMetaId));

    // 1.2 Kiểm tra TRUY VẤN THEO ID (Single Query by ID)
    // Case 1: Ghi chú NULL -> Trả về 200
    const artNullRes = createMockResponse();
    await articlesHandler({ method: 'GET', url: `/api/articles?id=${artNullId}`, headers: {} }, artNullRes);
    const artNullJson = artNullRes.getJson();
    assert('1.6 [Articles - Single ID] Ghi chú NULL truy vấn theo ID trả về HTTP 200',
      artNullRes.getStatusCode() === 200 && artNullJson.article && artNullJson.article.id === artNullId);

    // Case 2: Ghi chú RỖNG -> Trả về 200
    const artEmptyRes = createMockResponse();
    await articlesHandler({ method: 'GET', url: `/api/articles?id=${artEmptyId}`, headers: {} }, artEmptyRes);
    const artEmptyJson = artEmptyRes.getJson();
    assert('1.7 [Articles - Single ID] Ghi chú RỖNG truy vấn theo ID trả về HTTP 200',
      artEmptyRes.getStatusCode() === 200 && artEmptyJson.article && artEmptyJson.article.id === artEmptyId);

    // Case 3: Ghi chú BÌNH THƯỜNG -> Trả về 200 & không lộ admin_notes cho khách
    const artNormalRes = createMockResponse();
    await articlesHandler({ method: 'GET', url: `/api/articles?id=${artNormalId}`, headers: {} }, artNormalRes);
    const artNormalJson = artNormalRes.getJson();
    assert('1.8 [Articles - Single ID] Ghi chú BÌNH THƯỜNG truy vấn theo ID trả về HTTP 200',
      artNormalRes.getStatusCode() === 200 && artNormalJson.article && artNormalJson.article.id === artNormalId);
    assert('1.9 [Articles - Bảo mật] Khách vãng lai không nhận được admin_notes',
      artNormalJson.article && typeof artNormalJson.article.admin_notes === 'undefined');

    // Case 4a: Bị tạm ẩn bằng ghi chú -> Trả về 404 NOT_FOUND
    const artHideNoteRes = createMockResponse();
    await articlesHandler({ method: 'GET', url: `/api/articles?id=${artHideNoteId}`, headers: {} }, artHideNoteRes);
    assert('1.10 [Articles - Single ID] Bài TẠM ẨN bằng ghi chú truy vấn theo ID trả về HTTP 404',
      artHideNoteRes.getStatusCode() === 404);

    // Case 4b: Bị tạm ẩn bằng metadata.is_hidden -> Trả về 404 NOT_FOUND
    const artHideMetaRes = createMockResponse();
    await articlesHandler({ method: 'GET', url: `/api/articles?id=${artHideMetaId}`, headers: {} }, artHideMetaRes);
    assert('1.11 [Articles - Single ID] Bài TẠM ẨN bằng metadata.is_hidden truy vấn theo ID trả về HTTP 404',
      artHideMetaRes.getStatusCode() === 404);

    // Case Slug check cho cả 2 loại: Normal slug trả về 200, Hide slug trả về 404
    const artSlugNormRes = createMockResponse();
    await articlesHandler({ method: 'GET', url: `/api/articles?slug=${artNormalId}`, headers: {} }, artSlugNormRes);
    assert('1.12 [Articles - Single Slug] Truy vấn theo Slug bài bình thường trả về HTTP 200',
      artSlugNormRes.getStatusCode() === 200 && artSlugNormRes.getJson().article?.id === artNormalId);

    const artSlugHideRes = createMockResponse();
    await articlesHandler({ method: 'GET', url: `/api/articles?slug=${artHideNoteId}`, headers: {} }, artSlugHideRes);
    assert('1.13 [Articles - Single Slug] Truy vấn theo Slug bài tạm ẩn trả về HTTP 404',
      artSlugHideRes.getStatusCode() === 404);

    // ========================================================================
    // PHẦN 2: CÂU LẠC BỘ (clubs)
    // Kiểm tra 4 trường hợp ghi chú cho danh sách và ID
    // ========================================================================
    console.log('\n------------------------------------------------------------------------');
    console.log('PHẦN 2: CÂU LẠC BỘ (clubs)');
    console.log('------------------------------------------------------------------------');

    const clubNullId = `${batchTag}-club-null`;
    const clubEmptyId = `${batchTag}-club-empty`;
    const clubNormalId = `${batchTag}-club-normal`;
    const clubHideId = `${batchTag}-club-hide`;

    cleanupQueue.push(
      { table: 'clubs', id: clubNullId },
      { table: 'clubs', id: clubEmptyId },
      { table: 'clubs', id: clubNormalId },
      { table: 'clubs', id: clubHideId }
    );

    await supabaseRequest('clubs', {
      method: 'POST',
      body: JSON.stringify([
        {
          id: clubNullId,
          slug: clubNullId,
          name: '[Filter Test] CLB ghi chú NULL',
          category: 'the-thao',
          description: 'Mô tả CLB ghi chú null',
          leader_id: testAuthorId,
          status: 'approved',
          admin_notes: null
        },
        {
          id: clubEmptyId,
          slug: clubEmptyId,
          name: '[Filter Test] CLB ghi chú RỖNG',
          category: 'the-thao',
          description: 'Mô tả CLB ghi chú rỗng',
          leader_id: testAuthorId,
          status: 'approved',
          admin_notes: ''
        },
        {
          id: clubNormalId,
          slug: clubNormalId,
          name: '[Filter Test] CLB ghi chú BÌNH THƯỜNG',
          category: 'the-thao',
          description: 'Mô tả CLB ghi chú bình thường',
          leader_id: testAuthorId,
          status: 'approved',
          admin_notes: 'CLB đáp ứng đầy đủ điều kiện hoạt động cộng đồng'
        },
        {
          id: clubHideId,
          slug: clubHideId,
          name: '[Filter Test] CLB BỊ TẠM ẨN',
          category: 'the-thao',
          description: 'Mô tả CLB bị ẩn',
          leader_id: testAuthorId,
          status: 'approved',
          admin_notes: '[TẠM ẨN BỞI BQT - 2026-10-08] Tạm ngừng hoạt động để xác minh danh tính'
        }
      ])
    });

    // 2.1 Kiểm tra DANH SÁCH CÔNG KHAI CLB
    const clubListRes = createMockResponse();
    await clubsHandler({ method: 'GET', url: '/api/clubs?limit=50', headers: {} }, clubListRes);
    const clubListJson = clubListRes.getJson();
    const clubListItems = Array.isArray(clubListJson.clubs) ? clubListJson.clubs : [];
    const clubListIds = clubListItems.map(c => c.id);

    assert('2.1 [Clubs - List] Ghi chú NULL xuất hiện trong danh sách CLB', clubListIds.includes(clubNullId));
    assert('2.2 [Clubs - List] Ghi chú RỖNG xuất hiện trong danh sách CLB', clubListIds.includes(clubEmptyId));
    assert('2.3 [Clubs - List] Ghi chú BÌNH THƯỜNG xuất hiện trong danh sách CLB', clubListIds.includes(clubNormalId));
    assert('2.4 [Clubs - List] CLB TẠM ẨN KHÔNG xuất hiện trong danh sách CLB', !clubListIds.includes(clubHideId));

    // 2.2 Kiểm tra TRUY VẤN THEO ID CLB
    const clubNullRes = createMockResponse();
    await clubsHandler({ method: 'GET', url: `/api/clubs?id=${clubNullId}`, headers: {} }, clubNullRes);
    assert('2.5 [Clubs - Single ID] CLB ghi chú NULL truy vấn theo ID trả về HTTP 200',
      clubNullRes.getStatusCode() === 200 && clubNullRes.getJson().club?.id === clubNullId);

    const clubEmptyRes = createMockResponse();
    await clubsHandler({ method: 'GET', url: `/api/clubs?id=${clubEmptyId}`, headers: {} }, clubEmptyRes);
    const clubEmptyJson = clubEmptyRes.getJson();
    assert('2.6 [Clubs - Single ID] CLB ghi chú RỖNG truy vấn theo ID trả về HTTP 200',
      clubEmptyRes.getStatusCode() === 200 && clubEmptyJson?.club?.id === clubEmptyId);

    const clubNormalRes = createMockResponse();
    await clubsHandler({ method: 'GET', url: `/api/clubs?id=${clubNormalId}`, headers: {} }, clubNormalRes);
    assert('2.7 [Clubs - Single ID] CLB ghi chú BÌNH THƯỜNG truy vấn theo ID trả về HTTP 200',
      clubNormalRes.getStatusCode() === 200 && clubNormalRes.getJson().club?.id === clubNormalId);

    const clubHideRes = createMockResponse();
    await clubsHandler({ method: 'GET', url: `/api/clubs?id=${clubHideId}`, headers: {} }, clubHideRes);
    assert('2.8 [Clubs - Single ID] CLB TẠM ẨN truy vấn theo ID trả về HTTP 404',
      clubHideRes.getStatusCode() === 404);

    // ========================================================================
    // PHẦN 3: SỰ KIỆN CỘNG ĐỒNG (community_events)
    // Kiểm tra 4 trường hợp ghi chú cho danh sách và ID
    // ========================================================================
    console.log('\n------------------------------------------------------------------------');
    console.log('PHẦN 3: SỰ KIỆN CỘNG ĐỒNG (community_events)');
    console.log('------------------------------------------------------------------------');

    const eventNullId = `${batchTag}-event-null`;
    const eventEmptyId = `${batchTag}-event-empty`;
    const eventNormalId = `${batchTag}-event-normal`;
    const eventHideId = `${batchTag}-event-hide`;

    cleanupQueue.push(
      { table: 'community_events', id: eventNullId },
      { table: 'community_events', id: eventEmptyId },
      { table: 'community_events', id: eventNormalId },
      { table: 'community_events', id: eventHideId }
    );

    await supabaseRequest('community_events', {
      method: 'POST',
      body: JSON.stringify([
        {
          id: eventNullId,
          title: '[Filter Test] Sự kiện ghi chú NULL',
          organizer: 'Ban Quản Trị Du Lịch Trà Vinh',
          category: 'hoi-thao',
          time_schedule: '08:00 - 17:00 ngày 15/10/2026',
          location: 'Trà Vinh',
          created_by: testAuthorId,
          status: 'approved',
          admin_notes: null
        },
        {
          id: eventEmptyId,
          title: '[Filter Test] Sự kiện ghi chú RỖNG',
          organizer: 'Ban Quản Trị Du Lịch Trà Vinh',
          category: 'hoi-thao',
          time_schedule: '08:00 - 17:00 ngày 15/10/2026',
          location: 'Trà Vinh',
          created_by: testAuthorId,
          status: 'approved',
          admin_notes: ''
        },
        {
          id: eventNormalId,
          title: '[Filter Test] Sự kiện ghi chú BÌNH THƯỜNG',
          organizer: 'Ban Quản Trị Du Lịch Trà Vinh',
          category: 'hoi-thao',
          time_schedule: '08:00 - 17:00 ngày 15/10/2026',
          location: 'Trà Vinh',
          created_by: testAuthorId,
          status: 'approved',
          admin_notes: 'Sự kiện văn hóa được thông qua kế hoạch tổ chức'
        },
        {
          id: eventHideId,
          title: '[Filter Test] Sự kiện BỊ TẠM ẨN',
          organizer: 'Ban Quản Trị Du Lịch Trà Vinh',
          category: 'hoi-thao',
          time_schedule: '08:00 - 17:00 ngày 15/10/2026',
          location: 'Trà Vinh',
          created_by: testAuthorId,
          status: 'approved',
          admin_notes: '[TẠM ẨN BỞI BQT - 2026-10-08] Hoãn ngày tổ chức do thời tiết'
        }
      ])
    });

    // 3.1 Kiểm tra DANH SÁCH CÔNG KHAI SỰ KIỆN
    const evtListRes = createMockResponse();
    await eventsHandler({ method: 'GET', url: '/api/community-events?limit=50', headers: {} }, evtListRes);
    const evtListJson = evtListRes.getJson();
    const evtListItems = Array.isArray(evtListJson.events) ? evtListJson.events : [];
    const evtListIds = evtListItems.map(e => e.id);

    assert('3.1 [Events - List] Ghi chú NULL xuất hiện trong danh sách sự kiện', evtListIds.includes(eventNullId));
    assert('3.2 [Events - List] Ghi chú RỖNG xuất hiện trong danh sách sự kiện', evtListIds.includes(eventEmptyId));
    assert('3.3 [Events - List] Ghi chú BÌNH THƯỜNG xuất hiện trong danh sách sự kiện', evtListIds.includes(eventNormalId));
    assert('3.4 [Events - List] Sự kiện TẠM ẨN KHÔNG xuất hiện trong danh sách sự kiện', !evtListIds.includes(eventHideId));

    // 3.2 Kiểm tra TRUY VẤN THEO ID SỰ KIỆN
    const evtNullRes = createMockResponse();
    await eventsHandler({ method: 'GET', url: `/api/community-events?id=${eventNullId}`, headers: {} }, evtNullRes);
    assert('3.5 [Events - Single ID] Sự kiện ghi chú NULL truy vấn theo ID trả về HTTP 200',
      evtNullRes.getStatusCode() === 200 && evtNullRes.getJson().event?.id === eventNullId);

    const evtEmptyRes = createMockResponse();
    await eventsHandler({ method: 'GET', url: `/api/community-events?id=${eventEmptyId}`, headers: {} }, evtEmptyRes);
    assert('3.6 [Events - Single ID] Sự kiện ghi chú RỖNG truy vấn theo ID trả về HTTP 200',
      evtEmptyRes.getStatusCode() === 200 && evtEmptyRes.getJson().event?.id === eventEmptyId);

    const evtNormalRes = createMockResponse();
    await eventsHandler({ method: 'GET', url: `/api/community-events?id=${eventNormalId}`, headers: {} }, evtNormalRes);
    assert('3.7 [Events - Single ID] Sự kiện ghi chú BÌNH THƯỜNG truy vấn theo ID trả về HTTP 200',
      evtNormalRes.getStatusCode() === 200 && evtNormalRes.getJson().event?.id === eventNormalId);

    const evtHideRes = createMockResponse();
    await eventsHandler({ method: 'GET', url: `/api/community-events?id=${eventHideId}`, headers: {} }, evtHideRes);
    assert('3.8 [Events - Single ID] Sự kiện TẠM ẨN truy vấn theo ID trả về HTTP 404',
      evtHideRes.getStatusCode() === 404);

    // ========================================================================
    // PHẦN 4: LỊCH SINH HOẠT CLB (club_activities)
    // Kiểm tra 4 trường hợp ghi chú cho danh sách và ID
    // ========================================================================
    console.log('\n------------------------------------------------------------------------');
    console.log('PHẦN 4: LỊCH SINH HOẠT CLB (club_activities)');
    console.log('------------------------------------------------------------------------');

    const actNullId = `${batchTag}-act-null`;
    const actEmptyId = `${batchTag}-act-empty`;
    const actNormalId = `${batchTag}-act-normal`;
    const actHideId = `${batchTag}-act-hide`;

    cleanupQueue.push(
      { table: 'club_activities', id: actNullId },
      { table: 'club_activities', id: actEmptyId },
      { table: 'club_activities', id: actNormalId },
      { table: 'club_activities', id: actHideId }
    );

    await supabaseRequest('club_activities', {
      method: 'POST',
      body: JSON.stringify([
        {
          id: actNullId,
          club_id: testClubId,
          club_name: 'CLB Nhiếp Ảnh Trà Vinh',
          title: '[Filter Test] Lịch sinh hoạt ghi chú NULL',
          time_schedule: '05:30 - 08:30 ngày 12/10/2026',
          location: 'Ao Bà Om, Trà Vinh',
          description: 'Lịch sinh hoạt thường kỳ',
          creator_id: testAuthorId,
          status: 'approved',
          admin_notes: null
        },
        {
          id: actEmptyId,
          club_id: testClubId,
          club_name: 'CLB Nhiếp Ảnh Trà Vinh',
          title: '[Filter Test] Lịch sinh hoạt ghi chú RỖNG',
          time_schedule: '05:30 - 08:30 ngày 12/10/2026',
          location: 'Ao Bà Om, Trà Vinh',
          description: 'Lịch sinh hoạt thường kỳ',
          creator_id: testAuthorId,
          status: 'approved',
          admin_notes: ''
        },
        {
          id: actNormalId,
          club_id: testClubId,
          club_name: 'CLB Nhiếp Ảnh Trà Vinh',
          title: '[Filter Test] Lịch sinh hoạt ghi chú BÌNH THƯỜNG',
          time_schedule: '05:30 - 08:30 ngày 12/10/2026',
          location: 'Ao Bà Om, Trà Vinh',
          description: 'Lịch sinh hoạt thường kỳ',
          creator_id: testAuthorId,
          status: 'approved',
          admin_notes: 'Lịch sinh hoạt thường niên định kỳ hàng tuần'
        },
        {
          id: actHideId,
          club_id: testClubId,
          club_name: 'CLB Nhiếp Ảnh Trà Vinh',
          title: '[Filter Test] Lịch sinh hoạt BỊ TẠM ẨN',
          time_schedule: '05:30 - 08:30 ngày 12/10/2026',
          location: 'Ao Bà Om, Trà Vinh',
          description: 'Lịch sinh hoạt thường kỳ',
          creator_id: testAuthorId,
          status: 'approved',
          admin_notes: '[TẠM ẨN BỞI BQT - 2026-10-08] Tạm hoãn phòng họp trùng lịch'
        }
      ])
    });

    // 4.1 Kiểm tra DANH SÁCH CÔNG KHAI LỊCH SINH HOẠT
    const actListRes = createMockResponse();
    await activitiesHandler({ method: 'GET', url: '/api/club-activities?limit=50', headers: {} }, actListRes);
    const actListJson = actListRes.getJson();
    const actListItems = Array.isArray(actListJson.activities) ? actListJson.activities : [];
    const actListIds = actListItems.map(a => a.id);

    assert('4.1 [Activities - List] Ghi chú NULL xuất hiện trong danh sách sinh hoạt', actListIds.includes(actNullId));
    assert('4.2 [Activities - List] Ghi chú RỖNG xuất hiện trong danh sách sinh hoạt', actListIds.includes(actEmptyId));
    assert('4.3 [Activities - List] Ghi chú BÌNH THƯỜNG xuất hiện trong danh sách sinh hoạt', actListIds.includes(actNormalId));
    assert('4.4 [Activities - List] Lịch sinh hoạt TẠM ẨN KHÔNG xuất hiện trong danh sách', !actListIds.includes(actHideId));

    // 4.2 Kiểm tra TRUY VẤN THEO ID LỊCH SINH HOẠT
    const actNullRes = createMockResponse();
    await activitiesHandler({ method: 'GET', url: `/api/club-activities?id=${actNullId}`, headers: {} }, actNullRes);
    assert('4.5 [Activities - Single ID] Lịch sinh hoạt ghi chú NULL truy vấn theo ID trả về HTTP 200',
      actNullRes.getStatusCode() === 200 && actNullRes.getJson().activity?.id === actNullId);

    const actEmptyRes = createMockResponse();
    await activitiesHandler({ method: 'GET', url: `/api/club-activities?id=${actEmptyId}`, headers: {} }, actEmptyRes);
    assert('4.6 [Activities - Single ID] Lịch sinh hoạt ghi chú RỖNG truy vấn theo ID trả về HTTP 200',
      actEmptyRes.getStatusCode() === 200 && actEmptyRes.getJson().activity?.id === actEmptyId);

    const actNormalRes = createMockResponse();
    await activitiesHandler({ method: 'GET', url: `/api/club-activities?id=${actNormalId}`, headers: {} }, actNormalRes);
    assert('4.7 [Activities - Single ID] Lịch sinh hoạt ghi chú BÌNH THƯỜNG truy vấn theo ID trả về HTTP 200',
      actNormalRes.getStatusCode() === 200 && actNormalRes.getJson().activity?.id === actNormalId);

    const actHideRes = createMockResponse();
    await activitiesHandler({ method: 'GET', url: `/api/club-activities?id=${actHideId}`, headers: {} }, actHideRes);
    assert('4.8 [Activities - Single ID] Lịch sinh hoạt TẠM ẨN truy vấn theo ID trả về HTTP 404',
      actHideRes.getStatusCode() === 404);

  } finally {
    // ========================================================================
    // PHẦN 5: DỌN DẸP AN TOÀN FIXTURES THỬ NGHIỆM
    // ========================================================================
    console.log('\n------------------------------------------------------------------------');
    console.log('DỌN DẸP DỮ LIỆU THỬ NGHIỆM');
    console.log('------------------------------------------------------------------------');
    for (const item of cleanupQueue) {
      try {
        await supabaseRequest(`${item.table}?id=eq.${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      } catch (delErr) {
        // bỏ qua lỗi nếu đã xóa
      }
    }
    console.log(`  ✓ Đã xóa sạch ${cleanupQueue.length} bản ghi test fixtures.`);
  }

  console.log('\n========================================================================');
  console.log(`KẾT QUẢ KIỂM THỬ: ${results.passed}/${results.total} PASSED (${results.failed} FAILED)`);
  console.log('========================================================================\n');

  if (results.failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('[FATAL ERROR]:', err);
  process.exit(1);
});
