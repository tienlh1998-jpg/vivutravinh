// js/planner-data.js - Trip Planner, Turn-by-Turn GPS Navigation & Social Story Data for ViVuTraVinh
// Strictly zero-CDN, local-first with responsive dark mode support

export const INITIAL_TRIP_PLAN = {
    id: 'plan-khmer-eco-2024',
    title: 'Hành trình Xanh: Khám phá Di sản Khmer & Miệt vườn Trà Vinh',
    description: 'Lộ trình 2 ngày trải nghiệm các ngôi chùa cổ kính, rặng cây cổ thụ trăm tuổi và đặc sản ẩm thực miền đất Xứ Trà.',
    isPublicDraft: true,
    durationDays: 2,
    totalDistanceKm: 48.5,
    estimatedCo2Kg: 0.8,
    estimatedCostVnd: 650000,
    companionsCount: 3,
    departure: {
        id: 'dep-cuu-long',
        title: 'Khách sạn Cửu Long (TP. Trà Vinh)',
        time: '07:30',
        type: 'Điểm tập kết',
        note: 'Kiểm tra xe đạp, trang bị nón lá & bình nước cá nhân bảo vệ môi trường.'
    },
    days: [
        {
            dayNumber: 1,
            label: 'Ngày 1',
            activeHours: '07:30 - 13:00 (5.5h)',
            stops: [
                {
                    id: 'stop-chua-ang',
                    placeId: 'chua-ang',
                    title: 'Chùa Âng (Wat Angkor Rajaborey)',
                    timeRange: '08:00 - 09:30',
                    durationMinutes: 90,
                    category: 'Chùa cổ',
                    image: 'chùa âng.jpg',
                    note: 'Ngắm ánh nắng rọi hàng cây sao cổ, viếng chánh điện mái vuốt cong đặc trưng Khmer và nghe audio guide thuyết minh tích truyện Reamker.',
                    badge: 'Di tích cấp Quốc gia (1842)',
                    hasAudioGuide: true,
                    lat: 9.9431,
                    lng: 106.3112,
                    transfer: {
                        mode: 'directions_walk',
                        modeLabel: 'Đi bộ',
                        distance: '200m',
                        time: '3 phút đi bộ tản mát ven bờ hồ'
                    }
                },
                {
                    id: 'stop-ao-ba-om',
                    placeId: 'ao-ba-om',
                    title: 'Thắng cảnh Ao Bà Om (Ao Vuông)',
                    timeRange: '09:40 - 11:00',
                    durationMinutes: 80,
                    category: 'Thắng cảnh',
                    image: 'ao bà om.jpg',
                    note: 'Nghỉ chân dưới rặng cổ thụ dầu - sao trăm năm rễ trồi kỳ vĩ, thưởng thức dừa sáp Cầu Kè béo dẻo và tìm hiểu truyền thuyết thi đào ao giữa nam và nữ.',
                    badge: 'Uống nước dừa sáp tự do',
                    hasAudioGuide: false,
                    lat: 9.9442,
                    lng: 106.3135,
                    transfer: {
                        mode: 'electric_scooter',
                        modeLabel: 'Xe điện / Xe đạp',
                        distance: '4.1 km',
                        time: '18 phút đạp xe / xe điện về trung tâm'
                    }
                },
                {
                    id: 'stop-bun-nuoc-leo',
                    placeId: 'bun-nuoc-leo',
                    title: 'Bún Nước Lèo Cô Ba Bến Xanh',
                    timeRange: '11:30 - 13:00',
                    durationMinutes: 90,
                    category: 'Ẩm thực',
                    image: 'bun nuoc leo.png',
                    note: 'Thưởng thức tô bún nước lèo nấu từ mắm bò hóc đậm đà, thịt cá lóc đồng ngọt thanh, bắp chuối bào giòn tan cùng chả giò bắp chiên nóng hổi.',
                    badge: 'Khoảng 45.000đ - 65.000đ/tô • Bàn đã đặt',
                    hasAudioGuide: false,
                    lat: 9.9385,
                    lng: 106.3421,
                    transfer: null
                }
            ]
        },
        {
            dayNumber: 2,
            label: 'Ngày 2',
            activeHours: '08:00 - 16:30 (8.5h)',
            stops: [
                {
                    id: 'stop-vuon-co-cu-lao',
                    placeId: 'vuon-co-cu-lao',
                    title: 'Cà phê Vườn Cọ Cù Lao & Vườn Cây',
                    timeRange: '08:30 - 11:30',
                    durationMinutes: 180,
                    category: 'Cù lao',
                    image: 'vuon co cu lao.png',
                    note: 'Qua đò sông Cổ Chiên sang Cù Lao Tân Quy, đạp xe ngắm vườn chôm chôm sầu riêng trĩu quả và thưởng thức dừa nước mát lạnh.',
                    badge: 'Sinh thái Miệt vườn Xanh',
                    hasAudioGuide: false,
                    lat: 9.8722,
                    lng: 106.1284,
                    transfer: {
                        mode: 'pedal_bike',
                        modeLabel: 'Xe đạp',
                        distance: '14.5 km',
                        time: '45 phút di chuyển qua đường làng rợp bóng dừa'
                    }
                },
                {
                    id: 'stop-chua-vam-ray',
                    placeId: 'chua-vam-ray',
                    title: 'Chùa Vàm Ray (Wat Kompong Chrây)',
                    timeRange: '12:30 - 14:00',
                    durationMinutes: 90,
                    category: 'Chùa cổ',
                    image: 'chùa vamray.jpg',
                    note: 'Chiêm bái tượng Phật Thích Ca nhập Niết Bàn ngoài trời lớn nhất Miền Tây dài 54m phủ sơn son thếp vàng uy nghiêm.',
                    badge: 'Kiến trúc Angkor lộng lẫy',
                    hasAudioGuide: true,
                    lat: 9.7153,
                    lng: 106.3572,
                    transfer: {
                        mode: 'electric_scooter',
                        modeLabel: 'Xe điện',
                        distance: '18.2 km',
                        time: '35 phút tới thị xã duyên hải'
                    }
                },
                {
                    id: 'stop-bien-ba-dong',
                    placeId: 'bien-ba-dong',
                    title: 'Biển Ba Động & Rừng ngập mặn',
                    timeRange: '14:45 - 16:30',
                    durationMinutes: 105,
                    category: 'Thắng cảnh',
                    image: 'biển ba động.jpg',
                    note: 'Ngắm hoàng hôn biển phù sa hoang sơ, thưởng thức bánh tép chiên giòn rụm và đặc sản chù ụ rang me vùng Duyên Hải.',
                    badge: 'Hoàng hôn biển Duyên Hải',
                    hasAudioGuide: false,
                    lat: 9.6587,
                    lng: 106.5642,
                    transfer: null
                }
            ]
        }
    ]
};

