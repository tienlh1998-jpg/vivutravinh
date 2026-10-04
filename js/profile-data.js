// js/profile-data.js - User Profile, Achievements, Badges & Saved Collections Data for ViVuTraVinh
// Strictly zero-CDN, local-first with responsive dark mode support

export const OFFICIAL_BADGES = [
    {
        id: 'buoc-chan-dau-tien',
        name: 'Bước chân đầu tiên',
        title: 'Bước chân đầu tiên',
        icon: 'hiking',
        tier: 'Khởi đầu',
        category: 'milestone',
        color: 'emerald',
        desc: 'Có đóng góp đầu tiên được phê duyệt trên hệ thống ViVu Trà Vinh.',
        condition: 'Có 1 đóng góp được duyệt (Cộng đồng, Blog hoặc Địa điểm)',
        target: 1,
        type: 'any'
    },
    {
        id: 'nguoi-ke-chuyen-xu-tra',
        name: 'Người kể chuyện Xứ Trà',
        title: 'Người kể chuyện Xứ Trà',
        icon: 'auto_stories',
        tier: 'Vàng',
        category: 'article',
        color: 'amber',
        desc: 'Tác giả của 5 bài cẩm nang du lịch và ký sự Trà Vinh xuất sắc được duyệt.',
        condition: 'Có 5 bài Blog ViVu được phê duyệt',
        target: 5,
        type: 'article'
    },
    {
        id: 'ban-dong-hanh-vivu',
        name: 'Bạn đồng hành ViVu',
        title: 'Bạn đồng hành ViVu',
        icon: 'groups',
        tier: 'Bạc',
        category: 'community',
        color: 'slate',
        desc: 'Tích cực chia sẻ 10 bài viết hữu ích và kết nối cộng đồng khám phá.',
        condition: 'Có 10 bài viết Cộng đồng được phê duyệt',
        target: 10,
        type: 'community_post'
    },
    {
        id: 'nguoi-kham-pha-xu-tra',
        name: 'Người khám phá Xứ Trà',
        title: 'Người khám phá Xứ Trà',
        icon: 'explore',
        tier: 'Bạch kim',
        category: 'place',
        color: 'cyan',
        desc: 'Đóng góp 5 địa điểm du lịch, ẩm thực hoặc di sản mới được đưa lên bản đồ.',
        condition: 'Có 5 đóng góp địa điểm được phê duyệt',
        target: 5,
        type: 'place'
    }
];

export function computeUserBadges(ugcCounts = {}, unlockedBadges = []) {
    const approvedPosts = Number(ugcCounts.approvedPosts || 0);
    const approvedArticles = Number(ugcCounts.approvedArticles || 0);
    const approvedPlaces = Number(ugcCounts.approvedPlaces || 0);
    const totalApproved = approvedPosts + approvedArticles + approvedPlaces;

    const unlockedMap = new Map();
    if (Array.isArray(unlockedBadges)) {
        unlockedBadges.forEach(b => {
            if (typeof b === 'string') unlockedMap.set(b, { unlockedAt: null });
            else if (b && b.badge_id) unlockedMap.set(b.badge_id, b);
            else if (b && b.id) unlockedMap.set(b.id, b);
        });
    }

    return OFFICIAL_BADGES.map(badge => {
        let current = 0;
        let isConditionMet = false;

        switch (badge.id) {
            case 'buoc-chan-dau-tien':
                current = totalApproved;
                isConditionMet = current >= 1;
                break;
            case 'nguoi-ke-chuyen-xu-tra':
                current = approvedArticles;
                isConditionMet = current >= 5;
                break;
            case 'ban-dong-hanh-vivu':
                current = approvedPosts;
                isConditionMet = current >= 10;
                break;
            case 'nguoi-kham-pha-xu-tra':
                current = approvedPlaces;
                isConditionMet = current >= 5;
                break;
            default:
                current = 0;
                isConditionMet = false;
        }

        const isExplicitlyUnlocked = unlockedMap.has(badge.id);
        const unlocked = isConditionMet || isExplicitlyUnlocked;
        const progress = Math.min(100, Math.round((current / badge.target) * 100));
        const remaining = Math.max(0, badge.target - current);

        const record = unlockedMap.get(badge.id);
        const unlockedDate = record?.unlocked_at 
            ? new Date(record.unlocked_at).toLocaleDateString('vi-VN') 
            : (unlocked ? 'Đã đạt' : null);

        return {
            ...badge,
            unlocked,
            current,
            progress,
            remainingText: remaining > 0 ? `Cần thêm ${remaining} đóng góp nữa` : 'Đã hoàn thành điều kiện',
            unlockedDate
        };
    });
}

