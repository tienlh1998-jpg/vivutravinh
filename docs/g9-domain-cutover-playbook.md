# ViVu Trà Vinh — G9.3B Domain Cutover & Migration Playbook

> **Mục tiêu**: Chuyển domain chính `vivutravinh.id.vn` từ GitHub Pages sang Vercel, chuẩn hóa toàn bộ production URL, chống canonical host injection, bảo tồn khả năng rollback an toàn, và cung cấp quy trình kiểm thử 11 hạng mục nghiêm ngặt.  
> **Trạng thái hiện tại**: 🛑 **READY FOR MANUAL DOMAIN CUTOVER** (Không đổi DNS, không xóa CNAME, không trigger deploy, không thay đổi production).

---

## 1. Kiểm kê URL cứng `vivutravinh.vercel.app` (48 vị trí trước G9.3B)

Trước G9.3B, mã nguồn chứa 48 lần xuất hiện `https://vivutravinh.vercel.app`:

| Nhóm tập tin | Vị trí | Số lượng | Giải pháp chuẩn hóa |
| :--- | :--- | :---: | :--- |
| **Cấu hình & Client App** | `js/config.js`, `js/app.js` | 3 | Sử dụng `PRIMARY_DOMAIN`, `DEFAULT_SITE_URL` và `getSiteUrl()`, chống host injection |
| **Serverless SSR** | `api/og-place.js` | 6 | Sử dụng `getBaseUrl(req)` với allowlist nghiêm ngặt, chuẩn hóa `www` về apex |
| **SEO & Metadata** | `index.html` | 8 | Cập nhật `canonical`, `og:url`, `og:image`, `twitter:image`, Schema JSON-LD |
| **Sitemap & Robots** | `sitemap.xml`, `robots.txt` | 17 | Thay thế toàn bộ bằng domain chính `https://vivutravinh.id.vn` |
| **Google Apps Script** | `google-apps-script/import-place.gs` | 1 | Trỏ endpoint về `https://vivutravinh.id.vn/api/import-place` |
| **Edge Routing** | `vercel.json` | 1 | Thêm 308 redirect từ `www.vivutravinh.id.vn` sang apex `vivutravinh.id.vn` |
| **Bộ kiểm thử & Công cụ** | `scripts/test-g7-release.js`, `scripts/audit-g9-*.js` | 12 | Cập nhật assertion chấp nhận domain chính thống nhất |

---

## 2. Kiến Trúc `SITE_URL` Dùng Chung & Chống Canonical Host Injection

### 2.1. Phía Client (Trình duyệt & PWA) — `js/config.js`
- Allowlist: `ALLOWED_CANONICAL_HOSTS = ['vivutravinh.id.vn', 'www.vivutravinh.id.vn']`.
- Hàm `getSiteUrl()` phục vụ sinh thẻ canonical link và chia sẻ URL:
  - Bất kể người dùng đang truy cập từ `localhost`, môi trường `preview.vercel.app`, hay `www.vivutravinh.id.vn`, hàm đều trả về `DEFAULT_SITE_URL` (`https://vivutravinh.id.vn`).
  - Chặn đứng hoàn toàn việc injection origin lạ hoặc preview host vào thẻ `<link rel="canonical">`.

### 2.2. Phía Serverless SSR — `api/og-place.js`
- Hàm `getBaseUrl(request)`:
  1. Không tin tùy ý header `host` hay `x-forwarded-host`.
  2. Kiểm tra `process.env.SITE_URL`: chỉ chấp nhận nếu là URL giao thức HTTPS và hostname thuộc allowlist (`vivutravinh.id.vn` hoặc `www.vivutravinh.id.vn`).
  3. Bất kể request gửi đến `www.vivutravinh.id.vn` hay apex, URL canonical luôn chuẩn hóa về `https://vivutravinh.id.vn`.
  4. Header giả mạo (`evil.example`), `javascript:`, `http:`, hoặc preview domains (`.vercel.app`) tự động fallback an toàn về `https://vivutravinh.id.vn`.

### 2.3. Chuyển hướng Edge `www` sang Apex — `vercel.json`
- Quy tắc Edge redirect HTTP 308 permanent:
```json
{
  "source": "/:path*",
  "has": [
    {
      "type": "host",
      "value": "www.vivutravinh.id.vn"
    }
  ],
  "destination": "https://vivutravinh.id.vn/:path*",
  "permanent": true
}
```

---

## 3. Quy trình Thủ công: Thêm Domain vào Vercel & Đổi DNS

