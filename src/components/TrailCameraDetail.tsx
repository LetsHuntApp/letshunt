import React, { useState, useEffect, useRef } from 'react';
import { X, Star, Trash2, Calendar, Clock, MapPin, Wind, Thermometer, Gauge, Droplets, Moon, Sun, Camera, FileText, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, Save, Crosshair, Navigation, Target, AlertCircle, Eraser } from 'lucide-react';
import { ThemeMode, ThemeVariantMode, TrailCameraPhoto, TrailCameraLocation, TrailCameraTarget } from '../types';
import { getFullImageBlob, getThumbnailUrl, saveFullImageBlob, updatePhoto, matchWeatherForPhoto } from '../services/trailCameraService';
import { downloadPhotoBlob, getPhotoDownloadUrl } from '../services/b2Service';
import { getActiveClub } from '../services/huntClubService';

interface TrailCameraDetailProps {
  theme?: ThemeVariantMode;
  isDark?: boolean;
  photo: TrailCameraPhoto;
  photos: TrailCameraPhoto[];
  onClose: () => void;
  onUpdatePhoto: (id: string, updates: Partial<TrailCameraPhoto>) => void;
  onDeletePhoto: (id: string) => void;
  onNavigate: (photo: TrailCameraPhoto) => void;
  locations: TrailCameraLocation[];
  targets: TrailCameraTarget[];
  onAssignLocation: (id: string, locationId: string) => void;
  showToast: (msg: string) => void;
  units?: string;
  pressureUnit?: string;
}

