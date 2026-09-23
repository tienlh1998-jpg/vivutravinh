# Kế Hoạch Vòng Đời Nội Dung Pilot G9.3C (Pilot Content Lifecycle Plan)

> **Dự án:** ViVuTraVinh — Cẩm nang du lịch tự túc & bản đồ số Trà Vinh  
> **Phiên bản:** **v2.1.0**  
> **Giai đoạn:** G9 — Chất lượng dữ liệu thật và vận hành nội dung  
> **Mốc thực hiện:** **G9.3C — Kế hoạch vòng đời nội dung pilot cho ID 1 (`ao-ba-om`) và ID 3 (`chua-ang`)**  
> **Trạng thái:** 🛑 **READY FOR MANUAL PILOT DRY-RUN REVIEW**  
> **Cam kết an toàn tuyệt đối:** ✅ **Zero Production Mutation** • **Zero Push** • **Zero Deploy** • **Zero Live Draft** • **Chặn cờ `--execute`**  

---

## 1. Phạm Vi Áp Dụng & Nguyên Tắc Loại Trừ

### 1.1. Phạm Vi Thu Hẹp Duy Nhất (Chỉ 2 Địa Điểm)
Đợt pilot vòng 1 chỉ áp dụng chuẩn hóa cho **02 địa điểm thật** đã có hồ sơ xác minh nguồn gốc độc lập và kiểm chứng trắc địa trong **G9.3A**:
1. **ID 1 — `ao-ba-om` (Danh thắng Ao Bà Om)**
2. **ID 3 — `chua-ang` (Chùa Âng - Wat Angkorajaborey)**

### 1.2. Danh Sách Nghiêm Cấm Đưa Vào Production Đợt Này
- **Bún nước lèo Sáu Lý, Bến xe Trà Vinh**: Chưa có hồ sơ xác minh G9.3A hoàn tất -> Tuyệt đối không đưa vào.
- **Bánh tét Trà Cuôn Hai Lý**: Phân loại `SOURCE_CONFLICT` (nhiều chi nhánh, mâu thuẫn số nhà/tọa độ) -> Tuyệt đối không tạo draft.
- **Cafe 1985**: Phân loại `SOURCE_CONFLICT` (`operating_status: POSSIBLY_REBRANDED`, địa chỉ không xác định) -> Tuyệt đối không tạo draft.
- **Khu du lịch sinh thái Huỳnh Kha**: Phân loại `NEEDS_RESEARCH` -> Tuyệt đối không tạo draft.
- **Bún nước lèo Cô Ba, Cồn Chim, Biển Ba Động, Chùa Hang**: Phân loại `NEEDS_RESEARCH` -> Tuyệt đối không tạo draft.

---

## 2. Quy Tắc Dữ Liệu Chi Tiết (Data Contracts)

### 2.1. Địa Danh ID 1 — Ao Bà Om (`ao-ba-om`)
- **Tên hiển thị (`name`)**: `Ao Bà Om`  
  *Hành động*: Xóa triệt để hậu tố rác `"aa"` khỏi tên gốc `Ao Bà Om aa`.
- **Đường dẫn tĩnh (`slug`)**: `ao-ba-om`  
  *Hành động*: Giữ nguyên tuyệt đối. Không thay đổi slug để bảo vệ liên kết sitemap, canonical và bookmark người dùng.
- **Phân loại (`category`)**: `Điểm Check-in / Sống Ảo` (giữ nguyên phân loại hiện hành; có thể bổ sung danh mục tham quan trong tương lai).
- **Địa bàn (`area`)**: `TP. Trà Vinh`
- **Địa chỉ hiển thị (`address`)**: `Khóm 4, phường Nguyệt Hóa, tỉnh Vĩnh Long`  
  *Căn cứ pháp lý*: Nghị quyết số 1687/NQ-UBTVQH15 về sắp xếp đơn vị hành chính cấp xã.