export const PLACE_POOL = [
    {
        id: 'pool-chua-hang',
        placeId: 'chua-hang',
        title: 'Chùa Hang (Wat Nikrodha)',
        location: 'Huyện Châu Thành • 5.8 km',
        category: 'Chùa cổ',
        categoryTag: 'Làng nghề khắc',
        image: 'chùa hang.jpg',
        durationHours: 1.5,
        rating: 4.8,
        description: 'Ngôi chùa cổ với cổng hang độc đáo, nơi chim muông làm tổ và các sư thầy gìn giữ nghệ thuật điêu khắc gỗ tinh xảo.',
        lat: 9.9142,
        lng: 106.3056
    },
    {
        id: 'pool-vuon-co',
        placeId: 'vuon-co-cu-lao',
        title: 'Cà phê Vườn Cọ Cù Lao',
        location: 'Cù Lao Tân Quy • Sông Hậu',
        category: 'Cù lao',
        categoryTag: 'Sinh thái Miệt vườn',
        image: 'vuon co cu lao.png',
        durationHours: 1.0,
        rating: 4.6,
        description: 'Không gian miệt vườn thanh bình, thưởng thức đồ uống bản địa mát lành giữa bóng dừa và hàng cau xanh ngát.',
        lat: 9.9214,
        lng: 106.1823
    },
    {
        id: 'pool-chua-ang',
        placeId: 'chua-ang',
        title: 'Chùa Âng (Wat Angkor)',
        location: 'Phường 8, TP. Trà Vinh',
        category: 'Chùa cổ',
        categoryTag: 'Di sản Quốc gia',
        image: 'chùa âng.jpg',
        durationHours: 1.5,
        rating: 4.9,
        description: 'Ngôi chùa Khmer cổ nhất Trà Vinh với bề dày lịch sử hơn 1000 năm và kiến trúc nóc nhọn điêu khắc tượng thần Naga.',
        lat: 9.9431,
        lng: 106.3112
    },
    {
        id: 'pool-ao-ba-om',
        placeId: 'ao-ba-om',
        title: 'Ao Bà Om (Ao Vuông)',
        location: 'Phường 8, TP. Trà Vinh',
        category: 'Thắng cảnh',
        categoryTag: 'Hồ Sao Cổ Thụ',
        image: 'ao bà om.jpg',
        durationHours: 1.0,
        rating: 4.8,
        description: 'Danh lam thắng cảnh gắn liền huyền tích đào ao của người Khmer, bao quanh bởi hơn 500 cây dầu sao cổ thụ rễ trồi kỳ thú.',
        lat: 9.9442,
        lng: 106.3135
    },
    {
        id: 'pool-bun-nuoc-leo',
        placeId: 'bun-nuoc-leo',
        title: 'Bún Nước Lèo Bến Xanh',
        location: 'Đường Đồng Khởi, TP. TV',
        category: 'Ẩm thực',
        categoryTag: 'Đặc sản Trà Vinh',
        image: 'bun nuoc leo.png',
        durationHours: 0.75,
        rating: 4.7,
        description: 'Hương vị bún nước lèo đậm đà mắm bò hóc truyền thống kết hợp cá lóc đồng, thịt quay và rau thơm tươi ngon.',
        lat: 9.9385,
        lng: 106.3421
    },
    {
        id: 'pool-con-chim',
        placeId: 'con-chim',
        title: 'Cù Lao Cồn Chim Xanh',
        location: 'Châu Thành, Trà Vinh',
        category: 'Cù lao',
        categoryTag: 'Du lịch Thuận Thiên',
        image: 'cồn chim.jpg',
        durationHours: 3.0,
        rating: 4.9,
        description: 'Ốc đảo du lịch sinh thái nói không với rác thải nhựa, trải nghiệm câu cua, làm bánh dân gian và uống dừa tươi.',
        lat: 9.9167,
        lng: 106.4274
    },
    {
        id: 'pool-den-tho-bac',
        placeId: 'den-tho-bac-ho',
        title: 'Đền thờ Bác Hồ Long Đức',
        location: 'Xã Long Đức, TP. Trà Vinh',
        category: 'Di tích',
        categoryTag: 'Di tích Lịch sử',
        image: 'đền thờ Bác.jpg',
        durationHours: 1.0,
        rating: 4.7,
        description: 'Công trình biểu tượng tấm lòng son sắt của đồng bào Trà Vinh với Bác Hồ trong kháng chiến bom đạn.',
        lat: 9.9725,
        lng: 106.3412
    },
    {
        id: 'pool-nha-co-huynh-ky',
        placeId: 'nha-co-huynh-ky',
        title: 'Nhà cổ Huỳnh Kỳ (Cầu Kè)',
        location: 'Thị trấn Cầu Kè, Trà Vinh',
        category: 'Di tích',
        categoryTag: 'Kiến trúc Đông - Tây',
        image: 'nhà cổ huỳnh kỳ.jpg',
        durationHours: 1.0,
        rating: 4.8,
        description: 'Biệt thự cổ kết hợp tinh hoa kiến trúc Pháp cổ điển và hoa văn chạm khắc gỗ Nam Bộ thế kỷ 20.',
        lat: 9.8973,
        lng: 106.0125
    }
];

