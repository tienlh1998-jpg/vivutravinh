// ViVuTraVinh - Main Application Controller (State, Filters, Maps, Comments, PWA)

import {
    renderStoryBubbles,
    renderHeroSpotlight,
    renderWeatherAndSmartSuggestions,
    renderPlacesGrid,
    renderDetailModal,
    renderCommentsList,
    renderCommentsSkeleton,
    renderCommentsError,
    NEUTRAL_PLACEHOLDER_IMAGE,
    isPlaceOpen,
    calculateDistanceKm,
    renderTourItineraries,
    SAMPLE_TOURS,
    generateSmartTour,
    getDynamicTour,
    renderFestivalsSection,
    renderFestivalDetailModal,
    renderArticlesSection,
    renderArticleReaderModal
} from './ui.js';

import {
    saveOfflineReview,
    getOfflineReviewsByPlace,
    getAllOfflineReviews,
    getPendingOfflineCount,
    compressImage,
    syncAllPendingReviews,
    setupAutoSync,
    saveOfflineContribution,
    getAllOfflineContributions,
    deleteOfflineContribution,
    getPendingContributionCount,
    syncAllPendingContributions
} from './offline-sync.js';

import { TRA_VINH_FESTIVALS } from './festivals-data.js';
import { TRA_VINH_ARTICLES } from './articles-data.js';
import { getSiteUrl, DEFAULT_SITE_URL } from './config.js';
import { validateCommentInput, CommentValidationError, CommentCooldownError } from './comments.js';
import {
    initTelemetry,
    recordJsError,
    recordNetworkError,
    recordSyncError
} from './telemetry.js';

// An toàn đọc favorites từ localStorage (Issue M10 & G2 Recovery)
function getStoredFavorites() {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const raw = localStorage.getItem('vivu_favorites');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    return parsed.filter(id => typeof id === 'string' && id.trim().length > 0);
                }
            }
        }
    } catch (e) {
        console.warn('[Favorites] Lỗi đọc favorites từ storage, tự động khôi phục:', e);
        try { localStorage.removeItem('vivu_favorites'); } catch {}
    }
    return [];
}

/**
 * Tìm địa điểm trong danh sách theo ID, Slug hoặc dbId
 */
export function findPlaceByAnyId(placeOrId, places = (typeof state !== 'undefined' && state ? state.allPlaces : [])) {
    if (!placeOrId) return null;
    if (typeof placeOrId === 'object') return placeOrId;
    const cleanId = String(placeOrId).trim();
    if (!cleanId) return null;
    return (places || []).find(p => (
        (p.id && String(p.id) === cleanId) ||
        (p.slug && String(p.slug) === cleanId) ||
        (p.dbId && String(p.dbId) === cleanId)
    )) || null;
}

/**
 * Trả về tập hợp tất cả bí danh (aliases) của địa điểm: ID, Slug, dbId, legacy_slugs
 */
export function getPlaceAliases(placeOrId, places = (typeof state !== 'undefined' && state ? state.allPlaces : [])) {
    const aliases = new Set();
    if (!placeOrId) return aliases;

    let place = null;
    if (typeof placeOrId === 'object') {
        place = placeOrId;
        if (place.id) aliases.add(String(place.id));
    } else {
        const cleanId = String(placeOrId).trim();
        if (cleanId) aliases.add(cleanId);
        place = findPlaceByAnyId(cleanId, places);
    }

    if (place) {
        if (place.id) aliases.add(String(place.id));
        if (place.slug) aliases.add(String(place.slug));
        if (place.dbId) aliases.add(String(place.dbId));
        if (Array.isArray(place.aliases)) {
            place.aliases.forEach(a => { if (a) aliases.add(String(a)); });
        }
        if (Array.isArray(place.legacy_slugs)) {
            place.legacy_slugs.forEach(a => { if (a) aliases.add(String(a)); });
        }
    }

    return aliases;
}

/**
 * Trả về khóa chuẩn duy nhất để lưu trữ (ưu tiên dbId bền vững, fallback slug/id)
 */
export function getPlaceCanonicalKey(placeOrId, places = (typeof state !== 'undefined' && state ? state.allPlaces : [])) {
    if (!placeOrId) return null;
    const place = typeof placeOrId === 'object' ? placeOrId : findPlaceByAnyId(placeOrId, places);
    if (place) {
        if (place.dbId !== undefined && place.dbId !== null && String(place.dbId).trim().length > 0) {
            return String(place.dbId).trim();
        }
        if (place.id !== undefined && place.id !== null && String(place.id).trim().length > 0) {
            return String(place.id).trim();
        }
        if (place.slug !== undefined && place.slug !== null && String(place.slug).trim().length > 0) {
            return String(place.slug).trim();
        }
    }
    return typeof placeOrId === 'string' ? placeOrId.trim() : null;
}

/**
 * Chuyển đổi toàn bộ favorite và recent từ slug cũ sang dbId chuẩn khi places được tải
 */
export function canonicalizePreferences(places = (typeof state !== 'undefined' && state ? state.allPlaces : [])) {
    if (!Array.isArray(places) || places.length === 0 || typeof state === 'undefined' || !state) return;

    let favChanged = false;
    const newFavs = [];
    for (const fav of (state.favorites || [])) {
        const place = findPlaceByAnyId(fav, places);
        const targetKey = place ? getPlaceCanonicalKey(place, places) : fav;
        if (targetKey !== fav) favChanged = true;
        if (!newFavs.includes(targetKey)) {
            newFavs.push(targetKey);
        } else if (targetKey !== fav) {
            favChanged = true;
        }
    }
    if (favChanged || newFavs.length !== (state.favorites || []).length) {
        state.favorites = newFavs;
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                localStorage.setItem('vivu_favorites', JSON.stringify(state.favorites));
            }
        } catch (e) {}
    }

    let recChanged = false;
    const newRecs = [];
    for (const rec of (state.recent || [])) {
        const place = findPlaceByAnyId(rec, places);
        const targetKey = place ? getPlaceCanonicalKey(place, places) : rec;
        if (targetKey !== rec) recChanged = true;
        if (!newRecs.includes(targetKey)) {
            newRecs.push(targetKey);
        } else if (targetKey !== rec) {
            recChanged = true;
        }
    }
    if (recChanged || newRecs.length !== (state.recent || []).length) {
        state.recent = newRecs.slice(0, 20);
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                localStorage.setItem('vivu_recent', JSON.stringify(state.recent));
            }
        } catch (e) {}
    }
}

export function isPlaceSaved(placeOrId) {
    if (!placeOrId || typeof state === 'undefined' || !state) return false;
    const favs = state.favorites || [];
    if (!favs.length) return false;

    const aliases = getPlaceAliases(placeOrId, state.allPlaces);
    for (const alias of aliases) {
        if (favs.includes(alias)) return true;
    }
    return false;
}

export function isPlaceRecent(placeOrId) {
    if (!placeOrId || typeof state === 'undefined' || !state) return false;
    const recs = state.recent || [];
    if (!recs.length) return false;

    const aliases = getPlaceAliases(placeOrId, state.allPlaces);
    for (const alias of aliases) {
        if (recs.includes(alias)) return true;
    }
    return false;
}

export function showNoticeToast(titleText, msgText) {
    const toast = document.getElementById('offlineSyncToast');
    const title = document.getElementById('syncToastTitle');
    const msg = document.getElementById('syncToastMsg');
    if (!toast) return;
    if (title) title.textContent = titleText;
    if (msg) msg.textContent = msgText;
    toast.classList.remove('hidden');
    setTimeout(() => {
        if (toast) toast.classList.add('hidden');
    }, 4500);
}

// An toàn đọc danh sách vừa xem từ localStorage (Recently Viewed - Issue M11 & G2)
function getStoredRecent() {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const raw = localStorage.getItem('vivu_recent');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    return parsed.filter(id => typeof id === 'string' && id.trim().length > 0).slice(0, 20);
                }
            }
        }
    } catch (e) {
        console.warn('[Recent] Lỗi đọc recent từ storage, tự động khôi phục:', e);
        try { localStorage.removeItem('vivu_recent'); } catch {}
    }
    return [];
}

export function saveRecentPlace(placeOrId) {
    if (!placeOrId || typeof state === 'undefined' || !state) return;
    const aliases = getPlaceAliases(placeOrId, state.allPlaces);
    const canonicalKey = getPlaceCanonicalKey(placeOrId, state.allPlaces);
    if (!canonicalKey) return;

    // Lọc bỏ toàn bộ bí danh liên quan để không bị trùng hoặc lưu cả slug lẫn dbId
    const filtered = (state.recent || []).filter(id => !aliases.has(id));
    filtered.unshift(canonicalKey);
    state.recent = filtered.slice(0, 20);

    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem('vivu_recent', JSON.stringify(state.recent));
        }
    } catch (e) {
        console.warn('[Recent] Không thể ghi recent vào storage:', e);
    }
}

export function clearRecentHistory() {
    state.recent = [];
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.removeItem('vivu_recent');
        }
    } catch (e) {}

    const recentBanner = document.getElementById('recentActiveBanner');
    if (recentBanner) {
        recentBanner.classList.add('hidden');
    }

    if (state.activeCategory === 'recent') {
        applyFilters();
    }
}

// Global Application State
export const state = {
    allPlaces: [],
    filteredPlaces: [],
    spotlightPlace: null,
    activeBubble: 'all',
    activeCategory: '',
    activeArea: '',
    activePrice: '',
    activeRating: 0,
    activeOpenNow: false,
    searchTerm: '',
    favorites: getStoredFavorites(),
    recent: getStoredRecent(),
    currentDetailPlace: null,
    currentCommentRequestId: 0,
    lastActiveElement: null,
    miniMap: null,
    fullMap: null,
    modalMap: null,
    contributeMap: null,
    contributeMarker: null,
    contributePhotos: [],
    deferredPrompt: null,
    // GPS & Tour State
    userCoords: null,
    isNearMeActive: false,
    activeTourId: 'khmer-culture',
    // Photo Review State
    selectedCommentPhoto: null,
    // Lễ Hội & Sự Kiện State
    festivals: TRA_VINH_FESTIVALS,
    activeFestivalSeason: 'all',
    currentFestival: null,
    // Góc Chuyện Xứ Trà (Travel Stories) State
    articles: TRA_VINH_ARTICLES,
    currentArticle: null,
    selectedArticleCommentPhoto: null
};

// Khởi chạy khi DOM tải xong
function onAppStart() {
    initTelemetry();
    initTheme();
    initEventListeners();
    initPwaInstall();
    initServiceWorkerUpdateFlow();
    restorePendingDraft();
    initApp();
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onAppStart);
    } else {
        onAppStart();
    }
}

/**
 * Khởi tạo theme Dark/Light
 */
function initTheme() {
    const savedTheme = localStorage.getItem('vivu_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    updateThemeIcon();
}

export function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('vivu_theme', isDark ? 'dark' : 'light');
    updateThemeIcon();
}

function updateThemeIcon() {
    const isDark = document.documentElement.classList.contains('dark');
    const iconEl = document.getElementById('themeToggleIcon');
    if (iconEl) {
        iconEl.textContent = isDark ? 'light_mode' : 'dark_mode';
    }
}

/**
 * Khởi tạo dữ liệu chính
 */
async function initApp() {
    showLoading(true);
    hideError();

    try {
        if (!window.ViVuData) {
            await new Promise(resolve => window.addEventListener('vivu:data-ready', resolve, { once: true }));
        }

        const places = await window.ViVuData.loadPlaces();
        if (!Array.isArray(places) || places.length === 0) {
            throw new Error('Chưa có địa điểm nào được duyệt để hiển thị.');
        }

        state.allPlaces = places;
        state.filteredPlaces = [...places];

        // Chuẩn hóa preferences lưu trong localStorage sang dbId canonical key
        canonicalizePreferences(places);

        // Chọn địa điểm Spotlight: ưu tiên Ao Bà Om, Chùa Âng hoặc địa điểm có rating cao nhất
        state.spotlightPlace = places.find(p => p.name.toLowerCase().includes('ao bà om'))
            || places.find(p => p.name.toLowerCase().includes('chùa âng'))
            || places[0];

        // Render các khối Bento
        renderStoryBubbles('storyBubblesContainer', state.activeBubble, handleBubbleSelect);
        renderHeroSpotlight('heroSpotlightContainer', state.spotlightPlace, openDetailModal, toggleBookmark, isPlaceSaved(state.spotlightPlace));
        renderWeatherAndSmartSuggestions('smartSuggestionsContainer', state.allPlaces, openDetailModal);

        // Render Section Lịch trình tour 1 ngày
        renderTourItineraries(
            'tourItinerariesContainer',
            state.activeTourId,
            handleTourSelect,
            openDetailModal,
            handleSearchKeyword,
            handleGenerateRandomTour
        );

        // Render Cổng Sự Kiện & Lễ Hội Trà Vinh
        renderFestivalsSection(
            'festivalsPortalContainer',
            state.festivals,
            state.activeFestivalSeason,
            openFestivalModal,
            openDetailModal,
            handleSeasonFilter
        );

        // Render Section Góc Chuyện Xứ Trà (Travel Stories)
        renderArticlesSection(
            'travelStoriesContainer',
            state.articles,
            openArticleModal
        );

        populateAreaDropdown();
        renderMainDiscoveryGrid();
        updateResultsCount(state.filteredPlaces.length);
        updateFavoritesCount();
        updateDataSourceBadge(places);

        // Khởi tạo Mini Map Bento
        initMiniMap();

        showLoading(false);

        // Kiểm tra deep link (?place=slug)
        handleDeepLink();

        // Khởi tạo hệ thống tự động đồng bộ đánh giá ngoại tuyến
        initOfflineSyncManager();

    } catch (err) {
        console.error('[ViVuTraVinh] Lỗi tải dữ liệu:', err);
        showLoading(false);
        showError('Không thể nạp dữ liệu cẩm nang. Vui lòng thử lại sau.');
    }
}

/**
 * Xử lý click Story Bubble
 */
