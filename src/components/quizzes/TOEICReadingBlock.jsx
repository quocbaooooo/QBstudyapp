import React, { useState, useRef, useLayoutEffect, useCallback } from 'react';
import { BookOpen, Upload, Trash2, Save, CheckCircle, Copy, Star, XCircle, Image as ImageIcon, Eye, EyeOff, Sparkles, Edit3, StickyNote } from 'lucide-react';
import ResizableSplitPanel from './ResizableSplitPanel';
import TOEICImageUploader from './TOEICImageUploader';

function AutoResizeTextarea({ value, onChange, placeholder, style, minRows = 6, ...props }) {
  const textareaRef = useRef(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.max(el.scrollHeight, 140)}px`;
    }
  }, []);

  useLayoutEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => {
        if (onChange) onChange(e);
        adjustHeight();
      }}
      placeholder={placeholder}
      rows={minRows}
      style={{
        width: '100%',
        background: 'rgba(0,0,0,0.3)',
        color: '#fff',
        border: '1px solid rgba(148,163,184,0.25)',
        borderRadius: '8px',
        padding: '10px',
        fontSize: '13.5px',
        lineHeight: '1.6',
        fontFamily: 'inherit',
        resize: 'vertical',
        boxSizing: 'border-box',
        ...style
      }}
      {...props}
    />
  );
}

export default function TOEICReadingBlock({
  passageObj,
  groupQuestions,
  questionsForDisplay,
  isTesting,
  setActiveLightboxImage,
  copiedQuestionId,
  handleCopyQuestionToClipboard,
  handleToggleBookmark,
  handleDeleteQuestion,
  handleUpdateQuestionProp,
  handleUpdateOptionProp,
  handleUpdateReadingPassageProp,
  handleDeleteReadingPassage,
  handleUpdateReadingPassageRange,
  handleUploadReadingPassageImages,
  handleDeleteReadingPassageImage,
  handleSelectAnswer,
  handleCallAI,
  aiLoading,
  shuffledOptions,
  isShuffled,
  renderQuizText,
  renderPassageWithBlankHighlights,
  isSameSelectedGroup,
  activeReadingBlankNumber,
  readingPassageMap,
  TiptapEditor
}) {
  const startNumCalc = groupQuestions?.[0]?.blankNumber || ((questionsForDisplay || []).findIndex(x => x?.id === groupQuestions?.[0]?.id) + 1);
  const endNumCalc = groupQuestions?.[groupQuestions?.length - 1]?.blankNumber || ((questionsForDisplay || []).findIndex(x => x?.id === groupQuestions?.[groupQuestions?.length - 1]?.id) + 1);

  const [startRangeInput, setStartRangeInput] = useState(passageObj.startNum || startNumCalc || '');
  const [endRangeInput, setEndRangeInput] = useState(passageObj.endNum || endNumCalc || '');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isEditingTranslation, setIsEditingTranslation] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);

  const handleSaveRange = () => {
    const s = parseInt(startRangeInput, 10);
    const e = parseInt(endRangeInput, 10);
    if (!isNaN(s) && !isNaN(e) && s <= e) {
      handleUpdateReadingPassageRange(passageObj.id, s, e);
    } else {
      alert('Vui lòng nhập dải câu hỏi hợp lệ (Ví dụ: Từ câu 131 đến 134)');
    }
  };

  const handleImageFileChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleUploadReadingPassageImages(passageObj.id, files);
    }
  };

  const passageHeaderUI = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px', borderBottom: '1px solid rgba(6,182,212,0.2)', paddingBottom: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <BookOpen size={16} color="#8eefff" />
        <span style={{ fontSize: '13px', fontWeight: 800, color: '#8eefff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          READING BLOCK (CÂU {passageObj.rangeStr || `${startNumCalc} - ${endNumCalc}`})
        </span>
      </div>

      {!isTesting && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Custom Question Range Editor */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(0,0,0,0.3)', padding: '3px 6px', borderRadius: '6px', border: '1px solid rgba(6,182,212,0.25)' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Dải câu:</span>
            <input
              type="number"
              value={startRangeInput}
              onChange={(e) => setStartRangeInput(e.target.value)}
              placeholder="Từ"
              style={{ width: '42px', background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', padding: '2px 4px', fontSize: '11.5px', textAlign: 'center' }}
            />
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>–</span>
            <input
              type="number"
              value={endRangeInput}
              onChange={(e) => setEndRangeInput(e.target.value)}
              placeholder="Đến"
              style={{ width: '42px', background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', padding: '2px 4px', fontSize: '11.5px', textAlign: 'center' }}
            />
            <button
              type="button"
              onClick={handleSaveRange}
              style={{ background: 'rgba(6,182,212,0.25)', border: '1px solid rgba(6,182,212,0.4)', color: '#8eefff', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
              title="Lưu dải câu hỏi cho Block này"
            >
              <Save size={11} /> Lưu
            </button>
          </div>

          {/* Upload Images & Link Button */}
          <button
            type="button"
            onClick={() => {
              const url = prompt('Dán URL link hình ảnh bài đọc (https://...)\nHoặc bấm OK (để trống) để chọn file ảnh từ máy tính:');
              if (url !== null) {
                if (url.trim()) {
                  const newImg = { id: uuidv4(), name: 'Link Image', data: url.trim(), url: url.trim() };
                  handleUpdateReadingPassageProp(passageObj.id, 'images', [...(passageObj.images || []), newImg]);
                } else {
                  document.getElementById(`file-input-reading-${passageObj.id}`)?.click();
                }
              }
            }}
            style={{ fontSize: '11px', padding: '4px 8px', background: 'rgba(6,182,212,0.15)', color: '#8eefff', border: '1px solid rgba(6,182,212,0.3)', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
            title="Tải ảnh từ máy hoặc dán link URL ảnh"
          >
            <Upload size={12} /> 🖼️ Tải Ảnh / Dán Link...
          </button>
          <input
            id={`file-input-reading-${passageObj.id}`}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageFileChange}
            style={{ display: 'none' }}
          />

          {/* Delete Block Button */}
          <button
            type="button"
            onClick={() => handleDeleteReadingPassage(passageObj.id)}
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '4px 7px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600 }}
            title="Xóa Reading Block này"
          >
            <Trash2 size={12} /> Xóa Block
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div key={`reading-group-wrapper-${passageObj.id}`} id={`reading-block-${passageObj.id}`} className="glass-panel" style={{ padding: '16px', marginBottom: '20px', border: '1px solid rgba(6,182,212,0.35)', borderRadius: '16px' }}>
      {passageHeaderUI}

      <ResizableSplitPanel
        defaultLeftPercent={45}
        leftContent={
          <div style={{ background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(6,182,212,0.25)', borderRadius: '14px', padding: '14px', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#8eefff', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <BookOpen size={15} /> Đoạn văn bài đọc
            </div>

            {isTesting ? (
              <div style={{
                whiteSpace: 'pre-wrap',
                lineHeight: '1.7',
                fontSize: '14px',
                color: 'var(--text-main)'
              }}>
                {renderPassageWithBlankHighlights(passageObj.content || '', isSameSelectedGroup ? activeReadingBlankNumber : null)}
              </div>
            ) : (
              <AutoResizeTextarea
                value={passageObj.content || ''}
                onChange={(e) => handleUpdateReadingPassageProp(passageObj.id, 'content', e.target.value)}
                placeholder="Nhập hoặc dán nội dung đoạn văn bài đọc tại đây..."
                minRows={6}
              />
            )}

            {/* TOGGLE TRANSLATION BUTTON (TEST MODE) */}
            {isTesting && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setShowTranslation(!showTranslation)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: showTranslation ? 'rgba(0,227,253,0.25)' : 'rgba(255,255,255,0.06)',
                    color: showTranslation ? '#8eefff' : 'var(--text-muted)',
                    border: '1px solid rgba(0,227,253,0.35)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {showTranslation ? <EyeOff size={14} /> : <Eye size={14} />}
                  {showTranslation ? 'Ẩn bản dịch tiếng Việt' : 'Xem bản dịch tiếng Việt'}
                </button>
              </div>
            )}

            {/* BẢN DỊCH TIẾNG VIỆT (TRANSLATION) SECTION */}
            {(!isTesting || showTranslation) && (
              <div style={{
                background: 'rgba(15, 23, 42, 0.65)',
                border: '1px solid rgba(0, 227, 253, 0.45)',
                borderRadius: '12px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                marginTop: '4px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#00e3fd', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🌐</span> <span>🇻🇳</span> BẢN DỊCH TIẾNG VIỆT (TRANSLATION):
                  </div>
                  {!isTesting && (
                    <button
                      type="button"
                      onClick={() => setIsEditingTranslation(!isEditingTranslation)}
                      style={{
                        background: isEditingTranslation ? 'rgba(0,227,253,0.3)' : 'rgba(0,227,253,0.12)',
                        border: '1px solid rgba(0,227,253,0.35)',
                        color: '#8eefff',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      title="Bấm để chỉnh sửa bản dịch tiếng Việt"
                    >
                      {isEditingTranslation ? <CheckCircle size={12} /> : <Edit3 size={12} />}
                      {isEditingTranslation ? 'Xong' : 'Sửa Bản Dịch'}
                    </button>
                  )}
                </div>

                {!isTesting || isEditingTranslation ? (
                  <AutoResizeTextarea
                    value={passageObj.translation || passageObj.contentTranslation || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      handleUpdateReadingPassageProp(passageObj.id, 'translation', val);
                      handleUpdateReadingPassageProp(passageObj.id, 'contentTranslation', val);
                    }}
                    placeholder="Nhập hoặc dán bản dịch tiếng Việt của đoạn văn bài đọc tại đây..."
                    minRows={3}
                    style={{
                      background: 'rgba(0,0,0,0.35)',
                      color: '#8eefff',
                      border: '1px solid rgba(0,227,253,0.35)',
                      outline: 'none'
                    }}
                  />
                ) : (
                  <div style={{
                    color: '#8eefff',
                    fontSize: '13.5px',
                    lineHeight: '1.7',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'inherit',
                    padding: '2px 0'
                  }}>
                    {(passageObj.translation || passageObj.contentTranslation) ? (
                      passageObj.translation || passageObj.contentTranslation
                    ) : (
                      <span style={{ color: 'rgba(0,227,253,0.5)', fontStyle: 'italic', fontSize: '12px' }}>
                        Chưa có bản dịch tiếng Việt cho bài đọc này. (Bấm "Sửa Bản Dịch" để thêm bản dịch)
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* GHI CHÚ & TỪ VỰNG (NOTES) SECTION */}
            <div style={{
              background: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid rgba(245, 158, 11, 0.45)',
              borderRadius: '12px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              marginTop: '4px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span>📄</span> <span>📌</span> GHI CHÚ & TỪ VỰNG (NOTES):
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingNotes(!isEditingNotes)}
                  style={{
                    background: isEditingNotes ? 'rgba(251,191,36,0.3)' : 'rgba(251,191,36,0.12)',
                    border: '1px solid rgba(251,191,36,0.35)',
                    color: '#fbbf24',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="Bấm để chỉnh sửa ghi chú từ vựng"
                >
                  {isEditingNotes ? <CheckCircle size={12} /> : <Edit3 size={12} />}
                  {isEditingNotes ? 'Xong' : 'Sửa Ghi Chú'}
                </button>
              </div>

              {!isTesting || isEditingNotes ? (
                <AutoResizeTextarea
                  value={passageObj.notes || ''}
                  onChange={(e) => handleUpdateReadingPassageProp(passageObj.id, 'notes', e.target.value)}
                  placeholder={"Nhập ghi chú & từ vựng bài đọc tại đây...\nVí dụ:\n- Advertise (v) quảng cáo\n- Beverage (n) đồ uống\n- Superior (adj) Ưu việt\n- distinctive /dɪˈstɪŋktɪv/ (adj) có đặc điểm riêng\n- flavor (hương vị)"}
                  minRows={3}
                  style={{
                    background: 'rgba(0,0,0,0.35)',
                    color: '#fbbf24',
                    border: '1px solid rgba(245,158,11,0.35)',
                    outline: 'none'
                  }}
                />
              ) : (
                <div style={{
                  color: '#fbbf24',
                  fontSize: '13.5px',
                  lineHeight: '1.7',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'inherit',
                  padding: '2px 0'
                }}>
                  {passageObj.notes ? (
                    passageObj.notes
                  ) : (
                    <span style={{ color: 'rgba(251,191,36,0.5)', fontStyle: 'italic', fontSize: '12px' }}>
                      Chưa có ghi chú từ vựng cho bài đọc này. (Bấm "Sửa Ghi Chú" để thêm từ vựng mới)
                    </span>
                  )}
                </div>
              )}
            </div>

            <TOEICImageUploader
              images={passageObj.images || []}
              onImagesChange={(updatedImgs) => handleUpdateReadingPassageProp(passageObj.id, 'images', updatedImgs)}
              setActiveLightboxImage={setActiveLightboxImage}
              accentColor="#8eefff"
              label="🖼️ HÌNH ẢNH:"
              isTesting={isTesting}
            />
          </div>
        }
        rightContent={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%', overflowY: 'auto' }}>
            {groupQuestions.map((item) => {
              const itemIndex = questionsForDisplay.findIndex(x => x.id === item.id);
              const answerRevealed = isTesting && item.userAnswer;
              const displayQuestionText = isTesting ? (item._questionOnly || item.question) : item.question;
              const blankNotFoundInPassage = item.blankNumber
                && !(readingPassageMap.get(item.readingGroupId)?.blankNumbers || []).some(n => String(n) === String(item.blankNumber));

              return (
                <div
                  key={`reading-card-${item.id}`}
                  id={`question-card-${item.id}`}
                  data-blank-number={item.blankNumber || (itemIndex + 1)}
                  className="glass-panel"
                  style={{
                    borderRadius: '12px',
                    border: '1px solid rgba(148,163,184,0.22)',
                    background: 'rgba(2,6,23,0.25)',
                    padding: '14px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '12px' }}>
                    <div style={{ fontWeight: '500', fontSize: '15px', flex: 1 }}>
                      {!isTesting ? (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                          <span style={{ paddingTop: '8px', fontWeight: 'bold', fontSize: '14px', color: '#8eefff' }}>
                            {item.blankNumber || (itemIndex + 1)}.
                          </span>
                          <textarea
                            value={item.question}
                            onChange={e => handleUpdateQuestionProp(item.id, 'question', e.target.value)}
                            style={{ flex: 1, background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px', fontSize: '14px', resize: 'vertical', minHeight: '54px' }}
                          />
                        </div>
                      ) : (
                        <span>
                          {item.blankNumber || (itemIndex + 1)}. {renderQuizText(displayQuestionText, answerRevealed)}
                          {item.allowMultipleAnswers && (
                            <span style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(234,179,8,0.15)', color: '#facc15', border: '1px solid rgba(234,179,8,0.3)', fontWeight: 'normal', display: 'inline-block', verticalAlign: 'middle', marginTop: '-2px' }}>
                              Đây là câu chọn nhiều đáp án
                            </span>
                          )}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                      <button
                        onClick={() => handleCopyQuestionToClipboard(item, itemIndex)}
                        title={copiedQuestionId === item.id ? "Đã sao chép!" : "Sao chép câu hỏi này"}
                        style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: copiedQuestionId === item.id ? 'var(--accent-green)' : 'var(--text-muted)', display: 'flex' }}
                      >
                        {copiedQuestionId === item.id ? <CheckCircle size={15} color="var(--accent-green)" /> : <Copy size={15} />}
                      </button>
                      <button
                        onClick={() => handleToggleBookmark(item.id)}
                        title={item.isStarred ? 'Bỏ đánh dấu' : 'Đánh dấu câu hỏi này'}
                        style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: item.isStarred ? '#fbbf24' : 'var(--text-muted)', display: 'flex' }}
                      >
                        <Star size={16} fill={item.isStarred ? '#fbbf24' : 'none'} color={item.isStarred ? '#fbbf24' : 'currentColor'} />
                      </button>
                      {!isTesting && (
                        <button
                          onClick={() => handleDeleteQuestion(item.id)}
                          title="Xóa câu hỏi này"
                          style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>

                  {blankNotFoundInPassage && (
                    <div style={{ marginBottom: '8px', fontSize: '11px', color: '#facc15', background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.35)', borderRadius: '8px', padding: '4px 8px' }}>
                      ⚠ Blank {item.blankNumber} chưa có trong đoạn văn bài đọc.
                    </div>
                  )}

                  {/* Options List */}
                  <div style={{ display: 'grid', gridTemplateColumns: Object.values(item.options).some(o => o && o.length > 50) ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                    {(isShuffled && shuffledOptions?.[item.id] ? shuffledOptions[item.id] : Object.keys(item.options).sort()).map((opt, idx) => {
                      const displayLetter = ['A', 'B', 'C', 'D', 'E', 'F'][idx] || opt;
                      const isSelected = item.allowMultipleAnswers ? (item.userAnswer || '').split(',').includes(opt) : item.userAnswer === opt;
                      const isCorrectOption = item.allowMultipleAnswers ? (item.answer || '').split(',').includes(opt) : item.answer === opt;

                      let bgColor = 'transparent';
                      if (isTesting) {
                        if (isSelected) {
                          bgColor = (item.answer && !isCorrectOption) ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)';
                        }
                      } else {
                        if (isCorrectOption) bgColor = 'rgba(16, 185, 129, 0.15)';
                      }

                      return (
                        <div
                          key={`${item.id}-${opt}`}
                          onClick={() => isTesting && handleSelectAnswer(item.id, opt)}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)',
                            background: bgColor,
                            cursor: isTesting ? 'pointer' : 'default',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '13.5px'
                          }}
                        >
                          <strong style={{ minWidth: '18px' }}>{displayLetter}.</strong>
                          {!isTesting ? (
                            <input
                              type="text"
                              value={item.options[opt] || ''}
                              onChange={e => handleUpdateOptionProp(item.id, opt, e.target.value)}
                              style={{ flex: 1, background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '4px 8px', fontSize: '13px' }}
                            />
                          ) : (
                            <span>{renderQuizText(item.options[opt], answerRevealed)}</span>
                          )}

                          {isTesting && item.answer && item.userAnswer === opt && opt === item.answer && <CheckCircle size={14} color="var(--accent-green)" />}
                          {isTesting && item.answer && item.userAnswer === opt && opt !== item.answer && <XCircle size={14} color="var(--accent-red)" />}
                        </div>
                      );
                    })}
                  </div>

                  {/* Correct Answer & Explanation Display in Test Mode when user has chosen an answer */}
                  {isTesting && item.userAnswer && (
                    <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed rgba(255,255,255,0.1)', fontSize: '13px' }}>
                      {item.answer && (
                        <div style={{ color: 'var(--accent-green)', fontWeight: 'bold', marginBottom: '6px', fontSize: '13.5px' }}>
                          ✓ Đáp án đúng: {item.answer}. {item.options[item.answer]}
                        </div>
                      )}
                      {item.explanation && (
                        <div style={{ color: 'var(--text-main)', background: 'rgba(0,0,0,0.25)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.25)', marginTop: '6px' }}>
                          <strong style={{ color: 'var(--accent-orange)', display: 'block', marginBottom: '6px', fontSize: '12.5px' }}>📝 Lời giải thích chi tiết:</strong>
                          {TiptapEditor ? (
                            <TiptapEditor content={item.explanation} readOnly={true} variant="mini" onChange={() => { }} />
                          ) : item.explanation.includes('<') && item.explanation.includes('>') ? (
                            <div className="tiptap-rendered-content" dangerouslySetInnerHTML={{ __html: item.explanation }} />
                          ) : (
                            <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{item.explanation}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Correct Answer & Explanation Selector in Edit Mode */}
                  {!isTesting && (
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-green)' }}>✓ Đáp án đúng:</span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {Object.keys(item.options).sort().map(optKey => (
                            <button
                              key={optKey}
                              type="button"
                              onClick={() => handleUpdateQuestionProp(item.id, 'answer', optKey)}
                              style={{
                                padding: '4px 10px', borderRadius: '4px', border: '1px solid var(--border-color)',
                                background: item.answer === optKey ? 'var(--primary)' : 'var(--bg-secondary)',
                                color: item.answer === optKey ? 'var(--on-primary)' : 'var(--text-main)',
                                cursor: 'pointer', fontWeight: 700, fontSize: '12px'
                              }}
                            >
                              {optKey}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Explanation Editor */}
                      {TiptapEditor && (
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                            📝 Lời giải thích chi tiết:
                          </div>
                          <TiptapEditor
                            variant="mini"
                            title="Giải thích"
                            content={item.explanation || ''}
                            onChange={html => handleUpdateQuestionProp(item.id, 'explanation', html)}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        }
      />
    </div>
  );
}
