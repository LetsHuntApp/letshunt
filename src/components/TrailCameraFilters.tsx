import React from 'react';
import { Filter, RotateCcw } from 'lucide-react';
import { ThemeMode, ThemeVariantMode, TrailCameraFilterState, TrailCameraLocation, TrailCameraTarget } from '../types';
import { AppSelect } from './AppSelect';

interface TrailCameraFiltersProps {
  theme?: ThemeVariantMode;
  isDark?: boolean;
  filter: TrailCameraFilterState;
  onFilterChange: (filter: TrailCameraFilterState) => void;
  locations: TrailCameraLocation[];
  targets: TrailCameraTarget[];
  activeFilterCount: number;
  dropdownLeft?: number;
  dropdownMaxHeight?: number;
}

const WIND_DIRECTIONS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const MOON_PHASES = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
const WEATHER_DESCS = ['Clear', 'Mostly Clear', 'Partly Cloudy', 'Overcast', 'Foggy', 'Slight Rain', 'Moderate Rain', 'Heavy Rain', 'Slight Snow', 'Moderate Snow', 'Thunderstorm'];

const TEMP_PRESETS = [
  { label: 'Any temperature', min: undefined, max: undefined },
  { label: 'Below 32°F', min: undefined, max: 31 },
  { label: '32 – 50°F', min: 32, max: 50 },
  { label: '50 – 65°F', min: 50, max: 65 },
  { label: 'Above 65°F', min: 66, max: undefined },
];

const WIND_PRESETS = [
  { label: 'Any wind speed', min: undefined, max: undefined },
  { label: 'Calm (< 5 mph)', min: undefined, max: 4 },
  { label: 'Light (5 – 10 mph)', min: 5, max: 10 },
  { label: 'Moderate (10 – 15 mph)', min: 10, max: 15 },
  { label: 'Strong (> 15 mph)', min: 16, max: undefined },
];

const PRESSURE_PRESETS = [
  { label: 'Any pressure', min: undefined, max: undefined },
  { label: 'Low (< 29.80 inHg)', min: undefined, max: 29.79 },
  { label: 'Normal (29.80 – 30.20 inHg)', min: 29.8, max: 30.2 },
  { label: 'High (> 30.20 inHg)', min: 30.21, max: undefined },
];

const selectBg = (isDark: boolean) =>
  isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900';

