# PROMPT GIAO VIỆC CHO AGY — HOÀN TẤT G9.4 & ĐƯA WEB VIVUTRAVINH LÊN PRODUCTION

> **Ngày giao:** 2026-09-25
> **Dự án:** `/home/huutien-tran/antigravity/vivutravinh`
> **Phiên bản hiện tại:** v2.1.0
> **Website live:** https://vivutravinh.id.vn
> **Tham chiếu:** Báo cáo G9.4 tại `/home/huutien-tran/.gemini/antigravity/brain/1cab34ab-f633-487c-8e0f-9175241583a3/walkthrough.md`

---

## BỐI CẢNH HIỆN TẠI (ĐỌC KỸ TRƯỚC KHI LÀM)

### Trạng thái CSDL Production Supabase (9 bản ghi):
- **Chùa Âng (ID 3):** ✅ `approved` — route `/place/chua-ang` HTTP 200
- **Biển Ba Động (ID 2):** ✅ `approved` — route `/place/bien-ba-dong` HTTP 200
- **Ao Bà Om (ID 1):** `hidden` — cần xử lý (tên cũ "Ao Bà Om aa")
- **ID 4, 6, 10:** Dữ liệu test rác ("đâsdsadasd", "Địa điểm test Google Form", "ádasdasd") — cần archive
- **ID 5, 8, 9:** Dữ liệu rác/test khác — cần archive

### Trạng thái dry-run đã hoàn tất (CHƯA TẠO TRÊN PRODUCTION):
- **Đền thờ Bác Hồ Trà Vinh** (`den-tho-bac-ho-tra-vinh`): dry-run 18/18 PASS, script sẵn sàng

### 3 ứng viên còn lại (MỚI Ở GIAI ĐOẠN NGHIÊN CỨU, CHƯA CÓ SCRIPT):
- **Chùa Hang** (`chua-hang`) — Du Lịch Tâm Linh
- **Cồn Chim** (`con-chim`) — Du Lịch Sinh Thái / Cộng Đồng
- **Chùa Vàm Rây** (`chua-vam-ray`) — Du Lịch Tâm Linh

### Dữ liệu fallback JSON (`data/data-fallback.json`) có 12 bản ghi:
- Bao gồm 3 bản ghi mới chưa có trên Supabase: Bún Nước Lèo Cô Ba, Bánh Tét Trà Cuôn Hai Lý, Dừa Sáp Cầu Kè Út Nhi (category: Món Ngon / Đặc Sản)

### Sitemap (`sitemap.xml`) liệt kê 12 slug:
- Có slug chưa đồng bộ: `cho-tra-vinh`, `bun-nuoc-leo-co-ba`, `dua-sap-cau-ke`, `chua-co`, `den-tho-bac-ho` (slug khác với `den-tho-bac-ho-tra-vinh`), `khu-du-lich-sinh-thai-huynh-kha`

---

## NHIỆM VỤ CẦN HOÀN THÀNH (THEO THỨ TỰ)

### BƯỚC 1: Dọn dữ liệu rác trên Production
1. **Archive** các bản ghi test/rác trên Supabase Production: ID 4, 5, 6, 8, 9, 10.
2. Snapshot backup TRƯỚC KHI archive (tương tự pattern `backups/` đã có).
3. Xác minh sau archive: chỉ còn 3 bản ghi hợp lệ (ID 1 Ao Bà Om, ID 2 Biển Ba Động, ID 3 Chùa Âng).

### BƯỚC 2: Phục hồi & Approve Ao Bà Om (ID 1)
1. Cập nhật ID 1 theo chuẩn G9 Zero-Speculation:
   - Tên chính xác: `"Ao Bà Om"` (bỏ chữ "aa")
   - Mô tả: lấy từ nguồn chính thức (Cục Du lịch Quốc gia hoặc Báo Nhân Dân), ghi rõ provenance
   - Tọa độ: `9.9347, 106.3449` (đã có sẵn, xác minh lại trên OSM)
   - Địa chỉ: cập nhật theo NQ 1687/NQ-UBTVQH15 (tỉnh Vĩnh Long thay vì Trà Vinh)
   - Các trường chưa xác minh: `price_raw: null`, `rating: null`, `opening_time: null`, `closing_time: null`, `contact: null`, `images: []`
   - Status: `draft` → xác minh → `approved`
