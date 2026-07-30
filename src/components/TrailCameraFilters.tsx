import React, { useState } from 'react';
import { Filter, X, Search, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { ThemeMode, TrailCameraFilterState, TrailCameraLocation } from '../types';

interface TrailCameraFiltersProps {
  theme: ThemeMode;
  filter: TrailCameraFilterState;
  onFilterChange: (filter: TrailCameraFilterState) => void;
  locations: TrailCameraLocation[];
  totalPhotosCount: number;
  filteredPhotosCount: number;
}

const WIND_DIRECTIONS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const MOON_PHASES = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
const WEATHER_DESCS = ['Clear', 'Mostly Clear', 'Partly Cloudy', 'Overcast', 'Foggy', 'Slight Rain', 'Moderate Rain', 'Heavy Rain', 'Slight Snow', 'Moderate Snow', 'Thunderstorm'];

export const TrailCameraFilters: React.FC<TrailCameraFiltersProps> = ({
  theme,
  filter,
  onFilterChange,
  locations,
  totalPhotosCount,
  filteredPhotosCount,
}) => {
  const isDark = theme === 'dark';
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

  return (
    <div
      className={`rounded-2xl border p-3 sm:p-4 backdrop-blur-xl shadow-xl transition-all ${
        isDark
          ? 'bg-slate-900/80 border-slate-800 text-slate-100'
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
                  ? 'bg-slate-950/60 border-slate-700 focus:border-emerald-500 text-white'
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
              <span className="w-4 h-4 rounded-full bg-emerald-500 text-slate-950 font-black text-[10px] flex items-center justify-center">
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
            <label className="font-bold opacity-80 uppercase tracking-wider text-[10px]">Date Range</label>
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
            <label className="font-bold opacity-80 uppercase tracking-wider text-[10px]">Camera Location</label>
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

          {/* Wind Direction */}
          <div className="space-y-1">
            <label className="font-bold opacity-80 uppercase tracking-wider text-[10px]">Wind Direction</label>
            <select
              value={filter.windDirection || ''}
              onChange={(e) => onFilterChange({ ...filter, windDirection: e.target.value || undefined })}
              className={`w-full p-1.5 text-xs rounded-xl border ${
                isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            >
              <option value="">Any Wind</option>
              {WIND_DIRECTIONS.map((dir) => (
                <option key={dir} value={dir}>{dir}</option>
              ))}
            </select>
          </div>

          {/* Moon Phase */}
          <div className="space-y-1">
            <label className="font-bold opacity-80 uppercase tracking-wider text-[10px]">Moon Phase</label>
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

          {/* Temp Min / Max */}
          <div className="space-y-1">
            <label className="font-bold opacity-80 uppercase tracking-wider text-[10px]">Temperature (°F)</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                placeholder="Min"
                value={filter.tempMin ?? ''}
                onChange={(e) => onFilterChange({ ...filter, tempMin: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                className={`w-full p-1.5 text-xs rounded-xl border ${
                  isDark ? 'bg-slate-950 border-slate-700' : 'bg-slate-50 border-slate-300'
                }`}
              />
              <span className="opacity-50">-</span>
              <input
                type="number"
                placeholder="Max"
                value={filter.tempMax ?? ''}
                onChange={(e) => onFilterChange({ ...filter, tempMax: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                className={`w-full p-1.5 text-xs rounded-xl border ${
                  isDark ? 'bg-slate-950 border-slate-700' : 'bg-slate-50 border-slate-300'
                }`}
              />
            </div>
          </div>

          {/* Pressure Range */}
          <div className="space-y-1">
            <label className="font-bold opacity-80 uppercase tracking-wider text-[10px]">Barometric Pressure (inHg)</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="0.05"
                placeholder="Min"
                value={filter.pressureMin ?? ''}
                onChange={(e) => onFilterChange({ ...filter, pressureMin: e.target.value ? parseFloat(e.target.value) : undefined })}
                className={`w-full p-1.5 text-xs rounded-xl border ${
                  isDark ? 'bg-slate-950 border-slate-700' : 'bg-slate-50 border-slate-300'
                }`}
              />
              <span className="opacity-50">-</span>
              <input
                type="number"
                step="0.05"
                placeholder="Max"
                value={filter.pressureMax ?? ''}
                onChange={(e) => onFilterChange({ ...filter, pressureMax: e.target.value ? parseFloat(e.target.value) : undefined })}
                className={`w-full p-1.5 text-xs rounded-xl border ${
                  isDark ? 'bg-slate-950 border-slate-700' : 'bg-slate-50 border-slate-300'
                }`}
              />
            </div>
          </div>

          {/* Wind Speed */}
          <div className="space-y-1">
            <label className="font-bold opacity-80 uppercase tracking-wider text-[10px]">Wind Speed (mph)</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                placeholder="Min"
                value={filter.windSpeedMin ?? ''}
                onChange={(e) => onFilterChange({ ...filter, windSpeedMin: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                className={`w-full p-1.5 text-xs rounded-xl border ${
                  isDark ? 'bg-slate-950 border-slate-700' : 'bg-slate-50 border-slate-300'
                }`}
              />
              <span className="opacity-50">-</span>
              <input
                type="number"
                placeholder="Max"
                value={filter.windSpeedMax ?? ''}
                onChange={(e) => onFilterChange({ ...filter, windSpeedMax: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                className={`w-full p-1.5 text-xs rounded-xl border ${
                  isDark ? 'bg-slate-950 border-slate-700' : 'bg-slate-50 border-slate-300'
                }`}
              />
            </div>
          </div>

          {/* Weather Condition */}
          <div className="space-y-1">
            <label className="font-bold opacity-80 uppercase tracking-wider text-[10px]">Weather Condition</label>
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
        </div>
      )}
    </div>
  );
};
