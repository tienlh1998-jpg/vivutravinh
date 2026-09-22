// js/place-validator.js
// Shared Data Quality Validator cho thực thể Địa Điểm (places) - G9.1
// Thuần ES Module, chạy độc lập trên Browser, Node.js runtime và Serverless functions.
// Tuyệt đối không đọc DOM, không gọi mạng, không mutation input object.

export const TRA_VINH_BOUNDS = Object.freeze({
  MIN_LAT: 9.25,
  MAX_LAT: 10.15,
  MIN_LNG: 105.80,
  MAX_LNG: 106.70
});

export const VALID_PLACE_STATUSES = Object.freeze(new Set([
  'approved',
  'draft',
  'hidden',
  'archived'
]));

export const ALLOWED_GOOGLE_MAPS_HOSTS = Object.freeze(new Set([
  'maps.google.com',
  'www.google.com',
  'google.com',
  'www.google.com.vn',
  'google.com.vn',
  'maps.app.goo.gl',
  'goo.gl'
]));

const DANGEROUS_PROTOCOLS = Object.freeze(new Set([
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
  'ftp:',
  'blob:'
]));

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Định dạng giờ 24h chuẩn HH:mm: 00:00 đến 23:59 (bắt buộc 2 chữ số giờ và 2 chữ số phút)
const TIME_HH_MM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// Strict decimal regex cho từng thành phần lat/lng:
// Cho phép dấu tùy chọn (+ hoặc -), theo sau bởi các chữ số nguyên, và phần thập phân tùy chọn (. theo sau bởi các chữ số).
// Chặn dứt khoát: ký tự chữ (abc, xyz), ký hiệu khoa học (9e0), Infinity, NaN, nhiều dấu chấm (9..3).
export const STRICT_COORD_DECIMAL_REGEX = /^[+-]?\d+(?:\.\d+)?$/;

/**
 * Kiểm tra tính an toàn của một URL hoặc đường dẫn tệp tĩnh (chặn script injection, protocol lạ, protocol-relative, path traversal)
 * - Cho phép https:// và http://
 * - Cho phép đường dẫn local tương đối an toàn: bắt đầu bằng '/', './', 'images/', 'assets/' (không phải '//')
 * - Chặn tuyệt đối: ftp:, javascript:, data:, vbscript:, file:, blob:, protocol-relative // và các giao thức tùy ý khác
 * - Chặn path traversal trong local asset: segment '..', '.', backslash, encoded traversal (%2e%2e, %2E%2E, %5c)
 * - Không bao giờ throw nếu decodeURIComponent gặp lỗi chuỗi percent-encoding
 * 
 * @param {string} rawUrl 
 * @returns {{ isSafe: boolean, isLocal?: boolean, urlObj: URL | null, reason?: string }}
 */