function handleBubbleSelect(story) {
    if (story.id === 'nearme') {
        toggleNearMeFilter();
        return;
    }

    if (story.id === 'tours') {
        state.activeBubble = 'tours';
        renderStoryBubbles('storyBubblesContainer', state.activeBubble, handleBubbleSelect);
        const tourSection = document.getElementById('tourItinerariesSection');
        if (tourSection) {
            tourSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
    }

    if (story.id === 'festivals' || story.type === 'festivals') {
        state.activeBubble = 'festivals';
        renderStoryBubbles('storyBubblesContainer', state.activeBubble, handleBubbleSelect);
        const festSection = document.getElementById('festivalsPortalSection');
        if (festSection) {
            festSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
    }

    state.activeBubble = story.id;
    renderStoryBubbles('storyBubblesContainer', state.activeBubble, handleBubbleSelect);

    // Reset các bộ lọc khác
    state.searchTerm = '';
    const searchInput = document.getElementById('discoverySearchInput');
    if (searchInput) searchInput.value = '';

    if (story.type === 'category') {
        state.activeCategory = story.value;
        state.activeOpenNow = false;
        // Đồng bộ tab
        updateActiveCategoryTab(story.value);
    } else if (story.type === 'keyword') {
        state.activeCategory = '';
        state.searchTerm = story.value;
        if (searchInput) searchInput.value = story.value;
        updateActiveCategoryTab('');
    } else if (story.type === 'openNow') {
        state.activeCategory = '';
        state.activeOpenNow = true;
        updateActiveCategoryTab('');
    } else if (story.type === 'saved') {
        state.activeCategory = 'saved';
        updateActiveCategoryTab('saved');
    }

    applyFilters();

    // Cuộn mượt đến lưới khám phá
    const discoverySection = document.getElementById('discoverySection');
    if (discoverySection) {
        discoverySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/**
 * Chuyển đổi Tour 1 Ngày
 */
function handleTourSelect(tourId) {
    state.activeTourId = tourId;
    renderTourItineraries(
        'tourItinerariesContainer',
        state.activeTourId,
        handleTourSelect,
        openDetailModal,
        handleSearchKeyword,
        handleGenerateRandomTour
    );
}

/**
 * Tạo Tour Tự Động Thông Minh (Đổi Tour Ngẫu Hứng)
 */
export function handleGenerateRandomTour() {
    const newTour = generateSmartTour(state.allPlaces);
    if (newTour) {
        state.activeTourId = 'smart-dynamic-tour';
        renderTourItineraries(
            'tourItinerariesContainer',
            state.activeTourId,
            handleTourSelect,
            openDetailModal,
            handleSearchKeyword,
            handleGenerateRandomTour
        );

        const section = document.getElementById('tourItinerariesSection');
        if (section) {
            section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

/**
 * Tìm kiếm từ khóa từ điểm dừng trong Tour
 */
function handleSearchKeyword(keyword) {
    state.searchTerm = keyword;
    const searchInput = document.getElementById('discoverySearchInput');
    if (searchInput) searchInput.value = keyword;
    state.activeCategory = '';
    state.activeBubble = '';
    updateActiveCategoryTab('');
    renderStoryBubbles('storyBubblesContainer', state.activeBubble, handleBubbleSelect);
    applyFilters();

    const discoverySection = document.getElementById('discoverySection');
    if (discoverySection) {
        discoverySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/**
 * Lọc Sự Kiện & Lễ Hội Theo Mùa
 */
export function handleSeasonFilter(season) {
    state.activeFestivalSeason = season;
    renderFestivalsSection(
        'festivalsPortalContainer',
        state.festivals,
        state.activeFestivalSeason,
        openFestivalModal,
        openDetailModal,
        handleSeasonFilter
    );
}

/**
 * Mở Modal Cẩm Nang Chi Tiết Diễn Biến Lễ Hội
 */
export function openFestivalModal(festivalId) {
    const fest = state.festivals.find(f => f.id === festivalId);
    if (!fest) return;

    state.currentFestival = fest;
    renderFestivalDetailModal(
        fest,
        state.festivals,
        (placeId) => {
            closeFestivalModal();
            openDetailModal(placeId);
        },
        openFestivalModal
    );

    const modal = document.getElementById('festivalDetailModal');
    if (modal) modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

/**
 * Đóng Modal Cẩm Nang Lễ Hội
 */
export function closeFestivalModal() {
    const modal = document.getElementById('festivalDetailModal');
    if (modal) modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    state.currentFestival = null;
}

/**
 * Mở Modal Đọc Ký Sự Du Lịch & Diễn Đàn Thảo Luận (Article Reader Modal)
 */
export async function openArticleModal(articleIdOrSlug) {
    const article = state.articles.find(a => String(a.id) === String(articleIdOrSlug) || a.slug === String(articleIdOrSlug));
    if (!article) return;

    state.currentArticle = article;
    state.selectedArticleCommentPhoto = null;

    const articleKey = `article-${article.id}`;
    let onlineComments = [];
    if (window.ViVuComments) {
        try {
            onlineComments = await window.ViVuComments.loadComments(articleKey);
        } catch (e) {
            console.warn('[ViVuComments] Không tải được bình luận bài viết:', e);
        }
    }

    let offlineComments = [];
    try {
        offlineComments = await getOfflineReviewsByPlace(articleKey);
    } catch (e) {
        console.warn('[OfflineSync] Không đọc được bình luận bài viết offline:', e);
    }

    const allComments = [...offlineComments, ...(onlineComments || [])];

    renderArticleReaderModal(
        article,
        allComments,
        state.allPlaces,
        (placeId) => {
            closeArticleModal();
            openDetailModal(placeId);
        }
    );

    const modal = document.getElementById('articleDetailModal');
    if (modal) modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');

    // Cập nhật URL (hỗ trợ deep link bài viết)
    const url = new URL(window.location);
    url.searchParams.set('article', article.slug || article.id);
    window.history.replaceState({}, '', url);
}

/**
 * Đóng Modal Đọc Bài Viết
 */
export function closeArticleModal() {
    const modal = document.getElementById('articleDetailModal');
    if (modal) modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    state.currentArticle = null;
    state.selectedArticleCommentPhoto = null;

    // Xóa param ?article khỏi URL
    const url = new URL(window.location);
    url.searchParams.delete('article');
    window.history.replaceState({}, '', url);
}

/**
 * Mở cẩm nang địa điểm từ liên kết trong bài viết
 */
export function openDetailFromArticle(placeId) {
    closeArticleModal();
    openDetailModal(placeId);
}

/**
 * Xử lý đính kèm ảnh chụp thực tế trong bình luận bài viết
 */
export async function handleArticlePhotoSelect(file) {
    if (!file) return;
    try {
        const compressed = await compressImage(file, 1200, 1200, 0.75);
        state.selectedArticleCommentPhoto = {
            dataUrl: compressed.dataUrl,
            fileName: file.name,
            fileSize: `${Math.round(compressed.compressedSize / 1024)} KB`
        };

        const previewContainer = document.getElementById('articleCommentPhotoPreview');
        const img = document.getElementById('articleCommentPhotoImg');
        const btnText = document.getElementById('articlePhotoBtnText');

        if (img) img.src = compressed.dataUrl;
        if (previewContainer) previewContainer.classList.remove('hidden');
        if (btnText) btnText.textContent = 'Đổi ảnh khác';
    } catch (err) {
        alert(err.message || 'Không thể xử lý hình ảnh');
    }
}

/**
 * Xóa ảnh đính kèm trong bình luận bài viết
 */
export function removeArticleCommentPhoto() {
    state.selectedArticleCommentPhoto = null;
    const input = document.getElementById('articleCommentPhotoInput');
    if (input) input.value = '';
    const previewContainer = document.getElementById('articleCommentPhotoPreview');
    if (previewContainer) previewContainer.classList.add('hidden');
    const btnText = document.getElementById('articlePhotoBtnText');
    if (btnText) btnText.textContent = 'Đính kèm ảnh';
}

/**
 * Gửi bình luận / thảo luận bài viết
 */
export async function handleArticleCommentSubmit(e) {
    if (e) e.preventDefault();
    if (!state.currentArticle) return;

    const authorInput = document.getElementById('articleCommentAuthor');
    const contentInput = document.getElementById('articleCommentContent');

    const authorName = authorInput?.value.trim();
    const commentText = contentInput?.value.trim();
    const photoData = state.selectedArticleCommentPhoto ? state.selectedArticleCommentPhoto.dataUrl : null;

    if (!authorName) {
        alert('Vui lòng nhập tên hoặc biệt danh của bạn.');
        return;
    }
    if (!commentText || commentText.length < 3) {
        alert('Vui lòng nhập nội dung chia sẻ ít nhất 3 ký tự.');
        return;
    }

    const articleKey = `article-${state.currentArticle.id}`;
    const articleTitle = state.currentArticle.title;

    try {
        if (!navigator.onLine) {
            await saveOfflineReview({
                placeId: articleKey,
                placeName: `[Bài viết] ${articleTitle}`,
                authorName,
                rating: 5,
                commentText,
                photoData
            });
            alert('⚡ Đang offline: Bình luận của bạn đã được lưu an toàn trên máy và sẽ tự động gửi khi có mạng!');
            let success = false;
            if (window.ViVuComments) {
                try {
                    await window.ViVuComments.submitComment({
                        placeId: articleKey,
                        placeName: `[Bài viết] ${articleTitle}`,
                        authorName,
                        rating: 5,
                        commentText,
                        photoData
                    });
                    success = true;
                } catch (apiErr) {
                    const isValidation = apiErr instanceof CommentValidationError || apiErr.code === 'VALIDATION_ERROR';
                    const isCooldown = apiErr instanceof CommentCooldownError || apiErr.code === 'COOLDOWN_ERROR';
                    const isAuth = apiErr.isAuthError || apiErr.status === 401 || apiErr.status === 403;
                    const isSchema = apiErr.isSchemaError || (apiErr.status === 400 && !/failed to fetch/i.test(apiErr.message));

                    if (isValidation || isCooldown || isAuth || isSchema) {
                        alert(apiErr.message || 'Không thể gửi bình luận bài viết.');
                        return;
                    }
                    console.warn('[ViVuComments] Gửi trực tiếp gặp lỗi mạng, chuyển sang lưu offline:', apiErr);
                }
            }

            if (success) {
                alert('Cảm ơn bạn! Bình luận của bạn đã được đăng thành công.');
            } else {
                await saveOfflineReview({
                    placeId: articleKey,
                    placeName: `[Bài viết] ${articleTitle}`,
                    authorName,
                    rating: 5,
                    commentText,
                    photoData
                });
                alert('⚡ Mạng yếu: Bình luận đã được lưu vào máy và sẽ tự động đồng bộ khi có kết nối trở lại!');
            }
        }

        if (contentInput) contentInput.value = '';
        removeArticleCommentPhoto();
        await reloadArticleComments(articleKey);
    } catch (err) {
        alert(err.message || 'Lỗi khi gửi thảo luận. Vui lòng thử lại.');
    }
}

/**
 * Tải lại danh sách bình luận dưới bài viết
 */
async function reloadArticleComments(articleKey) {
    let onlineComments = [];
    if (window.ViVuComments) {
        try {
            onlineComments = await window.ViVuComments.loadComments(articleKey);
        } catch (e) {
            console.warn('[ViVuComments] Không tải được bình luận bài viết:', e);
        }
    }

    let offlineComments = [];
    try {
        offlineComments = await getOfflineReviewsByPlace(articleKey);
    } catch (e) {
        console.warn('[OfflineSync] Không đọc được bình luận bài viết offline:', e);
    }

    const allComments = [...offlineComments, ...(onlineComments || [])];
    const listEl = document.getElementById('articleCommentsList');
    if (!listEl) return;

    if (allComments.length === 0) {
        listEl.innerHTML = `
            <div class="p-6 text-center text-xs text-slate-500 dark:text-zinc-400 bg-surface-container-low dark:bg-zinc-800/40 rounded-2xl border border-dashed border-outline-variant/40">
                💬 Chưa có bình luận nào cho bài viết này. Hãy là người đầu tiên chia sẻ cảm nghĩ của bạn!
            </div>
        `;
    } else {
        listEl.innerHTML = allComments.map(c => `
            <div class="p-4 rounded-2xl bg-surface-container-lowest dark:bg-zinc-800/60 border border-outline-variant/30 dark:border-zinc-700 space-y-2">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <div class="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-primary dark:text-emerald-300 font-bold text-xs flex items-center justify-center">
                            ${(c.author_name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div class="font-bold text-xs text-slate-800 dark:text-zinc-200">${c.author_name || 'Bạn đọc ẩn danh'}</div>
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
                    ${c.comment_text}
                </p>
                ${c.photo_url || c.photo_data ? `
                    <div class="pl-10 pt-1">
                        <img src="${c.photo_url || c.photo_data}" alt="Ảnh thực tế" onclick="window.ViVuApp.viewPhotoModal(this.src)" class="w-20 h-20 object-cover rounded-xl cursor-pointer border border-outline-variant/30 hover:scale-105 transition-transform">
                    </div>
                ` : ''}
            </div>
        `).join('');
    }
}

/**
 * Chia sẻ bài viết (Facebook hoặc Sao chép liên kết)
 */
export function shareArticle(type) {
    if (!state.currentArticle) return;
    const url = `${window.location.origin}${window.location.pathname}?article=${state.currentArticle.slug || state.currentArticle.id}`;
    if (type === 'facebook') {
        const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
        window.open(shareUrl, '_blank', 'width=600,height=400');
    } else if (type === 'copy') {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(() => {
                alert('Đã sao chép liên kết bài viết vào bộ nhớ tạm!');
            }).catch(() => {
                prompt('Sao chép liên kết:', url);
            });
        } else {
            prompt('Sao chép liên kết:', url);
        }
    }
}

/**
 * Xử lý click Tab Danh Mục
 */
function handleCategoryTabClick(catValue) {
    state.activeCategory = catValue;
    updateActiveCategoryTab(catValue);

    const recentBanner = document.getElementById('recentActiveBanner');
    if (recentBanner) {
        recentBanner.classList.toggle('hidden', catValue !== 'recent');
    }

    if (catValue === 'saved') {
        state.activeBubble = 'saved';
    } else if (catValue === 'Ẩm thực') {
        state.activeBubble = 'food';
    } else if (catValue === 'Chùa') {
        state.activeBubble = 'pagoda';
    } else if (catValue === 'Cafe') {
        state.activeBubble = 'cafe';
    } else if (!catValue) {
        state.activeBubble = 'all';
    } else {
        state.activeBubble = '';
    }
    renderStoryBubbles('storyBubblesContainer', state.activeBubble, handleBubbleSelect);

    applyFilters();
}

function updateActiveCategoryTab(catValue) {
    document.querySelectorAll('.category-tab-btn').forEach(btn => {
        const val = btn.dataset.category || '';
        if (val === catValue) {
            btn.className = 'category-tab-btn px-4 py-2 rounded-full bg-primary text-white font-semibold text-xs whitespace-nowrap shadow-xs flex items-center gap-1.5 transition-all';
        } else {
            btn.className = 'category-tab-btn px-3.5 py-2 rounded-full bg-surface-container dark:bg-zinc-800 text-on-surface dark:text-zinc-300 font-semibold text-xs whitespace-nowrap hover:bg-surface-container-high dark:hover:bg-zinc-700 transition-colors flex items-center gap-1';
        }
    });
}

/**
 * Hàm loại bỏ dấu tiếng Việt chuẩn hóa chuỗi phục vụ tìm kiếm không dấu
 */
const cleanStr = (s) => (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();

/**
 * Áp dụng tất cả bộ lọc
 */
function applyFilters() {
    const term = state.searchTerm.trim();
    const cat = state.activeCategory.toLowerCase();
    const area = state.activeArea;
    const price = state.activePrice;
    const minRating = state.activeRating;
    const openNow = state.activeOpenNow;

    state.filteredPlaces = state.allPlaces.filter(place => {
        // 0. Lọc theo mục Đã Lưu hoặc Vừa Xem
        if (cat === 'saved') {
            if (!isPlaceSaved(place)) return false;
        } else if (cat === 'recent') {
            if (!isPlaceRecent(place)) return false;
        }

        // 1. Lọc theo từ khóa (hỗ trợ cả tiếng Việt có dấu và KHÔNG DẤU)
        if (term) {
            const cleanTerm = cleanStr(term);
            const matchName = cleanStr(place.name).includes(cleanTerm);
            const matchDesc = cleanStr(place.description).includes(cleanTerm);
            const matchAddr = cleanStr(place.address).includes(cleanTerm);
            const matchCat = cleanStr(place.category).includes(cleanTerm);
            const matchArea = cleanStr(place.area).includes(cleanTerm);
            const matchTags = Array.isArray(place.tags) && place.tags.some(t => cleanStr(t).includes(cleanTerm));
            if (!matchName && !matchDesc && !matchAddr && !matchCat && !matchArea && !matchTags) return false;
        }

        // 2. Lọc theo Danh mục (chuẩn hóa theo category ID / alias tiếng Việt)
        if (cat && cat !== 'saved' && cat !== 'recent') {
            const cleanPCat = cleanStr(place.category || '');
            const cleanCategory = cleanStr(cat);

            if (cleanCategory === 'am thuc') {
                if (!/am thuc|mon ngon|an vat|dac san|quan an/i.test(cleanPCat)) return false;
            } else if (cleanCategory === 'chua') {
                if (!/chua|tam linh|wat/i.test(cleanPCat)) return false;
            } else if (cleanCategory === 'di tich') {
                if (!/di tich|lich su|bao tang/i.test(cleanPCat)) return false;
            } else if (cleanCategory === 'cafe') {
                if (!/cafe|ca phe|tra sua/i.test(cleanPCat)) return false;
            } else if (cleanCategory === 'check-in' || cleanCategory === 'check in') {
                if (!/check-in|song ao|sinh thai|cu lao|con|bien/i.test(cleanPCat)) return false;
            } else if (!cleanPCat.includes(cleanCategory)) {
                return false;
            }
        }

        // 3. Lọc theo Khu vực
        if (area && place.area !== area) {
            return false;
        }

        // 4. Lọc theo Khoảng giá (Chuẩn hóa quy tắc G2: "Dưới 50k" = Toàn bộ khoảng giá < 50k)
        if (price) {
            if (price === 'free') {
                if (!place.isFree) return false;
            } else {
                // Các khoảng giá tiền không nhận place miễn phí hoặc chưa rõ giá (unknown/Liên hệ)
                if (place.isFree || place.isUnknownPrice) return false;

                const minVal = place.priceMin;
                const maxVal = place.priceMax;

                if (minVal === null || maxVal === null) return false;

                if (price === 'under50') {
                    // TOÀN BỘ khoảng giá dưới 50k (maxVal <= 50.000đ và minVal > 0)
                    if (maxVal > 50000 || minVal <= 0) return false;
                } else if (price === '50to200') {
                    // 50k - 200k: có mức giá trong khoảng 50k - 200k
                    if (maxVal < 50000 || minVal > 200000) return false;
                } else if (price === 'over200') {
                    // Trên 200k: có mức giá trên 200k
                    if (maxVal <= 200000) return false;
                }
            }
        }

        // 5. Lọc theo Sao đánh giá (loại trừ các địa điểm chưa có đánh giá rating = 0)
        if (minRating > 0) {
            if (place.isUnknownRating || (place.rating || 0) < minRating) return false;
        }

        // 6. Lọc theo Đang mở cửa (chỉ true khi status === 'open')
        if (openNow && !isPlaceOpen(place)) {
            return false;
        }

        return true;
    });

    // Sắp xếp ưu tiên:
    // Nếu đang xem "Vừa xem" (recent): sắp xếp theo thứ tự vừa xem gần nhất
    if (cat === 'recent') {
        state.filteredPlaces.sort((a, b) => {
            const getRecentIndex = (place) => {
                const aliases = getPlaceAliases(place, state.allPlaces);
                for (let i = 0; i < (state.recent || []).length; i++) {
                    if (aliases.has(state.recent[i])) return i;
                }
                return 999;
            };
            return getRecentIndex(a) - getRecentIndex(b);
        });
    } else if (state.isNearMeActive) {
        // Nếu bộ lọc Gần tôi nhất đang bật, sắp xếp theo khoảng cách tăng dần
        state.filteredPlaces.sort((a, b) => {
            const distA = a.distanceKm !== undefined ? a.distanceKm : 99999;
            const distB = b.distanceKm !== undefined ? b.distanceKm : 99999;
            return distA - distB;
        });
    }

    renderMainDiscoveryGrid();
    updateResultsCount(state.filteredPlaces.length);
}

function renderMainDiscoveryGrid() {
    renderPlacesGrid(
        'placesDiscoveryGrid',
        state.filteredPlaces,
        state.favorites,
        openDetailModal,
        toggleBookmark
    );
}

function updateResultsCount(count) {
    const countEl = document.getElementById('resultsCountLabel');
    if (countEl) {
        countEl.textContent = `${count} địa điểm`;
    }
    const shareTripBtn = document.getElementById('shareTripBtn');
    if (shareTripBtn) {
        const isSavedTab = state.activeCategory === 'saved';
        const hasSaved = (state.favorites || []).length > 0;
        if (isSavedTab && hasSaved) {
            shareTripBtn.classList.remove('hidden');
            shareTripBtn.classList.add('inline-flex');
        } else {
            shareTripBtn.classList.add('hidden');
            shareTripBtn.classList.remove('inline-flex');
        }
    }
}

function updateDataSourceBadge(places) {
    const badgeEl = document.getElementById('dataSourceBadge');
    if (!badgeEl) return;

    const isDev = typeof window !== 'undefined' && (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        new URLSearchParams(window.location.search).get('debug') === '1'
    );

    // Production: Chỉ hiển thị thông tin hữu ích cho khách, ẩn badge kỹ thuật nội bộ
    if (!isDev) {
        badgeEl.classList.add('hidden');
        return;
    }

    const meta = window.ViVuData?.getLastFetchMetadata ? window.ViVuData.getLastFetchMetadata() : {};
    const source = meta.source || places?.[0]?._source || (window.ViVuData?.getDataSource ? window.ViVuData.getDataSource() : 'mock');
    const timeStr = meta.timestamp ? new Date(meta.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
    const timeDisplay = timeStr ? ` · ${timeStr}` : '';

    badgeEl.classList.remove('hidden');

    if (source === 'mock') {
        badgeEl.className = 'inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 cursor-pointer select-none transition-all active:scale-95';
        badgeEl.innerHTML = `<span class="material-symbols-outlined text-xs text-amber-600 dark:text-amber-400">science</span> <span>DEV: Mock (${places?.length || 0}${timeDisplay})</span>`;
    } else if (source === 'fallback') {
        badgeEl.className = 'inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border bg-blue-100 dark:bg-blue-950/80 text-blue-900 dark:text-blue-200 border-blue-300 dark:border-blue-700 cursor-pointer select-none transition-all active:scale-95';
        badgeEl.innerHTML = `<span class="material-symbols-outlined text-xs text-blue-600 dark:text-blue-400">inventory_2</span> <span>DEV: Fallback (${places?.length || 0}${timeDisplay})</span>`;
    } else {
        badgeEl.className = 'inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border bg-emerald-100 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700 cursor-pointer select-none transition-all active:scale-95';
        badgeEl.innerHTML = `<span class="material-symbols-outlined text-xs text-emerald-600 dark:text-emerald-400">cloud_done</span> <span>DEV: Supabase (${places?.length || 0}${timeDisplay})</span>`;
    }

    badgeEl.onclick = () => {
        const choice = prompt(`Nguồn dữ liệu hiện tại: "${source}"\nNhập nguồn mới để chuyển đổi:\n- mock (10 ca thử nghiệm local)\n- fallback (12 địa điểm snapshot phát hành)\n- supabase (kết nối máy chủ backend)`, source);
        if (choice && ['mock', 'fallback', 'supabase'].includes(choice.trim().toLowerCase())) {
            window.ViVuData.setDataSource(choice.trim().toLowerCase());
        }
    };
}

/**
 * Quản lý Bookmark (Favorites)
 */
export function toggleBookmark(e, placeOrId) {
    if (e) {
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        if (typeof e.preventDefault === 'function') e.preventDefault();
    }
    if (!placeOrId || typeof state === 'undefined' || !state) return;

    const aliases = getPlaceAliases(placeOrId, state.allPlaces);
    const currentlySaved = isPlaceSaved(placeOrId);

    if (currentlySaved) {
        // Khi bỏ thích (unfavorite), xóa mọi bí danh liên quan (id, slug, dbId) để không bị sót hoặc trùng
        state.favorites = (state.favorites || []).filter(favId => !aliases.has(favId));
    } else {
        // Lưu khóa chuẩn bằng dbId khi có
        const canonicalKey = getPlaceCanonicalKey(placeOrId, state.allPlaces);
        if (canonicalKey) {
            // Trước khi thêm, đảm bảo gỡ sạch mọi bí danh cũ (nếu có) để tránh trùng lặp
            const cleanFavs = (state.favorites || []).filter(favId => !aliases.has(favId));
            cleanFavs.push(canonicalKey);
            state.favorites = cleanFavs;
        }
    }

    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem('vivu_favorites', JSON.stringify(state.favorites));
        }
    } catch (err) {
        console.warn('[Favorites] Không thể ghi favorites vào storage:', err);
    }

    updateFavoritesCount();

    if (typeof document !== 'undefined') {
        // Re-render nếu đang xem tab saved
        if (state.activeCategory === 'saved') {
            applyFilters();
        } else {
            renderMainDiscoveryGrid();
        }

        // Cập nhật Spotlight button nếu trùng
        if (state.spotlightPlace && aliases.has(state.spotlightPlace.id)) {
            const isSaved = isPlaceSaved(state.spotlightPlace);
            const btn = document.getElementById('spotlightSaveBtn');
            if (btn) {
                btn.innerHTML = `
                    <span class="material-symbols-outlined text-lg ${isSaved ? 'text-rose-400' : ''}" style="${isSaved ? "font-variation-settings: 'FILL' 1;" : ''}">
                        ${isSaved ? 'bookmark_added' : 'bookmark'}
                    </span>
                    <span>${isSaved ? 'Đã lưu' : 'Lưu địa điểm'}</span>
                `;
            }
        }
    }
}

export function updateFavoritesCount() {
    if (typeof state === 'undefined' || !state) return;
    const count = (state.favorites || []).length;
    if (typeof document === 'undefined') return;
    const countEl = document.getElementById('savedHeaderCount');
    if (countEl) {
        countEl.textContent = count;
        countEl.classList.toggle('hidden', count === 0);
    }
    const bottomNavBadge = document.getElementById('savedBottomNavBadge');
    if (bottomNavBadge) {
        bottomNavBadge.textContent = count;
        bottomNavBadge.classList.toggle('hidden', count === 0);
    }
}

/**
 * Làm rỗng dữ liệu ảnh đính kèm trong form đánh giá
 */
function clearCommentPhoto() {
    state.selectedCommentPhoto = null;
    const input = document.getElementById('commentPhotoInput');
    if (input) input.value = '';
    const container = document.getElementById('commentPhotoPreviewContainer');
    if (container) {
        container.classList.add('hidden');
        container.classList.remove('flex');
    }
    const btnText = document.getElementById('commentPhotoBtnText');
    if (btnText) btnText.textContent = 'Đính kèm ảnh chụp thực tế';
}

/**
 * Hiển thị khung preview ảnh đã chọn
 */
function showCommentPhotoPreview() {
    if (!state.selectedCommentPhoto) return;
    const container = document.getElementById('commentPhotoPreviewContainer');
    const img = document.getElementById('commentPhotoPreviewImg');
    const nameEl = document.getElementById('commentPhotoFileName');
    const sizeEl = document.getElementById('commentPhotoFileSize');
    const btnText = document.getElementById('commentPhotoBtnText');

    if (img) img.src = state.selectedCommentPhoto.dataUrl;
    if (nameEl) nameEl.textContent = state.selectedCommentPhoto.fileName;
    if (sizeEl) sizeEl.textContent = `${state.selectedCommentPhoto.fileSize} (Đã tối ưu)`;
    if (btnText) btnText.textContent = 'Đổi ảnh khác';

    if (container) {
        container.classList.remove('hidden');
        container.classList.add('flex');
    }
}

/**
 * Tải lại danh sách bình luận (kết hợp cả Supabase & IndexedDB Offline)
 */
async function reloadModalComments(placeId) {
    if (!placeId || state.currentDetailPlace?.id !== placeId) return;
    const currentRequestId = state.currentCommentRequestId;

    let onlineComments = [];
    if (window.ViVuComments) {
        try {
            onlineComments = await window.ViVuComments.loadComments(placeId);
        } catch (e) {
            console.warn('[ViVuComments] Không tải được bình luận trực tuyến:', e);
        }
    }

    if (state.currentDetailPlace?.id !== placeId || state.currentCommentRequestId !== currentRequestId) {
        return;
    }

    let offlineComments = [];
    try {
        offlineComments = await getOfflineReviewsByPlace(placeId);
    } catch (e) {
        console.warn('[OfflineSync] Không đọc được bình luận offline:', e);
    }

    if (state.currentDetailPlace?.id !== placeId || state.currentCommentRequestId !== currentRequestId) {
        return;
    }

    const allComments = [...offlineComments, ...(onlineComments || [])];
    renderCommentsList(allComments);
}

/**
 * Tải bình luận cho Modal với cơ chế chống race condition & hỗ trợ thử lại (Issue M6)
 */
async function loadCommentsForModal(place, requestId) {
    let onlineComments = [];
    let onlineError = false;

    // Tải bình luận offline trước (từ IndexedDB)
    let offlineComments = [];
    try {
        offlineComments = await getOfflineReviewsByPlace(place.id);
    } catch (e) {
        console.warn('[OfflineSync] Không đọc được bình luận offline:', e);
    }

    // Nếu người dùng đã chuyển sang địa điểm khác -> hủy
    if (state.currentCommentRequestId !== requestId || state.currentDetailPlace?.id !== place.id) {
        return;
    }

    if (window.ViVuComments) {
        try {
            // Đặt timeout 6s cho tải bình luận trực tuyến
            const fetchPromise = window.ViVuComments.loadComments(place.id);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 6000));
            onlineComments = await Promise.race([fetchPromise, timeoutPromise]);
        } catch (e) {
            console.warn('[ViVuComments] Không tải được bình luận trực tuyến:', e);
            const isMock = window.ViVuComments?.isMockMode ? window.ViVuComments.isMockMode() : false;
            if (!isMock) {
                onlineError = true;
            }
        }
    }

    // Kiểm tra lại race condition sau khi fetch hoàn thành
    if (state.currentCommentRequestId !== requestId || state.currentDetailPlace?.id !== place.id) {
        return;
    }

    const allComments = [...offlineComments, ...(onlineComments || [])];

    if (onlineError && allComments.length === 0) {
        renderCommentsError(() => loadCommentsForModal(place, requestId));
    } else {
        renderCommentsList(allComments);
    }
}

/**
 * Modal Chi Tiết Địa Điểm (Mở tức thì không trễ - Zero Latency)
 */
export function openDetailModal(placeOrId, options = {}) {
    let place = null;
    const isDirect = Boolean(options.isDirect || options.fromLegacyQuery);

    if (placeOrId && typeof placeOrId === 'object' && placeOrId.id) {
        place = placeOrId;
    } else {
        const query = String(placeOrId || '').trim().toLowerCase();
        if (isDirect) {
            // Khi truy cập trực tiếp /place/{slug}: chỉ tìm kiếm exact slug
            place = state.allPlaces.find(p => p.slug && String(p.slug).trim().toLowerCase() === query);
        } else {
            // Khi tương tác nội bộ: tra cứu theo id, slug hoặc dbId
            place = state.allPlaces.find(p =>
                p.id === query ||
                (p.slug && String(p.slug).trim().toLowerCase() === query) ||
                (p.dbId && String(p.dbId).trim().toLowerCase() === query)
            );
        }
    }
    const placeId = place?.id || placeOrId;

    // G9.3C: Khi truy cập trực tiếp URL công khai /place/{slug}:
    // 1. Chỉ tự mở modal nếu tìm được exact slug trong nguồn Supabase approved
    // 2. Nếu Supabase lỗi và ứng dụng chuyển fallback, không được tự mở dữ liệu fallback cũ
    // 3. Hiển thị thông báo “Không thể tải thông tin đã xác minh” hoặc offline state an toàn
    if (isDirect) {
        const isVerifiedApproved = place && place._source === 'supabase' && place.status === 'approved';
        if (!isVerifiedApproved) {
            console.warn(`[ViVuTraVinh] Chặn direct route cho địa điểm chưa được duyệt từ Supabase live: ${placeId}`);
            if (typeof window !== 'undefined' && window.location) {
                const url = new URL(window.location);
                if (url.pathname.startsWith('/place/') || url.pathname.startsWith('/places/')) {
                    url.pathname = '/';
                }
                if (url.searchParams.has('place')) {
                    url.searchParams.delete('place');
                }
                window.history.replaceState({}, '', url);
            }
            const isFallbackMode = (place && place._source === 'fallback') || (state.allPlaces && state.allPlaces.length > 0 && state.allPlaces[0]?._source === 'fallback');
            if (isFallbackMode) {
                showNoticeToast('Không thể tải thông tin đã xác minh', 'Không thể kết nối máy chủ để xác thực thông tin địa điểm này. Vui lòng kiểm tra lại kết nối mạng.');
            } else {
                showNoticeToast('Địa điểm không khả dụng', 'Địa điểm này chưa được xuất bản hoặc không tồn tại.');
            }
            return;
        }
    }

    if (!place) {
        console.warn(`[ViVuTraVinh] Địa điểm không tồn tại hoặc đã tạm dừng hiển thị: ${placeId}`);
        if (typeof window !== 'undefined' && window.location) {
            const url = new URL(window.location);
            if (url.pathname.startsWith('/place/') || url.pathname.startsWith('/places/')) {
                url.pathname = '/';
            }
            if (url.searchParams.has('place')) {
                url.searchParams.delete('place');
            }
            window.history.replaceState({}, '', url);
        }
        showNoticeToast('Địa điểm tạm dừng', 'Địa điểm này hiện không khả dụng hoặc đã được gỡ khỏi danh sách.');
        return;
    }

    // Lưu vào lịch sử vừa xem (Recently Viewed)
    saveRecentPlace(place);

    // Lưu lại phần tử kích hoạt trước đó để trả focus sau khi đóng (Accessibility)
    state.lastActiveElement = document.activeElement;
    state.currentDetailPlace = place;
    updatePlaceMetaTags(place);
    const isSaved = isPlaceSaved(place);
    clearCommentPhoto();

    // Thông báo trạng thái mạng trong form
    const networkNotice = document.getElementById('commentNetworkNotice');
    if (networkNotice) {
        networkNotice.classList.toggle('hidden', navigator.onLine);
    }

    // Reset select số sao về trạng thái chưa chọn
    const ratingInput = document.getElementById('commentRatingInput');
    if (ratingInput) ratingInput.value = '';

    // MỞ MODAL NGAY LẬP TỨC với comments = null (sẽ kích hoạt comment skeleton)
    renderDetailModal(place, null, isSaved, toggleBookmark, handleCommentSubmit);

    // Mặc định về tab Tổng quan khi mở địa điểm
    switchModalTab('overview');

    // Khởi tạo mini map trong modal nếu có tọa độ
    initModalMap(place);

    // Phục hồi bản nháp đánh giá nếu có
    restorePendingDraft();

    // Focus vào nút đóng modal để đảm bảo trợ năng bàn phím
    setTimeout(() => {
        document.getElementById('modalCloseBtn')?.focus();
    }, 50);

    // Cập nhật URL chuẩn canonical /place/{slug} và quản lý lịch sử trình duyệt
    const slug = place.slug || place.id;
    const targetPath = `/place/${encodeURIComponent(slug)}`;
    const url = new URL(window.location);
    url.pathname = targetPath;
    url.searchParams.delete('place');

    const isDirectEntry = Boolean(
        options.isDirect ||
        options.fromLegacyQuery ||
        (window.location.pathname === targetPath && (!window.history.state || window.history.state.modal !== 'place'))
    );

    if (isDirectEntry) {
        window.history.replaceState({ modal: 'place', placeId: place.id, slug, isDirect: true }, '', url);
    } else {
        if (!window.history.state || window.history.state.placeId !== place.id) {
            window.history.pushState({ modal: 'place', placeId: place.id, slug, isDirect: false }, '', url);
        }
    }

    // Bắt đầu tải bình luận ngầm trong nền với Request ID chống race condition
    state.currentCommentRequestId = (state.currentCommentRequestId || 0) + 1;
    const thisRequestId = state.currentCommentRequestId;
    loadCommentsForModal(place, thisRequestId);
}

export function closeDetailModal(fromPopstate = false) {
    const modal = document.getElementById('detailModal');
    if (modal) modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    state.currentDetailPlace = null;
    clearCommentPhoto();
    restoreDefaultMetaTags();

    // Tạm dừng video TikTok/Reels nếu đang chạy
    const video = document.getElementById('tiktokVideoEl');
    if (video && !video.paused) {
        video.pause();
    }

    // URL sau khi đóng modal luôn đưa về trang chủ / và xóa bỏ triệt để ?place=
    const url = new URL(window.location);
    if (url.pathname.startsWith('/place/') || url.pathname.startsWith('/places/')) {
        url.pathname = '/';
    }
    url.searchParams.delete('place');

    if (!fromPopstate) {
        if (window.history.state && window.history.state.modal === 'place' && !window.history.state.isDirect) {
            // Mở từ trang chủ trong phiên này: quay lui lịch sử về /
            window.history.back();
        } else {
            // Truy cập trực tiếp /place/{slug} hoặc link legacy ?place=: replaceState về /
            window.history.replaceState({ modal: null }, '', url);
        }
    } else {
        // Đến từ sự kiện popstate (nhấn nút Back di động):
        // Nếu URL vẫn còn vướng đường dẫn /place/ hoặc param ?place, dọn dẹp sạch về /
        if (window.location.pathname.startsWith('/place/') || window.location.pathname.startsWith('/places/') || window.location.search.includes('place=')) {
            window.history.replaceState({ modal: null }, '', url);
        }
    }

    // Hoàn trả focus về phần tử kích hoạt trước đó (Accessibility)
    if (state.lastActiveElement && typeof state.lastActiveElement.focus === 'function') {
        state.lastActiveElement.focus();
        state.lastActiveElement = null;
    }
}

/**
 * Quản lý Dynamic SEO & Open Graph Meta Tags (G7 Release Feature)
 */
const DEFAULT_PAGE_TITLE = 'ViVu Trà Vinh - Cẩm Nang Khám Phá & Bản Đồ Số Trà Vinh';
const DEFAULT_PAGE_DESC = 'Khám phá văn hóa Khmer, ẩm thực trứ danh, chùa cổ và các điểm du lịch sinh thái độc đáo tại Trà Vinh với bản đồ số.';
const DEFAULT_CANONICAL = `${getSiteUrl()}/`;

export function updatePlaceMetaTags(place) {
    if (!place || typeof document === 'undefined') return;
    const title = `${place.name} - ViVu Trà Vinh`;
    const desc = place.description
        ? (place.description.slice(0, 160) + (place.description.length > 160 ? '...' : ''))
        : DEFAULT_PAGE_DESC;
    const canonicalUrl = `${getSiteUrl()}/place/${encodeURIComponent(place.slug || place.id)}`;

    document.title = title;

    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', desc);

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', title);

    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', desc);

    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute('content', canonicalUrl);

    if (place.imageLink) {
        const ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage) ogImage.setAttribute('content', place.imageLink);
    }

    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    if (twitterTitle) twitterTitle.setAttribute('content', title);

    const twitterDesc = document.querySelector('meta[name="twitter:description"]');
    if (twitterDesc) twitterDesc.setAttribute('content', desc);

    const canonicalEl = document.getElementById('canonicalLink') || document.querySelector('link[rel="canonical"]');
    if (canonicalEl) canonicalEl.setAttribute('href', canonicalUrl);
}

export function restoreDefaultMetaTags() {
    if (typeof document === 'undefined') return;
    document.title = DEFAULT_PAGE_TITLE;

    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', DEFAULT_PAGE_DESC);

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', DEFAULT_PAGE_TITLE);

    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', DEFAULT_PAGE_DESC);

    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute('content', DEFAULT_CANONICAL);

    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    if (twitterTitle) twitterTitle.setAttribute('content', DEFAULT_PAGE_TITLE);

    const twitterDesc = document.querySelector('meta[name="twitter:description"]');
    if (twitterDesc) twitterDesc.setAttribute('content', DEFAULT_PAGE_DESC);

    const canonicalEl = document.getElementById('canonicalLink') || document.querySelector('link[rel="canonical"]');
    if (canonicalEl) canonicalEl.setAttribute('href', DEFAULT_CANONICAL);
}

/**
 * Modal Báo Sai Thông Tin Địa Điểm (G7 Feedback Feature)
 */
export function openReportModal(place = null) {
    const targetPlace = place || state.currentDetailPlace;
    if (!targetPlace) {
        showNoticeToast('Chưa chọn địa điểm', 'Vui lòng mở chi tiết địa điểm trước khi báo sai thông tin.');
        return;
    }

    const modal = document.getElementById('reportPlaceModal');
    const nameEl = document.getElementById('reportPlaceTargetName');
    const idInput = document.getElementById('reportPlaceId');
    const nameInput = document.getElementById('reportPlaceNameInput');
    const detailsInput = document.getElementById('reportDetails');
    const statusEl = document.getElementById('reportPlaceStatus');

    if (nameEl) nameEl.textContent = targetPlace.name;
    if (idInput) idInput.value = targetPlace.slug || targetPlace.id;
    if (nameInput) nameInput.value = targetPlace.name;
    if (detailsInput) detailsInput.value = '';
    if (statusEl) {
        statusEl.textContent = '';
        statusEl.className = 'hidden';
    }

    // Bảo toàn client_report_id cho phiên phản ánh này qua localStorage để retry idempotent không bị trùng
    const targetSlugOrId = targetPlace.slug || targetPlace.id;
    const storageKey = `vivu_pending_report_id_${targetSlugOrId}`;
    let clientReportId = '';
    try {
        clientReportId = localStorage.getItem(storageKey) || '';
    } catch {}
    if (!clientReportId) {
        clientReportId = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        try {
            localStorage.setItem(storageKey, clientReportId);
        } catch {}
    }
    const clientReportInput = document.getElementById('reportClientReportId');
    if (clientReportInput) clientReportInput.value = clientReportId;

    if (modal) modal.classList.remove('hidden');
}

export function closeReportModal() {
    const modal = document.getElementById('reportPlaceModal');
    if (modal) modal.classList.add('hidden');
}

export async function submitReportPlace(event) {
    if (event) event.preventDefault();

    const form = document.getElementById('reportPlaceForm');
    const submitBtn = document.getElementById('reportSubmitBtn');

    const placeId = document.getElementById('reportPlaceId')?.value || '';
    const placeName = document.getElementById('reportPlaceNameInput')?.value || '';
    const issueType = document.getElementById('reportIssueType')?.value || 'other';
    const details = document.getElementById('reportDetails')?.value?.trim() || '';

    if (!placeId) {
        showReportStatus('Thiếu mã địa điểm cần phản ánh.', 'error');
        return;
    }

    if (!details || details.length < 3) {
        showReportStatus('Vui lòng nhập mô tả chi tiết tối thiểu 3 ký tự.', 'error');
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="material-symbols-outlined text-sm animate-spin">sync</span> <span>Đang gửi...</span>';
    }

    const targetSlugOrId = placeId;
    const storageKey = `vivu_pending_report_id_${targetSlugOrId}`;
    let clientReportId = document.getElementById('reportClientReportId')?.value || '';
    if (!clientReportId) {
        try {
            clientReportId = localStorage.getItem(storageKey) || '';
        } catch {}
    }
    if (!clientReportId) {
        clientReportId = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        try {
            localStorage.setItem(storageKey, clientReportId);
        } catch {}
        const clientReportInput = document.getElementById('reportClientReportId');
        if (clientReportInput) clientReportInput.value = clientReportId;
    }

    try {
        const payload = {
            place_id: placeId,
            place_name: placeName,
            issue_type: issueType,
            details: details,
            client_report_id: clientReportId
        };

        const res = await fetch('/api/report-place', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            const msg = data.error?.message || 'Không thể gửi phản ánh. Vui lòng thử lại sau.';
            showReportStatus(msg, 'error');
            recordNetworkError('/api/report-place', new Error(msg));
            return;
        }

        // Máy chủ đã xác nhận thành công hoặc idempotent replay: dọn sạch pending ID để lần gửi mới sinh ID mới
        try {
            localStorage.removeItem(storageKey);
        } catch {}
        const clientReportInput = document.getElementById('reportClientReportId');
        if (clientReportInput) clientReportInput.value = '';

        showReportStatus('Cảm ơn bạn! Báo cáo đã được ghi nhận để BQT kiểm tra và cập nhật.', 'success');
        showNoticeToast('Đã gửi phản ánh', 'Cảm ơn đóng góp của bạn để hoàn thiện dữ liệu du lịch Trà Vinh!');

        setTimeout(() => {
            closeReportModal();
            if (form) form.reset();
        }, 1500);

    } catch (err) {
        console.warn('[ReportPlace] Lỗi kết nối:', err);
        recordNetworkError('/api/report-place', err);
        showReportStatus('Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span class="material-symbols-outlined text-sm">send</span> <span>Gửi Phản Hồi</span>';
        }
    }
}

function showReportStatus(message, type = 'info') {
    const statusEl = document.getElementById('reportPlaceStatus');
    if (!statusEl) return;
    statusEl.classList.remove('hidden');
    if (type === 'error') {
        statusEl.className = 'text-xs p-3 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-800';
    } else if (type === 'success') {
        statusEl.className = 'text-xs p-3 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800';
    } else {
        statusEl.className = 'text-xs p-3 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-200 border border-blue-300 dark:border-blue-800';
    }
    statusEl.textContent = message;
}

/**
 * Chia sẻ bộ sưu tập chuyến đi (?trip=slug1,slug2) (G7 Feature)
 */
export async function shareTripCollection() {
    const saved = state.allPlaces.filter(p => isPlaceSaved(p));
    if (saved.length === 0) {
        showNoticeToast('Chưa có địa điểm', 'Hãy bấm lưu một vài địa điểm để tạo lịch trình chuyến đi của bạn!');
        return;
    }

    const slugs = saved.map(p => p.slug || p.id).join(',');
    const shareUrl = `${window.location.origin}${window.location.pathname}?trip=${encodeURIComponent(slugs)}`;
    const shareText = `Xem bộ sưu tập ${saved.length} địa điểm Trà Vinh tôi đã chọn trên ViVu Trà Vinh:`;

    if (navigator.share && /mobile|android|iphone/i.test(navigator.userAgent)) {
        try {
            await navigator.share({
                title: 'Lịch trình du lịch Trà Vinh của tôi',
                text: shareText,
                url: shareUrl
            });
            return;
        } catch {
            // Huỷ hoặc không hỗ trợ -> fallback clipboard
        }
    }

    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(shareUrl);
            showNoticeToast('Đã sao chép liên kết!', `Đã chép link chuyến đi (${saved.length} địa điểm) vào bộ nhớ tạm.`);
        } else {
            prompt('Sao chép liên kết chuyến đi bên dưới:', shareUrl);
        }
    } catch {
        prompt('Sao chép liên kết chuyến đi bên dưới:', shareUrl);
    }
}

/**
 * Xử lý tham số ?trip= từ URL khi vào app
 */
export function handleTripShareParam(tripParam) {
    if (!tripParam || !state.allPlaces || state.allPlaces.length === 0) return;
    const slugs = tripParam.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (slugs.length === 0) return;

    const matched = state.allPlaces.filter(p => {
        const pSlug = (p.slug || '').toLowerCase();
        const pId = (p.id || '').toLowerCase();
        const pDbId = p.dbId ? String(p.dbId).toLowerCase() : '';
        return slugs.some(s => s === pSlug || s === pId || s === pDbId || pSlug.includes(s) || pId.includes(s));
    });

    if (matched.length > 0) {
        for (const place of matched) {
            const aliases = getPlaceAliases(place, state.allPlaces);
            const isAlreadySaved = (state.favorites || []).some(favId => aliases.has(favId));
            if (!isAlreadySaved) {
                const canonicalKey = getPlaceCanonicalKey(place, state.allPlaces);
                if (canonicalKey) {
                    state.favorites.push(canonicalKey);
                }
            }
        }
        try {
            localStorage.setItem('vivu_favorites', JSON.stringify(state.favorites));
        } catch {}

        updateFavoritesCount();
        handleCategoryTabClick('saved');
        showNoticeToast('Lịch trình chia sẻ', `Đang hiển thị bộ sưu tập chuyến đi gồm ${matched.length} địa điểm được chia sẻ.`);
    }
}

/**
 * Chuyển đổi tab trong Detail Modal (Tổng quan vs Góc chụp & TikTok)
 */
export function switchModalTab(tabId = 'overview') {
    const overviewBtn = document.getElementById('modalTabOverviewBtn');
    const checkinBtn = document.getElementById('modalTabCheckinBtn');
    const overviewPanel = document.getElementById('modalOverviewTabPanel');
    const checkinPanel = document.getElementById('modalCheckinTabPanel');

    // Tạm dừng video nếu rời khỏi tab checkin
    const video = document.getElementById('tiktokVideoEl');
    const playOverlay = document.getElementById('tiktokPlayOverlayBtn');

    if (tabId === 'checkin') {
        if (overviewBtn) {
            overviewBtn.className = 'flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 text-on-surface-variant dark:text-zinc-400 hover:text-primary dark:hover:text-emerald-300';
        }
        if (checkinBtn) {
            checkinBtn.className = 'flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 bg-primary text-white shadow-xs';
        }
        if (overviewPanel) overviewPanel.classList.add('hidden');
        if (checkinPanel) checkinPanel.classList.remove('hidden');
    } else {
        // Tab Overview mặc định
        if (overviewBtn) {
            overviewBtn.className = 'flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 bg-primary text-white shadow-xs';
        }
        if (checkinBtn) {
            checkinBtn.className = 'flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 text-on-surface-variant dark:text-zinc-400 hover:text-primary dark:hover:text-emerald-300';
        }
        if (overviewPanel) overviewPanel.classList.remove('hidden');
        if (checkinPanel) checkinPanel.classList.add('hidden');

        if (video && !video.paused) {
            video.pause();
            if (playOverlay) playOverlay.classList.remove('opacity-0', 'pointer-events-none');
        }
    }
}

/**
 * Xử lý gửi bình luận Supabase & Cơ chế Offline Sync
 */
/**
 * Xử lý gửi bình luận Supabase & Cơ chế Offline Sync (G3 - Review & An toàn dữ liệu)
 */
async function handleCommentSubmit(e) {
    e.preventDefault();
    if (!state.currentDetailPlace) return;

    const authorInput = document.getElementById('commentAuthorInput');
    const ratingInput = document.getElementById('commentRatingInput');
    const textInput = document.getElementById('commentTextInput');
    const msgEl = document.getElementById('commentMessageEl');
    const submitBtn = document.getElementById('commentSubmitBtn');

    // 1. CHẶN INPUT SAI NGAY TỪ ĐẦU BẰNG VALIDATOR DÙNG CHUNG (G3)
    let validatedPayload;
    try {
        validatedPayload = validateCommentInput({
            placeId: state.currentDetailPlace.id,
            placeName: state.currentDetailPlace.name,
            authorName: authorInput?.value,
            rating: ratingInput?.value,
            commentText: textInput?.value,
            photoData: state.selectedCommentPhoto ? state.selectedCommentPhoto.dataUrl : null
        });
    } catch (valErr) {
        // Lỗi validation: KHÔNG GỬI, KHÔNG QUEUE, GIỮ NGUYÊN FORM CHO NGƯỜI DÙNG SỬA
        if (msgEl) {
            msgEl.className = 'text-xs text-rose-600 dark:text-rose-400 font-bold';
            msgEl.textContent = valErr.message || 'Dữ liệu đánh giá chưa hợp lệ.';
        }
        if (valErr.field === 'author_name') authorInput?.focus();
        else if (valErr.field === 'rating') ratingInput?.focus();
        else if (valErr.field === 'comment_text') textInput?.focus();
        return;
    }

    // 2. KHÓA NÚT GỬI CHỐNG DOUBLE-CLICK (G3 State: submitting)
    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-sm">sync</span> <span>Đang gửi...</span>';
        }
        if (msgEl) {
            msgEl.className = 'text-xs text-slate-500 dark:text-zinc-400';
            msgEl.textContent = 'Đang xử lý đánh giá...';
        }

        // Trường hợp 1: Thiết bị đang Offline (sóng yếu tại cồn bãi, rừng ngập mặn)
        if (!navigator.onLine) {
            await saveOfflineReview(validatedPayload);

            if (msgEl) {
                msgEl.className = 'text-xs text-amber-600 dark:text-amber-400 font-bold';
                msgEl.textContent = '⚡ Đang offline: Đánh giá & ảnh đã lưu an toàn trên máy, sẽ tự động đồng bộ khi có mạng!';
            }

            // CHỈ XÓA NỘI DUNG FORM KHI ĐÃ LƯU CỤC BỘ THÀNH CÔNG
            if (textInput) textInput.value = '';
            if (ratingInput) ratingInput.value = '';
            clearCommentPhoto();
            try { localStorage.removeItem('vivu_comment_draft'); } catch (e) {}

            await reloadModalComments(state.currentDetailPlace.id);
            return;
        }

        // Trường hợp 2: Thiết bị Online - Gửi lên Supabase
        let success = false;
        let apiError = null;

        let submittedComment = null;
        try {
            if (window.ViVuComments) {
                submittedComment = await window.ViVuComments.submitComment(validatedPayload);
                success = true;
            } else {
                // Mock dev mode khi chưa khởi tạo service Supabase trực tiếp: lưu an toàn vào IndexedDB
                await saveOfflineReview(validatedPayload);
                if (msgEl) {
                    msgEl.className = 'text-xs text-amber-600 dark:text-amber-400 font-bold';
                    msgEl.textContent = '⚡ Đã lưu ngoại tuyến an toàn trên máy, sẽ tự động gửi khi kết nối hệ thống!';
                }
                if (textInput) textInput.value = '';
                if (ratingInput) ratingInput.value = '';
                clearCommentPhoto();
                try { localStorage.removeItem('vivu_comment_draft'); } catch (e) {}
                await reloadModalComments(state.currentDetailPlace.id);
                return;
            }
        } catch (err) {
            apiError = err;
            console.warn('[ViVuComments] Lỗi khi gửi bình luận:', err);
        }

        if (success) {
            // G3 State: submitted (hiển thị thông báo phù hợp theo chính sách kiểm duyệt)
            if (msgEl) {
                msgEl.className = 'text-xs text-emerald-600 dark:text-emerald-400 font-bold';
                if (submittedComment?.status === 'pending') {
                    msgEl.textContent = 'Cảm ơn bạn! Đánh giá & ảnh đã được tiếp nhận và đang chờ duyệt trước khi hiển thị công khai.';
                } else {
                    msgEl.textContent = 'Cảm ơn bạn! Đánh giá & ảnh đã được gửi thành công.';
                }
            }
            if (textInput) textInput.value = '';
            if (ratingInput) ratingInput.value = '';
            clearCommentPhoto();
            try { localStorage.removeItem('vivu_comment_draft'); } catch (e) {}

            await reloadModalComments(state.currentDetailPlace.id);
        } else if (apiError) {
            // PHÂN LOẠI LỖI (G3/G5):
            // Không bao giờ queue các lỗi validation, cooldown, rate-limit hoặc auth/permission như lỗi mạng!
            const isValidationError = apiError instanceof CommentValidationError || apiError.code === 'VALIDATION_ERROR';
            const isCooldownOrRateLimit = apiError instanceof CommentCooldownError || apiError.code === 'COOLDOWN_ERROR' || apiError.isRateLimitError || apiError.status === 429 || apiError.code === 'RATE_LIMITED';
            const isAuthError = apiError.isAuthError || apiError.status === 401 || apiError.status === 403 || /permission|unauthorized|forbidden/i.test(apiError.message);
            const isSchemaError = apiError.isSchemaError || (apiError.status === 400 && !/failed to fetch/i.test(apiError.message));

            if (isValidationError) {
                if (msgEl) {
                    msgEl.className = 'text-xs text-rose-600 dark:text-rose-400 font-bold';
                    msgEl.textContent = apiError.message;
                }
            } else if (isCooldownOrRateLimit) {
                if (msgEl) {
                    msgEl.className = 'text-xs text-amber-600 dark:text-amber-400 font-bold';
                    msgEl.textContent = apiError.message || 'Bạn đang gửi đánh giá quá nhanh. Vui lòng chờ trước khi thử lại.';
                }
            } else if (isAuthError) {
                if (msgEl) {
                    msgEl.className = 'text-xs text-rose-600 dark:text-rose-400 font-bold';
                    msgEl.textContent = 'Bạn không có quyền thực hiện đánh giá này (401/403).';
                }
            } else if (isSchemaError) {
                if (msgEl) {
                    msgEl.className = 'text-xs text-rose-600 dark:text-rose-400 font-bold';
                    msgEl.textContent = 'Dữ liệu không khớp định dạng máy chủ (400).';
                }
            } else {
                // LỖI MẠNG THỰC SỰ: Lưu vào IndexedDB dự phòng
                await saveOfflineReview(validatedPayload);

                if (msgEl) {
                    msgEl.className = 'text-xs text-amber-600 dark:text-amber-400 font-bold';
                    msgEl.textContent = '⚡ Mạng yếu: Đánh giá & ảnh đã được lưu vào máy và sẽ tự động gửi khi có kết nối trở lại!';
                }

                if (textInput) textInput.value = '';
                if (ratingInput) ratingInput.value = '';
                clearCommentPhoto();

                await reloadModalComments(state.currentDetailPlace.id);
            }
        }

    } catch (unexpectedErr) {
        if (msgEl) {
            msgEl.className = 'text-xs text-rose-600 dark:text-rose-400 font-semibold';
            msgEl.textContent = unexpectedErr.message || 'Lỗi khi gửi đánh giá. Vui lòng thử lại.';
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span class="material-symbols-outlined text-sm">send</span> <span>Gửi đánh giá</span>';
        }
    }
}

/**
 * Tách tọa độ GPS
 */
function parseCoordinates(coordStr) {
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

export const MAP_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const MAP_TILE_OPTIONS = {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
};

/**
 * Khởi tạo Leaflet Mini Map trên Bento Grid
 */
function initMiniMap() {
    const mapEl = document.getElementById('bentoMiniMap');
    if (!mapEl || typeof L === 'undefined') return;

    if (state.miniMap) {
        state.miniMap.remove();
    }

    const defaultCenter = [9.9347, 106.3449]; // TP. Trà Vinh
    state.miniMap = L.map('bentoMiniMap', {
        zoomControl: false,
        attributionControl: false
    }).setView(defaultCenter, 11);

    L.tileLayer(MAP_TILE_URL, MAP_TILE_OPTIONS).addTo(state.miniMap);

    // Ghim các địa điểm có tọa độ lên mini map
    state.allPlaces.forEach(p => {
        const coords = parseCoordinates(p.coordinates);
        if (coords) {
            const isFood = /ẩm thực|quán|bún/i.test(p.category);
            const isPagoda = /chùa|tâm linh/i.test(p.category);
            const color = isFood ? '#ea580c' : (isPagoda ? '#d97706' : '#059669');

            const marker = L.circleMarker(coords, {
                radius: 6,
                fillColor: color,
                color: '#ffffff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.9
            }).addTo(state.miniMap);

            marker.bindTooltip(p.name, { direction: 'top', offset: [0, -6] });
            marker.on('click', () => openDetailModal(p.id));
        }
    });
}

/**
 * Khởi tạo Bản Đồ Trong Modal Chi Tiết
 */
function initModalMap(place) {
    const modalMapEl = document.getElementById('modalLeafletMap');
    if (!modalMapEl || typeof L === 'undefined') return;

    if (state.modalMap) {
        state.modalMap.remove();
        state.modalMap = null;
    }

    const coords = place.hasValidGps && place.parsedCoordinates
        ? place.parsedCoordinates
        : parseCoordinates(place.coordinates);

    const googleFallbackUrl = place.map_link || (coords ? `https://www.google.com/maps?q=${coords[0]},${coords[1]}` : null);

    if (coords) {
        state.modalMap = L.map('modalLeafletMap', {
            zoomControl: false,
            attributionControl: false
        }).setView(coords, 14);

        const tileLayer = L.tileLayer(MAP_TILE_URL, MAP_TILE_OPTIONS).addTo(state.modalMap);

        tileLayer.on('tileerror', () => {
            showOfflineMapOverlay(modalMapEl, { googleMapsUrl: googleFallbackUrl });
        });
        if (!navigator.onLine) {
            showOfflineMapOverlay(modalMapEl, { googleMapsUrl: googleFallbackUrl });
        }

        L.marker(coords).addTo(state.modalMap).bindPopup(`<b>${place.name}</b><br>${place.area || 'Trà Vinh'}`).openPopup();
    } else {
        // KHÔNG CẮM PIN GIẢ KHI THIẾU TỌA ĐỘ GPS (Issue M5)
        state.modalMap = L.map('modalLeafletMap', {
            zoomControl: false,
            attributionControl: false
        }).setView([9.9347, 106.3449], 11);

        const tileLayer = L.tileLayer(MAP_TILE_URL, MAP_TILE_OPTIONS).addTo(state.modalMap);

        tileLayer.on('tileerror', () => {
            showOfflineMapOverlay(modalMapEl, { googleMapsUrl: googleFallbackUrl });
        });
        if (!navigator.onLine) {
            showOfflineMapOverlay(modalMapEl, { googleMapsUrl: googleFallbackUrl });
        }

        L.popup()
            .setLatLng([9.9347, 106.3449])
            .setContent(`<div class="p-1 text-center"><span class="text-xs font-bold text-slate-700">Chưa có vị trí GPS chính xác</span><br><span class="text-[10px] text-slate-500">${place.name}</span></div>`)
            .openOn(state.modalMap);
    }
}

/**
 * Bản Đồ Toàn Màn Hình (Full Map Modal)
 */
export function openFullMapModal() {
    const modal = document.getElementById('fullMapModal');
    if (!modal || typeof L === 'undefined') return;

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');

    setTimeout(() => {
        if (!state.fullMap) {
            state.fullMap = L.map('fullScreenMap', {
                zoomControl: true,
                attributionControl: false
            }).setView([9.9347, 106.3449], 11);

            const tileLayer = L.tileLayer(MAP_TILE_URL, MAP_TILE_OPTIONS).addTo(state.fullMap);

            const fullScreenMapEl = document.getElementById('fullScreenMap');
            tileLayer.on('tileerror', () => {
                showOfflineMapOverlay(fullScreenMapEl, { googleMapsUrl: 'https://www.google.com/maps?q=9.9347,106.3449' });
            });
            if (!navigator.onLine) {
                showOfflineMapOverlay(fullScreenMapEl, { googleMapsUrl: 'https://www.google.com/maps?q=9.9347,106.3449' });
            }

            // Ghim toàn bộ địa điểm
            state.allPlaces.forEach(p => {
                const coords = parseCoordinates(p.coordinates);
                if (coords) {
                    const marker = L.marker(coords).addTo(state.fullMap);
                    marker.bindPopup(`
                        <div class="p-2 max-w-[200px]">
                            <img src="${p.imageLink || NEUTRAL_PLACEHOLDER_IMAGE}" class="w-full h-24 object-cover rounded-lg mb-1" onerror="this.onerror=null; this.src='${NEUTRAL_PLACEHOLDER_IMAGE}';">
                            <h4 class="font-bold text-xs line-clamp-1">${p.name}</h4>
                            <p class="text-[10px] text-slate-500 line-clamp-1">${p.area} • ${p.category}</p>
                            <button onclick="window.openDetailFromMap('${p.id}')" class="mt-2 w-full py-1 bg-emerald-800 text-white rounded text-[11px] font-bold">Xem chi tiết</button>
                        </div>
                    `);
                }
            });
        } else {
            state.fullMap.invalidateSize();
        }
    }, 200);
}

export function closeFullMapModal() {
    const modal = document.getElementById('fullMapModal');
    if (modal) modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

/**
 * Định vị GPS người dùng
 */
export function locateUserPosition() {
    if (!navigator.geolocation) {
        alert('Trình duyệt của bạn không hỗ trợ định vị GPS.');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const userCoords = [pos.coords.latitude, pos.coords.longitude];
            if (state.fullMap) {
                state.fullMap.setView(userCoords, 14);
                L.circleMarker(userCoords, {
                    radius: 8,
                    fillColor: '#3b82f6',
                    color: '#ffffff',
                    weight: 3,
                    fillOpacity: 1
                }).addTo(state.fullMap).bindPopup('Vị trí hiện tại của bạn').openPopup();
            }
        },
        (err) => {
            alert('Không lấy được vị trí GPS: ' + err.message);
        }
    );
}

/**
 * Tính khoảng cách cho tất cả các địa điểm từ tọa độ người dùng
 */
function calculatePlacesDistance(userLat, userLon) {
    state.allPlaces.forEach(p => {
        const coords = parseCoordinates(p.coordinates);
        if (coords) {
            p.distanceKm = calculateDistanceKm(userLat, userLon, coords[0], coords[1]);
        } else {
            p.distanceKm = undefined;
        }
    });
}

/**
 * Cập nhật trạng thái hiển thị của nút bộ lọc Gần Tôi
 */
function updateNearMeButtonUI(isActive) {
    const btn = document.getElementById('nearMeFilterBtn');
    const text = document.getElementById('nearMeBtnText');
    if (!btn) return;
    if (isActive) {
        btn.className = 'px-3.5 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm active:scale-95 shrink-0 ring-2 ring-blue-400/50';
        if (text) text.textContent = 'Đang xếp: Gần nhất';
    } else {
        btn.className = 'px-3.5 py-2 rounded-xl bg-surface-container-low dark:bg-zinc-800 text-on-surface dark:text-zinc-200 hover:bg-surface-container font-semibold text-xs transition-all flex items-center gap-1.5 border border-outline-variant/30 dark:border-zinc-700 active:scale-95 shrink-0';
        if (text) text.textContent = 'Gần tôi nhất';
    }
}

/**
 * Bật / tắt bộ lọc sắp xếp Gần Tôi Nhất qua GPS
 */
export function toggleNearMeFilter() {
    if (state.isNearMeActive) {
        state.isNearMeActive = false;
        if (state.activeBubble === 'nearme') {
            state.activeBubble = 'all';
        }
        // Xóa khoảng cách đã tính
        state.allPlaces.forEach(p => delete p.distanceKm);
        updateNearMeButtonUI(false);
        renderStoryBubbles('storyBubblesContainer', state.activeBubble, handleBubbleSelect);
        applyFilters();
        return;
    }

    const btn = document.getElementById('nearMeFilterBtn');
    if (btn) {
        btn.classList.add('animate-pulse');
    }

    if (!navigator.geolocation) {
        if (btn) btn.classList.remove('animate-pulse');
        alert('Trình duyệt của bạn không hỗ trợ định vị GPS.');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            if (btn) btn.classList.remove('animate-pulse');
            const userLat = pos.coords.latitude;
            const userLon = pos.coords.longitude;
            state.userCoords = [userLat, userLon];
            state.isNearMeActive = true;
            state.activeBubble = 'nearme';

            calculatePlacesDistance(userLat, userLon);
            updateNearMeButtonUI(true);
            renderStoryBubbles('storyBubblesContainer', state.activeBubble, handleBubbleSelect);
            applyFilters();

            const discoverySection = document.getElementById('discoverySection');
            if (discoverySection) {
                discoverySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        },
        (err) => {
            if (btn) btn.classList.remove('animate-pulse');
            console.warn('[Geolocation] Không lấy được GPS trực tiếp:', err.message);
            // Fallback vị trí trung tâm TP. Trà Vinh [9.9347, 106.3449] (Ao Bà Om)
            const useFallback = confirm(
                `Không thể truy cập GPS (${err.message}).\n\nBạn có muốn sắp xếp khoảng cách tính từ Trung tâm TP. Trà Vinh (Khu danh thắng Ao Bà Om) không?`
            );
            if (useFallback) {
                const userLat = 9.9347;
                const userLon = 106.3449;
                state.userCoords = [userLat, userLon];
                state.isNearMeActive = true;
                state.activeBubble = 'nearme';

                calculatePlacesDistance(userLat, userLon);
                updateNearMeButtonUI(true);
                renderStoryBubbles('storyBubblesContainer', state.activeBubble, handleBubbleSelect);
                applyFilters();

                const discoverySection = document.getElementById('discoverySection');
                if (discoverySection) {
                    discoverySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
}

/**
 * Modal Đóng Góp Địa Điểm Mới (Native Modal 5 Phần)
 */
export function openContributeModal() {
    const modal = document.getElementById('contributeModal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
        setTimeout(() => {
            initContributeMap();
        }, 150);
    }
}

export function closeContributeModal() {
    const modal = document.getElementById('contributeModal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }
}

/**
 * Khởi tạo Leaflet Map ghim vị trí trong Contribute Modal
 */
function initContributeMap() {
    const mapEl = document.getElementById('contributeMap');
    if (!mapEl || typeof L === 'undefined') return;

    const latInput = document.getElementById('contribLat');
    const lngInput = document.getElementById('contribLng');
    const coordsText = document.getElementById('contribCoordsText');

    let defaultLat = 9.9347;
    let defaultLng = 106.3449;
    if (state.userCoords) {
        defaultLat = state.userCoords[0];
        defaultLng = state.userCoords[1];
    }

    const updateCoords = (lat, lng) => {
        if (latInput) latInput.value = lat.toFixed(6);
        if (lngInput) lngInput.value = lng.toFixed(6);
        if (coordsText) coordsText.textContent = `Tọa độ: ${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`;
    };

    if (!state.contributeMap) {
        state.contributeMap = L.map('contributeMap', {
            zoomControl: true,
            attributionControl: false
        }).setView([defaultLat, defaultLng], 14);

        L.tileLayer(MAP_TILE_URL, MAP_TILE_OPTIONS).addTo(state.contributeMap);

        state.contributeMarker = L.marker([defaultLat, defaultLng], {
            draggable: true
        }).addTo(state.contributeMap);

        state.contributeMarker.on('dragend', (e) => {
            const pos = e.target.getLatLng();
            updateCoords(pos.lat, pos.lng);
        });

        state.contributeMap.on('click', (e) => {
            state.contributeMarker.setLatLng(e.latlng);
            updateCoords(e.latlng.lat, e.latlng.lng);
        });

        updateCoords(defaultLat, defaultLng);
    } else {
        state.contributeMap.invalidateSize();
    }
}

/**
 * Định vị GPS cho form đóng góp
 */
export function locateContributePosition() {
    if (!navigator.geolocation) {
        alert('Trình duyệt của bạn không hỗ trợ định vị GPS.');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            state.userCoords = [lat, lng];

            if (state.contributeMap && state.contributeMarker) {
                state.contributeMap.setView([lat, lng], 15);
                state.contributeMarker.setLatLng([lat, lng]);
            }

            const latInput = document.getElementById('contribLat');
            const lngInput = document.getElementById('contribLng');
            const coordsText = document.getElementById('contribCoordsText');
            if (latInput) latInput.value = lat.toFixed(6);
            if (lngInput) lngInput.value = lng.toFixed(6);
            if (coordsText) coordsText.textContent = `Tọa độ: ${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`;
        },
        (err) => {
            console.warn('[GPS Contribute] Lỗi lấy vị trí:', err.message);
            alert('Không thể xác định vị trí GPS hiện tại. Bạn có thể kéo thả ghim đỏ trực tiếp trên bản đồ.');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
}

/**
 * Xử lý chọn và nén ảnh cho form đóng góp
 */
export async function handleContributePhotosSelect(fileList) {
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    const currentCount = state.contributePhotos.length;
    const remaining = 5 - currentCount;

    if (remaining <= 0) {
        alert('Bạn đã chọn tối đa 5 hình ảnh.');
        return;
    }

    const toProcess = files.slice(0, remaining);

    for (const file of toProcess) {
        try {
            const compressed = await compressImage(file, 1200, 1200, 0.75);
            state.contributePhotos.push({
                name: file.name,
                dataUrl: compressed.dataUrl,
                sizeKb: Math.round(compressed.compressedSize / 1024)
            });
        } catch (err) {
            console.warn('[Contribute Photo] Lỗi nén ảnh:', err);
        }
    }

    renderContributePhotosPreview();
}

/**
 * Xóa một ảnh trong danh sách xem trước
 */
export function removeContributePhoto(index) {
    if (index >= 0 && index < state.contributePhotos.length) {
        state.contributePhotos.splice(index, 1);
        renderContributePhotosPreview();
    }
}

/**
 * Render lưới ảnh xem trước của Contribute Modal
 */
function renderContributePhotosPreview() {
    const container = document.getElementById('contribPhotosPreview');
    const countEl = document.getElementById('contribPhotoCount');
    if (!container) return;

    if (countEl) {
        countEl.textContent = `${state.contributePhotos.length}/5 ảnh`;
    }

    container.innerHTML = state.contributePhotos.map((photo, idx) => `
        <div class="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-1 shadow-sm">
            <div class="w-full h-20 rounded-lg bg-slate-100 dark:bg-zinc-900 flex items-center justify-center relative overflow-hidden">
                <img src="${photo.dataUrl}" alt="${photo.name}" class="w-full h-full object-cover">
            </div>
            <div class="mt-1 flex items-center justify-between text-[10px] text-slate-600 dark:text-zinc-400 px-1">
                <span class="truncate max-w-[60px]" title="${photo.name}">${photo.name}</span>
                <span class="text-[9px] text-slate-400 font-mono">${photo.sizeKb}KB</span>
                <button type="button" onclick="window.ViVuApp.removeContributePhoto(${idx})" class="text-rose-500 hover:text-rose-700 p-0.5" title="Xóa ảnh">
                    <span class="material-symbols-outlined text-sm">close</span>
                </button>
            </div>
        </div>
    `).join('');
}

/**
 * Gửi địa điểm đóng góp mới qua serverless API endpoint (/api/submit-place)
 */
export async function submitContributedPlace(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Dữ liệu đóng góp địa điểm không hợp lệ.');
    }

    const name = String(payload.name || '').trim();
    if (!name || name.length < 2) {
        throw new Error('Tên địa điểm phải từ 2 ký tự trở lên.');
    }

    const clientSubmissionId = payload.client_submission_id || payload.id ||
        ('contrib_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9));

    const origin = (typeof window !== 'undefined' && window.location ? window.location.origin : '');
    const apiUrl = origin ? `${origin}/api/submit-place` : '/api/submit-place';

    let response;
    try {
        response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_submission_id: clientSubmissionId,
                name: payload.name,
                category: payload.category,
                area: payload.area,
                address: payload.address,
                price_raw: payload.price_raw || 'Liên hệ',
                display_hours: payload.display_hours || '07:00 - 18:00',
                coordinates: payload.coordinates || null,
                map_link: payload.map_link || null,
                description: payload.description,
                contributor: payload.contributor || 'Ẩn danh',
                contact: payload.contact || '',
                images: payload.images || []
            })
        });
    } catch (networkErr) {
        const err = new Error(networkErr.message || 'Không thể kết nối đến máy chủ đóng góp.');
        err.isNetworkError = true;
        throw err;
    }

    if (response.status === 429) {
        const errData = await response.json().catch(() => ({}));
        const err = new Error(errData?.error?.message || 'Bạn đang gửi yêu cầu quá nhanh. Vui lòng thử lại sau ít phút.');
        err.status = 429;
        err.isRateLimitError = true;
        err.retryAfter = response.headers.get('Retry-After');
        throw err;
    }

    if (response.status === 413) {
        const err = new Error('Dung lượng thông tin đóng góp vượt quá giới hạn (tối đa 128KB).');
        err.status = 413;
        throw err;
    }

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const err = new Error(errData?.error?.message || `Lỗi máy chủ (${response.status})`);
        err.status = response.status;
        err.code = errData?.error?.code;
        throw err;
    }

    return await response.json();
}

/**
 * Xử lý Gửi Địa Điểm Mới (/api/submit-place + Fallback IndexedDB khi Offline)
 */
export async function handleContributeSubmit(event) {
    if (event) event.preventDefault();

    const form = document.getElementById('contributePlaceForm');
    if (!form) return;

    const name = (document.getElementById('contribPlaceName')?.value || '').trim();
    const category = form.querySelector('input[name="contribCategory"]:checked')?.value || 'Chùa';
    const district = document.getElementById('contribDistrict')?.value || 'TP. Trà Vinh';
    const hours = (document.getElementById('contribHours')?.value || '').trim();
    const price = (document.getElementById('contribPrice')?.value || '').trim();
    const address = (document.getElementById('contribAddress')?.value || '').trim();
    const lat = document.getElementById('contribLat')?.value || '9.9347';
    const lng = document.getElementById('contribLng')?.value || '106.3449';
    const description = (document.getElementById('contribDescription')?.value || '').trim();
    const authorName = (document.getElementById('contribAuthorName')?.value || '').trim() || 'Thổ Địa Trà Vinh';
    const authorContact = (document.getElementById('contribAuthorContact')?.value || '').trim();

    if (!name || !address || !description) {
        alert('Vui lòng điền đầy đủ các thông tin bắt buộc (*)');
        return;
    }

    const clientSubmissionId = 'contrib_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

    // Chỉ nhận URL ảnh hợp lệ (http/https), tuyệt đối không gửi Base64 trong payload 128KB
    const validPhotoUrls = (state.contributePhotos || [])
        .map(p => p.url || p.dataUrl)
        .filter(u => typeof u === 'string' && /^https?:\/\//i.test(u));

    const payload = {
        client_submission_id: clientSubmissionId,
        name,
        category,
        area: district,
        address,
        price_raw: price || 'Liên hệ',
        display_hours: hours || '07:00 - 18:00',
        coordinates: `${lat},${lng}`,
        map_link: `https://www.google.com/maps?q=${lat},${lng}`,
        description,
        contributor: authorName,
        contact: authorContact,
        images: validPhotoUrls,
        status: 'draft',
        created_at: new Date().toISOString()
    };

    let submittedSuccess = false;

    // 1. Nếu thiết bị đang Online, gửi trực tiếp qua /api/submit-place
    if (typeof navigator === 'undefined' || navigator.onLine) {
        try {
            const apiResult = await submitContributedPlace(payload);
            if (apiResult && (apiResult.success || apiResult.status === 'draft' || apiResult.idempotent)) {
                submittedSuccess = true;
            }
        } catch (err) {
            console.warn('[Contribution] Gửi API chưa thành công:', err.message);
            // HTTP 400 (Validation) hoặc HTTP 413 (Payload Too Large) là lỗi vĩnh viễn:
            // Giữ nguyên form để người dùng chỉnh sửa, tuyệt đối KHÔNG đưa vào retry queue
            if (err.status === 400 || err.status === 413) {
                alert(`⚠️ Không thể gửi (${err.status}): ${err.message}\nVui lòng kiểm tra lại thông tin trên form.`);
                return;
            }
            // HTTP 429: Rate Limit -> Giữ nguyên form và hiển thị Retry-After, KHÔNG đưa vào retry queue
            if (err.status === 429 || err.isRateLimitError) {
                const retryMsg = err.retryAfter ? ` (vui lòng chờ ${err.retryAfter} giây)` : '';
                alert(`⏳ Bạn đang gửi quá nhanh${retryMsg}. Vui lòng giữ nguyên form và thử lại sau.`);
                return;
            }
            // Chỉ các lỗi tạm thời: lỗi mạng, timeout, hoặc 500/502/503/504 mới tiếp tục fallback vào IndexedDB
            const isTransient = err.isNetworkError || err.name === 'AbortError' ||
                                (err.status >= 500 && err.status <= 504);
            if (!isTransient) {
                alert(`⚠️ Không thể gửi (${err.status || 'Lỗi'}): ${err.message}`);
                return;
            }
        }
    }

    // 2. Chỉ lưu vào IndexedDB khi thiết bị Offline hoặc gặp sự cố mạng tạm thời (5xx/timeout)
    if (!submittedSuccess) {
        try {
            await saveOfflineContribution(payload);
        } catch (idbErr) {
            console.warn('[Contribution] Lưu IndexedDB cảnh báo:', idbErr);
            alert('Không thể gửi và không thể lưu ngoại tuyến lúc này. Vui lòng thử lại sau.');
            return;
        }
    }

    // 3. Hiển thị thông báo kết quả phù hợp
    const toast = document.getElementById('offlineSyncToast');
    const toastTitle = document.getElementById('syncToastTitle');
    const toastMsg = document.getElementById('syncToastMsg');
    if (toast && toastTitle && toastMsg) {
        toastTitle.textContent = '🎉 Đóng góp địa điểm thành công!';
        toastMsg.textContent = submittedSuccess
            ? 'Địa điểm đã gửi lên hệ thống chờ Ban Quản Trị duyệt (+50 Điểm Thổ Địa).'
            : 'Đã lưu an toàn ngoại tuyến và sẽ tự động chuyển tới BQT khi có mạng (+50 Điểm Thổ Địa).';
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 6000);
    } else {
        alert(`🎉 Cảm ơn bạn! Địa điểm "${name}" đã được ghi nhận thành công (+50 Điểm Thổ Địa).`);
    }

    form.reset();
    state.contributePhotos = [];
    renderContributePhotosPreview();
    closeContributeModal();
}

/**
 * Xử lý chia sẻ
 */
export function sharePlace(type) {
    if (!state.currentDetailPlace) return;
    const place = state.currentDetailPlace;
    const url = window.location.href;

    if (type === 'facebook') {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'width=600,height=400');
    } else if (type === 'copy') {
        navigator.clipboard.writeText(url).then(() => {
            const msgEl = document.getElementById('shareFeedbackMsg');
            if (msgEl) {
                msgEl.textContent = 'Đã sao chép liên kết vào bộ nhớ tạm!';
                setTimeout(() => { msgEl.textContent = ''; }, 3000);
            }
        });
    } else if (type === 'native' && navigator.share) {
        navigator.share({
            title: place.name + ' - ViVuTraVinh',
            text: place.description || 'Khám phá điểm đến tuyệt đẹp tại Trà Vinh!',
            url: url
        }).catch(() => {});
    }
}

/**
 * PWA Install Prompt
 */
function initPwaInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        state.deferredPrompt = e;
        const installBtn = document.getElementById('pwaInstallHeaderBtn');
        if (installBtn) installBtn.classList.remove('hidden');
    });

    window.addEventListener('appinstalled', () => {
        state.deferredPrompt = null;
        const installBtn = document.getElementById('pwaInstallHeaderBtn');
        if (installBtn) installBtn.classList.add('hidden');
    });
}

