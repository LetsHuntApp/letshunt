/// <reference types="vite/client" />
import React, { useState, useEffect, useRef } from 'react';
import {              Compass,
              MapPin,
              Search,
              Star,
              Settings,
              LayoutDashboard,
              Home,
              Map,
              ScrollText,
              Camera,
              Sun,
            } from 'lucide-react';
import { Location, UnitSystem, ThemeMode, ThemeVariantMode } from '../types';
import { searchLocations } from '../services/weatherService';
import horizontalLogoRaw from '../../letshunthorizontallogo.svg?raw';

interface HeaderProps {
  currentLocation: Location;
  onSelectLocation: (loc: Location) => void;
  defaultLocation: Location;
  onSetDefaultLocation: (loc: Location) => void;
  units: UnitSystem;
  onToggleUnits: () => void;
  theme?: ThemeVariantMode;
  isDark?: boolean;
  hasCustomBackground?: boolean;
  onToggleTheme: () => void;
  favorites: Location[];
  onToggleFavorite: (loc: Location) => void;
  onOpenGuide: () => void;
  onOpenPwaModal: () => void;
  activeTab: 'dashboard' | 'settings' | 'map' | 'details' | 'logs' | 'trailcams';
  onTabChange: (tab: 'dashboard' | 'settings' | 'map' | 'logs' | 'trailcams') => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentLocation,
  onSelectLocation,
  defaultLocation,
  onSetDefaultLocation,
  units,
  onToggleUnits,
  theme,
  isDark = theme === 'dark',
  hasCustomBackground = false,
  onToggleTheme,
  favorites,
  onToggleFavorite,
  activeTab,
  onTabChange,
}) => {
  // Header brand mark: inline the horizontal LetsHunt logo
  // (letshunthorizontallogo.svg) and recolor it per theme, so the header
  // stays theme-aware like the old hand-built inline SVG while the file
  // remains the single source of truth. The HUNT photo is the app icon
  // everywhere else (PWA icons, favicon, notifications, splash).
  const logoAccent = theme === 'hunting'
    ? (isDark ? '#c77942' : '#c85a17')
    : theme === 'olive'
    ? '#556b2f'
    : '#10b981';
  const logoText = isDark
    ? (theme === 'hunting' ? '#e8dfd2' : '#ffffff')
    : theme === 'hunting'
    ? '#2a1b0e'
    : theme === 'olive'
    ? '#1e2e1b'
    : '#0f172a';
  const themedLogo = horizontalLogoRaw
    .replace('<svg ', '<svg class="h-12 sm:h-14 w-auto -my-3" ')
    .split('#ff751f').join(logoAccent) // deer accent
    .split('#000000').join(logoText);  // wordmark text

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Handle location search debounced
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const results = await searchLocations(searchQuery);
      setSearchResults(results);
      setIsSearching(false);
      setShowDropdown(true);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click outside listener for search dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const gpsLocation: Location = {
          name: 'My GPS Location',
          admin1: `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`,
          country: 'GPS Location',
          latitude,
          longitude,
        };
        onSelectLocation(gpsLocation);
        setIsLocating(false);
      },
      (error) => {
        console.warn('GPS position request notice:', error?.message || error);
        setIsLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  };

  const isCurrentFav = favorites.some(
    (f) => Math.abs(f.latitude - currentLocation.latitude) < 0.01 && Math.abs(f.longitude - currentLocation.longitude) < 0.01
  );

  const isCurrentDefault =
    Math.abs(defaultLocation.latitude - currentLocation.latitude) < 0.01 &&
    Math.abs(defaultLocation.longitude - currentLocation.longitude) < 0.01;

  return (
    <header
      className={`sticky top-0 z-50 px-3 sm:px-6 lg:px-8 py-1.5 transition-colors duration-200 border-b ${
        isDark
          ? 'bg-slate-950/[var(--card-opacity)] backdrop-blur-md border-slate-800/80 shadow-lg text-slate-100'
          : theme === 'hunting'
          ? 'bg-[#f4eee1]/[var(--card-opacity)] backdrop-blur-md border-[#d4c4a8] shadow-xs text-[#2a1b0e]'
          : (theme === 'olive' || theme === 'hunting')
          ? 'bg-[#f7f5ed]/[var(--card-opacity)] backdrop-blur-md border-[#d8d2c0] shadow-xs text-[#1e2e1b]'
          : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 shadow-sm text-slate-900'
      }`}
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-3 flex-wrap md:flex-nowrap">
          {/* Left: Brand Logo, GPS, Search Box, and Active Location Badge */}
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            {/* Logo — lelshunthorizontallogo.svg inlined & recolored per theme */}
            <div
              className="flex items-center cursor-pointer flex-shrink-0"
              onClick={() => {
                onTabChange('dashboard');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              dangerouslySetInnerHTML={{ __html: themedLogo }}
              aria-label="LetsHunt"
            />

            {/* GPS / Locate Button */}
            <button
              onClick={handleGetCurrentLocation}
              disabled={isLocating}
              className={`p-1.5 sm:p-2 rounded-xl flex items-center justify-center transition-colors flex-shrink-0 border ${
                isDark
                  ? 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-emerald-400'
                  : theme === 'hunting'
                  ? 'bg-[#eae1cf] border-[#d4c4a8] hover:bg-[#e0d6c0] text-[#c85a17]'
                  : (theme === 'olive' || theme === 'hunting')
                  ? 'bg-[#efebd9] border-[#d8d2c0] hover:bg-[#e8e4d2] text-[#556b2f]'
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-emerald-600'
              }`}
              title="Locate via GPS"
            >
              <Compass className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isLocating ? 'animate-spin' : ''}`} />
            </button>

            {/* Quick Units Toggle */}
            <button
              onClick={onToggleUnits}
              title="Toggle units (°F/°C)"
              className={`px-2 py-1.5 rounded-xl text-[11px] font-black border flex items-center gap-0.5 flex-shrink-0 transition-colors ${
                isDark
                  ? 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-emerald-400'
                  : theme === 'hunting'
                  ? 'bg-[#eae1cf] border-[#d4c4a8] hover:bg-[#e0d6c0] text-[#c85a17]'
                  : (theme === 'olive' || theme === 'hunting')
                  ? 'bg-[#efebd9] border-[#d8d2c0] hover:bg-[#e8e4d2] text-[#556b2f]'
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-emerald-600'
              }`}
            >
              {units === 'imperial' ? '°F' : '°C'}
            </button>

            {/* Quick Theme Cycle */}
            <button
              onClick={onToggleTheme}
              title="Cycle theme (Standard / Olive / Hunter)"
              className={`p-1.5 sm:p-2 rounded-xl flex items-center justify-center border flex-shrink-0 transition-colors ${
                isDark
                  ? 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-amber-400'
                  : theme === 'hunting'
                  ? 'bg-[#eae1cf] border-[#d4c4a8] hover:bg-[#e0d6c0] text-[#c85a17]'
                  : (theme === 'olive' || theme === 'hunting')
                  ? 'bg-[#efebd9] border-[#d8d2c0] hover:bg-[#e8e4d2] text-[#556b2f]'
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-amber-600'
              }`}
            >
              <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            {/* Quick Search Box */}
            <div className="relative flex-1 max-w-[140px] sm:max-w-[220px] lg:max-w-[280px]" ref={searchContainerRef}>
              <div
                className={`flex items-center border rounded-xl px-2 py-1 sm:py-1.5 transition-all ${
                  isDark
                    ? 'bg-slate-900/[var(--card-opacity)] border-slate-800 focus-within:border-emerald-500'
: theme === 'hunting'
? 'bg-[#eae1cf] border-[#d4c4a8] focus-within:border-[#c85a17]'
                    : (theme === 'olive' || theme === 'hunting')
                    ? 'bg-[#efebd9] border-[#d8d2c0] focus-within:border-[#556b2f]'
                    : 'bg-slate-50 border-slate-200 focus-within:border-emerald-600'
                }`}
              >
                <Search className={`w-3 h-3 mr-1.5 flex-shrink-0 ${isDark ? 'text-slate-400' : theme === 'hunting' ? 'text-[#8b7355]' : (theme === 'olive' || theme === 'hunting') ? 'text-[#6e6a5e]' : 'text-slate-500'}`} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Search location..."
                  className={`w-full bg-transparent text-[11px] sm:text-xs focus:outline-none ${
                    isDark
                      ? 'text-white placeholder-slate-500'
                      : theme === 'hunting'
                      ? 'text-[#2a1b0e] placeholder-[#8b7355]'
                      : (theme === 'olive' || theme === 'hunting')
                      ? 'text-[#1e2e1b] placeholder-[#8c8675]'
                      : 'text-slate-900 placeholder-slate-400'
                  }`}
                />
                {isSearching && (
                  <div className={`w-3 h-3 border-2 border-t-transparent rounded-full animate-spin ml-1 flex-shrink-0 ${theme === 'hunting' ? 'border-[#c85a17]' : (theme === 'olive' || theme === 'hunting') ? 'border-[#556b2f]' : 'border-emerald-500'}`} />
                )}
              </div>

              {/* Search Dropdown Results */}
              {showDropdown && searchResults.length > 0 && (
                <div
                  className={`absolute top-full left-0 right-0 mt-1 border rounded-xl shadow-2xl overflow-hidden z-50 max-h-56 overflow-y-auto divide-y ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 divide-slate-800 text-slate-200'
                      : theme === 'hunting'
                      ? 'bg-[#f4eee1] border-[#d4c4a8] divide-[#e5dcc8] text-[#2a1b0e]'
                      : (theme === 'olive' || theme === 'hunting')
                      ? 'bg-[#f7f5ed] border-[#d8d2c0] divide-[#e5e0cf] text-[#1e2e1b]'
                      : 'bg-white border-slate-200 divide-slate-100 text-slate-800'
                  }`}
                >
                  {searchResults.map((loc, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        onSelectLocation(loc);
                        setShowDropdown(false);
                        setSearchQuery('');
                      }}
                      className={`w-full text-left px-3 py-2 transition-colors flex items-center gap-2 text-xs ${
                        isDark
                          ? 'hover:bg-emerald-950/50 hover:text-emerald-300'
                          : theme === 'hunting'
                          ? 'hover:bg-[#e8ddca] hover:text-[#c85a17]'
                          : (theme === 'olive' || theme === 'hunting')
                          ? 'hover:bg-[#e8e3d3] hover:text-[#2d4a27]'
                          : 'hover:bg-emerald-50 hover:text-emerald-800'
                      }`}
                    >
<MapPin className={`w-3 h-3 flex-shrink-0 ${theme === 'hunting' ? 'text-[#c85a17]' : (theme === 'olive' || theme === 'hunting') ? 'text-[#556b2f]' : 'text-emerald-500'}`} />
                      <div className="truncate">
                        <span className="font-semibold">{loc.name}</span>
                        <span className={`ml-1 text-[10px] ${isDark ? 'text-slate-400' : theme === 'hunting' ? 'text-[#8b7355]' : (theme === 'olive' || theme === 'hunting') ? 'text-[#6e6a5e]' : 'text-slate-500'}`}>
                          {loc.admin1 ? `${loc.admin1}, ` : ''}{loc.country}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Active Location Badge */}
            <div className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-xl border max-w-[130px] md:max-w-[180px] lg:max-w-[220px] flex-shrink-0 ${
              theme === 'hunting'
                ? 'bg-[#c85a17]/10 border-[#c85a17]/25'
                : (theme === 'olive' || theme === 'hunting')
                ? 'bg-[#556b2f]/10 border-[#556b2f]/25'
                : 'bg-emerald-500/10 border-emerald-500/20'
            }`}>
              <MapPin className={`w-3 h-3 flex-shrink-0 ${theme === 'hunting' ? 'text-[#c85a17]' : (theme === 'olive' || theme === 'hunting') ? 'text-[#556b2f]' : 'text-emerald-500'}`} />
              <span className={`text-[11px] font-bold truncate ${(theme === 'olive' || theme === 'hunting') ? 'text-[#2d4a27]' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {currentLocation.name}
              </span>

              {/* Set Default Button */}
              <button
                onClick={() => onSetDefaultLocation(currentLocation)}
                className={`p-0.5 rounded transition-colors ml-0.5 ${
                  isCurrentDefault
                    ? (theme === 'olive' || theme === 'hunting') ? 'text-[#556b2f]' : 'text-emerald-500'
                    : isDark
                    ? 'text-slate-500 hover:text-slate-300'
                    : (theme === 'olive' || theme === 'hunting')
                    ? 'text-[#8c8675] hover:text-[#1e2e1b]'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
                title={isCurrentDefault ? 'Default Starting Location' : 'Set as Default Location'}
              >
                <Home className={`w-2.5 h-2.5 ${isCurrentDefault ? 'fill-current' : ''}`} />
              </button>

              {/* Save Location Star */}
              <button
                onClick={() => onToggleFavorite(currentLocation)}
                className={`p-0.5 rounded transition-colors ${
                  isCurrentFav
                    ? 'text-amber-500'
                    : isDark
                    ? 'text-slate-500 hover:text-slate-300'
                    : (theme === 'olive' || theme === 'hunting')
                    ? 'text-[#8c8675] hover:text-[#1e2e1b]'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
                title={isCurrentFav ? 'Saved in Ground List' : 'Save Location'}
              >
                <Star className={`w-2.5 h-2.5 ${isCurrentFav ? 'fill-current' : ''}`} />
              </button>
            </div>
          </div>

          {/* Desktop separator between left controls and nav tabs */}
          <div className="hidden sm:block w-px self-stretch my-1.5 flex-shrink-0" style={{
            backgroundColor: isDark
              ? 'rgba(148,163,184,0.15)'
              : theme === 'hunting'
              ? 'rgba(42,27,14,0.1)'
              : theme === 'olive'
              ? 'rgba(30,46,27,0.1)'
              : 'rgba(148,163,184,0.2)',
          }} />

          {/* Right: Navigation Tabs (visible from sm / 640px+ desktop) */}
          <div className="hidden sm:flex items-center gap-1 flex-shrink-0 min-w-0">
            <nav className={`flex items-center gap-1 p-0.5 rounded-2xl border flex-shrink-0 ${
              isDark
                ? 'bg-slate-900/[var(--card-opacity)] border-slate-800'
                : (theme === 'olive' || theme === 'hunting')
                ? 'bg-[#e8e4d5] border-[#d4cebc]'
                : 'bg-slate-100 border-slate-200'
            }`}>
              <button
                onClick={() => onTabChange('dashboard')}
                className={`whitespace-nowrap px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 flex-1 min-w-0 ${
                  activeTab === 'dashboard' || activeTab === 'details'
                    ? (theme === 'olive' || theme === 'hunting') ? 'bg-[#556b2f] text-white shadow-md scale-105' : 'bg-emerald-600 text-white shadow-md scale-105'
                    : isDark
                    ? 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800/50'
                    : (theme === 'olive' || theme === 'hunting')
                    ? 'text-[#3d4f21] hover:text-[#556b2f] hover:bg-[#e0dcc8]/50'
                    : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50/50'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Dashboard</span>
              </button>

              <button
                onClick={() => onTabChange('map')}
                className={`whitespace-nowrap px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 flex-1 min-w-0 ${
                  activeTab === 'map'
                    ? (theme === 'olive' || theme === 'hunting') ? 'bg-[#556b2f] text-white shadow-md scale-105' : 'bg-emerald-600 text-white shadow-md scale-105'
                    : isDark
                    ? 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800/50'
                    : (theme === 'olive' || theme === 'hunting')
                    ? 'text-[#3d4f21] hover:text-[#556b2f] hover:bg-[#e0dcc8]/50'
                    : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50/50'
                }`}
              >
                <Map className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Map</span>
              </button>

              <button
                onClick={() => onTabChange('logs')}
                className={`whitespace-nowrap px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 flex-1 min-w-0 ${
                  activeTab === 'logs'
                    ? (theme === 'olive' || theme === 'hunting') ? 'bg-[#b87333] text-white shadow-md scale-105' : 'bg-amber-500 text-slate-950 shadow-md scale-105'
                    : isDark
                    ? 'text-slate-400 hover:text-amber-400 hover:bg-slate-800/50'
                    : (theme === 'olive' || theme === 'hunting')
                    ? 'text-[#3d4f21] hover:text-[#8b6914] hover:bg-[#f5eedb]/60'
                    : 'text-slate-600 hover:text-amber-600 hover:bg-amber-50/50'
                }`}
              >
                <ScrollText className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logs</span>
              </button>

              <button
                onClick={() => onTabChange('trailcams')}
                className={`whitespace-nowrap px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 flex-1 min-w-0 ${
                  activeTab === 'trailcams'
                    ? (theme === 'olive' || theme === 'hunting') ? 'bg-[#4a7fb5] text-white shadow-md scale-105' : 'bg-sky-500 text-white shadow-md scale-105'
                    : isDark
                    ? 'text-slate-400 hover:text-sky-400 hover:bg-slate-800/50'
                    : (theme === 'olive' || theme === 'hunting')
                    ? 'text-[#3d4f21] hover:text-[#3b6fa0] hover:bg-[#e8f0f8]/60'
                    : 'text-slate-600 hover:text-sky-600 hover:bg-sky-50/50'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Trail Cams</span>
              </button>

              <button
                onClick={() => onTabChange('settings')}
                className={`whitespace-nowrap px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 flex-1 min-w-0 ${
                  activeTab === 'settings'
                    ? isDark
                      ? 'bg-slate-700 text-slate-200 shadow-md scale-105'
                      : (theme === 'olive' || theme === 'hunting')
                      ? 'bg-[#d4cebc] text-[#2d4a27] shadow-md scale-105'
                      : 'bg-slate-200 text-slate-800 shadow-md scale-105'
                    : isDark
                    ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    : (theme === 'olive' || theme === 'hunting')
                    ? 'text-[#3d4f21] hover:text-[#1e2e1b] hover:bg-[#e0dcc8]/50'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Settings</span>
              </button>
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
};

