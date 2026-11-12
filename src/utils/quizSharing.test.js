import test from 'node:test';
import assert from 'node:assert/strict';
import { createShareSnapshot, importShareSnapshot, encodeSharedQuiz, decodeSharedQuiz, buildShareUrl } from './quizSharing.js';

const quiz = {
  id: 'private-quiz', title: 'WH-01 Tiếng Việt', folderId: 'my-folder', keyTakeaways: 'private notes',
  questions: [{ id: 'q1', question: 'Cơ sở dữ liệu là gì?', options: { A: '<p>Đáp án A</p>', B: 'Đáp án B' }, answer: 'A', explanation: '<p>Giải thích tiếng Việt</p>', userAnswer: 'B', isStarred: true, readingGroupId: 'read1', listeningGroupId: 'listen1' }],
  readingPassages: [{ id: 'read1', content: '<p>Bài đọc</p>', notes: 'private reading notes', images: [{ id: 'img1', data: 'data:image/png;base64,abc' }] }],
  listeningPassages: [{ id: 'listen1', audioUrl: 'https://example.com/audio.mp3', transcript: 'Hello', transcriptNotes: 'private listening notes' }],
};

test('sharing excludes personal progress and notes without mutating original', () => {
  const snapshot = createShareSnapshot(quiz);
  assert.equal(snapshot.questions[0].userAnswer, undefined);
  assert.equal(snapshot.questions[0].isStarred, undefined);
  assert.equal(snapshot.folderId, undefined);
  assert.equal(snapshot.keyTakeaways, undefined);
  assert.equal(snapshot.readingPassages[0].notes, undefined);
  assert.equal(snapshot.listeningPassages[0].transcriptNotes, undefined);
  assert.equal(quiz.questions[0].userAnswer, 'B');
  snapshot.questions[0].options.A = 'changed';
  assert.equal(quiz.questions[0].options.A, '<p>Đáp án A</p>');
});

test('compressed link roundtrip preserves Vietnamese, answers and attachments', async () => {
  const snapshot = createShareSnapshot(quiz, 'toeic');
  assert.deepEqual(await decodeSharedQuiz(await encodeSharedQuiz(snapshot)), snapshot);
});

test('recipient gets independent IDs and both passage associations', () => {
  let next = 0;
  const copy = importShareSnapshot(createShareSnapshot(quiz), () => `copy-${++next}`);
  assert.notEqual(copy.id, quiz.id);
  assert.notEqual(copy.questions[0].id, quiz.questions[0].id);
  assert.equal(copy.questions[0].readingGroupId, copy.readingPassages[0].id);
  assert.equal(copy.questions[0].listeningGroupId, copy.listeningPassages[0].id);
  assert.equal(copy.questions[0].userAnswer, null);
  assert.equal(copy.questions[0].isStarred, false);
  assert.equal(copy.questions[0].explanation, quiz.questions[0].explanation);
});

test('links route modes and remove unrelated or previous URL state', () => {
  const short = new URL(buildShareUrl('https://study.example/app?secret=old#other', { id: 'abc123', mode: 'toeic' }));
  assert.equal(short.pathname, '/app');
  assert.equal(short.searchParams.get('share'), 'abc123');
  assert.equal(short.searchParams.get('mode'), 'toeic');
  assert.equal(short.searchParams.has('secret'), false);
  assert.equal(short.hash, '');
  const direct = new URL(buildShareUrl(short, { payload: 'abc_DEF-123' }));
  assert.equal(direct.searchParams.has('share'), false);
  assert.equal(direct.hash, '#quiz=abc_DEF-123');
  assert.throws(() => buildShareUrl('javascript:alert(1)', { id: 'abc' }));
});

test('malformed and empty shared content is rejected', async () => {
  assert.throws(() => createShareSnapshot({ title: 'Empty', questions: [] }));
  assert.throws(() => createShareSnapshot({ title: 'Bad', questions: [{ question: 'Q', options: [] }] }));
  await assert.rejects(decodeSharedQuiz('not valid!'));
  await assert.rejects(decodeSharedQuiz('aaaa'));
});
