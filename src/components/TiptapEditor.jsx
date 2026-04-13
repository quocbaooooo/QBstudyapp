import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { TextAlign } from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { FontFamily } from '@tiptap/extension-font-family';

import { 
  Undo, Redo, Bold, Italic, Underline as UnderlineIcon, Strikethrough, 
  Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare, Quote, Code, Minus, 
  AlignLeft, AlignCenter, AlignRight, Link as LinkIcon, Image as ImageIcon, PaintBucket,
  Wand2, Info, Replace, PenLine, BookOpen
} from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useState, useEffect } from 'react';

const FixedToolbar = ({ editor, onGenerateOutline, onSuggestContent, isAILoading }) => {
  if (!editor) return null;

  return (
    <div className="editor-fixed-toolbar" style={{
      display: 'flex', alignItems: 'center', flexWrap: 'nowrap', overflowX: 'auto', gap: '2px',
      background: 'rgba(25, 28, 36, 0.95)', border: '1px solid rgba(var(--glass-rgb),0.08)',
      borderRadius: '8px', padding: '6px 12px', marginBottom: '16px', position: 'sticky', top: 0, zIndex: 10,
      boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
    }}>
      <button className="toolbar-btn" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Hoàn tác"><Undo size={16}/></button>
      <button className="toolbar-btn" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Làm lại"><Redo size={16}/></button>
      
      <div className="toolbar-divider" />
      
      <select className="toolbar-select" onChange={e => {
          if (e.target.value === 'default') editor.chain().focus().unsetFontFamily().run();
          else editor.chain().focus().setFontFamily(e.target.value).run();
      }}>
         <option value="default">Sans Serif</option>
         <option value="serif">Serif</option>
         <option value="monospace">Monospace</option>
      </select>
      
      <div className="toolbar-divider" />

      <button className={`toolbar-btn ${editor.isActive('bold') ? 'is-active' : ''}`} onClick={() => editor.chain().focus().toggleBold().run()} title="In đậm"><Bold size={16} /></button>
      <button className={`toolbar-btn ${editor.isActive('italic') ? 'is-active' : ''}`} onClick={() => editor.chain().focus().toggleItalic().run()} title="In nghiêng"><Italic size={16} /></button>
      <button className={`toolbar-btn ${editor.isActive('underline') ? 'is-active' : ''}`} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Gạch chân"><UnderlineIcon size={16} /></button>
      <button className={`toolbar-btn ${editor.isActive('strike') ? 'is-active' : ''}`} onClick={() => editor.chain().focus().toggleStrike().run()} title="Gạch ngang"><Strikethrough size={16} /></button>
      <button className={`toolbar-btn ${editor.isActive('highlight') ? 'is-active' : ''}`} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Tô màu nền"><PaintBucket size={16} /></button>
      
      <div className="toolbar-divider" />
      
      <select className="toolbar-select" value={editor.isActive('heading') ? `H${editor.getAttributes('heading').level}` : 'P'} onChange={e => {
        if(e.target.value === 'P') editor.chain().focus().setParagraph().run();
        else editor.chain().focus().toggleHeading({ level: parseInt(e.target.value[1]) }).run();
      }}>
         <option value="P">Văn bản</option>
         <option value="H1">Tiêu đề 1</option>
         <option value="H2">Tiêu đề 2</option>
         <option value="H3">Tiêu đề 3</option>
      </select>

      <div className="toolbar-divider" />

      <button className={`toolbar-btn ${editor.isActive('bulletList') ? 'is-active' : ''}`} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Chấm tròn"><List size={16} /></button>
      <button className={`toolbar-btn ${editor.isActive('orderedList') ? 'is-active' : ''}`} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Đánh số"><ListOrdered size={16} /></button>
      <button className={`toolbar-btn ${editor.isActive('taskList') ? 'is-active' : ''}`} onClick={() => editor.chain().focus().toggleTaskList().run()} title="Việc cần làm"><CheckSquare size={16} /></button>
      
      <div className="toolbar-divider" />
      
      <button className={`toolbar-btn ${editor.isActive('blockquote') ? 'is-active' : ''}`} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Trích dẫn"><Quote size={16} /></button>
      <button className={`toolbar-btn ${editor.isActive('code') ? 'is-active' : ''}`} onClick={() => editor.chain().focus().toggleCode().run()} title="Mã (Code)"><Code size={16} /></button>
      <button className="toolbar-btn" onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Kẻ ngang"><Minus size={16} /></button>

      <div className="toolbar-divider" />
      
      <button className={`toolbar-btn ${editor.isActive({ textAlign: 'left' }) ? 'is-active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Canh trái"><AlignLeft size={16}/></button>
      <button className={`toolbar-btn ${editor.isActive({ textAlign: 'center' }) ? 'is-active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Canh giữa"><AlignCenter size={16}/></button>
      <button className={`toolbar-btn ${editor.isActive({ textAlign: 'right' }) ? 'is-active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Canh phải"><AlignRight size={16}/></button>
      
      <div className="toolbar-divider" />
      
      <button className={`toolbar-btn ${editor.isActive('link') ? 'is-active' : ''}`} onClick={() => {
        if (editor.isActive('link')) {
          editor.chain().focus().unsetLink().run();
          return;
        }
        const url = window.prompt('Nhập đường dẫn liên kết (URL):');
        if (url) Object.assign(document.createElement('a'), {href: url}).host !== '' ? editor.chain().focus().setLink({ href: url }).run() : alert('URL không khả dụng');
      }} title="Chèn Link"><LinkIcon size={16}/></button>
      
      <button className="toolbar-btn" onClick={() => {
        const url = window.prompt('Nhập đường dẫn Ảnh (URL):');
        if (url) editor.chain().focus().setImage({ src: url }).run();
      }} title="Chèn Ảnh"><ImageIcon size={16}/></button>
      
      <div className="toolbar-divider" />
      
      <button className="toolbar-btn" onClick={onGenerateOutline} disabled={isAILoading} style={{ color: 'var(--primary)', fontWeight: 'bold' }} title="AI: Dàn ý từ Tiêu đề">
        <Wand2 size={16} /> <span style={{ marginLeft: '4px', fontSize: '13px' }}>Dàn Ý AI</span>
      </button>
      
      <button className="toolbar-btn" onClick={onSuggestContent} disabled={isAILoading} style={{ color: 'var(--secondary)', fontWeight: 'bold' }} title="AI: Viết tiếp nội dung">
        <PenLine size={16} /> <span style={{ marginLeft: '4px', fontSize: '13px' }}>Viết Tiếp</span>
      </button>

    </div>
  );
};


export default function TiptapEditor({ title, content, onChange }) {
  const [apiKey] = useLocalStorage('gemini_api_key', '');
  const [apiModel] = useLocalStorage('gemini_api_model', 'gemini-1.5-flash-latest');
  const [aiProvider] = useLocalStorage('ai_provider', 'gemini');
  const [openaiKey] = useLocalStorage('openai_api_key', '');
  const [openaiModel] = useLocalStorage('openai_api_model', 'gpt-4o-mini');
  const [isAILoading, setIsAILoading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight.configure({ HTMLAttributes: { class: 'tiptap-highlight' } }),
      Underline,
      TextStyle, Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false }),
      Image,
      TaskList,
      TaskItem.configure({ nested: true }),
      FontFamily,
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Keep editor content perfectly synced if selected a different note from outside
  useEffect(() => {
    if (editor && content !== editor.getHTML() && !editor.isFocused) {
      editor.commands.setContent(content || '');
    }
  }, [content, editor]);

  const handleCallAI = async (prompt, systemInstruction) => {
    const activeApiKey = aiProvider === 'gemini' ? apiKey : openaiKey;
    if (!activeApiKey) {
      alert(`Vui lòng nhập API Key cho ${aiProvider === 'gemini' ? 'Gemini' : 'OpenAI'} trong phần Cài Đặt.`);
      return null;
    }
    
    setIsAILoading(true);
    try {
      if (aiProvider === 'gemini') {
        const bodyReq = {
          generationConfig: { temperature: 0.7 },
          contents: [{ parts: [{ text: prompt }] }]
        };
        // Gemini API system instruction format
        if (systemInstruction) {
           bodyReq.system_instruction = { parts: [{ text: systemInstruction }] };
        }
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyReq)
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        return data.candidates[0].content.parts[0].text;
      } else {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: openaiModel,
            messages: [{ role: 'system', content: systemInstruction }, { role: 'user', content: prompt }]
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        return data.choices[0].message.content;
      }
    } catch (err) {
      alert('Lỗi khi gọi AI: ' + err.message);
      return null;
    } finally {
      setIsAILoading(false);
    }
  };

  const cleanHTMLResponse = (html) => {
     let clean = html.replace(/```html/g, '').replace(/```/g, '').trim();
     return clean;
  };

  const requestAITextAction = async (type) => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, '\n');
    if (!text.trim()) return;

    let userPrompt = '';
    if (type === 'explain') userPrompt = `Giải thích nội dung sau một cách chi tiết và dễ hiểu:\n\n${text}`;
    if (type === 'summarize') userPrompt = `Tóm tắt ngắn gọn và cô đọng nội dung sau:\n\n${text}`;
    if (type === 'rewrite') userPrompt = `Viết lại nội dung sau sao cho trôi chảy, chuyên nghiệp nhưng vẫn dễ hiểu:\n\n${text}`;
    if (type === 'example') userPrompt = `Cho 2-3 ví dụ minh hoạ thực tế liên quan đến nội dung này để dễ hình dung:\n\n${text}`;

    const systemPrompt = `Bạn là một trợ lý AI thông minh chuyên hỗ trợ học tập và ghi chép.
TRẢ LỜI NGAY ĐÁP ÁN, KHÔNG CHÀO HỎI. 
BẮT BUỘC FORMAT: Sử dụng HTML thuần (<ul>, <li>, <strong>, <em>, <p>, <blockquote>). Chỉ trả về mã HTML, không dùng markdown.`;

    const result = await handleCallAI(userPrompt, systemPrompt);
    if (result) {
      const formatted = cleanHTMLResponse(result);
      editor.chain().focus().insertContentAt(to, `<blockquote><strong>✨ AI Xử lý:</strong><br/>${formatted}</blockquote><p></p>`).run();
    }
  };

  const requestAIGenerateFromTitle = async () => {
    if (!title || title === 'Ghi chú mới') {
      alert("Hãy nhập một tiêu đề cụ thể trước nhé!");
      return;
    }
    const userPrompt = `Viết một trang ghi chú học thuật chi tiết, có cấu trúc thật rõ ràng về chủ đề: "${title}".`;
    const systemPrompt = `Bạn là một giáo sư tài năng. Hãy tạo dàn ý và nội dung hoàn chỉnh.
TRẢ LỜI NGAY ĐÁP ÁN, KHÔNG CHÀO HỎI. 
BẮT BUỘC FORMAT: Sử dụng HTML thuần (<h2>, <h3>, <ul>, <li>, <strong>, <em>, <p>, <blockquote>). Chỉ trả về mã HTML, tuyệt đối không dùng code block markdown.`;
    
    const result = await handleCallAI(userPrompt, systemPrompt);
    if (result) {
      const formatted = cleanHTMLResponse(result);
      editor.chain().focus().insertContent(formatted).run();
    }
  };

  const requestAISuggestContent = async () => {
      const userPrompt = `Với bối cảnh tiêu đề là "${title}", hãy gợi ý tiếp nội dung học tập tiếp theo hoặc một vài hướng kiến thức cần đào sâu.`;
      const systemPrompt = `Bạn là một trợ lý ảo. Dùng HTML thuần (<p>, <ul>, <li>, <strong>). Chỉ trả về mã HTML.`;
      const result = await handleCallAI(userPrompt, systemPrompt);
      if (result) {
        editor.chain().focus().insertContent(`<blockquote><strong>💡 Gợi ý học tập:</strong><br/>${cleanHTMLResponse(result)}</blockquote><p></p>`).run();
      }
  };

  if (!editor) return null;

  return (
    <div className="tiptap-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <style>{`
        .ProseMirror { outline: none; min-height: 100%; padding: 0 10px 40vh 10px; color: var(--text-main); }
        .ProseMirror p { margin-bottom: 0.75em; line-height: 1.6; font-size: 15px; }
        .ProseMirror h1 { font-size: 2em; font-weight: 800; margin-top: 1.5em; margin-bottom: 0.5em; letter-spacing: -0.02em; }
        .ProseMirror h2 { font-size: 1.5em; font-weight: 700; margin-top: 1.2em; margin-bottom: 0.5em; }
        .ProseMirror h3 { font-size: 1.25em; font-weight: 600; margin-top: 1em; margin-bottom: 0.4em; }
        .ProseMirror ul { list-style-type: disc; padding-left: 1.5rem; margin-bottom: 1rem; }
        .ProseMirror ol { list-style-type: decimal; padding-left: 1.5rem; margin-bottom: 1rem; }
        .ProseMirror ul[data-type="taskList"] { list-style: none; padding: 0; }
        .ProseMirror ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px; }
        .ProseMirror ul[data-type="taskList"] li label { margin-top: 4px; }
        .ProseMirror ul[data-type="taskList"] li > div { flex: 1; }
        .ProseMirror li p { margin-bottom: 0.25rem; }
        .ProseMirror blockquote { border-left: 3px solid var(--primary); padding-left: 1rem; color: #a3aac4; margin: 1rem 0; font-style: italic; background: rgba(197, 154, 255, 0.05); border-radius: 4px; padding: 10px 14px; }
        .ProseMirror blockquote strong { color: var(--primary); font-style: normal; }
        .ProseMirror code { background: rgba(var(--glass-rgb),0.08); padding: 0.2em 0.4em; border-radius: 4px; font-family: monospace; font-size: 0.9em; box-shadow: inset 0 0 0 1px rgba(var(--glass-rgb),0.1); }
        .ProseMirror pre { background: rgba(0,0,0,0.3); padding: 1rem; border-radius: 8px; color: #e2e8f0; overflow-x: auto; font-family: monospace; margin: 1rem 0; box-shadow: inset 0 0 0 1px rgba(var(--glass-rgb),0.05); }
        .ProseMirror mark, .tiptap-highlight { background-color: rgba(197, 154, 255, 0.4); color: white; padding: 0.1em 0.2em; border-radius: 3px; }
        .ProseMirror hr { border: none; border-top: 1px solid rgba(var(--glass-rgb),0.1); margin: 2rem 0; }
        .ProseMirror a { color: var(--primary); text-decoration: underline; cursor: pointer; }
        .ProseMirror img { max-width: 100%; height: auto; border-radius: 8px; margin: 1rem 0; }
        .ProseMirror-focused { outline: none; }
        
        .toolbar-btn { padding: 6px; border-radius: 6px; color: #a3aac4; transition: all 0.2s; background: transparent; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .toolbar-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .toolbar-btn:not(:disabled):hover { background: rgba(var(--glass-rgb),0.1); color: white; }
        .toolbar-btn.is-active { background: rgba(197, 154, 255, 0.2); color: var(--primary); }
        .toolbar-divider { width: 1px; height: 18px; background: rgba(var(--glass-rgb),0.1); margin: 0 4px; }
        .toolbar-select { background: transparent; color: #e2e8f0; border: none; font-size: 13px; font-weight: 500; padding: 4px 8px; border-radius: 6px; outline: none; appearance: auto; cursor: pointer; }
        .toolbar-select:hover { background: rgba(var(--glass-rgb),0.1); }

        .bubble-menu-ai-btn { padding: 6px 12px; border-radius: 6px; color: white; font-weight: 600; font-size: 13px; display: flex; align-items: center; gap: 6px; transition: all 0.2s; background: rgba(var(--glass-rgb),0.1); border: 1px solid rgba(var(--glass-rgb),0.1); cursor: pointer; }
        .bubble-menu-ai-btn:hover { background: rgba(197, 154, 255, 0.2); border-color: rgba(197, 154, 255, 0.5); }
        
        .floating-menu-btn { display: flex; align-items: center; gap: 8px; padding: 8px 12px; width: 100%; border-radius: 6px; color: #e2e8f0; transition: all 0.2s; background: transparent; border: none; cursor: pointer; text-align: left; font-size: 13.5px; }
        .floating-menu-btn:hover { background: rgba(var(--glass-rgb),0.08); }
        .floating-menu-icon { width: 32px; height: 32px; border-radius: 6px; background: rgba(var(--glass-rgb),0.05); display: flex; align-items: center; justify-content: center; border: 1px solid rgba(var(--glass-rgb),0.05); }

        .editor-fixed-toolbar::-webkit-scrollbar { display: none; }
        .editor-fixed-toolbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Main Top Toolbar */}
      <FixedToolbar 
        editor={editor} 
        onGenerateOutline={requestAIGenerateFromTitle}
        onSuggestContent={requestAISuggestContent}
        isAILoading={isAILoading}
      />

      {/* AI Bubble Menu - pops up only when text is selected */}
      {editor && <BubbleMenu editor={editor} tippyOptions={{ duration: 100, placement: 'top' }} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(15, 25, 48, 0.85)', backdropFilter: 'blur(20px)', padding: '6px', borderRadius: '12px', border: '1px solid rgba(var(--glass-rgb),0.15)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 50 }}>
          <div style={{ padding: '0 4px', fontSize: '12px', fontWeight: 'bold', color: 'var(--primary)' }}>✨ Trợ lý AI:</div>
          <button className="bubble-menu-ai-btn" onClick={() => requestAITextAction('explain')} disabled={isAILoading}>
            <Info size={14} color="var(--primary)"/> {isAILoading ? '...' : 'Giải thích'}
          </button>
          <button className="bubble-menu-ai-btn" onClick={() => requestAITextAction('summarize')} disabled={isAILoading}>
            <Code size={14} color="var(--secondary)"/> Tóm tắt
          </button>
          <button className="bubble-menu-ai-btn" onClick={() => requestAITextAction('rewrite')} disabled={isAILoading}>
             <Replace size={14} color="#ffb2b9"/> Viết lại
          </button>
          <button className="bubble-menu-ai-btn" onClick={() => requestAITextAction('example')} disabled={isAILoading}>
             <BookOpen size={14} color="var(--accent-green)"/> Ví dụ
          </button>
      </BubbleMenu>}

      {/* Floating Menu Removed as user prefers clicking AI buttons on the top fixed toolbar instead of having it popup on every new line */}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <EditorContent editor={editor} style={{ height: '100%' }} />
      </div>

       {isAILoading && (
         <div style={{ position: 'absolute', bottom: '24px', right: '24px', padding: '12px 20px', background: 'rgba(197, 154, 255, 0.2)', border: '1px solid rgba(197, 154, 255, 0.4)', borderRadius: '100px', display: 'flex', alignItems: 'center', gap: '12px', backdropFilter: 'blur(10px)', color: 'white', fontSize: '14px', fontWeight: 'bold', boxShadow: '0 0 20px rgba(197, 154, 255, 0.2)', animation: 'pulse 2s infinite' }}>
           <Wand2 size={16} className="animate-spin" /> AI đang suy nghĩ...
         </div>
       )}
    </div>
  );
}
