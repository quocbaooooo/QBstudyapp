import { useState } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Key, Volume2, VolumeX, Moon, Sun, Lightbulb } from 'lucide-react';

export default function SettingsView({ 
  bgMusicEnabled, 
  setBgMusicEnabled, 
  bgMusicVolume, 
  setBgMusicVolume, 
  bgMusicUrl, 
  setBgMusicUrl 
}) {
  const [apiKey, setApiKey] = useLocalStorage('gemini_api_key', '');
  const [apiModel, setApiModel] = useLocalStorage('gemini_api_model', 'gemini-1.5-flash-latest');
  
  const [aiProvider, setAiProvider] = useLocalStorage('ai_provider', 'gemini');
  const [openaiKey, setOpenaiKey] = useLocalStorage('openai_api_key', '');
  const [openaiModel, setOpenaiModel] = useLocalStorage('openai_api_model', 'gpt-4o-mini');

  const [appSoundEnabled, setAppSoundEnabled] = useLocalStorage('app_sound_enabled', true);

  const [testApiStatus, setTestApiStatus] = useState(null);
  const [testApiMessage, setTestApiMessage] = useState('');
  const [availableModels, setAvailableModels] = useState([]);

  const handleTestApi = async () => {
    const activeApiKey = aiProvider === 'gemini' ? apiKey : openaiKey;
    if (!activeApiKey) {
      alert(`Vui lòng nhập API Key cho ${aiProvider === 'gemini' ? 'Gemini' : 'OpenAI'} trước khi test.`);
      return;
    }
    setTestApiStatus('loading');
    setTestApiMessage('Đang đồng bộ Models...');
    try {
      if (aiProvider === 'gemini') {
        const modelRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const modelData = await modelRes.json();
        if (modelData.error) throw new Error(modelData.error.message);
        
        const validModels = modelData.models
          .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
          .map(m => m.name.replace('models/', ''));
        
        setAvailableModels(validModels);
        
        if (!validModels.includes(apiModel) && validModels.length > 0) {
          setApiModel(validModels[0]);
        }
      } else {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${openaiKey}` }
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        
        const validModels = data.data.map(m => m.id).filter(id => id.includes('gpt'));
        setAvailableModels(validModels);
        
        if (!validModels.includes(openaiModel) && validModels.length > 0) {
           setOpenaiModel(validModels.includes('gpt-4o-mini') ? 'gpt-4o-mini' : validModels[0]);
        }
      }
      
      setTestApiStatus('success');
      setTestApiMessage('Thành công! Chọn Model ở bên cạnh.');
    } catch (err) {
      setTestApiStatus('error');
      setTestApiMessage(`Lỗi: ${err.message}`);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 mb-8">
      <div className="glass-card rounded-2xl p-6 md:p-8 relative">
        <h2 className="text-xl font-bold mb-8 text-white flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>settings</span>
          Cài đặt hệ thống
        </h2>
        
        <div className="space-y-8 relative z-10">
          <section>
            <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-secondary mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">key</span>
              Cấu hình API AI
            </h3>
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 hover:border-white/20 transition-all duration-300">
              <div className="flex flex-col md:flex-row md:items-start justify-between mb-5 gap-3">
                <div>
                  <div className="font-semibold text-white text-[15px]">Tùy chọn cung cấp AI</div>
                  <div className="text-[13px] text-slate-400 mt-1 max-w-lg leading-relaxed">
                    Nhập API Key của nhà cung cấp bạn muốn sử dụng để sinh nội dung, tạo flashcards và ngân hàng câu hỏi.
                  </div>
                  <div className="text-[12px] text-primary mt-2 flex items-center gap-1">
                    <Lightbulb size={12}/>
                    {aiProvider === 'gemini' ? (
                      <span>Lấy <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline font-bold hover:text-white transition-colors">Gemini API Key miễn phí tại đây</a></span>
                    ) : (
                      <span>Lấy <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="underline font-bold hover:text-white transition-colors">OpenAI API Key tại đây</a> (cần có thanh toán thẻ)</span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ padding: '12px 16px', background: 'rgba(var(--glass-rgb),0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <Key size={16} color="var(--accent-orange)" />
                
                <select 
                  value={aiProvider} 
                  onChange={e => { setAiProvider(e.target.value); setTestApiStatus(null); setTestApiMessage(''); setAvailableModels([]); }}
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', fontWeight: 'bold' }}
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI (ChatGPT)</option>
                </select>

                {aiProvider === 'gemini' ? (
                  <>
                    <input 
                      type="password" 
                      placeholder="Nhập Google Gemini API Key..." 
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      style={{ flex: 1, background: 'transparent', border: '1px solid rgba(var(--glass-rgb),0.1)', borderRadius: '6px', padding: '8px 12px', minWidth: '200px', color: 'white', fontSize: '13px' }}
                    />
                    <select 
                      value={apiModel} 
                      onChange={e => setApiModel(e.target.value)}
                      style={{ background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', minWidth: '120px' }}
                    >
                      {availableModels.length > 0 ? (
                        availableModels.map(m => <option key={m} value={m}>{m}</option>)
                      ) : (
                        <>
                          <option value="gemini-2.0-flash">2.0 Flash</option>
                          <option value="gemini-2.5-flash">2.5 Flash</option>
                          <option value="gemini-1.5-flash-latest">1.5 Flash</option>
                          <option value="gemini-1.5-pro-latest">1.5 Pro</option>
                        </>
                      )}
                    </select>
                  </>
                ) : (
                  <>
                    <input 
                      type="password" 
                      placeholder="Nhập OpenAI API Key (sk-...)" 
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                      style={{ flex: 1, background: 'transparent', border: '1px solid rgba(var(--glass-rgb),0.1)', borderRadius: '6px', padding: '8px 12px', minWidth: '200px', color: 'white', fontSize: '13px' }}
                    />
                    <select 
                      value={openaiModel} 
                      onChange={e => setOpenaiModel(e.target.value)}
                      style={{ background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', minWidth: '120px' }}
                    >
                      {availableModels.length > 0 ? (
                        availableModels.map(m => <option key={m} value={m}>{m}</option>)
                      ) : (
                        <>
                          <option value="gpt-4o-mini">GPT-4o Mini ⭐</option>
                          <option value="gpt-4o">GPT-4o</option>
                          <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                        </>
                      )}
                    </select>
                  </>
                )}

                <button 
                  className="btn" 
                  onClick={handleTestApi}
                  disabled={testApiStatus === 'loading'}
                  style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '6px' }}
                >
                  {testApiStatus === 'loading' ? 'Đang tải...' : 'Tải danh sách Model'}
                </button>
              </div>
              
              {testApiStatus && (
                <div style={{ marginTop: '12px', padding: '8px', fontSize: '13px', color: testApiStatus === 'success' ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 'bold' }}>
                  {testApiMessage}
                </div>
              )}
            </div>
          </section>

          {/* Appearance & Sound Settings */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-secondary mb-4 flex items-center gap-2">
              <Sun className="w-4 h-4" />
              Âm thanh & Thư giãn
            </h3>
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 hover:border-white/20 transition-all duration-300 space-y-6">
              {/* Feedback Sound Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {appSoundEnabled ? <Volume2 size={20} color="var(--accent-green)" /> : <VolumeX size={20} color="var(--text-muted)" />}
                  <div>
                    <div className="font-semibold text-white text-[14px]">Âm thanh phản hồi</div>
                    <div className="text-[12px] text-slate-400">Âm thanh khi trả lời đúng/sai</div>
                  </div>
                </div>
                <button 
                  onClick={() => setAppSoundEnabled(!appSoundEnabled)}
                  style={{
                    padding: '6px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 'bold', border: 'none', cursor: 'pointer',
                    background: appSoundEnabled ? 'var(--accent-green)' : 'rgba(255,255,255,0.05)',
                    color: appSoundEnabled ? 'white' : 'var(--text-main)'
                  }}
                >
                  {appSoundEnabled ? 'Đang bật' : 'Đã tắt'}
                </button>
              </div>

              {/* Background Music Toggle */}
              <div className="pt-4 border-t border-white/5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${bgMusicEnabled ? 'bg-primary/20 text-primary' : 'bg-white/5 text-slate-500'}`}>
                      <Moon size={20} />
                    </div>
                    <div>
                      <div className="font-semibold text-white text-[14px]">Nhạc nền Lofi</div>
                      <div className="text-[12px] text-slate-400">Phát nhạc nhẹ giúp tập trung học tập</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => setBgMusicEnabled(!bgMusicEnabled)}
                    style={{
                      padding: '6px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 'bold', border: 'none', cursor: 'pointer',
                      background: bgMusicEnabled ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                      color: 'white'
                    }}
                  >
                    {bgMusicEnabled ? 'Đang phát' : 'Tạm dừng'}
                  </button>
                </div>

                {bgMusicEnabled && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center gap-4">
                      <span className="text-[12px] text-slate-400 w-20">Âm lượng</span>
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={bgMusicVolume} 
                        onChange={(e) => setBgMusicVolume(parseInt(e.target.value))}
                        className="flex-1 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      <span className="text-[12px] font-mono text-primary w-8 text-right">{bgMusicVolume}%</span>
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className="text-[11px] font-bold text-slate-500 uppercase">Cấu hình bản nhạc</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button 
                          onClick={() => setBgMusicUrl('https://www.youtube.com/watch?v=HaIjR05n1Vc&t=3008s')}
                          className={`px-3 py-2 rounded-lg text-xs font-medium text-left transition-all ${bgMusicUrl.includes('HaIjR05n1Vc') ? 'bg-primary/20 border border-primary/30 text-white' : 'bg-white/5 border border-transparent text-slate-400 hover:bg-white/10'}`}
                        >
                          🎵 Lofi Study (Đoạn 5p yêu cầu)
                        </button>
                        <button 
                          onClick={() => setBgMusicUrl('https://www.youtube.com/watch?v=jfKfPfyJRdk')}
                          className={`px-3 py-2 rounded-lg text-xs font-medium text-left transition-all ${bgMusicUrl.includes('jfKfPfyJRdk') ? 'bg-primary/20 border border-primary/30 text-white' : 'bg-white/5 border border-transparent text-slate-400 hover:bg-white/10'}`}
                        >
                          🎹 Lofi Girl (Classic)
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 pt-2">
                      <span className="text-[11px] font-bold text-slate-500 uppercase">Dán link YouTube tùy chỉnh</span>
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          value={bgMusicUrl}
                          onChange={(e) => setBgMusicUrl(e.target.value)}
                          placeholder="Dán link YouTube (VD: https://www.youtube.com/watch?v=...)"
                          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-primary/50 transition-all"
                        />
                        <button 
                          onClick={() => setBgMusicEnabled(true)}
                          className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-lg shadow-primary/20 flex items-center gap-2 shrink-0"
                        >
                          <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                          Phát ngay
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500 italic">
                        *Lưu ý: Một số link có thể bị YouTube chặn phát trên trang web khác.
                      </p>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </section>

          {/* Account Section Placeholder */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-secondary mb-4 flex items-center gap-2">
               <span className="material-symbols-outlined text-[16px]">account_circle</span>
               Tài khoản đồng bộ
            </h3>
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 hover:border-white/20 transition-all duration-300 flex items-center justify-between">
              <div>
                <div className="font-semibold text-white text-[15px]">Sao lưu đám mây</div>
                <div className="text-[13px] text-slate-400 mt-1">Dữ liệu của bạn được đồng bộ hóa và bảo mật bằng Google Firebase.</div>
              </div>
              <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[11px] font-bold uppercase tracking-wider">Đã kết nối</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
