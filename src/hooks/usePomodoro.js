import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

const FOCUS_SECONDS = 25 * 60;
const BREAK_SECONDS = 5 * 60;

export const formatTime = (seconds) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${secs}`;
};

export function usePomodoro({ onSessionComplete } = {}) {
  const [mode, setMode] = useState('focus');
  const [timeLeft, setTimeLeft] = useState(FOCUS_SECONDS);
  const [isRunning, setIsRunning] = useState(false);
  const audioContextRef = useRef(null);

  const totalSeconds = mode === 'focus' ? FOCUS_SECONDS : BREAK_SECONDS;

  const progress = useMemo(() => {
    const ratio = (totalSeconds - timeLeft) / totalSeconds;
    return Math.min(Math.max(ratio, 0), 1);
  }, [timeLeft, totalSeconds]);

  const playChime = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioContextRef.current = new AudioCtx();
      } else {
        return;
      }
    }
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') {
        ctx.resume();
    }
    
    try {
      const now = ctx.currentTime;
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const gain = ctx.createGain();

      o1.type = 'sine';
      o1.frequency.setValueAtTime(880, now);
      o2.type = 'triangle';
      o2.frequency.setValueAtTime(660, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

      o1.connect(gain);
      o2.connect(gain);
      gain.connect(ctx.destination);

      o1.start(now);
      o2.start(now + 0.03);
      o1.stop(now + 0.5);
      o2.stop(now + 0.5);
    } catch(e) {
      // Ignored
    }
  }, []);

  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const onSessionCompleteRef = useRef(onSessionComplete);
  useEffect(() => {
    onSessionCompleteRef.current = onSessionComplete;
  }, [onSessionComplete]);

  useEffect(() => {
    if (!isRunning) return undefined;

    const intervalId = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(intervalId);
          setIsRunning(false);
          playChime();
          
          if (modeRef.current === 'focus' && onSessionCompleteRef.current) {
            onSessionCompleteRef.current();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isRunning, playChime]);

  const switchMode = useCallback((nextMode) => {
    setMode(nextMode);
    setIsRunning(false);
    setTimeLeft(nextMode === 'focus' ? FOCUS_SECONDS : BREAK_SECONDS);
  }, []);

  const resetCurrentMode = useCallback(() => {
    setIsRunning(false);
    setTimeLeft(mode === 'focus' ? FOCUS_SECONDS : BREAK_SECONDS);
  }, [mode]);

  const toggleTimer = useCallback(() => {
    setIsRunning((prev) => !prev);
  }, []);

  return {
    mode,
    timeLeft,
    isRunning,
    progress,
    switchMode,
    resetCurrentMode,
    toggleTimer
  };
}
