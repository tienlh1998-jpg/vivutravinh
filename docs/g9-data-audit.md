# Báo Cáo Kiểm Toán Dữ Liệu Production (G9.0 Baseline Audit)

> **Dự án:** ViVuTraVinh — Cẩm nang du lịch tự túc & bản đồ số Trà Vinh  
> **Mốc thực hiện:** G9.0 — Đóng hồ sơ G8 và lập baseline production  
> **Thời điểm kiểm toán (timestamp):** `2026-09-21T08:29:30.087Z`  
> **Chế độ xác thực (authMode):** `admin_token`  
> **Phạm vi quan sát (scope):** `admin_visible`  
> **Trạng thái Baseline:** **BASELINE COMPLETE (ADMIN_VISIBLE)**  
> **Phương pháp:** Kiểm toán chỉ đọc (Read-Only), ZERO MUTATION, ZERO SECRETS, ZERO PII  

---

## 1. Tóm Tắt Hiện Trạng Cơ Sở Dữ Liệu Production

Hạ tầng quản trị vận hành G8 đã hoàn tất và được nghiệm thu:
- Vòng kiểm toán trực tiếp **G8 Live Audit đạt 10/10 PASS**.
- Quy trình tự động dọn dẹp fixture sau kiểm toán đạt **0 dòng rác còn sót**.
- Hai commit vá lỗi schema production cuối cùng đã được ghi nhận:
  - `c0d5c6a`: `fix(db): preserve comment photo_url on existing schemas`
  - `1e24d02`: `fix(db): backfill comment update timestamp column`

### Bảng Thống Kê Số Liệu & Phạm Vi Quan Sát

| Thực thể | Số lượng quan sát | Scope quan sát | Trạng thái chi tiết | Đánh giá chất lượng |
| :--- | :---: | :---: | :--- | :--- |
| **Địa điểm (`places`)** | **9** | `admin_visible` | approved: 2, draft: 1, hidden: 6, archived: 0 | ⚠️ Có 3 bản ghi nghi dữ liệu thử nghiệm cần xem xét xử lý. |
| **Bình luận (`place_comments`)** | **2** | `admin_visible` | approved: 0, pending: 2, hidden: 0, rejected: 0 | Quản trị viên quan sát 2 bình luận qua API. |
| **Báo sai (`place_reports`)** | **0** | `admin_visible` | pending: 0, reviewed: 0, resolved: 0, dismissed: 0 | Quản trị viên quan sát 0 báo sai qua API. |
| **Snapshot Fallback (`data-fallback.json`)** | **12** | `local_snapshot` | Snapshot local đang chờ xác minh nguồn | ⚠️ Chưa đồng bộ đủ approved (0/12 approved, 3/12 mọi status); có bất đối xứng với sitemap.xml. |
| **Sitemap (`sitemap.xml`)** | **12** | `public_seo` | 12 đường dẫn canonical `/place/{slug}` | ⚠️ Đang chứa một số slug chưa đồng bộ với fallback JSON/Supabase. |

> [!NOTE]
> **Xác nhận Baseline Scope (Chế độ `admin_token`):**
> - **Đường cơ sở phạm vi quản trị (ADMIN_VISIBLE) đã hoàn thành đầy đủ.**
> - Hệ thống đã phân trang và đọc thành công 100% bản ghi địa điểm (mọi status: approved, draft, archived), bình luận và phản ánh báo sai qua các API quản trị Vercel với quyền Bearer token.
> - Toàn bộ số liệu nội bộ đã được xác thực (`verified = true`). Không cần nâng cấp thêm trừ khi cần kiểm toán mức hệ quản trị CSDL cấp thấp qua service role.

---

## 2. Danh Mục Chi Tiết Dữ Liệu Địa Điểm Đã Quan Sát

> [!WARNING]
> Các bản ghi dưới đây là **toàn bộ bản ghi quan sát được qua API Quản trị** (gồm mọi trạng thái: `approved`, `draft`, `archived`...). Chỉ các bản ghi có trạng thái `approved` mới hiển thị trên giao diện người dùng công khai.

### Bảng Kiểm Kê Địa Điểm (`places`)

| ID | Tên địa điểm | Slug | Status | Phân loại đề xuất | Khuyến nghị hành động | Lý do đánh dấu |
| :---: | :--- | :--- | :---: | :--- | :---: | :--- |
| **8** | đâsdsadasd | `dd` | `hidden` | `cần xác minh` | **giữ lại & bổ sung** | Thiếu các trường: ảnh, địa chỉ, GPS |
| **9** | Ao Bà Om addđa | `dd-mpp8h72z` | `hidden` | `cần xác minh` | **giữ lại & bổ sung** | Thiếu các trường: địa chỉ, GPS |
| **10** | ádasdasd | `adasdasd` | `approved` | `nghi dữ liệu test` | **đề xuất archive** | Chứa từ khóa/mẫu dữ liệu thử nghiệm: "adasdasd" |
| **6** | Địa điểm test Google Form | `dia-diem-test-google-form-mpozjzkv` | `draft` | `nghi dữ liệu test` | **đề xuất archive** | Chứa từ khóa/mẫu dữ liệu thử nghiệm: "test" |
| **5** | XBCZ | `xbcz` | `hidden` | `cần xác minh` | **giữ lại & bổ sung** | Thiếu các trường: ảnh, GPS, liên hệ, Google Maps |
| **4** | Địa điểm test Google Form | `dia-diem-test-google-form` | `approved` | `nghi dữ liệu test` | **đề xuất archive** | Chứa từ khóa/mẫu dữ liệu thử nghiệm: "test" |
| **1** | Ao Bà Om aa | `ao-ba-om` | `hidden` | `cần xác minh` | **giữ lại & bổ sung** | Thiếu các trường: liên hệ |
| **2** | Biển Ba Động DH | `bien-ba-dong` | `hidden` | `cần xác minh` | **giữ lại & bổ sung** | Thiếu các trường: liên hệ |
| **3** | Chùa Âng | `chua-ang` | `hidden` | `cần xác minh` | **giữ lại & bổ sung** | Thiếu các trường: liên hệ |

