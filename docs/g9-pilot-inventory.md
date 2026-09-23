# Báo Cáo Kiểm Kê, Phân Loại & Đề Xuất Ứng Viên Pilot (G9.3A)

> **Dự án:** ViVuTraVinh — Cẩm nang du lịch tự túc & bản đồ số Trà Vinh  
> **Giai đoạn:** G9 — Chất lượng dữ liệu thật và vận hành nội dung  
> **Mốc thực hiện:** **G9.3A — Kiểm kê, xác minh nguồn và chọn ứng viên pilot (Candidate Inventory & Source Review)**  
> **Thời điểm thẩm tra:** `2026-09-22T12:45:00+07:00`  
> **Phạm vi tài liệu:** 📋 **Thẩm định cấu trúc hợp đồng dữ liệu (Structural Contract Validation) & Báo cáo nguồn chứng minh (Source Evidence)**  
> **Cam kết an toàn:** ✅ **Zero Push** • **Zero Deploy** • **Zero Migration** • **Zero Production Mutation** • **Zero Production Draft** • **Zero Commit**  
> **Trạng thái mốc:** ⏳ **READY FOR MANUAL SOURCE REVIEW**  

---

## 1. Hiện Trạng Đường Cơ Sở CSDL Hậu G9.2 (Post-G9.2 Read-Only Baseline)

Sau đợt dọn dẹp có kiểm soát G9.2, toàn bộ 3 bản ghi dữ liệu thử nghiệm (ID 4, 6, 10) đã chuyển sang trạng thái lưu trữ (`archived`). CSDL Production hiện tại ghi nhận:

### 1.1. Phân Bổ Trạng Thái Địa Điểm (`places`)

| Trạng thái | Số lượng | Ghi chú vận hành |
| :--- | :---: | :--- |
| **`approved`** | **0** | Đã loại bỏ hoàn toàn các bản ghi test cũ khỏi giao diện public. Hiện tại giao diện người dùng hoàn toàn sạch rác. |
| **`draft`** | **0** | Đã lưu trữ bản nháp test ID 6. Tuyệt đối **chưa tạo bản nháp mới nào** trên production trong G9.3A. |
| **`archived`** | **3** | Gồm các ID thử nghiệm: **ID 4, ID 6, ID 10**. |
| **`hidden`** | **6** | Các bản ghi dữ liệu cũ tồn tại từ trước, chưa qua kiểm duyệt chất lượng G9.1. |
| **Tổng cộng** | **9** | Toàn bộ 9 bản ghi hiện có trên production quan sát được qua Admin API. |

> [!CAUTION]
> **CẢNH BÁO NGUỒN SỰ THẬT (SOURCE OF TRUTH RESTRICTIONS):**
> 1. **Dữ liệu legacy production (6 bản ghi hidden):** Tuyệt đối **không xem tên, địa chỉ hay số điện thoại trong 6 bản ghi `hidden` cũ là thông tin đã xác minh**. Rất nhiều trường chứa hậu tố rác (`aa`, `DH`, `addđa`) hoặc chuỗi vô nghĩa (`XBCZ`, `đâsdsadasd`).
> 2. **Dữ liệu fallback local (`data/data-fallback.json`):** Chỉ là tập tin snapshot tham khảo ban đầu, chứa nhiều số điện thoại mô phỏng (`0294.385.5555`, `0903.123.456`), địa chỉ sai lệch và ảnh mượn chéo (gán ảnh Ao Bà Om cho Bún nước lèo, gán ảnh Chùa Hang cho Bánh tét).
> 3. **Tính chất thẩm định:** Báo cáo này thực hiện **thẩm định cấu trúc hợp đồng (structural validation)**. Việc chứng minh dữ kiện thực tế ngoài đời cần được thực hiện qua các đợt khảo sát thực địa độc lập.

### 1.2. Đánh Giá Chi Tiết 6 Bản Ghi `hidden` Còn Lại

