/**
 * place-detail-data.js - Dữ liệu chi tiết địa điểm di sản chuyên sâu (Deep Cultural Heritage)
 * và Thư mục hành trình đã lưu (Saved Itinerary Folder Detail) - ViVuTraVinh Phase 11.
 * Tuân thủ 100% Zero-CDN: hình ảnh nội bộ, dữ liệu bản địa chuẩn xác.
 */

export const DEEP_HERITAGE_PLACES = {
    "chua-ang": {
        id: "chua-ang",
        name: "Chùa Âng",
        nativeName: "វត្តអង្គររាជបុរី (Wat Angkor Rajaborey)",
        establishedYear: 990,
        establishedText: "Thành lập năm 990 (Hơn 1000 năm)",
        heritageRank: "Di tích Lịch sử - Văn hóa Quốc gia",
        rankBadge: "Xếp hạng #1 Chùa Khmer tại Trà Vinh",
        category: "Chùa cổ Khmer",
        categoryKey: "pagoda",
        rating: 4.9,
        reviewsCount: 386,
        ratingBreakdown: {
            fiveStar: 92,
            fourStar: 6,
            threeStar: 2
        },
        address: "Khóm 4, Phường 8, TP. Trà Vinh (Liền kề thắng cảnh Ao Bà Om)",
        district: "TP. Trà Vinh",
        distanceKm: "2.8 km từ trung tâm TP. Trà Vinh",
        openHours: "06:00 - 18:00 (Mỗi ngày)",
        ticketPrice: "Miễn phí hoàn toàn",
        suggestedDuration: "1.5 - 2.0 giờ",
        parking: "Có (Xe máy, Ô tô 45 chỗ)",
        coordinates: "9.9405° N, 106.3126° E",
        mapQuery: "Chua+Ang+Tra+Vinh",
        weather: {
            temp: "29°C",
            desc: "Nắng nhẹ ráo trời",
            note: "Lý tưởng viếng chùa"
        },
        heroImage: "chùa âng.jpg",
        photos: [
            {
                src: "chùa âng.jpg",
                title: "Chánh điện kiến trúc Angkor lộng lẫy",
                tag: "Toàn cảnh khuôn viên",
                desc: "Chánh điện uy nghi với hệ mái 3 tầng uốn cong hình rồng Naga soi bóng dưới tàng sao cổ thụ."
            },
            {
                src: "chùa âng.jpg",
                title: "Bích họa Phật tích nội điện",
                tag: "Bích họa cổ",
                desc: "Chuỗi bích họa rực rỡ khắc họa con đường tu tập từ thái tử Tất Đạt Đa đến Niết bàn."
            },
            {
                src: "chùa hang.jpg",
                title: "Tượng Thần chim Krud & Rồng Naga",
                tag: "Điêu khắc thiêng",
                desc: "Các đầu cột hiên đỡ trần nâng đỡ mái chùa bằng hình tượng chim thần Krud dang cánh."
            },
            {
                src: "ao bà om.jpg",
                title: "Rừng cây sao dầu cổ thụ trăm tuổi",
                tag: "Cảnh quan sinh thái",
                desc: "Hàng trăm gốc sao dầu đại thụ với bộ rễ kỳ vĩ bao quanh hồ nước thanh tịnh."
            },
            {
                src: "chùa âng.jpg",
                title: "Lối tản bộ & Thiền tịnh chư tăng",
                tag: "Sinh hoạt tôn giáo",
                desc: "Hành lang rợp bóng mát nơi các sư thầy và thiện nam tín nữ tịnh tâm chiêm bái."
            }
        ],
        totalPhotosCount: 48,
        audioGuide: {
            id: "audio-chua-ang-01",
            title: "Thuyết minh huyền tích Chùa Âng ngàn năm",
            narrator: "Nhà nghiên cứu văn hóa Khmer Thạch Chanh Đa",
            duration: "04:45",
            durationSeconds: 285,
            currentTime: "01:24",
            sampleRate: "48kHz Hi-Fi",
            transcript: "Chùa Âng, tên gốc là Wat Angkor Rajaborey, được khởi dựng vào cuối thế kỷ thứ 10. Đây là trái tim tâm linh của đồng bào Khmer Trà Vinh qua bao thế kỷ thăng trầm...",
            visualizerBars: [12, 24, 16, 28, 20, 14, 26, 32, 18, 22, 30, 15, 25, 34, 19, 21, 27, 33, 17, 23]
        },
        historyMilestones: [
            {
                year: "Năm 990",
                desc: "Khởi dựng ban đầu bằng tre lá mộc mạc giữa rừng sao nguyên sinh."
            },
            {
                year: "Năm 1842",
                desc: "Đại trùng tu quy mô bằng gỗ quý, gạch ngói và bích họa nghệ thuật Angkor."
            },
            {
                year: "Năm 1994",
                desc: "Bộ Văn hóa xếp hạng Di tích Lịch sử - Kiến trúc Nghệ thuật cấp Quốc gia."
            }
        ],
        historyOverview: [
            "Chùa Âng, tên gốc theo tiếng Khmer là Wat Angkor Rajaborey, tọa lạc trong khuôn viên quần thể danh thắng Ao Bà Om. Đây là ngôi chùa cổ kính tiêu biểu và thiêng liêng bậc nhất trong hệ thống hơn 140 ngôi chùa Khmer tại tỉnh Trà Vinh.",
            "Theo thư tịch cổ, ngôi chùa được khởi công tạo dựng từ năm 990 sau Công nguyên. Trải qua hơn 10 thế kỷ với nhiều biến thiên thăng trầm, chùa được đại trùng tu vào năm 1842 theo lối kiến trúc độc đáo giao thoa giữa nghệ thuật tạo hình thời kỳ hoàng kim Angkor và tinh thần Phật giáo Nam tông (Theravada). Ngôi chùa không chỉ là trung tâm sinh hoạt tín ngưỡng tôn giáo mà còn là trường học bảo tồn văn tự Khmer cổ, âm nhạc ngũ âm và nghệ thuật múa thiêng Ro Bam."
        ],
        architecturalHighlights: [
            {
                id: "arch-1",
                icon: "roofing",
                title: "Mái vòm rồng Naga",
                desc: "Hệ mái chùa gồm 3 tầng lớp chồng lên nhau, các góc mái vuốt cong vút thành đuôi rồng Naga dũng mãnh, xua đuổi tà khí và che chở thiện nam tín nữ."
            },
            {
                id: "arch-2",
                icon: "qr_code_2",
                title: "Thần chim Krud & Chằn Yeak",
                desc: "Các đầu cột hiên được đỡ bằng tượng Thần chim Krud dang rộng hai cánh nâng trần, cùng các hộ pháp Yeak hung tợn đã được cảm hóa để bảo vệ cửa chùa."
            },
            {
                id: "arch-3",
                icon: "palette",
                title: "Bích họa Phật tích",
                desc: "Bốn mặt tường chánh điện là chuỗi bích họa rực rỡ khắc họa con đường tu tập từ thái tử Tất Đạt Đa từ bỏ hoàng cung đến lúc nhập Niết bàn tịch diệt."
            }
        ],
        specialistQuote: {
            quote: "Chùa Âng không chỉ là một ngôi chùa, đây là bảo tàng sống động nơi lưu giữ những mẫu mực điêu khắc cổ xưa tinh hoa nhất của người Khmer đồng bằng sông Cửu Long.",
            author: "Thạch Sô Phol • Chuyên gia nghiên cứu Văn hóa Khmer Trà Vinh"
        },
        culturalEtiquettes: [
            {
                icon: "check_circle",
                title: "Trang phục kín đáo, lịch thiệp",
                desc: "Mặc áo có tay, quần hoặc váy dài qua đầu gối. Tránh đồ bó sát hoặc áo ba lỗ."
            },
            {
                icon: "do_not_step",
                title: "Tháo giày dép trước khi vào chánh điện",
                desc: "Đặt giày dép ngay ngắn ở kệ ngoài bậc tam cấp theo hướng dẫn của ban quản trị."
            },
            {
                icon: "volume_off",
                title: "Giữ thanh tịnh và nói khẽ",
                desc: "Tắt chuông điện thoại di động, không cười đùa lớn tiếng làm gián đoạn khóa thiền của chư tăng."
            },
            {
                icon: "camera",
                title: "Lưu ý khi chụp ảnh kỷ niệm",
                desc: "Không đứng quay lưng về tượng Phật chính để tạo dáng phản cảm. Tắt đèn flash chiếu vào bích họa cổ."
            }
        ],
        insiderTips: [
            {
                num: "01",
                title: "Thời khắc đẹp nhất",
                desc: "Hãy ghé thăm từ 06:30 - 08:30 sáng để đón những tia nắng sớm xuyên qua sương mờ trong rừng sao cổ thụ, hoặc từ 16:00 - 17:30 khi ánh tà dương dát vàng mái chùa."
            },
            {
                num: "02",
                title: "Dịp lễ hội náo nhiệt",
                desc: "Lễ hội Ok Om Bok (Rằm tháng 10 Âm lịch), Tết cổ truyền Chôl Chnăm Thmây (tháng 4 Dương lịch) và Sene Dolta (tháng 8-9 Âm lịch) là những dịp chùa rực rỡ cờ hoa, đàn ca múa hát suốt đêm ngày."
            },
            {
                num: "03",
                title: "Kết hợp dạo bộ",
                desc: "Chỉ cần bước bộ qua bờ hào là đến ngay Ao Bà Om và Bảo tàng Văn hóa Khmer trong bán kính chưa tới 300 mét."
            }
        ],
        reviews: [
            {
                id: "rev-01",
                author: "Nguyễn Mai Phương",
                location: "Hà Nội • Đã đến vào tháng 2/2026",
                avatar: "chùa âng.jpg",
                rating: 5,
                comment: "Không khí ở Chùa Âng tĩnh mịch và thanh bình vô cùng. Cây sao dầu cổ thụ to mấy người ôm, rễ trồi lên mặt đất như những bức tượng điêu khắc tự nhiên. Bước chân vào chánh điện mùi nhang trầm thoang thoảng làm lòng nhẹ nhõm hẳn."
            },
            {
                id: "rev-02",
                author: "Lê Hoàng Quân",
                location: "TP. Hồ Chí Minh • Đã đến vào dịp Tết Khmer",
                avatar: "vuon co cu lao.png",
                rating: 5,
                comment: "Kiến trúc Khmer ở đây là đỉnh cao nhất mình từng thấy tại Tây Nam Bộ. Các tượng thần Krud chống mái chùa quá tinh xảo. Du khách nhớ mặc đồ dài nhé, các sư thầy rất thân thiện và sẵn sàng chia sẻ nguồn gốc của các bức bích họa cổ."
            },
            {
                id: "rev-03",
                author: "Thạch Kim Sương",
                location: "Tiểu Cần, Trà Vinh • Thành viên bản địa",
                avatar: "chùa hang.jpg",
                rating: 5,
                comment: "Là người con Khmer lớn lên bên tiếng chuông Chùa Âng, tôi luôn tự hào giới thiệu di tích ngàn năm này với bạn bè bốn phương. Hãy nghe thuyết minh audio để cảm nhận sâu sắc huyền tích lập chùa."
            }
        ],
        nearbyPlaces: [
            {
                name: "Thắng cảnh Ao Bà Om",
                category: "Danh thắng sinh thái",
                distance: "50m • 1 phút đi bộ",
                image: "ao bà om.jpg"
            },
            {
                name: "Bảo tàng Văn hóa Khmer Trà Vinh",
                category: "Bảo tàng & Di sản",
                distance: "250m • 3 phút đi bộ",
                image: "chùa âng.jpg"
            },
            {
                name: "Chùa Lò Gạch (Wat Sambour)",
                category: "Chùa cổ Khmer",
                distance: "600m • 8 phút đi bộ",
                image: "chùa hang.jpg"
            }
        ],
        nearbyFood: [
            {
                name: "Bún nước lèo Cô Ba Ao Bà Om",
                desc: "Nước lèo mắm bò hóc thơm lừng, thịt heo quay giòn bì",
                distance: "Cách 120m",
                image: "bun nuoc leo.png"
            },
            {
                name: "Dừa sáp dầm đá Cầu Kè Ba Hùng",
                desc: "Dừa sáp béo ngậy ăn kèm đậu phộng rang giòn",
                distance: "Cách 300m",
                image: "vuon co cu lao.png"
            }
        ]
    },

    "ao-ba-om": {
        id: "ao-ba-om",
        name: "Ao Bà Om",
        nativeName: "ស្រះគូ (Srah Ku - Ao Vuông)",
        establishedYear: 1000,
        establishedText: "Thắng cảnh danh thắng cấp Quốc gia từ 1994",
        heritageRank: "Danh lam Thắng cảnh Quốc gia",
        rankBadge: "Lá phổi xanh & Trung tâm Lễ hội Trà Vinh",
        category: "Danh thắng sinh thái",
        categoryKey: "nature",
        rating: 4.8,
        reviewsCount: 420,
        ratingBreakdown: { fiveStar: 90, fourStar: 8, threeStar: 2 },
        address: "Khóm 4, Phường 8, TP. Trà Vinh",
        district: "TP. Trà Vinh",
        distanceKm: "2.7 km từ trung tâm TP. Trà Vinh",
        openHours: "Cả ngày (Lý tưởng 05:30 - 21:00)",
        ticketPrice: "Miễn phí hoàn toàn",
        suggestedDuration: "1.0 - 2.0 giờ",
        parking: "Có bãi xe máy & ô tô rộng rãi",
        coordinates: "9.9412° N, 106.3130° E",
        mapQuery: "Ao+Ba+Om+Tra+Vinh",
        weather: { temp: "29°C", desc: "Gió mát rượi ven hồ", note: "Rất thích hợp dạo bộ" },
        heroImage: "ao bà om.jpg",
        photos: [
            { src: "ao bà om.jpg", title: "Mặt hồ phẳng lặng Ao Bà Om", tag: "Cảnh quan chính", desc: "Hồ nước ngọt vuông vắn với hoa sen hoa súng nở rộ bốn mùa." },
            { src: "chùa âng.jpg", title: "Bóng Chùa Âng kề bên hồ", tag: "Di tích liền kề", desc: "Quần thể di tích văn hóa - sinh thái độc nhất vô nhị." }
        ],
        totalPhotosCount: 36,
        audioGuide: {
            id: "audio-ao-ba-om-01",
            title: "Sự tích thi đào ao giữa phái nam và phái nữ",
            narrator: "Nghệ nhân dân gian Thạch Chanh Đa",
            duration: "03:50",
            durationSeconds: 230,
            currentTime: "00:45",
            sampleRate: "48kHz Hi-Fi",
            transcript: "Ngày xưa để giải quyết tranh chấp quyền cầu hôn, bà Om đã lãnh đạo phái nữ mưu trí thắp đèn lừa phái nam...",
            visualizerBars: [14, 20, 28, 16, 22, 30, 24, 18, 26, 32, 15, 25, 29, 17, 21, 27, 31, 19, 23, 16]
        },
        historyMilestones: [
            { year: "Thế kỷ X", desc: "Gắn liền huyền thoại bà Om lãnh đạo đào ao tích trữ nước ngọt." },
            { year: "Năm 1994", desc: "Được công nhận Di tích Danh lam thắng cảnh cấp Quốc gia." }
        ],
        historyOverview: [
            "Ao Bà Om là hồ nước ngọt hình chữ nhật dài khoảng 500m, rộng 300m, được bao bọc bởi hàng trăm cây sao dầu cổ thụ có tuổi thọ hàng trăm năm. Tương truyền ngày xưa, để quyết định tục lệ cưới hỏi (bên nào cưới bên nào), một cuộc thi đào hồ trong một đêm giữa phái nam và phái nữ đã diễn ra. Nhờ mưu trí thắp lồng đèn trên ngọn cây sao làm cánh đàn ông tưởng sao mai đã mọc nên nghỉ sớm, phái nữ do bà Om chỉ huy đã hoàn thành xong trước ao nước ngọt vuông vắn này.",
            "Ngày nay, Ao Bà Om là nơi diễn ra lễ hội Ok Om Bok lớn nhất đồng bằng sông Cửu Long, thu hút hàng chục vạn đồng bào và du khách thập phương tụ hội dâng cúng trăng và thả đèn hoa đăng lung linh."
        ],
        architecturalHighlights: [
            { id: "ao-1", icon: "forest", title: "Hàng sao dầu đại thụ", desc: "Bộ rễ trồi lên mặt đất uốn lượn thành muôn hình vạn trạng như hang động kỳ vĩ." },
            { id: "ao-2", icon: "water_drop", title: "Hồ sen thanh tịnh", desc: "Lá sen bạt ngàn đón ánh nắng ban mai và hương sen ngan ngát gió đồng." },
            { id: "ao-3", icon: "festival", title: "Quảng trường Lễ hội Ok Om Bok", desc: "Không gian tổ chức các trò chơi dân gian, đập nồi, kéo co và thả hoa đăng." }
        ],
        specialistQuote: {
            quote: "Ao Bà Om là linh hồn sinh thái và văn hóa của Trà Vinh. Ai đến Trà Vinh mà chưa ghé Ao Bà Om thì xem như chưa đặt chân đến xứ Trà.",
            author: "Thạch Sô Phol • Hướng dẫn viên Bản địa"
        },
        culturalEtiquettes: [
            { icon: "delete", title: "Giữ gìn vệ sinh môi trường", desc: "Bỏ rác đúng nơi quy định, không xả rác xuống lòng hồ hoặc gốc cây sao." },
            { icon: "nature_people", title: "Bảo vệ rễ cây đại thụ", desc: "Không leo trèo bẻ cành hoặc khắc chữ lên thân rễ các cây cổ thụ." }
        ],
        insiderTips: [
            { num: "01", title: "Thưởng thức bún nước lèo ven ao", desc: "Các quán bún nước lèo rải rác dưới tàng cây sao rất thơm ngon và đậm vị." },
            { num: "02", title: "Dạo hồ lúc bình minh", desc: "Không khí ban mai trong lành, mát dịu và ánh sáng chụp ảnh tuyệt đẹp." }
        ],
        reviews: [],
        nearbyPlaces: [],
        nearbyFood: []
    }
};

