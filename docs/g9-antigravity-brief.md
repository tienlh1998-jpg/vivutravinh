# G9 — Chất lượng dữ liệu thật và vận hành nội dung

## 1. Mục tiêu

G9 đưa ViVuTraVinh từ trạng thái có hạ tầng quản trị production sang trạng thái có dữ liệu du lịch thật, đáng tin cậy và sẵn sàng phục vụ người dùng. Giai đoạn này tập trung vào chất lượng nội dung, khả năng truy vết nguồn, quy trình biên tập và kiểm thử trải nghiệm production.

Kết quả cuối G9 phải bảo đảm:

- trang public không hiển thị địa điểm thử nghiệm hoặc nội dung vô nghĩa;
- mỗi địa điểm được duyệt có dữ liệu tối thiểu rõ ràng và không tự suy đoán thông tin còn thiếu;
- thông tin quan trọng như địa chỉ, tọa độ, giờ mở cửa, số điện thoại và Google Maps được xác minh có nguồn;
- dữ liệu Supabase, fallback JSON, canonical route và sitemap không mâu thuẫn;
- quy trình draft → preview → approve → public → archive vận hành thật;
- trải nghiệm Gen Z trên mobile và khách gia đình/người bận rộn đều đạt;
- mọi thay đổi production có backup, danh sách review và khả năng hoàn tác.

## 2. Nguyên tắc bắt buộc

1. Không tự động xóa, archive hoặc sửa dữ liệu production nếu chưa xuất danh sách before/after cho người dùng duyệt.
2. Không dùng tên, địa chỉ, giờ mở cửa, số điện thoại, tọa độ hoặc ảnh do AI suy đoán.
3. Không nhập hàng loạt ngay từ đầu. Chỉ làm pilot 5–10 địa điểm đã xác minh.
4. Không dùng dữ liệu mock làm dữ liệu thật.
5. Không ghi service role key, access token, database password hoặc PII vào code, log, báo cáo hay fixture.
6. Không thay đổi schema production hoặc chạy migration nếu chưa có script idempotent, rollback và phê duyệt thủ công.
7. Không push, deploy hoặc chạy mutation production ngoài các bước đã được người dùng chấp thuận.
8. Không làm mới lớn giao diện public trong G9; chỉ sửa UI cần thiết để thể hiện dữ liệu trung thực và trạng thái thiếu dữ liệu.
9. Mỗi checkpoint phải chạy test phù hợp, cập nhật walkthrough và tạo commit cục bộ riêng sau khi được nghiệm thu.

## 3. Phạm vi thực hiện

### G9.0 — Đóng hồ sơ G8 và lập baseline production

1. Cập nhật tài liệu:
   - sửa `README.md` để phản ánh Supabase Auth, RBAC, 3 tab quản trị, audit log và quy trình release hiện tại;
   - cập nhật trạng thái G8 thành `COMPLETE` trong báo cáo liên quan;
   - ghi nhận live audit G8 đạt 10/10 và cleanup 0 dòng;
   - ghi nhận các commit production cuối `c0d5c6a` và `1e24d02`.
2. Lập baseline chỉ đọc từ production:
   - tổng số địa điểm theo từng trạng thái;
   - tổng số bình luận theo status/is_hidden;
   - tổng số báo sai theo trạng thái;
   - số bản ghi thiếu ảnh, địa chỉ, GPS, giờ mở cửa, giá và liên hệ;
   - danh sách slug trùng, tên đáng ngờ hoặc nội dung giống dữ liệu test.
3. Tạo báo cáo `docs/g9-data-audit.md`:
   - ID, tên, slug, status và lý do bị đánh dấu;
   - tuyệt đối không ghi PII của người đóng góp hoặc bình luận;
   - phân loại `giữ nguyên`, `cần xác minh`, `đề xuất archive`, `nghi dữ liệu test`.
4. G9.0 chỉ đọc production. Không mutation.

**Điều kiện đạt G9.0:** tài liệu đúng hiện trạng, có inventory production và danh sách review rõ ràng; working tree không chứa secret.

### G9.1 — Contract chất lượng dữ liệu địa điểm

1. Định nghĩa contract dữ liệu theo ba mức:
   - `required`: tên, slug, category, area, status;
   - `verified`: địa chỉ, GPS, Maps, giờ mở cửa, điện thoại, khoảng giá;
   - `optional`: mô tả dài, nhiều ảnh, tiện ích, social link.