2. Xác minh route `/place/ao-ba-om` trả HTTP 200 sau approve.

### BƯỚC 3: Tạo & Approve Đền thờ Bác Hồ Trà Vinh
1. Sử dụng script `scripts/preview-g9-den-tho-bac-ho.js` đã chuẩn bị.
2. Tạo bản ghi production với `status: "draft"`.
3. Chạy test `npm run test:g9:den-tho-bac-ho` — phải đạt 18/18.
4. Approve → xác minh route `/place/den-tho-bac-ho-tra-vinh` trả HTTP 200.

### BƯỚC 4: Tạo & Approve 3 ứng viên còn lại (tuần tự từng địa điểm)
Với MỖI ứng viên (Chùa Hang → Cồn Chim → Chùa Vàm Rây), thực hiện đầy đủ pipeline:

1. **Nghiên cứu & thẩm định dữ liệu hạt nhân:**
   - Tìm bài viết chính thức (Báo Nhân Dân, Cục Du lịch QG, trang chính thức tỉnh) — ghi URL nguồn
   - Xác minh tọa độ trên OpenStreetMap — ghi OSM way/node ID
   - Địa chỉ theo NQ 1687 (tỉnh Vĩnh Long)
   - Mô tả trích từ nguồn chính thức, nguyên văn hoặc tóm tắt trung thực

2. **Zero-Speculation (BẮT BUỘC cho mọi bản ghi):**
   - `price_raw: null` (KHÔNG tự suy "Miễn phí")
   - `rating: null` (KHÔNG fake đánh giá)
   - `opening_time: null, closing_time: null` (KHÔNG tự bịa giờ)
   - `contact: null` (KHÔNG gắn hotline giả)
   - `images: []` (KHÔNG lấy ảnh chưa bản quyền)

3. **Script dry-run & test:** viết script tương tự pattern `preview-g9-den-tho-bac-ho.js` và `test-g9-den-tho-bac-ho.js`

4. **Kiểm tra va chạm:** slug & tọa độ không trùng với bất kỳ bản ghi nào trên CSDL

5. **Tạo draft → chạy test → approve → xác minh route HTTP 200**

Dữ liệu tham chiếu đã có trong `implementation_plan.md`:
| Ứng viên | Slug | Tọa độ | URL nguồn |
|---|---|---|---|
| Chùa Hang | `chua-hang` | `9.8967, 106.3083` | https://nhandan.vn/doc-dao-chua-khmer-o-tra-vinh-post769288.html |
| Cồn Chim | `con-chim` | `9.9167, 106.4274` | https://nhandan.vn/ocop/vinh-long-phat-trien-kinh-te-du-lich-theo-khong-gian-moi-post919861.html |
| Chùa Vàm Rây | `chua-vam-ray` | `9.6670, 106.2580` | https://nhandan.vn/doc-dao-chua-khmer-o-tra-vinh-post769288.html |

### BƯỚC 5: Đồng bộ dữ liệu fallback, sitemap và SEO
1. **Cập nhật `data/data-fallback.json`:** đồng bộ 100% với Supabase production — chỉ chứa các bản ghi `approved` thực tế. Loại bỏ mọi bản ghi không có trên production.
2. **Cập nhật `sitemap.xml`:** chỉ chứa slug thực sự approved trên production. Loại bỏ slug ma (`cho-tra-vinh`, `chua-co`, `khu-du-lich-sinh-thai-huynh-kha`, `den-tho-bac-ho` → đổi thành `den-tho-bac-ho-tra-vinh`). Thêm slug mới (`den-tho-bac-ho-tra-vinh`, `chua-hang`, `con-chim`, `chua-vam-ray`). Cập nhật `<lastmod>` thành ngày thực thi.
3. **Cập nhật `service-worker.js`:** tăng `CACHE_NAME` version để client nhận bản mới.
4. **Cập nhật SEO meta trong `index.html`:** nếu có hardcode số lượng địa điểm hoặc danh sách, cập nhật cho khớp.

