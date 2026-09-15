// ViVuTraVinh - Data loading module

import {
    assertGoogleSheetsConfig,
    assertSupabaseConfig,
    initConfig,
    setDataSourceConfig,
    setSimulationConfig,
    resetSimulationConfig
} from './config.js';

const CACHE_KEY_PREFIX = 'vivutravinh-places-';
const CACHE_TTL = 60 * 1000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 800;
const FIXTURE_URL = './data/data-fixture.json';
const FALLBACK_URL = './data/data-fallback.json';
// Placeholder SVG nội bộ trung tính, không phụ thuộc mạng CDN
const PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 400' width='600' height='400'%3E%3Crect width='600' height='400' fill='%23f1f5f9'/%3E%3Cpath d='M260 170a30 30 0 1 0 0-60 30 30 0 0 0 0 60zm-80 110h240l-75-100-60 80-45-60-60 80z' fill='%23cbd5e1'/%3E%3Ctext x='50%25' y='320' font-family='sans-serif' font-size='20' font-weight='bold' fill='%2394a3b8' text-anchor='middle'%3EViVuTraVinh%3C/text%3E%3C/svg%3E";

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function buildSheetsApiUrl(config) {
    assertGoogleSheetsConfig(config);
    const sheetRange = `${config.sheetName}!${config.range}`;
    const encodedRange = encodeURIComponent(sheetRange);
    const encodedKey = encodeURIComponent(config.apiKey);

    return `https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}/values/${encodedRange}?key=${encodedKey}`;
}

function getSupabaseConfig(config) {
    assertSupabaseConfig(config);
    return {
        url: config.supabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
        anonKey: config.supabaseAnonKey,
    };
}

function buildSupabaseHeaders(anonKey) {
    return {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
    };
}

function getCacheKey(dataSource) {
    return `${CACHE_KEY_PREFIX}${dataSource || 'default'}-v2`;
}

function readCache(dataSource) {
    try {
        const key = getCacheKey(dataSource);
        const rawCache = localStorage.getItem(key);
        if (!rawCache) return null;

        const cache = JSON.parse(rawCache);
        if (!cache || !Array.isArray(cache.data) || typeof cache.timestamp !== 'number') {
            localStorage.removeItem(key);
            return null;
        }

        if (Date.now() - cache.timestamp > CACHE_TTL) {
            localStorage.removeItem(key);
            return null;
        }

        return cache.data;
    } catch (error) {
        console.warn('[ViVuTraVinh Data] Không đọc được cache:', error);
        return null;
    }
}

function writeCache(dataSource, places) {
    try {
        const key = getCacheKey(dataSource);
        localStorage.setItem(key, JSON.stringify({
            timestamp: Date.now(),
            data: places,
        }));
    } catch (error) {
        console.warn('[ViVuTraVinh Data] Không ghi được cache:', error);
    }
}

function normalizeText(value) {
    return String(value || '').trim();
}

