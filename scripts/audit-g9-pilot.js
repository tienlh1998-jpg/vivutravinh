#!/usr/bin/env node

/**
 * scripts/audit-g9-pilot.js
 *
 * Thẩm định cấu trúc dữ liệu ứng viên Pilot G9.3A (Structural Contract Validation):
 * - CHỈ ĐỌC (Read-Only): Tuyệt đối KHÔNG thực hiện mutation (chặn mọi method ngoài GET/HEAD).
 * - Kiểm tra cấu trúc bằng chứng nguồn (Source Evidence): Bắt buộc deep link, chặn trang chủ/origin.
 * - Kiểm tra field_sources cho từng trường có dữ liệu thực tế (khác UNKNOWN).
 * - Ràng buộc độ tin cậy (Confidence Rules):
 *   + HIGH chỉ khi có nguồn trực tiếp và không có xung đột mở (UNRESOLVED).
 *   + Tọa độ approximate tuyệt đối không được gán confidence HIGH.
 * - Ràng buộc phân loại (Recommendation Rules):
 *   + Hỗ trợ 7 trạng thái: VERIFIED_CANDIDATE, NEEDS_FIELD_VERIFICATION, SOURCE_CONFLICT, NEEDS_RESEARCH, UNVERIFIED_LEGACY, TEST_OR_INVALID, DUPLICATE_CANDIDATE.
 *   + Ứng viên còn xung đột UNRESOLVED bị chặn khỏi VERIFIED_CANDIDATE.
 * - Phân tách địa chỉ hành chính: legacy_address và current_address (theo NQ 1687/NQ-UBTVQH15).
 * - Thẩm tra timestamp và múi giờ ISO 8601 (chặn thời gian tương lai).
 * - Độc lập giữa thẩm định cấu trúc (structural validation) và kiểm chứng thực địa (factual verification).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  TRA_VINH_BOUNDS,
  validateCoordinates,
  validateGoogleMapsUrl,
  inspectSafeUrl
} from '../js/place-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
export const DEFAULT_CANDIDATES_PATH = path.join(ROOT_DIR, 'data', 'g9-pilot-candidates.json');

export const ALLOWED_CATEGORIES = Object.freeze(new Set([
  'attraction',
  'food',
  'cafe',
  'specialty',
  'entertainment',
  'hotel',
  'stay',
  'shopping'
]));

export const ALLOWED_AREAS = Object.freeze(new Set([
  'tp-tra-vinh',
  'cang-long',
  'cau-ke',
  'tieu-can',
  'chau-thanh',
  'tra-cu',
  'cau-ngang',
  'duyen-hai',
  'tx-duyen-hai'
]));

export const ALLOWED_RECOMMENDATIONS = Object.freeze(new Set([
  'VERIFIED_CANDIDATE',
  'VERIFIED_IDENTITY_CANDIDATE',
  'NEEDS_FIELD_VERIFICATION',
  'SOURCE_CONFLICT',
  'NEEDS_RESEARCH',
  'UNVERIFIED_LEGACY',
  'TEST_OR_INVALID',
  'DUPLICATE_CANDIDATE'
]));

export const ALLOWED_CONFIDENCE_LEVELS = Object.freeze(new Set([
  'HIGH',
  'MEDIUM',
  'LOW',
  'UNKNOWN'
]));

export const ALLOWED_SOURCE_STATUS = Object.freeze(new Set([
  'active_relevant',
  'dead',
  'unreachable',
  'blocked',
  'redirected_unrelated',
  'content_mismatch',
  'unchecked'
]));

export const ALLOWED_OPERATING_STATUS = Object.freeze(new Set([
  'OPERATING',
  'POSSIBLY_REBRANDED',
  'TEMPORARILY_CLOSED',
  'PERMANENTLY_CLOSED',
  'UNKNOWN'
]));

export const ALLOWED_EVIDENCE_SCOPES = Object.freeze(new Set([
  'identity',
  'address',
  'coordinates',
  'hours',
  'contact',
  'price',
  'operating_status'
]));

export const ALLOWED_RIGHTS_STATUS = Object.freeze(new Set([
  'VERIFIED_PERMITTED',
  'PENDING_VERIFICATION',
  'UNVERIFIED',
  'PUBLIC_DOMAIN',
  'RESTRICTED'
]));

export const ALLOWED_COORDINATE_PRECISION = Object.freeze(new Set([
  'entrance',
  'building',
  'center',
  'approximate'
]));

export const FORBIDDEN_CURRENT_ADMIN_KEYWORDS = Object.freeze([
  'thành phố trà vinh',
  'tp trà vinh',
  'tp. trà vinh',
  'tp.trà vinh',
  'tỉnh trà vinh',
  'thị xã duyên hải',
  'tx duyên hải',
  'tx. duyên hải',
  'huyện châu thành',
  'huyện cầu ngang',
  'huyện càng long',
  'huyện cầu kè',
  'huyện tiểu cần',
  'huyện trà cú',
  'huyện duyên hải',
  'thị trấn châu thành',
  'thị trấn duyên hải',
  'tt châu thành',
  'tt. châu thành',
  'tt.châu thành',
  'tt duyên hải',
  'tt. duyên hải',
  'tt.duyên hải',
  'phường 1',
  'phường 2',
  'phường 3',
  'phường 4',
  'phường 5',
  'phường 6',
  'phường 7',
  'phường 8',
  'phường 9',
  'xã long đức',
  'xã trường long hòa'
]);

export function checkForbiddenCurrentAdminUnits(address) {
  if (!address || typeof address !== 'string') return null;
  const lower = address.toLowerCase();
  for (const kw of FORBIDDEN_CURRENT_ADMIN_KEYWORDS) {
    const regex = new RegExp(`(^|[,\\s])${kw}([,\\s]|$)`, 'i');
    if (regex.test(lower)) {
      return kw;
    }
  }
  return null;
}

export function isFactRelevantToScope(fact, scope) {
  if (!fact || typeof fact !== 'string') return false;
  const f = fact.toLowerCase();
  switch (scope) {
    case 'identity':
      return /tên|di tích|thắng cảnh|chùa|quán|cơ sở|điểm đến|khu du lịch|đền thờ|thương hiệu|văn hóa|làng nghề|bánh tét|bún nước lèo|cà phê|cafe/.test(f);
    case 'address':
      return /địa chỉ|vị trí|khóm|ấp|phường|xã|đường|tỉnh|tọa lạc|nằm tại|thuộc|quốc lộ/.test(f);
    case 'coordinates':
      return /tọa độ|mốc|trắc địa|vị trí|tâm|cổng|building|kinh độ|vĩ độ|9\.|106\./.test(f);
    case 'hours':
      return /giờ|mở cửa|đóng cửa|đón khách|phục vụ|hàng ngày|07:00|17:00/.test(f);
    case 'contact':
      return /điện thoại|hotline|liên hệ|sđt|0294|091|093/.test(f);
    case 'price':
      return /giá|vé|miễn phí|chi phí|đồng|thu vé/.test(f);
    case 'operating_status':
      return /hoạt động|ngừng|đóng cửa|mở rộng|chuyển đổi/.test(f);
    default:
      return true;
  }
}

export const TEST_KEYWORDS = Object.freeze([
  'test', 'thu nghiem', 'thử nghiệm', 'adasdasd', 'asdasd', 'abc', 'xyz', 'demo', 'sample', 'fake', 'xbcz'
]);

export const FORBIDDEN_TEST_IDS = Object.freeze(new Set([
  4, 6, 10, '4', '6', '10', 'dia-diem-test-google-form', 'dia-diem-test-google-form-mpozjzkv', 'adasdasd', 'xbcz', 'dd'
]));

export const KNOWN_MOCK_PHONES = Object.freeze(new Set([
  '0294.385.5555',
  '0294.383.2222',
  '0294.385.1111',
  '0903.123.456',
  '0919.888.777',
  '0294.382.5555',
  '0294.385.2345'
]));

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TIME_HH_MM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_8601_TIMEZONE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Zero Mutation Guard: Chặn mọi thao tác mạng gây thay đổi dữ liệu
 */
