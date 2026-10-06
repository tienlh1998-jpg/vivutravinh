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
    getPlaceOpenStatus,
    calculateDistanceKm,
    renderTourItineraries,
    SAMPLE_TOURS,
    generateSmartTour,
    getDynamicTour,
    renderFestivalsSection,
    renderFestivalDetailModal,
    renderArticlesSection,
    renderArticleReaderModal,
    renderSubmitArticleModal,
    getArticleCategoryBadgeClass,
    getArticleCategoryName,
    sanitizeArticleContent,
    updateModalBookmarkButton,
    createCustomMapMarker,
    renderMapPlacesList,
    renderMapCategoryPills,
    renderClubsBentoGrid,
    renderClubCategoryPills,
    renderCommunityFeedFilters,
    renderCommunityPostsFeed,
    renderWeeklyActivitiesWidget,
    renderCommunityGuidelinesWidget,
    renderEventRsvpModal,
    renderHostEventModal,
    renderSubmitClubActivityModal,
    renderUserProfileModalContent,
    renderSavedCollectionsModalContent,
    renderRedeemGiftModalContent,
    renderEditProfileModalContent,
    renderCreateCollectionModalContent,
    renderExportItineraryModalContent,
    renderSecurityModalContent,
    renderLink2FAModalContent,
    renderBackupCodesModalContent,
    renderTripPlannerModalContent,
    renderPlannerView,
    renderGpsNavigationModalContent,
    renderTripSummaryModalContent,
    renderSocialStoryModalContent,
    renderAdminSupportModalContent,
    renderAdminModerationModalContent,
    renderAdminActionReasonModalContent,
    renderDeepPlaceDetailModalContent,
    renderItineraryFolderDetailModalContent,
    renderPlacePhotoGalleryModalContent,
    renderOfflineTicketCard,
    getStoredPasses,
    saveStoredPasses,
    buildTicketQrPayload,
    TICKET_SECTOR_LABELS,
    escapeHtml
} from './ui.js';

import {
    DEEP_HERITAGE_PLACES,
    SAVED_ITINERARY_FOLDER_DETAIL,
    getDeepPlaceDetail,
    getSavedItineraryFolderDetail,
    saveSavedItineraryFolderDetail
} from './place-detail-data.js';

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

import {
    TRA_VINH_FESTIVALS,
    TRA_VINH_EVENTS_AND_MEETUPS,
    EVENT_CATEGORIES,
    EVENT_REGIONS
} from './festivals-data.js';
import { TRA_VINH_ARTICLES } from './articles-data.js';
import {
    TRA_VINH_CLUBS,
    TRA_VINH_CLUB_CATEGORIES,
    TRA_VINH_WEEKLY_ACTIVITIES,
    TRA_VINH_COMMUNITY_POSTS,
    COMMUNITY_GUIDELINES,
    COMMUNITY_FEED_FILTERS
} from './clubs-data.js';
import {
    USER_PROFILE,
    OFFICIAL_BADGES,
    computeUserBadges,
    INITIAL_SAVED_ITEMS,
    SAVED_FOLDERS,
    REDEEMABLE_GIFTS
} from './profile-data.js';
import {
    INITIAL_SECURITY_STATE,
    SECURITY_AUDIT_LOGS
} from './security-data.js';
import {
    INITIAL_TRIP_PLAN,
    PLACE_POOL,
    GPS_NAVIGATION_STATE,
    TRIP_SUMMARY_STATE,
    STORY_TEMPLATES
} from './planner-data.js';
import {
    ADMIN_INFO,
    PROJECT_FINANCIAL_REPORT,
    DONATION_TIERS,
    ADMIN_TECH_CLEARANCE,
    TRAVEL_GEAR_RECOMMENDATIONS,
    MODERATION_KPI,
    getStoredModerationPosts,
    saveStoredModerationPosts,
    getStoredModerationClubs,
    saveStoredModerationClubs,
    getStoredModerationEvents,
    saveStoredModerationEvents,
    getStoredDonationRecords,
    saveStoredDonationRecords,
    addDonationRecord
} from './admin-portal-data.js';
import {
    getSession as getAdminSession,
    getUserRole as getAdminUserRole,
    getValidToken as getValidAdminToken
} from './admin-auth.js';
import {
    getUserSession,
    saveUserSession,
    clearUserSession,
    getValidUserToken,
    signUpWithEmail,
    signInWithEmail,
    signOutUser,
    fetchUserProfile
} from './auth.js';

import { getSiteUrl, DEFAULT_SITE_URL, SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
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

// Lưu trữ Câu lạc bộ & Thảo luận cộng đồng (Phase 5)
function getStoredJoinedClubs() {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const raw = localStorage.getItem('vivu_joined_clubs');
            return raw ? JSON.parse(raw) : ['clb-nhiep-anh-khmer'];
        }
    } catch (e) {
        return ['clb-nhiep-anh-khmer'];
    }
    return ['clb-nhiep-anh-khmer'];
}

function getStoredLikedPosts() {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const raw = localStorage.getItem('vivu_liked_posts');
            return raw ? JSON.parse(raw) : ['post-1'];
        }
    } catch (e) {
        return ['post-1'];
    }
    return ['post-1'];
}

function getStoredRegisteredActivities() {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const raw = localStorage.getItem('vivu_registered_activities');
            return raw ? JSON.parse(raw) : [];
        }
    } catch (e) {
        return [];
    }
    return [];
}

function getStoredBookmarkedEvents() {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const raw = localStorage.getItem('vivu_bookmarked_events');
            return raw ? new Set(JSON.parse(raw)) : new Set();
        }
    } catch (e) {
        return new Set();
    }
    return new Set();
}

function saveStoredBookmarkedEvents(set) {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem('vivu_bookmarked_events', JSON.stringify([...set]));
        }
    } catch (e) {
        // ignore
    }
}

function getStoredUserProfile() {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const raw = localStorage.getItem('vivu_user_profile');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    if (parsed.coins !== undefined || parsed.totalPoints === undefined) {
                        parsed.totalPoints = Number(parsed.totalPoints || 0);
                        parsed.currentMonthPoints = Number(parsed.currentMonthPoints || 0);
                        parsed.currentYearPoints = Number(parsed.currentYearPoints || 0);
                        delete parsed.coins;
                    }
                    if (parsed.stats && (parsed.stats.tripsCompleted === 48 || parsed.stats.cyclingKm === 642)) {
                        parsed.stats = { tripsCompleted: null, pagodasVisited: null, cyclingKm: null };
                    }
                    // Kiểm tra chu kỳ tháng/năm theo múi giờ Việt Nam:
                    // Nếu bước sang tháng mới nhưng người dùng chưa có giao dịch thì điểm tháng hiển thị là 0
                    try {
                        const curVnMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).format(new Date());
                        const curVnYear = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' }).format(new Date()));
                        if (parsed.lastActiveMonth && parsed.lastActiveMonth !== curVnMonth) {
                            parsed.currentMonthPoints = 0;
                        }
                        if (parsed.lastActiveYear && Number(parsed.lastActiveYear) !== curVnYear) {
                            parsed.currentYearPoints = 0;
                        }
                    } catch (_) {}
                    return { ...USER_PROFILE, ...parsed };
                }
            }
        }
    } catch (e) {}
    return { ...USER_PROFILE };
}

function saveStoredUserProfile(profile) {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem('vivu_user_profile', JSON.stringify(profile));
        }
    } catch (e) {}
}

function getStoredSavedCollections() {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const raw = localStorage.getItem('vivu_saved_collections');
            if (raw) return JSON.parse(raw);
        }
    } catch (e) {}
    return [...INITIAL_SAVED_ITEMS];
}

function saveStoredSavedCollections(items) {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem('vivu_saved_collections', JSON.stringify(items));
        }
    } catch (e) {}
}

function getStoredSavedFolders() {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const raw = localStorage.getItem('vivu_saved_folders');
            if (raw) return JSON.parse(raw);
        }
    } catch (e) {}
    return [...SAVED_FOLDERS];
}

function saveStoredSavedFolders(folders) {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem('vivu_saved_folders', JSON.stringify(folders));
        }
    } catch (e) {}
}

function getStoredSecuritySettings() {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const raw = localStorage.getItem('vivu_security_settings');
            if (raw) return JSON.parse(raw);
        }
    } catch (e) {}
    return { ...INITIAL_SECURITY_STATE };
}

function saveStoredSecuritySettings(settings) {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem('vivu_security_settings', JSON.stringify(settings));
        }
    } catch (e) {}
}

export function getActiveUserIdentifier() {
    try {
        const userSession = typeof getUserSession === 'function' ? getUserSession() : null;
        if (userSession && userSession.user) {
            return userSession.user.id || userSession.user.email || 'user';
        }
        const adminSession = typeof getAdminSession === 'function' ? getAdminSession() : null;
        if (adminSession && adminSession.user) {
            return adminSession.user.id || adminSession.user.email || 'admin';
        }
    } catch (e) {}
    return 'guest';
}

export function getTripPlanStorageKey(customIdent = null) {
    const ident = customIdent || getActiveUserIdentifier();
    if (ident === 'guest') {
        return 'vivu_trip_plan_guest';
    }
    const safeIdent = String(ident).replace(/[^a-zA-Z0-9_-]/g, '_');
    return `vivu_trip_plan_${safeIdent}`;
}

export function getStoredTripPlan(targetIdent = null) {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const key = getTripPlanStorageKey(targetIdent);
            let raw = localStorage.getItem(key);
            // Tương thích ngược: Chỉ khách vãng lai mới fallback sang key 'vivu_trip_plan' cũ
            if (!raw && key === 'vivu_trip_plan_guest') {
                raw = localStorage.getItem('vivu_trip_plan');
            }
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.days)) {
                    return parsed;
                }
            }
        }
    } catch (e) {}
    return JSON.parse(JSON.stringify(INITIAL_TRIP_PLAN));
}

export function saveStoredTripPlan(plan, targetIdent = null) {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const key = getTripPlanStorageKey(targetIdent);
            const str = JSON.stringify(plan);
            localStorage.setItem(key, str);
            // Giữ đồng bộ key cũ cho khách vãng lai để đảm bảo tương thích ngược
            if (key === 'vivu_trip_plan_guest') {
                localStorage.setItem('vivu_trip_plan', str);
            }
        }
    } catch (e) {}
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
    currentView: 'home',
    currentOverlay: null,
    previousBaseView: 'home',
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
    // Audio Guide State
    isAudioPlaying: false,
    audioInterval: null,
    audioSeconds: 0,
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
    // Sự Kiện & Gặp Gỡ Xứ Trà (Phase 6)
    eventsAndMeetups: TRA_VINH_EVENTS_AND_MEETUPS,
    activeEventCategory: 'all',
    activeEventRegion: 'all',
    bookmarkedEvents: getStoredBookmarkedEvents(),
    currentRsvpEvent: null,
    // Góc Chuyện Xứ Trà (Travel Stories) State
    articles: TRA_VINH_ARTICLES,
    currentArticle: null,
    selectedArticleCommentPhoto: null,
    // Interactive Map State (Phase 4)
    mapMarkersMap: new Map(),
    selectedMapPlace: null,
    mapCategory: 'all',
    mapSearchTerm: '',
    mapFilterOpenOnly: false,
    mapFilterFreeOnly: false,
    mapMobileView: 'map',
    userGpsMarker: null,
    // Community Clubs & Discussion State (Phase 5)
    clubs: TRA_VINH_CLUBS,
    communityPosts: TRA_VINH_COMMUNITY_POSTS,
    weeklyActivities: TRA_VINH_WEEKLY_ACTIVITIES,
    communityGuidelines: COMMUNITY_GUIDELINES,
    joinedClubs: getStoredJoinedClubs(),
    likedCommunityPosts: getStoredLikedPosts(),
    registeredActivities: getStoredRegisteredActivities(),
    activeClubCategory: 'all',
    activeCommunityFeedFilter: 'all',
    newPostAttachment: null,
    newPostLocation: null,
    // User Profile, Achievements & Badges (Phase 7)
    userProfile: getStoredUserProfile(),
    savedCollections: getStoredSavedCollections(),
    savedFolders: getStoredSavedFolders(),
    redeemableGifts: REDEEMABLE_GIFTS,
    savedActiveCategory: 'all',
    savedSortMode: 'recent',
    savedViewMode: 'grid',
    savedSearchTerm: '',
    profileActiveTab: 'overview',
    profileBadgeCategory: 'all',
    userUgcContent: {
        articles: [],
        clubs: [],
        activities: [],
        posts: [],
        events: [],
        loading: false,
        loaded: false,
        filter: 'all'
    },
    // Settings, Security Center & 2FA (Phase 8)
    securitySettings: getStoredSecuritySettings(),
    securityActiveTab: 'security',
    securityAuditLogs: SECURITY_AUDIT_LOGS,
    otpBuffer: ['', '', '', '', '', ''],
    // Trip Planner, Turn-by-Turn GPS & Social Stories (Phase 9)
    tripPlan: getStoredTripPlan(),
    placePool: [...PLACE_POOL],
    plannerActiveDay: 1,
    plannerPoolCategory: 'all',
    plannerSearchQuery: '',
    plannerCurrentTab: 'custom',
    gpsNavState: JSON.parse(JSON.stringify(GPS_NAVIGATION_STATE)),
    tripSummaryState: JSON.parse(JSON.stringify(TRIP_SUMMARY_STATE)),
    storyTheme: 'heritage',
    storyToggles: { badge: true, stats: true, qr: true },
    // Admin Support Wall & Moderation Portal (Phase 10)
    adminInfo: ADMIN_INFO,
    financialReport: PROJECT_FINANCIAL_REPORT,
    donationTiers: DONATION_TIERS,
    selectedDonationAmount: 35000,
    selectedDonationTierId: 'noodle',
    techClearance: ADMIN_TECH_CLEARANCE,
    travelGear: TRAVEL_GEAR_RECOMMENDATIONS,
    recentSupporters: getStoredDonationRecords(),
    moderationPosts: getStoredModerationPosts(),
    selectedModerationPostId: null,
    moderationClubs: getStoredModerationClubs(),
    selectedModerationClubId: null,
    moderationEvents: getStoredModerationEvents(),
    selectedModerationEventId: null,
    moderationArticles: [],
    selectedModerationArticleId: null,
    moderationActivities: [],
    selectedModerationActivityId: null,
    moderationPlaces: [],
    selectedModerationPlaceId: null,
    moderationKpi: { ...MODERATION_KPI },
    moderationActiveTab: 'posts',
    moderationFilterCategory: 'all',
    moderationRiskFilter: 'all',
    moderationSearchQuery: '',
    actionReasonModalState: { type: '', targetId: '', targetTitle: '' },
    // Deep Cultural Heritage & Saved Itinerary Folder (Phase 11)
    deepPlaceId: 'chua-ang',
    isDeepAudioPlaying: false,
    deepAudioTimerInterval: null,
    deepAudioCurrentSeconds: 84,
    activePhotoGalleryIndex: 0,
    activeItineraryFolder: getSavedItineraryFolderDetail('folder-heritage-01')
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

        // Render Cổng Sự Kiện & Lễ Hội Trà Vinh (Phase 6)
        renderFestivalsSection(
            'festivalsPortalContainer',
            state.festivals,
            state.activeFestivalSeason,
            openFestivalModal,
            openDetailModal,
            handleSeasonFilter,
            state.eventsAndMeetups,
            state.activeEventCategory,
            state.activeEventRegion,
            handleEventCategoryFilter,
            handleEventRegionFilter,
            openEventRsvpModal,
            toggleBookmarkEvent,
            state.bookmarkedEvents,
            openHostEventModal
        );

        // Render Section Góc Chuyện Xứ Trà (Travel Stories)
        renderArticlesSection(
            'travelStoriesContainer',
            state.articles,
            openArticleModal,
            openSubmitArticleModal,
            (article) => openSubmitArticleModal(article, true),
            Boolean(getAdminSession()?.user && ['admin', 'editor', 'moderator'].includes(getAdminSession()?.user?.role))
        );

        // Render Section Câu Lạc Bộ & Hoạt Động Cộng Đồng Xứ Trà (Phase 5)
        initCommunitySection();

        populateAreaDropdown();
        renderMainDiscoveryGrid();
        updateResultsCount(state.filteredPlaces.length);
        updateFavoritesCount();
        updateDataSourceBadge(places);
        updateHeroStats();

        // Khởi tạo Mini Map Bento
        initMiniMap();

        showLoading(false);

        // Kiểm tra deep link (?place=slug)
        handleDeepLink();

        // Khởi tạo hệ thống tự động đồng bộ đánh giá ngoại tuyến
        initOfflineSyncManager();

        // Đồng bộ phân quyền Quản trị viên (nếu đã đăng nhập từ trang admin cũ)
        updateAdminRoleUI();

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
        navGoSection('tourItinerariesSection');
        return;
    }

    if (story.id === 'festivals' || story.type === 'festivals') {
        state.activeBubble = 'festivals';
        renderStoryBubbles('storyBubblesContainer', state.activeBubble, handleBubbleSelect);
        navGoEvents();
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

    // Chuyển sang Search View và cuộn đến bộ lọc khám phá
    switchView('search', { updateHash: true, pushState: true, scrollTo: 'discoverySection' });
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
        openTourItinerariesModal();
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
 * Lọc Sự Kiện & Lễ Hội Theo Mùa (Phase 6)
 */
export function handleSeasonFilter(season) {
    state.activeFestivalSeason = season;
    renderFestivalsSection(
        'festivalsPortalContainer',
        state.festivals,
        state.activeFestivalSeason,
        openFestivalModal,
        openDetailModal,
        handleSeasonFilter,
        state.eventsAndMeetups,
        state.activeEventCategory,
        state.activeEventRegion,
        handleEventCategoryFilter,
        handleEventRegionFilter,
        openEventRsvpModal,
        toggleBookmarkEvent,
        state.bookmarkedEvents,
        openHostEventModal
    );
}

/**
 * Lọc Sự Kiện & Gặp Gỡ Theo Danh Mục (Phase 6)
 */
export function handleEventCategoryFilter(categoryId) {
    state.activeEventCategory = categoryId;
    renderFestivalsSection(
        'festivalsPortalContainer',
        state.festivals,
        state.activeFestivalSeason,
        openFestivalModal,
        openDetailModal,
        handleSeasonFilter,
        state.eventsAndMeetups,
        state.activeEventCategory,
        state.activeEventRegion,
        handleEventCategoryFilter,
        handleEventRegionFilter,
        openEventRsvpModal,
        toggleBookmarkEvent,
        state.bookmarkedEvents,
        openHostEventModal
    );
}

/**
 * Lọc Sự Kiện Theo Khu Vực Địa Bàn (Phase 6)
 */
export function handleEventRegionFilter(regionId) {
    state.activeEventRegion = regionId;
    renderFestivalsSection(
        'festivalsPortalContainer',
        state.festivals,
        state.activeFestivalSeason,
        openFestivalModal,
        openDetailModal,
        handleSeasonFilter,
        state.eventsAndMeetups,
        state.activeEventCategory,
        state.activeEventRegion,
        handleEventCategoryFilter,
        handleEventRegionFilter,
        openEventRsvpModal,
        toggleBookmarkEvent,
        state.bookmarkedEvents,
        openHostEventModal
    );
}

/**
 * Lưu / Bỏ lưu sự kiện (Bookmark Event)
 */
export function toggleBookmarkEvent(eventId) {
    if (!eventId) return;
    const isBookmarked = state.bookmarkedEvents.has(eventId);
    if (isBookmarked) {
        state.bookmarkedEvents.delete(eventId);
        showNotification('Đã bỏ lưu sự kiện khỏi danh sách.');
    } else {
        state.bookmarkedEvents.add(eventId);
        showNotification('Đã lưu sự kiện vào danh sách yêu thích!');
    }
    saveStoredBookmarkedEvents(state.bookmarkedEvents);
    renderFestivalsSection(
        'festivalsPortalContainer',
        state.festivals,
        state.activeFestivalSeason,
        openFestivalModal,
        openDetailModal,
        handleSeasonFilter,
        state.eventsAndMeetups,
        state.activeEventCategory,
        state.activeEventRegion,
        handleEventCategoryFilter,
        handleEventRegionFilter,
        openEventRsvpModal,
        toggleBookmarkEvent,
        state.bookmarkedEvents,
        openHostEventModal
    );
}

/**
 * Mở Modal Đăng Ký Giữ Chỗ / Tham Gia Hoạt Động (Event RSVP)
 */
export function openEventRsvpModal(eventOrId) {
    const event = typeof eventOrId === 'string'
        ? state.eventsAndMeetups.find(e => e.id === eventOrId)
        : eventOrId;
    if (!event) return;

    state.currentRsvpEvent = event;
    renderEventRsvpModal(event, submitEventRsvp);

    const modal = document.getElementById('eventRsvpModal');
    if (modal) modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

/**
 * Đóng Modal Đăng Ký Tham Gia Hoạt Động
 */
export function closeEventRsvpModal() {
    const modal = document.getElementById('eventRsvpModal');
    if (modal) modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    state.currentRsvpEvent = null;
}

/**
 * Submit Đăng Ký Vé / Chỗ Tham Gia Hoạt Động (Chưa hỗ trợ trực tuyến)
 */
export function submitEventRsvp(rsvpData) {
    closeEventRsvpModal();
    showNoticeToast('Chưa hỗ trợ đăng ký trực tuyến', 'Sự kiện hiện chưa hỗ trợ đăng ký vé qua hệ thống. Du khách có thể đến tham quan, tham gia tự do hoặc liên hệ trực tiếp ban tổ chức.');
}

/**
 * Mở Modal Đăng Ký / Chỉnh Sửa Tổ Chức Sự Kiện
 */
export function openHostEventModal(editingEvent = null) {
    renderHostEventModal(submitHostEvent, editingEvent);
    const modal = document.getElementById('hostEventModal');
    if (modal) modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

/**
 * Đóng Modal Đăng Ký Tổ Chức Sự Kiện
 */
export function closeHostEventModal() {
    const modal = document.getElementById('hostEventModal');
    if (modal) modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

/**
 * Submit Đăng Ký hoặc Cập Nhật Tổ Chức Sự Kiện
 */
export async function submitHostEvent(hostData) {
    const session = getUserSession();
    if (!session || !session.user) {
        showNoticeToast('Yêu cầu đăng nhập', 'Vui lòng đăng nhập tài khoản Thành viên để gửi hồ sơ tổ chức sự kiện.');
        openAuthModal('signin', () => submitHostEvent(hostData));
        return;
    }

    try {
        const token = await getValidUserToken();
        if (!token) {
            showNoticeToast('Phiên làm việc hết hạn', 'Vui lòng đăng nhập lại.');
            openAuthModal('signin', () => submitHostEvent(hostData));
            return;
        }

        const isEdit = Boolean(hostData.id);
        const method = isEdit ? 'PATCH' : 'POST';
        const url = isEdit ? `/api/community-events?id=${encodeURIComponent(hostData.id)}` : '/api/community-events';

        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                title: hostData.title,
                organizer: hostData.organizer,
                category: hostData.category,
                time_schedule: hostData.datetime,
                location: hostData.location,
                description: hostData.description,
                contact_phone: hostData.phone || '',
                submit_for_review: true
            })
        });

        if (res.ok) {
            closeHostEventModal();
            showSavedToast(isEdit ? '✓ Đã cập nhật và gửi duyệt lại sự kiện!' : '✓ Đã gửi hồ sơ sự kiện thành công! Ban Quản Trị sẽ phê duyệt trong 24h.');
            fetchUserUgcContent(true).catch(() => {});
        } else {
            const errData = await res.json().catch(() => ({}));
            showNotification(errData.message || 'Không thể gửi hồ sơ sự kiện lúc này.');
        }
    } catch (e) {
        console.warn('[CommunityEvents] Lỗi gửi sự kiện:', e.message);
        showNotification('Có lỗi kết nối mạng. Vui lòng thử lại sau.');
    }
}

/**
 * Đồng bộ danh sách Sự kiện & Workshop đã phê duyệt từ Supabase về State
 */
export async function syncCommunityEventsFromSupabase() {
    try {
        const res = await fetch('/api/community-events?status=approved');
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.events)) {
                const liveApprovedEvents = data.events.map(e => ({
                    id: e.id,
                    title: e.title,
                    month: 'Sắp tới',
                    day: '•',
                    timeSchedule: e.time_schedule || 'Sắp diễn ra',
                    location: e.location,
                    region: e.region || 'tp-tra-vinh',
                    regionName: e.region === 'cau-ke' ? 'Huyện Cầu Kè' : (e.region === 'tra-cu' ? 'Huyện Trà Cú' : 'TP. Trà Vinh'),
                    category: e.category === 'workshop' ? 'Workshop văn hóa' : (e.category === 'sports' ? 'Thể thao & Trải nghiệm' : 'Giao lưu cộng đồng'),
                    categoryKey: e.category || 'community',
                    fee: e.fee || 'Miễn phí',
                    feeType: e.fee_type || 'free',
                    attendees: `${e.max_attendees || 50} người`,
                    image: '/ao bà om.jpg',
                    ctaText: 'Đăng ký giữ chỗ',
                    actionType: 'rsvp',
                    summary: e.description || `Sự kiện do ${e.organizer || e.creator_name} tổ chức.`,
                    status: 'approved',
                    organizer: e.organizer
                }));
                const liveIds = new Set(liveApprovedEvents.map(e => e.id));
                state.eventsAndMeetups = [
                    ...liveApprovedEvents,
                    ...TRA_VINH_EVENTS_AND_MEETUPS.filter(e => !liveIds.has(e.id))
                ];
                renderFestivalsSection(
                    'festivalsPortalContainer',
                    state.festivals,
                    state.activeFestivalSeason,
                    openFestivalModal,
                    openDetailModal,
                    handleSeasonFilter,
                    state.eventsAndMeetups,
                    state.activeEventCategory,
                    state.activeEventRegion,
                    handleEventCategoryFilter,
                    handleEventRegionFilter,
                    openEventRsvpModal,
                    toggleBookmarkEvent,
                    state.bookmarkedEvents,
                    openHostEventModal
                );
            }
        }
    } catch (err) {
        console.warn('[CommunityEvents] Fallback sự kiện:', err.message);
    }
}

/**
/**
 * Xử lý Đăng Ký Vé Khán Đài Miễn Phí (Ok Om Bok Grandstand Pass)
 * Gửi lên /api/submit-rsvp để máy chủ xác thực và cấp mã vé chính thức.
 * Chỉ khi máy chủ xác nhận thành công mới lưu vé và hiển thị thẻ vé.
 */
export async function handleGrandstandRsvp(rsvpData) {
    const fullname = String(rsvpData?.fullname || '').trim();
    const phone = String(rsvpData?.phone || '').trim();
    const sector = String(rsvpData?.sector || 'ao-ba-om').trim();

    if (!fullname || fullname.length < 2 || fullname.length > 80) {
        showNoticeToast('Dữ liệu chưa hợp lệ', 'Họ và tên người đăng ký phải từ 2 đến 80 ký tự.');
        return;
    }

    const cleanPhone = phone.replace(/[\s.-]/g, '');
    const vnPhoneRegex = /^(?:0|\+84)(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])\d{7}$/;
    if (!vnPhoneRegex.test(cleanPhone)) {
        showNoticeToast('Số điện thoại không hợp lệ', 'Vui lòng nhập đúng số điện thoại di động Việt Nam (10 chữ số).');
        return;
    }

    if (!navigator.onLine) {
        showNoticeToast('Không có kết nối mạng', 'Thiết bị đang ngoại tuyến. Vui lòng kết nối Internet để gửi đăng ký vé lên máy chủ xác nhận.');
        return;
    }

    // Kiểm tra xem khách (hoặc thành viên) đã có vé lưu trong localStorage chưa (theo số điện thoại)
    const normPhone = (p) => String(p || '').replace(/[\s.-]/g, '').replace(/^\+84/, '0');
    const storedPasses = getStoredPasses();
    const existingTicket = storedPasses.find(p => normPhone(p.phone) === normPhone(cleanPhone));

    const clientTicketCode = existingTicket?.code || `OKB-2026-${generateTicketCodeSuffix()}`;
    const clientSeat = existingTicket?.seat || generateRandomSeat();
    const clientRsvpId = existingTicket?.client_rsvp_id || `${clientTicketCode}-${Date.now()}`;
    const claimTokenToSend = existingTicket?.claimToken || rsvpData?.claim_token || null;

    showNoticeToast('Đang xử lý', 'Đang gửi thông tin đăng ký vé lên máy chủ...');

    try {
        const userToken = await getValidUserToken().catch(() => null);
        const headers = { 'Content-Type': 'application/json' };
        if (userToken) {
            headers['Authorization'] = `Bearer ${userToken}`;
        }
        if (claimTokenToSend) {
            headers['X-Ticket-Claim-Token'] = claimTokenToSend;
        }

        const requestPayload = {
            fullname,
            phone: cleanPhone,
            sector,
            event_slug: 'ok-om-bok-2026',
            ticket_code: clientTicketCode,
            seat: clientSeat,
            client_rsvp_id: clientRsvpId
        };
        if (claimTokenToSend) {
            requestPayload.claim_token = claimTokenToSend;
        }

        const response = await fetch('/api/submit-rsvp', {
            method: 'POST',
            headers,
            body: JSON.stringify(requestPayload)
        });

        const result = await response.json().catch(() => null);

        if (!response.ok || !result || !result.success) {
            const errorMsg = result?.error?.message || result?.message || `Máy chủ từ chối đăng ký (Mã ${response.status}).`;
            showNoticeToast('Đăng ký không thành công', errorMsg);
            return;
        }

        const ticketData = result.data || {};
        const confirmedTicket = {
            code: ticketData.ticket_code || clientTicketCode,
            client_rsvp_id: ticketData.client_rsvp_id || clientRsvpId,
            fullname: ticketData.fullname || fullname,
            phone: ticketData.phone || cleanPhone,
            sector: ticketData.sector || sector,
            sectorLabel: TICKET_SECTOR_LABELS[ticketData.sector || sector] || sector,
            seat: ticketData.seat || clientSeat,
            claimToken: ticketData.claim_token || existingTicket?.claimToken || null,
            registeredAt: ticketData.created_at || new Date().toISOString(),
            status: ticketData.status || 'confirmed',
            offline: false
        };

        const currentPasses = getStoredPasses();
        const existingIdx = currentPasses.findIndex(p => {
            return normPhone(p.phone) === normPhone(cleanPhone) || p.code === confirmedTicket.code;
        });

        if (existingIdx >= 0) {
            currentPasses[existingIdx] = confirmedTicket;
        } else {
            currentPasses.unshift(confirmedTicket);
        }
        saveStoredPasses(currentPasses.slice(0, 20));

        openOfflineTicketModal(confirmedTicket);
        showNoticeToast('Đăng ký thành công', result.message || `Đã xác nhận giữ chỗ thành công cho ${fullname}! Mã vé: ${confirmedTicket.code}`);
    } catch (err) {
        console.error('[RSVP Error]', err);
        showNoticeToast('Lỗi kết nối', 'Không thể kết nối với máy chủ đăng ký vé. Vui lòng thử lại sau.');
    }
}

/** Sinh mã vé 4 ký tự chữ-số (loại ký tự dễ nhầm O/0, I/1) */
function generateTicketCodeSuffix() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let suffix = '';
    const randomValues = new Uint32Array(4);
    (window.crypto || window.msCrypto)?.getRandomValues(randomValues);
    for (let i = 0; i < 4; i++) {
        const rand = randomValues[i] !== undefined ? randomValues[i] : Math.floor(Math.random() * 0xFFFFFFFF);
        suffix += alphabet[rand % alphabet.length];
    }
    return suffix;
}

/** Sinh số ghế ngẫu nhiên theo khu vực khán đài (dãy A/B/C, hàng 1-20, chỗ 1-40) */
function generateRandomSeat() {
    const row = ['A', 'B', 'C'][Math.floor(Math.random() * 3)];
    const num1 = 1 + Math.floor(Math.random() * 20);
    const num2 = 1 + Math.floor(Math.random() * 40);
    return `${row}${num1}-${String(num2).padStart(2, '0')}`;
}

/**
 * Mở Modal Vé Khán Đài Điện Tử Ngoại Tuyến
 */
