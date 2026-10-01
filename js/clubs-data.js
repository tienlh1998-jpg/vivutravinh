// ViVuTraVinh - Dữ Liệu Câu Lạc Bộ & Hoạt Động Cộng Đồng Xứ Trà (Phase 5)
// Tích hợp theo chuẩn Stitch Design System: CLB, Hoạt động trong tuần, Thảo luận & Quy tắc cộng đồng

export const TRA_VINH_CLUBS = [
    {
        id: 'clb-nhiep-anh-khmer',
        name: 'CLB Nhiếp Ảnh & Văn Hóa Khmer',
        category: 'di-san',
        categoryName: 'Nhiếp ảnh & Di sản',
        badge: 'Văn hóa & Di sản',
        isSample: true,
        membersCount: 215,
        activitiesCount: 14,
        image: './chùa hang.jpg',
        description: 'Giao lưu nhiếp ảnh kiến trúc chùa Khmer, workshop làm đèn hoa sen và lưu giữ nét đẹp văn hóa Nam Bộ.',
        lastActivity: 'Vừa hoàn thành: Triển lãm ảnh Chùa Hang hôm qua',
        scheduleInfo: '1 buổi photo walk cuối tuần',
        meetingPlace: 'Cổng Chùa Hang, TT. Châu Thành',
        icon: 'camera_enhance',
        color: 'amber'
    },
    {
        id: 'clb-phuot-checkin',
        name: 'CLB Phượt & Check-in Trà Vinh',
        category: 'da-ngoai',
        categoryName: 'Đạp xe & Trekking',
        badge: 'Dã ngoại & Khám phá',
        isSample: true,
        membersCount: 340,
        activitiesCount: 28,
        image: './cù lao tân qui.jpg',
        description: 'Chuyên các cung đường cồn Hưng Phong, cù lao Long Trị, đạp xe xuyên vườn dừa và săn ảnh bình minh.',
        lastActivity: 'Đang mở: Đạp xe ngắm hoàng hôn Ba Động (Thứ 7)',
        scheduleInfo: '3 buổi đạp rèn thể lực / tuần',
        meetingPlace: 'Cổng Ao Bà Om, Phường 8, TP. Trà Vinh',
        icon: 'hiking',
        color: 'emerald'
    },
    {
        id: 'clb-am-thuc-xu-tra',
        name: 'CLB Ẩm Thực Xứ Trà & Cafe Vườn',
        category: 'am-thuc',
        categoryName: 'Ẩm thực xứ Trà',
        badge: 'Ẩm thực & Cà phê',
        isSample: true,
        membersCount: 480,
        activitiesCount: 36,
        image: './ao bà om.jpg',
        description: 'Tìm kiếm những quán bún nước lèo chuẩn vị cổ truyền, không gian cafe vườn yên tĩnh và bánh tét Trà Cuôn.',
        lastActivity: 'Gặp gỡ: Cà phê sáng chủ nhật tại Cà Phê Vườn Khóm 8',
        scheduleInfo: 'Sinh hoạt định kỳ sáng Chủ Nhật',
        meetingPlace: 'Các quán cafe sân vườn TP. Trà Vinh',
        icon: 'restaurant',
        color: 'emerald'
    },
    {
        id: 'clb-chay-bo-long-binh',
        name: 'CLB Chạy Bộ Bờ Kè Long Bình',
        category: 'the-thao',
        categoryName: 'Thể thao & Sức khỏe',
        badge: 'Thể thao & Sức khỏe',
        isSample: true,
        membersCount: 510,
        activitiesCount: 42,
        image: './ao bà om.jpg',
        description: 'Cộng đồng chạy bộ rèn luyện sức khỏe, ngắm hoàng hôn bên dòng sông Long Bình thơ mộng mỗi chiều thứ 6 và sáng chủ nhật.',
        lastActivity: 'Chạy cự ly 5km & 10km sáng Chủ Nhật tuần này',
        scheduleInfo: 'Thứ 4, Thứ 6 (17:30) & Sáng CN (06:00)',
        meetingPlace: 'Bờ kè Sông Long Bình, TP. Trà Vinh',
        icon: 'directions_run',
        color: 'blue'
    },
    {
        id: 'clb-don-ca-tai-tu',
        name: 'CLB Đờn Ca Tài Tử Xứ Dừa',
        category: 'nghe-thuat',
        categoryName: 'Nghệ thuật Khmer & Dân gian',
        badge: 'Nghệ thuật Dân gian',
        isSample: true,
        membersCount: 180,
        activitiesCount: 19,
        image: './nhà cổ huỳnh kỳ.jpg',
        description: 'Bảo tồn và giao lưu đờn ca tài tử Nam Bộ, đàn kìm, đàn tranh và các bài ca vọng cổ ca ngợi đất và người Trà Vinh.',
        lastActivity: 'Đêm nhạc trà thảo mộc tối Chủ Nhật hàng tuần',
        scheduleInfo: 'Tối Chủ Nhật (19:30)',
        meetingPlace: 'Nhà cổ Cầu Kè & Không gian văn hóa Trà Vinh',
        icon: 'music_note',
        color: 'purple'
    }
];

