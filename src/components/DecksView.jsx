import { useState } from 'react';
import { useFirestore } from '../hooks/useFirestore';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Trash2, Play, Sparkles, Loader, Wand2, CheckCircle, AlertCircle, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import StudyMode from './StudyMode';

function AiCardModal({ onGenerate, onClose }) {
  const [inputWords, setInputWords] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, word: '' });
  const [results, setResults] = useState([]); // { word, status: 'pending'|'done'|'error', card? }
  const [error, setError] = useState('');

  const [apiKey] = useLocalStorage('gemini_api_key', '');
  const [apiModel] = useLocalStorage('gemini_api_model', 'gemini-1.5-flash-latest');
  const [aiProvider] = useLocalStorage('ai_provider', 'gemini');
  const [openaiKey] = useLocalStorage('openai_api_key', '');
  const [openaiModel] = useLocalStorage('openai_api_model', 'gpt-4o-mini');

  const parseWords = () => {
    return inputWords
      .split(/[,\n;]+/)
      .map(w => w.trim())
      .filter(w => w.length > 0);
  };

  const wordCount = parseWords().length;

  const callAI = async (words) => {
    const activeApiKey = aiProvider === 'gemini' ? apiKey : openaiKey;
    if (!activeApiKey) {
      throw new Error(`Vui lòng nhập API Key cho ${aiProvider === 'gemini' ? 'Gemini' : 'OpenAI'} trong phần Cài đặt.`);
    }

    const prompt = `Bạn là từ điển Anh-Việt chuyên nghiệp. Phân tích ${words.length > 1 ? 'các từ/cụm từ' : 'từ/cụm từ'} tiếng Anh sau và trả về JSON.

Từ cần phân tích: ${words.map((w, i) => `${i + 1}. ${w}`).join('\n')}

TRẢ VỀ ĐÚNG ĐỊNH DẠNG JSON ARRAY sau (không markdown, không backtick):
[
  {
    "word": "từ tiếng Anh gốc",
    "definition": "nghĩa tiếng Việt (ngắn gọn, chính xác)",
    "pronunciation": "phiên âm IPA, ví dụ: /həˈloʊ/",
    "wordType": "loại từ viết tắt: n. (danh từ), v. (động từ), adj. (tính từ), adv. (trạng từ), prep. (giới từ), conj. (liên từ), phr. (cụm từ)",
    "example": "1 câu ví dụ tiếng Anh sử dụng từ này (tự nhiên, dễ hiểu)",
    "synonyms": "2-3 từ đồng nghĩa tiếng Anh, cách nhau bởi dấu phẩy (nếu có)"
  }
]

QUY TẮC:
- Trả về ĐÚNG JSON array, KHÔNG bọc trong markdown block.
- Nếu từ có nhiều nghĩa, chọn nghĩa phổ biến nhất.
- Phiên âm viết theo chuẩn IPA.
- Ví dụ phải tự nhiên, dễ hiểu cho người Việt.
- Nếu là cụm từ (phrasal verb, idiom), wordType ghi "phr."`;

    if (aiProvider === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationConfig: { maxOutputTokens: 2048, temperature: 0.2 },
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.candidates[0].content.parts[0].text;
    } else {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: openaiModel,
          max_tokens: 2048,
          temperature: 0.2,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.choices[0].message.content;
    }
  };

  const handleGenerate = async () => {
    const words = parseWords();
    if (words.length === 0) return;

    setIsGenerating(true);
    setError('');
    setResults(words.map(w => ({ word: w, status: 'pending' })));

    try {
      // Process in batches of up to 10 words
      const batchSize = 10;
      const allCards = [];

      for (let i = 0; i < words.length; i += batchSize) {
        const batch = words.slice(i, i + batchSize);
        setProgress({ current: i, total: words.length, word: batch.join(', ') });

        const rawText = await callAI(batch);
        // Cleanup and parse JSON
        const cleaned = rawText.replace(/```json\n?/gi, '').replace(/```/g, '').trim();
        let parsed;
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          // Try to extract JSON array from response
          const jsonMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('AI trả về định dạng không hợp lệ.');
          }
        }

        // Map results to cards
        for (const item of parsed) {
          const card = {
            id: uuidv4(),
            front: item.word || '',
            back: item.definition || '',
            pronunciation: item.pronunciation || '',
            wordType: item.wordType || '',
            example: item.example || '',
            synonyms: item.synonyms || '',
          };
          allCards.push(card);
        }

        // Update results status
        setResults(prev => prev.map((r, idx) => {
          if (idx >= i && idx < i + batchSize) {
            const matchedItem = parsed.find(p => p.word?.toLowerCase() === r.word.toLowerCase());
            return { ...r, status: matchedItem ? 'done' : 'done', card: matchedItem };
          }
          return r;
        }));
      }

      setProgress({ current: words.length, total: words.length, word: '' });

      if (allCards.length > 0) {
        onGenerate(allCards);
      } else {
        setError('AI không trả về được thẻ nào. Hãy thử lại.');
        setIsGenerating(false);
      }
    } catch (err) {
      setError(err.message);
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl rounded-2xl border border-white/10 shadow-2xl flex flex-col max-h-[85vh]"
        style={{ background: 'linear-gradient(135deg, #0f1930 0%, #131d38 100%)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #7c4dff, #536dfe)' }}>
              <Wand2 size={20} color="white" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                Tạo thẻ bằng AI
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: 'linear-gradient(135deg, #7c4dff, #536dfe)', color: 'white' }}>AI</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Nhập từ tiếng Anh, AI sẽ tự phân tích đầy đủ</p>
            </div>
          </div>
          <button className="text-slate-400 hover:text-white transition-colors p-1" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-3 flex-1 overflow-auto">
          {!isGenerating ? (
            <>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 block">
                Nhập từ vựng tiếng Anh
                <span className="text-slate-500 normal-case font-normal ml-1">(cách nhau bởi dấu phẩy, chấm phẩy, hoặc xuống dòng)</span>
              </label>
              <textarea
                value={inputWords}
                onChange={e => setInputWords(e.target.value)}
                placeholder={`Ví dụ:\nabundant, resilient, elaborate\n\nHoặc mỗi từ 1 dòng:\nserendipity\nephemeral\nubiquitous`}
                className="w-full rounded-xl border-2 border-white/10 focus:border-[#7c4dff]/50 transition-colors resize-none"
                style={{
                  minHeight: '160px', background: 'rgba(0,0,0,0.3)', color: 'var(--text-main)',
                  padding: '16px', fontSize: '14px', fontFamily: 'monospace', outline: 'none',
                }}
                autoFocus
              />

              {/* Word count & tips */}
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-slate-400">
                  {wordCount > 0 ? (
                    <span className="flex items-center gap-1.5">
                      <Sparkles size={12} className="text-[#7c4dff]" />
                      <span><strong className="text-white">{wordCount}</strong> từ sẽ được AI phân tích</span>
                    </span>
                  ) : (
                    'Nhập ít nhất 1 từ để bắt đầu'
                  )}
                </span>
              </div>

              {/* Info box */}
              <div className="mt-4 rounded-xl p-3.5 border border-[#7c4dff]/20" style={{ background: 'rgba(124,77,255,0.06)' }}>
                <p className="text-xs text-slate-300 leading-relaxed flex items-start gap-2">
                  <Sparkles size={14} className="text-[#7c4dff] shrink-0 mt-0.5" />
                  <span>
                    AI sẽ tự động điền: <strong className="text-white">nghĩa tiếng Việt</strong>, <strong className="text-white">phiên âm IPA</strong>,
                    <strong className="text-white"> loại từ</strong>, <strong className="text-white">câu ví dụ</strong>, và <strong className="text-white">từ đồng nghĩa</strong> cho mỗi từ.
                  </span>
                </p>
              </div>

              {error && (
                <div className="mt-3 rounded-lg p-3 border border-red-500/30 flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.08)' }}>
                  <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                  <span className="text-xs text-red-300">{error}</span>
                </div>
              )}
            </>
          ) : (
            /* Generating state */
            <div className="flex flex-col items-center justify-center py-8 gap-5">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(124,77,255,0.2), rgba(83,109,254,0.1))' }}>
                  <Sparkles size={28} className="text-[#7c4dff] animate-pulse" />
                </div>
                <div
                  className="absolute -inset-3 rounded-3xl border-2 border-[#7c4dff]/20"
                  style={{ animation: 'spin 3s linear infinite' }}
                />
              </div>

              <div className="text-center">
                <p className="text-sm font-bold text-white mb-1">Đang phân tích từ vựng...</p>
                <p className="text-xs text-slate-400">
                  {progress.word && <>Đang xử lý: <span className="text-[#7c4dff] font-semibold">{progress.word}</span></>}
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full max-w-xs">
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                      background: 'linear-gradient(90deg, #7c4dff, #536dfe, #00e3fd)',
                    }}
                  />
                </div>
                <p className="text-[11px] text-slate-500 text-center mt-1.5">
                  {progress.current} / {progress.total} từ
                </p>
              </div>

              {/* Results preview */}
              {results.length > 0 && (
                <div className="w-full max-w-xs flex flex-col gap-1 mt-2">
                  {results.map((r, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      {r.status === 'done' ? (
                        <CheckCircle size={12} className="text-emerald-400" />
                      ) : r.status === 'error' ? (
                        <AlertCircle size={12} className="text-red-400" />
                      ) : (
                        <Loader size={12} className="text-slate-500 animate-spin" />
                      )}
                      <span className={r.status === 'done' ? 'text-emerald-300' : r.status === 'error' ? 'text-red-300' : 'text-slate-500'}>
                        {r.word}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isGenerating && (
          <div className="flex items-center justify-end px-6 py-4 border-t border-white/5 gap-3">
            <button
              className="px-5 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition-all"
              onClick={onClose}
            >
              Huỷ
            </button>
            <button
              className="px-5 py-2.5 rounded-lg text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              style={{ background: 'linear-gradient(135deg, #7c4dff, #536dfe)', color: 'white', boxShadow: '0 4px 20px rgba(124,77,255,0.35)' }}
              onClick={handleGenerate}
              disabled={wordCount === 0}
            >
              <Sparkles size={15} />
              Tạo {wordCount > 0 ? `${wordCount} thẻ` : 'thẻ'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

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
                  <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer text-sm text-slate-300 hover:text-white transition-colors" onClick={() => setCardSeparator(opt.value)}>
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
    <div className="rounded-xl border border-white/10 overflow-hidden" style={{ background: 'rgba(var(--glass-rgb), 0.05)', flexShrink: 0 }}>
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
              className="w-full px-3 py-2 rounded-lg text-sm text-[color:var(--text-main)] placeholder-slate-500 outline-none border border-[color:var(--border-color)] focus:border-primary/40 transition-colors"
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
              className="w-full px-3 py-2 rounded-lg text-sm text-[color:var(--text-main)] placeholder-slate-500 outline-none border border-[color:var(--border-color)] focus:border-primary/40 transition-colors"
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
        <div className="px-4 pb-4 pt-0 ml-11 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-[color:var(--border-color)] mt-0 pt-3">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1 block">Cách phát âm <span className="text-slate-600 normal-case">(Tùy chọn)</span></label>
            <input
              type="text"
              value={card.pronunciation || ''}
              onChange={e => onUpdate(card.id, 'pronunciation', e.target.value)}
              placeholder="VD: /həˈloʊ/"
              className="w-full px-3 py-1.5 rounded-lg text-sm text-[color:var(--text-main)] placeholder-slate-500 outline-none border border-[color:var(--border-color)] focus:border-primary/30 transition-colors"
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
              className="w-full px-3 py-1.5 rounded-lg text-sm text-[color:var(--text-main)] placeholder-slate-500 outline-none border border-[color:var(--border-color)] focus:border-primary/30 transition-colors"
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
              className="w-full px-3 py-1.5 rounded-lg text-sm text-[color:var(--text-main)] placeholder-slate-500 outline-none border border-[color:var(--border-color)] focus:border-primary/30 transition-colors"
              style={{ background: 'rgba(0,0,0,0.2)' }}
            />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1 block">Từ đồng nghĩa <span className="text-slate-600 normal-case">(Tùy chọn)</span></label>
            <input
              type="text"
              value={card.synonyms || ''}
              onChange={e => onUpdate(card.id, 'synonyms', e.target.value)}
              placeholder="Nhập các từ đồng nghĩa (bằng dấu chấm phẩy ;)"
              className="w-full px-3 py-1.5 rounded-lg text-sm text-[color:var(--text-main)] placeholder-slate-500 outline-none border border-[color:var(--border-color)] focus:border-primary/30 transition-colors"
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
  const [showAiModal, setShowAiModal] = useState(false);

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

      {/* AI Card Generation Modal */}
      {showAiModal && (
        <AiCardModal
          onGenerate={(newCards) => {
            setDecks(decks.map(d =>
              d.id === activeDeckId ? { ...d, cards: [...d.cards, ...newCards] } : d
            ));
            setShowAiModal(false);
          }}
          onClose={() => setShowAiModal(false)}
        />
      )}

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
                className="text-xl font-bold bg-transparent border-none outline-none text-[color:var(--text-main)] p-0 w-full sm:w-auto sm:flex-1"
                style={{ borderBottom: '1px solid var(--border-color)', borderRadius: 0, boxShadow: 'none' }}
              />
              <div className="flex gap-2 shrink-0">
                <button
                  className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #7c4dff, #536dfe)', color: 'white', boxShadow: '0 2px 12px rgba(124,77,255,0.3)' }}
                  onClick={() => setShowAiModal(true)}
                >
                  <Sparkles size={14} />
                  AI tạo thẻ
                </button>
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
              <div className="mb-5 inline-flex items-center justify-center w-14 h-14 rounded-2xl border shadow-xl" style={{ backgroundColor: 'var(--surface-container-highest)', borderColor: 'rgba(var(--glass-rgb),0.1)' }}>
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