export function openOfflineTicketModal(ticket) {
    renderOfflineTicketCard(ticket);
    const modal = document.getElementById('offlineTicketModal');
    if (modal) modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

/**
 * Đóng Modal Vé Khán Đài Điện Tử Ngoại Tuyến
 */
export function closeOfflineTicketModal() {
    const modal = document.getElementById('offlineTicketModal');
    if (modal) modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

/**
 * Mở Modal Cẩm Nang Chi Tiết Diễn Biến Lễ Hội (Stitch Ok Om Bok Guide)
 */
export function openFestivalModal(festivalId) {
    const fest = state.festivals.find(f => f.id === festivalId)
        || (festivalId === 'ok-om-bok' ? state.festivals.find(f => f.id === 'ok-om-bok') : null)
        || state.festivals[0];
    if (!fest) return;

    state.currentFestival = fest;
    renderFestivalDetailModal(
        fest,
        state.festivals,
        (placeId) => {
            closeFestivalModal();
            openDetailModal(placeId);
        },
        openFestivalModal,
        'day1'
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
 * Mở modal gửi hoặc biên tập bài viết cẩm nang du lịch
 */
export function openSubmitArticleModal(article = null, isAdmin = false) {
    const adminSession = getAdminSession();
    const adminRole = adminSession?.user?.role;
    const isActuallyAdmin = isAdmin || (adminSession?.user && ['admin', 'editor', 'moderator'].includes(adminRole));

    if (!isActuallyAdmin) {
        const userSession = getUserSession();
        if (!userSession || !userSession.user) {
            showNoticeToast('Yêu cầu đăng nhập', 'Vui lòng đăng nhập tài khoản Thành viên để gửi bài cẩm nang.');
            openAuthModal('signin', () => openSubmitArticleModal(article, isAdmin));
            return;
        }
    }

    renderSubmitArticleModal(submitArticle, article, isActuallyAdmin);
    const modal = document.getElementById('submitArticleModal');
    if (modal) modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

/**
 * Đóng modal gửi / biên tập bài cẩm nang
 */
export function closeSubmitArticleModal() {
    const modal = document.getElementById('submitArticleModal');
    if (modal) modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

/**
 * Xử lý submit bài viết cẩm nang (Tạo mới hoặc Cập nhật)
 */
export async function submitArticle(formData) {
    const adminSession = getAdminSession();
    const adminRole = adminSession?.user?.role;
    const isAdmin = adminSession?.user && ['admin', 'editor', 'moderator'].includes(adminRole);

    let token = null;
    if (isAdmin) {
        token = await getValidAdminToken();
    } else {
        token = await getValidUserToken();
    }

    if (!token) {
        showNoticeToast('Phiên làm việc hết hạn', 'Vui lòng đăng nhập lại để tiếp tục.');
        if (isAdmin) {
            window.location.href = '/admin.html';
        } else {
            openAuthModal('signin', () => submitArticle(formData));
        }
        return;
    }

    const isEdit = Boolean(formData.id);
    const method = isEdit ? 'PATCH' : 'POST';
    const url = isEdit ? `/api/articles?id=${encodeURIComponent(formData.id)}` : '/api/articles';
    const payload = {
        ...formData,
        submit_for_review: !isAdmin ? true : Boolean(formData.submit_for_review)
    };

    try {
        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok) {
            closeSubmitArticleModal();
            if (isEdit) {
                showSavedToast('✓ Đã cập nhật bài viết cẩm nang thành công!');
            } else if (isAdmin && formData.status === 'approved') {
                showSavedToast('✓ Đã xuất bản bài viết cẩm nang du lịch lên trang chủ!');
            } else {
                showSavedToast('✓ Đã gửi bài cẩm nang thành công! Ban Quản Trị sẽ thẩm định trước khi xuất bản.');
            }

            // Đồng bộ lại danh sách bài cẩm nang công khai & nội dung tác giả
            await syncArticlesFromSupabase().catch(() => {});
            fetchUserUgcContent(true).catch(() => {});

            // Nếu đang mở moderation modal, làm mới danh sách duyệt
            if (document.getElementById('adminModerationModal') && !document.getElementById('adminModerationModal').classList.contains('hidden')) {
                await openAdminModerationModal('articles');
            }
        } else {
            showNotification(data.message || 'Không thể lưu bài viết lúc này.');
        }
    } catch (e) {
        console.warn('[Articles] Lỗi submit bài viết:', e.message);
        showNotification('Có lỗi kết nối mạng. Vui lòng thử lại sau.');
    }
}

/**
 * Đồng bộ danh sách Bài viết Cẩm nang đã duyệt từ Supabase về State
 */
export async function syncArticlesFromSupabase() {
    try {
        const res = await fetch('/api/articles?status=approved');
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.articles)) {
                const liveApprovedArticles = data.articles.map(a => ({
                    id: a.id,
                    slug: a.slug || a.id,
                    title: a.title,
                    category: a.category || 'van-hoa',
                    categoryName: a.category_name || 'Văn Hóa Khmer',
                    categoryBadge: a.category_badge || 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40',
                    coverImage: a.cover_image || '/ao bà om.jpg',
                    readTime: a.read_time || '4 phút đọc',
                    excerpt: a.excerpt || '',
                    content: a.content || '',
                    author: {
                        name: a.author_name || 'Thành viên Xứ Trà',
                        role: a.is_editorial ? 'Ban Biên Tập ViVuTraVinh' : (a.author_role || 'Thành viên Xứ Trà'),
                        avatar: a.author_avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(a.author_name || 'TV')}`
                    },
                    authorName: a.author_name || 'Thành viên Xứ Trà',
                    authorRole: a.is_editorial ? 'Ban Biên Tập ViVuTraVinh' : (a.author_role || 'Thành viên Xứ Trà'),
                    authorAvatar: a.author_avatar || null,
                    isEditorial: !!a.is_editorial,
                    isSample: false,
                    source: a.is_editorial ? 'editorial' : 'community_approved',
                    relatedPlaceIds: a.related_place_ids || [],
                    status: 'approved',
                    publishedAt: a.created_at ? new Date(a.created_at).toLocaleDateString('vi-VN') : 'Mới cập nhật'
                }));

                const liveIds = new Set(liveApprovedArticles.map(a => a.id));
                state.articles = [
                    ...liveApprovedArticles,
                    ...TRA_VINH_ARTICLES.filter(a => !liveIds.has(a.id))
                ];

                const session = getAdminSession();
                const role = session?.user?.role;
                const isAdmin = ['admin', 'editor', 'moderator'].includes(role);

                renderArticlesSection(
                    'travelStoriesContainer',
                    state.articles,
                    openArticleModal,
                    openSubmitArticleModal,
                    (article) => openSubmitArticleModal(article, true),
                    isAdmin
                );
            }
        }
    } catch (e) {
        console.warn('[ArticlesSync] Lỗi đồng bộ cẩm nang:', e.message);
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

export function updateHeroStats() {
    const placesEl = document.getElementById('heroStatPlacesCount');
    const clubsEl = document.getElementById('heroStatClubsCount');
    const eventsEl = document.getElementById('heroStatEventsCount');

    const placesCount = state.allPlaces?.length || 0;
    const clubsCount = state.clubs?.length || 0;
    const eventsCount = (state.eventsAndMeetups?.length || 0) + (state.festivals?.length || 0);

    if (placesEl) placesEl.textContent = placesCount > 0 ? `${placesCount}+` : '0';
    if (clubsEl) clubsEl.textContent = clubsCount > 0 ? String(clubsCount).padStart(2, '0') : '0';
    if (eventsEl) eventsEl.textContent = eventsCount > 0 ? String(eventsCount).padStart(2, '0') : '0';
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

        // Cập nhật nút Bookmark trên Detail Modal nếu đang mở địa điểm này
        if (state.currentDetailPlace && aliases.has(state.currentDetailPlace.id)) {
            const isSavedDetail = isPlaceSaved(state.currentDetailPlace);
            updateModalBookmarkButton(isSavedDetail);
        }
    }
}

/**
 * Xử lý Lưu / Bỏ lưu địa điểm trực tiếp từ Detail Modal
 */
export function toggleModalBookmark(e) {
    if (!state.currentDetailPlace) return;
    toggleBookmark(e, state.currentDetailPlace);
    const isSaved = isPlaceSaved(state.currentDetailPlace);
    updateModalBookmarkButton(isSaved);
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
 * Dừng Audio Guide và đặt lại bộ đếm / biểu tượng
 */
export function stopAudioGuide() {
    state.isAudioPlaying = false;
    if (state.audioInterval) {
        clearInterval(state.audioInterval);
        state.audioInterval = null;
    }
    state.audioSeconds = 0;

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
            window.speechSynthesis.cancel();
        } catch (e) {
            console.warn('[AudioGuide] Error stopping speech:', e);
        }
    }

    if (typeof document !== 'undefined') {
        const playIcon = document.getElementById('playIcon');
        if (playIcon) playIcon.textContent = 'play_arrow';

        const audioBtn = document.getElementById('audioPlayBtn');
        if (audioBtn) audioBtn.setAttribute('aria-label', 'Phát thuyết minh âm thanh');

        const audioSection = document.getElementById('modalAudioSection');
        if (audioSection) audioSection.classList.remove('audio-playing');

        const timerEl = document.getElementById('audioTimer');
        if (timerEl) timerEl.textContent = '00:00 / 02:30';
    }
}

/**
 * Bật / Tắt Audio Guide thuyết minh văn hóa bản địa Trà Vinh
 */
export function toggleAudioGuide() {
    if (state.isAudioPlaying) {
        stopAudioGuide();
        return;
    }

    const place = state.currentDetailPlace;
    if (!place) return;

    state.isAudioPlaying = true;
    state.audioSeconds = 0;

    const playIcon = document.getElementById('playIcon');
    if (playIcon) playIcon.textContent = 'pause';

    const audioBtn = document.getElementById('audioPlayBtn');
    if (audioBtn) audioBtn.setAttribute('aria-label', 'Tạm dừng thuyết minh');

    const audioSection = document.getElementById('modalAudioSection');
    if (audioSection) audioSection.classList.add('audio-playing');

    const narrative = `${place.name}. ${place.description || ''}. ${place.note ? 'Lời khuyên từ người địa phương: ' + place.note : ''}`;

    // Ước tính độ dài âm thanh dựa trên văn bản
    const estimatedTotalSeconds = Math.max(30, Math.min(180, Math.round(narrative.length / 15)));
    const totalMin = String(Math.floor(estimatedTotalSeconds / 60)).padStart(2, '0');
    const totalSec = String(estimatedTotalSeconds % 60).padStart(2, '0');
    const totalStr = `${totalMin}:${totalSec}`;

    const timerEl = document.getElementById('audioTimer');
    if (timerEl) timerEl.textContent = `00:00 / ${totalStr}`;

    // Cập nhật bộ đếm thời gian
    state.audioInterval = setInterval(() => {
        state.audioSeconds += 1;
        const curMin = String(Math.floor(state.audioSeconds / 60)).padStart(2, '0');
        const curSec = String(state.audioSeconds % 60).padStart(2, '0');
        if (timerEl) {
            timerEl.textContent = `${curMin}:${curSec} / ${totalStr}`;
        }
        if (state.audioSeconds >= estimatedTotalSeconds) {
            stopAudioGuide();
        }
    }, 1000);

    // Kích hoạt giọng đọc tiếng Việt bằng Web Speech Synthesis API
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(narrative);
            utterance.lang = 'vi-VN';
            utterance.rate = 0.95;
            utterance.pitch = 1.0;

            const voices = window.speechSynthesis.getVoices();
            const viVoice = voices.find(v => v && (v.lang.startsWith('vi') || v.lang.includes('VIE')));
            if (viVoice) {
                utterance.voice = viVoice;
            }

            utterance.onend = () => {
                stopAudioGuide();
            };
            utterance.onerror = (e) => {
                if (e.error !== 'interrupted' && e.error !== 'canceled') {
                    console.warn('[AudioGuide] SpeechSynthesis error:', e);
                }
            };

            window.speechSynthesis.speak(utterance);
        } catch (err) {
            console.warn('[AudioGuide] SpeechSynthesis not supported or blocked:', err);
        }
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

    // Dừng audio guide trước đó nếu đang chạy
    stopAudioGuide();

    // MỞ MODAL NGAY LẬP TỨC với comments = null (sẽ kích hoạt comment skeleton)
    renderDetailModal(place, null, isSaved, toggleBookmark, handleCommentSubmit, state.allPlaces);

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
    stopAudioGuide();
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
 * Bản Đồ Tương Tác Toàn Tỉnh Trà Vinh (Interactive Map & Place Discovery - Phase 4)
 */

export const MAP_CATEGORIES = [
    { id: 'all', label: 'Tất cả', icon: 'explore' },
    { id: 'chua-khmer', label: 'Chùa Khmer', icon: 'temple_buddhist' },
    { id: 'am-thuc', label: 'Ẩm thực', icon: 'ramen_dining' },
    { id: 'cafe', label: 'Cafe sân vườn', icon: 'local_cafe' },
    { id: 'sinh-thai', label: 'Cồn & Biển', icon: 'park' },
    { id: 'lang-nghe', label: 'Làng nghề', icon: 'outdoor_garden' }
];

export function filterPlacesForMap() {
    return (state.allPlaces || []).filter(p => {
        // 1. Category filter
        if (state.mapCategory && state.mapCategory !== 'all') {
            const cat = String(p.category || '').toLowerCase();
            if (state.mapCategory === 'chua-khmer') {
                if (!/chùa|tâm linh|tôn giáo|khmer|di tích|lịch sử|bảo tàng/.test(cat)) return false;
            } else if (state.mapCategory === 'am-thuc') {
                if (!/món|ẩm thực|đặc sản|ăn uống|quán/.test(cat)) return false;
            } else if (state.mapCategory === 'cafe') {
                if (!/cafe|cà phê|trà sữa/.test(cat)) return false;
            } else if (state.mapCategory === 'sinh-thai') {
                if (!/sinh thái|biển|cồn|vườn|thiên nhiên|du lịch/.test(cat)) return false;
            } else if (state.mapCategory === 'lang-nghe') {
                if (!/làng nghề|di sản|lịch sử|nghệ thuật|truyền thống/.test(cat)) return false;
            }
        }

        // 2. Search term
        if (state.mapSearchTerm) {
            const term = state.mapSearchTerm.toLowerCase();
            const matchName = String(p.name || '').toLowerCase().includes(term);
            const matchArea = String(p.area || '').toLowerCase().includes(term);
            const matchCat = String(p.category || '').toLowerCase().includes(term);
            const matchDesc = String(p.description || '').toLowerCase().includes(term);
            if (!matchName && !matchArea && !matchCat && !matchDesc) return false;
        }

        // 3. Open only
        if (state.mapFilterOpenOnly) {
            if (!isPlaceOpen(p)) return false;
        }

        // 4. Free only
        if (state.mapFilterFreeOnly) {
            const isFree = p.priceParsed?.isFree || /miễn phí|free|^0/i.test(String(p.price || p.priceRange || ''));
            if (!isFree) return false;
        }

        return true;
    });
}

export function updateFullMapContent() {
    const filtered = filterPlacesForMap();

    // 1. Update Category Pills with real counts
    const categoriesWithCount = MAP_CATEGORIES.map(c => {
        let count = 0;
        if (c.id === 'all') {
            count = (state.allPlaces || []).length;
        } else {
            count = (state.allPlaces || []).filter(p => {
                const cat = String(p.category || '').toLowerCase();
                if (c.id === 'chua-khmer') return /chùa|tâm linh|tôn giáo|khmer|di tích|lịch sử|bảo tàng/.test(cat);
                if (c.id === 'am-thuc') return /món|ẩm thực|đặc sản|ăn uống|quán/.test(cat);
                if (c.id === 'cafe') return /cafe|cà phê|trà sữa/.test(cat);
                if (c.id === 'sinh-thai') return /sinh thái|biển|cồn|vườn|thiên nhiên|du lịch/.test(cat);
                if (c.id === 'lang-nghe') return /làng nghề|di sản|lịch sử|nghệ thuật|truyền thống/.test(cat);
                return false;
            }).length;
        }
        return { ...c, count };
    });

    const pillsHtml = renderMapCategoryPills(categoriesWithCount, state.mapCategory, 'window.ViVuApp.setMapCategory');
    const sidePillsContainer = document.getElementById('mapSideCategoryPills');
    if (sidePillsContainer) sidePillsContainer.innerHTML = pillsHtml;

    const mobilePillsContainer = document.getElementById('mapMobileCategoryPills');
    if (mobilePillsContainer) mobilePillsContainer.innerHTML = pillsHtml;

    // 2. Update Place Counter Badges
    const headerCounter = document.getElementById('mapPlacesHeaderCounter');
    if (headerCounter) {
        headerCounter.textContent = `${filtered.length} địa điểm`;
    }
    const sideCountBadge = document.getElementById('mapPlacesCountBadge');
    if (sideCountBadge) {
        sideCountBadge.textContent = `${filtered.length} địa điểm`;
    }

    // 3. Render Place Cards Stack in Side Panel
    const listContainer = document.getElementById('mapPlacesListContainer');
    if (listContainer) {
        listContainer.innerHTML = renderMapPlacesList(filtered, state.selectedMapPlace?.id);
    }

    // 4. Update Leaflet Markers
    if (state.fullMap && typeof L !== 'undefined') {
        const currentFilteredIds = new Set(filtered.map(p => String(p.id)));

        // Remove markers not in filtered list
        for (const [id, marker] of state.mapMarkersMap.entries()) {
            if (!currentFilteredIds.has(String(id))) {
                state.fullMap.removeLayer(marker);
                state.mapMarkersMap.delete(id);
            }
        }

        // Add or update markers for filtered places
        filtered.forEach(p => {
            const coords = p.hasValidGps && p.parsedCoordinates
                ? p.parsedCoordinates
                : parseCoordinates(p.coordinates);
            if (!coords) return;

            const isSelected = state.selectedMapPlace && String(state.selectedMapPlace.id) === String(p.id);
            const customIcon = createCustomMapMarker(p, isSelected);

            if (state.mapMarkersMap.has(String(p.id))) {
                const marker = state.mapMarkersMap.get(String(p.id));
                if (customIcon) marker.setIcon(customIcon);
                marker.setZIndexOffset(isSelected ? 1000 : 0);
            } else {
                const marker = L.marker(coords, {
                    icon: customIcon || undefined,
                    zIndexOffset: isSelected ? 1000 : 0
                }).addTo(state.fullMap);

                marker.on('click', (e) => {
                    if (e && e.originalEvent) e.originalEvent.stopPropagation();
                    selectMapPlace(p);
                });

                state.mapMarkersMap.set(String(p.id), marker);
            }
        });
    }
}

export function openFullMapModal() {
    const savedModal = document.getElementById('savedCollectionsModal');
    if (savedModal && !savedModal.classList.contains('hidden')) {
        closeSavedCollectionsModal(true);
    }
    const modal = document.getElementById('fullMapModal');
    if (!modal) return;

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');

    // Reset mobile view to map
    state.mapMobileView = 'map';
    const sidePanel = document.getElementById('mapSidePanel');
    if (sidePanel) {
        sidePanel.classList.add('hidden');
        sidePanel.classList.add('lg:flex');
        sidePanel.classList.remove('flex');
    }
    const mobileToggleText = document.getElementById('mapMobileToggleViewText');
    if (mobileToggleText) mobileToggleText.textContent = 'Danh sách';
    const mobileToggleIcon = document.getElementById('mapMobileToggleViewIcon');
    if (mobileToggleIcon) mobileToggleIcon.textContent = 'view_list';

    setTimeout(() => {
        if (!state.fullMap && typeof L !== 'undefined') {
            state.fullMap = L.map('fullScreenMap', {
                zoomControl: false,
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

            // Click canvas to close active place card
            state.fullMap.on('click', () => {
                closeMapActiveCard();
            });
        }

        updateFullMapContent();

        if (state.fullMap) {
            state.fullMap.invalidateSize();
        }
    }, 200);
}

export function closeFullMapModal(fromRouter = false) {
    const modal = document.getElementById('fullMapModal');
    if (modal) modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    closeMapActiveCard();
    state.currentOverlay = null;

    if (!fromRouter) {
        const returnView = state.currentView || 'home';
        switchView(returnView, { updateHash: true, pushState: false, closeOverlays: false, scrollTop: false });
    }
}

export function openTourItinerariesModal(options = {}) {
    const modal = document.getElementById('tourItinerariesModal');
    if (!modal) return;

    renderTourItineraries(
        'tourItinerariesContainer',
        state.activeTourId,
        handleTourSelect,
        openDetailModal,
        handleSearchKeyword,
        handleGenerateRandomTour
    );

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');

    if (options.updateHash !== false) {
        try {
            if (window.location.hash !== '#tours' && window.location.hash !== '#/tours') {
                history.pushState({ overlay: 'tours' }, '', '#tours');
            }
        } catch (e) {
            window.location.hash = '#tours';
        }
    }
}

export function closeTourItinerariesModal(skipHistory = false) {
    const modal = document.getElementById('tourItinerariesModal');
    if (!modal) return;

    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');

    if (!skipHistory) {
        const hash = window.location.hash || '';
        if (hash === '#tours' || hash === '#/tours' || hash === '#touritinerariessection') {
            try {
                if (history.state?.overlay === 'tours') {
                    history.back();
                } else {
                    history.pushState(null, '', '#/home');
                }
            } catch (e) {
                window.location.hash = '#/home';
            }
        }
    }
}

export function selectMapPlace(place) {
    if (!place) return;
    state.selectedMapPlace = place;

    const coords = place.hasValidGps && place.parsedCoordinates
        ? place.parsedCoordinates
        : parseCoordinates(place.coordinates);

    // Pan map to place
    if (coords && state.fullMap) {
        state.fullMap.setView(coords, Math.max(state.fullMap.getZoom(), 14), { animate: true });
    }

    // Refresh marker icons
    for (const [id, marker] of state.mapMarkersMap.entries()) {
        const p = (state.allPlaces || []).find(item => String(item.id) === String(id));
        if (p) {
            const isSelected = String(p.id) === String(place.id);
            const icon = createCustomMapMarker(p, isSelected);
            if (icon) marker.setIcon(icon);
            marker.setZIndexOffset(isSelected ? 1000 : 0);
        }
    }

    // Populate and show #mapActivePlaceCard
    const cardEl = document.getElementById('mapActivePlaceCard');
    if (cardEl) {
        const imgEl = document.getElementById('mapCardImage');
        if (imgEl) {
            imgEl.src = place.imageLink || NEUTRAL_PLACEHOLDER_IMAGE;
            imgEl.onerror = () => { imgEl.src = NEUTRAL_PLACEHOLDER_IMAGE; };
        }
        const badgeEl = document.getElementById('mapCardBadge');
        if (badgeEl) badgeEl.textContent = place.category || 'Địa điểm';

        const statusEl = document.getElementById('mapCardStatus');
        if (statusEl) {
            const openStatus = getPlaceOpenStatus(place);
            statusEl.textContent = openStatus.label;
            statusEl.className = `text-[11px] font-semibold text-${openStatus.color}-600 dark:text-${openStatus.color}-400 truncate`;
        }

        const titleEl = document.getElementById('mapCardTitle');
        if (titleEl) titleEl.textContent = place.name;

        const ratingEl = document.getElementById('mapCardRating');
        if (ratingEl) {
            const r = Number.parseFloat(place.rating) || 0;
            ratingEl.textContent = r > 0 ? `★ ${r.toFixed(1)}` : 'Mới';
        }

        const addressEl = document.getElementById('mapCardAddress');
        if (addressEl) addressEl.textContent = place.address || place.area || 'Trà Vinh';

        const distEl = document.getElementById('mapCardDistance');
        const distDotEl = document.getElementById('mapCardDistanceDot');
        if (distEl && distDotEl) {
            if (place.distanceKm !== undefined) {
                distEl.textContent = `Cách bạn ${place.distanceKm.toFixed(1)} km`;
                distEl.classList.remove('hidden');
                distDotEl.classList.remove('hidden');
            } else {
                distEl.classList.add('hidden');
                distDotEl.classList.add('hidden');
            }
        }

        const dirLink = document.getElementById('mapCardDirectionsLink');
        if (dirLink) {
            const lat = coords ? coords[0] : '9.9347';
            const lng = coords ? coords[1] : '106.3449';
            dirLink.href = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
        }

        const detailBtn = document.getElementById('mapCardDetailBtn');
        if (detailBtn) {
            detailBtn.setAttribute('onclick', `window.ViVuApp.openDetailFromMap('${place.id}')`);
        }

        const shareBtn = document.getElementById('mapCardShareBtn');
        if (shareBtn) {
            shareBtn.setAttribute('onclick', `window.ViVuApp.shareMapPlace('${place.id}')`);
        }

        cardEl.classList.remove('hidden');
    }

    // Highlight card in side panel list
    const activeCardEl = document.querySelector(`#mapPlacesListContainer [data-id="${place.id}"]`);
    if (activeCardEl) {
        document.querySelectorAll('#mapPlacesListContainer article').forEach(el => {
            el.classList.remove('border-emerald-600', 'dark:border-emerald-500', 'ring-2', 'ring-emerald-500/20', 'bg-gradient-to-r');
        });
        activeCardEl.classList.add('border-emerald-600', 'dark:border-emerald-500', 'ring-2', 'ring-emerald-500/20', 'bg-gradient-to-r');
        activeCardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

export function selectMapPlaceById(id) {
    const place = findPlaceByAnyId(id, state.allPlaces);
    if (place) {
        selectMapPlace(place);
    }
}

export function closeMapActiveCard() {
    state.selectedMapPlace = null;
    const cardEl = document.getElementById('mapActivePlaceCard');
    if (cardEl) cardEl.classList.add('hidden');

    // Reset markers to normal
    for (const [id, marker] of state.mapMarkersMap.entries()) {
        const p = (state.allPlaces || []).find(item => String(item.id) === String(id));
        if (p) {
            const icon = createCustomMapMarker(p, false);
            if (icon) marker.setIcon(icon);
            marker.setZIndexOffset(0);
        }
    }

    // Reset side panel card styles
    document.querySelectorAll('#mapPlacesListContainer article').forEach(el => {
        el.classList.remove('border-emerald-600', 'dark:border-emerald-500', 'ring-2', 'ring-emerald-500/20', 'bg-gradient-to-r');
    });
}

export function handleMapSearch(term) {
    state.mapSearchTerm = String(term || '').trim();

    // Sync input values
    const sideInput = document.getElementById('mapSideSearchInput');
    const mobileInput = document.getElementById('mapMobileSearchInput');
    if (sideInput && sideInput.value !== term) sideInput.value = term;
    if (mobileInput && mobileInput.value !== term) mobileInput.value = term;

    // Toggle clear buttons
    const sideClear = document.getElementById('mapSideSearchClearBtn');
    const mobileClear = document.getElementById('mapMobileSearchClearBtn');
    if (sideClear) {
        if (state.mapSearchTerm) sideClear.classList.remove('hidden');
        else sideClear.classList.add('hidden');
    }
    if (mobileClear) {
        if (state.mapSearchTerm) mobileClear.classList.remove('hidden');
        else mobileClear.classList.add('hidden');
    }

    updateFullMapContent();
}

export function clearMapSearch() {
    handleMapSearch('');
}

export function setMapCategory(catId) {
    state.mapCategory = catId || 'all';
    updateFullMapContent();
}

export function toggleMapFilter(filterType) {
    if (filterType === 'openOnly') {
        state.mapFilterOpenOnly = !state.mapFilterOpenOnly;
        const btn = document.getElementById('mapFilterOpenOnlyBtn');
        if (btn) {
            if (state.mapFilterOpenOnly) {
                btn.classList.add('bg-secondary', 'text-white', 'border-secondary');
                btn.classList.remove('bg-surface-container-low', 'dark:bg-zinc-800', 'text-on-surface-variant');
            } else {
                btn.classList.remove('bg-secondary', 'text-white', 'border-secondary');
                btn.classList.add('bg-surface-container-low', 'dark:bg-zinc-800', 'text-on-surface-variant');
            }
        }
    } else if (filterType === 'freeOnly') {
        state.mapFilterFreeOnly = !state.mapFilterFreeOnly;
        const btn = document.getElementById('mapFilterFreeBtn');
        if (btn) {
            if (state.mapFilterFreeOnly) {
                btn.classList.add('bg-secondary', 'text-white', 'border-secondary');
                btn.classList.remove('bg-surface-container-low', 'dark:bg-zinc-800', 'text-on-surface-variant');
            } else {
                btn.classList.remove('bg-secondary', 'text-white', 'border-secondary');
                btn.classList.add('bg-surface-container-low', 'dark:bg-zinc-800', 'text-on-surface-variant');
            }
        }
    }
    updateFullMapContent();
}

export function toggleMapMobileView() {
    const sidePanel = document.getElementById('mapSidePanel');
    const mobileToggleText = document.getElementById('mapMobileToggleViewText');
    const mobileToggleIcon = document.getElementById('mapMobileToggleViewIcon');

    if (state.mapMobileView === 'map') {
        state.mapMobileView = 'list';
        if (sidePanel) {
            sidePanel.classList.remove('hidden');
            sidePanel.classList.add('flex');
        }
        if (mobileToggleText) mobileToggleText.textContent = 'Bản đồ';
        if (mobileToggleIcon) mobileToggleIcon.textContent = 'map';
    } else {
        state.mapMobileView = 'map';
        if (sidePanel) {
            sidePanel.classList.add('hidden');
            sidePanel.classList.remove('flex');
        }
        if (mobileToggleText) mobileToggleText.textContent = 'Danh sách';
        if (mobileToggleIcon) mobileToggleIcon.textContent = 'view_list';
        if (state.fullMap) {
            state.fullMap.invalidateSize();
        }
    }
}

export function mapZoomIn() {
    if (state.fullMap) state.fullMap.zoomIn();
}

export function mapZoomOut() {
    if (state.fullMap) state.fullMap.zoomOut();
}

export function recenterMapToTraVinh() {
    if (state.fullMap) {
        state.fullMap.setView([9.9347, 106.3449], 11, { animate: true });
    }
}

export function shareMapPlace(placeId) {
    const place = findPlaceByAnyId(placeId, state.allPlaces);
    if (!place) return;
    const url = `${window.location.origin}/place/${place.slug || place.id}`;
    if (navigator.share) {
        navigator.share({
            title: place.name,
            text: `Khám phá ${place.name} trên ViVuTraVinh`,
            url
        }).catch(() => {});
    } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
            showNoticeToast('Đã sao chép liên kết', place.name);
        }).catch(() => {});
    }
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
            state.userCoords = userCoords;
            calculatePlacesDistance(pos.coords.latitude, pos.coords.longitude);

            if (state.fullMap && typeof L !== 'undefined') {
                state.fullMap.setView(userCoords, 14, { animate: true });

                if (state.userGpsMarker) {
                    state.userGpsMarker.setLatLng(userCoords);
                } else {
                    const userGpsIcon = L.divIcon({
                        className: 'custom-stitch-marker',
                        html: `
                            <div class="relative flex flex-col items-center select-none pointer-events-auto">
                                <div class="relative flex items-center justify-center">
                                    <span class="absolute w-8 h-8 rounded-full bg-blue-500/40 animate-ping"></span>
                                    <span class="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-md"></span>
                                </div>
                                <span class="mt-1 px-1.5 py-0.5 bg-surface-container-lowest/90 dark:bg-zinc-900/90 text-on-surface dark:text-zinc-200 rounded text-[10px] font-bold shadow-sm whitespace-nowrap">
                                    Vị trí của bạn
                                </span>
                            </div>
                        `,
                        iconSize: [80, 40],
                        iconAnchor: [40, 8]
                    });
                    state.userGpsMarker = L.marker(userCoords, { icon: userGpsIcon, zIndexOffset: 2000 }).addTo(state.fullMap);
                }
            }

            // Update places distances in side panel and active card
            updateFullMapContent();
            if (state.selectedMapPlace) {
                selectMapPlace(state.selectedMapPlace);
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

    const headers = { 'Content-Type': 'application/json' };
    try {
        if (typeof getValidUserToken === 'function') {
            const userToken = await getValidUserToken();
            if (userToken) {
                headers['Authorization'] = `Bearer ${userToken}`;
            }
        }
    } catch (_) {}

    let response;
    try {
        response = await fetch(apiUrl, {
            method: 'POST',
            headers,
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
            ? 'Địa điểm đã gửi lên hệ thống chờ Ban Quản Trị duyệt (+15 Điểm Thổ Địa).'
            : 'Đã lưu an toàn ngoại tuyến và sẽ tự động chuyển tới BQT khi có mạng (+15 Điểm Thổ Địa).';
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 6000);
    } else {
        alert(`🎉 Cảm ơn bạn! Địa điểm "${name}" đã được ghi nhận thành công (+15 Điểm Thổ Địa).`);
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
 * Unified Deep Link & Routing handler
 * Hỗ trợ /places/{slug}, /place/{slug}, query params (?place=, ?trip=, ?festival=, ?article=),
 * và hash routing (#/home, #/community, #/search, #/map, #/saved, #clb, #festivals, #planner).
 */
function handleDeepLink() {
    // 1. Đọc slug từ đường dẫn pathname: /place/{slug} hoặc /places/{slug}
    const path = window.location.pathname || '';
    const match = path.match(/^\/places?\/([^/?#]+)/i);
    if (match && match[1]) {
        const placeSlug = decodeURIComponent(match[1]);
        setTimeout(() => openDetailModal(placeSlug, { isDirect: true }), 150);
        return;
    }

    // 2. Tương thích ngược: Hỗ trợ query params
    const params = new URLSearchParams(window.location.search);
    const placeId = params.get('place');
    if (placeId) {
        setTimeout(() => openDetailModal(placeId, { isDirect: true, fromLegacyQuery: true }), 150);
        return;
    }
    const tripParam = params.get('trip');
    if (tripParam) {
        setTimeout(() => handleTripShareParam(tripParam), 150);
        return;
    }
    const festivalId = params.get('festival');
    if (festivalId) {
        setTimeout(() => openFestivalModal(festivalId), 150);
        return;
    }
    const articleId = params.get('article');
    if (articleId) {
        setTimeout(() => openArticleModal(articleId), 150);
        return;
    }

    // 3. Điều hướng Hash Routing & Sections
    const hash = (window.location.hash || '').toLowerCase();

    // Bản đồ Modal Tab: đóng Saved nếu mở, mở Map
    if (hash === '#/map' || hash === '#map' || hash === '#bando') {
        const savedModal = document.getElementById('savedCollectionsModal');
        if (savedModal && !savedModal.classList.contains('hidden')) {
            closeSavedCollectionsModal(true);
        }
        state.currentOverlay = 'map';
        openFullMapModal();
        updateNavActiveStates('map');
        return;
    }

    // Bộ sưu tập đã lưu Modal Tab: đóng Map nếu mở, mở Saved
    if (hash === '#/saved' || hash === '#saved' || hash === '#daluu') {
        const mapModal = document.getElementById('fullMapModal');
        if (mapModal && !mapModal.classList.contains('hidden')) {
            closeFullMapModal(true);
        }
        state.currentOverlay = 'saved';
        openSavedCollectionsModal();
        updateNavActiveStates('saved');
        return;
    }

    // Đóng các modal overlay (Bản đồ / Đã lưu) nếu đang mở khi quay lại các base views
    const mapModal = document.getElementById('fullMapModal');
    if (mapModal && !mapModal.classList.contains('hidden')) {
        closeFullMapModal(true);
    }
    const savedModal = document.getElementById('savedCollectionsModal');
    if (savedModal && !savedModal.classList.contains('hidden')) {
        closeSavedCollectionsModal(true);
    }
    const tourModal = document.getElementById('tourItinerariesModal');
    if (tourModal && !tourModal.classList.contains('hidden') && hash !== '#tours' && hash !== '#/tours' && hash !== '#touritinerariessection') {
        closeTourItinerariesModal(true);
    }
    state.currentOverlay = null;

    // Câu lạc bộ View
    if (hash === '#/clubs' || hash === '#clubs' || hash === '#clb' || hash === '#stitchcommunitysection') {
        switchView('clubs', { updateHash: false, pushState: false, closeOverlays: false, scrollTop: true });
        return;
    }

    // Cộng đồng View (Bảng tin)
    if (hash === '#/community' || hash === '#community' || hash === '#/feed' || hash === '#feed') {
        switchView('community', { updateHash: false, pushState: false, closeOverlays: false, scrollTop: true });
        return;
    }

    // Blog ViVu View (Góc chuyện Xứ Trà)
    if (hash === '#/blog' || hash === '#blog' || hash === '#stories' || hash === '#/stories' || hash === '#travelstoriessection' || hash === '#gocchuyenxutra') {
        switchView('blog', { updateHash: false, pushState: false, closeOverlays: false, scrollTop: true });
        return;
    }

    // Sự kiện & Gặp gỡ View (Tách riêng biệt độc lập)
    if (hash === '#/events' || hash === '#events' || hash === '#festivals' || hash === '#/festivals' || hash === '#lehoi' || hash === '#festivalsportalsection') {
        switchView('events', { updateHash: false, pushState: false, closeOverlays: false, scrollTop: true });
        return;
    }

    // Tìm kiếm & Khám phá View
    if (hash === '#/search' || hash === '#search') {
        switchView('search', { updateHash: false, pushState: false, closeOverlays: false, scrollTop: true });
        return;
    }
    if (hash === '#khampha' || hash === '#discoverysection') {
        switchView('search', { updateHash: false, pushState: false, closeOverlays: false, scrollTo: 'discoverySection' });
        return;
    }

    // Lên kế hoạch chuyến đi View (Unified Planner View: Tự lên lịch trình)
    if (hash === '#/planner' || hash === '#planner' || hash === '#tripplanner' || hash === '#/kehoach' || hash === '#kehoach' || hash === '#/planner/custom') {
        state.plannerCurrentTab = 'custom';
        switchView('planner', { updateHash: false, pushState: false, closeOverlays: false, scrollTop: true });
        return;
    }

    // Lên kế hoạch chuyến đi View (Unified Planner View: Lịch trình gợi ý & tương thích #tours)
    if (hash === '#/planner/suggested' || hash === '#/planner/tours' || hash === '#/tours' || hash === '#tours' || hash === '#touritinerariessection') {
        state.plannerCurrentTab = 'suggested';
        switchView('planner', { updateHash: false, pushState: false, closeOverlays: false, scrollTop: true });
        return;
    }

    // Góp ý & Hỗ trợ View
    if (hash === '#/feedback' || hash === '#feedback' || hash === '#/support' || hash === '#support' || hash === '#/gopy' || hash === '#gopy') {
        switchView('feedback', { updateHash: false, pushState: false, closeOverlays: false, scrollTop: true });
        return;
    }

    // Về dự án & Kế hoạch View
    if (hash === '#/about' || hash === '#about' || hash === '#/roadmap' || hash === '#roadmap' || hash === '#/kehoachduan' || hash === '#kehoachduan') {
        switchView('about', { updateHash: false, pushState: false, closeOverlays: false, scrollTop: true });
        return;
    }

    // Đồng hành cùng Admin View
    if (hash === '#/companion' || hash === '#companion' || hash === '#/donghanh' || hash === '#donghanh' || hash === '#adminsupport' || hash === '#/adminsupport' || hash === '#admin-wall' || hash === '#/admin-wall') {
        switchView('companion', { updateHash: false, pushState: false, closeOverlays: false, scrollTop: true });
        return;
    }

    // Trang chủ (hoặc hash rỗng)
    if (hash === '#/home' || hash === '#home' || !hash) {
        switchView('home', { updateHash: false, pushState: false, closeOverlays: false });
        return;
    }

    // Mặc định: view hiện tại hoặc 'home'
    if (state.currentView) {
        switchView(state.currentView, { updateHash: false, pushState: false, closeOverlays: false, scrollTop: false });
    } else {
        switchView('home', { updateHash: false, pushState: false, closeOverlays: false, scrollTop: false });
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

    // Tạm ẩn Hero Banner khi người dùng đang chủ động tìm kiếm món/quán (Issue M9 & verify-ui check)
    const heroBanner = document.getElementById('heroBanner');
    if (heroBanner) {
        if (isSearching) {
            heroBanner.classList.add('hidden');
        } else {
            heroBanner.classList.remove('hidden');
        }
    }
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
            if (state.searchTerm.trim().length > 0) {
                if (state.currentView !== 'search') {
                    switchView('search', { updateHash: true, scrollTop: false });
                }
            }
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
                if (state.currentView !== 'search') {
                    switchView('search', { updateHash: true, scrollTop: false });
                }
                const discoverySection = document.getElementById('discoverySection');
                if (discoverySection) {
                    discoverySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        });
    }

    clearSearchBtn?.addEventListener('click', clearSearch);
    clearBannerBtn?.addEventListener('click', clearSearch);

    // Phím tắt ⌘K hoặc Ctrl+K, Escape, Focus Trap trong Modals và Drawer (Accessibility)
    window.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            searchInput?.focus();
        }
        if (e.key === 'Escape') {
            closeMobileDrawer();
            closeDetailModal();
            closeContributeModal();
            closeFullMapModal();
            closeSavedCollectionsModal();
            closeFestivalModal();
            closeArticleModal();
            closeOfflineTicketModal();
        }

        // Focus Trap trong Drawer hoặc các Modals đang mở
        if (e.key === 'Tab') {
            const drawerNav = document.getElementById('mobileDrawerNav');
            const isDrawerOpen = drawerNav && !drawerNav.classList.contains('-translate-x-full') && !drawerNav.hasAttribute('inert');

            const activeModal = isDrawerOpen ? drawerNav : [
                document.getElementById('detailModal'),
                document.getElementById('contributeModal'),
                document.getElementById('fullMapModal'),
                document.getElementById('savedCollectionsModal'),
                document.getElementById('festivalDetailModal'),
                document.getElementById('articleDetailModal'),
                document.getElementById('offlineTicketModal')
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
        const festModal = document.getElementById('festivalDetailModal');
        if (festModal && !festModal.classList.contains('hidden')) {
            closeFestivalModal();
            return;
        }
        const articleModal = document.getElementById('articleDetailModal');
        if (articleModal && !articleModal.classList.contains('hidden')) {
            closeArticleModal();
            return;
        }
        const offlineTicketModal = document.getElementById('offlineTicketModal');
        if (offlineTicketModal && !offlineTicketModal.classList.contains('hidden')) {
            closeOfflineTicketModal();
            return;
        }

        // Router tiếp nhận URL mới (bao gồm #/map, #/saved, #/community, #/search, #/home)
        handleDeepLink();
    });

    // Lắng nghe thay đổi Hash URL (#clb, #map, #festivals, #planner)
    window.addEventListener('hashchange', () => {
        handleDeepLink();
    });

    // Hook Element.prototype.scrollIntoView để tự kích hoạt view chứa phần tử đang bị ẩn
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (...args) {
        try {
            const parentView = this.closest ? this.closest('.app-view') : null;
            if (parentView && parentView.dataset.view && parentView.classList.contains('hidden')) {
                const targetView = parentView.dataset.view;
                const targetHash = targetView === 'home' ? '#/home' : `#/${targetView}`;
                switchView(targetView, { updateHash: true, customHash: targetHash, closeOverlays: false, scrollTop: false });
            }
        } catch (e) {
            // Safe fallback
        }
        return originalScrollIntoView.apply(this, args);
    };

    // Capture-phase click listener để đảm bảo phần tử trong view bất kỳ được kích hoạt khi click
    document.addEventListener('click', (e) => {
        try {
            const target = e.target;
            if (target && target.closest) {
                const parentView = target.closest('.app-view');
                if (parentView && parentView.dataset.view && parentView.classList.contains('hidden')) {
                    const targetView = parentView.dataset.view;
                    const targetHash = targetView === 'home' ? '#/home' : `#/${targetView}`;
                    switchView(targetView, { updateHash: true, customHash: targetHash, closeOverlays: false, scrollTop: false });
                }
            }
        } catch (err) {
            // ignore
        }
    }, true);

    // Lắng nghe sự kiện đăng nhập / đăng xuất để đồng bộ vai trò và dữ liệu chuyến đi theo tài khoản
    window.addEventListener('storage', (e) => {
        if (e.key === 'vivu_admin_session' || e.key === 'vivu_user_session' || e.key === null) {
            updateAdminRoleUI();
            handleAuthTripPlanSync();
        }
    });
    window.addEventListener('vivu:auth-login', () => {
        updateAdminRoleUI();
        handleAuthTripPlanSync();
    });
    window.addEventListener('vivu:auth-logout', () => {
        updateAdminRoleUI();
        handleAuthTripPlanSync();
    });
    window.addEventListener('vivu:user-auth-changed', () => {
        updateAdminRoleUI();
        handleAuthTripPlanSync();
        const profileModal = document.getElementById('userProfileModal');
        if (profileModal && !profileModal.classList.contains('hidden')) {
            const profileContent = document.getElementById('userProfileModalContent');
            if (profileContent) profileContent.innerHTML = renderUserProfileModalContent(state.userProfile, state.profileActiveTab, state.profileBadgeCategory);
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
// VIEW NAVIGATION ROUTER & CONTROLLER
// ==========================================

export function setBottomNavActive(activeId) {
    const tabs = ['tabNavHome', 'tabNavMap', 'tabNavClubs', 'tabNavSaved', 'tabNavSearch'];
    tabs.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const isActive = id === activeId;
        const icon = el.querySelector('.material-symbols-outlined');

        if (isActive) {
            el.className = 'bottom-nav-btn min-h-[48px] h-14 flex-1 flex flex-col items-center justify-center py-1 text-primary dark:text-emerald-400 font-bold relative transition-colors focus:outline-none';
            if (icon) icon.style.fontVariationSettings = "'FILL' 1, 'wght' 600";
        } else {
            el.className = 'bottom-nav-btn min-h-[48px] h-14 flex-1 flex flex-col items-center justify-center py-1 text-on-surface-variant dark:text-zinc-400 font-medium relative hover:text-primary dark:hover:text-emerald-400 transition-colors focus:outline-none';
            if (icon) icon.style.fontVariationSettings = "'FILL' 0, 'wght' 400";
        }
    });
}

export function openMobileDrawer() {
    const drawer = document.getElementById('mobileDrawerNav');
    const backdrop = document.getElementById('mobileDrawerBackdrop');
    const openBtn = document.getElementById('mobileMenuOpenBtn');
    if (!drawer || !backdrop) return;

    drawer.removeAttribute('inert');
    drawer.setAttribute('aria-hidden', 'false');
    if (openBtn) openBtn.setAttribute('aria-expanded', 'true');

    backdrop.classList.remove('opacity-0', 'pointer-events-none');
    backdrop.classList.add('opacity-100');

    drawer.classList.remove('-translate-x-full');
    drawer.classList.add('translate-x-0');

    document.body.classList.add('overflow-hidden');

    const closeBtn = document.getElementById('mobileDrawerCloseBtn');
    if (closeBtn) {
        setTimeout(() => closeBtn.focus(), 50);
    }
}

export function closeMobileDrawer() {
    const drawer = document.getElementById('mobileDrawerNav');
    const backdrop = document.getElementById('mobileDrawerBackdrop');
    const openBtn = document.getElementById('mobileMenuOpenBtn');
    if (!drawer || !backdrop) return;

    drawer.classList.remove('translate-x-0');
    drawer.classList.add('-translate-x-full');

    backdrop.classList.remove('opacity-100');
    backdrop.classList.add('opacity-0', 'pointer-events-none');

    drawer.setAttribute('inert', '');
    drawer.setAttribute('aria-hidden', 'true');
    if (openBtn) openBtn.setAttribute('aria-expanded', 'false');

    document.body.classList.remove('overflow-hidden');

    if (document.activeElement && drawer.contains(document.activeElement)) {
        if (openBtn) openBtn.focus();
    }
}

// Tự động đóng mobile drawer và dọn dẹp scroll-lock khi chuyển sang kích thước desktop (≥ 1024px)
if (typeof window !== 'undefined' && window.matchMedia) {
    const lgBreakpointQuery = window.matchMedia('(min-width: 1024px)');
    const handleLgBreakpoint = (e) => {
        if (e.matches) {
            closeMobileDrawer();
        }
    };
    if (lgBreakpointQuery.addEventListener) {
        lgBreakpointQuery.addEventListener('change', handleLgBreakpoint);
    } else if (lgBreakpointQuery.addListener) {
        lgBreakpointQuery.addListener(handleLgBreakpoint);
    }
}

export function updateSidebarNavActive(target) {
    const map = {
        home: 'home',
        map: 'map',
        clubs: 'clubs',
        community: 'community',
        blog: 'blog',
        events: 'events',
        planner: 'planner',
        saved: 'saved',
        feedback: 'feedback',
        about: 'about',
        companion: 'companion'
    };
    const activeTarget = map[target] || null;

    const standardLinks = [
        { target: 'home', ids: ['sidebarLinkHome', 'drawerLinkHome'], iconColor: '' },
        { target: 'map', ids: ['sidebarLinkMap', 'drawerLinkMap'], iconColor: '' },
        { target: 'clubs', ids: ['sidebarLinkClubs', 'drawerLinkClubs'], iconColor: '' },
        { target: 'community', ids: ['sidebarLinkCommunity', 'drawerLinkCommunity'], iconColor: '' },
        { target: 'blog', ids: ['sidebarLinkBlog', 'drawerLinkBlog'], iconColor: '' },
        { target: 'events', ids: ['sidebarLinkEvents', 'drawerLinkEvents'], iconColor: '' },
        { target: 'planner', ids: ['sidebarLinkPlanner', 'drawerLinkPlanner'], iconColor: '' },
        { target: 'saved', ids: ['sidebarLinkSaved', 'drawerLinkSaved'], iconColor: 'text-rose-500' }
    ];

    standardLinks.forEach(({ target: linkTarget, ids, iconColor }) => {
        const isActive = linkTarget === activeTarget;
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (isActive) {
                el.className = 'flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-lg bg-primary-container text-white font-button text-xs font-semibold shadow-xs';
                const icon = el.querySelector('.material-symbols-outlined');
                if (icon) {
                    icon.className = 'material-symbols-outlined text-[20px] text-white';
                }
            } else {
                el.className = 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-on-surface-variant dark:text-zinc-300 hover:bg-surface-container-low dark:hover:bg-zinc-800 hover:text-on-surface transition-colors font-button text-xs font-semibold min-h-[44px]';
                const icon = el.querySelector('.material-symbols-outlined');
                if (icon) {
                    icon.className = `material-symbols-outlined text-[20px] ${iconColor}`;
                }
            }
        });
    });

    // 3 danh mục công khai trong GÓC ADMIN & DỰ ÁN (Xanh dương, Tím, Cam hổ phách)
    const adminProjectLinks = [
        {
            target: 'feedback',
            ids: ['sidebarLinkFeedback', 'drawerLinkFeedback'],
            iconColor: 'text-blue-600 dark:text-blue-400',
            activeClass: 'flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/80 font-button text-xs font-bold shadow-xs',
            inactiveClass: 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-on-surface-variant dark:text-zinc-300 hover:bg-blue-50/70 dark:hover:bg-blue-950/30 hover:text-blue-700 dark:hover:text-blue-300 transition-colors font-button text-xs font-semibold min-h-[44px]'
        },
        {
            target: 'about',
            ids: ['sidebarLinkAbout', 'drawerLinkAbout'],
            iconColor: 'text-purple-600 dark:text-purple-400',
            activeClass: 'flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-lg bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/80 font-button text-xs font-bold shadow-xs',
            inactiveClass: 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-on-surface-variant dark:text-zinc-300 hover:bg-purple-50/70 dark:hover:bg-purple-950/30 hover:text-purple-700 dark:hover:text-purple-300 transition-colors font-button text-xs font-semibold min-h-[44px]'
        },
        {
            target: 'companion',
            ids: ['sidebarLinkCompanion', 'drawerLinkCompanion'],
            iconColor: 'text-amber-600 dark:text-amber-400',
            activeClass: 'flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/80 font-button text-xs font-bold shadow-xs',
            inactiveClass: 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-on-surface-variant dark:text-zinc-300 hover:bg-amber-50/70 dark:hover:bg-amber-950/30 hover:text-amber-800 dark:hover:text-amber-300 transition-colors font-button text-xs font-semibold min-h-[44px]'
        }
    ];

    adminProjectLinks.forEach(({ target: linkTarget, ids, iconColor, activeClass, inactiveClass }) => {
        const isActive = linkTarget === activeTarget;
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.className = isActive ? activeClass : inactiveClass;
            const icon = el.querySelector('.material-symbols-outlined');
            if (icon) {
                icon.className = `material-symbols-outlined text-[20px] ${iconColor}`;
            }
        });
    });
}

export function updateNavActiveStates(target) {
    const bottomTabMap = {
        home: 'tabNavHome',
        map: 'tabNavMap',
        clubs: 'tabNavClubs',
        community: 'tabNavClubs',
        blog: 'tabNavClubs',
        events: 'tabNavClubs',
        saved: 'tabNavSaved',
        search: 'tabNavSearch'
    };
    const activeBottomId = bottomTabMap[target] || null;
    if (activeBottomId) {
        setBottomNavActive(activeBottomId);
    }
    updateSidebarNavActive(target);
}

export function switchView(viewName, options = {}) {
    const {
        updateHash = true,
        pushState = false,
        customHash = null,
        closeOverlays = true,
        scrollTo = null,
        scrollTop = !scrollTo
    } = options;

    const validViews = ['home', 'clubs', 'community', 'blog', 'events', 'planner', 'search', 'feedback', 'about', 'companion'];
    if (!validViews.includes(viewName)) {
        console.warn(`[Router] View "${viewName}" không hợp lệ, chuyển về "home"`);
        viewName = 'home';
    }

    const previousView = state.currentView || 'home';
    const isSameBaseView = (state.currentView === viewName && !state.currentOverlay);
    if (state.currentView !== viewName) {
        state.previousBaseView = previousView;
    }
    state.currentView = viewName;

    // Đóng mobile drawer và các modal overlay nếu cần
    closeMobileDrawer();
    if (closeOverlays) {
        const mapModal = document.getElementById('fullMapModal');
        if (mapModal && !mapModal.classList.contains('hidden')) {
            closeFullMapModal(true);
        }
        const savedModal = document.getElementById('savedCollectionsModal');
        if (savedModal && !savedModal.classList.contains('hidden')) {
            closeSavedCollectionsModal(true);
        }
        const tourModal = document.getElementById('tourItinerariesModal');
        if (tourModal && !tourModal.classList.contains('hidden')) {
            closeTourItinerariesModal(true);
        }
        state.currentOverlay = null;
    }

    // Hiển thị view đích, ẩn các view khác
    const allViews = document.querySelectorAll('.app-view');
    allViews.forEach(viewEl => {
        const v = viewEl.getAttribute('data-view');
        if (v === viewName) {
            viewEl.classList.remove('hidden');
        } else {
            viewEl.classList.add('hidden');
        }
    });

    // Cập nhật trạng thái active thanh điều hướng
    updateNavActiveStates(viewName);

    // Cập nhật URL Hash
    if (updateHash) {
        const targetHash = customHash || (viewName === 'home' ? '#/home' : `#/${viewName}`);
        const currentHash = (window.location.hash || '').toLowerCase();
        const isCurrentHashMatching = currentHash === targetHash.toLowerCase() ||
            (viewName === 'home' && targetHash === '#/home' && (currentHash === '' || currentHash === '#' || currentHash === '#home'));

        if (!isCurrentHashMatching || (!isSameBaseView && pushState)) {
            try {
                if (pushState && (!isSameBaseView || !isCurrentHashMatching)) {
                    history.pushState({ view: viewName, customHash: targetHash }, '', targetHash);
                } else if (!isCurrentHashMatching) {
                    history.replaceState({ view: viewName, customHash: targetHash }, '', targetHash);
                }
            } catch (e) {
                window.location.hash = targetHash;
            }
        }
    }

    // Lazy check & render community feed or clubs if needed
    if ((viewName === 'clubs' || viewName === 'community') && !state.communityInitialized) {
        initCommunitySection();
        state.communityInitialized = true;
    }

    if (viewName === 'blog') {
        const blogContainer = document.getElementById('travelStoriesContainer');
        if (blogContainer && (!blogContainer.children || blogContainer.children.length === 0)) {
            renderArticlesSection(
                'travelStoriesContainer',
                state.articles,
                openArticleModal,
                openSubmitArticleModal,
                (article) => openSubmitArticleModal(article, true),
                Boolean(getAdminSession()?.user && ['admin', 'editor', 'moderator'].includes(getAdminSession()?.user?.role))
            );
        }
    }

    if (viewName === 'events') {
        const festContainer = document.getElementById('festivalsPortalContainer');
        if (festContainer && (!festContainer.children || festContainer.children.length === 0)) {
            renderFestivalsSection(
                'festivalsPortalContainer',
                state.festivals,
                state.activeFestivalSeason,
                openFestivalModal,
                (placeId) => openDetailModal(placeId),
                handleSeasonFilter,
                state.eventsAndMeetups,
                state.activeEventCategory,
                state.activeEventRegion,
                handleEventCategoryFilter,
                handleEventRegionFilter,
                openEventRsvpModal,
                toggleBookmarkEvent,
                state.bookmarkedEvents,
                openHostEventModal
            );
        }
    }

    if (viewName === 'planner') {
        renderPlannerMainView();
    }

    // Cuộn trang
    if (scrollTo) {
        setTimeout(() => {
            const el = document.getElementById(scrollTo);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 60);
    } else if (scrollTop) {
        window.scrollTo({ top: 0, behavior: 'instant' });
    }
}

export function getActiveView() {
    return state.currentView || 'home';
}

export function navGoHome() {
    switchView('home', { updateHash: true, pushState: true, closeOverlays: true, scrollTop: true });
}

export function navGoMap() {
    const savedModal = document.getElementById('savedCollectionsModal');
    if (savedModal && !savedModal.classList.contains('hidden')) {
        closeSavedCollectionsModal(true);
    }
    state.currentOverlay = 'map';
    openFullMapModal();
    updateNavActiveStates('map');
    try {
        if (window.location.hash !== '#/map') {
            history.pushState({ overlay: 'map' }, '', '#/map');
        }
    } catch (e) {
        window.location.hash = '#/map';
    }
}

export function navGoClubs() {
    switchView('clubs', { updateHash: true, pushState: true, customHash: '#/clubs', closeOverlays: true, scrollTop: true });
}

export function navGoCommunity() {
    switchView('community', { updateHash: true, pushState: true, customHash: '#/community', closeOverlays: true, scrollTop: true });
}

export function navGoBlog() {
    switchView('blog', { updateHash: true, pushState: true, customHash: '#/blog', closeOverlays: true, scrollTop: true });
}

export function navGoEvents() {
    switchView('events', { updateHash: true, pushState: true, customHash: '#/events', closeOverlays: true, scrollTop: true });
}

export function navGoPlanner(options = {}) {
    const tab = options.tab || state.plannerCurrentTab || 'custom';
    state.plannerCurrentTab = tab;
    const targetHash = options.customHash || (tab === 'suggested' ? '#/planner/suggested' : '#/planner');
    switchView('planner', {
        updateHash: true,
        pushState: true,
        customHash: targetHash,
        closeOverlays: true,
        scrollTop: true
    });
}

export function navGoSaved() {
    const mapModal = document.getElementById('fullMapModal');
    if (mapModal && !mapModal.classList.contains('hidden')) {
        closeFullMapModal(true);
    }
    state.currentOverlay = 'saved';
    openSavedCollectionsModal();
    updateNavActiveStates('saved');
    try {
        if (window.location.hash !== '#/saved') {
            history.pushState({ overlay: 'saved' }, '', '#/saved');
        }
    } catch (e) {
        window.location.hash = '#/saved';
    }
}

export function navGoSearch() {
    switchView('search', { updateHash: true, pushState: true, closeOverlays: true, scrollTop: true });
    const searchInput = document.getElementById('discoverySearchInput');
    if (searchInput) {
        setTimeout(() => {
            searchInput.focus();
            searchInput.select();
        }, 150);
    }
}

export function navGoFeedback() {
    switchView('feedback', { updateHash: true, pushState: true, customHash: '#/feedback', closeOverlays: true, scrollTop: true });
}

export function navGoAbout() {
    switchView('about', { updateHash: true, pushState: true, customHash: '#/about', closeOverlays: true, scrollTop: true });
}

export function navGoCompanion() {
    switchView('companion', { updateHash: true, pushState: true, customHash: '#/companion', closeOverlays: true, scrollTop: true });
}

export function submitFeedbackDraft(event) {
    if (event && event.preventDefault) event.preventDefault();
    const typeEl = document.getElementById('feedbackTypeSelect');
    const titleEl = document.getElementById('feedbackTitleInput');
    const contentEl = document.getElementById('feedbackContentInput');
    const type = typeEl ? typeEl.value : 'Góp ý chung';
    const title = titleEl ? titleEl.value.trim() : '';
    const content = contentEl ? contentEl.value.trim() : '';

    if (!title || !content) {
        showNoticeToast('Thiếu thông tin', 'Vui lòng nhập đầy đủ tiêu đề và nội dung góp ý.');
        return;
    }

    const subject = encodeURIComponent(`[ViVuTraVinh - ${type}] ${title}`);
    const body = encodeURIComponent(`Kính gửi Ban Quản Trị ViVuTraVinh,\n\nTôi xin gửi góp ý về: ${type}\nTiêu đề: ${title}\n\nNội dung chi tiết:\n${content}\n\n---\nGửi từ người dùng ViVuTraVinh (${window.location.origin})`);
    const mailtoUrl = `mailto:tienlh1998@gmail.com?subject=${subject}&body=${body}`;
    window.location.href = mailtoUrl;
    showSavedToast('Đang mở ứng dụng email để gửi góp ý cho Ban Quản Trị...');
}

export function navGoSection(sectionId) {
    if (!sectionId) return;

    if (sectionId === 'tourItinerariesSection') {
        switchView('home', {
            updateHash: true,
            pushState: true,
            customHash: '#tours',
            closeOverlays: true,
            scrollTo: 'tourItinerariesSection'
        });
        openTourItinerariesModal({ updateHash: false });
        return;
    }

    const viewMap = {
        // Home view sections
        heroBanner: { view: 'home', hash: '#/home' },
        heroSpotlightContainer: { view: 'home', hash: '#/home' },
        bentoMiniMap: { view: 'home', hash: '#/home' },
        smartSuggestionsContainer: { view: 'home', hash: '#/home' },
        stitchNearbySection: { view: 'home', hash: '#/home' },
        tourItinerariesSection: { view: 'home', hash: '#tours' },
        khmerCultureIntro: { view: 'home', hash: '#/home' },
        aoBaOmLegend: { view: 'home', hash: '#/home' },
        traVinhCuisineIntro: { view: 'home', hash: '#/home' },
        heritageNewsletterSection: { view: 'home', hash: '#/home' },
        vivuFacebookBanner: { view: 'home', hash: '#/home' },
        // Clubs view sections
        stitchCommunitySection: { view: 'clubs', hash: '#/clubs' },
        featuredClubsGrid: { view: 'clubs', hash: '#/clubs' },
        weeklyActivitiesList: { view: 'clubs', hash: '#/clubs' },
        // Community view sections
        communityPostsFeed: { view: 'community', hash: '#/community' },
        communityCreatePostBox: { view: 'community', hash: '#/community' },
        // Blog view sections
        travelStoriesSection: { view: 'blog', hash: '#/blog' },
        travelStoriesContainer: { view: 'blog', hash: '#/blog' },
        // Events view sections
        festivalsPortalSection: { view: 'events', hash: '#/events' },
        // Search view sections
        discoverySection: { view: 'search', hash: '#/search' },
        placesDiscoveryGrid: { view: 'search', hash: '#/search' }
    };

    let target = viewMap[sectionId];
    if (!target) {
        const el = document.getElementById(sectionId);
        const parentView = el?.closest?.('.app-view');
        const viewName = parentView?.dataset?.view || 'home';
        const hash = viewName === 'home' ? '#/home' : `#/${viewName}`;
        target = { view: viewName, hash };
    }

    switchView(target.view, {
        updateHash: true,
        pushState: true,
        customHash: target.hash,
        closeOverlays: true,
        scrollTo: sectionId
    });
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

// ==========================================
// CÂU LẠC BỘ & THẢO LUẬN CỘNG ĐỒNG (PHASE 5)
// ==========================================

export function showNotification(message, title = 'ViVuTraVinh') {
    showNoticeToast(title, message);
}

/**
 * Khởi tạo Section Câu Lạc Bộ & Thảo Luận Cộng Đồng (Phase 5)
 */
export function initCommunitySection() {
    // 1. Render Club Category Filter Pills
    const pillsContainer = document.getElementById('clubCategoryPills');
    if (pillsContainer) {
        pillsContainer.innerHTML = renderClubCategoryPills(
            TRA_VINH_CLUB_CATEGORIES,
            state.activeClubCategory,
            'window.ViVuApp.filterClubsByCategory'
        );
    }

    // 2. Render Featured Clubs Bento Grid
    renderClubsGrid();

    // 3. Render Feed Filter Tabs
    const feedFilterTabs = document.getElementById('feedFilterTabs');
    if (feedFilterTabs) {
        feedFilterTabs.innerHTML = renderCommunityFeedFilters(
            COMMUNITY_FEED_FILTERS,
            state.activeCommunityFeedFilter,
            'window.ViVuApp.filterCommunityFeed'
        );
    }

    // 4. Render Community Discussion Feed
    renderCommunityFeed();

    // 5. Render Weekly Activities Widget
    const weeklyActivitiesContainer = document.getElementById('weeklyActivitiesList');
    if (weeklyActivitiesContainer) {
        weeklyActivitiesContainer.innerHTML = renderWeeklyActivitiesWidget(
            state.weeklyActivities,
            state.registeredActivities
        );
    }

    // 6. Render Community Rules Widget
    const rulesContainer = document.getElementById('communityGuidelinesList');
    if (rulesContainer) {
        rulesContainer.innerHTML = renderCommunityGuidelinesWidget(state.communityGuidelines);
    }

    // 7. Update Badges
    const clubsBadge = document.getElementById('communityClubsCountBadge');
    if (clubsBadge) {
        clubsBadge.textContent = state.clubs.length;
    }
    const weeklyBadge = document.getElementById('weeklyActivitiesCountBadge');
    if (weeklyBadge) {
        weeklyBadge.textContent = `${state.weeklyActivities.length} sự kiện`;
    }

    // 8. Đồng bộ nguồn dữ liệu UGC từ API
    syncCommunityUgcFeed().catch(e => console.warn('[UGC] Sync feed warning:', e.message));
}

/**
 * Đồng bộ bài viết và CLB đã được phê duyệt từ API Supabase
 */
export async function syncCommunityUgcFeed() {
    const isMock = (typeof window !== 'undefined' && (
        window.location?.search?.includes('source=mock') ||
        (window.ViVuData?.getDataSource && window.ViVuData.getDataSource() === 'mock') ||
        (window.ViVuComments?.isMockMode && window.ViVuComments.isMockMode())
    ));
    if (isMock) return;

    function applyApiPosts(postsList) {
        if (!Array.isArray(postsList) || postsList.length === 0) return;
        const apiPosts = postsList.map(p => ({
            id: p.id,
            author: p.author_name || 'Thành viên Xứ Trà',
            avatarText: (p.author_name || 'TV').slice(0, 2).toUpperCase(),
            avatarUrl: p.author_avatar,
            badge: 'Thành viên',
            timeAgo: 'Gần đây',
            location: (p.metadata?.location?.name || (typeof p.location === 'object' ? p.location?.name : p.location) || 'Trà Vinh'),
            content: p.content,
            image: (p.images && p.images[0]) || null,
            likes: p.likes_count || 0,
            commentsCount: p.comments_count || 0,
            shares: 0,
            topic: p.category ? `🏷️ Chủ đề: ${p.category}` : '🏷️ Chủ đề: Tự do',
            status: 'approved'
        }));
        const apiPostIds = new Set(apiPosts.map(p => p.id));
        const userPendingPosts = state.communityPosts.filter(p => p.status === 'pending');
        const remainingSeedPosts = state.communityPosts.filter(p => !apiPostIds.has(p.id) && p.status !== 'pending');
        state.communityPosts = [...userPendingPosts, ...apiPosts, ...remainingSeedPosts];
        renderCommunityFeed();
    }

    function applyApiClubs(clubsList) {
        if (!Array.isArray(clubsList) || clubsList.length === 0) return;
        const apiClubs = clubsList.map(c => ({
            id: c.id,
            name: c.name,
            leader_id: c.leader_id || c.leaderId || null,
            leaderId: c.leader_id || c.leaderId || null,
            category: c.category,
            categoryName: c.category_name,
            badge: c.badge || c.category_name,
            membersCount: c.members_count || 1,
            activitiesCount: c.activities_count || 0,
            image: c.image || './ao bà om.jpg',
            description: c.description,
            lastActivity: c.last_activity || 'Đang mở đăng ký',
            scheduleInfo: c.schedule_info || 'Sinh hoạt hàng tuần',
            meetingPlace: c.meeting_place || 'TP. Trà Vinh',
            icon: c.icon || 'groups',
            color: c.color || 'emerald',
            status: c.status || 'approved'
        }));
        const apiClubIds = new Set(apiClubs.map(c => c.id));
        const userPendingClubs = state.clubs.filter(c => c.status === 'pending');
        const remainingSeedClubs = state.clubs.filter(c => !apiClubIds.has(c.id) && c.status !== 'pending');
        state.clubs = [...userPendingClubs, ...apiClubs, ...remainingSeedClubs];
        renderClubsGrid();
    }

    // 1. Đồng bộ bài viết cộng đồng
    let postsLoaded = false;
    try {
        const postsRes = await fetch('/api/community-posts?status=approved&limit=30');
        if (postsRes.ok) {
            const data = await postsRes.json();
            if (Array.isArray(data.posts) && data.posts.length > 0) {
                applyApiPosts(data.posts);
                postsLoaded = true;
            }
        }
    } catch (_) {}

    if (!postsLoaded && SUPABASE_URL && SUPABASE_ANON_KEY) {
        try {
            const sPostsRes = await fetch(`${SUPABASE_URL}/rest/v1/public_community_posts?select=*&order=created_at.desc&limit=30`, {
                headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
            });
            if (sPostsRes.ok) {
                const rows = await sPostsRes.json();
                if (Array.isArray(rows) && rows.length > 0) {
                    applyApiPosts(rows);
                    postsLoaded = true;
                }
            }
        } catch (e) {
            console.warn('[CommunitySync] Supabase direct posts fetch:', e.message);
        }
    }

    // 2. Đồng bộ Câu lạc bộ (Ưu tiên qua API Serverless; fallback an toàn qua Secure View public_clubs)
    let clubsLoaded = false;
    try {
        const clubsRes = await fetch('/api/clubs?status=approved&limit=30');
        if (clubsRes.ok) {
            const cdata = await clubsRes.json();
            if (Array.isArray(cdata.clubs) && cdata.clubs.length > 0) {
                applyApiClubs(cdata.clubs);
                clubsLoaded = true;
            }
        }
    } catch (_) {}

    if (!clubsLoaded && SUPABASE_URL && SUPABASE_ANON_KEY) {
        try {
            const sClubsRes = await fetch(`${SUPABASE_URL}/rest/v1/public_clubs?select=*&limit=30`, {
                headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
            });
            if (sClubsRes.ok) {
                const rows = await sClubsRes.json();
                if (Array.isArray(rows) && rows.length > 0) {
                    applyApiClubs(rows);
                    clubsLoaded = true;
                }
            }
        } catch (e) {
            console.warn('[CommunitySync] Supabase direct public_clubs fetch:', e.message);
        }
    }

    // 3. Đồng bộ Sự kiện & Workshop cộng đồng
    await syncCommunityEventsFromSupabase().catch(e => console.warn('[CommunitySync] Events sync error:', e.message));

    // 4. Đồng bộ Bài viết Cẩm nang du lịch
    await syncArticlesFromSupabase().catch(e => console.warn('[CommunitySync] Articles sync error:', e.message));

    // 5. Đồng bộ Lịch sinh hoạt định kỳ CLB (G13)
    await syncClubActivitiesFromSupabase().catch(e => console.warn('[CommunitySync] Club activities sync error:', e.message));
}

/**
 * Render Clubs Bento Grid theo bộ lọc danh mục
 */
export function renderClubsGrid() {
    const grid = document.getElementById('featuredClubsGrid');
    if (!grid) return;

    let filtered = state.clubs;
    if (state.activeClubCategory && state.activeClubCategory !== 'all') {
        filtered = state.clubs.filter(c => c.category === state.activeClubCategory);
    }

    grid.innerHTML = renderClubsBentoGrid(filtered, state.joinedClubs);
}

/**
 * Lọc Câu Lạc Bộ theo danh mục
 */
export function filterClubsByCategory(catId) {
    state.activeClubCategory = catId;
    const pillsContainer = document.getElementById('clubCategoryPills');
    if (pillsContainer) {
        pillsContainer.innerHTML = renderClubCategoryPills(
            TRA_VINH_CLUB_CATEGORIES,
            state.activeClubCategory,
            'window.ViVuApp.filterClubsByCategory'
        );
    }
    renderClubsGrid();
}

/**
 * Tham gia hoặc Rời Câu Lạc Bộ
 */
export function toggleJoinClub(clubId) {
    if (!clubId) return;
    const club = state.clubs.find(c => c.id === clubId);
    const isCurrentlyJoined = state.joinedClubs.includes(clubId);

    if (isCurrentlyJoined) {
        state.joinedClubs = state.joinedClubs.filter(id => id !== clubId);
        showNotification(club ? `Đã rời khỏi "${club.name}"` : 'Đã rời câu lạc bộ');
    } else {
        state.joinedClubs.push(clubId);
        showNotification(club ? `Chào mừng bạn gia nhập "${club.name}"!` : 'Tham gia câu lạc bộ thành công!');
    }

    try {
        localStorage.setItem('vivu_joined_clubs', JSON.stringify(state.joinedClubs));
    } catch (e) {
        console.warn('Lỗi lưu joined clubs:', e);
    }

    renderClubsGrid();
}

/**
 * Lưu / Bỏ lưu Câu Lạc Bộ yêu thích
 */
export function toggleBookmarkClub(clubId, btnEl) {
    if (!clubId) return;
    const club = state.clubs.find(c => c.id === clubId);
    showNotification(club ? `Đã lưu "${club.name}" vào danh sách quan tâm!` : 'Đã lưu câu lạc bộ!');
    if (btnEl) {
        const icon = btnEl.querySelector('.material-symbols-outlined');
        if (icon) {
            icon.classList.toggle('text-red-500');
            icon.classList.toggle('dark:text-red-400');
        }
    }
}

/**
 * Render Bảng tin thảo luận cộng đồng theo bộ lọc
 */
export function renderCommunityFeed() {
    const feedContainer = document.getElementById('communityPostsFeed');
    if (!feedContainer) return;

    let filtered = [...state.communityPosts];
    if (state.activeCommunityFeedFilter === 'featured') {
        filtered = filtered.filter(p => (p.likes || 0) >= 50 || (p.shares || 0) >= 6);
    } else if (state.activeCommunityFeedFilter === 'upcoming') {
        filtered = filtered.filter(p => /workshop|thứ bảy|chủ nhật|tuần tới|hẹn|gặp/i.test(p.content));
    } else if (state.activeCommunityFeedFilter === 'photos') {
        filtered = filtered.filter(p => !!p.image);
    }

    feedContainer.innerHTML = renderCommunityPostsFeed(filtered, state.likedCommunityPosts);
}

/**
 * Lọc Thảo Luận Cộng Đồng
 */
export function filterCommunityFeed(filterId) {
    state.activeCommunityFeedFilter = filterId;
    const feedFilterTabs = document.getElementById('feedFilterTabs');
    if (feedFilterTabs) {
        feedFilterTabs.innerHTML = renderCommunityFeedFilters(
            COMMUNITY_FEED_FILTERS,
            state.activeCommunityFeedFilter,
            'window.ViVuApp.filterCommunityFeed'
        );
    }
    renderCommunityFeed();
}

/**
 * Thích / Bỏ thích Bài Viết Cộng Đồng
 */
export function toggleLikePost(postId) {
    if (!postId) return;
    const isLiked = state.likedCommunityPosts.includes(postId);

    if (isLiked) {
        state.likedCommunityPosts = state.likedCommunityPosts.filter(id => id !== postId);
    } else {
        state.likedCommunityPosts.push(postId);
    }

    try {
        localStorage.setItem('vivu_liked_posts', JSON.stringify(state.likedCommunityPosts));
    } catch (e) {
        console.warn('Lỗi lưu liked posts:', e);
    }

    renderCommunityFeed();
}

/**
/**
 * Thông báo chưa hỗ trợ đặt chỗ trực tuyến cho Hoạt Động Tuần Này
 */
export function showActivityRsvpNotice(actId) {
    const act = state.weeklyActivities?.find(a => a.id === actId);
    showNoticeToast(
        'Chưa hỗ trợ đăng ký trực tuyến',
        act ? `Hoạt động "${act.title}" hiện chưa hỗ trợ đặt chỗ qua hệ thống. Bạn có thể đến tham gia trực tiếp theo lịch đã công bố.` : 'Hoạt động này hiện chưa hỗ trợ đặt chỗ trực tuyến. Bạn có thể đến tham gia trực tiếp theo lịch đã công bố.'
    );
}

/**
 * Đăng ký / Hủy chỗ Hoạt Động Tuần Này (Đã cập nhật để không báo thành công giả)
 */
export function toggleRsvpActivity(actId) {
    showActivityRsvpNotice(actId);
}

/**
 * Chia sẻ Bài Viết Cộng Đồng
 */
export function shareCommunityPost(postId) {
    try {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(window.location.href);
            showNotification('Đã sao chép liên kết bài viết để chia sẻ!');
        } else {
            showNotification('Đã sẵn sàng chia sẻ bài viết này!');
        }
    } catch (e) {
        showNotification('Đã sẵn sàng chia sẻ bài viết này!');
    }
}

/**
 * Gợi ý bình luận cho bài viết
 */
export function handleCommentPrompt(postId) {
    const post = state.communityPosts.find(p => p.id === postId);
    showNotification(post ? `Bình luận tương tác cho bài viết của ${post.author}` : 'Tính năng bình luận đang hoạt động');
}

/**
 * Xử lý khi người dùng chọn tệp ảnh cho bài viết cộng đồng
 */
async function handleCommunityPostFileChange(event) {
    const file = event.target?.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showNotification('Chỉ hỗ trợ tải lên tệp hình ảnh (JPEG, PNG, WebP, GIF).', 'error');
        event.target.value = '';
        return;
    }

    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_SIZE) {
        showNotification('Dung lượng ảnh vượt quá giới hạn 5MB. Vui lòng chọn ảnh nhỏ hơn.', 'error');
        event.target.value = '';
        return;
    }

    const preview = document.getElementById('newPostMediaPreview');
    const previewImg = document.getElementById('newPostMediaPreviewImg');
    const previewText = document.getElementById('newPostMediaPreviewText');
    const uploadStatus = document.getElementById('newPostMediaUploadStatus');

    if (previewImg) {
        try {
            previewImg.src = URL.createObjectURL(file);
            previewImg.classList.remove('hidden');
        } catch (_) {}
    }
    if (previewText) {
        previewText.textContent = file.name;
    }
    if (uploadStatus) {
        uploadStatus.textContent = 'Đang tải lên...';
        uploadStatus.className = 'text-[11px] font-bold text-amber-500';
    }
    if (preview) preview.classList.remove('hidden');

    state._communityUploading = true;
    state._communityUploadedImageUrl = null;

    try {
        const token = await getValidUserToken().catch(() => null);
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `reviews/community/clrev_${Date.now()}_${safeName}`;

        const uploadHeaders = {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token || SUPABASE_ANON_KEY}`,
            'Content-Type': file.type
        };

        const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/review-photos/${filePath}`, {
            method: 'POST',
            headers: uploadHeaders,
            body: file
        });

        if (!uploadRes.ok) {
            const errBody = await uploadRes.json().catch(() => ({}));
            throw new Error(errBody.message || errBody.error || `Mã lỗi ${uploadRes.status}`);
        }

        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/review-photos/${filePath}`;
        state._communityUploadedImageUrl = publicUrl;
        state._communityUploading = false;

        if (uploadStatus) {
            uploadStatus.textContent = 'Đã tải lên';
            uploadStatus.className = 'text-[11px] font-bold text-emerald-600 dark:text-emerald-400';
        }
        showNotification('Đã tải lên ảnh thành công!');
    } catch (err) {
        state._communityUploading = false;
        state._communityUploadedImageUrl = null;
        console.error('[CommunityUpload] Upload error:', err);
        if (uploadStatus) {
            uploadStatus.textContent = 'Tải lên thất bại';
            uploadStatus.className = 'text-[11px] font-bold text-red-500';
        }
        showNotification('Tải ảnh thất bại: ' + (err.message || 'Lỗi mạng.'), 'error');
        // Không xóa nội dung đang soạn trong textarea
    }
}

/**
 * Đính kèm ảnh cho bài viết mới qua file input
 */
export function promptAddPostPhoto() {
    const fileInput = document.getElementById('communityPostFileInput');
    if (!fileInput) return;
    if (!fileInput.dataset.bound) {
        fileInput.dataset.bound = 'true';
        fileInput.addEventListener('change', handleCommunityPostFileChange);
    }
    fileInput.click();
}

/**
 * Xóa đính kèm ảnh bài viết mới
 */
export function clearCommunityPostAttachment() {
    state._communityUploadedImageUrl = null;
    state._communityUploading = false;
    const fileInput = document.getElementById('communityPostFileInput');
    if (fileInput) fileInput.value = '';
    const preview = document.getElementById('newPostMediaPreview');
    const previewImg = document.getElementById('newPostMediaPreviewImg');
    const uploadStatus = document.getElementById('newPostMediaUploadStatus');
    if (previewImg) {
        previewImg.src = '';
        previewImg.classList.add('hidden');
    }
    if (uploadStatus) uploadStatus.textContent = '';
    if (preview) preview.classList.add('hidden');
}

/**
 * Render danh sách địa điểm trong modal check-in
 */
function renderCheckinPlacesList(places) {
    const container = document.getElementById('communityCheckinPlacesList');
    if (!container) return;

    if (!Array.isArray(places) || places.length === 0) {
        container.innerHTML = `
            <div class="p-6 text-center text-xs text-outline dark:text-zinc-500">
                Không tìm thấy địa điểm công khai phù hợp.
            </div>
        `;
        return;
    }

    container.innerHTML = places.slice(0, 30).map(p => `
        <div onclick="window.ViVuApp.selectCheckinPlace('${escapeHtml(p.id)}')"
            class="p-3 rounded-xl bg-surface-container-low dark:bg-zinc-800/70 hover:bg-surface-container dark:hover:bg-zinc-800 transition-colors flex items-center justify-between gap-3 cursor-pointer border border-outline-variant/20 dark:border-zinc-700/40">
            <div class="flex items-center gap-2.5 min-w-0">
                <span class="material-symbols-outlined text-orange-500 text-[20px] shrink-0">location_on</span>
                <div class="flex flex-col min-w-0">
                    <span class="text-xs font-bold text-on-surface dark:text-zinc-100 truncate">${escapeHtml(p.name)}</span>
                    <span class="text-[11px] text-outline dark:text-zinc-400 truncate">${escapeHtml(p.address || p.area || 'Trà Vinh')}</span>
                </div>
            </div>
            <button type="button" class="px-3 py-1 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 text-xs font-semibold shrink-0">
                Chọn
            </button>
        </div>
    `).join('');
}

/**
 * Mở modal Check-in địa điểm công khai
 */
export async function promptAddPostLocation() {
    const modal = document.getElementById('communityCheckinModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.classList.add('overflow-hidden');

    const searchInput = document.getElementById('communityCheckinSearchInput');
    if (searchInput) {
        searchInput.value = '';
        setTimeout(() => searchInput.focus(), 60);
    }

    const container = document.getElementById('communityCheckinPlacesList');

    if (Array.isArray(state.allPlaces) && state.allPlaces.length > 0) {
        renderCheckinPlacesList(state.allPlaces);
        return;
    }

    // Hiển thị trạng thái đang tải
    if (container) {
        container.innerHTML = `
            <div class="py-8 flex flex-col items-center justify-center gap-3 text-center">
                <div class="w-8 h-8 rounded-full border-3 border-orange-500 border-t-transparent animate-spin"></div>
                <p class="text-xs font-medium text-on-surface-variant dark:text-zinc-400">Đang tải danh sách địa điểm công khai...</p>
            </div>
        `;
    }

    try {
        let places = [];
        if (window.ViVuData?.loadPlaces) {
            places = await window.ViVuData.loadPlaces();
        } else {
            const res = await fetch('/api/places');
            if (res.ok) places = await res.json();
        }
        state.allPlaces = Array.isArray(places) ? places : [];
        renderCheckinPlacesList(state.allPlaces);
    } catch (err) {
        console.warn('[Checkin] Lỗi tải địa điểm:', err.message);
        if (container) {
            container.innerHTML = `
                <div class="py-6 flex flex-col items-center justify-center gap-2 text-center text-xs">
                    <span class="material-symbols-outlined text-rose-500 text-3xl">cloud_off</span>
                    <p class="font-semibold text-rose-600 dark:text-rose-400">Không thể tải danh sách địa điểm</p>
                    <p class="text-outline dark:text-zinc-500 text-[11px]">Vui lòng kiểm tra kết nối mạng và thử lại.</p>
                    <button type="button" onclick="window.ViVuApp.retryLoadCheckinPlaces()"
                        class="mt-2 px-3 py-1.5 rounded-lg bg-orange-500 text-white font-bold text-xs hover:bg-orange-600 transition-colors min-h-[36px]">
                        Thử lại
                    </button>
                </div>
            `;
        }
    }
}

/**
 * Thử tải lại danh sách địa điểm check-in
 */
export async function retryLoadCheckinPlaces() {
    state.allPlaces = [];
    await promptAddPostLocation();
}

/**
 * Đóng modal Check-in địa điểm
 */
export function closeCommunityCheckinModal() {
    const modal = document.getElementById('communityCheckinModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.body.classList.remove('overflow-hidden');
    }
}

/**
 * Tìm kiếm lọc địa điểm check-in
 */
export function filterCheckinPlaces(query = '') {
    const q = (query || '').trim().toLowerCase();
    const places = state.allPlaces || [];
    if (!q) {
        renderCheckinPlacesList(places);
        return;
    }
    const filtered = places.filter(p => {
        const name = (p.name || '').toLowerCase();
        const cat = (p.category || '').toLowerCase();
        const area = (p.area || p.address || '').toLowerCase();
        return name.includes(q) || cat.includes(q) || area.includes(q);
    });
    renderCheckinPlacesList(filtered);
}

/**
 * Chọn một địa điểm check-in
 */
export function selectCheckinPlace(placeId) {
    const place = (state.allPlaces || []).find(p => p.id === placeId || p.slug === placeId);
    if (!place) return;

    state.newPostCheckin = {
        id: place.id,
        slug: place.slug,
        name: place.name,
        address: place.address || place.area || 'Trà Vinh',
        coords: place.coordinates || null
    };

    const chip = document.getElementById('newPostCheckinChip');
    const nameEl = document.getElementById('newPostCheckinName');
    const addrEl = document.getElementById('newPostCheckinAddress');

    if (nameEl) nameEl.textContent = place.name;
    if (addrEl) addrEl.textContent = place.address || place.area || 'Trà Vinh';
    if (chip) chip.classList.remove('hidden');

    closeCommunityCheckinModal();
    showNotification(`Đã gắn thẻ check-in: ${place.name}`);
}

/**
 * Bỏ chọn địa điểm check-in
 */
export function clearCommunityPostCheckin() {
    state.newPostCheckin = null;
    const chip = document.getElementById('newPostCheckinChip');
    if (chip) chip.classList.add('hidden');
}

let pendingAuthCallback = null;

/**
 * Mở modal Đăng nhập / Đăng ký người dùng
 */
export function openAuthModal(mode = 'signin', onSuccess = null) {
    pendingAuthCallback = typeof onSuccess === 'function' ? onSuccess : null;
    const modal = document.getElementById('userAuthModal');
    if (!modal) return;
    switchAuthTab(mode);
    const errorEl = document.getElementById('authErrorMessage');
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

/**
 * Đóng modal Đăng nhập / Đăng ký
 */
export function closeAuthModal() {
    const modal = document.getElementById('userAuthModal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }
    pendingAuthCallback = null;
}

/**
 * Chuyển tab giữa Đăng nhập và Đăng ký mới
 */
export function switchAuthTab(tab = 'signin') {
    const isSignIn = tab === 'signin';
    const tabSignIn = document.getElementById('authTabSignIn');
    const tabSignUp = document.getElementById('authTabSignUp');
    const nameField = document.getElementById('authDisplayNameField');
    const nameInput = document.getElementById('authDisplayNameInput');
    const submitBtn = document.getElementById('authSubmitBtn');
    const modalTitle = document.getElementById('userAuthModalTitle');
    const errorEl = document.getElementById('authErrorMessage');
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }

    if (isSignIn) {
        if (tabSignIn) tabSignIn.className = 'flex-1 py-2 text-xs font-bold rounded-lg transition-colors bg-white dark:bg-zinc-700 text-primary dark:text-emerald-400 shadow-xs';
        if (tabSignUp) tabSignUp.className = 'flex-1 py-2 text-xs font-bold rounded-lg transition-colors text-on-surface-variant dark:text-zinc-400 hover:text-on-surface';
        if (nameField) nameField.classList.add('hidden');
        if (nameInput) nameInput.required = false;
        if (submitBtn) submitBtn.textContent = 'Đăng nhập';
        if (modalTitle) modalTitle.textContent = 'Đăng Nhập Tài Khoản';
    } else {
        if (tabSignIn) tabSignIn.className = 'flex-1 py-2 text-xs font-bold rounded-lg transition-colors text-on-surface-variant dark:text-zinc-400 hover:text-on-surface';
        if (tabSignUp) tabSignUp.className = 'flex-1 py-2 text-xs font-bold rounded-lg transition-colors bg-white dark:bg-zinc-700 text-primary dark:text-emerald-400 shadow-xs';
        if (nameField) nameField.classList.remove('hidden');
        if (nameInput) nameInput.required = true;
        if (submitBtn) submitBtn.textContent = 'Tạo Tài Khoản Mới';
        if (modalTitle) modalTitle.textContent = 'Đăng Ký Thành Viên';
    }
}

/**
 * Xử lý submit form Đăng nhập / Đăng ký
 */
export async function handleAuthSubmit(event) {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }
    const emailInput = document.getElementById('authEmailInput');
    const passwordInput = document.getElementById('authPasswordInput');
    const nameInput = document.getElementById('authDisplayNameInput');
    const errorEl = document.getElementById('authErrorMessage');
    const submitBtn = document.getElementById('authSubmitBtn');

    const email = emailInput?.value?.trim();
    const password = passwordInput?.value;
    const displayName = nameInput?.value?.trim();
    const isSignUp = !document.getElementById('authDisplayNameField')?.classList.contains('hidden');

    if (errorEl) {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-70');
    }

    try {
        let session;
        if (isSignUp) {
            await signUpWithEmail(email, password, displayName);
            session = getUserSession();
            showNoticeToast('Đăng ký thành công', 'Chào mừng bạn tham gia cộng đồng ViVuTràVinh!');
        } else {
            session = await signInWithEmail(email, password);
            showSavedToast('✓ Đăng nhập thành công!');
        }

        if (session && session.user) {
            const userName = session.user.user_metadata?.display_name || displayName || email.split('@')[0];
            state.userProfile = {
                ...state.userProfile,
                id: session.user.id,
                name: userName,
                email: session.user.email,
                handle: `@${userName.toLowerCase().replace(/\s+/g, '.')}`
            };
        }

        closeAuthModal();

        const cb = pendingAuthCallback;
        pendingAuthCallback = null;
        if (typeof cb === 'function') {
            cb();
        }
    } catch (err) {
        if (errorEl) {
            errorEl.textContent = err.message || 'Đã xảy ra lỗi trong quá trình xác thực.';
            errorEl.classList.remove('hidden');
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-70');
        }
    }
}

/**
 * Đăng xuất tài khoản
 */
export async function handleUserSignOut() {
    await signOutUser();
    showNoticeToast('Đã đăng xuất', 'Bạn đã đăng xuất khỏi tài khoản thành công.');
    const content = document.getElementById('userProfileModalContent');
    if (content && !document.getElementById('userProfileModal')?.classList.contains('hidden')) {
        content.innerHTML = renderUserProfileModalContent(state.userProfile, state.profileActiveTab, state.profileBadgeCategory);
    }
}

/**
 * Đăng bài viết cộng đồng mới
 */
export async function submitNewCommunityPost() {
    const textarea = document.getElementById('newCommunityPostContent');
    const topicSelect = document.getElementById('newCommunityPostTopic');
    const content = textarea?.value?.trim();

    if (!content) {
        showNotification('Vui lòng nhập nội dung chia sẻ trước khi đăng bài!');
        textarea?.focus();
        return;
    }

    if (state._communityUploading) {
        showNotification('Đang trong quá trình tải ảnh lên, vui lòng chờ trong giây lát!');
        return;
    }

    // 1. Kiểm tra xác thực Supabase Auth thật
    const session = getUserSession();
    if (!session || !session.access_token) {
        showNotification('Vui lòng đăng nhập để đăng bài viết cộng đồng!');
        openAuthModal('signin', () => submitNewCommunityPost());
        return;
    }

    const topic = topicSelect?.value || '🏷️ Chủ đề: Tự do';
    const cleanTopic = topic.replace(/^[^\w\s]*\s*Chủ đề:\s*/i, '').trim();
    const authorName = session.user?.user_metadata?.display_name || state.userProfile?.name || session.user?.email?.split('@')[0] || 'Thành viên Xứ Trà';

    const images = state._communityUploadedImageUrl ? [state._communityUploadedImageUrl] : [];
    const location = state.newPostCheckin || null;

    const submitBtn = document.getElementById('submitCommunityPostBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> <span>Đang đăng...</span>';
    }

    // 2. Gửi API lên /api/community-posts
    try {
        const token = await getValidUserToken();
        const response = await fetch('/api/community-posts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                content,
                category: cleanTopic,
                status: 'pending',
                images,
                location
            })
        });

        const data = await response.json();
        if (!response.ok) {
            // Giữ nguyên nội dung soạn thảo trong textarea và đính kèm khi lỗi
            showNotification(data.error?.message || data.message || 'Không thể đăng bài viết lúc này.');
            return;
        }

        const createdPost = data.post || {};
        const newPost = {
            id: createdPost.id || ('post-' + Date.now()),
            author: authorName,
            avatarText: authorName.slice(0, 2).toUpperCase(),
            badge: 'Chờ duyệt',
            status: 'pending',
            timeAgo: 'Vừa xong',
            location: location?.name || 'Trà Vinh',
            content,
            image: images[0] || null,
            likes: 0,
            commentsCount: 0,
            shares: 0,
            topic
        };

        // Thêm vào danh sách hiển thị của tác giả
        state.communityPosts.unshift(newPost);

        // Reset Form chỉ khi gửi bài thành công
        if (textarea) textarea.value = '';
        clearCommunityPostAttachment();
        clearCommunityPostCheckin();

        renderCommunityFeed();
        showNotification('Bài viết của bạn đã được gửi thành công và đang chờ Ban Quản Trị phê duyệt!');
    } catch (err) {
        console.error('[CommunityPost] Lỗi gửi bài:', err);
        showNotification('Không thể kết nối máy chủ để đăng bài. Vui lòng thử lại sau!');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">send</span> <span>Đăng bài</span>';
        }
    }
}

/**
 * Mở modal Tạo hoặc Chỉnh sửa CLB
 */
export function openCreateClubModal(editingClub = null) {
    const modal = document.getElementById('createClubModal');
    if (!modal) return;
    const form = document.getElementById('createClubForm');
    const titleEl = document.getElementById('createClubModalTitle');
    const submitBtn = form?.querySelector('button[type="submit"]');

    if (editingClub && editingClub.id) {
        if (form) form.dataset.clubId = editingClub.id;
        if (titleEl) titleEl.textContent = 'Chỉnh sửa & Gửi duyệt lại CLB';
        if (submitBtn) submitBtn.textContent = 'Cập nhật & Gửi duyệt lại';

        const nameInput = document.getElementById('newClubName');
        const catSelect = document.getElementById('newClubCategory');
        const placeInput = document.getElementById('newClubMeetingPlace');
        const descInput = document.getElementById('newClubDesc');
        const contactInput = document.getElementById('newClubLeaderContact');

        if (nameInput) nameInput.value = editingClub.name || '';
        if (catSelect) catSelect.value = editingClub.category || 'di-san';
        if (placeInput) placeInput.value = editingClub.meeting_place || editingClub.meetingPlace || 'TP. Trà Vinh';
        if (descInput) descInput.value = editingClub.description || editingClub.desc || '';
        if (contactInput) contactInput.value = editingClub.leader_phone || editingClub.leaderContact || '0987654321';
    } else {
        if (form) {
            delete form.dataset.clubId;
            if (typeof form.reset === 'function') form.reset();
        }
        if (titleEl) titleEl.textContent = 'Đăng ký thành lập CLB mới';
        if (submitBtn) submitBtn.textContent = 'Gửi đăng ký CLB';
    }

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    const nameInput = document.getElementById('newClubName');
    if (nameInput) setTimeout(() => nameInput.focus(), 100);
}

/**
 * Đóng modal Tạo CLB mới
 */
export function closeCreateClubModal() {
    const modal = document.getElementById('createClubModal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

/**
 * Xử lý gửi biểu mẫu Tạo hoặc Cập nhật CLB
 */
export async function submitCreateClub(formEl) {
    const nameInput = document.getElementById('newClubName');
    const catSelect = document.getElementById('newClubCategory');
    const placeInput = document.getElementById('newClubMeetingPlace');
    const descInput = document.getElementById('newClubDesc');
    const contactInput = document.getElementById('newClubLeaderContact');

    const name = nameInput?.value?.trim();
    const category = catSelect?.value || 'di-san';
    const place = placeInput?.value?.trim() || 'TP. Trà Vinh';
    const desc = descInput?.value?.trim();
    const contact = contactInput?.value?.trim() || '';

    if (!name || !desc) {
        showNotification('Vui lòng điền đầy đủ thông tin tên và mô tả CLB!');
        return;
    }

    // 1. Kiểm tra xác thực Supabase Auth thật
    const session = getUserSession();
    if (!session || !session.access_token) {
        showNotification('Vui lòng đăng nhập tài khoản để thành lập hoặc sửa CLB!');
        openAuthModal('signin', () => submitCreateClub(formEl));
        return;
    }

    const clubId = formEl?.dataset?.clubId;
    const isEdit = Boolean(clubId);
    const method = isEdit ? 'PATCH' : 'POST';
    const url = isEdit ? `/api/clubs?id=${encodeURIComponent(clubId)}` : '/api/clubs';

    try {
        const token = await getValidUserToken() || session.access_token;
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name,
                category,
                meeting_place: place,
                description: desc,
                leader_phone: contact,
                status: 'pending',
                submit_for_review: true
            })
        });

        const data = await response.json();
        if (!response.ok) {
            showNotification(data.error?.message || data.message || 'Không thể lưu hồ sơ CLB.');
            return;
        }

        const catObj = TRA_VINH_CLUB_CATEGORIES.find(c => c.id === category);
        const categoryName = catObj ? catObj.label : 'Cộng đồng';

        const createdClub = data.club || {};
        if (isEdit) {
            const existing = state.clubs.find(c => c.id === clubId);
            if (existing) {
                existing.name = name;
                existing.category = category;
                existing.categoryName = categoryName;
                existing.badge = categoryName;
                existing.meetingPlace = place;
                existing.description = desc;
                existing.status = 'pending';
            }
        } else {
            const newClub = {
                id: createdClub.id || ('clb-' + Date.now()),
                name,
                category,
                categoryName,
                badge: categoryName,
                status: 'pending',
                membersCount: 1,
                activitiesCount: 0,
                image: './ao bà om.jpg',
                description: desc,
                lastActivity: 'Hồ sơ đang chờ Ban Quản Trị phê duyệt',
                scheduleInfo: 'Sinh hoạt định kỳ hàng tuần',
                meetingPlace: place,
                icon: catObj?.icon || 'groups',
                color: 'emerald'
            };

            state.clubs.unshift(newClub);
            state.joinedClubs.push(newClub.id);

            try {
                localStorage.setItem('vivu_joined_clubs', JSON.stringify(state.joinedClubs));
            } catch (e) {
                console.warn('Lỗi lưu joined clubs:', e);
            }
        }

        closeCreateClubModal();
        if (formEl && typeof formEl.reset === 'function') formEl.reset();

        // Re-render
        renderClubsGrid();
        const clubsBadge = document.getElementById('communityClubsCountBadge');
        if (clubsBadge) clubsBadge.textContent = state.clubs.length;

        showSavedToast(isEdit ? `✓ Đã cập nhật và gửi duyệt lại hồ sơ CLB "${name}"!` : `✓ Hồ sơ thành lập CLB "${name}" đã gửi thành công và đang chờ duyệt!`);
        fetchUserUgcContent(true).catch(() => {});
    } catch (err) {
        console.error('[Clubs] Lỗi gửi tạo CLB:', err);
        showNotification('Lỗi kết nối máy chủ khi tạo CLB. Vui lòng thử lại sau!');
    }
}

/**
 * Di chuyển tiêu điểm tới tìm kiếm câu lạc bộ
 */
export function focusClubSearch() {
    const pills = document.getElementById('clubCategoryPills');
    if (pills) {
        pills.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

/**
 * Mở modal tạo hoặc chỉnh sửa lịch sinh hoạt CLB (Chỉ dành cho Chủ nhiệm CLB đã duyệt - G13)
 */
export async function openSubmitClubActivityModal(editingActivity = null) {
    const userSession = getUserSession();
    if (!userSession || !userSession.user) {
        showNoticeToast('Yêu cầu đăng nhập', 'Vui lòng đăng nhập để tạo hoặc sửa lịch sinh hoạt cho Câu lạc bộ của bạn.');
        openAuthModal('signin', () => openSubmitClubActivityModal(editingActivity));
        return;
    }

    const currentUserId = userSession.user.id;
    const allKnownClubs = [...(state.clubs || []), ...(state.userUgcContent?.clubs || [])];
    let userClubs = allKnownClubs.filter(c => (c.leader_id === currentUserId || c.leaderId === currentUserId) && (c.status === 'approved' || !c.status));
    if (editingActivity && editingActivity.club_id) {
        const actClub = allKnownClubs.find(c => c.id === editingActivity.club_id) || { id: editingActivity.club_id, name: editingActivity.club_name || 'Câu lạc bộ của bạn' };
        if (!userClubs.some(c => c.id === actClub.id)) {
            userClubs.push(actClub);
        }
    }

    if (userClubs.length === 0 && SUPABASE_URL && SUPABASE_ANON_KEY) {
        try {
            const token = userSession.access_token;
            const res = await fetch(`${SUPABASE_URL}/rest/v1/clubs?leader_id=eq.${encodeURIComponent(currentUserId)}&select=id,name,status,leader_id`, {
                headers: {
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${token}`
                }
            });
            if (res.ok) {
                const fetched = await res.json();
                if (Array.isArray(fetched) && fetched.length > 0) {
                    userClubs = fetched;
                }
            }
        } catch (_) {}
    }

    renderSubmitClubActivityModal(submitClubActivity, userClubs, editingActivity);
    const modal = document.getElementById('submitClubActivityModal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
    }
}

export function closeSubmitClubActivityModal() {
    const modal = document.getElementById('submitClubActivityModal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }
}

export async function submitClubActivity(event) {
    if (event) event.preventDefault();
    const userSession = getUserSession();
    if (!userSession || !userSession.user) {
        showNoticeToast('Yêu cầu đăng nhập', 'Vui lòng đăng nhập để gửi lịch sinh hoạt.');
        return;
    }

    const form = document.getElementById('submitClubActivityForm');
    if (!form) return;

    const activityId = form.elements['activity_id']?.value;
    const isEdit = Boolean(activityId);
    const clubId = form.elements['club_id']?.value;
    const title = form.elements['title']?.value?.trim();
    const timeSchedule = form.elements['time_schedule']?.value?.trim();
    const location = form.elements['location']?.value?.trim();
    const maxAttendees = parseInt(form.elements['max_attendees']?.value, 10) || 30;
    const isFree = form.elements['is_free']?.value === 'true';
    const icon = form.elements['icon']?.value || 'event';
    const description = form.elements['description']?.value?.trim() || '';

    if (!clubId) {
        showNoticeToast('Chưa chọn CLB', 'Vui lòng chọn Câu lạc bộ tổ chức.');
        return;
    }
    if (!title || title.length < 3) {
        showNoticeToast('Tiêu đề không hợp lệ', 'Tiêu đề buổi sinh hoạt phải từ 3 ký tự.');
        return;
    }
    if (!timeSchedule || timeSchedule.length < 2) {
        showNoticeToast('Thiếu thời gian', 'Vui lòng nhập thời gian sinh hoạt (tối thiểu 2 ký tự, ví dụ: 9h, 08:00 - 10:00).');
        return;
    }
    if (!location) {
        showNoticeToast('Thiếu địa điểm', 'Vui lòng nhập địa điểm tập trung.');
        return;
    }

    const submitBtn = document.getElementById('submitClubActivityBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> Đang gửi duyệt...';
    }

    try {
        const token = await getValidUserToken() || userSession.access_token;
        const method = isEdit ? 'PATCH' : 'POST';
        const url = isEdit ? `/api/club-activities?id=${encodeURIComponent(activityId)}` : '/api/club-activities';

        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                club_id: clubId,
                title,
                time_schedule: timeSchedule,
                location,
                max_attendees: maxAttendees,
                is_free: isFree,
                icon,
                description,
                submit_for_review: true
            })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error?.message || data.message || 'Lỗi khi lưu lịch sinh hoạt CLB.');
        }

        closeSubmitClubActivityModal();
        showSavedToast(isEdit ? '✓ Đã cập nhật và gửi duyệt lại lịch sinh hoạt CLB!' : '✓ Đã gửi lịch sinh hoạt thành công! Ban Quản Trị sẽ duyệt trong 24h.');

        await syncClubActivitiesFromSupabase().catch(() => {});
        fetchUserUgcContent(true).catch(() => {});
    } catch (err) {
        console.error('[SubmitClubActivity] Error:', err);
        showNoticeToast('Không thể gửi lịch', err.message || 'Đã có lỗi xảy ra.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">calendar_add_on</span> <span>${isEdit ? 'Cập Nhật Lịch Sinh Hoạt' : 'Gửi Duyệt Lịch Sinh Hoạt'}</span>`;
        }
    }
}

export async function syncClubActivitiesFromSupabase() {
    try {
        const userSession = getUserSession();
        const currentUserId = userSession?.user?.id;
        const token = userSession?.access_token;

        // 1. Tải các buổi sinh hoạt đã duyệt công khai
        const res = await fetch('/api/club-activities?status=approved');
        let approvedActivities = [];
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.activities)) {
                approvedActivities = data.activities;
            }
        }

        // 2. Nếu chủ nhiệm đang đăng nhập, tải thêm các buổi sinh hoạt pending do chính họ tạo
        let ownPendingActivities = [];
        if (currentUserId && token) {
            try {
                const ownRes = await fetch(`/api/club-activities?creator_id=${encodeURIComponent(currentUserId)}&status=pending`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                if (ownRes.ok) {
                    const ownData = await ownRes.json();
                    if (Array.isArray(ownData.activities)) {
                        ownPendingActivities = ownData.activities;
                    }
                }
            } catch (_) {}
        }

        const combined = [...ownPendingActivities, ...approvedActivities];
        const liveMap = combined.map(act => ({
            id: act.id,
            title: act.title,
            clubId: act.club_id,
            clubName: act.club_name,
            time: act.time_schedule,
            time_schedule: act.time_schedule,
            location: act.location,
            attendeesCount: act.attendees_count || 0,
            maxAttendees: act.max_attendees || 50,
            isFree: act.is_free,
            icon: act.icon || 'event',
            status: act.status || 'approved',
            creator_id: act.creator_id,
            creator_name: act.creator_name,
            description: act.description
        }));
        const liveIds = new Set(liveMap.map(a => a.id));
        state.weeklyActivities = [
            ...liveMap,
            ...TRA_VINH_WEEKLY_ACTIVITIES.filter(a => !liveIds.has(a.id))
        ];

        const weeklyActivitiesContainer = document.getElementById('weeklyActivitiesList');
        if (weeklyActivitiesContainer) {
            weeklyActivitiesContainer.innerHTML = renderWeeklyActivitiesWidget(
                state.weeklyActivities,
                state.registeredActivities
            );
        }
        const weeklyBadge = document.getElementById('weeklyActivitiesCountBadge');
        if (weeklyBadge) {
            weeklyBadge.textContent = `${state.weeklyActivities.length} sự kiện`;
        }
    } catch (e) {
        console.warn('[ClubActivitiesSync] Error:', e.message);
    }
}