2. Bổ sung metadata biên tập ở mức ứng dụng nếu schema hiện tại đã hỗ trợ; nếu cần schema mới, chỉ chuẩn bị migration để review:
   - ngày kiểm chứng gần nhất;
   - nguồn kiểm chứng;
   - trạng thái xác minh;
   - ghi chú nội bộ không xuất hiện ở public.
3. Chuẩn hóa quy tắc:
   - slug ổn định, không đổi tùy tiện sau khi public;
   - GPS phải nằm trong phạm vi hợp lý của Trà Vinh;
   - Google Maps phải dùng tọa độ thật hoặc URL đã xác minh;
   - giờ mở cửa hỗ trợ qua đêm, ngày nghỉ và trạng thái chưa rõ;
   - giá phân biệt `miễn phí`, `đã biết`, `chưa xác minh`;
   - thiếu ảnh dùng placeholder trung tính;
   - không hiển thị số điện thoại/giờ mở cửa giả.
4. Tạo validator dùng chung cho admin preview và script audit dữ liệu.
5. Validator phải cảnh báo trước khi duyệt; chỉ chặn các lỗi gây sai lệch nghiêm trọng như slug sai, GPS sai định dạng hoặc Maps nguy hiểm.

**Điều kiện đạt G9.1:** contract được tài liệu hóa, validator có test edge cases và không làm hỏng dữ liệu legacy.

### G9.2 — Dọn dữ liệu test có kiểm soát

1. Dựa trên `docs/g9-data-audit.md`, tạo kế hoạch mutation riêng:
   - danh sách chính xác từng ID;
   - trạng thái trước và trạng thái đề xuất;
   - lý do;
   - SQL/API preview;
   - cách rollback.
2. Ưu tiên archive thay vì hard delete.
3. Không tự thực thi. Dừng để người dùng duyệt danh sách.
4. Sau khi được duyệt:
   - backup database;
   - mutation qua API admin/RPC để có audit log;
   - kiểm tra public không còn hiển thị dữ liệu test;
   - xác nhận favorites/recent với ID cũ không làm ứng dụng crash;
   - ghi kết quả before/after và audit correlation ID.

**Điều kiện đạt G9.2:** không còn dữ liệu test được public, không xóa nhầm dữ liệu thật, mọi mutation có audit log và rollback record.

### G9.3 — Pilot 5–10 địa điểm thật

1. Chuẩn bị danh sách cân bằng:
   - 3 địa điểm ẩm thực/đặc sản, ưu tiên bún nước lèo;
   - 2 quán cà phê/check-in;
   - 2 điểm du lịch;
   - 1–2 địa điểm phù hợp gia đình hoặc dịch vụ cần thiết.
2. Mỗi địa điểm phải có phiếu xác minh, gồm:
   - nguồn tên và địa chỉ;
   - nguồn giờ mở cửa;
   - nguồn liên hệ;
   - URL Google Maps hoặc tọa độ;
   - nguồn và quyền sử dụng ảnh;
   - ngày xác minh.
3. Không scrape hoặc sao chép nội dung/ảnh có bản quyền khi chưa có quyền sử dụng.
4. Đi theo đúng vòng đời:
   - tạo draft;
   - chạy validator;
   - preview desktop/mobile;
   - người dùng duyệt nội dung;
   - approve;
   - kiểm tra public và canonical `/place/{slug}`.
5. Chỉ địa điểm được người dùng duyệt mới được publish.

**Điều kiện đạt G9.3:** 5–10 địa điểm thật hoàn tất vòng đời và không có dữ liệu quan trọng bị trình bày sai.

### G9.4 — Đồng bộ fallback, SEO và offline

1. Xây script xuất snapshot từ các địa điểm `approved` đã xác minh sang `data/data-fallback.json`:
   - output ổn định và có thứ tự;
   - không ghi trường nội bộ hoặc PII;
   - không làm mất ID bền vững;
   - có dry-run và diff trước khi ghi file.
2. Không để service worker cache dữ liệu admin hoặc API nhạy cảm.
3. Đồng bộ sitemap/canonical cho slug public thật.
4. Kiểm tra:
   - Supabase online;
   - Supabase mất kết nối và fallback;
   - offline reload;
   - ảnh thiếu/404;
   - deep link `/place/{slug}`;
   - địa điểm archived/hidden không xuất hiện.
