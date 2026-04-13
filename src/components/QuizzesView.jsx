import { useState } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Key, Sparkles, Upload, Play, CheckCircle, XCircle, Trash2, Star, Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';
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
  const [testMode, setTestMode] = useState('all'); // 'all' or 'starred'
  const [aiLoading, setAiLoading] = useState(null);
  const [isTakeawaysCollapsed, setIsTakeawaysCollapsed] = useState(false);
  const [isGeneratingTakeaways, setIsGeneratingTakeaways] = useState(false);

  const [isCreatingAiQuiz, setIsCreatingAiQuiz] = useState(false);
  const [aiQuizImage, setAiQuizImage] = useState(null);
  const [aiQuizPrompt, setAiQuizPrompt] = useState('Hãy trích xuất hoặc tạo các câu hỏi trắc nghiệm từ hình ảnh này.');

  const activeQuiz = quizzes.find(q => q.id === activeQuizId);

  const handleCreateEmptyQuiz = () => {
    const newQuiz = { id: uuidv4(), title: 'Đề trắc nghiệm mới', questions: [], updatedAt: Date.now() };
    setQuizzes([newQuiz, ...quizzes]);
    setActiveQuizId(newQuiz.id);
    setIsTesting(false);
    setTestMode('all');
    setIsCreatingAiQuiz(false);
    setIsImporting(false);
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
      setIsCreatingAiQuiz(false);
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

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAiQuizImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerateAiQuiz = async () => {
    const activeApiKey = aiProvider === 'gemini' ? apiKey : openaiKey;
    if (!activeApiKey) {
      alert(`Vui lòng nhập API Key cho ${aiProvider === 'gemini' ? 'Gemini' : 'OpenAI'} ở góc phải bên trên.`);
      return;
    }

    if (!aiQuizImage && !aiQuizPrompt.trim()) {
      alert('Vui lòng tải lên một hình ảnh hoặc nhập yêu cầu.');
      return;
    }

    setAiLoading('generate_quiz');
    try {
      let promptText = `${aiQuizPrompt}

BẠN BẮT BUỘC PHẢI TRẢ VỀ KẾT QUẢ THEO ĐÚNG ĐỊNH DẠNG SAU CHO MỖI CÂU HỎI:
Câu [số]: [Nội dung câu hỏi]
A. [Đáp án A]
B. [Đáp án B]
C. [Đáp án C]
D. [Đáp án D]
Đáp án: [Chữ cái đáp án đúng - chỉ 1 chữ A, B, C hoặc D]
Giải thích: [Giải thích ngắn gọn]

LƯU Ý QUAN TRỌNG:
- Trả về dạng văn bản thuần túy, KHÔNG bọc trong markdown block (như \`\`\` hoặc \`\`\`json).
- Phải có đủ 4 đáp án A, B, C, D cho mỗi câu.
- Phải có dòng "Đáp án:" và "Giải thích:".`;

      let textRes = '';

      if (aiProvider === 'gemini') {
        const parts = [{ text: promptText }];
        
        if (aiQuizImage) {
          const mimeType = aiQuizImage.split(';')[0].split(':')[1];
          const base64Data = aiQuizImage.split(',')[1];
          parts.push({
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          });
        }

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            generationConfig: {
              maxOutputTokens: 2048,
              temperature: 0.4
            },
            contents: [{ parts: parts }]
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        textRes = data.candidates[0].content.parts[0].text;

      } else {
        const content = [{ type: 'text', text: promptText }];
        if (aiQuizImage) {
          content.push({
            type: 'image_url',
            image_url: { url: aiQuizImage }
          });
        }

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`
          },
          body: JSON.stringify({
            model: openaiModel,
            max_tokens: 2048,
            temperature: 0.4,
            messages: [{ role: 'user', content: content }]
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        textRes = data.choices[0].message.content;
      }

      // Cleanup formatting
      textRes = textRes.replace(/```[a-z]*\n/gi, '').replace(/```/g, '').trim();

      const questions = parseQuizText(textRes);

      if (questions.length > 0) {
        const newQuiz = { id: uuidv4(), title: `Đề AI tạo (${questions.length} câu)`, questions, updatedAt: Date.now() };
        setQuizzes([newQuiz, ...quizzes]);
        setActiveQuizId(newQuiz.id);
        setIsCreatingAiQuiz(false);
        setAiQuizImage(null);
        setAiQuizPrompt('Hãy trích xuất hoặc tạo các câu hỏi trắc nghiệm từ hình ảnh này.');
      } else {
        alert('AI không trả về được câu hỏi định dạng đúng. Hãy thử lại.\n\nPhản hồi thô:\n' + textRes.substring(0, 500));
      }

    } catch (err) {
      alert('Lỗi khi gọi AI: ' + err.message);
    } finally {
      setAiLoading(null);
    }
  };

  const handleCallAI = async (qId, questionObj) => {
    const activeApiKey = aiProvider === 'gemini' ? apiKey : openaiKey;
    if (!activeApiKey) {
      alert(`Vui lòng nhập API Key cho ${aiProvider === 'gemini' ? 'Gemini' : 'OpenAI'} ở góc phải bên trên.`);
      return;
    }
    setAiLoading(qId);
    try {
      const prompt = `Bạn là giáo viên tiếng Anh. Chọn đáp án và giải thích câu trắc nghiệm sau thật NGẮN GỌN.

FORMAT BẮT BUỘC:
- Dòng 1: CHỈ ghi duy nhất 1 chữ cái đáp án đúng (A, B, C, hoặc D)
- Từ dòng 2 trở đi: Giải thích NGẮN GỌN trong 1 đoạn nhỏ.

CẤU TRÚC GIẢI THÍCH (TỐI ĐA 2-4 DÒNG):
✔ Tại sao chọn đáp án đó.
🧠 Từ vựng/Ngữ pháp mấu chốt.

QUY TẮC:
- Viết RẤT ngắn gọn, trực diện, khoảng 2-4 câu.
- KHÔNG lan man, KHÔNG lặp lại đề.
- Viết bằng tiếng Việt.

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
              maxOutputTokens: 300
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
            max_tokens: 300,
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

  const handleToggleBookmark = (qId) => {
    const newQuestions = activeQuiz.questions.map(q => 
      q.id === qId ? { ...q, isStarred: !q.isStarred } : q
    );
    setQuizzes(quizzes.map(q => q.id === activeQuizId ? { ...q, questions: newQuestions } : q));
  };

  const handleGenerateTakeaways = async () => {
    if (!activeQuiz || activeQuiz.questions.length === 0) {
      alert("Đề thi chưa có câu hỏi nào để tổng hợp.");
      return;
    }
    const activeApiKey = aiProvider === 'gemini' ? apiKey : openaiKey;
    if (!activeApiKey) {
      alert(`Vui lòng nhập API Key cho ${aiProvider === 'gemini' ? 'Gemini' : 'OpenAI'} ở góc phải bên trên.`);
      return;
    }
    setIsGeneratingTakeaways(true);
    try {
      const questionsText = activeQuiz.questions.map((q, i) => 
        `Câu ${i+1}: ${q.question} (Đáp án: ${q.answer || 'Chưa có'})` 
      ).join('\n');
      
      const prompt = `Bạn là một chuyên gia giáo dục. Hãy quét qua danh sách các câu hỏi trắc nghiệm dưới đây và TÓM TẮT CÁC KIẾN THỨC CỐT LÕI (Key Takeaways).
      
YÊU CẦU:
- Bóc tách các điểm ngữ pháp, cấu trúc câu, hoặc nhóm từ vựng quan trọng xuất hiện trong đề.
- Trình bày dạng danh sách gạch đầu dòng (Markdown bullet points).
- Rất ngắn gọn, súc tích, dễ nhớ.
- Chỉ trả về nội dung tóm tắt, không giới thiệu.

Danh sách câu hỏi:
${questionsText}`;

      let textRes = '';
      if (aiProvider === 'gemini') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            generationConfig: { maxOutputTokens: 500 },
            contents: [{ parts: [{ text: prompt }] }]
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        textRes = data.candidates[0].content.parts[0].text.trim();
      } else {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: openaiModel,
            max_tokens: 500,
            messages: [{ role: 'user', content: prompt }]
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        textRes = data.choices[0].message.content.trim();
      }

      setQuizzes(quizzes.map(q => q.id === activeQuizId ? { ...q, keyTakeaways: textRes } : q));
      setIsTakeawaysCollapsed(false);

    } catch (err) {
      alert('Lỗi tổng hợp AI: ' + err.message);
    } finally {
      setIsGeneratingTakeaways(false);
    }
  };

  const questionsToRender = isTesting && testMode === 'starred' && activeQuiz 
    ? activeQuiz.questions.filter(q => q.isStarred) 
    : (activeQuiz ? activeQuiz.questions : []);

  return (
    <div className="split-view">
      <div className="list-pane">
        <div className="list-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
          <button 
            className="w-full py-2.5 rounded-lg text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--on-primary)', boxShadow: '0 0 16px rgba(197,154,255,0.35)' }}
            onClick={() => { setIsCreatingAiQuiz(true); setIsImporting(false); setActiveQuizId(null); }}
          >
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
            Tạo đề bằng AI
          </button>
          <button 
            className="w-full py-2 rounded-lg text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 glass-card text-white hover:bg-white/10"
            onClick={() => { setIsImporting(true); setIsCreatingAiQuiz(false); setActiveQuizId(null); }}
          >
            <span className="material-symbols-outlined text-[18px]">description</span> Nhập từ Word
          </button>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Bài ôn tập gần đây</h3>
            <button onClick={handleCreateEmptyQuiz} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Tạo đề trống" className="hover:text-primary">
              <PlusIcon />
            </button>
          </div>
        </div>
        <div className="list-items">
           {quizzes.map(quiz => (
            <div 
              key={quiz.id} 
              className={`list-item ${activeQuizId === quiz.id && !isCreatingAiQuiz && !isImporting ? 'selected' : ''}`}
              onClick={() => { setActiveQuizId(quiz.id); setIsTesting(false); setIsImporting(false); setIsCreatingAiQuiz(false); setTestMode('all'); }}
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

        {isCreatingAiQuiz ? (
          <div className="glass-panel" style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined text-[24px]" style={{ color: 'var(--primary)', fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
              Tạo đề bằng AI
            </h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '14px' }}>
              Tải lên hình ảnh tài liệu, bài tập hoặc sách giáo khoa. AI sẽ tự động phân tích và trích xuất thành bộ đề trắc nghiệm hoàn chỉnh, kèm theo đáp án và giải thích chi tiết.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <label style={{ 
                border: '2px dashed var(--border-color)', 
                borderRadius: '12px', 
                padding: '32px', 
                textAlign: 'center', 
                cursor: 'pointer',
                background: 'var(--bg-secondary)',
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px'
              }}
              className="hover:bg-white/5 hover:border-primary"
              >
                <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                {aiQuizImage ? (
                  <>
                    <img src={aiQuizImage} alt="Preview" style={{ maxHeight: '200px', borderRadius: '8px', objectFit: 'contain' }} />
                    <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Bấm để chọn ảnh khác</span>
                  </>
                ) : (
                  <>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(197, 154, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Upload size={24} color="var(--primary)" />
                    </div>
                    <div>
                      <strong style={{ display: 'block', marginBottom: '4px' }}>Tải ảnh lên (bắt buộc)</strong>
                      <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Hỗ trợ JPG, PNG, WEBP</span>
                    </div>
                  </>
                )}
              </label>

              <textarea 
                value={aiQuizPrompt}
                onChange={e => setAiQuizPrompt(e.target.value)}
                placeholder="Ví dụ: Hãy trích xuất các câu hỏi từ hình ảnh này..."
                style={{ 
                  width: '100%', 
                  minHeight: '80px', 
                  background: 'var(--bg-secondary)', 
                  color: 'var(--text-main)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '12px', 
                  padding: '16px', 
                  fontSize: '14px', 
                  resize: 'vertical',
                  lineHeight: '1.5'
                }}
              />
            </div>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="btn" onClick={() => setIsCreatingAiQuiz(false)}>Hủy</button>
              <button 
                className="btn btn-primary" 
                onClick={handleGenerateAiQuiz}
                disabled={aiLoading === 'generate_quiz' || (!aiQuizImage && !aiQuizPrompt.trim())}
                style={{ opacity: (aiLoading === 'generate_quiz' || (!aiQuizImage && !aiQuizPrompt.trim())) ? 0.7 : 1 }}
              >
                {aiLoading === 'generate_quiz' ? 'AI đang phân tích...' : '✨ Tạo Đề Ngay'}
              </button>
            </div>
          </div>
        ) : isImporting ? (
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
              <button className="btn btn-primary" onClick={() => {
                if (!isTesting) {
                  // Xóa đáp án cũ khi bắt đầu làm bài mới
                  const newQuestions = activeQuiz.questions.map(q => ({ ...q, userAnswer: null }));
                  setQuizzes(quizzes.map(q => q.id === activeQuizId ? { ...q, questions: newQuestions } : q));
                }
                setIsTesting(!isTesting);
              }}>
                {isTesting ? 'Quay về sửa đề' : <><Play size={16}/> Chế độ Tự Luyện</>}
              </button>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '24px', position: 'relative', overflow: 'hidden' }}>
                <div 
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', opacity: activeQuiz.keyTakeaways ? 1 : 0.8 }}
                  onClick={() => setIsTakeawaysCollapsed(!isTakeawaysCollapsed)}
                >
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--accent-orange)' }}>
                    <Lightbulb size={18} />
                    <h4 style={{ margin: 0, fontWeight: 'bold', fontSize: '15px' }}>Kiến Thức Cốt Lõi (Cheat Sheet)</h4>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    {!isTesting && (
                       <button 
                         onClick={(e) => { e.stopPropagation(); handleGenerateTakeaways(); }}
                         disabled={isGeneratingTakeaways}
                         style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', background: 'var(--primary)', color: 'var(--on-primary)', border: 'none', display: 'flex', gap: '4px', alignItems: 'center', cursor: 'pointer' }}
                       >
                          {isGeneratingTakeaways ? 'Đang tổng hợp...' : <><Sparkles size={12}/> AI Tổng hợp</>}
                       </button>
                    )}
                    {isTakeawaysCollapsed ? <ChevronDown size={16} color="var(--text-muted)" /> : <ChevronUp size={16} color="var(--text-muted)" />}
                  </div>
                </div>
                
                {!isTakeawaysCollapsed && (
                  <div style={{ marginTop: '16px' }}>
                    {!isTesting ? (
                      <textarea 
                        value={activeQuiz.keyTakeaways || ''}
                        onChange={e => setQuizzes(quizzes.map(q => q.id === activeQuizId ? { ...q, keyTakeaways: e.target.value } : q))}
                        placeholder="Ghi chú các điểm ngữ pháp, từ vựng cần lưu ý ở đề này. Hoặc bấm 'AI Tổng hợp' để tự động quét..."
                        style={{ width: '100%', minHeight: '100px', background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', fontSize: '13.5px', resize: 'vertical', lineHeight: '1.6' }}
                      />
                    ) : (
                      <div style={{ 
                          color: 'var(--text-main)', 
                          whiteSpace: 'pre-wrap', 
                          lineHeight: '1.7',
                          background: 'rgba(255,255,255,0.03)',
                          borderRadius: '8px',
                          padding: '16px',
                          border: '1px dashed rgba(255,152,0, 0.3)',
                          fontSize: '14px'
                        }}>
                          {activeQuiz.keyTakeaways ? activeQuiz.keyTakeaways : <span style={{ color: 'var(--text-muted)' }}>Chưa có tổng hợp kiến thức. Bấm Quay về sửa đề để thêm.</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {isTesting && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '12px', width: 'max-content' }}>
                  <button 
                    onClick={() => setTestMode('all')}
                    style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', border: 'none', cursor: 'pointer', background: testMode === 'all' ? 'var(--primary)' : 'transparent', color: testMode === 'all' ? 'var(--on-primary)' : 'var(--text-muted)' }}
                  >
                    Tất cả ({activeQuiz.questions.length})
                  </button>
                  <button 
                    onClick={() => setTestMode('starred')}
                    style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', border: 'none', cursor: 'pointer', background: testMode === 'starred' ? 'var(--primary)' : 'transparent', color: testMode === 'starred' ? 'var(--on-primary)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Star size={14} fill={testMode === 'starred' ? 'currentColor' : 'none'} />
                    Đã đánh dấu ({activeQuiz.questions.filter(q => q.isStarred).length})
                  </button>
                </div>
              )}

              {questionsToRender.length === 0 && isTesting && testMode === 'starred' && (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                  <Star size={40} style={{ opacity: 0.2, margin: '0 auto 16px auto', display: 'block' }} />
                  <p>Bạn chưa đánh dấu câu hỏi nào để ôn tập.</p>
                </div>
              )}

              {questionsToRender.map((q, i) => (
                <div key={q.id} className="glass-panel" style={{ padding: '20px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div style={{ fontWeight: '500', fontSize: '16px', flex: 1 }}>
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
                    <button 
                      onClick={() => handleToggleBookmark(q.id)}
                      title={q.isStarred ? "Bỏ đánh dấu" : "Đánh dấu câu hỏi này"}
                      style={{ 
                        padding: '8px', 
                        background: q.isStarred ? 'rgba(251, 191, 36, 0.1)' : 'transparent', 
                        border: 'none', 
                        cursor: 'pointer', 
                        color: q.isStarred ? '#fbbf24' : 'var(--text-muted)',
                        borderRadius: '8px',
                        marginLeft: '16px',
                        transition: 'all 0.2s',
                        display: 'flex'
                      }}
                      className="hover:scale-110 active:scale-95 hover:bg-white/5"
                    >
                      <Star size={20} fill={q.isStarred ? '#fbbf24' : 'none'} color={q.isStarred ? '#fbbf24' : 'currentColor'} />
                    </button>
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
                  onClick={() => setIsCreatingAiQuiz(true)}
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