function normalizeKey(key) {
    return normalizeText(key)
        .toLowerCase()
        .replace(/[📍🗺️🏘️⭐✍️📸🎯💰⏰📞📝]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function findValue(row, names) {
    for (const name of names) {
        const wantedKey = normalizeKey(name);
        const actualKey = Object.keys(row).find(key => normalizeKey(key) === wantedKey);
        if (actualKey && row[actualKey] !== undefined) {
            return normalizeText(row[actualKey]);
        }
    }

    return '';
}

function rowsToObjects(values) {
    if (!Array.isArray(values) || values.length < 2) return [];

    const headers = values[0].map(normalizeText);

    return values.slice(1).map(row => {
        return headers.reduce((place, header, index) => {
            if (header) {
                place[header] = normalizeText(row[index]);
            }
            return place;
        }, {});
    }).filter(row => Object.values(row).some(Boolean));
}

function isApprovedPlace(row) {
    const status = findValue(row, ['Trạng Thái', 'Trang Thái', 'Status', 'Duyet']).toLowerCase();
    return status === 'duyệt' || status === 'duyet' || status === 'approved';
}

function convertGoogleDriveLink(url) {
    const normalizedUrl = normalizeText(url);
    if (!normalizedUrl.includes('drive.google.com')) return normalizedUrl;
    if (normalizedUrl.includes('/drive/folders/') || normalizedUrl.includes('/folders/')) return '';

    const idParamMatch = normalizedUrl.match(/[?&]id=([^&]+)/);
    if (idParamMatch) {
        return `https://lh3.googleusercontent.com/d/${idParamMatch[1]}`;
    }

    const filePathMatch = normalizedUrl.match(/\/file\/d\/([^/]+)/);
    if (filePathMatch) {
        return `https://lh3.googleusercontent.com/d/${filePathMatch[1]}`;
    }

    const ucMatch = normalizedUrl.match(/[?&]export=download.*[?&]id=([^&]+)/);
    if (ucMatch) {
        return `https://lh3.googleusercontent.com/d/${ucMatch[1]}`;
    }

    return normalizedUrl;
}

function parseImages(rawImages) {
    const images = normalizeText(rawImages)
        .split(/[\n,]+/)
        .map(image => convertGoogleDriveLink(image))
        .filter(Boolean);

    return images.length > 0 ? images : [PLACEHOLDER_IMAGE];
}

function createSlug(text, fallback) {
    const slug = normalizeText(text)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return slug || fallback;
}

export function parsePrice(rawPrice) {
    const raw = normalizeText(rawPrice);
    if (!raw || /^(liên hệ|chưa rõ|đang cập nhật|unknown)$/i.test(raw)) {
        return {
            raw: raw || '',
            formatted: 'Liên hệ',
            min: null,
            max: null,
            currency: 'VND',
            unit: '',
            isFree: false,
            isUnknown: true,
        };
    }

    if (raw === '0' || /^(miễn phí|free)$/i.test(raw)) {
        return {
            raw,
            formatted: 'Miễn phí',
            min: 0,
            max: 0,
            currency: 'VND',
            unit: '',
            isFree: true,
            isUnknown: false,
        };
    }

    let unit = '';
    const unitMatch = raw.match(/\/(đêm|người|phần|vé|bát|tô|ly|chuyến|ngày)/i);
    if (unitMatch) {
        unit = unitMatch[1].toLowerCase();
    }

    function parseSubPrice(str) {
        if (!str) return null;
        let s = str.trim().toLowerCase();
        s = s.replace(/\/(đêm|người|phần|vé|bát|tô|ly|chuyến|ngày)/g, '').replace(/[đvnd]/g, '').trim();

        if (s.endsWith('k')) {
            const numPart = parseFloat(s.slice(0, -1).replace(/,/g, '.'));
            return !isNaN(numPart) ? Math.round(numPart * 1000) : null;
        }

        const cleaned = s.replace(/[.\s]/g, '').replace(/,/g, '');
        const val = parseInt(cleaned, 10);
        return !isNaN(val) ? val : null;
    }

    if (raw.includes('-') || raw.includes('–') || raw.includes('—')) {
        const parts = raw.split(/[-–—]/);
        const minVal = parseSubPrice(parts[0]);
        const maxVal = parseSubPrice(parts[1]);

        if (minVal !== null && maxVal !== null) {
            const realMin = Math.min(minVal, maxVal);
            const realMax = Math.max(minVal, maxVal);
            const unitSuffix = unit ? `/${unit}` : '';
            return {
                raw,
                formatted: `${realMin.toLocaleString('vi-VN')}đ - ${realMax.toLocaleString('vi-VN')}đ${unitSuffix}`,
                min: realMin,
                max: realMax,
                currency: 'VND',
                unit,
                isFree: realMin === 0 && realMax === 0,
                isUnknown: false,
            };
        }
    }

    const singleVal = parseSubPrice(raw);
    if (singleVal !== null) {
        const unitSuffix = unit ? `/${unit}` : '';
        return {
            raw,
            formatted: `${singleVal.toLocaleString('vi-VN')}đ${unitSuffix}`,
            min: singleVal,
            max: singleVal,
            currency: 'VND',
            unit,
            isFree: singleVal === 0,
            isUnknown: false,
        };
    }

    return {
        raw,
        formatted: raw,
        min: null,
        max: null,
        currency: 'VND',
        unit,
        isFree: false,
        isUnknown: true,
    };
}

export function parseOperatingHours(rawHours, operatingStatus = '') {
    const hours = normalizeText(rawHours);
    const statusText = normalizeText(operatingStatus).toLowerCase();

    // 1. ƯU TIÊN TẠM ĐÓNG LÊN HÀNG ĐẦU (kể cả khi hours ghi 24/7)
    const isTemporarilyClosed = /tạm đóng|closed|tạm ngưng|ngưng hoạt động/i.test(statusText);

    if (isTemporarilyClosed) {
        return {
            openingTime: '',
            closingTime: '',
            displayHours: 'Tạm đóng cửa',
            is247: false,
            isTemporarilyClosed: true,
            isUnknownHours: false,
        };
    }

    if (!hours || /chưa rõ|liên hệ|unknown/i.test(hours)) {
        return {
            openingTime: '',
            closingTime: '',
            displayHours: 'Chưa rõ giờ mở cửa',
            is247: false,
            isTemporarilyClosed: false,
            isUnknownHours: true,
        };
    }

    if (hours.toLowerCase().includes('24/7') || hours.toLowerCase().includes('cả ngày')) {
        return {
            openingTime: '00:00',
            closingTime: '23:59',
            displayHours: 'Mở cả ngày (24/7)',
            is247: true,
            isTemporarilyClosed: false,
            isUnknownHours: false,
        };
    }

    const rangeMatch = hours.match(/(\d{1,2}:\d{2})(?::\d{2})?\s*[-–—]\s*(\d{1,2}:\d{2})(?::\d{2})?/);
    if (rangeMatch) {
        const start = rangeMatch[1].padStart(5, '0');
        const end = rangeMatch[2].padStart(5, '0');
        return {
            openingTime: start,
            closingTime: end,
            displayHours: `${start} - ${end}`,
            is247: false,
            isTemporarilyClosed: false,
            isUnknownHours: false,
        };
    }

    return {
        openingTime: hours,
        closingTime: '',
        displayHours: hours,
        is247: false,
        isTemporarilyClosed: false,
        isUnknownHours: false,
    };
}

export function parseCoordinates(coordStr) {
    if (!coordStr) return null;
    const match = String(coordStr).match(/([-+]?\d+\.?\d*)\s*,\s*([-+]?\d+\.?\d*)/);
    if (match) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && (lat !== 0 || lng !== 0)) {
            return [lat, lng];
        }
    }
    return null;
}

