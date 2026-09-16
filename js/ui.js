// ViVuTraVinh - UI Component Module (Stitch & Eco-Khmer Design System)

import { parsePrice } from './data.js';

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
 * Hiển thị Modal Chi Tiết Địa Điểm (Dựa trên template ao_b_om_ch_a_ng)
 */
export function renderDetailModal(place, comments = null, isSaved = false, onSavePlace, onSubmitComment) {
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
                <button type="button" class="gallery-thumb w-16 h-16 rounded-xl overflow-hidden shrink-0 border-2 ${idx === 0 ? 'border-primary dark:border-emerald-400' : 'border-transparent'} hover:opacity-80 transition-all focus:outline-none focus:ring-2 focus:ring-primary" data-img-idx="${idx}" aria-label="Xem ảnh ${idx + 1}">
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
        desc: `${chosenCluster.desc} Lịch trình được tạo thông minh từ kho dữ liệu thời gian thực theo cụm di chuyển tối ưu.`,
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
            <div class="flex flex-wrap items-center gap-3 text-xs font-semibold text-on-surface dark:text-zinc-200">
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
 * Quản lý đồng hồ đếm ngược thời gian thực cho sự kiện lễ hội
 */
export function startFestivalCountdown(targetDateStr) {
    if (window._festivalCountdownInterval) {
        clearInterval(window._festivalCountdownInterval);
        window._festivalCountdownInterval = null;
    }

    const daysEl = document.getElementById('cdDays');
    const hoursEl = document.getElementById('cdHours');
    const minutesEl = document.getElementById('cdMinutes');
    const secondsEl = document.getElementById('cdSeconds');
    const statusBadgeEl = document.getElementById('cdStatusBadge');

    if (!daysEl || !hoursEl || !minutesEl || !secondsEl) return;

    const targetDate = new Date(targetDateStr).getTime();

    function updateTimer() {
        const now = new Date().getTime();
        const difference = targetDate - now;

        if (difference <= 0) {
            // Lễ hội đang diễn ra hoặc vừa kết thúc
            daysEl.textContent = '00';
            hoursEl.textContent = '00';
            minutesEl.textContent = '00';
            secondsEl.textContent = '00';
            if (statusBadgeEl) {
                statusBadgeEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping mr-1"></span> Đang diễn ra hội lớn!';
                statusBadgeEl.className = 'px-3 py-1 rounded-full text-xs font-black bg-emerald-500 text-white shadow-sm flex items-center';
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

        daysEl.textContent = String(days).padStart(2, '0');
        hoursEl.textContent = String(hours).padStart(2, '0');
        minutesEl.textContent = String(minutes).padStart(2, '0');
        secondsEl.textContent = String(seconds).padStart(2, '0');
    }

    updateTimer();
    window._festivalCountdownInterval = setInterval(updateTimer, 1000);
}

/**
 * Render Cổng Sự Kiện & Lễ Hội Văn Hóa Trà Vinh
 */
export function renderFestivalsSection(containerId, festivals = [], activeSeason = 'all', onOpenFestivalModal, onSelectPlace, onFilterSeason) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Chọn Lễ hội tâm điểm (Spotlight) - mặc định là Ok Om Bok hoặc lễ hội đầu tiên
    const spotlightFestival = festivals.find(f => f.id === 'ok-om-bok') || festivals[0];

    // Lọc theo mùa
    const filteredFestivals = activeSeason === 'all'
        ? festivals
        : festivals.filter(f => f.season === activeSeason);

    const seasons = [
        { id: 'all', label: `Tất cả mùa (${festivals.length})`, icon: 'calendar_month' },
        { id: 'spring', label: '🌸 Xuân (Chôl Chnăm Thmây)', icon: 'local_florist' },
        { id: 'summer', label: '☀️ Hạ (Trái Cây & Cúng Biển)', icon: 'wb_sunny' },
        { id: 'autumn', label: '🍂 Thu (Vu Lan & Sêne Đôlta)', icon: 'eco' },
        { id: 'winter', label: '❄️ Đông (Ok Om Bok Cúng Trăng)', icon: 'ac_unit' },
    ];

    container.innerHTML = `
        <div class="space-y-6 pt-3">
            <!-- Header Section -->
            <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                    <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs font-black uppercase tracking-wider mb-2">
                        <span class="material-symbols-outlined text-sm text-amber-600 animate-spin" style="animation-duration: 6s;">celebration</span>
                        CỔNG TRA CỨU SỰ KIỆN & LỄ HỘI TRÀ VINH
                    </div>
                    <h2 class="text-2xl sm:text-3xl font-black font-serif text-primary dark:text-zinc-100 leading-tight">
                        Mùa Lễ Hội & Di Sản Sống Động
                    </h2>
                    <p class="text-xs sm:text-sm text-on-surface-variant dark:text-zinc-400 mt-1 max-w-2xl">
                        Khám phá vẻ đẹp giao thoa văn hóa Kinh – Khmer – Hoa qua những ngày hội rực rỡ sắc màu quanh năm.
                    </p>
                </div>

                <!-- Live Status Tag -->
                <div class="hidden sm:flex items-center gap-2">
                    <span class="px-3 py-1.5 rounded-full text-xs font-bold bg-surface-container-high dark:bg-zinc-800 text-on-surface dark:text-zinc-200 border border-outline-variant/40 dark:border-zinc-700 flex items-center gap-1.5 shadow-xs">
                        <span class="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                        Cập nhật thời gian thực 2026
                    </span>
                </div>
            </div>

            <!-- 1. SPOTLIGHT FESTIVAL CARD KÈM LIVE COUNTDOWN TIMER -->
            ${spotlightFestival ? `
                <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-950 via-stone-900 to-emerald-950 text-white shadow-xl border border-amber-500/30 group">
                    <!-- Ảnh nền mờ nghệ thuật -->
                    <div class="absolute inset-0 z-0 opacity-30 group-hover:opacity-40 transition-opacity duration-700">
                        <img src="${spotlightFestival.heroImage}" alt="${spotlightFestival.name}" class="w-full h-full object-cover">
                    </div>
                    <!-- Lớp phủ gradient -->
                    <div class="absolute inset-0 z-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent"></div>

                    <div class="relative z-10 p-6 sm:p-10 flex flex-col justify-between space-y-6">
                        <!-- Top Badges -->
                        <div class="flex flex-wrap items-center justify-between gap-3">
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="px-3 py-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-black shadow-md uppercase tracking-wider flex items-center gap-1">
                                    <span class="material-symbols-outlined text-sm">stars</span>
                                    ĐẠI LỄ HỘI TÂM ĐIỂM XỨ TRÀ
                                </span>
                                <span class="px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-amber-200 text-xs font-bold">
                                    ${spotlightFestival.badge}
                                </span>
                            </div>

                            <span id="cdStatusBadge" class="px-3 py-1 rounded-full text-xs font-black bg-rose-600/90 text-white backdrop-blur-md shadow-sm flex items-center">
                                <span class="w-2 h-2 rounded-full bg-rose-300 animate-ping mr-1.5"></span> Sắp Khai Mạc
                            </span>
                        </div>

                        <!-- Main Festival Title & Intro -->
                        <div class="space-y-2 max-w-3xl">
                            <span class="text-xs sm:text-sm font-medium text-amber-300/90 italic tracking-wide block">
                                ${spotlightFestival.originalName}
                            </span>
                            <h3 class="text-2xl sm:text-4xl font-black font-serif text-white leading-tight drop-shadow-md">
                                ${spotlightFestival.name}
                            </h3>
                            <p class="text-xs sm:text-sm text-stone-200 line-clamp-2 leading-relaxed font-normal">
                                ${spotlightFestival.summary}
                            </p>
                        </div>

                        <!-- COUNTDOWN TIMER WIDGET -->
                        <div class="p-4 sm:p-5 rounded-2xl bg-black/40 backdrop-blur-md border border-white/15 max-w-2xl">
                            <div class="flex items-center justify-between mb-3 text-xs">
                                <span class="font-bold text-amber-300 flex items-center gap-1.5 uppercase tracking-wider">
                                    <span class="material-symbols-outlined text-base">timer</span>
                                    ĐẾM NGƯỢC THỜI GIAN KHAI HỘI
                                </span>
                                <span class="text-[11px] text-stone-300">
                                    ${spotlightFestival.lunarDate}
                                </span>
                            </div>

                            <!-- 4 Digit Boxes -->
                            <div class="grid grid-cols-4 gap-2 sm:gap-4 text-center">
                                <div class="p-2.5 sm:p-3.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 flex flex-col items-center">
                                    <span id="cdDays" class="text-2xl sm:text-4xl font-black font-mono text-white drop-shadow">00</span>
                                    <span class="text-[9px] sm:text-[11px] uppercase font-bold text-amber-300/90 mt-0.5 tracking-wider">NGÀY</span>
                                </div>
                                <div class="p-2.5 sm:p-3.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 flex flex-col items-center">
                                    <span id="cdHours" class="text-2xl sm:text-4xl font-black font-mono text-white drop-shadow">00</span>
                                    <span class="text-[9px] sm:text-[11px] uppercase font-bold text-amber-300/90 mt-0.5 tracking-wider">GIỜ</span>
                                </div>
                                <div class="p-2.5 sm:p-3.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 flex flex-col items-center">
                                    <span id="cdMinutes" class="text-2xl sm:text-4xl font-black font-mono text-white drop-shadow">00</span>
                                    <span class="text-[9px] sm:text-[11px] uppercase font-bold text-amber-300/90 mt-0.5 tracking-wider">PHÚT</span>
                                </div>
                                <div class="p-2.5 sm:p-3.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 flex flex-col items-center">
                                    <span id="cdSeconds" class="text-2xl sm:text-4xl font-black font-mono text-amber-400 drop-shadow">00</span>
                                    <span class="text-[9px] sm:text-[11px] uppercase font-bold text-amber-300/90 mt-0.5 tracking-wider">GIÂY</span>
                                </div>
                            </div>
                        </div>

                        <!-- Action Buttons & Quick Info -->
                        <div class="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-white/10">
                            <div class="flex items-center gap-2 text-xs text-stone-300">
                                <span class="material-symbols-outlined text-base text-amber-400">location_on</span>
                                <span>${spotlightFestival.locationName}</span>
                            </div>

                            <div class="flex items-center gap-2.5 w-full sm:w-auto">
                                <button type="button" data-festival-id="${spotlightFestival.id}" class="festival-view-detail-btn flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5">
                                    <span class="material-symbols-outlined text-base">auto_stories</span>
                                    <span>Xem Cẩm Nang Diễn Biến</span>
                                </button>
                                ${spotlightFestival.locationPlaceId ? `
                                    <button type="button" data-place-id="${spotlightFestival.locationPlaceId}" class="festival-goto-place-btn px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs backdrop-blur-md transition-all active:scale-95 flex items-center justify-center gap-1.5" title="Khám phá địa danh này">
                                        <span class="material-symbols-outlined text-base text-amber-300">map</span>
                                        <span>Ao Bà Om</span>
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            ` : ''}

            <!-- 2. BỘ LỌC THEO MÙA (SEASONAL TABS) -->
            <div class="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                ${seasons.map(s => `
                    <button type="button" data-season-id="${s.id}" class="festival-season-tab-btn px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                        activeSeason === s.id
                            ? 'bg-primary dark:bg-emerald-700 text-white shadow-xs scale-102'
                            : 'bg-surface-container dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 hover:bg-surface-container-high dark:hover:bg-zinc-700'
                    }">
                        <span class="material-symbols-outlined text-sm">${s.icon}</span>
                        <span>${s.label}</span>
                    </button>
                `).join('')}
            </div>

            <!-- 3. LƯỚI THẺ LỄ HỘI (FESTIVALS GRID) -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                ${filteredFestivals.map(fest => `
                    <div class="festival-card group rounded-3xl bg-surface-container-lowest dark:bg-dark-card border border-outline-variant/40 dark:border-dark-border overflow-hidden shadow-xs hover:shadow-lg hover:border-primary/50 dark:hover:border-emerald-500/50 transition-all duration-300 flex flex-col justify-between">
                        <!-- Ảnh đại diện -->
                        <div class="relative w-full aspect-[16/10] overflow-hidden bg-stone-100 dark:bg-zinc-800">
                            <img src="${fest.heroImage}" alt="${fest.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy">
                            <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20"></div>

                            <!-- Top badge -->
                            <div class="absolute top-3 left-3 flex flex-wrap gap-1.5">
                                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${fest.badgeColor}">
                                    ${fest.seasonName}
                                </span>
                            </div>

                            <!-- Thời gian Âm lịch nổi bật -->
                            <div class="absolute bottom-3 left-3 right-3 text-white">
                                <span class="inline-flex items-center gap-1 text-xs font-extrabold drop-shadow">
                                    <span class="material-symbols-outlined text-sm text-amber-300">calendar_today</span>
                                    ${fest.lunarDate}
                                </span>
                            </div>
                        </div>

                        <!-- Nội dung thẻ -->
                        <div class="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-3">
                            <div class="space-y-1.5">
                                <span class="text-[10px] font-semibold text-secondary dark:text-emerald-400 block line-clamp-1 italic">
                                    ${fest.originalName}
                                </span>
                                <h4 class="text-base sm:text-lg font-bold font-serif text-primary dark:text-zinc-100 group-hover:text-secondary dark:group-hover:text-emerald-400 transition-colors line-clamp-1">
                                    ${fest.name}
                                </h4>
                                <p class="text-xs text-on-surface-variant dark:text-zinc-400 line-clamp-2 leading-relaxed">
                                    ${fest.summary}
                                </p>
                            </div>

                            <!-- Địa điểm -->
                            <div class="flex items-center gap-1 text-xs text-on-surface-variant dark:text-zinc-400 pt-2 border-t border-outline-variant/30 dark:border-zinc-800">
                                <span class="material-symbols-outlined text-sm text-secondary dark:text-emerald-400 shrink-0">pin_drop</span>
                                <span class="truncate text-[11px] font-medium">${fest.locationName}</span>
                            </div>

                            <!-- Nút thao tác -->
                            <div class="pt-1 flex items-center gap-2">
                                <button type="button" data-festival-id="${fest.id}" class="festival-view-detail-btn flex-1 py-2 px-3 rounded-xl bg-surface-container hover:bg-surface-container-high dark:bg-zinc-800 dark:hover:bg-zinc-700 text-primary dark:text-emerald-300 font-bold text-xs border border-outline-variant/30 dark:border-zinc-700 transition-all active:scale-95 flex items-center justify-center gap-1.5">
                                    <span class="material-symbols-outlined text-sm text-secondary dark:text-emerald-400">menu_book</span>
                                    <span>Cẩm Nang Diễn Biến</span>
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    // Khởi động đồng hồ đếm ngược cho Spotlight
    if (spotlightFestival && spotlightFestival.targetDate) {
        startFestivalCountdown(spotlightFestival.targetDate);
    }

    // Gắn sự kiện chuyển tab mùa
    container.querySelectorAll('.festival-season-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const seasonId = btn.dataset.seasonId;
            if (seasonId && onFilterSeason) {
                onFilterSeason(seasonId);
            }
        });
    });

    // Gắn sự kiện xem chi tiết cẩm nang lễ hội
    container.querySelectorAll('.festival-view-detail-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const festId = btn.dataset.festivalId;
            if (festId && onOpenFestivalModal) {
                onOpenFestivalModal(festId);
            }
        });
    });

    // Gắn sự kiện mở địa điểm
    container.querySelectorAll('.festival-goto-place-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const placeId = btn.dataset.placeId;
            if (placeId && onSelectPlace) {
                onSelectPlace(placeId);
            }
        });
    });
}

