/**
 * admin-portal-data.js
 * Quản lý dữ liệu Admin Portal, Tường Hỗ trợ dự án & Trung tâm Kiểm duyệt (ViVuTraVinh)
 * Tương thích chuẩn Stitch Design - 100% Zero-CDN & Local Assets
 */

export const ADMIN_INFO = {
    name: "Trần Tiến",
    role: "Quản trị viên hệ thống & Người sáng lập ViVuTraVinh",
    title: "IT Specialist • Người con Trà Vinh • Người sáng lập dự án",
    avatar: "chùa âng.jpg",
    bio: "Chào mọi người, mình là Tiến — một kỹ sư phần mềm sinh ra và lớn lên tại đất Trà Vinh. ViVuTraVinh được xây dựng từ tình yêu với những ngôi chùa Khmer rợp bóng cổ thụ, hương vị bún nước lèo thân thương và mong muốn du khách khắp nơi có một cẩm nang địa phương chân thực nhất. Nền tảng hoạt động hoàn toàn phi lợi nhuận và mở cho cộng đồng đóng góp.",
    contacts: {
        email: "mailto:tienlh1998@gmail.com",
        github: "https://github.com/tienlh1998-jpg/vivutravinh",
        facebook: "https://facebook.com/vivutravinh.official"
    }
};

export const PROJECT_FINANCIAL_REPORT = {
    cycle: "Quý I/2025",
    monthlyCost: 650000,
    monthlyFunded: 520000,
    percentFunded: 80,
    uptimeMonths: 18,
    verifiedPlaces: 128,
    remainingNeeded: 130000,
    bank: {
        name: "Vietcombank (Demo)",
        accountName: "VIVUTRAVINH COMMUNITY",
        accountNumber: "9826",
        defaultMemo: "VIVU UNG HO"
    },
    recentSupporters: [
        { name: "Nguyễn Văn Tiến", amount: 100000, date: "Hôm qua", message: "Tiếp sức server mùa Ok Om Bok!" },
        { name: "Thạch Sô Phol", amount: 50000, date: "2 ngày trước", message: "Cảm ơn admin đã số hóa văn hóa Khmer" },
        { name: "Kim Thị Sa Rây", amount: 35000, date: "3 ngày trước", message: "Gửi tặng admin 1 tô bún nước lèo" },
        { name: "Lâm Thị Mỹ Duyên", amount: 20000, date: "5 ngày trước", message: "Cafe sáng vui vẻ nhé admin" }
    ]
};

export const DONATION_TIERS = [
    {
        id: "coffee",
        amount: 20000,
        name: "20K — Ly cà phê sữa đá",
        icon: "coffee",
        popular: false,
        desc: "Tiếp năng lượng code tính năng mới và kiểm tra tọa độ chùa Khmer dịp cuối tuần."
    },
    {
        id: "noodle",
        amount: 35000,
        name: "35K — Tô bún nước lèo",
        icon: "ramen_dining",
        popular: true,
        desc: "Hỗ trợ 2 ngày chi phí lưu trữ hình ảnh & bản đồ vệ tinh phục vụ khách du lịch."
    },
    {
        id: "hosting",
        amount: 100000,
        name: "100K — Duy trì hosting 1 tuần",
        icon: "dns",
        popular: false,
        desc: "Đóng góp duy trì hạ tầng vận hành mượt mà, chịu tải cao trong các mùa lễ hội Ok Om Bok."
    }
];

export const ADMIN_TECH_CLEARANCE = [
    {
        id: "ssd-1tb",
        name: "Ổ cứng di động SSD NVMe 1TB Kingston",
        price: 1250000,
        condition: "Like new 99% • Fullbox",
        desc: "Tốc độ đọc 1050MB/s, vỏ nhôm tản nhiệt cực tốt, chuyên backup ảnh chụp di tích Trà Vinh & source code ViVuTraVinh.",
        icon: "memory",
        image: "chùa âng.jpg"
    },
    {
        id: "keyboard-nuphy",
        name: "Bàn phím cơ không dây NuPhy Air75 v2",
        price: 1800000,
        condition: "98% • Switch Gateron Brown",
        desc: "Bàn phím cơ low-profile siêu mỏng nhẹ, pin trâu, tiện mang theo cafe vườn Trà Vinh gõ bài review địa điểm và code.",
        icon: "keyboard",
        image: ""
    },
    {
        id: "laptop-stand",
        name: "Giá đỡ laptop nhôm xoay 360°",
        price: 320000,
        condition: "Mới 100% nguyên seal",
        desc: "Hợp kim nhôm dày, chịu lực 10kg, tản nhiệt tốt cho Macbook & Laptop khi làm việc văn phòng hoặc di động.",
        icon: "laptop_mac",
        image: ""
    }
];

