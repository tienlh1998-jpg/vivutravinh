// js/telemetry.js
// Hệ thống ghi nhận lỗi và giám sát độ tin cậy (Privacy-First Client Telemetry)
// - Bắt lỗi JavaScript chưa xử lý, Promise rejection, lỗi nạp dữ liệu mạng, lỗi đồng bộ
// - TUYỆT ĐỐI KHÔNG GHI PII: Tự động loại bỏ và mã hóa các trường nhạy cảm
// - Bộ nhớ đệm vòng tròn (Circular Buffer) tối đa 50 sự kiện gần nhất

const MAX_BUFFER_SIZE = 50;
const errorBuffer = [];

// Các từ khóa định danh trường thông tin nhạy cảm (PII) cần redact
const PII_KEYS_REGEX = /(author|name|comment|text|contact|phone|email|contributor|secret|password|token|apikey|authorization)/i;
const PHONE_REGEX = /(0[235789]\d{8}|\+?84[235789]\d{8})/g;
const EMAIL_REGEX = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g;

/**
 * Lọc sạch chuỗi văn bản chứa thông tin nhạy cảm (số điện thoại, email)
 */
export function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(PHONE_REGEX, '[REDACTED_PHONE]')
    .replace(EMAIL_REGEX, '[REDACTED_EMAIL]');
}

/**
 * Đệ quy lọc sạch toàn bộ object/mảng khỏi PII
 */
export function sanitizeData(data, depth = 0) {
  if (depth > 5 || data === null || data === undefined) return data;

  if (typeof data === 'string') {
    return sanitizeString(data);
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item, depth + 1));
  }

  if (typeof data === 'object') {
    const cleaned = {};
    for (const [key, value] of Object.entries(data)) {
      if (PII_KEYS_REGEX.test(key)) {
        if (/phone|contact/i.test(key)) {
          cleaned[key] = '[REDACTED_PHONE]';
        } else if (/email/i.test(key)) {
          cleaned[key] = '[REDACTED_EMAIL]';
        } else {
          cleaned[key] = '[REDACTED]';
        }
      } else {
        cleaned[key] = sanitizeData(value, depth + 1);
      }
    }
    return cleaned;
  }

  return String(data);
}

/**
 * Ghi nhận một sự kiện lỗi vào bộ nhớ đệm
 */
export function recordTelemetryEvent(type, message, metadata = {}) {
  const event = {
    type: String(type || 'error'),
    message: sanitizeString(String(message || 'Unknown error')),
    timestamp: new Date().toISOString(),
    url: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/',
    metadata: sanitizeData(metadata)
  };

  if (errorBuffer.length >= MAX_BUFFER_SIZE) {
    errorBuffer.shift();
  }
  errorBuffer.push(event);

  // Chỉ in warning có lọc sạch ra console ở môi trường dev để hỗ trợ chẩn đoán (bỏ qua khi đang chạy automated test)
  const isTest = typeof process !== 'undefined' && (process.env.NODE_ENV === 'test' || process.env.VIVU_TEST === '1');
  if (!isTest && typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(`[Telemetry:${event.type}]`, event.message, event.metadata);
  }

  return event;
}

/**
 * Bắt lỗi JavaScript toàn cục
 */
export function recordJsError(error, context = 'window.onerror') {
  const message = error?.message || String(error || 'Uncaught JS Error');
  const stack = error?.stack ? sanitizeString(error.stack.split('\n').slice(0, 3).join('\n')) : null;
  return recordTelemetryEvent('js_error', message, { context, stack });
}

/**
 * Bắt lỗi nạp dữ liệu mạng (Supabase, API backend)
 */
export function recordNetworkError(url, statusOrError = 0, statusText = '') {
  const cleanUrl = sanitizeString(String(url || '').split('?')[0]);
  let status = typeof statusOrError === 'number' ? statusOrError : 0;
  let text = statusText;
  if (statusOrError instanceof Error) {
    text = statusOrError.message;
  } else if (typeof statusOrError === 'string') {
    text = statusOrError;
  }
  return recordTelemetryEvent('network_error', `HTTP Error: ${text || status} on ${cleanUrl}`, {
    status,
    statusText: sanitizeString(text)
  });
}

/**
 * Bắt lỗi đồng bộ ngoại tuyến (IndexedDB -> Server)
 */
export function recordSyncError(entityType, action, error) {
  const message = error?.message || String(error || 'Sync failure');
  return recordTelemetryEvent('sync_error', `Sync failed for ${entityType} [${action}]: ${message}`, {
    entityType,
    action,
    error: sanitizeString(message)
  });
}

/**
 * Lấy danh sách lỗi gần nhất phục vụ chẩn đoán
 */
export function getRecentTelemetryEvents() {
  return [...errorBuffer];
}

export const getTelemetryEvents = getRecentTelemetryEvents;

/**
 * Xóa sạch buffer kiểm thử
 */
export function clearTelemetryEvents() {
  errorBuffer.length = 0;
}

/**
 * Khởi tạo listener tự động trên trình duyệt
 */
export function initTelemetry() {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    recordJsError(event.error || event.message, 'window.error');
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    recordJsError(reason?.message || String(reason), 'unhandledrejection');
  });
}
