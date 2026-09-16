import { initConfig } from './config.js';

const TABLE_NAME = 'place_comments';
const COMMENT_LIMIT = 20;
const COOLDOWN_MS = 30 * 1000;

function getSupabaseConfig() {
    const config = initConfig();
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
        throw new Error('Supabase chưa được cấu hình.');
    }

    return {
        url: config.supabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
        anonKey: config.supabaseAnonKey,
    };
}

function buildHeaders(anonKey, prefer) {
    const headers = {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
    };

    if (prefer) headers.Prefer = prefer;
    return headers;
}

export class SupabaseRequestError extends Error {
    constructor(message, status, data = null) {
        super(message);
        this.name = 'SupabaseRequestError';
        this.status = status;
        this.data = data;
        this.isAuthError = status === 401 || status === 403;
        const msg = String(message || '').toLowerCase();
        const code = String(data?.code || '');
        this.isSchemaError = status === 400 && (
            msg.includes('column') || msg.includes('schema') || msg.includes('photo_url') ||
            code === 'PGRST204' || code === 'PGRST200' || code === '42703'
        );
        this.isConflictError = status === 409 || msg.includes('duplicate key') || code === '23505' || msg.includes('unique constraint');
        this.isRateLimitError = status === 429;
    }
}

async function requestSupabase(path, options = {}, timeoutMs = 8000) {
    const { url, anonKey } = getSupabaseConfig();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${url}/rest/v1/${path}`, {
            ...options,
            signal: options.signal || controller.signal,
            headers: {
                ...buildHeaders(anonKey, options.prefer),
                ...(options.headers || {}),
            },
        });

        if (!response.ok) {
            let errorBody = null;
            let errorMessage = '';
            try {
                errorBody = await response.json();
                errorMessage = errorBody.message || errorBody.error || errorBody.hint || JSON.stringify(errorBody);
            } catch {
                errorMessage = await response.text();
            }
            throw new SupabaseRequestError(
                errorMessage || `Supabase request failed: ${response.status}`,
                response.status,
                errorBody
            );
        }

        if (response.status === 204) return null;
        return response.json();
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new SupabaseRequestError(`Yêu cầu Supabase bị timeout sau ${timeoutMs}ms`, 408);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

export class CommentValidationError extends Error {
    constructor(message, field = 'general') {
        super(message);
        this.name = 'CommentValidationError';
        this.code = 'VALIDATION_ERROR';
        this.field = field;
    }
}

export class CommentCooldownError extends Error {
    constructor(remainingSeconds) {
        super(`Vui lòng chờ ${remainingSeconds} giây trước khi gửi bình luận tiếp theo.`);
        this.name = 'CommentCooldownError';
        this.code = 'COOLDOWN_ERROR';
        this.remainingSeconds = remainingSeconds;
    }
}

export function isMockMode(overrides = {}) {
    try {
        if (typeof window !== 'undefined' && window.location && window.location.search) {
            const params = new URLSearchParams(window.location.search);
            const sourceParam = params.get('source');
            if (sourceParam) {
                return sourceParam.toLowerCase().trim() === 'mock';
            }
        }
        const config = initConfig(overrides);
        return Boolean(config && config.dataSource === 'mock');
    } catch {
        return false;
    }
}

const INITIAL_MOCK_COMMENTS = [
    {
        id: 'mock_cmt_1',
        place_id: 'bun-nuoc-leo-tho-dia-tra-vinh',
        place_name: 'Bún Nước Lèo Thổ Địa Trà Vinh',
        author_name: 'Thạch Minh',
        rating: 5,
        comment_text: 'Nước lèo mắm bò hóc đậm đà, heo quay da giòn rụm! Giá 35k cực kỳ hợp lý.',
        created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
        photo_url: null,
        client_review_id: 'clrev_mock_1'
    },
    {
        id: 'mock_cmt_2',
        place_id: 'goc-hen-pho-co-cafe',
        place_name: 'Góc Hẹn Phố Cổ Cafe',
        author_name: 'Bảo Trâm',
        rating: 5,
        comment_text: 'Không gian vintage yên tĩnh, cà phê sữa thơm béo chuẩn vị miền Tây.',
        created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
        photo_url: null,
        client_review_id: 'clrev_mock_2'
    },
    {
        id: 'mock_cmt_3',
        place_id: 'ao-ba-om',
        place_name: 'Ao Bà Om',
        author_name: 'Lê Hoàng',
        rating: 5,
        comment_text: 'Hàng cây sao, dầu cổ thụ trăm năm tỏa bóng râm mát rượi, không khí trong lành tuyệt đối.',
        created_at: new Date(Date.now() - 3600000 * 48).toISOString(),
        photo_url: null,
        client_review_id: 'clrev_mock_3'
    }
];

function getMockComments() {
    let stored = [];
    try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
            const raw = window.sessionStorage.getItem('vivu_mock_comments');
            if (raw) stored = JSON.parse(raw);
        }
    } catch {}
    return [...INITIAL_MOCK_COMMENTS, ...stored];
}

function saveMockComment(comment) {
    try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
            const raw = window.sessionStorage.getItem('vivu_mock_comments');
            const list = raw ? JSON.parse(raw) : [];
            list.unshift(comment);
            window.sessionStorage.setItem('vivu_mock_comments', JSON.stringify(list));
        }
    } catch {}
}

/**
 * Hàm kiểm tra tính hợp lệ của bình luận dùng chung cho cả Online và Offline (G3)
 * Chặn hoàn toàn dữ liệu sai trước khi gửi API hoặc ghi vào IndexedDB.
 */
export function validateCommentInput(input) {
    if (!input || typeof input !== 'object') {
        throw new CommentValidationError('Dữ liệu đánh giá không hợp lệ.', 'general');
    }

    const place_id = String(input.placeId || input.place_id || '').trim();
    const place_name = String(input.placeName || input.place_name || '').trim();
    const author_name = String(input.authorName || input.author_name || '').trim();
    const rawRating = input.rating;
    const parsedRating = typeof rawRating === 'number' ? rawRating : parseInt(rawRating, 10);
    const comment_text = String(input.commentText || input.comment_text || '').trim();
    const client_review_id = String(input.client_review_id || input.clientReviewId || input.id || '').trim() ||
        `clrev_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    if (!place_id) {
        throw new CommentValidationError('Thiếu mã địa điểm cần đánh giá.', 'place_id');
    }

    // Tên: 2–80 ký tự sau khi trim (loại bỏ "A", rỗng, toàn khoảng trắng)
    if (!author_name || author_name.length < 2 || author_name.length > 80) {
        throw new CommentValidationError('Tên người đánh giá cần từ 2 đến 80 ký tự.', 'author_name');
    }

    // Rating: Bắt buộc người dùng chủ động chọn 1–5 sao (không chấp nhận 0, rỗng, NaN)
    if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
        throw new CommentValidationError('Vui lòng chọn số sao đánh giá (từ 1 đến 5 sao).', 'rating');
    }

    // Nội dung bình luận: 3–1000 ký tự sau khi trim
    if (!comment_text || comment_text.length < 3 || comment_text.length > 1000) {
        throw new CommentValidationError('Nội dung đánh giá cần từ 3 đến 1000 ký tự.', 'comment_text');
    }

    // Kiểm tra ảnh nếu có (chỉ chấp nhận Data URI ảnh hợp lệ hoặc URL http/https)
    const photoData = input.photoData || input.photo_data || input.photo_url || null;
    if (photoData) {
        const isDataUrl = /^data:image\/(jpeg|png|webp|jpg);base64,[A-Za-z0-9+/=]+$/.test(photoData);
        const isHttpUrl = /^https?:\/\/[^\s"'<>]+$/i.test(photoData);
        if (!isDataUrl && !isHttpUrl) {
            throw new CommentValidationError('Định dạng ảnh đính kèm không hợp lệ hoặc không an toàn.', 'photo_data');
        }
    }

    return {
        place_id,
        place_name,
        author_name,
        rating: parsedRating,
        comment_text,
        photo_url: photoData,
        photo_data: photoData,
        client_review_id,
    };
}

