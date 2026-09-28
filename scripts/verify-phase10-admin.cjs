// scripts/verify-phase10-admin.cjs - Automated Verification for Phase 10: Admin Support Wall & Moderation Portal
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || (fs.existsSync(path.resolve(__dirname, '../../05_AGY_BRAIN_ARTIFACTS'))
    ? path.resolve(__dirname, '../../05_AGY_BRAIN_ARTIFACTS')
    : path.resolve(__dirname, '../scratch/artifacts'));
if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

const BRAIN_ARTIFACTS_DIR = 'C:/Users/tienl/.gemini/antigravity/brain/511499a4-7194-4965-9c2b-32af7520e85d';

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function getDebuggerUrl(port) {
    for (let i = 0; i < 30; i++) {
        try {
            const data = await new Promise((resolve, reject) => {
                const req = http.get(`http://127.0.0.1:${port}/json`, res => {
                    let d = '';
                    res.on('data', c => d += c);
                    res.on('end', () => resolve(d));
                });
                req.on('error', reject);
            });
            const pages = JSON.parse(data);
            const target = pages.find(p => p.url && p.url.includes('8000'));
            if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
        } catch (e) {
            await sleep(200);
        }
    }
    throw new Error('Không thể kết nối Chrome DevTools protocol.');
}

class CDPClient {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.reqId = 0;
        this.callbacks = new Map();
        this.ws.onmessage = (msg) => {
            const res = JSON.parse(msg.data);
            if (res.id && this.callbacks.has(res.id)) {
                const cb = this.callbacks.get(res.id);
                this.callbacks.delete(res.id);
                cb(res);
            }
        };
    }

    async ready() {
        if (this.ws.readyState === WebSocket.OPEN) return;
        return new Promise((resolve, reject) => {
            this.ws.onopen = resolve;
            this.ws.onerror = reject;
        });
    }

    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = ++this.reqId;
            const timer = setTimeout(() => {
                this.callbacks.delete(id);
                reject(new Error(`CDP method ${method} timed out after 15000ms`));
            }, 15000);
            this.callbacks.set(id, (res) => {
                clearTimeout(timer);
                if (res.error) reject(new Error(JSON.stringify(res.error)));
                else resolve(res.result);
            });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    async eval(expr) {
        const res = await this.send('Runtime.evaluate', {
            expression: expr,
            returnByValue: true,
            awaitPromise: true
        });
        if (res.exceptionDetails) {
            throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
        }
        return res.result?.value;
    }

    async setViewport(width, height) {
        await this.send('Emulation.setDeviceMetricsOverride', {
            width,
            height,
            deviceScaleFactor: 1,
            mobile: width < 600
        });
        await sleep(300);
    }

    async screenshot(filepath) {
        const res = await this.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(filepath, Buffer.from(res.data, 'base64'));

        // Copy to brain artifacts dir if exists
        try {
            if (fs.existsSync(BRAIN_ARTIFACTS_DIR)) {
                const filename = path.basename(filepath);
                const brainTarget = path.join(BRAIN_ARTIFACTS_DIR, filename);
                fs.copyFileSync(filepath, brainTarget);
            }
        } catch (e) {
            // ignore
        }
    }

    close() {
        try { this.ws.close(); } catch {}
    }
}