### BƯỚC 6: Xử lý 3 bản ghi Món Ngon / Đặc Sản trong fallback
Hiện `data-fallback.json` có 3 bản ghi ẩm thực chưa có trên Supabase:
- Bún Nước Lèo Cô Ba Trà Vinh (`bun-nuoc-leo-co-ba-tra-vinh`)
- Bánh Tét Trà Cuôn Hai Lý (`banh-tet-tra-cuon-hai-ly`)
- Dừa Sáp Cầu Kè Út Nhi (`dua-sap-cau-ke-ut-nhi`)

**Xử lý:** Áp dụng cùng pipeline G9.4 (nghiên cứu nguồn → zero-speculation → dry-run → test → tạo draft → approve → xác minh route). Nếu KHÔNG tìm được nguồn chính thức đáng tin cho bản ghi nào, giữ `status: "draft"` và ghi rõ lý do chưa approve.

### BƯỚC 7: Regression & Nghiệm thu cuối
1. Chạy `npm run check` — phải PASS 100%
2. Chạy `npm run test:g9` — phải PASS toàn bộ
3. Chạy `npm run test:g9:public-route` — phải PASS
4. Chạy `npm run test:ui` — phải PASS
5. Chạy `npm run build` — phải thành công
6. Xác minh TẤT CẢ route `/place/{slug}` approved đều trả HTTP 200
7. Xác minh KHÔNG CÒN route ma nào trả HTTP 200 cho dữ liệu test/rác
8. Kiểm tra trang chủ `https://vivutravinh.id.vn/` hiển thị đúng danh sách địa điểm approved

---

## NGUYÊN TẮC BẮT BUỘC

1. **Snapshot backup TRƯỚC MỌI mutation** — lưu vào `backups/` với timestamp.
2. **OCC (Optimistic Concurrency Control):** mọi PATCH/UPDATE phải đọc `updated_at` live và dùng `expected_updated_at`. KHÔNG hard-code.
3. **Từng địa điểm một:** KHÔNG batch tạo/approve. Hoàn tất xác minh 1 địa điểm rồi mới chuyển sang tiếp theo.
4. **ADMIN_ACCESS_TOKEN:** bắt buộc cho mọi mutation script. Script phải fail-closed nếu thiếu token.
5. **Không fake dữ liệu:** bất kỳ trường nào chưa xác minh được từ nguồn chính thức → để `null` hoặc `[]`.
6. **Không commit secret** vào repo.
7. **Git commit** sau mỗi bước hoàn tất (1 commit/bước, message rõ ràng).
8. **Xuất ảnh preview** (Chrome CDP captures) cho mỗi địa điểm mới: desktop/mobile, light/dark.

---

## BÁO CÁO KẾT QUẢ (TEMPLATE)

Sau khi hoàn tất, báo cáo theo format:

```
### KẾT QUẢ HOÀN TẤT G9.4

**Tổng số địa điểm approved trên production:** X
**Danh sách:**
| # | Tên | Slug | Route | HTTP Status |
|---|-----|------|-------|-------------|

**Dữ liệu rác đã archive:** [liệt kê ID]
**Regression test:** [pass/fail]
**Sitemap & Fallback:** [đã đồng bộ / chưa]
**Lỗi/giới hạn còn lại:** [nếu có]
**Đề xuất bước tiếp theo:** [nếu có]
```

---

## GHI CHÚ THÊM

- Đọc file `CLAUDE.md` trong repo để nắm convention.
- Tham chiếu `implementation_plan.md` trong brain folder cho dữ liệu ứng viên đã thẩm định.
- Tham chiếu `docs/g9-data-audit.md` cho baseline audit ban đầu.
- Pattern script đã có sẵn: `execute-g9-bien-ba-dong-draft.js`, `execute-g9-bien-ba-dong-approve.js`, `preview-g9-den-tho-bac-ho.js` — follow cùng pattern cho các địa điểm mới.
- Đọc `.env.live.tmp` để lấy config Supabase (KHÔNG commit file này).
- Web live trên Vercel, deploy tự động khi push. Sau khi hoàn tất tất cả bước, hỏi user có muốn push/deploy không.