function getCooldownKey(placeId) {
    return `vivutravinh-comment-cooldown-${placeId}`;
}

export function assertCooldown(placeId) {
    const key = getCooldownKey(placeId);
    let lastSubmit = 0;
    try {
        if (typeof localStorage !== 'undefined') {
            lastSubmit = Number(localStorage.getItem(key) || 0);
        } else if (typeof window !== 'undefined' && window.localStorage) {
            lastSubmit = Number(window.localStorage.getItem(key) || 0);
        }
    } catch {}
    const remaining = COOLDOWN_MS - (Date.now() - lastSubmit);

    if (remaining > 0) {
        throw new CommentCooldownError(Math.ceil(remaining / 1000));
    }
    return true;
}

export function markCooldown(placeId) {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(getCooldownKey(placeId), Date.now().toString());
        } else if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(getCooldownKey(placeId), Date.now().toString());
        }
    } catch {}
}

export async function loadComments(placeId) {
    const cleanId = String(placeId || '').trim();
    if (!cleanId) return [];

    if (isMockMode()) {
        const all = getMockComments();
        const matched = all.filter(c => c.place_id === cleanId);
        matched.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return matched.slice(0, COMMENT_LIMIT);
    }

    const encodedPlaceId = encodeURIComponent(cleanId);
    return requestSupabase(`${TABLE_NAME}?place_id=eq.${encodedPlaceId}&is_hidden=eq.false&select=id,place_id,place_name,author_name,rating,comment_text,photo_url,photo_metadata,created_at&order=created_at.desc&limit=${COMMENT_LIMIT}`);
}

