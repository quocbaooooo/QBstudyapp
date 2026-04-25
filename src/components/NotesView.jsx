import { useState, useEffect } from 'react';
import { useFirestore } from '../hooks/useFirestore';
import { Plus, Trash2, Search, Filter, Folder, Tag, Minus, ArrowLeft, Clock, FileText, StickyNote } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import TiptapEditor from './TiptapEditor';

const DEMO_NOTE = {
  id: uuidv4(),
  title: '✨ Ghi chú Demo: Hướng dẫn sử dụng Sổ tay',
  content: '<h2>Chào mừng đến với Sổ tay Thông minh! 🚀</h2><p>Dưới đây là một số mẹo nhỏ giúp bạn sử dụng hiệu quả tính năng này:</p><hr><h3>1. Dịch thuật & Tra từ mọi nơi 🌍</h3><p>Tính năng tra từ AI hoạt động trên toàn bộ ứng dụng! Hãy thử <strong>bôi đen (highlight)</strong> dòng tiếng Anh dưới đây:</p><blockquote><p><em>"Consistency is the key to success in learning languages."</em></p></blockquote><p>Bạn sẽ thấy một popup AI xuất hiện dịch nghĩa ngay lập tức. Sau khi dịch xong, bạn còn có thể bấm nút <strong>Lưu thẻ</strong> để thêm ngay từ vựng đó vào <strong>Thẻ học (Flashcards)</strong> cực kỳ tiện lợi.</p><h3>2. Soạn thảo đa dạng ✍️</h3><p>Bạn có thể định dạng văn bản dễ dàng giống như Word: <strong>In đậm</strong>, <em>in nghiêng</em>, <u>gạch chân</u>, highlight màu sắc, hay tạo các danh sách:</p><ul><li>Mục công việc 1</li><li>Mục công việc 2</li></ul><h3>3. Phân loại & Tìm kiếm 📁</h3><p>Nhìn lên phía trên thanh tiêu đề, bạn có thể chỉnh sửa <strong>Danh mục</strong> (ví dụ: Grammar, Vocabulary) và gắn <strong>Tag</strong>. Việc gắn tag giúp bạn có thể lọc và tìm kiếm ghi chú rất nhanh ở màn hình bên ngoài. Thử gõ thêm một tag mới và nhấn Enter nhé!</p>',
  category: 'Hướng dẫn',
  tags: ['demo', 'tips'],
  updatedAt: Date.now()
};

