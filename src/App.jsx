import { useState, useEffect } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/useAuth';
import HomeView from './components/HomeView';
import NotesView from './components/NotesView';
import DecksView from './components/DecksView';
import QuizzesView from './components/QuizzesView';
import SettingsView from './components/SettingsView';
function LoginScreen() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithGoogle();
    } catch {
      setError('Đăng nhập Google thất bại. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return setError('Vui lòng nhập email và mật khẩu.');
    setLoading(true);
    setError('');
    try {
      if (isSignUp) {
        await signUpWithEmail(email, password, displayName);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err) {
      const code = err.code;
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('Email hoặc mật khẩu không đúng.');
      } else if (code === 'auth/email-already-in-use') {
        setError('Email đã được sử dụng. Hãy đăng nhập.');
      } else if (code === 'auth/weak-password') {
        setError('Mật khẩu phải có ít nhất 6 ký tự.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen h-[100dvh] w-full overflow-hidden relative items-center justify-center">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div style={{
          position: 'absolute', width: 'min(400px, 50vw)', height: 'min(400px, 50vw)',
          background: 'radial-gradient(circle, rgba(124,77,255,0.3) 0%, transparent 70%)',
          top: '10%', left: '15%', borderRadius: '50%', filter: 'blur(80px)'
        }} />
        <div style={{
          position: 'absolute', width: 'min(350px, 45vw)', height: 'min(350px, 45vw)',
          background: 'radial-gradient(circle, rgba(0,227,253,0.2) 0%, transparent 70%)',
          bottom: '15%', right: '10%', borderRadius: '50%', filter: 'blur(80px)'
        }} />
      </div>

      <div style={{
        background: 'rgba(var(--glass-rgb),0.05)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(var(--glass-rgb),0.1)',
        borderRadius: '24px',
        padding: '48px 40px',
        maxWidth: '420px',
        width: '90%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        zIndex: 10
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{
            fontSize: '32px', fontWeight: 800, letterSpacing: '-0.03em',
            background: 'linear-gradient(135deg, #a78bfa, #22d3ee)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            marginBottom: '8px'
          }}>QBStudy</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            Học thông minh, hiệu quả
          </p>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '12px', padding: '12px', marginBottom: '20px',
            color: '#fca5a5', fontSize: '13px', textAlign: 'center'
          }}>{error}</div>
        )}

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          style={{
            width: '100%', padding: '14px', borderRadius: '14px',
            background: 'rgba(var(--glass-rgb),0.08)', border: '1px solid rgba(var(--glass-rgb),0.15)',
            color: 'white', fontSize: '15px', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
            transition: 'all 0.2s',
            opacity: loading ? 0.6 : 1
          }}
          onMouseOver={e => { if (!loading) e.target.style.background = 'rgba(var(--glass-rgb),0.12)'; }}
          onMouseOut={e => e.target.style.background = 'rgba(var(--glass-rgb),0.08)'}
        >
          <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập với Google'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: '24px 0' }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(var(--glass-rgb),0.1)' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>hoặc</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(var(--glass-rgb),0.1)' }} />
        </div>

        <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {isSignUp && (
            <input
              type="text" placeholder="Tên hiển thị" value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: '12px',
                background: 'rgba(var(--glass-rgb),0.06)', border: '1px solid rgba(var(--glass-rgb),0.1)',
                color: 'white', fontSize: '14px', outline: 'none', boxSizing: 'border-box'
              }}
            />
          )}
          <input
            type="email" placeholder="Email" value={email}
            onChange={e => setEmail(e.target.value)}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: '12px',
              background: 'rgba(var(--glass-rgb),0.06)', border: '1px solid rgba(var(--glass-rgb),0.1)',
              color: 'white', fontSize: '14px', outline: 'none', boxSizing: 'border-box'
            }}
          />
          <input
            type="password" placeholder="Mật khẩu" value={password}
            onChange={e => setPassword(e.target.value)}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: '12px',
              background: 'rgba(var(--glass-rgb),0.06)', border: '1px solid rgba(var(--glass-rgb),0.1)',
              color: 'white', fontSize: '14px', outline: 'none', boxSizing: 'border-box'
            }}
          />
          <button
            type="submit" disabled={loading}
            style={{
              width: '100%', padding: '14px', borderRadius: '14px',
              background: 'linear-gradient(135deg, #7c4dff, #00e3fd)',
              border: 'none', color: 'white', fontSize: '15px', fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.2s', opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? 'Đang xử lý...' : (isSignUp ? 'Đăng ký' : 'Đăng nhập')}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: 'var(--text-muted)' }}>
          {isSignUp ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}{' '}
          <button
            onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
            style={{
              background: 'none', border: 'none', color: '#22d3ee',
              cursor: 'pointer', fontWeight: 600, fontSize: '13px', textDecoration: 'underline'
            }}
          >
            {isSignUp ? 'Đăng nhập' : 'Đăng ký ngay'}
          </button>
        </p>
      </div>
    </div>
  );
}

