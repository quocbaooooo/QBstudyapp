import React, { useState, useEffect, useRef } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useFirestore } from '../hooks/useFirestore';
import { v4 as uuidv4 } from 'uuid';
import { X, Volume2, Save, CheckCircle } from 'lucide-react';

export default function GlobalTranslationPopup() {
  const [translationPopup, setTranslationPopup] = useState(null);
  const [translatedText, setTranslatedText] = useState('');
  const [enrichedData, setEnrichedData] = useState(null);
  const [isAiEnrichingPopup, setIsAiEnrichingPopup] = useState(false);
  const [isSavingToDeck, setIsSavingToDeck] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [apiKey] = useLocalStorage('gemini_api_key', '');
  const [apiModel] = useLocalStorage('gemini_api_model', 'gemini-1.5-flash-latest');
  const [aiProvider] = useLocalStorage('ai_provider', 'gemini');
  const [openaiKey] = useLocalStorage('openai_api_key', '');
  const [openaiModel] = useLocalStorage('openai_api_model', 'gpt-4o-mini');

  const [decks, setDecks] = useFirestore('decks', 'study_decks', []);
  const [targetDeckId, setTargetDeckId] = useLocalStorage('target_deck_id', null);

  const translationTimeoutRef = useRef(null);

  useEffect(() => {
    const handleSelectionChange = () => {
      if (translationTimeoutRef.current) clearTimeout(translationTimeoutRef.current);
      
      translationTimeoutRef.current = setTimeout(() => {
        const selection = window.getSelection();
        const selectedText = selection?.toString()?.trim() || '';
        
        // Only show if there's text and it's not too long
        if (selectedText && selectedText.length > 0 && selectedText.length < 200 && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          
          // If the selection has no layout (e.g. hidden), ignore
          if (rect.width === 0 && rect.height === 0) return;
          
          setTranslationPopup({
            x: rect.left + rect.width / 2,
            y: rect.top - 10,
            text: selectedText
          });
          setTranslatedText('');
          setEnrichedData(null);
        } else {
          // If selection is cleared, we could close the popup, 
          // but user might just click inside the popup.
          // handleMouseDown already handles closing when clicking outside.
        }
      }, 300);
    };

    const handleMouseDown = (e) => {
      const path = e.composedPath();
      const isInsidePopup = path.some(el => el.classList && el.classList.contains('translation-popup'));
      
      if (translationPopup && !isInsidePopup) {
        setTranslationPopup(null);
        setTranslatedText('');
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('mousedown', handleMouseDown, { capture: true });
    
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('mousedown', handleMouseDown, { capture: true });
    };
  }, [translationPopup]);

  const handleAiEnrichForPopup = async () => {
    if (!translationPopup?.text || isAiEnrichingPopup) return;
    
    const activeApiKey = aiProvider === 'gemini' ? apiKey : openaiKey;
    if (!activeApiKey) {
      alert(`Vui lòng nhập API Key cho ${aiProvider === 'gemini' ? 'Gemini' : 'OpenAI'} trong phần Cài đặt.`);
      return;
    }

    setIsAiEnrichingPopup(true);
    try {
      const prompt = `Bạn là từ điển Anh-Việt chuyên nghiệp. Hãy phân tích từ/cụm từ tiếng Anh sau: "${translationPopup.text}"
      Trả về JSON duy nhất (không markdown, không giải thích):
      {
        "definition": "nghĩa tiếng Việt (ngắn gọn, chính xác)",
        "pronunciation": "phiên âm IPA",
        "wordType": "n./v./adj./adv./phr.",
        "example": "1 câu ví dụ tiếng Anh tự nhiên",
        "synonyms": "2-3 từ đồng nghĩa, cách nhau bởi dấu phẩy"
      }`;

      let rawText = "";
      if (aiProvider === 'gemini') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            generationConfig: { maxOutputTokens: 512, temperature: 0.1 },
            contents: [{ parts: [{ text: prompt }] }]
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        rawText = data.candidates[0].content.parts[0].text;
      } else {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`
          },
          body: JSON.stringify({
            model: openaiModel,
            max_tokens: 512,
            temperature: 0.1,
            messages: [{ role: 'user', content: prompt }]
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        rawText = data.choices[0].message.content;
      }

      const cleaned = rawText.replace(/```json\n?/gi, '').replace(/```/g, '').trim();
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (err) {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            const sanitized = match[0].replace(/[\n\r\t]/g, ' ');
            parsed = JSON.parse(sanitized);
          } catch(e2) {
            throw err;
          }
        } else {
          throw err;
        }
      }

      if (parsed.definition) setTranslatedText(parsed.definition);
      setEnrichedData({
        pronunciation: parsed.pronunciation || '',
        wordType: parsed.wordType || '',
        example: parsed.example || '',
        synonyms: parsed.synonyms ? parsed.synonyms.split(',').map(s => s.trim()) : []
      });
      
    } catch (err) {
      console.error(err);
      alert('Không thể dùng AI phân tích từ này: ' + err.message);
    } finally {
      setIsAiEnrichingPopup(false);
    }
  };

  const handleSpeak = (text) => {
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  const handleSaveToLibrary = async () => {
    if (!translationPopup || !translatedText) {
      console.warn('Cannot save: missing text or translation');
      return;
    }
    
    setIsSavingToDeck(true);
    setSaveSuccess(false);

    try {
      const cardToAdd = {
        id: uuidv4(),
        front: translationPopup.text.trim(),
        back: translatedText.trim(),
        type: enrichedData?.wordType || '', 
        wordType: enrichedData?.wordType || '', 
        pronunciation: enrichedData?.pronunciation || '',
        example: enrichedData?.example || '',
        synonyms: enrichedData?.synonyms ? enrichedData.synonyms.join('; ') : '',
        createdAt: new Date().toISOString(),
        isAIGenerated: !!enrichedData
      };

      let finalTargetId = targetDeckId;

      setDecks(prevDecks => {
        let updatedDecks = [...prevDecks];
        let targetId = finalTargetId;

        if (!targetId) {
          const existingDeck = updatedDecks.find(d => 
            d.title.toLowerCase().includes('từ vựng đã dịch') || 
            d.title.toLowerCase().includes('vocabulary')
          );

          if (existingDeck) {
            targetId = existingDeck.id;
          } else {
            targetId = uuidv4();
            const newDeck = {
              id: targetId,
              title: 'Từ vựng đã dịch 📚',
              description: 'Tự động lưu từ công cụ dịch AI',
              cards: [],
              createdAt: new Date().toISOString(),
              updatedAt: Date.now()
            };
            updatedDecks.push(newDeck);
          }
          setTargetDeckId(targetId);
        }

        const deckIndex = updatedDecks.findIndex(d => d.id === targetId);
        if (deckIndex !== -1) {
          updatedDecks[deckIndex].cards = [cardToAdd, ...(updatedDecks[deckIndex].cards || [])];
          updatedDecks[deckIndex].updatedAt = Date.now();
        }

        return updatedDecks;
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      
    } catch (err) {
      console.error("Save error:", err);
      alert('Không thể lưu từ vựng: ' + err.message);
    } finally {
      setIsSavingToDeck(false);
    }
  };

  if (!translationPopup) return null;

  return (
    <div 
      className="translation-popup"
      onMouseDown={(e) => {
        // Stop all native behavior when clicking inside the popup
        e.stopPropagation();
      }}
      style={{
        position: 'fixed',
        left: Math.min(Math.max(translationPopup.x, 150), window.innerWidth - 150),
        top: Math.max(translationPopup.y - 10, 20),
        transform: 'translate(-50%, -100%)',
        zIndex: 99999,
        background: 'rgba(20,25,40,0.95)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(124,77,255,0.3)',
        borderRadius: '16px',
        padding: '16px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
        minWidth: '280px',
        maxWidth: '340px',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, paddingRight: '10px' }}>
          <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#22d3ee', wordBreak: 'break-word' }}>
            {translationPopup.text}
          </h4>
          <button 
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleSpeak(translationPopup.text)}
            style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', padding: '4px', display: 'flex', borderRadius: '50%' }}
            title="Nghe phát âm"
          >
            <Volume2 size={16} />
          </button>
        </div>
        <button 
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setTranslationPopup(null);
            setTranslatedText('');
          }}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
        >
          <X size={16} />
        </button>
      </div>

      {!translatedText && (
        <button 
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleAiEnrichForPopup}
          disabled={isAiEnrichingPopup}
          style={{
            padding: '8px 12px', borderRadius: '8px', border: 'none',
            background: 'linear-gradient(135deg, rgba(124,77,255,0.2), rgba(34,211,238,0.2))',
            color: '#a78bfa', fontSize: '13px', fontWeight: 600, 
            cursor: isAiEnrichingPopup ? 'not-allowed' : 'pointer',
            opacity: isAiEnrichingPopup ? 0.7 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            pointerEvents: 'auto'
          }}
        >
          {isAiEnrichingPopup ? (
            <>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', border: '2px solid rgba(255,255,255,0.1)', borderTop: '2px solid #22d3ee', borderRadius: '50%', width: '14px', height: '14px', marginRight: '4px', verticalAlign: 'middle' }}></span>
              Đang phân tích...
            </>
          ) : (
            'Dịch & Phân tích bằng AI'
          )}
        </button>
      )}

      {translatedText && (
        <>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '10px' }}>
            <p style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: '#e2e8f0' }}>{translatedText}</p>
            {enrichedData && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: 'var(--text-muted)' }}>
                {enrichedData.pronunciation && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <span style={{ color: '#a78bfa', fontWeight: 600 }}>IPA:</span> {enrichedData.pronunciation}
                  </div>
                )}
                {enrichedData.wordType && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <span style={{ color: '#a78bfa', fontWeight: 600 }}>Từ loại:</span> {enrichedData.wordType}
                  </div>
                )}
                {enrichedData.example && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ color: '#a78bfa', fontWeight: 600 }}>Ví dụ:</span> 
                    <span style={{ fontStyle: 'italic', borderLeft: '2px solid rgba(167,139,250,0.3)', paddingLeft: '8px' }}>{enrichedData.example}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button 
              type="button"
              onClick={handleSaveToLibrary}
              disabled={isSavingToDeck}
              style={{
                flex: 1, padding: '8px', borderRadius: '8px', border: 'none',
                background: saveSuccess ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.1)',
                color: saveSuccess ? '#4ade80' : 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                transition: 'all 0.2s'
              }}
            >
              {isSavingToDeck ? 'Đang lưu...' : saveSuccess ? <><CheckCircle size={14}/> Đã lưu!</> : <><Save size={14}/> Lưu thẻ</>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
