# HƯỚNG DẪN KHÔI PHỤC VÀ TIẾP TỤC DỰ ÁN VIVUTRAVINH TRÊN WINDOWS VỚI AGY

> **Ngày đóng gói**: 25/09/2026  
> **Trạng thái Git**: Clean working tree, commit `097bb32` (nhánh `main`), đồng bộ 100% với GitHub remote.  
> **Trạng thái Database**: Milestone G9.4 hoàn tất (7 địa điểm approved live, 3 món ngon draft, 6 rác đã dọn, 100% test gates pass).

---

## 1. DANH MỤC CÁC THÀNH PHẦN TRONG GÓI BACKUP NÀY

1. **`vivutravinh/`** (Thư mục dự án chính — ĐẦY ĐỦ NHẤT):
   - Chứa toàn bộ mã nguồn website ViVuTraVinh.
   - Thư mục `.git/` đầy đủ lịch sử commit.
   - Đã bao gồm sẵn file bí mật: `.env.live.tmp`, `.env.local`, `.vercel/project.json` (những file này bị gitignore trên GitHub nên rất quý giá).
   - Đã bao gồm sẵn thư mục `backups/` chứa 28 file snapshot manifest JSON của cơ sở dữ liệu Supabase.
   - Đã loại bỏ `node_modules` để tránh xung đột hệ điều hành Linux/Windows và giúp copy cực nhanh.

2. **`vivutravinh_git.bundle`**:
   - File nén Git Bundle độc lập chứa 100% lịch sử git, tất cả commit, tag và branch. Có thể dùng lệnh `git clone vivutravinh_git.bundle vivutravinh` khi cần tạo lại repo sạch mà không cần mạng internet.

3. **`01_PROJECT_THIET_KE/`**:
   - Dự án Next.js thiết kế giao diện (trước đây nằm ở `/home/huutien-tran/Documents/ChatGPT/Thiết kế`).
   - Có kèm sẵn file `thiet_ke_git.bundle`.

4. **`02_QC_DOCS_AND_PROMPTS/`**:
   - Toàn bộ hồ sơ kiểm thử QA/QC, kế hoạch nâng cấp, và các prompt điều phối AGY (`PROMPT_AGY_G9_FINAL.md`, `PROMPT_STITCH_TRANG_CHU.md`, v.v.).

5. **`03_AI_IMAGES_ANHMOI/`**:
   - Thư mục ảnh AI và tư liệu gốc (`ANHMOI`).

6. **`04_DATABASE_BACKUPS_AND_SECRETS/`**:
   - Thư mục dự phòng riêng cho `.env.live.tmp`, `.env.local` và toàn bộ 28 snapshot database Supabase.

7. **`05_AGY_BRAIN_ARTIFACTS/`**:
   - Báo cáo chi tiết `walkthrough.md`, kế hoạch `implementation_plan.md` và toàn bộ ảnh chụp màn hình kiểm thử Playwright (desktop, mobile, dark/light mode).

8. **`VIVUTRAVINH_ALL_IN_ONE_2026-09-25.zip`**:
   - File nén duy nhất chứa toàn bộ tất cả các mục trên, giúp lưu trữ an toàn hoặc gửi qua đám mây khi cần.

---

## 2. CÁC BƯỚC KHÔI PHỤC TRÊN MÁY WINDOWS MỚI

### Bước 1: Cài đặt công cụ môi trường trên Windows
1. Tải và cài đặt **Git for Windows**: [https://git-scm.com/download/win](https://git-scm.com/download/win)
2. Tải và cài đặt **Node.js LTS (khuyến nghị v20.x hoặc v22.x)**: [https://nodejs.org/](https://nodejs.org/)
3. Cài đặt **Antigravity** (hoặc VS Code / Cursor tùy công cụ bạn sử dụng).

### Bước 2: Chép thư mục dự án vào máy
- Cắm USB vào máy Windows.
- Chép toàn bộ thư mục **`vivutravinh`** từ USB vào một ổ đĩa trên máy (khuyến nghị để ở ổ `D:\projects\vivutravinh` hoặc `C:\Users\<Tên_bạn>\vivutravinh`).
- *(Tùy chọn)* Chép thêm `01_PROJECT_THIET_KE` và `02_QC_DOCS_AND_PROMPTS` nếu muốn xem lại tài liệu thiết kế.

### Bước 3: Cài đặt thư viện (dependencies)
1. Mở PowerShell hoặc Windows Terminal, điều hướng vào thư mục dự án:
   ```powershell
   cd D:\projects\vivutravinh
   ```
2. Cài đặt các package:
   ```powershell
   npm install
   ```
   *(Lưu ý: Quá trình này sẽ tự động tải các gói tương thích với Windows, đảm bảo không gặp lỗi binary).*

### Bước 4: Kiểm tra và chạy thử
1. Chạy bộ kiểm thử tự động G9:
   ```powershell
   npm run test:g9
   ```
   *(Nếu thấy tất cả tests PASS là môi trường đã hoạt động hoàn hảo).*
2. Khởi động môi trường phát triển local:
   ```powershell
   npm run dev
   ```
   Mở trình duyệt truy cập: `http://localhost:5173` để xem website.

---

## 3. PROMPT ĐỂ AGY BẮT ĐẦU LÀM TIẾP NGAY LẬP TỨC

Khi bạn mở Antigravity trên máy Windows và mở thư mục `vivutravinh`, chỉ cần dán đoạn prompt sau vào ô chat với AGY:

```markdown
Chào AGY! Tôi vừa chuyển dự án ViVuTraVinh sang máy Windows mới.
Thư mục làm việc hiện tại đã có đầy đủ mã nguồn, git history, các file cấu hình bí mật (.env.live.tmp, .env.local), và thư mục backups/.
Bạn hãy:
1. Đọc file walkthrough.md và PROMPT_AGY_G9_FINAL.md để nắm trọn bối cảnh G9.4 vừa hoàn tất (7 địa điểm live, 3 món ngon draft).
2. Chạy lệnh kiểm tra `npm run test:g9` để xác nhận môi trường Windows đã sẵn sàng.
3. Báo cáo trạng thái và cho tôi biết các bước tiếp theo cần triển khai.
```

---

## 4. LƯU Ý BẢO MẬT QUAN TRỌNG
- File `.env.live.tmp` chứa `SUPABASE_SERVICE_ROLE_KEY` và `ADMIN_ACCESS_TOKEN` production. File này đã được đưa vào `.gitignore`. Tuyệt đối không commit hoặc public file này lên mạng.
- Khi làm việc trên Windows, git có thể cảnh báo về CRLF/LF. Dự án đã cấu hình chuẩn, bạn có thể chạy `git config core.autocrlf true` nếu cần.