function AppContent() {
  const { user, loading, signOut } = useAuth();
  const [appSoundEnabled, setAppSoundEnabled] = useLocalStorage('app_sound_enabled', true);
  
  // Background Music State
  const [bgMusicEnabled, setBgMusicEnabled] = useLocalStorage('bg_music_enabled', false);
  const [bgMusicVolume, setBgMusicVolume] = useLocalStorage('bg_music_volume', 30);
  const [bgMusicUrl, setBgMusicUrl] = useLocalStorage('bg_music_url', 'https://youtu.be/Ys7-6_t7OEQ');

  const [activeTab, setActiveTab] = useState('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [player, setPlayer] = useState(null);

  // Load YouTube IFrame API
  useEffect(() => {
    if (window.YT) return;
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  }, []);

  // Extract Video ID and Start Time from URL (Improved)
  const getYoutubeConfig = (url) => {
    try {
      if (!url) return { videoId: 'HaIjR05n1Vc', startTime: 3008 };
      
      // Regex to extract video ID from various YouTube URL formats
      const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
      const match = url.match(regExp);
      const videoId = (match && match[7].length === 11) ? match[7] : 'HaIjR05n1Vc';
      
      // Extract time from t=... or start=...
      const timeMatch = url.match(/[?&](t|start)=(\d+)s?/);
      const startTime = timeMatch ? parseInt(timeMatch[2]) : 0;
      
      return { videoId, startTime };
    } catch (e) {
      console.error("Error parsing YouTube URL:", e);
      return { videoId: 'HaIjR05n1Vc', startTime: 3008 };
    }
  };

  // Initialize/Update YouTube Player
  useEffect(() => {
    if (!window.YT || !bgMusicEnabled) {
      if (player && typeof player.pauseVideo === 'function') player.pauseVideo();
      return;
    }

    const { videoId, startTime } = getYoutubeConfig(bgMusicUrl);
    const endTime = startTime + 300; // 5 minutes

    if (!player) {
      window.onYouTubeIframeAPIReady = () => {
        const newPlayer = new window.YT.Player('bg-music-player', {
          height: '0',
          width: '0',
          videoId: videoId,
          playerVars: {
            autoplay: 1,
            controls: 0,
            start: startTime,
            end: endTime,
            loop: 1,
            playlist: videoId
          },
          events: {
            onReady: (event) => {
              setPlayer(event.target);
              event.target.setVolume(0);
              event.target.playVideo();
            },
            onStateChange: (event) => {
              if (event.data === window.YT.PlayerState.ENDED) {
                event.target.seekTo(startTime);
                event.target.playVideo();
              }
            }
          }
        });
      };
      // If API already loaded but ready callback not called
      if (window.YT && window.YT.Player) {
        window.onYouTubeIframeAPIReady();
      }
    } else {
      // Check if video needs to be changed
      const { videoId: currentVideoId, startTime: currentStartTime } = getYoutubeConfig(bgMusicUrl);
      try {
        const playerUrl = player.getVideoUrl();
        if (playerUrl && !playerUrl.includes(currentVideoId)) {
          player.loadVideoById({
            videoId: currentVideoId,
            startSeconds: currentStartTime,
            endSeconds: currentStartTime + 300
          });
        }
      } catch (e) {}

      if (bgMusicEnabled) {
        player.playVideo();
      } else {
        player.pauseVideo();
      }
    }
  }, [bgMusicEnabled, bgMusicUrl, player]);

  // Dynamic Volume and Fade-in
  useEffect(() => {
    if (!player || typeof player.setVolume !== 'function') return;
    
    if (bgMusicEnabled) {
      let currentVol = player.getVolume();
      const targetVol = bgMusicVolume;
      
      if (currentVol < targetVol) {
        const fadeInterval = setInterval(() => {
          currentVol += 2;
          if (currentVol >= targetVol) {
            player.setVolume(targetVol);
            clearInterval(fadeInterval);
          } else {
            player.setVolume(currentVol);
          }
        }, 100);
        return () => clearInterval(fadeInterval);
      } else {
        player.setVolume(bgMusicVolume);
      }
    } else {
      player.setVolume(0);
      player.pauseVideo();
    }
  }, [player, bgMusicEnabled, bgMusicVolume]);

  useEffect(() => {
    // Only fetch default background
    document.documentElement.removeAttribute('data-theme');
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px'
        }}>
          <div style={{
            width: '40px', height: '40px', border: '3px solid rgba(var(--glass-rgb),0.1)',
            borderTop: '3px solid #22d3ee', borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Đang tải...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  return (
    <div className="flex h-screen h-[100dvh] w-full overflow-hidden relative">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <nav className={`
        fixed lg:relative top-0 left-0 h-full z-50
        w-52 p-3 border-r border-white/10 backdrop-blur-xl bg-[#060e20]/95 lg:bg-white/5
        shadow-[0_0_40px_rgba(124,77,255,0.1)]
        transition-transform duration-300 ease-out
        flex flex-col shrink-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="mb-6 px-3 mt-3 flex items-center justify-between">
          <span className="text-xl font-extrabold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-cyan-400">QBStudy</span>
          <button
            className="lg:hidden text-slate-400 hover:text-white p-1"
            onClick={() => setSidebarOpen(false)}
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="space-y-1">
          <button
            onClick={() => handleTabChange('home')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-300 ease-out active:scale-95 ${activeTab === 'home' ? 'bg-white/10 text-cyan-400 border-l-3 border-cyan-400 shadow-[0_0_15px_rgba(0,227,253,0.3)]' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: activeTab === 'home' ? "'FILL' 1" : undefined }}>home</span>
            <span className="font-['Inter'] font-medium tracking-tight text-left flex-1">Trang chủ</span>
          </button>

          <button
            onClick={() => handleTabChange('notes')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-300 ease-out active:scale-95 ${activeTab === 'notes' ? 'bg-white/10 text-cyan-400 border-l-3 border-cyan-400 shadow-[0_0_15px_rgba(0,227,253,0.3)]' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: activeTab === 'notes' ? "'FILL' 1" : undefined }}>book</span>
            <span className="font-['Inter'] font-medium tracking-tight text-left flex-1">Sổ tay</span>
          </button>

          <button
            onClick={() => handleTabChange('flashcards')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-300 ease-out active:scale-95 ${activeTab === 'flashcards' ? 'bg-white/10 text-cyan-400 border-l-3 border-cyan-400 shadow-[0_0_15px_rgba(0,227,253,0.3)]' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: activeTab === 'flashcards' ? "'FILL' 1" : undefined }}>style</span>
            <span className="font-['Inter'] font-medium tracking-tight text-left flex-1">Thẻ học</span>
          </button>

          <button
            onClick={() => handleTabChange('quizzes')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-300 ease-out active:scale-95 ${activeTab === 'quizzes' ? 'bg-white/10 text-cyan-400 border-l-3 border-cyan-400 shadow-[0_0_15px_rgba(0,227,253,0.3)]' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: activeTab === 'quizzes' ? "'FILL' 1" : undefined }}>quiz</span>
            <span className="font-['Inter'] font-medium tracking-tight text-left flex-1">Trắc nghiệm</span>
          </button>
          
          <button
            onClick={() => handleTabChange('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-300 ease-out active:scale-95 ${activeTab === 'settings' ? 'bg-white/10 text-cyan-400 border-l-3 border-cyan-400 shadow-[0_0_15px_rgba(0,227,253,0.3)]' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: activeTab === 'settings' ? "'FILL' 1" : undefined }}>settings</span>
            <span className="font-['Inter'] font-medium tracking-tight text-left flex-1">Cài đặt</span>
          </button>
        </div>

        {/* Sign out button at bottom */}
        <div className="mt-auto pt-4 border-t border-white/5">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full border border-white/20" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-white text-sm font-bold">
                {(user.displayName || user.email || '?')[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white font-medium truncate">{user.displayName || 'User'}</div>
              <div className="text-[11px] text-slate-400 truncate">{user.email}</div>
            </div>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-white/10 hover:text-red-400 transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            <span className="font-['Inter'] font-medium">Đăng xuất</span>
          </button>
        </div>
      </nav>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <header className="flex justify-between items-center px-4 sm:px-5 w-full h-14 backdrop-blur-md bg-white/5 border-b border-white/5 z-30 sticky top-0 shrink-0">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden text-slate-400 hover:text-white p-1"
              onClick={() => setSidebarOpen(true)}
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-1.5 glass-card px-3 py-1 rounded-full">
              <span className="material-symbols-outlined text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
              <span className="text-sm font-bold text-white">12</span>
            </div>
            <div className="relative w-8 h-8 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 40 40">
                <circle className="text-white/10" cx="20" cy="20" fill="transparent" r="16" stroke="currentColor" strokeWidth="3"></circle>
                <circle className="text-secondary drop-shadow-[0_0_8px_rgba(0,227,253,0.5)]" cx="20" cy="20" fill="transparent" r="16" stroke="currentColor" strokeDasharray="100" strokeDashoffset="30" strokeWidth="3"></circle>
              </svg>
              <span className="absolute text-[10px] font-bold">70%</span>
            </div>
            <div className="h-8 w-8 rounded-full border-2 border-primary-fixed p-0.5 overflow-hidden">
              {user.photoURL ? (
                <img alt="Avatar" className="h-full w-full object-cover rounded-full" src={user.photoURL} referrerPolicy="no-referrer" />
              ) : (
                <div className="h-full w-full rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-white text-xs font-bold">
                  {(user.displayName || user.email || '?')[0].toUpperCase()}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 min-h-0 p-3 sm:p-5 flex gap-3 sm:gap-5 overflow-y-auto">
          {activeTab === 'home' && <HomeView />}
          {activeTab === 'notes' && <NotesView />}
          {activeTab === 'flashcards' && <DecksView />}
          {activeTab === 'quizzes' && <QuizzesView />}
          {activeTab === 'settings' && (
            <SettingsView 
              bgMusicEnabled={bgMusicEnabled} 
              setBgMusicEnabled={setBgMusicEnabled}
              bgMusicVolume={bgMusicVolume}
              setBgMusicVolume={setBgMusicVolume}
              bgMusicUrl={bgMusicUrl}
              setBgMusicUrl={setBgMusicUrl}
            />
          )}
        </main>
        <div id="bg-music-player" style={{ position: 'absolute', top: '-1000px', left: '-1000px', opacity: 0, pointerEvents: 'none' }}></div>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
