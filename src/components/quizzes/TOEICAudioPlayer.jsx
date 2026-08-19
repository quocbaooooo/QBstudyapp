import { useState, useRef, useEffect } from 'react';
import { Play, Volume2, Music } from 'lucide-react';
import { getAudioFromIDB } from '../../utils/audioStorage';

export default function TOEICAudioPlayer({ src, title, passageId }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [audioSource, setAudioSource] = useState(src);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function resolveAudio() {
      if (src && src.length > 200 && !src.startsWith('[STORED_')) {
        setAudioSource(src);
        return;
      }

      if (passageId) {
        setIsLoadingAudio(true);
        const idbAudio = await getAudioFromIDB(passageId);
        if (isMounted) {
          if (idbAudio) {
            setAudioSource(idbAudio);
          } else {
            setAudioSource(src);
          }
          setIsLoadingAudio(false);
        }
      }
    }

    resolveAudio();

    return () => {
      isMounted = false;
    };
  }, [src, passageId]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const handleSpeedChange = (speed) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  const formatTime = (secs) => {
    if (isNaN(secs) || !secs) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!audioSource && !isLoadingAudio) return null;

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(124,77,255,0.18), rgba(0,227,253,0.12))',
      border: '1px solid rgba(124,77,255,0.35)',
      borderRadius: '12px',
      padding: '12px 16px',
      marginBottom: '14px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
    }}>
      {audioSource && (
        <audio
          ref={audioRef}
          src={audioSource}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
        />
      )}
      {title && (
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#d8ccff', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Music size={14} color="#8eefff" /> {title} {isLoadingAudio && <span style={{ fontSize: '11px', color: '#8eefff' }}>(Đang tải audio từ bộ nhớ máy...)</span>}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={togglePlay}
          disabled={isLoadingAudio || !audioSource}
          style={{
            width: '40px', height: '40px', borderRadius: '50%', border: 'none',
            background: 'linear-gradient(135deg, #7c4dff, #00e3fd)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isLoadingAudio ? 'wait' : 'pointer',
            boxShadow: '0 4px 12px rgba(124,77,255,0.4)', flexShrink: 0,
            opacity: isLoadingAudio ? 0.6 : 1
          }}
        >
          {isPlaying ? <Volume2 size={20} /> : <Play size={20} style={{ marginLeft: '2px' }} />}
        </button>

        <div style={{ flex: 1, minWidth: '160px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#8eefff', fontWeight: 600 }}>{formatTime(currentTime)}</span>
          <input
            type="range"
            min="0"
            max={duration || 100}
            step="0.1"
            value={currentTime}
            onChange={handleSeek}
            disabled={isLoadingAudio || !audioSource}
            style={{ flex: 1, cursor: 'pointer', accentColor: '#7c4dff' }}
          />
          <span style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{formatTime(duration)}</span>
        </div>

        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '2px' }}>Tốc độ:</span>
          {[0.8, 1.0, 1.25, 1.5, 2.0].map(s => (
            <button
              key={s}
              type="button"
              onClick={() => handleSpeedChange(s)}
              style={{
                padding: '3px 7px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                border: '1px solid rgba(var(--glass-rgb),0.15)', cursor: 'pointer',
                background: playbackSpeed === s ? 'rgba(124,77,255,0.45)' : 'rgba(var(--glass-rgb),0.06)',
                color: playbackSpeed === s ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.15s ease'
              }}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
