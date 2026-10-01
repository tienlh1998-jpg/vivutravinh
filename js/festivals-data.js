// ViVuTraVinh - Dữ Liệu Sự Kiện & Lễ Hội Văn Hóa Trà Vinh
// Hỗ trợ Countdown Timer, Timeline diễn biến và Cẩm nang du lịch theo mùa lễ hội

export const TRA_VINH_FESTIVALS = [
    {
        id: 'ok-om-bok',
        name: 'Đại Lễ Ok Om Bok (Lễ Cúng Trăng)',
        originalName: 'ពិធីបុណ្យអកអំបុក (Bon Ok Om Bok)',
        season: 'winter',
        seasonName: 'Mùa Đông',
        badge: 'Di Sản Văn Hóa Phi Vật Thể Quốc Gia',
        lunarDate: 'Rằm tháng 10 Âm lịch (14 – 15/10 Âm lịch)',
        solarDateEstimate: 'Khoảng giữa đến cuối tháng 11 Dương lịch',
        targetDate: '2026-11-24T18:00:00+07:00', // Mục tiêu đếm ngược Ok Om Bok 2026
        locationName: 'Danh thắng Ao Bà Om & Sông Long Bình, TP. Trà Vinh',
        locationPlaceId: 'ao-ba-om', // id trong places
        heroImage: '/ao bà om.jpg',
        badgeColor: 'bg-amber-500 text-white',
        summary: 'Lễ hội lớn nhất và rực rỡ nhất trong năm của đồng bào Khmer Nam Bộ tại Trà Vinh. Du khách sẽ hòa mình vào hội đua ghe Ngo dậy sóng sông Long Bình, lễ Cúng Trăng đút cốm dẹp thiêng liêng và thả hàng ngàn đèn hoa đăng lung linh trên mặt hồ Ao Bà Om.',
        significance: 'Tạ ơn Thần Mặt Trăng (Preah Chan) - vị thần bảo trợ mùa màng nông nghiệp, nguồn nước và sự sinh sôi nảy nở. Đánh dấu thời điểm kết thúc năm canh tác nông nghiệp cổ truyền.',
        timeline: [
            {
                time: '08:00 – Ngày 14/10 ÂL',
                title: 'Khai Mạc Hội Chợ Thương Mại & Ẩm Thực Xứ Trà',
                desc: 'Hàng trăm gian hàng đặc sản OCOP, biểu diễn nhạc ngũ âm Pinpeat và múa dân gian Khmer tại khuôn viên Ao Bà Om.',
                icon: 'storefront'
            },
            {
                time: '11:30 – Ngày 14/10 ÂL',
                title: 'Khai Mạc Giải Đua Ghe Ngo Trà Vinh (Vòng Loại)',
                desc: 'Hàng chục đội ghe Ngo nam nữ đến từ các chùa Khmer trong tỉnh và các tỉnh lân cận tranh tài sôi nổi trên sông Long Bình.',
                icon: 'sailing'
            },
            {
                time: '13:00 – Ngày 15/10 ÂL',
                title: 'Chung Kết Đua Ghe Ngo & Trao Cúp Vô Địch',
                desc: 'Các trận đua tốc độ nghẹt thở giữa tiếng hò reo cổ vũ cuồng nhiệt của hàng vạn người dân dọc hai bờ kè sông Long Bình.',
                icon: 'emoji_events'
            },
            {
                time: '19:30 – Ngày 15/10 ÂL',
                title: 'Đại Lễ Cúng Trăng & Nghi Thức Đút Cốm Dẹp (Ak Ambok)',
                desc: 'Các vị chư tăng và chức sắc cử hành nghi lễ tạ ơn Mặt Trăng. Người lớn tuổi đút từng bụm cốm dẹp trộn dừa thốt nốt cho trẻ em vỗ lưng hỏi ước nguyện tương lai.',
                icon: 'brightness_5'
            },
            {
                time: '21:00 – Ngày 15/10 ÂL',
                title: 'Hội Thả Đèn Hoa Đăng (Lôi Protip) & Thả Đèn Gió',
                desc: 'Hàng ngàn chiếc thuyền đèn hoa đăng lấp lánh trôi nhẹ trên mặt nước Ao Bà Om; những chiếc đèn gió khổng lồ bay vút lên bầu trời đêm huyền diệu.',
                icon: 'local_fire_department'
            }
        ],
        // Cấu trúc nâng cao Stitch: 2 ngày diễn biến chi tiết
        timelineDays: {
            day1: {
                label: 'Ngày 14/11',
                events: [
                    {
                        time: '07:30 - 11:30',
                        title: 'Khai Mạc Giải Đua Ghe Ngo Truyền Thống',
                        location: 'Sông Long Bình, TP. Trà Vinh',
                        icon: 'kayaking',
                        desc: 'Màn so tài nảy lửa giữa 36 đội ghe Ngo nam nữ đến từ các chùa Khmer Trà Vinh, Sóc Trăng, Bạc Liêu, Kiên Giang. Hàng ngàn tay bơi vạm vỡ rẽ sóng trong tiếng cồng chiêng rộn rã và tiếng reo hò của hơn 5 vạn cổ động viên rợp hai bờ kè sông Long Bình.',
                        image: '/chùa hang.jpg',
                        highlight: 'Khoảnh khắc kịch tính chặng nước rút 800m',
                        actionLinkText: 'Xem vị trí khán đài A & B'
                    },
                    {
                        time: '14:00 - 17:00',
                        title: 'Triển Lãm & Hội Thi Giã Cốm Dẹp Truyền Thống',
                        location: 'Quảng trường Ao Bà Om',
                        icon: 'soup_kitchen',
                        desc: 'Chứng kiến nghệ nhân 9 huyện thị phô diễn kỹ nghệ quết chày đôi nhịp nhàng, thưởng thức cốm dẹp mới trộn tại chỗ thơm bùi, cùng không gian trưng bày trang phục truyền thống, nhạc cụ Ngũ Âm và ghe Ngo mini chạm khắc tinh xảo.',
                        tags: ['Miễn phí nếm thử', 'Giao lưu nghệ nhân Khmer']
                    },
                    {
                        time: '18:30 - 21:30',
                        title: 'Khai Mạc Tuần Lễ Văn Hóa Du Lịch & Biểu Diễn Nghệ Thuật Dân Tộc',
                        location: 'Sân khấu Trung tâm Ao Bà Om',
                        icon: 'theater_comedy',
                        desc: 'Chương trình nghệ thuật tổng hợp với các tiết mục ca múa nhạc dân tộc Khmer đặc sắc, trình diễn trang phục truyền thống và hòa tấu dàn nhạc Ngũ âm Pinpeat.'
                    }
                ]
            },
            day2: {
                label: 'Ngày 15/11',
                events: [
                    {
                        time: '08:00 - 11:30',
                        title: 'Chung Kết Giải Đua Ghe Ngo & Lễ Trao Thưởng Cúp Vô Địch',
                        location: 'Sông Long Bình, TP. Trà Vinh',
                        icon: 'emoji_events',
                        desc: 'Các trận tranh tài bán kết và chung kết tranh Cúp vô địch tỉnh Trà Vinh. Trao giải thưởng và lễ diễu hành mừng chiến thắng của đội ghe vô địch.'
                    },
                    {
                        time: '14:00 - 17:00',
                        title: 'Không Gian Trò Chơi Dân Gian & Hội Quết Cốm Giao Lưu',
                        location: 'Khuôn viên Rừng Cổ Thụ Ao Bà Om',
                        icon: 'sports_kabaddi',
                        desc: 'Các trò chơi kéo co, đẩy gậy, đập nồi đất cùng không gian workshop tự tay làm lồng đèn sen và chạm khắc gáo dừa cho du khách trải nghiệm.'
                    },
                    {
                        time: '18:30 - 21:30',
                        title: 'Đại Lễ Cúng Trăng, Biểu Diễn Dù Kê & Thả Hoa Đăng Nước',
                        location: 'Khán đài Mặt hồ Ao Bà Om',
                        icon: 'night_sight_auto',
                        desc: 'Thời khắc trăng tròn đỉnh đầu, lễ tạ ơn thiêng liêng bắt đầu với nghi thức tụng kinh cầu an của chư Tăng. Sau đó là các trích đoạn sân khấu Dù Kê đặc sắc, cùng nghi thức thả hàng ngàn chiếc đèn hoa đăng sen và đèn gió Lôi Protip bừng sáng mặt hồ phẳng lặng.',
                        tip: 'Gợi ý: Du khách nên đến khu vực bờ hồ trước 17:45 để nhận hoa đăng miễn phí tại chốt đón tiếp ViVuTraVinh.'
                    }
                ]
            }
        },
        // Ý nghĩa nét văn hóa Cốm Dẹp
        culturalHighlights: [
            {
                title: 'Hương Vị Cốm Dẹp (Om Bok)',
                desc: 'Lúa nếp vừa chín đỏ đuôi được gặt về rang vừa độ chín trong nồi đất, giã nhuyễn bằng chày gỗ và sàng sảy khéo léo. Cốm dẹp trộn đều với đường thốt nốt, dừa nạo nồng thơm dâng cúng tổ tiên.',
                icon: 'bakery_dining'
            },
            {
                title: 'Nghi Lễ Đút Cốm Trẻ Nhỏ',
                desc: 'Sau lễ cúng thiêng, các vị trưởng bối chọn các em nhỏ trong phum sóc đút từng vốc cốm dẹp vào miệng, vỗ lưng nhẹ và hỏi ước nguyện tương lai, gửi gắm chúc phúc cho sự đỗ đạt, trường thọ.',
                icon: 'sentiment_satisfied'
            }
        ],
        // Sơ đồ & Dịch vụ hậu cần
        logistics: {
            sectors: [
                { id: 'sec-a', name: 'Khán đài A', desc: 'Khán đài bờ hồ Ao Bà Om (Lễ Cúng Trăng)', color: 'bg-secondary' },
                { id: 'sec-b', name: 'Khán đài B', desc: 'Bờ kè Sông Long Bình (Xem Đua Ghe Ngo)', color: 'bg-[#EA580C]' },
                { id: 'sec-p', name: 'Bãi xe P1-P4', desc: '4.000 xe máy & 300 ô tô đường Nguyễn Thị Minh Khai', color: 'bg-on-tertiary-container' },
                { id: 'sec-m', name: 'Y tế & An ninh', desc: '3 trạm trực chiến cạnh Bảo tàng Khmer', color: 'bg-primary' }
            ],
            notices: [
                {
                    icon: 'local_parking',
                    title: 'Bãi đỗ xe tập trung',
                    desc: 'Sức chứa 4.000 xe máy & 300 ô tô tại đường Nguyễn Thị Minh Khai kéo dài.',
                    color: 'text-secondary'
                },
                {
                    icon: 'emergency',
                    title: 'Trạm Y tế trực chiến',
                    desc: '3 trạm cấp cứu lưu động bố trí cạnh Bảo tàng Văn hóa Khmer.',
                    color: 'text-on-tertiary-container'
                },
                {
                    icon: 'restaurant',
                    title: 'Phố ẩm thực 120 gian',
                    desc: 'Phục vụ bún nước lèo, bánh tét Trà Cuôn, bánh canh Bến Có nóng hổi.',
                    color: 'text-primary'
                }
            ]
        },
        // Thảo luận trực tiếp / Hỏi đáp
        faqDiscussions: [
            {
                id: 1,
                author: 'Lê Thuỳ Linh',
                role: 'Du khách TP.HCM • 2 giờ trước',
                avatarText: 'LT',
                avatarBg: 'bg-secondary-fixed text-on-secondary-fixed',
                likes: 14,
                question: 'Mọi người cho mình hỏi nếu đi xe khách từ Sài Gòn sáng sớm 14/11 xuống thì tới bến xe Trà Vinh có xe buýt hay trung chuyển ra sông Long Bình xem đua ghe kịp không ạ?',
                reply: {
                    author: 'Ban Quản Trị ViVuTraVinh',
                    time: '1 giờ trước',
                    text: 'Chào Thuỳ Linh! Từ bến xe mới Trà Vinh vào bờ kè sông Long Bình chỉ 2.5km. Có tuyến xe điện trung chuyển lễ hội miễn phí xuất phát mỗi 15 phút tại cổng bến xe bạn nhé!'
                }
            },
            {
                id: 2,
                author: 'Thạch Sô Phol',
                role: 'Người bản địa Cầu Kè • 5 giờ trước',
                avatarText: 'TT',
                avatarBg: 'bg-tertiary-fixed text-on-tertiary-fixed',
                likes: 29,
                question: 'Năm nay đội ghe Ngo chùa Kos Ke (Càng Long) và chùa Pitu (Trà Cú) tập luyện rất hăng say. Khuyên bà con nên đứng ở đoạn cầu Long Bình 2 để thấy rõ pha bứt tốc chung kết nhé!',
                reply: null
            }
        ],
        // Sự kiện vệ tinh cùng kỳ
        satelliteEvents: [
            {
                title: 'Tuần Lễ Ẩm Thực Xứ Trà 2026',
                time: '12 - 16/11 • 80 gian hàng đặc sản OCOP',
                icon: 'restaurant'
            },
            {
                title: 'Hội Chợ Xúc Tiến Thương Mại ĐBSCL',
                time: '10 - 17/11 • Trung tâm Hội chợ Triển lãm Trà Vinh',
                icon: 'storefront'
            }
        ],
        // Lưu trú sinh thái gợi ý
        ecoStays: [
            {
                name: 'Mekong Garden Eco-resort',
                location: 'Cách Ao Bà Om 3.2km • 4.9 ★',
                price: 'Từ 650.000đ / đêm',
                image: '/ao bà om.jpg'
            },
            {
                name: 'Suonsia Homestay Trà Vinh',
                location: 'Cách Sông Long Bình 1.5km • 4.8 ★',
                price: 'Từ 420.000đ / đêm',
                image: '/cù lao tân qui.jpg'
            }
        ],
        localTips: [
            'Chỗ xem đua ghe Ngo đẹp nhất: Khu vực cầu Long Bình 1 & 2 hoặc dọc bờ kè đường Lê Lợi. Nên đến trước 11h trưa để chọn được vị trí mát mẻ.',
            'Gửi xe dự lễ Ao Bà Om: Các điểm trông giữ xe của Thành đoàn và người dân xung quanh đường Nguyễn Thị Minh Khai hoặc cổng Chùa Âng. Tránh chen lấn bằng cách đi bộ vào hồ.',
            'Trang phục: Buổi tối Ao Bà Om rất đông vui, nên mang giày đế bằng thoải mái và giữ tư trang cẩn thận.',
            'Nghi thức đút cốm dẹp: Rất linh thiêng và vui nhộn, du khách có thể mua cốm dẹp tươi mới quết tại chỗ để thưởng thức.'
        ],
        traditionalFood: 'Cốm dẹp (Ombok) trộn cơm dừa nạo và nước đường thốt nốt béo bùi, bún nước lèo Trà Vinh, chè thốt nốt lá dứa.'
    },
    {
        id: 'chol-chnam-thmay',
        name: 'Tết Cổ Truyền Chôl Chnăm Thmây',
        originalName: 'បុណ្យចូលឆ្នាំថ្មី (Chôl Chnăm Thmây)',
        season: 'spring',
        seasonName: 'Mùa Xuân',
        badge: 'Tết Mừng Năm Mới Đồng Bào Khmer',
        lunarDate: 'Giữa tháng 4 Dương lịch (13 – 16/4 hàng năm)',
        solarDateEstimate: 'Cố định từ ngày 13 đến 16 tháng 4 Dương lịch',
        targetDate: '2027-04-14T07:00:00+07:00',
        locationName: 'Hơn 140 ngôi chùa Khmer trên toàn tỉnh (Tâm điểm: Chùa Âng, Chùa Hang, Chùa Vàm Rây)',
        locationPlaceId: 'chua-ang',
        heroImage: '/chùa âng.jpg',
        badgeColor: 'bg-emerald-600 text-white',
        summary: 'Tết năm mới mang đậm màu sắc văn hóa Phật giáo Nam tông Khmer. Không khí tưng bừng khắp các phum sóc với tiếng trống Chhay-dâm rộn rã, nghi thức tắm Phật, đắp núi cát và té nước mát lành cầu may.',
        significance: 'Đánh dấu bước chuyển giao thời tiết giữa mùa khô và mùa mưa, cầu mong thần linh ban phước lành, mưa thuận gió hòa, mùa màng bội thu và tẩy trần những điều không may mắn trong năm cũ.',
        timeline: [
            {
                time: 'Ngày 1 (Moha Songkran)',
                title: 'Lễ Rước Đại Lịch Maha Songkran',
                desc: 'Phật tử diện trang phục truyền thống rực rỡ, đội mâm lễ vật rước Đại lịch đi vòng quanh Chánh điện chùa 3 vòng mừng năm mới.',
                icon: 'auto_stories'
            },
            {
                time: 'Ngày 2 (Wanabat)',
                title: 'Lễ Đặt Bát & Nghi Thức Đắp Núi Cát (Pôôn Phnom Khsach)',
                desc: 'Dâng cơm nuôi dưỡng chư tăng; đồng bào cùng nhau đắp 9 ngọn núi cát tượng trưng cho vũ trụ Tsumeru để tích lũy phước báu và cầu bình an.',
                icon: 'terrain'
            },
            {
                time: 'Ngày 3 (Lơng Săk)',
                title: 'Lễ Tắm Phật (Srong Preah) & Tắm Ông Bà Cha Mẹ',
                desc: 'Dùng nước ướp hương hoa thơm để tắm tượng Phật, tắm các bậc cao niên và sư sãi để tạ ơn công sinh dưỡng, rửa sạch bụi trần.',
                icon: 'water_drop'
            },
            {
                time: 'Suốt các đêm hội',
                title: 'Vũ Điệu Romvong & Trò Chơi Dân Gian Phum Sóc',
                desc: 'Thanh niên nam nữ hòa cùng điệu múa Romvong, Saravan uyển chuyển; các trò chơi kéo co, đẩy gậy, bịt mắt đập nồi rộn rã sân chùa.',
                icon: 'music_note'
            }
        ],
        localTips: [
            'Khi vào chùa dâng hương: Cần mặc trang phục kín đáo (áo có tay, quần hoặc váy dài qua đầu gối), bỏ nón và cởi giày dép trước khi bước vào Chánh điện.',
            'Lễ hội té nước: Nước té tượng trưng cho sự thanh lọc và phước lành, hãy tươi cười đón nhận và chuẩn bị bao chống nước cho điện thoại.',
            'Thuê trang phục Khmer Sbay: Có thể thuê tại các tiệm quanh khu vực Ao Bà Om hoặc cổng Chùa Âng để có những bức ảnh đón năm mới tuyệt đẹp.'
        ],
        traditionalFood: 'Bánh tét bánh ít nếp dẻo nhân đậu mỡ, Num Kom (bánh ít Khmer), canh chua cá linh bông điên điển, cà ri Khmer thơm nồng.'
    },
    {
        id: 'vu-lan-cau-ke',
        name: 'Vu Lan Thắng Hội Chùa Ông Bổn (Cầu Kè)',
        originalName: '勝會盂蘭 - 萬年風宮 (Vạn Niên Phong Cung)',
        season: 'autumn',
        seasonName: 'Mùa Thu',
        badge: 'Di Sản Văn Hóa Phi Vật Thể Quốc Gia',
        lunarDate: 'Ngày 25 – 28 tháng 7 Âm lịch hàng năm',
        solarDateEstimate: 'Khoảng cuối tháng 8 hoặc đầu tháng 9 Dương lịch',
        targetDate: '2027-09-04T08:00:00+07:00',
        locationName: 'Vạn Niên Phong Cung & các chùa Ông Bổn, Thị trấn Cầu Kè',
        locationPlaceId: 'nha-co-huynh-ky',
        heroImage: '/nhà cổ huỳnh kỳ.jpg',
        badgeColor: 'bg-rose-600 text-white',
        summary: 'Lễ hội truyền thống độc đáo có lịch sử trên 100 năm của cộng đồng người Hoa Triều Châu và người Kinh, Khmer xứ Cầu Kè. Nổi bật với đại lễ nghinh Thần, múa lân sư rồng liên hoàn và các nghi thức dân gian kỳ bí.',
        significance: 'Báo hiếu công ơn cha mẹ tổ tiên, tưởng nhớ tiền nhân khai hoang mở cõi và cầu mong quốc thái dân an, phong điều vũ thuận, buôn may bán đắt.',
        timeline: [
            {
                time: 'Sáng Ngày 25/7 ÂL',
                title: 'Lễ Khai Mạc & Thượng Kỳ Lễ Hội',
                desc: 'Nghi thức dâng hương khai hội tại Vạn Niên Phong Cung, thắp đại nén nhang rồng và chuẩn bị đoàn rước nghinh Thần.',
                icon: 'flag'
            },
            {
                time: '07:00 – Ngày 26/7 ÂL',
                title: 'Đại Lễ Nghinh Thần Ông Bổn Tuần Du Phố Thị',
                desc: 'Đoàn rước dài hàng cây số với kiệu Thần uy nghi, đoàn múa rồng hoa mai thung, Bát Tiên quá hải, nhạc Triều Châu diễu hành khắp phố huyện Cầu Kè.',
                icon: 'directions_walk'
            },
            {
                time: 'Chiều Ngày 27/7 ÂL',
                title: 'Trình Diễn Múa Lân Sư Rồng & Đấu Giá Đèn Lồng Phúc',
                desc: 'Hội thi múa lân sư rồng ngoạn mục trên cột cờ cao; đấu giá lồng đèn may mắn quyên góp hàng tỷ đồng ủng hộ người nghèo.',
                icon: 'festival'
            },
            {
                time: 'Trưa Ngày 28/7 ÂL',
                title: 'Lễ Tạ Ơn & Nghi Thức Phóng Đăng Phát Lộc',
                desc: 'Phát gạo từ thiện, phát thuốc miễn phí cho bà con có hoàn cảnh khó khăn và thả thuyền buồm phóng sinh tiễn Thần.',
                icon: 'volunteer_activism'
            }
        ],
        localTips: [
            'Xem đoàn nghinh Thần: Đứng ở đường 30/4 hoặc trước chợ Cầu Kè là điểm nhìn trực diện và náo nhiệt nhất.',
            'Kết hợp thưởng thức Dừa sáp Cầu Kè: Dịp này các vựa dừa sáp Cầu Kè bán dừa ngon chính gốc với giá rất tốt.',
            'Nên đặt chỗ lưu trú trước: Huyện Cầu Kè số lượng khách sạn có hạn, trong dịp lễ đông du khách từ khắp các tỉnh đổ về.'
        ],
        traditionalFood: 'Dừa sáp dầm đá sữa bào, bánh bò thốt nốt nướng, mì sủi cảo Triều Châu, heo quay giòn bì dâng lễ.'
    },
    {
        id: 'trai-cay-tan-qui',
        name: 'Tuần Lễ Trái Cây Ngon Cù Lao Tân Qui - Cầu Kè',
        originalName: 'Lễ Hội Trái Cây Miệt Vườn Sông Hậu',
        season: 'summer',
        seasonName: 'Mùa Hạ',
        badge: 'Lễ Hội Nông Sản Đặc Sắc Nam Bộ',
        lunarDate: 'Tết Đoan Ngọ (Mùng 4 – 6 tháng 5 Âm lịch hàng năm)',
        solarDateEstimate: 'Khoảng tháng 6 Dương lịch mùa trái cây chín rộ',
        targetDate: '2027-06-09T08:00:00+07:00',
        locationName: 'Cù lao Tân Qui (Xã An Phú Tân) & Thị trấn Cầu Kè',
        locationPlaceId: 'cu-lao-tan-qui',
        heroImage: '/cù lao tân qui.jpg',
        badgeColor: 'bg-lime-600 text-white',
        summary: 'Thiên đường trái cây nhiệt đới trên dải cù lao trù phú giữa dòng sông Hậu. Du khách được bao bụng ăn sầu riêng, măng cụt, chôm chôm chín cây và trải nghiệm tắm sông, chèo thuyền miệt vườn.',
        significance: 'Tôn vinh nhà nông và giá trị đặc sản trái ngon Nam Bộ; quảng bá du lịch sinh thái miệt vườn sông Hậu của tỉnh Trà Vinh.',
        timeline: [
            {
                time: 'Mùng 4/5 ÂL',
                title: 'Khai Mạc & Hội Thi Nghệ Thuật Trái Cây Khổng Lồ',
                desc: 'Chiêm ngưỡng các tác phẩm tạo hình rồng phượng tinh xảo từ hàng ngàn loại quả miệt vườn; chấm thi sầu riêng Ri6 và măng cụt Tân Qui ngon nhất.',
                icon: 'nutrition'
            },
            {
                time: 'Mùng 5/5 ÂL (Tết Đoan Ngọ)',
                title: 'Ngày Hội Vườn Mở & Tắm Sông “Giết Sâu Bọ” Giờ Ngọ',
                desc: 'Bao trọn các nhà vườn hái trái ăn tại chỗ không giới hạn; người dân và du khách tắm bùn phù sa sông Hậu đúng 12h trưa cầu sức khỏe.',
                icon: 'pool'
            },
            {
                time: 'Mùng 6/5 ÂL',
                title: 'Hội Đua Vỏ Lãi & Giao Lưu Đờn Ca Tài Tử Trên Sông',
                desc: 'Tiếng động cơ vỏ lãi rẽ sóng tranh tài kịch tính; các câu lạc bộ đờn ca tài tử cất tiếng ca ngọt ngào ven sông Hậu.',
                icon: 'speed'
            }
        ],
        localTips: [
            'Cách di chuyển ra cù lao: Đi phà từ bến phà An Phú Tân sang cù lao Tân Qui (chỉ mất 5 phút, xe máy qua dễ dàng).',
            'Kinh nghiệm hái vườn: Mặc quần áo gọn nhẹ, mang nón lá hoặc giày chống trơn khi dạo các liếp vườn dừa và măng cụt.',
            'Mua trái cây mang về: Nên mua trực tiếp tại các nhà vườn có dán tem truy xuất nguồn gốc trái ngon Tân Qui.'
        ],
        traditionalFood: 'Măng cụt Tân Qui ngọt thanh, sầu riêng Chín Hóa thơm nức, gỏi tép rong bông điên điển, bánh xèo ốc gạo cồn bãi.'
    },
    {
        id: 'cung-bien-my-long',
        name: 'Lễ Hội Cúng Biển Mỹ Long (Nghinh Ông)',
        originalName: 'Lễ Hội Cúng Biển Mỹ Long - Cầu Ngang',
        season: 'summer',
        seasonName: 'Mùa Hạ',
        badge: 'Di Sản Văn Hóa Phi Vật Thể Quốc Gia',
        lunarDate: 'Ngày 10 – 12 tháng 5 Âm lịch hàng năm',
        solarDateEstimate: 'Khoảng tháng 6 Dương lịch hàng năm',
        targetDate: '2027-06-15T06:30:00+07:00',
        locationName: 'Miếu Bà Chúa Xứ Mỹ Long & Bờ biển Cầu Ngang',
        locationPlaceId: 'bien-ba-dong',
        heroImage: '/biển ba động.jpg',
        badgeColor: 'bg-cyan-600 text-white',
        summary: 'Lễ hội tâm linh truyền thống hơn 100 năm của ngư dân vùng biển Duyên Hải - Cầu Ngang. Nghi lễ nghinh Ông trang nghiêm tạ ơn biển cả, tiễn thuyền rồng ra khơi và ngày hội vui nhộn của cư dân miền biển.',
        significance: 'Tạ ơn Thần Biển (Cá Ông) đã che chở ngư dân qua những cơn bão tố, phù hộ cho những chuyến ra khơi tôm cá đầy khoang, mùa màng thuận lợi.',
        timeline: [
            {
                time: '07:00 – Ngày 10/5 ÂL',
                title: 'Lễ Tế Tiền Vãng & Cúng Giỗ Tiền Nhân Khai Biển',
                desc: 'Tưởng nhớ những thế hệ ngư dân đã ngã xuống nơi đầu sóng ngọn gió mở mang làng biển Mỹ Long.',
                icon: 'church'
            },
            {
                time: '06:00 – Ngày 11/5 ÂL',
                title: 'Đại Lễ Nghinh Thần Trên Biển Khơi Cung Hầu',
                desc: 'Hàng trăm ghe tàu treo cờ hoa rực rỡ giong buồm ra cửa biển Cung Hầu làm lễ đón Thần về Miếu.',
                icon: 'anchor'
            },
            {
                time: '14:00 – Ngày 12/5 ÂL',
                title: 'Nghi Thức Đưa Tàu Ra Biển Khơi (Tống Tàu Lễ Vật)',
                desc: 'Thuyền rồng chứa đầy lễ vật trà, gạo, muối, vải vóc được hạ thủy xuôi theo con nước lớn ra ngoài khơi xa.',
                icon: 'directions_boat'
            }
        ],
        localTips: [
            'Xem đoàn tàu cúng biển: Đến khu vực bến tàu thị trấn Mỹ Long lúc 5h30 sáng để ngắm bình minh và đoàn tàu ra khơi.',
            'Thưởng thức hải sản Mỹ Long: Ghé chợ biển Mỹ Long mua cua biển, nghêu, sò huyết tươi sống vừa cập bến với giá bình dân.'
        ],
        traditionalFood: 'Bánh xèo nghêu Mỹ Long, cua biển nướng mọi, cháo cá khoai, canh chua bông bần cá ngát.'
    },
    {
        id: 'sene-dolta',
        name: 'Lễ Sêne Đôlta (Lễ Báo Hiếu Tổ Tiên)',
        originalName: 'ពិធីបុណ្យសែនដូនតា (Bon Sêne Đôlta)',
        season: 'autumn',
        seasonName: 'Mùa Thu',
        badge: 'Đại Lễ Báo Hiếu Đồng Bào Khmer',
        lunarDate: 'Ngày 29 tháng 8 đến mùng 1 tháng 9 Âm lịch',
        solarDateEstimate: 'Khoảng tháng 9 hoặc đầu tháng 10 Dương lịch',
        targetDate: '2026-10-09T07:00:00+07:00',
        locationName: 'Tất cả các ngôi chùa & gia đình đồng bào Khmer Trà Vinh',
        locationPlaceId: 'chua-hang',
        heroImage: '/chùa hang.jpg',
        badgeColor: 'bg-purple-600 text-white',
        summary: 'Một trong ba lễ hội lớn nhất của người Khmer mang ý nghĩa tương tự như lễ Vu Lan báo hiếu, thắt chặt tình cảm gia đình, dòng họ và cộng đồng phum sóc.',
        significance: 'Bày tỏ lòng biết ơn sâu sắc đến ông bà, cha mẹ và những người đã khuất; cầu siêu thoát cho vong linh và ước mong tổ tiên phù hộ cuộc sống an lành.',
        timeline: [
            {
                time: 'Ngày 29/8 ÂL (Ngày Cúng Tiếp Đón)',
                title: 'Lễ Cúng Gia Tiên Rước Ông Bà Về Thăm Nhà',
                desc: 'Con cháu dọn dẹp nhà cửa trang hoàng bàn thờ, làm mâm cơm thịnh soạn kính mời linh hồn ông bà về sum vầy cùng con cháu.',
                icon: 'home'
            },
            {
                time: 'Ngày 30/8 ÂL (Ngày Đi Chùa Đặt Cơm)',
                title: 'Nghi Lễ Đặt Cơm Vắt (Kan Ben) & Thính Pháp Tại Chùa',
                desc: 'Phật tử mang mâm cơm lên chùa cúng dường chư tăng, nghe giảng kinh cầu siêu và cầu an cho gia đạo.',
                icon: 'self_improvement'
            },
            {
                time: 'Mùng 1/9 ÂL (Ngày Tiễn Đưa)',
                title: 'Lễ Tiễn Đưa Ông Bà & Thả Thuyền Bẹ Chuối',
                desc: 'Làm mâm cỗ tiễn tổ tiên, kết những chiếc thuyền bằng bẹ chuối nhỏ chứa đồ cúng thả trôi sông mang phước lành đi muôn nơi.',
                icon: 'sailing'
            }
        ],
        localTips: [
            'Trải nghiệm văn hóa phum sóc: Vào dịp này, người Khmer rất hiếu khách, nếu được mời vào nhà dùng bữa là một vinh hạnh lớn.',
            'Ứng xử tại chùa: Giữ tâm thanh tịnh, ăn mặc trang trọng và có thể chuẩn bị chút hương hoa cúng dường.'
        ],
        traditionalFood: 'Bánh tét ba nhân, bánh dừa nướng, canh xiêm-lo truyền thống, chè đậu đen nước cốt dừa.'
    }
];