export function promptPwaInstall() {
    if (state.deferredPrompt) {
        state.deferredPrompt.prompt();
        state.deferredPrompt.userChoice.then(() => {
            state.deferredPrompt = null;
            const installBtn = document.getElementById('pwaInstallHeaderBtn');
            if (installBtn) installBtn.classList.add('hidden');
        });
    }
}

/**
 * Đổ dữ liệu Huyện/Thị xã vào dropdown
 */
function populateAreaDropdown() {
    const areaSelect = document.getElementById('areaFilterSelect');
    if (!areaSelect) return;

    const areas = [...new Set(state.allPlaces.map(p => p.area).filter(Boolean))].sort();
    areaSelect.innerHTML = '<option value="">Tất cả khu vực</option>' + areas.map(a => `<option value="${a}">${a}</option>`).join('');
}

/**
 * Deep Link check
 */
function handleDeepLink() {
    // 1. Đọc slug từ đường dẫn pathname: /place/{slug} hoặc /places/{slug}
    const path = window.location.pathname || '';
    const match = path.match(/^\/places?\/([^/?#]+)/i);
    if (match && match[1]) {
        const placeSlug = decodeURIComponent(match[1]);
        setTimeout(() => openDetailModal(placeSlug, { isDirect: true }), 300);
        return;
    }

    // 2. Tương thích ngược: Hỗ trợ query param ?place={slug}, tự động chuyển URL sang /place/{slug}
    const params = new URLSearchParams(window.location.search);
    const placeId = params.get('place');
    if (placeId) {
        setTimeout(() => openDetailModal(placeId, { isDirect: true, fromLegacyQuery: true }), 300);
        return;
    }
    const tripParam = params.get('trip');
    if (tripParam) {
        setTimeout(() => handleTripShareParam(tripParam), 250);
        return;
    }
    const festivalId = params.get('festival');
    if (festivalId) {
        setTimeout(() => openFestivalModal(festivalId), 300);
        return;
    }
    const articleId = params.get('article');
    if (articleId) {
        setTimeout(() => openArticleModal(articleId), 300);
    }
}

/**
 * Cập nhật giao diện chế độ tìm kiếm (Search Mode UI & Issue M9)
 */
export function updateSearchModeUI() {
    const query = (state.searchTerm || '').trim();
    const isSearching = query.length > 0;
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const searchBanner = document.getElementById('searchActiveBanner');
    const queryText = document.getElementById('searchActiveQueryText');

    if (clearSearchBtn) {
        clearSearchBtn.classList.toggle('hidden', !isSearching);
    }

    if (searchBanner && queryText) {
        if (isSearching) {
            queryText.textContent = query;
            searchBanner.classList.remove('hidden');
            searchBanner.classList.add('flex');
        } else {
            searchBanner.classList.add('hidden');
            searchBanner.classList.remove('flex');
        }
    }

    // Tạm ẩn/thu gọn các khối khám phá dài dòng khi người dùng đang chủ động tìm kiếm món/quán (Issue M9)
    const discoveryDecorations = [
        document.getElementById('tourItinerariesSection'),
        document.getElementById('festivalsPortalSection'),
        document.getElementById('travelStoriesSection'),
        document.getElementById('heroSpotlightContainer')
    ];

    discoveryDecorations.forEach(sec => {
        if (sec) {
            if (isSearching) {
                sec.classList.add('hidden');
            } else {
                sec.classList.remove('hidden');
            }
        }
    });
}

/**
 * Gắn các Event Listeners
 */
function initEventListeners() {
    // Tìm kiếm ô input & Search Mode UI (Issue M9)
    const searchInput = document.getElementById('discoverySearchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const clearBannerBtn = document.getElementById('clearSearchBannerBtn');

    function clearSearch() {
        state.searchTerm = '';
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }
        updateSearchModeUI();
        applyFilters();
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.searchTerm = e.target.value;
            updateSearchModeUI();
            applyFilters();
            if (state.searchTerm.trim().length > 0) {
                const discoverySection = document.getElementById('discoverySection');
                if (discoverySection) {
                    discoverySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        });

        searchInput.addEventListener('focus', () => {
            if (state.searchTerm.trim().length > 0) {
                const discoverySection = document.getElementById('discoverySection');
                if (discoverySection) {
                    discoverySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        });
    }

    clearSearchBtn?.addEventListener('click', clearSearch);
    clearBannerBtn?.addEventListener('click', clearSearch);

    // Phím tắt ⌘K hoặc Ctrl+K, Escape, Focus Trap trong Modals (Accessibility)
    window.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            searchInput?.focus();
        }
        if (e.key === 'Escape') {
            closeDetailModal();
            closeContributeModal();
            closeFullMapModal();
            closeFestivalModal();
            closeArticleModal();
        }

        // Focus Trap trong các Modals đang mở
        if (e.key === 'Tab') {
            const activeModal = [
                document.getElementById('detailModal'),
                document.getElementById('contributeModal'),
                document.getElementById('fullMapModal'),
                document.getElementById('festivalDetailModal'),
                document.getElementById('articleDetailModal')
            ].find(m => m && !m.classList.contains('hidden'));

            if (activeModal) {
                const focusables = activeModal.querySelectorAll(
                    'button:not([disabled]):not(.hidden), [href]:not(.hidden), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                );
                if (focusables.length > 0) {
                    const firstEl = focusables[0];
                    const lastEl = focusables[focusables.length - 1];

                    if (e.shiftKey && document.activeElement === firstEl) {
                        e.preventDefault();
                        lastEl.focus();
                    } else if (!e.shiftKey && document.activeElement === lastEl) {
                        e.preventDefault();
                        firstEl.focus();
                    }
                }
            }
        }
    });

    // Lắng nghe nút Back trình duyệt di động hoặc thao tác vuốt Back (Ca kiểm thử E09)
    window.addEventListener('popstate', () => {
        const detailModal = document.getElementById('detailModal');
        if (detailModal && !detailModal.classList.contains('hidden')) {
            closeDetailModal(true);
            return;
        }
        const contributeModal = document.getElementById('contributeModal');
        if (contributeModal && !contributeModal.classList.contains('hidden')) {
            closeContributeModal();
            return;
        }
        const fullMapModal = document.getElementById('fullMapModal');
        if (fullMapModal && !fullMapModal.classList.contains('hidden')) {
            closeFullMapModal();
            return;
        }
        const festModal = document.getElementById('festivalDetailModal');
        if (festModal && !festModal.classList.contains('hidden')) {
            closeFestivalModal();
            return;
        }
        const articleModal = document.getElementById('articleDetailModal');
        if (articleModal && !articleModal.classList.contains('hidden')) {
            closeArticleModal();
        }
    });

    // Các Tabs danh mục
    document.querySelectorAll('.category-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const cat = btn.dataset.category || '';
            handleCategoryTabClick(cat);
        });
    });

    // Dropdown filters
    document.getElementById('areaFilterSelect')?.addEventListener('change', (e) => {
        state.activeArea = e.target.value;
        applyFilters();
    });

    document.getElementById('priceFilterSelect')?.addEventListener('change', (e) => {
        state.activePrice = e.target.value;
        applyFilters();
    });

    document.getElementById('ratingFilterSelect')?.addEventListener('change', (e) => {
        state.activeRating = Number.parseFloat(e.target.value) || 0;
        applyFilters();
    });

    document.getElementById('openNowFilterToggle')?.addEventListener('change', (e) => {
        state.activeOpenNow = e.target.checked;
        applyFilters();
    });

    // Reset filters
    document.getElementById('resetFiltersBtn')?.addEventListener('click', resetAllFilters);

    // Form comment submit
    document.getElementById('commentFormEl')?.addEventListener('submit', handleCommentSubmit);
    document.getElementById('commentTextInput')?.addEventListener('input', savePendingDraft);
    document.getElementById('commentAuthorInput')?.addEventListener('input', savePendingDraft);
    document.getElementById('commentRatingInput')?.addEventListener('change', savePendingDraft);

    // Chọn ảnh thực tế khi đánh giá
    document.getElementById('commentChoosePhotoBtn')?.addEventListener('click', () => {
        document.getElementById('commentPhotoInput')?.click();
    });

    document.getElementById('commentPhotoInput')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const compressed = await compressImage(file, 1200, 1200, 0.75);
            state.selectedCommentPhoto = {
                dataUrl: compressed.dataUrl,
                fileName: file.name,
                fileSize: Math.round(compressed.compressedSize / 1024) + ' KB'
            };
            showCommentPhotoPreview();
        } catch (err) {
            console.error('[Comment Photo] Lỗi xử lý ảnh:', err);
            alert('Không thể xử lý ảnh: ' + err.message);
        }
    });

    document.getElementById('commentRemovePhotoBtn')?.addEventListener('click', () => {
        clearCommentPhoto();
    });

    function updateNetworkStatusUI(isOnline) {
        const offlineBar = document.getElementById('offlineStatusBar');
        if (offlineBar) {
            if (isOnline) offlineBar.classList.add('hidden');
            else offlineBar.classList.remove('hidden');
        }
        const commentNotice = document.getElementById('commentNetworkNotice');
        if (commentNotice) {
            if (isOnline) commentNotice.classList.add('hidden');
            else commentNotice.classList.remove('hidden');
        }
    }

    // Cập nhật notice trạng thái mạng khi online/offline
    window.addEventListener('online', () => updateNetworkStatusUI(true));
    window.addEventListener('offline', () => updateNetworkStatusUI(false));

    // Khởi tạo kiểm tra trạng thái mạng ban đầu
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        updateNetworkStatusUI(false);
    }
}

