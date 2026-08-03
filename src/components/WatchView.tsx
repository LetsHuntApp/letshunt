import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Tv, Shuffle, RefreshCw, Play, ExternalLink, X, Youtube, Clock, LayoutGrid } from 'lucide-react';
import { ThemeMode } from '../types';

interface WatchVideo {
  id: string;
  title: string;
  channelId: string;
  channel: string;
  publishedAt?: string;
  thumb?: string;
  isSeed?: boolean;
}

interface WatchChannel {
  id: string;
  name: string;
  color: string;
}

// Curated deer hunting channels. Each channel is fetched live via its public
// YouTube RSS feed (through a CORS-friendly JSON proxy) so the feed pulls in
// brand-new uploads, with the seed videos below guaranteeing content even
// when the network or the proxy is unavailable.
const CHANNELS: WatchChannel[] = [
  { id: 'UC-lwzUkDAAU2q12Cnc9vEbg', name: 'Realtree', color: '#22c55e' },
  { id: 'UCA7i6_2TiXy1YL5yE4czEXg', name: 'Drury Outdoors', color: '#f59e0b' },
  { id: 'UClRRi9cvDVVBNSnNAYaDeKA', name: 'Canada in the Rough', color: '#ef4444' },
  { id: 'UCzlnaIrdxwJITyrESOReqxg', name: 'The Hunting Public', color: '#8b5cf6' },
  { id: 'UC7jyHQoVzomw7gV3q4H1m7A', name: 'GrowingDeer.tv', color: '#10b981' },
  { id: 'UC7P2vU0_8iK450630h73v4w', name: 'Deer & Deer Hunting', color: '#3b82f6' },
  { id: 'UCiMNtu_Y-gd3ij7BT_clunw', name: 'The Deer Society', color: '#ec4899' },
];

// Guaranteed fallback content so the feed is never empty.
const SEED_VIDEOS: WatchVideo[] = [
  { id: '66RYs_ZKKfY', channelId: 'UC-lwzUkDAAU2q12Cnc9vEbg', channel: 'Realtree', title: 'Turkey Vest Dump | Turkey Hunting Tips', isSeed: true },
  { id: 'z5ff0Teh7uY', channelId: 'UC-lwzUkDAAU2q12Cnc9vEbg', channel: 'Realtree', title: '40 Years of Realtree | Long Live Real', isSeed: true },
  { id: 'AovinoTvL5E', channelId: 'UC-lwzUkDAAU2q12Cnc9vEbg', channel: 'Realtree', title: 'Realtree Outdoors – North Texas', isSeed: true },
  { id: 'IB-3jLJS3K8', channelId: 'UCA7i6_2TiXy1YL5yE4czEXg', channel: 'Drury Outdoors', title: 'November Success: Iowa Rut Rewind | Dream Season Live', isSeed: true },
  { id: 'd476g97vQsU', channelId: 'UCA7i6_2TiXy1YL5yE4czEXg', channel: 'Drury Outdoors', title: "Terry Drury's Recipe for Late-Season Success", isSeed: true },
  { id: 'qgL0jwJjFzI', channelId: 'UCA7i6_2TiXy1YL5yE4czEXg', channel: 'Drury Outdoors', title: "Mark Drury's First Self-Filmed Missouri Giant", isSeed: true },
  { id: 'D1QhGSGVxBA', channelId: 'UClRRi9cvDVVBNSnNAYaDeKA', channel: 'Canada in the Rough', title: 'GIANT Muley (Hunting The Badlands)', isSeed: true },
  { id: 'fSxFKLyqFX0', channelId: 'UClRRi9cvDVVBNSnNAYaDeKA', channel: 'Canada in the Rough', title: 'The BEST Canadian Hunt EVER', isSeed: true },
  { id: 'upwgwCIP1yE', channelId: 'UClRRi9cvDVVBNSnNAYaDeKA', channel: 'Canada in the Rough', title: 'BIG Moose in Manitoba', isSeed: true },
  { id: 'dUwY8vZpRKw', channelId: 'UCzlnaIrdxwJITyrESOReqxg', channel: 'The Hunting Public', title: "Ted Miller's 2025 Deer Season!", isSeed: true },
  { id: 'jG2DpOVFrj4', channelId: 'UCzlnaIrdxwJITyrESOReqxg', channel: 'The Hunting Public', title: 'EPIC Turkey Road Trip!!! (3 Public Land Gobblers in 3 Days!)', isSeed: true },
  { id: 'AtbkD-ME15U', channelId: 'UCzlnaIrdxwJITyrESOReqxg', channel: 'The Hunting Public', title: 'A Perfect Opener On Public Land | Turkey Hunting', isSeed: true },
  { id: 'GswaBRBtF8E', channelId: 'UC7jyHQoVzomw7gV3q4H1m7A', channel: 'GrowingDeer.tv', title: 'A Familiar Buck Is Back… Plus New Food Options', isSeed: true },
  { id: '06H9GsL0wy8', channelId: 'UC7jyHQoVzomw7gV3q4H1m7A', channel: 'GrowingDeer.tv', title: 'Tis The Season!!! 2026 Food Plots', isSeed: true },
  { id: '4z97X63EByE', channelId: 'UC7jyHQoVzomw7gV3q4H1m7A', channel: 'GrowingDeer.tv', title: 'FREE Inputs That Grow Bigger Deer', isSeed: true },
  { id: '2EN2X0weh1o', channelId: 'UC7P2vU0_8iK450630h73v4w', channel: 'Deer & Deer Hunting', title: 'Western Whitetails | Deer & Deer Hunting TV', isSeed: true },
  { id: 'zdkg3Xtpj3A', channelId: 'UC7P2vU0_8iK450630h73v4w', channel: 'Deer & Deer Hunting', title: 'Why Hunters are Needed in Managing Deer Herds', isSeed: true },
  { id: 'JT8sKU5cm-k', channelId: 'UC7P2vU0_8iK450630h73v4w', channel: 'Deer & Deer Hunting', title: "The Whitetail's Most Important Gland", isSeed: true },
  { id: 'kj7J8KAf_Tw', channelId: 'UCiMNtu_Y-gd3ij7BT_clunw', channel: 'The Deer Society', title: 'The Hunt for "GREAT 8" | His FINAL Chapter...', isSeed: true },
  { id: 'hBIu0EhWuH4', channelId: 'UCiMNtu_Y-gd3ij7BT_clunw', channel: 'The Deer Society', title: 'Our BEST Food Plots | Planting 101 + GIVEAWAY!', isSeed: true },
  { id: 'CE9tIB85K4U', channelId: 'UCiMNtu_Y-gd3ij7BT_clunw', channel: 'The Deer Society', title: 'Deer Society Podcast: Episode 7 (Ben Rising)', isSeed: true },
];