| ID | Tên hiện thời trong CSDL | Slug | Đánh giá dữ liệu | Phân loại | Khuyến nghị xử lý |
| :---: | :--- | :--- | :--- | :---: | :--- |
| **1** | `Ao Bà Om aa` | `ao-ba-om` | Tên bị dính hậu tố rác `"aa"`, thiếu thông tin liên hệ | `UNVERIFIED_LEGACY` | Giữ `hidden`. Dùng hồ sơ pilot G9.3A để chuẩn hóa lại tên và nội dung trước khi cập nhật. |
| **2** | `Biển Ba Động DH` | `bien-ba-dong` | Tên bị dính hậu tố rác `"DH"`, thiếu thông tin liên hệ | `UNVERIFIED_LEGACY` | Giữ `hidden`. Chuyển sang nhóm `NEEDS_RESEARCH` do cần khảo sát thêm bờ kè và dự án điện gió. |
| **3** | `Chùa Âng` | `chua-ang` | Tên chuẩn, thiếu số liên hệ và giờ mở cửa chưa thẩm định | `UNVERIFIED_LEGACY` | Giữ `hidden`. Đã xác minh nguồn độc lập thành công trong G9.3A, sẵn sàng cho đợt pilot. |
| **5** | `XBCZ` | `xbcz` | Ký tự gõ phím vô nghĩa, thiếu toàn bộ trường quan trọng | `TEST_OR_INVALID` | Giữ `hidden` trong đợt này; kiến nghị chuyển `archived` ở đợt dọn dẹp tiếp theo. |
| **8** | `đâsdsadasd` | `dd` | Ký tự vô nghĩa, thiếu toàn bộ trường quan trọng | `TEST_OR_INVALID` | Giữ `hidden` trong đợt này; kiến nghị chuyển `archived` ở đợt dọn dẹp tiếp theo. |
| **9** | `Ao Bà Om addđa` | `dd-mpp8h72z` | Bản ghi nhân bản lỗi và gõ rác của Ao Bà Om | `DUPLICATE_CANDIDATE` | Giữ `hidden`; không sử dụng; kiến nghị chuyển `archived` tránh trùng với ID 1. |

---

## 2. Hệ Thống 8 Nhóm Phân Loại Chuẩn Hóa & Bảng Kiểm Kê 22 Mục

Dự án áp dụng 8 nhóm phân loại chuẩn hóa nhằm phản ánh trung thực mức độ kiểm chứng nguồn:
1. **`VERIFIED_CANDIDATE`**: Có đo đạc kiểm chứng thực địa trực tiếp (hiện tại: 0 bản ghi do chưa triển khai khảo sát thực địa).
2. **`VERIFIED_IDENTITY_CANDIDATE`**: Hồ sơ pháp lý / danh tính / địa chỉ xếp hạng Nhà nước đã được chứng minh qua nguồn chính thống (Bộ VHTTDL, Cục Du lịch, Sở VHTTDL), nhưng tọa độ cổng vào chi tiết hoặc trạng thái mở cửa thực tế chờ thẩm tra thực địa.
3. **`NEEDS_FIELD_VERIFICATION`**: Điểm đến có cơ sở pháp lý và địa chỉ xác thực (được công nhận Điểm du lịch tiêu biểu), nhưng các trường vận hành (giờ, hotline, biểu giá) chưa có văn bản công bố trực tiếp, cần khảo sát thực địa.
4. **`SOURCE_CONFLICT`**: Tồn tại mâu thuẫn trực tiếp giữa các nguồn chính chủ hoặc nguồn thứ cấp (sai lệch số nhà, mâu thuẫn nhiều số điện thoại, thay đổi thương hiệu / tình trạng hoạt động).
5. **`NEEDS_RESEARCH`**: Địa điểm nổi tiếng nhưng thiếu dữ liệu cốt lõi (tọa độ GPS tham chiếu trắc địa, giờ mở cửa tin cậy, quy trình tiếp cận / vé phà, tình trạng công trình).
6. **`UNVERIFIED_LEGACY`**: Dữ liệu cũ trong CSDL / fallback chưa rõ nguồn gốc, thông tin có dấu hiệu mô phỏng.
7. **`TEST_OR_INVALID`**: Dữ liệu thử nghiệm hoặc chuỗi ký tự vô nghĩa.
8. **`DUPLICATE_CANDIDATE`**: Bản ghi có nguy cơ trùng lặp thực thể.

### Bảng Tổng Hợp Kiểm Kê & Phân Loại 22 Mục Khảo Sát