export const TRAVEL_GEAR_RECOMMENDATIONS = [
    {
        id: "phone-mount",
        name: "Giá đỡ điện thoại gắn ghi đông xe máy & xe đạp hợp kim nhôm",
        price: 165000,
        rating: "4.9 (3.4k đã bán)",
        desc: "Chắc chắn, chống rung tốt, an toàn khi vừa chạy xe vừa xem bản đồ địa phương ViVuTraVinh.",
        icon: "phone_iphone",
        link: "https://shopee.vn"
    },
    {
        id: "charging-cable",
        name: "Cáp sạc nhanh bọc dù 100W Baseus 1.2m siêu bền",
        price: 89000,
        rating: "4.8 (12k đã bán)",
        desc: "Bền bỉ chống đứt gãy, sạc nhanh điện thoại và flycam ngoài trời tiện lợi khi đi dài ngày.",
        icon: "cable",
        link: "https://shopee.vn"
    },
    {
        id: "thermos-bottle",
        name: "Bình nước giữ nhiệt inox 304 Nomad 750ml",
        price: 240000,
        rating: "4.9 (1.8k đã bán)",
        desc: "Giữ đá mát lạnh cả ngày khi đi bộ tham quan Ao Bà Om & vãn cảnh cụm Chùa Hang rợp bóng cây cổ thụ.",
        icon: "local_cafe",
        link: "https://shopee.vn"
    }
];

export const MODERATION_KPI = {
    pendingCount: 0,
    pendingNew: 0,
    flaggedCount: 0,
    approvedToday: 0,
    pointsIssued: 0,
    violationRate: "0%",
    pendingClubsCount: 0,
    eligibleClubsCount: 0,
    pendingPlacesCount: 0
};

