import React, { useState, useRef, useLayoutEffect, useCallback } from 'react';
import { Headphones, Music, Eye, EyeOff, CheckCircle, XCircle, Copy, Star, Trash2, Sparkles, StickyNote } from 'lucide-react';
import TOEICAudioPlayer from './TOEICAudioPlayer';
import ResizableSplitPanel from './ResizableSplitPanel';

function AutoResizeTextarea({ value, onChange, placeholder, style, minRows = 2, ...props }) {
  const textareaRef = useRef(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.max(el.scrollHeight, 44)}px`;
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
        background: 'rgba(0,0,0,0.35)',
        color: '#fff',
        border: '1px solid rgba(236,72,153,0.3)',
        borderRadius: '8px',
        padding: '8px 10px',
        fontSize: '12px',
        fontFamily: 'inherit',
        resize: 'none',
        overflow: 'hidden',
        lineHeight: '1.5',
        boxSizing: 'border-box',
        fieldSizing: 'content',
        ...style
      }}
      {...props}
    />
  );
}

export default function TOEICListeningBlock({
  listeningObj,
  groupQuestions,
  questionsForDisplay,
  isTesting,
  showTranscriptMap,
  setShowTranscriptMap,
  showTranslationMap,
  setShowTranslationMap,
  showNotesMap,
  setShowNotesMap,
  setActiveLightboxImage,
  copiedQuestionId,
  handleCopyQuestionToClipboard,
  handleToggleBookmark,
  handleDeleteQuestion,
  handleUpdateQuestionProp,
  handleUpdateOptionProp,
  handleUpdateListeningPassageProp,
  handleSelectAnswer,
  handleCallAI,
  aiLoading,
  shuffledOptions,
  isShuffled,
  renderQuizText,
  TiptapEditor
}) {
  const [localShowNotes, setLocalShowNotes] = useState({});
  const activeShowNotesMap = showNotesMap || localShowNotes;
  const activeSetShowNotesMap = setShowNotesMap || setLocalShowNotes;

  const startNumStr = groupQuestions[0]?.blankNumber || (questionsForDisplay.findIndex(x => x.id === groupQuestions[0]?.id) + 1);
  const endNumStr = groupQuestions[groupQuestions.length - 1]?.blankNumber || (questionsForDisplay.findIndex(x => x.id === groupQuestions[groupQuestions.length - 1]?.id) + 1);

  return (
    <div key={`listening-test-group-${listeningObj.id}`} className="glass-panel" style={{ padding: '16px', marginBottom: '20px', border: '1px solid rgba(236,72,153,0.35)', borderRadius: '16px' }}>
      <div style={{ fontSize: '13px', fontWeight: 800, color: '#f472b6', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        <Headphones size={16} /> TOEIC LISTENING BLOCK (CÂU {startNumStr} - {endNumStr})
      </div>

      <ResizableSplitPanel
        defaultLeftPercent={40}
        leftContent={
          <div style={{ background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(236,72,153,0.25)', borderRadius: '14px', padding: '14px', height: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#f472b6', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Music size={15} /> Nguồn Âm Thanh & Kịch Bản
            </div>

            <TOEICAudioPlayer 
              src={listeningObj.audioUrl} 
              passageId={listeningObj.id} 
              title={listeningObj.audioName || listeningObj.title} 
            />

            {listeningObj.images && listeningObj.images.length > 0 && (
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', margin: '6px 0' }}>
                {listeningObj.images.map(img => (
                  <img
                    key={img.id}
                    src={img.data || img.url}
                    alt={img.name}
                    onClick={() => setActiveLightboxImage(img.data || img.url)}
                    style={{ width: '100%', maxHeight: '220px', objectFit: 'contain', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', background: '#000' }}
                    title="Click để phóng to ảnh"
                  />
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
              {listeningObj.transcript && (
                <button
                  type="button"
                  onClick={() => setShowTranscriptMap(prev => ({ ...prev, [listeningObj.id]: !prev[listeningObj.id] }))}
                  style={{
                    padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                    background: showTranscriptMap[listeningObj.id] ? 'rgba(236,72,153,0.3)' : 'rgba(255,255,255,0.06)',
                    color: showTranscriptMap[listeningObj.id] ? '#f472b6' : 'var(--text-muted)',
                    border: '1px solid rgba(236,72,153,0.3)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  {showTranscriptMap[listeningObj.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                  Xem transcript
                </button>
              )}

              {(listeningObj.transcriptTranslation || listeningObj.transcript) && (
                <button
                  type="button"
                  onClick={() => setShowTranslationMap(prev => ({ ...prev, [listeningObj.id]: !prev[listeningObj.id] }))}
                  style={{
                    padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                    background: showTranslationMap[listeningObj.id] ? 'rgba(0,227,253,0.25)' : 'rgba(255,255,255,0.06)',
                    color: showTranslationMap[listeningObj.id] ? '#8eefff' : 'var(--text-muted)',
                    border: '1px solid rgba(0,227,253,0.3)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  {showTranslationMap[listeningObj.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                  Xem bản dịch
                </button>
              )}

              <button
                type="button"
                onClick={() => activeSetShowNotesMap(prev => ({ ...prev, [listeningObj.id]: !prev[listeningObj.id] }))}
                style={{
                  padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                  background: activeShowNotesMap[listeningObj.id] ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.06)',
                  color: activeShowNotesMap[listeningObj.id] ? '#fbbf24' : 'var(--text-muted)',
                  border: '1px solid rgba(251,191,36,0.35)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px'
                }}
              >
                {activeShowNotesMap[listeningObj.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                <StickyNote size={14} /> Xem ghi chú
              </button>
            </div>

            {showTranscriptMap[listeningObj.id] && listeningObj.transcript && (
              <div style={{ marginTop: '6px', padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(236,72,153,0.3)', fontSize: '13px', lineHeight: '1.65', whiteSpace: 'pre-wrap', color: '#fff' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#f472b6', marginBottom: '6px', textTransform: 'uppercase' }}>Transcript tiếng Anh:</div>
                {listeningObj.transcript}
              </div>
            )}

            {showTranslationMap[listeningObj.id] && (
              <div style={{ marginTop: '6px', padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(0,227,253,0.3)', fontSize: '13px', lineHeight: '1.65', whiteSpace: 'pre-wrap', color: '#8eefff' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#00e3fd', marginBottom: '6px', textTransform: 'uppercase' }}>Bản dịch tiếng Việt:</div>
                {listeningObj.transcriptTranslation || (listeningObj.transcript ? 'Chưa có bản dịch sẵn' : '')}
              </div>
            )}

            {activeShowNotesMap[listeningObj.id] && (
              <div style={{ marginTop: '6px', padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(251,191,36,0.35)', fontSize: '13px', lineHeight: '1.65', whiteSpace: 'pre-wrap', color: '#fef08a' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#fbbf24', marginBottom: '6px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <StickyNote size={13} /> Ghi Chú & Từ Vựng:
                </div>
                {listeningObj.notes || listeningObj.transcriptNotes || 'Chưa có ghi chú'}
              </div>
            )}

            {!isTesting && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#f472b6', marginBottom: '4px', textTransform: 'uppercase' }}>
                    📝 Kịch Bản (Transcript Tiếng Anh):
                  </div>
                  <AutoResizeTextarea
                    value={listeningObj.transcript || ''}
                    onChange={e => handleUpdateListeningPassageProp(listeningObj.id, 'transcript', e.target.value)}
                    placeholder="Nhập kịch bản tiếng Anh bài nghe ở đây..."
                    style={{
                      border: '1px solid rgba(236,72,153,0.3)',
                      color: '#fff'
                    }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#00e3fd', marginBottom: '4px', textTransform: 'uppercase' }}>
                    🇻🇳 Bản Dịch Kịch Bản (Tiếng Việt):
                  </div>
                  <AutoResizeTextarea
                    value={listeningObj.transcriptTranslation || ''}
                    onChange={e => handleUpdateListeningPassageProp(listeningObj.id, 'transcriptTranslation', e.target.value)}
                    placeholder="Nhập bản dịch tiếng Việt ở đây..."
                    style={{
                      border: '1px solid rgba(0,227,253,0.3)',
                      color: '#8eefff'
                    }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#fbbf24', marginBottom: '4px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <StickyNote size={13} /> 📌 Ghi Chú & Từ Vựng (Notes):
                  </div>
                  <AutoResizeTextarea
                    value={listeningObj.notes || listeningObj.transcriptNotes || ''}
                    onChange={e => {
                      handleUpdateListeningPassageProp(listeningObj.id, 'notes', e.target.value);
                      handleUpdateListeningPassageProp(listeningObj.id, 'transcriptNotes', e.target.value);
                    }}
                    placeholder="Nhập ghi chú, từ vựng hoặc lưu ý thêm bài nghe ở đây..."
                    style={{
                      border: '1px solid rgba(251,191,36,0.35)',
                      color: '#fef08a'
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        }
        rightContent={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {groupQuestions.map(item => {
              const itemIndex = questionsForDisplay.findIndex(x => x.id === item.id);
              const answerRevealed = isTesting ? !!item.userAnswer : true;
              const displayQuestionText = item.question;

              return (
                <div key={`listening-inline-card-${item.id}`} id={`question-card-${item.id}`} style={{
                  borderRadius: '12px',
                  border: '1px solid rgba(148,163,184,0.22)',
                  background: 'rgba(2,6,23,0.35)',
                  padding: '12px 14px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                    {!isTesting ? (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flex: 1 }}>
                        <span style={{ paddingTop: '6px', fontWeight: 700, fontSize: '14px' }}>Câu {item.blankNumber || (itemIndex + 1)}:</span>
                        <AutoResizeTextarea
                          value={item.question}
                          onChange={e => handleUpdateQuestionProp(item.id, 'question', e.target.value)}
                          placeholder="Nhập câu hỏi..."
                          style={{
                            flex: 1, background: 'var(--bg-secondary)', color: 'var(--text-main)',
                            border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 8px',
                            fontSize: '14px'
                          }}
                        />
                      </div>
                    ) : (
                      <div style={{ fontSize: '14px', fontWeight: 600, lineHeight: '1.45' }}>
                        Câu {item.blankNumber || (itemIndex + 1)}: {renderQuizText(displayQuestionText, answerRevealed)}
                      </div>
                    )}

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
                          style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-red)'}
                          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: Object.values(item.options).some(o => o && o.length > 50) ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                    {(isShuffled && shuffledOptions?.[item.id] ? shuffledOptions[item.id] : Object.keys(item.options).sort()).map((opt, idx) => {
                      const displayLetter = ['A', 'B', 'C', 'D', 'E', 'F'][idx] || opt;
                      const isCorrectOption = item.answer === opt;
                      const isSelected = item.userAnswer === opt;
                      return (
                        <div
                          key={`${item.id}-${opt}`}
                          onClick={() => isTesting && handleSelectAnswer(item.id, opt)}
                          style={{
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)',
                            background: isTesting
                              ? (isSelected ? (item.answer && !isCorrectOption ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)') : 'transparent')
                              : (isCorrectOption ? 'rgba(16,185,129,0.2)' : 'transparent'),
                            cursor: isTesting ? 'pointer' : 'default',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '13px'
                          }}
                        >
                          <strong style={{ minWidth: '18px' }}>{isTesting ? displayLetter : opt}.</strong>
                          {!isTesting ? (
                            <input
                              type="text"
                              value={item.options[opt]}
                              onChange={(e) => handleUpdateOptionProp(item.id, opt, e.target.value)}
                              style={{ flex: 1, background: 'transparent', color: 'var(--text-main)', border: 'none', borderBottom: '1px dashed var(--border-color)', padding: '2px 4px', fontSize: '13px', outline: 'none' }}
                            />
                          ) : (
                            <span>{renderQuizText(item.options[opt], answerRevealed)}</span>
                          )}
                          {isTesting && item.answer && isSelected && isCorrectOption && <CheckCircle size={14} color="var(--accent-green)" style={{ marginLeft: 'auto' }}/>}
                          {isTesting && item.answer && isSelected && !isCorrectOption && <XCircle size={14} color="var(--accent-red)" style={{ marginLeft: 'auto' }}/>}
                        </div>
                      );
                    })}
                  </div>

                  {!isTesting && (
                    <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed rgba(var(--glass-rgb), 0.12)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-green)' }}>
                          🎯 Đáp Án Đúng:
                        </label>
                        <select
                          value={item.answer || ''}
                          onChange={e => handleUpdateQuestionProp(item.id, 'answer', e.target.value)}
                          style={{ background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 8px', fontSize: '13px', fontWeight: 700 }}
                        >
                          <option value="">-- Chưa chọn --</option>
                          {Object.keys(item.options).sort().map(optKey => (
                            <option key={optKey} value={optKey}>Đáp án {optKey}</option>
                          ))}
                        </select>

                        <button
                          className="btn"
                          style={{ color: 'var(--accent-orange)', padding: '4px 10px', fontSize: '11px', gap: '4px' }}
                          onClick={() => handleCallAI(item.id, item)}
                          disabled={aiLoading === item.id}
                        >
                          {aiLoading === item.id ? 'Đang hỏi AI...' : <><Sparkles size={13}/> {item.answer ? 'Hỏi lại AI' : 'Hỏi AI Đáp Án & Giải Thích'}</>}
                        </button>
                      </div>

                      <div style={{ marginTop: '4px' }}>
                        <TiptapEditor
                          variant="mini"
                          title="Giải thích chi tiết (Explanation)"
                          content={item.explanation || ''}
                          onChange={html => handleUpdateQuestionProp(item.id, 'explanation', html)}
                        />
                      </div>
                    </div>
                  )}

                  {isTesting && item.userAnswer && (
                    <div style={{ marginTop: '10px', fontSize: '13px' }}>
                      {item.answer && (
                        <div style={{ color: 'var(--accent-green)', fontWeight: 'bold', marginBottom: '4px' }}>
                          ✓ Đáp án đúng: {item.answer}. {item.options[item.answer]}
                        </div>
                      )}
                      {item.explanation && (
                        <div style={{ color: 'var(--text-main)', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(16,185,129,0.2)', marginTop: '6px' }}>
                          <strong style={{ color: 'var(--accent-orange)', display: 'block', marginBottom: '4px' }}>📝 Giải thích:</strong>
                          {TiptapEditor ? (
                            <TiptapEditor content={item.explanation} readOnly={true} variant="mini" onChange={() => {}} />
                          ) : (
                            <div style={{ whiteSpace: 'pre-wrap' }}>{item.explanation}</div>
                          )}
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