> [!IMPORTANT]
> **Quy tắc An Toàn G9.3B**:
> 1. **Không viết cứng bản ghi DNS**: Các giá trị IP `76.76.21.21` và CNAME `cname.vercel-dns.com` chỉ là giá trị tham khảo. Người vận hành **bắt buộc phải lấy bản ghi chính xác do Vercel cung cấp** tại thời điểm cấu hình.
> 2. **Ưu tiên xác thực quyền sở hữu (TXT Verification)**: Nếu Vercel yêu cầu bản ghi TXT để xác minh quyền sở hữu (`_vercel`), người vận hành **phải thêm và hoàn thành xác minh TXT trước khi sửa đổi bản ghi A hoặc CNAME**.
> 3. **Bảo tồn tệp CNAME gốc**: Giữ nguyên tệp `CNAME` trong repository với nội dung `vivutravinh.id.vn`.

### Bước 1: Khai báo Domain trên Vercel Dashboard / CLI
1. Đăng nhập Vercel Dashboard -> Chọn dự án `vivutravinh` -> **Settings** -> **Domains**.
2. Nhập `vivutravinh.id.vn` -> Nhấn **Add**.
3. Chọn tùy chọn đề xuất tự động thêm `www.vivutravinh.id.vn` redirect về `vivutravinh.id.vn`.
4. Lấy cấu hình bản ghi chính thức từ Vercel qua giao diện hoặc lệnh CLI:
   ```bash
   vercel domains inspect vivutravinh.id.vn
   vercel domains inspect www.vivutravinh.id.vn
   ```

### Bước 2: Bảng Ghi Nhận Bản Ghi DNS Thực Cấp từ Vercel (Dành Cho Người Vận Hành)
Người vận hành điền thông tin thực tế do Vercel cấp vào bảng bên dưới trước khi cấu hình lên DNS Registrar:

| Mục đích | Loại Record | Tên / Host | Giá trị do Vercel thực cấp | Trạng thái xác nhận |
| :--- | :---: | :---: | :--- | :---: |
| **Xác thực TXT** *(nếu Vercel yêu cầu)* | `TXT` | `_vercel` | `[Ghi mã xác thực Vercel cấp vào đây]` | [ ] Đã xác minh |
| **Apex Domain** | `A` | `@` | `[Ghi IP do Vercel cấp, VD: 76.76.21.21]` | [ ] Đã trỏ |
| **Subdomain www** | `CNAME` | `www` | `[Ghi CNAME Vercel cấp, VD: cname.vercel-dns.com]` | [ ] Đã trỏ |

> [!WARNING]
> Nếu Vercel yêu cầu xác minh TXT (`_vercel`), hãy tạo bản ghi TXT trước trên trang quản trị tên miền. Khi Vercel hiển thị trạng thái *"Ownership Verified"* thì mới tiến hành chuyển các bản ghi A và CNAME ở Bước 3.

### Bước 3: Cấu hình DNS tại Nhà đăng ký tên miền (Registrar)
1. **Hạ TTL trước khi chuyển giao**:
   - Chỉnh sửa TTL của tất cả các bản ghi hiện tại xuống **300 giây (5 phút)** ít nhất 2 giờ trước khi cutover.
2. **Thêm bản ghi TXT xác thực** (nếu có yêu cầu từ Bước 2).
3. **Cập nhật bản ghi Apex (`@`)**:
   - Loại: `A`, Host: `@`, Giá trị: Giá trị A record Vercel cấp, TTL: `300`.
4. **Cập nhật bản ghi Subdomain (`www`)**:
   - Loại: `CNAME`, Host: `www`, Giá trị: Giá trị CNAME record Vercel cấp, TTL: `300`.

### Bước 4: Xác minh phân giải DNS & Cấp chứng chỉ SSL
```bash
# Kiểm tra phân giải bản ghi Apex
dig A vivutravinh.id.vn +short

# Kiểm tra phân giải bản ghi Subdomain www
dig CNAME www.vivutravinh.id.vn +short
```
Khi DNS phân giải về hạ tầng Vercel, Vercel Edge sẽ tự động cấp chứng chỉ SSL Let's Encrypt trong vòng 1–3 phút.

---

## 4. Kế hoạch Phục hồi Khẩn cấp: Rollback về GitHub Pages

> [!NOTE]
> **Cam kết thời gian phục hồi**: Mục tiêu khôi phục là **khoảng 5 phút sau khi TTL cũ đã hết**. Thời gian thực tế phụ thuộc vào bộ nhớ đệm DNS của các ISP/nhà cung cấp mạng trung gian và tiến trình lan truyền DNS toàn cầu (propagation).

