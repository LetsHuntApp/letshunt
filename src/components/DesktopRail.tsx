/// <reference types="vite/client" />
import React from 'react';
import { LayoutDashboard, Map, ScrollText, Camera, Settings, Leaf } from 'lucide-react';
import { ThemeVariantMode } from '../types';

/* 'details' is a dashboard sub-route, not a rail destination — it appears in
   this union only so the active-state check can narrow on it. It mirrors
   Header's activeTab type exactly. */
type Tab = 'dashboard' | 'settings' | 'map' | 'logs' | 'trailcams' | 'details';

interface DesktopRailProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  theme?: ThemeVariantMode;
  isDark?: boolean;
  /** Rendered under the nav, above the version footer (e.g. current location). */
  children?: React.ReactNode;
}

/* Desktop-only left navigation rail.

   The phone layout puts these same five destinations in a fixed bottom bar
   and a cramped horizontal tab strip in the header. On a laptop neither
   reads well: the horizontal strip squeezes five uppercase labels plus the
   logo and search box onto one 53px row, and it costs the page its full
   width. This rail moves the same navigation to the left edge, where it
   stops eating horizontal space and gives the app a desktop app-frame.

   Rendered only at >=1024px (see `.desktop-rail` in index.css and the
   `hidden lg:flex` guard below), so the mobile bottom nav and header tabs
   remain completely untouched on phones.

   Tab order, labels, icons, and per-tab accent colors are copied verbatim
   from the mobile bottom nav in App.tsx so the two navigations read as the
   same app. */

interface RailItem {
  key: Tab;
  label: string;
  Icon: typeof LayoutDashboard;
  /** Active-state class. Mirrors the mobile bottom nav's per-tab accent. */
  active: string;
  inactive: string;
}

