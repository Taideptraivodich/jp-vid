const DIRECT_API_ROOT = 'https://api-online.abc.vn/api/v1/client';

const el = {
  tokenInput: document.getElementById('tokenInput'),
  courseIdInput: document.getElementById('courseIdInput'),
  apiModeInput: document.getElementById('apiModeInput'),
  loadBtn: document.getElementById('loadBtn'),
  status: document.getElementById('status'),
  errorBox: document.getElementById('errorBox'),
  lessonList: document.getElementById('lessonList'),
  courseSummary: document.getElementById('courseSummary'),
  searchInput: document.getElementById('searchInput'),
  typeFilter: document.getElementById('typeFilter'),
  player: document.getElementById('player'),
  lessonTitle: document.getElementById('lessonTitle'),
  lessonInfo: document.getElementById('lessonInfo'),
  sourceList: document.getElementById('sourceList'),
  debugBox: document.getElementById('debugBox'),
  copyVideoIdsBtn: document.getElementById('copyVideoIdsBtn'),
  downloadCsvBtn: document.getElementById('downloadCsvBtn')
};

let hls = null;
let currentCourse = null;
let roadmapResponses = [];
let flatLessons = [];
let currentLessonDetail = null;

function setStatus(message) {
  el.status.textContent = message || '';
  el.status.classList.toggle('hidden', !message);
}

function setError(message) {
  el.errorBox.textContent = message || '';
  el.errorBox.classList.toggle('hidden', !message);
}

function showDebug(data) {
  el.debugBox.textContent = JSON.stringify(data, null, 2);
  el.debugBox.classList.remove('hidden');
}

function getApiRoot() {
  return el.apiModeInput.value === 'direct' ? DIRECT_API_ROOT : '/api';
}

function normalizeToken(raw) {
  const token = String(raw || '').trim();

  if (!token) {
    throw new Error('Chưa nhập token.');
  }

  return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
}

function getHeaders() {
  return {
    Accept: 'application/json',
    Authorization: normalizeToken(el.tokenInput.value),
    Platform: 'web'
  };
}

