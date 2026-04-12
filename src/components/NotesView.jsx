import { useState } from 'react';
import { useFirestore } from '../hooks/useFirestore';
import { Plus, Trash2, Search, Filter, Folder, Tag, Minus } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import TiptapEditor from './TiptapEditor';

export default function NotesView() {
  const [notes, setNotes] = useFirestore('notes', 'study_notes', []);
  const [activeNoteId, setActiveNoteId] = useState(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState('All');
  
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
    setNotes(notes.filter(n => n.id !== id));
    if (activeNoteId === id) setActiveNoteId(null);
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

  return (
    <div className="split-view">
      <div className="list-pane">
        <div className="list-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <button 
            className="w-full py-2.5 rounded-lg text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--on-primary)', boxShadow: '0 0 16px rgba(197,154,255,0.35)' }}
            onClick={handleAddNote}
          >
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>note_add</span>
            Tạo ghi chú mới
          </button>
          
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
             <div style={{ flex: 1, position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#6d758c' }} />
                <input 
                  type="text" 
                  placeholder="Tìm kiếm..." 
                  value={searchTerm} 
                  onChange={e => setSearchTerm(e.target.value)} 
                  style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', padding: '6px 10px 6px 30px', borderRadius: '6px', fontSize: '13px', color: 'white', outline: 'none' }} 
                />
             </div>
             <div style={{ position: 'relative' }}>
                <select 
                  value={selectedTag} 
                  onChange={e => setSelectedTag(e.target.value)} 
                  style={{ width: '90px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', padding: '6px 10px', borderRadius: '6px', fontSize: '13px', color: 'white', outline: 'none', appearance: 'none' }}
                >
                    {allTags.map(t => <option key={t} value={t}>{t === 'All' ? 'Tất cả' : t}</option>)}
                </select>
                <Filter size={12} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#6d758c', pointerEvents: 'none' }} />
             </div>
          </div>
        </div>

        <div className="list-items" style={{ paddingTop: '8px' }}>
          {filteredNotes.length === 0 ? (
            <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center', fontSize: '13px' }}>Chưa có ghi chú nào phù hợp.</div>
          ) : (
            filteredNotes.map(note => (
              <div 
                key={note.id} 
                className={`list-item ${activeNoteId === note.id ? 'selected' : ''}`}
                onClick={() => setActiveNoteId(note.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div className="list-item-title" style={{ flex: 1 }}>{note.title || 'Không có tiêu đề'}</div>
                  <button className="btn-icon" onClick={(e) => handleDelete(e, note.id)} style={{ padding: '2px', marginLeft: '5px' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
                {note.tags && note.tags.length > 0 && (
                   <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px', marginBottom: '6px' }}>
                      {note.tags.map(t => (
                        <span key={t} style={{ fontSize: '10px', background: 'rgba(197,154,255,0.15)', color: 'var(--primary)', padding: '2px 6px', borderRadius: '4px' }}>
                          #{t}
                        </span>
                      ))}
                   </div>
                )}
                <div className="list-item-desc" style={{ display: 'flex', justifyContent: 'space-between', marginTop: note.tags && note.tags.length > 0 ? 0 : '6px' }}>
                  <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Folder size={10} /> {note.category || 'Mặc định'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="editor-pane">
        {activeNote ? (
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px 48px' }}>
             
             {/* Title & Metadata Settings */}
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '24px', paddingBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '20px', flexWrap: 'wrap' }}>
                <input 
                  type="text" 
                  value={activeNote.title} 
                  onChange={e => handleUpdateActiveNote('title', e.target.value)}
                  style={{ flex: 1, minWidth: '300px', fontSize: '32px', fontWeight: '800', letterSpacing: '-0.03em', border: 'none', background: 'transparent', outline: 'none', color: 'white', padding: 0 }}
                  placeholder="Tiêu đề quyển sổ..."
                />
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px', color: '#a3aac4' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.03)', padding: '6px 12px', borderRadius: '8px' }}>
                      <Folder size={14} />
                      <input 
                        type="text" 
                        placeholder="Tên danh mục..." 
                        value={activeNote.category || ''} 
                        onChange={e => handleUpdateActiveNote('category', e.target.value)} 
                        style={{ background: 'transparent', border: 'none', color: 'var(--secondary)', fontWeight: 600, padding: 0, width: '100px', outline: 'none' }} 
                      />
                   </div>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', background: 'rgba(255,255,255,0.03)', padding: '6px 12px', borderRadius: '8px' }}>
                      <Tag size={14} />
                      {(activeNote.tags || []).map(t => (
                          <span key={t} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '100px', display: 'flex', alignItems: 'center', gap: '4px', color: 'white' }}>
                             {t} 
                             <button onClick={() => handleRemoveTag(t)} style={{ background: 'transparent', border: 'none', color: '#ff6e84', cursor: 'pointer', display: 'flex', padding: 0 }}>
                                <Minus size={12} />
                             </button>
                          </span>
                      ))}
                      <input 
                        type="text" 
                        placeholder="Thêm tag (nhấn Enter)..." 
                        onKeyDown={handleAddTag} 
                        style={{ background: 'transparent', border: 'none', color: '#dee5ff', padding: 0, minWidth: '120px', outline: 'none' }} 
                      />
                   </div>
                </div>
             </div>

            {/* Main Tiptap Editor */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <TiptapEditor 
                 title={activeNote.title}
                 content={activeNote.content || ''}
                 onChange={(html) => handleUpdateActiveNote('content', html)}
              />
            </div>

          </div>
        ) : (
          <div className="blank-slate" style={{ padding: '0 1.5rem' }}>
            <div className="relative z-10 w-full flex flex-col items-center">
              <div className="mb-5 inline-flex items-center justify-center w-14 h-14 rounded-2xl border shadow-xl" style={{ backgroundColor: 'var(--surface-container-highest)', borderColor: 'rgba(255,255,255,0.1)' }}>
                <span className="material-symbols-outlined text-3xl" style={{ color: 'var(--primary)', fontVariationSettings: "'FILL' 1" }}>edit_document</span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight mb-2 text-white">Sổ tay thông minh bằng AI</h1>
              <p className="text-sm text-slate-400 mb-6 max-w-sm mx-auto leading-relaxed text-center">Tạo ghi chú mới. Chọn bôi đen đoạn văn cần AI giải thích, hoặc gõ dấu `/` (khi dòng trống) để kích hoạt tự tạo dàn ý AI.</p>
              
              <div className="flex items-center justify-center gap-3 w-full">
                <button 
                  className="px-6 py-2.5 rounded-full text-sm font-bold transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                  style={{ backgroundColor: 'var(--secondary)', color: 'var(--on-secondary)', boxShadow: '0 0 16px rgba(0,227,253,0.35)' }}
                  onClick={handleAddNote}
                >
                  <span className="material-symbols-outlined text-[18px]">note_add</span>
                  Tạo ghi chú mới
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
