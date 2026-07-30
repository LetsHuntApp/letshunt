import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Camera, LayoutGrid, BarChart3, Plus, MapPin, Crosshair, Navigation, Target, TreePine, X, Search } from 'lucide-react';
import { ThemeMode, Location, TrailCameraPhoto, TrailCameraFilterState, TrailCameraLocation, TrailCameraTab, TrailCameraTarget, SavedPin } from '../types';
import { TrailCameraImport } from './TrailCameraImport';
import { TrailCameraFilters } from './TrailCameraFilters';
import { TrailCameraGallery } from './TrailCameraGallery';
import { TrailCameraDetail } from './TrailCameraDetail';
import { TrailCameraAnalytics } from './TrailCameraAnalytics';
import { TrailCameraTargetManager } from './TrailCameraTargetManager';
import {
  getAllPhotos,
  importPhotos,
  deletePhotos,
  updatePhoto,
  getCameraLocations,
  saveCameraLocation,
  getTargets,
  saveTarget,
  deleteTarget,
  filterPhotos,
  computeAnalytics,
  matchWeatherForPhoto,
} from '../services/trailCameraService';
import { searchLocations } from '../services/weatherService';

interface TrailCameraViewProps {
  theme: ThemeMode;
  currentLocation: Location;
  units: string;
  pressureUnit: string;
  showToast: (msg: string) => void;
}

