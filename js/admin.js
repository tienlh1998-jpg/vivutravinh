// js/admin.js
// Production Admin Dashboard & Management Controller for ViVuTraVinh (G8.3)

import {
  getSession,
  login,
  logout,
  adminRequest,
  getUserRole,
  canManagePlaces,
  canDeletePlaces,
  canModerateComments,
  canDeleteComments,
  canManageReports,
  canViewPII
} from './admin-auth.js';
import { validatePlace } from './place-validator.js';

// Trạng thái ứng dụng quản trị
let currentTab = 'places';
let adminPlaces = [];
let adminComments = [];
let adminReports = [];
let placesPagination = { page: 1, limit: 15, total: 0 };
let commentsPagination = { page: 1, limit: 15, total: 0 };
let reportsPagination = { page: 1, limit: 15, total: 0 };
let activeDialogCloseHandler = null;

// Cấu hình Cloudinary upload ảnh (tùy chọn)
const CLOUDINARY_CLOUD_NAME = 'dgarp2wex';
const CLOUDINARY_UPLOAD_PRESET = 'vivutravinh-places';

// Ma trận chuyển đổi trạng thái báo sai hợp lệ
const REPORT_TRANSITIONS = {
  pending: ['reviewed', 'resolved', 'dismissed'],
  reviewed: ['resolved', 'dismissed'],
  resolved: ['reviewed'],
  dismissed: ['reviewed']
};

/**
 * Khử mã độc XSS: Escape chuỗi HTML an toàn tuyệt đối
 */
export function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Kiểm tra và làm sạch URL hình ảnh: Chặn javascript:, data:, vbscript:
 */
export function sanitizeImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  // Chỉ chấp nhận giao thức http, https hoặc đường dẫn cục bộ
  if (/^(https?:\/\/|\/|\.\/)/i.test(trimmed)) {
    // Chặn tuyệt đối các chuỗi chèn mã
    if (/^(javascript|data|vbscript|file):/i.test(trimmed)) return '';
    return trimmed;
  }
  return '';
}

/**
 * Định dạng ngày giờ chuẩn tiếng Việt
 */
export function formatDate(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return String(value);
  }
}

/**
 * Hiển thị thông báo trạng thái
 */
export function setMessage(message, type = 'info') {
  if (typeof document === 'undefined') return;
  const element = document.getElementById('adminMessage');
  if (!element) return;
  element.textContent = message;
  element.className = `text-sm font-medium ${
    type === 'error' ? 'text-red-600 dark:text-red-400' :
    type === 'success' ? 'text-green-600 dark:text-green-400' :
    type === 'warning' ? 'text-amber-600 dark:text-amber-400' :
    'text-slate-500 dark:text-slate-400'
  }`;
}

export function setLoginMessage(message, type = 'info') {
  const element = document.getElementById('loginMessage');
  if (!element) return;
  element.textContent = message;
  element.className = `text-sm mt-3 text-center font-medium ${
    type === 'error' ? 'text-red-600 dark:text-red-400' :
    type === 'success' ? 'text-green-600 dark:text-green-400' :
    'text-slate-500 dark:text-slate-400'
  }`;
}

export function clearMessage() {
  setMessage('');
}

/**
 * Nhãn và lớp CSS cho trạng thái địa điểm
 */