/**
 * Đặt lại toàn bộ bộ lọc và tìm kiếm về trạng thái ban đầu
 */
export function resetAllFilters() {
    state.searchTerm = '';
    state.activeCategory = '';
    state.activeArea = '';
    state.activePrice = '';
    state.activeRating = 0;
    state.activeOpenNow = false;
    state.activeBubble = 'all';
    state.isNearMeActive = false;
    state.allPlaces.forEach(p => delete p.distanceKm);
    updateNearMeButtonUI(false);

    const searchInput = document.getElementById('discoverySearchInput');
    if (searchInput) searchInput.value = '';
    updateSearchModeUI();

    const areaSelect = document.getElementById('areaFilterSelect');
    if (areaSelect) areaSelect.value = '';
    const priceSelect = document.getElementById('priceFilterSelect');
    if (priceSelect) priceSelect.value = '';
    const ratingSelect = document.getElementById('ratingFilterSelect');
    if (ratingSelect) ratingSelect.value = '';
    const openToggle = document.getElementById('openNowFilterToggle');
    if (openToggle) openToggle.checked = false;

    updateActiveCategoryTab('');
    renderStoryBubbles('storyBubblesContainer', 'all', handleBubbleSelect);
    applyFilters();
}

// Helpers hiển thị Loading & Error
function showLoading(isLoading) {
    const loadingEl = document.getElementById('pageLoadingSkeleton');
    const mainContentEl = document.getElementById('mainContentArea');
    if (loadingEl) loadingEl.classList.toggle('hidden', !isLoading);
    if (mainContentEl) mainContentEl.classList.toggle('hidden', isLoading);
}