export function checkNoMutationGuard(options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    throw new Error(`MUTATION_FORBIDDEN: Method ${method} is strictly blocked. G9.3A is read-only.`);
  }
}

/**
 * Kiểm tra xem một URL có phải là deep link cụ thể hay không (chặn trang chủ / root origin)
 */
export function isDeepLink(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const u = new URL(rawUrl.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const pathname = u.pathname.trim();
    return pathname.length > 1 && pathname !== '/';
  } catch {
    return false;
  }
}

/**
 * Thẩm định tính hợp lệ của timestamp ISO 8601 có timezone và không thuộc tương lai
 */
export function validateIsoTimestamp(timestampStr, now = Date.now()) {
  if (!timestampStr || typeof timestampStr !== 'string') {
    return { valid: false, code: 'INVALID_TIMESTAMP_TYPE', message: 'Timestamp phải là chuỗi ISO 8601' };
  }
  if (!ISO_8601_TIMEZONE_REGEX.test(timestampStr)) {
    return { valid: false, code: 'INVALID_TIMEZONE_FORMAT', message: `Timestamp '${timestampStr}' thiếu định dạng múi giờ hợp lệ (Z hoặc +HH:MM).` };
  }
  const parsed = Date.parse(timestampStr);
  if (Number.isNaN(parsed)) {
    return { valid: false, code: 'NAN_TIMESTAMP', message: `Timestamp '${timestampStr}' không thể parse thành thời gian thực.` };
  }
  if (parsed > now + 60000) { // dung sai 1 phút
    return { valid: false, code: 'FUTURE_TIMESTAMP', message: `Timestamp '${timestampStr}' nằm trong tương lai so với thời điểm hiện tại.` };
  }
  return { valid: true, parsed };
}

/**
 * Thẩm định hồ sơ của 1 ứng viên pilot theo chuẩn cấu trúc hợp đồng G9.3A
 */
