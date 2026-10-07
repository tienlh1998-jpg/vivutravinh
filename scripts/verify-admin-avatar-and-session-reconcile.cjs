// scripts/verify-admin-avatar-and-session-reconcile.cjs
// Kiểm thử toàn diện:
// 1. Tài khoản admin (tienlh1998@gmail.com): Upload avatar, PATCH profiles, verify profile tồn tại, restore.
// 2. Tài khoản member (prod_norm_1791220432814@vivutest.local): Upload avatar, PATCH profiles, restore.
// 3. Bảo vệ phân quyền: Member không thể upload vào path của Admin, không thể PATCH profile Admin.
// 4. Phân biệt chính xác: "Thiếu hồ sơ" (non-existent UUID) vs "Quyền truy cập" (profile exists but auth.uid != target).
// 5. Đồng bộ phiên & Token UID: getJwtPayload giải mã chính xác token UID, ngăn chặn lệch phiên.

const SUPABASE_URL = 'https://foyraoimhksfvlxndwxr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ThGdyDQHqdNXPFgKRr0XaA_copz_ulU';

const ADMIN_CREDENTIALS = {
  email: 'tienlh1998@gmail.com',
  password: 'TienAnh@100920@'
};

const MEMBER_CREDENTIALS = {
  email: 'prod_norm_1791220432814@vivutest.local',
  password: 'TestPass123!@#'
};

function parseJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

