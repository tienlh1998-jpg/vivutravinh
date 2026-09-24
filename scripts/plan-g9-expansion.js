// scripts/plan-g9-expansion.js
// Lập Kế Hoạch & Chuẩn Bị Dry-Run Mở Rộng Dữ Liệu Thật G9.4 (5 Ứng Viên)
// Chế độ hoàn toàn READ-ONLY / DRY-RUN (Zero Mutation). Chặn đứng mọi thao tác ghi trên production.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { validatePlace } from '../js/place-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const BACKUPS_DIR = path.join(ROOT_DIR, 'backups');
const DATA_DIR = path.join(ROOT_DIR, 'data');

export const EXPANSION_CANDIDATE_SLUGS = Object.freeze([
  'bien-ba-dong',
  'den-tho-bac-ho-tra-vinh',
  'chua-hang',
  'con-chim',
  'chua-vam-ray'
]);

/**
 * Đọc file .env.live.tmp an toàn nếu môi trường chưa có key
 */
export function loadLiveEnvConfig() {
  const env = { ...process.env };
  const envPath = path.join(ROOT_DIR, '.env.live.tmp');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)?\s*$/);
      if (m && !env[m[1]]) {
        env[m[1]] = m[2].replace(/^['\"]|['\"]$/g, '').trim();
      }
    });
  }
  return env;
}

/**
 * Tính toán mã băm SHA-256 xác định từ đối tượng JSON
 */
export function computeRecordChecksum(record) {
  if (!record || typeof record !== 'object') return '';
  const sortedKeys = Object.keys(record).sort();
  const sortedObj = {};
  for (const k of sortedKeys) {
    sortedObj[k] = record[k];
  }
  return crypto.createHash('sha256').update(JSON.stringify(sortedObj)).digest('hex');
}

/**
 * Đọc toàn bộ danh sách địa điểm hiện có trên Supabase để kiểm tra trùng lặp
 */
export async function loadLiveProductionData(options = {}) {
  const env = options.env || loadLiveEnvConfig();
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;

  if (options.mockData) {
    return {
      source: 'mock',
      allPlaces: options.mockData.allPlaces || [],
      placeId2: options.mockData.placeId2 || null
    };
  }

  if (!supabaseUrl || !serviceKey) {
    throw new Error('CONFIG_MISSING: Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY để đọc production.');
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/places?select=*&order=id.asc`, {
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`
    }
  });

  if (!res.ok) {
    throw new Error(`SUPABASE_FETCH_FAILED: HTTP ${res.status} ${res.statusText}`);
  }

  const allPlaces = await res.json();
  const placeId2 = allPlaces.find(p => p.id === 2) || null;

  return {
    source: 'live_supabase',
    allPlaces,
    placeId2
  };
}

/**
 * Kiểm tra va chạm slug và tọa độ
 */
export function checkCollisions(existingPlaces, candidatePlaces) {
  const collisions = {
    slugCollisions: [],
    coordinateCollisions: []
  };

  const existingSlugMap = new Map();
  for (const p of existingPlaces) {
    existingSlugMap.set(p.slug, p);
  }

  // Đối chiếu từng ứng viên mới
  for (const cand of candidatePlaces) {
    // 1. Kiểm tra slug: nếu là tạo mới (không phải ID 2) mà trùng slug trong DB thì báo va chạm
    if (cand.actionType === 'create') {
      if (existingSlugMap.has(cand.slug)) {
        collisions.slugCollisions.push({
          slug: cand.slug,
          collidedWithId: existingSlugMap.get(cand.slug).id,
          name: cand.name
        });
      }
    }

    // 2. Kiểm tra tọa độ: tìm khoảng cách tới các điểm hiện có
    if (cand.coordinates) {
      const [candLat, candLng] = cand.coordinates.split(',').map(s => Number.parseFloat(s.trim()));
      for (const ex of existingPlaces) {
        if (cand.actionType === 'update' && ex.id === cand.targetId) continue;
        if (!ex.coordinates) continue;
        const [exLat, exLng] = String(ex.coordinates).split(',').map(s => Number.parseFloat(s.trim()));
        const dist = Math.hypot(candLat - exLat, candLng - exLng);
        // Nếu khoảng cách < 0.0001 độ (~11m), coi như trùng tọa độ bất thường
        if (dist < 0.0001) {
          collisions.coordinateCollisions.push({
            candidateSlug: cand.slug,
            collidedWithId: ex.id,
            collidedWithSlug: ex.slug,
            dist
          });
        }
      }
    }
  }

  return collisions;
}