- **Địa chỉ truyền thống (`legacy_address`)**: `Khóm 4, Phường 8, Thành phố Trà Vinh, Tỉnh Trà Vinh` (lưu trữ trong metadata kiểm toán để phục vụ tra cứu).
- **Tọa độ GPS (`coordinates`)**: `9.9347,106.3449`  
  *Căn cứ trắc địa*: OpenStreetMap Relation 11831818 (tâm hồ và khuôn viên mặt nước Ao Bà Om).
- **Liên kết bản đồ (`map_link`)**: `https://www.google.com/maps?q=9.9347,106.3449`
- **Giờ hoạt động (`opening_time`, `closing_time`, `display_hours`)**: `null`  
  *Quy tắc*: Thắng cảnh công cộng ngoài trời không có cổng đóng mở cố định; không tự suy đoán giờ mở/đóng cửa giả tạo.
- **Thông tin liên hệ (`contact`)**: `null`  
  *Quy tắc*: Loại bỏ các số điện thoại mô phỏng; giữ `null` khi chưa có ban quản lý công bố hotline chính thức.
- **Giá dịch vụ (`price_raw`)**: `null`  
  *Quy tắc*: Loại bỏ chuỗi "Miễn phí" do người biên tập trước tự điền khi chưa có văn bản niêm yết biểu giá chính thức.
- **Hình ảnh (`images`, `image_link`)**: `images: []`, `image_link: null`  
  *Cơ chế thực thi runtime*: Do ảnh nội bộ `./ao bà om.jpg` chưa được thẩm định tác quyền và giấy phép xuất bản, runtime đặt bắt buộc `images: []` và `image_link: null` trong bản vá. Điều này ngăn chặn triệt để nguy cơ xuất bản ảnh vi phạm bản quyền ra công chúng (kể cả khi bản ghi chuyển sang `approved`). Trong `field_sources`, metadata ghi nhận `can_publish: false`.

### 2.2. Địa Danh ID 3 — Chùa Âng (`chua-ang`)
- **Tên hiển thị (`name`)**: `Chùa Âng` (tên Khmer: Wat Angkorajaborey).
- **Đường dẫn tĩnh (`slug`)**: `chua-ang` (giữ nguyên 100%).
- **Phân loại (`category`)**: `Du Lịch Tâm Linh`
- **Địa bàn (`area`)**: `TP. Trà Vinh`
- **Địa chỉ hiển thị (`address`)**: `Khóm 4, phường Nguyệt Hóa, tỉnh Vĩnh Long` (theo NQ 1687/NQ-UBTVQH15).
- **Địa chỉ truyền thống (`legacy_address`)**: `Khóm 4, phường 8, TP. Trà Vinh`.
- **Tọa độ GPS (`coordinates`)**: `9.9322,106.3364` (mốc OSM Node 5347209172 tòa chánh điện).
- **Liên kết bản đồ (`map_link`)**: `https://www.google.com/maps?q=9.9322,106.3364`
- **Giờ hoạt động (`opening_time`, `closing_time`, `display_hours`)**: `null` (chưa có quy định niêm yết chính thức từ Ban Quản trị).
- **Thông tin liên hệ (`contact`)**: `null`.
- **Giá dịch vụ (`price_raw`)**: `null`.
- **Hình ảnh (`images`, `image_link`)**: `images: []`, `image_link: null`  
  *Cơ chế thực thi runtime*: Tương tự ID 1, ảnh `./chùa âng.jpg` chưa qua thẩm định pháp lý bản quyền nên được đặt `images: []` và `image_link: null` để runtime bảo vệ an toàn tuyệt đối; `field_sources.images` ghi nhận `can_publish: false`.

---

## 3. Quy Trình Chuyển Đổi Trạng Thái 3 Bước (Content State Lifecycle)

Nghiêm cấm tuyệt đối việc chuyển thẳng từ `hidden` sang `approved`. Toàn bộ dữ liệu phải tuân thủ nghiêm ngặt chu trình 3 bước:

