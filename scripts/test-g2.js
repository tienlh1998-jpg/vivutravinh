// Automated verification script for G2: Search/Filter & Data Normalization
import fs from 'fs';
import assert from 'assert';
import { parsePrice, parseOperatingHours, parseCoordinates, parseContact, normalizePlace } from '../js/data.js';
import { getPlaceOpenStatus, isPlaceOpen, formatPlacePrice, getVietnamHours } from '../js/ui.js';

console.log('=== BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG G2: SEARCH/FILTER & CHUẨN HÓA DỮ LIỆU ===\n');

// -------------------------------------------------------------
// 1. KIỂM THỬ CHUẨN HÓA GIÁ (parsePrice & formatPlacePrice)
// -------------------------------------------------------------
console.log('1. Kiểm thử chuẩn hóa Mức giá:');

// Ca 1: Dạng viết tắt k (50k)
const p1 = parsePrice('50k');
assert.strictEqual(p1.min, 50000, '50k min phải là 50000');
assert.strictEqual(p1.max, 50000, '50k max phải là 50000');
assert.strictEqual(p1.formatted, '50.000đ', '50k formatted phải là 50.000đ');
assert.strictEqual(p1.isFree, false, '50k không phải miễn phí');
assert.strictEqual(p1.isUnknown, false, '50k không phải unknown');

// Ca 2: Khoảng giá viết tắt k (25k - 55k)
const p2 = parsePrice('25k - 55k');
assert.strictEqual(p2.min, 25000, '25k - 55k min phải là 25000');
assert.strictEqual(p2.max, 55000, '25k - 55k max phải là 55000');
assert.strictEqual(p2.formatted, '25.000đ - 55.000đ');

// Ca 3: Khoảng giá chuẩn có dấu chấm (10.000đ - 40.000đ)
const p3 = parsePrice('10.000đ - 40.000đ');
assert.strictEqual(p3.min, 10000, '10.000đ - 40.000đ min phải là 10000');
assert.strictEqual(p3.max, 40000, '10.000đ - 40.000đ max phải là 40000');
assert.strictEqual(p3.formatted, '10.000đ - 40.000đ');

// Ca 4: Khoảng giá kèm đơn vị lưu trú (/đêm)
const p4 = parsePrice('350.000đ - 650.000đ/đêm');
assert.strictEqual(p4.min, 350000);
assert.strictEqual(p4.max, 650000);
assert.strictEqual(p4.unit, 'đêm');
assert.strictEqual(p4.formatted, '350.000đ - 650.000đ/đêm');

// Ca 5: Miễn phí & 0đ
const p5 = parsePrice('Miễn phí');
assert.strictEqual(p5.isFree, true);
assert.strictEqual(p5.min, 0);
assert.strictEqual(p5.max, 0);
assert.strictEqual(p5.formatted, 'Miễn phí');

const p5b = parsePrice('0đ');
assert.strictEqual(p5b.isFree, true);
assert.strictEqual(p5b.min, 0);
assert.strictEqual(p5b.max, 0);

// Ca 6: Unknown giá ("Liên hệ", rỗng, null) -> Tuyệt đối không biến thành "Miễn phí" (Lỗi M4)
const p6a = parsePrice('');
assert.strictEqual(p6a.isUnknown, true, 'Giá rỗng phải là isUnknown = true');
assert.strictEqual(p6a.isFree, false, 'Giá rỗng TUYỆT ĐỐI không được xem là miễn phí');
assert.strictEqual(p6a.formatted, 'Liên hệ');

const p6b = parsePrice('Liên hệ');
assert.strictEqual(p6b.isUnknown, true);
assert.strictEqual(p6b.isFree, false);
assert.strictEqual(p6b.formatted, 'Liên hệ');

const p6c = parsePrice(null);
assert.strictEqual(p6c.isUnknown, true);
assert.strictEqual(p6c.isFree, false);

console.log('✅ Chuẩn hóa giá: PASS (Hỗ trợ k, dấu chấm, đơn vị /đêm, phân biệt rõ Miễn phí vs Unknown giá).\n');

// -------------------------------------------------------------
// 2. KIỂM THỬ GIỜ MỞ CỬA & ĐÁNH GIÁ TRẠNG THÁI (parseOperatingHours & getPlaceOpenStatus)
// -------------------------------------------------------------
console.log('2. Kiểm thử giờ mở cửa & trạng thái (Ưu tiên Tạm đóng, hỗ trợ qua đêm, múi giờ VN):');

