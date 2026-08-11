import React, { useState, useEffect, useRef } from 'react';
import { Location, UnitSystem, ThemeMode, ThemeVariant, ThemeVariantMode, PressureUnit } from '../types';
import { searchLocations } from '../services/weatherService';
import {
  NotificationPrefs,
  getPermissionState,
  isNotificationSupported,
  requestNotificationPermission,
  sendTestNotification,
  showSystemNotification,
} from '../services/notificationService';
import { subscribeUserToPush, unsubscribeUserFromPush, sendTestClosedAppPush } from '../services/pushService';
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
  Database,
  Download,
  Upload,
  Loader2,
  Send,
  AlertCircle,
  Activity,
  Trees,
} from 'lucide-react';
import { DeerIcon } from './DeerIcon';
import { exportBackupData, importBackupData, downloadJson, defaultBackupFilename } from '../services/dataBackupService';
import { PaperTexture } from './PaperTexture';

// Downscale a user-provided background photo before persisting as a base64
// data URL. The raw 4-MP+ photo would otherwise blow past the ~5 MB
// localStorage quota on save. Returns a Promise resolving to a JPEG
// data URL — iteratively halving until it fits under `hardMaxBytes`. Rejects
// only if the source image itself can't be decoded.
async function compressImage(file: File, hardMaxBytes = 4 * 1024 * 1024): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.src = url;
    });
    // Cover all reasonable source sizes: 4 K screenshot → phone photo → panorama.
    const attempts: Array<[number, number]> = [
      [1920, 0.85],
      [1280, 0.8],
      [960, 0.75],
      [720, 0.7],
    ];
    let bestDataUrl = '';
    for (const [maxDim, quality] of attempts) {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      bestDataUrl = dataUrl;
      // Base64 length × 0.75 approximates the underlying JPEG byte count.
      if (dataUrl.length * 0.75 < hardMaxBytes) return dataUrl;
    }
    // Even the smallest attempt didn't fit; surface the best we have.
    // Caller's `safeSet` will silently drop it if it still exceeds the quota.
    return bestDataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}

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
  // Composite theme (variant × mode). Use isDark = ThemeMode-based check
  // elsewhere if you only care about light/dark; `theme` picks the variant.
  theme: ThemeVariantMode;
  hasCustomBackground?: boolean;
  onToggleTheme: () => void;
  setTheme: (t: ThemeVariantMode) => void;
  // Split state setters (preferred for new code):
  themeVariant: ThemeVariant;
  themeMode: ThemeMode;
  setVariant: (v: ThemeVariant) => void;
  setMode: (m: ThemeMode) => void;
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
  themeVariant,
  themeMode,
  setVariant,
  setMode,
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
  const [isBackgroundTesting, setIsBackgroundTesting] = useState(false);
  const [bgTestStatus, setBgTestStatus] = useState<{ kind: 'idle' | 'waking' | 'sending' | 'success' | 'error'; message: string }>(
    { kind: 'idle', message: '' }
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  // isDark comes from the orthogonal themeMode prop (not the composite
  // `theme` string, which collapses to the variant name for olive/hunting/
  // (standard / olive / hunting) so the whole Settings view flips correctly in dark mode.
  const isDark = themeMode === 'dark';

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

  const alertRows: { key: keyof Pick<NotificationPrefs, 'coldFront' | 'weatherFront' | 'rainBreak' | 'primeDay' | 'severeWeather'>; icon: React.ComponentType<{ className?: string }>; label: string; desc: string }[] = [
    { key: 'coldFront', icon: Snowflake, label: 'Cold Fronts', desc: 'Sharp 24h temperature drops (~9°F / 5°C)' },
    { key: 'weatherFront', icon: Wind, label: 'Weather Fronts', desc: 'The barometer changing quickly' },
    { key: 'rainBreak', icon: CloudRain, label: 'Breaks in the Rain', desc: 'Dry windows right after rain trigger feeding surges' },
    { key: 'primeDay', icon: Zap, label: 'Best Hunting Days', desc: 'The strongest deer movement windows' },
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
    ? 'Alerts are not available in this browser'
    : permissionState === 'granted'
    ? 'Alerts are ready'
    : permissionState === 'denied'
    ? 'Notifications are turned off in your browser'
    : 'Tap to turn on weather alerts';

  const ensurePermissionGranted = async (): Promise<NotificationPermission | 'unsupported'> => {
    let perm = getPermissionState();
    if (perm !== 'granted') {
      perm = await requestNotificationPermission();
      setPermissionState(perm);
    }
    return perm;
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const { json, summary } = await exportBackupData();
      downloadJson(json, defaultBackupFilename());
      const parts = [
        `${summary.logs} log${summary.logs === 1 ? '' : 's'}`,
        `${summary.pins} pin${summary.pins === 1 ? '' : 's'}`,
        `${summary.polygons} zone${summary.polygons === 1 ? '' : 's'}`,
        `${summary.paths} path${summary.paths === 1 ? '' : 's'}`,
        `${summary.photos} trail photo${summary.photos === 1 ? '' : 's'}`,
      ].filter((s) => !s.startsWith('0 '));
      showToast(`Backup downloaded — ${parts.join(', ')}`);
    } catch (err: any) {
      console.error('Export failed:', err);
      showToast('Export failed — please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFile = async (file: File | null | undefined) => {
    if (!file) return;
    const ok = window.confirm(
      'Restore this backup?\n\nThis overwrites current settings, harvest logs & map data, and merges trail cam photos (matched by ID). The app will reload afterwards.'
    );
    if (!ok) {
      if (importInputRef.current) importInputRef.current.value = '';
      return;
    }
    setIsImporting(true);
    try {
      const text = await file.text();
      const summary = await importBackupData(text);
      // Signal App to show a toast after the reload (so all stores re-read fresh).
      sessionStorage.setItem('letshunt_backup_imported', JSON.stringify(summary));
      window.location.reload();
    } catch (err: any) {
      console.error('Import failed:', err);
      setIsImporting(false);
      showToast(`Import failed — ${err?.message || 'invalid file'}`);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const handleBackgroundPushTest = async () => {
    setIsBackgroundTesting(true);
    setBgTestStatus({ kind: 'waking', message: 'Getting your alerts ready…' });
    try {
      const result = await sendTestClosedAppPush(
        { name: currentLocation.name, latitude: currentLocation.latitude, longitude: currentLocation.longitude },
        {
          leadTimeHours: notificationPrefs.leadTimeHours,
          coldFront: notificationPrefs.coldFront,
          weatherFront: notificationPrefs.weatherFront,
          rainBreak: notificationPrefs.rainBreak,
          primeDay: notificationPrefs.primeDay,
          severeWeather: notificationPrefs.severeWeather,
        },
        units,      (state, info) => {
          if (state === 'waking') setBgTestStatus({ kind: 'waking', message: info || 'Getting your alerts ready…' });
          else if (state === 'sending') setBgTestStatus({ kind: 'sending', message: info || 'Sending a test alert…' });
        });
      setBgTestStatus({
        kind: result.ok ? 'success' : 'error',
        message: result.message,
      });
      if (result.ok) {
        showToast('Closed-app test alert sent ✓');
      }
    } catch (e: any) {
      setBgTestStatus({ kind: 'error', message: e?.message || 'Unexpected error' });
    } finally {
      setIsBackgroundTesting(false);
    }
  };

  const handleMasterToggle = async (next: boolean) => {
    if (!next) {
      onNotificationPrefsChange({ ...notificationPrefs, enabled: false });
      // Unsubscribe from background push so alerts stop when the app is closed
      unsubscribeUserFromPush().catch(() => {});
      showToast('Weather alerts turned off.');
      return;
    }

    const perm = await ensurePermissionGranted();

    if (perm === 'granted') {
      onNotificationPrefsChange({ ...notificationPrefs, enabled: true });
      // Subscribe to background push — alerts will fire even when the app is closed.
      // Don't block the UI on this; if the push server isn't reachable (e.g. local
      // dev or not yet deployed), foreground alerts still work.
      subscribeUserToPush(
        { name: currentLocation.name, latitude: currentLocation.latitude, longitude: currentLocation.longitude },
        {
          leadTimeHours: notificationPrefs.leadTimeHours,
          coldFront: notificationPrefs.coldFront,
          weatherFront: notificationPrefs.weatherFront,
          rainBreak: notificationPrefs.rainBreak,
          primeDay: notificationPrefs.primeDay,
          severeWeather: notificationPrefs.severeWeather,
        },
        units
      ).then((ok) => {
        if (ok) {
          showToast('Weather alerts are on.');
        } else {
          showToast('Weather alerts are on.');
        }
      }).catch(() => {
        showToast('Weather alerts are on.');
      });
    } else if (perm === 'denied') {
      showToast('Notifications are blocked by the browser. Enable them in your site settings.');
    } else {
      showToast('Grant notification permission in the browser prompt to enable alerts.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn pb-12">
      {/* Top Banner Header */}
      <div
        className={`relative overflow-hidden p-5 sm:p-6 rounded-3xl border shadow-lg ${
          isDark
            ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800'
            : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200'
        }`}
      >
        {/* Wash gradient overlay so the settings panel still feels layered. */}
        <PaperTexture
          variant="wash"
          opacity={0.06}
          blendMode="soft-light"
          tone={isDark ? '#94a3b8' : '#94a3b8'}
          className="absolute inset-x-0 top-0 h-12"
        />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm flex-shrink-0 ${
                'bg-emerald-500/10 border border-emerald-500/30 text-emerald-500'
              }`}
            >
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h1
                className={`text-xl sm:text-2xl font-black tracking-tight ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
              >
                App Settings
              </h1>
              <p
                className={`text-xs mt-0.5 ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                Manage hunting grounds, default location, unit preferences, and weather alerts.
              </p>
            </div>
          </div>

          <button
            onClick={onSwitchToDashboard}
            className={`px-4 py-2 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-2 self-start sm:self-auto ${
              'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            <span>Back to Dashboard</span>
          </button>
            </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Section 1: Location & Hunting Grounds Management */}
        <div className={`p-5 sm:p-6 rounded-3xl border space-y-5 ${
          isDark
            ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800'
              : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center gap-2 pb-3 border-b border-slate-700/30">
            <MapPin className="w-5 h-5 text-emerald-500" />
            <h2 className={`text-base font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Hunting Grounds & Default Location
            </h2>
          </div>

          {/* Active & Default Location Card */}
          <div className={`p-4 rounded-2xl border space-y-3 ${
            isDark
              ? 'bg-slate-950/60 border-slate-800'
                : 'bg-slate-50 border-slate-200'
          }`}>
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
              <div className="py-3">
                <p className="text-xs text-slate-500">No saved hunting grounds yet.</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Search above, then tap <strong>Select</strong> to set an active ground or the{' '}
                  <Star className="w-3 h-3 inline text-amber-400 -mt-0.5" /> star to save it here for quick switching.
                </p>
              </div>
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

        {/* Section 2: Preferences & Units */}
        <div className="space-y-6">
          {/* Push Notifications & Weather Alerts Card */}
          <div className={`p-5 sm:p-6 rounded-3xl border space-y-4 ${isDark
          ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800'
          : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 shadow-sm'}`}>
            <div className="flex items-center gap-2 pb-3 border-b border-slate-700/30">
              <BellRing className="w-5 h-5 text-emerald-500" />
              <h2 className={`text-base font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Weather Alerts
              </h2>
            </div>

            <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Get a heads-up when weather may get deer moving — cold fronts, weather changes, breaks in the rain,
              and the best hunting days. Alerts can reach you even when LetsHunt is closed.
              On Android, also allow notifications for LetsHunt in your device Settings.
            </p>

            {/* Master toggle */}
            <div
              className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="min-w-0">
                <div className={`text-xs font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Get Weather Alerts
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
                    onClick={() => {
                      onNotificationPrefsChange({ ...notificationPrefs, leadTimeHours: hours });
                      if (notificationPrefs.enabled && permissionState === 'granted') {
                        showSystemNotification(
                          `Alerts Armed — next ${hours}h`,
                          `Weather alerts active for ${currentLocation.name}. You'll be pinged when conditions change.`,
                          `letshunt_lt_${hours}_${Date.now()}`
                        );
                      }
                    }}
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

            {/* Quick test while the app is open. */}
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
              Send Test Alert
            </button>

            {/* Test alerts while the app is closed. */}
            <div className={`rounded-2xl border p-3.5 space-y-3 ${isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-start gap-2">
                <Send className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isDark ? 'text-sky-400' : 'text-sky-600'}`} />
                <div className="flex-1">
                  <div className={`text-xs font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    Test Alerts When App Is Closed
                  </div>
                  <div className={`text-[10px] mt-0.5 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Sends a quick test alert so you know your weather alerts are ready.
                    Close LetsHunt after tapping the button to make sure alerts can reach you while you are away.
                  </div>
                </div>
              </div>

              <button
                onClick={handleBackgroundPushTest}
                disabled={isBackgroundTesting || !supported || permissionState === 'denied'}
                className={`w-full py-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-black transition-all ${
                  isDark
                    ? 'bg-sky-950/40 border-sky-500/40 text-sky-200 hover:border-sky-400 hover:bg-sky-950/70'
                    : 'bg-sky-50 border-sky-300 text-sky-800 hover:border-sky-500 hover:bg-sky-100'
                } ${isBackgroundTesting || !supported || permissionState === 'denied' ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {isBackgroundTesting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {isBackgroundTesting ? 'Sending Test Alert…' : 'Send Test Alert (app closed)'}
              </button>

              {bgTestStatus.kind !== 'idle' && (
                <div
                  className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${
                    bgTestStatus.kind === 'success'
                      ? isDark
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                        : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : bgTestStatus.kind === 'error'
                      ? isDark
                        ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                        : 'bg-rose-50 border-rose-300 text-rose-900'
                      : isDark
                      ? 'bg-sky-950/40 border-sky-500/40 text-sky-200'
                      : 'bg-sky-50 border-sky-300 text-sky-900'
                  }`}
                >
                  {bgTestStatus.kind === 'waking' || bgTestStatus.kind === 'sending' ? (
                    <Activity className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 animate-pulse" />
                  ) : bgTestStatus.kind === 'success' ? (
                    <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  )}
                  <span>{bgTestStatus.message}</span>
                </div>
              )}

            </div>
          </div>

          {/* Unit System Card */}
          <div className={`p-5 sm:p-6 rounded-3xl border space-y-4 ${isDark
          ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800'
          : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 shadow-sm'}`}>
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

          {/* Barometer Unit Card */}
          <div className={`p-5 sm:p-6 rounded-3xl border space-y-4 ${isDark
          ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800'
          : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 shadow-sm'}`}>
            <div className="flex items-center gap-2 pb-3 border-b border-slate-700/30">
              <Gauge className="w-5 h-5 text-emerald-500" />
              <h2 className={`text-base font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Barometer Unit
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

          {/* Appearance & Theme Card */}
          <div className={`p-5 sm:p-6 rounded-3xl border space-y-4 ${isDark
          ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800'
          : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 shadow-sm'}`}>
            <div className="flex items-center gap-2 pb-3 border-b border-slate-700/30">
              <Sun className="w-5 h-5 text-emerald-500" />
              <h2 className={`text-base font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Theme & Interface
              </h2>
            </div>

            {/* Variant picker — 4 orthogonal visual identities. Light/Dark
                is handled by the toggle underneath, so cycling variants here
                keeps your preferred brightness. */}
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Theme Variant
              </label>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                <button
                  onClick={() => {
                    setVariant('standard');
                    showToast('Standard Theme Activated');
                  }}
                  className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                    themeVariant === 'standard'
                      ? themeMode === 'dark'
                        ? 'bg-emerald-950/50 border-emerald-500/60 ring-2 ring-emerald-500/30 text-white'
                        : 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-500/20 text-slate-900'
                      : isDark
                      ? 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <div className="flex gap-1">
                      <span className="w-3 h-3 rounded-sm bg-slate-900 border border-slate-700" />
                      <span className="w-3 h-3 rounded-sm bg-white border border-slate-300" />
                    </div>
                    {themeVariant === 'standard' && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                  </div>
                  <div>
                    <div className="font-black text-xs">Standard</div>
                    <div className="text-[9px] text-slate-500">Clean &amp; Modern</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setVariant('olive');
                    showToast('Olive Theme Activated');
                  }}
                  className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                    themeVariant === 'olive'
                      ? 'bg-[#556b2f]/20 border-[#556b2f] ring-2 ring-[#556b2f]/30 text-[#1e2e1b]'
                      : isDark
                      ? 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <div className="flex gap-1">
                      <span className="w-3 h-3 rounded-sm bg-[#1c2614] border border-[#556b2f]/60" />
                      <span className="w-3 h-3 rounded-sm bg-[#efebd9] border border-[#d8d2c0]" />
                    </div>
                    {themeVariant === 'olive' && <Check className="w-3.5 h-3.5 text-[#556b2f]" />}
                  </div>
                  <div>
                    <div className="font-black text-xs">Olive</div>
                    <div className="text-[9px] text-[#556b2f]">Beige &amp; Earthy</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setVariant('hunting');
                    showToast('Hunter Theme Activated');
                  }}
                  className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                    themeVariant === 'hunting'
                      ? 'bg-[#c85a17]/20 border-[#c85a17] ring-2 ring-[#c85a17]/30 text-[#2c1810]'
                      : isDark
                      ? 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <div className="flex gap-1">
                      <span className="w-3 h-3 rounded-sm bg-[#221610] border border-[#5c4a32]/60" />
                      <span className="w-3 h-3 rounded-sm bg-[#f5f0e8] border border-[#d4c5a9]" />
                    </div>
                    {themeVariant === 'hunting' && <Check className="w-3.5 h-3.5 text-[#c85a17]" />}
                  </div>
                  <div>
                    <div className="font-black text-xs">Hunter</div>
                    <div className="text-[9px] text-[#c85a17]">Rustic Autumn</div>
                  </div>
                </button>

              </div>
            </div>

            {/* Universal Light/Dark toggle — applies on top of whichever
                variant is selected above. Two-Finger tap of an in-app variant
                keeps its brightness preference. */}
            <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
              isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  themeMode === 'dark'
                    ? themeVariant === 'hunting'
                      ? 'bg-[#c85a17]/15 text-[#c85a17]'
                      : themeVariant === 'olive'
                      ? 'bg-[#556b2f]/20 text-[#556b2f]'
                      : 'bg-emerald-500/15 text-emerald-400'
                    : themeVariant === 'hunting'
                    ? 'bg-[#c85a17]/15 text-[#c85a17]'
                    : themeVariant === 'olive'
                    ? 'bg-[#556b2f]/20 text-[#556b2f]'
                    : 'bg-amber-500/15 text-amber-500'
                }`}>
                  {themeMode === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <div className={`text-xs font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {themeMode === 'dark' ? 'Dark Mode' : 'Light Mode'}
                  </div>
                  <div className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Applies to <strong>{
                      themeVariant === 'standard' ? 'Standard' :
                      themeVariant === 'olive' ? 'Olive' :
                      'Hunter'
                    }</strong> — flip anytime.
                  </div>
                </div>
              </div>
              {renderToggle(themeMode === 'dark', (v) => {
                setMode(v ? 'dark' : 'light');
                showToast(v ? 'Dark mode on' : 'Light mode on');
              })}
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
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    // Reset the input so the same file can be re-selected later.
                    e.target.value = '';
                    try {
                      const compressed = await compressImage(file);
                      onSetCustomBackground(compressed);
                      if (compressed.length * 0.75 < 4 * 1024 * 1024) {
                        showToast('Custom background set');
                      } else {
                        showToast('Background compressed to ~720px — may not persist after reload');
                      }
                    } catch (err) {
                      console.error('Failed to process background photo:', err);
                      showToast('Could not load that photo. Try JPG or PNG under ~10 MB.');
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
          <div className={`p-5 sm:p-6 rounded-3xl border space-y-3 ${isDark
          ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800'
          : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 shadow-sm'}`}>
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
                <span>Weather & Moon Guide</span>
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

          {/* Backup & Restore (JSON) Card */}
          <div className={`p-5 sm:p-6 rounded-3xl border space-y-4 ${isDark
          ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800'
          : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 shadow-sm'}`}>
            <div className="flex items-center gap-2 pb-3 border-b border-slate-700/30">
              <Database className="w-5 h-5 text-emerald-500" />
              <h2 className={`text-base font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Backup & Restore (JSON)
              </h2>
            </div>

            <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Export all your LetsHunt data — hunting grounds, harvest logs, map pins, zones, paths,
              trail cam targets & locations, and photo metadata (with thumbnails) — to a single JSON
              file, then restore it here or on another device.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                onClick={handleExport}
                disabled={isExporting}
                className={`p-3.5 rounded-2xl border flex items-center justify-center gap-2 text-xs font-black transition-all ${
                  isDark
                    ? 'bg-emerald-950/50 border-emerald-500/60 text-emerald-300 hover:bg-emerald-900'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                } ${isExporting ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
              >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {isExporting ? 'Exporting…' : 'Export JSON Backup'}
              </button>

              <button
                onClick={() => importInputRef.current?.click()}
                disabled={isImporting}
                className={`p-3.5 rounded-2xl border flex items-center justify-center gap-2 text-xs font-black transition-all ${
                  isDark
                    ? 'bg-slate-950/60 border-slate-800 text-slate-200 hover:border-slate-700'
                    : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-slate-300'
                } ${isImporting ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
              >
                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {isImporting ? 'Restoring…' : 'Restore from Backup'}
              </button>
            </div>

            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportFile(file);
                e.target.value = '';
              }}
            />

            <div className={`rounded-2xl border p-3.5 space-y-2 ${isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                What's included
              </div>
              <ul className={`text-[11px] leading-relaxed space-y-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                <li>• Hunting grounds, default location & all app settings (theme, units, pressure, alerts, map style & layers)</li>
                <li>• Harvest logs with photos & weather conditions</li>
                <li>• Map pins (stands, bedding, food plots), zones & paths</li>
                <li>• Trail cam targets, locations & photo metadata with thumbnails</li>
              </ul>
              <p className={`text-[10px] leading-relaxed ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                Note: full-resolution trail cam images live in local storage and aren't part of the JSON file —
                re-import them from your SD card if needed. Restoring overwrites saved settings, logs & map data,
                merges trail cam photos (matched by ID), and reloads the app. Your custom background photo is
                included in the file.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
