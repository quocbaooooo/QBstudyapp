import { useState, useRef, useCallback, useEffect } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Key, Sparkles, Upload, Play, CheckCircle, XCircle, Trash2, Star, Lightbulb, ChevronDown, ChevronUp, X, Image as ImageIcon, FileText, Zap, ArrowLeft, Clock, BookOpen, MoreVertical, Languages } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { exportQuizToWord } from '../utils/exportWord';

export default function QuizzesView() {
  const [quizzes, setQuizzes] = useLocalStorage('study_quizzes', []);
  const [apiKey] = useLocalStorage('gemini_api_key', '');
  const [apiModel] = useLocalStorage('gemini_api_model', 'gemini-1.5-flash-latest');
  
  const [aiProvider] = useLocalStorage('ai_provider', 'gemini');
  const [openaiKey] = useLocalStorage('openai_api_key', '');
  const [openaiModel] = useLocalStorage('openai_api_model', 'gpt-4o-mini');
  const [appSoundEnabled] = useLocalStorage('app_sound_enabled', true);

  const [activeQuizId, setActiveQuizId] = useState(null);
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState('normal'); // 'normal' | 'reading'
  const [isImporting, setIsImporting] = useState(false);
  const [previewQuestions, setPreviewQuestions] = useState(null);
  const [previewReadingPassage, setPreviewReadingPassage] = useState(null); // { id, title, content, blankNumbers }
  const [importTargetQuizId, setImportTargetQuizId] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testMode, setTestMode] = useState('all'); // 'all' or 'starred'
  const [selectedReadingQuestionId, setSelectedReadingQuestionId] = useState(null);
  const [aiLoading, setAiLoading] = useState(null);
  const [isTakeawaysCollapsed, setIsTakeawaysCollapsed] = useState(false);
  const [isGeneratingTakeaways, setIsGeneratingTakeaways] = useState(false);

  const [isCreatingAiQuiz, setIsCreatingAiQuiz] = useState(false);
  const [aiQuizImages, setAiQuizImages] = useState([]);
  const [aiQuizPrompt, setAiQuizPrompt] = useState('');
  const [numQuestions, setNumQuestions] = useState(10);
  const [isDragging, setIsDragging] = useState(false);
  const [aiProgress, setAiProgress] = useState('');
  const fileInputRef = useRef(null);

  // Translation popup state
  const [translationPopup, setTranslationPopup] = useState(null); // { x, y, text, questionId, field, selStart, selEnd }
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const translationTimeoutRef = useRef(null);

  const activeQuiz = quizzes.find(q => q.id === activeQuizId);

  // ===== HELPERS: Render text with / separator and () hiding =====

  // Renders text: hides content after / and content in () during test mode
  // showHidden = true means show everything (answer revealed or edit mode)
  const renderQuizText = (text, showHidden = false) => {
    if (!text) return text;

    // Split by / — first part is visible, rest is explanation
    const slashIdx = text.indexOf('/');
    let visiblePart = slashIdx !== -1 ? text.substring(0, slashIdx).trimEnd() : text;
    const hiddenPart = slashIdx !== -1 ? text.substring(slashIdx + 1).trimStart() : '';

    // In visible part, hide content in () unless showHidden
    const renderWithParens = (str) => {
      if (showHidden) return str;
      // Remove (translation text) patterns — but keep content that was there originally
      return str.replace(/\s*\([^)]*\)/g, '');
    };

    const cleanVisible = renderWithParens(visiblePart);

    if (showHidden && hiddenPart) {
      return (
        <>
          {visiblePart}
          <span style={{ color: 'var(--accent-orange)', fontStyle: 'italic', opacity: 0.85 }}> / {hiddenPart}</span>
        </>
      );
    }

    return cleanVisible;
  };

  // Translation handler — works for both regular text (test mode) and input/textarea (edit mode)
  const handleTextSelection = useCallback((e, questionId, field) => {
    if (translationTimeoutRef.current) clearTimeout(translationTimeoutRef.current);
    translationTimeoutRef.current = setTimeout(() => {
      let selectedText = '';
      let popupX = 0, popupY = 0;

      const target = e.target;
      const isFormElement = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT';

      if (isFormElement) {
        // For textarea/input: use selectionStart/selectionEnd
        const start = target.selectionStart;
        const end = target.selectionEnd;
        if (start !== end) {
          selectedText = target.value.substring(start, end).trim();
          const rect = target.getBoundingClientRect();
          // Approximate popup position near the input
          popupX = rect.left + rect.width / 2;
          popupY = rect.top - 4;
        }
      } else {
        // For regular text: use window.getSelection()
        const selection = window.getSelection();
        selectedText = selection?.toString()?.trim() || '';
        if (selectedText && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          popupX = rect.left + rect.width / 2;
          popupY = rect.top - 10;
        }
      }

      if (selectedText && selectedText.length > 0 && selectedText.length < 200) {
        setTranslationPopup({
          x: popupX,
          y: popupY,
          text: selectedText,
          questionId,
          field,
        });
        setTranslatedText('');
      }
    }, 250);
  }, []);

  // Handle delete question
  const handleDeleteQuestion = (qId) => {
    if (!activeQuiz) return;

    const questionToDelete = activeQuiz.questions.find(q => q.id === qId);
    const deletedReadingGroupId = questionToDelete?.readingGroupId || null;

    const newQuestions = activeQuiz.questions.filter(q => q.id !== qId);

    let newReadingPassages = activeQuiz.readingPassages || [];
    if (deletedReadingGroupId) {
      const groupStillHasQuestion = newQuestions.some(q => q.readingGroupId === deletedReadingGroupId);
      if (!groupStillHasQuestion) {
        // User approved rule 2.B: auto-remove passage block if its questions become empty.
        newReadingPassages = newReadingPassages.filter(p => p.id !== deletedReadingGroupId);
      }
    }

    setQuizzes(
      quizzes.map(q => q.id === activeQuizId
        ? { ...q, questions: newQuestions, readingPassages: newReadingPassages, updatedAt: Date.now() }
        : q
      )
    );

    if (selectedReadingQuestionId === qId) {
      setSelectedReadingQuestionId(null);
    }
  };

  // Close translation popup on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (translationPopup && !e.target.closest('.translation-popup')) {
        setTranslationPopup(null);
        setTranslatedText('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [translationPopup]);

  // Translate text using free MyMemory API (no API key needed, 0 cost)
  const translateText = async (text) => {
    setIsTranslating(true);
    try {
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|vi`);
      const data = await res.json();
      if (data.responseStatus !== 200) throw new Error(data.responseDetails || 'Lỗi dịch');
      let translated = data.responseData.translatedText || '';
      // MyMemory sometimes returns ALL CAPS — fix that
      if (translated === translated.toUpperCase() && translated.length > 3) {
        translated = translated.charAt(0).toUpperCase() + translated.slice(1).toLowerCase();
      }
      setTranslatedText(translated);
    } catch (err) {
      setTranslatedText('Lỗi dịch: ' + err.message);
    } finally {
      setIsTranslating(false);
    }
  };

  // Insert translation as (text) into the question/option
  const handleInsertTranslation = () => {
    if (!translationPopup || !translatedText) return;
    const { questionId, field, text } = translationPopup;

    // Find the question
    const q = activeQuiz?.questions.find(x => x.id === questionId);
    if (!q) return;

    // Determine which field to modify
    let originalText = '';
    if (field === 'question') {
      originalText = q.question;
    } else if (field.startsWith('option_')) {
      const optKey = field.replace('option_', '');
      originalText = q.options[optKey];
    } else {
      return;
    }

    // Find the selected text and insert (translation) after it
    const insertionIdx = originalText.indexOf(text);
    if (insertionIdx === -1) return;

    const afterIdx = insertionIdx + text.length;
    const newText = originalText.substring(0, afterIdx) + ` (${translatedText})` + originalText.substring(afterIdx);

    if (field === 'question') {
      handleUpdateQuestionProp(questionId, 'question', newText);
    } else if (field.startsWith('option_')) {
      const optKey = field.replace('option_', '');
      handleUpdateOptionProp(questionId, optKey, newText);
    }

    setTranslationPopup(null);
    setTranslatedText('');
  };

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
    if (importMode === 'reading') {
      const parsedReading = parseReadingQuizText(importText);
      if (parsedReading && parsedReading.questions.length > 0) {
        setPreviewQuestions(parsedReading.questions);
        setPreviewReadingPassage(parsedReading.passage);
      } else {
        alert('Không tìm thấy dữ liệu READING hợp lệ. Hãy nhập 1 block passage và các câu hỏi có đủ A/B/C/D.');
      }
      return;
    }

    const questions = parseQuizText(importText);
    if (questions.length > 0) {
      setPreviewQuestions(questions);
      setPreviewReadingPassage(null);
    } else {
      alert('Không tìm thấy câu trắc nghiệm hợp lệ. Đảm bảo mỗi câu có đủ 4 đáp án A. B. C. D.');
    }
  };

  const handleConfirmImport = () => {
    if (!previewQuestions || previewQuestions.length === 0) return;

    const isReadingImport = importMode === 'reading';

    if (importTargetQuizId) {
      // Import into currently opened quiz
      const newQuizzes = quizzes.map(q => {
        if (q.id !== importTargetQuizId) return q;

        if (isReadingImport) {
          // User approved rule 1: always create a NEW reading block for each reading import
          return {
            ...q,
            questions: [...q.questions, ...previewQuestions],
            readingPassages: [...(q.readingPassages || []), ...(previewReadingPassage ? [previewReadingPassage] : [])],
            updatedAt: Date.now(),
          };
        }

        return {
          ...q,
          questions: [...q.questions, ...previewQuestions],
          updatedAt: Date.now(),
        };
      });

      setQuizzes(newQuizzes);
      setActiveQuizId(importTargetQuizId);
      if (isReadingImport && previewQuestions[0]?.id) {
        setSelectedReadingQuestionId(previewQuestions[0].id);
      }
    } else {
      // Import from grid: create new quiz
      const quizTitle = isReadingImport
        ? `Đề READING (${previewQuestions.length} câu)`
        : `Đề import (${previewQuestions.length} câu)`;

      const newQuiz = {
        id: uuidv4(),
        title: quizTitle,
        questions: previewQuestions,
        readingPassages: isReadingImport && previewReadingPassage ? [previewReadingPassage] : [],
        updatedAt: Date.now(),
      };
      setQuizzes([newQuiz, ...quizzes]);
      setActiveQuizId(newQuiz.id);
      if (isReadingImport && previewQuestions[0]?.id) {
        setSelectedReadingQuestionId(previewQuestions[0].id);
      }
    }
    
    // Reset import states
    setIsImporting(false);
    setPreviewQuestions(null);
    setPreviewReadingPassage(null);
    setImportTargetQuizId(null);
    setImportText('');
    setImportMode('normal');
  };

  const getBlankNumbersFromPassage = (text = '') => {
    if (!text) return [];
    const numberSet = new Set();

    const inParens = text.match(/\((\d{3})\)/g) || [];
    inParens.forEach(token => {
      const m = token.match(/\d{3}/);
      if (m) numberSet.add(m[0]);
    });

    const standalone = text.match(/\b\d{3}\b/g) || [];
    standalone.forEach(num => numberSet.add(num));

    return Array.from(numberSet);
  };

  const renderPassageWithBlankHighlights = (passage = '', activeBlankNumber = null) => {
    if (!passage) return null;
    const parts = passage.split(/(\(\d{3}\)|\b\d{3}\b)/g);

    return parts.map((part, idx) => {
      const numberMatch = part.match(/^\((\d{3})\)$/) || part.match(/^(\d{3})$/);
      if (!numberMatch) return <span key={`p-${idx}`}>{part}</span>;

      const blankNumber = numberMatch[1];
      const isActive = !!activeBlankNumber && String(activeBlankNumber) === String(blankNumber);

      return (
        <span
          key={`p-${idx}`}
          style={{
            display: 'inline-block',
            padding: '0 4px',
            margin: '0 1px',
            borderRadius: '6px',
            fontWeight: 700,
            color: isActive ? '#001018' : '#8eefff',
            background: isActive ? 'linear-gradient(135deg, #67e8f9, #22d3ee)' : 'rgba(6,182,212,0.22)',
            boxShadow: isActive ? '0 0 0 1px rgba(103,232,249,0.45), 0 6px 18px rgba(34,211,238,0.25)' : 'none',
            transition: 'all 0.2s ease',
          }}
        >
          {part}
        </span>
      );
    });
  };

  const getReadingPreviewData = (questions = [], quiz = null) => {
    if (!questions.length) return { isReading: false, passage: '', questions: [], groupId: null };

    const allHaveGroup = questions.every(q => !!q.readingGroupId);
    if (allHaveGroup && quiz?.readingPassages?.length) {
      const groupId = questions[0].readingGroupId;
      const sameGroup = questions.every(q => q.readingGroupId === groupId);
      const passageObj = quiz.readingPassages.find(p => p.id === groupId);
      if (sameGroup && passageObj) {
        return {
          isReading: true,
          passage: passageObj.content || '',
          questions,
          groupId,
          passageTitle: passageObj.title || '',
          blankNumbers: passageObj.blankNumbers || getBlankNumbersFromPassage(passageObj.content || ''),
        };
      }
    }

    // Backward compatibility: old format embeds passage in question string
    const readingPrefix = '[READING]\n';
    const allReading = questions.every(q => typeof q.question === 'string' && q.question.startsWith(readingPrefix));
    if (!allReading) return { isReading: false, passage: '', questions, groupId: null };

    const transformed = questions.map(q => {
      const raw = q.question.slice(readingPrefix.length);
      const splitIdx = raw.indexOf('\n\n');
      if (splitIdx === -1) {
        return { ...q, _passage: '', _questionOnly: raw.trim(), blankNumber: q.blankNumber || '' };
      }
      const passage = raw.slice(0, splitIdx).trim();
      const questionOnly = raw.slice(splitIdx + 2).trim();
      const blankMatch = questionOnly.match(/^\s*(?:Câu|Question|Q)?\s*(\d{1,4})\s*[):.]?/i);
      return {
        ...q,
        _passage: passage,
        _questionOnly: questionOnly,
        blankNumber: q.blankNumber || (blankMatch ? blankMatch[1] : ''),
      };
    });

    const passage = transformed[0]?._passage || '';
    return {
      isReading: true,
      passage,
      questions: transformed,
      groupId: null,
      passageTitle: '',
      blankNumbers: getBlankNumbersFromPassage(passage),
    };
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
    const answerRe = /^\s*(?:Đáp án|Answer|Đáp Án)\s*[:.]\s*([A-D])/i;
    const explainRe = /^\s*(?:Giải thích|Explanation|Giải Thích)\s*[:.]\s*(.*)/i;

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

  /**
   * READING parser: 1 passage block + many mapped questions.
   * Output:
   * {
   *   passage: { id, title, content, blankNumbers[] },
   *   questions: [{...mcq, blankNumber, readingGroupId }]
   * }
   */
  function parseReadingQuizText(text) {
    if (!text || !text.trim()) return null;

    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    const questionStartRe = /^\s*(?:Câu|Question|Q)?\s*\d+\s*[):.]/i;

    let firstQuestionLineIdx = lines.findIndex(line => questionStartRe.test(line.trim()));
    if (firstQuestionLineIdx === -1) return null;

    const passageRaw = lines.slice(0, firstQuestionLineIdx).join('\n').trim();
    const questionsRaw = lines.slice(firstQuestionLineIdx).join('\n').trim();
    if (!passageRaw || !questionsRaw) return null;

    const cleanedPassage = passageRaw
      .replace(/^\s*(?:READING|PASSAGE|ĐOẠN\s*VĂN)\s*[:-]?\s*/i, '')
      .trim();

    const passageLines = cleanedPassage.split('\n').map(s => s.trim()).filter(Boolean);
    const passageTitle = passageLines[0] || 'Reading Passage';

    // Flexible mapping rule (B): capture both (135) and standalone 135-like numbers.
    const passageBlankNumbers = getBlankNumbersFromPassage(cleanedPassage);

    // Capture question header numbers in order.
    const questionHeaderNumbers = [];
    const qHeaderRegex = /^\s*(?:Câu|Question|Q)?\s*(\d{1,4})\s*[):.]/gmi;
    let m;
    while ((m = qHeaderRegex.exec(questionsRaw)) !== null) {
      questionHeaderNumbers.push(m[1]);
    }

    const parsedQuestions = parseQuizText(questionsRaw);
    if (parsedQuestions.length === 0) return null;

    const readingGroupId = uuidv4();
    const mappedQuestions = parsedQuestions.map((item, idx) => {
      const questionNumber = questionHeaderNumbers[idx] || '';
      const blankFromQuestionText = item.question.match(/^\s*(?:Câu|Question|Q)?\s*(\d{1,4})\s*[):.]?/i)?.[1] || '';
      const blankNumber = questionNumber || blankFromQuestionText || '';

      return {
        ...item,
        question: item.question,
        readingGroupId,
        blankNumber,
      };
    });

    const effectiveBlankNumbers = passageBlankNumbers.length > 0
      ? passageBlankNumbers
      : Array.from(new Set(mappedQuestions.map(q => String(q.blankNumber || '')).filter(Boolean)));

    return {
      passage: {
        id: readingGroupId,
        title: passageTitle,
        content: cleanedPassage,
        blankNumbers: effectiveBlankNumbers,
      },
      questions: mappedQuestions,
    };
  }

  const processFiles = useCallback((files) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    
    // Limit to 5 images total
    const remaining = 5 - aiQuizImages.length;
    const toProcess = imageFiles.slice(0, remaining);
    if (toProcess.length === 0) {
      alert('Tối đa 5 hình ảnh. Hãy xóa bớt ảnh trước khi thêm.');
      return;
    }

    toProcess.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAiQuizImages(prev => [...prev, { id: uuidv4(), data: reader.result, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });
  }, [aiQuizImages.length]);

  const handleImageUpload = (e) => {
    processFiles(e.target.files);
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveImage = (imageId) => {
    setAiQuizImages(prev => prev.filter(img => img.id !== imageId));
  };

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handleGenerateAiQuiz = async () => {
    const activeApiKey = aiProvider === 'gemini' ? apiKey : openaiKey;
    if (!activeApiKey) {
      alert(`Vui lòng nhập API Key cho ${aiProvider === 'gemini' ? 'Gemini' : 'OpenAI'} trong Cài đặt.`);
      return;
    }

    if (aiQuizImages.length === 0 && !aiQuizPrompt.trim()) {
      alert('Vui lòng tải lên hình ảnh hoặc nhập yêu cầu.');
      return;
    }

    setAiLoading('generate_quiz');
    setAiProgress('Đang chuẩn bị dữ liệu...');
    try {
      const hasImages = aiQuizImages.length > 0;
      const imageContext = hasImages 
        ? `Tôi đã tải lên ${aiQuizImages.length} hình ảnh. Hãy phân tích TẤT CẢ hình ảnh.` 
        : '';
      const userPrompt = aiQuizPrompt.trim() || (hasImages
        ? 'Hãy trích xuất hoặc tạo các câu hỏi trắc nghiệm từ nội dung trong các hình ảnh này.'
        : 'Hãy tạo các câu hỏi trắc nghiệm.');

      let promptText = `${imageContext}\n${userPrompt}\n\nYÊU CẦU: Tạo chính xác ${numQuestions} câu hỏi trắc nghiệm.

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

      setAiProgress('Đang gửi yêu cầu đến AI...');
      let textRes = '';

      if (aiProvider === 'gemini') {
        const parts = [{ text: promptText }];
        
        if (hasImages) {
          aiQuizImages.forEach(img => {
            const mimeType = img.data.split(';')[0].split(':')[1];
            const base64Data = img.data.split(',')[1];
            parts.push({
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            });
          });
        }

        setAiProgress('AI đang phân tích nội dung...');
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            generationConfig: {
              maxOutputTokens: 4096,
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
        if (hasImages) {
          aiQuizImages.forEach(img => {
            content.push({
              type: 'image_url',
              image_url: { url: img.data, detail: 'high' }
            });
          });
        }

        setAiProgress('AI đang phân tích nội dung...');
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`
          },
          body: JSON.stringify({
            model: openaiModel,
            max_tokens: 4096,
            temperature: 0.4,
            messages: [{ role: 'user', content: content }]
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        textRes = data.choices[0].message.content;
      }

      setAiProgress('Đang trích xuất câu hỏi...');
      // Cleanup formatting
      textRes = textRes.replace(/```[a-z]*\n/gi, '').replace(/```/g, '').trim();

      const questions = parseQuizText(textRes);

      if (questions.length > 0) {
        const newQuiz = { id: uuidv4(), title: `Đề AI tạo (${questions.length} câu)`, questions, updatedAt: Date.now() };
        setQuizzes([newQuiz, ...quizzes]);
        setActiveQuizId(newQuiz.id);
        setIsCreatingAiQuiz(false);
        setAiQuizImages([]);
        setAiQuizPrompt('');
      } else {
        alert('AI không trả về được câu hỏi định dạng đúng. Hãy thử lại.\n\nPhản hồi thô:\n' + textRes.substring(0, 500));
      }

    } catch (err) {
      alert('Lỗi khi gọi AI: ' + err.message);
    } finally {
      setAiLoading(null);
      setAiProgress('');
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

  const playFeedbackSound = (isCorrect) => {
    if (!appSoundEnabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      const now = ctx.currentTime;
      if (isCorrect) {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
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
      console.log('Audio disabled or interupted');
    }
  };

  const handleSelectAnswer = (qId, optionKey) => {
    const q = activeQuiz.questions.find(x => x.id === qId);
    if (q) {
      const isCorrect = optionKey === q.answer;
      playFeedbackSound(isCorrect);
    }

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

  const readingTestData = activeQuiz
    ? getReadingPreviewData(questionsToRender, activeQuiz)
    : { isReading: false, passage: '', questions: questionsToRender, groupId: null, blankNumbers: [] };

  const questionsForDisplay = readingTestData.isReading
    ? readingTestData.questions
    : questionsToRender;

  // Helper: relative time
  const getRelativeTime = (timestamp) => {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} ngày trước`;
    return new Date(timestamp).toLocaleDateString('vi-VN');
  };

  // Color gradient palette for cards
  const cardGradients = [
    'linear-gradient(135deg, rgba(124,77,255,0.18), rgba(83,109,254,0.10))',
    'linear-gradient(135deg, rgba(0,227,253,0.15), rgba(59,130,246,0.10))',
    'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(52,211,153,0.10))',
    'linear-gradient(135deg, rgba(251,191,36,0.15), rgba(245,158,11,0.10))',
    'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(244,114,182,0.10))',
    'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(139,92,246,0.10))',
  ];

  const cardAccentColors = [
    '#7c4dff', '#00e3fd', '#10b981', '#fbbf24', '#f472b6', '#a855f7'
  ];

  const showGrid = !activeQuizId && !isCreatingAiQuiz && !isImporting;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {showGrid ? (
        /* ========== GRID VIEW ========== */
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          {/* Grid Header */}
          <div style={{ 
            padding: '0 0 20px 0', 
            display: 'flex', 
            flexDirection: 'column',
            gap: '16px',
            flexShrink: 0 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ 
                  fontSize: '24px', 
                  fontWeight: 800, 
                  margin: 0,
                  background: 'linear-gradient(135deg, #c59aff, #00e3fd)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}>
                  Bộ đề trắc nghiệm
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                  {quizzes.length} bộ đề · Chọn một bộ đề để bắt đầu ôn tập
                </p>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={handleCreateEmptyQuiz}
                  style={{
                    padding: '9px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                    border: '1px solid rgba(var(--glass-rgb),0.1)', cursor: 'pointer',
                    background: 'rgba(var(--glass-rgb),0.04)', color: 'var(--text-main)',
                    display: 'flex', alignItems: 'center', gap: '6px',
                    transition: 'all 0.2s'
                  }}
                >
                  <PlusIcon /> Tạo đề trống
                </button>
                <button
                  onClick={() => { setIsImporting(true); setImportTargetQuizId(null); setIsCreatingAiQuiz(false); setActiveQuizId(null); }}
                  style={{
                    padding: '9px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                    border: '1px solid rgba(var(--glass-rgb),0.1)', cursor: 'pointer',
                    background: 'rgba(var(--glass-rgb),0.04)', color: 'var(--text-main)',
                    display: 'flex', alignItems: 'center', gap: '6px',
                    transition: 'all 0.2s'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>description</span>
                  Nhập từ Word
                </button>
                <button
                  onClick={() => { setIsCreatingAiQuiz(true); setIsImporting(false); setActiveQuizId(null); }}
                  style={{
                    padding: '9px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                    border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(135deg, #7c4dff, #536dfe)', color: 'white',
                    display: 'flex', alignItems: 'center', gap: '6px',
                    transition: 'all 0.2s',
                    boxShadow: '0 4px 20px rgba(124,77,255,0.35)'
                  }}
                >
                  <Zap size={15} fill="white" /> Tạo đề bằng AI
                </button>
              </div>
            </div>
          </div>

          {/* Grid Body */}
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '20px' }}>
            {quizzes.length === 0 ? (
              <div style={{ 
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                height: '100%', textAlign: 'center', color: 'var(--text-muted)', gap: '16px', padding: '40px'
              }}>
                <div style={{
                  width: '72px', height: '72px', borderRadius: '20px',
                  background: 'linear-gradient(135deg, rgba(124,77,255,0.12), rgba(0,227,253,0.08))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid rgba(124,77,255,0.2)'
                }}>
                  <BookOpen size={32} color="var(--primary)" style={{ opacity: 0.7 }} />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)' }}>Chưa có bộ đề nào</h3>
                <p style={{ fontSize: '14px', maxWidth: '360px', lineHeight: '1.6' }}>
                  Tạo đề bằng AI, nhập từ Word, hoặc tạo đề trống để bắt đầu ôn luyện.
                </p>
              </div>
            ) : (
              <div className="quiz-grid">
                {quizzes.map((quiz, index) => {
                  const gradientIdx = index % cardGradients.length;
                  const starredCount = quiz.questions.filter(q => q.isStarred).length;
                  const answeredCount = quiz.questions.filter(q => q.userAnswer).length;
                  const hasAnswers = quiz.questions.some(q => q.answer);

                  return (
                    <div
                      key={quiz.id}
                      className="quiz-card"
                      onClick={() => { setActiveQuizId(quiz.id); setIsTesting(false); setIsImporting(false); setIsCreatingAiQuiz(false); setTestMode('all'); }}
                      style={{ background: cardGradients[gradientIdx] }}
                    >
                      <div className="quiz-card-accent" style={{ background: cardAccentColors[gradientIdx] }} />
                      <button
                        className="quiz-card-delete"
                        onClick={(e) => handleDeleteQuiz(e, quiz.id)}
                        title="Xóa bộ đề"
                      >
                        <Trash2 size={14} />
                      </button>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <h3 className="quiz-card-title">{quiz.title}</h3>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          <div className="quiz-card-stat">
                            <BookOpen size={13} />
                            <span>{quiz.questions.length} câu hỏi</span>
                          </div>
                          {starredCount > 0 && (
                            <div className="quiz-card-stat" style={{ color: '#fbbf24' }}>
                              <Star size={13} fill="#fbbf24" />
                              <span>{starredCount} đánh dấu</span>
                            </div>
                          )}
                          {hasAnswers && (
                            <div className="quiz-card-stat" style={{ color: 'var(--accent-green)' }}>
                              <CheckCircle size={13} />
                              <span>Có đáp án</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="quiz-card-footer">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <Clock size={11} />
                          {getRelativeTime(quiz.updatedAt)}
                        </div>
                        {quiz.questions.length > 0 && (
                          <div className="quiz-card-progress">
                            <div 
                              className="quiz-card-progress-bar" 
                              style={{ 
                                width: `${(answeredCount / quiz.questions.length) * 100}%`,
                                background: cardAccentColors[gradientIdx]
                              }} 
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ========== DETAIL / EDITOR VIEW ========== */
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          {/* Detail View Top bar */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            marginBottom: '16px', 
            flexShrink: 0,
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
              <button
                onClick={() => { 
                  if (isImporting && importTargetQuizId) {
                    setIsImporting(false); 
                    setPreviewQuestions(null); 
                    setImportTargetQuizId(null);
                  } else {
                    setActiveQuizId(null); 
                    setIsCreatingAiQuiz(false); 
                    setIsImporting(false); 
                    setPreviewQuestions(null); 
                    setImportTargetQuizId(null);
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                  background: 'rgba(var(--glass-rgb),0.05)', border: '1px solid rgba(var(--glass-rgb),0.1)',
                  color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s',
                  flexShrink: 0
                }}
              >
                <ArrowLeft size={16} />
                <span style={{ whiteSpace: 'nowrap' }}>{isImporting && importTargetQuizId ? 'Quay lại' : 'Bộ đề'}</span>
              </button>

              {activeQuiz && (
                <input 
                  type="text" value={activeQuiz.title} 
                  onChange={(e) => setQuizzes(quizzes.map(q => q.id === activeQuizId ? { ...q, title: e.target.value } : q))}
                  style={{ 
                    fontSize: '22px', fontWeight: 800, border: 'none', background: 'transparent', 
                    padding: '0', boxShadow: 'none', color: 'var(--text-main)', width: '100%', outline: 'none',
                    overflow: 'hidden', textOverflow: 'ellipsis'
                  }}
                />
              )}
              {isCreatingAiQuiz && <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, whiteSpace: 'nowrap' }}>Tạo đề bằng AI</h2>}
              {isImporting && !importTargetQuizId && <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, whiteSpace: 'nowrap' }}>Nhập đề Word</h2>}
            </div>

            {activeQuiz && (
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0, whiteSpace: 'nowrap' }}>
                <button 
                  className="btn" 
                  style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }} 
                  onClick={() => exportQuizToWord(activeQuiz)}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>download</span> Xuất Word
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={() => {
                    if (!isTesting) {
                      const newQuestions = activeQuiz.questions.map(q => ({ ...q, userAnswer: null }));
                      setQuizzes(quizzes.map(q => q.id === activeQuizId ? { ...q, questions: newQuestions } : q));
                    }
                    setIsTesting(!isTesting);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '13px' }}
                >
                  {isTesting ? 'Sửa đề' : <><Play size={16}/> Tự Luyện</>}
                </button>
              </div>
            )}
          </div>


          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {isCreatingAiQuiz ? (
              <div className="glass-panel" style={{ padding: '28px', flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <div style={{ 
                    width: '44px', height: '44px', borderRadius: '14px', 
                    background: 'linear-gradient(135deg, rgba(124,77,255,0.2), rgba(0,227,253,0.15))', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid rgba(124,77,255,0.3)'
                  }}>
                    <Zap size={22} color="var(--primary)" fill="var(--primary)" style={{ opacity: 0.9 }} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>Tạo đề bằng AI</h3>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px' }}>
                      Tải ảnh tài liệu hoặc nhập mô tả để tạo đề tự động
                    </p>
                  </div>
                </div>

                {aiLoading === 'generate_quiz' && (
                  <div style={{
                    position: 'absolute', inset: 0, zIndex: 50,
                    background: 'rgba(6,14,32,0.85)', backdropFilter: 'blur(8px)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    borderRadius: '16px', gap: '20px'
                  }}>
                    <div style={{
                      width: '56px', height: '56px', borderRadius: '50%',
                      border: '3px solid rgba(124,77,255,0.2)',
                      borderTop: '3px solid var(--primary)',
                      animation: 'spin 1s linear infinite'
                    }} />
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: 'white', fontWeight: 600, fontSize: '16px', marginBottom: '6px' }}>AI đang xử lý...</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '13px', animation: 'pulse 2s ease-in-out infinite' }}>
                        {aiProgress || 'Vui lòng chờ trong giây lát'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                      {[0,1,2].map(i => (
                        <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)', animation: `bounce 1.4s ease-in-out ${i * 0.2}s infinite` }} />
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '20px', position: 'relative' }}>
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{ 
                      border: `2px dashed ${isDragging ? 'var(--primary)' : 'rgba(var(--glass-rgb),0.12)'}`, 
                      borderRadius: '16px', 
                      padding: aiQuizImages.length > 0 ? '16px' : '36px', 
                      textAlign: 'center', cursor: 'pointer',
                      background: isDragging ? 'rgba(124,77,255,0.08)' : 'rgba(var(--glass-rgb),0.02)',
                      transition: 'all 0.3s ease',
                      transform: isDragging ? 'scale(1.01)' : 'scale(1)'
                    }}
                  >
                    <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} style={{ display: 'none' }} />
                    {aiQuizImages.length > 0 ? (
                      <div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                          {aiQuizImages.map((img, idx) => (
                            <div key={img.id} style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(var(--glass-rgb),0.1)', aspectRatio: '4/3', background: 'rgba(0,0,0,0.3)' }}>
                              <img src={img.data} alt={`Ảnh ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              <button onClick={(e) => { e.stopPropagation(); handleRemoveImage(img.id); }} style={{ position: 'absolute', top: '6px', right: '6px', width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <X size={14} />
                              </button>
                              <div style={{ position: 'absolute', bottom: '6px', left: '6px', background: 'rgba(0,0,0,0.7)', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', color: 'white', fontWeight: 600 }}>
                                {idx + 1}/{aiQuizImages.length}
                              </div>
                            </div>
                          ))}
                          {aiQuizImages.length < 5 && (
                            <div style={{ borderRadius: '10px', border: '2px dashed rgba(var(--glass-rgb),0.1)', aspectRatio: '4/3', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' }}>
                              <Upload size={18} color="var(--text-muted)" />
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Thêm ảnh</span>
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          <ImageIcon size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                          {aiQuizImages.length}/5 ảnh · Bấm hoặc kéo thả để thêm
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ width: '56px', height: '56px', borderRadius: '50%', margin: '0 auto', background: 'linear-gradient(135deg, rgba(124,77,255,0.15), rgba(0,227,253,0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
                          <Upload size={26} color="var(--primary)" />
                        </div>
                        <div>
                          <strong style={{ display: 'block', marginBottom: '6px', fontSize: '15px' }}>
                            {isDragging ? '📥 Thả ảnh vào đây!' : 'Kéo thả hoặc bấm để tải ảnh'}
                          </strong>
                          <span style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                            Hỗ trợ JPG, PNG, WEBP · Tối đa 5 ảnh<br />
                            <span style={{ fontSize: '12px', opacity: 0.7 }}>Ảnh sách giáo khoa, đề thi, ghi chú tay...</span>
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(var(--glass-rgb),0.08)' }} />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>hoặc kết hợp với</span>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(var(--glass-rgb),0.08)' }} />
                  </div>

                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
                      <FileText size={14} /> Yêu cầu tùy chỉnh (tùy chọn)
                    </label>
                    <textarea 
                      value={aiQuizPrompt} onChange={e => setAiQuizPrompt(e.target.value)}
                      placeholder="Ví dụ: Tạo 10 câu hỏi về chương 5 - Ngữ pháp tiếng Anh, trích xuất từ ảnh..."
                      style={{ width: '100%', minHeight: '80px', background: 'rgba(var(--glass-rgb),0.03)', color: 'var(--text-main)', border: '1px solid rgba(var(--glass-rgb),0.1)', borderRadius: '12px', padding: '14px 16px', fontSize: '14px', resize: 'vertical', lineHeight: '1.5' }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(var(--glass-rgb),0.03)', border: '1px solid rgba(var(--glass-rgb),0.08)', borderRadius: '12px', padding: '14px 18px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600 }}>Số lượng câu hỏi</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>AI sẽ tạo khoảng {numQuestions} câu</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {[5, 10, 15, 20, 30].map(n => (
                        <button key={n} onClick={() => setNumQuestions(n)}
                          style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.2s', background: numQuestions === n ? 'var(--primary)' : 'rgba(var(--glass-rgb),0.06)', color: numQuestions === n ? 'var(--on-primary)' : 'var(--text-muted)' }}
                        >{n}</button>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', paddingTop: '20px', borderTop: '1px solid rgba(var(--glass-rgb),0.06)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {aiQuizImages.length > 0 && `${aiQuizImages.length} ảnh đã chọn`}
                    {aiQuizImages.length > 0 && aiQuizPrompt.trim() && ' · '}
                    {aiQuizPrompt.trim() && 'Có yêu cầu tùy chỉnh'}
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn" onClick={() => { setIsCreatingAiQuiz(false); setAiQuizImages([]); setAiQuizPrompt(''); }}>Hủy</button>
                    <button 
                      className="btn btn-primary" onClick={handleGenerateAiQuiz}
                      disabled={aiLoading === 'generate_quiz' || (aiQuizImages.length === 0 && !aiQuizPrompt.trim())}
                      style={{ opacity: (aiLoading === 'generate_quiz' || (aiQuizImages.length === 0 && !aiQuizPrompt.trim())) ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', fontSize: '14px', fontWeight: 700, background: 'linear-gradient(135deg, #7c4dff, #536dfe)', boxShadow: '0 4px 20px rgba(124,77,255,0.4)' }}
                    >
                      <Sparkles size={16} /> Tạo Đề Ngay
                    </button>
                  </div>
                </div>
              </div>
            ) : isImporting ? (
              <div className="glass-panel" style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                {previewQuestions ? (
                  <>
                    <h3>Xem Trước ({previewQuestions.length} câu)</h3>
                    <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(var(--glass-rgb),0.02)', borderRadius: '8px', padding: '16px', border: '1px solid rgba(var(--glass-rgb),0.06)', marginTop: '16px' }}>
                      {(() => {
                        const readingPreview = importMode === 'reading' && previewReadingPassage
                          ? {
                              isReading: true,
                              passage: previewReadingPassage.content || '',
                              questions: previewQuestions,
                              blankNumbers: previewReadingPassage.blankNumbers || [],
                              passageTitle: previewReadingPassage.title || '',
                            }
                          : getReadingPreviewData(previewQuestions, activeQuiz);
                        if (readingPreview.isReading) {
                          return (
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(420px, 1.2fr)', gap: '16px', alignItems: 'start' }}>
                              <div style={{ position: 'sticky', top: 0 }}>
                                <div style={{
                                  fontSize: '12px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase',
                                  color: '#8eefff', marginBottom: '8px'
                                }}>
                                  Passage / Đoạn văn
                                </div>
                                <div style={{
                                  whiteSpace: 'pre-wrap', lineHeight: '1.7', fontSize: '14px', color: 'var(--text-main)',
                                  background: 'linear-gradient(180deg, rgba(6,182,212,0.09), rgba(6,182,212,0.03))',
                                  border: '1px solid rgba(6,182,212,0.2)', borderRadius: '12px', padding: '14px'
                                }}>
                                  {renderPassageWithBlankHighlights(readingPreview.passage, null)}
                                </div>
                              </div>

                              <div>
                                <div style={{
                                  fontSize: '12px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase',
                                  color: '#d8ccff', marginBottom: '8px'
                                }}>
                                  Questions / Câu hỏi
                                </div>
                                {readingPreview.questions.map((q, i) => (
                                  <div key={i} style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px dashed rgba(var(--glass-rgb),0.06)' }}>
                                    <div style={{ fontWeight: '500', marginBottom: '8px', fontSize: '15px' }}>
                                      Câu {i + 1}{q.blankNumber ? ` (${q.blankNumber})` : ''}: {q._questionOnly || q.question}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                                      <div>A. {q.options.A}</div><div>B. {q.options.B}</div>
                                      <div>C. {q.options.C}</div><div>D. {q.options.D}</div>
                                    </div>
                                    {(q.answer || q.explanation) && (
                                      <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--accent-green)', background: 'rgba(16,185,129,0.1)', padding: '8px', borderRadius: '6px' }}>
                                        {q.answer && <div style={{ marginBottom: '4px', fontWeight: 'bold' }}>✓ Đáp án: {q.answer}</div>}
                                        {q.explanation && <div style={{ color: 'var(--text-main)' }}>📝 GT: {q.explanation}</div>}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }

                        return previewQuestions.map((q, i) => (
                          <div key={i} style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px dashed rgba(var(--glass-rgb),0.06)' }}>
                            <div style={{ fontWeight: '500', marginBottom: '8px', fontSize: '15px' }}>Câu {i + 1}: {q.question}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                              <div>A. {q.options.A}</div><div>B. {q.options.B}</div>
                              <div>C. {q.options.C}</div><div>D. {q.options.D}</div>
                            </div>
                            {(q.answer || q.explanation) && (
                              <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--accent-green)', background: 'rgba(16,185,129,0.1)', padding: '8px', borderRadius: '6px' }}>
                                {q.answer && <div style={{ marginBottom: '4px', fontWeight: 'bold' }}>✓ Đáp án: {q.answer}</div>}
                                {q.explanation && <div style={{ color: 'var(--text-main)' }}>📝 GT: {q.explanation}</div>}
                              </div>
                            )}
                          </div>
                        ));
                      })()}
                    </div>
                    <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                      <button className="btn" onClick={() => setPreviewQuestions(null)}>Quay lại chỉnh sửa</button>
                      <button className="btn btn-primary" onClick={handleConfirmImport}>
                        Xác nhận {(importTargetQuizId && importMode !== 'reading') ? 'Thêm' : 'Khởi tạo Đề'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3>{importTargetQuizId ? 'Thêm Câu Hỏi Từ Word' : 'Nhập Câu Hỏi Trắc Nghiệm'}</h3>

                    <div style={{ display: 'flex', gap: '8px', margin: '8px 0 14px 0', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => setImportMode('normal')}
                        style={{
                          padding: '7px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700,
                          border: '1px solid rgba(var(--glass-rgb),0.1)', cursor: 'pointer',
                          background: importMode === 'normal' ? 'rgba(124,77,255,0.25)' : 'rgba(var(--glass-rgb),0.04)',
                          color: importMode === 'normal' ? '#d8ccff' : 'var(--text-muted)'
                        }}
                      >
                        Trắc nghiệm thường
                      </button>
                      <button
                        onClick={() => setImportMode('reading')}
                        style={{
                          padding: '7px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700,
                          border: '1px solid rgba(var(--glass-rgb),0.1)', cursor: 'pointer',
                          background: importMode === 'reading' ? 'rgba(0,227,253,0.18)' : 'rgba(var(--glass-rgb),0.04)',
                          color: importMode === 'reading' ? '#8eefff' : 'var(--text-muted)'
                        }}
                      >
                        READING (1 đoạn + nhiều câu)
                      </button>
                    </div>

                    <p style={{ color: 'var(--text-muted)', marginBottom: '16px', fontSize: '14px' }}>
                      {importMode === 'reading'
                        ? <>Dán theo mẫu: <strong>READING: [tiêu đề + passage có blank number như (135), 136...]\n\n135. [câu hỏi] A...B...C...D...</strong>. Passage được lưu 1 block và câu hỏi map theo số.</>
                        : <>Copy và Paste trực tiếp từ Word. Định dạng yêu cầu: <strong>"Câu 1: [đề] A. [đáp án] B. [đáp án] C. [đáp án] D. [đáp án]"</strong>. (Tùy chọn ghi thêm "Đáp án: A", "Giải thích: ...")</>}
                    </p>
                    <textarea 
                      style={{ flex: 1, resize: 'none', fontFamily: 'monospace' }} 
                      value={importText} onChange={e => setImportText(e.target.value)}
                      placeholder={importMode === 'reading'
                        ? "READING:\nBiggs, CEO and founder of BiggsGraphics...\n\nCâu 1: Từ (131) phù hợp nhất là gì?\nA. seek\nB. to seek\nC. seeking\nD. are seeking"
                        : "Câu 1: 1 + 1 bằng mấy?\nA. 1\nB. 2\nC. 3\nD. 4"}
                    />
                    <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                      <button className="btn" onClick={() => { setIsImporting(false); setImportTargetQuizId(null); setPreviewQuestions(null); setPreviewReadingPassage(null); setImportMode('normal'); }}>Hủy</button>
                      <button className="btn btn-primary" onClick={handleParseImport}>Xem trước</button>
                    </div>
                  </>
                )}
              </div>
            ) : activeQuiz ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>


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
                          <div style={{ color: 'var(--text-main)', whiteSpace: 'pre-wrap', lineHeight: '1.7', background: 'rgba(var(--glass-rgb),0.03)', borderRadius: '8px', padding: '16px', border: '1px dashed rgba(255,152,0, 0.3)', fontSize: '14px' }}>
                            {activeQuiz.keyTakeaways ? activeQuiz.keyTakeaways : <span style={{ color: 'var(--text-muted)' }}>Chưa có tổng hợp kiến thức. Bấm Quay về sửa đề để thêm.</span>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {isTesting && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '12px', width: 'max-content' }}>
                      <button onClick={() => setTestMode('all')} style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', border: 'none', cursor: 'pointer', background: testMode === 'all' ? 'var(--primary)' : 'transparent', color: testMode === 'all' ? 'var(--on-primary)' : 'var(--text-muted)' }}>
                        Tất cả ({activeQuiz.questions.length})
                      </button>
                      <button onClick={() => setTestMode('starred')} style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', border: 'none', cursor: 'pointer', background: testMode === 'starred' ? 'var(--primary)' : 'transparent', color: testMode === 'starred' ? 'var(--on-primary)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
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

                  {/* Translation Popup */}
                  {translationPopup && (
                    <div
                      className="translation-popup"
                      style={{
                        position: 'fixed',
                        left: `${translationPopup.x}px`,
                        top: `${translationPopup.y}px`,
                        transform: 'translate(-50%, -100%)',
                        zIndex: 9999,
                        background: 'linear-gradient(135deg, #1a1e3a, #1e2140)',
                        borderRadius: '14px',
                        padding: '14px 18px',
                        border: '1px solid rgba(124,77,255,0.3)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 20px rgba(124,77,255,0.15)',
                        minWidth: '200px',
                        maxWidth: '360px',
                        animation: 'fadeInUp 0.2s ease-out',
                      }}
                    >
                      {/* Arrow */}
                      <div style={{
                        position: 'absolute', bottom: '-6px', left: '50%', transform: 'translateX(-50%) rotate(45deg)',
                        width: '12px', height: '12px', background: '#1e2140',
                        borderRight: '1px solid rgba(124,77,255,0.3)',
                        borderBottom: '1px solid rgba(124,77,255,0.3)',
                      }} />

                      {/* Selected text */}
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                        <Languages size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                        Dịch từ
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'white', marginBottom: '10px', lineHeight: '1.4' }}>
                        "{translationPopup.text}"
                      </div>

                      {/* Translation result */}
                      {(isTranslating || translatedText) && (
                        <div style={{
                          background: 'rgba(124,77,255,0.08)', borderRadius: '8px', padding: '10px 12px',
                          border: '1px solid rgba(124,77,255,0.15)', marginBottom: '10px',
                          minHeight: '32px', display: 'flex', alignItems: 'center'
                        }}>
                          {isTranslating ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
                              <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid rgba(124,77,255,0.3)', borderTop: '2px solid #7c4dff', animation: 'spin 0.8s linear infinite' }} />
                              Đang dịch...
                            </div>
                          ) : (
                            <span style={{ color: '#a78bfa', fontWeight: 600, fontSize: '14px' }}>
                              {translatedText}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => { setTranslationPopup(null); setTranslatedText(''); }}
                          style={{
                            padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                            background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.1)',
                            cursor: 'pointer', transition: 'all 0.15s'
                          }}
                        >Đóng</button>
                        {!translatedText && !isTranslating && (
                          <button
                            onClick={() => translateText(translationPopup.text)}
                            style={{
                              padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                              background: 'linear-gradient(135deg, #7c4dff, #536dfe)',
                              color: 'white', border: 'none', cursor: 'pointer',
                              transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '5px',
                              boxShadow: '0 2px 12px rgba(124,77,255,0.3)'
                            }}
                          >
                            <Languages size={13} /> Dịch
                          </button>
                        )}
                        {translatedText && !isTranslating && (
                          <button
                            onClick={handleInsertTranslation}
                            style={{
                              padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                              background: 'linear-gradient(135deg, #7c4dff, #536dfe)',
                              color: 'white', border: 'none', cursor: 'pointer',
                              transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '5px',
                              boxShadow: '0 2px 12px rgba(124,77,255,0.3)'
                            }}
                          >
                            <span style={{ fontSize: '13px' }}>+</span> Chèn ({translatedText})
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {(() => {
                    const readingPassageMap = new Map((activeQuiz?.readingPassages || []).map(p => [p.id, p]));
                    const firstNormalQuestionIndex = questionsForDisplay.findIndex(item => !item.readingGroupId);
                    const selectedReadingQuestion = questionsForDisplay.find(item => item.id === selectedReadingQuestionId);
                    const activeReadingBlankNumber = selectedReadingQuestion?.blankNumber || null;

                    const questionCards = questionsForDisplay.map((q, i) => {
                      const answerRevealed = isTesting && q.userAnswer;
                      const displayQuestionText = isTesting && q.readingGroupId
                        ? (q._questionOnly || q.question)
                        : q.question;
                      const blankNotFoundInPassage = q.readingGroupId
                        && q.blankNumber
                        && !(readingPassageMap.get(q.readingGroupId)?.blankNumbers || []).some(n => String(n) === String(q.blankNumber));

                      const firstQuestionInGroupIndex = q.readingGroupId
                        ? questionsForDisplay.findIndex(item => item.readingGroupId === q.readingGroupId)
                        : -1;
                      const showReadingGroupHeader = !!q.readingGroupId && firstQuestionInGroupIndex === i;
                      const showNormalHeader = !q.readingGroupId && firstNormalQuestionIndex === i;

                      const passageObj = q.readingGroupId ? readingPassageMap.get(q.readingGroupId) : null;
                      const isSameSelectedGroup = !!selectedReadingQuestion?.readingGroupId
                        && selectedReadingQuestion.readingGroupId === q.readingGroupId;

                      return (
                      <div key={`section-item-${q.id}`}>
                      {showReadingGroupHeader && passageObj && (
                        <div
                          key={`reading-block-${passageObj.id}`}
                          className="glass-panel"
                          style={{ padding: '16px', marginBottom: '12px', border: '1px solid rgba(6,182,212,0.35)' }}
                        >
                          <div style={{ fontSize: '12px', fontWeight: 800, color: '#8eefff', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Reading Block
                          </div>
                          <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7', fontSize: '14px' }}>
                            {renderPassageWithBlankHighlights(passageObj.content || '', isSameSelectedGroup ? activeReadingBlankNumber : null)}
                          </div>
                        </div>
                      )}
                      {showNormalHeader && (
                        <div key="normal-block-header" className="glass-panel" style={{ padding: '12px 16px', marginBottom: '12px', border: '1px dashed rgba(124,77,255,0.35)' }}>
                          <div style={{ fontSize: '12px', fontWeight: 800, color: '#d8ccff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Câu trắc nghiệm thường
                          </div>
                        </div>
                      )}
                      <div key={q.id} className="glass-panel" style={{ padding: '20px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                          <div style={{ fontWeight: '500', fontSize: '16px', flex: 1 }}>
                            {!isTesting ? (
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <span style={{ paddingTop: '8px' }}>Câu {i + 1}:</span>
                                <textarea 
                                  value={q.question} onChange={e => handleUpdateQuestionProp(q.id, 'question', e.target.value)}
                                  onMouseUp={(e) => handleTextSelection(e, q.id, 'question')}
                                  style={{ flex: 1, background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '8px', fontSize: '15px', resize: 'vertical', minHeight: '60px' }}
                                />
                              </div>
                            ) : (
                              <span onMouseUp={(e) => handleTextSelection(e, q.id, 'question')}>
                                Câu {i + 1}{q.readingGroupId && q.blankNumber ? ` (${q.blankNumber})` : ''}: {renderQuizText(displayQuestionText, answerRevealed)}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px', flexShrink: 0 }}>
                            {q.readingGroupId && (
                              <button
                                onClick={() => setSelectedReadingQuestionId(q.id)}
                                title="Highlight ô trống trong passage"
                                style={{ padding: '6px 8px', borderRadius: '8px', border: '1px solid rgba(6,182,212,0.35)', background: selectedReadingQuestionId === q.id ? 'rgba(6,182,212,0.22)' : 'transparent', color: '#8eefff', cursor: 'pointer' }}
                              >
                                🔎
                              </button>
                            )}
                            <button 
                              onClick={() => handleToggleBookmark(q.id)}
                              title={q.isStarred ? "Bỏ đánh dấu" : "Đánh dấu câu hỏi này"}
                              style={{ padding: '8px', background: q.isStarred ? 'rgba(251, 191, 36, 0.1)' : 'transparent', border: 'none', cursor: 'pointer', color: q.isStarred ? '#fbbf24' : 'var(--text-muted)', borderRadius: '8px', transition: 'all 0.2s', display: 'flex' }}
                            >
                              <Star size={20} fill={q.isStarred ? '#fbbf24' : 'none'} color={q.isStarred ? '#fbbf24' : 'currentColor'} />
                            </button>
                            {!isTesting && (
                              <button 
                                onClick={() => handleDeleteQuestion(q.id)}
                                title="Xóa câu hỏi này"
                                style={{ padding: '8px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', borderRadius: '8px', transition: 'all 0.2s', display: 'flex' }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-red)'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                              >
                                <Trash2 size={18} />
                              </button>
                            )}
                          </div>
                        </div>
                        {blankNotFoundInPassage && (
                          <div style={{
                            marginBottom: '10px',
                            fontSize: '12px',
                            color: '#facc15',
                            background: 'rgba(250,204,21,0.12)',
                            border: '1px solid rgba(250,204,21,0.35)',
                            borderRadius: '8px',
                            padding: '6px 10px',
                          }}>
                            ⚠ Blank {q.blankNumber} chưa có trong passage (vẫn được lưu theo chế độ cảnh báo).
                          </div>
                        )}
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                          {['A', 'B', 'C', 'D'].map(opt => (
                            <div 
                              key={opt} onClick={() => isTesting && handleSelectAnswer(q.id, opt)}
                              style={{ 
                                padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)',
                                background: isTesting 
                                  ? (q.userAnswer === opt ? (q.answer && q.userAnswer !== q.answer ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)') : 'transparent')
                                  : (q.answer === opt ? 'rgba(16, 185, 129, 0.2)' : 'transparent'),
                                cursor: isTesting ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '8px'
                              }}
                            >
                              <strong>{opt}.</strong> 
                              {!isTesting ? (
                                <input type="text" value={q.options[opt]} onChange={(e) => handleUpdateOptionProp(q.id, opt, e.target.value)}
                                  onMouseUp={(e) => handleTextSelection(e, q.id, `option_${opt}`)}
                                  style={{ flex: 1, marginLeft: '4px', background: 'transparent', color: 'var(--text-main)', border: 'none', borderBottom: '1px dashed var(--border-color)', padding: '4px', fontSize: '14px', outline: 'none' }}
                                />
                              ) : (
                                <span onMouseUp={(e) => { e.stopPropagation(); handleTextSelection(e, q.id, `option_${opt}`); }}>
                                  {' '}{renderQuizText(q.options[opt], answerRevealed)}
                                </span>
                              )}
                              {isTesting && q.answer && q.userAnswer === opt && opt === q.answer && <CheckCircle size={16} color="var(--accent-green)"/>}
                              {isTesting && q.answer && q.userAnswer === opt && opt !== q.answer && <XCircle size={16} color="var(--accent-red)"/>}
                            </div>
                          ))}
                        </div>

                        {(!isTesting || q.userAnswer) && (
                          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px dashed var(--border-color)' }}>
                            {!isTesting ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                  {q.readingGroupId && (
                                    <input
                                      type="text"
                                      value={q.blankNumber || ''}
                                      onChange={e => handleUpdateQuestionProp(q.id, 'blankNumber', e.target.value.replace(/[^\d]/g, ''))}
                                      placeholder="Blank # (vd: 135)"
                                      style={{ width: '150px', background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 8px' }}
                                    />
                                  )}
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
                                  <button className="btn" style={{ color: 'var(--accent-orange)', padding: '6px 12px' }} onClick={() => handleCallAI(q.id, q)} disabled={aiLoading === q.id}>
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
                                {q.answer && (
                                  <div style={{ color: 'var(--accent-green)', fontWeight: 'bold', marginBottom: '8px', fontSize: '15px' }}>
                                    ✓ Đáp án đúng: {q.answer}. {renderQuizText(q.options[q.answer], true)}
                                  </div>
                                )}

                                {/* Show the hidden /explanation parts for question & options */}
                                {(() => {
                                  const hiddenParts = [];
                                  if (q.question?.includes('/')) {
                                    hiddenParts.push({ label: 'Câu hỏi', text: q.question.substring(q.question.indexOf('/') + 1).trim() });
                                  }
                                  ['A', 'B', 'C', 'D'].forEach(opt => {
                                    if (q.options[opt]?.includes('/')) {
                                      hiddenParts.push({ label: `Đáp án ${opt}`, text: q.options[opt].substring(q.options[opt].indexOf('/') + 1).trim() });
                                    }
                                  });

                                  if (hiddenParts.length > 0) {
                                    return (
                                      <div style={{ marginBottom: '10px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(255,152,0,0.06)', border: '1px solid rgba(255,152,0,0.15)' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-orange)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                          💡 Giải thích trong đề:
                                        </div>
                                        {hiddenParts.map((hp, idx) => (
                                          <div key={idx} style={{ fontSize: '13px', color: 'var(--text-main)', lineHeight: '1.6', marginLeft: '4px' }}>
                                            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{hp.label}:</span>{' '}
                                            <span style={{ fontStyle: 'italic' }}>{hp.text}</span>
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}

                                {q.explanation && (
                                  <div style={{ color: 'var(--text-muted)', whiteSpace: 'pre-wrap', lineHeight: '1.7', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '12px', border: '1px solid rgba(255,255,255,0.06)', fontSize: '13.5px' }}>
                                    <strong style={{ color: 'var(--accent-orange)' }}>📝 Giải thích:</strong>{'\n'}{q.explanation}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });

                    return questionCards;
                  })()}

                  {!isTesting && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', padding: '10px 0 30px 0', flexWrap: 'wrap' }}>
                      <button 
                        onClick={() => {
                          const newQuestion = {
                            id: uuidv4(),
                            question: '',
                            options: { A: '', B: '', C: '', D: '' },
                            answer: '',
                            explanation: '',
                            userAnswer: null,
                            isStarred: false,
                          };
                          const newQuizzes = quizzes.map(q => q.id === activeQuizId ? { ...q, questions: [...q.questions, newQuestion] } : q);
                          setQuizzes(newQuizzes);
                        }}
                        style={{
                          padding: '10px 18px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                          background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)', border: '1px dashed rgba(255,255,255,0.2)',
                          cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                      >
                        <PlusIcon /> Thêm câu hỏi trống
                      </button>
                      <button 
                        onClick={() => {
                          setIsImporting(true);
                          setImportTargetQuizId(activeQuizId);
                          setImportMode('normal');
                        }}
                        style={{
                          padding: '10px 18px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                          background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)',
                          cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                      >
                        <FileText size={18} /> Nhập thêm từ Word
                      </button>
                      <button 
                        onClick={() => {
                          setIsImporting(true);
                          setImportTargetQuizId(activeQuizId);
                          setImportMode('reading');
                        }}
                        style={{
                          padding: '10px 18px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                          background: 'rgba(6,182,212,0.15)', color: '#67e8f9', border: '1px solid rgba(6,182,212,0.35)',
                          cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                      >
                        <BookOpen size={18} /> Nhập READING
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

// Icon Helper
function PlusIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>;
}
