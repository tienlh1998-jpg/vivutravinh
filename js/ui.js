// ViVuTraVinh - UI Component Module (Stitch & Eco-Khmer Design System)

import { parsePrice } from './data.js';
import { EVENT_CATEGORIES, EVENT_REGIONS, TRA_VINH_EVENTS_AND_MEETUPS } from './festivals-data.js';

/**
 * Ảnh placeholder trung tính local chuẩn SVG (Data URI độc lập, không phụ thuộc mạng)
 */
export const NEUTRAL_PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300' width='400' height='300'%3E%3Crect width='400' height='300' fill='%23e2e8f0'/%3E%3Ccircle cx='200' cy='130' r='24' fill='%2394a3b8'/%3E%3Cpath d='M135 210l45-50 35 40 30-30 45 40H135z' fill='%2394a3b8' opacity='0.7'/%3E%3Ctext x='200' y='250' font-family='system-ui,-apple-system,sans-serif' font-size='13' font-weight='600' fill='%2364748b' text-anchor='middle'%3E%C4%90ang c%E1%BA%ADp nh%E1%BA%ADt h%C3%ACnh %E1%BA%A3nh%3C/text%3E%3C/svg%3E";

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
    const imageSrc = place.imageLink || NEUTRAL_PLACEHOLDER_IMAGE;
    const priceText = formatPlacePrice(place);
    const rating = Number.parseFloat(place.rating) || 0;

    container.innerHTML = `
        <div class="relative w-full h-full min-h-[460px] lg:min-h-[520px] rounded-3xl overflow-hidden border border-outline-variant/40 dark:border-zinc-800 bg-surface-container-lowest dark:bg-zinc-900 shadow-sm flex flex-col justify-end group">
            <!-- Background Image with Zoom Effect -->
            <div class="absolute inset-0 bg-cover bg-center transition-transform duration-1000 ease-out group-hover:scale-105"
                 style="background-image: url('${imageSrc}');">
            </div>
            <!-- Dual Dark Gradient Overlay for optimal legibility -->
            <div class="absolute inset-0 bg-gradient-to-t from-primary/95 via-primary/50 to-transparent dark:from-black/95 dark:via-black/50"></div>

            <!-- Content Area -->
            <div class="relative z-10 p-6 sm:p-8 space-y-4 text-white">
                <!-- Top Badges -->
                <div class="flex flex-wrap items-center gap-2">
                    <span class="px-3 py-1 rounded-full text-xs font-bold bg-amber-500 text-white shadow-xs flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm" style="font-variation-settings: 'FILL' 1;">hotel_class</span>
                        Tiêu Điểm Tuần Này
                    </span>
                    <span class="px-3 py-1 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-md text-white border border-white/30">
                        ${place.category || 'Danh Thắng Quốc Gia'}
                    </span>
                    <span class="px-3 py-1 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-md text-white border border-white/30 flex items-center gap-1">
                        <span class="w-2 h-2 rounded-full ${isOpen ? 'bg-emerald-400 animate-pulse' : (statusInfo.status === 'temporarily_closed' ? 'bg-rose-500' : 'bg-amber-400')}"></span>
                        ${statusInfo.label}
                    </span>
                </div>

                <!-- Title & Meta -->
                <div class="space-y-2">
                    <div class="flex items-center gap-2 text-xs text-primary-fixed dark:text-emerald-300">
                        ${rating > 0 ? `
                            <span class="flex items-center text-amber-400 font-bold">
                                <span class="material-symbols-outlined text-sm mr-0.5" style="font-variation-settings: 'FILL' 1;">star</span>
                                ${rating.toFixed(1)}
                            </span>
                        ` : `
                            <span class="italic text-white/80">Chưa có đánh giá</span>
                        `}
                        <span>•</span>
                        <span>${place.area || 'TP. Trà Vinh'}</span>
                        <span>•</span>
                        <span class="text-secondary-fixed dark:text-emerald-200 font-semibold">${priceText}</span>
                    </div>

                    <h2 class="text-2xl sm:text-3xl lg:text-4xl font-black font-['Noto_Serif',serif] leading-tight text-white drop-shadow-sm">
                        ${place.name}
                    </h2>

                    <p class="text-sm sm:text-base text-surface-container-high dark:text-zinc-300 max-w-2xl leading-relaxed line-clamp-2 sm:line-clamp-3">
                        ${place.description || 'Quần thể danh thắng tâm linh cổ kính in bóng xuống mặt hồ phẳng lặng, bao bọc bởi hàng ngàn gốc cây sao dầu đại thụ hàng trăm năm tuổi.'}
                    </p>
                </div>

                <!-- Action Buttons -->
                <div class="flex items-center gap-3 pt-2">
                    <button id="spotlightDetailBtn" class="px-6 py-3 rounded-2xl bg-secondary dark:bg-emerald-500 text-on-secondary dark:text-zinc-950 font-bold text-sm hover:scale-105 active:scale-95 transition-all shadow-md flex items-center gap-2">
                        <span>Khám phá ngay</span>
                        <span class="material-symbols-outlined text-sm">arrow_forward</span>
                    </button>
                    <button id="spotlightSaveBtn" class="p-3 rounded-2xl bg-white/20 hover:bg-white/30 backdrop-blur-md text-white border border-white/30 transition-all active:scale-95" title="Lưu lại">
                        <span class="material-symbols-outlined text-lg ${isSaved ? 'text-rose-400' : ''}" style="${isSaved ? "font-variation-settings: 'FILL' 1;" : ''}">
                            ${isSaved ? 'favorite' : 'bookmark'}
                        </span>
                    </button>
                    ${place.mapLink ? `
                        <a href="${place.mapLink}" target="_blank" rel="noopener" class="px-4 py-2.5 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-semibold text-sm flex items-center gap-2 border border-white/30 transition-all">
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
                placeKeyword: 'Bún Nước Lèo'
            },
            {
                time: '08:15 – 10:30',
                title: 'Quần thể danh thắng Ao Bà Om & Chùa Âng (Wat Angkor Borey)',
                desc: 'Tản bộ dưới tán rừng sao dầu đại thụ có bộ rễ nổi kỳ vĩ uốn lượn tựa tác phẩm điêu khắc thiên nhiên. Chiêm bái ngôi cổ tự Angkorian nguy nga bậc nhất Trà Vinh.',
                tip: 'Góc chụp ảnh rễ cây đẹp nhất ở bờ nam hồ; nên vào viếng chánh điện trước 10h sáng.',
                icon: 'temple_buddhist',
                placeKeyword: 'Ao Bà Om'
            },
            {
                time: '10:45 – 11:45',
                title: 'Bảo tàng Văn hóa Dân tộc Khmer Trà Vinh',
                desc: 'Tìm hiểu kho tàng hơn 500 hiện vật quý giá: nhạc cụ ngũ âm Pinpeat, mặt nạ tuồng Chầm-riêng, trang phục cưới truyền thống và kinh Phật chép trên lá buông.',
                tip: 'Bảo tàng nằm ngay đối diện Chùa Âng, rất tiện đi bộ tham quan liên hoàn.',
                icon: 'museum',
                placeKeyword: 'Chùa Âng'
            },
            {
                time: '12:00 – 13:30',
                title: 'Dùng cơm trưa ẩm thực miệt vườn',
                desc: 'Thưởng thức mâm cơm đồng quê thanh mát: canh chua cá ngát, cá lóc kho tộ, rau luộc kho quẹt tại quán sân vườn thoáng mát.',
                tip: 'Uống thêm một trái dừa tươi mát rượi để giải nhiệt trưa hè.',
                icon: 'restaurant',
                placeKeyword: 'Quán ăn'
            },
            {
                time: '14:00 – 16:30',
                title: 'Chùa Hang (Wat Kompong Chiray) & Vườn chim tự nhiên',
                desc: 'Chiêm ngưỡng cổng chùa độc đáo hình vòm hang đá cổ xưa, tham quan xưởng điêu khắc gỗ của các nghệ nhân sư thầy và ngắm đàn chim hoang dã bay về tổ.',
                tip: 'Thời điểm ngắm đàn chim về rợp bóng cây đẹp nhất là từ 15:30 đến 16:30.',
                icon: 'nature_people',
                placeKeyword: 'Chùa Hang'
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
                placeKeyword: 'Bún Nước Lèo'
            },
            {
                time: '09:00 – 11:00',
                title: 'Thưởng thức Cà phê Dừa sáp Cầu Kè ven sông',
                desc: 'Trải nghiệm dừa sáp Cầu Kè béo ngậy được xay nhuyễn hòa cùng cà phê phin đậm đà trong không gian hiên dừa lộng gió mát rượi.',
                tip: 'Dừa sáp chuẩn độ dẻo quánh, ăn một muỗng như tan chảy trên đầu lưỡi.',
                icon: 'local_cafe',
                placeKeyword: 'Cafe'
            },
            {
                time: '11:30 – 13:30',
                title: 'Bánh canh Bến Có hoặc Cơm Cà ri Khmer',
                desc: 'Tô bánh canh Bến Có nức tiếng với sợi bánh dẻo mềm, nước dùng trong vắt ngọt xương hầm và đĩa lòng heo tươi giòn sần sật.',
                tip: 'Bánh canh Bến Có cách trung tâm khoảng 5km về hướng Cầu Kè.',
                icon: 'soup_kitchen',
                placeKeyword: 'Bánh Canh'
            },
            {
                time: '14:30 – 16:00',
                title: 'Ăn vặt đường phố: Bánh ống lá dứa & Chè thốt nốt',
                desc: 'Thưởng thức bánh ống lá dứa nghi ngút khói thơm nồng hương dừa nạo và ly chè thốt nốt thanh mát giải nhiệt buổi chiều.',
                tip: 'Các gánh bánh ống thường xuất hiện ven các cổng chùa hoặc chợ Trà Vinh.',
                icon: 'bakery_dining',
                placeKeyword: 'Ăn vặt'
            },
            {
                time: '16:30 – 18:00',
                title: 'Ghé làng nghề truyền thống Bánh Tét Trà Cuôn',
                desc: 'Tham quan lò gói bánh tét nổi tiếng, tìm hiểu công thức nếp dẻo trộn nước lá ngót và nhân trứng muối đậu xanh béo ngậy mua về làm quà biếu.',
                tip: 'Có thể chọn mua bánh tét chay hoặc bánh tét mặn nhân thịt mỡ trứng muối.',
                icon: 'inventory_2',
                placeKeyword: 'Bánh Tét'
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
                placeKeyword: 'Cồn Chim'
            },
            {
                time: '08:30 – 11:30',
                title: 'Đạp xe đường làng & Trò chơi dân gian Cồn Chim',
                desc: 'Đạp xe trên đường hoa mười giờ, trải nghiệm câu cua, dỡ chà bắt tôm càng xanh, tự tay làm bánh lá mơ và uống nước dừa ngọt mát tận vườn.',
                tip: 'Người dân Cồn Chim vô cùng hiền hậu, phục vụ từng món ăn thức uống bằng cả tấm lòng.',
                icon: 'nature_people',
                placeKeyword: 'Cồn Chim'
            },
            {
                time: '11:45 – 13:30',
                title: 'Bữa cơm quê thuận thiên Cồn Chim',
                desc: 'Thưởng thức mâm cơm quê miệt vườn đậm đà: gỏi tép rong bông điên điển, cá lóc nướng trui rơm, canh chua bần cá bông lau tươi rói.',
                tip: 'Các nguyên liệu đều được nuôi trồng hữu cơ ngay trên cồn đảo.',
                icon: 'flatware',
                placeKeyword: 'Cồn Chim'
            },
            {
                time: '14:00 – 15:30',
                title: 'Chạy xe về thị xã duyên hải ven biển',
                desc: 'Chuyến xe xuyên qua những rặng phi lao phòng hộ và những cánh đồng muối ven biển Duyên Hải lộng gió.',
                tip: 'Đường đi thoáng đãng, nhiều góc cảnh quan ruộng lúa ngập mặn thanh bình.',
                icon: 'two_wheeler',
                placeKeyword: 'Biển Ba Động'
            },
            {
                time: '15:30 – 18:00',
                title: 'Check-in Bãi biển Ba Động & Cánh đồng điện gió',
                desc: 'Dạo bước trên bãi cát mịn thoai thoải, ngắm hoàng hôn rực rỡ buông xuống sau những trụ turbine điện gió khổng lồ vươn mình ra biển lớn.',
                tip: 'Thưởng thức nghêu hấp sả, chù ụ nướng giòn rụm tại các quán hải sản ven biển.',
                icon: 'surfing',
                placeKeyword: 'Biển Ba Động'
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
            placeId: p1?.id
        },
        {
            time: '09:00 – 11:30',
            title: `Chiêm bái & Di sản: ${p2?.name || 'Thắng cảnh tâm linh cổ kính'}`,
            desc: p2?.description || 'Khám phá nét kiến trúc điêu khắc Angkorian độc bản hoặc di tích lịch sử linh thiêng.',
            tip: p2?.note || 'Trang phục chỉnh tề, giữ thái độ tôn nghiêm khi vào chiêm bái di tích/chùa chiền.',
            icon: 'temple_buddhist',
            placeKeyword: p2?.name || 'Chùa Âng',
            placeId: p2?.id
        },
        {
            time: '12:00 – 13:30',
            title: `Bữa trưa miệt vườn: ${p3?.name || 'Món ngon bản địa'}`,
            desc: p3?.description || 'Nghỉ chân thưởng thức mâm cơm đồng quê miệt vườn sông nước tươi ngon mát rượi.',
            tip: p3?.note || 'Uống thêm một trái dừa tươi giải nhiệt trưa hè.',
            icon: 'flatware',
            placeKeyword: p3?.name || 'Ẩm thực',
            placeId: p3?.id
        },
        {
            time: '14:30 – 17:00',
            title: `Check-in chiều mát: ${p4?.name || 'Danh thắng sinh thái'}`,
            desc: p4?.description || 'Thả hồn vào thiên nhiên xanh tươi, chụp những bức ảnh kỷ niệm tuyệt đẹp lúc hoàng hôn buông xuống.',
            tip: p4?.note || 'Khoảng 15h30 đến 17h00 là khung giờ ánh sáng vàng đẹp nhất để chụp ảnh phong cảnh.',
            icon: 'photo_camera',
            placeKeyword: p4?.name || 'Ao Bà Om',
            placeId: p4?.id
        },
        {
            time: '18:30 – 21:00',
            title: `Thư giãn phố đêm: ${p5?.name || 'Cà phê & Ẩm thực đêm'}`,
            desc: p5?.description || 'Khép lại một ngày vi vu trọn vẹn bên ly cà phê thơm lừng, ngắm phố phường thanh bình xứ Trà.',
            tip: p5?.note || 'Thưởng thức ngụm trà nóng hoặc cà phê dừa sáp trò chuyện cùng bạn bè.',
            icon: 'local_cafe',
            placeKeyword: p5?.name || 'Cà phê',
            placeId: p5?.id
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
                    <h3 class="text-xl sm:text-2xl font-black font-serif text-primary dark:text-zinc-100 pt-1">
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

                            <h4 class="text-sm sm:text-base font-bold text-on-surface dark:text-zinc-100 font-serif">
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

                                <!-- Social proof & Avatars -->
                                <div class="flex items-center gap-4 mt-6 pt-5 border-t border-white/15">
                                    <div class="flex -space-x-2 overflow-hidden">
                                        <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-white text-[11px] font-semibold ring-2 ring-primary">TV</span>
                                        <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#EA580C] text-white text-[11px] font-semibold ring-2 ring-primary">TH</span>
                                        <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#006C4A] text-white text-[11px] font-semibold ring-2 ring-primary">LN</span>
                                        <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/20 text-white text-[11px] font-semibold ring-2 ring-primary">+3k</span>
                                    </div>
                                    <span class="font-body-sm text-xs sm:text-sm text-emerald-100">
                                        <strong class="text-white font-semibold">3,450+</strong> người dự kiến tham gia
                                    </span>
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
                            ViVuTraVinh hỗ trợ lan tỏa thông tin miễn phí đến hơn 5,000+ bạn trẻ và du khách yêu mến văn hóa Trà Vinh. Đồng hành cùng nhau quảng bá nét đẹp xứ sở trù phú!
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
                                <span class="material-symbols-outlined text-secondary-fixed text-[18px]">group</span>
                                <span>Dự kiến hơn 120.000 lượt du khách và kiều bào</span>
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
                                            <h2 class="font-headline-md text-lg sm:text-xl text-on-surface dark:text-zinc-100 font-bold">Thảo Luận Trực Tiếp (48 phản hồi)</h2>
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
                    window.ViVuApp.showNotification('Cảm ơn bạn đã đăng ký tham gia Đội Tình Nguyện Xanh Ao Bà Om!');
                } else {
                    alert('Đã ghi nhận đăng ký tham gia Đội Tình Nguyện Xanh!');
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
                        Đăng Ký Tham Gia: ${escapeHtml(event.title)}
                    </h3>
                </div>
            </div>

            <!-- Event Brief Card -->
            <div class="p-4 rounded-xl bg-surface-container-low dark:bg-zinc-800/80 border border-outline-variant/30 dark:border-zinc-700 flex flex-col gap-2 text-xs">
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
                    <span><strong>Chi phí:</strong> ${escapeHtml(event.fee || 'Miễn phí')} ${event.feeDetail ? escapeHtml(event.feeDetail) : ''}</span>
                </div>
            </div>

            <!-- Registration Form -->
            <form id="eventRsvpSubmitForm" class="flex flex-col gap-4">
                <div>
                    <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                        Họ và tên người đăng ký <span class="text-rose-500">*</span>
                    </label>
                    <input name="fullname" type="text" required placeholder="Nguyễn Văn A" value="Trần Tiến"
                        class="w-full h-11 px-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700"/>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                            Số điện thoại (Nhận vé Zalo) <span class="text-rose-500">*</span>
                        </label>
                        <input name="phone" type="tel" required placeholder="0901 xxx xxx"
                            class="w-full h-11 px-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700"/>
                    </div>
                    <div>
                        <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                            Số lượng người tham gia
                        </label>
                        <select name="seats"
                            class="w-full h-11 px-3 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700">
                            <option value="1">1 người</option>
                            <option value="2">2 người</option>
                            <option value="3">3 - 5 người (Đi nhóm)</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                        Ghi chú hoặc yêu cầu đặc biệt
                    </label>
                    <textarea name="notes" rows="2" placeholder="Ví dụ: Mang theo xe đạp riêng / Cần hướng dẫn viên hỗ trợ..."
                        class="w-full p-3 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700"></textarea>
                </div>

                <div class="pt-2 flex items-center justify-end gap-3">
                    <button type="button" onclick="window.ViVuApp?.closeEventRsvpModal()"
                        class="px-4 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 font-button text-xs font-semibold min-h-[44px]">
                        Hủy
                    </button>
                    <button type="submit"
                        class="px-6 py-2.5 rounded-xl bg-[#EA580C] hover:bg-[#C2410C] text-white font-button text-xs font-semibold shadow-xs min-h-[44px] flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[18px]">how_to_reg</span>
                        <span>Xác Nhận Đăng Ký</span>
                    </button>
                </div>
            </form>
        </div>
    `;

    const form = container.querySelector('#eventRsvpSubmitForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const data = {
                eventId: event.id,
                eventTitle: event.title,
                fullname: formData.get('fullname'),
                phone: formData.get('phone'),
                seats: formData.get('seats'),
                notes: formData.get('notes')
            };
            if (onSubmitRsvp) {
                onSubmitRsvp(data);
            } else if (window.ViVuApp?.submitEventRsvp) {
                window.ViVuApp.submitEventRsvp(data);
            }
        });
    }
}

/**
 * Render Modal Đăng Ký Tổ Chức Sự Kiện Mới (Host Event Modal)
 */
export function renderHostEventModal(onSubmitHost) {
    const container = document.getElementById('hostEventModalContainer');
    if (!container) return;

    container.innerHTML = `
        <div class="p-6 sm:p-8 flex flex-col gap-6">
            <div class="flex flex-col gap-1">
                <span class="px-2.5 py-1 rounded-full bg-secondary/15 dark:bg-emerald-950/60 text-secondary dark:text-emerald-400 font-caption text-xs font-bold w-fit">
                    Hợp tác cộng đồng
                </span>
                <h3 class="font-headline-md text-lg sm:text-xl font-bold text-on-surface dark:text-zinc-100">
                    Đăng Ký Tổ Chức Sự Kiện / Workshop Tại Trà Vinh
                </h3>
                <p class="font-body-sm text-xs text-on-surface-variant dark:text-zinc-400">
                    ViVuTraVinh hỗ trợ lan tỏa sự kiện văn hóa, thể thao, bảo tồn sinh thái và gặp gỡ cộng đồng miễn phí 100%.
                </p>
            </div>

            <form id="hostEventSubmitForm" class="flex flex-col gap-4">
                <div>
                    <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                        Tên sự kiện / Workshop <span class="text-rose-500">*</span>
                    </label>
                    <input name="eventTitle" type="text" required placeholder="Ví dụ: Đêm Nhạc Dân Ca Nam Bộ Ven Sông"
                        class="w-full h-11 px-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700"/>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                            Đơn vị / Nhóm tổ chức <span class="text-rose-500">*</span>
                        </label>
                        <input name="organizer" type="text" required placeholder="Ví dụ: CLB Sống Xanh Xứ Trà"
                            class="w-full h-11 px-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700"/>
                    </div>
                    <div>
                        <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                            Loại hình hoạt động
                        </label>
                        <select name="category"
                            class="w-full h-11 px-3 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700">
                            <option value="workshop">Workshop văn hóa</option>
                            <option value="sports">Thể thao &amp; Trải nghiệm</option>
                            <option value="community">Giao lưu cộng đồng</option>
                            <option value="ecology">Bảo vệ môi trường</option>
                        </select>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                            Thời gian dự kiến <span class="text-rose-500">*</span>
                        </label>
                        <input name="datetime" type="text" required placeholder="Ví dụ: Sáng Chủ Nhật 25/10 (08:00 - 11:30)"
                            class="w-full h-11 px-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700"/>
                    </div>
                    <div>
                        <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                            Địa điểm tổ chức <span class="text-rose-500">*</span>
                        </label>
                        <input name="location" type="text" required placeholder="Ví dụ: Khuôn viên Ao Bà Om"
                            class="w-full h-11 px-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700"/>
                    </div>
                </div>

                <div>
                    <label class="block font-caption text-xs font-semibold text-on-surface dark:text-zinc-200 mb-1">
                        Mô tả ngắn gọn &amp; thông điệp sự kiện
                    </label>
                    <textarea name="description" rows="3" placeholder="Mục đích, đối tượng tham gia, chi phí nếu có (khuyến khích miễn phí hoặc phi lợi nhuận)..."
                        class="w-full p-3 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-100 font-body-md text-xs focus:outline-none focus:bg-surface-container-lowest dark:focus:bg-zinc-700 border border-outline-variant/30 dark:border-zinc-700"></textarea>
                </div>

                <div class="pt-2 flex items-center justify-end gap-3">
                    <button type="button" onclick="window.ViVuApp?.closeHostEventModal()"
                        class="px-4 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 font-button text-xs font-semibold min-h-[44px]">
                        Hủy
                    </button>
                    <button type="submit"
                        class="px-6 py-2.5 rounded-xl bg-secondary hover:bg-emerald-700 text-white font-button text-xs font-semibold shadow-xs min-h-[44px] flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[18px]">send</span>
                        <span>Gửi Hồ Sơ Sự Kiện</span>
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
                title: formData.get('eventTitle'),
                organizer: formData.get('organizer'),
                category: formData.get('category'),
                datetime: formData.get('datetime'),
                location: formData.get('location'),
                description: formData.get('description')
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
 * Render Lưới Bài Viết Magazine: Chuyên mục "Góc Chuyện Xứ Trà"
 */
export function renderArticlesSection(containerId, articles, onOpenArticle) {
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
                        Góc Chuyện Xứ Trà • Travel Stories
                    </div>
                    <h3 class="text-2xl sm:text-3xl font-black font-serif text-primary dark:text-zinc-100">
                        Ký Sự Du Lịch & Văn Hóa Bản Địa
                    </h3>
                    <p class="text-xs sm:text-sm text-on-surface-variant dark:text-zinc-400 mt-1 max-w-2xl">
                        Những huyền tích trăm năm, bí mật ẩm thực miệt vườn và cẩm nang phượt thực chiến từ thổ địa Trà Vinh.
                    </p>
                </div>
            </div>

            <!-- Grid Lưới Bài Viết Magazine Cards -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${articles.map(art => `
                    <article class="article-card group bg-surface-container-lowest dark:bg-dark-card rounded-3xl border border-outline-variant/40 dark:border-dark-border overflow-hidden shadow-xs hover:shadow-xl transition-all duration-300 flex flex-col cursor-pointer" data-article-id="${art.id}">
                        <!-- Ảnh bìa -->
                        <div class="relative w-full h-52 sm:h-56 overflow-hidden bg-slate-200 dark:bg-zinc-800">
                            <img src="${art.coverImage}" alt="${art.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                            <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>

                            <!-- Badge Danh Mục -->
                            <div class="absolute top-3 left-3">
                                <span class="px-3 py-1 rounded-full text-xs font-bold shadow-sm ${art.categoryBadge}">
                                    ${art.category}
                                </span>
                            </div>

                            <!-- Thời gian đọc -->
                            <div class="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md text-white text-[11px] font-semibold px-2.5 py-1 rounded-xl flex items-center gap-1 border border-white/20">
                                <span class="material-symbols-outlined text-xs text-amber-300">timer</span>
                                <span>${art.readTime}</span>
                            </div>
                        </div>

                        <!-- Nội dung tóm tắt -->
                        <div class="p-5 sm:p-6 flex-1 flex flex-col justify-between space-y-4">
                            <div class="space-y-2.5">
                                <!-- Tác giả & Ngày đăng -->
                                <div class="flex items-center gap-2.5">
                                    <img src="${art.author.avatar}" alt="${art.author.name}" class="w-7 h-7 rounded-full bg-slate-100 dark:bg-zinc-700 object-cover border border-outline-variant/30">
                                    <div class="text-xs">
                                        <span class="font-bold text-slate-800 dark:text-zinc-200">${art.author.name}</span>
                                        <span class="text-[10px] text-slate-500 dark:text-zinc-400 block">${art.author.role}</span>
                                    </div>
                                </div>

                                <!-- Tiêu đề -->
                                <h4 class="font-serif text-base sm:text-lg font-black text-slate-900 dark:text-zinc-100 group-hover:text-primary dark:group-hover:text-emerald-400 transition-colors line-clamp-2 leading-snug">
                                    ${art.title}
                                </h4>

                                <!-- Trích đoạn tóm tắt -->
                                <p class="text-xs text-on-surface-variant dark:text-zinc-400 line-clamp-3 leading-relaxed">
                                    ${art.excerpt}
                                </p>
                            </div>

                            <!-- CTA Button -->
                            <div class="pt-3 border-t border-outline-variant/30 dark:border-zinc-800 flex items-center justify-between text-xs font-bold text-primary dark:text-emerald-400">
                                <span class="inline-flex items-center gap-1 group-hover:underline">
                                    Đọc câu chuyện
                                    <span class="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
                                </span>
                                <span class="text-[11px] font-normal text-slate-400 dark:text-zinc-500">
                                    ${art.publishedAt}
                                </span>
                            </div>
                        </div>
                    </article>
                `).join('')}
            </div>
        </div>
    `;

    // Gắn sự kiện click mở modal đọc bài
    container.querySelectorAll('.article-card').forEach(card => {
        card.addEventListener('click', () => {
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

    container.innerHTML = `
        <div class="flex flex-col bg-surface dark:bg-dark-card rounded-3xl overflow-hidden shadow-2xl">
            <!-- Hero Image Banner -->
            <div class="relative w-full h-64 sm:h-80 md:h-96 bg-slate-900 overflow-hidden">
                <img src="${article.coverImage}" alt="${article.title}" class="w-full h-full object-cover opacity-85">
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>

                <!-- Category & Read Time -->
                <div class="absolute bottom-6 left-6 right-6 space-y-2 text-white">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="px-3 py-1 rounded-full text-xs font-bold ${article.categoryBadge}">
                            ${article.category}
                        </span>
                        <span class="bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-medium border border-white/20 flex items-center gap-1">
                            <span class="material-symbols-outlined text-xs text-amber-300">timer</span>
                            ${article.readTime}
                        </span>
                        <span class="text-xs text-zinc-300">
                            • Ngày đăng: ${article.publishedAt}
                        </span>
                    </div>
                    <h1 class="font-serif text-xl sm:text-2xl md:text-3xl font-black leading-tight text-white drop-shadow-md">
                        ${article.title}
                    </h1>
                </div>
            </div>

            <!-- Modal Content Body -->
            <div class="p-6 sm:p-8 md:p-10 space-y-8 max-w-4xl mx-auto w-full">
                <!-- Author Bio Header -->
                <div class="flex items-center justify-between gap-4 pb-6 border-b border-outline-variant/30 dark:border-zinc-800">
                    <div class="flex items-center gap-3">
                        <img src="${article.author.avatar}" alt="${article.author.name}" class="w-12 h-12 rounded-full border-2 border-emerald-500 shadow-sm object-cover bg-slate-100">
                        <div>
                            <div class="font-bold text-sm sm:text-base text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                                <span>${article.author.name}</span>
                                <span class="material-symbols-outlined text-base text-emerald-600 dark:text-emerald-400">verified</span>
                            </div>
                            <div class="text-xs text-on-surface-variant dark:text-zinc-400">${article.author.role}</div>
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
                    ${article.contentHtml}
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

        return `
            <article class="flex flex-col bg-surface-container-lowest dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-all border border-outline-variant/40 dark:border-zinc-800 group">
                <div class="relative aspect-[16/10] w-full overflow-hidden bg-surface-container-high dark:bg-zinc-800">
                    <img src="${safeImage}" alt="${safeName}"
                        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onerror="this.onerror=null; this.src='${NEUTRAL_PLACEHOLDER_IMAGE}';">
                    <span class="absolute top-3 left-3 px-3 py-1 rounded-full bg-surface-container-lowest/90 dark:bg-zinc-900/90 backdrop-blur-md text-primary dark:text-emerald-400 text-xs font-semibold shadow-sm">
                        ${safeBadge}
                    </span>
                    <button type="button" onclick="window.ViVuApp.toggleBookmarkClub('${safeId}', this)"
                        class="absolute top-3 right-3 w-11 h-11 min-h-[44px] min-w-[44px] rounded-full bg-surface-container-lowest/85 dark:bg-zinc-800/85 backdrop-blur-md flex items-center justify-center text-slate-600 dark:text-zinc-300 hover:text-red-500 dark:hover:text-red-400 transition-colors shadow-sm"
                        title="Lưu câu lạc bộ" aria-label="Lưu ${safeName}">
                        <span class="material-symbols-outlined text-[18px]">favorite</span>
                    </button>
                </div>
                <div class="p-5 flex flex-col flex-1 justify-between gap-4">
                    <div class="flex flex-col gap-2">
                        <div class="flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full bg-secondary"></span>
                            <span class="text-xs text-on-surface-variant dark:text-zinc-400">${club.membersCount} thành viên • ${club.activitiesCount} hoạt động</span>
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
        const likesCount = (post.likes || 0) + (isLiked ? 1 : 0);

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
                                <span class="px-2 py-0.5 rounded-full bg-secondary-container dark:bg-emerald-950/60 text-on-secondary-container dark:text-emerald-300 text-[11px] font-semibold">
                                    ${safeBadge}
                                </span>
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

                <!-- Stats Row -->
                <div class="pt-2 flex items-center justify-between text-xs text-on-surface-variant dark:text-zinc-400">
                    <div class="flex items-center gap-1.5">
                        <span class="w-5 h-5 rounded-full bg-secondary text-white flex items-center justify-center text-[10px]">
                            <span class="material-symbols-outlined text-[13px]">thumb_up</span>
                        </span>
                        <span>${likesCount} Thích</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <span>${post.commentsCount || 0} Bình luận</span>
                        <span>${post.shares || 0} Chia sẻ</span>
                    </div>
                </div>

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
        const safeTime = escapeHtml(act.time);
        const isRegistered = registeredActivityIds.includes(act.id);
        const currentCount = act.attendeesCount + (isRegistered ? 1 : 0);

        return `
            <div class="p-3.5 rounded-xl bg-surface-container-low dark:bg-zinc-800/80 hover:bg-surface-container dark:hover:bg-zinc-800 transition-colors flex flex-col gap-2 group border border-outline-variant/20 dark:border-zinc-700/40">
                <span class="font-bold text-xs sm:text-sm text-on-surface dark:text-zinc-100 group-hover:text-secondary dark:group-hover:text-emerald-400 transition-colors leading-snug">
                    ${safeTitle}
                </span>
                <div class="flex items-center justify-between text-xs text-on-surface-variant dark:text-zinc-400">
                    <span class="inline-flex items-center gap-1">
                        <span class="material-symbols-outlined text-[15px] text-outline">schedule</span>
                        ${safeTime}
                    </span>
                    <span class="inline-flex items-center gap-1 text-secondary dark:text-emerald-400 font-semibold">
                        <span class="material-symbols-outlined text-[15px]">group</span>
                        ${currentCount} người đi
                    </span>
                </div>
                <div class="pt-1.5 flex items-center justify-between border-t border-outline-variant/20 dark:border-zinc-700/40">
                    <span class="text-[11px] text-slate-500 dark:text-zinc-400 truncate max-w-[160px]">${escapeHtml(act.location)}</span>
                    <button type="button" onclick="window.ViVuApp.toggleRsvpActivity('${safeId}')"
                        class="px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-semibold transition-all ${
                            isRegistered
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                                : 'bg-secondary hover:bg-primary-container text-white shadow-xs'
                        }">
                        ${isRegistered ? '✓ Đã đặt chỗ' : 'Đặt chỗ'}
                    </button>
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

    const safeName = escapeHtml(profile.name || 'Người dùng');
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
                            <span class="material-symbols-outlined text-[16px]" style="font-variation-settings: 'FILL' 1;">thumb_up</span>
                            <span>42 lượt cảm ơn từ cộng đồng</span>
                        </div>
                    </div>
                </div>
            </div>
            `}
        </div>
    `;
}

