import React, { useState } from 'react';
import { Filter, X, Search, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { ThemeMode, ThemeVariantMode, TrailCameraFilterState, TrailCameraLocation, TrailCameraTarget } from '../types';

interface TrailCameraFiltersProps {
  theme?: ThemeVariantMode;
  isDark?: boolean;
  filter: TrailCameraFilterState;
  onFilterChange: (filter: TrailCameraFilterState) => void;
  locations: TrailCameraLocation[];
  targets: TrailCameraTarget[];
  totalPhotosCount: number;
  filteredPhotosCount: number;
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

export const TrailCameraFilters: React.FC<TrailCameraFiltersProps> = ({
  theme,
  isDark = theme === 'dark',
  filter,
  onFilterChange,
  locations,
  targets,
  totalPhotosCount,
  filteredPhotosCount,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const activeFilterCount = [
    filter.dateStart,
    filter.dateEnd,
    filter.cameraLocationId,
    filter.windDirection,
    filter.tempMin != null || filter.tempMax != null,
    filter.windSpeedMin != null || filter.windSpeedMax != null,
    filter.pressureMin != null || filter.pressureMax != null,
    filter.weatherConditions?.length,
    filter.moonPhase,
    filter.searchQuery,
  ].filter(Boolean).length;

  const handleReset = () => {
    onFilterChange({});
  };

  const activeTempPreset = TEMP_PRESETS.findIndex((p) => p.min === filter.tempMin && p.max === filter.tempMax);
  const activeWindPreset = WIND_PRESETS.findIndex((p) => p.min === filter.windSpeedMin && p.max === filter.windSpeedMax);
  const activePressurePreset = PRESSURE_PRESETS.findIndex((p) => p.min === filter.pressureMin && p.max === filter.pressureMax);

  return (
    <div
      className={`rounded-2xl border p-3 sm:p-4 backdrop-blur-xl shadow-xl transition-all ${
        isDark
          ? 'bg-slate-900/[var(--card-opacity)] border-slate-800 text-slate-100'
          : theme === 'hunting'
          ? 'bg-[#eae1cf] border-[#d4c4a8] text-[#2a1b0e]'
          : (theme === 'olive' || theme === 'hunting')
          ? 'bg-[#f7f5ed] border-[#d8d2c0] text-[#1e2e1b]'
          : 'bg-white border-slate-200 text-slate-900'
      }`}
    >
      {/* Top Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
            <input
              type="text"
              placeholder="Search filename or notes..."
              value={filter.searchQuery || ''}
              onChange={(e) => onFilterChange({ ...filter, searchQuery: e.target.value || undefined })}
              className={`w-full pl-9 pr-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors outline-none ${
                isDark
                  ? 'bg-slate-950/[calc(var(--card-opacity)*0.7)] border-slate-700 focus:border-emerald-500 text-white'
                  : 'bg-slate-50 border-slate-300 focus:border-emerald-600 text-slate-900'
              }`}
            />
            {filter.searchQuery && (
              <button
                onClick={() => onFilterChange({ ...filter, searchQuery: undefined })}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all border cursor-pointer ${
              activeFilterCount > 0
                ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40'
                : isDark
                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-emerald-500 text-slate-950 font-black text-xs flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {activeFilterCount > 0 && (
            <button
              onClick={handleReset}
              className="p-1.5 rounded-xl text-xs font-bold text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer flex items-center gap-1"
              title="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}
        </div>

        <div className="text-xs font-bold opacity-70">
          Showing {filteredPhotosCount} of {totalPhotosCount} photos
        </div>
      </div>

      {/* Expanded Multi-Filter Panel */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-slate-700/40 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {/* Date Range */}
          <div className="space-y-1">
            <label className="font-bold opacity-80 uppercase tracking-wider text-xs">Date Range</label>
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={filter.dateStart || ''}
                onChange={(e) => onFilterChange({ ...filter, dateStart: e.target.value || undefined })}
                className={`w-full p-1.5 text-xs rounded-xl border ${
                  isDark ? 'bg-slate-950 border-slate-700' : 'bg-slate-50 border-slate-300'
                }`}
              />
              <span className="opacity-50">-</span>
              <input
                type="date"
                value={filter.dateEnd || ''}
                onChange={(e) => onFilterChange({ ...filter, dateEnd: e.target.value || undefined })}
                className={`w-full p-1.5 text-xs rounded-xl border ${
                  isDark ? 'bg-slate-950 border-slate-700' : 'bg-slate-50 border-slate-300'
                }`}
              />
            </div>
          </div>

          {/* Camera Location */}
          <div className="space-y-1">
            <label className="font-bold opacity-80 uppercase tracking-wider text-xs">Camera Location</label>
            <select
              value={filter.cameraLocationId || ''}
              onChange={(e) => onFilterChange({ ...filter, cameraLocationId: e.target.value || undefined })}
              className={`w-full p-1.5 text-xs rounded-xl border ${
                isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            >
              <option value="">All Locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Target Tag */}
          <div className="space-y-1">
            <label className="font-bold opacity-80 uppercase tracking-wider text-xs">Target Tag</label>
            <select
              value={filter.targetId || ''}
              onChange={(e) => onFilterChange({ ...filter, targetId: e.target.value || undefined })}
              className={`w-full p-1.5 text-xs rounded-xl border ${
                isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            >
              <option value="">All Targets</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Weather Condition */}
          <div className="space-y-1">
            <label className="font-bold opacity-80 uppercase tracking-wider text-xs">Weather Condition</label>
            <select
              value={filter.weatherConditions?.[0] || ''}
              onChange={(e) => onFilterChange({ ...filter, weatherConditions: e.target.value ? [e.target.value] : undefined })}
              className={`w-full p-1.5 text-xs rounded-xl border ${
                isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            >
              <option value="">Any Condition</option>
              {WEATHER_DESCS.map((cond) => (
                <option key={cond} value={cond}>{cond}</option>
              ))}
            </select>
          </div>

          {/* Wind */}
          <div className="space-y-1">
            <label className="font-bold opacity-80 uppercase tracking-wider text-xs">Wind</label>
            <select
              value={filter.windDirection || ''}
              onChange={(e) => onFilterChange({ ...filter, windDirection: e.target.value || undefined })}
              className={`w-full p-1.5 text-xs rounded-xl border ${
                isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            >
              <option value="">Any Direction</option>
              {WIND_DIRECTIONS.map((dir) => (
                <option key={dir} value={dir}>{dir}</option>
              ))}
            </select>
            <select
              value={activeWindPreset === -1 ? '-1' : String(activeWindPreset)}
              onChange={(e) => {
                const p = WIND_PRESETS[parseInt(e.target.value, 10)];
                if (p) onFilterChange({ ...filter, windSpeedMin: p.min, windSpeedMax: p.max });
              }}
              className={`w-full p-1.5 text-xs rounded-xl border ${
                isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            >
              {activeWindPreset === -1 && <option value="-1">Custom ({(filter.windSpeedMin ?? '?')} – {(filter.windSpeedMax ?? '∞')} mph)</option>}
              {WIND_PRESETS.map((p, i) => (
                <option key={p.label} value={i}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Temperature */}
          <div className="space-y-1">
            <label className="font-bold opacity-80 uppercase tracking-wider text-xs">Temperature</label>
            <select
              value={activeTempPreset === -1 ? '-1' : String(activeTempPreset)}
              onChange={(e) => {
                const p = TEMP_PRESETS[parseInt(e.target.value, 10)];
                if (p) onFilterChange({ ...filter, tempMin: p.min, tempMax: p.max });
              }}
              className={`w-full p-1.5 text-xs rounded-xl border ${
                isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            >
              {activeTempPreset === -1 && <option value="-1">Custom ({(filter.tempMin ?? '?')} – {(filter.tempMax ?? '∞')}°F)</option>}
              {TEMP_PRESETS.map((p, i) => (
                <option key={p.label} value={i}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Pressure */}
          <div className="space-y-1">
            <label className="font-bold opacity-80 uppercase tracking-wider text-xs">Barometric Pressure</label>
            <select
              value={activePressurePreset === -1 ? '-1' : String(activePressurePreset)}
              onChange={(e) => {
                const p = PRESSURE_PRESETS[parseInt(e.target.value, 10)];
                if (p) onFilterChange({ ...filter, pressureMin: p.min, pressureMax: p.max });
              }}
              className={`w-full p-1.5 text-xs rounded-xl border ${
                isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            >
              {activePressurePreset === -1 && <option value="-1">Custom ({(filter.pressureMin ?? '?')} – {(filter.pressureMax ?? '∞')} inHg)</option>}
              {PRESSURE_PRESETS.map((p, i) => (
                <option key={p.label} value={i}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Moon Phase */}
          <div className="space-y-1">
            <label className="font-bold opacity-80 uppercase tracking-wider text-xs">Moon Phase</label>
            <select
              value={filter.moonPhase || ''}
              onChange={(e) => onFilterChange({ ...filter, moonPhase: e.target.value || undefined })}
              className={`w-full p-1.5 text-xs rounded-xl border ${
                isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            >
              <option value="">Any Moon Phase</option>
              {MOON_PHASES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
};