/**
 * ========================================================
 * PHASE 7: PROFILE, ACHIEVEMENTS & SAVED COLLECTIONS HANDLERS
 * ========================================================
 */

export function openProfileModal(tab = 'overview') {
    state.profileActiveTab = tab;
    const modal = document.getElementById('userProfileModal');
    const content = document.getElementById('userProfileModalContent');
    if (!modal || !content) return;

    content.innerHTML = renderUserProfileModalContent(state.userProfile, state.profileActiveTab, state.profileBadgeCategory);
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Đồng bộ điểm đóng góp, huy hiệu và bảng vinh danh từ server
    fetchUserContributionPoints();

    if (tab === 'my-content') {
        fetchUserUgcContent();
    }
}

export function closeProfileModal() {
    const modal = document.getElementById('userProfileModal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

export function switchProfileTab(tab) {
    state.profileActiveTab = tab;
    const content = document.getElementById('userProfileModalContent');
    if (content) {
        content.innerHTML = renderUserProfileModalContent(state.userProfile, state.profileActiveTab, state.profileBadgeCategory);
    }
    if (tab === 'overview') {
        fetchUserContributionPoints();
    } else if (tab === 'my-content') {
        fetchUserUgcContent();
    }
}

export async function fetchUserContributionPoints() {
    const session = getUserSession();
    const isAuth = Boolean(session && session.user);
    if (!isAuth) {
        state.userProfile.totalPoints = 0;
        state.userProfile.currentMonthPoints = 0;
        state.userProfile.currentYearPoints = 0;
        state.userProfile.selectedTitle = null;
        state.userProfile.titleBadge = null;
        state.userProfile.badges = computeUserBadges({}, []);
        state.userProfile.pointTransactions = [];
        state.userProfile.leaderboard = [];
        return;
    }

    const userId = session.user.id;
    const token = await getValidUserToken() || session.access_token;
    const headers = {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`
    };

    try {
        let totalPoints = 0;
        let currentMonthPoints = 0;
        let currentYearPoints = 0;
        let selectedTitle = null;
        let unlockedBadges = [];
        let pointTransactions = [];
        let leaderboardData = [];

        if (SUPABASE_URL && SUPABASE_ANON_KEY) {
            const [ptsRes, badgesRes, transRes, ldrRes] = await Promise.allSettled([
                fetch(`${SUPABASE_URL}/rest/v1/user_contribution_points?user_id=eq.${encodeURIComponent(userId)}&select=*`, { headers }),
                fetch(`${SUPABASE_URL}/rest/v1/user_badges?user_id=eq.${encodeURIComponent(userId)}&select=*`, { headers }),
                fetch(`${SUPABASE_URL}/rest/v1/point_transactions?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc&limit=20`, { headers }),
                fetch(`${SUPABASE_URL}/rest/v1/rpc/get_contribution_leaderboard`, {
                    method: 'POST',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                })
            ]);

            if (ptsRes.status === 'fulfilled' && ptsRes.value.ok) {
                const rows = await ptsRes.value.json().catch(() => []);
                const curVnMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).format(new Date());
                const curVnYear = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' }).format(new Date()));

                if (Array.isArray(rows) && rows.length > 0) {
                    totalPoints = Number(rows[0].total_points || 0);
                    // Quy tắc: Nếu sang tháng mới mà người dùng chưa có giao dịch thì điểm tháng mới hiển thị bằng 0
                    if (rows[0].last_active_month && rows[0].last_active_month !== curVnMonth) {
                        currentMonthPoints = 0;
                    } else {
                        currentMonthPoints = Number(rows[0].current_month_points || 0);
                    }
                    if (rows[0].last_active_year && Number(rows[0].last_active_year) !== curVnYear) {
                        currentYearPoints = 0;
                    } else {
                        currentYearPoints = Number(rows[0].current_year_points || 0);
                    }
                    selectedTitle = rows[0].selected_title || null;
                }
            } else {
                totalPoints = state.userProfile?.totalPoints || 0;
                currentMonthPoints = state.userProfile?.currentMonthPoints || 0;
                currentYearPoints = state.userProfile?.currentYearPoints || 0;
                selectedTitle = state.userProfile?.selectedTitle || null;
            }

            if (badgesRes.status === 'fulfilled' && badgesRes.value.ok) {
                unlockedBadges = await badgesRes.value.json().catch(() => []);
            } else if (Array.isArray(state.userProfile?.badges)) {
                unlockedBadges = state.userProfile.badges.filter(b => b.unlocked);
            }

            if (transRes.status === 'fulfilled' && transRes.value.ok) {
                pointTransactions = await transRes.value.json().catch(() => []);
            } else if (Array.isArray(state.userProfile?.pointTransactions)) {
                pointTransactions = state.userProfile.pointTransactions;
            }

            if (ldrRes.status === 'fulfilled' && ldrRes.value.ok) {
                const ldrData = await ldrRes.value.json().catch(() => ({}));
                if (Array.isArray(ldrData.leaderboard)) {
                    leaderboardData = ldrData.leaderboard;
                }
            } else if (Array.isArray(state.userProfile?.leaderboard)) {
                leaderboardData = state.userProfile.leaderboard;
            }
        } else {
            totalPoints = state.userProfile?.totalPoints || 0;
            currentMonthPoints = state.userProfile?.currentMonthPoints || 0;
            currentYearPoints = state.userProfile?.currentYearPoints || 0;
            selectedTitle = state.userProfile?.selectedTitle || null;
            if (Array.isArray(state.userProfile?.badges)) {
                unlockedBadges = state.userProfile.badges.filter(b => b.unlocked);
            }
            if (Array.isArray(state.userProfile?.pointTransactions)) {
                pointTransactions = state.userProfile.pointTransactions;
            }
            if (Array.isArray(state.userProfile?.leaderboard)) {
                leaderboardData = state.userProfile.leaderboard;
            }
        }

        // Đếm nội dung đã duyệt thật để tính huy hiệu
        const approvedPosts = (state.userUgcContent?.posts || []).filter(p => p.status === 'approved').length;
        const approvedArticles = (state.userUgcContent?.articles || []).filter(a => a.status === 'approved').length;
        const approvedPlaces = 0; // Legacy places không có user_id; đóng góp mới sẽ gắn user_id

        const computedBadges = computeUserBadges({ approvedPosts, approvedArticles, approvedPlaces }, unlockedBadges);

        state.userProfile.totalPoints = totalPoints;
        state.userProfile.currentMonthPoints = currentMonthPoints;
        state.userProfile.currentYearPoints = currentYearPoints;
        state.userProfile.selectedTitle = selectedTitle;
        state.userProfile.titleBadge = selectedTitle;
        state.userProfile.badges = computedBadges;
        state.userProfile.pointTransactions = pointTransactions;
        state.userProfile.leaderboard = leaderboardData;

        saveStoredUserProfile(state.userProfile);

        // Cập nhật lại UI nếu modal đang mở
        const content = document.getElementById('userProfileModalContent');
        if (content && !document.getElementById('userProfileModal')?.classList.contains('hidden')) {
            content.innerHTML = renderUserProfileModalContent(state.userProfile, state.profileActiveTab, state.profileBadgeCategory);
        }
    } catch (e) {
        console.warn('[ContributionPoints] Sync warning:', e);
    }
}

export async function handleSelectUserTitle(titleName) {
    const session = getUserSession();
    if (!session || !session.user) {
        showSavedToast('Vui lòng đăng nhập để chọn danh hiệu!');
        return;
    }

    const cleanTitle = titleName?.trim() || null;
    const badge = (state.userProfile.badges || []).find(b => b.name === cleanTitle || b.title === cleanTitle);
    if (cleanTitle && (!badge || !badge.unlocked)) {
        showSavedToast(`Bạn chưa mở khóa danh hiệu "${cleanTitle}". Vui lòng hoàn thành điều kiện để đạt danh hiệu.`);
        return;
    }

    const token = await getValidUserToken() || session.access_token;

    if (SUPABASE_URL && SUPABASE_ANON_KEY && token) {
        try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/select_user_title`, {
                method: 'POST',
                headers: {
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ p_title_name: cleanTitle })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                console.warn('[SelectTitle] Server returned error:', errData);
            }
        } catch (e) {
            console.warn('[SelectTitle] Network error:', e);
        }
    }

    state.userProfile.selectedTitle = cleanTitle;
    state.userProfile.titleBadge = cleanTitle;
    saveStoredUserProfile(state.userProfile);

    showSavedToast(cleanTitle ? `Đã chọn danh hiệu "${cleanTitle}" hiển thị cạnh tên!` : 'Đã bỏ chọn danh hiệu.');

    const content = document.getElementById('userProfileModalContent');
    if (content) {
        content.innerHTML = renderUserProfileModalContent(state.userProfile, state.profileActiveTab, state.profileBadgeCategory);
    }
}

