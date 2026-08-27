import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';

const parseHtmlToDocxElements = (html, defaultIndent) => {
  if (!html) return [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const paragraphs = [];

  const processNodeToRuns = (node, format) => {
    let runs = [];
    if (node.nodeType === Node.TEXT_NODE) {
      // Replace newlines with spaces as HTML ignores them, keep the text
      const text = node.textContent.replace(/[\n\r]+/g, ' ');
      if (text) {
        runs.push(new TextRun({ text: text, ...format }));
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const newFormat = { ...format };
      if (node.tagName === 'STRONG' || node.tagName === 'B') newFormat.bold = true;
      if (node.tagName === 'EM' || node.tagName === 'I') newFormat.italics = true;
      if (node.tagName === 'U') newFormat.underline = { type: 'single' };
      if (node.tagName === 'BR') {
          runs.push(new TextRun({ break: 1 }));
      }
      
      node.childNodes.forEach(child => {
        runs = runs.concat(processNodeToRuns(child, newFormat));
      });
    }
    return runs;
  };

  doc.body.childNodes.forEach(child => {
    if (child.nodeName === 'P' || child.nodeName === 'DIV' || child.nodeName === 'LI' || child.nodeName === 'H1' || child.nodeName === 'H2' || child.nodeName === 'H3') {
      let runs = processNodeToRuns(child, {});
      if (child.nodeName === 'LI') {
         runs = [new TextRun({ text: "• " }), ...runs];
      }
      if (runs.length > 0) {
        paragraphs.push(new Paragraph({ children: runs, indent: { left: defaultIndent }, spacing: { after: 100 } }));
      }
    } else if (child.nodeName === 'UL' || child.nodeName === 'OL') {
       child.childNodes.forEach(li => {
          if (li.nodeName === 'LI') {
             const runs = processNodeToRuns(li, {});
             paragraphs.push(new Paragraph({ children: [new TextRun({ text: "• " }), ...runs], indent: { left: defaultIndent + 360 }, spacing: { after: 100 } }));
          }
       });
    } else if (child.nodeType === Node.TEXT_NODE) {
       if (child.textContent.trim() !== '') {
           const runs = processNodeToRuns(child, {});
           paragraphs.push(new Paragraph({ children: runs, indent: { left: defaultIndent }, spacing: { after: 100 } }));
       }
    } else {
      const runs = processNodeToRuns(child, {});
      if (runs.length > 0) {
        paragraphs.push(new Paragraph({ children: runs, indent: { left: defaultIndent }, spacing: { after: 100 } }));
      }
    }
  });

  return paragraphs;
};

export const exportQuizToWord = async (quiz) => {
  if (!quiz) return;

  const children = [];

  // Title
  children.push(
    new Paragraph({
      text: quiz.title || 'Bộ Câu Hỏi Trắc Nghiệm',
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  // Questions
  quiz.questions.forEach((q, i) => {
    // 1. In câu hỏi
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${q.blankNumber || (i + 1)}. `, bold: true }),
          new TextRun({ text: q.question, bold: true }),
        ],
        spacing: { before: 200, after: 100 },
      })
    );

    // 2. In các đáp án A, B, ...
    if (q.options) {
      const keys = Object.keys(q.options);
      keys.forEach((optKey, idx) => {
        const isLast = idx === keys.length - 1;
        children.push(new Paragraph({ 
          text: `${optKey}. ${q.options[optKey]}`, 
          indent: { left: 400 },
          ...(isLast ? { spacing: { after: 200 } } : {})
        }));
      });
    }

    // 3. In đáp án đúng ngay bên dưới
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Đáp án: ', bold: true }),
          new TextRun({ text: q.answer || 'Chưa có', bold: true }),
        ],
        indent: { left: 400 },
        spacing: { before: 100, after: 100 },
      })
    );

    // 4. In giải thích
    if (q.explanation) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: 'Giải thích: ', italics: true, bold: true }),
          ],
          indent: { left: 400 },
          spacing: { after: 100 },
        })
      );

      // Nếu có thẻ HTML thì dùng parseHtmlToDocxElements
      if (q.explanation.includes('<') && q.explanation.includes('>')) {
        const explanationParagraphs = parseHtmlToDocxElements(q.explanation, 400);
        children.push(...explanationParagraphs);
      } else {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: q.explanation }),
            ],
            indent: { left: 400 },
            spacing: { after: 200 },
          })
        );
      }
    }
  });

  // Key Takeaways
  if (quiz.keyTakeaways) {
    children.push(
      new Paragraph({
        text: "TỔNG HỢP KIẾN THỨC THEO BỘ (KEY TAKEAWAYS)",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 200 },
        pageBreakBefore: true,
      })
    );

    const takeawaysLines = quiz.keyTakeaways.split(/\r?\n/);
    takeawaysLines.forEach(line => {
      // Bỏ qua dòng trống
      if (line.trim()) {
         // Thử check xem keyTakeaways có HTML không (vì có thể cũng được soạn bằng Tiptap)
         if (line.includes('<') && line.includes('>')) {
            const takeawayElements = parseHtmlToDocxElements(line, 0);
            children.push(...takeawayElements);
         } else {
            children.push(
              new Paragraph({
                text: line,
                spacing: { after: 100 },
              })
            );
         }
      }
    });
  }

  // Create doc and save
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: children,
      },
    ],
  });

  Packer.toBlob(doc).then((blob) => {
    const safeFilename = (quiz.title || 'Bo_Cau_Hoi').replace(/[^a-z0-9A-Z]/gi, '_');
    saveAs(blob, `${safeFilename}.docx`);
  }).catch(err => {
    console.error("Export to Docx error", err);
    alert('Không thể xuất file Word. Vui lòng thử lại!');
  });
};

/**
 * Export a single Note to a Word (.doc / .docx) file.
 * Preserves title, category, tags, and full HTML formatting (images, tables, headings, blockquotes, lists).
 * @param {Object} note - The note object { title, category, tags, content }
 */
export const exportNoteToWord = (note) => {
  if (!note) return;

  const title = note.title || 'Ghi chú mới';
  const category = note.category || 'Mặc định';
  const tags = (note.tags || []).join(', ');
  const content = note.content || '<p>Chưa có nội dung</p>';

  const htmlDocument = `
    <!DOCTYPE html>
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <!--[if gte mso 9]>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
      </xml>
      <![endif]-->
      <style>
        @page {
          size: A4;
          margin: 2cm;
        }
        body {
          font-family: 'Calibri', 'Arial', sans-serif;
          font-size: 11pt;
          line-height: 1.6;
          color: #1e293b;
        }
        .header-title {
          font-size: 22pt;
          font-weight: bold;
          color: #4f46e5;
          margin-bottom: 6px;
          border-bottom: 2px solid #6366f1;
          padding-bottom: 6px;
        }
        .header-meta {
          font-size: 9.5pt;
          color: #64748b;
          margin-bottom: 20px;
        }
        h1 { font-size: 18pt; color: #1e293b; font-weight: bold; margin-top: 18px; margin-bottom: 8px; }
        h2 { font-size: 14pt; color: #4338ca; font-weight: bold; margin-top: 14px; margin-bottom: 6px; }
        h3 { font-size: 12pt; color: #334155; font-weight: bold; margin-top: 12px; margin-bottom: 4px; }
        p { margin-bottom: 10px; }
        strong, b { font-weight: bold; color: #0f172a; }
        em, i { font-style: italic; }
        u { text-decoration: underline; }
        blockquote {
          border-left: 4px solid #818cf8;
          background-color: #f8fafc;
          padding: 10px 14px;
          margin: 12px 0;
          color: #334155;
          font-style: italic;
        }
        table {
          border-collapse: collapse;
          width: 100%;
          margin: 12px 0;
        }
        th, td {
          border: 1px solid #cbd5e1;
          padding: 8px 12px;
          text-align: left;
        }
        th {
          background-color: #f1f5f9;
          font-weight: bold;
          color: #1e293b;
        }
        ul, ol {
          padding-left: 24px;
          margin-bottom: 10px;
        }
        li {
          margin-bottom: 4px;
        }
        img {
          max-width: 100%;
          height: auto;
          display: block;
          margin: 12px 0;
        }
        hr {
          border: 0;
          border-top: 1px solid #e2e8f0;
          margin: 16px 0;
        }
      </style>
    </head>
    <body>
      <div class="header-title">${title}</div>
      <div class="header-meta">
        <strong>Danh mục:</strong> ${category} ${tags ? `| <strong>Tags:</strong> ${tags}` : ''}
      </div>
      <div>
        ${content}
      </div>
    </body>
    </html>
  `;

  try {
    const blob = new Blob(['\ufeff', htmlDocument], { type: 'application/msword;charset=utf-8' });
    const cleanTitle = title.replace(/[^a-zA-Z0-9\sÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂÂĐỔỞỚỜỞỨỪỬỮỰỲÝỴỶỸửữựỳýỵỷỹ_-]/g, '').trim();
    saveAs(blob, `${cleanTitle || 'ghi-chu'}.doc`);
  } catch (err) {
    console.error('Lỗi xuất file Word:', err);
    alert('Không thể xuất file Word: ' + err.message);
  }
};