export const TrailCameraDetail: React.FC<TrailCameraDetailProps> = ({
  theme,
  isDark = theme === 'dark',
  photo,
  photos,
  onClose,
  onUpdatePhoto,
  onDeletePhoto,
  onNavigate,
  locations,
  targets,
  onAssignLocation,
  showToast,
  units = 'imperial',
  pressureUnit = 'inHg',
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const imageFallbackAttemptRef = useRef(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [notes, setNotes] = useState(photo.notes || '');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [selectedLocId, setSelectedLocId] = useState(photo.cameraLocationId || '');
  const [useGpsCoords, setUseGpsCoords] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [editDate, setEditDate] = useState<string>(''); // 'YYYY-MM-DDTHH:mm' for datetime-local

  const currentIndex = photos.findIndex((p) => p.id === photo.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;

  // Theme-aware card background
  const cardBg = isDark
    ? 'bg-slate-900/[calc(var(--card-opacity)*0.5)] border border-slate-800'
    : theme === 'hunting'
    ? 'bg-[#eae1cf]/[var(--card-opacity)] border border-[#d4c4a8]'
    : theme === 'olive'
    ? 'bg-[#f7f5ed]/[var(--card-opacity)] border border-[#d8d2c0]'
    : 'bg-white/[var(--card-opacity)] border border-slate-200';

  const inputBg = isDark
    ? 'bg-slate-900 border-slate-700 text-white'
    : theme === 'hunting'
    ? 'bg-[#f4eee1] border-[#d4c4a8] text-[#2a1b0e]'
    : theme === 'olive'
    ? 'bg-[#f7f5ed] border-[#d8d2c0] text-[#1e2e1b]'
    : 'bg-white border-slate-300 text-slate-900';

  const selectBg = isDark
    ? 'bg-slate-900/[calc(var(--card-opacity)*0.7)] border-slate-700/80 text-white'
    : theme === 'hunting'
    ? 'bg-[#f4eee1] border-[#d4c4a8] text-[#2a1b0e]'
    : theme === 'olive'
    ? 'bg-[#f7f5ed] border-[#d8d2c0] text-[#1e2e1b]'
    : 'bg-slate-50 border-slate-300 text-slate-900';

  const modalBg = isDark
    ? 'bg-slate-950 border-slate-800 text-slate-100'
    : theme === 'hunting'
    ? 'bg-[#eae1cf] border-[#d4c4a8] text-[#2a1b0e]'
    : theme === 'olive'
    ? 'bg-[#f7f5ed] border-[#d8d2c0] text-[#1e2e1b]'
    : 'bg-white border-slate-200 text-slate-900';

  const buttonSecondaryBg = isDark
    ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
    : theme === 'hunting'
    ? 'bg-[#e8ddca] hover:bg-[#e0d6c0] border-[#d4c4a8] text-[#2a1b0e]'
    : theme === 'olive'
    ? 'bg-[#e8e3d5] hover:bg-[#e0dbce] border-[#d8d2c0] text-[#1e2e1b]'
    : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-900';

  useEffect(() => {
    let objectUrl: string | null = null;
    let active = true;
    imageFallbackAttemptRef.current = 0;

    const loadCloudOrThumbnail = async () => {
      // Photos restored from a HuntClub may have only their thumbnail locally.
      // Download the B2 bytes, cache them in IndexedDB, and display that blob
      // so a club-loaded photo becomes a normal offline-capable full-res photo.
      const club = getActiveClub();
      if (club) {
        try {
          const cloudBlob = await downloadPhotoBlob(club.id, photo.id);
          await saveFullImageBlob(photo.id, cloudBlob);
          if (active) {
            objectUrl = URL.createObjectURL(cloudBlob);
            setImageUrl(objectUrl);
            return;
          }
        } catch (error) {
          console.warn('[trail cam] full-resolution cloud download unavailable:', error);

          // Keep the signed URL fallback for environments where the image can
          // be rendered from B2 but a direct fetch is blocked by CORS.
          try {
            const cloudUrl = await getPhotoDownloadUrl(club.id, photo.id);
            if (active) {
              setImageUrl(cloudUrl);
              return;
            }
          } catch (urlError) {
            console.warn('[trail cam] full-resolution cloud preview unavailable:', urlError);
          }
        }
      }

      const thumb = await getThumbnailUrl(photo.id);
      if (active) setImageUrl(thumb || null);
    };

    const loadFullImage = async () => {
      setImageUrl(null);
      setZoomLevel(1);
      setNotes(photo.notes || '');
      setSelectedLocId(photo.cameraLocationId || '');
      setIsEditingDate(false);
      if (photo.dateTime) {
        const d = new Date(photo.dateTime);
        const pad = (n: number) => String(n).padStart(2, '0');
        setEditDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
      } else {
        // Pre-fill with the current local date/time so the user only has
        // to correct it instead of typing from scratch.
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        setEditDate(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`);
      }

      try {
        const blob = await getFullImageBlob(photo.id);
        if (!active) return;
        if (blob && blob.size > 0) {
          objectUrl = URL.createObjectURL(blob);
          setImageUrl(objectUrl);
          return;
        }
      } catch (error) {
        // IndexedDB can temporarily fail after a PWA restore or storage
        // eviction. Continue to the cloud/thumbnail fallbacks instead of
        // leaving the detail view stuck on "Loading Full Image...".
        console.warn('[trail cam] local full-resolution preview unavailable:', error);
      }

      await loadCloudOrThumbnail();
    };

    loadFullImage();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo.id]);

  // If a locally cached blob or signed cloud URL is stale/corrupt, retry the
  // other full-resolution source before finally falling back to the thumbnail.
  const handleImageError = async () => {
    const attempt = imageFallbackAttemptRef.current;
    if (attempt === 0) {
      imageFallbackAttemptRef.current = 1;
      const club = getActiveClub();
      if (club) {
        try {
          const cloudUrl = await getPhotoDownloadUrl(club.id, photo.id);
          setImageUrl(cloudUrl);
          return;
        } catch (error) {
          console.warn('[trail cam] cloud full-resolution retry unavailable:', error);
        }
      }
    }

    if (imageFallbackAttemptRef.current <= 1) {
      imageFallbackAttemptRef.current = 2;
      const thumb = await getThumbnailUrl(photo.id);
      setImageUrl(thumb || null);
      return;
    }

    setImageUrl(null);
  };

  const handleSaveNotes = () => {
    onUpdatePhoto(photo.id, { notes });
    setIsEditingNotes(false);
  };

  const handleSaveDate = async () => {
    if (!editDate) {
      showToast('Pick a date and time first');
      return;
    }
    const d = new Date(editDate);
    if (isNaN(d.getTime())) {
      showToast('Invalid date/time chosen');
      return;
    }
    const newDateTime = d.toISOString();
    // Clear the cached weather so it gets re-fetched for the new date.
    // Match against the photo's GPS first, fall back to its assigned spot.
    onUpdatePhoto(photo.id, { dateTime: newDateTime, weather: undefined });
    setIsEditingDate(false);
    showToast('Date saved');

    let lat = photo.latitude;
    let lon = photo.longitude;
    if ((lat == null || lon == null) && photo.cameraLocationId) {
      const loc = locations.find((l) => l.id === photo.cameraLocationId);
      if (loc && loc.latitude != null && loc.longitude != null) {
        lat = loc.latitude;
        lon = loc.longitude;
      }
    }
    if (lat != null && lon != null) {
      const weather = await matchWeatherForPhoto({
        ...photo,
        dateTime: newDateTime,
        latitude: lat,
        longitude: lon,
        weather: undefined,
      });
      if (weather) {
        onUpdatePhoto(photo.id, { weather, latitude: lat, longitude: lon });
        showToast('Date saved, weather re-matched');
      } else {
        onUpdatePhoto(photo.id, { latitude: lat, longitude: lon });
      }
    }
  };

  const handleClearDate = () => {
    // Clear both the date and the cached weather row so stale data isn't
    // served for an undated photo.
    onUpdatePhoto(photo.id, { dateTime: undefined, weather: undefined });
    setEditDate('');
    setIsEditingDate(false);
    showToast('Date cleared');
  };

  const handlePrev = () => {
    if (hasPrev) onNavigate(photos[currentIndex - 1]);
  };

  const handleNext = () => {
    if (hasNext) onNavigate(photos[currentIndex + 1]);
  };

  const handleLocationChange = (locId: string) => {
    setSelectedLocId(locId);
    if (locId) {
      onAssignLocation(photo.id, locId);
    }
  };

  const handleAssignGpsLocation = async () => {
    let lat = photo.latitude;
    let lon = photo.longitude;

    if (!lat || !lon) {
      if (!navigator.geolocation) {
        onUpdatePhoto(photo.id, { cameraLocationId: '__gps__', cameraLocationName: 'Current GPS Location' });
        showToast('Geolocation not supported by your browser');
        return;
      }
      setGpsLoading(true);
      await new Promise<void>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            lat = pos.coords.latitude;
            lon = pos.coords.longitude;
            setGpsLoading(false);
            resolve();
          },
          (err) => {
            setGpsLoading(false);
            showToast('GPS location access denied or unavailable');
            resolve();
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });
    }

    if (lat && lon) {
      const weather = await matchWeatherForPhoto({ ...photo, latitude: lat, longitude: lon, weather: undefined });
      if (weather) {
        await updatePhoto(photo.id, {
          weather,
          latitude: lat,
          longitude: lon,
          cameraLocationId: '__gps__',
          cameraLocationName: `GPS ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
        });
        onUpdatePhoto(photo.id, {
          weather,
          latitude: lat,
          longitude: lon,
          cameraLocationId: '__gps__',
          cameraLocationName: `GPS ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
        });
        showToast(`Weather matched for ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
      } else {
        onUpdatePhoto(photo.id, {
          latitude: lat,
          longitude: lon,
          cameraLocationId: '__gps__',
          cameraLocationName: `GPS ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
        });
        showToast(`GPS location set, weather is unavailable for this time/place`);
      }
    }
  };

  const handleToggleTag = (targetId: string) => {
    const current = photo.tags || [];
    const updated = current.includes(targetId)
      ? current.filter((t) => t !== targetId)
      : [...current, targetId];
    onUpdatePhoto(photo.id, { tags: updated });
  };

  const d = photo.dateTime ? new Date(photo.dateTime) : null;
  const dateStr = d ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown Date';
  const timeStr = d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Unknown Time';

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col md:flex-row overflow-hidden animate-fadeIn">
      {/* Top Mobile Bar */}
      <div className="md:hidden flex items-center justify-between p-3 bg-black/80 border-b border-slate-800 text-white z-20">
        <span className="font-extrabold text-xs truncate max-w-[200px]">{photo.fileName}</span>
        <button onClick={onClose} className="p-2 rounded-xl bg-slate-800 text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Image Viewport Area */}
      <div className="relative flex-1 flex items-center justify-center bg-black p-2 sm:p-4 overflow-hidden select-none">
        {imageUrl ? (
          <div className="relative w-full h-full flex items-center justify-center overflow-auto">
            <img
              src={imageUrl}
              alt={photo.fileName}
              onError={() => { void handleImageError(); }}
              style={{ transform: `scale(${zoomLevel})`, transition: 'transform 0.15s ease-out' }}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl origin-center"
            />
          </div>
        ) : (
          <div className="text-slate-500 text-xs font-bold animate-pulse">Loading Full Image...</div>
        )}

        {/* Floating Zoom Controls */}
        <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1 bg-slate-900/80 border border-slate-700/80 backdrop-blur-md p-1.5 rounded-2xl text-white shadow-xl">
          <button
            onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
            className="p-1.5 hover:bg-slate-800 rounded-xl transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <span className="text-xs font-black px-1 min-w-[36px] text-center">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
            className="p-1.5 hover:bg-slate-800 rounded-xl transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          {zoomLevel !== 1 && (
            <button
              onClick={() => setZoomLevel(1)}
              className="p-1.5 hover:bg-slate-800 rounded-xl text-amber-400"
              title="Reset Zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Prev / Next Navigation Arrows */}
        {hasPrev && (
          <button
            onClick={handlePrev}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 p-3 rounded-2xl bg-slate-900/80 border border-slate-700 text-white hover:bg-slate-800 transition-all shadow-xl hover:scale-105"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        {hasNext && (
          <button
            onClick={handleNext}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 p-3 rounded-2xl bg-slate-900/80 border border-slate-700 text-white hover:bg-slate-800 transition-all shadow-xl hover:scale-105"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Sidebar Metadata & Weather Details */}
      <div
        className={`w-full md:w-80 lg:w-96 flex flex-col justify-between border-t md:border-t-0 md:border-l p-4 sm:p-5 overflow-y-auto max-h-[50vh] md:max-h-full ${modalBg}`}
      >
        <div className="space-y-4">
          {/* Header Row */}
          <div className="hidden md:flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-500">
              Photo Metadata
            </span>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-800/20 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Action Row: Favorite & Delete */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              onClick={() => onUpdatePhoto(photo.id, { isFavorite: !photo.isFavorite })}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all border ${
                photo.isFavorite
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                  : buttonSecondaryBg
              }`}
            >
              <Star className={`w-4 h-4 ${photo.isFavorite ? 'fill-slate-950' : ''}`} />
              <span>{photo.isFavorite ? 'Favorited' : 'Favorite'}</span>
            </button>

            <button
              onClick={() => {
                if (confirm('Delete this photo permanently?')) {
                  onDeletePhoto(photo.id);
                  onClose();
                }
              }}
              className="p-2 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 transition-all"
              title="Delete Photo"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Capture Date & Time — read-only or editable with manual picker */}
          <div className={`space-y-2 p-3 rounded-2xl ${cardBg} text-xs`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-black uppercase tracking-wider opacity-70 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-emerald-400" /> Capture Date & Time
              </label>
              {!isEditingDate && (
                <button
                  onClick={() => setIsEditingDate(true)}
                  className="text-xs text-emerald-400 hover:underline font-bold"
                >
                  {photo.dateTime ? 'Edit Date' : 'Set Date'}
                </button>
              )}
            </div>

            {isEditingDate ? (
              <div className="space-y-2">
                <input
                  type="datetime-local"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className={`w-full p-2 text-xs rounded-xl border outline-none focus:border-emerald-500 ${inputBg}`}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveDate}
                    className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <Save className="w-3.5 h-3.5" /> Save Date
                  </button>
                  <button
                    onClick={() => setIsEditingDate(false)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-xl ${buttonSecondaryBg}`}
                  >
                    Cancel
                  </button>
                </div>
                {photo.dateTime && (
                  <button
                    onClick={handleClearDate}
                    className="w-full py-1.5 text-rose-400 hover:text-white hover:bg-rose-600/80 text-xs font-bold rounded-xl border border-rose-500/30 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Eraser className="w-3.5 h-3.5" /> Clear Date (re-OCR or re-enter)
                  </button>
                )}
              </div>
            ) : !photo.dateTime ? (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-extrabold mb-1">No date on this photo</div>
                  <div className="opacity-90 leading-snug">
                    OCR couldn't read the timestamp bar. Tap <span className="font-extrabold">"Set Date"</span> above to enter it manually so this photo counts in analytics.
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold">{dateStr}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold">{timeStr}</span>
                </div>
                {photo.dateTime && (
                  <div className="text-xs opacity-50 font-mono pt-0.5">
                    Stored as: {photo.dateTime}
                  </div>
                )}
              </>
            )}

            {photo.cameraModel && (
              <div className="flex items-center gap-2 opacity-80 pt-1">
                <Camera className="w-4 h-4 text-slate-400" />
                <span>Model: {photo.cameraModel}</span>
              </div>
            )}
          </div>

          {/* Camera Location Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-black uppercase tracking-wider opacity-70 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-sky-400" /> Camera Spot
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={selectedLocId}
                onChange={(e) => handleLocationChange(e.target.value)}
                className={`w-full min-w-0 flex-1 p-2 text-xs font-bold rounded-xl border max-h-40 overflow-y-auto ${selectBg}`}
              >
                <option value="">Unassigned Location</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAssignGpsLocation}
                disabled={gpsLoading}
                className={`w-full sm:w-auto justify-center px-2 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1 flex-shrink-0 ${
                  isDark
                    ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                }`}
                title="Use GPS to set photo location"
              >
                {gpsLoading ? (
                  <Navigation className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Navigation className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">GPS</span>
                  </>
                )}
              </button>
            </div>
            {photo.latitude && photo.longitude && (
              <div className="text-xs font-mono opacity-60 flex items-center gap-1">
                <Target className="w-3 h-3" /> EXIF GPS: {photo.latitude.toFixed(4)}, {photo.longitude.toFixed(4)}
              </div>
            )}
          </div>

          {/* Target Tags */}
          <div className="space-y-1.5">
            <label className="text-xs font-black uppercase tracking-wider opacity-70 flex items-center gap-1">
              <Crosshair className="w-3.5 h-3.5 text-emerald-400" /> Target Tags
            </label>
            {targets.length === 0 ? (
              <p className="text-xs opacity-50 italic">No targets defined. Create some from the gallery view.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {targets.map((t) => {
                  const active = (photo.tags || []).includes(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => handleToggleTag(t.id)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold border transition-all ${
                        active
                          ? 'text-white shadow-md'
                          : 'opacity-60 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor: active ? t.color : 'transparent',
                        borderColor: t.color,
                        color: active ? '#fff' : undefined,
                      }}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                      {t.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Historical Weather Info */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-wider opacity-70">
              Historical Weather Conditions
            </label>

            {photo.weather ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className={`p-2.5 rounded-xl flex items-center gap-2 ${cardBg}`}>
                  <Thermometer className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <div>
                    <div className="opacity-60 text-xs">Temp</div>
                    <div className="font-bold">{units === 'metric' ? Math.round((photo.weather.temperature - 32) * 5 / 9) : photo.weather.temperature}°{units === 'metric' ? 'C' : 'F'}</div>
                  </div>
                </div>

                <div className={`p-2.5 rounded-xl flex items-center gap-2 ${cardBg}`}>
                  <Wind className="w-4 h-4 text-sky-400 flex-shrink-0" />
                  <div>
                    <div className="opacity-60 text-xs">Wind</div>
                    <div className="font-bold">{photo.weather.windDirection} {units === 'metric' ? `${photo.weather.windSpeedKmh}km/h` : `${photo.weather.windSpeedMph}mph`}</div>
                  </div>
                </div>

                <div className={`p-2.5 rounded-xl flex items-center gap-2 ${cardBg}`}>
                  <Gauge className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <div>
                    <div className="opacity-60 text-xs">Pressure</div>
                    <div className="font-bold">{pressureUnit === 'hPa' ? `${photo.weather.pressureHpa} hPa` : `${photo.weather.pressureInHg} inHg`} ({photo.weather.pressureTrend})</div>
                  </div>
                </div>

                <div className={`p-2.5 rounded-xl flex items-center gap-2 ${cardBg}`}>
                  <Droplets className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <div>
                    <div className="opacity-60 text-xs">Humidity</div>
                    <div className="font-bold">{photo.weather.humidity}%</div>
                  </div>
                </div>

                <div className={`p-2.5 rounded-xl flex items-center gap-2 col-span-2 ${cardBg}`}>
                  <Moon className="w-4 h-4 text-amber-300 flex-shrink-0" />
                  <div>
                    <div className="opacity-60 text-xs">Moon Phase</div>
                    <div className="font-bold">{photo.weather.moonPhaseName} ({photo.weather.moonIllumination}% lit)</div>
                  </div>
                </div>

                <div className={`p-2.5 rounded-xl col-span-2 ${cardBg}`}>
                  <div className="opacity-60 text-xs">Weather Condition</div>
                  <div className="font-bold">{photo.weather.weatherDesc}</div>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs text-center font-semibold">
                No historical weather matched yet. Assign a camera location above to fetch local weather data.
              </div>
            )}
          </div>

          {/* User Notes */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-black uppercase tracking-wider opacity-70 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> Hunter Notes
              </label>
              {!isEditingNotes && (
                <button
                  onClick={() => setIsEditingNotes(true)}
                  className="text-xs text-emerald-400 hover:underline font-bold"
                >
                  Edit Notes
                </button>
              )}
            </div>

            {isEditingNotes ? (
              <div className="space-y-2">
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add observations (e.g. 8-pointer heading east, mature doe with fawn)..."
                  className={`w-full p-2.5 text-xs rounded-xl border outline-none focus:border-emerald-500 ${inputBg}`}
                />
                <button
                  onClick={handleSaveNotes}
                  className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md"
                >
                  <Save className="w-3.5 h-3.5" /> Save Notes
                </button>
              </div>
            ) : (
              <div className={`p-3 rounded-xl border ${cardBg} text-xs font-semibold opacity-90 italic`}>
                {photo.notes || 'No notes added for this photo yet.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