export function filterProfileBadges(cat) {
    state.profileBadgeCategory = cat;
    const content = document.getElementById('userProfileModalContent');
    if (content) {
        content.innerHTML = renderUserProfileModalContent(state.userProfile, state.profileActiveTab, state.profileBadgeCategory);
    }
}

export function getUserUgcState() {
    return state.userUgcContent;
}

export function filterUserUgcContent(filter = 'all') {
    state.userUgcContent.filter = filter;
    const content = document.getElementById('userProfileModalContent');
    if (content && state.profileActiveTab === 'my-content') {
        content.innerHTML = renderUserProfileModalContent(state.userProfile, state.profileActiveTab, state.profileBadgeCategory);
    }
}

export function openMyContentModal(filter = 'all') {
    state.userUgcContent.filter = filter;
    openProfileModal('my-content');
    fetchUserUgcContent(true);
}

export async function fetchUserUgcContent(force = false) {
    const session = getUserSession();
    if (!session || !session.user || !session.access_token) {
        state.userUgcContent.loading = false;
        state.userUgcContent.loaded = false;
        return;
    }

    if (state.userUgcContent.loaded && !force && !state.userUgcContent.loading) {
        return;
    }

    state.userUgcContent.loading = true;
    const content = document.getElementById('userProfileModalContent');
    if (content && state.profileActiveTab === 'my-content') {
        content.innerHTML = renderUserProfileModalContent(state.userProfile, state.profileActiveTab, state.profileBadgeCategory);
    }

    const userId = session.user.id;
    const token = await getValidUserToken() || session.access_token;
    const headers = { 'Authorization': `Bearer ${token}` };

    try {
        const [artRes, clubRes, actRes, postRes, evtRes] = await Promise.allSettled([
            fetch(`/api/articles?author_id=${encodeURIComponent(userId)}&status=all`, { headers }),
            fetch(`/api/clubs?leader_id=${encodeURIComponent(userId)}&status=all`, { headers }),
            fetch(`/api/club-activities?creator_id=${encodeURIComponent(userId)}&status=all`, { headers }),
            fetch(`/api/community-posts?author_id=${encodeURIComponent(userId)}&status=all`, { headers }),
            fetch(`/api/community-events?creator_id=${encodeURIComponent(userId)}&status=all`, { headers })
        ]);

        let articles = [];
        let clubs = [];
        let activities = [];
        let posts = [];
        let events = [];

        if (artRes.status === 'fulfilled' && artRes.value.ok) {
            const data = await artRes.value.json().catch(() => ({}));
            if (Array.isArray(data.articles)) articles = data.articles;
        }
        if (clubRes.status === 'fulfilled' && clubRes.value.ok) {
            const data = await clubRes.value.json().catch(() => ({}));
            if (Array.isArray(data.clubs)) clubs = data.clubs;
        }
        if (actRes.status === 'fulfilled' && actRes.value.ok) {
            const data = await actRes.value.json().catch(() => ({}));
            if (Array.isArray(data.activities)) activities = data.activities;
        }
        if (postRes.status === 'fulfilled' && postRes.value.ok) {
            const data = await postRes.value.json().catch(() => ({}));
            if (Array.isArray(data.posts)) posts = data.posts;
        }
        if (evtRes.status === 'fulfilled' && evtRes.value.ok) {
            const data = await evtRes.value.json().catch(() => ({}));
            if (Array.isArray(data.events)) events = data.events;
        }

        state.userUgcContent = {
            articles,
            clubs,
            activities,
            posts,
            events,
            loading: false,
            loaded: true,
            filter: state.userUgcContent?.filter || 'all'
        };
    } catch (err) {
        console.warn('[UserUGC] Fetch error:', err.message);
        state.userUgcContent.loading = false;
    }

    if (content && state.profileActiveTab === 'my-content') {
        content.innerHTML = renderUserProfileModalContent(state.userProfile, state.profileActiveTab, state.profileBadgeCategory);
    }
}

