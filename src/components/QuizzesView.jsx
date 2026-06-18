import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useFirestore } from '../hooks/useFirestore';
import { Key, Sparkles, Upload, Play, CheckCircle, XCircle, Trash2, Star, Lightbulb, ChevronDown, ChevronUp, X, Image as ImageIcon, FileText, Zap, ArrowLeft, Clock, BookOpen, MoreVertical, Languages, File, Volume2, Save, Copy, Folder, FolderPlus, Edit3, Plus } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { exportQuizToWord } from '../utils/exportWord';
import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import TiptapEditor from './TiptapEditor';
import * as mammoth from 'mammoth';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
const DEMO_QUIZ = {
  id: uuidv4(),
  title: '✨ Đề thi Demo: Hướng dẫn sử dụng',
  questions: [
    {
      id: uuidv4(),
      question: 'Chào mừng bạn đến với Study App! Bạn có thể chọn đáp án đúng cho câu hỏi này để _____ tính năng làm bài tập.',
      options: {
        A: 'trải nghiệm',
        B: 'bỏ qua',
        C: 'xóa bỏ',
        D: 'quên đi'
      },
      answer: 'A',
      explanation: 'Hãy click vào nút "Làm bài" ở trên để bắt đầu tính năng Test mode. Ở chế độ này, đáp án sẽ được ẩn đi.',
      userAnswer: null
    },
    {
      id: uuidv4(),
      question: 'Tính năng **Dịch nhanh & Tra từ điển AI**: Hãy thử bôi đen từ tiếng Anh "efficiency" trong câu sau để xem điều kỳ diệu:\\nThis app will improve your learning efficiency.',
      options: {
        A: 'sự hiệu quả',
        B: 'sự khó khăn',
        C: 'sự chậm trễ',
        D: 'sự phức tạp'
      },
      answer: 'A',
      explanation: 'Efficiency (n): sự hiệu quả. Bạn có thể bôi đen bất kỳ từ vựng nào trong lúc học để tra cứu hoặc lưu vào Bộ thẻ (Decks) để ôn tập flashcard sau này.',
      userAnswer: null
    },
    {
      id: uuidv4(),
      question: 'Bạn có thể thêm đề trắc nghiệm mới vào hệ thống bằng cách nào?',
      options: {
        A: 'Dán văn bản thuần (Text)',
        B: 'Tải lên hình ảnh (OCR sẽ quét chữ)',
        C: 'Tải lên file PDF',
        D: 'Tất cả các cách trên đều đúng'
      },
      answer: 'D',
      explanation: 'Ứng dụng hỗ trợ rất nhiều cách nhập dữ liệu. Bạn hãy nhấn vào nút "Thêm đề" -> "Import" hoặc "Tạo đề bằng AI" để khám phá!',
      userAnswer: null
    }
  ],
  updatedAt: Date.now()
};

