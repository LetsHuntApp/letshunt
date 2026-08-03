import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Tv, Shuffle, RefreshCw, Play, ExternalLink, X, Youtube, Clock, LayoutGrid, Loader2, Ban, Undo2, Flame, Eye } from 'lucide-react';
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
const FEATURED_CHANNELS: WatchChannel[] = [
  { id: 'UC-lwzUkDAAU2q12Cnc9vEbg', name: 'Realtree', color: '#22c55e' },
  { id: 'UCA7i6_2TiXy1YL5yE4czEXg', name: 'Drury Outdoors', color: '#f59e0b' },
  { id: 'UClRRi9cvDVVBNSnNAYaDeKA', name: 'Canada in the Rough', color: '#ef4444' },
  { id: 'UCzlnaIrdxwJITyrESOReqxg', name: 'The Hunting Public', color: '#8b5cf6' },
  { id: 'UC7jyHQoVzomw7gV3q4H1m7A', name: 'GrowingDeer.tv', color: '#10b981' },
  { id: 'UC7P2vU0_8iK450630h73v4w', name: 'Deer & Deer Hunting', color: '#3b82f6' },
  { id: 'UCiMNtu_Y-gd3ij7BT_clunw', name: 'The Deer Society', color: '#ec4899' },
  { id: 'UCAaa0mleeU128Ad5iM1RFIg', name: 'MeatEater', color: '#f97316' },
  { id: 'UCfv4iVCP-yW8KBxThqDPqsQ', name: 'Heartland Bowhunter', color: '#78716c' },
  { id: 'UCptLNmlgA-3p2g1IyPefO7w', name: 'The Canadian Whitetail', color: '#e11d48' },
  { id: 'UCdcHCVzY4IQLLVvwhUGho5Q', name: 'Whitetail Edge', color: '#14b8a6' },
  { id: 'UCfvm658L03oMaU-n_lgMg7g', name: 'Chris Bee', color: '#a16207' },
  { id: 'UCyBxMQwjk60yeQYcqo9KD9A', name: 'Seek One', color: '#dc2626' },
];

// Verified deer-hunting channels (each ID confirmed against its live YouTube
// RSS feed title). These stream in progressively as you scroll so the feed
// never ends — every new channel adds its latest uploads to the pool.
const ENDLESS_POOL: WatchChannel[] = [
  { id: 'UCYt16x16v0EvIg4I2FuUycA', name: 'Wired to Hunt', color: '#0ea5e9' },
  { id: 'UCAb0IaDRgP7gsTAslJ6D32w', name: 'The Hunting Beast', color: '#b45309' },
  { id: 'UCI9V_Hs6YjaPHC-PzeKxzbw', name: 'Midwest Whitetail', color: '#7c3aed' },
  { id: 'UCvOvumDi0Vqjd3OZLyKWRyQ', name: 'Bone Collector', color: '#92400e' },
  { id: 'UCRH6FEPoRlqFLY_-TOs78Aw', name: 'Deer Meat for Dinner', color: '#be123c' },
  { id: 'UCN91fTupmCWtfBPRmeMCOGg', name: 'Southern Ground Hunting', color: '#a16207' },
  { id: 'UC3MBWAo7P6nb_1If0qoZwhQ', name: 'GoWild', color: '#2563eb' },
  { id: 'UCypQ8hJKXxd9qtFA7ZQrUsg', name: 'Exodus Outdoor Gear', color: '#0f766e' },
  { id: 'UC7_nWW1mtBWsHlw10zOw-dA', name: 'National Deer Assoc.', color: '#16a34a' },
  { id: 'UCUq4OwmhW3VWdZVxwXiH6BA', name: 'Legendary Whitetails', color: '#c026d3' },
  { id: 'UC5JBVVa0aVNqAd0ec-752YQ', name: 'Antler Up Outdoors', color: '#d97706' },
  { id: 'UCm2kmwM1LIRjrnbqynMjTzQ', name: 'Whitetail Habitat Sol.', color: '#65a30d' },
  { id: 'UC8arffOPd-5ltKWF7BbsdvQ', name: 'Catman Outdoors', color: '#0891b2' },
  { id: 'UCSshpE8mN7W252CECgWh8_w', name: 'Rut N Strut Outdoors', color: '#ea580c' },
  { id: 'UCz6TOVPZ0qFu13ldyjca3GQ', name: 'The Element', color: '#1d4ed8' },
  { id: 'UCy4ETUFM-cVBsKV3QMIhXaQ', name: 'Deer Hunter Podcast', color: '#db2777' },
];