async function apiGet(path) {
  const res = await fetch(getApiRoot() + path, {
    method: 'GET',
    headers: getHeaders()
  });

  const text = await res.text();
  let json;

  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`API không trả JSON. HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  if (!res.ok || Number(json.status?.code || 0) >= 400) {
    throw new Error(json.status?.message || `HTTP ${res.status}`);
  }

  return json;
}

function typeLabel(type) {
  if (type === 1) return 'Video';
  if (type === 2) return 'Flashcard';
  if (type === 3) return 'Bài tập';
  return `Type ${type}`;
}

function typeClass(type) {
  if (type === 1) return 'video';
  if (type === 2) return 'flashcard';
  if (type === 3) return 'exercise';
  return '';
}

function getFilteredLessons() {
  const keyword = el.searchInput.value.trim().toLowerCase();
  const type = el.typeFilter.value;

  return flatLessons.filter(item => {
    const matchText = !keyword || [item.name, item.day_name, item.lesson_id]
      .join(' ')
      .toLowerCase()
      .includes(keyword);

    const matchType = type === 'all' || String(item.type) === type;

    return matchText && matchType;
  });
}

function flattenRoadmaps(responses) {
  return responses.flatMap(r =>
    (r.lessons || []).flatMap(day =>
      (day.children || []).map(item => ({
        roadmap_id: r.roadmapId,
        day_id: day.id,
        day_name: day.name,
        lesson_id: item.id,
        name: item.name,
        type: item.type,
        is_complete: item.is_complete,
        trial_study: item.trial_study,
        exercise_id: item.exercise_id
      }))
    )
  );
}

function renderSummary() {
  const total = flatLessons.length;
  const videos = flatLessons.filter(x => x.type === 1).length;
  const flashcards = flatLessons.filter(x => x.type === 2).length;
  const exercises = flatLessons.filter(x => x.type === 3).length;
  const complete = flatLessons.filter(x => x.is_complete === 1).length;

  el.courseSummary.textContent = [
    currentCourse?.name || 'Course',
    `${total} items`,
    `${videos} videos`,
    `${flashcards} flashcards`,
    `${exercises} bài tập`,
    `${complete} hoàn thành`
  ].join(' · ');
}

function renderLessons() {
  el.lessonList.innerHTML = '';

  const filtered = getFilteredLessons();
  const allowedIds = new Set(filtered.map(x => String(x.lesson_id)));

  for (const roadmap of roadmapResponses) {
    for (const day of roadmap.lessons || []) {
      const children = (day.children || []).filter(item => allowedIds.has(String(item.id)));
      if (!children.length) continue;

      const dayEl = document.createElement('div');
      dayEl.className = 'day';

      const titleEl = document.createElement('div');
      titleEl.className = 'day-title';
      titleEl.textContent = `${day.name} · ${children.length} item`;
      dayEl.appendChild(titleEl);

      for (const item of children) {
        const lessonEl = document.createElement('div');
        lessonEl.className = 'lesson';
        lessonEl.dataset.lessonId = item.id;

        const textWrap = document.createElement('div');

        const title = document.createElement('div');
        title.className = 'lesson-title';
        title.textContent = item.name;

        const subtitle = document.createElement('div');
        subtitle.className = 'lesson-subtitle';
        subtitle.textContent = `ID ${item.id} · complete ${item.is_complete} · exercise ${item.exercise_id || 0}`;

        textWrap.appendChild(title);
        textWrap.appendChild(subtitle);

        const badge = document.createElement('span');
        badge.className = `badge ${typeClass(item.type)}`;
        badge.textContent = typeLabel(item.type);

        lessonEl.appendChild(textWrap);
        lessonEl.appendChild(badge);

        lessonEl.addEventListener('click', () => {
          if (item.type !== 1) {
            setError('Item này không phải video lesson. Chỉ type=1 mới phát bằng player.');
            return;
          }

          loadLessonDetail(item.id).catch(handleError);
        });

        dayEl.appendChild(lessonEl);
      }

      el.lessonList.appendChild(dayEl);
    }
  }
}

async function loadCourse() {
  setError('');
  setStatus('Đang tải course detail...');
  el.lessonList.innerHTML = '';
  el.sourceList.innerHTML = '';
  el.debugBox.classList.add('hidden');

  const courseId = Number(el.courseIdInput.value || 18);
  const courseDetail = await apiGet(`/my-course/detail/${courseId}`);

  currentCourse = courseDetail.data?.course;

  if (!currentCourse) {
    throw new Error('Không tìm thấy data.course trong course detail.');
  }

  const roadmapIds = [...new Set((currentCourse.roadmap || []).map(x => x.id).filter(Boolean))];

  if (!roadmapIds.length) {
    throw new Error('Course không có roadmap_id.');
  }

  setStatus(`Tìm thấy ${roadmapIds.length} roadmap. Đang tải danh sách bài...`);

  roadmapResponses = [];

  for (const roadmapId of roadmapIds) {
    const json = await apiGet(`/my-course/roadmap-lesson?roadmap_id=${encodeURIComponent(roadmapId)}`);

    roadmapResponses.push({
      roadmapId,
      lessons: json.data?.lessons || [],
      raw: json
    });
  }

  flatLessons = flattenRoadmaps(roadmapResponses);

  renderSummary();
  renderLessons();

  const videoCount = flatLessons.filter(x => x.type === 1).length;
  setStatus(`Đã tải ${flatLessons.length} items, ${videoCount} video.`);
}

async function loadLessonDetail(lessonId) {
  setError('');
  setStatus(`Đang tải lesson ${lessonId}...`);

  document.querySelectorAll('.lesson').forEach(node => {
    node.classList.toggle('active', String(node.dataset.lessonId) === String(lessonId));
  });

  const json = await apiGet(`/my-course/lesson/${lessonId}`);
  const lesson = json.data?.lesson;

  if (!lesson) {
    throw new Error('Không tìm thấy data.lesson trong lesson detail.');
  }

  currentLessonDetail = lesson;
  showDebug({ lesson });

  el.lessonTitle.textContent = lesson.name || `Lesson ${lesson.id}`;
  el.lessonInfo.textContent = [
    `ID: ${lesson.id}`,
    `Course: ${lesson.course_id}`,
    `Time: ${lesson.time || 0}s`,
    `Complete: ${lesson.is_complete}`,
    `Favorite: ${lesson.is_favorite}`
  ].join(' · ');

  renderSources(lesson);

  const firstPlayable =
    (lesson.video_url || []).find(x => String(x.url || '').includes('.m3u8')) ||
    (lesson.video_url || [])[0];

  if (!firstPlayable) {
    throw new Error('Lesson không có video_url.');
  }

  playVideo(firstPlayable.url);
  setStatus(`Đang phát: ${lesson.name}`);
}

function renderSources(lesson) {
  el.sourceList.innerHTML = '';

  for (const source of lesson.video_url || []) {
    const btn = document.createElement('button');
    btn.className = 'source-btn';
    btn.textContent = source.title || source.type || 'Source';
    btn.title = source.url || '';

    btn.addEventListener('click', () => {
      document.querySelectorAll('.source-btn').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      playVideo(source.url);
    });

    el.sourceList.appendChild(btn);
  }

  const first = el.sourceList.querySelector('.source-btn');
  if (first) first.classList.add('active');
}

function playVideo(url) {
  setError('');

  if (!url) {
    setError('Video URL rỗng.');
    return;
  }

  if (hls) {
    hls.destroy();
    hls = null;
  }

  el.player.pause();
  el.player.removeAttribute('src');
  el.player.load();

  if (/youtube\.com|youtu\.be/i.test(url)) {
    setError('Nguồn này là YouTube embed. Đã mở tab mới vì thẻ <video> không phát được YouTube embed.');
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  if (url.includes('.m3u8')) {
    if (window.Hls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(url);
      hls.attachMedia(el.player);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        el.player.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.warn('HLS error:', data);
        if (data.fatal) {
          setError(`HLS error: ${data.type} - ${data.details}`);
        }
      });
    } else if (el.player.canPlayType('application/vnd.apple.mpegurl')) {
      el.player.src = url;
      el.player.play().catch(() => {});
    } else {
      setError('Trình duyệt không hỗ trợ HLS. Hãy thử Chrome/Edge mới hoặc Safari.');
    }
    return;
  }

  el.player.src = url;
  el.player.play().catch(() => {});
}

function toCsv(rows) {
  const header = ['roadmap_id', 'day_id', 'day_name', 'lesson_id', 'name', 'type', 'is_complete', 'trial_study', 'exercise_id'];
  const body = rows.map(row => header.map(key => row[key]));

  return [header, ...body]
    .map(values => values.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
    .join('\n');
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

async function copyVideoIds() {
  const ids = flatLessons.filter(x => x.type === 1).map(x => x.lesson_id).join('\n');

  if (!ids) {
    throw new Error('Chưa có video IDs để copy.');
  }

  await copyText(ids);
  setStatus('Đã copy video IDs vào clipboard.');
}

function downloadCsv() {
  if (!flatLessons.length) {
    throw new Error('Chưa có lesson data để export CSV.');
  }

  const csv = toCsv(flatLessons);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = `course-${el.courseIdInput.value || 'unknown'}-lessons.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function handleError(error) {
  console.error(error);
  setError(error.message || String(error));
  setStatus('');
}

el.loadBtn.addEventListener('click', () => loadCourse().catch(handleError));
el.searchInput.addEventListener('input', renderLessons);
el.typeFilter.addEventListener('change', renderLessons);
el.copyVideoIdsBtn.addEventListener('click', () => copyVideoIds().catch(handleError));
el.downloadCsvBtn.addEventListener('click', () => {
  try {
    downloadCsv();
  } catch (error) {
    handleError(error);
  }
});
