# M3U8 Downloader & Browser Automation Tool

Công cụ tự động hóa trình duyệt sử dụng Playwright để cào danh sách tập phim, bắt gói tin HLS stream (`.m3u8`), phân tích chất lượng tốt nhất (Video Max, Audio Tiếng gốc, Phụ đề Tiếng Việt) và tự động gọi FFmpeg tải xuống & hợp nhất thành video MP4 hoàn chỉnh.

Hệ thống được tối ưu hóa đặc biệt cho **TV360.vn** thông qua việc trích xuất hydration data Next.js kết hợp cào DOM lazy-load và hỗ trợ cơ chế lưu phiên đăng nhập (Persistent Browser Context).

---

## 🚀 Các Tính Năng Nổi Bật

- 🌐 **Giao diện Web UI Dashboard cao cấp**: Giao diện điều khiển Dashboard hiện đại, thiết kế tối sang trọng (Glassmorphism dark-mode). Cập nhật logs console và tiến trình tải thời gian thực bằng kết nối WebSocket.
- 🌍 **Song ngữ Việt / Anh (Language toggle)**: Nút chuyển đổi ngôn ngữ **VI | EN** ngay trên thanh tiêu đề. Toàn bộ giao diện, bảng lịch sử và nhật ký hoạt động (kể cả log từ máy chủ) được dịch tức thời không cần tải lại trang. Lựa chọn ngôn ngữ được ghi nhớ trong trình duyệt (`localStorage`).
- ⚡ **Khởi chạy ngầm thông minh (Smart launchers)**:
  - `Quick_Start.bat`: Kiểm tra server đã chạy chưa (qua `/api/health`) — nếu đã chạy thì chỉ mở trình duyệt, không khởi động trùng lặp. Nếu chưa, khởi động ẩn trong nền, chờ server sẵn sàng và **hiển thị lỗi cụ thể** (từ `server_err.log`) nếu khởi động thất bại.
  - Nút **⏻ Tắt server** ngay trên Dashboard: tắt server "nhẹ nhàng" — dừng toàn bộ tiến trình FFmpeg con (tránh FFmpeg mồ côi chạy ngầm), đóng trình duyệt Playwright và lưu hàng chờ an toàn trước khi thoát.
  - `Stop_Server.bat`: Phương án dự phòng — gửi lệnh tắt nhẹ nhàng trước, chỉ buộc dừng tiến trình (kèm tiến trình con) khi server bị treo, và xác minh đúng tiến trình `node` để không ảnh hưởng ứng dụng khác trên cổng `3000`.
