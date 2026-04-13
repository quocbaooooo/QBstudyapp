import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';

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
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Câu ${i + 1}: `, bold: true }),
          new TextRun({ text: q.question, bold: true }),
        ],
        spacing: { before: 200, after: 100 },
      })
    );

    if (q.options) {
      if (q.options.A) children.push(new Paragraph({ text: `A. ${q.options.A}`, indent: { left: 400 } }));
      if (q.options.B) children.push(new Paragraph({ text: `B. ${q.options.B}`, indent: { left: 400 } }));
      if (q.options.C) children.push(new Paragraph({ text: `C. ${q.options.C}`, indent: { left: 400 } }));
      if (q.options.D) children.push(new Paragraph({ text: `D. ${q.options.D}`, indent: { left: 400 }, spacing: { after: 200 } }));
    }
  });

  // Page Break before Answers
  children.push(
    new Paragraph({
      text: "ĐÁP ÁN & GIẢI THÍCH CHUYÊN SÂU",
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400, after: 200 },
      pageBreakBefore: true,
    })
  );

  // Answers & Explanations
  quiz.questions.forEach((q, i) => {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Câu ${i + 1}: `, bold: true }),
          new TextRun({ text: q.answer || 'Chưa có', bold: true }),
        ],
        spacing: { before: 100 },
      })
    );

    if (q.explanation) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: 'Giải thích: ', italics: true }),
            new TextRun({ text: q.explanation, italics: true }),
          ],
          indent: { left: 400 },
          spacing: { after: 200 },
        })
      );
    }
  });

  // Key Takeaways
  if (quiz.keyTakeaways) {
    children.push(
      new Paragraph({
        text: "TỔNG HỢP KIẾN THỨC THEO BỘ (KEY TAKEAWAYS)",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 200 },
      })
    );

    const takeawaysLines = quiz.keyTakeaways.split(/\r?\n/);
    takeawaysLines.forEach(line => {
      children.push(
        new Paragraph({
          text: line,
          spacing: { after: 100 },
        })
      );
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
