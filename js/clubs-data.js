// ViVuTraVinh - Dữ Liệu Câu Lạc Bộ & Hoạt Động Cộng Đồng Xứ Trà (Phase 5)
// Tích hợp theo chuẩn Stitch Design System: CLB, Hoạt động trong tuần, Thảo luận & Quy tắc cộng đồng

// Danh sách Câu Lạc Bộ (Được tạo động từ hệ thống / người dùng)
export const TRA_VINH_CLUBS = [];

// Danh sách Hoạt Động Trong Tuần (Được tạo động từ hệ thống / người dùng)
export const TRA_VINH_WEEKLY_ACTIVITIES = [];

// Bảng tin Thảo Luận Cộng Đồng (Được đăng bài trực tiếp từ người dùng)
export const TRA_VINH_COMMUNITY_POSTS = [];

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
    { id: 'all', label: 'Tất cả', icon: 'groups', count: 0 },
    { id: 'di-san', label: 'Nhiếp ảnh & Di sản', icon: 'photo_camera', count: 0 },
    { id: 'da-ngoai', label: 'Đạp xe & Dã ngoại', icon: 'pedal_bike', count: 0 },
    { id: 'am-thuc', label: 'Ẩm thực xứ Trà', icon: 'restaurant', count: 0 },
    { id: 'the-thao', label: 'Thể thao & Sức khỏe', icon: 'directions_run', count: 0 },
    { id: 'nghe-thuat', label: 'Nghệ thuật & Dân gian', icon: 'music_note', count: 0 }
];

export const COMMUNITY_FEED_FILTERS = [
    { id: 'all', label: 'Tất cả bài viết' },
    { id: 'featured', label: 'Thảo luận nổi bật' },
    { id: 'upcoming', label: 'Chuyến đi sắp tới' },
    { id: 'photos', label: 'Hình ảnh mới' }
];