- 📂 **Lưới chọn tập bằng Checkbox**: Hiển thị danh sách tập phim cào được dạng lưới, cho phép người dùng tự do lựa chọn tải lẻ hoặc tải nhiều tập bất kỳ (khác với CLI cũ chỉ hỗ trợ tải 1 hoặc tải tất cả).
- 📊 **Theo dõi tiến độ (%) thực tế**: Tự động bóc tách thông tin thời lượng tập phim từ DOM (ví dụ: `46:14`) và đối chiếu với thời gian FFmpeg đã xử lý (`time=hh:mm:ss.xx`) để tính toán chính xác phần trăm tiến trình tải xuống.
- 🔑 **Duy trì phiên đăng nhập (Session/Cookie)**: Sử dụng Playwright `persistentContext` lưu trữ tại thư mục dự án (`./user_data`), chỉ cần đăng nhập thủ công ở lần đầu tiên chạy, các lần tiếp theo hệ thống tự nhận diện session cũ.
- 📁 **Ghi nhớ thư mục lưu**: Thư mục tải xuống được chọn/dùng gần nhất được lưu vào `settings.json` và tự động điền lại vào ô nhập ở lần khởi động sau. Hộp thoại "Chọn thư mục" cũng mở sẵn ở vị trí đó và luôn hiện lên trên cùng (foreground).
- 🔊 **Ưu tiên âm thanh tiếng gốc (Original Audio Priority)**: Tự động phân tích các luồng track audio của Master Playlist để chọn luồng tiếng gốc (Hàn, Anh, Trung, Nhật...) thay vì bản thuyết minh/lồng tiếng Việt.
- 📝 **Tự động tải & khớp phụ đề**: Bắt link phụ đề (.vtt, .srt) từ luồng mạng và tải về dưới dạng `.srt` trùng tên với video (`${safeTitle}.srt`), giúp các trình phát media tự động nhận diện phụ đề khi mở video.
- 🔄 **Quản lý Resume hàng chờ bằng JSON Queue**: Quản lý hàng chờ tải bằng file `download_status.json`, tự động bỏ qua (skip) các tập đã tải thành công (`success`) và tiếp tục tải các tập còn lại (`pending`, `failed`).
- 📜 **Bảng Lịch sử tải xuống ngay trên Dashboard**: Xem trạng thái, số lần thử, thời điểm và lý do lỗi của từng tập. Hỗ trợ tải lại từng tập (kể cả tập đã thành công), tải lại toàn bộ tập lỗi, xóa từng mục hoặc xóa toàn bộ lịch sử — không cần sửa tay file JSON.
- 💪 **Tải lại & ghi đè (Force re-download)**: Tick ô "Tải lại cả tập đã thành công" trước khi bấm tải để bỏ qua lịch sử và tải lại từ đầu các tập đã chọn.
- ⏱️ **Retry thông minh với Exponential Backoff**: Mặc định thử lại 5 lần mỗi tập (cấu hình qua `max_retries`), thời gian chờ giữa các lần thử tăng dần (3s → 6s → 12s...) giúp vượt qua lỗi CDN/token tạm thời.
- 🚀 **Engine tải tốc độ cao N_m3u8DL-RE (tùy chọn)**: Khi phát hiện binary [N_m3u8DL-RE](https://github.com/nilaoda/N_m3u8DL-RE), hệ thống tự động tải song song **16 phân đoạn cùng lúc** cho mỗi luồng (nhanh hơn nhiều lần so với FFmpeg tải tuần tự), sau đó dùng FFmpeg ghép file cục bộ (stream copy). Không có binary → tự động dùng FFmpeg như cũ.

---

## 🛠️ Yêu Cầu Hệ Thống

1. **Node.js** (Khuyến nghị phiên bản v18 trở lên).
2. **FFmpeg** đã được cài đặt và cấu hình biến môi trường `PATH` (để hệ thống có thể gọi lệnh `ffmpeg` từ bất cứ đâu).

---

## 📦 Hướng Dẫn Cài Đặt

1. Di chuyển vào thư mục dự án và cài đặt các thư viện:
   ```bash
   npm install
   ```
   *(Hoặc chạy `npm.cmd install` trên Windows CMD nếu gặp lỗi chính sách bảo mật).*
2. Cài đặt trình duyệt Chromium của Playwright:
   ```bash
   npx playwright install chromium
   ```

---

## ⚙️ Cấu Hình Hệ Thống (`config.json`)

File `config.json` nằm tại thư mục gốc chứa các cài đặt mặc định:
```json
{
  "user_data_dir": "./user_data",
  "download_dir": "./downloads",
  "ffmpeg_path": "ffmpeg",
  "download_engine": "auto",
  "n_m3u8dl_re_path": "./tools/N_m3u8DL-RE/N_m3u8DL-RE.exe",
  "re_thread_count": 16,
  "max_concurrent_downloads": 3,
  "max_retries": 5,
  "sites": {
    "default": {
      "episode_selector": "a.episode-link, .episode-list a, .playlist a",
      "play_button_selector": "button.play-btn, .video-player, video"
    },
    "tv360.vn": {
      "episode_selector": "a[href*='/movie/']",
      "play_button_selector": "button[title='Xem ngay'], button[title='Xem'], .video-player, video"
    }
  }
}
```
* **user_data_dir**: Thư mục lưu cache trình duyệt, cookie, session đăng nhập.
* **download_dir**: Thư mục lưu các video MP4 sau khi tải xong.
* **download_engine**: `auto` (mặc định — dùng N_m3u8DL-RE nếu tìm thấy, không thì FFmpeg), `n_m3u8dl-re` (bắt buộc, tự fallback về FFmpeg kèm cảnh báo nếu thiếu binary), hoặc `ffmpeg`.
* **n_m3u8dl_re_path**: Đường dẫn tới binary N_m3u8DL-RE. Tải bản `win-x64` từ [trang Releases](https://github.com/nilaoda/N_m3u8DL-RE/releases) và giải nén vào `./tools/N_m3u8DL-RE/`.
* **re_thread_count**: Số phân đoạn tải song song mỗi luồng khi dùng N_m3u8DL-RE (mặc định: 16).
* **max_concurrent_downloads**: Số tập tải đồng thời tối đa (mặc định: 3).
* **max_retries**: Số lần thử lại tối đa cho mỗi tập khi gặp lỗi, với thời gian chờ tăng dần giữa các lần (mặc định: 5).
* **sites**: Định nghĩa bộ chọn (selectors) cho danh sách tập và nút play cho từng tên miền (domain) cụ thể.

---

## 🖥️ Hướng Dẫn Sử Dụng

### Cách 1: Sử dụng Web UI Dashboard (Khuyên dùng)

1. Double-click trực tiếp vào tệp **[Quick_Start.bat](Quick_Start.bat)** trong thư mục dự án.
2. Trình duyệt mặc định của hệ thống sẽ tự động mở trang: `http://localhost:3000`. Cửa sổ trình duyệt Playwright ( Chromium) cũng tự động mở ra.
3. Dán link phim (URL) cần tải, chọn thư mục lưu (bằng cách ấn **📂 Chọn thư mục** để mở hộp thoại chọn thư mục Windows trực quan) và nhấn **Quét danh sách tập phim**.
4. Chọn các tập phim muốn tải, cấu hình chế độ và nhấn **BẮT ĐẦU TẢI XUỐNG**.
5. Để dừng server hoàn toàn, bấm nút **⏻ Tắt server** trên thanh tiêu đề Dashboard (khuyên dùng), hoặc chạy tệp **[Stop_Server.bat](Stop_Server.bat)**.

### Cách 2: Sử dụng Command Line (CLI Mode)

Nếu bạn vẫn muốn dùng giao diện dòng lệnh đen trắng cổ điển:
1. Mở terminal tại thư mục dự án và chạy:
   ```bash
   npm start -- --cli
   ```
2. Nhập URL tập phim cần tải.
3. Đăng nhập tài khoản (nếu cần) ở cửa sổ Chrome tự mở ra, quay lại màn hình CLI nhấn **[ENTER]** để cào danh sách tập.
4. Chọn chế độ tải (1 - Chỉ tải tập hiện tại, 2 - Tải trọn bộ phim).

---

## 🧪 Chạy Kiểm Thử Giả Lập (Mock Test)

Để kiểm tra các tính năng của hệ thống ở chế độ offline:
1. Chạy server mock web streaming cục bộ:
   ```bash
   node test/mock_server.js
   ```
   *Server giả lập sẽ chạy tại địa chỉ http://localhost:8080*
2. Chạy Dashboard hoặc CLI và nhập link tập phim giả lập:
   ```
   http://localhost:8080/episode1.html
   ```
3. Tiến hành quét tập và tải thử nghiệm. Video MP4 tải thành công sẽ được xuất ra thư mục `./downloads`.

---

## ⚠️ Lưu ý Kỹ Thuật

- **Bảo mật DRM**: Đối với các nội dung trả phí có cơ chế mã hóa bản quyền DRM (Widevine, FairPlay), video tải về qua FFmpeg thông thường sẽ bị lỗi màn hình đen hoặc không giải mã được.
- **Hết hạn Token (Timeout)**: Đường dẫn m3u8 của các trang phim thường đính kèm token xác thực ngắn hạn. Do đó, hệ thống được thiết kế để bắt link và truyền trực tiếp vào FFmpeg tải ngay lập tức để tránh lỗi hết hạn liên kết.