| STT | Mã / ID | Tên địa điểm khảo sát | Slug khảo sát | Nguồn gốc dữ liệu | Phân loại | Tình trạng nguồn & Đề xuất |
| :---: | :---: | :--- | :--- | :---: | :---: | :--- |
| 1 | `P-01` | Danh thắng Ao Bà Om | `ao-ba-om` | Fallback / DB #1 | `VERIFIED_IDENTITY_CANDIDATE` | **Ứng viên Pilot #1** (Di tích Quốc gia 1994, nguồn Bộ VHTTDL; precision center) |
| 2 | `P-02` | Chùa Âng (Angkorajaborey) | `chua-ang` | Fallback / DB #3 | `VERIFIED_IDENTITY_CANDIDATE` | **Ứng viên Pilot #2** (Di tích Quốc gia 1994, nguồn Cục Du lịch; precision building) |
| 3 | `P-03` | Đền thờ Bác Hồ Trà Vinh | `den-tho-bac-ho-tra-vinh` | Fallback / Sitemap | `VERIFIED_IDENTITY_CANDIDATE` | **Ứng viên Pilot #3** (Di tích Quốc gia 1989, nguồn Sở VHTTDL; precision entrance) |
| 4 | `P-07` | KDL Sinh Thái Huỳnh Kha | `khu-du-lich-sinh-thai-huynh-kha` | Sitemap / Bổ sung | `NEEDS_RESEARCH` | Nguồn báo chí bị redirect sang giá vàng / trộm chó, mốc OSM vô danh; hạ xuống `NEEDS_RESEARCH`, địa chỉ & tọa độ UNKNOWN |
| 5 | `P-05` | Bánh Tét Trà Cuôn Hai Lý | `banh-tet-tra-cuon-hai-ly` | Fallback | `SOURCE_CONFLICT` | Mâu thuẫn xã Kim Hòa vs Vinh Kim, 4 số điện thoại, 3 tên miền |
| 6 | `P-06` | Cafe 1985 Trà Vinh | `cafe-1985-tra-vinh` | Bổ sung mới | `SOURCE_CONFLICT` | Có dấu hiệu đổi thương hiệu hoặc ngừng hoạt động dưới tên Cafe 1985 (chưa có nguồn trực tiếp còn hoạt động để xác nhận); lệch số 97 vs 55 |
| 7 | `P-04` | Bún Nước Lèo Cô Ba | `bun-nuoc-leo-co-ba-tra-vinh` | Fallback / Sitemap | `NEEDS_RESEARCH` | Thiếu nguồn trực tiếp cho địa chỉ cụ thể, GPS, giờ phục vụ và giá |
| 8 | `P-08` | Du Lịch CĐ Cồn Chim | `con-chim` | Fallback / Sitemap | `NEEDS_RESEARCH` | Khảo sát mô hình đa hộ, bến phà Phước Vinh |
| 9 | `P-09` | Biển Ba Động | `bien-ba-dong` | Fallback / DB #2 | `NEEDS_RESEARCH` | Khảo sát an toàn bờ kè, dự án điện gió |
| 10 | `P-10` | Chùa Hang (Kompong Chray) | `chua-hang` | Fallback / Sitemap | `NEEDS_RESEARCH` | Khảo sát tọa độ mốc GPS chính xác và thông tin liên hệ |
| 11 | `P-11` | Chùa Vàm Rây | `chua-vam-ray` | Fallback / Sitemap | `NEEDS_RESEARCH` | Khảo sát mốc GPS chính xác tại Trà Cú |
| 12 | `P-12` | Cù Lao Tân Qui | `cu-lao-tan-qui` | Fallback | `NEEDS_RESEARCH` | Khảo sát bến đò đưa rước, mùa vụ trái cây |
| 13 | `P-13` | Nhà Cổ Huỳnh Kỳ | `nha-co-huynh-ky` | Fallback | `NEEDS_RESEARCH` | Khảo sát cơ chế mở cửa của BQL Cầu Kè |
| 14 | `P-14` | Chợ Trà Vinh (Chợ Lớn) | `cho-tra-vinh` | Sitemap | `NEEDS_RESEARCH` | Khảo sát đính chính Phường 3 (không phải P1) |
| 15 | `P-15` | Chùa Cò (Chùa Nodol) | `chua-co` | Sitemap | `NEEDS_RESEARCH` | Khảo sát thông tin quản lý khu bảo tồn chim |
| 16 | `P-16` | Dừa Sáp Cầu Kè Út Nhi | `dua-sap-cau-ke-ut-nhi` | Fallback | `UNVERIFIED_LEGACY` | Loại khỏi pilot; không tìm thấy thương hiệu "Út Nhi" |
| 17 | `DB-04` | Địa điểm test Google Form | `dia-diem-test-google-form` | DB #4 | `TEST_OR_INVALID` | Đã lưu trữ (`archived`) trong G9.2 |
| 18 | `DB-06` | Địa điểm test Google Form | `dia-diem-test-google-form-mpozjzkv` | DB #6 | `TEST_OR_INVALID` | Đã lưu trữ (`archived`) trong G9.2 |
| 19 | `DB-10` | ádasdasd | `adasdasd` | DB #10 | `TEST_OR_INVALID` | Đã lưu trữ (`archived`) trong G9.2 |
| 20 | `DB-05` | XBCZ | `xbcz` | DB #5 | `TEST_OR_INVALID` | Giữ `hidden`; kiến nghị archive đợt dọn dẹp tiếp theo |
| 21 | `DB-08` | đâsdsadasd | `dd` | DB #8 | `TEST_OR_INVALID` | Giữ `hidden`; kiến nghị archive đợt dọn dẹp tiếp theo |
| 22 | `DB-09` | Ao Bà Om addđa | `dd-mpp8h72z` | DB #9 | `DUPLICATE_CANDIDATE` | Giữ `hidden`; bản ghi trùng lặp của Ao Bà Om |