const CACHE_KEY = 'letshunt_watch_videos_v2';
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours
const MAX_PER_CHANNEL = 8;

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function mergeVideos(base: WatchVideo[], fresh: WatchVideo[]): WatchVideo[] {
  const seen = new Set<string>();
  const merged: WatchVideo[] = [];
  for (const v of [...base, ...fresh]) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    merged.push(v);
  }
  return merged;
}

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function extractVideoId(link: string): string | null {
  const m = String(link || '').match(/[?&]v=([\w-]{6,})/);
  return m ? m[1] : null;
}

// Fetch the latest uploads from one channel. Primary path: rss2json (JSON,
// CORS-enabled, free tier). Fallback: the raw feed XML through allorigins.
async function fetchChannelVideos(ch: WatchChannel, signal: AbortSignal): Promise<WatchVideo[]> {
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${ch.id}`;

  // Primary: rss2json proxy
  try {
    const res = await fetch(
      `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`,
      { signal }
    );
    const data = await res.json();
    if (data && data.status === 'ok' && Array.isArray(data.items) && data.items.length > 0) {
      return data.items
        .slice(0, MAX_PER_CHANNEL)
        .map((item: any): WatchVideo | null => {
          const id = extractVideoId(item.link) || extractVideoId(item.id || item.guid || '');
          if (!id) return null;
          return {
            id,
            title: String(item.title || '').trim() || 'Untitled video',
            channelId: ch.id,
            channel: ch.name,
            publishedAt: item.pubDate || undefined,
            thumb: item.enclosure?.link || item.thumbnail || undefined,
          };
        })
        .filter((v: WatchVideo | null): v is WatchVideo => v !== null);
    }
  } catch {
    /* fall through to XML fallback */
  }

  // Fallback: raw RSS XML via allorigins
  try {
    const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`, { signal });
    const xml = await res.text();
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const entries = Array.from(doc.getElementsByTagName('entry'));
    return entries
      .slice(0, MAX_PER_CHANNEL)
      .map((entry): WatchVideo | null => {
        const id = entry.getElementsByTagNameNS('*', 'videoId')[0]?.textContent?.trim();
        if (!id) return null;
        const title = entry.getElementsByTagNameNS('*', 'title')[0]?.textContent?.trim();
        const published = entry.getElementsByTagNameNS('*', 'published')[0]?.textContent?.trim();
        const thumb = entry.getElementsByTagNameNS('*', 'thumbnail')[0]?.getAttribute('url') || undefined;
        return {
          id,
          title: title || 'Untitled video',
          channelId: ch.id,
          channel: ch.name,
          publishedAt: published,
          thumb,
        };
      })
      .filter((v: WatchVideo | null): v is WatchVideo => v !== null);
  } catch {
    return [];
  }
}

