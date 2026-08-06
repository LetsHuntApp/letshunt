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
      className={`sticky top-0 z-50 px-3 sm:px-6 py-1.5 transition-colors duration-200 border-b ${
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 90 45"
                className="h-12 sm:h-14 w-auto -my-3"
                aria-label="LetsHunt"
              >
                {/* Deer icon — theme accent color */}
                <g
                  fill={
                    theme === 'hunting'
                      ? '#c85a17'
                      : theme === 'olive'
                      ? '#556b2f'
                      : '#10b981'
                  }
                  fillOpacity="1"
                >
                  <g transform="translate(7.546462, 23.999007)">
                    <g><path d="M -2.625 6.703125 C -3.09375 6.265625 -3.40625 5.75 -3.5625 5.15625 C -3.726562 4.570312 -3.757812 3.992188 -3.65625 3.421875 C -3.5625 2.847656 -3.390625 2.375 -3.140625 2 C -3.097656 2.800781 -2.753906 3.398438 -2.109375 3.796875 C -1.460938 4.191406 -0.5625 4.410156 0.59375 4.453125 C 1.757812 4.503906 3.140625 4.40625 4.734375 4.15625 C 4.585938 4.09375 4.429688 4.003906 4.265625 3.890625 C 4.109375 3.773438 3.976562 3.648438 3.875 3.515625 C 3.96875 2.859375 4.203125 2.046875 4.578125 1.078125 C 4.960938 0.117188 5.445312 -0.925781 6.03125 -2.0625 C 6.613281 -3.207031 7.257812 -4.390625 7.96875 -5.609375 C 8.6875 -6.828125 9.421875 -8.019531 10.171875 -9.1875 C 10.929688 -10.363281 11.675781 -11.460938 12.40625 -12.484375 C 13.144531 -13.503906 13.832031 -14.390625 14.46875 -15.140625 C 15.113281 -15.898438 15.65625 -16.460938 16.09375 -16.828125 C 16.769531 -16.890625 17.34375 -16.800781 17.8125 -16.5625 C 18.289062 -16.332031 18.765625 -15.898438 19.234375 -15.265625 C 18.972656 -15.253906 18.570312 -15.03125 18.03125 -14.59375 C 17.5 -14.164062 16.882812 -13.570312 16.1875 -12.8125 C 15.488281 -12.050781 14.742188 -11.164062 13.953125 -10.15625 C 13.160156 -9.15625 12.363281 -8.070312 11.5625 -6.90625 C 10.757812 -5.738281 9.984375 -4.535156 9.234375 -3.296875 C 8.492188 -2.054688 7.828125 -0.820312 7.234375 0.40625 C 6.640625 1.644531 6.160156 2.832031 5.796875 3.96875 C 8.035156 3.550781 9.953125 3.222656 11.546875 2.984375 C 13.148438 2.742188 14.488281 2.5625 15.5625 2.4375 C 16.632812 2.320312 17.5 2.253906 18.15625 2.234375 C 18.8125 2.210938 19.300781 2.222656 19.625 2.265625 C 19.957031 2.304688 20.1875 2.363281 20.3125 2.4375 C 20.71875 2.875 20.960938 3.332031 21.046875 3.8125 C 21.140625 4.300781 21.15625 4.738281 21.09375 5.125 C 21.03125 5.507812 20.953125 5.789062 20.859375 5.96875 C 20.648438 5.1875 19.707031 4.773438 18.03125 4.734375 C 16.351562 4.691406 13.769531 4.992188 10.28125 5.640625 C 8.289062 6.015625 6.570312 6.3125 5.125 6.53125 C 3.675781 6.75 2.445312 6.90625 1.4375 7 C 0.425781 7.09375 -0.398438 7.109375 -1.046875 7.046875 C -1.703125 6.992188 -2.226562 6.878906 -2.625 6.703125 Z" /></g>
                  </g>
                  <g transform="translate(20.498061, 23.999007)">
                    <g><path d="M 0.828125 0.921875 C 0.597656 0.878906 0.300781 0.734375 -0.0625 0.484375 C -0.425781 0.234375 -0.691406 -0.0546875 -0.859375 -0.390625 C -0.867188 -1.316406 -0.691406 -2.257812 -0.328125 -3.21875 C 0.0234375 -4.1875 0.566406 -5.101562 1.296875 -5.96875 C 2.035156 -6.832031 2.976562 -7.550781 4.125 -8.125 C 4.507812 -8.019531 4.863281 -7.847656 5.1875 -7.609375 C 5.507812 -7.378906 5.773438 -7.15625 5.984375 -6.9375 C 6.191406 -6.71875 6.316406 -6.566406 6.359375 -6.484375 C 5.984375 -5.941406 5.609375 -5.390625 5.234375 -4.828125 C 4.859375 -4.273438 4.46875 -3.773438 4.0625 -3.328125 C 3.65625 -2.878906 3.226562 -2.539062 2.78125 -2.3125 C 2.34375 -2.082031 1.875 -2.03125 1.375 -2.15625 C 1.289062 -1.851562 1.226562 -1.566406 1.1875 -1.296875 C 1.15625 -1.023438 1.148438 -0.773438 1.171875 -0.546875 C 1.703125 -0.753906 2.238281 -1.046875 2.78125 -1.421875 C 3.320312 -1.804688 3.828125 -2.21875 4.296875 -2.65625 C 4.773438 -3.09375 5.191406 -3.507812 5.546875 -3.90625 C 5.898438 -4.3125 6.164062 -4.640625 6.34375 -4.890625 C 6.625 -5.242188 6.804688 -5.382812 6.890625 -5.3125 C 6.972656 -5.238281 6.898438 -5.023438 6.671875 -4.671875 C 6.535156 -4.441406 6.28125 -4.078125 5.90625 -3.578125 C 5.53125 -3.085938 5.078125 -2.550781 4.546875 -1.96875 C 4.015625 -1.394531 3.425781 -0.847656 2.78125 -0.328125 C 2.144531 0.191406 1.492188 0.609375 0.828125 0.921875 Z M 1.5625 -2.71875 C 2.039062 -2.96875 2.453125 -3.320312 2.796875 -3.78125 C 3.148438 -4.25 3.5 -4.757812 3.84375 -5.3125 C 4.195312 -5.875 4.597656 -6.398438 5.046875 -6.890625 C 4.515625 -6.722656 4.019531 -6.414062 3.5625 -5.96875 C 3.113281 -5.519531 2.71875 -5.007812 2.375 -4.4375 C 2.039062 -3.863281 1.769531 -3.289062 1.5625 -2.71875 Z" /></g>
                  </g>
                  <g transform="translate(26.319006, 23.999007)">
                    <g><path d="M 0.015625 0.5625 C -0.285156 0.445312 -0.539062 0.269531 -0.75 0.03125 C -0.96875 -0.195312 -1.109375 -0.398438 -1.171875 -0.578125 C -0.972656 -1.492188 -0.648438 -2.453125 -0.203125 -3.453125 C 0.234375 -4.460938 0.738281 -5.460938 1.3125 -6.453125 C 1.894531 -7.441406 2.476562 -8.382812 3.0625 -9.28125 C 2.0625 -9.164062 1.238281 -9.054688 0.59375 -8.953125 C -0.0507812 -8.859375 -0.566406 -8.863281 -0.953125 -8.96875 C -1.410156 -9.09375 -1.789062 -9.191406 -2.09375 -9.265625 C -2.40625 -9.335938 -2.800781 -9.34375 -3.28125 -9.28125 C -3.757812 -9.21875 -3.988281 -9.253906 -3.96875 -9.390625 C -3.945312 -9.523438 -3.707031 -9.640625 -3.25 -9.734375 C -2.832031 -9.828125 -2.242188 -9.945312 -1.484375 -10.09375 C -0.734375 -10.238281 0.128906 -10.382812 1.109375 -10.53125 C 2.085938 -10.6875 3.113281 -10.816406 4.1875 -10.921875 C 4.820312 -11.847656 5.347656 -12.625 5.765625 -13.25 C 6.191406 -13.882812 6.390625 -14.269531 6.359375 -14.40625 C 6.765625 -14.4375 7.113281 -14.378906 7.40625 -14.234375 C 7.707031 -14.085938 7.929688 -13.910156 8.078125 -13.703125 C 8.234375 -13.492188 8.304688 -13.300781 8.296875 -13.125 C 8.015625 -12.875 7.710938 -12.570312 7.390625 -12.21875 C 7.066406 -11.875 6.742188 -11.503906 6.421875 -11.109375 L 7.078125 -11.125 C 8.140625 -11.164062 9.179688 -11.179688 10.203125 -11.171875 C 11.222656 -11.171875 12.171875 -11.148438 13.046875 -11.109375 C 13.929688 -11.066406 14.679688 -11.019531 15.296875 -10.96875 C 15.910156 -10.914062 16.34375 -10.863281 16.59375 -10.8125 C 17.1875 -10.476562 17.644531 -10.066406 17.96875 -9.578125 C 18.289062 -9.097656 18.378906 -8.691406 18.234375 -8.359375 C 18.140625 -8.578125 17.800781 -8.765625 17.21875 -8.921875 C 16.632812 -9.078125 15.890625 -9.203125 14.984375 -9.296875 C 14.085938 -9.390625 13.082031 -9.457031 11.96875 -9.5 C 10.863281 -9.539062 9.722656 -9.554688 8.546875 -9.546875 C 7.378906 -9.535156 6.25 -9.492188 5.15625 -9.421875 C 4.601562 -8.660156 4.066406 -7.863281 3.546875 -7.03125 C 3.023438 -6.207031 2.554688 -5.414062 2.140625 -4.65625 C 1.722656 -3.894531 1.382812 -3.207031 1.125 -2.59375 C 0.875 -1.988281 0.726562 -1.503906 0.6875 -1.140625 C 1.03125 -1.503906 1.382812 -1.914062 1.75 -2.375 C 2.125 -2.832031 2.46875 -3.269531 2.78125 -3.6875 C 3.09375 -4.113281 3.332031 -4.441406 3.5 -4.671875 C 3.664062 -4.910156 3.8125 -5.0625 3.9375 -5.125 C 4.0625 -5.1875 4.117188 -5.144531 4.109375 -5 C 4.097656 -4.851562 3.96875 -4.59375 3.71875 -4.21875 C 3.539062 -3.925781 3.300781 -3.554688 3 -3.109375 C 2.707031 -2.660156 2.382812 -2.191406 2.03125 -1.703125 C 1.675781 -1.222656 1.320312 -0.773438 0.96875 -0.359375 C 0.625 0.046875 0.304688 0.351562 0.015625 0.5625 Z" /></g>
                  </g>
                  <g transform="translate(29.437372, 23.999007)">
                    <g><path d="M 1.421875 0.921875 C 1.128906 1.148438 0.820312 1.257812 0.5 1.25 C 0.175781 1.25 -0.117188 1.15625 -0.390625 0.96875 C -0.671875 0.789062 -0.894531 0.566406 -1.0625 0.296875 C -1.226562 0.0234375 -1.289062 -0.238281 -1.25 -0.5 C -1.207031 -0.800781 -1.09375 -1.117188 -0.90625 -1.453125 C -0.71875 -1.785156 -0.476562 -2.101562 -0.1875 -2.40625 C 0.101562 -2.71875 0.410156 -2.96875 0.734375 -3.15625 C 0.628906 -3.695312 0.550781 -4.15625 0.5 -4.53125 C 0.457031 -4.90625 0.503906 -5.359375 0.640625 -5.890625 C 0.753906 -6.328125 0.984375 -6.753906 1.328125 -7.171875 C 1.671875 -7.585938 2.054688 -7.929688 2.484375 -8.203125 C 2.921875 -8.484375 3.320312 -8.625 3.6875 -8.625 C 3.914062 -8.539062 4.113281 -8.375 4.28125 -8.125 C 4.457031 -7.875 4.59375 -7.613281 4.6875 -7.34375 C 4.78125 -7.082031 4.804688 -6.859375 4.765625 -6.671875 C 4.734375 -6.535156 4.660156 -6.332031 4.546875 -6.0625 C 4.441406 -5.789062 4.296875 -5.519531 4.109375 -5.25 C 3.921875 -4.988281 3.691406 -4.789062 3.421875 -4.65625 C 3.160156 -4.519531 2.875 -4.515625 2.5625 -4.640625 C 2.769531 -4.742188 2.976562 -4.925781 3.1875 -5.1875 C 3.40625 -5.445312 3.59375 -5.71875 3.75 -6 C 3.914062 -6.28125 4.003906 -6.503906 4.015625 -6.671875 C 3.523438 -6.566406 3.113281 -6.320312 2.78125 -5.9375 C 2.445312 -5.550781 2.210938 -5.113281 2.078125 -4.625 C 1.953125 -4.132812 1.9375 -3.664062 2.03125 -3.21875 C 2.132812 -2.78125 2.207031 -2.300781 2.25 -1.78125 C 2.289062 -1.257812 2.253906 -0.757812 2.140625 -0.28125 C 2.023438 0.195312 1.785156 0.597656 1.421875 0.921875 Z M -0.109375 -0.703125 C 0.015625 -0.566406 0.164062 -0.519531 0.34375 -0.5625 C 0.519531 -0.613281 0.664062 -0.78125 0.78125 -1.0625 C 0.894531 -1.34375 0.921875 -1.75 0.859375 -2.28125 L 0.8125 -2.6875 C 0.34375 -2.375 0.0351562 -2.015625 -0.109375 -1.609375 C -0.253906 -1.203125 -0.253906 -0.898438 -0.109375 -0.703125 Z" /></g>
                  </g>
                </g>
                {/* Text — theme-aware foreground */}
                <g
                  fill={
                    isDark
                      ? '#ffffff'
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
            <div className="relative flex-1 max-w-[140px] sm:max-w-[220px]" ref={searchContainerRef}>
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

          {/* Right: Navigation Tabs */}
          <div className="hidden md:flex items-center gap-1 flex-shrink-0 min-w-0">
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
                <ScrollText className="w-3.5 h-3.5 text-amber-500" />
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
                <Camera className="w-3.5 h-3.5 text-sky-400" />
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