/**
 * 1. Xây dựng bản vá chuẩn hóa cho Biển Ba Động (ID 2 hiện có trong CSDL)
 */
export function buildPatchForBienBaDong(liveRecord) {
  if (!liveRecord) {
    throw new Error('BIEN_BA_DONG_LIVE_NOT_FOUND: Không tìm thấy bản ghi ID 2 trên CSDL production.');
  }

  const beforeRecord = { ...liveRecord };

  const afterRecord = {
    ...beforeRecord,
    name: 'Biển Ba Động', // Xóa hậu tố rác "DH"
    slug: 'bien-ba-dong', // Giữ nguyên slug chuẩn canonical
    category: 'Điểm Check-in / Sống Ảo', // Khớp bộ lọc "Check-in" trên UI (regex /bien/i)
    area: 'Duyên Hải',
    address: 'Khu du lịch Ba Động, phường Trường Long Hòa, tỉnh Vĩnh Long', // NQ 1687/NQ-UBTVQH15
    coordinates: '9.6730,106.5700',
    map_link: 'https://www.google.com/maps?q=9.6730,106.5700',
    opening_time: null, // Khử sạch giờ cũ chưa kiểm chứng
    closing_time: null,
    display_hours: null,
    price_raw: null, // Khử sạch "Miễn phí" cũ chưa kiểm chứng
    rating: null, // Khử sạch 4.5 sao cũ chưa kiểm chứng
    contact: null, // Khử sạch số hotline cũ chưa xác minh
    note: null,
    status: 'draft', // Chuyển từ hidden sang draft để thẩm định preview
    operating_status: 'Normal',
    images: [], // SVG placeholder trung tính
    image_link: null,
    description: 'Địa danh nghỉ dưỡng biển nổi tiếng từ thời Pháp thuộc, nổi bật với bãi cát dài thoai thoải, các đụn cát tự nhiên rợp bóng hàng phi lao xanh mát và không khí sinh thái duyên hải trong lành.',
    expected_updated_at: liveRecord.updated_at // OCC ĐỌC ĐỘNG TỪ PRODUCTION LIVE
  };

  const rollbackRecord = {
    id: beforeRecord.id,
    name: beforeRecord.name,
    slug: beforeRecord.slug,
    category: beforeRecord.category,
    area: beforeRecord.area,
    address: beforeRecord.address,
    coordinates: beforeRecord.coordinates,
    map_link: beforeRecord.map_link,
    opening_time: beforeRecord.opening_time,
    closing_time: beforeRecord.closing_time,
    display_hours: beforeRecord.display_hours,
    price_raw: beforeRecord.price_raw,
    rating: beforeRecord.rating,
    contact: beforeRecord.contact,
    note: beforeRecord.note,
    status: beforeRecord.status, // hidden
    operating_status: beforeRecord.operating_status,
    images: beforeRecord.images,
    image_link: beforeRecord.image_link
  };

  const fieldSources = {
    name: {
      source_url: 'https://vietnamtourism.gov.vn/printer/26535?type=1',
      rationale: 'Loại bỏ hậu tố rác "DH", chuẩn hóa tên danh thắng Biển Ba Động theo Cục Du lịch Quốc gia Việt Nam'
    },
    slug: {
      source_url: null,
      rationale: 'Bảo tồn canonical slug hiện hữu "bien-ba-dong", khớp sitemap và route public'
    },
    address: {
      source_url: 'https://vietnamtourism.gov.vn/printer/26535?type=1',
      rationale: 'Cập nhật theo Nghị quyết 1687/NQ-UBTVQH15 (phường Trường Long Hòa, tỉnh Vĩnh Long), lưu legacy_address trong audit'
    },
    legacy_address: {
      source_url: null,
      rationale: 'Xã Trường Long Hòa, Thị xã Duyên Hải, Tỉnh Trà Vinh'
    },
    coordinates: {
      source_url: 'https://www.openstreetmap.org/#map=16/9.6730/106.5700',
      coordinate_precision: 'approximate_area_center',
      rationale: 'Tọa độ khu vực bãi biển Ba Động theo khung nhìn bản đồ OpenStreetMap (#map=...); chỉ chứng minh vị trí gần tọa độ chứ chưa xác minh đúng đối tượng trên bản đồ, giữ mức độ approximate_area_center chờ thẩm tra thực địa.'
    },
    description: {
      source_url: 'https://vietnamtourism.gov.vn/printer/26535?type=1',
      rationale: 'Trích xuất từ Cục Du lịch Quốc gia Việt Nam: Địa danh nghỉ dưỡng biển nổi tiếng từ thời Pháp thuộc, nổi bật với bãi cát dài thoai thoải, các đụn cát tự nhiên rợp bóng hàng phi lao xanh mát và không khí sinh thái duyên hải trong lành.'
    }
  };

  // Lưu ý kiến trúc Idempotency: Đối với bản ghi cập nhật ID 2, tính bất biến và chống ghi đè đồng thời
  // được bảo đảm bằng khóa lạc quan OCC (expected_updated_at / before_sha256).
  // client_submission_id dưới đây chỉ lưu trong hồ sơ kế hoạch để theo dõi, KHÔNG ghi vào payload DB.
  return {
    actionType: 'update',
    targetId: 2,
    slug: 'bien-ba-dong',
    name: 'Biển Ba Động',
    client_submission_id: 'g9-4-rehab-bien-ba-dong-id2',
    concurrency_token: {
      expected_updated_at: liveRecord.updated_at,
      before_sha256: computeRecordChecksum(beforeRecord)
    },
    before: beforeRecord,
    after: afterRecord,
    rollback: rollbackRecord,
    field_sources: fieldSources
  };
}