interface WatchViewProps {
  theme: ThemeMode;
}

export const WatchView: React.FC<WatchViewProps> = ({ theme }) => {
  const isDark = theme === 'dark';
  const isHunting = theme === 'hunting';
  const isOlive = theme === 'olive' || theme === 'hunting';

  const [videos, setVideos] = useState<WatchVideo[]>(() => shuffleArray(SEED_VIDEOS));
  const [refreshing, setRefreshing] = useState(false);
  const [activeVideo, setActiveVideo] = useState<WatchVideo | null>(null);
  const [filterChannel, setFilterChannel] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [feedNote, setFeedNote] = useState<string | null>(null);
  const mountedRef = useRef(true);
  // Latest videos mirror for the async refresh path (avoids side effects inside
  // a React state updater, which React may invoke twice in StrictMode).
  const videosRef = useRef<WatchVideo[]>(videos);
  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);

  const refreshFeed = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    const controller = new AbortController();
    // Never let a hung proxy leave the refresh spinner spinning forever.
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);
    try {
      const results = await Promise.allSettled(CHANNELS.map((ch) => fetchChannelVideos(ch, controller.signal)));
      const fresh = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
      if (fresh.length === 0) {
        if (mountedRef.current && !silent) {
          setFeedNote('Could not reach YouTube right now — showing saved videos.');
        }
        if (mountedRef.current) setRefreshing(false);
        return;
      }
      if (mountedRef.current) {
        // Fresh copies (with real publish dates) take priority over the seed
        // fallback entries so new uploads never lose their time chip.
        const merged = mergeVideos(fresh, videosRef.current);
        const shuffled = shuffleArray(merged);
        setVideos(shuffled);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ _ts: Date.now(), videos: shuffled }));
        } catch { /* storage full / private mode */ }
        setLastUpdated(new Date());
        setFeedNote(null);
        setRefreshing(false);
      }
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, []);

  // Load cached feed instantly, then refresh in the background.
  useEffect(() => {
    mountedRef.current = true;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.videos) && parsed.videos.length > 0 && Date.now() - (parsed._ts || 0) < CACHE_TTL) {
          setVideos(parsed.videos);
        }
      }
    } catch { /* ignore corrupt cache */ }
    refreshFeed(true);
    return () => {
      mountedRef.current = false;
    };
  }, [refreshFeed]);

  // ESC closes the player
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveVideo(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleShuffle = () => {
    setVideos((prev) => shuffleArray(prev));
  };

  const visibleVideos = useMemo(() => {
    if (!filterChannel) return videos;
    return videos.filter((v) => v.channelId === filterChannel);
  }, [videos, filterChannel]);

  const channelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const v of videos) counts[v.channelId] = (counts[v.channelId] || 0) + 1;
    return counts;
  }, [videos]);

  const cardBase = 'rounded-2xl border backdrop-blur-xl shadow-xl';
  const cardBg = isDark
    ? 'bg-slate-900/80 border-slate-800 text-slate-100'
    : isHunting
    ? 'bg-[#eae1cf] border-[#d4c4a8] text-[#2a1b0e]'
    : isOlive
    ? 'bg-[#f7f5ed] border-[#d8d2c0] text-[#1e2e1b]'
    : 'bg-white border-slate-200 text-slate-900';

  const chipActive = isDark
    ? 'bg-emerald-500 text-slate-950 shadow-md border-emerald-400'
    : 'bg-emerald-600 text-white shadow-md border-emerald-500';

  const chipIdle = isDark
    ? 'bg-slate-800/70 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'
    : isHunting
    ? 'bg-[#e8ddca] border-[#d4c4a8] text-[#5c4a32] hover:bg-[#dccab8] hover:text-[#2a1b0e]'
    : isOlive
    ? 'bg-[#efe9d7] border-[#d8d2c0] text-[#4a5240] hover:bg-[#e5dfcd] hover:text-[#1e2e1b]'
    : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200 hover:text-slate-900';

  const actionBtn = isDark
    ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white'
    : isHunting
    ? 'bg-[#e8ddca] border-[#d4c4a8] text-[#5c4a32] hover:bg-[#dccab8] hover:text-[#2a1b0e]'
    : isOlive
    ? 'bg-[#efe9d7] border-[#d8d2c0] text-[#4a5240] hover:bg-[#e5dfcd] hover:text-[#1e2e1b]'
    : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200 hover:text-slate-900';

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Hero header card */}
      <div className={`${cardBase} ${cardBg} p-4 sm:p-5`}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div
            className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg"
            style={{
              background: isDark ? 'rgba(16,185,129,0.15)' : isHunting ? 'rgba(200,90,23,0.12)' : isOlive ? 'rgba(85,107,47,0.12)' : 'rgba(16,185,129,0.12)',
              border: `1px solid ${isDark ? 'rgba(16,185,129,0.4)' : isHunting ? 'rgba(200,90,23,0.35)' : isOlive ? 'rgba(85,107,47,0.35)' : 'rgba(16,185,129,0.35)'}`,
              color: isDark ? '#34d399' : isHunting ? '#c85a17' : isOlive ? '#556b2f' : '#059669',
            }}
          >
            <Tv className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-2xl font-black tracking-tight flex items-center gap-2">
              Watch
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isDark ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-emerald-100 border-emerald-300 text-emerald-700'}`}>
                {visibleVideos.length} videos
              </span>
            </h2>
            <p className="text-xs sm:text-sm opacity-70 mt-0.5">
              Deer hunting videos from Realtree, Drury Outdoors, Canada in the Rough, The Hunting Public, GrowingDeer.tv & more — shuffled fresh from YouTube.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleShuffle}
              className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider border flex items-center gap-1.5 transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-md ${actionBtn}`}
              title="Shuffle the feed"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Shuffle</span>
            </button>
            <button
              onClick={() => refreshFeed(false)}
              disabled={refreshing}
              className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider border flex items-center gap-1.5 transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-md ${actionBtn} ${refreshing ? 'opacity-60 cursor-wait' : ''}`}
              title="Fetch the newest videos"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'New Videos'}</span>
            </button>
          </div>
        </div>
        {feedNote && (
          <p className="text-[11px] mt-2 flex items-center gap-1.5 opacity-80">
            <Youtube className="w-3.5 h-3.5 text-red-500" /> {feedNote}
          </p>
        )}
        {lastUpdated && (
          <p className="text-[10px] mt-1.5 opacity-60">
            Last refreshed {lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* Channel filter chips */}
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-thin">
        <button
          onClick={() => setFilterChannel(null)}
          className={`px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-black border whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${filterChannel === null ? chipActive : chipIdle}`}
        >
          <LayoutGrid className="w-3 h-3" /> All Channels
        </button>
        {CHANNELS.map((ch) => (
          <button
            key={ch.id}
            onClick={() => setFilterChannel(filterChannel === ch.id ? null : ch.id)}
            className={`px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-black border whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${filterChannel === ch.id ? chipActive : chipIdle}`}
          >
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ch.color }} />
            {ch.name}
            {(channelCounts[ch.id] || 0) > 0 && (
              <span className="opacity-60 text-[9px]">({channelCounts[ch.id]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Video grid */}
      {visibleVideos.length === 0 ? (
        <div className={`${cardBase} ${cardBg} p-10 text-center space-y-3`}>
          <Tv className="w-10 h-10 mx-auto opacity-40" />
          <p className="text-sm font-bold">No videos in this filter yet.</p>
          <p className="text-xs opacity-60">Try another channel, or hit "New Videos" to refresh the feed.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {visibleVideos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              isDark={isDark}
              cardBg={cardBg}
              onOpen={() => setActiveVideo(video)}
            />
          ))}
        </div>
      )}

      {/* Full-screen embedded player modal */}
      {activeVideo && (
        <WatchPlayerModal
          video={activeVideo}
          isDark={isDark}
          cardBg={cardBg}
          onClose={() => setActiveVideo(null)}
          onNext={() => {
            const idx = visibleVideos.findIndex((v) => v.id === activeVideo.id);
            const next = visibleVideos[(idx + 1) % visibleVideos.length];
            if (next) setActiveVideo(next);
          }}
        />
      )}
    </div>
  );
};

// Thumbnail with graceful maxres -> hqdefault fallback
function VideoThumb({ video }: { video: WatchVideo }) {
  const [src, setSrc] = useState<string>(
    video.thumb || `https://img.youtube.com/vi/${video.id}/maxresdefault.jpg`
  );
  useEffect(() => {
    setSrc(video.thumb || `https://img.youtube.com/vi/${video.id}/maxresdefault.jpg`);
  }, [video.id, video.thumb]);
  return (
    <img
      src={src}
      alt={video.title}
      loading="lazy"
      onError={() => {
        if (!src.includes('hqdefault')) setSrc(`https://img.youtube.com/vi/${video.id}/hqdefault.jpg`);
      }}
      className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
    />
  );
}

function VideoCard({
  video,
  isDark,
  cardBg,
  onOpen,
}: {
  key?: React.Key;
  video: WatchVideo;
  isDark: boolean;
  cardBg: string;
  onOpen: () => void;
}) {
  const channel = CHANNELS.find((c) => c.id === video.channelId);
  const color = channel?.color || '#10b981';
  const ago = timeAgo(video.publishedAt);
  return (
    <button
      onClick={onOpen}
      className={`group text-left overflow-hidden rounded-2xl border backdrop-blur-xl shadow-xl transition-all duration-200 cursor-pointer hover:-translate-y-1 hover:shadow-2xl ${cardBg} focus:outline-none focus:ring-2 focus:ring-emerald-500/50`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video overflow-hidden bg-slate-950">
        <VideoThumb video={video} />
        {/* Channel color top-left badge */}
        <div
          className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shadow-lg"
          style={{ backgroundColor: `${color}dd`, color: '#0f172a' }}
        >
          <Youtube className="w-2.5 h-2.5" /> {video.channel}
        </div>
        {/* Publish time chip */}
        {ago && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-950/80 text-slate-200 text-[9px] font-bold shadow-md">
            <Clock className="w-2.5 h-2.5" /> {ago}
          </div>
        )}
        {/* Hover play overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/0 group-hover:bg-slate-950/40 transition-colors duration-300">
          <div className="w-14 h-14 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow-2xl opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300">
            <Play className="w-6 h-6 fill-current ml-0.5" />
          </div>
        </div>
      </div>
      {/* Body */}
      <div className="p-3 sm:p-3.5">
        <h3 className="text-xs sm:text-sm font-bold leading-snug line-clamp-2 min-h-[2.5em]">
          {video.title}
        </h3>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className={`text-[10px] font-semibold truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {video.channel}
            {video.isSeed && !ago ? ' · Featured' : ''}
          </span>
        </div>
      </div>
    </button>
  );
}

function WatchPlayerModal({
  video,
  isDark,
  cardBg,
  onClose,
  onNext,
}: {
  key?: React.Key;
  video: WatchVideo;
  isDark: boolean;
  cardBg: string;
  onClose: () => void;
  onNext: () => void;
}) {
  const channel = CHANNELS.find((c) => c.id === video.channelId);
  const color = channel?.color || '#10b981';
  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className={`${cardBg} rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl border`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Player */}
        <div className="relative aspect-video bg-black">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0&modestbranding=1`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 w-full h-full border-0"
          />
          <button
            onClick={onClose}
            className="absolute top-2 right-2 p-2 rounded-xl bg-slate-950/80 text-white hover:bg-slate-800 border border-white/20 transition-colors cursor-pointer z-10"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Meta */}
        <div className="p-3 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-black leading-snug line-clamp-2">{video.title}</h3>
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className={`text-[11px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{video.channel}</span>
                {video.publishedAt && (
                  <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>· {timeAgo(video.publishedAt)}</span>
                )}
              </div>
            </div>
            <button
              onClick={onNext}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider border flex items-center gap-1.5 flex-shrink-0 transition-all cursor-pointer hover:scale-105 ${isDark ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'}`}
              title="Play the next video"
            >
              <Play className="w-3 h-3 fill-current" /> Next
            </button>
          </div>
          <a
            href={`https://www.youtube.com/watch?v=${video.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all hover:scale-105 ${isDark ? 'bg-red-600/90 border-red-500 text-white hover:bg-red-500' : 'bg-red-600 border-red-500 text-white hover:bg-red-500'}`}
          >
            <ExternalLink className="w-3.5 h-3.5" /> Watch on YouTube
          </a>
        </div>
      </div>
    </div>
  );
}
