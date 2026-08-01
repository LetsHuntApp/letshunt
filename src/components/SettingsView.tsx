import React, { useState, useEffect, useRef } from 'react';
import { Location, UnitSystem, ThemeMode, PressureUnit } from '../types';
import { searchLocations } from '../services/weatherService';
import {
  NotificationPrefs,
  getPermissionState,
  isNotificationSupported,
  requestNotificationPermission,
  sendTestNotification,
} from '../services/notificationService';
import {
  Settings,
  MapPin,
  Home,
  Star,
  Trash2,
  Plus,
  Search,
  Compass,
  Thermometer,
  Moon,
  Sun,
  BookOpen,
  Smartphone,
  Check,
  ShieldCheck,
  Target,
  Globe,
  Radio,
  Gauge,
  Image as ImageIcon,
  BellRing,
  Snowflake,
  CloudLightning,
  CloudRain,
  Wind,
  Zap,
} from 'lucide-react';

interface SettingsViewProps {
  currentLocation: Location;
  onSelectLocation: (loc: Location) => void;
  defaultLocation: Location;
  onSetDefaultLocation: (loc: Location) => void;
  units: UnitSystem;
  onToggleUnits: () => void;
  setUnits: (u: UnitSystem) => void;
  pressureUnit: PressureUnit;
  setPressureUnit: (p: PressureUnit) => void;
  theme: ThemeMode;
  hasCustomBackground?: boolean;
  onToggleTheme: () => void;
  setTheme: (t: ThemeMode) => void;
  targetSpecies: string;
  onSelectSpecies: (species: string) => void;
  favorites: Location[];
  onToggleFavorite: (loc: Location) => void;
  onOpenGuide: () => void;
  onOpenPwaModal: () => void;
  showToast: (msg: string) => void;
  onSwitchToDashboard: () => void;
  customBackground: string | null;
  onSetCustomBackground: (url: string | null) => void;
  customBackgroundOpacity?: number;
  onSetCustomBackgroundOpacity?: (opacity: number) => void;
  customBackgroundBlur?: number;
  onSetCustomBackgroundBlur?: (blur: number) => void;
  notificationPrefs: NotificationPrefs;
  onNotificationPrefsChange: (prefs: NotificationPrefs) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentLocation,
  onSelectLocation,
  defaultLocation,
  onSetDefaultLocation,
  units,
  setUnits,
  pressureUnit,
  setPressureUnit,
  theme,
  hasCustomBackground = false,
  setTheme,
  targetSpecies,
  onSelectSpecies,
  favorites,
  onToggleFavorite,
  onOpenGuide,
  onOpenPwaModal,
  showToast,
  onSwitchToDashboard,
  customBackground,
  onSetCustomBackground,
  customBackgroundOpacity = 90,
  onSetCustomBackgroundOpacity,
  customBackgroundBlur = 12,
  onSetCustomBackgroundBlur,
  notificationPrefs,
  onNotificationPrefsChange,
}) => {
  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>(() => getPermissionState());
  const supported = isNotificationSupported();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const isDark = theme === 'dark';

  // Search debounced
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

  // Click outside dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keep permission state in sync if the user changes it in browser settings mid-session
  useEffect(() => {
    const syncPermission = () => setPermissionState(getPermissionState());
    window.addEventListener('focus', syncPermission);
    return () => window.removeEventListener('focus', syncPermission);
  }, []);

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const gpsLocation: Location = {
          name: 'My GPS Location',
          admin1: `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`,
          country: 'Current Position',
          latitude,
          longitude,
        };
        onSelectLocation(gpsLocation);
        setIsLocating(false);
        showToast('Updated location using GPS coordinates');
      },
      (error) => {
        console.warn('GPS position request notice:', error?.message || error);
        setIsLocating(false);
        showToast('Could not access GPS position. Please select manually.');
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  };

  const speciesOptions = [
    { name: 'Whitetail Deer', emoji: '🦌', desc: 'Optimized for thermal ridge funnels, oak flats & rub lines' },
    { name: 'Mule Deer', emoji: '🏔️', desc: 'Tuned for glassing coulees, alpine basins & high-country draws' },
    { name: 'Elk', emoji: '🌲', desc: 'Configured for timber benches, wallows & bugling corridors' },
  ];

  const alertRows: { key: keyof Pick<NotificationPrefs, 'coldFront' | 'weatherFront' | 'rainBreak' | 'primeDay' | 'severeWeather'>; icon: React.ComponentType<{ className?: string }>; label: string; desc: string }[] = [
    { key: 'coldFront', icon: Snowflake, label: 'Cold Fronts', desc: 'Sharp 24h temperature drops (~9°F / 5°C)' },
    { key: 'weatherFront', icon: Wind, label: 'Weather Fronts (Baro Shift)', desc: 'Rapid falling or rising barometric pressure' },
    { key: 'rainBreak', icon: CloudRain, label: 'Breaks in the Rain', desc: 'Dry windows right after rain trigger feeding surges' },
    { key: 'primeDay', icon: Zap, label: 'Prime Hunting Days', desc: 'Excellent (90+) movement rating days' },
    { key: 'severeWeather', icon: CloudLightning, label: 'Severe Weather', desc: 'Heavy rain & thunderstorm warnings' },
  ];

  const renderToggle = (checked: boolean, onChange: (v: boolean) => void, disabled = false) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
        checked ? 'bg-emerald-500' : disabled ? (isDark ? 'bg-slate-800' : 'bg-slate-200') : isDark ? 'bg-slate-700' : 'bg-slate-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );

  const permissionLabel = !supported
    ? 'Not supported on this browser'
    : permissionState === 'granted'
    ? 'Permission granted — alerts active'
    : permissionState === 'denied'
    ? 'Blocked by browser — enable in site settings'
    : 'Tap Enable and allow notifications in the browser prompt';

  const ensurePermissionGranted = async (): Promise<NotificationPermission | 'unsupported'> => {
    let perm = getPermissionState();
    if (perm !== 'granted') {
      perm = await requestNotificationPermission();
      setPermissionState(perm);
    }
    return perm;
  };

  const handleMasterToggle = async (next: boolean) => {
    if (!next) {
      onNotificationPrefsChange({ ...notificationPrefs, enabled: false });
      showToast('Weather alerts turned off.');
      return;
    }

    const perm = await ensurePermissionGranted();

    if (perm === 'granted') {
      onNotificationPrefsChange({ ...notificationPrefs, enabled: true });
      showToast('Weather alerts enabled. You will be notified of cold fronts, front shifts & rain breaks.');
    } else if (perm === 'denied') {
      showToast('Notifications are blocked by the browser. Enable them in your site settings.');
    } else {
      showToast('Grant notification permission in the browser prompt to enable alerts.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-12">
      {/* Top Banner Header */}
      <div className={`p-5 sm:p-6 rounded-3xl border shadow-lg ${isDark ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800' : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shadow-sm flex-shrink-0">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h1 className={`text-xl sm:text-2xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                App Settings
              </h1>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Manage hunting grounds, default location, unit preferences, and species target.
              </p>
            </div>
          </div>

          <button
            onClick={onSwitchToDashboard}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-2 self-start sm:self-auto"
          >
            <span>Back to Dashboard</span>
          </button>
            </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Section 1: Location & Hunting Grounds Management */}
        <div className={`p-5 sm:p-6 rounded-3xl border space-y-5 ${isDark ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800' : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 shadow-sm'}`}>
          <div className="flex items-center gap-2 pb-3 border-b border-slate-700/30">
            <MapPin className="w-5 h-5 text-emerald-500" />
            <h2 className={`text-base font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Hunting Grounds & Default Location
            </h2>
          </div>

          {/* Active & Default Location Card */}
          <div className={`p-4 rounded-2xl border space-y-3 ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Home className="w-3.5 h-3.5 text-emerald-500" />
              Default Starting Ground
            </div>

            <div className="flex items-center justify-between gap-2">
              <div>
                <div className={`text-sm font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {defaultLocation.name}
                </div>
                <div className="text-xs text-slate-500 truncate">
                  {defaultLocation.admin1 ? `${defaultLocation.admin1}, ` : ''}{defaultLocation.country}
                </div>
              </div>

              <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-full text-[10px] font-black uppercase tracking-wider">
                Default
              </span>
            </div>
          </div>

          {/* Add / Search New Location */}
          <div className="space-y-2">
            <label className={`block text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Search & Add New Hunting Location
            </label>

            <div className="relative" ref={searchContainerRef}>
              <div
                className={`flex items-center border rounded-xl px-3.5 py-2.5 transition-all ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 focus-within:border-emerald-500'
                    : 'bg-slate-100 border-slate-200 focus-within:border-emerald-600'
                }`}
              >
                <Search className={`w-4 h-4 mr-2 flex-shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Type city, county, or zip code..."
                  className={`w-full bg-transparent text-xs focus:outline-none ${
                    isDark ? 'text-white placeholder-slate-500' : 'text-slate-900 placeholder-slate-400'
                  }`}
                />
                {isSearching ? (
                  <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin ml-2 flex-shrink-0" />
                ) : (
                  <button
                    onClick={handleGetCurrentLocation}
                    disabled={isLocating}
                    className={`ml-1 px-2.5 py-1 rounded-lg flex items-center gap-1 text-[10px] font-bold uppercase transition-colors ${
                      isDark
                        ? 'bg-emerald-950/80 text-emerald-400 hover:bg-emerald-900 border border-emerald-800/60'
                        : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300'
                    }`}
                  >
                    <Compass className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin text-emerald-500' : ''}`} />
                    <span>GPS</span>
                  </button>
                )}
              </div>

              {/* Search Dropdown Results */}
              {showDropdown && searchResults.length > 0 && (
                <div
                  className={`absolute top-full left-0 right-0 mt-1.5 border rounded-xl shadow-2xl overflow-hidden z-50 max-h-56 overflow-y-auto divide-y ${
                    isDark ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-700 divide-slate-800 text-slate-200' : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 divide-slate-100 text-slate-800'
                  }`}
                >
                  {searchResults.map((loc, idx) => (
                    <div
                      key={idx}
                      className={`px-3.5 py-2.5 transition-colors flex items-center justify-between text-xs ${
                        isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="font-extrabold">{loc.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {loc.admin1 ? `${loc.admin1}, ` : ''}{loc.country}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            onSelectLocation(loc);
                            setShowDropdown(false);
                            setSearchQuery('');
                            showToast(`Selected ${loc.name}`);
                          }}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-black uppercase tracking-wider"
                        >
                          Select
                        </button>
                        <button
                          onClick={() => {
                            onToggleFavorite(loc);
                            setShowDropdown(false);
                            setSearchQuery('');
                          }}
                          className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30"
                          title="Save to Favorites"
                        >
                          <Star className="w-3.5 h-3.5 fill-amber-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Saved Grounds List */}
          <div className="space-y-2 pt-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
              <span>Saved Hunting Grounds ({favorites.length})</span>
            </div>

            {favorites.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2">No saved hunting grounds yet. Search above to add.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {favorites.map((fav, i) => {
                  const isCurrentActive =
                    Math.abs(fav.latitude - currentLocation.latitude) < 0.01 &&
                    Math.abs(fav.longitude - currentLocation.longitude) < 0.01;

                  const isCurrentDefault =
                    Math.abs(fav.latitude - defaultLocation.latitude) < 0.01 &&
                    Math.abs(fav.longitude - defaultLocation.longitude) < 0.01;

                  return (
                    <div
                      key={i}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                        isCurrentActive
                          ? isDark
                            ? 'bg-emerald-950/40 border-emerald-500/40'
                            : 'bg-emerald-50 border-emerald-300'
                          : isDark
                          ? 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
                          : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-extrabold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {fav.name}
                          </span>
                          {isCurrentActive && (
                            <span className="px-1.5 py-0.2 bg-emerald-500 text-slate-950 rounded font-black text-[9px] uppercase">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {fav.admin1 ? `${fav.admin1}, ` : ''}{fav.country}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {/* Select as active */}
                        <button
                          onClick={() => {
                            onSelectLocation(fav);
                            showToast(`Switched active location to "${fav.name}"`);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase transition-all ${
                            isCurrentActive
                              ? 'bg-emerald-500 text-slate-950'
                              : isDark
                              ? 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                              : 'bg-slate-200 text-slate-800 hover:bg-slate-300'
                          }`}
                        >
                          {isCurrentActive ? 'Active' : 'Load'}
                        </button>

                        {/* Set as Default */}
                        <button
                          onClick={() => onSetDefaultLocation(fav)}
                          className={`p-1.5 rounded-lg border transition-all ${
                            isCurrentDefault
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                              : isDark
                              ? 'bg-slate-900 text-slate-400 hover:text-slate-200 border-slate-800'
                              : 'bg-slate-100 text-slate-500 hover:text-slate-900 border-slate-200'
                          }`}
                          title={isCurrentDefault ? 'Default Starting Location' : 'Set as Default'}
                        >
                          <Home className={`w-3.5 h-3.5 ${isCurrentDefault ? 'fill-current' : ''}`} />
                        </button>

                        {/* Delete from Saved */}
                        <button
                          onClick={() => onToggleFavorite(fav)}
                          className={`p-1.5 rounded-lg border transition-all ${
                            isDark
                              ? 'bg-slate-900 text-rose-400 hover:bg-rose-950/50 border-slate-800'
                              : 'bg-slate-100 text-rose-600 hover:bg-rose-50 border-slate-200'
                          }`}
                          title="Remove from saved grounds"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Preferences, Units & Species */}
        <div className="space-y-6">
          {/* Push Notifications & Weather Alerts Card */}
          <div className={`p-5 sm:p-6 rounded-3xl border space-y-4 ${isDark ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800' : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 shadow-sm'}`}>
            <div className="flex items-center gap-2 pb-3 border-b border-slate-700/30">
              <BellRing className="w-5 h-5 text-emerald-500" />
              <h2 className={`text-base font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Push Notifications & Weather Alerts
              </h2>
            </div>

            <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Get alerted when conditions move deer — cold fronts, barometric front shifts, breaks in the rain,
              and prime hunting days. Alerts fire while LetsHunt is open, including as an installed app running
              in the background. On Android, also allow notifications for LetsHunt in your device Settings.
            </p>

            {/* Master toggle */}
            <div
              className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="min-w-0">
                <div className={`text-xs font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Enable Push Notifications
                </div>
                <div className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{permissionLabel}</div>
              </div>
              {renderToggle(notificationPrefs.enabled, handleMasterToggle, !supported || permissionState === 'denied')}
            </div>

            {/* Event-type toggles */}
            <div className={`space-y-1 rounded-2xl border divide-y ${isDark ? 'border-slate-800 divide-slate-800/70' : 'border-slate-200 divide-slate-100'}`}>
              {alertRows.map((row) => {
                const Icon = row.icon;
                const checked = notificationPrefs[row.key];
                return (
                  <div key={row.key} className="flex items-center justify-between gap-3 px-3.5 py-3">
                    <div className="min-w-0 flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 flex-shrink-0 ${checked ? 'text-emerald-500' : isDark ? 'text-slate-600' : 'text-slate-400'}`} />
                      <div className="min-w-0">
                        <div className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{row.label}</div>
                        <div className="text-[10px] text-slate-500 truncate">{row.desc}</div>
                      </div>
                    </div>
                    {renderToggle(checked, (v) => onNotificationPrefsChange({ ...notificationPrefs, [row.key]: v }), !notificationPrefs.enabled)}
                  </div>
                );
              })}
            </div>

            {/* Lead time selector */}
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Alert Lead Time
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {[24, 48, 72].map((hours) => (
                  <button
                    key={hours}
                    disabled={!notificationPrefs.enabled}
                    onClick={() => onNotificationPrefsChange({ ...notificationPrefs, leadTimeHours: hours })}
                    className={`py-2 rounded-xl border text-xs font-black transition-all flex flex-col items-center ${
                      notificationPrefs.leadTimeHours === hours
                        ? isDark
                          ? 'bg-emerald-950/50 border-emerald-500/60 ring-2 ring-emerald-500/30 text-white'
                          : 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-500/20 text-slate-900'
                        : notificationPrefs.enabled
                        ? isDark
                          ? 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                        : isDark
                        ? 'bg-slate-950/40 border-slate-800 text-slate-600 opacity-60'
                        : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60'
                    }`}
                  >
                    <span>{hours}h</span>
                    <span className="text-[9px] font-semibold text-slate-500">{hours <= 24 ? 'Today & tomorrow' : hours <= 48 ? 'Next 2 days' : 'Next 3 days'}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Test button */}
            <button
              onClick={async () => {
                let sent = await sendTestNotification();
                let perm = permissionState;
                if (!sent && supported && perm !== 'denied') {
                  perm = await ensurePermissionGranted();
                  if (perm === 'granted') {
                    sent = await sendTestNotification();
                    onNotificationPrefsChange({ ...notificationPrefs, enabled: true });
                  }
                }
                if (sent) {
                  showToast('Test notification sent!');
                } else if (perm === 'denied') {
                  showToast('Notifications are blocked by the browser. Enable them in your site settings.');
                } else {
                  showToast('Grant notification permission to receive test alerts.');
                }
              }}
              disabled={!supported || permissionState === 'denied'}
              className={`w-full py-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-black transition-all ${
                isDark ? 'bg-slate-950/60 border-slate-800 text-slate-200 hover:border-emerald-500/60 hover:text-emerald-400' : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-emerald-500/60 hover:text-emerald-600'
              } ${!supported || permissionState === 'denied' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <BellRing className="w-4 h-4 text-emerald-500" />
              Send Test Notification
            </button>
          </div>

          {/* Unit System Card */}
          <div className={`p-5 sm:p-6 rounded-3xl border space-y-4 ${isDark ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800' : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 shadow-sm'}`}>
            <div className="flex items-center gap-2 pb-3 border-b border-slate-700/30">
              <Thermometer className="w-5 h-5 text-emerald-500" />
              <h2 className={`text-base font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Unit System
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setUnits('imperial');
                  showToast('Switched to Imperial (°F, mph)');
                }}
                className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between ${
                  units === 'imperial'
                    ? isDark
                      ? 'bg-emerald-950/50 border-emerald-500/60 ring-2 ring-emerald-500/30 text-white'
                      : 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-500/20 text-slate-900'
                    : isDark
                    ? 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <div>
                  <div className="font-black text-sm">Imperial</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">°F • mph</div>
                </div>
                {units === 'imperial' && <Check className="w-4 h-4 text-emerald-500" />}
              </button>

              <button
                onClick={() => {
                  setUnits('metric');
                  showToast('Switched to Metric (°C, km/h)');
                }}
                className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between ${
                  units === 'metric'
                    ? isDark
                      ? 'bg-emerald-950/50 border-emerald-500/60 ring-2 ring-emerald-500/30 text-white'
                      : 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-500/20 text-slate-900'
                    : isDark
                    ? 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <div>
                  <div className="font-black text-sm">Metric</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">°C • km/h</div>
                </div>
                {units === 'metric' && <Check className="w-4 h-4 text-emerald-500" />}
              </button>
            </div>
          </div>

          {/* Barometric Pressure Unit Card */}
          <div className={`p-5 sm:p-6 rounded-3xl border space-y-4 ${isDark ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800' : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 shadow-sm'}`}>
            <div className="flex items-center gap-2 pb-3 border-b border-slate-700/30">
              <Gauge className="w-5 h-5 text-emerald-500" />
              <h2 className={`text-base font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Barometric Pressure Unit
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setPressureUnit('inHg');
                  showToast('Switched pressure unit to Inches of Mercury (inHg)');
                }}
                className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between ${
                  pressureUnit === 'inHg'
                    ? isDark
                      ? 'bg-emerald-950/50 border-emerald-500/60 ring-2 ring-emerald-500/30 text-white'
                      : 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-500/20 text-slate-900'
                    : isDark
                    ? 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <div>
                  <div className="font-black text-sm">inHg</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Inches of Mercury</div>
                </div>
                {pressureUnit === 'inHg' && <Check className="w-4 h-4 text-emerald-500" />}
              </button>

              <button
                onClick={() => {
                  setPressureUnit('hPa');
                  showToast('Switched pressure unit to Hectopascals (hPa)');
                }}
                className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between ${
                  pressureUnit === 'hPa'
                    ? isDark
                      ? 'bg-emerald-950/50 border-emerald-500/60 ring-2 ring-emerald-500/30 text-white'
                      : 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-500/20 text-slate-900'
                    : isDark
                    ? 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <div>
                  <div className="font-black text-sm">hPa</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Hectopascals / Millibars</div>
                </div>
                {pressureUnit === 'hPa' && <Check className="w-4 h-4 text-emerald-500" />}
              </button>
            </div>
          </div>

          {/* Species Target Card */}
          <div className={`p-5 sm:p-6 rounded-3xl border space-y-4 ${isDark ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800' : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 shadow-sm'}`}>
            <div className="flex items-center gap-2 pb-3 border-b border-slate-700/30">
              <Target className="w-5 h-5 text-emerald-500" />
              <h2 className={`text-base font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Target Game Species
              </h2>
            </div>

            <div className="space-y-2.5">
              {speciesOptions.map((sp) => {
                const isSelected = targetSpecies === sp.name;
                return (
                  <button
                    key={sp.name}
                    onClick={() => {
                      onSelectSpecies(sp.name);
                      showToast(`Target species set to ${sp.name}`);
                    }}
                    className={`w-full p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 ${
                      isSelected
                        ? isDark
                          ? 'bg-emerald-950/50 border-emerald-500/60 ring-2 ring-emerald-500/30 text-white'
                          : 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-500/20 text-slate-900'
                        : isDark
                        ? 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{sp.emoji}</span>
                      <div>
                        <div className="font-extrabold text-xs sm:text-sm">{sp.name}</div>
                        <div className="text-[11px] text-slate-500">{sp.desc}</div>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Appearance & Theme Card */}
          <div className={`p-5 sm:p-6 rounded-3xl border space-y-4 ${isDark ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800' : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 shadow-sm'}`}>
            <div className="flex items-center gap-2 pb-3 border-b border-slate-700/30">
              <Sun className="w-5 h-5 text-emerald-500" />
              <h2 className={`text-base font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Theme & Interface
              </h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                onClick={() => {
                  setTheme('dark');
                  showToast('Dark Theme Activated');
                }}
                className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                  theme === 'dark'
                    ? 'bg-emerald-950/50 border-emerald-500/60 ring-2 ring-emerald-500/30 text-white'
                    : isDark
                    ? 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <Moon className="w-4 h-4 text-amber-400" />
                  {theme === 'dark' && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                </div>
                <div>
                  <div className="font-black text-xs">Dark</div>
                  <div className="text-[9px] text-slate-500">Night & Tactical</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setTheme('light');
                  showToast('Light Theme Activated');
                }}
                className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                  theme === 'light'
                    ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-500/20 text-slate-900'
                    : isDark
                    ? 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <Sun className="w-4 h-4 text-amber-500" />
                  {theme === 'light' && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                </div>
                <div>
                  <div className="font-black text-xs">Light</div>
                  <div className="text-[9px] text-slate-500">Daylight Contrast</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setTheme('olive');
                  showToast('Olive Theme Activated');
                }}
                className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                  theme === 'olive'
                    ? 'bg-[#556b2f]/20 border-[#556b2f] ring-2 ring-[#556b2f]/30 text-[#1e2e1b]'
                    : isDark
                    ? 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <Compass className="w-4 h-4 text-[#556b2f]" />
                  {theme === 'olive' && <Check className="w-3.5 h-3.5 text-[#556b2f]" />}
                </div>
                <div>
                  <div className="font-black text-xs">Olive</div>
                  <div className="text-[9px] text-[#556b2f]">Beige & Earthy</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setTheme('hunting');
                  showToast('Hunting Theme Activated');
                }}
                className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                  theme === 'hunting'
                    ? 'bg-[#c85a17]/20 border-[#c85a17] ring-2 ring-[#c85a17]/30 text-[#2c1810]'
                    : isDark
                    ? 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="text-base leading-none">🦌</span>
                  {theme === 'hunting' && <Check className="w-3.5 h-3.5 text-[#c85a17]" />}
                </div>
                <div>
                  <div className="font-black text-xs">Hunting</div>
                  <div className="text-[9px] text-[#c85a17]">Rustic Autumn</div>
                </div>
              </button>
            </div>

            <div className="pt-2">
              <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Custom Background Photo
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  id="custom-bg-upload"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        if (event.target?.result) {
                          onSetCustomBackground(event.target.result as string);
                          showToast('Custom background set');
                        }
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
                <button
                  onClick={() => document.getElementById('custom-bg-upload')?.click()}
                  className={`flex-1 py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all ${
                    isDark ? 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-800'
                  }`}
                >
                  <ImageIcon className="w-4 h-4 text-emerald-500" />
                  {customBackground ? 'Change Photo' : 'Upload Photo'}
                </button>
                {customBackground && (
                  <button
                    onClick={() => {
                      onSetCustomBackground(null);
                      showToast('Custom background removed');
                    }}
                    className={`py-2.5 px-3 rounded-xl border flex items-center justify-center text-xs font-bold transition-all text-rose-500 ${
                      isDark ? 'bg-slate-950/60 border-slate-800 hover:bg-rose-950/30 hover:border-rose-900/50' : 'bg-slate-50 border-slate-200 hover:bg-rose-50 hover:border-rose-200'
                    }`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {onSetCustomBackgroundOpacity && (
              <div className="space-y-4 pt-2 animate-fadeIn">
                <div>
                  <div className="flex justify-between text-xs mb-2">
                    <span className={`font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Card Opacity</span>
                    <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{customBackgroundOpacity}%</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    step="5"
                    value={customBackgroundOpacity}
                    onChange={(e) => onSetCustomBackgroundOpacity(parseInt(e.target.value, 10))}
                    className={`w-full h-2.5 rounded-lg cursor-pointer accent-emerald-500 border ${
                      isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-200 border-slate-300'
                    }`}
                  />
                </div>

                {onSetCustomBackgroundBlur && (
                  <div>
                    <div className="flex justify-between text-xs mb-2">
                      <span className={`font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Panel Blur Adjustment</span>
                      <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{customBackgroundBlur}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      step="1"
                      value={customBackgroundBlur}
                      onChange={(e) => onSetCustomBackgroundBlur(parseInt(e.target.value, 10))}
                      className={`w-full h-2.5 rounded-lg cursor-pointer accent-emerald-500 border ${
                        isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-200 border-slate-300'
                      }`}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Guides & Web App Tool Card */}
          <div className={`p-5 sm:p-6 rounded-3xl border space-y-3 ${isDark ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800' : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 shadow-sm'}`}>
            <h2 className={`text-xs font-extrabold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Help & Resources
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                onClick={onOpenGuide}
                className={`p-3 rounded-2xl border flex items-center gap-2.5 transition-all text-xs font-bold ${
                  isDark ? 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-800'
                }`}
              >
                <BookOpen className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>Barometric & Solunar Guide</span>
              </button>

              <button
                onClick={onOpenPwaModal}
                className={`p-3 rounded-2xl border flex items-center gap-2.5 transition-all text-xs font-bold ${
                  isDark ? 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-800'
                }`}
              >
                <Smartphone className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>Web App Installation</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