export function parseContact(rawContact) {
    const text = normalizeText(rawContact);
    if (!text) {
        return {
            raw: '',
            phone: '',
            cleanPhone: '',
            url: '',
            isAvailable: false,
        };
    }

    let url = '';
    let phone = '';
    let cleanPhone = '';

    if (/https?:\/\//i.test(text) || /(?:facebook|fb)\.com\//i.test(text)) {
        const urlMatch = text.match(/(https?:\/\/[^\s]+|(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s]*)/i);
        if (urlMatch) {
            url = urlMatch[0].startsWith('http') ? urlMatch[0] : `https://${urlMatch[0]}`;
        }
    }

    const phoneMatch = text.match(/(?:\+84|0)[0-9.\s-]{8,14}/);
    if (phoneMatch) {
        phone = phoneMatch[0].trim();
        cleanPhone = phone.replace(/[^0-9+]/g, '');
    }

    return {
        raw: text,
        phone,
        cleanPhone,
        url,
        isAvailable: Boolean(cleanPhone || url),
    };
}

export function normalizePlace(row, index, source = 'fallback') {
    const name = findValue(row, ['Tên địa điểm', 'Tên Địa Điểm / Cơ Sở', 'Name', 'Tên']);
    const category = findValue(row, ['Phân loại', 'Loại Hình Địa Điểm', 'Category', 'Loại']);
    const rawPrice = findValue(row, ['Mức Giá', 'Mức Giá Tham Khảo (Chi phí trung bình cho một người/lần ghé thăm)', 'Giá', 'Price']);
    const rawHours = findValue(row, ['Giờ Mở Cửa', 'Giờ Mở Cửa / Giờ Hoạt Động (Nếu có)', 'Opening Time', 'Open']);
    const rawStatus = findValue(row, ['Trạng Thái Hoạt Động', 'Operating Status']) || 'Normal';
    const hours = parseOperatingHours(rawHours, rawStatus);
    const priceParsed = parsePrice(rawPrice);
    const coordsParsed = parseCoordinates(findValue(row, ['Tọa Độ GPS (Latitude và Longitude)', 'Tọa độ', 'GPS']));
    const contactParsed = parseContact(findValue(row, ['Liên hệ', 'Số Điện Thoại / Fanpage / Website', 'Contact', 'Điện thoại', 'Phone']));
    const images = parseImages(findValue(row, ['Link Hình Ảnh', 'Ảnh Đại Diện Chất Lượng Cao', 'Hình Ảnh', 'Link Ảnh', 'Image']));
    const rawRating = findValue(row, ['Chấm Điểm?', 'Chấm Điểm', 'Đánh Giá', 'Rating', 'Sao', 'Star', 'Điểm', 'Review']);
    const rating = rawRating ? (Number.parseFloat(rawRating) || 0) : 0;
    const id = findValue(row, ['Slug', 'ID', 'Id']) || createSlug(name, `location-${index}`);

    return {
        ...row,
        id,
        slug: id,
        name,
        category,
        area: findValue(row, ['Khu vực', 'Thuộc Huyện / Thị xã nào?', 'Địa chỉ Chi Tiết (Số nhà, đường, khóm/ấp)', 'Area', 'Location']),
        address: findValue(row, ['Địa chỉ Chi Tiết (Số nhà, đường, khóm/ấp)', 'Địa chỉ', 'Address']),
        mapLink: findValue(row, ['Link Google Maps', 'Map Link', 'Maps']),
        priceRaw: rawPrice,
        priceFormatted: priceParsed.formatted,
        priceMin: priceParsed.min,
        priceMax: priceParsed.max,
        priceCurrency: priceParsed.currency,
        priceUnit: priceParsed.unit,
        isFree: priceParsed.isFree,
        isUnknownPrice: priceParsed.isUnknown,
        imageLink: images[0],
        imageGallery: images,
        images,
        description: findValue(row, ['Mô Tả', 'Mô tả', 'Mô tả Ngắn Hấp Dẫn về Địa Điểm (Ít nhất 50 từ)', 'Description']),
        note: findValue(row, ['Ghi Chú Thêm (Tiện ích, lưu ý quan trọng, kinh nghiệm...)', 'Ghi chú', 'Note']),
        contact: findValue(row, ['Liên hệ', 'Số Điện Thoại / Fanpage / Website', 'Contact', 'Điện thoại', 'Phone']),
        contactPhone: contactParsed.cleanPhone,
        contactUrl: contactParsed.url,
        hasContact: contactParsed.isAvailable,
        coordinates: coordsParsed ? `${coordsParsed[0]}, ${coordsParsed[1]}` : '',
        parsedCoordinates: coordsParsed,
        hasValidGps: Boolean(coordsParsed),
        contributor: findValue(row, ['Người Đóng Góp', 'Contributor']) || 'Ẩn danh',
        rating,
        isUnknownRating: rating <= 0,
        openingTime: hours.openingTime,
        closingTime: findValue(row, ['Giờ Đóng Cửa', 'Closing Time', 'Close']) || hours.closingTime,
        displayHours: hours.displayHours,
        is247: hours.is247,
        isTemporarilyClosed: hours.isTemporarilyClosed,
        isUnknownHours: hours.isUnknownHours,
        operatingStatus: hours.isTemporarilyClosed ? 'Closed' : rawStatus,
        status: findValue(row, ['Trạng Thái', 'Trang Thái', 'Status', 'Duyet']),
        _source: source,
    };
}

