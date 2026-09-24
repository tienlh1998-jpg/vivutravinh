# Báo Cáo Kỹ Thuật G9.4: Vận Hành Nội Dung & Mở Rộng Địa Điểm Thực Tế

> **Dự án:** ViVuTraVinh — Cẩm nang du lịch tự túc & bản đồ số Trà Vinh  
> **Phiên bản:** **v2.1.0**  
> **Giai đoạn:** G9 — Chất lượng dữ liệu thật và vận hành nội dung  
> **Thời điểm cập nhật:** `2026-09-24T16:45:00+07:00`  
> **Mục tiêu phiên làm việc:** **G9.4-C1 — Chuẩn bị & Chạy Dry-Run cho Đền thờ Bác Hồ Trà Vinh**  
> **Trạng thái mốc G9.4-C1:** 🟢 **HOÀN TẤT DRY-RUN (ZERO PRODUCTION MUTATION — ZERO APPROVAL)**  
> **Trạng thái live CSDL Production:** Giữ nguyên 9 địa điểm, 0 mutation, route công khai Đền thờ Bác Hồ vẫn trả về **HTTP 404 Not Found**.

---

# PHẦN I: KẾT QUẢ G9.4-C1 — DRY-RUN ĐỀN THỜ BÁC HỒ TRÀ VINH

## 1. Tóm Tắt Thực Thi G9.4-C1 (Dry-Run & Preview)

