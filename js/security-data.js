// js/security-data.js - Dữ liệu Trung tâm Cài đặt & Bảo mật Trà Vinh ID (Stitch Phase 8)

export const INITIAL_SECURITY_STATE = {
    healthScore: 75,
    healthLevel: 'Rất cao',
    protectionLayers: '3/4 lớp bảo vệ',
    lastUpdated: 'Hôm nay, 10:42',
    fido2Active: false,
    totpActive: true,
    smsBackupActive: true,
    smsPhone: '0918 ••• •89',
    secretKey: '7XKP 9N4M 2BVT 8HQZ 5WLC',
    backupCodesRemaining: 8,
    backupCodesTotal: 10,
    backupCodes: [
        { code: 'TRV-9821-X', used: false },
        { code: 'ECO-4412-B', used: false },
        { code: 'KHM-7782-A', used: true, usedDate: '15/08/2026' },
        { code: 'VVT-3301-C', used: false },
        { code: 'TRA-5599-D', used: false },
        { code: 'VNH-1029-E', used: false },
        { code: 'OKO-8823-F', used: false },
        { code: 'ANG-6617-G', used: true, usedDate: '02/09/2026' },
        { code: 'AOB-4402-H', used: false },
        { code: 'CKK-2219-K', used: false }
    ],
    devices: [
        {
            id: 'dev-iphone-current',
            name: 'iPhone 15 Pro Max',
            type: 'smartphone',
            isCurrent: true,
            status: 'Trực tuyến',
            location: 'Phường 1, TP. Trà Vinh, VN',
            appVersion: 'Safari 17.4 (iOS)',
            ipAddress: '113.161.42.12 (Viettel)',
            lastActive: 'Vừa xong (Thời gian thực)',
            authType: 'Xác thực Face ID chính chủ • Bảo mật cấp 3'
        },
        {
            id: 'dev-macbook-pro',
            name: 'MacBook Pro 14" (Apple M3)',
            type: 'laptop',
            isCurrent: false,
            status: 'Đã lưu',
            location: 'Quận 1, TP. Hồ Chí Minh',
            appVersion: 'Chrome 124.0 (macOS)',
            ipAddress: '14.169.88.*** (VNPT)',
            lastActive: '2 ngày trước',
            authType: 'Touch ID • Safari Keychain'
        },
        {
            id: 'dev-ipad-air',
            name: 'iPad Air 5',
            type: 'tablet',
            isCurrent: false,
            status: 'Đã lưu',
            location: 'Châu Thành, Trà Vinh',
            appVersion: 'Ứng dụng ViVuTraVinh v2.4.0',
            ipAddress: '113.161.50.*** (FPT Telecom)',
            lastActive: '5 ngày trước',
            authType: 'Passcode 6 số'
        }
    ],
    notifications: {
        pushEvents: true,
        pushClubs: true,
        pushBadges: true,
        pushWeather: true,
        pushVouchers: false,
        soundChime: 'khmer_chime',
        emailDigest: 'weekly'
    },
    privacy: {
        shareGpsLocation: true,
        anonymousInClubs: false,
        allowFriendFind: true,
        downloadHistory: true
    }
};

export const SECURITY_AUDIT_LOGS = [
    {
        id: 'log-1',
        title: 'Đăng nhập thành công',
        device: 'iPhone 15 Pro Max',
        location: 'TP. Trà Vinh',
        time: 'Hôm nay, 08:15',
        type: 'success'
    },
    {
        id: 'log-2',
        title: 'Xác thực 2 bước TOTP',
        device: 'Google Authenticator',
        location: 'TP. Trà Vinh',
        time: 'Hôm qua, 19:30',
        type: 'success'
    },
    {
        id: 'log-3',
        title: 'Cập nhật mật khẩu tài khoản',
        device: 'MacBook Pro 14"',
        location: 'TP. Hồ Chí Minh',
        time: '2 ngày trước',
        type: 'warning'
    },
    {
        id: 'log-4',
        title: 'Đăng nhập mới phát hiện',
        device: 'iPad Air 5',
        location: 'Châu Thành, Trà Vinh',
        time: '5 ngày trước',
        type: 'info'
    }
];
