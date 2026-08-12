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
            {/* Logo — theme-aware inline SVG */}
            <div
              className="flex items-center cursor-pointer flex-shrink-0"
              onClick={() => {
                onTabChange('dashboard');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              <img
                src="./hunt-icon-120.png"
                alt="LetsHunt"
                className="h-9 sm:h-10 w-9 sm:w-10 rounded-lg object-cover shadow-md"
                draggable={false}
              />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="33.5 14 49 14.5"
                className="h-8 sm:h-9 w-auto ml-2"
                aria-label="LetsHunt"
              >
                {/* Text — theme-aware foreground */}
                <g
                  fill={
                    isDark
                      ? theme === 'hunting' ? '#e8dfd2' : '#ffffff'
                      : theme === 'hunting'
                      ? '#2a1b0e'
                      : theme === 'olive'
                      ? '#1e2e1b'
                      : '#0f172a'
                  }
                  fillOpacity="1"
                >
                  <g transform="translate(34.575233, 27.001982)">
                    <g><path d="M 10.46875 -2.09375 C 10.46875 -1.757812 10.484375 -1.488281 10.515625 -1.28125 C 10.546875 -1.082031 10.609375 -0.925781 10.703125 -0.8125 C 10.804688 -0.707031 10.945312 -0.632812 11.125 -0.59375 C 11.300781 -0.550781 11.535156 -0.523438 11.828125 -0.515625 L 11.828125 0 L 7.0625 0 L 7.0625 -0.515625 C 7.382812 -0.523438 7.640625 -0.550781 7.828125 -0.59375 C 8.023438 -0.632812 8.175781 -0.707031 8.28125 -0.8125 C 8.394531 -0.914062 8.46875 -1.0625 8.5 -1.25 C 8.53125 -1.445312 8.546875 -1.695312 8.546875 -2 L 8.546875 -4.71875 L 3.734375 -4.71875 L 3.734375 -2.09375 C 3.734375 -1.757812 3.75 -1.488281 3.78125 -1.28125 C 3.8125 -1.082031 3.878906 -0.925781 3.984375 -0.8125 C 4.085938 -0.707031 4.238281 -0.632812 4.4375 -0.59375 C 4.632812 -0.550781 4.894531 -0.523438 5.21875 -0.515625 L 5.21875 0 L 0.453125 0 L 0.453125 -0.515625 C 0.742188 -0.523438 0.976562 -0.550781 1.15625 -0.59375 C 1.34375 -0.632812 1.484375 -0.707031 1.578125 -0.8125 C 1.671875 -0.914062 1.734375 -1.0625 1.765625 -1.25 C 1.796875 -1.445312 1.8125 -1.695312 1.8125 -2 L 1.8125 -8.015625 C 1.8125 -8.316406 1.796875 -8.554688 1.765625 -8.734375 C 1.742188 -8.921875 1.6875 -9.066406 1.59375 -9.171875 C 1.507812 -9.285156 1.382812 -9.363281 1.21875 -9.40625 C 1.0625 -9.445312 0.851562 -9.472656 0.59375 -9.484375 L 0.59375 -10.015625 L 5.078125 -10.015625 L 5.078125 -9.484375 C 4.785156 -9.484375 4.550781 -9.457031 4.375 -9.40625 C 4.195312 -9.363281 4.0625 -9.285156 3.96875 -9.171875 C 3.875 -9.066406 3.8125 -8.910156 3.78125 -8.703125 C 3.75 -8.503906 3.734375 -8.242188 3.734375 -7.921875 L 3.734375 -5.53125 L 8.546875 -5.53125 L 8.546875 -8.015625 C 8.546875 -8.316406 8.53125 -8.554688 8.5 -8.734375 C 8.46875 -8.921875 8.398438 -9.066406 8.296875 -9.171875 C 8.203125 -9.285156 8.066406 -9.363281 7.890625 -9.40625 C 7.710938 -9.445312 7.476562 -9.472656 7.1875 -9.484375 L 7.1875 -10.015625 L 11.6875 -10.015625 L 11.6875 -9.484375 C 11.425781 -9.484375 11.210938 -9.457031 11.046875 -9.40625 C 10.890625 -9.363281 10.769531 -9.285156 10.6875 -9.171875 C 10.601562 -9.066406 10.546875 -8.910156 10.515625 -8.703125 C 10.484375 -8.503906 10.46875 -8.242188 10.46875 -7.921875 Z" /></g>
                  </g>
                  <g transform="translate(46.856471, 27.001982)">
                    <g><path d="M 9.84375 -4.03125 C 9.84375 -3.289062 9.757812 -2.660156 9.59375 -2.140625 C 9.4375 -1.617188 9.1875 -1.1875 8.84375 -0.84375 C 8.507812 -0.507812 8.078125 -0.265625 7.546875 -0.109375 C 7.015625 0.046875 6.375 0.125 5.625 0.125 C 4.226562 0.125 3.207031 -0.164062 2.5625 -0.75 C 1.914062 -1.332031 1.59375 -2.265625 1.59375 -3.546875 L 1.59375 -7.109375 C 1.59375 -7.453125 1.585938 -7.738281 1.578125 -7.96875 C 1.578125 -8.195312 1.566406 -8.390625 1.546875 -8.546875 C 1.523438 -8.703125 1.5 -8.828125 1.46875 -8.921875 C 1.445312 -9.023438 1.410156 -9.109375 1.359375 -9.171875 C 1.285156 -9.296875 1.175781 -9.378906 1.03125 -9.421875 C 0.882812 -9.460938 0.65625 -9.484375 0.34375 -9.484375 L 0.34375 -10.015625 L 5.015625 -10.015625 L 5.015625 -9.484375 C 4.648438 -9.484375 4.378906 -9.460938 4.203125 -9.421875 C 4.035156 -9.390625 3.90625 -9.316406 3.8125 -9.203125 C 3.75 -9.128906 3.695312 -9.039062 3.65625 -8.9375 C 3.613281 -8.84375 3.582031 -8.710938 3.5625 -8.546875 C 3.539062 -8.390625 3.523438 -8.195312 3.515625 -7.96875 C 3.515625 -7.738281 3.515625 -7.453125 3.515625 -7.109375 L 3.515625 -3.703125 C 3.515625 -2.710938 3.722656 -1.984375 4.140625 -1.515625 C 4.554688 -1.046875 5.203125 -0.8125 6.078125 -0.8125 C 7.867188 -0.8125 8.765625 -1.800781 8.765625 -3.78125 L 8.765625 -6.78125 C 8.765625 -7.144531 8.753906 -7.457031 8.734375 -7.71875 C 8.722656 -7.976562 8.703125 -8.195312 8.671875 -8.375 C 8.640625 -8.5625 8.597656 -8.710938 8.546875 -8.828125 C 8.503906 -8.953125 8.453125 -9.054688 8.390625 -9.140625 C 8.265625 -9.265625 8.101562 -9.351562 7.90625 -9.40625 C 7.71875 -9.457031 7.457031 -9.484375 7.125 -9.484375 L 7.125 -10.015625 L 11.34375 -10.015625 L 11.34375 -9.484375 C 11.019531 -9.484375 10.769531 -9.457031 10.59375 -9.40625 C 10.414062 -9.363281 10.28125 -9.285156 10.1875 -9.171875 C 10.125 -9.085938 10.066406 -8.984375 10.015625 -8.859375 C 9.972656 -8.734375 9.9375 -8.578125 9.90625 -8.390625 C 9.882812 -8.203125 9.867188 -7.976562 9.859375 -7.71875 C 9.847656 -7.457031 9.84375 -7.144531 9.84375 -6.78125 Z" /></g>
                  </g>
                  <g transform="translate(58.292963, 27.001982)">
                    <g><path d="M 8.703125 0.125 L 2.953125 -8.078125 L 2.90625 -8.078125 L 2.90625 -2.484375 C 2.90625 -2.046875 2.914062 -1.703125 2.9375 -1.453125 C 2.96875 -1.203125 3.03125 -1.003906 3.125 -0.859375 C 3.226562 -0.722656 3.367188 -0.632812 3.546875 -0.59375 C 3.734375 -0.550781 3.96875 -0.523438 4.25 -0.515625 L 4.25 0 L 0.390625 0 L 0.390625 -0.515625 C 0.710938 -0.523438 0.96875 -0.550781 1.15625 -0.59375 C 1.351562 -0.644531 1.503906 -0.734375 1.609375 -0.859375 C 1.722656 -0.992188 1.796875 -1.179688 1.828125 -1.421875 C 1.867188 -1.660156 1.890625 -1.984375 1.890625 -2.390625 L 1.890625 -7.625 C 1.890625 -7.976562 1.867188 -8.273438 1.828125 -8.515625 C 1.796875 -8.753906 1.734375 -8.941406 1.640625 -9.078125 C 1.546875 -9.222656 1.410156 -9.320312 1.234375 -9.375 C 1.054688 -9.4375 0.816406 -9.472656 0.515625 -9.484375 L 0.515625 -10.015625 L 4.140625 -10.015625 L 9.390625 -2.5 L 9.4375 -2.5 L 9.4375 -7.53125 C 9.4375 -7.945312 9.421875 -8.285156 9.390625 -8.546875 C 9.359375 -8.804688 9.289062 -9.003906 9.1875 -9.140625 C 9.09375 -9.273438 8.957031 -9.363281 8.78125 -9.40625 C 8.601562 -9.457031 8.375 -9.484375 8.09375 -9.484375 L 8.09375 -10.015625 L 11.953125 -10.015625 L 11.953125 -9.484375 C 11.628906 -9.484375 11.367188 -9.457031 11.171875 -9.40625 C 10.972656 -9.351562 10.820312 -9.257812 10.71875 -9.125 C 10.613281 -9 10.539062 -8.816406 10.5 -8.578125 C 10.46875 -8.335938 10.453125 -8.019531 10.453125 -7.625 L 10.453125 0.125 Z" /></g>
                  </g>
                  <g transform="translate(70.509221, 27.001982)">
                    <g><path d="M 10.59375 -7.15625 L 10.03125 -7.15625 C 10.007812 -7.570312 9.945312 -7.921875 9.84375 -8.203125 C 9.75 -8.484375 9.609375 -8.707031 9.421875 -8.875 C 9.242188 -9.050781 9.023438 -9.171875 8.765625 -9.234375 C 8.503906 -9.296875 8.203125 -9.328125 7.859375 -9.328125 C 7.515625 -9.328125 7.238281 -9.320312 7.03125 -9.3125 C 6.832031 -9.300781 6.675781 -9.28125 6.5625 -9.25 C 6.457031 -9.21875 6.390625 -9.175781 6.359375 -9.125 C 6.328125 -9.070312 6.3125 -9.007812 6.3125 -8.9375 L 6.3125 -2.125 C 6.3125 -1.84375 6.328125 -1.601562 6.359375 -1.40625 C 6.398438 -1.207031 6.476562 -1.046875 6.59375 -0.921875 C 6.71875 -0.796875 6.894531 -0.695312 7.125 -0.625 C 7.363281 -0.5625 7.675781 -0.523438 8.0625 -0.515625 L 8.0625 0 L 2.609375 0 L 2.609375 -0.515625 C 3.003906 -0.523438 3.316406 -0.5625 3.546875 -0.625 C 3.785156 -0.695312 3.96875 -0.796875 4.09375 -0.921875 C 4.21875 -1.046875 4.296875 -1.207031 4.328125 -1.40625 C 4.367188 -1.601562 4.390625 -1.84375 4.390625 -2.125 L 4.390625 -8.9375 C 4.390625 -9.007812 4.375 -9.070312 4.34375 -9.125 C 4.3125 -9.175781 4.25 -9.21875 4.15625 -9.25 C 4.0625 -9.28125 3.925781 -9.300781 3.75 -9.3125 C 3.570312 -9.320312 3.34375 -9.328125 3.0625 -9.328125 C 2.75 -9.328125 2.445312 -9.3125 2.15625 -9.28125 C 1.875 -9.257812 1.625 -9.175781 1.40625 -9.03125 C 1.1875 -8.882812 1.007812 -8.664062 0.875 -8.375 C 0.738281 -8.082031 0.664062 -7.675781 0.65625 -7.15625 L 0.15625 -7.15625 L 0.28125 -10.015625 L 10.46875 -10.015625 Z" /></g>
                  </g>
                </g>
              </svg>
            </div>

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

