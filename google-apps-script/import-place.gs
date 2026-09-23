const IMPORT_ENDPOINT = 'https://vivutravinh.id.vn/api/import-place';
const IMPORT_SECRET = 'THAY_BANG_IMPORT_SECRET_CUA_BAN';

function onFormSubmit(e) {
  const payload = buildPayloadFromSubmitEvent(e);
  const result = sendPlaceToSupabase(payload);
  Logger.log(JSON.stringify(result));
}

function buildPayloadFromSubmitEvent(e) {
  if (!e || !e.range) {
    throw new Error('Thiếu dữ liệu submit. Hãy chạy testImportPlace() để test thủ công.');
  }

  const sheet = e.range.getSheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = sheet.getRange(e.range.getRow(), 1, 1, sheet.getLastColumn()).getValues()[0];
  const payload = {};

  headers.forEach(function (header, index) {
    if (!header) return;
    payload[String(header).trim()] = normalizeCellValue(values[index]);
  });

  return payload;
}

function normalizeCellValue(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'HH:mm');
  }

  return value === null || value === undefined ? '' : String(value).trim();
}

function sendPlaceToSupabase(payload) {
  const response = UrlFetchApp.fetch(IMPORT_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-import-secret': IMPORT_SECRET
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  const body = response.getContentText();

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error('Import thất bại: HTTP ' + statusCode + ' - ' + body);
  }

  return JSON.parse(body);
}

function testImportPlace() {
  const payload = {
    'Tên địa điểm': 'Địa điểm test Google Form',
    'Phân loại': 'Điểm Check-in / Sống Ảo',
    'Khu vực': 'TP. Trà Vinh',
    'Địa chỉ': 'Địa chỉ test',
    'Mức Giá': 'Miễn phí',
    'Giờ Mở Cửa': '07:00',
    'Giờ Đóng Cửa': '18:00',
    'Trạng Thái Hoạt Động': 'Normal',
    'Link Google Maps': 'https://www.google.com/maps?q=9.9347,106.3449',
    'Tọa Độ GPS (Latitude và Longitude)': '9.9347,106.3449',
    'Link Hình Ảnh': './ao bà om.jpg',
    'Mô Tả': 'Dòng test import từ Google Apps Script vào Supabase draft.',
    'Ghi Chú Thêm': 'Có thể xóa hoặc lưu trữ sau khi test.',
    'Số Điện Thoại / Fanpage / Website': '',
    'Người Đóng Góp': 'Apps Script Test',
    'Chấm Điểm': '0'
  };

  const result = sendPlaceToSupabase(payload);
  Logger.log(JSON.stringify(result));
}