export function placeStatusInfo(status) {
  switch (status) {
    case 'approved':
      return { label: 'Đã duyệt', cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' };
    case 'draft':
      return { label: 'Bản nháp', cls: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300' };
    case 'hidden':
      return { label: 'Đã ẩn', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' };
    case 'archived':
      return { label: 'Đã lưu trữ', cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' };
    default:
      return { label: status || 'Không rõ', cls: 'bg-slate-100 text-slate-700' };
  }
}

/**
 * Nhãn và lớp CSS cho trạng thái báo cáo
 */
export function reportStatusInfo(status) {
  switch (status) {
    case 'pending':
      return { label: 'Chờ xử lý', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' };
    case 'reviewed':
      return { label: 'Đang thẩm định', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' };
    case 'resolved':
      return { label: 'Đã giải quyết', cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' };
    case 'dismissed':
      return { label: 'Bác bỏ', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' };
    default:
      return { label: status || 'Chờ xử lý', cls: 'bg-slate-100 text-slate-700' };
  }
}

// ----------------------------------------------------------------------------
// DIALOG XÁC NHẬN (ACCESSIBLE CONFIRMATION DIALOG WITH FOCUS TRAP & ARIA)
// ----------------------------------------------------------------------------

/**
 * Mở hộp thoại xác nhận tác vụ nguy hiểm
 */
export function showConfirmDialog({ title, message, confirmText = 'Xác nhận', confirmClass = 'bg-red-600 hover:bg-red-700 text-white', onConfirm }) {
  const modal = document.getElementById('confirmModal');
  const titleEl = document.getElementById('confirmModalTitle');
  const messageEl = document.getElementById('confirmModalMessage');
  const confirmBtn = document.getElementById('confirmModalAcceptBtn');
  const cancelBtn = document.getElementById('confirmModalCancelBtn');

  if (!modal || !confirmBtn || !cancelBtn) return;

  const previousActiveElement = document.activeElement;

  titleEl.textContent = title;
  messageEl.textContent = message;
  confirmBtn.textContent = confirmText;
  confirmBtn.className = `min-h-[44px] min-w-[44px] px-5 py-2.5 rounded-xl font-bold transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${confirmClass}`;

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  const closeDialog = () => {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', keydownHandler);
    if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
      previousActiveElement.focus();
    }
  };

  const keydownHandler = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDialog();
    } else if (e.key === 'Tab') {
      // Focus trap
      const focusables = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  document.addEventListener('keydown', keydownHandler);

  confirmBtn.onclick = async () => {
    closeDialog();
    if (typeof onConfirm === 'function') {
      await onConfirm();
    }
  };

  cancelBtn.onclick = () => {
    closeDialog();
  };

  // Đặt focus vào nút hủy để tránh enter vô tình
  cancelBtn.focus();
}

// ----------------------------------------------------------------------------
// PREVIEW ĐỊA ĐIỂM & VALIDATION CẢNH BÁO TRƯỚC KHI DUYỆT (PRE-APPROVAL CHECKS)
// ----------------------------------------------------------------------------

/**
 * Kiểm tra các trường dữ liệu bắt buộc và cảnh báo nếu thiếu/sai sót
 * Tương thích ngược: sử dụng shared validatePlace từ ./place-validator.js
 * @param {object} place
 * @returns {Array<{type: 'error'|'warning', code: string, field: string, message: string}>}
 */
export function validatePlaceForApproval(place) {
  const result = validatePlace(place, { mode: 'approval' });
  const issues = [];
  for (const err of result.errors) {
    issues.push({ type: 'error', code: err.code, field: err.field, message: err.message });
  }
  for (const warn of result.warnings) {
    issues.push({ type: 'warning', code: warn.code, field: warn.field, message: warn.message });
  }
  return issues;
}

/**
 * Mở modal xem trước địa điểm (Preview Modal)
 */
export function openPlacePreview(place) {
  const modal = document.getElementById('placePreviewModal');
  const content = document.getElementById('placePreviewContent');
  if (!modal || !content) return;

  const previousActiveElement = document.activeElement;
  const validation = validatePlace(place, { mode: 'approval' });
  const { errors, warnings } = validation;
  const hasErrors = errors.length > 0;
  const hasWarnings = warnings.length > 0;
  const statusBadge = placeStatusInfo(place.status);
  const safeMainImg = sanitizeImageUrl(place.image_link || (Array.isArray(place.images) && place.images[0]) || '');

  let alertsHtml = '';
  if (hasErrors || hasWarnings) {
    alertsHtml = `
      <div id="previewValidationAlerts" class="space-y-3 mb-6">
        ${hasErrors ? `
          <div id="previewValidationErrors" role="alert" class="p-4 rounded-2xl border bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-800">
            <div class="flex items-center gap-2 mb-2 font-bold text-red-700 dark:text-red-300">
              <span class="material-symbols-outlined text-xl">error</span>
              <span>Lỗi vi phạm tiêu chuẩn (${errors.length} lỗi bắt buộc phải sửa trước khi duyệt):</span>
            </div>
            <ul class="list-disc list-inside space-y-1 text-sm text-red-600 dark:text-red-400">
              ${errors.map(e => `<li><strong>[${escapeHtml(e.field)}]</strong> ${escapeHtml(e.message)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        ${hasWarnings ? `
          <div id="previewValidationWarnings" class="p-4 rounded-2xl border bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800">
            <div class="flex items-center gap-2 mb-2 font-bold text-amber-800 dark:text-amber-300">
              <span class="material-symbols-outlined text-xl">warning</span>
              <span>Lưu ý chất lượng dữ liệu (${warnings.length} cảnh báo khuyến nghị hoàn thiện):</span>
            </div>
            <ul class="list-disc list-inside space-y-1 text-sm text-amber-700 dark:text-amber-400">
              ${warnings.map(w => `<li><strong>[${escapeHtml(w.field)}]</strong> ${escapeHtml(w.message)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    `;
  }

  content.innerHTML = `
    ${alertsHtml}
    <div class="space-y-4">
      <div class="relative h-56 sm:h-72 w-full rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        ${safeMainImg ? `
          <img src="${escapeHtml(safeMainImg)}" alt="${escapeHtml(place.name)}" class="w-full h-full object-cover">
        ` : `
          <div class="w-full h-full flex flex-col items-center justify-center text-slate-400">
            <span class="material-symbols-outlined text-5xl">image_not_supported</span>
            <span class="text-sm mt-1">Chưa có ảnh đại diện</span>
          </div>
        `}
        <div class="absolute top-3 left-3 flex flex-wrap gap-2">
          <span class="px-3 py-1 rounded-full text-xs font-bold ${statusBadge.cls}">${statusBadge.label}</span>
          <span class="px-3 py-1 rounded-full text-xs font-bold bg-orange-600 text-white">${escapeHtml(place.category || 'Chưa phân loại')}</span>
        </div>
      </div>

      <div>
        <h3 id="previewPlaceTitle" class="text-2xl font-black text-slate-900 dark:text-white">${escapeHtml(place.name)}</h3>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          <strong>Slug:</strong> /place/${escapeHtml(place.slug)} · <strong>Khu vực:</strong> ${escapeHtml(place.area || 'Chưa có')}
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
        <div><strong>Địa chỉ:</strong> ${escapeHtml(place.address || 'Chưa có')}</div>
        <div><strong>Tọa độ GPS:</strong> ${escapeHtml(place.coordinates || 'Chưa có')}</div>
        <div><strong>Giờ mở cửa:</strong> ${escapeHtml(place.opening_time || '--')} - ${escapeHtml(place.closing_time || '--')}</div>
        <div><strong>Trạng thái hoạt động:</strong> ${escapeHtml(place.operating_status || 'Bình thường')}</div>
        <div><strong>Đánh giá:</strong> ${Number(place.rating) > 0 ? `⭐ ${escapeHtml(place.rating)}/5 (${escapeHtml(place.review_count || 0)} lượt)` : 'Chưa có đánh giá'}</div>
        <div><strong>Giá tham khảo:</strong> ${escapeHtml(place.price_raw || 'Liên hệ / Chưa rõ')}</div>
      </div>

      <div>
        <h4 class="font-bold text-slate-800 dark:text-slate-200 mb-1">Mô tả:</h4>
        <p class="text-slate-600 dark:text-slate-300 text-sm leading-relaxed whitespace-pre-line">${escapeHtml(place.description || 'Chưa có mô tả chi tiết.')}</p>
      </div>

      ${Array.isArray(place.images) && place.images.length > 1 ? `
        <div>
          <h4 class="font-bold text-slate-800 dark:text-slate-200 mb-2">Hình ảnh khác (${place.images.length}):</h4>
          <div class="flex flex-wrap gap-2">
            ${place.images.map(img => {
              const safeImg = sanitizeImageUrl(img);
              return safeImg ? `
                <a href="${escapeHtml(safeImg)}" target="_blank" rel="noopener noreferrer" class="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 hover:opacity-80 transition">
                  <img src="${escapeHtml(safeImg)}" alt="Ảnh phụ" class="w-full h-full object-cover">
                </a>
              ` : '';
            }).join('')}
          </div>
        </div>
      ` : ''}

      <div class="flex flex-wrap justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
        <button type="button" id="closePreviewBtn" class="min-h-[44px] px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800">
          Đóng
        </button>
        ${canManagePlaces() && place.status !== 'approved' ? `
          ${hasErrors ? `
            <button type="button" id="approveFromPreviewBtn" disabled aria-disabled="true"
              class="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-bold cursor-not-allowed opacity-60 flex items-center gap-1.5"
              title="Không thể duyệt khi còn lỗi dữ liệu bắt buộc">
              <span class="material-symbols-outlined text-lg">block</span>
              <span>Không thể duyệt (Còn lỗi)</span>
            </button>
          ` : `
            <button type="button" id="approveFromPreviewBtn"
              class="min-h-[44px] px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold transition flex items-center gap-1.5 shadow-sm">
              <span class="material-symbols-outlined text-lg">check_circle</span>
              <span>Duyệt xuất bản</span>
            </button>
          `}
        ` : ''}
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  const closePreview = () => {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', keydownHandler);
    if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
      previousActiveElement.focus();
    }
  };

  const keydownHandler = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closePreview();
    }
  };
  document.addEventListener('keydown', keydownHandler);

  const closeBtn = document.getElementById('closePreviewBtn');
  if (closeBtn) closeBtn.onclick = closePreview;

  const modalHeaderCloseBtn = document.getElementById('placePreviewCloseBtn');
  if (modalHeaderCloseBtn) modalHeaderCloseBtn.onclick = closePreview;

  const approveBtn = document.getElementById('approveFromPreviewBtn');
  if (approveBtn) {
    approveBtn.onclick = () => {
      const v = validatePlace(place, { mode: 'approval' });
      if (v.errors.length > 0) {
        setMessage('Không thể duyệt: Địa điểm còn lỗi vi phạm chất lượng dữ liệu bắt buộc.', 'error');
        return;
      }

      if (v.warnings.length > 0) {
        showConfirmDialog({
          title: 'Cảnh báo tính toàn vẹn dữ liệu',
          message: `Địa điểm "${place.name}" còn ${v.warnings.length} lưu ý dữ liệu (${v.warnings.map(i => i.message).join('; ')}). Bạn có chắc chắn muốn bỏ qua các lưu ý này và tiếp tục duyệt xuất bản?`,
          confirmText: 'Vẫn duyệt địa điểm',
          confirmClass: 'bg-green-600 hover:bg-green-700 text-white',
          onConfirm: async () => {
            closePreview();
            await executeUpdatePlaceStatus(place.id, 'approved', place.updated_at);
          }
        });
      } else {
        showConfirmDialog({
          title: 'Xác nhận duyệt địa điểm',
          message: `Địa điểm "${place.name}" đã hoàn thiện dữ liệu hợp lệ. Bạn có chắc chắn muốn duyệt và xuất bản địa điểm này?`,
          confirmText: 'Duyệt địa điểm',
          confirmClass: 'bg-green-600 hover:bg-green-700 text-white',
          onConfirm: async () => {
            closePreview();
            await executeUpdatePlaceStatus(place.id, 'approved', place.updated_at);
          }
        });
      }
    };
  }

  if (closeBtn) closeBtn.focus();
}

// ----------------------------------------------------------------------------
// THỐNG KÊ DASHBOARD (STAT CARDS)
// ----------------------------------------------------------------------------

/**
 * Tải số liệu tổng quan cho Dashboard
 */
export async function loadDashboardStats() {
  if (typeof document === 'undefined') return;
  try {
    // 1. Số địa điểm draft
    const draftPlacesRes = await adminRequest('/api/admin-places?status=draft&limit=1').catch(() => ({ pagination: { total: 0 } }));
    const draftCount = draftPlacesRes.pagination?.total || 0;
    const draftCountEl = document.getElementById('statDraftPlaces');
    if (draftCountEl) draftCountEl.textContent = draftCount;

    // 2. Số bình luận cần duyệt (pending hoặc hidden)
    const hiddenCommentsRes = await adminRequest('/api/admin-comments?hidden=true&limit=1').catch(() => ({ pagination: { total: 0 } }));
    const hiddenCount = hiddenCommentsRes.pagination?.total || 0;
    const hiddenCountEl = document.getElementById('statPendingComments');
    if (hiddenCountEl) hiddenCountEl.textContent = hiddenCount;

    // 3. Số báo sai chờ xử lý (pending)
    const pendingReportsRes = await adminRequest('/api/admin-reports?status=pending&limit=1').catch(() => ({ pagination: { total: 0 } }));
    const pendingReportsCount = pendingReportsRes.pagination?.total || 0;
    const pendingReportsEl = document.getElementById('statPendingReports');
    if (pendingReportsEl) pendingReportsEl.textContent = pendingReportsCount;

    // 4. Tổng địa điểm đã duyệt (approved)
    const approvedPlacesRes = await adminRequest('/api/admin-places?status=approved&limit=1').catch(() => ({ pagination: { total: 0 } }));
    const approvedCount = approvedPlacesRes.pagination?.total || 0;
    const approvedEl = document.getElementById('statApprovedPlaces');
    if (approvedEl) approvedEl.textContent = approvedCount;

  } catch (err) {
    console.warn('[AdminDashboard] Không thể tải đầy đủ thống kê:', err.message);
  }
}

// ----------------------------------------------------------------------------
// QUẢN TRỊ ĐỊA ĐIỂM (PLACES TAB)
// ----------------------------------------------------------------------------

export function renderPlaces(places, pagination = {}) {
  adminPlaces = places;
  placesPagination = pagination;
  if (typeof document === 'undefined') return;
  const countEl = document.getElementById('placeCount');
  if (countEl) {
    countEl.textContent = `${pagination.total ?? places.length} địa điểm (Trang ${pagination.page || 1}/${pagination.total_pages || 1})`;
  }

  const container = document.getElementById('placesContainer');
  if (!container) return;

  if (!places.length) {
    container.innerHTML = `
      <div class="p-8 text-center text-slate-500 dark:text-slate-400">
        <span class="material-symbols-outlined text-4xl mb-2 text-slate-400">location_off</span>
        <p class="font-medium">Không tìm thấy địa điểm nào phù hợp với bộ lọc.</p>
      </div>
    `;
    return;
  }

  const role = getUserRole();
  const canEdit = canManagePlaces();
  const canDelete = canDeletePlaces();

  container.innerHTML = places.map(place => {
    const statusBadge = placeStatusInfo(place.status);
    const safeImg = sanitizeImageUrl(place.image_link || (Array.isArray(place.images) && place.images[0]) || '');

    return `
      <article class="p-5 bg-white dark:bg-slate-900 transition hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
        <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div class="flex items-start gap-4 min-w-0">
            <div class="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 border border-slate-200 dark:border-slate-700">
              ${safeImg ? `
                <img src="${escapeHtml(safeImg)}" alt="${escapeHtml(place.name)}" class="w-full h-full object-cover">
              ` : `
                <div class="w-full h-full flex items-center justify-center text-slate-400">
                  <span class="material-symbols-outlined text-3xl">image</span>
                </div>
              `}
            </div>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2 mb-1.5">
                <h3 class="font-black text-lg text-slate-900 dark:text-white truncate">${escapeHtml(place.name)}</h3>
                <span class="text-xs px-2.5 py-0.5 rounded-full font-bold ${statusBadge.cls}">${statusBadge.label}</span>
                <span class="text-xs px-2.5 py-0.5 rounded-full font-bold bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300">${escapeHtml(place.category || 'Chưa phân loại')}</span>
                ${place.is_featured ? '<span class="text-xs px-2 py-0.5 rounded-full font-bold bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">Nổi bật</span>' : ''}
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400 mb-1.5 flex flex-wrap gap-x-3 gap-y-1">
                <span>#${place.id}</span>
                <span>slug: <strong>${escapeHtml(place.slug)}</strong></span>
                <span>Khu vực: ${escapeHtml(place.area || place.address || 'Chưa có')}</span>
                <span>Cập nhật: ${formatDate(place.updated_at || place.created_at)}</span>
              </div>
              <p class="text-sm text-slate-600 dark:text-slate-300 line-clamp-2">${escapeHtml(place.description || place.address || 'Chưa có mô tả.')}</p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2 shrink-0 self-end lg:self-start">
            <button type="button" data-action="preview-place" data-place-id="${place.id}"
              class="min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl border border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300 font-bold hover:bg-blue-50 dark:hover:bg-blue-950/50 flex items-center gap-1.5 text-sm">
              <span class="material-symbols-outlined text-lg">visibility</span>
              <span>Xem trước</span>
            </button>

            ${canEdit ? `
              <button type="button" data-action="edit-place" data-place-id="${place.id}"
                class="min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 text-sm">
                <span class="material-symbols-outlined text-lg">edit</span>
                <span>Sửa</span>
              </button>
            ` : ''}

            ${canEdit && place.status !== 'approved' ? `
              <button type="button" data-action="approve-place" data-place-id="${place.id}"
                class="min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold flex items-center gap-1.5 text-sm">
                <span class="material-symbols-outlined text-lg">check_circle</span>
                <span>Duyệt</span>
              </button>
            ` : ''}

            ${canDelete && place.status !== 'archived' ? `
              <button type="button" data-action="archive-place" data-place-id="${place.id}"
                class="min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400 font-bold hover:bg-amber-50 dark:hover:bg-amber-950/50 flex items-center gap-1.5 text-sm">
                <span class="material-symbols-outlined text-lg">archive</span>
                <span>Lưu trữ</span>
              </button>
            ` : ''}

            ${canDelete && place.status === 'archived' ? `
              <button type="button" data-action="delete-place" data-place-id="${place.id}"
                class="min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-1.5 text-sm">
                <span class="material-symbols-outlined text-lg">delete_forever</span>
                <span>Xóa hẳn</span>
              </button>
            ` : ''}
          </div>
        </div>
      </article>
    `;
  }).join('');
}

export async function loadAdminPlaces(page = 1) {
  if (typeof document === 'undefined') return;
  try {
    setMessage('Đang tải danh sách địa điểm...');
    const search = document.getElementById('placeSearch')?.value.trim() || '';
    const status = document.getElementById('placeStatusFilter')?.value || 'all';
    const category = document.getElementById('placeCategoryFilter')?.value.trim() || '';

    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '15');
    if (status !== 'all') params.set('status', status);
    if (category) params.set('category', category);
    if (search) params.set('search', search);

    const payload = await adminRequest(`/api/admin-places?${params.toString()}`);
    renderPlaces(payload.places || [], payload.pagination || {});
    renderPlacesPagination(payload.pagination || {});
    setMessage('Đã tải địa điểm thành công.', 'success');
  } catch (error) {
    setMessage(error.message || 'Không thể tải danh sách địa điểm.', 'error');
  }
}

function renderPlacesPagination(pagination) {
  const container = document.getElementById('placesPaginationContainer');
  if (!container) return;
  const page = pagination.page || 1;
  const totalPages = pagination.total_pages || 1;

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-800">
      <button type="button" ${page <= 1 ? 'disabled' : ''} data-action="paginate-places" data-page="${page - 1}"
        class="min-h-[44px] min-w-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed">
        Trang trước
      </button>
      <span class="text-sm font-medium text-slate-500 dark:text-slate-400">Trang ${page} / ${totalPages}</span>
      <button type="button" ${page >= totalPages ? 'disabled' : ''} data-action="paginate-places" data-page="${page + 1}"
        class="min-h-[44px] min-w-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed">
        Trang sau
      </button>
    </div>
  `;
}

export function openPlaceEditor(id) {
  if (!canManagePlaces()) {
    setMessage('Bạn không có quyền sửa địa điểm (yêu cầu quyền Admin hoặc Editor).', 'error');
    return;
  }

  const place = adminPlaces.find(p => Number(p.id) === Number(id));
  if (!place) return;

  const editor = document.getElementById('placeEditor');
  if (!editor) return;

  editor.classList.remove('hidden');
  document.getElementById('placeEditorTitle').textContent = `Sửa địa điểm: ${place.name}`;
  document.getElementById('placeEditorMeta').textContent = `#${place.id} · cập nhật ${formatDate(place.updated_at || place.created_at)}`;

  document.getElementById('placeId').value = place.id;
  const expectedUpdatedAtEl = document.getElementById('placeExpectedUpdatedAt');
  if (expectedUpdatedAtEl) {
    expectedUpdatedAtEl.value = place.updated_at || '';
  }
  document.getElementById('placeName').value = place.name || '';
  document.getElementById('placeSlug').value = place.slug || '';
  document.getElementById('placeCategory').value = place.category || '';
  document.getElementById('placeStatus').value = place.status || 'draft';
  document.getElementById('placeArea').value = place.area || '';
  document.getElementById('placeAddress').value = place.address || '';
  document.getElementById('placeMapLink').value = place.map_link || '';
  document.getElementById('placePriceRaw').value = place.price_raw || '';
  document.getElementById('placeOpeningTime').value = place.opening_time || '';
  document.getElementById('placeClosingTime').value = place.closing_time || '';
  document.getElementById('placeOperatingStatus').value = place.operating_status || 'Normal';
  document.getElementById('placeRating').value = place.rating ?? 0;
  document.getElementById('placeCoordinates').value = place.coordinates || '';
  document.getElementById('placeContact').value = place.contact || '';
  document.getElementById('placeContributor').value = place.contributor || '';
  document.getElementById('placeSortOrder').value = place.sort_order ?? 0;
  document.getElementById('placeIsFeatured').checked = Boolean(place.is_featured);
  document.getElementById('placeImageLink').value = place.image_link || '';
  document.getElementById('placeImages').value = Array.isArray(place.images) ? place.images.join('\n') : '';
  document.getElementById('placeDescription').value = place.description || '';
  document.getElementById('placeNote').value = place.note || '';

  editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function openNewPlaceForm() {
  if (!canManagePlaces()) {
    setMessage('Bạn không có quyền tạo địa điểm mới (yêu cầu quyền Admin hoặc Editor).', 'error');
    return;
  }

  const editor = document.getElementById('placeEditor');
  if (!editor) return;

  editor.classList.remove('hidden');
  document.getElementById('placeEditorTitle').textContent = 'Tạo địa điểm mới';
  document.getElementById('placeEditorMeta').textContent = 'Điền đầy đủ thông tin để gửi kiểm duyệt hoặc xuất bản.';

  document.getElementById('placeId').value = '';
  const expectedUpdatedAtEl = document.getElementById('placeExpectedUpdatedAt');
  if (expectedUpdatedAtEl) {
    expectedUpdatedAtEl.value = '';
  }
  document.getElementById('placeName').value = '';
  document.getElementById('placeSlug').value = '';
  document.getElementById('placeCategory').value = '';
  document.getElementById('placeStatus').value = 'draft';
  document.getElementById('placeArea').value = '';
  document.getElementById('placeAddress').value = '';
  document.getElementById('placeMapLink').value = '';
  document.getElementById('placePriceRaw').value = '';
  document.getElementById('placeOpeningTime').value = '';
  document.getElementById('placeClosingTime').value = '';
  document.getElementById('placeOperatingStatus').value = 'Normal';
  document.getElementById('placeRating').value = '0';
  document.getElementById('placeCoordinates').value = '';
  document.getElementById('placeContact').value = '';
  document.getElementById('placeContributor').value = getSession()?.user?.email || 'Admin';
  document.getElementById('placeSortOrder').value = '0';
  document.getElementById('placeIsFeatured').checked = false;
  document.getElementById('placeImageLink').value = '';
  document.getElementById('placeImages').value = '';
  document.getElementById('placeDescription').value = '';
  document.getElementById('placeNote').value = '';

  editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function closePlaceEditor() {
  document.getElementById('placeEditor')?.classList.add('hidden');
}

export async function savePlace(event) {
  if (event) event.preventDefault();
  if (!canManagePlaces()) {
    setMessage('Bạn không có quyền thực hiện thao tác này.', 'error');
    return;
  }

  const placeId = document.getElementById('placeId').value;
  const isNew = !placeId;

  const rawImages = document.getElementById('placeImages').value.split('\n').map(s => s.trim()).filter(Boolean);
  const validatedImages = rawImages.map(img => sanitizeImageUrl(img)).filter(Boolean);
  const mainImage = sanitizeImageUrl(document.getElementById('placeImageLink').value);

  const payload = {
    name: document.getElementById('placeName').value.trim(),
    slug: document.getElementById('placeSlug').value.trim().toLowerCase(),
    category: document.getElementById('placeCategory').value.trim(),
    status: document.getElementById('placeStatus').value,
    area: document.getElementById('placeArea').value.trim(),
    address: document.getElementById('placeAddress').value.trim(),
    map_link: document.getElementById('placeMapLink').value.trim(),
    price_raw: document.getElementById('placePriceRaw').value.trim(),
    opening_time: document.getElementById('placeOpeningTime').value.trim(),
    closing_time: document.getElementById('placeClosingTime').value.trim(),
    operating_status: document.getElementById('placeOperatingStatus').value.trim() || 'Normal',
    rating: parseFloat(document.getElementById('placeRating').value) || 0,
    coordinates: document.getElementById('placeCoordinates').value.trim(),
    contact: document.getElementById('placeContact').value.trim(),
    contributor: document.getElementById('placeContributor').value.trim(),
    sort_order: parseInt(document.getElementById('placeSortOrder').value, 10) || 0,
    is_featured: document.getElementById('placeIsFeatured').checked,
    image_link: mainImage,
    images: validatedImages,
    description: document.getElementById('placeDescription').value.trim(),
    note: document.getElementById('placeNote').value.trim()
  };

  if (!isNew) {
    payload.id = Number.parseInt(placeId, 10);
    const existingPlace = adminPlaces.find(p => Number(p.id) === payload.id);
    const expectedUpdatedAt = document.getElementById('placeExpectedUpdatedAt')?.value
      || existingPlace?.updated_at
      || '';
    payload.expected_updated_at = expectedUpdatedAt;
  }

  try {
    setMessage(isNew ? 'Đang tạo địa điểm mới...' : 'Đang cập nhật địa điểm...');
    const res = await adminRequest('/api/admin-places', {
      method: isNew ? 'POST' : 'PATCH',
      body: JSON.stringify(payload)
    });

    if (res && res.place) {
      const idx = adminPlaces.findIndex(p => Number(p.id) === Number(res.place.id));
      if (idx !== -1) {
        adminPlaces[idx] = { ...adminPlaces[idx], ...res.place };
      }
      const expectedUpdatedAtEl = document.getElementById('placeExpectedUpdatedAt');
      if (expectedUpdatedAtEl && res.place.updated_at) {
        expectedUpdatedAtEl.value = res.place.updated_at;
      }
    }

    closePlaceEditor();
    await loadAdminPlaces(placesPagination.page || 1);
    await loadDashboardStats();
    setMessage(isNew ? 'Đã tạo địa điểm thành công.' : 'Đã lưu địa điểm thành công.', 'success');
  } catch (error) {
    setMessage(error.message || 'Không thể lưu địa điểm.', 'error');
  }
}

export async function executeUpdatePlaceStatus(id, newStatus, explicitExpectedUpdatedAt = null) {
  if (!canManagePlaces()) {
    setMessage('Bạn không có quyền thay đổi trạng thái địa điểm.', 'error');
    return;
  }

  const numericId = Number(id);
  const place = adminPlaces.find(p => Number(p.id) === numericId);
  const expectedUpdatedAt = explicitExpectedUpdatedAt || place?.updated_at || '';

  try {
    setMessage(`Đang chuyển trạng thái địa điểm sang '${newStatus}'...`);
    const res = await adminRequest('/api/admin-places', {
      method: 'PATCH',
      body: JSON.stringify({
        id: numericId,
        status: newStatus,
        expected_updated_at: expectedUpdatedAt
      })
    });

    if (res && res.place) {
      const idx = adminPlaces.findIndex(p => Number(p.id) === numericId);
      if (idx !== -1) {
        adminPlaces[idx] = { ...adminPlaces[idx], ...res.place };
      }
    }

    await loadAdminPlaces(placesPagination.page || 1);
    await loadDashboardStats();
    setMessage(`Đã cập nhật trạng thái địa điểm thành công sang '${newStatus}'.`, 'success');
    return res;
  } catch (error) {
    setMessage(error.message || 'Lỗi khi cập nhật trạng thái địa điểm.', 'error');
    throw error;
  }
}

export async function requestApprovePlace(id) {
  if (!canManagePlaces()) {
    setMessage('Bạn không có quyền duyệt địa điểm.', 'error');
    return;
  }

  const place = adminPlaces.find(p => Number(p.id) === Number(id));
  if (!place) {
    setMessage(`Không tìm thấy dữ liệu địa điểm #${id}.`, 'error');
    return;
  }

  // 1. Chạy validatePlace
  const validation = validatePlace(place, { mode: 'approval' });

  if (validation.errors.length > 0) {
    openPlacePreview(place);
    setMessage(`Địa điểm "${place.name}" có ${validation.errors.length} lỗi vi phạm hợp đồng dữ liệu. Nút Duyệt đã bị khóa, vui lòng sửa lỗi trước.`, 'error');
    return;
  }

  if (validation.warnings.length > 0) {
    // Nếu có cảnh báo, mở preview và hiển thị cảnh báo
    openPlacePreview(place);
    setMessage(`Địa điểm "${place.name}" có ${validation.warnings.length} lưu ý dữ liệu du lịch chưa đạt chuẩn. Vui lòng kiểm tra kỹ trước khi duyệt.`, 'warning');
    return;
  }

  // 2. Nếu không có cảnh báo: yêu cầu xác nhận rõ ràng trước khi duyệt
  showConfirmDialog({
    title: 'Xác nhận duyệt địa điểm',
    message: `Địa điểm "${place.name}" đã hoàn thiện dữ liệu hợp lệ. Bạn có chắc chắn muốn duyệt và công khai địa điểm này?`,
    confirmText: 'Duyệt địa điểm',
    confirmClass: 'bg-green-600 hover:bg-green-700 text-white',
    onConfirm: async () => {
      await executeUpdatePlaceStatus(place.id, 'approved', place.updated_at);
    }
  });
}

export async function updatePlaceStatus(id, newStatus) {
  if (newStatus === 'approved') {
    return requestApprovePlace(id);
  }
  return executeUpdatePlaceStatus(id, newStatus);
}

export function confirmArchivePlace(id, optionalName) {
  if (!canDeletePlaces()) {
    setMessage('Chỉ Admin mới có quyền lưu trữ hoặc xóa địa điểm.', 'error');
    return;
  }

  const place = adminPlaces.find(p => Number(p.id) === Number(id));
  const placeName = optionalName || (place ? place.name : `Địa điểm #${id}`);

  showConfirmDialog({
    title: 'Lưu trữ địa điểm',
    message: `Bạn có chắc chắn muốn chuyển địa điểm "${placeName}" vào mục lưu trữ (soft-delete)? Địa điểm này sẽ ngừng hiển thị công khai.`,
    confirmText: 'Lưu trữ',
    confirmClass: 'bg-amber-600 hover:bg-amber-700 text-white',
    onConfirm: async () => {
      try {
        setMessage('Đang lưu trữ địa điểm...');
        await adminRequest(`/api/admin-places?id=${id}&permanent=false`, { method: 'DELETE' });
        await loadAdminPlaces(placesPagination.page || 1);
        await loadDashboardStats();
        setMessage('Đã lưu trữ địa điểm thành công.', 'success');
      } catch (err) {
        setMessage(err.message || 'Không thể lưu trữ địa điểm.', 'error');
      }
    }
  });
}

export function confirmPermanentDeletePlace(id, optionalName) {
  if (!canDeletePlaces()) {
    setMessage('Chỉ Admin mới có quyền xóa vĩnh viễn địa điểm.', 'error');
    return;
  }

  const place = adminPlaces.find(p => Number(p.id) === Number(id));
  const placeName = optionalName || (place ? place.name : `Địa điểm #${id}`);

  showConfirmDialog({
    title: 'Xóa vĩnh viễn địa điểm',
    message: `CẢNH BÁO: Xóa vĩnh viễn địa điểm "${placeName}" khỏi cơ sở dữ liệu? Dữ liệu này KHÔNG thể phục hồi!`,
    confirmText: 'Xóa vĩnh viễn',
    confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
    onConfirm: async () => {
      try {
        setMessage('Đang xóa vĩnh viễn địa điểm...');
        await adminRequest(`/api/admin-places?id=${id}&permanent=true`, { method: 'DELETE' });
        await loadAdminPlaces(placesPagination.page || 1);
        await loadDashboardStats();
        setMessage('Đã xóa vĩnh viễn địa điểm.', 'success');
      } catch (err) {
        setMessage(err.message || 'Không thể xóa địa điểm.', 'error');
      }
    }
  });
}

// ----------------------------------------------------------------------------
// QUẢN TRỊ BÌNH LUẬN (COMMENTS TAB)
// ----------------------------------------------------------------------------

export function renderComments(comments, pagination = {}) {
  adminComments = comments;
  commentsPagination = pagination;
  const countEl = document.getElementById('commentCount');
  if (countEl) {
    countEl.textContent = `${pagination.total ?? comments.length} bình luận (Trang ${pagination.page || 1}/${pagination.total_pages || 1})`;
  }

  const container = document.getElementById('commentsContainer');
  if (!container) return;

  if (!comments.length) {
    container.innerHTML = `
      <div class="p-8 text-center text-slate-500 dark:text-slate-400">
        <span class="material-symbols-outlined text-4xl mb-2 text-slate-400">chat_bubble_outline</span>
        <p class="font-medium">Không tìm thấy bình luận nào.</p>
      </div>
    `;
    return;
  }

  const canModerate = canModerateComments();
  const canDelete = canDeleteComments();

  container.innerHTML = comments.map(comment => {
    const isHidden = Boolean(comment.is_hidden || comment.status === 'hidden');
    const safePhoto = sanitizeImageUrl(comment.photo_url);

    return `
      <article class="p-5 ${isHidden ? 'bg-slate-50 dark:bg-slate-900/60 opacity-80' : 'bg-white dark:bg-slate-900'} transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
        <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2 mb-1.5">
              <span class="font-black text-slate-900 dark:text-white">${escapeHtml(comment.author_name)}</span>
              <span class="text-amber-500 text-sm font-bold">${'★'.repeat(Number(comment.rating || 0))}${'☆'.repeat(5 - Number(comment.rating || 0))}</span>
              <span class="text-xs px-2.5 py-0.5 rounded-full font-bold ${
                isHidden ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' : 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
              }">
                ${isHidden ? 'Đã ẩn' : 'Đang hiện'}
              </span>
            </div>
            <div class="text-xs text-slate-500 dark:text-slate-400 mb-2 flex flex-wrap gap-x-3 gap-y-1">
              <span>#${comment.id}</span>
              <span>Địa điểm: <strong>${escapeHtml(comment.place_name || comment.place_id)}</strong></span>
              <span>Thời gian: ${formatDate(comment.created_at)}</span>
            </div>
            <p class="text-sm text-slate-700 dark:text-slate-200 leading-relaxed break-words whitespace-pre-line">${escapeHtml(comment.comment_text)}</p>

            ${safePhoto ? `
              <div class="mt-3">
                <a href="${escapeHtml(safePhoto)}" target="_blank" rel="noopener noreferrer" class="inline-block group" title="Xem ảnh gốc an toàn">
                  <img src="${escapeHtml(safePhoto)}" alt="Ảnh đính kèm" class="w-20 h-20 object-cover rounded-xl border border-slate-200 dark:border-slate-700 group-hover:opacity-80 transition">
                </a>
              </div>
            ` : ''}
          </div>

          <div class="flex flex-wrap items-center gap-2 shrink-0 self-end lg:self-start">
            ${canModerate ? `
              <button type="button" data-action="toggle-comment-hidden" data-comment-id="${comment.id}" data-should-hide="${!isHidden}"
                class="min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl font-bold text-sm transition flex items-center gap-1.5 ${
                  isHidden ? 'bg-green-600 hover:bg-green-700 text-white' : 'border border-amber-300 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                }">
                <span class="material-symbols-outlined text-lg">${isHidden ? 'visibility' : 'visibility_off'}</span>
                <span>${isHidden ? 'Hiện lại' : 'Ẩn'}</span>
              </button>
            ` : ''}

            ${canDelete ? `
              <button type="button" data-action="delete-comment" data-comment-id="${comment.id}"
                class="min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-1.5 text-sm">
                <span class="material-symbols-outlined text-lg">delete</span>
                <span>Xóa</span>
              </button>
            ` : ''}
          </div>
        </div>
      </article>
    `;
  }).join('');
}

export async function loadAdminComments(page = 1) {
  try {
    setMessage('Đang tải danh sách bình luận...');
    const hiddenFilter = document.getElementById('hiddenFilter')?.value || 'all';

    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '15');
    if (hiddenFilter !== 'all') params.set('hidden', hiddenFilter);

    const payload = await adminRequest(`/api/admin-comments?${params.toString()}`);
    renderComments(payload.comments || [], payload.pagination || {});
    renderCommentsPagination(payload.pagination || {});
    setMessage('Đã tải bình luận thành công.', 'success');
  } catch (error) {
    setMessage(error.message || 'Không thể tải danh sách bình luận.', 'error');
  }
}

function renderCommentsPagination(pagination) {
  const container = document.getElementById('commentsPaginationContainer');
  if (!container) return;
  const page = pagination.page || 1;
  const totalPages = pagination.total_pages || 1;

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-800">
      <button type="button" ${page <= 1 ? 'disabled' : ''} data-action="paginate-comments" data-page="${page - 1}"
        class="min-h-[44px] min-w-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed">
        Trang trước
      </button>
      <span class="text-sm font-medium text-slate-500 dark:text-slate-400">Trang ${page} / ${totalPages}</span>
      <button type="button" ${page >= totalPages ? 'disabled' : ''} data-action="paginate-comments" data-page="${page + 1}"
        class="min-h-[44px] min-w-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed">
        Trang sau
      </button>
    </div>
  `;
}

async function executeCommentStatusChange(id, shouldHide) {
  try {
    setMessage(shouldHide ? 'Đang ẩn bình luận...' : 'Đang hiện lại bình luận...');
    await adminRequest('/api/admin-comments', {
      method: 'PATCH',
      body: JSON.stringify({ id, is_hidden: shouldHide, status: shouldHide ? 'hidden' : 'approved' })
    });

    await loadAdminComments(commentsPagination.page || 1);
    await loadDashboardStats();
    setMessage(shouldHide ? 'Đã ẩn bình luận thành công.' : 'Đã duyệt hiện lại bình luận.', 'success');
  } catch (error) {
    setMessage(error.message || 'Lỗi khi cập nhật trạng thái bình luận.', 'error');
  }
}

export function requestToggleCommentHidden(id, shouldHide) {
  if (!canModerateComments()) {
    setMessage('Bạn không có quyền kiểm duyệt bình luận.', 'error');
    return;
  }

  const comment = adminComments.find(c => Number(c.id) === Number(id));
  const commentText = comment && comment.comment_text
    ? `"${comment.comment_text.slice(0, 45)}${comment.comment_text.length > 45 ? '...' : ''}"`
    : `bình luận #${id}`;

  if (shouldHide) {
    showConfirmDialog({
      title: 'Xác nhận ẩn bình luận',
      message: `Bạn có chắc chắn muốn ẩn ${commentText} khỏi trang công khai?`,
      confirmText: 'Ẩn bình luận',
      confirmClass: 'bg-amber-600 hover:bg-amber-700 text-white',
      onConfirm: async () => {
        await executeCommentStatusChange(id, true);
      }
    });
  } else {
    showConfirmDialog({
      title: 'Xác nhận hiện lại bình luận',
      message: `Bạn có chắc chắn muốn duyệt hiện lại ${commentText} trên trang công khai?`,
      confirmText: 'Hiện lại bình luận',
      confirmClass: 'bg-green-600 hover:bg-green-700 text-white',
      onConfirm: async () => {
        await executeCommentStatusChange(id, false);
      }
    });
  }
}

export function toggleCommentHidden(id, shouldHide) {
  return requestToggleCommentHidden(id, shouldHide);
}

export function confirmDeleteComment(id) {
  if (!canDeleteComments()) {
    setMessage('Chỉ Admin mới có quyền xóa bình luận.', 'error');
    return;
  }

  showConfirmDialog({
    title: 'Xóa bình luận vĩnh viễn',
    message: 'Bạn có chắc chắn muốn xóa bình luận này? Hành động này sẽ xóa dữ liệu khỏi máy chủ và không thể hoàn tác.',
    confirmText: 'Xóa bình luận',
    confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
    onConfirm: async () => {
      try {
        setMessage('Đang xóa bình luận...');
        await adminRequest(`/api/admin-comments?id=${id}`, { method: 'DELETE' });
        await loadAdminComments(commentsPagination.page || 1);
        await loadDashboardStats();
        setMessage('Đã xóa bình luận thành công.', 'success');
      } catch (err) {
        setMessage(err.message || 'Không thể xóa bình luận.', 'error');
      }
    }
  });
}

// ----------------------------------------------------------------------------
// QUẢN TRỊ BÁO SAI THÔNG TIN (REPORTS TAB - G8.2/G8.3)
// ----------------------------------------------------------------------------

export function renderReports(reports, pagination = {}) {
  adminReports = reports;
  reportsPagination = pagination;
  const countEl = document.getElementById('reportCount');
  if (countEl) {
    countEl.textContent = `${pagination.total ?? reports.length} báo cáo (Trang ${pagination.page || 1}/${pagination.total_pages || 1})`;
  }

  const container = document.getElementById('reportsContainer');
  if (!container) return;

  if (!reports.length) {
    container.innerHTML = `
      <div class="p-8 text-center text-slate-500 dark:text-slate-400">
        <span class="material-symbols-outlined text-4xl mb-2 text-slate-400">report_off</span>
        <p class="font-medium">Không có phản ánh / báo sai nào.</p>
      </div>
    `;
    return;
  }

  const canManage = canManageReports();
  const canSeePII = canViewPII();

  container.innerHTML = reports.map(report => {
    const statusBadge = reportStatusInfo(report.status);
    const validNextStatuses = REPORT_TRANSITIONS[report.status] || [];

    return `
      <article class="p-5 bg-white dark:bg-slate-900 transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
        <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2 mb-1.5">
              <span class="font-black text-slate-900 dark:text-white">Báo sai: ${escapeHtml(report.place_name || report.place_id)}</span>
              <span class="text-xs px-2.5 py-0.5 rounded-full font-bold ${statusBadge.cls}">${statusBadge.label}</span>
              <span class="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 uppercase">${escapeHtml(report.issue_type || 'Khác')}</span>
            </div>

            <div class="text-xs text-slate-500 dark:text-slate-400 mb-2 flex flex-wrap gap-x-3 gap-y-1">
              <span>Mã ID: <strong>${escapeHtml(report.id)}</strong></span>
              <span>Gửi lúc: ${formatDate(report.created_at)}</span>
              ${report.reviewed_at ? `<span>Xử lý lúc: ${formatDate(report.reviewed_at)}</span>` : ''}
              ${canSeePII && report.reporter_contact ? `<span>Liên hệ: <strong class="text-slate-700 dark:text-slate-200">${escapeHtml(report.reporter_contact)}</strong></span>` : ''}
              ${canSeePII && report.ip ? `<span>IP: ${escapeHtml(report.ip)}</span>` : ''}
            </div>

            <div class="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 mb-3">
              <p class="text-sm text-slate-700 dark:text-slate-200 leading-relaxed break-words whitespace-pre-line">${escapeHtml(report.details || 'Không có mô tả chi tiết kèm theo.')}</p>
            </div>

            ${report.admin_notes ? `
              <div class="text-xs text-slate-600 dark:text-slate-300 mb-3">
                <strong>Ghi chú quản trị:</strong> ${escapeHtml(report.admin_notes)}
              </div>
            ` : ''}

            ${canManage ? `
              <div class="mt-2">
                <label for="reportNotes-${report.id}" class="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Cập nhật ghi chú xử lý:</label>
                <div class="flex gap-2">
                  <input id="reportNotes-${report.id}" type="text" placeholder="Nhập ghi chú xử lý..." value="${escapeHtml(report.admin_notes || '')}"
                    class="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                  <button type="button" data-action="save-report-notes" data-report-id="${report.id}"
                    class="min-h-[44px] min-w-[44px] px-4 py-2 rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white text-xs font-bold transition">
                    Lưu ghi chú
                  </button>
                </div>
              </div>
            ` : ''}
          </div>

          <div class="flex flex-col sm:flex-row sm:items-center gap-2 shrink-0 self-end lg:self-start">
            <button type="button" data-action="view-report-place" data-report-id="${report.id}"
              class="min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl border border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300 font-bold hover:bg-blue-50 dark:hover:bg-blue-950/50 flex items-center gap-1.5 text-sm">
              <span class="material-symbols-outlined text-lg">open_in_new</span>
              <span>Xem địa điểm</span>
            </button>

            ${canManage && validNextStatuses.includes('reviewed') ? `
              <button type="button" data-action="update-report-status" data-report-id="${report.id}" data-target-status="reviewed"
                class="min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-bold hover:bg-blue-50 dark:hover:bg-blue-950/40 text-sm">
                Đang thẩm định
              </button>
            ` : ''}

            ${canManage && validNextStatuses.includes('resolved') ? `
              <button type="button" data-action="update-report-status" data-report-id="${report.id}" data-target-status="resolved"
                class="min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm">
                Đã giải quyết
              </button>
            ` : ''}

            ${canManage && validNextStatuses.includes('dismissed') ? `
              <button type="button" data-action="update-report-status" data-report-id="${report.id}" data-target-status="dismissed"
                class="min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 text-sm">
                Bác bỏ
              </button>
            ` : ''}
          </div>
        </div>
      </article>
    `;
  }).join('');
}

export async function loadAdminReports(page = 1) {
  try {
    setMessage('Đang tải danh sách phản ánh / báo sai...');
    const status = document.getElementById('reportStatusFilter')?.value || 'all';
    const search = document.getElementById('reportSearch')?.value.trim() || '';

    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '15');
    if (status !== 'all') params.set('status', status);
    if (search) params.set('search', search);

    const payload = await adminRequest(`/api/admin-reports?${params.toString()}`);
    renderReports(payload.reports || [], payload.pagination || {});
    renderReportsPagination(payload.pagination || {});
    setMessage('Đã tải danh sách báo sai thành công.', 'success');
  } catch (error) {
    setMessage(error.message || 'Không thể tải danh sách phản ánh.', 'error');
  }
}

function renderReportsPagination(pagination) {
  const container = document.getElementById('reportsPaginationContainer');
  if (!container) return;
  const page = pagination.page || 1;
  const totalPages = pagination.total_pages || 1;

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-800">
      <button type="button" ${page <= 1 ? 'disabled' : ''} data-action="paginate-reports" data-page="${page - 1}"
        class="min-h-[44px] min-w-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed">
        Trang trước
      </button>
      <span class="text-sm font-medium text-slate-500 dark:text-slate-400">Trang ${page} / ${totalPages}</span>
      <button type="button" ${page >= totalPages ? 'disabled' : ''} data-action="paginate-reports" data-page="${page + 1}"
        class="min-h-[44px] min-w-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed">
        Trang sau
      </button>
    </div>
  `;
}

async function executeUpdateReportStatus(id, newStatus) {
  try {
    setMessage(`Đang chuyển trạng thái báo cáo sang '${newStatus}'...`);
    const notesInput = document.getElementById(`reportNotes-${id}`);
    const adminNotes = notesInput ? notesInput.value.trim() : null;

    await adminRequest('/api/admin-reports', {
      method: 'PATCH',
      body: JSON.stringify({
        id,
        status: newStatus,
        ...(adminNotes ? { admin_notes: adminNotes } : {})
      })
    });

    await loadAdminReports(reportsPagination.page || 1);
    await loadDashboardStats();
    setMessage(`Đã cập nhật trạng thái báo cáo thành '${newStatus}'.`, 'success');
  } catch (error) {
    setMessage(error.message || 'Lỗi khi cập nhật trạng thái báo cáo.', 'error');
  }
}

export function requestUpdateReportStatus(id, newStatus) {
  if (!canManageReports()) {
    setMessage('Bạn không có quyền xử lý báo cáo phản ánh.', 'error');
    return;
  }

  const report = adminReports.find(r => String(r.id) === String(id));
  const placeSlug = report ? report.place_id : `#${id}`;

  if (newStatus === 'dismissed') {
    showConfirmDialog({
      title: 'Xác nhận bác bỏ báo sai',
      message: `Bạn có chắc chắn muốn bác bỏ báo cáo phản ánh đối với "${placeSlug}"? Hành động này sẽ chuyển trạng thái báo cáo sang "dismissed".`,
      confirmText: 'Bác bỏ báo sai',
      confirmClass: 'bg-slate-700 hover:bg-slate-800 text-white',
      onConfirm: async () => {
        await executeUpdateReportStatus(id, newStatus);
      }
    });
    return;
  }

  executeUpdateReportStatus(id, newStatus);
}

export async function updateReportStatus(id, newStatus) {
  return requestUpdateReportStatus(id, newStatus);
}

export async function saveReportNotes(id) {
  if (!canManageReports()) {
    setMessage('Bạn không có quyền cập nhật ghi chú.', 'error');
    return;
  }

  const notesInput = document.getElementById(`reportNotes-${id}`);
  if (!notesInput) return;
  const notes = notesInput.value.trim();

  try {
    setMessage('Đang lưu ghi chú...');
    await adminRequest('/api/admin-reports', {
      method: 'PATCH',
      body: JSON.stringify({ id, admin_notes: notes })
    });

    setMessage('Đã lưu ghi chú báo cáo thành công.', 'success');
  } catch (error) {
    setMessage(error.message || 'Lỗi khi lưu ghi chú báo cáo.', 'error');
  }
}

export async function findAndOpenPlaceBySlug(slug) {
  if (!slug) return;
  try {
    const payload = await adminRequest(`/api/admin-places?search=${encodeURIComponent(slug)}&limit=1`);
    if (payload.places && payload.places.length > 0) {
      openPlacePreview(payload.places[0]);
    } else {
      setMessage(`Không tìm thấy dữ liệu địa điểm có slug '${slug}'.`, 'warning');
    }
  } catch (err) {
    setMessage('Lỗi khi tìm kiếm địa điểm liên quan.', 'error');
  }
}

// ----------------------------------------------------------------------------
// ĐIỀU HƯỚNG TABS & DARK MODE
// ----------------------------------------------------------------------------

export function showTab(tab) {
  currentTab = tab;
  document.getElementById('placesTab')?.classList.toggle('hidden', tab !== 'places');
  document.getElementById('commentsTab')?.classList.toggle('hidden', tab !== 'comments');
  document.getElementById('reportsTab')?.classList.toggle('hidden', tab !== 'reports');

  const tabBtnClasses = (isActive) =>
    `min-h-[44px] min-w-[44px] px-5 py-2.5 rounded-xl font-bold transition flex items-center gap-2 ${
      isActive
        ? 'bg-orange-600 text-white shadow-sm'
        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
    }`;

  const placesBtn = document.getElementById('placesTabButton');
  const commentsBtn = document.getElementById('commentsTabButton');
  const reportsBtn = document.getElementById('reportsTabButton');

  if (placesBtn) placesBtn.className = tabBtnClasses(tab === 'places');
  if (commentsBtn) commentsBtn.className = tabBtnClasses(tab === 'comments');
  if (reportsBtn) reportsBtn.className = tabBtnClasses(tab === 'reports');

  loadCurrentTab();
}

export function loadCurrentTab() {
  if (currentTab === 'places') return loadAdminPlaces(1);
  if (currentTab === 'comments') return loadAdminComments(1);
  if (currentTab === 'reports') return loadAdminReports(1);
}

/**
 * Bật/Tắt chế độ tối (Dark mode)
 */
export function toggleDarkMode(force) {
  const willBeDark = typeof force === 'boolean' ? force : !document.documentElement.classList.contains('dark');
  if (willBeDark) {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  } else {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  }
  try {
    localStorage.setItem('vivutravinh_theme', willBeDark ? 'dark' : 'light');
  } catch {}
  updateThemeToggleIcon();
  return willBeDark;
}

function initTheme() {
  let isDark = false;
  try {
    const saved = localStorage.getItem('vivutravinh_theme');
    if (saved) {
      isDark = saved === 'dark';
    } else {
      isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
  } catch {}
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  updateThemeToggleIcon();
}

function updateThemeToggleIcon() {
  const icon = document.getElementById('themeToggleIcon');
  if (!icon) return;
  const isDark = document.documentElement.classList.contains('dark');
  icon.textContent = isDark ? 'light_mode' : 'dark_mode';
}

// ----------------------------------------------------------------------------
// GIAO DIỆN AUTH: HIỂN THỊ ĐĂNG NHẬP / NỘI DUNG QUẢN TRỊ
// ----------------------------------------------------------------------------

export function showLoginView(msg = '') {
  document.getElementById('loginSection')?.classList.remove('hidden');
  document.getElementById('adminMainContent')?.classList.add('hidden');
  document.getElementById('userInfoHeader')?.classList.add('hidden');
  if (msg) setLoginMessage(msg, 'error');
}

export function showAuthenticatedView(session) {
  document.getElementById('loginSection')?.classList.add('hidden');
  document.getElementById('adminMainContent')?.classList.remove('hidden');
  const userInfo = document.getElementById('userInfoHeader');
  if (userInfo) {
    userInfo.classList.remove('hidden');
    document.getElementById('userEmailText').textContent = session.user?.email || 'Quản trị viên';
    const roleBadge = document.getElementById('userRoleBadge');
    const role = session.user?.role || 'Admin';
    roleBadge.textContent = role;
    roleBadge.className = `px-2.5 py-0.5 text-xs font-bold rounded-md uppercase ${
      role === 'admin' ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300' :
      role === 'editor' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' :
      'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
    }`;
  }

  // Tùy chỉnh quyền hạn giao diện theo RBAC
  const newPlaceBtn = document.getElementById('newPlaceBtn');
  if (newPlaceBtn) {
    newPlaceBtn.style.display = canManagePlaces() ? 'inline-flex' : 'none';
  }
}

export async function handleLoginSubmit(event) {
  if (event) event.preventDefault();
  const emailInput = document.getElementById('loginEmail');
  const passInput = document.getElementById('loginPassword');
  const submitBtn = document.getElementById('loginSubmitBtn');

  const email = emailInput?.value.trim();
  const password = passInput?.value;

  if (!email || !password) {
    setLoginMessage('Vui lòng nhập đầy đủ email và mật khẩu.', 'error');
    return;
  }

  try {
    setLoginMessage('Đang xác thực thông tin đăng nhập...', 'info');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Đang đăng nhập...';
    }

    const session = await login(email, password);
    setLoginMessage('Đăng nhập thành công!', 'success');
    showAuthenticatedView(session);
    await loadDashboardStats();
    loadCurrentTab();
  } catch (err) {
    setLoginMessage(err.message || 'Đăng nhập thất bại.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Đăng nhập';
    }
  }
}

export async function handleLogoutClick() {
  showConfirmDialog({
    title: 'Đăng xuất',
    message: 'Bạn có chắc chắn muốn đăng xuất khỏi trang quản trị?',
    confirmText: 'Đăng xuất',
    confirmClass: 'bg-slate-800 hover:bg-slate-900 text-white',
    onConfirm: async () => {
      await logout();
      showLoginView('Đã đăng xuất khỏi hệ thống thành công.');
    }
  });
}

// ----------------------------------------------------------------------------
// THIẾT LẬP EVENT DELEGATION & STATIC EVENT LISTENERS (ZERO INLINE ONCLICK)
// ----------------------------------------------------------------------------

function setupEventDelegation() {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;

    // 1. Quản lý Địa điểm
    if (action === 'preview-place') {
      const placeId = Number(btn.dataset.placeId);
      const place = adminPlaces.find(p => Number(p.id) === placeId);
      if (place) openPlacePreview(place);
    } else if (action === 'edit-place') {
      const placeId = Number(btn.dataset.placeId);
      openPlaceEditor(placeId);
    } else if (action === 'approve-place') {
      const placeId = Number(btn.dataset.placeId);
      await requestApprovePlace(placeId);
    } else if (action === 'archive-place') {
      const placeId = Number(btn.dataset.placeId);
      confirmArchivePlace(placeId);
    } else if (action === 'delete-place') {
      const placeId = Number(btn.dataset.placeId);
      confirmPermanentDeletePlace(placeId);
    } else if (action === 'paginate-places') {
      const page = Number(btn.dataset.page);
      if (page > 0) loadAdminPlaces(page);
    }

    // 2. Quản lý Bình luận
    else if (action === 'toggle-comment-hidden') {
      const commentId = Number(btn.dataset.commentId);
      const shouldHide = btn.dataset.shouldHide === 'true';
      requestToggleCommentHidden(commentId, shouldHide);
    } else if (action === 'delete-comment') {
      const commentId = Number(btn.dataset.commentId);
      confirmDeleteComment(commentId);
    } else if (action === 'paginate-comments') {
      const page = Number(btn.dataset.page);
      if (page > 0) loadAdminComments(page);
    }

    // 3. Quản lý Phản ánh / Báo sai
    else if (action === 'save-report-notes') {
      const reportId = btn.dataset.reportId;
      saveReportNotes(reportId);
    } else if (action === 'view-report-place') {
      const reportId = btn.dataset.reportId;
      const report = adminReports.find(r => String(r.id) === String(reportId));
      if (report && report.place_id) {
        findAndOpenPlaceBySlug(report.place_id);
      }
    } else if (action === 'update-report-status') {
      const reportId = btn.dataset.reportId;
      const targetStatus = btn.dataset.targetStatus;
      requestUpdateReportStatus(reportId, targetStatus);
    } else if (action === 'paginate-reports') {
      const page = Number(btn.dataset.page);
      if (page > 0) loadAdminReports(page);
    }
  });
}

function setupStaticEventListeners() {
  // Theme & Logout
  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) themeBtn.addEventListener('click', () => toggleDarkMode());

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => handleLogoutClick());

  // Login form
  const loginForm = document.getElementById('loginForm');
  if (loginForm) loginForm.addEventListener('submit', handleLoginSubmit);

  // Stat cards navigation
  const bindStatCard = (id, tab, filterInputId, filterValue) => {
    const el = document.getElementById(id);
    if (!el) return;
    const activate = () => {
      showTab(tab);
      const input = document.getElementById(filterInputId);
      if (input) input.value = filterValue;
      if (tab === 'places') loadAdminPlaces(1);
      else if (tab === 'comments') loadAdminComments(1);
      else if (tab === 'reports') loadAdminReports(1);
    };
    el.addEventListener('click', activate);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });
  };

  bindStatCard('statCardDraft', 'places', 'placeStatusFilter', 'draft');
  bindStatCard('statCardComments', 'comments', 'hiddenFilter', 'true');
  bindStatCard('statCardReports', 'reports', 'reportStatusFilter', 'pending');
  bindStatCard('statCardApproved', 'places', 'placeStatusFilter', 'approved');

  // Tab buttons
  const placesTabBtn = document.getElementById('placesTabButton');
  if (placesTabBtn) placesTabBtn.addEventListener('click', () => showTab('places'));

  const commentsTabBtn = document.getElementById('commentsTabButton');
  if (commentsTabBtn) commentsTabBtn.addEventListener('click', () => showTab('comments'));

  const reportsTabBtn = document.getElementById('reportsTabButton');
  if (reportsTabBtn) reportsTabBtn.addEventListener('click', () => showTab('reports'));

  // Place controls
  const refreshPlacesBtn = document.getElementById('refreshPlacesBtn');
  if (refreshPlacesBtn) refreshPlacesBtn.addEventListener('click', () => loadAdminPlaces(1));

  const newPlaceBtn = document.getElementById('newPlaceBtn');
  if (newPlaceBtn) newPlaceBtn.addEventListener('click', () => openNewPlaceForm());

  const closeEditorBtn = document.getElementById('closePlaceEditorBtn');
  if (closeEditorBtn) closeEditorBtn.addEventListener('click', () => closePlaceEditor());

  const cancelEditBtn = document.getElementById('cancelPlaceEditBtn');
  if (cancelEditBtn) cancelEditBtn.addEventListener('click', () => closePlaceEditor());

  const placeEditForm = document.getElementById('placeEditForm');
  if (placeEditForm) placeEditForm.addEventListener('submit', savePlace);

  const placeSearchInput = document.getElementById('placeSearch');
  if (placeSearchInput) {
    placeSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        loadAdminPlaces(1);
      }
    });
  }

  // Comment controls
  const hiddenFilter = document.getElementById('hiddenFilter');
  if (hiddenFilter) hiddenFilter.addEventListener('change', () => loadAdminComments(1));

  // Report controls
  const reportFilter = document.getElementById('reportStatusFilter');
  if (reportFilter) reportFilter.addEventListener('change', () => loadAdminReports(1));

  const refreshReportsBtn = document.getElementById('refreshReportsBtn');
  if (refreshReportsBtn) refreshReportsBtn.addEventListener('click', () => loadAdminReports(1));

  const reportSearchInput = document.getElementById('reportSearch');
  if (reportSearchInput) {
    reportSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        loadAdminReports(1);
      }
    });
  }
}