function hasDisplayableContent(row) {
    return Boolean(findValue(row, ['Tên địa điểm', 'Tên Địa Điểm / Cơ Sở', 'Name', 'Tên']));
}

export function normalizePlaces(rows, source = 'fallback') {
    return rows
        .filter(isApprovedPlace)
        .filter(hasDisplayableContent)
        .map((row, index) => normalizePlace(row, index, source));
}

async function fetchWithRetry(url, options = {}, maxRetries = MAX_RETRIES) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'GET',
                ...options,
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response;
        } catch (error) {
            lastError = error;
            console.warn(`[ViVuTraVinh Data] Lần tải ${attempt}/${maxRetries} thất bại:`, error);

            if (attempt < maxRetries) {
                await sleep(RETRY_DELAY * attempt);
            }
        }
    }

    throw lastError;
}

function normalizeImagesFromSupabase(row) {
    if (Array.isArray(row.images) && row.images.length > 0) {
        return row.images.map(image => convertGoogleDriveLink(image)).filter(Boolean);
    }

    return parseImages(row.image_link || '');
}

function normalizeSupabasePlace(row, index) {
    const images = normalizeImagesFromSupabase(row);
    const id = normalizeText(row.slug) || normalizeText(row.id) || createSlug(row.name, `location-${index}`);
    const rawStatus = normalizeText(row.operating_status) || 'Normal';
    const rawHours = normalizeText(row.display_hours) || `${normalizeText(row.opening_time)} - ${normalizeText(row.closing_time)}`;
    const hours = parseOperatingHours(rawHours, rawStatus);
    const priceParsed = parsePrice(row.price_raw);
    const coordsParsed = parseCoordinates(row.coordinates);
    const contactParsed = parseContact(row.contact);
    const rating = Number.parseFloat(row.rating) || 0;

    return {
        id,
        slug: id,
        name: normalizeText(row.name),
        category: normalizeText(row.category),
        area: normalizeText(row.area),
        address: normalizeText(row.address),
        mapLink: normalizeText(row.map_link),
        priceRaw: normalizeText(row.price_raw),
        priceFormatted: priceParsed.formatted,
        priceMin: priceParsed.min,
        priceMax: priceParsed.max,
        priceCurrency: priceParsed.currency,
        priceUnit: priceParsed.unit,
        isFree: priceParsed.isFree,
        isUnknownPrice: priceParsed.isUnknown,
        imageLink: images[0] || PLACEHOLDER_IMAGE,
        imageGallery: images.length > 0 ? images : [PLACEHOLDER_IMAGE],
        images: images.length > 0 ? images : [PLACEHOLDER_IMAGE],
        description: normalizeText(row.description),
        note: normalizeText(row.note),
        contact: normalizeText(row.contact),
        contactPhone: contactParsed.cleanPhone,
        contactUrl: contactParsed.url,
        hasContact: contactParsed.isAvailable,
        coordinates: coordsParsed ? `${coordsParsed[0]}, ${coordsParsed[1]}` : '',
        parsedCoordinates: coordsParsed,
        hasValidGps: Boolean(coordsParsed),
        contributor: normalizeText(row.contributor) || 'Ẩn danh',
        rating,
        isUnknownRating: rating <= 0,
        openingTime: normalizeText(row.opening_time) || hours.openingTime,
        closingTime: normalizeText(row.closing_time) || hours.closingTime,
        displayHours: hours.displayHours,
        is247: hours.is247,
        isTemporarilyClosed: hours.isTemporarilyClosed,
        isUnknownHours: hours.isUnknownHours,
        operatingStatus: hours.isTemporarilyClosed ? 'Closed' : rawStatus,
        status: normalizeText(row.status),
        sortOrder: Number.parseInt(row.sort_order, 10) || 0,
        isFeatured: Boolean(row.is_featured),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        _source: 'supabase',
    };
}