/**
 * 2. Xây dựng đề xuất tạo mới cho Đền thờ Bác Hồ Trà Vinh
 */
export function buildDraftForDenThoBacHo() {
  const draftRecord = {
    name: 'Đền thờ Bác Hồ Trà Vinh',
    slug: 'den-tho-bac-ho-tra-vinh',
    category: 'Du Lịch Tâm Linh', // Khớp bộ lọc Tâm linh và Di tích trên UI
    area: 'TP. Trà Vinh',
    address: 'Ấp Vĩnh Hội, phường Long Đức, tỉnh Vĩnh Long', // NQ 1687/NQ-UBTVQH15
    coordinates: '9.9705,106.3382',
    map_link: 'https://www.google.com/maps?q=9.9705,106.3382',
    description: 'Di tích lịch sử cấp Quốc gia được xây dựng trong những năm kháng chiến ác liệt, biểu tượng thiêng liêng cho tấm lòng son sắt của quân dân Trà Vinh đối với Chủ tịch Hồ Chí Minh.',
    opening_time: null,
    closing_time: null,
    display_hours: null,
    price_raw: null,
    rating: null,
    contact: null,
    note: null,
    status: 'draft',
    operating_status: 'Normal',
    contributor: 'BQT ViVuTraVinh',
    images: [],
    image_link: null
  };

  const fieldSources = {
    name: {
      source_url: 'https://nhandan.vn/den-tho-bac-ho-o-tra-vinh-bieu-tuong-long-dan-nam-bo-post647000.html',
      rationale: 'Tên chuẩn Di tích lịch sử cấp Quốc gia (QĐ 98/VH-QĐ năm 1989)'
    },
    slug: {
      source_url: null,
      rationale: 'Định danh canonical "den-tho-bac-ho-tra-vinh"'
    },
    address: {
      source_url: 'https://nhandan.vn/den-tho-bac-ho-o-tra-vinh-bieu-tuong-long-dan-nam-bo-post647000.html',
      rationale: 'Ấp Vĩnh Hội, phường Long Đức, tỉnh Vĩnh Long theo Nghị quyết 1687/NQ-UBTVQH15'
    },
    legacy_address: {
      source_url: null,
      rationale: 'Ấp Vĩnh Hội, Xã Long Đức, Thành phố Trà Vinh, Tỉnh Trà Vinh'
    },
    coordinates: {
      source_url: 'https://www.openstreetmap.org/way/451892019',
      coordinate_precision: 'entrance_area',
      rationale: 'Tọa độ khu vực cổng vào và bãi đỗ khuôn viên di tích Đền thờ Bác Hồ theo OSM way 451892019'
    },
    description: {
      source_url: 'https://nhandan.vn/den-tho-bac-ho-o-tra-vinh-bieu-tuong-long-dan-nam-bo-post647000.html',
      rationale: 'Trích xuất từ bài viết Báo Nhân Dân: Di tích lịch sử cấp Quốc gia được xây dựng trong những năm kháng chiến ác liệt, biểu tượng thiêng liêng cho tấm lòng son sắt của quân dân Trà Vinh đối với Chủ tịch Hồ Chí Minh.'
    }
  };

  return {
    actionType: 'create',
    targetId: null,
    slug: 'den-tho-bac-ho-tra-vinh',
    name: 'Đền thờ Bác Hồ Trà Vinh',
    client_submission_id: 'g9-4-create-den-tho-bac-ho-tra-vinh',
    draft_payload: draftRecord,
    rollback: {
      action: 'archive',
      slug: 'den-tho-bac-ho-tra-vinh',
      client_submission_id: 'g9-4-create-den-tho-bac-ho-tra-vinh'
    },
    field_sources: fieldSources
  };
}