---

## 3. Đánh Giá Khách Quan Về Chỉ Tiêu Pilot (Zero Artificial Quota Inflation)

> [!IMPORTANT]
> **NGUYÊN TẮC TRUNG THỰC VỀ SỐ LƯỢNG ỨNG VIÊN ĐẠT CHUẨN:**
> Dự án tuân thủ nghiêm ngặt chỉ đạo: **Nếu chưa đủ 5 địa điểm đạt chuẩn thì giữ nguyên số lượng thực tế, tuyệt đối không nâng khống mức độ tin cậy (`confidence`) hay hạ thấp tiêu chuẩn để đủ quota.**
>
> Hiện tại:
> - **`VERIFIED_CANDIDATE`**: **0 bản ghi** (bảo lưu trung thực, chỉ công nhận khi có kiểm chứng thực địa trực tiếp).
> - **`VERIFIED_IDENTITY_CANDIDATE`**: **3 địa điểm** đáp ứng đầy đủ tiêu chí xác minh danh tính và hồ sơ pháp lý:
>   1. **Danh thắng Ao Bà Om** (`ao-ba-om`) — Di tích Danh lam thắng cảnh Quốc gia (1994).
>   2. **Chùa Âng** (`chua-ang`) — Di tích Lịch sử - Văn hóa Quốc gia (1994).
>   3. **Đền thờ Bác Hồ Trà Vinh** (`den-tho-bac-ho-tra-vinh`) — Di tích Lịch sử Quốc gia (1989).
> - **`NEEDS_FIELD_VERIFICATION`**: **0 bản ghi** (KDL Huỳnh Kha đã hạ xuống `NEEDS_RESEARCH` do toàn bộ nguồn ban đầu không sử dụng được).
> - **`SOURCE_CONFLICT`**: **2 bản ghi** (`pilot-05` Bánh Tét Hai Lý, `pilot-06` Cafe 1985).
> - **`NEEDS_RESEARCH`**: **5 bản ghi** (`pilot-04` Bún Cô Ba, `pilot-07` KDL Huỳnh Kha, `pilot-08` Cồn Chim, `pilot-09` Biển Ba Động, `pilot-10` Chùa Hang).
>
> Chi tiết 7 địa điểm chưa đạt chuẩn được phân loại đúng bản chất khoa học:
> - **Bánh Tét Trà Cuôn Hai Lý:** `SOURCE_CONFLICT` do xung đột ranh giới xã Kim Hòa/Vinh Kim, 4 số điện thoại và 3 tên miền website.
> - **Cafe 1985 Trà Vinh:** `SOURCE_CONFLICT` do có dấu hiệu đổi thương hiệu hoặc ngừng hoạt động dưới tên Cafe 1985 (chưa có nguồn trực tiếp còn hoạt động để xác nhận) và mâu thuẫn số nhà 97 vs A3/55.
> - **Bún Nước Lèo Cô Ba:** `NEEDS_RESEARCH` do thiếu nguồn trực tiếp cho địa chỉ cụ thể, GPS, giờ phục vụ và giá; bài Báo Cần Thơ chuyển hướng sang bài thịt heo nhập khẩu.
> - **KDL Sinh Thái Huỳnh Kha:** `NEEDS_RESEARCH` do các bài báo cũ chuyển hướng sai nội dung (sang bài giá vàng và bài nhóm trộm chó dùng súng điện); mốc OSM vô danh; chuyển toàn bộ địa chỉ và tọa độ về `UNKNOWN`.
> - **Cồn Chim:** `NEEDS_RESEARCH` phụ thuộc lịch phà Phước Vinh và mô hình hợp tác xã đa hộ.
> - **Biển Ba Động:** `NEEDS_RESEARCH` cần khảo sát an toàn bờ kè và các công trình điện gió; cổng thông tin tỉnh lỗi TLS.
> - **Chùa Hang:** `NEEDS_RESEARCH` cần khảo sát đo đạc mốc GPS chính xác; cổng thông tin Sở lỗi DNS.

---

## 4. Bảng Chuyển Đổi Địa Giới Hành Chính (Nghị Quyết 1687/NQ-UBTVQH15)

Dự án áp dụng việc chuẩn hóa địa chỉ hiện hành theo đúng Nghị quyết 1687/NQ-UBTVQH15 (hiệu lực từ 01/07/2025):

