import { useMemo } from 'react';
import { formatTime } from '../hooks/usePomodoro';

const QUICK_START_ITEMS = [
  {
    id: 'quick-note',
    icon: 'edit_note',
    title: 'Ghi chú thông minh',
    description: 'Lưu ý tưởng học tập theo chủ đề và ôn lại nhanh mỗi ngày.',
  },
  {
    id: 'quick-card',
    icon: 'style',
    title: 'Flashcards hiệu quả',
    description: 'Tạo thẻ từ vựng, luyện nhớ chủ động với nhịp ôn tập ngắn.',
  },
  {
    id: 'quick-quiz',
    icon: 'quiz',
    title: 'Làm quiz tự kiểm tra',
    description: 'Tự test ngay sau khi học để tăng khả năng ghi nhớ lâu dài.',
  },
  {
    id: 'quick-progress',
    icon: 'monitoring',
    title: 'Theo dõi tiến độ',
    description: 'Giữ streak học tập đều đặn và cải thiện từng ngày.',
  },
];

const DAILY_READING_ITEMS = [
  {
    id: 'voa-1',
    source: 'VOA Learning English',
    level: 'Beginner · News Words',
    title: 'VOA Learning English - Let’s Learn English',
    description:
      'Các bài nghe đọc chậm, từ vựng dễ hiểu, phù hợp luyện đọc hằng ngày.',
    url: 'https://learningenglish.voanews.com/z/3613',
  },
  {
    id: 'voa-2',
    source: 'VOA Learning English',
    level: 'Intermediate',
    title: 'VOA Learning English - Health & Lifestyle',
    description:
      'Nội dung thực tế về sức khỏe và đời sống với ngôn ngữ vừa sức.',
    url: 'https://learningenglish.voanews.com/z/1579',
  },
  {
    id: 'bbc-1',
    source: 'BBC Learning English',
    level: 'All levels',
    title: 'BBC Learning English - Features',
    description:
      'Bộ bài học đa dạng chủ đề, ngắn gọn, phù hợp luyện đọc + nghe song song.',
    url: 'https://www.bbc.co.uk/learningenglish/english/features',
  },
  {
    id: 'bbc-2',
    source: 'BBC Learning English',
    level: 'Intermediate · News',
    title: 'BBC Learning English - News Review',
    description:
      'Học cụm từ quan trọng qua bản tin thực tế, tăng vốn từ học thuật.',
    url: 'https://www.bbc.co.uk/learningenglish/english/features/newsreview',
  },
];

function HomeView({ pomodoroState }) {
  const { mode, timeLeft, isRunning, progress, switchMode, resetCurrentMode, toggleTimer } = pomodoroState;

  return (
    <div className="home-view" id="home-view-root">
      <section className="home-hero" aria-labelledby="home-hero-title">
        <div>
          <h1 id="home-hero-title">Trang chủ cá nhân hóa</h1>
          <p>
            Bắt đầu buổi học với hướng dẫn nhanh, tập trung cùng Pomodoro và đọc tin tiếng
            Anh mỗi ngày.
          </p>
        </div>
        <div className="home-date-chip" id="home-date-chip">
          <span className="material-symbols-outlined">calendar_month</span>
          <span>{new Date().toLocaleDateString('vi-VN')}</span>
        </div>
      </section>

      <section className="quick-start-section" aria-labelledby="quick-start-heading">
        <h2 id="quick-start-heading">Hướng dẫn sử dụng nhanh</h2>
        <div className="quick-start-grid">
          {QUICK_START_ITEMS.map((item) => (
            <article className="quick-card" key={item.id} id={`card-${item.id}`}>
              <span className="material-symbols-outlined quick-icon">{item.icon}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="home-lower-grid" aria-label="Pomodoro and daily reading">
        <article className="pomodoro-card" id="pomodoro-card">
          <div className="pomodoro-header">
            <h2>Đồng hồ Pomodoro</h2>
            <span className="pomodoro-badge">Âm báo: Bật</span>
          </div>

          <div className="pomodoro-mode-switch" role="tablist" aria-label="Pomodoro modes">
            <button
              id="pomodoro-focus-button"
              className={mode === 'focus' ? 'active' : ''}
              onClick={() => switchMode('focus')}
            >
              Focus 25'
            </button>
            <button
              id="pomodoro-break-button"
              className={mode === 'break' ? 'active' : ''}
              onClick={() => switchMode('break')}
            >
              Break 5'
            </button>
          </div>

          <div className="pomodoro-ring-wrap">
            <svg viewBox="0 0 120 120" className="pomodoro-ring" aria-hidden="true">
              <circle cx="60" cy="60" r="50" className="pomodoro-ring-track" />
              <circle
                cx="60"
                cy="60"
                r="50"
                className="pomodoro-ring-progress"
                style={{ strokeDashoffset: 314 - progress * 314 }}
              />
            </svg>
            <div className="pomodoro-time" id="pomodoro-time-live" aria-live="polite">
              {formatTime(timeLeft)}
            </div>
          </div>

          <div className="pomodoro-actions">
            <button
              id="pomodoro-toggle-button"
              className="btn-primary-action"
              onClick={toggleTimer}
              disabled={timeLeft === 0}
            >
              {isRunning ? 'Tạm dừng' : 'Bắt đầu'}
            </button>
            <button id="pomodoro-reset-button" className="btn-secondary-action" onClick={resetCurrentMode}>
              Đặt lại
            </button>
          </div>
        </article>

        <article className="reading-card" id="daily-reading-card">
          <div className="reading-header">
            <h2>Daily English Reading</h2>
            <span className="reading-subtitle">Curated links ổn định</span>
          </div>
          <div className="reading-list">
            {DAILY_READING_ITEMS.map((item) => (
              <article className="reading-item" key={item.id} id={`reading-${item.id}`}>
                <div className="reading-item-top">
                  <span className="source-badge">{item.source}</span>
                  <span className="level-badge">{item.level}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <a
                  id={`open-${item.id}`}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="reading-link"
                >
                  Đọc ngay
                  <span className="material-symbols-outlined">open_in_new</span>
                </a>
              </article>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

export default HomeView;