/**
 * 3. Xây dựng đề xuất tạo mới cho Chùa Hang
 */
export function buildDraftForChuaHang() {
  const draftRecord = {
    name: 'Chùa Hang',
    slug: 'chua-hang',
    category: 'Du Lịch Tâm Linh', // Khớp bộ lọc Chùa trên UI (regex /chua|tam linh|wat/i)
    area: 'Châu Thành',
    address: 'Khóm 3, xã Châu Thành, tỉnh Vĩnh Long', // Khoản 34 NQ 1687
    coordinates: '9.8967,106.3083',
    map_link: 'https://www.google.com/maps?q=9.8967,106.3083',
    description: "Ngôi chùa Khmer cổ kính (Wat Kompong Ch'rây) thành lập từ năm 1637, nổi bật với cổng vòm dạng hang độc đáo, khuôn viên rợp bóng cổ thụ và xưởng điêu khắc gỗ nghệ thuật tinh xảo của các nhà sư.",
    opening_time: null,
    closing_time: null,
    display_hours: null,
    price_raw: null,
    rating: null,
    contact: null,
    note: null,
    status: 'draft',
    operating_status: 'Normal',
    contributor: 'BQT ViVuTraVinh',
    images: [],
    image_link: null
  };

  const fieldSources = {
    name: {
      source_url: 'https://nhandan.vn/doc-dao-chua-khmer-o-tra-vinh-post769288.html',
      rationale: "Tên Di tích lịch sử - văn hóa cấp Quốc gia Chùa Hang (Wat Kompong Ch'rây)"
    },
    slug: {
      source_url: null,
      rationale: 'Định danh canonical "chua-hang"'
    },
    address: {
      source_url: 'https://nhandan.vn/doc-dao-chua-khmer-o-tra-vinh-post769288.html',
      rationale: 'Khóm 3, xã Châu Thành, tỉnh Vĩnh Long theo khoản 34 NQ 1687/NQ-UBTVQH15 (sáp nhập thị trấn Châu Thành thành xã Châu Thành)'
    },
    legacy_address: {
      source_url: null,
      rationale: 'Khóm 3, Thị trấn Châu Thành, Huyện Châu Thành, Tỉnh Trà Vinh'
    },
    coordinates: {
      source_url: 'https://www.openstreetmap.org/#map=17/9.8967/106.3083',
      coordinate_precision: 'approximate_temple_grounds',
      rationale: 'Tọa độ tham chiếu khuôn viên chùa cổ tại khóm 3 Châu Thành theo khung nhìn bản đồ OpenStreetMap (#map=...); chỉ chứng minh vị trí gần tọa độ chứ chưa xác minh đối tượng trên bản đồ, giữ mức độ approximate_temple_grounds chờ thẩm tra thực địa.'
    },
    description: {
      source_url: 'https://nhandan.vn/doc-dao-chua-khmer-o-tra-vinh-post769288.html',
      rationale: "Trích xuất từ bài viết Báo Nhân Dân: Ngôi chùa Khmer cổ kính (Wat Kompong Ch'rây) thành lập từ năm 1637, nổi bật với cổng vòm dạng hang độc đáo, khuôn viên rợp bóng cổ thụ và xưởng điêu khắc gỗ nghệ thuật tinh xảo của các nhà sư."
    }
  };

  return {
    actionType: 'create',
    targetId: null,
    slug: 'chua-hang',
    name: 'Chùa Hang',
    client_submission_id: 'g9-4-create-chua-hang',
    draft_payload: draftRecord,
    rollback: {
      action: 'archive',
      slug: 'chua-hang',
      client_submission_id: 'g9-4-create-chua-hang'
    },
    field_sources: fieldSources
  };
}