Thực hiện đúng yêu cầu khắt khe của người dùng: **CHỈ CHUẨN BỊ VÀ CHẠY DRY-RUN — TUYỆT ĐỐI CHƯA TẠO BẢN GHI PRODUCTION VÀ CHƯA APPROVE**. Đã triển khai bộ công cụ chuyên dụng:
- Script mô phỏng & preview: [`scripts/preview-g9-den-tho-bac-ho.js`](file:///home/huutien-tran/antigravity/vivutravinh/scripts/preview-g9-den-tho-bac-ho.js)
- Bộ kiểm thử tự động: [`scripts/test-g9-den-tho-bac-ho.js`](file:///home/huutien-tran/antigravity/vivutravinh/scripts/test-g9-den-tho-bac-ho.js) (**18/18 PASS**)
- Snapshot Manifest dự phòng: `backups/g9-den-tho-bac-ho-pre-create-manifest-2026-09-24T08-56-03-544Z.json`

### Các khâu thẩm định đạt chuẩn:
1. **Nguồn gốc dữ liệu hạt nhân (Granular Provenance):**
   - **Tên & Mô tả:** Trích xuất từ bài viết chuyên đề của *Báo Nhân Dân* (`https://nhandan.vn/den-tho-bac-ho-o-tra-vinh-bieu-tuong-long-dan-nam-bo-post647000.html`) — Đã kiểm tra **HTTP 200 OK**, mô tả sử dụng nguyên văn `draft_payload`: *"Di tích lịch sử cấp Quốc gia được xây dựng trong những năm kháng chiến ác liệt, biểu tượng thiêng liêng cho tấm lòng son sắt của quân dân Trà Vinh đối với Chủ tịch Hồ Chí Minh."*
   - **Tọa độ (`9.9705, 106.3382`):** Trỏ đúng đối tượng khuôn viên di tích trên OpenStreetMap (`https://www.openstreetmap.org/way/451892019`) — Đã kiểm tra **HTTP 200 OK**, gắn nhãn độ chính xác `coordinate_precision: "entrance_area"` (khu vực cổng vào và bãi đỗ khuôn viên di tích theo OSM way 451892019), không mạo nhận là "mốc trắc địa".
   - **Địa giới hành chính:** Tuân thủ Nghị quyết 1687/NQ-UBTVQH15: *"Ấp Vĩnh Hội, phường Long Đức, tỉnh Vĩnh Long"*.
2. **Khử sạch suy diễn (Zero-Speculation Content Invariants):**
   - `price_raw: null` (Tuyệt đối không tự suy đoán "Miễn phí" -> UI hiển thị trung tính *"Liên hệ"*).
   - `rating: null` (Tuyệt đối không fake đánh giá 5 sao -> UI hiển thị *"Chưa có đánh giá"*).
   - `opening_time: null, closing_time: null` (Không tự bịa giờ -> UI hiển thị badge *"Chưa rõ giờ mở"*).
   - `contact: null` (Không gắn hotline giả -> Khối liên hệ được ẩn an toàn).
   - `images: []` (Khung SVG placeholder trung tính *"Đang cập nhật hình ảnh"*, không mượn ảnh chéo).
   - `status: "draft"` (Tuyệt đối chưa approve).
3. **Thẩm định hợp đồng dữ liệu (`validatePlace`):**
   - Chế độ `draft`: **0 Error**, đúng 4 cảnh báo kiểm soát (`MISSING_IMAGES`, `MISSING_HOURS`, `MISSING_CONTACT`, `MISSING_PRICE`).
   - Chế độ `approval`: **0 Error** (sẵn sàng duyệt khi có chỉ đạo).
4. **Chiến lược Snapshot & Rollback:**
   - Manifest lưu tại: `backups/g9-den-tho-bac-ho-pre-create-manifest-2026-09-24T08-56-03-544Z.json`
   - Kế hoạch rollback duy nhất: `"action": "archive"` (đối với địa điểm tạo mới, rollback chuẩn xác là archive, không xóa vĩnh viễn, loại bỏ phương án không an toàn `archive_or_delete`).
5. **Đối soát xung đột trên CSDL Live Supabase (Collision Check):**
   - Đọc CSDL Supabase Live: Hiện có đúng 9 địa điểm (8 địa điểm ban đầu + 1 địa điểm Biển Ba Động vừa duyệt).
   - Slug `den-tho-bac-ho-tra-vinh`: **Không trùng lặp** với bất kỳ bản ghi nào trong 9 địa điểm.
   - Tọa độ `9.9705, 106.3382`: **Không trùng lặp** với bất kỳ bản ghi nào trong 9 địa điểm.
   - Route công khai `https://vivutravinh.id.vn/place/den-tho-bac-ho-tra-vinh`: Trả về **HTTP 404 Not Found** (an toàn tuyệt đối, chưa hề rò rỉ dữ liệu ra ngoài).

---

## 2. Thư Viện Ảnh Chụp Màn Hình Preview G9.4-C1 (Chrome CDP Captures)

Toàn bộ 6 ảnh chụp màn hình dưới đây được kết xuất từ môi trường preview cục bộ với dữ liệu draft chuẩn hóa của Đền thờ Bác Hồ Trà Vinh, mô phỏng hoàn hảo trải nghiệm người dùng và giao diện quản trị viên (đã loại bỏ hoàn toàn các thông báo toast):

### A. Giao diện Quản trị viên (Admin Form Preview)
````carousel
![Admin Preview Light](/home/huutien-tran/.gemini/antigravity/brain/1cab34ab-f633-487c-8e0f-9175241583a3/g9-den-tho-bac-ho-admin-preview-light.png)
<!-- slide -->
![Admin Preview Dark](/home/huutien-tran/.gemini/antigravity/brain/1cab34ab-f633-487c-8e0f-9175241583a3/g9-den-tho-bac-ho-admin-preview-dark.png)
````

### B. Giao diện Công khai Desktop (Public Detail Modal Desktop)
````carousel
![Public Desktop Light](/home/huutien-tran/.gemini/antigravity/brain/1cab34ab-f633-487c-8e0f-9175241583a3/g9-den-tho-bac-ho-public-preview-desktop-light.png)
<!-- slide -->
![Public Desktop Dark](/home/huutien-tran/.gemini/antigravity/brain/1cab34ab-f633-487c-8e0f-9175241583a3/g9-den-tho-bac-ho-public-preview-desktop-dark.png)
````

### C. Giao diện Công khai Mobile (Public Detail Modal Mobile Viewport 390px)
````carousel
![Public Mobile Light](/home/huutien-tran/.gemini/antigravity/brain/1cab34ab-f633-487c-8e0f-9175241583a3/g9-den-tho-bac-ho-public-preview-mobile-light.png)
<!-- slide -->
![Public Mobile Dark](/home/huutien-tran/.gemini/antigravity/brain/1cab34ab-f633-487c-8e0f-9175241583a3/g9-den-tho-bac-ho-public-preview-mobile-dark.png)
````

---

## 3. Bảng Hồ Sơ Dữ Liệu Đề Xuất Đền Thờ Bác Hồ Trà Vinh (Proposed Draft)

| Thuộc tính | Giá trị đề xuất | Trạng thái hiển thị UI | Nguồn gốc / Căn cứ |
| :--- | :--- | :--- | :--- |
| **`slug`** | `den-tho-bac-ho-tra-vinh` | Đường dẫn định danh | Kế hoạch G9.4 (`proposed-patches.json`) |
| **`name`** | `"Đền thờ Bác Hồ Trà Vinh"` | Tiêu đề chính | Báo Nhân Dân chuyên đề |
| **`category`** | `"Du Lịch Tâm Linh"` | Badge danh mục (Khớp filter Tâm Linh / UI) | Khớp hồ sơ đề xuất G9.4 (`proposed-patches.json`) |
| **`address`** | `"Ấp Vĩnh Hội, phường Long Đức, tỉnh Vĩnh Long"` | Địa chỉ hiển thị | Nghị quyết 1687/NQ-UBTVQH15 |
| **`description`** | *"Di tích lịch sử cấp Quốc gia được xây dựng trong những năm kháng chiến ác liệt, biểu tượng thiêng liêng cho tấm lòng son sắt của quân dân Trà Vinh đối với Chủ tịch Hồ Chí Minh."* | Đoạn văn mô tả chuẩn | Nguyên văn `draft_payload` từ bài viết Báo Nhân Dân |
| **`coordinates`** | `[9.9705, 106.3382]` | Leaflet Mini Map & Google Maps | OpenStreetMap way di tích khuôn viên (451892019) |
| **`coordinate_precision`** | `"entrance_area"` | Tọa độ khu vực cổng vào và bãi đỗ khuôn viên di tích theo OSM way 451892019 | Không tự nhận mốc trắc địa |
| **`price_raw`** | `null` | Hiển thị *"Liên hệ"* | Không gán "Miễn phí" khi chưa kiểm chứng |
| **`opening_time`** | `null` | Badge *"Chưa rõ giờ mở"* | Chưa xác minh giờ mở cửa cụ thể |
| **`closing_time`** | `null` | Thẻ giờ hiển thị `"-"` | Chưa xác minh giờ đóng cửa cụ thể |
| **`rating`** | `null` | Hiển thị *"Chưa có đánh giá"* | Không fake số sao |
| **`contact`** | `null` | Ẩn khối liên hệ | Không fake số hotline |
| **`images`** | `[]` | Khung SVG *"Đang cập nhật hình ảnh"* | Không lấy ảnh trái phép / chưa bản quyền |
| **`status`** | `"draft"` | Không xuất hiện công khai (404) | Draft an toàn để preview nội bộ |

---

# PHẦN II: TỔNG HỢP TIẾN ĐỘ & BẢO LƯU KẾT QUẢ G9.4-B2 (BIỂN BA ĐỘNG)

## 1. Trạng Thái Hiện Tại Của Biển Ba Động (ID 2) Trên Live Production
- **Trạng thái:** 🟢 **`approved`** (Đã duyệt thành công tại G9.4-B2).
- **Route công khai:** 🟢 **HTTP 200 OK** (`https://vivutravinh.id.vn/place/bien-ba-dong`).
- **`updated_at` Live:** `2026-09-24T07:44:27.807066+00:00`.
- **Dữ liệu hiển thị:** Tọa độ chính xác theo ranh giới OSM, bản đồ OpenStreetMap chuẩn không lỗi tile, giá *"Liên hệ"*, giờ *"Chưa rõ giờ mở"*, không hotline, không rating ảo, hình ảnh SVG trung tính.

## 2. Bảng Đối Soát Trạng Thái Dữ Liệu Biển Ba Động (ID 2)

| Tiêu chí | Trước khi xử lý (Legacy) | Trạng thái DRAFT (G9.4-B1) | Trạng thái APPROVED Hiện Tại (G9.4-B2) |
| :--- | :--- | :--- | :--- |
| **Tên địa điểm (`name`)** | `"Biển Ba Động DH"` | `"Biển Ba Động"` | 🟢 **`"Biển Ba Động"`** |
| **Trạng thái (`status`)** | `hidden` | `draft` | 🟢 **`approved`** |
| **HTTP Route `/place/bien-ba-dong`** | `404 Not Found` (do `status: hidden`) | `404 Not Found` | 🟢 **`200 OK` (Title & Canonical chuẩn)** |
| **Giá tham khảo (`price_raw`)** | `"Miễn phí"` (chưa xác minh) | `null` -> *"Liên hệ"* | 🟢 **`null` -> *"Liên hệ"*** |
| **Giờ hoạt động (`opening_time` - `closing_time`)** | `07:00` - `18:00` (chưa xác minh) | `null` -> *"Chưa rõ giờ mở"* | 🟢 **`null` -> *"Chưa rõ giờ mở"*** |
| **Đánh giá (`rating`)** | `4` (chưa xác minh) | `null` -> *"Chưa có đánh giá"* | 🟢 **`null` -> *"Chưa có đánh giá"*** |
| **Liên hệ (`contact`)** | `null` | `null` (ẩn khối liên hệ) | 🟢 **`null` (không rò rỉ)** |
| **Hình ảnh (`images`)** | `["./biển ba động.jpg"]` (thiếu bản quyền) | `[]` -> SVG trung tính | 🟢 **`[]` -> SVG trung tính** |
| **Nguồn gốc mô tả** | Không rõ nguồn | Trích dẫn Cục Du lịch QG | 🟢 **Đã xác minh chính thức** |
| **Bản đồ Mini Map** | Lỗi tile "API KEY REQUIRED" | OpenStreetMap chuẩn | 🟢 **OpenStreetMap chuẩn + nút Google Maps** |

---

# PHẦN III: KẾT QUẢ KIỂM THỬ TOÀN DIỆN (REGRESSION GATES)

| Lệnh kiểm thử | Mục đích kiểm tra | Kết quả | Ghi chú |
| :--- | :--- | :---: | :--- |
| `npm run check` | Kiểm tra cú pháp tĩnh Node.js toàn bộ repo (49 tệp) | ✅ **PASS** | 100% hợp lệ |
| `npm run test:g9:den-tho-bac-ho` | Bộ test tự động G9.4-C1 Đền thờ Bác Hồ (nguồn, zero-speculation, validation, collision, snapshot, mutation safety) | ✅ **PASS** | **18/18 tests pass** |
| `npm run test:g9:bien-ba-dong-approve` | Bộ test tự động quy trình Approve G9.4-B2 | ✅ **PASS** | **10/10 tests pass** |
| `npm run test:g9:bien-ba-dong` | Bộ test tự động quy trình Draft & Token fail-closed | ✅ **PASS** | **11/11 tests pass** |
| `npm run test:g9:expansion` | Thẩm định kế hoạch mở rộng & dữ liệu các ứng viên G9.4 | ✅ **PASS** | **28/28 tests pass** |
| `npm run test:g9:public-route` | Chặn rò rỉ route công khai & tải OSM tiles | ✅ **PASS** | **10/10 tests pass** |
| `npm run test:g9` | Data Quality Contract & Shared Validator | ✅ **PASS** | **36/36 tests pass** |
| `npm run test:ui` | Giao diện Responsive 5 viewports, Modal, A11y | ✅ **PASS** | **100% pass** |

---

# PHẦN IV: KHẲNG ĐỊNH RANH GIỚI VÀ DỪNG LẠI CHỜ PHÊ DUYỆT

> [!IMPORTANT]
> **Cam kết ranh giới vận hành mốc G9.4-C1:**
> - **Chùa Âng (ID 3):** Đã hoàn tất phê duyệt ở mốc trước.
> - **Biển Ba Động (ID 2):** Đã hoàn tất phê duyệt ở mốc trước.
> - **Đền thờ Bác Hồ Trà Vinh (`den-tho-bac-ho-tra-vinh`):** Đã hoàn tất hồ sơ, kiểm thử tự động 18/18 PASS, xuất 6 ảnh preview. **TUYỆT ĐỐI CHƯA TẠO TRÊN PRODUCTION, CHƯA APPROVE.**
> - **3 ứng viên G9.4 còn lại:**
>   - **Chùa Hang** (`chua-hang`)
>   - **Cồn Chim** (`con-chim`)
>   - **Chùa Vàm Rây** (`chua-vam-ray`)
>   
>   👉 Đang ở trạng thái hồ sơ nghiên cứu, chưa thực hiện bất kỳ thao tác nào.
>
> 🛑 **DỪNG LẠI TẠI ĐÂY:** Đang chờ người dùng kiểm tra báo cáo kỹ thuật và duyệt kết quả dry-run trước khi tiến hành bước tiếp theo.
