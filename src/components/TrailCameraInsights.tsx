import React from 'react';
import { Compass, Sparkles, TrendingUp, AlertCircle, CheckCircle2, Award, Zap, ShieldCheck } from 'lucide-react';
import { ThemeMode } from '../types';
import { PatternInsight } from '../services/trailCameraService';

interface TrailCameraInsightsProps {
  theme: ThemeMode;
  insights: PatternInsight[];
  totalPhotosCount: number;
  weatherMatchedCount: number;
}

const getThemeClasses = (theme: ThemeMode) => {
  const isDark = theme === 'dark';
  const isHunting = theme === 'hunting';
  const isOlive = theme === 'olive';

  return {
    cardBg: isDark
      ? 'bg-slate-900/80 border-slate-800 text-slate-100'
      : isHunting
      ? 'bg-[#eae1cf] border-[#d4c4a8] text-[#2a1b0e]'
      : isOlive
      ? 'bg-[#f7f5ed] border-[#d8d2c0] text-[#1e2e1b]'
      : 'bg-white border-slate-200 text-slate-900',
    innerBg: isDark
      ? 'bg-slate-950/40 border-slate-800 text-emerald-400'
      : isHunting
      ? 'bg-[#d8cbb8]/60 border-[#d4c4a8] text-[#2a1b0e]'
      : isOlive
      ? 'bg-[#e8e4d5]/60 border-[#d8d2c0] text-[#1e2e1b]'
      : 'bg-slate-100/60 border-slate-200 text-emerald-700',
  };
};

export const TrailCameraInsights: React.FC<TrailCameraInsightsProps> = ({
  theme,
  insights,
  totalPhotosCount,
  weatherMatchedCount,
}) => {
  const tc = getThemeClasses(theme);

  return (
    <div className="space-y-6">
      {/* Intro Header Card */}
      <div className={`rounded-2xl border p-4 sm:p-5 backdrop-blur-xl shadow-xl space-y-3 transition-all ${tc.cardBg}`}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-500 flex-shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm sm:text-base">Pattern Discovery & Hunting Observations</h3>
            <p className="text-xs opacity-70">
              Data-backed insights calculated from your {weatherMatchedCount} weather-matched trail camera photos.
            </p>
          </div>
        </div>
      </div>

      {/* Insights Grid */}
      {insights.length === 0 || insights[0]?.label === 'Not Enough Data' ? (
        <div className={`rounded-2xl border p-4 sm:p-5 backdrop-blur-xl shadow-xl space-y-3 transition-all ${tc.cardBg}`}>
          <div className="flex items-start gap-3 p-2">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-extrabold text-xs sm:text-sm">More Photo Data Needed</h4>
              <p className="text-xs opacity-80 leading-relaxed">
                Import at least 5 trail camera photos with weather data to discover meaningful movement trends, wind patterns, and peak activity windows.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {insights.map((insight, idx) => {
            const confidenceColor =
              insight.confidence === 'high'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : insight.confidence === 'medium'
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                : 'bg-slate-700/40 text-slate-300 border-slate-600/40';

            return (
              <div key={idx} className={`rounded-2xl border p-4 sm:p-5 backdrop-blur-xl shadow-xl space-y-3 transition-all ${tc.cardBg}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <h4 className="font-extrabold text-xs uppercase tracking-wider">{insight.label}</h4>
                  </div>

                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border flex items-center gap-1 ${confidenceColor}`}>
                    <ShieldCheck className="w-2.5 h-2.5" />
                    {insight.confidence} Confidence
                  </span>
                </div>

                <div className={`p-3 rounded-xl border ${tc.innerBg}`}>
                  "{insight.detail}"
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
