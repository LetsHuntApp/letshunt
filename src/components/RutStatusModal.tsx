import React from 'react';
import { RutPhase } from '../utils/rutEngine';
import { Location, ThemeMode } from '../types';
import { X, Sparkles, Flame, ShieldAlert, Compass, Eye, Volume2, Target } from 'lucide-react';
import { RutPhaseIcon } from './RutPhaseIcon';

interface RutStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  rutInfo: RutPhase;
  location?: Location;
  dateFormatted?: string;
  theme: ThemeMode;
  hasCustomBackground?: boolean;
}

export const RutStatusModal: React.FC<RutStatusModalProps> = ({
  isOpen,
  onClose,
  rutInfo,
  location,
  dateFormatted,
  theme,
  hasCustomBackground = false,
}) => {
  if (!isOpen) return null;

  const isDark = theme === 'dark';

  // Specific tactical highlights depending on rut phase
  const getPhaseTactics = (phaseId: RutPhase['phaseId']) => {
    switch (phaseId) {
      case 'summer':
        return {
          daylightActivity: 'Low-Moderate (Feeding focus at dusk/dawn)',
          rattlingEffectiveness: 'Very Low (Avoid high aggression)',
          scentStrategy: 'Cover scents & thermal wind placement only',
          bestStandLocation: 'Soybean or alfalfa field edges near water sources',
        };
      case 'early':
        return {
          daylightActivity: 'Moderate (Predictable bed-to-food routes)',
          rattlingEffectiveness: 'Low (Soft tickling or spar sounds)',
          scentStrategy: 'Fresh scrape mock scent or estrous drip',
          bestStandLocation: 'Oak flats with fresh acorn drops & hardwood funnels',
        };
      case 'pre_rut':
        return {
          daylightActivity: 'High (Heavy scraping, scent-checking, sparring)',
          rattlingEffectiveness: 'High (Light to moderate sequence)',
          scentStrategy: 'Tarsal gland scent, buck urine & mock scrapes',
          bestStandLocation: 'Primary scrape lines, pinch points & staging areas',
        };
      case 'peak_rut':
        return {
          daylightActivity: 'Extreme (Cruising, chasing & midday movement)',
          rattlingEffectiveness: 'Very High (Aggressive sequence with grunts)',
          scentStrategy: 'Estrous doe lure & drag rags',
          bestStandLocation: 'Downwind of dense doe bedding, saddles & creek funnels',
        };
      case 'lockdown':
        return {
          daylightActivity: 'Variable (Brief bursts when bucks switch does)',
          rattlingEffectiveness: 'Moderate (Snort-wheeze & aggressive grunts)',
          scentStrategy: 'Doe estrous or blind calling',
          bestStandLocation: 'Thick security cover edges & isolated brush pockets',
        };
      case 'post_rut':
        return {
          daylightActivity: 'Moderate-High (Focusing on calorie recovery)',
          rattlingEffectiveness: 'Moderate (Contact grunts & soft rattling)',
          scentStrategy: 'Curiosity scents near high-calorie food',
          bestStandLocation: 'High-calorie grain fields & standing corn near bedding',
        };
      case 'late':
        return {
          daylightActivity: 'Strictly Food-Driven (Afternoon activity spikes)',
          rattlingEffectiveness: 'Low (Focus on low pressure)',
          scentStrategy: 'Minimal scent usage to avoid spooking wary bucks',
          bestStandLocation: 'South-facing sunny bedding ridges overlooking food plots',
        };
      default:
        return {
          daylightActivity: 'Moderate',
          rattlingEffectiveness: 'Moderate',
          scentStrategy: 'Standard scent control',
          bestStandLocation: 'Primary travel corridors',
        };
    }
  };

  const tactics = getPhaseTactics(rutInfo.phaseId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-fadeIn">
      <div
        className={`relative w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden max-h-[90vh] flex flex-col transition-all ${
          isDark
            ? 'bg-slate-900 border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`p-4 sm:p-5 border-b flex items-center justify-between gap-3 ${
            isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50/90 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <RutPhaseIcon iconName={rutInfo.iconName} className="w-8 h-8 sm:w-9 sm:h-9 flex-shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${rutInfo.badgeStyle}`}
                >
                  {rutInfo.name}
                </span>
                {dateFormatted && (
                  <span className={`text-[11px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    • {dateFormatted}
                  </span>
                )}
              </div>
              <h3 className={`text-base sm:text-lg font-black mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Deer Rut Phase Breakdown
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-xl border transition-colors cursor-pointer ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
            }`}
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content Scrollable Area */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto custom-scrollbar flex-1">
          {/* Phase Summary Banner */}
          <div
            className={`p-4 rounded-2xl border text-xs leading-relaxed ${
              isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-emerald-50/70 border-emerald-200/80 shadow-xs'
            }`}
          >
            <div className="font-extrabold text-xs uppercase tracking-wide text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Current Behavioral Pattern: {rutInfo.description}</span>
            </div>
            <p className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              {rutInfo.hunterTip}
            </p>
          </div>

          {/* Regional Context Tag */}
          {location && (
            <div className={`text-[11px] font-semibold flex items-center gap-1.5 px-3 py-2 rounded-xl border ${
              isDark ? 'bg-slate-950/40 border-slate-800/80 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
            }`}>
              <Compass className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>
                Regional Timing Adjusted for <strong className="text-slate-200 dark:text-slate-100">{location.name} {location.admin1 ? `(${location.admin1})` : ''}</strong> based on latitude & seasonal rut zone.
              </span>
            </div>
          )}

          {/* Quick Tactical Matrix */}
          <div>
            <h4 className={`text-xs font-black uppercase tracking-wider mb-2.5 flex items-center gap-1.5 ${
              isDark ? 'text-slate-300' : 'text-slate-700'
            }`}>
              <Target className="w-4 h-4 text-emerald-500" />
              <span>Tactical Execution Guide</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div
                className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                  isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200 shadow-xs'
                }`}
              >
                <Eye className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Daylight Movement</div>
                  <div className={`text-xs font-bold mt-0.5 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                    {tactics.daylightActivity}
                  </div>
                </div>
              </div>

              <div
                className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                  isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200 shadow-xs'
                }`}
              >
                <Volume2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Rattling & Calls</div>
                  <div className={`text-xs font-bold mt-0.5 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                    {tactics.rattlingEffectiveness}
                  </div>
                </div>
              </div>

              <div
                className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                  isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200 shadow-xs'
                }`}
              >
                <Flame className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Scent Strategy</div>
                  <div className={`text-xs font-bold mt-0.5 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                    {tactics.scentStrategy}
                  </div>
                </div>
              </div>

              <div
                className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                  isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200 shadow-xs'
                }`}
              >
                <ShieldAlert className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Optimal Setup</div>
                  <div className={`text-xs font-bold mt-0.5 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                    {tactics.bestStandLocation}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          className={`p-4 border-t flex justify-end ${
            isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold uppercase tracking-wider rounded-xl transition-colors shadow-md cursor-pointer"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