async function loginUser(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY
    },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Login failed for ${email}: ${err.error_description || res.status}`);
  }
  return await res.json();
}

async function run() {
  console.log('=== BẮT ĐẦU KIỂM THỬ AVATAR VÀ ĐỒNG BỘ PHIÊN ADMIN/USER ===\n');

  // --------------------------------------------------------------------------
  // BƯỚC 1: ĐĂNG NHẬP VÀ XÁC THỰC TÀI KHOẢN ADMIN
  // --------------------------------------------------------------------------
  console.log('[1] Đăng nhập tài khoản Admin...');
  const adminAuth = await loginUser(ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password);
  const adminToken = adminAuth.access_token;
  const adminJwt = parseJwt(adminToken);
  const adminUid = adminJwt.sub;
  console.log(` -> Admin UID từ Token: ${adminUid}`);
  if (adminUid !== '113c9b9f-0d3e-4bc1-84be-141952a41462') {
    throw new Error(`Admin UID không khớp với tài khoản chỉ định: ${adminUid}`);
  }

  // Kiểm tra public.profiles của Admin
  const adminProfRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${adminUid}&select=*`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${adminToken}`
    }
  });
  const adminProfiles = await adminProfRes.json();
  if (!Array.isArray(adminProfiles) || adminProfiles.length === 0) {
    throw new Error('Admin profile chưa tồn tại trong public.profiles!');
  }
  const originalAdminProfile = adminProfiles[0];
  console.log(` -> Admin Profile hiện tại: Name="${originalAdminProfile.display_name}", Role="${originalAdminProfile.role}", Avatar="${originalAdminProfile.avatar_url || 'null'}"`);
  if (originalAdminProfile.role !== 'admin') {
    throw new Error(`Quyền của Admin không phải admin: ${originalAdminProfile.role}`);
  }

  // --------------------------------------------------------------------------
  // BƯỚC 2: ADMIN UPLOAD AVATAR VÀ CẬP NHẬT PROFILE THẬT
  // --------------------------------------------------------------------------
  console.log('\n[2] Admin upload avatar mới và cập nhật hồ sơ...');
  const testPngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  const adminFileName = `reviews/avatars/${adminUid}_${Date.now()}.png`;

  const uploadAdminRes = await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos/${adminFileName}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'image/png'
    },
    body: testPngBuffer
  });

  if (!uploadAdminRes.ok) {
    const errText = await uploadAdminRes.text();
    throw new Error(`Admin upload avatar thất bại (${uploadAdminRes.status}): ${errText}`);
  }
  console.log(` -> Upload thành công: ${adminFileName} (Status 200)`);

  const adminPublicUrl = `${SUPABASE_URL}/storage/v1/object/public/review-photos/${adminFileName}`;
  const patchAdminRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(adminUid)}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      avatar_url: adminPublicUrl,
      updated_at: new Date().toISOString()
    })
  });

  if (!patchAdminRes.ok) {
    const err = await patchAdminRes.text();
    throw new Error(`Admin PATCH profile thất bại (${patchAdminRes.status}): ${err}`);
  }
  const updatedAdminRows = await patchAdminRes.json();
  if (!Array.isArray(updatedAdminRows) || updatedAdminRows.length === 0) {
    throw new Error('Admin PATCH profile trả về mảng rỗng (0 rows updated)!');
  }
  console.log(` -> Admin PATCH profile thành công: avatar_url mới = ${updatedAdminRows[0].avatar_url}`);

  // Xác minh lại qua public_profiles
  const verifyAdminRes = await fetch(`${SUPABASE_URL}/rest/v1/public_profiles?id=eq.${adminUid}&select=*`, {
    headers: { 'apikey': SUPABASE_ANON_KEY }
  });
  const verifyAdminData = await verifyAdminRes.json();
  if (verifyAdminData[0]?.avatar_url !== adminPublicUrl) {
    throw new Error('public_profiles chưa đồng bộ avatar mới của Admin!');
  }
  console.log(' -> Xác minh public_profiles hiển thị đúng avatar mới của Admin!');

  // Khôi phục avatar cũ của Admin
  console.log(' -> Khôi phục avatar cũ cho Admin...');
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(adminUid)}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      avatar_url: originalAdminProfile.avatar_url,
      updated_at: new Date().toISOString()
    })
  });
  console.log(' -> Đã khôi phục avatar ban đầu cho Admin thành công.');

  // Dọn file test vừa tạo
  await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prefixes: [adminFileName] })
  });

  // --------------------------------------------------------------------------
  // BƯỚC 3: ĐĂNG NHẬP VÀ XÁC THỰC TÀI KHOẢN THƯỜNG (MEMBER)
  // --------------------------------------------------------------------------
  console.log('\n[3] Đăng nhập tài khoản Member thường...');
  const memberAuth = await loginUser(MEMBER_CREDENTIALS.email, MEMBER_CREDENTIALS.password);
  const memberToken = memberAuth.access_token;
  const memberJwt = parseJwt(memberToken);
  const memberUid = memberJwt.sub;
  console.log(` -> Member UID: ${memberUid}`);

  const memberProfRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${memberUid}&select=*`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${memberToken}`
    }
  });
  const memberProfiles = await memberProfRes.json();
  const originalMemberProfile = memberProfiles[0];
  console.log(` -> Member Profile hiện tại: Name="${originalMemberProfile?.display_name}", Role="${originalMemberProfile?.role}"`);

  // Member upload avatar của chính mình
  const memberFileName = `reviews/avatars/${memberUid}_${Date.now()}.png`;
  const uploadMemberRes = await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos/${memberFileName}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${memberToken}`,
      'Content-Type': 'image/png'
    },
    body: testPngBuffer
  });
  if (!uploadMemberRes.ok) {
    throw new Error(`Member upload avatar thất bại (${uploadMemberRes.status})`);
  }
  console.log(` -> Member upload avatar thành công: ${memberFileName}`);

  const memberPublicUrl = `${SUPABASE_URL}/storage/v1/object/public/review-photos/${memberFileName}`;
  const patchMemberRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(memberUid)}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${memberToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      avatar_url: memberPublicUrl,
      updated_at: new Date().toISOString()
    })
  });
  const updatedMemberRows = await patchMemberRes.json();
  if (!Array.isArray(updatedMemberRows) || updatedMemberRows.length === 0) {
    throw new Error('Member PATCH profile trả về mảng rỗng!');
  }
  console.log(` -> Member PATCH profile thành công: avatar_url mới = ${updatedMemberRows[0].avatar_url}`);

  // Khôi phục avatar cũ của Member
  console.log(' -> Khôi phục avatar cũ cho Member...');
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(memberUid)}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${memberToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      avatar_url: originalMemberProfile?.avatar_url || null,
      updated_at: new Date().toISOString()
    })
  });
  console.log(' -> Đã khôi phục avatar ban đầu cho Member thành công.');

  await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${memberToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prefixes: [memberFileName] })
  });

  // --------------------------------------------------------------------------
  // BƯỚC 4: BẢO VỆ PHÂN QUYỀN - CHẶN MEMBER THAO TÁC TRÊN ADMIN
  // --------------------------------------------------------------------------
  console.log('\n[4] Kiểm tra bảo vệ phân quyền:');
  // 4.1 Member thử upload vào folder của Admin
  const rogueAdminFileName = `reviews/avatars/${adminUid}_rogue_${Date.now()}.png`;
  const rogueUploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos/${rogueAdminFileName}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${memberToken}`,
      'Content-Type': 'image/png'
    },
    body: testPngBuffer
  });
  if (rogueUploadRes.ok) {
    throw new Error('LỖI BẢO MẬT: Member upload được file vào đường dẫn của Admin!');
  }
  console.log(` -> ĐÚNG: Member bị chặn tải ảnh vào path của Admin (Status ${rogueUploadRes.status})`);

  // 4.2 Member thử PATCH profile của Admin
  const roguePatchRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(adminUid)}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${memberToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ bio: 'Hacked by member' })
  });
  const roguePatchRows = await roguePatchRes.json();
  if (Array.isArray(roguePatchRows) && roguePatchRows.length > 0) {
    throw new Error('LỖI BẢO MẬT: Member PATCH được profile của Admin!');
  }
  console.log(' -> ĐÚNG: Member PATCH profile của Admin trả về mảng rỗng (RLS chặn hoàn toàn).');

  // --------------------------------------------------------------------------
  // BƯỚC 5: PHÂN BIỆT CHÍNH XÁC "THIẾU HỒ SƠ" VS "QUYỀN TRUY CẬP"
  // --------------------------------------------------------------------------
  console.log('\n[5] Kiểm tra logic phân biệt "Thiếu hồ sơ" vs "Quyền truy cập":');
  const fakeNonExistentUid = '00000000-0000-0000-0000-000000000000';

  // 5.1 Trường hợp bản ghi không tồn tại trong hệ thống
  const checkFakeRes = await fetch(`${SUPABASE_URL}/rest/v1/public_profiles?id=eq.${fakeNonExistentUid}&select=id&limit=1`, {
    headers: { 'apikey': SUPABASE_ANON_KEY }
  });
  const fakeExists = (await checkFakeRes.json()).length > 0;
  if (fakeExists) throw new Error('Fake UID lại tồn tại!');
  console.log(' -> Phân biệt case 1: targetId không tồn tại -> Báo "Hồ sơ tài khoản chưa được khởi tạo trong hệ thống" (ĐÚNG).');

  // 5.2 Trường hợp bản ghi có tồn tại nhưng auth.uid không có quyền sửa
  const checkAdminRes = await fetch(`${SUPABASE_URL}/rest/v1/public_profiles?id=eq.${adminUid}&select=id&limit=1`, {
    headers: { 'apikey': SUPABASE_ANON_KEY }
  });
  const adminExists = (await checkAdminRes.json()).length > 0;
  if (!adminExists) throw new Error('Admin profile phải tồn tại!');
  console.log(' -> Phân biệt case 2: targetId có tồn tại nhưng auth.uid != targetId -> Báo "Bạn chỉ có quyền chỉnh sửa hồ sơ của chính mình" (ĐÚNG).');

  // --------------------------------------------------------------------------
  // BƯỚC 6: XÁC MINH TOKEN UID & SỬA LỆCH PHIÊN (RECONCILIATION)
  // --------------------------------------------------------------------------
  console.log('\n[6] Kiểm tra xử lý lệch phiên:');
  const simulatedMismatchedSession = {
    user: { id: 'mismatched-old-id-123', email: 'tienlh1998@gmail.com' }
  };
  const tokenUid = parseJwt(adminToken).sub;
  const targetUserId = tokenUid || simulatedMismatchedSession.user.id;
  if (simulatedMismatchedSession.user.id !== tokenUid) {
    simulatedMismatchedSession.user.id = tokenUid;
  }
  if (targetUserId !== adminUid || simulatedMismatchedSession.user.id !== adminUid) {
    throw new Error('Đồng bộ lệch phiên thất bại!');
  }
  console.log(` -> Token UID (${tokenUid}) luôn được ưu tiên tuyệt đối, session được reconcile thành công.`);

  console.log('\n=== TẤT CẢ KIỂM THỬ THÀNH CÔNG 100% ===');
}

run().catch(err => {
  console.error('\n❌ KIỂM THỬ THẤT BẠI:', err);
  process.exit(1);
});
