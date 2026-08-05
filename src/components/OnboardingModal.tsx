import React, { useState, useEffect, useRef } from 'react';
import { Location, ThemeMode, ThemeVariantMode } from '../types';
import { searchLocations } from '../services/weatherService';
import { MapPin, Search, Compass, Check, X, Target, CloudSun, BellRing, ArrowRight, ChevronLeft } from 'lucide-react';
import { DeerIcon } from './DeerIcon';

interface OnboardingModalProps {
  isOpen: boolean;
  theme?: ThemeVariantMode;
  isDark?: boolean;
  onComplete: (loc: Location | null) => void;
}

const STEPS = ['Welcome', 'Your Grounds', 'Done'];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  theme,
  isDark = theme === 'dark',
  onComplete,
}) => {
  const [step, setStep] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [selectedLoc, setSelectedLoc] = useState<Location | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Reset the wizard whenever it's (re)opened
  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedLoc(null);
    setShowDropdown(false);
  }, [isOpen]);

  // Debounced location search
  useEffect(() => {
    if (!isOpen || searchQuery.trim().length < 2) {
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
  }, [searchQuery, isOpen]);

  // Click outside closes the dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleGps = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const gpsLocation: Location = {
          name: 'My GPS Location',
          admin1: `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`,
          country: 'Current Position',
          latitude,
          longitude,
        };
        setSelectedLoc(gpsLocation);
        setIsLocating(false);
        setStep(2);
      },
      (error) => {
        console.warn('GPS position request notice:', error?.message || error);
        setIsLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  };

  const selectLocation = (loc: Location) => {
    setSelectedLoc(loc);
    setShowDropdown(false);
    setStep(2);
  };

  if (!isOpen) return null;

  const cardBg = isDark
    ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-xl border-slate-800'
    : theme === 'hunting'
    ? 'bg-[#f4eee1]/[var(--card-opacity)] backdrop-blur-xl border-[#d4c4a8]'
    : theme === 'olive'
    ? 'bg-[#f7f5ed]/[var(--card-opacity)] backdrop-blur-xl border-[#d8d2c0]'
    : 'bg-white/[var(--card-opacity)] backdrop-blur-xl border-slate-200';

  const accentBtn =
    theme === 'hunting'
      ? 'bg-[#c85a17] hover:bg-[#b34e12] text-white'
      : theme === 'olive'
      ? 'bg-[#556b2f] hover:bg-[#4a5e27] text-white'
      : isDark
      ? 'bg-emerald-600 hover:bg-emerald-500 text-slate-950'
      : 'bg-emerald-500 hover:bg-emerald-600 text-white';

  const textPrimary = isDark ? 'text-white' : theme === 'hunting' ? 'text-[#2a1b0e]' : theme === 'olive' ? 'text-[#1e2e1b]' : 'text-slate-900';
  const textSecondary = isDark ? 'text-slate-400' : theme === 'hunting' ? 'text-[#8b7355]' : theme === 'olive' ? 'text-[#6e6a5e]' : 'text-slate-500';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className={`w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden animate-fadeIn ${cardBg}`}>
        {/* Header strip */}
        <div className="relative px-6 pt-6 pb-4 text-center">
          <button
            onClick={() => onComplete(null)}
            className={`absolute right-4 top-4 p-1.5 rounded-full transition-colors hover:bg-slate-500/10 ${textSecondary}`}
            title="Skip setup"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-lg flex items-center justify-center mb-3">
            <DeerIcon className="w-10 h-10 text-white" />
          </div>
          <h1 className={`text-xl sm:text-2xl font-black tracking-tight ${textPrimary}`}>Welcome to LetsHunt</h1>
          <p className={`text-xs mt-1 ${textSecondary}`}>
            Whitetail deer movement forecasts powered by weather, barometric pressure & solunar science.
          </p>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 mt-4">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-1.5">
                <span
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === step
                      ? 'w-8 bg-emerald-500'
                      : i < step
                      ? 'w-2 bg-emerald-500/60'
                      : isDark
                      ? 'w-2 bg-slate-700'
                      : 'w-2 bg-slate-300'
                  }`}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 pb-6">
          {/* STEP 1: Welcome */}
          {step === 0 && (
            <div className="space-y-3">
              <div className={`p-3.5 rounded-2xl border flex items-start gap-3 ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-slate-50/[var(--card-opacity)] border-slate-200'}`}>
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <CloudSun className="w-4.5 h-4.5 text-amber-500" />
                </div>
                <div>
                  <div className={`text-xs font-extrabold ${textPrimary}`}>7-Day Movement Forecast</div>
                  <div className={`text-[11px] mt-0.5 leading-relaxed ${textSecondary}`}>
                    Every day gets a 0–100 hunt score with prime morning/evening windows, cold front & barometer alerts, and solunar times.
                  </div>
                </div>
              </div>

              <div className={`p-3.5 rounded-2xl border flex items-start gap-3 ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-slate-50/[var(--card-opacity)] border-slate-200'}`}>
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Target className="w-4.5 h-4.5 text-emerald-500" />
                </div>
                <div>
                  <div className={`text-xs font-extrabold ${textPrimary}`}>Map Your Grounds</div>
                  <div className={`text-[11px] mt-0.5 leading-relaxed ${textSecondary}`}>
                    Plot stands, bedding areas, food plots & travel routes, then get wind-matched stand recommendations.
                  </div>
                </div>
              </div>

              <div className={`p-3.5 rounded-2xl border flex items-start gap-3 ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-slate-50/[var(--card-opacity)] border-slate-200'}`}>
                <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
                  <BellRing className="w-4.5 h-4.5 text-sky-500" />
                </div>
                <div>
                  <div className={`text-xs font-extrabold ${textPrimary}`}>Get Alerts</div>
                  <div className={`text-[11px] mt-0.5 leading-relaxed ${textSecondary}`}>
                    Optional push notifications for cold fronts, rain breaks & prime days — even when the app is closed.
                  </div>
                </div>
              </div>

              <button
                onClick={() => setStep(1)}
                className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.01] active:scale-[0.99] ${accentBtn}`}
              >
                Get Started <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* STEP 2: Pick your location */}
          {step === 1 && (
            <div className="space-y-3">
              <p className={`text-xs font-bold uppercase tracking-wider ${textSecondary}`}>Where do you hunt?</p>

              <div className="relative" ref={searchContainerRef}>
                <div
                  className={`flex items-center border rounded-xl px-3.5 py-2.5 transition-all ${
                    isDark
                      ? 'bg-slate-950 border-slate-700 focus-within:border-emerald-500'
                      : 'bg-slate-100 border-slate-200 focus-within:border-emerald-600'
                  }`}
                >
                  <Search className={`w-4 h-4 mr-2 flex-shrink-0 ${textSecondary}`} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setShowDropdown(true)}
                    placeholder="Search city, county, or zip code..."
                    className={`w-full bg-transparent text-sm focus:outline-none ${isDark ? 'text-white placeholder-slate-500' : 'text-slate-900 placeholder-slate-400'}`}
                  />
                  {isSearching && (
                    <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin ml-2 flex-shrink-0" />
                  )}
                </div>

                {showDropdown && searchResults.length > 0 && (
                  <div
                    className={`absolute top-full left-0 right-0 mt-1.5 border rounded-xl shadow-2xl overflow-hidden z-50 max-h-56 overflow-y-auto divide-y ${
                      isDark
                        ? 'bg-slate-900 border-slate-700 divide-slate-800 text-slate-200'
                        : 'bg-white border-slate-200 divide-slate-100 text-slate-800'
                    }`}
                  >
                    {searchResults.map((loc, idx) => (
                      <button
                        key={idx}
                        onClick={() => selectLocation(loc)}
                        className={`w-full text-left px-3.5 py-2.5 transition-colors flex items-center gap-2 text-xs cursor-pointer ${
                          isDark ? 'hover:bg-emerald-950/50 hover:text-emerald-300' : 'hover:bg-emerald-50 hover:text-emerald-800'
                        }`}
                      >
                        <MapPin className={`w-3.5 h-3.5 flex-shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                        <div className="min-w-0">
                          <span className="font-semibold">{loc.name}</span>
                          <span className={`ml-1 text-[10px] ${textSecondary}`}>
                            {loc.admin1 ? `${loc.admin1}, ` : ''}{loc.country}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleGps}
                disabled={isLocating}
                className={`w-full py-2.5 rounded-xl border text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 ${
                  isDark
                    ? 'bg-slate-950/[var(--card-opacity)] border-slate-700 text-slate-200 hover:border-emerald-500/60'
                    : 'bg-slate-50/[var(--card-opacity)] border-slate-200 text-slate-700 hover:border-emerald-500/60'
                }`}
              >
                <Compass className={`w-4 h-4 text-emerald-500 ${isLocating ? 'animate-spin' : ''}`} />
                {isLocating ? 'Locating...' : 'Use My GPS Location'}
              </button>

              <button
                onClick={() => setStep(0)}
                className={`w-full py-2 text-[11px] font-bold flex items-center justify-center gap-1 ${textSecondary} hover:underline`}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Back
              </button>
            </div>
          )}

          {/* STEP 3: Confirm & finish */}
          {step === 2 && (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-2xl border flex items-center gap-3 ${
                  isDark ? 'bg-emerald-950/40 border-emerald-500/40' : 'bg-emerald-50 border-emerald-300'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0 shadow-md">
                  <Check className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <div className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                    Your Hunting Grounds
                  </div>
                  <div className={`text-sm font-extrabold truncate ${textPrimary}`}>{selectedLoc?.name}</div>
                  <div className={`text-[11px] truncate ${textSecondary}`}>
                    {selectedLoc?.admin1 ? `${selectedLoc.admin1}, ` : ''}{selectedLoc?.country}
                  </div>
                </div>
              </div>

              <p className={`text-xs leading-relaxed ${textSecondary}`}>
                This will be your default starting location and will be saved to your hunting grounds list. You can change it anytime from Settings.
              </p>

              <button
                onClick={() => onComplete(selectedLoc)}
                className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.01] active:scale-[0.99] ${accentBtn}`}
              >
                Start Hunting <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => setStep(1)}
                className={`w-full py-2 text-[11px] font-bold flex items-center justify-center gap-1 ${textSecondary} hover:underline`}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Change location
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
