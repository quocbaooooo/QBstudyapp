import React from 'react';

const GuideModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div 
        className="relative w-full max-w-3xl max-h-[85vh] rounded-2xl border border-white/10 shadow-[0_0_50px_rgba(34,211,238,0.15)] flex flex-col z-10"
        style={{
          background: 'radial-gradient(circle at top right, rgba(124,77,255,0.15), transparent 400px), #0b1120',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 p-5 shrink-0 bg-white/5 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-cyan-400/10 flex items-center justify-center border border-cyan-400/30">
              <span className="material-symbols-outlined text-cyan-400">menu_book</span>
            </div>
            <div>
              <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-cyan-400">
                Hướng Dẫn Sử Dụng
              </h2>
              <p className="text-xs text-slate-400">Khám phá cách tối ưu hóa trải nghiệm học tập cùng QBStudy</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Content (Scrollable) */}
        <div className="p-6 md:p-8 overflow-y-auto space-y-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          
          {/* Section 1 */}
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-violet-400">home</span>
              1. Khởi Độ Không Gian Học (Home)
            </h3>
            <ul className="list-disc list-inside text-sm text-slate-300 space-y-2 ml-2 leading-relaxed">
              <li><strong>Bảng tin tiếng Anh:</strong> Cập nhật bài báo từ VOA, BBC Learning English để luyện đọc tự nhiên mỗi ngày.</li>
              <li><strong>Đồng hồ Pomodoro:</strong> Quản lý thời gian theo phương pháp 25 phút học / 5 phút nghỉ. Nhấn "Start" để bắt đầu trạng thái tập trung.</li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-cyan-400">headphones</span>
              2. Nhạc Nền "Deep Work"
            </h3>
            <ul className="list-disc list-inside text-sm text-slate-300 space-y-2 ml-2 leading-relaxed">
              <li>Tại mục <strong>Cài đặt</strong>, bật công tắc Nhạc Nền.</li>
              <li>Nhạc sẽ tự động lấy từ Youtube và phát ẩn dưới nền, không bị ngắt khi bạn chuyển qua lại giữa các mục Sổ tay, Trắc nghiệm hay Thẻ học.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-violet-400">quiz</span>
              3. Trắc Nghiệm Thông Minh (Quizzes)
            </h3>
            <ul className="list-disc list-inside text-sm text-slate-300 space-y-2 ml-2 leading-relaxed">
              <li><strong>Sinh bài bằng AI:</strong> Tải lên Hình ảnh hoặc file PDF chứa đoạn văn/câu hỏi. AI sẽ tự động đọc (OCR) và sinh ra bộ trắc nghiệm chuẩn không cần gõ tay.</li>
              <li><strong>Self-Test Mode:</strong> Chế độ thi thử ẩn đáp án, tự động chấm điểm và đánh dấu lỗi sai ngay tức thì.</li>
              <li><strong>Chế độ Đọc Hiểu:</strong> Tính năng chia đôi màn hình: Đoạn văn bên trái, câu hỏi bên phải giúp bạn không cần cuộn trang mỏi tay.</li>
              <li><strong>Xuất file Word:</strong> Nhấp vào icon Word mẻ để tải ngay tập tin .docx nguyên vẹn định dạng in ấn.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-cyan-400">edit_document</span>
              4. Ghi Chú AI (Notes & Tiptap Editor)
            </h3>
            <ul className="list-disc list-inside text-sm text-slate-300 space-y-2 ml-2 leading-relaxed">
              <li>Trình soạn thảo sạch sẽ để lưu cấu trúc ngữ pháp, bài luận.</li>
              <li><strong>Trợ lý AI Word Completion:</strong> Bí từ? Sai ngữ pháp? Bôi đen đoạn văn bản và gọi AI sửa chữa, hoặc nhờ AI viết tiếp câu theo ý bạn.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-violet-400">style</span>
              5. Thẻ Ghi Nhớ (Flashcards)
            </h3>
            <ul className="list-disc list-inside text-sm text-slate-300 space-y-2 ml-2 leading-relaxed">
              <li>Tạo <em>Decks</em> (Bộ bài) cho từng chủ đề từ vựng.</li>
              <li>Mỗi mặt thẻ (Front/Back) có thể lưu chữ và công thức. Lật đi lật lại thẻ giúp đưa kiến thức vào bộ nhớ dài hạn dễ dàng hơn.</li>
            </ul>
          </section>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-white/10 bg-white/5 rounded-b-2xl flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-colors"
          >
            Đã hiểu, Bắt đầu học!
          </button>
        </div>
      </div>
    </div>
  );
};

export default GuideModal;