function showError(msg, onRetry) {
    const errEl = document.getElementById('pageErrorMessage');
    const errMsgText = document.getElementById('pageErrorText');
    const retryBtn = document.getElementById('pageRetryBtn');

    if (errEl) errEl.classList.remove('hidden');
    if (errMsgText) errMsgText.textContent = msg;
    if (retryBtn && onRetry) {
        retryBtn.onclick = onRetry;
    }
}

function hideError() {
    const errEl = document.getElementById('pageErrorMessage');
    if (errEl) errEl.classList.add('hidden');
}

// ==========================================
// BOTTOM NAVIGATION CONTROLLER (MOBILE FIRST)
// ==========================================
export function setBottomNavActive(activeId) {
    const tabs = ['tabNavHome', 'tabNavMap', 'tabNavSaved', 'tabNavSearch'];
    tabs.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const isActive = id === activeId;
        const icon = el.querySelector('.material-symbols-outlined');

        if (isActive) {
            el.className = 'bottom-nav-btn flex-1 flex flex-col items-center justify-center py-1.5 text-primary dark:text-emerald-400 font-bold relative transition-colors focus:outline-none';
            if (icon) icon.style.fontVariationSettings = "'FILL' 1, 'wght' 600";
        } else {
            el.className = 'bottom-nav-btn flex-1 flex flex-col items-center justify-center py-1.5 text-on-surface-variant dark:text-zinc-400 font-medium relative hover:text-primary dark:hover:text-emerald-400 transition-colors focus:outline-none';
            if (icon) icon.style.fontVariationSettings = "'FILL' 0, 'wght' 400";
        }
    });
}

