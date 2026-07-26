import React from 'react';
import { X, Thermometer, Gauge, Wind, CloudRain, Clock, Sparkles, Crosshair, TrendingDown } from 'lucide-react';
import { ThemeMode } from '../types';

interface MeteorologyGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: ThemeMode;
}

export const MeteorologyGuideModal: React.FC<MeteorologyGuideModalProps> = ({ isOpen, onClose, theme = 'dark' }) => {
  if (!isOpen) return null;

  const isDark = theme === 'dark';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
      <div
        className={`border rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-4 my-8 max-h-[90vh] overflow-y-auto ${
          isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
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
                How LetsHunt Score Algorithm Works
              </h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                The 7 Core Wildlife Science Factors Driving Our Movement Score
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
          <div className={`p-3.5 rounded-2xl border space-y-1 ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
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
          <div className={`p-3.5 rounded-2xl border space-y-1 ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center gap-2 font-bold text-cyan-500 dark:text-cyan-400 text-sm">
              <TrendingDown className="w-4 h-4" />
              <span>2. Temperature Trend (24h Change)</span>
            </div>
            <p className={`leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <strong className="text-emerald-500">Good:</strong> Rapid cooling drops of 5–10°C (9–18°F) spark massive cold-front movement.<br />
              <strong className="text-rose-500">Bad:</strong> Rapid warming spikes after a cold spell suppress daylight travel, driving deer to nocturnal feeding.
            </p>
          </div>

          {/* Factor 3: Wind Speed */}
          <div className={`p-3.5 rounded-2xl border space-y-1 ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center gap-2 font-bold text-sky-500 dark:text-sky-400 text-sm">
              <Wind className="w-4 h-4" />
              <span>3. Wind Speed</span>
            </div>
            <p className={`leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <strong className="text-emerald-500">Good:</strong> Light to moderate winds (8–20 km/h / 5–12.5 mph) carry steady scent streams without tree noise.<br />
              <strong className="text-rose-500">Bad:</strong> Dead calm (&lt;5 km/h) pools human scent; strong winds (&gt;30 km/h) force deer into sheltered lee-side draws.
            </p>
          </div>

          {/* Factor 4: Barometric Pressure */}
          <div className={`p-3.5 rounded-2xl border space-y-1 ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center gap-2 font-bold text-amber-500 dark:text-amber-400 text-sm">
              <Gauge className="w-4 h-4" />
              <span>4. Barometric Pressure</span>
            </div>
            <p className={`leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <strong className="text-emerald-500">Good:</strong> High or rising pressure (&gt;30.00 inHg) post-front brings clear atmospheric stability and peak travel.<br />
              <strong className="text-rose-500">Bad:</strong> Low pressure (&lt;29.70 inHg) or rapidly falling pressure before severe storms depresses movement.
            </p>
          </div>

          {/* Factor 5: Precipitation */}
          <div className={`p-3.5 rounded-2xl border space-y-1 ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center gap-2 font-bold text-teal-500 dark:text-teal-400 text-sm">
              <CloudRain className="w-4 h-4" />
              <span>5. Precipitation & Rain Breaks</span>
            </div>
            <p className={`leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <strong className="text-emerald-500">Good:</strong> Light drizzle or rain breaks/post-storm clearings prompt deer to leave cover to groom and feed.<br />
              <strong className="text-rose-500">Bad:</strong> Heavy, steady downpours or severe thunderstorms force deer to remain bedded down in thick cover.
            </p>
          </div>

          {/* Factor 6: Time of Day */}
          <div className={`p-3.5 rounded-2xl border space-y-1 ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center gap-2 font-bold text-indigo-500 dark:text-indigo-400 text-sm">
              <Clock className="w-4 h-4" />
              <span>6. Time of Day</span>
            </div>
            <p className={`leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <strong className="text-emerald-500">Good:</strong> First 2 hours after sunrise and last 2 hours before sunset are primary crepuscular travel windows.<br />
              <strong className="text-rose-500">Bad:</strong> Midday hours outside active rut periods are low-activity bedding lulls.
            </p>
          </div>

          {/* Factor 7: Rut Phase */}
          <div className={`p-3.5 rounded-2xl border space-y-1 ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center gap-2 font-bold text-purple-500 dark:text-purple-400 text-sm">
              <Sparkles className="w-4 h-4" />
              <span>7. Rut Phase</span>
            </div>
            <p className={`leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <strong className="text-emerald-500">Good:</strong> Pre-rut, seeking, chasing, and peak rut feature testosterone-driven, broad-daylight buck searching.<br />
              <strong className="text-slate-400">Not as good:</strong> Early season before rut or post-rut feature strict bed-to-feed nocturnal or localized routines.
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
