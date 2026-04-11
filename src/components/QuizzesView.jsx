import { useState } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Key, Sparkles, Upload, Play, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export default function QuizzesView() {
  const [quizzes, setQuizzes] = useLocalStorage('study_quizzes', []);
  const [apiKey, setApiKey] = useLocalStorage('gemini_api_key', '');
  const [apiModel, setApiModel] = useLocalStorage('gemini_api_model', 'gemini-1.5-flash-latest');
  
  const [aiProvider, setAiProvider] = useLocalStorage('ai_provider', 'gemini');
  const [openaiKey, setOpenaiKey] = useLocalStorage('openai_api_key', '');
  const [openaiModel, setOpenaiModel] = useLocalStorage('openai_api_model', 'gpt-4o-mini');

  const [activeQuizId, setActiveQuizId] = useState(null);
  const [importText, setImportText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [aiLoading, setAiLoading] = useState(null);
  const [testApiStatus, setTestApiStatus] = useState(null);
  const [testApiMessage, setTestApiMessage] = useState('');
  const [availableModels, setAvailableModels] = useState([]);

  const activeQuiz = quizzes.find(q => q.id === activeQuizId);

  const handleCreateEmptyQuiz = () => {
    const newQuiz = { id: uuidv4(), title: 'Đề trắc nghiệm mới', questions: [], updatedAt: Date.now() };
    setQuizzes([newQuiz, ...quizzes]);
    setActiveQuizId(newQuiz.id);
    setIsTesting(false);
  };

  const handleDeleteQuiz = (e, id) => {
    e.stopPropagation();
    if(window.confirm('Bạn có chắc chắn muốn xóa đề trắc nghiệm này không?')) {
      setQuizzes(quizzes.filter(q => q.id !== id));
      if (activeQuizId === id) setActiveQuizId(null);
    }
  };

  const handleParseImport = () => {
    const questions = parseQuizText(importText);

    if (questions.length > 0) {
      const newQuiz = { id: uuidv4(), title: `Đề import (${questions.length} câu)`, questions, updatedAt: Date.now() };
      setQuizzes([newQuiz, ...quizzes]);
      setActiveQuizId(newQuiz.id);
      setIsImporting(false);
      setImportText('');
    } else {
      alert('Không tìm thấy câu trắc nghiệm hợp lệ. Đảm bảo mỗi câu có đủ 4 đáp án A. B. C. D.');
    }
  };

  /**
   * Robust quiz parser — line-by-line state machine.
   * Rules:
   * 1. Each question has exactly 4 options: A, B, C, D
   * 2. After D is found → any non-option content = new question
   * 3. Does NOT depend on numbering (1., 2., Câu X...)
   * 4. Handles inline and multi-line formats
   * 5. Never merges next question into option D
   */
  function parseQuizText(text) {
    if (!text || !text.trim()) return [];

    // Normalize line endings
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    const questions = [];
    let currentQuestion = '';
    let currentOptions = {};
    let currentAnswer = '';
    let currentExplanation = '';
    let lastOption = ''; // tracks which option we're currently filling
    let hasAllOptions = false;

    const optionRe = /^\s*([A-D])\s*[.)]\s*(.*)/i;
    const answerRe = /^\s*(?:Đáp án|Answer|Đáp Án)\s*[:.]?\s*([A-D])/i;
    const explainRe = /^\s*(?:Giải thích|Explanation|Giải Thích)\s*[:.]?\s*(.*)/i;

    function flushQuestion() {
      // Clean question text
      let q = currentQuestion.trim();
      q = q.replace(/^(?:Câu|Question|Q|Bài)\s*\d+\s*[.):]*\s*/i, '');
      q = q.replace(/^\d+\s*[.)]\s+/, '');
      q = q.trim();

      if (q && currentOptions.A && currentOptions.B && currentOptions.C && currentOptions.D) {
        questions.push({
          id: uuidv4(),
          question: q,
          options: {
            A: currentOptions.A.trim(),
            B: currentOptions.B.trim(),
            C: currentOptions.C.trim(),
            D: currentOptions.D.trim(),
          },
          answer: currentAnswer,
          explanation: currentExplanation.trim(),
          userAnswer: null,
        });
      }
      // Reset
      currentQuestion = '';
      currentOptions = {};
      currentAnswer = '';
      currentExplanation = '';
      lastOption = '';
      hasAllOptions = false;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check for answer line: "Đáp án: B"
      const ansMatch = trimmed.match(answerRe);
      if (ansMatch) {
        currentAnswer = ansMatch[1].toUpperCase();
        continue;
      }

      // Check for explanation line: "Giải thích: ..."
      const explMatch = trimmed.match(explainRe);
      if (explMatch) {
        currentExplanation = explMatch[1];
        continue;
      }

      // Check for option line: "A. text" / "B) text"
      const optMatch = trimmed.match(optionRe);
      if (optMatch) {
        const letter = optMatch[1].toUpperCase();
        const optText = optMatch[2].trim();

        // If we already have D and we see A again → flush and start new question
        if (hasAllOptions && letter === 'A') {
          flushQuestion();
        }

        currentOptions[letter] = optText;
        lastOption = letter;

        if (letter === 'D') {
          hasAllOptions = !!(currentOptions.A && currentOptions.B && currentOptions.C && currentOptions.D);
        }
        continue;
      }

      // It's a regular text line (not an option, not answer/explanation)
      // If we have all 4 options → this must be the start of a new question
      if (hasAllOptions) {
        flushQuestion();
        currentQuestion = trimmed;
        continue;
      }

      // If we haven't started options yet → this is question text
      if (!lastOption || Object.keys(currentOptions).length === 0) {
        if (currentQuestion) {
          currentQuestion += ' ' + trimmed;
        } else {
          currentQuestion = trimmed;
        }
        continue;
      }

      // We're in the middle of options, but this line isn't an option marker
      // Append to the last option (multi-line option text)
      if (lastOption && currentOptions[lastOption] !== undefined) {
        currentOptions[lastOption] += ' ' + trimmed;
      }
    }

    // Flush last question
    if (currentQuestion || Object.keys(currentOptions).length > 0) {
      flushQuestion();
    }

    return questions;
  }

  const handleCallAI = async (qId, questionObj) => {
    const activeApiKey = aiProvider === 'gemini' ? apiKey : openaiKey;
    if (!activeApiKey) {
      alert(`Vui lòng nhập API Key cho ${aiProvider === 'gemini' ? 'Gemini' : 'OpenAI'} ở góc phải bên trên.`);
      return;
    }
    setAiLoading(qId);
    try {
      const prompt = `Bạn là giáo viên tiếng Anh. Giải thích câu hỏi trắc nghiệm sau một cách ĐẦY ĐỦ và HOÀN CHỈNH.

FORMAT BẮT BUỘC:
- Dòng 1: CHỈ ghi duy nhất 1 chữ cái đáp án đúng (A, B, C, hoặc D)
- Từ dòng 2 trở đi: Giải thích theo cấu trúc bên dưới

CẤU TRÚC GIẢI THÍCH BẮT BUỘC:
✔ Đáp án đúng là gì + giải thích vì sao đúng
🧠 Nêu rõ kiến thức liên quan (ngữ pháp hoặc từ vựng quan trọng)
📌 Kết luận ngắn gọn để người học ghi nhớ

QUY TẮC NGHIÊM NGẶT:
- Viết tối thiểu 5-8 dòng, KHÔNG được quá ngắn
- PHẢI viết thành đoạn văn hoàn chỉnh, KHÔNG ĐƯỢC dừng giữa câu
- KHÔNG ĐƯỢC kết thúc bằng "và", "...", hoặc câu dang dở
- Mỗi câu phải có chủ ngữ và vị ngữ đầy đủ
- Viết bằng tiếng Việt, giữ từ khóa tiếng Anh quan trọng
- KHÔNG chào hỏi, KHÔNG tuyên bố

Câu hỏi: ${questionObj.question}
A. ${questionObj.options.A}
B. ${questionObj.options.B}
C. ${questionObj.options.C}
D. ${questionObj.options.D}`;

      let res;
      if (aiProvider === 'gemini') {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            generationConfig: {
              maxOutputTokens: 2048
            },
            contents: [{ parts: [{ text: prompt }] }]
          })
        });
      } else {
        res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`
          },
          body: JSON.stringify({
            model: openaiModel,
            max_tokens: 2048,
            messages: [{ role: 'user', content: prompt }]
          })
        });
      }

      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      
      let textRes = '';
      if (aiProvider === 'gemini') {
        textRes = data.candidates[0].content.parts[0].text.trim();
      } else {
        textRes = data.choices[0].message.content.trim();
      }
      
      const lines = textRes.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      let parsedAns = lines[0] || 'A';
      const matchAns = parsedAns.match(/[A-D]/);
      if (matchAns) parsedAns = matchAns[0];
      
      // Join all lines after the answer letter as the explanation
      let parsedExpl = lines.slice(1).join('\n').trim();
      // If AI wrote everything on one line: "Đáp án B. Vì..."
      if (!parsedExpl && lines[0] && lines[0].length > 5) {
        parsedExpl = lines[0];
      }
      if (!parsedExpl) parsedExpl = "AI không đưa ra lời giải thích.";

      const parsed = { answer: parsedAns, explanation: parsedExpl };
      
      const newQuestions = activeQuiz.questions.map(q => 
        q.id === qId ? { ...q, answer: parsed.answer, explanation: parsed.explanation } : q
      );
      setQuizzes(quizzes.map(q => q.id === activeQuizId ? { ...q, questions: newQuestions } : q));

    } catch (err) {
      alert('Lỗi khi gọi AI: ' + err.message);
    } finally {
      setAiLoading(null);
    }
  };

  const handleUpdateQuestionProp = (qId, prop, value) => {
    const newQuestions = activeQuiz.questions.map(q => 
      q.id === qId ? { ...q, [prop]: value } : q
    );
    setQuizzes(quizzes.map(q => q.id === activeQuizId ? { ...q, questions: newQuestions } : q));
  };

  const handleUpdateOptionProp = (qId, optKey, value) => {
    const newQuestions = activeQuiz.questions.map(q => 
      q.id === qId ? { ...q, options: { ...q.options, [optKey]: value } } : q
    );
    setQuizzes(quizzes.map(q => q.id === activeQuizId ? { ...q, questions: newQuestions } : q));
  };

  const handleSelectAnswer = (qId, optionKey) => {
    const newQuestions = activeQuiz.questions.map(q => 
      q.id === qId ? { ...q, userAnswer: optionKey } : q
    );
    setQuizzes(quizzes.map(q => q.id === activeQuizId ? { ...q, questions: newQuestions } : q));
  };

  const handleTestApi = async () => {
    const activeApiKey = aiProvider === 'gemini' ? apiKey : openaiKey;
    if (!activeApiKey) {
      alert(`Vui lòng nhập API Key cho ${aiProvider === 'gemini' ? 'Gemini' : 'OpenAI'} trước khi test.`);
      return;
    }
    setTestApiStatus('loading');
    setTestApiMessage('Đang đồng bộ Models...');
    try {
      if (aiProvider === 'gemini') {
        const modelRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const modelData = await modelRes.json();
        if (modelData.error) throw new Error(modelData.error.message);
        
        const validModels = modelData.models
          .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
          .map(m => m.name.replace('models/', ''));
        
        setAvailableModels(validModels);
        
        if (!validModels.includes(apiModel) && validModels.length > 0) {
          setApiModel(validModels[0]);
        }
      } else {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${openaiKey}` }
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        
        const validModels = data.data.map(m => m.id).filter(id => id.includes('gpt'));
        setAvailableModels(validModels);
        
        if (!validModels.includes(openaiModel) && validModels.length > 0) {
           setOpenaiModel(validModels.includes('gpt-4o-mini') ? 'gpt-4o-mini' : validModels[0]);
        }
      }
      
      setTestApiStatus('success');
      setTestApiMessage('Thành công! Chọn Model ở bên cạnh.');
    } catch (err) {
      setTestApiStatus('error');
      setTestApiMessage(`Lỗi: ${err.message}`);
    }
  };


  return (
    <div className="split-view">
      <div className="list-pane">
        <div className="list-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
          <button 
            className="w-full py-2.5 rounded-lg text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--on-primary)', boxShadow: '0 0 16px rgba(197,154,255,0.35)' }}
            onClick={handleCreateEmptyQuiz}
          >
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
            Tạo đề bằng AI
          </button>
          <button 
            className="w-full py-2 rounded-lg text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 glass-card text-white hover:bg-white/10"
            onClick={() => setIsImporting(!isImporting)}
          >
            <span className="material-symbols-outlined text-[18px]">description</span> Nhập từ Word
          </button>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mt-1">Bài ôn tập gần đây</h3>
        </div>
        <div className="list-items">
           {quizzes.map(quiz => (
            <div 
              key={quiz.id} 
              className={`list-item ${activeQuizId === quiz.id ? 'selected' : ''}`}
              onClick={() => { setActiveQuizId(quiz.id); setIsTesting(false); setIsImporting(false); }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="list-item-title" style={{ flex: 1 }}>{quiz.title}</div>
                <button className="btn-icon" onClick={(e) => handleDeleteQuiz(e, quiz.id)} style={{ padding: '2px', marginLeft: '5px' }}>
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="list-item-desc">{quiz.questions.length} câu hỏi</div>
            </div>
           ))}
        </div>
      </div>

      <div className="editor-pane">
        {/* Top bar for API Key */}
        <div style={{ padding: '8px 16px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <Key size={16} color="var(--accent-orange)" />
          
          <select 
            value={aiProvider} 
            onChange={e => { setAiProvider(e.target.value); setTestApiStatus(null); setTestApiMessage(''); setAvailableModels([]); }}
            style={{ title: 'Chọn AI Provider', background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '6px 10px', fontSize: '13px', fontWeight: 'bold' }}
          >
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI (ChatGPT)</option>
          </select>

          {aiProvider === 'gemini' ? (
            <>
              <input 
                type="password" 
                placeholder="Nhập Google Gemini API Key..." 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                style={{ flex: 1, background: 'transparent', border: 'none', padding: 0, minWidth: '150px' }}
              />
              <select 
                value={apiModel} 
                onChange={e => setApiModel(e.target.value)}
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '6px 10px', fontSize: '13px', maxWidth: '150px' }}
              >
                {availableModels.length > 0 ? (
                  availableModels.map(m => <option key={m} value={m}>{m}</option>)
                ) : (
                  <>
                    <option value="gemini-2.0-flash">2.0 Flash</option>
                    <option value="gemini-2.5-flash">2.5 Flash</option>
                    <option value="gemini-1.5-flash-latest">1.5 Flash</option>
                    <option value="gemini-1.5-pro-latest">1.5 Pro</option>
                  </>
                )}
              </select>
            </>
          ) : (
            <>
              <input 
                type="password" 
                placeholder="Nhập OpenAI API Key (sk-...)" 
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                style={{ flex: 1, background: 'transparent', border: 'none', padding: 0, minWidth: '150px' }}
              />
              <select 
                value={openaiModel} 
                onChange={e => setOpenaiModel(e.target.value)}
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '6px 10px', fontSize: '13px', maxWidth: '150px' }}
              >
                {availableModels.length > 0 ? (
                  availableModels.map(m => <option key={m} value={m}>{m}</option>)
                ) : (
                  <>
                    <option value="gpt-4o-mini">GPT-4o Mini ⭐</option>
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  </>
                )}
              </select>
            </>
          )}

          <button 
            className="btn" 
            onClick={handleTestApi}
            disabled={testApiStatus === 'loading'}
            style={{ padding: '6px 12px', fontSize: '13px' }}
          >
            {testApiStatus === 'loading' ? 'Đang tải...' : 'Tải danh sách Model'}
          </button>
          {testApiStatus && (
            <span style={{ fontSize: '13px', color: testApiStatus === 'success' ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 'bold' }}>
              {testApiMessage}
            </span>
          )}
        </div>

        {isImporting ? (
          <div className="glass-panel" style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h3>Nhập Câu Hỏi Trắc Nghiệm</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '16px', fontSize: '14px' }}>
              Copy và Paste trực tiếp từ Word. Định dạng yêu cầu: <strong>"Câu 1: [đề] A. [đáp án] B. [đáp án] C. [đáp án] D. [đáp án]"</strong>. (Tùy chọn ghi thêm "Đáp án: A", "Giải thích: ...")
            </p>
            <textarea 
              style={{ flex: 1, resize: 'none', fontFamily: 'monospace' }} 
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder="Câu 1: 1 + 1 bằng mấy?&#10;A. 1&#10;B. 2&#10;C. 3&#10;D. 4"
            />
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="btn" onClick={() => setIsImporting(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleParseImport}>Tiến hành Phân Tích</button>
            </div>
          </div>
        ) : activeQuiz ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <input 
                type="text" 
                value={activeQuiz.title} 
                onChange={(e) => {
                  setQuizzes(quizzes.map(q => q.id === activeQuizId ? { ...q, title: e.target.value } : q));
                }}
                style={{ fontSize: '24px', fontWeight: 'bold', border: 'none', background: 'transparent', padding: '0', boxShadow: 'none' }}
              />
              <button className="btn btn-primary" onClick={() => setIsTesting(!isTesting)}>
                {isTesting ? 'Quay về sửa đề' : <><Play size={16}/> Chế độ Tự Luyện</>}
              </button>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {activeQuiz.questions.map((q, i) => (
                <div key={q.id} className="glass-panel" style={{ padding: '20px', marginBottom: '16px' }}>
                  <div style={{ fontWeight: '500', marginBottom: '16px', fontSize: '16px' }}>
                    {!isTesting ? (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                         <span style={{ paddingTop: '8px' }}>Câu {i + 1}:</span>
                         <textarea 
                           value={q.question}
                           onChange={e => handleUpdateQuestionProp(q.id, 'question', e.target.value)}
                           style={{ flex: 1, background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '8px', fontSize: '15px', resize: 'vertical', minHeight: '60px' }}
                         />
                      </div>
                    ) : (
                      <>Câu {i + 1}: {q.question}</>
                    )}
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    {['A', 'B', 'C', 'D'].map(opt => (
                      <div 
                        key={opt}
                        onClick={() => isTesting && handleSelectAnswer(q.id, opt)}
                        style={{ 
                          padding: '12px', 
                          borderRadius: '8px', 
                          border: '1px solid var(--border-color)',
                          background: isTesting 
                            ? (q.userAnswer === opt ? (isTesting && q.answer && q.userAnswer !== q.answer ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)') : 'transparent')
                            : (q.answer === opt ? 'rgba(16, 185, 129, 0.2)' : 'transparent'),
                          cursor: isTesting ? 'pointer' : 'default',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                         <strong>{opt}.</strong> 
                         {!isTesting ? (
                           <input
                             type="text"
                             value={q.options[opt]}
                             onChange={(e) => handleUpdateOptionProp(q.id, opt, e.target.value)}
                             style={{ flex: 1, marginLeft: '4px', background: 'transparent', color: 'var(--text-main)', border: 'none', borderBottom: '1px dashed var(--border-color)', padding: '4px', fontSize: '14px', outline: 'none' }}
                           />
                         ) : (
                           <span> {q.options[opt]}</span>
                         )}
                         {isTesting && q.answer && q.userAnswer === opt && opt === q.answer && <CheckCircle size={16} color="var(--accent-green)"/>}
                         {isTesting && q.answer && q.userAnswer === opt && opt !== q.answer && <XCircle size={16} color="var(--accent-red)"/>}
                      </div>
                    ))}
                  </div>

                  {/* Editor Actions or Explanations */}
                  {(!isTesting || q.userAnswer) && (
                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px dashed var(--border-color)' }}>
                      {!isTesting ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <select 
                              value={q.answer || ''} 
                              onChange={e => handleUpdateQuestionProp(q.id, 'answer', e.target.value)}
                              style={{ background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '6px' }}
                            >
                              <option value="">-- Đáp án đúng --</option>
                              <option value="A">A</option>
                              <option value="B">B</option>
                              <option value="C">C</option>
                              <option value="D">D</option>
                            </select>
                            <button 
                              className="btn" 
                              style={{ color: 'var(--accent-orange)', padding: '6px 12px' }}
                              onClick={() => handleCallAI(q.id, q)}
                              disabled={aiLoading === q.id}
                            >
                              {aiLoading === q.id ? 'Đang hỏi AI...' : <><Sparkles size={16}/> {q.answer ? 'Hỏi lại AI' : 'Hỏi AI Đáp Án & Giải Thích'}</>}
                            </button>
                          </div>
                          <textarea 
                            value={q.explanation || ''}
                            onChange={e => handleUpdateQuestionProp(q.id, 'explanation', e.target.value)}
                            placeholder="Nhập giải thích thủ công hoặc để AI trợ giúp điền..."
                            style={{ width: '100%', minHeight: '120px', background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', fontSize: '13px', resize: 'vertical', lineHeight: '1.6' }}
                          />
                        </div>
                      ) : (
                        <div style={{ fontSize: '14px' }}>
                          {q.answer && <div style={{ color: 'var(--accent-green)', fontWeight: 'bold', marginBottom: '8px', fontSize: '15px' }}>✓ Đáp án đúng: {q.answer}. {q.options[q.answer]}</div>}
                          {q.explanation && (
                            <div style={{ 
                              color: 'var(--text-muted)', 
                              whiteSpace: 'pre-wrap', 
                              lineHeight: '1.7',
                              background: 'rgba(255,255,255,0.03)',
                              borderRadius: '8px',
                              padding: '12px',
                              border: '1px solid rgba(255,255,255,0.06)',
                              fontSize: '13.5px'
                            }}>
                              <strong style={{ color: 'var(--accent-orange)' }}>📝 Giải thích:</strong>{'\n'}{q.explanation}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="blank-slate" style={{ padding: '0 1.5rem' }}>
            <div className="relative z-10 w-full flex flex-col items-center">
              <div className="mb-5 inline-flex items-center justify-center w-14 h-14 rounded-2xl border shadow-xl" style={{ backgroundColor: 'var(--surface-container-highest)', borderColor: 'rgba(255,255,255,0.1)' }}>
                <span className="material-symbols-outlined text-3xl" style={{ color: 'var(--primary)', fontVariationSettings: "'FILL' 1" }}>rocket_launch</span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight mb-2 text-white">Sẵn sàng học chưa?</h1>
              <p className="text-sm text-slate-400 mb-6 max-w-sm mx-auto leading-relaxed">Import đề hoặc tạo đề bằng AI trong 1 click để bắt đầu phiên học của bạn.</p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
                <button 
                  className="w-full sm:w-auto px-6 py-2.5 rounded-full text-sm font-bold transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                  style={{ backgroundColor: 'var(--secondary)', color: 'var(--on-secondary)', boxShadow: '0 0 16px rgba(0,227,253,0.35)' }}
                  onClick={() => setIsImporting(true)}
                >
                  <span className="material-symbols-outlined text-[18px]">description</span>
                  Nhập từ Word
                </button>
                <button 
                  className="w-full sm:w-auto px-6 py-2.5 rounded-full text-sm glass-card text-white font-bold transition-all hover:bg-white/10 active:scale-95 flex items-center justify-center gap-2"
                  onClick={handleCreateEmptyQuiz}
                >
                  <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                  Tạo đề bằng AI
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Icon Helper
function PlusIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>;
}