/**
 * Dữ liệu chi tiết Thư mục Hành trình đã lưu (Saved Itinerary Folder Detail)
 */
export const SAVED_ITINERARY_FOLDER_DETAIL = {
    id: "folder-heritage-01",
    name: "Hành trình viếng Chùa Khmer & Ẩm thực Xứ Trà",
    tagline: "Lộ trình khám phá di sản tâm linh & văn hóa dân gian",
    offlineReady: true,
    offlineSize: "18MB",
    duration: "1 Ngày (07:00 - 18:30)",
    stopsCount: 4,
    totalDistance: "~12.5 km",
    creator: "Trần Tiến • 25/10/2026",
    description: "Cung đường dạo bộ và đạp xe qua các ngôi chùa cổ trăm năm tuổi quanh quần thể thắng cảnh Ao Bà Om, thưởng thức bún nước lèo Cô Ba đậm đà và đón hoàng hôn tại Chùa Hang.",
    optimizationSummary: "Lộ trình đã được AI Route tối ưu hóa: tiết kiệm 2.4 km và 25 phút di chuyển liên chặng.",
    stops: [
        {
            id: "folder-stop-01",
            order: 1,
            placeId: "chua-ang",
            name: "Chùa Âng (Wat Angkor Rajaborey)",
            category: "Chùa cổ Khmer",
            timeWindow: "07:00 - 09:00",
            durationMinutes: 120,
            image: "chùa âng.jpg",
            tag: "Di tích Quốc gia",
            hasAudioGuide: true,
            note: "Viếng chánh điện ngàn năm, chiêm ngưỡng bích họa Phật tích và nghe audio thuyết minh bản địa.",
            transferToNext: {
                mode: "directions_walk",
                modeLabel: "Đi bộ",
                distance: "300m",
                time: "3 phút dạo bộ qua bờ hào"
            }
        },
        {
            id: "folder-stop-02",
            order: 2,
            placeId: "ao-ba-om",
            name: "Thắng cảnh Ao Bà Om",
            category: "Danh lam thắng cảnh",
            timeWindow: "09:00 - 10:30",
            durationMinutes: 90,
            image: "ao bà om.jpg",
            tag: "Thắng cảnh Quốc gia",
            hasAudioGuide: true,
            note: "Dạo quanh hồ sen, ngắm bộ rễ kỳ vĩ của hàng sao cổ thụ trăm năm tuổi.",
            transferToNext: {
                mode: "directions_walk",
                modeLabel: "Đi bộ",
                distance: "150m",
                time: "2 phút sang hàng quán ven hồ"
            }
        },
        {
            id: "folder-stop-03",
            order: 3,
            placeId: "bun-nuoc-leo-coba",
            name: "Bún nước lèo Cô Ba Ao Bà Om",
            category: "Ẩm thực địa phương",
            timeWindow: "11:00 - 12:30",
            durationMinutes: 90,
            image: "bun nuoc leo.png",
            tag: "Món ngon Xứ Trà",
            hasAudioGuide: false,
            note: "Thưởng thức bún nước lèo mắm bò hóc trứ danh ăn kèm rau muống bào và huyết mềm ngọt.",
            transferToNext: {
                mode: "pedal_bike",
                modeLabel: "Xe đạp",
                distance: "4.2 km",
                time: "18 phút đạp xe bóng dừa"
            }
        },
        {
            id: "folder-stop-04",
            order: 4,
            placeId: "chua-hang",
            name: "Chùa Hang (Wat Kompong Chrây)",
            category: "Chùa cổ & Làng nghề",
            timeWindow: "15:00 - 17:30",
            durationMinutes: 150,
            image: "chùa hang.jpg",
            tag: "Làng điêu khắc gỗ",
            hasAudioGuide: true,
            note: "Chiêm ngưỡng cổng chùa hình hang độc đáo, đàn chim về tổ và thăm xưởng khắc gỗ nghệ thuật của các nghệ nhân Khmer.",
            transferToNext: null
        }
    ]
};