export const INITIAL_PENDING_POSTS = [
    {
        id: "post-01",
        title: "Huyền tích về giếng nước và cây sao cổ thụ quanh Chùa Âng dưới góc nhìn người bản xứ",
        category: "Ký sự Văn hóa",
        categoryKey: "culture",
        timeAgo: "42 phút trước",
        status: "pending", // 'pending' | 'approved' | 'rejected' | 'needs_edit'
        aiSafeScore: 98,
        aiStatus: "AI Safe",
        aiSummary: "Đạt chuẩn an toàn (98/100). Không phát hiện từ ngữ kích động hoặc báng bổ văn hóa Phật giáo Nam tông Khmer. 4 ảnh độc bản. Tọa độ EXIF khớp Chùa Âng.",
        author: {
            name: "Thạch Sô Phol",
            verified: true,
            level: "Thành viên Cấp 4 • Bản địa",
            successRate: "96.5%",
            postsCount: 28,
            memberMonths: 14,
            avatar: "chùa âng.jpg"
        },
        excerpt: "Những cây sao hàng trăm năm tuổi bao bọc quần thể Ao Bà Ôm không chỉ là lá phổi xanh mà còn chứa đựng giai thoại lập chùa của tổ tiên người Khmer Trà Vinh...",
        fullContent: [
            "Nếu có dịp tản bộ vào buổi sớm sương còn đọng trên những tán sao dầu cổ thụ quanh thắng cảnh Ao Bà Ôm và Chùa Âng (tên Khmer là Wat Angkor Rajaborey), bạn sẽ cảm nhận được sự tĩnh lặng thoát tục. Ngôi chùa được xây dựng từ thế kỷ thứ 10, lưu giữ nét kiến trúc Angkor đặc trưng với các mái ngói chạm trổ hình rồng Naga uốn lượn sắc sảo.",
            "Đối với người Khmer chúng tôi, mỗi gốc cây cổ thụ nơi đây không chỉ tạo bóng mát sinh thái mà là chứng nhân cho bao mùa lễ hội Ok Om Bok linh thiêng. Nước trong ao quanh năm tĩnh lặng như tấm gương soi chiếu chánh điện uy nghi..."
        ],
        images: [
            { src: "chùa âng.jpg", caption: "Chánh điện Chùa Âng nhìn từ gốc sao cổ thụ số 42" },
            { src: "ao bà om.jpg", caption: "Bộ rễ kỳ vĩ của hàng sao ven bờ Ao Bà Ôm" }
        ],
        tags: ["#ChuaAng", "#AoBaOm", "#VanHoaKhmer", "#DiSanTraVinh", "#DuLichSinhThai"],
        location: {
            name: "Chùa Âng (Wat Angkor Rajaborey)",
            address: "Quốc lộ 53, Khóm 4, Phường 8, TP. Trà Vinh",
            coords: "9.9405° N, 106.3126° E"
        },
        readTime: "5 phút đọc",
        internalAuditNote: "Bài viết có chất lượng hình ảnh xuất sắc, góc nhìn chuẩn xác không lệch lạc về tích tích xưa của chùa. Xứng đáng trao tặng huy hiệu Đóng góp Bản địa và đẩy trang chủ."
    },
    {
        id: "post-02",
        title: "Cho thuê xe máy giá rẻ nhất Trà Vinh cam kết không cọc gọi ngay 0918xxxxxx",
        category: "Bài trải nghiệm",
        categoryKey: "review",
        timeAgo: "15 phút trước",
        status: "pending",
        aiSafeScore: 15,
        aiStatus: "AI Flagged: 85% Spam",
        aiSummary: "Cảnh báo nội dung: Chèn 4 liên kết cá độ trực tuyến, lặp từ khóa quảng cáo dịch vụ cho vay tín dụng không thuộc phạm trù du lịch.",
        author: {
            name: "Hoàng Tuấn Kiệt",
            verified: false,
            level: "Tài khoản mới tạo 2 ngày",
            successRate: "10%",
            postsCount: 1,
            memberMonths: 0,
            avatar: ""
        },
        excerpt: "Cảnh báo nội dung: Chèn 4 liên kết cá độ trực tuyến, lặp từ khóa quảng cáo dịch vụ cho vay tín dụng không thuộc phạm trù du lịch.",
        fullContent: [
            "Cho thuê xe máy đời mới không cần cọc tiền, giao tận nơi tại bến xe Trà Vinh. Hỗ trợ vay tiền mặt nhanh chóng không chứng minh thu nhập..."
        ],
        images: [],
        tags: ["#ThueXeMay", "#TraVinhGiaRe"],
        location: {
            name: "Bến xe Trà Vinh",
            address: "TP. Trà Vinh",
            coords: "9.9320° N, 106.3380° E"
        },
        readTime: "1 phút đọc",
        internalAuditNote: "Tài khoản spam link lặp lại. Cần chặn đề xuất và từ chối."
    },
    {
        id: "post-03",
        title: "Vườn Dừa Sáp Cầu Kè Ba Hùng - Trải nghiệm dừa thốt nốt tại vườn",
        category: "Địa điểm mới",
        categoryKey: "location",
        timeAgo: "1 giờ trước",
        status: "pending",
        aiSafeScore: 94,
        aiStatus: "GPS Verified",
        aiSummary: "GPS Verified. Tọa độ thực địa tại xã Tam Ngãi, Cầu Kè. Thông tin chi tiết giá vé và đường đi chuẩn xác.",
        author: {
            name: "Lâm Thị Mỹ Duyên",
            verified: true,
            level: "Đại sứ du lịch Cầu Kè",
            successRate: "92%",
            postsCount: 15,
            memberMonths: 8,
            avatar: "vuon co cu lao.png"
        },
        excerpt: "Đề xuất bổ sung điểm du lịch sinh thái miệt vườn tại Cầu Kè. Kèm đầy đủ giá vé tham quan, bản đồ chỉ dẫn đường bê tông 3m cho khách đoàn nhỏ.",
        fullContent: [
            "Vườn Dừa Sáp Ba Hùng tọa lạc tại ấp II, xã Tam Ngãi, huyện Cầu Kè. Đến đây du khách được tận tay hái dừa sáp, thưởng thức dừa dầm sữa đá béo ngậy và tham quan vườn cây ăn trái sum sê."
        ],
        images: [
            { src: "vuon co cu lao.png", caption: "Không gian vườn sinh thái rợp bóng dừa tại Cầu Kè" }
        ],
        tags: ["#DuaSapCauKe", "#DuLichMietVuon", "#TamNgai"],
        location: {
            name: "Vườn Dừa Sáp Ba Hùng",
            address: "Ấp II, Xã Tam Ngãi, Huyện Cầu Kè",
            coords: "9.8920° N, 106.0710° E"
        },
        readTime: "3 phút đọc",
        internalAuditNote: "Điểm đến tiềm năng hỗ trợ bà con nông dân Cầu Kè, thông tin giá cả minh bạch."
    },
    {
        id: "post-04",
        title: "Báo cáo bình luận: Tranh cãi quy chuẩn y phục tại Chánh điện Chùa Hang",
        category: "Bình luận báo cáo",
        categoryKey: "report",
        timeAgo: "2 giờ trước",
        status: "pending",
        aiSafeScore: 40,
        aiStatus: "Xâm phạm tôn nghiêm",
        aiSummary: "Cảnh báo xâm phạm tôn nghiêm: Bình luận có dấu hiệu công kích văn hóa trang phục địa phương khi du khách viếng chánh điện.",
        author: {
            name: "Báo cáo cộng đồng (3 lượt)",
            verified: false,
            level: "Nhiều thành viên phản ánh",
            successRate: "N/A",
            postsCount: 0,
            memberMonths: 0,
            avatar: ""
        },
        excerpt: "Bình luận từ người dùng @Nam_Phuot_99 có dấu hiệu công kích văn hóa địa phương khi du khách viếng chánh điện. Cần xem xét ẩn hoặc nhắc nhở.",
        fullContent: [
            "Bình luận bị khiếu nại: 'Đi chùa thôi mà làm gì khó khăn, mặc gì chả được sao cứ bắt quấn xà rông'. 3 thành viên bản địa đã nhấn báo cáo vi phạm quy chuẩn ứng xử nơi thờ tự linh thiêng."
        ],
        images: [
            { src: "chùa hang.jpg", caption: "Khuôn viên thanh tịnh tại Chùa Hang" }
        ],
        tags: ["#ChuaHang", "#QuyChuanYPhuc", "#BaoCaoViPham"],
        location: {
            name: "Chùa Hang (Wat Kompong Chrây)",
            address: "Khóm 4, Thị trấn Châu Thành",
            coords: "9.9189° N, 106.3115° E"
        },
        readTime: "1 phút đọc",
        internalAuditNote: "Cần ẩn bình luận kích động và gửi cảnh cáo nhẹ cho tài khoản theo điều khoản quy chuẩn ứng xử tôn nghiêm."
    }
];

