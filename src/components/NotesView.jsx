import { useState } from 'react';
import { useFirestore } from '../hooks/useFirestore';
import { Plus, Trash2, Edit3 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

export default function NotesView() {
  const [notes, setNotes] = useFirestore('notes', 'study_notes', []);
  const [activeNoteId, setActiveNoteId] = useState(null);
  
  const activeNote = notes.find(n => n.id === activeNoteId);

  const handleAddNote = () => {
    const newNote = {
      id: uuidv4(),
      title: 'Ghi chú mới',
      content: '',
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

  return (
    <div className="split-view">
      <div className="list-pane">
        <div className="list-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
          <button 
            className="w-full py-2.5 rounded-lg text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--on-primary)', boxShadow: '0 0 16px rgba(197,154,255,0.35)' }}
            onClick={handleAddNote}
          >
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>note_add</span>
            Tạo ghi chú mới
          </button>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mt-1">Danh sách ghi chú</h3>
        </div>
        <div className="list-items">
          {notes.length === 0 ? (
            <div style={{ padding: '20px', color: 'var(--text-muted)' }}>Chưa có ghi chú nào.</div>
          ) : (
            notes.map(note => (
              <div 
                key={note.id} 
                className={`list-item ${activeNoteId === note.id ? 'selected' : ''}`}
                onClick={() => setActiveNoteId(note.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div className="list-item-title" style={{ flex: 1 }}>{note.title || 'Không có tiêu đề'}</div>
                  <button className="btn-icon" onClick={(e) => handleDelete(e, note.id)} style={{ padding: '2px', marginLeft: '5px' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="list-item-desc">
                  {new Date(note.updatedAt).toLocaleDateString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="editor-pane">
        {activeNote ? (
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px' }}>
            <input 
              type="text" 
              value={activeNote.title} 
              onChange={e => handleUpdateActiveNote('title', e.target.value)}
              style={{ fontSize: '24px', fontWeight: 'bold', border: 'none', background: 'transparent', padding: '0 0 16px 0', borderBottom: '1px solid var(--border-color)', borderRadius: 0, boxShadow: 'none' }}
              placeholder="Nhập tiêu đề..."
            />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <ReactQuill 
                theme="snow" 
                value={activeNote.content || ''} 
                onChange={(html) => handleUpdateActiveNote('content', html)}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}
                placeholder="Bắt đầu ghi chép nội dung của bạn..."
                modules={{
                  toolbar: [
                    [{ 'font': [] }],
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],        
                    [{ 'color': [] }, { 'background': [] }],          
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    [{ 'align': [] }],
                    ['clean']                                         
                  ]
                }}
              />
            </div>
          </div>
        ) : (
          <div className="blank-slate" style={{ padding: '0 1.5rem' }}>
            <div className="relative z-10 w-full flex flex-col items-center">
              <div className="mb-5 inline-flex items-center justify-center w-14 h-14 rounded-2xl border shadow-xl" style={{ backgroundColor: 'var(--surface-container-highest)', borderColor: 'rgba(255,255,255,0.1)' }}>
                <span className="material-symbols-outlined text-3xl" style={{ color: 'var(--primary)', fontVariationSettings: "'FILL' 1" }}>edit_document</span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight mb-2 text-white">Sổ tay thông minh</h1>
              <p className="text-sm text-slate-400 mb-6 max-w-sm mx-auto leading-relaxed">Ghi chép và lưu trữ mọi kiến thức của bạn ở một nơi với trình soạn thảo cao cấp.</p>
              
              <div className="flex items-center justify-center gap-3 w-full">
                <button 
                  className="px-6 py-2.5 rounded-full text-sm font-bold transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                  style={{ backgroundColor: 'var(--secondary)', color: 'var(--on-secondary)', boxShadow: '0 0 16px rgba(0,227,253,0.35)' }}
                  onClick={handleAddNote}
                >
                  <span className="material-symbols-outlined text-[18px]">note_add</span>
                  Tạo ghi chú
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
