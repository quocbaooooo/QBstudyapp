import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useFirestore } from '../hooks/useFirestore';
import { Key, Sparkles, Upload, Play, CheckCircle, XCircle, Trash2, Star, Lightbulb, ChevronDown, ChevronUp, X, Image as ImageIcon, FileText, Zap, ArrowLeft, Clock, BookOpen, MoreVertical, Languages, File, Volume2, Save, Copy, Folder, FolderPlus, Edit3, Plus, Share2, Headphones, Music, Eye, EyeOff } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { exportQuizToWord } from '../utils/exportWord';
import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import TiptapEditor from './TiptapEditor';
import * as mammoth from 'mammoth';
import { doc, getDoc, collection, addDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/useAuth';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

import TOEICAudioPlayer from './quizzes/TOEICAudioPlayer';
import ResizableSplitPanel from './quizzes/ResizableSplitPanel';
import TOEICListeningBlock from './quizzes/TOEICListeningBlock';
import TOEICReadingBlock from './quizzes/TOEICReadingBlock';

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

export default function QuizzesView({ modeFilter = 'all' }) {
  const { user } = useAuth();
  const [quizzes, setQuizzes, quizSyncState, saveQuizzesToCloud, hasUnsavedQuizChanges] = useFirestore('quizzes', 'study_quizzes', [DEMO_QUIZ]);
  const [folders, setFolders] = useFirestore('quiz_folders', 'study_quiz_folders', []);
  const [selectedFolderId, setSelectedFolderId] = useState('all');
  const [folderActionModal, setFolderActionModal] = useState(null); // { type: 'create' | 'rename', id?: string, name?: string }
  const [moveQuizModal, setMoveQuizModal] = useState(null); // { quizId: string, folderId: string | null }
  const [activeQuizCardMenu, setActiveQuizCardMenu] = useState(null); // quizId of currently open card dropdown menu

  const cardAccentColors = [
    '#7c4dff', '#00e3fd', '#10b981', '#fbbf24', '#f472b6', '#a855f7'
  ];

  const filteredQuizzes = useMemo(() => {
    let list = quizzes;
    if (modeFilter === 'toeic') {
      list = quizzes.filter(q => (q.listeningPassages && q.listeningPassages.length > 0)
        || (q.readingPassages && q.readingPassages.length > 0)
        || /toeic|listening|reading|part/i.test(q.title || ''));
    } else if (modeFilter === 'general') {
      list = quizzes.filter(q => !(q.listeningPassages && q.listeningPassages.length > 0)
        && !(q.readingPassages && q.readingPassages.length > 0)
        && !/toeic|listening|reading/i.test(q.title || ''));
    }

    if (selectedFolderId === 'all') return list;
    if (selectedFolderId === 'uncategorized') return list.filter(q => !q.folderId);
    return list.filter(q => q.folderId === selectedFolderId);
  }, [quizzes, selectedFolderId, modeFilter]);
  
  // Sharing states
  const [shareQuizModal, setShareQuizModal] = useState(null); // { quiz: Object, link: string, isGenerating: boolean, error: string }
  const [importSharedQuizModal, setImportSharedQuizModal] = useState(null); // { quiz: Object }
  const [isFetchingSharedQuiz, setIsFetchingSharedQuiz] = useState(false);
  const jsonFileInputRef = useRef(null);

  // Handle sharing a quiz
  const handleShareQuiz = async (quiz) => {
    setShareQuizModal({
      quiz,
      link: '',
      isGenerating: true,
      error: ''
    });

    if (!user) {
      setShareQuizModal(prev => ({
        ...prev,
        isGenerating: false,
        error: 'Bạn cần đăng nhập bằng Google hoặc Email để sử dụng tính năng tạo liên kết chia sẻ trực tuyến.'
      }));
      return;
    }

    try {
      // Create shared quiz document in Firestore
      const sharedData = {
        title: quiz.title,
        questions: quiz.questions || [],
        readingPassages: quiz.readingPassages || [],
        sharedBy: user.displayName || user.email || 'Người dùng QBStudy',
        sharedByUid: user.uid,
        createdAt: Date.now()
      };

      const docRef = await addDoc(collection(db, 'shared_quizzes'), sharedData);
      const shareUrl = `${window.location.origin}${window.location.pathname}?share=${docRef.id}`;
      
      setShareQuizModal(prev => ({
        ...prev,
        isGenerating: false,
        link: shareUrl
      }));
    } catch (err) {
      console.error('Error sharing quiz:', err);
      setShareQuizModal(prev => ({
        ...prev,
        isGenerating: false,
        error: 'Không thể tạo liên kết chia sẻ: ' + err.message
      }));
    }
  };

  // Download quiz as JSON file
  const handleDownloadJson = (quiz) => {
    try {
      const exportData = {
        title: quiz.title,
        questions: quiz.questions || [],
        readingPassages: quiz.readingPassages || [],
        exportedAt: Date.now(),
        type: 'qbstudy_quiz'
      };

      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      // Clean special characters from filename
      const cleanTitle = quiz.title.replace(/[^a-zA-Z0-9\sÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂÂĐỔỞỚỜỞỨỪỬỮỰỲÝỴỶỸửữựỳýỵỷỹ]/g, '').trim();
      a.download = `${cleanTitle || 'bo-de-trac-nghiem'}.json`;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Không thể xuất file JSON: ' + err.message);
    }
  };

  // Import quiz from JSON file
  const handleJsonImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        
        // Validation
        if (!parsed || typeof parsed !== 'object' || !parsed.title || !Array.isArray(parsed.questions)) {
          alert('File JSON không hợp lệ hoặc thiếu cấu trúc bộ đề QBStudy.');
          return;
        }

        // Deep clone questions & reading passages and generate new UUIDs to prevent conflicts
        const oldPassages = parsed.readingPassages || [];
        const passageIdMap = {};
        const newPassages = oldPassages.map(p => {
          const newId = uuidv4();
          passageIdMap[p.id] = newId;
          return { ...p, id: newId };
        });

        const newQuestions = parsed.questions.map(q => {
          const newId = uuidv4();
          let readingGroupId = q.readingGroupId || null;
          if (readingGroupId && passageIdMap[readingGroupId]) {
            readingGroupId = passageIdMap[readingGroupId];
          }
          return {
            ...q,
            id: newId,
            readingGroupId,
            userAnswer: null // reset user answers
          };
        });

        const newQuiz = {
          id: uuidv4(),
          title: `${parsed.title} (Nhập từ file)`,
          questions: newQuestions,
          readingPassages: newPassages,
          updatedAt: Date.now()
        };

        setQuizzes(prev => [newQuiz, ...prev]);
        setActiveQuizId(newQuiz.id);
        setIsImporting(false);
        alert(`Nhập thành công bộ đề: "${newQuiz.title}" với ${newQuestions.length} câu hỏi!`);
      } catch (err) {
        alert('Lỗi đọc file JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  // Check for shared quiz ID in URL query parameters on mount
  useEffect(() => {
    const fetchSharedQuiz = async () => {
      const params = new URLSearchParams(window.location.search);
      const shareId = params.get('share');
      if (!shareId) return;

      setIsFetchingSharedQuiz(true);
      try {
        const docRef = doc(db, 'shared_quizzes', shareId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const sharedData = docSnap.data();
          setImportSharedQuizModal({
            ...sharedData,
            id: shareId // Keep original share document ID for reference
          });
        } else {
          alert('Liên kết chia sẻ không tồn tại hoặc đã bị xóa.');
          // Remove parameter from URL
          const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
          window.history.pushState({ path: newUrl }, '', newUrl);
        }
      } catch (err) {
        console.error('Error fetching shared quiz:', err);
        alert('Có lỗi xảy ra khi tải bộ trắc nghiệm chia sẻ: ' + err.message);
      } finally {
        setIsFetchingSharedQuiz(false);
      }
    };

    fetchSharedQuiz();
  }, []);

  const cleanShareUrl = () => {
    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.pushState({ path: newUrl }, '', newUrl);
  };

  const handlePracticeSharedQuiz = () => {
    if (!importSharedQuizModal) return;
    
    // We create a temporary quiz object
    const tempQuiz = {
      id: `shared_temp_${importSharedQuizModal.id}`,
      title: `${importSharedQuizModal.title} (Bản xem trước)`,
      questions: importSharedQuizModal.questions.map(q => ({
        ...q,
        id: q.id || uuidv4(),
        userAnswer: null
      })),
      readingPassages: importSharedQuizModal.readingPassages || [],
      updatedAt: Date.now(),
      isTemporary: true
    };

    setQuizzes(prev => [tempQuiz, ...prev]);
    setActiveQuizId(tempQuiz.id);
    setIsTesting(true);
    setImportSharedQuizModal(null);
    cleanShareUrl();
  };

  const handleConfirmSharedQuizImport = () => {
    if (!importSharedQuizModal) return;

    // Deep clone and generate new UUIDs
    const oldPassages = importSharedQuizModal.readingPassages || [];
    const passageIdMap = {};
    const newPassages = oldPassages.map(p => {
      const newId = uuidv4();
      passageIdMap[p.id] = newId;
      return { ...p, id: newId };
    });

    const newQuestions = importSharedQuizModal.questions.map(q => {
      const newId = uuidv4();
      let readingGroupId = q.readingGroupId || null;
      if (readingGroupId && passageIdMap[readingGroupId]) {
        readingGroupId = passageIdMap[readingGroupId];
      }
      return {
        ...q,
        id: newId,
        readingGroupId,
        userAnswer: null
      };
    });

    const newQuiz = {
      id: uuidv4(),
      title: importSharedQuizModal.title,
      questions: newQuestions,
      readingPassages: newPassages,
      updatedAt: Date.now()
    };

    setQuizzes(prev => [newQuiz, ...prev]);
    setActiveQuizId(newQuiz.id);
    setIsTesting(false);
    setImportSharedQuizModal(null);
    cleanShareUrl();
    alert(`Đã nhập thành công bộ đề: "${newQuiz.title}"!`);
  };

  const handleCancelSharedQuizImport = () => {
    setImportSharedQuizModal(null);
    cleanShareUrl();
  };

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

  const handleDeleteFolder = async (id) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa thư mục này? Các bộ đề bên trong sẽ được đưa ra mục "Chưa phân loại".')) {
      setFolders(prev => prev.filter(f => f.id !== id));
      // Move quizzes inside this folder to uncategorized (folderId: null)
      setQuizzes(prevQuizzes => prevQuizzes.map(q => q.folderId === id ? { ...q, folderId: null, updatedAt: Date.now() } : q));
      if (selectedFolderId === id) {
        setSelectedFolderId('all');
      }
      if (user) {
        try {
          await deleteDoc(doc(db, 'users', user.uid, 'quiz_folders', id));
        } catch (err) {
          console.warn('Direct folder delete from Firestore failed:', err);
        }
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
  const [enviDictEnabled] = useLocalStorage('envi_dict_enabled', true);

  const [decks, setDecks] = useFirestore('decks', 'study_decks', []);
  const [activeQuizId, setActiveQuizId] = useState(null);
  const [targetDeckId, setTargetDeckId] = useState('');
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState('normal'); // 'normal' | 'reading' | 'listening'
  const [toeicPart, setToeicPart] = useState('part34'); // 'part1' | 'part2' | 'part34'
  const [listeningAudio, setListeningAudio] = useState(null); // { data, name }
  const [listeningAudioUrl, setListeningAudioUrl] = useState('');
  const [bulkAudioFiles, setBulkAudioFiles] = useState([]); // [{ id, name, data, startNum, endNum, rangeStr }]
  const [listeningImages, setListeningImages] = useState([]); // [{ id, data, name }]
  const [showTranscriptMap, setShowTranscriptMap] = useState({});
  const [showTranslationMap, setShowTranslationMap] = useState({});
  const [activeLightboxImage, setActiveLightboxImage] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [previewQuestions, setPreviewQuestions] = useState(null);
  const [previewReadingPassage, setPreviewReadingPassage] = useState(null); // { id, title, content, blankNumbers }
  const [previewListeningPassages, setPreviewListeningPassages] = useState(null); // array of listening block objects
  const [importTargetQuizId, setImportTargetQuizId] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testMode, setTestMode] = useState('all'); // 'all' or 'starred'
  const [selectedReadingQuestionId, setSelectedReadingQuestionId] = useState(null);

  const [isShuffled, setIsShuffled] = useState(false);
  const [shuffledIds, setShuffledIds] = useState(null);
  const [shuffledOptions, setShuffledOptions] = useState(null);
  const [activePartId, setActivePartId] = useState('part1');
  const [showPartQuickInput, setShowPartQuickInput] = useState(true);
  const [partQuickText, setPartQuickText] = useState('');
  const [partQuickPreviewData, setPartQuickPreviewData] = useState(null);

  const handleJumpToPart = (startNum) => {
    if (!activeQuiz || !activeQuiz.questions) return;
    if (testMode === 'starred') setTestMode('all');

    let partId = 'part1';
    if (startNum >= 147) partId = 'part7';
    else if (startNum >= 131) partId = 'part6';
    else if (startNum >= 101) partId = 'part5';
    else if (startNum >= 71) partId = 'part4';
    else if (startNum >= 32) partId = 'part3';
    else if (startNum >= 7) partId = 'part2';
    
    setActivePartId(partId);

    setTimeout(() => {
      let el = document.querySelector(`[data-blank-number="${startNum}"]`);

      if (!el) {
        const targetQ = activeQuiz.questions.find(q => Number(q.blankNumber) === startNum) ||
                         activeQuiz.questions.find(q => Number(q.blankNumber) >= startNum) ||
                         activeQuiz.questions[startNum - 1];

        if (targetQ) {
          el = document.getElementById(`question-card-${targetQ.id}`) ||
               document.getElementById(`section-item-${targetQ.id}`) ||
               document.getElementById(`listening-block-${targetQ.listeningGroupId}`) ||
               document.getElementById(`reading-block-${targetQ.readingGroupId}`);
        }
      }

      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Fallback for nested scroll container
        const parent = el.closest('[style*="overflow"]') || document.querySelector('.glass-panel');
        if (parent) {
          const parentRect = parent.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const offset = elRect.top - parentRect.top;
          if (Math.abs(offset) > 50) {
            parent.scrollBy({ top: offset - 80, behavior: 'smooth' });
          }
        }
      }
    }, 80);
  };

  const [showUnsavedExitModal, setShowUnsavedExitModal] = useState(false);
  const [pendingExitAction, setPendingExitAction] = useState(null);
  const [showBulkAnswerKeyModal, setShowBulkAnswerKeyModal] = useState(false);
  const [bulkAnswerKeyInput, setBulkAnswerKeyInput] = useState('');

  function parse200AnswerKeys(text) {
    if (!text || !text.trim()) return [];
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    const map = new Map();

    // Pattern 1: Number + separator + letter (e.g. 1. A, 1.A, 1-A, 1A, Câu 1: A, Q1: A)
    const patternNumLetter = /(?:Câu|Question|Q)?\s*(\d{1,3})\s*[\s\.:\-\)]*([A-D])\b/gi;
    let match;
    while ((match = patternNumLetter.exec(normalized)) !== null) {
      const num = parseInt(match[1], 10);
      const ans = match[2].toUpperCase();
      if (num >= 1 && num <= 200) {
        map.set(num, ans);
      }
    }

    if (map.size > 0) {
      const results = [];
      for (let i = 1; i <= 200; i++) {
        if (map.has(i)) {
          results.push({ number: i, answer: map.get(i) });
        }
      }
      return results;
    }

    // Pattern 2: Line by line single letters or space-separated letters (A B C D...)
    const tokens = normalized.split(/[\s,\n]+/).map(t => t.trim().toUpperCase()).filter(t => /^[A-D]$/.test(t));
    if (tokens.length > 0) {
      const results = [];
      tokens.forEach((ans, idx) => {
        const num = idx + 1;
        if (num <= 200) {
          results.push({ number: num, answer: ans });
        }
      });
      return results;
    }

    return [];
  }

  const handleApplyBulkAnswers = () => {
    if (!activeQuiz) return;
    const parsed = parse200AnswerKeys(bulkAnswerKeyInput);
    if (!parsed || parsed.length === 0) {
      alert('Không tìm thấy đáp án hợp lệ nào (A, B, C, D). Vui lòng kiểm tra lại văn bản dán.');
      return;
    }

    let updatedCount = 0;
    const answerMap = new Map();
    parsed.forEach(item => answerMap.set(Number(item.number), item.answer));

    const updatedQuestions = activeQuiz.questions.map(q => {
      const qNum = Number(q.blankNumber);
      if (answerMap.has(qNum)) {
        updatedCount++;
        return { ...q, answer: answerMap.get(qNum) };
      }
      return q;
    });

    setQuizzes(prev => prev.map(q => q.id === activeQuizId ? { ...q, questions: updatedQuestions, updatedAt: Date.now() } : q));
    setShowBulkAnswerKeyModal(false);
    setBulkAnswerKeyInput('');
    alert(`🎉 Đã cập nhật thành công đáp án cho ${updatedCount} câu hỏi!`);
  };

  const handlePreviewPartQuickText = () => {
    if (!partQuickText.trim() || !activeQuiz) return;

    let rawText = partQuickText.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    let transcriptText = '';
    let translationText = '';
    let notesText = '';

    // 1. Check for explicit LISTENING tag / TRANSCRIPT tag
    const listeningMatch = rawText.match(/(?:LISTENING|TRANSCRIPT|KỊCH BẢN):\s*([\s\S]*?)(?=\n\s*(?:TRANSLATION|BẢN DỊCH|DỊCH|NOTES|GHI CHÚ|TỪ VỰNG|READING|Questions|Câu|Question|\d{1,4})[\s\.\:]|$)/i);
    if (listeningMatch) {
      transcriptText = listeningMatch[1].trim();
      rawText = rawText.replace(listeningMatch[0], '').trim();
    }

    // 1b. Check for explicit TRANSLATION tag
    const translationMatch = rawText.match(/(?:TRANSLATION|BẢN DỊCH|DỊCH|VIETNAMESE):\s*([\s\S]*?)(?=\n\s*(?:NOTES|GHI CHÚ|TỪ VỰNG|READING|Questions|Câu|Question|\d{1,4})[\s\.\:]|$)/i);
    if (translationMatch) {
      translationText = translationMatch[1].trim();
      rawText = rawText.replace(translationMatch[0], '').trim();
    }

    // 1c. Check for explicit NOTES tag
    const notesMatch = rawText.match(/(?:NOTES|GHI CHÚ|TỪ VỰNG):\s*([\s\S]*?)(?=\n\s*(?:READING|Questions|Câu|Question|\d{1,4})[\s\.\:]|$)/i);
    if (notesMatch) {
      notesText = notesMatch[1].trim();
      rawText = rawText.replace(notesMatch[0], '').trim();
    }

    // 2. Check for explicit READING tag
    let globalReadingText = '';
    const readingMatch = rawText.match(/(?:READING|PASSAGE|ĐOẠN VĂN):\s*([\s\S]*?)(?=\n\s*(?:Questions|Câu|Question|\d{1,4})[\s\.\:]|$)/i);
    if (readingMatch) {
      globalReadingText = readingMatch[1].trim();
      rawText = rawText.replace(readingMatch[0], '').trim();
    }

    // 3. Split by multi-reading passage headers (e.g. "Questions 131-134 refer to...", "Questions 135-138 refer to...")
    const rawPassageSections = rawText
      .split(/(?=(?:^|\n)\s*(?:Questions|Câu)\s*\d{1,4}\s*[-_–~to\s]+\s*\d{1,4}\s*refer to)/i)
      .filter(s => s.trim());

    const currentPart = [
      { id: 'part1', start: 1, end: 6, label: 'Part 1' },
      { id: 'part2', start: 7, end: 31, label: 'Part 2' },
      { id: 'part3', start: 32, end: 70, label: 'Part 3' },
      { id: 'part4', start: 71, end: 100, label: 'Part 4' },
      { id: 'part5', start: 101, end: 130, label: 'Part 5' },
      { id: 'part6', start: 131, end: 146, label: 'Part 6' },
      { id: 'part7', start: 147, end: 200, label: 'Part 7' }
    ].find(p => p.id === activePartId);

    const parsedQuestions = [];
    const parsedReadingBlocks = [];

    // Helper to parse individual question blocks
    const parseQuestionBlocksFromText = (qChunkText, defaultStartNum) => {
      const qBlocks = qChunkText
        .split(/(?=(?:^|\n)\s*(?:Câu|Question|Q)?\s*\d{1,4}\s*[\.\:\)]?\s*(?:\n|\s*[\(\[]?[A-D][\)\.\:]|\s*Answer))/i)
        .filter(b => b.trim());

      qBlocks.forEach((block, idx) => {
        const numMatch = block.match(/(?:Câu|Question|Q)?\s*(\d{1,4})\s*[\.\:\)]?/i);
        let targetNum = numMatch ? parseInt(numMatch[1], 10) : (defaultStartNum + idx);

        const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
        let qText = lines[0] ? lines[0] : '';
        if (/^\s*(?:Câu|Question|Q)?\s*\d{1,4}\s*[\.\:\)]?\s*$/i.test(qText)) {
          qText = '';
        } else {
          qText = qText.replace(/^(?:(?:Câu|Question|Q)\s*\d*[\s\:\.\-]*)+/gi, '').replace(/^(?:\d+[\s\:\.\-]*)+/g, '').trim();
        }

        const options = {};
        let answer = null;

        lines.forEach(line => {
          const optMatch = line.match(/^\s*[\(\[]?\s*(\*?)\s*([A-D])\s*[\)\]\.\:\-]\s*(.*)/i);
          if (optMatch) {
            const isMarkedAnswer = !!optMatch[1];
            const letter = optMatch[2].toUpperCase();
            const optContent = optMatch[3].trim();
            options[letter] = optContent;
            if (isMarkedAnswer) answer = letter;
          } else {
            const ansMatch = line.match(/^(?:Đáp án|Answer|Ans)[\.\:]*\s*([A-D])/i);
            if (ansMatch) answer = ansMatch[1].toUpperCase();
          }
        });

        const isPart2 = targetNum >= 7 && targetNum <= 31;
        const defaultOpts = isPart2
          ? { A: 'Đáp án A', B: 'Đáp án B', C: 'Đáp án C' }
          : { A: 'Đáp án A', B: 'Đáp án B', C: 'Đáp án C', D: 'Đáp án D' };

        parsedQuestions.push({
          blankNumber: targetNum,
          question: qText || '',
          options: Object.keys(options).length > 0 ? options : defaultOpts,
          answer: answer || 'A'
        });
      });
    };

    if (rawPassageSections.length > 1) {
      // Multiple passages detected (e.g. 4 passages for Part 6)
      rawPassageSections.forEach((sectionText) => {
        const headerMatch = sectionText.match(/(?:Questions|Câu)\s*(\d{1,4})\s*[-_–~to\s]+\s*(\d{1,4})/i);
        let startNum = headerMatch ? parseInt(headerMatch[1], 10) : 131;
        let endNum = headerMatch ? parseInt(headerMatch[2], 10) : (startNum + 3);

        const firstQMatch = sectionText.match(/(?:^|\n)\s*(?:Câu|Question|Q)?\s*(\d{1,4})\s*[\.\:\)]?\s*(?=\n\s*[\(\[]?[A-D][\)\.\:]|\s*Answer)/i);
        let passageBody = '';
        let questionsBody = '';

        if (firstQMatch && firstQMatch.index > 0) {
          passageBody = sectionText.substring(0, firstQMatch.index).trim();
          questionsBody = sectionText.substring(firstQMatch.index).trim();
        } else {
          passageBody = sectionText.trim();
        }

        const sectionQsStartIdx = parsedQuestions.length;
        if (questionsBody) {
          parseQuestionBlocksFromText(questionsBody, startNum);
        }
        const qsForThisBlock = parsedQuestions.slice(sectionQsStartIdx);

        parsedReadingBlocks.push({
          id: uuidv4(),
          startNum,
          endNum,
          rangeStr: `${startNum} - ${endNum}`,
          title: `Đoạn văn bài đọc (Câu ${startNum} - ${endNum})`,
          readingContent: passageBody || globalReadingText || '',
          questions: qsForThisBlock
        });
      });
    } else {
      // Single passage or standard input
      let readingText = globalReadingText;
      let text = rawText;

      if (!readingText) {
        const qFirstMatch = text.match(/(?:^|\n)\s*(?:Câu|Question|Q)?\s*(\d{1,4})\s*[\.\:\)]?\s*(?=\n\s*[\(\[]?[A-D][\)\.\:]|\s*Answer)/i);
        if (qFirstMatch && qFirstMatch.index > 0) {
          const potentialPassage = text.substring(0, qFirstMatch.index).trim();
          if (potentialPassage.length > 15) {
            readingText = potentialPassage;
            text = text.substring(qFirstMatch.index).trim();
          }
        }
      }

      parseQuestionBlocksFromText(text, currentPart ? currentPart.start : 1);

      const rangeMatch = readingText.match(/(?:Questions|Câu)\s*(\d{1,4})\s*[-_–~to\s]+\s*(\d{1,4})/i);
      let detectedStart = rangeMatch ? parseInt(rangeMatch[1], 10) : null;
      let detectedEnd = rangeMatch ? parseInt(rangeMatch[2], 10) : null;

      if (!detectedStart && parsedQuestions.length > 0) {
        detectedStart = parsedQuestions[0].blankNumber;
        detectedEnd = parsedQuestions[parsedQuestions.length - 1].blankNumber;
      }

      if (activePartId === 'part6') {
        const part6Ranges = [
          { start: 131, end: 134 },
          { start: 135, end: 138 },
          { start: 139, end: 142 },
          { start: 143, end: 146 }
        ];
        part6Ranges.forEach(range => {
          const qsInBlock = parsedQuestions.filter(q => q.blankNumber >= range.start && q.blankNumber <= range.end);
          if (qsInBlock.length > 0 || (detectedStart && range.start === detectedStart)) {
            parsedReadingBlocks.push({
              id: uuidv4(),
              startNum: range.start,
              endNum: range.end,
              rangeStr: `${range.start} - ${range.end}`,
              title: `Đoạn văn bài đọc (Câu ${range.start} - ${range.end})`,
              readingContent: readingText || '',
              questions: qsInBlock
            });
          }
        });
      } else if (activePartId === 'part7' || readingText) {
        if (parsedQuestions.length > 0 || readingText) {
          const firstTargetNum = detectedStart || parsedQuestions[0]?.blankNumber || (currentPart ? currentPart.start : 147);
          const lastTargetNum = detectedEnd || parsedQuestions[parsedQuestions.length - 1]?.blankNumber || (firstTargetNum + (parsedQuestions.length ? parsedQuestions.length - 1 : 3));
          parsedReadingBlocks.push({
            id: uuidv4(),
            startNum: firstTargetNum,
            endNum: lastTargetNum,
            rangeStr: `${firstTargetNum} - ${lastTargetNum}`,
            title: `Đoạn văn bài đọc (Câu ${firstTargetNum} - ${lastTargetNum})`,
            readingContent: readingText || '',
            questions: parsedQuestions
          });
        }
      }
    }

    if (parsedQuestions.length === 0 && !transcriptText && !translationText && !notesText && parsedReadingBlocks.length === 0) {
      alert('Không tìm thấy câu hỏi hoặc bài đọc/kịch bản hợp lệ theo mẫu! Vui lòng kiểm tra lại định dạng.');
      return;
    }

    setPartQuickPreviewData({
      currentPart,
      transcriptText,
      translationText,
      notesText,
      readingText: globalReadingText,
      parsedQuestions,
      parsedReadingBlocks
    });
  };

  const confirmApplyPartQuickText = () => {
    if (!partQuickPreviewData || !activeQuiz) return;
    const { currentPart, transcriptText, translationText, notesText, parsedQuestions, parsedReadingBlocks } = partQuickPreviewData;

    let updatedQuestions = [...(activeQuiz.questions || [])];
    let updatedListeningPassages = [...(activeQuiz.listeningPassages || [])];
    let updatedReadingPassages = [...(activeQuiz.readingPassages || [])];
    let updatedCount = 0;

    parsedQuestions.forEach(qItem => {
      const cleanQText = (qItem.question || '')
        .replace(/^(?:(?:Câu|Question)\s*\d*[\s\:\.\-]*)+/gi, '')
        .replace(/^(?:\d+[\s\:\.\-]*)+/g, '')
        .trim();

      const targetQIdx = updatedQuestions.findIndex(q => Number(q.blankNumber) === qItem.blankNumber);
      if (targetQIdx !== -1) {
        const existingQ = updatedQuestions[targetQIdx];
        updatedQuestions[targetQIdx] = {
          ...existingQ,
          question: cleanQText || existingQ.question,
          options: Object.keys(qItem.options).length > 0 ? { ...existingQ.options, ...qItem.options } : existingQ.options,
          answer: qItem.answer || existingQ.answer
        };
        updatedCount++;
      } else {
        updatedQuestions.push({
          id: uuidv4(),
          blankNumber: qItem.blankNumber,
          question: cleanQText,
          options: qItem.options,
          answer: qItem.answer,
          userAnswer: null
        });
        updatedCount++;
      }
    });

    if (transcriptText || translationText || notesText) {
      const firstTargetNum = parsedQuestions[0]?.blankNumber || (currentPart ? currentPart.start : 1);

      let targetPassage = updatedListeningPassages.find(p => {
        if (p.rangeStr) {
          const parts = p.rangeStr.split(/[-_–~to]+/);
          if (parts.length === 2) {
            const s = parseInt(parts[0], 10);
            const e = parseInt(parts[1], 10);
            return firstTargetNum >= s && firstTargetNum <= e;
          } else if (parts.length === 1) {
            const num = parseInt(parts[0], 10);
            return firstTargetNum === num;
          }
        }
        return false;
      });

      if (targetPassage) {
        if (transcriptText) targetPassage.transcript = transcriptText;
        if (translationText) targetPassage.transcriptTranslation = translationText;
        if (notesText) targetPassage.notes = notesText;
      } else {
        const newPassageId = uuidv4();
        const newPassage = {
          id: newPassageId,
          type: 'listening',
          part: firstTargetNum <= 6 ? 'part1' : (firstTargetNum <= 31 ? 'part2' : 'part34'),
          title: `Bài nghe (Câu ${firstTargetNum})`,
          rangeStr: `${firstTargetNum}`,
          transcript: transcriptText || '',
          transcriptTranslation: translationText || '',
          notes: notesText || '',
          audioUrl: '',
          audioName: '',
          images: []
        };
        updatedListeningPassages.push(newPassage);
      }
    }

    if (parsedReadingBlocks && parsedReadingBlocks.length > 0) {
      parsedReadingBlocks.forEach(block => {
        let passageObj = updatedReadingPassages.find(p => p.rangeStr === block.rangeStr || (p.startNum === block.startNum && p.endNum === block.endNum));
        if (!passageObj) {
          passageObj = {
            id: block.id,
            title: block.title,
            content: block.readingContent || '',
            images: [],
            startNum: block.startNum,
            endNum: block.endNum,
            rangeStr: block.rangeStr,
            blankNumbers: Array.from({ length: block.endNum - block.startNum + 1 }, (_, i) => String(block.startNum + i))
          };
          updatedReadingPassages.push(passageObj);
        } else if (block.readingContent) {
          passageObj.content = block.readingContent;
        }

        block.questions.forEach(qItem => {
          const targetQ = updatedQuestions.find(q => Number(q.blankNumber) === qItem.blankNumber);
          if (targetQ) {
            targetQ.readingGroupId = passageObj.id;
          }
        });
      });
    }

    setQuizzes(prev => prev.map(q => q.id === activeQuiz.id ? {
      ...q,
      questions: updatedQuestions,
      listeningPassages: updatedListeningPassages,
      readingPassages: updatedReadingPassages,
      updatedAt: Date.now()
    } : q));

    alert(`🎉 Đã nạp thành công ${updatedCount} câu hỏi${parsedReadingBlocks?.length ? ` & ${parsedReadingBlocks.length} Reading Block` : ''} vào ${currentPart ? currentPart.label : 'Part'}!`);
    setPartQuickText('');
    setPartQuickPreviewData(null);
  };

  const requestExitQuiz = useCallback((exitActionFn) => {
    if (activeQuizId && hasUnsavedQuizChanges) {
      setPendingExitAction(() => exitActionFn);
      setShowUnsavedExitModal(true);
    } else {
      exitActionFn();
    }
  }, [activeQuizId, hasUnsavedQuizChanges]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (activeQuizId && hasUnsavedQuizChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [activeQuizId, hasUnsavedQuizChanges]);

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
  const [takeawayAddedSuccess, setTakeawayAddedSuccess] = useState(false);
  const [quickNoteInput, setQuickNoteInput] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSavingToDeck, setIsSavingToDeck] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isAiEnrichingPopup, setIsAiEnrichingPopup] = useState(false);
  const [enrichedData, setEnrichedData] = useState(null); // { pronunciation, wordType, example, synonyms }
  const translationTimeoutRef = useRef(null);
  const lastPopupTimeRef = useRef(0);
  const [cheatSheetViewMode, setCheatSheetViewMode] = useState('grid'); // 'grid'
  const [copiedBlockIdx, setCopiedBlockIdx] = useState(null);
  const [editingBlockIdx, setEditingBlockIdx] = useState(null);
  const [editingBlockText, setEditingBlockText] = useState('');

  const parseTakeawaysToBlocks = useCallback((raw = '') => {
    if (!raw || !raw.trim()) return [];

    let items = [];
    if (/<[a-z][\s\S]*>/i.test(raw)) {
      const matches = raw.match(/<(p|li|div)[\s\S]*?>([\s\S]*?)<\/\1>/gi);
      if (matches && matches.length > 0) {
        items = matches.map(m => m.replace(/^<(p|li|div)[\s\S]*?>|<\/(p|li|div)>$/gi, '').trim());
      } else {
        items = raw.split(/<br\s*\/?>|\n/).map(s => s.trim());
      }
    } else {
      items = raw.split('\n').map(s => s.trim());
    }

    return items
      .filter(item => item && item.replace(/<[^>]+>/g, '').trim().length > 0)
      .map((item, idx) => {
        const textContent = item
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/^[•\-\*\s]+/, '')
          .trim();
        return {
          id: idx,
          rawHtml: item,
          text: textContent
        };
      });
  }, []);

  const handleDeleteTakeawayBlock = (idxToDelete) => {
    if (!activeQuizId || !activeQuiz) return;
    const blocks = parseTakeawaysToBlocks(activeQuiz.keyTakeaways || '');
    const remaining = blocks.filter((_, idx) => idx !== idxToDelete);
    const newContent = remaining.map(b => `<p>${b.rawHtml}</p>`).join('');
    setQuizzes(quizzes.map(q => q.id === activeQuizId ? { ...q, keyTakeaways: newContent, updatedAt: Date.now() } : q));
  };

  const handleUpdateTakeawayBlock = (idxToUpdate, newText) => {
    if (!activeQuizId || !activeQuiz) return;
    const cleanText = newText.trim();
    if (!cleanText) {
      handleDeleteTakeawayBlock(idxToUpdate);
      setEditingBlockIdx(null);
      return;
    }

    const blocks = parseTakeawaysToBlocks(activeQuiz.keyTakeaways || '');
    const htmlFormatted = cleanText.replace(/\n/g, '<br/>');
    const updated = blocks.map((b, idx) => {
      if (idx === idxToUpdate) {
        return `<p>• <strong>${htmlFormatted}</strong></p>`;
      }
      return `<p>${b.rawHtml}</p>`;
    });

    const newContent = updated.join('');
    setQuizzes(quizzes.map(q => q.id === activeQuizId ? { ...q, keyTakeaways: newContent, updatedAt: Date.now() } : q));
    setEditingBlockIdx(null);
    setEditingBlockText('');
  };

  const handleAddToTakeaways = (textToAdd) => {
    if (!activeQuizId || !textToAdd) return;
    const cleanText = textToAdd.trim();
    if (!cleanText) return;

    const htmlFormatted = cleanText.replace(/\n/g, '<br/>');
    const existing = activeQuiz?.keyTakeaways || '';
    let newContent = '';

    if (/<[a-z][\s\S]*>/i.test(existing)) {
      newContent = `${existing}<p>• <strong>${htmlFormatted}</strong></p>`;
    } else if (existing.trim()) {
      newContent = `${existing}\n• ${htmlFormatted}`;
    } else {
      newContent = `<p>• <strong>${htmlFormatted}</strong></p>`;
    }

    setQuizzes(quizzes.map(q => q.id === activeQuizId ? { ...q, keyTakeaways: newContent, updatedAt: Date.now() } : q));
    setIsTakeawaysCollapsed(false);
    setTakeawayAddedSuccess(true);
    setTimeout(() => setTakeawayAddedSuccess(false), 2200);
  };

  const activeQuiz = quizzes.find(q => q.id === activeQuizId);

  const activeQuizStats = useMemo(() => {
    if (!activeQuiz || !activeQuiz.questions) return { total: 0, answered: 0, correct: 0 };
    const total = activeQuiz.questions.length;
    const answered = activeQuiz.questions.filter(q => q.userAnswer != null).length;
    const correct = activeQuiz.questions.filter(q => q.answer && q.userAnswer === q.answer).length;
    return { total, answered, correct };
  }, [activeQuiz]);

  // Auto-recovery: If activeQuizId points to a missing quiz (e.g. sync error or deleted), return to grid view
  useEffect(() => {
    if (activeQuizId && !activeQuiz && !isCreatingAiQuiz && !isImporting) {
      console.warn("activeQuizId not found in quizzes, resetting to grid view");
      setActiveQuizId(null);
    }
  }, [activeQuizId, activeQuiz, isCreatingAiQuiz, isImporting]);

  const renderSyncBadge = () => {
    if (!quizSyncState) return null;
    const { status, error } = quizSyncState;

    if (status === 'saving') {
      return (
        <span style={{
          padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
          background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)',
          display: 'inline-flex', alignItems: 'center', gap: '6px'
        }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', border: '2px solid #60a5fa', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
          Đang lưu Cloud...
        </span>
      );
    }

    if (status === 'has_unsaved' || hasUnsavedQuizChanges) {
      return (
        <button
          type="button"
          onClick={() => saveQuizzesToCloud()}
          style={{
            padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
            background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#000',
            border: 'none', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            boxShadow: '0 2px 10px rgba(245,158,11,0.4)',
            transition: 'all 0.2s'
          }}
          title="Bấm để đồng bộ dữ liệu vừa sửa lên Cloud"
        >
          <Save size={13} /> Lưu lên Cloud (Có thay đổi)
        </button>
      );
    }

    if (status === 'local_only') {
      return (
        <span title={error || 'Đã lưu an toàn tại máy (Local Storage / IndexedDB)'} style={{
          padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
          background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)',
          display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'help'
        }}>
          💾 Đã lưu máy Local (Audio &gt; 1MB)
        </span>
      );
    }

    if (status === 'error') {
      return (
        <button
          type="button"
          onClick={() => saveQuizzesToCloud()}
          title={error || 'Lỗi kết nối Cloud. Bấm để thử lại.'}
          style={{
            padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
            background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)',
            display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer'
          }}
        >
          ⚠️ Lỗi lưu Cloud (Thử lại)
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => saveQuizzesToCloud()}
        title="Dữ liệu đã đồng bộ Cloud. Nhấp để lưu lại bất kỳ lúc nào."
        style={{
          padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
          background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)',
          display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer'
        }}
      >
        ☁️ Đã đồng bộ Cloud
      </button>
    );
  };

  // ===== HELPERS: Render text with / separator and () hiding =====

  // Finds the index of a quiz / separator (ignoring HTML closing tags like </p>, </div>, </span>)
  const findSlashIndex = (str) => {
    if (!str || typeof str !== 'string') return -1;
    for (let i = 0; i < str.length; i++) {
      if (str[i] === '/') {
        if (i > 0 && str[i - 1] === '<') continue; // Ignore </p>
        const openBefore = str.lastIndexOf('<', i);
        const closeBefore = str.lastIndexOf('>', i);
        if (openBefore > closeBefore) continue; // Ignore inside <... >
        return i;
      }
    }
    return -1;
  };

  // Renders text: hides content after / and content in () during test mode
  // showHidden = true means show everything (answer revealed or edit mode)
  const renderQuizText = (text, showHidden = false) => {
    if (!text) return text;

    // Split by / — ignoring HTML closing tags like </p>
    const slashIdx = findSlashIndex(text);
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

  // Global text selection listener for active quiz view (handles inputs, textareas, and body text)
  useEffect(() => {
    if (!activeQuizId || enviDictEnabled === false) return;

    const handleGlobalSelection = (e) => {
      // Don't trigger if click/key was inside translation-popup
      if (e.target && e.target.closest && e.target.closest('.translation-popup')) return;

      if (translationTimeoutRef.current) clearTimeout(translationTimeoutRef.current);

      translationTimeoutRef.current = setTimeout(() => {
        let selectedText = '';
        let rect = null;
        let selStart = 0, selEnd = 0;

        const target = document.activeElement || e.target;
        const isFormElement = target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT');

        if (isFormElement) {
          selStart = target.selectionStart;
          selEnd = target.selectionEnd;
          if (selStart !== undefined && selEnd !== undefined && selStart !== selEnd) {
            selectedText = target.value.substring(selStart, selEnd).trim();
            rect = target.getBoundingClientRect();
          }
        }

        if (!selectedText) {
          const selection = window.getSelection();
          selectedText = selection?.toString()?.trim() || '';
          if (selectedText && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rangeRect = range.getBoundingClientRect();
            if (rangeRect.width > 0 || rangeRect.height > 0) {
              rect = rangeRect;
            }
          }
        }

        if (selectedText && selectedText.length > 0 && selectedText.length < 300 && rect) {
          let popupX = rect.left + rect.width / 2;
          popupX = Math.max(160, Math.min(window.innerWidth - 160, popupX));

          let popupY = 0;
          let isAbove = true;

          if (rect.top > 240) {
            popupY = Math.max(10, rect.top - 10);
            isAbove = true;
          } else {
            popupY = Math.min(window.innerHeight - 180, rect.bottom + 10);
            isAbove = false;
          }
          const getAttr = (el, attrName) => {
            if (!el) return null;
            if (el.getAttribute && el.getAttribute(attrName)) return el.getAttribute(attrName);
            const parent = el.closest ? el.closest(`[${attrName}]`) : null;
            return parent ? parent.getAttribute(attrName) : null;
          };

          const qId = getAttr(target, 'data-question-id') || getAttr(e.target, 'data-question-id');
          const fld = getAttr(target, 'data-field') || getAttr(e.target, 'data-field');

          lastPopupTimeRef.current = Date.now();
          setTranslationPopup({
            x: popupX,
            y: popupY,
            isAbove,
            text: selectedText,
            questionId: qId,
            field: fld,
            selStart,
            selEnd,
            targetEl: isFormElement ? target : null
          });
          setTranslatedText('');
          setEnrichedData(null);
        }
      }, 80);
    };

    window.addEventListener('mouseup', handleGlobalSelection);
    window.addEventListener('keyup', handleGlobalSelection);
    return () => {
      window.removeEventListener('mouseup', handleGlobalSelection);
      window.removeEventListener('keyup', handleGlobalSelection);
    };
  }, [activeQuizId, enviDictEnabled]);

  const handleTextSelection = useCallback((e, questionId = null, field = null) => {
    if (enviDictEnabled === false) return;
    e.stopPropagation();
    if (translationTimeoutRef.current) clearTimeout(translationTimeoutRef.current);
    translationTimeoutRef.current = setTimeout(() => {
      let selectedText = '';
      let popupX = 0, popupY = 0;
      let selStart = 0, selEnd = 0;

      const target = e.target;
      const getAttr = (el, attrName) => {
        if (!el) return null;
        if (el.getAttribute && el.getAttribute(attrName)) return el.getAttribute(attrName);
        const parent = el.closest ? el.closest(`[${attrName}]`) : null;
        return parent ? parent.getAttribute(attrName) : null;
      };
      const qId = questionId || getAttr(target, 'data-question-id');
      const fld = field || getAttr(target, 'data-field');

      if (target.closest && target.closest('.translation-popup')) return;

      const isFormElement = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT';

      if (isFormElement) {
        selStart = target.selectionStart;
        selEnd = target.selectionEnd;
        if (selStart !== selEnd) {
          selectedText = target.value.substring(selStart, selEnd).trim();
          const rect = target.getBoundingClientRect();
          popupX = rect.left + rect.width / 2;
          popupY = Math.max(10, rect.top - 12);
        }
      } else {
        const selection = window.getSelection();
        selectedText = selection?.toString()?.trim() || '';
        if (selectedText && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          popupX = rect.left + rect.width / 2;
          popupY = Math.max(10, rect.top - 12);
        }
      }

      if (selectedText && selectedText.length > 0 && selectedText.length < 300) {
        setTranslationPopup({
          x: popupX,
          y: popupY,
          text: selectedText,
          questionId: qId,
          field: fld,
          selStart,
          selEnd,
          targetEl: isFormElement ? target : null
        });
        setTranslatedText('');
        setEnrichedData(null);
      }
    }, 150);
  }, [enviDictEnabled]);

  // Handle delete question
  const handleDeleteQuestion = (qId) => {
    if (!activeQuiz) return;

    const questionToDelete = activeQuiz.questions.find(q => q.id === qId);
    const deletedReadingGroupId = questionToDelete?.readingGroupId || null;
    const deletedListeningGroupId = questionToDelete?.listeningGroupId || null;

    const newQuestions = activeQuiz.questions.filter(q => q.id !== qId);

    let newReadingPassages = activeQuiz.readingPassages || [];
    if (deletedReadingGroupId) {
      const groupStillHasQuestion = newQuestions.some(q => q.readingGroupId === deletedReadingGroupId);
      if (!groupStillHasQuestion) {
        // User approved rule 2.B: auto-remove passage block if its questions become empty.
        newReadingPassages = newReadingPassages.filter(p => p.id !== deletedReadingGroupId);
      }
    }

    let newListeningPassages = activeQuiz.listeningPassages || [];
    if (deletedListeningGroupId) {
      const groupStillHasQuestion = newQuestions.some(q => q.listeningGroupId === deletedListeningGroupId);
      if (!groupStillHasQuestion) {
        newListeningPassages = newListeningPassages.filter(p => p.id !== deletedListeningGroupId);
      }
    }

    setQuizzes(
      quizzes.map(q => q.id === activeQuizId
        ? { ...q, questions: newQuestions, readingPassages: newReadingPassages, listeningPassages: newListeningPassages, updatedAt: Date.now() }
        : q
      )
    );

    if (selectedReadingQuestionId === qId) {
      setSelectedReadingQuestionId(null);
    }
  };

  // Close translation popup on click outside (with trackpad drag noise threshold)
  useEffect(() => {
    const handleClickOutside = (e) => {
      // Ignore click if it happened within 400ms of popup opening (trackpad drag release noise)
      if (Date.now() - lastPopupTimeRef.current < 400) return;

      if (translationPopup && !e.target.closest('.translation-popup')) {
        setTimeout(() => {
          const sel = window.getSelection();
          const activeEl = document.activeElement;
          const isFormEl = activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT');
          let hasSel = false;
          if (isFormEl) {
            hasSel = activeEl.selectionStart !== undefined && activeEl.selectionEnd !== undefined && activeEl.selectionStart !== activeEl.selectionEnd;
          } else {
            hasSel = !!(sel && sel.toString().trim().length > 0);
          }
          if (!hasSel) {
            setTranslationPopup(null);
            setTranslatedText('');
          }
        }, 120);
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

  // Insert translation as (text) into the question/option/active input
  const handleInsertTranslation = () => {
    if (!translationPopup || !translatedText) return;
    const { questionId, field, selStart, selEnd, text, targetEl } = translationPopup;
    const insertString = ` (${translatedText})`;

    // 1. Try saved targetEl or active form element directly
    const activeEl = document.activeElement;
    const formEl = (targetEl && document.body.contains(targetEl))
      ? targetEl
      : (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT') ? activeEl : null);

    let handled = false;

    if (formEl) {
      const val = formEl.value || '';
      let insertPos = -1;
      if (selEnd !== undefined && selEnd > 0) {
        insertPos = selEnd;
      } else if (text) {
        const idx = val.indexOf(text);
        if (idx !== -1) {
          insertPos = idx + text.length;
        } else {
          const lowerVal = val.toLowerCase();
          const lowerText = text.toLowerCase();
          const lowerIdx = lowerVal.indexOf(lowerText);
          insertPos = lowerIdx !== -1 ? lowerIdx + text.length : val.length;
        }
      } else {
        insertPos = val.length;
      }

      const newVal = val.substring(0, insertPos) + insertString + val.substring(insertPos);

      const isTextArea = formEl.tagName === 'TEXTAREA';
      const nativeSetter = Object.getOwnPropertyDescriptor(
        isTextArea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
        'value'
      )?.set || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

      if (nativeSetter) {
        nativeSetter.call(formEl, newVal);
        formEl.dispatchEvent(new Event('input', { bubbles: true }));
        formEl.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        formEl.value = newVal;
      }

      const qId = questionId || formEl.getAttribute('data-question-id') || formEl.closest?.('[data-question-id]')?.getAttribute('data-question-id');
      const fld = field || formEl.getAttribute('data-field') || formEl.closest?.('[data-field]')?.getAttribute('data-field');

      if (qId && fld) {
        if (fld === 'question') {
          handleUpdateQuestionProp(qId, 'question', newVal);
        } else if (fld === 'explanation') {
          handleUpdateQuestionProp(qId, 'explanation', newVal);
        } else if (fld.startsWith('option_')) {
          const optKey = fld.replace('option_', '');
          handleUpdateOptionProp(qId, optKey, newVal);
        }
      }
      handled = true;
    }

    // 2. Fallback using questionId & field (supports question, explanation, AND options!)
    if (!handled && questionId && field) {
      const q = activeQuiz?.questions.find(x => x.id === questionId);
      if (q) {
        let originalText = '';
        if (field === 'question') {
          originalText = q.question || '';
        } else if (field === 'explanation') {
          originalText = q.explanation || '';
        } else if (field.startsWith('option_')) {
          const optKey = field.replace('option_', '');
          originalText = q.options[optKey] || '';
        }

        if (originalText !== undefined) {
          const insertIntoHtmlOrText = (originalStr, textToFind, insertStr, selEndPos) => {
            if (!originalStr) return `<p>${insertStr.trim()}</p>`;

            if (/<[a-z][\s\S]*>/i.test(originalStr)) {
              if (textToFind) {
                const idx = originalStr.indexOf(textToFind);
                if (idx !== -1) {
                  const afterPos = idx + textToFind.length;
                  return originalStr.substring(0, afterPos) + insertStr + originalStr.substring(afterPos);
                }
                const lowerOrig = originalStr.toLowerCase();
                const lowerFind = textToFind.toLowerCase();
                const lowerIdx = lowerOrig.indexOf(lowerFind);
                if (lowerIdx !== -1) {
                  const afterPos = lowerIdx + textToFind.length;
                  return originalStr.substring(0, afterPos) + insertStr + originalStr.substring(afterPos);
                }
              }
              const lastCloseTagIdx = originalStr.lastIndexOf('</');
              if (lastCloseTagIdx !== -1) {
                return originalStr.substring(0, lastCloseTagIdx) + insertStr + originalStr.substring(lastCloseTagIdx);
              }
              return originalStr + insertStr;
            }

            let pos = -1;
            if (selEndPos !== undefined && selEndPos > 0 && selEndPos <= originalStr.length) {
              pos = selEndPos;
            } else if (textToFind) {
              const idx = originalStr.indexOf(textToFind);
              if (idx !== -1) {
                pos = idx + textToFind.length;
              } else {
                const lowerOrig = originalStr.toLowerCase();
                const lowerFind = textToFind.toLowerCase();
                const lowerIdx = lowerOrig.indexOf(lowerFind);
                pos = lowerIdx !== -1 ? lowerIdx + textToFind.length : originalStr.length;
              }
            } else {
              pos = originalStr.length;
            }

            return originalStr.substring(0, pos) + insertStr + originalStr.substring(pos);
          };

          const newText = insertIntoHtmlOrText(originalText, text, insertString, selEnd);

          if (field === 'question') {
            handleUpdateQuestionProp(questionId, 'question', newText);
          } else if (field === 'explanation') {
            handleUpdateQuestionProp(questionId, 'explanation', newText);
          } else if (field.startsWith('option_')) {
            const optKey = field.replace('option_', '');
            handleUpdateOptionProp(questionId, optKey, newText);
          }
        }
      }
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
        "exampleTranslation": "dịch nghĩa tiếng Việt của câu ví dụ trên",
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
        exampleTranslation: parsed.exampleTranslation || '',
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
        exampleTranslation: enrichedData?.exampleTranslation || '',
        synonyms: enrichedData?.synonyms ? enrichedData.synonyms.join('; ') : '',
        image: '',
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

  const handleCreateTOEICFullQuiz = () => {
    const listeningPassages = [];
    const readingPassages = [];
    const questions = [];

    // Part 1 – Photographs: Câu 1–6 (Mỗi câu 1 bức ảnh & 1 file audio riêng, 4 đáp án: A, B, C, D)
    for (let i = 1; i <= 6; i++) {
      const pId = uuidv4();
      listeningPassages.push({
        id: pId,
        type: 'listening',
        part: 'part1',
        title: `Part 1 – Bức Ảnh Câu ${i}`,
        rangeStr: `${i}`,
        audioUrl: '',
        audioName: '',
        transcript: '',
        images: []
      });
      questions.push({
        id: uuidv4(),
        blankNumber: i,
        question: '',
        options: { A: 'Đáp án A', B: 'Đáp án B', C: 'Đáp án C', D: 'Đáp án D' },
        answer: 'A',
        explanation: '',
        listeningGroupId: pId,
        userAnswer: null
      });
    }

    // Part 2 – Question–Response: Câu 7–31 (Mỗi câu 1 file audio riêng, 3 đáp án: A, B, C)
    for (let i = 7; i <= 31; i++) {
      const pId = uuidv4();
      listeningPassages.push({
        id: pId,
        type: 'listening',
        part: 'part2',
        title: `Part 2 – Audio Câu ${i}`,
        rangeStr: `${i}`,
        audioUrl: '',
        audioName: '',
        transcript: '',
        images: []
      });
      questions.push({
        id: uuidv4(),
        blankNumber: i,
        question: '',
        options: { A: 'Đáp án A', B: 'Đáp án B', C: 'Đáp án C' },
        answer: 'A',
        explanation: '',
        listeningGroupId: pId,
        userAnswer: null
      });
    }

    // Part 3 – Conversations: Câu 32–70 (13 conversation blocks of 3 questions)
    for (let start = 32; start <= 70; start += 3) {
      const end = Math.min(start + 2, 70);
      const passageId = uuidv4();
      listeningPassages.push({
        id: passageId,
        type: 'listening',
        part: 'part34',
        title: `Part 3 – Conversation (Câu ${start}–${end})`,
        rangeStr: `${start}-${end}`,
        audioUrl: '',
        audioName: '',
        transcript: '',
        images: []
      });
      for (let i = start; i <= end; i++) {
        questions.push({
          id: uuidv4(),
          blankNumber: i,
          question: '',
          options: { A: 'Đáp án A', B: 'Đáp án B', C: 'Đáp án C', D: 'Đáp án D' },
          answer: 'A',
          explanation: '',
          listeningGroupId: passageId,
          userAnswer: null
        });
      }
    }

    // Part 4 – Talks: Câu 71–100 (10 talk blocks of 3 questions)
    for (let start = 71; start <= 100; start += 3) {
      const end = Math.min(start + 2, 100);
      const passageId = uuidv4();
      listeningPassages.push({
        id: passageId,
        type: 'listening',
        part: 'part34',
        title: `Part 4 – Talk (Câu ${start}–${end})`,
        rangeStr: `${start}-${end}`,
        audioUrl: '',
        audioName: '',
        transcript: '',
        images: []
      });
      for (let i = start; i <= end; i++) {
        questions.push({
          id: uuidv4(),
          blankNumber: i,
          question: '',
          options: { A: 'Đáp án A', B: 'Đáp án B', C: 'Đáp án C', D: 'Đáp án D' },
          answer: 'A',
          explanation: '',
          listeningGroupId: passageId,
          userAnswer: null
        });
      }
    }

    // Part 5 – Incomplete Sentences: Câu 101–130
    for (let i = 101; i <= 130; i++) {
      questions.push({
        id: uuidv4(),
        blankNumber: i,
        question: '',
        options: { A: 'Đáp án A', B: 'Đáp án B', C: 'Đáp án C', D: 'Đáp án D' },
        answer: 'A',
        explanation: '',
        userAnswer: null
      });
    }

    // Part 6 – Text Completion: Câu 131–146 (4 reading blocks of 4 questions)
    for (let start = 131; start <= 146; start += 4) {
      const end = Math.min(start + 3, 146);
      const passageId = uuidv4();
      const blankNumbers = [];
      for (let i = start; i <= end; i++) blankNumbers.push(i);

      readingPassages.push({
        id: passageId,
        title: `Part 6 – Text Completion (Câu ${start}–${end})`,
        content: `Nội dung đoạn văn câu ${start}-${end}...`,
        blankNumbers
      });
      for (let i = start; i <= end; i++) {
        questions.push({
          id: uuidv4(),
          blankNumber: i,
          question: '',
          _questionOnly: '',
          options: { A: 'Đáp án A', B: 'Đáp án B', C: 'Đáp án C', D: 'Đáp án D' },
          answer: 'A',
          explanation: '',
          readingGroupId: passageId,
          userAnswer: null
        });
      }
    }

    // Part 7 – Reading Comprehension: Câu 147–200
    const p7Ranges = [
      [147, 148], [149, 150], [151, 152], [153, 155], [156, 157], [158, 160],
      [161, 163], [164, 167], [168, 171], [172, 175], [176, 180], [181, 185],
      [186, 190], [191, 195], [196, 200]
    ];
    p7Ranges.forEach(([start, end]) => {
      const passageId = uuidv4();
      const blankNumbers = [];
      for (let i = start; i <= end; i++) blankNumbers.push(i);

      readingPassages.push({
        id: passageId,
        title: `Part 7 – Reading Passage (Câu ${start}–${end})`,
        content: `Nội dung đoạn văn đọc hiểu câu ${start}-${end}...`,
        blankNumbers
      });
      for (let i = start; i <= end; i++) {
        questions.push({
          id: uuidv4(),
          blankNumber: i,
          question: '',
          _questionOnly: '',
          options: { A: 'Đáp án A', B: 'Đáp án B', C: 'Đáp án C', D: 'Đáp án D' },
          answer: 'A',
          explanation: '',
          readingGroupId: passageId,
          userAnswer: null
        });
      }
    });

    const newQuiz = {
      id: uuidv4(),
      title: 'Đề thi TOEIC Full (200 câu)',
      questions,
      listeningPassages,
      readingPassages,
      updatedAt: Date.now()
    };

    setQuizzes(prev => [newQuiz, ...prev]);
    setActiveQuizId(newQuiz.id);
    setIsTesting(false);
    setTestMode('all');
    setIsCreatingAiQuiz(false);
    setIsImporting(false);
    alert('🎉 Đã tự động khởi tạo bộ đề TOEIC 200 câu chuẩn (Part 1 -> Part 7)!');
  };

  const handleDeleteQuiz = async (e, id) => {
    e.stopPropagation();
    if(window.confirm('Bạn có chắc chắn muốn xóa đề trắc nghiệm này không?')) {
      const updatedQuizzes = quizzes.filter(q => q.id !== id);
      setQuizzes(updatedQuizzes);
      if (activeQuizId === id) setActiveQuizId(null);
      if (user) {
        try {
          await deleteDoc(doc(db, 'users', user.uid, 'quizzes', id));
        } catch (err) {
          console.warn('Direct delete from Firestore failed, saveToCloud will handle it:', err);
        }
      }
    }
  };

  function extractQuestionRangeFromFilename(filename = '') {
    const nameWithoutExt = filename.replace(/\.[a-z0-9]+$/i, '').trim();

    // 1. Check for explicit Part + Range e.g. "Part 3_32-34", "Part 4_71-73", "32-34", "32~34" (dash/hyphen/to only, NOT underscore)
    const rangeMatch = nameWithoutExt.match(/(?:Part\s*\d*[\s_]*)?(\d{1,3})\s*[\-–~to]+\s*(\d{1,3})/i);
    if (rangeMatch) {
      const startNum = parseInt(rangeMatch[1], 10);
      const endNum = parseInt(rangeMatch[2], 10);
      if (startNum <= endNum) {
        return { startNum, endNum, rangeStr: `${startNum}-${endNum}` };
      }
    }

    // 2. Check for explicit Part + Single Question Number e.g. "Test 04_Part 1_1", "Test 01_Part 1_6", "Part 2_7", "Part 2_31"
    const partSingleMatch = nameWithoutExt.match(/(?:Part\s*\d*|Câu|Question|Q)[\s_]+(\d{1,3})$/i)
      || nameWithoutExt.match(/[\s_]+(\d{1,3})$/i);
    if (partSingleMatch) {
      const num = parseInt(partSingleMatch[1], 10);
      return { startNum: num, endNum: num, rangeStr: `${num}` };
    }

    // 3. Fallback for whole Part files without question numbers e.g. "Part 1.mp3"
    if (/^Part\s*1$/i.test(nameWithoutExt)) {
      return { startNum: 1, endNum: 6, rangeStr: '1-6' };
    }
    if (/^Part\s*2$/i.test(nameWithoutExt)) {
      return { startNum: 7, endNum: 31, rangeStr: '7-31' };
    }

    return null;
  }

  const applyBulkAudiosToActiveQuiz = (audios) => {
    if (!activeQuiz || !audios || !audios.length) return;

    let updatedPassages = [...(activeQuiz.listeningPassages || [])];
    let updatedQuestions = [...(activeQuiz.questions || [])];
    let changed = false;

    audios.forEach(audio => {
      const range = audio.startNum ? { startNum: audio.startNum, endNum: audio.endNum } : extractQuestionRangeFromFilename(audio.name);
      if (!range) return;

      const isSingleQuestion = range.startNum === range.endNum;

      if (isSingleQuestion) {
        const qIdx = updatedQuestions.findIndex(q => Number(q.blankNumber) === range.startNum);
        if (qIdx !== -1) {
          const targetQ = updatedQuestions[qIdx];
          
          let passage = updatedPassages.find(p => p.id === targetQ.listeningGroupId && (p.rangeStr === `${range.startNum}` || updatedQuestions.filter(x => x.listeningGroupId === p.id).length === 1));

          if (passage) {
            updatedPassages = updatedPassages.map(p => 
              p.id === passage.id ? { ...p, audioUrl: audio.data || audio.url, audioName: audio.name } : p
            );
          } else {
            const newPassageId = uuidv4();
            const partLabel = range.startNum <= 6 ? 'Part 1' : (range.startNum <= 31 ? 'Part 2' : (range.startNum <= 70 ? 'Part 3' : 'Part 4'));
            const newPassage = {
              id: newPassageId,
              type: 'listening',
              part: range.startNum <= 6 ? 'part1' : (range.startNum <= 31 ? 'part2' : 'part34'),
              title: `${partLabel} – Audio Câu ${range.startNum}`,
              rangeStr: `${range.startNum}`,
              audioUrl: audio.data || audio.url,
              audioName: audio.name,
              transcript: '',
              images: []
            };
            updatedPassages.push(newPassage);
            updatedQuestions[qIdx] = { ...targetQ, listeningGroupId: newPassageId };
          }
          changed = true;
        }
      } else {
        let matchedPassage = updatedPassages.find(p => {
          if (p.rangeStr === `${range.startNum}-${range.endNum}`) return true;
          const groupQs = updatedQuestions.filter(q => q.listeningGroupId === p.id);
          return groupQs.some(q => Number(q.blankNumber) >= range.startNum && Number(q.blankNumber) <= range.endNum);
        });

        if (matchedPassage) {
          updatedPassages = updatedPassages.map(p => 
            p.id === matchedPassage.id ? { ...p, audioUrl: audio.data || audio.url, audioName: audio.name } : p
          );
          changed = true;
        } else {
          const newPassageId = uuidv4();
          const partLabel = range.startNum <= 70 ? 'Part 3' : 'Part 4';
          const newPassage = {
            id: newPassageId,
            type: 'listening',
            part: 'part34',
            title: `${partLabel} – Audio Câu ${range.startNum}-${range.endNum}`,
            rangeStr: `${range.startNum}-${range.endNum}`,
            audioUrl: audio.data || audio.url,
            audioName: audio.name,
            transcript: '',
            images: []
          };
          updatedPassages.push(newPassage);

          updatedQuestions = updatedQuestions.map(q => {
            const bNum = Number(q.blankNumber);
            if (bNum >= range.startNum && bNum <= range.endNum) {
              return { ...q, listeningGroupId: newPassageId };
            }
            return q;
          });
          changed = true;
        }
      }
    });

    if (changed) {
      setQuizzes(quizzes.map(q => q.id === activeQuizId ? {
        ...q,
        listeningPassages: updatedPassages,
        questions: updatedQuestions,
        updatedAt: Date.now()
      } : q));
    }
  };

  const handleBulkAudioUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const audioFiles = files.filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f.name));
    if (!audioFiles.length) {
      alert('Vui lòng chọn các file âm thanh (.mp3, .wav, .m4a,...) hợp lệ.');
      return;
    }

    audioFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    const readPromises = audioFiles.map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const rangeInfo = extractQuestionRangeFromFilename(file.name);
          resolve({
            id: uuidv4(),
            name: file.name,
            data: ev.target.result,
            startNum: rangeInfo ? rangeInfo.startNum : null,
            endNum: rangeInfo ? rangeInfo.endNum : null,
            rangeStr: rangeInfo ? rangeInfo.rangeStr : null,
          });
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readPromises).then(results => {
      setBulkAudioFiles(prev => [...prev, ...results]);
    });

    e.target.value = '';
  };

  const handleListeningAudioUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      alert('File âm thanh quá lớn (tối đa 50MB). Vui lòng dán đường dẫn Audio URL.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setListeningAudio({
        data: event.target.result,
        name: file.name
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleListeningImagesUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    
    files.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        setListeningImages(prev => [
          ...prev,
          {
            id: uuidv4(),
            data: event.target.result,
            name: file.name
          }
        ]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  function parsePart34ListeningText(text, bulkAudios = [], imagesArr = [], defaultAudioObj = null) {
    const parsedQuestions = parseQuizText(text);
    if (parsedQuestions.length === 0) return null;

    let transcriptText = '';
    let translationText = '';
    
    const transMatch = text.match(/(?:TRANSCRIPT|KỊCH\s*BẢN)\s*[:.]\s*([\s\S]*?)(?=(?:DỊCH|TRANSLATION|Câu|\d+[.)]|$))/i);
    if (transMatch) transcriptText = transMatch[1].trim();

    const dichMatch = text.match(/(?:TRANSLATION|BẢN\s*DỊCH|DỊCH)\s*[:.]\s*([\s\S]*?)(?=(?:Câu|\d+[.)]|$))/i);
    if (dichMatch) translationText = dichMatch[1].trim();

    const listeningPassages = [];
    const questionsWithGroups = [];

    const chunkSize = 3;
    let blockIndex = 0;

    for (let i = 0; i < parsedQuestions.length; i += chunkSize) {
      const chunkQuestions = parsedQuestions.slice(i, i + chunkSize);
      const listeningGroupId = uuidv4();
      
      let startNum = chunkQuestions[0]?.blankNumber;
      let endNum = chunkQuestions[chunkQuestions.length - 1]?.blankNumber;

      let matchedAudio = null;
      if (bulkAudios.length > 0) {
        if (startNum && endNum) {
          const numStart = parseInt(startNum, 10);
          matchedAudio = bulkAudios.find(a => (a.startNum && Math.abs(a.startNum - numStart) <= 1) || a.rangeStr === `${startNum}-${endNum}`);
        }
        if (!matchedAudio) {
          matchedAudio = bulkAudios[blockIndex] || bulkAudios[0];
        }
      } else if (defaultAudioObj) {
        matchedAudio = defaultAudioObj;
      }

      if (!startNum) {
        startNum = matchedAudio?.startNum ? String(matchedAudio.startNum) : String(i + 1);
      }
      if (!endNum) {
        endNum = matchedAudio?.endNum ? String(matchedAudio.endNum) : String(i + chunkQuestions.length);
      }

      const passageObj = {
        id: listeningGroupId,
        type: 'listening',
        title: `Part 3/4 (Câu ${startNum}-${endNum})`,
        transcript: transcriptText,
        transcriptTranslation: translationText,
        audioUrl: matchedAudio?.data || matchedAudio?.url || '',
        audioName: matchedAudio?.name || '',
        images: imagesArr || [],
      };

      listeningPassages.push(passageObj);

      chunkQuestions.forEach((q, idx) => {
        let qNum = q.blankNumber;
        if (!qNum) {
          if (matchedAudio?.startNum) {
            qNum = String(matchedAudio.startNum + idx);
          } else {
            qNum = String(i + idx + 1);
          }
        }

        questionsWithGroups.push({
          ...q,
          listeningGroupId,
          blankNumber: qNum,
        });
      });

      blockIndex++;
    }

    return {
      passages: listeningPassages,
      questions: questionsWithGroups,
    };
  }

  const handleParseImport = () => {
    if (importMode === 'listening') {
      const audioObj = listeningAudio || (listeningAudioUrl.trim() ? { url: listeningAudioUrl.trim(), name: 'Link Audio' } : null);
      if (toeicPart === 'part34') {
        const parsedP34 = parsePart34ListeningText(importText, bulkAudioFiles, listeningImages, audioObj);
        if (parsedP34 && parsedP34.questions.length > 0) {
          setPreviewQuestions(parsedP34.questions);
          setPreviewListeningPassages(parsedP34.passages);
          setPreviewReadingPassage(parsedP34.passages[0] || null);
          return;
        }
      }

      const parsedListening = parseListeningQuizText(importText, audioObj, listeningImages);
      if (parsedListening && parsedListening.questions.length > 0) {
        setPreviewQuestions(parsedListening.questions);
        setPreviewReadingPassage(parsedListening.passage);
        setPreviewListeningPassages([parsedListening.passage]);
      } else {
        alert('Không tìm thấy dữ liệu LISTENING hợp lệ. Hãy nhập kịch bản/câu hỏi có các lựa chọn A/B/C/D hoặc đính kèm audio/hình ảnh.');
      }
      return;
    }

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
    const isListeningImport = importMode === 'listening';

    if (importTargetQuizId) {
      // Import into currently opened quiz
      if (previewQuestions[0]?.id) {
        addedQuestionIdRef.current = previewQuestions[0].id;
      }
      const newQuizzes = quizzes.map(q => {
        if (q.id !== importTargetQuizId) return q;

        if (isListeningImport) {
          const newPassagesToAppend = previewListeningPassages && previewListeningPassages.length > 0
            ? previewListeningPassages
            : (previewReadingPassage ? [previewReadingPassage] : []);

          return {
            ...q,
            questions: [...q.questions, ...previewQuestions],
            listeningPassages: [...(q.listeningPassages || []), ...newPassagesToAppend],
            updatedAt: Date.now(),
          };
        }

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
      if ((isReadingImport || isListeningImport) && previewQuestions[0]?.id) {
        setSelectedReadingQuestionId(previewQuestions[0].id);
      }
    } else {
      // Import from grid: create new quiz
      const quizTitle = isListeningImport
        ? `Đề LISTENING TOEIC (${previewQuestions.length} câu)`
        : isReadingImport
        ? `Đề READING (${previewQuestions.length} câu)`
        : `Đề import (${previewQuestions.length} câu)`;

      const newPassagesToAppend = previewListeningPassages && previewListeningPassages.length > 0
        ? previewListeningPassages
        : (previewReadingPassage ? [previewReadingPassage] : []);

      const newQuiz = {
        id: uuidv4(),
        title: quizTitle,
        questions: previewQuestions,
        readingPassages: isReadingImport && previewReadingPassage ? [previewReadingPassage] : [],
        listeningPassages: isListeningImport ? newPassagesToAppend : [],
        updatedAt: Date.now(),
      };
      setQuizzes([newQuiz, ...quizzes]);
      setActiveQuizId(newQuiz.id);
      if ((isReadingImport || isListeningImport) && previewQuestions[0]?.id) {
        setSelectedReadingQuestionId(previewQuestions[0].id);
      }
    }
    
    // Reset import states
    setIsImporting(false);
    setPreviewQuestions(null);
    setPreviewReadingPassage(null);
    setPreviewListeningPassages(null);
    setImportTargetQuizId(null);
    setImportText('');
    setImportMode('normal');
    setListeningAudio(null);
    setListeningAudioUrl('');
    setBulkAudioFiles([]);
    setListeningImages([]);
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
      let rawQ = currentQuestion.trim();
      const numMatch = rawQ.match(/^(?:Câu|Question|Q|Bài)?\s*(\d{1,4})\s*[.):]*/i);
      const blankNumber = numMatch ? numMatch[1] : '';

      let q = rawQ.replace(/^(?:Câu|Question|Q|Bài)\s*\d+\s*[.):]*\s*/i, '');
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
          blankNumber: blankNumber,
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

  /**
   * LISTENING parser: Audio/Images + Transcript/Script + mapped questions.
   * Output:
   * {
   *   passage: { id, type: 'listening', title, transcript, audioUrl, audioName, images: [] },
   *   questions: [{...mcq, blankNumber, listeningGroupId }]
   * }
   */
  function parseListeningQuizText(text, audioObj = null, imagesArr = []) {
    const normalized = (text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    const questionStartRe = /^\s*(?:Câu|Question|Q)?\s*\d+\s*[):.]/i;

    let firstQuestionLineIdx = lines.findIndex(line => questionStartRe.test(line.trim()));

    let transcriptRaw = '';
    let questionsRaw = text || '';

    if (firstQuestionLineIdx !== -1) {
      transcriptRaw = lines.slice(0, firstQuestionLineIdx).join('\n').trim();
      questionsRaw = lines.slice(firstQuestionLineIdx).join('\n').trim();
    }

    const cleanedTranscript = transcriptRaw
      .replace(/^\s*(?:LISTENING|TRANSCRIPT|BÀI\s*NGHE|AUDIO|SCRIPT)\s*[:-]?\s*/i, '')
      .trim();

    const parsedQuestions = parseQuizText(questionsRaw);
    
    // If no text questions found but audio or images are provided, create dummy question shell
    if (parsedQuestions.length === 0 && !audioObj && (!imagesArr || imagesArr.length === 0)) {
      return null;
    }

    const listeningGroupId = uuidv4();
    const mappedQuestions = (parsedQuestions.length > 0 ? parsedQuestions : [
      {
        id: uuidv4(),
        question: 'Nghe bài phát và chọn đáp án đúng nhất:',
        options: { A: 'Đáp án A', B: 'Đáp án B', C: 'Đáp án C', D: 'Đáp án D' },
        answer: 'A',
        explanation: 'Nghe lại audio để xác nhận.',
        userAnswer: null
      }
    ]).map((item, idx) => {
      const blankFromQuestionText = item.question.match(/^\s*(?:Câu|Question|Q)?\s*(\d{1,4})\s*[):.]?/i)?.[1] || '';
      return {
        ...item,
        listeningGroupId,
        blankNumber: item.blankNumber || blankFromQuestionText || String(idx + 1),
      };
    });

    const passageTitle = cleanedTranscript 
      ? (cleanedTranscript.split('\n')[0].slice(0, 50) || 'Bài nghe TOEIC') 
      : (audioObj?.name || 'Bài nghe TOEIC Listening');

    return {
      passage: {
        id: listeningGroupId,
        type: 'listening',
        title: passageTitle,
        transcript: cleanedTranscript,
        audioUrl: audioObj?.data || audioObj?.url || '',
        audioName: audioObj?.name || '',
        images: imagesArr || [],
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

  const handleUpdateReadingPassageRange = (passageId, startNum, endNum) => {
    if (!activeQuiz || isNaN(startNum) || isNaN(endNum) || startNum > endNum) {
      alert('Dải câu hỏi không hợp lệ!');
      return;
    }

    const rangeStr = `${startNum} - ${endNum}`;
    const newReadingPassages = (activeQuiz.readingPassages || []).map(p => {
      if (p.id === passageId) {
        return {
          ...p,
          startNum,
          endNum,
          rangeStr,
          title: `Đoạn văn bài đọc (Câu ${rangeStr})`,
          blankNumbers: Array.from({ length: endNum - startNum + 1 }, (_, i) => String(startNum + i))
        };
      }
      return p;
    });

    const newQuestions = (activeQuiz.questions || []).map(item => {
      const qNum = parseInt(item.blankNumber, 10);
      if (!isNaN(qNum) && qNum >= startNum && qNum <= endNum) {
        return { ...item, readingGroupId: passageId };
      }
      if (item.readingGroupId === passageId && (!qNum || qNum < startNum || qNum > endNum)) {
        return { ...item, readingGroupId: null };
      }
      return item;
    });

    setQuizzes(prev => prev.map(q => q.id === activeQuizId ? {
      ...q,
      readingPassages: newReadingPassages,
      questions: newQuestions,
      updatedAt: Date.now()
    } : q));
  };

  const handleDeleteReadingPassage = (passageId) => {
    if (!activeQuiz) return;
    if (!window.confirm('Bạn có chắc chắn muốn xóa Reading Block này? Các câu hỏi trong block sẽ trở thành câu hỏi thường.')) {
      return;
    }

    const newReadingPassages = (activeQuiz.readingPassages || []).filter(p => p.id !== passageId);
    const newQuestions = (activeQuiz.questions || []).map(item => {
      if (item.readingGroupId === passageId) {
        return { ...item, readingGroupId: null };
      }
      return item;
    });

    setQuizzes(prev => prev.map(q => q.id === activeQuizId ? {
      ...q,
      readingPassages: newReadingPassages,
      questions: newQuestions,
      updatedAt: Date.now()
    } : q));
  };

  const handleAddNewReadingBlock = () => {
    if (!activeQuiz) return;
    const currentPart = [
      { id: 'part1', start: 1, end: 6, label: 'Part 1' },
      { id: 'part2', start: 7, end: 31, label: 'Part 2' },
      { id: 'part3', start: 32, end: 70, label: 'Part 3' },
      { id: 'part4', start: 71, end: 100, label: 'Part 4' },
      { id: 'part5', start: 101, end: 130, label: 'Part 5' },
      { id: 'part6', start: 131, end: 146, label: 'Part 6' },
      { id: 'part7', start: 147, end: 200, label: 'Part 7' }
    ].find(p => p.id === activePartId);

    const startDefault = currentPart ? currentPart.start : 131;
    const endDefault = currentPart ? Math.min(startDefault + 3, currentPart.end) : 134;

    const newPassageId = uuidv4();
    const rangeStr = `${startDefault} - ${endDefault}`;
    const newPassage = {
      id: newPassageId,
      title: `Đoạn văn bài đọc (Câu ${rangeStr})`,
      content: '',
      images: [],
      startNum: startDefault,
      endNum: endDefault,
      rangeStr: rangeStr,
      blankNumbers: Array.from({ length: endDefault - startDefault + 1 }, (_, i) => String(startDefault + i))
    };

    const newReadingPassages = [...(activeQuiz.readingPassages || []), newPassage];
    const newQuestions = (activeQuiz.questions || []).map(item => {
      const qNum = parseInt(item.blankNumber, 10);
      if (!isNaN(qNum) && qNum >= startDefault && qNum <= endDefault) {
        return { ...item, readingGroupId: newPassageId };
      }
      return item;
    });

    setQuizzes(prev => prev.map(q => q.id === activeQuizId ? {
      ...q,
      readingPassages: newReadingPassages,
      questions: newQuestions,
      updatedAt: Date.now()
    } : q));
  };

  const handleUploadReadingPassageImages = (passageId, files) => {
    if (!activeQuiz) return;
    const imageFiles = Array.from(files || []).filter(f => f.type.startsWith('image/'));
    if (!imageFiles.length) return;

    const readPromises = imageFiles.map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve({
            id: uuidv4(),
            name: file.name,
            data: e.target.result
          });
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readPromises).then(newImages => {
      setQuizzes(prev => prev.map(q => {
        if (q.id !== activeQuizId) return q;
        const newReadingPassages = (q.readingPassages || []).map(p => {
          if (p.id === passageId) {
            return {
              ...p,
              images: [...(p.images || []), ...newImages]
            };
          }
          return p;
        });

        return {
          ...q,
          readingPassages: newReadingPassages,
          updatedAt: Date.now()
        };
      }));
    });
  };

  const handleDeleteReadingPassageImage = (passageId, imageId) => {
    if (!activeQuiz) return;
    setQuizzes(prev => prev.map(q => {
      if (q.id !== activeQuizId) return q;
      const newReadingPassages = (q.readingPassages || []).map(p => {
        if (p.id === passageId) {
          return {
            ...p,
            images: (p.images || []).filter(img => img.id !== imageId)
          };
        }
        return p;
      });

      return {
        ...q,
        readingPassages: newReadingPassages,
        updatedAt: Date.now()
      };
    }));
  };

  const handleUpdateListeningPassageProp = (passageId, prop, value) => {
    if (!activeQuiz) return;
    const listeningPassages = activeQuiz.listeningPassages || [];
    const readingPassages = activeQuiz.readingPassages || [];

    if (listeningPassages.some(p => p.id === passageId)) {
      const newListeningPassages = listeningPassages.map(p => 
        p.id === passageId ? { ...p, [prop]: value } : p
      );
      setQuizzes(quizzes.map(q => q.id === activeQuizId ? { ...q, listeningPassages: newListeningPassages } : q));
    } else if (readingPassages.some(p => p.id === passageId)) {
      const newReadingPassages = readingPassages.map(p => 
        p.id === passageId ? { ...p, [prop]: value } : p
      );
      setQuizzes(quizzes.map(q => q.id === activeQuizId ? { ...q, readingPassages: newReadingPassages } : q));
    }
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
                onClick={() => requestExitQuiz(() => setSelectedFolderId('all'))}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Folder size={16} />
                  Tất cả bộ đề
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{quizzes.length}</span>
              </div>

              <div 
                className={`folder-list-item ${selectedFolderId === 'uncategorized' ? 'active' : ''}`}
                onClick={() => requestExitQuiz(() => setSelectedFolderId('uncategorized'))}
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
                  onClick={() => requestExitQuiz(() => setSelectedFolderId(folder.id))}
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
                    background: modeFilter === 'toeic' ? 'linear-gradient(135deg, #f472b6, #00e3fd)' : 'linear-gradient(135deg, #c59aff, #00e3fd)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}>
                    {modeFilter === 'toeic'
                      ? '🎧 Luyện Thi TOEIC (Listening & Reading)'
                      : (selectedFolderId === 'all' ? 'Bộ đề trắc nghiệm' : 
                         selectedFolderId === 'uncategorized' ? 'Bộ đề chưa phân loại' : 
                         (folders.find(f => f.id === selectedFolderId)?.name || 'Bộ đề trắc nghiệm'))}
                  </h2>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                    {modeFilter === 'toeic'
                      ? `${filteredQuizzes.length} đề thi TOEIC · Chọn một đề thi để luyện tập chia đôi màn hình ETS`
                      : `${filteredQuizzes.length} bộ đề · Chọn một bộ đề để bắt đầu ôn tập`}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {renderSyncBadge()}
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
                        onClick={handleCreateTOEICFullQuiz}
                        style={{
                          padding: '9px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                          border: '1px solid rgba(236,72,153,0.35)', cursor: 'pointer',
                          background: 'linear-gradient(135deg, rgba(236,72,153,0.22), rgba(124,77,255,0.22))',
                          color: '#f472b6',
                          display: 'flex', alignItems: 'center', gap: '6px',
                          transition: 'all 0.2s',
                          boxShadow: '0 4px 15px rgba(236,72,153,0.2)'
                        }}
                        title="Tự động khởi tạo cấu trúc 200 câu TOEIC chuẩn (Part 1 - Part 7)"
                      >
                        <Headphones size={15} /> Khởi tạo đề TOEIC (200 câu)
                      </button>
                      <button
                        onClick={() => {
                          setIsImporting(true);
                          setImportTargetQuizId(null);
                          setIsCreatingAiQuiz(false);
                          setActiveQuizId(null);
                          if (modeFilter === 'toeic') setImportMode('listening');
                        }}
                        style={{
                          padding: '9px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                          border: '1px solid rgba(var(--glass-rgb),0.1)', cursor: 'pointer',
                          background: modeFilter === 'toeic' ? 'rgba(236,72,153,0.22)' : 'rgba(var(--glass-rgb),0.04)',
                          color: modeFilter === 'toeic' ? '#f472b6' : 'var(--text-main)',
                          display: 'flex', alignItems: 'center', gap: '6px',
                          transition: 'all 0.2s'
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{modeFilter === 'toeic' ? 'headphones' : 'description'}</span>
                        {modeFilter === 'toeic' ? 'Nhập đề TOEIC' : 'Nhập từ Word'}
                      </button>
                      <button
                        onClick={() => jsonFileInputRef.current?.click()}
                        style={{
                          padding: '9px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                          border: '1px solid rgba(var(--glass-rgb),0.1)', cursor: 'pointer',
                          background: 'rgba(var(--glass-rgb),0.04)', color: 'var(--text-main)',
                          display: 'flex', alignItems: 'center', gap: '6px',
                          transition: 'all 0.2s'
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>file_upload</span>
                        Nhập file JSON
                      </button>
                      <input 
                        ref={jsonFileInputRef} 
                        type="file" 
                        accept="application/json" 
                        onChange={handleJsonImport} 
                        style={{ display: 'none' }} 
                      />
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
                                    handleShareQuiz(quiz);
                                    setActiveQuizCardMenu(null);
                                  }}
                                >
                                  <Share2 size={14} style={{ color: '#10b981' }} />
                                  Chia sẻ
                                </button>
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
                  requestExitQuiz(() => {
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
                  });
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
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0, whiteSpace: 'nowrap', alignItems: 'center' }}>
                {renderSyncBadge()}
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
                {!isTesting && (
                  <button 
                    className="btn" 
                    style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#fbbf24', borderColor: 'rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.1)' }} 
                    onClick={() => setShowBulkAnswerKeyModal(true)}
                    title="Nhập nhanh bảng đáp án A/B/C/D cho toàn bộ 200 câu hỏi"
                  >
                    <Key size={16} /> 🔑 Nhập đáp án 200 câu
                  </button>
                )}
                <button 
                  className="btn" 
                  style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#10b981', borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.06)' }} 
                  onClick={() => handleShareQuiz(activeQuiz)}
                >
                  <Share2 size={16} /> Chia sẻ
                </button>
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
                        if (importMode === 'listening' && (previewListeningPassages?.length > 0 || previewReadingPassage)) {
                          const passagesToDisplay = previewListeningPassages && previewListeningPassages.length > 0
                            ? previewListeningPassages
                            : [previewReadingPassage];

                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                              {passagesToDisplay.map((passage, pIdx) => {
                                const blockQuestions = previewQuestions.filter(q => q.listeningGroupId === passage.id);
                                const displayQuestions = blockQuestions.length > 0 ? blockQuestions : previewQuestions;

                                return (
                                  <div key={passage.id || pIdx} style={{ background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.3)', borderRadius: '12px', padding: '16px' }}>
                                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#f472b6', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <Headphones size={16} /> LISTENING BLOCK {pIdx + 1}: {passage.title || 'Bài nghe'}
                                    </div>

                                    {passage.audioUrl && (
                                      <TOEICAudioPlayer src={passage.audioUrl} title={passage.audioName || passage.title} />
                                    )}

                                    {passage.images && passage.images.length > 0 && (
                                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', margin: '12px 0' }}>
                                        {passage.images.map(img => (
                                          <img
                                            key={img.id}
                                            src={img.data || img.url}
                                            alt={img.name}
                                            onClick={() => setActiveLightboxImage(img.data || img.url)}
                                            style={{ width: '120px', height: '90px', objectFit: 'cover', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }}
                                          />
                                        ))}
                                      </div>
                                    )}

                                    {passage.transcript && (
                                      <div style={{ marginTop: '10px', background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(236,72,153,0.2)', fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                                        <strong style={{ color: '#f472b6', display: 'block', marginBottom: '4px' }}>📝 Kịch bản (Transcript):</strong>
                                        {passage.transcript}
                                      </div>
                                    )}

                                    <div style={{ marginTop: '14px' }}>
                                      <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: '#d8ccff', marginBottom: '8px' }}>
                                        Questions / Câu hỏi ({displayQuestions.length} câu)
                                      </div>
                                      {displayQuestions.map((q, qIdx) => (
                                        <div key={q.id || qIdx} style={{ marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px dashed rgba(var(--glass-rgb),0.08)' }}>
                                          <div style={{ fontWeight: '600', marginBottom: '6px', fontSize: '14px', color: '#fff' }}>
                                            Câu {q.blankNumber || (qIdx + 1)}: {q.question}
                                          </div>
                                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '13px', color: 'var(--text-muted)' }}>
                                            {Object.keys(q.options).map(optKey => (
                                              <div key={optKey}>{optKey}. {q.options[optKey]}</div>
                                            ))}
                                          </div>
                                          {(q.answer || q.explanation) && (
                                            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--accent-green)', background: 'rgba(16,185,129,0.1)', padding: '6px 10px', borderRadius: '6px' }}>
                                              {q.answer && <span style={{ fontWeight: 'bold', marginRight: '8px' }}>✓ Đáp án: {q.answer}</span>}
                                              {q.explanation && <span>📝 GT: {q.explanation.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}</span>}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }

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
                                        {q.explanation && <div style={{ color: 'var(--text-main)' }}>📝 GT: {q.explanation.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}</div>}
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
                            <div style={{ fontWeight: '500', marginBottom: '8px', fontSize: '15px' }}>Câu {q.blankNumber || (i + 1)}: {q.question}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                              {Object.keys(q.options).map(optKey => (
                                <div key={optKey}>{optKey}. {q.options[optKey]}</div>
                              ))}
                            </div>
                            {(q.answer || q.explanation) && (
                              <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--accent-green)', background: 'rgba(16,185,129,0.1)', padding: '8px', borderRadius: '6px' }}>
                                {q.answer && <div style={{ marginBottom: '4px', fontWeight: 'bold' }}>✓ Đáp án: {q.answer}</div>}
                                {q.explanation && <div style={{ color: 'var(--text-main)' }}>📝 GT: {q.explanation.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}</div>}
                              </div>
                            )}
                          </div>
                        ));
                      })()}
                    </div>
                    <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                      <button className="btn" onClick={() => setPreviewQuestions(null)}>Quay lại chỉnh sửa</button>
                      <button className="btn btn-primary" onClick={handleConfirmImport}>
                        Xác nhận {(importTargetQuizId && importMode !== 'reading' && importMode !== 'listening') ? 'Thêm' : 'Khởi tạo Đề'}
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
                      <button
                        onClick={() => setImportMode('listening')}
                        style={{
                          padding: '7px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700,
                          border: '1px solid rgba(var(--glass-rgb),0.1)', cursor: 'pointer',
                          background: importMode === 'listening' ? 'rgba(236,72,153,0.22)' : 'rgba(var(--glass-rgb),0.04)',
                          color: importMode === 'listening' ? '#f472b6' : 'var(--text-muted)',
                          display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                      >
                        <Headphones size={14} />
                        LISTENING TOEIC (Audio + Ảnh)
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

                    {importMode === 'listening' && (
                      <div style={{
                        background: 'rgba(236,72,153,0.06)',
                        border: '1px solid rgba(236,72,153,0.25)',
                        borderRadius: '12px',
                        padding: '16px',
                        marginBottom: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '14px'
                      }}>
                        {/* Sub-Part Selector */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                          <div style={{ fontWeight: 700, fontSize: '13px', color: '#f472b6', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Headphones size={16} /> Chọn Phần Thi TOEIC Listening:
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => setToeicPart('part1')}
                              style={{
                                padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer',
                                background: toeicPart === 'part1' ? '#f472b6' : 'rgba(255,255,255,0.08)',
                                color: toeicPart === 'part1' ? '#000' : 'var(--text-muted)'
                              }}
                            >
                              Part 1 (Ảnh + 1 câu)
                            </button>
                            <button
                              type="button"
                              onClick={() => setToeicPart('part2')}
                              style={{
                                padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer',
                                background: toeicPart === 'part2' ? '#f472b6' : 'rgba(255,255,255,0.08)',
                                color: toeicPart === 'part2' ? '#000' : 'var(--text-muted)'
                              }}
                            >
                              Part 2 (Audio + 3 đáp án)
                            </button>
                            <button
                              type="button"
                              onClick={() => setToeicPart('part34')}
                              style={{
                                padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer',
                                background: toeicPart === 'part34' ? '#f472b6' : 'rgba(255,255,255,0.08)',
                                color: toeicPart === 'part34' ? '#000' : 'var(--text-muted)'
                              }}
                            >
                              Part 3,4 (Gom 3 câu/block)
                            </button>
                          </div>
                        </div>

                        {/* Bulk Audio Upload for Part 1, Part 2, Part 3, 4 */}
                        {true ? (
                          <div style={{ background: 'rgba(0,0,0,0.25)', padding: '12px', borderRadius: '10px', border: '1px dashed rgba(236,72,153,0.35)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: '#8eefff' }}>
                                🎵 Tải Nhiều File Âm Thanh Bài Nghe Hàng Loạt (Bulk Audio Upload):
                              </div>
                              <label style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px',
                                background: 'linear-gradient(135deg, #7c4dff, #ec4899)', borderRadius: '6px', fontSize: '12px',
                                color: '#fff', cursor: 'pointer', fontWeight: 700
                              }}>
                                <Upload size={14} /> Chọn nhiều file MP3...
                                <input type="file" accept="audio/*" multiple style={{ display: 'none' }} onChange={handleBulkAudioUpload} />
                              </label>
                            </div>

                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                              💡 Tên file dạng <code style={{ color: '#f472b6' }}>Test 01_Part 3_32-34.mp3</code> sẽ tự động nhận diện và ghép đúng vào <strong>Câu 32-34</strong>!
                            </div>

                            {bulkAudioFiles.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto', paddingRight: '4px' }}>
                                {bulkAudioFiles.map((file) => (
                                  <div key={file.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.05)', padding: '6px 10px', borderRadius: '6px', fontSize: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                      <Music size={14} color="#f472b6" />
                                      <span style={{ color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                                      {file.rangeStr && (
                                        <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(0,227,253,0.2)', color: '#8eefff', fontSize: '10px', fontWeight: 700 }}>
                                          Câu {file.rangeStr}
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setBulkAudioFiles(bulkAudioFiles.filter(x => x.id !== file.id))}
                                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => setBulkAudioFiles([])}
                                  style={{ alignSelf: 'flex-end', background: 'none', border: 'none', color: '#ef4444', fontSize: '11px', cursor: 'pointer', marginTop: '4px' }}
                                >
                                  Xóa tất cả {bulkAudioFiles.length} file audio
                                </button>
                              </div>
                            ) : (
                              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '10px' }}>
                                Chưa chọn file audio hàng loạt nào. Bạn cũng có thể chọn 1 file lẻ bên dưới.
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', border: '1px dashed rgba(236,72,153,0.3)' }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                              🎵 File Âm Thanh (.mp3, .wav, .m4a):
                            </div>
                            {listeningAudio ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ flex: 1, fontSize: '12px', color: '#8eefff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  ✓ {listeningAudio.name}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setListeningAudio(null)}
                                  style={{ background: 'rgba(239,68,68,0.2)', border: 'none', color: '#ef4444', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', cursor: 'pointer' }}
                                >
                                  Xóa
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                                  background: 'rgba(124,77,255,0.2)', borderRadius: '6px', fontSize: '12px',
                                  color: '#d8ccff', cursor: 'pointer', fontWeight: 600, width: 'fit-content'
                                }}>
                                  <Upload size={14} /> Chọn File Audio...
                                  <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleListeningAudioUpload} />
                                </label>
                                <input
                                  type="text"
                                  placeholder="Hoặc dán URL Audio (https://...)"
                                  value={listeningAudioUrl}
                                  onChange={e => setListeningAudioUrl(e.target.value)}
                                  style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                                />
                              </div>
                            )}
                           </div>
                        )}

                        {/* Images Upload */}
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', border: '1px dashed rgba(236,72,153,0.3)' }}>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                            🖼️ Hình Ảnh Đính Kèm (Part 1 Photo / Sơ đồ Part 3-4):
                          </div>
                          <label style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                            background: 'rgba(0,227,253,0.15)', borderRadius: '6px', fontSize: '12px',
                            color: '#8eefff', cursor: 'pointer', fontWeight: 600, width: 'fit-content'
                          }}>
                            <ImageIcon size={14} /> Tải Ảnh Lên...
                            <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleListeningImagesUpload} />
                          </label>

                          {listeningImages.length > 0 && (
                            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                              {listeningImages.map(img => (
                                <div key={img.id} style={{ position: 'relative', width: '50px', height: '50px', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)' }}>
                                  <img src={img.data} alt={img.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  <button
                                    type="button"
                                    onClick={() => setListeningImages(listeningImages.filter(x => x.id !== img.id))}
                                    style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', borderRadius: '50%', width: '16px', height: '16px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  >
                                    X
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <p style={{ color: 'var(--text-muted)', marginBottom: '16px', fontSize: '14px' }}>
                      {importMode === 'listening'
                        ? <>Dán theo mẫu: <strong>LISTENING: [Nội dung kịch bản Transcript (tùy chọn)]\n\nCâu 1: [câu hỏi] A...B...C...D...</strong>. Chọn file audio hoặc ảnh đính kèm nếu có.</>
                        : importMode === 'reading'
                        ? <>Dán theo mẫu: <strong>READING: [tiêu đề + passage có blank number như (135), 136...]\n\n135. [câu hỏi] A...B...C...D...</strong>. Passage được lưu 1 block và câu hỏi map theo số.</>
                        : <>Copy và Paste trực tiếp từ Word. Định dạng yêu cầu: <strong>"Câu 1: [đề] A. [đáp án] B. [đáp án] C. [đáp án] D. [đáp án]"</strong>. (Tùy chọn ghi thêm "Đáp án: A", "Giải thích: ...")</>}
                    </p>
                    <textarea 
                      style={{ flex: 1, resize: 'none', fontFamily: 'monospace' }} 
                      value={importText} onChange={e => setImportText(e.target.value)}
                      placeholder={importMode === 'listening'
                        ? "LISTENING:\nWoman: Excuse me, where can I find the train schedule?\nMan: You can check the information board near gate 3.\n\nCâu 1: What is the woman asking about?\nA. A train schedule\nB. A flight ticket\nC. A hotel room\nD. A taxicab"
                        : importMode === 'reading'
                        ? "READING:\nBiggs, CEO and founder of BiggsGraphics...\n\nCâu 1: Từ (131) phù hợp nhất là gì?\nA. seek\nB. to seek\nC. seeking\nD. are seeking"
                        : "Câu 1: 1 + 1 bằng mấy?\nA. 1\nB. 2\nC. 3\nD. 4"}
                    />
                    <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                      <button className="btn" onClick={() => { setIsImporting(false); setImportTargetQuizId(null); setPreviewQuestions(null); setPreviewReadingPassage(null); setImportMode('normal'); setListeningAudio(null); setListeningAudioUrl(''); setListeningImages([]); }}>Hủy</button>
                      <button className="btn btn-primary" onClick={handleParseImport}>Xem trước</button>
                    </div>
                  </>
                )}
              </div>
            ) : activeQuiz ? (
              (() => {
                const toeicParts = [
                  { id: 'part1', label: 'Part 1', start: 1, end: 6, title: 'Photographs (Câu 1–6)' },
                  { id: 'part2', label: 'Part 2', start: 7, end: 31, title: 'Question–Response (Câu 7–31)' },
                  { id: 'part3', label: 'Part 3', start: 32, end: 70, title: 'Conversations (Câu 32–70)' },
                  { id: 'part4', label: 'Part 4', start: 71, end: 100, title: 'Talks (Câu 71–100)' },
                  { id: 'part5', label: 'Part 5', start: 101, end: 130, title: 'Incomplete Sentences (Câu 101–130)' },
                  { id: 'part6', label: 'Part 6', start: 131, end: 146, title: 'Text Completion (Câu 131–146)' },
                  { id: 'part7', label: 'Part 7', start: 147, end: 200, title: 'Reading Comprehension (Câu 147–200)' },
                  { id: 'all', label: 'Tất cả', start: 1, end: 200, title: 'Toàn bộ 200 câu (1–200)' }
                ];

                const currentPartInfo = toeicParts.find(p => p.id === activePartId) || toeicParts[0];

                let rawQuestions = activeQuiz?.questions || [];
                if (isTesting && testMode === 'starred') {
                  rawQuestions = rawQuestions.filter(q => q.isStarred);
                }

                const questionsForDisplay = (activePartId === 'all' || !activePartId)
                  ? rawQuestions
                  : rawQuestions.filter(q => {
                      const num = Number(q.blankNumber);
                      return num >= currentPartInfo.start && num <= currentPartInfo.end;
                    });

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

                    {/* TOEIC Part Classification Navigation Bar */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justify: 'space-between',
                      gap: '12px',
                      background: 'rgba(15, 23, 42, 0.85)',
                      backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '14px',
                      padding: '8px 14px',
                      marginBottom: '14px',
                      position: 'sticky',
                      top: 0,
                      zIndex: 100,
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
                      flexWrap: 'wrap'
                    }}>
                      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px', scrollbarWidth: 'none', flex: 1, minWidth: 0 }}>
                        {toeicParts.map(p => {
                          const isActive = activePartId === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setActivePartId(p.id)}
                              title={`${p.label}: ${p.title}`}
                              style={{
                                padding: '6px 14px',
                                borderRadius: '8px',
                                fontSize: '13px',
                                fontWeight: 700,
                                border: 'none',
                                cursor: 'pointer',
                                background: isActive ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255, 255, 255, 0.08)',
                                color: isActive ? '#ffffff' : 'var(--text-muted)',
                                boxShadow: isActive ? '0 2px 10px rgba(99, 102, 241, 0.4)' : 'none',
                                transition: 'all 0.2s ease',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {p.label}
                            </button>
                          );
                        })}
                      </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                      Câu <strong style={{ color: '#60a5fa', fontSize: '15px' }}>
                        {(activeQuiz?.questions || []).findIndex(q => q && q.userAnswer === null) !== -1 
                          ? (activeQuiz?.questions || []).findIndex(q => q && q.userAnswer === null) + 1 
                          : 1}
                      </strong>/{activeQuizStats.total}
                    </div>

                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#34d399',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      fontSize: '12px',
                      fontWeight: 700
                    }}>
                      <CheckCircle size={14} />
                      {activeQuizStats.correct}/{activeQuizStats.answered}
                    </div>
                  </div>
                </div>

                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>

                  {/* Bulk Audio Manager for Edit Mode (Part 1, 2, 3, 4) */}
                  {!isTesting && (
                    <div style={{
                      background: 'rgba(236,72,153,0.06)',
                      border: '1px solid rgba(236,72,153,0.25)',
                      borderRadius: '12px',
                      padding: '14px 18px',
                      marginBottom: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#f472b6', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Headphones size={16} /> 🎵 Tải Nhiều File Âm Thanh Bài Nghe Hàng Loạt (Bulk Audio Upload):
                        </div>
                        <label style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px',
                          background: 'linear-gradient(135deg, #7c4dff, #ec4899)', borderRadius: '8px', fontSize: '12px',
                          color: '#fff', cursor: 'pointer', fontWeight: 700, boxShadow: '0 2px 10px rgba(236,72,153,0.3)'
                        }}>
                          <Upload size={14} /> Chọn nhiều file Audio MP3 (Part 1, 2, 3, 4)...
                          <input type="file" accept="audio/*" multiple style={{ display: 'none' }} onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            if (!files.length) return;
                            const audioFiles = files.filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f.name));
                            if (!audioFiles.length) return;
                            audioFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

                            const readPromises = audioFiles.map(file => new Promise((resolve) => {
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                const rangeInfo = extractQuestionRangeFromFilename(file.name);
                                resolve({
                                  id: uuidv4(),
                                  name: file.name,
                                  data: ev.target.result,
                                  startNum: rangeInfo ? rangeInfo.startNum : null,
                                  endNum: rangeInfo ? rangeInfo.endNum : null,
                                  rangeStr: rangeInfo ? rangeInfo.rangeStr : null,
                                });
                              };
                              reader.readAsDataURL(file);
                            }));

                            Promise.all(readPromises).then(results => {
                              applyBulkAudiosToActiveQuiz(results);
                              alert(`🎉 Đã tải lên và gán thành công ${results.length} file audio vào các bài nghe TOEIC (Part 1 - Part 4)!`);
                            });
                            e.target.value = '';
                          }} />
                        </label>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        💡 File tên dạng <code style={{ color: '#f472b6' }}>Part 1_1-6.mp3</code>, <code style={{ color: '#f472b6' }}>Part 2_7-31.mp3</code>, hoặc <code style={{ color: '#f472b6' }}>32-34.mp3</code> sẽ tự động nhận diện và ghép đúng vào <strong>Part 1, Part 2, Part 3, Part 4</strong>!
                      </div>
                    </div>
                  )}
                  <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '24px', position: 'relative', overflow: 'hidden' }}>
                    <div 
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', opacity: activeQuiz.keyTakeaways ? 1 : 0.8 }}
                      onClick={() => setIsTakeawaysCollapsed(!isTakeawaysCollapsed)}
                    >
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--accent-orange)' }}>
                        <Lightbulb size={18} />
                        <h4 style={{ margin: 0, fontWeight: 'bold', fontSize: '15px' }}>Kiến Thức Cốt Lõi (Cheat Sheet)</h4>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', alignItems: 'flex-start' }}>
                          <textarea
                            value={quickNoteInput}
                            onChange={(e) => setQuickNoteInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && quickNoteInput.trim()) {
                                e.preventDefault();
                                handleAddToTakeaways(quickNoteInput);
                                setQuickNoteInput('');
                              }
                            }}
                            placeholder="Thêm ghi chú nhanh vào Kiến Thức Cốt Lõi (Nhấn Enter để xuống dòng, Ctrl+Enter để thêm)..."
                            rows={1}
                            style={{
                              flex: 1, background: 'rgba(0,0,0,0.3)', color: 'var(--text-main)',
                              border: '1px solid rgba(255,152,0,0.3)', borderRadius: '8px',
                              padding: '8px 12px', fontSize: '13px', outline: 'none', resize: 'vertical',
                              fontFamily: 'inherit', minHeight: '38px', fieldSizing: 'content'
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (quickNoteInput.trim()) {
                                handleAddToTakeaways(quickNoteInput);
                                setQuickNoteInput('');
                              }
                            }}
                            style={{
                              padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                              background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#000',
                              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                              boxShadow: '0 2px 10px rgba(245,158,11,0.3)', height: '38px', flexShrink: 0
                            }}
                          >
                            <Plus size={14} /> Thêm ghi chú
                          </button>
                        </div>

                        {(() => {
                          const blocks = parseTakeawaysToBlocks(activeQuiz.keyTakeaways || '');
                          if (blocks.length === 0) {
                            return (
                              <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text-muted)', fontSize: '13px', background: 'rgba(0,0,0,0.15)', borderRadius: '10px', border: '1px dashed rgba(255,152,0,0.2)' }}>
                                Chưa có block ghi chú nào. Bôi đen từ vựng trong đề và chọn <strong>+ Cheat Sheet</strong> hoặc gõ vào ô phía trên để thêm block!
                              </div>
                            );
                          }
                          return (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px', marginTop: '10px' }}>
                              {blocks.map((block, idx) => (
                                <div
                                  key={idx}
                                  style={{
                                    background: 'linear-gradient(135deg, rgba(255,152,0,0.08), rgba(251,191,36,0.03))',
                                    border: editingBlockIdx === idx ? '1px solid #fbbf24' : '1px solid rgba(255,152,0,0.22)',
                                    borderRadius: '12px',
                                    padding: '12px 14px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justify: 'space-between',
                                    gap: '8px',
                                    boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
                                    transition: 'all 0.2s ease',
                                  }}
                                >
                                  {editingBlockIdx === idx ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase' }}>✏️ Sửa nội dung Block:</div>
                                      <textarea
                                        value={editingBlockText}
                                        onChange={(e) => setEditingBlockText(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                            e.preventDefault();
                                            handleUpdateTakeawayBlock(idx, editingBlockText);
                                          } else if (e.key === 'Escape') {
                                            setEditingBlockIdx(null);
                                          }
                                        }}
                                        autoFocus
                                        placeholder="Nhập nội dung block..."
                                        style={{
                                          width: '100%',
                                          background: 'rgba(0,0,0,0.4)',
                                          color: 'var(--text-main)',
                                          border: '1px solid rgba(255,152,0,0.4)',
                                          borderRadius: '6px',
                                          padding: '8px',
                                          fontSize: '13px',
                                          fontFamily: 'inherit',
                                          resize: 'vertical',
                                          minHeight: '64px',
                                          outline: 'none',
                                          fieldSizing: 'content'
                                        }}
                                      />
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                        <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Enter = xuống dòng | Ctrl+Enter = Lưu</span>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                          <button
                                            type="button"
                                            onClick={() => setEditingBlockIdx(null)}
                                            style={{
                                              padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                                              background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer'
                                            }}
                                          >
                                            Hủy
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleUpdateTakeawayBlock(idx, editingBlockText)}
                                            style={{
                                              padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                                              background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#000', border: 'none', cursor: 'pointer'
                                            }}
                                          >
                                            Lưu
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                        <span style={{ color: '#fbbf24', fontSize: '14px', marginTop: '2px', flexShrink: 0 }}>💡</span>
                                        <div
                                          style={{ flex: 1, fontSize: '13.5px', lineHeight: '1.55', color: 'var(--text-main)', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}
                                          dangerouslySetInnerHTML={{ __html: block.rawHtml }}
                                        />
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px', marginTop: '4px' }}>
                                        <button
                                          type="button"
                                          onClick={() => handleSpeak(block.text)}
                                          style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: '3px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                                          title="Phát âm"
                                        >
                                          <Volume2 size={13} />
                                        </button>
                                        {!isTesting && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingBlockIdx(idx);
                                              setEditingBlockText(block.text);
                                            }}
                                            style={{ background: 'none', border: 'none', color: '#fbbf24', opacity: 0.85, cursor: 'pointer', padding: '3px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                                            title="Sửa block này"
                                          >
                                            <Edit3 size={13} />
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            navigator.clipboard.writeText(block.text);
                                            setCopiedBlockIdx(idx);
                                            setTimeout(() => setCopiedBlockIdx(null), 1500);
                                          }}
                                          style={{ background: 'none', border: 'none', color: copiedBlockIdx === idx ? 'var(--accent-green)' : 'var(--text-muted)', cursor: 'pointer', padding: '3px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                                          title="Sao chép"
                                        >
                                          {copiedBlockIdx === idx ? <CheckCircle size={13} /> : <Copy size={13} />}
                                        </button>
                                        {!isTesting && (
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteTakeawayBlock(idx)}
                                            style={{ background: 'none', border: 'none', color: '#ef4444', opacity: 0.7, cursor: 'pointer', padding: '3px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                                            title="Xóa block này"
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        )}
                                      </div>
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        })()}
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

                  {questionsForDisplay.length === 0 && isTesting && testMode === 'starred' && (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                      <Star size={40} style={{ opacity: 0.2, margin: '0 auto 16px auto', display: 'block' }} />
                      <p>Bạn chưa đánh dấu câu hỏi nào để ôn tập.</p>
                    </div>
                  )}

                  {/* Translation Popup */}
                  {translationPopup && createPortal(
                    <div
                      className="translation-popup"
                      onMouseUp={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{
                        position: 'fixed',
                        left: `${translationPopup.x}px`,
                        top: `${translationPopup.y}px`,
                        transform: translationPopup.isAbove ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
                        zIndex: 999999,
                        background: 'linear-gradient(135deg, #1a1e3a, #1e2140)',
                        borderRadius: '14px',
                        padding: '14px 18px',
                        border: '1px solid rgba(124,77,255,0.4)',
                        boxShadow: '0 12px 40px rgba(0,0,0,0.7), 0 0 24px rgba(124,77,255,0.25)',
                        minWidth: '220px',
                        maxWidth: '380px',
                        animation: 'fadeInUp 0.15s ease-out',
                      }}
                    >
                      {/* Arrow */}
                      <div style={{
                        position: 'absolute',
                        bottom: translationPopup.isAbove ? '-6px' : 'auto',
                        top: translationPopup.isAbove ? 'auto' : '-6px',
                        left: '50%',
                        transform: 'translateX(-50%) rotate(45deg)',
                        width: '12px',
                        height: '12px',
                        background: '#1e2140',
                        borderRight: translationPopup.isAbove ? '1px solid rgba(124,77,255,0.3)' : 'none',
                        borderBottom: translationPopup.isAbove ? '1px solid rgba(124,77,255,0.3)' : 'none',
                        borderLeft: translationPopup.isAbove ? 'none' : '1px solid rgba(124,77,255,0.3)',
                        borderTop: translationPopup.isAbove ? 'none' : '1px solid rgba(124,77,255,0.3)',
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
                              onClick={() => handleAddToTakeaways(translationPopup.text)}
                              style={{
                                padding: '6px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                                background: takeawayAddedSuccess ? 'var(--accent-green)' : 'rgba(255,152,0,0.15)',
                                color: takeawayAddedSuccess ? 'white' : '#fbbf24', border: '1px solid rgba(255,152,0,0.3)', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s'
                              }}
                            >
                              {takeawayAddedSuccess ? <CheckCircle size={12} /> : <Lightbulb size={12} />}
                              {takeawayAddedSuccess ? 'Đã thêm' : '+ Cheat Sheet'}
                            </button>
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
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleAddToTakeaways(`${translationPopup.text}: ${translatedText}`)}
                              style={{
                                padding: '6px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                                background: takeawayAddedSuccess ? 'var(--accent-green)' : 'rgba(255,152,0,0.15)',
                                color: takeawayAddedSuccess ? 'white' : '#fbbf24', border: '1px solid rgba(255,152,0,0.3)', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s'
                              }}
                            >
                              {takeawayAddedSuccess ? <CheckCircle size={12} /> : <Lightbulb size={12} />}
                              {takeawayAddedSuccess ? 'Đã thêm Cheat Sheet' : '+ Cheat Sheet'}
                            </button>
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

                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={handleInsertTranslation}
                              title="Chèn nghĩa tiếng Việt vào sau đoạn văn bản"
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
                          </>
                        )}
                      </div>
                    </div>,
                    document.body
                  )}

                  {/* Quick Part Text Input Box */}
                  {!isTesting && (
                    <div className="glass-panel" style={{
                      padding: '16px',
                      marginBottom: '20px',
                      border: '1px solid rgba(124,77,255,0.35)',
                      borderRadius: '12px',
                      background: 'rgba(124,77,255,0.05)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#d8ccff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <FileText size={16} /> 📝 Dán theo mẫu để điền / sửa nhanh nội dung cho {currentPartInfo?.label} (Câu {currentPartInfo?.start}–{currentPartInfo?.end}):
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowPartQuickInput(!showPartQuickInput)}
                          style={{ background: 'none', border: 'none', color: '#a78bfa', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                        >
                          {showPartQuickInput ? 'Thu gọn ▲' : 'Mở rộng ▼'}
                        </button>
                      </div>

                      {showPartQuickInput && (
                        <div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: '1.6' }}>
                            💡 <strong>Cấu trúc Dán theo mẫu:</strong>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', marginTop: '6px' }}>
                              <div style={{ background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.2)', padding: '6px 8px', borderRadius: '6px' }}>
                                <span style={{ color: '#f472b6', fontWeight: 700, fontSize: '11px' }}>🎧 LISTENING (Part 1-4):</span>
                                <div style={{ fontSize: '10.5px', color: '#cbd5e1', marginTop: '2px', fontFamily: 'monospace' }}>
                                  TRANSCRIPT: [Kịch bản English]<br />
                                  TRANSLATION: [Bản dịch Tiếng Việt]<br />
                                  NOTES: [Từ vựng & Ghi chú]
                                </div>
                              </div>
                              <div style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)', padding: '6px 8px', borderRadius: '6px' }}>
                                <span style={{ color: '#8eefff', fontWeight: 700, fontSize: '11px' }}>📚 READING (Part 6-7):</span>
                                <div style={{ fontSize: '10.5px', color: '#cbd5e1', marginTop: '2px', fontFamily: 'monospace' }}>
                                  READING: [Đoạn văn bài đọc]
                                </div>
                              </div>
                              <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', padding: '6px 8px', borderRadius: '6px' }}>
                                <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: '11px' }}>❓ CÂU HỎI & ĐÁP ÁN:</span>
                                <div style={{ fontSize: '10.5px', color: '#cbd5e1', marginTop: '2px', fontFamily: 'monospace' }}>
                                  Câu {currentPartInfo?.start}: [Tiêu đề câu hỏi]<br />
                                  A. [Ý A] B. [Ý B] C. [Ý C] D. [Ý D]<br />
                                  Answer: A
                                </div>
                              </div>
                            </div>
                          </div>
                          <textarea
                            value={partQuickText}
                            onChange={(e) => setPartQuickText(e.target.value)}
                            placeholder={`Dán nội dung câu hỏi, kịch bản hoặc đoạn văn cho ${currentPartInfo?.label} tại đây...\n\nMẫu ví dụ cho Part 3/4:\nTRANSCRIPT:\nW: Welcome to Danforth Fashions. How may I help you?\nM: Hi, I would like to return this jacket.\n\nTRANSLATION:\nW: Chào mừng tới Danforth Fashions. Tôi có thể giúp gì cho bạn?\nM: Xin chào, tôi muốn đổi lại chiếc áo khoác này.\n\nCâu 32: Where does the conversation take place?\nA. At a clothing store\nB. At a bank\nC. At an airport\nD. At a hotel\nAnswer: A`}
                            rows={6}
                            style={{
                              width: '100%',
                              background: 'rgba(0,0,0,0.35)',
                              color: 'var(--text-main)',
                              border: '1px solid rgba(255,255,255,0.15)',
                              borderRadius: '8px',
                              padding: '10px 12px',
                              fontSize: '13px',
                              fontFamily: 'monospace',
                              resize: 'vertical',
                              marginBottom: '10px'
                            }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={handlePreviewPartQuickText}
                              style={{ fontSize: '12px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                              <Eye size={14} /> Xem trước & Nạp vào {currentPartInfo?.label}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Preview Modal for Part Quick Input */}
                  {partQuickPreviewData && (
                    <div className="custom-modal-overlay">
                      <div className="custom-modal-content" style={{ maxWidth: '680px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                        <div className="custom-modal-header">
                          <h3 className="custom-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8eefff' }}>
                            <Eye size={18} /> Xem Trước Nội Dung Nạp Cho {partQuickPreviewData.currentPart?.label || 'Part'}
                          </h3>
                          <button className="custom-modal-close-btn" onClick={() => setPartQuickPreviewData(null)}>
                            <X size={18} />
                          </button>
                        </div>

                        <div className="custom-modal-body" style={{ overflowY: 'auto', flex: 1, paddingRight: '6px' }}>
                          {partQuickPreviewData.transcriptText && (
                            <div style={{
                              background: 'rgba(236,72,153,0.1)',
                              border: '1px solid rgba(236,72,153,0.3)',
                              borderRadius: '10px',
                              padding: '12px 14px',
                              marginBottom: '12px'
                            }}>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: '#f472b6', marginBottom: '6px', textTransform: 'uppercase' }}>
                                📜 Kịch bản (Transcript) trích xuất được:
                              </div>
                              <div style={{ fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre-wrap', color: '#fff' }}>
                                {partQuickPreviewData.transcriptText}
                              </div>
                            </div>
                          )}

                          {partQuickPreviewData.translationText && (
                            <div style={{
                              background: 'rgba(124,77,255,0.1)',
                              border: '1px solid rgba(124,77,255,0.3)',
                              borderRadius: '10px',
                              padding: '12px 14px',
                              marginBottom: '12px'
                            }}>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: '#a78bfa', marginBottom: '6px', textTransform: 'uppercase' }}>
                                🇻🇳 Bản dịch kịch bản (Translation) trích xuất được:
                              </div>
                              <div style={{ fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre-wrap', color: '#fff' }}>
                                {partQuickPreviewData.translationText}
                              </div>
                            </div>
                          )}

                          {partQuickPreviewData.notesText && (
                            <div style={{
                              background: 'rgba(251,191,36,0.1)',
                              border: '1px solid rgba(251,191,36,0.3)',
                              borderRadius: '10px',
                              padding: '12px 14px',
                              marginBottom: '12px'
                            }}>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: '#fbbf24', marginBottom: '6px', textTransform: 'uppercase' }}>
                                📌 Ghi chú & Từ vựng (Notes) trích xuất được:
                              </div>
                              <div style={{ fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre-wrap', color: '#fff' }}>
                                {partQuickPreviewData.notesText}
                              </div>
                            </div>
                          )}

                          {partQuickPreviewData.parsedReadingBlocks && partQuickPreviewData.parsedReadingBlocks.length > 0 && (
                            <div style={{ marginBottom: '16px' }}>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: '#8eefff', marginBottom: '8px', textTransform: 'uppercase' }}>
                                📚 Sẽ tạo {partQuickPreviewData.parsedReadingBlocks.length} Reading Block bài đọc:
                              </div>
                              {partQuickPreviewData.parsedReadingBlocks.map((blk, idx) => (
                                <div key={idx} style={{
                                  background: 'rgba(6,182,212,0.08)',
                                  border: '1px solid rgba(6,182,212,0.25)',
                                  borderRadius: '8px',
                                  padding: '10px 12px',
                                  marginBottom: '8px'
                                }}>
                                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#8eefff' }}>
                                    Reading Block: Câu {blk.rangeStr} ({blk.questions.length} câu hỏi)
                                  </div>
                                  {blk.readingContent && (
                                    <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '4px', whiteSpace: 'pre-wrap', maxHeight: '80px', overflowY: 'auto' }}>
                                      {blk.readingContent}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#d8ccff', marginBottom: '10px' }}>
                            📝 Danh sách {partQuickPreviewData.parsedQuestions.length} câu hỏi sẽ được nạp:
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {partQuickPreviewData.parsedQuestions.map((q, idx) => (
                              <div key={idx} style={{
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '8px',
                                padding: '10px 12px'
                              }}>
                                <div style={{ fontWeight: 700, fontSize: '14px', color: '#fff', marginBottom: '6px' }}>
                                  Câu {q.blankNumber}: {q.question}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '13px', color: 'var(--text-muted)' }}>
                                  {Object.keys(q.options).map(optKey => (
                                    <div key={optKey} style={{ color: q.answer === optKey ? '#34d399' : 'inherit', fontWeight: q.answer === optKey ? 700 : 400 }}>
                                      {optKey}. {q.options[optKey]} {q.answer === optKey && '✓'}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="custom-modal-footer" style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                          <button type="button" className="btn" onClick={() => setPartQuickPreviewData(null)}>
                            Hủy / Chỉnh sửa lại
                          </button>
                          <button type="button" className="btn btn-primary" onClick={confirmApplyPartQuickText}>
                            <CheckCircle size={15} /> Xác nhận nạp vào {partQuickPreviewData.currentPart?.label || 'Part'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {(() => {
                    const readingPassageMap = new Map((activeQuiz?.readingPassages || []).map(p => [p.id, p]));
                    const listeningPassageMap = new Map((activeQuiz?.listeningPassages || []).map(p => [p.id, p]));
                    const firstNormalQuestionIndex = questionsForDisplay.findIndex(item => !item.readingGroupId && !item.listeningGroupId);
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
                      const showNormalHeader = !q.readingGroupId && !q.listeningGroupId && firstNormalQuestionIndex === i;

                      const passageObj = q.readingGroupId ? readingPassageMap.get(q.readingGroupId) : null;
                      const isSameSelectedGroup = !!selectedReadingQuestion?.readingGroupId
                        && selectedReadingQuestion.readingGroupId === q.readingGroupId;

                      if (q.listeningGroupId) {
                        const firstQuestionInListeningGroup = questionsForDisplay.findIndex(item => item.listeningGroupId === q.listeningGroupId);
                        const showListeningGroupHeader = firstQuestionInListeningGroup === i;
                        const listeningObj = listeningPassageMap.get(q.listeningGroupId) || (activeQuiz?.readingPassages || []).find(p => p.id === q.listeningGroupId);

                        if (!showListeningGroupHeader || !listeningObj) {
                          return null;
                        }

                        const groupQuestions = questionsForDisplay.filter(item => item.listeningGroupId === listeningObj.id);

                        return (
                          <TOEICListeningBlock
                            key={`listening-test-group-${listeningObj.id}`}
                            listeningObj={listeningObj}
                            groupQuestions={groupQuestions}
                            questionsForDisplay={questionsForDisplay}
                            isTesting={isTesting}
                            showTranscriptMap={showTranscriptMap}
                            setShowTranscriptMap={setShowTranscriptMap}
                            showTranslationMap={showTranslationMap}
                            setShowTranslationMap={setShowTranslationMap}
                            setActiveLightboxImage={setActiveLightboxImage}
                            copiedQuestionId={copiedQuestionId}
                            handleCopyQuestionToClipboard={handleCopyQuestionToClipboard}
                            handleToggleBookmark={handleToggleBookmark}
                            handleDeleteQuestion={handleDeleteQuestion}
                            handleUpdateQuestionProp={handleUpdateQuestionProp}
                            handleUpdateOptionProp={handleUpdateOptionProp}
                            handleUpdateListeningPassageProp={handleUpdateListeningPassageProp}
                            handleSelectAnswer={handleSelectAnswer}
                            handleCallAI={handleCallAI}
                            aiLoading={aiLoading}
                            shuffledOptions={shuffledOptions}
                            isShuffled={isShuffled}
                            renderQuizText={renderQuizText}
                            TiptapEditor={TiptapEditor}
                          />
                        );
                      }

                      if (q.readingGroupId) {
                        if (!showReadingGroupHeader || !passageObj) {
                          return null;
                        }

                        const groupQuestions = questionsForDisplay.filter(item => item.readingGroupId === passageObj.id);

                        return (
                          <TOEICReadingBlock
                            key={`reading-group-${passageObj.id}`}
                            passageObj={passageObj}
                            groupQuestions={groupQuestions}
                            questionsForDisplay={questionsForDisplay}
                            isTesting={isTesting}
                            setActiveLightboxImage={setActiveLightboxImage}
                            copiedQuestionId={copiedQuestionId}
                            handleCopyQuestionToClipboard={handleCopyQuestionToClipboard}
                            handleToggleBookmark={handleToggleBookmark}
                            handleDeleteQuestion={handleDeleteQuestion}
                            handleUpdateQuestionProp={handleUpdateQuestionProp}
                            handleUpdateOptionProp={handleUpdateOptionProp}
                            handleUpdateReadingPassageProp={handleUpdateReadingPassageProp}
                            handleDeleteReadingPassage={handleDeleteReadingPassage}
                            handleUpdateReadingPassageRange={handleUpdateReadingPassageRange}
                            handleUploadReadingPassageImages={handleUploadReadingPassageImages}
                            handleDeleteReadingPassageImage={handleDeleteReadingPassageImage}
                            handleSelectAnswer={handleSelectAnswer}
                            handleCallAI={handleCallAI}
                            aiLoading={aiLoading}
                            shuffledOptions={shuffledOptions}
                            isShuffled={isShuffled}
                            renderQuizText={renderQuizText}
                            renderPassageWithBlankHighlights={renderPassageWithBlankHighlights}
                            isSameSelectedGroup={isSameSelectedGroup}
                            activeReadingBlankNumber={activeReadingBlankNumber}
                            readingPassageMap={readingPassageMap}
                            TiptapEditor={TiptapEditor}
                          />
                        );
                      }

                      return (
                      <div key={`section-item-${q.id}`}>
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
                                <span style={{ paddingTop: '8px' }}>Câu {q.blankNumber || (i + 1)}:</span>
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
                                Câu {q.blankNumber || (i + 1)}{q.readingGroupId && q.blankNumber ? ` (${q.blankNumber})` : ''}: {renderQuizText(displayQuestionText, answerRevealed)}
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
                                <div
                                  data-question-id={q.id}
                                  data-field="explanation"
                                  onMouseUp={(e) => handleTextSelection(e, q.id, 'explanation')}
                                  style={{ marginTop: '8px' }}
                                >
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
                                  const qSlashIdx = findSlashIndex(q.question);
                                  if (qSlashIdx !== -1) {
                                    hiddenParts.push({ label: 'Câu hỏi', text: q.question.substring(qSlashIdx + 1).trim() });
                                  }
                                  Object.keys(q.options || {}).forEach(opt => {
                                    const optSlashIdx = findSlashIndex(q.options[opt]);
                                    if (optSlashIdx !== -1) {
                                      hiddenParts.push({ label: `Đáp án ${opt}`, text: q.options[opt].substring(optSlashIdx + 1).trim() });
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
                                  <div
                                    data-question-id={q.id}
                                    data-field="explanation"
                                    onMouseUp={(e) => handleTextSelection(e, q.id, 'explanation')}
                                    style={{ color: 'var(--text-muted)', lineHeight: '1.7', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '12px', border: '1px solid rgba(255,255,255,0.06)', fontSize: '13.5px' }}
                                  >
                                    <strong style={{ color: 'var(--accent-orange)', display: 'block', marginBottom: '8px' }}>📝 Giải thích:</strong>
                                    <TiptapEditor content={q.explanation} readOnly={true} variant="mini" onChange={() => {}} />
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

                    return (
                      <>
                        {!isTesting && (activePartId === 'part6' || activePartId === 'part7') && (
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
                            <button
                              type="button"
                              className="btn"
                              onClick={handleAddNewReadingBlock}
                              style={{
                                background: 'linear-gradient(135deg, rgba(6,182,212,0.2) 0%, rgba(59,130,246,0.2) 100%)',
                                border: '1px solid rgba(6,182,212,0.4)',
                                color: '#8eefff',
                                fontSize: '12.5px',
                                fontWeight: 600,
                                padding: '6px 14px',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                cursor: 'pointer'
                              }}
                            >
                              <Plus size={15} /> + Thêm Block Đọc mới cho {activePartId === 'part6' ? 'Part 6' : 'Part 7'}
                            </button>
                          </div>
                        )}
                        {questionCards}
                      </>
                    );
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
            );
          })()
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

      {/* Share Quiz Modal */}
      {shareQuizModal && (
        <div className="custom-modal-overlay">
          <div className="custom-modal-content" style={{ maxWidth: '480px', width: '90%' }}>
            <div className="custom-modal-header">
              <h3 className="custom-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Share2 size={18} style={{ color: '#10b981' }} />
                Chia sẻ bộ đề trắc nghiệm
              </h3>
              <button className="custom-modal-close-btn" onClick={() => setShareQuizModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="custom-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '14.5px', fontWeight: 600, color: 'white', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
                Bộ đề: <span style={{ color: '#a78bfa' }}>{shareQuizModal.quiz?.title}</span>
              </div>
              
              {/* Online Sharing section */}
              <div className="glass-panel" style={{ padding: '14px', background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  🌐 CHIA SẺ TRỰC TUYẾN
                </div>
                
                {shareQuizModal.isGenerating ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0' }}>
                    <div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.1)', borderTop: '2px solid #10b981', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Đang tạo liên kết chia sẻ...</span>
                  </div>
                ) : shareQuizModal.error ? (
                  <div style={{ fontSize: '13px', color: '#f87171', padding: '6px 0' }}>
                    {shareQuizModal.error}
                  </div>
                ) : shareQuizModal.link ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Bất kỳ ai có liên kết này đều có thể ôn tập hoặc lưu bộ đề này:
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        readOnly
                        value={shareQuizModal.link}
                        style={{
                          flex: 1,
                          background: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(16,185,129,0.3)',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          color: '#34d399',
                          fontSize: '13px',
                          outline: 'none'
                        }}
                        onClick={e => e.target.select()}
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(shareQuizModal.link);
                          alert('Đã sao chép liên kết vào bộ nhớ tạm!');
                        }}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '8px',
                          border: 'none',
                          background: 'linear-gradient(135deg, #10b981, #059669)',
                          color: 'white',
                          fontWeight: 600,
                          fontSize: '13px',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Sao chép
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Offline Sharing section */}
              <div className="glass-panel" style={{ padding: '14px', background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  💾 CHIA SẺ OFFLINE (JSON FILE)
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 10px 0', lineHeight: '1.4' }}>
                  Tải file dữ liệu bộ trắc nghiệm về máy. Người nhận có thể dùng nút "Nhập file JSON" để nhập vào ứng dụng của họ.
                </p>
                <button
                  onClick={() => {
                    handleDownloadJson(shareQuizModal.quiz);
                    setShareQuizModal(null);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid rgba(var(--glass-rgb), 0.15)',
                    background: 'rgba(var(--glass-rgb), 0.05)',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(var(--glass-rgb), 0.15)'}
                  onMouseOut={e => e.currentTarget.style.background = 'rgba(var(--glass-rgb), 0.05)'}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>download</span>
                  Tải xuống file dữ liệu JSON (.json)
                </button>
              </div>
            </div>
            <div className="custom-modal-footer">
              <button
                onClick={() => setShareQuizModal(null)}
                style={{
                  padding: '9px 16px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: '1px solid rgba(var(--glass-rgb), 0.1)',
                  cursor: 'pointer',
                  background: 'rgba(var(--glass-rgb), 0.04)',
                  color: 'var(--text-muted)',
                  transition: 'all 0.2s'
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Shared Quiz Modal */}
      {importSharedQuizModal && (
        <div className="custom-modal-overlay" style={{ zIndex: 100 }}>
          <div className="custom-modal-content" style={{ maxWidth: '500px', width: '90%' }}>
            <div className="custom-modal-header">
              <h3 className="custom-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined" style={{ color: '#22d3ee' }}>download_for_offline</span>
                Nhận bộ trắc nghiệm chia sẻ
              </h3>
              <button className="custom-modal-close-btn" onClick={handleCancelSharedQuizImport}>
                <X size={18} />
              </button>
            </div>
            <div className="custom-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'white', marginBottom: '8px' }}>
                  {importSharedQuizModal.title}
                </div>
                <div style={{ fontSize: '13.5px', color: 'var(--text-muted)' }}>
                  Được chia sẻ bởi: <span style={{ color: '#22d3ee', fontWeight: 600 }}>{importSharedQuizModal.sharedBy}</span>
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="glass-panel" style={{ padding: '12px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#a78bfa' }}>
                    {importSharedQuizModal.questions?.length || 0}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Câu hỏi trắc nghiệm</div>
                </div>
                <div className="glass-panel" style={{ padding: '12px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#00e3fd' }}>
                    {importSharedQuizModal.readingPassages?.length || 0}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Bài đọc (Reading)</div>
                </div>
              </div>
              
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', margin: 0, lineHeight: '1.5' }}>
                Bạn có thể làm bài trực tiếp ở chế độ luyện tập ngay lập tức, hoặc lưu vĩnh viễn vào bộ đề của mình để ôn luyện sau này.
              </p>
            </div>
            
            <div className="custom-modal-footer" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                <button
                  onClick={handlePracticeSharedQuiz}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '10px',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'white',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                  onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                >
                  Luyện tập ngay
                </button>
                <button
                  onClick={handleConfirmSharedQuizImport}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '10px',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    border: 'none',
                    background: 'linear-gradient(135deg, #7c4dff, #00e3fd)',
                    color: 'white',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 4px 15px rgba(124,77,255,0.25)'
                  }}
                >
                  Lưu vào bộ trắc nghiệm
                </button>
              </div>
              <button
                onClick={handleCancelSharedQuizImport}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                Hủy bỏ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fetching Shared Quiz Loader */}
      {isFetchingSharedQuiz && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(6,14,32,0.85)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          gap: '16px'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            border: '3px solid rgba(34,211,238,0.1)',
            borderTop: '3px solid #22d3ee',
            animation: 'spin 1s linear infinite'
          }} />
          <div style={{ color: 'white', fontSize: '15px', fontWeight: 600 }}>
            Đang tải bộ đề được chia sẻ...
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {activeLightboxImage && (
        <div
          onClick={() => setActiveLightboxImage(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <img src={activeLightboxImage} alt="Phóng to ảnh" style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.7)', objectFit: 'contain' }} />
            <button
              onClick={() => setActiveLightboxImage(null)}
              style={{
                position: 'absolute', top: '-14px', right: '-14px', background: '#ef4444', color: '#fff',
                border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer',
                fontWeight: 'bold', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Unsaved Changes Exit Confirmation Modal */}
      {showUnsavedExitModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{
            background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(251,191,36,0.4)',
            borderRadius: '20px', padding: '28px 30px', maxWidth: '440px', width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)', textAlign: 'center',
            display: 'flex', flexDirection: 'column', gap: '16px'
          }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%',
              background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto'
            }}>
              <Save size={28} color="#fbbf24" />
            </div>

            <div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800, color: '#fbbf24' }}>
                Bạn có muốn lưu thay đổi không?
              </h3>
              <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                Bộ đề này đang có những chỉnh sửa chưa được lưu lên Cloud. Nếu rời đi mà không lưu, các thay đổi vừa chỉnh sửa sẽ bị hủy.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={async () => {
                  setShowUnsavedExitModal(false);
                  try {
                    await saveQuizzesToCloud();
                  } catch (err) {
                    console.error('Lỗi khi lưu:', err);
                  }
                  if (pendingExitAction) {
                    pendingExitAction();
                    setPendingExitAction(null);
                  }
                }}
                style={{
                  padding: '12px 18px', borderRadius: '12px', fontSize: '13.5px', fontWeight: 700,
                  background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#000',
                  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  boxShadow: '0 4px 16px rgba(245,158,11,0.35)', transition: 'all 0.2s'
                }}
              >
                <Save size={16} /> Lưu &amp; Quay lại
              </button>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowUnsavedExitModal(false);
                    if (pendingExitAction) {
                      pendingExitAction();
                      setPendingExitAction(null);
                    }
                  }}
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: '10px', fontSize: '12.5px', fontWeight: 600,
                    background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)',
                    cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  Không lưu
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowUnsavedExitModal(false);
                    setPendingExitAction(null);
                  }}
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: '10px', fontSize: '12.5px', fontWeight: 600,
                    background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.12)',
                    cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  Ở lại sửa tiếp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal Bulk Answer Key Importer (200 câu) */}
      {showBulkAnswerKeyModal && (
        <div className="custom-modal-overlay">
          <div className="custom-modal-content" style={{ maxWidth: '720px', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
            <div className="custom-modal-header">
              <h3 className="custom-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24' }}>
                <Key size={20} /> 🔑 Nhập Nhanh Bảng Đáp Án (Cho 200 câu hỏi TOEIC)
              </h3>
              <button className="custom-modal-close-btn" onClick={() => setShowBulkAnswerKeyModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="custom-modal-body" style={{ overflowY: 'auto', flex: 1, paddingRight: '6px' }}>
              <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '12px', lineHeight: '1.5', background: 'rgba(0,0,0,0.25)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                💡 <strong>Hỗ trợ dán các dạng bảng đáp án đa dạng:</strong>
                <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                  <li>Dạng số + đáp án: <code>1. A  2. B  3. C  4. D ... 200. A</code></li>
                  <li>Dạng gộp dán liền: <code>1A 2B 3C 4D 5A ... 200D</code> hoặc <code>1-A, 2-B, 3-C, 4-D</code></li>
                  <li>Dạng danh sách ký tự từng dòng: <code>A\nB\nC\nD...</code> (tương ứng từ câu 1 đến 200)</li>
                </ul>
              </div>

              <textarea
                value={bulkAnswerKeyInput}
                onChange={(e) => setBulkAnswerKeyInput(e.target.value)}
                placeholder={`Dán bảng đáp án 200 câu vào đây...\n\nVí dụ:\n1. A\n2. B\n3. C\n4. D\n...\n200. A`}
                rows={6}
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.35)',
                  color: '#fff',
                  border: '1px solid rgba(251,191,36,0.3)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  resize: 'vertical',
                  marginBottom: '12px'
                }}
              />

              {/* Realtime parsed preview grid */}
              {(() => {
                const parsed = parse200AnswerKeys(bulkAnswerKeyInput);
                if (!parsed.length) return null;

                return (
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#10b981', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>🎉 Đã nhận diện {parsed.length}/200 đáp án:</span>
                      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400 }}>Sẽ cập nhật đáp án cho các câu trùng số thứ tự</span>
                    </div>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(68px, 1fr))',
                      gap: '6px',
                      maxHeight: '220px',
                      overflowY: 'auto',
                      padding: '8px',
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.06)'
                    }}>
                      {parsed.map(item => (
                        <div key={item.number} style={{
                          background: 'rgba(16,185,129,0.12)',
                          border: '1px solid rgba(16,185,129,0.3)',
                          borderRadius: '6px',
                          padding: '3px 6px',
                          textAlign: 'center',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          color: '#fff'
                        }}>
                          <span style={{ color: '#94a3b8', fontSize: '10.5px' }}>#{item.number}: </span>
                          <span style={{ color: '#34d399' }}>{item.answer}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="custom-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <button
                type="button"
                onClick={() => {
                  const demoKeys = Array.from({ length: 200 }, (_, i) => `${i + 1}. ${['A', 'B', 'C', 'D'][i % 4]}`).join('\n');
                  setBulkAnswerKeyInput(demoKeys);
                }}
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#cbd5e1', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
              >
                📋 Dán mẫu thử 200 câu
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowBulkAnswerKeyModal(false)}
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleApplyBulkAnswers}
                  style={{ fontSize: '12px', padding: '6px 16px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', color: '#000', fontWeight: 700 }}
                >
                  ⚡ Xác nhận gán đáp án
                </button>
              </div>
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