const ALL_CHANNELS: WatchChannel[] = [...FEATURED_CHANNELS, ...ENDLESS_POOL];
const POOL_BATCH_SIZE = 5;
const HOLD_TO_BLOCK_MS = 600; // press-and-hold duration on a card to block its channel
const HOLD_AFFORDANCE_MS = 130; // delay before the 'hold to block' ring appears (keeps quick taps clean)

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
  { id: 'a0pn6stBQBI', channelId: 'UCAaa0mleeU128Ad5iM1RFIg', channel: 'MeatEater', title: 'Can boiling carp in beer make it taste actually good?', isSeed: true },
  { id: '9HFFUkm_PBM', channelId: 'UCAaa0mleeU128Ad5iM1RFIg', channel: 'MeatEater', title: 'Steve and Seth Make The Most Ridiculous Carp Recipe Ever', isSeed: true },
  { id: 'Kgn2SpxaCXs', channelId: 'UCAaa0mleeU128Ad5iM1RFIg', channel: 'MeatEater', title: "Clay Newcomb's Arkansas Bear Camp | MeatEater's 12 in '26", isSeed: true },
  { id: 'R5qCPcjhgiA', channelId: 'UCfvm658L03oMaU-n_lgMg7g', channel: 'Chris Bee', title: 'This Mathews Bow Is Almost Impossible to Get', isSeed: true },
  { id: 'X91M6Izenbw', channelId: 'UCfvm658L03oMaU-n_lgMg7g', channel: 'Chris Bee', title: 'Whitetail Buck Deer | #BEEREAL', isSeed: true },
  { id: 'qQ3evdVitlw', channelId: 'UCfvm658L03oMaU-n_lgMg7g', channel: 'Chris Bee', title: '116 Yard Shot On A Moose | #BEEREAL', isSeed: true },
  { id: 'MWTyWwKWrRU', channelId: 'UCfv4iVCP-yW8KBxThqDPqsQ', channel: 'Heartland Bowhunter', title: 'Sleep? Never Heard Of It', isSeed: true },
  { id: 'MSkEm-AoT8o', channelId: 'UCfv4iVCP-yW8KBxThqDPqsQ', channel: 'Heartland Bowhunter', title: "The Bowhunter's Zen", isSeed: true },
  { id: 'xzEXGwi9B4c', channelId: 'UCfv4iVCP-yW8KBxThqDPqsQ', channel: 'Heartland Bowhunter', title: 'The Habitat Upgrade Every Deer Hunter Should Make', isSeed: true },
  { id: '0MLzu9RUweA', channelId: 'UCptLNmlgA-3p2g1IyPefO7w', channel: 'The Canadian Whitetail', title: 'Years of Hunting This Buck... She Finally Gets Him!', isSeed: true },
  { id: '6se3BEdOSWA', channelId: 'UCptLNmlgA-3p2g1IyPefO7w', channel: 'The Canadian Whitetail', title: 'Shoot or Pass? Are you a gambler?', isSeed: true },
  { id: 'JL8Xg-Kp-8g', channelId: 'UCptLNmlgA-3p2g1IyPefO7w', channel: 'The Canadian Whitetail', title: 'Bucks like this can go from nice to great to dream haunting myths!', isSeed: true },
  { id: 'JYNslgBNKyM', channelId: 'UCdcHCVzY4IQLLVvwhUGho5Q', channel: 'Whitetail Edge', title: 'A surprise attack on opening weekend, 400 days after setting this up?', isSeed: true },
  { id: '2KBUpqxxvQA', channelId: 'UCdcHCVzY4IQLLVvwhUGho5Q', channel: 'Whitetail Edge', title: 'Mock Scrapes at your stand right NOW? | Ben Rising', isSeed: true },
  { id: 'A1VSb4ShemY', channelId: 'UCdcHCVzY4IQLLVvwhUGho5Q', channel: 'Whitetail Edge', title: 'Would you do this?', isSeed: true },
];