export const GPS_NAVIGATION_STATE = {
    tripTitle: 'Hành trình Viếng Chùa & Khám phá Xứ Trà',
    currentStep: {
        distanceMeters: 150,
        instruction: 'Rẽ phải vào Cổng Di tích Chùa Âng',
        maneuver: 'turn_right',
        followUp: 'Sau đó đi thẳng 800m dọc bờ hồ Ao Bà Om rợp bóng mát',
        lane: 'turn_right'
    },
    audioGuide: {
        title: 'Huyền tích Thần chim Garuda tại Wat Angkor',
        category: 'Thuyết minh Xứ Trà',
        currentTime: '01:24',
        totalTime: '03:10',
        isPlaying: false
    },
    currentSpeedKmh: 24,
    speedLimitKmh: 30,
    is3DMode: true,
    isVoiceEnabled: true,
    eta: '08:15',
    remainingMinutes: 12,
    remainingMeters: 850,
    vehicleMode: 'Xe máy / Xe đạp',
    progressStage: 'Chặng 1/4 • Chùa Âng & Ao Bà Om',
    totalDistanceStr: 'Tổng 4.2 km',
    waypoints: [
        { id: 1, name: '1. Chùa Âng', distance: '150m', active: true },
        { id: 2, name: '2. Ao Bà Om', distance: '550m', active: false },
        { id: 3, name: '3. Bún Nước Lèo', distance: '4.1 km', active: false },
        { id: 4, name: '4. Chùa Hang', distance: '8.2 km', active: false }
    ]
};