const DEEP_PLACES_STORAGE_KEY = 'vivu_deep_places_cache';
const ITINERARY_FOLDER_STORAGE_KEY = 'vivu_saved_itinerary_folder';

/**
 * Lấy chi tiết chuyên sâu của địa điểm
 */
export function getDeepPlaceDetail(placeId) {
    if (!placeId) placeId = 'chua-ang';
    if (DEEP_HERITAGE_PLACES[placeId]) {
        return DEEP_HERITAGE_PLACES[placeId];
    }
    // Fallback: trả về Chùa Âng
    return DEEP_HERITAGE_PLACES['chua-ang'];
}

/**
 * Lấy thông tin chi tiết thư mục hành trình đã lưu
 */
export function getSavedItineraryFolderDetail(folderId) {
    try {
        const raw = localStorage.getItem(ITINERARY_FOLDER_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.stops) return parsed;
        }
    } catch (e) {
        console.warn('Lỗi đọc itinerary folder:', e);
    }
    return JSON.parse(JSON.stringify(SAVED_ITINERARY_FOLDER_DETAIL));
}

/**
 * Lưu thông tin thư mục hành trình
 */
export function saveSavedItineraryFolderDetail(folderData) {
    try {
        localStorage.setItem(ITINERARY_FOLDER_STORAGE_KEY, JSON.stringify(folderData));
    } catch (e) {
        console.warn('Lỗi lưu itinerary folder:', e);
    }
}
