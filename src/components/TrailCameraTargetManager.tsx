import React, { useState } from 'react';
import { X, Plus, Trash2, Crosshair, Palette } from 'lucide-react';
import { ThemeMode, TrailCameraTarget } from '../types';

interface TargetManagerProps {
  theme: ThemeMode;
  targets: TrailCameraTarget[];
  onSave: (target: TrailCameraTarget) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const PRESET_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

export const TrailCameraTargetManager: React.FC<TargetManagerProps> = ({
  theme,
  targets,
  onSave,
  onDelete,
  onClose,
}) => {
  const isDark = theme === 'dark';
  const isHunting = theme === 'hunting';
  const isOlive = theme === 'olive';

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[3]);

  const cardBg = isDark
    ? 'bg-slate-900 border-slate-700 text-slate-100'
    : isHunting
    ? 'bg-[#eae1cf] border-[#d4c4a8] text-[#2a1b0e]'
    : isOlive
    ? 'bg-[#f7f5ed] border-[#d8d2c0] text-[#1e2e1b]'
    : 'bg-white border-slate-200 text-slate-900';

  const inputBg = isDark
    ? 'bg-slate-950 border-slate-700 text-white'
    : 'bg-slate-50 border-slate-300 text-slate-900';

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    onSave({ id: `tgt_${Date.now()}`, name, color: newColor });
    setNewName('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={`${cardBg} rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl`}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold flex items-center gap-2">
            <Crosshair className="w-5 h-5 text-emerald-400" /> Manage Targets
          </h3>
          <button onClick={onClose} className="opacity-60 hover:opacity-100 transition-opacity">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs opacity-70">
          Create targets like "Mature Buck", "Target Doe", "Shooter" to tag photos and analyze patterns per target.
        </p>

        {/* Add New Target */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Target name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            className={`flex-1 min-w-[120px] p-2 text-sm rounded-xl border outline-none ${inputBg}`}
          />
          <div className="flex flex-wrap gap-0.5 items-center">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={`w-5 h-5 rounded-full border-2 transition-all ${
                  newColor === c ? 'border-white scale-125' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <button
            onClick={handleAdd}
            disabled={!newName.trim()}
            className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Target List */}
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {targets.length === 0 ? (
            <div className="text-center py-5 rounded-xl border border-dashed opacity-80">
              <Crosshair className="w-5 h-5 mx-auto text-emerald-400" />
              <p className="text-xs font-bold mt-2">No targets yet</p>
              <p className="text-[11px] opacity-60 mt-1 px-4">
                Type a name above (like "Mature Buck" or "Target Doe") and tap + to create your first target.
              </p>
            </div>
          ) : (
            targets.map((t) => (
              <div
                key={t.id}
                className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold ${
                  isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-black/5 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-3.5 h-3.5 rounded-full"
                    style={{ backgroundColor: t.color }}
                  />
                  <span>{t.name}</span>
                </div>
                <button
                  onClick={() => onDelete(t.id)}
                  className="p-1 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end pt-1">
          <button
            onClick={onClose}
            className={`px-4 py-1.5 text-xs font-bold rounded-xl ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
