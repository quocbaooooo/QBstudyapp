import { useState, useEffect, useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';

export function useStudyStats() {
  const [stats, setStats] = useLocalStorage('study_stats', {
    streak: 0,
    lastActiveDate: null,
    dailyPomodoros: 0,
    dailyGoal: 4 // default 4 pomodoros
  });

  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setStats(prev => {
      const today = new Date().toDateString();
      if (prev.lastActiveDate === today) {
        return prev;
      }
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const isYesterday = prev.lastActiveDate === yesterday.toDateString();

      return {
        ...prev,
        dailyPomodoros: 0, // reset daily progress
        streak: isYesterday ? prev.streak + 1 : 1,
        lastActiveDate: today
      };
    });
  }, [setStats]);

  useEffect(() => {
    // Calculate progress percentage
    const currentProgress = Math.min(100, Math.round((stats.dailyPomodoros / stats.dailyGoal) * 100));
    setProgress(currentProgress);
  }, [stats.dailyPomodoros, stats.dailyGoal]);

  const addPomodoro = useCallback(() => {
    setStats(prev => ({
      ...prev,
      dailyPomodoros: prev.dailyPomodoros + 1
    }));
  }, [setStats]);

  return {
    streak: stats.streak,
    progress,
    addPomodoro
  };
}
