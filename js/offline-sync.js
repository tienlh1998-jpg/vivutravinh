// ViVuTraVinh - Offline Storage & Sync Manager (IndexedDB & Background Sync)

import { validateCommentInput } from './comments.js';

const DB_NAME = 'ViVuTraVinh_DB';
const DB_VERSION = 3;
const STORE_NAME = 'offline_reviews';
const CONTRIB_STORE_NAME = 'offline_contributions';

/**
 * Cờ khóa đồng bộ chống race-condition / double-sync (G3 Mutex)
 */
let isSyncInProgress = false;

export function isSyncing() {
    return isSyncInProgress;
}

/**
 * Mở kết nối IndexedDB (hỗ trợ Promise)
 */
export function openOfflineDB() {
    return new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) {
            reject(new Error('Trình duyệt không hỗ trợ IndexedDB'));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('place_id', 'place_id', { unique: false });
                store.createIndex('created_at', 'created_at', { unique: false });
                store.createIndex('status', 'status', { unique: false });
            }
            if (!db.objectStoreNames.contains(CONTRIB_STORE_NAME)) {
                const contribStore = db.createObjectStore(CONTRIB_STORE_NAME, { keyPath: 'id' });
                contribStore.createIndex('created_at', 'created_at', { unique: false });
                contribStore.createIndex('status', 'status', { unique: false });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Nén ảnh chụp thực tế trên Canvas (Client-side Image Optimization)
 * Kiểm tra MIME type, dung lượng tối đa 5MB và giải mã an toàn (G3)
 */
export function compressImage(file, maxWidth = 1200, maxHeight = 1200, quality = 0.75) {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject(new Error('Vui lòng chọn tệp hình ảnh.'));
            return;
        }

        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
        const fileType = (file.type || '').toLowerCase();
        if (!allowedMimeTypes.includes(fileType)) {
            reject(new Error('Định dạng tệp không được hỗ trợ. Vui lòng chọn ảnh JPEG, PNG hoặc WebP.'));
            return;
        }

        const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
        if (file.size > MAX_FILE_SIZE) {
            reject(new Error('Dung lượng ảnh quá lớn (tối đa 5MB). Vui lòng chọn ảnh dung lượng nhỏ hơn.'));
            return;
        }

        const reader = new FileReader();
        reader.onload = (readerEvent) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width <= 0 || height <= 0) {
                    reject(new Error('Kích thước hình ảnh không hợp lệ.'));
                    return;
                }

                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve({
                    dataUrl,
                    width,
                    height,
                    originalSize: file.size,
                    compressedSize: Math.round((dataUrl.length * 3) / 4)
                });
            };
            img.onerror = () => reject(new Error('Không thể giải mã hình ảnh hoặc tệp bị hỏng.'));
            img.src = readerEvent.target.result;
        };
        reader.onerror = () => reject(new Error('Lỗi khi đọc tệp ảnh từ thiết bị.'));
        reader.readAsDataURL(file);
    });
}

/**
 * Lưu đánh giá vào hàng đợi IndexedDB khi Offline
 * CHẶN HOÀN TOÀN input sai trước khi ghi IndexedDB (G3)
 */
export async function saveOfflineReview(input) {
    // 1. Kiểm tra validation dùng chung (ném CommentValidationError nếu sai)
    const validated = validateCommentInput(input);

    const db = await openOfflineDB();
    const id = validated.client_review_id || ('offrev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
    const reviewItem = {
        id,
        client_review_id: id,
        place_id: validated.place_id,
        place_name: validated.place_name,
        author_name: validated.author_name,
        rating: validated.rating,
        comment_text: validated.comment_text,
        photo_data: validated.photo_data, // Base64 data URL
        created_at: new Date().toISOString(),
        status: 'pending', // 'pending' | 'syncing' | 'failed' | 'needs_fix'
        sync_attempts: 0,
        is_offline: true
    };

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(reviewItem);

        req.onsuccess = () => {
            // Yêu cầu Service Worker kích hoạt Background Sync nếu trình duyệt hỗ trợ
            registerBackgroundSync();
            resolve(reviewItem);
        };
        req.onerror = () => reject(req.error);
    });
}

/**
 * Lấy các đánh giá ngoại tuyến theo từng địa điểm
 */
export async function getOfflineReviewsByPlace(placeId) {
    try {
        const db = await openOfflineDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const index = store.index('place_id');
            const req = index.getAll(IDBKeyRange.only(String(placeId).trim()));

            req.onsuccess = () => {
                const results = req.result || [];
                // Sắp xếp mới nhất lên trước
                results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                resolve(results);
            };
            req.onerror = () => resolve([]);
        });
    } catch {
        return [];
    }
}