export function inspectSafeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isSafe: false, urlObj: null, reason: 'URL rỗng hoặc không phải chuỗi' };
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { isSafe: false, urlObj: null, reason: 'URL chỉ chứa khoảng trắng' };
  }

  // Chặn protocol-relative URLs (ví dụ: //evil.com/xss)
  if (trimmed.startsWith('//')) {
    return { isSafe: false, urlObj: null, reason: 'Protocol-relative URL bị chặn' };
  }

  // Giải mã an toàn chuỗi percent-encoding trước khi phân tích
  // Tuyệt đối không throw nếu decodeURIComponent gặp chuỗi percent-encoding dị dạng
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return { isSafe: false, urlObj: null, reason: 'URL chứa chuỗi percent-encoding không hợp lệ' };
  }

  // Giải mã lớp thứ hai nếu còn ký tự % để phòng chống nested / double encoding (%252e%252e)
  if (decoded.includes('%')) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      return { isSafe: false, urlObj: null, reason: 'URL chứa chuỗi percent-encoding lồng nhau không hợp lệ' };
    }
  }

  // Chặn protocol-relative sau khi giải mã
  if (decoded.startsWith('//')) {
    return { isSafe: false, urlObj: null, reason: 'Protocol-relative URL bị chặn' };
  }

  // Kiểm tra danh sách giao thức nguy hiểm đã biết trên cả raw và decoded
  const lowerTrimmed = trimmed.toLowerCase();
  const lowerDecoded = decoded.toLowerCase();
  for (const proto of DANGEROUS_PROTOCOLS) {
    if (lowerTrimmed.startsWith(proto) || lowerDecoded.startsWith(proto)) {
      return { isSafe: false, urlObj: null, reason: `Giao thức không an toàn: ${proto}` };
    }
  }

  // Kiểm tra đường dẫn local an toàn (assets nội bộ)
  const isLocalCandidate = trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('.\\') ||
    trimmed.startsWith('\\') ||
    trimmed.startsWith('images/') ||
    trimmed.startsWith('images\\') ||
    trimmed.startsWith('assets/') ||
    trimmed.startsWith('assets\\') ||
    trimmed.startsWith('..') ||
    decoded.startsWith('..');

  if (isLocalCandidate) {
    // Kiểm tra ký tự điều khiển hoặc ký tự nguy hại tiềm ẩn injection
    if (/[\0\r\n<>\"\'\`]/.test(trimmed) || /[\0\r\n<>\"\'\`]/.test(decoded)) {
      return { isSafe: false, isLocal: true, urlObj: null, reason: 'Đường dẫn local chứa ký tự không hợp lệ hoặc nguy hại' };
    }

    // Chặn dứt khoát backslash trong đường dẫn local
    if (trimmed.includes('\\') || decoded.includes('\\')) {
      return { isSafe: false, isLocal: true, urlObj: null, reason: 'Đường dẫn local chứa ký tự backslash bị cấm' };
    }

    // Kiểm tra segment traversal: cấm '..' và '.' (ngoại trừ tiền tố './' ban đầu được phép)
    const pathWithoutInitialDotSlash = decoded.startsWith('./') ? decoded.slice(2) : decoded;
    const segments = pathWithoutInitialDotSlash.split('/');

    for (const seg of segments) {
      if (seg === '.' || seg === '..') {
        return {
          isSafe: false,
          isLocal: true,
          urlObj: null,
          reason: `Đường dẫn local chứa segment traversal bị cấm: '${seg}'`
        };
      }
    }

    // Kiểm tra đường dẫn không được rỗng sau khi bỏ dấu slash
    if (pathWithoutInitialDotSlash.replace(/^\/+/, '').trim() === '') {
      return { isSafe: false, isLocal: true, urlObj: null, reason: 'Đường dẫn local rỗng hoặc chỉ trỏ vào thư mục gốc' };
    }

    return { isSafe: true, isLocal: true, urlObj: null };
  }

  // Thử phân tích cú pháp chuẩn URL
  try {
    const urlObj = new URL(trimmed);
    const proto = urlObj.protocol.toLowerCase();

    // Chỉ chấp nhận HTTPS và HTTP (HTTP cho legacy backend nếu cần)
    if (proto !== 'https:' && proto !== 'http:') {
      return {
        isSafe: false,
        urlObj,
        reason: `Giao thức không được hỗ trợ: ${urlObj.protocol} (chỉ chấp nhận https://, http:// hoặc đường dẫn local an toàn)`
      };
    }

    return { isSafe: true, isLocal: false, urlObj };
  } catch {
    return { isSafe: false, urlObj: null, reason: 'URL không đúng định dạng chuẩn và không phải đường dẫn local an toàn' };
  }
}

/**
 * Kiểm tra tính hợp lệ của đường dẫn Google Maps
 * @param {string} rawUrl 
 * @returns {{ valid: boolean, code?: string, message?: string }}
 */
