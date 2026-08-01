/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { DailyForecast, Location, UnitSystem, ThemeMode, PressureUnit } from './types';
import { fetch5DayHuntingForecast } from './services/weatherService';
import {
  NotificationPrefs,
  getNotificationPrefs,
  saveNotificationPrefs,
  detectWeatherAlerts,
  buildDigestNotification,
  showSystemNotification,
  wasNotified,
  markNotified,
  isNotificationSupported,
} from './services/notificationService';
import { Header } from './components/Header';
import { ForecastCards } from './components/ForecastCards';
import { DayDetailView } from './components/DayDetailView';
import { FloatingHourlySlider } from './components/FloatingHourlySlider';
import { SettingsView } from './components/SettingsView';
import { DetailedPredictionView } from './components/DetailedPredictionView';
import { MapView } from './components/MapView';
import { LogsAndStatsView } from './components/LogsAndStatsView';
import { MeteorologyGuideModal } from './components/MeteorologyGuideModal';
import { PwaInstallModal } from './components/PwaInstallModal';
import { TrailCameraView } from './components/TrailCameraView';
import { RefreshCw, AlertTriangle, CheckCircle, Smartphone, LayoutDashboard, Map, Settings, Trophy, Camera } from 'lucide-react';

const FALLBACK_DEFAULT_LOCATION: Location = {
  name: 'Madison',
  admin1: 'Wisconsin',
  country: 'United States',
  latitude: 43.0731,
  longitude: -89.4012,
};