export const TRIP_SUMMARY_STATE = {
    title: 'Hành trình viếng Chùa Khmer & Ẩm thực Xứ Trà',
    completedDate: 'Hôm nay • 14:45',
    description: 'Chúc mừng bạn đã hoàn thành trọn vẹn 4/4 điểm đến, tiếp thu 3 câu chuyện văn hóa bản địa và lưu giữ những ký ức tuyệt đẹp tại vùng đất Trà Vinh.',
    badgeTitle: 'Sứ giả Văn hóa',
    ecoImpactText: 'Giảm thiểu 2.4kg CO₂ phát thải',
    stats: {
        distanceKm: '14.8',
        durationHours: '6h 45m',
        pointsVisited: '4 / 4',
        caloriesBurned: '~720'
    },
    milestones: [
        {
            title: '1. Chùa Âng (Wat Angkor Rajaborey)',
            time: '08:15',
            note: 'Hoàn thành nghe audio guide "Huyền tích chim thần Garuda" và chiêm bái chánh điện cổ kính.'
        },
        {
            title: '2. Thắng cảnh Ao Bà Om',
            time: '10:00',
            note: 'Dạo bộ dưới rặng cây sao cổ thụ hàng trăm năm tuổi, check-in rễ cây độc lạ và thưởng thức dừa sáp béo ngọt.'
        },
        {
            title: '3. Quán Bún Nước Lèo Cô Ba',
            time: '12:15',
            note: 'Thưởng thức bữa trưa đậm đà hương vị mắm bồ hóc trứ danh kết hợp thịt heo quay giòn rụm (Đánh giá 5★).'
        },
        {
            title: '4. Chùa Hang (Wat Kompong Chrây)',
            time: '14:00',
            note: 'Chiêm ngưỡng cổng chùa hình vòm hang độc đáo, tham quan xưởng điêu khắc gỗ nghệ thuật và ngắm chim về tổ.'
        }
    ],
    photos: [
        { title: 'Chùa Âng', image: 'chùa âng.jpg' },
        { title: 'Ao Bà Om', image: 'ao bà om.jpg' },
        { title: 'Bún Nước Lèo', image: 'bun nuoc leo.png' },
        { title: 'Chùa Hang', image: 'chùa hang.jpg' }
    ]
};

export const STORY_TEMPLATES = {
    heritage: {
        id: 'heritage',
        name: 'Cổ Kính',
        icon: 'temple_buddhist',
        badgeName: 'Sứ giả Văn hóa Xứ Trà 🌿',
        subtitle: 'Xứ Tháp Vàng',
        dateText: '25.10.2024',
        bgImage: 'ao bà om.jpg',
        polaroids: [
            { title: 'Bún Nước Lèo', image: 'bun nuoc leo.png', alt: 'Bún Nước Lèo Trà Vinh' },
            { title: 'Chùa Âng Linh Thiêng', image: 'chùa âng.jpg', alt: 'Chùa Âng cổ kính' }
        ],
        quote: '"Thong thả đạp xe dưới vòm cây cổ thụ, vị bún đậm đà khó quên! ✨"',
        stats: {
            distance: '14.8 km',
            co2Saved: '-2.4 kg CO₂'
        },
        hashtags: '#ViVuTraVinh #OkOmBok #TraVinhEco',
        journeyUrl: 'vivutravinh.vn/journey/8921'
    },
    eco: {
        id: 'eco',
        name: 'Sinh Thái',
        icon: 'nature',
        badgeName: 'Hành Trình Xanh Cù Lao 🚲',
        subtitle: 'Du lịch Xanh Trách Nhiệm',
        dateText: '25.10.2024',
        bgImage: 'cù lao tân qui.jpg',
        polaroids: [
            { title: 'Vườn Cọ Cù Lao', image: 'vuon co cu lao.png', alt: 'Vườn Cọ Cù Lao' },
            { title: 'Cồn Chim Thuận Thiên', image: 'cồn chim.jpg', alt: 'Cồn Chim bình yên' }
        ],
        quote: '"Bình yên nghe sóng vỗ miệt vườn cù lao, sống chậm từng nhịp thở 🌱"',
        stats: {
            distance: '28.5 km',
            co2Saved: '-5.2 kg CO₂'
        },
        hashtags: '#TraVinhGreen #EcoTour #CuLaoTanQuy',
        journeyUrl: 'vivutravinh.vn/journey/8922'
    },
    foodie: {
        id: 'foodie',
        name: 'Ẩm Thực',
        icon: 'restaurant',
        badgeName: 'Mỹ Vị Ẩm Thực Xứ Trà 🍲',
        subtitle: 'Hương Vị Bản Địa',
        dateText: '25.10.2024',
        bgImage: 'bun nuoc leo.png',
        polaroids: [
            { title: 'Bún Nước Lèo Bến Xanh', image: 'bun nuoc leo.png', alt: 'Bún nước lèo' },
            { title: 'Dừa Sáp Ao Bà Om', image: 'ao bà om.jpg', alt: 'Dừa sáp Ao Bà Om' }
        ],
        quote: '"Mắm bồ hóc thơm lừng cá lóc đồng, dừa sáp béo ngậy khó cưỡng! 🥢"',
        stats: {
            distance: '9.2 km',
            co2Saved: '-1.8 kg CO₂'
        },
        hashtags: '#TraVinhFoodie #BunNuocLeo #DuaSap',
        journeyUrl: 'vivutravinh.vn/journey/8923'
    }
};
