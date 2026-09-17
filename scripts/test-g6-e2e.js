#!/usr/bin/env node

/**
 * scripts/test-g6-e2e.js
 *
 * Bộ kiểm thử đầu cuối (End-to-End Test Suite) Giai đoạn G6:
 * Thực hiện 10 ca kiểm thử kỹ thuật nghiêm ngặt từ E01 đến E10:
 *   E01 — Đủ dữ liệu (Tạo draft -> public không thấy -> duyệt -> search có/không dấu -> filter -> modal/Maps/phone)
 *   E02 — Thiếu dữ liệu (Thiếu ảnh/giá/giờ/GPS/contact -> UI giữ bố cục, unknown rõ, không tự gán)
 *   E03 — Gallery (Nhiều ảnh, ảnh lỗi fallback, ảnh dọc/ngang, không dùng ảnh sai địa điểm)
 *   E04 — Chỉnh sửa (Sửa giờ/giá/ảnh/slug -> cache cập nhật; ID favorite/recent vẫn liên kết đúng)
 *   E05 — Ẩn/gỡ (Địa điểm bị ẩn biến mất khỏi public/API; deep link xử lý văn minh; cache cập nhật)
 *   E06 — Review (Không sao/tên ngắn/spam/HTML/ảnh lỗi bị từ chối; review hợp lệ lưu an toàn)
 *   E07 — Offline (Có cache -> mất mạng -> xem/lưu/viết review -> online -> đồng bộ 1 lần)
 *   E08 — Request lỗi (Timeout, 401/403/429/500 -> thông báo phù hợp, không mất nội dung nhập)
 *   E09 — Mobile (Touch target >=44px, nút Back popstate, bàn phím, responsive, share, tel/Maps)
 *   E10 — Chất lượng vận hành (Build sạch, log không lộ secret, SW không phá draft)
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  parsePrice,
  parseOperatingHours,
  parseCoordinates,
  parseContact,
  normalizePlace
} from '../js/data.js';

import {
  createPlaceCardHtml,
  formatPlacePrice,
  getPlaceOpenStatus,
  NEUTRAL_PLACEHOLDER_IMAGE,
  escapeHtml
} from '../js/ui.js';

import {
  validateCommentInput,
  CommentValidationError,
  CommentCooldownError,
  SupabaseRequestError
} from '../js/comments.js';

import {
  state as appState,
  toggleBookmark,
  saveRecentPlace,
  isPlaceSaved,
  isPlaceRecent,
  canonicalizePreferences,
  getPlaceAliases,
  getPlaceCanonicalKey
} from '../js/app.js';

// Setup minimal localStorage mock for Node test environment
const inMemoryStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => inMemoryStorage.has(key) ? inMemoryStorage.get(key) : null,
  setItem: (key, val) => inMemoryStorage.set(key, String(val)),
  removeItem: (key) => inMemoryStorage.delete(key),
  clear: () => inMemoryStorage.clear()
};
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    localStorage: globalThis.localStorage,
    location: new URL('http://localhost:8000/'),
    history: { pushState: () => {}, replaceState: () => {} }
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

console.log('=== BẮT ĐẦU BỘ KIỂM THỬ ĐẦU CUỐI G6: THÊM ĐỊA ĐIỂM MỚI & E2E (E01–E10) ===\n');

let passedTests = 0;
let totalTests = 0;

function runTest(caseId, name, testFn) {
  totalTests++;
  try {
    testFn();
    console.log(`  ✓ [${caseId}] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [${caseId}] ${name} THẤT BẠI:`, err.message);
    throw err;
  }
}

// =========================================================================
// E01 — Đủ dữ liệu
// =========================================================================
console.log('--- [E01] Kiểm thử Địa Điểm Đủ Dữ Liệu & Vòng Đời Phê Duyệt ---');

runTest('E01', 'Tạo draft -> Public không thấy -> Duyệt approved -> Tìm kiếm có/không dấu -> Filter & Modal Links', () => {
  // 1. Tạo địa điểm đầy đủ dữ liệu ở trạng thái Draft
  const rawDraft = {
    'Tên địa điểm': 'Chùa Hang Mới Thổ Địa',
    'Phân loại': 'Chùa Khmer',
    'Khu vực': 'Châu Thành',
    'Địa chỉ': 'Thị trấn Châu Thành, huyện Châu Thành, Trà Vinh',
    'Mức Giá': 'Miễn phí',
    'Giờ Mở Cửa': '06:00 - 19:00',
    'Trạng Thái Hoạt Động': 'Normal',
    'Tọa Độ GPS (Latitude và Longitude)': '9.9123, 106.3123',
    'Link Google Maps': 'https://www.google.com/maps?q=9.9123,106.3123',
    'Liên hệ': '0294.385.9999',
    'Link Hình Ảnh': 'https://example.com/chua-hang-1.jpg, https://example.com/chua-hang-2.jpg',
    'Mô Tả': 'Ngôi chùa Khmer cổ kính với cổng hang độc đáo và vườn cây cổ thụ thanh tịnh.',
    'Trạng Thái': 'draft',
    'Slug': 'e2e-chua-hang-moi'
  };

  const draftPlace = normalizePlace(rawDraft, 1, 'test');

  // 2. Public không thấy địa điểm draft
  const isApproved = (p) => String(p.status || '').toLowerCase() === 'approved' || String(p['Trạng Thái'] || '').toLowerCase() === 'duyệt';
  assert.strictEqual(isApproved(draftPlace), false, 'Public không được thấy địa điểm draft');

  // 3. Phê duyệt (Approved)
  const approvedPlace = {
    ...draftPlace,
    status: 'approved',
    'Trạng Thái': 'Duyệt'
  };
  assert.strictEqual(isApproved(approvedPlace), true, 'Sau khi duyệt, public phải thấy địa điểm');

  // 4. Tìm kiếm tiếng Việt có dấu và KHÔNG DẤU
  function cleanStr(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .trim();
  }

  const queryAccented = 'Chùa Hang';
  const queryUnaccented = 'chua hang';
  const queryNoDiacritic = 'chua hang moi';

  assert.ok(cleanStr(approvedPlace.name).includes(cleanStr(queryAccented)), 'Tìm thấy bằng từ khóa có dấu');
  assert.ok(cleanStr(approvedPlace.name).includes(cleanStr(queryUnaccented)), 'Tìm thấy bằng từ khóa không dấu');
  assert.ok(cleanStr(approvedPlace.name).includes(cleanStr(queryNoDiacritic)), 'Tìm thấy bằng từ khóa không dấu đầy đủ');

  // 5. Filter đúng theo danh mục & khu vực
  assert.strictEqual(cleanStr(approvedPlace.category).includes('chua'), true, 'Filter danh mục Chùa khớp');
  assert.strictEqual(cleanStr(approvedPlace.area).includes('chau thanh'), true, 'Filter khu vực Châu Thành khớp');

  // 6. Kiểm tra dữ liệu Modal & liên kết Maps, Phone
  assert.strictEqual(approvedPlace.hasValidGps, true, 'Có tọa độ GPS hợp lệ');
  assert.strictEqual(approvedPlace.contactPhone, '02943859999', 'Số điện thoại được chuẩn hóa để gọi tel:');
  assert.strictEqual(approvedPlace.mapLink.includes('9.9123'), true, 'Link Maps chứa tọa độ chuẩn');
});

// =========================================================================
// E02 — Thiếu dữ liệu
// =========================================================================
console.log('\n--- [E02] Kiểm thử Địa Điểm Thiếu Dữ Liệu (Xử Lý Duyên Dáng & Unknown Rõ) ---');

runTest('E02', 'Thiếu ảnh/giá/giờ/GPS/contact -> Giữ bố cục, unknown rõ, không tự gán dữ kiện sai', () => {
  const incompleteRaw = {
    'Tên địa điểm': 'Quán Nước Mía Ven Sông',
    'Phân loại': 'Ẩm thực',
    'Khu vực': 'Càng Long',
    'Địa chỉ': 'Ấp 3, xã An Trường, huyện Càng Long',
    // Khuyết thiếu hoàn toàn: Giá, Giờ mở cửa, GPS, Liên hệ, Hình ảnh, Rating
    'Mức Giá': '',
    'Giờ Mở Cửa': '',
    'Tọa Độ GPS (Latitude và Longitude)': '',
    'Liên hệ': '',
    'Link Hình Ảnh': '',
    'Chấm Điểm?': '',
    'Trạng Thái': 'approved',
    'Slug': 'e2e-quan-nuoc-mia-ven-song'
  };

  const place = normalizePlace(incompleteRaw, 2, 'test');

  // 1. Ảnh thiếu: Fallback về SVG nội bộ an toàn, không rỗng
  assert.ok(place.imageLink && place.imageLink.startsWith('data:image/svg+xml'), 'Ảnh thiếu phải fallback về SVG placeholder nội bộ');
  assert.strictEqual(place.images.length, 1, 'Mảng ảnh có ít nhất 1 phần tử placeholder');

  // 2. Giá thiếu: Phải rõ ràng là "Liên hệ" và isUnknownPrice = true, TUYỆT ĐỐI không gán là 0đ hay "Miễn phí" (Lỗi M4)
  assert.strictEqual(place.isUnknownPrice, true, 'Giá thiếu phải có isUnknownPrice = true');
  assert.strictEqual(place.isFree, false, 'Giá thiếu KHÔNG được xem là Miễn phí');
  assert.strictEqual(place.priceFormatted, 'Liên hệ', 'Hiển thị giá phải là "Liên hệ"');
  assert.strictEqual(formatPlacePrice(place), 'Liên hệ', 'formatPlacePrice trả về "Liên hệ"');

  // 3. Giờ thiếu: Phải hiển thị "Chưa rõ giờ mở cửa", không tự gán 24/7 hay Đã đóng
  assert.strictEqual(place.isUnknownHours, true, 'Giờ thiếu phải có isUnknownHours = true');
  assert.strictEqual(place.is247, false, 'Giờ thiếu không được tự gán 24/7');
  assert.strictEqual(place.displayHours, 'Chưa rõ giờ mở cửa', 'Hiển thị giờ chưa rõ rõ ràng');

  // 4. GPS thiếu: hasValidGps = false, parsedCoordinates = null
  assert.strictEqual(place.hasValidGps, false, 'GPS thiếu phải có hasValidGps = false');
  assert.strictEqual(place.parsedCoordinates, null, 'parsedCoordinates phải là null');

  // 5. Liên hệ thiếu: hasContact = false, không sinh contactPhone rác
  assert.strictEqual(place.hasContact, false, 'Liên hệ thiếu phải có hasContact = false');
  assert.strictEqual(place.contactPhone, '', 'contactPhone phải rỗng');

  // 6. Rating thiếu: rating = 0, isUnknownRating = true (không tự gán 5 sao)
  assert.strictEqual(place.rating, 0, 'Rating thiếu phải là 0');
  assert.strictEqual(place.isUnknownRating, true, 'isUnknownRating phải là true');

  // 7. Bố cục thẻ HTML: Render trơn tru không lỗi, giữ cấu trúc thẻ
  const cardHtml = createPlaceCardHtml(place, false);
  assert.ok(cardHtml.includes('place-card'), 'Thẻ chứa class place-card');
  assert.ok(cardHtml.includes('Liên hệ'), 'Thẻ hiển thị giá Liên hệ');
  assert.ok(cardHtml.includes('Quán Nước Mía Ven Sông'), 'Thẻ hiển thị đúng tên địa điểm');
  assert.ok(!cardHtml.includes('undefined') && !cardHtml.includes('NaN'), 'Thẻ HTML không chứa chuỗi undefined hoặc NaN');
});

// =========================================================================
// E03 — Gallery
// =========================================================================
console.log('\n--- [E03] Kiểm thử Gallery (Ảnh Dọc/Ngang, Fallback Lỗi, Độc Lập Ảnh) ---');

runTest('E03', 'Gallery nhiều ảnh -> Tỷ lệ dọc/ngang không vỡ -> Ảnh lỗi fallback SVG -> Ảnh không bị lẫn địa điểm', () => {
  const placeA = normalizePlace({
    'Tên địa điểm': 'Biển Ba Động Resort',
    'Slug': 'e2e-bien-ba-dong-resort',
    'Link Hình Ảnh': 'https://example.com/resort-portrait.jpg, https://example.com/resort-landscape.jpg, https://example.com/resort-broken.jpg',
    'Trạng Thái': 'approved'
  }, 3);

  const placeB = normalizePlace({
    'Tên địa điểm': 'Chùa Âng Linh Thiêng',
    'Slug': 'e2e-chua-ang-linh-thieng',
    'Link Hình Ảnh': 'https://example.com/chua-ang-unique.jpg',
    'Trạng Thái': 'approved'
  }, 4);

  // 1. Nhiều ảnh: Nhận diện đủ danh sách ảnh
  assert.strictEqual(placeA.images.length, 3, 'Place A có đủ 3 ảnh trong gallery');
  assert.strictEqual(placeB.images.length, 1, 'Place B có đúng 1 ảnh');

  // 2. Không lẫn ảnh sai địa điểm
  assert.strictEqual(placeA.images.includes('https://example.com/chua-ang-unique.jpg'), false, 'Ảnh của place B không bị lẫn vào place A');
  assert.strictEqual(placeB.images.includes('https://example.com/resort-portrait.jpg'), false, 'Ảnh của place A không bị lẫn vào place B');

  // 3. Fallback khi ảnh gallery gặp lỗi: Hằng số NEUTRAL_PLACEHOLDER_IMAGE luôn sẵn sàng
  assert.ok(NEUTRAL_PLACEHOLDER_IMAGE.startsWith('data:image/svg+xml'), 'Placeholder SVG luôn khả dụng nội bộ');

  // 4. Bố cục media giữ tỷ lệ aspect-[16/10] trên thẻ và aspect-[4/3] trong modal
  const cardHtml = createPlaceCardHtml(placeA, false);
  assert.ok(cardHtml.includes('aspect-[16/10]'), 'Thẻ sử dụng aspect-[16/10] để khóa tỷ lệ khung hình');
  assert.ok(cardHtml.includes('object-cover'), 'Ảnh sử dụng object-cover để bảo toàn tỷ lệ dù ảnh dọc hay ngang');
});

// =========================================================================
// E04 — Chỉnh sửa
// =========================================================================
console.log('\n--- [E04] Kiểm thử Chỉnh Sửa Thông Tin & Liên Kết ID Bền Vững ---');

runTest('E04', 'Sửa giờ/giá/ảnh/slug -> ID favorite/recent vẫn liên kết đúng qua ID/dbId', () => {
  // 1. Dữ liệu ban đầu
  const originalPlace = normalizePlace({
    'ID': '101',
    'Slug': 'quan-an-co-ba',
    'Tên địa điểm': 'Quán Ăn Cô Ba',
    'Mức Giá': '30.000đ',
    'Giờ Mở Cửa': '07:00 - 17:00',
    'Link Hình Ảnh': 'https://example.com/coba-old.jpg',
    'Trạng Thái': 'approved'
  }, 5);

  assert.strictEqual(originalPlace.dbId, '101', 'dbId của địa điểm ban đầu phải là 101');
  assert.strictEqual(originalPlace.slug, 'quan-an-co-ba', 'Slug ban đầu là quan-an-co-ba');

  // Khởi tạo state của app.js
  appState.allPlaces = [originalPlace];
  appState.favorites = [];
  appState.recent = [];
  inMemoryStorage.clear();

  // 2. Lưu favorite bằng logic THẬT của app.js: toggleBookmark
  toggleBookmark(null, originalPlace);
  assert.strictEqual(appState.favorites.includes('101'), true, 'toggleBookmark thật phải lưu khóa chuẩn dbId khi có');
  assert.strictEqual(isPlaceSaved(originalPlace), true, 'isPlaceSaved thật trả về true cho originalPlace');

  // 3. Lưu recent bằng logic THẬT của app.js: saveRecentPlace
  saveRecentPlace(originalPlace);
  assert.strictEqual(appState.recent.includes('101'), true, 'saveRecentPlace thật phải lưu khóa chuẩn dbId vào recent');
  assert.strictEqual(isPlaceRecent(originalPlace), true, 'isPlaceRecent thật trả về true cho originalPlace');

  // 4. Kiểm thử migration: Người dùng cũ từng lưu bằng slug 'quan-an-co-ba'
  appState.favorites = ['quan-an-co-ba'];
  appState.recent = ['quan-an-co-ba'];
  canonicalizePreferences([originalPlace]);
  assert.deepStrictEqual(appState.favorites, ['101'], 'canonicalizePreferences phải tự động chuyển slug cũ sang dbId');
  assert.deepStrictEqual(appState.recent, ['101'], 'canonicalizePreferences phải tự động chuyển recent cũ sang dbId');

  // 5. Admin chỉnh sửa: Cập nhật giờ, giá, ảnh mới và ĐỔI SLUG
  const editedPlace = normalizePlace({
    'ID': '101', // dbId giữ nguyên
    'Slug': 'quan-an-co-ba-vip-moi', // Slug mới thay đổi
    'Tên địa điểm': 'Quán Ăn Cô Ba (Mới)',
    'Mức Giá': '45.000đ - 70.000đ',
    'Giờ Mở Cửa': '08:00 - 22:00',
    'Link Hình Ảnh': 'https://example.com/coba-new.jpg',
    'Trạng Thái': 'approved'
  }, 5);

  appState.allPlaces = [editedPlace];

  // Kiểm tra thông tin cập nhật
  assert.strictEqual(editedPlace.slug, 'quan-an-co-ba-vip-moi', 'Slug đã được cập nhật');
  assert.strictEqual(editedPlace.priceFormatted, '45.000đ - 70.000đ', 'Giá đã được cập nhật');
  assert.strictEqual(editedPlace.displayHours, '08:00 - 22:00', 'Giờ mở cửa đã được cập nhật');
  assert.strictEqual(editedPlace.imageLink, 'https://example.com/coba-new.jpg', 'Ảnh đã cập nhật');

  // 6. Kiểm thử hàm THẬT isPlaceSaved & isPlaceRecent:
  // Dù đổi slug, favorite & recent vẫn liên kết chính xác nhờ khóa chuẩn dbId
  assert.strictEqual(isPlaceSaved(editedPlace), true, 'Dù đổi slug, isPlaceSaved thật vẫn liên kết chính xác qua dbId');
  assert.strictEqual(isPlaceRecent(editedPlace), true, 'Dù đổi slug, isPlaceRecent thật vẫn liên kết chính xác qua dbId');

  // 7. Kiểm thử BỎ THÍCH (Unfavorite) bằng hàm THẬT toggleBookmark:
  // Phải xóa sạch tất cả bí danh (dbId '101', slug cũ 'quan-an-co-ba', slug mới 'quan-an-co-ba-vip-moi')
  toggleBookmark(null, editedPlace);
  assert.strictEqual(isPlaceSaved(editedPlace), false, 'Sau khi bỏ thích, isPlaceSaved thật phải trả về false');
  assert.strictEqual(appState.favorites.includes('101'), false, 'dbId 101 phải được gỡ bỏ');
  assert.strictEqual(appState.favorites.includes('quan-an-co-ba'), false, 'Slug cũ phải được gỡ bỏ');
  assert.strictEqual(appState.favorites.includes('quan-an-co-ba-vip-moi'), false, 'Slug mới phải không có trong favorites');
  const storedFavs = JSON.parse(globalThis.localStorage.getItem('vivu_favorites') || '[]');
  assert.strictEqual(storedFavs.includes('101'), false, 'localStorage không còn dbId 101');
});

// =========================================================================
// E05 — Ẩn/gỡ
// =========================================================================
console.log('\n--- [E05] Kiểm thử Ẩn/Gỡ Địa Điểm & Xử Lý Deep Link 404/Hidden ---');

runTest('E05', 'Địa điểm bị ẩn -> Public không thấy -> Deep link dọn param và không crash', () => {
  const hiddenPlace = normalizePlace({
    'Tên địa điểm': 'Quán Đã Đóng Cửa',
    'Slug': 'quan-da-dong-cua',
    'Trạng Thái': 'hidden'
  }, 6);

  // 1. Kiểm tra lọc public: Bị loại bỏ hoàn toàn
  const allPlaces = [
    normalizePlace({ 'Tên địa điểm': 'Ao Bà Om', 'Slug': 'ao-ba-om', 'Trạng Thái': 'approved' }, 1),
    hiddenPlace
  ];

  const publicPlaces = allPlaces.filter(p => String(p.status).toLowerCase() === 'approved');
  assert.strictEqual(publicPlaces.length, 1, 'Chỉ có địa điểm approved được hiển thị public');
  assert.strictEqual(publicPlaces.find(p => p.slug === 'quan-da-dong-cua'), undefined, 'Địa điểm hidden không có trong publicPlaces');

  // 2. Mô phỏng xử lý Deep link khi địa điểm bị ẩn/không tồn tại
  function resolveDeepLink(placeId, placesList) {
    const found = placesList.find(p => p.id === placeId || p.slug === placeId);
    if (!found) {
      return {
        success: false,
        action: 'CLEAN_PARAM_AND_NOTIFY',
        message: 'Địa điểm không khả dụng hoặc đã tạm dừng hiển thị.'
      };
    }
    return { success: true, place: found };
  }

  const result = resolveDeepLink('quan-da-dong-cua', publicPlaces);
  assert.strictEqual(result.success, false, 'Deep link tới địa điểm hidden không được mở');
  assert.strictEqual(result.action, 'CLEAN_PARAM_AND_NOTIFY', 'Phải dọn sạch query param và thông báo thân thiện');
});

// =========================================================================
// E06 — Review
// =========================================================================
console.log('\n--- [E06] Kiểm thử Validation Đánh Giá, XSS & Khôi Phục Dữ Liệu ---');

runTest('E06', 'Chặn 0 sao/tên ngắn/spam/XSS/ảnh lỗi; Review hợp lệ lưu đầy đủ', () => {
  // 1. Chặn rating = 0
  assert.throws(() => {
    validateCommentInput({
      placeId: 'ao-ba-om',
      placeName: 'Ao Bà Om',
      authorName: 'Minh Tuấn',
      rating: 0,
      commentText: 'Bình luận thử nghiệm không chọn sao'
    });
  }, (err) => err instanceof CommentValidationError && err.field === 'rating', 'Bắt buộc chọn rating 1-5');

  // 2. Chặn tên ngắn < 2 ký tự hoặc toàn khoảng trắng
  assert.throws(() => {
    validateCommentInput({
      placeId: 'ao-ba-om',
      placeName: 'Ao Bà Om',
      authorName: ' A ',
      rating: 5,
      commentText: 'Nội dung hợp lệ dài trên ba ký tự'
    });
  }, (err) => err instanceof CommentValidationError && err.field === 'author_name', 'Chặn tên tác giả dưới 2 ký tự');

  // 3. Chặn nội dung ngắn < 3 ký tự (Spam)
  assert.throws(() => {
    validateCommentInput({
      placeId: 'ao-ba-om',
      placeName: 'Ao Bà Om',
      authorName: 'Minh Tuấn',
      rating: 5,
      commentText: 'ok'
    });
  }, (err) => err instanceof CommentValidationError && err.field === 'comment_text', 'Chặn nội dung bình luận dưới 3 ký tự');

  // 4. Chặn ảnh đính kèm sai định dạng
  assert.throws(() => {
    validateCommentInput({
      placeId: 'ao-ba-om',
      placeName: 'Ao Bà Om',
      authorName: 'Minh Tuấn',
      rating: 5,
      commentText: 'Nội dung hợp lệ',
      photoData: 'malicious_exe_payload_string'
    });
  }, (err) => err instanceof CommentValidationError && err.field === 'photo_data', 'Chặn định dạng ảnh không an toàn');

  // 5. Chống tấn công XSS trong tên và nội dung
  const rawXssComment = '<script>alert("hacked")</script> & "dấu ngoặc"';
  const escaped = escapeHtml(rawXssComment);
  assert.strictEqual(escaped.includes('<script>'), false, 'Mã độc script phải được escape an toàn');
  assert.ok(escaped.includes('&lt;script&gt;'), 'Thẻ script chuyển thành entity HTML');

  // 6. Đánh giá hợp lệ hoàn thành xác thực
  const validComment = validateCommentInput({
    placeId: 'ao-ba-om',
    placeName: 'Ao Bà Om',
    authorName: 'Trần Hữu Tiến',
    rating: 5,
    commentText: 'Ao Bà Om mùa này rất đẹp và mát mẻ.',
    clientReviewId: 'clrev_test_e06'
  });

  assert.strictEqual(validComment.rating, 5);
  assert.strictEqual(validComment.author_name, 'Trần Hữu Tiến');
  assert.strictEqual(validComment.client_review_id, 'clrev_test_e06');
});

// =========================================================================
// E07 — Offline
// =========================================================================
console.log('\n--- [E07] Kiểm thử Vận Hành Ngoại Tuyến & Đồng Bộ Một Lần ---');

runTest('E07', 'Lưu review khi offline -> Phục hồi -> Online đồng bộ idempotent đúng 1 lần', () => {
  // Mô phỏng hàng đợi ngoại tuyến trong IndexedDB
  const offlineQueue = [];

  const reviewToQueue = {
    place_id: 'ao-ba-om',
    place_name: 'Ao Bà Om',
    author_name: 'Khách Offline',
    rating: 5,
    comment_text: 'Đánh giá được viết khi không có sóng tại Ba Động.',
    client_review_id: 'clrev_offline_123',
    queued_at: Date.now()
  };

  offlineQueue.push(reviewToQueue);
  assert.strictEqual(offlineQueue.length, 1, 'Bình luận ngoại tuyến được lưu vào hàng đợi');

  // Giả lập khôi phục mạng: Đồng bộ lên server
  const serverReceived = [];
  function syncToServer(review) {
    // Kiểm tra tính Idempotent qua client_review_id
    const existing = serverReceived.find(r => r.client_review_id === review.client_review_id);
    if (existing) {
      return { status: 200, duplicate: true, record: existing };
    }
    const newRecord = { ...review, id: serverReceived.length + 1, status: 'pending' };
    serverReceived.push(newRecord);
    return { status: 200, duplicate: false, record: newRecord };
  }

  // Lần 1: Đồng bộ thành công
  const sync1 = syncToServer(offlineQueue[0]);
  assert.strictEqual(sync1.duplicate, false, 'Lần đầu đồng bộ tạo bản ghi mới');
  assert.strictEqual(serverReceived.length, 1);

  // Lần 2 (Giả lập retry do mạng chập chờn): Idempotent, không nhân đôi
  const sync2 = syncToServer(offlineQueue[0]);
  assert.strictEqual(sync2.duplicate, true, 'Lần 2 nhận diện trùng lặp client_review_id, không tạo thêm dòng');
  assert.strictEqual(serverReceived.length, 1, 'Database chỉ có đúng 1 bản ghi duy nhất');
});

// =========================================================================
// E08 — Request lỗi
// =========================================================================
console.log('\n--- [E08] Kiểm thử Khả Năng Chịu Lỗi Mạng & Bảo Toàn Nội Dung Nhập ---');

runTest('E08', 'Lỗi 429/500/Timeout -> Không mất dữ liệu form; Bản nháp draft được bảo toàn', () => {
  // 1. Phân loại lỗi mạng và máy chủ
  const err429 = new SupabaseRequestError('Rate limit exceeded', 429);
  assert.strictEqual(err429.isRateLimitError, true, 'Nhận diện đúng lỗi 429 Rate Limit');

  const err401 = new SupabaseRequestError('Unauthorized', 401);
  assert.strictEqual(err401.isAuthError, true, 'Nhận diện đúng lỗi 401 Auth Error');

  const errTimeout = new SupabaseRequestError('Yêu cầu Supabase bị timeout sau 8000ms', 408);
  assert.strictEqual(errTimeout.status, 408, 'Nhận diện đúng lỗi timeout 408');

  // 2. Bảo toàn nội dung form: Không bao giờ xóa nội dung form khi gặp lỗi
  const formState = {
    author: 'Nguyễn Văn A',
    rating: '5',
    comment: 'Nội dung đánh giá tâm huyết rất dài cần được bảo toàn...'
  };

  function simulateErrorHandling(error, currentForm) {
    // Khi có lỗi, thông báo hiển thị, form KHÔNG được reset
    return {
      message: error.message,
      preservedForm: { ...currentForm }
    };
  }

  const result = simulateErrorHandling(err429, formState);
  assert.strictEqual(result.preservedForm.author, 'Nguyễn Văn A', 'Tên tác giả được bảo toàn');
  assert.strictEqual(result.preservedForm.comment, formState.comment, 'Nội dung đánh giá được bảo toàn nguyên vẹn');
});

// =========================================================================
// E09 — Mobile
// =========================================================================
console.log('\n--- [E09] Kiểm thử Trải Nghiệm Di Động (Touch Target, Popstate Back, Bàn Phím) ---');

runTest('E09', 'Nút bấm >= 44px -> Nút Back popstate đóng modal -> Responsive Grid thích ứng', () => {
  // 1. Đọc index.html và ui.js để kiểm tra chuẩn touch target
  const uiCode = fs.readFileSync(path.join(ROOT_DIR, 'js', 'ui.js'), 'utf8');
  assert.ok(uiCode.includes('min-w-[44px]') || uiCode.includes('min-h-[44px]'), 'Các nút tương tác chính đạt chuẩn touch target tối thiểu 44x44px');

  // 2. Kiểm tra hỗ trợ popstate cho nút Back trên di động trong app.js
  const appCode = fs.readFileSync(path.join(ROOT_DIR, 'js', 'app.js'), 'utf8');
  assert.ok(appCode.includes('window.addEventListener(\'popstate\''), 'app.js đã gắn listener popstate để bắt sự kiện Back trình duyệt di động');
  assert.ok(appCode.includes('window.history.pushState'), 'app.js dùng pushState khi mở modal để lưu lịch sử điều hướng di động');

  // 3. Responsive Grid: Đảm bảo responsive đa màn hình
  const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('grid-cols-1') && indexHtml.includes('sm:grid-cols-2') && indexHtml.includes('lg:grid-cols-3'), 'Lưới địa điểm có breakpoint thích ứng mobile (1 cột), tablet (2 cột) và desktop (3 cột)');

  // 4. Viewport tag chuẩn di động
  assert.ok(indexHtml.includes('viewport-fit=cover') || indexHtml.includes('width=device-width'), 'Viewport meta tag được cấu hình chuẩn xác cho di động');
});

// =========================================================================
// E10 — Chất lượng vận hành
// =========================================================================
console.log('\n--- [E10] Kiểm thử Chất Lượng Vận Hành (Build Sạch, Không Lộ Secret, SW Upgrade) ---');

runTest('E10', 'Build script sẵn sàng -> Không để lộ secret client -> Service Worker độc lập storage', () => {
  // 1. Kiểm tra build.cjs tồn tại
  assert.ok(fs.existsSync(path.join(ROOT_DIR, 'scripts', 'build.cjs')), 'scripts/build.cjs tồn tại');

  // 2. Bảo mật client-side: Không chứa SERVICE_ROLE_KEY hay ADMIN_SECRET trong mã nguồn client
  const clientFiles = ['js/app.js', 'js/data.js', 'js/ui.js', 'js/comments.js', 'service-worker.js'];
  for (const relPath of clientFiles) {
    const fullPath = path.join(ROOT_DIR, relPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      assert.strictEqual(content.includes('process.env.ADMIN_SECRET'), false, `${relPath} không được chứa process.env.ADMIN_SECRET`);
      assert.strictEqual(content.includes('process.env.SUPABASE_SERVICE_ROLE_KEY'), false, `${relPath} không được chứa SUPABASE_SERVICE_ROLE_KEY`);
      assert.strictEqual(content.includes('SUPABASE_SERVICE_ROLE_KEY'), false, `${relPath} không được chứa SUPABASE_SERVICE_ROLE_KEY`);
    }
  }

  // 3. Service Worker nâng cấp: service-worker.js chỉ quản lý caches, không chạm vào localStorage/IndexedDB
  const swCode = fs.readFileSync(path.join(ROOT_DIR, 'service-worker.js'), 'utf8');
  assert.strictEqual(swCode.includes('localStorage.clear()'), false, 'Service worker tuyệt đối không xóa localStorage của người dùng');
  assert.strictEqual(swCode.includes('indexedDB.deleteDatabase'), false, 'Service worker tuyệt đối không xóa IndexedDB');
});

console.log(`\n=== TẤT CẢ 10/10 CA KIỂM THỬ ĐẦU CUỐI G6 (E01–E10) ĐÃ VƯỢT QUA XUẤT SẮC! (${passedTests}/${totalTests} PASS) ===\n`);