/**
 * Lấy toàn bộ đánh giá đang chờ đồng bộ
 */
export async function getAllOfflineReviews() {
    try {
        const db = await openOfflineDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();

            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    } catch {
        return [];
    }
}

/**
 * Đếm số lượng đánh giá ngoại tuyến đang chờ
 */
export async function getPendingOfflineCount() {
    try {
        const all = await getAllOfflineReviews();
        return all.length;
    } catch {
        return 0;
    }
}

/**
 * Xóa đánh giá khỏi IndexedDB sau khi đồng bộ thành công
 */
export async function deleteOfflineReview(id) {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);

        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
    });
}

/**
 * Đồng bộ tất cả đánh giá đang chờ lên Supabase
 * Tích hợp Concurrency Lock (Mutex) và phân loại lỗi hàng đợi an toàn (G3)
 */
export async function syncAllPendingReviews(submitFunction, onProgress) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return { synced: 0, failed: 0, pending: await getPendingOfflineCount(), offline: true };
    }

    // CONCURRENCY LOCK: Ngăn chặn việc online event, heartbeat và manual sync gửi đồng thời
    if (isSyncInProgress) {
        console.warn('[OfflineSync] Tiến trình đồng bộ đang chạy, bỏ qua yêu cầu trùng lặp.');
        return { synced: 0, failed: 0, pending: await getPendingOfflineCount(), locked: true };
    }

    isSyncInProgress = true;
    try {
        const reviews = await getAllOfflineReviews();
        if (!reviews || reviews.length === 0) {
            return { synced: 0, failed: 0, pending: 0 };
        }

        let syncedCount = 0;
        let failedCount = 0;

        for (const rev of reviews) {
            // 1. Kiểm tra validation của bản ghi trong queue (phòng ngừa dữ liệu cũ bị hỏng)
            try {
                validateCommentInput(rev);
            } catch (valErr) {
                console.warn(`[OfflineSync] Bản ghi ${rev.id} trong queue không hợp lệ, loại bỏ để tránh loop vô hạn:`, valErr.message);
                await deleteOfflineReview(rev.id);
                failedCount++;
                continue;
            }

            try {
                if (onProgress) onProgress(rev, 'syncing');

                // Gửi dữ liệu lên Supabase thông qua hàm submitComment
                await submitFunction({
                    placeId: rev.place_id,
                    placeName: rev.place_name,
                    authorName: rev.author_name,
                    rating: rev.rating,
                    commentText: rev.comment_text,
                    photoData: rev.photo_data,
                    client_review_id: rev.client_review_id || rev.id,
                    skipCooldown: true
                });

                // Xóa khỏi hàng đợi sau khi thành công
                await deleteOfflineReview(rev.id);
                syncedCount++;

                if (onProgress) onProgress(rev, 'success');
            } catch (err) {
                console.warn(`[OfflineSync] Lỗi đồng bộ đánh giá ${rev.id}:`, err);
                failedCount++;

                // Nếu lỗi do server rate limiting (429) hoặc tạm thời không khả dụng (503), tạm dừng đợt đồng bộ này để không spam server
                if (err?.isRateLimitError || err?.status === 429 || err?.code === 'RATE_LIMITED' || err?.status === 503 || err?.code === 'RATE_LIMIT_UNAVAILABLE') {
                    console.warn('[OfflineSync] Server đang giới hạn tần suất (429) hoặc dịch vụ bận (503). Giữ lại các bản ghi trong queue và tạm dừng đợt đồng bộ này.');
                    if (onProgress) onProgress(rev, 'error', err);
                    break;
                }

                // Nếu lỗi là validation, cooldown hoặc lỗi quyền (401/403), loại bỏ để không retry vô hạn
                if (err?.code === 'VALIDATION_ERROR' || err?.code === 'COOLDOWN_ERROR' || err?.status === 401 || err?.status === 403) {
                    await deleteOfflineReview(rev.id);
                }

                if (onProgress) onProgress(rev, 'error', err);
            }
        }

        const remaining = await getPendingOfflineCount();

        // Phát sự kiện toàn hệ thống
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('vivu:offline-synced', {
                detail: { syncedCount, failedCount, remaining }
            }));
        }

        return { synced: syncedCount, failed: failedCount, pending: remaining };
    } finally {
        isSyncInProgress = false;
    }
}

/**
 * Đăng ký Background Sync API với Service Worker
 */
