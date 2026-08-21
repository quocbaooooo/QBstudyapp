import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { TextAlign } from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { FontFamily } from '@tiptap/extension-font-family';

import { 
  Undo, Redo, Bold, Italic, Underline as UnderlineIcon, Strikethrough, 
  Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare, Quote, Code, Minus, 
  AlignLeft, AlignCenter, AlignRight, Link as LinkIcon, Image as ImageIcon, PaintBucket,
  Wand2, Info, Replace, PenLine, BookOpen, Languages, Table as TableIcon, Grid3x3, Rows, Columns, Trash2, ArrowUpDown
} from 'lucide-react';

import { Extension } from '@tiptap/core';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Image as BaseImage } from '@tiptap/extension-image';

const ResizableImage = BaseImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: '100%',
        parseHTML: element => element.getAttribute('width') || element.style.width,
        renderHTML: attributes => {
          return {
            width: attributes.width,
            style: `width: ${attributes.width}`
          }
        }
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  }
});

const LineHeight = Extension.create({
  name: 'lineHeight',
  addOptions() {
    return {
      types: ['paragraph', 'heading', 'listItem'],
      defaultLineHeight: 'normal',
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: this.options.defaultLineHeight,
            parseHTML: element => element.style.lineHeight || this.options.defaultLineHeight,
            renderHTML: attributes => {
              if (attributes.lineHeight === this.options.defaultLineHeight) {
                return {};
              }
              return { style: `line-height: ${attributes.lineHeight}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setLineHeight: (lineHeight) => ({ commands }) => {
        return this.options.types.every(type => commands.updateAttributes(type, { lineHeight }));
      },
      unsetLineHeight: () => ({ commands }) => {
        return this.options.types.every(type => commands.resetAttributes(type, 'lineHeight'));
      },
    };
  },
});

import { useLocalStorage } from '../hooks/useLocalStorage';
import { useState, useEffect, useRef } from 'react';

const ResizableImageComponent = (props) => {
  const { node, updateAttributes, selected } = props;
  const containerRef = useRef(null);

  const startResize = (e, direction) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = containerRef.current.offsetWidth;
    const startHeight = containerRef.current.offsetHeight;
    
    const onMouseMove = (moveEvent) => {
      moveEvent.preventDefault();
      const currentX = moveEvent.clientX;
      const currentY = moveEvent.clientY;
      const deltaX = currentX - startX;
      const deltaY = currentY - startY;

      let newWidth = startWidth;
      
      // We only support bottom-right, right, and bottom for simplicity, but let's just use deltaX for all right-sided handles
      if (direction.includes('r')) {
         newWidth = Math.max(50, startWidth + deltaX);
      } else if (direction.includes('l')) {
         newWidth = Math.max(50, startWidth - deltaX);
      }
      
      updateAttributes({ width: `${newWidth}px` });
    };
    
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <NodeViewWrapper style={{ display: 'inline-block', position: 'relative', maxWidth: '100%', lineHeight: 0 }}>
      <img 
        src={node.attrs.src} 
        alt={node.attrs.alt} 
        style={{ width: node.attrs.width || '100%', height: 'auto', display: 'block', borderRadius: '4px' }} 
        ref={containerRef} 
      />
      {selected && (
        <>
          <div className="image-resize-handle top-left" onMouseDown={(e) => startResize(e, 'tl')} />
          <div className="image-resize-handle top-right" onMouseDown={(e) => startResize(e, 'tr')} />
          <div className="image-resize-handle bottom-left" onMouseDown={(e) => startResize(e, 'bl')} />
          <div className="image-resize-handle bottom-right" onMouseDown={(e) => startResize(e, 'br')} />
          <div className="image-resize-handle top-center" onMouseDown={(e) => startResize(e, 't')} />
          <div className="image-resize-handle bottom-center" onMouseDown={(e) => startResize(e, 'b')} />
          <div className="image-resize-handle left-center" onMouseDown={(e) => startResize(e, 'l')} />
          <div className="image-resize-handle right-center" onMouseDown={(e) => startResize(e, 'r')} />
        </>
      )}
    </NodeViewWrapper>
  );
};

const FixedToolbar = ({ editor, onGenerateOutline, onSuggestContent, isAILoading, onRequestAITextAction }) => {
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
      
      <select className="toolbar-select" value={editor.isActive({ lineHeight: '1.2' }) ? '1.2' : editor.isActive({ lineHeight: '1.5' }) ? '1.5' : editor.isActive({ lineHeight: '2.0' }) ? '2.0' : 'normal'} onChange={e => {
         if (e.target.value === 'normal') editor.chain().focus().unsetLineHeight().run();
         else editor.chain().focus().setLineHeight(e.target.value).run();
      }} title="Khoảng cách dòng">
         <option value="normal">Dòng: Mặc định</option>
         <option value="1.2">Dòng: 1.2</option>
         <option value="1.5">Dòng: 1.5</option>
         <option value="2.0">Dòng: 2.0</option>
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
      
      <button className={`toolbar-btn ${editor.isActive('image') ? 'is-active' : ''}`} onClick={() => {
        if (editor.isActive('image')) {
          const width = window.prompt('Nhập chiều rộng Ảnh (VD: 100%, 500px, 300px):', editor.getAttributes('image').width || '100%');
          if (width) editor.chain().focus().updateAttributes('image', { width }).run();
        } else {
          const url = window.prompt('Nhập đường dẫn Ảnh (URL):');
          if (url) editor.chain().focus().setImage({ src: url }).run();
        }
      }} title="Chèn Ảnh / Chỉnh kích cỡ ảnh đang chọn"><ImageIcon size={16}/></button>

      <div className="toolbar-divider" />
      <button className="toolbar-btn" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Chèn Bảng"><TableIcon size={16}/></button>
      <button className="toolbar-btn" onClick={() => editor.chain().focus().addColumnAfter().run()} disabled={!editor.can().addColumnAfter()} title="Thêm Cột"><Columns size={16}/></button>
      <button className="toolbar-btn" onClick={() => editor.chain().focus().addRowAfter().run()} disabled={!editor.can().addRowAfter()} title="Thêm Hàng"><Rows size={16}/></button>
      <button className="toolbar-btn" onClick={() => editor.chain().focus().deleteTable().run()} disabled={!editor.can().deleteTable()} title="Xóa Bảng"><Trash2 size={16} color="#ef4444" /></button>
      
      <div className="toolbar-divider" />
      
      <button className="toolbar-btn" onClick={onGenerateOutline} disabled={isAILoading} title="AI: Dàn ý từ Tiêu đề">
        <Wand2 size={16} color="#c59aff" />
      </button>
      
      <button className="toolbar-btn" onClick={onSuggestContent} disabled={isAILoading} title="AI: Viết tiếp nội dung">
        <PenLine size={16} color="#60a5fa" />
      </button>

      <div className="toolbar-divider" />
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(197, 154, 255, 0.05)', padding: '2px 4px', borderRadius: '6px', border: '1px solid rgba(197, 154, 255, 0.1)' }}>
        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#c59aff', padding: '0 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>✨ AI</span>
        <button className="toolbar-btn" onClick={() => onRequestAITextAction('explain')} disabled={isAILoading} title="Giải thích (Bôi đen chữ)">
          <Info size={15} color="#c59aff"/>
        </button>
        <button className="toolbar-btn" onClick={() => onRequestAITextAction('summarize')} disabled={isAILoading} title="Tóm tắt (Bôi đen chữ)">
          <Code size={15} color="#60a5fa"/>
        </button>
        <button className="toolbar-btn" onClick={() => onRequestAITextAction('rewrite')} disabled={isAILoading} title="Viết lại (Bôi đen chữ)">
           <Replace size={15} color="#ffb2b9"/>
        </button>
        <button className="toolbar-btn" onClick={() => onRequestAITextAction('example')} disabled={isAILoading} title="Ví dụ (Bôi đen chữ)">
           <BookOpen size={15} color="var(--accent-green)"/>
        </button>
        <button className="toolbar-btn" onClick={() => onRequestAITextAction('translate')} disabled={isAILoading} title="Dịch (Bôi đen chữ)">
           <Languages size={15} color="#a78bfa"/>
        </button>
      </div>

    </div>
  );
};


export default function TiptapEditor({ title, content, onChange = () => {}, variant = 'default', readOnly = false }) {
  const [apiKey] = useLocalStorage('gemini_api_key', '');
  const [apiModel] = useLocalStorage('gemini_api_model', 'gemini-1.5-flash-latest');
  const [aiProvider] = useLocalStorage('ai_provider', 'gemini');
  const [openaiKey] = useLocalStorage('openai_api_key', '');
  const [openaiModel] = useLocalStorage('openai_api_model', 'gpt-4o-mini');
  const [isAILoading, setIsAILoading] = useState(false);

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit,
      Highlight.configure({ HTMLAttributes: { class: 'tiptap-highlight' } }),
      Underline,
      TextStyle, Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false }),
      ResizableImage.configure({ inline: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      LineHeight,
      TaskList,
      TaskItem.configure({ nested: true }),
      FontFamily,
    ],
    content: content || '',
    editorProps: {
      handlePaste: (view, event, slice) => {
        const items = Array.from(event.clipboardData?.items || []);
        for (const item of items) {
          if (item.type.indexOf('image') === 0) {
            event.preventDefault();
            const file = item.getAsFile();
            const reader = new FileReader();
            reader.onload = (e) => {
              const src = e.target.result;
              const node = view.state.schema.nodes.image.create({ src, width: '100%' });
              const transaction = view.state.tr.replaceSelectionWith(node);
              view.dispatch(transaction);
            };
            reader.readAsDataURL(file);
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Keep editor content perfectly synced if content prop changes from outside (e.g. translation insert)
  useEffect(() => {
    if (editor && content !== undefined) {
      const currentHtml = editor.getHTML();
      if (content !== currentHtml) {
        editor.commands.setContent(content || '', false);
      }
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
     clean = clean.replace(/\n+/g, ' ');
     return clean;
  };

  const requestAITextAction = async (type) => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, '\n');
    if (!text.trim()) {
      alert("Vui lòng bôi đen đoạn văn bản mà bạn muốn AI xử lý!");
      return;
    }

    let userPrompt = '';
    if (type === 'explain') userPrompt = `Giải thích nội dung sau một cách vô cùng ngắn gọn, súc tích (chỉ 1 đoạn văn nhỏ khoảng 2-3 câu, dễ hiểu nhất có thể):\n\n${text}`;
    if (type === 'summarize') userPrompt = `Tóm tắt ngắn gọn và cô đọng nội dung sau:\n\n${text}`;
    if (type === 'rewrite') userPrompt = `Viết lại nội dung sau sao cho trôi chảy, chuyên nghiệp nhưng vẫn dễ hiểu:\n\n${text}`;
    if (type === 'example') userPrompt = `Cho 2-3 ví dụ minh hoạ thực tế liên quan đến nội dung này để dễ hình dung:\n\n${text}`;
    if (type === 'translate') userPrompt = `Dịch đoạn văn bản sau sang tiếng Việt một cách tự nhiên và chính xác (nếu đã là tiếng Việt thì dịch sang tiếng Anh):\n\n${text}`;

    const systemPrompt = `Bạn là trợ lý AI nhúng trong trình soạn thảo văn bản.
TRẢ LỜI TRỰC TIẾP, KHÔNG BAO GIỜ CHÀO HỎI HAY GIẢI THÍCH DÀI DÒNG.
Chỉ trả về nội dung HTML thuần (Dùng <p> cho đoạn văn, <ul><li> cho danh sách, <strong> để nhấn mạnh).
Tuyệt đối KHÔNG dùng markdown code block như \`\`\`html. KHÔNG thêm dấu xuống dòng thừa.`;

    const result = await handleCallAI(userPrompt, systemPrompt);
    if (result) {
      const formatted = cleanHTMLResponse(result);
      editor.chain().focus().insertContentAt(to, `<blockquote><strong>✨ AI:</strong> ${formatted}</blockquote><p></p>`).run();
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
    <div className={`tiptap-wrapper ${variant === 'mini' ? 'mini' : ''} ${readOnly ? 'readOnly' : ''}`} style={{ flex: variant === 'mini' ? 'none' : 1, display: 'flex', flexDirection: 'column', height: variant === 'mini' ? 'auto' : '100%', position: 'relative' }}>
      <style>{`
        .tiptap-wrapper .ProseMirror { outline: none; color: var(--text-main); }
        .tiptap-wrapper:not(.mini):not(.readOnly) .ProseMirror { min-height: 100%; padding: 0 16px 40vh 16px; }
        .tiptap-wrapper.mini .ProseMirror { min-height: 120px; padding: 12px; font-size: 13.5px; }
        .tiptap-wrapper.mini { border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); }
        .tiptap-wrapper.mini .editor-fixed-toolbar { padding: 4px 8px; margin-bottom: 0; border-bottom-left-radius: 0; border-bottom-right-radius: 0; border: none; border-bottom: 1px solid rgba(var(--glass-rgb),0.08); background: rgba(0,0,0,0.1); box-shadow: none; position: static; flex-wrap: wrap; }
        
        .tiptap-wrapper.readOnly { background: transparent; border: none; border-radius: 0; }
        .tiptap-wrapper.readOnly .ProseMirror { padding: 0; min-height: auto; font-size: 13.5px; }

        .tiptap-wrapper .ProseMirror p { margin-bottom: 12px; line-height: 1.6; font-size: 15px; }
        .tiptap-wrapper.mini .ProseMirror p, .tiptap-wrapper.readOnly .ProseMirror p { font-size: 13.5px; }
        .tiptap-wrapper .ProseMirror h1 { font-size: 2em; font-weight: 800; margin-top: 32px; margin-bottom: 16px; letter-spacing: -0.02em; }
        .tiptap-wrapper .ProseMirror h2 { font-size: 1.5em; font-weight: 700; margin-top: 24px; margin-bottom: 12px; }
        .tiptap-wrapper .ProseMirror h3 { font-size: 1.25em; font-weight: 600; margin-top: 16px; margin-bottom: 8px; }
        .tiptap-wrapper .ProseMirror ul { list-style-type: disc; padding-left: 24px; margin-bottom: 16px; }
        .tiptap-wrapper .ProseMirror ol { list-style-type: decimal; padding-left: 24px; margin-bottom: 16px; }
        .tiptap-wrapper .ProseMirror ul[data-type="taskList"] { list-style: none; padding: 0; }
        .tiptap-wrapper .ProseMirror ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px; }
        .tiptap-wrapper .ProseMirror ul[data-type="taskList"] li label { margin-top: 4px; }
        .tiptap-wrapper .ProseMirror ul[data-type="taskList"] li > div { flex: 1; }
        .tiptap-wrapper .ProseMirror li p { margin-bottom: 4px; }
        .tiptap-wrapper .ProseMirror blockquote { border-left: 3px solid #c59aff; padding-left: 16px; color: #a3aac4; margin: 16px 0; font-style: italic; background: rgba(197, 154, 255, 0.05); border-radius: 4px; padding: 12px 16px; }
        .tiptap-wrapper .ProseMirror blockquote strong { color: #c59aff; font-style: normal; }
        .tiptap-wrapper .ProseMirror code { background: rgba(var(--glass-rgb),0.08); padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 0.9em; box-shadow: inset 0 0 0 1px rgba(var(--glass-rgb),0.1); }
        .tiptap-wrapper .ProseMirror pre { background: rgba(0,0,0,0.3); padding: 16px; border-radius: 8px; color: #e2e8f0; overflow-x: auto; font-family: monospace; margin: 16px 0; box-shadow: inset 0 0 0 1px rgba(var(--glass-rgb),0.05); }
        .tiptap-wrapper .ProseMirror mark, .tiptap-highlight { background-color: rgba(197, 154, 255, 0.4); color: white; padding: 2px 4px; border-radius: 3px; }
        .tiptap-wrapper .ProseMirror hr { border: none; border-top: 1px solid rgba(var(--glass-rgb),0.1); margin: 32px 0; }
        .tiptap-wrapper .ProseMirror a { color: var(--primary); text-decoration: underline; cursor: pointer; }
        .tiptap-wrapper .ProseMirror img { max-width: 100%; height: auto; border-radius: 8px; margin: 1rem 0; }
        .tiptap-wrapper .ProseMirror img.ProseMirror-selectednode { outline: 3px solid var(--primary); }
        .tiptap-wrapper .ProseMirror table { border-collapse: collapse; margin: 0; overflow: hidden; table-layout: fixed; width: 100%; margin-bottom: 1rem; border-radius: 4px; border: 1px solid rgba(var(--glass-rgb), 0.2); }
        .tiptap-wrapper .ProseMirror table td, .tiptap-wrapper .ProseMirror table th { border: 1px solid rgba(var(--glass-rgb), 0.2); box-sizing: border-box; min-width: 1em; padding: 6px 8px; position: relative; vertical-align: top; background: rgba(var(--glass-rgb), 0.02); }
        .tiptap-wrapper .ProseMirror table th { font-weight: bold; text-align: left; background-color: rgba(var(--glass-rgb), 0.08); }
        .tiptap-wrapper .ProseMirror table .selectedCell:after { background: rgba(197, 154, 255, 0.2); content: ""; left: 0; right: 0; top: 0; bottom: 0; position: absolute; pointer-events: none; z-index: 2; }
        .tiptap-wrapper .ProseMirror table .column-resize-handle { background-color: var(--primary); bottom: -2px; position: absolute; right: -2px; pointer-events: none; top: 0; width: 4px; z-index: 20; }
        
        .image-resize-handle { position: absolute; width: 10px; height: 10px; background-color: white; border: 1px solid #7c3aed; border-radius: 50%; z-index: 10; }
        .image-resize-handle.top-left { top: -5px; left: -5px; cursor: nwse-resize; }
        .image-resize-handle.top-right { top: -5px; right: -5px; cursor: nesw-resize; }
        .image-resize-handle.bottom-left { bottom: -5px; left: -5px; cursor: nesw-resize; }
        .image-resize-handle.bottom-right { bottom: -5px; right: -5px; cursor: nwse-resize; }
        .image-resize-handle.top-center { top: -5px; left: calc(50% - 5px); cursor: ns-resize; }
        .image-resize-handle.bottom-center { bottom: -5px; left: calc(50% - 5px); cursor: ns-resize; }
        .image-resize-handle.left-center { top: calc(50% - 5px); left: -5px; cursor: ew-resize; }
        .image-resize-handle.right-center { top: calc(50% - 5px); right: -5px; cursor: ew-resize; }
        .tiptap-wrapper .ProseMirror img.ProseMirror-selectednode { outline: 2px solid #7c3aed; }
        
        .tiptap-wrapper .ProseMirror-focused { outline: none; }
        
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
      {!readOnly && (
        <FixedToolbar 
          editor={editor} 
          onGenerateOutline={requestAIGenerateFromTitle}
          onSuggestContent={requestAISuggestContent}
          isAILoading={isAILoading}
          onRequestAITextAction={requestAITextAction}
        />
      )}

      {/* Floating Menu Removed as user prefers clicking AI buttons on the top fixed toolbar instead of having it popup on every new line */}

      <div style={{ flex: variant === 'mini' ? 'none' : 1, overflowY: 'auto' }}>
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
