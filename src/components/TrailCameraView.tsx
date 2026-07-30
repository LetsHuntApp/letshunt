import React, { useState, useEffect, useMemo } from 'react';
import { Camera, LayoutGrid, BarChart3, Sparkles, Plus, MapPin, Trash2, X, RefreshCw } from 'lucide-react';
import { ThemeMode, Location, TrailCameraPhoto, TrailCameraFilterState, TrailCameraLocation, TrailCameraTab } from '../types';
import { TrailCameraImport } from './TrailCameraImport';
import { TrailCameraFilters } from './TrailCameraFilters';
import { TrailCameraGallery } from './TrailCameraGallery';
import { TrailCameraDetail } from './TrailCameraDetail';
import { TrailCameraAnalytics } from './TrailCameraAnalytics';
import { TrailCameraInsights } from './TrailCameraInsights';
import {
  getAllPhotos,
  importPhotos,
  deletePhotos,
  updatePhoto,
  getCameraLocations,
  saveCameraLocation,
  deleteCameraLocation,
  filterPhotos,
  computeAnalytics,
  generateInsights,
  matchWeatherForPhoto,
  getCachedAnalytics,
  setCachedAnalytics,
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
  const [activeTab, setActiveTab] = useState<TrailCameraTab>('gallery');
  const [photos, setPhotos] = useState<TrailCameraPhoto[]>([]);
  const [locations, setLocations] = useState<TrailCameraLocation[]>([]);
  const [filter, setFilter] = useState<TrailCameraFilterState>({});
  const [selectedPhoto, setSelectedPhoto] = useState<TrailCameraPhoto | null>(null);

  // Import State
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ completed: number; total: number } | null>(null);

  // New Location Modal State
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [newLocName, setNewLocName] = useState('');

  // Load photos & locations on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const allPhotos = await getAllPhotos();
      const allLocs = await getCameraLocations();

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

      // Auto match weather for photos in background
      matchWeatherBackground(allPhotos, allLocs);
    } catch (err) {
      console.error('Failed to load trail camera data:', err);
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

      showToast(`Imported ${imported.length} trail camera photo(s)!`);

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

  // Add New Location
  const handleAddLocation = async () => {
    if (!newLocName.trim()) return;
    const newLoc: TrailCameraLocation = {
      id: `loc_${Date.now()}`,
      name: newLocName.trim(),
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
    };
    await saveCameraLocation(newLoc);
    setLocations([...locations, newLoc]);
    setNewLocName('');
    setIsLocationModalOpen(false);
    showToast(`Added camera spot "${newLoc.name}"`);
  };

  // Filtered Photos
  const filteredPhotos = useMemo(() => {
    return filterPhotos(photos, filter);
  }, [photos, filter]);

  // Analytics & Insights
  const { analytics, insights } = useMemo(() => {
    const cached = getCachedAnalytics();
    if (cached) return { analytics: cached.data, insights: cached.insights };

    const data = computeAnalytics(photos);
    const ins = generateInsights(photos, data);
    setCachedAnalytics(data, ins);
    return { analytics: data, insights: ins };
  }, [photos]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Header Card */}
      <div
        className={`rounded-2xl border p-4 sm:p-5 backdrop-blur-xl shadow-xl flex flex-wrap items-center justify-between gap-4 ${
          isDark
            ? 'bg-slate-900/80 border-slate-800 text-slate-100'
            : theme === 'hunting'
            ? 'bg-[#eae1cf] border-[#d4c4a8] text-[#2a1b0e]'
            : (theme === 'olive' || theme === 'hunting')
            ? 'bg-[#f7f5ed] border-[#d8d2c0] text-[#1e2e1b]'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-500 flex-shrink-0">
            <Camera className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black tracking-tight">
              Trail Camera Intelligence
            </h2>
            <p className="text-xs opacity-70">
              Bulk photo import, automatic historical weather matching & deer movement analytics.
            </p>
          </div>
        </div>

        {/* Sub-Tab Navigation Buttons */}
        <div className="flex items-center gap-1 bg-slate-950/40 p-1 rounded-xl border border-slate-800/80">
          <button
            onClick={() => setActiveTab('gallery')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'gallery'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Gallery ({photos.length})
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" /> Analytics
          </button>

          <button
            onClick={() => setActiveTab('insights')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'insights'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
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
          <div className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-slate-900/40 backdrop-blur-md border border-slate-700/50 text-xs">
            <div className="flex items-center gap-2 overflow-x-auto py-0.5">
              <span className="font-bold opacity-70 flex items-center gap-1 flex-shrink-0">
                <MapPin className="w-3.5 h-3.5 text-sky-400" /> Saved Camera Spots:
              </span>
              {locations.map((loc) => (
                <span
                  key={loc.id}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 text-sky-300 font-bold border border-slate-700 flex-shrink-0"
                >
                  {loc.name}
                </span>
              ))}
            </div>

            <button
              onClick={() => setIsLocationModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-extrabold text-xs flex items-center gap-1 flex-shrink-0 cursor-pointer shadow-md"
            >
              <Plus className="w-3.5 h-3.5" /> Add Camera Spot
            </button>
          </div>

          {/* Filter Panel */}
          <TrailCameraFilters
            theme={theme}
            filter={filter}
            onFilterChange={setFilter}
            locations={locations}
            totalPhotosCount={photos.length}
            filteredPhotosCount={filteredPhotos.length}
          />

          {/* Photo Gallery Grid */}
          <TrailCameraGallery
            theme={theme}
            photos={filteredPhotos}
            onSelectPhoto={(photo) => setSelectedPhoto(photo)}
            onToggleFavorite={handleToggleFavorite}
            onDeletePhotos={handleDeletePhotos}
            onAssignLocation={handleAssignLocation}
            locations={locations}
          />
        </div>
      )}

      {activeTab === 'analytics' && (
        <TrailCameraAnalytics theme={theme} analytics={analytics} />
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
          onAssignLocation={(id, locId) => handleAssignLocation(id, locId)}
        />
      )}

      {/* Add New Camera Location Modal */}
      {isLocationModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 text-slate-100 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
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
              className="w-full p-2.5 text-xs rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-sky-500 font-bold"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsLocationModalOpen(false)}
                className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Cancel
              </button>
              <button
                disabled={!newLocName.trim()}
                onClick={handleAddLocation}
                className="px-4 py-1.5 text-xs font-bold rounded-xl bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50"
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
