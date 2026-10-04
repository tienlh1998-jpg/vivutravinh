/**
 * scripts/test-upgrade-and-rollback.cjs
 *
 * BỘ KIỂM THỬ NÂNG CẤP VÀ KHÔI PHỤC (UPGRADE & ROLLBACK LIFECYCLE)
 *
 * Mục đích kiểm chứng thực tế trên PostgreSQL 18.4 thật:
 * 1. Khởi tạo CSDL với phiên bản cũ trước G15:
 *    - Cài đặt RPC G14 (admin_moderate_entity_atomic với 10 tham số).
 *    - Cài đặt RPC G8 (admin_update_place_atomic với 7 tham số).
 *    - Bảng places chưa có cột user_id.
 * 2. Thực thi Nâng cấp G15:
 *    - Áp dụng supabase/g15_contribution_points_and_badges.sql.
 *    - Kiểm tra loại bỏ triệt để hàm 10 tham số cũ để tránh Overload gây tranh chấp / gọi nhầm.
 * 3. Kiểm tra Tính Tương Thích Ứng Dụng Cũ (Transitional Window: SQL đã chạy, Web chưa deploy):
 *    - Gọi admin_moderate_entity_atomic CHỈ VỚI 10 THAM SỐ (như web cũ).
 *    - Xác nhận: Vẫn thực thi thành công, KHÔNG bỏ qua cộng điểm (+10 điểm), cập nhật đầy đủ bảng điểm & huy hiệu!
 * 4. Kiểm tra Ứng dụng Mới (11 tham số):
 *    - Gọi với 11 tham số (p_is_special = true) -> Cộng đúng 10 + 10 = 20 điểm.
 * 5. Kiểm tra Khôi phục (Rollback):
 *    - Chạy backups/backup_rpc_before_g15.sql.
 *    - Xác nhận RPC được hạ cấp an toàn về 10 tham số (G14) và G8.
 * 6. Kiểm tra Nâng cấp lại (Re-upgrade):
 *    - Chạy lại G15 migration -> Xác nhận tính lũy thừa (Idempotency).
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const PROJECT_DIR = path.resolve(__dirname, '..');
const G15_SQL_FILE = path.join(PROJECT_DIR, 'supabase', 'g15_contribution_points_and_badges.sql');
const BACKUP_SQL_FILE = path.join(PROJECT_DIR, 'backups', 'backup_rpc_before_g15.sql');
const G14_SQL_FILE = path.join(PROJECT_DIR, 'supabase', 'g14_admin_moderate_entity_atomic.sql');
const G8_SQL_FILE = path.join(PROJECT_DIR, 'supabase', 'g8_admin.sql');

const PRODUCTION_IDENTIFIERS = [
  'foyraoimhksfvlxndwxr',
  'vivutravinh.id.vn',
  'vivutravinh-production'
];

let passed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✓ [PASS] ${message}`);
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

function guardAgainstProduction(connStr) {
  if (!connStr) return;
  for (const id of PRODUCTION_IDENTIFIERS) {
    if (connStr.toLowerCase().includes(id.toLowerCase())) {
      console.error(`\n🚨 BẢO MẬT KHẨN CẤP: Chặn kết nối tới CSDL Production ("${id}")!`);
      process.exit(1);
    }
  }
}

async function runUpgradeAndRollbackSuite() {
  console.log('================================================================================');
  console.log(' BỘ KIỂM THỬ CHU KỲ NÂNG CẤP & KHÔI PHỤC (UPGRADE & ROLLBACK) TRÊN POSTGRESQL THẬT');
  console.log('================================================================================\n');

  let connStr = process.env.TEST_DATABASE_URL || null;
  const testEnvPath = path.join(PROJECT_DIR, '.env.test');
  if (fs.existsSync(testEnvPath)) {
    const envContent = fs.readFileSync(testEnvPath, 'utf8');
    const m = envContent.match(/TEST_DATABASE_URL="([^"]+)"/);
    if (m) connStr = m[1];
  }

  guardAgainstProduction(connStr);

  let embeddedPg = null;
  if (!connStr) {
    console.log(' -> Đang khởi động máy chủ PostgreSQL thử nghiệm cục bộ (port 54332)...');
    const EmbeddedPostgres = require('embedded-postgres').default;
    embeddedPg = new EmbeddedPostgres({
      port: 54332,
      databaseDir: path.join(PROJECT_DIR, '.tmp-pg-utf8')
    });
    await embeddedPg.start();
    connStr = 'postgres://postgres@localhost:54332/vivu_test';
  }

  guardAgainstProduction(connStr);
  const client = new Client({ connectionString: connStr });
  await client.connect();

  try {
    // ------------------------------------------------------------------------
    // BƯỚC 1: KHỞI TẠO CSDL VỚI TRẠNG THÁI HIỆN TẠI CỦA PRODUCTION (G8 & G14)
    // ------------------------------------------------------------------------
    console.log('[BƯỚC 1] Khởi tạo môi trường CSDL với schema production hiện tại (G8 & G14):');

    await client.query(`
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO postgres;
      GRANT ALL ON SCHEMA public TO public;

      DROP SCHEMA IF EXISTS auth CASCADE;
      CREATE SCHEMA auth;
      GRANT ALL ON SCHEMA auth TO postgres;

      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
      END
      $$;

      GRANT authenticated, anon, service_role TO postgres;

      CREATE TABLE auth.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text UNIQUE,
        raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
        created_at timestamptz DEFAULT now()
      );

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$ LANGUAGE sql STABLE;

      -- Bảng places phiên bản production: 28 cột, CHƯA CÓ user_id
      CREATE TABLE public.places (
        id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        slug text NOT NULL,
        name text NOT NULL,
        category text NOT NULL,
        area text,
        address text,
        map_link text,
        price_raw text,
        description text,
        note text,
        contact text,
        coordinates text,
        contributor text,
        rating numeric,
        opening_time text,
        closing_time text,
        display_hours text,
        operating_status text,
        status text NOT NULL DEFAULT 'draft',
        images jsonb,
        image_link text,
        sort_order integer,
        is_featured boolean,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        client_submission_id text,
        heritage_details jsonb,
        audio_guide_url text
      );

      CREATE TABLE public.community_posts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title text NOT NULL,
        content text NOT NULL DEFAULT '',
        status text NOT NULL DEFAULT 'pending',
        author_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
        author_name text,
        metadata jsonb DEFAULT '{}'::jsonb,
        moderated_by uuid,
        moderated_at timestamptz,
        moderation_reason text,
        admin_notes text,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      CREATE TABLE public.articles (
        id text PRIMARY KEY,
        slug text,
        title text NOT NULL,
        category text,
        category_name text,
        status text NOT NULL DEFAULT 'pending',
        author_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
        author_name text,
        excerpt text,
        cover_image text,
        metadata jsonb DEFAULT '{}'::jsonb,
        moderated_by uuid,
        moderated_at timestamptz,
        moderation_reason text,
        admin_notes text,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      CREATE TABLE public.clubs (
        id text PRIMARY KEY,
        name text NOT NULL,
        category text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        admin_notes text,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      CREATE TABLE public.community_events (
        id text PRIMARY KEY,
        title text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      CREATE TABLE public.club_activities (
        id text PRIMARY KEY,
        title text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      CREATE TABLE public.admin_audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id uuid,
        actor_email text,
        actor_role text,
        action text NOT NULL,
        entity_type text NOT NULL,
        entity_id text NOT NULL,
        payload_before jsonb,
        payload_after jsonb,
        ip text,
        correlation_id text,
        created_at timestamptz DEFAULT now()
      );
    `);

    // Cài đặt G8 (admin_update_place_atomic - 7 tham số) và G14 (admin_moderate_entity_atomic - 10 tham số)
    const backupSql = fs.readFileSync(BACKUP_SQL_FILE, 'utf8');
    await client.query(backupSql);

    // Xác minh hàm G14 đang có 10 tham số
    const g14Proc = await client.query(`
      SELECT proname, pronargs, pg_get_function_identity_arguments(oid) as args
      FROM pg_proc
      WHERE proname = 'admin_moderate_entity_atomic' AND pronamespace = 'public'::regnamespace;
    `);
    assert(g14Proc.rows.length === 1 && g14Proc.rows[0].pronargs === 10, 'Hàm RPC G14 admin_moderate_entity_atomic có chính xác 10 tham số trên môi trường gốc');

    // Xác minh hàm G8 đang có 7 tham số
    const g8Proc = await client.query(`
      SELECT proname, pronargs
      FROM pg_proc
      WHERE proname = 'admin_update_place_atomic' AND pronamespace = 'public'::regnamespace;
    `);
    assert(g8Proc.rows.length === 1 && g8Proc.rows[0].pronargs === 7, 'Hàm RPC G8 admin_update_place_atomic có chính xác 7 tham số trên môi trường gốc');

    // Tạo user và test bài viết trên G14
    const u1 = (await client.query(`INSERT INTO auth.users (email) VALUES ('author_g14@vivu.vn') RETURNING id`)).rows[0].id;
    const adminId = '00000000-0000-0000-0000-000000000001';
    const p1 = (await client.query(`INSERT INTO public.community_posts (title, author_id) VALUES ('Bài G14', $1) RETURNING id`, [u1])).rows[0].id;

    // Gọi G14 bằng 10 tham số -> chạy thành công nhưng CHƯA CÓ ĐIỂM (đúng thiết kế G14)
    await client.query(`
      SELECT public.admin_moderate_entity_atomic(
        $1, 'admin@vivu.vn', 'admin', 'community_post', $2::text, 'approve', NULL, 'Duyệt G14', '127.0.0.1', 'corr-g14'
      );
    `, [adminId, p1]);
    assert(true, 'Gọi RPC G14 với 10 tham số thành công trên môi trường gốc');

    // ------------------------------------------------------------------------
    // BƯỚC 2: THỰC THI NÂNG CẤP G15
    // ------------------------------------------------------------------------
    console.log('\n[BƯỚC 2] Thực thi nâng cấp migration G15 (supabase/g15_contribution_points_and_badges.sql):');
    const g15Sql = fs.readFileSync(G15_SQL_FILE, 'utf8');
    await client.query(g15Sql);

    // Kiểm tra cấu trúc sau nâng cấp
    const hasUserIdCol = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'places' AND column_name = 'user_id';
    `);
    assert(hasUserIdCol.rows.length === 1, 'Bảng places đã được nâng cấp bổ sung cột user_id thành công');

    // Kiểm tra hàm admin_moderate_entity_atomic trong pg_proc
    const g15Proc = await client.query(`
      SELECT proname, pronargs, pg_get_function_arguments(oid) as args
      FROM pg_proc
      WHERE proname = 'admin_moderate_entity_atomic' AND pronamespace = 'public'::regnamespace;
    `);
    assert(g15Proc.rows.length === 1, 'QUAN TRỌNG: Chỉ có DUY NHẤT 1 hàm admin_moderate_entity_atomic trong CSDL (Không bị Overload rác)');
    assert(g15Proc.rows[0].pronargs === 11, 'Hàm admin_moderate_entity_atomic đã được nâng cấp lên 11 tham số (có p_is_special)');
    assert(g15Proc.rows[0].args.includes('p_is_special boolean DEFAULT false'), 'Tham số thứ 11 có DEFAULT false để tương thích ngược 100% với ứng dụng cũ');

    // ------------------------------------------------------------------------
    // BƯỚC 3: KIỂM TRA TƯƠNG THÍCH ỨNG DỤNG CŨ (TRANSITIONAL WINDOW)
    // ------------------------------------------------------------------------
    console.log('\n[BƯỚC 3] Kiểm tra ứng dụng cũ trong giai đoạn CSDL đã cập nhật nhưng Web chưa deploy:');
    
    // Tác giả mới B
    const u2 = (await client.query(`INSERT INTO auth.users (email) VALUES ('author_transitional@vivu.vn') RETURNING id`)).rows[0].id;
    const pOldApp = (await client.query(`INSERT INTO public.community_posts (title, author_id) VALUES ('Bài duyệt bởi Web cũ', $1) RETURNING id`, [u2])).rows[0].id;

    // Giả lập Web Cũ: Gửi ĐÚNG 10 THAM SỐ (không gửi p_is_special)
    const oldAppCallRes = await client.query(`
      SELECT public.admin_moderate_entity_atomic(
        $1, 'admin@vivu.vn', 'admin', 'community_post', $2::text, 'approve', NULL, 'Web cũ gọi 10 tham số', '127.0.0.1', 'corr-old-app'
      ) as result;
    `, [adminId, pOldApp]);

    assert(oldAppCallRes.rows[0].result.success === true, 'Web cũ gọi 10 tham số: Thực thi THÀNH CÔNG, không bị lỗi thiếu tham số');
    
    // Kiểm tra điểm số của bài duyệt bởi Web cũ
    const u2Points = await client.query(`SELECT total_points, current_month_points FROM public.user_contribution_points WHERE user_id = $1`, [u2]);
    assert(Number(u2Points.rows[0].total_points) === 10, 'KHÔNG BỊ BỎ QUA ĐIỂM: Người dùng nhận đầy đủ +10 điểm dù duyệt qua web cũ');
    
    // Kiểm tra huy hiệu
    const u2Badges = await client.query(`SELECT badge_id FROM public.user_badges WHERE user_id = $1`, [u2]);
    assert(u2Badges.rows.length === 1 && u2Badges.rows[0].badge_id === 'buoc-chan-dau-tien', 'Huy hiệu "Bước chân đầu tiên" được tự động mở khóa thành công');

    // Địa điểm duyệt qua Web cũ (7 tham số)
    const placeOldApp = (await client.query(`
      INSERT INTO public.places (name, slug, category, contributor, user_id, status)
      VALUES ('Địa Điểm Web Cũ', 'dia-diem-web-cu', 'Ẩm Thực', 'Tác Giả B', $1, 'draft')
      RETURNING id;
    `, [u2])).rows[0].id;

    await client.query(`
      SELECT public.admin_update_place_atomic(
        $1, 'admin@vivu.vn', 'admin', $2, '{"status": "approved"}'::jsonb, '127.0.0.1', 'corr-place-old-app'
      );
    `, [adminId, placeOldApp]);

    const u2PointsAfterPlace = await client.query(`SELECT total_points FROM public.user_contribution_points WHERE user_id = $1`, [u2]);
    assert(Number(u2PointsAfterPlace.rows[0].total_points) === 25, 'Địa điểm duyệt bởi Web cũ: Tự động cộng +15 điểm (10 + 15 = 25 điểm)');

    // ------------------------------------------------------------------------
    // BƯỚC 4: KIỂM TRA ỨNG DỤNG MỚI (11 THAM SỐ CÓ THƯỞNG ĐẶC BIỆT)
    // ------------------------------------------------------------------------
    console.log('\n[BƯỚC 4] Kiểm tra ứng dụng mới sau khi deploy (gọi 11 tham số có is_special):');
    const pNewApp = (await client.query(`INSERT INTO public.community_posts (title, author_id) VALUES ('Bài duyệt bởi Web mới đặc biệt', $1) RETURNING id`, [u2])).rows[0].id;

    await client.query(`
      SELECT public.admin_moderate_entity_atomic(
        $1, 'admin@vivu.vn', 'admin', 'community_post', $2::text, 'approve', NULL, 'Web mới duyệt có thưởng', '127.0.0.1', 'corr-new-app', true
      );
    `, [adminId, pNewApp]);

    const u2PointsAfterSpecial = await client.query(`SELECT total_points FROM public.user_contribution_points WHERE user_id = $1`, [u2]);
    assert(Number(u2PointsAfterSpecial.rows[0].total_points) === 45, 'Web mới gọi 11 tham số (is_special=true): Được cộng 10 cơ bản + 10 thưởng = 20 điểm (25 + 20 = 45)');

    // ------------------------------------------------------------------------
    // BƯỚC 5: KIỂM TRA KHÔI PHỤC (ROLLBACK) VỀ BẢN SAO LƯU G8/G14
    // ------------------------------------------------------------------------
    console.log('\n[BƯỚC 5] Kiểm tra kịch bản khôi phục (Rollback) về bản sao lưu G8/G14:');
    await client.query(backupSql);

    const rollbackProc = await client.query(`
      SELECT proname, pronargs
      FROM pg_proc
      WHERE proname = 'admin_moderate_entity_atomic' AND pronamespace = 'public'::regnamespace;
    `);
    assert(rollbackProc.rows.length === 1 && rollbackProc.rows[0].pronargs === 10, 'Rollback thành công: Hàm admin_moderate_entity_atomic hạ cấp an toàn về đúng 10 tham số G14');

    const rollbackPlaceProc = await client.query(`
      SELECT proname, pronargs
      FROM pg_proc
      WHERE proname = 'admin_update_place_atomic' AND pronamespace = 'public'::regnamespace;
    `);
    assert(rollbackPlaceProc.rows.length === 1 && rollbackPlaceProc.rows[0].pronargs === 7, 'Rollback thành công: Hàm admin_update_place_atomic hạ cấp an toàn về đúng G8');

    // Thử gọi lại hàm sau rollback
    const pRollback = (await client.query(`INSERT INTO public.community_posts (title, author_id) VALUES ('Bài sau rollback', $1) RETURNING id`, [u2])).rows[0].id;
    await client.query(`
      SELECT public.admin_moderate_entity_atomic(
        $1, 'admin@vivu.vn', 'admin', 'community_post', $2::text, 'approve', NULL, 'Duyệt sau rollback', '127.0.0.1', 'corr-post-rb'
      );
    `, [adminId, pRollback]);
    assert(true, 'Gọi RPC sau khi rollback hoạt động bình thường theo chuẩn G14');

    // ------------------------------------------------------------------------
    // BƯỚC 6: KIỂM TRA TÁI NÂNG CẤP (RE-UPGRADE G15)
    // ------------------------------------------------------------------------
    console.log('\n[BƯỚC 6] Kiểm tra tái nâng cấp lại G15 (Re-upgrade Idempotency):');
    await client.query(g15Sql);

    const reupgradeProc = await client.query(`
      SELECT proname, pronargs
      FROM pg_proc
      WHERE proname = 'admin_moderate_entity_atomic' AND pronamespace = 'public'::regnamespace;
    `);
    assert(reupgradeProc.rows.length === 1 && reupgradeProc.rows[0].pronargs === 11, 'Tái nâng cấp G15 thành công: Hàm 11 tham số được tái thiết lập chuẩn xác');

    console.log('\n================================================================================');
    console.log(` ✅ TOÀN BỘ ${passed}/${total} BÀI KIỂM THỬ NÂNG CẤP & KHÔI PHỤC ĐẠT 100% PASS!`);
    console.log('================================================================================\n');

  } finally {
    await client.end().catch(() => {});
    if (embeddedPg) {
      console.log(' -> Đang dừng PostgreSQL cục bộ...');
      await embeddedPg.stop().catch(() => {});
      console.log(' ✓ Đã dừng PostgreSQL an toàn.\n');
    }
  }
}

runUpgradeAndRollbackSuite().catch(err => {
  console.error('\n❌ Lỗi kiểm thử nâng cấp & khôi phục:', err);
  process.exit(1);
});