export const TRA_VINH_WEEKLY_ACTIVITIES = [
    {
        id: 'act-1',
        isSample: true,
        title: 'Chạy bộ ngắm hoàng hôn Bờ kè Long Bình',
        clubId: 'clb-chay-bo-long-binh',
        clubName: 'CLB Chạy Bộ Bờ Kè Long Bình',
        time: 'Thứ 6, 17:30',
        attendeesCount: 32,
        maxAttendees: 50,
        location: 'Bờ kè Sông Long Bình, TP. Trà Vinh',
        isFree: true,
        icon: 'directions_run'
    },
    {
        id: 'act-2',
        isSample: true,
        title: 'Đạp xe khám phá cù lao bưởi Tân Quy',
        clubId: 'clb-phuot-checkin',
        clubName: 'CLB Phượt & Check-in Trà Vinh',
        time: 'Sáng Chủ Nhật, 07:00',
        attendeesCount: 18,
        maxAttendees: 25,
        location: 'Bến phà Cù Lao Tân Quy, Cầu Kè',
        isFree: true,
        icon: 'pedal_bike'
    },
    {
        id: 'act-3',
        isSample: true,
        title: 'Giao lưu đờn ca tài tử & trà thảo mộc',
        clubId: 'clb-don-ca-tai-tu',
        clubName: 'CLB Đờn Ca Tài Tử Xứ Dừa',
        time: 'Tối Chủ Nhật, 19:30',
        attendeesCount: 25,
        maxAttendees: 30,
        location: 'Nhà cổ Huỳnh Kỳ & Không gian văn hóa',
        isFree: true,
        icon: 'music_note'
    },
    {
        id: 'act-4',
        isSample: true,
        title: 'Săn bình minh Ao Bà Om & Workshop ảnh film',
        clubId: 'clb-nhiep-anh-khmer',
        clubName: 'CLB Nhiếp Ảnh & Văn Hóa Khmer',
        time: 'Sáng Chủ Nhật, 05:30',
        attendeesCount: 22,
        maxAttendees: 30,
        location: 'Bờ Nam Di tích Thắng cảnh Ao Bà Om',
        isFree: true,
        icon: 'photo_camera'
    }
];

