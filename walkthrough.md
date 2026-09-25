# Báo Cáo Kỹ Thuật G9.4: Hoàn Tất Mở Rộng Địa Điểm & Đưa Web Lên Production

> **Dự án:** ViVuTraVinh — Cẩm nang du lịch tự túc & bản đồ số Trà Vinh  
> **Phiên bản:** **v2.1.0**  
> **Giai đoạn:** G9 — Hoàn tất G9.4 & Nghiệm thu toàn diện Production  
> **Thời điểm cập nhật:** `2026-09-25T08:25:00+07:00`  
> **Website Live:** [https://vivutravinh.id.vn](https://vivutravinh.id.vn)  
> **Trạng thái mốc G9.4:** 🟢 **HOÀN TẤT 100% CẢ 7 BƯỚC THEO CHỈ THỊ QC**  

---

## TỔNG QUAN KẾT QUẢ THỰC THI 7 BƯỚC

| Bước | Nội dung công việc | Thao tác trên Live DB | Kết quả / Trạng thái Route | Commit Git |
| :--- | :--- | :--- | :--- | :--- |
| **Bước 1** | Dọn 6 bản ghi rác/test | PATCH ID 4, 5, 6, 8, 9, 10 $\rightarrow$ `archived` | Cả 6 slug rác trả về **HTTP 404 Not Found** | [`e07476e`](https://github.com/tienlh1998-jpg/vivutravinh/commit/e07476e) |
| **Bước 2** | Phục hồi & Approve Ao Bà Om (ID 1) | Chuẩn hóa tên "Ao Bà Om", khử fake 5 sao & note, sửa địa chỉ NQ 1687, status $\rightarrow$ `approved` | Route `/place/ao-ba-om` $\rightarrow$ **HTTP 200 OK** | [`ab8d33c`](https://github.com/tienlh1998-jpg/vivutravinh/commit/ab8d33c) |
| **Bước 3** | Tạo & Approve Đền thờ Bác Hồ Trà Vinh | Tạo draft $\rightarrow$ Cấp **ID 89** $\rightarrow$ Kiểm tra 404 $\rightarrow$ Approve với OCC | Route `/place/den-tho-bac-ho-tra-vinh` $\rightarrow$ **HTTP 200 OK** | [`7f785e5`](https://github.com/tienlh1998-jpg/vivutravinh/commit/7f785e5) |
| **Bước 4** | Tạo & Approve tuần tự 3 ứng viên mở rộng | Tạo draft $\rightarrow$ Approve với OCC: Chùa Hang (**ID 90**), Cồn Chim (**ID 91**), Chùa Vàm Rây (**ID 92**) | Cả 3 route `/place/...` $\rightarrow$ **HTTP 200 OK** | [`c3e84b0`](https://github.com/tienlh1998-jpg/vivutravinh/commit/c3e84b0) |
| **Bước 5** | Đồng bộ Fallback, Sitemap & Service Worker | Cập nhật `data-fallback.json` (chỉ 7 approved), cập nhật `sitemap.xml` (xóa slug ma, lastmod 2026-09-25), tăng cache SW v2.10.0 | Đồng bộ 100% với CSDL Live | [`e337c7b`](https://github.com/tienlh1998-jpg/vivutravinh/commit/e337c7b) |
| **Bước 6** | Xử lý 3 bản ghi ẩm thực/đặc sản | Thẩm định Zero-Speculation: Bún Nước Lèo (**ID 93**), Bánh Tét Trà Cuôn (**ID 94**), Dừa Sáp Cầu Kè (**ID 95**) $\rightarrow$ Giữ `draft` | Cả 3 route `/place/...` $\rightarrow$ **HTTP 404 Not Found** an toàn | [`8b8beb9`](https://github.com/tienlh1998-jpg/vivutravinh/commit/8b8beb9) |
| **Bước 7** | Regression Test & Nghiệm thu toàn bộ | Chạy `npm run check`, `test:g9`, `test:g9:public-route`, `test:ui`, `build`, quét toàn bộ live routes | **100% PASS** (200 OK: 7/7, 404: 13/13) | Hoàn tất |

---

## I. DANH SÁCH 7 ĐỊA ĐIỂM APPROVED TRÊN PRODUCTION

Toàn bộ 7 địa điểm dưới đây đã được kiểm định nghiêm ngặt theo chuẩn **G9 Zero-Speculation**:
- Không tự suy diễn giá tiền (`price_raw: null` $\rightarrow$ hiển thị *"Liên hệ"*).
- Không tạo rating ảo (`rating: null` $\rightarrow$ hiển thị *"Chưa có đánh giá"*).
- Không tự bịa giờ hoạt động (`opening_time/closing_time: null` $\rightarrow$ badge *"Chưa rõ giờ mở"*).
- Không gán hotline giả (`contact: null` $\rightarrow$ khối liên hệ được ẩn an toàn).
- Không dùng ảnh chưa có bản quyền (`images: []` $\rightarrow$ placeholder SVG trung tính nội bộ).
- Địa chỉ tuân thủ Nghị quyết 1687/NQ-UBTVQH15 (thuộc tỉnh Vĩnh Long sau điều chỉnh địa giới).

| STT | ID | Tên địa điểm | Slug | Danh mục | Tọa độ GPS | Nguồn gốc chính thức | HTTP Route |
| :---: | :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| 1 | **1** | **Ao Bà Om** | `ao-ba-om` | Điểm Check-in / Sống Ảo | `9.9347, 106.3449` | Cục Du lịch Quốc gia / Báo Nhân Dân | **200 OK** |
| 2 | **2** | **Biển Ba Động** | `bien-ba-dong` | Điểm Check-in / Sống Ảo | `9.6730, 106.5700` | Cục Du lịch Quốc gia Việt Nam | **200 OK** |
| 3 | **3** | **Chùa Âng** | `chua-ang` | Du Lịch Tâm Linh | `9.9322, 106.3364` | Di tích Lịch sử - Văn hóa cấp Quốc gia (QĐ 1460-QĐ/VH) | **200 OK** |
| 4 | **89** | **Đền thờ Bác Hồ Trà Vinh** | `den-tho-bac-ho-tra-vinh` | Du Lịch Tâm Linh | `9.9705, 106.3382` | Báo Nhân Dân (QĐ 98/VH-QĐ) / OSM way 451892019 | **200 OK** |
| 5 | **90** | **Chùa Hang** | `chua-hang` | Du Lịch Tâm Linh | `9.8967, 106.3083` | Báo Nhân Dân / OSM khuôn viên chùa Kompong Ch'rây | **200 OK** |
| 6 | **91** | **Du Lịch Cộng Đồng Cồn Chim** | `con-chim` | Du Lịch Sinh Thái / Cộng Đồng | `9.9167, 106.4274` | Báo Nhân Dân OCOP / Giải thưởng Du lịch ASEAN 2025 | **200 OK** |
| 7 | **92** | **Chùa Vàm Rây** | `chua-vam-ray` | Du Lịch Tâm Linh | `9.6670, 106.2580` | Báo Nhân Dân / OSM khuôn viên chùa ấp Vàm Ray | **200 OK** |

---

## II. DANH SÁCH BẢN GHI RÁC ĐÃ ARCHIVE & ẨM THỰC DRAFT

### 1. Dữ liệu rác/test đã lưu trữ (Archived) — Route trả về HTTP 404
- **ID 4:** `dia-diem-test-google-form` (Địa điểm test Google Form)
- **ID 5:** `xbcz` (XBCZ)
- **ID 6:** `dia-diem-test-google-form-mpozjzkv` (Địa điểm test Google Form)
- **ID 8:** `dd` (đâsdsadasd)
- **ID 9:** `dd-mpp8h72z` (Ao Bà Om addđa)
- **ID 10:** `adasdasd` (ádasdasd)

### 2. Dữ liệu ẩm thực / đặc sản giữ trạng thái Draft — Route trả về HTTP 404
- **ID 93:** `bun-nuoc-leo-co-ba-tra-vinh` (Bún Nước Lèo Cô Ba Trà Vinh)  
  *Lý do giữ draft:* Không tìm thấy nguồn chính thống cấp tỉnh/quốc gia xác nhận hộ kinh doanh Cô Ba tại địa chỉ 45 Đồng Khởi; thông tin thực địa mâu thuẫn giữa đường 19/5 và Đồng Khởi.
- **ID 94:** `banh-tet-tra-cuon-hai-ly` (Bánh Tét Trà Cuôn Hai Lý)  
  *Lý do giữ draft:* Cơ sở Hai Lý có bài viết trên Báo Nhân Dân và OCOP 3/4 sao, nhưng tọa độ GPS chỉ là mốc ước tính trên Quốc lộ 53, chưa có node/way OpenStreetMap xác thực chính xác mặt bằng kinh doanh.
- **ID 95:** `dua-sap-cau-ke-ut-nhi` (Dừa Sáp Cầu Kè Út Nhi)  
  *Lý do giữ draft:* Không tìm thấy thương hiệu hoặc hộ kinh doanh "Út Nhi" trong hồ sơ OCOP hoặc báo chí chính thống.

---

## III. BẢO CHỨNG REGRESSION VÀ NGHIỆM THU CUỐI CÙNG

1. **`npm run check`:** ✅ **PASS 100%** trên toàn bộ 48 tệp JavaScript/Node.js của dự án.
2. **`npm run test:g9`:** ✅ **36/36 PASS** bộ kiểm định contract validator và chính sách kiểm soát lỗi.
3. **`npm run test:g9:public-route`:** ✅ **PASS 100%** cho các trường hợp route SSR, CSR, và ngắt kết nối fallback.
4. **`npm run test:ui`:** ✅ **PASS 100%** cả 5 viewports di động / máy tính bảng / máy tính để bàn, accessibility, touch target $\ge$ 44px.
5. **`npm run build`:** ✅ **Thành công 100%**, tạo bản phát hành tĩnh `dist/` độc lập với dung lượng 6.56 MB.
6. **Live Routes Production Verification:**
   - **7/7 Route Approved:** Trả về **HTTP 200 OK** với tiêu đề và canonical chính xác.
   - **13/13 Route Draft / Archived / Ghost:** Trả về **HTTP 404 Not Found** fail-closed an toàn tuyệt đối.
   - **Trang chủ `https://vivutravinh.id.vn/`:** Trả về **HTTP 200 OK**, hiển thị đầy đủ 7 địa điểm approved từ Supabase qua anon key.
