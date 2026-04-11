import { useState } from 'react';
import { useFirestore } from '../hooks/useFirestore';
import { Trash2, Play } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import StudyMode from './StudyMode';

function ImportModal({ onImport, onClose }) {
  const [importText, setImportText] = useState('');
  const [termSeparator, setTermSeparator] = useState('tab');
  const [customTermSeparator, setCustomTermSeparator] = useState('-');
  const [cardSeparator, setCardSeparator] = useState('newline');

  const getActiveSeps = () => {
    let activeCardSep = '\n';
    if (cardSeparator === 'semicolon') activeCardSep = ';';

    let activeTermSep = '\t';
    if (termSeparator === 'comma') activeTermSep = ',';
    if (termSeparator === 'custom') activeTermSep = customTermSeparator || '\t';

    return { activeCardSep, activeTermSep };
  };

  const getParsedCards = () => {
    if (!importText.trim()) return [];
    const { activeCardSep, activeTermSep } = getActiveSeps();
    const rawCards = importText.split(activeCardSep);
    const validCards = [];
    rawCards.forEach(rc => {
      const parts = rc.split(activeTermSep).map(p => p.trim());
      if (parts.length >= 2 && parts[0] && parts[1]) {
        validCards.push({
          id: uuidv4(),
          front: parts[0],
          back: parts[1],
          pronunciation: parts[2] || '',
          wordType: parts[3] || '',
          example: parts[4] || '',
          synonyms: parts[5] || '',
        });
      }
    });
    return validCards;
  };

  const parsedCount = getParsedCards().length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-white/10 shadow-2xl flex flex-col max-h-[85vh]"
        style={{ background: 'linear-gradient(135deg, #0f1930 0%, #131d38 100%)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-2">
          <div>
            <h2 className="text-2xl font-extrabold text-white">Nhập</h2>
            <p className="text-sm text-slate-400 mt-1">Chép và dán dữ liệu từ Word, Excel, Google Docs, v.v.</p>
          </div>
          <button className="text-slate-400 hover:text-white transition-colors p-1" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Textarea */}
        <div className="px-6 py-3 flex-1 overflow-auto">
          <textarea
            value={importText}
            onChange={e => setImportText(e.target.value)}
            placeholder={`Từ 1\tĐịnh nghĩa 1\tPhát âm (nếu có)\tLoại từ (nếu có)\tVí dụ (nếu có)\tTừ đồng nghĩa (nếu có)\nTừ 2\tĐịnh nghĩa 2\tPhát âm (nếu có)\tLoại từ (nếu có)\tVí dụ (nếu có)\tTừ đồng nghĩa (nếu có)\nTừ 3\tĐịnh nghĩa 3\tPhát âm (nếu có)\tLoại từ (nếu có)\tVí dụ (nếu có)\tTừ đồng nghĩa (nếu có)`}
            className="w-full rounded-xl border-2 border-white/10 focus:border-primary/50 transition-colors resize-none"
            style={{
              minHeight: '180px', background: 'rgba(0,0,0,0.3)', color: 'var(--text-main)',
              padding: '16px', fontSize: '14px', fontFamily: 'monospace', outline: 'none',
            }}
          />

          {/* Separator Options */}
          <div className="grid grid-cols-2 gap-6 mt-5">
            <div>
              <h4 className="text-sm font-bold text-secondary mb-3">Giữa thuật ngữ và định nghĩa</h4>
              <div className="flex flex-col gap-2.5">
                {[
                  { value: 'tab', label: 'Tab' },
                  { value: 'comma', label: 'Phẩy' },
                ].map(opt => (
                  <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer text-sm text-slate-300 hover:text-white transition-colors">
                    <div className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all ${termSeparator === opt.value ? 'border-secondary bg-secondary/20' : 'border-slate-500'}`}>
                      {termSeparator === opt.value && <div className="w-2 h-2 rounded-full bg-secondary" />}
                    </div>
                    {opt.label}
                  </label>
                ))}
                <label className="flex items-center gap-2.5 cursor-pointer text-sm text-slate-300">
                  <div className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all ${termSeparator === 'custom' ? 'border-secondary bg-secondary/20' : 'border-slate-500'}`} onClick={() => setTermSeparator('custom')}>
                    {termSeparator === 'custom' && <div className="w-2 h-2 rounded-full bg-secondary" />}
                  </div>
                  <span onClick={() => setTermSeparator('custom')}>Tuỳ chọn</span>
                  {termSeparator === 'custom' && (
                    <input
                      type="text" value={customTermSeparator}
                      onChange={e => setCustomTermSeparator(e.target.value)}
                      className="ml-1 px-2 py-1 rounded bg-white/5 border border-white/10 text-white text-sm w-20 outline-none focus:border-secondary/50"
                    />
                  )}
                </label>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-bold text-secondary mb-3">Giữa các thẻ</h4>
              <div className="flex flex-col gap-2.5">
                {[
                  { value: 'newline', label: 'Dòng mới' },
                  { value: 'semicolon', label: 'Chấm phẩy' },
                ].map(opt => (
                  <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer text-sm text-slate-300 hover:text-white transition-colors">
                    <div className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all ${cardSeparator === opt.value ? 'border-secondary bg-secondary/20' : 'border-slate-500'}`}>
                      {cardSeparator === opt.value && <div className="w-2 h-2 rounded-full bg-secondary" />}
                    </div>
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/5">
          <span className="text-sm text-slate-400">
            {parsedCount > 0 ? `${parsedCount} thẻ nhận dạng được` : 'Chưa có dữ liệu'}
          </span>
          <div className="flex gap-3">
            <button
              className="px-5 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition-all"
              onClick={onClose}
            >
              Huỷ nhập
            </button>
            <button
              className="px-5 py-2 rounded-lg text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--primary)', color: 'var(--on-primary)' }}
              onClick={() => onImport(getParsedCards())}
              disabled={parsedCount === 0}
            >
              Nhập
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardEditor({ card, index, onUpdate, onDelete, onMoveUp, onMoveDown, isFirst, isLast }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden" style={{ background: 'rgba(15, 25, 48, 0.5)', flexShrink: 0 }}>
      {/* Main row */}
      <div className="flex items-start gap-4 p-4">
        {/* Index number */}
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold text-primary shrink-0 mt-1" style={{ background: 'rgba(197,154,255,0.1)' }}>
          {index + 1}
        </div>

        {/* Term + Definition */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">Thuật ngữ</label>
            <input
              type="text"
              value={card.front}
              onChange={e => onUpdate(card.id, 'front', e.target.value)}
              placeholder="Nhập thuật ngữ"
              className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-500 outline-none border border-white/5 focus:border-primary/40 transition-colors"
              style={{ background: 'rgba(0,0,0,0.25)' }}
            />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">Định nghĩa</label>
            <input
              type="text"
              value={card.back}
              onChange={e => onUpdate(card.id, 'back', e.target.value)}
              placeholder="Nhập định nghĩa"
              className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-500 outline-none border border-white/5 focus:border-primary/40 transition-colors"
              style={{ background: 'rgba(0,0,0,0.25)' }}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <button className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-all" onClick={() => onDelete(card.id)} title="Xóa">
            <Trash2 size={15} />
          </button>
          <button
            className="p-1 rounded text-slate-500 hover:text-white hover:bg-white/10 transition-all disabled:opacity-20"
            onClick={() => onMoveUp(card.id)} disabled={isFirst} title="Di chuyển lên"
          >
            <span className="material-symbols-outlined text-[16px]">expand_less</span>
          </button>
          <button
            className="p-1 rounded text-slate-500 hover:text-white hover:bg-white/10 transition-all disabled:opacity-20"
            onClick={() => onMoveDown(card.id)} disabled={isLast} title="Di chuyển xuống"
          >
            <span className="material-symbols-outlined text-[16px]">expand_more</span>
          </button>
        </div>
      </div>

      {/* Expandable extra fields */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 ml-11 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-white/5 mt-0 pt-3">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1 block">Cách phát âm <span className="text-slate-600 normal-case">(Tùy chọn)</span></label>
            <input
              type="text"
              value={card.pronunciation || ''}
              onChange={e => onUpdate(card.id, 'pronunciation', e.target.value)}
              placeholder="VD: /həˈloʊ/"
              className="w-full px-3 py-1.5 rounded-lg text-sm text-white placeholder-slate-600 outline-none border border-white/5 focus:border-primary/30 transition-colors"
              style={{ background: 'rgba(0,0,0,0.2)' }}
            />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1 block">Loại từ <span className="text-slate-600 normal-case">(Tùy chọn)</span></label>
            <input
              type="text"
              value={card.wordType || ''}
              onChange={e => onUpdate(card.id, 'wordType', e.target.value)}
              placeholder="VD: noun, verb..."
              className="w-full px-3 py-1.5 rounded-lg text-sm text-white placeholder-slate-600 outline-none border border-white/5 focus:border-primary/30 transition-colors"
              style={{ background: 'rgba(0,0,0,0.2)' }}
            />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1 block">Ví dụ <span className="text-slate-600 normal-case">(Tùy chọn)</span></label>
            <input
              type="text"
              value={card.example || ''}
              onChange={e => onUpdate(card.id, 'example', e.target.value)}
              placeholder="Nhập câu ví dụ"
              className="w-full px-3 py-1.5 rounded-lg text-sm text-white placeholder-slate-600 outline-none border border-white/5 focus:border-primary/30 transition-colors"
              style={{ background: 'rgba(0,0,0,0.2)' }}
            />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1 block">Từ đồng nghĩa <span className="text-slate-600 normal-case">(Tùy chọn)</span></label>
            <input
              type="text"
              value={card.synonyms || ''}
              onChange={e => onUpdate(card.id, 'synonyms', e.target.value)}
              placeholder="Nhập các từ đồng nghĩa, cách nhau bằng dấu chấm phẩy (;)"
              className="w-full px-3 py-1.5 rounded-lg text-sm text-white placeholder-slate-600 outline-none border border-white/5 focus:border-primary/30 transition-colors"
              style={{ background: 'rgba(0,0,0,0.2)' }}
            />
          </div>
        </div>
      )}

      {/* Expand toggle */}
      <button
        className="w-full py-1.5 text-center text-xs text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all flex items-center justify-center gap-1 border-t border-white/5"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="material-symbols-outlined text-[14px]">{expanded ? 'expand_less' : 'expand_more'}</span>
        {expanded ? 'Thu gọn' : 'Thêm chi tiết (phát âm, loại từ, ví dụ...)'}
      </button>
    </div>
  );
}


export default function DecksView() {
  const [decks, setDecks] = useFirestore('decks', 'study_decks', []);
  const [activeDeckId, setActiveDeckId] = useState(null);
  const [isStudying, setIsStudying] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const activeDeck = decks.find(d => d.id === activeDeckId);

  const handleAddDeck = () => {
    const newDeck = { id: uuidv4(), title: 'Bộ thẻ mới', cards: [] };
    setDecks([newDeck, ...decks]);
    setActiveDeckId(newDeck.id);
  };

  const handleDeleteDeck = (e, id) => {
    e.stopPropagation();
    setDecks(decks.filter(d => d.id !== id));
    if (activeDeckId === id) setActiveDeckId(null);
  };

  const handleUpdateDeckTitle = (title) => {
    setDecks(decks.map(d => d.id === activeDeckId ? { ...d, title } : d));
  };

  const handleAddCard = () => {
    const newCard = { id: uuidv4(), front: '', back: '', pronunciation: '', wordType: '', example: '', synonyms: '' };
    setDecks(decks.map(d =>
      d.id === activeDeckId ? { ...d, cards: [...d.cards, newCard] } : d
    ));
  };

  const handleUpdateCard = (cardId, field, value) => {
    setDecks(decks.map(d => {
      if (d.id !== activeDeckId) return d;
      return { ...d, cards: d.cards.map(c => c.id === cardId ? { ...c, [field]: value } : c) };
    }));
  };

  const handleDeleteCard = (cardId) => {
    setDecks(decks.map(d => {
      if (d.id !== activeDeckId) return d;
      return { ...d, cards: d.cards.filter(c => c.id !== cardId) };
    }));
  };

  const handleMoveCard = (cardId, direction) => {
    setDecks(decks.map(d => {
      if (d.id !== activeDeckId) return d;
      const cards = [...d.cards];
      const idx = cards.findIndex(c => c.id === cardId);
      if (idx === -1) return d;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= cards.length) return d;
      [cards[idx], cards[newIdx]] = [cards[newIdx], cards[idx]];
      return { ...d, cards };
    }));
  };

  const handleImport = (newCards) => {
    if (newCards.length > 0) {
      setDecks(decks.map(d =>
        d.id === activeDeckId ? { ...d, cards: [...d.cards, ...newCards] } : d
      ));
    }
    setShowImport(false);
  };

  if (isStudying && activeDeck) {
    return (
      <StudyMode
        deck={activeDeck}
        onClose={() => setIsStudying(false)}
        onUpdateDeck={(updatedDeck) => {
          setDecks(decks.map(d => d.id === updatedDeck.id ? updatedDeck : d));
        }}
      />
    );
  }

  return (
    <div className="split-view">
      {/* Import Modal */}
      {showImport && <ImportModal onImport={handleImport} onClose={() => setShowImport(false)} />}

      <div className="list-pane">
        <div className="list-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
          <button
            className="w-full py-2.5 rounded-lg text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--on-primary)', boxShadow: '0 0 16px rgba(197,154,255,0.35)' }}
            onClick={handleAddDeck}
          >
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>add_circle</span>
            Tạo bộ thẻ mới
          </button>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mt-1">Bộ thẻ của bạn</h3>
        </div>
        <div className="list-items">
          {decks.length === 0 ? (
            <div style={{ padding: '20px', color: 'var(--text-muted)' }}>Chưa có bộ thẻ nào.</div>
          ) : (
            decks.map(deck => (
              <div
                key={deck.id}
                className={`list-item ${activeDeckId === deck.id ? 'selected' : ''}`}
                onClick={() => setActiveDeckId(deck.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div className="list-item-title" style={{ flex: 1 }}>{deck.title}</div>
                  <button className="btn-icon" onClick={(e) => handleDeleteDeck(e, deck.id)} style={{ padding: '2px', marginLeft: '5px' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="list-item-desc">{deck.cards.length} thẻ</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="editor-pane">
        {activeDeck ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            {/* Title + Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
              <input
                type="text"
                value={activeDeck.title}
                onChange={e => handleUpdateDeckTitle(e.target.value)}
                className="text-xl font-bold bg-transparent border-none outline-none text-white p-0 w-full sm:w-auto sm:flex-1"
                style={{ borderBottom: '1px solid var(--border-color)', borderRadius: 0, boxShadow: 'none' }}
              />
              <div className="flex gap-2 shrink-0">
                <button
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 text-slate-300 hover:text-white hover:bg-white/10 transition-all border border-white/10"
                  onClick={() => setShowImport(true)}
                >
                  <span className="material-symbols-outlined text-[16px]">upload_file</span>
                  Nhập
                </button>
                <button
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 text-slate-300 hover:text-white hover:bg-white/10 transition-all border border-white/10"
                  onClick={handleAddCard}
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Thêm thẻ
                </button>
                <button
                  className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
                  style={{ backgroundColor: 'var(--secondary)', color: 'var(--on-secondary)' }}
                  onClick={() => setIsStudying(true)}
                  disabled={activeDeck.cards.length === 0}
                >
                  <Play size={14} />
                  Học
                </button>
              </div>
            </div>

            {/* Cards list */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '20px', paddingRight: '4px' }}>
              {activeDeck.cards.length === 0 ? (
                <div className="blank-slate" style={{ height: '200px' }}>
                  <span className="material-symbols-outlined text-3xl text-slate-600 mb-2">layers</span>
                  <p className="text-sm text-slate-500">Chưa có thẻ nào. Bấm "Thêm thẻ" hoặc "Nhập" để bắt đầu.</p>
                </div>
              ) : (
                activeDeck.cards.map((card, index) => (
                  <CardEditor
                    key={card.id}
                    card={card}
                    index={index}
                    onUpdate={handleUpdateCard}
                    onDelete={handleDeleteCard}
                    onMoveUp={(id) => handleMoveCard(id, 'up')}
                    onMoveDown={(id) => handleMoveCard(id, 'down')}
                    isFirst={index === 0}
                    isLast={index === activeDeck.cards.length - 1}
                  />
                ))
              )}

              {/* Add card button at bottom */}
              {activeDeck.cards.length > 0 && (
                <button
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-white border border-dashed border-white/10 hover:border-white/20 hover:bg-white/5 transition-all flex items-center justify-center gap-2"
                  style={{ flexShrink: 0 }}
                  onClick={handleAddCard}
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  Thêm thẻ
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="blank-slate" style={{ padding: '0 1.5rem' }}>
            <div className="relative z-10 w-full flex flex-col items-center">
              <div className="mb-5 inline-flex items-center justify-center w-14 h-14 rounded-2xl border shadow-xl" style={{ backgroundColor: 'var(--surface-container-highest)', borderColor: 'rgba(255,255,255,0.1)' }}>
                <span className="material-symbols-outlined text-3xl" style={{ color: 'var(--primary)', fontVariationSettings: "'FILL' 1" }}>style</span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight mb-2 text-white">Quản lý thẻ nhớ</h1>
              <p className="text-sm text-slate-400 mb-6 max-w-sm mx-auto leading-relaxed">Chọn một bộ thẻ để chỉnh sửa học từ vựng hiệu quả.</p>
              <div className="flex items-center justify-center gap-3 w-full">
                <button
                  className="px-6 py-2.5 rounded-full text-sm font-bold transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                  style={{ backgroundColor: 'var(--secondary)', color: 'var(--on-secondary)', boxShadow: '0 0 16px rgba(0,227,253,0.35)' }}
                  onClick={handleAddDeck}
                >
                  <span className="material-symbols-outlined text-[18px]">add_circle</span>
                  Tạo bộ thẻ mới
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