const CACHE_KEY = 'letshunt_watch_videos_v5';
const BLOCK_KEY = 'letshunt_watch_blocked_v1';
const VIEWS_KEY = 'letshunt_watch_views_v1';
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours
const MAX_PER_CHANNEL = 8;
const MAX_VIEW_FETCH = 48; // videos to count views for per popularity pass
const VIEW_FETCH_CONCURRENCY = 6;
const VIEW_FETCH_TIMEOUT = 20000;

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

function formatViews(n?: number): string {
  if (!n || n <= 0) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${n}`;
}

// Pull a video's view count straight off its watch page (no API key needed).
// The count lives in ytInitialData inside a videoViewCountRenderer block.
async function fetchViewCount(videoId: string, signal: AbortSignal): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`,
      { signal }
    );
    const html = await res.text();
    const m = html.match(/"videoViewCountRenderer":\{"viewCount":\{"simpleText":"([\d.,]+)\s*views/);
    const raw = m ? m[1] : html.match(/"simpleText":"(\d[\d.,]*)\s*views/)?.[1];
    if (!raw) return null;
    const n = parseInt(raw.replace(/,/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [poolProgress, setPoolProgress] = useState(0); // how many pool channels have been attempted
  const [activeVideo, setActiveVideo] = useState<WatchVideo | null>(null);
  const [filterChannel, setFilterChannel] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [feedNote, setFeedNote] = useState<string | null>(null);
  // Channels the user has permanently blocked by pressing-and-holding a video.
  const [blockedChannels, setBlockedChannels] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(BLOCK_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((c) => typeof c === 'string') : [];
    } catch {
      return [];
    }
  });
  const [manageOpen, setManageOpen] = useState(false);
  const [toast, setToast] = useState<{ channelId: string; name: string } | null>(null);
  // Cached view counts (videoId -> views) powering the "Most Popular" sort.
  const [viewCounts, setViewCounts] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(VIEWS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, number>) : {};
    } catch {
      return {};
    }
  });
  const [sortMode, setSortMode] = useState<'popular' | 'newest' | null>(null);
  const [fetchingViews, setFetchingViews] = useState(false);
  const mountedRef = useRef(true);
  // Latest videos mirror for async paths (avoids side effects inside a React
  // state updater, which React may invoke twice in StrictMode).
  const videosRef = useRef<WatchVideo[]>(videos);
  const poolProgressRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<string | null>(null);
  const blockedChannelsRef = useRef<string[]>(blockedChannels);
  const toastTimerRef = useRef<number | null>(null);
  const viewCountsRef = useRef<Record<string, number>>(viewCounts);
  const sortModeRef = useRef<'popular' | 'newest' | null>(null);
  const fetchingViewsRef = useRef(false);

  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);

  useEffect(() => {
    filterRef.current = filterChannel;
  }, [filterChannel]);

  useEffect(() => {
    blockedChannelsRef.current = blockedChannels;
  }, [blockedChannels]);

  useEffect(() => {
    viewCountsRef.current = viewCounts;
  }, [viewCounts]);

  useEffect(() => {
    sortModeRef.current = sortMode;
  }, [sortMode]);

  // If the filtered channel just got blocked, fall back to the full feed.
  useEffect(() => {
    if (filterChannel && blockedChannels.includes(filterChannel)) setFilterChannel(null);
  }, [filterChannel, blockedChannels]);

  // Clear the undo-toast timer on unmount.
  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    },
    []
  );

  const persistCache = () => {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          _ts: Date.now(),
          videos: videosRef.current,
          poolProgress: poolProgressRef.current,
        })
      );
    } catch { /* storage full / private mode */ }
  };

  const persistViews = (counts: Record<string, number>) => {
    try {
      localStorage.setItem(VIEWS_KEY, JSON.stringify(counts));
    } catch { /* storage full / private mode */ }
  };

  // Lazily count views for videos that don't have a cached number yet, with
  // bounded concurrency. Called when "Most Popular" is active.
  const fetchMissingViews = useCallback(async (videoList: WatchVideo[]) => {
    if (fetchingViewsRef.current) return;
    const missing = videoList
      .filter((v) => viewCountsRef.current[v.id] === undefined)
      .slice(0, MAX_VIEW_FETCH);
    if (missing.length === 0) return;
    fetchingViewsRef.current = true;
    if (mountedRef.current) setFetchingViews(true);
    const queue = [...missing];
    const worker = async () => {
      while (queue.length > 0) {
        const v = queue.shift()!;
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), VIEW_FETCH_TIMEOUT);
        try {
          const count = await fetchViewCount(v.id, controller.signal);
          if (count !== null && mountedRef.current) {
            viewCountsRef.current = { ...viewCountsRef.current, [v.id]: count };
          }
        } catch {
          /* individual failures are fine */
        } finally {
          window.clearTimeout(timeoutId);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(VIEW_FETCH_CONCURRENCY, queue.length) }, worker));
    if (mountedRef.current) {
      persistViews(viewCountsRef.current);
      setViewCounts({ ...viewCountsRef.current });
      setFetchingViews(false);
    }
    fetchingViewsRef.current = false;
  }, []);

  const refreshFeed = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    const controller = new AbortController();
    // Never let a hung proxy leave the refresh spinner spinning forever.
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);
    try {
      // Refresh the featured channels plus any endless-pool channels that have
      // already streamed into the feed (skipping permanently blocked ones).
      const blockedSet = new Set(blockedChannelsRef.current);
      const poolLoaded = ENDLESS_POOL.slice(0, poolProgressRef.current).filter((c) => !blockedSet.has(c.id));
      const channelsToRefresh = [...FEATURED_CHANNELS, ...poolLoaded].filter((c) => !blockedSet.has(c.id));
      const results = await Promise.allSettled(channelsToRefresh.map((ch) => fetchChannelVideos(ch, controller.signal)));
      // Guard against a block that happened while the fetch was in flight.
      const blockedSetNow = new Set(blockedChannelsRef.current);
      const fresh = results
        .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
        .filter((v) => !blockedSetNow.has(v.channelId));
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
        videosRef.current = shuffled;
        setVideos(shuffled);
        persistCache();
        setLastUpdated(new Date());
        setFeedNote(null);
        setRefreshing(false);
        if (sortModeRef.current === 'popular') fetchMissingViews(shuffled);
      }
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, [fetchMissingViews]);

  // Load cached feed instantly (resuming scroll position), then refresh in the background.
  useEffect(() => {
    mountedRef.current = true;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.videos) && parsed.videos.length > 0) {
          const cached = parsed.videos as WatchVideo[];
          videosRef.current = cached;
          setVideos(cached);
          const pp = Number(parsed.poolProgress) || 0;
          if (pp >= 0 && pp <= ENDLESS_POOL.length) {
            poolProgressRef.current = pp;
            setPoolProgress(pp);
          }
        }
      }
    } catch { /* ignore corrupt cache */ }
    refreshFeed(true);
    return () => {
      mountedRef.current = false;
    };
  }, [refreshFeed]);

  // Endless feed: when the sentinel scrolls into view, stream the next batch
  // of channels from the verified pool.
  const loadMorePool = useCallback(async () => {
    if (loadingMoreRef.current) return;
    const nextIndex = poolProgressRef.current;
    if (nextIndex >= ENDLESS_POOL.length) return;
    loadingMoreRef.current = true;
    if (mountedRef.current) setLoadingMore(true);
    const blockedSet = new Set(blockedChannelsRef.current);
    const batch = ENDLESS_POOL.slice(nextIndex, nextIndex + POOL_BATCH_SIZE).filter((c) => !blockedSet.has(c.id));
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);
    try {
      const results = await Promise.allSettled(batch.map((ch) => fetchChannelVideos(ch, controller.signal)));
      // Guard against a block that happened while the fetch was in flight.
      const blockedSetNow = new Set(blockedChannelsRef.current);
      const fresh = results
        .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
        .filter((v) => !blockedSetNow.has(v.channelId));
      if (mountedRef.current) {
        if (fresh.length > 0) {
          const merged = mergeVideos(videosRef.current, shuffleArray(fresh));
          videosRef.current = merged;
          setVideos(merged);
        }
        poolProgressRef.current = nextIndex + batch.length;
        setPoolProgress(poolProgressRef.current);
        persistCache();
        if (sortModeRef.current === 'popular') fetchMissingViews(videosRef.current);
      }
    } finally {
      window.clearTimeout(timeoutId);
      loadingMoreRef.current = false;
      if (mountedRef.current) setLoadingMore(false);
    }
  }, [fetchMissingViews]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const io = new IntersectionObserver(
      (entries) => {
        // Auto-stream only in the unfiltered feed — when a channel filter is
        // active the incoming pool videos can't match it, so a manual button
        // is shown instead.
        if (entries[0].isIntersecting && !filterRef.current) loadMorePool();
      },
      { rootMargin: '700px 0px' }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [loadMorePool]);

  // ESC closes the player
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveVideo(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleShuffle = () => {
    const shuffled = shuffleArray(videosRef.current);
    videosRef.current = shuffled;
    setVideos(shuffled);
    persistCache();
  };

  const persistBlocked = (list: string[]) => {
    try {
      localStorage.setItem(BLOCK_KEY, JSON.stringify(list));
    } catch {
      /* storage full / private mode */
    }
  };

  const showToast = (channelId: string, name: string) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast({ channelId, name });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 5000);
  };

  // Long-press on a video → permanently hide every video from its channel.
  const blockChannel = (channelId: string) => {
    if (blockedChannelsRef.current.includes(channelId)) return;
    const next = [...blockedChannelsRef.current, channelId];
    blockedChannelsRef.current = next;
    persistBlocked(next);
    setBlockedChannels(next);
    // Purge the channel's videos from the live feed + cache.
    const pruned = videosRef.current.filter((v) => v.channelId !== channelId);
    videosRef.current = pruned;
    setVideos(pruned);
    persistCache();
    if (filterRef.current === channelId) setFilterChannel(null);
    const ch = ALL_CHANNELS.find((c) => c.id === channelId);
    showToast(channelId, ch?.name || 'Channel');
  };

  const unblockChannel = (channelId: string) => {
    const next = blockedChannelsRef.current.filter((c) => c !== channelId);
    blockedChannelsRef.current = next;
    persistBlocked(next);
    setBlockedChannels(next);
    if (toast && toast.channelId === channelId) setToast(null);
    // Re-seed instantly, then silently refresh to pull the latest uploads back.
    const seeds = shuffleArray(SEED_VIDEOS.filter((v) => v.channelId === channelId));
    if (seeds.length > 0) {
      const merged = mergeVideos(videosRef.current, seeds);
      videosRef.current = merged;
      setVideos(merged);
      persistCache();
    }
    refreshFeed(true);
  };

  const unblockAll = () => {
    if (blockedChannelsRef.current.length === 0) return;
    blockedChannelsRef.current = [];
    persistBlocked([]);
    setBlockedChannels([]);
    setToast(null);
    const seeds = shuffleArray(SEED_VIDEOS);
    const merged = mergeVideos(videosRef.current, seeds);
    videosRef.current = merged;
    setVideos(merged);
    persistCache();
    refreshFeed(true);
  };

  const hasMore = poolProgress < ENDLESS_POOL.length;

  // Blocked channels' videos are excluded everywhere (grid, counts, chips).
  const unblockedVideos = useMemo(
    () => videos.filter((v) => !blockedChannels.includes(v.channelId)),
    [videos, blockedChannels]
  );

  const visibleVideos = useMemo(() => {
    if (!filterChannel) return unblockedVideos;
    return unblockedVideos.filter((v) => v.channelId === filterChannel);
  }, [unblockedVideos, filterChannel]);

  const channelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const v of unblockedVideos) counts[v.channelId] = (counts[v.channelId] || 0) + 1;
    return counts;
  }, [unblockedVideos]);

  // Featured chips always show; pool channels appear as they stream in.
  // Blocked channels disappear from the chip row entirely.
  const chipChannels = useMemo(() => {
    const withVideos = new Set(Object.keys(channelCounts));
    const notBlocked = (c: WatchChannel) => !blockedChannels.includes(c.id);
    return [
      ...FEATURED_CHANNELS.filter(notBlocked),
      ...ENDLESS_POOL.filter((c) => withVideos.has(c.id) && notBlocked(c)),
    ];
  }, [channelCounts, blockedChannels]);

  // Apply the active sort (most popular or newest) on top of the channel filter.
  const sortedVideos = useMemo(() => {
    if (sortMode === 'newest') {
      return [...visibleVideos].sort((a, b) => {
        const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : -Infinity;
        const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : -Infinity;
        return tb - ta;
      });
    }
    if (sortMode === 'popular') {
      return [...visibleVideos].sort((a, b) => {
        const va = viewCounts[a.id] ?? -1;
        const vb = viewCounts[b.id] ?? -1;
        return vb - va;
      });
    }
    return visibleVideos;
  }, [visibleVideos, sortMode, viewCounts]);

  const handleSortPopular = () => {
    setSortMode((prev) => (prev === 'popular' ? null : 'popular'));
    fetchMissingViews(videosRef.current);
  };

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
              An endless feed of deer hunting videos — Realtree, Drury Outdoors, MeatEater, The Hunting Public & 25 more channels. New uploads stream in as you scroll. Press and hold any video to block its channel.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {blockedChannels.length > 0 && (
              <button
                onClick={() => {
                  setToast(null);
                  setManageOpen(true);
                }}
                className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider border flex items-center gap-1.5 transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-md ${actionBtn}`}
                title="Manage blocked channels"
              >
                <Ban className="w-3.5 h-3.5" />
                Blocked ({blockedChannels.length})
              </button>
            )}
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
        {chipChannels.map((ch) => (
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

      {/* Sort controls: Most Popular / Newest */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
        <button
          onClick={handleSortPopular}
          className={`px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-black border whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${sortMode === 'popular' ? chipActive : chipIdle}`}
          title="Sort by most viewed first"
        >
          <Flame className="w-3 h-3" /> Most Popular
        </button>
        <button
          onClick={() => setSortMode((prev) => (prev === 'newest' ? null : 'newest'))}
          className={`px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-black border whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${sortMode === 'newest' ? chipActive : chipIdle}`}
          title="Sort by newest uploads first"
        >
          <Clock className="w-3 h-3" /> Newest
        </button>
        {sortMode === 'popular' && fetchingViews && (
          <span className={`text-[10px] font-bold flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            <Loader2 className="w-3 h-3 animate-spin text-emerald-500" /> Counting views…
          </span>
        )}
        {sortMode && (
          <button
            onClick={() => setSortMode(null)}
            className={`text-[10px] font-bold uppercase tracking-wider underline-offset-2 hover:underline transition-colors cursor-pointer ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
            title="Back to the shuffled feed"
          >
            Clear sort
          </button>
        )}
      </div>

      {/* Video grid */}
      {visibleVideos.length === 0 ? (
        <div className={`${cardBase} ${cardBg} p-10 text-center space-y-3`}>
          <Tv className="w-10 h-10 mx-auto opacity-40" />
          <p className="text-sm font-bold">No videos in this filter yet.</p>
          <p className="text-xs opacity-60">
            {videos.length === 0 && blockedChannels.length > 0
              ? 'Every channel is blocked — open "Blocked" in the header to unblock some.'
              : 'Try another channel, or hit "New Videos" to refresh the feed.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {sortedVideos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              isDark={isDark}
              cardBg={cardBg}
              views={viewCounts[video.id]}
              onOpen={() => setActiveVideo(video)}
              onBlock={(v) => blockChannel(v.channelId)}
            />
          ))}
        </div>
      )}

      {/* Endless feed sentinel + states */}
      <div ref={sentinelRef} className="py-2 flex items-center justify-center">
        {loadingMore ? (
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-bold border ${isDark ? 'bg-slate-800/70 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
            Loading more deer hunting videos…
          </div>
        ) : !hasMore ? (
          <div className={`flex flex-col items-center gap-1 px-5 py-3 rounded-2xl text-center ${cardBase} ${cardBg}`}>
            <span className="text-sm">🦌</span>
            <p className="text-[11px] font-bold">You've reached the end of the feed — 29 channels covered.</p>
            <p className="text-[10px] opacity-60">Hit "New Videos" to refresh everything with the latest uploads.</p>
          </div>
        ) : filterChannel ? (
          <button
            onClick={loadMorePool}
            className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider border flex items-center gap-1.5 transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-md ${actionBtn}`}
            title="Stream more channels into the feed"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Load more channels
          </button>
        ) : (
          <div className={`text-[10px] font-semibold uppercase tracking-widest opacity-50 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Keep scrolling · more channels below
          </div>
        )}
      </div>

      {/* Full-screen embedded player modal */}
      {activeVideo && (
        <WatchPlayerModal
          video={activeVideo}
          isDark={isDark}
          cardBg={cardBg}
          onClose={() => setActiveVideo(null)}
          onNext={() => {
            const idx = sortedVideos.findIndex((v) => v.id === activeVideo.id);
            const next = sortedVideos[(idx + 1) % sortedVideos.length];
            if (next) setActiveVideo(next);
          }}
        />
      )}

      {/* Undo toast after blocking a channel */}
      {toast && (
        <div
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 sm:gap-3 pl-3 pr-1.5 py-2 rounded-2xl border shadow-2xl backdrop-blur-xl ${
            isDark
              ? 'bg-slate-900/95 border-slate-700 text-slate-100'
              : isHunting
              ? 'bg-[#eae1cf]/95 border-[#d4c4a8] text-[#2a1b0e]'
              : isOlive
              ? 'bg-[#f7f5ed]/95 border-[#d8d2c0] text-[#1e2e1b]'
              : 'bg-white/95 border-slate-200 text-slate-900'
          }`}
        >
          <Ban className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-xs font-bold whitespace-nowrap">Blocked {toast.name}</span>
          <button
            onClick={() => unblockChannel(toast.channelId)}
            className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border flex items-center gap-1.5 transition-all cursor-pointer hover:scale-105 ${actionBtn}`}
            title="Unblock this channel"
          >
            <Undo2 className="w-3 h-3" /> Undo
          </button>
          <button
            onClick={() => setToast(null)}
            className="p-1.5 rounded-lg opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Blocked channels manager */}
      {manageOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setManageOpen(false)}
        >
          <div
            className={`${cardBase} ${cardBg} w-full max-w-sm rounded-2xl p-4 sm:p-5 shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-black flex items-center gap-2">
                <Ban className="w-4 h-4 text-red-500" /> Blocked channels
              </h3>
              <button
                onClick={() => setManageOpen(false)}
                className="p-1.5 rounded-lg opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {blockedChannels.length === 0 ? (
              <p className="text-xs opacity-60 py-4 text-center">
                No blocked channels — press and hold any video to block its channel.
              </p>
            ) : (
              <ul className="space-y-2 max-h-72 overflow-y-auto">
                {blockedChannels.map((id) => {
                  const ch = ALL_CHANNELS.find((c) => c.id === id);
                  return (
                    <li
                      key={id}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
                        isDark
                          ? 'bg-slate-800/60 border-slate-700'
                          : isHunting
                          ? 'bg-[#e8ddca] border-[#d4c4a8]'
                          : isOlive
                          ? 'bg-[#efe9d7] border-[#d8d2c0]'
                          : 'bg-slate-100 border-slate-200'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: ch?.color || '#94a3b8' }} />
                      <span className="text-xs font-bold flex-1 truncate">{ch?.name || id}</span>
                      <button
                        onClick={() => unblockChannel(id)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border flex items-center gap-1 transition-all cursor-pointer hover:scale-105 ${actionBtn}`}
                        title="Unblock this channel"
                      >
                        <Undo2 className="w-3 h-3" /> Unblock
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {blockedChannels.length > 0 && (
              <button
                onClick={() => {
                  unblockAll();
                  setManageOpen(false);
                }}
                className={`mt-3 w-full px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider border transition-all cursor-pointer hover:scale-[1.02] ${actionBtn}`}
                title="Remove every block"
              >
                Unblock all
              </button>
            )}
          </div>
        </div>
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
  views,
  onOpen,
  onBlock,
}: {
  key?: React.Key;
  video: WatchVideo;
  isDark: boolean;
  cardBg: string;
  views?: number;
  onOpen: () => void;
  onBlock: (video: WatchVideo) => void;
}) {
  const channel = ALL_CHANNELS.find((c) => c.id === video.channelId);
  const color = channel?.color || '#10b981';
  const ago = timeAgo(video.publishedAt);

  // Press-and-hold anywhere on a card (touch or mouse) blocks its channel.
  const holdTimerRef = useRef<number | null>(null);
  const showHoldTimerRef = useRef<number | null>(null);
  const fillTimerRef = useRef<number | null>(null);
  const holdStartRef = useRef<{ x: number; y: number } | null>(null);
  const holdTriggeredRef = useRef(false);
  const [holding, setHolding] = useState(false);
  const [ringFilled, setRingFilled] = useState(false);
  const ringCircumference = 2 * Math.PI * 28;

  const clearHold = () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (showHoldTimerRef.current !== null) {
      window.clearTimeout(showHoldTimerRef.current);
      showHoldTimerRef.current = null;
    }
    if (fillTimerRef.current !== null) {
      window.clearTimeout(fillTimerRef.current);
      fillTimerRef.current = null;
    }
    holdStartRef.current = null;
    setHolding(false);
    setRingFilled(false);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // primary press only (right-click keeps its menu)
    holdTriggeredRef.current = false;
    holdStartRef.current = { x: e.clientX, y: e.clientY };
    // Show the 'hold to block' ring only after a short delay so quick taps that
    // simply open the video never flash it.
    showHoldTimerRef.current = window.setTimeout(() => {
      setHolding(true);
      setRingFilled(false);
      fillTimerRef.current = window.setTimeout(() => setRingFilled(true), 20);
    }, HOLD_AFFORDANCE_MS);
    holdTimerRef.current = window.setTimeout(() => {
      holdTriggeredRef.current = true;
      clearHold();
      onBlock(video);
    }, HOLD_TO_BLOCK_MS);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (holdTimerRef.current === null || !holdStartRef.current) return;
    const dx = e.clientX - holdStartRef.current.x;
    const dy = e.clientY - holdStartRef.current.y;
    if (Math.hypot(dx, dy) > 12) clearHold(); // finger moved → it's a scroll, not a hold
  };

  return (
    <button
      onClick={(e) => {
        // A click right after a successful long-press must not open the video.
        if (holdTriggeredRef.current) {
          holdTriggeredRef.current = false;
          e.preventDefault();
          return;
        }
        onOpen();
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={clearHold}
      onPointerLeave={clearHold}
      onPointerCancel={clearHold}
      onContextMenu={(e) => {
        // Swallow the native long-press menu so holding = blocking, never text select.
        if (showHoldTimerRef.current !== null || holdTimerRef.current !== null || holdTriggeredRef.current) {
          e.preventDefault();
        }
      }}
      className={`group text-left overflow-hidden rounded-2xl border backdrop-blur-xl shadow-xl transition-all duration-200 cursor-pointer hover:-translate-y-1 hover:shadow-2xl active:scale-[0.98] ${cardBg} focus:outline-none focus:ring-2 focus:ring-emerald-500/50`}
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
        {/* View count chip (populated by the Most Popular sort) */}
        {views && views > 0 && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-950/80 text-slate-200 text-[9px] font-bold shadow-md">
            <Eye className="w-2.5 h-2.5" /> {formatViews(views)} views
          </div>
        )}
        {/* Hover play overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/0 group-hover:bg-slate-950/40 transition-colors duration-300">
          <div className="w-14 h-14 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow-2xl opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300">
            <Play className="w-6 h-6 fill-current ml-0.5" />
          </div>
        </div>
        {/* Hold-to-block progress ring */}
        {holding && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 bg-slate-950/55 backdrop-blur-[1px]">
            <svg width="72" height="72" viewBox="0 0 72 72" className="drop-shadow-lg">
              <circle cx="36" cy="36" r="28" fill="rgba(2,6,23,0.65)" stroke="rgba(255,255,255,0.25)" strokeWidth="4" />
              <circle
                cx="36"
                cy="36"
                r="28"
                fill="none"
                stroke="#34d399"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringFilled ? 0 : ringCircumference}
                transform="rotate(-90 36 36)"
                style={{ transition: ringFilled ? `stroke-dashoffset ${HOLD_TO_BLOCK_MS - HOLD_AFFORDANCE_MS}ms linear` : 'none' }}
              />
            </svg>
            <span className="text-[9px] font-black uppercase tracking-widest text-white drop-shadow">
              Hold to block
            </span>
          </div>
        )}
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
  const channel = ALL_CHANNELS.find((c) => c.id === video.channelId);
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
