import React, { useState, useEffect, useMemo } from 'react';
import { Camera, LayoutGrid, BarChart3, Sparkles, Plus, MapPin, Trash2, X, Crosshair, Navigation, Target } from 'lucide-react';
import { ThemeMode, Location, TrailCameraPhoto, TrailCameraFilterState, TrailCameraLocation, TrailCameraTab, TrailCameraTarget } from '../types';
import { TrailCameraImport } from './TrailCameraImport';
import { TrailCameraFilters } from './TrailCameraFilters';
import { TrailCameraGallery } from './TrailCameraGallery';
import { TrailCameraDetail } from './TrailCameraDetail';
import { TrailCameraAnalytics } from './TrailCameraAnalytics';
import { TrailCameraInsights } from './TrailCameraInsights';
import { TrailCameraTargetManager } from './TrailCameraTargetManager';
import {
  getAllPhotos,
  importPhotos,
  deletePhotos,
  updatePhoto,
  getCameraLocations,
  saveCameraLocation,
  deleteCameraLocation,
  getTargets,
  saveTarget,
  deleteTarget,
  filterPhotos,
  computeAnalytics,
  generateInsights,
  matchWeatherForPhoto,
} from '../services/trailCameraService';

interface TrailCameraViewProps {
  theme: ThemeMode;
  currentLocation: Location;
  showToast: (msg: string) => void;
}

export const TrailCameraView: React.FC<TrailCameraViewProps> = ({
  theme,
  currentLocation,
  showToast,
}) => {
  const isDark = theme === 'dark';
  const isHunting = theme === 'hunting';
  const isOlive = theme === 'olive' || theme === 'hunting';

  const [activeTab, setActiveTab] = useState<TrailCameraTab>('gallery');
  const [photos, setPhotos] = useState<TrailCameraPhoto[]>([]);
  const [locations, setLocations] = useState<TrailCameraLocation[]>([]);
  const [targets, setTargets] = useState<TrailCameraTarget[]>([]);
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

  // Target Manager State
  const [isTargetManagerOpen, setIsTargetManagerOpen] = useState(false);

  // Load photos & locations on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const allPhotos = await getAllPhotos();
      const allLocs = await getCameraLocations();
      const allTargets = await getTargets();

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

  // Assign Location
  const handleAssignLocation = async (ids: string | string[], locationId: string) => {
    const targetLoc = locations.find((l) => l.id === locationId);
    if (!targetLoc) return;

    const idArray = Array.isArray(ids) ? ids : [ids];
    for (const id of idArray) {
      await updatePhoto(id, {
        cameraLocationId: targetLoc.id,
        cameraLocationName: targetLoc.name,
        latitude: targetLoc.latitude,
        longitude: targetLoc.longitude,
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

  // Filtered Photos
  const filteredPhotos = useMemo(() => {
    return filterPhotos(photos, filter);
  }, [photos, filter]);

  // Analytics & Insights
  const { analytics, insights } = useMemo(() => {
    const data = computeAnalytics(photos);
    const ins = generateInsights(photos, data);
    return { analytics: data, insights: ins };
  }, [photos]);

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

          <button
            onClick={() => setActiveTab('insights')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'insights'
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
            <Sparkles className="w-3.5 h-3.5" /> Pattern Insights
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
              {locations.map((loc) => (
                <span
                  key={loc.id}
                  className="px-2.5 py-1 rounded-lg font-bold border flex-shrink-0 text-sky-300 bg-slate-900/60 border-slate-700"
                >
                  {loc.name}
                </span>
              ))}
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
            locations={locations}
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
            locations={locations}
            targets={targets}
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
        />
      )}

      {activeTab === 'insights' && (
        <TrailCameraInsights
          theme={theme}
          insights={insights}
          totalPhotosCount={photos.length}
          weatherMatchedCount={analytics.withWeather}
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
          locations={locations}
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
              Create a camera location name (e.g. "North Ridge Scrape", "Pond Stand Cam") to link imported photos for precise weather matching.
            </p>

            <input
              type="text"
              placeholder="Camera Spot Name..."
              value={newLocName}
              onChange={(e) => setNewLocName(e.target.value)}
              className={`w-full p-2.5 text-sm rounded-xl border outline-none ${modalInputBg}`}
            />

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