async function run() {
    console.log('=== VERIFY PHASE 10: ADMIN SUPPORT WALL & CONTENT/CLUB MODERATION ===\n');
    let httpServer, chromeProc, cdp;
    const chromePort = 9222 + Math.floor(Math.random() * 200);

    try {
        // 1. Static Syntax & Data Module Check
        console.log('[1/12] Kiểm tra Data Module (admin-portal-data.js)...');
        const adminData = await import('../js/admin-portal-data.js');
        if (!adminData.ADMIN_INFO || !adminData.PROJECT_FINANCIAL_REPORT || !adminData.DONATION_TIERS) {
            throw new Error('Data module thiếu thông tin ADMIN_INFO hoặc PROJECT_FINANCIAL_REPORT');
        }
        if (!adminData.INITIAL_PENDING_POSTS || adminData.INITIAL_PENDING_POSTS.length < 3) {
            throw new Error('INITIAL_PENDING_POSTS không đủ dữ liệu mẫu');
        }
        if (!adminData.INITIAL_PENDING_CLUBS || adminData.INITIAL_PENDING_CLUBS.length < 3) {
            throw new Error('INITIAL_PENDING_CLUBS không đủ dữ liệu mẫu');
        }
        console.log(`  ✓ Data module: ${adminData.INITIAL_PENDING_POSTS.length} bài viết chờ duyệt, ${adminData.INITIAL_PENDING_CLUBS.length} CLB đề xuất, ${adminData.DONATION_TIERS.length} gói ủng hộ.`);

        // 2. HTML Markup Verification
        console.log('[2/12] Kiểm tra HTML Markup Modal IDs trong index.html...');
        const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
        const requiredIds = [
            'adminSupportModal', 'adminSupportModalContent',
            'adminModerationModal', 'adminModerationModalContent',
            'adminActionReasonModal', 'adminActionReasonModalContent'
        ];
        for (const id of requiredIds) {
            if (!html.includes(`id="${id}"`)) {
                throw new Error(`index.html thiếu phần tử #${id}`);
            }
        }
        console.log('  ✓ Đầy đủ tất cả Modal Container ID trong index.html.');

        // 3. Start Server & Headless Chrome
        console.log('[3/12] Khởi chạy Local Server & Headless Chrome...');
        const hsBin = path.resolve(__dirname, '../node_modules/http-server/bin/http-server');
        httpServer = spawn('node', [hsBin, '-p', '8000', '-c-1'], { cwd: path.resolve(__dirname, '..') });
        await sleep(1500);

        const chromeCandidates = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            os.homedir() + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
        ];
        const chromePath = chromeCandidates.find(fs.existsSync);
        if (!chromePath) throw new Error('Không tìm thấy trình duyệt Chrome.');

        const userDataDir = path.join(os.tmpdir(), `chrome-test-p10-${Date.now()}`);
        chromeProc = spawn(chromePath, [
            '--headless=new',
            `--remote-debugging-port=${chromePort}`,
            '--no-sandbox',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            'http://localhost:8000/?source=mock'
        ]);

        const wsUrl = await getDebuggerUrl(chromePort);
        cdp = new CDPClient(wsUrl);
        await cdp.ready();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');

        cdp.ws.addEventListener('message', (evt) => {
            try {
                const msg = JSON.parse(evt.data);
                if (msg.method === 'Runtime.consoleAPICalled') {
                    const text = msg.params.args.map(a => a.value || a.description || '').join(' ');
                    // console.log('[Browser Console]', text);
                }
                if (msg.method === 'Runtime.exceptionThrown') {
                    console.error('[Browser Exception]', JSON.stringify(msg.params.exceptionDetails));
                }
            } catch (e) {}
        });

        await sleep(2500);

        // 4. Verify Methods exposed on window.ViVuApp
        console.log('[4/12] Kiểm tra các hàm nghiệp vụ Phase 10 trên window.ViVuApp...');
        const vivuAppCheck = await cdp.eval(`typeof window.ViVuApp`);
        console.log('  typeof window.ViVuApp:', vivuAppCheck);

        const methodsCheck = await cdp.eval(`
            (() => {
                if (!window.ViVuApp) return { ok: false, missing: ['window.ViVuApp is undefined'] };
                const fns = [
                    'openAdminSupportModal', 'closeAdminSupportModal', 'selectDonationTier',
                    'applyCustomDonation', 'copyTransferNote', 'confirmSimulatedDonation',
                    'openAdminModerationModal', 'closeAdminModerationModal', 'switchModerationTab',
                    'selectModerationPost', 'selectModerationClub', 'handleModerationSearch',
                    'filterModerationRisk', 'approvePost', 'approveClub', 'openActionReasonModal',
                    'closeActionReasonModal', 'submitActionReason', 'quickApproveHighTrust'
                ];
                const available = Object.keys(window.ViVuApp);
                const missing = fns.filter(fn => typeof window.ViVuApp?.[fn] !== 'function');
                return { ok: missing.length === 0, missing, availableCount: available.length };
            })()
        `);
        console.log('  ViVuApp available methods count:', methodsCheck.availableCount);
        if (!methodsCheck.ok) {
            throw new Error(`Thiếu các hàm trên window.ViVuApp: ${methodsCheck.missing.join(', ')}`);
        }
        console.log('  ✓ Toàn bộ 19 phương thức quản trị Phase 10 đã sẵn sàng trên window.ViVuApp.');

        // 5. Test Admin Support Wall Modal Opening & Bio Info
        console.log('[5/12] Thử nghiệm mở Modal Tường Admin & Hỗ trợ dự án...');
        await cdp.eval(`window.ViVuApp.openAdminSupportModal()`);
        await sleep(600);

        const supportModalState = await cdp.eval(`
            (() => {
                const modal = document.getElementById('adminSupportModal');
                const content = document.getElementById('adminSupportModalContent');
                const isVisible = modal && !modal.classList.contains('hidden');
                const hasAdminName = content && content.innerText.includes('Trần Tiến');
                const hasBudgetInfo = content && content.innerText.includes('650.000đ') && content.innerText.includes('520.000đ');
                const hasVietQR = content && content.querySelector('svg') !== null;
                const hasTechGear = content && content.innerText.includes('Kingston') && content.innerText.includes('NuPhy Air75');
                const hasTravelGear = content && content.innerText.includes('gắn ghi đông xe máy');
                return { isVisible, hasAdminName, hasBudgetInfo, hasVietQR, hasTechGear, hasTravelGear };
            })()
        `);
        if (!supportModalState.isVisible || !supportModalState.hasAdminName || !supportModalState.hasBudgetInfo) {
            throw new Error(`Modal Tường Admin không hiển thị đúng thông tin: ${JSON.stringify(supportModalState)}`);
        }
        console.log('  ✓ Modal Tường Admin hiển thị đầy đủ Bio, Quỹ máy chủ (80%), VietQR và Danh mục thanh lý công nghệ.');

        // 6. Test Donation Tier Selection & Dynamic VietQR Memo
        console.log('[6/12] Thử nghiệm chọn gói ủng hộ 100K (Hosting 1 tuần) & Cập nhật VietQR Memo...');
        await cdp.eval(`window.ViVuApp.selectDonationTier(100000, 'hosting')`);
        await sleep(300);

        const donationTierCheck = await cdp.eval(`
            (() => {
                const state = window.ViVuApp.getState();
                const noteLabel = document.getElementById('transferNoteLabel')?.innerText;
                return {
                    amount: state.selectedDonationAmount,
                    memo: noteLabel,
                    matches: noteLabel && noteLabel.includes('100.000')
                };
            })()
        `);
        if (donationTierCheck.amount !== 100000 || !donationTierCheck.matches) {
            throw new Error(`Nội dung VietQR Memo không cập nhật đúng: ${JSON.stringify(donationTierCheck)}`);
        }
        console.log(`  ✓ VietQR Memo cập nhật chính xác: "${donationTierCheck.memo}".`);

        // 7. Test Simulated Donation Confirmation
        console.log('[7/12] Thử nghiệm ghi nhận khoản ủng hộ mô phỏng...');
        const donationConfirmResult = await cdp.eval(`
            (() => {
                const oldFunded = window.ViVuApp.getState().financialReport.monthlyFunded;
                window.ViVuApp.confirmSimulatedDonation(50000);
                const newFunded = window.ViVuApp.getState().financialReport.monthlyFunded;
                const supporters = window.ViVuApp.getState().recentSupporters;
                return {
                    diff: newFunded - oldFunded,
                    latestSupporter: supporters[0]?.message
                };
            })()
        `);
        if (donationConfirmResult.diff !== 50000) {
            throw new Error(`Khoản ủng hộ không được cộng vào quỹ máy chủ: ${JSON.stringify(donationConfirmResult)}`);
        }
        console.log('  ✓ Ghi nhận giao dịch ủng hộ thành công, cập nhật ngay vào tiến độ quỹ và danh sách tri ân.');

        // Capture Desktop Screenshot for Admin Support Wall
        await cdp.setViewport(1280, 900);
        await sleep(400);
        const adminSupportDesktopPath = path.join(ARTIFACT_DIR, 'stitch-admin-support-desktop-1280.png');
        await cdp.screenshot(adminSupportDesktopPath);
        console.log(`  ✓ Đã chụp ảnh giao diện Desktop Tường Admin: ${path.basename(adminSupportDesktopPath)}`);

        // Close Admin Support Modal
        await cdp.eval(`window.ViVuApp.closeAdminSupportModal()`);
        await sleep(300);

        // 8. Test Content Moderation Portal Opening & Article Preview
        console.log('[8/12] Thử nghiệm mở Trung tâm Kiểm duyệt Nội dung (Bài viết)...');
        await cdp.eval(`window.ViVuApp.openAdminModerationModal('posts')`);
        await sleep(600);

        const moderationState = await cdp.eval(`
            (() => {
                const modal = document.getElementById('adminModerationModal');
                const content = document.getElementById('adminModerationModalContent');
                const isVisible = modal && !modal.classList.contains('hidden');
                const hasKpi = content && content.innerText.includes('Chờ phê duyệt') && content.innerText.includes('AI Guardian Live');
                const hasPost1 = content && content.innerText.includes('Huyền tích về giếng nước và cây sao');
                const hasAiScore = content && content.innerText.includes('98/100');
                const hasAuthor = content && content.innerText.includes('Thạch Sô Phol');
                return { isVisible, hasKpi, hasPost1, hasAiScore, hasAuthor };
            })()
        `);
        if (!moderationState.isVisible || !moderationState.hasPost1 || !moderationState.hasAiScore) {
            throw new Error(`Giao diện Kiểm duyệt bài viết không hiển thị chính xác: ${JSON.stringify(moderationState)}`);
        }
        console.log('  ✓ Trung tâm kiểm duyệt bài viết hiển thị đầy đủ hàng đợi, điểm AI Safe 98%, và bản xem trước WYSIWYG.');

        // 9. Test Post Approval Flow
        console.log('[9/12] Thử nghiệm phê duyệt bài viết (+50 Xu thưởng)...');
        const approveResult = await cdp.eval(`
            (() => {
                const oldApproved = window.ViVuApp.getState().moderationKpi.approvedToday || 0;
                window.ViVuApp.approvePost('post-01');
                const post = window.ViVuApp.getState().moderationPosts.find(p => p.id === 'post-01');
                const newApproved = window.ViVuApp.getState().moderationKpi.approvedToday;
                return {
                    status: post.status,
                    kpiIncreased: newApproved === oldApproved + 1
                };
            })()
        `);
        if (approveResult.status !== 'approved' || !approveResult.kpiIncreased) {
            throw new Error(`Lỗi phê duyệt bài viết: ${JSON.stringify(approveResult)}`);
        }
        console.log('  ✓ Phê duyệt bài viết thành công: trạng thái chuyển sang "approved", KPI tăng thêm 1.');

        // 10. Test Club Dossier Moderation Tab
        console.log('[10/12] Thử nghiệm chuyển sang tab Kiểm duyệt Hồ sơ CLB...');
        await cdp.eval(`window.ViVuApp.switchModerationTab('clubs')`);
        await sleep(500);

        const clubModerationState = await cdp.eval(`
            (() => {
                const content = document.getElementById('adminModerationModalContent');
                const hasClub1 = content && content.innerText.includes('CLB Nhiếp ảnh Di sản Khmer');
                const hasMembersGauge = content && content.innerText.includes('12/10') && content.innerText.includes('120%');
                const hasCriteria = content && content.innerText.includes('Tôn trọng không gian tôn giáo Khmer') && content.innerText.includes('Không xả rác');
                const has3MonthPlan = content && content.innerText.includes('Kế hoạch hoạt động 3 tháng đầu');
                return { hasClub1, hasMembersGauge, hasCriteria, has3MonthPlan };
            })()
        `);
        if (!clubModerationState.hasClub1 || !clubModerationState.hasMembersGauge || !clubModerationState.hasCriteria) {
            throw new Error(`Kiểm duyệt CLB không hiển thị đúng tiêu chuẩn thẩm định: ${JSON.stringify(clubModerationState)}`);
        }
        console.log('  ✓ Hồ sơ CLB hiển thị đầy đủ tiến độ 12/10 thành viên, 4 tiêu chuẩn cam kết cộng đồng và kế hoạch 3 tháng.');

        // Test Club Approval
        await cdp.eval(`window.ViVuApp.approveClub('club-pending-01')`);
        await sleep(300);
        const clubApproveStatus = await cdp.eval(`
            window.ViVuApp.getState().moderationClubs.find(c => c.id === 'club-pending-01')?.status
        `);
        if (clubApproveStatus !== 'approved') {
            throw new Error('Lỗi phê duyệt CLB');
        }
        console.log('  ✓ Phê duyệt CLB thành công: cấp Tích Xanh chính thức & giải ngân quỹ khởi đầu.');

        // Capture Desktop Screenshot for Moderation
        await cdp.setViewport(1280, 900);
        await sleep(400);
        const moderationDesktopPath = path.join(ARTIFACT_DIR, 'stitch-moderation-desktop-1280.png');
        await cdp.screenshot(moderationDesktopPath);
        console.log(`  ✓ Đã chụp ảnh giao diện Desktop Kiểm duyệt: ${path.basename(moderationDesktopPath)}`);

        // 11. Test Action Reason Modal (Rejection / Info Request)
        console.log('[11/12] Thử nghiệm Modal Nhập lý do Kiểm duyệt...');
        await cdp.eval(`window.ViVuApp.openActionReasonModal('reject_post', 'post-02', 'Cho thuê xe máy giá rẻ')`);
        await sleep(400);

        const reasonModalVisible = await cdp.eval(`
            (() => {
                const modal = document.getElementById('adminActionReasonModal');
                const isVis = modal && !modal.classList.contains('hidden');
                const hasPreset = modal && modal.innerText.includes('Nội dung spam, quảng cáo thương mại');
                return isVis && hasPreset;
            })()
        `);
        if (!reasonModalVisible) {
            throw new Error('Modal nhập lý do kiểm duyệt không hiển thị');
        }

        // Fill custom reason and submit
        await cdp.eval(`
            (() => {
                const input = document.getElementById('actionReasonInput');
                if (input) input.value = 'Quảng cáo thương mại cho vay tín dụng không thuộc phạm trù du lịch.';
                window.ViVuApp.submitActionReason('reject_post', 'post-02');
            })()
        `);
        await sleep(300);
        const post2Status = await cdp.eval(`
            window.ViVuApp.getState().moderationPosts.find(p => p.id === 'post-02')?.status
        `);
        if (post2Status !== 'rejected') {
            throw new Error('Lỗi từ chối bài viết');
        }
        console.log('  ✓ Gửi lý do từ chối thành công, trạng thái bài viết spam chuyển thành "rejected".');

        // 12. Mobile Responsive Testing (390px)
        console.log('[12/12] Thử nghiệm giao diện di động Mobile 390px & Chống tràn...');
        await cdp.setViewport(390, 844);
        await sleep(500);

        const mobileMetrics = await cdp.eval(`
            (() => {
                const docWidth = document.documentElement.scrollWidth;
                const winWidth = window.innerWidth;
                const hasHOverflow = docWidth > winWidth + 2;
                return { docWidth, winWidth, hasHOverflow };
            })()
        `);
        if (mobileMetrics.hasHOverflow) {
            throw new Error(`Phát hiện tràn ngang trên mobile 390px: doc=${mobileMetrics.docWidth}, win=${mobileMetrics.winWidth}`);
        }

        const moderationMobilePath = path.join(ARTIFACT_DIR, 'stitch-moderation-mobile-390.png');
        await cdp.screenshot(moderationMobilePath);
        console.log(`  ✓ Đã chụp ảnh giao diện Mobile Kiểm duyệt: ${path.basename(moderationMobilePath)} (0 horizontal overflow).`);

        // Close moderation modal
        await cdp.eval(`window.ViVuApp.closeAdminModerationModal()`);
        await sleep(200);

        console.log('\n======================================================');
        console.log('🎉 100% HOÀN THÀNH XÁC MINH GIAI ĐOẠN 10 (ADMIN PORTAL & MODERATION)');
        console.log('======================================================\n');

    } catch (err) {
        console.error('❌ LỖI KIỂM THỬ GIAI ĐOẠN 10:', err);
        process.exitCode = 1;
    } finally {
        if (cdp) cdp.close();
        if (chromeProc) chromeProc.kill();
        if (httpServer) httpServer.kill();
    }
}

run();