5. Cập nhật cache version chỉ khi danh sách precache thực sự thay đổi.

**Điều kiện đạt G9.4:** Supabase, fallback, sitemap và route public cùng một tập dữ liệu đã duyệt; offline không hiển thị dữ liệu test cũ.

### G9.5 — Nghiệm thu trải nghiệm và phát hành

1. Persona Gen Z mobile 360/390/414 px:
   - tìm kiếm tiếng Việt có dấu/không dấu;
   - food tour dưới 50k;
   - cafe check-in;
   - thao tác một tay, touch target ≥44px;
   - gallery, favorite, recent và Maps.
2. Persona gia đình/người bận rộn:
   - địa chỉ, GPS, số điện thoại, giờ mở cửa và trạng thái xác minh dễ hiểu;
   - không biến dữ liệu thiếu thành dữ kiện chắc chắn;
   - nút gọi và chỉ đường đúng đích.
3. Kiểm tra quản trị:
   - draft/preview/approve/archive;
   - comment moderation;
   - report handling;
   - audit log đúng một bản ghi/mutation.
4. Chạy toàn bộ gate hiện có và bổ sung `test:g9`/`test:g9:browser` cho contract dữ liệu, snapshot và persona flow.
5. Trước release:
   - backup production;
   - `npm run check:gate` pass;
   - build pass;
   - diff sạch;
   - walkthrough ghi rõ manual/live checks còn lại.
6. Sau deploy chạy live audit G8 để bảo đảm admin không hồi quy và live audit G9 chỉ đọc/cleanup an toàn.

**Điều kiện đạt G9.5:** toàn bộ test pass, dữ liệu pilot đúng trên production, không còn dữ liệu test public, fallback/offline/SEO đồng bộ và cleanup được xác nhận.

## 4. Test bắt buộc

Tối thiểu phải có:

- validator chặn slug rỗng/sai, URL nguy hiểm và GPS ngoài giới hạn;
- tìm kiếm có dấu/không dấu với dữ liệu thật;
- lọc category, area, price và open-now;
- dữ liệu thiếu ảnh/giờ/GPS/contact không làm vỡ UI;
- canonical `/place/{slug}` và sitemap không chứa draft/archive;
- snapshot fallback không chứa trường admin hoặc PII;
- ID favorites/recent vẫn ổn định sau cập nhật slug/thông tin;
- offline dùng snapshot mới và không cache API admin;
- mobile không tràn ngang, touch target đạt;
- mutation production có audit log và cleanup fixture 0 dòng.

Không tăng số test bằng các assertion chỉ kiểm tra chuỗi hoặc lặp lại implementation. Ưu tiên test hành vi và contract đầu ra.

## 5. Ngoài phạm vi G9

- Thanh toán, đặt phòng hoặc đặt bàn.
- Ứng dụng đa tenant.
- AI moderation tự động.
- Scraping hàng loạt dữ liệu hoặc ảnh.
- Viết lại frontend bằng framework mới.
- Hệ thống tài khoản người dùng public.
- Nhập hàng trăm địa điểm trước khi pilot đạt.

## 6. Quy trình checkpoint và báo cáo

Sau mỗi mốc G9.0–G9.5:

1. Cập nhật `walkthrough.md` với file thay đổi, hành vi trước/sau và test thực tế.
2. Ghi rõ thao tác production nào chưa chạy hoặc cần người dùng duyệt.
3. Hiển thị `git status`, `git diff --check` và kết quả test.
4. Không gộp nhiều mốc vào một commit lớn.
5. Không tuyên bố hoàn tất dựa trên mock khi chưa kiểm tra production.
6. Nếu phát hiện schema production khác code, dừng mutation, đối chiếu backup/schema và chuẩn bị migration tương thích ngược.

## 7. Thứ tự triển khai đề xuất

Thực hiện tuần tự:

```text
G9.0 baseline chỉ đọc
→ người dùng duyệt inventory
→ G9.1 contract + validator
→ G9.2 kế hoạch dọn dữ liệu và duyệt thủ công
→ G9.3 pilot địa điểm thật
→ G9.4 fallback/SEO/offline
→ G9.5 nghiệm thu và phát hành
```

Không bắt đầu G9.2 mutation hoặc G9.3 publish trước khi G9.0 và G9.1 được nghiệm thu.