export function navGoHome() {
    setBottomNavActive('tabNavHome');
    handleCategoryTabClick('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function navGoMap() {
    setBottomNavActive('tabNavMap');
    openFullMapModal();
}

export function navGoSaved() {
    setBottomNavActive('tabNavSaved');
    handleCategoryTabClick('saved');
    const discoverySection = document.getElementById('discoverySection');
    if (discoverySection) {
        discoverySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

export function navGoSearch() {
    setBottomNavActive('tabNavSearch');
    const searchInput = document.getElementById('discoverySearchInput');
    if (searchInput) {
        searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
            searchInput.focus();
            searchInput.select();
        }, 300);
    }
}

/**
 * Khởi tạo Background Sync & Online Reconnect Listener
 */
function initOfflineSyncManager() {
    setupAutoSync(
        (rev) => window.ViVuComments ? window.ViVuComments.submitComment(rev) : Promise.reject(new Error('Chưa có service bình luận')),
        (res) => {
            if (res.synced > 0) {
                showSyncToast(res.synced);
                if (state.currentDetailPlace) {
                    reloadModalComments(state.currentDetailPlace.id);
                }
            }
        },
        (contrib) => submitContributedPlace(contrib),
        (res) => {
            if (res.synced > 0) {
                showContribSyncToast(res.synced);
            }
        }
    );
}

/**
 * Hiển thị thông báo Toast khi đồng bộ ngoại tuyến thành công
 */
function showSyncToast(syncedCount) {
    const toast = document.getElementById('offlineSyncToast');
    const title = document.getElementById('syncToastTitle');
    const msg = document.getElementById('syncToastMsg');
    if (!toast) return;

    if (title) title.textContent = 'Đã tự động đồng bộ!';
    if (msg) msg.textContent = `Đã đồng bộ thành công ${syncedCount} đánh giá ngoại tuyến lên máy chủ.`;

    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 5000);
}

