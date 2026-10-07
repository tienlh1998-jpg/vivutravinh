/**
 * scripts/test-sql-migration-upgrade.cjs
 * Kiểm tra tính tương thích và nâng cấp thực tế của file migration G16
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { Client } = require('pg');

const ROOT_DIR = path.resolve(__dirname, '..');
const G16_FILE = path.join(ROOT_DIR, 'supabase', 'g16_protect_avatars_and_storage_policies.sql');
const STORAGE_FILE = path.join(ROOT_DIR, 'supabase', 'storage.sql');

async function testStaticMigrationIntegrity() {
    console.log('1. KIỂM THỬ TĨNH NỘI DUNG & TƯƠNG THÍCH MIGRATION G16:');
    assert(fs.existsSync(G16_FILE), 'File migration G16 phải tồn tại');
    assert(fs.existsSync(STORAGE_FILE), 'File storage.sql phải tồn tại');

    const g16Sql = fs.readFileSync(G16_FILE, 'utf8');

    // 1. Kiểm tra Drop Function
    assert(g16Sql.includes('DROP FUNCTION IF EXISTS public.cleanup_orphan_review_photos()'), 'Phải có DROP FUNCTION IF EXISTS để tương thích nâng cấp sạch');
    console.log('  ✓ Có lệnh DROP FUNCTION IF EXISTS chống lỗi signature khi nâng cấp.');

    // 2. Kiểm tra giữ nguyên tên cột trả về deleted_name text
    assert(g16Sql.includes('RETURNS TABLE(deleted_name text)'), 'Phải giữ nguyên tên cột deleted_name text trong kiểu trả về');
    assert(g16Sql.includes('SELECT o.name AS deleted_name') || g16Sql.includes('SELECT o.name as deleted_name'), 'Cột select phải alias đúng deleted_name');
    console.log('  ✓ Giữ nguyên chính xác tên cột trả về TABLE(deleted_name text) tương thích với hàm hiện có.');

    // 3. Kiểm tra bảo vệ Avatar khỏi cleanup
    assert(g16Sql.includes("coalesce((storage.foldername(o.name))[1], '') != 'avatars'"), 'Phải loại trừ thư mục cấp 1 avatars');
    assert(g16Sql.includes("coalesce((storage.foldername(o.name))[2], '') != 'avatars'"), 'Phải loại trừ thư mục cấp 2 avatars');
    assert(g16Sql.includes('profiles p') && g16Sql.includes('p.avatar_url LIKE'), 'Phải loại trừ các ảnh đang được liên kết trong profiles.avatar_url');
    assert(g16Sql.includes('place_comments pc') && g16Sql.includes('pc.photo_url LIKE'), 'Phải loại trừ các ảnh đang được liên kết trong place_comments.photo_url');
    console.log('  ✓ Thủ tục dọn dẹp bảo vệ kép: loại trừ cả thư mục avatars và mọi ảnh đang dùng trong profiles.avatar_url.');

    // 4. Kiểm tra phân tách RLS policies
    assert(g16Sql.includes('Anon upload review photos'), 'Phải có policy Anon upload review photos');
    assert(g16Sql.includes("AND (storage.foldername(name))[2] != 'avatars'"), 'Review photos phải loại trừ thư mục avatars');
    assert(g16Sql.includes('Authenticated upload own avatar'), 'Phải có policy Authenticated upload own avatar');
    assert(g16Sql.includes('Authenticated delete own avatar'), 'Phải có policy Authenticated delete own avatar');
    assert(g16Sql.includes('(auth.uid())::text'), 'Policy avatar phải gắn chặt với auth.uid()');
    console.log('  ✓ RLS Storage: Giữ nguyên luồng ảnh đánh giá, giới hạn avatar cho authenticated và đúng auth.uid() của họ.');

    // 5. Kiểm tra không có hardcoded secrets hay lệnh COMMIT/ROLLBACK nguy hiểm
    const cleanSql = g16Sql.replace(/--.*$/gm, '');
    assert(!cleanSql.match(/\b(COMMIT|ROLLBACK)\b/i), 'Không được chứa lệnh COMMIT/ROLLBACK trong file migration');
    console.log('  ✓ Không chứa lệnh giao dịch nguy hiểm trong hàm PL/pgSQL.');
}

async function testWithPostgresIfAvailable() {
    console.log('\n2. KIỂM THỬ THỰC THI TRÊN POSTGRESQL (NẾU CÓ MÔI TRƯỜNG):');
    let embeddedPg = null;
    let client = null;

    try {
        const EmbeddedPostgres = require('embedded-postgres').default;
        embeddedPg = new EmbeddedPostgres({
            port: 54332,
            databaseDir: path.join(ROOT_DIR, '.tmp-pg-utf8')
        });
        await embeddedPg.start();
        console.log('  ✓ Khởi động máy chủ PostgreSQL kiểm thử thành công (port 54332)');

        const initClient = new Client({
            host: '127.0.0.1',
            port: 54332,
            user: process.env.USERNAME || 'tienl',
            database: 'postgres'
        });
        await initClient.connect();
        await initClient.query(`
            DO $$
            BEGIN
              IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'postgres') THEN
                CREATE ROLE postgres WITH SUPERUSER LOGIN;
              END IF;
              IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
                CREATE ROLE anon;
              END IF;
              IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
                CREATE ROLE authenticated;
              END IF;
              IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
                CREATE ROLE service_role;
              END IF;
            END $$;
        `);
        const dbCheck = await initClient.query("SELECT 1 FROM pg_database WHERE datname = 'g16_test'");
        if (dbCheck.rows.length === 0) {
            await initClient.query('CREATE DATABASE g16_test WITH OWNER postgres');
        }
        await initClient.end();

        client = new Client({
            host: '127.0.0.1',
            port: 54332,
            user: 'postgres',
            database: 'g16_test'
        });
        await client.connect();

        // Chuẩn bị schema giả lập
        await client.query(`
            CREATE SCHEMA IF NOT EXISTS storage;
            CREATE SCHEMA IF NOT EXISTS public;
            CREATE SCHEMA IF NOT EXISTS auth;

            CREATE OR REPLACE FUNCTION auth.uid()
            RETURNS uuid LANGUAGE sql STABLE AS $$
              SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
            $$;

            CREATE TABLE IF NOT EXISTS storage.objects (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                bucket_id text,
                name text,
                owner uuid,
                created_at timestamptz DEFAULT now(),
                updated_at timestamptz DEFAULT now(),
                last_accessed_at timestamptz DEFAULT now(),
                metadata jsonb
            );

            ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
            GRANT ALL ON SCHEMA storage, public TO anon, authenticated, postgres;
            GRANT ALL ON ALL TABLES IN SCHEMA storage, public TO anon, authenticated, postgres;

            CREATE OR REPLACE FUNCTION storage.foldername(name text)
            RETURNS text[] LANGUAGE plpgsql AS $$
            DECLARE
              _parts text[];
            BEGIN
              SELECT string_to_array(name, '/') INTO _parts;
              RETURN _parts[1:array_length(_parts, 1) - 1];
            END;
            $$;

            CREATE OR REPLACE FUNCTION storage.filename(name text)
            RETURNS text LANGUAGE plpgsql AS $$
            DECLARE
              _parts text[];
            BEGIN
              SELECT string_to_array(name, '/') INTO _parts;
              RETURN _parts[array_length(_parts, 1)];
            END;
            $$;

            CREATE OR REPLACE FUNCTION storage.extension(name text)
            RETURNS text LANGUAGE plpgsql AS $$
            DECLARE
              _parts text[];
              _filename text;
            BEGIN
              SELECT string_to_array(name, '/') INTO _parts;
              _filename := _parts[array_length(_parts, 1)];
              RETURN split_part(_filename, '.', 2);
            END;
            $$;

            CREATE TABLE IF NOT EXISTS public.place_comments (
                id bigint PRIMARY KEY,
                photo_url text
            );

            CREATE TABLE IF NOT EXISTS public.profiles (
                id uuid PRIMARY KEY,
                avatar_url text,
                display_name text
            );

            -- Giả lập hàm cũ trước khi chạy G16 (để kiểm tra quá trình nâng cấp đè lên)
            CREATE OR REPLACE FUNCTION public.cleanup_orphan_review_photos()
            RETURNS TABLE(deleted_name text)
            LANGUAGE plpgsql AS $$
            BEGIN
              RETURN QUERY SELECT o.name FROM storage.objects o WHERE false;
            END;
            $$;
        `);
        console.log('  ✓ Đã thiết lập schema giả lập & hàm cũ để thử nghiệm nâng cấp.');

        // CHẠY NGUYÊN FILE MIGRATION G16
        const g16Sql = fs.readFileSync(G16_FILE, 'utf8');
        await client.query(g16Sql);
        console.log('  ✓ Thực thi toàn bộ file migration G16 thành công 100% không có lỗi!');

        // KIỂM THỬ MA TRẬN RLS STORAGE THEO POLICY MỚI CỦA G16
        console.log('\n  --- KIỂM THỬ MA TRẬN RLS STORAGE (G16) ---');
        const userA = 'a0000000-0000-0000-0000-000000000001';
        const userB = 'b0000000-0000-0000-0000-000000000002';

        // 1. Thử nghiệm Role Anon:
        await client.query("SET ROLE anon;");
        await client.query("SET request.jwt.claim.sub = '';");

        // 1a. Anon upload ảnh đánh giá hợp lệ -> PHẢI THÀNH CÔNG
        await client.query(
            "INSERT INTO storage.objects (bucket_id, name) VALUES ('review-photos', 'reviews/ao-ba-om/1791234567_good_review.jpg')"
        );
        console.log('  ✓ Khách (Anon) upload ảnh đánh giá địa điểm reviews/ao-ba-om/...: THÀNH CÔNG (Luồng đánh giá được bảo toàn).');

        // 1b. Anon upload avatar vào reviews/avatars/... -> PHẢI BỊ CHẶN BỞI RLS
        let anonBlocked1 = false;
        try {
            await client.query(
                "INSERT INTO storage.objects (bucket_id, name) VALUES ('review-photos', 'reviews/avatars/" + userA + "_bad_anon.png')"
            );
        } catch (e) {
            anonBlocked1 = e.message.includes('violates row-level security policy');
        }
        assert(anonBlocked1, 'Khách (Anon) upload avatar vào reviews/avatars/ phải bị chặn bởi RLS!');
        console.log('  ✓ Khách (Anon) upload avatar vào reviews/avatars/: BỊ CHẶN CHÍNH XÁC bởi RLS.');

        // 1c. Anon upload avatar vào avatars/{id}/... -> PHẢI BỊ CHẶN BỞI RLS
        let anonBlocked2 = false;
        try {
            await client.query(
                "INSERT INTO storage.objects (bucket_id, name) VALUES ('review-photos', 'avatars/" + userA + "/bad_anon.png')"
            );
        } catch (e) {
            anonBlocked2 = e.message.includes('violates row-level security policy');
        }
        assert(anonBlocked2, 'Khách (Anon) upload avatar vào avatars/ phải bị chặn bởi RLS!');
        console.log('  ✓ Khách (Anon) upload avatar vào avatars/{id}/: BỊ CHẶN CHÍNH XÁC bởi RLS.');

        // 2. Thử nghiệm Role Authenticated (User A)
        await client.query("SET ROLE authenticated;");
        await client.query(`SET request.jwt.claim.sub = '${userA}';`);

        // 2a. User A upload avatar vào đường dẫn ID của User B -> PHẢI BỊ CHẶN BỞI RLS
        let spoofBlocked1 = false;
        try {
            await client.query(
                "INSERT INTO storage.objects (bucket_id, name) VALUES ('review-photos', 'reviews/avatars/" + userB + "_spoofed.png')"
            );
        } catch (e) {
            spoofBlocked1 = e.message.includes('violates row-level security policy');
        }
        assert(spoofBlocked1, 'Member A upload avatar với tiền tố User B phải bị chặn bởi RLS!');

        let spoofBlocked2 = false;
        try {
            await client.query(
                "INSERT INTO storage.objects (bucket_id, name) VALUES ('review-photos', 'avatars/" + userB + "/spoofed.png')"
            );
        } catch (e) {
            spoofBlocked2 = e.message.includes('violates row-level security policy');
        }
        assert(spoofBlocked2, 'Member A upload avatar vào thư mục User B phải bị chặn bởi RLS!');
        console.log('  ✓ Member upload avatar vào ID của người khác (User B): BỊ CHẶN CHÍNH XÁC bởi RLS.');

        // 2b. User A upload avatar đúng ID của chính mình -> PHẢI THÀNH CÔNG
        await client.query(
            "INSERT INTO storage.objects (bucket_id, name) VALUES ('review-photos', 'reviews/avatars/" + userA + "_myavatar.png')"
        );
        await client.query(
            "INSERT INTO storage.objects (bucket_id, name) VALUES ('review-photos', 'avatars/" + userA + "/myavatar.png')"
        );
        console.log('  ✓ Member upload avatar đúng ID của chính mình (User A): THÀNH CÔNG CẢ 2 ĐỊNH DẠNG ĐƯỜNG DẪN.');

        // 3. Reset về role postgres để test hàm cleanup
        await client.query("RESET ROLE;");

        // THỬ NGHIỆM FUNCTION CLEANUP BẢO VỆ DỮ LIỆU
        console.log('\n  --- KIỂM THỬ FUNCTION DỌN DẸP ẢNH MỒ CÔI (CLEANUP GUARD) ---');
        // Dọn dẹp dữ liệu kiểm thử cũ để đảm bảo kết quả chính xác
        await client.query("TRUNCATE TABLE storage.objects, public.profiles, public.place_comments;");

        // Khai báo các ảnh thử nghiệm
        const activeUserAvatar = 'reviews/avatars/' + userA + '_active_profile.png';
        const orphanReviewPhoto = 'reviews/ao-ba-om/1791234567_orphan_old_photo.jpg';

        await client.query(
            "INSERT INTO public.profiles (id, avatar_url) VALUES ('" + userA + "', 'https://supa.co/review-photos/' || $1) ON CONFLICT (id) DO UPDATE SET avatar_url = EXCLUDED.avatar_url",
            [activeUserAvatar]
        );
        await client.query(
            "INSERT INTO storage.objects (bucket_id, name, created_at) VALUES ('review-photos', $1, now() - interval '72 hours')",
            [activeUserAvatar]
        );
        await client.query(
            "INSERT INTO storage.objects (bucket_id, name, created_at) VALUES ('review-photos', $1, now() - interval '72 hours')",
            [orphanReviewPhoto]
        );

        // Gọi hàm cleanup_orphan_review_photos()
        const res = await client.query('SELECT * FROM public.cleanup_orphan_review_photos();');
        const candidateNames = res.rows.map(r => r.deleted_name);
        console.log('  Danh sách ảnh mồ côi do hàm cleanup trả về:', candidateNames);

        assert(candidateNames.includes(orphanReviewPhoto), 'Ảnh đánh giá cũ không ai dùng phải nằm trong danh sách dọn dẹp');
        assert(!candidateNames.includes(activeUserAvatar), 'Ảnh avatar đang dùng TUYỆT ĐỐI KHÔNG ĐƯỢC nằm trong danh sách dọn dẹp!');
        assert(!candidateNames.some(name => name.includes('avatars')), 'Mọi ảnh trong thư mục avatars TUYỆT ĐỐI KHÔNG ĐƯỢC nằm trong danh sách dọn dẹp!');
        console.log('  ✓ Đã xác minh: cleanup_orphan_review_photos() loại trừ hoàn toàn avatar đang dùng và thư mục avatars!');

    } catch (err) {
        if (err.message.includes('Cannot find module') || err.message.includes('embedded-postgres')) {
            console.log('  [SKIPPED] Bỏ qua kiểm thử embedded-postgres vì không có module nhúng.');
        } else {
            throw err;
        }
    } finally {
        if (client) await client.end().catch(() => {});
        if (embeddedPg) await embeddedPg.stop().catch(() => {});
    }
}

async function main() {
    await testStaticMigrationIntegrity();
    await testWithPostgresIfAvailable();
    console.log('\n=== TẤT CẢ KIỂM THỬ TƯƠNG THÍCH MIGRATION G16 ĐÃ HOÀN TẤT THÀNH CÔNG 100%! ===');
}

main().catch(err => {
    console.error('LỖI KIỂM THỬ MIGRATION:', err);
    process.exit(1);
});