/**
 * Render Modal Cẩm Nang Chi Tiết Diễn Biến Lễ Hội
 */
export function renderFestivalDetailModal(festival, allFestivals = [], onSelectPlace, onSelectOtherFestival) {
    const container = document.getElementById('festivalModalContainer');
    if (!container || !festival) return;

    container.innerHTML = `
        <div class="max-h-[85vh] overflow-y-auto">
            <!-- Hero Banner Modal -->
            <div class="relative w-full aspect-[16/8] sm:aspect-[21/9] bg-stone-900 overflow-hidden">
                <img src="${festival.heroImage}" alt="${festival.name}" class="w-full h-full object-cover">
                <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"></div>

                <div class="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-6 text-white space-y-1.5">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${festival.badgeColor}">
                            ${festival.seasonName}
                        </span>
                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 backdrop-blur-md text-amber-200">
                            ${festival.badge}
                        </span>
                    </div>

                    <span class="text-xs text-amber-300 font-medium italic block">
                        ${festival.originalName}
                    </span>

                    <h3 class="text-xl sm:text-3xl font-black font-serif text-white leading-tight drop-shadow">
                        ${festival.name}
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
                            ${festival.lunarDate}
                        </div>
                        <div class="text-[11px] text-on-surface-variant dark:text-zinc-400">
                            Dương lịch: ${festival.solarDateEstimate}
                        </div>
                    </div>

                    <div class="p-3.5 rounded-2xl bg-surface-container-low dark:bg-zinc-800 border border-outline-variant/30 dark:border-zinc-700 space-y-1">
                        <span class="text-[10px] uppercase font-bold text-secondary dark:text-emerald-400 flex items-center gap-1">
                            <span class="material-symbols-outlined text-sm">location_on</span> Địa điểm tâm điểm:
                        </span>
                        <div class="text-xs sm:text-sm font-black text-on-surface dark:text-zinc-100">
                            ${festival.locationName}
                        </div>
                        ${festival.locationPlaceId ? `
                            <button type="button" data-place-id="${festival.locationPlaceId}" class="modal-goto-place-link text-[11px] font-bold text-secondary dark:text-emerald-400 hover:underline flex items-center gap-0.5 pt-0.5">
                                Xem vị trí chi tiết trên bản đồ ViVu <span class="material-symbols-outlined text-xs">north_east</span>
                            </button>
                        ` : ''}
                    </div>
                </div>

                <!-- Ý Nghĩa & Nguồn Gốc Văn Hóa -->
                <div class="space-y-2 p-4 rounded-2xl bg-amber-500/10 dark:bg-amber-950/30 border border-amber-300/40 dark:border-amber-800/40">
                    <h4 class="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-base text-amber-600">lightbulb</span>
                        Ý Nghĩa Văn Hóa & Tín Ngưỡng
                    </h4>
                    <p class="text-xs sm:text-sm text-on-surface dark:text-zinc-200 leading-relaxed font-medium">
                        ${festival.significance}
                    </p>
                </div>

                <!-- DIỄN BIẾN LỄ HỘI THEO THỜI GIAN THỰC (TIMELINE) -->
                <div class="space-y-3">
                    <div class="flex items-center justify-between">
                        <h4 class="text-xs font-bold uppercase tracking-wider text-primary dark:text-emerald-400 flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-base text-rose-500">schedule</span>
                            Diễn Biến Sự Kiện & Lịch Trình Chi Tiết
                        </h4>
                        <span class="text-[10px] text-on-surface-variant dark:text-zinc-400">Theo Khung Giờ Bản Địa</span>
                    </div>

                    <!-- Vertical Timeline -->
                    <div class="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-amber-500 before:via-emerald-500 before:to-rose-500">
                        ${festival.timeline.map((item, idx) => `
                            <div class="relative group">
                                <!-- Dot Icon -->
                                <div class="absolute -left-6 top-1 w-5 h-5 rounded-full bg-surface dark:bg-zinc-800 border-2 border-primary dark:border-emerald-400 flex items-center justify-center text-primary dark:text-emerald-400 shadow-xs group-hover:scale-110 transition-transform">
                                    <span class="material-symbols-outlined text-xs">${item.icon}</span>
                                </div>

                                <div class="p-3.5 rounded-2xl bg-surface-container-low dark:bg-zinc-800/80 border border-outline-variant/30 dark:border-zinc-700/60 hover:border-primary/40 transition-all space-y-1">
                                    <span class="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400 tracking-wider">
                                        ${item.time}
                                    </span>
                                    <h5 class="text-xs sm:text-sm font-bold text-on-surface dark:text-zinc-100 font-serif">
                                        ${item.title}
                                    </h5>
                                    <p class="text-xs text-on-surface-variant dark:text-zinc-300 leading-relaxed">
                                        ${item.desc}
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
                        ${festival.localTips.map(tip => `
                            <div class="p-3 rounded-2xl bg-surface-container-low dark:bg-zinc-800/60 border border-outline-variant/20 dark:border-zinc-700/50 text-xs text-on-surface-variant dark:text-zinc-300 flex items-start gap-2">
                                <span class="material-symbols-outlined text-sm text-amber-500 shrink-0 mt-0.5">verified</span>
                                <span class="leading-relaxed">${tip}</span>
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
                        ${festival.traditionalFood}
                    </p>
                </div>

                <!-- KHÁM PHÁ CÁC LỄ HỘI KHÁC -->
                <div class="pt-2 border-t border-outline-variant/30 dark:border-zinc-800 space-y-2">
                    <span class="text-xs font-bold text-on-surface dark:text-zinc-200 block">
                        Khám phá các ngày hội khác của Trà Vinh:
                    </span>
                    <div class="flex flex-wrap gap-2">
                        ${allFestivals.filter(f => f.id !== festival.id).map(f => `
                            <button type="button" data-switch-festival-id="${f.id}" class="switch-fest-btn px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high dark:bg-zinc-800 dark:hover:bg-zinc-700 text-xs font-bold text-on-surface dark:text-zinc-200 border border-outline-variant/30 dark:border-zinc-700 transition-colors flex items-center gap-1 active:scale-95">
                                <span>${f.name.split('(')[0].trim()}</span>
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