export async function submitComment(input) {
    const payload = validateCommentInput(input);
    if (!input.skipCooldown) {
        assertCooldown(payload.place_id);
    }

    if (isMockMode()) {
        const newComment = {
            id: 'mock_cmt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            place_id: payload.place_id,
            place_name: payload.place_name,
            author_name: payload.author_name,
            rating: payload.rating,
            comment_text: payload.comment_text,
            photo_url: payload.photo_url || null,
            photo_metadata: payload.photo_metadata || {},
            created_at: new Date().toISOString(),
            client_review_id: payload.client_review_id,
            status: 'approved',
        };
        saveMockComment(newComment);
        if (!input.skipCooldown) {
            markCooldown(payload.place_id);
        }
        return newComment;
    }

    // Gửi độc quyền qua serverless API endpoint (/api/submit-comment) có rate-limiting & kiểm duyệt
    const origin = (typeof window !== 'undefined' && window.location ? window.location.origin : '');
    const apiUrl = origin ? `${origin}/api/submit-comment` : '/api/submit-comment';
    let apiRes;
    try {
        apiRes = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                place_id: payload.place_id,
                place_name: payload.place_name,
                author_name: payload.author_name,
                rating: payload.rating,
                comment_text: payload.comment_text,
                client_review_id: payload.client_review_id,
                photo_url: payload.photo_url || null,
                photo_metadata: payload.photo_metadata || {},
            }),
        });
    } catch (networkErr) {
        // Lỗi mạng thực sự: ném lỗi để app.js lưu vào IndexedDB offline queue và đồng bộ có kiểm soát
        throw new SupabaseRequestError(networkErr.message || 'Không thể kết nối đến máy chủ gửi đánh giá.', 0);
    }

    if (apiRes.status === 429) {
        const errData = await apiRes.json().catch(() => ({}));
        const msg = errData?.error?.message || 'Bạn đang gửi bình luận quá nhanh. Vui lòng chờ trước khi thử lại.';
        const rateErr = new SupabaseRequestError(msg, 429, errData?.error);
        rateErr.isRateLimitError = true;
        throw rateErr;
    }

    if (apiRes.status === 413) {
        throw new SupabaseRequestError('Nội dung đánh giá vượt quá kích thước cho phép (tối đa 64KB).', 413);
    }

    if (!apiRes.ok) {
        const errData = await apiRes.json().catch(() => ({}));
        throw new SupabaseRequestError(
            errData?.error?.message || `Lỗi máy chủ (${apiRes.status})`,
            apiRes.status,
            errData?.error
        );
    }

    const result = await apiRes.json();
    if (!input.skipCooldown) {
        markCooldown(payload.place_id);
    }
    return result.data || result;
}

export function summarizeComments(comments, totalCount = null) {
    if (!Array.isArray(comments) || comments.length === 0) {
        return { average: 0, count: 0, loadedCount: 0, isPartial: false };
    }

    const total = comments.reduce((sum, comment) => sum + Number(comment.rating || 0), 0);
    const average = Math.round((total / comments.length) * 10) / 10;
    const count = typeof totalCount === 'number' && totalCount > comments.length ? totalCount : comments.length;
    const isPartial = typeof totalCount === 'number' && totalCount > comments.length;

    return {
        average,
        count,
        loadedCount: comments.length,
        isPartial,
    };
}