export function validateGoogleMapsUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { valid: true }; // Không có URL thì không vi phạm lỗi maps (sẽ xử lý ở cảnh báo thiếu)
  }

  const inspection = inspectSafeUrl(rawUrl);
  if (!inspection.isSafe || !inspection.urlObj) {
    return {
      valid: false,
      code: 'INSECURE_MAP_URL',
      message: 'Đường dẫn Google Maps không hợp lệ hoặc chứa giao thức không an toàn.'
    };
  }

  const { urlObj } = inspection;
  const protocol = urlObj.protocol.toLowerCase();
  if (protocol !== 'https:') {
    return {
      valid: false,
      code: 'INSECURE_MAP_URL',
      message: 'Đường dẫn Google Maps bắt buộc phải sử dụng giao thức bảo mật HTTPS.'
    };
  }

  const hostname = urlObj.hostname.toLowerCase();
  if (!ALLOWED_GOOGLE_MAPS_HOSTS.has(hostname)) {
    return {
      valid: false,
      code: 'DISALLOWED_MAP_HOST',
      message: 'Tên miền Google Maps không thuộc danh sách cho phép (chỉ chấp nhận google.com, maps.google.com, maps.app.goo.gl, goo.gl).'
    };
  }

  // Đối với google.com, google.com.vn, www.google.com: cần đường dẫn maps/place/search hoặc tham số q
  if (hostname === 'google.com' || hostname === 'www.google.com' || hostname === 'google.com.vn' || hostname === 'www.google.com.vn') {
    const p = urlObj.pathname.toLowerCase();
    const hasMapsPath = p.startsWith('/maps') || p.startsWith('/place') || p.startsWith('/search');
    const hasSearchQuery = urlObj.searchParams.has('q');
    if (!hasMapsPath && !hasSearchQuery) {
      return {
        valid: false,
        code: 'DISALLOWED_MAP_HOST',
        message: 'Đường dẫn Google Maps chưa đúng cấu trúc định vị (cần /maps hoặc tham số tìm kiếm ?q=).'
      };
    }
  }

  // Đối với goo.gl: cần đường dẫn bắt đầu bằng /maps
  if (hostname === 'goo.gl') {
    if (!urlObj.pathname.toLowerCase().startsWith('/maps')) {
      return {
        valid: false,
        code: 'DISALLOWED_MAP_HOST',
        message: 'Đường dẫn goo.gl không phải liên kết Google Maps hợp lệ.'
      };
    }
  }

  return { valid: true };
}

/**
 * Phân tích và kiểm tra tọa độ GPS
 * - Trước khi parse số, mỗi thành phần lat/lng phải khớp toàn bộ chuỗi số thập phân hợp lệ
 * - Chấp nhận khoảng trắng quanh dấu phẩy và dấu (+/-)
 * - Từ chối: ký tự chữ (abc, xyz), ký hiệu khoa học (9e0), Infinity, NaN, nhiều dấu chấm (9..3)
 * - Chỉ parse Number sau khi regex toàn chuỗi đã đạt
 * - Sau đó mới kiểm tra bounding box Trà Vinh
 * 
 * @param {string} rawCoords 
 * @returns {{ valid: boolean, parsed?: { lat: number, lng: number }, code?: string, message?: string }}
 */
