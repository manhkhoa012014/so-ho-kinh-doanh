# Sổ HKD Nhóm 1 & Nhóm 2 – V19

V19 cập nhật mẫu S2e-HKD: tách riêng phần **Tiền mặt** và **Tiền gửi không kỳ hạn/Ngân hàng**, có số dư đầu kỳ, phát sinh thu/chi và số dư cuối kỳ theo kỳ in.


## V19 – Lịch thuế tự động
- Nhóm 1: tự tạo lịch thông báo doanh thu năm bằng Mẫu 01/TKN-CNKD.
- Nhóm 2 Cách 1 và Cách 2: tự tạo 4 kỳ khai thuế bằng Mẫu 01/CNKD; Q4 có hạn 31/01 năm sau.
- Nhóm 2 Cách 2: thêm quyết toán TNCN năm bằng Mẫu 02/CNKD-TNCN-QTT, hạn 31/03 năm sau.
- Có trạng thái sắp đến hạn/quá hạn/đã hoàn thành và nút đánh dấu từng kỳ.
- Nội dung “Tạo thông báo nhắc thuế” tự chọn kỳ chưa hoàn thành gần nhất.


V19 FIX2: sửa luồng Firebase Auth, không chặn đăng nhập bởi email chưa xác thực; cập nhật cache/service worker. Firestore Rules dùng UID.