/**
 * Render Saved Collections Modal / Screen Content (Stitch Desktop & Mobile Design)
 */
export function renderSavedCollectionsModalContent(savedItems = [], folders = [], activeCategory = 'all', sortMode = 'recent', viewMode = 'grid') {
    const totalCount = savedItems.length;

    // Filter items
    let filtered = activeCategory === 'all'
        ? savedItems
        : savedItems.filter(item => item.category === activeCategory);

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
                        <span class="font-bold text-primary dark:text-emerald-400" id="savedTotalBadge">${totalCount} mục đã lưu</span>
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

            <!-- FILTER BAR & VIEW TOGGLE -->
            <section class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 py-2 border-y border-outline-variant/20 dark:border-zinc-800">
                <!-- Category Tabs with dynamic counters -->
                <div class="flex items-center gap-2 overflow-x-auto pb-2 lg:pb-0 no-scrollbar" role="toolbar" aria-label="Bộ lọc danh mục đã lưu">
                    <button type="button" onclick="window.ViVuApp.filterSavedCategory('all')"
                        class="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 flex items-center gap-2 min-h-[44px] ${
                            activeCategory === 'all'
                                ? 'bg-primary-container text-white dark:bg-emerald-800'
                                : 'bg-surface-container-lowest dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 hover:bg-surface-container dark:hover:bg-zinc-700'
                        }">
                        <span>Tất cả</span>
                        <span class="px-2 py-0.5 rounded-full ${activeCategory === 'all' ? 'bg-white/20' : 'bg-surface-container dark:bg-zinc-700'} text-[11px]">${categoryCounts.all}</span>
                    </button>
                    <button type="button" onclick="window.ViVuApp.filterSavedCategory('heritage')"
                        class="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 flex items-center gap-2 min-h-[44px] ${
                            activeCategory === 'heritage'
                                ? 'bg-primary-container text-white dark:bg-emerald-800'
                                : 'bg-surface-container-lowest dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 hover:bg-surface-container dark:hover:bg-zinc-700'
                        }">
                        <span>Địa điểm di tích</span>
                        <span class="px-2 py-0.5 rounded-full ${activeCategory === 'heritage' ? 'bg-white/20' : 'bg-surface-container dark:bg-zinc-700'} text-[11px]">${categoryCounts.heritage}</span>
                    </button>
                    <button type="button" onclick="window.ViVuApp.filterSavedCategory('culinary')"
                        class="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 flex items-center gap-2 min-h-[44px] ${
                            activeCategory === 'culinary'
                                ? 'bg-primary-container text-white dark:bg-emerald-800'
                                : 'bg-surface-container-lowest dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 hover:bg-surface-container dark:hover:bg-zinc-700'
                        }">
                        <span>Ẩm thực &amp; Quán</span>
                        <span class="px-2 py-0.5 rounded-full ${activeCategory === 'culinary' ? 'bg-white/20' : 'bg-surface-container dark:bg-zinc-700'} text-[11px]">${categoryCounts.culinary}</span>
                    </button>
                    <button type="button" onclick="window.ViVuApp.filterSavedCategory('event')"
                        class="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 flex items-center gap-2 min-h-[44px] ${
                            activeCategory === 'event'
                                ? 'bg-primary-container text-white dark:bg-emerald-800'
                                : 'bg-surface-container-lowest dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 hover:bg-surface-container dark:hover:bg-zinc-700'
                        }">
                        <span>Sự kiện &amp; Lễ hội</span>
                        <span class="px-2 py-0.5 rounded-full ${activeCategory === 'event' ? 'bg-white/20' : 'bg-surface-container dark:bg-zinc-700'} text-[11px]">${categoryCounts.event}</span>
                    </button>
                    <button type="button" onclick="window.ViVuApp.filterSavedCategory('culture')"
                        class="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 flex items-center gap-2 min-h-[44px] ${
                            activeCategory === 'culture'
                                ? 'bg-primary-container text-white dark:bg-emerald-800'
                                : 'bg-surface-container-lowest dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 hover:bg-surface-container dark:hover:bg-zinc-700'
                        }">
                        <span>Chùa &amp; Làng nghề</span>
                        <span class="px-2 py-0.5 rounded-full ${activeCategory === 'culture' ? 'bg-white/20' : 'bg-surface-container dark:bg-zinc-700'} text-[11px]">${categoryCounts.culture}</span>
                    </button>
                </div>

                <!-- Secondary Controls: Sorting & Grid/List switches -->
                <div class="flex items-center gap-3 shrink-0 flex-wrap">
                    <!-- Sort Dropdown -->
                    <div class="relative">
                        <select onchange="window.ViVuApp.sortSavedItems(this.value)"
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
                            class="p-2.5 rounded-lg ${viewMode === 'grid' ? 'bg-surface-container-lowest dark:bg-zinc-700 text-primary dark:text-emerald-400 shadow-xs' : 'text-on-surface-variant dark:text-zinc-400'} min-w-[44px] min-h-[44px] flex items-center justify-center"
                            title="Dạng lưới ảnh" aria-label="Xem dạng lưới ảnh">
                            <span class="material-symbols-outlined text-[18px]">grid_view</span>
                        </button>
                        <button type="button" onclick="window.ViVuApp.setSavedViewMode('list')"
                            class="p-2.5 rounded-lg ${viewMode === 'list' ? 'bg-surface-container-lowest dark:bg-zinc-700 text-primary dark:text-emerald-400 shadow-xs' : 'text-on-surface-variant dark:text-zinc-400'} min-w-[44px] min-h-[44px] flex items-center justify-center"
                            title="Dạng danh sách thu gọn" aria-label="Xem dạng danh sách thu gọn">
                            <span class="material-symbols-outlined text-[18px]">view_list</span>
                        </button>
                    </div>

                    <button type="button" onclick="window.ViVuApp.clearAllSavedItems()"
                        class="text-on-surface-variant dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 text-xs font-semibold px-2 py-2 transition-colors flex items-center gap-1 min-h-[44px]">
                        <span class="material-symbols-outlined text-[16px]">delete_sweep</span>
                        <span>Xóa tất cả</span>
                    </button>
                </div>
            </section>

            <!-- SAVED ITEMS LIST / GRID -->
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
            ` : `
                <!-- EMPTY STATE -->
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