### 4.1. Bắt Buộc Trước Cutover: Xuất File Zone & Chụp Ảnh Toàn Bộ Dashboard DNS

> [!CAUTION]
> **GIỚI HẠN KỸ THUẬT CỦA DIG**:
> Lệnh `dig` **KHÔNG THỂ snapshot toàn bộ DNS zone** vì cơ chế DNS Zone Transfer (`AXFR`) bị hầu hết nameserver công cộng chặn vì lý do bảo mật. Lệnh `dig` chỉ kiểm tra các bản ghi được chỉ định trước và sẽ bỏ sót các subdomain hoặc bản ghi ẩn.

Người vận hành **BẮT BUỘC** thực hiện trước khi cutover:
1. **Export file DNS Zone** (định dạng chuẩn BIND / RFC 1035) trực tiếp từ trang quản trị của nhà cung cấp DNS (DNS Registrar / Cloudflare / PA / Mắt Bão...).
2. **HOẶC chụp ảnh màn hình toàn bộ dashboard DNS** hiển thị đầy đủ 100% tất cả các bản ghi đang hoạt động.
3. **Các loại bản ghi bắt buộc phải lưu trữ và bảo toàn khi rollback**:
   - **Định tuyến**: Apex `A`, `AAAA`, Subdomain `CNAME` (`www` và các subdomain khác).
   - **Dịch vụ Email**: `MX`, `TXT` (SPF `v=spf1 ...`), DKIM (`*._domainkey`), DMARC (`_dmarc`).
   - **Xác thực quyền sở hữu**: `TXT` (Google Search Console, Facebook Domain Verification, v.v.).
   - **Chính sách chứng chỉ**: `CAA` (cho phép Let's Encrypt / DigiCert cấp SSL).
4. **CẢNH BÁO BẢO MẬT & ZERO LEAK**:
   - **Tuyệt đối KHÔNG commit file snapshot DNS** hoặc ảnh chụp dashboard chứa token xác thực nhạy cảm lên GitHub repository.
   - Dự án đã cấu hình `dns-snapshot*` trong `.gitignore` để phòng ngừa rò rỉ. Lưu trữ snapshot này an toàn trên máy cục bộ của người vận hành.

#### Lệnh Truy Vấn Hỗ Trợ Ghi Nhận (Tham Khảo Thêm):
```bash
# Ghi nhận trạng thái tham khảo (Lưu ý: Không thay thế file Export Zone chính thức)
dig A vivutravinh.id.vn +noall +answer > dns-snapshot-before-cutover.txt
dig AAAA vivutravinh.id.vn +noall +answer >> dns-snapshot-before-cutover.txt
dig CNAME www.vivutravinh.id.vn +noall +answer >> dns-snapshot-before-cutover.txt
dig NS vivutravinh.id.vn +noall +answer >> dns-snapshot-before-cutover.txt
dig TXT vivutravinh.id.vn +noall +answer >> dns-snapshot-before-cutover.txt
dig MX vivutravinh.id.vn +noall +answer >> dns-snapshot-before-cutover.txt
dig CAA vivutravinh.id.vn +noall +answer >> dns-snapshot-before-cutover.txt
```

#### Bảng Lưu Trữ DNS Snapshot Trước Cutover (Khôi Phục Nguyên Trạng Khi Rollback):
| Loại Record | Tên / Host | Giá trị DNS hiện tại cần giữ nguyên khi rollback | Ghi chú |
| :---: | :---: | :--- | :--- |
| `A` | `@` | `185.199.108.153` | IP 1 GitHub Pages |
| `A` | `@` | `185.199.109.153` | IP 2 GitHub Pages |
| `A` | `@` | `185.199.110.153` | IP 3 GitHub Pages |
| `A` | `@` | `185.199.111.153` | IP 4 GitHub Pages |
| `CNAME` | `www` | `[Ghi lại CNAME hiện tại, VD: tienlh1998-jpg.github.io]` | Subdomain www |
| `MX` | `@` | `[Ghi lại bản ghi email nếu có]` | Không làm gián đoạn email |
| `TXT` | `@` | `[Ghi lại SPF, DKIM, DMARC, Token Verification nếu có]` | Không làm mất xác thực |
| `CAA` | `@` | `[Ghi lại CAA nếu có]` | Chứng chỉ SSL |

### 4.2. Các bước Rollback:
1. Đăng nhập trang quản trị DNS của nhà đăng ký.
2. Khôi phục chính xác các bản ghi `A` và `CNAME` theo bảng snapshot trên (không xóa hoặc làm sai lệch các bản ghi `MX`, `TXT`, `CAA` đã có).
3. Do TTL đã được thiết lập trước là 300s, sau khi TTL hết hạn, lưu lượng truy cập sẽ dần quay trở lại hạ tầng GitHub Pages trong khoảng 5 phút.
4. Kiểm tra tệp `CNAME` tại thư mục gốc repository (nội dung `vivutravinh.id.vn`) để đảm bảo GitHub Pages tự động nhận diện lại tên miền.

---

## 5. Checklist Kiểm Thử 11 Hạng Mục Sau Cutover

Sau khi đổi DNS, chạy lệnh tự động (chế độ **Smoke Test an toàn, zero write, zero rate-limit mutation**):
```bash
npm run verify:g9:cutover
``````

Danh mục kiểm tra cụ thể:

- [ ] **1. SSL Certificate, HTTPS Apex Status & Vercel Server Identity**:
  - `https://vivutravinh.id.vn` trả về 200 OK.
  - Header `Server` **không được là GitHub.com**; phải phản hồi từ hạ tầng Vercel.
- [ ] **2. WWW to Apex 308/301 Permanent Redirect**:
  - `http://www.vivutravinh.id.vn` và `https://www.vivutravinh.id.vn` chuyển hướng 308/301 về `https://vivutravinh.id.vn`.
- [ ] **3. Public API Serverless Function Existence (Zero Mutation)**:
  - `GET /api/report-place` trả về mã **HTTP 405 Method Not Allowed**.
  - Chứng minh Vercel function đang thực thi, không gửi dữ liệu POST, không tạo report, không tạo record rate-limit trên CSDL.
- [ ] **4. Admin Auth API Serverless Function Existence**:
  - `GET /api/admin-profile` khi không có token trả về mã **HTTP 401 Unauthorized**.
  - Chứng minh API bảo vệ admin hoạt động chuẩn xác trên Vercel.
- [ ] **5. Admin Dashboard UI**:
  - `https://vivutravinh.id.vn/admin.html` tải 200 OK, giao diện quản trị hiển thị đầy đủ.
- [ ] **6. Canonical URL trong Homepage HTML**:
  - Trang chủ chứa `<link rel="canonical" href="https://vivutravinh.id.vn/">`.
  - Tuyệt đối không chứa domain lạ hay `vivutravinh.vercel.app`.
- [ ] **7. Sitemap XML Accessibility & Domain Contract**:
  - `https://vivutravinh.id.vn/sitemap.xml` trả về 200 OK, định dạng XML hợp lệ, 100% URL bắt đầu bằng `https://vivutravinh.id.vn`.
- [ ] **8. Robots.txt Sitemap Declaration**:
  - `https://vivutravinh.id.vn/robots.txt` trả về 200 OK và chứa dòng `Sitemap: https://vivutravinh.id.vn/sitemap.xml`.
- [ ] **9. PWA Manifest & Service Worker**:
  - `manifest.json` và `service-worker.js` đều trả về HTTP 200 OK trên origin mới.
- [ ] **10. Deep Link (/place/{slug}) & Dynamic OG SSR Crawler**:
  - `GET /place/ao-ba-om` với header bot mạng xã hội (`facebookexternalhit/1.1`) trả về 200 OK với thẻ OpenGraph động.
- [ ] **11. CNAME Repo File Protection**:
  - Tệp `CNAME` ở thư mục gốc repo nguyên vẹn nội dung `vivutravinh.id.vn`.

> [!NOTE]
> Công cụ verify:g9:cutover chỉ thực hiện read-only smoke test. Mọi kiểm thử mutation production phải sử dụng live audit chuyên dụng có fixture, quyền quản trị và cleanup được xác minh; không thuộc phạm vi công cụ cutover domain.

---

## 6. Lệnh Vận Hành & Kiểm Tra

| Mục đích | Lệnh thực thi |
| :--- | :--- |
| **Kiểm tra cú pháp toàn repo** | `npm run check` |
| **Kiểm toán tĩnh chuẩn hóa domain & CNAME** | `npm run audit:g9:domain` |
| **Unit test URL, Host Injection & Redirect** | `npm run test:g9:domain` |
| **Kiểm tra trực tiếp sau khi đổi DNS** | `npm run verify:g9:cutover` |
| **Kiểm tra hồi quy SEO & Crawler SSR** | `npm run test:g7` |