export function DesktopRail({
  activeTab,
  onTabChange,
  theme = 'dark',
  isDark = true,
  children,
}: DesktopRailProps) {
  const items: RailItem[] = [
    {
      key: 'dashboard',
      label: 'Dashboard',
      Icon: LayoutDashboard,
      active: isDark
        ? 'text-emerald-400 bg-emerald-400/10'
        : theme === 'olive' || theme === 'hunting'
        ? 'text-[#556b2f] bg-[#556b2f]/10'
        : 'text-emerald-600 bg-emerald-50',
      inactive: isDark
        ? 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800/50'
        : theme === 'olive' || theme === 'hunting'
        ? 'text-[#3d4f21] hover:text-[#556b2f] hover:bg-[#e0dcc8]/50'
        : 'text-slate-500 hover:text-emerald-700 hover:bg-slate-100',
    },
    {
      key: 'map',
      label: 'Map',
      Icon: Map,
      active: isDark
        ? 'text-emerald-400 bg-emerald-400/10'
        : theme === 'olive' || theme === 'hunting'
        ? 'text-[#556b2f] bg-[#556b2f]/10'
        : 'text-emerald-600 bg-emerald-50',
      inactive: isDark
        ? 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800/50'
        : theme === 'olive' || theme === 'hunting'
        ? 'text-[#3d4f21] hover:text-[#556b2f] hover:bg-[#e0dcc8]/50'
        : 'text-slate-500 hover:text-emerald-700 hover:bg-slate-100',
    },
    {
      key: 'logs',
      label: 'Logs',
      Icon: ScrollText,
      active: isDark
        ? 'text-amber-400 bg-amber-400/10'
        : theme === 'olive' || theme === 'hunting'
        ? 'text-amber-600 bg-amber-100/60'
        : 'text-amber-600 bg-amber-50',
      inactive: isDark
        ? 'text-slate-400 hover:text-amber-400 hover:bg-slate-800/50'
        : theme === 'olive' || theme === 'hunting'
        ? 'text-[#3d4f21] hover:text-[#b45309] hover:bg-[#e0dcc8]/50'
        : 'text-slate-500 hover:text-amber-700 hover:bg-slate-100',
    },
    {
      key: 'trailcams',
      label: 'Trail Cams',
      Icon: Camera,
      active: isDark
        ? 'text-sky-400 bg-sky-400/10'
        : theme === 'olive' || theme === 'hunting'
        ? 'text-sky-600 bg-sky-100/60'
        : 'text-sky-600 bg-sky-50',
      inactive: isDark
        ? 'text-slate-400 hover:text-sky-400 hover:bg-slate-800/50'
        : theme === 'olive' || theme === 'hunting'
        ? 'text-[#3d4f21] hover:text-sky-600 hover:bg-[#e0dcc8]/50'
        : 'text-slate-500 hover:text-sky-700 hover:bg-slate-100',
    },
    {
      key: 'settings',
      label: 'Settings',
      Icon: Settings,
      active: isDark
        ? 'text-slate-200 bg-slate-800/70'
        : theme === 'olive' || theme === 'hunting'
        ? 'text-[#3d4f21] bg-[#556b2f]/10'
        : 'text-slate-900 bg-slate-200',
      inactive: isDark
        ? 'text-slate-400 hover:text-white hover:bg-slate-800/50'
        : theme === 'olive' || theme === 'hunting'
        ? 'text-[#3d4f21] hover:text-[#556b2f] hover:bg-[#e0dcc8]/50'
        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100',
    },
  ];

  // 'details' is a sub-route of the dashboard, so the Dashboard item stays
  // highlighted while the user is on a single-day detail view — same rule
  // the mobile bottom nav and header tabs use.
  const isActive = (key: Tab) =>
    key === 'dashboard'
      ? activeTab === 'dashboard' || activeTab === 'details'
      : activeTab === key;

  return (
    <aside
      className={`desktop-rail hidden lg:flex flex-col border-r backdrop-blur-md transition-colors ${
        isDark
          ? theme === 'hunting'
            ? 'bg-[#26221c] border-[#4a4034]'
            : theme === 'olive'
            ? 'bg-[#1c2614] border-[#2c3d1f]'
            : 'bg-slate-900/[var(--card-opacity)] border-slate-800'
          : theme === 'hunting'
          ? 'bg-[#f4eee1]/[var(--card-opacity)] border-[#d4c4a8]'
          : theme === 'olive'
          ? 'bg-[#f7f5ed]/[var(--card-opacity)] border-[#d8d2c0]'
          : 'bg-white/[var(--card-opacity)] border-slate-200'
      }`}
    >
      {/* Wordmark. The header's inline logo is SVG-injected with per-theme
          recoloring, so the rail uses a compact icon + wordmark pair rather
          than duplicating that theming logic. */}
      <div className="flex items-center gap-2 px-4 h-14 shrink-0 border-b border-current/10">
        <Leaf
          className={`w-4 h-4 flex-shrink-0 ${
            isDark
              ? theme === 'hunting'
                ? 'text-[#f0ba7a]'
                : theme === 'olive'
                ? 'text-[#c0d094]'
                : 'text-emerald-400'
              : theme === 'hunting'
              ? 'text-[#c85a17]'
              : theme === 'olive'
              ? 'text-[#556b2f]'
              : 'text-emerald-600'
          }`}
        />
        <span
          className={`text-sm font-black tracking-tight ${
            isDark
              ? theme === 'hunting' || theme === 'olive'
                ? 'text-[#d8c8a8]'
                : 'text-white'
              : theme === 'hunting'
              ? 'text-[#2a1b0e]'
              : theme === 'olive'
              ? 'text-[#1e2e1b]'
              : 'text-slate-900'
          }`}
        >
          LetsHunt
        </span>
      </div>

      {/* Primary navigation */}
      <nav className="desktop-rail-nav flex flex-col gap-1 p-3" aria-label="Main">
        {items.map(({ key, label, Icon, active, inactive }) => (
          <button
            key={key}
            type="button"
            onClick={() => onTabChange(key)}
            aria-current={isActive(key) ? 'page' : undefined}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer text-left w-full ${
              isActive(key) ? active : inactive
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}

        {children}
      </nav>

      {/* Footer credit */}
      <div
        className={`px-4 py-3 shrink-0 border-t text-[10px] ${
          isDark
            ? 'border-slate-800/60 text-slate-500'
            : theme === 'hunting'
            ? 'border-[#d4c5a9]/60 text-[#8b7355]'
            : theme === 'olive'
            ? 'border-[#d8d2c0]/60 text-[#6b7a45]'
            : 'border-slate-200/60 text-slate-500'
        }`}
      >
        Deer Forecast Engine
      </div>
    </aside>
  );
}

export default DesktopRail;