| STT | Ứng viên | `legacy_address` (Trước 01/07/2025) | `current_address` (Sau 01/07/2025 theo NQ 1687/NQ-UBTVQH15) | Quy chuẩn sáp nhập hành chính |
| :---: | :--- | :--- | :--- | :--- |
| 1 | `pilot-01` (Ao Bà Om) | Khóm 4, Phường 8, Thành phố Trà Vinh, Tỉnh Trà Vinh | Khóm 4, phường Nguyệt Hóa, tỉnh Vĩnh Long | P7/P8 TP Trà Vinh sáp nhập thành phường Nguyệt Hóa, tỉnh Vĩnh Long |
| 2 | `pilot-02` (Chùa Âng) | Khóm 4, Phường 8, Thành phố Trà Vinh, Tỉnh Trà Vinh | Khóm 4, phường Nguyệt Hóa, tỉnh Vĩnh Long | P7/P8 TP Trà Vinh sáp nhập thành phường Nguyệt Hóa, tỉnh Vĩnh Long |
| 3 | `pilot-03` (Đền thờ Bác Hồ) | Ấp Vĩnh Hội, Xã Long Đức, Thành phố Trà Vinh, Tỉnh Trà Vinh | Ấp Vĩnh Hội, phường Long Đức, tỉnh Vĩnh Long | P4/Xã Long Đức sáp nhập thành phường Long Đức, tỉnh Vĩnh Long |
| 4 | `pilot-04` (Bún Nước Lèo Cô Ba) | Đường Nguyễn Thị Minh Khai, Phường 7, Thành phố Trà Vinh, Tỉnh Trà Vinh | Đường Nguyễn Thị Minh Khai, phường Nguyệt Hóa, tỉnh Vĩnh Long | P7/P8 TP Trà Vinh sáp nhập thành phường Nguyệt Hóa, tỉnh Vĩnh Long |
| 5 | `pilot-05` (Bánh Tét Trà Cuôn) | Quốc lộ 53, Ấp Trà Cuôn, Xã Kim Hòa (hoặc Vinh Kim), Huyện Cầu Ngang, Tỉnh Trà Vinh | Quốc lộ 53, Ấp Trà Cuôn, xã Vinh Kim, tỉnh Vĩnh Long | Xã Vinh Kim/Kim Hòa sáp nhập, điều chỉnh thuộc tỉnh Vĩnh Long |
| 6 | `pilot-06` (Cafe 1985) | 97 Phạm Ngũ Lão (hoặc A3/55 Phạm Ngũ Lão), Khóm 4, Phường 1, Thành phố Trà Vinh, Tỉnh Trà Vinh | `UNKNOWN` *(Lưu cả 97 và A3/55 vào `address_candidates`)* | P1/P3/P9 TP Trà Vinh thành phường Trà Vinh, tỉnh Vĩnh Long; do mâu thuẫn số nhà nên chưa chọn cố định |
| 7 | `pilot-07` (KDL Huỳnh Kha) | Đường Chu Văn An, Ấp Long Bình, Phường 4, Thành phố Trà Vinh, Tỉnh Trà Vinh | `UNKNOWN` *(Lưu Đường Chu Văn An, Ấp Long Bình, phường Long Đức vào `address_candidates`)* | P4/Xã Long Đức sáp nhập thành phường Long Đức; do toàn bộ nguồn bị chuyển hướng sai nên chưa có nguồn xác minh địa chỉ |
| 8 | `pilot-08` (Cồn Chim) | Cù lao Cồn Chim, Xã Hòa Minh, Huyện Châu Thành, Tỉnh Trà Vinh | Cù lao Cồn Chim, xã Hòa Minh, tỉnh Vĩnh Long | Xã Hòa Minh thuộc tỉnh Vĩnh Long theo NQ 1687 |
| 9 | `pilot-09` (Biển Ba Động) | Xã Trường Long Hòa, Thị xã Duyên Hải, Tỉnh Trà Vinh | Khu du lịch Ba Động, phường Trường Long Hòa, tỉnh Vĩnh Long | Trường Long Hòa / P2 TX Duyên Hải thành phường Trường Long Hòa, tỉnh Vĩnh Long |
| 10 | `pilot-10` (Chùa Hang) | Khóm 3, Thị trấn Châu Thành, Huyện Châu Thành, Tỉnh Trà Vinh | Khóm 3, xã Châu Thành, tỉnh Vĩnh Long | Khoản 34 NQ 1687: Sáp nhập thị trấn Châu Thành thành xã Châu Thành, tỉnh Vĩnh Long |

---

## 5. Bảng Trạng Thái Nguồn Dẫn Sâu & Kiểm Toán Mạng Thực Tế (Live Link & Semantic Audit Table)