export const TrailCameraFilters: React.FC<TrailCameraFiltersProps> = ({
  theme,
  isDark = theme === 'dark',
  filter,
  onFilterChange,
  locations,
  targets,
  activeFilterCount,
  dropdownLeft = 0,
  dropdownMaxHeight,
}) => {
  const isHunting = theme === 'hunting';
  const isOlive = theme === 'olive';

  const handleReset = () => {
    onFilterChange({});
  };

  const activeTempPreset = TEMP_PRESETS.findIndex((p) => p.min === filter.tempMin && p.max === filter.tempMax);
  const activeWindPreset = WIND_PRESETS.findIndex((p) => p.min === filter.windSpeedMin && p.max === filter.windSpeedMax);
  const activePressurePreset = PRESSURE_PRESETS.findIndex((p) => p.min === filter.pressureMin && p.max === filter.pressureMax);

  return (
    <div
      style={{ left: dropdownLeft, maxHeight: dropdownMaxHeight }}
      className={`absolute left-0 right-auto top-full mt-2 z-50 w-80 max-w-[calc(100vw-1.5rem)] max-h-[min(70vh,calc(100dvh-5rem))] overflow-y-auto rounded-2xl border shadow-2xl backdrop-blur-xl p-3 space-y-2.5 text-xs ${
        isDark
          ? 'bg-slate-900/95 border-slate-700 text-slate-100'
          : isHunting
          ? 'bg-[#eae1cf]/95 border-[#d4c4a8] text-[#2a1b0e]'
          : isOlive
          ? 'bg-[#f7f5ed]/95 border-[#d8d2c0] text-[#1e2e1b]'
          : 'bg-white/95 border-slate-200 text-slate-900'
      }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 opacity-80">
          <Filter className="w-3.5 h-3.5" /> Filters
          {activeFilterCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-emerald-500 text-slate-950 font-black text-[10px] flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </span>

        {activeFilterCount > 0 && (
          <button
            onClick={handleReset}
            className="p-1.5 rounded-lg text-xs font-bold text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer flex items-center gap-1"
            title="Reset all filters"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Date Range — full width */}
      <div className="space-y-1">
        <label className="font-bold opacity-80 uppercase tracking-wider text-[11px]">Date Range</label>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1">
          <input
            type="date"
            value={filter.dateStart || ''}
            onChange={(e) => onFilterChange({ ...filter, dateStart: e.target.value || undefined })}
            className={`w-full min-w-0 p-1.5 text-xs rounded-lg border ${selectBg(isDark)}`}
          />
          <span className="opacity-50">-</span>
          <input
            type="date"
            value={filter.dateEnd || ''}
            onChange={(e) => onFilterChange({ ...filter, dateEnd: e.target.value || undefined })}
            className={`w-full min-w-0 p-1.5 text-xs rounded-lg border ${selectBg(isDark)}`}
          />
        </div>
      </div>

      {/* 2-column grid of the rest */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Camera Location */}
        <div className="space-y-1">
          <label className="font-bold opacity-80 uppercase tracking-wider text-[11px]">Location</label>
          <AppSelect
            value={filter.cameraLocationId || ''}
            onChange={(e) => onFilterChange({ ...filter, cameraLocationId: e.target.value || undefined })}
            className={`w-full min-w-0 p-1.5 text-xs rounded-lg border ${selectBg(isDark)}`}
          >
            <option value="">All Locations</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </AppSelect>
        </div>

        {/* Target Tag */}
        <div className="space-y-1">
          <label className="font-bold opacity-80 uppercase tracking-wider text-[11px]">Target</label>
          <AppSelect
            value={filter.targetId || ''}
            onChange={(e) => onFilterChange({ ...filter, targetId: e.target.value || undefined })}
            className={`w-full min-w-0 p-1.5 text-xs rounded-lg border ${selectBg(isDark)}`}
          >
            <option value="">All Targets</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </AppSelect>
        </div>

        {/* Weather Condition */}
        <div className="space-y-1">
          <label className="font-bold opacity-80 uppercase tracking-wider text-[11px]">Weather</label>
          <AppSelect
            value={filter.weatherConditions?.[0] || ''}
            onChange={(e) => onFilterChange({ ...filter, weatherConditions: e.target.value ? [e.target.value] : undefined })}
            className={`w-full min-w-0 p-1.5 text-xs rounded-lg border ${selectBg(isDark)}`}
          >
            <option value="">Any Condition</option>
            {WEATHER_DESCS.map((cond) => (
              <option key={cond} value={cond}>{cond}</option>
            ))}
          </AppSelect>
        </div>

        {/* Moon Phase */}
        <div className="space-y-1">
          <label className="font-bold opacity-80 uppercase tracking-wider text-[11px]">Moon Phase</label>
          <AppSelect
            value={filter.moonPhase || ''}
            onChange={(e) => onFilterChange({ ...filter, moonPhase: e.target.value || undefined })}
            className={`w-full min-w-0 p-1.5 text-xs rounded-lg border ${selectBg(isDark)}`}
          >
            <option value="">Any Moon</option>
            {MOON_PHASES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </AppSelect>
        </div>

        {/* Wind — direction + speed stacked */}
        <div className="space-y-1">
          <label className="font-bold opacity-80 uppercase tracking-wider text-[11px]">Wind</label>
          <AppSelect
            value={filter.windDirection || ''}
            onChange={(e) => onFilterChange({ ...filter, windDirection: e.target.value || undefined })}
            className={`w-full min-w-0 p-1.5 text-xs rounded-lg border ${selectBg(isDark)}`}
          >
            <option value="">Any Direction</option>
            {WIND_DIRECTIONS.map((dir) => (
              <option key={dir} value={dir}>{dir}</option>
            ))}
          </AppSelect>
          <AppSelect
            value={activeWindPreset === -1 ? '-1' : String(activeWindPreset)}
            onChange={(e) => {
              const p = WIND_PRESETS[parseInt(e.target.value, 10)];
              if (p) onFilterChange({ ...filter, windSpeedMin: p.min, windSpeedMax: p.max });
            }}
            className={`w-full min-w-0 p-1.5 text-xs rounded-lg border ${selectBg(isDark)}`}
          >
            {activeWindPreset === -1 && <option value="-1">Custom ({(filter.windSpeedMin ?? '?')} – {(filter.windSpeedMax ?? '∞')} mph)</option>}
            {WIND_PRESETS.map((p, i) => (
              <option key={p.label} value={i}>{p.label}</option>
            ))}
          </AppSelect>
        </div>

        {/* Temperature + Pressure stacked */}
        <div className="space-y-1">
          <label className="font-bold opacity-80 uppercase tracking-wider text-[11px]">Temp & Pressure</label>
          <AppSelect
            value={activeTempPreset === -1 ? '-1' : String(activeTempPreset)}
            onChange={(e) => {
              const p = TEMP_PRESETS[parseInt(e.target.value, 10)];
              if (p) onFilterChange({ ...filter, tempMin: p.min, tempMax: p.max });
            }}
            className={`w-full min-w-0 p-1.5 text-xs rounded-lg border ${selectBg(isDark)}`}
          >
            {activeTempPreset === -1 && <option value="-1">Custom ({(filter.tempMin ?? '?')} – {(filter.tempMax ?? '∞')}°F)</option>}
            {TEMP_PRESETS.map((p, i) => (
              <option key={p.label} value={i}>{p.label}</option>
            ))}
          </AppSelect>
          <AppSelect
            value={activePressurePreset === -1 ? '-1' : String(activePressurePreset)}
            onChange={(e) => {
              const p = PRESSURE_PRESETS[parseInt(e.target.value, 10)];
              if (p) onFilterChange({ ...filter, pressureMin: p.min, pressureMax: p.max });
            }}
            className={`w-full min-w-0 p-1.5 text-xs rounded-lg border ${selectBg(isDark)}`}
          >
            {activePressurePreset === -1 && <option value="-1">Custom ({(filter.pressureMin ?? '?')} – {(filter.pressureMax ?? '∞')} inHg)</option>}
            {PRESSURE_PRESETS.map((p, i) => (
              <option key={p.label} value={i}>{p.label}</option>
            ))}
          </AppSelect>
        </div>
      </div>
    </div>
  );
};
