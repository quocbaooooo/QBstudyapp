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
          new TextRun({ text: `Câu ${i + 1}: `, bold: true }),
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