export default function QuizzesView() {
  const [quizzes, setQuizzes] = useFirestore('quizzes', 'study_quizzes', [DEMO_QUIZ]);
  const [folders, setFolders] = useFirestore('quiz_folders', 'study_quiz_folders', []);
  const [selectedFolderId, setSelectedFolderId] = useState('all');
  const [folderActionModal, setFolderActionModal] = useState(null); // { type: 'create' | 'rename', id?: string, name?: string }
  const [moveQuizModal, setMoveQuizModal] = useState(null); // { quizId: string, folderId: string | null }
  const [activeQuizCardMenu, setActiveQuizCardMenu] = useState(null); // quizId of currently open card dropdown menu

  // Folder action helper handlers
  const handleCreateFolder = (name) => {
    if (!name.trim()) return;
    const newFolder = {
      id: uuidv4(),
      name: name.trim(),
      createdAt: Date.now()
    };
    setFolders(prev => [newFolder, ...prev]);
    setFolderActionModal(null);
  };

  const handleRenameFolder = (id, newName) => {
    if (!newName.trim()) return;
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name: newName.trim() } : f));
    setFolderActionModal(null);
  };

  const handleDeleteFolder = (id) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa thư mục này? Các bộ đề bên trong sẽ được đưa ra mục "Chưa phân loại".')) {
      setFolders(prev => prev.filter(f => f.id !== id));
      // Move quizzes inside this folder to uncategorized (folderId: null)
      setQuizzes(prevQuizzes => prevQuizzes.map(q => q.folderId === id ? { ...q, folderId: null, updatedAt: Date.now() } : q));
      if (selectedFolderId === id) {
        setSelectedFolderId('all');
      }
    }
  };

  const handleMoveQuiz = (quizId, targetFolderId) => {
    setQuizzes(prevQuizzes => prevQuizzes.map(q => q.id === quizId ? { ...q, folderId: targetFolderId, updatedAt: Date.now() } : q));
    setMoveQuizModal(null);
  };

  useEffect(() => {
    const handleCloseMenu = (e) => {
      if (activeQuizCardMenu && !e.target.closest('.quiz-card-menu-container')) {
        setActiveQuizCardMenu(null);
      }
    };
    document.addEventListener('mousedown', handleCloseMenu);
    return () => document.removeEventListener('mousedown', handleCloseMenu);
  }, [activeQuizCardMenu]);

  const [apiKey] = useLocalStorage('gemini_api_key', '');
  const [apiModel] = useLocalStorage('gemini_api_model', 'gemini-1.5-flash-latest');
  
  const [aiProvider] = useLocalStorage('ai_provider', 'gemini');
  const [openaiKey] = useLocalStorage('openai_api_key', '');
  const [openaiModel] = useLocalStorage('openai_api_model', 'gpt-4o-mini');
  const [appSoundEnabled] = useLocalStorage('app_sound_enabled', true);

  const [decks, setDecks] = useFirestore('decks', 'study_decks', []);
  const [activeQuizId, setActiveQuizId] = useState(null);
  const [targetDeckId, setTargetDeckId] = useState('');
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState('normal'); // 'normal' | 'reading'
  const [isImporting, setIsImporting] = useState(false);
  const [previewQuestions, setPreviewQuestions] = useState(null);
  const [previewReadingPassage, setPreviewReadingPassage] = useState(null); // { id, title, content, blankNumbers }
  const [importTargetQuizId, setImportTargetQuizId] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testMode, setTestMode] = useState('all'); // 'all' or 'starred'
  const [selectedReadingQuestionId, setSelectedReadingQuestionId] = useState(null);

  const [isShuffled, setIsShuffled] = useState(false);
  const [shuffledIds, setShuffledIds] = useState(null);
  const [shuffledOptions, setShuffledOptions] = useState(null);

  const shuffleArray = (source = []) => {
    const arr = [...source];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  useEffect(() => {
    setIsShuffled(false);
    setShuffledIds(null);
    setShuffledOptions(null);
  }, [activeQuizId, isTesting, testMode]);

  // Scroll to newly added question
  useEffect(() => {
    if (addedQuestionIdRef.current) {
      const qId = addedQuestionIdRef.current;
      const timer = setTimeout(() => {
        const element = document.getElementById(`question-card-${qId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const textarea = element.querySelector('textarea');
          if (textarea) {
            textarea.focus();
          }
          addedQuestionIdRef.current = null;
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [quizzes]);
  const [aiLoading, setAiLoading] = useState(null);
  const [isTakeawaysCollapsed, setIsTakeawaysCollapsed] = useState(false);
  const [isGeneratingTakeaways, setIsGeneratingTakeaways] = useState(false);

  const [isCreatingAiQuiz, setIsCreatingAiQuiz] = useState(false);
  const [aiQuizFiles, setAiQuizFiles] = useState([]); // { id, data, name, type, extractedText, isProcessing }
  const [aiQuizPrompt, setAiQuizPrompt] = useState('');
  const [numQuestions, setNumQuestions] = useState(10);
  const [isDragging, setIsDragging] = useState(false);
  const [aiProgress, setAiProgress] = useState('');
  const [optimizeTokens, setOptimizeTokens] = useLocalStorage('ai_optimize_tokens', true);
  const fileInputRef = useRef(null);
  const addedQuestionIdRef = useRef(null);

  const [isMerging, setIsMerging] = useState(false);
  const [selectedQuizzesToMerge, setSelectedQuizzesToMerge] = useState([]);
  const [copiedQuestionId, setCopiedQuestionId] = useState(null);

  const handleMergeQuizzes = () => {
    if (selectedQuizzesToMerge.length < 2) return;
    
    const quizzesToMerge = quizzes.filter(q => selectedQuizzesToMerge.includes(q.id));
    const allQuestions = [];
    const allPassages = [];
    
    quizzesToMerge.forEach(q => {
      // Deep clone to prevent reference sharing between independent quizzes
      const clonedQuestions = JSON.parse(JSON.stringify(q.questions || []));
      const clonedPassages = JSON.parse(JSON.stringify(q.readingPassages || []));
      
      const passageIdMap = {};
      clonedPassages.forEach(p => {
        const oldId = p.id;
        p.id = uuidv4();
        passageIdMap[oldId] = p.id;
      });
      
      clonedQuestions.forEach(q => {
        q.id = uuidv4();
        if (q.readingGroupId && passageIdMap[q.readingGroupId]) {
          q.readingGroupId = passageIdMap[q.readingGroupId];
        }
      });

      allQuestions.push(...clonedQuestions);
      allPassages.push(...clonedPassages);
    });

    const newQuiz = {
      id: uuidv4(),
      title: `Bộ đề gộp (${selectedQuizzesToMerge.length} bộ)`,
      questions: allQuestions,
      readingPassages: allPassages,
      updatedAt: Date.now()
    };

    setQuizzes([...quizzes, newQuiz]);
    setIsMerging(false);
    setSelectedQuizzesToMerge([]);
    setActiveQuizId(newQuiz.id);
  };


  // Translation popup state
  const [translationPopup, setTranslationPopup] = useState(null); // { x, y, text, questionId, field, selStart, selEnd }
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSavingToDeck, setIsSavingToDeck] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isAiEnrichingPopup, setIsAiEnrichingPopup] = useState(false);
  const [enrichedData, setEnrichedData] = useState(null); // { pronunciation, wordType, example, synonyms }
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

    if (!showHidden) {
      // Remove (translation text) patterns — but keep content that was there originally
      return visiblePart.replace(/\s*\([^)]*\)/g, '');
    }

    // If showHidden is true, format the (...) parts in visiblePart
    const formatParens = (str) => {
      const parts = str.split(/(\([^)]*\))/g);
      return parts.map((part, index) => {
        if (part.startsWith('(') && part.endsWith(')')) {
          return (
            <span key={index} style={{ color: 'var(--accent-orange)', fontStyle: 'italic', opacity: 0.85 }}>
              {part}
            </span>
          );
        }
        return part;
      });
    };

    const formattedVisible = formatParens(visiblePart);

    if (hiddenPart) {
      return (
        <>
          {formattedVisible}
          <span style={{ color: 'var(--accent-orange)', fontStyle: 'italic', opacity: 0.85 }}> / {hiddenPart}</span>
        </>
      );
    }

    return formattedVisible;
  };

  const handleTextSelection = useCallback((e, questionId = null, field = null) => {
    e.stopPropagation();
    if (translationTimeoutRef.current) clearTimeout(translationTimeoutRef.current);
    translationTimeoutRef.current = setTimeout(() => {
      let selectedText = '';
      let popupX = 0, popupY = 0;
      let selStart = 0, selEnd = 0;

      const target = e.target;
      const qId = questionId || target.getAttribute('data-question-id') || null;
      const fld = field || target.getAttribute('data-field') || null;

      if (target.closest && target.closest('.translation-popup')) return;

      const isFormElement = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT';

      if (isFormElement) {
        selStart = target.selectionStart;
        selEnd = target.selectionEnd;
        if (selStart !== selEnd) {
          selectedText = target.value.substring(selStart, selEnd).trim();
          const rect = target.getBoundingClientRect();
          popupX = rect.left + rect.width / 2;
          popupY = rect.top - 4;
        }
      } else {
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
          questionId: qId,
          field: fld,
          selStart,
          selEnd
        });
        setTranslatedText('');
        setEnrichedData(null);
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
    const { questionId, field, selStart, selEnd, text } = translationPopup;

    const q = activeQuiz?.questions.find(x => x.id === questionId);
    if (!q) return;

    let originalText = '';
    if (field === 'question') {
      originalText = q.question;
    } else if (field.startsWith('option_')) {
      const optKey = field.replace('option_', '');
      originalText = q.options[optKey];
    } else {
      return;
    }

    // Use selStart/selEnd if available, otherwise fallback to indexOf (though form elements now provide selStart/selEnd)
    let newText = '';
    if (selStart !== undefined && selEnd !== undefined && selStart !== selEnd) {
      newText = originalText.substring(0, selEnd) + ` (${translatedText})` + originalText.substring(selEnd);
    } else {
      const insertionIdx = originalText.indexOf(text);
      if (insertionIdx === -1) return;
      const afterIdx = insertionIdx + text.length;
      newText = originalText.substring(0, afterIdx) + ` (${translatedText})` + originalText.substring(afterIdx);
    }

    if (field === 'question') {
      handleUpdateQuestionProp(questionId, 'question', newText);
    } else if (field.startsWith('option_')) {
      const optKey = field.replace('option_', '');
      handleUpdateOptionProp(questionId, optKey, newText);
    }

    setTranslationPopup(null);
    setTranslatedText('');
    setEnrichedData(null);
  };

  const handleAiEnrichForPopup = async () => {
    if (!translationPopup?.text || isAiEnrichingPopup) return;
    
    const activeApiKey = aiProvider === 'gemini' ? apiKey : openaiKey;
    if (!activeApiKey) {
      alert(`Vui lòng nhập API Key cho ${aiProvider === 'gemini' ? 'Gemini' : 'OpenAI'} trong phần Cài đặt.`);
      return;
    }

    setIsAiEnrichingPopup(true);
    try {
      const prompt = `Bạn là từ điển Anh-Việt chuyên nghiệp. Hãy phân tích từ/cụm từ tiếng Anh sau: "${translationPopup.text}"
      Trả về JSON duy nhất (không markdown, không giải thích):
      {
        "definition": "nghĩa tiếng Việt (ngắn gọn, chính xác)",
        "pronunciation": "phiên âm IPA",
        "wordType": "n./v./adj./adv./phr.",
        "example": "1 câu ví dụ tiếng Anh tự nhiên",
        "synonyms": "2-3 từ đồng nghĩa, cách nhau bởi dấu phẩy"
      }`;

      let rawText = "";
      if (aiProvider === 'gemini') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            generationConfig: { maxOutputTokens: 512, temperature: 0.1 },
            contents: [{ parts: [{ text: prompt }] }]
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        rawText = data.candidates[0].content.parts[0].text;
      } else {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`
          },
          body: JSON.stringify({
            model: openaiModel,
            max_tokens: 512,
            temperature: 0.1,
            messages: [{ role: 'user', content: prompt }]
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        rawText = data.choices[0].message.content;
      }

      const cleaned = rawText.replace(/```json\n?/gi, '').replace(/```/g, '').trim();
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (err) {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            const sanitized = match[0].replace(/[\n\r\t]/g, ' ');
            parsed = JSON.parse(sanitized);
          } catch(e2) {
            throw err;
          }
        } else {
          throw err;
        }
      }

      if (parsed.definition) setTranslatedText(parsed.definition);
      setEnrichedData({
        pronunciation: parsed.pronunciation || '',
        wordType: parsed.wordType || '',
        example: parsed.example || '',
        synonyms: parsed.synonyms ? parsed.synonyms.split(',').map(s => s.trim()) : []
      });
      
    } catch (err) {
      console.error(err);
      alert('Không thể dùng AI phân tích từ này: ' + err.message);
    } finally {
      setIsAiEnrichingPopup(false);
    }
  };

  const handleSpeak = (text) => {
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  const handleSaveToLibrary = async () => {
    if (!translationPopup || !translatedText) {
      console.warn('Cannot save: missing text or translation');
      return;
    }
    
    setIsSavingToDeck(true);
    setSaveSuccess(false);

    try {
      const cardToAdd = {
        id: uuidv4(),
        front: translationPopup.text.trim(),
        back: translatedText.trim(),
        type: enrichedData?.wordType || '', // DecksView uses wordType
        wordType: enrichedData?.wordType || '', // Double check which one is used
        pronunciation: enrichedData?.pronunciation || '',
        example: enrichedData?.example || '',
        synonyms: enrichedData?.synonyms ? enrichedData.synonyms.join('; ') : '',
        createdAt: new Date().toISOString(),
        isAIGenerated: !!enrichedData
      };

      let finalTargetId = targetDeckId;

      await setDecks(prevDecks => {
        let updatedDecks = [...prevDecks];
        let targetId = finalTargetId;

        // 1. Determine or create target deck
        if (!targetId) {
          const existingDeck = updatedDecks.find(d => 
            d.title.toLowerCase().includes('từ vựng đã dịch') || 
            d.title.toLowerCase().includes('vocabulary')
          );

          if (existingDeck) {
            targetId = existingDeck.id;
          } else {
            // Create a brand new "Default" deck
            targetId = uuidv4();
            const newDeck = {
              id: targetId,
              title: 'Từ vựng đã dịch',
              description: 'Các từ vựng được lưu từ đề thi',
              cards: [],
              createdAt: new Date().toISOString(),
              updatedAt: Date.now()
            };
            updatedDecks = [newDeck, ...updatedDecks];
          }
        }

        // 2. Add card to the target deck (at the END of the cards array)
        return updatedDecks.map(deck => {
          if (deck.id === targetId) {
            return {
              ...deck,
              cards: [...(deck.cards || []), cardToAdd],
              updatedAt: Date.now()
            };
          }
          return deck;
        });
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error('Error saving to deck:', error);
      alert('Có lỗi xảy ra khi lưu vào bộ thẻ.');
    } finally {
      setIsSavingToDeck(false);
    }
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
      if (previewQuestions[0]?.id) {
        addedQuestionIdRef.current = previewQuestions[0].id;
      }
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

  const handleWordUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      if (result.value) {
         setImportText(result.value);
      } else {
         alert('Không tìm thấy chữ trong file Word này.');
      }
    } catch (err) {
      console.error("Error reading Word file:", err);
      alert('Không thể đọc file Word. Vui lòng đảm bảo file là định dạng .docx hợp lệ.');
    }
    e.target.value = ''; // Reset input
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
    let lastOption = ''; 
    let mode = 'question'; // 'question', 'options', 'answer', 'explanation'

    const optionRe = /^\s*([A-F])\s*[.)]\s*(.*)/i;
    const answerRe = /^\s*(?:Đáp án|Answer|Đáp Án)\s*[:.]\s*([A-F]?)/i;
    const explainRe = /^\s*(?:Giải thích|Explanation|Giải Thích)\s*[:.]\s*(.*)/i;

    function flushQuestion() {
      let q = currentQuestion.trim();
      q = q.replace(/^(?:Câu|Question|Q|Bài)\s*\d+\s*[.):]*\s*/i, '');
      q = q.replace(/^\d+\s*[.)]\s+/, '');
      q = q.trim();

      if (q && currentOptions.A && currentOptions.B) {
        const cleanedOptions = {};
        for (const key of Object.keys(currentOptions)) {
          cleanedOptions[key] = currentOptions[key].trim();
        }
        questions.push({
          id: uuidv4(),
          question: q,
          options: cleanedOptions,
          answer: currentAnswer,
          explanation: currentExplanation.trim(),
          userAnswer: null,
        });
      }
      currentQuestion = '';
      currentOptions = {};
      currentAnswer = '';
      currentExplanation = '';
      lastOption = '';
      mode = 'question';
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check if it's an explicit new question marker
      let isExplicitNewQuestion = /^(?:Câu|Question|Q|Bài)\s*\d+/i.test(trimmed) || /^\d+\s*[.)]/.test(trimmed);

      if (isExplicitNewQuestion) {
        if (Object.keys(currentOptions).length > 0 || currentQuestion) {
          flushQuestion();
        }
        mode = 'question';
        currentQuestion = trimmed;
        continue;
      }

      // Check for answer line: "Đáp án: B"
      const ansMatch = trimmed.match(answerRe);
      if (ansMatch) {
        currentAnswer = (ansMatch[1] || '').toUpperCase();
        mode = 'answer';
        continue;
      }

      // Check for explanation line: "Giải thích: ..."
      const explMatch = trimmed.match(explainRe);
      if (explMatch) {
        currentExplanation = explMatch[1];
        mode = 'explanation';
        continue;
      }

      // Check for option line: "A. text" / "B) text"
      const optMatch = trimmed.match(optionRe);
      if (optMatch) {
        const letter = optMatch[1].toUpperCase();
        const optText = optMatch[2].trim();

        // If we already have options and we see A again → flush and start new question
        if (Object.keys(currentOptions).length > 0 && letter === 'A') {
          flushQuestion();
        }
        
        mode = 'options';
        currentOptions[letter] = optText;
        lastOption = letter;
        continue;
      }

      // Heuristics for un-numbered questions:
      // If we are in 'options' or 'answer' mode and see text that is NOT a marker, 
      // look ahead. If we see 'A.', it might be a new question.
      if (mode !== 'question' && Object.keys(currentOptions).length > 0) {
         let foundA = false;
         for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
            const nextLine = lines[j].trim();
            if (!nextLine) continue;
            if (nextLine.match(optionRe) && nextLine.match(optionRe)[1].toUpperCase() === 'A') {
               foundA = true;
               break;
            }
            if (/^(?:Câu|Question|Q|Bài)\s*\d+/i.test(nextLine) || /^\d+\s*[.)]/.test(nextLine) || nextLine.match(answerRe) || nextLine.match(explainRe)) {
               break;
            }
         }
         
         // Only break out into 'question' mode if we are NOT in 'explanation' mode.
         // Explanation mode can have multi-line text, so we rely on explicit markers like "Câu X:" to break out.
         if (foundA && mode !== 'explanation') {
            flushQuestion();
            mode = 'question';
            currentQuestion = trimmed;
            continue;
         }
      }

      // Append based on current mode
      if (mode === 'question') {
        currentQuestion += (currentQuestion ? '\n' : '') + trimmed;
      } else if (mode === 'options') {
        if (lastOption) {
          currentOptions[lastOption] += '\n' + trimmed;
        }
      } else if (mode === 'answer') {
        // If extra text follows answer without "Giải thích" marker, assume it's explanation
        mode = 'explanation';
        currentExplanation += (currentExplanation ? '\n' : '') + trimmed;
      } else if (mode === 'explanation') {
        currentExplanation += (currentExplanation ? '\n' : '') + trimmed;
      }
    }

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

  // OCR and PDF Extraction Helpers
  const extractTextFromImage = async (dataUrl) => {
    try {
      const { data: { text } } = await Tesseract.recognize(dataUrl, 'eng+vie');
      return text;
    } catch (err) {
      console.error('OCR Error:', err);
      return '';
    }
  };

  const extractTextFromPDF = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += `[Trang ${i}]\n${pageText}\n\n`;
      }
      return fullText;
    } catch (err) {
      console.error('PDF Extraction Error:', err);
      return '';
    }
  };

  const processFiles = useCallback((files) => {
    const validFiles = Array.from(files).filter(f => f.type.startsWith('image/') || f.type === 'application/pdf');
    if (validFiles.length === 0) return;
    
    // Limit to 5 files total
    const remaining = 5 - aiQuizFiles.length;
    const toProcess = validFiles.slice(0, remaining);
    if (toProcess.length === 0) {
      alert('Tối đa 5 tài liệu. Hãy xóa bớt trước khi thêm.');
      return;
    }

    toProcess.forEach(async (file) => {
      const fileId = uuidv4();
      const fileType = file.type.startsWith('image/') ? 'image' : 'pdf';
      
      // Initial state with processing flag
      setAiQuizFiles(prev => [...prev, { 
        id: fileId, 
        name: file.name, 
        type: fileType, 
        isProcessing: true,
        data: null,
        extractedText: '' 
      }]);

      let extractedText = '';
      let fileData = null;

      if (fileType === 'image') {
        const reader = new FileReader();
        reader.onloadend = async () => {
          fileData = reader.result;
          if (optimizeTokens) {
            setAiProgress(`Đang trích xuất chữ từ ${file.name}...`);
            extractedText = await extractTextFromImage(fileData);
          }
          setAiQuizFiles(prev => prev.map(f => f.id === fileId ? { ...f, data: fileData, extractedText, isProcessing: false } : f));
          setAiProgress('');
        };
        reader.readAsDataURL(file);
      } else {
        // PDF Processing
        if (optimizeTokens) {
          setAiProgress(`Đang trích xuất chữ từ PDF ${file.name}...`);
          extractedText = await extractTextFromPDF(file);
        }
        setAiQuizFiles(prev => prev.map(f => f.id === fileId ? { ...f, extractedText, isProcessing: false } : f));
        setAiProgress('');
      }
    });
  }, [aiQuizFiles.length, optimizeTokens]);

  const handleImageUpload = (e) => {
    processFiles(e.target.files);
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveImage = (fileId) => {
    setAiQuizFiles(prev => prev.filter(f => f.id !== fileId));
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

  useEffect(() => {
    if (!isCreatingAiQuiz) return;
    
    const handlePasteEvent = (e) => {
      // Don't intercept if user is typing in form elements
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      
      const items = e.clipboardData?.items;
      if (!items) return;
      
      const files = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }
      
      if (files.length > 0) {
        e.preventDefault();
        processFiles(files);
      }
    };

    document.addEventListener('paste', handlePasteEvent);
    return () => {
      document.removeEventListener('paste', handlePasteEvent);
    };
  }, [isCreatingAiQuiz, processFiles]);

  const handleGenerateAiQuiz = async () => {
    const activeApiKey = aiProvider === 'gemini' ? apiKey : openaiKey;
    if (!activeApiKey) {
      alert(`Vui lòng nhập API Key cho ${aiProvider === 'gemini' ? 'Gemini' : 'OpenAI'} trong Cài đặt.`);
      return;
    }

    if (aiQuizFiles.length === 0 && !aiQuizPrompt.trim()) {
      alert('Vui lòng tải lên tài liệu hoặc nhập yêu cầu.');
      return;
    }

    setAiLoading('generate_quiz');
    setAiProgress('Đang chuẩn bị dữ liệu...');
    try {
      const hasFiles = aiQuizFiles.length > 0;
      
      // Build context from extracted text if optimizing tokens
      let extractedTextContent = '';
      if (optimizeTokens && hasFiles) {
        extractedTextContent = aiQuizFiles
          .map((f, i) => `--- Tài liệu ${i + 1} (${f.name}) ---\n${f.extractedText || '[Không có nội dung chữ được trích xuất]'}`)
          .join('\n\n');
      }

      const fileContext = extractedTextContent 
        ? `NỘI DUNG TRÍCH XUẤT TỪ TÀI LIỆU:\n${extractedTextContent}\n\n`
        : (hasFiles ? `Tôi đã tải lên ${aiQuizFiles.length} tài liệu. Hãy phân tích TẤT CẢ.` : '');

      const userPrompt = aiQuizPrompt.trim() || (hasFiles
        ? 'Hãy trích xuất hoặc tạo các câu hỏi trắc nghiệm từ nội dung trong tài liệu này.'
        : 'Hãy tạo các câu hỏi trắc nghiệm.');

      let promptText = `${fileContext}\n${userPrompt}\n\nYÊU CẦU: Tạo chính xác ${numQuestions} câu hỏi trắc nghiệm.

BẠN BẮT BUỘC PHẢI TRẢ VỀ KẾT QUẢ THEO ĐÚNG ĐỊNH DẠNG SAU CHO MỖI CÂU HỎI:
Câu [số]: [Nội dung câu hỏi]
A. [Đáp án A]
B. [Đáp án B]
C. [Đáp án C]
D. [Đáp án D]
Đáp án: [Chữ cái đáp án đúng - chỉ 1 chữ A, B, C hoặc D]
Giải thích: [Giải thích ngắn gọn]

LƯU Ý QUAN TRỌNG:
- Trả về dạng văn bản thuần túy, KHÔNG bọc trong markdown block.
- Phải có đủ 4 đáp án A, B, C, D cho mỗi câu.
- Nếu tài liệu có dạng READING (bài đọc), hãy tạo 1 block đoạn văn rồi đến các câu hỏi.`;

      setAiProgress('Đang gửi yêu cầu đến AI...');
      let textRes = '';

      // Check if we can use simple text prompt or need multimodal
      const useMultimodal = !optimizeTokens && hasFiles && aiQuizFiles.some(f => f.type === 'image');

      if (aiProvider === 'gemini') {
        const parts = [{ text: promptText }];
        
        if (useMultimodal) {
          aiQuizFiles.forEach(f => {
            if (f.type === 'image' && f.data) {
              const mimeType = f.data.split(';')[0].split(':')[1];
              const base64Data = f.data.split(',')[1];
              parts.push({
                inlineData: { mimeType, data: base64Data }
              });
            }
          });
        }

        setAiProgress('AI đang phân tích nội dung...');
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            generationConfig: { maxOutputTokens: 4096, temperature: 0.4 },
            contents: [{ parts: parts }]
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        textRes = data.candidates[0].content.parts[0].text;

      } else {
        const content = [{ type: 'text', text: promptText }];
        if (useMultimodal) {
          aiQuizFiles.forEach(f => {
            if (f.type === 'image' && f.data) {
              content.push({
                type: 'image_url',
                image_url: { url: f.data, detail: 'high' }
              });
            }
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
      textRes = textRes.replace(/```[a-z]*\n/gi, '').replace(/```/g, '').trim();

      const questions = parseQuizText(textRes);

      if (questions.length > 0) {
        if (activeQuizId) {
          // Append to existing quiz
          if (questions[0]?.id) {
            addedQuestionIdRef.current = questions[0].id;
          }
          const newQuizzes = quizzes.map(q => {
            if (q.id === activeQuizId) {
              return {
                ...q,
                questions: [...q.questions, ...questions],
                updatedAt: Date.now()
              };
            }
            return q;
          });
          setQuizzes(newQuizzes);
        } else {
          // Create new quiz
          const newQuiz = { id: uuidv4(), title: `Đề AI tạo (${questions.length} câu)`, questions, updatedAt: Date.now() };
          setQuizzes([newQuiz, ...quizzes]);
          setActiveQuizId(newQuiz.id);
        }
        setIsCreatingAiQuiz(false);
        setAiQuizFiles([]);
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
      const optionsText = Object.keys(questionObj.options)
        .map(key => `${key}. ${questionObj.options[key]}`)
        .join('\n');

      const prompt = `Bạn là giáo viên tiếng Anh. Chọn đáp án và giải thích câu trắc nghiệm sau thật NGẮN GỌN.

FORMAT BẮT BUỘC:
- Dòng 1: CHỈ ghi duy nhất 1 chữ cái đáp án đúng (A, B, C, D, E, hoặc F)
- Từ dòng 2 trở đi: Giải thích NGẮN GỌN trong 1 đoạn nhỏ.

CẤU TRÚC GIẢI THÍCH (TỐI ĐA 2-4 DÒNG):
✔ Tại sao chọn đáp án đó.
🧠 Từ vựng/Ngữ pháp mấu chốt.

QUY TẮC:
- Viết RẤT ngắn gọn, trực diện, khoảng 2-4 câu.
- KHÔNG lan man, KHÔNG lặp lại đề.
- Viết bằng tiếng Việt.

Câu hỏi: ${questionObj.question}
${optionsText}`;

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

  const handleUpdateReadingPassageProp = (passageId, prop, value) => {
    const newReadingPassages = activeQuiz.readingPassages.map(p => 
      p.id === passageId ? { ...p, [prop]: value } : p
    );
    setQuizzes(quizzes.map(q => q.id === activeQuizId ? { ...q, readingPassages: newReadingPassages } : q));
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
    let newUserAnswer = optionKey;
    
    if (q?.allowMultipleAnswers) {
      const currentAns = (q.userAnswer || '').split(',').filter(Boolean);
      if (currentAns.includes(optionKey)) {
        newUserAnswer = currentAns.filter(a => a !== optionKey).join(',');
      } else {
        newUserAnswer = [...currentAns, optionKey].sort().join(',');
      }
      
      if (q.answer && newUserAnswer === q.answer) {
        playFeedbackSound(true);
      }
    } else {
      if (q) {
        const isCorrect = optionKey === q.answer;
        playFeedbackSound(isCorrect);
      }
    }

    const newQuestions = activeQuiz.questions.map(q => 
      q.id === qId ? { ...q, userAnswer: newUserAnswer } : q
    );
    setQuizzes(quizzes.map(q => q.id === activeQuizId ? { ...q, questions: newQuestions } : q));
  };

  const handleToggleBookmark = (qId) => {
    const newQuestions = activeQuiz.questions.map(q => 
      q.id === qId ? { ...q, isStarred: !q.isStarred } : q
    );
    setQuizzes(quizzes.map(q => q.id === activeQuizId ? { ...q, questions: newQuestions } : q));
  };

  const handleCopyQuestionToClipboard = (q, index) => {
    const stripHtml = (html) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return doc.body.textContent || "";
    };

    const optionsText = Object.keys(q.options)
      .sort()
      .filter(key => q.options[key])
      .map(key => `${key}. ${q.options[key]}`)
      .join('\n');

    let textToCopy = `Câu ${index + 1}: ${q.question}\n${optionsText}`;
    if (q.answer) {
      textToCopy += `\nĐáp án: ${q.answer}`;
    }
    if (q.explanation) {
      const cleanExpl = q.explanation.includes('<') && q.explanation.includes('>') 
        ? stripHtml(q.explanation) 
        : q.explanation;
      textToCopy += `\nGiải thích: ${cleanExpl}`;
    }

    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedQuestionId(q.id);
      setTimeout(() => setCopiedQuestionId(null), 2000);
    }).catch(err => {
      console.error('Lỗi sao chép: ', err);
    });
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
- Trình bày dạng danh sách gạch đầu dòng bằng mã HTML (sử dụng các thẻ <ul>, <li>, <strong>, <br>...).
- Rất ngắn gọn, súc tích, dễ nhớ.
- Chỉ trả về nội dung tóm tắt định dạng HTML, không bọc trong markdown block (không dùng \`\`\`html), không giới thiệu.

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

  const questionsToRenderOriginal = isTesting && testMode === 'starred' && activeQuiz 
    ? activeQuiz.questions.filter(q => q.isStarred) 
    : (activeQuiz ? activeQuiz.questions : []);

  const questionsToRender = useMemo(() => {
    if (!isShuffled || !shuffledIds) return questionsToRenderOriginal;
    return [...questionsToRenderOriginal].sort((a,b) => {
      const idxA = shuffledIds.indexOf(a.id);
      const idxB = shuffledIds.indexOf(b.id);
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });
  }, [questionsToRenderOriginal, isShuffled, shuffledIds]);

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

  const filteredQuizzes = useMemo(() => {
    if (selectedFolderId === 'all') return quizzes;
    if (selectedFolderId === 'uncategorized') return quizzes.filter(q => !q.folderId);
    return quizzes.filter(q => q.folderId === selectedFolderId);
  }, [quizzes, selectedFolderId]);

  const folderCounts = useMemo(() => {
    const counts = {};
    quizzes.forEach(q => {
      if (q.folderId) {
        counts[q.folderId] = (counts[q.folderId] || 0) + 1;
      }
    });
    return counts;
  }, [quizzes]);

  const uncategorizedCount = useMemo(() => {
    return quizzes.filter(q => !q.folderId).length;
  }, [quizzes]);

  const showGrid = !activeQuizId && !isCreatingAiQuiz && !isImporting;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
         onMouseUp={(e) => handleTextSelection(e, null, null)}>
      {showGrid ? (
        /* ========== GRID VIEW ========== */
        <div className="split-view" style={{ flex: 1, minHeight: 0 }}>
          {/* Folders Sidebar */}
          <div className="list-pane" style={{
            background: 'rgba(11, 17, 32, 0.4)',
            borderRight: '1px solid rgba(var(--glass-rgb), 0.08)',
            padding: '16px',
            borderRadius: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div className="folder-sidebar-header">
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Folder size={18} style={{ color: '#22d3ee' }} />
                Thư mục
              </h3>
              <button
                onClick={() => setFolderActionModal({ type: 'create' })}
                style={{
                  background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '6px', transition: 'all 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.color = '#22d3ee'}
                onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}
                title="Tạo thư mục mới"
              >
                <FolderPlus size={16} />
              </button>
            </div>

            <div className="folder-list">
              <div 
                className={`folder-list-item ${selectedFolderId === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedFolderId('all')}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Folder size={16} />
                  Tất cả bộ đề
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{quizzes.length}</span>
              </div>

              <div 
                className={`folder-list-item ${selectedFolderId === 'uncategorized' ? 'active' : ''}`}
                onClick={() => setSelectedFolderId('uncategorized')}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Folder size={16} style={{ opacity: 0.7 }} />
                  Chưa phân loại
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{uncategorizedCount}</span>
              </div>

              {folders.length > 0 && <div style={{ height: '1px', background: 'rgba(var(--glass-rgb), 0.08)', margin: '4px 0' }} />}

              {folders.map(folder => (
                <div 
                  key={folder.id}
                  className={`folder-list-item ${selectedFolderId === folder.id ? 'active' : ''}`}
                  onClick={() => setSelectedFolderId(folder.id)}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={folder.name}>
                    <Folder size={16} style={{ color: selectedFolderId === folder.id ? '#22d3ee' : '#a78bfa' }} />
                    {folder.name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{folderCounts[folder.id] || 0}</span>
                    <div className="folder-item-actions" onClick={e => e.stopPropagation()}>
                      <button
                        className="folder-item-action-btn"
                        onClick={() => setFolderActionModal({ type: 'rename', id: folder.id, name: folder.name })}
                        title="Đổi tên"
                      >
                        <Edit3 size={11} />
                      </button>
                      <button
                        className="folder-item-action-btn"
                        onClick={() => handleDeleteFolder(folder.id)}
                        title="Xóa thư mục"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Main Quiz Area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', overflow: 'hidden' }}>
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
                    {selectedFolderId === 'all' ? 'Bộ đề trắc nghiệm' : 
                     selectedFolderId === 'uncategorized' ? 'Bộ đề chưa phân loại' : 
                     (folders.find(f => f.id === selectedFolderId)?.name || 'Bộ đề trắc nghiệm')}
                  </h2>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                    {filteredQuizzes.length} bộ đề · Chọn một bộ đề để bắt đầu ôn tập
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {isMerging ? (
                    <>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-orange)' }}>Đã chọn {selectedQuizzesToMerge.length} bộ đề</span>
                      <button
                        onClick={() => { setIsMerging(false); setSelectedQuizzesToMerge([]); }}
                        style={{
                          padding: '9px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                          border: '1px solid rgba(var(--glass-rgb),0.1)', cursor: 'pointer',
                          background: 'rgba(var(--glass-rgb),0.04)', color: 'var(--text-main)',
                          transition: 'all 0.2s'
                        }}
                      >
                        Hủy
                      </button>
                      <button
                        onClick={handleMergeQuizzes}
                        disabled={selectedQuizzesToMerge.length < 2}
                        style={{
                          padding: '9px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                          border: 'none', cursor: selectedQuizzesToMerge.length < 2 ? 'not-allowed' : 'pointer',
                          background: selectedQuizzesToMerge.length < 2 ? 'rgba(var(--glass-rgb),0.1)' : 'linear-gradient(135deg, #10b981, #34d399)',
                          color: selectedQuizzesToMerge.length < 2 ? 'var(--text-muted)' : 'white',
                          transition: 'all 0.2s',
                          boxShadow: selectedQuizzesToMerge.length < 2 ? 'none' : '0 4px 20px rgba(16,185,129,0.3)'
                        }}
                      >
                        Thực hiện gộp
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setIsMerging(true)}
                        style={{
                          padding: '9px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                          border: '1px solid rgba(var(--glass-rgb),0.1)', cursor: 'pointer',
                          background: 'rgba(var(--glass-rgb),0.04)', color: 'var(--text-main)',
                          display: 'flex', alignItems: 'center', gap: '6px',
                          transition: 'all 0.2s'
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>library_add</span>
                        Gộp đề
                      </button>
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
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Grid Body */}
            <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '20px' }}>
              {filteredQuizzes.length === 0 ? (
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
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)' }}>
                    {quizzes.length === 0 ? 'Chưa có bộ đề nào' : 'Thư mục trống'}
                  </h3>
                  <p style={{ fontSize: '14px', maxWidth: '360px', lineHeight: '1.6' }}>
                    {quizzes.length === 0 
                      ? 'Tạo đề bằng AI, nhập từ Word, hoặc tạo đề trống để bắt đầu ôn luyện.'
                      : 'Di chuyển bộ đề vào thư mục này hoặc tạo đề mới.'}
                  </p>
                </div>
              ) : (
                <div className="quiz-grid">
                  {filteredQuizzes.map((quiz, index) => {
                    const gradientIdx = index % cardGradients.length;
                    const starredCount = quiz.questions.filter(q => q.isStarred).length;
                    const answeredCount = quiz.questions.filter(q => q.userAnswer).length;
                    const hasAnswers = quiz.questions.some(q => q.answer);
                    const quizFolder = folders.find(f => f.id === quiz.folderId);

                    return (
                      <div
                        key={quiz.id}
                        className="quiz-card"
                        onClick={() => { 
                          if (isMerging) {
                            if (selectedQuizzesToMerge.includes(quiz.id)) {
                              setSelectedQuizzesToMerge(prev => prev.filter(id => id !== quiz.id));
                            } else {
                              setSelectedQuizzesToMerge(prev => [...prev, quiz.id]);
                            }
                          } else {
                            setActiveQuizId(quiz.id); setIsTesting(false); setIsImporting(false); setIsCreatingAiQuiz(false); setTestMode('all'); 
                          }
                        }}
                        style={{ 
                          background: cardGradients[gradientIdx],
                          border: isMerging && selectedQuizzesToMerge.includes(quiz.id) ? '2px solid var(--accent-green)' : 'none',
                          transform: isMerging && selectedQuizzesToMerge.includes(quiz.id) ? 'translateY(-2px)' : 'none',
                          boxShadow: isMerging && selectedQuizzesToMerge.includes(quiz.id) ? '0 8px 24px rgba(16, 185, 129, 0.2)' : 'none',
                          position: 'relative'
                        }}
                      >
                        <div className="quiz-card-accent" style={{ background: cardAccentColors[gradientIdx] }} />
                        
                        {!isMerging && (
                          <div className="quiz-card-menu-container" onClick={e => e.stopPropagation()}>
                            <button
                              className="quiz-card-menu-btn"
                              onClick={() => setActiveQuizCardMenu(activeQuizCardMenu === quiz.id ? null : quiz.id)}
                              title="Tùy chọn"
                            >
                              <MoreVertical size={14} />
                            </button>
                            
                            {activeQuizCardMenu === quiz.id && (
                              <div className="quiz-card-menu-dropdown">
                                <button
                                  className="quiz-card-menu-item"
                                  onClick={() => {
                                    setMoveQuizModal({ quizId: quiz.id, folderId: quiz.folderId || null });
                                    setActiveQuizCardMenu(null);
                                  }}
                                >
                                  <Folder size={14} style={{ color: '#22d3ee' }} />
                                  Di chuyển vào...
                                </button>
                                <button
                                  className="quiz-card-menu-item danger"
                                  onClick={(e) => {
                                    handleDeleteQuiz(e, quiz.id);
                                    setActiveQuizCardMenu(null);
                                  }}
                                >
                                  <Trash2 size={14} />
                                  Xóa bộ đề
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {isMerging && (
                          <div style={{ position: 'absolute', top: '12px', right: '12px', width: '22px', height: '22px', borderRadius: '50%', border: '2px solid', borderColor: selectedQuizzesToMerge.includes(quiz.id) ? 'var(--accent-green)' : 'rgba(var(--glass-rgb),0.3)', background: selectedQuizzesToMerge.includes(quiz.id) ? 'var(--accent-green)' : 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {selectedQuizzesToMerge.includes(quiz.id) && <CheckCircle size={14} color="white" />}
                          </div>
                        )}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <h3 className="quiz-card-title">{quiz.title}</h3>
                          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
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
                            {selectedFolderId === 'all' && quizFolder && (
                              <span className="folder-badge-tag">
                                <Folder size={10} />
                                {quizFolder.name}
                              </span>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  <input 
                    type="text" value={activeQuiz.title} 
                    onChange={(e) => setQuizzes(quizzes.map(q => q.id === activeQuizId ? { ...q, title: e.target.value } : q))}
                    style={{ 
                      fontSize: '22px', fontWeight: 800, border: 'none', background: 'transparent', 
                      padding: '0', boxShadow: 'none', color: 'var(--text-main)', flex: 1, minWidth: '100px', outline: 'none',
                      overflow: 'hidden', textOverflow: 'ellipsis'
                    }}
                  />
                  <div style={{ 
                    display: 'flex', alignItems: 'center', gap: '6px', 
                    background: 'rgba(var(--glass-rgb), 0.04)', padding: '6px 12px', 
                    borderRadius: '8px', border: '1px solid rgba(var(--glass-rgb), 0.08)',
                    flexShrink: 0
                  }}>
                    <Folder size={12} style={{ color: '#22d3ee' }} />
                    <select
                      value={activeQuiz.folderId || ''}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        setQuizzes(quizzes.map(q => q.id === activeQuizId ? { ...q, folderId: val, updatedAt: Date.now() } : q));
                      }}
                      style={{
                        background: 'transparent', border: 'none', color: 'var(--text-main)',
                        fontSize: '12px', fontWeight: 600, padding: 0, outline: 'none', cursor: 'pointer',
                        width: 'auto', maxWidth: '120px'
                      }}
                    >
                      <option value="" style={{ background: '#0b1120', color: 'var(--text-main)' }}>Chưa phân loại</option>
                      {folders.map(f => (
                        <option key={f.id} value={f.id} style={{ background: '#0b1120', color: 'var(--text-main)' }}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              {isCreatingAiQuiz && <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, whiteSpace: 'nowrap' }}>Tạo đề bằng AI</h2>}
              {isImporting && !importTargetQuizId && <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, whiteSpace: 'nowrap' }}>Nhập đề Word</h2>}
            </div>

            {activeQuiz && (
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0, whiteSpace: 'nowrap' }}>
                {isTesting && (
                  <button 
                    className={`btn ${isShuffled ? 'btn-primary' : ''}`}
                    onClick={() => {
                       if (isShuffled) {
                           setIsShuffled(false);
                           setShuffledIds(null);
                           setShuffledOptions(null);
                       } else {
                           setIsShuffled(true);
                           const targetQuestions = (isTesting && testMode === 'starred' && activeQuiz 
                               ? activeQuiz.questions.filter(q => q.isStarred) 
                               : activeQuiz.questions);
                           const qids = targetQuestions.map(q => q.id);
                           setShuffledIds(shuffleArray(qids));
                           
                           const sOpts = {};
                           targetQuestions.forEach(q => {
                             sOpts[q.id] = shuffleArray(Object.keys(q.options));
                           });
                           setShuffledOptions(sOpts);
                       }
                    }}
                    style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>shuffle</span> 
                    {isShuffled ? 'Bỏ trộn' : 'Xáo trộn'}
                  </button>
                )}
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
              <div className="glass-panel" style={{ padding: '28px', flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', position: 'relative', minHeight: 0 }}>
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
                      padding: aiQuizFiles.length > 0 ? '16px' : '36px', 
                      textAlign: 'center', cursor: 'pointer',
                      background: isDragging ? 'rgba(124,77,255,0.08)' : 'rgba(var(--glass-rgb),0.02)',
                      transition: 'all 0.3s ease',
                      transform: isDragging ? 'scale(1.01)' : 'scale(1)'
                    }}
                  >
                    <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple onChange={handleImageUpload} style={{ display: 'none' }} />
                    {aiQuizFiles.length > 0 ? (
                      <div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                          {aiQuizFiles.map((file, idx) => (
                            <div key={file.id} style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(var(--glass-rgb),0.1)', aspectRatio: '4/3', background: 'rgba(0,0,0,0.3)' }}>
                              {file.type === 'image' && file.data ? (
                                <img src={file.data} alt={`File ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                                  <FileText size={40} />
                                  <span style={{ fontSize: '12px', fontWeight: 'bold', marginTop: '4px' }}>PDF</span>
                                </div>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); handleRemoveImage(file.id); }} style={{ position: 'absolute', top: '6px', right: '6px', width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <X size={14} />
                              </button>
                              <div style={{ position: 'absolute', bottom: '6px', left: '6px', right: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ background: 'rgba(0,0,0,0.7)', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', color: 'white', fontWeight: 600 }}>
                                  {idx + 1}/{aiQuizFiles.length}
                                </div>
                                {file.isProcessing ? (
                                  <div style={{ background: 'var(--primary)', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', color: 'white', animation: 'pulse 1s infinite' }}>Parsing...</div>
                                ) : (
                                  file.extractedText && <div style={{ background: 'var(--accent-green)', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', color: 'white' }}>OCR OK</div>
                                )}
                              </div>
                            </div>
                          ))}
                          {aiQuizFiles.length < 5 && (
                            <div style={{ borderRadius: '10px', border: '2px dashed rgba(var(--glass-rgb),0.1)', aspectRatio: '4/3', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' }}>
                              <Upload size={18} color="var(--text-muted)" />
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Thêm tệp</span>
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', marginTop: '12px' }}>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'center', gap: '15px' }}>
                            <span><ImageIcon size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> Ảnh/PDF ({aiQuizFiles.length}/5)</span>
                            <span 
                              onClick={(e) => { e.stopPropagation(); setOptimizeTokens(!optimizeTokens); }}
                              style={{ color: optimizeTokens ? 'var(--accent-green)' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}
                            >
                              {optimizeTokens ? '✓ Tối ưu Token (OCR/PDF text)' : '○ Gửi tệp gốc (Tạm dừng tối ưu)'}
                            </span>
                          </div>
                          
                          {optimizeTokens && aiQuizFiles.some(f => f.extractedText) && (
                            <button
                              className="btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                const texts = aiQuizFiles.map(f => f.extractedText).filter(Boolean);
                                if (texts.length > 0) {
                                  const combined = texts.join('\n\n---\n\n');
                                  setAiQuizPrompt(prev => prev ? prev + '\n\n' + combined : combined);
                                }
                              }}
                              style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                              <FileText size={14} /> Chuyển Text đã trích xuất xuống ô Yêu cầu
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ width: '56px', height: '56px', borderRadius: '50%', margin: '0 auto', background: 'linear-gradient(135deg, rgba(124,77,255,0.15), rgba(0,227,253,0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
                          <Upload size={26} color="var(--primary)" />
                        </div>
                        <div>
                          <strong style={{ display: 'block', marginBottom: '6px', fontSize: '15px' }}>
                            {isDragging ? '📥 Thả tệp vào đây!' : 'Kéo thả hoặc bấm để tải Ảnh/PDF'}
                          </strong>
                          <span style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                            Hỗ trợ JPG, PNG, PDF · Tối đa 5 tệp<br />
                            <span style={{ fontSize: '12px', opacity: 0.7 }}>Sử dụng Tesseract OCR & PDF Parser để tối ưu hóa tokens</span>
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
                    {aiQuizFiles.length > 0 && `${aiQuizFiles.length} tệp đã chọn`}
                    {aiQuizFiles.length > 0 && aiQuizPrompt.trim() && ' · '}
                    {aiQuizPrompt.trim() && 'Có yêu cầu tùy chỉnh'}
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn" onClick={() => { setIsCreatingAiQuiz(false); setAiQuizFiles([]); setAiQuizPrompt(''); }}>Hủy</button>
                    <button 
                      className="btn btn-primary" onClick={handleGenerateAiQuiz}
                      disabled={aiLoading === 'generate_quiz' || (aiQuizFiles.length === 0 && !aiQuizPrompt.trim()) || aiQuizFiles.some(f => f.isProcessing)}
                      style={{ opacity: (aiLoading === 'generate_quiz' || (aiQuizFiles.length === 0 && !aiQuizPrompt.trim()) || aiQuizFiles.some(f => f.isProcessing)) ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', fontSize: '14px', fontWeight: 700, background: 'linear-gradient(135deg, #7c4dff, #536dfe)', boxShadow: '0 4px 20px rgba(124,77,255,0.4)' }}
                    >
                      <Sparkles size={16} /> Tạo Đề Ngay
                    </button>
                  </div>
                </div>

              </div>
            ) : isImporting ? (
              <div className="glass-panel" style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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
                                      {Object.keys(q.options).map(optKey => (
                                        <div key={optKey}>{optKey}. {q.options[optKey]}</div>
                                      ))}
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
                              {Object.keys(q.options).map(optKey => (
                                <div key={optKey}>{optKey}. {q.options[optKey]}</div>
                              ))}
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
                      <div style={{ flex: 1 }}></div>
                      <label style={{
                          padding: '7px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700,
                          border: '1px solid rgba(var(--glass-rgb),0.1)', cursor: 'pointer',
                          background: 'rgba(var(--glass-rgb),0.04)', color: 'var(--text-muted)',
                          display: 'flex', alignItems: 'center', gap: '6px'
                      }}>
                        <FileText size={14} />
                        Nhập từ file Word (.docx)
                        <input type="file" accept=".docx" style={{ display: 'none' }} onChange={handleWordUpload} />
                      </label>
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
                          <div style={{ marginTop: '8px' }}>
                            <TiptapEditor 
                              content={activeQuiz.keyTakeaways || ''}
                              onChange={content => setQuizzes(quizzes.map(q => q.id === activeQuizId ? { ...q, keyTakeaways: content } : q))}
                              placeholder="Ghi chú các điểm ngữ pháp, từ vựng cần lưu ý ở đề này. Hoặc bấm 'AI Tổng hợp' để tự động quét..."
                            />
                          </div>
                        ) : (
                          <div style={{ color: 'var(--text-main)', lineHeight: '1.7', background: 'rgba(var(--glass-rgb),0.03)', borderRadius: '8px', padding: '16px', border: '1px dashed rgba(255,152,0, 0.3)', fontSize: '14px' }}>
                            {activeQuiz.keyTakeaways ? (
                              /<[a-z][\s\S]*>/i.test(activeQuiz.keyTakeaways) ? (
                                <TiptapEditor content={activeQuiz.keyTakeaways} readOnly={true} onChange={() => {}} />
                              ) : (
                                <div style={{ whiteSpace: 'pre-wrap' }}>{activeQuiz.keyTakeaways}</div>
                              )
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>Chưa có tổng hợp kiến thức. Bấm Quay về sửa đề để thêm.</span>
                            )}
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
                      onMouseUp={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
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
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Languages size={12} /> Dịch từ
                        </div>
                        <button 
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleSpeak(translationPopup.text)}
                          style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
                          title="Phát âm"
                        >
                          <Volume2 size={14} />
                        </button>
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'white', marginBottom: '10px', lineHeight: '1.4' }}>
                        "{translationPopup.text}"
                      </div>

                      {/* Translation result */}
                      {(isTranslating || translatedText) && (
                        <>
                          <div style={{
                            background: 'rgba(124,77,255,0.08)', borderRadius: '8px', padding: '10px 12px',
                            border: '1px solid rgba(124,77,255,0.15)', marginBottom: '10px',
                            minHeight: '32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                          }}>
                            {isTranslating ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
                                <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid rgba(124,77,255,0.3)', borderTop: '2px solid #7c4dff', animation: 'spin 0.8s linear infinite' }} />
                                Đang dịch...
                              </div>
                            ) : (
                              <>
                                <span style={{ color: '#a78bfa', fontWeight: 600, fontSize: '14px' }}>
                                  {translatedText}
                                </span>
                                <button 
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => handleSpeak(translatedText)}
                                  style={{ background: 'none', border: 'none', color: '#a78bfa', opacity: 0.6, cursor: 'pointer' }}
                                  title="Phát âm nghĩa"
                                >
                                  <Volume2 size={12} />
                                </button>
                              </>
                            )}
                          </div>

                          {translatedText && !isTranslating && (
                            <div style={{ marginBottom: '12px' }}>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase' }}>Chọn bộ thẻ:</div>
                              <select 
                                value={targetDeckId}
                                onChange={(e) => setTargetDeckId(e.target.value)}
                                style={{
                                  width: '100%', background: 'rgba(255,255,255,0.05)', color: 'white',
                                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px',
                                  padding: '4px 8px', fontSize: '12px', outline: 'none'
                                }}
                              >
                                <option value="">-- Mặc định (Từ vựng mới) --</option>
                                {decks.map(deck => (
                                  <option key={deck.id} value={deck.id}>{deck.title}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </>
                      )}

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { setTranslationPopup(null); setTranslatedText(''); setSaveSuccess(false); setEnrichedData(null); }}
                          style={{
                            padding: '6px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 600,
                            background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.1)',
                            cursor: 'pointer', transition: 'all 0.15s'
                          }}
                        >Đóng</button>
                        
                        {!translatedText && !isTranslating && !isAiEnrichingPopup && (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => translateText(translationPopup.text)}
                              style={{
                                padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                                background: 'rgba(255,255,255,0.05)',
                                color: 'white', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '4px'
                              }}
                            >
                              <Languages size={12} /> Dịch
                            </button>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={handleAiEnrichForPopup}
                              style={{
                                padding: '6px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                                background: 'linear-gradient(135deg, #7c4dff, #536dfe)',
                                color: 'white', border: 'none', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '4px',
                                boxShadow: '0 2px 8px rgba(124,77,255,0.3)'
                              }}
                            >
                              <Sparkles size={12} /> AI Phân tích
                            </button>
                          </div>
                        )}

                        {isAiEnrichingPopup && (
                          <button disabled style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, background: 'rgba(124,77,255,0.2)', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', border: '2px solid white', borderTop: '2px solid transparent', animation: 'spin 0.6s linear infinite' }} />
                            AI đang học...
                          </button>
                        )}

                        {translatedText && !isTranslating && !isAiEnrichingPopup && (
                          <>
                            {!enrichedData && (
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={handleAiEnrichForPopup}
                                title="Hoàn thiện thông tin bằng AI"
                                style={{
                                  padding: '6px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                                  background: 'rgba(124,77,255,0.1)', color: '#d8ccff', border: '1px solid rgba(124,77,255,0.2)',
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                                }}
                              >
                                <Sparkles size={12} /> Nâng cấp nội dung
                              </button>
                            )}
                            
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={handleSaveToLibrary}
                              disabled={isSavingToDeck}
                              style={{
                                padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                                background: saveSuccess ? 'var(--accent-green)' : (enrichedData ? 'var(--primary)' : 'rgba(var(--glass-rgb),0.1)'),
                                color: 'white', border: '1px solid rgba(var(--glass-rgb),0.2)', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.3s'
                              }}
                            >
                              {isSavingToDeck ? (
                                <div style={{ width: '12px', height: '12px', borderRadius: '50%', border: '2px solid white', borderTop: '2px solid transparent', animation: 'spin 0.6s linear infinite' }} />
                              ) : saveSuccess ? (
                                <CheckCircle size={12} />
                              ) : (
                                <Save size={12} />
                              )}
                              {saveSuccess ? 'Đã lưu' : (enrichedData ? 'Lưu thẻ đầy đủ' : 'Lưu thẻ')}
                            </button>

                            {translationPopup.questionId && translationPopup.field && (
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={handleInsertTranslation}
                              style={{
                                padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                                background: 'linear-gradient(135deg, #7c4dff, #536dfe)',
                                color: 'white', border: 'none', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '4px',
                                boxShadow: '0 2px 8px rgba(124,77,255,0.3)'
                              }}
                            >
                              <Sparkles size={12} /> Chèn
                            </button>
                            )}
                          </>
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

                      if (isTesting && q.readingGroupId) {
                        if (!showReadingGroupHeader || !passageObj) {
                          return null;
                        }

                        const groupQuestions = questionsForDisplay.filter(item => item.readingGroupId === passageObj.id);

                        return (
                          <div key={`reading-test-group-${passageObj.id}`} className="glass-panel" style={{ padding: '14px', marginBottom: '14px', border: '1px solid rgba(6,182,212,0.35)' }}>
                            <div style={{ fontSize: '12px', fontWeight: 800, color: '#8eefff', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              Reading Block
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(360px, 1.2fr)', gap: '12px', alignItems: 'start' }}>
                              <div style={{
                                whiteSpace: 'pre-wrap',
                                lineHeight: '1.72',
                                fontSize: '14px',
                                background: 'rgba(15,23,42,0.28)',
                                border: '1px solid rgba(148,163,184,0.2)',
                                borderRadius: '10px',
                                padding: '12px'
                              }}>
                                {renderPassageWithBlankHighlights(passageObj.content || '', isSameSelectedGroup ? activeReadingBlankNumber : null)}
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {groupQuestions.map(item => {
                                  const itemIndex = questionsForDisplay.findIndex(x => x.id === item.id);
                                  const answerRevealed = !!item.userAnswer;
                                  const displayQuestionText = item._questionOnly || item.question;
                                  const blankNotFoundInPassage = item.blankNumber
                                    && !(readingPassageMap.get(item.readingGroupId)?.blankNumbers || []).some(n => String(n) === String(item.blankNumber));

                                  return (
                                    <div key={`reading-inline-card-${item.id}`} id={`question-card-${item.id}`} style={{
                                      borderRadius: '10px',
                                      border: '1px solid rgba(148,163,184,0.22)',
                                      background: 'rgba(2,6,23,0.25)',
                                      padding: '10px 12px'
                                    }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                                        <div style={{ fontSize: '14px', fontWeight: 600, lineHeight: '1.45' }}>
                                          Câu {itemIndex + 1}{item.blankNumber ? ` (${item.blankNumber})` : ''}: {renderQuizText(displayQuestionText, answerRevealed)}
                                          {item.allowMultipleAnswers && (
                                            <span style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(234,179,8,0.15)', color: '#facc15', border: '1px solid rgba(234,179,8,0.3)', fontWeight: 'normal', display: 'inline-block', verticalAlign: 'middle', marginTop: '-2px' }}>
                                              Đây là câu chọn nhiều đáp án
                                            </span>
                                          )}
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                                          <button
                                            onClick={() => handleCopyQuestionToClipboard(item, itemIndex)}
                                            title={copiedQuestionId === item.id ? "Đã sao chép!" : "Sao chép câu hỏi này"}
                                            style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: copiedQuestionId === item.id ? 'var(--accent-green)' : 'var(--text-muted)', display: 'flex' }}
                                          >
                                            {copiedQuestionId === item.id ? (
                                              <CheckCircle size={15} color="var(--accent-green)" />
                                            ) : (
                                              <Copy size={15} />
                                            )}
                                          </button>
                                          <button
                                            onClick={() => {
                                              setSelectedReadingQuestionId(item.id);
                                              handleToggleBookmark(item.id);
                                            }}
                                            title={item.isStarred ? 'Bỏ đánh dấu' : 'Đánh dấu câu hỏi này'}
                                            style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: item.isStarred ? '#fbbf24' : 'var(--text-muted)', display: 'flex' }}
                                          >
                                            <Star size={16} fill={item.isStarred ? '#fbbf24' : 'none'} color={item.isStarred ? '#fbbf24' : 'currentColor'} />
                                          </button>
                                        </div>
                                      </div>

                                      {blankNotFoundInPassage && (
                                        <div style={{ marginBottom: '8px', fontSize: '11px', color: '#facc15', background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.35)', borderRadius: '8px', padding: '4px 8px' }}>
                                          ⚠ Blank {item.blankNumber} chưa có trong passage.
                                        </div>
                                      )}

                                      <div style={{ display: 'grid', gridTemplateColumns: Object.values(item.options).some(o => o && o.length > 50) ? '1fr' : 'repeat(auto-fit, minmax(250px, 1fr))', gap: '8px' }}>
                                        {(isShuffled && shuffledOptions?.[item.id] ? shuffledOptions[item.id] : Object.keys(item.options).sort()).map((opt, idx) => {
                                          const displayLetter = ['A', 'B', 'C', 'D', 'E', 'F'][idx] || opt;
                                          return (
                                          <div
                                            key={`${item.id}-${opt}`}
                                            onClick={() => handleSelectAnswer(item.id, opt)}
                                            style={{
                                              padding: '8px',
                                              borderRadius: '8px',
                                              border: '1px solid var(--border-color)',
                                              background: item.userAnswer === opt
                                                ? (item.answer && item.userAnswer !== item.answer ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)')
                                                : 'transparent',
                                              cursor: 'pointer',
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '6px',
                                              fontSize: '13px'
                                            }}
                                          >
                                            <strong>{isTesting ? displayLetter : opt}.</strong>
                                            <span>{renderQuizText(item.options[opt], answerRevealed)}</span>
                                            {item.answer && item.userAnswer === opt && opt === item.answer && <CheckCircle size={14} color="var(--accent-green)"/>}
                                            {item.answer && item.userAnswer === opt && opt !== item.answer && <XCircle size={14} color="var(--accent-red)"/>}
                                          </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      }

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
                      <div key={q.id} id={`question-card-${q.id}`} className="glass-panel" style={{ padding: '20px', marginBottom: '16px' }}>
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
                              <span onMouseUp={(e) => {
                                if (!(isTesting && q.readingGroupId)) {
                                  handleTextSelection(e, q.id, 'question');
                                }
                              }}>
                                Câu {i + 1}{q.readingGroupId && q.blankNumber ? ` (${q.blankNumber})` : ''}: {renderQuizText(displayQuestionText, answerRevealed)}
                                {isTesting && q.allowMultipleAnswers && (
                                  <span style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(234,179,8,0.15)', color: '#facc15', border: '1px solid rgba(234,179,8,0.3)', fontWeight: 'normal', display: 'inline-block', verticalAlign: 'middle', marginTop: '-2px' }}>
                                    Đây là câu chọn nhiều đáp án
                                  </span>
                                )}
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
                              onClick={() => handleCopyQuestionToClipboard(q, i)}
                              title={copiedQuestionId === q.id ? "Đã sao chép!" : "Sao chép câu hỏi này"}
                              style={{ padding: '8px', background: copiedQuestionId === q.id ? 'rgba(16, 185, 129, 0.1)' : 'transparent', border: 'none', cursor: 'pointer', color: copiedQuestionId === q.id ? 'var(--accent-green)' : 'var(--text-muted)', borderRadius: '8px', transition: 'all 0.2s', display: 'flex' }}
                            >
                              {copiedQuestionId === q.id ? (
                                <CheckCircle size={18} color="var(--accent-green)" />
                              ) : (
                                <Copy size={18} />
                              )}
                            </button>
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
                        
                        <div style={{ display: 'grid', gridTemplateColumns: Object.values(q.options).some(o => o && o.length > 50) ? '1fr' : 'repeat(auto-fit, minmax(250px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                          {(isShuffled && shuffledOptions?.[q.id] ? shuffledOptions[q.id] : Object.keys(q.options).sort()).map((opt, idx) => {
                            const displayLetter = ['A', 'B', 'C', 'D', 'E', 'F'][idx] || opt;
                            const isSelected = q.allowMultipleAnswers ? (q.userAnswer || '').split(',').includes(opt) : q.userAnswer === opt;
                            const isCorrectOption = q.allowMultipleAnswers ? (q.answer || '').split(',').includes(opt) : q.answer === opt;
                            
                            let bgColor = 'transparent';
                            if (isTesting) {
                              if (isSelected) {
                                bgColor = (q.answer && !isCorrectOption) ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)';
                              }
                            } else {
                              if (isCorrectOption) bgColor = 'rgba(16, 185, 129, 0.2)';
                            }

                            return (
                            <div 
                              key={opt} onClick={() => isTesting && handleSelectAnswer(q.id, opt)}
                              style={{ 
                                padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)',
                                background: bgColor,
                                cursor: isTesting ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '8px'
                              }}
                            >
                              <strong>{isTesting ? displayLetter : opt}.</strong> 
                              {!isTesting ? (
                                <input type="text" value={q.options[opt]} onChange={(e) => handleUpdateOptionProp(q.id, opt, e.target.value)}
                                  onMouseUp={(e) => handleTextSelection(e, q.id, `option_${opt}`)}
                                  style={{ flex: 1, marginLeft: '4px', background: 'transparent', color: 'var(--text-main)', border: 'none', borderBottom: '1px dashed var(--border-color)', padding: '4px', fontSize: '14px', outline: 'none' }}
                                />
                              ) : (
                                <span onMouseUp={(e) => {
                                  e.stopPropagation();
                                  if (!(isTesting && q.readingGroupId)) {
                                    handleTextSelection(e, q.id, `option_${opt}`);
                                  }
                                }}>
                                  {' '}{renderQuizText(q.options[opt], answerRevealed)}
                                </span>
                              )}
                              {isTesting && q.answer && isSelected && isCorrectOption && <CheckCircle size={16} color="var(--accent-green)"/>}
                              {isTesting && q.answer && isSelected && !isCorrectOption && <XCircle size={16} color="var(--accent-red)"/>}
                            </div>
                            );
                          })}
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
                                  <label style={{display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-main)', cursor: 'pointer', background: 'rgba(var(--glass-rgb),0.05)', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)'}}>
                                    <input type="checkbox" checked={!!q.allowMultipleAnswers} onChange={(e) => {
                                      handleUpdateQuestionProp(q.id, 'allowMultipleAnswers', e.target.checked);
                                      if (!e.target.checked && (q.answer || '').includes(',')) {
                                        handleUpdateQuestionProp(q.id, 'answer', q.answer.split(',')[0]);
                                      }
                                    }} />
                                    Nhiều đáp án
                                  </label>

                                  {q.allowMultipleAnswers ? (
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                      {Object.keys(q.options).sort().map(optKey => {
                                        const isSelected = (q.answer || '').split(',').includes(optKey);
                                        return (
                                          <button
                                            key={optKey}
                                            onClick={() => {
                                              const currentAns = (q.answer || '').split(',').filter(Boolean);
                                              if (isSelected) {
                                                handleUpdateQuestionProp(q.id, 'answer', currentAns.filter(a => a !== optKey).join(','));
                                              } else {
                                                handleUpdateQuestionProp(q.id, 'answer', [...currentAns, optKey].sort().join(','));
                                              }
                                            }}
                                            style={{
                                              padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--border-color)',
                                              background: isSelected ? 'var(--primary)' : 'var(--bg-secondary)',
                                              color: isSelected ? 'var(--on-primary)' : 'var(--text-main)',
                                              cursor: 'pointer', fontWeight: 600
                                            }}
                                          >
                                            {optKey}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <select
                                      value={q.answer || ''}
                                      onChange={e => handleUpdateQuestionProp(q.id, 'answer', e.target.value)}
                                      style={{ background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '6px' }}
                                    >
                                      <option value="">-- Đáp án đúng --</option>
                                      {Object.keys(q.options).sort().map(optKey => (
                                        <option key={optKey} value={optKey}>{optKey}</option>
                                      ))}
                                    </select>
                                  )}
                                  <button className="btn" style={{ color: 'var(--accent-orange)', padding: '6px 12px' }} onClick={() => handleCallAI(q.id, q)} disabled={aiLoading === q.id}>
                                    {aiLoading === q.id ? 'Đang hỏi AI...' : <><Sparkles size={16}/> {q.answer ? 'Hỏi lại AI' : 'Hỏi AI Đáp Án & Giải Thích'}</>}
                                  </button>
                                </div>
                                <div style={{ marginTop: '8px' }}>
                                  <TiptapEditor
                                    variant="mini"
                                    title="Giải thích"
                                    content={q.explanation || ''}
                                    onChange={html => handleUpdateQuestionProp(q.id, 'explanation', html)}
                                  />
                                </div>
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
                                  Object.keys(q.options).forEach(opt => {
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
                                  <div style={{ color: 'var(--text-muted)', whiteSpace: /<[a-z][\s\S]*>/i.test(q.explanation) ? 'normal' : 'pre-wrap', lineHeight: '1.7', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '12px', border: '1px solid rgba(255,255,255,0.06)', fontSize: '13.5px' }}>
                                    <strong style={{ color: 'var(--accent-orange)', display: 'block', marginBottom: '8px' }}>📝 Giải thích:</strong>
                                    {/<[a-z][\s\S]*>/i.test(q.explanation) ? (
                                      <TiptapEditor content={q.explanation} readOnly={true} onChange={() => {}} />
                                    ) : (
                                      <div>{q.explanation}</div>
                                    )}
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
                          const newId = uuidv4();
                          const newQuestion = {
                            id: newId,
                            question: '',
                            options: { A: '', B: '', C: '', D: '' },
                            answer: '',
                            explanation: '',
                            userAnswer: null,
                            isStarred: false,
                          };
                          addedQuestionIdRef.current = newId;
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
                      <button 
                        onClick={() => {
                          setIsCreatingAiQuiz(true);
                        }}
                        style={{
                          padding: '10px 18px', borderRadius: '10px', fontSize: '14px', fontWeight: 700,
                          background: 'linear-gradient(135deg, #7c4dff, #536dfe)', color: 'white', border: 'none',
                          cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px',
                          boxShadow: '0 4px 15px rgba(124,77,255,0.3)'
                        }}
                      >
                        <Zap size={18} fill="white" /> Tạo câu bằng AI
                      </button>
                    </div>

                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Folder Create/Rename Modal */}
      {folderActionModal && (
        <div className="custom-modal-overlay">
          <div className="custom-modal-content">
            <div className="custom-modal-header">
              <h3 className="custom-modal-title">
                {folderActionModal.type === 'create' ? 'Tạo thư mục mới' : 'Đổi tên thư mục'}
              </h3>
              <button className="custom-modal-close-btn" onClick={() => setFolderActionModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="custom-modal-body">
              <input 
                type="text" 
                placeholder="Tên thư mục..." 
                defaultValue={folderActionModal.name || ''}
                id="folder-name-input"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = e.currentTarget.value;
                    if (folderActionModal.type === 'create') {
                      handleCreateFolder(val);
                    } else {
                      handleRenameFolder(folderActionModal.id, val);
                    }
                  }
                }}
                style={{
                  background: 'rgba(0, 0, 0, 0.25)',
                  border: '1px solid rgba(var(--glass-rgb), 0.15)',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  color: 'white',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div className="custom-modal-footer">
              <button 
                onClick={() => setFolderActionModal(null)}
                style={{
                  padding: '9px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                  border: '1px solid rgba(var(--glass-rgb), 0.1)', cursor: 'pointer',
                  background: 'rgba(var(--glass-rgb), 0.04)', color: 'var(--text-muted)',
                  transition: 'all 0.2s'
                }}
              >
                Hủy
              </button>
              <button 
                onClick={() => {
                  const val = document.getElementById('folder-name-input')?.value || '';
                  if (folderActionModal.type === 'create') {
                    handleCreateFolder(val);
                  } else {
                    handleRenameFolder(folderActionModal.id, val);
                  }
                }}
                style={{
                  padding: '9px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                  border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #22d3ee, #00e3fd)', color: '#001018',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 15px rgba(34,211,238,0.2)'
                }}
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Quiz Modal */}
      {moveQuizModal && (
        <div className="custom-modal-overlay">
          <div className="custom-modal-content">
            <div className="custom-modal-header">
              <h3 className="custom-modal-title">Di chuyển bộ đề vào thư mục</h3>
              <button className="custom-modal-close-btn" onClick={() => setMoveQuizModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="custom-modal-body" style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
              <label 
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px',
                  background: moveQuizModal.folderId === null ? 'rgba(var(--glass-rgb), 0.08)' : 'transparent',
                  border: '1px solid',
                  borderColor: moveQuizModal.folderId === null ? 'rgba(34,211,238,0.3)' : 'rgba(var(--glass-rgb), 0.06)',
                  cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                <input 
                  type="radio" 
                  name="move-target-folder" 
                  checked={moveQuizModal.folderId === null}
                  onChange={() => setMoveQuizModal(prev => ({ ...prev, folderId: null }))}
                  style={{ width: 'auto', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '13.5px', color: 'white' }}>Chưa phân loại (Thư mục gốc)</span>
              </label>

              {folders.map(f => (
                <label 
                  key={f.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px',
                    background: moveQuizModal.folderId === f.id ? 'rgba(var(--glass-rgb), 0.08)' : 'transparent',
                    border: '1px solid',
                    borderColor: moveQuizModal.folderId === f.id ? 'rgba(34,211,238,0.3)' : 'rgba(var(--glass-rgb), 0.06)',
                    cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  <input 
                    type="radio" 
                    name="move-target-folder" 
                    checked={moveQuizModal.folderId === f.id}
                    onChange={() => setMoveQuizModal(prev => ({ ...prev, folderId: f.id }))}
                    style={{ width: 'auto', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '13.5px', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                </label>
              ))}
            </div>
            <div className="custom-modal-footer">
              <button 
                onClick={() => setMoveQuizModal(null)}
                style={{
                  padding: '9px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                  border: '1px solid rgba(var(--glass-rgb), 0.1)', cursor: 'pointer',
                  background: 'rgba(var(--glass-rgb), 0.04)', color: 'var(--text-muted)',
                  transition: 'all 0.2s'
                }}
              >
                Hủy
              </button>
              <button 
                onClick={() => handleMoveQuiz(moveQuizModal.quizId, moveQuizModal.folderId)}
                style={{
                  padding: '9px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                  border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #22d3ee, #00e3fd)', color: '#001018',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 15px rgba(34,211,238,0.2)'
                }}
              >
                Di chuyển
              </button>
            </div>
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
