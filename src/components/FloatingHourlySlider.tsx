import React, { useState, useEffect, useRef } from 'react';
import { Clock, Zap, RotateCcw } from 'lucide-react';
import { getHour12Label } from '../utils/huntingEngine';
import { ThemeMode, HourlyForecast } from '../types';

interface FloatingHourlySliderProps {
  selectedHour: number;
  onSelectHour: (hour: number) => void;
  onResetToToday?: () => void;
  hourly?: HourlyForecast[];
  theme?: ThemeMode;
  hasCustomBackground?: boolean;
}

export const FloatingHourlySlider: React.FC<FloatingHourlySliderProps> = ({
  selectedHour,
  onSelectHour,
  onResetToToday,
  hourly,
  theme = 'dark',
  hasCustomBackground = false,
}) => {
  const isDark = theme === 'dark';

  // Instant local state for lag-free 60fps scrubbing
  const [localHour, setLocalHour] = useState(selectedHour);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);

  // Sync prop changes when not actively dragging
  useEffect(() => {
    if (!isDraggingRef.current) {
      setLocalHour(selectedHour);
    }
  }, [selectedHour]);

  // Global event listeners to guarantee drag state release
  useEffect(() => {
    const handleEnd = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
      }
    };

    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);

    return () => {
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
    };
  }, []);

  const handleStartDrag = () => {
    isDraggingRef.current = true;
    setIsDragging(true);
  };

  const handleHourChange = (newVal: number) => {
    setLocalHour(newVal);
    onSelectHour(newVal);
  };

  const currentHourData = hourly && hourly[localHour] ? hourly[localHour] : null;
  const currentLocalHour = new Date().getHours();
  const isNow = localHour === currentLocalHour;

  // Calculate percentage along the track for thumb position (0 to 100%)
  const handlePercent = (localHour / 23) * 100;

  return (
    <div className="fixed bottom-13 sm:bottom-4 left-1/2 -translate-x-1/2 z-40 w-[95%] max-w-xl animate-fadeIn pointer-events-auto">
      <div
        style={{
          backgroundColor: isDark
            ? 'rgba(2, 6, 23, var(--slider-opacity, 0.98))'
            : theme === 'hunting'
            ? 'rgba(234, 225, 207, var(--slider-opacity, 0.98))'
            : (theme === 'olive' || theme === 'hunting')
            ? 'rgba(247, 245, 237, var(--slider-opacity, 0.98))'
            : 'rgba(255, 255, 255, var(--slider-opacity, 0.98))'
        }}
        className={`rounded-2xl backdrop-blur-xl border shadow-2xl p-2 sm:p-2.5 transition-all ${
          isDark
            ? 'border-slate-700/80 text-slate-100 shadow-emerald-950/30'
            : theme === 'hunting'
            ? 'bg-[#eae1cf] border-[#d4c4a8] text-[#2a1b0e]'
            : (theme === 'olive' || theme === 'hunting')
            ? 'border-[#d8d2c0] text-[#1e2e1b] shadow-[#556b2f]/10'
            : 'border-slate-300 text-slate-900 shadow-slate-500/20'
        }`}
      >
        {/* Compact Header Row */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-500 flex-shrink-0">
              <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </div>
            <span className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 truncate">
              Hourly Hunt
            </span>
            {currentHourData?.isPrimeWindow && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-600 text-white font-black rounded-full text-[9px] uppercase tracking-wider flex-shrink-0 animate-pulse shadow-xs">
                <Zap className="w-2.5 h-2.5" /> Prime Hunt
              </span>
            )}
          </div>

          {!isNow && (
            <button
              onClick={() => { handleHourChange(currentLocalHour); onResetToToday?.(); }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black transition-all bg-amber-500/20 hover:bg-amber-500/30 text-amber-600 dark:text-amber-400 border border-amber-500/40 flex-shrink-0"
            >
              <RotateCcw className="w-2.5 h-2.5" /> Reset to Live
            </button>
          )}
        </div>

        {/* Custom Interactive Track with Pop-Up Time Indicator on Drag */}
        <div className="relative pt-4 pb-1 select-none">
          {/* Track Bar & Thumb Wrapper */}
          <div className="relative w-full h-7 sm:h-7">
            {/* Visual Track Line */}
            <div className="w-full h-full bg-slate-200 dark:bg-slate-800 rounded-full shadow-inner overflow-hidden border border-slate-300/40 dark:border-slate-700/60 flex items-center">
              {/* Progress Highlight */}
              <div
                className={`h-full ${
                  isNow ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${handlePercent}%` }}
              />
            </div>

            {/* Time Indicator Badge (Thumb) */}
            <div
              className={`absolute pointer-events-none flex flex-col items-center z-10 ${
                isDragging
                  ? 'transition-[top,scale] duration-150 ease-out -top-9 scale-105'
                  : 'transition-all duration-200 ease-out top-1/2 scale-100'
              }`}
              style={{
                left: `${handlePercent}%`,
                transform: `translateX(-${handlePercent}%) ${isDragging ? 'translateY(0)' : 'translateY(-50%)'}`,
              }}
            >
              <div
                className={`h-[34px] px-3.5 rounded-xl font-black text-xs shadow-md border-2 flex items-center justify-center gap-1 whitespace-nowrap transition-colors ${
                  isNow
                    ? 'bg-amber-500 text-slate-950 border-amber-300 ring-2 ring-amber-500/30'
                    : 'bg-emerald-500 text-slate-950 border-emerald-300 ring-2 ring-emerald-500/30'
                }`}
              >
                {isNow ? `📍 NOW (${getHour12Label(localHour)})` : getHour12Label(localHour)}
              </div>

              {/* Pointer Pin Arrow (visible when popped up above thumb) */}
              {isDragging && (
                <div
                  className={`w-0 h-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-t-[6px] -mt-0.5 ${
                    isNow ? 'border-t-amber-500' : 'border-t-emerald-500'
                  }`}
                />
              )}
            </div>

            {/* Transparent Range Input Overlay for Dragging */}
            <input
              type="range"
              min={0}
              max={23}
              step={1}
              value={localHour}
              onPointerDown={handleStartDrag}
              onTouchStart={handleStartDrag}
              onMouseDown={handleStartDrag}
              onPointerUp={() => {
                isDraggingRef.current = false;
                setIsDragging(false);
              }}
              onTouchEnd={() => {
                isDraggingRef.current = false;
                setIsDragging(false);
              }}
              onMouseUp={() => {
                isDraggingRef.current = false;
                setIsDragging(false);
              }}
              onChange={(e) => handleHourChange(parseInt(e.target.value, 10))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              aria-label="Hourly time slider"
            />
          </div>
        </div>

        {/* Time Scale Ticks */}
        <div className="flex justify-between text-[9px] sm:text-[10px] font-black text-slate-400 px-1 mt-1 leading-none select-none">
          <span>12 AM</span>
          <span>3 AM</span>
          <span className="text-emerald-600 dark:text-emerald-400">6 AM Dawn</span>
          <span>9 AM</span>
          <span>12 PM</span>
          <span>3 PM</span>
          <span className="text-emerald-600 dark:text-emerald-400">6 PM Dusk</span>
          <span>9 PM</span>
        </div>
      </div>
    </div>
  );
};


