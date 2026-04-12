import { useState } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Key } from 'lucide-react';

export default function SettingsView() {
  const [apiKey, setApiKey] = useLocalStorage('gemini_api_key', '');
  const [apiModel, setApiModel] = useLocalStorage('gemini_api_model', 'gemini-1.5-flash-latest');
  
  const [aiProvider, setAiProvider] = useLocalStorage('ai_provider', 'gemini');
  const [openaiKey, setOpenaiKey] = useLocalStorage('openai_api_key', '');
  const [openaiModel, setOpenaiModel] = useLocalStorage('openai_api_model', 'gpt-4o-mini');

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
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
      <div className="glass-card rounded-2xl p-6 md:p-8 relative overflow-hidden h-full">
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
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-5 gap-3">
                <div>
                  <div className="font-semibold text-white text-[15px]">Tùy chọn cung cấp AI</div>
                  <div className="text-[13px] text-slate-400 mt-1 max-w-lg leading-relaxed">
                    Nhập API Key của nhà cung cấp bạn muốn sử dụng để sinh nội dung, tạo flashcards và ngân hàng câu hỏi.
                  </div>
                </div>
              </div>

              <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
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
                      style={{ flex: 1, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px 12px', minWidth: '200px', color: 'white', fontSize: '13px' }}
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
                      style={{ flex: 1, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px 12px', minWidth: '200px', color: 'white', fontSize: '13px' }}
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
