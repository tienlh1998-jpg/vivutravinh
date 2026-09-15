// ViVuTraVinh - Dữ liệu Chuyên mục "Góc Chuyện Xứ Trà" (Travel Stories & Cultural Magazine)

export const TRA_VINH_ARTICLES = [
    {
        id: 'su-tich-ao-ba-om',
        slug: 'su-tich-ao-ba-om-cuoc-thi-dao-ao-huyen-thoai',
        title: 'Sự Tích Ao Bà Om: Cuộc Thi Đào Ao Huyền Thoại Giữa Phái Nam & Phái Nữ',
        category: 'Văn Hóa Khmer',
        categoryBadge: 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40',
        coverImage: './ao bà om.jpg',
        readTime: '4 phút đọc',
        publishedAt: '2026-09-10',
        author: {
            name: 'Thạch Sa Vươn',
            role: 'Thổ Địa Di Sản Khmer',
            avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=sv'
        },
        excerpt: 'Chuyện kể về nàng Om thông minh lãnh đạo phái nữ đánh bại phái nam trong cuộc thi đào ao xuyên đêm, để lại cho hậu thế một danh thắng tráng lệ soi bóng ngàn cây cổ thụ.',
        relatedPlaceIds: ['Ao Bà Om', 'Chùa Âng'],
        contentHtml: `
            <p class="lead text-base sm:text-lg font-serif italic text-slate-700 dark:text-zinc-200 leading-relaxed border-l-4 border-amber-500 pl-4 my-4">
                "Đến Trà Vinh mà chưa ghé Ao Bà Om, chưa ngồi dưới bóng hàng sao dầu trăm tuổi để nghe các bô lão kể về cuộc thi đào ao định đoạt phong tục cưới xin xưa kia, xem như chưa chạm tới linh hồn của vùng đất này."
            </p>

            <h3 class="text-lg sm:text-xl font-bold font-serif text-primary dark:text-emerald-400 mt-6 mb-3">
                1. Nguồn Cơn Của Cuộc Tranh Tài Xuyên Đêm
            </h3>
            <p class="text-sm sm:text-base leading-relaxed text-slate-700 dark:text-zinc-300 mb-4">
                Thuở xưa, tại vùng đất Trà Vinh, khí hậu thường xuyên hạn hán, đồng ruộng nứt nẻ, đời sống dân làng gặp nhiều cơ cực vì thiếu nước ngọt sinh hoạt. Cùng lúc đó, trong cộng đồng xảy ra tranh cãi kéo dài về tục cưới hỏi: bên phái nam cho rằng nữ phải đi hỏi cưới nam, còn phái nữ lại tha thiết muốn gìn giữ chế độ mẫu hệ thiêng liêng.
            </p>
            <p class="text-sm sm:text-base leading-relaxed text-slate-700 dark:text-zinc-300 mb-4">
                Để giải quyết cả hai vấn đề một cách thấu tình đạt lý, vị thủ lĩnh thông thái đã đề xướng một cuộc thi: hai bên nam nữ sẽ cùng đào hai cái ao lớn để trữ nước ngọt cho buôn làng. Cuộc thi bắt đầu từ lúc mặt trời lặn cho đến khi ngôi sao Mai mọc trên bầu trời phía Đông. Bên nào đào được ao sâu và rộng hơn trước khi sao Mai lên sẽ giành phần thắng, và kẻ thua phải đi hỏi cưới người thắng cuộc!
            </p>

            <h3 class="text-lg sm:text-xl font-bold font-serif text-primary dark:text-emerald-400 mt-6 mb-3">
                2. Kế Sách Thông Minh Của Nàng Om
            </h3>
            <p class="text-sm sm:text-base leading-relaxed text-slate-700 dark:text-zinc-300 mb-4">
                Bên phái nam ỷ sức dài vai rộng, ban đầu đào đất rất hăng hái, nhưng nửa đêm thấy mệt liền rủ nhau uống rượu, ca hát rồi lăn ra ngủ say, bụng nghĩ phái nữ chân yếu tay mềm chắc chắn không thể theo kịp.
            </p>
            <p class="text-sm sm:text-base leading-relaxed text-slate-700 dark:text-zinc-300 mb-4">
                Trong khi đó, dưới sự dẫn dắt của nàng <strong>Om</strong> – một cô gái Khmer thông minh, đảm đang và kiên nghị – phái nữ không chỉ đào đất miệt mài mà còn dùng mưu trí. Đến canh ba, nàng Om sai người làm một chiếc đèn lồng giấy thật to rồi treo lên ngọn cây sao cổ thụ cao nhất hướng Đông.
            </p>
            <div class="my-6 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-300 text-sm">
                <span class="font-bold flex items-center gap-1.5 mb-1">
                    <span class="material-symbols-outlined text-base">lightbulb</span> Mưu kế ngọn đèn lồng:
                </span>
                Ánh đèn lồng leo lét trên ngọn cây sao cao vút trông hệt như ngôi sao Mai vừa mọc. Bên phái nam bừng tỉnh ngỡ trời sắp sáng vội vứt cuốc xẻng chịu thua, trong khi phái nữ đã hoàn thành một chiếc ao vuông vức, rộng lớn và sâu thẳm!
            </div>

            <h3 class="text-lg sm:text-xl font-bold font-serif text-primary dark:text-emerald-400 mt-6 mb-3">
                3. Di Sản Trăm Năm Soi Bóng Cổ Thụ
            </h3>
            <p class="text-sm sm:text-base leading-relaxed text-slate-700 dark:text-zinc-300 mb-4">
                Từ thắng lợi vẻ vang đó, người dân đã lấy tên nàng Om để đặt cho thắng cảnh này: <strong>Ao Bà Om</strong> (tiếng Khmer gọi là <em>Srah Kông</em>). Còn ao của phái nam dở dang cạn hẹp theo thời gian đã bị vùi lấp.
            </p>
            <p class="text-sm sm:text-base leading-relaxed text-slate-700 dark:text-zinc-300 mb-4">
                Ngày nay, Ao Bà Om là Di tích Lịch sử - Văn hóa cấp Quốc gia, nơi diễn ra các nghi thức thiêng liêng nhất của Đại Lễ Ok Om Bok hàng năm. Hàng cây sao, cây dầu cổ thụ quanh bờ ao với những bộ rễ khổng lồ uốn lượn kỳ vĩ là minh chứng sống động cho sức sống trường tồn của huyền thoại xứ Trà.
            </p>
        `
    },
    {
        id: 'bi-mat-dua-sap-cau-ke',
        slug: 'bi-mat-dua-sap-cau-ke-tai-sao-dat-do-va-doc-nhat',
        title: 'Bí Mật Dừa Sáp Cầu Kè: Vì Sao Trở Thành Đệ Nhất Đặc Sản Đắt Đỏ Xứ Miệt Vườn?',
        category: 'Ẩm Thực Bản Địa',
        categoryBadge: 'bg-orange-100 text-orange-900 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-200 dark:border-orange-800/40',
        coverImage: './cù lao tân qui.jpg',
        readTime: '5 phút đọc',
        publishedAt: '2026-09-12',
        author: {
            name: 'Hai Miệt Vườn',
            role: 'Chuyên Gia Ẩm Thực Trà Vinh',
            avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=duasap'
        },
        excerpt: 'Không phải cây dừa nào cũng cho trái sáp, và không phải vùng đất nào cũng trồng được. Cùng khám phá nguồn gốc giống dừa béo quánh "vạn người mê" tại huyện Cầu Kè.',
        relatedPlaceIds: ['Cù lao Tân Qui', 'Nhà cổ Huỳnh Kỳ'],
        contentHtml: `
            <p class="lead text-base sm:text-lg font-serif italic text-slate-700 dark:text-zinc-200 leading-relaxed border-l-4 border-orange-500 pl-4 my-4">
                "Một trái dừa sáp Cầu Kè chính hiệu có giá từ 150.000đ đến hơn 250.000đ – đắt gấp 15 đến 20 lần một trái dừa xiêm thông thường. Điều gì đã tạo nên sự độc tôn đắt giá ấy?"
            </p>

            <h3 class="text-lg sm:text-xl font-bold font-serif text-primary dark:text-emerald-400 mt-6 mb-3">
                1. Nguồn Gốc Từ Một Ngôi Cổ Tự Trăm Năm
            </h3>
            <p class="text-sm sm:text-base leading-relaxed text-slate-700 dark:text-zinc-300 mb-4">
                Theo lời các bậc cao niên tại huyện Cầu Kè, giống dừa sáp (tiếng Khmer gọi là <em>Mak-ap</em>) xuất hiện lần đầu tiên tại Trà Vinh vào khoảng năm 1942. Một vị sư Khmer tu tại Chùa Botum Vong Sa Som Rong (Cầu Kè) trong chuyến sang Campuchia đã mang giống dừa đặc biệt này về trồng trong khuôn viên chùa.
            </p>
            <p class="text-sm sm:text-base leading-relaxed text-slate-700 dark:text-zinc-300 mb-4">
                Nhờ thổ nhưỡng phù sa ngọt ngào màu mỡ của dòng sông Hậu bao bọc quanh vùng đất Cầu Kè, cây dừa bén rễ xanh tốt và cho ra những trái dừa có lớp cơm dày cộm, mềm xốp và béo ngậy chưa từng thấy.
            </p>

            <h3 class="text-lg sm:text-xl font-bold font-serif text-primary dark:text-emerald-400 mt-6 mb-3">
                2. Tỷ Lệ Sáp Bí Ẩn: Trò Chơi Của Thiên Nhiên
            </h3>
            <p class="text-sm sm:text-base leading-relaxed text-slate-700 dark:text-zinc-300 mb-4">
                Điều kỳ diệu và thách thức lớn nhất của dừa sáp là: <strong>không phải trái dừa nào trên buồng cũng thành dừa sáp!</strong>
            </p>
            <ul class="list-disc list-inside space-y-2 text-sm sm:text-base text-slate-700 dark:text-zinc-300 mb-4 pl-2">
                <li>Một buồng dừa sáp chỉ có khoảng <strong>20% - 30%</strong> số trái là sáp đặc biệt, các trái còn lại vẫn là dừa nước bình thường.</li>
                <li>Trái dừa nước bình thường trong buồng ấy mới có mộng để đem ươm thành cây giống; còn trái đã thành sáp thì không thể nảy mầm sinh sôi được.</li>
                <li>Nếu đem cây giống dừa sáp Cầu Kè sang các tỉnh khác trồng, tỷ lệ cho trái sáp thường giảm mạnh hoặc mất hẳn tính sáp!</li>
            </ul>

            <h3 class="text-lg sm:text-xl font-bold font-serif text-primary dark:text-emerald-400 mt-6 mb-3">
                3. Nghệ Thuật Thưởng Thức Chuẩn Vị Thổ Địa
            </h3>
            <p class="text-sm sm:text-base leading-relaxed text-slate-700 dark:text-zinc-300 mb-4">
                Khi bổ đôi một trái dừa sáp, bên trong không có nhiều nước lỏng mà là một lớp nước sền sệt trong veo như thạch. Cơm dừa dày trắng muốt, xôm xốp và béo ngậy như bơ kem thượng hạng.
            </p>
            <div class="my-6 p-4 rounded-2xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/50 text-orange-900 dark:text-orange-300 text-sm">
                <span class="font-bold flex items-center gap-1.5 mb-1">
                    <span class="material-symbols-outlined text-base">restaurant</span> 3 Cách ăn dừa sáp đỉnh cao:
                </span>
                1. <strong>Dầm sữa đá:</strong> Nạo cơm dừa dầm cùng sữa đặc, đá nhuyễn và rắc đậu phộng rang giòn.<br>
                2. <strong>Sinh tố cà phê dừa sáp:</strong> Cơm dừa xay mịn cùng sữa tươi, rót một shot cà phê phin đậm đà lên trên.<br>
                3. <strong>Ăn mộc trực tiếp:</strong> Dùng muỗng múc từng miếng cơm dừa nguyên bản để cảm nhận vị béo ngậy tan chảy trên đầu lưỡi.
            </div>
        `
    },
    {
        id: 'cam-nang-phuot-con-chim-2n1d',
        slug: 'cam-nang-du-lich-thuan-thien-con-chim-2-ngay-1-dem',
        title: 'Cẩm Nang Phượt Cồn Chim 2N1Đ: Trải Nghiệm Du Lịch Thuận Thiên "Về Quê Đúng Nghĩa"',
        category: 'Ký Sự & Phượt',
        categoryBadge: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40',
        coverImage: './cồn chim.jpg',
        readTime: '6 phút đọc',
        publishedAt: '2026-09-14',
        author: {
            name: 'Linh Đi Phượt',
            role: 'Blogger Du Lịch Gen Z',
            avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=linh'
        },
        excerpt: 'Ăn sương ngủ đất, chèo xuồng câu cua, thưởng thức bánh lá dừa nếp dẻo và ngắm hoàng hôn sông Tiền bình yên không khói bụi xe cộ.',
        relatedPlaceIds: ['Cồn Chim'],
        contentHtml: `
            <p class="lead text-base sm:text-lg font-serif italic text-slate-700 dark:text-zinc-200 leading-relaxed border-l-4 border-emerald-500 pl-4 my-4">
                "Cồn Chim không có máy lạnh, không có karaoke ồn ào và nói không với rác thải nhựa một lần. Nơi đây chỉ có tiếng chim hót, gió sông Cổ Chiên thổi rào rạt và nụ cười đôn hậu của người dân miệt vườn."
            </p>

            <h3 class="text-lg sm:text-xl font-bold font-serif text-primary dark:text-emerald-400 mt-6 mb-3">
                1. Cách Di Chuyển Đến Ốc Đảo Xanh Cồn Chim
            </h3>
            <p class="text-sm sm:text-base leading-relaxed text-slate-700 dark:text-zinc-300 mb-4">
                Cồn Chim thuộc xã Hòa Minh, huyện Châu Thành, nằm biệt lập giữa bốn bề sông Cổ Chiên hiền hòa. Từ trung tâm TP. Trà Vinh, bạn chạy xe máy hoặc ô tô khoảng 15km về hướng phà Bà Trầm, sau đó đón phà hoặc thuê xuồng máy lướt sóng khoảng 10 phút là đặt chân lên đảo.
            </p>
            <p class="text-sm sm:text-base leading-relaxed text-slate-700 dark:text-zinc-300 mb-4">
                Vừa bước chân lên cầu tàu, bạn sẽ được người dân đón tiếp bằng một ly nước mát nấu từ cỏ ngọt và dừa tươi, kèm theo chiếc nón lá và xe đạp cào cào để vi vu đường làng.
            </p>

            <h3 class="text-lg sm:text-xl font-bold font-serif text-primary dark:text-emerald-400 mt-6 mb-3">
                2. Lịch Trình Chi Tiết 2 Ngày 1 Đêm Thuận Thiên
            </h3>

            <div class="space-y-4 my-5">
                <div class="p-4 rounded-2xl bg-surface-container-low dark:bg-zinc-800/80 border border-outline-variant/30 dark:border-zinc-700">
                    <h4 class="font-bold text-sm text-primary dark:text-emerald-400 mb-1 flex items-center gap-2">
                        <span class="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 flex items-center justify-center text-xs">1</span>
                        Ngày 1: Đạp xe đường hoa & Trải nghiệm làng quê
                    </h4>
                    <p class="text-xs sm:text-sm text-slate-600 dark:text-zinc-300 leading-relaxed">
                        • <strong>14:00:</strong> Check-in homestay nhà vườn mát rượi, nhận xe đạp cào cào.<br>
                        • <strong>15:00:</strong> Đạp xe dọc con đường hoa mười giờ rực rỡ, ghé Bếp Cô Ba làm bánh lá mơ, bánh xèo nước cốt dừa thơm phức.<br>
                        • <strong>16:30:</strong> Trải nghiệm câu cua gạch, dỡ chà bắt tôm càng xanh dưới mương dừa nước.<br>
                        • <strong>18:30:</strong> Dùng bữa cơm quê thuận thiên: canh chua bần cá bông lau, gỏi tép rong bông điên điển, cá lóc nướng trui rơm thơm nồng.
                    </p>
                </div>

                <div class="p-4 rounded-2xl bg-surface-container-low dark:bg-zinc-800/80 border border-outline-variant/30 dark:border-zinc-700">
                    <h4 class="font-bold text-sm text-primary dark:text-emerald-400 mb-1 flex items-center gap-2">
                        <span class="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 flex items-center justify-center text-xs">2</span>
                        Ngày 2: Đón bình minh sông nước & Chợ quê tuổi thơ
                    </h4>
                    <p class="text-xs sm:text-sm text-slate-600 dark:text-zinc-300 leading-relaxed">
                        • <strong>06:00:</strong> Đón bình minh rực rỡ trên bến sông, hít căng lồng ngực không khí trong lành nguyên bản.<br>
                        • <strong>07:00:</strong> Điểm tâm sáng với bún nước lèo hoặc bánh canh bột xắt tôm thịt.<br>
                        • <strong>08:30:</strong> Tham gia trò chơi dân gian: ném lon, nhảy dây, tạt lon ở sân đình Cồn Chim.<br>
                        • <strong>11:00:</strong> Mua sắm quà quê: mắm cá đồng, bánh tráng nướng, dừa sáp rồi tạm biệt người quê đôn hậu.
                    </p>
                </div>
            </div>

            <h3 class="text-lg sm:text-xl font-bold font-serif text-primary dark:text-emerald-400 mt-6 mb-3">
                3. Những Lưu Ý Vàng Khi Đi Cồn Chim
            </h3>
            <ul class="list-disc list-inside space-y-2 text-sm sm:text-base text-slate-700 dark:text-zinc-300 mb-4 pl-2">
                <li>Hãy mang theo bình đựng nước cá nhân để hạn chế tối đa chai nhựa dùng một lần.</li>
                <li>Chuẩn bị thuốc chống muỗi và trang phục gọn nhẹ, thoải mái để tiện đạp xe và lội mương.</li>
                <li>Nên liên hệ đặt trước dịch vụ ẩm thực với các cô chú tổ hợp tác du lịch để bà con chuẩn bị chu đáo nguyên liệu tươi ngon nhất từ vườn.</li>
            </ul>
        `
    }
];