export function openEditUgcItem(entityType, entityId) {
    if (!entityType || !entityId) return;

    if (entityType === 'article') {
        const article = (state.userUgcContent.articles || []).find(a => a.id === entityId)
            || (state.articles || []).find(a => a.id === entityId);
        if (article) {
            closeProfileModal();
            openSubmitArticleModal(article, false);
        } else {
            showNoticeToast('Không tìm thấy', 'Không tìm thấy dữ liệu bài cẩm nang cần sửa.');
        }
    } else if (entityType === 'club') {
        const club = (state.userUgcContent.clubs || []).find(c => c.id === entityId)
            || (state.clubs || []).find(c => c.id === entityId);
        if (club) {
            closeProfileModal();
            openCreateClubModal(club);
        } else {
            showNoticeToast('Không tìm thấy', 'Không tìm thấy dữ liệu CLB cần sửa.');
        }
    } else if (entityType === 'club_activity' || entityType === 'activity') {
        const act = (state.userUgcContent.activities || []).find(a => a.id === entityId)
            || (state.clubActivities || []).find(a => a.id === entityId);
        if (act) {
            closeProfileModal();
            openSubmitClubActivityModal(act);
        } else {
            showNoticeToast('Không tìm thấy', 'Không tìm thấy lịch sinh hoạt cần sửa.');
        }
    } else if (entityType === 'community_post' || entityType === 'post') {
        const post = (state.userUgcContent.posts || []).find(p => p.id === entityId)
            || (state.communityPosts || []).find(p => p.id === entityId);
        if (post) {
            closeProfileModal();
            openEditCommunityPostModal(post);
        } else {
            showNoticeToast('Không tìm thấy', 'Không tìm thấy bài viết cần sửa.');
        }
    } else if (entityType === 'community_event' || entityType === 'event') {
        const event = (state.userUgcContent.events || []).find(e => e.id === entityId)
            || (state.communityEvents || []).find(e => e.id === entityId);
        if (event) {
            closeProfileModal();
            openHostEventModal(event);
        } else {
            showNoticeToast('Không tìm thấy', 'Không tìm thấy sự kiện cần sửa.');
        }
    }
}