/**
 * 4. Xây dựng đề xuất tạo mới cho Du Lịch Cộng Đồng Cồn Chim
 */
export function buildDraftForConChim() {
  const draftRecord = {
    name: 'Du Lịch Cộng Đồng Cồn Chim',
    slug: 'con-chim',
    category: 'Du Lịch Sinh Thái / Cộng Đồng', // Khớp bộ lọc Check-in trên UI (regex /sinh thai|cu lao|con|bien/i)
    area: 'Châu Thành',
    address: 'Cù lao Cồn Chim, xã Hòa Minh, tỉnh Vĩnh Long', // NQ 1687/NQ-UBTVQH15
    coordinates: '9.9167,106.4274',
    map_link: 'https://www.google.com/maps?q=9.9167,106.4274',
    description: "Điểm du lịch sinh thái cộng đồng tiêu biểu đạt Giải thưởng Du lịch ASEAN 2025, vận hành theo triết lý 'thuận thiên' với mô hình con tôm ôm cây lúa và nếp sống mộc mạc miệt vườn.",
    opening_time: null,
    closing_time: null,
    display_hours: null,
    price_raw: null,
    rating: null,
    contact: null,
    note: null,
    status: 'draft',
    operating_status: 'Normal',
    contributor: 'BQT ViVuTraVinh',
    images: [],
    image_link: null
  };

  const fieldSources = {
    name: {
      source_url: 'https://nhandan.vn/ocop/vinh-long-phat-trien-kinh-te-du-lich-theo-khong-gian-moi-post919861.html',
      rationale: 'Điểm du lịch cộng đồng Cồn Chim đạt Giải thưởng Du lịch cộng đồng ASEAN 2025'
    },
    slug: {
      source_url: null,
      rationale: 'Định danh canonical "con-chim"'
    },
    address: {
      source_url: 'https://nhandan.vn/ocop/vinh-long-phat-trien-kinh-te-du-lich-theo-khong-gian-moi-post919861.html',
      rationale: 'Cù lao Cồn Chim, xã Hòa Minh, tỉnh Vĩnh Long theo Nghị quyết 1687/NQ-UBTVQH15'
    },
    legacy_address: {
      source_url: null,
      rationale: 'Cù lao Cồn Chim, Xã Hòa Minh, Huyện Châu Thành, Tỉnh Trà Vinh'
    },
    coordinates: {
      source_url: 'https://www.openstreetmap.org/way/26776420',
      coordinate_precision: 'area_island',
      rationale: 'Mốc cồn trên sông Cổ Chiên thuộc xã Hòa Minh theo OpenStreetMap way 26776420'
    },
    description: {
      source_url: 'https://nhandan.vn/ocop/vinh-long-phat-trien-kinh-te-du-lich-theo-khong-gian-moi-post919861.html',
      rationale: "Trích xuất từ Báo Nhân Dân: Điểm du lịch sinh thái cộng đồng tiêu biểu đạt Giải thưởng Du lịch ASEAN 2025, vận hành theo triết lý 'thuận thiên' với mô hình con tôm ôm cây lúa và nếp sống mộc mạc miệt vườn."
    }
  };

  return {
    actionType: 'create',
    targetId: null,
    slug: 'con-chim',
    name: 'Du Lịch Cộng Đồng Cồn Chim',
    client_submission_id: 'g9-4-create-con-chim',
    draft_payload: draftRecord,
    rollback: {
      action: 'archive',
      slug: 'con-chim',
      client_submission_id: 'g9-4-create-con-chim'
    },
    field_sources: fieldSources
  };
}

/**
 * 5. Xây dựng đề xuất tạo mới cho Chùa Vàm Rây
 */