```
[ Bước 1: Patch Chuẩn Hóa ] ──> [ Bước 2: Admin Preview ] ──> [ Bước 3: Manual Approval ]
       (hidden -> draft)               (dry-run / preview)              (draft -> approved)
```

### Bước 1: `hidden` -> `draft` (Trạng thái Rà soát Nội dung)
1. Áp dụng bản vá chuẩn hóa dữ liệu (tên, địa chỉ, xóa giờ giả, xóa giá giả, runtime rỗng ảnh chưa xác minh bản quyền).
2. Chạy bộ kiểm tra chất lượng `js/place-validator.js`:
   - `mode: 'draft'`: Không có bất kỳ lỗi cú pháp hoặc XSS nào (`errors_count: 0`).
   - Cảnh báo thiếu giờ/giá và cảnh báo thiếu ảnh (`WARN_MISSING_IMAGES`) được chấp nhận theo đúng bản chất di tích công cộng đang chờ ảnh bản quyền.
3. Ghi nhật ký kiểm toán `admin_audit_logs` với `action: 'place.prepare_draft'`.

### Bước 2: Kiểm Tra & Xem Trước Giao Diện (Admin Preview)
1. Mở giao diện xem trước trong Modal Preview tại `/admin.html`.
2. Kiểm tra hiển thị responsive tại các kích thước 360px, 390px, 1280px.
3. Xác nhận giao diện hiển thị fallback placeholder an toàn khi `images: []` và `image_link: null`.
4. Người vận hành trực tiếp kiểm tra nội dung mô tả và mốc tọa độ trên bản đồ.

### Bước 3: Phê Duyệt Thủ Công (Manual Approval)
1. Thao tác phê duyệt là **hành động thủ công độc lập** của Quản trị viên sau khi đã xác nhận trực quan ở Bước 2.
2. Kiểm tra lại optimistic concurrency: xác nhận không có thay đổi nào trên CSDL kể từ lúc xem trước.
3. Chuyển trạng thái sang `approved` qua RPC nguyên tử `admin_update_place_atomic`.
4. Thực hiện read-back kiểm tra tính toàn vẹn và xác nhận hiển thị trên route công khai `https://vivutravinh.id.vn/place/{slug}`.

---

## 4. Cơ Chế Khóa Lạc Quan & Chiến Lược Phục Hồi (Optimistic Concurrency & Rollback)

### 4.1. Khóa Lạc Quan Thật (Optimistic Concurrency Control — expected_updated_at & HTTP 409)
Mỗi bản vá chuẩn bị chứa `concurrency_token`:
- `expected_before_sha256`: Mã băm SHA-256 từ snapshot trước khi thay đổi.
- `expected_updated_at`: Dấu thời gian cập nhật chính xác của bản ghi trước khi thay đổi.

Khi API `PATCH /api/admin-places` hoặc hàm cơ sở dữ liệu `admin_update_place_atomic` nhận payload:
- So sánh `expected_updated_at` với `updated_at` thực tế trên hàng CSDL.
- Nếu không trùng khớp (do có tác vụ khác cập nhật trước đó), hệ thống lập tức trả về **HTTP 409 CONFLICT** với mã lỗi `CONFLICT` và **hủy bỏ hoàn toàn thao tác mà không gây ra bất kỳ mutation nào**.
- Điều kiện UPDATE trong SQL giao dịch: `where id = p_place_id and (updated_at = p_patch->>'expected_updated_at')`.

### 4.2. Khôi Phục Toàn Vẹn (Rollback Contract)
Bản vá JSON lưu trữ sẵn `rollback_payload` chứa giá trị snapshot gốc trước thay đổi của **toàn bộ các trường bị thay đổi (`changed_fields`)**, không phải toàn bộ mọi trường của `beforeRecord`. Hợp đồng phục hồi cam kết:
- Áp dụng `rollback_payload` đưa toàn bộ các trường đã bị thay đổi quay về chính xác 100% giá trị gốc của `beforeRecord`. Các trường không bị thay đổi trong quá trình patch được giữ nguyên toàn vẹn.
- Trường duy nhất thay đổi là `updated_at` ghi nhận thời điểm thao tác khôi phục được thực hiện.

