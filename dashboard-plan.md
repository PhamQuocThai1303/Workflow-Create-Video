# Kế hoạch Dashboard quản lý tạo video

## 1. Mục tiêu

Xây dựng dashboard nội bộ cho dự án `create-video-with-ai`, giúp vận hành các workflow hiện đang chạy bằng CLI qua giao diện trực quan. Dashboard không thay thế Remotion hay pipeline tạo video; nó là lớp điều khiển, theo dõi và quản lý tài nguyên phía trên các script hiện có.

## 2. Hiện trạng

- Dự án hiện chạy bằng các npm script và slash command.
- Video được tạo theo pipeline: Setup → Planner → Teller → Audio → Transcribe → Spec → Coder → Render.
- Dữ liệu đầu ra lưu theo slug trong `videos/<slug>/` và `public/<slug>/`.
- Template được khai báo trong `src/templates/registry.ts`.
- Chưa có web server, router hay UI dashboard.

## 3. Phạm vi MVP

MVP tập trung vào các tác vụ sử dụng thường xuyên nhất.

### 3.1. Trang Tổng quan

- Tổng số template đang đăng ký.
- Danh sách video gần đây: trạng thái, template, thời gian tạo và output.
- Các tác vụ đang chạy, hoàn thành hoặc lỗi.
- Liên kết nhanh tới tạo video, thư viện video và template.

Không tự tạo số liệu giả. Khi chưa có dữ liệu, hiển thị trạng thái trống rõ ràng.

### 3.2. Tạo video

- Ô nhập context/nội dung video.
- Chọn template từ registry.
- Chọn chế độ audio: `full`, `music`, `sfx`, `voice-only` hoặc mặc định template.
- Tạo slug hoặc để hệ thống sinh slug.
- Nút khởi chạy tác vụ tạo video.
- Giao diện tiến độ cho 8 bước pipeline, log từng bước và lỗi có thể đọc được.
- Nút mở thư mục artifact hoặc mở video sau khi render xong.

### 3.3. Thư viện video

- Quét các thư mục `videos/<slug>/`.
- Hiển thị tên/slug, template, thời điểm cập nhật, trạng thái và preview MP4 nếu có.
- Trang chi tiết đọc các artifact: `context.txt`, `plan.json`, `script/script.json`, `spec.json`, `timeline.json`.
- Phát/tải `output/video.mp4` nếu đã render.
- Render lại phải yêu cầu xác nhận vì có thể ghi đè output.

### 3.4. Templates và audio

- Danh sách template với tên, mô tả, category, aspect ratio và template ID.
- Hiển thị Gemini voice, ElevenLabs voice và nhạc nền mặc định.
- Form đổi voice bằng workflow `update-template-voice`.
- Form đổi nhạc nền bằng workflow `update-bg-music`.
- Chỉ hiển thị asset/manifest liên quan; không sửa trực tiếp registry bằng UI ở phiên bản MVP.

## 4. Phạm vi giai đoạn sau MVP

### 4.1. Quản lý asset và logo

- Upload/stage nhạc vào `tmp-music/`, sau đó gọi workflow `add-music`.
- Upload/stage PNG vào `tmp-logo/`, preview watermark và gọi workflow `update-logo`.
- Duyệt asset manifest theo category.

### 4.2. Đồng bộ package template

- Liệt kê package trong `load-templates/`.
- Chạy `sync-templates --dry-run` để xem trước thay đổi.
- Chạy sync thật với log, danh sách file backup/xung đột và dependency đã cài.
- Không tự động chạy tạo video sau khi sync.

### 4.3. Cấu hình và nhật ký

- Liệt kê các ENV key yêu cầu dưới dạng `đã cấu hình`/`chưa cấu hình`; không trả về secret.
- Form cập nhật một key qua workflow `update-config`.
- Lưu lịch sử tác vụ, command, thời gian, kết quả và log rút gọn.

## 5. Kiến trúc đề xuất

### Frontend

- React dashboard chạy riêng với Remotion Studio.
- Điều hướng tối thiểu: Tổng quan, Tạo video, Video, Templates, Cài đặt.
- UI ưu tiên desktop để vận hành, vẫn responsive ở 320, 375, 414 và 768 px.

### Backend cục bộ

- Node.js API/server chạy trên máy chứa project.
- API chỉ được phép thao tác trong project root.
- Job runner chạy các script/pipeline bằng child process, stream stdout/stderr vào task log.
- Mỗi job có ID, trạng thái `queued`, `running`, `succeeded`, `failed` hoặc `cancelled`.

### Nguồn dữ liệu

| Dữ liệu | Nguồn chính |
| --- | --- |
| Template | `src/templates/registry.ts` |
| Video artifact | `videos/<slug>/` và `public/<slug>/` |
| Trạng thái sync | `.template-sync-state.json` |
| Asset nhạc | `public/assets/**/manifest.json` |
| Logo watermark | `public/watermark.png` |
| Cấu hình | `.env`, chỉ expose trạng thái key |
| Job/log dashboard | thư mục dữ liệu dashboard riêng, ví dụ `.dashboard/` |

## 6. API dự kiến

- `GET /api/overview` — số liệu và job gần đây.
- `GET /api/templates` — template đã parse từ registry.
- `PATCH /api/templates/:id/voice` — gọi update voice.
- `PATCH /api/templates/:id/background-music` — gọi update nhạc nền.
- `GET /api/videos` — danh sách video artifact.
- `GET /api/videos/:slug` — metadata và artifact detail.
- `POST /api/jobs/generate-video` — tạo job pipeline.
- `GET /api/jobs/:id` — trạng thái và log job.
- `POST /api/template-sync/dry-run` — xem kế hoạch sync.
- `POST /api/template-sync` — chạy sync sau xác nhận.

## 7. An toàn vận hành

- Không expose `.env` hoặc secret qua API/log/frontend.
- Validate mọi slug, template ID, file path và argument trước khi chạy process.
- Không nhận shell command tự do từ UI.
- Phân tách thao tác chỉ đọc và thao tác ghi đè.
- Các hành động có ghi đè hoặc cài dependency cần dialog xác nhận: render lại, thay logo, sync template, cập nhật config.
- Giới hạn một render/job nặng đồng thời ở MVP để tránh tranh chấp các file `src/` được pipeline ghi lại.

## 8. Các mốc triển khai

1. Khảo sát và đóng gói pipeline thành API/job runner không đổi logic script hiện có.
2. Tạo shell dashboard, điều hướng và màn Tổng quan.
3. Làm Tạo video cùng theo dõi tiến độ/log theo job.
4. Làm Thư viện video và trang chi tiết artifact/preview.
5. Làm quản lý Template, voice và background music.
6. Kiểm thử e2e một video, trường hợp TTS/STT/render lỗi và render lại.
7. Thêm asset, logo, sync template, config và audit log ở giai đoạn sau.

## 9. Tiêu chí hoàn thành MVP

- Người vận hành có thể tạo một video qua UI mà không cần gõ lệnh CLI.
- Có thể theo dõi từng bước pipeline và nhận log lỗi hữu ích.
- Có thể tìm, xem và tải video đã hoàn thành.
- Có thể xem template và cập nhật voice/nhạc nền qua các workflow có sẵn.
- Dashboard không làm lộ secret, không chạy command tuỳ ý và không tự ghi đè output khi chưa xác nhận.