export function validateCoordinates(rawCoords) {
  if (!rawCoords || typeof rawCoords !== 'string' || !rawCoords.trim()) {
    return { valid: true, parsed: null }; // Rỗng sẽ xử lý ở cảnh báo thiếu
  }

  const parts = rawCoords.split(',');
  if (parts.length !== 2) {
    return {
      valid: false,
      code: 'INVALID_COORDINATES_FORMAT',
      message: 'Tọa độ GPS phải đúng định dạng "lat,lng" (ví dụ: 9.9347,106.3449).'
    };
  }

  const rawLat = parts[0].trim();
  const rawLng = parts[1].trim();

  // Strict parser: Mỗi thành phần phải khớp toàn bộ chuỗi số thập phân hợp lệ
  if (!STRICT_COORD_DECIMAL_REGEX.test(rawLat) || !STRICT_COORD_DECIMAL_REGEX.test(rawLng)) {
    return {
      valid: false,
      code: 'INVALID_COORDINATES_FORMAT',
      message: 'Tọa độ GPS chứa giá trị không hợp lệ (mỗi thành phần vĩ độ/kinh độ phải là chuỗi số thập phân hợp lệ, không chứa ký tự chữ, số mũ khoa học hoặc NaN/Infinity).'
    };
  }

  // Chỉ parse Number sau khi regex toàn chuỗi đã đạt
  const lat = Number(rawLat);
  const lng = Number(rawLng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      valid: false,
      code: 'INVALID_COORDINATES_FORMAT',
      message: 'Tọa độ GPS chứa giá trị không hợp lệ (không phải số thực hữu hạn).'
    };
  }

  // Sau đó mới kiểm tra bounding box Trà Vinh
  const inLatRange = lat >= TRA_VINH_BOUNDS.MIN_LAT && lat <= TRA_VINH_BOUNDS.MAX_LAT;
  const inLngRange = lng >= TRA_VINH_BOUNDS.MIN_LNG && lng <= TRA_VINH_BOUNDS.MAX_LNG;

  if (!inLatRange || !inLngRange) {
    return {
      valid: false,
      code: 'COORDINATES_OUT_OF_BOUNDS',
      message: `Tọa độ GPS (${lat}, ${lng}) nằm ngoài phạm vi địa lý tỉnh Trà Vinh (Vĩ độ ${TRA_VINH_BOUNDS.MIN_LAT}°–${TRA_VINH_BOUNDS.MAX_LAT}°N, Kinh độ ${TRA_VINH_BOUNDS.MIN_LNG}°–${TRA_VINH_BOUNDS.MAX_LNG}°E).`
    };
  }

  return { valid: true, parsed: { lat, lng } };
}

/**
 * Kiểm tra xem một giá trị khoảng giá có được coi là ĐÃ CUNG CẤP hay không
 * "0đ", "Miễn phí", "0", "Free" đều là giá trị hợp lệ, không tính là thiếu.
 * @param {any} rawPrice 
 * @returns {boolean}
 */
export function hasPriceValue(rawPrice) {
  if (rawPrice === null || rawPrice === undefined) return false;
  const str = String(rawPrice).trim();
  return str.length > 0;
}

/**
 * Kiểm tra xem một giá trị giờ có được coi là ĐÃ CUNG CẤP hay không
 * "00:00" là mốc nửa đêm hợp lệ, không tính là thiếu.
 * @param {any} rawTime 
 * @returns {boolean}
 */
export function hasTimeValue(rawTime) {
  if (rawTime === null || rawTime === undefined) return false;
  const str = String(rawTime).trim();
  return str.length > 0;
}

/**
 * Kiểm tra định dạng giờ 24h chuẩn (HH:mm)
 * @param {any} rawTime 
 * @returns {{ valid: boolean, code?: string, message?: string }}
 */
export function validateTimeFormat(rawTime) {
  if (!hasTimeValue(rawTime)) {
    return { valid: true };
  }
  const str = String(rawTime).trim();
  if (!TIME_HH_MM_REGEX.test(str)) {
    return {
      valid: false,
      code: 'INVALID_TIME_FORMAT',
      message: `Giá trị thời gian '${str}' không đúng định dạng 24 giờ HH:mm (ví dụ: 06:00, 00:00, 18:00, 02:00).`
    };
  }
  return { valid: true };
}

/**
 * Thẩm định patch cho một bản ghi địa điểm ĐÃ ĐƯỢC PHÊ DUYỆT TRƯỚC ĐÓ (legacy approved place)
 * - Không chặn vì thiếu các trường cũ của bản ghi
 * - Nhưng nếu patch trực tiếp cung cấp URL/GPS/ảnh nguy hiểm hoặc sai cú pháp thì bắt buộc chặn
 * 
 * @param {object} patch 
 * @returns {{
 *   valid: boolean,
 *   errors: Array<{ code: string, field: string, message: string }>,
 *   warnings: Array<{ code: string, field: string, message: string }>
 * }}
 */