export function buildDraftForChuaVamRay() {
  const draftRecord = {
    name: 'Chùa Vàm Rây',
    slug: 'chua-vam-ray',
    category: 'Du Lịch Tâm Linh', // Khớp bộ lọc Chùa trên UI (regex /chua|tam linh|wat/i)
    area: 'Trà Cú',
    address: 'Ấp Vàm Ray, xã Hàm Giang, tỉnh Vĩnh Long', // NQ 1687/NQ-UBTVQH15: sáp nhập xã Hàm Tân thành xã Hàm Giang
    coordinates: '9.6670,106.2580',
    map_link: 'https://www.google.com/maps?q=9.6670,106.2580',
    description: 'Đại tự Phật giáo Nam tông Khmer lớn nhất miền Tây Nam Bộ có niên đại khoảng 600 năm, tráng lệ với kiến trúc phong cách Angkor và bức tượng Phật Thích Ca nhập Niết Bàn ngoài trời dài 54m sơn son thếp vàng.',
    opening_time: null,
    closing_time: null,
    display_hours: null,
    price_raw: null,
    rating: null,
    contact: null,
    note: null,
    status: 'draft',
    operating_status: 'Normal',
    contributor: 'BQT ViVuTraVinh',
    images: [],
    image_link: null
  };

  const fieldSources = {
    name: {
      source_url: 'https://nhandan.vn/doc-dao-chua-khmer-o-tra-vinh-post769288.html',
      rationale: 'Ngôi chùa Khmer lớn nhất hiện nay theo Báo Nhân Dân'
    },
    slug: {
      source_url: null,
      rationale: 'Định danh canonical "chua-vam-ray"'
    },
    address: {
      source_url: 'https://nhandan.vn/doc-dao-chua-khmer-o-tra-vinh-post769288.html',
      rationale: 'Ấp Vàm Ray, xã Hàm Giang, tỉnh Vĩnh Long theo Nghị quyết 1687/NQ-UBTVQH15 (sáp nhập xã Hàm Tân, Hàm Giang, Kim Sơn thành xã Hàm Giang)'
    },
    legacy_address: {
      source_url: null,
      rationale: 'Ấp Vàm Ray, Xã Hàm Tân, Huyện Trà Cú, Tỉnh Trà Vinh'
    },
    coordinates: {
      source_url: 'https://www.openstreetmap.org/#map=17/9.6670/106.2580',
      coordinate_precision: 'approximate_temple_grounds',
      rationale: 'Tọa độ tham chiếu khuôn viên chùa tại ấp Vàm Ray theo khung nhìn bản đồ OpenStreetMap (#map=...); chỉ chứng minh vị trí gần tọa độ chứ chưa xác minh đối tượng trên bản đồ, giữ mức độ approximate_temple_grounds chờ thẩm tra thực địa.'
    },
    description: {
      source_url: 'https://nhandan.vn/doc-dao-chua-khmer-o-tra-vinh-post769288.html',
      rationale: 'Trích xuất từ Báo Nhân Dân: Đại tự Phật giáo Nam tông Khmer lớn nhất miền Tây Nam Bộ có niên đại khoảng 600 năm, tráng lệ với kiến trúc phong cách Angkor và bức tượng Phật Thích Ca nhập Niết Bàn ngoài trời dài 54m sơn son thếp vàng.'
    }
  };

  return {
    actionType: 'create',
    targetId: null,
    slug: 'chua-vam-ray',
    name: 'Chùa Vàm Rây',
    client_submission_id: 'g9-4-create-chua-vam-ray',
    draft_payload: draftRecord,
    rollback: {
      action: 'archive',
      slug: 'chua-vam-ray',
      client_submission_id: 'g9-4-create-chua-vam-ray'
    },
    field_sources: fieldSources
  };
}

/**
 * Hàm điều phối chính: Lập kế hoạch mở rộng G9.4 (Dry-Run Only)
 */
