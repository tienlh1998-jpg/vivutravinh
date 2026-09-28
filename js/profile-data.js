// js/profile-data.js - User Profile, Achievements, Badges & Saved Collections Data for ViVuTraVinh
// Strictly zero-CDN, local-first with responsive dark mode support

export const USER_PROFILE = {
    id: 'user_tien_travinh',
    name: 'Nguyễn Văn Tiến',
    nickname: 'Tiến Vivu',
    handle: '@tien.travinh',
    avatar: 'chùa âng.jpg',
    coverImage: 'ao bà om.jpg',
    role: 'Đại sứ Khám phá Xanh Trà Vinh 2024',
    titleBadge: 'Sứ giả Văn hóa Khmer & Phượt thủ Xanh',
    bio: 'Đam mê xe đạp xuyên rặng dừa sáp, ghi chép ký ức 143 ngôi chùa Khmer Nam Bộ và kiến tạo lối sống du lịch giảm rác thải nhựa tại quê hương Trà Vinh.',
    location: 'TP. Trà Vinh, Trà Vinh',
    joinDate: 'Tháng 03, 2023',
    verified: true,
    greenMember: true,
    tierBadge: 'Titan',
    level: {
        current: 4,
        max: 5,
        title: 'Bảo tồn Di sản',
        currentXp: 3750,
        nextLevelXp: 4000,
        nextLevelTitle: 'Tinh hoa Xứ Trà (Cấp 5)',
        progressPercent: 93.7
    },
    coins: 1250, // Xu Xứ Trà tích lũy
    stats: {
        tripsCompleted: 48,
        pagodasVisited: 18,
        cyclingKm: 642,
        co2ReducedKg: 128,
        treesSponsored: 14,
        plasticBottlesRefused: 240
    },
    districtCoverage: {
        explored: '7/9 Huyện & Thị xã',
        details: [
            { name: 'TP. Trà Vinh & Châu Thành', trips: 16, percent: 92 },
            { name: 'Cầu Kè (Vườn Dừa & Cù Lao)', trips: 11, percent: 70 },
            { name: 'Tiểu Cần & Trà Cú', trips: 9, percent: 58 },
            { name: 'Duyên Hải & Càng Long', trips: 5, percent: 32 }
        ],
        upcoming: 'Huyện Cầu Ngang (Dự kiến tham gia Ok Om Bok)'
    },
    badges: [
        {
            id: 'phuot-thu-cu-lao',
            name: 'Phượt thủ Cù Lao',
            tier: 'Vàng',
            icon: 'kayaking',
            category: 'eco',
            desc: 'Đã hoàn thành khám phá cung sinh thái miệt vườn Cù Lao Tân Quy và Long Trị 100% xanh.',
            unlocked: true,
            unlockedDate: '14/09/2024',
            xp: 450,
            color: 'amber'
        },
        {
            id: 'van-hoa-khmer',
            name: 'Hiểu sâu Văn hóa Khmer',
            tier: 'Bạch kim',
            icon: 'synagogue',
            category: 'temple',
            desc: 'Check-in và tương tác văn hóa tại 18/15 ngôi chùa cổ (Âng, Hang, Vàm Rây, Cò...).',
            unlocked: true,
            unlockedDate: '02/10/2024',
            xp: 500,
            color: 'cyan'
        },
        {
            id: 'ban-dap-xanh',
            name: 'Chiến binh Bàn đạp Xanh',
            tier: 'Bạc',
            icon: 'pedal_bike',
            category: 'eco',
            desc: 'Ghi nhận tổng quãng đường 642 km (Mục tiêu 500 km) đạp xe giảm khí thải các-bon.',
            unlocked: true,
            unlockedDate: '22/08/2024',
            xp: 400,
            color: 'slate'
        },
        {
            id: 'am-thuc-sanh-soi',
            name: 'Ẩm thực Sành sỏi',
            tier: 'Đồng',
            icon: 'restaurant_menu',
            category: 'food',
            desc: 'Đã thưởng thức & review 12 món đặc sản (Bún nước lèo, Bánh tét Trà Cuôn, Dừa sáp...).',
            unlocked: true,
            unlockedDate: '15/06/2024',
            xp: 250,
            color: 'orange'
        },
        {
            id: 'ok-om-bok',
            name: 'Trái tim Ok Om Bok',
            tier: 'Vàng',
            icon: 'sailing',
            category: 'temple',
            desc: 'Cổ vũ giải đua thuyền Ngo & Thả đèn hoa đăng lung linh trên hồ Ao Bà Om.',
            unlocked: true,
            unlockedDate: '15/11/2024',
            xp: 500,
            color: 'amber'
        },
        {
            id: 'hiep-si-long-tri',
            name: 'Hiệp sĩ Cù lao Long Trị',
            tier: 'Bạc',
            icon: 'kayaking',
            category: 'eco',
            desc: 'Đi xuồng ba lá & thu hoạch thanh long ruột đỏ miệt vườn Trà Vinh.',
            unlocked: false,
            progress: 70,
            remaining: 'Còn 1 chuyến',
            xp: 300,
            color: 'emerald'
        },
        {
            id: 'nghe-nhan-chua-hang',
            name: 'Nghệ nhân Chùa Hang',
            tier: 'Đồng',
            icon: 'carpenter',
            category: 'community',
            desc: 'Học trải nghiệm đục rễ cây cổ thụ cùng nghệ nhân Khmer.',
            unlocked: false,
            progress: 20,
            remaining: 'Cần 1 workshop',
            xp: 200,
            color: 'stone'
        },
        {
            id: 'nha-thao-moc-xanh',
            name: 'Người Bạn Của Rừng Sao Đên',
            tier: 'Bạc',
            icon: 'park',
            category: 'eco',
            desc: 'Bảo trợ 14 cây sao dầu cổ thụ trên 100 năm tuổi tại khuôn viên Ao Bà Om.',
            unlocked: true,
            unlockedDate: '10/05/2024',
            xp: 350,
            color: 'emerald'
        }
    ],
    certificates: [
        {
            title: 'Hướng dẫn viên Bản địa Thân thiện',
            issuer: 'Sở VHTTDL Trà Vinh & CLB ViVu',
            date: '15/07/2024',
            icon: 'verified',
            color: 'amber'
        },
        {
            title: 'Người Gìn Giữ Lễ Hội Ok Om Bok',
            issuer: 'Ban Quản trị Ao Bà Om',
            date: '28/11/2023',
            icon: 'workspace_premium',
            color: 'emerald'
        }
    ],
    recentContributions: [
        {
            id: 'contrib-1',
            title: 'Đã cập nhật tọa độ & lịch mở cửa Chùa Âng',
            desc: 'Kèm 6 ảnh chất lượng cao và hướng dẫn gửi xe miễn phí',
            time: '2 ngày trước',
            reward: '+80 Xu Trà Vinh',
            icon: 'add_location_alt'
        },
        {
            id: 'contrib-2',
            title: 'Tham gia dọn sạch bến tàu Cù Lao Tân Quy',
            desc: 'Thu gom 28kg rác nhựa cùng CLB ViVu Xanh Cầu Kè',
            time: '5 ngày trước',
            reward: '+150 Xu Trà Vinh',
            icon: 'compost'
        },
        {
            id: 'contrib-3',
            title: 'Đăng tải cẩm nang thưởng thức Bún Nước Lèo Cô Ba',
            desc: 'Chia sẻ công thức mắm bò hóc và rau ghém bắp chuối',
            time: '1 tuần trước',
            reward: '+50 Xu Trà Vinh',
            icon: 'rate_review'
        }
    ]
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