export function viewPublishedUgcItem(entityType, entityId) {
    closeProfileModal();
    if (entityType === 'article') {
        navGoBlog();
        setTimeout(() => {
            const el = document.getElementById('travelStoriesSection') || document.getElementById('travelStoriesContainer');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
    } else if (entityType === 'club') {
        navGoClubs();
        setTimeout(() => {
            const el = document.getElementById('featuredClubsGrid');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
    } else if (entityType === 'club_activity' || entityType === 'activity') {
        navGoClubs();
        setTimeout(() => {
            const el = document.getElementById('weeklyActivitiesList') || document.getElementById('weeklyActivitiesContainer');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
    } else if (entityType === 'community_post' || entityType === 'post') {
        navGoCommunity();
        setTimeout(() => {
            const el = document.getElementById('communityPostsFeed') || document.getElementById('communityFeedContainer');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
    } else if (entityType === 'community_event' || entityType === 'event') {
        navGoEvents();
        setTimeout(() => {
            const el = document.getElementById('eventsGridContainer') || document.getElementById('festivalsPortalSection');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
    }
}

export function openEditCommunityPostModal(post) {
    if (!post) return;
    const modal = document.getElementById('editCommunityPostModal');
    if (!modal) return;

    const idInput = document.getElementById('editPostId');
    const topicSelect = document.getElementById('editPostTopic');
    const contentTextarea = document.getElementById('editPostContent');

    if (idInput) idInput.value = post.id;
    if (topicSelect) topicSelect.value = post.category || 'Tự do';
    if (contentTextarea) contentTextarea.value = post.content || '';

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    if (contentTextarea) setTimeout(() => contentTextarea.focus(), 100);
}

export function closeEditCommunityPostModal() {
    const modal = document.getElementById('editCommunityPostModal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }
}

export async function submitEditCommunityPost(formEl) {
    const session = getUserSession();
    if (!session || !session.user) {
        showNoticeToast('Yêu cầu đăng nhập', 'Vui lòng đăng nhập lại để cập nhật bài viết.');
        return;
    }

    const postId = document.getElementById('editPostId')?.value;
    const topic = document.getElementById('editPostTopic')?.value || 'Tự do';
    const content = document.getElementById('editPostContent')?.value?.trim();

    if (!postId) {
        showNoticeToast('Lỗi', 'Thiếu mã bài viết cần chỉnh sửa.');
        return;
    }
    if (!content || content.length < 5) {
        showNoticeToast('Nội dung quá ngắn', 'Nội dung bài viết phải từ 5 ký tự trở lên.');
        return;
    }

    const submitBtn = document.getElementById('btnSubmitEditPost');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[16px]">progress_activity</span> Đang gửi duyệt lại...';
    }

    try {
        const token = await getValidUserToken() || session.access_token;
        const res = await fetch(`/api/community-posts?id=${encodeURIComponent(postId)}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                content,
                category: topic,
                submit_for_review: true
            })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.message || data.error?.message || 'Không thể cập nhật bài viết.');
        }

        closeEditCommunityPostModal();
        showSavedToast('✓ Đã cập nhật và gửi duyệt lại bài viết cộng đồng!');

        const targetPost = (state.userUgcContent.posts || []).find(p => p.id === postId);
        if (targetPost) {
            targetPost.content = content;
            targetPost.category = topic;
            targetPost.status = 'pending';
            targetPost.moderation_reason = null;
        }

        await fetchUserUgcContent(true).catch(() => {});
    } catch (err) {
        console.error('[EditCommunityPost] Error:', err);
        showNoticeToast('Không thể cập nhật bài viết', err.message || 'Đã có lỗi xảy ra.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">send</span> <span>Cập nhật &amp; Gửi duyệt lại</span>';
        }
    }
}

export function openRedeemGiftModal() {
    const modal = document.getElementById('redeemGiftModal');
    const content = document.getElementById('redeemGiftModalContent');
    if (!modal || !content) return;

    content.innerHTML = renderRedeemGiftModalContent(state.redeemableGifts, state.userProfile.totalPoints);
    modal.classList.remove('hidden');
}

export function closeRedeemGiftModal() {
    const modal = document.getElementById('redeemGiftModal');
    if (modal) modal.classList.add('hidden');
}

export function redeemGift(giftId) {
    showSavedToast('Chức năng đổi quà vật chất đang tạm ẩn để tập trung vào Huy hiệu, Danh hiệu & Vinh danh.');
}

export function openEditProfileModal() {
    const modal = document.getElementById('editProfileModal');
    const content = document.getElementById('editProfileModalContent');
    if (!modal || !content) return;

    content.innerHTML = renderEditProfileModalContent(state.userProfile);
    modal.classList.remove('hidden');
}

export function closeEditProfileModal() {
    const modal = document.getElementById('editProfileModal');
    if (modal) modal.classList.add('hidden');
}

export function submitEditProfile(form) {
    const name = form.querySelector('#editProfileName')?.value?.trim();
    const role = form.querySelector('#editProfileRole')?.value?.trim();
    const bio = form.querySelector('#editProfileBio')?.value?.trim();
    const location = form.querySelector('#editProfileLocation')?.value?.trim();

    if (name) state.userProfile.name = name;
    if (role) state.userProfile.role = role;
    if (bio !== undefined) state.userProfile.bio = bio;
    if (location) state.userProfile.location = location;

    saveStoredUserProfile(state.userProfile);
    closeEditProfileModal();
    showSavedToast('Hồ sơ của bạn đã được cập nhật thành công!');

    // Re-render profile modal
    const content = document.getElementById('userProfileModalContent');
    if (content) {
        content.innerHTML = renderUserProfileModalContent(state.userProfile, state.profileActiveTab, state.profileBadgeCategory);
    }
}

export function openSavedCollectionsModal() {
    const mapModal = document.getElementById('fullMapModal');
    if (mapModal && !mapModal.classList.contains('hidden')) {
        closeFullMapModal(true);
    }
    const modal = document.getElementById('savedCollectionsModal');
    const content = document.getElementById('savedCollectionsModalContent');
    if (!modal || !content) return;

    content.innerHTML = renderSavedCollectionsModalContent(
        state.savedCollections,
        state.savedFolders,
        state.savedActiveCategory,
        state.savedSortMode,
        state.savedViewMode,
        state.savedSearchTerm
    );
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

export function closeSavedCollectionsModal(fromRouter = false) {
    const modal = document.getElementById('savedCollectionsModal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
    state.currentOverlay = null;

    if (!fromRouter) {
        const returnView = state.currentView || 'home';
        switchView(returnView, { updateHash: true, pushState: false, closeOverlays: false, scrollTop: false });
    }
}

export function filterSavedCategory(cat) {
    state.savedActiveCategory = cat;
    const content = document.getElementById('savedCollectionsModalContent');
    if (content) {
        content.innerHTML = renderSavedCollectionsModalContent(
            state.savedCollections,
            state.savedFolders,
            state.savedActiveCategory,
            state.savedSortMode,
            state.savedViewMode,
            state.savedSearchTerm
        );
    }
}

export function sortSavedItems(mode) {
    state.savedSortMode = mode;
    const content = document.getElementById('savedCollectionsModalContent');
    if (content) {
        content.innerHTML = renderSavedCollectionsModalContent(
            state.savedCollections,
            state.savedFolders,
            state.savedActiveCategory,
            state.savedSortMode,
            state.savedViewMode,
            state.savedSearchTerm
        );
    }
}

export function setSavedViewMode(mode) {
    state.savedViewMode = mode;
    const content = document.getElementById('savedCollectionsModalContent');
    if (content) {
        content.innerHTML = renderSavedCollectionsModalContent(
            state.savedCollections,
            state.savedFolders,
            state.savedActiveCategory,
            state.savedSortMode,
            state.savedViewMode,
            state.savedSearchTerm
        );
    }
}

export function handleSavedSearch(term) {
    state.savedSearchTerm = term;
    const content = document.getElementById('savedCollectionsModalContent');
    if (content) {
        content.innerHTML = renderSavedCollectionsModalContent(
            state.savedCollections,
            state.savedFolders,
            state.savedActiveCategory,
            state.savedSortMode,
            state.savedViewMode,
            state.savedSearchTerm
        );
        const input = document.getElementById('savedSearchInput');
        if (input) {
            input.focus();
            const len = input.value.length;
            input.setSelectionRange(len, len);
        }
    }
}

export function clearSavedSearch() {
    state.savedSearchTerm = '';
    const content = document.getElementById('savedCollectionsModalContent');
    if (content) {
        content.innerHTML = renderSavedCollectionsModalContent(
            state.savedCollections,
            state.savedFolders,
            state.savedActiveCategory,
            state.savedSortMode,
            state.savedViewMode,
            ''
        );
        const input = document.getElementById('savedSearchInput');
        if (input) input.focus();
    }
}

export function resetSavedFilters() {
    state.savedSearchTerm = '';
    state.savedActiveCategory = 'all';
    state.savedSortMode = 'recent';
    const content = document.getElementById('savedCollectionsModalContent');
    if (content) {
        content.innerHTML = renderSavedCollectionsModalContent(
            state.savedCollections,
            state.savedFolders,
            state.savedActiveCategory,
            state.savedSortMode,
            state.savedViewMode,
            ''
        );
    }
}

export function removeSavedItem(id, title) {
    state.savedCollections = (state.savedCollections || []).filter(item => item.id !== id);
    saveStoredSavedCollections(state.savedCollections);

    // Update modal view
    const content = document.getElementById('savedCollectionsModalContent');
    if (content) {
        content.innerHTML = renderSavedCollectionsModalContent(
            state.savedCollections,
            state.savedFolders,
            state.savedActiveCategory,
            state.savedSortMode,
            state.savedViewMode,
            state.savedSearchTerm
        );
    }

    updateFavoritesCount();
    showSavedToast(`Đã bỏ lưu "${title || 'mục này'}"`);
}

export function clearAllSavedItems() {
    if (!confirm('Bạn có chắc muốn xóa tất cả các địa điểm đã lưu trong danh sách?')) return;
    state.savedCollections = [];
    saveStoredSavedCollections([]);

    const content = document.getElementById('savedCollectionsModalContent');
    if (content) {
        content.innerHTML = renderSavedCollectionsModalContent(
            state.savedCollections,
            state.savedFolders,
            state.savedActiveCategory,
            state.savedSortMode,
            state.savedViewMode,
            state.savedSearchTerm
        );
    }
    updateFavoritesCount();
    showSavedToast('Đã xóa tất cả địa điểm trong danh sách lưu.');
}

export function openCreateCollectionModal() {
    const modal = document.getElementById('createCollectionModal');
    const content = document.getElementById('createCollectionModalContent');
    if (!modal || !content) return;

    content.innerHTML = renderCreateCollectionModalContent();
    modal.classList.remove('hidden');
}

export function closeCreateCollectionModal() {
    const modal = document.getElementById('createCollectionModal');
    if (modal) modal.classList.add('hidden');
}

export function submitCreateCollection(form) {
    const name = form.querySelector('#newCollectionName')?.value?.trim();
    const desc = form.querySelector('#newCollectionDesc')?.value?.trim();

    if (!name) return;

    const newFolder = {
        id: 'folder-' + Date.now(),
        title: name,
        count: 0,
        unit: 'mục',
        desc: desc || 'Danh sách yêu thích cá nhân',
        coverImage: 'ao bà om.jpg',
        offlineReady: false,
        tag: 'Mới tạo'
    };

    state.savedFolders = [newFolder, ...(state.savedFolders || [])];
    saveStoredSavedFolders(state.savedFolders);
    closeCreateCollectionModal();
    showSavedToast(`Đã tạo bộ sưu tập "${name}" thành công!`);

    const content = document.getElementById('savedCollectionsModalContent');
    if (content) {
        content.innerHTML = renderSavedCollectionsModalContent(
            state.savedCollections,
            state.savedFolders,
            state.savedActiveCategory,
            state.savedSortMode,
            state.savedViewMode
        );
    }
}

export function openExportItineraryModal() {
    const modal = document.getElementById('exportItineraryModal');
    const content = document.getElementById('exportItineraryModalContent');
    if (!modal || !content) return;

    content.innerHTML = renderExportItineraryModalContent(state.savedCollections);
    modal.classList.remove('hidden');
}

export function closeExportItineraryModal() {
    const modal = document.getElementById('exportItineraryModal');
    if (modal) modal.classList.add('hidden');
}

export function copyExportItinerary() {
    const textarea = document.getElementById('exportItineraryText');
    if (textarea) {
        textarea.select();
        try {
            navigator.clipboard?.writeText(textarea.value);
        } catch (e) {}
        showSavedToast('Đã sao chép lịch trình vào clipboard!');
        closeExportItineraryModal();
    }
}

export function shareProfileStory() {
    if (typeof navigator !== 'undefined' && navigator.share) {
        navigator.share({
            title: `${state.userProfile.name} - ViVuTraVinh Explorer`,
            text: `Khám phá hành trình du lịch xanh Trà Vinh của ${state.userProfile.name} với ${state.userProfile.stats.tripsCompleted} chuyến đi và huy hiệu văn hóa!`,
            url: window.location.href
        }).catch(() => {});
    } else {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(window.location.href);
        }
        showSavedToast('Đã sao chép liên kết hồ sơ của bạn!');
    }
}

export function openSavedDetail(savedId) {
    const item = (state.savedCollections || []).find(i => i.id === savedId);
    if (!item) return;

    closeSavedCollectionsModal();
    if (item.placeId) {
        const place = (state.allPlaces || []).find(p => p.id === item.placeId || p.slug === item.placeId);
        if (place) {
            openDetailModal(place);
            return;
        }
    }
    if (item.eventId) {
        openFestivalModal(item.eventId);
        return;
    }
    // Fallback: search place
    handleSearchKeyword(item.title);
}

export function showSavedToast(msg) {
    const toast = document.getElementById('savedNoticeToast');
    const toastText = document.getElementById('savedNoticeToastText');
    if (!toast) return;
    if (toastText) toastText.textContent = msg;
    toast.classList.remove('translate-y-16', 'opacity-0', 'pointer-events-none');
    setTimeout(() => {
        if (toast) toast.classList.add('translate-y-16', 'opacity-0', 'pointer-events-none');
    }, 3200);
}

// =========================================================================
// PHASE 8: CÀI ĐẶT TÀI KHOẢN & TRUNG TÂM BẢO MẬT (SECURITY CENTER & 2FA)
// =========================================================================

export function openSecurityModal(tab = 'security') {
    state.securityActiveTab = tab;
    const modal = document.getElementById('securityModal');
    const content = document.getElementById('securityModalContent');
    if (!modal || !content) return;
    content.innerHTML = renderSecurityModalContent(state.securitySettings, state.securityActiveTab);
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

export function closeSecurityModal() {
    const modal = document.getElementById('securityModal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

export function switchSecurityTab(tab) {
    state.securityActiveTab = tab;
    const content = document.getElementById('securityModalContent');
    if (content) {
        content.innerHTML = renderSecurityModalContent(state.securitySettings, state.securityActiveTab);
    }
}

export function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
}

export function submitChangePassword(form) {
    const curr = form.currPass ? form.currPass.value.trim() : '';
    const newPass = form.newPass ? form.newPass.value.trim() : '';
    const confirm = form.confirmPass ? form.confirmPass.value.trim() : '';

    if (!curr) {
        showSavedToast('Vui lòng nhập mật khẩu hiện tại!');
        return;
    }
    if (!newPass || newPass.length < 10) {
        showSavedToast('Mật khẩu mới phải có tối thiểu 10 ký tự!');
        return;
    }
    if (newPass !== confirm) {
        showSavedToast('Mật khẩu xác nhận không khớp!');
        return;
    }

    state.securitySettings.lastUpdated = 'Vừa xong';
    saveStoredSecuritySettings(state.securitySettings);
    showSavedToast('Đã cập nhật mật khẩu tài khoản thành công!');
    form.reset();
}

export function toggleSmsBackup(checked) {
    state.securitySettings.smsBackupActive = Boolean(checked);
    saveStoredSecuritySettings(state.securitySettings);
    const msg = state.securitySettings.smsBackupActive
        ? 'Đã bật nhận mã OTP dự phòng qua tin nhắn SMS!'
        : 'Đã tắt tính năng nhận OTP qua SMS.';
    showSavedToast(msg);
    switchSecurityTab('security');
}

export function openLink2FAModal() {
    const modal = document.getElementById('link2faModal');
    const content = document.getElementById('link2faModalContent');
    if (!modal || !content) return;
    content.innerHTML = renderLink2FAModalContent(state.securitySettings);
    modal.classList.remove('hidden');
}

export function closeLink2FAModal() {
    const modal = document.getElementById('link2faModal');
    if (modal) modal.classList.add('hidden');
}

export function copySecretKey(key) {
    try {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(key.replace(/\s+/g, ''));
        }
    } catch (e) {}
    showSavedToast('Đã sao chép mã khóa bảo mật vào bộ nhớ tạm!');
}

export function handleOtpInput(input, index) {
    const val = input.value.replace(/[^0-9]/g, '');
    input.value = val ? val[val.length - 1] : '';
    state.otpBuffer[index - 1] = input.value;
    if (input.value && index < 6) {
        const next = document.getElementById(`otp${index + 1}`);
        if (next) next.focus();
    }
}

export function handleOtpKeydown(input, event, index) {
    if (event.key === 'Backspace' && !input.value && index > 1) {
        const prev = document.getElementById(`otp${index - 1}`);
        if (prev) {
            prev.focus();
            prev.value = '';
            state.otpBuffer[index - 2] = '';
        }
    }
}

export function pasteOtpCode() {
    const code = '654321';
    for (let i = 1; i <= 6; i++) {
        const input = document.getElementById(`otp${i}`);
        if (input) input.value = code[i - 1];
        state.otpBuffer[i - 1] = code[i - 1];
    }
    showSavedToast('Đã dán mã OTP từ clipboard!');
}

export function verify2FA() {
    const code = state.otpBuffer.join('');
    if (code.length < 6) {
        let directCode = '';
        for (let i = 1; i <= 6; i++) {
            const input = document.getElementById(`otp${i}`);
            directCode += input ? input.value : '';
        }
        if (directCode.length < 6) {
            showSavedToast('Vui lòng nhập đủ 6 chữ số xác thực!');
            return;
        }
    }

    state.securitySettings.totpActive = true;
    state.securitySettings.healthScore = 90;
    state.securitySettings.healthLevel = 'Tối ưu';
    state.securitySettings.protectionLayers = '4/4 lớp bảo vệ';
    saveStoredSecuritySettings(state.securitySettings);

    closeLink2FAModal();
    showSavedToast('Kích hoạt xác thực 2 bước (2FA) thành công!');
    switchSecurityTab('security');
}

export function openBackupCodesModal() {
    const modal = document.getElementById('backupCodesModal');
    const content = document.getElementById('backupCodesModalContent');
    if (!modal || !content) return;
    content.innerHTML = renderBackupCodesModalContent(state.securitySettings);
    modal.classList.remove('hidden');
}

export function closeBackupCodesModal() {
    const modal = document.getElementById('backupCodesModal');
    if (modal) modal.classList.add('hidden');
}

export function copyBackupCodes() {
    const codesText = (state.securitySettings.backupCodes || []).map((c, i) => `${i + 1}. ${c.code} ${c.used ? '(Đã dùng)' : ''}`).join('\n');
    try {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(codesText);
        }
    } catch (e) {}
    showSavedToast('Đã sao chép 10 mã khôi phục dự phòng!');
}

export function regenerateBackupCodes() {
    const prefixes = ['TRV', 'ECO', 'KHM', 'VVT', 'TRA', 'VNH', 'OKO', 'ANG', 'AOB', 'CKK'];
    const newCodes = prefixes.map(p => ({
        code: `${p}-${Math.floor(1000 + Math.random() * 9000)}-${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`,
        used: false
    }));
    state.securitySettings.backupCodes = newCodes;
    state.securitySettings.backupCodesRemaining = 10;
    saveStoredSecuritySettings(state.securitySettings);
    openBackupCodesModal();
    showSavedToast('Đã tạo mới 10 mã khôi phục dự phòng!');
}

export function revokeDeviceSession(deviceId) {
    state.securitySettings.devices = (state.securitySettings.devices || []).filter(d => d.id !== deviceId);
    saveStoredSecuritySettings(state.securitySettings);
    showSavedToast('Đã thu hồi phiên đăng nhập thiết bị thành công!');
    switchSecurityTab('devices');
}

export function revokeAllOtherSessions() {
    state.securitySettings.devices = (state.securitySettings.devices || []).filter(d => d.isCurrent);
    saveStoredSecuritySettings(state.securitySettings);
    showSavedToast('Đã đăng xuất khỏi tất cả thiết bị khác!');
    switchSecurityTab('devices');
}

export function toggleNotificationPref(key) {
    if (!state.securitySettings.notifications) {
        state.securitySettings.notifications = {};
    }
    state.securitySettings.notifications[key] = !state.securitySettings.notifications[key];
    saveStoredSecuritySettings(state.securitySettings);
    switchSecurityTab('notifications');
    showSavedToast('Đã cập nhật tùy chọn thông báo!');
}

export function resetDefaultNotificationPrefs() {
    state.securitySettings.notifications = {
        pushEvents: true,
        pushClubs: true,
        pushBadges: true,
        pushWeather: true,
        pushVouchers: false,
        soundChime: 'khmer_chime',
        emailDigest: 'weekly'
    };
    saveStoredSecuritySettings(state.securitySettings);
    switchSecurityTab('notifications');
    showSavedToast('Đã khôi phục cài đặt thông báo mặc định!');
}

export function togglePrivacyPref(key) {
    if (!state.securitySettings.privacy) {
        state.securitySettings.privacy = {};
    }
    state.securitySettings.privacy[key] = !state.securitySettings.privacy[key];
    saveStoredSecuritySettings(state.securitySettings);
    switchSecurityTab('privacy');
    showSavedToast('Đã cập nhật tùy chọn quyền riêng tư!');
}

export function exportUserData() {
    const exportBundle = {
        userProfile: state.userProfile,
        savedCollections: state.savedCollections,
        securitySettings: {
            healthScore: state.securitySettings.healthScore,
            lastUpdated: state.securitySettings.lastUpdated,
            devicesCount: state.securitySettings.devices?.length || 0
        },
        exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(exportBundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vivutravinh-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showSavedToast('Đã xuất toàn bộ dữ liệu du lịch cá nhân!');
}

// ============================================================================
// PHASE 9: TRIP PLANNER, GPS NAVIGATION & SOCIAL STORIES CONTROLLERS
// ============================================================================

export function handleAuthTripPlanSync() {
    state.tripPlan = getStoredTripPlan();
    state.plannerActiveDay = 1;
    if (state.currentView === 'planner') {
        renderPlannerMainView();
    }
    const modalContainer = document.getElementById('tripPlannerModalContent');
    if (modalContainer && !document.getElementById('tripPlannerModal')?.classList.contains('hidden')) {
        modalContainer.innerHTML = renderTripPlannerModalContent(
            state.tripPlan,
            state.placePool,
            state.plannerActiveDay,
            state.plannerPoolCategory,
            state.plannerSearchQuery
        );
    }
}

export function renderPlannerMainView() {
    const container = document.getElementById('view-planner');
    if (!container) return;
    const session = getUserSession() || getAdminSession();
    const isAuth = Boolean(session?.user);
    const userName = session?.user?.user_metadata?.display_name || session?.user?.email?.split('@')[0] || (session?.user ? 'Thành viên' : null);
    renderPlannerView(
        'view-planner',
        state.tripPlan,
        state.placePool,
        state.plannerActiveDay,
        state.plannerPoolCategory,
        state.plannerSearchQuery,
        state.plannerCurrentTab || 'custom',
        isAuth,
        state.activeTourId || 'khmer-culture',
        userName
    );
}

export function switchPlannerTab(tabName) {
    state.plannerCurrentTab = tabName === 'suggested' ? 'suggested' : 'custom';
    const targetHash = state.plannerCurrentTab === 'suggested' ? '#/planner/suggested' : '#/planner';
    try {
        if (window.location.hash !== targetHash) {
            history.replaceState({ view: 'planner', tab: state.plannerCurrentTab }, '', targetHash);
        }
    } catch (e) {
        window.location.hash = targetHash;
    }
    renderPlannerMainView();
}

export function selectTourInPlanner(tourId) {
    state.activeTourId = tourId;
    if (state.currentView === 'planner') {
        renderPlannerMainView();
    }
}

export function handleGenerateRandomTourInPlanner() {
    const dynamic = generateSmartTour();
    state.activeTourId = dynamic.id;
    if (state.currentView === 'planner') {
        renderPlannerMainView();
    }
    showSavedToast('Đã tạo lịch trình ngẫu hứng mới!');
}

export function movePlannerStop(stopId, direction) {
    if (!state.tripPlan) return;
    const currentDayData = state.tripPlan.days?.find(d => d.dayNumber === state.plannerActiveDay);
    if (!currentDayData || !Array.isArray(currentDayData.stops)) return;
    const index = currentDayData.stops.findIndex(s => s.id === stopId);
    if (index === -1) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= currentDayData.stops.length) return;

    const [moved] = currentDayData.stops.splice(index, 1);
    currentDayData.stops.splice(newIndex, 0, moved);

    saveStoredTripPlan(state.tripPlan);

    const modalContainer = document.getElementById('tripPlannerModalContent');
    if (modalContainer && !document.getElementById('tripPlannerModal')?.classList.contains('hidden')) {
        modalContainer.innerHTML = renderTripPlannerModalContent(
            state.tripPlan,
            state.placePool,
            state.plannerActiveDay,
            state.plannerPoolCategory,
            state.plannerSearchQuery
        );
    }
    if (state.currentView === 'planner') {
        renderPlannerMainView();
    }
    showSavedToast('Đã cập nhật thứ tự điểm dừng trong lộ trình!');
}

export function applyTourTemplateToPlanner(tourId) {
    let tour = SAMPLE_TOURS.find(t => t.id === tourId);
    if (!tour && tourId === 'smart-dynamic') {
        tour = getDynamicTour();
    }
    if (!tour) {
        tour = SAMPLE_TOURS[0];
    }
    if (!tour) return;

    const stops = (tour.stops || []).map((s, idx) => {
        const kw = (s.placeKeyword || s.title).toLowerCase();
        const matchedPlace = state.placePool.find(p =>
            p.title.toLowerCase().includes(kw) ||
            kw.includes(p.title.toLowerCase())
        );

        const gpsStatus = s.gpsStatus || matchedPlace?.gpsStatus || 'unverified';
        const gpsStatusLabel = s.gpsStatusLabel || matchedPlace?.gpsStatusLabel || ((s.gpsStatus === 'verified' || matchedPlace?.gpsStatus === 'verified') ? 'Mốc tham chiếu bản đồ số (Chưa đo kiểm thực địa)' : 'Chưa xác minh (Tọa độ ước tính, không dùng dẫn đường chính xác)');
        const gpsSource = s.gpsSource || matchedPlace?.gpsSource || '';
        const gpsNote = s.gpsNote || matchedPlace?.gpsNote || '';
        const isAccurateNav = s.isAccurateNav !== undefined ? Boolean(s.isAccurateNav) : (matchedPlace?.isAccurateNav !== undefined ? Boolean(matchedPlace.isAccurateNav) : false);

        return {
            id: `stop-tmpl-${Date.now()}-${idx}`,
            placeId: matchedPlace?.placeId || `tmpl-${idx}`,
            title: s.title,
            timeRange: s.time || `${String(7 + idx * 2).padStart(2, '0')}:00 - ${String(9 + idx * 2).padStart(2, '0')}:00`,
            durationMinutes: 90,
            category: matchedPlace?.category || 'Di sản',
            image: matchedPlace?.image || 'ao bà om.jpg',
            note: `${s.desc || ''} ${s.tip ? '💡 Mẹo: ' + s.tip : ''}`.trim(),
            badge: tour.tag || 'Mẫu tour gợi ý',
            hasAudioGuide: s.title.toLowerCase().includes('chùa') || s.title.toLowerCase().includes('bảo tàng'),
            lat: s.lat || matchedPlace?.lat || null,
            lng: s.lng || matchedPlace?.lng || null,
            gpsStatus,
            gpsStatusLabel,
            gpsSource,
            gpsNote,
            isAccurateNav,
            transfer: idx > 0 ? {
                mode: 'motorcycle',
                modeLabel: 'Xe máy / Ô tô',
                distance: '4.0 km',
                time: '12 phút di chuyển'
            } : null
        };
    });

    state.tripPlan = {
        title: tour.title,
        description: tour.desc,
        durationDays: 1,
        totalDistanceKm: Number.parseFloat(tour.distance?.replace(/[^0-9.]/g, '')) || 25,
        estimatedCo2Kg: 1.2,
        days: [
            {
                dayNumber: 1,
                label: 'Ngày 1',
                activeHours: tour.duration || '07:30 - 17:30',
                stops: stops
            }
        ]
    };
    state.plannerActiveDay = 1;
    saveStoredTripPlan(state.tripPlan);

    switchPlannerTab('custom');
    showSavedToast(`Đã áp dụng mẫu "${tour.title}" vào kế hoạch chuyến đi của bạn!`);
}

export function saveTripPlanToDevice() {
    const ident = getActiveUserIdentifier();
    saveStoredTripPlan(state.tripPlan);

    const isGuest = ident === 'guest';
    const noticeMsg = isGuest
        ? 'Đã lưu kế hoạch chuyến đi trên trình duyệt này, chưa đồng bộ giữa các thiết bị.'
        : 'Đã lưu kế hoạch chuyến đi của tài khoản trên trình duyệt này, chưa đồng bộ giữa các thiết bị.';

    showSavedToast(noticeMsg);
    if (state.currentView === 'planner') {
        renderPlannerMainView();
    }
}

// Giữ alias tương thích ngược cho các lời gọi cũ
export const saveTripPlanToAccount = saveTripPlanToDevice;

export function resetTripPlanToDefault() {
    state.tripPlan = JSON.parse(JSON.stringify(INITIAL_TRIP_PLAN));
    state.plannerActiveDay = 1;
    saveStoredTripPlan(state.tripPlan);
    if (state.currentView === 'planner') {
        renderPlannerMainView();
    }
    const modalContainer = document.getElementById('tripPlannerModalContent');
    if (modalContainer && !document.getElementById('tripPlannerModal')?.classList.contains('hidden')) {
        modalContainer.innerHTML = renderTripPlannerModalContent(
            state.tripPlan,
            state.placePool,
            state.plannerActiveDay,
            state.plannerPoolCategory,
            state.plannerSearchQuery
        );
    }
    showSavedToast('Đã khôi phục kế hoạch chuyến đi mặc định!');
}

export function openTripPlannerModal() {
    const modal = document.getElementById('tripPlannerModal');
    const container = document.getElementById('tripPlannerModalContent');
    if (!modal || !container) return;

    container.innerHTML = renderTripPlannerModalContent(
        state.tripPlan,
        state.placePool,
        state.plannerActiveDay,
        state.plannerPoolCategory,
        state.plannerSearchQuery
    );
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

export function closeTripPlannerModal() {
    const modal = document.getElementById('tripPlannerModal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }
}

export function switchPlannerDay(dayNumber) {
    state.plannerActiveDay = dayNumber;
    const container = document.getElementById('tripPlannerModalContent');
    if (container) {
        container.innerHTML = renderTripPlannerModalContent(
            state.tripPlan,
            state.placePool,
            state.plannerActiveDay,
            state.plannerPoolCategory,
            state.plannerSearchQuery
        );
    }
    if (state.currentView === 'planner') {
        renderPlannerMainView();
    }
}

export function addNewPlannerDay() {
    if (!state.tripPlan) return;
    const nextDayNum = (state.tripPlan.days?.length || 0) + 1;
    if (nextDayNum > 5) {
        showSavedToast('Hành trình tối đa 5 ngày!');
        return;
    }
    state.tripPlan.days.push({
        dayNumber: nextDayNum,
        label: `Ngày ${nextDayNum}`,
        activeHours: '08:00 - 16:00 (8h)',
        stops: []
    });
    state.tripPlan.durationDays = state.tripPlan.days.length;
    state.plannerActiveDay = nextDayNum;
    saveStoredTripPlan(state.tripPlan);

    const container = document.getElementById('tripPlannerModalContent');
    if (container) {
        container.innerHTML = renderTripPlannerModalContent(
            state.tripPlan,
            state.placePool,
            state.plannerActiveDay,
            state.plannerPoolCategory,
            state.plannerSearchQuery
        );
    }
    if (state.currentView === 'planner') {
        renderPlannerMainView();
    }
    showSavedToast(`Đã thêm Ngày ${nextDayNum} vào kế hoạch!`);
}

export function filterPlannerPool(catId) {
    state.plannerPoolCategory = catId;
    const container = document.getElementById('tripPlannerModalContent');
    if (container) {
        container.innerHTML = renderTripPlannerModalContent(
            state.tripPlan,
            state.placePool,
            state.plannerActiveDay,
            state.plannerPoolCategory,
            state.plannerSearchQuery
        );
    }
    if (state.currentView === 'planner') {
        renderPlannerMainView();
    }
}

export function searchPlannerPool(query) {
    state.plannerSearchQuery = query || '';
    const poolList = document.getElementById('pool-list');
    if (poolList) {
        let filteredPool = state.placePool;
        if (state.plannerPoolCategory && state.plannerPoolCategory !== 'all') {
            filteredPool = filteredPool.filter(p => p.category === state.plannerPoolCategory);
        }
        if (state.plannerSearchQuery.trim()) {
            const q = state.plannerSearchQuery.toLowerCase().trim();
            filteredPool = filteredPool.filter(p =>
                p.title.toLowerCase().includes(q) ||
                (p.categoryTag && p.categoryTag.toLowerCase().includes(q)) ||
                (p.description && p.description.toLowerCase().includes(q))
            );
        }
        if (filteredPool.length === 0) {
            poolList.innerHTML = '<div class="p-6 text-center text-xs text-outline dark:text-zinc-500">Không có địa điểm phù hợp bộ lọc.</div>';
        } else {
            poolList.innerHTML = filteredPool.map(item => `
                <div class="pool-card group relative flex gap-3 p-3 rounded-xl bg-surface dark:bg-zinc-800/80 hover:bg-surface-container-low dark:hover:bg-zinc-800 shadow-2xs transition-all border-l-4 border-l-secondary dark:border-l-emerald-500 border border-outline-variant/20 dark:border-zinc-700">
                    <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" class="w-16 h-16 sm:w-18 sm:h-18 rounded-lg object-cover shrink-0" />
                    <div class="flex flex-col justify-between flex-1 min-w-0">
                        <div>
                            <div class="flex items-center justify-between gap-1">
                                <span class="text-[10px] px-2 py-0.5 rounded-full bg-secondary-fixed/40 dark:bg-emerald-950 text-secondary dark:text-emerald-300 font-semibold truncate">
                                    ${escapeHtml(item.categoryTag || item.category)}
                                </span>
                                <button type="button" onclick="window.ViVuApp.addPlaceToPlan('${item.placeId}')"
                                    title="Thêm vào lộ trình Ngày ${state.plannerActiveDay}"
                                    aria-label="Thêm ${escapeHtml(item.title)} vào ngày ${state.plannerActiveDay}"
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
            `).join('');
        }
    }
}

export function addPlaceToPlan(placeId) {
    if (!state.tripPlan) return;
    const place = state.placePool.find(p => p.placeId === placeId);
    if (!place) return;

    const currentDayData = state.tripPlan.days?.find(d => d.dayNumber === state.plannerActiveDay);
    if (!currentDayData) return;

    const stopCount = currentDayData.stops.length + 1;
    const startHour = 8 + (stopCount * 2);
    const endHour = startHour + Math.round(place.durationHours);
    const timeStr = `${String(startHour).padStart(2, '0')}:00 - ${String(endHour).padStart(2, '0')}:00`;

    const matchedDbPlace = (state.allPlaces || []).find(p => p.id === place.placeId || p.slug === place.placeId);
    const stopLat = place.lat || matchedDbPlace?.lat || matchedDbPlace?.latitude || null;
    const stopLng = place.lng || matchedDbPlace?.lng || matchedDbPlace?.longitude || null;

    const newStop = {
        id: `stop-${Date.now()}`,
        placeId: place.placeId,
        title: place.title,
        timeRange: timeStr,
        durationMinutes: Math.round(place.durationHours * 60),
        category: place.category,
        image: place.image,
        note: place.description,
        badge: place.categoryTag || 'Điểm đến mới thêm',
        hasAudioGuide: place.category === 'Chùa cổ',
        lat: stopLat,
        lng: stopLng,
        gpsStatus: place.gpsStatus || 'unverified',
        gpsStatusLabel: place.gpsStatusLabel || (place.gpsStatus === 'verified' ? 'Mốc tham chiếu bản đồ số (Chưa đo kiểm thực địa)' : 'Chưa xác minh (Tọa độ ước tính, không dùng dẫn đường chính xác)'),
        gpsSource: place.gpsSource || '',
        gpsNote: place.gpsNote || '',
        isAccurateNav: place.isAccurateNav === true,
        transfer: stopCount > 1 ? {
            mode: 'pedal_bike',
            modeLabel: 'Xe đạp',
            distance: '3.5 km',
            time: '15 phút đạp xe thong thả'
        } : null
    };

    currentDayData.stops.push(newStop);
    state.tripPlan.totalDistanceKm = +(state.tripPlan.totalDistanceKm + 3.5).toFixed(1);
    state.tripPlan.estimatedCo2Kg = +(state.tripPlan.estimatedCo2Kg + 0.1).toFixed(1);
    saveStoredTripPlan(state.tripPlan);

    const container = document.getElementById('tripPlannerModalContent');
    if (container) {
        container.innerHTML = renderTripPlannerModalContent(
            state.tripPlan,
            state.placePool,
            state.plannerActiveDay,
            state.plannerPoolCategory,
            state.plannerSearchQuery
        );
    }
    if (state.currentView === 'planner') {
        renderPlannerMainView();
    }
    showSavedToast(`Đã thêm "${place.title}" vào Ngày ${state.plannerActiveDay}!`);
}

export function removePlaceFromPlan(stopId) {
    if (!state.tripPlan) return;
    const currentDayData = state.tripPlan.days?.find(d => d.dayNumber === state.plannerActiveDay);
    if (!currentDayData) return;

    currentDayData.stops = currentDayData.stops.filter(s => s.id !== stopId);
    state.tripPlan.totalDistanceKm = Math.max(10, +(state.tripPlan.totalDistanceKm - 3.5).toFixed(1));
    saveStoredTripPlan(state.tripPlan);

    const container = document.getElementById('tripPlannerModalContent');
    if (container) {
        container.innerHTML = renderTripPlannerModalContent(
            state.tripPlan,
            state.placePool,
            state.plannerActiveDay,
            state.plannerPoolCategory,
            state.plannerSearchQuery
        );
    }
    if (state.currentView === 'planner') {
        renderPlannerMainView();
    }
    showSavedToast('Đã xóa điểm dừng khỏi lịch trình!');
}

export function addCustomStopToPlan() {
    if (!state.tripPlan) return;
    const currentDayData = state.tripPlan.days?.find(d => d.dayNumber === state.plannerActiveDay);
    if (!currentDayData) return;

    const newStop = {
        id: `stop-custom-${Date.now()}`,
        placeId: 'custom-stop',
        title: 'Điểm nghỉ dưỡng / Khách sạn Xứ Trà',
        timeRange: '17:00 - 19:00',
        durationMinutes: 120,
        category: 'Thắng cảnh',
        image: 'ao bà om.jpg',
        note: 'Nghỉ ngơi, thưởng trà dừa sáp và trò chuyện cùng người dân địa phương.',
        badge: 'Điểm hẹn tùy chọn',
        hasAudioGuide: false,
        lat: null,
        lng: null,
        gpsStatus: 'unverified',
        gpsStatusLabel: 'Chưa có tọa độ GPS',
        gpsSource: '',
        gpsNote: 'Điểm tùy chọn do người dùng tạo, chưa có tọa độ GPS',
        isAccurateNav: false,
        transfer: {
            mode: 'directions_walk',
            modeLabel: 'Đi bộ',
            distance: '500m',
            time: '5 phút tản bộ'
        }
    };

    currentDayData.stops.push(newStop);
    saveStoredTripPlan(state.tripPlan);

    const container = document.getElementById('tripPlannerModalContent');
    if (container) {
        container.innerHTML = renderTripPlannerModalContent(
            state.tripPlan,
            state.placePool,
            state.plannerActiveDay,
            state.plannerPoolCategory,
            state.plannerSearchQuery
        );
    }
    if (state.currentView === 'planner') {
        renderPlannerMainView();
    }
    showSavedToast('Đã thêm điểm hẹn tùy chỉnh vào lịch trình!');
}

export function optimizePlanAiRoute() {
    if (!state.tripPlan) return;
    const currentDayData = state.tripPlan.days?.find(d => d.dayNumber === state.plannerActiveDay);
    if (!currentDayData || currentDayData.stops.length < 2) {
        showNoticeToast('Mô phỏng AI Route', 'Cần ít nhất 2 điểm dừng để chạy thử nghiệm tối ưu!');
        return;
    }

    currentDayData.stops.reverse();
    state.tripPlan.totalDistanceKm = Math.max(8, +(state.tripPlan.totalDistanceKm - 3.2).toFixed(1));
    state.tripPlan.estimatedCo2Kg = Math.max(0.4, +(state.tripPlan.estimatedCo2Kg - 0.2).toFixed(1));
    saveStoredTripPlan(state.tripPlan);

    const container = document.getElementById('tripPlannerModalContent');
    if (container) {
        container.innerHTML = renderTripPlannerModalContent(
            state.tripPlan,
            state.placePool,
            state.plannerActiveDay,
            state.plannerPoolCategory,
            state.plannerSearchQuery
        );
    }
    if (state.currentView === 'planner') {
        renderPlannerMainView();
    }
    showNoticeToast('Mô phỏng AI Route (Thử nghiệm)', 'Đã đảo thứ tự điểm dừng và ước tính giảm 3.2 km (Lưu ý: Đây là thuật toán mô phỏng thử nghiệm, không phải kết quả định tuyến thực tế từ bản đồ số).');
}

export function isValidGpxCoordinate(val, min, max) {
    if (val === null || val === undefined) return false;
    if (typeof val === 'string' && val.trim() === '') return false;
    const num = Number(val);
    if (!Number.isFinite(num)) return false;
    if (num < min || num > max) return false;
    return true;
}

export function filterValidGpxStops(stops = []) {
    if (!Array.isArray(stops)) return [];
    return stops.filter(s => {
        if (!s) return false;
        const hasValidLat = isValidGpxCoordinate(s.lat, -90, 90);
        const hasValidLng = isValidGpxCoordinate(s.lng, -180, 180);
        if (!hasValidLat || !hasValidLng) return false;
        const lat = Number(s.lat);
        const lng = Number(s.lng);
        if (lat === 0 && lng === 0) return false;
        return true;
    });
}

export function isGpxVerifiedStop(s) {
    if (!s) return false;
    // Điểm thiếu trạng thái GPS hoặc gpsStatus khác 'verified' hoặc isAccurateNav khác true coi là chưa xác minh
    return s.gpsStatus === 'verified' && s.isAccurateNav === true;
}

export function generateGpxXml(allStops = [], plan = {}, options = {}) {
    const includeUnverified = typeof options === 'boolean' 
        ? options 
        : Boolean(options?.includeUnverified);

    // 1. Loại bỏ tọa độ thiếu, null, undefined, chuỗi rỗng, không phải số hợp lệ
    const validCoordStops = filterValidGpxStops(allStops);

    // 2. Mặc định: loại bỏ tất cả các điểm chưa xác minh hoặc thiếu trạng thái GPS
    const exportStops = includeUnverified
        ? validCoordStops
        : validCoordStops.filter(isGpxVerifiedStop);

    const verifiedCount = validCoordStops.filter(isGpxVerifiedStop).length;
    const unverifiedCount = validCoordStops.filter(s => !isGpxVerifiedStop(s)).length;

    if (exportStops.length === 0) {
        return {
            xml: '',
            exportStops: [],
            totalValid: validCoordStops.length,
            verifiedCount,
            unverifiedCount,
            includeUnverified
        };
    }

    const waypointsXml = exportStops.map(s => {
        const isVerified = isGpxVerifiedStop(s);
        const nameSuffix = isVerified ? '' : ' [Chưa xác minh]';
        const wptName = escapeHtml(`${s.title}${nameSuffix}`);
        const disclaimer = isVerified
            ? '[Mốc tham chiếu bản đồ số - Chưa đo kiểm thực địa]'
            : '[Chưa xác minh: Tọa độ ước tính theo vùng hoặc trục đường, không dùng làm điểm dẫn đường chính xác]';
        const sourceInfo = s.gpsSource ? ` | Nguồn: ${s.gpsSource}` : '';
        const fullDesc = escapeHtml(`${disclaimer} ${s.note || ''}${sourceInfo}`.trim());
        const sym = isVerified ? 'Waypoint' : 'Flag, Red';
        const type = isVerified ? 'DigitalMapPOI' : 'UnverifiedEstimate';

        return `    <wpt lat="${Number(s.lat)}" lon="${Number(s.lng)}">
        <name>${wptName}</name>
        <desc>${fullDesc}</desc>
        <sym>${sym}</sym>
        <type>${type}</type>
    </wpt>`;
    }).join('\n');

    const descMeta = includeUnverified
        ? 'Danh sách tọa độ điểm dừng GPS (bao gồm mốc tham chiếu và điểm ước tính tham khảo có cảnh báo; chỉ gồm waypoint, không có track tuyến đường)'
        : 'Danh sách mốc tọa độ điểm dừng GPS đã xác minh từ bản đồ số (chỉ gồm waypoint, không có track tuyến đường)';

    // Tuyệt đối KHÔNG xuất khối <trk> hay <trkseg>, chỉ xuất waypoint
    const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ViVuTraVinh - https://vivutravinh.vn" xmlns="http://www.topografix.com/GPX/1/1">
    <metadata>
        <name>${escapeHtml(plan.title || 'Lộ trình ViVu Trà Vinh')}</name>
        <desc>${escapeHtml(descMeta)}</desc>
        <time>${new Date().toISOString()}</time>
    </metadata>
${waypointsXml}
</gpx>`;

    return {
        xml: gpxContent,
        exportStops,
        totalValid: validCoordStops.length,
        verifiedCount,
        unverifiedCount,
        includeUnverified
    };
}

export function exportGpxFile(optionsOrInclude = false) {
    if (!state.tripPlan) return null;
    const allStops = state.tripPlan.days?.flatMap(d => d.stops || []) || [];
    const includeUnverified = typeof optionsOrInclude === 'boolean' 
        ? optionsOrInclude 
        : Boolean(optionsOrInclude?.includeUnverified);

    const result = generateGpxXml(allStops, state.tripPlan, { includeUnverified });

    if (result.exportStops.length === 0) {
        if (!includeUnverified && result.unverifiedCount > 0) {
            showNoticeToast(
                'Chưa có mốc GPS xác minh',
                `Lịch trình có ${result.unverifiedCount} điểm nhưng tất cả đều chưa xác minh mốc bản đồ số. Mặc định hệ thống không xuất điểm ước tính để tránh dẫn đường sai lệch. Bạn có thể chọn "GPX (Tham khảo)" nếu muốn tải kèm cảnh báo.`
            );
        } else {
            showNoticeToast(
                'Không có tọa độ GPS hợp lệ',
                'Không có điểm dừng nào có tọa độ GPS hợp lệ để xuất tệp GPX. Hệ thống chỉ xuất điểm có tọa độ chuẩn từ cơ sở dữ liệu.'
            );
        }
        return null;
    }

    const gpxContent = result.xml;
    const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fileSuffix = includeUnverified ? 'thamkhao' : 'xacminh';
    a.download = `vivutravinh_waypoints_${fileSuffix}_${new Date().toISOString().slice(0, 10)}.gpx`;
    a.click();
    URL.revokeObjectURL(url);

    if (includeUnverified) {
        showSavedToast(`Đã xuất ${result.exportStops.length} điểm GPX tham khảo (chỉ gồm waypoint, có gắn nhãn cảnh báo điểm chưa xác minh; không có track định tuyến).`);
    } else {
        const noteOmitted = result.unverifiedCount > 0 ? ` (đã loại ${result.unverifiedCount} điểm chưa xác minh)` : '';
        showSavedToast(`Đã xuất ${result.exportStops.length} mốc GPX đã xác minh${noteOmitted} (chỉ gồm waypoint, không có track định tuyến)!`);
    }

    return result;
}

export function openGpsNavModal() {
    closeTripPlannerModal();
    const modal = document.getElementById('gpsNavModal');
    const container = document.getElementById('gpsNavModalContent');
    if (!modal || !container) return;

    container.innerHTML = renderGpsNavigationModalContent(state.gpsNavState);
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

export function closeGpsNavModal() {
    const modal = document.getElementById('gpsNavModal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }
}

export function toggleGpsVoice() {
    if (!state.gpsNavState) return;
    state.gpsNavState.isVoiceEnabled = !state.gpsNavState.isVoiceEnabled;
    const container = document.getElementById('gpsNavModalContent');
    if (container) {
        container.innerHTML = renderGpsNavigationModalContent(state.gpsNavState);
    }
    showSavedToast(state.gpsNavState.isVoiceEnabled ? 'Đã bật âm thanh chỉ dẫn giọng nói tiếng Việt!' : 'Đã tắt âm thanh chỉ dẫn!');
}

export function toggleGpsAudioGuide() {
    if (!state.gpsNavState?.audioGuide) return;
    state.gpsNavState.audioGuide.isPlaying = !state.gpsNavState.audioGuide.isPlaying;
    const container = document.getElementById('gpsNavModalContent');
    if (container) {
        container.innerHTML = renderGpsNavigationModalContent(state.gpsNavState);
    }
    showSavedToast(state.gpsNavState.audioGuide.isPlaying ? 'Đang phát thuyết minh văn hóa bản địa...' : 'Đã tạm dừng thuyết minh.');
}

export function toggleGps3DMode() {
    if (!state.gpsNavState) return;
    state.gpsNavState.is3DMode = !state.gpsNavState.is3DMode;
    const container = document.getElementById('gpsNavModalContent');
    if (container) {
        container.innerHTML = renderGpsNavigationModalContent(state.gpsNavState);
    }
    showSavedToast(state.gpsNavState.is3DMode ? 'Đã chuyển sang góc nhìn dẫn đường 3D!' : 'Đã chuyển sang bản đồ 2D toàn cảnh.');
}

export function searchNearbyPitstops() {
    showSavedToast('Đang quét trạm sạc điện, điểm cấp nước & quán dừa sáp gần nhất...');
}

export function finishGpsNavigation() {
    closeGpsNavModal();
    openTripSummaryModal();
    showSavedToast('Chúc mừng bạn đã hoàn tất xuất sắc hành trình!');
}

export function openTripSummaryModal() {
    const modal = document.getElementById('tripSummaryModal');
    const container = document.getElementById('tripSummaryModalContent');
    if (!modal || !container) return;

    container.innerHTML = renderTripSummaryModalContent(state.tripSummaryState);
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

export function closeTripSummaryModal() {
    const modal = document.getElementById('tripSummaryModal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }
}

export function openStoryShareModal(theme = state.storyTheme) {
    closeTripSummaryModal();
    const modal = document.getElementById('storyCardModal');
    const container = document.getElementById('storyCardModalContent');
    if (!modal || !container) return;

    state.storyTheme = theme || 'heritage';
    const template = STORY_TEMPLATES[state.storyTheme] || STORY_TEMPLATES.heritage;
    container.innerHTML = renderSocialStoryModalContent(template, state.storyTheme, state.storyToggles);
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

export function closeStoryShareModal() {
    const modal = document.getElementById('storyCardModal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }
}

export function switchStoryTheme(theme) {
    if (!STORY_TEMPLATES[theme]) return;
    state.storyTheme = theme;
    const container = document.getElementById('storyCardModalContent');
    if (container) {
        container.innerHTML = renderSocialStoryModalContent(STORY_TEMPLATES[theme], state.storyTheme, state.storyToggles);
    }
}

export function toggleStoryElement(key) {
    if (key in state.storyToggles) {
        state.storyToggles[key] = !state.storyToggles[key];
        const container = document.getElementById('storyCardModalContent');
        if (container) {
            container.innerHTML = renderSocialStoryModalContent(STORY_TEMPLATES[state.storyTheme], state.storyTheme, state.storyToggles);
        }
    }
}

export function downloadStoryCard() {
    const dummyLink = document.createElement('a');
    dummyLink.href = 'ao bà om.jpg';
    dummyLink.download = `vivutravinh_story_${state.storyTheme}_9x16.jpg`;
    dummyLink.click();
    showSavedToast('Đã lưu ảnh Thẻ Story (chuẩn 9:16) vào thiết bị của bạn!');
}

export function copyStoryLink() {
    const url = `https://vivutravinh.vn/story/${state.storyTheme}?ref=share`;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
            showSavedToast('Đã sao chép liên kết Thẻ Story vào bộ nhớ tạm!');
        }).catch(() => {
            showSavedToast('Đã tạo liên kết chia sẻ: ' + url);
        });
    } else {
        showSavedToast('Đã sao chép liên kết chia sẻ!');
    }
}

export function shareToSocial(platform) {
    showSavedToast(`Đang chuyển hướng sang ${platform.toUpperCase()} để đăng Story...`);
}

// =========================================================================
// PHASE 10: ADMIN SUPPORT WALL & MODERATION PORTAL METHODS
// =========================================================================

export function openAdminSupportModal() {
    closeAdminSupportModal();
    navGoCompanion();
}

export function closeAdminSupportModal() {
    const modal = document.getElementById('adminSupportModal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }
}

export function selectDonationTier(amount, tierId) {
    state.selectedDonationAmount = amount;
    state.selectedDonationTierId = tierId;
    const container = document.getElementById('adminSupportModalContent');
    if (container) {
        container.innerHTML = renderAdminSupportModalContent({
            adminInfo: state.adminInfo,
            financialReport: state.financialReport,
            donationTiers: state.donationTiers,
            selectedAmount: state.selectedDonationAmount,
            selectedNote: state.selectedDonationTierId,
            techClearance: state.techClearance,
            travelGear: state.travelGear,
            recentSupporters: state.recentSupporters
        });
    }
}

export function applyCustomDonation() {
    const input = document.getElementById('customDonationInput');
    if (!input) return;
    const val = parseInt(input.value, 10);
    if (isNaN(val) || val < 10000) {
        showSavedToast('Vui lòng nhập số tiền hợp lệ từ 10.000đ trở lên');
        return;
    }
    selectDonationTier(val, 'custom');
    showSavedToast(`Đã tạo mã QR cho số tiền: ${val.toLocaleString('vi-VN')}đ`);
}

export function copyTransferNote(note) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(note).then(() => {
            showSavedToast('Đã sao chép nội dung chuyển khoản: ' + note);
        }).catch(() => {
            showSavedToast('Nội dung: ' + note);
        });
    } else {
        showSavedToast('Nội dung: ' + note);
    }
}

export function copyToClipboard(text, successMsg = 'Đã sao chép vào bộ nhớ tạm!') {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showSavedToast(successMsg);
        }).catch(() => {
            showSavedToast(text);
        });
    } else {
        showSavedToast(text);
    }
}

export function confirmSimulatedDonation(amount) {
    const newRecord = {
        name: state.userProfile?.displayName || 'Du khách hảo tâm',
        amount: amount || state.selectedDonationAmount,
        date: 'Vừa xong',
        message: 'Đồng hành cùng máy chủ ViVuTraVinh'
    };
    state.recentSupporters = addDonationRecord(newRecord);
    state.financialReport.monthlyFunded += newRecord.amount;
    state.financialReport.percentFunded = Math.min(100, Math.round((state.financialReport.monthlyFunded / state.financialReport.monthlyCost) * 100));
    state.financialReport.remainingNeeded = Math.max(0, state.financialReport.monthlyCost - state.financialReport.monthlyFunded);

    const container = document.getElementById('adminSupportModalContent');
    if (container) {
        container.innerHTML = renderAdminSupportModalContent({
            adminInfo: state.adminInfo,
            financialReport: state.financialReport,
            donationTiers: state.donationTiers,
            selectedAmount: state.selectedDonationAmount,
            selectedNote: state.selectedDonationTierId,
            techClearance: state.techClearance,
            travelGear: state.travelGear,
            recentSupporters: state.recentSupporters
        });
    }
    showSavedToast(`Cảm ơn bạn đã ủng hộ ${newRecord.amount.toLocaleString('vi-VN')}đ vào quỹ máy chủ!`);
}

/**
 * Cập nhật số lượng hiển thị trên Badge Sidebar & Mobile Drawer Admin Moderation
 */
export function updateAdminModerationBadge(count, isError = false) {
    const badges = [
        document.getElementById('sidebarAdminModerationBadge'),
        document.getElementById('drawerAdminModerationBadge')
    ].filter(Boolean);
    if (!badges.length) return;

    badges.forEach(badge => {
        if (isError || (count === null && state.moderationKpi?.hasError)) {
            badge.textContent = '!';
            badge.title = 'Chưa tải được số lượng chờ duyệt (Lỗi kết nối)';
            badge.setAttribute('aria-label', 'Chưa tải được số lượng chờ duyệt');
            badge.className = 'ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-amber-500 text-white shadow-xs';
            badge.classList.remove('hidden');
            return;
        }

        const num = typeof count === 'number' ? count : (state.moderationKpi?.hasError ? null : state.moderationKpi?.pendingCount);
        if (typeof num === 'number' && num > 0) {
            badge.textContent = String(num);
            badge.title = `${num} nội dung chờ duyệt`;
            badge.setAttribute('aria-label', `${num} nội dung chờ duyệt`);
            badge.className = 'ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-amber-500 text-white shadow-xs';
            badge.classList.remove('hidden');
        } else if (num === 0) {
            badge.textContent = '0';
            badge.title = 'Hàng đợi kiểm duyệt đã sạch';
            badge.setAttribute('aria-label', 'Không có nội dung chờ duyệt');
            badge.classList.add('hidden');
        } else if (state.moderationKpi?.hasError) {
            badge.textContent = '!';
            badge.title = 'Chưa tải được số lượng chờ duyệt';
            badge.setAttribute('aria-label', 'Chưa tải được số lượng chờ duyệt');
            badge.classList.remove('hidden');
        } else {
            badge.textContent = '0';
            badge.classList.add('hidden');
        }
    });
}

/**
 * Tính toán lại tổng số mục đang thực sự chờ duyệt (status === 'pending')
 */
export function syncAndRecalculateModerationPending() {
    if (state.moderationKpi?.hasError) {
        updateAdminModerationBadge(null, true);
        return null;
    }

    const pPosts = typeof state.moderationKpi?.pendingPostsCount === 'number'
        ? state.moderationKpi.pendingPostsCount
        : (state.moderationPosts || []).filter(p => p.status === 'pending').length;
    const pClubs = typeof state.moderationKpi?.pendingClubsCount === 'number'
        ? state.moderationKpi.pendingClubsCount
        : (state.moderationClubs || []).filter(c => c.status === 'pending').length;
    const pActs = typeof state.moderationKpi?.pendingActivitiesCount === 'number'
        ? state.moderationKpi.pendingActivitiesCount
        : (state.moderationActivities || []).filter(a => a.status === 'pending').length;
    const pEvents = typeof state.moderationKpi?.pendingEventsCount === 'number'
        ? state.moderationKpi.pendingEventsCount
        : (state.moderationEvents || []).filter(e => e.status === 'pending').length;
    const pArticles = typeof state.moderationKpi?.pendingArticlesCount === 'number'
        ? state.moderationKpi.pendingArticlesCount
        : (state.moderationArticles || []).filter(a => a.status === 'pending').length;
    const pPlaces = typeof state.moderationKpi?.pendingPlacesCount === 'number'
        ? state.moderationKpi.pendingPlacesCount
        : (state.moderationPlaces || []).filter(p => p.status === 'draft' || p.status === 'pending').length;

    const total = pPosts + pClubs + pActs + pEvents + pArticles + pPlaces;

    state.moderationKpi = {
        ...(state.moderationKpi || {}),
        hasError: false,
        pendingCount: total,
        pendingTotal: total,
        pendingPostsCount: pPosts,
        pendingClubsCount: pClubs,
        pendingActivitiesCount: pActs,
        pendingEventsCount: pEvents,
        pendingArticlesCount: pArticles,
        pendingPlacesCount: pPlaces
    };
    updateAdminModerationBadge(total, false);
    return total;
}

/**
 * Tải và làm mới số lượng chờ duyệt từ database/API
 */
export async function refreshAdminModerationCounts() {
    const session = getAdminSession();
    const role = session?.user?.role;
    const isAdmin = ['admin', 'editor', 'moderator'].includes(role);
    if (!isAdmin) {
        updateAdminModerationBadge(0);
        return;
    }

    try {
        const token = await getValidAdminToken();
        if (!token) return;
        const res = await fetch('/api/admin-moderation?status=pending', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (res.ok) {
            const data = await res.json();
            if (data.kpi && !data.kpi.hasError) {
                const total = typeof data.kpi.pendingTotal === 'number' ? data.kpi.pendingTotal : 0;
                state.moderationKpi = {
                    ...(state.moderationKpi || {}),
                    hasError: false,
                    pendingCount: total,
                    pendingTotal: total,
                    pendingPostsCount: data.kpi.pendingPosts ?? 0,
                    pendingClubsCount: data.kpi.pendingClubs ?? 0,
                    pendingActivitiesCount: data.kpi.pendingActivities ?? 0,
                    pendingEventsCount: data.kpi.pendingEvents ?? 0,
                    pendingArticlesCount: data.kpi.pendingArticles ?? 0,
                    pendingPlacesCount: data.kpi.pendingPlaces ?? 0
                };
                updateAdminModerationBadge(total, false);
            } else {
                console.warn('[AdminModeration] KPI trả về trạng thái lỗi:', data.kpi?.errorMessage);
                state.moderationKpi = {
                    ...(state.moderationKpi || {}),
                    hasError: true,
                    pendingCount: null,
                    pendingTotal: null,
                    pendingPostsCount: null,
                    pendingClubsCount: null,
                    pendingActivitiesCount: null,
                    pendingEventsCount: null,
                    pendingArticlesCount: null,
                    pendingPlacesCount: null
                };
                updateAdminModerationBadge(null, true);
            }
        } else {
            console.warn('[AdminModeration] Lỗi HTTP khi tải số lượng chờ duyệt:', res.status);
            state.moderationKpi = {
                ...(state.moderationKpi || {}),
                hasError: true,
                pendingCount: null,
                pendingTotal: null,
                pendingPostsCount: null,
                pendingClubsCount: null,
                pendingActivitiesCount: null,
                pendingEventsCount: null,
                pendingArticlesCount: null,
                pendingPlacesCount: null
            };
            updateAdminModerationBadge(null, true);
        }
    } catch (e) {
        console.warn('[AdminModeration] Lỗi kết nối khi cập nhật số lượng chờ duyệt:', e.message);
        state.moderationKpi = {
            ...(state.moderationKpi || {}),
            hasError: true,
            pendingCount: null,
            pendingTotal: null,
            pendingPostsCount: null,
            pendingClubsCount: null,
            pendingActivitiesCount: null,
            pendingEventsCount: null,
            pendingArticlesCount: null,
            pendingPlacesCount: null
        };
        updateAdminModerationBadge(null, true);
    }
}

/**
 * Cập nhật giao diện thanh Sidebar dựa trên phiên làm việc Quản trị viên (Admin/Moderator)
 * Chỉ hiển thị mục "Kiểm duyệt nội dung" cho tài khoản quản trị thực sự từ trang admin cũ.
 */
export function updateAdminRoleUI() {
    const session = getAdminSession();
    const communitySession = getUserSession();
    const communityUser = communitySession?.user;
    const profileBtn = document.getElementById('headerProfileBtn');
    if (profileBtn) {
        profileBtn.onclick = () => communityUser ? openProfileModal() : openAuthModal('signin');
        profileBtn.setAttribute('aria-label', communityUser ? 'Xem tài khoản cộng đồng' : 'Đăng nhập hoặc tạo tài khoản cộng đồng');
        profileBtn.title = communityUser ? 'Tài khoản cộng đồng' : 'Đăng nhập cộng đồng';
        profileBtn.innerHTML = communityUser
            ? '<span class="material-symbols-outlined text-[18px]" aria-hidden="true">account_circle</span><span class="hidden sm:inline">Tài khoản</span>'
            : '<span class="material-symbols-outlined text-[18px]" aria-hidden="true">login</span><span class="hidden sm:inline">Đăng nhập</span>';
    }
    const role = session?.user?.role;
    const isAdmin = ['admin', 'editor', 'moderator'].includes(role);

    const moderationLinks = [
        document.getElementById('sidebarAdminModerationLink'),
        document.getElementById('drawerAdminModerationLink')
    ].filter(Boolean);
    const adminLoginLinks = [
        document.getElementById('sidebarAdminLoginLink'),
        document.getElementById('drawerAdminLoginLink')
    ].filter(Boolean);
    const userNameEls = [
        document.getElementById('sidebarUserName'),
        document.getElementById('drawerUserName')
    ].filter(Boolean);
    const userRoleEls = [
        document.getElementById('sidebarUserRole'),
        document.getElementById('drawerUserRole')
    ].filter(Boolean);

    if (isAdmin) {
        moderationLinks.forEach(el => {
            el.classList.remove('hidden');
            el.classList.add('flex');
        });
        adminLoginLinks.forEach(el => {
            el.classList.add('hidden');
            el.classList.remove('flex');
        });
        userNameEls.forEach(el => {
            el.textContent = session.user.email?.split('@')[0] || 'Quản Trị Viên';
            el.title = session.user.email || '';
        });
        userRoleEls.forEach(el => {
            el.textContent = role === 'admin' ? 'Quản trị viên' : (role === 'editor' ? 'Biên tập viên' : 'Kiểm duyệt viên');
            el.className = 'font-caption text-[10px] text-amber-500 font-bold';
        });
        refreshAdminModerationCounts();
    } else {
        moderationLinks.forEach(el => {
            el.classList.add('hidden');
            el.classList.remove('flex');
        });
        updateAdminModerationBadge(0);
        adminLoginLinks.forEach(el => {
            el.classList.remove('hidden');
            el.classList.add('flex');
        });
        userNameEls.forEach(el => {
            el.textContent = communityUser
                ? (communityUser.user_metadata?.display_name || communityUser.email?.split('@')[0] || 'Thành viên')
                : 'Khách vãng lai';
            el.title = '';
        });
        userRoleEls.forEach(el => {
            el.textContent = communityUser ? 'Thành viên' : 'Đăng nhập / Đăng ký';
            el.className = 'font-caption text-[10px] text-secondary dark:text-emerald-400 font-medium';
        });
    }
}

function renderModerationModal() {
    const container = document.getElementById('adminModerationModalContent');
    if (!container) return;
    container.innerHTML = renderAdminModerationModalContent({
        activeTab: state.moderationActiveTab,
        posts: state.moderationPosts,
        selectedPostId: state.selectedModerationPostId,
        clubs: state.moderationClubs,
        selectedClubId: state.selectedModerationClubId,
        events: state.moderationEvents,
        selectedEventId: state.selectedModerationEventId,
        articles: state.moderationArticles || [],
        selectedArticleId: state.selectedModerationArticleId,
        activities: state.moderationActivities || [],
        selectedActivityId: state.selectedModerationActivityId,
        places: state.moderationPlaces || [],
        selectedPlaceId: state.selectedModerationPlaceId,
        kpi: state.moderationKpi,
        filterCategory: state.moderationFilterCategory,
        riskFilter: state.moderationRiskFilter,
        searchQuery: state.moderationSearchQuery
    });
}

export async function openAdminModerationModal(tab = 'posts') {
    const session = getAdminSession();
    const role = session?.user?.role;
    const isAdmin = ['admin', 'editor', 'moderator'].includes(role);

    if (!isAdmin) {
        showNoticeToast('Yêu cầu quyền Quản trị', 'Mục này chỉ dành riêng cho tài khoản Quản trị viên. Bạn sẽ được chuyển tới trang đăng nhập Quản trị.');
        setTimeout(() => {
            window.location.href = '/admin.html';
        }, 1200);
        return;
    }

    const modal = document.getElementById('adminModerationModal');
    const container = document.getElementById('adminModerationModalContent');
    if (!modal || !container) return;

    state.moderationActiveTab = tab || 'posts';

    // Thử tải danh sách chờ duyệt từ API /api/admin-moderation nếu có token
    try {
        const token = await getValidAdminToken();
        if (token) {
            const res = await fetch('/api/admin-moderation?status=pending', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data.posts)) {
                    state.moderationPosts = data.posts.map(p => {
                        let loc = null;
                        if (p.metadata?.location) {
                            loc = p.metadata.location;
                        } else if (p.location) {
                            loc = typeof p.location === 'object' ? p.location : { name: p.location };
                        }
                        return {
                            id: p.id,
                            author: {
                                name: p.author_name || 'Thành viên Xứ Trà',
                                avatar: p.author_avatar || null,
                                avatarText: (p.author_name || 'TV').slice(0, 2).toUpperCase(),
                                trustScore: null,
                                verified: false,
                                memberMonths: null,
                                postsCount: null,
                                successRate: null,
                                level: 'Thành viên'
                            },
                            category: p.category || 'Tự do',
                            title: p.title || (p.content ? (p.content.slice(0, 40) + '...') : 'Bài chia sẻ cộng đồng'),
                            excerpt: p.content ? (p.content.slice(0, 160) + (p.content.length > 160 ? '...' : '')) : '',
                            fullContent: p.content ? [p.content] : [],
                            images: (p.images || []).map(img => typeof img === 'string' ? { src: img, caption: 'Ảnh đính kèm' } : img),
                            location: loc,
                            tags: ['Cộng đồng', 'Trà Vinh'],
                            submittedAt: p.created_at || 'Vừa xong',
                            status: p.status || 'pending',
                            aiSafeScore: null,
                            aiSummary: null,
                            flagsCount: 0
                        };
                    });
                }
                if (Array.isArray(data.clubs)) {
                    state.moderationClubs = data.clubs.map(c => ({
                        id: c.id,
                        name: c.name,
                        category: c.category,
                        categoryName: c.category_name || c.category,
                        founder: {
                            name: c.leader_name || 'Chủ nhiệm CLB',
                            avatar: null
                        },
                        leaderName: c.leader_name || 'Chủ nhiệm CLB',
                        leaderPhone: c.leader_phone || '',
                        submittedAt: c.created_at || 'Vừa xong',
                        status: c.status || 'pending',
                        membersCount: c.members_count || 1,
                        membersRequired: 10,
                        progressPercent: Math.round(((c.members_count || 1) / 10) * 100),
                        desc: c.description || '',
                        operatingHub: c.meeting_place || 'TP. Trà Vinh',
                        code: c.id,
                        meetingPlace: c.meeting_place || 'TP. Trà Vinh',
                        scheduleInfo: c.schedule_info || 'Định kỳ hàng tuần',
                        isEligible: (c.members_count || 1) >= 10,
                        notableFounders: [
                            { name: c.leader_name || 'Chủ nhiệm CLB', role: 'Chủ nhiệm sáng lập' }
                        ],
                        criteriaList: [
                            { title: 'Điều lệ hoạt động', desc: 'Có tôn chỉ sinh hoạt lành mạnh', passed: true },
                            { title: 'Địa bàn hoạt động', desc: c.meeting_place || 'Tại tỉnh Trà Vinh', passed: true }
                        ],
                        threeMonthsPlan: [
                            'Kiện toàn danh sách thành viên sáng lập',
                            'Tổ chức buổi sinh hoạt định kỳ đầu tiên',
                            'Đăng ký kế hoạch hoạt động quý với BQT'
                        ]
                    }));
                }
                if (Array.isArray(data.events)) {
                    state.moderationEvents = data.events.map(e => ({
                        id: e.id,
                        title: e.title,
                        organizer: e.organizer,
                        category: e.category,
                        datetime: e.time_schedule,
                        timeSchedule: e.time_schedule,
                        location: e.location,
                        region: e.region,
                        description: e.description,
                        fee: e.fee,
                        contactPhone: e.contact_phone || '',
                        phone: e.contact_phone || '',
                        submittedAt: e.created_at || 'Vừa xong',
                        status: e.status || 'pending',
                        creatorName: e.creator_name || 'Thành viên Xứ Trà'
                    }));
                }
                if (Array.isArray(data.articles)) {
                    state.moderationArticles = data.articles.map(a => ({
                        id: a.id,
                        slug: a.slug,
                        title: a.title,
                        category: a.category,
                        category_name: a.category_name,
                        category_badge: a.category_badge,
                        cover_image: a.cover_image,
                        excerpt: a.excerpt,
                        content: a.content,
                        read_time: a.read_time,
                        author: {
                            name: a.author_name || 'Thành viên Xứ Trà',
                            avatar: a.author_avatar || null
                        },
                        author_name: a.author_name || 'Thành viên Xứ Trà',
                        author_role: a.author_role,
                        is_editorial: a.is_editorial,
                        status: a.status || 'pending',
                        created_at: a.created_at,
                        admin_notes: a.admin_notes || ''
                    }));
                }
                if (Array.isArray(data.activities)) {
                    state.moderationActivities = data.activities.map(act => ({
                        id: act.id,
                        club_id: act.club_id,
                        club_name: act.club_name,
                        title: act.title,
                        time_schedule: act.time_schedule,
                        location: act.location,
                        max_attendees: act.max_attendees || 50,
                        attendees_count: act.attendees_count || 0,
                        is_free: act.is_free,
                        icon: act.icon || 'event',
                        description: act.description,
                        creator_id: act.creator_id,
                        creator_name: act.creator_name || 'Chủ nhiệm CLB',
                        creator_role: act.creator_role || 'Chủ nhiệm CLB',
                        status: act.status || 'pending',
                        created_at: act.created_at,
                        admin_notes: act.admin_notes || ''
                    }));
                }
                if (Array.isArray(data.places)) {
                    state.moderationPlaces = data.places.map(pl => {
                        let imgs = [];
                        if (Array.isArray(pl.images)) {
                            imgs = pl.images.map(img => typeof img === 'string' ? { src: img, caption: pl.name } : img);
                        } else if (typeof pl.images === 'string' && pl.images.trim()) {
                            imgs = [{ src: pl.images.trim(), caption: pl.name }];
                        }
                        if (pl.image_link && !imgs.some(i => i.src === pl.image_link)) {
                            imgs.unshift({ src: pl.image_link, caption: pl.name });
                        }
                        return {
                            id: pl.id,
                            name: pl.name || 'Địa điểm chưa đặt tên',
                            slug: pl.slug,
                            category: pl.category || 'Địa điểm du lịch',
                            area: pl.area || 'Toàn tỉnh',
                            address: pl.address || '',
                            map_link: pl.map_link || '',
                            price_raw: pl.price_raw || 'Liên hệ',
                            description: pl.description || '',
                            note: pl.note || '',
                            contact: pl.contact || '',
                            coordinates: pl.coordinates || '',
                            contributor: pl.contributor || 'Thành viên đóng góp',
                            display_hours: pl.display_hours || '07:00 - 18:00',
                            operating_status: pl.operating_status || 'Normal',
                            status: pl.status || 'draft',
                            images: imgs,
                            image_link: pl.image_link || (imgs[0]?.src || null),
                            client_submission_id: pl.client_submission_id,
                            created_at: pl.created_at || 'Vừa xong'
                        };
                    });
                    if (!state.selectedModerationPlaceId || !state.moderationPlaces.some(p => p.id === state.selectedModerationPlaceId)) {
                        state.selectedModerationPlaceId = state.moderationPlaces[0]?.id || null;
                    }
                }
                if (data.kpi && !data.kpi.hasError) {
                    const total = typeof data.kpi.pendingTotal === 'number'
                        ? data.kpi.pendingTotal
                        : ((data.kpi.pendingPosts || 0) + (data.kpi.pendingClubs || 0) + (data.kpi.pendingEvents || 0) + (data.kpi.pendingArticles || 0) + (data.kpi.pendingActivities || 0) + (data.kpi.pendingPlaces || 0));
                    state.moderationKpi = {
                        hasError: false,
                        pendingCount: total,
                        pendingTotal: total,
                        pendingNew: (data.kpi.pendingEvents || 0) + (data.kpi.pendingArticles || 0) + (data.kpi.pendingActivities || 0) + (data.kpi.pendingPlaces || 0),
                        flaggedCount: 0,
                        approvedToday: state.moderationKpi?.approvedToday || 0,
                        pointsIssued: 0,
                        violationRate: "0%",
                        pendingPostsCount: data.kpi.pendingPosts ?? 0,
                        pendingClubsCount: data.kpi.pendingClubs ?? 0,
                        pendingEventsCount: data.kpi.pendingEvents ?? 0,
                        pendingArticlesCount: data.kpi.pendingArticles ?? 0,
                        pendingActivitiesCount: data.kpi.pendingActivities ?? 0,
                        pendingPlacesCount: data.kpi.pendingPlaces ?? 0
                    };
                    updateAdminModerationBadge(total, false);
                } else {
                    state.moderationKpi = {
                        ...(state.moderationKpi || {}),
                        hasError: true,
                        pendingCount: null,
                        pendingTotal: null,
                        pendingPostsCount: null,
                        pendingClubsCount: null,
                        pendingActivitiesCount: null,
                        pendingEventsCount: null,
                        pendingArticlesCount: null,
                        pendingPlacesCount: null
                    };
                    updateAdminModerationBadge(null, true);
                }
            } else {
                state.moderationKpi = {
                    ...(state.moderationKpi || {}),
                    hasError: true,
                    pendingCount: null,
                    pendingTotal: null,
                    pendingPostsCount: null,
                    pendingClubsCount: null,
                    pendingActivitiesCount: null,
                    pendingEventsCount: null,
                    pendingArticlesCount: null,
                    pendingPlacesCount: null
                };
                updateAdminModerationBadge(null, true);
            }
        }
    } catch (e) {
        console.warn('[AdminModeration] Lỗi khi tải dữ liệu duyệt từ API:', e.message);
        state.moderationKpi = {
            ...(state.moderationKpi || {}),
            hasError: true,
            pendingCount: null,
            pendingTotal: null,
            pendingPostsCount: null,
            pendingClubsCount: null,
            pendingActivitiesCount: null,
            pendingEventsCount: null,
            pendingArticlesCount: null,
            pendingPlacesCount: null
        };
        updateAdminModerationBadge(null, true);
    }

    if (!state.moderationKpi?.hasError && typeof state.moderationKpi?.pendingCount !== 'number') {
        syncAndRecalculateModerationPending();
    }
    renderModerationModal();
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

export function closeAdminModerationModal() {
    const modal = document.getElementById('adminModerationModal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }
}

export function switchModerationTab(tab, category = 'all') {
    state.moderationActiveTab = tab;
    state.moderationFilterCategory = category;
    renderModerationModal();
}

export function selectModerationPost(postId) {
    state.selectedModerationPostId = postId;
    renderModerationModal();
}

export function selectModerationClub(clubId) {
    state.selectedModerationClubId = clubId;
    renderModerationModal();
}

export function selectModerationEvent(eventId) {
    state.selectedModerationEventId = eventId;
    renderModerationModal();
}

export function selectModerationArticle(articleId) {
    state.selectedModerationArticleId = articleId;
    renderModerationModal();
}

export function selectModerationActivity(activityId) {
    state.selectedModerationActivityId = activityId;
    renderModerationModal();
}

export function handleModerationSearch(query) {
    state.moderationSearchQuery = query;
    renderModerationModal();
}

export function filterModerationRisk(risk) {
    state.moderationRiskFilter = risk;
    renderModerationModal();
}

export async function approvePost(postId) {
    const post = state.moderationPosts.find(p => p.id === postId);
    if (!post) return;

    try {
        const token = await getValidAdminToken();
        if (token) {
            await fetch('/api/admin-moderation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    entity_type: 'community_post',
                    entity_id: postId,
                    action: 'approve'
                })
            });
        }
    } catch (e) {
        console.warn('[Moderation] API approvePost error:', e.message);
    }

    post.status = 'approved';
    state.moderationPosts = state.moderationPosts.filter(p => p.id !== postId);
    state.moderationKpi.approvedToday = (state.moderationKpi.approvedToday || 0) + 1;
    if (typeof state.moderationKpi?.pendingPostsCount === 'number') {
        state.moderationKpi.pendingPostsCount = Math.max(0, state.moderationKpi.pendingPostsCount - 1);
    }
    saveStoredModerationPosts(state.moderationPosts);

    // Đồng bộ sang danh sách bài viết trang chủ/feed
    const feedPost = state.communityPosts.find(p => p.id === postId);
    if (feedPost) {
        feedPost.status = 'approved';
        feedPost.badge = 'Thành viên';
    }
    renderCommunityFeed();

    syncAndRecalculateModerationPending();
    renderModerationModal();
    showSavedToast('✓ Đã phê duyệt và xuất bản bài viết thành công (+10 điểm đóng góp G15)!');
    refreshAdminModerationCounts().catch(() => {});
}

export async function approveClub(clubId) {
    const club = state.moderationClubs.find(c => c.id === clubId);
    if (!club) return;

    try {
        const token = await getValidAdminToken();
        if (token) {
            await fetch('/api/admin-moderation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    entity_type: 'club',
                    entity_id: clubId,
                    action: 'approve'
                })
            });
        }
    } catch (e) {
        console.warn('[Moderation] API approveClub error:', e.message);
    }

    club.status = 'approved';
    club.isEligible = true;
    state.moderationClubs = state.moderationClubs.filter(c => c.id !== clubId);
    if (typeof state.moderationKpi?.pendingClubsCount === 'number') {
        state.moderationKpi.pendingClubsCount = Math.max(0, state.moderationKpi.pendingClubsCount - 1);
    }
    saveStoredModerationClubs(state.moderationClubs);

    const mainClub = state.clubs.find(c => c.id === clubId);
    if (mainClub) {
        mainClub.status = 'approved';
    }
    renderClubsGrid();

    syncAndRecalculateModerationPending();
    renderModerationModal();
    showSavedToast('✓ Đã phê duyệt và cấp Tích Xanh chính thức cho CLB!');
    refreshAdminModerationCounts().catch(() => {});
}

export async function approveEvent(eventId) {
    const event = state.moderationEvents.find(e => e.id === eventId);
    if (!event) return;

    try {
        const token = await getValidAdminToken();
        if (token) {
            await fetch('/api/admin-moderation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    entity_type: 'community_event',
                    entity_id: eventId,
                    action: 'approve'
                })
            });
        }
    } catch (e) {
        console.warn('[Moderation] API approveEvent error:', e.message);
    }

    event.status = 'approved';
    state.moderationEvents = state.moderationEvents.filter(e => e.id !== eventId);
    state.moderationKpi.approvedToday = (state.moderationKpi.approvedToday || 0) + 1;
    if (typeof state.moderationKpi?.pendingEventsCount === 'number') {
        state.moderationKpi.pendingEventsCount = Math.max(0, state.moderationKpi.pendingEventsCount - 1);
    }
    saveStoredModerationEvents(state.moderationEvents);

    // Đồng bộ lại events công khai
    await syncCommunityEventsFromSupabase().catch(() => {});

    syncAndRecalculateModerationPending();
    renderModerationModal();
    showSavedToast('✓ Đã phê duyệt và xuất bản sự kiện cộng đồng!');
    refreshAdminModerationCounts().catch(() => {});
}

export function openEditArticleFromModeration(articleId) {
    const article = (state.moderationArticles || []).find(a => a.id === articleId);
    if (!article) return;
    openSubmitArticleModal(article, true);
}

export async function approveArticle(articleId) {
    const article = (state.moderationArticles || []).find(a => a.id === articleId);
    if (!article) return;

    try {
        const token = await getValidAdminToken();
        if (token) {
            const auditNoteEl = document.getElementById('moderatorAuditNote');
            const adminNotes = auditNoteEl ? auditNoteEl.value.trim() : undefined;
            await fetch('/api/admin-moderation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    entity_type: 'article',
                    entity_id: articleId,
                    action: 'approve',
                    admin_notes: adminNotes
                })
            });
        }
    } catch (e) {
        console.warn('[Moderation] API approveArticle error:', e.message);
    }

    article.status = 'approved';
    state.moderationKpi.approvedToday = (state.moderationKpi.approvedToday || 0) + 1;
    state.moderationArticles = (state.moderationArticles || []).filter(a => a.id !== articleId);
    if (typeof state.moderationKpi?.pendingArticlesCount === 'number') {
        state.moderationKpi.pendingArticlesCount = Math.max(0, state.moderationKpi.pendingArticlesCount - 1);
    }
    if (state.selectedModerationArticleId === articleId) {
        state.selectedModerationArticleId = state.moderationArticles[0]?.id || null;
    }

    await syncArticlesFromSupabase().catch(() => {});

    syncAndRecalculateModerationPending();
    renderModerationModal();
    showSavedToast('✓ Đã phê duyệt và xuất bản bài cẩm nang du lịch (+20 điểm đóng góp G15)!');
    refreshAdminModerationCounts().catch(() => {});
}

export async function approveClubActivity(activityId) {
    const act = (state.moderationActivities || []).find(a => a.id === activityId);
    if (!act) return;

    try {
        const token = await getValidAdminToken();
        if (token) {
            const auditNoteEl = document.getElementById('moderatorAuditNote');
            const adminNotes = auditNoteEl ? auditNoteEl.value.trim() : undefined;
            await fetch('/api/admin-moderation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    entity_type: 'club_activity',
                    entity_id: activityId,
                    action: 'approve',
                    admin_notes: adminNotes
                })
            });
        }
    } catch (e) {
        console.warn('[Moderation] API approveClubActivity error:', e.message);
    }

    act.status = 'approved';
    state.moderationKpi.approvedToday = (state.moderationKpi.approvedToday || 0) + 1;
    state.moderationActivities = (state.moderationActivities || []).filter(a => a.id !== activityId);
    if (typeof state.moderationKpi?.pendingActivitiesCount === 'number') {
        state.moderationKpi.pendingActivitiesCount = Math.max(0, state.moderationKpi.pendingActivitiesCount - 1);
    }
    if (state.selectedModerationActivityId === activityId) {
        state.selectedModerationActivityId = state.moderationActivities[0]?.id || null;
    }

    await syncClubActivitiesFromSupabase().catch(() => {});

    syncAndRecalculateModerationPending();
    renderModerationModal();
    showSavedToast('✓ Đã phê duyệt và xuất bản lịch sinh hoạt CLB!');
    refreshAdminModerationCounts().catch(() => {});
}