Toàn bộ 31 URL nguồn và mốc trắc địa cho 10 ứng viên đã được kiểm toán trực tiếp qua công cụ `npm run audit:g9:pilot:links`, đánh giá cả kết nối mạng (Transport) và tính liên quan nội dung (Semantic Relevance):

### 5.1. Hệ Thống 7 Trạng Thái Nguồn
1. **`active_relevant`**: URL phản hồi HTTP 200 và tiêu đề/nội dung khớp đúng thực thể ứng viên (được phép dùng làm bằng chứng).
2. **`dead`**: URL trả mã HTTP 404 hoặc chuyển hướng tới trang `/404` (nguồn đã bị gỡ).
3. **`unreachable`**: Không thể kết nối do lỗi hạ tầng mạng, tên miền DNS (`ENOTFOUND`) hoặc chứng chỉ số TLS (`ERR_TLS_CERT_ALTNAME_INVALID`).
4. **`blocked`**: Bị máy chủ nguồn chặn truy cập với mã HTTP 401 hoặc 403.
5. **`redirected_unrelated`**: URL phản hồi HTTP 200 nhưng bị chuyển hướng tới bài viết khác hoàn toàn không liên quan (thịt heo nhập khẩu, giá vàng, trộm chó, phòng thủ EU). CẤM dùng làm bằng chứng.
6. **`content_mismatch`**: URL phản hồi HTTP 200 nhưng nội dung không có thực thể (trang SPA không có tiêu đề, URL OSM `/search?query=` chỉ là truy vấn tìm kiếm tọa độ, mốc OSM không có tên). CẤM dùng làm bằng chứng.
7. **`unchecked`**: Nguồn chưa thực hiện kiểm tra qua mạng.

### 5.2. Bảng Kết Quả Kiểm Toán 31 URL