export default function NotesView() {
  const [notes, setNotes] = useFirestore('notes', 'study_notes', [DEMO_NOTE]);
  const [activeNoteId, setActiveNoteId] = useState(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState('All');
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  
  const activeNote = notes.find(n => n.id === activeNoteId);

  const handleAddNote = () => {
    const newNote = {
      id: uuidv4(),
      title: 'Ghi chú mới',
      content: '',
      category: 'Mặc định',
      tags: [],
      updatedAt: Date.now()
    };
    setNotes([newNote, ...notes]);
    setActiveNoteId(newNote.id);
  };

  const handleDelete = (e, id) => {
    e.stopPropagation();
    if(window.confirm('Bạn có chắc chắn muốn xóa ghi chú này không?')) {
      setNotes(notes.filter(n => n.id !== id));
      if (activeNoteId === id) setActiveNoteId(null);
    }
  };

  const handleUpdateActiveNote = (field, value) => {
    const updatedNotes = notes.map(n => 
      n.id === activeNoteId ? { ...n, [field]: value, updatedAt: Date.now() } : n
    );
    setNotes(updatedNotes);
  };

  const handleAddTag = (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
       const newTag = e.target.value.trim();
       const currentTags = activeNote.tags || [];
       if (!currentTags.includes(newTag)) {
         handleUpdateActiveNote('tags', [...currentTags, newTag]);
       }
       e.target.value = '';
    }
  };

  const handleRemoveTag = (tagToRemove) => {
      handleUpdateActiveNote('tags', (activeNote.tags || []).filter(t => t !== tagToRemove));
  };

  // Extract all unique tags
  const allTags = ['All', ...new Set(notes.flatMap(n => n.tags || []))];

  // Filter notes
  const filteredNotes = notes.filter(n => {
     const matchesSearch = (n.title || '').toLowerCase().includes(searchTerm.toLowerCase());
     const matchesTag = selectedTag === 'All' || (n.tags || []).includes(selectedTag);
     return matchesSearch && matchesTag;
  });

  useEffect(() => {
    const id = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);

    return () => window.clearInterval(id);
  }, []);

  // Helper: relative time
  const getRelativeTime = (timestamp) => {
    if (!timestamp) return '';
    const diff = currentTime - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} ngày trước`;
    return new Date(timestamp).toLocaleDateString('vi-VN');
  };

  // Plain text preview from HTML content
  const getContentPreview = (html) => {
    if (!html) return 'Chưa có nội dung...';
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length > 100 ? text.substring(0, 100) + '...' : text;
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

  const showGrid = !activeNoteId;

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
                  Sổ tay ghi chú
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                  {notes.length} ghi chú · Chọn một ghi chú để chỉnh sửa
                </p>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {/* Search */}
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input 
                    type="text" 
                    placeholder="Tìm kiếm..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    style={{ 
                      width: '180px', background: 'rgba(var(--glass-rgb),0.04)', 
                      border: '1px solid rgba(var(--glass-rgb),0.1)', padding: '9px 12px 9px 32px', 
                      borderRadius: '10px', fontSize: '13px', color: 'var(--text-main)', outline: 'none' 
                    }} 
                  />
                </div>
                {/* Tag filter */}
                {allTags.length > 1 && (
                  <div style={{ position: 'relative' }}>
                    <select 
                      value={selectedTag} 
                      onChange={e => setSelectedTag(e.target.value)} 
                      style={{ 
                        width: '110px', background: 'rgba(var(--glass-rgb),0.04)', 
                        border: '1px solid rgba(var(--glass-rgb),0.1)', padding: '9px 28px 9px 12px', 
                        borderRadius: '10px', fontSize: '13px', color: 'var(--text-main)', outline: 'none', appearance: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      {allTags.map(t => <option key={t} value={t}>{t === 'All' ? '🏷️ Tất cả' : `#${t}`}</option>)}
                    </select>
                    <Filter size={12} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  </div>
                )}
                {/* Create button */}
                <button
                  onClick={handleAddNote}
                  style={{
                    padding: '9px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                    border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(135deg, #7c4dff, #536dfe)', color: 'white',
                    display: 'flex', alignItems: 'center', gap: '6px',
                    transition: 'all 0.2s',
                    boxShadow: '0 4px 20px rgba(124,77,255,0.35)'
                  }}
                >
                  <Plus size={15} /> Tạo ghi chú
                </button>
              </div>
            </div>
          </div>

          {/* Grid Body */}
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '20px' }}>
            {filteredNotes.length === 0 ? (
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
                  <StickyNote size={32} color="var(--primary)" style={{ opacity: 0.7 }} />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)' }}>
                  {notes.length === 0 ? 'Chưa có ghi chú nào' : 'Không tìm thấy'}
                </h3>
                <p style={{ fontSize: '14px', maxWidth: '360px', lineHeight: '1.6' }}>
                  {notes.length === 0 
                    ? 'Tạo ghi chú mới để bắt đầu ghi lại kiến thức.' 
                    : 'Thử tìm kiếm với từ khóa khác hoặc đổi bộ lọc tag.'}
                </p>
              </div>
            ) : (
              <div className="quiz-grid">
                {filteredNotes.map((note, index) => {
                  const gradientIdx = index % cardGradients.length;
                  const preview = getContentPreview(note.content);
                  
                  return (
                    <div
                      key={note.id}
                      className="quiz-card"
                      onClick={() => setActiveNoteId(note.id)}
                      style={{ background: cardGradients[gradientIdx] }}
                    >
                      <div className="quiz-card-accent" style={{ background: cardAccentColors[gradientIdx] }} />
                      <button
                        className="quiz-card-delete"
                        onClick={(e) => handleDelete(e, note.id)}
                        title="Xóa ghi chú"
                      >
                        <Trash2 size={14} />
                      </button>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <h3 className="quiz-card-title">{note.title || 'Không có tiêu đề'}</h3>
                        <p style={{ 
                          fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: '1.5',
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          overflow: 'hidden', margin: 0
                        }}>
                          {preview}
                        </p>
                        {/* Tags */}
                        {note.tags && note.tags.length > 0 && (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                            {note.tags.slice(0, 3).map(t => (
                              <span key={t} style={{ 
                                fontSize: '10px', background: 'rgba(197,154,255,0.15)', 
                                color: '#c59aff', padding: '2px 7px', borderRadius: '4px', fontWeight: 600 
                              }}>
                                #{t}
                              </span>
                            ))}
                            {note.tags.length > 3 && (
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>+{note.tags.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="quiz-card-footer">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <Clock size={11} />
                          {getRelativeTime(note.updatedAt)}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <Folder size={11} />
                          {note.category || 'Mặc định'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ========== EDITOR VIEW ========== */
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          {/* Top Bar / Header */}
          <div style={{ 
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
            gap: '20px', paddingBottom: '20px', flexShrink: 0 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
              <button
                onClick={() => setActiveNoteId(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                   padding: '6px 12px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                  background: 'rgba(var(--glass-rgb),0.05)', border: '1px solid rgba(var(--glass-rgb),0.1)',
                  color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s',
                  flexShrink: 0
                }}
              >
                <ArrowLeft size={16} />
                <span className="hidden sm:inline">Thoát</span>
              </button>
              
              {activeNote && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  <input 
                    type="text" 
                    value={activeNote.title} 
                    onChange={e => handleUpdateActiveNote('title', e.target.value)}
                    style={{ 
                      fontSize: '18px', fontWeight: 700, border: 'none', background: 'transparent', 
                      padding: '0', boxShadow: 'none', color: 'var(--text-main)', width: 'auto', flex: '0 1 auto', outline: 'none',
                      minWidth: '50px'
                    }}
                    placeholder="Tiêu đề..."
                  />

                  <div style={{ height: '16px', width: '1px', background: 'rgba(var(--glass-rgb),0.1)', flexShrink: 0 }} />

                  {/* Folder & Tag Row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <div style={{ 
                      display: 'flex', alignItems: 'center', gap: '6px', 
                      background: 'rgba(var(--glass-rgb),0.04)', padding: '4px 10px', 
                      borderRadius: '8px', border: '1px solid rgba(var(--glass-rgb),0.06)' 
                    }}>
                      <Folder size={12} color="var(--primary)" />
                      <input 
                        type="text" 
                        placeholder="Danh mục..." 
                        value={activeNote.category || ''} 
                        onChange={e => handleUpdateActiveNote('category', e.target.value)} 
                        style={{ 
                          background: 'transparent', border: 'none', color: 'var(--text-main)', 
                          fontSize: '12px', fontWeight: 600, padding: 0, width: '80px', outline: 'none' 
                        }} 
                      />
                    </div>

                    <div style={{ 
                      display: 'flex', alignItems: 'center', gap: '6px', 
                      background: 'rgba(var(--glass-rgb),0.04)', padding: '4px 10px', 
                      borderRadius: '8px', border: '1px solid rgba(var(--glass-rgb),0.06)',
                      maxWidth: '400px'
                    }}>
                      <Tag size={12} color="#c59aff" />
                      <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', scrollbarWidth: 'none', maxWidth: '200px' }}>
                        {(activeNote.tags || []).map(t => (
                          <span key={t} style={{ 
                            background: 'rgba(197,154,255,0.1)', border: '1px solid rgba(197,154,255,0.2)', 
                            padding: '0px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', 
                            gap: '3px', color: '#c59aff', fontSize: '10px', fontWeight: 600, whiteSpace: 'nowrap' 
                          }}>
                            {t} 
                            <button onClick={() => handleRemoveTag(t)} style={{ background: 'transparent', border: 'none', color: '#ff6e84', cursor: 'pointer', display: 'flex', padding: 0 }}>
                              <Minus size={8} />
                            </button>
                          </span>
                        ))}
                      </div>
                      <input 
                        type="text" 
                        placeholder="Tag..." 
                        onKeyDown={handleAddTag} 
                        style={{ 
                          background: 'transparent', border: 'none', color: 'var(--text-muted)', 
                          fontSize: '12px', padding: 0, width: '50px', outline: 'none' 
                        }} 
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {activeNote ? (
              <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px 32px' }}>
               


              {/* Main Tiptap Editor */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <TiptapEditor 
                   title={activeNote.title}
                   content={activeNote.content || ''}
                   onChange={(html) => handleUpdateActiveNote('content', html)}
                />
              </div>

            </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
