import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
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
  List, ListOrdered, CheckSquare, Quote, Code, Minus, 
  AlignLeft, AlignCenter, AlignRight, Link as LinkIcon, Image as ImageIcon, PaintBucket, Eraser,
  Wand2, Info, Replace, PenLine, BookOpen, Languages, Table as TableIcon, Columns, Rows, Trash2,
  Maximize2, Minimize2, ChevronDown, Sparkles
} from 'lucide-react';

import { Extension } from '@tiptap/core';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Image as BaseImage } from '@tiptap/extension-image';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useState, useEffect, useRef } from 'react';

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

const ResizableImageComponent = (props) => {
  const { node, updateAttributes, selected } = props;
  const containerRef = useRef(null);

  const startResize = (e, direction) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startWidth = containerRef.current.offsetWidth;
    
    const onMouseMove = (moveEvent) => {
      moveEvent.preventDefault();
      const currentX = moveEvent.clientX;
      const deltaX = currentX - startX;

      let newWidth = startWidth;
      
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
        style={{ width: node.attrs.width || '100%', height: 'auto', display: 'block', borderRadius: '8px' }} 
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

const FixedToolbar = ({ 
  editor, 
  onGenerateOutline, 
  onSuggestContent, 
  isAILoading, 
  onRequestAITextAction,
  isFullscreen,
  toggleFullscreen
}) => {
  const [showAIMenu, setShowAIMenu] = useState(false);
  const aiMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (aiMenuRef.current && !aiMenuRef.current.contains(e.target)) {
        setShowAIMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!editor) return null;

  return (
    <div className="editor-fixed-toolbar">
      {/* Undo / Redo */}
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Hoàn tác (Ctrl+Z)">
          <Undo size={15}/>
        </button>
        <button className="toolbar-btn" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Làm lại (Ctrl+Y)">
          <Redo size={15}/>
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Font & Style Dropdowns */}
      <div className="toolbar-group">
        <div className="select-wrapper">
          <select 
            className="toolbar-select" 
            onChange={e => {
              if (e.target.value === 'default') editor.chain().focus().unsetFontFamily().run();
              else editor.chain().focus().setFontFamily(e.target.value).run();
            }}
          >
             <option value="default">Sans Serif</option>
             <option value="serif">Serif</option>
             <option value="monospace">Monospace</option>
          </select>
          <ChevronDown size={12} className="select-arrow" />
        </div>

        <div className="select-wrapper">
          <select 
            className="toolbar-select" 
            value={editor.isActive('heading') ? `H${editor.getAttributes('heading').level}` : 'P'} 
            onChange={e => {
              if(e.target.value === 'P') editor.chain().focus().setParagraph().run();
              else editor.chain().focus().toggleHeading({ level: parseInt(e.target.value[1]) }).run();
            }}
          >
             <option value="P">Văn bản</option>
             <option value="H1">Tiêu đề 1</option>
             <option value="H2">Tiêu đề 2</option>
             <option value="H3">Tiêu đề 3</option>
          </select>
          <ChevronDown size={12} className="select-arrow" />
        </div>
      </div>

      <div className="toolbar-divider" />

      {/* Inline Formatting */}
      <div className="toolbar-group">
        <button className={`toolbar-btn ${editor.isActive('bold') ? 'is-active' : ''}`} onClick={() => editor.chain().focus().toggleBold().run()} title="In đậm (Ctrl+B)"><Bold size={15} /></button>
        <button className={`toolbar-btn ${editor.isActive('italic') ? 'is-active' : ''}`} onClick={() => editor.chain().focus().toggleItalic().run()} title="In nghiêng (Ctrl+I)"><Italic size={15} /></button>
        <button className={`toolbar-btn ${editor.isActive('underline') ? 'is-active' : ''}`} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Gạch chân (Ctrl+U)"><UnderlineIcon size={15} /></button>
        <button className={`toolbar-btn ${editor.isActive('strike') ? 'is-active' : ''}`} onClick={() => editor.chain().focus().toggleStrike().run()} title="Gạch ngang"><Strikethrough size={15} /></button>
        <button className={`toolbar-btn ${editor.isActive('highlight') ? 'is-active' : ''}`} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Tô màu chữ"><PaintBucket size={15} /></button>
        <button className="toolbar-btn" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} title="Xóa toàn bộ định dạng / Bỏ khung nền"><Eraser size={15} /></button>
      </div>

      <div className="toolbar-divider" />

      {/* Line Height & Alignment */}
      <div className="toolbar-group">
        <div className="select-wrapper">
          <select 
            className="toolbar-select" 
            value={editor.isActive({ lineHeight: '1.2' }) ? '1.2' : editor.isActive({ lineHeight: '1.5' }) ? '1.5' : editor.isActive({ lineHeight: '2.0' }) ? '2.0' : 'normal'} 
            onChange={e => {
               if (e.target.value === 'normal') editor.chain().focus().unsetLineHeight().run();
               else editor.chain().focus().setLineHeight(e.target.value).run();
            }} 
            title="Khoảng cách dòng"
          >
             <option value="normal">Dòng: Chuẩn</option>
             <option value="1.2">Dòng: 1.2</option>
             <option value="1.5">Dòng: 1.5</option>
             <option value="2.0">Dòng: 2.0</option>
          </select>
          <ChevronDown size={12} className="select-arrow" />
        </div>

        <button className={`toolbar-btn ${editor.isActive({ textAlign: 'left' }) ? 'is-active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Canh trái"><AlignLeft size={15}/></button>
        <button className={`toolbar-btn ${editor.isActive({ textAlign: 'center' }) ? 'is-active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Canh giữa"><AlignCenter size={15}/></button>
        <button className={`toolbar-btn ${editor.isActive({ textAlign: 'right' }) ? 'is-active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Canh phải"><AlignRight size={15}/></button>
      </div>

      <div className="toolbar-divider" />

      {/* Lists & Blocks */}
      <div className="toolbar-group">
        <button className={`toolbar-btn ${editor.isActive('bulletList') ? 'is-active' : ''}`} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Danh sách chấm"><List size={15} /></button>
        <button className={`toolbar-btn ${editor.isActive('orderedList') ? 'is-active' : ''}`} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Danh sách số"><ListOrdered size={15} /></button>
        <button className={`toolbar-btn ${editor.isActive('taskList') ? 'is-active' : ''}`} onClick={() => editor.chain().focus().toggleTaskList().run()} title="Việc cần làm"><CheckSquare size={15} /></button>
        <button className={`toolbar-btn ${editor.isActive('blockquote') ? 'is-active' : ''}`} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Trích dẫn"><Quote size={15} /></button>
        <button className={`toolbar-btn ${editor.isActive('code') ? 'is-active' : ''}`} onClick={() => editor.chain().focus().toggleCode().run()} title="Mã Code"><Code size={15} /></button>
        <button className="toolbar-btn" onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Đường kẻ ngang"><Minus size={15} /></button>
      </div>

      <div className="toolbar-divider" />

      {/* Insert Link, Image, Table */}
      <div className="toolbar-group">
        <button className={`toolbar-btn ${editor.isActive('link') ? 'is-active' : ''}`} onClick={() => {
          if (editor.isActive('link')) {
            editor.chain().focus().unsetLink().run();
            return;
          }
          const url = window.prompt('Nhập đường dẫn liên kết (URL):');
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }} title="Chèn Link"><LinkIcon size={15}/></button>
        
        <button className={`toolbar-btn ${editor.isActive('image') ? 'is-active' : ''}`} onClick={() => {
          if (editor.isActive('image')) {
            const width = window.prompt('Nhập chiều rộng Ảnh (VD: 100%, 500px, 300px):', editor.getAttributes('image').width || '100%');
            if (width) editor.chain().focus().updateAttributes('image', { width }).run();
          } else {
            const url = window.prompt('Nhập đường dẫn Ảnh (URL):');
            if (url) editor.chain().focus().setImage({ src: url }).run();
          }
        }} title="Chèn Ảnh / Đổi kích thước"><ImageIcon size={15}/></button>

        <button className="toolbar-btn" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Chèn Bảng (3x3)"><TableIcon size={15}/></button>
        {editor.isActive('table') && (
          <>
            <button className="toolbar-btn" onClick={() => editor.chain().focus().addColumnAfter().run()} title="Thêm Cột"><Columns size={15}/></button>
            <button className="toolbar-btn" onClick={() => editor.chain().focus().addRowAfter().run()} title="Thêm Hàng"><Rows size={15}/></button>
            <button className="toolbar-btn" onClick={() => editor.chain().focus().deleteTable().run()} title="Xóa Bảng"><Trash2 size={15} color="#ef4444" /></button>
          </>
        )}
      </div>

      {/* AI Assistant Popover Dropdown */}
      <div className="toolbar-group ai-group" ref={aiMenuRef}>
        <button 
          className={`ai-dropdown-btn ${showAIMenu ? 'active' : ''}`} 
          onClick={() => setShowAIMenu(!showAIMenu)}
          disabled={isAILoading}
          title="Trợ lý AI hỗ trợ viết & xử lý văn bản"
        >
          <Sparkles size={14} className="sparkle-icon" />
          <span>✨ Trợ lý AI</span>
          <ChevronDown size={12} style={{ transform: showAIMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>

        {showAIMenu && (
          <div className="ai-menu-popover">
            <div className="ai-menu-header">TÍNH NĂNG AI SOẠN THẢO</div>
            <button className="ai-menu-item" onClick={() => { setShowAIMenu(false); onGenerateOutline(); }}>
              <Wand2 size={15} color="#c59aff" />
              <div>
                <div className="item-title">Tạo dàn ý bài viết</div>
                <div className="item-sub">Sinh cấu trúc ghi chú từ tiêu đề</div>
              </div>
            </button>
            <button className="ai-menu-item" onClick={() => { setShowAIMenu(false); onSuggestContent(); }}>
              <PenLine size={15} color="#60a5fa" />
              <div>
                <div className="item-title">Gợi ý viết tiếp</div>
                <div className="item-sub">Mở rộng nội dung bài học</div>
              </div>
            </button>
            
            <div className="ai-menu-divider" />
            <div className="ai-menu-header">XỬ LÝ ĐOẠN VĂN BÔI ĐEN</div>

            <button className="ai-menu-item" onClick={() => { setShowAIMenu(false); onRequestAITextAction('explain'); }}>
              <Info size={15} color="#c59aff" />
              <div>
                <div className="item-title">Giải thích ngắn gọn</div>
                <div className="item-sub">Giải nghĩa khái niệm đang chọn</div>
              </div>
            </button>
            <button className="ai-menu-item" onClick={() => { setShowAIMenu(false); onRequestAITextAction('summarize'); }}>
              <Code size={15} color="#60a5fa" />
              <div>
                <div className="item-title">Tóm tắt nội dung</div>
                <div className="item-sub">Rút gọn ý chính ngắn gọn</div>
              </div>
            </button>
            <button className="ai-menu-item" onClick={() => { setShowAIMenu(false); onRequestAITextAction('rewrite'); }}>
              <Replace size={15} color="#ffb2b9" />
              <div>
                <div className="item-title">Viết lại mượt mà</div>
                <div className="item-sub">Trau chuốt văn phong chuyên nghiệp</div>
              </div>
            </button>
            <button className="ai-menu-item" onClick={() => { setShowAIMenu(false); onRequestAITextAction('example'); }}>
              <BookOpen size={15} color="#10b981" />
              <div>
                <div className="item-title">Ví dụ thực tế</div>
                <div className="item-sub">Thêm 2-3 ví dụ minh họa liên quan</div>
              </div>
            </button>
            <button className="ai-menu-item" onClick={() => { setShowAIMenu(false); onRequestAITextAction('translate'); }}>
              <Languages size={15} color="#a78bfa" />
              <div>
                <div className="item-title">Dịch thuật tự động</div>
                <div className="item-sub">Dịch Việt ↔ Anh tức thì</div>
              </div>
            </button>
          </div>
        )}

        {toggleFullscreen && (
          <button 
            className={`toolbar-btn ${isFullscreen ? 'is-active' : ''}`} 
            onClick={toggleFullscreen} 
            title={isFullscreen ? "Thu nhỏ" : "Phóng to toàn màn hình"}
            style={{ marginLeft: '4px' }}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        )}
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
  const [isFullscreen, setIsFullscreen] = useState(false);

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
      transformPastedHTML: (html) => {
        // Strip inline background-color styles from pasted web content so it doesn't wrap in an unwanted box
        if (typeof html === 'string') {
          return html
            .replace(/background(-color)?\s*:\s*[^;"]+;?/gi, '')
            .replace(/color\s*:\s*[^;"]+;?/gi, '');
        }
        return html;
      },
      handlePaste: (view, event) => {
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

  const rawText = editor.getText();
  const wordCount = rawText.trim() ? rawText.trim().split(/\s+/).length : 0;
  const charCount = rawText.length;

  return (
    <div 
      className={`tiptap-wrapper ${variant === 'mini' ? 'mini' : ''} ${readOnly ? 'readOnly' : ''} ${isFullscreen ? 'fullscreen-mode' : ''}`} 
      style={{ 
        flex: variant === 'mini' ? 'none' : 1, 
        display: 'flex', 
        flexDirection: 'column', 
        height: variant === 'mini' ? 'auto' : '100%', 
        position: isFullscreen ? 'fixed' : 'relative',
        inset: isFullscreen ? 0 : undefined,
        zIndex: isFullscreen ? 9999 : undefined,
        background: isFullscreen ? 'var(--bg-color)' : undefined,
        padding: isFullscreen ? '16px' : undefined
      }}
    >
      <style>{`
        .tiptap-wrapper {
          border-radius: 10px;
          transition: all 0.2s ease;
        }

        .tiptap-wrapper .ProseMirror { outline: none; color: var(--text-main); font-size: 14.5px; line-height: 1.65; }
        .tiptap-wrapper:not(.mini):not(.readOnly) .ProseMirror { min-height: 220px; padding: 16px 20px 60px 20px; }
        
        .tiptap-wrapper.mini { border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); }
        .tiptap-wrapper.mini .ProseMirror { min-height: 100px; padding: 12px; font-size: 13.5px; }
        
        .tiptap-wrapper.readOnly { background: transparent; border: none; border-radius: 0; }
        .tiptap-wrapper.readOnly .ProseMirror { padding: 0; min-height: auto; font-size: 13.5px; }

        /* Typography & Paragraphs */
        .tiptap-wrapper .ProseMirror p { margin-bottom: 10px; line-height: 1.65; }
        .tiptap-wrapper.mini .ProseMirror p, .tiptap-wrapper.readOnly .ProseMirror p { font-size: 13.5px; margin-bottom: 6px; }
        
        .tiptap-wrapper .ProseMirror h1 { font-size: 1.8em; font-weight: 800; margin-top: 24px; margin-bottom: 12px; letter-spacing: -0.02em; color: var(--text-main); }
        .tiptap-wrapper .ProseMirror h2 { font-size: 1.4em; font-weight: 700; margin-top: 20px; margin-bottom: 10px; color: var(--text-main); }
        .tiptap-wrapper .ProseMirror h3 { font-size: 1.2em; font-weight: 600; margin-top: 16px; margin-bottom: 8px; color: var(--text-main); }
        
        /* Lists */
        .tiptap-wrapper .ProseMirror ul { list-style-type: disc; padding-left: 22px; margin-bottom: 12px; }
        .tiptap-wrapper .ProseMirror ol { list-style-type: decimal; padding-left: 22px; margin-bottom: 12px; }
        .tiptap-wrapper .ProseMirror ul[data-type="taskList"] { list-style: none; padding: 0; }
        .tiptap-wrapper .ProseMirror ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px; }
        .tiptap-wrapper .ProseMirror ul[data-type="taskList"] li label input[type="checkbox"] {
          accent-color: #a855f7; width: 15px; height: 15px; cursor: pointer; margin-top: 3px;
        }
        .tiptap-wrapper .ProseMirror li p { margin-bottom: 2px; }
        
        /* Blockquote Modern Aesthetic */
        .tiptap-wrapper .ProseMirror blockquote { 
          border-left: 4px solid #a855f7; 
          background: rgba(168, 85, 247, 0.07); 
          border-radius: 0 8px 8px 0; 
          padding: 10px 16px; 
          margin: 12px 0; 
          color: var(--text-main); 
          font-style: normal; 
        }
        .tiptap-wrapper .ProseMirror blockquote strong { color: #c59aff; }

        /* Highlight Styling Softening */
        .tiptap-wrapper .ProseMirror mark, .tiptap-highlight { 
          background-color: rgba(168, 85, 247, 0.22); 
          border: 1px solid rgba(168, 85, 247, 0.35);
          color: inherit; 
          padding: 2px 6px; 
          border-radius: 4px; 
        }

        /* Code & Pre */
        .tiptap-wrapper .ProseMirror code { background: rgba(var(--glass-rgb), 0.08); padding: 3px 6px; border-radius: 4px; font-family: monospace; font-size: 0.9em; border: 1px solid rgba(var(--glass-rgb), 0.1); color: #f43f5e; }
        .tiptap-wrapper .ProseMirror pre { background: rgba(15, 23, 42, 0.7); padding: 14px; border-radius: 8px; color: #e2e8f0; overflow-x: auto; font-family: monospace; margin: 14px 0; border: 1px solid rgba(var(--glass-rgb),0.1); }
        .tiptap-wrapper .ProseMirror hr { border: none; border-top: 1px solid rgba(var(--glass-rgb),0.12); margin: 24px 0; }
        .tiptap-wrapper .ProseMirror a { color: #60a5fa; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
        .tiptap-wrapper .ProseMirror img { max-width: 100%; height: auto; border-radius: 8px; margin: 12px 0; }
        .tiptap-wrapper .ProseMirror img.ProseMirror-selectednode { outline: 2px solid #a855f7; }

        /* Tables */
        .tiptap-wrapper .ProseMirror table { border-collapse: collapse; margin: 12px 0; table-layout: fixed; width: 100%; border-radius: 6px; overflow: hidden; border: 1px solid rgba(var(--glass-rgb), 0.15); }
        .tiptap-wrapper .ProseMirror table td, .tiptap-wrapper .ProseMirror table th { border: 1px solid rgba(var(--glass-rgb), 0.15); padding: 8px 10px; font-size: 13.5px; background: rgba(var(--glass-rgb), 0.02); }
        .tiptap-wrapper .ProseMirror table th { font-weight: 600; background-color: rgba(var(--glass-rgb), 0.08); }
        .tiptap-wrapper .ProseMirror table .selectedCell:after { background: rgba(168, 85, 247, 0.2); content: ""; left: 0; right: 0; top: 0; bottom: 0; position: absolute; pointer-events: none; }

        /* Fixed Toolbar Layout */
        .editor-fixed-toolbar {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 4px;
          background: rgba(20, 24, 33, 0.92);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(var(--glass-rgb),0.1);
          border-radius: 8px;
          padding: 5px 8px;
          margin-bottom: 12px;
          position: sticky;
          top: 0;
          z-index: 10;
          box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        }

        .tiptap-wrapper.mini .editor-fixed-toolbar {
          padding: 4px 6px;
          margin-bottom: 0;
          border-bottom-left-radius: 0;
          border-bottom-right-radius: 0;
          border: none;
          border-bottom: 1px solid rgba(var(--glass-rgb),0.08);
          background: rgba(0,0,0,0.15);
          box-shadow: none;
          position: static;
        }

        .toolbar-group {
          display: flex;
          align-items: center;
          gap: 2px;
        }

        .toolbar-btn {
          padding: 5px 7px;
          border-radius: 5px;
          color: #94a3b8;
          transition: all 0.15s ease;
          background: transparent;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .toolbar-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .toolbar-btn:not(:disabled):hover { background: rgba(var(--glass-rgb),0.1); color: #f8fafc; }
        .toolbar-btn.is-active { background: rgba(168, 85, 247, 0.25); color: #c59aff; }
        .toolbar-divider { width: 1px; height: 16px; background: rgba(var(--glass-rgb),0.12); margin: 0 2px; }

        /* Custom Selects */
        .select-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        .toolbar-select {
          background: rgba(var(--glass-rgb),0.04);
          color: #cbd5e1;
          border: 1px solid rgba(var(--glass-rgb),0.08);
          font-size: 12px;
          font-weight: 500;
          padding: 4px 22px 4px 8px;
          border-radius: 5px;
          outline: none;
          appearance: none;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .toolbar-select:hover { background: rgba(var(--glass-rgb),0.1); color: #fff; border-color: rgba(var(--glass-rgb),0.15); }
        .select-arrow { position: absolute; right: 6px; pointer-events: none; color: #94a3b8; }

        /* AI Dropdown Button & Popover */
        .ai-dropdown-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 6px;
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.25) 0%, rgba(99, 102, 241, 0.25) 100%);
          border: 1px solid rgba(168, 85, 247, 0.4);
          color: #e9d5ff;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .ai-dropdown-btn:hover {
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.38) 0%, rgba(99, 102, 241, 0.38) 100%);
          border-color: rgba(168, 85, 247, 0.6);
          color: #fff;
          box-shadow: 0 0 12px rgba(168, 85, 247, 0.25);
        }
        .ai-dropdown-btn.active {
          background: rgba(168, 85, 247, 0.4);
          border-color: #a855f7;
          color: #fff;
        }

        .ai-menu-popover {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          width: 250px;
          background: rgba(15, 23, 42, 0.96);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(168, 85, 247, 0.3);
          border-radius: 10px;
          padding: 6px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.4);
          z-index: 100;
          display: flex;
          flex-direction: column;
          gap: 2px;
          animation: fadeIn 0.15s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .ai-menu-header {
          font-size: 10px;
          font-weight: 700;
          color: #a855f7;
          letter-spacing: 0.5px;
          padding: 6px 8px 2px 8px;
        }

        .ai-menu-divider {
          height: 1px;
          background: rgba(var(--glass-rgb), 0.08);
          margin: 4px 0;
        }

        .ai-menu-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 7px 10px;
          border-radius: 6px;
          background: transparent;
          border: none;
          color: #cbd5e1;
          cursor: pointer;
          text-align: left;
          transition: all 0.15s ease;
        }
        .ai-menu-item:hover {
          background: rgba(168, 85, 247, 0.15);
          color: #fff;
        }
        .ai-menu-item .item-title {
          font-size: 12.5px;
          font-weight: 600;
          line-height: 1.2;
        }
        .ai-menu-item .item-sub {
          font-size: 10.5px;
          color: #94a3b8;
          margin-top: 1px;
        }

        .editor-status-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 4px 12px;
          font-size: 11.5px;
          color: var(--text-muted);
          border-top: 1px solid rgba(var(--glass-rgb),0.06);
          background: rgba(0,0,0,0.1);
          border-bottom-left-radius: 8px;
          border-bottom-right-radius: 8px;
        }

        .image-resize-handle { position: absolute; width: 10px; height: 10px; background-color: white; border: 1px solid #7c3aed; border-radius: 50%; z-index: 10; }
        .image-resize-handle.top-left { top: -5px; left: -5px; cursor: nwse-resize; }
        .image-resize-handle.top-right { top: -5px; right: -5px; cursor: nesw-resize; }
        .image-resize-handle.bottom-left { bottom: -5px; left: -5px; cursor: nesw-resize; }
        .image-resize-handle.bottom-right { bottom: -5px; right: -5px; cursor: nwse-resize; }
        .image-resize-handle.top-center { top: -5px; left: calc(50% - 5px); cursor: ns-resize; }
        .image-resize-handle.bottom-center { bottom: -5px; left: calc(50% - 5px); cursor: ns-resize; }
        .image-resize-handle.left-center { top: calc(50% - 5px); left: -5px; cursor: ew-resize; }
        .image-resize-handle.right-center { top: calc(50% - 5px); right: -5px; cursor: ew-resize; }
      `}</style>

      {/* Main Top Toolbar */}
      {!readOnly && (
        <FixedToolbar 
          editor={editor} 
          onGenerateOutline={requestAIGenerateFromTitle}
          onSuggestContent={requestAISuggestContent}
          isAILoading={isAILoading}
          onRequestAITextAction={requestAITextAction}
          isFullscreen={isFullscreen}
          toggleFullscreen={variant !== 'mini' ? () => setIsFullscreen(!isFullscreen) : null}
        />
      )}

      {/* Main Editor Body */}
      <div style={{ flex: variant === 'mini' ? 'none' : 1, overflowY: 'auto' }}>
        <EditorContent editor={editor} style={{ height: '100%' }} />
      </div>

      {/* Footer Status Bar (Word / Char count) */}
      {!readOnly && variant !== 'mini' && (
        <div className="editor-status-bar">
          <div>
            <span>{wordCount} từ</span>
            <span style={{ margin: '0 6px', opacity: 0.4 }}>•</span>
            <span>{charCount} ký tự</span>
          </div>
          {isAILoading && (
            <div style={{ color: '#c59aff', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
              <Wand2 size={12} className="animate-spin" /> AI đang suy nghĩ...
            </div>
          )}
        </div>
      )}

      {/* Floating AI Loading Toast when in mini mode */}
      {isAILoading && variant === 'mini' && (
        <div style={{ position: 'absolute', bottom: '12px', right: '12px', padding: '8px 14px', background: 'rgba(168, 85, 247, 0.3)', border: '1px solid rgba(168, 85, 247, 0.5)', borderRadius: '100px', display: 'flex', alignItems: 'center', gap: '8px', backdropFilter: 'blur(10px)', color: 'white', fontSize: '12.5px', fontWeight: 'bold', zIndex: 20 }}>
          <Wand2 size={14} className="animate-spin" /> AI đang xử lý...
        </div>
      )}
    </div>
  );
}