export const TRA_VINH_COMMUNITY_POSTS = [
    {
        id: 'post-1',
        isSample: true,
        author: 'Thạch Sa Vươn',
        avatarText: 'SV',
        badge: 'CLB Văn Hóa',
        timeAgo: '2 giờ trước',
        location: 'Chùa Âng (Wat Angkor Borey)',
        content: 'Sáng nay nhóm mình vừa có buổi ghi hình và tìm hiểu về các điển tích chạm khắc tại Wat Angkor Borey (Chùa Âng). Cảm ơn các sư thầy đã đón tiếp và giải thích rất cặn kẽ về ý nghĩa từng hoa văn chim thần Krud. Thứ Bảy tuần tới mời mọi người cùng tham gia workshop đan đèn hoa sen nhé!',
        image: './chùa âng.jpg',
        likes: 46,
        commentsCount: 12,
        shares: 5,
        topic: '🛕 Chùa chiền Khmer'
    },
    {
        id: 'post-2',
        isSample: true,
        author: 'Nguyễn Bích Vy',
        avatarText: 'BV',
        badge: 'Thành viên mới',
        timeAgo: '5 giờ trước',
        location: 'Bún Nước Lèo Cô Ba, Đồng Khởi',
        content: 'Cuối tuần dẫn nhóm bạn Sài Gòn về Trà Vinh ghé ăn bún nước lèo Cô Ba ở Đồng Khởi. Nước lèo nấu mắm bồ hóc rất thanh dịu, cá lóc đồng chắc thịt ăn kèm bắp chuối và rau thơm bản địa. Mọi người ai đi nhớ dặn cô thêm dĩa thịt quay giòn rụm nha!',
        image: './ao bà om.jpg',
        likes: 78,
        commentsCount: 24,
        shares: 8,
        topic: '🍜 Ẩm thực xứ Trà'
    },
    {
        id: 'post-3',
        isSample: true,
        author: 'Trần Tiến',
        avatarText: 'TT',
        badge: 'Thành viên tích cực',
        timeAgo: '1 ngày trước',
        location: 'Cồn Chim, Châu Thành',
        content: 'Một ngày "thuận thiên" thật an lành tại Cồn Chim. Không khói bụi xe cộ, chỉ có tiếng gió xào xạc qua rặng dừa nước, thưởng thức bánh lá mơ và nghe cô bác kể chuyện làm du lịch cộng đồng gìn giữ môi trường xanh. Rất đáng để trải nghiệm!',
        image: './cồn chim.jpg',
        likes: 92,
        commentsCount: 31,
        shares: 14,
        topic: '🚴 Dã ngoại sinh thái'
    }
];

export const COMMUNITY_GUIDELINES = [
    {
        num: 1,
        rule: 'Tôn trọng nét đẹp văn hóa tâm linh và di tích Khmer cổ truyền.'
    },
    {
        num: 2,
        rule: 'Giữ gìn vệ sinh môi trường tự nhiên, không xả rác tại điểm tham quan sinh thái.'
    },
    {
        num: 3,
        rule: 'Chia sẻ chân thực, trung thực về trải nghiệm ẩm thực bản địa.'
    },
    {
        num: 4,
        rule: 'Kết nối văn minh, thân thiện và sẵn lòng tương trợ bạn bè thập phương.'
    }
];

export const TRA_VINH_CLUB_CATEGORIES = [
    { id: 'all', label: 'Tất cả', icon: 'groups', count: 5 },
    { id: 'di-san', label: 'Nhiếp ảnh & Di sản', icon: 'photo_camera', count: 1 },
    { id: 'da-ngoai', label: 'Đạp xe & Dã ngoại', icon: 'pedal_bike', count: 1 },
    { id: 'am-thuc', label: 'Ẩm thực xứ Trà', icon: 'restaurant', count: 1 },
    { id: 'the-thao', label: 'Thể thao & Sức khỏe', icon: 'directions_run', count: 1 },
    { id: 'nghe-thuat', label: 'Nghệ thuật & Dân gian', icon: 'music_note', count: 1 }
];

export const COMMUNITY_FEED_FILTERS = [
    { id: 'all', label: 'Tất cả bài viết' },
    { id: 'featured', label: 'Thảo luận nổi bật' },
    { id: 'upcoming', label: 'Chuyến đi sắp tới' },
    { id: 'photos', label: 'Hình ảnh mới' }
];