export const TrailCameraView: React.FC<TrailCameraViewProps> = ({
  theme,
  currentLocation,
  units,
  pressureUnit,
  showToast,
}) => {
  const isDark = theme === 'dark';
  const isHunting = theme === 'hunting';
  const isOlive = theme === 'olive' || theme === 'hunting';

  const [activeTab, setActiveTab] = useState<TrailCameraTab>('gallery');
  const [photos, setPhotos] = useState<TrailCameraPhoto[]>([]);
  const [locations, setLocations] = useState<TrailCameraLocation[]>([]);
  const [targets, setTargets] = useState<TrailCameraTarget[]>([]);
  const [mapPins, setMapPins] = useState<SavedPin[]>([]);
  const [filter, setFilter] = useState<TrailCameraFilterState>({});
  const [selectedPhoto, setSelectedPhoto] = useState<TrailCameraPhoto | null>(null);

  // Import State
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ completed: number; total: number } | null>(null);

  // New Location Modal State
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [newLocName, setNewLocName] = useState('');
  const [newLocLat, setNewLocLat] = useState<number | null>(null);
  const [newLocLon, setNewLocLon] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Location Search State
  const [locSearchQuery, setLocSearchQuery] = useState('');
  const [locSearchResults, setLocSearchResults] = useState<Location[]>([]);
  const [locSearchLoading, setLocSearchLoading] = useState(false);
  const [showLocDropdown, setShowLocDropdown] = useState(false);
  const locSearchRef = useRef<HTMLDivElement>(null);

  // Debounced location search
  useEffect(() => {
    if (!locSearchQuery || locSearchQuery.trim().length < 2) {
      setLocSearchResults([]);
      setLocSearchLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      setLocSearchLoading(true);
      const results = await searchLocations(locSearchQuery);
      setLocSearchResults(results);
      setLocSearchLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [locSearchQuery]);

  // Click outside handler for location search dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (locSearchRef.current && !locSearchRef.current.contains(e.target as Node)) {
        setShowLocDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Target Manager State
  const [isTargetManagerOpen, setIsTargetManagerOpen] = useState(false);

  // Reset location search state when modal opens
  useEffect(() => {
    if (!isLocationModalOpen) {
      setLocSearchQuery('');
      setLocSearchResults([]);
      setShowLocDropdown(false);
    }
  }, [isLocationModalOpen]);

  // Load photos & locations on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const allPhotos = await getAllPhotos();
      const allLocs = await getCameraLocations();
      const allTargets = await getTargets();

      // Load map pins from localStorage (stands, food plots, etc.)
      let savedPins: SavedPin[] = [];
      try {
        const raw = localStorage.getItem('letshunt_saved_pins');
        if (raw) savedPins = JSON.parse(raw);
      } catch { /* ignore parse errors */ }
      setMapPins(savedPins);

      // Ensure current active location exists in saved camera locations
      if (allLocs.length === 0 && currentLocation) {
        const defaultCamLoc: TrailCameraLocation = {
          id: `loc_${Date.now()}`,
          name: currentLocation.name,
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        };
        await saveCameraLocation(defaultCamLoc);
        allLocs.push(defaultCamLoc);
      }

      setPhotos(allPhotos);
      setLocations(allLocs);
      setTargets(allTargets);

      // Auto match weather for photos in background
      matchWeatherBackground(allPhotos, allLocs);
    } catch (err) {
      console.error('Failed to load trail camera data:', err);
      showToast('Failed to load trail camera data');
    }
  };

  // Merge camera locations with map pins for the spots list
  const allSpots = useMemo(() => {
    const locIds = new Set(locations.map((l) => l.id));
    const fromPins: TrailCameraLocation[] = mapPins
      .filter((p) => !locIds.has(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        latitude: p.lat,
        longitude: p.lng,
        _isMapPin: true,
      }));
    return [...locations, ...fromPins];
  }, [locations, mapPins]);

  // Background Historical Weather Fetcher
  const matchWeatherBackground = async (photoList: TrailCameraPhoto[], locList: TrailCameraLocation[]) => {
    const unMatched = photoList.filter((p) => !p.weather);
    if (unMatched.length === 0) return;

    for (const p of unMatched) {
      let lat = p.latitude;
      let lon = p.longitude;

      if ((lat == null || lon == null) && p.cameraLocationId) {
        const loc = locList.find((l) => l.id === p.cameraLocationId);
        if (loc) {
          lat = loc.latitude;
          lon = loc.longitude;
        }
      }

      // Fallback to default location
      if ((lat == null || lon == null) && currentLocation) {
        lat = currentLocation.latitude;
        lon = currentLocation.longitude;
      }

      if (lat != null && lon != null) {
        const photoWithCoords = { ...p, latitude: lat, longitude: lon };
        const weather = await matchWeatherForPhoto(photoWithCoords);
        if (weather) {
          await updatePhoto(p.id, { weather, latitude: lat, longitude: lon });
        }
      }
    }

    // Refresh after background fetch completes
    const updated = await getAllPhotos();
    setPhotos(updated);
  };

  // Import Handler
  const handleStartImport = async (files: FileList | File[]) => {
    setImporting(true);
    setImportProgress({ completed: 0, total: files.length });

    try {
      const imported = await importPhotos(files, (completed, total) => {
        setImportProgress({ completed, total });
      });

      if (imported.length === 0) {
        showToast('No photos could be imported. Check console for details.');
      } else {
        showToast(`Imported ${imported.length} trail camera photo(s)!`);
      }

      // Auto assign to default location if unassigned
      const defaultLoc = locations[0];
      if (defaultLoc) {
        for (const p of imported) {
          if (!p.cameraLocationId) {
            await updatePhoto(p.id, {
              cameraLocationId: defaultLoc.id,
              cameraLocationName: defaultLoc.name,
              latitude: defaultLoc.latitude,
              longitude: defaultLoc.longitude,
            });
          }
        }
      }

      const freshPhotos = await getAllPhotos();
      setPhotos(freshPhotos);
      matchWeatherBackground(freshPhotos, locations);
    } catch (err) {
      console.error('Error importing photos:', err);
      showToast('Failed to import photos.');
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  // Toggle Favorite
  const handleToggleFavorite = async (photo: TrailCameraPhoto) => {
    const updated = !photo.isFavorite;
    await updatePhoto(photo.id, { isFavorite: updated });
    setPhotos((prev) =>
      prev.map((p) => (p.id === photo.id ? { ...p, isFavorite: updated } : p))
    );
  };

  // Update Photo
  const handleUpdatePhoto = async (id: string, updates: Partial<TrailCameraPhoto>) => {
    await updatePhoto(id, updates);
    setPhotos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  };

  // Delete Photos
  const handleDeletePhotos = async (ids: string[]) => {
    await deletePhotos(ids);
    setPhotos((prev) => prev.filter((p) => !ids.includes(p.id)));
    showToast(`Deleted ${ids.length} photo(s)`);
  };

  // Assign Location (supports both camera locations and map pins)
  const handleAssignLocation = async (ids: string | string[], locationId: string) => {
    const targetLoc = allSpots.find((l) => l.id === locationId);
    if (!targetLoc) return;

    // If it's a map pin not yet saved as camera location, save it now
    if (!locations.some((l) => l.id === targetLoc.id)) {
      await saveCameraLocation(targetLoc);
      setLocations((prev) => [...prev, targetLoc]);
    }

    const idArray = Array.isArray(ids) ? ids : [ids];
    for (const id of idArray) {
      await updatePhoto(id, {
        cameraLocationId: targetLoc.id,
        cameraLocationName: targetLoc.name,
        latitude: targetLoc.latitude,
        longitude: targetLoc.longitude,
        weather: undefined, // Clear old weather so it re-fetches for new location
      });
    }

    const fresh = await getAllPhotos();
    setPhotos(fresh);
    showToast(`Assigned ${idArray.length} photo(s) to spot "${targetLoc.name}"`);
    matchWeatherBackground(fresh, locations);
  };

  // Assign Tags (bulk)
  const handleAssignTags = async (ids: string[], targetId: string) => {
    for (const id of ids) {
      const photo = photos.find((p) => p.id === id);
      if (!photo) continue;
      const current = photo.tags || [];
      if (!current.includes(targetId)) {
        await updatePhoto(id, { tags: [...current, targetId] });
      }
    }
    const fresh = await getAllPhotos();
    setPhotos(fresh);
    const t = targets.find((x) => x.id === targetId);
    showToast(`Tagged ${ids.length} photo(s) as "${t?.name || 'target'}"`);
  };

  // Add New Location
  const handleAddLocation = async () => {
    if (!newLocName.trim()) return;
    const newLoc: TrailCameraLocation = {
      id: `loc_${Date.now()}`,
      name: newLocName.trim(),
      latitude: newLocLat ?? currentLocation.latitude,
      longitude: newLocLon ?? currentLocation.longitude,
    };
    await saveCameraLocation(newLoc);
    setLocations([...locations, newLoc]);
    setNewLocName('');
    setNewLocLat(null);
    setNewLocLon(null);
    setIsLocationModalOpen(false);
    showToast(`Added camera spot "${newLoc.name}"`);
  };

  const handleUseGPS = () => {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNewLocLat(pos.coords.latitude);
        setNewLocLon(pos.coords.longitude);
        setGpsLoading(false);
        showToast(`GPS location set: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
      },
      (err) => {
        setGpsLoading(false);
        showToast('GPS location access denied or unavailable');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSelectLocation = (loc: Location) => {
    setNewLocName(loc.name);
    setNewLocLat(loc.latitude);
    setNewLocLon(loc.longitude);
    setLocSearchQuery('');
    setLocSearchResults([]);
    setShowLocDropdown(false);
    showToast(`Selected: ${loc.name}`);
  };

  const handleSelectMapPin = (pin: SavedPin) => {
    setNewLocName(pin.name);
    setNewLocLat(pin.lat);
    setNewLocLon(pin.lng);
    showToast(`Selected map pin: ${pin.name}`);
  };

  // Filtered Photos
  const filteredPhotos = useMemo(() => {
    return filterPhotos(photos, filter);
  }, [photos, filter]);

  // Analytics
  const analytics = useMemo(() => {
    return computeAnalytics(photos, units, pressureUnit);
  }, [photos, units, pressureUnit]);

  // Theme-aware class helpers
  const cardBase = 'rounded-2xl border p-4 sm:p-5 backdrop-blur-xl shadow-xl space-y-3';
  const cardBg = isDark
    ? 'bg-slate-900/80 border-slate-800 text-slate-100'
    : isHunting
    ? 'bg-[#eae1cf] border-[#d4c4a8] text-[#2a1b0e]'
    : isOlive
    ? 'bg-[#f7f5ed] border-[#d8d2c0] text-[#1e2e1b]'
    : 'bg-white border-slate-200 text-slate-900';

  const inputBase = 'w-full p-2 text-sm rounded-xl border outline-none';
  const inputBg = isDark
    ? 'bg-slate-950 border-slate-700 text-white'
    : 'bg-slate-50 border-slate-300 text-slate-900';

  const buttonPrimary = 'px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer flex items-center gap-1';
  const buttonPrimaryBg = isDark
    ? 'bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-500'
    : 'bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-500';

  const buttonSecondary = 'px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer flex items-center gap-1';
  const buttonSecondaryBg = isDark
    ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
    : isHunting
    ? 'bg-[#e8ddca] border-[#d4c4a8] text-[#2a1b0e] hover:bg-[#dccab8]'
    : isOlive
    ? 'bg-[#efe9d7] border-[#d8d2c0] text-[#1e2e1b] hover:bg-[#e5dfcd]'
    : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200';

  const buttonDanger = 'px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer flex items-center gap-1';
  const buttonDangerBg = 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500/30 shadow-md';

  const buttonSky = 'px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer flex items-center gap-1';
  const buttonSkyBg = 'bg-sky-600 hover:bg-sky-500 text-white border-sky-500/30 shadow-md';

  const modalBg = isDark
    ? 'bg-slate-900 border-slate-700 text-slate-100'
    : isHunting
    ? 'bg-[#eae1cf] border-[#d4c4a8] text-[#2a1b0e]'
    : isOlive
    ? 'bg-[#f7f5ed] border-[#d8d2c0] text-[#1e2e1b]'
    : 'bg-white border-slate-200 text-slate-900';

  const modalInputBg = isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900';

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Header Card */}
      <div className={`${cardBase} ${cardBg} flex flex-wrap items-center justify-between gap-4`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-500 flex-shrink-0">
            <Camera className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black tracking-tight">Trail Camera Intelligence</h2>
            <p className="text-xs opacity-70">
              Bulk photo import, automatic historical weather matching & deer movement analytics.
            </p>
          </div>
        </div>

        {/* Sub-Tab Navigation Buttons */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-950/40 p-1 rounded-xl border border-slate-800/80">
          <button
            onClick={() => setActiveTab('gallery')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'gallery'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : isDark
                ? 'text-slate-400 hover:text-white'
                : isHunting
                ? 'text-[#8b7355] hover:text-[#2a1b0e]'
                : isOlive
                ? 'text-[#6e6a5e] hover:text-[#1e2e1b]'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Gallery ({photos.length})
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : isDark
                ? 'text-slate-400 hover:text-white'
                : isHunting
                ? 'text-[#8b7355] hover:text-[#2a1b0e]'
                : isOlive
                ? 'text-[#6e6a5e] hover:text-[#1e2e1b]'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" /> Analytics
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'gallery' && (
        <div className="space-y-4">
          {/* Import Dropzone Component */}
          <TrailCameraImport
            theme={theme}
            importing={importing}
            progress={importProgress}
            onStartImport={handleStartImport}
            onImportComplete={loadData}
          />

          {/* Location Management Strip */}
          <div className={`${cardBase} ${cardBg} flex items-center justify-between gap-2 p-3 text-xs`}>
            <div className="flex items-center gap-2 overflow-x-auto py-0.5">
              <span className="font-bold opacity-70 flex items-center gap-1 flex-shrink-0">
                <MapPin className="w-3.5 h-3.5 text-sky-400" /> Spots:
              </span>
              {allSpots.length === 0 ? (
                <span className="text-[10px] opacity-50 italic">No spots added yet</span>
              ) : (
                allSpots.map((spot) => {
                  return (
                    <span
                      key={spot.id}
                      className={`px-2.5 py-1 rounded-lg font-bold border flex-shrink-0 flex items-center gap-1 ${
                        spot._isMapPin
                          ? 'text-amber-300 bg-amber-900/40 border-amber-600/40'
                          : 'text-sky-300 bg-slate-900/60 border-slate-700'
                      }`}
                    >
                      {spot._isMapPin ? <TreePine className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
                      {spot.name}
                    </span>
                  );
                })
              )}
            </div>

            <button
              onClick={() => setIsLocationModalOpen(true)}
              className={`${buttonPrimary} ${buttonPrimaryBg} flex-shrink-0 shadow-md`}
            >
              <Plus className="w-3.5 h-3.5" /> Add Spot
            </button>
          </div>

          {/* Target Management Strip */}
          <div className={`${cardBase} ${cardBg} flex items-center justify-between gap-2 p-3 text-xs`}>
            <div className="flex items-center gap-2 overflow-x-auto py-0.5">
              <span className="font-bold opacity-70 flex items-center gap-1 flex-shrink-0">
                <Crosshair className="w-3.5 h-3.5 text-emerald-400" /> Targets:
              </span>
              {targets.length === 0 ? (
                <span className="text-[10px] opacity-50 italic">No targets defined</span>
              ) : (
                targets.map((t) => (
                  <span
                    key={t.id}
                    className="px-2.5 py-1 rounded-lg font-bold flex-shrink-0 text-white text-[11px] flex items-center gap-1"
                    style={{ backgroundColor: t.color }}
                  >
                    <Crosshair className="w-3 h-3" />
                    {t.name}
                  </span>
                ))
              )}
            </div>

            <button
              onClick={() => setIsTargetManagerOpen(true)}
              className={`${buttonPrimary} ${buttonPrimaryBg} flex-shrink-0 shadow-md`}
            >
              <Crosshair className="w-3.5 h-3.5" /> Manage Targets
            </button>
          </div>

          {/* Filter Panel */}
          <TrailCameraFilters
            theme={theme}
            filter={filter}
            onFilterChange={setFilter}
            locations={allSpots}
            targets={targets}
            totalPhotosCount={photos.length}
            filteredPhotosCount={filteredPhotos.length}
          />

          {/* Photo Gallery Grid */}
          <TrailCameraGallery
            theme={theme}
            photos={filteredPhotos}
            onSelectPhoto={(photo) => setSelectedPhoto(photo)}
            onToggleFavorite={handleToggleFavorite}
            onToggleTag={(photo, targetId) => {
              const current = photo.tags || [];
              const updated = current.includes(targetId)
                ? current.filter((t) => t !== targetId)
                : [...current, targetId];
              handleUpdatePhoto(photo.id, { tags: updated });
            }}
            onDeletePhotos={handleDeletePhotos}
            onAssignLocation={handleAssignLocation}
            onAssignTags={handleAssignTags}
            locations={allSpots}
            targets={targets}
            units={units}
          />
        </div>
      )}

      {activeTab === 'analytics' && (
        <TrailCameraAnalytics
          theme={theme}
          analytics={analytics}
          photos={photos}
          targets={targets}
          filter={filter}
          onFilterChange={setFilter}
          units={units}
          pressureUnit={pressureUnit}
        />
      )}

      {/* Full Resolution Photo Detail Modal */}
      {selectedPhoto && (
        <TrailCameraDetail
          theme={theme}
          photo={selectedPhoto}
          photos={filteredPhotos}
          onClose={() => setSelectedPhoto(null)}
          onUpdatePhoto={handleUpdatePhoto}
          onDeletePhoto={(id) => {
            handleDeletePhotos([id]);
            setSelectedPhoto(null);
          }}
          onNavigate={(p) => setSelectedPhoto(p)}
          locations={allSpots}
          targets={targets}
          onAssignLocation={(id, locId) => handleAssignLocation(id, locId)}
          showToast={showToast}
        />
      )}

      {/* Target Manager Modal */}
      {isTargetManagerOpen && (
        <TrailCameraTargetManager
          theme={theme}
          targets={targets}
          onSave={async (t) => {
            await saveTarget(t);
            setTargets([...targets, t]);
          }}
          onDelete={async (id) => {
            await deleteTarget(id);
            setTargets(targets.filter((x) => x.id !== id));
          }}
          onClose={() => setIsTargetManagerOpen(false)}
        />
      )}

      {/* Add New Camera Location Modal */}
      {isLocationModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${modalBg} rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl`}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold flex items-center gap-2">
                <MapPin className="w-5 h-5 text-sky-400" /> New Trail Cam Spot
              </h3>
              <button onClick={() => setIsLocationModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs opacity-70">
              Name your spot, then use the location search or GPS below to set coordinates for precise weather matching.
            </p>

            <input
              type="text"
              placeholder="Camera Spot Name..."
              value={newLocName}
              onChange={(e) => setNewLocName(e.target.value)}
              className={`w-full p-2.5 text-sm rounded-xl border outline-none ${modalInputBg}`}
            />

            {/* Location Search */}
            <div className="relative" ref={locSearchRef}>
              <div className={`flex items-center border rounded-xl px-2.5 py-2 transition-all ${
                isDark
                  ? 'bg-slate-950 border-slate-700 focus-within:border-emerald-500'
                  : 'bg-slate-50 border-slate-300 focus-within:border-emerald-600'
              }`}>
                <Search className={`w-3.5 h-3.5 mr-2 flex-shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                <input
                  type="text"
                  placeholder="Search for a town or city..."
                  value={locSearchQuery}
                  onChange={(e) => { setLocSearchQuery(e.target.value); setShowLocDropdown(true); }}
                  onFocus={() => { if (locSearchResults.length > 0) setShowLocDropdown(true); }}
                  className={`w-full bg-transparent text-xs font-semibold outline-none ${isDark ? 'text-white placeholder-slate-500' : 'text-slate-900 placeholder-slate-400'}`}
                />
                {locSearchLoading && (
                  <Navigation className="w-3.5 h-3.5 ml-2 animate-spin text-emerald-400 flex-shrink-0" />
                )}
              </div>

              {/* Search Results Dropdown */}
              {showLocDropdown && locSearchResults.length > 0 && (
                <div className={`absolute z-50 left-0 right-0 mt-1 rounded-xl border shadow-2xl overflow-hidden ${
                  isDark ? 'bg-slate-950 border-slate-700' : 'bg-white border-slate-200'
                }`}>
                  {locSearchResults.map((loc, idx) => (
                    <button
                      key={`${loc.latitude}_${loc.longitude}_${idx}`}
                      type="button"
                      onClick={() => handleSelectLocation(loc)}
                      className={`w-full flex items-start gap-2 px-3 py-2.5 text-left transition-colors cursor-pointer ${
                        isDark ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-slate-100 text-slate-800'
                      }`}
                    >
                      <MapPin className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${isDark ? 'text-sky-400' : 'text-sky-600'}`} />
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">{loc.name}</div>
                        <div className="text-[10px] opacity-60 truncate">{[loc.admin1, loc.country].filter(Boolean).join(', ')}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* From Map Pins */}
            {mapPins.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider opacity-70 flex items-center gap-1">
                  <TreePine className="w-3.5 h-3.5 text-amber-400" /> From Your Map
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {mapPins.map((pin) => (
                    <button
                      key={pin.id}
                      type="button"
                      onClick={() => handleSelectMapPin(pin)}
                      className={`px-2 py-1 rounded-lg text-xs font-bold border transition-all flex items-center gap-1 cursor-pointer ${
                        newLocLat === pin.lat && newLocLon === pin.lng
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                          : isDark
                          ? 'bg-slate-900/60 border-slate-700 text-amber-300 hover:bg-slate-800'
                          : 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                      }`}
                    >
                      <TreePine className="w-3 h-3" />
                      {pin.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* GPS Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleUseGPS}
                  disabled={gpsLoading}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all border cursor-pointer ${
                    isDark
                      ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-40'
                      : 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40'
                  }`}
                >
                  {gpsLoading ? (
                    <>
                      <Navigation className="w-3.5 h-3.5 animate-spin" /> Getting GPS...
                    </>
                  ) : (
                    <>
                      <Navigation className="w-3.5 h-3.5" /> Set GPS Location
                    </>
                  )}
                </button>
              </div>

              {(newLocLat != null || newLocLon != null) && (
                <div className="flex items-center gap-2 text-xs font-mono opacity-80">
                  <Target className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{newLocLat?.toFixed(6)}, {newLocLon?.toFixed(6)}</span>
                  <button
                    type="button"
                    onClick={() => { setNewLocLat(null); setNewLocLon(null); }}
                    className="ml-auto text-slate-400 hover:text-white text-[10px] font-bold uppercase tracking-wider"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsLocationModalOpen(false)}
                className={`px-3 py-1.5 text-sm font-bold rounded-xl ${buttonSecondaryBg}`}
              >
                Cancel
              </button>
              <button
                disabled={!newLocName.trim()}
                onClick={handleAddLocation}
                className={`px-4 py-1.5 text-sm font-bold rounded-xl ${buttonSkyBg} disabled:opacity-50`}
              >
                Save Spot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};