export const INITIAL_PENDING_CLUBS = [
    {
        id: "club-pending-01",
        name: "CLB Nhiếp ảnh Di sản Khmer Xứ Trà",
        code: "#CLB-TV-092",
        category: "Di sản Khmer",
        categoryKey: "heritage",
        operatingHub: "TP. Trà Vinh, Châu Thành, Tiểu Cần (Khu vực Chùa Âng & Ao Bà Ôm)",
        timeAgo: "25 phút trước",
        status: "pending", // 'pending' | 'approved' | 'rejected' | 'needs_info'
        founder: {
            name: "Thạch Sô Phol",
            verified: true,
            level: "Trưởng nhóm • Cấp 4",
            cccdVerified: true,
            avatar: "chùa âng.jpg"
        },
        membersCount: 12,
        membersRequired: 10,
        progressPercent: 120,
        isEligible: true,
        desc: "Tập hợp các nhiếp ảnh gia và người đam mê kiến trúc Khmer, lưu giữ tư liệu văn hóa chùa chiền, lễ hội Ok Om Bok và Chôl Chnăm Thmây.",
        criteriaList: [
            { id: 1, title: "1. Tôn trọng không gian tôn giáo Khmer", desc: "Cam kết tuân thủ quy tắc chụp ảnh chánh điện, xin phép Ban Quản trị Chùa trước khi ghi hình nghi lễ và trang phục chuẩn mực của Phật giáo Nam tông Khmer.", passed: true },
            { id: 2, title: "2. Không xả rác & Bảo vệ cảnh quan", desc: "Mỗi buổi sáng tác ảnh kết hợp hoạt động thu gom rác thải sinh thái quanh Ao Bà Ôm và khuôn viên các di tích lịch sử - văn hóa.", passed: true },
            { id: 3, title: "3. Phi lợi nhuận & Minh bạch tài chính", desc: "Không tổ chức thu phí thương mại trái phép; các buổi workshop kỹ thuật ảnh được mở công khai và hoàn toàn miễn phí cho thanh thiếu niên Trà Vinh.", passed: true },
            { id: 4, title: "4. Uy tín Trưởng nhóm > 95%", desc: "Trưởng nhóm Thạch Sô Phol sở hữu tỷ lệ duyệt bài đạt 96.5%, không có lịch sử tranh chấp hoặc vi phạm quy chuẩn cộng đồng trong 14 tháng qua.", passed: true }
        ],
        threeMonthsPlan: [
            "Tháng 1: Offline chụp ảnh thực địa Lễ hội Ok Om Bok và Đua ghe Ngo tại sông Long Bình; hướng dẫn kỹ thuật góc máy văn hóa truyền thống cho thành viên mới.",
            "Tháng 2: Triển lãm ảnh nghệ thuật mini lưu động tại khuôn viên Ao Bà Ôm; kết hợp bán bưu ảnh di sản gây quỹ bảo tồn cây sao cổ thụ số 42.",
            "Tháng 3: Tổ chức cuộc thi ảnh online 'Nét đẹp Khmer trong đời thường' trên ứng dụng ViVuTraVinh, cấp huy hiệu và phần thưởng từ nguồn quỹ Xu Xứ Trà."
        ],
        notableFounders: [
            { name: "Thạch Sô Phol", role: "Trưởng nhóm • Cấp 4", verified: true, avatar: "chùa âng.jpg" },
            { name: "Lâm Thị Mỹ Duyên", role: "Phó nhóm • Đại sứ Cầu Kè", verified: true, avatar: "vuon co cu lao.png" },
            { name: "Trần Đăng Khoa", role: "Nhiếp ảnh gia TP. Trà Vinh", verified: false, avatar: "" }
        ],
        internalAuditNote: "Đề án thành lập CLB chuẩn bị rất bài bản, mục tiêu giữ gìn di sản Khmer phù hợp 100% định hướng văn hóa ViVuTraVinh. Đủ 12 thành viên thật, đủ điều kiện cấp Tích Xanh chính thức và giải ngân gói quỹ tài trợ 500 Xu ban đầu."
    },
    {
        id: "club-pending-02",
        name: "CLB Đạp Xe Xanh & Khám Phá Cù Lao Long Trị",
        code: "#CLB-TV-093",
        category: "Sinh thái & Thể thao",
        categoryKey: "sports",
        operatingHub: "TP. Trà Vinh & Cù Lao Long Trị (Xã Long Đức)",
        timeAgo: "1 giờ trước",
        status: "pending",
        founder: {
            name: "Nguyễn Văn Tiến",
            verified: true,
            level: "Trưởng nhóm • Cấp 3",
            cccdVerified: true,
            avatar: "chùa âng.jpg"
        },
        membersCount: 10,
        membersRequired: 10,
        progressPercent: 100,
        isEligible: true,
        desc: "Cộng đồng những người yêu thích xe đạp địa hình kết hợp du lịch miệt vườn sông nước, khảo sát các cung đường rợp bóng dừa tại Cù Lao Long Trị.",
        criteriaList: [
            { id: 1, title: "1. An toàn lộ trình thể thao", desc: "Trang bị đầy đủ mũ bảo hiểm, đồ cứu thương và khảo sát trước các đoạn đường đất cồn bãi.", passed: true },
            { id: 2, title: "2. Du lịch không rác thải", desc: "Mang theo bình nước cá nhân, không vứt túi nylon dọc các bờ kè sông Long Bình.", passed: true },
            { id: 3, title: "3. Hỗ trợ kinh tế nhà vườn bản địa", desc: "Ưu tiên dừng chân thưởng thức trái cây tại các hộ gia đình trồng dừa và bưởi Cù Lao.", passed: true },
            { id: 4, title: "4. Hoạt động định kỳ hàng tuần", desc: "Tổ chức đạp xe vào sáng Chủ nhật hàng tuần, cung đường trung bình 25km - 35km.", passed: true }
        ],
        threeMonthsPlan: [
            "Tháng 1: Khảo sát và gắn biển tọa độ QR 5 điểm dừng chân sinh thái mới tại Cù Lao Long Trị.",
            "Tháng 2: Giải đạp xe giao lưu 'Hành trình cây xanh Xứ Trà' phối hợp các CLB bạn tại Bến Tre và Vĩnh Long.",
            "Tháng 3: Workshop hướng dẫn sửa chữa và bảo dưỡng xe đạp đường dài miễn phí."
        ],
        notableFounders: [
            { name: "Nguyễn Văn Tiến", role: "Trưởng nhóm • Cấp 3", verified: true, avatar: "chùa âng.jpg" },
            { name: "Lê Hoàng Phúc", role: "Kỹ thuật viên xe đạp", verified: false, avatar: "" },
            { name: "Huỳnh Mai Phương", role: "Hậu cần • Cấp 2", verified: false, avatar: "" }
        ],
        internalAuditNote: "Hồ sơ đạt tiêu chuẩn 10 thành viên sáng lập, định hướng rèn luyện sức khỏe kết hợp bảo vệ môi trường rất thiết thực."
    },
    {
        id: "club-pending-03",
        name: "Hội Ẩm Thực Chay & Bánh Dân Gian Trà Vinh",
        code: "#CLB-TV-094",
        category: "Ẩm thực địa phương",
        categoryKey: "food",
        operatingHub: "Huyện Châu Thành & TP. Trà Vinh",
        timeAgo: "3 giờ trước",
        status: "pending",
        founder: {
            name: "Kim Thị Sa Rây",
            verified: false,
            level: "Trưởng nhóm • Cấp 2",
            cccdVerified: false,
            avatar: "bun nuoc leo.png"
        },
        membersCount: 6,
        membersRequired: 10,
        progressPercent: 60,
        isEligible: false,
        desc: "Bảo tồn và quảng bá công thức làm bánh tét Trà Cuôn, bánh ú, chè thốt nốt và các món ăn chay thanh tịnh gắn liền với phong tục chùa Khmer.",
        criteriaList: [
            { id: 1, title: "1. Vệ sinh an toàn thực phẩm", desc: "Cam kết nguồn nguyên liệu tự nhiên, không phẩm màu hóa học độc hại.", passed: true },
            { id: 2, title: "2. Quảng bá làng nghề truyền thống", desc: "Tôn vinh các nghệ nhân làm bánh tét Ba Khánh, Trà Cuôn gia truyền.", passed: true },
            { id: 3, title: "3. Tỷ lệ thành viên sáng lập", desc: "Hiện mới đạt 6/10 thành viên hợp lệ (cần thêm 4 thành viên xác thực).", passed: false },
            { id: 4, title: "4. Hoạt động phi thương mại", desc: "Chủ yếu trao đổi kinh nghiệm ẩm thực, không thu phí trái phép.", passed: true }
        ],
        threeMonthsPlan: [
            "Tháng 1: Tuyển mộ thêm 4 thành viên nòng cốt để hoàn thiện tiêu chuẩn thành lập.",
            "Tháng 2: Tổ chức ngày hội gói bánh tét Trà Cuôn đón Tết cổ truyền.",
            "Tháng 3: Biên soạn cẩm nang '20 món chay thanh đạm chùa Khmer' đăng tải trên ViVuTraVinh."
        ],
        notableFounders: [
            { name: "Kim Thị Sa Rây", role: "Trưởng nhóm • Cấp 2", verified: false, avatar: "bun nuoc leo.png" },
            { name: "Trần Kim Ngân", role: "Thành viên nòng cốt", verified: false, avatar: "" }
        ],
        internalAuditNote: "Ý tưởng xuất sắc nhưng hồ sơ chưa đủ 10 thành viên sáng lập theo quy chế. Cần giữ trạng thái đang ấp ủ và nhắc nhở tuyển thêm 4 người."
    }
];