| STT | Ứng viên | URL Nguồn Chứng Minh | Loại Nguồn | Trạng Thái Live | HTTP Thực | Tiêu Đề / Nội Dung & Ghi Chú Ngữ Nghĩa |
| :---: | :--- | :--- | :--- | :---: | :---: | :--- |
| 1 | `pilot-01` | `https://bvhttdl.gov.vn/danh-lam-thang-canh-ao-ba-om-tinh-tra-vinh-2021.htm` | `official_portal` | `active_relevant` | 200 | *Trà Vinh: Công nhận điểm du lịch Khu di tích danh thắng Ao Bà Om* (Khớp đúng Ao Bà Om) |
| 2 | `pilot-01` | `https://vietnamtourism.gov.vn/post/1045` | `official_portal` | `content_mismatch` | 200 | Trang web dạng SPA, HTML rỗng không chứa thông tin thực thể Ao Bà Om |
| 3 | `pilot-01` | `https://www.openstreetmap.org/relation/11831818` | `community_cartographic_source` | `active_relevant` | 200 | Mốc trắc địa OSM relation (OSM element có tên/tag khớp thực thể: *Ao Bà Om*) |
| 4 | `pilot-02` | `https://vietnamtourism.gov.vn/post/4908` | `official_portal` | `content_mismatch` | 200 | Trang web dạng SPA, HTML rỗng không chứa thông tin thực thể Chùa Âng |
| 5 | `pilot-02` | `https://bvhttdl.gov.vn/di-tich-lich-su-van-hoa-chua-ang-wat-angkorajaborey.htm` | `official_portal` | `active_relevant` | 200 | *Trà Vinh phát huy giá trị di sản...* (Nội dung chứng minh di tích Chùa Âng) |
| 6 | `pilot-02` | `https://www.openstreetmap.org/node/5347209172` | `community_cartographic_source` | `active_relevant` | 200 | Mốc trắc địa OSM node (OSM element có tên/tag khớp thực thể: *Chùa Âng* chánh điện) |
| 7 | `pilot-03` | `https://vietnamtourism.gov.vn/post/1047` | `official_portal` | `content_mismatch` | 200 | Trang web dạng SPA, HTML rỗng không chứa thông tin Đền thờ Bác Hồ |
| 8 | `pilot-03` | `https://nhandan.vn/den-tho-bac-ho-o-tra-vinh-bieu-tuong-long-dan-nam-bo-post647000.html` | `official_press` | `active_relevant` | 200 | *Chủ tịch nước dâng hương tại đền thờ Chủ tịch Hồ Chí Minh tại Trà Vinh* |
| 9 | `pilot-03` | `https://www.openstreetmap.org/way/451892019` | `community_cartographic_source` | `active_relevant` | 200 | Mốc trắc địa OSM way (OSM element có tên/tag khớp thực thể: *Đền thờ Bác Hồ* cổng vào) |
| 10 | `pilot-04` | `https://dulichtravinh.com.vn/am-thuc-tra-vinh-bun-nuoc-leo` | `official_portal` | `unreachable` | --- | Lỗi chứng chỉ TLS (`ERR_TLS_CERT_ALTNAME_INVALID`) |
| 11 | `pilot-04` | `https://baocantho.com.vn/dam-da-bun-nuoc-leo-tra-vinh-a120415.html` | `official_press` | `redirected_unrelated` | 200 | Chuyển hướng sang bài: *Thịt heo nhập khẩu không dễ mua - Báo Cần Thơ Online* |
| 12 | `pilot-04` | `https://www.openstreetmap.org/search?query=9.9385%2C106.3380` | `community_cartographic_source` | `content_mismatch` | 200 | OSM `/search?query=` chỉ là truy vấn tìm kiếm, không chứng minh được mốc thực tế |
| 13 | `pilot-05` | `https://nhandan.vn/lang-nghe-banh-tet-tra-cuon-post689123.html` | `official_press` | `redirected_unrelated` | 200 | Chuyển hướng sang bài: *EU thúc đẩy khối phòng thủ chung* |
| 14 | `pilot-05` | `http://banhtet2ly.com/lien-he` | `official_business` | **`dead`** | **404** | Chuyển sang https và trả mã HTTP 404 Not Found |
| 15 | `pilot-05` | `http://banhtettracuontravinh.com.vn/lien-he` | `official_business` | `active_relevant` | 200 | *Liên hệ – Bánh tét Trà Cuôn Hai Lý* (Khớp đúng thực thể) |
| 16 | `pilot-05` | `https://www.openstreetmap.org/search?query=9.8350%2C106.3950` | `community_cartographic_source` | `content_mismatch` | 200 | OSM `/search?query=` chỉ là truy vấn tìm kiếm, không chứng minh được mốc thực tế |
| 17 | `pilot-06` | `https://benthanhtourist.com/tin-tuc/top-quan-cafe-dep-tai-tra-vinh` | `business_listing` | **`dead`** | **404** | Bài viết đã bị gỡ, trả mã HTTP 404 Not Found |
| 18 | `pilot-06` | `https://mytour.vn/vi/bai-viet/kham-pha-cafe-1985-tra-vinh.html` | `business_listing` | **`dead`** | **404** | Chuyển hướng tới `https://mytour.vn/404` |
| 19 | `pilot-06` | `https://www.openstreetmap.org/search?query=9.9380%2C106.3450` | `community_cartographic_source` | `content_mismatch` | 200 | OSM `/search?query=` chỉ là truy vấn tìm kiếm, không chứng minh được mốc thực tế |
| 20 | `pilot-07` | `https://thuonghieucongluan.com.vn/kdl-huynh-kha-diem-du-lich-tieu-bieu-dbscl-a198214.html` | `official_press` | `redirected_unrelated` | 200 | Chuyển hướng sang bài: *Giá vàng hôm nay 30/7: Giá vàng 9999, vàng SJC...* |
| 21 | `pilot-07` | `https://baovephapluat.vn/van-hoa-xa-hoi/du-lich-am-thuc/tra-vinh-cong-nhan-diem-du-lich-huynh-kha-145210.html` | `official_press` | `redirected_unrelated` | 200 | Chuyển hướng sang bài: *Nhóm đối tượng trộm chó dùng súng điện bắn lực lượng...* |
| 22 | `pilot-07` | `https://www.openstreetmap.org/way/789123450` | `community_cartographic_source` | `content_mismatch` | 200 | Phần tử OSM way 789123450 không có thẻ name chứng minh KDL Huỳnh Kha |
| 23 | `pilot-08` | `https://sovhttdl.travinh.gov.vn/diem-du-lich-cong-dong-con-chim` | `official_portal` | `unreachable` | --- | Lỗi phân giải tên miền DNS (`ENOTFOUND`) |
| 24 | `pilot-08` | `https://vietnamtourism.gov.vn/post/31045` | `official_portal` | `content_mismatch` | 200 | Trang web dạng SPA, HTML rỗng không chứa thông tin thực thể Cồn Chim |
| 25 | `pilot-08` | `https://www.openstreetmap.org/search?query=9.8980%2C106.4150` | `community_cartographic_source` | `content_mismatch` | 200 | OSM `/search?query=` chỉ là truy vấn tìm kiếm, không chứng minh được mốc thực tế |
| 26 | `pilot-09` | `https://dulichtravinh.com.vn/khu-du-lich-bien-ba-dong` | `official_portal` | `unreachable` | --- | Lỗi chứng chỉ TLS (`ERR_TLS_CERT_ALTNAME_INVALID`) |
| 27 | `pilot-09` | `https://baotravinh.vn/du-lich/danh-thuc-tiem-nang-du-lich-bien-ba-dong-29810.html` | `official_press` | `unreachable` | --- | Lỗi chuỗi chứng chỉ TLS (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`) |
| 28 | `pilot-09` | `https://www.openstreetmap.org/search?query=9.6730%2C106.5700` | `community_cartographic_source` | `content_mismatch` | 200 | OSM `/search?query=` chỉ là truy vấn tìm kiếm, không chứng minh được mốc thực tế |
| 29 | `pilot-10` | `https://sovhttdl.travinh.gov.vn/di-tich-chua-hang-wat-kompong-chray` | `official_portal` | `unreachable` | --- | Lỗi phân giải tên miền DNS (`ENOTFOUND`) |
| 30 | `pilot-10` | `https://vietnamtourism.gov.vn/post/1046` | `official_portal` | `content_mismatch` | 200 | Trang web dạng SPA, HTML rỗng không chứa thông tin thực thể Chùa Hang |
| 31 | `pilot-10` | `https://www.openstreetmap.org/search?query=9.8967%2C106.3083` | `community_cartographic_source` | `content_mismatch` | 200 | OSM `/search?query=` chỉ là truy vấn tìm kiếm, không chứng minh được mốc thực tế |

### 5.3. Bảng Tổng Hợp Trạng Thái & 3 Chỉ Số Độc Lập

```
=== BẢNG PHÂN LOẠI TÌNH TRẠNG LIÊN KẾT NGUỒN ===
- TỔNG SỐ URL KIỂM TOÁN:                         31 (31/31 checked)
- HOẠT ĐỘNG & ĐÚNG NỘI DUNG (active_relevant):   7
- ĐÃ CHẾT / 404 (dead):                          3
- KHÔNG THỂ KẾT NỐI (unreachable - DNS/TLS):     5
- CHUYỂN HƯỚNG SAI NỘI DUNG (redirected_unrelated): 4
- NỘI DUNG / MỐC KHÔNG KHỚP (content_mismatch):  12
- BỊ CHẶN TRUY CẬP (blocked - HTTP 401/403):     0
- CHƯA KIỂM TRA (unchecked):                     0

=== CHỈ SỐ ĐỘC LẬP (INDEPENDENT METRICS) ===
- Transport Reachable (Phản hồi hạ tầng mạng):  26 / 31 (83.9%)
- Semantic Relevant (Nội dung đúng thực thể):   7 / 31 (22.6%)
- Evidence Usable (Đủ điều kiện làm bằng chứng): 7 / 31 (22.6%)
```

> [!WARNING]
> **QUY TẮC PHÁT NGÔN & BẰNG CHỨNG (TERMINOLOGY & EVIDENCE CONTRACT):**
> - **TUYỆT ĐỐI KHÔNG DÙNG CỤM "31/31 VERIFIED"**: 31 URL chỉ là số lượng đã qua kiểm toán mạng (**31/31 checked**). Trong đó chỉ có **7/31** nguồn đủ điều kiện sử dụng làm bằng chứng (**Evidence Usable**).
> - **CẤM DÙNG "active" CHUNG CHUNG**: Mọi nguồn HTTP 200 phải được phân tách thành `active_relevant`, `redirected_unrelated` hoặc `content_mismatch`.
> - **NGUỒN BỊ CHẶN KHỎI BẰNG CHỨNG**: Toàn bộ các nguồn `dead`, `unreachable`, `redirected_unrelated`, và `content_mismatch` (bao gồm URL tìm kiếm OSM) tuyệt đối không được đưa vào `field_sources`.

---

## 6. Kết Luận & Trạng Thái Dừng

- Toàn bộ hồ sơ nghiên cứu và phiếu xác minh chi tiết cho từng ứng viên được lưu trữ độc lập tại [`docs/g9-verification-dossiers.md`](file:///home/huutien-tran/antigravity/vivutravinh/docs/g9-verification-dossiers.md) và [`data/g9-pilot-candidates.json`](file:///home/huutien-tran/antigravity/vivutravinh/data/g9-pilot-candidates.json).
- **Cam kết an toàn tuyệt đối:**
  - Zero Production Mutation: Không ghi vào CSDL Supabase Production.
  - Zero Production Draft: Không tạo bản nháp trên Production.
  - Zero Commit: Giữ nguyên working tree để Quản trị viên soát xét nguồn.
  - Zero Push & Zero Deploy: Mọi tệp chỉ nằm ở môi trường cục bộ.
- Dừng lại tại trạng thái: **`READY FOR MANUAL SOURCE REVIEW`**.