---

## 5. Ràng Buộc Triển Khai & Quy Trình Live Snapshot

> [!IMPORTANT]
> **Thứ Tự Áp Dụng Migration CSDL & Deploy API**:
> Migration [`supabase/g8_admin.sql`](file:///home/huutien-tran/antigravity/vivutravinh/supabase/g8_admin.sql) (bổ sung kiểm tra khóa lạc quan `expected_updated_at` và điều kiện `updated_at` trong hàm `admin_update_place_atomic`) **bắt buộc phải được chạy trên CSDL Supabase Production TRƯỚC KHI deploy mã nguồn API mới** (`api/admin-places.js`).  
> *Hiện tại ở checkpoint này: Tuyệt đối chưa chạy SQL migration trên production, chưa deploy API, chưa mutation, và chưa push/deploy.*

> [!NOTE]
> **Trạng Thái Bản Vá Sau Live Dry-Run (QC Đã Xác Minh)**:
> Live dry-run G9.3C đã được QC xác minh: 2/2 bản vá đọc trực tiếp từ `live_supabase` (manifest `g9-pilot-1-3-manifest-2026-09-23T08-21-45-915Z.json`), chưa mutation.  
> Tệp [`data/g9-pilot-1-3-proposed-patches.json`](file:///home/huutien-tran/antigravity/vivutravinh/data/g9-pilot-1-3-proposed-patches.json) được chuẩn hóa với ba trường metadata tự động:
> - `data_source`: Lấy trực tiếp từ manifest (`"live_supabase"`).
> - `captured_at`: Lấy chính xác thời điểm chụp từ manifest (`"2026-09-23T08:21:45.915Z"`).
> - `is_valid_production_patch`: Đặt `true` khi và chỉ khi `data_source === "live_supabase"`. Nếu không phải `live_supabase`, trường này bắt buộc là `false` kèm trường `notice` cảnh báo.

---

## 6. Nguyên Tắc Fail-Closed & Danh Mục Công Cụ

### 6.1. Nguyên Tắc Fail-Closed Truy Vấn Live
- Mỗi lần sinh kế hoạch hoặc kiểm toán production bắt buộc phải đọc trực tiếp ID 1 và ID 3 từ Supabase Production.
- **Nghiêm cấm tự ý fallback sang snapshot cũ trong `backups/`**.
- Nếu thiếu biến môi trường credentials (`SUPABASE_SERVICE_ROLE_KEY` hoặc `ADMIN_ACCESS_TOKEN`), hoặc kết nối mạng/API thất bại, hệ thống lập tức ngắt với lỗi `FAIL_CLOSED`.
- Snapshot manifest bắt buộc ghi rõ `data_source = 'live_supabase'` và `captured_at`.

### 6.2. Danh Mục Công Cụ & Test Suite
1. **`npm run audit:g9:pilot-production -- --read-only`**:
   - Quét read-only trực tiếp trên Supabase Production.
   - Trích xuất ID 1, ID 3, comments, reports và audit logs liên quan.
   - Fail-closed khi không có credentials hoặc kết nối lỗi.
2. **`npm run plan:g9:pilot -- --ids=1,3 --dry-run`**:
   - Chụp snapshot trực tiếp từ production vào `backups/g9-pilot-1-3-manifest-<timestamp>.json`.
   - Sinh file bản vá `data/g9-pilot-1-3-proposed-patches.json`.
   - Chặn tuyệt đối cờ `--execute`.
3. **`npm run test:g9:pilot-lifecycle`**:
   - Bộ kiểm thử tự động 20/20 kịch bản kiểm tra toàn diện: fail-closed, optimistic concurrency 409, runtime image enforcement, rollback integrity, và thư mục tạm cách ly.