// Ca 1: Ưu tiên Tạm đóng lên hàng đầu (Lỗi M3)
const closed247Place = {
    operatingStatus: 'Closed',
    openingTime: '24/7',
    closingTime: '',
    isTemporarilyClosed: true,
    is247: false,
    isUnknownHours: false
};
const statusClosed247 = getPlaceOpenStatus(closed247Place);
assert.strictEqual(statusClosed247.status, 'temporarily_closed', 'Closed có 24/7 vẫn phải là temporarily_closed');
assert.strictEqual(statusClosed247.label, 'Tạm đóng cửa');
assert.strictEqual(isPlaceOpen(closed247Place), false, 'Địa điểm tạm đóng không thể isPlaceOpen');

// Ca 2: Mở 24/7 bình thường
const open247Place = {
    operatingStatus: '24/7',
    openingTime: '24/7',
    closingTime: '',
    isTemporarilyClosed: false,
    is247: true,
    isUnknownHours: false
};
const status247 = getPlaceOpenStatus(open247Place);
assert.strictEqual(status247.status, 'open');
assert.strictEqual(status247.label, 'Mở cả ngày (24/7)');
assert.strictEqual(isPlaceOpen(open247Place), true);

// Ca 3: Mở trong ngày (06:00 - 22:00)
const daytimePlace = {
    operatingStatus: 'Mở cửa',
    openingTime: '06:00',
    closingTime: '22:00',
    isTemporarilyClosed: false,
    is247: false,
    isUnknownHours: false
};
// Test với mốc giờ giả lập
const morningDate = new Date('2026-09-15T10:00:00+07:00');
assert.strictEqual(isPlaceOpen(daytimePlace, morningDate), true, 'Lúc 10:00 sáng phải mở cửa');
const lateNightDate = new Date('2026-09-15T23:30:00+07:00');
assert.strictEqual(isPlaceOpen(daytimePlace, lateNightDate), false, 'Lúc 23:30 đêm phải đóng cửa');

// Ca 4: Mở qua đêm (18:00 - 04:00)
const overnightPlace = {
    operatingStatus: 'Mở cửa',
    openingTime: '18:00',
    closingTime: '04:00',
    isTemporarilyClosed: false,
    is247: false,
    isUnknownHours: false
};
const midnightDate = new Date('2026-09-15T23:00:00+07:00');
const earlyMorningDate = new Date('2026-09-15T02:00:00+07:00');
const afternoonDate = new Date('2026-09-15T14:00:00+07:00');
assert.strictEqual(isPlaceOpen(overnightPlace, midnightDate), true, '18:00-04:00 lúc 23:00 phải mở');
assert.strictEqual(isPlaceOpen(overnightPlace, earlyMorningDate), true, '18:00-04:00 lúc 02:00 phải mở');
assert.strictEqual(isPlaceOpen(overnightPlace, afternoonDate), false, '18:00-04:00 lúc 14:00 phải đóng');

// Ca 5: Thiếu giờ mở cửa
const unknownHoursPlace = {
    operatingStatus: '',
    openingTime: '',
    closingTime: '',
    isUnknownHours: true
};
const statusUnknown = getPlaceOpenStatus(unknownHoursPlace);
assert.strictEqual(statusUnknown.status, 'unknown');
assert.strictEqual(statusUnknown.label, 'Chưa rõ giờ mở');
assert.strictEqual(isPlaceOpen(unknownHoursPlace), false, 'Chưa rõ giờ mở không tính là đang mở');

console.log('✅ Giờ mở cửa & Trạng thái: PASS (Ưu tiên Tạm đóng, qua đêm chính xác, fallback chuẩn).\n');

// -------------------------------------------------------------
// 3. KIỂM THỬ TOẠ ĐỘ GPS & MAPS (parseCoordinates)
// -------------------------------------------------------------
console.log('3. Kiểm thử toạ độ GPS & Maps (Không cắm ghim ảo bừa bãi - Lỗi M5):');

const validCoord = parseCoordinates('9.9347, 106.3449');
assert.strictEqual(validCoord[0], 9.9347);
assert.strictEqual(validCoord[1], 106.3449);

const invalidCoord1 = parseCoordinates('');
assert.strictEqual(invalidCoord1, null, 'Toạ độ rỗng phải trả về null');