---

## 3. Phân Tích Độ Đầy Đủ Dữ Liệu (Observed Field Completeness)

Thống kê trường dữ liệu trên 9 bản ghi production/admin-visible đã quan sát:

- **Ảnh (`images`, `image_link`):** 7/9 bản ghi có ảnh (trong đó 5 bản ghi dùng file ảnh cục bộ, 1 bản ghi dùng link drive chưa public).
- **Địa chỉ (`address`):** 3 bản ghi không hợp lệ hoặc thiếu.
- **Tọa độ GPS (`coordinates`):** 4 bản ghi thiếu tọa độ GPS.
- **Giờ mở cửa (`opening_time`, `closing_time`):** 1 bản ghi thiếu giờ mở cửa.
- **Khoảng giá (`price_raw`):** 1 bản ghi thiếu khoảng giá.
- **Thông tin liên hệ (`contact`):** 7 bản ghi thiếu thông tin liên hệ.
- **Liên kết bản đồ (`map_link`):** 2 bản ghi thiếu Google Maps.
- **Trùng lặp Slug (`slug`):** 0 (Không phát hiện trùng lặp).

---

## 4. Đối Soát Giữa Fallback JSON, Sitemap và Supabase Production

Có sự bất đối xứng dữ liệu giữa các nguồn dữ liệu của dự án:

1. **Snapshot Fallback (`data/data-fallback.json`):**
   - Chứa **12** địa điểm mẫu dạng local snapshot đang chờ xác minh nguồn gốc và bản quyền.
   - Đối soát trạng thái CSDL Production:
     - Tồn tại ở bất kỳ trạng thái nào (`matchedAnyStatus`): **3/12** địa điểm.
     - Tồn tại và đang công khai (`matchedApproved`): **0/12** địa điểm.
2. **Sitemap (`sitemap.xml`):**
   - Chứa **12** canonical URLs.
   - Đồng bộ SEO công khai (chỉ tính approved): **0/12** canonical URLs đã có bản ghi `approved` trên Supabase.
   - Có sự lệch cấu trúc slug so với Fallback:
     - Fallback dùng `bun-nuoc-leo-co-ba-tra-vinh` ↔ Sitemap dùng `bun-nuoc-leo-co-ba`
     - Fallback dùng `dua-sap-cau-ke-ut-nhi` ↔ Sitemap dùng `dua-sap-cau-ke`
     - Fallback dùng `den-tho-bac-ho-tra-vinh` ↔ Sitemap dùng `den-tho-bac-ho`
   - 3 địa điểm có trong Sitemap nhưng thiếu trong Fallback JSON: `cho-tra-vinh`, `chua-co`, `khu-du-lich-sinh-thai-huynh-kha`.
   - 3 địa điểm có trong Fallback JSON nhưng thiếu trong Sitemap: `cu-lao-tan-qui`, `nha-co-huynh-ky`, `banh-tet-tra-cuon-hai-ly`.
   - ⚠️ Cảnh báo SEO: 3 URL trong Sitemap tương ứng với địa điểm chưa approved trong CSDL: `ao-ba-om` (hidden), `bien-ba-dong` (hidden), `chua-ang` (hidden).

---

## 5. Kế Hoạch Đề Xuất Cho Các Giai Đoạn Tiếp Theo (Zero Mutation Trong G9.0)

> [!IMPORTANT]
> Toàn bộ các mục dưới đây là **ĐỀ XUẤT THIẾT KẾ VÀ QUY TRÌNH**, tuân thủ nghiêm ngặt nguyên tắc **ZERO MUTATION trong G9.0**:
> - Tuyệt đối không xóa, không sửa, không archive bất kỳ bản ghi nào trong G9.0.
> - Việc xử lý dữ liệu test sẽ chỉ diễn ra tại G9.2 sau khi có kế hoạch dọn dẹp chi tiết và người dùng phê duyệt.

1. **Xử lý dữ liệu thử nghiệm (Dự kiến G9.2):**
   - Đề xuất xem xét lưu trữ (chuyển sang `archived`) đối với các bản ghi nghi dữ liệu thử nghiệm: ID 10 (approved), ID 6 (draft), ID 4 (approved) (hành động chỉ là đề xuất kỹ thuật, tuân thủ nghiêm ngặt ZERO MUTATION trong G9.0).
   - Ưu tiên archive thay vì hard delete để giữ tính toàn vẹn của ID sequence và audit log.
2. **Contract chất lượng dữ liệu và Validator (G9.1):**
   - Xây dựng bộ quy tắc validator 3 mức (Required, Verified, Optional).
   - Kiểm soát tính hợp lệ của tọa độ GPS Trà Vinh, định dạng Google Maps, giờ mở cửa.
3. **Pilot 5–10 địa điểm thật (G9.3):**
   - Chuẩn hóa nguồn gốc và phiếu xác minh cho 5–10 địa điểm du lịch tiêu biểu từ Fallback JSON trước khi nạp vào Supabase.
4. **Đồng bộ hóa Fallback, SEO và Offline (G9.4):**
   - Thống nhất quy ước slug duy nhất và đồng bộ giữa Supabase, Fallback JSON và Sitemap.