const MODERATION_POSTS_STORAGE_KEY = 'vivu_admin_moderation_posts';
const MODERATION_CLUBS_STORAGE_KEY = 'vivu_admin_moderation_clubs';
const MODERATION_EVENTS_STORAGE_KEY = 'vivu_admin_moderation_events';
const DONATION_RECORDS_STORAGE_KEY = 'vivu_admin_donation_records';

/**
 * Lấy danh sách bài viết kiểm duyệt từ LocalStorage (mặc định mảng rỗng, không fallback dữ liệu mẫu)
 */
export function getStoredModerationPosts() {
    try {
        const raw = localStorage.getItem(MODERATION_POSTS_STORAGE_KEY);
        if (raw !== null) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        }
    } catch (e) {
        console.warn('Lỗi đọc moderation posts:', e);
    }
    return [];
}

/**
 * Lưu danh sách bài viết kiểm duyệt vào LocalStorage
 */
export function saveStoredModerationPosts(posts) {
    try {
        localStorage.setItem(MODERATION_POSTS_STORAGE_KEY, JSON.stringify(posts));
    } catch (e) {
        console.warn('Lỗi lưu moderation posts:', e);
    }
}

/**
 * Lấy danh sách CLB kiểm duyệt từ LocalStorage (mặc định mảng rỗng, không fallback dữ liệu mẫu)
 */