/**
 * Hiển thị thông báo Toast khi đồng bộ địa điểm đóng góp ngoại tuyến thành công
 */
function showContribSyncToast(syncedCount) {
    const toast = document.getElementById('offlineSyncToast');
    const title = document.getElementById('syncToastTitle');
    const msg = document.getElementById('syncToastMsg');
    if (!toast) return;

    if (title) title.textContent = 'Đã đồng bộ địa điểm!';
    if (msg) msg.textContent = `Đã đồng bộ thành công ${syncedCount} địa điểm đóng góp ngoại tuyến lên hệ thống.`;

    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 5000);
}

/**
 * Mở modal xem phóng to ảnh chụp thực tế
 */
export function viewPhotoModal(src) {
    const modal = document.getElementById('photoLightboxModal');
    const img = document.getElementById('photoLightboxImg');
    if (modal && img) {
        img.src = src;
        modal.classList.remove('hidden');
    }
}

/**
 * Kiểm tra xem người dùng có đang nhập dở nội dung đánh giá/đóng góp (Active Draft)
 */
export function hasActiveDraft() {
    const text = document.getElementById('commentTextInput')?.value?.trim();
    const author = document.getElementById('commentAuthorInput')?.value?.trim();
    const contribName = document.getElementById('contributePlaceName')?.value?.trim();
    return Boolean((text && text.length > 0) || (author && author.length > 2) || (contribName && contribName.length > 0));
}

