import React, { useState, useEffect } from 'react';
import { Star, Trash2, MapPin, Calendar, Clock, Wind, Thermometer, CheckSquare, Square, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { ThemeMode, TrailCameraPhoto, TrailCameraLocation } from '../types';
import { getThumbnailUrl } from '../services/trailCameraService';

interface TrailCameraGalleryProps {
  theme: ThemeMode;
  photos: TrailCameraPhoto[];
  onSelectPhoto: (photo: TrailCameraPhoto) => void;
  onToggleFavorite: (photo: TrailCameraPhoto) => void;
  onDeletePhotos: (ids: string[]) => void;
  onAssignLocation: (ids: string[], locationId: string) => void;
  locations: TrailCameraLocation[];
}

const ITEMS_PER_PAGE = 36;

const getThemeClasses = (theme: ThemeMode) => {
  const isDark = theme === 'dark';
  const isHunting = theme === 'hunting';
  const isOlive = theme === 'olive';

  return {
    cardBg: isDark
      ? 'bg-slate-900/40 backdrop-blur-md border border-slate-700/50'
      : isHunting
      ? 'bg-[#eae1cf]/80 border-[#d4c4a8]'
      : isOlive
      ? 'bg-[#f7f5ed]/80 border-[#d8d2c0]'
      : 'bg-white/60 border-slate-200/50',
    cardBorder: isDark ? 'border-slate-700/50' : isHunting ? 'border-[#d4c4a8]' : isOlive ? 'border-[#d8d2c0]' : 'border-slate-200/50',
    selectModeBtn: isSelectMode => isSelectMode
      ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-extrabold'
      : isDark
      ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
      : isHunting
      ? 'bg-[#eae1cf] border-[#d4c4a8] text-[#2a1b0e] hover:bg-[#d8cbb8]'
      : isOlive
      ? 'bg-[#f7f5ed] border-[#d8d2c0] text-[#1e2e1b] hover:bg-[#e8e4d5]'
      : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200',
    selectAllBtn: isDark
      ? 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300'
      : isHunting
      ? 'bg-[#eae1cf] hover:bg-[#d8cbb8] border-[#d4c4a8] text-[#2a1b0e]'
      : isOlive
      ? 'bg-[#f7f5ed] hover:bg-[#e8e4d5] border-[#d8d2c0] text-[#1e2e1b]'
      : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700',
    photoCard: isSelected => isSelected
      ? 'ring-4 ring-emerald-500 border-emerald-500 scale-[0.98]'
      : isDark
      ? 'bg-slate-900 border-slate-800 hover:border-slate-600'
      : isHunting
      ? 'bg-[#eae1cf] border-[#d4c4a8] hover:border-[#c85a17]'
      : isOlive
      ? 'bg-[#f7f5ed] border-[#d8d2c0] hover:border-[#556b2f]'
      : 'bg-white border-slate-200 hover:border-slate-400',
    loadingBg: isDark ? 'bg-slate-800' : isHunting ? 'bg-[#d4c4a8]' : isOlive ? 'bg-[#e8e4d5]' : 'bg-slate-200',
    paginationBg: isDark
      ? 'bg-slate-900/40 backdrop-blur-md border border-slate-700/50'
      : isHunting
      ? 'bg-[#eae1cf]/80 border-[#d4c4a8]'
      : isOlive
      ? 'bg-[#f7f5ed]/80 border-[#d8d2c0]'
      : 'bg-white/60 border-slate-200/50',
    modalBg: isDark
      ? 'bg-slate-900 border border-slate-700 text-slate-100'
      : isHunting
      ? 'bg-[#eae1cf] border-[#d4c4a8] text-[#2a1b0e]'
      : isOlive
      ? 'bg-[#f7f5ed] border-[#d8d2c0] text-[#1e2e1b]'
      : 'bg-white border-slate-200 text-slate-900',
    selectBg: isDark ? 'bg-slate-950 border-slate-700 text-white' : isHunting ? 'bg-[#eae1cf] border-[#d4c4a8] text-[#2a1b0e]' : isOlive ? 'bg-[#f7f5ed] border-[#d8d2c0] text-[#1e2e1b]' : 'bg-slate-50 border-slate-300 text-slate-900',
    cancelBtn: isDark
      ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
      : isHunting
      ? 'bg-[#eae1cf] hover:bg-[#d8cbb8] border-[#d4c4a8] text-[#2a1b0e]'
      : isOlive
      ? 'bg-[#f7f5ed] hover:bg-[#e8e4d5] border-[#d8d2c0] text-[#1e2e1b]'
      : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700',
  };
};

export const TrailCameraGallery: React.FC<TrailCameraGalleryProps> = ({
  theme,
  photos,
  onSelectPhoto,
  onToggleFavorite,
  onDeletePhotos,
  onAssignLocation,
  locations,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [assignLocationModalOpen, setAssignLocationModalOpen] = useState(false);
  const [targetLocationId, setTargetLocationId] = useState('');

  const totalPages = Math.ceil(photos.length / ITEMS_PER_PAGE) || 1;
  const paginatedPhotos = photos.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const tc = getThemeClasses(theme);

  // Load thumbnails for current page
  useEffect(() => {
    let active = true;
    const loadThumbnails = async () => {
      const newThumbs: Record<string, string> = {};
      for (const p of paginatedPhotos) {
        if (!thumbnails[p.id]) {
          const url = await getThumbnailUrl(p.id);
          if (url) newThumbs[p.id] = url;
        }
      }
      if (active && Object.keys(newThumbs).length > 0) {
        setThumbnails((prev) => ({ ...prev, ...newThumbs }));
      }
    };
    loadThumbnails();
    return () => { active = false; };
  }, [currentPage, photos]);

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === paginatedPhotos.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedPhotos.map((p) => p.id));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedIds.length} photo(s)?`)) {
      onDeletePhotos(selectedIds);
      setSelectedIds([]);
    }
  };

  const handleAssignSelectedLocation = () => {
    if (selectedIds.length === 0 || !targetLocationId) return;
    onAssignLocation(selectedIds, targetLocationId);
    setSelectedIds([]);
    setAssignLocationModalOpen(false);
  };

  return (
    <div className="space-y-4">
      {/* Gallery Action Bar */}
      <div className={`flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl ${tc.cardBg}`}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setIsSelectMode(!isSelectMode);
              setSelectedIds([]);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${tc.selectModeBtn(isSelectMode)}`}
          >
            {isSelectMode ? 'Cancel Selection' : 'Select Multiple'}
          </button>

          {isSelectMode && (
            <>
              <button
                onClick={handleSelectAll}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${tc.selectAllBtn}`}
              >
                {selectedIds.length === paginatedPhotos.length ? 'Deselect All' : 'Select All Page'}
              </button>

              <span className="text-xs font-bold opacity-80">
                {selectedIds.length} selected
              </span>
            </>
          )}
        </div>

        {isSelectMode && selectedIds.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAssignLocationModalOpen(true)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-md"
            >
              <MapPin className="w-3.5 h-3.5" /> Assign Camera Spot
            </button>

            <button
              onClick={handleDeleteSelected}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-md"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete ({selectedIds.length})
            </button>
          </div>
        )}
      </div>

      {/* Photos Grid */}
      {paginatedPhotos.length === 0 ? (
        <div className="text-center py-16 space-y-3 opacity-60">
          <p className="text-sm font-bold">No photos match your current filter or no photos imported yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {paginatedPhotos.map((photo) => {
            const isSelected = selectedIds.includes(photo.id);
            const thumbUrl = thumbnails[photo.id];
            const dateStr = photo.dateTime ? new Date(photo.dateTime).toLocaleDateString() : '';
            const timeStr = photo.dateTime ? new Date(photo.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

            return (
              <div
                key={photo.id}
                onClick={() => {
                  if (isSelectMode) {
                    setSelectedIds((prev) =>
                      prev.includes(photo.id) ? prev.filter((i) => i !== photo.id) : [...prev, photo.id]
                    );
                  } else {
                    onSelectPhoto(photo);
                  }
                }}
                className={`group relative rounded-2xl overflow-hidden border transition-all duration-200 cursor-pointer shadow-lg aspect-square flex flex-col justify-between ${tc.photoCard(isSelected)}`}
              >
                {/* Image Background */}
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={photo.fileName}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className={`absolute inset-0 ${tc.loadingBg} animate-pulse flex items-center justify-center text-xs text-slate-500`}>
                    Loading...
                  </div>
                )}

                {/* Gradient Overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />

                {/* Top Card Bar */}
                <div className="relative p-2 flex items-center justify-between z-10">
                  {isSelectMode ? (
                    <button
                      onClick={(e) => handleToggleSelect(photo.id, e)}
                      className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                        isSelected
                          ? 'bg-emerald-500 text-slate-950 shadow-md'
                          : 'bg-black/50 text-white/80 hover:bg-black/80'
                      }`}
                    >
                      {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(photo);
                      }}
                      className={`p-1.5 rounded-xl transition-all backdrop-blur-md ${
                        photo.isFavorite
                          ? 'bg-amber-500 text-slate-950 shadow-md'
                          : 'bg-black/40 text-white/70 hover:text-amber-400 hover:bg-black/60'
                      }`}
                    >
                      <Star className={`w-3.5 h-3.5 ${photo.isFavorite ? 'fill-slate-950' : ''}`} />
                    </button>
                  )}

                  {photo.notes && (
                    <span className="p-1 rounded-lg bg-black/50 text-emerald-400 backdrop-blur-md" title="Has notes">
                      <FileText className="w-3 h-3" />
                    </span>
                  )}
                </div>

                {/* Bottom Card Info */}
                <div className="relative p-2 text-white text-[11px] space-y-0.5 z-10 leading-tight">
                  <div className="font-extrabold truncate drop-shadow">{dateStr} {timeStr}</div>
                  {photo.cameraLocationName && (
                    <div className="text-[10px] text-sky-300 font-bold truncate flex items-center gap-0.5">
                      <MapPin className="w-2.5 h-2.5 flex-shrink-0" /> {photo.cameraLocationName}
                    </div>
                  )}

                  {photo.weather && (
                    <div className="flex items-center gap-2 text-[10px] font-semibold text-emerald-300 opacity-90 pt-0.5">
                      <span>{photo.weather.temperature}°F</span>
                      <span>•</span>
                      <span>{photo.weather.windDirection} {photo.weather.windSpeedMph}mph</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className={`flex items-center justify-between p-3 rounded-2xl ${tc.paginationBg} text-xs font-bold`}>
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1.5 rounded-xl border text-slate-300 disabled:opacity-40 cursor-pointer flex items-center gap-1"
            style={{ backgroundColor: theme === 'dark' ? '#1e293b' : theme === 'hunting' ? '#d4c4a8' : theme === 'olive' ? '#d8d2c0' : '#f1f5f9', borderColor: theme === 'dark' ? '#334155' : theme === 'hunting' ? '#d4c4a8' : theme === 'olive' ? '#d8d2c0' : '#e2e8f0' }}
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>

          <span>
            Page {currentPage} of {totalPages} ({photos.length} photos)
          </span>

          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="px-3 py-1.5 rounded-xl border text-slate-300 disabled:opacity-40 cursor-pointer flex items-center gap-1"
            style={{ backgroundColor: theme === 'dark' ? '#1e293b' : theme === 'hunting' ? '#d4c4a8' : theme === 'olive' ? '#d8d2c0' : '#f1f5f9', borderColor: theme === 'dark' ? '#334155' : theme === 'hunting' ? '#d4c4a8' : theme === 'olive' ? '#d8d2c0' : '#e2e8f0' }}
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Assign Location Modal */}
      {assignLocationModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${tc.modalBg} rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl`}>
            <h3 className="text-base font-extrabold flex items-center gap-2">
              <MapPin className="w-5 h-5 text-sky-400" /> Assign Camera Spot
            </h3>
            <p className="text-xs opacity-70">
              Assign {selectedIds.length} selected photo(s) to a saved camera location to fetch historical weather.
            </p>

            <select
              value={targetLocationId}
              onChange={(e) => setTargetLocationId(e.target.value)}
              className={`w-full p-2 text-xs rounded-xl border ${tc.selectBg}`}
            >
              <option value="">Select a Camera Location...</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setAssignLocationModalOpen(false)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl ${tc.cancelBtn}`}
              >
                Cancel
              </button>
              <button
                disabled={!targetLocationId}
                onClick={handleAssignSelectedLocation}
                className="px-3 py-1.5 text-xs font-bold rounded-xl bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};