// Danh mục phân loại sự kiện & gặp gỡ (Stitch design categories)
export const EVENT_CATEGORIES = [
    { id: 'all', label: 'Tất cả sự kiện', count: 12 },
    { id: 'upcoming', label: 'Sắp diễn ra', count: 5 },
    { id: 'traditional', label: 'Lễ hội truyền thống', count: 3 },
    { id: 'workshop', label: 'Workshop văn hóa', count: 2 },
    { id: 'sports', label: 'Thể thao & Trải nghiệm', count: 3 },
    { id: 'community', label: 'Giao lưu cộng đồng', count: 2 }
];

// Danh sách khu vực lọc địa bàn Trà Vinh
export const EVENT_REGIONS = [
    { id: 'all', label: 'Toàn tỉnh Trà Vinh' },
    { id: 'tp-tra-vinh', label: 'TP. Trà Vinh' },
    { id: 'chau-thanh', label: 'Huyện Châu Thành' },
    { id: 'cau-ke', label: 'Huyện Cầu Kè' },
    { id: 'cang-long', label: 'Huyện Càng Long' },
    { id: 'duyen-hai', label: 'Huyện Duyên Hải' }
];

// Danh sách sự kiện, workshop và gặp gỡ cộng đồng (Dữ liệu mẫu tham khảo)
export const TRA_VINH_EVENTS_AND_MEETUPS = [
    {
        id: 'dua-ghe-ngo-2024',
        isSample: true,
        title: 'Giải Đua Ghe Ngo Tranh Cúp Sông Long Bình 2026',
        month: 'Tháng 11',
        day: '15',
        timeSchedule: 'Sáng 15/11 • 07:30 - 12:00',
        location: 'Bờ kè Sông Long Bình, TP. Trà Vinh',
        region: 'tp-tra-vinh',
        regionName: 'TP. Trà Vinh',
        category: 'Thể thao & Lễ hội',
        categoryKey: 'sports',
        fee: 'Mở cửa tự do',
        feeType: 'free',
        image: '/ao bà om.jpg',
        ctaText: 'Chi tiết & Điểm xem',
        actionType: 'modal',
        targetModalId: 'ok-om-bok',
        summary: 'Màn tranh tài nảy lửa giữa 36 đội ghe Ngo nam nữ đại diện cho các chùa Khmer trên dòng sông Long Bình.'
    },
    {
        id: 'workshop-den-sen',
        isSample: true,
        title: 'Workshop: Tự tay làm lồng đèn hoa sen & Chạm khắc gáo dừa Khmer',
        month: 'Tháng 10',
        day: '20',
        timeSchedule: 'Chủ Nhật • 08:30 - 11:30',
        location: 'Không gian văn hóa Khmer Xứ Trà, Gần Ao Bà Om',
        region: 'tp-tra-vinh',
        regionName: 'TP. Trà Vinh',
        category: 'Workshop văn hóa',
        categoryKey: 'workshop',
        fee: '50.000đ',
        feeDetail: '(gồm trà)',
        feeType: 'paid',
        statusBadge: 'Giới hạn 35 chỗ',
        image: '/ao bà om.jpg',
        ctaText: 'Xem thông tin tham gia',
        actionType: 'rsvp',
        summary: 'Trải nghiệm tự tay làm lồng đèn hoa sen lung linh và chạm khắc hoa văn Khmer tinh tế trên gáo dừa cùng nghệ nhân.'
    },
    {
        id: 'dap-xe-chua-co',
        isSample: true,
        title: 'Cuối tuần đạp xe: Cung đường Chùa Cổ & Rừng dừa Cù lao Tân Quy',
        month: 'Tháng 10',
        day: '27',
        timeSchedule: 'Chủ Nhật • 06:00 - 11:00',
        location: 'Tập trung: Quảng trường TP. Trà Vinh',
        region: 'cau-ke',
        regionName: 'Huyện Cầu Kè',
        category: 'Dã ngoại & Sinh thái',
        categoryKey: 'sports',
        fee: 'Miễn phí',
        feeType: 'free',
        statusBadge: 'Tối đa 40 xe',
        image: '/cù lao tân qui.jpg',
        ctaText: 'Xem thông tin tham gia',
        actionType: 'rsvp',
        summary: 'Đoàn xe đạp trẻ khám phá cung đường rợp bóng dừa, viếng chùa cổ Khmer và trải nghiệm phà qua miệt vườn sông nước.'
    },
    {
        id: 'photo-tour-chua-hang',
        isSample: true,
        title: 'Photo Tour Bình Minh: Đàn Chim Về Tổ & Kiến Trúc Chùa Hang',
        month: 'Tháng 11',
        day: '03',
        timeSchedule: 'Thứ Bảy • 05:30 - 09:00',
        location: 'Wat Kompong Nikrodha, Châu Thành, Trà Vinh',
        region: 'chau-thanh',
        regionName: 'Huyện Châu Thành',
        category: 'Di sản & Nhiếp ảnh',
        categoryKey: 'traditional',
        fee: 'Miễn phí',
        feeType: 'free',
        statusBadge: 'Sắp diễn ra',
        image: '/chùa hang.jpg',
        ctaText: 'Xem lịch trình',
        actionType: 'rsvp',
        summary: 'Săn bình minh xuyên qua vòm cây sao trăm tuổi, ngắm đàn chim ríu rít về tổ và khám phá xưởng điêu khắc gỗ nghệ thuật.'
    },
    {
        id: 'don-ca-tai-tu-co-chien',
        isSample: true,
        title: 'Đêm Trà & Đờn Ca Tài Tử Nam Bộ Bên Sông Cổ Chiên',
        month: 'Tháng 11',
        day: '08',
        timeSchedule: 'Thứ Sáu • 19:00 - 21:30',
        location: 'Quán Cà Phê Vườn Xứ Trà, Huyện Châu Thành',
        region: 'chau-thanh',
        regionName: 'Huyện Châu Thành',
        category: 'Giao lưu cộng đồng',
        categoryKey: 'community',
        fee: 'Gọi nước tự túc',
        feeType: 'drink',
        statusBadge: 'Tối đa 30 chỗ',
        image: '/nhà cổ huỳnh kỳ.jpg',
        ctaText: 'Xem thông tin tham gia',
        actionType: 'rsvp',
        summary: 'Thưởng thức trà thảo mộc thơm lành và lắng nghe giai điệu vọng cổ ngọt ngào, tiếng đờn kìm réo rắt bên dòng Cổ Chiên.'
    },
    {
        id: 'don-dep-ao-ba-om',
        isSample: true,
        title: 'Ngày hội Trồng Cây Cổ Thụ & Dọn Dẹp Xanh Rừng Ao Bà Om',
        month: 'Tháng 11',
        day: '22',
        timeSchedule: 'Thứ Bảy • 07:00 - 10:30',
        location: 'Khuôn viên Rừng Cổ Thụ Ao Bà Om, Trà Vinh',
        region: 'tp-tra-vinh',
        regionName: 'TP. Trà Vinh',
        category: 'Môi trường & Sinh thái',
        categoryKey: 'community',
        fee: 'Cộng đồng tự do',
        feeType: 'free',
        statusBadge: 'Hoạt động tự do',
        image: '/ao bà om.jpg',
        ctaText: 'Xem thông tin tham gia',
        actionType: 'rsvp',
        summary: 'Cùng thanh niên và người dân chăm sóc vườn cây sao dầu cổ thụ, nhặt rác bảo vệ cảnh quan mặt hồ danh thắng Ao Bà Om.'
    }
];