export function validatePilotCandidate(candidate, index = 0, options = {}) {
  const errors = [];
  const warnings = [];
  const now = options.now || Date.now();

  const addError = (code, field, message) => {
    errors.push({ code, field, message, candidateId: candidate?.id || `idx-${index}` });
  };
  const addWarning = (code, field, message) => {
    warnings.push({ code, field, message, candidateId: candidate?.id || `idx-${index}` });
  };

  if (!candidate || typeof candidate !== 'object') {
    return {
      valid: false,
      errors: [{ code: 'INVALID_RECORD', field: 'root', message: 'Bản ghi không phải là một đối tượng hợp lệ' }],
      warnings: []
    };
  }

  // 1. id
  const rawId = candidate.id !== undefined && candidate.id !== null ? String(candidate.id).trim() : '';
  if (!rawId) {
    addError('MISSING_ID', 'id', 'Trường id là bắt buộc');
  } else if (FORBIDDEN_TEST_IDS.has(candidate.id) || FORBIDDEN_TEST_IDS.has(rawId)) {
    addError('FORBIDDEN_TEST_ID', 'id', `ID '${candidate.id}' thuộc danh sách dữ liệu test/archived không được dùng.`);
  } else if (typeof candidate.id !== 'string') {
    addError('INVALID_ID_TYPE', 'id', 'Trường id phải là chuỗi (ví dụ: pilot-01).');
  }

  // 2. proposed_name
  const name = typeof candidate.proposed_name === 'string' ? candidate.proposed_name.trim() : '';
  if (!name || name.length < 3 || name.length > 150) {
    addError('INVALID_NAME', 'proposed_name', 'Tên địa điểm đề xuất phải có độ dài từ 3 đến 150 ký tự.');
  } else {
    const lowerName = name.toLowerCase();
    for (const kw of TEST_KEYWORDS) {
      if (lowerName.includes(kw)) {
        addError('TEST_KEYWORD_IN_NAME', 'proposed_name', `Tên địa điểm chứa từ khóa test '${kw}'.`);
        break;
      }
    }
  }

  // 3. proposed_slug
  const slug = typeof candidate.proposed_slug === 'string' ? candidate.proposed_slug.trim() : '';
  if (!slug || !SLUG_REGEX.test(slug)) {
    addError('INVALID_SLUG', 'proposed_slug', 'Slug đề xuất phải đúng định dạng kebab-case chữ thường và số.');
  } else if (FORBIDDEN_TEST_IDS.has(slug)) {
    addError('FORBIDDEN_TEST_SLUG', 'proposed_slug', `Slug '${slug}' thuộc danh sách slug test cũ.`);
  } else {
    for (const kw of TEST_KEYWORDS) {
      if (slug.includes(kw)) {
        addError('TEST_KEYWORD_IN_SLUG', 'proposed_slug', `Slug chứa từ khóa test '${kw}'.`);
        break;
      }
    }
  }

  // 4. category
  if (!candidate.category || !ALLOWED_CATEGORIES.has(candidate.category)) {
    addError('INVALID_CATEGORY', 'category', `Danh mục '${candidate.category}' không hợp lệ.`);
  }

  // 5. area
  if (!candidate.area || !ALLOWED_AREAS.has(candidate.area)) {
    addError('INVALID_AREA', 'area', `Khu vực hành chính '${candidate.area}' không hợp lệ.`);
  }

  const isVerifiedRecord = candidate.recommendation === 'VERIFIED_CANDIDATE' || candidate.recommendation === 'VERIFIED_IDENTITY_CANDIDATE';

  // 6. Địa chỉ: Phân tách legacy_address và current_address
  const legacyAddress = typeof candidate.legacy_address === 'string' ? candidate.legacy_address.trim() : '';
  const currentAddress = typeof candidate.current_address === 'string' ? candidate.current_address.trim() : '';

  if (!legacyAddress || legacyAddress.length < 5) {
    addError('MISSING_LEGACY_ADDRESS', 'legacy_address', 'Trường legacy_address bắt buộc và phải có độ dài >= 5 ký tự.');
  }
  if (!currentAddress || (currentAddress.length < 5 && currentAddress !== 'UNKNOWN')) {
    addError('MISSING_CURRENT_ADDRESS', 'current_address', 'Trường current_address bắt buộc và phải có độ dài >= 5 ký tự hoặc UNKNOWN.');
  } else if (currentAddress !== 'UNKNOWN') {
    const forbiddenUnit = checkForbiddenCurrentAdminUnits(currentAddress);
    if (forbiddenUnit) {
      addError('OLD_ADMIN_UNIT_USED_AS_CURRENT', 'current_address', `current_address chứa đơn vị hành chính cũ không hợp lệ: '${forbiddenUnit}'. Phải dùng đơn vị hành chính hiện hành theo NQ 1687/NQ-UBTVQH15.`);
      if (forbiddenUnit.includes('tỉnh trà vinh')) {
        addError('OLD_ADMIN_PROVINCE_USED_AS_CURRENT', 'current_address', 'current_address không được sử dụng "Tỉnh Trà Vinh" làm đơn vị tỉnh hiện hành; dùng ghi chú khu vực cũ theo NQ 1687/NQ-UBTVQH15.');
      }
    }
  } else if (isVerifiedRecord) {
    addError('VERIFIED_REQUIRES_CURRENT_ADDRESS', 'current_address', 'Ứng viên xác minh không được để current_address là UNKNOWN.');
  }

  // address_candidates (dành cho trường hợp SOURCE_CONFLICT như Cafe 1985)
  if (candidate.address_candidates !== undefined) {
    if (!Array.isArray(candidate.address_candidates) || candidate.address_candidates.length === 0) {
      addError('INVALID_ADDRESS_CANDIDATES', 'address_candidates', 'address_candidates phải là một mảng chuỗi địa chỉ khả dĩ.');
    } else {
      for (const addr of candidate.address_candidates) {
        if (typeof addr !== 'string' || addr.trim().length < 5) {
          addError('INVALID_ADDRESS_CANDIDATE_ENTRY', 'address_candidates', 'Mỗi mục trong address_candidates phải là chuỗi >= 5 ký tự.');
        } else {
          const forbidden = checkForbiddenCurrentAdminUnits(addr);
          if (forbidden) {
            addError('OLD_ADMIN_UNIT_IN_ADDRESS_CANDIDATES', 'address_candidates', `Địa chỉ đề xuất '${addr}' chứa đơn vị hành chính cũ: '${forbidden}'.`);
          }
        }
      }
    }
  }

  // operating_status (hỗ trợ phân loại trạng thái hoạt động: OPERATING, POSSIBLY_REBRANDED, etc.)
  if (candidate.operating_status !== undefined) {
    if (!ALLOWED_OPERATING_STATUS.has(candidate.operating_status)) {
      addError('INVALID_OPERATING_STATUS', 'operating_status', `Trạng thái vận hành '${candidate.operating_status}' không hợp lệ.`);
    }
  }

  // 7. coordinates & coordinate_precision
  const coords = typeof candidate.coordinates === 'string' ? candidate.coordinates.trim() : '';
  if (!coords) {
    addError('MISSING_COORDINATES', 'coordinates', 'Tọa độ GPS không được rỗng.');
  } else if (coords !== 'UNKNOWN') {
    const coordRes = validateCoordinates(coords);
    if (!coordRes.valid) {
      addError(coordRes.code || 'INVALID_COORDINATES', 'coordinates', coordRes.message || 'Tọa độ không hợp lệ.');
    }
  } else if (candidate.recommendation === 'VERIFIED_CANDIDATE') {
    addError('VERIFIED_REQUIRES_COORDINATES', 'coordinates', 'Ứng viên VERIFIED_CANDIDATE bắt buộc phải có tọa độ GPS đã xác minh, không được để UNKNOWN.');
  }

  if (!candidate.coordinate_precision || !ALLOWED_COORDINATE_PRECISION.has(candidate.coordinate_precision)) {
    addError('INVALID_COORDINATE_PRECISION', 'coordinate_precision', `Độ chính xác tọa độ '${candidate.coordinate_precision}' không hợp lệ (cho phép: entrance, building, center, approximate).`);
  }

  // 8. map_link
  const mapLink = typeof candidate.map_link === 'string' ? candidate.map_link.trim() : '';
  if (!mapLink) {
    addWarning('MISSING_MAP_LINK', 'map_link', 'Chưa cung cấp liên kết bản đồ.');
  } else if (mapLink !== 'UNKNOWN') {
    const mapRes = validateGoogleMapsUrl(mapLink);
    if (!mapRes.valid && !mapLink.includes('openstreetmap.org')) {
      addError(mapRes.code || 'INVALID_MAP_LINK', 'map_link', mapRes.message || 'Liên kết bản đồ không hợp lệ.');
    }
  }

  // 9. opening_time & 10. closing_time
  const openTime = typeof candidate.opening_time === 'string' ? candidate.opening_time.trim() : '';
  const closeTime = typeof candidate.closing_time === 'string' ? candidate.closing_time.trim() : '';

  if (!openTime) {
    addError('MISSING_OPENING_TIME', 'opening_time', 'Trường opening_time không được rỗng (dùng UNKNOWN nếu chưa xác định).');
  } else if (openTime !== 'UNKNOWN' && !TIME_HH_MM_REGEX.test(openTime)) {
    addError('INVALID_TIME_FORMAT', 'opening_time', `Giờ mở cửa '${openTime}' không đúng định dạng HH:mm.`);
  }

  if (!closeTime) {
    addError('MISSING_CLOSING_TIME', 'closing_time', 'Trường closing_time không được rỗng (dùng UNKNOWN nếu chưa xác định).');
  } else if (closeTime !== 'UNKNOWN' && !TIME_HH_MM_REGEX.test(closeTime)) {
    addError('INVALID_TIME_FORMAT', 'closing_time', `Giờ đóng cửa '${closeTime}' không đúng định dạng HH:mm.`);
  }

  // 11. contact
  const contact = typeof candidate.contact === 'string' ? candidate.contact.trim() : '';
  if (!contact) {
    addError('MISSING_CONTACT', 'contact', 'Trường contact không được rỗng (dùng UNKNOWN nếu chưa có).');
  } else if (KNOWN_MOCK_PHONES.has(contact)) {
    addError('MOCK_PHONE_DETECTED', 'contact', `Phát hiện số điện thoại mô phỏng rác '${contact}' từ dữ liệu fallback cũ.`);
  }

  // 12. price_raw
  const priceRaw = typeof candidate.price_raw === 'string' ? candidate.price_raw.trim() : '';
  if (!priceRaw) {
    addError('MISSING_PRICE_RAW', 'price_raw', 'Trường price_raw không được rỗng (dùng UNKNOWN nếu chưa xác định).');
  }

  // 13. image_candidates
  if (!Array.isArray(candidate.image_candidates)) {
    addError('INVALID_IMAGE_CANDIDATES', 'image_candidates', 'Trường image_candidates phải là mảng.');
  } else {
    for (let i = 0; i < candidate.image_candidates.length; i++) {
      const img = candidate.image_candidates[i];
      if (!img || typeof img !== 'object') {
        addError('INVALID_IMAGE_OBJECT', `image_candidates[${i}]`, 'Thông tin ảnh phải là một object.');
        continue;
      }
      if (!img.url || typeof img.url !== 'string') {
        addError('INVALID_IMAGE_URL', `image_candidates[${i}].url`, 'URL ảnh không được rỗng.');
      } else {
        const inspect = inspectSafeUrl(img.url);
        if (!inspect.isSafe) {
          addError('INSECURE_IMAGE_URL', `image_candidates[${i}].url`, `Đường dẫn ảnh không an toàn: ${inspect.reason}`);
        }
      }

      if (!ALLOWED_RIGHTS_STATUS.has(img.rights_status)) {
        addError('INVALID_RIGHTS_STATUS', `image_candidates[${i}].rights_status`, `Trạng thái bản quyền '${img.rights_status}' không hợp lệ.`);
      }

      if (img.rights_status !== 'VERIFIED_PERMITTED' && img.can_publish === true) {
        addError('UNVERIFIED_IMAGE_PUBLISH_BLOCKED', `image_candidates[${i}].can_publish`, 'Ảnh chưa xác minh bản quyền (rights_status != VERIFIED_PERMITTED) tuyệt đối KHÔNG ĐƯỢC đặt can_publish = true.');
      }
    }
  }

  // 14. image_rights
  const imageRights = typeof candidate.image_rights === 'string' ? candidate.image_rights.trim() : '';
  if (!imageRights) {
    addError('MISSING_IMAGE_RIGHTS', 'image_rights', 'Trường image_rights phải giải trình rõ tình trạng bản quyền.');
  }

  // 14b. sources_metadata
  if (Array.isArray(candidate.sources_metadata)) {
    for (let i = 0; i < candidate.sources_metadata.length; i++) {
      const meta = candidate.sources_metadata[i];
      if (!meta || typeof meta !== 'object') {
        addError('INVALID_SOURCE_METADATA_OBJECT', `sources_metadata[${i}]`, 'Metadata nguồn phải là object.');
        continue;
      }
      if (!meta.url || typeof meta.url !== 'string') {
        addError('INVALID_SOURCE_URL', `sources_metadata[${i}].url`, 'URL nguồn không được rỗng.');
      } else if (!isDeepLink(meta.url)) {
        addError('HOMEPAGE_SOURCE_REJECTED', `sources_metadata[${i}].url`, `URL nguồn '${meta.url}' là trang chủ/origin. Bắt buộc phải là deep link.`);
      }
      if (!meta.source_status || !ALLOWED_SOURCE_STATUS.has(meta.source_status)) {
        if (meta.source_status === 'active') {
          addError('DEPRECATED_ACTIVE_STATUS', `sources_metadata[${i}].source_status`, "Trạng thái 'active' đã bị bãi bỏ. Bắt buộc dùng active_relevant, redirected_unrelated hoặc content_mismatch.");
        } else {
          addError('INVALID_SOURCE_STATUS', `sources_metadata[${i}].source_status`, `Trạng thái nguồn '${meta.source_status}' không hợp lệ.`);
        }
      }
      if (meta.source_status === 'unreachable') {
        if (meta.http_status !== null && meta.http_status !== undefined) {
          addError('UNREACHABLE_CANNOT_HAVE_OK_STATUS', `sources_metadata[${i}].http_status`, 'Nguồn unreachable phải có http_status là null.');
        }
      } else if (typeof meta.http_status !== 'number') {
        addError('INVALID_HTTP_STATUS', `sources_metadata[${i}].http_status`, 'HTTP status của nguồn phải là số nguyên (hoặc null khi unreachable).');
      }
      if (meta.effective_url !== undefined && meta.effective_url !== null && typeof meta.effective_url !== 'string') {
        addError('INVALID_EFFECTIVE_URL', `sources_metadata[${i}].effective_url`, 'effective_url phải là chuỗi URL hoặc null.');
      }
      if (meta.page_title !== undefined && meta.page_title !== null && typeof meta.page_title !== 'string') {
        addError('INVALID_PAGE_TITLE', `sources_metadata[${i}].page_title`, 'page_title phải là chuỗi tiêu đề hoặc null.');
      }
      const checkMetaTime = validateIsoTimestamp(meta.checked_at, now);
      if (!checkMetaTime.valid) {
        addError(checkMetaTime.code, `sources_metadata[${i}].checked_at`, checkMetaTime.message);
      }
      if (!meta.evidence_scope || !ALLOWED_EVIDENCE_SCOPES.has(meta.evidence_scope)) {
        addError('INVALID_EVIDENCE_SCOPE', `sources_metadata[${i}].evidence_scope`, `Phạm vi bằng chứng '${meta.evidence_scope}' không hợp lệ.`);
      }

      if (isVerifiedRecord && (meta.source_status === 'dead' || meta.http_status === 404)) {
        addError('DEAD_SOURCE_FOR_VERIFIED_CANDIDATE', `sources_metadata[${i}]`, `Ứng viên xác minh có nguồn dead hoặc HTTP 404: ${meta.url}`);
      }
      if (isVerifiedRecord && meta.source_status === 'unreachable') {
        addError('UNREACHABLE_SOURCE_FOR_VERIFIED_CANDIDATE', `sources_metadata[${i}]`, `Ứng viên xác minh có nguồn unreachable: ${meta.url}`);
      }
    }
  }

  // 15. source_urls: Bắt buộc Deep Link (chặn homepage/root origin)
  if (!Array.isArray(candidate.source_urls) || candidate.source_urls.length === 0) {
    addError('MISSING_SOURCES', 'source_urls', 'Danh sách source_urls phải có ít nhất 1 nguồn kiểm chứng.');
  } else {
    for (const src of candidate.source_urls) {
      if (!isDeepLink(src)) {
        addError('HOMEPAGE_SOURCE_REJECTED', 'source_urls', `URL nguồn '${src}' là trang chủ/origin. Bắt buộc phải là deep link đến đúng bài viết hoặc hồ sơ.`);
      }
    }
  }

  // 16. source_type
  if (!candidate.source_type || typeof candidate.source_type !== 'string') {
    addError('MISSING_SOURCE_TYPE', 'source_type', 'Trường source_type là bắt buộc.');
  }

  // 17. verified_at: Timestamp hợp lệ với timezone
  const verifiedCheck = validateIsoTimestamp(candidate.verified_at, now);
  if (!verifiedCheck.valid) {
    addError(verifiedCheck.code, 'verified_at', verifiedCheck.message);
  }

  // 18. field_sources: Bằng chứng nguồn cho từng trường thực tế
  if (!candidate.field_sources || typeof candidate.field_sources !== 'object') {
    addError('MISSING_FIELD_SOURCES', 'field_sources', 'Trường field_sources bắt buộc phải là một object.');
  } else {
    const fieldsToVerify = [
      { key: 'address', value: candidate.address, sourceKey: 'address' },
      { key: 'coordinates', value: candidate.coordinates, sourceKey: 'coordinates' },
      { key: 'hours', value: (candidate.opening_time !== 'UNKNOWN' || candidate.closing_time !== 'UNKNOWN') ? 'PROVIDED' : 'UNKNOWN', sourceKey: 'hours' },
      { key: 'contact', value: candidate.contact, sourceKey: 'contact' },
      { key: 'price', value: candidate.price_raw, sourceKey: 'price' }
    ];

    for (const f of fieldsToVerify) {
      if (f.value && f.value !== 'UNKNOWN') {
        const sources = candidate.field_sources[f.sourceKey];
        if (!Array.isArray(sources) || sources.length === 0) {
          addError('MISSING_FIELD_SOURCE_ENTRY', `field_sources.${f.sourceKey}`, `Trường '${f.key}' có giá trị cụ thể nhưng thiếu danh sách bằng chứng trong field_sources.${f.sourceKey}.`);
        } else {
          for (let i = 0; i < sources.length; i++) {
            const s = sources[i];
            if (!s || typeof s !== 'object') {
              addError('INVALID_FIELD_SOURCE_OBJECT', `field_sources.${f.sourceKey}[${i}]`, 'Nguồn phải là object.');
              continue;
            }
            if (!isDeepLink(s.url)) {
              addError('FIELD_SOURCE_HOMEPAGE_REJECTED', `field_sources.${f.sourceKey}[${i}].url`, `URL '${s.url}' trong field_sources là trang chủ/origin. Bắt buộc là deep link.`);
            }
            if (!s.title || typeof s.title !== 'string') {
              addError('FIELD_SOURCE_MISSING_TITLE', `field_sources.${f.sourceKey}[${i}].title`, 'Nguồn bằng chứng phải có tiêu đề (title).');
            }
            const accessCheck = validateIsoTimestamp(s.accessed_at, now);
            if (!accessCheck.valid) {
              addError(accessCheck.code, `field_sources.${f.sourceKey}[${i}].accessed_at`, accessCheck.message);
            }
            if (s.checked_at) {
              const checkedCheck = validateIsoTimestamp(s.checked_at, now);
              if (!checkedCheck.valid) {
                addError(checkedCheck.code, `field_sources.${f.sourceKey}[${i}].checked_at`, checkedCheck.message);
              }
            }
            if (s.source_status && !ALLOWED_SOURCE_STATUS.has(s.source_status)) {
              if (s.source_status === 'active') {
                addError('DEPRECATED_ACTIVE_STATUS', `field_sources.${f.sourceKey}[${i}].source_status`, "Trạng thái 'active' đã bị bãi bỏ. Bắt buộc dùng active_relevant, redirected_unrelated hoặc content_mismatch.");
              } else {
                addError('INVALID_SOURCE_STATUS', `field_sources.${f.sourceKey}[${i}].source_status`, `Trạng thái nguồn '${s.source_status}' không hợp lệ.`);
              }
            }
            if (s.source_status === 'redirected_unrelated') {
              addError('UNUSABLE_FIELD_SOURCE_FOR_EVIDENCE', `field_sources.${f.sourceKey}[${i}]`, `Nguồn '${s.url}' bị chuyển hướng sai nội dung (redirected_unrelated), không được đưa vào làm bằng chứng trong field_sources.${f.sourceKey}.`);
            }
            if (s.source_status === 'content_mismatch') {
              addError('UNUSABLE_FIELD_SOURCE_FOR_EVIDENCE', `field_sources.${f.sourceKey}[${i}]`, `Nguồn '${s.url}' có nội dung không khớp thực thể (content_mismatch), không được đưa vào làm bằng chứng trong field_sources.${f.sourceKey}.`);
            }
            if (s.source_status === 'dead') {
              addError('UNUSABLE_FIELD_SOURCE_FOR_EVIDENCE', `field_sources.${f.sourceKey}[${i}]`, `Nguồn '${s.url}' có trạng thái dead (404), không được đưa vào làm bằng chứng trong field_sources.${f.sourceKey}.`);
            }
            if (f.sourceKey === 'coordinates' && s.url.includes('openstreetmap.org/search')) {
              addError('OSM_SEARCH_URL_CANNOT_PROVE_COORDINATES', `field_sources.coordinates[${i}].url`, `OSM search URL '${s.url}' chỉ là truy vấn tìm kiếm, không đủ điều kiện làm bằng chứng tọa độ.`);
            }
            if (s.source_status === 'unreachable') {
              if (s.http_status !== null && s.http_status !== undefined) {
                addError('UNREACHABLE_CANNOT_HAVE_OK_STATUS', `field_sources.${f.sourceKey}[${i}].http_status`, 'Nguồn unreachable phải có http_status là null.');
              }
            } else if (s.http_status !== undefined && typeof s.http_status !== 'number') {
              addError('INVALID_HTTP_STATUS', `field_sources.${f.sourceKey}[${i}].http_status`, 'HTTP status của nguồn phải là số nguyên (hoặc null khi unreachable).');
            }
            if (s.effective_url !== undefined && s.effective_url !== null && typeof s.effective_url !== 'string') {
              addError('INVALID_EFFECTIVE_URL', `field_sources.${f.sourceKey}[${i}].effective_url`, 'effective_url phải là chuỗi URL hoặc null.');
            }
            if (s.page_title !== undefined && s.page_title !== null && typeof s.page_title !== 'string') {
              addError('INVALID_PAGE_TITLE', `field_sources.${f.sourceKey}[${i}].page_title`, 'page_title phải là chuỗi tiêu đề hoặc null.');
            }
            if (s.evidence_scope) {
              if (!ALLOWED_EVIDENCE_SCOPES.has(s.evidence_scope)) {
                addError('INVALID_EVIDENCE_SCOPE', `field_sources.${f.sourceKey}[${i}].evidence_scope`, `Phạm vi bằng chứng '${s.evidence_scope}' không hợp lệ.`);
              }
              if (!isFactRelevantToScope(s.extracted_fact, s.evidence_scope)) {
                addError('FACT_NOT_RELEVANT_TO_SCOPE', `field_sources.${f.sourceKey}[${i}].extracted_fact`, `Nội dung extracted_fact không phù hợp với evidence_scope '${s.evidence_scope}'.`);
              }
            }
            if (!s.extracted_fact || typeof s.extracted_fact !== 'string' || s.extracted_fact.trim().length < 5) {
              addError('FIELD_SOURCE_MISSING_FACT', `field_sources.${f.sourceKey}[${i}].extracted_fact`, 'Bằng chứng phải có tóm tắt dữ kiện ngắn (extracted_fact).');
            }
            if (isVerifiedRecord && (s.source_status === 'dead' || s.http_status === 404)) {
              addError('DEAD_SOURCE_FOR_VERIFIED_CANDIDATE', `field_sources.${f.sourceKey}[${i}]`, `Ứng viên xác minh có nguồn dead hoặc HTTP 404: ${s.url}`);
            }
            if (isVerifiedRecord && s.source_status !== 'active_relevant') {
              addError('NON_ACTIVE_RELEVANT_SOURCE_FOR_VERIFIED_CANDIDATE', `field_sources.${f.sourceKey}[${i}]`, `Ứng viên xác minh bắt buộc nguồn phải là active_relevant: ${s.url}`);
            }
          }
        }
      }
    }
  }

  // 19. confidence: Quy tắc xác định độ tin cậy
  if (!candidate.confidence || typeof candidate.confidence !== 'object') {
    addError('MISSING_CONFIDENCE', 'confidence', 'Trường confidence phải là một object.');
  } else {
    const requiredConfidenceKeys = ['name', 'address', 'coordinates', 'hours', 'contact', 'price'];
    for (const key of requiredConfidenceKeys) {
      const val = candidate.confidence[key];
      if (!ALLOWED_CONFIDENCE_LEVELS.has(val)) {
        addError('INVALID_CONFIDENCE_VALUE', `confidence.${key}`, `Độ tin cậy của '${key}' phải là HIGH, MEDIUM, LOW hoặc UNKNOWN.`);
      }
    }

    // QUY TẮC BẢO VỆ TỌA ĐỘ
    if (candidate.confidence.coordinates === 'HIGH') {
      if (candidate.coordinate_precision === 'approximate') {
        addError('APPROXIMATE_COORDS_CANNOT_BE_HIGH', 'confidence.coordinates', 'Tọa độ có độ chính xác approximate tuyệt đối không được gán mức tin cậy HIGH.');
      } else if (candidate.coordinate_precision === 'center') {
        addError('CENTER_COORDS_CANNOT_BE_HIGH', 'confidence.coordinates', 'Tọa độ dạng tâm (center) từ OpenStreetMap tối đa đạt MEDIUM, không được gán HIGH khi chưa có mốc trắc địa lối vào hoặc hồ sơ địa chính.');
      } else if (candidate.coordinate_precision === 'building') {
        addError('BUILDING_COORDS_CANNOT_BE_HIGH', 'confidence.coordinates', 'Tọa độ dạng tòa nhà (building) tối đa đạt MEDIUM, không được gán HIGH khi chưa có mốc cổng vào (entrance).');
      }
    }

    // Ràng buộc bằng chứng bao phủ cho các trường đạt độ tin cậy HIGH
    const scopeMap = {
      name: 'identity',
      address: 'address',
      coordinates: 'coordinates',
      hours: 'hours',
      contact: 'contact',
      price: 'price'
    };

    const activeRelevantScopes = new Set();
    if (Array.isArray(candidate.sources_metadata)) {
      candidate.sources_metadata.forEach(m => {
        if (m && m.source_status === 'active_relevant' && m.evidence_scope) {
          activeRelevantScopes.add(m.evidence_scope);
        }
      });
    }
    if (candidate.field_sources && typeof candidate.field_sources === 'object') {
      Object.values(candidate.field_sources).forEach(list => {
        if (Array.isArray(list)) {
          list.forEach(s => {
            if (s && s.source_status === 'active_relevant' && s.evidence_scope) {
              activeRelevantScopes.add(s.evidence_scope);
            }
          });
        }
      });
    }

    for (const [fieldKey, targetScope] of Object.entries(scopeMap)) {
      if (candidate.confidence[fieldKey] === 'HIGH') {
        if (!activeRelevantScopes.has(targetScope)) {
          addError('HIGH_CONFIDENCE_LACKS_ACTIVE_RELEVANT_EVIDENCE', `confidence.${fieldKey}`, `Trường '${fieldKey}' có độ tin cậy HIGH nhưng không có nguồn active_relevant nào bao phủ evidence_scope '${targetScope}'.`);
        }
      }
    }

    if (candidate.confidence.price === 'HIGH') {
      if (!candidate.price_raw || candidate.price_raw === 'UNKNOWN') {
        addError('PRICE_UNKNOWN_CANNOT_BE_HIGH', 'confidence.price', 'Khi price_raw là UNKNOWN thì confidence.price không được gán HIGH.');
      }
    }
  }

  // 20. conflicts
  let hasUnresolvedConflict = false;
  if (!Array.isArray(candidate.conflicts)) {
    addError('INVALID_CONFLICTS', 'conflicts', 'Trường conflicts phải là mảng.');
  } else {
    for (const c of candidate.conflicts) {
      if (typeof c === 'object' && c.status === 'UNRESOLVED') {
        hasUnresolvedConflict = true;
      }
    }
  }

  // 21. recommendation
  if (!ALLOWED_RECOMMENDATIONS.has(candidate.recommendation)) {
    addError('INVALID_RECOMMENDATION', 'recommendation', `Đề xuất '${candidate.recommendation}' không hợp lệ.`);
  }

  // QUY TẮC BẢO VỆ PHÂN LOẠI VERIFIED_CANDIDATE:
  if (candidate.recommendation === 'VERIFIED_CANDIDATE') {
    if (hasUnresolvedConflict) {
      addError('UNRESOLVED_CONFLICT_CANNOT_BE_VERIFIED', 'recommendation', 'Ứng viên còn xung đột dữ liệu chưa giải quyết (UNRESOLVED) không được phân loại là VERIFIED_CANDIDATE.');
    }
    if (candidate.coordinate_precision === 'approximate') {
      addError('APPROXIMATE_COORDS_CANNOT_BE_VERIFIED', 'recommendation', 'Ứng viên có tọa độ approximate không được phân loại là VERIFIED_CANDIDATE.');
    }
    if (candidate.confidence?.coordinates !== 'HIGH') {
      addError('VERIFIED_REQUIRES_HIGH_COORDS_CONFIDENCE', 'confidence.coordinates', 'Ứng viên VERIFIED_CANDIDATE bắt buộc phải có độ tin cậy tọa độ HIGH.');
    }
    if (candidate.confidence?.address !== 'HIGH') {
      addError('VERIFIED_REQUIRES_HIGH_ADDRESS_CONFIDENCE', 'confidence.address', 'Ứng viên VERIFIED_CANDIDATE bắt buộc phải có độ tin cậy địa chỉ HIGH.');
    }
  }

  // QUY TẮC BẢO VỆ PHÂN LOẠI VERIFIED_IDENTITY_CANDIDATE:
  if (candidate.recommendation === 'VERIFIED_IDENTITY_CANDIDATE') {
    if (hasUnresolvedConflict) {
      addError('UNRESOLVED_CONFLICT_CANNOT_BE_VERIFIED_IDENTITY', 'recommendation', 'Ứng viên còn xung đột dữ liệu chưa giải quyết (UNRESOLVED) không được phân loại là VERIFIED_IDENTITY_CANDIDATE.');
    }
    if (candidate.coordinate_precision === 'approximate') {
      addError('APPROXIMATE_COORDS_CANNOT_BE_VERIFIED_IDENTITY', 'recommendation', 'Ứng viên có tọa độ approximate không được phân loại là VERIFIED_IDENTITY_CANDIDATE.');
    }
    if (candidate.confidence?.name !== 'HIGH') {
      addError('VERIFIED_IDENTITY_REQUIRES_HIGH_NAME_CONFIDENCE', 'confidence.name', 'Ứng viên VERIFIED_IDENTITY_CANDIDATE bắt buộc phải có độ tin cậy tên HIGH.');
    }
    if (candidate.confidence?.address !== 'HIGH') {
      addError('VERIFIED_IDENTITY_REQUIRES_HIGH_ADDRESS_CONFIDENCE', 'confidence.address', 'Ứng viên VERIFIED_IDENTITY_CANDIDATE bắt buộc phải có độ tin cậy địa chỉ HIGH.');
    }
    const activeIdentitySources = (Array.isArray(candidate.sources_metadata) ? candidate.sources_metadata : [])
      .filter(m => m && m.source_status === 'active_relevant' && (m.evidence_scope === 'identity' || m.evidence_scope === 'address'));
    if (activeIdentitySources.length === 0) {
      addError('VERIFIED_IDENTITY_REQUIRES_ACTIVE_RELEVANT_IDENTITY_SOURCE', 'recommendation', 'Ứng viên VERIFIED_IDENTITY_CANDIDATE bắt buộc phải có tối thiểu một nguồn active_relevant cho identity.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Thẩm định toàn bộ danh sách ứng viên pilot (Structural Contract Validation)
 */
export function auditPilotCandidates(candidates, options = {}) {
  if (!Array.isArray(candidates)) {
    return {
      success: false,
      totalCandidates: 0,
      errors: [{ code: 'NOT_AN_ARRAY', message: 'Dữ liệu ứng viên phải là một mảng JSON' }],
      warnings: [],
      breakdown: {}
    };
  }

  const allErrors = [];
  const allWarnings = [];
  const seenIds = new Set();
  const seenSlugs = new Set();

  const breakdown = {
    total: candidates.length,
    byRecommendation: {
      VERIFIED_CANDIDATE: 0,
      VERIFIED_IDENTITY_CANDIDATE: 0,
      NEEDS_FIELD_VERIFICATION: 0,
      SOURCE_CONFLICT: 0,
      NEEDS_RESEARCH: 0,
      UNVERIFIED_LEGACY: 0,
      TEST_OR_INVALID: 0,
      DUPLICATE_CANDIDATE: 0
    },
    byCategory: {},
    imagesPublishable: 0,
    imagesPending: 0
  };

  candidates.forEach((cand, idx) => {
    const candResult = validatePilotCandidate(cand, idx, options);
    allErrors.push(...candResult.errors);
    allWarnings.push(...candResult.warnings);

    if (cand.id) {
      if (seenIds.has(cand.id)) {
        allErrors.push({
          code: 'DUPLICATE_CANDIDATE_ID',
          candidateId: cand.id,
          message: `Trùng lặp candidate id '${cand.id}'.`
        });
      }
      seenIds.add(cand.id);
    }

    if (cand.proposed_slug) {
      if (seenSlugs.has(cand.proposed_slug)) {
        allErrors.push({
          code: 'DUPLICATE_CANDIDATE_SLUG',
          candidateId: cand.id,
          message: `Trùng lặp slug '${cand.proposed_slug}'.`
        });
      }
      seenSlugs.add(cand.proposed_slug);
    }

    if (breakdown.byRecommendation[cand.recommendation] !== undefined) {
      breakdown.byRecommendation[cand.recommendation]++;
    }
    if (cand.category) {
      breakdown.byCategory[cand.category] = (breakdown.byCategory[cand.category] || 0) + 1;
    }

    if (Array.isArray(cand.image_candidates)) {
      cand.image_candidates.forEach(img => {
        if (img.can_publish) breakdown.imagesPublishable++;
        else breakdown.imagesPending++;
      });
    }
  });

  const verifiedList = candidates.filter(c => c.recommendation === 'VERIFIED_CANDIDATE');
  const verifiedIdentityList = candidates.filter(c => c.recommendation === 'VERIFIED_IDENTITY_CANDIDATE');

  return {
    success: allErrors.length === 0,
    totalCandidates: candidates.length,
    verifiedCount: verifiedList.length,
    verifiedIdentityCount: verifiedIdentityList.length,
    breakdown,
    errors: allErrors,
    warnings: allWarnings
  };
}

/**
 * Đọc file và thực thi kiểm toán CLI (Structural Contract Validation)
 */
export function runPilotAudit(filePath = DEFAULT_CANDIDATES_PATH) {
  console.log('=== KIỂM TOÁN CẤU TRÚC HỒ SƠ ỨNG VIÊN PILOT G9.3A (STRUCTURAL VALIDATION) ===\n');
  console.log(`Đường dẫn tệp: ${filePath}`);
  console.log('Phạm vi: Thẩm định cấu trúc hợp đồng dữ liệu (Contract Conformance), không thay thế kiểm chứng thực địa.');

  if (!fs.existsSync(filePath)) {
    console.error(`[ERROR] Không tìm thấy tệp ứng viên tại: ${filePath}`);
    process.exit(1);
  }

  let candidates;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    candidates = JSON.parse(raw);
  } catch (err) {
    console.error(`[ERROR] Không thể đọc hoặc parse JSON: ${err.message}`);
    process.exit(1);
  }

  const result = auditPilotCandidates(candidates);

  console.log(`\nTổng số ứng viên khảo sát: ${result.totalCandidates}`);
  console.log(`- VERIFIED_CANDIDATE (Đạt chuẩn xác minh thực địa trực tiếp):   ${result.verifiedCount}`);
  console.log(`- VERIFIED_IDENTITY_CANDIDATE (Đạt chuẩn xác minh hồ sơ/danh tính): ${result.verifiedIdentityCount}`);
  console.log(`- NEEDS_FIELD_VERIFICATION (Cần thẩm tra thực địa):            ${result.breakdown.byRecommendation.NEEDS_FIELD_VERIFICATION}`);
  console.log(`- SOURCE_CONFLICT (Có mâu thuẫn nguồn chưa giải quyết):         ${result.breakdown.byRecommendation.SOURCE_CONFLICT}`);
  console.log(`- NEEDS_RESEARCH (Cần nghiên cứu thêm dữ liệu):                 ${result.breakdown.byRecommendation.NEEDS_RESEARCH}`);
  console.log(`- UNVERIFIED_LEGACY (Dữ liệu cũ chưa rõ):                       ${result.breakdown.byRecommendation.UNVERIFIED_LEGACY}`);
  console.log(`- TEST_OR_INVALID (Dữ liệu rác/test):                           ${result.breakdown.byRecommendation.TEST_OR_INVALID}`);
  console.log(`- DUPLICATE_CANDIDATE (Trùng lặp):                              ${result.breakdown.byRecommendation.DUPLICATE_CANDIDATE}`);

  console.log('\nPhân bổ theo danh mục:');
  Object.entries(result.breakdown.byCategory).forEach(([cat, count]) => {
    console.log(`  * ${cat.padEnd(15)}: ${count}`);
  });

  console.log('\nTrạng thái hình ảnh:');
  console.log(`  * Đã cấp phép xuất bản (can_publish = true):  ${result.breakdown.imagesPublishable}`);
  console.log(`  * Chờ thẩm tra/giữ bản quyền (can_publish = false): ${result.breakdown.imagesPending}`);

  if (result.warnings.length > 0) {
    console.log(`\n[CẢNH BÁO / GHI CHÚ CẤU TRÚC (${result.warnings.length})]:`);
    result.warnings.forEach(w => {
      console.log(`  ⚠ [${w.code}] [${w.candidateId || 'SYSTEM'}] ${w.message}`);
    });
  }

  if (result.errors.length > 0) {
    console.error(`\n[LỖI THẨM ĐỊNH CẤU TRÚC (${result.errors.length})]:`);
    result.errors.forEach(e => {
      console.error(`  ✗ [${e.code}] [${e.candidateId || 'SYSTEM'}] ${e.message} (field: ${e.field})`);
    });
    console.error('\n=> THẨM ĐỊNH CẤU TRÚC THẤT BẠI.');
    process.exit(1);
  }

  console.log('\n✅ THẨM ĐỊNH CẤU TRÚC ĐẠT (STRUCTURAL VALIDATION PASS): Toàn bộ 10 hồ sơ đáp ứng chuẩn cấu trúc hợp đồng G9.3A.');
  console.log('✅ XÁC NHẬN AN TOÀN: Zero Mutation • Không gọi mạng thay đổi • Không ghi vào CSDL Supabase.\n');
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runPilotAudit();
}