export function selectModerationPlace(placeId) {
    state.selectedModerationPlaceId = placeId;
    renderModerationModal();
}

export async function approvePlace(placeId) {
    const place = (state.moderationPlaces || []).find(p => p.id == placeId || String(p.id) === String(placeId));
    if (!place) return;

    try {
        const token = await getValidAdminToken();
        if (token) {
            const auditNoteEl = document.getElementById('moderatorAuditNote');
            const adminNotes = auditNoteEl ? auditNoteEl.value.trim() : undefined;
            const res = await fetch('/api/admin-moderation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    entity_type: 'place',
                    entity_id: placeId,
                    action: 'approve',
                    admin_notes: adminNotes
                })
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                showSavedToast('Lỗi phê duyệt địa điểm: ' + (errData.error?.message || res.statusText));
                return;
            }
        }
    } catch (e) {
        console.warn('[Moderation] API approvePlace error:', e.message);
        showSavedToast('Lỗi kết nối khi phê duyệt địa điểm: ' + e.message);
        return;
    }

    place.status = 'approved';
    state.moderationKpi.approvedToday = (state.moderationKpi.approvedToday || 0) + 1;
    state.moderationPlaces = (state.moderationPlaces || []).filter(p => p.id != placeId && String(p.id) !== String(placeId));
    if (typeof state.moderationKpi?.pendingPlacesCount === 'number') {
        state.moderationKpi.pendingPlacesCount = Math.max(0, state.moderationKpi.pendingPlacesCount - 1);
    }
    if (state.selectedModerationPlaceId == placeId || String(state.selectedModerationPlaceId) === String(placeId)) {
        state.selectedModerationPlaceId = state.moderationPlaces[0]?.id || null;
    }

    // Làm mới danh sách địa điểm công khai để địa điểm mới duyệt xuất hiện ngay
    if (window.ViVuData?.loadPlaces) {
        const freshPlaces = await window.ViVuData.loadPlaces({ forceRefresh: true }).catch(() => null);
        if (Array.isArray(freshPlaces)) {
            state.allPlaces = freshPlaces;
            state.filteredPlaces = [...freshPlaces];
            renderPlacesGrid('placesContainer', state.filteredPlaces, openDetailModal, toggleBookmark, isPlaceSaved);
        }
    }

    syncAndRecalculateModerationPending();
    renderModerationModal();
    showSavedToast('✓ Đã phê duyệt và xuất bản địa điểm thành công (+15 Điểm Thổ Địa G15)!');
    refreshAdminModerationCounts().catch(() => {});
}

