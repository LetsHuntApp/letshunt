import React from 'react';
import { X, Thermometer, Gauge, Wind, CloudRain, Clock, Sparkles, Crosshair, TrendingDown } from 'lucide-react';
import { ThemeMode, ThemeVariantMode } from '../types';

interface MeteorologyGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: ThemeVariantMode;
  isDark?: boolean;
}

export const MeteorologyGuideModal: React.FC<MeteorologyGuideModalProps> = ({ isOpen, onClose, theme = 'dark', isDark = theme === 'dark' }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
      <div
        className={`border rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-4 my-8 max-h-[90vh] overflow-y-auto ${
          isDark ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-700 text-slate-100' : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 text-slate-900'
        }`}
      >
        {/* Modal Header */}
        <div className={`flex items-center justify-between border-b pb-4 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-500">
              <Crosshair className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`text-base sm:text-lg font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                How the Hunt Score Works
              </h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                The weather and wildlife clues behind the deer movement score
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition-colors ${
              isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 7 Core Science Factors */}
        <div className="space-y-3 text-xs">
          {/* Factor 1: Temperature */}
          <div className={`p-3.5 rounded-2xl border space-y-1 ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-slate-50/[var(--card-opacity)] border-slate-200'}`}>
            <div className="flex items-center gap-2 font-bold text-blue-500 dark:text-blue-400 text-sm">
              <Thermometer className="w-4 h-4" />
              <span>1. Temperature Level</span>
            </div>
            <p className={`leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <strong className="text-emerald-500">Good:</strong> Crisp, cool temperatures increase metabolic appetite and trigger daylight feeding.<br />
              <strong className="text-rose-500">Bad:</strong> Hot, unseasonably warm temperatures force deer to bed down in shaded thermal cover until dusk.
            </p>
          </div>

          {/* Factor 2: Temperature Trend */}
          <div className={`p-3.5 rounded-2xl border space-y-1 ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-slate-50/[var(--card-opacity)] border-slate-200'}`}>
            <div className="flex items-center gap-2 font-bold text-cyan-500 dark:text-cyan-400 text-sm">
              <TrendingDown className="w-4 h-4" />
              <span>2. Temperature Change (24 hours)</span>
            </div>
            <p className={`leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <strong className="text-emerald-500">Good:</strong> A quick cool-down of 5–10°C (9–18°F) can get deer moving after a cold front.<br />
              <strong className="text-rose-500">Bad:</strong> A quick warm-up after cold weather can keep deer bedded until after dark.
            </p>
          </div>

          {/* Factor 3: Wind & Scent */}
          <div className={`p-3.5 rounded-2xl border space-y-1 ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-slate-50/[var(--card-opacity)] border-slate-200'}`}>
            <div className="flex items-center gap-2 font-bold text-sky-500 dark:text-sky-400 text-sm">
              <Wind className="w-4 h-4" />
              <span>3. Wind & Scent</span>
            </div>
            <p className={`leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <strong className="text-emerald-500">Good:</strong> A light to moderate breeze (8–20 km/h / 5–12.5 mph) carries your scent steadily without making the woods noisy.<br />
              <strong className="text-rose-500">Bad:</strong> Dead calm (&lt;5 km/h) lets your scent hang around; hard wind (&gt;30 km/h) pushes deer into sheltered draws.
            </p>
          </div>

          {/* Factor 4: The Barometer */}
          <div className={`p-3.5 rounded-2xl border space-y-1 ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-slate-50/[var(--card-opacity)] border-slate-200'}`}>
            <div className="flex items-center gap-2 font-bold text-amber-500 dark:text-amber-400 text-sm">
              <Gauge className="w-4 h-4" />
              <span>4. The Barometer</span>
            </div>
            <p className={`leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <strong className="text-emerald-500">Good:</strong> A high or rising barometer (&gt;30.00 inHg) after a front often brings clear skies and better deer movement.<br />
              <strong className="text-rose-500">Bad:</strong> A low or quickly falling barometer (&lt;29.70 inHg) before a bad storm can shut movement down.
            </p>
          </div>

          {/* Factor 5: Precipitation */}
          <div className={`p-3.5 rounded-2xl border space-y-1 ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-slate-50/[var(--card-opacity)] border-slate-200'}`}>
            <div className="flex items-center gap-2 font-bold text-teal-500 dark:text-teal-400 text-sm">
              <CloudRain className="w-4 h-4" />
              <span>5. Rain & Breaks in the Rain</span>
            </div>
            <p className={`leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <strong className="text-emerald-500">Good:</strong> Light drizzle or a break after rain can get deer out of cover to feed and clean up.<br />
              <strong className="text-rose-500">Bad:</strong> Heavy rain and thunderstorms usually keep deer bedded in thick cover.
            </p>
          </div>

          {/* Factor 6: Best Time of Day */}
          <div className={`p-3.5 rounded-2xl border space-y-1 ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-slate-50/[var(--card-opacity)] border-slate-200'}`}>
            <div className="flex items-center gap-2 font-bold text-indigo-500 dark:text-indigo-400 text-sm">
              <Clock className="w-4 h-4" />
              <span>6. Best Time of Day</span>
            </div>
            <p className={`leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <strong className="text-emerald-500">Good:</strong> The first two hours after sunrise and the last two hours before sunset are usually your best windows.<br />
              <strong className="text-rose-500">Bad:</strong> Outside the rut, midday is often a slow stretch while deer stay bedded.
            </p>
          </div>

          {/* Factor 7: Rut & Buck Movement */}
          <div className={`p-3.5 rounded-2xl border space-y-1 ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-slate-50/[var(--card-opacity)] border-slate-200'}`}>
            <div className="flex items-center gap-2 font-bold text-purple-500 dark:text-purple-400 text-sm">
              <Sparkles className="w-4 h-4" />
              <span>7. Rut & Buck Movement</span>
            </div>
            <p className={`leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <strong className="text-emerald-500">Good:</strong> During the pre-rut and rut, bucks may cruise and chase in broad daylight.<br />
              <strong className="text-slate-400">Not as good:</strong> Before or after the rut, bucks often stick closer to a bed-to-feed routine.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className={`pt-3 border-t text-center ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-colors shadow-md"
          >
            Got It — Back to Forecast
          </button>
        </div>
      </div>
    </div>
  );
};