export async function generateExpansionPlan(options = {}) {
  const backupsDir = options.backupsDir || BACKUPS_DIR;
  const dataDir = options.dataDir || DATA_DIR;

  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const nowIso = new Date().toISOString();
  const fileDate = nowIso.replace(/[:.]/g, '-');

  // 1. Đọc dữ liệu live từ production (hoặc mock nếu options chỉ định)
  const prodData = await loadLiveProductionData(options);
  const { allPlaces, placeId2, source } = prodData;

  // 2. Xây dựng 5 ứng viên
  const patchBienBaDong = buildPatchForBienBaDong(placeId2);
  const draftBacHo = buildDraftForDenThoBacHo();
  const draftChuaHang = buildDraftForChuaHang();
  const draftConChim = buildDraftForConChim();
  const draftChuaVamRay = buildDraftForChuaVamRay();

  const candidates = [
    patchBienBaDong,
    draftBacHo,
    draftChuaHang,
    draftConChim,
    draftChuaVamRay
  ];

  // 3. Kiểm tra va chạm (Collision Detection)
  const collisions = checkCollisions(allPlaces, candidates);
  if (collisions.slugCollisions.length > 0) {
    throw new Error(`SLUG_COLLISION_DETECTED: Phát hiện va chạm slug: ${JSON.stringify(collisions.slugCollisions)}`);
  }
  if (collisions.coordinateCollisions.length > 0) {
    throw new Error(`COORDINATE_COLLISION_DETECTED: Phát hiện trùng lặp tọa độ: ${JSON.stringify(collisions.coordinateCollisions)}`);
  }

  // 4. Validate từng ứng viên qua validatePlace
  for (const cand of candidates) {
    const payload = cand.actionType === 'update' ? cand.after : cand.draft_payload;
    const vResult = validatePlace(payload, { mode: 'draft' });
    if (!vResult.valid) {
      throw new Error(`VALIDATION_FAILED: Ứng viên ${cand.name} (${cand.slug}) không đạt chuẩn: ${JSON.stringify(vResult.errors)}`);
    }
    cand.validation = {
      valid: vResult.valid,
      errorsCount: vResult.errors.length,
      warningsCount: vResult.warnings.length
    };
  }

  // 5. Tạo Snapshot Manifest
  const manifest = {
    manifest_type: 'g9_4_expansion_pre_patch_snapshot',
    environment: 'production',
    source,
    captured_at: nowIso,
    total_existing_places: allPlaces.length,
    place_id_2_snapshot: placeId2,
    place_id_2_sha256: computeRecordChecksum(placeId2),
    candidate_slugs: EXPANSION_CANDIDATE_SLUGS,
    collisions_verified: {
      slug_collisions_count: 0,
      coordinate_collisions_count: 0
    }
  };

  const manifestFileName = `g9-expansion-manifest-${fileDate}.json`;
  const manifestPath = path.join(backupsDir, manifestFileName);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  // 6. Tạo Proposed Patches Plan
  const proposedPlan = {
    plan_version: '1.0.0',
    phase: 'G9.4_PHASE_A_RESEARCH_AND_DRY_RUN',
    mode: 'DRY_RUN_ONLY',
    generated_at: nowIso,
    manifest_file: manifestFileName,
    manifest_sha256: crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
    candidates_count: candidates.length,
    candidates
  };

  const proposedPatchesFileName = `g9-expansion-proposed-patches.json`;
  const proposedPatchesPath = path.join(dataDir, proposedPatchesFileName);
  fs.writeFileSync(proposedPatchesPath, JSON.stringify(proposedPlan, null, 2), 'utf8');

  return {
    manifestPath,
    proposedPatchesPath,
    manifest,
    proposedPlan,
    candidates
  };
}

// Chạy trực tiếp qua CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    try {
      console.log('======================================================================');
      console.log('🚀 LẬP KẾ HOẠCH & DRY-RUN MỞ RỘNG DỮ LIỆU THẬT G9.4 (5 ỨNG VIÊN)');
      console.log('   Chế độ: 🔍 DRY-RUN ONLY (ZERO MUTATION APPLIED)');
      console.log('======================================================================\n');

      const result = await generateExpansionPlan();

      console.log('✓ Nguồn đọc dữ liệu live:', result.manifest.source);
      console.log('✓ Đã lưu snapshot manifest:', result.manifestPath);
      console.log('✓ Đã lưu proposed patches JSON:', result.proposedPatchesPath);
      console.log(`✓ 5/5 ứng viên đã qua kiểm tra toàn diện:`);
      for (const c of result.candidates) {
        console.log(`  • [${c.actionType.toUpperCase()}] ${c.name} (${c.slug}) -> Idempotency: ${c.client_submission_id}`);
      }
      console.log('\n======================================================================');
      console.log('🎉 HOÀN TẤT DRY-RUN G9.4 GIAI ĐOẠN A: KHÔNG CÓ BẤT KỲ MUTATION NÀO TRÊN PRODUCTION!');
      console.log('======================================================================');
    } catch (err) {
      console.error('❌ LỖI DRY-RUN G9.4:', err);
      process.exit(1);
    }
  })();
}