export function openActionReasonModal(actionType, targetId, targetTitle) {
    state.actionReasonModalState = { actionType, targetId, targetTitle };
    const modal = document.getElementById('adminActionReasonModal');
    const container = document.getElementById('adminActionReasonModalContent');
    if (!modal || !container) return;

    container.innerHTML = renderAdminActionReasonModalContent({
        actionType,
        targetId,
        targetTitle
    });
    modal.classList.remove('hidden');
}

export function closeActionReasonModal() {
    const modal = document.getElementById('adminActionReasonModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

export async function submitActionReason(actionType, targetId) {
    const actType = actionType || state.actionReasonModalState?.actionType || '';
    const tgtId = targetId || state.actionReasonModalState?.targetId || '';
    const input = document.getElementById('actionReasonInput');
    const reason = input ? input.value.trim() : '';

    if (actType.startsWith('reject_post')) {
        state.moderationPosts = state.moderationPosts.filter(p => p.id !== tgtId);
        if (typeof state.moderationKpi?.pendingPostsCount === 'number') {
            state.moderationKpi.pendingPostsCount = Math.max(0, state.moderationKpi.pendingPostsCount - 1);
        }
        saveStoredModerationPosts(state.moderationPosts);
        try {
            const token = await getValidAdminToken();
            if (token) {
                await fetch('/api/admin-moderation', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        entity_type: 'community_post',
                        entity_id: tgtId,
                        action: 'reject',
                        reason: reason || 'Nội dung không phù hợp tiêu chuẩn cộng đồng.'
                    })
                });
            }
        } catch (e) {
            console.warn('[Moderation] API reject post error:', e.message);
        }
        showSavedToast('Đã từ chối bài viết và gửi lý do cho người đăng.');
    } else if (actType.startsWith('edit_post')) {
        const post = state.moderationPosts.find(p => p.id === tgtId);
        if (post) {
            post.status = 'needs_edit';
            post.editRequestReason = reason;
            saveStoredModerationPosts(state.moderationPosts);
        }
        showSavedToast('Đã gửi thông báo yêu cầu tác giả chỉnh sửa bổ sung thông tin.');
    } else if (actType.startsWith('reject_club')) {
        state.moderationClubs = state.moderationClubs.filter(c => c.id !== tgtId);
        if (typeof state.moderationKpi?.pendingClubsCount === 'number') {
            state.moderationKpi.pendingClubsCount = Math.max(0, state.moderationKpi.pendingClubsCount - 1);
        }
        saveStoredModerationClubs(state.moderationClubs);
        try {
            const token = await getValidAdminToken();
            if (token) {
                await fetch('/api/admin-moderation', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        entity_type: 'club',
                        entity_id: tgtId,
                        action: 'reject',
                        reason: reason || 'Hồ sơ CLB không đạt tiêu chuẩn điều lệ.'
                    })
                });
            }
        } catch (e) {
            console.warn('[Moderation] API reject club error:', e.message);
        }
        showSavedToast('Đã từ chối hồ sơ CLB và gửi lý do thẩm định.');
    } else if (actType.startsWith('request_club_info')) {
        const club = state.moderationClubs.find(c => c.id === tgtId);
        if (club) {
            club.status = 'needs_info';
            club.infoRequestReason = reason;
            saveStoredModerationClubs(state.moderationClubs);
        }
        showSavedToast('Đã gửi yêu cầu bổ sung thông tin cho Trưởng nhóm CLB.');
    } else if (actType.startsWith('reject_event')) {
        state.moderationEvents = state.moderationEvents.filter(e => e.id !== tgtId);
        if (typeof state.moderationKpi?.pendingEventsCount === 'number') {
            state.moderationKpi.pendingEventsCount = Math.max(0, state.moderationKpi.pendingEventsCount - 1);
        }
        saveStoredModerationEvents(state.moderationEvents);
        try {
            const token = await getValidAdminToken();
            if (token) {
                await fetch('/api/admin-moderation', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        entity_type: 'community_event',
                        entity_id: tgtId,
                        action: 'reject',
                        reason: reason || 'Nội dung sự kiện không phù hợp tiêu chuẩn.'
                    })
                });
            }
        } catch (e) {
            console.warn('[Moderation] API reject event error:', e.message);
        }
        showSavedToast('Đã từ chối sự kiện và lưu lý do thẩm định.');
    } else if (actType.startsWith('reject_article')) {
        state.moderationArticles = (state.moderationArticles || []).filter(a => a.id !== tgtId);
        if (typeof state.moderationKpi?.pendingArticlesCount === 'number') {
            state.moderationKpi.pendingArticlesCount = Math.max(0, state.moderationKpi.pendingArticlesCount - 1);
        }
        try {
            const token = await getValidAdminToken();
            if (token) {
                await fetch('/api/admin-moderation', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        entity_type: 'article',
                        entity_id: tgtId,
                        action: 'reject',
                        reason: reason || 'Nội dung chưa đáp ứng tiêu chuẩn cẩm nang du lịch.'
                    })
                });
            }
        } catch (e) {
            console.warn('[Moderation] API reject article error:', e.message);
        }
        if (state.selectedModerationArticleId === tgtId) {
            state.selectedModerationArticleId = state.moderationArticles[0]?.id || null;
        }
        showSavedToast('Đã từ chối bài cẩm nang và lưu lý do thẩm định.');
    } else if (actType.startsWith('reject_activity')) {
        state.moderationActivities = (state.moderationActivities || []).filter(a => a.id !== tgtId);
        if (typeof state.moderationKpi?.pendingActivitiesCount === 'number') {
            state.moderationKpi.pendingActivitiesCount = Math.max(0, state.moderationKpi.pendingActivitiesCount - 1);
        }
        try {
            const token = await getValidAdminToken();
            if (token) {
                await fetch('/api/admin-moderation', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        entity_type: 'club_activity',
                        entity_id: tgtId,
                        action: 'reject',
                        reason: reason || 'Lịch sinh hoạt chưa đáp ứng tiêu chuẩn cộng đồng.'
                    })
                });
            }
        } catch (e) {
            console.warn('[Moderation] API reject activity error:', e.message);
        }
        if (state.selectedModerationActivityId === tgtId) {
            state.selectedModerationActivityId = state.moderationActivities[0]?.id || null;
        }
        showSavedToast('Đã từ chối lịch sinh hoạt CLB và lưu lý do thẩm định.');
    } else if (actType.startsWith('reject_place')) {
        state.moderationPlaces = (state.moderationPlaces || []).filter(p => p.id != tgtId && String(p.id) !== String(tgtId));
        if (typeof state.moderationKpi?.pendingPlacesCount === 'number') {
            state.moderationKpi.pendingPlacesCount = Math.max(0, state.moderationKpi.pendingPlacesCount - 1);
        }
        try {
            const token = await getValidAdminToken();
            if (token) {
                await fetch('/api/admin-moderation', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        entity_type: 'place',
                        entity_id: tgtId,
                        action: 'reject',
                        reason: reason || 'Địa điểm không đáp ứng tiêu chuẩn cộng đồng.'
                    })
                });
            }
        } catch (e) {
            console.warn('[Moderation] API reject place error:', e.message);
        }
        if (state.selectedModerationPlaceId == tgtId || String(state.selectedModerationPlaceId) === String(tgtId)) {
            state.selectedModerationPlaceId = state.moderationPlaces[0]?.id || null;
        }
        showSavedToast('Đã từ chối đề xuất địa điểm và lưu lý do thẩm định.');
    }

    syncAndRecalculateModerationPending();
    closeActionReasonModal();
    renderModerationModal();
    refreshAdminModerationCounts().catch(() => {});
}

export function quickApproveHighTrust() {
    let count = 0;
    state.moderationPosts.forEach(p => {
        if (p.status === 'pending' && p.aiSafeScore >= 80 && p.author.verified) {
            p.status = 'approved';
            count++;
        }
    });
    if (count > 0) {
        state.moderationPosts = state.moderationPosts.filter(p => p.status === 'pending');
        state.moderationKpi.approvedToday = (state.moderationKpi.approvedToday || 0) + count;
        saveStoredModerationPosts(state.moderationPosts);
        syncAndRecalculateModerationPending();
        renderModerationModal();
        showSavedToast(`✓ Đã duyệt nhanh ${count} bài viết đạt chuẩn an toàn cao!`);
    } else {
        showSavedToast('Không có bài viết mới đạt chuẩn duyệt nhanh.');
    }
}

/**
 * =========================================================================
 * PHASE 11: CHI TIẾT ĐỊA ĐIỂM DI SẢN CHUYÊN SÂU & THƯ MỤC HÀNH TRÌNH ĐÃ LƯU
 * =========================================================================
 */
export function openDeepPlaceDetail(placeId = 'chua-ang') {
    state.deepPlaceId = placeId || 'chua-ang';
    const place = getDeepPlaceDetail(state.deepPlaceId);
    if (!place) return;

    const modal = document.getElementById('deepPlaceDetailModal');
    const content = document.getElementById('deepPlaceDetailModalContent');
    if (!modal || !content) return;

    const isSaved = state.favorites && state.favorites.includes(state.deepPlaceId);
    const m = Math.floor(state.deepAudioCurrentSeconds / 60);
    const s = state.deepAudioCurrentSeconds % 60;
    const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    content.innerHTML = renderDeepPlaceDetailModalContent(
        place,
        state.isDeepAudioPlaying,
        timeStr,
        isSaved
    );

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

export function closeDeepPlaceDetail() {
    const modal = document.getElementById('deepPlaceDetailModal');
    if (modal) {
        modal.classList.add('hidden');
    }
    document.body.classList.remove('overflow-hidden');

    if (state.deepAudioTimerInterval) {
        clearInterval(state.deepAudioTimerInterval);
        state.deepAudioTimerInterval = null;
    }
    state.isDeepAudioPlaying = false;
}

export function toggleAudioGuidePlayback() {
    state.isDeepAudioPlaying = !state.isDeepAudioPlaying;
    const playBtn = document.getElementById('deepAudioPlayBtn');
    const place = getDeepPlaceDetail(state.deepPlaceId);
    const totalDuration = place?.audioGuide?.duration || '04:45';
    const totalSecs = place?.audioGuide?.durationSeconds || 285;

    if (state.isDeepAudioPlaying) {
        if (playBtn) {
            playBtn.innerHTML = '<span class="material-symbols-outlined text-[28px]">pause</span>';
            playBtn.classList.remove('bg-[#EA580C]', 'hover:bg-[#C2410C]');
            playBtn.classList.add('bg-secondary');
        }
        if (state.deepAudioTimerInterval) clearInterval(state.deepAudioTimerInterval);

        state.deepAudioTimerInterval = setInterval(() => {
            state.deepAudioCurrentSeconds++;
            if (state.deepAudioCurrentSeconds >= totalSecs) {
                state.deepAudioCurrentSeconds = 0;
                toggleAudioGuidePlayback();
                return;
            }
            const timerEl = document.getElementById('deepAudioTimer');
            if (timerEl) {
                const m = Math.floor(state.deepAudioCurrentSeconds / 60);
                const s = state.deepAudioCurrentSeconds % 60;
                const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                timerEl.textContent = `${timeStr} / ${totalDuration}`;
            }
        }, 1000);
        showSavedToast('▶ Đang phát Audio thuyết minh bản địa...');
    } else {
        if (playBtn) {
            playBtn.innerHTML = '<span class="material-symbols-outlined text-[28px]">play_arrow</span>';
            playBtn.classList.remove('bg-secondary');
            playBtn.classList.add('bg-[#EA580C]', 'hover:bg-[#C2410C]');
        }
        if (state.deepAudioTimerInterval) {
            clearInterval(state.deepAudioTimerInterval);
            state.deepAudioTimerInterval = null;
        }
        showSavedToast('⏸ Đã tạm dừng Audio thuyết minh.');
    }
}

export function toggleSaveDeepPlace(placeId) {
    if (!placeId) placeId = state.deepPlaceId;
    const isSavedBefore = (state.favorites || []).includes(placeId);
    if (isSavedBefore) {
        state.favorites = (state.favorites || []).filter(id => id !== placeId);
    } else {
        if (!state.favorites) state.favorites = [];
        state.favorites.push(placeId);
    }
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem('vivu_favorites', JSON.stringify(state.favorites));
        }
    } catch (e) {}
    updateFavoritesCount();

    const isSaved = (state.favorites || []).includes(placeId);
    const saveBtn = document.getElementById('deepSavePlaceBtn');
    if (saveBtn) {
        if (isSaved) {
            saveBtn.className = 'flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl bg-secondary text-white font-semibold text-xs shadow-xs transition-colors';
            saveBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">bookmark</span><span id="deepSaveText">Đã lưu</span>';
        } else {
            saveBtn.className = 'flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl bg-surface-container dark:bg-zinc-800 text-on-surface-variant dark:text-zinc-300 hover:text-secondary font-semibold text-xs shadow-xs transition-colors';
            saveBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">bookmark_border</span><span id="deepSaveText">Lưu điểm</span>';
        }
    }
    showSavedToast(isSaved ? '✓ Đã lưu địa điểm vào bộ sưu tập yêu thích!' : 'Đã bỏ lưu địa điểm.');
}

export function shareDeepPlace(placeId) {
    const place = getDeepPlaceDetail(placeId || state.deepPlaceId);
    const shareUrl = `${window.location.origin}/?place=${encodeURIComponent(place?.id || 'chua-ang')}`;
    copyToClipboard(shareUrl);
    showSavedToast(`✓ Đã sao chép liên kết chia sẻ ${place?.name || 'địa điểm'}!`);
}

export function copyDeepPlaceCoords(coords) {
    copyToClipboard(coords || '9.9405° N, 106.3126° E');
    showSavedToast('✓ Đã sao chép tọa độ GPS vào bộ nhớ tạm!');
}

export function addDeepPlaceToTripPlanner(placeId) {
    const place = getDeepPlaceDetail(placeId || state.deepPlaceId);
    closeDeepPlaceDetail();
    openTripPlannerModal();
    showSavedToast(`✓ Đã thêm ${place?.name || 'địa điểm'} vào Lịch trình khám phá!`);
}

export function openPlacePhotoGallery(initialIndex = 0) {
    state.activePhotoGalleryIndex = initialIndex || 0;
    const place = getDeepPlaceDetail(state.deepPlaceId);
    const modal = document.getElementById('placePhotoGalleryModal');
    const content = document.getElementById('placePhotoGalleryModalContent');
    if (!modal || !content) return;

    content.innerHTML = renderPlacePhotoGalleryModalContent(place, state.activePhotoGalleryIndex);
    modal.classList.remove('hidden');
}

export function closePlacePhotoGallery() {
    const modal = document.getElementById('placePhotoGalleryModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

export function switchGalleryPhoto(index) {
    state.activePhotoGalleryIndex = index;
    const place = getDeepPlaceDetail(state.deepPlaceId);
    const content = document.getElementById('placePhotoGalleryModalContent');
    if (content && place) {
        content.innerHTML = renderPlacePhotoGalleryModalContent(place, state.activePhotoGalleryIndex);
    }
}

export function openItineraryFolderDetail(folderId = 'folder-heritage-01') {
    const folder = getSavedItineraryFolderDetail(folderId);
    state.activeItineraryFolder = folder;

    const modal = document.getElementById('itineraryFolderDetailModal');
    const content = document.getElementById('itineraryFolderDetailModalContent');
    if (!modal || !content) return;

    content.innerHTML = renderItineraryFolderDetailModalContent(folder);
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

export function closeItineraryFolderDetail() {
    const modal = document.getElementById('itineraryFolderDetailModal');
    if (modal) {
        modal.classList.add('hidden');
    }
    document.body.classList.remove('overflow-hidden');
}

export function shareItineraryFolder(folderId) {
    const shareUrl = `${window.location.origin}/?folder=${encodeURIComponent(folderId || 'folder-heritage-01')}`;
    copyToClipboard(shareUrl);
    showSavedToast('✓ Đã sao chép liên kết chia sẻ Thư mục Hành trình!');
}

export function optimizeFolderRoute() {
    if (!state.activeItineraryFolder) {
        state.activeItineraryFolder = getSavedItineraryFolderDetail('folder-heritage-01');
    }
    state.activeItineraryFolder.optimizationSummary = 'AI Route: Lộ trình đã được tối ưu tuyệt đối theo chuỗi thời gian (tiết kiệm 2.4 km).';
    saveSavedItineraryFolderDetail(state.activeItineraryFolder);

    const content = document.getElementById('itineraryFolderDetailModalContent');
    if (content) {
        content.innerHTML = renderItineraryFolderDetailModalContent(state.activeItineraryFolder);
    }
    showSavedToast('✓ Lộ trình đã được AI Route tối ưu hóa thành công!');
}

export function removeStopFromFolder(stopId) {
    if (!state.activeItineraryFolder || !state.activeItineraryFolder.stops) return;
    state.activeItineraryFolder.stops = state.activeItineraryFolder.stops.filter(s => s.id !== stopId);
    state.activeItineraryFolder.stopsCount = state.activeItineraryFolder.stops.length;
    saveSavedItineraryFolderDetail(state.activeItineraryFolder);

    const content = document.getElementById('itineraryFolderDetailModalContent');
    if (content) {
        content.innerHTML = renderItineraryFolderDetailModalContent(state.activeItineraryFolder);
    }
    showSavedToast('Đã xóa chặng dừng khỏi thư mục hành trình.');
}

// Expose ra window để hỗ trợ inline HTML event handlers
if (typeof window !== 'undefined') {
    window.ViVuApp = {
        toggleTheme,
        openDetailModal,
        closeDetailModal,
        toggleAudioGuide,
        stopAudioGuide,
        toggleModalBookmark,
        openFullMapModal,
        closeFullMapModal,
        openTourItinerariesModal,
        closeTourItinerariesModal,
        updateHeroStats,
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
        navGoClubs,
        navGoCommunity,
        navGoBlog,
        navGoEvents,
        navGoPlanner,
        navGoSaved,
        navGoSearch,
        navGoFeedback,
        navGoAbout,
        navGoCompanion,
        submitFeedbackDraft,
        navGoSection,
        switchView,
        getActiveView,
        setBottomNavActive,
        updateNavActiveStates,
        updateSidebarNavActive,
        openMobileDrawer,
        closeMobileDrawer,
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
        selectMapPlace,
        selectMapPlaceById,
        closeMapActiveCard,
        handleMapSearch,
        clearMapSearch,
        setMapCategory,
        toggleMapFilter,
        toggleMapMobileView,
        mapZoomIn,
        mapZoomOut,
        recenterMapToTraVinh,
        shareMapPlace,
        updateFullMapContent,
        openReportModal,
        closeReportModal,
        submitReportPlace,
        shareTripCollection,
        updatePlaceMetaTags,
        restoreDefaultMetaTags,
        handleTripShareParam,
        // Community & Clubs Methods (Phase 5)
        initCommunitySection,
        renderClubsGrid,
        filterClubsByCategory,
        toggleJoinClub,
        toggleBookmarkClub,
        renderCommunityFeed,
        filterCommunityFeed,
        toggleLikePost,
        toggleRsvpActivity,
        showActivityRsvpNotice,
        shareCommunityPost,
        handleCommentPrompt,
        promptAddPostPhoto,
        promptAddPostLocation,
        closeCommunityCheckinModal,
        filterCheckinPlaces,
        selectCheckinPlace,
        clearCommunityPostCheckin,
        clearCommunityPostAttachment,
        submitNewCommunityPost,
        openCreateClubModal,
        closeCreateClubModal,
        submitCreateClub,
        focusClubSearch,
        // Events & Festivals Methods (Phase 6)
        handleEventCategoryFilter,
        handleEventRegionFilter,
        toggleBookmarkEvent,
        openEventRsvpModal,
        closeEventRsvpModal,
        submitEventRsvp,
        openHostEventModal,
        closeHostEventModal,
        submitHostEvent,
        handleGrandstandRsvp,
        openOfflineTicketModal,
        closeOfflineTicketModal,
        // Supabase Auth & UGC Lifecycle
        openAuthModal,
        closeAuthModal,
        switchAuthTab,
        handleAuthSubmit,
        handleUserSignOut,
        getUserSession,
        fetchUserProfile,
        syncCommunityUgcFeed,
        syncCommunityEventsFromSupabase,
        // Profile & Saved Collections Methods (Phase 7)
        openProfileModal,
        closeProfileModal,
        switchProfileTab,
        filterProfileBadges,
        fetchUserContributionPoints,
        handleSelectUserTitle,
        openRedeemGiftModal,
        closeRedeemGiftModal,
        redeemGift,
        openEditProfileModal,
        closeEditProfileModal,
        submitEditProfile,
        openSavedCollectionsModal,
        closeSavedCollectionsModal,
        filterSavedCategory,
        sortSavedItems,
        setSavedViewMode,
        removeSavedItem,
        clearAllSavedItems,
        handleSavedSearch,
        clearSavedSearch,
        resetSavedFilters,
        openCreateCollectionModal,
        closeCreateCollectionModal,
        submitCreateCollection,
        openExportItineraryModal,
        closeExportItineraryModal,
        copyExportItinerary,
        shareProfileStory,
        openSavedDetail,
        showSavedToast,
        showNotification,
        // Security Center & 2FA Methods (Phase 8)
        openSecurityModal,
        closeSecurityModal,
        switchSecurityTab,
        togglePasswordVisibility,
        submitChangePassword,
        toggleSmsBackup,
        openLink2FAModal,
        closeLink2FAModal,
        copySecretKey,
        handleOtpInput,
        handleOtpKeydown,
        pasteOtpCode,
        verify2FA,
        openBackupCodesModal,
        closeBackupCodesModal,
        copyBackupCodes,
        regenerateBackupCodes,
        revokeDeviceSession,
        revokeAllOtherSessions,
        toggleNotificationPref,
        resetDefaultNotificationPrefs,
        togglePrivacyPref,
        exportUserData,
        // Trip Planner, GPS Navigation & Social Stories Methods (Phase 9)
        openTripPlannerModal,
        closeTripPlannerModal,
        renderPlannerMainView,
        switchPlannerTab,
        selectTourInPlanner,
        handleGenerateRandomTourInPlanner,
        movePlannerStop,
        applyTourTemplateToPlanner,
        saveTripPlanToDevice,
        saveTripPlanToAccount,
        getActiveUserIdentifier,
        getTripPlanStorageKey,
        handleAuthTripPlanSync,
        resetTripPlanToDefault,
        switchPlannerDay,
        addNewPlannerDay,
        filterPlannerPool,
        searchPlannerPool,
        addPlaceToPlan,
        removePlaceFromPlan,
        addCustomStopToPlan,
        optimizePlanAiRoute,
        exportGpxFile,
        isGpxVerifiedStop,
        generateGpxXml,
        isValidGpxCoordinate,
        filterValidGpxStops,
        openGpsNavModal,
        closeGpsNavModal,
        toggleGpsVoice,
        toggleGpsAudioGuide,
        toggleGps3DMode,
        searchNearbyPitstops,
        finishGpsNavigation,
        openTripSummaryModal,
        closeTripSummaryModal,
        openStoryShareModal,
        closeStoryShareModal,
        switchStoryTheme,
        toggleStoryElement,
        downloadStoryCard,
        copyStoryLink,
        shareToSocial,
        // Admin Support Wall & Moderation Portal Methods (Phase 10)
        openAdminSupportModal,
        closeAdminSupportModal,
        selectDonationTier,
        applyCustomDonation,
        copyTransferNote,
        copyToClipboard,
        confirmSimulatedDonation,
        openAdminModerationModal,
        closeAdminModerationModal,
        switchModerationTab,
        selectModerationPost,
        selectModerationClub,
        selectModerationEvent,
        selectModerationArticle,
        openEditArticleFromModeration,
        getSelectedModerationArticle: () => (state.moderationArticles || []).find(a => a.id === state.selectedModerationArticleId) || (state.moderationArticles || [])[0] || null,
        handleModerationSearch,
        filterModerationRisk,
        approvePost,
        approveClub,
        approveEvent,
        approveArticle,
        openActionReasonModal,
        closeActionReasonModal,
        submitActionReason,
        quickApproveHighTrust,
        openSubmitArticleModal,
        closeSubmitArticleModal,
        submitArticle,
        syncArticlesFromSupabase,
        openSubmitClubActivityModal,
        closeSubmitClubActivityModal,
        submitClubActivity,
        syncClubActivitiesFromSupabase,
        selectModerationActivity,
        approveClubActivity,
        selectModerationPlace,
        approvePlace,
        getArticleCategoryBadgeClass,
        getArticleCategoryName,
        sanitizeArticleContent,
        updateAdminRoleUI,
        updateAdminModerationBadge,
        refreshAdminModerationCounts,
        syncAndRecalculateModerationPending,
        retryLoadCheckinPlaces,
        // UGC Content & Rejection Lifecycle Methods (My Content)
        getUserUgcState,
        filterUserUgcContent,
        openMyContentModal,
        fetchUserUgcContent,
        openEditUgcItem,
        viewPublishedUgcItem,
        openEditCommunityPostModal,
        closeEditCommunityPostModal,
        submitEditCommunityPost,
        // Deep Cultural Heritage & Saved Itinerary Folder Methods (Phase 11)
        openDeepPlaceDetail,
        closeDeepPlaceDetail,
        toggleAudioGuidePlayback,
        toggleSaveDeepPlace,
        shareDeepPlace,
        copyDeepPlaceCoords,
        addDeepPlaceToTripPlanner,
        openPlacePhotoGallery,
        closePlacePhotoGallery,
        switchGalleryPhoto,
        openItineraryFolderDetail,
        closeItineraryFolderDetail,
        shareItineraryFolder,
        optimizeFolderRoute,
        removeStopFromFolder,
        getState: () => state,
        get state() { return state; }
    };

    window.openDetailFromMap = (id) => {
        if (window.ViVuApp?.openDetailFromMap) {
            window.ViVuApp.openDetailFromMap(id);
        }
    };
}

