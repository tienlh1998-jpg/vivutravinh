// scripts/audit-g9-pilot-production.js
// Kiểm toán Read-Only Dữ Liệu Production Cho Pilot G9.3C (ID 1 & ID 3)
// Nghiêm cấm mutation, chỉ cho phép phương thức đọc (GET / HEAD).

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const BACKUPS_DIR = path.join(ROOT_DIR, 'backups');

const DEFAULT_SUPABASE_URL = 'https://foyraoimhksfvlxndwxr.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZveXJhb2ltaGtzZnZseG5kd3hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjkwNzAsImV4cCI6MjA5NTMwNTA3MH0.ARJ173UkVNCichCiJmVrbp2aTByVoXnSEAIsIvbnYJ8';

export const PILOT_TARGET_IDS = Object.freeze([1, 3]);

/**
 * Tính toán mã băm SHA-256 xác định (deterministic) từ đối tượng JSON
 */
export function computeRecordChecksum(record) {
  if (!record || typeof record !== 'object') return '';
  const sortedKeys = Object.keys(record).sort();
  const sortedObj = {};
  for (const k of sortedKeys) {
    sortedObj[k] = record[k];
  }
  return crypto.createHash('sha256').update(JSON.stringify(sortedObj)).digest('hex');
}

/**
 * Hàm gọi mạng an toàn - Chặn đứng mọi thao tác ghi/mutation
 */
export async function auditFetch(url, options = {}, fetchFn = globalThis.fetch) {
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    throw new Error(`MUTATION_FORBIDDEN: Phương thức ${method} bị chặn. Công cụ audit hoàn toàn read-only.`);
  }
  return fetchFn(url, options);
}

/**
 * Lấy dữ liệu ID 1 và 3 từ CSDL live hoặc snapshot dự phòng đã xác minh
 */