export default function App() {
  // Navigation tab state: 'dashboard', 'settings', 'details', 'map', 'logs', or 'trailcams'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings' | 'details' | 'map' | 'logs' | 'trailcams'>('dashboard');

  // Theme state: dark or light
  const [customBackground, setCustomBackground] = useState<string | null>(() => {
    return localStorage.getItem('letshunt_custom_background');
  });

  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('letshunt_theme');
    return (saved as ThemeMode) || 'dark';
  });

  // Default starting location state
  const [defaultLocation, setDefaultLocation] = useState<Location>(() => {
    const saved = localStorage.getItem('letshunt_default_location');
    return saved ? JSON.parse(saved) : FALLBACK_DEFAULT_LOCATION;
  });

  // Active viewed location state
  const [currentLocation, setCurrentLocation] = useState<Location>(() => {
    const savedLoc = localStorage.getItem('letshunt_location');
    if (savedLoc) return JSON.parse(savedLoc);
    const savedDefault = localStorage.getItem('letshunt_default_location');
    if (savedDefault) return JSON.parse(savedDefault);
    return FALLBACK_DEFAULT_LOCATION;
  });

  const [units, setUnits] = useState<UnitSystem>(() => {
    const saved = localStorage.getItem('letshunt_units');
    return (saved as UnitSystem) || 'imperial';
  });

  const [pressureUnit, setPressureUnit] = useState<PressureUnit>(() => {
    const saved = localStorage.getItem('letshunt_pressure_unit');
    return (saved as PressureUnit) || 'inHg';
  });

  const [targetSpecies, setTargetSpecies] = useState<string>(() => {
    return localStorage.getItem('letshunt_species') || 'Whitetail Deer';
  });

  const [favorites, setFavorites] = useState<Location[]>(() => {
    const saved = localStorage.getItem('letshunt_favorites');
    return saved ? JSON.parse(saved) : [FALLBACK_DEFAULT_LOCATION];
  });

  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>(() => getNotificationPrefs());

  const handleNotificationPrefsChange = (prefs: NotificationPrefs) => {
    setNotificationPrefs(prefs);
    saveNotificationPrefs(prefs);
  };

  const [dailyForecast, setDailyForecast] = useState<DailyForecast[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedHour, setSelectedHour] = useState<number>(() => new Date().getHours()); // Default to current local time hour
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modals
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [isPwaModalOpen, setIsPwaModalOpen] = useState<boolean>(false);

  // Toast Banner
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // PWA Install Prompt
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);

  const isDark = theme === 'dark';

  useEffect(() => {
    if (customBackground) {
      localStorage.setItem('letshunt_custom_background', customBackground);
    } else {
      localStorage.removeItem('letshunt_custom_background');
    }
  }, [customBackground]);

  const [customBackgroundOpacity, setCustomBackgroundOpacity] = useState<number>(() => {
    const saved = localStorage.getItem('letshunt_bg_opacity');
    return saved ? parseInt(saved, 10) : 90;
  });

  useEffect(() => {
    localStorage.setItem('letshunt_bg_opacity', customBackgroundOpacity.toString());
  }, [customBackgroundOpacity]);

  const [customBackgroundBlur, setCustomBackgroundBlur] = useState<number>(() => {
    const saved = localStorage.getItem('letshunt_bg_blur');
    return saved ? parseInt(saved, 10) : 12;
  });

  useEffect(() => {
    localStorage.setItem('letshunt_bg_blur', customBackgroundBlur.toString());
  }, [customBackgroundBlur]);

  // Persistence Effects
  useEffect(() => {
    localStorage.setItem('letshunt_theme', theme);
    document.documentElement.classList.remove('dark', 'olive', 'hunting');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'olive') {
      document.documentElement.classList.add('olive');
    } else if (theme === 'hunting') {
      document.documentElement.classList.add('hunting');
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('letshunt_default_location', JSON.stringify(defaultLocation));
  }, [defaultLocation]);

  useEffect(() => {
    localStorage.setItem('letshunt_location', JSON.stringify(currentLocation));
  }, [currentLocation]);

  useEffect(() => {
    localStorage.setItem('letshunt_units', units);
  }, [units]);

  useEffect(() => {
    localStorage.setItem('letshunt_pressure_unit', pressureUnit);
  }, [pressureUnit]);

  useEffect(() => {
    localStorage.setItem('letshunt_species', targetSpecies);
  }, [targetSpecies]);

  useEffect(() => {
    localStorage.setItem('letshunt_favorites', JSON.stringify(favorites));
  }, [favorites]);

  // Weather alert notifications: fire a daily digest of upcoming events and
  // schedule timed reminders for each window while the app is open.
  const notificationTimersRef = useRef<number[]>([]);

  useEffect(() => {
    if (!dailyForecast.length || !notificationPrefs.enabled) return;
    if (!isNotificationSupported() || Notification.permission !== 'granted') return;

    const events = detectWeatherAlerts(dailyForecast, notificationPrefs, units);
    if (events.length === 0) return;

    // One digest notification per location per day (never spams on refresh)
    const freshEvents = events.filter((e) => !wasNotified(e.id));
    if (freshEvents.length > 0) {
      const locationKey = currentLocation.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const digestKey = `digest_${locationKey}_${new Date().toDateString()}`;
      if (!wasNotified(digestKey)) {
        markNotified(digestKey);
        const { title, body } = buildDigestNotification(freshEvents, currentLocation.name);
        showSystemNotification(title, body);
      }
    }

    // Timed heads-up reminders for upcoming event windows (rain breaks fire 30 min before)
    for (const e of events) {
      const delay = e.fireAt - Date.now();
      if (delay <= 0 || delay > 48 * 3600 * 1000) continue;
      if (wasNotified(e.id)) continue;
      const timer = window.setTimeout(() => {
        if (!wasNotified(e.id)) {
          markNotified(e.id);
          showSystemNotification(e.title, e.body);
        }
      }, delay);
      notificationTimersRef.current.push(timer);
      if (notificationTimersRef.current.length >= 6) break;
    }

    return () => {
      notificationTimersRef.current.forEach((t) => window.clearTimeout(t));
      notificationTimersRef.current = [];
    };
  }, [dailyForecast, notificationPrefs, currentLocation, units]);

  // Listen for PWA beforeinstallprompt event
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      showToast('LetsHunt Web App installed to home screen!');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Fetch forecast whenever location or units change
  const loadForecast = async () => {
    setLoading(true);
    setError(null);
    try {
      const forecasts = await fetch5DayHuntingForecast(currentLocation, units, pressureUnit);
      setDailyForecast(forecasts);
      if (forecasts.length > 0) {
        setSelectedDate('');
      }
    } catch (err: any) {
      console.error('Failed to fetch forecast:', err);
      setError('Failed to fetch real-time weather & barometric data. Please check connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadForecast();
  }, [currentLocation, units, pressureUnit]);

  const handleToggleTheme = () => {
    const nextTheme: ThemeMode = theme === 'dark' ? 'light' : theme === 'light' ? 'olive' : (theme === 'olive' || theme === 'hunting') ? 'hunting' : 'dark';
    setTheme(nextTheme);
    showToast(`Switched to ${nextTheme === 'dark' ? 'Dark' : nextTheme === 'olive' ? 'Olive' : nextTheme === 'hunting' ? 'Hunting' : 'Light'} Theme`);
  };

  const handleSetDefaultLocation = (loc: Location) => {
    setDefaultLocation(loc);
    showToast(`"${loc.name}" set as default starting location!`);
    
    // Auto add to favorites if not present
    const exists = favorites.some(
      (f) => Math.abs(f.latitude - loc.latitude) < 0.01 && Math.abs(f.longitude - loc.longitude) < 0.01
    );
    if (!exists) {
      setFavorites([...favorites, loc]);
    }
  };

  const handleToggleFavorite = (loc: Location) => {
    const exists = favorites.some(
      (f) => Math.abs(f.latitude - loc.latitude) < 0.01 && Math.abs(f.longitude - loc.longitude) < 0.01
    );

    if (exists) {
      setFavorites(favorites.filter((f) => !(Math.abs(f.latitude - loc.latitude) < 0.01 && Math.abs(f.longitude - loc.longitude) < 0.01)));
      showToast(`Removed "${loc.name}" from saved hunting grounds`);
    } else {
      setFavorites([...favorites, loc]);
      showToast(`Saved "${loc.name}" to favorite hunting grounds!`);
    }
  };

  const handleInstallPwa = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      showToast('App installed to your home screen!');
    }
    setDeferredPrompt(null);
  };

  const activeDay = dailyForecast.find((d) => d.date === selectedDate) || dailyForecast[0];

  return (
    <div
      className={`font-sans antialiased flex flex-col transition-colors duration-200 ${
        activeTab === 'map'
          ? 'h-screen max-h-screen overflow-hidden'
          : 'min-h-screen pb-14 sm:pb-0'
      } ${
        isDark
          ? 'bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-slate-950'
          : theme === 'hunting'
          ? 'bg-[#f5f0e8] text-[#2c1810] selection:bg-[#c85a17] selection:text-white'
          : (theme === 'olive' || theme === 'hunting')
          ? 'bg-[#efebd9] text-[#1e2e1b] selection:bg-[#556b2f] selection:text-white'
          : 'bg-slate-100 text-slate-900 selection:bg-emerald-600 selection:text-white'
      }`}
      style={{
        '--card-opacity': `${customBackgroundOpacity / 100}`,
        '--card-blur': `${customBackgroundBlur}px`,
        ...(customBackground ? {
          backgroundImage: `url(${customBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
        } : {})
      } as React.CSSProperties}
    >
      <style>{`
        :root {
          --card-opacity: ${customBackgroundOpacity / 100};
          --card-blur: ${customBackgroundBlur}px;
          --slider-opacity: ${Math.min(0.98, (customBackgroundOpacity / 100) + 0.15)};
        }
        .backdrop-blur-md,
        .backdrop-blur-xl,
        .backdrop-blur-sm,
        .backdrop-blur-xs,
        .backdrop-blur,
        [class*="backdrop-blur"] {
          backdrop-filter: blur(${customBackgroundBlur}px) !important;
          -webkit-backdrop-filter: blur(${customBackgroundBlur}px) !important;
        }
      `}</style>

      {/* Toast Banner Notification */}
      {toastMessage && (
        <div className="fixed bottom-[52px] sm:bottom-5 right-5 z-50 bg-emerald-500 text-slate-950 font-extrabold text-xs px-4 py-3 rounded-2xl shadow-2xl border border-emerald-300 flex items-center gap-2 animate-bounce">
          <CheckCircle className="w-4 h-4 fill-slate-950 text-emerald-300" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Navigation */}
      <Header
        currentLocation={currentLocation}
        onSelectLocation={(loc) => setCurrentLocation(loc)}
        defaultLocation={defaultLocation}
        onSetDefaultLocation={handleSetDefaultLocation}
        units={units}
        onToggleUnits={() => setUnits(units === 'imperial' ? 'metric' : 'imperial')}
        theme={theme}
        hasCustomBackground={!!customBackground}
        onToggleTheme={handleToggleTheme}
        targetSpecies={targetSpecies}
        onSelectSpecies={(sp) => setTargetSpecies(sp)}
        favorites={favorites}
        onToggleFavorite={handleToggleFavorite}
        onOpenGuide={() => setIsGuideOpen(true)}
        onOpenPwaModal={() => setIsPwaModalOpen(true)}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
      />

      {/* Main App Container */}
      <main
        className={`w-full mx-auto ${
          activeTab === 'map'
            ? 'p-0 h-[calc(100vh-64px-52px)] sm:h-[calc(100vh-64px)] overflow-hidden relative flex-1'
            : 'flex-1 max-w-7xl px-3 sm:px-4 py-4 sm:py-6 pb-20 sm:pb-24 space-y-4 sm:space-y-6'
        }`}
      >
        {activeTab === 'settings' ? (
          <SettingsView
            currentLocation={currentLocation}
            onSelectLocation={(loc) => setCurrentLocation(loc)}
            defaultLocation={defaultLocation}
            onSetDefaultLocation={handleSetDefaultLocation}
            units={units}
            onToggleUnits={() => setUnits(units === 'imperial' ? 'metric' : 'imperial')}
            setUnits={setUnits}
            pressureUnit={pressureUnit}
            setPressureUnit={setPressureUnit}
            theme={theme}
        hasCustomBackground={!!customBackground}
            onToggleTheme={handleToggleTheme}
            setTheme={setTheme}
            targetSpecies={targetSpecies}
            onSelectSpecies={(sp) => setTargetSpecies(sp)}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onOpenGuide={() => setIsGuideOpen(true)}
            onOpenPwaModal={() => setIsPwaModalOpen(true)}
            showToast={showToast}
            onSwitchToDashboard={() => setActiveTab('dashboard')}
            notificationPrefs={notificationPrefs}
            onNotificationPrefsChange={handleNotificationPrefsChange}
            customBackground={customBackground}
            onSetCustomBackground={setCustomBackground}
            customBackgroundOpacity={customBackgroundOpacity}
            onSetCustomBackgroundOpacity={setCustomBackgroundOpacity}
            customBackgroundBlur={customBackgroundBlur}
            onSetCustomBackgroundBlur={setCustomBackgroundBlur}
          />
        ) : activeTab === 'map' ? (
          <MapView
            location={currentLocation}
            units={units}
            pressureUnit={pressureUnit}
            theme={theme}
        hasCustomBackground={!!customBackground}
            dailyForecast={dailyForecast}
            onSelectLocation={(loc) => setCurrentLocation(loc)}
            selectedHour={selectedHour}
            onSelectHour={setSelectedHour}
          />
        ) : activeTab === 'logs' ? (
          <LogsAndStatsView
            theme={theme}
            units={units}
            showToast={showToast}
            onNavigateToMap={() => setActiveTab('map')}
          />
        ) : activeTab === 'trailcams' ? (
          <TrailCameraView
            theme={theme}
            currentLocation={currentLocation}
            units={units}
            pressureUnit={pressureUnit}
            showToast={showToast}
          />
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="relative w-16 h-16">
              <div className={`absolute inset-0 rounded-full border-4 ${isDark ? 'border-slate-800' : 'border-slate-300'}`} />
              <div className="absolute inset-0 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
            </div>
            <div>
              <h3 className={`text-base sm:text-lg font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Fetching Live Meteorological Data...
              </h3>
              <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Gathering Open-Meteo barometric pressure, cold front drops, wind vectors & solunar times for {currentLocation.name}.
              </p>
            </div>
          </div>
        ) : error ? (
          <div
            className={`border rounded-2xl p-6 text-center max-w-md mx-auto my-12 space-y-4 shadow-xl ${
              isDark ? 'bg-rose-950/50 border-rose-800 text-rose-200' : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
            <h3 className="text-base font-bold">Forecast Load Failure</h3>
            <p className="text-xs">{error}</p>
            <button
              onClick={loadForecast}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-colors inline-flex items-center gap-2 shadow-md"
            >
              <RefreshCw className="w-4 h-4" /> Try Again
            </button>
          </div>
        ) : (
          <>
            {/* Detailed Prediction Full View OR Main Dashboard Conditions */}
            {activeTab === 'details' && activeDay ? (
              <DetailedPredictionView
                day={activeDay}
                location={currentLocation}
                units={units}
                pressureUnit={pressureUnit}
                theme={theme}
        hasCustomBackground={!!customBackground}
                selectedHour={selectedHour}
                onSelectHour={setSelectedHour}
                onBack={() => setActiveTab('dashboard')}
              />
            ) : (
              activeDay && (
                <DayDetailView
                  day={activeDay}
                  location={currentLocation}
                  units={units}
                  pressureUnit={pressureUnit}
                  targetSpecies={targetSpecies}
                  theme={theme}
        hasCustomBackground={!!customBackground}
                  selectedHour={selectedHour}
                  onSelectHour={setSelectedHour}
                  isToday={activeDay?.date === dailyForecast[0]?.date}
                  onResetToToday={() => {
                    if (dailyForecast[0]) {
                      setSelectedDate(dailyForecast[0].date);
                    }
                  }}
                  onSelectLocation={setCurrentLocation}
                  forecastCards={
                    <ForecastCards
                      daily={dailyForecast.slice(0, 7)}
                      selectedDate={selectedDate}
                      onSelectDate={(date) => setSelectedDate(date)}
                      selectedHour={selectedHour}
                      units={units}
                      pressureUnit={pressureUnit}
                      theme={theme}
        hasCustomBackground={!!customBackground}
                      location={currentLocation}
                      onOpenDetails={(date) => {
                        setSelectedDate(date);
                        setActiveTab('details');
                      }}
                    />
                  }
                />
              )
            )}
          </>
        )}

        {/* Floating Ultra-Compact 24h Hourly Time Slider (Active on Dashboard and Details tabs) */}
        {!loading && !error && activeDay && (activeTab === 'dashboard' || activeTab === 'details') && (
          <FloatingHourlySlider
            selectedHour={selectedHour}
            onSelectHour={setSelectedHour}
            onResetToToday={() => {
              if (dailyForecast[0]) {
                setSelectedDate(dailyForecast[0].date);
              }
            }}
            hourly={activeDay.hourly}
            theme={theme}
            hasCustomBackground={!!customBackground}
          />
        )}
      </main>

      {/* Footer (Hidden on Map Plotter tab for true full-screen map) */}
      {activeTab !== 'map' && (
        <footer
          className={`border-t py-4 px-4 text-center text-xs transition-colors mt-auto ${
            isDark
              ? 'bg-slate-950 border-slate-800/80 text-slate-500'
              : theme === 'hunting'
              ? 'bg-[#ede5d5] border-[#d4c5a9] text-[#8b7355]'
            : theme === 'hunting'
            ? 'bg-[#f5f0e8]/95 border-[#d4c5a9] text-[#2c1810]'
            : (theme === 'olive' || theme === 'hunting')
              ? 'bg-[#e5e1d0] border-[#d4cebc] text-[#556b2f]'
              : 'bg-white border-slate-200 text-slate-600'
          }`}
        >
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`font-black ${isDark ? 'text-slate-200' : theme === 'hunting' ? 'text-[#2c1810]' : (theme === 'olive' || theme === 'hunting') ? 'text-[#1e2e1b]' : 'text-slate-900'}`}>LetsHunt</span>
              <span>• Deer Forecast Prediction Engine</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsPwaModalOpen(true)}
                className="text-emerald-600 dark:text-emerald-400 hover:underline font-bold text-xs flex items-center gap-1"
              >
                <Smartphone className="w-3.5 h-3.5" /> Turn Into Web App
              </button>
              <span className="text-slate-400">•</span>
              <span className="text-[11px]">
                Live weather by <span className={`font-semibold ${isDark ? 'text-slate-300' : theme === 'hunting' ? 'text-[#5c4a32]' : (theme === 'olive' || theme === 'hunting') ? 'text-[#2e4028]' : 'text-slate-700'}`}>Open-Meteo API</span>
              </span>
            </div>
          </div>
        </footer>
      )}

      {/* Mobile Bottom Navigation Bar */}
      <nav
        className={`sm:hidden fixed bottom-0 left-0 right-0 z-50 border-t flex items-center justify-around px-4 py-1 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] backdrop-blur-md transition-colors duration-200 ${
          isDark
            ? 'bg-slate-950/90 border-slate-800 text-slate-100'
            : (theme === 'olive' || theme === 'hunting')
            ? 'bg-[#f7f5ed]/95 border-[#d8d2c0] text-[#1e2e1b]'
            : 'bg-white/95 border-slate-200 text-slate-900'
        }`}
      >
        <button
          onClick={() => {
            setActiveTab('dashboard');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center gap-0.5 py-0.5 px-3 transition-all cursor-pointer ${
            activeTab === 'dashboard' || activeTab === 'details'
              ? 'text-emerald-500 font-extrabold scale-105'
              : isDark
              ? 'text-slate-400 hover:text-slate-200 font-semibold'
              : 'text-slate-500 hover:text-slate-900 font-semibold'
          }`}
        >
          <LayoutDashboard className="w-4.5 h-4.5" />
          <span className="text-[9px] tracking-wider uppercase">Dashboard</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('map');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center gap-0.5 py-0.5 px-3 transition-all cursor-pointer ${
            activeTab === 'map'
              ? 'text-emerald-500 font-extrabold scale-105'
              : isDark
              ? 'text-slate-400 hover:text-slate-200 font-semibold'
              : 'text-slate-500 hover:text-slate-900 font-semibold'
          }`}
        >
          <Map className="w-4.5 h-4.5" />
          <span className="text-[9px] tracking-wider uppercase">Map Plotter</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('logs');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center gap-0.5 py-0.5 px-3 transition-all cursor-pointer ${
            activeTab === 'logs'
              ? 'text-emerald-500 font-extrabold scale-105'
              : isDark
              ? 'text-slate-400 hover:text-slate-200 font-semibold'
              : 'text-slate-500 hover:text-slate-900 font-semibold'
          }`}
        >
          <Trophy className="w-4.5 h-4.5" />
          <span className="text-[9px] tracking-wider uppercase">Logs & Stats</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('trailcams');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center gap-0.5 py-0.5 px-3 transition-all cursor-pointer ${
            activeTab === 'trailcams'
              ? 'text-emerald-500 font-extrabold scale-105'
              : isDark
              ? 'text-slate-400 hover:text-slate-200 font-semibold'
              : 'text-slate-500 hover:text-slate-900 font-semibold'
          }`}
        >
          <Camera className="w-4.5 h-4.5" />
          <span className="text-[9px] tracking-wider uppercase">Trail Cams</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('settings');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center gap-0.5 py-0.5 px-3 transition-all cursor-pointer ${
            activeTab === 'settings'
              ? 'text-emerald-500 font-extrabold scale-105'
              : isDark
              ? 'text-slate-400 hover:text-slate-200 font-semibold'
              : 'text-slate-500 hover:text-slate-900 font-semibold'
          }`}
        >
          <Settings className="w-4.5 h-4.5" />
          <span className="text-[9px] tracking-wider uppercase">Settings</span>
        </button>
      </nav>

      {/* Guide Modal */}
      <MeteorologyGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} theme={theme}
        hasCustomBackground={!!customBackground} />

      {/* PWA / Web App Installation Instructions Modal */}
      <PwaInstallModal
        isOpen={isPwaModalOpen}
        onClose={() => setIsPwaModalOpen(false)}
        deferredPrompt={deferredPrompt}
        onInstallClick={handleInstallPwa}
        isInstalled={isInstalled}
        hasCustomBackground={!!customBackground}
      />
    </div>
  );
}