async function loadPlacesFromSupabase(config) {
    const { url, anonKey } = getSupabaseConfig(config);
    const query = 'places?select=id,slug,name,category,area,address,map_link,price_raw,description,note,contact,coordinates,contributor,rating,opening_time,closing_time,display_hours,operating_status,status,images,image_link,sort_order,is_featured,created_at,updated_at&status=eq.approved&order=sort_order.asc,created_at.desc';
    const response = await fetchWithRetry(`${url}/rest/v1/${query}`, {
        cache: 'no-store',
        headers: buildSupabaseHeaders(anonKey),
    });
    const payload = await response.json();

    if (!Array.isArray(payload)) {
        throw new Error('Supabase places trả về dữ liệu không hợp lệ.');
    }

    return payload
        .filter(row => normalizeText(row.name))
        .map((row, index) => normalizeSupabasePlace(row, index));
}

async function loadPlacesFromGoogleSheets(config) {
    const apiUrl = buildSheetsApiUrl(config);
    const response = await fetchWithRetry(apiUrl, { cache: 'no-store' });
    const payload = await response.json();

    if (!payload || !Array.isArray(payload.values)) {
        throw new Error('Google Sheets API trả về dữ liệu không hợp lệ.');
    }

    return normalizePlaces(rowsToObjects(payload.values), 'sheets');
}

