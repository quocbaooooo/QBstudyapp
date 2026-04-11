import { useState, useEffect, useCallback } from 'react';

export default function StudyMode({ deck, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isShuffled, setIsShuffled] = useState(false);
  const [cardOrder, setCardOrder] = useState([]);

  // Initialize card order
  useEffect(() => {
    const order = deck.cards.map((_, i) => i);
    setCardOrder(isShuffled ? shuffleArray([...order]) : order);
    setCurrentIndex(0);
    setIsFlipped(false);
  }, [deck.cards.length, isShuffled]);

  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  const cards = deck.cards;
  const totalCards = cards.length;
  const actualIndex = cardOrder[currentIndex] ?? 0;
  const currentCard = cards[actualIndex];

  const handleNext = useCallback(() => {
    if (currentIndex < totalCards - 1) {
      setIsFlipped(false);
      setTimeout(() => setCurrentIndex(prev => prev + 1), 100);
    }
  }, [currentIndex, totalCards]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setIsFlipped(false);
      setTimeout(() => setCurrentIndex(prev => prev - 1), 100);
    }
  }, [currentIndex]);

  const handleFlip = useCallback(() => {
    setIsFlipped(prev => !prev);
  }, []);

  const toggleShuffle = () => {
    setIsShuffled(prev => !prev);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') handlePrev();
      else if (e.key === 'ArrowRight') handleNext();
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); handleFlip(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, handleFlip]);

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
                    : 'rgba(255,255,255,0.15)',
                  boxShadow: isCurrent ? '0 0 8px rgba(0,227,253,0.5)' : 'none',
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Flip Card Area */}
      <div className="flex-1 flex items-center justify-center px-4 py-2">
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
              {/* Settings icon */}
              <div className="absolute top-4 left-4">
                <span className="material-symbols-outlined text-slate-600 text-[20px]">tune</span>
              </div>

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
              <div className="absolute top-4 left-4">
                <span className="material-symbols-outlined text-slate-600 text-[20px]">tune</span>
              </div>

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
                <div className="text-sm italic text-secondary/80 text-center mt-1">
                  {currentCard.example}
                </div>
              )}
            </div>
          </div>
        </div>
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
            style={{ backgroundColor: currentIndex < totalCards - 1 ? 'var(--primary)' : 'var(--secondary)', color: currentIndex < totalCards - 1 ? 'var(--on-primary)' : 'var(--on-secondary)' }}
            onClick={handleNext}
            disabled={currentIndex >= totalCards - 1}
          >
            Sau
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
}
