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
