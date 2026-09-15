// ViVuTraVinh - App configuration
// Không commit API key thật lên repository public. Hãy inject bằng window.VIVUTRAVINH_CONFIG trước khi import module.

export const SHEET_ID = '1xywS77u_udvGzsZyeV2tiKBReaWAXkdu4EQP41Q3yCI';
export const API_KEY = '';
export const SHEET_NAME = 'Bang1';
export const RANGE = 'A:Z';
export const SUPABASE_URL = 'https://foyraoimhksfvlxndwxr.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZveXJhb2ltaGtzZnZseG5kd3hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjkwNzAsImV4cCI6MjA5NTMwNTA3MH0.ARJ173UkVNCichCiJmVrbp2aTByVoXnSEAIsIvbnYJ8';
export const FACEBOOK_FANPAGE_URL = 'https://www.facebook.com/vivutravinh.official';

// Nguồn dữ liệu mặc định: 'mock' (phát triển local không gọi Supabase), 'supabase' (kết nối backend), 'fallback' (bản snapshot phát hành)
export const DEFAULT_DATA_SOURCE = 'mock';

function safeGetStorage(key) {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage.getItem(key);
        }
    } catch (e) {
        // Storage access might be denied in some environments
    }
    return null;
}

function safeSetStorage(key, value) {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            if (value === null || value === undefined) {
                window.localStorage.removeItem(key);
            } else {
                window.localStorage.setItem(key, String(value));
            }
        }
    } catch (e) {
        // Ignore storage write errors
    }
}

function getUrlParams() {
    try {
        if (typeof window !== 'undefined' && window.location && window.location.search) {
            return new URLSearchParams(window.location.search);
        }
    } catch (e) {
        // Ignore URL parsing errors
    }
    return null;
}

export function initConfig(overrides = {}) {
    const runtimeConfig = (typeof window !== 'undefined' && window.VIVUTRAVINH_CONFIG) || {};
    const urlParams = getUrlParams();

    // Xác định nguồn dữ liệu theo thứ tự ưu tiên:
    // 1. URL parameter ?source=mock|supabase|fallback
    // 2. overrides.dataSource truyền vào initConfig
    // 3. window.VIVUTRAVINH_CONFIG.dataSource
    // 4. localStorage 'vivu_data_source'
    // 5. DEFAULT_DATA_SOURCE ('mock')
    const rawSource = (urlParams?.get('source') || overrides.dataSource || runtimeConfig.dataSource || safeGetStorage('vivu_data_source') || DEFAULT_DATA_SOURCE).toLowerCase().trim();
    const dataSource = ['mock', 'supabase', 'fallback'].includes(rawSource) ? rawSource : DEFAULT_DATA_SOURCE;

    // Các cờ mô phỏng (Simulation Flags) tại tầng dữ liệu:
    // Tải chậm (delay in ms)
    const simDelay = Number(urlParams?.get('simDelay') || urlParams?.get('delay') || overrides.simDelay || runtimeConfig.simDelay || safeGetStorage('vivu_sim_delay')) || 0;
    // Mô phỏng lỗi tải
    const simError = Boolean(urlParams?.get('simError') === '1' || urlParams?.get('simError') === 'true' || overrides.simError || runtimeConfig.simError || safeGetStorage('vivu_sim_error') === 'true');
    // Mô phỏng danh sách rỗng
    const simEmpty = Boolean(urlParams?.get('simEmpty') === '1' || urlParams?.get('simEmpty') === 'true' || overrides.simEmpty || runtimeConfig.simEmpty || safeGetStorage('vivu_sim_empty') === 'true');

    return {
        dataSource,
        simDelay,
        simError,
        simEmpty,
        sheetId: overrides.sheetId || runtimeConfig.sheetId || SHEET_ID,
        apiKey: overrides.apiKey || runtimeConfig.apiKey || API_KEY,
        sheetName: overrides.sheetName || runtimeConfig.sheetName || SHEET_NAME,
        range: overrides.range || runtimeConfig.range || RANGE,
        supabaseUrl: overrides.supabaseUrl || runtimeConfig.supabaseUrl || SUPABASE_URL,
        supabaseAnonKey: overrides.supabaseAnonKey || runtimeConfig.supabaseAnonKey || SUPABASE_ANON_KEY,
        facebookFanpageUrl: overrides.facebookFanpageUrl || runtimeConfig.facebookFanpageUrl || FACEBOOK_FANPAGE_URL,
    };
}

export function setDataSourceConfig(source) {
    if (['mock', 'supabase', 'fallback'].includes(source)) {
        safeSetStorage('vivu_data_source', source);
    }
}

export function setSimulationConfig({ delay, error, empty } = {}) {
    if (delay !== undefined) safeSetStorage('vivu_sim_delay', delay);
    if (error !== undefined) safeSetStorage('vivu_sim_error', error ? 'true' : 'false');
    if (empty !== undefined) safeSetStorage('vivu_sim_empty', empty ? 'true' : 'false');
}

export function resetSimulationConfig() {
    safeSetStorage('vivu_sim_delay', null);
    safeSetStorage('vivu_sim_error', null);
    safeSetStorage('vivu_sim_empty', null);
}

export function assertSupabaseConfig(config) {
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
        throw new Error('Thiếu cấu hình Supabase.');
    }
}

export function assertGoogleSheetsConfig(config) {
    if (!config.sheetId) {
        throw new Error('Thiếu SHEET_ID cho Google Sheets API.');
    }

    if (!config.apiKey) {
        throw new Error('Thiếu API_KEY cho Google Sheets API. Hãy cấu hình qua window.VIVUTRAVINH_CONFIG hoặc truyền vào initConfig().');
    }

    if (!config.sheetName) {
        throw new Error('Thiếu Sheet Name cho Google Sheets API.');
    }

    if (!config.range) {
        throw new Error('Thiếu Range cho Google Sheets API.');
    }
}