export const USER_PROFILE = {
    id: '',
    name: 'Người dùng ViVu',
    nickname: '',
    handle: '',
    avatar: 'chùa âng.jpg',
    coverImage: 'ao bà om.jpg',
    role: 'Thành viên khám phá',
    titleBadge: null, // Danh hiệu được chọn hiển thị cạnh tên
    selectedTitle: null,
    bio: '',
    location: 'Trà Vinh, Việt Nam',
    joinDate: 'Mới tham gia',
    verified: false,
    greenMember: false,
    tierBadge: 'Thành viên',
    totalPoints: 0, // Điểm đóng góp tích lũy
    currentMonthPoints: 0, // Điểm tháng này (múi giờ VN)
    currentYearPoints: 0,
    stats: {
        tripsCompleted: null, // Chưa có dữ liệu xác nhận thực tế
        pagodasVisited: null, // Chưa có dữ liệu xác nhận thực tế
        cyclingKm: null       // Chưa có dữ liệu xác nhận thực tế
    },
    districtCoverage: null, // Chưa có dữ liệu xác nhận
    badges: [],
    certificates: [],
    recentContributions: []
};

export const INITIAL_SAVED_ITEMS = [
    {
        id: 'saved-ao-ba-om',
        placeId: 'ao-ba-om',
        title: 'Ao Bà Om & Rừng Cổ Thụ Di Sản',
        category: 'heritage',
        categoryLabel: 'VĂN HÓA & CHECK-IN',
        categoryIcon: 'park',
        image: 'ao bà om.jpg',
        distance: 3.2,
        rating: 4.9,
        reviewsCount: 428,
        tags: ['Di tích quốc gia', 'Cổ thụ ngàn năm'],
        address: 'Phường 8, TP. Trà Vinh, Tỉnh Trà Vinh',
        note: 'Dự kiến ghé sáng sớm chụp sương sớm soi bóng rễ cây và hoa sen nở rộ.',
        savedAt: '2024-10-25T08:30:00Z'
    },
    {
        id: 'saved-bun-nuoc-leo',
        placeId: 'bun-nuoc-leo-co-ba',
        title: 'Bún Nước Lèo Cô Ba Xứ Trà',
        category: 'culinary',
        categoryLabel: 'ẨM THỰC BẢN ĐỊA',
        categoryIcon: 'soup_kitchen',
        image: 'cù lao tân qui.jpg',
        distance: 1.4,
        rating: 4.8,
        reviewsCount: 389,
        tags: ['35.000đ - 55.000đ', 'Mắm bò hóc gia truyền'],
        address: 'Đường Đồng Khởi, Phường 6, TP. Trà Vinh',
        note: 'Món ăn sáng ngày đầu tiên, gọi tô đặc biệt ăn kèm thịt heo quay và bánh cóng giòn.',
        savedAt: '2024-10-25T09:15:00Z'
    },
    {
        id: 'saved-chua-ang',
        placeId: 'chua-ang',
        title: 'Chùa Âng (Wat Angkor Rajaborey)',
        category: 'heritage',
        categoryLabel: 'CHÙA KHMER CỔ NHẤT',
        categoryIcon: 'temple_buddhist',
        image: 'chùa âng.jpg',
        distance: 3.3,
        rating: 4.9,
        reviewsCount: 512,
        tags: ['Mở cửa 06:00 - 18:00', 'Thần rắn Naga & Bích họa'],
        address: 'Quốc lộ 53, đối diện Thắng cảnh Ao Bà Om',
        note: 'Ngôi chùa cổ kính hơn 1.000 năm tuổi với họa tiết thần rắn Naga, tiên nữ Kinnari.',
        savedAt: '2024-10-24T14:20:00Z'
    },
    {
        id: 'saved-cafe-vuon',
        placeId: 'cafe-vuon-xu-tra',
        title: 'Quán Cà Phê Vườn Xứ Trà',
        category: 'culinary',
        categoryLabel: 'CAFE SÂN VƯỜN',
        categoryIcon: 'local_cafe',
        image: 'cồn chim.jpg',
        distance: 4.8,
        rating: 4.7,
        reviewsCount: 184,
        tags: ['Không gian mở miệt vườn', 'Mật hoa dừa tự nhiên'],
        address: 'Huyện Châu Thành, TP. Trà Vinh',
        note: 'Điểm dừng chân thoáng đãng ngắm vườn dừa sáp, thưởng thức mật hoa dừa tự nhiên.',
        savedAt: '2024-10-23T11:00:00Z'
    },
    {
        id: 'saved-ok-om-bok',
        eventId: 'ok-om-bok-festival',
        title: 'Đại lễ Hội Ok Om Bok Trà Vinh 2024',
        category: 'event',
        categoryLabel: 'LỄ HỘI TRUYỀN THỐNG',
        categoryIcon: 'festival',
        image: 'chùa vamray.jpg',
        distance: 3.2,
        rating: 5.0,
        reviewsCount: 1250,
        tags: ['Rằm tháng 10 ÂL (14-15/11)', 'Đua Ghe Ngo & Cúng Trăng'],
        address: 'Khu di tích Thắng cảnh Ao Bà Om & Sông Long Bình',
        note: 'Lễ cúng Trăng tạ ơn đất trời, thả hoa đăng lung linh và giải đua ghe Ngo sôi động.',
        savedAt: '2024-10-22T16:45:00Z'
    },
    {
        id: 'saved-chua-hang',
        placeId: 'chua-hang',
        title: 'Chùa Hang (Wat Kompong Nikrodha)',
        category: 'culture',
        categoryLabel: 'DI TÍCH & ĐIÊU KHẮC GỖ',
        categoryIcon: 'carpenter',
        image: 'chùa hang.jpg',
        distance: 6.1,
        rating: 4.8,
        reviewsCount: 340,
        tags: ['Vườn chim tự nhiên', 'Xưởng tạc tượng gỗ'],
        address: 'Khóm 4, Thị trấn Châu Thành, Tỉnh Trà Vinh',
        note: 'Nổi tiếng với cổng vòm hình hang sâu độc đáo, rừng cây cổ thụ đàn chim bay lượn.',
        savedAt: '2024-10-21T10:30:00Z'
    }
];