export async function registerBackgroundSync() {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        try {
            const reg = await navigator.serviceWorker.ready;
            await reg.sync.register('sync-pending-reviews');
            console.log('[OfflineSync] Background Sync registered successfully.');
        } catch (err) {
            console.warn('[OfflineSync] Background Sync not supported or registration failed:', err);
        }
    }
}

/**
 * Xóa địa điểm đóng góp ngoại tuyến đã đồng bộ thành công khỏi IndexedDB
 */
export async function deleteOfflineContribution(id) {
    if (!id) return;
    try {
        const db = await openOfflineDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(CONTRIB_STORE_NAME, 'readwrite');
            const store = tx.objectStore(CONTRIB_STORE_NAME);
            const req = store.delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch (e) {
        console.warn('[OfflineSync] Lỗi xóa đóng góp offline:', e);
    }
}

/**
 * Đếm số lượng địa điểm đóng góp đang chờ đồng bộ
 */
export async function getPendingContributionCount() {
    try {
        const list = await getAllOfflineContributions();
        return list.filter(c => c.status !== 'needs_fix').length;
    } catch {
        return 0;
    }
}

/**
 * Cập nhật bản ghi đóng góp ngoại tuyến trong IndexedDB
 */
export async function updateOfflineContribution(item) {
    if (!item || !item.id) return;
    try {
        const db = await openOfflineDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(CONTRIB_STORE_NAME, 'readwrite');
            const store = tx.objectStore(CONTRIB_STORE_NAME);
            const req = store.put(item);
            req.onsuccess = () => resolve(item);
            req.onerror = () => reject(req.error);
        });
    } catch (e) {
        console.warn('[OfflineSync] Lỗi cập nhật đóng góp offline:', e);
    }
}

/**
 * Đồng bộ tất cả địa điểm đóng góp ngoại tuyến đang chờ lên server
 */
export async function syncAllPendingContributions(submitFunction, onProgress) {
    if (!submitFunction || typeof submitFunction !== 'function') {
        console.warn('[OfflineSync] Chưa cung cấp hàm submitFunction để đồng bộ đóng góp.');
        return { total: 0, synced: 0, failed: 0 };
    }

    if (isSyncInProgress) {
        console.log('[OfflineSync] Quá trình đồng bộ đang diễn ra, bỏ qua yêu cầu trùng lặp.');
        return { total: 0, synced: 0, failed: 0, skipped: true };
    }

    isSyncInProgress = true;
    let synced = 0;
    let failed = 0;

    try {
        const all = await getAllOfflineContributions();
        // Chỉ đồng bộ các bản ghi pending, bỏ qua các bản ghi needs_fix
        const pending = all.filter(c => c.status !== 'needs_fix');
        if (pending.length === 0) {
            return { total: 0, synced: 0, failed: 0 };
        }

        console.log(`[OfflineSync] Bắt đầu đồng bộ ${pending.length} địa điểm đóng góp ngoại tuyến...`);

        for (const contrib of pending) {
            try {
                const payload = {
                    client_submission_id: contrib.client_submission_id || contrib.id,
                    name: contrib.name,
                    category: contrib.category,
                    area: contrib.area,
                    address: contrib.address,
                    price_raw: contrib.price_raw,
                    display_hours: contrib.display_hours,
                    coordinates: contrib.coordinates,
                    map_link: contrib.map_link,
                    description: contrib.description,
                    contributor: contrib.contributor,
                    contact: contrib.contact,
                    images: contrib.images || []
                };

                const res = await submitFunction(payload);

                // CHỈ XÓA KHỎI QUEUE KHI API TRẢ VỀ success=true HOẶC idempotent=true
                if (res && (res.success === true || res.idempotent === true || res.status === 'draft')) {
                    await deleteOfflineContribution(contrib.id);
                    synced++;
                    if (onProgress) onProgress(contrib, 'success');
                } else {
                    console.warn(`[OfflineSync] Kết quả phản hồi không xác nhận thành công cho ${contrib.id}:`, res);
                    failed++;
                }
            } catch (err) {
                failed++;
                if (onProgress) onProgress(contrib, 'error', err);
                console.warn(`[OfflineSync] Lỗi đồng bộ địa điểm ${contrib.id}:`, err.message);

                // 1. Phân loại lỗi vĩnh viễn (400 Bad Request / 413 Payload Too Large / Validation Error)
                // Chuyển sang trạng thái needs_fix và ngừng retry tự động để không spam server
                if (err.status === 400 || err.status === 413 || err.code === 'VALIDATION_ERROR' || err.code === 'PAYLOAD_TOO_LARGE') {
                    contrib.status = 'needs_fix';
                    contrib.last_error = err.message || `Lỗi dữ liệu vĩnh viễn (${err.status})`;
                    contrib.failed_at = new Date().toISOString();
                    await updateOfflineContribution(contrib);
                    console.warn(`[OfflineSync] Đóng góp ${contrib.id} đánh dấu 'needs_fix', ngừng retry tự động.`);
                    continue; // Tiếp tục xử lý các bản ghi khác
                }

                // 2. Phân loại lỗi giới hạn tần suất hoặc dịch vụ quá tải (429 Rate Limit / 503 Service Unavailable)
                // Giữ nguyên trạng thái pending và dừng toàn bộ lượt sync hiện tại
                if (err.status === 429 || err.status === 503 || err.isRateLimitError || err.code === 'RATE_LIMITED' || err.code === 'RATE_LIMIT_UNAVAILABLE') {
                    console.warn(`[OfflineSync] Server báo ${err.status}. Giữ nguyên pending và dừng lượt sync này.`);
                    break;
                }

                // 3. Nếu mất mạng giữa chừng, dừng lượt sync
                if (typeof navigator !== 'undefined' && !navigator.onLine) {
                    console.warn('[OfflineSync] Mất kết nối mạng giữa chừng, dừng lượt sync.');
                    break;
                }
            }
        }

        return { total: pending.length, synced, failed };
    } finally {
        isSyncInProgress = false;
    }
}