export function getStoredModerationClubs() {
    try {
        const raw = localStorage.getItem(MODERATION_CLUBS_STORAGE_KEY);
        if (raw !== null) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        }
    } catch (e) {
        console.warn('Lỗi đọc moderation clubs:', e);
    }
    return [];
}

/**
 * Lưu danh sách CLB kiểm duyệt vào LocalStorage
 */
export function saveStoredModerationClubs(clubs) {
    try {
        localStorage.setItem(MODERATION_CLUBS_STORAGE_KEY, JSON.stringify(clubs));
    } catch (e) {
        console.warn('Lỗi lưu moderation clubs:', e);
    }
}

/**
 * Lấy danh sách Sự kiện kiểm duyệt từ LocalStorage (mặc định mảng rỗng)
 */
export function getStoredModerationEvents() {
    try {
        const raw = localStorage.getItem(MODERATION_EVENTS_STORAGE_KEY);
        if (raw !== null) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        }
    } catch (e) {
        console.warn('Lỗi đọc moderation events:', e);
    }
    return [];
}

/**
 * Lưu danh sách Sự kiện kiểm duyệt vào LocalStorage
 */
export function saveStoredModerationEvents(events) {
    try {
        localStorage.setItem(MODERATION_EVENTS_STORAGE_KEY, JSON.stringify(events));
    } catch (e) {
        console.warn('Lỗi lưu moderation events:', e);
    }
}

/**
 * Lấy danh sách các giao dịch ủng hộ từ LocalStorage
 */
export function getStoredDonationRecords() {
    try {
        const raw = localStorage.getItem(DONATION_RECORDS_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        }
    } catch (e) {
        console.warn('Lỗi đọc donation records:', e);
    }
    return [...PROJECT_FINANCIAL_REPORT.recentSupporters];
}

/**
 * Lưu danh sách các giao dịch ủng hộ vào LocalStorage
 */
export function saveStoredDonationRecords(records) {
    try {
        localStorage.setItem(DONATION_RECORDS_STORAGE_KEY, JSON.stringify(records));
    } catch (e) {
        console.warn('Lỗi lưu donation records:', e);
    }
}

/**
 * Thêm giao dịch ủng hộ mới
 */
export function addDonationRecord(record) {
    const records = getStoredDonationRecords();
    records.unshift(record);
    try {
        localStorage.setItem(DONATION_RECORDS_STORAGE_KEY, JSON.stringify(records));
    } catch (e) {
        console.warn('Lỗi lưu donation record:', e);
    }
    return records;
}
