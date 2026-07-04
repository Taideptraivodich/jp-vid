# Course Video Player

Local web app để load course bằng các API:

- `GET /my-course/detail/:courseId`
- `GET /my-course/roadmap-lesson?roadmap_id=:roadmapId`
- `GET /my-course/lesson/:lessonId`

App chạy qua proxy local để tránh CORS. Token chỉ nhập trên máy bạn, không hardcode vào source.

## Chạy app

Cần Node.js 18+.

```bash
npm install
npm start
```

Mở trình duyệt:

```text
http://localhost:8080
```

Nhập:

- Course ID: ví dụ `18`
- Token: `Bearer <JWT>` hoặc chỉ `<JWT>` đều được

## Flow API

```text
/my-course/detail/{course_id}
→ lấy data.course.roadmap[].id
→ /my-course/roadmap-lesson?roadmap_id={roadmap_id}
→ lấy data.lessons[].children[]
→ click lesson type=1
→ /my-course/lesson/{lesson_id}
→ phát video_url bằng hls.js
```

## Lưu ý

- Chỉ dùng với tài khoản và khóa học bạn có quyền truy cập.
- Không commit/publish token.
- App chỉ phát stream bằng trình duyệt; không có chức năng bypass DRM hay download nội dung.
