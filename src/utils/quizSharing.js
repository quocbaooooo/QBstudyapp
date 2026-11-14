// A shared quiz is a snapshot of learning content, never the learner's answers.
const QUESTION_FIELDS = ['id', 'question', 'options', 'answer', 'explanation', 'blankNumber', 'allowMultipleAnswers', 'readingGroupId', 'listeningGroupId', 'image', 'images', 'type'];
const PASSAGE_FIELDS = ['id', 'title', 'type', 'part', 'rangeStr', 'content', 'translation', 'contentTranslation', 'blankNumbers', 'audioUrl', 'audioName', 'transcript', 'transcriptTranslation', 'images'];
const pick = (value, fields) => Object.fromEntries(fields.filter(key => value[key] !== undefined).map(key => [key, value[key]]));

export function validateSharedQuiz(quiz) {
  if (!quiz || typeof quiz.title !== 'string' || !Array.isArray(quiz.questions) || !quiz.questions.length || quiz.questions.length > 5000) {
    throw new Error('Bộ đề chia sẻ không hợp lệ hoặc không có câu hỏi.');
  }
  for (const q of quiz.questions) {
    if (!q || typeof q.question !== 'string' || !q.options || Array.isArray(q.options) || typeof q.options !== 'object'
      || Object.values(q.options).some(option => typeof option !== 'string')) {
      throw new Error('Bộ đề chia sẻ có câu hỏi không hợp lệ.');
    }
  }
  for (const field of ['readingPassages', 'listeningPassages']) {
    if (quiz[field] !== undefined && (!Array.isArray(quiz[field]) || quiz[field].some(p => !p || typeof p !== 'object'))) {
      throw new Error('Dữ liệu bài đọc hoặc bài nghe không hợp lệ.');
    }
  }
  return quiz;
}

export function createShareSnapshot(quiz, mode = 'general') {
  validateSharedQuiz(quiz);
  return JSON.parse(JSON.stringify({
    title: quiz.title, description: quiz.description || '', mode,
    questions: quiz.questions.map(q => pick(q, QUESTION_FIELDS)),
    readingPassages: (quiz.readingPassages || []).map(p => pick(p, PASSAGE_FIELDS)),
    listeningPassages: (quiz.listeningPassages || []).map(p => pick(p, PASSAGE_FIELDS)),
  }));
}

export function importShareSnapshot(snapshot, createId = () => crypto.randomUUID()) {
  const clean = createShareSnapshot(snapshot, snapshot.mode);
  const readingIds = new Map();
  const listeningIds = new Map();
  const remap = (passages, ids) => passages.map(p => {
    const id = createId();
    ids.set(p.id, id);
    return { ...p, id };
  });
  const readingPassages = remap(clean.readingPassages, readingIds);
  const listeningPassages = remap(clean.listeningPassages, listeningIds);
  return {
    ...clean, id: createId(), folderId: null, updatedAt: Date.now(), readingPassages, listeningPassages,
    questions: clean.questions.map(q => ({
      ...q, id: createId(), userAnswer: null, isStarred: false,
      readingGroupId: readingIds.get(q.readingGroupId) || null,
      listeningGroupId: listeningIds.get(q.listeningGroupId) || null,
    })),
  };
}

export async function encodeSharedQuiz(snapshot) {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  for (const byte of compressed) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export async function decodeSharedQuiz(payload) {
  if (typeof payload !== 'string' || payload.length > 1_200_000 || !/^[\w-]+$/.test(payload)) throw new Error('Link chia sẻ không hợp lệ.');
  const binary = atob(payload.replaceAll('-', '+').replaceAll('_', '/'));
  const stream = new Blob([Uint8Array.from(binary, ch => ch.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 8_000_000) {
      await reader.cancel();
      throw new Error('Bộ đề chia sẻ vượt quá dung lượng cho phép.');
    }
    chunks.push(value);
  }
  const quiz = JSON.parse(await new Blob(chunks).text());
  return createShareSnapshot(validateSharedQuiz(quiz), quiz.mode);
}

export function buildShareUrl(baseUrl, { id, mode = 'general' }) {
  const url = new URL(baseUrl);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Địa chỉ ứng dụng phải bắt đầu bằng https:// hoặc http://.');
  url.search = '';
  url.hash = '';
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('Thiếu mã bộ đề chia sẻ hợp lệ.');
  url.searchParams.set('share', id);
  if (mode === 'toeic') url.searchParams.set('mode', mode);
  return url.toString();
}
