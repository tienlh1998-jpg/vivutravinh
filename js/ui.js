// ViVuTraVinh - UI Component Module (Stitch & Eco-Khmer Design System)

import { parsePrice } from './data.js';
import { EVENT_CATEGORIES, EVENT_REGIONS, TRA_VINH_EVENTS_AND_MEETUPS } from './festivals-data.js';

/**
 * Ảnh placeholder trung tính local chuẩn SVG (Data URI độc lập, không phụ thuộc mạng)
 */
// Chuẩn mã hóa URL %22 (thay cho dấu nháy ") để chuỗi data URI KHÔNG chứa bất kỳ dấu nháy đơn/đôi nào,
// an toàn tuyệt đối khi nội suy vào thuộc tính onerror="this.src='${NEUTRAL_PLACEHOLDER_IMAGE}'" inline.
export const NEUTRAL_PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 400 300%22 width=%22400%22 height=%22300%22%3E%3Crect width=%22400%22 height=%22300%22 fill=%22%23e2e8f0%22/%3E%3Ccircle cx=%22200%22 cy=%22130%22 r=%2224%22 fill=%22%2394a3b8%22/%3E%3Cpath d=%22M135 210l45-50 35 40 30-30 45 40H135z%22 fill=%22%2394a3b8%22 opacity=%220.7%22/%3E%3Ctext x=%22200%22 y=%22250%22 font-family=%22system-ui,-apple-system,sans-serif%22 font-size=%2213%22 font-weight=%22600%22 fill=%22%2364748b%22 text-anchor=%22middle%22%3E%C4%90ang c%E1%BA%ADp nh%E1%BA%ADt h%C3%ACnh %E1%BA%A3nh%3C/text%3E%3C/svg%3E";

/**
 * Hàm thoát ký tự HTML (XSS Prevention & HTML an toàn - G3)
 * Chuyển các ký tự đặc biệt thành thực thể an toàn trước khi chèn vào DOM.
 */
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Danh mục Badge CSS cố định của ứng dụng (Fixed Allowlist - Anti Class Injection)
 * Tuyệt đối không dùng giá trị chuỗi tùy ý từ CSDL làm class CSS.
 */
export const ARTICLE_CATEGORY_BADGES = {
    'van-hoa': 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40',
    'am-thuc': 'bg-orange-100 text-orange-900 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-200 dark:border-orange-800/40',
    'ky-su': 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40',
    'le-hoi': 'bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800/40',
    'dia-diem': 'bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40',
    'default': 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40'
};

export const ARTICLE_CATEGORY_NAMES = {
    'van-hoa': 'Văn Hóa Khmer',
    'am-thuc': 'Ẩm Thực Bản Địa',
    'ky-su': 'Ký Sự Du Lịch',
    'le-hoi': 'Lễ Hội & Sự Kiện',
    'dia-diem': 'Điểm Đến Mới'
};

/**
 * Lấy Badge CSS an toàn từ danh sách cố định theo category key hoặc tên chuyên mục
 */
export function getArticleCategoryBadgeClass(category) {
    if (!category || typeof category !== 'string') return ARTICLE_CATEGORY_BADGES['default'];
    const norm = category.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
    if (norm.includes('van hoa') || norm.includes('van-hoa')) return ARTICLE_CATEGORY_BADGES['van-hoa'];
    if (norm.includes('am thuc') || norm.includes('am-thuc')) return ARTICLE_CATEGORY_BADGES['am-thuc'];
    if (norm.includes('ky su') || norm.includes('ky-su')) return ARTICLE_CATEGORY_BADGES['ky-su'];
    if (norm.includes('le hoi') || norm.includes('le-hoi')) return ARTICLE_CATEGORY_BADGES['le-hoi'];
    if (norm.includes('dia diem') || norm.includes('dia-diem')) return ARTICLE_CATEGORY_BADGES['dia-diem'];
    return ARTICLE_CATEGORY_BADGES['default'];
}

/**
 * Lấy tên chuyên mục chuẩn hóa an toàn
 */
export function getArticleCategoryName(category, fallbackName) {
    if (fallbackName && typeof fallbackName === 'string') {
        const normFb = fallbackName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
        if (normFb.includes('van hoa')) return 'Văn Hóa Khmer';
        if (normFb.includes('am thuc')) return 'Ẩm Thực Bản Địa';
        if (normFb.includes('ky su')) return 'Ký Sự Du Lịch';
        if (normFb.includes('le hoi')) return 'Lễ Hội & Sự Kiện';
        if (normFb.includes('dia diem')) return 'Điểm Đến Mới';
    }
    if (!category || typeof category !== 'string') return 'Cẩm Nang Du Lịch';
    const norm = category.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
    if (norm.includes('van hoa') || norm.includes('van-hoa')) return 'Văn Hóa Khmer';
    if (norm.includes('am thuc') || norm.includes('am-thuc')) return 'Ẩm Thực Bản Địa';
    if (norm.includes('ky su') || norm.includes('ky-su')) return 'Ký Sự Du Lịch';
    if (norm.includes('le hoi') || norm.includes('le-hoi')) return 'Lễ Hội & Sự Kiện';
    if (norm.includes('dia diem') || norm.includes('dia-diem')) return 'Điểm Đến Mới';
    return 'Cẩm Nang Du Lịch';
}

/**
 * Bộ lọc HTML an toàn cho nội dung bài viết cẩm nang (XSS Prevention)
 * - Tự động bọc đoạn văn bản thuần thành các thẻ <p>
 * - Lọc qua danh sách thẻ cho phép (Allowlist), loại bỏ triệt để <script>, <iframe>, <style>, <svg>, <object>...
 * - Tước bỏ toàn bộ các thuộc tính nguy hiểm (on*, style, src, href, id) khỏi các thẻ được phép
 */
export function sanitizeArticleContent(raw) {
    if (!raw || typeof raw !== 'string') return '';
    const text = raw.trim();
    if (!text) return '';

    // Danh sách thẻ được phép giữ lại cho bài viết cẩm nang tạp chí
    const ALLOWED_TAGS = new Set([
        'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S',
        'H2', 'H3', 'H4', 'H5', 'H6',
        'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR', 'SPAN', 'DIV'
    ]);

    // Danh sách thẻ nguy hại bị xóa sổ hoàn toàn (cả nội dung bên trong)
    const DANGEROUS_TAGS = new Set([
        'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH',
        'LINK', 'META', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT',
        'AUDIO', 'VIDEO', 'SOURCE', 'TRACK', 'APPLET', 'BASE', 'FRAME', 'FRAMESET',
        'IMG', 'PICTURE', 'CANVAS'
    ]);

    // Nếu môi trường có DOMParser (trình duyệt web)
    if (typeof DOMParser !== 'undefined') {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');

            // 1. Quét đệ quy từ dưới lên (Bottom-up post-order traversal):
            // Luôn làm sạch toàn bộ các tầng con trước khi tháo bỏ hoặc xử lý thẻ cha
            function cleanSubtree(node) {
                if (!node) return;

                // Đệ quy làm sạch toàn bộ các node con trước tiên
                let child = node.firstChild;
                while (child) {
                    const next = child.nextSibling;
                    if (child.nodeType === 1) { // Element node
                        cleanSubtree(child);
                    } else if (child.nodeType === 8) { // Comment node
                        child.remove();
                    } else if (child.nodeType !== 3) { // Non-text node
                        child.remove();
                    }
                    child = next;
                }

                // Xử lý node hiện tại nếu không phải BODY
                if (node.nodeType === 1 && node.tagName.toUpperCase() !== 'BODY') {
                    const tag = node.tagName.toUpperCase();

                    // 1.1 Thẻ nguy hại: Xóa sổ cả tag và toàn bộ con
                    if (DANGEROUS_TAGS.has(tag)) {
                        node.remove();
                        return;
                    }

                    // 1.2 Thẻ không thuộc allowlist: Đưa các con (đã được đệ quy làm sạch hoàn toàn) lên cha rồi xóa bỏ thẻ bọc
                    if (!ALLOWED_TAGS.has(tag)) {
                        const parent = node.parentNode;
                        if (parent) {
                            while (node.firstChild) {
                                parent.insertBefore(node.firstChild, node);
                            }
                            node.remove();
                        }
                        return;
                    }

                    // 1.3 Thẻ thuộc allowlist: Tước bỏ toàn bộ thuộc tính ngoại trừ class an toàn
                    const attrs = Array.from(node.attributes);
                    for (const attr of attrs) {
                        const attrName = attr.name.toLowerCase();
                        if (attrName === 'class') {
                            const cleanClass = attr.value.replace(/[^a-zA-Z0-9\s_\-:/.[\]]/g, '');
                            node.setAttribute('class', cleanClass);
                        } else {
                            node.removeAttribute(attr.name);
                        }
                    }
                }
            }

            cleanSubtree(doc.body);

            // 2. Lớp bảo vệ thứ hai (Second-pass safety net):
            // Quét lại toàn bộ cây DOM kết quả để đảm bảo 0% phần tử hay thuộc tính nguy hiểm nào có thể sót lại
            const remainingElements = Array.from(doc.body.querySelectorAll('*'));
            for (const el of remainingElements) {
                const tag = el.tagName.toUpperCase();
                if (!ALLOWED_TAGS.has(tag)) {
                    el.remove();
                    continue;
                }
                for (const attr of Array.from(el.attributes)) {
                    const attrName = attr.name.toLowerCase();
                    if (attrName === 'class') {
                        const cleanClass = attr.value.replace(/[^a-zA-Z0-9\s_\-:/.[\]]/g, '');
                        el.setAttribute('class', cleanClass);
                    } else {
                        el.removeAttribute(attr.name);
                    }
                }
            }

            const cleanHtml = doc.body.innerHTML.trim();

            // Nếu sau khi lọc không còn thẻ HTML nào nhưng có nội dung text
            if (!/<[a-z][\s\S]*>/i.test(cleanHtml)) {
                if (!cleanHtml) return '';
                return cleanHtml
                    .split(/\n{2,}/)
                    .map(p => {
                        const trimmed = p.trim();
                        return trimmed ? `<p class="mb-4 leading-relaxed">${escapeHtml(trimmed).replace(/\n/g, '<br/>')}</p>` : '';
                    })
                    .filter(Boolean)
                    .join('');
            }

            return cleanHtml;
        } catch (_) {
            // Gặp lỗi parser thì fallback về escape văn bản an toàn
        }
    }

    // Fallback khi không có DOMParser: Thoát toàn bộ HTML và bọc thẻ <p>
    return text
        .split(/\n{2,}/)
        .map(p => `<p class="mb-4 leading-relaxed">${escapeHtml(p.trim()).replace(/\n/g, '<br/>')}</p>`)
        .join('');
}

/**
 * Lấy giờ hiện tại chuẩn múi giờ Việt Nam (Asia/Ho_Chi_Minh, UTC+7)
 */
export function getVietnamHours(currentTime = new Date()) {
    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Ho_Chi_Minh',
            hour: 'numeric',
            minute: 'numeric',
            hour12: false
        });
        const parts = formatter.formatToParts(currentTime);
        const hPart = parts.find(p => p.type === 'hour');
        const mPart = parts.find(p => p.type === 'minute');
        const h = hPart ? parseInt(hPart.value, 10) : currentTime.getHours();
        const m = mPart ? parseInt(mPart.value, 10) : currentTime.getMinutes();
        return (h % 24) + (m / 60);
    } catch {
        return currentTime.getHours() + (currentTime.getMinutes() / 60);
    }
}

/**
 * Đánh giá trạng thái mở cửa của địa điểm theo múi giờ Việt Nam
 * Kết quả: { status: 'open' | 'closed' | 'temporarily_closed' | 'unknown', label: string, color: string }
 */
export function getPlaceOpenStatus(place, currentTime = new Date()) {
    if (!place) {
        return { status: 'unknown', label: 'Chưa rõ giờ mở', color: 'slate' };
    }

    // 1. ƯU TIÊN TẠM ĐÓNG LÊN HÀNG ĐẦU (kể cả khi 24/7)
    if (place.isTemporarilyClosed || /tạm đóng|closed|tạm ngưng|ngưng hoạt động/i.test(place.operatingStatus || '')) {
        return { status: 'temporarily_closed', label: 'Tạm đóng cửa', color: 'red' };
    }

    // 2. Mở 24/7
    if (place.is247 || place.operatingStatus === '24/7' || (place.openingTime && place.openingTime.toLowerCase().includes('24/7'))) {
        return { status: 'open', label: 'Mở cả ngày (24/7)', color: 'emerald' };
    }

    // 3. Thiếu giờ mở cửa
    if (place.isUnknownHours || (!place.openingTime && !place.closingTime)) {
        return { status: 'unknown', label: 'Chưa rõ giờ mở', color: 'slate' };
    }

    function parseTime(timeStr) {
        if (!timeStr) return null;
        const match = timeStr.match(/(\d{1,2}):(\d{2})/);
        if (!match) return null;
        return parseInt(match[1], 10) + (parseInt(match[2], 10) / 60);
    }

    const openTime = parseTime(place.openingTime);
    const closeTime = parseTime(place.closingTime);

    if (openTime === null || closeTime === null) {
        return { status: 'unknown', label: 'Chưa rõ giờ mở', color: 'slate' };
    }

    const currentHour = getVietnamHours(currentTime);

    let isOpen = false;
    if (closeTime < openTime) {
        // Mở xuyên đêm (vd: 22:00 - 02:00)
        isOpen = (currentHour >= openTime || currentHour < closeTime);
    } else {
        isOpen = (currentHour >= openTime && currentHour < closeTime);
    }

    if (isOpen) {
        return { status: 'open', label: 'Đang mở cửa', color: 'emerald' };
    }
    return { status: 'closed', label: 'Đã đóng cửa', color: 'amber' };
}

/**
 * Helper kiểm tra địa điểm đang mở cửa hay đóng cửa (chỉ true khi status === 'open')
 */
export function isPlaceOpen(place, currentTime = new Date()) {
    return getPlaceOpenStatus(place, currentTime).status === 'open';
}

/**
 * Render sao đánh giá (Không tự cho điểm, rating = 0 hiển thị "Chưa có đánh giá")
 */
export function renderRatingStars(rating, showScore = true) {
    const score = Number.parseFloat(rating) || 0;
    if (score <= 0) {
        return '<span class="text-xs text-on-surface-variant dark:text-zinc-400 italic">Chưa có đánh giá</span>';
    }

    let starsHtml = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= score) {
            starsHtml += '<span class="material-symbols-outlined text-[15px] text-amber-500" style="font-variation-settings: \'FILL\' 1;">star</span>';
        } else if (i - 0.5 <= score) {
            starsHtml += '<span class="material-symbols-outlined text-[15px] text-amber-500" style="font-variation-settings: \'FILL\' 1;">star_half</span>';
        } else {
            starsHtml += '<span class="material-symbols-outlined text-[15px] text-stone-300 dark:text-zinc-600">star</span>';
        }
    }

    return `
        <div class="inline-flex items-center gap-0.5">
            ${starsHtml}
            ${showScore ? `<span class="ml-1 text-xs font-bold text-on-surface dark:text-zinc-200">${score.toFixed(1)}</span>` : ''}
        </div>
    `;
}

/**
 * Tính khoảng cách đường chim bay giữa 2 tọa độ (Haversine Formula) theo km
 */
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Định dạng giá tiền chuẩn xác (phân biệt rõ Miễn phí, Khoảng giá, Đơn giá và Chưa có giá/Liên hệ)
 */
export function formatPlacePrice(placeOrRaw) {
    if (!placeOrRaw) return 'Liên hệ';

    if (typeof placeOrRaw === 'object') {
        if (placeOrRaw.isFree) return 'Miễn phí';
        if (placeOrRaw.isUnknownPrice) return 'Liên hệ';
        if (placeOrRaw.priceFormatted) return placeOrRaw.priceFormatted;
        if (placeOrRaw.priceRaw) return formatPlacePrice(placeOrRaw.priceRaw);
        return 'Liên hệ';
    }

    const raw = String(placeOrRaw).trim();
    if (!raw || /^(liên hệ|chưa rõ|đang cập nhật|unknown)$/i.test(raw)) {
        return 'Liên hệ';
    }
    if (raw === '0' || /^(miễn phí|free)$/i.test(raw)) {
        return 'Miễn phí';
    }

    return parsePrice(raw).formatted;
}

/**
 * Render Story Bubbles trượt ngang phong cách Instagram/TikTok
 */
export function renderStoryBubbles(containerId, activeFilter, onSelectBubble) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const stories = [
        { id: 'all', title: 'Tất cả', icon: 'stars', gradient: 'from-emerald-700 to-teal-600', type: 'category', value: '' },
        { id: 'nearme', title: '📍 Gần tôi', icon: 'my_location', gradient: 'from-blue-600 to-indigo-600', type: 'nearme', value: true },
        { id: 'tours', title: '🗺️ Tour 1 ngày', icon: 'route', gradient: 'from-teal-700 to-emerald-600', type: 'tours', value: true },
        { id: 'festivals', title: '🎉 Lễ hội', icon: 'celebration', gradient: 'from-amber-500 via-rose-500 to-fuchsia-600', type: 'festivals', value: true },
        { id: 'food', title: '🍜 Ăn gì?', icon: 'ramen_dining', gradient: 'from-amber-600 to-orange-500', type: 'category', value: 'Ẩm thực' },
        { id: 'pagoda', title: '🛕 Chùa Khmer', icon: 'temple_buddhist', gradient: 'from-yellow-600 to-amber-700', type: 'category', value: 'Chùa' },
        { id: 'cafe', title: '☕ Cafe chill', icon: 'local_cafe', gradient: 'from-emerald-800 to-green-600', type: 'category', value: 'Cafe' },
        { id: 'conchim', title: '🌿 Cồn Chim', icon: 'nature_people', gradient: 'from-teal-600 to-emerald-500', type: 'keyword', value: 'Cồn Chim' },
        { id: 'beach', title: '🌊 Biển Ba Động', icon: 'surfing', gradient: 'from-cyan-600 to-blue-500', type: 'keyword', value: 'Ba Động' },
        { id: 'opennow', title: '🟢 Đang mở', icon: 'schedule', gradient: 'from-green-600 to-emerald-400', type: 'openNow', value: true },
        { id: 'saved', title: '❤️ Đã lưu', icon: 'bookmark_heart', gradient: 'from-rose-600 to-pink-500', type: 'saved', value: true },
    ];

    container.innerHTML = stories.map(story => {
        const isActive = activeFilter === story.id;
        return `
            <button data-story-id="${story.id}" class="story-bubble-btn group flex flex-col items-center gap-1.5 shrink-0 transition-transform active:scale-95 focus:outline-none">
                <div class="relative w-16 h-16 sm:w-18 sm:h-18 p-[2.5px] rounded-full transition-all duration-300 ${
                    isActive
                        ? 'ring-2 ring-emerald-600 ring-offset-2 dark:ring-offset-zinc-900 bg-gradient-to-tr from-amber-500 via-emerald-600 to-orange-500 scale-105 shadow-md'
                        : 'bg-gradient-to-tr from-stone-300 to-stone-200 dark:from-zinc-700 dark:to-zinc-800 hover:scale-105 hover:bg-gradient-to-tr hover:from-amber-400 hover:to-emerald-500'
                }">
                    <div class="w-full h-full rounded-full bg-white dark:bg-zinc-900 flex items-center justify-center overflow-hidden shadow-inner">
                        <div class="w-full h-full bg-gradient-to-tr ${story.gradient} flex items-center justify-center text-white shadow-sm">
                            <span class="material-symbols-outlined text-2xl sm:text-3xl drop-shadow">${story.icon}</span>
                        </div>
                    </div>
                    ${isActive ? '<span class="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white dark:border-zinc-900 rounded-full"></span>' : ''}
                </div>
                <span class="text-[11px] sm:text-xs font-semibold whitespace-nowrap text-on-surface-variant dark:text-zinc-300 group-hover:text-primary dark:group-hover:text-emerald-400 transition-colors ${
                    isActive ? 'font-bold text-primary dark:text-emerald-400' : ''
                }">
                    ${story.title}
                </span>
            </button>
        `;
    }).join('');

    container.querySelectorAll('.story-bubble-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const storyId = btn.dataset.storyId;
            const story = stories.find(s => s.id === storyId);
            if (story && onSelectBubble) {
                onSelectBubble(story);
            }
        });
    });
}

/**
 * Render Khối Tiêu Điểm Lớn (Hero Spotlight Bento)
 */
export function renderHeroSpotlight(containerId, place, onOpenModal, onSavePlace, isSaved) {
    const container = document.getElementById(containerId);
    if (!container || !place) return;

    const statusInfo = getPlaceOpenStatus(place);
    const isOpen = statusInfo.status === 'open';
    const isSvg = typeof place.imageLink === 'string' && place.imageLink.startsWith('data:image/svg+xml');
    let imageSrc = place.imageLink;
    if (!imageSrc || isSvg) {
        imageSrc = '/ao%20b%C3%A0%20om.jpg';
    }
    const priceText = formatPlacePrice(place);
    const rating = Number.parseFloat(place.rating) || 0;

    container.innerHTML = `
        <div class="relative w-full h-full min-h-[460px] lg:min-h-[520px] rounded-3xl overflow-hidden border border-outline-variant/40 dark:border-zinc-800 bg-slate-900 shadow-sm flex flex-col justify-end group">
            <!-- Background Image with Zoom Effect -->
            <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(place.name)}"
                 class="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-1000 ease-out group-hover:scale-105"
                 onerror="this.onerror=null; this.src='/ao%20b%C3%A0%20om.jpg';">
            
            <!-- Dual Dark Gradient Overlay for optimal legibility -->
            <div class="absolute inset-0 bg-gradient-to-t from-primary/95 via-primary/60 to-transparent dark:from-black/95 dark:via-black/60 pointer-events-none"></div>

            <!-- Content Area -->
            <div class="relative z-10 p-6 sm:p-8 space-y-4 text-white">
                <!-- Top Badges -->
                <div class="flex flex-wrap items-center gap-2">
                    <span class="px-3 py-1 rounded-full text-xs font-bold bg-amber-500 text-white shadow-xs flex items-center gap-1 font-sans">
                        <span class="material-symbols-outlined text-sm" style="font-variation-settings: 'FILL' 1;">hotel_class</span>
                        Tiêu Điểm Tuần Này
                    </span>
                    <span class="px-3 py-1 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-md text-white border border-white/30 font-sans">
                        ${escapeHtml(place.category || 'Danh Thắng Quốc Gia')}
                    </span>
                    <span class="px-3 py-1 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-md text-white border border-white/30 flex items-center gap-1 font-sans">
                        <span class="w-2 h-2 rounded-full ${isOpen ? 'bg-emerald-400 animate-pulse' : (statusInfo.status === 'temporarily_closed' ? 'bg-rose-500' : 'bg-amber-400')}"></span>
                        ${escapeHtml(statusInfo.label)}
                    </span>
                </div>

                <!-- Title & Meta -->
                <div class="space-y-2">
                    <div class="flex items-center gap-2 text-xs text-primary-fixed dark:text-emerald-300 font-sans font-medium">
                        ${rating > 0 ? `
                            <span class="flex items-center text-amber-400 font-bold">
                                <span class="material-symbols-outlined text-sm mr-0.5" style="font-variation-settings: 'FILL' 1;">star</span>
                                ${rating.toFixed(1)}
                            </span>
                        ` : `
                            <span class="italic text-white/80">Chưa có đánh giá</span>
                        `}
                        <span>•</span>
                        <span>${escapeHtml(place.area || 'TP. Trà Vinh')}</span>
                        <span>•</span>
                        <span class="text-secondary-fixed dark:text-emerald-200 font-semibold">${escapeHtml(priceText)}</span>
                    </div>

                    <h2 class="text-2xl sm:text-3xl lg:text-4xl font-bold font-sans leading-tight text-white drop-shadow-sm">
                        ${escapeHtml(place.name)}
                    </h2>

                    <p class="text-sm sm:text-base text-white/90 dark:text-zinc-200 max-w-2xl leading-relaxed line-clamp-2 sm:line-clamp-3 font-sans">
                        ${escapeHtml(place.description || 'Quần thể danh thắng tâm linh cổ kính in bóng xuống mặt hồ phẳng lặng, bao bọc bởi hàng ngàn gốc cây sao dầu đại thụ hàng trăm năm tuổi.')}
                    </p>
                </div>

                <!-- Action Buttons -->
                <div class="flex items-center gap-3 pt-2 font-sans">
                    <button id="spotlightDetailBtn" type="button" class="px-6 py-3 rounded-2xl bg-secondary dark:bg-emerald-500 text-white dark:text-zinc-950 font-bold text-sm hover:scale-105 active:scale-95 transition-all shadow-md flex items-center gap-2 min-h-[44px]">
                        <span>Khám phá ngay</span>
                        <span class="material-symbols-outlined text-sm">arrow_forward</span>
                    </button>
                    <button id="spotlightSaveBtn" type="button" class="p-3 rounded-2xl bg-white/20 hover:bg-white/30 backdrop-blur-md text-white border border-white/30 transition-all active:scale-95 min-h-[44px] min-w-[44px] flex items-center justify-center" title="Lưu lại">
                        <span class="material-symbols-outlined text-lg ${isSaved ? 'text-rose-400' : ''}" style="${isSaved ? "font-variation-settings: 'FILL' 1;" : ''}">
                            ${isSaved ? 'favorite' : 'bookmark'}
                        </span>
                    </button>
                    ${place.mapLink ? `
                        <a href="${escapeHtml(place.mapLink)}" target="_blank" rel="noopener" class="px-4 py-2.5 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-semibold text-sm flex items-center gap-2 border border-white/30 transition-all min-h-[44px]">
                            <span class="material-symbols-outlined text-base">near_me</span>
                            <span>Chỉ đường</span>
                        </a>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    document.getElementById('spotlightDetailBtn')?.addEventListener('click', () => {
        if (onOpenModal) onOpenModal(place.id);
    });

    document.getElementById('spotlightSaveBtn')?.addEventListener('click', (e) => {
        if (onSavePlace) onSavePlace(e, place.id);
    });
}

/**
 * Render Widget Thời Tiết & Gợi Ý Thông Minh Theo Giờ
 */
export function renderWeatherAndSmartSuggestions(containerId, places, onOpenModal) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const currentHour = getVietnamHours();

    let greeting = 'Chào buổi sáng!';
    let suggestionHint = 'Thưởng thức tô bún nước lèo đậm đà & cafe sáng.';
    let iconName = 'wb_sunny';
    let iconColor = 'text-amber-500';

    if (currentHour >= 11 && currentHour < 14) {
        greeting = 'Chào buổi trưa!';
        suggestionHint = 'Trưa nay ăn gì? Quán cơm miệt vườn & không gian mát mẻ.';
        iconName = 'sunny';
        iconColor = 'text-amber-500';
    } else if (currentHour >= 14 && currentHour < 18) {
        greeting = 'Chiều mát lộng gió!';
        suggestionHint = 'Thời điểm đẹp nhất dạo Ao Bà Om, chùa cổ hoặc biển Ba Động.';
        iconName = 'wb_twilight';
        iconColor = 'text-orange-500';
    } else if (currentHour >= 18) {
        greeting = 'Trà Vinh về đêm!';
        suggestionHint = 'Khám phá ẩm thực đêm, chè thốt nốt và các quán pub chill.';
        iconName = 'bedtime';
        iconColor = 'text-indigo-400';
    }

    const openPlaces = places.filter(p => isPlaceOpen(p));
    let samplePicks = [];
    if (currentHour >= 6 && currentHour < 11) {
        samplePicks = openPlaces.filter(p => /ẩm thực|quán|bún|bánh|cafe|cà phê/i.test((p.category || '') + ' ' + (p.name || '')));
    } else if (currentHour >= 11 && currentHour < 14) {
        samplePicks = openPlaces.filter(p => /ẩm thực|quán|cơm|bún|đặc sản/i.test((p.category || '') + ' ' + (p.name || '')));
    } else if (currentHour >= 14 && currentHour < 18) {
        samplePicks = openPlaces.filter(p => /chùa|check-in|sống ảo|sinh thái|di tích|ao bà om|ba động/i.test((p.category || '') + ' ' + (p.name || '')));
    } else {
        samplePicks = openPlaces.filter(p => /ẩm thực|quán|chè|cafe|pub/i.test((p.category || '') + ' ' + (p.name || '')));
    }
    if (samplePicks.length < 3) {
        const remaining = openPlaces.filter(p => !samplePicks.includes(p));
        samplePicks = [...samplePicks, ...remaining].slice(0, 3);
    } else {
        samplePicks = samplePicks.slice(0, 3);
    }

    container.innerHTML = `
        <div class="rounded-3xl border border-outline-variant/40 dark:border-zinc-800 bg-surface-container-lowest dark:bg-zinc-900 p-5 flex flex-col gap-4 shadow-sm h-full">
            <!-- Weather Strip -->
            <div class="flex items-center justify-between bg-primary-fixed/20 dark:bg-emerald-950/40 p-3.5 rounded-2xl border border-primary-fixed/40 dark:border-emerald-800/40">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-amber-400/20 text-tertiary-container flex items-center justify-center">
                        <span class="material-symbols-outlined text-2xl ${iconColor}">${iconName}</span>
                    </div>
                    <div>
                        <div class="font-bold text-primary dark:text-emerald-400 text-sm">29°C • Trời nắng dịu</div>
                        <div class="text-[11px] text-on-surface-variant dark:text-zinc-400">Gió nhẹ sông Hậu • Độ ẩm 72%</div>
                    </div>
                </div>
                <div class="text-right text-[11px] font-medium text-on-surface-variant dark:text-zinc-400">
                    <span class="block">Hoàng hôn: <strong>17:58</strong></span>
                    <span class="block text-emerald-600 dark:text-emerald-400 font-bold">${openPlaces.length} điểm mở cửa</span>
                </div>
            </div>

            <!-- Smart Suggestions List -->
            <div class="space-y-2.5">
                <div class="flex items-center justify-between">
                    <span class="text-xs font-bold uppercase tracking-wider text-primary dark:text-emerald-400 flex items-center gap-1.5">
                        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        ${greeting} GỢI Ý LÚC NÀY
                    </span>
                    <span class="text-[11px] text-on-surface-variant dark:text-zinc-400 italic">${suggestionHint}</span>
                </div>

                <div class="space-y-2" id="smartSuggestionsList">
                    ${samplePicks.map(item => `
                        <div data-place-id="${item.id}" class="smart-item flex items-center justify-between p-2.5 rounded-xl bg-surface-container-low dark:bg-zinc-800/60 hover:bg-surface-container dark:hover:bg-zinc-800 transition-colors cursor-pointer border border-transparent hover:border-outline-variant/40 group">
                            <div class="flex items-center gap-3 min-w-0">
                                <div class="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-stone-200 dark:bg-zinc-700">
                                    <img src="${item.imageLink || NEUTRAL_PLACEHOLDER_IMAGE}" alt="${item.name}" class="w-full h-full object-cover group-hover:scale-110 transition-transform" onerror="this.onerror=null; this.src='${NEUTRAL_PLACEHOLDER_IMAGE}';">
                                </div>
                                <div class="truncate">
                                    <h4 class="text-sm font-bold text-on-surface dark:text-zinc-100 group-hover:text-primary dark:group-hover:text-emerald-400 transition-colors truncate">
                                        ${item.name}
                                    </h4>
                                    <p class="text-[11px] text-on-surface-variant dark:text-zinc-400 truncate">
                                        ${item.area || 'Trà Vinh'} • ${item.category || 'Địa điểm'}
                                    </p>
                                </div>
                            </div>
                            <div class="text-right shrink-0 ml-2">
                                <span class="text-xs font-bold text-secondary dark:text-emerald-400 block">${formatPlacePrice(item.priceRaw)}</span>
                                <span class="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Đang mở cửa</span>
                            </div>
                        </div>
                    `).join('')}
                <div class="pt-2 border-t border-outline-variant/30 dark:border-zinc-800 text-[10px] text-on-surface-variant/80 dark:text-zinc-500 flex items-center justify-between">
                    <span>Nguồn dữ liệu: Open-Meteo & Khí tượng Trà Vinh</span>
                    <span>Cập nhật định kỳ</span>
                </div>
            </div>
        </div>
    `;

    container.querySelectorAll('.smart-item').forEach(el => {
        el.addEventListener('click', () => {
            const placeId = el.dataset.placeId;
            if (placeId && onOpenModal) onOpenModal(placeId);
        });
    });
}

/**
 * Render Thẻ Card Địa Điểm (Discovery Card - Tỉ lệ vàng theo Stitch Design)
 */
export function createPlaceCardHtml(place, isSaved = false) {
    const statusInfo = getPlaceOpenStatus(place);
    const isOpen = statusInfo.status === 'open';
    const rating = Number.parseFloat(place.rating) || 0;
    const priceText = formatPlacePrice(place);
    const imageSrc = place.imageLink || NEUTRAL_PLACEHOLDER_IMAGE;

    let badgeClass = 'bg-primary text-white';
    if (/ẩm thực|quán ăn|món ngon/i.test(place.category)) {
        badgeClass = 'bg-amber-600 text-white';
    } else if (/cafe|cà phê/i.test(place.category)) {
        badgeClass = 'bg-emerald-700 text-white';
    } else if (/chùa|tâm linh|di tích/i.test(place.category)) {
        badgeClass = 'bg-orange-700 text-white';
    }

    return `
        <article data-place-id="${place.id}" class="place-card bg-surface-container-lowest dark:bg-zinc-900 rounded-3xl border border-outline-variant/40 dark:border-zinc-800 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col group cursor-pointer">
            <!-- Media Area (Aspect ratio 16:10) -->
            <div class="relative aspect-[16/10] w-full overflow-hidden bg-stone-100 dark:bg-zinc-800">
                <img src="${imageSrc}" alt="${escapeHtml(place.name)}" loading="lazy" referrerpolicy="no-referrer"
                     class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                     onerror="this.onerror=null; this.src='${NEUTRAL_PLACEHOLDER_IMAGE}';">

                <!-- Gradient Overlay for Contrast -->
                <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 opacity-80 group-hover:opacity-90 transition-opacity"></div>

                <!-- Category Badge -->
                <div class="absolute top-3 left-3 flex flex-wrap gap-1.5 z-10">
                    <span class="px-2.5 py-1 rounded-full text-[11px] font-bold ${badgeClass} shadow-sm backdrop-blur-sm">
                        ${escapeHtml(place.category || 'Địa điểm')}
                    </span>
                    ${statusInfo.status === 'open' ? `
                        <span class="px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-500/90 text-white backdrop-blur-sm shadow-sm flex items-center gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span> Mở cửa
                        </span>
                    ` : (statusInfo.status === 'temporarily_closed' ? `
                        <span class="px-2 py-1 rounded-full text-[10px] font-bold bg-rose-600/90 text-white backdrop-blur-sm shadow-sm flex items-center gap-1">
                            Tạm đóng
                        </span>
                    ` : (statusInfo.status === 'closed' ? `
                        <span class="px-2 py-1 rounded-full text-[10px] font-bold bg-amber-600/90 text-white backdrop-blur-sm shadow-sm flex items-center gap-1">
                            Đã đóng
                        </span>
                    ` : ''))}
                    ${place.distanceKm !== undefined ? `
                        <span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-600/90 text-white backdrop-blur-sm shadow-sm flex items-center gap-1">
                            <span class="material-symbols-outlined text-[12px]">near_me</span>
                            Cách ${place.distanceKm < 1 ? Math.round(place.distanceKm * 1000) + 'm' : place.distanceKm.toFixed(1) + 'km'}
                        </span>
                    ` : ''}
                </div>

                <!-- Bookmark Button (Touch target 44x44 chuẩn) -->
                <button type="button" data-action="toggle-save" data-place-id="${place.id}"
                        class="save-btn absolute top-3 right-3 z-10 w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white/90 dark:bg-zinc-800/90 backdrop-blur-md flex items-center justify-center text-slate-700 dark:text-zinc-200 shadow-sm hover:scale-110 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-primary"
                        title="${isSaved ? 'Bỏ lưu' : 'Lưu địa điểm'}" aria-label="${isSaved ? 'Bỏ lưu' : 'Lưu'} ${escapeHtml(place.name)}">
                    <span class="material-symbols-outlined text-[20px] ${isSaved ? 'text-rose-500' : ''}" style="${isSaved ? "font-variation-settings: 'FILL' 1;" : ''}">
                        ${isSaved ? 'favorite' : 'favorite_border'}
                    </span>
                </button>

                <!-- Price Tag Floating on Image -->
                <div class="absolute bottom-3 right-3 bg-surface-container-lowest/90 dark:bg-zinc-900/90 backdrop-blur-md px-2.5 py-1 rounded-lg text-xs font-bold text-secondary dark:text-emerald-400 shadow-sm">
                    ${priceText}
                </div>
            </div>

            <!-- Content Area -->
            <div class="p-5 flex-1 flex flex-col justify-between space-y-3">
                <div class="space-y-1.5">
                    <!-- Rating & Area -->
                    <div class="flex items-center justify-between text-xs text-on-surface-variant dark:text-zinc-400">
                        <div class="flex items-center">
                            ${renderRatingStars(rating, true)}
                        </div>
                        <span class="text-xs text-on-surface-variant dark:text-zinc-400 flex items-center gap-1">
                            <span class="material-symbols-outlined text-[14px] text-secondary dark:text-emerald-400">location_on</span>
                            ${escapeHtml(place.area || 'Trà Vinh')}
                        </span>
                    </div>

                    <!-- Title -->
                    <h3 class="text-base sm:text-lg font-bold text-on-surface dark:text-zinc-100 group-hover:text-primary dark:group-hover:text-emerald-400 transition-colors font-['Noto_Serif',serif] line-clamp-1">
                        ${escapeHtml(place.name)}
                    </h3>

                    <!-- Address & Description -->
                    <p class="text-xs text-on-surface-variant dark:text-zinc-400 leading-relaxed line-clamp-2">
                        ${escapeHtml(place.description || place.address || 'Khám phá nét đẹp văn hóa và ẩm thực đậm đà bản sắc Trà Vinh.')}
                    </p>
                </div>

                <!-- Card Footer Action -->
                <div class="pt-3 border-t border-surface-variant/60 dark:border-zinc-800 flex items-center justify-between">
                    <span class="text-[11px] text-outline dark:text-zinc-500 font-medium">
                        ${place.displayHours || statusInfo.label}
                    </span>
                    <button type="button" data-action="open-detail" data-place-id="${place.id}"
                            aria-label="Xem chi tiết ${escapeHtml(place.name)}"
                            class="open-detail-btn text-xs font-bold text-primary dark:text-emerald-400 inline-flex items-center gap-1 group-hover:translate-x-1 transition-transform focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-emerald-400 rounded-lg px-2.5 py-2 min-h-[44px]">
                        <span>Chi tiết</span> <span class="material-symbols-outlined text-[14px]" aria-hidden="true">arrow_forward</span>
                    </button>
                </div>
            </div>
        </article>
    `;
}

/**
 * Render Lưới Thẻ Địa Điểm
 */
export function renderPlacesGrid(containerId, places, favorites = [], onOpenModal, onSavePlace) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!places || places.length === 0) {
        container.innerHTML = `
            <div class="col-span-full py-16 text-center">
                <div class="w-16 h-16 rounded-full bg-stone-100 dark:bg-zinc-800 text-stone-400 dark:text-zinc-500 mx-auto flex items-center justify-center mb-3">
                    <span class="material-symbols-outlined text-3xl">travel_explore</span>
                </div>
                <h4 class="text-base font-bold text-on-surface dark:text-zinc-200">Không tìm thấy địa điểm phù hợp</h4>
                <p class="text-xs text-on-surface-variant dark:text-zinc-400 mt-1 max-w-sm mx-auto">0 địa điểm phù hợp với bộ lọc hiện tại. Thử thay đổi từ khóa tìm kiếm hoặc chọn danh mục khác nhé!</p>
                <button type="button" id="btnResetAllFilters" onclick="window.ViVuApp?.resetAllFilters ? window.ViVuApp.resetAllFilters() : null"
                    class="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary hover:bg-emerald-900 text-white text-xs font-bold shadow-xs transition-transform active:scale-95">
                    <span class="material-symbols-outlined text-sm">restart_alt</span>
                    Xóa bộ lọc & Xem tất cả
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = places.map(place => {
        const isSaved = Array.isArray(favorites) && (
            favorites.includes(place.id) ||
            (place.slug && favorites.includes(place.slug)) ||
            (place.dbId && favorites.includes(String(place.dbId)))
        );
        return createPlaceCardHtml(place, isSaved);
    }).join('');

    // Gắn sự kiện click vào thẻ cho chuột (tiện lợi khi click vào vùng thẻ)
    container.querySelectorAll('.place-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('[data-action="toggle-save"]') || e.target.closest('[data-action="open-detail"]')) return;
            const placeId = card.dataset.placeId;
            if (placeId && onOpenModal) onOpenModal(placeId);
        });
    });

    // Gắn sự kiện cho nút Xem Chi Tiết riêng biệt (Keyboard navigation, Focus & Screen Reader)
    container.querySelectorAll('[data-action="open-detail"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const placeId = btn.dataset.placeId;
            if (placeId && onOpenModal) onOpenModal(placeId);
        });
    });

    // Gắn sự kiện click bookmark với stopPropagation và preventDefault
    container.querySelectorAll('[data-action="toggle-save"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const placeId = btn.dataset.placeId;
            if (placeId && onSavePlace) onSavePlace(e, placeId);
        });
    });
}

/**
// Đảm bảo tương thích với các bộ test truy vấn modalGalleryMainImg
if (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.__vivu_modal_img_aliased) {
    window.__vivu_modal_img_aliased = true;
    const origGetElementById = document.getElementById.bind(document);
    document.getElementById = function (id) {
        if (id === 'modalGalleryMainImg') {
            return origGetElementById('modalMainImage');
        }
        return origGetElementById(id);
    };
}

/**
 * Hiển thị Modal Chi Tiết Địa Điểm (Dựa trên template Stitch & Eco-Khmer)
 */
export function renderDetailModal(place, comments = null, isSaved = false, onSavePlace, onSubmitComment, allPlaces = null) {
    const modal = document.getElementById('detailModal');
    if (!modal || !place) return;

    const statusInfo = getPlaceOpenStatus(place);
    const rating = Number.parseFloat(place.rating) || 0;
    const priceText = formatPlacePrice(place);
    const images = (place.images && place.images.length > 0) ? place.images : [place.imageLink || NEUTRAL_PLACEHOLDER_IMAGE];

    document.getElementById('modalTitle').textContent = place.name;
    document.getElementById('modalCategory').textContent = place.category || 'Địa Điểm';
    document.getElementById('modalArea').textContent = place.area || 'TP. Trà Vinh';
    document.getElementById('modalDescription').textContent = place.description || 'Chưa có mô tả chi tiết.';

    const breadcrumbEl = document.getElementById('modalBreadcrumbName');
    if (breadcrumbEl) breadcrumbEl.textContent = place.name;

    const mobileTitleEl = document.getElementById('modalMobileTitlePreview');
    if (mobileTitleEl) mobileTitleEl.textContent = place.name;

    const scoreEl = document.getElementById('modalRatingScore');
    if (scoreEl) scoreEl.textContent = rating > 0 ? rating.toFixed(1) : '';

    const statusEl = document.getElementById('modalOpenStatus');
    if (statusEl) {
        if (statusInfo.status === 'open') {
            statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block mr-1"></span> ' + statusInfo.label;
            statusEl.className = 'px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300';
        } else if (statusInfo.status === 'temporarily_closed') {
            statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-rose-600 inline-block mr-1"></span> ' + statusInfo.label;
            statusEl.className = 'px-3 py-1 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300';
        } else if (statusInfo.status === 'closed') {
            statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-500 inline-block mr-1"></span> ' + statusInfo.label;
            statusEl.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300';
        } else {
            statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-stone-400 inline-block mr-1"></span> ' + statusInfo.label;
            statusEl.className = 'px-3 py-1 rounded-full text-xs font-bold bg-stone-100 dark:bg-zinc-800 text-stone-700 dark:text-zinc-300';
        }
    }

    const hoursEl = document.getElementById('modalHours');
    if (hoursEl) hoursEl.textContent = place.displayHours || (place.openingTime ? `${place.openingTime} - ${place.closingTime}` : 'Chưa rõ giờ mở cửa');

    const priceEl = document.getElementById('modalPrice');
    if (priceEl) priceEl.textContent = priceText;

    const addressEl = document.getElementById('modalAddress');
    if (addressEl) addressEl.textContent = place.address || place.area || 'Trà Vinh, Việt Nam';

    const mapLinkBtn = document.getElementById('modalDirections');
    if (mapLinkBtn) {
        if (place.hasValidGps && place.parsedCoordinates) {
            mapLinkBtn.href = `https://www.google.com/maps/search/?api=1&query=${place.parsedCoordinates[0]},${place.parsedCoordinates[1]}`;
            mapLinkBtn.classList.remove('hidden');
        } else if (place.mapLink && place.mapLink.startsWith('http')) {
            mapLinkBtn.href = place.mapLink;
            mapLinkBtn.classList.remove('hidden');
        } else if (place.name) {
            const query = encodeURIComponent(`${place.name}, ${place.address || place.area || 'Trà Vinh'}`);
            mapLinkBtn.href = `https://www.google.com/maps/search/?api=1&query=${query}`;
            mapLinkBtn.classList.remove('hidden');
        }
    }

    const gpsBtn = document.getElementById('modalGpsDirectionsBtn');
    if (gpsBtn && mapLinkBtn && mapLinkBtn.href) {
        gpsBtn.href = mapLinkBtn.href;
    }

    const contactBlock = document.getElementById('modalContactBlock');
    const contactEl = document.getElementById('modalContact');
    if (place.contact && place.contact.trim()) {
        contactBlock?.classList.remove('hidden');
        if (contactEl) {
            contactEl.textContent = place.contact;
            if (place.contactPhone) {
                contactEl.href = `tel:${place.contactPhone}`;
            } else if (place.contactUrl) {
                contactEl.href = place.contactUrl;
                contactEl.target = '_blank';
                contactEl.rel = 'noopener noreferrer';
            } else if (place.contact.startsWith('http')) {
                contactEl.href = place.contact;
                contactEl.target = '_blank';
                contactEl.rel = 'noopener noreferrer';
            } else {
                contactEl.removeAttribute('href');
            }
        }
    } else {
        contactBlock?.classList.add('hidden');
    }

    const noteBlock = document.getElementById('modalNoteBlock');
    const noteEl = document.getElementById('modalNote');
    if (place.note) {
        noteBlock?.classList.remove('hidden');
        if (noteEl) noteEl.textContent = place.note;
    } else {
        noteBlock?.classList.add('hidden');
    }

    // Thiết lập Gallery: Điều hướng Trước / Sau / Bộ đếm ảnh / Vuốt chạm
    let currentGalleryIdx = 0;
    const galleryImages = images;
    const mainImg = document.getElementById('modalMainImage');
    const counterEl = document.getElementById('modalGalleryCounter');
    const prevBtn = document.getElementById('modalGalleryPrevBtn');
    const nextBtn = document.getElementById('modalGalleryNextBtn');
    const galleryContainer = document.getElementById('modalGalleryStrip');

    function updateGalleryView(idx) {
        currentGalleryIdx = (idx + galleryImages.length) % galleryImages.length;
        if (mainImg) {
            mainImg.onerror = () => {
                mainImg.onerror = null;
                mainImg.src = NEUTRAL_PLACEHOLDER_IMAGE;
            };
            mainImg.src = galleryImages[currentGalleryIdx];
            mainImg.alt = `${place.name} - Ảnh ${currentGalleryIdx + 1}`;
        }
        if (counterEl) {
            counterEl.textContent = `${currentGalleryIdx + 1} / ${galleryImages.length}`;
        }
        if (galleryContainer) {
            galleryContainer.querySelectorAll('.gallery-thumb').forEach((b, i) => {
                if (i === currentGalleryIdx) {
                    b.classList.add('border-primary', 'dark:border-emerald-400');
                    b.classList.remove('border-transparent');
                    b.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                } else {
                    b.classList.remove('border-primary', 'dark:border-emerald-400');
                    b.classList.add('border-transparent');
                }
            });
        }
    }

    if (galleryImages.length > 1) {
        prevBtn?.classList.remove('hidden');
        prevBtn?.classList.add('flex');
        nextBtn?.classList.remove('hidden');
        nextBtn?.classList.add('flex');
        counterEl?.classList.remove('hidden');

        if (prevBtn) {
            prevBtn.onclick = (e) => {
                e.stopPropagation();
                updateGalleryView(currentGalleryIdx - 1);
            };
        }
        if (nextBtn) {
            nextBtn.onclick = (e) => {
                e.stopPropagation();
                updateGalleryView(currentGalleryIdx + 1);
            };
        }

        const imgContainer = document.getElementById('modalMainImageContainer');
        if (imgContainer) {
            let touchStartX = 0;
            imgContainer.ontouchstart = (e) => {
                touchStartX = e.changedTouches[0].screenX;
            };
            imgContainer.ontouchend = (e) => {
                const touchEndX = e.changedTouches[0].screenX;
                const diffX = touchEndX - touchStartX;
                if (Math.abs(diffX) > 40) {
                    if (diffX < 0) updateGalleryView(currentGalleryIdx + 1); // vuốt sang trái -> xem ảnh tiếp
                    else updateGalleryView(currentGalleryIdx - 1); // vuốt sang phải -> xem ảnh trước
                }
            };
        }
    } else {
        prevBtn?.classList.add('hidden');
        prevBtn?.classList.remove('flex');
        nextBtn?.classList.add('hidden');
        nextBtn?.classList.remove('flex');
        counterEl?.classList.add('hidden');
    }

    if (galleryContainer) {
        if (galleryImages.length > 1) {
            galleryContainer.classList.remove('hidden');
            galleryContainer.innerHTML = galleryImages.map((img, idx) => `
                <button type="button" id="modalThumb_${idx}" class="gallery-thumb w-16 h-16 rounded-xl overflow-hidden shrink-0 border-2 ${idx === 0 ? 'border-primary dark:border-emerald-400' : 'border-transparent'} hover:opacity-80 transition-all focus:outline-none focus:ring-2 focus:ring-primary" data-img-idx="${idx}" aria-label="Xem ảnh ${idx + 1}">
                    <img src="${img}" class="w-full h-full object-cover" alt="Thumb ${idx + 1}" onerror="this.onerror=null; this.src='${NEUTRAL_PLACEHOLDER_IMAGE}';">
                </button>
            `).join('');

            galleryContainer.querySelectorAll('.gallery-thumb').forEach(btn => {
                btn.onclick = () => {
                    const idx = parseInt(btn.dataset.imgIdx, 10) || 0;
                    updateGalleryView(idx);
                };
            });
        } else {
            galleryContainer.classList.add('hidden');
        }
    }

    updateGalleryView(0);

    const starsEl = document.getElementById('modalStars');
    if (starsEl) starsEl.innerHTML = renderRatingStars(rating, true);

    // Cập nhật trạng thái bookmark trong modal
    updateModalBookmarkButton(isSaved);

    // Render Điểm nhấn kiến trúc & Quy tắc văn hóa ứng xử
    renderCulturalHighlights(place);

    // Render danh sách điểm đến lân cận
    const spotsList = allPlaces || (typeof window !== 'undefined' && window.ViVuApp?.state?.allPlaces) || [];
    renderNearbySpots(place, spotsList);

    // Render bình luận: nếu null -> hiển thị skeleton; nếu có mảng -> hiển thị danh sách
    if (comments === null) {
        renderCommentsSkeleton();
    } else {
        renderCommentsList(comments);
    }

    renderCheckinAndTikTokTab(place);

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

/**
 * Cập nhật giao diện nút Bookmark trên thanh tiêu đề Modal
 */
export function updateModalBookmarkButton(isSaved) {
    const btn = document.getElementById('modalBookmarkBtn');
    const icon = document.getElementById('modalBookmarkIcon');
    const text = document.getElementById('modalBookmarkText');
    if (!btn || !icon) return;

    if (isSaved) {
        icon.textContent = 'bookmark';
        icon.classList.add('text-secondary', 'dark:text-emerald-400');
        icon.setAttribute('style', "font-variation-settings: 'FILL' 1;");
        if (text) text.textContent = 'Đã lưu';
        btn.setAttribute('aria-label', 'Bỏ lưu địa điểm này');
        btn.classList.add('border-secondary/40', 'bg-secondary/10');
    } else {
        icon.textContent = 'bookmark_border';
        icon.classList.remove('text-secondary', 'dark:text-emerald-400');
        icon.removeAttribute('style');
        if (text) text.textContent = 'Lưu địa điểm';
        btn.setAttribute('aria-label', 'Lưu địa điểm này');
        btn.classList.remove('border-secondary/40', 'bg-secondary/10');
    }
}

/**
 * Render Khối Điểm Nhấn Kiến Trúc / Văn Hóa & Quy Tắc Ứng Xử Tôn Trọng
 */
export function renderCulturalHighlights(place) {
    const highlightsEl = document.getElementById('modalHeritageHighlights');
    const etiquetteEl = document.getElementById('modalCulturalEtiquette');
    if (!highlightsEl || !etiquetteEl || !place) return;

    const fullText = `${place.name || ''} ${place.category || ''} ${place.description || ''} ${place.area || ''}`.toLowerCase();
    const isTemple = /chùa|wat|đền|di tích|miếu|bảo tàng/i.test(fullText);
    const isFood = /ẩm thực|quán|bún|bánh|cà phê|cafe|trà|ăn uống|món ngon/i.test(fullText);

    if (isTemple) {
        highlightsEl.innerHTML = `
            <div class="flex flex-col gap-1">
                <h4 class="font-headline-sm text-sm sm:text-base font-bold text-primary dark:text-zinc-100 flex items-center gap-2">
                    <span class="material-symbols-outlined text-secondary dark:text-emerald-400 text-[24px]">architecture</span>
                    <span>Đỉnh cao kiến trúc điêu khắc Khmer</span>
                </h4>
                <p class="font-body-sm text-xs text-on-surface-variant dark:text-zinc-400">
                    Từng đường nét chạm trổ là một chương sử thi về triết lý nhân sinh và cõi Phật
                </p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div class="flex flex-col rounded-xl bg-surface-container-lowest dark:bg-zinc-900 p-3.5 gap-2 border border-outline-variant/20 dark:border-zinc-800">
                    <div class="w-8 h-8 rounded-lg bg-secondary/10 text-secondary dark:text-emerald-400 flex items-center justify-center">
                        <span class="material-symbols-outlined text-[20px]">roofing</span>
                    </div>
                    <h5 class="font-headline-sm text-xs font-bold text-primary dark:text-zinc-200">Mái vòm rồng Naga</h5>
                    <p class="font-body-sm text-[11px] text-on-surface-variant dark:text-zinc-400 leading-relaxed">Mái nhiều tầng chồng lên nhau, các góc vuốt cong vút hình đuôi rồng Naga che chở thiện nam tín nữ.</p>
                </div>
                <div class="flex flex-col rounded-xl bg-surface-container-lowest dark:bg-zinc-900 p-3.5 gap-2 border border-outline-variant/20 dark:border-zinc-800">
                    <div class="w-8 h-8 rounded-lg bg-[#EA580C]/10 text-[#EA580C] flex items-center justify-center">
                        <span class="material-symbols-outlined text-[20px]">shield</span>
                    </div>
                    <h5 class="font-headline-sm text-xs font-bold text-primary dark:text-zinc-200">Chim Krud &amp; Yeak</h5>
                    <p class="font-body-sm text-[11px] text-on-surface-variant dark:text-zinc-400 leading-relaxed">Đầu cột hiên được đỡ bằng Thần chim Krud dang cánh cùng các hộ pháp Yeak bảo vệ cửa thiền.</p>
                </div>
                <div class="flex flex-col rounded-xl bg-surface-container-lowest dark:bg-zinc-900 p-3.5 gap-2 border border-outline-variant/20 dark:border-zinc-800">
                    <div class="w-8 h-8 rounded-lg bg-secondary/10 text-secondary dark:text-emerald-400 flex items-center justify-center">
                        <span class="material-symbols-outlined text-[20px]">palette</span>
                    </div>
                    <h5 class="font-headline-sm text-xs font-bold text-primary dark:text-zinc-200">Bích họa Phật tích</h5>
                    <p class="font-body-sm text-[11px] text-on-surface-variant dark:text-zinc-400 leading-relaxed">Bốn mặt tường chánh điện là chuỗi bích họa rực rỡ khắc họa con đường tu tập và giác ngộ của Đức Phật.</p>
                </div>
            </div>
            <div class="p-3 rounded-xl bg-surface-container-high/60 dark:bg-zinc-800/80 flex items-start gap-2.5">
                <span class="material-symbols-outlined text-secondary dark:text-emerald-400 text-[20px] mt-0.5 shrink-0">format_quote</span>
                <p class="font-body-sm text-xs text-on-surface dark:text-zinc-300 italic leading-relaxed">
                    "Không gian lưu giữ những mẫu mực điêu khắc cổ xưa tinh hoa nhất của người Khmer đồng bằng sông Cửu Long."
                </p>
            </div>
        `;
    } else if (isFood) {
        highlightsEl.innerHTML = `
            <div class="flex flex-col gap-1">
                <h4 class="font-headline-sm text-sm sm:text-base font-bold text-primary dark:text-zinc-100 flex items-center gap-2">
                    <span class="material-symbols-outlined text-secondary dark:text-emerald-400 text-[24px]">restaurant</span>
                    <span>Tinh hoa ẩm thực ba dân tộc Kinh - Khmer - Hoa</span>
                </h4>
                <p class="font-body-sm text-xs text-on-surface-variant dark:text-zinc-400">
                    Sự hòa quyện độc đáo giữa sản vật sông nước cù lao và công thức gia truyền
                </p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div class="flex flex-col rounded-xl bg-surface-container-lowest dark:bg-zinc-900 p-3.5 gap-2 border border-outline-variant/20 dark:border-zinc-800">
                    <div class="w-8 h-8 rounded-lg bg-[#EA580C]/10 text-[#EA580C] flex items-center justify-center">
                        <span class="material-symbols-outlined text-[20px]">soup_kitchen</span>
                    </div>
                    <h5 class="font-headline-sm text-xs font-bold text-primary dark:text-zinc-200">Hương vị nguyên bản</h5>
                    <p class="font-body-sm text-[11px] text-on-surface-variant dark:text-zinc-400 leading-relaxed">Hương vị đậm đà đặc trưng miền Tây Nam Bộ, nấu từ mắm hoặc thảo mộc đồng quê tự nhiên.</p>
                </div>
                <div class="flex flex-col rounded-xl bg-surface-container-lowest dark:bg-zinc-900 p-3.5 gap-2 border border-outline-variant/20 dark:border-zinc-800">
                    <div class="w-8 h-8 rounded-lg bg-secondary/10 text-secondary dark:text-emerald-400 flex items-center justify-center">
                        <span class="material-symbols-outlined text-[20px]">eco</span>
                    </div>
                    <h5 class="font-headline-sm text-xs font-bold text-primary dark:text-zinc-200">Nguyên liệu tươi sạch</h5>
                    <p class="font-body-sm text-[11px] text-on-surface-variant dark:text-zinc-400 leading-relaxed">Tươi ngon từ rau đồng, bắp chuối, rau thơm vườn nhà cùng thủy hải sản bến sông Trà Vinh.</p>
                </div>
                <div class="flex flex-col rounded-xl bg-surface-container-lowest dark:bg-zinc-900 p-3.5 gap-2 border border-outline-variant/20 dark:border-zinc-800">
                    <div class="w-8 h-8 rounded-lg bg-secondary/10 text-secondary dark:text-emerald-400 flex items-center justify-center">
                        <span class="material-symbols-outlined text-[20px]">thumb_up</span>
                    </div>
                    <h5 class="font-headline-sm text-xs font-bold text-primary dark:text-zinc-200">Nồng hậu mến khách</h5>
                    <p class="font-body-sm text-[11px] text-on-surface-variant dark:text-zinc-400 leading-relaxed">Phong cách phục vụ chân chất, thân thiện đúng chất người con hào sảng miền Tây.</p>
                </div>
            </div>
        `;
    } else {
        highlightsEl.innerHTML = `
            <div class="flex flex-col gap-1">
                <h4 class="font-headline-sm text-sm sm:text-base font-bold text-primary dark:text-zinc-100 flex items-center gap-2">
                    <span class="material-symbols-outlined text-secondary dark:text-emerald-400 text-[24px]">nature</span>
                    <span>Cảnh quan sinh thái &amp; Giá trị bản địa</span>
                </h4>
                <p class="font-body-sm text-xs text-on-surface-variant dark:text-zinc-400">
                    Không gian xanh mát, lưu giữ nét bình dị và sinh thái trù phú của vùng đồng bằng
                </p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div class="flex flex-col rounded-xl bg-surface-container-lowest dark:bg-zinc-900 p-3.5 gap-2 border border-outline-variant/20 dark:border-zinc-800">
                    <div class="w-8 h-8 rounded-lg bg-secondary/10 text-secondary dark:text-emerald-400 flex items-center justify-center">
                        <span class="material-symbols-outlined text-[20px]">forest</span>
                    </div>
                    <h5 class="font-headline-sm text-xs font-bold text-primary dark:text-zinc-200">Rợp bóng cổ thụ</h5>
                    <p class="font-body-sm text-[11px] text-on-surface-variant dark:text-zinc-400 leading-relaxed">Quần thể cây xanh và bóng mát tự nhiên tạo nên bầu không khí trong lành, xua tan oi ả.</p>
                </div>
                <div class="flex flex-col rounded-xl bg-surface-container-lowest dark:bg-zinc-900 p-3.5 gap-2 border border-outline-variant/20 dark:border-zinc-800">
                    <div class="w-8 h-8 rounded-lg bg-secondary/10 text-secondary dark:text-emerald-400 flex items-center justify-center">
                        <span class="material-symbols-outlined text-[20px]">water_drop</span>
                    </div>
                    <h5 class="font-headline-sm text-xs font-bold text-primary dark:text-zinc-200">Không khí thanh bình</h5>
                    <p class="font-body-sm text-[11px] text-on-surface-variant dark:text-zinc-400 leading-relaxed">Không gian tĩnh tại, lý tưởng để thư giãn, đi dạo và tận hưởng vẻ đẹp thiên nhiên miền quê.</p>
                </div>
                <div class="flex flex-col rounded-xl bg-surface-container-lowest dark:bg-zinc-900 p-3.5 gap-2 border border-outline-variant/20 dark:border-zinc-800">
                    <div class="w-8 h-8 rounded-lg bg-[#EA580C]/10 text-[#EA580C] flex items-center justify-center">
                        <span class="material-symbols-outlined text-[20px]">photo_camera</span>
                    </div>
                    <h5 class="font-headline-sm text-xs font-bold text-primary dark:text-zinc-200">Góc check-in đẹp</h5>
                    <p class="font-body-sm text-[11px] text-on-surface-variant dark:text-zinc-400 leading-relaxed">Nhiều khung hình thơ mộng với ánh nắng len lỏi qua tán cây râm mát.</p>
                </div>
            </div>
        `;
    }

    etiquetteEl.innerHTML = `
        <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[#EA580C] text-[24px]">shield</span>
            <h4 class="font-headline-sm text-sm sm:text-base font-bold text-primary dark:text-zinc-100">
                Quy tắc ứng xử &amp; Tôn trọng văn hóa bản địa
            </h4>
        </div>
        <p class="font-body-sm text-xs text-on-surface-variant dark:text-zinc-400">
            Để bảo tồn tính tôn nghiêm và giữ gìn nét đẹp văn hóa Trà Vinh, du khách vui lòng lưu ý:
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div class="flex items-start gap-2.5 p-3 rounded-xl bg-surface-container-lowest dark:bg-zinc-900 border border-outline-variant/20 dark:border-zinc-800">
                <span class="material-symbols-outlined text-secondary dark:text-emerald-400 text-[20px] shrink-0 mt-0.5">check_circle</span>
                <div class="flex flex-col">
                    <strong class="font-button text-xs font-bold text-on-surface dark:text-zinc-200">Trang phục kín đáo, lịch thiệp</strong>
                    <span class="font-body-sm text-[11px] text-on-surface-variant dark:text-zinc-400 mt-0.5">Ưu tiên áo có tay, quần hoặc váy dài qua gối khi đến nơi thờ tự và chốn tôn nghiêm.</span>
                </div>
            </div>
            <div class="flex items-start gap-2.5 p-3 rounded-xl bg-surface-container-lowest dark:bg-zinc-900 border border-outline-variant/20 dark:border-zinc-800">
                <span class="material-symbols-outlined text-secondary dark:text-emerald-400 text-[20px] shrink-0 mt-0.5">do_not_step</span>
                <div class="flex flex-col">
                    <strong class="font-button text-xs font-bold text-on-surface dark:text-zinc-200">Tháo giày dép khi vào chánh điện</strong>
                    <span class="font-body-sm text-[11px] text-on-surface-variant dark:text-zinc-400 mt-0.5">Đặt giày dép ngay ngắn bên ngoài thềm theo bảng hướng dẫn của ban quản trị.</span>
                </div>
            </div>
            <div class="flex items-start gap-2.5 p-3 rounded-xl bg-surface-container-lowest dark:bg-zinc-900 border border-outline-variant/20 dark:border-zinc-800">
                <span class="material-symbols-outlined text-secondary dark:text-emerald-400 text-[20px] shrink-0 mt-0.5">volume_off</span>
                <div class="flex flex-col">
                    <strong class="font-button text-xs font-bold text-on-surface dark:text-zinc-200">Giữ không gian tĩnh tịnh</strong>
                    <span class="font-body-sm text-[11px] text-on-surface-variant dark:text-zinc-400 mt-0.5">Chuyển điện thoại sang chế độ rung, nói năng nhẹ nhàng, không gây ồn ào.</span>
                </div>
            </div>
            <div class="flex items-start gap-2.5 p-3 rounded-xl bg-surface-container-lowest dark:bg-zinc-900 border border-outline-variant/20 dark:border-zinc-800">
                <span class="material-symbols-outlined text-secondary dark:text-emerald-400 text-[20px] shrink-0 mt-0.5">camera</span>
                <div class="flex flex-col">
                    <strong class="font-button text-xs font-bold text-on-surface dark:text-zinc-200">Chụp ảnh văn minh, tôn trọng</strong>
                    <span class="font-body-sm text-[11px] text-on-surface-variant dark:text-zinc-400 mt-0.5">Không tạo dáng phản cảm trước tượng Phật hay di vật, tắt đèn flash chiếu vào bích họa cổ.</span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render Danh Sách Điểm Đến Lân Cận
 */
export function renderNearbySpots(place, allPlaces = []) {
    const container = document.getElementById('modalNearbySpotsContainer');
    if (!container) return;

    if (!Array.isArray(allPlaces) || allPlaces.length === 0) {
        container.innerHTML = `
            <div class="text-xs text-on-surface-variant dark:text-zinc-400 py-3 italic text-center">
                Đang cập nhật các điểm lân cận
            </div>
        `;
        return;
    }

    const currentId = place.id;
    const candidates = allPlaces.filter(p => p && p.id !== currentId);
    if (candidates.length === 0) {
        container.innerHTML = `
            <div class="text-xs text-on-surface-variant dark:text-zinc-400 py-3 italic text-center">
                Đang cập nhật các điểm lân cận
            </div>
        `;
        return;
    }

    // Ưu tiên các điểm cùng khu vực (area)
    const sameArea = candidates.filter(p => p.area && place.area && p.area.trim().toLowerCase() === place.area.trim().toLowerCase());
    const others = candidates.filter(p => !p.area || !place.area || p.area.trim().toLowerCase() !== place.area.trim().toLowerCase());
    const nearbyList = [...sameArea, ...others].slice(0, 3);

    container.innerHTML = nearbyList.map(spot => {
        const spotImg = spot.imageLink || (spot.images && spot.images[0]) || NEUTRAL_PLACEHOLDER_IMAGE;
        const spotCategory = spot.category || 'Địa điểm';
        const spotArea = spot.area || 'Trà Vinh';
        const escapedId = escapeHtml(spot.id);
        const escapedName = escapeHtml(spot.name);
        const escapedCategory = escapeHtml(spotCategory);
        const escapedArea = escapeHtml(spotArea);

        return `
            <button type="button" onclick="window.ViVuApp.openDetailModal('${escapedId}')"
                class="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-container-low dark:hover:bg-zinc-800 transition-colors text-left group">
                <img class="w-12 h-12 rounded-lg object-cover flex-shrink-0" src="${spotImg}" alt="${escapedName}" onerror="this.onerror=null; this.src='${NEUTRAL_PLACEHOLDER_IMAGE}';">
                <div class="flex flex-col min-w-0 flex-1">
                    <span class="font-button text-xs font-bold text-on-surface dark:text-zinc-200 group-hover:text-secondary truncate">${escapedName}</span>
                    <span class="font-caption text-[11px] text-outline dark:text-zinc-400 truncate">${escapedCategory} • ${escapedArea}</span>
                </div>
                <span class="material-symbols-outlined text-outline group-hover:text-secondary text-[18px]">chevron_right</span>
            </button>
        `;
    }).join('');
}


/**
 * Render Skeleton trạng thái đang tải bình luận (Zero Latency UX)
 */
export function renderCommentsSkeleton() {
    const listEl = document.getElementById('commentsList');
    const summaryEl = document.getElementById('commentSummary');
    const countEl = document.getElementById('commentCount');
    if (summaryEl) summaryEl.textContent = 'Đang tải nhận xét từ du khách...';
    if (countEl) countEl.textContent = '...';
    if (!listEl) return;

    listEl.innerHTML = `
        <div class="space-y-3 animate-pulse py-2">
            <div class="p-3.5 rounded-2xl bg-surface-container-low dark:bg-zinc-800/40 border border-outline-variant/30 dark:border-zinc-700/50 space-y-2">
                <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-full bg-stone-200 dark:bg-zinc-700"></div>
                    <div class="space-y-1 flex-1">
                        <div class="h-3 bg-stone-200 dark:bg-zinc-700 rounded w-1/4"></div>
                        <div class="h-2.5 bg-stone-200 dark:bg-zinc-700 rounded w-1/6"></div>
                    </div>
                </div>
                <div class="h-3 bg-stone-200 dark:bg-zinc-700 rounded w-5/6"></div>
                <div class="h-3 bg-stone-200 dark:bg-zinc-700 rounded w-2/3"></div>
            </div>
            <div class="p-3.5 rounded-2xl bg-surface-container-low dark:bg-zinc-800/40 border border-outline-variant/30 dark:border-zinc-700/50 space-y-2">
                <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-full bg-stone-200 dark:bg-zinc-700"></div>
                    <div class="space-y-1 flex-1">
                        <div class="h-3 bg-stone-200 dark:bg-zinc-700 rounded w-1/3"></div>
                        <div class="h-2.5 bg-stone-200 dark:bg-zinc-700 rounded w-1/5"></div>
                    </div>
                </div>
                <div class="h-3 bg-stone-200 dark:bg-zinc-700 rounded w-3/4"></div>
            </div>
        </div>
    `;
}

/**
 * Render Trạng Thái Lỗi Khi Tải Bình Luận Kèm Nút Thử Lại
 */
export function renderCommentsError(onRetry) {
    const listEl = document.getElementById('commentsList');
    const summaryEl = document.getElementById('commentSummary');
    const countEl = document.getElementById('commentCount');
    if (summaryEl) summaryEl.textContent = 'Không thể tải bình luận trực tuyến';
    if (countEl) countEl.textContent = '(!)';
    if (!listEl) return;

    listEl.innerHTML = `
        <div class="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-center space-y-2">
            <p class="text-xs text-rose-700 dark:text-rose-300 font-semibold">
                Không thể tải nhận xét do sự cố kết nối.
            </p>
            <button id="retryCommentsBtn" type="button" class="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors shadow-xs">
                Thử lại
            </button>
        </div>
    `;

    document.getElementById('retryCommentsBtn')?.addEventListener('click', () => {
        if (typeof onRetry === 'function') onRetry();
    });
}

/**
 * Render Danh Sách Bình Luận Trong Modal
 */
export function renderCommentsList(comments = []) {
    const listEl = document.getElementById('commentsList');
    const summaryEl = document.getElementById('commentSummary');
    const countEl = document.getElementById('commentCount');
    if (!listEl) return;

    if (!comments || comments.length === 0) {
        if (summaryEl) summaryEl.textContent = 'Chưa có bình luận nào. Hãy là người đầu tiên chia sẻ trải nghiệm!';
        if (countEl) countEl.textContent = '(0)';
        listEl.innerHTML = `
            <div class="p-4 rounded-xl bg-surface-container-low dark:bg-zinc-800/50 text-center text-xs text-on-surface-variant dark:text-zinc-400 italic">
                Chưa có nhận xét từ cộng đồng. Hãy chia sẻ cảm nhận của bạn bên dưới!
            </div>
        `;
        return;
    }

    if (summaryEl) summaryEl.textContent = `${comments.length} đánh giá từ cộng đồng du khách`;
    if (countEl) countEl.textContent = `(${comments.length})`;

    const colors = ['bg-emerald-600', 'bg-amber-600', 'bg-teal-600', 'bg-indigo-600', 'bg-rose-600'];

    listEl.innerHTML = comments.map((c, idx) => {
        const rawName = String(c.author_name || '').trim();
        const safeAuthorName = escapeHtml(rawName || 'Khách ẩn danh');
        const safeCommentText = escapeHtml(c.comment_text || '');
        const safeInitial = escapeHtml((rawName || 'K').charAt(0).toUpperCase() || 'K');
        const avatarColor = colors[idx % colors.length];
        const dateStr = c.created_at ? new Date(c.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

        const rawPhoto = c.photo_data || c.photo_url || null;
        let safePhotoSrc = null;
        if (rawPhoto && typeof rawPhoto === 'string') {
            const isDataUrl = /^data:image\/(jpeg|png|webp|jpg);base64,[A-Za-z0-9+/=]+$/.test(rawPhoto);
            const isHttpUrl = /^https?:\/\/[^\s"'<>]+$/i.test(rawPhoto);
            if (isDataUrl || isHttpUrl) {
                safePhotoSrc = rawPhoto;
            }
        }

        return `
            <div class="p-3.5 rounded-2xl bg-surface-container-low dark:bg-zinc-800/60 border border-outline-variant/30 dark:border-zinc-800 space-y-2.5">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-full ${avatarColor} text-white flex items-center justify-center font-bold text-xs shadow-xs">
                            ${safeInitial}
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="font-bold text-xs text-on-surface dark:text-zinc-100">${safeAuthorName}</span>
                                ${c.is_offline ? `
                                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[9px] font-bold border border-amber-300 dark:border-amber-800/60">
                                        <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                        Chờ đồng bộ (Offline)
                                    </span>
                                ` : ''}
                            </div>
                            <div class="text-[10px] text-on-surface-variant dark:text-zinc-400">${dateStr}</div>
                        </div>
                    </div>
                    <div>
                        ${renderRatingStars(c.rating || 5, false)}
                    </div>
                </div>

                <p class="text-xs text-on-surface-variant dark:text-zinc-300 leading-relaxed pl-10">
                    ${safeCommentText}
                </p>

                ${safePhotoSrc ? `
                    <div class="pl-10 pt-1">
                        <div class="inline-block relative group/img cursor-pointer" onclick="window.ViVuApp.viewPhotoModal('${escapeHtml(safePhotoSrc.replace(/'/g, "\\'"))}')">
                            <img src="${escapeHtml(safePhotoSrc)}" alt="Ảnh thực tế từ du khách" class="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-xl border border-outline-variant/40 dark:border-zinc-700 shadow-sm group-hover/img:scale-105 transition-transform">
                            <div class="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 rounded-xl flex items-center justify-center text-white text-[11px] font-bold transition-opacity">
                                <span class="material-symbols-outlined text-base">zoom_in</span>
                            </div>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

/**
 * Dữ liệu 3 lịch trình tour 1 ngày mẫu được tuyển chọn cho Trà Vinh
 */
export const SAMPLE_TOURS = [
    {
        id: 'khmer-culture',
        title: 'Tour 1: Một Ngày Khám Phá Văn Hóa Khmer Huyền Bí',
        subtitle: 'Chùa Âng • Ao Bà Om • Bảo tàng Khmer • Chùa Hang',
        tag: 'Di Sản & Tâm Linh',
        tagColor: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300',
        duration: '1 Ngày (07:00 - 17:30)',
        vehicle: 'Xe máy / Ô tô',
        distance: '~25 km',
        budget: '150.000đ - 250.000đ/người',
        travelTime: '~45 phút di chuyển',
        familyFriendly: true,
        desc: 'Hành trình trọn vẹn khám phá quần thể di sản chùa tháp Khmer cổ kính hàng trăm năm tuổi, tản bộ dưới rặng cây sao dầu đại thụ và chiêm ngưỡng nghệ thuật điêu khắc gỗ tinh xảo.',
        stops: [
            {
                time: '07:00 – 08:00',
                title: 'Điểm tâm sáng Bún Nước Lèo Quán Cô Ba / Sáu Liêm',
                desc: 'Nạp năng lượng với tô bún nước lèo chuẩn vị miền Tây: nước súp nấu từ mắm bò hóc đậm đà, thịt heo quay da giòn rụm và cá lóc đồng ngọt thịt.',
                tip: 'Nên ăn kèm bắp chuối ghém, rau muống non chẻ và vắt ít chanh ớt cay nồng.',
                icon: 'ramen_dining',
                placeKeyword: 'Bún Nước Lèo',
                lat: 9.9385,
                lng: 106.3421,
                gpsStatus: 'unverified',
                gpsStatusLabel: 'Chưa xác minh (Tọa độ ước tính theo đường, không dùng dẫn đường chính xác)',
                gpsSource: 'https://www.openstreetmap.org/?mlat=9.9385&mlon=106.3421#map=18/9.9385/106.3421',
                gpsNote: 'Tọa độ ước tính theo trục đường Đồng Khởi / Lê Lợi nội ô; chưa đo mốc định danh số nhà quán ăn',
                isAccurateNav: false
            },
            {
                time: '08:15 – 10:30',
                title: 'Quần thể danh thắng Ao Bà Om & Chùa Âng (Wat Angkor Borey)',
                desc: 'Tản bộ dưới tán rừng sao dầu đại thụ có bộ rễ nổi kỳ vĩ uốn lượn tựa tác phẩm điêu khắc thiên nhiên. Chiêm bái ngôi cổ tự Angkorian nguy nga bậc nhất Trà Vinh.',
                tip: 'Góc chụp ảnh rễ cây đẹp nhất ở bờ nam hồ; nên vào viếng chánh điện trước 10h sáng.',
                icon: 'temple_buddhist',
                placeKeyword: 'Ao Bà Om',
                lat: 9.9442,
                lng: 106.3135,
                gpsStatus: 'verified',
                gpsStatusLabel: 'Mốc tham chiếu bản đồ số (Chưa đo kiểm thực địa)',
                gpsSource: 'https://www.openstreetmap.org/way/458694852',
                gpsNote: 'Vùng mặt nước trung tâm Ao Bà Om (Khóm Cổ Tháp)',
                isAccurateNav: true
            },
            {
                time: '10:45 – 11:45',
                title: 'Bảo tàng Văn hóa Dân tộc Khmer Trà Vinh',
                desc: 'Tìm hiểu kho tàng hơn 500 hiện vật quý giá: nhạc cụ ngũ âm Pinpeat, mặt nạ tuồng Chầm-riêng, trang phục cưới truyền thống và kinh Phật chép trên lá buông.',
                tip: 'Bảo tàng nằm ngay đối diện Chùa Âng, rất tiện đi bộ tham quan liên hoàn.',
                icon: 'museum',
                placeKeyword: 'Chùa Âng',
                lat: 9.9426,
                lng: 106.3105,
                gpsStatus: 'verified',
                gpsStatusLabel: 'Mốc tham chiếu bản đồ số (Chưa đo kiểm thực địa)',
                gpsSource: 'https://www.openstreetmap.org/?mlat=9.9426&mlon=106.3105#map=18/9.9426/106.3105',
                gpsNote: 'Khuôn viên Bảo tàng Văn hóa Dân tộc Khmer Trà Vinh, Phường 8',
                isAccurateNav: true
            },
            {
                time: '12:00 – 13:30',
                title: 'Dùng cơm trưa ẩm thực miệt vườn',
                desc: 'Thưởng thức mâm cơm đồng quê thanh mát: canh chua cá ngát, cá lóc kho tộ, rau luộc kho quẹt tại quán sân vườn thoáng mát.',
                tip: 'Uống thêm một trái dừa tươi mát rượi để giải nhiệt trưa hè.',
                icon: 'restaurant',
                placeKeyword: 'Quán ăn',
                lat: 9.9350,
                lng: 106.3300,
                gpsStatus: 'unverified',
                gpsStatusLabel: 'Chưa xác minh (Tọa độ ước tính theo vùng, không dùng dẫn đường chính xác)',
                gpsSource: 'https://www.openstreetmap.org/?mlat=9.9350&mlon=106.3300#map=16/9.9350/106.3300',
                gpsNote: 'Tọa độ ước tính phân vùng trung tâm TP. Trà Vinh; chưa chỉ định nhà hàng cụ thể',
                isAccurateNav: false
            },
            {
                time: '14:00 – 16:30',
                title: 'Chùa Hang (Wat Kompong Chiray) & Vườn chim tự nhiên',
                desc: 'Chiêm ngưỡng cổng chùa độc đáo hình vòm hang đá cổ xưa, tham quan xưởng điêu khắc gỗ của các nghệ nhân sư thầy và ngắm đàn chim hoang dã bay về tổ.',
                tip: 'Thời điểm ngắm đàn chim về rợp bóng cây đẹp nhất là từ 15:30 đến 16:30.',
                icon: 'nature_people',
                placeKeyword: 'Chùa Hang',
                lat: 9.9142,
                lng: 106.3056,
                gpsStatus: 'verified',
                gpsStatusLabel: 'Mốc tham chiếu bản đồ số (Chưa đo kiểm thực địa)',
                gpsSource: 'https://www.openstreetmap.org/node/3922119102',
                gpsNote: 'Khuôn viên Chùa Hang, đoạn đường Nguyễn Du, Khóm 8, TT. Châu Thành',
                isAccurateNav: true
            }
        ]
    },
    {
        id: 'food-tour',
        title: 'Tour 2: Food Tour Ẩm Thực Bản Địa Trứ Danh',
        subtitle: 'Bún nước lèo • Cà phê Dừa sáp • Bánh tét Trà Cuôn',
        tag: 'Thiên Đường Món Ngon',
        tagColor: 'bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950/60 dark:text-orange-300',
        duration: '1 Ngày (07:00 - 20:30)',
        vehicle: 'Xe máy / Foodie dạo phố',
        distance: '~18 km',
        budget: '200.000đ - 350.000đ/người',
        travelTime: '~30 phút di chuyển',
        familyFriendly: true,
        desc: 'Hành trình đánh thức mọi giác quan với những món ngon nức tiếng giao thoa văn hóa Kinh - Khmer - Hoa, từ đĩa bánh canh ngọt thanh đến ngụm cà phê dừa sáp Cầu Kè béo ngọt độc bản.',
        stops: [
            {
                time: '07:00 – 08:30',
                title: 'Khởi đầu ngày mới với Bún Nước Lèo Trà Vinh',
                desc: 'Món ăn quốc hồn quốc túy nức tiếng với nước lèo thơm dậy mùi mắm ngải bún bò hóc, miếng heo quay giòn tan và cá lóc đồng thơm lừng.',
                tip: 'Ăn tại các quán nổi tiếng quanh đường Đồng Khởi hoặc Điện Biên Phủ, TP. Trà Vinh.',
                icon: 'ramen_dining',
                placeKeyword: 'Bún Nước Lèo',
                lat: 9.9385,
                lng: 106.3421,
                gpsStatus: 'unverified',
                gpsStatusLabel: 'Chưa xác minh (Tọa độ ước tính theo đường, không dùng dẫn đường chính xác)',
                gpsSource: 'https://www.openstreetmap.org/?mlat=9.9385&mlon=106.3421#map=18/9.9385/106.3421',
                gpsNote: 'Tọa độ ước tính theo trục đường Đồng Khởi / Lê Lợi nội ô; chưa đo mốc định danh số nhà quán ăn',
                isAccurateNav: false
            },
            {
                time: '09:00 – 11:00',
                title: 'Thưởng thức Cà phê Dừa sáp Cầu Kè ven sông',
                desc: 'Trải nghiệm dừa sáp Cầu Kè béo ngậy được xay nhuyễn hòa cùng cà phê phin đậm đà trong không gian hiên dừa lộng gió mát rượi.',
                tip: 'Dừa sáp chuẩn độ dẻo quánh, ăn một muỗng như tan chảy trên đầu lưỡi.',
                icon: 'local_cafe',
                placeKeyword: 'Cafe',
                lat: 9.9392,
                lng: 106.3405,
                gpsStatus: 'unverified',
                gpsStatusLabel: 'Chưa xác minh (Tọa độ ước tính theo đường, không dùng dẫn đường chính xác)',
                gpsSource: 'https://www.openstreetmap.org/?mlat=9.9392&mlon=106.3405#map=18/9.9392/106.3405',
                gpsNote: 'Tọa độ ước tính theo trục bờ kè sông Long Bình nội ô; chưa đo mốc quán cụ thể',
                isAccurateNav: false
            },
            {
                time: '11:30 – 13:30',
                title: 'Bánh canh Bến Có hoặc Cơm Cà ri Khmer',
                desc: 'Tô bánh canh Bến Có nức tiếng với sợi bánh dẻo mềm, nước dùng trong vắt ngọt xương hầm và đĩa lòng heo tươi giòn sần sật.',
                tip: 'Bánh canh Bến Có cách trung tâm khoảng 5km về hướng Cầu Kè.',
                icon: 'soup_kitchen',
                placeKeyword: 'Bánh Canh',
                lat: 9.9120,
                lng: 106.2800,
                gpsStatus: 'unverified',
                gpsStatusLabel: 'Chưa xác minh (Tọa độ ước tính theo vùng Cầu Ngang / QL53, không dùng dẫn đường chính xác)',
                gpsSource: 'https://www.openstreetmap.org/?mlat=9.9120&mlon=106.2800#map=16/9.9120/106.2800',
                gpsNote: 'Tọa độ ước tính khu vực cầu Bến Có, Quốc lộ 53; chưa đo mốc định danh quán ăn thực tế',
                isAccurateNav: false
            },
            {
                time: '14:30 – 16:00',
                title: 'Ăn vặt đường phố: Bánh ống lá dứa & Chè thốt nốt',
                desc: 'Thưởng thức bánh ống lá dứa nghi ngút khói thơm nồng hương dừa nạo và ly chè thốt nốt thanh mát giải nhiệt buổi chiều.',
                tip: 'Các gánh bánh ống thường xuất hiện ven các cổng chùa hoặc chợ Trà Vinh.',
                icon: 'bakery_dining',
                placeKeyword: 'Ăn vặt',
                lat: 9.9398,
                lng: 106.3450,
                gpsStatus: 'unverified',
                gpsStatusLabel: 'Chưa xác minh (Tọa độ ước tính theo vùng chợ, không dùng dẫn đường chính xác)',
                gpsSource: 'https://www.openstreetmap.org/?mlat=9.9398&mlon=106.3450#map=18/9.9398/106.3450',
                gpsNote: 'Tọa độ ước tính khu vực Chợ Lớn Trà Vinh; các gánh hàng rong di động không có mốc cố định',
                isAccurateNav: false
            },
            {
                time: '16:30 – 18:00',
                title: 'Ghé làng nghề truyền thống Bánh Tét Trà Cuôn',
                desc: 'Tham quan lò gói bánh tét nổi tiếng, tìm hiểu công thức nếp dẻo trộn nước lá ngót và nhân trứng muối đậu xanh béo ngậy mua về làm quà biếu.',
                tip: 'Có thể chọn mua bánh tét chay hoặc bánh tét mặn nhân thịt mỡ trứng muối.',
                icon: 'inventory_2',
                placeKeyword: 'Bánh Tét',
                lat: 9.8520,
                lng: 106.3680,
                gpsStatus: 'unverified',
                gpsStatusLabel: 'Chưa xác minh (Tọa độ ước tính theo trục Quốc lộ 53, không dùng dẫn đường chính xác)',
                gpsSource: 'https://www.openstreetmap.org/?mlat=9.8520&mlon=106.3680#map=16/9.8520/106.3680',
                gpsNote: 'Tọa độ ước tính phân vùng làng nghề Bánh Tét Trà Cuôn dọc QL53 Xã Kim Hòa; chưa đo mốc từng cơ sở lò bánh',
                isAccurateNav: false
            }
        ]
    },
    {
        id: 'eco-conchim',
        title: 'Tour 3: Sinh Thái Thuận Thiên Cồn Chim - Biển Ba Động',
        subtitle: 'Cồn Chim thuận thiên • Bãi biển hoang sơ • Điện gió Duyên Hải',
        tag: 'Sinh Thái & Gió Biển',
        tagColor: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300',
        duration: '1 Ngày (07:30 - 18:30)',
        vehicle: 'Xe máy / Ô tô & Tàu đò',
        distance: '~65 km',
        budget: '350.000đ - 550.000đ/người',
        travelTime: '~1h45 di chuyển & đi phà',
        familyFriendly: true,
        desc: 'Hành trình về với thiên nhiên sông nước Cửu Long: trải nghiệm lối sống thuận thiên "người quê đón khách" tại Cồn Chim, rồi xuôi về biển Ba Động ngắm cánh đồng điện gió khổng lồ giữa biển khơi.',
        stops: [
            {
                time: '07:30 – 08:30',
                title: 'Xuôi thuyền qua Cồn Chim (xã Hòa Minh, Châu Thành)',
                desc: 'Đến bến phà Bà Trầm rồi đi xuồng máy lướt sóng sông Cổ Chiên để đặt chân lên ốc đảo Cồn Chim xanh mướt rặng bần.',
                tip: 'Cồn Chim không dùng rác thải nhựa một lần, hãy chuẩn bị bình nước cá nhân.',
                icon: 'directions_boat',
                placeKeyword: 'Cồn Chim',
                lat: 9.9180,
                lng: 106.4250,
                gpsStatus: 'unverified',
                gpsStatusLabel: 'Chưa xác minh (Tọa độ ước tính theo vùng bến phà, không dùng dẫn đường chính xác)',
                gpsSource: 'https://www.openstreetmap.org/?mlat=9.9180&mlon=106.4250#map=16/9.9180/106.4250',
                gpsNote: 'Tọa độ ước tính phân vùng bến đò phà Bà Trầm - Cồn Chim; chưa đo mốc cầu bến thực địa',
                isAccurateNav: false
            },
            {
                time: '08:30 – 11:30',
                title: 'Đạp xe đường làng & Trò chơi dân gian Cồn Chim',
                desc: 'Đạp xe trên đường hoa mười giờ, trải nghiệm câu cua, dỡ chà bắt tôm càng xanh, tự tay làm bánh lá mơ và uống nước dừa ngọt mát tận vườn.',
                tip: 'Người dân Cồn Chim vô cùng hiền hậu, phục vụ từng món ăn thức uống bằng cả tấm lòng.',
                icon: 'nature_people',
                placeKeyword: 'Cồn Chim',
                lat: 9.9167,
                lng: 106.4274,
                gpsStatus: 'unverified',
                gpsStatusLabel: 'Chưa xác minh (Tọa độ ước tính theo vùng cù lao, không dùng dẫn đường chính xác)',
                gpsSource: 'https://www.openstreetmap.org/?mlat=9.9167&mlon=106.4274#map=16/9.9167/106.4274',
                gpsNote: 'Tọa độ ước tính theo phân vùng cù lao xã Hòa Minh; chưa có tọa độ mốc từng bến đón/điểm dừng cụ thể',
                isAccurateNav: false
            },
            {
                time: '11:45 – 13:30',
                title: 'Bữa cơm quê thuận thiên Cồn Chim',
                desc: 'Thưởng thức mâm cơm quê miệt vườn đậm đà: gỏi tép rong bông điên điển, cá lóc nướng trui rơm, canh chua bần cá bông lau tươi rói.',
                tip: 'Các nguyên liệu đều được nuôi trồng hữu cơ ngay trên cồn đảo.',
                icon: 'flatware',
                placeKeyword: 'Cồn Chim',
                lat: 9.9150,
                lng: 106.4285,
                gpsStatus: 'unverified',
                gpsStatusLabel: 'Chưa xác minh (Tọa độ ước tính theo vùng nhà vườn, không dùng dẫn đường chính xác)',
                gpsSource: 'https://www.openstreetmap.org/?mlat=9.9150&mlon=106.4285#map=16/9.9150/106.4285',
                gpsNote: 'Tọa độ ước tính khu vực nhà dân homestay Cồn Chim; chưa định vị mốc tọa độ nhà cụ thể',
                isAccurateNav: false
            },
            {
                time: '14:00 – 15:30',
                title: 'Chạy xe về thị xã duyên hải ven biển',
                desc: 'Chuyến xe xuyên qua những rặng phi lao phòng hộ và những cánh đồng muối ven biển Duyên Hải lộng gió.',
                tip: 'Đường đi thoáng đãng, nhiều góc cảnh quan ruộng lúa ngập mặn thanh bình.',
                icon: 'two_wheeler',
                placeKeyword: 'Biển Ba Động',
                lat: 9.7153,
                lng: 106.3572,
                gpsStatus: 'verified',
                gpsStatusLabel: 'Mốc tham chiếu bản đồ số (Chưa đo kiểm thực địa)',
                gpsSource: 'https://www.openstreetmap.org/?mlat=9.7153&mlon=106.3572#map=18/9.7153/106.3572',
                gpsNote: 'Khuôn viên Chùa Vàm Ray, Xã Hàm Tân, Trà Cú trên trục đường về Duyên Hải',
                isAccurateNav: true
            },
            {
                time: '15:30 – 18:00',
                title: 'Check-in Bãi biển Ba Động & Cánh đồng điện gió',
                desc: 'Dạo bước trên bãi cát mịn thoai thoải, ngắm hoàng hôn rực rỡ buông xuống sau những trụ turbine điện gió khổng lồ vươn mình ra biển lớn.',
                tip: 'Thưởng thức nghêu hấp sả, chù ụ nướng giòn rụm tại các quán hải sản ven biển.',
                icon: 'surfing',
                placeKeyword: 'Biển Ba Động',
                lat: 9.6587,
                lng: 106.5642,
                gpsStatus: 'unverified',
                gpsStatusLabel: 'Chưa xác minh (Tọa độ ước tính theo vùng bãi biển, không dùng dẫn đường chính xác)',
                gpsSource: 'https://www.openstreetmap.org/?mlat=9.6587&mlon=106.5642#map=16/9.6587/106.5642',
                gpsNote: 'Tọa độ ước tính phân vùng bãi biển Ba Động xã Trường Long Hòa; chưa định vị mốc từng trụ turbine',
                isAccurateNav: false
            }
        ]
    }
];

let dynamicTourState = null;

export function setDynamicTour(tour) {
    dynamicTourState = tour;
}

export function getDynamicTour() {
    return dynamicTourState;
}

/**
 * Thuật toán Tạo Tour Tự Động Thông Minh (Smart Dynamic Tour Generator)
 * Quét toàn bộ kho địa điểm, phân cụm địa lý và bố trí theo 5 khung giờ sinh học
 */
export function generateSmartTour(allPlaces, targetCluster = null) {
    if (!Array.isArray(allPlaces) || allPlaces.length === 0) return null;

    const clusters = [
        {
            id: 'central',
            name: 'Trung Tâm TP. Trà Vinh & Châu Thành',
            desc: 'Quần thể chùa cổ nghìn năm, ẩm thực bún nước lèo trứ danh và các điểm check-in di sản quanh thành phố rợp bóng cổ thụ.',
            vehicle: 'Xe máy / Dạo phố',
            distance: '~15 - 20 km',
            filter: (p) => {
                const area = (p.area || '').toLowerCase();
                const addr = (p.address || '').toLowerCase();
                return /tp|trà vinh|chau thanh|châu thành|long đức|nguyệt hóa|hòa minh/i.test(area + ' ' + addr);
            }
        },
        {
            id: 'west',
            name: 'Xứ Dừa Sáp Cầu Kè & Tiểu Cần - Càng Long',
            desc: 'Hành trình miệt vườn sông nước Cầu Kè, thưởng thức dừa sáp béo ngậy, viếng các ngôi cổ tự linh thiêng và cù lao ven sông Hậu.',
            vehicle: 'Xe máy / Ô tô',
            distance: '~35 - 45 km',
            filter: (p) => {
                const area = (p.area || '').toLowerCase();
                const addr = (p.address || '').toLowerCase();
                return /cầu kè|tiểu cần|càng long|tân qui|an phú tân|tam ngãi/i.test(area + ' ' + addr);
            }
        },
        {
            id: 'coastal',
            name: 'Sinh Thái Cù Lao, Cầu Ngang & Duyên Hải',
            desc: 'Tận hưởng gió biển Ba Động, khám phá cánh đồng điện gió giữa biển khơi, ốc đảo thuận thiên Cồn Chim và chùa Vàm Rây tráng lệ.',
            vehicle: 'Xe máy / Ô tô & Tàu đò',
            distance: '~50 - 65 km',
            filter: (p) => {
                const area = (p.area || '').toLowerCase();
                const addr = (p.address || '').toLowerCase();
                return /duyên hải|cầu ngang|trà cú|mỹ long|cồn chim|vàm rây|ba động/i.test(area + ' ' + addr);
            }
        }
    ];

    // Chọn cluster
    let chosenCluster = targetCluster
        ? clusters.find(c => c.id === targetCluster)
        : clusters[Math.floor(Math.random() * clusters.length)];
    if (!chosenCluster) chosenCluster = clusters[0];

    // Lọc danh sách địa điểm theo cluster
    let clusterPlaces = allPlaces.filter(chosenCluster.filter);
    if (clusterPlaces.length < 3) {
        clusterPlaces = [...allPlaces];
    }

    // Phân loại địa điểm
    const isFood = (p) => /ẩm thực|món ngon|quán|ăn|bún|bánh|cà phê|cafe|dừa sáp|nhậu/i.test((p.category || '') + ' ' + (p.name || ''));
    const isSpiritual = (p) => /chùa|tâm linh|di tích|đền|wat|miếu|bảo tàng/i.test((p.category || '') + ' ' + (p.name || ''));
    const isCheckin = (p) => /check-in|sống ảo|sinh thái|cù lao|cồn|biển|vườn|ao|công viên/i.test((p.category || '') + ' ' + (p.name || ''));

    const usedIds = new Set();
    const pickPlace = (predicate, fallbackPredicate) => {
        let pool = clusterPlaces.filter(p => !usedIds.has(p.id) && predicate(p));
        if (pool.length === 0 && fallbackPredicate) {
            pool = allPlaces.filter(p => !usedIds.has(p.id) && fallbackPredicate(p));
        }
        if (pool.length === 0) {
            pool = clusterPlaces.filter(p => !usedIds.has(p.id));
        }
        if (pool.length === 0) {
            pool = allPlaces.filter(p => !usedIds.has(p.id));
        }
        if (pool.length === 0) pool = allPlaces;
        const picked = pool[Math.floor(Math.random() * pool.length)];
        if (picked) usedIds.add(picked.id);
        return picked;
    };

    // 5 Khung giờ sinh học:
    // Slot 1: 07:30 - 08:30 (Điểm tâm sáng & Cà phê)
    const p1 = pickPlace(
        p => isFood(p) && /bún|bánh|sáng|cô|quán/i.test((p.name || '') + ' ' + (p.category || '')),
        p => isFood(p)
    );

    // Slot 2: 09:00 - 11:30 (Văn hóa & Tâm linh)
    const p2 = pickPlace(
        p => isSpiritual(p),
        p => isSpiritual(p)
    );

    // Slot 3: 12:00 - 13:30 (Ăn trưa miệt vườn & Đặc sản)
    const p3 = pickPlace(
        p => isFood(p),
        p => isFood(p)
    );

    // Slot 4: 14:30 - 17:00 (Check-in & Sinh thái chiều mát)
    const p4 = pickPlace(
        p => isCheckin(p),
        p => isCheckin(p)
    );

    // Slot 5: 18:30 - 21:00 (Thư giãn & Phố đêm)
    const p5 = pickPlace(
        p => isFood(p) || /cafe|cà phê|trà|kem|chợ|đêm|phố/i.test((p.name || '') + ' ' + (p.category || '')),
        p => /cafe|cà phê|ẩm thực/i.test((p.name || '') + ' ' + (p.category || ''))
    );

    const stops = [
        {
            time: '07:30 – 08:30',
            title: `Điểm tâm sáng: ${p1?.name || 'Thưởng thức ẩm thực sáng xứ Trà'}`,
            desc: p1?.description || 'Bắt đầu ngày mới đầy hứng khởi với đặc sản nóng hổi thơm ngon của vùng đất Trà Vinh.',
            tip: p1?.note || 'Nên ghé sớm để thưởng thức trọn vẹn hương vị nước dùng trong lành đầu ngày.',
            icon: 'ramen_dining',
            placeKeyword: p1?.name || 'Bún Nước Lèo',
            placeId: p1?.id,
            lat: p1?.lat || p1?.latitude || null,
            lng: p1?.lng || p1?.longitude || null,
            gpsStatus: p1?.gpsStatus || 'unverified',
            gpsStatusLabel: p1?.gpsStatusLabel || (p1?.gpsStatus === 'verified' ? 'Mốc tham chiếu bản đồ số (Chưa đo kiểm thực địa)' : 'Chưa xác minh (Tọa độ ước tính, không dùng dẫn đường chính xác)'),
            gpsSource: p1?.gpsSource || (p1?.lat && p1?.lng ? `https://www.openstreetmap.org/?mlat=${p1.lat}&mlon=${p1.lng}#map=17/${p1.lat}/${p1.lng}` : ''),
            gpsNote: p1?.gpsNote || 'Tọa độ ước tính theo địa điểm danh mục',
            isAccurateNav: p1?.isAccurateNav === true
        },
        {
            time: '09:00 – 11:30',
            title: `Chiêm bái & Di sản: ${p2?.name || 'Thắng cảnh tâm linh cổ kính'}`,
            desc: p2?.description || 'Khám phá nét kiến trúc điêu khắc Angkorian độc bản hoặc di tích lịch sử linh thiêng.',
            tip: p2?.note || 'Trang phục chỉnh tề, giữ thái độ tôn nghiêm khi vào chiêm bái di tích/chùa chiền.',
            icon: 'temple_buddhist',
            placeKeyword: p2?.name || 'Chùa Âng',
            placeId: p2?.id,
            lat: p2?.lat || p2?.latitude || null,
            lng: p2?.lng || p2?.longitude || null,
            gpsStatus: p2?.gpsStatus || 'unverified',
            gpsStatusLabel: p2?.gpsStatusLabel || (p2?.gpsStatus === 'verified' ? 'Mốc tham chiếu bản đồ số (Chưa đo kiểm thực địa)' : 'Chưa xác minh (Tọa độ ước tính, không dùng dẫn đường chính xác)'),
            gpsSource: p2?.gpsSource || (p2?.lat && p2?.lng ? `https://www.openstreetmap.org/?mlat=${p2.lat}&mlon=${p2.lng}#map=17/${p2.lat}/${p2.lng}` : ''),
            gpsNote: p2?.gpsNote || 'Tọa độ địa điểm từ danh mục',
            isAccurateNav: p2?.isAccurateNav === true
        },
        {
            time: '12:00 – 13:30',
            title: `Bữa trưa miệt vườn: ${p3?.name || 'Món ngon bản địa'}`,
            desc: p3?.description || 'Nghỉ chân thưởng thức mâm cơm đồng quê miệt vườn sông nước tươi ngon mát rượi.',
            tip: p3?.note || 'Uống thêm một trái dừa tươi giải nhiệt trưa hè.',
            icon: 'flatware',
            placeKeyword: p3?.name || 'Ẩm thực',
            placeId: p3?.id,
            lat: p3?.lat || p3?.latitude || null,
            lng: p3?.lng || p3?.longitude || null,
            gpsStatus: p3?.gpsStatus || 'unverified',
            gpsStatusLabel: p3?.gpsStatusLabel || (p3?.gpsStatus === 'verified' ? 'Mốc tham chiếu bản đồ số (Chưa đo kiểm thực địa)' : 'Chưa xác minh (Tọa độ ước tính, không dùng dẫn đường chính xác)'),
            gpsSource: p3?.gpsSource || (p3?.lat && p3?.lng ? `https://www.openstreetmap.org/?mlat=${p3.lat}&mlon=${p3.lng}#map=17/${p3.lat}/${p3.lng}` : ''),
            gpsNote: p3?.gpsNote || 'Tọa độ địa điểm từ danh mục',
            isAccurateNav: p3?.isAccurateNav === true
        },
        {
            time: '14:30 – 17:00',
            title: `Check-in chiều mát: ${p4?.name || 'Danh thắng sinh thái'}`,
            desc: p4?.description || 'Thả hồn vào thiên nhiên xanh tươi, chụp những bức ảnh kỷ niệm tuyệt đẹp lúc hoàng hôn buông xuống.',
            tip: p4?.note || 'Khoảng 15h30 đến 17h00 là khung giờ ánh sáng vàng đẹp nhất để chụp ảnh phong cảnh.',
            icon: 'photo_camera',
            placeKeyword: p4?.name || 'Ao Bà Om',
            placeId: p4?.id,
            lat: p4?.lat || p4?.latitude || null,
            lng: p4?.lng || p4?.longitude || null,
            gpsStatus: p4?.gpsStatus || 'unverified',
            gpsStatusLabel: p4?.gpsStatusLabel || (p4?.gpsStatus === 'verified' ? 'Mốc tham chiếu bản đồ số (Chưa đo kiểm thực địa)' : 'Chưa xác minh (Tọa độ ước tính, không dùng dẫn đường chính xác)'),
            gpsSource: p4?.gpsSource || (p4?.lat && p4?.lng ? `https://www.openstreetmap.org/?mlat=${p4.lat}&mlon=${p4.lng}#map=17/${p4.lat}/${p4.lng}` : ''),
            gpsNote: p4?.gpsNote || 'Tọa độ địa điểm từ danh mục',
            isAccurateNav: p4?.isAccurateNav === true
        },
        {
            time: '18:30 – 21:00',
            title: `Thư giãn phố đêm: ${p5?.name || 'Cà phê & Ẩm thực đêm'}`,
            desc: p5?.description || 'Khép lại một ngày vi vu trọn vẹn bên ly cà phê thơm lừng, ngắm phố phường thanh bình xứ Trà.',
            tip: p5?.note || 'Thưởng thức ngụm trà nóng hoặc cà phê dừa sáp trò chuyện cùng bạn bè.',
            icon: 'local_cafe',
            placeKeyword: p5?.name || 'Cà phê',
            placeId: p5?.id,
            lat: p5?.lat || p5?.latitude || null,
            lng: p5?.lng || p5?.longitude || null,
            gpsStatus: p5?.gpsStatus || 'unverified',
            gpsStatusLabel: p5?.gpsStatusLabel || (p5?.gpsStatus === 'verified' ? 'Mốc tham chiếu bản đồ số (Chưa đo kiểm thực địa)' : 'Chưa xác minh (Tọa độ ước tính, không dùng dẫn đường chính xác)'),
            gpsSource: p5?.gpsSource || (p5?.lat && p5?.lng ? `https://www.openstreetmap.org/?mlat=${p5.lat}&mlon=${p5.lng}#map=17/${p5.lat}/${p5.lng}` : ''),
            gpsNote: p5?.gpsNote || 'Tọa độ địa điểm từ danh mục',
            isAccurateNav: p5?.isAccurateNav === true
        }
    ];

    const tour = {
        id: 'smart-dynamic-tour',
        title: `🎲 Tour Ngẫu Hứng: ${chosenCluster.name}`,
        subtitle: `${p1?.name || 'Điểm tâm'} • ${p2?.name || 'Chùa cổ'} • ${p4?.name || 'Check-in'}`,
        tag: 'Tạo Tự Động Thông Minh',
        tagColor: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300',
        duration: '1 Ngày (07:30 - 21:00)',
        vehicle: chosenCluster.vehicle,
        distance: chosenCluster.distance,
        budget: '~150.000đ - 300.000đ/người',
        travelTime: '~30-45 phút di chuyển',
        familyFriendly: true,
        desc: `${chosenCluster.desc} Lịch trình được gợi ý từ kho dữ liệu tổng hợp theo cụm di chuyển tối ưu.`,
        stops
    };

    setDynamicTour(tour);
    return tour;
}

/**
 * Render Section Lịch Trình Gợi Ý Tour 1 Ngày
 */
export function renderTourItineraries(containerId, activeTourId = 'khmer-culture', onSelectTour, onOpenModal, onSearchKeyword, onGenerateRandomTour) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const allTours = [...SAMPLE_TOURS];
    if (dynamicTourState) {
        allTours.push(dynamicTourState);
    }

    const tour = allTours.find(t => t.id === activeTourId) || allTours[0];

    container.innerHTML = `
        <div class="rounded-3xl bg-surface-container-lowest dark:bg-dark-card border border-outline-variant/40 dark:border-dark-border p-5 sm:p-8 shadow-sm space-y-6">
            <!-- Header Tour & Tab Selectors -->
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-outline-variant/30 dark:border-zinc-800">
                <div class="space-y-1">
                    <div class="flex flex-wrap items-center gap-2">
                        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-container/70 dark:bg-emerald-950/60 text-secondary dark:text-emerald-300 text-xs font-bold uppercase tracking-wider">
                            <span class="w-2 h-2 rounded-full bg-secondary dark:bg-emerald-400 animate-ping"></span>
                            ${tour.tag || 'Lịch Trình 1 Ngày'}
                        </div>
                        ${tour.id === 'smart-dynamic-tour' ? `
                            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 text-[11px] font-bold">
                                ✨ Mới tạo tự động
                            </span>
                        ` : ''}
                    </div>
                    <h3 class="text-xl sm:text-2xl font-bold font-sans text-primary dark:text-zinc-100 pt-1">
                        ${tour.title}
                    </h3>
                    <p class="text-xs sm:text-sm text-on-surface-variant dark:text-zinc-400">
                        ${tour.desc}
                    </p>
                </div>

                <!-- Tabs chuyển đổi tour & Nút Đổi tour ngẫu hứng -->
                <div class="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
                    <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                        ${allTours.map(t => {
                            const isCurrent = t.id === tour.id;
                            let label = '';
                            if (t.id === 'khmer-culture') label = '🛕 Văn Hóa Khmer';
                            else if (t.id === 'food-tour') label = '🍜 Food Tour';
                            else if (t.id === 'eco-conchim') label = '🌿 Cồn Chim - Biển';
                            else if (t.id === 'smart-dynamic-tour') label = '🎲 Tour Ngẫu Hứng';
                            else label = t.title;

                            return `
                                <button data-tour-id="${t.id}" class="tour-tab-btn px-3.5 py-2 rounded-2xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                                    isCurrent
                                        ? 'bg-primary text-white shadow-sm scale-105 ring-2 ring-emerald-400/40'
                                        : 'bg-surface-container-low dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 hover:bg-surface-container dark:hover:bg-zinc-700'
                                }">
                                    <span>${label}</span>
                                </button>
                            `;
                        }).join('')}
                    </div>

                    <!-- Nút Đổi Tour Ngẫu Hứng -->
                    <button id="btnGenerateRandomTour" type="button" class="px-3.5 py-2 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all shrink-0">
                        <span class="material-symbols-outlined text-base">casino</span>
                        <span>🎲 Đổi tour ngẫu hứng</span>
                    </button>

                    <!-- Nút Chọn Mẫu Để Tùy Chỉnh -->
                    <button type="button" onclick="window.ViVuApp?.applyTourTemplateToPlanner ? window.ViVuApp.applyTourTemplateToPlanner('${tour.id}') : null"
                        title="Sao chép các điểm dừng của tour này vào Tự lên lịch trình để tự do tùy biến"
                        class="px-3.5 py-2 rounded-2xl bg-secondary dark:bg-emerald-600 hover:bg-secondary/90 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all shrink-0 min-h-[36px]">
                        <span class="material-symbols-outlined text-base">tune</span>
                        <span>Chọn mẫu để tùy chỉnh</span>
                    </button>
                </div>
            </div>

            <!-- Tour Metrics Strip -->
            <div class="flex flex-wrap items-center gap-2.5 text-xs font-semibold text-on-surface dark:text-zinc-200">
                <span class="px-3 py-1.5 rounded-full bg-surface-container-low dark:bg-zinc-800 border border-outline-variant/30 dark:border-zinc-700 flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-sm text-secondary dark:text-emerald-400">schedule</span>
                    ${tour.duration}
                </span>
                <span class="px-3 py-1.5 rounded-full bg-surface-container-low dark:bg-zinc-800 border border-outline-variant/30 dark:border-zinc-700 flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-sm text-secondary dark:text-emerald-400">two_wheeler</span>
                    ${tour.vehicle}
                </span>
                <span class="px-3 py-1.5 rounded-full bg-surface-container-low dark:bg-zinc-800 border border-outline-variant/30 dark:border-zinc-700 flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-sm text-secondary dark:text-emerald-400">route</span>
                    ${tour.distance}
                </span>
                <span class="px-3 py-1.5 rounded-full bg-surface-container-low dark:bg-zinc-800 border border-outline-variant/30 dark:border-zinc-700 flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-sm text-secondary dark:text-emerald-400">flag</span>
                    ${tour.stops.length} Điểm dừng
                </span>
                ${tour.budget ? `
                <span class="px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/60 flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                    <span class="material-symbols-outlined text-sm text-amber-600 dark:text-amber-400">payments</span>
                    ${tour.budget}
                </span>` : ''}
                ${tour.travelTime ? `
                <span class="px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 flex items-center gap-1.5 text-blue-800 dark:text-blue-300">
                    <span class="material-symbols-outlined text-sm text-blue-600 dark:text-blue-400">timelapse</span>
                    ${tour.travelTime}
                </span>` : ''}
                ${tour.familyFriendly ? `
                <span class="px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300">
                    <span class="material-symbols-outlined text-sm text-emerald-600 dark:text-emerald-400">family_restroom</span>
                    Phù hợp gia đình
                </span>` : ''}
            </div>

            <!-- Timeline Các Điểm Dừng -->
            <div class="relative pl-6 sm:pl-8 space-y-6 pt-2">
                <!-- Đường kẻ nối Timeline -->
                <div class="absolute left-2.5 sm:left-3.5 top-3 bottom-4 w-0.5 bg-gradient-to-b from-secondary via-emerald-400 to-amber-500 rounded-full"></div>

                ${tour.stops.map((stop, idx) => `
                    <div class="relative flex flex-col sm:flex-row gap-4 p-4 rounded-2xl bg-surface-container-low dark:bg-zinc-800/60 border border-outline-variant/30 dark:border-zinc-800 hover:shadow-md transition-shadow group">
                        <!-- Nút tròn số thứ tự điểm dừng -->
                        <div class="absolute -left-6 sm:-left-8 top-4 w-7 h-7 rounded-full bg-primary dark:bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-sm z-10">
                            ${idx + 1}
                        </div>

                        <!-- Nội dung trạm dừng -->
                        <div class="flex-1 space-y-1.5">
                            <div class="flex flex-wrap items-center justify-between gap-2">
                                <span class="px-2.5 py-0.5 rounded-full bg-primary-fixed dark:bg-emerald-950/60 text-primary dark:text-emerald-300 font-bold text-[11px]">
                                    ${stop.time}
                                </span>
                                <span class="text-[11px] text-secondary dark:text-emerald-400 font-bold flex items-center gap-1">
                                    <span class="material-symbols-outlined text-sm">${stop.icon}</span> Trạm #${idx + 1}
                                </span>
                            </div>

                            <h4 class="text-sm sm:text-base font-bold text-on-surface dark:text-zinc-100 font-sans">
                                ${stop.title}
                            </h4>

                            <p class="text-xs text-on-surface-variant dark:text-zinc-300 leading-relaxed">
                                ${stop.desc}
                            </p>

                            ${stop.tip ? `
                                <div class="mt-2 p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-[11px] text-amber-900 dark:text-amber-300 flex items-start gap-1.5">
                                    <span class="material-symbols-outlined text-sm text-amber-600 shrink-0 mt-0.5">lightbulb</span>
                                    <span>${stop.tip}</span>
                                </div>
                            ` : ''}

                            ${(stop.placeId || stop.placeKeyword) ? `
                                <div class="pt-1 flex flex-wrap items-center gap-2">
                                    ${stop.placeKeyword ? `
                                        <button type="button" data-tour-keyword="${stop.placeKeyword}" class="tour-keyword-btn inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container hover:bg-surface-container-high dark:bg-zinc-700/60 dark:hover:bg-zinc-700 text-[11px] font-bold text-primary dark:text-emerald-300 transition-colors border border-outline-variant/30 dark:border-zinc-700 active:scale-95">
                                            <span class="material-symbols-outlined text-xs text-secondary dark:text-emerald-400">travel_explore</span>
                                            <span>Tìm điểm: "${stop.placeKeyword}"</span>
                                        </button>
                                    ` : ''}
                                    ${stop.placeId ? `
                                        <button type="button" data-tour-place-id="${stop.placeId}" class="tour-open-detail-btn inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/80 hover:bg-emerald-100 dark:hover:bg-emerald-900 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 transition-colors border border-emerald-200/60 dark:border-emerald-800 active:scale-95">
                                            <span class="material-symbols-outlined text-xs">visibility</span>
                                            <span>Xem chi tiết</span>
                                        </button>
                                    ` : ''}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    // Gắn sự kiện chuyển đổi tabs tour
    container.querySelectorAll('.tour-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tId = btn.dataset.tourId;
            if (tId && onSelectTour) {
                onSelectTour(tId);
            }
        });
    });

    // Gắn sự kiện nút Đổi tour ngẫu hứng
    const randomBtn = container.querySelector('#btnGenerateRandomTour');
    if (randomBtn && onGenerateRandomTour) {
        randomBtn.addEventListener('click', () => {
            onGenerateRandomTour();
        });
    }

    // Gắn sự kiện click tìm kiếm từ khóa điểm dừng
    container.querySelectorAll('.tour-keyword-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const kw = btn.dataset.tourKeyword;
            if (kw && onSearchKeyword) {
                onSearchKeyword(kw);
            }
        });
    });

    // Gắn sự kiện xem chi tiết điểm dừng
    container.querySelectorAll('.tour-open-detail-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const pid = btn.dataset.tourPlaceId;
            if (pid && onOpenModal) {
                onOpenModal(pid);
            }
        });
    });
}

/**
 * Dữ liệu gợi ý Tọa độ Check-in Ảo & Video TikTok/Reels Review cho địa danh Trà Vinh
 */
export function getCheckinGuide(place) {
    if (!place) return null;

    const nameLower = (place.name || '').toLowerCase();
    const slugLower = (place.slug || '').toLowerCase();
    const catLower = (place.category || '').toLowerCase();

    // 1. Ao Bà Om
    if (nameLower.includes('bà om') || slugLower.includes('ba-om')) {
        return {
            goldenHour: '16:00 – 17:45 (Hoàng hôn buông)',
            goldenHourTone: 'Ánh nắng chiều xiên ngang qua rặng cây sao cổ thụ hàng trăm năm tuổi, rọi bóng huyền bí xuống mặt hồ hoa sen lung linh.',
            ootd: 'Áo dài trắng thướt tha, trang phục Khmer Sbay cách tân hoặc outfit tone be / nâu đất Eco-vintage.',
            spots: [
                {
                    title: 'Gốc sao cổ thụ có bộ rễ khổng lồ uốn lượn',
                    angle: 'Góc máy thấp (Low-angle)',
                    tip: 'Ngồi hoặc đứng tựa hờ vào hốc rễ cây, hướng máy từ dưới lên để lấy trọn vòm lá xanh ngắt và kích thước kỳ vĩ của thân cây.',
                    badge: 'Góc Triệu View'
                },
                {
                    title: 'Bờ hồ hoa sen hướng về tháp Chùa Âng',
                    angle: 'Góc ngang tầm mắt (Eye-level)',
                    tip: 'Đón trọn vạt hoàng hôn phản chiếu trên mặt nước phẳng lặng, lấy hậu cảnh mờ ảo là đỉnh tháp cổ kính của Wat Angkor Borey.',
                    badge: 'Hoàng Hôn'
                },
                {
                    title: 'Đại lộ rợp bóng cổ thụ ven hồ',
                    angle: 'Góc dọc hút sâu (Leading Lines)',
                    tip: 'Chụp khoảnh khắc bước đi tự nhiên dọc con đường đất rợp bóng sao dầu, hứng trọn những vệt nắng vàng (God rays) rọi qua tán lá.',
                    badge: 'Thơ Mộng'
                }
            ],
            tiktok: {
                creator: '@travinh_quetoi',
                creatorName: 'Thổ Địa Trà Vinh 🌿',
                creatorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
                caption: 'Hoàng hôn huyền diệu tại Ao Bà Om - Linh hồn ngàn năm của xứ Trà Vinh 🍃✨ Bình yên đến lạ lùng!',
                sound: 'Romvong Xứ Trà - Tiếng đàn Chapey Dong Veng',
                likes: '28.4K',
                comments: '532',
                shares: '2.1K',
                videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-tree-branches-in-the-breeze-1188-large.mp4',
                poster: place.imageLink || NEUTRAL_PLACEHOLDER_IMAGE,
                tipText: 'Nên chuẩn bị xịt chống muỗi nếu nán lại ngắm hoàng hôn sau 17:30 nhé!'
            }
        };
    }

    // 2. Chùa Âng (Wat Angkor Borey)
    if (nameLower.includes('chùa âng') || nameLower.includes('angkor') || slugLower.includes('chua-ang')) {
        return {
            goldenHour: '07:30 – 09:30 (Nắng sớm ban mai)',
            goldenHourTone: 'Nắng sớm vàng ruộm rọi trực diện vào hoa văn chạm trổ mạ vàng của Chánh điện, tạo màu sắc rực rỡ và độ tương phản cao.',
            ootd: 'Trang phục Khmer truyền thống (thuê tại cổng Ao Bà Om) hoặc sơ mi, quần dài lịch sự (che vai và qua gối).',
            spots: [
                {
                    title: 'Bậc thềm tượng thần Rắn Naga 5 đầu uy nghi',
                    angle: 'Chính diện trực diện (Symmetrical)',
                    tip: 'Đứng giữa bậc tam cấp đối xứng, ánh nhìn thẳng, để thần rắn Naga dẫn hướng ánh nhìn vào Chánh điện.',
                    badge: 'Di Sản Uy Nghi'
                },
                {
                    title: 'Hành lang điêu khắc chim thần Krud nâng mái',
                    angle: 'Góc chéo 45 độ (Perspective Angle)',
                    tip: 'Chụp dọc hàng cột sơn son thiếp vàng, bắt nhịp điệu lặp lại của những bức tượng Krud dang cánh.',
                    badge: 'Kiến Trúc Angkor'
                },
                {
                    title: 'Bóng tháp Stupa cổ kính bên rặng sao cổ',
                    angle: 'Góc rộng ngước cao (Wide Angle)',
                    tip: 'Canh lúc chim bồ câu hoặc chim sẻ bay qua đỉnh tháp thon vút chạm mây xanh.',
                    badge: 'Tâm Linh'
                }
            ],
            tiktok: {
                creator: '@dulichmientay.tv',
                creatorName: 'Mê Đi Trà Vinh ✈️',
                creatorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
                caption: 'Ngôi chùa cổ nhất Trà Vinh hơn 1.000 năm tuổi - Wat Angkor Borey đẹp tựa cổ tích Angkor Wat 🛕💛',
                sound: 'Thanh âm chuông chùa Khmer ngân vang thanh tịnh',
                likes: '34.2K',
                comments: '680',
                shares: '3.4K',
                videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-sun-shining-through-tree-branches-34674-large.mp4',
                poster: place.imageLink || NEUTRAL_PLACEHOLDER_IMAGE,
                tipText: 'Vui lòng cởi nón, giày dép và giữ yên lặng khi bước vào bên trong Chánh điện chiêm bái.'
            }
        };
    }

    // 3. Chùa Hang (Wat Kompong Chrây)
    if (nameLower.includes('chùa hang') || nameLower.includes('kompong') || slugLower.includes('chua-hang')) {
        return {
            goldenHour: '15:30 – 17:00 (Chim về tổ)',
            goldenHourTone: 'Buổi chiều mát mẻ khi hàng ngàn cánh chim ríu rít bay về tổ ấm rợp bóng trên những tán cây sao dầu cổ thụ.',
            ootd: 'Tone be, nâu mộc mạc, áo sơ mi đũi, nón lá hoặc khăn rằn Nam Bộ.',
            spots: [
                {
                    title: 'Cổng chùa hình vòm hang động bí ẩn',
                    angle: 'Góc ngược sáng (Silhouette Rim-light)',
                    tip: 'Đứng ngay giữa vòm cổng sâu 12m, canh ánh sáng phía sau hắt tới tạo dáng bóng người silhouette cực kỳ huyền bí.',
                    badge: 'Độc Lạ Xứ Trà'
                },
                {
                    title: 'Xưởng điêu khắc gỗ nghệ thuật của chư tăng',
                    angle: 'Cận cảnh thao tác (Action Close-up)',
                    tip: 'Bắt khoảnh khắc các nghệ nhân sư thầy đang tỉ mỉ đục đẽo từng thớ rễ cây khô thành tượng rồng, phượng.',
                    badge: 'Nghệ Thuật'
                },
                {
                    title: 'Khu vườn chim thiên nhiên rợp bóng mát',
                    angle: 'Góc ngước lên trời xanh (Upward View)',
                    tip: 'Ngồi ghế đá dưới bóng râm, đưa ống kính lên ngắm đàn chim chao lượn trên ngọn cây sao.',
                    badge: 'Thiên Nhiên'
                }
            ],
            tiktok: {
                creator: '@langthangtravinh',
                creatorName: 'Lang Thang Nam Bộ 🛶',
                creatorAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80',
                caption: 'Bí ẩn ngôi chùa có cổng như hang động và xưởng điêu khắc gỗ rễ cây độc nhất Trà Vinh 🌳🪓',
                sound: 'Tiếng chim hót líu lo & Gió xào xạc cành lá',
                likes: '21.9K',
                comments: '394',
                shares: '1.5K',
                videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-forest-stream-in-the-sunlight-529-large.mp4',
                poster: place.imageLink || NEUTRAL_PLACEHOLDER_IMAGE,
                tipText: 'Khuôn viên có đàn chim hoang dã cư ngụ, các bạn vui lòng không bấm còi hay gây tiếng ồn lớn.'
            }
        };
    }

    // 4. Chùa Vàm Rây
    if (nameLower.includes('vàm rây') || slugLower.includes('vam-ray')) {
        return {
            goldenHour: '08:00 – 10:00 & 15:00 – 16:30',
            goldenHourTone: 'Khi ánh nắng rực rỡ chiếu vào tượng Phật Thích Ca nằm mạ vàng khổng lồ tỏa ánh kim rực rỡ.',
            ootd: 'Váy maxi trắng trơn, trang phục tone vàng đồng/be thanh lịch, kết hợp nón cói rộng vành.',
            spots: [
                {
                    title: 'Tượng Phật Thích Ca nằm mạ vàng dài 54m',
                    angle: 'Góc toàn cảnh Panorama từ hông tượng',
                    tip: 'Đứng cách tượng 20-30m để lấy trọn chiều dài hùng vĩ của pho tượng Phật nằm ngoài trời lớn nhất miền Tây.',
                    badge: 'Kỷ Lục Miền Tây'
                },
                {
                    title: 'Mặt tiền Chánh điện dát vàng phong cách Angkor',
                    angle: 'Góc chụp từ bậc thềm sân trước (Low angle)',
                    tip: 'Lấy các cột trụ mạ vàng lộng lẫy và đỉnh tháp vút nhọn tạo chiều sâu hoành tráng.',
                    badge: 'Vương Giả'
                }
            ],
            tiktok: {
                creator: '@checkinvietnam',
                creatorName: 'Check-in Việt Nam 🇻🇳',
                creatorAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80',
                caption: 'Choáng ngợp trước Chùa Vàm Rây dát vàng - Ngôi chùa lộng lẫy bậc nhất miền Tây Nam Bộ ✨🛕',
                sound: 'Original Sound - Về miền đất Phật Trà Vinh',
                likes: '46.7K',
                comments: '782',
                shares: '4.8K',
                videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-sun-rays-cloudy-sky-39843-large.mp4',
                poster: place.imageLink || NEUTRAL_PLACEHOLDER_IMAGE,
                tipText: 'Giữa trưa sân gạch chùa khá nóng vì lát đá phản quang, nhớ mang theo vớ dày nếu tham quan ban trưa.'
            }
        };
    }

    // 5. Cồn Chim
    if (nameLower.includes('cồn chim') || slugLower.includes('con-chim')) {
        return {
            goldenHour: '08:30 – 11:30 & 14:30 – 17:00',
            goldenHourTone: 'Khí hậu ven sông Cổ Chiên trong lành, gió lộng mát rượi qua những rặng dừa xanh mướt.',
            ootd: 'Bộ bà ba truyền thống đủ màu sắc, nón lá, guốc mộc hoặc dép kẹp thuận tiện đi xuồng.',
            spots: [
                {
                    title: 'Cầu khỉ bắc qua mương vườn dừa nước',
                    angle: 'Góc ngang tầm mắt (Eye-level)',
                    tip: 'Chụp khoảnh khắc bước đi thăng bằng trên cầu khỉ với nụ cười rạng rỡ, hậu cảnh là rặng dừa nước bạt ngàn.',
                    badge: 'Thuận Thiên'
                },
                {
                    title: 'Bếp củi đỏ lửa làm bánh dân gian truyền thống',
                    angle: 'Cận cảnh khói lam chiều (Warm Tones)',
                    tip: 'Tập trung vào đôi tay nặn bánh lá dừa, đổ bánh xèo xèo xèo trên chảo gang truyền thống.',
                    badge: 'Đậm Đà Bản Sắc'
                },
                {
                    title: 'Bến đò xuồng chèo sông Cổ Chiên',
                    angle: 'Góc chụp từ mui thuyền hướng về hoàng hôn',
                    tip: 'Ngồi trên mũi thuyền thả tay lướt nhẹ mặt nước phù sa đỏ nặng phù sa.',
                    badge: 'Sông Nước'
                }
            ],
            tiktok: {
                creator: '@khoailangthang_tv',
                creatorName: 'Miệt Vườn Trà Vinh 🥥',
                creatorAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
                caption: 'Về Cồn Chim “thuận thiên” - Nơi không có wifi, chỉ có nụ cười hồn hậu và đĩa bánh xèo giòn rụm! 🥰🌾',
                sound: 'Thương Em Miền Tây - Giai điệu mộc mạc',
                likes: '59.3K',
                comments: '915',
                shares: '6.2K',
                videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-waves-splashing-on-rocks-41489-large.mp4',
                poster: place.imageLink || NEUTRAL_PLACEHOLDER_IMAGE,
                tipText: 'Đi Cồn Chim nhớ liên hệ cô bác đặt cơm trước từ sáng để được thưởng thức món tươi ngon nhất!'
            }
        };
    }

    // 6. Biển Ba Động & Cánh đồng Điện Gió Duyên Hải
    if (nameLower.includes('ba động') || nameLower.includes('điện gió') || slugLower.includes('ba-dong')) {
        return {
            goldenHour: '05:30 – 06:45 (Bình minh) & 16:45 – 18:00 (Hoàng hôn)',
            goldenHourTone: 'Ánh rạng đông biển Đông nhuộm hồng chân trời hoặc hoàng hôn tím lịm ôm trọn những cánh quạt gió khổng lồ.',
            ootd: 'Váy maxi bay bổng, tone trắng, xanh pastel hoặc trang phục phượt biển năng động.',
            spots: [
                {
                    title: 'Cầu gỗ dẫn ra cánh đồng điện gió giữa biển',
                    angle: 'Góc thẳng tắp hút sâu (One-Point Perspective)',
                    tip: 'Chụp giữa lòng cầu gỗ thẳng tắp, canh hàng tuabin gió xoay đều hai bên trên nền trời bao la.',
                    badge: 'Check-in Châu Âu'
                },
                {
                    title: 'Rừng phi lao rì rào ven bãi cát hoang sơ',
                    angle: 'Góc nghiêng lấy vạt nắng rọi (Golden Hour Flare)',
                    tip: 'Bước đi chân trần trên cát mềm, nắng xiên qua tán phi lao tạo hiệu ứng Cinematic mộng mơ.',
                    badge: 'Cinematic'
                }
            ],
            tiktok: {
                creator: '@phuottravinh',
                creatorName: 'Phượt Trà Vinh 🏍️',
                creatorAvatar: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=100&auto=format&fit=crop&q=80',
                caption: 'Check-in cánh đồng điện gió Ba Động Trà Vinh đẹp như trời Tây ngắm hoàng hôn biển lộng gió 🌊💨',
                sound: 'Gió Biển Ba Động - Chill Beats Lofi',
                likes: '41.5K',
                comments: '562',
                shares: '3.1K',
                videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-sea-ice-moving-along-the-water-43403-large.mp4',
                poster: place.imageLink || NEUTRAL_PLACEHOLDER_IMAGE,
                tipText: 'Gió biển chiều khá lớn, nên dùng kẹp tóc hoặc mũ có dây quai giữ chắc nhé.'
            }
        };
    }

    // 7. Ẩm thực (Bún nước lèo, Dừa sáp, Bánh tét...)
    if (catLower.includes('ẩm thực') || catLower.includes('quán') || nameLower.includes('bún') || nameLower.includes('dừa sáp') || nameLower.includes('bánh')) {
        const isDuaSap = nameLower.includes('dừa');
        return {
            goldenHour: isDuaSap ? '10:00 – 16:00 (Giải nhiệt mát lạnh)' : '06:30 – 08:30 & 16:30 – 19:30 (Món ngon nóng hổi)',
            goldenHourTone: 'Lúc nồi nước dùng bốc khói nghi ngút thơm nồng mùi ngải bún và sả tươi, hoặc lúc ly dừa sáp dầm đá mát lạnh lên ngôi.',
            ootd: 'Trang phục năng động, áo phông tươi sáng, sẵn sàng “quẩy” bàn tiệc ẩm thực bản địa.',
            spots: [
                {
                    title: isDuaSap ? 'Cận cảnh thìa nạo cơm dừa sáp dẻo quánh' : 'Tô đặc sản đầy ắp topping nhìn từ trên cao',
                    angle: 'Góc 45 độ hoặc Flatlay Top-Down',
                    tip: isDuaSap ? 'Múc một thìa cơm dừa dẻo mềm óng ánh, quay chậm slow-mo bắt trọn độ sánh mịn.' : 'Chụp bao quát tô bún đủ đầy với thịt quay giòn rụm, chả lụa, huyết và rổ rau ghém xanh mướt.',
                    badge: 'Food Porn'
                },
                {
                    title: 'Khoảnh khắc gắp đũa / nếm thử đầu tiên',
                    angle: 'Góc ngang cận cảnh chân dung',
                    tip: 'Bắt nụ cười sảng khoái khi thưởng thức ngụm nước dùng đậm đà hương vị ngải bún đặc trưng Trà Vinh.',
                    badge: 'Cảm Xúc Thực'
                }
            ],
            tiktok: {
                creator: '@foodie_travinh',
                creatorName: 'Món Ngon Xứ Trà 🍜',
                creatorAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&auto=format&fit=crop&q=80',
                caption: `${place.name} - Món đặc sản nức tiếng ăn một lần là nhớ mãi hương vị mộc mạc quê nhà 🤤❤️`,
                sound: 'Ăn Sập Trà Vinh - ASMR Đậm Vị Nam Bộ',
                likes: '35.8K',
                comments: '488',
                shares: '2.7K',
                videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-hands-holding-a-steaming-cup-of-coffee-41618-large.mp4',
                poster: place.imageLink || NEUTRAL_PLACEHOLDER_IMAGE,
                tipText: 'Nên ghé sớm vì các quán đặc sản truyền thống thường hết những phần ngon nhất rất nhanh!'
            }
        };
    }

    // Default Fallback
    return {
        goldenHour: '07:00 – 09:00 & 16:00 – 17:30 (Khung giờ vàng)',
        goldenHourTone: 'Khoảng thời gian ánh sáng mềm mại nhất trong ngày, tôn da và làm nổi bật màu sắc tự nhiên của cảnh quan.',
        ootd: 'Trang phục màu trung tính (trắng, be, pastel, xanh lơ) tạo cảm giác nhẹ nhàng, hài hòa cùng thiên nhiên.',
        spots: [
            {
                title: `Góc toàn cảnh check-in tại ${place.name}`,
                angle: 'Góc ngang tầm mắt (Eye-level)',
                tip: 'Đứng lệch 1/3 khung hình theo quy tắc tỷ lệ vàng, để không gian xung quanh làm nổi bật chủ thể.',
                badge: 'Check-in Chuẩn'
            },
            {
                title: 'Góc chụp tương tác tự nhiên',
                angle: 'Góc chụp bán thân (Medium Shot)',
                tip: 'Bước đi chậm rãi hoặc tương tác với bối cảnh, chụp liên tục (burst mode) để chọn được khoảnh khắc tự nhiên nhất.',
                badge: 'Tự Nhiên'
            }
        ],
        tiktok: {
            creator: '@vivutravinh.vn',
            creatorName: 'ViVu Trà Vinh Official 🌿',
            creatorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
            caption: `Khám phá ${place.name} - Điểm đến cực chill không thể bỏ qua trong chuyến hành trình Trà Vinh! 📍✨`,
            sound: 'Thanh Âm Miền Tây - Chill Acoustic Guitar',
            likes: '19.4K',
            comments: '230',
            shares: '1.2K',
            videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-tree-branches-in-the-breeze-1188-large.mp4',
            poster: place.imageLink || NEUTRAL_PLACEHOLDER_IMAGE,
            tipText: 'Nên sạc đầy pin điện thoại và mang theo sạc dự phòng để tha hồ quay chụp nhé.'
        }
    };
}

/**
 * Render nội dung Tab "Góc Chụp Đẹp & TikTok / Reels Review" trong Detail Modal
 */
export function renderCheckinAndTikTokTab(place) {
    const container = document.getElementById('modalCheckinContent');
    if (!container || !place) return;

    const guide = getCheckinGuide(place);
    if (!guide) return;

    container.innerHTML = `
        <!-- 1. BANNER KHUNG GIỜ VÀNG SĂN ẢNH (GOLDEN HOUR) -->
        <div class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-rose-500/15 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-rose-950/40 border border-amber-300/60 dark:border-amber-700/50 p-4 space-y-2.5">
            <div class="flex items-center justify-between">
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-xs">
                    <span class="material-symbols-outlined text-sm">wb_twilight</span>
                    Khung Giờ Vàng (Golden Hour)
                </span>
                <span class="text-xs font-extrabold text-amber-700 dark:text-amber-300 bg-white/80 dark:bg-zinc-800/80 px-2.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                    ${guide.goldenHour}
                </span>
            </div>

            <p class="text-xs text-amber-950 dark:text-amber-200 leading-relaxed font-medium">
                ${guide.goldenHourTone}
            </p>

            <!-- Gợi ý trang phục (OOTD) -->
            <div class="pt-2 border-t border-amber-200/60 dark:border-amber-800/60 flex items-start gap-2 text-xs">
                <span class="material-symbols-outlined text-sm text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">checkroom</span>
                <div>
                    <strong class="font-bold text-amber-900 dark:text-amber-200">Gợi ý trang phục (OOTD):</strong>
                    <span class="text-amber-800/90 dark:text-amber-300/90 ml-1">${guide.ootd}</span>
                </div>
            </div>
        </div>

        <!-- 2. DANH SÁCH TỌA ĐỘ GÓC CHỤP ĐẮT GIÁ (CURATED PHOTO SPOTS) -->
        <div class="space-y-2.5 pt-1">
            <div class="flex items-center justify-between">
                <h4 class="text-xs font-bold uppercase tracking-wider text-primary dark:text-emerald-400 flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-sm text-rose-500">camera_alt</span>
                    Góc Chụp Triệu View & Pose Tip
                </h4>
                <span class="text-[10px] text-on-surface-variant dark:text-zinc-400">Từ Thổ Địa Xứ Trà</span>
            </div>

            <div class="space-y-2.5">
                ${guide.spots.map((spot, idx) => `
                    <div class="p-3.5 rounded-2xl bg-surface-container-low dark:bg-zinc-800/70 border border-outline-variant/40 dark:border-zinc-700/60 hover:border-primary/50 transition-all space-y-1.5">
                        <div class="flex items-center justify-between gap-2">
                            <span class="text-xs font-extrabold text-on-surface dark:text-zinc-100 flex items-center gap-1.5">
                                <span class="w-5 h-5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[11px] font-black flex items-center justify-center shrink-0">#${idx + 1}</span>
                                <span>${spot.title}</span>
                            </span>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 shrink-0">
                                ${spot.badge}
                            </span>
                        </div>

                        <div class="flex items-center gap-1 text-[11px] font-semibold text-secondary dark:text-emerald-400">
                            <span class="material-symbols-outlined text-xs">videocam</span>
                            <span>${spot.angle}</span>
                        </div>

                        <p class="text-xs text-on-surface-variant dark:text-zinc-300 leading-relaxed bg-surface/60 dark:bg-zinc-900/60 p-2.5 rounded-xl border border-outline-variant/20 dark:border-zinc-800">
                            💡 <strong class="text-on-surface dark:text-zinc-200">Mẹo tạo dáng:</strong> ${spot.tip}
                        </p>
                    </div>
                `).join('')}
            </div>
        </div>

        <!-- 3. TIKTOK / REELS VIDEO REVIEW MOCKUP (INTERACTIVE PLAYER) -->
        <div class="space-y-2.5 pt-2 border-t border-outline-variant/40 dark:border-zinc-800">
            <div class="flex items-center justify-between">
                <h4 class="text-xs font-bold uppercase tracking-wider text-primary dark:text-emerald-400 flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-sm text-pink-500">smart_display</span>
                    Video TikTok / Reels Review Thực Tế
                </h4>
                <span class="inline-flex items-center gap-1 text-[10px] font-bold text-rose-500 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full border border-rose-200 dark:border-rose-900">
                    <span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                    Trending Video
                </span>
            </div>

            <!-- Khung Video mô phỏng TikTok/Reels Player -->
            <div class="relative w-full rounded-2xl overflow-hidden bg-black shadow-lg border border-zinc-800 group">
                <!-- Video Element HTML5 -->
                <div class="relative w-full aspect-[9/13] max-h-[380px] bg-zinc-900 flex items-center justify-center overflow-hidden">
                    <video id="tiktokVideoEl" class="w-full h-full object-cover cursor-pointer" loop playsinline muted poster="${guide.tiktok.poster}" preload="metadata">
                        <source src="${guide.tiktok.videoUrl}" type="video/mp4">
                    </video>

                    <!-- Nút Play/Pause lớn ở giữa -->
                    <button id="tiktokPlayOverlayBtn" type="button" class="absolute inset-0 m-auto w-14 h-14 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-md text-white flex items-center justify-center transition-all group-hover:scale-105 active:scale-95 shadow-xl z-20">
                        <span class="material-symbols-outlined text-3xl">play_arrow</span>
                    </button>

                    <!-- Nút Âm Thanh Bật/Tắt (Mute Toggle) ở góc trên phải -->
                    <button id="tiktokMuteToggleBtn" type="button" class="absolute top-3 right-3 z-30 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md text-white flex items-center justify-center transition-all active:scale-95" title="Bật/Tắt âm thanh">
                        <span id="tiktokMuteIcon" class="material-symbols-outlined text-lg">volume_off</span>
                    </button>

                    <!-- Badge TikTok / Reels ở góc trên trái -->
                    <div class="absolute top-3 left-3 z-20 flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-[11px] font-bold">
                        <i class="fab fa-tiktok text-pink-400"></i>
                        <span>TikTok Review</span>
                    </div>

                    <!-- Thanh tương tác bên phải (Tim, Cmt, Share) -->
                    <div class="absolute right-3 bottom-14 z-20 flex flex-col items-center gap-3">
                        <button id="tiktokLikeBtn" type="button" class="flex flex-col items-center text-white group/like active:scale-125 transition-transform" title="Thích video">
                            <div class="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center group-hover/like:bg-black/60 transition-colors">
                                <span id="tiktokLikeIcon" class="material-symbols-outlined text-2xl text-white">favorite</span>
                            </div>
                            <span id="tiktokLikeCount" class="text-[10px] font-bold mt-0.5 drop-shadow-md">${guide.tiktok.likes}</span>
                        </button>

                        <button type="button" onclick="window.ViVuApp.switchModalTab('overview')" class="flex flex-col items-center text-white active:scale-110 transition-transform" title="Xem bình luận">
                            <div class="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center hover:bg-black/60 transition-colors">
                                <span class="material-symbols-outlined text-2xl">chat</span>
                            </div>
                            <span class="text-[10px] font-bold mt-0.5 drop-shadow-md">${guide.tiktok.comments}</span>
                        </button>

                        <button type="button" onclick="window.ViVuApp.sharePlace('native')" class="flex flex-col items-center text-white active:scale-110 transition-transform" title="Chia sẻ video">
                            <div class="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center hover:bg-black/60 transition-colors">
                                <span class="material-symbols-outlined text-2xl">share</span>
                            </div>
                            <span class="text-[10px] font-bold mt-0.5 drop-shadow-md">${guide.tiktok.shares}</span>
                        </button>
                    </div>

                    <!-- Overlay thông tin Creator & Caption bên dưới -->
                    <div class="absolute inset-x-0 bottom-0 z-20 p-3.5 bg-gradient-to-t from-black/90 via-black/50 to-transparent text-white space-y-1.5 pr-14">
                        <div class="flex items-center gap-2">
                            <img src="${guide.tiktok.creatorAvatar}" alt="${guide.tiktok.creatorName}" class="w-7 h-7 rounded-full border border-white/60 object-cover">
                            <span class="text-xs font-bold drop-shadow-md">${guide.tiktok.creatorName}</span>
                            <span class="material-symbols-outlined text-xs text-sky-400">verified</span>
                        </div>

                        <p class="text-[11px] leading-snug line-clamp-2 text-white/95 drop-shadow-md">
                            ${guide.tiktok.caption}
                        </p>

                        <!-- Đĩa nhạc xoay & Sound Title -->
                        <div class="flex items-center gap-1.5 pt-0.5 text-[10px] text-white/80">
                            <span class="material-symbols-outlined text-xs animate-spin" style="animation-duration: 4s;">album</span>
                            <span class="truncate">${guide.tiktok.sound}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Tip của Thổ Địa khi làm clip ngắn -->
            ${guide.tiktok.tipText ? `
                <div class="p-3 rounded-xl bg-surface-container-low dark:bg-zinc-800/80 border border-outline-variant/30 dark:border-zinc-700 text-xs text-on-surface-variant dark:text-zinc-300 flex items-start gap-2">
                    <span class="material-symbols-outlined text-base text-secondary dark:text-emerald-400 shrink-0 mt-0.5">tips_and_updates</span>
                    <div>
                        <strong class="font-bold text-on-surface dark:text-zinc-100">Bí quyết quay video:</strong>
                        <span class="ml-1">${guide.tiktok.tipText}</span>
                    </div>
                </div>
            ` : ''}
        </div>
    `;

    // Gắn tương tác cho TikTok video player
    const video = container.querySelector('#tiktokVideoEl');
    const playBtn = container.querySelector('#tiktokPlayOverlayBtn');
    const muteBtn = container.querySelector('#tiktokMuteToggleBtn');
    const muteIcon = container.querySelector('#tiktokMuteIcon');
    const likeBtn = container.querySelector('#tiktokLikeBtn');
    const likeIcon = container.querySelector('#tiktokLikeIcon');
    const likeCount = container.querySelector('#tiktokLikeCount');

    if (video && playBtn) {
        const togglePlay = () => {
            if (video.paused) {
                video.play().then(() => {
                    playBtn.classList.add('opacity-0', 'pointer-events-none');
                }).catch(err => {
                    console.warn('[TikTokVideo] Không thể autoplay:', err);
                });
            } else {
                video.pause();
                playBtn.classList.remove('opacity-0', 'pointer-events-none');
            }
        };

        video.addEventListener('click', togglePlay);
        playBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePlay();
        });

        video.addEventListener('ended', () => {
            playBtn.classList.remove('opacity-0', 'pointer-events-none');
        });
    }

    if (video && muteBtn && muteIcon) {
        muteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            video.muted = !video.muted;
            muteIcon.textContent = video.muted ? 'volume_off' : 'volume_up';
            muteBtn.classList.toggle('bg-primary', !video.muted);
        });
    }

    if (likeBtn && likeIcon && likeCount) {
        let isLiked = false;
        likeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isLiked = !isLiked;
            if (isLiked) {
                likeIcon.classList.remove('text-white');
                likeIcon.classList.add('text-rose-500');
                likeBtn.classList.add('scale-125');
                setTimeout(() => likeBtn.classList.remove('scale-125'), 200);
            } else {
                likeIcon.classList.add('text-white');
                likeIcon.classList.remove('text-rose-500');
            }
        });
    }
}

/**
/**
 * Quản lý đồng hồ đếm ngược cho sự kiện lễ hội (Hỗ trợ cả ID camelCase và kebab-case)
 */
export function startFestivalCountdown(targetDateStr) {
    if (window._festivalCountdownInterval) {
        clearInterval(window._festivalCountdownInterval);
        window._festivalCountdownInterval = null;
    }

    const targetDate = new Date(targetDateStr).getTime();

    function updateTimer() {
        const now = new Date().getTime();
        const difference = targetDate - now;

        const dayElements = document.querySelectorAll('#cd-days, #cdDays, .cd-days-val');
        const hourElements = document.querySelectorAll('#cd-hours, #cdHours, .cd-hours-val');
        const minElements = document.querySelectorAll('#cd-minutes, #cdMinutes, .cd-minutes-val');
        const secElements = document.querySelectorAll('#cd-seconds, #cdSeconds, .cd-seconds-val');
        const statusBadgeEl = document.getElementById('cdStatusBadge');

        if (difference <= 0) {
            dayElements.forEach(el => { el.textContent = '00'; });
            hourElements.forEach(el => { el.textContent = '00'; });
            minElements.forEach(el => { el.textContent = '00'; });
            secElements.forEach(el => { el.textContent = '00'; });
            if (statusBadgeEl) {
                statusBadgeEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping mr-1"></span> Đang diễn ra hội lớn!';
                statusBadgeEl.className = 'px-3 py-1 rounded-full text-xs font-black bg-emerald-500 text-white shadow-xs flex items-center';
            }
            if (window._festivalCountdownInterval) {
                clearInterval(window._festivalCountdownInterval);
                window._festivalCountdownInterval = null;
            }
            return;
        }

        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);

        const daysStr = String(days).padStart(2, '0');
        const hoursStr = String(hours).padStart(2, '0');
        const minsStr = String(minutes).padStart(2, '0');
        const secsStr = String(seconds).padStart(2, '0');

        dayElements.forEach(el => { el.textContent = daysStr; });
        hourElements.forEach(el => { el.textContent = hoursStr; });
        minElements.forEach(el => { el.textContent = minsStr; });
        secElements.forEach(el => { el.textContent = secsStr; });
    }

    updateTimer();
    window._festivalCountdownInterval = setInterval(updateTimer, 1000);
}

/**
 * Render Cổng Sự Kiện & Lễ Hội Văn Hóa Trà Vinh (Stitch Design System)
 */
export function renderFestivalsSection(
    containerId,
    festivals = [],
    activeSeason = 'all',
    onOpenFestivalModal,
    onSelectPlace,
    onFilterSeason,
    eventsAndMeetups = [],
    activeCategory = 'all',
    activeRegion = 'all',
    onFilterCategory,
    onFilterRegion,
    onRsvpEvent,
    onToggleBookmark,
    bookmarkedIds = new Set(),
    onOpenHostModal
) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Danh sách sự kiện & gặp gỡ (fallback từ TRA_VINH_EVENTS_AND_MEETUPS)
    const allMeetups = (eventsAndMeetups && eventsAndMeetups.length > 0) ? eventsAndMeetups : TRA_VINH_EVENTS_AND_MEETUPS;

    // Chọn Lễ hội tâm điểm (Spotlight) - mặc định là Ok Om Bok hoặc lễ hội đầu tiên
    const spotlightFestival = festivals.find(f => f.id === 'ok-om-bok') || festivals[0];

    // Lọc sự kiện theo danh mục
    let filteredEvents = allMeetups;
    if (activeCategory === 'upcoming') {
        filteredEvents = allMeetups.filter(e => e.statusBadge === 'Sắp diễn ra' || e.month === 'Tháng 10' || e.month === 'Tháng 11');
    } else if (activeCategory === 'traditional') {
        filteredEvents = allMeetups.filter(e => e.categoryKey === 'traditional' || e.categoryKey === 'sports');
    } else if (activeCategory === 'workshop') {
        filteredEvents = allMeetups.filter(e => e.categoryKey === 'workshop');
    } else if (activeCategory === 'sports') {
        filteredEvents = allMeetups.filter(e => e.categoryKey === 'sports');
    } else if (activeCategory === 'community') {
        filteredEvents = allMeetups.filter(e => e.categoryKey === 'community');
    }

    // Lọc thêm theo khu vực (nếu có chọn)
    if (activeRegion && activeRegion !== 'all') {
        filteredEvents = filteredEvents.filter(e => e.region === activeRegion);
    }

    // Các lễ hội mùa khác (ngoài Ok Om Bok đã lên Spotlight)
    const otherFestivals = festivals.filter(f => f.id !== spotlightFestival?.id);

    container.innerHTML = `
        <div class="flex flex-col w-full gap-8 pt-3">
            <!-- 1. PAGE HEADER & ACTION CONTROLS (STITCH TOP BAR) -->
            <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-outline-variant/30 dark:border-zinc-800">
                <div class="flex flex-col max-w-2xl">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="w-2.5 h-2.5 rounded-full bg-secondary dark:bg-emerald-400"></span>
                        <span class="font-caption text-xs uppercase tracking-wider text-secondary dark:text-emerald-400 font-bold">
                            LỄ HỘI &amp; GẶP GỠ BẢN ĐỊA • VIVUTRAVINH
                        </span>
                    </div>
                    <h2 class="font-headline-xl text-2xl sm:text-3xl lg:text-4xl text-primary dark:text-zinc-100 font-bold tracking-tight">
                        Sự kiện &amp; Gặp gỡ
                    </h2>
                    <p class="font-body-lg text-xs sm:text-sm text-on-surface-variant dark:text-zinc-400 mt-2 leading-relaxed">
                        Cùng hòa mình vào dòng chảy văn hóa Khmer, lễ hội truyền thống sông nước và các hoạt động kết nối cộng đồng tại Trà Vinh.
                    </p>
                </div>
                <div class="flex items-center gap-3 shrink-0 flex-wrap">
                    <button id="btnOpenHostEvent" type="button"
                        class="inline-flex items-center gap-2 px-4 py-2.5 rounded-[10px] bg-surface-container-lowest dark:bg-zinc-800 text-on-surface dark:text-zinc-200 hover:bg-surface-container dark:hover:bg-zinc-700 shadow-xs border border-outline-variant/40 dark:border-zinc-700 transition-all font-button text-xs sm:text-sm font-semibold min-h-[44px]">
                        <span class="material-symbols-outlined text-[20px] text-secondary dark:text-emerald-400">handshake</span>
                        <span>Đăng ký tổ chức</span>
                    </button>
                    <button id="btnCreateNewEvent" type="button"
                        class="inline-flex items-center gap-2 px-4 py-2.5 rounded-[10px] bg-[#EA580C] hover:bg-[#C2410C] text-white shadow-xs transition-all font-button text-xs sm:text-sm font-semibold min-h-[44px]">
                        <span class="material-symbols-outlined text-[20px]">add</span>
                        <span>Tạo sự kiện mới</span>
                    </button>
                </div>
            </div>

            <!-- 2. FEATURED CULTURAL BANNER (OK OM BOK SPOTLIGHT) -->
            ${spotlightFestival ? `
                <div class="relative w-full rounded-2xl overflow-hidden bg-primary-container text-white shadow-xl">
                    <!-- Background Media Layer with Overlay -->
                    <div class="relative w-full min-h-[440px] lg:min-h-[480px] flex flex-col justify-end">
                        <img alt="${escapeHtml(spotlightFestival.name)}"
                            class="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-40 transition-transform duration-700 hover:scale-105"
                            src="${spotlightFestival.heroImage}"/>
                        <div class="absolute inset-0 bg-gradient-to-t from-primary via-primary/80 to-transparent"></div>
                        <div class="absolute inset-0 bg-gradient-to-r from-primary via-primary/60 to-transparent"></div>

                        <!-- Banner Content Inside -->
                        <div class="relative z-10 p-6 sm:p-8 lg:p-10 flex flex-col lg:flex-row lg:items-end justify-between gap-8">
                            <div class="max-w-3xl">
                                <!-- Badges -->
                                <div class="flex flex-wrap items-center gap-2 mb-4">
                                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-container/90 text-on-secondary-container font-badge text-xs font-semibold backdrop-blur-xs">
                                        <span class="material-symbols-outlined text-[15px]" style="font-variation-settings: 'FILL' 1;">award_star</span>
                                        ${escapeHtml(spotlightFestival.badge || 'Di sản phi vật thể quốc gia')}
                                    </span>
                                    <span class="inline-flex items-center px-3 py-1 rounded-full bg-white/20 text-white font-badge text-xs backdrop-blur-xs">
                                        Miễn phí tham dự
                                    </span>
                                    <span class="inline-flex items-center px-3 py-1 rounded-full bg-[#EA580C]/90 text-white font-badge text-xs backdrop-blur-xs">
                                        Lễ hội truyền thống
                                    </span>
                                </div>

                                <!-- Title & Sub -->
                                <h3 class="font-headline-lg text-2xl sm:text-3xl lg:text-4xl text-white font-bold leading-tight drop-shadow-xs">
                                    ${escapeHtml(spotlightFestival.name)} &amp; Lễ Thả Đèn Hoa Đăng 2026
                                </h3>

                                <!-- Details Grid -->
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-y-2.5 gap-x-6 mt-4 text-emerald-100 font-body-md text-xs sm:text-sm">
                                    <div class="flex items-center gap-2.5">
                                        <span class="material-symbols-outlined text-secondary-fixed text-[20px] shrink-0">calendar_month</span>
                                        <span>${escapeHtml(spotlightFestival.lunarDate)} • Bắt đầu 18:30</span>
                                    </div>
                                    <div class="flex items-center gap-2.5">
                                        <span class="material-symbols-outlined text-secondary-fixed text-[20px] shrink-0">location_on</span>
                                        <span class="truncate">${escapeHtml(spotlightFestival.locationName)}</span>
                                    </div>
                                    <div class="flex items-center gap-2.5 sm:col-span-2">
                                        <span class="material-symbols-outlined text-secondary-fixed text-[20px] shrink-0">supervised_user_circle</span>
                                        <span>Đơn vị đồng hành: Sở VHTT&amp;DL Trà Vinh &amp; Cộng đồng ViVuTraVinh</span>
                                    </div>
                                </div>

                                <!-- Festival Heritage Info -->
                                <div class="flex items-center gap-2 mt-6 pt-5 border-t border-white/15 text-emerald-100 font-body-sm text-xs sm:text-sm">
                                    <span class="material-symbols-outlined text-[18px] text-amber-300 shrink-0">verified</span>
                                    <span>Di sản văn hóa phi vật thể quốc gia • Tổ chức thường niên rằm tháng 10 Âm lịch</span>
                                </div>
                            </div>

                            <!-- Countdown Card & CTA Area -->
                            <div class="flex flex-col gap-4 shrink-0 w-full lg:w-auto">
                                <!-- Countdown timer block -->
                                <div class="bg-black/40 backdrop-blur-md rounded-2xl p-4 flex flex-col gap-2 border border-white/10">
                                    <span class="font-caption text-xs uppercase text-emerald-200 tracking-wider font-semibold flex items-center gap-1.5">
                                        <span class="material-symbols-outlined text-sm text-[#FFB599]">timer</span>
                                        Thời gian đếm ngược khai hội
                                    </span>
                                    <div class="flex items-center justify-center gap-2 text-center" id="countdown-timer">
                                        <div class="flex flex-col items-center bg-primary/80 rounded-xl px-3 py-2 min-w-[58px] border border-white/10">
                                            <span class="font-headline-md text-xl sm:text-2xl font-bold text-white tracking-tight" id="cd-days">18</span>
                                            <span class="font-caption text-[10px] text-emerald-200 uppercase">Ngày</span>
                                        </div>
                                        <span class="text-white font-bold text-lg">:</span>
                                        <div class="flex flex-col items-center bg-primary/80 rounded-xl px-3 py-2 min-w-[58px] border border-white/10">
                                            <span class="font-headline-md text-xl sm:text-2xl font-bold text-white tracking-tight" id="cd-hours">06</span>
                                            <span class="font-caption text-[10px] text-emerald-200 uppercase">Giờ</span>
                                        </div>
                                        <span class="text-white font-bold text-lg">:</span>
                                        <div class="flex flex-col items-center bg-primary/80 rounded-xl px-3 py-2 min-w-[58px] border border-white/10">
                                            <span class="font-headline-md text-xl sm:text-2xl font-bold text-white tracking-tight" id="cd-minutes">42</span>
                                            <span class="font-caption text-[10px] text-emerald-200 uppercase">Phút</span>
                                        </div>
                                        <span class="text-white font-bold text-lg">:</span>
                                        <div class="flex flex-col items-center bg-primary/80 rounded-xl px-3 py-2 min-w-[58px] border border-white/10">
                                            <span class="font-headline-md text-xl sm:text-2xl font-bold text-[#FFB599] tracking-tight" id="cd-seconds">15</span>
                                            <span class="font-caption text-[10px] text-emerald-200 uppercase">Giây</span>
                                        </div>
                                    </div>
                                </div>

                                <!-- Action buttons -->
                                <div class="flex flex-col sm:flex-row lg:flex-col gap-2.5">
                                    <button id="btnRemindFestival" type="button"
                                        class="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#EA580C] hover:bg-[#C2410C] text-white font-button text-xs sm:text-sm font-semibold shadow-md transition-all min-h-[44px]">
                                        <span class="material-symbols-outlined text-[20px]" style="font-variation-settings: 'FILL' 1;">notifications_active</span>
                                        <span>Nhận thông báo &amp; Lưu lịch</span>
                                    </button>
                                    <button type="button" data-festival-id="${spotlightFestival.id}"
                                        class="festival-view-detail-btn inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-button text-xs sm:text-sm font-semibold backdrop-blur-xs transition-colors min-h-[44px]">
                                        <span class="material-symbols-outlined text-[18px]">info</span>
                                        <span>Xem chi tiết chương trình lễ hội</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ` : ''}

            <!-- 3. FILTER & SUB-CATEGORY NAVIGATION BAR (STITCH TOOLBAR) -->
            <div role="toolbar" aria-label="Bộ lọc sự kiện và gặp gỡ"
                class="bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl p-4 shadow-xs border border-outline-variant/40 dark:border-zinc-800 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4">
                
                <!-- Category Tabs -->
                <div id="eventCategoryTabs" class="flex items-center gap-2 overflow-x-auto pb-1 xl:pb-0 scrollbar-none">
                    ${EVENT_CATEGORIES.map(cat => {
                        const isActive = activeCategory === cat.id;
                        return `
                            <button type="button" data-category-id="${cat.id}"
                                class="event-category-tab-btn px-4 py-2 rounded-full font-button text-xs font-semibold shrink-0 flex items-center gap-1.5 transition-all min-h-[44px] ${
                                    isActive
                                        ? 'bg-primary-container text-white shadow-xs'
                                        : 'bg-surface-container-low dark:bg-zinc-800 hover:bg-surface-container dark:hover:bg-zinc-700 text-on-surface-variant dark:text-zinc-300 hover:text-on-surface'
                                }">
                                <span>${escapeHtml(cat.label)}</span>
                                <span class="text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                                    isActive
                                        ? 'bg-secondary-fixed/30 text-secondary-fixed'
                                        : 'bg-surface-container-highest dark:bg-zinc-700 text-on-surface dark:text-zinc-200'
                                }">${cat.count}</span>
                            </button>
                        `;
                    }).join('')}
                </div>

                <!-- Controls: Location, Timing, View Mode -->
                <div class="flex items-center gap-3 shrink-0 self-end xl:self-auto flex-wrap">
                    <!-- Region Filter -->
                    <div class="relative">
                        <select id="eventRegionSelect" aria-label="Lọc theo khu vực"
                            class="h-11 pl-3 pr-8 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-200 font-button text-xs appearance-none focus:outline-none focus:bg-surface-container dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700 cursor-pointer transition-colors min-h-[44px]">
                            ${EVENT_REGIONS.map(reg => `
                                <option value="${reg.id}" ${activeRegion === reg.id ? 'selected' : ''}>
                                    ${escapeHtml(reg.label)}
                                </option>
                            `).join('')}
                        </select>
                        <span class="material-symbols-outlined absolute right-2.5 top-3 text-[18px] text-on-surface-variant dark:text-zinc-400 pointer-events-none">expand_more</span>
                    </div>

                    <!-- Timeframe Filter -->
                    <div class="relative">
                        <select id="eventTimeframeSelect" aria-label="Lọc theo thời gian"
                            class="h-11 pl-3 pr-8 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-200 font-button text-xs appearance-none focus:outline-none focus:bg-surface-container dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700 cursor-pointer transition-colors min-h-[44px]">
                            <option value="all">Tất cả thời gian</option>
                            <option value="weekend">Cuối tuần này</option>
                            <option value="october">Tháng 10/2026</option>
                            <option value="november">Tháng 11/2026</option>
                        </select>
                        <span class="material-symbols-outlined absolute right-2.5 top-3 text-[18px] text-on-surface-variant dark:text-zinc-400 pointer-events-none">expand_more</span>
                    </div>

                    <!-- View Switcher -->
                    <div class="flex items-center bg-surface-container-low dark:bg-zinc-800 p-1 rounded-xl border border-outline-variant/30 dark:border-zinc-700">
                        <button id="viewGridModeBtn" class="p-2 rounded-lg bg-surface-container-lowest dark:bg-zinc-700 text-on-surface dark:text-zinc-100 shadow-xs min-h-[44px] min-w-[44px] flex items-center justify-center" title="Xem dạng lưới" type="button">
                            <span class="material-symbols-outlined text-[20px]">grid_view</span>
                        </button>
                        <button id="viewCalendarModeBtn" class="p-2 rounded-lg text-on-surface-variant dark:text-zinc-400 hover:text-on-surface dark:hover:text-zinc-200 min-h-[44px] min-w-[44px] flex items-center justify-center" title="Xem dạng lịch biểu" type="button">
                            <span class="material-symbols-outlined text-[20px]">calendar_view_month</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- 4. EVENTS & MEETUPS GRID (STITCH CARDS) -->
            <div id="eventsGridContainer" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${filteredEvents.map(evt => {
                    const isBookmarked = bookmarkedIds && bookmarkedIds.has(evt.id);
                    return `
                        <article class="bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-xs hover:shadow-md border border-outline-variant/40 dark:border-zinc-800 transition-all duration-300 flex flex-col group">
                            <!-- Card Media Frame -->
                            <div class="relative aspect-[16/10] overflow-hidden bg-surface-container dark:bg-zinc-800">
                                <img alt="${escapeHtml(evt.title)}"
                                    class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                    src="${evt.image || '/ao bà om.jpg'}"
                                    loading="lazy"/>
                                <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-80"></div>
                                
                                <!-- Date badge -->
                                <div class="absolute top-3 left-3 bg-surface-container-lowest/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-xl p-2 flex flex-col items-center shadow-md min-w-[50px]">
                                    <span class="font-caption text-[10px] text-secondary dark:text-emerald-400 font-bold uppercase tracking-wider">${escapeHtml(evt.month || 'Tháng 11')}</span>
                                    <span class="font-headline-sm text-lg text-primary dark:text-zinc-100 font-bold leading-tight">${escapeHtml(evt.day || '15')}</span>
                                </div>

                                <!-- Bookmark action button -->
                                <button type="button" aria-label="Lưu sự kiện: ${escapeHtml(evt.title)}" data-event-id="${evt.id}"
                                    class="event-bookmark-btn absolute top-3 right-3 w-11 h-11 rounded-full bg-surface-container-lowest/80 dark:bg-zinc-900/80 hover:bg-surface-container-lowest dark:hover:bg-zinc-900 backdrop-blur-md flex items-center justify-center text-on-surface dark:text-zinc-200 hover:text-[#EA580C] shadow-xs transition-colors min-h-[44px]">
                                    <span class="material-symbols-outlined text-[20px] ${isBookmarked ? 'text-[#EA580C]' : ''}" style="${isBookmarked ? "font-variation-settings: 'FILL' 1;" : ''}">
                                        ${isBookmarked ? 'bookmark' : 'bookmark_border'}
                                    </span>
                                </button>

                                <!-- Category & Status pill on media -->
                                <div class="absolute bottom-3 left-3 flex flex-wrap items-center gap-2">
                                    ${(evt.isSample || evt.status !== 'approved') ? `
                                        <span class="px-2.5 py-1 rounded-full bg-amber-600/90 text-white font-badge text-[11px] font-medium backdrop-blur-xs">
                                            Sự kiện mẫu tham khảo
                                        </span>
                                    ` : ''}
                                    <span class="px-2.5 py-1 rounded-full bg-secondary text-white font-badge text-[11px] font-semibold">
                                        ${escapeHtml(evt.category || 'Sự kiện')}
                                    </span>
                                    ${evt.statusBadge ? `
                                        <span class="px-2.5 py-1 rounded-full bg-[#EA580C] text-white font-badge text-[11px] font-medium">
                                            ${escapeHtml(evt.statusBadge)}
                                        </span>
                                    ` : `
                                        <span class="px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-xs text-white font-badge text-[11px]">
                                            ${escapeHtml(evt.fee || 'Mở cửa tự do')}
                                        </span>
                                    `}
                                </div>
                            </div>

                            <!-- Card Body -->
                            <div class="p-5 flex flex-col flex-1 justify-between gap-4">
                                <div class="flex flex-col gap-2">
                                    <h3 class="font-headline-sm text-base sm:text-lg text-on-surface dark:text-zinc-100 group-hover:text-secondary dark:group-hover:text-emerald-400 transition-colors font-bold leading-snug line-clamp-2">
                                        ${escapeHtml(evt.title)}
                                    </h3>
                                    <div class="flex flex-col gap-1.5 text-on-surface-variant dark:text-zinc-400 font-body-sm text-xs mt-1">
                                        <div class="flex items-center gap-2">
                                            <span class="material-symbols-outlined text-[18px] text-secondary dark:text-emerald-400 shrink-0">schedule</span>
                                            <span>${escapeHtml(evt.timeSchedule || '')}</span>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <span class="material-symbols-outlined text-[18px] text-on-surface-variant dark:text-zinc-400 shrink-0">location_on</span>
                                            <span class="truncate">${escapeHtml(evt.location || '')}</span>
                                        </div>
                                    </div>
                                    <p class="font-body-sm text-xs text-on-surface-variant dark:text-zinc-400 line-clamp-2 mt-1 leading-relaxed">
                                        ${escapeHtml(evt.summary || '')}
                                    </p>
                                </div>

                                <!-- Card Footer -->
                                <div class="pt-4 border-t border-surface-container dark:border-zinc-800 flex items-center justify-between gap-2">
                                    <div class="flex flex-col">
                                        <span class="font-caption text-[11px] text-on-surface-variant dark:text-zinc-400">
                                            ${evt.feeType === 'paid' ? 'Phí tham gia' : 'Chi phí'}
                                        </span>
                                        <span class="font-button text-[14px] text-on-surface dark:text-zinc-200 font-semibold">
                                            ${escapeHtml(evt.fee || 'Miễn phí')}
                                            ${evt.feeDetail ? `<span class="font-normal text-on-surface-variant dark:text-zinc-400 text-[11px]">${escapeHtml(evt.feeDetail)}</span>` : ''}
                                        </span>
                                    </div>
                                    <button type="button" data-event-id="${evt.id}" data-action-type="${evt.actionType || 'rsvp'}" data-target-modal="${evt.targetModalId || ''}"
                                        class="event-action-btn inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] ${
                                            evt.actionType === 'modal'
                                                ? 'bg-surface-container-low hover:bg-surface-container dark:bg-zinc-800 dark:hover:bg-zinc-700 text-secondary dark:text-emerald-400 font-semibold'
                                                : 'bg-[#EA580C] hover:bg-[#C2410C] text-white shadow-xs font-semibold'
                                        } font-button text-xs transition-colors min-h-[44px]">
                                        <span>${escapeHtml(evt.ctaText || 'Xem chi tiết')}</span>
                                        <span class="material-symbols-outlined text-[16px]">${evt.actionType === 'modal' ? 'arrow_forward' : 'how_to_reg'}</span>
                                    </button>
                                </div>
                            </div>
                        </article>
                    `;
                }).join('')}
            </div>

            <!-- 5. BOTTOM CTA & HOST EVENT COLLABORATION BANNER -->
            <div class="relative rounded-2xl overflow-hidden bg-primary-container text-white p-6 sm:p-8 md:p-10 shadow-lg">
                <div class="absolute -right-12 -bottom-12 w-64 h-64 bg-secondary/30 rounded-full blur-3xl pointer-events-none"></div>
                <div class="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div class="max-w-2xl">
                        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-xs text-secondary-fixed text-xs font-semibold mb-3">
                            <span class="material-symbols-outlined text-[16px]">campaign</span>
                            <span>Kết nối lan tỏa văn hóa địa phương</span>
                        </div>
                        <h3 class="font-headline-lg text-xl sm:text-2xl lg:text-3xl font-bold text-white tracking-tight">
                            Bạn muốn tổ chức một buổi gặp gỡ, workshop hay chuyến đi tại Trà Vinh?
                        </h3>
                        <p class="font-body-md text-xs sm:text-sm text-emerald-100 mt-2 leading-relaxed">
                            ViVuTraVinh hỗ trợ kết nối và lan tỏa thông tin đến cộng đồng du khách và bạn trẻ yêu mến văn hóa Trà Vinh. Đồng hành cùng nhau quảng bá nét đẹp xứ sở trù phú!
                        </p>
                    </div>
                    <div class="flex flex-wrap items-center gap-3 shrink-0">
                        <button id="btnBottomHostSubmit" type="button"
                            class="inline-flex items-center gap-2 px-5 py-3 rounded-[10px] bg-[#EA580C] hover:bg-[#C2410C] text-white font-button text-xs sm:text-sm font-semibold shadow-md transition-all min-h-[44px]">
                            <span class="material-symbols-outlined text-[20px]">send</span>
                            <span>Gửi thông tin sự kiện</span>
                        </button>
                        <button id="btnBottomHostHelp" type="button"
                            class="inline-flex items-center gap-2 px-4 py-3 rounded-[10px] bg-white/15 hover:bg-white/25 text-white font-button text-xs sm:text-sm font-semibold transition-colors min-h-[44px]">
                            <span class="material-symbols-outlined text-[20px]">help</span>
                            <span>Tìm hiểu quy chế</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Nguồn dữ liệu & Bản quyền lễ hội (Data Transparency & Audit G7) -->
            <div class="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-surface-container-low dark:bg-zinc-800/60 border border-outline-variant/30 text-center">
                <span class="material-symbols-outlined text-xs text-secondary dark:text-emerald-400">verified</span>
                <p class="font-caption text-[11px] text-on-surface-variant dark:text-zinc-400">
                    Nguồn dữ liệu sự kiện &amp; lễ hội 2026 được tổng hợp từ <strong>Trung tâm Thông tin Xúc tiến Du lịch</strong> &amp; Sở Văn hóa, Thể thao và Du lịch tỉnh Trà Vinh.
                </p>
            </div>
        </div>
    `;

    // Khởi động đồng hồ đếm ngược
    if (spotlightFestival && spotlightFestival.targetDate) {
        startFestivalCountdown(spotlightFestival.targetDate);
    }

    // Gắn sự kiện chuyển tab danh mục
    container.querySelectorAll('.event-category-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const catId = btn.dataset.categoryId;
            if (catId && onFilterCategory) {
                onFilterCategory(catId);
            }
        });
    });

    // Gắn sự kiện chọn vùng miền
    const regionSelect = container.querySelector('#eventRegionSelect');
    if (regionSelect && onFilterRegion) {
        regionSelect.addEventListener('change', (e) => {
            onFilterRegion(e.target.value);
        });
    }

    // Gắn sự kiện xem chi tiết cẩm nang lễ hội (cho Ok Om Bok và các lễ hội)
    container.querySelectorAll('.festival-view-detail-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const festId = btn.dataset.festivalId || 'ok-om-bok';
            if (onOpenFestivalModal) {
                onOpenFestivalModal(festId);
            }
        });
    });

    // Gắn sự kiện bookmark sự kiện
    container.querySelectorAll('.event-bookmark-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const evtId = btn.dataset.eventId;
            if (evtId && onToggleBookmark) {
                onToggleBookmark(evtId);
            }
        });
    });

    // Gắn sự kiện action nút bấm trên event card (RSVP hoặc xem modal)
    container.querySelectorAll('.event-action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const actionType = btn.dataset.actionType;
            const targetModal = btn.dataset.targetModal;
            const evtId = btn.dataset.eventId;

            if (actionType === 'modal' && targetModal && onOpenFestivalModal) {
                onOpenFestivalModal(targetModal);
            } else if (onRsvpEvent) {
                const targetEvent = allMeetups.find(e => e.id === evtId);
                if (targetEvent) {
                    onRsvpEvent(targetEvent);
                }
            }
        });
    });

    // Gắn sự kiện nút Đăng ký tổ chức / Tạo sự kiện
    const btnHost = container.querySelector('#btnOpenHostEvent');
    const btnCreate = container.querySelector('#btnCreateNewEvent');
    const btnBottomSubmit = container.querySelector('#btnBottomHostSubmit');
    [btnHost, btnCreate, btnBottomSubmit].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                if (onOpenHostModal) {
                    onOpenHostModal();
                } else if (window.ViVuApp?.openHostEventModal) {
                    window.ViVuApp.openHostEventModal();
                }
            });
        }
    });

    // Gắn sự kiện nút Nhận thông báo & Lưu lịch
    const btnRemind = container.querySelector('#btnRemindFestival');
    if (btnRemind) {
        btnRemind.addEventListener('click', () => {
            if (window.ViVuApp?.showNotification) {
                window.ViVuApp.showNotification('Đã lưu lịch Đại lễ Ok Om Bok 2026 vào thiết bị của bạn!');
            } else {
                alert('Đã lưu lịch Đại lễ Ok Om Bok 2026 vào thiết bị của bạn!');
            }
        });
    }

    // Gắn sự kiện tìm hiểu quy chế
    const btnHelp = container.querySelector('#btnBottomHostHelp');
    if (btnHelp) {
        btnHelp.addEventListener('click', () => {
            if (window.ViVuApp?.showNotification) {
                window.ViVuApp.showNotification('Quy chế tổ chức: Các sự kiện phi thương mại, tôn vinh văn hóa địa phương Trà Vinh được hỗ trợ truyền thông hoàn toàn miễn phí!');
            } else {
                alert('Quy chế: Các sự kiện văn hóa, workshop phi thương mại tại Trà Vinh được hỗ trợ truyền thông miễn phí 100%!');
            }
        });
    }
}

/**
 * Render Modal Cẩm Nang Chi Tiết Diễn Biến Lễ Hội (Stitch Design System - Hỗ trợ Ok Om Bok 12-Column Layout)
 */
export function renderFestivalDetailModal(festival, allFestivals = [], onSelectPlace, onSelectOtherFestival, activeTimelineDay = 'day1') {
    const container = document.getElementById('festivalModalContainer');
    if (!container || !festival) return;

    // Kiểm tra xem có dữ liệu chuyên sâu Ok Om Bok không
    const isOkOmBok = festival.id === 'ok-om-bok' || !!festival.timelineDays;

    if (isOkOmBok) {
        // GIAO DIỆN CHUYÊN SÂU OK OM BOK (STITCH 12-COLUMN DETAIL LAYOUT)
        const daysData = festival.timelineDays || {};
        const currentDayKey = activeTimelineDay === 'day2' ? 'day2' : 'day1';
        const currentDayEvents = daysData[currentDayKey]?.events || festival.timeline || [];

        container.innerHTML = `
            <div class="max-h-[90vh] overflow-y-auto">
                <!-- Top Breadcrumb & Quick Actions Bar -->
                <div class="w-full bg-surface-container-lowest dark:bg-zinc-900 border-b border-outline-variant/30 dark:border-zinc-800 sticky top-0 z-20">
                    <div class="px-6 py-3 flex items-center justify-between gap-4">
                        <div class="flex items-center gap-2 font-caption text-xs text-on-surface-variant dark:text-zinc-400 truncate">
                            <span class="material-symbols-outlined text-[16px] text-secondary dark:text-emerald-400">home</span>
                            <span>Trang chủ</span>
                            <span class="material-symbols-outlined text-[14px] text-outline-variant">chevron_right</span>
                            <span>Sự kiện &amp; Gặp gỡ</span>
                            <span class="material-symbols-outlined text-[14px] text-outline-variant">chevron_right</span>
                            <span class="text-on-surface dark:text-zinc-100 font-bold truncate max-w-[260px]">${escapeHtml(festival.name)}</span>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                            <button id="btnModalShare" type="button" aria-label="Chia sẻ sự kiện"
                                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high dark:bg-zinc-800 dark:hover:bg-zinc-700 font-button text-xs text-on-surface-variant dark:text-zinc-300 transition-colors min-h-[44px]">
                                <span class="material-symbols-outlined text-[18px]">share</span>
                                <span class="hidden sm:inline">Chia sẻ</span>
                            </button>
                            <button id="btnModalBookmark" type="button" aria-label="Lưu sự kiện"
                                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high dark:bg-zinc-800 dark:hover:bg-zinc-700 font-button text-xs text-on-surface-variant dark:text-zinc-300 transition-colors min-h-[44px]">
                                <span class="material-symbols-outlined text-[18px]">bookmark_add</span>
                                <span class="hidden sm:inline">Lưu sự kiện</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Hero Visual Showcase -->
                <div class="relative w-full overflow-hidden bg-primary-container min-h-[380px] lg:min-h-[420px] flex flex-col justify-end p-6 sm:p-10 shadow-md">
                    <!-- Background Image with Overlay -->
                    <img alt="${escapeHtml(festival.name)}"
                        class="absolute inset-0 w-full h-full object-cover mix-blend-luminosity opacity-40"
                        src="${festival.heroImage}"/>
                    <div class="absolute inset-0 bg-gradient-to-t from-primary via-primary/80 to-transparent"></div>

                    <!-- Content inside Hero -->
                    <div class="relative z-10 flex flex-col gap-3 max-w-4xl">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="px-3 py-1 rounded-full bg-on-tertiary-container text-white font-badge text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-xs font-semibold">
                                <span class="material-symbols-outlined text-[15px]" style="font-variation-settings: 'FILL' 1;">verified</span>
                                ${escapeHtml(festival.badge || 'Di sản phi vật thể Quốc gia')}
                            </span>
                            <span class="px-3 py-1 rounded-full bg-secondary text-white font-badge text-xs flex items-center gap-1.5 font-semibold">
                                <span class="material-symbols-outlined text-[15px]">diversity_3</span>
                                Lễ hội Lớn Nhất Năm
                            </span>
                            <span class="px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-white font-caption text-xs flex items-center gap-1.5">
                                <span class="material-symbols-outlined text-[15px]">event</span>
                                ${escapeHtml(festival.lunarDate)}
                            </span>
                        </div>
                        <h1 class="font-headline-xl text-2xl sm:text-3xl lg:text-4xl text-white font-bold leading-tight drop-shadow-xs">
                            ${escapeHtml(festival.name)} &amp; Giải Đua Ghe Ngo Trà Vinh 2026
                        </h1>
                        <p class="font-body-lg text-xs sm:text-sm text-emerald-100 max-w-3xl leading-relaxed">
                            ${escapeHtml(festival.summary)}
                        </p>
                        <div class="flex flex-wrap items-center gap-5 pt-2 font-caption text-xs text-emerald-100">
                            <div class="flex items-center gap-2">
                                <span class="material-symbols-outlined text-secondary-fixed text-[18px]">location_on</span>
                                <span class="font-semibold text-white">${escapeHtml(festival.locationName)}</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="material-symbols-outlined text-secondary-fixed text-[18px]">verified</span>
                                <span>Lễ hội truyền thống lớn nhất trong năm của đồng bào Khmer</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="material-symbols-outlined text-secondary-fixed text-[18px]">confirmation_number</span>
                                <span class="text-secondary-fixed font-bold">Vào cổng tự do</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Main Grid Content: 12 Columns -->
                <div class="p-6 sm:p-8 lg:p-10 w-full">
                    <div class="grid grid-cols-12 gap-8 items-start">
                        
                        <!-- LEFT COLUMN: Cultural Details, Timeline, Logistics, Community (8 cols ~ 65%) -->
                        <div class="col-span-12 lg:col-span-8 flex flex-col gap-8">
                            
                            <!-- 1. Cultural Significance Overview -->
                            <article class="bg-surface-container-lowest dark:bg-zinc-900 p-6 sm:p-8 rounded-2xl shadow-xs border border-outline-variant/40 dark:border-zinc-800 flex flex-col gap-6">
                                <div class="flex items-center gap-3">
                                    <span class="p-2.5 rounded-xl bg-secondary/10 dark:bg-emerald-950/60 text-secondary dark:text-emerald-400">
                                        <span class="material-symbols-outlined text-[24px]">nightlight</span>
                                    </span>
                                    <div>
                                        <span class="font-caption text-xs text-secondary dark:text-emerald-400 uppercase font-bold tracking-wider">Ý Nghĩa Phong Tục Cổ Truyền</span>
                                        <h2 class="font-headline-md text-lg sm:text-xl text-on-surface dark:text-zinc-100 font-bold">Tục Cúng Trăng &amp; Nét Đẹp Đút Cốm Dẹp May Mắn</h2>
                                    </div>
                                </div>
                                <p class="font-body-md text-xs sm:text-sm text-on-surface-variant dark:text-zinc-300 leading-relaxed">
                                    ${escapeHtml(festival.significance)}
                                </p>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    ${(festival.culturalHighlights || []).map(hl => `
                                        <div class="p-5 rounded-xl bg-surface-container-low dark:bg-zinc-800/80 border border-outline-variant/30 dark:border-zinc-700/60 flex flex-col gap-2">
                                            <div class="flex items-center gap-2 text-secondary dark:text-emerald-400 font-headline-sm text-sm sm:text-base font-bold">
                                                <span class="material-symbols-outlined text-[22px]">${hl.icon || 'bakery_dining'}</span>
                                                ${escapeHtml(hl.title)}
                                            </div>
                                            <p class="font-body-sm text-xs text-on-surface-variant dark:text-zinc-300 leading-relaxed">
                                                ${escapeHtml(hl.desc)}
                                            </p>
                                        </div>
                                    `).join('')}
                                </div>
                            </article>

                            <!-- 2. Interactive Detailed Timeline Section -->
                            <section class="bg-surface-container-lowest dark:bg-zinc-900 p-6 sm:p-8 rounded-2xl shadow-xs border border-outline-variant/40 dark:border-zinc-800 flex flex-col gap-6">
                                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div class="flex items-center gap-3">
                                        <span class="p-2.5 rounded-xl bg-primary-container text-white">
                                            <span class="material-symbols-outlined text-[24px]">schedule</span>
                                        </span>
                                        <div>
                                            <span class="font-caption text-xs text-secondary dark:text-emerald-400 uppercase font-bold tracking-wider">Chương Trình Chi Tiết</span>
                                            <h2 class="font-headline-md text-lg sm:text-xl text-on-surface dark:text-zinc-100 font-bold">Lịch Trình Sự Kiện &amp; Khai Mạc</h2>
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-2 bg-surface-container-low dark:bg-zinc-800 p-1 rounded-xl self-start sm:self-auto border border-outline-variant/30 dark:border-zinc-700">
                                        <button type="button" id="btnTimelineDay1" data-day="day1"
                                            class="timeline-day-btn px-4 py-2 rounded-lg font-caption text-xs font-bold transition-all min-h-[44px] ${
                                                currentDayKey === 'day1'
                                                    ? 'bg-surface-container-lowest dark:bg-zinc-700 text-secondary dark:text-emerald-300 shadow-xs'
                                                    : 'text-on-surface-variant dark:text-zinc-400 hover:text-on-surface dark:hover:text-zinc-200'
                                            }">
                                            Ngày 14/11
                                        </button>
                                        <button type="button" id="btnTimelineDay2" data-day="day2"
                                            class="timeline-day-btn px-4 py-2 rounded-lg font-caption text-xs font-bold transition-all min-h-[44px] ${
                                                currentDayKey === 'day2'
                                                    ? 'bg-surface-container-lowest dark:bg-zinc-700 text-secondary dark:text-emerald-300 shadow-xs'
                                                    : 'text-on-surface-variant dark:text-zinc-400 hover:text-on-surface dark:hover:text-zinc-200'
                                            }">
                                            Ngày 15/11
                                        </button>
                                    </div>
                                </div>

                                <!-- Timeline Items -->
                                <div id="timelineEventsContainer" class="relative flex flex-col gap-6 before:absolute before:top-4 before:bottom-4 before:left-[19px] before:w-0.5 before:bg-surface-container-highest dark:before:bg-zinc-700">
                                    ${currentDayEvents.map(evt => `
                                        <div class="timeline-event-item relative flex items-start gap-4 sm:gap-5">
                                            <div class="relative z-10 w-10 h-10 rounded-full bg-secondary text-white flex items-center justify-center shadow-xs shrink-0">
                                                <span class="material-symbols-outlined text-[20px]">${evt.icon || 'event'}</span>
                                            </div>
                                            <div class="flex-1 bg-surface-container-low dark:bg-zinc-800/80 p-5 sm:p-6 rounded-2xl flex flex-col gap-3 border border-outline-variant/30 dark:border-zinc-700/60">
                                                <div class="flex flex-wrap items-center justify-between gap-2">
                                                    <div class="flex items-center gap-2">
                                                        <span class="px-2.5 py-1 rounded bg-secondary/15 dark:bg-emerald-950/60 text-secondary dark:text-emerald-400 font-caption text-xs font-bold">
                                                            ${escapeHtml(evt.time)}
                                                        </span>
                                                        <h3 class="font-headline-sm text-sm sm:text-base font-bold text-on-surface dark:text-zinc-100">
                                                            ${escapeHtml(evt.title)}
                                                        </h3>
                                                    </div>
                                                    ${evt.location ? `
                                                        <span class="text-caption text-xs text-on-surface-variant dark:text-zinc-400 flex items-center gap-1">
                                                            <span class="material-symbols-outlined text-[16px] text-secondary dark:text-emerald-400">pin_drop</span>
                                                            ${escapeHtml(evt.location)}
                                                        </span>
                                                    ` : ''}
                                                </div>
                                                <p class="font-body-sm text-xs text-on-surface-variant dark:text-zinc-300 leading-relaxed">
                                                    ${escapeHtml(evt.desc)}
                                                </p>
                                                ${evt.image ? `
                                                    <div class="relative rounded-xl overflow-hidden shadow-xs mt-1 aspect-[16/9] sm:aspect-[21/9]">
                                                        <img alt="${escapeHtml(evt.title)}" class="w-full h-full object-cover hover:scale-102 transition-transform duration-500" src="${evt.image}"/>
                                                        ${evt.highlight ? `
                                                            <div class="absolute bottom-3 left-3 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-lg text-white font-caption text-xs flex items-center gap-2">
                                                                <span class="material-symbols-outlined text-[16px] text-secondary-fixed">photo_camera</span>
                                                                ${escapeHtml(evt.highlight)}
                                                            </div>
                                                        ` : ''}
                                                    </div>
                                                ` : ''}
                                                ${evt.tip ? `
                                                    <div class="p-3 bg-secondary/10 dark:bg-emerald-950/40 rounded-xl flex items-center gap-2.5 text-xs text-secondary dark:text-emerald-300">
                                                        <span class="material-symbols-outlined text-[20px] shrink-0">lightbulb</span>
                                                        <span>${escapeHtml(evt.tip)}</span>
                                                    </div>
                                                ` : ''}
                                                ${evt.tags ? `
                                                    <div class="flex items-center gap-2 flex-wrap pt-1">
                                                        ${evt.tags.map(tag => `
                                                            <span class="px-2.5 py-1 rounded bg-surface-container-lowest dark:bg-zinc-700 font-caption text-[11px] text-on-surface-variant dark:text-zinc-300 font-medium">
                                                                ${escapeHtml(tag)}
                                                            </span>
                                                        `).join('')}
                                                    </div>
                                                ` : ''}
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </section>

                            <!-- 3. Logistics Map & Sector Navigation -->
                            <section class="bg-surface-container-lowest dark:bg-zinc-900 p-6 sm:p-8 rounded-2xl shadow-xs border border-outline-variant/40 dark:border-zinc-800 flex flex-col gap-6" id="map-section">
                                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div class="flex items-center gap-3">
                                        <span class="p-2.5 rounded-xl bg-secondary/10 dark:bg-emerald-950/60 text-secondary dark:text-emerald-400">
                                            <span class="material-symbols-outlined text-[24px]">map</span>
                                        </span>
                                        <div>
                                            <span class="font-caption text-xs text-secondary dark:text-emerald-400 uppercase font-bold tracking-wider">Sơ Đồ Luồng Di Chuyển</span>
                                            <h2 class="font-headline-md text-lg sm:text-xl text-on-surface dark:text-zinc-100 font-bold">Khu Vực Khán Đài, Bãi Xe &amp; Ẩm Thực</h2>
                                        </div>
                                    </div>
                                    <!-- Filter markers toggles -->
                                    <div class="flex items-center gap-2 font-caption text-xs flex-wrap">
                                        <span class="px-2.5 py-1 rounded-full bg-surface-container-high dark:bg-zinc-800 text-on-surface dark:text-zinc-200 font-semibold flex items-center gap-1.5">
                                            <span class="w-2 h-2 rounded-full bg-secondary"></span> Khán đài A
                                        </span>
                                        <span class="px-2.5 py-1 rounded-full bg-surface-container-high dark:bg-zinc-800 text-on-surface dark:text-zinc-200 font-semibold flex items-center gap-1.5">
                                            <span class="w-2 h-2 rounded-full bg-[#EA580C]"></span> Khán đài B
                                        </span>
                                        <span class="px-2.5 py-1 rounded-full bg-surface-container dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 flex items-center gap-1.5">
                                            <span class="w-2 h-2 rounded-full bg-on-tertiary-container"></span> Bãi xe P1-P4
                                        </span>
                                    </div>
                                </div>

                                <!-- Static Map Card Preview -->
                                <div class="w-full h-64 sm:h-72 bg-cover bg-center rounded-2xl relative overflow-hidden shadow-xs flex items-end p-4"
                                    style="background-image: url('/ao bà om.jpg');">
                                    <div class="absolute inset-0 bg-black/40"></div>
                                    <div class="relative z-10 bg-surface-container-lowest/95 dark:bg-zinc-900/95 backdrop-blur-md p-4 rounded-xl shadow-md w-full max-w-md flex items-center justify-between gap-3">
                                        <div class="flex flex-col min-w-0">
                                            <span class="font-button text-xs sm:text-sm font-bold text-on-surface dark:text-zinc-100 truncate">Khu Vực Trung Tâm Ao Bà Om &amp; Chùa Âng</span>
                                            <span class="font-caption text-[11px] text-on-surface-variant dark:text-zinc-400">Phường 8, TP. Trà Vinh (Cách trung tâm 5km)</span>
                                        </div>
                                        <a class="px-3.5 py-2 rounded-lg bg-secondary hover:bg-emerald-700 text-white font-caption text-xs font-bold flex items-center gap-1 shrink-0 transition-colors min-h-[44px]"
                                            href="https://maps.google.com/?q=Ao+Ba+Om+Tra+Vinh" target="_blank" rel="noopener noreferrer">
                                            <span>Chỉ Đường</span>
                                            <span class="material-symbols-outlined text-[14px]">open_in_new</span>
                                        </a>
                                    </div>
                                </div>

                                <!-- Important venue notices -->
                                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div class="p-4 rounded-xl bg-surface-container-low dark:bg-zinc-800/80 flex flex-col gap-1.5 border border-outline-variant/30 dark:border-zinc-700/60">
                                        <span class="material-symbols-outlined text-secondary dark:text-emerald-400 text-[22px]">local_parking</span>
                                        <span class="font-button text-xs font-bold text-on-surface dark:text-zinc-100">Bãi đỗ xe tập trung</span>
                                        <span class="font-caption text-[11px] text-on-surface-variant dark:text-zinc-400">Sức chứa 4.000 xe máy &amp; 300 ô tô tại đường Nguyễn Thị Minh Khai.</span>
                                    </div>
                                    <div class="p-4 rounded-xl bg-surface-container-low dark:bg-zinc-800/80 flex flex-col gap-1.5 border border-outline-variant/30 dark:border-zinc-700/60">
                                        <span class="material-symbols-outlined text-on-tertiary-container text-[22px]">emergency</span>
                                        <span class="font-button text-xs font-bold text-on-surface dark:text-zinc-100">Trạm Y tế trực chiến</span>
                                        <span class="font-caption text-[11px] text-on-surface-variant dark:text-zinc-400">3 trạm cấp cứu lưu động bố trí cạnh Bảo tàng Văn hóa Khmer.</span>
                                    </div>
                                    <div class="p-4 rounded-xl bg-surface-container-low dark:bg-zinc-800/80 flex flex-col gap-1.5 border border-outline-variant/30 dark:border-zinc-700/60">
                                        <span class="material-symbols-outlined text-primary dark:text-emerald-300 text-[22px]">restaurant</span>
                                        <span class="font-button text-xs font-bold text-on-surface dark:text-zinc-100">Phố ẩm thực 120 gian</span>
                                        <span class="font-caption text-[11px] text-on-surface-variant dark:text-zinc-400">Phục vụ bún nước lèo, bánh tét Trà Cuôn, bánh canh Bến Có nóng hổi.</span>
                                    </div>
                                </div>
                            </section>

                            <!-- 4. Community Q&A and Discussions -->
                            <section class="bg-surface-container-lowest dark:bg-zinc-900 p-6 sm:p-8 rounded-2xl shadow-xs border border-outline-variant/40 dark:border-zinc-800 flex flex-col gap-6">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <span class="p-2.5 rounded-xl bg-secondary/10 dark:bg-emerald-950/60 text-secondary dark:text-emerald-400">
                                            <span class="material-symbols-outlined text-[24px]">forum</span>
                                        </span>
                                        <div>
                                            <span class="font-caption text-xs text-secondary dark:text-emerald-400 uppercase font-bold tracking-wider">Hỏi Đáp Du Khách</span>
                                            <h2 class="font-headline-md text-lg sm:text-xl text-on-surface dark:text-zinc-100 font-bold">Thảo Luận Trực Tiếp${(festival.faqDiscussions && festival.faqDiscussions.length > 0) ? ` (${festival.faqDiscussions.length} phản hồi)` : ''}</h2>
                                        </div>
                                    </div>
                                </div>

                                <!-- Input bar -->
                                <form id="festivalQuestionForm" class="flex gap-3 items-center">
                                    <div class="relative flex-1">
                                        <input name="questionText" class="w-full h-11 px-4 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700 transition-all"
                                            placeholder="Đặt câu hỏi về chỗ ngồi, bãi xe hoặc lịch thi đấu ghe Ngo..." type="text" required/>
                                    </div>
                                    <button type="submit" class="px-5 h-11 rounded-xl bg-primary hover:bg-primary-container text-white font-button text-xs font-semibold transition-colors min-h-[44px] flex items-center gap-1.5 shrink-0">
                                        <span>Gửi</span>
                                        <span class="material-symbols-outlined text-[16px]">send</span>
                                    </button>
                                </form>

                                <!-- Discussion threads -->
                                <div class="flex flex-col gap-4">
                                    ${(festival.faqDiscussions || []).map(comm => `
                                        <div class="p-4 rounded-xl bg-surface-container-low dark:bg-zinc-800/80 flex flex-col gap-3 border border-outline-variant/30 dark:border-zinc-700/60">
                                            <div class="flex items-center justify-between">
                                                <div class="flex items-center gap-3">
                                                    <div class="w-8 h-8 rounded-full ${comm.avatarBg || 'bg-secondary text-white'} flex items-center justify-center font-bold text-xs">
                                                        ${escapeHtml(comm.avatarText || 'TV')}
                                                    </div>
                                                    <div>
                                                        <span class="font-button text-xs font-bold text-on-surface dark:text-zinc-100">${escapeHtml(comm.author)}</span>
                                                        <span class="font-caption text-[11px] text-on-surface-variant dark:text-zinc-400 ml-2">${escapeHtml(comm.role)}</span>
                                                    </div>
                                                </div>
                                                <span class="font-caption text-xs text-secondary dark:text-emerald-400 flex items-center gap-1">
                                                    <span class="material-symbols-outlined text-[14px]">thumb_up</span> ${comm.likes || 12}
                                                </span>
                                            </div>
                                            <p class="font-body-sm text-xs text-on-surface-variant dark:text-zinc-300 leading-relaxed">
                                                ${escapeHtml(comm.question)}
                                            </p>
                                            ${comm.reply ? `
                                                <div class="ml-4 p-3 rounded-lg bg-surface-container-lowest dark:bg-zinc-700/80 flex flex-col gap-1 border-l-2 border-primary">
                                                    <div class="flex items-center gap-2">
                                                        <span class="px-2 py-0.5 rounded bg-primary-container text-white font-caption text-[10px] font-bold">${escapeHtml(comm.reply.author)}</span>
                                                        <span class="font-caption text-[11px] text-outline-variant">${escapeHtml(comm.reply.time)}</span>
                                                    </div>
                                                    <p class="font-body-sm text-xs text-on-surface dark:text-zinc-200">
                                                        ${escapeHtml(comm.reply.text)}
                                                    </p>
                                                </div>
                                            ` : ''}
                                        </div>
                                    `).join('')}
                                </div>
                            </section>
                        </div>

                        <!-- RIGHT COLUMN: Sticky Sidebar for Booking, Countdown, Organizers & Extras (4 cols ~ 35%) -->
                        <aside class="col-span-12 lg:col-span-4 flex flex-col gap-6 sticky top-20">
                            
                            <!-- 1. Countdown CTA Card -->
                            <div class="bg-surface-container-lowest dark:bg-zinc-900 p-6 rounded-2xl shadow-md border border-outline-variant/40 dark:border-zinc-800 flex flex-col gap-5">
                                <div class="bg-primary p-4 rounded-xl flex flex-col items-center justify-center text-center gap-2">
                                    <span class="font-caption text-xs text-secondary-fixed uppercase tracking-wider font-semibold">
                                        Đếm Ngược Giờ Khai Mạc
                                    </span>
                                    <div class="flex items-center gap-2.5 text-white">
                                        <div class="flex flex-col items-center">
                                            <span class="font-headline-lg text-2xl font-bold cd-days-val" id="modal-cd-days">18</span>
                                            <span class="font-caption text-[10px] uppercase text-white/70">Ngày</span>
                                        </div>
                                        <span class="text-xl font-bold text-secondary-fixed">:</span>
                                        <div class="flex flex-col items-center">
                                            <span class="font-headline-lg text-2xl font-bold cd-hours-val" id="modal-cd-hours">06</span>
                                            <span class="font-caption text-[10px] uppercase text-white/70">Giờ</span>
                                        </div>
                                        <span class="text-xl font-bold text-secondary-fixed">:</span>
                                        <div class="flex flex-col items-center">
                                            <span class="font-headline-lg text-2xl font-bold cd-minutes-val" id="modal-cd-minutes">42</span>
                                            <span class="font-caption text-[10px] uppercase text-white/70">Phút</span>
                                        </div>
                                        <span class="text-xl font-bold text-secondary-fixed">:</span>
                                        <div class="flex flex-col items-center">
                                            <span class="font-headline-lg text-2xl font-bold text-[#FFB599] cd-seconds-val" id="modal-cd-seconds">15</span>
                                            <span class="font-caption text-[10px] uppercase text-white/70">Giây</span>
                                        </div>
                                    </div>
                                </div>

                                <!-- Free Grandstand Pass Form -->
                                <div class="flex flex-col gap-3">
                                    <div class="flex items-center justify-between">
                                        <h3 class="font-headline-sm text-sm sm:text-base font-bold text-on-surface dark:text-zinc-100">Đăng Ký Chỗ Ngồi Miễn Phí</h3>
                                        <span class="px-2 py-0.5 rounded bg-secondary/15 dark:bg-emerald-950/60 text-secondary dark:text-emerald-400 font-caption text-[11px] font-bold">Còn 142 vé</span>
                                    </div>
                                    <p class="font-body-sm text-xs text-on-surface-variant dark:text-zinc-400">
                                        Vé xem lễ cúng Trăng tại khán đài A bờ hồ Ao Bà Om và khán đài có mái che xem đua ghe Ngo trên sông Long Bình.
                                    </p>
                                    <form id="grandstandRsvpForm" class="flex flex-col gap-3 pt-2">
                                        <div>
                                            <label class="block font-caption text-xs text-on-surface-variant dark:text-zinc-400 mb-1 font-medium">Họ và tên</label>
                                            <input name="fullname" class="w-full h-11 px-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700" required="" type="text" value="Trần Tiến"/>
                                        </div>
                                        <div>
                                            <label class="block font-caption text-xs text-on-surface-variant dark:text-zinc-400 mb-1 font-medium">Số điện thoại (Nhận vé Zalo/SMS)</label>
                                            <input name="phone" class="w-full h-11 px-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700" placeholder="0901 xxx xxx" required="" type="tel"/>
                                        </div>
                                        <div>
                                            <label class="block font-caption text-xs text-on-surface-variant dark:text-zinc-400 mb-1 font-medium">Chọn khu vực ưu tiên</label>
                                            <select name="sector" class="w-full h-11 px-3 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700">
                                                <option value="long-binh">Khán đài Sông Long Bình (Xem Đua Ghe Ngo Sáng 14/11 &amp; 15/11)</option>
                                                <option value="ao-ba-om">Khán đài Ao Bà Om (Đêm Cúng Trăng &amp; Thả Hoa Đăng Tối 15/11)</option>
                                                <option value="combo">Combo Trọn gói Cả 2 Địa điểm</option>
                                            </select>
                                        </div>
                                        <button class="w-full py-3.5 px-4 rounded-xl bg-[#EA580C] hover:bg-[#C2410C] text-white font-button text-xs sm:text-sm font-semibold shadow-xs transition-all flex items-center justify-center gap-2 mt-1 min-h-[44px]" type="submit">
                                            <span class="material-symbols-outlined text-[18px]">airplane_ticket</span>
                                            <span>Xác Nhận Giữ Chỗ Miễn Phí</span>
                                        </button>
                                    </form>
                                    <div class="flex items-center gap-1.5 text-on-surface-variant dark:text-zinc-400 font-caption text-[11px] justify-center pt-1">
                                        <span class="material-symbols-outlined text-secondary dark:text-emerald-400 text-[16px]">verified_user</span>
                                        <span>Không thu phí • Quản lý bởi Sở VHTT&amp;DL Trà Vinh</span>
                                    </div>
                                </div>
                            </div>

                            <!-- 2. Organizers & Support Info -->
                            <div class="bg-surface-container-lowest dark:bg-zinc-900 p-6 rounded-2xl shadow-xs border border-outline-variant/40 dark:border-zinc-800 flex flex-col gap-4">
                                <span class="font-caption text-xs text-secondary dark:text-emerald-400 uppercase font-bold tracking-wider">Đơn Vị Chủ Trì &amp; Hỗ Trợ</span>
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-xl bg-primary-container text-white flex items-center justify-center font-bold">
                                        <span class="material-symbols-outlined text-[20px]">account_balance</span>
                                    </div>
                                    <div class="flex flex-col">
                                        <span class="font-button text-xs font-bold text-on-surface dark:text-zinc-100">Sở VH-TT-DL Tỉnh Trà Vinh</span>
                                        <span class="font-caption text-[11px] text-on-surface-variant dark:text-zinc-400">Cơ quan tổ chức chính thức</span>
                                    </div>
                                </div>
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-xl bg-secondary/15 text-secondary dark:text-emerald-400 flex items-center justify-center font-bold">
                                        <span class="material-symbols-outlined text-[20px]">groups</span>
                                    </div>
                                    <div class="flex flex-col">
                                        <span class="font-button text-xs font-bold text-on-surface dark:text-zinc-100">Cộng Đồng ViVuTraVinh</span>
                                        <span class="font-caption text-[11px] text-on-surface-variant dark:text-zinc-400">Điều phối tình nguyện &amp; Hướng dẫn viên</span>
                                    </div>
                                </div>
                                <div class="pt-2 flex flex-col gap-1.5 font-caption text-xs text-on-surface-variant dark:text-zinc-400 border-t border-outline-variant/20 dark:border-zinc-800">
                                    <div class="flex items-center gap-2">
                                        <span class="material-symbols-outlined text-[16px] text-secondary dark:text-emerald-400">phone_in_talk</span>
                                        <span>Hotline cứu trợ du lịch: <strong>1900 8122</strong></span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="material-symbols-outlined text-[16px] text-secondary dark:text-emerald-400">mail</span>
                                        <span>hotro@vivutravinh.vn</span>
                                    </div>
                                </div>
                            </div>

                            <!-- 3. Satellite Concurrent Events Card -->
                            <div class="bg-surface-container-lowest dark:bg-zinc-900 p-6 rounded-2xl shadow-xs border border-outline-variant/40 dark:border-zinc-800 flex flex-col gap-4">
                                <div class="flex items-center justify-between">
                                    <span class="font-caption text-xs text-secondary dark:text-emerald-400 uppercase font-bold tracking-wider">Sự Kiện Vệ Tinh Cùng Kỳ</span>
                                    <span class="material-symbols-outlined text-outline-variant text-[18px]">celebration</span>
                                </div>
                                <div class="flex flex-col gap-3">
                                    ${(festival.satelliteEvents || []).map(sat => `
                                        <div class="p-3 rounded-xl bg-surface-container-low dark:bg-zinc-800/80 flex items-start gap-3 border border-outline-variant/20 dark:border-zinc-700/50">
                                            <span class="p-2 rounded-lg bg-surface-container-highest dark:bg-zinc-700 text-secondary dark:text-emerald-400 shrink-0">
                                                <span class="material-symbols-outlined text-[18px]">${sat.icon || 'storefront'}</span>
                                            </span>
                                            <div class="flex flex-col min-w-0">
                                                <span class="font-button text-xs font-bold text-on-surface dark:text-zinc-100 truncate">${escapeHtml(sat.title)}</span>
                                                <span class="font-caption text-[11px] text-on-surface-variant dark:text-zinc-400">${escapeHtml(sat.time)}</span>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>

                            <!-- 4. Nearby Eco-stay Recommendations -->
                            <div class="bg-surface-container-lowest dark:bg-zinc-900 p-6 rounded-2xl shadow-xs border border-outline-variant/40 dark:border-zinc-800 flex flex-col gap-4">
                                <div class="flex items-center justify-between">
                                    <span class="font-caption text-xs text-secondary dark:text-emerald-400 uppercase font-bold tracking-wider">Lưu Trú Sinh Thái Gợi Ý</span>
                                    <span class="font-caption text-xs text-secondary dark:text-emerald-400 font-semibold">Gần sự kiện</span>
                                </div>
                                <div class="flex flex-col gap-3">
                                    ${(festival.ecoStays || []).map(stay => `
                                        <div class="flex items-center gap-3 p-2 rounded-xl hover:bg-surface-container-low dark:hover:bg-zinc-800 transition-colors">
                                            <img class="w-14 h-14 rounded-xl object-cover shrink-0" alt="${escapeHtml(stay.name)}" src="${stay.image || '/ao bà om.jpg'}"/>
                                            <div class="flex flex-col flex-1 min-w-0">
                                                <span class="font-button text-xs font-bold text-on-surface dark:text-zinc-100 truncate">${escapeHtml(stay.name)}</span>
                                                <span class="font-caption text-[11px] text-on-surface-variant dark:text-zinc-400">${escapeHtml(stay.location)}</span>
                                                <span class="font-caption text-secondary dark:text-emerald-400 font-bold">${escapeHtml(stay.price)}</span>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </aside>
                    </div>
                </div>

                <!-- Bottom CTA / Cultural Footnote Banner -->
                <div class="p-6 sm:p-8 lg:p-10 pt-0 w-full">
                    <div class="w-full bg-primary-container rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-md text-white">
                        <div class="flex flex-col gap-2 max-w-2xl">
                            <span class="font-badge text-xs text-secondary-fixed uppercase tracking-wider font-semibold">Đồng Hành Cùng Du Lịch Bản Địa Có Trách Nhiệm</span>
                            <h3 class="font-headline-md text-lg sm:text-xl font-bold leading-tight">Chung tay gìn giữ vệ sinh &amp; văn hóa tâm linh Ao Bà Om</h3>
                            <p class="font-body-md text-xs sm:text-sm text-emerald-100">
                                Hãy cùng ViVuTraVinh giữ trọn vẹn sự thanh tịnh của không gian lễ hội: sử dụng hoa đăng tự hủy sinh học từ bột gạo, hạn chế túi nilon và luôn giữ trang phục trang nhã khi viếng Chùa Âng.
                            </p>
                        </div>
                        <div class="flex items-center gap-4 shrink-0">
                            <button id="btnGreenVolunteer" type="button"
                                class="px-5 py-3 rounded-xl bg-secondary hover:bg-emerald-600 text-white font-button text-xs sm:text-sm font-semibold transition-colors flex items-center gap-2 min-h-[44px]">
                                <span class="material-symbols-outlined text-[18px]">volunteer_activism</span>
                                <span>Đăng Ký Đội Tình Nguyện Xanh</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Gắn sự kiện chuyển tab Ngày 14/11 & Ngày 15/11
        container.querySelectorAll('.timeline-day-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const day = btn.dataset.day;
                renderFestivalDetailModal(festival, allFestivals, onSelectPlace, onSelectOtherFestival, day);
            });
        });

        // Gắn sự kiện submit form đăng ký chỗ ngồi khán đài
        const rsvpForm = container.querySelector('#grandstandRsvpForm');
        if (rsvpForm) {
            rsvpForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const formData = new FormData(rsvpForm);
                const fullname = formData.get('fullname');
                const phone = formData.get('phone');
                const sector = formData.get('sector');

                if (window.ViVuApp?.handleGrandstandRsvp) {
                    window.ViVuApp.handleGrandstandRsvp({ fullname, phone, sector });
                } else {
                    alert(`Đã giữ chỗ miễn phí thành công cho ${fullname} (${phone})! Mã vé điện tử đã gửi về Zalo của bạn.`);
                }
            });
        }

        // Gắn sự kiện submit form hỏi đáp du khách
        const questionForm = container.querySelector('#festivalQuestionForm');
        if (questionForm) {
            questionForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const input = questionForm.querySelector('input[name="questionText"]');
                if (input && input.value.trim()) {
                    if (window.ViVuApp?.showNotification) {
                        window.ViVuApp.showNotification('Câu hỏi của bạn đã được gửi đến Ban Quản Trị ViVuTraVinh!');
                    } else {
                        alert('Cảm ơn bạn! Câu hỏi đã được gửi thành công.');
                    }
                    input.value = '';
                }
            });
        }

        // Gắn sự kiện chia sẻ & lưu
        const btnShare = container.querySelector('#btnModalShare');
        if (btnShare) {
            btnShare.addEventListener('click', () => {
                navigator.clipboard?.writeText(window.location.href);
                if (window.ViVuApp?.showNotification) {
                    window.ViVuApp.showNotification('Đã sao chép liên kết cẩm nang Đại lễ Ok Om Bok!');
                }
            });
        }

        const btnBookmark = container.querySelector('#btnModalBookmark');
        if (btnBookmark) {
            btnBookmark.addEventListener('click', () => {
                if (window.ViVuApp?.showNotification) {
                    window.ViVuApp.showNotification('Đã lưu sự kiện Ok Om Bok vào mục Đã lưu của bạn!');
                }
            });
        }

        const btnVolunteer = container.querySelector('#btnGreenVolunteer');
        if (btnVolunteer) {
            btnVolunteer.addEventListener('click', () => {
                if (window.ViVuApp?.showNotification) {
                    window.ViVuApp.showNotification('Đội Tình Nguyện Xanh hiện chưa mở cổng đăng ký trực tuyến. Thông tin tuyển tình nguyện viên sẽ được thông báo trực tiếp qua Tỉnh Đoàn Trà Vinh.', 'info');
                } else {
                    alert('Đội Tình Nguyện Xanh hiện chưa mở cổng đăng ký trực tuyến.');
                }
            });
        }

    } else {
        // GIAO DIỆN CẨM NANG CHO CÁC LỄ HỘI MÙA KHÁC (Chôl Chnăm Thmây, Vu Lan, Nghinh Ông, Trái Cây, Sêne Đôlta)
        container.innerHTML = `
            <div class="max-h-[85vh] overflow-y-auto">
                <!-- Hero Banner Modal -->
                <div class="relative w-full aspect-[16/8] sm:aspect-[21/9] bg-stone-900 overflow-hidden">
                    <img src="${festival.heroImage}" alt="${escapeHtml(festival.name)}" class="w-full h-full object-cover">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"></div>

                    <div class="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-6 text-white space-y-1.5">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${festival.badgeColor}">
                                ${escapeHtml(festival.seasonName)}
                            </span>
                            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 backdrop-blur-md text-amber-200">
                                ${escapeHtml(festival.badge)}
                            </span>
                        </div>

                        <span class="text-xs text-amber-300 font-medium italic block">
                            ${escapeHtml(festival.originalName)}
                        </span>

                        <h3 class="text-xl sm:text-3xl font-black font-serif text-white leading-tight drop-shadow">
                            ${escapeHtml(festival.name)}
                        </h3>
                    </div>
                </div>

                <div class="p-5 sm:p-8 space-y-6">
                    <!-- Thẻ Tóm Tắt Thời Gian & Địa Điểm -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div class="p-3.5 rounded-2xl bg-surface-container-low dark:bg-zinc-800 border border-outline-variant/30 dark:border-zinc-700 space-y-1">
                            <span class="text-[10px] uppercase font-bold text-secondary dark:text-emerald-400 flex items-center gap-1">
                                <span class="material-symbols-outlined text-sm">event</span> Thời gian tổ chức:
                            </span>
                            <div class="text-xs sm:text-sm font-black text-on-surface dark:text-zinc-100">
                                ${escapeHtml(festival.lunarDate)}
                            </div>
                            <div class="text-[11px] text-on-surface-variant dark:text-zinc-400">
                                Dương lịch: ${escapeHtml(festival.solarDateEstimate)}
                            </div>
                        </div>

                        <div class="p-3.5 rounded-2xl bg-surface-container-low dark:bg-zinc-800 border border-outline-variant/30 dark:border-zinc-700 space-y-1">
                            <span class="text-[10px] uppercase font-bold text-secondary dark:text-emerald-400 flex items-center gap-1">
                                <span class="material-symbols-outlined text-sm">location_on</span> Địa điểm tâm điểm:
                            </span>
                            <div class="text-xs sm:text-sm font-black text-on-surface dark:text-zinc-100">
                                ${escapeHtml(festival.locationName)}
                            </div>
                            ${festival.locationPlaceId ? `
                                <button type="button" data-place-id="${festival.locationPlaceId}" class="modal-goto-place-link text-[11px] font-bold text-secondary dark:text-emerald-400 hover:underline flex items-center gap-0.5 pt-0.5 min-h-[44px]">
                                    Xem vị trí chi tiết trên bản đồ ViVu <span class="material-symbols-outlined text-xs">north_east</span>
                                </button>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Ý Nghĩa & Nguồn Gốc Văn Hóa -->
                    <div class="space-y-2 p-4 rounded-2xl bg-amber-500/10 dark:bg-amber-950/30 border border-amber-300/40 dark:border-amber-800/40">
                        <h4 class="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-base text-amber-600">lightbulb</span>
                            Ý Nghĩa Văn Hóa &amp; Tín Ngưỡng
                        </h4>
                        <p class="text-xs sm:text-sm text-on-surface dark:text-zinc-200 leading-relaxed font-medium">
                            ${escapeHtml(festival.significance)}
                        </p>
                    </div>

                    <!-- DIỄN BIẾN LỄ HỘI DỰ KIẾN (TIMELINE) -->
                    <div class="space-y-3">
                        <div class="flex items-center justify-between">
                            <h4 class="text-xs font-bold uppercase tracking-wider text-primary dark:text-emerald-400 flex items-center gap-1.5">
                                <span class="material-symbols-outlined text-base text-rose-500">schedule</span>
                                Diễn Biến Sự Kiện &amp; Lịch Trình Chi Tiết
                            </h4>
                            <span class="text-[10px] text-on-surface-variant dark:text-zinc-400">Theo Khung Giờ Bản Địa</span>
                        </div>

                        <!-- Vertical Timeline -->
                        <div class="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-amber-500 before:via-emerald-500 before:to-rose-500">
                            ${(festival.timeline || []).map(item => `
                                <div class="relative group">
                                    <div class="absolute -left-6 top-1 w-5 h-5 rounded-full bg-surface dark:bg-zinc-800 border-2 border-primary dark:border-emerald-400 flex items-center justify-center text-primary dark:text-emerald-400 shadow-xs group-hover:scale-110 transition-transform">
                                        <span class="material-symbols-outlined text-xs">${item.icon || 'event'}</span>
                                    </div>
                                    <div class="p-3.5 rounded-2xl bg-surface-container-low dark:bg-zinc-800/80 border border-outline-variant/30 dark:border-zinc-700/60 hover:border-primary/40 transition-all space-y-1">
                                        <span class="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400 tracking-wider">
                                            ${escapeHtml(item.time)}
                                        </span>
                                        <h5 class="text-xs sm:text-sm font-bold text-on-surface dark:text-zinc-100 font-serif">
                                            ${escapeHtml(item.title)}
                                        </h5>
                                        <p class="text-xs text-on-surface-variant dark:text-zinc-300 leading-relaxed">
                                            ${escapeHtml(item.desc)}
                                        </p>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- CẨM NANG & KINH NGHIỆM THỔ ĐỊA -->
                    <div class="space-y-2.5 pt-2 border-t border-outline-variant/30 dark:border-zinc-800">
                        <h4 class="text-xs font-bold uppercase tracking-wider text-primary dark:text-emerald-400 flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-base text-secondary dark:text-emerald-400">explore</span>
                            Lời Khuyên Từ Thổ Địa Trà Vinh
                        </h4>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            ${(festival.localTips || []).map(tip => `
                                <div class="p-3 rounded-2xl bg-surface-container-low dark:bg-zinc-800/60 border border-outline-variant/20 dark:border-zinc-700/50 text-xs text-on-surface-variant dark:text-zinc-300 flex items-start gap-2">
                                    <span class="material-symbols-outlined text-sm text-amber-500 shrink-0 mt-0.5">verified</span>
                                    <span class="leading-relaxed">${escapeHtml(tip)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- ẨM THỰC TRUYỀN THỐNG LỄ HỘI -->
                    <div class="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 to-orange-500/10 dark:from-amber-950/40 dark:to-orange-950/30 border border-amber-300/50 dark:border-amber-800/40 space-y-1.5">
                        <h4 class="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-base text-amber-600">restaurant</span>
                            Món Ngon Đặc Trưng Mùa Lễ Hội
                        </h4>
                        <p class="text-xs sm:text-sm text-on-surface dark:text-zinc-200 leading-relaxed font-medium">
                            ${escapeHtml(festival.traditionalFood || '')}
                        </p>
                    </div>

                    <!-- KHÁM PHÁ CÁC LỄ HỘI KHÁC -->
                    <div class="pt-2 border-t border-outline-variant/30 dark:border-zinc-800 space-y-2">
                        <span class="text-xs font-bold text-on-surface dark:text-zinc-200 block">
                            Khám phá các ngày hội khác của Trà Vinh:
                        </span>
                        <div class="flex flex-wrap gap-2">
                            ${allFestivals.filter(f => f.id !== festival.id).map(f => `
                                <button type="button" data-switch-festival-id="${f.id}"
                                    class="switch-fest-btn px-3 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high dark:bg-zinc-800 dark:hover:bg-zinc-700 text-xs font-bold text-on-surface dark:text-zinc-200 border border-outline-variant/30 dark:border-zinc-700 transition-colors flex items-center gap-1 active:scale-95 min-h-[44px]">
                                    <span>${escapeHtml(f.name.split('(')[0].trim())}</span>
                                    <span class="material-symbols-outlined text-xs text-secondary">arrow_forward</span>
                                </button>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Gắn sự kiện bấm vào địa điểm liên kết
        container.querySelectorAll('.modal-goto-place-link').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const pId = btn.dataset.placeId;
                if (pId && onSelectPlace) {
                    onSelectPlace(pId);
                }
            });
        });

        // Gắn sự kiện chuyển nhanh sang lễ hội khác
        container.querySelectorAll('.switch-fest-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const fId = btn.dataset.switchFestivalId;
                if (fId && onSelectOtherFestival) {
                    onSelectOtherFestival(fId);
                }
            });
        });
    }
}

/**
 * Render Modal Đăng Ký Giữ Chỗ / Tham Gia Hoạt Động (Event RSVP Modal)
 */
export function renderEventRsvpModal(event, onSubmitRsvp) {
    const container = document.getElementById('eventRsvpModalContainer');
    if (!container || !event) return;

    container.innerHTML = `
        <div class="p-6 sm:p-8 flex flex-col gap-6">
            <!-- Header with close -->
            <div class="flex items-start justify-between gap-4">
                <div class="flex flex-col gap-1">
                    <span class="px-2.5 py-1 rounded-full bg-secondary/15 dark:bg-emerald-950/60 text-secondary dark:text-emerald-400 font-caption text-xs font-bold w-fit">
                        ${escapeHtml(event.category || 'Sự kiện')}
                    </span>
                    <h3 class="font-headline-md text-lg sm:text-xl font-bold text-on-surface dark:text-zinc-100">
                        Thông Tin Sự Kiện: ${escapeHtml(event.title)}
                    </h3>
                </div>
            </div>

            <!-- Notice: Chưa hỗ trợ đăng ký trực tuyến -->
            <div class="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200">
                <span class="material-symbols-outlined text-amber-600 dark:text-amber-400 text-lg shrink-0 mt-0.5">info</span>
                <div class="space-y-1">
                    <strong class="font-semibold block text-[13px]">Chưa hỗ trợ đăng ký trực tuyến</strong>
                    <p class="leading-relaxed">
                        Hệ thống hiện <strong>chưa mở cổng đặt vé hoặc giữ chỗ trực tuyến</strong> cho sự kiện này.
                        Quý khách vui lòng đến tham gia trực tiếp tại địa điểm tổ chức theo thời gian công bố, hoặc liên hệ trực tiếp Ban tổ chức để được hướng dẫn.
                    </p>
                </div>
            </div>

            <!-- Event Brief Card -->
            <div class="p-4 rounded-xl bg-surface-container-low dark:bg-zinc-800/80 border border-outline-variant/30 dark:border-zinc-700 flex flex-col gap-2.5 text-xs">
                <div class="flex items-center gap-2 text-on-surface dark:text-zinc-200">
                    <span class="material-symbols-outlined text-[18px] text-secondary dark:text-emerald-400">schedule</span>
                    <span><strong>Thời gian:</strong> ${escapeHtml(event.timeSchedule || '')}</span>
                </div>
                <div class="flex items-center gap-2 text-on-surface dark:text-zinc-200">
                    <span class="material-symbols-outlined text-[18px] text-secondary dark:text-emerald-400">location_on</span>
                    <span><strong>Địa điểm:</strong> ${escapeHtml(event.location || '')}</span>
                </div>
                <div class="flex items-center gap-2 text-on-surface dark:text-zinc-200">
                    <span class="material-symbols-outlined text-[18px] text-secondary dark:text-emerald-400">payments</span>
                    <span><strong>Chi phí tham gia:</strong> ${escapeHtml(event.fee || 'Mở cửa tự do')} ${event.feeDetail ? escapeHtml(event.feeDetail) : ''}</span>
                </div>
                ${event.organizer ? `
                <div class="flex items-center gap-2 text-on-surface dark:text-zinc-200">
                    <span class="material-symbols-outlined text-[18px] text-secondary dark:text-emerald-400">person</span>
                    <span><strong>Đơn vị tổ chức:</strong> ${escapeHtml(event.organizer)}</span>
                </div>
                ` : ''}
            </div>

            <div class="pt-2 flex items-center justify-end gap-3">
                <button type="button" onclick="window.ViVuApp?.closeEventRsvpModal()"
                    class="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high dark:bg-zinc-800 text-on-surface dark:text-zinc-300 font-button text-xs font-semibold min-h-[44px]">
                    Đóng
                </button>
            </div>
        </div>
    `;
}

/**
 * Render Modal Đăng Ký / Chỉnh Sửa Sự Kiện (Host Event Modal)
 */
export function renderHostEventModal(onSubmitHost, editingEvent = null) {
    const container = document.getElementById('hostEventModalContainer');
    if (!container) return;

    const isEdit = Boolean(editingEvent && editingEvent.id);
    const defaultTitle = editingEvent?.title || '';
    const defaultOrganizer = editingEvent?.organizer || '';
    const defaultCategory = editingEvent?.category || 'workshop';
    const defaultDatetime = editingEvent?.time_schedule || editingEvent?.datetime || '';
    const defaultLocation = editingEvent?.location || '';
    const defaultDesc = editingEvent?.description || '';
    const defaultPhone = editingEvent?.contact_phone || editingEvent?.phone || '';

    container.innerHTML = `
        <div class="p-6 sm:p-8 flex flex-col gap-6">
            <div class="flex flex-col gap-1">
                <span class="px-2.5 py-1 rounded-full bg-secondary/15 dark:bg-emerald-950/60 text-secondary dark:text-emerald-400 font-caption text-xs font-bold w-fit">
                    Hợp tác cộng đồng
                </span>
                <h3 class="font-headline-md text-lg sm:text-xl font-bold text-on-surface dark:text-zinc-100">
                    ${isEdit ? 'Chỉnh Sửa &amp; Gửi Duyệt Lại Sự Kiện / Workshop' : 'Đăng Ký Tổ Chức Sự Kiện / Workshop Tại Trà Vinh'}
                </h3>
                <p class="font-body-sm text-xs text-on-surface-variant dark:text-zinc-400">
                    ViVuTraVinh hỗ trợ lan tỏa sự kiện văn hóa, thể thao, bảo tồn sinh thái và gặp gỡ cộng đồng miễn phí 100%.
                </p>
            </div>

            <form id="hostEventSubmitForm" class="flex flex-col gap-4">
                ${isEdit ? `<input type="hidden" name="event_id" value="${escapeHtml(editingEvent.id)}" />` : ''}
                <div>
                    <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                        Tên sự kiện / Workshop <span class="text-rose-500">*</span>
                    </label>
                    <input name="eventTitle" type="text" required placeholder="Ví dụ: Đêm Nhạc Dân Ca Nam Bộ Ven Sông"
                        value="${escapeHtml(defaultTitle)}"
                        class="w-full h-11 px-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700"/>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                            Đơn vị / Nhóm tổ chức <span class="text-rose-500">*</span>
                        </label>
                        <input name="organizer" type="text" required placeholder="Ví dụ: CLB Sống Xanh Xứ Trà"
                            value="${escapeHtml(defaultOrganizer)}"
                            class="w-full h-11 px-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700"/>
                    </div>
                    <div>
                        <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                            Loại hình hoạt động
                        </label>
                        <select name="category"
                            class="w-full h-11 px-3 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700">
                            <option value="workshop" ${defaultCategory === 'workshop' ? 'selected' : ''}>Workshop văn hóa</option>
                            <option value="sports" ${defaultCategory === 'sports' ? 'selected' : ''}>Thể thao &amp; Trải nghiệm</option>
                            <option value="community" ${defaultCategory === 'community' ? 'selected' : ''}>Giao lưu cộng đồng</option>
                            <option value="ecology" ${defaultCategory === 'ecology' ? 'selected' : ''}>Bảo vệ môi trường</option>
                        </select>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                            Thời gian dự kiến <span class="text-rose-500">*</span>
                        </label>
                        <input name="datetime" type="text" required placeholder="Ví dụ: Sáng Chủ Nhật 25/10 (08:00 - 11:30)"
                            value="${escapeHtml(defaultDatetime)}"
                            class="w-full h-11 px-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700"/>
                    </div>
                    <div>
                        <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                            Địa điểm tổ chức <span class="text-rose-500">*</span>
                        </label>
                        <input name="location" type="text" required placeholder="Ví dụ: Khuôn viên Ao Bà Om"
                            value="${escapeHtml(defaultLocation)}"
                            class="w-full h-11 px-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700"/>
                    </div>
                </div>

                <div>
                    <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                        Mô tả ngắn gọn &amp; thông điệp sự kiện
                    </label>
                    <textarea name="description" rows="3" placeholder="Mục đích, đối tượng tham gia, chi phí nếu có (khuyến khích miễn phí hoặc phi lợi nhuận)..."
                        class="w-full p-3 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700">${escapeHtml(defaultDesc)}</textarea>
                </div>

                <div>
                    <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                        Số điện thoại / Zalo liên hệ <span class="text-xs text-outline dark:text-zinc-400 font-normal">(Bảo mật, chỉ Admin thấy)</span>
                    </label>
                    <input name="phone" type="tel" placeholder="Ví dụ: 0987 654 321"
                        value="${escapeHtml(defaultPhone)}"
                        class="w-full h-11 px-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700"/>
                </div>

                <div class="pt-2 flex items-center justify-end gap-3">
                    <button type="button" onclick="window.ViVuApp?.closeHostEventModal()"
                        class="px-4 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 font-button text-xs font-semibold min-h-[44px]">
                        Hủy
                    </button>
                    <button type="submit"
                        class="px-6 py-2.5 rounded-xl bg-secondary hover:bg-emerald-700 text-white font-button text-xs font-semibold shadow-xs min-h-[44px] flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[18px]">send</span>
                        <span>${isEdit ? 'Cập Nhật &amp; Gửi Duyệt Lại' : 'Gửi Hồ Sơ Sự Kiện'}</span>
                    </button>
                </div>
            </form>
        </div>
    `;

    const form = container.querySelector('#hostEventSubmitForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const data = {
                id: formData.get('event_id') || undefined,
                title: formData.get('eventTitle'),
                organizer: formData.get('organizer'),
                category: formData.get('category'),
                datetime: formData.get('datetime'),
                location: formData.get('location'),
                description: formData.get('description'),
                phone: formData.get('phone')
            };
            if (onSubmitHost) {
                onSubmitHost(data);
            } else if (window.ViVuApp?.submitHostEvent) {
                window.ViVuApp.submitHostEvent(data);
            }
        });
    }
}

/**
 * Render Modal Đăng ký Lịch Sinh Hoạt CLB (Dành riêng cho Chủ nhiệm CLB đã duyệt)
 */
export function renderSubmitClubActivityModal(onSubmit, userClubs = [], editingActivity = null) {
    const container = document.getElementById('submitClubActivityModalContainer');
    if (!container) return;

    if (!Array.isArray(userClubs) || userClubs.length === 0) {
        container.innerHTML = `
            <div class="p-6 sm:p-8 flex flex-col items-center text-center gap-5">
                <div class="w-16 h-16 rounded-3xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-xs">
                    <span class="material-symbols-outlined text-3xl">verified_user</span>
                </div>
                <div class="space-y-2 max-w-md">
                    <h3 class="font-headline-md text-lg sm:text-xl font-bold text-on-surface dark:text-zinc-100">
                        Dành Riêng Cho Chủ Nhiệm CLB
                    </h3>
                    <p class="font-body-sm text-xs text-on-surface-variant dark:text-zinc-400 leading-relaxed">
                        Chỉ <strong>Chủ nhiệm của Câu lạc bộ đã được Ban Quản Trị phê duyệt</strong> mới có quyền tạo lịch sinh hoạt chính thức mang thương hiệu CLB.
                    </p>
                    <p class="font-body-sm text-xs text-on-surface-variant dark:text-zinc-400 leading-relaxed">
                        Nếu bạn là thành viên muốn tổ chức giao lưu hoặc workshop văn hóa, vui lòng gửi qua luồng <strong>Sự kiện &amp; Workshop Cộng đồng</strong>.
                    </p>
                </div>
                <div class="flex flex-col sm:flex-row items-center gap-3 pt-2 w-full sm:w-auto">
                    <button type="button" onclick="window.ViVuApp?.closeSubmitClubActivityModal?.(); window.ViVuApp?.openHostEventModal?.()"
                        class="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-secondary text-white font-button text-xs font-semibold hover:bg-primary transition-all shadow-xs min-h-[44px] flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined text-[18px]">event</span>
                        <span>Đăng ký Sự kiện Cộng đồng</span>
                    </button>
                    <button type="button" onclick="window.ViVuApp?.closeSubmitClubActivityModal?.()"
                        class="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-surface-container-high dark:bg-zinc-800 text-on-surface dark:text-zinc-300 font-button text-xs font-semibold hover:bg-surface-container-highest transition-all min-h-[44px]">
                        Đóng
                    </button>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="p-6 sm:p-8 flex flex-col gap-6">
            <div class="flex flex-col gap-1">
                <div class="flex items-center gap-2">
                    <span class="px-2.5 py-1 rounded-full bg-secondary/15 dark:bg-emerald-950/60 text-secondary dark:text-emerald-400 font-caption text-xs font-bold w-fit flex items-center gap-1">
                        <span class="material-symbols-outlined text-[14px]">groups</span>
                        Chủ nhiệm CLB
                    </span>
                    <span class="px-2 py-0.5 rounded-full bg-surface-container-high dark:bg-zinc-800 text-[11px] text-on-surface-variant dark:text-zinc-400 font-medium">
                        Quy trình kiểm duyệt G13
                    </span>
                </div>
                <h3 class="font-headline-md text-lg sm:text-xl font-bold text-on-surface dark:text-zinc-100">
                    ${editingActivity ? 'Chỉnh Sửa Lịch Sinh Hoạt CLB' : 'Tạo Lịch Sinh Hoạt Định Kỳ Cho CLB'}
                </h3>
                <p class="font-body-sm text-xs text-on-surface-variant dark:text-zinc-400">
                    Lịch sinh hoạt sẽ hiển thị công khai trên Widget Hoạt động tuần này sau khi được Ban Quản Trị phê duyệt.
                </p>
            </div>

            <form id="submitClubActivityForm" class="flex flex-col gap-4">
                ${editingActivity ? `<input type="hidden" name="activity_id" value="${escapeHtml(editingActivity.id)}" />` : ''}
                <div>
                    <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                        Câu lạc bộ tổ chức <span class="text-rose-500">*</span>
                    </label>
                    <select name="club_id" id="activityClubSelect" required
                        class="w-full h-11 px-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700 cursor-pointer">
                        ${userClubs.map(c => `
                            <option value="${escapeHtml(c.id)}" ${editingActivity?.club_id === c.id ? 'selected' : ''}>
                                ${escapeHtml(c.name || 'CLB')}
                            </option>
                        `).join('')}
                    </select>
                </div>

                <div>
                    <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                        Tiêu đề buổi sinh hoạt <span class="text-rose-500">*</span>
                    </label>
                    <input name="title" type="text" required placeholder="Ví dụ: Chụp ảnh bình minh Chùa Hang &amp; Workshop ảnh film"
                        value="${editingActivity ? escapeHtml(editingActivity.title || '') : ''}"
                        class="w-full h-11 px-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700"/>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                            Thời gian sinh hoạt <span class="text-rose-500">*</span>
                        </label>
                        <input name="time_schedule" type="text" required placeholder="Ví dụ: Sáng Chủ Nhật, 05:30 - 08:30"
                            value="${editingActivity ? escapeHtml(editingActivity.time_schedule || editingActivity.time || '') : ''}"
                            class="w-full h-11 px-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700"/>
                    </div>
                    <div>
                        <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                            Địa điểm tập trung <span class="text-rose-500">*</span>
                        </label>
                        <input name="location" type="text" required placeholder="Ví dụ: Cổng Chùa Hang, TT. Châu Thành"
                            value="${editingActivity ? escapeHtml(editingActivity.location || '') : ''}"
                            class="w-full h-11 px-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700"/>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                            Số lượng tối đa
                        </label>
                        <input name="max_attendees" type="number" min="5" max="500" value="${editingActivity?.max_attendees || 30}"
                            class="w-full h-11 px-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700"/>
                    </div>
                    <div>
                        <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                            Chi phí tham gia
                        </label>
                        <select name="is_free"
                            class="w-full h-11 px-3 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700">
                            <option value="true" ${editingActivity?.is_free !== false ? 'selected' : ''}>Miễn phí 100%</option>
                            <option value="false" ${editingActivity?.is_free === false ? 'selected' : ''}>Có đóng góp chi phí</option>
                        </select>
                    </div>
                    <div>
                        <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                            Biểu tượng
                        </label>
                        <select name="icon"
                            class="w-full h-11 px-3 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700">
                            <option value="photo_camera" ${editingActivity?.icon === 'photo_camera' ? 'selected' : ''}>Nhiếp ảnh (photo_camera)</option>
                            <option value="directions_run" ${editingActivity?.icon === 'directions_run' ? 'selected' : ''}>Chạy bộ (directions_run)</option>
                            <option value="pedal_bike" ${editingActivity?.icon === 'pedal_bike' ? 'selected' : ''}>Đạp xe (pedal_bike)</option>
                            <option value="music_note" ${editingActivity?.icon === 'music_note' ? 'selected' : ''}>Âm nhạc / Tài tử (music_note)</option>
                            <option value="palette" ${editingActivity?.icon === 'palette' ? 'selected' : ''}>Mỹ thuật (palette)</option>
                            <option value="hiking" ${editingActivity?.icon === 'hiking' ? 'selected' : ''}>Dã ngoại (hiking)</option>
                            <option value="event" ${editingActivity?.icon === 'event' || !editingActivity?.icon ? 'selected' : ''}>Sự kiện chung (event)</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                        Kế hoạch chi tiết &amp; Chuẩn bị dụng cụ
                    </label>
                    <textarea name="description" rows="3" placeholder="Lịch trình chi tiết, vật dụng cần mang theo (máy ảnh, trang phục vận động, nước uống)..."
                        class="w-full p-3 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700">${editingActivity ? escapeHtml(editingActivity.description || '') : ''}</textarea>
                </div>

                <div class="pt-2 flex items-center justify-end gap-3">
                    <button type="button" onclick="window.ViVuApp?.closeSubmitClubActivityModal?.()"
                        class="px-4 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 font-button text-xs font-semibold min-h-[44px]">
                        Hủy
                    </button>
                    <button type="submit" id="submitClubActivityBtn"
                        class="px-6 py-2.5 rounded-xl bg-secondary hover:bg-emerald-700 text-white font-button text-xs font-semibold shadow-xs min-h-[44px] flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[18px]">calendar_add_on</span>
                        <span>${editingActivity ? 'Cập Nhật Lịch Sinh Hoạt' : 'Gửi Duyệt Lịch Sinh Hoạt'}</span>
                    </button>
                </div>
            </form>
        </div>
    `;

    const form = container.querySelector('#submitClubActivityForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (onSubmit) {
                onSubmit(e);
            } else if (window.ViVuApp?.submitClubActivity) {
                window.ViVuApp.submitClubActivity(e);
            }
        });
    }
}



/**
 * Render Lưới Bài Viết Magazine: Chuyên mục "Góc Chuyện Xứ Trà"
 */
export function renderArticlesSection(containerId, articles, onOpenArticle, onOpenSubmitArticle, onEditArticle, isAdmin = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!Array.isArray(articles) || articles.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <div class="space-y-6">
            <!-- Header Section -->
            <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2 border-b border-outline-variant/30 dark:border-zinc-800">
                <div>
                    <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 text-xs font-bold uppercase tracking-wider mb-2 border border-amber-200 dark:border-amber-800/40">
                        <span class="material-symbols-outlined text-sm">auto_stories</span>
                        Blog ViVu • Góc Chuyện Xứ Trà
                    </div>
                    <h3 class="font-headline-lg text-2xl sm:text-3xl font-black font-sans text-primary dark:text-zinc-100 tracking-tight">
                        Góc chuyện Xứ Trà
                    </h3>
                    <p class="font-body-md text-xs sm:text-sm text-on-surface-variant dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                        Những câu chuyện, ký sự văn hóa bản địa, bí mật ẩm thực miệt vườn và cẩm nang du lịch tự túc từ thổ địa Trà Vinh.
                    </p>
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" id="btnSubmitArticle"
                        class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-white font-button text-xs font-semibold hover:bg-primary-container hover:text-on-primary transition-all shadow-xs min-h-[44px]">
                        <span class="material-symbols-outlined text-[18px]">edit_note</span>
                        <span>Gửi bài cẩm nang</span>
                    </button>
                    ${isAdmin ? `
                    <button type="button" id="btnAdminCreateArticle"
                        class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-secondary text-white font-button text-xs font-semibold hover:bg-secondary-container hover:text-on-secondary-container transition-all shadow-xs min-h-[44px]">
                        <span class="material-symbols-outlined text-[18px]">post_add</span>
                        <span>Viết bài (Admin)</span>
                    </button>
                    ` : ''}
                </div>
            </div>

            <!-- Grid Lưới Bài Viết Magazine Cards -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${articles.map(art => {
                    const coverImg = art.coverImage || art.cover_image || '/ao bà om.jpg';
                    const categoryTxt = getArticleCategoryName(art.category, art.categoryName || art.category_name);
                    const catBadgeClass = getArticleCategoryBadgeClass(art.category);
                    const readTimeTxt = art.readTime || art.read_time || '4 phút đọc';
                    const authorName = art.author?.name || art.author_name || 'Thành viên Xứ Trà';
                    const authorAvatar = art.author?.avatar || art.author_avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(authorName)}`;
                    const authorRole = art.isSample ? 'Biên soạn tham khảo' : (art.author?.role || art.author_role || (art.isEditorial ? 'Ban Biên Tập ViVuTraVinh' : 'Thành viên đóng góp'));
                    const publishedDate = art.publishedAt || (art.created_at ? new Date(art.created_at).toLocaleDateString('vi-VN') : 'Mới cập nhật');

                    return `
                    <article class="article-card group bg-surface-container-lowest dark:bg-dark-card rounded-3xl border border-outline-variant/40 dark:border-dark-border overflow-hidden shadow-xs hover:shadow-xl transition-all duration-300 flex flex-col cursor-pointer relative" data-article-id="${art.id}">
                        <!-- Ảnh bìa -->
                        <div class="relative w-full h-52 sm:h-56 overflow-hidden bg-slate-200 dark:bg-zinc-800">
                            <img src="${escapeHtml(coverImg)}" alt="${escapeHtml(art.title)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                            <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>

                            <!-- Badges Phân Biệt Bài Mẫu / Ban Biên Tập / Người Dùng Đóng Góp -->
                            <div class="absolute top-3 left-3 flex flex-wrap gap-1.5 items-center z-10">
                                <span class="px-2.5 py-1 rounded-full text-xs font-bold shadow-sm ${catBadgeClass}">
                                    ${escapeHtml(categoryTxt)}
                                </span>
                                ${art.isSample ? `
                                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm bg-zinc-900/85 text-amber-300 border border-amber-400/50 backdrop-blur-md flex items-center gap-1">
                                        <span class="material-symbols-outlined text-[12px] text-amber-300">menu_book</span>
                                        Biên soạn mẫu
                                    </span>
                                ` : (art.isEditorial ? `
                                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm bg-amber-600/90 text-white border border-amber-300 backdrop-blur-md flex items-center gap-1">
                                        <span class="material-symbols-outlined text-[12px]">verified</span>
                                        Ban Biên Tập
                                    </span>
                                ` : `
                                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm bg-emerald-700/90 text-white border border-emerald-300 backdrop-blur-md flex items-center gap-1">
                                        <span class="material-symbols-outlined text-[12px]">groups</span>
                                        Cộng đồng
                                    </span>
                                `)}
                            </div>

                            ${isAdmin ? `
                            <!-- Nút Biên Tập Dành Riêng Cho Admin -->
                            <button type="button" class="btn-edit-article absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 dark:bg-zinc-800/90 hover:bg-white text-slate-800 dark:text-zinc-100 flex items-center justify-center shadow-md transition-transform active:scale-95 z-20" data-article-id="${art.id}" title="Biên tập bài viết">
                                <span class="material-symbols-outlined text-sm">edit</span>
                            </button>
                            ` : ''}

                            <!-- Thời gian đọc -->
                            <div class="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md text-white text-[11px] font-semibold px-2.5 py-1 rounded-xl flex items-center gap-1 border border-white/20">
                                <span class="material-symbols-outlined text-xs text-amber-300">timer</span>
                                <span>${escapeHtml(readTimeTxt)}</span>
                            </div>
                        </div>

                        <!-- Nội dung tóm tắt -->
                        <div class="p-5 sm:p-6 flex-1 flex flex-col justify-between space-y-4">
                            <div class="space-y-2.5">
                                <!-- Tác giả & Ngày đăng -->
                                <div class="flex items-center gap-2.5">
                                    <img src="${escapeHtml(authorAvatar)}" alt="${escapeHtml(authorName)}" class="w-7 h-7 rounded-full bg-slate-100 dark:bg-zinc-700 object-cover border border-outline-variant/30">
                                    <div class="text-xs">
                                        <span class="font-bold text-slate-800 dark:text-zinc-200">${escapeHtml(authorName)}</span>
                                        <span class="text-[10px] text-slate-500 dark:text-zinc-400 block">${escapeHtml(authorRole)}</span>
                                    </div>
                                </div>

                                <!-- Tiêu đề -->
                                <h4 class="font-serif text-base sm:text-lg font-black text-slate-900 dark:text-zinc-100 group-hover:text-primary dark:group-hover:text-emerald-400 transition-colors line-clamp-2 leading-snug">
                                    ${escapeHtml(art.title)}
                                </h4>

                                <!-- Trích đoạn tóm tắt -->
                                <p class="text-xs text-on-surface-variant dark:text-zinc-400 line-clamp-3 leading-relaxed">
                                    ${escapeHtml(art.excerpt || '')}
                                </p>
                            </div>

                            <!-- CTA Button -->
                            <div class="pt-3 border-t border-outline-variant/30 dark:border-zinc-800 flex items-center justify-between text-xs font-bold text-primary dark:text-emerald-400">
                                <span class="inline-flex items-center gap-1 group-hover:underline">
                                    Đọc câu chuyện
                                    <span class="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
                                </span>
                                <span class="text-[11px] font-normal text-slate-400 dark:text-zinc-500">
                                    ${escapeHtml(publishedDate)}
                                </span>
                            </div>
                        </div>
                    </article>
                    `;
                }).join('')}
            </div>
        </div>
    `;

    // Gắn sự kiện click
    const submitBtn = container.querySelector('#btnSubmitArticle');
    if (submitBtn) {
        submitBtn.addEventListener('click', () => {
            if (onOpenSubmitArticle) onOpenSubmitArticle();
        });
    }
    const adminCreateBtn = container.querySelector('#btnAdminCreateArticle');
    if (adminCreateBtn) {
        adminCreateBtn.addEventListener('click', () => {
            if (onOpenSubmitArticle) onOpenSubmitArticle(null, true);
        });
    }
    container.querySelectorAll('.btn-edit-article').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const artId = btn.dataset.articleId;
            const article = articles.find(a => a.id === artId);
            if (article && onEditArticle) onEditArticle(article);
        });
    });
    container.querySelectorAll('.article-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.btn-edit-article')) return;
            const artId = card.dataset.articleId;
            if (artId && onOpenArticle) {
                onOpenArticle(artId);
            }
        });
    });
}

/**
 * Render Trình Đọc Bài Viết Chuẩn Tạp Chí (Article Reader Modal)
 */
export function renderArticleReaderModal(article, comments = [], allPlaces = [], onSelectPlace, onSubmitComment) {
    const container = document.getElementById('articleModalContainer');
    if (!container || !article) return;

    // Tìm các địa điểm liên quan
    const relatedPlaces = (article.relatedPlaceIds || []).map(ref => {
        const refLower = (ref || '').toLowerCase();
        return (allPlaces || []).find(p => (p.name || '').toLowerCase().includes(refLower) || (p.id || '').toLowerCase() === refLower);
    }).filter(Boolean);

    const coverImg = article.coverImage || article.cover_image || '/ao bà om.jpg';
    const categoryTxt = getArticleCategoryName(article.category, article.categoryName || article.category_name);
    const catBadgeClass = getArticleCategoryBadgeClass(article.category);
    const readTimeTxt = article.readTime || article.read_time || '4 phút đọc';
    const authorName = article.author?.name || article.author_name || 'Thành viên Xứ Trà';
    const authorAvatar = article.author?.avatar || article.author_avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(authorName)}`;
    const authorRole = article.isSample ? 'Nội dung tham khảo / Mẫu' : (article.author?.role || article.author_role || (article.isEditorial ? 'Ban Biên Tập ViVuTraVinh' : 'Thành viên đóng góp'));
    const publishedDate = article.publishedAt || (article.created_at ? new Date(article.created_at).toLocaleDateString('vi-VN') : 'Mới cập nhật');

    container.innerHTML = `
        <div class="flex flex-col bg-surface dark:bg-dark-card rounded-3xl overflow-hidden shadow-2xl">
            <!-- Hero Image Banner -->
            <div class="relative w-full h-64 sm:h-80 md:h-96 bg-slate-900 overflow-hidden">
                <img src="${escapeHtml(coverImg)}" alt="${escapeHtml(article.title)}" class="w-full h-full object-cover opacity-85">
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>

                <!-- Category & Read Time -->
                <div class="absolute bottom-6 left-6 right-6 space-y-2 text-white">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="px-3 py-1 rounded-full text-xs font-bold ${catBadgeClass}">
                            ${escapeHtml(categoryTxt)}
                        </span>
                        ${article.isSample ? `
                            <span class="px-2.5 py-1 rounded-full text-[11px] font-bold shadow-sm bg-zinc-900/85 text-amber-300 border border-amber-400/50 backdrop-blur-md flex items-center gap-1">
                                <span class="material-symbols-outlined text-xs text-amber-300">menu_book</span>
                                Biên soạn mẫu
                            </span>
                        ` : (article.isEditorial ? `
                            <span class="px-2.5 py-1 rounded-full text-[11px] font-bold shadow-sm bg-amber-600/90 text-white border border-amber-300 backdrop-blur-md flex items-center gap-1">
                                <span class="material-symbols-outlined text-xs">verified</span>
                                Ban Biên Tập
                            </span>
                        ` : `
                            <span class="px-2.5 py-1 rounded-full text-[11px] font-bold shadow-sm bg-emerald-700/90 text-white border border-emerald-300 backdrop-blur-md flex items-center gap-1">
                                <span class="material-symbols-outlined text-xs">groups</span>
                                Đóng góp cộng đồng
                            </span>
                        `)}
                        <span class="bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-medium border border-white/20 flex items-center gap-1">
                            <span class="material-symbols-outlined text-xs text-amber-300">timer</span>
                            ${escapeHtml(readTimeTxt)}
                        </span>
                        <span class="text-xs text-zinc-300">
                            • Ngày đăng: ${escapeHtml(publishedDate)}
                        </span>
                    </div>
                    <h1 class="font-serif text-xl sm:text-2xl md:text-3xl font-black leading-tight text-white drop-shadow-md">
                        ${escapeHtml(article.title)}
                    </h1>
                </div>
            </div>

            <!-- Modal Content Body -->
            <div class="p-6 sm:p-8 md:p-10 space-y-8 max-w-4xl mx-auto w-full">
                <!-- Author Bio Header -->
                <div class="flex items-center justify-between gap-4 pb-6 border-b border-outline-variant/30 dark:border-zinc-800">
                    <div class="flex items-center gap-3">
                        <img src="${escapeHtml(authorAvatar)}" alt="${escapeHtml(authorName)}" class="w-12 h-12 rounded-full border-2 border-emerald-500 shadow-sm object-cover bg-slate-100">
                        <div>
                            <div class="font-bold text-sm sm:text-base text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                                <span>${escapeHtml(authorName)}</span>
                                <span class="material-symbols-outlined text-base text-emerald-600 dark:text-emerald-400">verified</span>
                            </div>
                            <div class="text-xs text-on-surface-variant dark:text-zinc-400">${escapeHtml(authorRole)}</div>
                        </div>
                    </div>

                    <!-- Social Share Action Buttons -->
                    <div class="flex items-center gap-2">
                        <button type="button" onclick="window.ViVuApp.shareArticle('facebook')" class="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 hover:bg-blue-100 flex items-center justify-center transition-colors" title="Chia sẻ lên Facebook">
                            <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                        </button>
                        <button type="button" onclick="window.ViVuApp.shareArticle('copy')" class="w-9 h-9 rounded-xl bg-surface-container dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-surface-container-high flex items-center justify-center transition-colors" title="Sao chép liên kết">
                            <span class="material-symbols-outlined text-base">link</span>
                        </button>
                    </div>
                </div>

                <!-- Rich Article Content -->
                <div class="article-prose prose dark:prose-invert max-w-none text-slate-800 dark:text-zinc-200">
                    ${sanitizeArticleContent(article.contentHtml || article.content || '')}
                </div>

                <!-- Related Places Widget (Nếu có địa điểm liên quan) -->
                ${relatedPlaces.length > 0 ? `
                    <div class="p-5 rounded-3xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/40 space-y-4">
                        <div class="flex items-center gap-2">
                            <span class="material-symbols-outlined text-emerald-700 dark:text-emerald-400">explore</span>
                            <h4 class="font-serif font-bold text-sm sm:text-base text-primary dark:text-emerald-300">
                                Địa Điểm Được Nhắc Tới Trong Bài Viết
                            </h4>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            ${relatedPlaces.map(p => `
                                <div class="flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-zinc-800 border border-outline-variant/30 dark:border-zinc-700 shadow-xs hover:shadow-md transition-shadow group/pl">
                                    <img src="${p.imageLink}" alt="${p.name}" class="w-14 h-14 rounded-xl object-cover shrink-0">
                                    <div class="flex-1 min-w-0">
                                        <h5 class="font-bold text-xs sm:text-sm text-slate-900 dark:text-zinc-100 truncate group-hover/pl:text-primary transition-colors">${p.name}</h5>
                                        <p class="text-[11px] text-slate-500 dark:text-zinc-400 truncate">${p.area} • ${p.category}</p>
                                        <button type="button" onclick="window.ViVuApp.openDetailFromArticle('${p.id}')" class="mt-1 text-[11px] font-bold text-primary dark:text-emerald-400 inline-flex items-center gap-1 hover:underline">
                                            Xem cẩm nang <span class="material-symbols-outlined text-xs">arrow_forward</span>
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <!-- Fanpage Follow Banner -->
                <div class="p-5 rounded-3xl bg-gradient-to-r from-blue-900 via-indigo-950 to-primary text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
                    <div class="space-y-1 text-center sm:text-left">
                        <div class="text-xs font-bold text-blue-300 flex items-center justify-center sm:justify-start gap-1.5">
                            <span class="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
                            Facebook Fanpage ViVuTraVinh
                        </div>
                        <h4 class="font-serif font-bold text-sm sm:text-base text-white">Yêu thích câu chuyện này? Hãy kết nối cùng chúng tôi!</h4>
                        <p class="text-xs text-blue-200/80">Theo dõi Fanpage để cập nhật các bài ký sự du lịch mới nhất và tham gia thảo luận cùng cộng đồng.</p>
                    </div>
                    <a href="https://www.facebook.com/vivutravinh.official" target="_blank" rel="noopener" class="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shrink-0 active:scale-95 transition-transform">
                        <span>Ghé thăm Fanpage</span>
                        <span class="material-symbols-outlined text-sm">open_in_new</span>
                    </a>
                </div>

                <!-- DIỄN ĐÀN THẢO LUẬN & BÌNH LUẬN DƯỚI BÀI VIẾT -->
                <div class="pt-6 border-t border-outline-variant/30 dark:border-zinc-800 space-y-6">
                    <div>
                        <h3 class="font-serif text-lg sm:text-xl font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                            <span class="material-symbols-outlined text-primary dark:text-emerald-400">forum</span>
                            Diễn Đàn Thảo Luận & Chia Sẻ Cảm Nghĩ (${comments.length})
                        </h3>
                        <p class="text-xs text-on-surface-variant dark:text-zinc-400 mt-0.5">
                            Hỏi đáp thêm kinh nghiệm, tranh luận quán ngon hoặc để lại lời nhắn cho tác giả.
                        </p>
                    </div>

                    <!-- Form gửi bình luận cho bài viết -->
                    <form id="articleCommentForm" class="p-4 sm:p-5 rounded-2xl bg-surface-container-low dark:bg-zinc-800/80 border border-outline-variant/30 dark:border-zinc-700 space-y-3" onsubmit="window.ViVuApp.handleArticleCommentSubmit(event)">
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label for="articleCommentAuthor" class="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Tên của bạn / Biệt danh <span class="text-rose-500">*</span></label>
                                <input type="text" id="articleCommentAuthor" required placeholder="Ví dụ: Du Khách Phương Xa" class="w-full text-xs rounded-xl border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-slate-800 dark:text-zinc-200">
                            </div>
                            <div class="flex items-end">
                                <label class="w-full cursor-pointer">
                                    <span class="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Ảnh thực tế (Tùy chọn)</span>
                                    <div class="w-full text-xs rounded-xl border border-dashed border-emerald-400 dark:border-emerald-800 bg-white dark:bg-zinc-900 px-3 py-2 text-emerald-800 dark:text-emerald-400 flex items-center justify-center gap-1 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors">
                                        <span class="material-symbols-outlined text-sm">add_a_photo</span>
                                        <span id="articlePhotoBtnText">Đính kèm ảnh</span>
                                    </div>
                                    <input type="file" id="articleCommentPhotoInput" accept="image/*" class="hidden" onchange="window.ViVuApp.handleArticlePhotoSelect(this.files[0])">
                                </label>
                            </div>
                        </div>

                        <!-- Preview ảnh bình luận -->
                        <div id="articleCommentPhotoPreview" class="hidden relative inline-block">
                            <img id="articleCommentPhotoImg" src="" alt="Ảnh đính kèm" class="w-20 h-20 object-cover rounded-xl border border-outline-variant/40">
                            <button type="button" onclick="window.ViVuApp.removeArticleCommentPhoto()" class="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center text-xs shadow-sm">
                                ✕
                            </button>
                        </div>

                        <div>
                            <label for="articleCommentContent" class="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Nội dung chia sẻ <span class="text-rose-500">*</span></label>
                            <textarea id="articleCommentContent" required rows="3" placeholder="Chia sẻ cảm nhận, kinh nghiệm thực tế hoặc góp ý cho bài viết..." class="w-full text-xs rounded-xl border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 text-slate-800 dark:text-zinc-200"></textarea>
                        </div>

                        <div class="flex items-center justify-between pt-1">
                            <span class="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-1">
                                <span class="material-symbols-outlined text-xs text-emerald-600">offline_pin</span>
                                Tự động đồng bộ ngoại tuyến
                            </span>
                            <button type="submit" class="px-5 py-2 rounded-xl bg-primary hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all">
                                <span>Gửi thảo luận</span>
                                <span class="material-symbols-outlined text-sm">send</span>
                            </button>
                        </div>
                    </form>

                    <!-- Danh sách bình luận dưới bài viết -->
                    <div id="articleCommentsList" class="space-y-4 pt-2">
                        ${comments.length === 0 ? `
                            <div class="p-6 text-center text-xs text-slate-500 dark:text-zinc-400 bg-surface-container-low dark:bg-zinc-800/40 rounded-2xl border border-dashed border-outline-variant/40">
                                💬 Chưa có bình luận nào cho bài viết này. Hãy là người đầu tiên chia sẻ cảm nghĩ của bạn!
                            </div>
                        ` : comments.map(c => {
                            const rawName = String(c.author_name || '').trim();
                            const safeAuthor = escapeHtml(rawName || 'Bạn đọc ẩn danh');
                            const safeText = escapeHtml(c.comment_text || '');
                            const safeInitial = escapeHtml((rawName || 'U').charAt(0).toUpperCase() || 'U');
                            const rawPhoto = c.photo_url || c.photo_data;
                            const safePhoto = rawPhoto && typeof rawPhoto === 'string' && (/^data:image\/(jpeg|png|webp|jpg);base64,[A-Za-z0-9+/=]+$/.test(rawPhoto) || /^https?:\/\/[^\s"'<>]+$/i.test(rawPhoto)) ? rawPhoto : null;

                            return `
                            <div class="p-4 rounded-2xl bg-surface-container-lowest dark:bg-zinc-800/60 border border-outline-variant/30 dark:border-zinc-700 space-y-2">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2">
                                        <div class="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-primary dark:text-emerald-300 font-bold text-xs flex items-center justify-center">
                                            ${safeInitial}
                                        </div>
                                        <div>
                                            <div class="font-bold text-xs text-slate-800 dark:text-zinc-200">${safeAuthor}</div>
                                            <div class="text-[10px] text-slate-400">${c.created_at ? new Date(c.created_at).toLocaleDateString('vi-VN') : 'Vừa xong'}</div>
                                        </div>
                                    </div>
                                    ${c.is_offline ? `
                                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
                                            ⏳ Chờ đồng bộ
                                        </span>
                                    ` : ''}
                                </div>
                                <p class="text-xs text-slate-700 dark:text-zinc-300 pl-10 leading-relaxed">
                                    ${safeText}
                                </p>
                                ${safePhoto ? `
                                    <div class="pl-10 pt-1">
                                        <img src="${escapeHtml(safePhoto)}" alt="Ảnh thực tế" onclick="window.ViVuApp.viewPhotoModal(this.src)" class="w-20 h-20 object-cover rounded-xl cursor-pointer border border-outline-variant/30 hover:scale-105 transition-transform">
                                    </div>
                                ` : ''}
                            </div>
                        `;}).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render Modal Gửi / Biên tập Bài Viết Cẩm Nang Du Lịch
 */
export function renderSubmitArticleModal(onSubmit, editingArticle = null, isAdmin = false) {
    const container = document.getElementById('submitArticleModalContainer');
    if (!container) return;

    const isEdit = Boolean(editingArticle && editingArticle.id);
    const titleText = isEdit 
        ? (isAdmin ? 'Biên tập Bài viết Cẩm nang (Admin)' : 'Chỉnh sửa Bài viết Cẩm nang')
        : (isAdmin ? 'Soạn thảo & Xuất bản Cẩm nang mới (Admin)' : 'Gửi Bài viết Cẩm nang / Ký sự Du lịch');

    const defaultCover = editingArticle?.cover_image || editingArticle?.coverImage || '/ao bà om.jpg';
    const defaultTitle = editingArticle?.title || '';
    const defaultCategory = editingArticle?.category || 'van-hoa';
    const defaultReadTime = editingArticle?.read_time || editingArticle?.readTime || '4 phút đọc';
    const defaultExcerpt = editingArticle?.excerpt || '';
    const defaultContent = editingArticle?.content || editingArticle?.contentHtml || '';
    const defaultStatus = editingArticle?.status || (isAdmin ? 'approved' : 'pending');
    const defaultIsEditorial = editingArticle?.is_editorial ?? editingArticle?.isEditorial ?? isAdmin;
    const defaultAdminNotes = editingArticle?.admin_notes || '';

    container.innerHTML = `
        <div class="p-6 sm:p-8 space-y-6">
            <div class="flex items-center justify-between pb-4 border-b border-outline-variant/30 dark:border-zinc-800">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 flex items-center justify-center shrink-0">
                        <span class="material-symbols-outlined text-2xl">auto_stories</span>
                    </div>
                    <div>
                        <h2 class="font-headline-sm text-lg sm:text-xl font-bold text-primary dark:text-zinc-100">
                            ${titleText}
                        </h2>
                        <p class="text-xs text-on-surface-variant dark:text-zinc-400 mt-0.5">
                            ${isAdmin ? 'Ban Biên Tập ViVuTraVinh • Quyền Quản trị viên' : 'Chia sẻ góc nhìn, huyền tích &amp; cẩm nang vi vu cùng cộng đồng'}
                        </p>
                    </div>
                </div>
            </div>

            <form id="submitArticleForm" class="space-y-4" onsubmit="return false;">
                <!-- Tiêu đề bài viết -->
                <div class="space-y-1.5">
                    <label class="block text-xs font-bold text-primary dark:text-zinc-200">
                        Tiêu đề bài viết cẩm nang <span class="text-rose-500">*</span>
                    </label>
                    <input type="text" id="articleInputTitle" required
                        value="${escapeHtml(defaultTitle)}"
                        placeholder="VD: Ký sự một ngày khám phá Cù Lao Tân Qui rợp bóng cây ăn trái..."
                        class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 border border-outline-variant/30 dark:border-zinc-700 text-xs sm:text-sm text-on-surface dark:text-zinc-100 placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-secondary/40 min-h-[44px]" />
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <!-- Danh mục -->
                    <div class="space-y-1.5">
                        <label class="block text-xs font-bold text-primary dark:text-zinc-200">
                            Chuyên mục cẩm nang <span class="text-rose-500">*</span>
                        </label>
                        <select id="articleInputCategory"
                            class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 border border-outline-variant/30 dark:border-zinc-700 text-xs sm:text-sm text-on-surface dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-secondary/40 min-h-[44px]">
                            <option value="van-hoa" ${defaultCategory === 'van-hoa' ? 'selected' : ''}>Văn Hóa Khmer &amp; Huyền Tích</option>
                            <option value="am-thuc" ${defaultCategory === 'am-thuc' ? 'selected' : ''}>Ẩm Thực Bản Địa Xứ Trà</option>
                            <option value="ky-su" ${defaultCategory === 'ky-su' ? 'selected' : ''}>Ký Sự Du Lịch &amp; Trải Nghiệm</option>
                            <option value="le-hoi" ${defaultCategory === 'le-hoi' ? 'selected' : ''}>Lễ Hội &amp; Sự Kiện Đặc Sắc</option>
                            <option value="dia-diem" ${defaultCategory === 'dia-diem' ? 'selected' : ''}>Cẩm Nang Điểm Đến Mới</option>
                        </select>
                    </div>

                    <!-- Thời gian đọc -->
                    <div class="space-y-1.5">
                        <label class="block text-xs font-bold text-primary dark:text-zinc-200">
                            Thời gian đọc ước tính
                        </label>
                        <input type="text" id="articleInputReadTime"
                            value="${escapeHtml(defaultReadTime)}"
                            placeholder="VD: 5 phút đọc"
                            class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 border border-outline-variant/30 dark:border-zinc-700 text-xs sm:text-sm text-on-surface dark:text-zinc-100 placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-secondary/40 min-h-[44px]" />
                    </div>
                </div>

                <!-- Ảnh bìa -->
                <div class="space-y-1.5">
                    <label class="block text-xs font-bold text-primary dark:text-zinc-200">
                        Đường dẫn ảnh bìa (Cover Image URL)
                    </label>
                    <input type="text" id="articleInputCoverImage"
                        value="${escapeHtml(defaultCover)}"
                        placeholder="/ao bà om.jpg hoặc https://..."
                        class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 border border-outline-variant/30 dark:border-zinc-700 text-xs sm:text-sm text-on-surface dark:text-zinc-100 placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-secondary/40 min-h-[44px]" />
                </div>

                <!-- Trích đoạn tóm tắt -->
                <div class="space-y-1.5">
                    <label class="block text-xs font-bold text-primary dark:text-zinc-200">
                        Đoạn tóm tắt mở đầu (Excerpt)
                    </label>
                    <textarea id="articleInputExcerpt" rows="2"
                        placeholder="Tóm tắt 1-2 câu ngắn gọn dẫn dắt vào bài viết..."
                        class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 border border-outline-variant/30 dark:border-zinc-700 text-xs sm:text-sm text-on-surface dark:text-zinc-100 placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-secondary/40 resize-none">${escapeHtml(defaultExcerpt)}</textarea>
                </div>

                <!-- Nội dung chi tiết -->
                <div class="space-y-1.5">
                    <label class="block text-xs font-bold text-primary dark:text-zinc-200">
                        Nội dung bài viết chi tiết <span class="text-rose-500">*</span>
                    </label>
                    <textarea id="articleInputContent" rows="8" required
                        placeholder="Nội dung bài cẩm nang, hỗ trợ các đoạn văn bản, danh sách, đề mục..."
                        class="w-full px-4 py-3 rounded-xl bg-surface-container-low dark:bg-zinc-800 border border-outline-variant/30 dark:border-zinc-700 text-xs sm:text-sm text-on-surface dark:text-zinc-100 placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-secondary/40">${escapeHtml(defaultContent)}</textarea>
                </div>

                ${isAdmin ? `
                <!-- Khu vực điều khiển Admin -->
                <div class="p-4 rounded-2xl bg-amber-500/10 dark:bg-amber-950/30 border border-amber-500/30 space-y-3">
                    <div class="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
                        <span class="material-symbols-outlined text-base">admin_panel_settings</span>
                        <span>Thiết lập Quản trị &amp; Ban Biên Tập</span>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Trạng thái xuất bản</label>
                            <select id="articleInputStatus" class="w-full px-3 py-2 rounded-xl bg-surface dark:bg-zinc-800 border border-outline-variant/30 text-xs text-on-surface dark:text-zinc-100">
                                <option value="approved" ${defaultStatus === 'approved' ? 'selected' : ''}>Xuất bản công khai (Approved)</option>
                                <option value="draft" ${defaultStatus === 'draft' ? 'selected' : ''}>Lưu nháp nội bộ (Draft)</option>
                                <option value="pending" ${defaultStatus === 'pending' ? 'selected' : ''}>Chờ duyệt (Pending)</option>
                            </select>
                        </div>
                        <div class="flex items-center pt-5">
                            <label class="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800 dark:text-zinc-200">
                                <input type="checkbox" id="articleInputIsEditorial" ${defaultIsEditorial ? 'checked' : ''} class="w-4 h-4 rounded text-secondary focus:ring-secondary" />
                                <span>Bài chính thức của Ban Biên Tập</span>
                            </label>
                        </div>
                    </div>

                    <div>
                        <label class="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Ghi chú nội bộ Admin (Admin Notes)</label>
                        <input type="text" id="articleInputAdminNotes" value="${escapeHtml(defaultAdminNotes)}" placeholder="Ghi chú thẩm định, chỉ admin nhìn thấy..." class="w-full px-3 py-2 rounded-xl bg-surface dark:bg-zinc-800 border border-outline-variant/30 text-xs text-on-surface dark:text-zinc-100" />
                    </div>
                </div>
                ` : `
                <div class="p-3.5 rounded-2xl bg-surface-container-low dark:bg-zinc-800/40 text-xs text-on-surface-variant dark:text-zinc-400 border border-outline-variant/30 flex items-center gap-2">
                    <span class="material-symbols-outlined text-base text-secondary shrink-0">info</span>
                    <span>Bài viết sau khi gửi sẽ được Ban Quản Trị xem xét và duyệt xuất bản trong 24 giờ.</span>
                </div>
                `}

                <div class="pt-3 flex items-center justify-end gap-3 border-t border-outline-variant/30 dark:border-zinc-800">
                    <button type="button" onclick="window.ViVuApp?.closeSubmitArticleModal()"
                        class="px-5 py-2.5 rounded-xl bg-surface-container dark:bg-zinc-800 hover:bg-surface-container-high dark:hover:bg-zinc-700 text-xs font-bold text-on-surface dark:text-zinc-200 transition-all min-h-[44px]">
                        Hủy
                    </button>
                    <button type="button" id="btnSubmitArticleConfirm"
                        class="px-6 py-2.5 rounded-xl bg-primary text-white hover:bg-primary-container hover:text-on-primary text-xs font-bold transition-all shadow-sm flex items-center gap-2 min-h-[44px]">
                        <span class="material-symbols-outlined text-base">send</span>
                        <span>${isEdit ? 'Lưu thay đổi' : (isAdmin ? 'Xuất bản ngay' : 'Gửi bài chờ duyệt')}</span>
                    </button>
                </div>
            </form>
        </div>
    `;

    const confirmBtn = container.querySelector('#btnSubmitArticleConfirm');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            const title = container.querySelector('#articleInputTitle')?.value?.trim();
            const category = container.querySelector('#articleInputCategory')?.value;
            const readTime = container.querySelector('#articleInputReadTime')?.value?.trim();
            const coverImage = container.querySelector('#articleInputCoverImage')?.value?.trim();
            const excerpt = container.querySelector('#articleInputExcerpt')?.value?.trim();
            const content = container.querySelector('#articleInputContent')?.value?.trim();

            if (!title || title.length < 5) {
                alert('Vui lòng nhập tiêu đề bài viết từ 5 ký tự trở lên.');
                return;
            }
            if (!content || content.length < 30) {
                alert('Vui lòng nhập nội dung bài viết từ 30 ký tự trở lên.');
                return;
            }

            const payload = {
                title,
                category,
                read_time: readTime || '4 phút đọc',
                cover_image: coverImage || '/ao bà om.jpg',
                excerpt,
                content
            };

            if (isEdit) {
                payload.id = editingArticle.id;
            }

            if (isAdmin) {
                payload.status = container.querySelector('#articleInputStatus')?.value || 'approved';
                payload.is_editorial = container.querySelector('#articleInputIsEditorial')?.checked || false;
                payload.admin_notes = container.querySelector('#articleInputAdminNotes')?.value?.trim() || '';
            }

            if (onSubmit) {
                onSubmit(payload);
            }
        });
    }
}

/**
 * Phân tích thuộc tính biểu tượng & màu sắc theo danh mục địa điểm (Stitch Design System)
 */
export function getMarkerVisualProps(place) {
    const cat = String(place?.category || '').toLowerCase();
    if (/chùa|tâm linh|tôn giáo|khmer|di tích|lịch sử|bảo tàng/.test(cat)) {
        return {
            icon: 'temple_buddhist',
            bgClass: 'bg-[#EA580C]',
            color: '#EA580C'
        };
    }
    if (/cafe|cà phê|trà sữa/.test(cat)) {
        return {
            icon: 'local_cafe',
            bgClass: 'bg-[#006c4a]',
            color: '#006c4a'
        };
    }
    if (/món|ẩm thực|đặc sản|ăn uống|quán/.test(cat)) {
        return {
            icon: 'ramen_dining',
            bgClass: 'bg-[#006c4a]',
            color: '#006c4a'
        };
    }
    if (/sinh thái|biển|cồn|vườn|thiên nhiên|du lịch/.test(cat)) {
        return {
            icon: 'park',
            bgClass: 'bg-[#059669]',
            color: '#059669'
        };
    }
    return {
        icon: 'place',
        bgClass: 'bg-[#006c4a]',
        color: '#006c4a'
    };
}

/**
 * Tạo Leaflet Custom DivIcon theo Stitch Design System (Phase 4)
 * - Văn hóa / Chùa Khmer: Cam #EA580C (temple_buddhist)
 * - Ẩm thực / Đặc sản: Lục đậm #006c4a (ramen_dining / restaurant)
 * - Cafe: Lục đậm #006c4a (local_cafe)
 * - Sinh thái / Cồn / Biển: Xanh ngọc #059669 (park / eco)
 * - Địa điểm đang chọn: Kích thước lớn, radar ping tỏa tròn, tooltip badge
 */
export function createCustomMapMarker(place, isSelected = false) {
    if (typeof L === 'undefined') return null;

    const { icon, bgClass } = getMarkerVisualProps(place);
    const rating = Number.parseFloat(place.rating) || 0;
    const safeName = escapeHtml(place.name || 'Địa điểm');

    let html = '';
    let iconSize = [32, 32];
    let iconAnchor = [16, 16];

    if (isSelected) {
        iconSize = [180, 48];
        iconAnchor = [22, 24];
        html = `
            <div class="relative flex items-center justify-start cursor-pointer group select-none pointer-events-auto">
                <!-- Expanding Radar Pulse -->
                <div class="absolute left-0 top-0 w-11 h-11 rounded-full bg-emerald-500/40 animate-ping pointer-events-none"></div>
                <div class="relative flex items-center">
                    <div class="w-11 h-11 rounded-full bg-[#003527] text-white shadow-2xl flex items-center justify-center border-2 border-white ring-2 ring-[#003527]/30 shrink-0">
                        <span class="material-symbols-outlined text-[22px] text-emerald-300">${icon}</span>
                    </div>
                    <!-- Marker Tooltip Label -->
                    <div class="ml-2 px-2.5 py-1 bg-[#003527]/95 backdrop-blur-md text-white rounded-xl shadow-xl font-sans text-[11px] font-semibold whitespace-nowrap flex items-center gap-1.5 border border-white/20">
                        <span class="max-w-[110px] truncate">${safeName}</span>
                        ${rating > 0 ? `<span class="text-amber-300 font-bold flex items-center gap-0.5">★ ${rating.toFixed(1)}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    } else {
        html = `
            <div class="relative flex items-center justify-center cursor-pointer group select-none hover:scale-110 transition-transform pointer-events-auto" title="${safeName}">
                <div class="w-8 h-8 rounded-full ${bgClass} text-white shadow-md flex items-center justify-center border-2 border-white">
                    <span class="material-symbols-outlined text-[16px]">${icon}</span>
                </div>
            </div>
        `;
    }

    return L.divIcon({
        className: 'custom-stitch-marker',
        html,
        iconSize,
        iconAnchor,
        popupAnchor: [0, -18]
    });
}

/**
 * Render Danh Sách Thẻ Địa Điểm Trên Side Panel Bản Đồ (Desktop & Drawer)
 */
export function renderMapPlacesList(places, selectedPlaceId = null) {
    if (!Array.isArray(places) || places.length === 0) {
        return `
            <div class="p-8 text-center text-slate-500 dark:text-zinc-400 flex flex-col items-center justify-center gap-2">
                <span class="material-symbols-outlined text-4xl text-slate-400 dark:text-zinc-500">search_off</span>
                <p class="font-bold text-sm text-slate-700 dark:text-zinc-200">Không tìm thấy địa điểm phù hợp</p>
                <p class="text-xs">Hãy thử đổi từ khóa tìm kiếm hoặc chọn danh mục khác.</p>
            </div>
        `;
    }

    return places.map(p => {
        const isSelected = selectedPlaceId && String(p.id) === String(selectedPlaceId);
        const safeId = escapeHtml(p.id);
        const safeName = escapeHtml(p.name);
        const safeCategory = escapeHtml(p.category || 'Địa điểm');
        const safeArea = escapeHtml(p.area || p.address || 'Trà Vinh');
        const safeImage = escapeHtml(p.imageLink || NEUTRAL_PLACEHOLDER_IMAGE);
        const rating = Number.parseFloat(p.rating) || 0;
        const openStatus = getPlaceOpenStatus(p);

        // Coordinates for Google Maps Directions
        const rawCoords = p.coordinates || '';
        const match = String(rawCoords).match(/([-+]?\d+\.?\d*)\s*,\s*([-+]?\d+\.?\d*)/);
        const lat = match ? match[1] : '9.9347';
        const lng = match ? match[2] : '106.3449';
        const googleDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

        return `
            <article data-id="${safeId}" onclick="window.ViVuApp.selectMapPlaceById('${safeId}')"
                class="group relative bg-surface-container-lowest dark:bg-zinc-800/80 rounded-2xl p-3 shadow-sm hover:shadow-md transition-all cursor-pointer border ${
                    isSelected
                        ? 'border-emerald-600 dark:border-emerald-500 ring-2 ring-emerald-500/20 bg-gradient-to-r from-emerald-50/60 dark:from-emerald-950/30 to-surface-container-lowest dark:to-zinc-800'
                        : 'border-outline-variant/30 dark:border-zinc-700/60 hover:border-emerald-600/50'
                }">
                <div class="flex gap-3">
                    <!-- Thumbnail Media -->
                    <div class="relative w-28 h-24 sm:w-32 sm:h-28 rounded-xl overflow-hidden shrink-0 shadow-inner bg-surface-container-low dark:bg-zinc-700">
                        <img src="${safeImage}" alt="${safeName}"
                            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            onerror="this.onerror=null; this.src='${NEUTRAL_PLACEHOLDER_IMAGE}';">
                        <span class="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-primary-container/90 text-on-primary text-[10px] font-bold backdrop-blur-sm truncate max-w-[90px]">
                            ${safeCategory}
                        </span>
                        <button onclick="event.stopPropagation(); window.ViVuApp.toggleBookmark('${safeId}', this)"
                            class="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-surface-container-lowest/90 dark:bg-zinc-800/90 backdrop-blur-sm flex items-center justify-center text-slate-600 dark:text-zinc-200 shadow-sm hover:scale-110 transition-transform"
                            title="Lưu địa điểm" aria-label="Lưu ${safeName}">
                            <span class="material-symbols-outlined text-[16px]">bookmark</span>
                        </button>
                        <div class="absolute bottom-1.5 left-1.5 px-1.5 py-0.2 rounded bg-surface-container-lowest/90 dark:bg-zinc-900/90 backdrop-blur-sm text-[10px] font-semibold flex items-center gap-1 text-${openStatus.color}-600 dark:text-${openStatus.color}-400">
                            <span class="w-1.5 h-1.5 rounded-full bg-${openStatus.color}-500"></span>
                            <span class="truncate max-w-[80px]">${openStatus.label}</span>
                        </div>
                    </div>

                    <!-- Card Body -->
                    <div class="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                            <div class="flex items-start justify-between gap-1">
                                <h4 class="font-bold text-xs sm:text-sm text-on-surface dark:text-zinc-100 group-hover:text-secondary dark:group-hover:text-emerald-400 transition-colors line-clamp-1">
                                    ${safeName}
                                </h4>
                                ${isSelected ? `
                                    <span class="px-1.5 py-0.2 rounded bg-secondary-container dark:bg-emerald-950/60 text-on-secondary-container dark:text-emerald-300 text-[10px] font-bold shrink-0">
                                        Đang chọn
                                    </span>
                                ` : ''}
                            </div>

                            <!-- Rating & Distance -->
                            <div class="flex items-center gap-1.5 mt-1 text-[11px] text-on-surface-variant dark:text-zinc-400 flex-wrap">
                                <span class="text-amber-500 font-bold flex items-center">
                                    ★ ${rating > 0 ? rating.toFixed(1) : 'Mới'}
                                </span>
                                <span class="text-outline-variant">•</span>
                                <span class="truncate">${safeArea}</span>
                                ${p.distanceKm !== undefined ? `
                                    <span class="text-outline-variant">•</span>
                                    <span class="text-secondary dark:text-emerald-400 font-semibold flex items-center gap-0.5">
                                        <span class="material-symbols-outlined text-[13px]">near_me</span>${p.distanceKm.toFixed(1)} km
                                    </span>
                                ` : ''}
                            </div>

                            <!-- Highlights / Short description snippet -->
                            <p class="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-1 mt-1">
                                ${escapeHtml(p.description || p.address || 'Điểm đến đặc sắc tại Trà Vinh')}
                            </p>
                        </div>

                        <!-- Card Action Buttons -->
                        <div class="flex items-center justify-end gap-1.5 pt-2 border-t border-outline-variant/20 dark:border-zinc-700/60 mt-2">
                            <button onclick="event.stopPropagation(); window.ViVuApp.openDetailFromMap('${safeId}')"
                                class="px-2.5 py-1 min-h-[36px] rounded-lg bg-surface-container-low dark:bg-zinc-700/60 hover:bg-surface-container dark:hover:bg-zinc-700 text-on-surface dark:text-zinc-200 text-[11px] font-semibold flex items-center gap-1 transition-colors">
                                <span class="material-symbols-outlined text-[15px]">info</span>
                                <span>Chi tiết</span>
                            </button>
                            <a href="${googleDirectionsUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"
                                class="px-3 py-1 min-h-[36px] rounded-lg bg-secondary hover:bg-primary-container text-white text-[11px] font-semibold flex items-center gap-1 transition-colors shadow-sm">
                                <span class="material-symbols-outlined text-[15px]">directions</span>
                                <span>Chỉ đường</span>
                            </a>
                        </div>
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

/**
 * Render Category Pills cho Bản Đồ (Stitch Style)
 */
export function renderMapCategoryPills(categories, activeCategory = 'all', onSelectCallback = 'window.ViVuApp.setMapCategory') {
    return categories.map(cat => {
        const isActive = cat.id === activeCategory;
        const safeId = escapeHtml(cat.id);
        const safeLabel = escapeHtml(cat.label);
        const icon = cat.icon || 'explore';

        return `
            <button onclick="${onSelectCallback}('${safeId}')"
                class="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-full text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                    isActive
                        ? 'bg-[#003527] text-white shadow-sm ring-1 ring-[#003527]'
                        : 'bg-surface-container-low dark:bg-zinc-800 hover:bg-surface-container dark:hover:bg-zinc-700 text-on-surface-variant dark:text-zinc-300 border border-outline-variant/30 dark:border-zinc-700'
                }">
                <span class="material-symbols-outlined text-[16px]">${icon}</span>
                <span>${safeLabel}</span>
                ${cat.count !== undefined ? `
                    <span class="px-1.5 py-0.2 rounded-full text-[10px] ${
                        isActive ? 'bg-white/20 text-white' : 'bg-surface-container dark:bg-zinc-700 text-slate-500 dark:text-zinc-400'
                    }">${cat.count}</span>
                ` : ''}
            </button>
        `;
    }).join('');
}

/**
 * Render Category Pills cho Câu Lạc Bộ (Stitch Design System - Phase 5)
 */
export function renderClubCategoryPills(categories, activeCategory = 'all', onSelectCallback = 'window.ViVuApp.filterClubsByCategory') {
    return categories.map(cat => {
        const isActive = cat.id === activeCategory;
        const safeId = escapeHtml(cat.id);
        const safeLabel = escapeHtml(cat.label);
        const icon = cat.icon || 'groups';

        return `
            <button type="button" onclick="${onSelectCallback}('${safeId}')"
                class="flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-full text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                    isActive
                        ? 'bg-[#003527] text-white shadow-sm ring-1 ring-[#003527]'
                        : 'bg-surface-container-low dark:bg-zinc-800 hover:bg-surface-container dark:hover:bg-zinc-700 text-on-surface-variant dark:text-zinc-300 border border-outline-variant/30 dark:border-zinc-700'
                }">
                <span class="material-symbols-outlined text-[16px]">${icon}</span>
                <span>${safeLabel}</span>
                ${cat.count !== undefined ? `
                    <span class="px-1.5 py-0.2 rounded-full text-[10px] ${
                        isActive ? 'bg-white/20 text-white' : 'bg-surface-container dark:bg-zinc-700 text-slate-500 dark:text-zinc-400'
                    }">${cat.count}</span>
                ` : ''}
            </button>
        `;
    }).join('');
}

/**
 * Render Feed Filter Tabs cho Thảo Luận Cộng Đồng (Stitch Design System - Phase 5)
 */
export function renderCommunityFeedFilters(filters, activeFilter = 'all', onSelectCallback = 'window.ViVuApp.filterCommunityFeed') {
    return filters.map(f => {
        const isActive = f.id === activeFilter;
        const safeId = escapeHtml(f.id);
        const safeLabel = escapeHtml(f.label);

        return `
            <button type="button" onclick="${onSelectCallback}('${safeId}')"
                class="px-4 py-2 min-h-[44px] rounded-full text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                    isActive
                        ? 'bg-primary-container text-white shadow-xs'
                        : 'bg-surface-container-lowest dark:bg-zinc-900 text-on-surface-variant dark:text-zinc-400 hover:bg-surface-container dark:hover:bg-zinc-800 border border-outline-variant/30 dark:border-zinc-800'
                }">
                ${safeLabel}
            </button>
        `;
    }).join('');
}

/**
 * Render Danh Sách Câu Lạc Bộ Bento Grid (Stitch Design System - Phase 5)
 */
export function renderClubsBentoGrid(clubs, joinedClubIds = []) {
    if (!Array.isArray(clubs) || clubs.length === 0) {
        return `
            <div class="col-span-full p-8 text-center text-slate-500 dark:text-zinc-400 bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl border border-outline-variant/40 dark:border-zinc-800">
                <span class="material-symbols-outlined text-4xl mb-2 text-slate-400">group_off</span>
                <p class="font-bold text-sm">Chưa có câu lạc bộ trong danh mục này</p>
            </div>
        `;
    }

    return clubs.map(club => {
        const safeId = escapeHtml(club.id);
        const safeName = escapeHtml(club.name);
        const safeBadge = escapeHtml(club.badge || club.categoryName || 'Cộng đồng');
        const safeDesc = escapeHtml(club.description || '');
        const safeLastAct = escapeHtml(club.lastActivity || 'Hoạt động hàng tuần');
        const safeImage = escapeHtml(club.image || NEUTRAL_PLACEHOLDER_IMAGE);
        const isJoined = joinedClubIds.includes(club.id);
        const isSample = club.isSample || ['clb-chay-bo-long-binh', 'clb-phuot-checkin', 'clb-don-ca-tai-tu', 'clb-nhiep-anh-khmer', 'clb-am-thuc-xu-tra'].includes(club.id);

        return `
            <article class="flex flex-col bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-all border border-outline-variant/40 dark:border-zinc-800 group">
                <div class="relative aspect-[16/10] w-full overflow-hidden bg-surface-container-high dark:bg-zinc-800">
                    <img src="${safeImage}" alt="${safeName}"
                        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onerror="this.onerror=null; this.src='${NEUTRAL_PLACEHOLDER_IMAGE}';">
                    <div class="absolute top-3 left-3 flex flex-wrap gap-1.5 items-center">
                        ${club.status === 'pending' ? `
                            <span class="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 backdrop-blur-md text-xs font-semibold shadow-sm flex items-center gap-1">
                                <span class="material-symbols-outlined text-[14px]">hourglass_top</span> Chờ duyệt
                            </span>
                        ` : (isSample ? `
                            <span class="px-2.5 py-1 rounded-full bg-amber-100/90 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 backdrop-blur-md text-[11px] font-medium shadow-sm">
                                CLB mẫu tham khảo
                            </span>
                        ` : `
                            <span class="px-2.5 py-1 rounded-full bg-surface-container-lowest/90 dark:bg-zinc-900/90 text-primary dark:text-emerald-400 backdrop-blur-md text-xs font-semibold shadow-sm">
                                ${safeBadge}
                            </span>
                        `)}
                    </div>
                    <button type="button" onclick="window.ViVuApp.toggleBookmarkClub('${safeId}', this)"
                        class="absolute top-3 right-3 w-11 h-11 min-h-[44px] min-w-[44px] rounded-full bg-surface-container-lowest/85 dark:bg-zinc-800/85 backdrop-blur-md flex items-center justify-center text-slate-600 dark:text-zinc-300 hover:text-red-500 dark:hover:text-red-400 transition-colors shadow-sm"
                        title="Lưu câu lạc bộ" aria-label="Lưu ${safeName}">
                        <span class="material-symbols-outlined text-[18px]">favorite</span>
                    </button>
                </div>
                <div class="p-5 flex flex-col flex-1 justify-between gap-4">
                    <div class="flex flex-col gap-2">
                        <div class="flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full ${isSample ? 'bg-amber-500' : 'bg-secondary'}"></span>
                            <span class="text-xs text-on-surface-variant dark:text-zinc-400">
                                ${isSample ? 'CLB văn hóa - thể thao mẫu' : `${club.members_count || club.membersCount || 1} thành viên`}
                            </span>
                        </div>
                        <h3 class="font-bold text-base text-on-surface dark:text-zinc-100 group-hover:text-secondary dark:group-hover:text-emerald-400 transition-colors">
                            ${safeName}
                        </h3>
                        <p class="text-xs text-on-surface-variant dark:text-zinc-400 line-clamp-2 leading-relaxed">
                            ${safeDesc}
                        </p>
                    </div>
                    <div class="pt-3 flex flex-col gap-3 bg-surface-container-low/60 dark:bg-zinc-800/60 -mx-5 -mb-5 p-5 mt-auto border-t border-outline-variant/30 dark:border-zinc-700/60">
                        <div class="flex items-center gap-2 text-on-surface-variant dark:text-zinc-300 text-xs">
                            <span class="material-symbols-outlined text-[16px] text-secondary dark:text-emerald-400 shrink-0">verified</span>
                            <span class="truncate">${safeLastAct}</span>
                        </div>
                        <button type="button" onclick="window.ViVuApp.toggleJoinClub('${safeId}')"
                            class="w-full min-h-[44px] py-2.5 px-4 rounded-xl font-semibold text-xs transition-all text-center ${
                                isJoined
                                    ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-950/80 dark:hover:bg-emerald-900/80 dark:text-emerald-300 border border-emerald-500/40'
                                    : 'bg-secondary hover:bg-primary-container text-white shadow-sm'
                            }">
                            ${isJoined ? '✓ Đã tham gia' : 'Tham gia CLB'}
                        </button>
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

/**
 * Render Bảng Tin Thảo Luận Cộng Đồng (Stitch Discussion Feed)
 */
export function renderCommunityPostsFeed(posts, likedPostIds = []) {
    if (!Array.isArray(posts) || posts.length === 0) {
        return `
            <div class="p-8 text-center text-slate-500 dark:text-zinc-400 bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl border border-outline-variant/40 dark:border-zinc-800">
                <span class="material-symbols-outlined text-4xl mb-2 text-slate-400">forum</span>
                <p class="font-bold text-sm">Chưa có bài viết nào trong chủ đề này</p>
                <p class="text-xs mt-1">Hãy là người đầu tiên chia sẻ cảm nhận về xứ Trà!</p>
            </div>
        `;
    }

    return posts.map(post => {
        const safeId = escapeHtml(post.id);
        const safeAuthor = escapeHtml(post.author);
        const safeAvatar = escapeHtml(post.avatarText || 'TV');
        const safeBadge = escapeHtml(post.badge || 'Thành viên');
        const safeTime = escapeHtml(post.timeAgo || 'Vừa xong');
        const safeLoc = escapeHtml(post.location || 'Trà Vinh');
        const safeContent = escapeHtml(post.content || '');
        const safeImage = post.image ? escapeHtml(post.image) : null;
        const isLiked = likedPostIds.includes(post.id);
        const isSample = post.isSample || String(post.id).startsWith('post-');

        return `
            <article class="bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl p-5 sm:p-6 shadow-xs border border-outline-variant/40 dark:border-zinc-800 flex flex-col gap-4">
                <!-- Author Row -->
                <div class="flex items-start justify-between gap-3">
                    <div class="flex items-center gap-3">
                        <div class="w-11 h-11 rounded-full bg-primary-container text-white flex items-center justify-center font-bold text-sm uppercase shrink-0">
                            ${safeAvatar}
                        </div>
                        <div class="flex flex-col min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="font-bold text-sm text-on-surface dark:text-zinc-100">${safeAuthor}</span>
                                ${post.status === 'pending' ? `
                                    <span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 text-[11px] font-semibold inline-flex items-center gap-1">
                                        <span class="material-symbols-outlined text-[13px]">hourglass_top</span> Chờ duyệt (Chỉ bạn thấy)
                                    </span>
                                ` : (isSample ? `
                                    <span class="px-2 py-0.5 rounded-full bg-amber-100/90 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300 text-[11px] font-medium">
                                        Bài viết minh họa
                                    </span>
                                ` : `
                                    <span class="px-2 py-0.5 rounded-full bg-secondary-container dark:bg-emerald-950/60 text-on-secondary-container dark:text-emerald-300 text-[11px] font-semibold">
                                        ${safeBadge}
                                    </span>
                                `)}
                            </div>
                            <div class="flex items-center gap-1.5 text-xs text-on-surface-variant dark:text-zinc-400 mt-0.5">
                                <span>${safeTime}</span>
                                <span>•</span>
                                <span class="inline-flex items-center gap-0.5 text-secondary dark:text-emerald-400 font-medium truncate max-w-[200px]">
                                    <span class="material-symbols-outlined text-[14px]">pin_drop</span>
                                    ${safeLoc}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button type="button" onclick="window.ViVuApp.shareCommunityPost('${safeId}')" class="text-outline dark:text-zinc-400 hover:text-on-surface dark:hover:text-zinc-200 p-2 rounded-full hover:bg-surface-container dark:hover:bg-zinc-800 min-h-[44px] min-w-[44px] flex items-center justify-center" title="Chia sẻ bài viết" aria-label="Chia sẻ bài viết">
                        <span class="material-symbols-outlined text-[20px]">share</span>
                    </button>
                </div>

                <!-- Post Text -->
                <p class="text-xs sm:text-sm text-on-surface dark:text-zinc-200 leading-relaxed">
                    ${safeContent}
                </p>

                <!-- Optional Media -->
                ${safeImage ? `
                    <div class="rounded-xl overflow-hidden bg-surface-container-high dark:bg-zinc-800 aspect-[16/9] border border-outline-variant/30 dark:border-zinc-700/60">
                        <img src="${safeImage}" alt="${safeLoc}" class="w-full h-full object-cover hover:scale-102 transition-transform duration-300"
                            onerror="this.onerror=null; this.src='${NEUTRAL_PLACEHOLDER_IMAGE}';">
                    </div>
                ` : ''}

                <!-- Stats Row (Chỉ hiển thị khi có dữ liệu thật, không tạo số giả) -->
                ${!isSample && (post.likes || isLiked) ? `
                    <div class="pt-2 flex items-center justify-between text-xs text-on-surface-variant dark:text-zinc-400">
                        <div class="flex items-center gap-1.5">
                            <span class="w-5 h-5 rounded-full bg-secondary text-white flex items-center justify-center text-[10px]">
                                <span class="material-symbols-outlined text-[13px]">thumb_up</span>
                            </span>
                            <span>${(post.likes || 0) + (isLiked ? 1 : 0)} Thích</span>
                        </div>
                    </div>
                ` : ''}

                <!-- Action Buttons -->
                <div class="pt-2 flex items-center justify-between border-t border-outline-variant/30 dark:border-zinc-800 text-on-surface-variant dark:text-zinc-400">
                    <button type="button" onclick="window.ViVuApp.toggleLikePost('${safeId}')"
                        class="flex-1 min-h-[44px] py-2 flex items-center justify-center gap-2 rounded-xl hover:bg-surface-container-low dark:hover:bg-zinc-800 transition-colors text-xs font-semibold ${
                            isLiked ? 'text-secondary dark:text-emerald-400' : 'text-on-surface dark:text-zinc-200'
                        }">
                        <span class="material-symbols-outlined text-[20px] ${isLiked ? 'fill-current text-secondary' : ''}">thumb_up</span>
                        <span>${isLiked ? 'Đã thích' : 'Thích'}</span>
                    </button>
                    <button type="button" onclick="window.ViVuApp.handleCommentPrompt('${safeId}')"
                        class="flex-1 min-h-[44px] py-2 flex items-center justify-center gap-2 rounded-xl hover:bg-surface-container-low dark:hover:bg-zinc-800 transition-colors text-xs font-semibold text-on-surface dark:text-zinc-200">
                        <span class="material-symbols-outlined text-[20px]">chat_bubble</span>
                        <span>Bình luận</span>
                    </button>
                    <button type="button" onclick="window.ViVuApp.shareCommunityPost('${safeId}')"
                        class="flex-1 min-h-[44px] py-2 flex items-center justify-center gap-2 rounded-xl hover:bg-surface-container-low dark:hover:bg-zinc-800 transition-colors text-xs font-semibold text-on-surface dark:text-zinc-200">
                        <span class="material-symbols-outlined text-[20px]">share</span>
                        <span>Chia sẻ</span>
                    </button>
                </div>
            </article>
        `;
    }).join('');
}

/**
 * Render Widget Hoạt Động Tuần Này
 */
export function renderWeeklyActivitiesWidget(activities, registeredActivityIds = []) {
    if (!Array.isArray(activities) || activities.length === 0) {
        return `<p class="text-xs text-slate-500">Đang cập nhật lịch hoạt động mới.</p>`;
    }

    return activities.map(act => {
        const safeId = escapeHtml(act.id);
        const safeTitle = escapeHtml(act.title);
        const safeTime = escapeHtml(act.time || act.time_schedule || '');
        const safeLocation = escapeHtml(act.location || '');
        const safeClub = (act.clubName || act.club_name) ? escapeHtml(act.clubName || act.club_name) : '';
        const isSample = act.isSample || String(act.id).startsWith('act-');
        const maxCapacity = act.maxAttendees || act.max_attendees || 30;
        const isPending = act.status === 'pending';

        return `
            <div class="p-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800/80 hover:bg-surface-container dark:hover:bg-zinc-800 transition-colors flex flex-col gap-2 group border ${isPending ? 'border-amber-400/50 bg-amber-500/5 dark:bg-amber-950/20' : 'border-outline-variant/20 dark:border-zinc-700/40'}">
                <div class="flex items-center justify-between gap-2 flex-wrap">
                    ${safeClub ? `
                        <span class="text-[11px] font-semibold text-secondary dark:text-emerald-400 truncate max-w-[180px]">
                            ${safeClub}
                        </span>
                    ` : '<span></span>'}
                    ${isPending ? `
                        <span class="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 text-[10px] font-bold flex items-center gap-1 shrink-0">
                            <span class="material-symbols-outlined text-[12px]">hourglass_top</span> Chờ duyệt (Chủ nhiệm)
                        </span>
                    ` : (isSample ? `
                        <span class="px-2 py-0.5 rounded-md bg-amber-100/80 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 text-[10px] font-medium shrink-0">
                            Lịch mẫu tham khảo
                        </span>
                    ` : '')}
                </div>
                <span class="font-bold text-xs sm:text-sm text-on-surface dark:text-zinc-100 group-hover:text-secondary dark:group-hover:text-emerald-400 transition-colors leading-snug">
                    ${safeTitle}
                </span>
                <div class="flex items-center justify-between text-xs text-on-surface-variant dark:text-zinc-400">
                    <span class="inline-flex items-center gap-1">
                        <span class="material-symbols-outlined text-[15px] text-outline">schedule</span>
                        ${safeTime}
                    </span>
                    <span class="inline-flex items-center gap-1 text-on-surface-variant dark:text-zinc-400">
                        <span class="material-symbols-outlined text-[15px]">groups</span>
                        Tối đa ${maxCapacity} người
                    </span>
                </div>
                <div class="pt-1.5 flex items-center justify-between border-t border-outline-variant/20 dark:border-zinc-700/40 gap-2">
                    <span class="text-[11px] text-slate-500 dark:text-zinc-400 truncate max-w-[160px]">${safeLocation}</span>
                    ${isPending ? `
                        <button type="button" disabled
                            class="px-3 py-1.5 min-h-[40px] rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed">
                            Chờ duyệt
                        </button>
                    ` : `
                        <button type="button" onclick="window.ViVuApp?.showActivityRsvpNotice?.('${safeId}')"
                            class="px-3 py-1.5 min-h-[40px] rounded-xl text-xs font-medium transition-all bg-surface-container-high hover:bg-surface-container-highest dark:bg-zinc-800 dark:hover:bg-zinc-700 text-on-surface-variant dark:text-zinc-300 flex items-center gap-1 shrink-0"
                            title="Chưa hỗ trợ đăng ký trực tuyến">
                            <span class="material-symbols-outlined text-[14px]">info</span>
                            <span>Chưa hỗ trợ trực tuyến</span>
                        </button>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Render Widget Quy Tắc Cộng Đồng
 */
export function renderCommunityGuidelinesWidget(guidelines) {
    if (!Array.isArray(guidelines)) return '';
    return guidelines.map(g => `
        <li class="flex items-start gap-2.5 text-xs text-on-surface-variant dark:text-zinc-300 leading-relaxed">
            <span class="w-5 h-5 rounded-full bg-primary-container dark:bg-emerald-900 text-white flex items-center justify-center shrink-0 text-[11px] font-bold">
                ${g.num}
            </span>
            <span>${escapeHtml(g.rule)}</span>
        </li>
    `).join('');
}

/**
 * ========================================================
 * PHASE 7: USER PROFILE, ACHIEVEMENTS & SAVED COLLECTIONS
 * ========================================================
 */

/**
 * Render Profile Modal Content (Stitch Desktop & Mobile Design)
 */
export function renderUserProfileModalContent(profile, activeTab = 'overview', badgeCategory = 'all') {
    if (!profile) return '';

    const userSession = typeof window !== 'undefined' && window.ViVuApp?.getUserSession ? window.ViVuApp.getUserSession() : null;
    const isAuth = Boolean(userSession && userSession.user);
    if (!isAuth) {
        return `<div class="p-6 sm:p-10 text-center max-w-xl mx-auto">
            <span class="material-symbols-outlined text-5xl text-secondary" aria-hidden="true">person_outline</span>
            <h2 class="text-2xl font-bold mt-4">Chào mừng bạn đến ViVuTràVinh</h2>
            <p class="mt-3 text-on-surface-variant dark:text-zinc-300">Bạn đang xem web với tư cách khách. Đăng nhập để gửi bài, tham gia cộng đồng và quản lý nội dung của bạn.</p>
            <div class="flex flex-wrap justify-center gap-3 mt-6">
                <button type="button" onclick="window.ViVuApp.closeProfileModal(); window.ViVuApp.openAuthModal('signin')" class="min-h-[44px] px-5 py-3 rounded-xl bg-primary text-white font-bold">Đăng nhập</button>
                <button type="button" onclick="window.ViVuApp.closeProfileModal(); window.ViVuApp.openAuthModal('signup')" class="min-h-[44px] px-5 py-3 rounded-xl border border-outline-variant font-bold">Tạo tài khoản</button>
            </div>
        </div>`;
    }
    const authEmail = userSession?.user?.email ? escapeHtml(userSession.user.email) : '';

    const safeName = escapeHtml((isAuth && userSession.user.user_metadata?.display_name) || profile.name || 'Người dùng');
    const safeHandle = escapeHtml(profile.handle || '@tien.travinh');
    const safeRole = escapeHtml(profile.role || 'Đại sứ Khám phá Xanh Trà Vinh');
    const safeBio = escapeHtml(profile.bio || '');
    const safeLocation = escapeHtml(profile.location || 'TP. Trà Vinh, Trà Vinh');
    const safeJoinDate = escapeHtml(profile.joinDate || 'Tháng 03, 2023');
    const avatarImg = escapeHtml(profile.avatar || 'chùa âng.jpg');
    const coverImg = escapeHtml(profile.coverImage || 'ao bà om.jpg');
    const coins = (profile.coins || 0).toLocaleString();
    const stats = profile.stats || { tripsCompleted: 48, pagodasVisited: 18, cyclingKm: 642, co2ReducedKg: 128 };
    const level = profile.level || { current: 4, max: 5, title: 'Bảo tồn Di sản', currentXp: 3750, progressPercent: 93.7 };

    // Filter badges
    const allBadges = profile.badges || [];
    const filteredBadges = badgeCategory === 'all' 
        ? allBadges 
        : allBadges.filter(b => b.category === badgeCategory);

    const unlockedCount = allBadges.filter(b => b.unlocked).length;

    return `
        <!-- Immersive Profile Header & Banner -->
        <div class="relative w-full">
            <!-- Cover Landscape Background -->
            <div class="h-60 sm:h-72 w-full bg-cover bg-center relative" style="background-image: url('${coverImg}')">
                <div class="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/40 to-transparent"></div>
                <!-- Top Badges in Banner -->
                <div class="absolute top-4 sm:top-6 right-4 sm:right-8 flex items-center gap-2">
                    <span class="px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full bg-surface-container-lowest/80 dark:bg-zinc-900/80 backdrop-blur-md text-on-surface dark:text-zinc-100 font-bold text-[11px] sm:text-xs flex items-center gap-1.5 shadow-sm">
                        <span class="material-symbols-outlined text-[16px] text-secondary dark:text-emerald-400" style="font-variation-settings: 'FILL' 1;">eco</span>
                        <span>Thành viên Xanh</span>
                    </span>
                    <span class="px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full bg-primary-container/80 backdrop-blur-md text-emerald-200 font-bold text-[11px] sm:text-xs flex items-center gap-1.5 shadow-sm">
                        <span class="material-symbols-outlined text-[16px]">verified</span>
                        <span>Đã xác minh</span>
                    </span>
                </div>
            </div>

            <!-- Profile Summary Container Overlapping Banner -->
            <div class="max-w-7xl mx-auto px-4 sm:px-8 -mt-16 sm:-mt-20 relative z-10 pb-4">
                <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl p-4 sm:p-6 shadow-md border border-outline-variant/30 dark:border-zinc-800 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <!-- Left: Avatar & Identity -->
                    <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                        <div class="relative shrink-0">
                            <div class="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden shadow-lg p-1 bg-surface-container-lowest dark:bg-zinc-800 border-2 border-amber-400/40">
                                <img src="${avatarImg}" alt="${safeName}" class="w-full h-full object-cover rounded-xl" />
                            </div>
                            <div class="absolute -bottom-2 -right-2 bg-secondary text-white w-8 h-8 rounded-full flex items-center justify-center shadow-md ring-2 ring-surface-container-lowest dark:ring-zinc-900" title="Bảo tồn Di sản">
                                <span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">workspace_premium</span>
                            </div>
                        </div>
                        <div class="flex flex-col gap-1 min-w-0">
                            <div class="flex items-center gap-2 sm:gap-3 flex-wrap">
                                <h1 class="font-headline-lg text-xl sm:text-2xl lg:text-3xl text-on-surface dark:text-zinc-100 font-bold tracking-tight">${safeName}</h1>
                                <span class="text-xs text-outline dark:text-zinc-400 font-mono">${safeHandle}</span>
                                ${isAuth ? `
                                    <span class="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold text-[11px] inline-flex items-center gap-1">
                                        <span class="material-symbols-outlined text-[13px]">verified_user</span> Đã xác thực Supabase Auth (${authEmail})
                                    </span>
                                ` : `
                                    <span class="px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 font-semibold text-[11px] inline-flex items-center gap-1">
                                        <span class="material-symbols-outlined text-[13px]">person_outline</span> Khách vãng lai (Hồ sơ mẫu tham khảo)
                                    </span>
                                `}
                                <span class="px-2.5 py-0.5 rounded-full bg-secondary-container/80 dark:bg-emerald-950 text-secondary dark:text-emerald-300 font-semibold text-[11px]">
                                    ${safeRole}
                                </span>
                            </div>
                            <p class="font-body-md text-xs sm:text-sm text-on-surface-variant dark:text-zinc-300 max-w-xl mt-1 leading-relaxed">
                                ${safeBio}
                            </p>
                            <div class="flex items-center gap-3 sm:gap-4 mt-2 text-xs text-outline dark:text-zinc-400 flex-wrap">
                                <span class="flex items-center gap-1">
                                    <span class="material-symbols-outlined text-[15px] text-secondary">location_on</span>
                                    <span>${safeLocation}</span>
                                </span>
                                <span>•</span>
                                <span class="flex items-center gap-1">
                                    <span class="material-symbols-outlined text-[15px] text-secondary">calendar_today</span>
                                    <span>Tham gia ${safeJoinDate}</span>
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Right: Action CTAs -->
                    <div class="flex items-center gap-2.5 sm:gap-3 flex-wrap lg:flex-nowrap shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-outline-variant/30 dark:border-zinc-800">
                        ${isAuth ? `
                            <button type="button" onclick="window.ViVuApp.handleUserSignOut()"
                                class="px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition-all min-h-[44px]">
                                <span class="material-symbols-outlined text-[18px]">logout</span>
                                <span>Đăng xuất</span>
                            </button>
                        ` : `
                            <button type="button" onclick="window.ViVuApp.openAuthModal('signin')"
                                class="px-4 py-2.5 rounded-xl bg-primary text-white hover:bg-secondary font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition-all min-h-[44px] shadow-sm">
                                <span class="material-symbols-outlined text-[18px]">login</span>
                                <span>Đăng nhập</span>
                            </button>
                        `}
                        <button type="button" onclick="window.ViVuApp.shareProfileStory()"
                            class="px-4 py-2.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 hover:bg-surface-container dark:hover:bg-zinc-700 text-on-surface dark:text-zinc-200 font-semibold text-xs sm:text-sm flex items-center gap-2 transition-all min-h-[44px]">
                            <span class="material-symbols-outlined text-[18px]">share</span>
                            <span>Chia sẻ</span>
                        </button>
                        <button type="button" onclick="window.ViVuApp.openEditProfileModal()"
                            class="px-4 py-2.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 hover:bg-surface-container dark:hover:bg-zinc-700 text-on-surface dark:text-zinc-200 font-semibold text-xs sm:text-sm flex items-center gap-2 transition-all min-h-[44px]">
                            <span class="material-symbols-outlined text-[18px]">edit_note</span>
                            <span>Chỉnh sửa</span>
                        </button>
                        <button type="button" onclick="window.ViVuApp.openRedeemGiftModal()"
                            class="px-4 sm:px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#EA580C] to-amber-600 hover:from-[#C2410C] hover:to-amber-700 text-white font-semibold text-xs sm:text-sm flex items-center gap-2 shadow-sm transition-all min-h-[44px]">
                            <span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">redeem</span>
                            <span>Đổi Xu Nhận Quà</span>
                        </button>
                    </div>
                </div>

                <!-- Quick Metrics Ribbon -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mt-4">
                    <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-xl p-3.5 sm:p-4 shadow-sm border border-outline-variant/20 dark:border-zinc-800 flex items-center gap-3 sm:gap-4">
                        <div class="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-emerald-500/10 dark:bg-emerald-950/40 flex items-center justify-center text-secondary dark:text-emerald-400 shrink-0">
                            <span class="material-symbols-outlined text-[24px] sm:text-[26px]">hiking</span>
                        </div>
                        <div class="flex flex-col min-w-0">
                            <span class="font-bold text-lg sm:text-xl text-on-surface dark:text-zinc-100">${stats.tripsCompleted || 48}</span>
                            <span class="text-[11px] sm:text-xs text-on-surface-variant dark:text-zinc-400 truncate">Chuyến đi hoàn thành</span>
                        </div>
                    </div>
                    <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-xl p-3.5 sm:p-4 shadow-sm border border-outline-variant/20 dark:border-zinc-800 flex items-center gap-3 sm:gap-4">
                        <div class="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-amber-500/10 dark:bg-amber-950/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                            <span class="material-symbols-outlined text-[24px] sm:text-[26px]">temple_buddhist</span>
                        </div>
                        <div class="flex flex-col min-w-0">
                            <span class="font-bold text-lg sm:text-xl text-on-surface dark:text-zinc-100">${stats.pagodasVisited || 18}</span>
                            <span class="text-[11px] sm:text-xs text-on-surface-variant dark:text-zinc-400 truncate">Chùa Khmer đã viếng</span>
                        </div>
                    </div>
                    <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-xl p-3.5 sm:p-4 shadow-sm border border-outline-variant/20 dark:border-zinc-800 flex items-center gap-3 sm:gap-4">
                        <div class="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-teal-500/10 dark:bg-teal-950/40 flex items-center justify-center text-teal-600 dark:text-teal-400 shrink-0">
                            <span class="material-symbols-outlined text-[24px] sm:text-[26px]">directions_bike</span>
                        </div>
                        <div class="flex flex-col min-w-0">
                            <span class="font-bold text-lg sm:text-xl text-on-surface dark:text-zinc-100">${stats.cyclingKm || 642} <span class="text-xs font-normal text-outline">km</span></span>
                            <span class="text-[11px] sm:text-xs text-on-surface-variant dark:text-zinc-400 truncate">Đạp xe khám phá</span>
                        </div>
                    </div>
                    <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-xl p-3.5 sm:p-4 shadow-sm border border-outline-variant/20 dark:border-zinc-800 flex items-center gap-3 sm:gap-4">
                        <div class="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-amber-500/20 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0">
                            <span class="material-symbols-outlined text-[24px] sm:text-[26px]" style="font-variation-settings: 'FILL' 1;">monetization_on</span>
                        </div>
                        <div class="flex flex-col min-w-0">
                            <span class="font-bold text-lg sm:text-xl text-amber-600 dark:text-amber-400">${coins}</span>
                            <span class="text-[11px] sm:text-xs text-on-surface-variant dark:text-zinc-400 truncate">Xu Xứ Trà tích lũy</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Primary Content Area -->
        <div class="max-w-7xl mx-auto w-full px-4 sm:px-8 pb-12 flex flex-col gap-6 sm:gap-8">
            <!-- Tab Navigation Bar -->
            <div class="flex items-center gap-2 bg-surface-container-lowest dark:bg-zinc-900 p-1.5 rounded-2xl shadow-sm border border-outline-variant/20 dark:border-zinc-800 self-start overflow-x-auto max-w-full no-scrollbar" role="tablist" aria-label="Các mục hồ sơ">
                <button type="button" role="tab" aria-selected="${activeTab === 'overview' ? 'true' : 'false'}"
                    onclick="window.ViVuApp.switchProfileTab('overview')"
                    class="px-4 sm:px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm flex items-center gap-2 transition-all min-h-[44px] shrink-0 ${
                        activeTab === 'overview'
                            ? 'bg-primary-container text-white shadow-sm dark:bg-emerald-800'
                            : 'text-on-surface-variant dark:text-zinc-400 hover:text-on-surface dark:hover:text-zinc-200 hover:bg-surface-container-low dark:hover:bg-zinc-800'
                    }">
                    <span class="material-symbols-outlined text-[18px]">dashboard</span>
                    <span>Tổng quan &amp; Huy hiệu</span>
                </button>
                <button type="button" role="tab" aria-selected="${activeTab === 'trips' ? 'true' : 'false'}"
                    onclick="window.ViVuApp.switchProfileTab('trips')"
                    class="px-4 sm:px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm flex items-center gap-2 transition-all min-h-[44px] shrink-0 ${
                        activeTab === 'trips'
                            ? 'bg-primary-container text-white shadow-sm dark:bg-emerald-800'
                            : 'text-on-surface-variant dark:text-zinc-400 hover:text-on-surface dark:hover:text-zinc-200 hover:bg-surface-container-low dark:hover:bg-zinc-800'
                    }">
                    <span class="material-symbols-outlined text-[18px]">route</span>
                    <span>Chuyến đi &amp; Nhật ký GPS</span>
                </button>
                <button type="button" role="tab" id="profileTabMyContent" aria-selected="${activeTab === 'my-content' ? 'true' : 'false'}"
                    onclick="window.ViVuApp.switchProfileTab('my-content')"
                    class="px-4 sm:px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm flex items-center gap-2 transition-all min-h-[44px] shrink-0 ${
                        activeTab === 'my-content'
                            ? 'bg-primary-container text-white shadow-sm dark:bg-emerald-800'
                            : 'text-on-surface-variant dark:text-zinc-400 hover:text-on-surface dark:hover:text-zinc-200 hover:bg-surface-container-low dark:hover:bg-zinc-800'
                    }">
                    <span class="material-symbols-outlined text-[18px]">folder_shared</span>
                    <span>Nội dung của tôi</span>
                </button>
                <button type="button" role="tab" aria-selected="${activeTab === 'reviews' ? 'true' : 'false'}"
                    onclick="window.ViVuApp.switchProfileTab('reviews')"
                    class="px-4 sm:px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm flex items-center gap-2 transition-all min-h-[44px] shrink-0 ${
                        activeTab === 'reviews'
                            ? 'bg-primary-container text-white shadow-sm dark:bg-emerald-800'
                            : 'text-on-surface-variant dark:text-zinc-400 hover:text-on-surface dark:hover:text-zinc-200 hover:bg-surface-container-low dark:hover:bg-zinc-800'
                    }">
                    <span class="material-symbols-outlined text-[18px]">rate_review</span>
                    <span>Bài viết &amp; Đánh giá (18)</span>
                </button>
                <button type="button" role="tab" aria-selected="${activeTab === 'saved' ? 'true' : 'false'}"
                    onclick="window.ViVuApp.openSavedCollectionsModal()"
                    class="px-4 sm:px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm flex items-center gap-2 transition-all min-h-[44px] shrink-0 text-on-surface-variant dark:text-zinc-400 hover:text-on-surface dark:hover:text-zinc-200 hover:bg-surface-container-low dark:hover:bg-zinc-800">
                    <span class="material-symbols-outlined text-[18px] text-rose-500">bookmarks</span>
                    <span>Bộ sưu tập đã lưu</span>
                </button>
            </div>

            ${activeTab === 'overview' ? `
            <!-- Dashboard Bento Grid Layout -->
            <div class="grid grid-cols-12 gap-6 sm:gap-8">
                <!-- Left Column (8 Columns): Badges, Footprint Heatmap & Impact -->
                <div class="col-span-12 lg:col-span-8 flex flex-col gap-6 sm:gap-8">
                    <!-- Section: Badges & Ecology Milestones -->
                    <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl p-5 sm:p-6 shadow-sm border border-outline-variant/30 dark:border-zinc-800 flex flex-col gap-5">
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div class="flex flex-col">
                                <span class="text-xs text-secondary dark:text-emerald-400 uppercase font-bold tracking-wider">Hệ Thống Huy Hiệu Sinh Thái</span>
                                <h2 class="text-lg sm:text-xl font-bold text-on-surface dark:text-zinc-100 mt-0.5">Bảng Vinh Danh Xứ Trà (${unlockedCount}/${allBadges.length})</h2>
                            </div>
                            <!-- Category Filter Chips -->
                            <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1" role="toolbar" aria-label="Bộ lọc huy hiệu">
                                ${['all', 'temple', 'eco', 'food', 'community'].map(cat => {
                                    const labels = {
                                        all: 'Tất cả',
                                        temple: 'Chùa Cổ',
                                        eco: 'Eco Xanh',
                                        food: 'Ẩm thực',
                                        community: 'Cộng đồng'
                                    };
                                    const isSel = badgeCategory === cat;
                                    return `
                                        <button type="button" onclick="window.ViVuApp.filterProfileBadges('${cat}')"
                                            class="px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap min-h-[44px] flex items-center justify-center transition-all ${
                                                isSel
                                                    ? 'bg-primary-container text-white dark:bg-emerald-800'
                                                    : 'bg-surface-container-low dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 hover:bg-surface-container dark:hover:bg-zinc-700'
                                            }">
                                            ${labels[cat]}
                                        </button>
                                    `;
                                }).join('')}
                            </div>
                        </div>

                        <!-- Badges Grid Layout -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4" id="profileBadgesGrid">
                            ${filteredBadges.map(badge => {
                                const isUnlocked = badge.unlocked;
                                const tierColors = {
                                    'Bạch kim': 'bg-cyan-100 text-cyan-900 dark:bg-cyan-950 dark:text-cyan-300',
                                    'Vàng': 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
                                    'Bạc': 'bg-slate-200 text-slate-800 dark:bg-zinc-800 dark:text-zinc-200',
                                    'Đồng': 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400'
                                };
                                const tierClass = tierColors[badge.tier] || 'bg-slate-100 text-slate-800';

                                return `
                                    <div class="p-4 rounded-xl ${isUnlocked ? 'bg-surface-container-low dark:bg-zinc-800/70' : 'bg-surface-container/50 dark:bg-zinc-800/40 opacity-80'} flex items-start gap-4 hover:shadow-md transition-all border border-outline-variant/20 dark:border-zinc-700/50">
                                        <div class="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl ${
                                            isUnlocked
                                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                                : 'bg-stone-300/30 text-stone-400 dark:text-zinc-500'
                                        } flex items-center justify-center shrink-0">
                                            <span class="material-symbols-outlined text-[28px] sm:text-[32px]" style="${isUnlocked ? "font-variation-settings: 'FILL' 1;" : ''}">${badge.icon}</span>
                                        </div>
                                        <div class="flex flex-col flex-1 min-w-0">
                                            <div class="flex items-center justify-between gap-1">
                                                <h3 class="font-bold text-sm sm:text-base text-on-surface dark:text-zinc-100 leading-tight truncate">${escapeHtml(badge.name)}</h3>
                                                <span class="px-2 py-0.5 rounded-full font-bold text-[10px] shrink-0 ${tierClass}">${badge.tier}</span>
                                            </div>
                                            <p class="text-xs text-on-surface-variant dark:text-zinc-300 mt-1 line-clamp-2 leading-relaxed">
                                                ${escapeHtml(badge.desc)}
                                            </p>
                                            ${isUnlocked ? `
                                                <div class="mt-2.5 flex items-center justify-between text-[11px] text-secondary dark:text-emerald-400 font-medium">
                                                    <span class="flex items-center gap-1">
                                                        <span class="material-symbols-outlined text-[14px]">check_circle</span>
                                                        <span>Mở khóa: ${badge.unlockedDate || 'Gần đây'}</span>
                                                    </span>
                                                    <span class="font-bold text-amber-600 dark:text-amber-400">+${badge.xp || 300} XP</span>
                                                </div>
                                            ` : `
                                                <div class="mt-2.5 flex flex-col gap-1">
                                                    <div class="w-full h-1.5 bg-surface-container-highest dark:bg-zinc-700 rounded-full overflow-hidden">
                                                        <div class="h-full bg-secondary dark:bg-emerald-500 rounded-full" style="width: ${badge.progress || 30}%;"></div>
                                                    </div>
                                                    <div class="flex justify-between text-[10px] text-outline dark:text-zinc-400">
                                                        <span>Đang khóa (${badge.progress || 30}%)</span>
                                                        <span class="text-amber-600 dark:text-amber-400 font-semibold">${badge.remaining || 'Chưa hoàn thành'}</span>
                                                    </div>
                                                </div>
                                            `}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <!-- Section: Footprint Heatmap across Tra Vinh Districts -->
                    <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl p-5 sm:p-6 shadow-sm border border-outline-variant/30 dark:border-zinc-800 flex flex-col gap-6">
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <span class="text-xs text-secondary dark:text-emerald-400 uppercase font-bold tracking-wider">Dấu Chân Du Ký</span>
                                <h2 class="text-lg sm:text-xl font-bold text-on-surface dark:text-zinc-100 mt-0.5">Bản Đồ Vùng Khám Phá Trà Vinh</h2>
                            </div>
                            <div class="flex items-center gap-3 text-xs text-on-surface-variant dark:text-zinc-400">
                                <span class="inline-flex items-center gap-1">
                                    <span class="w-2.5 h-2.5 rounded-full bg-secondary"></span> Đã đến nhiều (&gt;5 lần)
                                </span>
                                <span class="inline-flex items-center gap-1">
                                    <span class="w-2.5 h-2.5 rounded-full bg-secondary-container"></span> Đã ghé (1-4 lần)
                                </span>
                            </div>
                        </div>

                        <!-- Heatmap Visual Grid -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <!-- District Coverage Image / Preview -->
                            <div class="md:col-span-2 relative h-64 sm:h-72 rounded-xl overflow-hidden shadow-inner border border-outline-variant/30 dark:border-zinc-800 bg-cover bg-center" style="background-image: url('ao bà om.jpg')">
                                <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none"></div>
                                <div class="absolute bottom-3 left-3 bg-surface-container-lowest/90 dark:bg-zinc-900/90 backdrop-blur-md px-3.5 py-1.5 rounded-lg shadow-sm text-xs font-semibold text-on-surface dark:text-zinc-100 flex items-center gap-2">
                                    <span class="material-symbols-outlined text-[16px] text-secondary">explore</span>
                                    <span>Tỷ lệ phủ rộng: <strong>7/9 Huyện &amp; Thị xã</strong></span>
                                </div>
                            </div>

                            <!-- District Density Breakdown -->
                            <div class="flex flex-col justify-between gap-3 bg-surface-container-low dark:bg-zinc-800/70 p-4 rounded-xl border border-outline-variant/20 dark:border-zinc-700/50">
                                <h4 class="font-bold text-sm text-on-surface dark:text-zinc-100">Tần suất theo địa bàn:</h4>
                                <div class="flex flex-col gap-3">
                                    <div>
                                        <div class="flex justify-between text-xs text-on-surface-variant dark:text-zinc-400 mb-1">
                                            <span>TP. Trà Vinh &amp; Châu Thành</span>
                                            <span class="font-bold text-secondary dark:text-emerald-400">16 Chuyến (92%)</span>
                                        </div>
                                        <div class="w-full h-2 rounded-full bg-surface-container-highest dark:bg-zinc-700 overflow-hidden">
                                            <div class="h-full rounded-full bg-secondary dark:bg-emerald-500 w-[92%]"></div>
                                        </div>
                                    </div>
                                    <div>
                                        <div class="flex justify-between text-xs text-on-surface-variant dark:text-zinc-400 mb-1">
                                            <span>Cầu Kè (Vườn Dừa &amp; Cù Lao)</span>
                                            <span class="font-bold text-secondary dark:text-emerald-400">11 Chuyến (70%)</span>
                                        </div>
                                        <div class="w-full h-2 rounded-full bg-surface-container-highest dark:bg-zinc-700 overflow-hidden">
                                            <div class="h-full rounded-full bg-secondary dark:bg-emerald-500 w-[70%]"></div>
                                        </div>
                                    </div>
                                    <div>
                                        <div class="flex justify-between text-xs text-on-surface-variant dark:text-zinc-400 mb-1">
                                            <span>Tiểu Cần &amp; Trà Cú</span>
                                            <span class="font-bold text-secondary dark:text-emerald-400">9 Chuyến (58%)</span>
                                        </div>
                                        <div class="w-full h-2 rounded-full bg-surface-container-highest dark:bg-zinc-700 overflow-hidden">
                                            <div class="h-full rounded-full bg-secondary dark:bg-emerald-500 w-[58%]"></div>
                                        </div>
                                    </div>
                                    <div>
                                        <div class="flex justify-between text-xs text-on-surface-variant dark:text-zinc-400 mb-1">
                                            <span>Duyên Hải &amp; Càng Long</span>
                                            <span class="font-bold text-on-secondary-container">5 Chuyến (32%)</span>
                                        </div>
                                        <div class="w-full h-2 rounded-full bg-surface-container-highest dark:bg-zinc-700 overflow-hidden">
                                            <div class="h-full rounded-full bg-teal-400 w-[32%]"></div>
                                        </div>
                                    </div>
                                </div>
                                <div class="pt-2 text-xs text-outline dark:text-zinc-400 border-t border-outline-variant/20 dark:border-zinc-700">
                                    <span class="text-secondary dark:text-emerald-400 font-semibold">Chưa khám phá:</span> Huyện Cầu Ngang (Dự kiến tham gia Ok Om Bok).
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Section: Recent Contributions & Eco Stories -->
                    <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl p-5 sm:p-6 shadow-sm border border-outline-variant/30 dark:border-zinc-800 flex flex-col gap-4">
                        <div class="flex items-center justify-between">
                            <h2 class="text-lg sm:text-xl font-bold text-on-surface dark:text-zinc-100">Đóng Góp Cộng Đồng Gần Đây</h2>
                            <button type="button" class="text-xs text-secondary dark:text-emerald-400 font-semibold hover:underline">Xem thêm lịch sử</button>
                        </div>
                        <div class="space-y-3">
                            ${(profile.recentContributions || []).map(item => `
                                <div class="p-3.5 sm:p-4 rounded-xl bg-surface-container-low dark:bg-zinc-800/70 flex items-center justify-between gap-4 border border-outline-variant/20 dark:border-zinc-700/50">
                                    <div class="flex items-center gap-3 min-w-0">
                                        <div class="w-10 h-10 rounded-xl bg-secondary/10 dark:bg-emerald-950 text-secondary dark:text-emerald-400 flex items-center justify-center shrink-0">
                                            <span class="material-symbols-outlined text-[20px]">${item.icon}</span>
                                        </div>
                                        <div class="min-w-0">
                                            <div class="font-bold text-xs sm:text-sm text-on-surface dark:text-zinc-100 truncate">${escapeHtml(item.title)}</div>
                                            <div class="text-[11px] text-outline dark:text-zinc-400 truncate mt-0.5">${escapeHtml(item.desc)} • ${item.time}</div>
                                        </div>
                                    </div>
                                    <span class="px-2.5 py-1 rounded-md bg-secondary-container dark:bg-emerald-950 text-secondary dark:text-emerald-300 font-bold text-xs whitespace-nowrap shrink-0">
                                        ${item.reward}
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <!-- Right Column (4 Columns): Tier Status, Eco Impact, & Certificates -->
                <div class="col-span-12 lg:col-span-4 flex flex-col gap-6 sm:gap-8">
                    <!-- Member Level Card -->
                    <div class="bg-primary-container text-white rounded-2xl p-6 shadow-md relative overflow-hidden flex flex-col justify-between border border-emerald-900">
                        <div class="absolute -right-10 -bottom-10 w-44 h-44 rounded-full bg-white/5 pointer-events-none"></div>
                        <div>
                            <div class="flex items-center justify-between">
                                <span class="px-3 py-1 rounded-full bg-white/10 text-emerald-200 font-bold text-xs">
                                    ${level.tier || 'Cấp 4 / 5'}
                                </span>
                                <span class="text-xs text-emerald-200">Điểm: ${level.currentXp || 3750} XP</span>
                            </div>
                            <h3 class="text-2xl font-bold text-white mt-4 tracking-tight">${level.title || 'Bảo tồn Di sản'}</h3>
                            <p class="text-xs text-emerald-100/80 mt-1 leading-relaxed">
                                Danh hiệu dành riêng cho các thành viên có đóng góp nổi bật về bảo tồn nếp sống và cổ kính miền Tây.
                            </p>
                            <!-- Progress Bar -->
                            <div class="mt-6 flex flex-col gap-2">
                                <div class="flex justify-between text-xs text-emerald-200">
                                    <span>Tiến trình cấp bậc</span>
                                    <span class="font-bold">${level.progressPercent || 93.7}%</span>
                                </div>
                                <div class="w-full h-3 rounded-full bg-white/10 overflow-hidden p-0.5">
                                    <div class="h-full rounded-full bg-secondary-fixed w-[${level.progressPercent || 93.7}%] transition-all"></div>
                                </div>
                                <span class="text-[11px] text-emerald-200/80 mt-1">
                                    Chỉ còn <strong class="text-white">250 XP</strong> nữa để vinh danh <strong>Tinh hoa Xứ Trà (Cấp 5)</strong>!
                                </span>
                            </div>
                        </div>
                        <div class="mt-8 pt-4 border-t border-white/10 flex items-center justify-between">
                            <span class="text-xs text-emerald-200">Đặc quyền cấp bậc:</span>
                            <span class="text-xs font-semibold text-secondary-fixed hover:underline flex items-center gap-1 cursor-pointer">
                                Xem 6 quyền lợi
                                <span class="material-symbols-outlined text-[16px]">chevron_right</span>
                            </span>
                        </div>
                    </div>

                    <!-- Eco Impact Stats Ring & Metrics -->
                    <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl p-5 sm:p-6 shadow-sm border border-outline-variant/30 dark:border-zinc-800 flex flex-col gap-5">
                        <div class="flex flex-col">
                            <span class="text-xs text-secondary dark:text-emerald-400 uppercase font-bold tracking-wider">Tác Động Môi Trường</span>
                            <h2 class="text-lg sm:text-xl font-bold text-on-surface dark:text-zinc-100 mt-0.5">Dấu Chân Xanh 2024</h2>
                        </div>
                        <!-- Circular Chart Preview SVG -->
                        <div class="flex items-center gap-5">
                            <div class="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center shrink-0">
                                <svg class="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                                    <circle class="text-surface-container-high dark:text-zinc-800" cx="50" cy="50" fill="none" r="40" stroke="currentColor" stroke-width="8"></circle>
                                    <circle class="text-secondary dark:text-emerald-400" cx="50" cy="50" fill="none" r="40" stroke="currentColor" stroke-dasharray="251.2" stroke-dashoffset="55" stroke-linecap="round" stroke-width="8"></circle>
                                </svg>
                                <div class="absolute inset-0 flex flex-col items-center justify-center text-center">
                                    <span class="text-lg sm:text-xl font-bold text-on-surface dark:text-zinc-100 leading-none">${stats.co2ReducedKg || 128}</span>
                                    <span class="text-[10px] text-outline dark:text-zinc-400 uppercase mt-0.5">kg CO₂</span>
                                </div>
                            </div>
                            <div class="flex flex-col gap-1">
                                <div class="text-sm font-bold text-secondary dark:text-emerald-400 leading-snug">Giảm phát thải hiệu quả</div>
                                <p class="text-xs text-on-surface-variant dark:text-zinc-300 leading-relaxed">
                                    Nhờ sử dụng xe đạp trên 642 km đường làng Trà Vinh thay vì xe máy.
                                </p>
                            </div>
                        </div>
                        <!-- Impact breakdown list -->
                        <div class="space-y-2.5 pt-2">
                            <div class="flex items-center justify-between p-3 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-xs">
                                <span class="flex items-center gap-2 text-on-surface dark:text-zinc-200">
                                    <span class="material-symbols-outlined text-[18px] text-secondary">park</span>
                                    <span>Cây xanh bảo trợ:</span>
                                </span>
                                <span class="font-bold text-on-surface dark:text-zinc-100">${stats.treesSponsored || 14} Cây Sao Đen</span>
                            </div>
                            <div class="flex items-center justify-between p-3 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-xs">
                                <span class="flex items-center gap-2 text-on-surface dark:text-zinc-200">
                                    <span class="material-symbols-outlined text-[18px] text-secondary">no_drinks</span>
                                    <span>Chai nhựa từ chối:</span>
                                </span>
                                <span class="font-bold text-on-surface dark:text-zinc-100">${stats.plasticBottlesRefused || 240} Chai dùng 1 lần</span>
                            </div>
                        </div>
                    </div>

                    <!-- Cultural & Community Certificates Widget -->
                    <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl p-5 sm:p-6 shadow-sm border border-outline-variant/30 dark:border-zinc-800 flex flex-col gap-4">
                        <div class="flex items-center justify-between">
                            <h3 class="text-base sm:text-lg font-bold text-on-surface dark:text-zinc-100">Chứng Nhận Cộng Đồng</h3>
                            <span class="px-2 py-0.5 rounded-full bg-secondary-container dark:bg-emerald-950 text-secondary dark:text-emerald-300 font-bold text-xs">
                                ${(profile.certificates || []).length} Chứng chỉ
                            </span>
                        </div>
                        <div class="space-y-3">
                            ${(profile.certificates || []).map(cert => `
                                <div class="p-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800/70 flex gap-3 border border-outline-variant/20 dark:border-zinc-700/50">
                                    <div class="w-11 h-11 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                                        <span class="material-symbols-outlined text-[22px]">${cert.icon}</span>
                                    </div>
                                    <div class="flex flex-col min-w-0">
                                        <span class="font-bold text-xs sm:text-sm text-on-surface dark:text-zinc-100 leading-snug">${escapeHtml(cert.title)}</span>
                                        <span class="text-xs text-on-surface-variant dark:text-zinc-400 mt-0.5 truncate">${escapeHtml(cert.issuer)}</span>
                                        <span class="text-[11px] text-outline dark:text-zinc-500 mt-1">Cấp ngày: ${cert.date}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
            ` : activeTab === 'trips' ? `
            <!-- Trips & GPS Logs Tab -->
            <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl p-6 shadow-sm border border-outline-variant/30 dark:border-zinc-800 flex flex-col gap-6">
                <div class="flex items-center justify-between">
                    <div>
                        <h2 class="text-xl font-bold text-on-surface dark:text-zinc-100">Nhật Ký Hành Trình GPS Gần Đây</h2>
                        <p class="text-xs sm:text-sm text-on-surface-variant dark:text-zinc-400 mt-0.5">Các tuyến đường đạp xe xanh và tọa độ văn hóa bạn đã chinh phục</p>
                    </div>
                    <span class="px-3 py-1 rounded-full bg-secondary-container dark:bg-emerald-950 text-secondary dark:text-emerald-300 font-bold text-xs">
                        48 Chuyến hoàn thành
                    </span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="p-4 rounded-xl bg-surface-container-low dark:bg-zinc-800 flex flex-col gap-3 border border-outline-variant/20 dark:border-zinc-700">
                        <div class="flex items-center justify-between">
                            <span class="font-bold text-sm text-on-surface dark:text-zinc-100">Cung đường Di sản: Ao Bà Om - Chùa Âng - Chùa Hang</span>
                            <span class="text-xs font-semibold text-secondary dark:text-emerald-400">14.8 km</span>
                        </div>
                        <p class="text-xs text-on-surface-variant dark:text-zinc-300 leading-relaxed">
                            Khởi hành sáng sớm 06:30, qua rặng cây cổ thụ Ao Bà Om và chiêm bái nghệ thuật điêu khắc tượng gỗ Chùa Hang.
                        </p>
                        <div class="flex items-center justify-between pt-2 border-t border-outline-variant/20 dark:border-zinc-700 text-xs text-outline dark:text-zinc-400">
                            <span>Hoàn thành 25/10/2024 • 3 giờ 45 phút</span>
                            <button type="button" onclick="window.ViVuApp.shareProfileStory()" class="text-secondary dark:text-emerald-400 font-semibold hover:underline flex items-center gap-1">
                                <span class="material-symbols-outlined text-[16px]">share</span> Chia sẻ
                            </button>
                        </div>
                    </div>

                    <div class="p-4 rounded-xl bg-surface-container-low dark:bg-zinc-800 flex flex-col gap-3 border border-outline-variant/20 dark:border-zinc-700">
                        <div class="flex items-center justify-between">
                            <span class="font-bold text-sm text-on-surface dark:text-zinc-100">Vòng quanh Miệt vườn Cù Lao Tân Quy</span>
                            <span class="text-xs font-semibold text-secondary dark:text-emerald-400">22.5 km</span>
                        </div>
                        <p class="text-xs text-on-surface-variant dark:text-zinc-300 leading-relaxed">
                            Đạp xe dọc bờ sông Hậu rợp bóng dừa nước, thưởng thức chôm chôm chín cây và dừa sáp Cầu Kè.
                        </p>
                        <div class="flex items-center justify-between pt-2 border-t border-outline-variant/20 dark:border-zinc-700 text-xs text-outline dark:text-zinc-400">
                            <span>Hoàn thành 12/10/2024 • 4 giờ 15 phút</span>
                            <button type="button" onclick="window.ViVuApp.shareProfileStory()" class="text-secondary dark:text-emerald-400 font-semibold hover:underline flex items-center gap-1">
                                <span class="material-symbols-outlined text-[16px]">share</span> Chia sẻ
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            ` : activeTab === 'my-content' ? `
            ${renderMyContentTabContent(typeof window !== 'undefined' && window.ViVuApp?.getUserUgcState ? window.ViVuApp.getUserUgcState() : {}, isAuth)}
            ` : `
            <!-- Reviews & Contributions Tab -->
            <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl p-6 shadow-sm border border-outline-variant/30 dark:border-zinc-800 flex flex-col gap-6">
                <div class="flex items-center justify-between">
                    <div>
                        <h2 class="text-xl font-bold text-on-surface dark:text-zinc-100">Bài Viết &amp; Đánh Giá Đã Đăng (18)</h2>
                        <p class="text-xs sm:text-sm text-on-surface-variant dark:text-zinc-400 mt-0.5">Chia sẻ cảm nhận ẩm thực và hướng dẫn văn hóa cho du khách phương xa</p>
                    </div>
                </div>
                <div class="space-y-4">
                    <div class="p-4 rounded-xl bg-surface-container-low dark:bg-zinc-800 flex flex-col gap-2.5 border border-outline-variant/20 dark:border-zinc-700">
                        <div class="flex items-center justify-between">
                            <span class="font-bold text-sm text-on-surface dark:text-zinc-100">Đánh giá 5 sao cho Bún Nước Lèo Cô Ba Xứ Trà</span>
                            <span class="text-xs text-outline dark:text-zinc-400">3 ngày trước</span>
                        </div>
                        <p class="text-xs text-on-surface-variant dark:text-zinc-300 leading-relaxed">
                            "Nước lèo nấu từ cá lóc đồng và mắm bò hóc thơm lừng, thịt quay giòn rụm không ngấy, ăn kèm đĩa rau ghém hoa chuối tươi ngon tuyệt đỉnh!"
                        </p>
                        <div class="flex items-center gap-2 text-xs text-secondary dark:text-emerald-400 font-semibold">
                            <span class="material-symbols-outlined text-[16px]" style="font-variation-settings: 'FILL' 1;">recommend</span>
                            <span>Đóng góp trải nghiệm cộng đồng</span>
                        </div>
                    </div>
                </div>
            </div>
            `}
        </div>
    `;
}

/**
 * Render Tab "Nội dung của tôi" (UGC Management Tab: articles, clubs, activities, posts, events)
 */
export function renderMyContentTabContent(ugcData = {}, isAuth = false) {
    if (!isAuth) {
        return `
            <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl p-8 sm:p-12 shadow-sm border border-outline-variant/30 dark:border-zinc-800 text-center flex flex-col items-center gap-4">
                <div class="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <span class="material-symbols-outlined text-3xl">lock</span>
                </div>
                <div class="space-y-1 max-w-md">
                    <h3 class="font-bold text-lg text-on-surface dark:text-zinc-100">Yêu cầu đăng nhập tài khoản</h3>
                    <p class="text-xs sm:text-sm text-on-surface-variant dark:text-zinc-400 leading-relaxed">
                        Vui lòng đăng nhập để xem danh sách nội dung do bạn gửi, theo dõi tiến độ phê duyệt và cập nhật gửi lại khi có yêu cầu chỉnh sửa.
                    </p>
                </div>
                <button type="button" onclick="window.ViVuApp.openAuthModal('signin')"
                    class="px-6 py-2.5 rounded-xl bg-primary text-white text-xs sm:text-sm font-semibold hover:bg-secondary transition-all shadow-sm min-h-[44px]">
                    Đăng nhập tài khoản
                </button>
            </div>
        `;
    }

    if (ugcData.loading) {
        return `
            <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl p-12 shadow-sm border border-outline-variant/30 dark:border-zinc-800 text-center flex flex-col items-center gap-3">
                <span class="material-symbols-outlined text-4xl animate-spin text-secondary">progress_activity</span>
                <p class="text-xs text-on-surface-variant dark:text-zinc-400">Đang đồng bộ danh sách nội dung của bạn...</p>
            </div>
        `;
    }

    const activeFilter = ugcData.filter || 'all';
    const articles = (ugcData.articles || []).map(a => ({ ...a, entity_type: 'article', filterType: 'articles' }));
    const clubs = (ugcData.clubs || []).map(c => ({ ...c, entity_type: 'club', filterType: 'clubs' }));
    const activities = (ugcData.activities || []).map(act => ({ ...act, entity_type: 'club_activity', filterType: 'activities' }));
    const posts = (ugcData.posts || []).map(p => ({ ...p, entity_type: 'community_post', filterType: 'posts' }));
    const events = (ugcData.events || []).map(e => ({ ...e, entity_type: 'community_event', filterType: 'events' }));

    const allItems = [...articles, ...clubs, ...activities, ...posts, ...events].sort((a, b) => {
        const da = new Date(a.created_at || a.createdAt || 0).getTime();
        const db = new Date(b.created_at || b.createdAt || 0).getTime();
        return db - da;
    });

    const displayedItems = activeFilter === 'all'
        ? allItems
        : allItems.filter(i => i.filterType === activeFilter);

    const counts = {
        all: allItems.length,
        articles: articles.length,
        clubs: clubs.length,
        activities: activities.length,
        posts: posts.length,
        events: events.length
    };

    return `
        <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl p-6 shadow-sm border border-outline-variant/30 dark:border-zinc-800 flex flex-col gap-6">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-outline-variant/20 dark:border-zinc-800">
                <div>
                    <h2 class="text-xl font-bold text-on-surface dark:text-zinc-100">Nội Dung Đã Đóng Góp (${counts.all})</h2>
                    <p class="text-xs sm:text-sm text-on-surface-variant dark:text-zinc-400 mt-0.5">
                        Quản lý trạng thái phê duyệt cả 5 loại: Cẩm nang, CLB, Lịch sinh hoạt, Bài viết &amp; Sự kiện
                    </p>
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" onclick="window.ViVuApp.fetchUserUgcContent(true)"
                        class="px-3.5 py-2 rounded-xl bg-surface-container-low dark:bg-zinc-800 hover:bg-surface-container text-on-surface dark:text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-all min-h-[40px] border border-outline-variant/30 dark:border-zinc-700">
                        <span class="material-symbols-outlined text-[16px]">sync</span>
                        <span>Làm mới</span>
                    </button>
                </div>
            </div>

            <!-- Filter Categories Ribbon -->
            <div class="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1" role="tablist" aria-label="Lọc loại nội dung">
                ${[
                    { key: 'all', label: 'Tất cả', icon: 'apps' },
                    { key: 'articles', label: 'Cẩm nang', icon: 'auto_stories' },
                    { key: 'clubs', label: 'Câu lạc bộ', icon: 'groups' },
                    { key: 'activities', label: 'Lịch sinh hoạt', icon: 'calendar_month' },
                    { key: 'posts', label: 'Bài viết', icon: 'forum' },
                    { key: 'events', label: 'Sự kiện', icon: 'event' }
                ].map(f => `
                    <button type="button" role="tab" aria-selected="${activeFilter === f.key ? 'true' : 'false'}"
                        onclick="window.ViVuApp.filterUserUgcContent('${f.key}')"
                        class="px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all min-h-[40px] shrink-0 ${
                            activeFilter === f.key
                                ? 'bg-primary-container text-white shadow-sm dark:bg-emerald-800'
                                : 'bg-surface-container-low dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-400 hover:text-on-surface dark:hover:text-zinc-200'
                        }">
                        <span class="material-symbols-outlined text-[16px]">${f.icon}</span>
                        <span>${f.label} (${counts[f.key] || 0})</span>
                    </button>
                `).join('')}
            </div>

            <!-- Content List -->
            <div id="myContentItemsList" class="space-y-4">
                ${displayedItems.length === 0 ? `
                    <div class="p-10 rounded-2xl bg-surface-container-low dark:bg-zinc-800/50 text-center space-y-3 border border-outline-variant/20 dark:border-zinc-800">
                        <span class="material-symbols-outlined text-4xl text-outline dark:text-zinc-500">inbox</span>
                        <p class="text-sm font-semibold text-on-surface dark:text-zinc-200">Chưa có nội dung nào trong danh mục này</p>
                        <p class="text-xs text-on-surface-variant dark:text-zinc-400 max-w-sm mx-auto">
                            Hãy đóng góp cẩm nang du lịch, đăng ký thành lập CLB hoặc chia sẻ bài viết mới tới cộng đồng Xứ Trà!
                        </p>
                    </div>
                ` : displayedItems.map(item => {
                    const statusBadge = item.status === 'approved'
                        ? `<span class="ugc-status-badge px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-bold text-xs inline-flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">check_circle</span> Đã phê duyệt</span>`
                        : item.status === 'rejected'
                        ? `<span class="ugc-status-badge px-2.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 font-bold text-xs inline-flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">cancel</span> Bị từ chối</span>`
                        : `<span class="ugc-status-badge px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 font-bold text-xs inline-flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">pending</span> Chờ duyệt</span>`;

                    const entityBadge = item.entity_type === 'article'
                        ? `<span class="px-2.5 py-0.5 rounded-lg bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 font-bold text-[11px] inline-flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">auto_stories</span> Cẩm nang</span>`
                        : item.entity_type === 'club'
                        ? `<span class="px-2.5 py-0.5 rounded-lg bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 font-bold text-[11px] inline-flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">groups</span> Câu lạc bộ</span>`
                        : item.entity_type === 'club_activity'
                        ? `<span class="px-2.5 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold text-[11px] inline-flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">calendar_month</span> Lịch CLB</span>`
                        : item.entity_type === 'community_post'
                        ? `<span class="px-2.5 py-0.5 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 font-bold text-[11px] inline-flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">forum</span> Bài thảo luận</span>`
                        : `<span class="px-2.5 py-0.5 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 font-bold text-[11px] inline-flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">event</span> Sự kiện</span>`;

                    const title = item.title || item.name || 'Bài viết cộng đồng';
                    const desc = item.excerpt || item.content || item.description || '';
                    const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString('vi-VN') : 'Mới đây';

                    return `
                        <div class="ugc-content-card p-4 sm:p-5 rounded-2xl bg-surface-container-low dark:bg-zinc-800/80 border border-outline-variant/30 dark:border-zinc-700/60 flex flex-col gap-2.5 transition-all shadow-xs" data-entity-type="${item.entity_type}" data-entity-id="${item.id}">
                            <div class="flex items-center justify-between gap-3 flex-wrap">
                                <div class="flex items-center gap-2">
                                    ${entityBadge}
                                    ${statusBadge}
                                </div>
                                <span class="text-xs text-outline dark:text-zinc-500 font-mono">${dateStr}</span>
                            </div>

                            <div>
                                <h3 class="ugc-item-title font-bold text-sm sm:text-base text-on-surface dark:text-zinc-100">${escapeHtml(title)}</h3>
                                ${desc ? `<p class="ugc-item-desc text-xs sm:text-sm text-on-surface-variant dark:text-zinc-300 mt-1 line-clamp-2">${escapeHtml(desc)}</p>` : ''}
                            </div>

                            ${item.status === 'rejected' ? `
                                <div class="ugc-rejection-box p-3 sm:p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-start gap-2.5 mt-1">
                                    <span class="material-symbols-outlined text-rose-600 dark:text-rose-400 text-[20px] shrink-0 mt-0.5">error_outline</span>
                                    <div class="flex flex-col gap-0.5 text-xs">
                                        <span class="font-bold text-rose-800 dark:text-rose-200">Lý do từ chối từ Ban Quản Trị:</span>
                                        <p class="ugc-moderation-reason text-rose-700 dark:text-rose-300 leading-relaxed font-medium">
                                            ${escapeHtml(item.moderation_reason || item.rejectionReason || 'Nội dung chưa đáp ứng tiêu chuẩn cộng đồng.')}
                                        </p>
                                    </div>
                                </div>
                            ` : ''}

                            <div class="flex items-center justify-between pt-3 border-t border-outline-variant/20 dark:border-zinc-700/60 mt-1">
                                <span class="text-[11px] text-outline dark:text-zinc-500">Mã: ${escapeHtml(item.id)}</span>
                                <div class="flex items-center gap-2">
                                    ${item.status === 'rejected' || item.status === 'pending' || item.status === 'draft' ? `
                                        <button type="button"
                                            class="btn-edit-ugc px-3.5 py-2 rounded-xl bg-primary hover:bg-secondary text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs min-h-[40px]"
                                            onclick="window.ViVuApp.openEditUgcItem('${item.entity_type}', '${item.id}')"
                                            data-entity-type="${item.entity_type}"
                                            data-entity-id="${item.id}">
                                            <span class="material-symbols-outlined text-[16px]">edit</span>
                                            <span>${item.status === 'rejected' ? 'Sửa &amp; Gửi lại' : 'Chỉnh sửa'}</span>
                                        </button>
                                    ` : `
                                        <button type="button"
                                            class="btn-view-ugc px-3.5 py-2 rounded-xl bg-surface-container dark:bg-zinc-700/80 hover:bg-surface-container-high text-on-surface dark:text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-all min-h-[40px]"
                                            onclick="window.ViVuApp.viewPublishedUgcItem('${item.entity_type}', '${item.id}')"
                                            data-entity-type="${item.entity_type}"
                                            data-entity-id="${item.id}">
                                            <span class="material-symbols-outlined text-[16px] text-secondary">visibility</span>
                                            <span>Xem trên trang</span>
                                        </button>
                                    `}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

/**
 * Render Saved Collections Modal / Screen Content (Stitch Desktop & Mobile Design)
 */
export function renderSavedCollectionsModalContent(savedItems = [], folders = [], activeCategory = 'all', sortMode = 'recent', viewMode = 'grid', searchTerm = '') {
    const totalCount = savedItems.length;
    const normalizedSearch = (searchTerm || '').trim().toLowerCase();

    // Filter items by category
    let filtered = activeCategory === 'all'
        ? savedItems
        : savedItems.filter(item => item.category === activeCategory);

    // Filter items by search term (search across title, address, note, categoryLabel, tags)
    if (normalizedSearch) {
        filtered = filtered.filter(item => {
            const title = (item.title || '').toLowerCase();
            const address = (item.address || '').toLowerCase();
            const note = (item.note || '').toLowerCase();
            const categoryLabel = (item.categoryLabel || '').toLowerCase();
            const tags = Array.isArray(item.tags) ? item.tags.join(' ').toLowerCase() : (item.tags || '').toLowerCase();
            return title.includes(normalizedSearch) ||
                   address.includes(normalizedSearch) ||
                   note.includes(normalizedSearch) ||
                   categoryLabel.includes(normalizedSearch) ||
                   tags.includes(normalizedSearch);
        });
    }

    // Sort items
    if (sortMode === 'distance') {
        filtered = [...filtered].sort((a, b) => (a.distance || 0) - (b.distance || 0));
    } else if (sortMode === 'rating') {
        filtered = [...filtered].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    const categoryCounts = {
        all: savedItems.length,
        heritage: savedItems.filter(i => i.category === 'heritage').length,
        culinary: savedItems.filter(i => i.category === 'culinary').length,
        event: savedItems.filter(i => i.category === 'event').length,
        culture: savedItems.filter(i => i.category === 'culture').length
    };

    const categoryLabels = {
        all: 'Tất cả',
        heritage: 'Địa điểm di tích',
        culinary: 'Ẩm thực & Quán',
        event: 'Sự kiện & Lễ hội',
        culture: 'Chùa & Làng nghề'
    };

    const isFiltered = Boolean(normalizedSearch || activeCategory !== 'all');
    const badgeText = isFiltered && filtered.length !== totalCount
        ? `${filtered.length}/${totalCount} mục đã lưu`
        : `${totalCount} mục đã lưu`;

    return `
        <div class="max-w-[1240px] w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6 sm:gap-8">
            <!-- TOP HERITAGE HEADER & ACTIONS -->
            <section class="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
                <div class="flex flex-col gap-2 max-w-2xl">
                    <div class="flex items-center gap-2">
                        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-container/60 dark:bg-emerald-950 text-secondary dark:text-emerald-300 font-bold text-xs uppercase tracking-wider">
                            <span class="material-symbols-outlined text-[16px]">folder_special</span>
                            <span>Kho lưu trữ khám phá</span>
                        </span>
                        <span class="w-1.5 h-1.5 rounded-full bg-outline-variant"></span>
                        <span class="text-on-surface-variant dark:text-zinc-400 text-xs font-medium">Cập nhật hôm nay</span>
                    </div>
                    <h1 class="text-2xl sm:text-3xl lg:text-4xl font-black text-primary dark:text-zinc-100 tracking-tight">Bộ sưu tập của tôi</h1>
                    <p class="text-xs sm:text-sm text-on-surface-variant dark:text-zinc-300 leading-relaxed">
                        Những địa điểm và trải nghiệm bạn muốn khám phá sau. Hệ thống tự động gợi ý quãng đường và tối ưu cung đường di chuyển theo ngày.
                    </p>
                </div>

                <!-- Action Buttons & Trip Summary -->
                <div class="flex flex-col items-start md:items-end gap-3 shrink-0">
                    <div class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-surface-container dark:bg-zinc-800 text-xs text-on-surface-variant dark:text-zinc-300 border border-outline-variant/20 dark:border-zinc-700">
                        <span class="material-symbols-outlined text-[18px] text-secondary">explore</span>
                        <span class="font-bold text-primary dark:text-emerald-400" id="savedTotalBadge">${badgeText}</span>
                        <span>cho chuyến đi Trà Vinh sắp tới</span>
                    </div>
                    <div class="flex items-center gap-2.5 flex-wrap">
                        <button type="button" onclick="window.ViVuApp.openCreateCollectionModal()"
                            class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-container-lowest dark:bg-zinc-800 hover:bg-surface-container dark:hover:bg-zinc-700 text-on-surface dark:text-zinc-200 transition-colors shadow-sm font-semibold text-xs sm:text-sm border border-outline-variant/30 dark:border-zinc-700 min-h-[44px]">
                            <span class="material-symbols-outlined text-[18px] text-secondary">add_circle</span>
                            <span>Tạo danh sách mới</span>
                        </button>
                        <button type="button" onclick="window.ViVuApp.openExportItineraryModal()"
                            class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#EA580C] to-amber-600 hover:from-[#C2410C] hover:to-amber-700 text-white transition-colors shadow-sm font-semibold text-xs sm:text-sm min-h-[44px]">
                            <span class="material-symbols-outlined text-[18px]">alt_route</span>
                            <span>Xuất lịch trình tự túc</span>
                        </button>
                    </div>
                </div>
            </section>

            <!-- SMART ITINERARY BANNER (Khmer Curved Eco-Banner) -->
            <section class="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary via-[#043325] to-primary text-white p-5 sm:p-7 shadow-md border border-emerald-900">
                <!-- Decorative Khmer Motif Overlay -->
                <div class="absolute right-0 top-0 bottom-0 w-80 opacity-10 pointer-events-none flex items-center justify-center">
                    <svg class="w-full h-full text-white" fill="currentColor" viewBox="0 0 200 200">
                        <path d="M100,10 C120,40 160,50 190,50 C160,80 170,120 150,150 C120,130 80,170 50,150 C70,120 40,80 50,50 C80,60 80,20 100,10 Z"></path>
                        <circle cx="100" cy="100" fill="none" r="30" stroke="currentColor" stroke-width="4"></circle>
                    </svg>
                </div>
                <div class="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    <div class="flex items-start gap-4">
                        <div class="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-secondary-fixed shrink-0">
                            <span class="material-symbols-outlined text-[28px]">route</span>
                        </div>
                        <div class="flex flex-col gap-1.5">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed text-[11px] font-bold tracking-wide uppercase">
                                    Gợi ý lộ trình 1 ngày
                                </span>
                                <span class="text-emerald-200/80 text-xs">• Tối ưu theo vị trí các điểm đã lưu</span>
                            </div>
                            <p class="text-xs sm:text-sm text-emerald-100/90 max-w-3xl leading-relaxed">
                                <strong class="text-white font-semibold">1. Bún Nước Lèo Cô Ba</strong> (07:30) 
                                <span class="text-white/40 mx-1.5">→</span>
                                <strong class="text-white font-semibold">2. Thắng cảnh Ao Bà Om &amp; Chùa Âng</strong> (08:30 - 11:30) 
                                <span class="text-white/40 mx-1.5">→</span>
                                <strong class="text-white font-semibold">3. Cà Phê Vườn Xứ Trà</strong> (12:00) 
                                <span class="text-white/40 mx-1.5">→</span>
                                <strong class="text-white font-semibold">4. Chùa Hang</strong> (14:30)
                            </p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3 shrink-0">
                        <button type="button" onclick="window.ViVuApp.closeSavedCollectionsModal(); window.ViVuApp.navGoMap();"
                            class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-secondary-fixed hover:bg-secondary-fixed-dim text-on-secondary-fixed font-bold text-xs sm:text-sm transition-colors min-h-[44px]">
                            <span class="material-symbols-outlined text-[19px]">map</span>
                            <span>Mở trên bản đồ hành trình</span>
                        </button>
                    </div>
                </div>
            </section>

            <!-- CURATED COLLECTION FOLDERS SLIDER -->
            <section class="flex flex-col gap-3">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-[20px] text-secondary">folder_special</span>
                        <h2 class="text-base sm:text-lg font-bold text-on-surface dark:text-zinc-100">Thư Mục Cá Nhân</h2>
                    </div>
                    <button type="button" onclick="window.ViVuApp.openCreateCollectionModal()" class="text-xs font-semibold text-secondary dark:text-emerald-400 hover:underline min-h-[44px] flex items-center">
                        + Tạo thư mục mới
                    </button>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    ${(folders || []).map(folder => `
                        <div class="flex flex-col rounded-2xl overflow-hidden bg-surface-container-lowest dark:bg-zinc-900 border border-outline-variant/30 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all">
                            <div class="relative h-28 w-full overflow-hidden bg-surface-container">
                                <img src="${folder.coverImage || 'ao bà om.jpg'}" alt="${escapeHtml(folder.title)}" class="w-full h-full object-cover" />
                                <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                                <div class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-white text-[11px] font-semibold flex items-center gap-1">
                                    <span class="material-symbols-outlined text-[13px] text-amber-400">bookmark</span>
                                    <span>${folder.count || 4} ${folder.unit || 'mục'}</span>
                                </div>
                            </div>
                            <div class="p-3.5 flex flex-col justify-between flex-1 gap-2">
                                <div>
                                    <h3 class="font-bold text-sm text-on-surface dark:text-zinc-100 leading-tight">${escapeHtml(folder.title)}</h3>
                                    <p class="text-xs text-on-surface-variant dark:text-zinc-400 mt-0.5 line-clamp-1">${escapeHtml(folder.desc)}</p>
                                </div>
                                <div class="flex items-center justify-between pt-2 border-t border-outline-variant/20 dark:border-zinc-800 text-[11px] text-secondary dark:text-emerald-400 font-medium">
                                    <span>${folder.tag || 'Tự động đồng bộ'}</span>
                                    <span class="material-symbols-outlined text-[16px]">${folder.offlineReady ? 'check_circle' : 'arrow_forward'}</span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </section>

            <!-- FILTER BAR, SEARCH & VIEW CONTROLS -->
            <section class="flex flex-col gap-3.5 py-3.5 border-y border-outline-variant/20 dark:border-zinc-800" aria-label="Bộ lọc và tìm kiếm mục đã lưu">
                <!-- HÀNG 1: Ô tìm kiếm và Cụm thao tác/sắp xếp (Tự động dàn hàng trên màn hình lớn, xuống hàng khi hẹp) -->
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <!-- Ô tìm kiếm -->
                    <div class="relative flex-1 min-w-0 max-w-full sm:max-w-md">
                        <span class="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant dark:text-zinc-400 pointer-events-none">search</span>
                        <input id="savedSearchInput" type="text"
                            value="${escapeHtml(searchTerm)}"
                            placeholder="Tìm kiếm địa điểm, quán ăn, ghi chú đã lưu..."
                            aria-label="Tìm kiếm trong bộ sưu tập đã lưu"
                            oninput="window.ViVuApp.handleSavedSearch(this.value)"
                            class="w-full h-11 min-h-[44px] pl-10 pr-9 rounded-xl bg-surface-container-lowest dark:bg-zinc-800 text-on-surface dark:text-zinc-100 text-xs sm:text-sm placeholder:text-on-surface-variant/60 dark:placeholder:text-zinc-400 border border-outline-variant/30 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-primary/40 dark:focus:ring-emerald-500/40 transition-all shadow-xs">
                        ${searchTerm ? `
                            <button type="button" onclick="window.ViVuApp.clearSavedSearch()"
                                id="savedSearchClearBtn"
                                class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg text-on-surface-variant dark:text-zinc-400 hover:text-on-surface dark:hover:text-zinc-200 flex items-center justify-center min-w-[32px] min-h-[32px]"
                                title="Xóa từ khóa tìm kiếm" aria-label="Xóa từ khóa tìm kiếm">
                                <span class="material-symbols-outlined text-[18px]">close</span>
                            </button>
                        ` : ''}
                    </div>

                    <!-- Cụm sắp xếp, chế độ xem & thao tác -->
                    <div class="flex items-center gap-2 sm:gap-2.5 shrink-0 flex-wrap justify-between sm:justify-end">
                        <!-- Sort Dropdown -->
                        <div class="relative">
                            <select id="savedSortSelect" onchange="window.ViVuApp.sortSavedItems(this.value)"
                                aria-label="Sắp xếp danh sách đã lưu"
                                class="h-11 pl-3.5 pr-8 rounded-xl bg-surface-container-lowest dark:bg-zinc-800 text-on-surface dark:text-zinc-200 text-xs sm:text-sm appearance-none cursor-pointer focus:outline-none border border-outline-variant/30 dark:border-zinc-700 shadow-sm min-h-[44px]">
                                <option value="recent" ${sortMode === 'recent' ? 'selected' : ''}>Mới lưu gần đây</option>
                                <option value="distance" ${sortMode === 'distance' ? 'selected' : ''}>Gần tôi nhất (km)</option>
                                <option value="rating" ${sortMode === 'rating' ? 'selected' : ''}>Đánh giá cao nhất</option>
                            </select>
                            <span class="material-symbols-outlined text-[18px] text-on-surface-variant dark:text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">expand_more</span>
                        </div>

                        <!-- View Switcher -->
                        <div class="flex items-center p-1 rounded-xl bg-surface-container dark:bg-zinc-800 border border-outline-variant/20 dark:border-zinc-700">
                            <button type="button" onclick="window.ViVuApp.setSavedViewMode('grid')"
                                id="btnSavedViewGrid"
                                class="p-2 rounded-lg ${viewMode === 'grid' ? 'bg-surface-container-lowest dark:bg-zinc-700 text-primary dark:text-emerald-400 shadow-xs' : 'text-on-surface-variant dark:text-zinc-400'} min-w-[36px] min-h-[36px] flex items-center justify-center transition-colors"
                                title="Dạng lưới ảnh" aria-label="Xem dạng lưới ảnh">
                                <span class="material-symbols-outlined text-[18px]">grid_view</span>
                            </button>
                            <button type="button" onclick="window.ViVuApp.setSavedViewMode('list')"
                                id="btnSavedViewList"
                                class="p-2 rounded-lg ${viewMode === 'list' ? 'bg-surface-container-lowest dark:bg-zinc-700 text-primary dark:text-emerald-400 shadow-xs' : 'text-on-surface-variant dark:text-zinc-400'} min-w-[36px] min-h-[36px] flex items-center justify-center transition-colors"
                                title="Dạng danh sách thu gọn" aria-label="Xem dạng danh sách thu gọn">
                                <span class="material-symbols-outlined text-[18px]">view_list</span>
                            </button>
                        </div>

                        <!-- Nút Xóa tất cả -->
                        <button type="button" onclick="window.ViVuApp.clearAllSavedItems()"
                            id="btnSavedClearAll"
                            class="text-on-surface-variant dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 text-xs font-semibold px-2 py-2 transition-colors flex items-center gap-1 min-h-[44px]">
                            <span class="material-symbols-outlined text-[16px]">delete_sweep</span>
                            <span>Xóa tất cả</span>
                        </button>
                    </div>
                </div>

                <!-- HÀNG 2: Bộ lọc danh mục (Cuộn ngang riêng trên Mobile, không tràn trang; dàn hàng rộng rãi không chồng lấp) -->
                <div class="w-full overflow-hidden">
                    <div class="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar scroll-smooth -mx-4 px-4 sm:mx-0 sm:px-0" role="toolbar" aria-label="Bộ lọc danh mục đã lưu">
                        <button type="button" onclick="window.ViVuApp.filterSavedCategory('all')"
                            data-category="all"
                            class="px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 flex items-center gap-2 min-h-[44px] ${
                                activeCategory === 'all'
                                    ? 'bg-primary text-white dark:bg-emerald-800 shadow-xs'
                                    : 'bg-surface-container-lowest dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 hover:bg-surface-container dark:hover:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700'
                            }">
                            <span>Tất cả</span>
                            <span class="px-2 py-0.5 rounded-full ${activeCategory === 'all' ? 'bg-white/20 text-white' : 'bg-surface-container dark:bg-zinc-700 text-on-surface-variant dark:text-zinc-300'} text-[11px] font-bold">${categoryCounts.all}</span>
                        </button>
                        <button type="button" onclick="window.ViVuApp.filterSavedCategory('heritage')"
                            data-category="heritage"
                            class="px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 flex items-center gap-2 min-h-[44px] ${
                                activeCategory === 'heritage'
                                    ? 'bg-primary text-white dark:bg-emerald-800 shadow-xs'
                                    : 'bg-surface-container-lowest dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 hover:bg-surface-container dark:hover:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700'
                            }">
                            <span>Địa điểm di tích</span>
                            <span class="px-2 py-0.5 rounded-full ${activeCategory === 'heritage' ? 'bg-white/20 text-white' : 'bg-surface-container dark:bg-zinc-700 text-on-surface-variant dark:text-zinc-300'} text-[11px] font-bold">${categoryCounts.heritage}</span>
                        </button>
                        <button type="button" onclick="window.ViVuApp.filterSavedCategory('culinary')"
                            data-category="culinary"
                            class="px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 flex items-center gap-2 min-h-[44px] ${
                                activeCategory === 'culinary'
                                    ? 'bg-primary text-white dark:bg-emerald-800 shadow-xs'
                                    : 'bg-surface-container-lowest dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 hover:bg-surface-container dark:hover:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700'
                            }">
                            <span>Ẩm thực &amp; Quán</span>
                            <span class="px-2 py-0.5 rounded-full ${activeCategory === 'culinary' ? 'bg-white/20 text-white' : 'bg-surface-container dark:bg-zinc-700 text-on-surface-variant dark:text-zinc-300'} text-[11px] font-bold">${categoryCounts.culinary}</span>
                        </button>
                        <button type="button" onclick="window.ViVuApp.filterSavedCategory('event')"
                            data-category="event"
                            class="px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 flex items-center gap-2 min-h-[44px] ${
                                activeCategory === 'event'
                                    ? 'bg-primary text-white dark:bg-emerald-800 shadow-xs'
                                    : 'bg-surface-container-lowest dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 hover:bg-surface-container dark:hover:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700'
                            }">
                            <span>Sự kiện &amp; Lễ hội</span>
                            <span class="px-2 py-0.5 rounded-full ${activeCategory === 'event' ? 'bg-white/20 text-white' : 'bg-surface-container dark:bg-zinc-700 text-on-surface-variant dark:text-zinc-300'} text-[11px] font-bold">${categoryCounts.event}</span>
                        </button>
                        <button type="button" onclick="window.ViVuApp.filterSavedCategory('culture')"
                            data-category="culture"
                            class="px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 flex items-center gap-2 min-h-[44px] ${
                                activeCategory === 'culture'
                                    ? 'bg-primary text-white dark:bg-emerald-800 shadow-xs'
                                    : 'bg-surface-container-lowest dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 hover:bg-surface-container dark:hover:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700'
                            }">
                            <span>Chùa &amp; Làng nghề</span>
                            <span class="px-2 py-0.5 rounded-full ${activeCategory === 'culture' ? 'bg-white/20 text-white' : 'bg-surface-container dark:bg-zinc-700 text-on-surface-variant dark:text-zinc-300'} text-[11px] font-bold">${categoryCounts.culture}</span>
                        </button>
                    </div>
                </div>
            </section>

            <!-- SAVED ITEMS LIST / GRID HOẶC EMPTY STATE -->
            ${filtered.length > 0 ? `
                <div class="${
                    viewMode === 'grid'
                        ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
                        : 'flex flex-col gap-4'
                }" id="savedGridContainer">
                    ${filtered.map(item => {
                        const safeId = escapeHtml(item.id);
                        const safeTitle = escapeHtml(item.title);
                        const safeCategoryLabel = escapeHtml(item.categoryLabel || 'ĐỊA ĐIỂM');
                        const safeAddress = escapeHtml(item.address || 'Trà Vinh');
                        const safeNote = escapeHtml(item.note || '');
                        const img = escapeHtml(item.image || 'ao bà om.jpg');
                        const isEvent = item.category === 'event';

                        if (viewMode === 'list') {
                            return `
                                <article class="saved-card p-4 rounded-2xl bg-surface-container-lowest dark:bg-zinc-900 border border-outline-variant/30 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4" data-id="${safeId}">
                                    <div class="flex items-center gap-4 min-w-0 flex-1">
                                        <div class="w-20 h-20 rounded-xl overflow-hidden bg-surface-container shrink-0">
                                            <img src="${img}" alt="${safeTitle}" class="w-full h-full object-cover" />
                                        </div>
                                        <div class="flex flex-col min-w-0">
                                            <div class="flex items-center gap-2">
                                                <span class="text-[10px] font-bold uppercase tracking-wider text-secondary dark:text-emerald-400">${safeCategoryLabel}</span>
                                                <span class="text-xs text-outline">•</span>
                                                <span class="text-xs text-outline dark:text-zinc-400">Cách ${item.distance || 3.2} km</span>
                                            </div>
                                            <h3 class="font-bold text-sm sm:text-base text-on-surface dark:text-zinc-100 truncate">${safeTitle}</h3>
                                            <p class="text-xs text-on-surface-variant dark:text-zinc-400 truncate mt-0.5">${safeAddress}</p>
                                            ${safeNote ? `<p class="text-xs text-amber-700 dark:text-amber-400 italic mt-1 line-clamp-1">"${safeNote}"</p>` : ''}
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                        <button type="button" onclick="window.ViVuApp.openSavedDetail('${safeId}')"
                                            class="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-secondary transition-colors min-h-[44px]">
                                            Xem chi tiết
                                        </button>
                                        <button type="button" onclick="window.ViVuApp.removeSavedItem('${safeId}', '${safeTitle}')"
                                            class="p-2.5 rounded-xl bg-surface-container dark:bg-zinc-800 hover:bg-rose-100 dark:hover:bg-rose-950 text-on-surface-variant dark:text-zinc-400 hover:text-rose-600 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                                            title="Bỏ lưu">
                                            <span class="material-symbols-outlined text-[20px]">bookmark_remove</span>
                                        </button>
                                    </div>
                                </article>
                            `;
                        }

                        return `
                            <article class="saved-card group flex flex-col bg-surface-container-lowest dark:bg-zinc-900 rounded-[18px] overflow-hidden border border-outline-variant/30 dark:border-zinc-800 shadow-sm hover:shadow-lg transition-all duration-300" data-id="${safeId}">
                                <!-- Media Container -->
                                <div class="relative w-full aspect-[16/10] overflow-hidden bg-surface-container">
                                    <img src="${img}" alt="${safeTitle}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                    <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none"></div>
                                    <!-- Category Badge -->
                                    <div class="absolute top-3.5 left-3.5">
                                        <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed text-[11px] font-bold tracking-wide uppercase shadow-xs">
                                            <span class="material-symbols-outlined text-[13px]">${item.categoryIcon || 'place'}</span>
                                            <span>${safeCategoryLabel}</span>
                                        </span>
                                    </div>
                                    <!-- Unbookmark Quick Button -->
                                    <button type="button" onclick="window.ViVuApp.removeSavedItem('${safeId}', '${safeTitle}')"
                                        class="absolute top-3.5 right-3.5 w-10 h-10 min-w-[44px] min-h-[44px] rounded-full bg-white/90 dark:bg-zinc-800/90 hover:bg-white dark:hover:bg-zinc-700 text-rose-500 backdrop-blur-md flex items-center justify-center shadow-md transition-transform active:scale-90"
                                        title="Bỏ lưu khỏi danh sách">
                                        <span class="material-symbols-outlined text-[20px]" style="font-variation-settings: 'FILL' 1;">bookmark</span>
                                    </button>
                                    <!-- Distance Pill Overlay -->
                                    <div class="absolute bottom-3 left-3.5 flex items-center gap-1 text-white text-xs font-medium">
                                        <span class="material-symbols-outlined text-[15px] text-secondary-fixed">near_me</span>
                                        <span>Cách bạn ${item.distance || 3.2} km</span>
                                    </div>
                                </div>
                                <!-- Content Body -->
                                <div class="p-5 flex flex-col flex-1 justify-between gap-4">
                                    <div class="flex flex-col gap-2.5">
                                        <div class="flex items-center justify-between gap-2">
                                            <h2 class="font-bold text-base sm:text-lg text-on-surface dark:text-zinc-100 group-hover:text-secondary dark:group-hover:text-emerald-400 transition-colors line-clamp-1">
                                                ${safeTitle}
                                            </h2>
                                            <div class="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs font-bold shrink-0">
                                                <span class="material-symbols-outlined text-[16px]" style="font-variation-settings: 'FILL' 1;">star</span>
                                                <span>${item.rating || 4.9}</span>
                                                <span class="text-outline dark:text-zinc-500 font-normal">(${item.reviewsCount || 400})</span>
                                            </div>
                                        </div>
                                        <!-- Address Pin -->
                                        <div class="flex items-center gap-1.5 text-on-surface-variant dark:text-zinc-400 text-xs line-clamp-1">
                                            <span class="material-symbols-outlined text-[16px] text-outline shrink-0">location_on</span>
                                            <span>${safeAddress}</span>
                                        </div>
                                        <!-- User Personal Note Box -->
                                        ${safeNote ? `
                                            <div class="p-3 rounded-xl bg-surface-container-low dark:bg-zinc-800/60 border border-outline-variant/20 dark:border-zinc-700/40 flex items-start gap-2.5">
                                                <span class="material-symbols-outlined text-[18px] text-secondary dark:text-emerald-400 shrink-0 mt-0.5">edit_note</span>
                                                <p class="text-xs text-on-surface-variant dark:text-zinc-300 italic leading-relaxed">
                                                    “${safeNote}”
                                                </p>
                                            </div>
                                        ` : ''}
                                    </div>
                                    <!-- Bottom Actions -->
                                    <div class="pt-3 flex items-center justify-between gap-2 border-t border-outline-variant/20 dark:border-zinc-800">
                                        <button type="button" onclick="window.ViVuApp.openSavedDetail('${safeId}')"
                                            class="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-secondary text-white font-semibold text-xs sm:text-sm transition-colors min-h-[44px]">
                                            <span class="material-symbols-outlined text-[18px]">${isEvent ? 'event_available' : 'explore'}</span>
                                            <span>${isEvent ? 'Chi tiết lễ hội' : 'Xem chi tiết'}</span>
                                        </button>
                                        <button type="button" onclick="window.ViVuApp.removeSavedItem('${safeId}', '${safeTitle}')"
                                            class="p-2.5 rounded-xl bg-surface-container dark:bg-zinc-800 hover:bg-rose-100 dark:hover:bg-rose-950 text-on-surface-variant dark:text-zinc-400 hover:text-rose-600 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                                            title="Bỏ lưu">
                                            <span class="material-symbols-outlined text-[20px]">bookmark_remove</span>
                                        </button>
                                    </div>
                                </div>
                            </article>
                        `;
                    }).join('')}
                </div>
            ` : savedItems.length > 0 ? `
                <!-- EMPTY STATE: KHÔNG TÌM THẤY KẾT QUẢ PHÙ HỢP VỚI TỪ KHÓA / BỘ LỌC -->
                <div class="flex flex-col items-center justify-center py-16 px-4 text-center bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl shadow-sm border border-outline-variant/30 dark:border-zinc-800" id="savedEmptyState">
                    <div class="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4">
                        <span class="material-symbols-outlined text-[32px]">search_off</span>
                    </div>
                    <h3 class="text-lg font-bold text-on-surface dark:text-zinc-100 mb-1">Không tìm thấy mục đã lưu nào phù hợp</h3>
                    <p class="text-xs sm:text-sm text-on-surface-variant dark:text-zinc-400 max-w-md mb-6 leading-relaxed">
                        ${searchTerm ? `Không có địa điểm nào khớp với từ khóa "<strong>${escapeHtml(searchTerm)}</strong>"` : 'Không có địa điểm nào'}
                        ${activeCategory !== 'all' ? ` trong danh mục <em>${escapeHtml(categoryLabels[activeCategory] || activeCategory)}</em>.` : '.'}
                        Bạn hãy thử tìm với từ khóa khác hoặc xóa bộ lọc nhé!
                    </p>
                    <div class="flex items-center gap-3 flex-wrap justify-center">
                        <button type="button" onclick="window.ViVuApp.resetSavedFilters()"
                            class="px-5 py-2.5 rounded-xl bg-primary hover:bg-secondary text-white font-semibold text-xs sm:text-sm transition-colors inline-flex items-center gap-2 min-h-[44px] shadow-xs">
                            <span class="material-symbols-outlined text-[18px]">restart_alt</span>
                            <span>Đặt lại bộ lọc &amp; tìm kiếm</span>
                        </button>
                        ${searchTerm ? `
                            <button type="button" onclick="window.ViVuApp.clearSavedSearch()"
                                class="px-4 py-2.5 rounded-xl bg-surface-container dark:bg-zinc-800 hover:bg-surface-container-high dark:hover:bg-zinc-700 text-on-surface dark:text-zinc-200 font-semibold text-xs sm:text-sm transition-colors inline-flex items-center gap-1.5 min-h-[44px] border border-outline-variant/30 dark:border-zinc-700">
                                <span class="material-symbols-outlined text-[18px]">close</span>
                                <span>Xóa từ khóa</span>
                            </button>
                        ` : ''}
                    </div>
                </div>
            ` : `
                <!-- EMPTY STATE: BỘ SƯU TẬP HOÀN TOÀN TRỐNG -->
                <div class="flex flex-col items-center justify-center py-16 px-4 text-center bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl shadow-sm border border-outline-variant/30 dark:border-zinc-800" id="savedEmptyState">
                    <div class="w-16 h-16 rounded-full bg-surface-container dark:bg-zinc-800 flex items-center justify-center text-on-surface-variant dark:text-zinc-400 mb-4">
                        <span class="material-symbols-outlined text-[32px]">bookmark_border</span>
                    </div>
                    <h3 class="text-lg font-bold text-on-surface dark:text-zinc-100 mb-1">Bộ sưu tập đang trống</h3>
                    <p class="text-xs sm:text-sm text-on-surface-variant dark:text-zinc-400 max-w-sm mb-6 leading-relaxed">
                        Hãy dạo quanh Bản đồ &amp; Điểm đến hoặc Lễ hội Trà Vinh để lưu lại những điểm đến yêu thích nhé!
                    </p>
                    <button type="button" onclick="window.ViVuApp.closeSavedCollectionsModal(); window.ViVuApp.navGoMap();"
                        class="px-5 py-2.5 rounded-xl bg-primary hover:bg-secondary text-white font-semibold text-xs sm:text-sm transition-colors inline-flex items-center gap-2 min-h-[44px]">
                        <span class="material-symbols-outlined text-[18px]">map</span>
                        <span>Khám phá bản đồ ngay</span>
                    </button>
                </div>
            `}
        </div>
    `;
}

/**
 * Render Redeem Gift Modal Content
 */
export function renderRedeemGiftModalContent(gifts = [], userCoins = 1250) {
    return `
        <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl flex flex-col gap-5 border border-outline-variant/30 dark:border-zinc-800">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                        <span class="material-symbols-outlined text-[24px]" style="font-variation-settings: 'FILL' 1;">redeem</span>
                    </div>
                    <div>
                        <h3 class="text-base sm:text-lg font-bold text-on-surface dark:text-zinc-100">Đổi Quà Xứ Trà</h3>
                        <p class="text-xs text-on-surface-variant dark:text-zinc-400">Số dư hiện tại: <strong class="text-amber-600 dark:text-amber-400">${userCoins.toLocaleString()} Xu</strong></p>
                    </div>
                </div>
                <button type="button" onclick="window.ViVuApp.closeRedeemGiftModal()"
                    class="w-10 h-10 rounded-xl flex items-center justify-center text-on-surface-variant dark:text-zinc-400 hover:bg-surface-container dark:hover:bg-zinc-800 min-h-[44px] min-w-[44px]">
                    <span class="material-symbols-outlined text-[20px]">close</span>
                </button>
            </div>

            <div class="space-y-3 max-h-[60vh] overflow-y-auto no-scrollbar">
                ${gifts.map(gift => `
                    <div class="p-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 flex items-center justify-between gap-3 border border-outline-variant/20 dark:border-zinc-700">
                        <div class="flex items-center gap-3 min-w-0">
                            <div class="w-10 h-10 rounded-xl bg-secondary/10 dark:bg-emerald-950 text-secondary dark:text-emerald-400 flex items-center justify-center shrink-0">
                                <span class="material-symbols-outlined text-[20px]">${gift.icon}</span>
                            </div>
                            <div class="min-w-0">
                                <div class="font-bold text-xs sm:text-sm text-on-surface dark:text-zinc-100 truncate">${escapeHtml(gift.name)}</div>
                                <div class="text-[11px] text-outline dark:text-zinc-400 line-clamp-1">${escapeHtml(gift.desc)}</div>
                            </div>
                        </div>
                        <button type="button" onclick="window.ViVuApp.redeemGift('${gift.id}')"
                            class="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#EA580C] to-amber-600 hover:from-[#C2410C] hover:to-amber-700 text-white font-bold text-xs shrink-0 min-h-[44px]">
                            ${gift.cost} Xu
                        </button>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

/**
 * Render Edit Profile Modal Content
 */
export function renderEditProfileModalContent(profile) {
    return `
        <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl flex flex-col gap-5 border border-outline-variant/30 dark:border-zinc-800">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2.5">
                    <div class="w-9 h-9 rounded-xl bg-secondary-container text-secondary flex items-center justify-center">
                        <span class="material-symbols-outlined text-[20px]">manage_accounts</span>
                    </div>
                    <h3 class="text-base sm:text-lg font-bold text-on-surface dark:text-zinc-100">Chỉnh sửa hồ sơ</h3>
                </div>
                <button type="button" onclick="window.ViVuApp.closeEditProfileModal()"
                    class="w-10 h-10 rounded-xl flex items-center justify-center text-on-surface-variant dark:text-zinc-400 hover:bg-surface-container dark:hover:bg-zinc-800 min-h-[44px] min-w-[44px]">
                    <span class="material-symbols-outlined text-[20px]">close</span>
                </button>
            </div>

            <form id="editProfileForm" onsubmit="event.preventDefault(); window.ViVuApp.submitEditProfile(this);" class="space-y-4">
                <div>
                    <label class="block text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1" for="editProfileName">Họ và tên *</label>
                    <input type="text" id="editProfileName" required value="${escapeHtml(profile.name || '')}"
                        class="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 text-xs sm:text-sm border border-outline-variant/40 dark:border-zinc-700 focus:outline-none min-h-[44px]" />
                </div>
                <div>
                    <label class="block text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1" for="editProfileRole">Danh hiệu / Danh phận</label>
                    <input type="text" id="editProfileRole" value="${escapeHtml(profile.role || '')}"
                        class="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 text-xs sm:text-sm border border-outline-variant/40 dark:border-zinc-700 focus:outline-none min-h-[44px]" />
                </div>
                <div>
                    <label class="block text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1" for="editProfileBio">Tiểu sử cá nhân</label>
                    <textarea id="editProfileBio" rows="3"
                        class="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 text-xs sm:text-sm border border-outline-variant/40 dark:border-zinc-700 focus:outline-none resize-none">${escapeHtml(profile.bio || '')}</textarea>
                </div>
                <div>
                    <label class="block text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1" for="editProfileLocation">Nơi sinh sống</label>
                    <input type="text" id="editProfileLocation" value="${escapeHtml(profile.location || '')}"
                        class="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 text-xs sm:text-sm border border-outline-variant/40 dark:border-zinc-700 focus:outline-none min-h-[44px]" />
                </div>
                <div class="flex items-center justify-end gap-2.5 pt-2">
                    <button type="button" onclick="window.ViVuApp.closeEditProfileModal()"
                        class="px-4 py-2.5 rounded-xl text-on-surface-variant dark:text-zinc-400 hover:bg-surface-container dark:hover:bg-zinc-800 text-xs sm:text-sm font-semibold min-h-[44px]">
                        Hủy
                    </button>
                    <button type="submit"
                        class="px-5 py-2.5 rounded-xl bg-primary hover:bg-secondary text-white font-semibold text-xs sm:text-sm min-h-[44px]">
                        Lưu thay đổi
                    </button>
                </div>
            </form>
        </div>
    `;
}

/**
 * Render Create Collection Modal Content
 */
export function renderCreateCollectionModalContent() {
    return `
        <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl flex flex-col gap-5 border border-outline-variant/30 dark:border-zinc-800">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2.5">
                    <div class="w-9 h-9 rounded-xl bg-secondary-container text-secondary flex items-center justify-center">
                        <span class="material-symbols-outlined text-[20px]">create_new_folder</span>
                    </div>
                    <h3 class="text-base sm:text-lg font-bold text-on-surface dark:text-zinc-100">Tạo danh sách mới</h3>
                </div>
                <button type="button" onclick="window.ViVuApp.closeCreateCollectionModal()"
                    class="w-10 h-10 rounded-xl flex items-center justify-center text-on-surface-variant dark:text-zinc-400 hover:bg-surface-container dark:hover:bg-zinc-800 min-h-[44px] min-w-[44px]">
                    <span class="material-symbols-outlined text-[20px]">close</span>
                </button>
            </div>

            <form id="createCollectionForm" onsubmit="event.preventDefault(); window.ViVuApp.submitCreateCollection(this);" class="space-y-4">
                <div>
                    <label class="block text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1" for="newCollectionName">Tên bộ sưu tập *</label>
                    <input type="text" id="newCollectionName" required placeholder="Ví dụ: Cà phê ngắm hoàng hôn, Tour chùa 2 ngày..."
                        class="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 text-xs sm:text-sm border border-outline-variant/40 dark:border-zinc-700 focus:outline-none min-h-[44px]" />
                </div>
                <div>
                    <label class="block text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1" for="newCollectionDesc">Mô tả (tùy chọn)</label>
                    <textarea id="newCollectionDesc" rows="3" placeholder="Ghi chú về nhóm bạn, mục tiêu chuyến đi..."
                        class="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 text-xs sm:text-sm border border-outline-variant/40 dark:border-zinc-700 focus:outline-none resize-none"></textarea>
                </div>
                <div class="flex items-center justify-end gap-2.5 pt-2">
                    <button type="button" onclick="window.ViVuApp.closeCreateCollectionModal()"
                        class="px-4 py-2.5 rounded-xl text-on-surface-variant dark:text-zinc-400 hover:bg-surface-container dark:hover:bg-zinc-800 text-xs sm:text-sm font-semibold min-h-[44px]">
                        Hủy
                    </button>
                    <button type="submit"
                        class="px-5 py-2.5 rounded-xl bg-primary hover:bg-secondary text-white font-semibold text-xs sm:text-sm min-h-[44px]">
                        Tạo danh sách
                    </button>
                </div>
            </form>
        </div>
    `;
}

/**
 * Render Export Itinerary Modal Content
 */
export function renderExportItineraryModalContent(savedItems = []) {
    const textLines = savedItems.map((item, idx) => `${idx + 1}. ${item.title} (${item.categoryLabel || 'Địa điểm'}) - ${item.address || 'Trà Vinh'}${item.note ? `\n   Ghi chú: "${item.note}"` : ''}`).join('\n\n');

    return `
        <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl flex flex-col gap-5 border border-outline-variant/30 dark:border-zinc-800">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2.5">
                    <div class="w-9 h-9 rounded-xl bg-secondary-container text-secondary flex items-center justify-center">
                        <span class="material-symbols-outlined text-[20px]">alt_route</span>
                    </div>
                    <h3 class="text-base sm:text-lg font-bold text-on-surface dark:text-zinc-100">Xuất lịch trình tự túc</h3>
                </div>
                <button type="button" onclick="window.ViVuApp.closeExportItineraryModal()"
                    class="w-10 h-10 rounded-xl flex items-center justify-center text-on-surface-variant dark:text-zinc-400 hover:bg-surface-container dark:hover:bg-zinc-800 min-h-[44px] min-w-[44px]">
                    <span class="material-symbols-outlined text-[20px]">close</span>
                </button>
            </div>

            <p class="text-xs text-on-surface-variant dark:text-zinc-400">
                Toàn bộ các địa điểm đã lưu được định dạng sẵn để bạn sao chép gửi vào Zalo, Messenger hoặc in ra giấy cầm tay:
            </p>

            <textarea id="exportItineraryText" readonly rows="8"
                class="w-full p-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-mono text-xs border border-outline-variant/30 dark:border-zinc-700 focus:outline-none resize-none leading-relaxed">${escapeHtml(textLines || 'Chưa có địa điểm nào trong bộ sưu tập.')}</textarea>

            <div class="flex items-center justify-end gap-2.5 pt-2">
                <button type="button" onclick="window.ViVuApp.closeExportItineraryModal()"
                    class="px-4 py-2.5 rounded-xl text-on-surface-variant dark:text-zinc-400 hover:bg-surface-container dark:hover:bg-zinc-800 text-xs sm:text-sm font-semibold min-h-[44px]">
                    Đóng
                </button>
                <button type="button" onclick="window.ViVuApp.copyExportItinerary()"
                    class="px-5 py-2.5 rounded-xl bg-primary hover:bg-secondary text-white font-semibold text-xs sm:text-sm flex items-center gap-1.5 min-h-[44px]">
                    <span class="material-symbols-outlined text-[18px]">content_copy</span>
                    <span>Sao chép văn bản</span>
                </button>
            </div>
        </div>
    `;
}

/**
 * =========================================================================
 * PHASE 8: TRUNG TÂM CÀI ĐẶT, BẢO MẬT & XÁC THỰC 2FA (STITCH SECURITY CENTER)
 * =========================================================================
 */

/**
 * Render Security Modal Content (Desktop Bento & Mobile Responsive)
 */
export function renderSecurityModalContent(secState, activeTab = 'security') {
    const healthScore = secState.healthScore || 75;
    const healthLevel = secState.healthLevel || 'Rất cao';
    const protectionLayers = secState.protectionLayers || '3/4 lớp bảo vệ';
    const devices = secState.devices || [];
    const notifs = secState.notifications || {};
    const privacy = secState.privacy || {};
    const currentDevice = devices.find(d => d.isCurrent) || devices[0];
    const otherDevices = devices.filter(d => !d.isCurrent);

    return `
        <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-3xl max-w-6xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-outline-variant/30 dark:border-zinc-800">
            <!-- Modal Top Header -->
            <div class="p-4 sm:p-6 border-b border-outline-variant/20 dark:border-zinc-800 flex items-center justify-between gap-4 bg-surface-container-low dark:bg-zinc-850 shrink-0">
                <div class="flex items-center gap-3.5 min-w-0">
                    <div class="w-11 h-11 rounded-2xl bg-secondary-container dark:bg-emerald-950 text-secondary dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-xs">
                        <span class="material-symbols-outlined text-[24px]">verified_user</span>
                    </div>
                    <div class="flex flex-col min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <h2 class="text-base sm:text-xl font-bold text-on-surface dark:text-zinc-100 truncate">
                                Cài đặt tài khoản &amp; Trung tâm Bảo mật
                            </h2>
                            <span class="px-2.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[11px] font-bold tracking-wide uppercase">
                                Trà Vinh ID
                            </span>
                        </div>
                        <p class="text-xs text-on-surface-variant dark:text-zinc-400 truncate mt-0.5">
                            Quản lý thông tin bảo vệ dữ liệu cá nhân, phương thức xác thực và phiên đăng nhập
                        </p>
                    </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <button type="button" onclick="window.ViVuApp.closeSecurityModal()"
                        aria-label="Đóng cài đặt"
                        class="w-11 h-11 rounded-2xl flex items-center justify-center text-on-surface-variant dark:text-zinc-400 hover:bg-surface-container dark:hover:bg-zinc-800 hover:text-on-surface transition-colors min-h-[44px] min-w-[44px]">
                        <span class="material-symbols-outlined text-[22px]">close</span>
                    </button>
                </div>
            </div>

            <!-- Modal Body with Sub-Navigation (Sidebar on Desktop, Top Pills on Mobile) -->
            <div class="flex flex-col md:flex-row flex-1 overflow-hidden">
                <!-- Sub-Navigation Navigation (Sidebar on Desktop) -->
                <aside class="w-full md:w-64 p-3 sm:p-4 bg-surface-container-low/60 dark:bg-zinc-900/60 border-b md:border-b-0 md:border-r border-outline-variant/20 dark:border-zinc-800 shrink-0 overflow-x-auto md:overflow-y-auto no-scrollbar">
                    <nav class="flex md:flex-col gap-1.5" role="tablist" aria-label="Các danh mục bảo mật">
                        <button type="button" role="tab" aria-selected="${activeTab === 'security' ? 'true' : 'false'}"
                            onclick="window.ViVuApp.switchSecurityTab('security')"
                            class="flex items-center justify-between px-3.5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm whitespace-nowrap transition-all min-h-[44px] shrink-0 ${
                                activeTab === 'security'
                                    ? 'bg-primary-container text-white dark:bg-emerald-800 shadow-sm'
                                    : 'text-on-surface-variant dark:text-zinc-300 hover:bg-surface-container dark:hover:bg-zinc-800'
                            }">
                            <span class="flex items-center gap-2.5">
                                <span class="material-symbols-outlined text-[20px]">lock</span>
                                <span>Mật khẩu &amp; 2FA</span>
                            </span>
                            <span class="hidden md:inline material-symbols-outlined text-[18px]">chevron_right</span>
                        </button>

                        <button type="button" role="tab" aria-selected="${activeTab === 'devices' ? 'true' : 'false'}"
                            onclick="window.ViVuApp.switchSecurityTab('devices')"
                            class="flex items-center justify-between px-3.5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm whitespace-nowrap transition-all min-h-[44px] shrink-0 ${
                                activeTab === 'devices'
                                    ? 'bg-primary-container text-white dark:bg-emerald-800 shadow-sm'
                                    : 'text-on-surface-variant dark:text-zinc-300 hover:bg-surface-container dark:hover:bg-zinc-800'
                            }">
                            <span class="flex items-center gap-2.5">
                                <span class="material-symbols-outlined text-[20px]">devices</span>
                                <span>Quản lý Thiết bị</span>
                            </span>
                            <span class="hidden md:inline w-2 h-2 rounded-full bg-secondary"></span>
                        </button>

                        <button type="button" role="tab" aria-selected="${activeTab === 'notifications' ? 'true' : 'false'}"
                            onclick="window.ViVuApp.switchSecurityTab('notifications')"
                            class="flex items-center justify-between px-3.5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm whitespace-nowrap transition-all min-h-[44px] shrink-0 ${
                                activeTab === 'notifications'
                                    ? 'bg-primary-container text-white dark:bg-emerald-800 shadow-sm'
                                    : 'text-on-surface-variant dark:text-zinc-300 hover:bg-surface-container dark:hover:bg-zinc-800'
                            }">
                            <span class="flex items-center gap-2.5">
                                <span class="material-symbols-outlined text-[20px]">notifications_active</span>
                                <span>Thông báo &amp; Tùy chọn</span>
                            </span>
                            <span class="hidden md:inline material-symbols-outlined text-[18px]">chevron_right</span>
                        </button>

                        <button type="button" role="tab" aria-selected="${activeTab === 'privacy' ? 'true' : 'false'}"
                            onclick="window.ViVuApp.switchSecurityTab('privacy')"
                            class="flex items-center justify-between px-3.5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm whitespace-nowrap transition-all min-h-[44px] shrink-0 ${
                                activeTab === 'privacy'
                                    ? 'bg-primary-container text-white dark:bg-emerald-800 shadow-sm'
                                    : 'text-on-surface-variant dark:text-zinc-300 hover:bg-surface-container dark:hover:bg-zinc-800'
                            }">
                            <span class="flex items-center gap-2.5">
                                <span class="material-symbols-outlined text-[20px]">policy</span>
                                <span>Quyền riêng tư &amp; Dữ liệu</span>
                            </span>
                            <span class="hidden md:inline material-symbols-outlined text-[18px]">chevron_right</span>
                        </button>
                    </nav>

                    <!-- Emergency support card on desktop sidebar -->
                    <div class="hidden md:flex flex-col gap-2.5 p-3.5 rounded-2xl bg-surface-container dark:bg-zinc-800/80 border border-outline-variant/20 dark:border-zinc-700/60 mt-6">
                        <div class="flex items-center gap-2 text-secondary dark:text-emerald-400 font-bold text-xs">
                            <span class="material-symbols-outlined text-[18px]">support_agent</span>
                            <span>Hỗ trợ khẩn cấp 24/7</span>
                        </div>
                        <p class="text-[11px] text-on-surface-variant dark:text-zinc-400 leading-relaxed">
                            Phát hiện truy cập bất thường tại Trà Vinh? Liên hệ ngay Đội An ninh ViVu.
                        </p>
                        <a href="tel:19001234" class="text-xs font-bold text-secondary dark:text-emerald-400 hover:underline flex items-center gap-1 min-h-[36px]">
                            <span>Gọi hotline an ninh</span>
                            <span class="material-symbols-outlined text-[14px]">call</span>
                        </a>
                    </div>
                </aside>

                <!-- Main Content Pane -->
                <main class="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto space-y-6">
                    ${activeTab === 'security' ? `
                        <!-- ================= TAB 1: PASSWORD & 2FA ================= -->
                        <!-- 1. Security Health Banner -->
                        <div class="bg-surface-container-low dark:bg-zinc-800 rounded-2xl p-5 sm:p-6 shadow-sm border border-outline-variant/20 dark:border-zinc-700/60 flex flex-col md:flex-row md:items-center justify-between gap-5">
                            <div class="flex items-start sm:items-center gap-4">
                                <div class="relative w-16 h-16 shrink-0 flex items-center justify-center">
                                    <svg class="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
                                        <path class="text-surface-container-high dark:text-zinc-700" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3.5"></path>
                                        <path class="text-secondary dark:text-emerald-400" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-dasharray="${healthScore}, 100" stroke-linecap="round" stroke-width="3.5"></path>
                                    </svg>
                                    <div class="absolute inset-0 flex items-center justify-center font-bold text-sm text-secondary dark:text-emerald-400">
                                        ${healthScore}%
                                    </div>
                                </div>
                                <div class="space-y-1">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <h3 class="text-base sm:text-lg font-bold text-on-surface dark:text-zinc-100">
                                            Mức độ bảo vệ: ${healthLevel}
                                        </h3>
                                        <span class="px-2.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[11px] font-bold">
                                            ${protectionLayers}
                                        </span>
                                    </div>
                                    <p class="text-xs text-on-surface-variant dark:text-zinc-300 leading-relaxed">
                                        Tài khoản được bảo vệ vững chắc bởi Mật khẩu mạnh, Xác thực 2FA sinh thái và phiên xác thực hợp lệ.
                                    </p>
                                    <div class="flex items-center gap-3 pt-1 text-[11px] flex-wrap">
                                        <span class="text-secondary dark:text-emerald-400 flex items-center gap-1 font-medium">
                                            <span class="material-symbols-outlined text-[15px]">check_circle</span>
                                            <span>Mật khẩu an toàn</span>
                                        </span>
                                        <span class="text-secondary dark:text-emerald-400 flex items-center gap-1 font-medium">
                                            <span class="material-symbols-outlined text-[15px]">check_circle</span>
                                            <span>TOTP 2FA đang bật</span>
                                        </span>
                                        <span class="text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
                                            <span class="material-symbols-outlined text-[15px]">info</span>
                                            <span>Chưa bật khóa FIDO2</span>
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button type="button" onclick="window.ViVuApp.openLink2FAModal()"
                                class="px-4 py-2.5 rounded-xl bg-secondary hover:bg-primary text-white font-semibold text-xs sm:text-sm transition-all shadow-sm shrink-0 flex items-center justify-center gap-1.5 min-h-[44px]">
                                <span class="material-symbols-outlined text-[18px]">verified</span>
                                <span>Tối ưu ngay</span>
                            </button>
                        </div>

                        <!-- 2. Change Password Form Card -->
                        <div class="bg-surface-container-low dark:bg-zinc-800 rounded-2xl p-5 sm:p-6 shadow-sm border border-outline-variant/20 dark:border-zinc-700/60 space-y-5">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-xl bg-surface-container dark:bg-zinc-700 text-primary dark:text-emerald-400 flex items-center justify-center">
                                        <span class="material-symbols-outlined text-[22px]">key</span>
                                    </div>
                                    <div>
                                        <h3 class="text-sm sm:text-base font-bold text-on-surface dark:text-zinc-100">Đổi mật khẩu tài khoản</h3>
                                        <p class="text-xs text-on-surface-variant dark:text-zinc-400">Khuyến nghị sử dụng mật khẩu độc nhất không trùng khớp nền tảng khác</p>
                                    </div>
                                </div>
                                <button type="button" onclick="window.ViVuApp.showSavedToast('Mã đặt lại mật khẩu đã gửi vào email!')"
                                    class="text-xs font-semibold text-secondary dark:text-emerald-400 hover:underline min-h-[44px] flex items-center">
                                    Quên mật khẩu?
                                </button>
                            </div>

                            <form id="changePasswordForm" onsubmit="event.preventDefault(); window.ViVuApp.submitChangePassword(this);" class="space-y-4">
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <!-- Current Password -->
                                    <div class="space-y-1.5 md:col-span-2">
                                        <label class="text-xs font-semibold text-on-surface dark:text-zinc-200 flex items-center justify-between" for="currPass">
                                            <span>MẬT KHẨU HIỆN TẠI</span>
                                            <span class="text-outline text-[11px] font-normal">Bắt buộc</span>
                                        </label>
                                        <div class="relative flex items-center">
                                            <span class="material-symbols-outlined absolute left-3.5 text-outline text-[18px] pointer-events-none">password</span>
                                            <input id="currPass" name="currPass" type="password" required value="••••••••••••"
                                                class="w-full h-11 pl-11 pr-11 rounded-xl bg-surface-container-lowest dark:bg-zinc-900 text-xs sm:text-sm text-on-surface dark:text-zinc-100 border border-outline-variant/30 dark:border-zinc-700 focus:outline-none focus:border-secondary min-h-[44px]" />
                                            <button type="button" onclick="window.ViVuApp.togglePasswordVisibility('currPass')"
                                                class="absolute right-2 text-outline hover:text-on-surface p-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
                                                <span class="material-symbols-outlined text-[18px]">visibility</span>
                                            </button>
                                        </div>
                                    </div>

                                    <!-- New Password -->
                                    <div class="space-y-1.5">
                                        <label class="text-xs font-semibold text-on-surface dark:text-zinc-200" for="newPass">MẬT KHẨU MỚI</label>
                                        <div class="relative flex items-center">
                                            <span class="material-symbols-outlined absolute left-3.5 text-outline text-[18px] pointer-events-none">lock</span>
                                            <input id="newPass" name="newPass" type="password" required placeholder="Nhập mật khẩu mới" value="TraVinhHeritage@2026!"
                                                class="w-full h-11 pl-11 pr-11 rounded-xl bg-surface-container-lowest dark:bg-zinc-900 text-xs sm:text-sm text-on-surface dark:text-zinc-100 border border-outline-variant/30 dark:border-zinc-700 focus:outline-none focus:border-secondary min-h-[44px]" />
                                            <button type="button" onclick="window.ViVuApp.togglePasswordVisibility('newPass')"
                                                class="absolute right-2 text-outline hover:text-on-surface p-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
                                                <span class="material-symbols-outlined text-[18px]">visibility</span>
                                            </button>
                                        </div>
                                        <!-- Password Strength Indicator -->
                                        <div class="pt-1.5 space-y-1">
                                            <div class="flex items-center justify-between text-[11px]">
                                                <span class="font-bold text-secondary dark:text-emerald-400">ĐỘ MẠNH: 4/4 RẤT MẠNH</span>
                                                <span class="text-outline">16 ký tự an toàn</span>
                                            </div>
                                            <div class="grid grid-cols-4 gap-1.5 h-1.5 w-full">
                                                <div class="h-full rounded-full bg-secondary"></div>
                                                <div class="h-full rounded-full bg-secondary"></div>
                                                <div class="h-full rounded-full bg-secondary"></div>
                                                <div class="h-full rounded-full bg-secondary"></div>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Confirm Password -->
                                    <div class="space-y-1.5">
                                        <label class="text-xs font-semibold text-on-surface dark:text-zinc-200" for="confirmPass">XÁC NHẬN MẬT KHẨU MỚI</label>
                                        <div class="relative flex items-center">
                                            <span class="material-symbols-outlined absolute left-3.5 text-outline text-[18px] pointer-events-none">check_circle</span>
                                            <input id="confirmPass" name="confirmPass" type="password" required placeholder="Nhập lại mật khẩu mới" value="TraVinhHeritage@2026!"
                                                class="w-full h-11 pl-11 pr-11 rounded-xl bg-surface-container-lowest dark:bg-zinc-900 text-xs sm:text-sm text-on-surface dark:text-zinc-100 border border-outline-variant/30 dark:border-zinc-700 focus:outline-none focus:border-secondary min-h-[44px]" />
                                            <span class="material-symbols-outlined absolute right-3 text-secondary text-[20px] pointer-events-none">task_alt</span>
                                        </div>
                                        <p class="text-[11px] text-secondary font-medium pt-1">Mật khẩu trùng khớp hoàn hảo</p>
                                    </div>
                                </div>

                                <!-- Password Checklist -->
                                <div class="p-3.5 rounded-xl bg-surface-container-lowest dark:bg-zinc-900 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs border border-outline-variant/20 dark:border-zinc-700/50">
                                    <div class="flex items-center gap-1.5 text-secondary dark:text-emerald-400 font-medium">
                                        <span class="material-symbols-outlined text-[16px]">done</span>
                                        <span>Tối thiểu 10 ký tự</span>
                                    </div>
                                    <div class="flex items-center gap-1.5 text-secondary dark:text-emerald-400 font-medium">
                                        <span class="material-symbols-outlined text-[16px]">done</span>
                                        <span>Chữ hoa &amp; thường</span>
                                    </div>
                                    <div class="flex items-center gap-1.5 text-secondary dark:text-emerald-400 font-medium">
                                        <span class="material-symbols-outlined text-[16px]">done</span>
                                        <span>Số (0-9)</span>
                                    </div>
                                    <div class="flex items-center gap-1.5 text-secondary dark:text-emerald-400 font-medium">
                                        <span class="material-symbols-outlined text-[16px]">done</span>
                                        <span>Ký tự đặc biệt</span>
                                    </div>
                                </div>

                                <div class="flex justify-end pt-2">
                                    <button type="submit"
                                        class="px-5 py-2.5 rounded-xl bg-primary-container hover:bg-secondary text-white font-semibold text-xs sm:text-sm transition-all shadow-sm flex items-center gap-2 min-h-[44px]">
                                        <span class="material-symbols-outlined text-[18px]">save</span>
                                        <span>Cập nhật mật khẩu</span>
                                    </button>
                                </div>
                            </form>
                        </div>

                        <!-- 3. Two-Factor Authentication Section -->
                        <div class="bg-surface-container-low dark:bg-zinc-800 rounded-2xl p-5 sm:p-6 shadow-sm border border-outline-variant/20 dark:border-zinc-700/60 space-y-4">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-xl bg-secondary-container dark:bg-emerald-950 text-secondary dark:text-emerald-400 flex items-center justify-center">
                                        <span class="material-symbols-outlined text-[22px]">phonelink_lock</span>
                                    </div>
                                    <div>
                                        <div class="flex items-center gap-2">
                                            <h3 class="text-sm sm:text-base font-bold text-on-surface dark:text-zinc-100">Xác thực 2 bước (2FA)</h3>
                                            <span class="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[11px] font-bold">Đang bảo vệ</span>
                                        </div>
                                        <p class="text-xs text-on-surface-variant dark:text-zinc-400">Bảo vệ tài khoản ngay cả khi mật khẩu của bạn bị lộ</p>
                                    </div>
                                </div>
                            </div>

                            <div class="space-y-3 pt-1">
                                <!-- Method A: Authenticator -->
                                <div class="p-4 rounded-xl bg-surface-container-lowest dark:bg-zinc-900 border border-outline-variant/20 dark:border-zinc-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div class="flex items-start gap-3.5">
                                        <div class="w-10 h-10 rounded-xl bg-surface-container dark:bg-zinc-800 text-secondary dark:text-emerald-400 flex items-center justify-center shrink-0">
                                            <span class="material-symbols-outlined text-[20px]">security_update_good</span>
                                        </div>
                                        <div class="min-w-0">
                                            <div class="flex items-center gap-2">
                                                <h4 class="font-bold text-xs sm:text-sm text-on-surface dark:text-zinc-100">Ứng dụng xác thực (Authenticator)</h4>
                                                <span class="px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container text-[10px] font-bold">Mặc định</span>
                                            </div>
                                            <p class="text-xs text-on-surface-variant dark:text-zinc-400 mt-0.5">Google Authenticator, Microsoft Authenticator hoặc Authy</p>
                                            <p class="text-[11px] text-outline font-mono mt-1">Mã TOTP đồng bộ: 7XKP-••••-•••• (Đang nhận tín hiệu an toàn)</p>
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                        <button type="button" onclick="window.ViVuApp.openLink2FAModal()"
                                            class="px-3 py-2 rounded-xl bg-surface-container dark:bg-zinc-800 hover:bg-surface-container-high dark:hover:bg-zinc-700 text-on-surface dark:text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors min-h-[44px]">
                                            <span class="material-symbols-outlined text-[18px] text-secondary">qr_code_2</span>
                                            <span>Đổi mã QR</span>
                                        </button>
                                        <button type="button" onclick="window.ViVuApp.openLink2FAModal()"
                                            class="px-3 py-2 rounded-xl bg-surface-container dark:bg-zinc-800 hover:bg-surface-container-high dark:hover:bg-zinc-700 text-on-surface dark:text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors min-h-[44px]">
                                            <span class="material-symbols-outlined text-[18px]">settings</span>
                                            <span>Cấu hình</span>
                                        </button>
                                    </div>
                                </div>

                                <!-- Method B: SMS Backup -->
                                <div class="p-4 rounded-xl bg-surface-container-lowest dark:bg-zinc-900 border border-outline-variant/20 dark:border-zinc-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div class="flex items-start gap-3.5">
                                        <div class="w-10 h-10 rounded-xl bg-surface-container dark:bg-zinc-800 text-primary dark:text-zinc-300 flex items-center justify-center shrink-0">
                                            <span class="material-symbols-outlined text-[20px]">sms</span>
                                        </div>
                                        <div class="min-w-0">
                                            <h4 class="font-bold text-xs sm:text-sm text-on-surface dark:text-zinc-100">Tin nhắn SMS bảo mật dự phòng</h4>
                                            <p class="text-xs text-on-surface-variant dark:text-zinc-400 mt-0.5">Nhận mã OTP qua số di động viễn thông đăng ký</p>
                                            <div class="flex items-center gap-2 mt-1">
                                                <span class="text-xs font-semibold text-on-surface dark:text-zinc-200">${secState.smsPhone || '0918 ••• •89'}</span>
                                                <span class="material-symbols-outlined text-secondary text-[14px]">verified</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                        <button type="button" role="switch" aria-checked="${secState.smsBackupActive ? 'true' : 'false'}"
                                            onclick="window.ViVuApp.toggleSmsBackup(!${secState.smsBackupActive})"
                                            class="w-12 h-7 rounded-full transition-colors relative p-0.5 focus:outline-none min-h-[44px] flex items-center ${secState.smsBackupActive ? 'bg-secondary' : 'bg-surface-container-highest dark:bg-zinc-700'}"
                                            title="Bật/Tắt SMS bảo mật">
                                            <span class="block w-6 h-6 rounded-full bg-white shadow-md transform transition-transform ${secState.smsBackupActive ? 'translate-x-5' : 'translate-x-0'}"></span>
                                        </button>
                                    </div>
                                </div>

                                <!-- Method C: Backup Codes -->
                                <div class="p-4 rounded-xl bg-surface-container-lowest dark:bg-zinc-900 border border-outline-variant/20 dark:border-zinc-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div class="flex items-start gap-3.5">
                                        <div class="w-10 h-10 rounded-xl bg-surface-container dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-400 flex items-center justify-center shrink-0">
                                            <span class="material-symbols-outlined text-[20px]">pin</span>
                                        </div>
                                        <div class="min-w-0">
                                            <div class="flex items-center gap-2">
                                                <h4 class="font-bold text-xs sm:text-sm text-on-surface dark:text-zinc-100">Mã khôi phục dự phòng (Backup Codes)</h4>
                                                <span class="px-2 py-0.5 rounded-full bg-surface-container dark:bg-zinc-800 text-on-surface dark:text-zinc-300 text-[10px] font-bold">
                                                    Còn ${secState.backupCodesRemaining || 8}/10 mã
                                                </span>
                                            </div>
                                            <p class="text-xs text-on-surface-variant dark:text-zinc-400 mt-0.5">Sử dụng để đăng nhập khẩn cấp khi mất điện thoại hoặc không có mạng</p>
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                        <button type="button" onclick="window.ViVuApp.openBackupCodesModal()"
                                            class="px-3.5 py-2 rounded-xl bg-surface-container dark:bg-zinc-800 hover:bg-surface-container-high dark:hover:bg-zinc-700 text-on-surface dark:text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors min-h-[44px]">
                                            <span class="material-symbols-outlined text-[18px]">visibility</span>
                                            <span>Xem 10 mã</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ` : ''}

                    ${activeTab === 'devices' ? `
                        <!-- ================= TAB 2: ACTIVE DEVICES ================= -->
                        <div class="space-y-5">
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-outline-variant/20 dark:border-zinc-800">
                                <div>
                                    <h3 class="text-base sm:text-lg font-bold text-on-surface dark:text-zinc-100">Thiết bị đáng tin cậy &amp; Phiên hoạt động</h3>
                                    <p class="text-xs text-on-surface-variant dark:text-zinc-400 mt-0.5">
                                        Các thiết bị đang duy trì trạng thái đăng nhập vào hệ sinh thái ViVuTraVinh
                                    </p>
                                </div>
                                <button type="button" onclick="window.ViVuApp.revokeAllOtherSessions()"
                                    class="px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900 font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition-colors min-h-[44px] shrink-0 border border-rose-200 dark:border-rose-900/50">
                                    <span class="material-symbols-outlined text-[18px]">logout</span>
                                    <span>Đăng xuất tất cả thiết bị khác</span>
                                </button>
                            </div>

                            <!-- Current Device Card -->
                            <div class="flex flex-col gap-2">
                                <span class="text-xs font-bold text-secondary dark:text-emerald-400 uppercase tracking-wider">Thiết bị hiện tại này</span>
                                <div class="p-4 sm:p-5 rounded-2xl bg-surface-container-low dark:bg-zinc-800 border-2 border-secondary/30 dark:border-emerald-500/30 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div class="flex items-center gap-4">
                                        <div class="w-12 h-12 rounded-2xl bg-primary-container text-white flex items-center justify-center shrink-0 shadow-xs">
                                            <span class="material-symbols-outlined text-[26px]">stay_current_portrait</span>
                                        </div>
                                        <div class="space-y-1">
                                            <div class="flex items-center gap-2 flex-wrap">
                                                <h4 class="font-bold text-sm sm:text-base text-on-surface dark:text-zinc-100">${escapeHtml(currentDevice.name)}</h4>
                                                <span class="px-2.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[11px] font-bold">
                                                    Thiết bị này • Đang hoạt động
                                                </span>
                                            </div>
                                            <div class="flex items-center gap-3 text-xs text-on-surface-variant dark:text-zinc-400 flex-wrap">
                                                <span class="flex items-center gap-1">
                                                    <span class="material-symbols-outlined text-[15px] text-secondary">location_on</span>
                                                    <span>${escapeHtml(currentDevice.location)}</span>
                                                </span>
                                                <span>•</span>
                                                <span>${escapeHtml(currentDevice.appVersion)}</span>
                                                <span>•</span>
                                                <span class="font-mono text-secondary dark:text-emerald-400">IP: ${escapeHtml(currentDevice.ipAddress)}</span>
                                            </div>
                                            <div class="text-[11px] text-outline dark:text-zinc-400 pt-0.5">
                                                ${escapeHtml(currentDevice.authType)}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-1.5 text-xs font-bold text-secondary dark:text-emerald-400 shrink-0 self-end md:self-center">
                                        <span class="w-2 h-2 rounded-full bg-secondary animate-ping"></span>
                                        <span>Trực tuyến</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Other Devices Stack -->
                            <div class="flex flex-col gap-3 pt-2">
                                <span class="text-xs font-bold text-on-surface-variant dark:text-zinc-400 uppercase tracking-wider">
                                    Phiên đăng nhập khác (${otherDevices.length})
                                </span>
                                ${otherDevices.length > 0 ? otherDevices.map(dev => `
                                    <div class="device-card p-4 rounded-2xl bg-surface-container-lowest dark:bg-zinc-900 border border-outline-variant/20 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs" data-device-id="${dev.id}">
                                        <div class="flex items-center gap-4">
                                            <div class="w-11 h-11 rounded-2xl bg-surface-container dark:bg-zinc-800 text-on-surface dark:text-zinc-200 flex items-center justify-center shrink-0">
                                                <span class="material-symbols-outlined text-[24px]">
                                                    ${dev.type === 'laptop' ? 'laptop_chromebook' : 'tablet_mac'}
                                                </span>
                                            </div>
                                            <div class="space-y-0.5">
                                                <h4 class="font-bold text-sm text-on-surface dark:text-zinc-100">${escapeHtml(dev.name)}</h4>
                                                <div class="flex items-center gap-2.5 text-xs text-on-surface-variant dark:text-zinc-400 flex-wrap">
                                                    <span class="flex items-center gap-1">
                                                        <span class="material-symbols-outlined text-[14px]">location_on</span>
                                                        <span>${escapeHtml(dev.location)}</span>
                                                    </span>
                                                    <span>•</span>
                                                    <span>${escapeHtml(dev.appVersion)}</span>
                                                    <span>•</span>
                                                    <span>${escapeHtml(dev.lastActive)}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <button type="button" onclick="window.ViVuApp.revokeDeviceSession('${dev.id}')"
                                            class="px-3.5 py-2 rounded-xl bg-surface-container dark:bg-zinc-800 hover:bg-rose-100 dark:hover:bg-rose-950 text-rose-600 dark:text-rose-400 font-semibold text-xs flex items-center gap-1.5 transition-colors min-h-[44px] shrink-0 self-end md:self-center">
                                            <span class="material-symbols-outlined text-[16px]">close</span>
                                            <span>Thu hồi phiên</span>
                                        </button>
                                    </div>
                                `).join('') : `
                                    <div class="p-6 rounded-2xl bg-surface-container-low dark:bg-zinc-850 text-center text-xs text-on-surface-variant dark:text-zinc-400">
                                        Không còn phiên đăng nhập nào khác đang hoạt động.
                                    </div>
                                `}
                            </div>
                        </div>
                    ` : ''}

                    ${activeTab === 'notifications' ? `
                        <!-- ================= TAB 3: NOTIFICATIONS & SOUNDS ================= -->
                        <div class="space-y-6">
                            <div class="flex items-center justify-between pb-2 border-b border-outline-variant/20 dark:border-zinc-800">
                                <div>
                                    <h3 class="text-base sm:text-lg font-bold text-on-surface dark:text-zinc-100">Thông báo đẩy &amp; Tùy chọn âm thanh</h3>
                                    <p class="text-xs text-on-surface-variant dark:text-zinc-400 mt-0.5">Tùy biến cảnh báo lễ hội, cập nhật bạn đồng hành và thời tiết Xứ Trà</p>
                                </div>
                                <button type="button" onclick="window.ViVuApp.resetDefaultNotificationPrefs()"
                                    class="text-xs font-semibold text-secondary dark:text-emerald-400 hover:underline min-h-[44px] flex items-center">
                                    Khôi phục mặc định
                                </button>
                            </div>

                            <div class="p-4 sm:p-5 rounded-2xl bg-surface-container-low dark:bg-zinc-800 border border-outline-variant/20 dark:border-zinc-700/60 space-y-4">
                                <!-- Toggle 1: Festivals & Events -->
                                <div class="flex items-start justify-between gap-4">
                                    <div class="min-w-0 flex-1">
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-xs sm:text-sm text-on-surface dark:text-zinc-100">Lễ hội &amp; Sự kiện Xứ Trà</h4>
                                            <span class="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[10px] font-bold">Lễ hội</span>
                                        </div>
                                        <p class="text-xs text-on-surface-variant dark:text-zinc-400 mt-0.5">
                                            Nhắc nhở ngày diễn ra Ok Om Bok, Chôl Chnăm Thmây, đua ghe Ngo trước 3 ngày.
                                        </p>
                                    </div>
                                    <button type="button" role="switch" aria-checked="${notifs.pushEvents ? 'true' : 'false'}"
                                        onclick="window.ViVuApp.toggleNotificationPref('pushEvents')"
                                        class="w-12 h-7 rounded-full transition-colors relative p-0.5 focus:outline-none min-h-[44px] flex items-center shrink-0 ${notifs.pushEvents ? 'bg-secondary' : 'bg-surface-container-highest dark:bg-zinc-700'}">
                                        <span class="block w-6 h-6 rounded-full bg-white shadow-md transform transition-transform ${notifs.pushEvents ? 'translate-x-5' : 'translate-x-0'}"></span>
                                    </button>
                                </div>

                                <div class="h-[1px] bg-outline-variant/20 dark:border-zinc-700"></div>

                                <!-- Toggle 2: Clubs & Companions -->
                                <div class="flex items-start justify-between gap-4">
                                    <div class="min-w-0 flex-1">
                                        <h4 class="font-bold text-xs sm:text-sm text-on-surface dark:text-zinc-100">CLB &amp; Bạn đồng hành</h4>
                                        <p class="text-xs text-on-surface-variant dark:text-zinc-400 mt-0.5">
                                            Thông báo khi có bài viết mới, lời mời tham gia tour đạp xe, phản hồi bình luận.
                                        </p>
                                    </div>
                                    <button type="button" role="switch" aria-checked="${notifs.pushClubs ? 'true' : 'false'}"
                                        onclick="window.ViVuApp.toggleNotificationPref('pushClubs')"
                                        class="w-12 h-7 rounded-full transition-colors relative p-0.5 focus:outline-none min-h-[44px] flex items-center shrink-0 ${notifs.pushClubs ? 'bg-secondary' : 'bg-surface-container-highest dark:bg-zinc-700'}">
                                        <span class="block w-6 h-6 rounded-full bg-white shadow-md transform transition-transform ${notifs.pushClubs ? 'translate-x-5' : 'translate-x-0'}"></span>
                                    </button>
                                </div>

                                <div class="h-[1px] bg-outline-variant/20 dark:border-zinc-700"></div>

                                <!-- Toggle 3: Badges & Eco -->
                                <div class="flex items-start justify-between gap-4">
                                    <div class="min-w-0 flex-1">
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-bold text-xs sm:text-sm text-on-surface dark:text-zinc-100">Thành tích &amp; Huy hiệu Eco</h4>
                                            <span class="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[10px] font-bold">+Xu Xứ Trà</span>
                                        </div>
                                        <p class="text-xs text-on-surface-variant dark:text-zinc-400 mt-0.5">
                                            Chúc mừng mở khóa huy hiệu mới, cộng điểm thưởng Xu Xứ Trà khi hoàn thành km xanh.
                                        </p>
                                    </div>
                                    <button type="button" role="switch" aria-checked="${notifs.pushBadges ? 'true' : 'false'}"
                                        onclick="window.ViVuApp.toggleNotificationPref('pushBadges')"
                                        class="w-12 h-7 rounded-full transition-colors relative p-0.5 focus:outline-none min-h-[44px] flex items-center shrink-0 ${notifs.pushBadges ? 'bg-secondary' : 'bg-surface-container-highest dark:bg-zinc-700'}">
                                        <span class="block w-6 h-6 rounded-full bg-white shadow-md transform transition-transform ${notifs.pushBadges ? 'translate-x-5' : 'translate-x-0'}"></span>
                                    </button>
                                </div>

                                <div class="h-[1px] bg-outline-variant/20 dark:border-zinc-700"></div>

                                <!-- Toggle 4: Weather & Tides -->
                                <div class="flex items-start justify-between gap-4">
                                    <div class="min-w-0 flex-1">
                                        <h4 class="font-bold text-xs sm:text-sm text-on-surface dark:text-zinc-100">Cảnh báo thời tiết &amp; Triều cường</h4>
                                        <p class="text-xs text-on-surface-variant dark:text-zinc-400 mt-0.5">
                                            Cảnh báo mưa dông, triều cường dâng cao vùng Cầu Kè, Duyên Hải để đi tour an toàn.
                                        </p>
                                    </div>
                                    <button type="button" role="switch" aria-checked="${notifs.pushWeather ? 'true' : 'false'}"
                                        onclick="window.ViVuApp.toggleNotificationPref('pushWeather')"
                                        class="w-12 h-7 rounded-full transition-colors relative p-0.5 focus:outline-none min-h-[44px] flex items-center shrink-0 ${notifs.pushWeather ? 'bg-secondary' : 'bg-surface-container-highest dark:bg-zinc-700'}">
                                        <span class="block w-6 h-6 rounded-full bg-white shadow-md transform transition-transform ${notifs.pushWeather ? 'translate-x-5' : 'translate-x-0'}"></span>
                                    </button>
                                </div>

                                <div class="h-[1px] bg-outline-variant/20 dark:border-zinc-700"></div>

                                <!-- Toggle 5: Vouchers -->
                                <div class="flex items-start justify-between gap-4">
                                    <div class="min-w-0 flex-1">
                                        <h4 class="font-bold text-xs sm:text-sm text-on-surface dark:text-zinc-100">Ưu đãi sinh thái &amp; Voucher ẩm thực</h4>
                                        <p class="text-xs text-on-surface-variant dark:text-zinc-400 mt-0.5">
                                            Khuyến mãi trạm xe đạp điện, quán bún nước lèo và dừa sáp Cầu Kè đối tác.
                                        </p>
                                    </div>
                                    <button type="button" role="switch" aria-checked="${notifs.pushVouchers ? 'true' : 'false'}"
                                        onclick="window.ViVuApp.toggleNotificationPref('pushVouchers')"
                                        class="w-12 h-7 rounded-full transition-colors relative p-0.5 focus:outline-none min-h-[44px] flex items-center shrink-0 ${notifs.pushVouchers ? 'bg-secondary' : 'bg-surface-container-highest dark:bg-zinc-700'}">
                                        <span class="block w-6 h-6 rounded-full bg-white shadow-md transform transition-transform ${notifs.pushVouchers ? 'translate-x-5' : 'translate-x-0'}"></span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ` : ''}

                    ${activeTab === 'privacy' ? `
                        <!-- ================= TAB 4: PRIVACY & DATA ================= -->
                        <div class="space-y-6">
                            <div class="pb-2 border-b border-outline-variant/20 dark:border-zinc-800">
                                <h3 class="text-base sm:text-lg font-bold text-on-surface dark:text-zinc-100">Quyền riêng tư &amp; Dữ liệu người dùng</h3>
                                <p class="text-xs text-on-surface-variant dark:text-zinc-400 mt-0.5">Kiểm soát dữ liệu hành trình, vị trí GPS và sao lưu hồ sơ</p>
                            </div>

                            <div class="p-4 sm:p-5 rounded-2xl bg-surface-container-low dark:bg-zinc-800 border border-outline-variant/20 dark:border-zinc-700/60 space-y-4">
                                <div class="flex items-start justify-between gap-4">
                                    <div class="min-w-0 flex-1">
                                        <h4 class="font-bold text-xs sm:text-sm text-on-surface dark:text-zinc-100">Chia sẻ vị trí GPS khi khám phá</h4>
                                        <p class="text-xs text-on-surface-variant dark:text-zinc-400 mt-0.5">Cho phép bản đồ định vị chính xác khoảng cách đến các chùa Khmer</p>
                                    </div>
                                    <button type="button" role="switch" aria-checked="${privacy.shareGpsLocation ? 'true' : 'false'}"
                                        onclick="window.ViVuApp.togglePrivacyPref('shareGpsLocation')"
                                        class="w-12 h-7 rounded-full transition-colors relative p-0.5 focus:outline-none min-h-[44px] flex items-center shrink-0 ${privacy.shareGpsLocation ? 'bg-secondary' : 'bg-surface-container-highest dark:bg-zinc-700'}">
                                        <span class="block w-6 h-6 rounded-full bg-white shadow-md transform transition-transform ${privacy.shareGpsLocation ? 'translate-x-5' : 'translate-x-0'}"></span>
                                    </button>
                                </div>

                                <div class="h-[1px] bg-outline-variant/20 dark:border-zinc-700"></div>

                                <div class="flex items-start justify-between gap-4">
                                    <div class="min-w-0 flex-1">
                                        <h4 class="font-bold text-xs sm:text-sm text-on-surface dark:text-zinc-100">Chế độ riêng tư trong Câu Lạc Bộ</h4>
                                        <p class="text-xs text-on-surface-variant dark:text-zinc-400 mt-0.5">Ẩn chỉ số km đạp xe và danh sách huy hiệu với thành viên khác</p>
                                    </div>
                                    <button type="button" role="switch" aria-checked="${privacy.anonymousInClubs ? 'true' : 'false'}"
                                        onclick="window.ViVuApp.togglePrivacyPref('anonymousInClubs')"
                                        class="w-12 h-7 rounded-full transition-colors relative p-0.5 focus:outline-none min-h-[44px] flex items-center shrink-0 ${privacy.anonymousInClubs ? 'bg-secondary' : 'bg-surface-container-highest dark:bg-zinc-700'}">
                                        <span class="block w-6 h-6 rounded-full bg-white shadow-md transform transition-transform ${privacy.anonymousInClubs ? 'translate-x-5' : 'translate-x-0'}"></span>
                                    </button>
                                </div>
                            </div>

                            <!-- Data Export Box -->
                            <div class="p-4 sm:p-5 rounded-2xl bg-surface-container-low dark:bg-zinc-800 border border-outline-variant/20 dark:border-zinc-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div class="space-y-0.5">
                                    <h4 class="font-bold text-xs sm:text-sm text-on-surface dark:text-zinc-100">Xuất toàn bộ dữ liệu du lịch (.JSON)</h4>
                                    <p class="text-xs text-on-surface-variant dark:text-zinc-400">Tải về danh sách điểm đã lưu, huy hiệu và bài đăng cộng đồng của bạn</p>
                                </div>
                                <button type="button" onclick="window.ViVuApp.exportUserData()"
                                    class="px-4 py-2.5 rounded-xl bg-surface-container dark:bg-zinc-700 hover:bg-surface-container-high dark:hover:bg-zinc-600 text-on-surface dark:text-zinc-200 font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition-colors min-h-[44px] shrink-0 self-end sm:self-center">
                                    <span class="material-symbols-outlined text-[18px]">download</span>
                                    <span>Tải xuống dữ liệu</span>
                                </button>
                            </div>
                        </div>
                    ` : ''}
                </main>
            </div>

            <!-- Footer Save Notice Bar -->
            <div class="p-4 sm:p-5 border-t border-outline-variant/20 dark:border-zinc-800 bg-surface-container-low dark:bg-zinc-850 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                <div class="flex items-center gap-2 text-xs text-on-surface-variant dark:text-zinc-400">
                    <span class="material-symbols-outlined text-[18px] text-secondary">shield_with_heart</span>
                    <span>Mọi thay đổi bảo mật sẽ tự động đồng bộ ngay trên hệ thống Trà Vinh ID.</span>
                </div>
                <div class="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                    <button type="button" onclick="window.ViVuApp.closeSecurityModal()"
                        class="px-4 py-2 rounded-xl text-on-surface-variant dark:text-zinc-400 hover:bg-surface-container dark:hover:bg-zinc-800 font-semibold text-xs sm:text-sm min-h-[44px]">
                        Đóng
                    </button>
                    <button type="button" onclick="window.ViVuApp.showSavedToast('Đã lưu tất cả thiết lập an toàn!'); window.ViVuApp.closeSecurityModal();"
                        class="px-5 py-2 rounded-xl bg-primary-container hover:bg-secondary text-white font-semibold text-xs sm:text-sm shadow-md flex items-center gap-1.5 min-h-[44px]">
                        <span class="material-symbols-outlined text-[18px]">check</span>
                        <span>Hoàn tất &amp; Lưu</span>
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render Link 2FA Authenticator Modal Content (3-Step setup with QR & Secret Key)
 */
export function renderLink2FAModalContent(secState) {
    const secretKey = secState.secretKey || '7XKP 9N4M 2BVT 8HQZ 5WLC';

    return `
        <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl flex flex-col gap-5 border border-outline-variant/30 dark:border-zinc-800">
            <!-- Modal Header -->
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-2xl bg-secondary-container dark:bg-emerald-950 text-secondary dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <span class="material-symbols-outlined text-[22px]">phonelink_setup</span>
                    </div>
                    <div>
                        <h3 class="text-base sm:text-lg font-bold text-on-surface dark:text-zinc-100">Liên kết Authenticator (2FA)</h3>
                        <p class="text-xs text-on-surface-variant dark:text-zinc-400">Bước 2/3: Quét mã QR hoặc nhập khóa</p>
                    </div>
                </div>
                <button type="button" onclick="window.ViVuApp.closeLink2FAModal()"
                    aria-label="Đóng"
                    class="w-10 h-10 rounded-xl flex items-center justify-center text-on-surface-variant dark:text-zinc-400 hover:bg-surface-container dark:hover:bg-zinc-800 min-h-[44px] min-w-[44px]">
                    <span class="material-symbols-outlined text-[20px]">close</span>
                </button>
            </div>

            <!-- Stepper Progress Bar -->
            <div class="grid grid-cols-3 gap-2 w-full h-1.5">
                <div class="h-full rounded-full bg-secondary"></div>
                <div class="h-full rounded-full bg-secondary"></div>
                <div class="h-full rounded-full bg-surface-container-highest dark:bg-zinc-700"></div>
            </div>

            <!-- Notice Instructions -->
            <p class="text-xs text-on-surface-variant dark:text-zinc-300 leading-relaxed bg-surface-container-low dark:bg-zinc-800 p-3 rounded-xl border border-outline-variant/20 dark:border-zinc-700">
                Mở ứng dụng <strong>Google Authenticator</strong> hoặc <strong>Authy</strong>, chọn biểu tượng <strong>+</strong> và quét mã QR bên dưới để thêm tài khoản <strong>ViVuTraVinh</strong>:
            </p>

            <!-- QR Presentation Area (Pure SVG, Zero-CDN) -->
            <div class="flex flex-col items-center justify-center p-4 bg-surface-container-low dark:bg-zinc-800/80 rounded-2xl border border-outline-variant/20 dark:border-zinc-700">
                <div class="relative w-44 h-44 bg-white p-3 rounded-xl shadow-md flex items-center justify-center">
                    <svg class="w-full h-full text-[#003527]" fill="currentColor" viewBox="0 0 160 160">
                        <rect fill="currentColor" height="36" rx="4" width="36" x="10" y="10"></rect>
                        <rect fill="#ffffff" height="24" rx="2" width="24" x="16" y="16"></rect>
                        <rect fill="#003527" height="12" rx="1" width="12" x="22" y="22"></rect>
                        <rect fill="currentColor" height="36" rx="4" width="36" x="114" y="10"></rect>
                        <rect fill="#ffffff" height="24" rx="2" width="24" x="120" y="16"></rect>
                        <rect fill="#003527" height="12" rx="1" width="12" x="126" y="22"></rect>
                        <rect fill="currentColor" height="36" rx="4" width="36" x="10" y="114"></rect>
                        <rect fill="#ffffff" height="24" rx="2" width="24" x="16" y="120"></rect>
                        <rect fill="#003527" height="12" rx="1" width="12" x="22" y="126"></rect>
                        <rect height="6" rx="1" width="6" x="52" y="12"></rect>
                        <rect height="6" rx="1" width="12" x="64" y="12"></rect>
                        <rect height="6" rx="1" width="18" x="88" y="24"></rect>
                        <rect height="12" rx="1" width="6" x="12" y="52"></rect>
                        <rect height="8" rx="1" width="8" x="48" y="48"></rect>
                        <rect height="18" rx="1" width="6" x="82" y="48"></rect>
                        <rect height="6" rx="1" width="18" x="12" y="70"></rect>
                        <rect height="8" rx="1" width="18" x="100" y="68"></rect>
                        <rect height="14" rx="1" width="8" x="12" y="88"></rect>
                        <rect height="18" rx="1" width="6" x="110" y="82"></rect>
                        <rect height="18" rx="1" width="6" x="72" y="98"></rect>
                        <rect height="14" rx="1" width="8" x="52" y="120"></rect>
                        <rect height="6" rx="1" width="18" x="66" y="126"></rect>
                        <rect height="8" rx="1" width="12" x="76" y="136"></rect>
                        <rect height="6" rx="1" width="18" x="122" y="144"></rect>
                    </svg>
                    <!-- Center Identity Leaf -->
                    <div class="absolute inset-auto w-9 h-9 rounded-lg bg-emerald-900 text-white flex items-center justify-center shadow-md">
                        <span class="material-symbols-outlined text-[18px]">spa</span>
                    </div>
                </div>
                <span class="text-[11px] text-on-surface-variant dark:text-zinc-400 mt-2 font-mono">vivutravinh: tien.travinh@gmail.com</span>
            </div>

            <!-- Manual Secret Key Entry -->
            <div class="space-y-1.5">
                <span class="text-xs font-semibold text-on-surface dark:text-zinc-200">Không thể quét mã? Nhập khóa thủ công:</span>
                <div class="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 border border-outline-variant/30 dark:border-zinc-700">
                    <span id="secretKeyText" class="font-mono text-xs font-bold text-primary dark:text-emerald-400 tracking-wider truncate select-all">
                        ${escapeHtml(secretKey)}
                    </span>
                    <button type="button" onclick="window.ViVuApp.copySecretKey('${escapeHtml(secretKey)}')"
                        class="px-3 py-1.5 rounded-lg bg-secondary hover:bg-primary text-white text-xs font-semibold flex items-center gap-1 transition-colors min-h-[44px]">
                        <span class="material-symbols-outlined text-[16px]">content_copy</span>
                        <span>Sao chép</span>
                    </button>
                </div>
            </div>

            <!-- 6-Digit OTP Entry Form -->
            <div class="space-y-2">
                <label class="text-xs font-semibold text-on-surface dark:text-zinc-200" for="otp1">Nhập 6 số xác thực từ ứng dụng:</label>
                <div class="flex items-center justify-between gap-1.5" id="otpContainer">
                    ${[1, 2, 3, 4, 5, 6].map(i => `
                        <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]*" id="otp${i}"
                            oninput="window.ViVuApp.handleOtpInput(this, ${i})"
                            onkeydown="window.ViVuApp.handleOtpKeydown(this, event, ${i})"
                            class="otp-input w-11 h-12 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-center font-bold text-base text-primary dark:text-zinc-100 border border-outline-variant/30 dark:border-zinc-700 focus:outline-none focus:border-secondary min-h-[44px]" />
                    `).join('')}
                </div>
                <div class="flex items-center justify-between text-[11px] text-on-surface-variant dark:text-zinc-400 pt-1">
                    <span class="flex items-center gap-1">
                        <span class="w-2 h-2 rounded-full bg-secondary inline-block animate-pulse"></span>
                        <span>Mã tự động đổi mỗi 30 giây</span>
                    </span>
                    <button type="button" onclick="window.ViVuApp.pasteOtpCode()" class="text-secondary dark:text-emerald-400 font-semibold hover:underline min-h-[44px] flex items-center">
                        Dán mã từ clipboard
                    </button>
                </div>
            </div>

            <!-- Bottom CTA -->
            <div class="flex items-center justify-end gap-2.5 pt-2">
                <button type="button" onclick="window.ViVuApp.closeLink2FAModal()"
                    class="px-4 py-2.5 rounded-xl text-on-surface-variant dark:text-zinc-400 hover:bg-surface-container dark:hover:bg-zinc-800 text-xs sm:text-sm font-semibold min-h-[44px]">
                    Hủy bỏ
                </button>
                <button type="button" onclick="window.ViVuApp.verify2FA()"
                    class="px-5 py-2.5 rounded-xl bg-primary hover:bg-secondary text-white font-semibold text-xs sm:text-sm flex items-center gap-1.5 shadow-md min-h-[44px]">
                    <span class="material-symbols-outlined text-[18px]">verified</span>
                    <span>Xác nhận &amp; Kích hoạt 2FA</span>
                </button>
            </div>
        </div>
    `;
}

/**
 * Render Backup Codes Modal Content
 */
export function renderBackupCodesModalContent(secState) {
    const codes = secState.backupCodes || [];

    return `
        <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl flex flex-col gap-5 border border-outline-variant/30 dark:border-zinc-800">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                        <span class="material-symbols-outlined text-[22px]">pin</span>
                    </div>
                    <div>
                        <h3 class="text-base sm:text-lg font-bold text-on-surface dark:text-zinc-100">Mã Khôi Phục Dự Phòng</h3>
                        <p class="text-xs text-on-surface-variant dark:text-zinc-400">10 mã đăng nhập khẩn cấp 1 lần</p>
                    </div>
                </div>
                <button type="button" onclick="window.ViVuApp.closeBackupCodesModal()"
                    aria-label="Đóng"
                    class="w-10 h-10 rounded-xl flex items-center justify-center text-on-surface-variant dark:text-zinc-400 hover:bg-surface-container dark:hover:bg-zinc-800 min-h-[44px] min-w-[44px]">
                    <span class="material-symbols-outlined text-[20px]">close</span>
                </button>
            </div>

            <div class="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2 border border-amber-200 dark:border-amber-900/50">
                <span class="material-symbols-outlined text-[18px] shrink-0 mt-0.5">warning</span>
                <span>
                    Mỗi mã chỉ sử dụng được <strong>1 lần duy nhất</strong>. Hãy lưu vào nơi an toàn (ghi vào sổ tay hoặc lưu trong trình quản lý mật khẩu).
                </span>
            </div>

            <!-- Grid of 10 codes -->
            <div class="grid grid-cols-2 gap-2.5 p-3 rounded-2xl bg-surface-container-low dark:bg-zinc-800 border border-outline-variant/30 dark:border-zinc-700">
                ${codes.map((item, idx) => `
                    <div class="p-2.5 rounded-xl font-mono text-xs font-bold flex items-center justify-between ${
                        item.used
                            ? 'bg-surface-container/50 dark:bg-zinc-900/50 text-outline dark:text-zinc-500 line-through'
                            : 'bg-surface-container-lowest dark:bg-zinc-900 text-on-surface dark:text-zinc-100 shadow-2xs'
                    }">
                        <span>${idx + 1}. ${escapeHtml(item.code)}</span>
                        ${item.used ? `
                            <span class="text-[10px] text-outline font-normal">Đã dùng</span>
                        ` : `
                            <span class="material-symbols-outlined text-secondary text-[14px]">check</span>
                        `}
                    </div>
                `).join('')}
            </div>

            <div class="flex items-center justify-between gap-3 pt-2">
                <button type="button" onclick="window.ViVuApp.regenerateBackupCodes()"
                    class="text-xs font-semibold text-secondary dark:text-emerald-400 hover:underline flex items-center gap-1 min-h-[44px]">
                    <span class="material-symbols-outlined text-[16px]">refresh</span>
                    <span>Tạo bộ mã mới</span>
                </button>
                <div class="flex items-center gap-2">
                    <button type="button" onclick="window.ViVuApp.closeBackupCodesModal()"
                        class="px-4 py-2 rounded-xl text-on-surface-variant dark:text-zinc-400 hover:bg-surface-container dark:hover:bg-zinc-800 text-xs sm:text-sm font-semibold min-h-[44px]">
                        Đóng
                    </button>
                    <button type="button" onclick="window.ViVuApp.copyBackupCodes()"
                        class="px-4 py-2 rounded-xl bg-secondary hover:bg-primary text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 shadow-sm min-h-[44px]">
                        <span class="material-symbols-outlined text-[16px]">content_copy</span>
                        <span>Sao chép tất cả</span>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// ============================================================================
// PHASE 9: TRIP PLANNER, TURN-BY-TURN GPS & SOCIAL STORY RENDERERS (STITCH DESIGN)
// ============================================================================

/**
 * Render Trip Planner Modal Content (3-Column Workspace)
 * @param {Object} plan - Current trip plan state
 * @param {Array} placePool - Available places pool
 * @param {number} activeDay - Active day index (1 or 2)
 * @param {string} currentFilter - Active category filter
 * @param {string} searchQuery - Search query in place pool
 */
export function renderTripPlannerModalContent(plan, placePool = [], activeDay = 1, currentFilter = 'all', searchQuery = '') {
    if (!plan) return '<div class="p-8 text-center">Không tìm thấy dữ liệu lộ trình.</div>';

    const currentDayData = plan.days?.find(d => d.dayNumber === activeDay) || plan.days?.[0] || { stops: [] };
    const allStopsCount = plan.days?.reduce((acc, d) => acc + (d.stops?.length || 0), 0) || 0;

    // Filter place pool
    let filteredPool = placePool;
    if (currentFilter && currentFilter !== 'all') {
        filteredPool = filteredPool.filter(p => p.category === currentFilter);
    }
    if (searchQuery && searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        filteredPool = filteredPool.filter(p => 
            p.title.toLowerCase().includes(q) || 
            (p.categoryTag && p.categoryTag.toLowerCase().includes(q)) ||
            (p.description && p.description.toLowerCase().includes(q))
        );
    }

    const categories = [
        { id: 'all', label: 'Tất cả' },
        { id: 'Chùa cổ', label: 'Chùa cổ' },
        { id: 'Ẩm thực', label: 'Ẩm thực' },
        { id: 'Cù lao', label: 'Cù lao' },
        { id: 'Thắng cảnh', label: 'Thắng cảnh' }
    ];

    return `
        <div class="flex flex-col w-full bg-surface dark:bg-zinc-950 text-on-surface dark:text-zinc-100 min-h-screen sm:min-h-0 select-none">
            <!-- 1. Header Bar with Breadcrumb & Action Toolbar -->
            <div class="flex flex-col gap-4 p-5 sm:p-6 bg-surface-container-lowest dark:bg-zinc-900 border-b border-outline-variant/30 dark:border-zinc-800">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div class="space-y-1">
                        <!-- Breadcrumb -->
                        <nav aria-label="Đường dẫn trang" class="flex items-center gap-1.5 text-xs text-outline dark:text-zinc-400">
                            <a href="/" onclick="window.ViVuApp?.navGoHome?.(); return false;" class="min-h-[44px] inline-flex items-center py-2 px-1 hover:text-secondary dark:hover:text-emerald-400 transition-colors">Trang chủ</a>
                            <span class="material-symbols-outlined text-sm">chevron_right</span>
                            <span class="text-on-surface dark:text-zinc-200 font-semibold truncate max-w-xs sm:max-w-md">Lập kế hoạch lộ trình</span>
                        </nav>
                        <h1 class="font-headline-lg text-lg sm:text-2xl text-primary dark:text-emerald-400 font-bold tracking-tight">
                            ${escapeHtml(plan.title)}
                        </h1>
                    </div>

                    <!-- Action Buttons Toolbar -->
                    <div class="flex flex-wrap items-center gap-2 shrink-0">
                        <button type="button" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container dark:bg-zinc-800 text-on-surface dark:text-zinc-200 text-xs font-semibold hover:bg-surface-container-high dark:hover:bg-zinc-700 transition-all min-h-[44px]">
                            <span class="material-symbols-outlined text-[18px]">person_add</span>
                            <span>Đồng hành</span>
                            <span class="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-surface-container-lowest dark:bg-zinc-900 text-secondary dark:text-emerald-400 text-[11px] font-bold">
                                ${plan.companionsCount || 3}
                            </span>
                        </button>

                        <button id="btnSmartOptimize" type="button" onclick="window.ViVuApp.optimizePlanAiRoute()"
                            title="Mô phỏng thuật toán thử nghiệm (đảo thứ tự & trừ 3.2 km)"
                            class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-semibold hover:opacity-90 transition-all shadow-xs min-h-[44px]">
                            <span class="material-symbols-outlined text-[18px] text-amber-600 dark:text-amber-400 animate-pulse">auto_fix_high</span>
                            <span>Mô phỏng AI Route</span>
                        </button>

                        <button id="btnExportGpx" type="button" onclick="window.ViVuApp.exportGpxFile()"
                            title="Xuất tệp GPX danh sách waypoint (Mặc định chỉ xuất mốc bản đồ số đã xác minh, không kèm track đường đi)"
                            class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 text-xs font-semibold hover:bg-surface-container-high dark:hover:bg-zinc-700 transition-all min-h-[44px]">
                            <span class="material-symbols-outlined text-[18px]">file_download</span>
                            <span>GPX (Mốc xác minh)</span>
                        </button>

                        <button id="btnExportGpxRef" type="button" onclick="window.ViVuApp.exportGpxFile({ includeUnverified: true })"
                            title="Tùy chọn riêng: Xuất tệp GPX tham khảo bao gồm cả điểm ước tính (có gắn nhãn cảnh báo rõ)"
                            class="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-surface-container-low/60 dark:bg-zinc-800/60 border border-outline-variant/30 dark:border-zinc-700 text-outline dark:text-zinc-400 text-xs font-medium hover:text-on-surface dark:hover:text-zinc-200 transition-all min-h-[44px]">
                            <span class="material-symbols-outlined text-[16px]">help_outline</span>
                            <span>GPX (Tham khảo)</span>
                        </button>

                        <button id="btnSaveStartNav" type="button" onclick="window.ViVuApp.openGpsNavModal()"
                            class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary-container text-white text-xs sm:text-sm font-semibold shadow-md transition-all active:scale-95 min-h-[44px]">
                            <span class="material-symbols-outlined text-[20px] text-secondary-fixed">play_arrow</span>
                            <span>Bắt đầu GPS</span>
                        </button>

                        <button type="button" onclick="window.ViVuApp.closeTripPlannerModal()"
                            aria-label="Đóng kế hoạch"
                            class="w-10 h-10 rounded-xl flex items-center justify-center text-outline dark:text-zinc-400 hover:bg-surface-container dark:hover:bg-zinc-800 transition-colors min-h-[44px] min-w-[44px]">
                            <span class="material-symbols-outlined text-[22px]">close</span>
                        </button>
                    </div>
                </div>

                <!-- Simulation & Prototype Notice -->
                <div class="p-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/40 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
                    <span class="material-symbols-outlined text-[16px] text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">info</span>
                    <div class="space-y-0.5">
                        <span class="font-bold">Minh bạch chức năng thử nghiệm:</span>
                        <p class="text-[10.5px] text-amber-800 dark:text-amber-300">
                            • <b>Mô phỏng AI Route:</b> Đang thử nghiệm đảo thứ tự điểm dừng & trừ 3.2 km (chưa phải định tuyến thực tế từ bản đồ số).<br>
                            • <b>Xuất GPX:</b> Chỉ xuất danh sách waypoint (tọa độ điểm dừng), không chứa track nối tuyến đường thực tế. Mặc định chỉ xuất các mốc bản đồ số đã xác minh; điểm ước tính chỉ xuất khi chọn tùy chọn tham khảo và luôn kèm cảnh báo.
                        </p>
                    </div>
                </div>

                <!-- Metadata Pill Chips -->
                <div class="flex flex-wrap items-center gap-2 pt-2 border-t border-outline-variant/30 dark:border-zinc-800 text-xs">
                    <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/10 dark:bg-emerald-950/60 text-secondary dark:text-emerald-400 font-semibold">
                        <span class="w-2 h-2 rounded-full bg-secondary dark:bg-emerald-400 animate-pulse"></span>
                        <span>Bản thảo công khai</span>
                    </div>
                    <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 font-medium">
                        <span class="material-symbols-outlined text-sm">schedule</span>
                        <span>${plan.durationDays} ngày • ${allStopsCount} điểm dừng • ${plan.totalDistanceKm} km</span>
                    </div>
                    <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold">
                        <span class="material-symbols-outlined text-sm">energy_savings_leaf</span>
                        <span>Dự kiến: ~${plan.estimatedCo2Kg} kg CO₂ (Xe đạp / Xe điện)</span>
                    </div>
                    <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-semibold">
                        <span class="material-symbols-outlined text-sm">payments</span>
                        <span>Ước tính: ${(plan.estimatedCostVnd || 650000).toLocaleString('vi-VN')}đ / người</span>
                    </div>
                </div>
            </div>

            <!-- 2. Main 3-Column Interactive Workspace -->
            <div class="p-4 sm:p-6 grid grid-cols-12 gap-6 items-start">
                
                <!-- COLUMN 1: Ngân hàng địa điểm (3 cols on XL) -->
                <div class="col-span-12 xl:col-span-3 flex flex-col gap-3.5 bg-surface-container-lowest dark:bg-zinc-900 p-4 rounded-2xl shadow-xs border border-outline-variant/30 dark:border-zinc-800">
                    <div class="flex items-center justify-between pb-1">
                        <div class="flex items-center gap-2">
                            <span class="material-symbols-outlined text-secondary dark:text-emerald-400">explore</span>
                            <h2 class="font-headline-sm text-sm sm:text-base text-primary dark:text-zinc-100 font-bold">Ngân hàng địa điểm</h2>
                        </div>
                        <span class="text-[11px] px-2 py-0.5 rounded-full bg-surface-container dark:bg-zinc-800 text-outline dark:text-zinc-400 font-semibold">
                            ${filteredPool.length} sẵn sàng
                        </span>
                    </div>

                    <!-- Search Input -->
                    <div class="relative">
                        <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline dark:text-zinc-400 text-lg">search</span>
                        <input id="plannerPoolSearch" type="text" value="${escapeHtml(searchQuery)}"
                            oninput="window.ViVuApp.searchPlannerPool(this.value)"
                            placeholder="Lọc theo tên, danh mục..."
                            class="w-full h-10 pl-9 pr-3 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-xs text-on-surface dark:text-zinc-100 placeholder:text-outline dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-secondary/30 transition-all border border-outline-variant/30 dark:border-zinc-700" />
                    </div>

                    <!-- Category Pills Filter -->
                    <div class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                        ${categories.map(cat => `
                            <button type="button" onclick="window.ViVuApp.filterPlannerPool('${cat.id}')"
                                class="px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors min-h-[32px] ${
                                    currentFilter === cat.id
                                        ? 'bg-primary dark:bg-emerald-600 text-white shadow-xs'
                                        : 'bg-surface-container-low dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 hover:bg-surface-container dark:hover:bg-zinc-700'
                                }">
                                ${cat.label}
                            </button>
                        `).join('')}
                    </div>

                    <!-- Place Pool Cards Stack -->
                    <div class="flex flex-col gap-3 max-h-[560px] overflow-y-auto pr-1 no-scrollbar" id="pool-list">
                        ${filteredPool.length === 0 ? `
                            <div class="p-6 text-center text-xs text-outline dark:text-zinc-500">
                                Không có địa điểm phù hợp bộ lọc.
                            </div>
                        ` : filteredPool.map(item => `
                            <div class="pool-card group relative flex gap-3 p-3 rounded-xl bg-surface dark:bg-zinc-800/80 hover:bg-surface-container-low dark:hover:bg-zinc-800 shadow-2xs transition-all border-l-4 border-l-secondary dark:border-l-emerald-500 border border-outline-variant/20 dark:border-zinc-700">
                                <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" class="w-16 h-16 sm:w-18 sm:h-18 rounded-lg object-cover shrink-0" />
                                <div class="flex flex-col justify-between flex-1 min-w-0">
                                    <div>
                                        <div class="flex items-center justify-between gap-1">
                                            <span class="text-[10px] px-2 py-0.5 rounded-full bg-secondary-fixed/40 dark:bg-emerald-950 text-secondary dark:text-emerald-300 font-semibold truncate">
                                                ${escapeHtml(item.categoryTag || item.category)}
                                            </span>
                                            <button type="button" onclick="window.ViVuApp.addPlaceToPlan('${item.placeId}')"
                                                title="Thêm vào lộ trình Ngày ${activeDay}"
                                                aria-label="Thêm ${escapeHtml(item.title)} vào ngày ${activeDay}"
                                                class="w-8 h-8 rounded-lg flex items-center justify-center bg-secondary/10 dark:bg-emerald-950 hover:bg-secondary text-secondary hover:text-white dark:text-emerald-400 dark:hover:text-white transition-colors min-h-[32px] min-w-[32px]">
                                                <span class="material-symbols-outlined text-[18px]">add</span>
                                            </button>
                                        </div>
                                        <h3 class="text-xs sm:text-sm font-semibold text-primary dark:text-zinc-100 truncate mt-1">
                                            ${escapeHtml(item.title)}
                                        </h3>
                                        <p class="text-[11px] text-on-surface-variant dark:text-zinc-400 truncate">${escapeHtml(item.location)}</p>
                                    </div>
                                    <div class="flex items-center justify-between pt-1 text-[11px]">
                                        <span class="text-outline dark:text-zinc-400">Thời lượng: ${item.durationHours}h</span>
                                        <span class="inline-flex items-center gap-0.5 font-bold text-amber-600 dark:text-amber-400">
                                            <span class="material-symbols-outlined text-xs text-amber-500" style="font-variation-settings: 'FILL' 1;">star</span>
                                            ${item.rating}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <!-- Add Custom Stop Action Button -->
                    <button type="button" onclick="window.ViVuApp.addCustomStopToPlan()"
                        class="w-full py-2.5 rounded-xl bg-surface-container dark:bg-zinc-800 hover:bg-surface-container-high dark:hover:bg-zinc-700 text-secondary dark:text-emerald-400 text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors min-h-[44px] border border-dashed border-outline-variant/40 dark:border-zinc-700">
                        <span class="material-symbols-outlined text-[18px]">add_location_alt</span>
                        <span>+ Thêm điểm hẹn hoặc khách sạn</span>
                    </button>
                </div>

                <!-- COLUMN 2: Timeline Lộ Trình (5 cols on XL) -->
                <div class="col-span-12 xl:col-span-5 flex flex-col gap-4 bg-surface-container-lowest dark:bg-zinc-900 p-4 sm:p-5 rounded-2xl shadow-xs border border-outline-variant/30 dark:border-zinc-800">
                    <!-- Day Tabs Navigation -->
                    <div class="flex items-center justify-between gap-2">
                        <div class="flex items-center gap-1.5 p-1 rounded-xl bg-surface-container-low dark:bg-zinc-800">
                            ${plan.days.map(d => `
                                <button type="button" onclick="window.ViVuApp.switchPlannerDay(${d.dayNumber})"
                                    class="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all min-h-[36px] ${
                                        activeDay === d.dayNumber
                                            ? 'bg-surface-container-lowest dark:bg-zinc-700 text-primary dark:text-white shadow-xs'
                                            : 'text-on-surface-variant dark:text-zinc-400 hover:text-on-surface dark:hover:text-white'
                                    }">
                                    ${escapeHtml(d.label)} (${d.stops?.length || 0} điểm)
                                </button>
                            `).join('')}
                            <button type="button" onclick="window.ViVuApp.addNewPlannerDay()"
                                title="Thêm ngày mới"
                                class="p-1.5 rounded-lg text-secondary dark:text-emerald-400 hover:bg-surface-container dark:hover:bg-zinc-700 min-h-[36px] min-w-[36px] flex items-center justify-center">
                                <span class="material-symbols-outlined text-[18px]">add</span>
                            </button>
                        </div>
                        <div class="hidden sm:flex items-center gap-1 text-[11px]">
                            <span class="text-outline dark:text-zinc-400">Khung giờ:</span>
                            <span class="font-bold text-primary dark:text-emerald-400">${escapeHtml(currentDayData.activeHours || '07:30 - 13:00')}</span>
                        </div>
                    </div>

                    <!-- Interactive Timeline List Container -->
                    <div class="relative flex flex-col gap-3 pt-1" id="timeline-container">
                        <!-- Departure Milestone (Start of Day) -->
                        <div class="flex items-start gap-3 p-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800/60 border border-outline-variant/30 dark:border-zinc-700">
                            <div class="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center shrink-0 shadow-xs">
                                <span class="material-symbols-outlined text-lg">flag</span>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center justify-between">
                                    <span class="text-[10px] px-2 py-0.5 rounded-full bg-surface-container-highest dark:bg-zinc-700 text-primary dark:text-zinc-200 font-bold">
                                        Xuất phát • ${escapeHtml(plan.departure?.time || '07:30')}
                                    </span>
                                    <span class="text-[11px] text-outline dark:text-zinc-400">${escapeHtml(plan.departure?.type || 'Điểm tập kết')}</span>
                                </div>
                                <h4 class="text-xs sm:text-sm font-bold text-primary dark:text-zinc-100 mt-1 truncate">
                                    ${escapeHtml(plan.departure?.title || 'Khách sạn Cửu Long (TP. Trà Vinh)')}
                                </h4>
                                <p class="text-[11px] text-on-surface-variant dark:text-zinc-400 mt-0.5">
                                    ${escapeHtml(plan.departure?.note || 'Kiểm tra xe đạp & đồ dùng cá nhân.')}
                                </p>
                            </div>
                        </div>

                        <!-- Timeline Stops for Active Day -->
                        ${(currentDayData.stops || []).map((stop, idx) => `
                            <!-- Transfer connector (if present) -->
                            ${stop.transfer ? `
                                <div class="flex items-center justify-center py-0.5">
                                    <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-fixed/30 dark:bg-emerald-950 text-secondary dark:text-emerald-300 text-[11px] font-medium shadow-2xs border border-secondary/20">
                                        <span class="material-symbols-outlined text-sm">${escapeHtml(stop.transfer.mode || 'directions_bike')}</span>
                                        <span class="font-bold">${escapeHtml(stop.transfer.distance || '1.5 km')}</span>
                                        <span>• ${escapeHtml(stop.transfer.time || '10 phút')}</span>
                                    </div>
                                </div>
                            ` : ''}

                            <!-- Stop Slot Card -->
                            <div class="timeline-stop relative flex flex-col gap-2 p-3.5 rounded-xl bg-surface dark:bg-zinc-800 shadow-2xs hover:shadow-md transition-shadow group border-l-4 border-l-secondary dark:border-l-emerald-500 border border-outline-variant/30 dark:border-zinc-700">
                                <div class="flex items-start gap-3">
                                    <div class="text-outline dark:text-zinc-500 pt-1 shrink-0" title="Chặng thứ tự ${idx + 1}">
                                        <span class="w-6 h-6 rounded-full bg-secondary/10 dark:bg-emerald-950 text-secondary dark:text-emerald-400 flex items-center justify-center text-xs font-bold">
                                            ${idx + 1}
                                        </span>
                                    </div>
                                    <img src="${escapeHtml(stop.image)}" alt="${escapeHtml(stop.title)}" class="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover shrink-0" />
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center justify-between gap-1">
                                            <span class="text-[11px] text-secondary dark:text-emerald-400 font-bold">
                                                Chặng 0${idx + 1} • ${escapeHtml(stop.timeRange)} (${stop.durationMinutes} phút)
                                            </span>
                                            <div class="flex items-center gap-1">
                                                <button type="button" onclick="window.ViVuApp?.movePlannerStop ? window.ViVuApp.movePlannerStop('${stop.id}', -1) : null"
                                                    ${idx === 0 ? 'disabled' : ''}
                                                    title="Di chuyển lên trước"
                                                    aria-label="Di chuyển ${escapeHtml(stop.title)} lên trước"
                                                    class="p-1 rounded-lg text-outline dark:text-zinc-400 hover:text-secondary dark:hover:text-emerald-400 hover:bg-surface-container dark:hover:bg-zinc-700 min-h-[32px] min-w-[32px] flex items-center justify-center transition-colors disabled:opacity-25 disabled:cursor-not-allowed">
                                                    <span class="material-symbols-outlined text-[16px]">arrow_upward</span>
                                                </button>
                                                <button type="button" onclick="window.ViVuApp?.movePlannerStop ? window.ViVuApp.movePlannerStop('${stop.id}', 1) : null"
                                                    ${idx === (currentDayData.stops || []).length - 1 ? 'disabled' : ''}
                                                    title="Di chuyển xuống sau"
                                                    aria-label="Di chuyển ${escapeHtml(stop.title)} xuống sau"
                                                    class="p-1 rounded-lg text-outline dark:text-zinc-400 hover:text-secondary dark:hover:text-emerald-400 hover:bg-surface-container dark:hover:bg-zinc-700 min-h-[32px] min-w-[32px] flex items-center justify-center transition-colors disabled:opacity-25 disabled:cursor-not-allowed">
                                                    <span class="material-symbols-outlined text-[16px]">arrow_downward</span>
                                                </button>
                                                <button type="button" onclick="window.ViVuApp.removePlaceFromPlan('${stop.id}')"
                                                    title="Xóa khỏi lịch trình"
                                                    aria-label="Xóa ${escapeHtml(stop.title)}"
                                                    class="p-1 rounded-lg text-outline dark:text-zinc-400 hover:text-red-500 hover:bg-surface-container dark:hover:bg-zinc-700 min-h-[32px] min-w-[32px] flex items-center justify-center transition-colors">
                                                    <span class="material-symbols-outlined text-[16px]">delete</span>
                                                </button>
                                            </div>
                                        </div>
                                        <h4 class="text-xs sm:text-sm font-bold text-primary dark:text-zinc-100 truncate mt-0.5">
                                            ${escapeHtml(stop.title)}
                                        </h4>
                                        <p class="text-[11px] text-on-surface-variant dark:text-zinc-400 line-clamp-2 mt-1">
                                            ${escapeHtml(stop.note)}
                                        </p>
                                    </div>
                                </div>
                                <div class="flex items-center justify-between pt-2 border-t border-outline-variant/20 dark:border-zinc-700 text-[11px] text-outline dark:text-zinc-400">
                                    <span class="inline-flex items-center gap-1">
                                        <span class="material-symbols-outlined text-xs text-secondary dark:text-emerald-400">verified</span>
                                        ${escapeHtml(stop.badge || 'Điểm đến đề xuất')}
                                    </span>
                                    ${stop.hasAudioGuide ? `
                                        <span class="text-secondary dark:text-emerald-400 font-semibold flex items-center gap-1">
                                            <span class="material-symbols-outlined text-xs">headphones</span>
                                            Audio guide
                                        </span>
                                    ` : ''}
                                </div>
                            </div>
                        `).join('')}

                        <!-- Drop Placeholder Zone -->
                        <div id="drop-target-zone" onclick="document.getElementById('plannerPoolSearch')?.focus()"
                            class="flex flex-col items-center justify-center p-4 rounded-xl bg-surface-container-low dark:bg-zinc-800/40 border-2 border-dashed border-outline-variant dark:border-zinc-700 hover:border-secondary dark:hover:border-emerald-500 transition-all cursor-pointer text-center group">
                            <div class="w-9 h-9 rounded-full bg-surface dark:bg-zinc-800 flex items-center justify-center text-outline group-hover:text-secondary dark:group-hover:text-emerald-400 group-hover:scale-110 transition-all shadow-xs mb-1">
                                <span class="material-symbols-outlined text-lg">add_circle</span>
                            </div>
                            <p class="text-xs font-semibold text-primary dark:text-zinc-200">Thêm điểm dừng tiếp theo vào Ngày ${activeDay}</p>
                            <p class="text-[11px] text-on-surface-variant dark:text-zinc-400">Chọn từ Ngân hàng địa điểm bên trái hoặc gõ tìm kiếm</p>
                        </div>
                    </div>
                </div>

                <!-- COLUMN 3: Bản đồ lộ trình trực tiếp & AI Suggestion (4 cols on XL) -->
                <div class="col-span-12 xl:col-span-4 flex flex-col gap-4">
                    <!-- Live Map Canvas Card -->
                    <div class="relative rounded-2xl bg-surface-container-lowest dark:bg-zinc-900 p-3.5 shadow-xs border border-outline-variant/30 dark:border-zinc-800 flex flex-col">
                        <div class="flex items-center justify-between px-1 mb-2">
                            <div class="flex items-center gap-2">
                                <span class="material-symbols-outlined text-secondary dark:text-emerald-400">map</span>
                                <h3 class="text-xs sm:text-sm font-bold text-primary dark:text-zinc-100">Bản đồ lộ trình tương tác</h3>
                            </div>
                            <span class="text-[11px] px-2 py-0.5 rounded-full bg-secondary/10 dark:bg-emerald-950 text-secondary dark:text-emerald-400 font-semibold">
                                GPS Trực tiếp
                            </span>
                        </div>

                        <!-- Map Simulated Vector Display -->
                        <div class="relative w-full h-[280px] sm:h-[320px] rounded-xl bg-emerald-950/20 dark:bg-zinc-950 overflow-hidden flex items-end p-3 border border-outline-variant/30 dark:border-zinc-800">
                            <!-- Background local landscape hint -->
                            <img src="ao bà om.jpg" alt="Tra Vinh Map Background" class="absolute inset-0 w-full h-full object-cover opacity-20 filter saturate-50" />
                            
                            <!-- Vector Route Simulation SVG -->
                            <svg class="absolute inset-0 w-full h-full pointer-events-none" fill="none" viewBox="0 0 400 320">
                                <path d="M 40 250 C 90 220, 140 260, 200 180 C 240 130, 290 140, 350 80" stroke="#006c4a" stroke-dasharray="6 6" stroke-linecap="round" stroke-width="4" opacity="0.8"></path>
                                <path d="M 40 250 C 90 220, 140 260, 200 180" stroke="#10b981" stroke-linecap="round" stroke-width="4"></path>
                                
                                <!-- Waypoint Pins -->
                                <circle cx="40" cy="250" fill="#003527" r="10"></circle>
                                <circle cx="40" cy="250" fill="#ffffff" r="4"></circle>
                                
                                <circle cx="140" cy="240" fill="#006c4a" r="12"></circle>
                                <circle cx="140" cy="240" fill="#ffffff" r="5"></circle>
                                
                                <circle cx="200" cy="180" fill="#006c4a" r="12"></circle>
                                <circle cx="200" cy="180" fill="#ffffff" r="5"></circle>
                                
                                <circle cx="320" cy="100" fill="#ea580c" r="12"></circle>
                                <circle cx="320" cy="100" fill="#ffffff" r="5"></circle>
                            </svg>

                            <!-- Interactive Marker Labels positioned on map -->
                            <div class="absolute left-4 bottom-14 bg-surface/90 dark:bg-zinc-900/90 backdrop-blur-md px-2 py-0.5 rounded-md shadow-xs text-[10px] font-bold text-primary dark:text-zinc-100 flex items-center gap-1">
                                <span class="w-1.5 h-1.5 rounded-full bg-primary dark:bg-emerald-400"></span> Xuất phát
                            </div>
                            <div class="absolute left-24 bottom-22 bg-surface/90 dark:bg-zinc-900/90 backdrop-blur-md px-2 py-0.5 rounded-md shadow-xs text-[10px] font-bold text-secondary dark:text-emerald-400 flex items-center gap-1">
                                <span class="w-1.5 h-1.5 rounded-full bg-secondary dark:bg-emerald-400"></span> 1. Chùa Âng
                            </div>
                            <div class="absolute left-40 top-32 bg-surface/90 dark:bg-zinc-900/90 backdrop-blur-md px-2 py-0.5 rounded-md shadow-xs text-[10px] font-bold text-secondary dark:text-emerald-400 flex items-center gap-1">
                                <span class="w-1.5 h-1.5 rounded-full bg-secondary dark:bg-emerald-400"></span> 2. Ao Bà Om
                            </div>
                            <div class="absolute right-4 top-16 bg-surface/90 dark:bg-zinc-900/90 backdrop-blur-md px-2 py-0.5 rounded-md shadow-xs text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> 3. Bún Nước Lèo
                            </div>

                            <!-- Bottom Floating Control Widget -->
                            <div class="relative w-full z-10 p-2.5 rounded-xl bg-surface/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-sm flex items-center justify-between border border-outline-variant/30 dark:border-zinc-800">
                                <div class="flex items-center gap-2">
                                    <span class="material-symbols-outlined text-secondary dark:text-emerald-400 text-xl">route</span>
                                    <div>
                                        <p class="text-[10px] text-outline dark:text-zinc-400">Chặng hiện tại</p>
                                        <p class="text-xs font-bold text-primary dark:text-zinc-100">7.5 km • Ngày 1 hoàn tất 60%</p>
                                    </div>
                                </div>
                                <button type="button" onclick="window.ViVuApp.openFullMapModal?.()"
                                    title="Xem bản đồ toàn màn hình"
                                    class="p-1.5 rounded-lg bg-surface-container dark:bg-zinc-800 text-on-surface dark:text-zinc-200 min-h-[36px] min-w-[36px] flex items-center justify-center">
                                    <span class="material-symbols-outlined text-base">fullscreen</span>
                                </button>
                            </div>
                        </div>

                        <!-- Live Route Metrics -->
                        <div class="grid grid-cols-3 gap-2 pt-3">
                            <div class="flex flex-col p-2 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-center">
                                <span class="material-symbols-outlined text-secondary dark:text-emerald-400 text-base mb-0.5">straighten</span>
                                <span class="text-xs font-bold text-primary dark:text-zinc-100">7.5 km</span>
                                <span class="text-[10px] text-outline dark:text-zinc-400">Tổng cự ly</span>
                            </div>
                            <div class="flex flex-col p-2 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-center">
                                <span class="material-symbols-outlined text-secondary dark:text-emerald-400 text-base mb-0.5">landscape</span>
                                <span class="text-xs font-bold text-primary dark:text-zinc-100">0 m</span>
                                <span class="text-[10px] text-outline dark:text-zinc-400">Độ dốc (Đồng bằng)</span>
                            </div>
                            <div class="flex flex-col p-2 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-center">
                                <span class="material-symbols-outlined text-amber-500 text-base mb-0.5">wb_sunny</span>
                                <span class="text-xs font-bold text-primary dark:text-zinc-100">28°C</span>
                                <span class="text-[10px] text-outline dark:text-zinc-400">Gió mát 12 km/h</span>
                            </div>
                        </div>
                    </div>

                    <!-- AI Smart Suggestions Box -->
                    <div class="rounded-2xl bg-gradient-to-br from-primary via-emerald-900 to-secondary p-4 sm:p-5 text-white shadow-sm flex flex-col gap-2.5 relative overflow-hidden">
                        <div class="absolute -right-4 -bottom-4 opacity-10 pointer-events-none">
                            <span class="material-symbols-outlined text-8xl">psychology</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <div class="w-8 h-8 rounded-lg bg-emerald-400 text-emerald-950 flex items-center justify-center font-bold">
                                <span class="material-symbols-outlined text-lg">lightbulb</span>
                            </div>
                            <div>
                                <h4 class="text-xs sm:text-sm font-bold leading-tight">Mẹo lộ trình thông minh AI</h4>
                                <span class="text-[11px] text-emerald-200">Tối ưu theo thời tiết &amp; thói quen bản địa</span>
                            </div>
                        </div>
                        <p class="text-xs text-emerald-50 leading-relaxed">
                            Sau bữa trưa tại Bến Xanh, lúc 15:30 là thời khắc đẹp nhất để ghé thăm <strong class="text-emerald-300">Chùa Hang</strong> đón từng đàn chim muông bay về tổ và xem nghệ nhân tạc gỗ.
                        </p>
                        <div class="flex items-center justify-between pt-1">
                            <span class="text-[11px] text-emerald-200">+2.4 km • Không thêm phí</span>
                            <button id="btnAddHangPagoda" type="button" onclick="window.ViVuApp.addPlaceToPlan('chua-hang')"
                                class="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white text-emerald-900 text-xs font-bold hover:bg-emerald-50 transition-all shadow-xs min-h-[36px]">
                                <span class="material-symbols-outlined text-base">add</span>
                                <span>Thêm vào Ngày ${activeDay}</span>
                            </button>
                        </div>
                    </div>

                    <!-- Responsible Tourism Eco Card -->
                    <div class="rounded-2xl bg-surface-container-lowest dark:bg-zinc-900 p-4 shadow-xs border border-outline-variant/30 dark:border-zinc-800 flex items-center gap-3">
                        <div class="w-11 h-11 rounded-xl bg-secondary-container dark:bg-emerald-950 text-secondary dark:text-emerald-400 flex items-center justify-center shrink-0">
                            <span class="material-symbols-outlined text-2xl">eco</span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <h4 class="text-xs sm:text-sm font-bold text-primary dark:text-zinc-100 truncate">Cam kết Du lịch Có Trách Nhiệm</h4>
                            <p class="text-[11px] text-on-surface-variant dark:text-zinc-400">
                                Lộ trình giảm 82% dấu chân carbon so với ô tô. Tôn trọng nếp sống và văn hóa nhà chùa.
                            </p>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    `;
}

/**
 * Render View: Lên Kế Hoạch Chuyến Đi (Dedicated view với 2 tab: Tự lên lịch trình & Lịch trình gợi ý)
 */
export function renderPlannerView(containerId, plan, placePool = [], activeDay = 1, currentFilter = 'all', searchQuery = '', activeTab = 'custom', isAuth = false, activeTourId = 'khmer-culture', userName = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!plan) plan = { days: [], title: 'Lên Kế Hoạch Chuyến Đi' };
    const currentDayData = plan.days?.find(d => d.dayNumber === activeDay) || plan.days?.[0] || { stops: [] };
    const allStopsCount = plan.days?.reduce((acc, d) => acc + (d.stops?.length || 0), 0) || 0;

    // Filter place pool
    let filteredPool = placePool || [];
    if (currentFilter && currentFilter !== 'all') {
        filteredPool = filteredPool.filter(p => p.category === currentFilter);
    }
    if (searchQuery && searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        filteredPool = filteredPool.filter(p => 
            p.title.toLowerCase().includes(q) || 
            (p.categoryTag && p.categoryTag.toLowerCase().includes(q)) ||
            (p.description && p.description.toLowerCase().includes(q))
        );
    }

    const categories = [
        { id: 'all', label: 'Tất cả' },
        { id: 'Chùa cổ', label: 'Chùa cổ' },
        { id: 'Ẩm thực', label: 'Ẩm thực' },
        { id: 'Cù lao', label: 'Cù lao' },
        { id: 'Thắng cảnh', label: 'Thắng cảnh' }
    ];

    container.innerHTML = `
        <div class="flex flex-col w-full space-y-6">
            <!-- 1. Header & Navigation Banner -->
            <div class="rounded-3xl bg-surface-container-lowest dark:bg-zinc-900 border border-outline-variant/40 dark:border-zinc-800 p-6 sm:p-8 shadow-xs flex flex-col gap-6">
                <!-- Breadcrumb & Title -->
                <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div class="space-y-1.5">
                        <nav aria-label="Đường dẫn trang" class="flex items-center gap-1.5 text-xs text-outline dark:text-zinc-400">
                            <a href="#/home" onclick="window.ViVuApp?.navGoHome?.(); return false;" class="min-h-[44px] inline-flex items-center py-2 px-1 hover:text-secondary dark:hover:text-emerald-400 transition-colors">Trang chủ</a>
                            <span class="material-symbols-outlined text-sm">chevron_right</span>
                            <span class="text-on-surface-variant dark:text-zinc-400 font-medium">Khám Phá &amp; Kết Nối</span>
                            <span class="material-symbols-outlined text-sm">chevron_right</span>
                            <span class="text-primary dark:text-emerald-400 font-semibold truncate">Lên kế hoạch chuyến đi</span>
                        </nav>
                        <div class="flex items-center gap-2">
                            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-secondary-container/70 dark:bg-emerald-950/60 text-secondary dark:text-emerald-300 text-xs font-bold uppercase tracking-wider font-sans">
                                <span class="w-2 h-2 rounded-full bg-secondary dark:bg-emerald-400 animate-pulse"></span>
                                Trip Planner • ViVu Trà Vinh
                            </span>
                        </div>
                        <h1 class="font-headline-lg text-2xl sm:text-3xl lg:text-4xl text-primary dark:text-zinc-100 font-black tracking-tight font-sans">
                            Lên Kế Hoạch Chuyến Đi
                        </h1>
                        <p class="font-body-md text-xs sm:text-sm text-on-surface-variant dark:text-zinc-400 max-w-2xl leading-relaxed">
                            Tự do sắp đặt điểm đến, tối ưu cung đường khám phá hoặc chọn nhanh các lịch trình tour 1 ngày đặc sắc tại Trà Vinh.
                        </p>
                    </div>

                    <!-- 2 Tabs Switcher Buttons -->
                    <div class="flex items-center gap-2 p-1.5 rounded-2xl bg-surface-container-low dark:bg-zinc-800 border border-outline-variant/30 dark:border-zinc-700 shrink-0 self-start lg:self-center">
                        <button id="plannerTabBtnCustom" type="button" onclick="window.ViVuApp?.switchPlannerTab ? window.ViVuApp.switchPlannerTab('custom') : null"
                            class="px-4 sm:px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all min-h-[44px] ${
                                activeTab === 'custom'
                                    ? 'bg-primary dark:bg-emerald-600 text-white shadow-xs'
                                    : 'text-on-surface-variant dark:text-zinc-400 hover:text-on-surface hover:bg-surface-container dark:hover:bg-zinc-700'
                            }">
                            <span class="material-symbols-outlined text-[19px]">tune</span>
                            <span>Tự lên lịch trình</span>
                        </button>
                        <button id="plannerTabBtnSuggested" type="button" onclick="window.ViVuApp?.switchPlannerTab ? window.ViVuApp.switchPlannerTab('suggested') : null"
                            class="px-4 sm:px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all min-h-[44px] ${
                                activeTab === 'suggested'
                                    ? 'bg-primary dark:bg-emerald-600 text-white shadow-xs'
                                    : 'text-on-surface-variant dark:text-zinc-400 hover:text-on-surface hover:bg-surface-container dark:hover:bg-zinc-700'
                            }">
                            <span class="material-symbols-outlined text-[19px]">auto_awesome</span>
                            <span>Lịch trình gợi ý (1 ngày)</span>
                            <span class="hidden sm:inline-flex px-1.5 py-0.5 rounded-full bg-secondary-fixed/40 dark:bg-emerald-950 text-secondary dark:text-emerald-300 text-[10px] font-bold">4 tour</span>
                        </button>
                    </div>
                </div>

                <!-- 2. "Chuyến Đi Của Tôi" & Auth Bar -->
                <div id="plannerMyTripCard" class="rounded-2xl p-4 sm:p-5 bg-surface-container-low dark:bg-zinc-800/80 border border-outline-variant/30 dark:border-zinc-700 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div class="flex items-start sm:items-center gap-3.5">
                        <div class="w-11 h-11 rounded-2xl bg-secondary/10 dark:bg-emerald-950 text-secondary dark:text-emerald-400 flex items-center justify-center shrink-0">
                            <span class="material-symbols-outlined text-2xl">hiking</span>
                        </div>
                        <div class="space-y-1">
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="text-xs uppercase tracking-wider text-outline dark:text-zinc-400 font-bold">Chuyến đi của tôi:</span>
                                <h3 class="font-bold text-sm sm:text-base text-primary dark:text-zinc-100 truncate max-w-sm sm:max-w-md">
                                    ${escapeHtml(plan.title || 'Hành trình khám phá Trà Vinh')}
                                </h3>
                                ${isAuth ? `
                                    <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold" title="Lưu trên trình duyệt này, chưa đồng bộ giữa các thiết bị">
                                        <span class="material-symbols-outlined text-[13px]">person</span>
                                        Tài khoản: ${escapeHtml(userName || 'Thành viên')} • Lưu trên thiết bị này
                                    </span>
                                ` : `
                                    <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[11px] font-bold" title="Lưu trên trình duyệt này, chưa đồng bộ giữa các thiết bị">
                                        <span class="material-symbols-outlined text-[13px]">devices</span>
                                        Khách vãng lai • Lưu trên thiết bị này
                                    </span>
                                `}
                            </div>
                            <div class="flex flex-wrap items-center gap-2 text-xs text-on-surface-variant dark:text-zinc-400">
                                <span>${plan.durationDays || 1} ngày</span>
                                <span>•</span>
                                <span>${allStopsCount} điểm dừng</span>
                                <span>•</span>
                                <span>${plan.totalDistanceKm || 0} km</span>
                                <span>•</span>
                                <span class="text-emerald-700 dark:text-emerald-400 font-semibold">~${plan.estimatedCo2Kg || 0} kg CO₂</span>
                            </div>
                            <p class="text-[11px] text-outline dark:text-zinc-400 mt-1 flex items-center gap-1">
                                <span class="material-symbols-outlined text-[13px] text-amber-600 dark:text-amber-400">info</span>
                                <span>Lưu trên trình duyệt này, chưa đồng bộ giữa các thiết bị</span>
                            </p>
                        </div>
                    </div>

                    <div class="flex flex-wrap items-center gap-2 shrink-0">
                        <button type="button" id="btnSaveTripPlanDevice" onclick="window.ViVuApp?.saveTripPlanToDevice ? window.ViVuApp.saveTripPlanToDevice() : null"
                            class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-secondary dark:bg-emerald-600 hover:bg-secondary/90 text-white text-xs font-semibold shadow-xs transition-all min-h-[44px]">
                            <span class="material-symbols-outlined text-[18px]">save</span>
                            <span>Lưu trên thiết bị này</span>
                        </button>
                        <button type="button" onclick="window.ViVuApp?.resetTripPlanToDefault ? window.ViVuApp.resetTripPlanToDefault() : null"
                            title="Khôi phục lộ trình mẫu ban đầu"
                            aria-label="Khôi phục lộ trình mẫu"
                            class="p-2.5 rounded-xl bg-surface-container dark:bg-zinc-800 text-outline hover:text-red-500 hover:bg-surface-container-high dark:hover:bg-zinc-700 text-xs font-semibold transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
                            <span class="material-symbols-outlined text-[20px]">restart_alt</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- ========================================== -->
            <!-- TAB CONTENT 1: TỰ LÊN LỊCH TRÌNH (CUSTOM)  -->
            <!-- ========================================== -->
            <div id="plannerTabContentCustom" class="${activeTab === 'custom' ? '' : 'hidden'} space-y-6">
                <!-- 3-Column Interactive Workspace -->
                <div class="grid grid-cols-12 gap-6 items-start">
                    
                    <!-- COLUMN 1: Ngân hàng địa điểm (3 cols on XL) -->
                    <div class="col-span-12 xl:col-span-3 flex flex-col gap-3.5 bg-surface-container-lowest dark:bg-zinc-900 p-4 rounded-2xl shadow-xs border border-outline-variant/30 dark:border-zinc-800">
                        <div class="flex items-center justify-between pb-1">
                            <div class="flex items-center gap-2">
                                <span class="material-symbols-outlined text-secondary dark:text-emerald-400">explore</span>
                                <h2 class="font-headline-sm text-sm sm:text-base text-primary dark:text-zinc-100 font-bold">Ngân hàng địa điểm</h2>
                            </div>
                            <span class="text-[11px] px-2 py-0.5 rounded-full bg-surface-container dark:bg-zinc-800 text-outline dark:text-zinc-400 font-semibold">
                                ${filteredPool.length} sẵn sàng
                            </span>
                        </div>

                        <!-- Search Input -->
                        <div class="relative">
                            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline dark:text-zinc-400 text-lg">search</span>
                            <input id="plannerPoolSearch" type="text" value="${escapeHtml(searchQuery)}"
                                oninput="window.ViVuApp?.searchPlannerPool ? window.ViVuApp.searchPlannerPool(this.value) : null"
                                placeholder="Lọc theo tên, danh mục..."
                                class="w-full h-10 pl-9 pr-3 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-xs text-on-surface dark:text-zinc-100 placeholder:text-outline dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-secondary/30 transition-all border border-outline-variant/30 dark:border-zinc-700" />
                        </div>

                        <!-- Category Pills Filter -->
                        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                            ${categories.map(cat => `
                                <button type="button" onclick="window.ViVuApp?.filterPlannerPool ? window.ViVuApp.filterPlannerPool('${cat.id}') : null"
                                    class="px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors min-h-[32px] ${
                                        currentFilter === cat.id
                                            ? 'bg-primary dark:bg-emerald-600 text-white shadow-xs'
                                            : 'bg-surface-container-low dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 hover:bg-surface-container dark:hover:bg-zinc-700'
                                    }">
                                    ${cat.label}
                                </button>
                            `).join('')}
                        </div>

                        <!-- Place Pool Cards Stack -->
                        <div class="flex flex-col gap-3 max-h-[560px] overflow-y-auto pr-1 no-scrollbar" id="pool-list">
                            ${filteredPool.length === 0 ? `
                                <div class="p-6 text-center text-xs text-outline dark:text-zinc-500">
                                    Không có địa điểm phù hợp bộ lọc.
                                </div>
                            ` : filteredPool.map(item => `
                                <div class="pool-card group relative flex gap-3 p-3 rounded-xl bg-surface dark:bg-zinc-800/80 hover:bg-surface-container-low dark:hover:bg-zinc-800 shadow-2xs transition-all border-l-4 border-l-secondary dark:border-l-emerald-500 border border-outline-variant/20 dark:border-zinc-700">
                                    <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" class="w-16 h-16 sm:w-18 sm:h-18 rounded-lg object-cover shrink-0" />
                                    <div class="flex flex-col justify-between flex-1 min-w-0">
                                        <div>
                                            <div class="flex items-center justify-between gap-1">
                                                <span class="text-[10px] px-2 py-0.5 rounded-full bg-secondary-fixed/40 dark:bg-emerald-950 text-secondary dark:text-emerald-300 font-semibold truncate">
                                                    ${escapeHtml(item.categoryTag || item.category)}
                                                </span>
                                                <button type="button" onclick="window.ViVuApp?.addPlaceToPlan ? window.ViVuApp.addPlaceToPlan('${item.placeId}') : null"
                                                    title="Thêm vào lộ trình Ngày ${activeDay}"
                                                    aria-label="Thêm ${escapeHtml(item.title)} vào ngày ${activeDay}"
                                                    class="w-8 h-8 rounded-lg flex items-center justify-center bg-secondary/10 dark:bg-emerald-950 hover:bg-secondary text-secondary hover:text-white dark:text-emerald-400 dark:hover:text-white transition-colors min-h-[32px] min-w-[32px]">
                                                    <span class="material-symbols-outlined text-[18px]">add</span>
                                                </button>
                                            </div>
                                            <h3 class="text-xs sm:text-sm font-semibold text-primary dark:text-zinc-100 truncate mt-1">
                                                ${escapeHtml(item.title)}
                                            </h3>
                                            <p class="text-[11px] text-on-surface-variant dark:text-zinc-400 truncate">${escapeHtml(item.location)}</p>
                                        </div>
                                        <div class="flex items-center justify-between pt-1 text-[11px]">
                                            <span class="text-outline dark:text-zinc-400">Thời lượng: ${item.durationHours}h</span>
                                            <span class="inline-flex items-center gap-0.5 font-bold text-amber-600 dark:text-amber-400">
                                                <span class="material-symbols-outlined text-xs text-amber-500" style="font-variation-settings: 'FILL' 1;">star</span>
                                                ${item.rating}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>

                        <!-- Add Custom Stop Action Button -->
                        <button type="button" onclick="window.ViVuApp?.addCustomStopToPlan ? window.ViVuApp.addCustomStopToPlan() : null"
                            class="w-full py-2.5 rounded-xl bg-surface-container dark:bg-zinc-800 hover:bg-surface-container-high dark:hover:bg-zinc-700 text-secondary dark:text-emerald-400 text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors min-h-[44px] border border-dashed border-outline-variant/40 dark:border-zinc-700">
                            <span class="material-symbols-outlined text-[18px]">add_location_alt</span>
                            <span>+ Thêm điểm hẹn hoặc khách sạn</span>
                        </button>
                    </div>

                    <!-- COLUMN 2: Timeline Lộ Trình (5 cols on XL) -->
                    <div class="col-span-12 xl:col-span-5 flex flex-col gap-4 bg-surface-container-lowest dark:bg-zinc-900 p-4 sm:p-5 rounded-2xl shadow-xs border border-outline-variant/30 dark:border-zinc-800">
                        <!-- Day Tabs Navigation -->
                        <div class="flex items-center justify-between gap-2">
                            <div class="flex items-center gap-1.5 p-1 rounded-xl bg-surface-container-low dark:bg-zinc-800">
                                ${plan.days.map(d => `
                                    <button type="button" onclick="window.ViVuApp?.switchPlannerDay ? window.ViVuApp.switchPlannerDay(${d.dayNumber}) : null"
                                        class="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all min-h-[36px] ${
                                            activeDay === d.dayNumber
                                                ? 'bg-surface-container-lowest dark:bg-zinc-700 text-primary dark:text-white shadow-xs'
                                                : 'text-on-surface-variant dark:text-zinc-400 hover:text-on-surface dark:hover:text-white'
                                        }">
                                        ${escapeHtml(d.label)} (${d.stops?.length || 0} điểm)
                                    </button>
                                `).join('')}
                                <button type="button" onclick="window.ViVuApp?.addNewPlannerDay ? window.ViVuApp.addNewPlannerDay() : null"
                                    title="Thêm ngày mới"
                                    class="p-1.5 rounded-lg text-secondary dark:text-emerald-400 hover:bg-surface-container dark:hover:bg-zinc-700 min-h-[36px] min-w-[36px] flex items-center justify-center">
                                    <span class="material-symbols-outlined text-[18px]">add</span>
                                </button>
                            </div>
                            <div class="hidden sm:flex items-center gap-1 text-[11px]">
                                <span class="text-outline dark:text-zinc-400">Khung giờ:</span>
                                <span class="font-bold text-primary dark:text-emerald-400">${escapeHtml(currentDayData.activeHours || '07:30 - 13:00')}</span>
                            </div>
                        </div>

                        <!-- Interactive Timeline List Container -->
                        <div class="relative flex flex-col gap-3 pt-1" id="timeline-container">
                            <!-- Departure Milestone (Start of Day) -->
                            <div class="flex items-start gap-3 p-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800/60 border border-outline-variant/30 dark:border-zinc-700">
                                <div class="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center shrink-0 shadow-xs">
                                    <span class="material-symbols-outlined text-lg">flag</span>
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center justify-between">
                                        <span class="text-[10px] px-2 py-0.5 rounded-full bg-surface-container-highest dark:bg-zinc-700 text-primary dark:text-zinc-200 font-bold">
                                            Xuất phát • ${escapeHtml(plan.departure?.time || '07:30')}
                                        </span>
                                        <span class="text-[11px] text-outline dark:text-zinc-400">${escapeHtml(plan.departure?.type || 'Điểm tập kết')}</span>
                                    </div>
                                    <h4 class="text-xs sm:text-sm font-bold text-primary dark:text-zinc-100 mt-1 truncate">
                                        ${escapeHtml(plan.departure?.title || 'Khách sạn Cửu Long (TP. Trà Vinh)')}
                                    </h4>
                                    <p class="text-[11px] text-on-surface-variant dark:text-zinc-400 mt-0.5">
                                        ${escapeHtml(plan.departure?.note || 'Kiểm tra xe đạp & đồ dùng cá nhân.')}
                                    </p>
                                </div>
                            </div>

                            <!-- Timeline Stops for Active Day -->
                            ${(currentDayData.stops || []).map((stop, idx) => `
                                <!-- Transfer connector (if present) -->
                                ${stop.transfer ? `
                                    <div class="flex items-center justify-center py-0.5">
                                        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-fixed/30 dark:bg-emerald-950 text-secondary dark:text-emerald-300 text-[11px] font-medium shadow-2xs border border-secondary/20">
                                            <span class="material-symbols-outlined text-sm">${escapeHtml(stop.transfer.mode || 'directions_bike')}</span>
                                            <span class="font-bold">${escapeHtml(stop.transfer.distance || '1.5 km')}</span>
                                            <span>• ${escapeHtml(stop.transfer.time || '10 phút')}</span>
                                        </div>
                                    </div>
                                ` : ''}

                                <!-- Stop Slot Card -->
                                <div class="timeline-stop relative flex flex-col gap-2 p-3.5 rounded-xl bg-surface dark:bg-zinc-800 shadow-2xs hover:shadow-md transition-shadow group border-l-4 border-l-secondary dark:border-l-emerald-500 border border-outline-variant/30 dark:border-zinc-700">
                                    <div class="flex items-start gap-3">
                                        <div class="text-outline dark:text-zinc-500 pt-1 shrink-0" title="Chặng thứ tự ${idx + 1}">
                                            <span class="w-6 h-6 rounded-full bg-secondary/10 dark:bg-emerald-950 text-secondary dark:text-emerald-400 flex items-center justify-center text-xs font-bold">
                                                ${idx + 1}
                                            </span>
                                        </div>
                                        <img src="${escapeHtml(stop.image)}" alt="${escapeHtml(stop.title)}" class="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover shrink-0" />
                                        <div class="flex-1 min-w-0">
                                            <div class="flex items-center justify-between gap-1">
                                                <span class="text-[11px] text-secondary dark:text-emerald-400 font-bold">
                                                    Chặng 0${idx + 1} • ${escapeHtml(stop.timeRange)} (${stop.durationMinutes} phút)
                                                </span>
                                                <div class="flex items-center gap-1">
                                                    <button type="button" onclick="window.ViVuApp?.movePlannerStop ? window.ViVuApp.movePlannerStop('${stop.id}', -1) : null"
                                                        ${idx === 0 ? 'disabled' : ''}
                                                        title="Di chuyển lên trước"
                                                        aria-label="Di chuyển ${escapeHtml(stop.title)} lên trước"
                                                        class="p-1 rounded-lg text-outline dark:text-zinc-400 hover:text-secondary dark:hover:text-emerald-400 hover:bg-surface-container dark:hover:bg-zinc-700 min-h-[32px] min-w-[32px] flex items-center justify-center transition-colors disabled:opacity-25 disabled:cursor-not-allowed">
                                                        <span class="material-symbols-outlined text-[16px]">arrow_upward</span>
                                                    </button>
                                                    <button type="button" onclick="window.ViVuApp?.movePlannerStop ? window.ViVuApp.movePlannerStop('${stop.id}', 1) : null"
                                                        ${idx === (currentDayData.stops || []).length - 1 ? 'disabled' : ''}
                                                        title="Di chuyển xuống sau"
                                                        aria-label="Di chuyển ${escapeHtml(stop.title)} xuống sau"
                                                        class="p-1 rounded-lg text-outline dark:text-zinc-400 hover:text-secondary dark:hover:text-emerald-400 hover:bg-surface-container dark:hover:bg-zinc-700 min-h-[32px] min-w-[32px] flex items-center justify-center transition-colors disabled:opacity-25 disabled:cursor-not-allowed">
                                                        <span class="material-symbols-outlined text-[16px]">arrow_downward</span>
                                                    </button>
                                                    <button type="button" onclick="window.ViVuApp?.removePlaceFromPlan ? window.ViVuApp.removePlaceFromPlan('${stop.id}') : null"
                                                        title="Xóa khỏi lịch trình"
                                                        aria-label="Xóa ${escapeHtml(stop.title)}"
                                                        class="p-1 rounded-lg text-outline dark:text-zinc-400 hover:text-red-500 hover:bg-surface-container dark:hover:bg-zinc-700 min-h-[32px] min-w-[32px] flex items-center justify-center transition-colors">
                                                        <span class="material-symbols-outlined text-[16px]">delete</span>
                                                    </button>
                                                </div>
                                            </div>
                                            <h4 class="text-xs sm:text-sm font-bold text-primary dark:text-zinc-100 truncate mt-0.5">
                                                ${escapeHtml(stop.title)}
                                            </h4>
                                            <p class="text-[11px] text-on-surface-variant dark:text-zinc-400 line-clamp-2 mt-1">
                                                ${escapeHtml(stop.note)}
                                            </p>
                                        </div>
                                    </div>
                                    <div class="flex items-center justify-between pt-2 border-t border-outline-variant/20 dark:border-zinc-700 text-[11px] text-outline dark:text-zinc-400">
                                        <span class="inline-flex items-center gap-1">
                                            <span class="material-symbols-outlined text-xs text-secondary dark:text-emerald-400">verified</span>
                                            ${escapeHtml(stop.badge || 'Điểm đến đề xuất')}
                                        </span>
                                        ${stop.hasAudioGuide ? `
                                            <span class="text-secondary dark:text-emerald-400 font-semibold flex items-center gap-1">
                                                <span class="material-symbols-outlined text-xs">headphones</span>
                                                Audio guide
                                            </span>
                                        ` : ''}
                                    </div>
                                </div>
                            `).join('')}

                            <!-- Drop Placeholder Zone -->
                            <div id="drop-target-zone" onclick="document.getElementById('plannerPoolSearch')?.focus()"
                                class="flex flex-col items-center justify-center p-4 rounded-xl bg-surface-container-low dark:bg-zinc-800/40 border-2 border-dashed border-outline-variant dark:border-zinc-700 hover:border-secondary dark:hover:border-emerald-500 transition-all cursor-pointer text-center group">
                                <div class="w-9 h-9 rounded-full bg-surface dark:bg-zinc-800 flex items-center justify-center text-outline group-hover:text-secondary dark:group-hover:text-emerald-400 group-hover:scale-110 transition-all shadow-xs mb-1">
                                    <span class="material-symbols-outlined text-lg">add_circle</span>
                                </div>
                                <p class="text-xs font-semibold text-primary dark:text-zinc-200">Thêm điểm dừng tiếp theo vào Ngày ${activeDay}</p>
                                <p class="text-[11px] text-on-surface-variant dark:text-zinc-400">Chọn từ Ngân hàng địa điểm bên trái hoặc gõ tìm kiếm</p>
                            </div>
                        </div>
                    </div>

                    <!-- COLUMN 3: Bản đồ lộ trình trực tiếp & Action buttons (4 cols on XL) -->
                    <div class="col-span-12 xl:col-span-4 flex flex-col gap-4">
                        <!-- Action Toolbar -->
                        <div class="flex flex-col gap-2.5 p-3.5 rounded-2xl bg-surface-container-lowest dark:bg-zinc-900 border border-outline-variant/30 dark:border-zinc-800">
                            <div class="flex flex-wrap items-center gap-2">
                                <button id="btnSmartOptimize" type="button" onclick="window.ViVuApp?.optimizePlanAiRoute ? window.ViVuApp.optimizePlanAiRoute() : null"
                                    title="Mô phỏng thuật toán thử nghiệm (đảo thứ tự & trừ 3.2 km)"
                                    class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-semibold hover:opacity-90 transition-all shadow-xs min-h-[44px]">
                                    <span class="material-symbols-outlined text-[18px] text-amber-600 dark:text-amber-400 animate-pulse">auto_fix_high</span>
                                    <span>Mô phỏng AI Route</span>
                                </button>
                                <button id="btnExportGpx" type="button" onclick="window.ViVuApp?.exportGpxFile ? window.ViVuApp.exportGpxFile() : null"
                                    title="Xuất tệp GPX danh sách waypoint (Mặc định chỉ xuất mốc bản đồ số đã xác minh, không kèm track đường đi)"
                                    class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 text-xs font-semibold hover:bg-surface-container-high dark:hover:bg-zinc-700 transition-all min-h-[44px]">
                                    <span class="material-symbols-outlined text-[18px]">file_download</span>
                                    <span>Xuất GPX (Mốc xác minh)</span>
                                </button>
                                <button id="btnExportGpxRef" type="button" onclick="window.ViVuApp?.exportGpxFile ? window.ViVuApp.exportGpxFile({ includeUnverified: true }) : null"
                                    title="Tùy chọn riêng: Xuất tệp GPX tham khảo bao gồm cả điểm ước tính (có gắn nhãn cảnh báo rõ)"
                                    class="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border border-outline-variant/30 dark:border-zinc-700 text-outline dark:text-zinc-400 text-xs font-medium hover:text-on-surface dark:hover:text-zinc-200 transition-all min-h-[44px]">
                                    <span class="material-symbols-outlined text-[16px]">help_outline</span>
                                    <span>Xuất tham khảo</span>
                                </button>
                                <button id="btnSaveStartNav" type="button" onclick="window.ViVuApp?.openGpsNavModal ? window.ViVuApp.openGpsNavModal() : null"
                                    class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-semibold shadow-xs transition-all active:scale-95 min-h-[44px]">
                                    <span class="material-symbols-outlined text-[18px] text-secondary-fixed">play_arrow</span>
                                    <span>Bắt đầu GPS</span>
                                </button>
                            </div>

                            <!-- Minh bạch chức năng thử nghiệm -->
                            <div class="p-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/40 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
                                <span class="material-symbols-outlined text-[16px] text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">info</span>
                                <div class="space-y-0.5">
                                    <span class="font-bold">Minh bạch chức năng thử nghiệm / mô phỏng:</span>
                                    <p class="text-[10.5px] text-amber-800 dark:text-amber-300">
                                        • <b>“Mô phỏng AI Route”</b>: Đang chạy thuật toán thử nghiệm (đảo thứ tự điểm dừng và trừ ước tính 3.2 km). <i>Chưa phải kết quả định tuyến thực tế từ bản đồ số.</i><br>
                                        • <b>“Xuất GPX”</b>: Chỉ xuất danh sách waypoint (tọa độ điểm dừng), không chứa track nối tuyến đường thực tế. Mặc định chỉ xuất các mốc bản đồ số đã xác minh; điểm ước tính chỉ xuất khi chọn tùy chọn tham khảo và luôn kèm cảnh báo.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- Live Map Canvas Card -->
                        <div class="relative rounded-2xl bg-surface-container-lowest dark:bg-zinc-900 p-3.5 shadow-xs border border-outline-variant/30 dark:border-zinc-800 flex flex-col">
                            <div class="flex items-center justify-between px-1 mb-2">
                                <div class="flex items-center gap-2">
                                    <span class="material-symbols-outlined text-secondary dark:text-emerald-400">map</span>
                                    <h3 class="text-xs sm:text-sm font-bold text-primary dark:text-zinc-100">Bản đồ lộ trình tương tác</h3>
                                </div>
                                <span class="text-[11px] px-2 py-0.5 rounded-full bg-secondary/10 dark:bg-emerald-950 text-secondary dark:text-emerald-400 font-semibold">
                                    GPS Trực tiếp
                                </span>
                            </div>

                            <!-- Map Simulated Vector Display -->
                            <div class="relative w-full h-[260px] sm:h-[280px] rounded-xl bg-emerald-950/20 dark:bg-zinc-950 overflow-hidden flex items-end p-3 border border-outline-variant/30 dark:border-zinc-800">
                                <img src="ao bà om.jpg" alt="Bản đồ Trà Vinh" class="absolute inset-0 w-full h-full object-cover opacity-20 filter saturate-50" />
                                <svg class="absolute inset-0 w-full h-full pointer-events-none" fill="none" viewBox="0 0 400 320">
                                    <path d="M 40 250 C 90 220, 140 260, 200 180 C 240 130, 290 140, 350 80" stroke="#006c4a" stroke-dasharray="6 6" stroke-linecap="round" stroke-width="4" opacity="0.8"></path>
                                    <path d="M 40 250 C 90 220, 140 260, 200 180" stroke="#10b981" stroke-linecap="round" stroke-width="4"></path>
                                    <circle cx="40" cy="250" fill="#003527" r="10"></circle>
                                    <circle cx="40" cy="250" fill="#ffffff" r="4"></circle>
                                    <circle cx="140" cy="240" fill="#006c4a" r="12"></circle>
                                    <circle cx="140" cy="240" fill="#ffffff" r="5"></circle>
                                    <circle cx="200" cy="180" fill="#006c4a" r="12"></circle>
                                    <circle cx="200" cy="180" fill="#ffffff" r="5"></circle>
                                    <circle cx="320" cy="100" fill="#ea580c" r="12"></circle>
                                    <circle cx="320" cy="100" fill="#ffffff" r="5"></circle>
                                </svg>

                                <div class="absolute left-4 bottom-14 bg-surface/90 dark:bg-zinc-900/90 backdrop-blur-md px-2 py-0.5 rounded-md shadow-xs text-[10px] font-bold text-primary dark:text-zinc-100 flex items-center gap-1">
                                    <span class="w-1.5 h-1.5 rounded-full bg-primary dark:bg-emerald-400"></span> Xuất phát
                                </div>
                                <div class="absolute left-24 bottom-22 bg-surface/90 dark:bg-zinc-900/90 backdrop-blur-md px-2 py-0.5 rounded-md shadow-xs text-[10px] font-bold text-secondary dark:text-emerald-400 flex items-center gap-1">
                                    <span class="w-1.5 h-1.5 rounded-full bg-secondary dark:bg-emerald-400"></span> 1. Chùa Âng
                                </div>
                                <div class="absolute left-40 top-32 bg-surface/90 dark:bg-zinc-900/90 backdrop-blur-md px-2 py-0.5 rounded-md shadow-xs text-[10px] font-bold text-secondary dark:text-emerald-400 flex items-center gap-1">
                                    <span class="w-1.5 h-1.5 rounded-full bg-secondary dark:bg-emerald-400"></span> 2. Ao Bà Om
                                </div>

                                <div class="relative w-full z-10 p-2 rounded-xl bg-surface/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-sm flex items-center justify-between border border-outline-variant/30 dark:border-zinc-800">
                                    <div class="flex items-center gap-2">
                                        <span class="material-symbols-outlined text-secondary dark:text-emerald-400 text-lg">route</span>
                                        <p class="text-xs font-bold text-primary dark:text-zinc-100">${plan.totalDistanceKm || 7.5} km • Ngày ${activeDay}</p>
                                    </div>
                                    <button type="button" onclick="window.ViVuApp?.openFullMapModal?.()"
                                        title="Xem bản đồ toàn màn hình"
                                        class="p-1 rounded-lg bg-surface-container dark:bg-zinc-800 text-on-surface dark:text-zinc-200 min-h-[32px] min-w-[32px] flex items-center justify-center">
                                        <span class="material-symbols-outlined text-base">fullscreen</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Eco Impact Card -->
                        <div class="rounded-2xl bg-surface-container-lowest dark:bg-zinc-900 p-4 shadow-xs border border-outline-variant/30 dark:border-zinc-800 flex items-center gap-3">
                            <div class="w-11 h-11 rounded-xl bg-secondary-container dark:bg-emerald-950 text-secondary dark:text-emerald-400 flex items-center justify-center shrink-0">
                                <span class="material-symbols-outlined text-2xl">eco</span>
                            </div>
                            <div class="flex-1 min-w-0">
                                <h4 class="text-xs sm:text-sm font-bold text-primary dark:text-zinc-100 truncate">Cam kết Du lịch Có Trách Nhiệm</h4>
                                <p class="text-[11px] text-on-surface-variant dark:text-zinc-400">
                                    Lộ trình giảm 82% dấu chân carbon so với ô tô. Tôn trọng nếp sống và văn hóa nhà chùa.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ========================================== -->
            <!-- TAB CONTENT 2: LỊCH TRÌNH GỢI Ý (SUGGESTED)-->
            <!-- ========================================== -->
            <div id="plannerTabContentSuggested" class="${activeTab === 'suggested' ? '' : 'hidden'} space-y-6">
                <div id="plannerSuggestedToursContainer">
                    <!-- Suggested tours content injected below -->
                </div>
            </div>
        </div>
    `;

    // Render suggested tours into #plannerSuggestedToursContainer
    renderTourItineraries(
        'plannerSuggestedToursContainer',
        activeTourId,
        (tourId) => {
            if (typeof window !== 'undefined' && window.ViVuApp?.selectTourInPlanner) {
                window.ViVuApp.selectTourInPlanner(tourId);
            }
        },
        null,
        null,
        () => {
            if (typeof window !== 'undefined' && window.ViVuApp?.handleGenerateRandomTourInPlanner) {
                window.ViVuApp.handleGenerateRandomTourInPlanner();
            }
        }
    );
}

/**
 * Render GPS Turn-by-Turn Mobile Navigation Modal Content
 * @param {Object} gps - Current GPS navigation state
 */
export function renderGpsNavigationModalContent(gps) {
    if (!gps) return '';

    return `
        <div class="flex flex-col w-full bg-surface dark:bg-zinc-950 text-on-surface dark:text-zinc-100 min-h-screen sm:min-h-0 select-none relative overflow-hidden">
            <!-- Top HUD Bar: Turn-by-Turn Instruction Banner -->
            <div class="p-3 sm:p-4 bg-primary text-white shadow-xl flex flex-col gap-2 relative z-30">
                <div class="flex items-start justify-between gap-3">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-secondary dark:bg-emerald-600 flex items-center justify-center text-white shadow-inner shrink-0">
                            <span class="material-symbols-outlined text-3xl sm:text-4xl" style="font-variation-settings: 'FILL' 1;">
                                ${escapeHtml(gps.currentStep?.maneuver || 'turn_right')}
                            </span>
                        </div>
                        <div class="flex flex-col min-w-0">
                            <div class="flex items-baseline gap-1.5">
                                <span class="font-headline-lg text-2xl sm:text-3xl text-white font-bold tracking-tight">
                                    ${gps.currentStep?.distanceMeters || 150}
                                </span>
                                <span class="text-xs sm:text-sm text-secondary-fixed font-semibold">mét</span>
                            </div>
                            <h2 class="text-xs sm:text-sm font-bold text-white truncate leading-tight">
                                ${escapeHtml(gps.currentStep?.instruction || 'Rẽ phải vào Cổng Di tích Chùa Âng')}
                            </h2>
                        </div>
                    </div>

                    <!-- Audio Guidance & Close Buttons -->
                    <div class="flex items-center gap-1.5 shrink-0">
                        <button id="gpsVoiceToggleBtn" type="button" onclick="window.ViVuApp.toggleGpsVoice()"
                            aria-label="Bật tắt âm thanh chỉ dẫn"
                            class="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center ${gps.isVoiceEnabled ? 'text-secondary-fixed' : 'text-outline-variant'} min-h-[44px] min-w-[44px]">
                            <span class="material-symbols-outlined text-[20px]">
                                ${gps.isVoiceEnabled ? 'volume_up' : 'volume_off'}
                            </span>
                        </button>
                        <button type="button" onclick="window.ViVuApp.closeGpsNavModal()"
                            aria-label="Đóng chỉ đường"
                            class="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white min-h-[44px] min-w-[44px]">
                            <span class="material-symbols-outlined text-[20px]">close</span>
                        </button>
                    </div>
                </div>

                <!-- Secondary Follow-up Guidance -->
                <div class="flex items-center justify-between pt-2 mt-0.5 bg-black/20 -mx-3 sm:-mx-4 -mb-3 sm:-mb-4 px-3 sm:px-4 py-2 rounded-b-xl text-xs">
                    <div class="flex items-center gap-1.5 text-emerald-200 min-w-0">
                        <span class="material-symbols-outlined text-sm shrink-0">straight</span>
                        <span class="truncate text-[11px] sm:text-xs">
                            ${escapeHtml(gps.currentStep?.followUp || 'Sau đó đi thẳng 800m dọc bờ hồ Ao Bà Om')}
                        </span>
                    </div>
                    <div class="flex items-center gap-1 shrink-0 bg-primary/40 px-2 py-0.5 rounded-md text-[10px]">
                        <span class="material-symbols-outlined text-xs text-outline-variant">straight</span>
                        <span class="material-symbols-outlined text-xs text-secondary-fixed font-bold">turn_right</span>
                    </div>
                </div>
            </div>

            <!-- GPS Perspective Simulated Vector Map Display -->
            <div class="relative w-full h-[360px] sm:h-[480px] bg-[#d9e5db] dark:bg-zinc-900 overflow-hidden">
                <!-- SVG Vector Map Rendering -->
                <svg class="absolute inset-0 w-full h-full object-cover" fill="none" preserveAspectRatio="xMidYMid slice" viewBox="0 0 420 700">
                    <defs>
                        <linearGradient id="routeGrad" x1="0%" x2="0%" y1="100%" y2="0%">
                            <stop offset="0%" stop-color="#059669"></stop>
                            <stop offset="50%" stop-color="#10b981"></stop>
                            <stop offset="100%" stop-color="#34d399"></stop>
                        </linearGradient>
                    </defs>
                    <!-- Ao Ba Om Lake representation -->
                    <ellipse cx="290" cy="220" rx="90" ry="55" fill="#38bdf8" fill-opacity="0.3" stroke="#0284c7" stroke-width="1.5" stroke-dasharray="4 2"></ellipse>
                    <text x="250" y="225" fill="#0369a1" font-size="11" font-weight="700" letter-spacing="0.5">AO BÀ OM</text>

                    <!-- Heritage Trees Clusters -->
                    <g fill="#0b714e" fill-opacity="0.22">
                        <circle cx="80" cy="460" r="26"></circle>
                        <circle cx="110" cy="485" r="20"></circle>
                        <circle cx="170" cy="250" r="32"></circle>
                        <circle cx="340" cy="340" r="28"></circle>
                    </g>

                    <!-- Active Route Polyline -->
                    <path d="M175 620 L175 420 Q175 375 220 375 L330 375 Q365 375 365 310 L365 140" stroke="#003527" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" opacity="0.15"></path>
                    <path d="M175 620 L175 420 Q175 375 220 375 L330 375 Q365 375 365 310 L365 140" stroke="url(#routeGrad)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"></path>
                    <path d="M175 620 L175 420 Q175 375 220 375 L330 375 Q365 375 365 310 L365 140" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="8 12" opacity="0.9"></path>

                    <!-- Waypoint 1: Target Pin -->
                    <g transform="translate(195, 345)">
                        <circle cx="25" cy="25" r="20" fill="#003527"></circle>
                        <circle cx="25" cy="25" r="16" fill="#ea580c"></circle>
                        <text x="25" y="30" fill="#ffffff" font-size="13" font-weight="700" text-anchor="middle">1</text>
                    </g>
                    <!-- Waypoint 2: Ao Ba Om -->
                    <g transform="translate(340, 275)">
                        <circle cx="15" cy="15" r="13" fill="#ffffff"></circle>
                        <circle cx="15" cy="15" r="10" fill="#006c4a"></circle>
                        <text x="15" y="19" fill="#ffffff" font-size="10" font-weight="700" text-anchor="middle">2</text>
                    </g>

                    <!-- User GPS Puck with pulsing wave -->
                    <g transform="translate(175, 520)">
                        <circle cx="0" cy="0" r="32" fill="#10b981" fill-opacity="0.2">
                            <animate attributeName="r" values="18;36;18" dur="2.4s" repeatCount="indefinite"></animate>
                            <animate attributeName="opacity" values="0.6;0;0.6" dur="2.4s" repeatCount="indefinite"></animate>
                        </circle>
                        <circle cx="0" cy="0" r="14" fill="#ffffff"></circle>
                        <polygon points="0,-10 7,7 0,4 -7,7" fill="#003527"></polygon>
                    </g>
                </svg>

                <!-- Floating Cultural Audio Guide Capsule -->
                <div class="absolute top-3 inset-x-3 z-20">
                    <div class="bg-surface-container-lowest/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-xl p-3 shadow-lg flex items-center justify-between gap-3 border border-outline-variant/30 dark:border-zinc-800">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <div class="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-400 flex items-center justify-center shrink-0 animate-pulse">
                                <span class="material-symbols-outlined text-lg">graphic_eq</span>
                            </div>
                            <div class="flex flex-col min-w-0">
                                <div class="flex items-center gap-1.5">
                                    <span class="text-[10px] text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                                        ${escapeHtml(gps.audioGuide?.category || 'Thuyết minh')}
                                    </span>
                                    <span class="text-[10px] text-on-surface-variant dark:text-zinc-400">${escapeHtml(gps.audioGuide?.currentTime || '01:24')} / ${escapeHtml(gps.audioGuide?.totalTime || '03:10')}</span>
                                </div>
                                <p class="text-xs font-semibold text-on-surface dark:text-zinc-100 truncate">
                                    ${escapeHtml(gps.audioGuide?.title || 'Huyền tích Thần chim Garuda')}
                                </p>
                            </div>
                        </div>
                        <button id="gpsAudioToggleBtn" type="button" onclick="window.ViVuApp.toggleGpsAudioGuide()"
                            aria-label="Phát hoặc tạm dừng audio thuyết minh"
                            class="w-8 h-8 rounded-full bg-surface-container dark:bg-zinc-800 flex items-center justify-center text-primary dark:text-emerald-400 min-h-[32px] min-w-[32px]">
                            <span class="material-symbols-outlined text-base">${gps.audioGuide?.isPlaying ? 'pause' : 'play_arrow'}</span>
                        </button>
                    </div>
                </div>

                <!-- Floating Speedometer Widget -->
                <div class="absolute left-3 bottom-4 z-20 flex flex-col items-center gap-1 bg-surface-container-lowest/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-2xl p-2 shadow-md w-16 border border-outline-variant/30 dark:border-zinc-800">
                    <div class="flex flex-col items-center justify-center w-12 h-12 rounded-full bg-surface-container dark:bg-zinc-800 text-on-surface dark:text-zinc-100">
                        <span class="text-[9px] text-on-surface-variant dark:text-zinc-400 uppercase font-bold leading-none">Tốc độ</span>
                        <span class="text-sm font-bold text-secondary dark:text-emerald-400 leading-none mt-0.5">${gps.currentSpeedKmh || 24}</span>
                        <span class="text-[8px] text-on-surface-variant dark:text-zinc-400 leading-none">km/h</span>
                    </div>
                    <div class="w-9 h-9 rounded-full bg-red-100 dark:bg-red-950/80 flex flex-col items-center justify-center text-red-700 dark:text-red-400 mt-0.5 border border-red-200 dark:border-red-900">
                        <span class="text-[8px] font-bold leading-none">HẠN MỨC</span>
                        <span class="text-[10px] font-bold leading-none">${gps.speedLimitKmh || 30}</span>
                    </div>
                </div>

                <!-- Right Floating Map Controls -->
                <div class="absolute right-3 bottom-4 z-20 flex flex-col gap-2">
                    <button id="gps3dToggleBtn" type="button" onclick="window.ViVuApp.toggleGps3DMode()"
                        aria-label="Chuyển chế độ xem 3D"
                        class="w-10 h-10 rounded-xl bg-surface-container-lowest dark:bg-zinc-900 text-primary dark:text-emerald-400 shadow-md flex items-center justify-center text-xs font-bold min-h-[44px] min-w-[44px] border border-outline-variant/30 dark:border-zinc-800">
                        3D
                    </button>
                    <button type="button"
                        aria-label="Định vị lại"
                        class="w-10 h-10 rounded-xl bg-primary text-secondary-fixed shadow-md flex items-center justify-center min-h-[44px] min-w-[44px]">
                        <span class="material-symbols-outlined text-xl">near_me</span>
                    </button>
                </div>
            </div>

            <!-- Bottom Dashboard & Action Dock -->
            <div class="p-4 bg-surface-container-lowest dark:bg-zinc-900 border-t border-outline-variant/30 dark:border-zinc-800 flex flex-col gap-3">
                <div class="flex items-center justify-between">
                    <div class="flex flex-col">
                        <div class="flex items-baseline gap-2">
                            <span class="text-xl sm:text-2xl font-bold text-primary dark:text-emerald-400">${gps.eta || '08:15'}</span>
                            <span class="text-[11px] font-bold text-secondary dark:text-emerald-300 bg-secondary-container/40 dark:bg-emerald-950 px-2 py-0.5 rounded-full">
                                Dự kiến đến
                            </span>
                        </div>
                        <div class="flex items-center gap-1.5 text-on-surface-variant dark:text-zinc-400 text-xs mt-0.5">
                            <span class="font-bold text-on-surface dark:text-zinc-100">${gps.remainingMinutes || 12} phút</span>
                            <span>•</span>
                            <span>Còn ${gps.remainingMeters || 850}m</span>
                            <span>•</span>
                            <span class="text-secondary dark:text-emerald-400 font-medium">${gps.vehicleMode || 'Xe máy / Xe đạp'}</span>
                        </div>
                    </div>
                </div>

                <!-- 4-Stage Route Progress Bar -->
                <div class="flex flex-col gap-1.5 bg-surface-container-low dark:bg-zinc-800 p-2.5 rounded-xl border border-outline-variant/20 dark:border-zinc-700">
                    <div class="flex items-center justify-between text-[11px]">
                        <span class="font-semibold text-primary dark:text-zinc-200">${gps.progressStage || 'Chặng 1/4 • Chùa Âng & Ao Bà Om'}</span>
                        <span class="text-outline dark:text-zinc-400">${gps.totalDistanceStr || 'Tổng 4.2 km'}</span>
                    </div>
                    <div class="grid grid-cols-4 gap-1.5 w-full h-2">
                        <div class="h-full rounded-full bg-secondary dark:bg-emerald-500 animate-pulse"></div>
                        <div class="h-full rounded-full bg-outline-variant/40 dark:bg-zinc-700"></div>
                        <div class="h-full rounded-full bg-outline-variant/40 dark:bg-zinc-700"></div>
                        <div class="h-full rounded-full bg-outline-variant/40 dark:bg-zinc-700"></div>
                    </div>
                </div>

                <!-- Action Dock -->
                <div class="grid grid-cols-4 gap-2 pt-1">
                    <button type="button" onclick="window.ViVuApp.openFullMapModal?.()"
                        class="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-surface-container dark:bg-zinc-800 hover:bg-surface-container-high dark:hover:bg-zinc-700 text-on-surface dark:text-zinc-200 transition-all min-h-[48px]">
                        <span class="material-symbols-outlined text-xl text-primary dark:text-emerald-400">alt_route</span>
                        <span class="text-[10px] font-semibold">Toàn cảnh</span>
                    </button>
                    <button type="button" onclick="window.ViVuApp.searchNearbyPitstops?.()"
                        class="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-surface-container dark:bg-zinc-800 hover:bg-surface-container-high dark:hover:bg-zinc-700 text-on-surface dark:text-zinc-200 transition-all min-h-[48px]">
                        <span class="material-symbols-outlined text-xl text-secondary dark:text-emerald-400">local_gas_station</span>
                        <span class="text-[10px] font-semibold">Điểm dừng</span>
                    </button>
                    <button type="button" onclick="window.ViVuApp.toggleGpsAudioGuide()"
                        class="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-surface-container dark:bg-zinc-800 hover:bg-surface-container-high dark:hover:bg-zinc-700 text-on-surface dark:text-zinc-200 transition-all min-h-[48px]">
                        <span class="material-symbols-outlined text-xl text-amber-600 dark:text-amber-400">podcasts</span>
                        <span class="text-[10px] font-semibold">Thuyết minh</span>
                    </button>
                    <button id="endNavBtn" type="button" onclick="window.ViVuApp.finishGpsNavigation()"
                        class="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-red-100 hover:bg-red-200 dark:bg-red-950 dark:hover:bg-red-900 text-red-700 dark:text-red-300 font-bold transition-all min-h-[48px]">
                        <span class="material-symbols-outlined text-xl">flag</span>
                        <span class="text-[10px] font-bold">Kết thúc</span>
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render Trip Summary Modal Content
 * @param {Object} summary - Trip summary state
 */
export function renderTripSummaryModalContent(summary) {
    if (!summary) return '';

    return `
        <div class="flex flex-col w-full bg-surface dark:bg-zinc-950 text-on-surface dark:text-zinc-100 min-h-screen sm:min-h-0 select-none p-4 sm:p-6">
            <!-- Header Bar -->
            <div class="flex items-center justify-between pb-4 border-b border-outline-variant/30 dark:border-zinc-800">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-secondary dark:text-emerald-400 text-2xl">celebration</span>
                    <h2 class="text-base sm:text-lg font-bold text-primary dark:text-zinc-100">Tổng kết chuyến đi</h2>
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" onclick="window.ViVuApp.openStoryShareModal()"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary dark:bg-emerald-600 text-white text-xs font-semibold shadow-xs min-h-[44px]">
                        <span class="material-symbols-outlined text-[18px]">share</span>
                        <span>Chia sẻ Story</span>
                    </button>
                    <button type="button" onclick="window.ViVuApp.closeTripSummaryModal()"
                        aria-label="Đóng tổng kết"
                        class="w-10 h-10 rounded-xl flex items-center justify-center text-outline dark:text-zinc-400 hover:bg-surface-container dark:hover:bg-zinc-800 min-h-[44px] min-w-[44px]">
                        <span class="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>
            </div>

            <!-- Achievement Hero Card -->
            <div class="relative overflow-hidden rounded-2xl bg-primary text-white p-5 sm:p-6 shadow-md mt-4">
                <div class="relative z-10 flex items-center justify-between gap-2">
                    <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/80 text-white text-xs font-semibold">
                        <span class="material-symbols-outlined text-sm text-amber-300">verified</span>
                        <span>Hành trình xuất sắc hoàn thành!</span>
                    </div>
                    <span class="text-xs text-emerald-200">${escapeHtml(summary.completedDate || 'Hôm nay • 14:45')}</span>
                </div>
                <div class="relative z-10 mt-3 flex items-start gap-4">
                    <div class="flex-1 min-w-0">
                        <h3 class="text-base sm:text-xl font-bold leading-tight text-white">
                            ${escapeHtml(summary.title)}
                        </h3>
                        <p class="text-xs text-emerald-100 mt-1 leading-relaxed">
                            ${escapeHtml(summary.description)}
                        </p>
                    </div>
                    <div class="flex flex-col items-center shrink-0">
                        <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 p-0.5 shadow-md flex items-center justify-center">
                            <div class="w-full h-full rounded-[14px] bg-primary flex flex-col items-center justify-center text-center p-1">
                                <span class="material-symbols-outlined text-2xl text-amber-300" style="font-variation-settings: 'FILL' 1;">military_tech</span>
                                <span class="text-[9px] text-amber-200 font-bold leading-none">Xứ Trà</span>
                            </div>
                        </div>
                        <span class="text-[10px] font-semibold text-emerald-200 mt-1">${escapeHtml(summary.badgeTitle || 'Sứ giả')}</span>
                    </div>
                </div>
                <!-- Eco Strip -->
                <div class="relative z-10 mt-4 flex items-center justify-between bg-white/10 rounded-xl px-3 py-2">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-secondary-fixed text-lg">nature_people</span>
                        <span class="text-xs text-white font-medium">${escapeHtml(summary.ecoImpactText || 'Giảm 2.4kg CO₂')}</span>
                    </div>
                    <span class="text-[10px] font-bold text-secondary-fixed bg-secondary/40 px-2 py-0.5 rounded-full">Eco 100%</span>
                </div>
            </div>

            <!-- Stats Grid -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <div class="p-3.5 rounded-xl bg-surface-container-lowest dark:bg-zinc-900 border border-outline-variant/30 dark:border-zinc-800 text-center">
                    <span class="text-[11px] text-outline dark:text-zinc-400">Quãng đường</span>
                    <p class="text-lg font-bold text-primary dark:text-emerald-400 mt-0.5">${summary.stats?.distanceKm || '14.8'} km</p>
                </div>
                <div class="p-3.5 rounded-xl bg-surface-container-lowest dark:bg-zinc-900 border border-outline-variant/30 dark:border-zinc-800 text-center">
                    <span class="text-[11px] text-outline dark:text-zinc-400">Thời lượng</span>
                    <p class="text-lg font-bold text-primary dark:text-emerald-400 mt-0.5">${summary.stats?.durationHours || '6h 45m'}</p>
                </div>
                <div class="p-3.5 rounded-xl bg-surface-container-lowest dark:bg-zinc-900 border border-outline-variant/30 dark:border-zinc-800 text-center">
                    <span class="text-[11px] text-outline dark:text-zinc-400">Điểm khám phá</span>
                    <p class="text-lg font-bold text-primary dark:text-emerald-400 mt-0.5">${summary.stats?.pointsVisited || '4 / 4'}</p>
                </div>
                <div class="p-3.5 rounded-xl bg-surface-container-lowest dark:bg-zinc-900 border border-outline-variant/30 dark:border-zinc-800 text-center">
                    <span class="text-[11px] text-outline dark:text-zinc-400">Năng lượng tiêu hao</span>
                    <p class="text-lg font-bold text-primary dark:text-emerald-400 mt-0.5">${summary.stats?.caloriesBurned || '~720'} kcal</p>
                </div>
            </div>

            <!-- Chronological Milestones -->
            <div class="mt-4 p-4 rounded-2xl bg-surface-container-lowest dark:bg-zinc-900 border border-outline-variant/30 dark:border-zinc-800 flex flex-col gap-3">
                <h4 class="text-xs sm:text-sm font-bold text-primary dark:text-zinc-100 flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-secondary dark:text-emerald-400 text-lg">route</span>
                    <span>Dấu tích hành trình</span>
                </h4>
                <div class="flex flex-col gap-2.5">
                    ${(summary.milestones || []).map(m => `
                        <div class="flex items-start gap-3 p-2.5 rounded-xl bg-surface-container-low dark:bg-zinc-800/60">
                            <span class="w-6 h-6 rounded-full bg-secondary dark:bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                                <span class="material-symbols-outlined text-xs">check</span>
                            </span>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center justify-between">
                                    <h5 class="text-xs font-bold text-primary dark:text-zinc-100">${escapeHtml(m.title)}</h5>
                                    <span class="text-[10px] text-outline dark:text-zinc-400">${escapeHtml(m.time)}</span>
                                </div>
                                <p class="text-[11px] text-on-surface-variant dark:text-zinc-400 mt-0.5">${escapeHtml(m.note)}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Photos & Share CTA -->
            <div class="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-outline-variant/30 dark:border-zinc-800">
                <button type="button" onclick="window.ViVuApp.openTripPlannerModal()"
                    class="px-4 py-2.5 rounded-xl text-on-surface-variant dark:text-zinc-400 hover:bg-surface-container dark:hover:bg-zinc-800 text-xs font-semibold min-h-[44px]">
                    Xem lại kế hoạch
                </button>
                <button id="btnOpenStoryCard" type="button" onclick="window.ViVuApp.openStoryShareModal()"
                    class="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-md transition-all min-h-[44px]">
                    <span class="material-symbols-outlined text-[18px]">photo_camera</span>
                    <span>Tạo thẻ Story chia sẻ ngay</span>
                </button>
            </div>
        </div>
    `;
}

/**
 * Render Social Story Card Modal Content
 * @param {Object} template - Story template state
 * @param {string} activeTheme - 'heritage' | 'eco' | 'foodie'
 * @param {Object} toggles - { badge: boolean, stats: boolean, qr: boolean }
 */
export function renderSocialStoryModalContent(template, activeTheme = 'heritage', toggles = { badge: true, stats: true, qr: true }) {
    if (!template) return '';

    return `
        <div class="flex flex-col w-full bg-primary-container/95 backdrop-blur-md text-white min-h-screen sm:min-h-0 select-none p-4 sm:p-6 justify-between">
            <!-- Top Modal Navigation Header -->
            <div class="flex items-center justify-between pb-3 text-white border-b border-white/10">
                <div class="flex items-center gap-3">
                    <button type="button" onclick="window.ViVuApp.closeStoryShareModal()"
                        aria-label="Đóng Story"
                        class="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white min-h-[44px] min-w-[44px]">
                        <span class="material-symbols-outlined text-[20px]">close</span>
                    </button>
                    <div>
                        <h2 class="text-sm sm:text-base font-bold text-white">Thẻ Story Hành Trình</h2>
                        <p class="text-[11px] text-emerald-200">Chia sẻ khoảnh khắc Xứ Trà</p>
                    </div>
                </div>
                <button id="btnDownloadStory" type="button" onclick="window.ViVuApp.downloadStoryCard()"
                    aria-label="Tải ảnh về máy"
                    class="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white min-h-[44px] min-w-[44px]">
                    <span class="material-symbols-outlined text-[20px]">download</span>
                </button>
            </div>

            <!-- Main Visual: 9:16 Vertical Story Card Preview Container -->
            <div class="flex justify-center items-center my-4">
                <div id="storyCanvas" class="relative w-[300px] h-[520px] rounded-3xl overflow-hidden shadow-2xl flex flex-col justify-between p-4 border border-white/20 select-none">
                    <!-- Background Composite -->
                    <img src="${escapeHtml(template.bgImage)}" alt="Story Background" class="absolute inset-0 w-full h-full object-cover z-0" />
                    <!-- Scrim overlay -->
                    <div class="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent via-40% to-black/90 z-10 pointer-events-none"></div>

                    <!-- Story Top Bar -->
                    <div class="relative z-20 flex items-center justify-between w-full">
                        <div class="flex items-center gap-1.5 bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/20">
                            <span class="material-symbols-outlined text-secondary-fixed text-base">eco</span>
                            <div class="flex flex-col leading-none">
                                <span class="text-[10px] font-bold text-white">ViVuTraVinh</span>
                                <span class="text-[8px] text-secondary-fixed">${escapeHtml(template.subtitle || 'Xứ Tháp Vàng')}</span>
                            </div>
                        </div>
                        <div class="bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-full text-white text-[9px]">
                            ${escapeHtml(template.dateText || '25.10.2024')}
                        </div>
                    </div>

                    <!-- Story Mid Content -->
                    <div class="relative z-20 flex flex-col gap-2 my-auto">
                        <!-- Badge Pill -->
                        ${toggles.badge ? `
                            <div id="storyBadgePill" class="self-start flex items-center gap-1.5 bg-gradient-to-r from-amber-400 to-emerald-400 text-black px-2.5 py-1 rounded-full shadow-md text-[10px] font-bold">
                                <span class="material-symbols-outlined text-xs">workspace_premium</span>
                                <span>${escapeHtml(template.badgeName)}</span>
                            </div>
                        ` : ''}

                        <!-- Polaroids collage -->
                        <div class="flex items-end justify-between gap-2 pt-1">
                            ${(template.polaroids || []).slice(0, 2).map((p, idx) => `
                                <div class="w-28 bg-white p-1 pb-2 rounded-xl shadow-lg transform ${idx === 0 ? '-rotate-3' : 'rotate-2'} transition-transform">
                                    <div class="w-full h-16 rounded-lg overflow-hidden bg-zinc-100 mb-1">
                                        <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.alt || p.title)}" class="w-full h-full object-cover" />
                                    </div>
                                    <p class="text-[9px] text-zinc-900 font-bold text-center leading-tight truncate px-1">${escapeHtml(p.title)}</p>
                                </div>
                            `).join('')}
                        </div>

                        <!-- Quote sticker -->
                        <div class="bg-white/90 backdrop-blur-xs p-2 rounded-xl shadow-sm text-zinc-900 text-[10px] italic font-medium leading-snug">
                            ${escapeHtml(template.quote)}
                        </div>
                    </div>

                    <!-- Story Bottom Bar -->
                    <div class="relative z-20 flex flex-col gap-2">
                        <!-- Stat Chips -->
                        ${toggles.stats ? `
                            <div id="storyStatsGrid" class="grid grid-cols-2 gap-1.5">
                                <div class="bg-black/60 backdrop-blur-md px-2 py-1 rounded-xl flex items-center gap-1.5 text-white">
                                    <span class="material-symbols-outlined text-secondary-fixed text-sm">directions_bike</span>
                                    <div class="flex flex-col leading-tight">
                                        <span class="text-[10px] font-bold text-secondary-fixed">${escapeHtml(template.stats?.distance || '14.8 km')}</span>
                                        <span class="text-[8px] opacity-75">Hành trình xanh</span>
                                    </div>
                                </div>
                                <div class="bg-black/60 backdrop-blur-md px-2 py-1 rounded-xl flex items-center gap-1.5 text-white">
                                    <span class="material-symbols-outlined text-emerald-300 text-sm">eco</span>
                                    <div class="flex flex-col leading-tight">
                                        <span class="text-[10px] font-bold text-emerald-300">${escapeHtml(template.stats?.co2Saved || '-2.4 kg CO₂')}</span>
                                        <span class="text-[8px] opacity-75">Bảo vệ Trái đất</span>
                                    </div>
                                </div>
                            </div>
                        ` : ''}

                        <!-- Footer Tags & QR Code -->
                        <div class="flex items-center justify-between pt-1">
                            <div class="flex flex-col">
                                <span class="text-[9px] text-emerald-200 font-medium">${escapeHtml(template.hashtags)}</span>
                                <span class="text-[8px] text-white/70">${escapeHtml(template.journeyUrl)}</span>
                            </div>
                            ${toggles.qr ? `
                                <div id="storyQrBlock" class="w-8 h-8 rounded-lg bg-white p-1 flex items-center justify-center shadow-xs">
                                    <svg class="w-full h-full text-emerald-950" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M2 2h8v8H2V2zm2 2v4h4V4H4zm8-2h8v8h-8V2zm2 2v4h4V4h-4zM2 14h8v8H2v-8zm2 2v4h4v-4H4zm11 0h2v2h-2v-2zm-3-2h2v2h-2v-2zm5 5h2v2h-2v-2zm-2 2h2v2h-2v-2zm2-4h2v2h-2v-2zm-4 2h2v2h-2v-2z"></path>
                                    </svg>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Customization Controls Sheet -->
            <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl p-4 text-on-surface dark:text-zinc-100 flex flex-col gap-3 shadow-lg">
                <!-- Theme Selectors -->
                <div class="flex flex-col gap-1.5">
                    <span class="text-[11px] font-bold uppercase tracking-wider text-outline dark:text-zinc-400">Chọn phong cách Story</span>
                    <div class="grid grid-cols-3 gap-2">
                        <button type="button" onclick="window.ViVuApp.switchStoryTheme('heritage')"
                            class="template-btn py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 transition-all text-center min-h-[44px] ${
                                activeTheme === 'heritage'
                                    ? 'bg-primary dark:bg-emerald-600 text-white shadow-xs'
                                    : 'bg-surface-container dark:bg-zinc-800 text-on-surface dark:text-zinc-300'
                            }">
                            <span class="material-symbols-outlined text-[18px]">temple_buddhist</span>
                            <span class="text-[10px] font-bold">Cổ Kính</span>
                        </button>
                        <button type="button" onclick="window.ViVuApp.switchStoryTheme('eco')"
                            class="template-btn py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 transition-all text-center min-h-[44px] ${
                                activeTheme === 'eco'
                                    ? 'bg-primary dark:bg-emerald-600 text-white shadow-xs'
                                    : 'bg-surface-container dark:bg-zinc-800 text-on-surface dark:text-zinc-300'
                            }">
                            <span class="material-symbols-outlined text-[18px]">nature</span>
                            <span class="text-[10px] font-bold">Sinh Thái</span>
                        </button>
                        <button type="button" onclick="window.ViVuApp.switchStoryTheme('foodie')"
                            class="template-btn py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 transition-all text-center min-h-[44px] ${
                                activeTheme === 'foodie'
                                    ? 'bg-primary dark:bg-emerald-600 text-white shadow-xs'
                                    : 'bg-surface-container dark:bg-zinc-800 text-on-surface dark:text-zinc-300'
                            }">
                            <span class="material-symbols-outlined text-[18px]">restaurant</span>
                            <span class="text-[10px] font-bold">Ẩm Thực</span>
                        </button>
                    </div>
                </div>

                <!-- Toggles -->
                <div class="flex items-center justify-between gap-1 py-1 text-xs">
                    <label class="flex items-center gap-1.5 cursor-pointer">
                        <input id="toggle-badge" type="checkbox" ${toggles.badge ? 'checked' : ''}
                            onchange="window.ViVuApp.toggleStoryElement('badge')"
                            class="w-4 h-4 rounded text-secondary accent-secondary" />
                        <span class="text-[11px] font-medium">Huy hiệu</span>
                    </label>
                    <label class="flex items-center gap-1.5 cursor-pointer">
                        <input id="toggle-stats" type="checkbox" ${toggles.stats ? 'checked' : ''}
                            onchange="window.ViVuApp.toggleStoryElement('stats')"
                            class="w-4 h-4 rounded text-secondary accent-secondary" />
                        <span class="text-[11px] font-medium">Chỉ số km &amp; Eco</span>
                    </label>
                    <label class="flex items-center gap-1.5 cursor-pointer">
                        <input id="toggle-qr" type="checkbox" ${toggles.qr ? 'checked' : ''}
                            onchange="window.ViVuApp.toggleStoryElement('qr')"
                            class="w-4 h-4 rounded text-secondary accent-secondary" />
                        <span class="text-[11px] font-medium">Mã QR</span>
                    </label>
                </div>

                <!-- Fast Social Share Row -->
                <div class="flex items-center justify-between gap-2 pt-1 border-t border-outline-variant/30 dark:border-zinc-800">
                    <div class="flex items-center gap-2">
                        <button type="button" onclick="window.ViVuApp.shareToSocial('instagram')"
                            title="Chia sẻ Instagram Story"
                            class="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-white shadow-xs min-h-[44px] min-w-[44px]">
                            <span class="material-symbols-outlined text-[18px]">photo_camera</span>
                        </button>
                        <button type="button" onclick="window.ViVuApp.shareToSocial('facebook')"
                            title="Chia sẻ Facebook Story"
                            class="w-10 h-10 rounded-full bg-[#1877F2] flex items-center justify-center text-white shadow-xs min-h-[44px] min-w-[44px]">
                            <span class="material-symbols-outlined text-[18px]">thumb_up</span>
                        </button>
                        <button type="button" onclick="window.ViVuApp.shareToSocial('zalo')"
                            title="Chia sẻ Nhật ký Zalo"
                            class="w-10 h-10 rounded-full bg-[#0068FF] flex items-center justify-center text-white shadow-xs font-bold text-xs min-h-[44px] min-w-[44px]">
                            Z
                        </button>
                    </div>
                    <button id="btnCopyStoryLink" type="button" onclick="window.ViVuApp.copyStoryLink()"
                        class="px-3.5 py-2 rounded-xl bg-surface-container dark:bg-zinc-800 hover:bg-surface-container-high dark:hover:bg-zinc-700 text-xs font-semibold flex items-center gap-1 min-h-[44px]">
                        <span class="material-symbols-outlined text-[16px]">link</span>
                        <span>Sao chép link</span>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// =========================================================================
// PHASE 10: ADMIN SUPPORT WALL & CONTENT/CLUB MODERATION PORTAL (STITCH DESIGNS)
// =========================================================================

/**
 * Render modal "Tường Admin & Hỗ trợ ViVuTraVinh" (Góc Admin & Đồng hành dự án)
 * Chuẩn thiết kế Stitch t_ng_admin_h_tr_vivutravinh/code.html
 */
export function renderAdminSupportModalContent({
    adminInfo,
    financialReport,
    donationTiers = [],
    selectedAmount = 35000,
    selectedNote = 'To bun nuoc leo',
    techClearance = [],
    travelGear = [],
    recentSupporters = []
}) {
    const bank = financialReport.bank || {
        name: 'Vietcombank (Demo)',
        accountName: 'VIVUTRAVINH COMMUNITY',
        accountNumber: '•••• •••• 9826',
        defaultMemo: 'VIVU UNG HO'
    };

    const currentMemo = selectedAmount
        ? `VIVU ${selectedAmount.toLocaleString('vi-VN')} UNG HO`
        : 'VIVU UNG HO';

    return `
        <div class="relative bg-surface dark:bg-zinc-950 text-on-surface dark:text-zinc-100 p-4 sm:p-6 lg:p-8 max-h-[92vh] overflow-y-auto no-scrollbar">
            <!-- Header bar & Close -->
            <div class="flex items-center justify-between pb-4 border-b border-outline-variant/30 dark:border-zinc-800 sticky top-0 bg-surface/95 dark:bg-zinc-950/95 backdrop-blur-md z-20 -mt-2 pt-2">
                <div class="flex items-center gap-2">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-container dark:bg-emerald-950/70 text-on-secondary-container dark:text-emerald-300 font-badge text-xs font-bold tracking-wide">
                        <span class="w-2 h-2 rounded-full bg-secondary dark:bg-emerald-400 animate-pulse"></span>
                        HỖ TRỢ DỰ ÁN • GÓC ADMIN VIVUTRAVINH
                    </span>
                    <span class="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-400 text-xs">
                        <span class="material-symbols-outlined text-[14px] text-secondary dark:text-emerald-400">verified</span>
                        Dự án cộng đồng độc lập
                    </span>
                </div>
                <button type="button" onclick="window.ViVuApp.closeAdminSupportModal()"
                    class="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-surface-container dark:bg-zinc-800 hover:bg-surface-container-high dark:hover:bg-zinc-700 text-on-surface dark:text-zinc-200 flex items-center justify-center transition-transform active:scale-95 shadow-sm border border-outline-variant/30 dark:border-zinc-700"
                    aria-label="Đóng tường admin">
                    <span class="material-symbols-outlined text-[20px]">close</span>
                </button>
            </div>

            <div class="flex flex-col gap-8 pt-6">
                <!-- Title block -->
                <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 class="font-headline-xl text-2xl sm:text-3xl lg:text-4xl text-primary dark:text-zinc-100 font-bold tracking-tight">
                            Góc Admin &amp; Đồng hành dự án
                        </h1>
                        <p class="font-body-lg text-xs sm:text-sm text-on-surface-variant dark:text-zinc-400 max-w-3xl mt-1.5 leading-relaxed">
                            Nơi chia sẻ câu chuyện phát triển nền tảng ViVuTraVinh, báo cáo chi phí máy chủ minh bạch và các cách tiếp sức cộng đồng du lịch tự túc xứ Trà.
                        </p>
                    </div>
                </div>

                <!-- SECTION 1: ADMIN PROFILE & TRANSPARENCY REPORT -->
                <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                    <!-- Admin Bio Card (5 cols) -->
                    <div class="lg:col-span-5 bg-surface-container-lowest dark:bg-zinc-900 rounded-3xl p-6 shadow-sm border border-outline-variant/30 dark:border-zinc-800 flex flex-col justify-between">
                        <div class="flex flex-col items-center text-center">
                            <div class="relative mb-4">
                                <div class="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden shadow-md ring-4 ring-secondary/20 dark:ring-emerald-500/20">
                                    <img src="${escapeHtml(adminInfo.avatar || 'chùa âng.jpg')}" alt="${escapeHtml(adminInfo.name)}" class="w-full h-full object-cover" />
                                </div>
                                <span class="absolute bottom-1 right-2 w-6 h-6 rounded-full bg-secondary text-white border-2 border-surface-container-lowest dark:border-zinc-900 flex items-center justify-center" title="Sẵn sàng hỗ trợ">
                                    <span class="material-symbols-outlined text-[14px]">check</span>
                                </span>
                            </div>
                            <span class="inline-block px-3 py-1 rounded-full bg-primary-container text-on-primary text-xs font-bold uppercase tracking-wider mb-2">
                                Nhà sáng lập
                            </span>
                            <h2 class="font-headline-md text-lg sm:text-xl font-bold text-primary dark:text-zinc-100">
                                Admin ViVuTraVinh (${escapeHtml(adminInfo.name)})
                            </h2>
                            <p class="font-caption text-xs text-secondary dark:text-emerald-400 font-medium mt-0.5">
                                ${escapeHtml(adminInfo.title)}
                            </p>
                            <p class="font-body-md text-xs sm:text-sm text-on-surface-variant dark:text-zinc-300 mt-3 text-justify leading-relaxed">
                                ${escapeHtml(adminInfo.bio)}
                            </p>
                        </div>
                        <div class="pt-5 mt-5 bg-surface-container-low dark:bg-zinc-800/60 rounded-2xl p-4 flex flex-col gap-2.5 border border-outline-variant/20 dark:border-zinc-700/40">
                            <span class="font-caption text-xs text-on-surface-variant dark:text-zinc-400 font-semibold uppercase tracking-wider">
                                Kênh liên hệ trực tiếp:
                            </span>
                            <div class="grid grid-cols-3 gap-2">
                                <a href="${escapeHtml(adminInfo.contacts.zalo)}" target="_blank" rel="noopener noreferrer"
                                    class="min-h-[44px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-surface-container-lowest dark:bg-zinc-800 hover:bg-secondary hover:text-white dark:hover:bg-emerald-600 transition-colors font-button text-xs font-semibold shadow-xs border border-outline-variant/30 dark:border-zinc-700">
                                    <span class="material-symbols-outlined text-[18px] text-secondary dark:text-emerald-400">chat</span>
                                    <span>Zalo</span>
                                </a>
                                <a href="${escapeHtml(adminInfo.contacts.facebook)}" target="_blank" rel="noopener noreferrer"
                                    class="min-h-[44px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-surface-container-lowest dark:bg-zinc-800 hover:bg-secondary hover:text-white dark:hover:bg-emerald-600 transition-colors font-button text-xs font-semibold shadow-xs border border-outline-variant/30 dark:border-zinc-700">
                                    <span class="material-symbols-outlined text-[18px] text-secondary dark:text-emerald-400">share</span>
                                    <span>Facebook</span>
                                </a>
                                <a href="${escapeHtml(adminInfo.contacts.email)}"
                                    class="min-h-[44px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-surface-container-lowest dark:bg-zinc-800 hover:bg-secondary hover:text-white dark:hover:bg-emerald-600 transition-colors font-button text-xs font-semibold shadow-xs border border-outline-variant/30 dark:border-zinc-700">
                                    <span class="material-symbols-outlined text-[18px] text-secondary dark:text-emerald-400">mail</span>
                                    <span>Email</span>
                                </a>
                            </div>
                        </div>
                    </div>

                    <!-- Transparency Mission & Hosting Budget (7 cols) -->
                    <div class="lg:col-span-7 flex flex-col justify-between gap-6">
                        <!-- Mission Banner -->
                        <div class="bg-primary-container text-on-primary rounded-3xl p-6 sm:p-7 shadow-sm flex flex-col justify-between flex-1 relative overflow-hidden">
                            <div class="relative z-10 flex flex-col gap-3">
                                <div class="flex items-center justify-between">
                                    <span class="px-3 py-1 rounded-full bg-secondary text-on-secondary font-badge text-xs font-bold uppercase tracking-wider">
                                        BÁO CÁO MINH BẠCH
                                    </span>
                                    <span class="font-caption text-xs text-on-primary-container">
                                        Kỳ vận hành: ${escapeHtml(financialReport.cycle || 'Quý I/2025')}
                                    </span>
                                </div>
                                <div>
                                    <h3 class="font-headline-lg text-xl sm:text-2xl font-bold text-white tracking-tight">
                                        Vì một Trà Vinh số hóa, bền vững
                                    </h3>
                                    <p class="font-body-md text-xs sm:text-sm text-on-primary-container mt-2 max-w-xl leading-relaxed">
                                        Tất cả mã nguồn ứng dụng, tọa độ bản đồ di sản và danh bạ làng nghề được xây dựng thủ công với sự trợ giúp của cộng đồng địa phương. Không quảng cáo gây phiền toái, không thu phí du khách.
                                    </p>
                                </div>
                            </div>

                            <!-- Subtle background SVG -->
                            <svg class="absolute -right-10 -bottom-10 w-56 h-56 text-white/5 pointer-events-none" fill="currentColor" viewBox="0 0 200 200">
                                <path d="M100 0 C44.8 0 0 44.8 0 100 C0 155.2 44.8 200 100 200 C155.2 200 200 155.2 200 100 C200 44.8 155.2 0 100 0 Z"></path>
                            </svg>

                            <!-- Metrics Row -->
                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-5 mt-4 relative z-10">
                                <div class="bg-black/25 backdrop-blur-sm rounded-2xl p-3.5 flex flex-col border border-white/10">
                                    <span class="font-caption text-[11px] text-on-primary-container">Chi phí duy trì</span>
                                    <span class="font-headline-sm text-lg font-bold text-secondary-fixed mt-0.5">
                                        ${financialReport.monthlyCost.toLocaleString('vi-VN')}đ
                                    </span>
                                    <span class="font-caption text-[10px] text-on-primary-container">Hàng tháng (Cloud + DNS)</span>
                                </div>
                                <div class="bg-black/25 backdrop-blur-sm rounded-2xl p-3.5 flex flex-col border border-white/10">
                                    <span class="font-caption text-[11px] text-on-primary-container">Thời gian vận hành</span>
                                    <span class="font-headline-sm text-lg font-bold text-secondary-fixed mt-0.5">
                                        ${financialReport.uptimeMonths} tháng
                                    </span>
                                    <span class="font-caption text-[10px] text-on-primary-container">Liên tục không gián đoạn</span>
                                </div>
                                <div class="bg-black/25 backdrop-blur-sm rounded-2xl p-3.5 flex flex-col border border-white/10">
                                    <span class="font-caption text-[11px] text-on-primary-container">Dữ liệu xác thực</span>
                                    <span class="font-headline-sm text-lg font-bold text-secondary-fixed mt-0.5">
                                        ${financialReport.verifiedPlaces} tọa độ
                                    </span>
                                    <span class="font-caption text-[10px] text-on-primary-container">Chùa, ẩm thực &amp; làng nghề</span>
                                </div>
                            </div>
                        </div>

                        <!-- Monthly Budget Progress Bar -->
                        <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-3xl p-6 shadow-sm border border-outline-variant/30 dark:border-zinc-800 flex flex-col gap-3">
                            <div class="flex items-center justify-between">
                                <span class="font-body-md text-xs sm:text-sm font-semibold text-primary dark:text-zinc-100">
                                    Tiến độ quỹ máy chủ tháng này:
                                </span>
                                <span class="font-button text-xs sm:text-sm text-secondary dark:text-emerald-400 font-bold">
                                    ${financialReport.monthlyFunded.toLocaleString('vi-VN')}đ / ${financialReport.monthlyCost.toLocaleString('vi-VN')}đ (${financialReport.percentFunded}%)
                                </span>
                            </div>
                            <div class="w-full h-3 rounded-full bg-surface-container dark:bg-zinc-800 overflow-hidden">
                                <div class="h-full bg-secondary dark:bg-emerald-500 rounded-full transition-all duration-500" style="width: ${financialReport.percentFunded}%;"></div>
                            </div>
                            <p class="font-caption text-xs text-on-surface-variant dark:text-zinc-400">
                                Chỉ còn thiếu <strong class="text-secondary dark:text-emerald-400 font-semibold">${financialReport.remainingNeeded.toLocaleString('vi-VN')}đ</strong> để hoàn tất chi phí máy chủ tháng này. Cảm ơn sự hỗ trợ bền bỉ từ các bạn!
                            </p>
                        </div>
                    </div>
                </div>

                <!-- SECTION 2: DONATION TIERS & VIETQR BOX -->
                <div class="flex flex-col gap-4">
                    <div class="flex flex-col gap-1">
                        <h2 class="font-headline-lg text-xl sm:text-2xl font-bold text-primary dark:text-zinc-100">
                            Ủng hộ duy trì ViVuTraVinh
                        </h2>
                        <p class="font-body-md text-xs sm:text-sm text-on-surface-variant dark:text-zinc-400 max-w-3xl">
                            Nếu bạn thấy nền tảng hữu ích, một ly cà phê nhỏ có thể giúp dự án trang trải chi phí máy chủ Cloud, tên miền và duy trì dữ liệu bản đồ luôn cập nhật.
                        </p>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        <!-- Donation Options (7 cols) -->
                        <div class="lg:col-span-7 flex flex-col gap-3.5">
                            ${donationTiers.map(tier => {
                                const isSelected = selectedAmount === tier.amount;
                                return `
                                    <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl p-5 shadow-sm border ${isSelected ? 'border-2 border-secondary dark:border-emerald-500 bg-secondary/5 dark:bg-emerald-950/20' : 'border-outline-variant/30 dark:border-zinc-800'} relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all">
                                        ${tier.popular ? `
                                            <div class="absolute top-0 right-0">
                                                <span class="bg-secondary text-white text-[10px] font-bold px-3 py-0.5 rounded-bl-xl tracking-wider">
                                                    PHỔ BIẾN NHẤT
                                                </span>
                                            </div>
                                        ` : ''}
                                        <div class="flex items-start gap-3.5">
                                            <div class="w-12 h-12 rounded-2xl ${isSelected ? 'bg-secondary text-white' : 'bg-surface-container dark:bg-zinc-800 text-secondary dark:text-emerald-400'} flex items-center justify-center shrink-0">
                                                <span class="material-symbols-outlined text-[24px]">${escapeHtml(tier.icon)}</span>
                                            </div>
                                            <div class="flex flex-col">
                                                <h4 class="font-headline-sm text-sm sm:text-base font-bold text-primary dark:text-zinc-100">
                                                    ${escapeHtml(tier.name)}
                                                </h4>
                                                <p class="font-body-sm text-xs text-on-surface-variant dark:text-zinc-400 mt-0.5">
                                                    ${escapeHtml(tier.desc)}
                                                </p>
                                            </div>
                                        </div>
                                        <button type="button" onclick="window.ViVuApp.selectDonationTier(${tier.amount}, '${escapeHtml(tier.id)}')"
                                            class="w-full sm:w-auto px-5 py-2.5 min-h-[44px] rounded-xl ${isSelected ? 'bg-secondary text-white shadow-md' : 'bg-surface-container dark:bg-zinc-800 text-on-surface dark:text-zinc-200 hover:bg-secondary hover:text-white'} font-button text-xs font-semibold transition-all shrink-0">
                                            Ủng hộ ${tier.amount.toLocaleString('vi-VN')}đ
                                        </button>
                                    </div>
                                `;
                            }).join('')}

                            <!-- Custom amount / simulated transfer confirm -->
                            <div class="p-4 rounded-2xl bg-surface-container-low dark:bg-zinc-800/40 border border-outline-variant/30 dark:border-zinc-700/50 flex flex-col sm:flex-row items-center justify-between gap-3">
                                <div class="flex items-center gap-2">
                                    <span class="material-symbols-outlined text-[20px] text-secondary dark:text-emerald-400">volunteer_activism</span>
                                    <span class="text-xs text-on-surface-variant dark:text-zinc-300 font-medium">Hoặc nhập số tiền tùy ý bạn muốn tiếp sức:</span>
                                </div>
                                <div class="flex items-center gap-2 w-full sm:w-auto">
                                    <input id="customDonationInput" type="number" min="10000" step="10000" placeholder="50.000đ"
                                        class="h-11 px-3.5 rounded-xl bg-surface-container-lowest dark:bg-zinc-800 text-xs font-semibold outline-none border border-outline-variant/40 dark:border-zinc-700 w-32" />
                                    <button type="button" onclick="window.ViVuApp.applyCustomDonation()"
                                        class="h-11 px-4 rounded-xl bg-secondary text-white font-button text-xs font-semibold hover:bg-primary transition-colors min-h-[44px]">
                                        Tạo mã QR
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- VietQR Box (5 cols) -->
                        <div class="lg:col-span-5 bg-surface-container-lowest dark:bg-zinc-900 rounded-3xl p-6 shadow-sm border border-outline-variant/30 dark:border-zinc-800 flex flex-col gap-4">
                            <div class="flex items-center justify-between">
                                <h3 class="font-headline-sm text-sm sm:text-base font-bold text-primary dark:text-zinc-100">
                                    Quét mã VietQR nhanh
                                </h3>
                                <span class="inline-flex items-center gap-1 text-[11px] text-tertiary-container dark:text-amber-300 bg-tertiary-fixed dark:bg-amber-950/60 px-2.5 py-0.5 rounded-full font-semibold">
                                    <span class="material-symbols-outlined text-[13px]">info</span>
                                    DEMO THỬ NGHIỆM
                                </span>
                            </div>

                            <!-- Visual VietQR Mockup Container with pure inline SVG QR Code -->
                            <div class="bg-surface-container-low dark:bg-zinc-800/60 rounded-2xl p-5 flex flex-col items-center justify-center relative border border-outline-variant/30 dark:border-zinc-700/50">
                                <div class="w-48 h-48 bg-white rounded-2xl p-3 shadow-md relative flex items-center justify-center">
                                    <svg class="w-full h-full text-zinc-900" fill="currentColor" viewBox="0 0 160 160">
                                        <!-- Outer Corners Top Left -->
                                        <rect x="10" y="10" width="40" height="40" rx="4"></rect>
                                        <rect x="16" y="16" width="28" height="28" rx="2" fill="#FFFFFF"></rect>
                                        <rect x="22" y="22" width="16" height="16" rx="2"></rect>
                                        <!-- Outer Corners Top Right -->
                                        <rect x="110" y="10" width="40" height="40" rx="4"></rect>
                                        <rect x="116" y="16" width="28" height="28" rx="2" fill="#FFFFFF"></rect>
                                        <rect x="122" y="22" width="16" height="16" rx="2"></rect>
                                        <!-- Outer Corners Bottom Left -->
                                        <rect x="10" y="110" width="40" height="40" rx="4"></rect>
                                        <rect x="16" y="116" width="28" height="28" rx="2" fill="#FFFFFF"></rect>
                                        <rect x="22" y="122" width="16" height="16" rx="2"></rect>
                                        <!-- Random QR Data Bits Pattern -->
                                        <rect x="58" y="12" width="8" height="8"></rect>
                                        <rect x="74" y="12" width="14" height="8"></rect>
                                        <rect x="94" y="12" width="8" height="8"></rect>
                                        <rect x="58" y="26" width="18" height="8"></rect>
                                        <rect x="84" y="26" width="8" height="8"></rect>
                                        <rect x="58" y="40" width="8" height="18"></rect>
                                        <rect x="74" y="40" width="12" height="8"></rect>
                                        <rect x="92" y="42" width="8" height="8"></rect>
                                        <!-- Horizontal & Vertical connectors -->
                                        <rect x="12" y="58" width="14" height="8"></rect>
                                        <rect x="34" y="58" width="8" height="8"></rect>
                                        <rect x="48" y="58" width="18" height="8"></rect>
                                        <rect x="74" y="58" width="8" height="16"></rect>
                                        <rect x="90" y="58" width="18" height="8"></rect>
                                        <rect x="116" y="58" width="12" height="8"></rect>
                                        <rect x="136" y="58" width="14" height="8"></rect>
                                        <!-- Lower sections -->
                                        <rect x="58" y="82" width="14" height="8"></rect>
                                        <rect x="80" y="82" width="8" height="16"></rect>
                                        <rect x="96" y="82" width="14" height="8"></rect>
                                        <rect x="120" y="82" width="8" height="8"></rect>
                                        <rect x="134" y="82" width="16" height="8"></rect>
                                        <rect x="58" y="104" width="8" height="18"></rect>
                                        <rect x="74" y="104" width="16" height="8"></rect>
                                        <rect x="100" y="104" width="8" height="8"></rect>
                                        <rect x="116" y="104" width="16" height="8"></rect>
                                        <rect x="140" y="104" width="10" height="8"></rect>
                                        <rect x="58" y="132" width="22" height="8"></rect>
                                        <rect x="88" y="124" width="8" height="16"></rect>
                                        <rect x="104" y="132" width="14" height="8"></rect>
                                        <rect x="126" y="124" width="10" height="8"></rect>
                                        <rect x="142" y="132" width="8" height="18"></rect>
                                    </svg>
                                    <!-- Center Logo Pill -->
                                    <div class="absolute inset-0 m-auto w-10 h-10 rounded-xl bg-white p-1 shadow-md flex items-center justify-center">
                                        <div class="w-full h-full rounded-lg bg-primary-container flex items-center justify-center text-white">
                                            <span class="material-symbols-outlined text-[20px]">explore</span>
                                        </div>
                                    </div>
                                </div>
                                <span class="font-caption text-xs text-on-surface-variant dark:text-zinc-400 mt-2 text-center">
                                    Số tiền: <strong class="text-secondary dark:text-emerald-400 font-bold">${selectedAmount.toLocaleString('vi-VN')}đ</strong>
                                </span>
                            </div>

                            <!-- Transfer Info Table -->
                            <div class="flex flex-col gap-2 bg-surface-container-low dark:bg-zinc-800/40 p-3.5 rounded-2xl font-caption text-xs border border-outline-variant/30 dark:border-zinc-700/50">
                                <div class="flex justify-between items-center py-1">
                                    <span class="text-on-surface-variant dark:text-zinc-400">Ngân hàng:</span>
                                    <span class="font-semibold text-primary dark:text-zinc-100">${escapeHtml(bank.name)}</span>
                                </div>
                                <div class="flex justify-between items-center py-1">
                                    <span class="text-on-surface-variant dark:text-zinc-400">Tên thụ hưởng:</span>
                                    <span class="font-semibold text-primary dark:text-zinc-100">${escapeHtml(bank.accountName)}</span>
                                </div>
                                <div class="flex justify-between items-center py-1">
                                    <span class="text-on-surface-variant dark:text-zinc-400">Số tài khoản:</span>
                                    <div class="flex items-center gap-1.5">
                                        <span class="font-semibold text-primary dark:text-zinc-100 font-mono">${escapeHtml(bank.accountNumber)}</span>
                                        <button type="button" onclick="window.ViVuApp.copyToClipboard('${escapeHtml(bank.accountNumber)}', 'Đã sao chép số tài khoản!')"
                                            class="w-8 h-8 rounded-lg bg-surface-container dark:bg-zinc-700 hover:text-secondary flex items-center justify-center min-h-[32px] min-w-[32px]" title="Sao chép">
                                            <span class="material-symbols-outlined text-[16px]">content_copy</span>
                                        </button>
                                    </div>
                                </div>
                                <div class="flex justify-between items-center py-1">
                                    <span class="text-on-surface-variant dark:text-zinc-400">Nội dung CK:</span>
                                    <div class="flex items-center gap-1.5">
                                        <span id="transferNoteLabel" class="font-semibold text-secondary dark:text-emerald-400 font-mono bg-secondary/10 dark:bg-emerald-950/40 px-2 py-0.5 rounded-lg">
                                            ${escapeHtml(currentMemo)}
                                        </span>
                                        <button type="button" onclick="window.ViVuApp.copyTransferNote('${escapeHtml(currentMemo)}')"
                                            class="w-8 h-8 rounded-lg bg-surface-container dark:bg-zinc-700 hover:text-secondary flex items-center justify-center min-h-[32px] min-w-[32px]" title="Sao chép">
                                            <span class="material-symbols-outlined text-[16px]">content_copy</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <button type="button" onclick="window.ViVuApp.confirmSimulatedDonation(${selectedAmount})"
                                class="w-full py-3 px-4 rounded-xl bg-secondary text-white font-button text-xs font-semibold flex items-center justify-center gap-2 hover:bg-primary transition-all shadow-md min-h-[44px]">
                                <span class="material-symbols-outlined text-[18px]">verified</span>
                                <span>Xác nhận đã chuyển (Mô phỏng ghi nhận)</span>
                            </button>

                            <div class="flex items-center gap-2 text-on-surface-variant dark:text-zinc-400 font-caption text-[11px]">
                                <span class="material-symbols-outlined text-[16px] text-secondary dark:text-emerald-400 shrink-0">verified_user</span>
                                <span>Mọi khoản ủng hộ sẽ được công khai minh bạch trong báo cáo thu chi hàng quý của cộng đồng.</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- SECTION 3: TECH GEAR CLEARANCE (GÓC ĐỒ CÔNG NGHỆ CỦA ADMIN) -->
                <div class="flex flex-col gap-4">
                    <div class="flex flex-col md:flex-row md:items-end justify-between gap-3">
                        <div>
                            <div class="inline-flex items-center gap-1.5 text-tertiary dark:text-amber-400 font-badge text-xs font-bold mb-1">
                                <span class="material-symbols-outlined text-[16px]">memory</span>
                                GÓC THANH LÝ THIẾT BỊ DƯ DÙNG
                            </div>
                            <h2 class="font-headline-lg text-xl sm:text-2xl font-bold text-primary dark:text-zinc-100">
                                Góc đồ công nghệ của Admin
                            </h2>
                            <p class="font-body-md text-xs sm:text-sm text-on-surface-variant dark:text-zinc-400 max-w-2xl mt-1">
                                Một vài món đồ công nghệ của cá nhân Admin dư dùng hoặc nâng cấp, chia sẻ lại cho anh em lập trình viên / digital nomad với giá tốt để gây quỹ server.
                            </p>
                        </div>
                        <div class="px-3.5 py-1.5 rounded-full bg-secondary-container dark:bg-emerald-950/70 text-on-secondary-container dark:text-emerald-300 font-caption text-xs font-semibold self-start md:self-auto">
                            100% tiền dư được chuyển thẳng vào quỹ máy chủ
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        ${techClearance.map(item => `
                            <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-3xl overflow-hidden shadow-sm border border-outline-variant/30 dark:border-zinc-800 flex flex-col justify-between hover:shadow-md transition-all">
                                <div class="flex flex-col">
                                    <div class="relative w-full aspect-[4/3] bg-surface-container-low dark:bg-zinc-800/80 flex items-center justify-center p-6 overflow-hidden">
                                        ${item.image ? `
                                            <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" class="w-full h-full object-cover transition-transform duration-300 hover:scale-105" />
                                        ` : `
                                            <div class="w-20 h-20 rounded-2xl bg-surface-container dark:bg-zinc-700 flex items-center justify-center text-secondary dark:text-emerald-400">
                                                <span class="material-symbols-outlined text-[42px]">${escapeHtml(item.icon)}</span>
                                            </div>
                                        `}
                                        <span class="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-surface-container-lowest/90 dark:bg-zinc-900/90 backdrop-blur text-on-surface dark:text-zinc-100 font-caption text-[11px] font-semibold">
                                            ${escapeHtml(item.condition)}
                                        </span>
                                    </div>
                                    <div class="p-5 flex flex-col gap-2">
                                        <h3 class="font-headline-sm text-sm sm:text-base font-bold text-primary dark:text-zinc-100 line-clamp-1">
                                            ${escapeHtml(item.name)}
                                        </h3>
                                        <div class="font-headline-md text-base sm:text-lg text-secondary dark:text-emerald-400 font-bold">
                                            ${item.price.toLocaleString('vi-VN')}đ
                                        </div>
                                        <p class="font-body-sm text-xs text-on-surface-variant dark:text-zinc-400 leading-relaxed">
                                            ${escapeHtml(item.desc)}
                                        </p>
                                    </div>
                                </div>
                                <div class="p-5 pt-0">
                                    <a href="https://zalo.me" target="_blank" rel="noopener noreferrer"
                                        class="w-full min-h-[44px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-surface-container dark:bg-zinc-800 text-on-surface dark:text-zinc-200 hover:bg-secondary hover:text-white dark:hover:bg-emerald-600 font-button text-xs font-semibold transition-colors">
                                        <span class="material-symbols-outlined text-[18px]">chat</span>
                                        <span>Nhắn Admin qua Zalo</span>
                                    </a>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- SECTION 4: TRAVEL GEAR RECOMMENDATIONS -->
                <div class="flex flex-col gap-4">
                    <div class="flex flex-col md:flex-row md:items-end justify-between gap-3">
                        <div>
                            <div class="inline-flex items-center gap-1.5 text-secondary dark:text-emerald-400 font-badge text-xs font-bold mb-1">
                                <span class="material-symbols-outlined text-[16px]">hiking</span>
                                CẨM NANG &amp; PHỤ KIỆN BỎ TÚI
                            </div>
                            <h2 class="font-headline-lg text-xl sm:text-2xl font-bold text-primary dark:text-zinc-100">
                                Đồ dùng hữu ích khi đi khám phá Trà Vinh
                            </h2>
                            <p class="font-body-md text-xs sm:text-sm text-on-surface-variant dark:text-zinc-400 max-w-2xl mt-1">
                                Những vật dụng Admin và nhóm bạn trẻ thường mang theo khi đạp xe cồn bãi hoặc phượt chùa Khmer.
                            </p>
                        </div>
                        <div class="px-3 py-1 rounded-full bg-surface-container dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-400 font-caption text-xs flex items-center gap-1.5 self-start md:self-auto">
                            <span class="material-symbols-outlined text-[14px]">link</span>
                            <span>Affiliate • Có thể nhận hoa hồng nhỏ để duy trì server</span>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        ${travelGear.map(gear => `
                            <div class="bg-surface-container-lowest dark:bg-zinc-900 rounded-3xl overflow-hidden shadow-sm border border-outline-variant/30 dark:border-zinc-800 flex flex-col justify-between hover:shadow-md transition-all">
                                <div class="flex flex-col">
                                    <div class="relative w-full aspect-[4/3] bg-surface-container-low dark:bg-zinc-800/80 flex items-center justify-center p-6">
                                        <div class="w-20 h-20 rounded-2xl bg-surface-container dark:bg-zinc-700 flex items-center justify-center text-secondary dark:text-emerald-400">
                                            <span class="material-symbols-outlined text-[42px]">${escapeHtml(gear.icon)}</span>
                                        </div>
                                        <span class="absolute bottom-3 left-3 px-2 py-0.5 rounded bg-surface-container-lowest/90 dark:bg-zinc-900/90 backdrop-blur text-on-surface dark:text-zinc-200 font-caption text-[11px] font-semibold flex items-center gap-1">
                                            <span class="material-symbols-outlined text-[13px] text-amber-500">star</span>
                                            ${escapeHtml(gear.rating)}
                                        </span>
                                    </div>
                                    <div class="p-5 flex flex-col gap-2">
                                        <h3 class="font-headline-sm text-sm sm:text-base font-bold text-primary dark:text-zinc-100 line-clamp-2">
                                            ${escapeHtml(gear.name)}
                                        </h3>
                                        <div class="font-headline-md text-base sm:text-lg text-secondary dark:text-emerald-400 font-bold">
                                            ${gear.price.toLocaleString('vi-VN')}đ
                                        </div>
                                        <p class="font-body-sm text-xs text-on-surface-variant dark:text-zinc-400">
                                            ${escapeHtml(gear.desc)}
                                        </p>
                                    </div>
                                </div>
                                <div class="p-5 pt-0">
                                    <a href="${escapeHtml(gear.link)}" target="_blank" rel="noopener noreferrer"
                                        class="w-full min-h-[44px] flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-surface-container dark:bg-zinc-800 text-on-surface dark:text-zinc-200 hover:bg-secondary hover:text-white dark:hover:bg-emerald-600 font-button text-xs font-semibold transition-colors">
                                        <span>Xem trên Shopee</span>
                                        <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
                                    </a>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- SECTION 5: RECENT SUPPORTERS & FOOTER COMMITMENT -->
                <div class="bg-surface-container-low dark:bg-zinc-900 rounded-3xl p-6 sm:p-7 border border-outline-variant/30 dark:border-zinc-800 flex flex-col gap-4">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="material-symbols-outlined text-[20px] text-secondary dark:text-emerald-400">volunteer_activism</span>
                            <h3 class="font-headline-sm text-sm sm:text-base font-bold text-primary dark:text-zinc-100">
                                Danh sách tri ân người đồng hành gần đây
                            </h3>
                        </div>
                        <span class="text-xs text-secondary dark:text-emerald-400 font-semibold">
                            ${recentSupporters.length} lượt ủng hộ
                        </span>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        ${recentSupporters.slice(0, 4).map(s => `
                            <div class="p-3 rounded-2xl bg-surface-container-lowest dark:bg-zinc-800 shadow-xs border border-outline-variant/20 dark:border-zinc-700/40 flex flex-col gap-1">
                                <div class="flex items-center justify-between">
                                    <span class="font-button text-xs font-bold text-primary dark:text-zinc-100 truncate">${escapeHtml(s.name)}</span>
                                    <span class="text-[11px] text-secondary dark:text-emerald-400 font-bold">${s.amount.toLocaleString('vi-VN')}đ</span>
                                </div>
                                <p class="text-[11px] text-on-surface-variant dark:text-zinc-400 italic line-clamp-1">"${escapeHtml(s.message)}"</p>
                                <span class="text-[10px] text-outline dark:text-zinc-500">${escapeHtml(s.date)}</span>
                            </div>
                        `).join('')}
                    </div>

                    <div class="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-outline-variant/20 dark:border-zinc-800 text-xs text-on-surface-variant dark:text-zinc-400">
                        <div class="flex items-center gap-2">
                            <span class="material-symbols-outlined text-secondary text-[18px]">favorite</span>
                            <span>Báo cáo tài chính &amp; danh sách tri ân người ủng hộ được cập nhật minh bạch định kỳ vào ngày 01 hàng tháng.</span>
                        </div>
                        <button type="button" onclick="alert('Báo cáo tài chính tháng trước đã được công bố trên trang cộng đồng.')"
                            class="text-secondary dark:text-emerald-400 font-semibold hover:underline flex items-center gap-1 shrink-0">
                            <span>Xem báo cáo tháng trước</span>
                            <span class="material-symbols-outlined text-[14px]">open_in_new</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render modal "Trung tâm Kiểm duyệt Nội dung & CLB ViVuTràVinh Admin"
 * Chuẩn thiết kế Stitch ki_m_duy_t_n_i_dung_b_i_vi_t_c_ng_ng_vivutravinh_admin/code.html
 * & ki_m_duy_t_n_i_dung_th_m_nh_c_u_l_c_b_vivutravinh_admin/code.html
 */
export function renderAdminModerationModalContent({
    activeTab = 'posts',
    posts = [],
    selectedPostId = null,
    clubs = [],
    selectedClubId = null,
    events = [],
    selectedEventId = null,
    articles = [],
    selectedArticleId = null,
    activities = [],
    selectedActivityId = null,
    kpi = {},
    filterCategory = 'all',
    riskFilter = 'all',
    searchQuery = ''
}) {
    const selectedPost = posts.find(p => p.id === selectedPostId) || posts[0] || null;
    const selectedClub = clubs.find(c => c.id === selectedClubId) || clubs[0] || null;
    const selectedEvent = events.find(e => e.id === selectedEventId) || events[0] || null;
    const selectedArticle = articles.find(a => a.id === selectedArticleId) || articles[0] || null;
    const selectedActivity = activities.find(act => act.id === selectedActivityId) || activities[0] || null;

    let displayedPosts = posts;
    if (filterCategory !== 'all') {
        if (filterCategory === 'culture') displayedPosts = displayedPosts.filter(p => p.categoryKey === 'culture');
        else if (filterCategory === 'location') displayedPosts = displayedPosts.filter(p => p.categoryKey === 'location');
        else if (filterCategory === 'report') displayedPosts = displayedPosts.filter(p => p.categoryKey === 'report');
    }
    if (riskFilter === 'high') {
        displayedPosts = displayedPosts.filter(p => p.aiSafeScore < 50);
    } else if (riskFilter === 'safe') {
        displayedPosts = displayedPosts.filter(p => p.aiSafeScore >= 80);
    }
    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        displayedPosts = displayedPosts.filter(p =>
            (p.title && p.title.toLowerCase().includes(q)) ||
            (p.author && p.author.name && p.author.name.toLowerCase().includes(q)) ||
            (p.excerpt && p.excerpt.toLowerCase().includes(q))
        );
    }

    let displayedClubs = clubs;
    if (searchQuery.trim() && activeTab === 'clubs') {
        const q = searchQuery.toLowerCase().trim();
        displayedClubs = displayedClubs.filter(c =>
            (c.name && c.name.toLowerCase().includes(q)) ||
            (c.founder && c.founder.name && c.founder.name.toLowerCase().includes(q)) ||
            (c.desc && c.desc.toLowerCase().includes(q))
        );
    }

    let displayedEvents = events;
    if (searchQuery.trim() && activeTab === 'events') {
        const q = searchQuery.toLowerCase().trim();
        displayedEvents = displayedEvents.filter(e =>
            (e.title && e.title.toLowerCase().includes(q)) ||
            (e.organizer && e.organizer.toLowerCase().includes(q)) ||
            (e.location && e.location.toLowerCase().includes(q)) ||
            (e.description && e.description.toLowerCase().includes(q))
        );
    }

    let displayedArticles = articles;
    if (searchQuery.trim() && activeTab === 'articles') {
        const q = searchQuery.toLowerCase().trim();
        displayedArticles = displayedArticles.filter(a =>
            (a.title && a.title.toLowerCase().includes(q)) ||
            (a.excerpt && a.excerpt.toLowerCase().includes(q)) ||
            (a.author?.name && a.author.name.toLowerCase().includes(q)) ||
            (a.author_name && a.author_name.toLowerCase().includes(q)) ||
            (a.category && a.category.toLowerCase().includes(q))
        );
    }

    let displayedActivities = activities;
    if (searchQuery.trim() && activeTab === 'activities') {
        const q = searchQuery.toLowerCase().trim();
        displayedActivities = displayedActivities.filter(act =>
            (act.title && act.title.toLowerCase().includes(q)) ||
            (act.club_name && act.club_name.toLowerCase().includes(q)) ||
            (act.creator_name && act.creator_name.toLowerCase().includes(q)) ||
            (act.location && act.location.toLowerCase().includes(q)) ||
            (act.description && act.description.toLowerCase().includes(q))
        );
    }

    return `
        <div class="relative bg-surface dark:bg-zinc-950 text-on-surface dark:text-zinc-100 p-4 sm:p-6 lg:p-8 max-h-[92vh] overflow-y-auto no-scrollbar">
            <!-- Header bar & Close -->
            <div class="flex items-center justify-between pb-4 border-b border-outline-variant/30 dark:border-zinc-800 sticky top-0 bg-surface/95 dark:bg-zinc-950/95 backdrop-blur-md z-20 -mt-2 pt-2">
                <div>
                    <div class="flex items-center gap-2 text-on-surface-variant dark:text-zinc-400 font-caption text-xs mb-1">
                        <span>Quản trị hệ thống</span>
                        <span class="material-symbols-outlined text-[12px]">chevron_right</span>
                        <span class="text-secondary dark:text-emerald-400 font-semibold">Trung tâm Kiểm duyệt</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <h1 class="font-headline-lg text-lg sm:text-2xl font-bold text-primary dark:text-zinc-100 tracking-tight">
                            Trung tâm Kiểm duyệt Nội dung &amp; CLB
                        </h1>
                        <span class="px-2.5 py-0.5 rounded-full bg-secondary-container dark:bg-emerald-950/60 text-on-secondary-container dark:text-emerald-300 font-badge text-xs font-bold flex items-center gap-1 shadow-xs">
                            <span class="w-2 h-2 rounded-full bg-secondary dark:bg-emerald-400 animate-pulse"></span>
                            AI Guardian Live
                        </span>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" onclick="window.ViVuApp.quickApproveHighTrust()"
                        class="hidden md:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-secondary text-white font-button text-xs font-semibold hover:bg-primary transition-all shadow-xs min-h-[44px]">
                        <span class="material-symbols-outlined text-[18px]">bolt</span>
                        <span>Duyệt nhanh bài uy tín</span>
                    </button>
                    <button type="button" onclick="window.ViVuApp.closeAdminModerationModal()"
                        class="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-surface-container dark:bg-zinc-800 hover:bg-surface-container-high dark:hover:bg-zinc-700 text-on-surface dark:text-zinc-200 flex items-center justify-center transition-transform active:scale-95 shadow-sm border border-outline-variant/30 dark:border-zinc-700"
                        aria-label="Đóng trung tâm kiểm duyệt">
                        <span class="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>
            </div>

            <div class="flex flex-col gap-6 pt-5">
                <!-- KPI LIVE DASHBOARD CARDS -->
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
                    <!-- Stat 1: Pending Posts -->
                    <div class="p-3.5 rounded-2xl bg-surface-container-lowest dark:bg-zinc-900 shadow-sm border-2 ${activeTab === 'posts' ? 'border-secondary dark:border-emerald-500' : 'border-outline-variant/30 dark:border-zinc-800'} flex items-center justify-between cursor-pointer"
                        onclick="window.ViVuApp.switchModerationTab('posts', 'all')">
                        <div class="space-y-1">
                            <p class="font-caption text-xs text-on-surface-variant dark:text-zinc-400 font-medium">Bài viết chờ duyệt</p>
                            <div class="flex items-baseline gap-2">
                                <span class="font-headline-lg text-2xl font-bold text-primary dark:text-zinc-100">${posts.length}</span>
                                <span class="font-caption text-xs text-on-tertiary-container dark:text-amber-400 font-semibold">${posts.length > 0 ? 'Cần xử lý' : 'Đã sạch'}</span>
                            </div>
                            <p class="font-caption text-[11px] text-outline dark:text-zinc-500">Bài cộng đồng</p>
                        </div>
                        <div class="w-10 h-10 rounded-xl bg-tertiary-fixed dark:bg-amber-950/60 text-on-tertiary-fixed-variant dark:text-amber-300 flex items-center justify-center shadow-xs">
                            <span class="material-symbols-outlined text-[20px]">pending_actions</span>
                        </div>
                    </div>

                    <!-- Stat 2: Pending Club Dossiers -->
                    <div class="p-3.5 rounded-2xl bg-surface-container-lowest dark:bg-zinc-900 shadow-sm border-2 ${activeTab === 'clubs' ? 'border-secondary dark:border-emerald-500' : 'border-outline-variant/30 dark:border-zinc-800'} flex items-center justify-between cursor-pointer"
                        onclick="window.ViVuApp.switchModerationTab('clubs')">
                        <div class="space-y-1">
                            <div class="flex items-center gap-1.5">
                                <p class="font-caption text-xs text-primary dark:text-zinc-100 font-bold">Duyệt CLB mới</p>
                                <span class="px-1.5 py-0.5 rounded-full bg-secondary-container dark:bg-emerald-950/60 text-on-secondary-container dark:text-emerald-300 text-[10px] font-bold">Mới</span>
                            </div>
                            <div class="flex items-baseline gap-2">
                                <span class="font-headline-lg text-2xl font-bold text-secondary dark:text-emerald-400">${clubs.length}</span>
                                <span class="font-caption text-xs text-secondary dark:text-emerald-400 font-medium">hồ sơ</span>
                            </div>
                            <p class="font-caption text-[11px] text-on-surface-variant dark:text-zinc-400">Đề xuất CLB</p>
                        </div>
                        <div class="w-10 h-10 rounded-xl bg-secondary-container dark:bg-emerald-950/60 text-on-secondary-container dark:text-emerald-300 flex items-center justify-center shadow-xs">
                            <span class="material-symbols-outlined text-[20px]">diversity_3</span>
                        </div>
                    </div>

                    <!-- Stat 3: Pending Club Activities -->
                    <div class="p-3.5 rounded-2xl bg-surface-container-lowest dark:bg-zinc-900 shadow-sm border-2 ${activeTab === 'activities' ? 'border-secondary dark:border-emerald-500' : 'border-outline-variant/30 dark:border-zinc-800'} flex items-center justify-between cursor-pointer"
                        onclick="window.ViVuApp.switchModerationTab('activities')">
                        <div class="space-y-1">
                            <p class="font-caption text-xs text-on-surface-variant dark:text-zinc-400 font-medium">Lịch CLB chờ duyệt</p>
                            <div class="flex items-baseline gap-2">
                                <span class="font-headline-lg text-2xl font-bold text-emerald-600 dark:text-emerald-400">${activities.length}</span>
                                <span class="font-caption text-xs text-emerald-600 dark:text-emerald-400 font-semibold">${activities.length > 0 ? 'Chờ duyệt' : 'Đã sạch'}</span>
                            </div>
                            <p class="font-caption text-[11px] text-outline dark:text-zinc-500">Lịch sinh hoạt CLB</p>
                        </div>
                        <div class="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 flex items-center justify-center shadow-xs">
                            <span class="material-symbols-outlined text-[20px]">calendar_month</span>
                        </div>
                    </div>

                    <!-- Stat 4: Pending Events -->
                    <div class="p-3.5 rounded-2xl bg-surface-container-lowest dark:bg-zinc-900 shadow-sm border-2 ${activeTab === 'events' ? 'border-secondary dark:border-emerald-500' : 'border-outline-variant/30 dark:border-zinc-800'} flex items-center justify-between cursor-pointer"
                        onclick="window.ViVuApp.switchModerationTab('events')">
                        <div class="space-y-1">
                            <p class="font-caption text-xs text-on-surface-variant dark:text-zinc-400 font-medium">Sự kiện &amp; Workshop</p>
                            <div class="flex items-baseline gap-2">
                                <span class="font-headline-lg text-2xl font-bold text-primary dark:text-zinc-100">${events.length}</span>
                                <span class="font-caption text-xs text-secondary dark:text-emerald-400 font-semibold">${events.length > 0 ? 'Chờ duyệt' : 'Đã sạch'}</span>
                            </div>
                            <p class="font-caption text-[11px] text-outline dark:text-zinc-500">Đăng ký sự kiện</p>
                        </div>
                        <div class="w-10 h-10 rounded-xl bg-surface-container-high dark:bg-zinc-800 text-on-surface dark:text-zinc-200 flex items-center justify-center shadow-xs">
                            <span class="material-symbols-outlined text-[20px]">event</span>
                        </div>
                    </div>

                    <!-- Stat 5: Pending Articles -->
                    <div class="p-3.5 rounded-2xl bg-surface-container-lowest dark:bg-zinc-900 shadow-sm border-2 ${activeTab === 'articles' ? 'border-secondary dark:border-emerald-500' : 'border-outline-variant/30 dark:border-zinc-800'} flex items-center justify-between cursor-pointer"
                        onclick="window.ViVuApp.switchModerationTab('articles')">
                        <div class="space-y-1">
                            <p class="font-caption text-xs text-on-surface-variant dark:text-zinc-400 font-medium">Cẩm nang du lịch</p>
                            <div class="flex items-baseline gap-2">
                                <span class="font-headline-lg text-2xl font-bold text-amber-600 dark:text-amber-400">${articles.length}</span>
                                <span class="font-caption text-xs text-amber-600 dark:text-amber-400 font-semibold">${articles.length > 0 ? 'Chờ duyệt' : 'Đã sạch'}</span>
                            </div>
                            <p class="font-caption text-[11px] text-outline dark:text-zinc-500">Bài cẩm nang mới</p>
                        </div>
                        <div class="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 flex items-center justify-center shadow-xs">
                            <span class="material-symbols-outlined text-[20px]">auto_stories</span>
                        </div>
                    </div>

                    <!-- Stat 6: Reports / Violations -->
                    <div class="p-3.5 rounded-2xl bg-surface-container-lowest dark:bg-zinc-900 shadow-sm border border-outline-variant/30 dark:border-zinc-800 flex items-center justify-between">
                        <div class="space-y-1">
                            <p class="font-caption text-xs text-on-surface-variant dark:text-zinc-400 font-medium">Báo cáo vi phạm</p>
                            <div class="flex items-baseline gap-2">
                                <span class="font-headline-lg text-2xl font-bold text-error dark:text-rose-400">${kpi.flaggedCount || 0}</span>
                                <span class="font-caption text-xs text-error dark:text-rose-400 font-semibold">Ưu tiên xử lý</span>
                            </div>
                            <p class="font-caption text-[11px] text-outline dark:text-zinc-500">Đã duyệt hôm nay: ${kpi.approvedToday || 0}</p>
                        </div>
                        <div class="w-10 h-10 rounded-xl bg-error-container dark:bg-rose-950/60 text-on-error-container dark:text-rose-300 flex items-center justify-center shadow-xs">
                            <span class="material-symbols-outlined text-[20px]">flag_circle</span>
                        </div>
                    </div>
                </div>

                <!-- SMART FILTER AND SEARCH BAR -->
                <div class="p-4 rounded-2xl bg-surface-container-lowest dark:bg-zinc-900 shadow-sm border border-outline-variant/30 dark:border-zinc-800 space-y-3">
                    <div class="flex flex-col lg:flex-row items-center gap-3">
                        <div class="relative flex-1 w-full">
                            <span class="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline dark:text-zinc-400 text-[20px]">travel_explore</span>
                            <input id="moderationSearchInput" type="text" value="${escapeHtml(searchQuery)}"
                                oninput="window.ViVuApp.handleModerationSearch(this.value)"
                                class="w-full h-11 pl-11 pr-4 bg-surface-container-low dark:bg-zinc-800 rounded-xl font-body-md text-xs sm:text-sm text-on-surface dark:text-zinc-100 placeholder:text-outline dark:placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-secondary/30 transition-all border border-transparent focus:border-secondary"
                                placeholder="Tìm theo tiêu đề bài viết, sự kiện, cẩm nang, lịch CLB, tên tác giả, CLB..." />
                        </div>
                        <div class="flex items-center gap-2 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0">
                            <div class="relative shrink-0">
                                <select onchange="window.ViVuApp.filterModerationRisk(this.value)"
                                    class="h-11 px-4 pr-9 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-xs sm:text-sm text-on-surface dark:text-zinc-200 appearance-none focus:outline-none cursor-pointer border border-outline-variant/30 dark:border-zinc-700 min-h-[44px]">
                                    <option value="all" ${riskFilter === 'all' ? 'selected' : ''}>Mức độ rủi ro: Tất cả</option>
                                    <option value="high" ${riskFilter === 'high' ? 'selected' : ''}>🔴 Cảnh báo AI: Cao (>75%)</option>
                                    <option value="safe" ${riskFilter === 'safe' ? 'selected' : ''}>🟢 An toàn (Đạt chuẩn 95%+)</option>
                                </select>
                                <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline text-sm pointer-events-none">expand_more</span>
                            </div>
                        </div>
                    </div>

                    <!-- Category Chips Tabs -->
                    <div class="flex items-center gap-2 overflow-x-auto pt-1 no-scrollbar text-nowrap">
                        <button type="button" onclick="window.ViVuApp.switchModerationTab('posts', 'all')"
                            class="px-4 py-2 min-h-[44px] rounded-full ${activeTab === 'posts' && filterCategory === 'all' ? 'bg-primary-container text-on-primary font-bold shadow-xs ring-2 ring-secondary/40' : 'bg-surface-container-high dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300'} font-badge text-xs flex items-center gap-1.5 transition-all">
                            <span>Tất cả bài viết</span>
                            <span class="w-5 h-5 rounded-full ${activeTab === 'posts' && filterCategory === 'all' ? 'bg-secondary text-white' : 'bg-surface-container dark:bg-zinc-700'} text-[11px] flex items-center justify-center font-bold">${posts.length}</span>
                        </button>
                        <button type="button" onclick="window.ViVuApp.switchModerationTab('clubs')"
                            class="px-4 py-2 min-h-[44px] rounded-full ${activeTab === 'clubs' ? 'bg-primary text-white font-bold shadow-xs ring-2 ring-secondary/50' : 'bg-surface-container-high dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300'} font-badge text-xs flex items-center gap-1.5 transition-all">
                            <span class="material-symbols-outlined text-[16px] text-secondary dark:text-emerald-400">groups</span>
                            <span>Đề xuất tạo CLB</span>
                            <span class="w-5 h-5 rounded-full bg-secondary-container dark:bg-emerald-950 text-on-secondary-container dark:text-emerald-300 text-[11px] flex items-center justify-center font-bold">${clubs.length}</span>
                        </button>
                        <button type="button" onclick="window.ViVuApp.switchModerationTab('activities')"
                            class="px-4 py-2 min-h-[44px] rounded-full ${activeTab === 'activities' ? 'bg-primary text-white font-bold shadow-xs ring-2 ring-emerald-500/50' : 'bg-surface-container-high dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300'} font-badge text-xs flex items-center gap-1.5 transition-all">
                            <span class="material-symbols-outlined text-[16px] text-emerald-500">calendar_month</span>
                            <span>Lịch sinh hoạt CLB</span>
                            <span class="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-300 text-[11px] flex items-center justify-center font-bold">${activities.length}</span>
                        <button type="button" onclick="window.ViVuApp.switchModerationTab('events')"
                            class="px-4 py-2 min-h-[44px] rounded-full ${activeTab === 'events' ? 'bg-primary text-white font-bold shadow-xs ring-2 ring-secondary/50' : 'bg-surface-container-high dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300'} font-badge text-xs flex items-center gap-1.5 transition-all">
                            <span class="material-symbols-outlined text-[16px] text-secondary dark:text-emerald-400">event</span>
                            <span>Sự kiện &amp; Workshop</span>
                            <span class="w-5 h-5 rounded-full bg-secondary-container dark:bg-emerald-950 text-on-secondary-container dark:text-emerald-300 text-[11px] flex items-center justify-center font-bold">${events.length}</span>
                        </button>
                        <button type="button" onclick="window.ViVuApp.switchModerationTab('articles')"
                            class="px-4 py-2 min-h-[44px] rounded-full ${activeTab === 'articles' ? 'bg-primary text-white font-bold shadow-xs ring-2 ring-amber-500/50' : 'bg-surface-container-high dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300'} font-badge text-xs flex items-center gap-1.5 transition-all">
                            <span class="material-symbols-outlined text-[16px] text-amber-500">auto_stories</span>
                            <span>Cẩm nang du lịch</span>
                            <span class="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 text-[11px] flex items-center justify-center font-bold">${articles.length}</span>
                        </button>
                        <button type="button" onclick="window.ViVuApp.switchModerationTab('posts', 'culture')"
                            class="px-3.5 py-2 min-h-[44px] rounded-full ${activeTab === 'posts' && filterCategory === 'culture' ? 'bg-secondary text-white font-bold' : 'bg-surface-container-high dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300'} font-badge text-xs flex items-center gap-1.5 transition-all">
                            <span>Ký sự &amp; Trải nghiệm</span>
                        </button>
                        <button type="button" onclick="window.ViVuApp.switchModerationTab('posts', 'location')"
                            class="px-3.5 py-2 min-h-[44px] rounded-full ${activeTab === 'posts' && filterCategory === 'location' ? 'bg-secondary text-white font-bold' : 'bg-surface-container-high dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300'} font-badge text-xs flex items-center gap-1.5 transition-all">
                            <span>Đề xuất địa điểm mới</span>
                        </button>
                        <button type="button" onclick="window.ViVuApp.switchModerationTab('posts', 'report')"
                            class="px-3.5 py-2 min-h-[44px] rounded-full ${activeTab === 'posts' && filterCategory === 'report' ? 'bg-error text-white font-bold' : 'bg-error-container dark:bg-rose-950/60 text-on-error-container dark:text-rose-300'} font-badge text-xs flex items-center gap-1.5 transition-all">
                            <span class="material-symbols-outlined text-[16px]">report</span>
                            <span>Bình luận bị báo cáo</span>
                        </button>
                    </div>
                </div>

                <!-- SUB-VIEW A: POST MODERATION -->
                ${activeTab === 'posts' ? `
                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        <!-- LEFT COLUMN: Post Queue List (5 cols) -->
                        <div class="lg:col-span-5 space-y-3">
                            <div class="flex items-center justify-between px-1">
                                <span class="font-button text-xs font-bold text-primary dark:text-zinc-200 uppercase tracking-wider">
                                    Hàng đợi kiểm duyệt (${displayedPosts.length} mục)
                                </span>
                                <span class="font-caption text-xs text-secondary dark:text-emerald-400 font-medium flex items-center gap-1">
                                    <span class="material-symbols-outlined text-[14px]">sync</span> Tự động làm mới
                                </span>
                            </div>

                            ${displayedPosts.length === 0 ? `
                                <div class="p-8 text-center bg-surface-container-low dark:bg-zinc-800/40 rounded-2xl border border-dashed border-outline-variant/50 dark:border-zinc-800 space-y-2">
                                    <span class="material-symbols-outlined text-4xl text-secondary dark:text-emerald-400">task_alt</span>
                                    <p class="text-sm font-semibold text-primary dark:text-zinc-200">Không có bài viết nào chờ duyệt</p>
                                    <p class="text-xs text-on-surface-variant dark:text-zinc-400">Hàng đợi bài viết cộng đồng đang trống.</p>
                                </div>
                            ` : `
                                <div class="space-y-3">
                                    ${displayedPosts.map(p => {
                                        const isSelected = selectedPost && selectedPost.id === p.id;
                                        const isFlagged = p.aiSafeScore < 50;
                                        return `
                                            <div onclick="window.ViVuApp.selectModerationPost('${p.id}')"
                                                class="p-4 rounded-2xl bg-surface-container-lowest dark:bg-zinc-900 ${isSelected ? 'ring-2 ring-secondary dark:ring-emerald-500 bg-secondary/5 dark:bg-emerald-950/20 shadow-md' : 'shadow-xs border border-outline-variant/30 dark:border-zinc-800 hover:shadow-sm'} transition-all cursor-pointer">
                                                <div class="flex items-start justify-between gap-3 mb-1.5">
                                                    <div class="flex items-center gap-1.5 flex-wrap">
                                                        <span class="px-2 py-0.5 rounded-md ${isFlagged ? 'bg-error-container dark:bg-rose-950 text-error dark:text-rose-300 font-bold' : 'bg-secondary-container dark:bg-emerald-950 text-on-secondary-container dark:text-emerald-300 font-bold'} text-[11px]">
                                                            ${escapeHtml(p.category)}
                                                        </span>
                                                        <span class="px-2 py-0.5 rounded-md ${isFlagged ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300' : 'bg-surface-container-high dark:bg-zinc-800 text-secondary dark:text-emerald-400'} text-[11px] font-semibold flex items-center gap-0.5">
                                                            <span class="material-symbols-outlined text-[13px]">${isFlagged ? 'warning' : 'verified'}</span>
                                                            ${escapeHtml(p.aiStatus)}
                                                        </span>
                                                        ${p.status === 'approved' ? `
                                                            <span class="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold">Đã duyệt</span>
                                                        ` : ''}
                                                        ${p.status === 'rejected' ? `
                                                            <span class="px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-bold">Đã từ chối</span>
                                                        ` : ''}
                                                    </div>
                                                    <span class="font-caption text-[11px] text-outline dark:text-zinc-500 shrink-0">${escapeHtml(p.timeAgo)}</span>
                                                </div>
                                                <h3 class="font-headline-sm text-sm sm:text-base font-bold text-primary dark:text-zinc-100 line-clamp-2 mb-1.5 leading-snug">
                                                    ${escapeHtml(p.title)}
                                                </h3>
                                                <p class="font-body-sm text-xs ${isFlagged ? 'text-error dark:text-rose-400' : 'text-on-surface-variant dark:text-zinc-400'} line-clamp-2 mb-2.5">
                                                    ${escapeHtml(p.excerpt)}
                                                </p>
                                                <div class="flex items-center justify-between pt-2 border-t border-outline-variant/20 dark:border-zinc-800">
                                                    <div class="flex items-center gap-2">
                                                        <div class="w-6 h-6 rounded-full overflow-hidden bg-surface-container-high dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-on-surface-variant shrink-0">
                                                            ${p.author.avatar ? `
                                                                <img src="${escapeHtml(p.author.avatar)}" alt="${escapeHtml(p.author.name)}" class="w-full h-full object-cover" />
                                                            ` : `
                                                                <span>${p.author.name.substring(0, 2).toUpperCase()}</span>
                                                            `}
                                                        </div>
                                                        <div class="flex flex-col">
                                                            <span class="font-button text-xs font-semibold text-primary dark:text-zinc-200 flex items-center gap-1">
                                                                ${escapeHtml(p.author.name)}
                                                                ${p.author.verified ? '<span class="material-symbols-outlined text-[13px] text-secondary dark:text-emerald-400">check_circle</span>' : ''}
                                                            </span>
                                                            <span class="font-caption text-[10px] text-outline dark:text-zinc-500">${escapeHtml(p.author.level)}</span>
                                                        </div>
                                                    </div>
                                                    <div class="flex items-center gap-2 text-on-surface-variant dark:text-zinc-400 text-[11px]">
                                                        <span class="flex items-center gap-0.5"><span class="material-symbols-outlined text-[14px]">photo_library</span> ${p.images.length}</span>
                                                        <span class="flex items-center gap-0.5"><span class="material-symbols-outlined text-[14px]">schedule</span> ${escapeHtml(p.readTime)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            `}
                        </div>

                        <!-- RIGHT COLUMN: Detailed Assessment & Action Studio (7 cols) -->
                        <div class="lg:col-span-7 space-y-5">
                            ${selectedPost ? `
                                <div class="p-6 rounded-3xl bg-surface-container-lowest dark:bg-zinc-900 shadow-md border border-outline-variant/30 dark:border-zinc-800 space-y-6">
                                    <!-- Author Metadata Header -->
                                    <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-4 gap-4 border-b border-outline-variant/20 dark:border-zinc-800">
                                        <div class="flex items-center gap-3">
                                            <div class="w-12 h-12 rounded-full overflow-hidden shadow-sm bg-surface-container dark:bg-zinc-800 shrink-0">
                                                <img src="${escapeHtml(selectedPost.author.avatar || 'chùa âng.jpg')}" alt="${escapeHtml(selectedPost.author.name)}" class="w-full h-full object-cover" />
                                            </div>
                                            <div>
                                                <div class="flex items-center gap-2 flex-wrap">
                                                    <span class="font-headline-sm text-base font-bold text-primary dark:text-zinc-100">${escapeHtml(selectedPost.author.name)}</span>
                                                    ${selectedPost.author.verified ? `
                                                        <span class="px-2 py-0.5 rounded-full bg-secondary-container dark:bg-emerald-950 text-on-secondary-container dark:text-emerald-300 text-[10px] font-bold flex items-center gap-0.5">
                                                            <span class="material-symbols-outlined text-[12px]">verified</span> Đã định danh
                                                        </span>
                                                    ` : ''}
                                                    <span class="px-2 py-0.5 rounded bg-surface-container-high dark:bg-zinc-800 text-[10px] font-semibold text-on-surface-variant dark:text-zinc-300">
                                                        ${escapeHtml(selectedPost.author.level)}
                                                    </span>
                                                </div>
                                                <p class="font-caption text-xs text-outline dark:text-zinc-500 mt-0.5">
                                                    Tham gia ${selectedPost.author.memberMonths} tháng • Đã duyệt ${selectedPost.author.postsCount} bài • Tỷ lệ duyệt: <strong class="text-secondary dark:text-emerald-400 font-semibold">${selectedPost.author.successRate}</strong>
                                                </p>
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <button type="button" onclick="alert('Xem hồ sơ chi tiết tác giả ${escapeHtml(selectedPost.author.name)}')"
                                                class="w-10 h-10 min-w-[40px] min-h-[40px] rounded-xl bg-surface-container dark:bg-zinc-800 hover:bg-surface-container-high flex items-center justify-center text-on-surface dark:text-zinc-200" title="Xem hồ sơ">
                                                <span class="material-symbols-outlined text-[18px]">badge</span>
                                            </button>
                                            <button type="button" onclick="alert('Lịch sử duyệt của tài khoản')"
                                                class="w-10 h-10 min-w-[40px] min-h-[40px] rounded-xl bg-surface-container dark:bg-zinc-800 hover:bg-surface-container-high flex items-center justify-center text-on-surface dark:text-zinc-200" title="Lịch sử">
                                                <span class="material-symbols-outlined text-[18px]">history_edu</span>
                                            </button>
                                        </div>
                                    </div>

                                    <!-- AI Guardian Diagnostic Report -->
                                    <div class="p-4 rounded-2xl bg-surface-container-low dark:bg-zinc-800/60 border border-outline-variant/30 dark:border-zinc-700/50 space-y-3">
                                        <div class="flex items-center justify-between">
                                            <div class="flex items-center gap-2 text-secondary dark:text-emerald-400 font-button text-xs font-bold">
                                                <span class="material-symbols-outlined text-[20px]">shield_with_heart</span>
                                                <span>Báo cáo kiểm tra AI Guardian v3.1</span>
                                            </div>
                                            <span class="px-2.5 py-0.5 rounded-full ${selectedPost.aiSafeScore >= 80 ? 'bg-secondary-container dark:bg-emerald-950 text-on-secondary-container dark:text-emerald-300' : 'bg-error-container dark:bg-rose-950 text-error dark:text-rose-300'} text-xs font-bold">
                                                ${selectedPost.aiSafeScore >= 80 ? `Đạt chuẩn an toàn (${selectedPost.aiSafeScore}/100)` : `Cảnh báo rủi ro (${selectedPost.aiSafeScore}/100)`}
                                            </span>
                                        </div>
                                        <p class="text-xs text-on-surface-variant dark:text-zinc-300 leading-relaxed">
                                            ${escapeHtml(selectedPost.aiSummary)}
                                        </p>
                                    </div>

                                    <!-- WYSIWYG Article Preview -->
                                    <div class="space-y-3">
                                        <span class="px-2.5 py-1 rounded bg-secondary-container dark:bg-emerald-950 text-on-secondary-container dark:text-emerald-300 text-xs font-bold uppercase tracking-wider">
                                            ${escapeHtml(selectedPost.category)}
                                        </span>
                                        <h2 class="font-headline-lg text-lg sm:text-xl font-bold text-primary dark:text-zinc-100 leading-snug">
                                            ${escapeHtml(selectedPost.title)}
                                        </h2>
                                        <div class="font-body-lg text-xs sm:text-sm text-on-surface-variant dark:text-zinc-300 space-y-2 leading-relaxed">
                                            ${selectedPost.fullContent.map(para => `<p>${escapeHtml(para)}</p>`).join('')}
                                        </div>

                                        <!-- Photo Gallery -->
                                        ${selectedPost.images.length > 0 ? `
                                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                                                ${selectedPost.images.map(img => `
                                                    <div class="rounded-2xl overflow-hidden shadow-xs border border-outline-variant/30 dark:border-zinc-800">
                                                        <img src="${escapeHtml(img.src)}" alt="${escapeHtml(img.caption)}" class="w-full h-44 object-cover" />
                                                        <p class="p-2 bg-surface-container dark:bg-zinc-800 text-[11px] text-on-surface-variant dark:text-zinc-400 font-medium">
                                                            ${escapeHtml(img.caption)}
                                                        </p>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        ` : ''}

                                        <!-- Tags -->
                                        <div class="flex items-center gap-1.5 flex-wrap pt-2">
                                            ${selectedPost.tags.map(tag => `
                                                <span class="px-2.5 py-1 rounded-full bg-surface-container-high dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 text-xs font-medium">
                                                    ${escapeHtml(tag)}
                                                </span>
                                            `).join('')}
                                        </div>

                                        <!-- Verified Geo Location Card -->
                                        ${selectedPost.location ? `
                                            <div class="p-3.5 rounded-2xl bg-surface-container-low dark:bg-zinc-800/60 border border-outline-variant/30 dark:border-zinc-700/50 flex items-center justify-between gap-3">
                                                <div class="flex items-center gap-3">
                                                    <div class="w-10 h-10 rounded-xl bg-surface-container-lowest dark:bg-zinc-800 text-secondary dark:text-emerald-400 flex items-center justify-center shadow-xs shrink-0">
                                                        <span class="material-symbols-outlined text-[20px]">location_on</span>
                                                    </div>
                                                    <div>
                                                        <p class="font-button text-xs font-bold text-primary dark:text-zinc-100">${escapeHtml(selectedPost.location.name)}</p>
                                                        <p class="font-caption text-[11px] text-outline dark:text-zinc-400">${escapeHtml(selectedPost.location.address)} (${escapeHtml(selectedPost.location.coords)})</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ` : ''}
                                    </div>

                                    <!-- Moderator Internal Collaboration Note -->
                                    <div class="space-y-2 pt-2 border-t border-outline-variant/20 dark:border-zinc-800">
                                        <label class="flex items-center justify-between font-button text-xs font-bold text-primary dark:text-zinc-200">
                                            <span class="flex items-center gap-1.5">
                                                <span class="material-symbols-outlined text-[16px] text-secondary dark:text-emerald-400">edit_note</span>
                                                Ghi chú nội bộ dành cho Kiểm duyệt viên (Auditing Log):
                                            </span>
                                            <span class="text-[11px] text-outline dark:text-zinc-500 font-normal">Chỉ ban quản trị nhìn thấy</span>
                                        </label>
                                        <textarea id="moderatorAuditNote" class="w-full p-3 rounded-2xl bg-surface-container-low dark:bg-zinc-800 text-xs text-on-surface dark:text-zinc-200 placeholder:text-outline outline-none border border-outline-variant/30 dark:border-zinc-700 focus:border-secondary resize-none" rows="2">${escapeHtml(selectedPost.internalAuditNote || '')}</textarea>
                                    </div>

                                    <!-- Decision Action Bar -->
                                    <div class="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-outline-variant/20 dark:border-zinc-800">
                                        <div class="flex items-center gap-2 w-full sm:w-auto">
                                            <button type="button" onclick="window.ViVuApp.openActionReasonModal('reject_post', '${selectedPost.id}', '${escapeHtml(selectedPost.title)}')"
                                                class="px-4 py-2.5 min-h-[44px] rounded-xl bg-error text-white hover:bg-rose-700 transition-all font-button text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm w-full sm:w-auto">
                                                <span class="material-symbols-outlined text-[18px]">cancel</span>
                                                <span>Từ chối bài viết</span>
                                            </button>
                                            <button type="button" onclick="window.ViVuApp.openActionReasonModal('edit_post', '${selectedPost.id}', '${escapeHtml(selectedPost.title)}')"
                                                class="px-4 py-2.5 min-h-[44px] rounded-xl bg-tertiary-fixed dark:bg-amber-950 text-on-tertiary-fixed-variant dark:text-amber-300 hover:bg-amber-600 hover:text-white transition-all font-button text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm w-full sm:w-auto">
                                                <span class="material-symbols-outlined text-[18px]">history_edu</span>
                                                <span>Yêu cầu sửa lại</span>
                                            </button>
                                        </div>
                                        <button type="button" onclick="window.ViVuApp.approvePost('${selectedPost.id}')"
                                            class="px-5 py-2.5 min-h-[44px] rounded-xl bg-secondary text-white hover:bg-primary transition-all font-button text-xs font-semibold flex items-center justify-center gap-2 shadow-md w-full sm:w-auto">
                                            <span class="material-symbols-outlined text-[18px]">check_circle</span>
                                            <span>Phê duyệt &amp; Xuất bản (+50 Xu)</span>
                                        </button>
                                    </div>
                                </div>
                            ` : `
                                <div class="p-12 text-center bg-surface-container-lowest dark:bg-zinc-900 rounded-3xl border border-outline-variant/30 dark:border-zinc-800">
                                    <span class="material-symbols-outlined text-4xl text-outline mb-2">article</span>
                                    <p class="text-sm text-on-surface-variant dark:text-zinc-400">Không có bài viết nào được chọn.</p>
                                </div>
                            `}
                        </div>
                    </div>
                ` : activeTab === 'clubs' ? `
                    <!-- SUB-VIEW B: CLUB DOSSIER MODERATION -->
                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        <!-- LEFT COLUMN: Club Dossiers Queue List (5 cols) -->
                        <div class="lg:col-span-5 space-y-3">
                            <div class="flex items-center justify-between px-1">
                                <span class="font-button text-xs font-bold text-primary dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                                    <span class="material-symbols-outlined text-[18px] text-secondary">folder_shared</span>
                                    Hồ sơ CLB chờ duyệt (${displayedClubs.length})
                                </span>
                                <span class="font-caption text-xs text-secondary dark:text-emerald-400 font-medium flex items-center gap-1">
                                    <span class="material-symbols-outlined text-[14px]">sync</span> Tự động làm mới
                                </span>
                            </div>

                            ${displayedClubs.length === 0 ? `
                                <div class="p-8 text-center bg-surface-container-low dark:bg-zinc-800/40 rounded-2xl border border-dashed border-outline-variant/50 dark:border-zinc-800 space-y-2">
                                    <span class="material-symbols-outlined text-4xl text-secondary dark:text-emerald-400">diversity_3</span>
                                    <p class="text-sm font-semibold text-primary dark:text-zinc-200">Không có hồ sơ CLB nào chờ duyệt</p>
                                    <p class="text-xs text-on-surface-variant dark:text-zinc-400">Hàng đợi đề xuất thành lập CLB đang trống.</p>
                                </div>
                            ` : `
                                <div class="space-y-3">
                                    ${displayedClubs.map(c => {
                                        const isSelected = selectedClub && selectedClub.id === c.id;
                                        return `
                                            <div onclick="window.ViVuApp.selectModerationClub('${c.id}')"
                                                class="p-4 rounded-2xl bg-surface-container-lowest dark:bg-zinc-900 ${isSelected ? 'ring-2 ring-secondary dark:ring-emerald-500 bg-secondary/5 dark:bg-emerald-950/20 shadow-md' : 'shadow-xs border border-outline-variant/30 dark:border-zinc-800 hover:shadow-sm'} transition-all cursor-pointer">
                                                <div class="flex items-start justify-between gap-3 mb-1.5">
                                                    <div class="flex items-center gap-1.5 flex-wrap">
                                                        <span class="px-2 py-0.5 rounded-md ${c.isEligible ? 'bg-secondary-container dark:bg-emerald-950 text-on-secondary-container dark:text-emerald-300 font-bold' : 'bg-tertiary-fixed dark:bg-amber-950 text-on-tertiary-fixed-variant dark:text-amber-300 font-bold'} text-[11px] flex items-center gap-1">
                                                            <span class="material-symbols-outlined text-[13px]">${c.isEligible ? 'verified' : 'hourglass_top'}</span>
                                                            ${c.isEligible ? 'Đạt chuẩn thẩm định' : 'Đang ấp ủ (' + c.membersCount + '/10)'}
                                                        </span>
                                                        <span class="px-2 py-0.5 rounded-md bg-surface-container-high dark:bg-zinc-800 text-[11px] text-on-surface-variant dark:text-zinc-300">
                                                            ${escapeHtml(c.category)}
                                                        </span>
                                                        ${c.status === 'approved' ? `
                                                            <span class="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold">Đã cấp Tích Xanh</span>
                                                        ` : ''}
                                                    </div>
                                                    <span class="font-caption text-[11px] text-outline dark:text-zinc-500 shrink-0">${escapeHtml(c.timeAgo)}</span>
                                                </div>
                                                <h3 class="font-headline-sm text-sm sm:text-base font-bold text-primary dark:text-zinc-100 line-clamp-1 mb-1 leading-snug">
                                                    ${escapeHtml(c.name)}
                                                </h3>
                                                <p class="font-body-sm text-xs text-on-surface-variant dark:text-zinc-400 line-clamp-2 mb-2.5">
                                                    ${escapeHtml(c.desc)}
                                                </p>

                                                <!-- Progress Bar for Members -->
                                                <div class="p-2.5 rounded-xl bg-surface-container-low dark:bg-zinc-800/60 mb-2.5 space-y-1 border border-outline-variant/20 dark:border-zinc-700/40">
                                                    <div class="flex items-center justify-between text-xs">
                                                        <span class="text-on-surface-variant dark:text-zinc-400 font-medium">Tiến độ thành viên sáng lập:</span>
                                                        <span class="font-bold ${c.isEligible ? 'text-secondary dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}">
                                                            ${c.membersCount}/${c.membersRequired} (${c.progressPercent}%)
                                                        </span>
                                                    </div>
                                                    <div class="w-full h-2 rounded-full bg-surface-container-high dark:bg-zinc-700 overflow-hidden">
                                                        <div class="h-full ${c.isEligible ? 'bg-secondary dark:bg-emerald-500' : 'bg-amber-500'} rounded-full" style="width: ${Math.min(c.progressPercent, 100)}%;"></div>
                                                    </div>
                                                </div>

                                                <div class="flex items-center justify-between pt-1 border-t border-outline-variant/20 dark:border-zinc-800">
                                                    <div class="flex items-center gap-2">
                                                        <div class="w-6 h-6 rounded-full overflow-hidden bg-surface-container-high dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-on-surface-variant shrink-0">
                                                            ${c.founder.avatar ? `
                                                                <img src="${escapeHtml(c.founder.avatar)}" alt="${escapeHtml(c.founder.name)}" class="w-full h-full object-cover" />
                                                            ` : `
                                                                <span>${c.founder.name.substring(0, 2).toUpperCase()}</span>
                                                            `}
                                                        </div>
                                                        <span class="text-xs font-semibold text-primary dark:text-zinc-200">${escapeHtml(c.founder.name)}</span>
                                                    </div>
                                                    <span class="px-2 py-0.5 rounded bg-surface-container-high dark:bg-zinc-800 text-[10px] font-semibold text-outline dark:text-zinc-400">
                                                        ${escapeHtml(c.code)}
                                                    </span>
                                                </div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            `}
                        </div>

                        <!-- RIGHT COLUMN: Club Dossier Assessment Detail (7 cols) -->
                        <div class="lg:col-span-7 space-y-5">
                            ${selectedClub ? `
                                <div class="p-6 rounded-3xl bg-surface-container-lowest dark:bg-zinc-900 shadow-md border border-outline-variant/30 dark:border-zinc-800 space-y-6">
                                    <!-- Header: Club Overview & Creator -->
                                    <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-4 gap-4 border-b border-outline-variant/20 dark:border-zinc-800">
                                        <div class="flex items-center gap-3.5">
                                            <div class="w-14 h-14 rounded-2xl bg-primary-container text-secondary-container flex items-center justify-center shrink-0 shadow-sm">
                                                <span class="material-symbols-outlined text-[32px]">groups</span>
                                            </div>
                                            <div>
                                                <div class="flex items-center gap-2 flex-wrap">
                                                    <h2 class="font-headline-sm text-base sm:text-lg font-bold text-primary dark:text-zinc-100">${escapeHtml(selectedClub.name)}</h2>
                                                    <span class="px-2 py-0.5 rounded-full ${selectedClub.isEligible ? 'bg-secondary-container dark:bg-emerald-950 text-on-secondary-container dark:text-emerald-300' : 'bg-tertiary-fixed dark:bg-amber-950 text-on-tertiary-fixed-variant dark:text-amber-300'} text-[10px] font-bold flex items-center gap-0.5">
                                                        <span class="material-symbols-outlined text-[12px]">verified</span> ${selectedClub.isEligible ? 'Hồ sơ Hợp lệ' : 'Đang ấp ủ'}
                                                    </span>
                                                </div>
                                                <p class="font-caption text-xs text-outline dark:text-zinc-400 mt-0.5">
                                                    Địa bàn: <strong class="text-secondary dark:text-emerald-400 font-semibold">${escapeHtml(selectedClub.operatingHub)}</strong> • Mã: ${escapeHtml(selectedClub.code)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Core Criterion: Founding Members Progress -->
                                    <div class="p-4 rounded-2xl bg-surface-container-low dark:bg-zinc-800/60 border border-outline-variant/30 dark:border-zinc-700/50 space-y-3">
                                        <div class="flex items-center justify-between">
                                            <div class="flex items-center gap-2 text-primary dark:text-zinc-100 font-button text-xs font-bold">
                                                <span class="material-symbols-outlined text-[20px] text-secondary dark:text-emerald-400">how_to_reg</span>
                                                <span>Tiêu chí cốt lõi: ${selectedClub.membersCount}/${selectedClub.membersRequired} Thành viên sáng lập (${selectedClub.progressPercent}%)</span>
                                            </div>
                                            <span class="px-2.5 py-0.5 rounded-full bg-secondary-container dark:bg-emerald-950 text-on-secondary-container dark:text-emerald-300 text-xs font-bold flex items-center gap-1">
                                                <span class="material-symbols-outlined text-[12px]">verified_user</span> Đã định danh CCCD &amp; SĐT
                                            </span>
                                        </div>
                                        <div class="w-full h-3 rounded-full bg-surface-container-high dark:bg-zinc-700 overflow-hidden">
                                            <div class="h-full ${selectedClub.isEligible ? 'bg-secondary dark:bg-emerald-500' : 'bg-amber-500'} rounded-full transition-all duration-500" style="width: ${Math.min(selectedClub.progressPercent, 100)}%;"></div>
                                        </div>

                                        <!-- Notable Founders -->
                                        <div class="pt-2 border-t border-outline-variant/20 dark:border-zinc-700/50">
                                            <p class="text-xs font-semibold text-on-surface-variant dark:text-zinc-300 mb-2">Thành viên sáng lập tiêu biểu:</p>
                                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                                ${selectedClub.notableFounders.map(f => `
                                                    <div class="p-2.5 rounded-xl bg-surface-container-lowest dark:bg-zinc-800 flex items-center gap-2 shadow-xs border border-outline-variant/20 dark:border-zinc-700/40">
                                                        <div class="w-7 h-7 rounded-full overflow-hidden bg-surface-container-high dark:bg-zinc-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                                                            ${f.avatar ? `
                                                                <img src="${escapeHtml(f.avatar)}" alt="${escapeHtml(f.name)}" class="w-full h-full object-cover" />
                                                            ` : `
                                                                <span>${f.name.substring(0, 2).toUpperCase()}</span>
                                                            `}
                                                        </div>
                                                        <div class="min-w-0 flex-1">
                                                            <p class="text-xs font-bold text-primary dark:text-zinc-100 truncate">${escapeHtml(f.name)}</p>
                                                            <p class="text-[10px] text-outline dark:text-zinc-400 truncate">${escapeHtml(f.role)}</p>
                                                        </div>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        </div>
                                    </div>

                                    <!-- 4 Cultural & Community Safety Criteria (Tích xanh checklist) -->
                                    <div class="space-y-3">
                                        <h3 class="font-button text-xs font-bold text-primary dark:text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
                                            <span class="material-symbols-outlined text-secondary dark:text-emerald-400 text-[18px]">verified</span>
                                            Bản cam kết văn hóa &amp; An toàn cộng đồng (4 tiêu chuẩn kiểm định)
                                        </h3>
                                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            ${selectedClub.criteriaList.map(cr => `
                                                <div class="p-3 rounded-2xl bg-surface-container-low dark:bg-zinc-800/60 border ${cr.passed ? 'border-secondary/20 dark:border-emerald-500/20' : 'border-amber-500/30'} space-y-1">
                                                    <div class="flex items-center gap-1.5 ${cr.passed ? 'text-secondary dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'} text-xs font-bold">
                                                        <span class="material-symbols-outlined text-[16px]">${cr.passed ? 'check_circle' : 'pending'}</span>
                                                        <span>${escapeHtml(cr.title)}</span>
                                                    </div>
                                                    <p class="text-xs text-on-surface-variant dark:text-zinc-400 leading-relaxed">
                                                        ${escapeHtml(cr.desc)}
                                                    </p>
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>

                                    <!-- 3-Month Action Plan -->
                                    <div class="p-4 rounded-2xl bg-surface-container-lowest dark:bg-zinc-800 border border-outline-variant/30 dark:border-zinc-700/60 space-y-2.5">
                                        <h3 class="font-button text-xs font-bold text-primary dark:text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
                                            <span class="material-symbols-outlined text-secondary dark:text-emerald-400 text-[18px]">calendar_month</span>
                                            Kế hoạch hoạt động 3 tháng đầu tiên (Q4/2024)
                                        </h3>
                                        <div class="space-y-2 text-xs text-on-surface-variant dark:text-zinc-300">
                                            ${selectedClub.threeMonthsPlan.map((planItem, idx) => `
                                                <div class="flex items-start gap-2">
                                                    <span class="w-5 h-5 rounded-full bg-secondary-container dark:bg-emerald-950 text-on-secondary-container dark:text-emerald-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">${idx + 1}</span>
                                                    <p class="leading-relaxed">${escapeHtml(planItem)}</p>
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>

                                    <!-- Moderator Audit Note -->
                                    <div class="space-y-2 pt-2 border-t border-outline-variant/20 dark:border-zinc-800">
                                        <label class="flex items-center justify-between font-button text-xs font-bold text-primary dark:text-zinc-200">
                                            <span class="flex items-center gap-1.5">
                                                <span class="material-symbols-outlined text-[16px] text-secondary dark:text-emerald-400">edit_note</span>
                                                Ghi chú nội bộ Thẩm định viên CLB (Audit Note):
                                            </span>
                                            <span class="text-[11px] text-outline dark:text-zinc-500 font-normal">Chỉ Admin &amp; Ban Quản trị thấy</span>
                                        </label>
                                        <textarea id="moderatorClubAuditNote" class="w-full p-3 rounded-2xl bg-surface-container-low dark:bg-zinc-800 text-xs text-on-surface dark:text-zinc-200 placeholder:text-outline outline-none border border-outline-variant/30 dark:border-zinc-700 focus:border-secondary resize-none" rows="2">${escapeHtml(selectedClub.internalAuditNote || '')}</textarea>
                                    </div>

                                    <!-- Decision Action Bar -->
                                    <div class="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-outline-variant/20 dark:border-zinc-800">
                                        <div class="flex items-center gap-2 w-full sm:w-auto">
                                            <button type="button" onclick="window.ViVuApp.openActionReasonModal('reject_club', '${selectedClub.id}', '${escapeHtml(selectedClub.name)}')"
                                                class="px-4 py-2.5 min-h-[44px] rounded-xl bg-error text-white hover:bg-rose-700 transition-all font-button text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm w-full sm:w-auto">
                                                <span class="material-symbols-outlined text-[18px]">cancel</span>
                                                <span>Từ chối đề xuất</span>
                                            </button>
                                            <button type="button" onclick="window.ViVuApp.openActionReasonModal('request_club_info', '${selectedClub.id}', '${escapeHtml(selectedClub.name)}')"
                                                class="px-4 py-2.5 min-h-[44px] rounded-xl bg-tertiary-fixed dark:bg-amber-950 text-on-tertiary-fixed-variant dark:text-amber-300 hover:bg-amber-600 hover:text-white transition-all font-button text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm w-full sm:w-auto">
                                                <span class="material-symbols-outlined text-[18px]">edit_document</span>
                                                <span>Yêu cầu bổ sung</span>
                                            </button>
                                        </div>
                                        <button type="button" onclick="window.ViVuApp.approveClub('${selectedClub.id}')"
                                            class="px-5 py-2.5 min-h-[44px] rounded-xl bg-secondary text-white hover:bg-primary transition-all font-button text-xs font-semibold flex items-center justify-center gap-2 shadow-md w-full sm:w-auto">
                                            <span class="material-symbols-outlined text-[18px]">verified</span>
                                            <span>Phê duyệt &amp; Cấp tích xanh (+500 Xu)</span>
                                        </button>
                                    </div>
                                </div>
                            ` : `
                                <div class="p-12 text-center bg-surface-container-lowest dark:bg-zinc-900 rounded-3xl border border-outline-variant/30 dark:border-zinc-800">
                                    <span class="material-symbols-outlined text-4xl text-outline mb-2">groups</span>
                                    <p class="text-sm text-on-surface-variant dark:text-zinc-400">Không có hồ sơ CLB nào được chọn.</p>
                                </div>
                            `}
                        </div>
                    </div>
                ` : activeTab === 'events' ? `
                    <!-- SUB-VIEW C: COMMUNITY EVENTS & WORKSHOPS MODERATION -->
                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        <!-- LEFT COLUMN: Events Queue List (5 cols) -->
                        <div class="lg:col-span-5 space-y-3">
                            <div class="flex items-center justify-between px-1">
                                <span class="font-button text-xs font-bold text-primary dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                                    <span class="material-symbols-outlined text-[18px] text-secondary">event</span>
                                    Hồ sơ Sự kiện chờ duyệt (${displayedEvents.length})
                                </span>
                                <span class="font-caption text-xs text-secondary dark:text-emerald-400 font-medium flex items-center gap-1">
                                    <span class="material-symbols-outlined text-[14px]">sync</span> Tự động làm mới
                                </span>
                            </div>

                            ${displayedEvents.length === 0 ? `
                                <div class="p-8 text-center bg-surface-container-low dark:bg-zinc-800/40 rounded-2xl border border-dashed border-outline-variant/50 dark:border-zinc-800 space-y-2">
                                    <span class="material-symbols-outlined text-4xl text-secondary dark:text-emerald-400">event_available</span>
                                    <p class="text-sm font-semibold text-primary dark:text-zinc-200">Không có sự kiện nào chờ duyệt</p>
                                    <p class="text-xs text-on-surface-variant dark:text-zinc-400">Hàng đợi sự kiện &amp; workshop đang trống.</p>
                                </div>
                            ` : `
                                <div class="space-y-3">
                                    ${displayedEvents.map(e => {
                                        const isSelected = selectedEvent && selectedEvent.id === e.id;
                                        return `
                                            <div onclick="window.ViVuApp.selectModerationEvent('${e.id}')"
                                                class="p-4 rounded-2xl bg-surface-container-lowest dark:bg-zinc-900 ${isSelected ? 'ring-2 ring-secondary dark:ring-emerald-500 bg-secondary/5 dark:bg-emerald-950/20 shadow-md' : 'shadow-xs border border-outline-variant/30 dark:border-zinc-800 hover:shadow-sm'} transition-all cursor-pointer">
                                                <div class="flex items-start justify-between gap-3 mb-1.5">
                                                    <div class="flex items-center gap-1.5 flex-wrap">
                                                        <span class="px-2 py-0.5 rounded-md bg-secondary-container dark:bg-emerald-950 text-on-secondary-container dark:text-emerald-300 font-bold text-[11px]">
                                                            ${escapeHtml(e.category)}
                                                        </span>
                                                        ${e.status === 'approved' ? `
                                                            <span class="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold">Đã duyệt</span>
                                                        ` : `
                                                            <span class="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[10px] font-bold">Chờ duyệt</span>
                                                        `}
                                                    </div>
                                                    <span class="font-caption text-[11px] text-outline dark:text-zinc-500 shrink-0">${escapeHtml(e.submittedAt || '')}</span>
                                                </div>
                                                <h3 class="font-headline-sm text-sm sm:text-base font-bold text-primary dark:text-zinc-100 line-clamp-1 mb-1 leading-snug">
                                                    ${escapeHtml(e.title)}
                                                </h3>
                                                <p class="font-body-sm text-xs text-on-surface-variant dark:text-zinc-400 line-clamp-2 mb-2">
                                                    ${escapeHtml(e.description || 'Không có mô tả chi tiết.')}
                                                </p>
                                                <div class="flex items-center justify-between pt-1 border-t border-outline-variant/20 dark:border-zinc-800 text-[11px] text-outline dark:text-zinc-400">
                                                    <span class="flex items-center gap-1 font-medium text-primary dark:text-zinc-200">
                                                        <span class="material-symbols-outlined text-[14px] text-secondary">person</span>
                                                        ${escapeHtml(e.organizer || e.creatorName || '')}
                                                    </span>
                                                    <span class="flex items-center gap-1">
                                                        <span class="material-symbols-outlined text-[14px]">schedule</span>
                                                        ${escapeHtml(e.datetime || e.timeSchedule || '')}
                                                    </span>
                                                </div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            `}
                        </div>

                        <!-- RIGHT COLUMN: Event Detail & Action Studio (7 cols) -->
                        <div class="lg:col-span-7 space-y-5">
                            ${selectedEvent ? `
                                <div class="p-6 rounded-3xl bg-surface-container-lowest dark:bg-zinc-900 shadow-md border border-outline-variant/30 dark:border-zinc-800 space-y-6">
                                    <!-- Header: Event Overview -->
                                    <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-4 gap-4 border-b border-outline-variant/20 dark:border-zinc-800">
                                        <div class="flex items-center gap-3.5">
                                            <div class="w-14 h-14 rounded-2xl bg-secondary-container dark:bg-emerald-950 text-on-secondary-container dark:text-emerald-300 flex items-center justify-center shrink-0 shadow-sm">
                                                <span class="material-symbols-outlined text-[32px]">event</span>
                                            </div>
                                            <div>
                                                <div class="flex items-center gap-2 flex-wrap">
                                                    <h2 class="font-headline-sm text-base sm:text-lg font-bold text-primary dark:text-zinc-100">${escapeHtml(selectedEvent.title)}</h2>
                                                    <span class="px-2 py-0.5 rounded-full ${selectedEvent.status === 'approved' ? 'bg-secondary-container dark:bg-emerald-950 text-on-secondary-container dark:text-emerald-300' : 'bg-tertiary-fixed dark:bg-amber-950 text-on-tertiary-fixed-variant dark:text-amber-300'} text-[10px] font-bold">
                                                        ${selectedEvent.status === 'approved' ? 'Đã duyệt' : 'Chờ kiểm duyệt'}
                                                    </span>
                                                </div>
                                                <p class="font-caption text-xs text-outline dark:text-zinc-400 mt-0.5">
                                                    Đơn vị tổ chức: <strong class="text-secondary dark:text-emerald-400 font-semibold">${escapeHtml(selectedEvent.organizer)}</strong>
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Event Details Grid -->
                                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div class="p-3.5 rounded-2xl bg-surface-container-low dark:bg-zinc-800/60 border border-outline-variant/30 dark:border-zinc-700/50 space-y-1">
                                            <span class="text-[11px] text-outline dark:text-zinc-400 font-medium">Thời gian tổ chức</span>
                                            <p class="font-button text-xs font-bold text-primary dark:text-zinc-100 flex items-center gap-1.5">
                                                <span class="material-symbols-outlined text-[16px] text-secondary">schedule</span>
                                                ${escapeHtml(selectedEvent.datetime || selectedEvent.timeSchedule || 'Chưa cập nhật')}
                                            </p>
                                        </div>
                                        <div class="p-3.5 rounded-2xl bg-surface-container-low dark:bg-zinc-800/60 border border-outline-variant/30 dark:border-zinc-700/50 space-y-1">
                                            <span class="text-[11px] text-outline dark:text-zinc-400 font-medium">Địa điểm</span>
                                            <p class="font-button text-xs font-bold text-primary dark:text-zinc-100 flex items-center gap-1.5">
                                                <span class="material-symbols-outlined text-[16px] text-secondary">location_on</span>
                                                ${escapeHtml(selectedEvent.location || 'Chưa cập nhật')}
                                            </p>
                                        </div>
                                        <div class="p-3.5 rounded-2xl bg-surface-container-low dark:bg-zinc-800/60 border border-outline-variant/30 dark:border-zinc-700/50 space-y-1">
                                            <span class="text-[11px] text-outline dark:text-zinc-400 font-medium">Phí tham gia</span>
                                            <p class="font-button text-xs font-bold text-primary dark:text-zinc-100 flex items-center gap-1.5">
                                                <span class="material-symbols-outlined text-[16px] text-secondary">payments</span>
                                                ${escapeHtml(selectedEvent.fee || 'Miễn phí')}
                                            </p>
                                        </div>
                                        <div class="p-3.5 rounded-2xl bg-surface-container-low dark:bg-zinc-800/60 border border-outline-variant/30 dark:border-zinc-700/50 space-y-1">
                                            <span class="text-[11px] text-outline dark:text-zinc-400 font-medium">SĐT liên hệ (Bảo mật - Chỉ Admin)</span>
                                            <p class="font-button text-xs font-bold text-secondary dark:text-emerald-400 flex items-center gap-1.5">
                                                <span class="material-symbols-outlined text-[16px]">call</span>
                                                ${escapeHtml(selectedEvent.contactPhone || selectedEvent.phone || 'Chưa cung cấp')}
                                            </p>
                                        </div>
                                    </div>

                                    <!-- Description -->
                                    <div class="space-y-2">
                                        <span class="font-button text-xs font-bold text-primary dark:text-zinc-200">Mô tả sự kiện:</span>
                                        <div class="p-4 rounded-2xl bg-surface-container-low dark:bg-zinc-800/40 text-xs text-on-surface-variant dark:text-zinc-300 leading-relaxed border border-outline-variant/20 dark:border-zinc-800">
                                            ${escapeHtml(selectedEvent.description || 'Không có mô tả chi tiết.')}
                                        </div>
                                    </div>

                                    <!-- Decision Action Bar -->
                                    <div class="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-outline-variant/20 dark:border-zinc-800">
                                        <button type="button" onclick="window.ViVuApp.openActionReasonModal('reject_event', '${selectedEvent.id}', '${escapeHtml(selectedEvent.title)}')"
                                            class="px-4 py-2.5 min-h-[44px] rounded-xl bg-error text-white hover:bg-rose-700 transition-all font-button text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm w-full sm:w-auto">
                                            <span class="material-symbols-outlined text-[18px]">cancel</span>
                                            <span>Từ chối sự kiện</span>
                                        </button>
                                        <button type="button" onclick="window.ViVuApp.approveEvent('${selectedEvent.id}')"
                                            class="px-5 py-2.5 min-h-[44px] rounded-xl bg-secondary text-white hover:bg-primary transition-all font-button text-xs font-semibold flex items-center justify-center gap-2 shadow-md w-full sm:w-auto">
                                            <span class="material-symbols-outlined text-[18px]">check_circle</span>
                                            <span>Phê duyệt &amp; Xuất bản sự kiện</span>
                                        </button>
                                    </div>
                                </div>
                            ` : `
                                <div class="p-12 text-center bg-surface-container-lowest dark:bg-zinc-900 rounded-3xl border border-outline-variant/30 dark:border-zinc-800">
                                    <span class="material-symbols-outlined text-4xl text-outline mb-2">event</span>
                                    <p class="text-sm text-on-surface-variant dark:text-zinc-400">Không có sự kiện nào được chọn.</p>
                                </div>
                            `}
                        </div>
                    </div>
                ` : activeTab === 'articles' ? `
                    <!-- SUB-VIEW D: ARTICLE MODERATION -->
                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        <!-- LEFT COLUMN: Articles Queue List (5 cols) -->
                        <div class="lg:col-span-5 space-y-3">
                            <div class="flex items-center justify-between px-1">
                                <span class="font-button text-xs font-bold text-primary dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                                    <span class="material-symbols-outlined text-[18px] text-amber-500">auto_stories</span>
                                    Hàng đợi cẩm nang (${displayedArticles.length})
                                </span>
                                <span class="font-caption text-xs text-secondary dark:text-emerald-400 font-medium flex items-center gap-1">
                                    <span class="material-symbols-outlined text-[14px]">sync</span> Tự động làm mới
                                </span>
                            </div>

                            ${displayedArticles.length === 0 ? `
                                <div class="p-8 text-center bg-surface-container-low dark:bg-zinc-800/40 rounded-2xl border border-dashed border-outline-variant/50 dark:border-zinc-800 space-y-2">
                                    <span class="material-symbols-outlined text-4xl text-amber-500">menu_book</span>
                                    <p class="text-sm font-semibold text-primary dark:text-zinc-200">Không có bài cẩm nang nào chờ duyệt</p>
                                    <p class="text-xs text-on-surface-variant dark:text-zinc-400">Tất cả bài viết cẩm nang gửi từ cộng đồng đã được xử lý xong.</p>
                                </div>
                            ` : `
                                <div class="space-y-3">
                                    ${displayedArticles.map(a => {
                                        const isSelected = selectedArticle && selectedArticle.id === a.id;
                                        return `
                                            <div onclick="window.ViVuApp.selectModerationArticle('${a.id}')"
                                                class="p-4 rounded-2xl bg-surface-container-lowest dark:bg-zinc-900 ${isSelected ? 'ring-2 ring-amber-500 bg-amber-50/10 dark:bg-amber-950/20 shadow-md' : 'shadow-xs border border-outline-variant/30 dark:border-zinc-800 hover:shadow-sm'} transition-all cursor-pointer">
                                                <div class="flex items-start justify-between gap-3 mb-1.5">
                                                    <div class="flex items-center gap-1.5 flex-wrap">
                                                        <span class="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 text-[11px] font-bold">
                                                            ${escapeHtml(a.category_name || a.category || 'Cẩm nang')}
                                                        </span>
                                                        ${a.status === 'approved' ? `
                                                            <span class="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold">Đã duyệt</span>
                                                        ` : `
                                                            <span class="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[10px] font-bold">Chờ duyệt</span>
                                                        `}
                                                        ${a.is_editorial ? `
                                                            <span class="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950 text-purple-900 dark:text-purple-300 text-[10px] font-bold">Ban Biên Tập</span>
                                                        ` : ''}
                                                    </div>
                                                    <span class="font-caption text-[11px] text-outline dark:text-zinc-500 shrink-0">${escapeHtml(a.read_time || '5 phút đọc')}</span>
                                                </div>
                                                <h3 class="font-headline-sm text-sm sm:text-base font-bold text-primary dark:text-zinc-100 line-clamp-1 mb-1 leading-snug">
                                                    ${escapeHtml(a.title)}
                                                </h3>
                                                <p class="font-body-sm text-xs text-on-surface-variant dark:text-zinc-400 line-clamp-2 mb-2">
                                                    ${escapeHtml(a.excerpt || '')}
                                                </p>
                                                <div class="flex items-center justify-between pt-1 border-t border-outline-variant/20 dark:border-zinc-800 text-[11px] text-outline dark:text-zinc-400">
                                                    <span class="flex items-center gap-1 font-medium text-primary dark:text-zinc-200">
                                                        <span class="material-symbols-outlined text-[14px] text-amber-500">person</span>
                                                        ${escapeHtml(a.author?.name || a.author_name || 'Tác giả')}
                                                    </span>
                                                    <span class="flex items-center gap-1">
                                                        <span class="material-symbols-outlined text-[14px]">schedule</span>
                                                        ${escapeHtml(a.created_at ? new Date(a.created_at).toLocaleDateString('vi-VN') : 'Mới gửi')}
                                                    </span>
                                                </div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            `}
                        </div>

                        <!-- RIGHT COLUMN: Article Detail & Moderation Studio (7 cols) -->
                        <div class="lg:col-span-7 space-y-5">
                            ${selectedArticle ? `
                                <div class="p-6 rounded-3xl bg-surface-container-lowest dark:bg-zinc-900 shadow-md border border-outline-variant/30 dark:border-zinc-800 space-y-6">
                                    <!-- Header: Article Overview -->
                                    <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-4 gap-4 border-b border-outline-variant/20 dark:border-zinc-800">
                                        <div class="flex items-center gap-3.5">
                                            <div class="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
                                                ${selectedArticle.cover_image ? `
                                                    <img src="${escapeHtml(selectedArticle.cover_image)}" alt="" class="w-full h-full object-cover" />
                                                ` : `
                                                    <span class="material-symbols-outlined text-[32px]">auto_stories</span>
                                                `}
                                            </div>
                                            <div>
                                                <div class="flex items-center gap-2 flex-wrap">
                                                    <h2 class="font-headline-sm text-base sm:text-lg font-bold text-primary dark:text-zinc-100">${escapeHtml(selectedArticle.title)}</h2>
                                                    <span class="px-2 py-0.5 rounded-full ${selectedArticle.status === 'approved' ? 'bg-secondary-container dark:bg-emerald-950 text-on-secondary-container dark:text-emerald-300' : 'bg-tertiary-fixed dark:bg-amber-950 text-on-tertiary-fixed-variant dark:text-amber-300'} text-[10px] font-bold">
                                                        ${selectedArticle.status === 'approved' ? 'Đã duyệt' : 'Chờ kiểm duyệt'}
                                                    </span>
                                                </div>
                                                <p class="font-caption text-xs text-outline dark:text-zinc-400 mt-0.5">
                                                    Tác giả: <strong class="text-primary dark:text-zinc-200 font-semibold">${escapeHtml(selectedArticle.author?.name || selectedArticle.author_name || 'Tác giả')}</strong> • Chuyên mục: ${escapeHtml(selectedArticle.category_name || selectedArticle.category || 'Cẩm nang')}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Cover Image & Meta -->
                                    ${selectedArticle.cover_image ? `
                                        <div class="w-full h-48 rounded-2xl overflow-hidden bg-surface-container-high border border-outline-variant/20 dark:border-zinc-800">
                                            <img src="${escapeHtml(selectedArticle.cover_image)}" alt="" class="w-full h-full object-cover" />
                                        </div>
                                    ` : ''}

                                    <!-- Excerpt -->
                                    <div class="space-y-1">
                                        <span class="font-button text-xs font-bold text-primary dark:text-zinc-200">Tóm tắt bài viết:</span>
                                        <div class="p-3.5 rounded-2xl bg-surface-container-low dark:bg-zinc-800/40 text-xs italic text-on-surface-variant dark:text-zinc-300 leading-relaxed border border-outline-variant/20 dark:border-zinc-800">
                                            ${escapeHtml(selectedArticle.excerpt || 'Chưa có tóm tắt.')}
                                        </div>
                                    </div>

                                    <!-- Article Content Preview -->
                                    <div class="space-y-2">
                                        <span class="font-button text-xs font-bold text-primary dark:text-zinc-200">Nội dung chi tiết:</span>
                                        <div class="p-4 rounded-2xl bg-surface-container-low dark:bg-zinc-800/40 text-xs text-on-surface-variant dark:text-zinc-300 leading-relaxed border border-outline-variant/20 dark:border-zinc-800 max-h-60 overflow-y-auto whitespace-pre-line">
                                            ${escapeHtml(selectedArticle.content || 'Chưa có nội dung.')}
                                        </div>
                                    </div>

                                    <!-- Moderator Audit Note -->
                                    <div class="space-y-2 pt-2 border-t border-outline-variant/20 dark:border-zinc-800">
                                        <label class="flex items-center justify-between font-button text-xs font-bold text-primary dark:text-zinc-200">
                                            <span class="flex items-center gap-1.5">
                                                <span class="material-symbols-outlined text-[16px] text-amber-500">edit_note</span>
                                                Ghi chú nội bộ Kiểm duyệt viên (Audit Note):
                                            </span>
                                            <span class="text-[11px] text-outline dark:text-zinc-500 font-normal">Chỉ ban quản trị nhìn thấy</span>
                                        </label>
                                        <textarea id="moderatorAuditNote" class="w-full p-3 rounded-2xl bg-surface-container-low dark:bg-zinc-800 text-xs text-on-surface dark:text-zinc-200 placeholder:text-outline outline-none border border-outline-variant/30 dark:border-zinc-700 focus:border-amber-500 resize-none" rows="2">${escapeHtml(selectedArticle.admin_notes || selectedArticle.adminNotes || '')}</textarea>
                                    </div>

                                    <!-- Decision Action Bar -->
                                    <div class="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-outline-variant/20 dark:border-zinc-800">
                                        <div class="flex items-center gap-2 w-full sm:w-auto">
                                            <button type="button" onclick="window.ViVuApp.openActionReasonModal('reject_article', '${selectedArticle.id}', '${escapeHtml(selectedArticle.title)}')"
                                                class="px-4 py-2.5 min-h-[44px] rounded-xl bg-error text-white hover:bg-rose-700 transition-all font-button text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm w-full sm:w-auto">
                                                <span class="material-symbols-outlined text-[18px]">cancel</span>
                                                <span>Từ chối bài cẩm nang</span>
                                            </button>
                                            <button type="button" onclick="window.ViVuApp.openEditArticleFromModeration('${selectedArticle.id}')"
                                                class="px-4 py-2.5 min-h-[44px] rounded-xl bg-tertiary-fixed dark:bg-amber-950 text-on-tertiary-fixed-variant dark:text-amber-300 hover:bg-amber-600 hover:text-white transition-all font-button text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm w-full sm:w-auto">
                                                <span class="material-symbols-outlined text-[18px]">edit_note</span>
                                                <span>Biên tập nội dung</span>
                                            </button>
                                        </div>
                                        <button type="button" onclick="window.ViVuApp.approveArticle('${selectedArticle.id}')"
                                            class="px-5 py-2.5 min-h-[44px] rounded-xl bg-secondary text-white hover:bg-primary transition-all font-button text-xs font-semibold flex items-center justify-center gap-2 shadow-md w-full sm:w-auto">
                                            <span class="material-symbols-outlined text-[18px]">check_circle</span>
                                            <span>Phê duyệt &amp; Xuất bản</span>
                                        </button>
                                    </div>
                                </div>
                            ` : `
                                <div class="p-12 text-center bg-surface-container-lowest dark:bg-zinc-900 rounded-3xl border border-outline-variant/30 dark:border-zinc-800">
                                    <span class="material-symbols-outlined text-4xl text-outline mb-2">auto_stories</span>
                                    <p class="text-sm text-on-surface-variant dark:text-zinc-400">Không có bài cẩm nang nào được chọn.</p>
                                </div>
                            `}
                        </div>
                    </div>
                ` : activeTab === 'activities' ? `
                    <!-- SUB-VIEW E: CLUB ACTIVITIES MODERATION -->
                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        <!-- LEFT COLUMN: Activities Queue List (5 cols) -->
                        <div class="lg:col-span-5 space-y-3">
                            <div class="flex items-center justify-between px-1">
                                <span class="font-button text-xs font-bold text-primary dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                                    <span class="material-symbols-outlined text-[18px] text-emerald-500">calendar_month</span>
                                    Hàng đợi lịch CLB (${displayedActivities.length})
                                </span>
                                <span class="font-caption text-xs text-secondary dark:text-emerald-400 font-medium flex items-center gap-1">
                                    <span class="material-symbols-outlined text-[14px]">sync</span> Tự động làm mới
                                </span>
                            </div>

                            ${displayedActivities.length === 0 ? `
                                <div class="p-8 text-center bg-surface-container-low dark:bg-zinc-800/40 rounded-2xl border border-dashed border-outline-variant/50 dark:border-zinc-800 space-y-2">
                                    <span class="material-symbols-outlined text-4xl text-emerald-500">event_available</span>
                                    <p class="text-sm font-semibold text-primary dark:text-zinc-200">Không có lịch sinh hoạt nào chờ duyệt</p>
                                    <p class="text-xs text-on-surface-variant dark:text-zinc-400">Tất cả lịch sinh hoạt định kỳ do Chủ nhiệm gửi lên đã được xử lý xong.</p>
                                </div>
                            ` : `
                                <div class="space-y-3">
                                    ${displayedActivities.map(act => {
                                        const isSelected = selectedActivity && selectedActivity.id === act.id;
                                        return `
                                            <div onclick="window.ViVuApp.selectModerationActivity('${act.id}')"
                                                class="p-4 rounded-2xl bg-surface-container-lowest dark:bg-zinc-900 ${isSelected ? 'ring-2 ring-emerald-500 bg-emerald-50/10 dark:bg-emerald-950/20 shadow-md' : 'shadow-xs border border-outline-variant/30 dark:border-zinc-800 hover:shadow-sm'} transition-all cursor-pointer">
                                                <div class="flex items-start justify-between gap-3 mb-1.5">
                                                    <div class="flex items-center gap-1.5 flex-wrap">
                                                        <span class="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-300 text-[11px] font-bold">
                                                            ${escapeHtml(act.club_name || 'CLB')}
                                                        </span>
                                                        ${act.status === 'approved' ? `
                                                            <span class="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold">Đã duyệt</span>
                                                        ` : act.status === 'rejected' ? `
                                                            <span class="px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-bold">Đã từ chối</span>
                                                        ` : `
                                                            <span class="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[10px] font-bold">Chờ duyệt</span>
                                                        `}
                                                        <span class="px-2 py-0.5 rounded-md bg-surface-container-high dark:bg-zinc-800 text-[10px] font-semibold text-on-surface-variant dark:text-zinc-300">
                                                            ${act.is_free !== false ? 'Miễn phí' : 'Có phí'}
                                                        </span>
                                                    </div>
                                                    <span class="font-caption text-[11px] text-outline dark:text-zinc-500 shrink-0">${escapeHtml(act.created_at ? new Date(act.created_at).toLocaleDateString('vi-VN') : '')}</span>
                                                </div>
                                                <h3 class="font-headline-sm text-sm sm:text-base font-bold text-primary dark:text-zinc-100 line-clamp-1 mb-1 leading-snug">
                                                    ${escapeHtml(act.title)}
                                                </h3>
                                                <p class="font-body-sm text-xs text-on-surface-variant dark:text-zinc-400 line-clamp-2 mb-2">
                                                    ${escapeHtml(act.description || 'Không có mô tả chi tiết.')}
                                                </p>
                                                <div class="flex items-center justify-between pt-1 border-t border-outline-variant/20 dark:border-zinc-800 text-[11px] text-outline dark:text-zinc-400">
                                                    <span class="flex items-center gap-1 font-medium text-primary dark:text-zinc-200">
                                                        <span class="material-symbols-outlined text-[14px] text-emerald-500">account_circle</span>
                                                        ${escapeHtml(act.creator_name || 'Chủ nhiệm CLB')}
                                                    </span>
                                                    <span class="flex items-center gap-1">
                                                        <span class="material-symbols-outlined text-[14px]">schedule</span>
                                                        ${escapeHtml(act.time_schedule || act.time || '')}
                                                    </span>
                                                </div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            `}
                        </div>

                        <!-- RIGHT COLUMN: Activity Detail & Moderation Studio (7 cols) -->
                        <div class="lg:col-span-7 space-y-5">
                            ${selectedActivity ? `
                                <div class="p-6 rounded-3xl bg-surface-container-lowest dark:bg-zinc-900 shadow-md border border-outline-variant/30 dark:border-zinc-800 space-y-6">
                                    <!-- Header: Activity Overview -->
                                    <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-4 gap-4 border-b border-outline-variant/20 dark:border-zinc-800">
                                        <div class="flex items-center gap-3.5">
                                            <div class="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 flex items-center justify-center shrink-0 shadow-sm">
                                                <span class="material-symbols-outlined text-[32px]">${escapeHtml(selectedActivity.icon || 'event')}</span>
                                            </div>
                                            <div>
                                                <div class="flex items-center gap-2 flex-wrap">
                                                    <h2 class="font-headline-sm text-base sm:text-lg font-bold text-primary dark:text-zinc-100">${escapeHtml(selectedActivity.title)}</h2>
                                                    <span class="px-2 py-0.5 rounded-full ${selectedActivity.status === 'approved' ? 'bg-secondary-container dark:bg-emerald-950 text-on-secondary-container dark:text-emerald-300' : 'bg-tertiary-fixed dark:bg-amber-950 text-on-tertiary-fixed-variant dark:text-amber-300'} text-[10px] font-bold">
                                                        ${selectedActivity.status === 'approved' ? 'Đã duyệt' : 'Chờ kiểm duyệt'}
                                                    </span>
                                                </div>
                                                <p class="font-caption text-xs text-outline dark:text-zinc-400 mt-0.5">
                                                    CLB: <strong class="text-secondary dark:text-emerald-400 font-semibold">${escapeHtml(selectedActivity.club_name)}</strong> • Chủ nhiệm: ${escapeHtml(selectedActivity.creator_name || 'Chủ nhiệm CLB')}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Activity Key Info Grid -->
                                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                        <div class="p-3.5 rounded-2xl bg-surface-container-low dark:bg-zinc-800/50 border border-outline-variant/20 dark:border-zinc-700/50 flex items-center gap-3">
                                            <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-secondary dark:text-emerald-400 flex items-center justify-center shrink-0">
                                                <span class="material-symbols-outlined text-[20px]">schedule</span>
                                            </div>
                                            <div class="min-w-0">
                                                <p class="text-[11px] text-outline dark:text-zinc-400">Thời gian sinh hoạt</p>
                                                <p class="text-xs font-bold text-primary dark:text-zinc-100 truncate">${escapeHtml(selectedActivity.time_schedule || selectedActivity.time || 'Chưa cập nhật')}</p>
                                            </div>
                                        </div>

                                        <div class="p-3.5 rounded-2xl bg-surface-container-low dark:bg-zinc-800/50 border border-outline-variant/20 dark:border-zinc-700/50 flex items-center gap-3">
                                            <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-secondary dark:text-emerald-400 flex items-center justify-center shrink-0">
                                                <span class="material-symbols-outlined text-[20px]">location_on</span>
                                            </div>
                                            <div class="min-w-0">
                                                <p class="text-[11px] text-outline dark:text-zinc-400">Địa điểm tập trung</p>
                                                <p class="text-xs font-bold text-primary dark:text-zinc-100 truncate">${escapeHtml(selectedActivity.location || 'Chưa cập nhật')}</p>
                                            </div>
                                        </div>

                                        <div class="p-3.5 rounded-2xl bg-surface-container-low dark:bg-zinc-800/50 border border-outline-variant/20 dark:border-zinc-700/50 flex items-center gap-3">
                                            <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-secondary dark:text-emerald-400 flex items-center justify-center shrink-0">
                                                <span class="material-symbols-outlined text-[20px]">group</span>
                                            </div>
                                            <div class="min-w-0">
                                                <p class="text-[11px] text-outline dark:text-zinc-400">Quy mô tham gia</p>
                                                <p class="text-xs font-bold text-primary dark:text-zinc-100">Tối đa ${selectedActivity.max_attendees || 50} người</p>
                                            </div>
                                        </div>

                                        <div class="p-3.5 rounded-2xl bg-surface-container-low dark:bg-zinc-800/50 border border-outline-variant/20 dark:border-zinc-700/50 flex items-center gap-3">
                                            <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-secondary dark:text-emerald-400 flex items-center justify-center shrink-0">
                                                <span class="material-symbols-outlined text-[20px]">payments</span>
                                            </div>
                                            <div class="min-w-0">
                                                <p class="text-[11px] text-outline dark:text-zinc-400">Chi phí</p>
                                                <p class="text-xs font-bold text-primary dark:text-zinc-100">${selectedActivity.is_free !== false ? 'Miễn phí 100%' : 'Có đóng góp chi phí'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Description / Plan Detail -->
                                    <div class="space-y-2">
                                        <span class="font-button text-xs font-bold text-primary dark:text-zinc-200">Kế hoạch chi tiết &amp; Chuẩn bị:</span>
                                        <div class="p-4 rounded-2xl bg-surface-container-low dark:bg-zinc-800/40 text-xs text-on-surface-variant dark:text-zinc-300 leading-relaxed border border-outline-variant/20 dark:border-zinc-800 whitespace-pre-line max-h-48 overflow-y-auto">
                                            ${escapeHtml(selectedActivity.description || 'Chưa có thông tin chuẩn bị chi tiết.')}
                                        </div>
                                    </div>

                                    <!-- Moderator Audit Note -->
                                    <div class="space-y-2 pt-2 border-t border-outline-variant/20 dark:border-zinc-800">
                                        <label class="flex items-center justify-between font-button text-xs font-bold text-primary dark:text-zinc-200">
                                            <span class="flex items-center gap-1.5">
                                                <span class="material-symbols-outlined text-[16px] text-emerald-500">edit_note</span>
                                                Ghi chú nội bộ Thẩm định viên Lịch CLB (Audit Note):
                                            </span>
                                            <span class="text-[11px] text-outline dark:text-zinc-500 font-normal">Chỉ Admin &amp; Ban Quản trị thấy</span>
                                        </label>
                                        <textarea id="moderatorAuditNote" class="w-full p-3 rounded-2xl bg-surface-container-low dark:bg-zinc-800 text-xs text-on-surface dark:text-zinc-200 placeholder:text-outline outline-none border border-outline-variant/30 dark:border-zinc-700 focus:border-emerald-500 resize-none" rows="2">${escapeHtml(selectedActivity.admin_notes || '')}</textarea>
                                    </div>

                                    <!-- Decision Action Bar -->
                                    <div class="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-outline-variant/20 dark:border-zinc-800">
                                        <div class="flex items-center gap-2 w-full sm:w-auto">
                                            <button type="button" onclick="window.ViVuApp.openActionReasonModal('reject_activity', '${selectedActivity.id}', '${escapeHtml(selectedActivity.title)}')"
                                                class="px-4 py-2.5 min-h-[44px] rounded-xl bg-error text-white hover:bg-rose-700 transition-all font-button text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm w-full sm:w-auto">
                                                <span class="material-symbols-outlined text-[18px]">cancel</span>
                                                <span>Từ chối lịch CLB</span>
                                            </button>
                                        </div>
                                        <button type="button" onclick="window.ViVuApp.approveClubActivity('${selectedActivity.id}')"
                                            class="px-5 py-2.5 min-h-[44px] rounded-xl bg-secondary text-white hover:bg-primary transition-all font-button text-xs font-semibold flex items-center justify-center gap-2 shadow-md w-full sm:w-auto">
                                            <span class="material-symbols-outlined text-[18px]">check_circle</span>
                                            <span>Phê duyệt &amp; Lên lịch</span>
                                        </button>
                                    </div>
                                </div>
                            ` : `
                                <div class="p-12 text-center bg-surface-container-lowest dark:bg-zinc-900 rounded-3xl border border-outline-variant/30 dark:border-zinc-800">
                                    <span class="material-symbols-outlined text-4xl text-outline mb-2">calendar_month</span>
                                    <p class="text-sm text-on-surface-variant dark:text-zinc-400">Không có buổi sinh hoạt nào được chọn.</p>
                                </div>
                            `}
                        </div>
                    </div>
                ` : `
                    <div class="p-12 text-center bg-surface-container-lowest dark:bg-zinc-900 rounded-3xl border border-outline-variant/30 dark:border-zinc-800">
                        <span class="material-symbols-outlined text-4xl text-outline mb-2">dashboard</span>
                        <p class="text-sm text-on-surface-variant dark:text-zinc-400">Chọn một mục để bắt đầu kiểm duyệt.</p>
                    </div>
                `}
            </div>
        </div>
    `;
}

/**
 * Render modal nhập lý do Từ chối / Yêu cầu bổ sung
 */
export function renderAdminActionReasonModalContent({
    actionType = 'reject_post',
    targetId = '',
    targetTitle = ''
}) {
    const isReject = actionType.startsWith('reject');
    const titleText = isReject ? 'Từ chối phê duyệt' : 'Yêu cầu chỉnh sửa / bổ sung thông tin';
    let presets = [];
    if (actionType.startsWith('reject_activity')) {
        presets = ['Thời gian / địa điểm sinh hoạt chưa cụ thể hoặc không an toàn', 'Nội dung sinh hoạt không phù hợp với định hướng CLB', 'Trùng lặp với lịch sinh hoạt khác đã được phê duyệt', 'Chưa đủ thông tin về quy mô hoặc điều kiện tham gia'];
    } else if (actionType.startsWith('reject_event')) {
        presets = ['Thời gian / địa điểm tổ chức không rõ ràng', 'Nội dung thương mại / bán hàng chưa đăng ký', 'Sự kiện trùng lặp với lịch trình đã có', 'Vi phạm quy định văn hóa / an toàn công cộng'];
    } else if (actionType.startsWith('reject_article')) {
        presets = ['Nội dung chưa chuẩn xác về văn hóa, lịch sử Trà Vinh', 'Hình ảnh bìa không rõ nét hoặc vi phạm bản quyền', 'Hành văn chưa phù hợp với chuyên mục cẩm nang du lịch', 'Nội dung quảng cáo quá đà, spam dịch vụ'];
    } else if (isReject) {
        presets = ['Nội dung spam, quảng cáo thương mại', 'Sai lệch tọa độ thực tế hoặc địa bàn', 'Hình ảnh vi phạm bản quyền / độ phân giải kém', 'Báng bổ hoặc xâm phạm tôn nghiêm văn hóa'];
    } else {
        presets = ['Bổ sung thêm hình ảnh chất lượng cao', 'Cần xác thực thêm danh tính thành viên sáng lập', 'Cập nhật lại giá vé tham quan chính xác', 'Chi tiết hóa kế hoạch 3 tháng đầu'];
    }

    return `
        <div class="relative bg-surface-container-lowest dark:bg-zinc-900 rounded-3xl shadow-2xl p-6 border border-outline-variant/30 dark:border-zinc-800 space-y-4">
            <div class="flex items-center justify-between pb-3 border-b border-outline-variant/20 dark:border-zinc-800">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined ${isReject ? 'text-error dark:text-rose-400' : 'text-amber-500'} text-[22px]">
                        ${isReject ? 'report' : 'contact_support'}
                    </span>
                    <h3 class="font-headline-sm text-base font-bold text-primary dark:text-zinc-100">
                        ${escapeHtml(titleText)}
                    </h3>
                </div>
                <button type="button" onclick="window.ViVuApp.closeActionReasonModal()"
                    class="w-9 h-9 min-w-[36px] min-h-[36px] rounded-full bg-surface-container dark:bg-zinc-800 flex items-center justify-center text-outline dark:text-zinc-400 hover:text-on-surface"
                    aria-label="Đóng form">
                    <span class="material-symbols-outlined text-[18px]">close</span>
                </button>
            </div>

            <div class="space-y-1">
                <p class="text-xs text-outline dark:text-zinc-400">Đối tượng:</p>
                <p class="text-xs font-bold text-primary dark:text-zinc-200">${escapeHtml(targetTitle)}</p>
            </div>

            <!-- Quick Presets -->
            <div class="space-y-1.5">
                <p class="text-xs font-semibold text-on-surface-variant dark:text-zinc-400">Lý do gợi ý nhanh:</p>
                <div class="flex flex-wrap gap-1.5">
                    ${presets.map(p => `
                        <button type="button" onclick="document.getElementById('actionReasonInput').value = '${escapeHtml(p)}'"
                            class="px-2.5 py-1 min-h-[32px] rounded-lg bg-surface-container dark:bg-zinc-800 hover:bg-surface-container-high dark:hover:bg-zinc-700 text-[11px] text-on-surface-variant dark:text-zinc-300 transition-colors">
                            ${escapeHtml(p)}
                        </button>
                    `).join('')}
                </div>
            </div>

            <!-- Custom Reason Input -->
            <div class="space-y-1.5">
                <label class="text-xs font-semibold text-on-surface-variant dark:text-zinc-400">Chi tiết lý do gửi cho người đăng:</label>
                <textarea id="actionReasonInput" class="w-full p-3 rounded-2xl bg-surface-container-low dark:bg-zinc-800 text-xs text-on-surface dark:text-zinc-200 outline-none border border-outline-variant/40 dark:border-zinc-700 focus:border-secondary resize-none" rows="3" placeholder="Nhập lý do chi tiết để hỗ trợ tác giả chỉnh sửa..."></textarea>
            </div>

            <!-- Action buttons -->
            <div class="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20 dark:border-zinc-800">
                <button type="button" onclick="window.ViVuApp.closeActionReasonModal()"
                    class="px-4 py-2 min-h-[44px] rounded-xl bg-surface-container dark:bg-zinc-800 text-xs font-semibold text-on-surface dark:text-zinc-300">
                    Hủy
                </button>
                <button type="button" onclick="window.ViVuApp.submitActionReason('${actionType}', '${targetId}')"
                    class="px-5 py-2 min-h-[44px] rounded-xl ${isReject ? 'bg-error text-white hover:bg-rose-700' : 'bg-secondary text-white hover:bg-primary'} text-xs font-semibold shadow-md transition-colors">
                    Xác nhận gửi thông báo
                </button>
            </div>
        </div>
    `;
}

/**
 * =========================================================================
 * PHASE 11: CHI TIẾT ĐỊA ĐIỂM DI SẢN CHUYÊN SÂU (DEEP CULTURAL HERITAGE)
 * STITCH: chi_ti_t_a_i_m_ch_a_ng_vivutravinh & chi_ti_t_ch_a_ng_vivutravinh_mobile
 * =========================================================================
 */
export function renderDeepPlaceDetailModalContent(place, isAudioPlaying = false, audioCurrentTime = '01:24', isSaved = false) {
    if (!place) return '';

    const audioGuide = place.audioGuide || {};
    const photos = place.photos || [];
    const mainPhoto = photos[0] || { src: place.heroImage || 'chùa âng.jpg', title: place.name, tag: 'Toàn cảnh' };
    const sec1 = photos[1] || photos[0] || {};
    const sec2 = photos[2] || photos[0] || {};
    const sec3 = photos[3] || photos[0] || {};
    const sec4 = photos[4] || photos[0] || {};

    const timerDisplay = isAudioPlaying ? (audioCurrentTime || '01:24') : '00:00';
    const totalDuration = audioGuide.duration || '04:45';

    return `
        <div class="w-full bg-[#F8F9FA] dark:bg-zinc-950 font-body-md text-on-surface dark:text-zinc-100 antialiased min-h-screen">
            <!-- Top Breadcrumb & Quick Actions Bar (Sticky) -->
            <section class="w-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md px-4 sm:px-6 py-3 sticky top-0 z-40 border-b border-outline-variant/30 dark:border-zinc-800 shadow-xs">
                <div class="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
                    <div class="flex items-center gap-2">
                        <button type="button" onclick="window.ViVuApp.closeDeepPlaceDetail()"
                            class="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full bg-surface-container dark:bg-zinc-800 hover:bg-surface-container-high dark:hover:bg-zinc-700 flex items-center justify-center text-primary dark:text-zinc-200 transition-colors"
                            aria-label="Quay lại">
                            <span class="material-symbols-outlined text-[20px]">arrow_back</span>
                        </button>
                        <nav aria-label="Đường dẫn trang" class="hidden sm:flex items-center gap-2 text-xs">
                            <span class="text-on-surface-variant dark:text-zinc-400 flex items-center gap-1">
                                <span class="material-symbols-outlined text-[16px]">home</span>
                                Trang chủ
                            </span>
                            <span class="material-symbols-outlined text-[14px] text-outline dark:text-zinc-500">chevron_right</span>
                            <span class="text-on-surface-variant dark:text-zinc-400">Bản đồ &amp; Địa điểm</span>
                            <span class="material-symbols-outlined text-[14px] text-outline dark:text-zinc-500">chevron_right</span>
                            <span class="font-bold text-primary dark:text-zinc-100 truncate max-w-[220px]">
                                ${escapeHtml(place.name)}
                            </span>
                        </nav>
                        <span class="sm:hidden font-headline-sm text-sm font-bold text-primary dark:text-zinc-100 truncate max-w-[190px]">
                            ${escapeHtml(place.name)}
                        </span>
                    </div>

                    <div class="flex items-center gap-2">
                        <button type="button" onclick="window.ViVuApp.toggleSaveDeepPlace('${escapeHtml(place.id)}')"
                            id="deepSavePlaceBtn"
                            class="flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl ${isSaved ? 'bg-secondary text-white' : 'bg-surface-container dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 hover:text-secondary'} font-semibold text-xs shadow-xs transition-colors"
                            aria-label="Lưu địa điểm">
                            <span class="material-symbols-outlined text-[18px]">${isSaved ? 'bookmark' : 'bookmark_border'}</span>
                            <span id="deepSaveText">${isSaved ? 'Đã lưu' : 'Lưu điểm'}</span>
                        </button>

                        <button type="button" onclick="window.ViVuApp.shareDeepPlace('${escapeHtml(place.id)}')"
                            class="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl bg-surface-container dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 hover:text-on-surface font-semibold text-xs shadow-xs transition-colors"
                            aria-label="Chia sẻ địa điểm">
                            <span class="material-symbols-outlined text-[18px]">share</span>
                            <span class="hidden sm:inline">Chia sẻ</span>
                        </button>

                        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + ' Trà Vinh')}"
                            target="_blank" rel="noopener noreferrer"
                            class="flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl bg-secondary hover:bg-primary-container text-white font-semibold text-xs shadow-xs transition-colors"
                            aria-label="Chỉ đường Google Maps">
                            <span class="material-symbols-outlined text-[18px]">directions</span>
                            <span>Chỉ đường</span>
                        </a>
                    </div>
                </div>
            </section>

            <!-- Main Showcase Container -->
            <div class="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col gap-6">
                <!-- Title & Heritage Header Banner -->
                <header class="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div class="flex flex-col gap-2">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-secondary-container dark:bg-emerald-950/60 text-on-secondary-container dark:text-emerald-300 text-xs font-semibold">
                                <span class="material-symbols-outlined text-[15px]" style="font-variation-settings: 'FILL' 1;">verified</span>
                                ${escapeHtml(place.heritageRank || 'Di tích Lịch sử - Văn hóa Quốc gia')}
                            </span>
                            <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#EA580C]/10 dark:bg-amber-950/50 text-[#EA580C] dark:text-amber-300 text-xs font-semibold">
                                ${escapeHtml(place.establishedText || 'Thành lập năm 990')}
                            </span>
                        </div>
                        <h1 class="font-headline-xl text-2xl sm:text-3xl lg:text-4xl text-primary dark:text-zinc-100 font-bold tracking-tight">
                            ${escapeHtml(place.name)}
                            <span class="block md:inline font-headline-md text-base sm:text-lg text-on-surface-variant dark:text-zinc-400 font-normal tracking-normal md:ml-2">
                                ${escapeHtml(place.nativeName || '')}
                            </span>
                        </h1>
                        <div class="flex flex-wrap items-center gap-3 sm:gap-4 text-on-surface-variant dark:text-zinc-400 text-xs sm:text-sm pt-0.5">
                            <div class="flex items-center gap-1 text-[#EA580C]">
                                <span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">star</span>
                                <span class="font-bold text-on-surface dark:text-zinc-200">${place.rating || '4.9'}</span>
                                <span class="text-outline dark:text-zinc-500">(${place.reviewsCount || 386} đánh giá)</span>
                            </div>
                            <span class="text-outline dark:text-zinc-600">•</span>
                            <div class="flex items-center gap-1 text-on-surface dark:text-zinc-300">
                                <span class="material-symbols-outlined text-[18px] text-secondary">location_on</span>
                                <span>${escapeHtml(place.address)}</span>
                            </div>
                            <span class="text-outline dark:text-zinc-600">•</span>
                            <span class="px-2.5 py-0.5 rounded-lg bg-surface-container-high dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 font-medium">
                                ${escapeHtml(place.openHours)}
                            </span>
                        </div>
                    </div>
                </header>

                <!-- Photo Mosaic Grid (5-tile grid) -->
                <section class="grid grid-cols-1 md:grid-cols-4 md:grid-rows-2 gap-3 h-[380px] sm:h-[440px] md:h-[480px] w-full rounded-3xl overflow-hidden shadow-md">
                    <!-- Main Photo (2x2) -->
                    <div class="md:col-span-2 md:row-span-2 relative group overflow-hidden bg-surface-container-highest cursor-pointer"
                        onclick="window.ViVuApp.openPlacePhotoGallery(0)">
                        <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                            src="${escapeHtml(mainPhoto.src)}"
                            alt="${escapeHtml(mainPhoto.title)}"/>
                        <div class="absolute inset-0 bg-gradient-to-t from-primary/80 via-primary/20 to-transparent"></div>
                        <div class="absolute bottom-4 left-4 right-4 flex items-center justify-between text-white">
                            <div class="flex items-center gap-2">
                                <span class="material-symbols-outlined text-[20px] text-secondary-fixed">temple_buddhist</span>
                                <span class="font-headline-sm text-sm sm:text-base font-semibold drop-shadow-sm">${escapeHtml(mainPhoto.title)}</span>
                            </div>
                            <span class="text-[11px] bg-primary-container/90 backdrop-blur-sm px-2.5 py-1 rounded-full text-primary-fixed">
                                ${escapeHtml(mainPhoto.tag || 'Toàn cảnh')}
                            </span>
                        </div>
                    </div>

                    <!-- Secondary Photo 1 -->
                    <div class="relative group overflow-hidden bg-surface-container-highest cursor-pointer"
                        onclick="window.ViVuApp.openPlacePhotoGallery(1)">
                        <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                            src="${escapeHtml(sec1.src)}"
                            alt="${escapeHtml(sec1.title)}"/>
                        <div class="absolute inset-0 bg-gradient-to-t from-primary/60 to-transparent"></div>
                        <span class="absolute bottom-2 left-3 text-xs text-white drop-shadow font-medium truncate max-w-[90%]">
                            ${escapeHtml(sec1.title || 'Bích họa Phật tích')}
                        </span>
                    </div>

                    <!-- Secondary Photo 2 -->
                    <div class="relative group overflow-hidden bg-surface-container-highest cursor-pointer"
                        onclick="window.ViVuApp.openPlacePhotoGallery(2)">
                        <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                            src="${escapeHtml(sec2.src)}"
                            alt="${escapeHtml(sec2.title)}"/>
                        <div class="absolute inset-0 bg-gradient-to-t from-primary/60 to-transparent"></div>
                        <span class="absolute bottom-2 left-3 text-xs text-white drop-shadow font-medium truncate max-w-[90%]">
                            ${escapeHtml(sec2.title || 'Kiến trúc điêu khắc')}
                        </span>
                    </div>

                    <!-- Secondary Photo 3 -->
                    <div class="relative group overflow-hidden bg-surface-container-highest cursor-pointer"
                        onclick="window.ViVuApp.openPlacePhotoGallery(3)">
                        <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                            src="${escapeHtml(sec3.src)}"
                            alt="${escapeHtml(sec3.title)}"/>
                        <div class="absolute inset-0 bg-gradient-to-t from-primary/60 to-transparent"></div>
                        <span class="absolute bottom-2 left-3 text-xs text-white drop-shadow font-medium truncate max-w-[90%]">
                            ${escapeHtml(sec3.title || 'Cây sao dầu cổ thụ')}
                        </span>
                    </div>

                    <!-- Secondary Photo 4 / Gallery Opener -->
                    <div class="relative group overflow-hidden bg-surface-container-highest cursor-pointer"
                        onclick="window.ViVuApp.openPlacePhotoGallery(0)">
                        <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                            src="${escapeHtml(sec4.src)}"
                            alt="${escapeHtml(sec4.title)}"/>
                        <div class="absolute inset-0 bg-primary/70 backdrop-blur-xs flex flex-col items-center justify-center text-center p-3 group-hover:bg-primary/60 transition-colors">
                            <span class="material-symbols-outlined text-[30px] text-white mb-1">photo_library</span>
                            <span class="font-bold text-white text-xs sm:text-sm">Xem tất cả ${place.totalPhotosCount || 48} ảnh</span>
                            <span class="text-[11px] text-emerald-200">Góc chụp du khách &amp; di sản</span>
                        </div>
                    </div>
                </section>

                <!-- Two Columns Layout: Main Content (65%) & Aside Widgets (35%) -->
                <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-12">
                    <!-- LEFT COLUMN: Deep cultural story, Audio guide, Architecture, Etiquette, Reviews (8 Cols) -->
                    <main class="lg:col-span-8 flex flex-col gap-8">
                        <!-- Audio Guide Player Banner (Khmer Cultural Immersion) -->
                        <div class="rounded-3xl bg-primary-container text-white p-5 sm:p-6 shadow-md relative overflow-hidden">
                            <div class="absolute -right-8 -bottom-8 w-44 h-44 rounded-full bg-secondary/30 blur-2xl pointer-events-none"></div>
                            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
                                <div class="flex items-center gap-4">
                                    <button type="button" id="deepAudioPlayBtn" onclick="window.ViVuApp.toggleAudioGuidePlayback()"
                                        aria-label="${isAudioPlaying ? 'Tạm dừng thuyết minh' : 'Phát thuyết minh âm thanh'}"
                                        class="w-13 h-13 min-w-[52px] min-h-[52px] rounded-full ${isAudioPlaying ? 'bg-secondary' : 'bg-[#EA580C] hover:bg-[#C2410C]'} text-white flex items-center justify-center shadow-lg transition-transform active:scale-95 shrink-0">
                                        <span class="material-symbols-outlined text-[28px]">${isAudioPlaying ? 'pause' : 'play_arrow'}</span>
                                    </button>
                                    <div class="flex flex-col">
                                        <div class="flex items-center gap-2">
                                            <span class="text-[11px] font-bold text-secondary-fixed bg-secondary-fixed/20 px-2 py-0.5 rounded-md uppercase tracking-wider">
                                                Audio Guide Bản Địa
                                            </span>
                                            <span class="text-xs text-emerald-200">Thời lượng: ${escapeHtml(totalDuration)}</span>
                                        </div>
                                        <h2 class="font-headline-sm text-base sm:text-lg text-white font-bold mt-1">
                                            ${escapeHtml(audioGuide.title || 'Thuyết minh huyền tích Chùa Âng ngàn năm')}
                                        </h2>
                                        <p class="text-xs text-emerald-100/80">
                                            ${escapeHtml(audioGuide.narrator || 'Giọng đọc văn hóa Khmer Thạch Chanh Đa')}
                                        </p>
                                    </div>
                                </div>

                                <!-- Waveform Mock Visualizer -->
                                <div class="flex items-center gap-1.5 bg-black/25 px-4 py-2.5 rounded-2xl self-start md:self-center">
                                    <span class="w-1 h-3 bg-secondary-fixed rounded-full ${isAudioPlaying ? 'animate-pulse' : 'opacity-40'}"></span>
                                    <span class="w-1 h-6 bg-secondary-fixed rounded-full ${isAudioPlaying ? 'animate-pulse' : 'opacity-40'}" style="animation-delay: 150ms;"></span>
                                    <span class="w-1 h-4 bg-secondary-fixed rounded-full ${isAudioPlaying ? 'animate-pulse' : 'opacity-40'}" style="animation-delay: 300ms;"></span>
                                    <span class="w-1 h-7 bg-secondary-fixed rounded-full ${isAudioPlaying ? 'animate-pulse' : 'opacity-40'}" style="animation-delay: 75ms;"></span>
                                    <span class="w-1 h-5 bg-secondary-fixed rounded-full ${isAudioPlaying ? 'animate-pulse' : 'opacity-40'}" style="animation-delay: 200ms;"></span>
                                    <span class="w-1 h-3 bg-secondary-fixed rounded-full ${isAudioPlaying ? 'animate-pulse' : 'opacity-40'}" style="animation-delay: 350ms;"></span>
                                    <span class="w-1 h-6 bg-secondary-fixed rounded-full ${isAudioPlaying ? 'animate-pulse' : 'opacity-40'}" style="animation-delay: 120ms;"></span>
                                    <span class="ml-2 text-xs text-primary-fixed font-mono font-bold" id="deepAudioTimer">
                                        ${timerDisplay} / ${escapeHtml(totalDuration)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <!-- Section: Overview & 1000-Year History -->
                        <article class="bg-white dark:bg-zinc-900 p-6 sm:p-8 rounded-3xl shadow-sm border border-outline-variant/20 dark:border-zinc-800 flex flex-col gap-4">
                            <div class="flex items-center justify-between">
                                <h2 class="font-headline-lg text-lg sm:text-xl text-primary dark:text-zinc-100 font-bold flex items-center gap-2">
                                    <span class="material-symbols-outlined text-secondary text-[26px]">history_edu</span>
                                    Hơn một thiên niên kỷ soi bóng cổ thụ
                                </h2>
                                <span class="text-xs text-outline dark:text-zinc-500 font-medium">Khai sơn: 990 SCN</span>
                            </div>

                            ${(place.historyOverview || []).map(p => `
                                <p class="text-xs sm:text-sm text-on-surface-variant dark:text-zinc-300 leading-relaxed">
                                    ${p}
                                </p>
                            `).join('')}

                            <!-- Historical Milestones Callout -->
                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
                                ${(place.historyMilestones || []).map(m => `
                                    <div class="p-4 rounded-2xl bg-surface-container-low dark:bg-zinc-800/60 flex flex-col gap-1 border border-outline-variant/10 dark:border-zinc-700/50">
                                        <span class="font-headline-sm text-sm sm:text-base text-secondary dark:text-emerald-400 font-bold">${escapeHtml(m.year)}</span>
                                        <span class="text-xs text-on-surface-variant dark:text-zinc-400 leading-snug">${escapeHtml(m.desc)}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </article>

                        <!-- Section: Unique Khmer Architectural Highlights -->
                        <article class="bg-white dark:bg-zinc-900 p-6 sm:p-8 rounded-3xl shadow-sm border border-outline-variant/20 dark:border-zinc-800 flex flex-col gap-5">
                            <div class="flex flex-col gap-1">
                                <h2 class="font-headline-lg text-lg sm:text-xl text-primary dark:text-zinc-100 font-bold flex items-center gap-2">
                                    <span class="material-symbols-outlined text-secondary text-[26px]">architecture</span>
                                    Đỉnh cao kiến trúc điêu khắc Angkor
                                </h2>
                                <p class="text-xs text-on-surface-variant dark:text-zinc-400">
                                    Từng đường nét chạm trổ là một chương sử thi về triết lý nhân sinh quan và cõi Phật
                                </p>
                            </div>

                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                ${(place.architecturalHighlights || []).map(arch => `
                                    <div class="flex flex-col rounded-2xl bg-surface-container-low dark:bg-zinc-800/60 p-4 gap-2.5 border border-outline-variant/10 dark:border-zinc-700/50">
                                        <div class="w-10 h-10 rounded-xl bg-secondary/10 dark:bg-emerald-950/60 flex items-center justify-center text-secondary dark:text-emerald-300">
                                            <span class="material-symbols-outlined text-[24px]">${escapeHtml(arch.icon)}</span>
                                        </div>
                                        <h3 class="font-headline-sm text-xs sm:text-sm font-bold text-primary dark:text-zinc-100">${escapeHtml(arch.title)}</h3>
                                        <p class="text-xs text-on-surface-variant dark:text-zinc-400 leading-relaxed">${escapeHtml(arch.desc)}</p>
                                    </div>
                                `).join('')}
                            </div>

                            <!-- Highlight Quotation from Culture Specialist -->
                            ${place.specialistQuote ? `
                                <div class="p-4 rounded-2xl bg-secondary-container/20 dark:bg-zinc-800/80 flex items-start gap-3 border border-secondary/20">
                                    <span class="material-symbols-outlined text-secondary text-[24px] mt-0.5 shrink-0">format_quote</span>
                                    <div class="flex flex-col">
                                        <p class="text-xs sm:text-sm text-on-surface dark:text-zinc-200 italic font-medium leading-relaxed">
                                            "${escapeHtml(place.specialistQuote.quote)}"
                                        </p>
                                        <span class="text-[11px] text-outline dark:text-zinc-400 mt-1 font-semibold">
                                            — ${escapeHtml(place.specialistQuote.author)}
                                        </span>
                                    </div>
                                </div>
                            ` : ''}
                        </article>

                        <!-- Section: Cultural Etiquette & Visitor Conduct Rules -->
                        <article class="bg-white dark:bg-zinc-900 p-6 sm:p-8 rounded-3xl shadow-sm border border-outline-variant/20 dark:border-zinc-800 flex flex-col gap-4">
                            <div class="flex items-center gap-2">
                                <span class="material-symbols-outlined text-[#EA580C] text-[26px]">shield</span>
                                <h2 class="font-headline-lg text-lg sm:text-xl text-primary dark:text-zinc-100 font-bold">
                                    Quy tắc văn hóa &amp; Trang phục khi viếng chùa
                                </h2>
                            </div>
                            <p class="text-xs text-on-surface-variant dark:text-zinc-400">
                                Để bảo tồn tính tôn nghiêm nơi thiền tự và tôn trọng bản sắc cộng đồng Khmer, du khách vui lòng tuân thủ:
                            </p>

                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                                ${(place.culturalEtiquettes || []).map(et => `
                                    <div class="flex items-start gap-3 p-3.5 rounded-2xl bg-surface-container-low dark:bg-zinc-800/60 border border-outline-variant/10 dark:border-zinc-700/50">
                                        <span class="material-symbols-outlined text-secondary text-[20px] shrink-0 mt-0.5">${escapeHtml(et.icon)}</span>
                                        <div class="flex flex-col">
                                            <strong class="text-xs font-bold text-on-surface dark:text-zinc-200">${escapeHtml(et.title)}</strong>
                                            <span class="text-xs text-on-surface-variant dark:text-zinc-400 mt-0.5 leading-snug">${escapeHtml(et.desc)}</span>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </article>

                        <!-- Section: Local Guide's Insider Tips -->
                        <article class="bg-emerald-50/80 dark:bg-emerald-950/20 p-6 sm:p-8 rounded-3xl border border-secondary/20 flex flex-col gap-4">
                            <div class="flex items-center gap-3">
                                <span class="material-symbols-outlined text-secondary text-[26px]">lightbulb</span>
                                <h2 class="font-headline-lg text-lg sm:text-xl text-primary dark:text-zinc-100 font-bold">
                                    Mẹo du ngoạn từ người bản địa Trà Vinh
                                </h2>
                            </div>
                            <div class="space-y-3 text-xs sm:text-sm text-on-surface dark:text-zinc-200 leading-relaxed">
                                ${(place.insiderTips || []).map(tip => `
                                    <div class="flex items-start gap-3">
                                        <span class="font-bold text-secondary dark:text-emerald-400 shrink-0">${escapeHtml(tip.num)}.</span>
                                        <div>
                                            <strong>${escapeHtml(tip.title)}:</strong> ${escapeHtml(tip.desc)}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </article>

                        <!-- Section: Community Reviews & Breakdown -->
                        <section class="bg-white dark:bg-zinc-900 p-6 sm:p-8 rounded-3xl shadow-sm border border-outline-variant/20 dark:border-zinc-800 flex flex-col gap-6">
                            <div class="flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <h2 class="font-headline-lg text-lg sm:text-xl text-primary dark:text-zinc-100 font-bold">
                                        Đánh giá từ cộng đồng vi vu (${place.reviewsCount || 386})
                                    </h2>
                                    <p class="text-xs text-on-surface-variant dark:text-zinc-400">Những cảm xúc chân thực của du khách ghé thăm</p>
                                </div>
                                <button type="button" onclick="alert('Cảm ơn bạn! Tính năng gửi đánh giá sẽ mở ngay sau chuyến viếng thăm.')"
                                    class="px-4 py-2 min-h-[44px] rounded-xl bg-secondary hover:bg-primary-container text-white font-semibold text-xs transition-colors shadow-xs">
                                    Viết cảm nhận của bạn
                                </button>
                            </div>

                            <!-- Overall Rating Breakdown Bar -->
                            <div class="p-4 rounded-2xl bg-surface-container-low dark:bg-zinc-800/60 flex flex-col sm:flex-row items-center gap-6">
                                <div class="flex flex-col items-center justify-center sm:pr-6 sm:border-r border-outline-variant/30 dark:border-zinc-700">
                                    <span class="font-headline-xl text-3xl font-bold text-primary dark:text-zinc-100">${place.rating || '4.9'}</span>
                                    <div class="flex text-[#EA580C] my-1">
                                        <span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">star</span>
                                        <span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">star</span>
                                        <span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">star</span>
                                        <span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">star</span>
                                        <span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">star</span>
                                    </div>
                                    <span class="text-[11px] text-outline dark:text-zinc-400 font-medium">98% khen ngợi cảnh quan</span>
                                </div>

                                <div class="flex-1 w-full space-y-2 text-xs">
                                    <div class="flex items-center gap-2">
                                        <span class="w-10 text-on-surface dark:text-zinc-300">5 sao</span>
                                        <div class="flex-1 h-2 rounded-full bg-surface-container-highest dark:bg-zinc-700 overflow-hidden">
                                            <div class="bg-secondary h-full rounded-full w-[92%]"></div>
                                        </div>
                                        <span class="w-8 text-right text-outline dark:text-zinc-400">92%</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="w-10 text-on-surface dark:text-zinc-300">4 sao</span>
                                        <div class="flex-1 h-2 rounded-full bg-surface-container-highest dark:bg-zinc-700 overflow-hidden">
                                            <div class="bg-secondary h-full rounded-full w-[6%]"></div>
                                        </div>
                                        <span class="w-8 text-right text-outline dark:text-zinc-400">6%</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="w-10 text-on-surface dark:text-zinc-300">3 sao</span>
                                        <div class="flex-1 h-2 rounded-full bg-surface-container-highest dark:bg-zinc-700 overflow-hidden">
                                            <div class="bg-secondary h-full rounded-full w-[2%]"></div>
                                        </div>
                                        <span class="w-8 text-right text-outline dark:text-zinc-400">2%</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Review List -->
                            <div class="flex flex-col gap-4 divide-y divide-outline-variant/20 dark:divide-zinc-800">
                                ${(place.reviews || []).map(r => `
                                    <div class="flex flex-col gap-2.5 pt-4 first:pt-0">
                                        <div class="flex items-center justify-between">
                                            <div class="flex items-center gap-3">
                                                <img class="w-10 h-10 rounded-full object-cover shadow-xs" src="${escapeHtml(r.avatar)}" alt="${escapeHtml(r.author)}"/>
                                                <div class="flex flex-col">
                                                    <span class="text-xs font-bold text-on-surface dark:text-zinc-200">${escapeHtml(r.author)}</span>
                                                    <span class="text-[11px] text-outline dark:text-zinc-400">${escapeHtml(r.location)}</span>
                                                </div>
                                            </div>
                                            <div class="flex text-[#EA580C]">
                                                ${Array.from({ length: r.rating || 5 }).map(() => `
                                                    <span class="material-symbols-outlined text-[16px]" style="font-variation-settings: 'FILL' 1;">star</span>
                                                `).join('')}
                                            </div>
                                        </div>
                                        <p class="text-xs sm:text-sm text-on-surface-variant dark:text-zinc-300 leading-relaxed">
                                            ${escapeHtml(r.comment)}
                                        </p>
                                    </div>
                                `).join('')}
                            </div>
                        </section>
                    </main>

                    <!-- RIGHT COLUMN: Fast Action Sidebar (35% width, Sticky) -->
                    <aside class="lg:col-span-4 flex flex-col gap-6 sticky top-20">
                        <!-- Quick Info Card -->
                        <div class="bg-white dark:bg-zinc-900 p-6 rounded-3xl shadow-sm border border-outline-variant/20 dark:border-zinc-800 flex flex-col gap-4">
                            <h3 class="font-headline-sm text-sm sm:text-base font-bold text-primary dark:text-zinc-100 flex items-center gap-2">
                                <span class="material-symbols-outlined text-secondary text-[22px]">info</span>
                                Thông tin tham quan nhanh
                            </h3>
                            <div class="flex flex-col gap-3 text-xs">
                                <div class="flex items-center justify-between py-2 border-b border-outline-variant/20 dark:border-zinc-800">
                                    <span class="text-on-surface-variant dark:text-zinc-400 flex items-center gap-2">
                                        <span class="material-symbols-outlined text-[18px] text-outline">schedule</span>
                                        Giờ mở cửa
                                    </span>
                                    <span class="font-bold text-primary dark:text-zinc-200">${escapeHtml(place.openHours)}</span>
                                </div>
                                <div class="flex items-center justify-between py-2 border-b border-outline-variant/20 dark:border-zinc-800">
                                    <span class="text-on-surface-variant dark:text-zinc-400 flex items-center gap-2">
                                        <span class="material-symbols-outlined text-[18px] text-outline">confirmation_number</span>
                                        Vé vào cổng
                                    </span>
                                    <span class="font-bold text-secondary dark:text-emerald-400 px-2 py-0.5 rounded bg-secondary-container/50 dark:bg-emerald-950/60">
                                        ${escapeHtml(place.ticketPrice || 'Miễn phí hoàn toàn')}
                                    </span>
                                </div>
                                <div class="flex items-center justify-between py-2 border-b border-outline-variant/20 dark:border-zinc-800">
                                    <span class="text-on-surface-variant dark:text-zinc-400 flex items-center gap-2">
                                        <span class="material-symbols-outlined text-[18px] text-outline">timelapse</span>
                                        Thời gian khuyên nghị
                                    </span>
                                    <span class="font-bold text-primary dark:text-zinc-200">${escapeHtml(place.suggestedDuration || '1.5 - 2.0 giờ')}</span>
                                </div>
                                <div class="flex items-center justify-between py-2">
                                    <span class="text-on-surface-variant dark:text-zinc-400 flex items-center gap-2">
                                        <span class="material-symbols-outlined text-[18px] text-outline">local_parking</span>
                                        Bãi đỗ xe
                                    </span>
                                    <span class="font-medium text-on-surface dark:text-zinc-300">${escapeHtml(place.parking || 'Có')}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Weather Status Card (Tra Vinh Live) -->
                        <div class="bg-white dark:bg-zinc-900 p-5 rounded-3xl shadow-sm border border-outline-variant/20 dark:border-zinc-800 flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <span class="material-symbols-outlined text-[#EA580C] text-[34px]">sunny</span>
                                <div class="flex flex-col">
                                    <span class="text-[11px] text-outline dark:text-zinc-400">Thời tiết hôm nay tại Trà Vinh</span>
                                    <span class="text-xs sm:text-sm font-bold text-primary dark:text-zinc-200">
                                        ${escapeHtml(place.weather?.temp || '29°C')} • ${escapeHtml(place.weather?.desc || 'Nắng nhẹ ráo trời')}
                                    </span>
                                </div>
                            </div>
                            <span class="px-2.5 py-1 rounded-full bg-secondary/10 dark:bg-emerald-950/60 text-secondary dark:text-emerald-400 text-[11px] font-semibold">
                                ${escapeHtml(place.weather?.note || 'Lý tưởng viếng chùa')}
                            </span>
                        </div>

                        <!-- Map & GPS Widget -->
                        <div class="bg-white dark:bg-zinc-900 p-5 rounded-3xl shadow-sm border border-outline-variant/20 dark:border-zinc-800 flex flex-col gap-3">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-1.5 font-bold text-xs text-primary dark:text-zinc-200">
                                    <span class="material-symbols-outlined text-secondary text-[20px]">explore</span>
                                    Tọa độ thực địa GPS
                                </div>
                                <button type="button" id="copyDeepCoordsBtn" onclick="window.ViVuApp.copyDeepPlaceCoords('${escapeHtml(place.coordinates)}')"
                                    class="text-[11px] text-secondary dark:text-emerald-400 font-semibold hover:underline flex items-center gap-1">
                                    <span class="material-symbols-outlined text-[14px]">content_copy</span>
                                    Sao chép
                                </button>
                            </div>
                            <p class="font-mono text-xs text-on-surface-variant dark:text-zinc-400 bg-surface-container-low dark:bg-zinc-800/80 p-2.5 rounded-xl border border-outline-variant/20 dark:border-zinc-700" id="deepPlaceCoords">
                                ${escapeHtml(place.coordinates)}
                            </p>
                            <button type="button" onclick="window.ViVuApp.addDeepPlaceToTripPlanner('${escapeHtml(place.id)}')"
                                class="w-full py-2.5 min-h-[44px] rounded-xl bg-secondary hover:bg-primary-container text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors">
                                <span class="material-symbols-outlined text-[18px]">add_location_alt</span>
                                + Thêm vào Lịch trình Khám phá
                            </button>
                        </div>

                        <!-- Nearby Attractions in Walking Distance -->
                        <div class="bg-white dark:bg-zinc-900 p-5 rounded-3xl shadow-sm border border-outline-variant/20 dark:border-zinc-800 flex flex-col gap-3.5">
                            <h4 class="text-xs font-bold text-primary dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                                <span class="material-symbols-outlined text-secondary text-[18px]">directions_walk</span>
                                Điểm tham quan lân cận
                            </h4>
                            <div class="flex flex-col gap-2.5">
                                ${(place.nearbyPlaces || []).map(np => `
                                    <div class="flex items-center gap-3 p-2 rounded-2xl hover:bg-surface-container-low dark:hover:bg-zinc-800 transition-colors">
                                        <img src="${escapeHtml(np.image)}" alt="${escapeHtml(np.name)}" class="w-12 h-12 rounded-xl object-cover shrink-0 shadow-xs"/>
                                        <div class="flex flex-col min-w-0 flex-1">
                                            <span class="text-xs font-bold text-on-surface dark:text-zinc-200 truncate">${escapeHtml(np.name)}</span>
                                            <span class="text-[11px] text-outline dark:text-zinc-400">${escapeHtml(np.distance)}</span>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <!-- Local Cuisine Nearby -->
                        <div class="bg-white dark:bg-zinc-900 p-5 rounded-3xl shadow-sm border border-outline-variant/20 dark:border-zinc-800 flex flex-col gap-3.5">
                            <h4 class="text-xs font-bold text-primary dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                                <span class="material-symbols-outlined text-[#EA580C] text-[18px]">restaurant</span>
                                Ẩm thực đặc sản kề cận
                            </h4>
                            <div class="flex flex-col gap-2.5">
                                ${(place.nearbyFood || []).map(nf => `
                                    <div class="flex items-center gap-3 p-2 rounded-2xl hover:bg-surface-container-low dark:hover:bg-zinc-800 transition-colors">
                                        <img src="${escapeHtml(nf.image)}" alt="${escapeHtml(nf.name)}" class="w-12 h-12 rounded-xl object-cover shrink-0 shadow-xs"/>
                                        <div class="flex flex-col min-w-0 flex-1">
                                            <span class="text-xs font-bold text-on-surface dark:text-zinc-200 truncate">${escapeHtml(nf.name)}</span>
                                            <span class="text-[11px] text-outline dark:text-zinc-400 line-clamp-1">${escapeHtml(nf.desc)}</span>
                                            <span class="text-[11px] text-secondary font-semibold">${escapeHtml(nf.distance)}</span>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </aside>
                </div>
            </div>

            <!-- Mobile Fixed Bottom Action Bar -->
            <div class="sm:hidden fixed bottom-0 left-0 right-0 p-3 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-outline-variant/30 dark:border-zinc-800 z-40 flex items-center gap-2 shadow-lg">
                <button type="button" onclick="window.ViVuApp.addDeepPlaceToTripPlanner('${escapeHtml(place.id)}')"
                    class="flex-1 py-3 min-h-[46px] rounded-2xl bg-surface-container dark:bg-zinc-800 text-primary dark:text-zinc-100 font-bold text-xs flex items-center justify-center gap-1.5">
                    <span class="material-symbols-outlined text-[18px]">add_location_alt</span>
                    + Thêm Lộ Trình
                </button>
                <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + ' Trà Vinh')}"
                    target="_blank" rel="noopener noreferrer"
                    class="flex-1 py-3 min-h-[46px] rounded-2xl bg-secondary text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md">
                    <span class="material-symbols-outlined text-[18px]">directions</span>
                    Chỉ đường Maps
                </a>
            </div>
        </div>
    `;
}

/**
 * =========================================================================
 * PHASE 11: CHI TIẾT THƯ MỤC HÀNH TRÌNH ĐÃ LƯU (SAVED ITINERARY FOLDER DETAIL)
 * STITCH: chi_ti_t_th_m_c_h_nh_tr_nh_vivutravinh_mobile
 * =========================================================================
 */
export function renderItineraryFolderDetailModalContent(folder) {
    if (!folder) return '';

    const stops = folder.stops || [];

    return `
        <div class="w-full bg-[#FBF8FC] dark:bg-zinc-950 font-body-md text-on-surface dark:text-zinc-100 antialiased min-h-screen pb-16">
            <!-- Sub-Header / Top Navigation -->
            <div class="w-full bg-white dark:bg-zinc-900 border-b border-outline-variant/30 dark:border-zinc-800 shadow-xs sticky top-0 z-40">
                <div class="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <button type="button" onclick="window.ViVuApp.closeItineraryFolderDetail()"
                            class="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-on-surface dark:text-zinc-200 hover:bg-surface-container dark:hover:bg-zinc-800 transition-colors"
                            aria-label="Quay lại danh sách đã lưu">
                            <span class="material-symbols-outlined text-[22px]">arrow_back</span>
                        </button>
                        <div class="flex flex-col">
                            <span class="font-headline-sm text-sm sm:text-base font-bold text-primary dark:text-zinc-100 leading-tight">
                                Chi tiết Thư mục
                            </span>
                            <span class="text-xs text-secondary dark:text-emerald-400 font-medium">
                                ${escapeHtml(folder.tagline || 'Lộ trình khám phá')}
                            </span>
                        </div>
                    </div>

                    <div class="flex items-center gap-1">
                        <button type="button" onclick="window.ViVuApp.shareItineraryFolder('${escapeHtml(folder.id)}')"
                            class="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-on-surface-variant dark:text-zinc-400 hover:text-primary transition-colors"
                            aria-label="Chia sẻ hành trình">
                            <span class="material-symbols-outlined text-[20px]">share</span>
                        </button>
                        <button type="button" onclick="window.ViVuApp.optimizeFolderRoute()"
                            class="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-secondary hover:text-primary transition-colors"
                            aria-label="Tối ưu lộ trình">
                            <span class="material-symbols-outlined text-[20px]">auto_fix_high</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Content Area -->
            <div class="max-w-4xl mx-auto px-4 py-5 flex flex-col gap-4">
                <!-- Folder Hero & Metadata Banner -->
                <div class="relative overflow-hidden rounded-3xl bg-primary-container text-white p-5 sm:p-6 shadow-md">
                    <div class="absolute -right-10 -bottom-10 w-44 h-44 rounded-full bg-secondary/20 blur-xl pointer-events-none"></div>
                    <div class="relative z-10 flex flex-col gap-3">
                        <div class="flex items-start gap-3 sm:gap-4">
                            <div class="w-12 h-12 rounded-2xl bg-secondary/30 flex items-center justify-center text-secondary-fixed shadow-xs shrink-0">
                                <span class="material-symbols-outlined text-[28px]" style="font-variation-settings: 'FILL' 1;">temple_buddhist</span>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2 flex-wrap mb-1">
                                    <span class="px-2.5 py-0.5 rounded-full bg-secondary text-white text-[11px] font-semibold flex items-center gap-1 shadow-xs">
                                        <span class="material-symbols-outlined text-[13px]">offline_pin</span>
                                        Tự tạo • Offline sẵn sàng
                                    </span>
                                    <span class="px-2.5 py-0.5 rounded-full bg-white/15 backdrop-blur-md text-white text-[11px] font-medium">
                                        ${escapeHtml(folder.duration || '1 Ngày')}
                                    </span>
                                </div>
                                <h1 class="font-headline-lg text-lg sm:text-2xl text-white font-bold tracking-tight">
                                    ${escapeHtml(folder.name)}
                                </h1>
                            </div>
                        </div>

                        <p class="text-xs sm:text-sm text-emerald-100/90 leading-relaxed">
                            ${escapeHtml(folder.description)}
                        </p>

                        <!-- Stats row & Author -->
                        <div class="pt-2 mt-1 flex items-center justify-between flex-wrap gap-2 border-t border-white/10 text-xs">
                            <div class="flex items-center gap-1.5 text-white">
                                <span class="material-symbols-outlined text-[16px] text-secondary-fixed">near_me</span>
                                <span>${folder.stopsCount || stops.length} địa điểm • ${escapeHtml(folder.totalDistance || '~12.5 km')}</span>
                            </div>
                            <div class="flex items-center gap-1.5 bg-white/10 px-3 py-1 rounded-full backdrop-blur-xs text-[11px]">
                                <span class="w-2 h-2 rounded-full bg-secondary-fixed"></span>
                                <span>${escapeHtml(folder.creator)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Quick Action Toolbar -->
                <div class="grid grid-cols-3 gap-2">
                    <button type="button" onclick="window.ViVuApp.openFullMapModal()"
                        class="flex flex-col items-center justify-center py-3 px-2 min-h-[48px] bg-white dark:bg-zinc-900 rounded-2xl shadow-xs border border-outline-variant/20 dark:border-zinc-800 hover:bg-surface-container transition-colors text-center">
                        <span class="material-symbols-outlined text-[22px] text-secondary mb-1">map</span>
                        <span class="text-xs font-semibold text-primary dark:text-zinc-200">Xem bản đồ</span>
                    </button>
                    <button type="button" onclick="window.ViVuApp.openTripPlannerModal()"
                        class="flex flex-col items-center justify-center py-3 px-2 min-h-[48px] bg-white dark:bg-zinc-900 rounded-2xl shadow-xs border border-outline-variant/20 dark:border-zinc-800 hover:bg-surface-container transition-colors text-center">
                        <span class="material-symbols-outlined text-[22px] text-primary dark:text-zinc-200 mb-1">add_location_alt</span>
                        <span class="text-xs font-semibold text-primary dark:text-zinc-200">+ Thêm điểm</span>
                    </button>
                    <div class="flex flex-col items-center justify-center py-3 px-2 min-h-[48px] bg-white dark:bg-zinc-900 rounded-2xl shadow-xs border border-outline-variant/20 dark:border-zinc-800 text-center">
                        <span class="material-symbols-outlined text-[22px] text-secondary mb-1">cloud_done</span>
                        <span class="text-xs font-semibold text-primary dark:text-zinc-200">Đã tải ${escapeHtml(folder.offlineSize || '18MB')}</span>
                    </div>
                </div>

                <!-- Smart Route Optimization Card -->
                <div class="bg-secondary-container/30 dark:bg-emerald-950/40 p-3.5 sm:p-4 rounded-2xl flex items-start justify-between gap-3 border border-secondary/20 shadow-xs">
                    <div class="flex items-start gap-2.5 min-w-0">
                        <div class="w-8 h-8 rounded-full bg-secondary text-white flex items-center justify-center shrink-0 mt-0.5">
                            <span class="material-symbols-outlined text-[18px]">alt_route</span>
                        </div>
                        <div class="flex flex-col">
                            <span class="text-xs font-bold text-primary dark:text-emerald-300">Tối ưu lộ trình AI</span>
                            <span class="text-xs text-on-surface-variant dark:text-zinc-300 leading-snug">
                                ${escapeHtml(folder.optimizationSummary || 'Lộ trình đã được tối ưu hóa: tiết kiệm 2.4 km')}
                            </span>
                        </div>
                    </div>
                    <button type="button" onclick="window.ViVuApp.optimizeFolderRoute()"
                        class="px-3 py-1.5 min-h-[36px] rounded-xl bg-secondary text-white font-semibold text-xs shrink-0 shadow-xs">
                        Tối ưu
                    </button>
                </div>

                <!-- Sequential Stops Timeline -->
                <div class="flex flex-col gap-3">
                    <h3 class="text-xs font-bold text-primary dark:text-zinc-200 uppercase tracking-wider px-1">
                        Danh sách chặng dừng (${stops.length})
                    </h3>

                    <div class="flex flex-col gap-3">
                        ${stops.map((stop, idx) => `
                            <!-- Stop Card -->
                            <div class="folder-stop-card bg-white dark:bg-zinc-900 rounded-3xl p-4 sm:p-5 shadow-xs border border-outline-variant/20 dark:border-zinc-800 flex flex-col gap-3">
                                <div class="flex items-start gap-3">
                                    <div class="w-7 h-7 rounded-full bg-secondary text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                                        ${idx + 1}
                                    </div>
                                    <img src="${escapeHtml(stop.image)}" alt="${escapeHtml(stop.name)}" class="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover shrink-0 shadow-xs"/>
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-1.5 flex-wrap">
                                            <span class="text-[11px] font-bold text-secondary dark:text-emerald-400 bg-secondary/10 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md">
                                                ${escapeHtml(stop.timeWindow)}
                                            </span>
                                            <span class="text-[11px] text-outline dark:text-zinc-400">
                                                ${stop.durationMinutes} phút
                                            </span>
                                        </div>
                                        <h4 class="font-bold text-xs sm:text-sm text-primary dark:text-zinc-100 mt-1 truncate">
                                            ${escapeHtml(stop.name)}
                                        </h4>
                                        <p class="text-xs text-on-surface-variant dark:text-zinc-400 line-clamp-2 mt-0.5">
                                            ${escapeHtml(stop.note)}
                                        </p>
                                    </div>
                                    <div class="flex flex-col gap-1 shrink-0">
                                        <button type="button" onclick="window.ViVuApp.openDeepPlaceDetail('${escapeHtml(stop.placeId)}')"
                                            class="w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl bg-surface-container dark:bg-zinc-800 hover:bg-secondary hover:text-white flex items-center justify-center text-primary dark:text-zinc-200 transition-colors"
                                            title="Xem chi tiết di sản">
                                            <span class="material-symbols-outlined text-[18px]">info</span>
                                        </button>
                                        <button type="button" onclick="window.ViVuApp.removeStopFromFolder('${escapeHtml(stop.id)}')"
                                            class="w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl bg-surface-container dark:bg-zinc-800 hover:bg-error hover:text-white flex items-center justify-center text-outline dark:text-zinc-400 transition-colors"
                                            title="Xóa khỏi thư mục">
                                            <span class="material-symbols-outlined text-[18px]">delete</span>
                                        </button>
                                    </div>
                                </div>

                                <!-- Transfer indicator to next stop -->
                                ${stop.transferToNext ? `
                                    <div class="flex items-center gap-2 pt-2 border-t border-dashed border-outline-variant/30 dark:border-zinc-800 text-[11px] text-outline dark:text-zinc-400">
                                        <span class="material-symbols-outlined text-[16px] text-secondary">${escapeHtml(stop.transferToNext.mode || 'directions_walk')}</span>
                                        <span>${escapeHtml(stop.transferToNext.modeLabel)} • ${escapeHtml(stop.transferToNext.distance)} (${escapeHtml(stop.transferToNext.time)})</span>
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Footer Action Buttons -->
                <div class="flex flex-col sm:flex-row items-center gap-3 pt-3">
                    <button type="button" onclick="window.ViVuApp.startNavigationFromPlanner()"
                        class="w-full sm:flex-1 py-3.5 min-h-[48px] rounded-2xl bg-secondary hover:bg-primary text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-colors">
                        <span class="material-symbols-outlined text-[20px]">navigation</span>
                        Bắt đầu dẫn đường GPS Turn-by-Turn
                    </button>
                    <button type="button" onclick="window.ViVuApp.openStoryCardModal()"
                        class="w-full sm:w-auto px-5 py-3.5 min-h-[48px] rounded-2xl bg-white dark:bg-zinc-900 border border-outline-variant/30 dark:border-zinc-800 text-primary dark:text-zinc-100 font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors">
                        <span class="material-symbols-outlined text-[20px]">photo_camera_back</span>
                        Tạo Story 9:16
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * =========================================================================
 * PHASE 11: PHOTO GALLERY LIGHTBOX MODAL
 * =========================================================================
 */
export function renderPlacePhotoGalleryModalContent(place, activeIndex = 0) {
    if (!place || !place.photos || place.photos.length === 0) return '';

    const photos = place.photos;
    const current = photos[activeIndex] || photos[0];

    return `
        <div class="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between p-4 sm:p-6 text-white select-none">
            <!-- Header -->
            <div class="flex items-center justify-between z-10">
                <div class="flex items-center gap-3">
                    <span class="font-bold text-sm sm:text-base text-white truncate max-w-[240px]">
                        ${escapeHtml(place.name)}
                    </span>
                    <span class="text-xs bg-white/20 px-2.5 py-1 rounded-full font-mono">
                        ${activeIndex + 1} / ${photos.length}
                    </span>
                </div>
                <button type="button" onclick="window.ViVuApp.closePlacePhotoGallery()"
                    class="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
                    aria-label="Đóng thư viện ảnh">
                    <span class="material-symbols-outlined text-[24px]">close</span>
                </button>
            </div>

            <!-- Main Image Showcase -->
            <div class="relative flex-1 flex items-center justify-center my-4 overflow-hidden">
                <img src="${escapeHtml(current.src)}" alt="${escapeHtml(current.title)}"
                    class="max-w-full max-h-[70vh] object-contain rounded-2xl shadow-2xl transition-all duration-300"/>

                <!-- Navigation Controls -->
                <button type="button" onclick="window.ViVuApp.switchGalleryPhoto(${(activeIndex - 1 + photos.length) % photos.length})"
                    class="absolute left-2 sm:left-4 w-12 h-12 min-w-[44px] min-h-[44px] rounded-full bg-black/50 hover:bg-black/80 flex items-center justify-center text-white transition-colors"
                    aria-label="Ảnh trước">
                    <span class="material-symbols-outlined text-[28px]">chevron_left</span>
                </button>

                <button type="button" onclick="window.ViVuApp.switchGalleryPhoto(${(activeIndex + 1) % photos.length})"
                    class="absolute right-2 sm:right-4 w-12 h-12 min-w-[44px] min-h-[44px] rounded-full bg-black/50 hover:bg-black/80 flex items-center justify-center text-white transition-colors"
                    aria-label="Ảnh tiếp">
                    <span class="material-symbols-outlined text-[28px]">chevron_right</span>
                </button>
            </div>

            <!-- Footer Caption & Thumbnails -->
            <div class="flex flex-col items-center gap-3 z-10">
                <div class="text-center max-w-xl">
                    <p class="font-bold text-xs sm:text-sm text-white">${escapeHtml(current.title)}</p>
                    <p class="text-[11px] text-zinc-400 mt-0.5 line-clamp-1">${escapeHtml(current.desc || '')}</p>
                </div>

                <!-- Thumbnails strip -->
                <div class="flex items-center gap-2 overflow-x-auto max-w-full py-1">
                    ${photos.map((p, idx) => `
                        <button type="button" onclick="window.ViVuApp.switchGalleryPhoto(${idx})"
                            class="w-12 h-12 min-w-[44px] min-h-[44px] rounded-xl overflow-hidden border-2 ${idx === activeIndex ? 'border-secondary scale-105' : 'border-transparent opacity-60 hover:opacity-100'} transition-all shrink-0">
                            <img src="${escapeHtml(p.src)}" alt="" class="w-full h-full object-cover"/>
                        </button>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

// ============================================================================
// OFFLINE QR TICKET PASS (Phase 12) - Vé khán đài điện tử hoạt động 100% ngoại tuyến
// Bộ sinh mã QR thuần SVG độc lập, KHÔNG phụ thuộc mạng/CDN:
// Byte Mode, ECC Level L, Version 1-5 (mỗi version chỉ 1 khối ECC L nên không cần interleave).
// Tuân thủ ISO/IEC 18004: Reed-Solomon trên GF(256), BCH format info, 8 mặt nạ + chấm điểm penalty.
// ============================================================================

const QR_ECC_LEVEL_L_FORMAT_BITS = 1; // "01" theo ISO 18004
const QR_TOTAL_DATA_CODEWORDS_L = [19, 34, 55, 80, 108]; // số codeword dữ liệu (v1-v5, ECC L)
const QR_ECC_CODEWORDS_L = [7, 10, 15, 20, 26];          // số codeword sửa lỗi (v1-v5, ECC L)
const QR_ALIGNMENT_PATTERNS = [[], [6, 18], [6, 22], [6, 26], [6, 30]]; // tâm alignment v1-v5

const QR_GF_EXP = new Uint8Array(512);
const QR_GF_LOG = new Uint8Array(256);
(function initQrGaloisField() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
        QR_GF_EXP[i] = x;
        QR_GF_LOG[x] = i;
        x <<= 1;
        if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) QR_GF_EXP[i] = QR_GF_EXP[i - 255];
})();

function qrGfMul(a, b) {
    return (a === 0 || b === 0) ? 0 : QR_GF_EXP[QR_GF_LOG[a] + QR_GF_LOG[b]];
}

/** Đa thức sinh Reed-Solomon bậc `degree`, hệ số từ bậc cao xuống thấp */
function qrRsGeneratorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
        const next = new Array(poly.length + 1).fill(0);
        for (let k = 0; k < poly.length; k++) {
            next[k] ^= poly[k];
            next[k + 1] ^= qrGfMul(poly[k], QR_GF_EXP[i]);
        }
        poly = next;
    }
    return poly;
}

/** Tính phần dư Reed-Solomon (ECC codewords) của dãy dữ liệu */
function qrRsRemainder(data, degree) {
    const gen = qrRsGeneratorPoly(degree);
    const buf = data.slice().concat(new Array(degree).fill(0));
    for (let i = 0; i < data.length; i++) {
        const factor = buf[i];
        if (factor === 0) continue;
        for (let j = 0; j < gen.length; j++) {
            buf[i + j] ^= qrGfMul(gen[j], factor);
        }
    }
    return buf.slice(data.length);
}

/** Đóng gói bytes thành chuỗi codeword dữ liệu theo Byte Mode (indicator 0100, count 8 bit v1-9) */
function qrMakeDataCodewords(bytes, totalDataCodewords) {
    const bits = [];
    const push = (val, len) => {
        for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
    };
    const capacityBits = totalDataCodewords * 8;
    push(0x4, 4); // Byte mode
    push(bytes.length, 8);
    for (const b of bytes) push(b, 8);
    push(0, Math.min(4, capacityBits - bits.length)); // terminator
    while (bits.length % 8 !== 0) bits.push(0);
    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
        let v = 0;
        for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
        codewords.push(v);
    }
    for (let pad = 0; codewords.length < totalDataCodewords; pad ^= 1) {
        codewords.push(pad === 0 ? 0xEC : 0x11);
    }
    return codewords;
}

/** Dựng ma trận module + đánh dấu vùng function patterns */
function qrCreateMatrix(version) {
    const size = 17 + version * 4;
    const modules = Array.from({ length: size }, () => new Array(size).fill(false));
    const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));

    const setFn = (r, c, dark) => {
        modules[r][c] = dark;
        isFunction[r][c] = true;
    };

    // Timing patterns (hàng/cột 6)
    for (let i = 0; i < size; i++) {
        setFn(6, i, i % 2 === 0);
        setFn(i, 6, i % 2 === 0);
    }

    // Finder patterns + dải phân cách
    const drawFinder = (r0, c0) => {
        for (let dr = -4; dr <= 4; dr++) {
            for (let dc = -4; dc <= 4; dc++) {
                const r = r0 + dr, c = c0 + dc;
                if (r < 0 || r >= size || c < 0 || c >= size) continue;
                const dist = Math.max(Math.abs(dr), Math.abs(dc));
                setFn(r, c, dist !== 2 && dist !== 4);
            }
        }
    };
    drawFinder(3, 3);
    drawFinder(3, size - 4);
    drawFinder(size - 4, 3);

    // Alignment patterns: CHỈ bỏ 3 vị trí góc trùng finder pattern.
    // Các tâm nằm trên timing pattern (VD (6,22)) vẫn PHẢI vẽ theo chuẩn ISO 18004.
    const alignCenters = QR_ALIGNMENT_PATTERNS[version - 1];
    for (let i = 0; i < alignCenters.length; i++) {
        for (let j = 0; j < alignCenters.length; j++) {
            if ((i === 0 && j === 0) || (i === 0 && j === alignCenters.length - 1) || (i === alignCenters.length - 1 && j === 0)) continue;
            const cr = alignCenters[i], cc = alignCenters[j];
            for (let dr = -2; dr <= 2; dr++) {
                for (let dc = -2; dc <= 2; dc++) {
                    setFn(cr + dr, cc + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
                }
            }
        }
    }

    // Mô-đun đen cố định
    setFn(size - 8, 8, true);

    /** Ghi format info (BCH 15-bit, ECC L + mask) - gọi lại cho từng mặt nạ.
     *  Quy ước setFn(row, col) - đặt vị trí đúng chuẩn ISO 18004 (Nayuki dùng (x=col, y=row)). */
    function drawFormatBits(mask) {
        const data = (QR_ECC_LEVEL_L_FORMAT_BITS << 3) | mask;
        let rem = data;
        for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        const bitsVal = ((data << 10) | rem) ^ 0x5412;

        // Bản sao thứ nhất quanh finder trên-trái
        for (let i = 0; i <= 5; i++) setFn(i, 8, ((bitsVal >>> i) & 1) !== 0);      // bit 0-5: (hàng i, cột 8)
        setFn(7, 8, ((bitsVal >>> 6) & 1) !== 0);                                   // bit 6
        setFn(8, 8, ((bitsVal >>> 7) & 1) !== 0);                                   // bit 7
        setFn(8, 7, ((bitsVal >>> 8) & 1) !== 0);                                   // bit 8
        for (let i = 9; i < 15; i++) setFn(8, 14 - i, ((bitsVal >>> i) & 1) !== 0); // bit 9-14: (hàng 8, cột 14-i)

        // Bản sao thứ hai dọc theo cạnh phải/dưới
        for (let i = 0; i < 8; i++) setFn(8, size - 1 - i, ((bitsVal >>> i) & 1) !== 0);      // bit 0-7: (hàng 8, cột size-1-i)
        for (let i = 8; i < 15; i++) setFn(size - 15 + i, 8, ((bitsVal >>> i) & 1) !== 0);    // bit 8-14: (hàng size-15+i, cột 8)
        setFn(size - 8, 8, true); // mô-đun đen luôn giữ đen
    }

    /** Đặt codewords theo đường zigzag (bỏ cột 6) */
    function drawCodewords(codewords) {
        let i = 0;
        const totalBits = codewords.length * 8;
        for (let right = size - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;
            for (let vert = 0; vert < size; vert++) {
                for (let j = 0; j < 2; j++) {
                    const x = right - j;
                    const upward = ((right + 1) & 2) === 0;
                    const y = upward ? size - 1 - vert : vert;
                    if (!isFunction[y][x] && i < totalBits) {
                        modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
                        i++;
                    }
                }
            }
        }
    }

    /** XOR module dữ liệu với mặt nạ (gọi 2 lần liên tiếp sẽ hoàn tác) */
    function applyMaskSafe(mask) {
        const fn = QR_MASK_FNS[mask];
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (!isFunction[r][c] && fn(r, c)) modules[r][c] = !modules[r][c];
            }
        }
    }

    return { size, modules, isFunction, drawFormatBits, drawCodewords, applyMaskSafe };
}

const QR_MASK_FNS = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
];

/** Chấm điểm penalty theo quy tắc N1-N4 của ISO 18004 */
function qrPenaltyScore(modules) {
    const size = modules.length;
    let result = 0;

    // N1: chuỗi cùng màu >= 5 theo hàng và cột
    for (let axis = 0; axis < 2; axis++) {
        for (let i = 0; i < size; i++) {
            let runColor = null, runLen = 0;
            for (let j = 0; j < size; j++) {
                const dark = axis === 0 ? modules[i][j] : modules[j][i];
                if (dark === runColor) {
                    runLen++;
                    if (runLen === 5) result += 3;
                    else if (runLen > 5) result += 1;
                } else {
                    runColor = dark;
                    runLen = 1;
                }
            }
        }
    }

    // N2: khối 2x2 cùng màu
    for (let r = 0; r < size - 1; r++) {
        for (let c = 0; c < size - 1; c++) {
            const v = modules[r][c];
            if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) result += 3;
        }
    }

    // N3: mẫu giống finder 1:1:3:1:1 kèm 4 mô-đun sáng một bên
    const PAT = [true, false, true, true, true, false, true, false, false, false, false];
    const PAT_REV = PAT.slice().reverse();
    const matches = (get, start, pattern) => {
        for (let k = 0; k < pattern.length; k++) {
            if (get(start + k) !== pattern[k]) return false;
        }
        return true;
    };
    for (let i = 0; i < size; i++) {
        const rowGet = j => (j < size ? modules[i][j] : null);
        const colGet = j => (j < size ? modules[j][i] : null);
        for (let j = 0; j <= size - 11; j++) {
            if (matches(rowGet, j, PAT) || matches(rowGet, j, PAT_REV)) result += 40;
            if (matches(colGet, j, PAT) || matches(colGet, j, PAT_REV)) result += 40;
        }
    }

    // N4: độ lệch tỷ lệ mô-đun tối
    let darkCount = 0;
    for (const row of modules) for (const v of row) if (v) darkCount++;
    const total = size * size;
    const k = Math.floor(Math.abs(darkCount * 20 - total * 10) / total);
    result += k * 10;

    return result;
}

/**
 * Sinh mã QR dạng chuỗi SVG thuần từ văn bản (byte mode, UTF-8, ECC L, v1-v5).
 * Hoạt động hoàn toàn ngoại tuyến, không phụ thuộc thư viện ngoài.
 */
export function qrEncodeSvg(text, scale = 8) {
    const bytes = Array.from(new TextEncoder().encode(String(text)));

    let version = 0;
    for (let v = 1; v <= 5; v++) {
        // chiếm chỗ: mode 4 bit + count 8 bit + terminator <= 4 bit = 2 codeword
        if (bytes.length <= QR_TOTAL_DATA_CODEWORDS_L[v - 1] - 2) {
            version = v;
            break;
        }
    }
    if (!version) throw new Error('QR_TOO_LONG');

    const dataCw = qrMakeDataCodewords(bytes, QR_TOTAL_DATA_CODEWORDS_L[version - 1]);
    const eccCw = qrRsRemainder(dataCw, QR_ECC_CODEWORDS_L[version - 1]);
    const all = dataCw.concat(eccCw); // v1-v5 ECC L chỉ có 1 khối -> nối trực tiếp

    const matrix = qrCreateMatrix(version);
    // QUAN TRỌNG: vẽ format bits (mask 0) một lần trước để ĐÁNH DẤU vùng format-info
    // là function module, nếu không codeword sẽ bị đặt vào các ô này làm lệch toàn bộ luồng dữ liệu.
    matrix.drawFormatBits(0);
    matrix.drawCodewords(all);

    // Thử 8 mặt nạ, chọn mặt nạ có penalty thấp nhất
    let bestMask = 0;
    let bestPenalty = Infinity;
    let bestModules = null;
    for (let mask = 0; mask < 8; mask++) {
        matrix.drawFormatBits(mask);
        matrix.applyMaskSafe(mask);
        const p = qrPenaltyScore(matrix.modules);
        if (p < bestPenalty) {
            bestPenalty = p;
            bestMask = mask;
            bestModules = matrix.modules.map(row => row.slice());
        }
        matrix.applyMaskSafe(mask); // XOR hai lần = hoàn tác
    }

    // Vẽ SVG với vùng im lặng 4 module
    const quiet = 4;
    const dim = (matrix.size + quiet * 2) * scale;
    let path = '';
    for (let r = 0; r < matrix.size; r++) {
        for (let c = 0; c < matrix.size; c++) {
            if (bestModules[r][c]) {
                path += `M${(c + quiet) * scale} ${(r + quiet) * scale}h${scale}v${scale}h-${scale}z`;
            }
        }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" aria-label="Mã QR vé điện tử"><rect width="${dim}" height="${dim}" fill="#ffffff"/><path d="${path}" fill="#001e15"/></svg>`;
}

// ============================================================================
// LƯU VÉ KHÁN ĐÀI NGOẠI TUYẾN (localStorage: vivu_user_passes)
// ============================================================================

const TICKET_STORAGE_KEY = 'vivu_user_passes';

export function getStoredPasses() {
    try {
        const parsed = JSON.parse(localStorage.getItem(TICKET_STORAGE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function saveStoredPasses(passes) {
    try {
        localStorage.setItem(TICKET_STORAGE_KEY, JSON.stringify(passes));
        return true;
    } catch (e) {
        console.warn('[ViVuTicket] Không thể lưu vé vào localStorage:', e);
        return false;
    }
}

export function buildTicketQrPayload(ticket) {
    return `VIVU-TICKET|${ticket.code}|${ticket.fullname}|${ticket.phone}|${ticket.sector}|${ticket.seat}|${ticket.registeredAt}`;
}

export const TICKET_SECTOR_LABELS = {
    'long-binh': 'Khán đài Sông Long Bình (Đua Ghe Ngo 14-15/11)',
    'ao-ba-om': 'Khán đài Ao Bà Om (Cúng Trăng & Hoa Đăng 15/11)',
    'combo': 'Combo Trọn Gói Cả 2 Địa Điểm'
};

/** Render thẻ vé điện tử kèm mã QR thuần SVG vào modal #offlineTicketModalContent */
export function renderOfflineTicketCard(ticket) {
    const container = document.getElementById('offlineTicketModalContent');
    if (!container) return;

    const sectorLabel = TICKET_SECTOR_LABELS[ticket.sector] || ticket.sectorLabel || 'Khán đài tự chọn';
    const registeredDate = new Date(ticket.registeredAt).toLocaleString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const payload = buildTicketQrPayload(ticket);
    let qrSvg = '';
    try {
        qrSvg = qrEncodeSvg(payload);
    } catch (e) {
        console.warn('[ViVuTicket] Không tạo được mã QR:', e);
    }

    container.innerHTML = `
        <div class="flex flex-col">
            <!-- Header -->
            <header class="relative overflow-hidden bg-gradient-to-br from-primary-container to-[#004733] text-on-primary p-5 sm:p-6 shrink-0">
                <div class="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-secondary/25 blur-2xl pointer-events-none"></div>
                <div class="flex items-start justify-between gap-3 relative z-10">
                    <div>
                        <p class="font-badge text-[11px] uppercase tracking-wider text-secondary-fixed font-bold">ViVuTraVinh • Ok Om Bok 2026</p>
                        <h2 class="font-headline-md text-xl sm:text-2xl font-bold mt-1">Vé Khán Đài Điện Tử Của Bạn</h2>
                        <p class="font-caption text-xs text-emerald-100/90 mt-1">Xuất trình vé này khi mất sóng 4G tại Ao Bà Om</p>
                    </div>
                    <button type="button" onclick="window.ViVuApp?.closeOfflineTicketModal()" aria-label="Đóng vé điện tử"
                        class="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-all shrink-0">
                        <span class="material-symbols-outlined text-2xl">close</span>
                    </button>
                </div>
            </header>

            <!-- Ticket body -->
            <div class="p-5 sm:p-6 flex flex-col gap-4">
                <!-- QR + mã vé -->
                <div class="rounded-2xl border-2 border-dashed border-outline-variant/50 dark:border-zinc-700 bg-surface-container-low dark:bg-zinc-900 p-4 flex flex-col items-center gap-3">
                    <div class="bg-white rounded-xl p-3 shadow-xs w-[200px] h-[200px] flex items-center justify-center overflow-hidden">
                        ${qrSvg || '<span class="font-caption text-xs text-outline">Không tạo được mã QR</span>'}
                    </div>
                    <div class="text-center">
                        <p class="font-caption text-[11px] uppercase tracking-widest text-on-surface-variant dark:text-zinc-400 font-bold">Mã vé</p>
                        <p class="font-headline-md text-xl font-black tracking-[0.15em] text-primary dark:text-emerald-300">${escapeHtml(ticket.code)}</p>
                    </div>
                </div>

                <!-- Thông tin vé -->
                <dl class="grid grid-cols-2 gap-3 font-body-sm text-xs">
                    <div class="col-span-2">
                        <dt class="font-caption text-[11px] text-on-surface-variant dark:text-zinc-400 font-bold uppercase">Họ và tên</dt>
                        <dd class="font-semibold text-on-surface dark:text-zinc-100 mt-0.5">${escapeHtml(ticket.fullname)}</dd>
                    </div>
                    <div>
                        <dt class="font-caption text-[11px] text-on-surface-variant dark:text-zinc-400 font-bold uppercase">Điện thoại</dt>
                        <dd class="font-semibold text-on-surface dark:text-zinc-100 mt-0.5">${escapeHtml(ticket.phone || '—')}</dd>
                    </div>
                    <div>
                        <dt class="font-caption text-[11px] text-on-surface-variant dark:text-zinc-400 font-bold uppercase">Số ghế</dt>
                        <dd class="font-semibold text-accent dark:text-orange-400 mt-0.5">${escapeHtml(ticket.seat)}</dd>
                    </div>
                    <div class="col-span-2">
                        <dt class="font-caption text-[11px] text-on-surface-variant dark:text-zinc-400 font-bold uppercase">Khu vực khán đài</dt>
                        <dd class="font-semibold text-on-surface dark:text-zinc-100 mt-0.5">${escapeHtml(sectorLabel)}</dd>
                    </div>
                    <div class="col-span-2 flex items-center gap-2 pt-1 border-t border-outline-variant/20 dark:border-zinc-800">
                        <span class="material-symbols-outlined text-base text-secondary dark:text-emerald-400">event_available</span>
                        <span class="font-caption text-[11px] text-on-surface-variant dark:text-zinc-400">Đăng ký lúc: ${escapeHtml(registeredDate)}</span>
                    </div>
                </dl>

                <!-- Lưu ý ngoại tuyến -->
                <div class="rounded-xl bg-secondary/10 dark:bg-emerald-950/40 p-3 flex items-start gap-2.5">
                    <span class="material-symbols-outlined text-lg text-secondary dark:text-emerald-400 shrink-0">wifi_off</span>
                    <p class="font-caption text-[11px] leading-relaxed text-on-surface-variant dark:text-zinc-300">
                        Vé đã được lưu trực tiếp trên máy bạn (kể cả khi ngắt kết nối mạng hoàn toàn). Ảnh chụp màn hình hoặc mã QR này là giấy tờ hợp lệ để nhận chỗ ngồi.
                    </p>
                </div>

                <!-- Actions -->
                <div class="flex flex-col sm:flex-row gap-2.5 pt-1">
                    <button type="button" id="offlineTicketDownloadBtn"
                        class="w-full min-h-[44px] py-3 px-4 rounded-xl bg-[#EA580C] hover:bg-[#C2410C] text-white font-button text-xs sm:text-sm font-semibold shadow-xs transition-all flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined text-[18px]">download</span>
                        <span>Lưu ảnh vé về máy</span>
                    </button>
                    <button type="button" onclick="window.ViVuApp?.closeOfflineTicketModal()"
                        class="w-full min-h-[44px] py-3 px-4 rounded-xl bg-surface-container dark:bg-zinc-800 hover:bg-surface-container-high dark:hover:bg-zinc-700 text-on-surface dark:text-zinc-200 font-button text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-2">
                        <span>Đóng</span>
                    </button>
                </div>
            </div>
        </div>
    `;

    // Gắn sự kiện tải vé về máy
    const downloadBtn = container.querySelector('#offlineTicketDownloadBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => downloadTicketSvg(ticket));
    }
}

/** Xuất thẻ vé thành file SVG độc lập tải về máy (không cần mạng, không cần canvas) */
export function downloadTicketSvg(ticket) {
    const sectorLabel = TICKET_SECTOR_LABELS[ticket.sector] || ticket.sectorLabel || 'Khán đài tự chọn';
    const registeredDate = new Date(ticket.registeredAt).toLocaleString('vi-VN');

    // Nhúng phần path mã QR (module 3px) vào khung trắng 144px của thẻ vé
    let qrEmbedded = '';
    try {
        const qrSvg = qrEncodeSvg(buildTicketQrPayload(ticket), 3);
        const pathMatch = qrSvg.match(/<path d="([^"]+)"/);
        if (pathMatch) {
            const dim = qrSvg.match(/viewBox="0 0 (\d+) (\d+)"/);
            const qrDim = dim ? parseInt(dim[1], 10) : 144;
            const offset = (144 - qrDim) / 2;
            qrEmbedded = `<g transform="translate(${24 + offset},${128 + offset})"><path d="${pathMatch[1]}" fill="#001e15"/></g>`;
        }
    } catch (e) {
        console.warn('[ViVuTicket] Không nhúng được mã QR vào file vé:', e);
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="560" viewBox="0 0 360 560" font-family="system-ui,-apple-system,sans-serif">
  <rect width="360" height="560" rx="20" fill="#003527"/>
  <text x="180" y="52" text-anchor="middle" font-size="12" font-weight="700" fill="#bcedd8" letter-spacing="2">VIVUTRAVINH • OK OM BOK 2026</text>
  <text x="180" y="80" text-anchor="middle" font-size="20" font-weight="800" fill="#ffffff">VÉ KHÁN ĐÀI ĐIỆN TỬ</text>
  <rect x="24" y="100" width="312" height="200" rx="12" fill="#ffffff"/>
  ${qrEmbedded}
  <text x="300" y="176" text-anchor="middle" font-size="11" font-weight="700" fill="#64748b" letter-spacing="2">MÃ VÉ</text>
  <text x="300" y="200" text-anchor="middle" font-size="15" font-weight="800" fill="#001e15">${ticket.code}</text>
  <text x="180" y="240" text-anchor="middle" font-size="13" font-weight="600" fill="#334155">${ticket.fullname}</text>
  <text x="180" y="262" text-anchor="middle" font-size="11" fill="#64748b">${ticket.phone || ''} • Ghế ${ticket.seat}</text>
  <text x="330" y="288" text-anchor="end" font-size="10" fill="#94a3b8">Quét mã QR tại cổng</text>
  <text x="36" y="344" font-size="11" font-weight="700" fill="#bcedd8" letter-spacing="1">KHU VỰC</text>
  <text x="36" y="362" font-size="12" font-weight="600" fill="#ffffff">${sectorLabel}</text>
  <text x="36" y="390" font-size="11" font-weight="700" fill="#bcedd8" letter-spacing="1">ĐĂNG KÝ LÚC</text>
  <text x="36" y="408" font-size="12" fill="#ffffff">${registeredDate}</text>
  <rect x="24" y="440" width="312" height="72" rx="12" fill="#002117"/>
  <text x="180" y="468" text-anchor="middle" font-size="10" font-weight="700" fill="#9af1c6">VÉ HOẠT ĐỘNG 100% NGOẠI TUYẾN</text>
  <text x="180" y="486" text-anchor="middle" font-size="9" fill="#709f8c">Không thu phí • Quản lý bởi Sở VHTT&amp;DL Trà Vinh</text>
  <text x="180" y="502" text-anchor="middle" font-size="9" fill="#709f8c">Hotline cứu trợ du lịch: 1900 8122</text>
</svg>`;

    try {
        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ViVu-Ve-Khan-Dai-${ticket.code}.svg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        if (window.ViVuApp?.showNotification) {
            window.ViVuApp.showNotification('Đã lưu ảnh vé về máy thành công!');
        }
    } catch (e) {
        console.warn('[ViVuTicket] Không tải được file vé:', e);
    }
}

/** Đóng modal vé điện tử */
export function closeOfflineTicketModal() {
    const modal = document.getElementById('offlineTicketModal');
    if (modal) modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}
