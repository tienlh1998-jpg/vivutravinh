# Hướng Dẫn Cấu Hình Xác Thực Email & SMTP Supabase Cho ViVuTràVinh

Tài liệu này hướng dẫn chi tiết các bước thiết lập bắt buộc trên **Supabase Dashboard** để kích hoạt luồng gửi email xác thực đăng ký và khôi phục mật khẩu mang thương hiệu **ViVuTràVinh**.

---

## 1. Cấu hình URL Chuyển Hướng (URL Configuration)

Truy cập: **Supabase Dashboard** $\rightarrow$ Chọn dự án `ViVuTraVinh` $\rightarrow$ **Authentication** $\rightarrow$ **URL Configuration**.

### 1.1. Site URL
- **Site URL**: `https://vivutravinh.id.vn`
- *Mục đích*: Ngăn chặn việc chuyển hướng người dùng về `localhost` khi mở email trên thiết bị di động hoặc máy tính thực tế.

### 1.2. Redirect URLs
Thêm toàn bộ danh sách các URL hợp lệ sau vào mục **Redirect URLs**:
- `https://vivutravinh.id.vn/**`
- `https://vivutravinh.id.vn/`
- `http://localhost:8000/**` *(Dành cho kiểm thử cục bộ dev)*
- `http://localhost:4185/**` *(Dành cho kịch bản tự động test)*
- `http://127.0.0.1:8000/**`

Nhấn **Save** để lưu thay đổi.

---

## 2. Cấu hình Mẫu Email Thương Hiệu (Email Templates)

Truy cập: **Authentication** $\rightarrow$ **Email Templates**.

### 2.1. Mẫu "Confirm signup" (Xác nhận đăng ký)
- **Subject**: `[ViVuTràVinh] Xác nhận địa chỉ email của bạn`
- **Body**: Mở tệp `supabase/email_templates/confirmation_email.html`, sao chép toàn bộ nội dung HTML và dán vào ô **Message body**.
- Nhấn **Save**.

### 2.2. Mẫu "Reset password" (Khôi phục mật khẩu)
- **Subject**: `[ViVuTràVinh] Đặt lại mật khẩu tài khoản của bạn`
- **Body**: Mở tệp `supabase/email_templates/recovery_email.html`, sao chép toàn bộ nội dung HTML và dán vào ô **Message body**.
- Nhấn **Save**.

---

## 3. Cấu hình Máy Chủ Gửi Email Riêng (Custom SMTP Server)

Mặc định Supabase chỉ cung cấp hạn mức thử nghiệm (3 emails/giờ) và người gửi là `noreply@mail.app.supabase.io`. Để gửi email bằng địa chỉ `vivutravinh@gmail.com` với tốc độ cao và không bị giới hạn:

Truy cập: **Project Settings** $\rightarrow$ **Authentication** $\rightarrow$ **SMTP Settings** (hoặc **Authentication** $\rightarrow$ **Providers** $\rightarrow$ **Email** $\rightarrow$ **SMTP Settings**).

1. Bật công tắc: **Enable Custom SMTP**.
2. Điền các thông số:
   - **Sender email**: `vivutravinh@gmail.com`
   - **Sender name**: `ViVuTràVinh`
   - **Reply-To**: `vivutravinh@gmail.com`
   - **Host**: `smtp.gmail.com`
   - **Port**: `465` (hoặc `587`)
   - **Minimum TLS Version**: `1.2`
   - **User**: `vivutravinh@gmail.com`
   - **Pass**: *Mật khẩu ứng dụng (App Password) của Gmail*.

### Cách tạo Mật khẩu ứng dụng (Google App Password) cho Gmail:
> ⚠️ **LƯU Ý BẢO MẬT QUAN TRỌNG:**
> - Tuyệt đối **KHÔNG** dùng mật khẩu đăng nhập chính của Gmail!
> - Tuyệt đối **KHÔNG** commit mật khẩu vào mã nguồn Git hoặc để lộ trong frontend!

1. Đăng nhập tài khoản Google `vivutravinh@gmail.com`.
2. Truy cập: [https://myaccount.google.com/security](https://myaccount.google.com/security)
3. Bật **Xác minh 2 bước (2-Step Verification)** nếu chưa bật.
4. Tìm kiếm mục **Mật khẩu ứng dụng (App passwords)** hoặc truy cập trực tiếp: [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
5. Nhập tên ứng dụng: `ViVuTraVinh Supabase`.
6. Nhấn **Tạo (Create)** $\rightarrow$ Google sẽ cấp mã 16 ký tự (ví dụ: `abcd efgh ijkl mnop`).
7. Sao chép chuỗi 16 ký tự này và dán vào ô **Pass** trên Supabase Dashboard.
8. Nhấn **Save Changes**.

---

## 4. Bật chế độ Xác thực Email (Email Confirmation)

Truy cập: **Authentication** $\rightarrow$ **Providers** $\rightarrow$ **Email**:
- **Enable Email provider**: `ON`
- **Confirm email**: `ON` *(Khi bật tuỳ chọn này, người dùng đăng ký mới bắt buộc phải nhấn liên kết trong email để kích hoạt trước khi có thể đăng nhập)*
- **Secure password change**: `ON`