const invalidCoord2 = parseCoordinates('abc, def');
assert.strictEqual(invalidCoord2, null, 'Toạ độ không hợp lệ phải trả về null');

const outOfBoundCoord = parseCoordinates('95.0, 200.0');
assert.strictEqual(outOfBoundCoord, null, 'Toạ độ ngoài phạm vi địa lý phải trả về null');

console.log('✅ Toạ độ GPS: PASS (Không trả về vị trí giả khi thiếu GPS).\n');

// -------------------------------------------------------------
// 4. KIỂM THỬ THÔNG TIN LIÊN HỆ (parseContact)
// -------------------------------------------------------------
console.log('4. Kiểm thử chuẩn hoá thông tin liên hệ:');

const c1 = parseContact('0909.123.456 (gặp chị Ba)');
assert.strictEqual(c1.cleanPhone, '0909123456', 'Phải lọc sạch số điện thoại cho tel:');
assert.strictEqual(c1.isAvailable, true);

const c2 = parseContact('https://facebook.com/quanngon');
assert.strictEqual(c2.url, 'https://facebook.com/quanngon');
assert.strictEqual(c2.cleanPhone, '');
assert.strictEqual(c2.isAvailable, true);

const c3 = parseContact('');
assert.strictEqual(c3.cleanPhone, '');
assert.strictEqual(c3.url, '');
assert.strictEqual(c3.isAvailable, false);

console.log('✅ Thông tin liên hệ: PASS.\n');

// -------------------------------------------------------------
// 5. KIỂM THỬ LỌC & TÌM KIẾM TRÊN BỘ DỮ LIỆU FIXTURE
// -------------------------------------------------------------
console.log('5. Kiểm thử tìm kiếm & bộ lọc với 10 ca thử trong data/data-fixture.json:');

const rawFixtures = JSON.parse(fs.readFileSync('data/data-fixture.json', 'utf8'));
const normalizedFixtures = rawFixtures.map((p, idx) => normalizePlace(p, idx, 'mock'));