async function loadPlacesFromFixture() {
    const response = await fetchWithRetry(FIXTURE_URL, { cache: 'no-store' });
    const payload = await response.json();

    if (!Array.isArray(payload)) {
        throw new Error('File fixture phải là một array các địa điểm.');
    }

    return normalizePlaces(payload, 'mock');
}

async function loadPlacesFromFallback() {
    const response = await fetchWithRetry(FALLBACK_URL, { cache: 'no-store' });
    const payload = await response.json();

    if (!Array.isArray(payload)) {
        throw new Error('File fallback phải là một array các địa điểm.');
    }

    return normalizePlaces(payload, 'fallback');
}

export async function loadPlaces(configOverrides = {}) {
    const config = initConfig(configOverrides);

    // 1. Mô phỏng độ trễ tải mạng (Latency Simulation)
    if (config.simDelay > 0) {
        console.info(`[ViVuTraVinh Data] ⏱️ Mô phỏng độ trễ mạng: ${config.simDelay}ms`);
        await sleep(config.simDelay);
    }

    // 2. Mô phỏng lỗi máy chủ (Error Simulation)
    if (config.simError) {
        console.warn('[ViVuTraVinh Data] ⚠️ Mô phỏng lỗi tải dữ liệu (simError=true)');
        throw new Error('[Simulation Error] Lỗi kết nối nguồn dữ liệu (mô phỏng theo cờ simError).');
    }

    // 3. Mô phỏng danh sách rỗng (Empty Simulation)
    if (config.simEmpty) {
        console.info('[ViVuTraVinh Data] 📭 Mô phỏng danh sách rỗng (simEmpty=true)');
        return [];
    }

    // 4. Kiểm tra cache riêng cho từng nguồn dữ liệu
    const cachedPlaces = readCache(config.dataSource);
    if (cachedPlaces) {
        return cachedPlaces;
    }

    // 5. Nạp dữ liệu theo nguồn được chỉ định:
    // Chế độ DEV MOCK: đọc fixture local trực tiếp, KHÔNG gọi Supabase
    if (config.dataSource === 'mock') {
        console.info('[ViVuTraVinh Data] 🧪 Chế độ DEV MOCK: Đang nạp fixture kiểm thử local (không gọi mạng Supabase).');
        const places = await loadPlacesFromFixture();
        writeCache(config.dataSource, places);
        return places;
    }

    // Chế độ FALLBACK: nạp snapshot dữ liệu phát hành
    if (config.dataSource === 'fallback') {
        console.info('[ViVuTraVinh Data] 📦 Chế độ FALLBACK: Đang nạp dữ liệu snapshot phát hành.');
        const places = await loadPlacesFromFallback();
        writeCache(config.dataSource, places);
        return places;
    }

    // Chế độ SUPABASE: Kết nối backend Supabase REST
    try {
        console.info('[ViVuTraVinh Data] 🌐 Chế độ SUPABASE: Đang kết nối tới Supabase REST...');
        const places = await loadPlacesFromSupabase(config);
        if (places.length === 0) {
            throw new Error('Supabase places chưa có địa điểm approved để hiển thị.');
        }
        writeCache(config.dataSource, places);
        return places;
    } catch (apiError) {
        console.warn('[ViVuTraVinh Data] Không kết nối được Supabase, tự động kích hoạt fallback phát hành:', apiError.message);
        const fallbackPlaces = await loadPlacesFromFallback();
        writeCache(config.dataSource, fallbackPlaces);
        return fallbackPlaces;
    }
}

export function clearPlacesCache(dataSource) {
    if (dataSource) {
        localStorage.removeItem(getCacheKey(dataSource));
    } else {
        localStorage.removeItem(getCacheKey('mock'));
        localStorage.removeItem(getCacheKey('supabase'));
        localStorage.removeItem(getCacheKey('fallback'));
        localStorage.removeItem('vivutravinh-places-v2');
    }
}

export function getDataSource() {
    const config = initConfig();
    return config.dataSource;
}

export function setDataSource(source) {
    setDataSourceConfig(source);
    clearPlacesCache(source);
    if (typeof window !== 'undefined' && window.location) {
        const url = new URL(window.location);
        url.searchParams.set('source', source);
        window.location.href = url.toString();
    }
}

export function setSimulation(options) {
    setSimulationConfig(options);
}

export function resetSimulation() {
    resetSimulationConfig();
}