/**
 * Thiết lập Auto-Sync lắng nghe sự kiện mạng (Online / Reconnect) cho cả Review và Đóng Góp
 */
export function setupAutoSync(submitReviewFn, onSyncSuccess, submitContribFn, onContribSyncSuccess) {
    const runSync = async () => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) return;

        if (submitReviewFn) {
            const reviewResult = await syncAllPendingReviews(submitReviewFn);
            if (reviewResult.synced > 0 && onSyncSuccess) {
                onSyncSuccess(reviewResult);
            }
        }

        if (submitContribFn) {
            const contribResult = await syncAllPendingContributions(submitContribFn);
            if (contribResult.synced > 0 && onContribSyncSuccess) {
                onContribSyncSuccess(contribResult);
            }
        }
    };

    // 1. Khi mạng có lại
    if (typeof window !== 'undefined') {
        window.addEventListener('online', async () => {
            console.log('[OfflineSync] Thiết bị đã kết nối mạng trở lại, bắt đầu đồng bộ...');
            await runSync();
        });
    }

    // 2. Nhận tín hiệu từ Service Worker
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', async (event) => {
            if (event.data && event.data.type === 'TRIGGER_OFFLINE_SYNC') {
                console.log('[OfflineSync] Nhận yêu cầu đồng bộ từ Service Worker sync event.');
                await runSync();
            }
        });
    }

    // 3. Heartbeat đồng bộ định kỳ mỗi 45 giây nếu có mạng
    if (typeof setInterval !== 'undefined') {
        setInterval(async () => {
            if (typeof navigator !== 'undefined' && navigator.onLine) {
                const pendingReviews = await getPendingOfflineCount();
                const pendingContribs = await getPendingContributionCount();
                if (pendingReviews > 0 || pendingContribs > 0) {
                    await runSync();
                }
            }
        }, 45000);
    }
}

/**
 * Lưu địa điểm đóng góp ngoại tuyến vào IndexedDB
 */
export async function saveOfflineContribution(data) {
    const db = await openOfflineDB();
    const id = data.id || ('off_contrib_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
    const item = {
        ...data,
        id,
        client_submission_id: data.client_submission_id || id,
        created_at: data.created_at || new Date().toISOString(),
        status: 'pending_draft'
    };

    return new Promise((resolve, reject) => {
        const tx = db.transaction(CONTRIB_STORE_NAME, 'readwrite');
        const store = tx.objectStore(CONTRIB_STORE_NAME);
        const req = store.put(item);
        req.onsuccess = () => resolve(item);
        req.onerror = () => reject(req.error);
    });
}

/**
 * Lấy tất cả địa điểm đóng góp ngoại tuyến
 */
export async function getAllOfflineContributions() {
    try {
        const db = await openOfflineDB();
        return new Promise((resolve) => {
            const tx = db.transaction(CONTRIB_STORE_NAME, 'readonly');
            const store = tx.objectStore(CONTRIB_STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    } catch {
        return [];
    }
}