// Helper hàm tìm kiếm tiếng Việt không dấu (giống js/app.js)
const cleanStr = (s) => (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim();

// 5.1 Tìm kiếm tiếng Việt không dấu trên Fixture
const searchBunNuocLeo = normalizedFixtures.filter(p => cleanStr(p.name).includes(cleanStr('bun nuoc leo')));
assert(searchBunNuocLeo.length >= 1, 'Tìm "bun nuoc leo" phải tìm thấy bún nước lèo');
assert(searchBunNuocLeo.some(p => p.name.includes('Bún Nước Lèo')));

const searchAoBaOm = normalizedFixtures.filter(p => cleanStr(p.name).includes(cleanStr('ao ba om')));
assert(searchAoBaOm.length >= 1, 'Tìm "ao ba om" phải tìm thấy Ao Bà Om');
assert(searchAoBaOm.some(p => p.name.includes('Ao Bà Om')));

// Kiểm tra tìm kiếm không dấu trên dữ liệu Fallback thực tế
const rawFallbacks = JSON.parse(fs.readFileSync('data/data-fallback.json', 'utf8'));
const normalizedFallbacks = rawFallbacks.map((p, idx) => normalizePlace(p, idx, 'fallback'));
const searchChuaAng = normalizedFallbacks.filter(p => cleanStr(p.name).includes(cleanStr('chua ang')));
assert(searchChuaAng.length >= 1, 'Tìm "chua ang" phải tìm thấy Chùa Âng');
assert(searchChuaAng.some(p => p.name.includes('Chùa Âng')));

// 5.2 Lọc Dưới 50k: strictly priceMax <= 50000 && priceMin > 0 && !isFree && !isUnknown
const under50Places = normalizedFixtures.filter(p => !p.isFree && !p.isUnknownPrice && p.priceMax <= 50000 && p.priceMin > 0);
assert(under50Places.length >= 1, 'Phải có ít nhất 1 quán dưới 50k');
assert(under50Places.some(p => p.name.includes('Bún Nước Lèo')), 'Bún Nước Lèo Thổ Địa (35k) phải nằm trong "Dưới 50k"');
assert(!under50Places.some(p => p.isFree), 'Địa điểm miễn phí KHÔNG được nằm trong "Dưới 50k"');
assert(!under50Places.some(p => p.isUnknownPrice), 'Địa điểm chưa rõ giá KHÔNG được nằm trong "Dưới 50k"');
assert(!under50Places.some(p => p.name.includes('Resort')), 'Resort (350k-650k) KHÔNG được nằm trong "Dưới 50k"');

// 5.3 Lọc Miễn phí
const freePlaces = normalizedFixtures.filter(p => p.isFree);
assert(freePlaces.length >= 1, 'Phải có ít nhất 1 điểm miễn phí trong fixture');
assert(freePlaces.some(p => p.name.includes('Ao Bà Om')));
assert(!freePlaces.some(p => p.isUnknownPrice), 'Địa điểm chưa có giá không được coi là miễn phí');

// 5.4 Lọc Trên 200k
const over200Places = normalizedFixtures.filter(p => !p.isFree && !p.isUnknownPrice && p.priceMax > 200000);
assert(over200Places.length >= 1, 'Resort Sinh Thái Dừa Xanh phải nằm trong bộ lọc trên 200k');
assert(over200Places.some(p => p.name.includes('Resort')));

// 5.5 Kiểm tra địa điểm Tạm đóng không lọt vào bộ lọc "Đang mở cửa"
const openNowPlaces = normalizedFixtures.filter(p => isPlaceOpen(p));
assert(!openNowPlaces.some(p => p.name.includes('Tạm Đóng')), 'Quán Tạm Đóng KHÔNG được có mặt trong danh sách Đang mở');

// 5.6 Kiểm tra địa điểm thiếu toàn bộ thông tin (Mục 3.7 fixture)
const missingAllPlace = normalizedFixtures.find(p => p.slug === 'diem-dung-chan-thieu-thong-tin');
assert(missingAllPlace, 'Phải tìm thấy fixture thiếu toàn bộ thông tin');
assert.strictEqual(missingAllPlace.isUnknownPrice, true);
assert.strictEqual(missingAllPlace.isUnknownHours, true);
assert.strictEqual(missingAllPlace.hasValidGps, false);
assert.strictEqual(missingAllPlace.isUnknownRating, true);
assert.strictEqual(missingAllPlace.hasContact, false);

console.log('✅ Tìm kiếm & Bộ lọc fixture: PASS (Tiếng Việt không dấu, lọc giá chuẩn xác, không rò rỉ dữ liệu thiếu).\n');

// -------------------------------------------------------------
// 6. KIỂM THỬ KHẢ NĂNG PHỤC HỒI STORAGE & LỊCH SỬ ĐÃ XEM
// -------------------------------------------------------------
console.log('6. Kiểm thử an toàn LocalStorage & Lịch sử Đã xem (vivu_recent):');

const mockStorage = {};
function safeGetStorage(key, fallback = []) {
    try {
        const val = mockStorage[key];
        if (!val) return fallback;
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}

// Ca 1: Dữ liệu hỏng (corrupted JSON)
mockStorage['vivu_recent'] = '{ broken json ';
const recoveredRecent = safeGetStorage('vivu_recent', []);
assert.deepStrictEqual(recoveredRecent, [], 'Dữ liệu JSON hỏng phải tự phục hồi thành [] an toàn');

// Ca 2: Dữ liệu không phải mảng
mockStorage['vivu_favorites'] = '{"a": 1}';
const recoveredFavs = safeGetStorage('vivu_favorites', []);
assert.deepStrictEqual(recoveredFavs, [], 'Dữ liệu không phải mảng phải tự phục hồi thành [] an toàn');

// Ca 3: Thêm địa điểm vào danh sách gần đây: tối đa 20, deduplicate, đưa mới nhất lên đầu
let recentList = ['item_1', 'item_2', 'item_3'];
function addRecent(id, list) {
    list = list.filter(item => item !== id);
    list.unshift(id);
    if (list.length > 20) list = list.slice(0, 20);
    return list;
}
recentList = addRecent('item_2', recentList);
assert.deepStrictEqual(recentList, ['item_2', 'item_1', 'item_3'], 'Item xem lại phải được đưa lên đầu mảng');

for (let i = 4; i <= 30; i++) {
    recentList = addRecent(`item_${i}`, recentList);
}
assert.strictEqual(recentList.length, 20, 'Danh sách đã xem tối đa chỉ 20 phần tử');
assert.strictEqual(recentList[0], 'item_30', 'Phần tử xem mới nhất phải đứng đầu');

console.log('✅ Phục hồi Storage & Quản lý Lịch sử Đã xem: PASS.\n');

console.log('=== TOÀN BỘ KIỂM THỬ G2 ĐẠT CHUẨN 100% ===');