// ----------------------------------------------------------------------------
// EXPOSE RA WINDOW CHO EVENT HANDLERS & CDP BROWSER TESTS
// ----------------------------------------------------------------------------

if (typeof window !== 'undefined') {
  window.VivuAdmin = {
    showTab,
    toggleDarkMode,
    loadAdminPlaces,
    renderPlaces,
    openPlaceEditor,
    openNewPlaceForm,
    closePlaceEditor,
    savePlace,
    updatePlaceStatus,
    executeUpdatePlaceStatus,
    requestApprovePlace,
    validatePlaceForApproval,
    openPlacePreview,
    previewPlace: (id) => {
      const place = adminPlaces.find(p => Number(p.id) === Number(id));
      if (place) openPlacePreview(place);
    },
    confirmArchivePlace,
    confirmPermanentDeletePlace,
    loadAdminComments,
    renderComments,
    toggleCommentHidden,
    requestToggleCommentHidden,
    confirmDeleteComment,
    loadAdminReports,
    renderReports,
    updateReportStatus,
    requestUpdateReportStatus,
    saveReportNotes,
    findAndOpenPlaceBySlug,
    showConfirmDialog,
    showAuthenticatedView,
    showLoginView,
    handleLoginSubmit,
    handleLogoutClick,
    setMessage,
    clearMessage
  };
}

// ----------------------------------------------------------------------------
// KHỞI ĐỘNG KHI TẢI TRANG
// ----------------------------------------------------------------------------

function initializeAdmin() {
  initTheme();
  setupEventDelegation();
  setupStaticEventListeners();

  // Lắng nghe các sự kiện xác thực
  window.addEventListener('vivu:auth-login', (e) => {
    const session = e.detail?.session || getSession();
    if (session) {
      showAuthenticatedView(session);
      loadDashboardStats();
      loadCurrentTab();
    }
  });

  window.addEventListener('vivu:auth-expired', (e) => {
    showLoginView(e.detail?.message || 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
  });

  window.addEventListener('vivu:auth-logout', () => {
    showLoginView('Đã đăng xuất khỏi hệ thống.');
  });

  const session = getSession();
  if (!session || !session.access_token) {
    showLoginView();
    return;
  }

  showAuthenticatedView(session);
  loadDashboardStats();
  loadCurrentTab();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initializeAdmin);
  } else {
    initializeAdmin();
  }
}