export async function loadPilotProductionRecords(options = {}) {
  const env = options.env || process.env;
  const fetchFn = options.fetchFn || globalThis.fetch;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || options.serviceKey || '';
  const adminToken = env.ADMIN_ACCESS_TOKEN || options.adminToken || '';
  const supabaseUrl = env.SUPABASE_URL || options.supabaseUrl || DEFAULT_SUPABASE_URL;

  let source = 'unknown';
  let places = [];
  let comments = [];
  let reports = [];
  let auditLogs = [];

  if (options.mockData) {
    source = 'mock_data';
    places = options.mockData.places || [];
    comments = options.mockData.comments || [];
    reports = options.mockData.reports || [];
    auditLogs = options.mockData.auditLogs || [];
  } else {
    // Không cho phép fallback ngầm sang snapshot cũ khi chạy production audit/plan
    if (!serviceKey && !adminToken) {
      throw new Error(
        'FAIL_CLOSED: Thiếu biến môi trường SUPABASE_SERVICE_ROLE_KEY hoặc ADMIN_ACCESS_TOKEN. ' +
        'Theo quy tắc G9.3C, không được tự ý fallback sang snapshot cũ. ' +
        'Vui lòng cấu hình credentials để truy vấn trực tiếp CSDL Supabase production.'
      );
    }

    source = 'live_supabase';
    const headers = {
      apikey: serviceKey || DEFAULT_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${serviceKey || adminToken}`,
      'Content-Type': 'application/json'
    };

    let pRes, cRes, rRes, aRes;
    try {
      [pRes, cRes, rRes, aRes] = await Promise.all([
        auditFetch(`${supabaseUrl}/rest/v1/places?id=in.(1,3)&select=*&order=id.asc`, { headers }, fetchFn),
        auditFetch(`${supabaseUrl}/rest/v1/place_comments?place_id=in.(ao-ba-om,chua-ang)&select=*&order=id.asc`, { headers }, fetchFn).catch(() => ({ ok: false })),
        auditFetch(`${supabaseUrl}/rest/v1/place_reports?place_id=in.(1,3)&select=*&order=id.asc`, { headers }, fetchFn).catch(() => ({ ok: false })),
        auditFetch(`${supabaseUrl}/rest/v1/admin_audit_logs?entity_id=in.(1,3)&select=*&order=created_at.desc`, { headers }, fetchFn).catch(() => ({ ok: false }))
      ]);
    } catch (networkErr) {
      throw new Error(`FAIL_CLOSED: Kết nối Supabase production thất bại (${networkErr.message}). Không fallback sang snapshot cũ.`);
    }

    if (!pRes.ok) {
      const errText = await pRes.text().catch(() => '');
      throw new Error(`FAIL_CLOSED: Truy vấn Supabase production trả mã lỗi HTTP ${pRes.status} (${errText}). Không fallback sang snapshot cũ.`);
    }

    places = await pRes.json();
    if (cRes && cRes.ok) comments = await cRes.json();
    if (rRes && rRes.ok) reports = await rRes.json();
    if (aRes && aRes.ok) auditLogs = await aRes.json();

    if (!Array.isArray(places) || places.length < PILOT_TARGET_IDS.length) {
      throw new Error(
        `FAIL_CLOSED: Truy vấn trực tiếp live_supabase chỉ tìm thấy ${Array.isArray(places) ? places.length : 0}/${PILOT_TARGET_IDS.length} mục tiêu [${PILOT_TARGET_IDS.join(', ')}]. ` +
        'Có thể do token không đủ quyền đọc bản ghi hidden hoặc ID không tồn tại. Không fallback sang snapshot cũ.'
      );
    }
  }

  // Sắp xếp thứ tự ID
  places.sort((a, b) => a.id - b.id);

  return {
    source,
    places,
    comments,
    reports,
    auditLogs
  };
}

/**
 * Thực thi kiểm toán pilot production
 */
export async function runPilotAudit(options = {}) {
  const args = options.args || process.argv.slice(2);
  const isReadOnly = args.includes('--read-only') || options.readOnly;
  const isMutationAttempt = args.some(a => ['--mutation', '--execute', '--write', '--apply'].includes(a));

  if (isMutationAttempt) {
    throw new Error('MUTATION_FORBIDDEN: Script audit:g9:pilot-production chỉ thực hiện read-only.');
  }

  console.log('\n=== KIỂM TOÁN READ-ONLY DỮ LIỆU PRODUCTION PILOT G9.3C (ID 1 & ID 3) ===\n');

  const { source, places, comments, reports, auditLogs } = await loadPilotProductionRecords(options);

  console.log(`Nguồn dữ liệu kiểm toán : ${source}`);
  console.log(`Số bản ghi places tìm thấy : ${places.length}/2 mục tiêu\n`);

  const auditReport = {
    timestamp: new Date().toISOString(),
    source,
    is_read_only: isReadOnly,
    records: []
  };

  for (const targetId of PILOT_TARGET_IDS) {
    const record = places.find(p => p.id === targetId);
    if (!record) {
      console.error(`❌ Target ID ${targetId}: KHÔNG TÌM THẤY`);
      auditReport.records.push({ id: targetId, found: false });
      continue;
    }

    const checksum = computeRecordChecksum(record);
    const relatedComments = comments.filter(c => c.place_id === record.slug);
    const relatedReports = reports.filter(r => r.place_id === record.id || r.place_id === record.slug);
    const relatedLogs = auditLogs.filter(l => l.entity_id === String(record.id) || l.entity_id === record.slug);

    console.log(`--- [ID ${record.id}] ${record.name} (${record.slug}) ---`);
    console.log(`  • Trạng thái hiện tại : ${record.status} (operating: ${record.operating_status || 'Normal'})`);
    console.log(`  • Địa chỉ hiện tại    : ${record.address}`);
    console.log(`  • Tọa độ GPS          : ${record.coordinates}`);
    console.log(`  • Giờ hoạt động       : ${record.opening_time || 'null'} - ${record.closing_time || 'null'} (display: ${record.display_hours || 'null'})`);
    console.log(`  • Giá niêm yết        : ${record.price_raw || 'null'}`);
    console.log(`  • Liên hệ             : ${record.contact || 'null'}`);
    console.log(`  • Hình ảnh            : ${(record.images || []).join(', ') || record.image_link}`);
    console.log(`  • Comments liên quan  : ${relatedComments.length} bình luận`);
    console.log(`  • Reports liên quan   : ${relatedReports.length} phản ánh`);
    console.log(`  • Checksum SHA-256    : ${checksum}\n`);

    auditReport.records.push({
      id: record.id,
      name: record.name,
      slug: record.slug,
      status: record.status,
      operating_status: record.operating_status,
      address: record.address,
      coordinates: record.coordinates,
      opening_time: record.opening_time,
      closing_time: record.closing_time,
      price_raw: record.price_raw,
      contact: record.contact,
      checksum,
      comments_count: relatedComments.length,
      reports_count: relatedReports.length,
      audit_logs_count: relatedLogs.length,
      raw_record: record
    });
  }

  const allFound = auditReport.records.every(r => r.found !== false);
  console.log('========================================');
  console.log(`KẾT QUẢ KIỂM TOÁN PILOT: ${allFound ? '2/2 MỤC TIÊU SẴN SÀNG' : 'THIẾU MỤC TIÊU'}`);
  console.log('========================================\n');

  return auditReport;
}

// Chạy trực tiếp qua CLI
if (process.argv[1] && process.argv[1].endsWith('audit-g9-pilot-production.js')) {
  runPilotAudit()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('\n❌ LỖI TRONG QUÁ TRÌNH KIỂM TOÁN:', err.message);
      process.exit(1);
    });
}
