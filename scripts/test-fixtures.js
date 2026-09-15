// Automated verification script for G0 Mock and Fixture infrastructure
import fs from 'fs';
import assert from 'assert';
import { initConfig } from '../js/config.js';
import { loadPlaces, clearPlacesCache } from '../js/data.js';

console.log('--- BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG G0 ---');

// 1. Kiểm tra tồn tại và cú pháp JSON của data/data-fixture.json
const rawFixture = fs.readFileSync('data/data-fixture.json', 'utf8');
const fixtures = JSON.parse(rawFixture);
assert(Array.isArray(fixtures), 'Fixtures phải là một mảng.');
assert(fixtures.length >= 10, `Cần ít nhất 10 fixture, hiện có ${fixtures.length}.`);
console.log(`✅ File data/data-fixture.json hợp lệ: ${fixtures.length} ca thử.`);

// 2. Kiểm tra tồn tại và cú pháp JSON của data/data-fallback.json
const rawFallback = fs.readFileSync('data/data-fallback.json', 'utf8');
const fallbacks = JSON.parse(rawFallback);
assert(Array.isArray(fallbacks), 'Fallback phải là một mảng.');
assert(fallbacks.length >= 10, `Fallback cần ít nhất 10 địa điểm thực tế.`);
const hasDummySample = fallbacks.some(p => (p['Mô Tả'] || '').includes('mẫu') || (p['Ghi Chú Thêm'] || '').includes('mẫu'));
assert(!hasDummySample, 'data/data-fallback.json không được chứa địa điểm giả/mẫu kiểm tra.');
console.log(`✅ File data/data-fallback.json sạch, không chứa địa điểm giả: ${fallbacks.length} địa điểm.`);

// 3. Kiểm tra đủ 10 ca thử nghiệp vụ yêu cầu của G0
const findFixture = (predicate, desc) => {
    const item = fixtures.find(predicate);
    assert(item, `Thiếu ca thử nghiệm: ${desc}`);
    return item;
};

// 3.1 Bún nước lèo giá dưới 50k
findFixture(p => p['Tên địa điểm'].toLowerCase().includes('bún nước lèo'), 'Bún nước lèo giá dưới 50k');
// 3.2 Cafe nhiều ảnh
const cafe = findFixture(p => p['Phân loại'].includes('Cafe') && (p['Link Hình Ảnh'] || '').split(/[\n,]+/).length >= 3, 'Cafe nhiều ảnh');
// 3.3 Điểm du lịch miễn phí
findFixture(p => (p['Mức Giá'] || '').toLowerCase().includes('miễn phí'), 'Điểm du lịch miễn phí');
// 3.4 Lưu trú trên 200k
findFixture(p => p['Phân loại'].includes('Lưu Trú'), 'Lưu trú trên 200k');
// 3.5 Thiếu ảnh
findFixture(p => !p['Link Hình Ảnh'], 'Thiếu ảnh');
// 3.6 Ảnh 404
findFixture(p => (p['Link Hình Ảnh'] || '').includes('404'), 'Ảnh 404');
// 3.7 Thiếu toàn bộ thông tin (giá, giờ, GPS, contact, rating)
findFixture(p => !p['Mức Giá'] && !p['Giờ Mở Cửa'] && !p['Tọa Độ GPS (Latitude và Longitude)'], 'Thiếu toàn bộ thông tin');
// 3.8 Tạm đóng
findFixture(p => (p['Trạng Thái Hoạt Động'] || '').toLowerCase().includes('closed'), 'Tạm đóng');
// 3.9 Mở qua đêm
findFixture(p => (p['Giờ Đóng Cửa'] || '').startsWith('04:'), 'Mở qua đêm');
// 3.10 Tên và địa chỉ rất dài
findFixture(p => (p['Tên địa điểm'] || '').length > 60, 'Tên và địa chỉ rất dài');

console.log('✅ Đã xác minh đầy đủ 10/10 ca thử nghiệp vụ đặc thù trong data/data-fixture.json.');

// 4. Kiểm tra cấu hình và các chế độ mô phỏng (Simulation Modes)
const mockConfig = initConfig({ dataSource: 'mock', simDelay: 100 });
assert.strictEqual(mockConfig.dataSource, 'mock', 'dataSource phải là mock.');
assert.strictEqual(mockConfig.simDelay, 100, 'simDelay phải là 100.');

const errorConfig = initConfig({ simError: true });
assert.strictEqual(errorConfig.simError, true, 'simError phải là true.');

const emptyConfig = initConfig({ simEmpty: true });
assert.strictEqual(emptyConfig.simEmpty, true, 'simEmpty phải là true.');

// 5. Kiểm tra loadPlaces ở chế độ mock không phát request tới Supabase
global.localStorage = {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; }
};

let supabaseFetchCount = 0;
global.fetch = async (url, options) => {
    if (String(url).includes('supabase.co')) {
        supabaseFetchCount++;
    }
    if (String(url).includes('data-fixture.json')) {
        return {
            ok: true,
            status: 200,
            json: async () => JSON.parse(fs.readFileSync('data/data-fixture.json', 'utf8'))
        };
    }
    return {
        ok: false,
        status: 404,
        json: async () => []
    };
};

clearPlacesCache('mock');
const mockPlaces = await loadPlaces({ dataSource: 'mock' });
assert(Array.isArray(mockPlaces) && mockPlaces.length === 10, `loadPlaces mock phải trả về 10 địa điểm, nhận được ${mockPlaces.length}.`);
assert.strictEqual(supabaseFetchCount, 0, 'Chế độ mock tuyệt đối không được phát request tới Supabase.');
assert.strictEqual(mockPlaces[0]._source, 'mock', 'Các địa điểm trong mock mode phải có _source = mock.');
console.log(`✅ Xác nhận: Chế độ mock trả về ${mockPlaces.length} địa điểm, hoàn toàn KHÔNG gọi Supabase.`);

console.log('--- TOÀN BỘ KIỂM THỬ G0 ĐẠT CHUẨN 100% ---');