/**
 * Lưu trữ bản nháp đánh giá vào localStorage trước khi cập nhật
 */
export function savePendingDraft() {
    try {
        const text = document.getElementById('commentTextInput')?.value || '';
        const author = document.getElementById('commentAuthorInput')?.value || '';
        const rating = document.getElementById('commentRatingInput')?.value || '';
        if (text || author) {
            localStorage.setItem('vivu_comment_draft', JSON.stringify({
                text, author, rating,
                placeId: state.currentDetailPlace?.id || '',
                timestamp: Date.now()
            }));
        }
    } catch (e) {
        console.warn('[Draft] Không thể lưu draft:', e);
    }
}

/**
 * Tự động phục hồi bản nháp đánh giá sau khi trang tải lại
 */
export function restorePendingDraft() {
    try {
        const raw = localStorage.getItem('vivu_comment_draft');
        if (!raw) return;
        const draft = JSON.parse(raw);
        if (draft && typeof draft === 'object' && Date.now() - (draft.timestamp || 0) < 3600000) {
            state.pendingCommentDraft = draft;
            const authorInput = document.getElementById('commentAuthorInput');
            const textInput = document.getElementById('commentTextInput');
            const ratingInput = document.getElementById('commentRatingInput');
            if (authorInput && draft.author && !authorInput.value) authorInput.value = draft.author;
            if (textInput && draft.text && !textInput.value) textInput.value = draft.text;
            if (ratingInput && draft.rating && !ratingInput.value) ratingInput.value = draft.rating;
        }
    } catch (e) {
        console.warn('[Draft] Không thể phục hồi draft:', e);
    }
}

/**
 * Quản lý luồng cập nhật Service Worker an toàn (Safe Update Flow)
 */
let pendingWorkerToSkip = null;
export function initServiceWorkerUpdateFlow() {
    window.addEventListener('vivu:sw-update-ready', (event) => {
        const worker = event.detail?.worker;
        if (!worker) return;
        pendingWorkerToSkip = worker;

        const updateToast = document.getElementById('appUpdateToast');
        if (!updateToast) return;

        updateToast.classList.remove('hidden');

        document.getElementById('applyUpdateBtn')?.addEventListener('click', () => {
            savePendingDraft();
            if (pendingWorkerToSkip) {
                pendingWorkerToSkip.postMessage({ type: 'SKIP_WAITING' });
            }
            updateToast.classList.add('hidden');
        }, { once: true });

        document.getElementById('dismissUpdateBtn')?.addEventListener('click', () => {
            updateToast.classList.add('hidden');
        });
        document.getElementById('dismissUpdateBtn2')?.addEventListener('click', () => {
            updateToast.classList.add('hidden');
        });
    });
}

/**
 * Hiển thị thông báo khi bản đồ vệ tinh không tải được do mất mạng (Offline Map)
 */
export function showOfflineMapOverlay(container, options = {}) {
    if (!container || container.querySelector('.offline-map-overlay')) return;
    const googleMapsUrl = typeof options === 'string' ? options : options?.googleMapsUrl;
    const overlay = document.createElement('div');
    overlay.className = 'offline-map-overlay absolute inset-0 bg-stone-900/85 backdrop-blur-xs flex flex-col items-center justify-center p-3 text-center text-white z-[1000] pointer-events-auto rounded-xl select-none';
    const actionBtn = googleMapsUrl
        ? `<a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" class="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm">
             <span class="material-symbols-outlined text-sm">map</span>
             <span>Mở Google Maps</span>
           </a>`
        : '';
    overlay.innerHTML = `
        <span class="material-symbols-outlined text-amber-400 text-2xl mb-1">wifi_off</span>
        <p class="text-xs font-bold text-amber-200">Bản đồ ngoại tuyến: Không thể tải bản đồ trực tuyến.</p>
        <p class="text-[10px] text-stone-300 mt-0.5">Địa chỉ và tọa độ GPS vẫn được lưu trữ đầy đủ.</p>
        ${actionBtn}
    `;
    container.style.position = 'relative';
    container.appendChild(overlay);
}

// Expose ra window để hỗ trợ inline HTML event handlers
if (typeof window !== 'undefined') {
    window.ViVuApp = {
        toggleTheme,
        openDetailModal,
        closeDetailModal,
        openFullMapModal,
        closeFullMapModal,
        locateUserPosition,
        openContributeModal,
        closeContributeModal,
        locateContributePosition,
        handleContributePhotosSelect,
        removeContributePhoto,
        handleContributeSubmit,
        handleGenerateRandomTour,
        sharePlace,
        promptPwaInstall,
        navGoHome,
        navGoMap,
        navGoSaved,
        navGoSearch,
        setBottomNavActive,
        toggleNearMeFilter,
        handleTourSelect,
        handleSearchKeyword,
        viewPhotoModal,
        switchModalTab,
        openFestivalModal,
        closeFestivalModal,
        handleSeasonFilter,
        openArticleModal,
        closeArticleModal,
        openDetailFromArticle,
        handleArticlePhotoSelect,
        removeArticleCommentPhoto,
        handleArticleCommentSubmit,
        shareArticle,
        resetAllFilters,
        clearRecentHistory,
        toggleBookmark,
        isPlaceSaved,
        isPlaceRecent,
        saveRecentPlace,
        canonicalizePreferences,
        getPlaceAliases,
        getPlaceCanonicalKey,
        syncAllPendingReviews: () => syncAllPendingReviews(
            (rev) => window.ViVuComments ? window.ViVuComments.submitComment(rev) : Promise.reject(new Error('Chưa có service bình luận')),
            (rev, status) => console.log('[ManualSync]', rev.id, status)
        ),
        submitContributedPlace,
        syncAllPendingContributions: () => syncAllPendingContributions(
            submitContributedPlace,
            (contrib, status) => console.log('[ManualContribSync]', contrib.id, status)
        ),
        openDetailFromMap: (id) => {
            closeFullMapModal();
            openDetailModal(id);
        },
        openReportModal,
        closeReportModal,
        submitReportPlace,
        shareTripCollection,
        updatePlaceMetaTags,
        restoreDefaultMetaTags,
        handleTripShareParam,
        getState: () => state,
        get state() { return state; }
    };
}