export const SAVED_FOLDERS = [
    {
        id: 'folder-ok-om-bok',
        title: 'Tour 1 ngày Rằm Ok Om Bok',
        count: 5,
        unit: 'địa điểm',
        desc: 'Ao Bà Om, Chùa Âng, Đua Ghe Ngo',
        coverImage: 'ao bà om.jpg',
        offlineReady: true,
        tag: 'Đã tải ngoại tuyến'
    },
    {
        id: 'folder-chua-khmer',
        title: 'Chùa Khmer Cổ & Điêu Khắc',
        count: 4,
        unit: 'di tích',
        desc: 'Chùa Âng, Chùa Hang, Chùa Cò, Chùa Vàm Rây',
        coverImage: 'chùa âng.jpg',
        offlineReady: false,
        tag: 'Bán kính 6km'
    },
    {
        id: 'folder-mon-ngon',
        title: 'Món Ngon Xứ Trà Phải Thử',
        count: 5,
        unit: 'quán ruột',
        desc: 'Bún nước lèo, Bánh tét Trà Cuôn, Dừa sáp',
        coverImage: 'cù lao tân qui.jpg',
        offlineReady: false,
        tag: 'Đã thử 2/5'
    }
];

export const REDEEMABLE_GIFTS = [
    {
        id: 'gift-dua-sap',
        name: 'Voucher Thưởng Thức Dừa Sáp Cầu Kè',
        cost: 500,
        desc: 'Giảm 50.000đ khi mua dừa sáp tươi tại các vườn sinh thái Cầu Kè.',
        icon: 'eco',
        category: 'Ẩm thực',
        badge: 'Bán chạy'
    },
    {
        id: 'gift-xe-buyt',
        name: 'Vé Xe Buýt Điện Xanh Tham Quan Trà Vinh',
        cost: 200,
        desc: '1 vé đi tuyến xe điện không phát thải kết nối TP. Trà Vinh - Ao Bà Om.',
        icon: 'electric_bolt',
        category: 'Di chuyển',
        badge: 'Xanh 100%'
    },
    {
        id: 'gift-binh-tre',
        name: 'Bình Nước Tre Khắc Họa Tiết Khmer',
        cost: 350,
        desc: 'Bình giữ nhiệt vỏ tre thân thiện môi trường từ làng nghề Trà Vinh.',
        icon: 'water_drop',
        category: 'Quà tặng',
        badge: 'Thủ công'
    },
    {
        id: 'gift-com-dep',
        name: 'Gói Cốm Dẹp Trộn Dừa Truyền Thống 500g',
        cost: 250,
        desc: 'Đặc sản Cốm Dẹp giã tay dẻo bùi chuẩn bị cho mùa cúng Trăng.',
        icon: 'bakery_dining',
        category: 'Đặc sản',
        badge: 'Ok Om Bok'
    }
];
