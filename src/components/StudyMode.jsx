import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

const shuffleArray = (source = []) => {
  const arr = [...source];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export default function StudyMode({ deck, onClose, onUpdateDeck, filterStarred = false }) {
  const [studyCardIds] = useState(() => {
    const list = filterStarred ? deck.cards.filter(c => c.isStarred) : deck.cards;
    return list.map(c => c.id);
  });
  
  const cards = useMemo(() => {
    return studyCardIds.map(id => deck.cards.find(c => c.id === id)).filter(Boolean);
  }, [studyCardIds, deck.cards]);

  const totalCards = cards.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isShuffled, setIsShuffled] = useState(false);

  const [studyType, setStudyType] = useState('flip'); // 'flip', 'mcq', or 'write'
  const [mcqSelected, setMcqSelected] = useState(null);
  const [writeInput, setWriteInput] = useState('');
  const [writeResult, setWriteResult] = useState(null); // 'correct' or 'incorrect'
  const [appSoundEnabled] = useLocalStorage('app_sound_enabled', true);

  const cardOrder = useMemo(() => {
    const order = cards.map((_, i) => i);
    return isShuffled ? shuffleArray(order) : order;
  }, [cards, isShuffled]);

  const actualIndex = Math.min(cardOrder[currentIndex] ?? 0, Math.max(totalCards - 1, 0));
  const currentCard = cards[actualIndex];

  const handleNext = useCallback(() => {
    if (currentIndex < totalCards - 1) {
      setIsFlipped(false);
      setMcqSelected(null);
      setWriteInput('');
      setWriteResult(null);
      setTimeout(() => setCurrentIndex(prev => prev + 1), 100);
    }
  }, [currentIndex, totalCards]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setIsFlipped(false);
      setMcqSelected(null);
      setWriteInput('');
      setWriteResult(null);
      setTimeout(() => setCurrentIndex(prev => prev - 1), 100);
    }
  }, [currentIndex]);

  const handleFlip = useCallback(() => {
    if (studyType === 'flip') {
      setIsFlipped(prev => !prev);
    }
  }, [studyType]);

  const toggleShuffle = () => {
    setIsShuffled(prev => !prev);
    setCurrentIndex(0);
    setIsFlipped(false);
    setMcqSelected(null);
    setWriteInput('');
    setWriteResult(null);
  };

  const toggleStar = (e) => {
    if (e) e.stopPropagation();
    if (onUpdateDeck && currentCard) {
      const updatedCards = deck.cards.map(c => 
        c.id === currentCard.id ? { ...c, isStarred: !c.isStarred } : c
      );
      onUpdateDeck({ ...deck, cards: updatedCards });
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Allow navigation key events if not currently interacting with an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Enter' && writeResult !== null) {
          e.preventDefault();
          handleNext();
        }
        return;
      }

      if (e.key === 'ArrowLeft') handlePrev();
      else if (e.key === 'ArrowRight') {
        if (studyType === 'mcq' && mcqSelected === null) return;
        if (studyType === 'write' && writeResult === null) return;
        handleNext();
      }
      else if ((e.key === ' ' || e.key === 'Enter') && studyType === 'flip') { e.preventDefault(); handleFlip(); }
      else if (e.key === 'Enter' && studyType === 'mcq' && mcqSelected !== null) { e.preventDefault(); handleNext(); }
      else if (e.key === 'Enter' && studyType === 'write' && writeResult !== null) { e.preventDefault(); handleNext(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, handleFlip, studyType, mcqSelected, writeResult]);

  const playFeedbackSound = useCallback((isCorrect) => {
    if (!appSoundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      const now = ctx.currentTime;
      if (isCorrect) {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.2);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      }
    } catch {
      console.log('Audio error');
    }
  }, [appSoundEnabled]);

  const handleMcqSelect = (cardId) => {
    if (mcqSelected) return; // Prevent multiple selects
    setMcqSelected(cardId);
    const isCorrect = cardId === currentCard.id;
    playFeedbackSound(isCorrect);
  };

  const handleWriteCheck = (e) => {
    if (e) e.preventDefault();
    if (!writeInput.trim() || writeResult) return;
    
    // Normalize text: lowercase, trim
    const normalizedInput = writeInput.trim().toLowerCase();
    const normalizedAnswer = currentCard.front.trim().toLowerCase();
    
    const isCorrect = normalizedInput === normalizedAnswer;
    setWriteResult(isCorrect ? 'correct' : 'incorrect');
    playFeedbackSound(isCorrect);
  };

  const mcqOptions = useMemo(() => {
    if (studyType !== 'mcq' || !currentCard) return [];

    const others = cards.filter(c => c.id !== currentCard.id);
    const shuffledOthers = shuffleArray(others);
    const randomDistractors = shuffledOthers.slice(0, 3);

    return shuffleArray([currentCard, ...randomDistractors]);
  }, [studyType, currentCard, cards]);

  // Text-to-speech
  const speak = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  if (!currentCard) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <span className="material-symbols-outlined text-6xl text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>celebration</span>
        <h2 className="text-3xl font-extrabold text-white">🎉 Hoàn thành!</h2>
        <p className="text-slate-400">Bạn đã ôn tập xuất sắc bộ thẻ này.</p>
        <button
          className="mt-4 px-6 py-2.5 rounded-full text-sm font-bold transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
          style={{ backgroundColor: 'var(--primary)', color: 'var(--on-primary)' }}
          onClick={onClose}
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Trở về danh sách
        </button>
      </div>
    );
  }

  // Progress dots (max 12 visible)
  const maxDots = Math.min(totalCards, 12);
  const dotStep = totalCards > maxDots ? totalCards / maxDots : 1;

  return (
    <div className="flex flex-col h-full w-full relative select-none">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <button
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
          onClick={onClose}
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          <span className="hidden sm:inline">{deck.title}</span>
        </button>

        {/* Progress dots */}
        <div className="flex items-center gap-1">
          {Array.from({ length: maxDots }).map((_, i) => {
            const isActive = Math.floor(currentIndex / dotStep) >= i;
            const isCurrent = Math.floor(currentIndex / dotStep) === i;
            return (
              <div
                key={i}
                className="rounded-full transition-all duration-300"
                style={{
                  width: isCurrent ? '12px' : '6px',
                  height: '6px',
                  background: isCurrent
                    ? 'var(--secondary)'
                    : isActive
                    ? 'var(--primary)'
                    : 'rgba(var(--glass-rgb),0.15)',
                  boxShadow: isCurrent ? '0 0 8px rgba(var(--glass-rgb),0.5)' : 'none',
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Study Area */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-2 w-full">
        {/* Toggle Mode */}
        <div className="flex gap-2 mb-6 p-1 border border-white/10 rounded-xl" style={{ background: 'rgba(0,0,0,0.2)' }}>
          <button 
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${studyType === 'flip' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            onClick={() => { setStudyType('flip'); setMcqSelected(null); setWriteResult(null); setWriteInput(''); }}
          >Lật thẻ</button>
          <button 
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${studyType === 'mcq' ? 'bg-primary text-on-primary' : 'text-slate-400 hover:text-slate-200'}`}
            onClick={() => { setStudyType('mcq'); setIsFlipped(false); setWriteResult(null); setWriteInput(''); }}
          >Trắc nghiệm</button>
          <button 
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${studyType === 'write' ? 'bg-secondary text-on-secondary' : 'text-slate-400 hover:text-slate-200'}`}
            onClick={() => { setStudyType('write'); setIsFlipped(false); setMcqSelected(null); }}
          >Viết từ</button>
        </div>

        {studyType === 'write' ? (
          <div style={{ maxWidth: '600px' }} className="w-full flex flex-col gap-4">
            {/* Question Card (Vietnamese Meaning) */}
            <div 
              style={{ background: 'linear-gradient(145deg, rgba(20,31,56,0.95), rgba(15,25,48,0.95))', border: '1.5px solid rgba(var(--glass-rgb), 0.15)' }}
              className="rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center shadow-xl relative"
            >
              <div className="absolute top-4 left-4 z-10">
                <button type="button" onClick={toggleStar} className="p-1.5 rounded-full hover:bg-white/10 transition-all text-slate-400 hover:text-white flex items-center justify-center">
                  <span className={`material-symbols-outlined text-[20px] ${currentCard.isStarred ? 'text-yellow-400' : ''}`} style={currentCard.isStarred ? { fontVariationSettings: "'FILL' 1" } : {}}>
                    star
                  </span>
                </button>
              </div>

              <div className="text-slate-400 text-sm mb-2 uppercase tracking-wider font-semibold">Nghĩa của từ</div>
              {currentCard.image && (
                <img 
                  src={currentCard.image} 
                  alt="clue" 
                  className="max-w-full max-h-36 object-contain rounded-lg mb-4" 
                />
              )}
              <div className="text-2xl sm:text-3xl font-bold text-white mt-2 mb-2">{currentCard.back}</div>
              {currentCard.synonyms && (
                <div className="text-sm text-slate-400 text-center">{currentCard.synonyms}</div>
              )}
            </div>

            {/* Input area */}
            <form onSubmit={handleWriteCheck} className="flex flex-col gap-3">
              <input
                type="text"
                autoFocus
                value={writeInput}
                onChange={(e) => setWriteInput(e.target.value)}
                disabled={writeResult !== null}
                placeholder="Nhập từ tiếng Anh..."
                className={`w-full bg-[rgba(var(--glass-rgb),0.04)] border px-4 py-4 rounded-xl text-white text-lg text-center outline-none transition-all placeholder:text-slate-600 focus:bg-[rgba(var(--glass-rgb),0.08)] ${
                  writeResult === 'correct' 
                    ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10' 
                    : writeResult === 'incorrect' 
                      ? 'border-red-500 text-red-400 bg-red-500/10' 
                      : 'border-[rgba(var(--glass-rgb),0.1)] focus:border-secondary'
                }`}
                autoComplete="off"
              />
              
              {!writeResult && (
                <button
                  type="submit"
                  disabled={!writeInput.trim()}
                  className="w-full py-3 rounded-xl font-bold text-white bg-secondary/80 hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Kiểm tra
                </button>
              )}
            </form>

            {/* Answer feedback tip */}
            {writeResult && (
              <div className={`p-4 rounded-xl text-sm border flex gap-3 items-start transition-all
                ${writeResult === 'correct' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-100' : 'bg-red-500/10 border-red-500/20 text-red-100'}
              `}>
                <span className="material-symbols-outlined mt-0.5">
                  {writeResult === 'correct' ? 'check_circle' : 'cancel'}
                </span>
                <div className="flex-1 flex flex-col gap-1.5">
                  <div className="font-bold text-lg">{writeResult === 'correct' ? 'Chính xác!' : 'Chưa chính xác!'}</div>
                  {writeResult === 'incorrect' && (
                    <div className="mt-1 flex flex-col gap-1">
                      <div className="text-slate-300">Đáp án đúng là:</div>
                      <div className="text-xl font-bold text-white flex items-center gap-2">
                        {currentCard.front}
                        <button
                          type="button"
                          className="p-1 rounded-full text-slate-400 hover:text-white bg-white/10 flex items-center justify-center"
                          onClick={() => speak(currentCard.front)}
                          title="Phát âm"
                        >
                          <span className="material-symbols-outlined text-[16px]">volume_up</span>
                        </button>
                      </div>
                    </div>
                  )}
                  {currentCard.wordType || currentCard.pronunciation ? (
                    <div className="flex items-center gap-2 text-slate-400 text-sm italic mt-1">
                      {currentCard.wordType && <span>{currentCard.wordType}</span>}
                      {currentCard.wordType && currentCard.pronunciation && <span>-</span>}
                      {currentCard.pronunciation && <span>{currentCard.pronunciation}</span>}
                    </div>
                  ) : null}
                  {currentCard.example && (
                    <div className="mt-1 flex items-start gap-2">
                      <div><b>Ví dụ:</b> <i>{currentCard.example}</i></div>
                      <button
                        type="button"
                        className="p-1 -mt-1 rounded-full text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 flex items-center justify-center shrink-0 transition-all"
                        onClick={(e) => { e.stopPropagation(); speak(currentCard.example); }}
                        title="Đọc ví dụ"
                      >
                        <span className="material-symbols-outlined text-[14px]">volume_up</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : studyType === 'flip' ? (
          <div
            className={`flip-card ${isFlipped ? 'flipped' : ''}`}
            onClick={handleFlip}
            style={{ cursor: 'pointer', maxWidth: '600px', width: '100%', height: 'min(400px, 55vh)' }}
          >
            <div className="flip-card-inner">
              {/* FRONT */}
              <div
                className="flip-card-front"
                style={{
                  background: 'linear-gradient(145deg, rgba(20,31,56,0.95), rgba(15,25,48,0.95))',
                  border: '1.5px solid rgba(64, 72, 93, 0.4)',
                  borderRadius: '20px',
                  padding: '32px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {/* Star icon */}
                <div className="absolute top-4 left-4 z-10">
                  <button onClick={toggleStar} className="p-1.5 rounded-full hover:bg-white/10 transition-all text-slate-400 hover:text-white flex items-center justify-center">
                    <span className={`material-symbols-outlined text-[24px] ${currentCard.isStarred ? 'text-yellow-400' : ''}`} style={currentCard.isStarred ? { fontVariationSettings: "'FILL' 1" } : {}}>
                      star
                    </span>
                  </button>
                </div>

                {currentCard.image && (
                  <img 
                    src={currentCard.image} 
                    alt="card visual" 
                    className="max-w-full max-h-36 object-contain rounded-lg mb-4" 
                  />
                )}
                <div className="text-2xl sm:text-3xl font-bold text-white mb-3" style={{ whiteSpace: 'pre-wrap', textAlign: 'center' }}>
                  {currentCard.front}
                </div>
                {(currentCard.wordType || currentCard.pronunciation) && (
                  <div className="flex items-center gap-2 text-slate-400 text-sm italic">
                    {currentCard.wordType && <span>{currentCard.wordType}</span>}
                    {currentCard.wordType && currentCard.pronunciation && <span>-</span>}
                    {currentCard.pronunciation && <span>{currentCard.pronunciation}</span>}
                  </div>
                )}
              </div>

              {/* BACK */}
              <div
                className="flip-card-back"
                style={{
                  background: 'linear-gradient(145deg, rgba(20,31,56,0.98), rgba(12,20,40,0.98))',
                  border: '1.5px solid rgba(64, 72, 93, 0.4)',
                  borderRadius: '20px',
                  padding: '32px',
                  transform: 'rotateY(180deg)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px',
                }}
              >
                {/* Star icon */}
                <div className="absolute top-4 left-4 z-10">
                  <button onClick={toggleStar} className="p-1.5 rounded-full hover:bg-white/10 transition-all text-slate-400 hover:text-white flex items-center justify-center">
                    <span className={`material-symbols-outlined text-[24px] ${currentCard.isStarred ? 'text-yellow-400' : ''}`} style={currentCard.isStarred ? { fontVariationSettings: "'FILL' 1" } : {}}>
                      star
                    </span>
                  </button>
                </div>

                {currentCard.image && (
                  <img 
                    src={currentCard.image} 
                    alt="card visual" 
                    className="max-w-full max-h-36 object-contain rounded-lg mb-4" 
                  />
                )}
                {/* Definition */}
                <div className="text-2xl sm:text-3xl font-bold text-white" style={{ textAlign: 'center' }}>
                  {currentCard.back}
                </div>

                {/* Synonyms */}
                {currentCard.synonyms && (
                  <div className="text-sm text-slate-400 text-center">{currentCard.synonyms}</div>
                )}

                {/* Example */}
                {currentCard.example && (
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <div className="text-sm italic text-secondary/80 text-center">
                      {currentCard.example}
                    </div>
                    <button
                      type="button"
                      className="p-1.5 rounded-full text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all"
                      onClick={(e) => { e.stopPropagation(); speak(currentCard.example); }}
                      title="Đọc ví dụ"
                    >
                      <span className="material-symbols-outlined text-[16px]">volume_up</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: '600px' }} className="w-full">
            {/* Question Card */}
            <div 
              style={{ background: 'linear-gradient(145deg, rgba(20,31,56,0.95), rgba(15,25,48,0.95))', border: '1.5px solid rgba(var(--glass-rgb), 0.15)' }}
              className="rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center shadow-xl mb-6 relative"
            >
              <div className="absolute top-4 left-4 z-10">
                <button onClick={toggleStar} className="p-1.5 rounded-full hover:bg-white/10 transition-all text-slate-400 hover:text-white flex items-center justify-center">
                  <span className={`material-symbols-outlined text-[20px] ${currentCard.isStarred ? 'text-yellow-400' : ''}`} style={currentCard.isStarred ? { fontVariationSettings: "'FILL' 1" } : {}}>
                    star
                  </span>
                </button>
              </div>

              <div className="absolute top-4 right-4">
                <button
                  className="p-1 rounded-full text-slate-400 hover:text-white"
                  onClick={(e) => { e.stopPropagation(); speak(currentCard.front); }}
                  title="Phát âm"
                >
                  <span className="material-symbols-outlined text-[18px]">volume_up</span>
                </button>
              </div>

              {currentCard.image && (
                <img 
                  src={currentCard.image} 
                  alt="card visual" 
                  className="max-w-full max-h-32 object-contain rounded-lg mb-4" 
                />
              )}
              <div className="text-2xl sm:text-3xl font-bold text-white mt-4 mb-2">{currentCard.front}</div>
              {(currentCard.wordType || currentCard.pronunciation) && (
                <div className="flex items-center justify-center gap-2 text-slate-400 text-sm italic">
                  {currentCard.wordType && <span>{currentCard.wordType}</span>}
                  {currentCard.wordType && currentCard.pronunciation && <span>-</span>}
                  {currentCard.pronunciation && <span>{currentCard.pronunciation}</span>}
                </div>
              )}
            </div>

            {/* MCQ Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
              {mcqOptions.map((opt, i) => {
                const label = ['A', 'B', 'C', 'D'][i];
                let isCorrectOption = opt.id === currentCard.id;
                
                let stateClass = 'border-[rgba(var(--glass-rgb),0.1)] bg-[rgba(var(--glass-rgb),0.04)] text-slate-200 hover:bg-[rgba(var(--glass-rgb),0.08)]';
                
                if (mcqSelected) {
                  if (isCorrectOption) {
                    stateClass = 'border-emerald-500 bg-emerald-500/10 text-emerald-400';
                  } else if (mcqSelected === opt.id) {
                    stateClass = 'border-red-500 bg-red-500/10 text-red-400';
                  } else {
                    stateClass = 'border-[rgba(var(--glass-rgb),0.05)] bg-transparent text-slate-500 opacity-50';
                  }
                }

                return (
                  <button
                    key={opt.id}
                    onClick={() => handleMcqSelect(opt.id)}
                    disabled={mcqSelected !== null}
                    className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${stateClass}`}
                  >
                    <div className={`shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-bold mt-0.5 border ${
                      mcqSelected && (isCorrectOption || mcqSelected === opt.id) 
                        ? 'border-current' 
                        : 'border-slate-600 bg-slate-800'
                    }`}>
                      {label}
                    </div>
                    <div className="font-semibold text-[15px] leading-tight flex-1" style={{ whiteSpace: 'pre-wrap' }}>
                      {opt.back}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Answer feedback tip */}
            {mcqSelected && (
              <div className={`p-4 rounded-xl text-sm border flex gap-3 items-start
                ${mcqSelected === currentCard.id ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-100' : 'bg-red-500/10 border-red-500/20 text-red-100'}
              `}>
                <span className="material-symbols-outlined mt-0.5">
                  {mcqSelected === currentCard.id ? 'check_circle' : 'cancel'}
                </span>
                <div>
                  <div className="font-bold mb-1">{mcqSelected === currentCard.id ? 'Chính xác!' : 'Chưa chính xác! Đáp án đúng là: ' + currentCard.back}</div>
                  {currentCard.synonyms && <div className="mt-1"><b>Đồng nghĩa:</b> {currentCard.synonyms}</div>}
                  {currentCard.example && (
                    <div className="mt-1 flex items-start gap-2">
                      <div><b>Ví dụ:</b> <i>{currentCard.example}</i></div>
                      <button
                        type="button"
                        className="p-1 -mt-1 rounded-full text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 flex items-center justify-center shrink-0 transition-all"
                        onClick={(e) => { e.stopPropagation(); speak(currentCard.example); }}
                        title="Đọc ví dụ"
                      >
                        <span className="material-symbols-outlined text-[14px]">volume_up</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls area */}
      <div className="shrink-0 flex flex-col items-center gap-3 pb-4 px-4">
        {/* Speaker + auto-play */}
        <div className="flex items-center gap-3">
          <button
            className="p-2 rounded-full hover:bg-white/10 transition-all text-slate-400 hover:text-white"
            onClick={() => speak(isFlipped ? currentCard.back : currentCard.front)}
            title="Phát âm"
          >
            <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>volume_up</span>
          </button>
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap justify-center">
          <span>Phím tắt:</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400 font-mono text-[10px]">←</kbd>
          <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400 font-mono text-[10px]">→</kbd>
          <span>để chuyển thẻ •</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400 font-mono text-[10px]">Space</kbd>
          <span>/</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400 font-mono text-[10px]">Enter</kbd>
          <span>hoặc click để lật thẻ</span>
        </div>

        {/* Card counter */}
        <div className="text-sm text-secondary font-semibold">
          Thẻ {currentIndex + 1} / {totalCards}
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-4">
          <button
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 disabled:opacity-30"
            onClick={handlePrev}
            disabled={currentIndex === 0}
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Trước
          </button>

          {/* Shuffle toggle */}
          <button
            className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-all ${isShuffled ? 'bg-secondary/20 text-secondary border-secondary/30' : 'text-slate-500 hover:text-white border-white/10 hover:bg-white/5'} border`}
            onClick={toggleShuffle}
            title={isShuffled ? 'Tắt xáo trộn' : 'Bật xáo trộn'}
          >
            <span className="material-symbols-outlined text-[18px]">shuffle</span>
            <div className={`w-8 h-4 rounded-full relative transition-colors ${isShuffled ? 'bg-secondary' : 'bg-slate-600'}`}>
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${isShuffled ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
          </button>

          <button
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30"
            style={{ 
              backgroundColor: ((studyType === 'mcq' && mcqSelected === null) || (studyType === 'write' && writeResult === null)) ? 'rgba(var(--glass-rgb), 0.1)' : (currentIndex < totalCards - 1 ? 'var(--primary)' : 'var(--secondary)'), 
              color: ((studyType === 'mcq' && mcqSelected === null) || (studyType === 'write' && writeResult === null)) ? 'var(--text-muted)' : (currentIndex < totalCards - 1 ? 'var(--on-primary)' : 'var(--on-secondary)') 
            }}
            onClick={((studyType === 'mcq' && mcqSelected === null) || (studyType === 'write' && writeResult === null)) ? undefined : handleNext}
            disabled={((studyType === 'mcq' && mcqSelected === null) || (studyType === 'write' && writeResult === null))}
          >
            {currentIndex >= totalCards - 1 ? 'Hoàn thành' : 'Tiếp theo'}
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
}