export function validatePatchForApprovedLegacy(patch) {
  const target = patch || {};
  const errors = [];
  const warnings = [];

  const addError = (code, field, message) => {
    errors.push({ code, field, message });
  };
  const addWarning = (code, field, message) => {
    warnings.push({ code, field, message });
  };

  // 1. Tên địa điểm (nếu có trong patch: 3–150 ký tự)
  if (target.name !== undefined) {
    const name = String(target.name || '').trim();
    if (!name || name.length < 3 || name.length > 150) {
      addError('INVALID_NAME', 'name', 'Tên địa điểm phải có độ dài từ 3 đến 150 ký tự.');
    }
  }

  // 2. Slug (nếu có trong patch)
  if (target.slug !== undefined) {
    const slug = String(target.slug || '').trim();
    if (!slug || !SLUG_REGEX.test(slug)) {
      addError('INVALID_SLUG', 'slug', 'Slug không đúng định dạng URL chuẩn (chỉ gồm chữ thường không dấu, số và dấu gạch ngang đơn).');
    }
  }

  // 3. Status (nếu có trong patch)
  if (target.status !== undefined && target.status !== null) {
    const statusStr = String(target.status).trim();
    if (!VALID_PLACE_STATUSES.has(statusStr)) {
      addError('INVALID_STATUS', 'status', `Trạng thái '${statusStr}' không hợp lệ.`);
    }
  }

  // 4. Coordinates (nếu có trong patch)
  if (target.coordinates !== undefined && target.coordinates !== null && String(target.coordinates).trim()) {
    const coordResult = validateCoordinates(String(target.coordinates).trim());
    if (!coordResult.valid) {
      addError(coordResult.code, 'coordinates', coordResult.message);
    }
  }

  // 5. Google Maps URL (nếu có trong patch)
  if (target.map_link !== undefined && target.map_link !== null && String(target.map_link).trim()) {
    const mapResult = validateGoogleMapsUrl(String(target.map_link).trim());
    if (!mapResult.valid) {
      addError(mapResult.code, 'map_link', mapResult.message);
    }
  }

  // 6. Hình ảnh (nếu có trong patch)
  const checkImages = [];
  if (target.image_link && typeof target.image_link === 'string') {
    checkImages.push(target.image_link.trim());
  }
  if (Array.isArray(target.images)) {
    for (const img of target.images) {
      if (typeof img === 'string' && img.trim()) {
        checkImages.push(img.trim());
      }
    }
  }
  for (const imgUrl of checkImages) {
    const inspect = inspectSafeUrl(imgUrl);
    if (!inspect.isSafe) {
      addError('INSECURE_IMAGE_URL', 'images', 'Đường dẫn hình ảnh chứa giao thức không an toàn hoặc không được hỗ trợ.');
      break;
    }
    if (inspect.urlObj) {
      const h = inspect.urlObj.hostname.toLowerCase();
      if (h.includes('drive.google.com') || h.includes('docs.google.com')) {
        addWarning('WARN_DRIVE_IMAGE_LINK', 'images', 'Hình ảnh sử dụng liên kết Google Drive, có khả năng chưa mở quyền công khai.');
      }
    }
  }

  // 7. Giờ mở cửa / đóng cửa (nếu có trong patch)
  if (target.opening_time !== undefined && target.opening_time !== null && String(target.opening_time).trim()) {
    const openRes = validateTimeFormat(target.opening_time);
    if (!openRes.valid) {
      addError(openRes.code, 'opening_time', openRes.message);
    }
  }
  if (target.closing_time !== undefined && target.closing_time !== null && String(target.closing_time).trim()) {
    const closeRes = validateTimeFormat(target.closing_time);
    if (!closeRes.valid) {
      addError(closeRes.code, 'closing_time', closeRes.message);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Thẩm định chất lượng dữ liệu địa điểm (Place Data Quality Validator)
 * 
 * @param {object} place Đối tượng địa điểm cần kiểm tra
 * @param {object} [options]
 * @param {'draft' | 'approval' | 'legacy_patch'} [options.mode='approval'] Chế độ kiểm tra
 * @returns {{
 *   valid: boolean,
 *   errors: Array<{ code: string, field: string, message: string }>,
 *   warnings: Array<{ code: string, field: string, message: string }>
 * }}
 */
export function validatePlace(place, options = {}) {
  const mode = options.mode || 'approval';

  if (mode === 'legacy_patch') {
    return validatePatchForApprovedLegacy(place);
  }

  const target = place || {};

  const errors = [];
  const warnings = [];

  const addError = (code, field, message) => {
    errors.push({ code, field, message });
  };

  const addWarning = (code, field, message) => {
    warnings.push({ code, field, message });
  };

  // 1. TÊN ĐỊA ĐIỂM (name: 3–150 ký tự)
  const name = String(target.name || '').trim();
  if (mode === 'approval') {
    if (!name || name.length < 3 || name.length > 150) {
      addError('INVALID_NAME', 'name', 'Tên địa điểm bắt buộc và phải có độ dài từ 3 đến 150 ký tự.');
    }
  } else if (mode === 'draft') {
    if (name && (name.length < 3 || name.length > 150)) {
      addError('INVALID_NAME', 'name', 'Tên địa điểm phải có độ dài từ 3 đến 150 ký tự.');
    }
  }

  // 2. SLUG (slug)
  const slug = String(target.slug || '').trim();
  if (mode === 'approval') {
    if (!slug) {
      addError('INVALID_SLUG', 'slug', 'Slug địa điểm là bắt buộc.');
    } else if (!SLUG_REGEX.test(slug)) {
      addError('INVALID_SLUG', 'slug', 'Slug không đúng định dạng URL chuẩn (chỉ gồm chữ thường không dấu, số và dấu gạch ngang đơn; không bắt đầu hoặc kết thúc bằng dấu gạch ngang).');
    }
  } else if (slug && !SLUG_REGEX.test(slug)) {
    addWarning('INVALID_SLUG_FORMAT', 'slug', 'Slug hiện tại chưa khớp định dạng URL chuẩn.');
  }

  // 3. DANH MỤC (category) & KHU VỰC (area)
  const category = String(target.category || '').trim();
  if (mode === 'approval' && !category) {
    addError('MISSING_CATEGORY', 'category', 'Chưa phân loại danh mục (category) cho địa điểm.');
  }

  const area = String(target.area || '').trim();
  if (mode === 'approval' && !area) {
    addError('MISSING_AREA', 'area', 'Chưa xác định khu vực địa bàn (area) cho địa điểm.');
  }

  // 4. TRẠNG THÁI (status)
  if (target.status !== undefined && target.status !== null) {
    const statusStr = String(target.status).trim();
    if (!VALID_PLACE_STATUSES.has(statusStr)) {
      addError('INVALID_STATUS', 'status', `Trạng thái '${statusStr}' không hợp lệ (chỉ chấp nhận approved, draft, hidden, archived).`);
    }
  }

  // 5. TỌA ĐỘ GPS (coordinates)
  const rawCoords = String(target.coordinates || '').trim();
  if (!rawCoords) {
    addWarning('WARN_MISSING_COORDINATES', 'coordinates', 'Thiếu tọa độ GPS. Địa điểm sẽ không thể định vị chính xác trên bản đồ số.');
  } else {
    const coordResult = validateCoordinates(rawCoords);
    if (!coordResult.valid) {
      // Tọa độ sai hoặc ngoài Trà Vinh là ERROR chặn duyệt ở cả 2 mode
      addError(coordResult.code, 'coordinates', coordResult.message);
    }
  }

  // 6. LIÊN KẾT GOOGLE MAPS (map_link)
  const rawMapLink = String(target.map_link || '').trim();
  if (!rawMapLink) {
    addWarning('WARN_MISSING_MAP_LINK', 'map_link', 'Chưa có đường dẫn Google Maps hỗ trợ chỉ đường.');
  } else {
    const mapResult = validateGoogleMapsUrl(rawMapLink);
    if (!mapResult.valid) {
      addError(mapResult.code, 'map_link', mapResult.message);
    }
  }

  // 7. KIỂM TRA ĐỘ AN TOÀN HÌNH ẢNH (image_link & images)
  const allImages = [];
  if (target.image_link && typeof target.image_link === 'string') {
    allImages.push(target.image_link.trim());
  }
  if (Array.isArray(target.images)) {
    for (const img of target.images) {
      if (typeof img === 'string' && img.trim()) {
        allImages.push(img.trim());
      }
    }
  }

  if (allImages.length === 0) {
    addWarning('WARN_MISSING_IMAGES', 'images', 'Địa điểm chưa có hình ảnh đại diện hoặc minh họa nào.');
  } else {
    let hasDriveWarning = false;
    for (const imgUrl of allImages) {
      const inspect = inspectSafeUrl(imgUrl);
      if (!inspect.isSafe) {
        addError('INSECURE_IMAGE_URL', 'images', 'Đường dẫn hình ảnh chứa giao thức không an toàn hoặc không được hỗ trợ.');
        break;
      }
      if (!hasDriveWarning && inspect.urlObj) {
        const h = inspect.urlObj.hostname.toLowerCase();
        if (h.includes('drive.google.com') || h.includes('docs.google.com')) {
          addWarning('WARN_DRIVE_IMAGE_LINK', 'images', 'Hình ảnh sử dụng liên kết Google Drive, có khả năng chưa mở quyền công khai hoặc không nhúng trực tiếp được.');
          hasDriveWarning = true;
        }
      }
    }
  }

  // 8. ĐỊA CHỈ CHI TIẾT (address)
  const address = String(target.address || '').trim();
  if (!address || address.length < 5) {
    addWarning('WARN_MISSING_ADDRESS', 'address', 'Địa chỉ địa điểm đang để trống hoặc quá ngắn, khách du lịch sẽ khó tìm.');
  }

  // 9. GIỜ HOẠT ĐỘNG (opening_time, closing_time, display_hours)
  // Nếu opening_time hoặc closing_time được cung cấp, bắt buộc phải đúng định dạng 24h HH:mm
  // display_hours là chuỗi hiển thị legacy; không dùng nó để hợp thức hóa opening_time/closing_time sai.
  const hasOpening = hasTimeValue(target.opening_time);
  const hasClosing = hasTimeValue(target.closing_time);

  if (hasOpening) {
    const openRes = validateTimeFormat(target.opening_time);
    if (!openRes.valid) {
      addError(openRes.code, 'opening_time', openRes.message);
    }
  }

  if (hasClosing) {
    const closeRes = validateTimeFormat(target.closing_time);
    if (!closeRes.valid) {
      addError(closeRes.code, 'closing_time', closeRes.message);
    }
  }

  const hasDisplayHours = Boolean(target.display_hours && String(target.display_hours).trim());

  if (!hasOpening && !hasClosing && !hasDisplayHours) {
    addWarning('WARN_MISSING_HOURS', 'opening_time', 'Chưa cập nhật thông tin giờ mở cửa, đóng cửa hoặc hiển thị giờ hoạt động.');
  } else if ((hasOpening && !hasClosing) || (!hasOpening && hasClosing)) {
    if (!hasDisplayHours) {
      addWarning('WARN_INCOMPLETE_HOURS', 'opening_time', 'Chỉ cập nhật một đầu giờ mở cửa hoặc đóng cửa mà chưa có đủ khung giờ hoàn chỉnh.');
    }
  }

  // 10. THÔNG TIN LIÊN HỆ (contact)
  const contact = String(target.contact || '').trim();
  if (!contact) {
    addWarning('WARN_MISSING_CONTACT', 'contact', 'Chưa có số điện thoại hoặc thông tin liên hệ khi khách cần hỗ trợ/đặt chỗ.');
  }

  // 11. KHOẢNG GIÁ (price_raw)
  if (!hasPriceValue(target.price_raw)) {
    addWarning('WARN_MISSING_PRICE', 'price_raw', 'Chưa có thông tin khoảng giá dịch vụ (có thể ghi "Miễn phí" nếu không thu vé).');
  }

  // 12. MÔ TẢ ĐỊA ĐIỂM (description)
  const description = String(target.description || '').trim();
  if (!description || description.length < 20) {
    addWarning('WARN_SHORT_DESCRIPTION', 'description', 'Mô tả địa điểm còn quá ngắn (dưới 20 ký tự) hoặc chưa có.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
