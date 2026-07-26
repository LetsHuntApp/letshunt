import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Compass,
  MapPin,
  RotateCcw,
  Trash2,
  Edit2,
  Plus,
  Save,
  Search,
  Wind,
  Clock,
  Sparkles,
  Info,
  Check,
  X,
  Navigation,
  RefreshCw,
  Eye,
  EyeOff,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Shapes,
  Undo,
  CheckCircle2,
  Layers
} from 'lucide-react';
import {
  ThemeMode,
  Location,
  SavedPin,
  PinType,
  DailyForecast,
  UnitSystem,
  PressureUnit,
  HourlyForecast,
  PolygonType,
  PolygonPoint,
  SavedPolygon
} from '../types';
import { fetch5DayHuntingForecast, searchLocations } from '../services/weatherService';
import { getBestStandForWind } from '../utils/huntingEngine';

interface MapViewProps {
  location: Location;
  units: UnitSystem;
  pressureUnit: PressureUnit;
  theme: ThemeMode;
  hasCustomBackground?: boolean;
  dailyForecast: DailyForecast[];
  onSelectLocation?: (loc: Location) => void;
  selectedHour?: number;
  onSelectHour?: (hour: number) => void;
}

// Coordinate conversions for Web Mercator (Slippy Map Tiles)
function latLngToTileCoords(lat: number, lng: number, zoom: number) {
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const n = Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * n;
  const latRad = (clampedLat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

function tileXToLng(x: number, zoom: number) {
  return (x / Math.pow(2, zoom)) * 360 - 180;
}

function tileYToLat(y: number, zoom: number) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function getTileUrls(z: number, ty: number, tx: number, style: string): string[] {
  const maxTile = Math.pow(2, z);
  const wrappedTx = ((tx % maxTile) + maxTile) % maxTile;
  const clampedTy = Math.max(0, Math.min(maxTile - 1, ty));

  if (style === 'satellite') {
    const googleSub = Math.abs(tx + ty) % 4;
    return [
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${clampedTy}/${wrappedTx}`,
      `https://mt${googleSub}.google.com/vt/lyrs=s&x=${wrappedTx}&y=${clampedTy}&z=${z}`,
      `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${clampedTy}/${wrappedTx}`,
    ];
  } else if (style === 'topo') {
    const googleSub = Math.abs(tx + ty) % 4;
    return [
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${clampedTy}/${wrappedTx}`,
      `https://mt${googleSub}.google.com/vt/lyrs=p&x=${wrappedTx}&y=${clampedTy}&z=${z}`,
      `https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${clampedTy}/${wrappedTx}`,
    ];
  } else {
    const sub = ['a', 'b', 'c'][Math.abs(tx + ty) % 3];
    return [
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${clampedTy}/${wrappedTx}`,
      `https://${sub}.tile.openstreetmap.org/${z}/${wrappedTx}/${clampedTy}.png`,
      `https://mt0.google.com/vt/lyrs=m&x=${wrappedTx}&y=${clampedTy}&z=${z}`,
    ];
  }
}

const loadedTileCache = new Set<string>();

interface MapTileProps {
  tileKey: string;
  urls: string[];
  left: number;
  top: number;
  size: number;
  zIndex?: number;
  z: number;
  tx: number;
  ty: number;
  mapStyle: string;
  onTileLoaded?: (key: string, src: string, z: number, tx: number, ty: number, mapStyle: string) => void;
}

const MapTile = React.memo(({ tileKey, urls, left, top, size, zIndex = 1, z, tx, ty, mapStyle, onTileLoaded }: MapTileProps) => {
  const [urlIndex, setUrlIndex] = useState(0);
  const [retryCount, setRetryCount] = useState(0);

  const primaryUrl = urls[0];
  useEffect(() => {
    setUrlIndex(0);
    setRetryCount(0);
  }, [primaryUrl]);

  const handleError = () => {
    if (urlIndex + 1 < urls.length) {
      setUrlIndex((prev) => prev + 1);
    } else if (retryCount < 2) {
      setRetryCount((prev) => prev + 1);
    }
  };

  const currentUrl = urls[urlIndex] || urls[0];
  const finalSrc = retryCount > 0 ? `${currentUrl}?_r=${retryCount}` : currentUrl;

  const handleLoad = () => {
    loadedTileCache.add(finalSrc);
    if (onTileLoaded) {
      onTileLoaded(tileKey, finalSrc, z, tx, ty, mapStyle);
    }
  };

  return (
    <img
      src={finalSrc}
      alt=""
      draggable={false}
      onLoad={handleLoad}
      onError={handleError}
      className="absolute object-cover border-none select-none pointer-events-none"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${Math.ceil(size + 2.5)}px`,
        height: `${Math.ceil(size + 2.5)}px`,
        zIndex,
      }}
    />
  );
});

function getWindDirectionText(deg: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round((deg % 360) / 22.5) % 16;
  return directions[index];
}

const DIRECTION_DEGREES: Record<string, number> = {
  'N': 0, 'NNE': 22.5, 'NE': 45, 'ENE': 67.5, 'E': 90, 'ESE': 112.5, 'SE': 135, 'SSE': 157.5,
  'S': 180, 'SSW': 202.5, 'SW': 225, 'WSW': 247.5, 'W': 270, 'WNW': 292.5, 'NW': 315, 'NNW': 337.5,
};

// Generate an SVG path for a filled sector (cone) centered at (cx, cy)
function getSvgArcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const startRad = ((startAngle - 90) * Math.PI) / 180;
  const endRad = ((endAngle - 90) * Math.PI) / 180;

  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);

  const angleDiff = (endAngle - startAngle + 360) % 360;
  const largeArcFlag = angleDiff <= 180 ? 0 : 1;

  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
}

// Polygon Centroid Calculator
function getPolygonCentroid(points: PolygonPoint[]): PolygonPoint {
  if (!points || points.length === 0) return { lat: 0, lng: 0 };
  let sumLat = 0;
  let sumLng = 0;
  for (const pt of points) {
    sumLat += pt.lat;
    sumLng += pt.lng;
  }
  return {
    lat: sumLat / points.length,
    lng: sumLng / points.length,
  };
}

// Point in Polygon Ray-Casting Algorithm
function isPointInPolygon(lat: number, lng: number, polygonPoints: PolygonPoint[]): boolean {
  if (!polygonPoints || polygonPoints.length < 3) return false;
  let inside = false;
  const py = lat;
  const px = lng;
  for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
    const xi = polygonPoints[i].lng;
    const yi = polygonPoints[i].lat;
    const xj = polygonPoints[j].lng;
    const yj = polygonPoints[j].lat;

    const intersect = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Distance from point to line segment in degrees
function distanceToSegmentDeg(lat: number, lng: number, lat1: number, lng1: number, lat2: number, lng2: number): number {
  const l2 = (lat2 - lat1) * (lat2 - lat1) + (lng2 - lng1) * (lng2 - lng1);
  if (l2 === 0) return Math.hypot(lat - lat1, lng - lng1);
  let t = ((lat - lat1) * (lat2 - lat1) + (lng - lng1) * (lng2 - lng1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(lat - (lat1 + t * (lat2 - lat1)), lng - (lng1 + t * (lng2 - lng1)));
}

// Helper to find the closest point on a pixel line segment
function closestPointOnSegmentPx(
  pt: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): { x: number; y: number } {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return p1;
  let t = ((pt.x - p1.x) * dx + (pt.y - p1.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return {
    x: p1.x + t * dx,
    y: p1.y + t * dy,
  };
}

// Helper to find the closest point on a pixel polygon boundary (with optional safety validation)
function closestPointOnPolygonBoundaryPx(
  pt: { x: number; y: number },
  polyPx: { x: number; y: number }[],
  isSafeCallback?: (point: { x: number; y: number }) => boolean
): { x: number; y: number } {
  let closestPt = polyPx[0];
  let minDistanceSq = Infinity;
  for (let i = 0; i < polyPx.length; i++) {
    const p1 = polyPx[i];
    const p2 = polyPx[(i + 1) % polyPx.length];
    const cp = closestPointOnSegmentPx(pt, p1, p2);
    
    if (isSafeCallback && !isSafeCallback(cp)) {
      continue;
    }
    
    const distSq = (pt.x - cp.x) ** 2 + (pt.y - cp.y) ** 2;
    if (distSq < minDistanceSq) {
      minDistanceSq = distSq;
      closestPt = cp;
    }
  }
  
  // Fallback: if no point is "safe", return the closest point regardless of safety
  if (minDistanceSq === Infinity) {
    for (let i = 0; i < polyPx.length; i++) {
      const p1 = polyPx[i];
      const p2 = polyPx[(i + 1) % polyPx.length];
      const cp = closestPointOnSegmentPx(pt, p1, p2);
      const distSq = (pt.x - cp.x) ** 2 + (pt.y - cp.y) ** 2;
      if (distSq < minDistanceSq) {
        minDistanceSq = distSq;
        closestPt = cp;
      }
    }
  }
  return closestPt;
}

// Polygon Area & Perimeter Calculator
function getPolygonAreaAndPerimeter(points: PolygonPoint[], unitSystem: UnitSystem) {
  if (!points || points.length < 3) return { areaStr: '0 sq ft', acresStr: '0.00 Acres', perimeterStr: '0 ft' };

  const centroid = getPolygonCentroid(points);
  const latRad = (centroid.lat * Math.PI) / 180;
  const metersPerLat = 111320;
  const metersPerLng = 111320 * Math.cos(latRad);

  const localMeters = points.map((p) => ({
    x: (p.lng - centroid.lng) * metersPerLng,
    y: (p.lat - centroid.lat) * metersPerLat,
  }));

  let areaM2 = 0;
  let perimeterM = 0;
  const n = localMeters.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    areaM2 += localMeters[i].x * localMeters[j].y;
    areaM2 -= localMeters[j].x * localMeters[i].y;

    const dx = localMeters[j].x - localMeters[i].x;
    const dy = localMeters[j].y - localMeters[i].y;
    perimeterM += Math.hypot(dx, dy);
  }

  areaM2 = Math.abs(areaM2) / 2;

  const sqFeet = areaM2 * 10.7639;
  const acres = sqFeet / 43560;

  if (unitSystem === 'metric') {
    const hectares = areaM2 / 10000;
    const perimeterKm = perimeterM / 1000;
    const perimStr = perimeterM >= 1000 ? `${perimeterKm.toFixed(2)} km` : `${Math.round(perimeterM)} m`;
    const areaStr = areaM2 >= 10000 ? `${hectares.toFixed(2)} ha` : `${Math.round(areaM2)} m²`;
    return { areaStr, acresStr: `${acres.toFixed(2)} Acres (${hectares.toFixed(2)} ha)`, perimeterStr: perimStr };
  } else {
    const perimFt = perimeterM * 3.28084;
    const perimStr = perimFt >= 5280 ? `${(perimFt / 5280).toFixed(2)} mi` : `${Math.round(perimFt)} ft`;
    const areaStr = acres >= 1 ? `${acres.toFixed(2)} Acres` : `${Math.round(sqFeet).toLocaleString()} sq ft`;
    return { areaStr, acresStr: `${acres.toFixed(2)} Acres`, perimeterStr: perimStr };
  }
}

// Metadata for Marker Types
export const PIN_METADATA: Record<
  PinType,
  { label: string; emoji: string; color: string; bg: string; border: string }
> = {
  stand: { label: 'Tree Stand', emoji: '🎯', color: 'bg-emerald-600 text-white', bg: 'bg-emerald-900/90 text-emerald-200', border: 'border-emerald-500' },
  trail_cam: { label: 'Trail Camera', emoji: '📷', color: 'bg-sky-600 text-white', bg: 'bg-sky-900/90 text-sky-200', border: 'border-sky-500' },
  bedding: { label: 'Bedding Sanctuary', emoji: '🦌', color: 'bg-purple-600 text-white', bg: 'bg-purple-900/90 text-purple-200', border: 'border-purple-500' },
  food_plot: { label: 'Primary Food Plot', emoji: '🌾', color: 'bg-lime-600 text-white', bg: 'bg-lime-900/90 text-lime-200', border: 'border-lime-500' },
  scrape: { label: 'Scrape / Rub', emoji: '🪵', color: 'bg-amber-700 text-white', bg: 'bg-amber-900/90 text-amber-200', border: 'border-amber-600' },
  other: { label: 'Other Landmark', emoji: '📍', color: 'bg-slate-500 text-white', bg: 'bg-slate-950/90 text-slate-300', border: 'border-slate-400' },
};

// Metadata for Polygon Types
export const POLYGON_METADATA: Record<
  PolygonType,
  { label: string; emoji: string; color: string; stroke: string; fill: string; fillOpacity: number; border: string; bg: string }
> = {
  crop_field: {
    label: 'Crop Field',
    emoji: '🌽',
    color: '#eab308',
    stroke: '#eab308',
    fill: '#fef08a',
    fillOpacity: 0.3,
    border: 'border-amber-500/50',
    bg: 'bg-amber-500/10 text-amber-300',
  },
  food_plot: {
    label: 'Food Plot',
    emoji: '🌾',
    color: '#22c55e',
    stroke: '#22c55e',
    fill: '#86efac',
    fillOpacity: 0.35,
    border: 'border-emerald-500/50',
    bg: 'bg-emerald-500/10 text-emerald-300',
  },
  bedding_zone: {
    label: 'Bedding Sanctuary',
    emoji: '🦌',
    color: '#a855f7',
    stroke: '#a855f7',
    fill: '#d8b4fe',
    fillOpacity: 0.35,
    border: 'border-purple-500/50',
    bg: 'bg-purple-500/10 text-purple-300',
  },
  water_source: {
    label: 'Water Source / Creek',
    emoji: '💧',
    color: '#06b6d4',
    stroke: '#06b6d4',
    fill: '#67e8f9',
    fillOpacity: 0.35,
    border: 'border-cyan-500/50',
    bg: 'bg-cyan-500/10 text-cyan-300',
  },
  timber_woods: {
    label: 'Timber / Hardwoods',
    emoji: '🌲',
    color: '#15803d',
    stroke: '#15803d',
    fill: '#4ade80',
    fillOpacity: 0.25,
    border: 'border-green-600/50',
    bg: 'bg-green-600/10 text-green-300',
  },
  custom: {
    label: 'Custom Zone',
    emoji: '🚩',
    color: '#f97316',
    stroke: '#f97316',
    fill: '#fdba74',
    fillOpacity: 0.3,
    border: 'border-orange-500/50',
    bg: 'bg-orange-500/10 text-orange-300',
  },
  property_boundary: {
    label: 'Property Boundary',
    emoji: '🏡',
    color: '#f43f5e',
    stroke: '#f43f5e',
    fill: '#fda4af',
    fillOpacity: 0.0,
    border: 'border-rose-500/50',
    bg: 'bg-rose-500/10 text-rose-300',
  },
};

export const MapView: React.FC<MapViewProps> = ({
  location,
  units,
  pressureUnit,
  theme,
  hasCustomBackground = false,
  dailyForecast,
  onSelectLocation,
  selectedHour: propSelectedHour,
  onSelectHour: propOnSelectHour,
}) => {
  const isDark = theme === 'dark';

  // State: Saved Pins loaded from localStorage
  const [pins, setPins] = useState<SavedPin[]>(() => {
    const saved = localStorage.getItem('letshunt_saved_pins');
    return saved ? JSON.parse(saved) : [];
  });

  // State: Saved Polygons loaded from localStorage
  const [polygons, setPolygons] = useState<SavedPolygon[]>(() => {
    const saved = localStorage.getItem('letshunt_saved_polygons');
    return saved ? JSON.parse(saved) : [];
  });

  // Floating Dropdown Controls on Map
  const [showLayersDropdown, setShowLayersDropdown] = useState(false);
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [activeLayersTab, setActiveLayersTab] = useState<'pins' | 'polygons'>('pins');

  // Interactive Pin Placement mode
  const [isPlacingMarkerMode, setIsPlacingMarkerMode] = useState(false);

  // Preferred Wind Overlay toggle
  const [showPreferredWind, setShowPreferredWind] = useState(() => {
    const saved = localStorage.getItem('letshunt_show_preferred_wind');
    return saved ? saved === 'true' : true;
  });
  const [showScentCone, setShowScentCone] = useState(() => {
    const saved = localStorage.getItem('letshunt_show_scent_cone');
    return saved ? saved === 'true' : true;
  });

  // Currently selected pin / polygon
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null);

  // Form inputs for active editing pin
  const [editingPinId, setEditingPinId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<PinType>('stand');
  const [editNotes, setEditNotes] = useState('');
  const [editPreferredWindDeg, setEditPreferredWindDeg] = useState<number>(0);

  // Polygon creation & editing
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
  const [currentPolygonPoints, setCurrentPolygonPoints] = useState<PolygonPoint[]>([]);
  const [isSavingNewPolygonModal, setIsSavingNewPolygonModal] = useState(false);
  const [editingPolygonId, setEditingPolygonId] = useState<string | null>(null);
  const [polygonEditName, setPolygonEditName] = useState('');
  const [polygonEditType, setPolygonEditType] = useState<PolygonType>('food_plot');
  const [polygonEditNotes, setPolygonEditNotes] = useState('');

  // Map view parameters
  const [zoom, setZoom] = useState(16);
  const [mapStyle, setMapStyle] = useState<'satellite' | 'topo' | 'street'>(() => {
    const saved = localStorage.getItem('letshunt_map_style');
    return (saved as 'satellite' | 'topo' | 'street') || 'satellite';
  });
  const [scentSpread, setScentSpread] = useState<15 | 45 | 75>(45);
  const [isScentPanelCollapsed, setIsScentPanelCollapsed] = useState(true);
  const [activeForecasterTab, setActiveForecasterTab] = useState<'hourly' | 'details'>('hourly');

  // Persistent tile cache across zoom levels
  const cachedTilesRef = useRef<Map<string, { z: number; tx: number; ty: number; src: string; style: string }>>(new Map());
  const [, setTileCacheVersion] = useState(0);

  const handleTileLoaded = useCallback((key: string, src: string, z: number, tx: number, ty: number, style: string) => {
    if (!cachedTilesRef.current.has(key)) {
      cachedTilesRef.current.set(key, { z, tx, ty, src, style });
      setTileCacheVersion((v) => v + 1);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('letshunt_show_preferred_wind', showPreferredWind.toString());
  }, [showPreferredWind]);

  useEffect(() => {
    localStorage.setItem('letshunt_show_scent_cone', showScentCone.toString());
  }, [showScentCone]);

  useEffect(() => {
    localStorage.setItem('letshunt_map_style', mapStyle);
  }, [mapStyle]);

  const defaultLat = location.latitude;
  const defaultLng = location.longitude;
  const [centerLat, setCenterLat] = useState(defaultLat);
  const [centerLng, setCenterLng] = useState(defaultLng);

  // When location changes, update map center
  useEffect(() => {
    setCenterLat(location.latitude);
    setCenterLng(location.longitude);
  }, [location]);

  // Keyboard shortcut listener: ESC key exits modes & closes dropdowns
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDrawingPolygon) {
          setIsDrawingPolygon(false);
          setCurrentPolygonPoints([]);
        } else if (isPlacingMarkerMode) {
          setIsPlacingMarkerMode(false);
        } else {
          setShowLayersDropdown(false);
          setShowAddDropdown(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawingPolygon, isPlacingMarkerMode]);

  // Scent analysis parameters (forecast day and hour selection)
  const [forecastDays, setForecastDays] = useState<DailyForecast[]>(dailyForecast);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [localSelectedHour, setLocalSelectedHour] = useState<number>(() => new Date().getHours());
  const selectedHour = propSelectedHour !== undefined ? propSelectedHour : localSelectedHour;
  const setSelectedHour = propOnSelectHour || setLocalSelectedHour;
  const [showBestWindBadge, setShowBestWindBadge] = useState(true);

  // Individual pin weather forecasts cache
  const [pinWeatherCache, setPinWeatherCache] = useState<Record<string, DailyForecast[]>>({});
  const [loadingPinWeather, setLoadingPinWeather] = useState(false);

  useEffect(() => {
    setForecastDays(dailyForecast);
  }, [dailyForecast]);

  // Drag-to-Pan & Pinch state
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const lastTouchTimeRef = useRef<number>(0);
  const pinchDistRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number | null>(null);
  const isPinchingRef = useRef<boolean>(false);
  const hasMovedRef = useRef<boolean>(false);
  const [dimensions, setDimensions] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 640,
    height: typeof window !== 'undefined' ? window.innerHeight : 480,
  }));

  // Location Search inside Map
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Measure map container size dynamically
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const updateSize = () => {
      if (mapContainerRef.current) {
        const rect = mapContainerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setDimensions({ width: rect.width, height: rect.height });
        }
      }
    };
    updateSize();
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setDimensions({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      }
    });
    observer.observe(mapContainerRef.current);
    return () => observer.disconnect();
  }, []);

  // Location search effect
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchLocations(searchQuery);
        setSearchResults(results);
      } catch (err) {
        console.error('Search location error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click outside listener for search & dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Save pins to localStorage
  const savePinsToStorage = (updatedPins: SavedPin[]) => {
    setPins(updatedPins);
    localStorage.setItem('letshunt_saved_pins', JSON.stringify(updatedPins));
  };

  // Save polygons to localStorage
  const savePolygonsToStorage = (updatedPolygons: SavedPolygon[]) => {
    setPolygons(updatedPolygons);
    localStorage.setItem('letshunt_saved_polygons', JSON.stringify(updatedPolygons));
  };

  // Layer & Element Visibility Toggles
  const [showPropertyBoundaries, setShowPropertyBoundaries] = useState(() => {
    const saved = localStorage.getItem('letshunt_show_property_boundaries');
    return saved ? saved === 'true' : true;
  });
  const [showZones, setShowZones] = useState(() => {
    const saved = localStorage.getItem('letshunt_show_zones');
    return saved ? saved === 'true' : true;
  });
  const [showPins, setShowPins] = useState(() => {
    const saved = localStorage.getItem('letshunt_show_pins');
    return saved ? saved === 'true' : true;
  });
  const [hiddenPinIds, setHiddenPinIds] = useState<string[]>([]);

  useEffect(() => {
    localStorage.setItem('letshunt_show_property_boundaries', showPropertyBoundaries.toString());
  }, [showPropertyBoundaries]);

  useEffect(() => {
    localStorage.setItem('letshunt_show_zones', showZones.toString());
  }, [showZones]);

  useEffect(() => {
    localStorage.setItem('letshunt_show_pins', showPins.toString());
  }, [showPins]);
  const [hiddenPolygonIds, setHiddenPolygonIds] = useState<string[]>([]);

  const lastPinchTimeRef = useRef<number>(0);

  const visiblePolygons = useMemo(() => {
    return polygons.filter((poly) => {
      if (poly.type === 'property_boundary' && !showPropertyBoundaries) return false;
      if (poly.type !== 'property_boundary' && !showZones) return false;
      if (hiddenPolygonIds.includes(poly.id)) return false;
      return true;
    });
  }, [polygons, showPropertyBoundaries, showZones, hiddenPolygonIds]);

  const visiblePins = useMemo(() => {
    if (!showPins) return [];
    return pins.filter((p) => !hiddenPinIds.includes(p.id));
  }, [pins, showPins, hiddenPinIds]);

  // Currently active pin
  const selectedPin = useMemo(() => {
    return pins.find((p) => p.id === selectedPinId) || null;
  }, [pins, selectedPinId]);

  // Currently active polygon
  const selectedPolygon = useMemo(() => {
    return polygons.find((p) => p.id === selectedPolygonId) || null;
  }, [polygons, selectedPolygonId]);

  const selectedPolyStats = useMemo(() => {
    if (!selectedPolygon) return null;
    return getPolygonAreaAndPerimeter(selectedPolygon.points, units);
  }, [selectedPolygon, units]);

  // Handle center location reset
  const handleResetLocation = () => {
    setCenterLat(defaultLat);
    setCenterLng(defaultLng);
    setZoom(16);
  };

  // Fetch pin-specific weather if selected
  useEffect(() => {
    if (!selectedPin) return;

    const isNearMain =
      Math.abs(selectedPin.lat - location.latitude) < 0.015 &&
      Math.abs(selectedPin.lng - location.longitude) < 0.015;

    if (isNearMain) return;

    if (pinWeatherCache[selectedPin.id]) return;

    const fetchPinWeather = async () => {
      setLoadingPinWeather(true);
      try {
        const pinLocation: Location = {
          name: selectedPin.name,
          latitude: selectedPin.lat,
          longitude: selectedPin.lng,
        };
        const data = await fetch5DayHuntingForecast(pinLocation, units, pressureUnit);
        if (data && data.length > 0) {
          setPinWeatherCache((prev) => ({
            ...prev,
            [selectedPin.id]: data,
          }));
        }
      } catch (err) {
        console.error('Failed to fetch pin weather:', err);
      } finally {
        setLoadingPinWeather(false);
      }
    };

    fetchPinWeather();
  }, [selectedPin, location, units, pressureUnit, pinWeatherCache]);

  const activeForecasts = useMemo(() => {
    if (selectedPin && pinWeatherCache[selectedPin.id]) {
      return pinWeatherCache[selectedPin.id];
    }
    return forecastDays;
  }, [selectedPin, pinWeatherCache, forecastDays]);

  const activeDayForecast = activeForecasts[selectedDayIndex] || activeForecasts[0];

  const currentHourForecast: HourlyForecast | undefined = useMemo(() => {
    if (!activeDayForecast || !activeDayForecast.hourly || activeDayForecast.hourly.length === 0) return undefined;
    
    // Direct 0-23 index lookup (since daily hourly array always contains 24 hours indexed 0..23)
    const clampedHour = Math.max(0, Math.min(23, selectedHour));
    if (activeDayForecast.hourly[clampedHour]) {
      return activeDayForecast.hourly[clampedHour];
    }
    
    // Fallback match by timestamp hour
    return activeDayForecast.hourly.find((h) => {
      if (h.timestamp) {
        const d = new Date(h.timestamp);
        if (!isNaN(d.getTime())) return d.getHours() === clampedHour;
      }
      return false;
    }) || activeDayForecast.hourly[0];
  }, [activeDayForecast, selectedHour]);

  const windDeg = currentHourForecast ? currentHourForecast.windDirectionDeg : location ? 0 : 0;
  const windDirText = currentHourForecast ? currentHourForecast.windDirectionText : 'N';
  const windMph = currentHourForecast ? currentHourForecast.windSpeedMph : 5;

  const displayWindSpeed = useMemo(() => {
    if (units === 'metric') {
      const kmh = currentHourForecast ? currentHourForecast.windSpeedKmh : Math.round(windMph * 1.60934);
      return `${kmh} km/h`;
    }
    return `${windMph} mph`;
  }, [units, currentHourForecast, windMph]);

  const downwindDeg = (windDeg + 180) % 360;
  const downwindDirText = getWindDirectionText(downwindDeg);

  // Polygon drawing handlers
  const handleStartDrawPolygon = () => {
    setIsDrawingPolygon(true);
    setCurrentPolygonPoints([]);
    setSelectedPinId(null);
    setSelectedPolygonId(null);
    setShowAddDropdown(false);
  };

  const handleStartDrawPropertyBoundary = () => {
    setIsDrawingPolygon(true);
    setCurrentPolygonPoints([]);
    setSelectedPinId(null);
    setSelectedPolygonId(null);
    setPolygonEditType('property_boundary');
    setPolygonEditName('Property Line Boundary');
    setShowAddDropdown(false);
  };

  const handleUndoPolygonPoint = () => {
    setCurrentPolygonPoints((prev) => prev.slice(0, -1));
  };

  const handleFinishDrawPolygon = () => {
    if (currentPolygonPoints.length < 3) {
      alert('A polygon zone requires at least 3 points.');
      return;
    }
    if (polygonEditType !== 'property_boundary') {
      setPolygonEditName(`Field Zone #${polygons.length + 1}`);
      setPolygonEditType('food_plot');
    }
    setPolygonEditNotes('');
    setIsSavingNewPolygonModal(true);
  };

  const handleSaveNewPolygon = () => {
    if (currentPolygonPoints.length < 3) return;
    const newId = `poly-${Date.now()}`;
    const newPoly: SavedPolygon = {
      id: newId,
      name: polygonEditName.trim() || `Zone #${polygons.length + 1}`,
      type: polygonEditType,
      points: currentPolygonPoints,
      notes: polygonEditNotes.trim(),
      createdAt: Date.now(),
    };
    const updated = [...polygons, newPoly];
    savePolygonsToStorage(updated);
    setIsSavingNewPolygonModal(false);
    setIsDrawingPolygon(false);
    setCurrentPolygonPoints([]);
    setSelectedPolygonId(newId);
  };

  const handleDeletePolygon = (polyId: string) => {
    const updated = polygons.filter((p) => p.id !== polyId);
    savePolygonsToStorage(updated);
    if (selectedPolygonId === polyId) {
      setSelectedPolygonId(null);
    }
  };

  const handleSavePolygonEdit = () => {
    if (!editingPolygonId) return;
    const updated = polygons.map((p) => {
      if (p.id === editingPolygonId) {
        return {
          ...p,
          name: polygonEditName.trim() || p.name,
          type: polygonEditType,
          notes: polygonEditNotes.trim(),
        };
      }
      return p;
    });
    savePolygonsToStorage(updated);
    setEditingPolygonId(null);
  };

  const handleDeletePin = (pinId: string) => {
    const updated = pins.filter((p) => p.id !== pinId);
    savePinsToStorage(updated);
    if (selectedPinId === pinId) {
      setSelectedPinId(null);
    }
    if (editingPinId === pinId) {
      setEditingPinId(null);
    }
  };

  const handleSavePinDetails = () => {
    if (!editingPinId) return;
    const updated = pins.map((p) => {
      if (p.id === editingPinId) {
        return {
          ...p,
          name: editName.trim() || p.name,
          type: editType,
          notes: editNotes.trim(),
          preferredWindDeg: editPreferredWindDeg,
        };
      }
      return p;
    });
    savePinsToStorage(updated);
    setEditingPinId(null);
  };

  // Center on map helpers
  const centerOnPin = (pin: SavedPin) => {
    setCenterLat(pin.lat);
    setCenterLng(pin.lng);
    setSelectedPinId(pin.id);
    setSelectedPolygonId(null);
  };

  const selectPolygon = (poly: SavedPolygon) => {
    setSelectedPolygonId(poly.id);
    setSelectedPinId(null);
  };

  const selectPolygonAndCenter = (poly: SavedPolygon) => {
    const centroid = getPolygonCentroid(poly.points);
    setCenterLat(centroid.lat);
    setCenterLng(centroid.lng);
    setSelectedPolygonId(poly.id);
    setSelectedPinId(null);
  };

  // Handle map canvas clicks
  const handleMapClick = (lat: number, lng: number) => {
    if (isPinchingRef.current || Date.now() - lastPinchTimeRef.current < 400) return;

    if (isDrawingPolygon) {
      setCurrentPolygonPoints((prev) => [...prev, { lat, lng }]);
      return;
    }

    if (isPlacingMarkerMode) {
      const newId = `pin-${Date.now()}`;
      const newPin: SavedPin = {
        id: newId,
        name: `Stand Location #${pins.length + 1}`,
        lat,
        lng,
        type: 'stand',
        notes: 'Scent cone plotting active.',
        preferredWindDeg: 0,
        createdAt: Date.now(),
      };
      const updated = [...pins, newPin];
      savePinsToStorage(updated);
      setSelectedPinId(newId);
      setSelectedPolygonId(null);
      setEditingPinId(newId);
      setEditName(newPin.name);
      setEditType(newPin.type);
      setEditNotes(newPin.notes || '');
      setEditPreferredWindDeg(0);
      setIsPlacingMarkerMode(false);
      return;
    }

    // Check if clicked near existing visible pin
    const threshold = 0.0008;
    const clickedPin = visiblePins.find((p) => Math.abs(p.lat - lat) < threshold && Math.abs(p.lng - lng) < threshold);
    if (clickedPin) {
      setSelectedPinId(clickedPin.id);
      setSelectedPolygonId(null);
      setEditingPinId(null);
      return;
    }

    // 1. Check if clicked inside existing field/zone polygon first (excluding property_boundary)
    const clickedFieldPoly = visiblePolygons.find(
      (poly) => poly.type !== 'property_boundary' && isPointInPolygon(lat, lng, poly.points)
    );
    if (clickedFieldPoly) {
      selectPolygon(clickedFieldPoly);
      return;
    }

    // 2. Check if clicked inside property boundary polygon next
    const clickedPropPoly = visiblePolygons.find((poly) => poly.type === 'property_boundary' && isPointInPolygon(lat, lng, poly.points));
    if (clickedPropPoly) {
      selectPolygon(clickedPropPoly);
      return;
    }

    // 3. Check if clicked near any polygon border line segment (~25 screen pixels)
    const tileSize = 256;
    const pixelsPerDegree = (tileSize * Math.pow(2, zoom)) / 360;
    const clickedBorderPoly = visiblePolygons.find((poly) => {
      const pts = poly.points;
      for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % pts.length];
        const distDeg = distanceToSegmentDeg(lat, lng, p1.lat, p1.lng, p2.lat, p2.lng);
        const distPx = distDeg * pixelsPerDegree;
        if (distPx < 25) return true;
      }
      return false;
    });
    if (clickedBorderPoly) {
      selectPolygon(clickedBorderPoly);
      return;
    }

    // Deselect if clicking empty terrain
    setSelectedPinId(null);
    setSelectedPolygonId(null);
  };

  // Helper to check if event target is an interactive UI control (button, slider, input, modal)
  const isUiControlTarget = (target: HTMLElement | null) => {
    if (!target) return false;
    return !!target.closest('.ui-control, button, input, select, textarea, [role="button"], a');
  };

  // Mouse / Touch Dragging & Panning logic
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isUiControlTarget(e.target as HTMLElement)) return;
    setIsDragging(true);
    hasMovedRef.current = false;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMovedRef.current = true;
    }

    dragStartRef.current = { x: e.clientX, y: e.clientY };

    const centerTile = latLngToTileCoords(centerLat, centerLng, zoom);
    const tileSize = 256;
    const newX = centerTile.x - dx / tileSize;
    const newY = centerTile.y - dy / tileSize;

    setCenterLng(tileXToLng(newX, zoom));
    setCenterLat(tileYToLat(newY, zoom));
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setIsDragging(false);

    if (!hasMovedRef.current && mapContainerRef.current) {
      const rect = mapContainerRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const centerTile = latLngToTileCoords(centerLat, centerLng, zoom);
      const tileSize = 256;
      const mouseTileX = centerTile.x + (clickX - dimensions.width / 2) / tileSize;
      const mouseTileY = centerTile.y + (clickY - dimensions.height / 2) / tileSize;

      const clickedLat = tileYToLat(mouseTileY, zoom);
      const clickedLng = tileXToLng(mouseTileX, zoom);

      handleMapClick(clickedLat, clickedLng);
    }
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoom((prev) => Math.min(19, prev + 0.5));
    } else {
      setZoom((prev) => Math.max(3, prev - 0.5));
    }
  };

  // Non-passive native touch listeners to prevent page viewport zoom when pinching on mobile
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;

    const handleNativeTouchStart = (e: TouchEvent) => {
      if (isUiControlTarget(e.target as HTMLElement)) return;
      if (e.touches.length >= 2) {
        if (e.cancelable) e.preventDefault();
        isPinchingRef.current = true;
        lastPinchTimeRef.current = Date.now();
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        pinchDistRef.current = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
        initialZoomRef.current = zoom;
      }
    };

    const handleNativeTouchMove = (e: TouchEvent) => {
      if (isUiControlTarget(e.target as HTMLElement)) return;
      if (e.touches.length >= 2 && isPinchingRef.current && pinchDistRef.current && initialZoomRef.current) {
        if (e.cancelable) e.preventDefault();
        lastPinchTimeRef.current = Date.now();
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const currentDist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
        const zoomFactor = currentDist / pinchDistRef.current;
        const newZoom = Math.min(19, Math.max(3, initialZoomRef.current + Math.log2(zoomFactor)));
        setZoom(newZoom);
      }
    };

    const handleNativeTouchEnd = (e: TouchEvent) => {
      if (isPinchingRef.current || e.touches.length >= 2) {
        lastPinchTimeRef.current = Date.now();
      }
      if (e.touches.length < 2 && isPinchingRef.current) {
        isPinchingRef.current = false;
        pinchDistRef.current = null;
        initialZoomRef.current = null;
        setZoom((prev) => Math.min(19, Math.max(3, Math.round(prev * 2) / 2)));
      }
    };

    el.addEventListener('touchstart', handleNativeTouchStart, { passive: false });
    el.addEventListener('touchmove', handleNativeTouchMove, { passive: false });
    el.addEventListener('touchend', handleNativeTouchEnd, { passive: false });

    return () => {
      el.removeEventListener('touchstart', handleNativeTouchStart);
      el.removeEventListener('touchmove', handleNativeTouchMove);
      el.removeEventListener('touchend', handleNativeTouchEnd);
    };
  }, [zoom]);

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isUiControlTarget(e.target as HTMLElement)) return;

    if (e.touches.length === 2) {
      isPinchingRef.current = true;
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const dist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
      pinchDistRef.current = dist;
      initialZoomRef.current = zoom;
      return;
    }

    if (e.touches.length === 1) {
      isPinchingRef.current = false;
      const now = Date.now();
      if (now - lastTouchTimeRef.current < 300) {
        setZoom((prev) => Math.min(19, prev + 1));
      }
      lastTouchTimeRef.current = now;

      setIsDragging(true);
      hasMovedRef.current = false;
      dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isPinchingRef.current && e.touches.length === 2 && pinchDistRef.current && initialZoomRef.current) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const currentDist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
      const zoomFactor = currentDist / pinchDistRef.current;
      const newZoom = Math.min(19, Math.max(3, initialZoomRef.current + Math.log2(zoomFactor)));
      setZoom(newZoom);
      return;
    }

    if (!isDragging || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - dragStartRef.current.x;
    const dy = e.touches[0].clientY - dragStartRef.current.y;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMovedRef.current = true;
    }

    dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };

    const centerTile = latLngToTileCoords(centerLat, centerLng, zoom);
    const tileSize = 256;
    const newX = centerTile.x - dx / tileSize;
    const newY = centerTile.y - dy / tileSize;

    setCenterLng(tileXToLng(newX, zoom));
    setCenterLat(tileYToLat(newY, zoom));
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (isPinchingRef.current) {
      isPinchingRef.current = false;
      pinchDistRef.current = null;
      initialZoomRef.current = null;
      setZoom((prev) => Math.min(19, Math.max(3, Math.round(prev * 2) / 2)));
      return;
    }

    if (!isDragging) return;
    setIsDragging(false);

    if (!hasMovedRef.current && mapContainerRef.current && e.changedTouches.length > 0) {
      const rect = mapContainerRef.current.getBoundingClientRect();
      const clickX = e.changedTouches[0].clientX - rect.left;
      const clickY = e.changedTouches[0].clientY - rect.top;

      const centerTile = latLngToTileCoords(centerLat, centerLng, zoom);
      const tileSize = 256;
      const mouseTileX = centerTile.x + (clickX - dimensions.width / 2) / tileSize;
      const mouseTileY = centerTile.y + (clickY - dimensions.height / 2) / tileSize;

      const clickedLat = tileYToLat(mouseTileY, zoom);
      const clickedLng = tileXToLng(mouseTileX, zoom);

      handleMapClick(clickedLat, clickedLng);
    }
  };

  // Map Tile Calculations
  const baseZoom = Math.min(19, Math.max(2, Math.round(zoom)));
  const halfWidth = dimensions.width / 2;
  const halfHeight = dimensions.height / 2;

  const allTileElements: React.ReactNode[] = [];

  // Tier 1: Low-zoom regional overview layer (zIndex: 1)
  // Guarantees 100% background satellite coverage for the entire region
  const overviewZoom = Math.min(12, Math.max(2, baseZoom - 3));
  if (overviewZoom < baseZoom) {
    const ovScale = Math.pow(2, zoom - overviewZoom);
    const ovTileSize = 256 * ovScale;
    const ovCoords = latLngToTileCoords(centerLat, centerLng, overviewZoom);

    const ovMinX = Math.floor(ovCoords.x - halfWidth / ovTileSize) - 2;
    const ovMaxX = Math.ceil(ovCoords.x + halfWidth / ovTileSize) + 2;
    const ovMinY = Math.floor(ovCoords.y - halfHeight / ovTileSize) - 2;
    const ovMaxY = Math.ceil(ovCoords.y + halfHeight / ovTileSize) + 2;

    for (let tx = ovMinX; tx <= ovMaxX; tx++) {
      for (let ty = ovMinY; ty <= ovMaxY; ty++) {
        const tileLeft = halfWidth + (tx - ovCoords.x) * ovTileSize;
        const tileTop = halfHeight + (ty - ovCoords.y) * ovTileSize;
        const urls = getTileUrls(overviewZoom, ty, tx, mapStyle);
        const tileKey = `overview-${overviewZoom}-${tx}-${ty}-${mapStyle}`;

        allTileElements.push(
          <MapTile
            key={tileKey}
            tileKey={tileKey}
            urls={urls}
            left={tileLeft}
            top={tileTop}
            size={ovTileSize}
            zIndex={1}
            z={overviewZoom}
            tx={tx}
            ty={ty}
            mapStyle={mapStyle}
            onTileLoaded={handleTileLoaded}
          />
        );
      }
    }
  }

  // Tier 2: Persistent cached loaded satellite tiles from memory (zIndex: 2)
  // Scaled smoothly to match the current viewport so zero space appears while zooming/panning
  cachedTilesRef.current.forEach((cached, key) => {
    if (cached.style === mapStyle) {
      const scale = Math.pow(2, zoom - cached.z);
      const tileSize = 256 * scale;
      const tileCoords = latLngToTileCoords(centerLat, centerLng, cached.z);
      const tileLeft = halfWidth + (cached.tx - tileCoords.x) * tileSize;
      const tileTop = halfHeight + (cached.ty - tileCoords.y) * tileSize;

      if (
        tileLeft + tileSize >= -160 &&
        tileLeft <= dimensions.width + 160 &&
        tileTop + tileSize >= -160 &&
        tileTop <= dimensions.height + 160
      ) {
        allTileElements.push(
          <img
            key={`cached-bg-${key}`}
            src={cached.src}
            alt=""
            draggable={false}
            className="absolute object-cover border-none select-none pointer-events-none"
            style={{
              left: `${tileLeft}px`,
              top: `${tileTop}px`,
              width: `${Math.ceil(tileSize + 2.5)}px`,
              height: `${Math.ceil(tileSize + 2.5)}px`,
              zIndex: 2,
            }}
          />
        );
      }
    }
  });

  // Tier 3: Active current zoom level layer (zIndex: 5)
  const actScale = Math.pow(2, zoom - baseZoom);
  const actTileSize = 256 * actScale;
  const actCoords = latLngToTileCoords(centerLat, centerLng, baseZoom);

  const actMinX = Math.floor(actCoords.x - halfWidth / actTileSize) - 4;
  const actMaxX = Math.ceil(actCoords.x + halfWidth / actTileSize) + 4;
  const actMinY = Math.floor(actCoords.y - halfHeight / actTileSize) - 4;
  const actMaxY = Math.ceil(actCoords.y + halfHeight / actTileSize) + 4;

  for (let tx = actMinX; tx <= actMaxX; tx++) {
    for (let ty = actMinY; ty <= actMaxY; ty++) {
      const tileLeft = halfWidth + (tx - actCoords.x) * actTileSize;
      const tileTop = halfHeight + (ty - actCoords.y) * actTileSize;
      const urls = getTileUrls(baseZoom, ty, tx, mapStyle);
      const tileKey = `active-${baseZoom}-${tx}-${ty}-${mapStyle}`;

      allTileElements.push(
        <MapTile
          key={tileKey}
          tileKey={tileKey}
          urls={urls}
          left={tileLeft}
          top={tileTop}
          size={actTileSize}
          zIndex={5}
          z={baseZoom}
          tx={tx}
          ty={ty}
          mapStyle={mapStyle}
          onTileLoaded={handleTileLoaded}
        />
      );
    }
  }

  // Convert lat/lng to map container pixel coordinates
  const latLngToPixel = useCallback(
    (lat: number, lng: number) => {
      const currentTileZoom = Math.min(19, Math.max(2, Math.round(zoom)));
      const zoomScale = Math.pow(2, zoom - currentTileZoom);
      const scaledTileSize = 256 * zoomScale;

      const centerTile = latLngToTileCoords(centerLat, centerLng, currentTileZoom);
      const pt = latLngToTileCoords(lat, lng, currentTileZoom);

      const x = halfWidth + (pt.x - centerTile.x) * scaledTileSize;
      const y = halfHeight + (pt.y - centerTile.y) * scaledTileSize;
      return { x, y };
    },
    [centerLat, centerLng, halfWidth, halfHeight, zoom]
  );

  // Stand Scent Plume Cone Path Calculation
  const scentConePath = useMemo(() => {
    if (!selectedPin || !showScentCone) return null;

    const startDeg = (downwindDeg - scentSpread / 2 + 360) % 360;
    const endDeg = (downwindDeg + scentSpread / 2 + 360) % 360;

    const pinPixel = latLngToPixel(selectedPin.lat, selectedPin.lng);
    const radiusPixels = Math.min(260, Math.max(90, (windMph || 5) * 12 * (zoom / 15)));

    return getSvgArcPath(pinPixel.x, pinPixel.y, radiusPixels, startDeg, endDeg);
  }, [selectedPin, showScentCone, downwindDeg, scentSpread, latLngToPixel, windMph, zoom]);

  // Preferred Wind Vector Sector Paths for all markers
  const preferredWindPaths = useMemo(() => {
    if (!showPreferredWind) return [];
    return pins
      .filter((p) => p.preferredWindDeg !== undefined)
      .map((pin) => {
        const prefWind = pin.preferredWindDeg!;
        const prefDownwind = (prefWind + 180) % 360;
        const startDeg = (prefDownwind - 35 + 360) % 360;
        const endDeg = (prefDownwind + 35 + 360) % 360;

        const pinPixel = latLngToPixel(pin.lat, pin.lng);
        const radius = selectedPinId === pin.id ? 130 : 85;
        const path = getSvgArcPath(pinPixel.x, pinPixel.y, radius, startDeg, endDeg);
        return { id: pin.id, path, isSelected: selectedPinId === pin.id };
      });
  }, [pins, showPreferredWind, selectedPinId, latLngToPixel]);

  // Helper for point in polygon test
  const isPixelPointInPolygon = useCallback(
    (pt: { x: number; y: number }, poly: { x: number; y: number }[]): boolean => {
      if (!poly || poly.length < 3) return false;
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x,
          yi = poly[i].y;
        const xj = poly[j].x,
          yj = poly[j].y;
        const intersect =
          yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
      }
      return inside;
    },
    []
  );

  // Helper to clamp any route point strictly inside the Property Boundary polygon
  const clampToPropertyBoundary = useCallback(
    (
      pt: { x: number; y: number },
      propPolyPx: { x: number; y: number }[] | null
    ): { x: number; y: number } => {
      if (!propPolyPx || propPolyPx.length < 3) return pt;
      if (isPixelPointInPolygon(pt, propPolyPx)) return pt;

      // Calculate property centroid
      const cx = propPolyPx.reduce((sum, p) => sum + p.x, 0) / propPolyPx.length;
      const cy = propPolyPx.reduce((sum, p) => sum + p.y, 0) / propPolyPx.length;

      // Binary search along ray towards centroid until inside property boundary with safety inset
      let low = 0;
      let high = 1;
      let best = { x: cx, y: cy };

      for (let step = 0; step < 12; step++) {
        const mid = (low + high) / 2;
        const testPt = {
          x: pt.x + (cx - pt.x) * mid,
          y: pt.y + (cy - pt.y) * mid,
        };

        if (isPixelPointInPolygon(testPt, propPolyPx)) {
          best = testPt;
          high = mid; // Try pushing further towards original pt
        } else {
          low = mid; // Must pull closer to centroid
        }
      }

      return best;
    },
    [isPixelPointInPolygon]
  );

  // Helper for line segment intersection
  const lineSegmentsIntersect = useCallback(
    (
      p1: { x: number; y: number },
      p2: { x: number; y: number },
      p3: { x: number; y: number },
      p4: { x: number; y: number }
    ): boolean => {
      const ccw = (
        a: { x: number; y: number },
        b: { x: number; y: number },
        c: { x: number; y: number }
      ) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);

      return (
        ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4)
      );
    },
    []
  );

  // Tactical Approach Route Calculation (Disabled)
  const tacticalRoutePoints = null;

  const _disabledRouteCode = () => {
    const routeCanGoThroughFields = false;
    const isRouteEnabled = false;

    const latLngToFixed = (lat: number, lng: number) => {
      const { x, y } = latLngToTileCoords(lat, lng, 16);
      return { x: x * 256, y: y * 256 };
    };

    const fixedToLatLng = (x: number, y: number) => {
      const tx = x / 256;
      const ty = y / 256;
      const lat = tileYToLat(ty, 16);
      const lng = tileXToLng(tx, 16);
      return { lat, lng };
    };

    // Property Boundary Polygon pixels and object
    const propPolyObj = polygons.find((p) => p.type === 'property_boundary' && p.points.length >= 3);
    const propPolyPx = propPolyObj ? propPolyObj.points.map((pt) => latLngToFixed(pt.lat, pt.lng)) : null;

    const localClampToPropertyBoundary = (
      pt: { x: number; y: number },
      propPolyPx: { x: number; y: number }[] | null
    ): { x: number; y: number } => {
      if (!propPolyPx || !propPolyObj || propPolyPx.length < 3) return pt;
      
      const latLng = fixedToLatLng(pt.x, pt.y);
      if (isPointInPolygon(latLng.lat, latLng.lng, propPolyObj.points)) return pt;

      const cx = propPolyPx.reduce((sum, p) => sum + p.x, 0) / propPolyPx.length;
      const cy = propPolyPx.reduce((sum, p) => sum + p.y, 0) / propPolyPx.length;

      let low = 0;
      let high = 1;
      let best = { x: cx, y: cy };

      for (let step = 0; step < 12; step++) {
        const mid = (low + high) / 2;
        const testPt = {
          x: pt.x + (cx - pt.x) * mid,
          y: pt.y + (cy - pt.y) * mid,
        };

        const testLatLng = fixedToLatLng(testPt.x, testPt.y);
        if (isPointInPolygon(testLatLng.lat, testLatLng.lng, propPolyObj.points)) {
          best = testPt;
          high = mid;
        } else {
          low = mid;
        }
      }

      return best;
    };

    const myPixel = latLngToFixed(location.latitude, location.longitude);
    const pinPixel = latLngToFixed(selectedPin.lat, selectedPin.lng);

    const dx = pinPixel.x - myPixel.x;
    const dy = pinPixel.y - myPixel.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 10) {
      const pStart = localClampToPropertyBoundary(myPixel, propPolyPx);
      const pEnd = localClampToPropertyBoundary(pinPixel, propPolyPx);
      const startLatLng = fixedToLatLng(pStart.x, pStart.y);
      const endLatLng = fixedToLatLng(pEnd.x, pEnd.y);

      return {
        waypoints: [
          { ...latLngToPixel(startLatLng.lat, startLatLng.lng), label: 'Start (My Location)' },
          { ...latLngToPixel(endLatLng.lat, endLatLng.lng), label: 'Stand' },
        ],
        densePoints: [
          latLngToPixel(startLatLng.lat, startLatLng.lng),
          latLngToPixel(endLatLng.lat, endLatLng.lng),
        ],
        start: latLngToPixel(startLatLng.lat, startLatLng.lng),
        stand: latLngToPixel(endLatLng.lat, endLatLng.lng),
        isDirect: true,
        avoidedFieldsCount: 0,
      };
    }

    // Direction wind is blowing FROM in radians (0° = North = -Y)
    const windRad = ((windDeg - 90) * Math.PI) / 180;
    const upwindX = Math.cos(windRad);
    const upwindY = Math.sin(windRad);

    // Downwind direction where scent blows
    const downwindX = -upwindX;
    const downwindY = -upwindY;

    // Crosswind directions
    const cross1X = -upwindY;
    const cross1Y = upwindX;

    // Check which side of approach vector is more upwind
    const startDotUp = (dx * upwindX + dy * upwindY) / (dist || 1);
    const sideSign = (dx * cross1X + dy * cross1Y) >= 0 ? 1 : -1;
    const crossX = cross1X * sideSign;
    const crossY = cross1Y * sideSign;

    // Dynamic unsafe factor: 1.0 when starting fully upwind, 0.0 when starting fully downwind
    const unsafeFactor = Math.max(0, Math.min(1, (1 - startDotUp) / 2));

    // Place cp2 downwind of the stand to ensure final approach is directly into the wind
    const approachDist = Math.max(60, Math.min(160, dist * 0.45)) * unsafeFactor;
    const cp2 = {
      x: pinPixel.x + downwindX * approachDist,
      y: pinPixel.y + downwindY * approachDist,
    };

    // Place cp1 as a crosswind loop flank to guide around the scent cone
    const cp1Dist = Math.max(80, Math.min(220, dist * 0.55)) * unsafeFactor;
    const cp1 = {
      x: myPixel.x + dx * 0.35 + crossX * cp1Dist + downwindX * cp1Dist * 0.3,
      y: myPixel.y + dy * 0.35 + crossY * cp1Dist + downwindY * cp1Dist * 0.3,
    };

    const cp0 = myPixel;
    const cp3 = pinPixel;

    // Generate 32 smooth interpolated dense points along Bezier curve
    const steps = 32;
    const rawPoints: { x: number; y: number }[] = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      const tt = t * t;
      const uu = u * u;
      const uuu = uu * u;
      const ttt = tt * t;

      let x = uuu * cp0.x + 3 * uu * t * cp1.x + 3 * u * tt * cp2.x + ttt * cp3.x;
      let y = uuu * cp0.y + 3 * uu * t * cp1.y + 3 * u * tt * cp2.y + ttt * cp3.y;

      rawPoints.push({ x, y });
    }

    let avoidedFieldsCount = 0;
    const fieldPolygons = polygons.filter((p) => p.type !== 'property_boundary' && p.points.length >= 3);

    const pushPointOutOfFieldsFully = (pt: { x: number; y: number }, margin: number = 15): { x: number; y: number } => {
      let currentPt = { ...pt };
      for (const poly of fieldPolygons) {
        const polyPx = poly.points.map((p) => latLngToFixed(p.lat, p.lng));
        const latLng = fixedToLatLng(currentPt.x, currentPt.y);
        const inside = isPointInPolygon(latLng.lat, latLng.lng, poly.points);

        const closestBnd = closestPointOnPolygonBoundaryPx(currentPt, polyPx);
        const distBnd = Math.hypot(currentPt.x - closestBnd.x, currentPt.y - closestBnd.y);

        if (inside || distBnd < margin) {
          let dx = 0;
          let dy = 0;
          if (inside) {
            dx = closestBnd.x - currentPt.x;
            dy = closestBnd.y - currentPt.y;
          } else {
            dx = currentPt.x - closestBnd.x;
            dy = currentPt.y - closestBnd.y;
          }

          let len = Math.hypot(dx, dy);
          if (len < 0.1) {
            const fcx = polyPx.reduce((s, p) => s + p.x, 0) / polyPx.length;
            const fcy = polyPx.reduce((s, p) => s + p.y, 0) / polyPx.length;
            dx = closestBnd.x - fcx;
            dy = closestBnd.y - fcy;
            len = Math.hypot(dx, dy) || 1;
          }

          dx /= len;
          dy /= len;

          currentPt = {
            x: closestBnd.x + dx * margin,
            y: closestBnd.y + dy * margin,
          };
        }
      }
      return currentPt;
    };

    const localSegmentsIntersect = (
      p1: { x: number; y: number },
      p2: { x: number; y: number },
      p3: { x: number; y: number },
      p4: { x: number; y: number }
    ): boolean => {
      const ccw = (
        a: { x: number; y: number },
        b: { x: number; y: number },
        c: { x: number; y: number }
      ) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);

      return (
        ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4)
      );
    };

    const enforceNoFields = (points: { x: number; y: number }[]): { x: number; y: number }[] => {
      if (routeCanGoThroughFields || fieldPolygons.length === 0) return points;

      let pts = [...points];
      for (let iter = 0; iter < 4; iter++) {
        const intermediatePts: { x: number; y: number }[] = [];
        for (let i = 0; i < pts.length; i++) {
          let pt = { ...pts[i] };
          
          // Use a robust 6px margin to push the path points cleanly outside of any fields
          pt = pushPointOutOfFieldsFully(pt, 6);
          pt = localClampToPropertyBoundary(pt, propPolyPx);
          // Re-verify after property clamping to ensure it didn't push the point back inside/near a field
          pt = pushPointOutOfFieldsFully(pt, 5);
          intermediatePts.push(pt);
        }

        const checkedPts: { x: number; y: number }[] = [intermediatePts[0]];
        for (let i = 0; i < intermediatePts.length - 1; i++) {
          const p1 = intermediatePts[i];
          const p2 = intermediatePts[i + 1];
          let intersectedPoly: SavedPolygon | null = null;
          let intersectedPolyPx: { x: number; y: number }[] = [];

          for (const poly of fieldPolygons) {
            const polyPx = poly.points.map((p) => latLngToFixed(p.lat, p.lng));
            let intersects = false;
            for (let e = 0; e < polyPx.length; e++) {
              const c1 = polyPx[e];
              const c2 = polyPx[(e + 1) % polyPx.length];
              if (localSegmentsIntersect(p1, p2, c1, c2)) {
                intersects = true;
                break;
              }
            }
            if (intersects) {
              intersectedPoly = poly;
              intersectedPolyPx = polyPx;
              break;
            }
          }

          if (intersectedPoly && intersectedPolyPx) {
            avoidedFieldsCount++;
            const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
            
            // Push midpoint cleanly out of the field (by 8px)
            let safeDetour = pushPointOutOfFieldsFully(mid, 8);
            safeDetour = localClampToPropertyBoundary(safeDetour, propPolyPx);
            safeDetour = pushPointOutOfFieldsFully(safeDetour, 6);
            
            checkedPts.push(safeDetour);
          }
          checkedPts.push(p2);
        }
        pts = checkedPts;
      }

      return pts;
    };

    // If routeCanGoThroughFields is false, check if the standard path intersects any field polygon.
    // If it does, we find the main intersecting field and detour around it.
    let mainIntersectObj: { poly: SavedPolygon; polyPx: { x: number; y: number }[] } | null = null;
    let maxIntersectCount = 0;

    if (!routeCanGoThroughFields && fieldPolygons.length > 0) {
      for (const poly of fieldPolygons) {
        const polyPx = poly.points.map((p) => latLngToFixed(p.lat, p.lng));
        let intersectCount = 0;
        for (const pt of rawPoints) {
          const latLng = fixedToLatLng(pt.x, pt.y);
          if (isPointInPolygon(latLng.lat, latLng.lng, poly.points)) {
            intersectCount++;
          } else {
            const closestBoundaryPt = closestPointOnPolygonBoundaryPx(pt, polyPx);
            const dist = Math.hypot(pt.x - closestBoundaryPt.x, pt.y - closestBoundaryPt.y);
            if (dist < 2.5) {
              intersectCount++;
            }
          }
        }
        if (intersectCount > maxIntersectCount) {
          maxIntersectCount = intersectCount;
          mainIntersectObj = { poly, polyPx };
        }
      }
    }

    if (mainIntersectObj) {
      const mainPolyPx = mainIntersectObj.polyPx;
      const ux = -dy / (dist || 1);
      const uy = dx / (dist || 1);

      // Find the extreme left and right vertices relative to the start-to-end line
      let maxLeftVertex = mainPolyPx[0];
      let maxLeftProj = -Infinity;
      let maxRightVertex = mainPolyPx[0];
      let maxRightProj = Infinity;

      for (const V of mainPolyPx) {
        const vx = V.x - myPixel.x;
        const vy = V.y - myPixel.y;
        const proj = vx * ux + vy * uy;
        if (proj > maxLeftProj) {
          maxLeftProj = proj;
          maxLeftVertex = V;
        }
        if (proj < maxRightProj) {
          maxRightProj = proj;
          maxRightVertex = V;
        }
      }

      // Calculate centroid of the main polygon to push outwards from center
      const fcx = mainPolyPx.reduce((s, p) => s + p.x, 0) / mainPolyPx.length;
      const fcy = mainPolyPx.reduce((s, p) => s + p.y, 0) / mainPolyPx.length;

      // Generous buffer (24px at zoom 16 is ~36-45 meters) to completely avoid field borders
      const buffer = 24;

      // Left detour point
      let lox = maxLeftVertex.x - fcx;
      let loy = maxLeftVertex.y - fcy;
      const lolen = Math.hypot(lox, loy) || 1;
      const leftDetourPt = {
        x: maxLeftVertex.x + (lox / lolen) * buffer,
        y: maxLeftVertex.y + (loy / lolen) * buffer,
      };

      // Right detour point
      let rox = maxRightVertex.x - fcx;
      let roy = maxRightVertex.y - fcy;
      const rolen = Math.hypot(rox, roy) || 1;
      const rightDetourPt = {
        x: maxRightVertex.x + (rox / rolen) * buffer,
        y: maxRightVertex.y + (roy / rolen) * buffer,
      };

      // Choose detour point aligned with the crosswind/scent-safe flank
      const leftDotCross = (leftDetourPt.x - myPixel.x) * crossX + (leftDetourPt.y - myPixel.y) * crossY;
      const rightDotCross = (rightDetourPt.x - myPixel.x) * crossX + (rightDetourPt.y - myPixel.y) * crossY;

      let chosenDetourPt = leftDotCross > rightDotCross ? leftDetourPt : rightDetourPt;

      // Guarantee detour point is safely outside of fields (margin 20px)
      let safeDetourPt = pushPointOutOfFieldsFully(chosenDetourPt, 20);
      // Clamp to property boundary to make sure detour doesn't go off-property
      safeDetourPt = localClampToPropertyBoundary(safeDetourPt, propPolyPx);
      // Verify after clamping to ensure it is still at least 15px outside any field
      safeDetourPt = pushPointOutOfFieldsFully(safeDetourPt, 15);

      // If clamping pulled it inside the field or too close, try the other side
      const closestToSafe = closestPointOnPolygonBoundaryPx(safeDetourPt, mainPolyPx);
      const safeDetourLatLng = fixedToLatLng(safeDetourPt.x, safeDetourPt.y);
      const isDetourInside = isPointInPolygon(safeDetourLatLng.lat, safeDetourLatLng.lng, mainIntersectObj.poly.points);
      const safeDist = Math.hypot(safeDetourPt.x - closestToSafe.x, safeDetourPt.y - closestToSafe.y);
      if (isDetourInside || safeDist < 10) {
        // Fallback to the other detour point
        const otherDetourPt = leftDotCross > rightDotCross ? rightDetourPt : leftDetourPt;
        let safeOtherDetourPt = pushPointOutOfFieldsFully(otherDetourPt, 20);
        safeOtherDetourPt = localClampToPropertyBoundary(safeOtherDetourPt, propPolyPx);
        safeOtherDetourPt = pushPointOutOfFieldsFully(safeOtherDetourPt, 15);

        const closestToOther = closestPointOnPolygonBoundaryPx(safeOtherDetourPt, mainPolyPx);
        const otherDist = Math.hypot(safeOtherDetourPt.x - closestToOther.x, safeOtherDetourPt.y - closestToOther.y);
        const otherDetourLatLng = fixedToLatLng(safeOtherDetourPt.x, safeOtherDetourPt.y);
        const isOtherInside = isPointInPolygon(otherDetourLatLng.lat, otherDetourLatLng.lng, mainIntersectObj.poly.points);
        if (!isOtherInside && otherDist > safeDist) {
          safeDetourPt = safeOtherDetourPt;
        }
      }

      // Segment 1: myPixel -> safeDetourPt
      const seg1Dx = safeDetourPt.x - myPixel.x;
      const seg1Dy = safeDetourPt.y - myPixel.y;
      const seg1Dist = Math.hypot(seg1Dx, seg1Dy) || 1;

      // Gentle bow in scent-safe direction
      const bowX = -seg1Dy / seg1Dist;
      const bowY = seg1Dx / seg1Dist;
      const bowSign = (bowX * crossX + bowY * crossY) >= 0 ? 1 : -1;
      const bowAmt = seg1Dist * 0.15;

      const cp1_1 = {
        x: myPixel.x + seg1Dx * 0.33 + bowX * bowSign * bowAmt,
        y: myPixel.y + seg1Dy * 0.33 + bowY * bowSign * bowAmt,
      };
      const cp2_1 = {
        x: myPixel.x + seg1Dx * 0.67 + bowX * bowSign * bowAmt,
        y: myPixel.y + seg1Dy * 0.67 + bowY * bowSign * bowAmt,
      };

      // Segment 2: safeDetourPt -> pinPixel
      const cp2_2 = {
        x: pinPixel.x + downwindX * approachDist,
        y: pinPixel.y + downwindY * approachDist,
      };
      const cp1_2 = {
        x: safeDetourPt.x + (pinPixel.x - safeDetourPt.x) * 0.33,
        y: safeDetourPt.y + (pinPixel.y - safeDetourPt.y) * 0.33,
      };

      // Generate smooth dense points
      const segmentSteps = 16;
      const detourPoints: { x: number; y: number }[] = [];

      // Segment 1
      for (let i = 0; i <= segmentSteps; i++) {
        const t = i / segmentSteps;
        const u = 1 - t;
        const tt = t * t;
        const uu = u * u;
        const uuu = uu * u;
        const ttt = tt * t;

        const x = uuu * myPixel.x + 3 * uu * t * cp1_1.x + 3 * u * tt * cp2_1.x + ttt * safeDetourPt.x;
        const y = uuu * myPixel.y + 3 * uu * t * cp1_1.y + 3 * u * tt * cp2_1.y + ttt * safeDetourPt.y;
        detourPoints.push({ x, y });
      }

      // Segment 2
      for (let i = 1; i <= segmentSteps; i++) {
        const t = i / segmentSteps;
        const u = 1 - t;
        const tt = t * t;
        const uu = u * u;
        const uuu = uu * u;
        const ttt = tt * t;

        const x = uuu * safeDetourPt.x + 3 * uu * t * cp1_2.x + 3 * u * tt * cp2_2.x + ttt * pinPixel.x;
        const y = uuu * safeDetourPt.y + 3 * uu * t * cp1_2.y + 3 * u * tt * cp2_2.y + ttt * pinPixel.y;
        detourPoints.push({ x, y });
      }

      // Apply enforceNoFields as safety check
      const processedPoints = enforceNoFields(detourPoints);

      // Map back to screen pixels
      const screenPoints = processedPoints.map((pt) => {
        const latLng = fixedToLatLng(pt.x, pt.y);
        return latLngToPixel(latLng.lat, latLng.lng);
      });

      const startPt = screenPoints[0];
      const standPt = screenPoints[screenPoints.length - 1];
      const safeDetourScreen = latLngToPixel(
        fixedToLatLng(safeDetourPt.x, safeDetourPt.y).lat,
        fixedToLatLng(safeDetourPt.x, safeDetourPt.y).lng
      );

      const waypoints = [
        { x: startPt.x, y: startPt.y, label: 'Start (My Location)' },
        { x: safeDetourScreen.x, y: safeDetourScreen.y, label: 'Field Bypass (Scent-Free)' },
        { x: standPt.x, y: standPt.y, label: 'Stand' },
      ];

      return {
        waypoints,
        densePoints: screenPoints,
        start: startPt,
        stand: standPt,
        isDirect: false,
        avoidedFieldsCount: avoidedFieldsCount || 1,
      };
    }

    // Default path without field detour
    const processedPoints = enforceNoFields(rawPoints);

    const screenPoints = processedPoints.map((pt) => {
      const latLng = fixedToLatLng(pt.x, pt.y);
      return latLngToPixel(latLng.lat, latLng.lng);
    });

    const startPt = screenPoints[0];
    const midIdx = Math.floor(steps / 2);
    const midPt = screenPoints[midIdx];
    const standPt = screenPoints[screenPoints.length - 1];

    const waypoints = [
      { x: startPt.x, y: startPt.y, label: 'Start (My Location)' },
      { x: midPt.x, y: midPt.y, label: 'Scent-Free Flank Approach' },
      { x: standPt.x, y: standPt.y, label: 'Stand' },
    ];

    return {
      waypoints,
      densePoints: screenPoints,
      start: startPt,
      stand: standPt,
      isDirect: false,
      avoidedFieldsCount: avoidedFieldsCount,
    };
  };

  return (
    <>
      {/* Map ALWAYS Full-Screen Container */}
      <div
        className={`relative w-full h-full overflow-hidden transition-all ${
          mapStyle === 'satellite' ? 'bg-slate-950' : mapStyle === 'topo' ? 'bg-slate-900' : 'bg-slate-100'
        }`}
      >
        {/* Slippy Tile Canvas */}
        <div
          ref={mapContainerRef}
          className="absolute inset-0 cursor-grab active:cursor-grabbing select-none touch-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {allTileElements}

          {/* SVG Overlay: Polygons, Scent Cones & Routes */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
            {/* Polygon Zones */}
            {visiblePolygons.map((poly) => {
              if (poly.points.length < 3) return null;
              const polyMeta = POLYGON_METADATA[poly.type] || POLYGON_METADATA.custom;
              const isSelected = selectedPolygonId === poly.id;

              const svgPoints = poly.points
                .map((pt) => {
                  const px = latLngToPixel(pt.lat, pt.lng);
                  return `${px.x},${px.y}`;
                })
                .join(' ');

              return (
                <g key={poly.id} className="pointer-events-none">
                  <polygon
                    points={svgPoints}
                    fill={poly.type === 'property_boundary' ? 'none' : polyMeta.fill}
                    fillOpacity={poly.type === 'property_boundary' ? 0 : isSelected ? Math.min(0.7, polyMeta.fillOpacity + 0.25) : polyMeta.fillOpacity}
                    stroke={poly.type === 'property_boundary' ? '#f43f5e' : polyMeta.stroke}
                    strokeWidth={isSelected ? 4 : poly.type === 'property_boundary' ? 3.5 : 2.5}
                    strokeDasharray={poly.type === 'property_boundary' ? '6 4' : undefined}
                    className="transition-all duration-200 pointer-events-none"
                  />
                  {/* Label at Centroid */}
                  {(() => {
                    const centroid = getPolygonCentroid(poly.points);
                    const centroidPx = latLngToPixel(centroid.lat, centroid.lng);
                    return (
                      <g transform={`translate(${centroidPx.x}, ${centroidPx.y})`} className="pointer-events-none">
                        <rect
                          x={-40}
                          y={-12}
                          width={80}
                          height={22}
                          rx={6}
                          fill={isDark ? '#020617' : '#ffffff'}
                          fillOpacity={0.9}
                          stroke={polyMeta.stroke}
                          strokeWidth={isSelected ? 2 : 1}
                        />
                        <text
                          x={0}
                          y={3}
                          textAnchor="middle"
                          fill={isDark ? '#f8fafc' : '#0f172a'}
                          fontSize={10}
                          fontWeight="bold"
                        >
                          {polyMeta.emoji} {poly.name.length > 10 ? poly.name.substring(0, 10) + '…' : poly.name}
                        </text>
                      </g>
                    );
                  })()}
                </g>
              );
            })}

            {/* Polygon Drawing Active Draft */}
            {isDrawingPolygon && currentPolygonPoints.length > 0 && (
              <g>
                {currentPolygonPoints.length >= 2 && (
                  <polygon
                    points={currentPolygonPoints
                      .map((pt) => {
                        const px = latLngToPixel(pt.lat, pt.lng);
                        return `${px.x},${px.y}`;
                      })
                      .join(' ')}
                    fill={polygonEditType === 'property_boundary' ? '#f43f5e' : '#22c55e'}
                    fillOpacity={0.25}
                    stroke={polygonEditType === 'property_boundary' ? '#f43f5e' : '#22c55e'}
                    strokeWidth={2.5}
                    strokeDasharray="4 4"
                  />
                )}
                {currentPolygonPoints.map((pt, idx) => {
                  const px = latLngToPixel(pt.lat, pt.lng);
                  return (
                    <circle
                      key={idx}
                      cx={px.x}
                      cy={px.y}
                      r={5}
                      fill={polygonEditType === 'property_boundary' ? '#f43f5e' : '#22c55e'}
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                  );
                })}
              </g>
            )}

            {/* Scent Plume Cone Path */}
            {scentConePath && (
              <path
                d={scentConePath}
                fill="url(#scentPlumeGradient)"
                fillOpacity={0.45}
                stroke="#f97316"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            )}

            {/* Preferred Wind Vector Paths for stand pins */}
            {preferredWindPaths.map((p) => (
              <path
                key={`pref-wind-${p.id}`}
                d={p.path}
                fill="#10b981"
                fillOpacity={p.isSelected ? 0.35 : 0.2}
                stroke="#34d399"
                strokeWidth={p.isSelected ? 2 : 1}
                strokeDasharray="4 3"
              />
            ))}


            <defs>
              <radialGradient id="scentPlumeGradient" cx="0%" cy="0%" r="100%">
                <stop offset="0%" stopColor="#ea580c" stopOpacity="0.8" />
                <stop offset="60%" stopColor="#f97316" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#fef08a" stopOpacity="0.05" />
              </radialGradient>
            </defs>
          </svg>

          {/* Marker Pins Overlay */}
          <div className="absolute inset-0 pointer-events-none z-20">
            {/* User's Current Location Marker */}
            {(() => {
              const myPx = latLngToPixel(location.latitude, location.longitude);
              if (myPx.x < -40 || myPx.x > dimensions.width + 40 || myPx.y < -40 || myPx.y > dimensions.height + 40) {
                return null;
              }
              return (
                <div
                  key="user-current-location"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (hasMovedRef.current || isDrawingPolygon || (Date.now() - lastPinchTimeRef.current < 400)) return;
                    setCenterLat(location.latitude);
                    setCenterLng(location.longitude);
                  }}
                  className={`absolute transform -translate-x-1/2 -translate-y-1/2 group transition-transform duration-150 ${
                    isDrawingPolygon ? 'pointer-events-none' : 'pointer-events-auto cursor-pointer'
                  }`}
                  style={{ left: `${myPx.x}px`, top: `${myPx.y}px` }}
                  title="My Current Location"
                >
                  <div className="relative flex items-center justify-center">
                    <div className="absolute -inset-2 bg-sky-500/30 rounded-full animate-ping" />
                    <div className="w-8 h-8 rounded-full bg-sky-600 text-white flex items-center justify-center shadow-2xl ring-2 ring-white border border-sky-400 font-extrabold text-xs z-10 hover:scale-110 transition-transform">
                      <Navigation className="w-4 h-4 fill-white text-sky-200" />
                    </div>
                  </div>
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 whitespace-nowrap bg-sky-950/95 text-sky-200 text-[10px] font-black px-2 py-0.5 rounded-md border border-sky-600 shadow-md pointer-events-none">
                    📍 My Location ({location.name})
                  </div>
                </div>
              );
            })()}

            {visiblePins.map((pin) => {
              const px = latLngToPixel(pin.lat, pin.lng);
              if (px.x < -40 || px.x > dimensions.width + 40 || px.y < -40 || px.y > dimensions.height + 40) {
                return null;
              }

              const isSelected = selectedPinId === pin.id;
              const pinMeta = PIN_METADATA[pin.type] || PIN_METADATA.stand;

              return (
                <div
                  key={pin.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (hasMovedRef.current || isDrawingPolygon || (Date.now() - lastPinchTimeRef.current < 400)) return;
                    setSelectedPinId(pin.id);
                    setSelectedPolygonId(null);
                  }}
                  className={`absolute transform -translate-x-1/2 -translate-y-1/2 group transition-transform duration-150 ${
                    isDrawingPolygon ? 'pointer-events-none' : 'pointer-events-auto cursor-pointer'
                  }`}
                  style={{ left: `${px.x}px`, top: `${px.y}px` }}
                >
                  <div
                    className={`relative flex items-center justify-center rounded-full shadow-xl transition-all ${
                      isSelected
                        ? 'w-10 h-10 ring-4 ring-emerald-400 scale-125 z-30'
                        : 'w-8 h-8 hover:scale-110 z-20'
                    } ${pinMeta.color}`}
                  >
                    <span className="text-sm">{pinMeta.emoji}</span>
                  </div>

                  {/* Pin Name Label */}
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 whitespace-nowrap bg-slate-950/90 text-white text-[10px] font-black px-2 py-0.5 rounded-md border border-slate-700 shadow-md pointer-events-none">
                    {pin.name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>



        {/* TOP LEFT FLOATING BAR: "+ Add" Button & Location Search */}
        <div className="absolute top-3 left-3 z-50 flex items-center gap-2 pointer-events-auto ui-control max-w-[calc(100%-140px)] flex-wrap sm:flex-nowrap" ref={searchContainerRef}>
          {/* FLOATING "+ ADD" BUTTON WITH DROPDOWN MENU - PROMINENT & FIRST */}
          <div className="relative">
            <button
              onClick={() => {
                setShowAddDropdown((prev) => !prev);
                setShowLayersDropdown(false);
              }}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider shadow-2xl flex items-center gap-1.5 transition-all cursor-pointer border border-emerald-400/50 hover:scale-105 active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Add</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAddDropdown ? 'rotate-180' : ''}`} />
            </button>

            {/* Add Dropdown Menu */}
            {showAddDropdown && (
              <div
                className={`absolute top-full left-0 mt-2 w-56 rounded-2xl border shadow-2xl p-2 z-[60] animate-fadeIn backdrop-blur-md ${
                  isDark ? 'bg-slate-900/95 border-slate-800 text-white' : 'bg-white/95 border-slate-200 text-slate-900'
                }`}
              >
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-2 py-1 border-b border-slate-800/20 mb-1">
                  Map Plotter Tools
                </div>

                <button
                  onClick={() => {
                    setIsPlacingMarkerMode(true);
                    setShowAddDropdown(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-emerald-500/15 hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  <span className="text-base">🎯</span>
                  <div>
                    <div>Add Marker</div>
                    <div className="text-[9px] text-slate-400 font-normal">Drop Stand / Trail Cam Pin</div>
                  </div>
                </button>

                <button
                  onClick={handleStartDrawPolygon}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-amber-500/15 hover:text-amber-400 transition-colors cursor-pointer"
                >
                  <span className="text-base">🌾</span>
                  <div>
                    <div>Add Polygon Zone</div>
                    <div className="text-[9px] text-slate-400 font-normal">Plot Food Plot / Bedding Zone</div>
                  </div>
                </button>

                <button
                  onClick={handleStartDrawPropertyBoundary}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-rose-500/15 hover:text-rose-400 transition-colors cursor-pointer"
                >
                  <span className="text-base">🏡</span>
                  <div>
                    <div>Add Property Boundary</div>
                    <div className="text-[9px] text-slate-400 font-normal">Draw Land Perimeter Line</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Location Search Input */}
          <div
            className={`flex items-center border rounded-xl px-3 py-1.5 transition-all shadow-xl backdrop-blur-md w-48 sm:w-60 ${
              isDark ? 'bg-slate-950/85 border-slate-800 focus-within:border-emerald-500' : 'bg-white/95 border-slate-200 focus-within:border-emerald-600'
            }`}
          >
            <Search className={`w-3.5 h-3.5 mr-2 flex-shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setShowDropdown(true)}
              placeholder="Jump to location..."
              className={`w-full bg-transparent text-xs focus:outline-none ${
                isDark ? 'text-white placeholder-slate-400' : 'text-slate-900 placeholder-slate-500'
              }`}
            />
            {isSearching && (
              <div className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin ml-2 flex-shrink-0" />
            )}
          </div>

          {/* Location Search Results Popup */}
          {showDropdown && searchResults.length > 0 && (
            <div
              className={`absolute top-full left-12 mt-1.5 w-60 border rounded-xl shadow-2xl overflow-hidden z-40 max-h-60 overflow-y-auto divide-y ${
                isDark ? 'bg-slate-900 border-slate-700 divide-slate-800 text-slate-200' : 'bg-white border-slate-200 divide-slate-100 text-slate-800'
              }`}
            >
              {searchResults.map((loc, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setCenterLat(loc.latitude);
                    setCenterLng(loc.longitude);
                    setShowDropdown(false);
                    setSearchQuery('');
                    if (onSelectLocation) onSelectLocation(loc);
                  }}
                  className={`w-full text-left px-3 py-2 transition-colors flex items-center justify-between text-xs cursor-pointer ${
                    isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="font-semibold">
                    {loc.name}, {loc.admin1}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Best Stand for Wind Rectangular Pill Badge */}
          {showBestWindBadge && (() => {
            const best = getBestStandForWind(windDeg);
            const matchingPin = best ? pins.find(p => p.name === best.name) : null;
            const pinMeta = matchingPin ? PIN_METADATA[matchingPin.type] || PIN_METADATA.stand : null;
            const hourLabel = selectedHour === 0 ? '12 AM' : selectedHour === 12 ? '12 PM' : selectedHour > 12 ? `${selectedHour - 12} PM` : `${selectedHour} AM`;

            return (
              <div
                className={`px-2.5 py-1.5 rounded-xl border shadow-lg backdrop-blur-md flex items-center gap-2 text-xs font-bold transition-all ${
                  best
                    ? isDark
                      ? 'bg-emerald-950/95 border-emerald-500/80 text-emerald-200 shadow-emerald-950/40'
                      : 'bg-emerald-50 border-emerald-500/80 text-emerald-900 shadow-emerald-500/20'
                    : isDark
                    ? 'bg-slate-950/90 border-slate-800 text-slate-200 shadow-slate-950/40'
                    : 'bg-white/95 border-slate-200 text-slate-800 shadow-slate-200/50'
                }`}
              >
                <div
                  onClick={() => {
                    if (matchingPin) {
                      setCenterLat(matchingPin.lat);
                      setCenterLng(matchingPin.lng);
                      setSelectedPinId(matchingPin.id);
                      setSelectedPolygonId(null);
                    }
                  }}
                  className={`flex items-center gap-1.5 truncate ${matchingPin ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                  title={matchingPin ? `Click to center on ${matchingPin.name}` : 'Set preferred wind on stand pins to see recommendations'}
                >
                  <span className="text-sm flex-shrink-0">{pinMeta?.emoji || '🎯'}</span>
                  <span className={`text-[10px] font-extrabold uppercase tracking-wider ${best ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                    Best:
                  </span>
                  <span className="font-black truncate max-w-[100px] sm:max-w-[140px] text-slate-900 dark:text-white">
                    {best ? best.name : (pins.length === 0 ? 'No Stands' : 'No Pref Wind')}
                  </span>
                  {best && (
                    <span className={`text-[10px] font-normal truncate ${isDark ? 'text-emerald-300/80' : 'text-emerald-700/80'}`}>
                      ({windDirText}@{hourLabel})
                    </span>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowBestWindBadge(false);
                  }}
                  className={`p-0.5 rounded-md transition-colors cursor-pointer flex-shrink-0 ${
                    best
                      ? isDark ? 'text-emerald-300 hover:text-white hover:bg-emerald-900/50' : 'text-emerald-700 hover:text-emerald-950 hover:bg-emerald-200/50'
                      : isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                  title="Dismiss badge"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })()}
        </div>

        {/* TOP RIGHT FLOATING BAR: "Layers" Button & Dropdown Menu */}
        <div className="absolute top-3 right-3 z-[60] pointer-events-auto ui-control">
          <button
            onClick={() => {
              setShowLayersDropdown((prev) => !prev);
              setShowAddDropdown(false);
            }}
            className={`px-3 py-1.5 rounded-xl border shadow-xl flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider backdrop-blur-md transition-all cursor-pointer ${
              showLayersDropdown
                ? 'bg-emerald-600 text-white border-emerald-400'
                : isDark
                ? 'bg-slate-950/85 border-slate-800 text-slate-200 hover:text-white hover:bg-slate-800'
                : 'bg-white/95 border-slate-200 text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Layers className="w-4 h-4 text-emerald-400" />
            <span>Layers</span>
            <span className="ml-1 px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded-md text-[10px] font-black">
              {pins.length + polygons.length}
            </span>
          </button>

          {/* FLOATING LAYERS & MARKERS DROPDOWN POPOVER */}
          {showLayersDropdown && (
            <div
              className={`absolute top-full right-0 mt-2 w-80 sm:w-88 rounded-2xl border shadow-2xl p-4 z-50 animate-fadeIn backdrop-blur-md max-h-[80vh] overflow-y-auto ${
                isDark ? 'bg-slate-900/95 border-slate-800 text-white' : 'bg-white/95 border-slate-200 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between border-b pb-2 mb-3 border-slate-800/40">
                <h3 className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Layers className="w-4 h-4" />
                  Map Layers & Saved Items
                </h3>
                <button
                  onClick={() => setShowLayersDropdown(false)}
                  className="text-slate-400 hover:text-rose-400 font-extrabold text-xs p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Map Style Switcher */}
              <div className="mb-3 space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Map Satellite Style</span>
                <div className={`grid grid-cols-3 gap-1 p-1 rounded-xl border ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                }`}>
                  {(['satellite', 'topo', 'street'] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => setMapStyle(style)}
                      className={`py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                        mapStyle === style
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : isDark
                          ? 'text-slate-400 hover:text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {style === 'satellite' ? 'Sat' : style === 'topo' ? 'Topo' : 'Road'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Layer Display Feature Toggles */}
              <div className="mb-3 space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Layer Overlays</span>
                
                {/* Preferred Wind Arc Toggle */}
                <button
                  type="button"
                  onClick={() => setShowPreferredWind((prev) => !prev)}
                  className={`w-full flex items-center justify-between p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    showPreferredWind
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400'
                      : isDark ? 'bg-slate-950/60 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-emerald-400" />
                    <span>Preferred Wind Sector Arc</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                    showPreferredWind ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {showPreferredWind ? 'ON' : 'OFF'}
                  </span>
                </button>

                {/* Live Scent Plume Toggle */}
                <button
                  type="button"
                  onClick={() => setShowScentCone((prev) => !prev)}
                  className={`w-full flex items-center justify-between p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    showScentCone
                      ? 'bg-orange-500/15 border-orange-500/50 text-orange-400'
                      : isDark ? 'bg-slate-950/60 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Wind className="w-4 h-4 text-orange-400" />
                    <span>Live Weather Scent Plume</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                    showScentCone ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {showScentCone ? 'ON' : 'OFF'}
                  </span>
                </button>

                {/* Markers Toggle */}
                <button
                  type="button"
                  onClick={() => setShowPins((prev) => !prev)}
                  className={`w-full flex items-center justify-between p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    showPins
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400'
                      : isDark ? 'bg-slate-950/60 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-400" />
                    <span>Show Stand Markers</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                    showPins ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {showPins ? 'ON' : 'OFF'}
                  </span>
                </button>

                {/* Property Boundaries Toggle */}
                <button
                  type="button"
                  onClick={() => setShowPropertyBoundaries((prev) => !prev)}
                  className={`w-full flex items-center justify-between p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    showPropertyBoundaries
                      ? 'bg-rose-500/15 border-rose-500/50 text-rose-400'
                      : isDark ? 'bg-slate-950/60 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-nowrap">
                    <span className="text-sm">🏡</span>
                    <span>Show Property Boundaries</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                    showPropertyBoundaries ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {showPropertyBoundaries ? 'ON' : 'OFF'}
                  </span>
                </button>

                {/* Fields/Zones Toggle */}
                <button
                  type="button"
                  onClick={() => setShowZones((prev) => !prev)}
                  className={`w-full flex items-center justify-between p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    showZones
                      ? 'bg-amber-500/15 border-amber-500/50 text-amber-400'
                      : isDark ? 'bg-slate-950/60 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Shapes className="w-4 h-4 text-amber-400" />
                    <span>Show Field Zones</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                    showZones ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {showZones ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>

              {/* Segmented Items Switcher Tabs */}
              <div className="flex border-b border-slate-800/40 mb-3">
                <button
                  onClick={() => setActiveLayersTab('pins')}
                  className={`flex-1 py-1.5 text-xs font-extrabold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    activeLayersTab === 'pins'
                      ? 'border-emerald-500 text-emerald-400'
                      : `border-transparent text-slate-400 ${isDark ? 'hover:text-slate-200' : 'hover:text-slate-700'}`
                  }`}
                >
                  <span>Pins ({pins.length})</span>
                </button>
                <button
                  onClick={() => setActiveLayersTab('polygons')}
                  className={`flex-1 py-1.5 text-xs font-extrabold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    activeLayersTab === 'polygons'
                      ? 'border-amber-500 text-amber-400'
                      : `border-transparent text-slate-400 ${isDark ? 'hover:text-slate-200' : 'hover:text-slate-700'}`
                  }`}
                >
                  <span>Zones ({polygons.length})</span>
                </button>
              </div>

              {/* Tab 1: Pins List */}
              {activeLayersTab === 'pins' && (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {pins.length === 0 ? (
                    <p className="text-xs text-slate-500 italic text-center py-4">
                      No stand pins created yet. Use the "+ Add" button to drop a marker!
                    </p>
                  ) : (
                    pins.map((pin) => {
                      const pinMeta = PIN_METADATA[pin.type] || PIN_METADATA.stand;
                      const isSelected = selectedPinId === pin.id;
                      return (
                        <div
                          key={pin.id}
                          className={`p-2.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                            isSelected
                              ? `bg-emerald-500/15 border-emerald-500/60 ${isDark ? 'text-white' : 'text-emerald-950'}`
                              : isDark
                              ? 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-200'
                              : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-800'
                          }`}
                          onClick={() => centerOnPin(pin)}
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="text-lg flex-shrink-0">{pinMeta.emoji}</span>
                            <div className="truncate">
                              <div className="text-xs font-bold truncate">{pin.name}</div>
                              <div className="text-[10px] text-slate-400 truncate">{pinMeta.label}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => {
                                setEditingPinId(pin.id);
                                setEditName(pin.name);
                                setEditType(pin.type);
                                setEditNotes(pin.notes || '');
                                setEditPreferredWindDeg(pin.preferredWindDeg || 0);
                              }}
                              className="p-1 text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
                              title="Edit Pin"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeletePin(pin.id)}
                              className="p-1 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                              title="Delete Pin"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Tab 2: Polygons List */}
              {activeLayersTab === 'polygons' && (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {polygons.length === 0 ? (
                    <p className="text-xs text-slate-500 italic text-center py-4">
                      No field zones or boundaries drawn yet. Use "+ Add" to draw a polygon!
                    </p>
                  ) : (
                    polygons.map((poly) => {
                      const polyMeta = POLYGON_METADATA[poly.type] || POLYGON_METADATA.custom;
                      const isSelected = selectedPolygonId === poly.id;
                      return (
                        <div
                          key={poly.id}
                          className={`p-2.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                            isSelected
                              ? `bg-amber-500/15 border-amber-500/60 ${isDark ? 'text-white' : 'text-amber-950'}`
                              : isDark
                              ? 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-200'
                              : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-800'
                          }`}
                          onClick={() => selectPolygonAndCenter(poly)}
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="text-lg flex-shrink-0">{polyMeta.emoji}</span>
                            <div className="truncate">
                              <div className="text-xs font-bold truncate">{poly.name}</div>
                              <div className="text-[10px] text-amber-400 font-semibold truncate">{polyMeta.label}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => {
                                setEditingPolygonId(poly.id);
                                setPolygonEditName(poly.name);
                                setPolygonEditType(poly.type);
                                setPolygonEditNotes(poly.notes || '');
                              }}
                              className="p-1 text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
                              title="Edit Zone"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeletePolygon(poly.id)}
                              className="p-1 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                              title="Delete Zone"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* TOP FLOATING CREATION TOOLBAR: Active Polygon Drawing OR Pin Placing Mode */}
        {(isDrawingPolygon || isPlacingMarkerMode) && (
          <div className="absolute top-16 left-3 right-3 sm:left-1/2 sm:right-auto sm:transform sm:-translate-x-1/2 z-[70] bg-slate-950/95 text-white border border-emerald-500/80 px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-center gap-3 animate-fadeIn pointer-events-auto ui-control">
            {isPlacingMarkerMode ? (
              <>
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                  <MapPin className="w-4 h-4 animate-bounce" />
                  <span>Click anywhere on map to drop Stand Pin</span>
                </div>
                <button
                  onClick={() => setIsPlacingMarkerMode(false)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                  <Shapes className="w-4 h-4 animate-pulse" />
                  <span>Drawing {POLYGON_METADATA[polygonEditType]?.label || 'Zone'} ({currentPolygonPoints.length} points)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleUndoPolygonPoint}
                    disabled={currentPolygonPoints.length === 0}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-[10px] font-bold rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <Undo className="w-3 h-3" /> Undo
                  </button>
                  <button
                    onClick={handleFinishDrawPolygon}
                    disabled={currentPolygonPoints.length < 3}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-[10px] font-extrabold uppercase rounded-lg flex items-center gap-1 cursor-pointer shadow-md"
                  >
                    <CheckCircle2 className="w-3 h-3" /> Finish
                  </button>
                  <button
                    onClick={() => {
                      setIsDrawingPolygon(false);
                      setCurrentPolygonPoints([]);
                    }}
                    className="px-2 py-1 bg-rose-950/80 hover:bg-rose-900 text-rose-300 text-[10px] font-bold rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* BOTTOM RIGHT FLOATING CONTROLS: Snap to Location Reset */}
        <div className="absolute bottom-16 sm:bottom-4 right-4 z-30 pointer-events-auto">
          <button
            onClick={handleResetLocation}
            className={`p-2.5 rounded-2xl border shadow-xl backdrop-blur-md transition-all cursor-pointer ${
              isDark
                ? 'bg-slate-950/85 border-slate-800 text-emerald-400 hover:bg-slate-800 hover:text-white'
                : 'bg-white/95 border-slate-200 text-emerald-600 hover:bg-slate-50'
            }`}
            title="Snap Map to Default Location Center"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* CONDENSED BOTTOM FLOATING SCENT FORECASTER PANEL WITH TABS */}
        {selectedPin && (
          <div
            className={`absolute bottom-16 sm:bottom-3 left-3 right-14 sm:right-20 z-40 rounded-2xl border shadow-2xl transition-all duration-300 backdrop-blur-md pointer-events-auto ui-control overflow-hidden ${
              isDark ? 'bg-slate-950/95 border-slate-800 text-white' : 'bg-white/95 border-slate-200 text-slate-900'
            }`}
          >
            {/* Header Bar */}
            <div className="flex items-center justify-between p-3 border-b border-slate-800/30 bg-slate-950/20">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="text-xl flex-shrink-0">{PIN_METADATA[selectedPin.type]?.emoji}</span>
                <div className="truncate">
                  <h4 className="text-xs font-black truncate">{selectedPin.name}</h4>
                  <span className="text-[10px] text-emerald-400 font-bold block truncate">
                    {PIN_METADATA[selectedPin.type]?.label} • Wind: {windDirText} @ {displayWindSpeed}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => setIsScentPanelCollapsed((prev) => !prev)}
                  className="p-1 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1 px-2 cursor-pointer transition-colors"
                >
                  {isScentPanelCollapsed ? (
                    <>
                      <span>Expand</span>
                      <ChevronUp className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <>
                      <span>Collapse</span>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
                <button
                  onClick={() => setSelectedPinId(null)}
                  className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Collapsed Minimalist Preview Bar with Compact Hourly Slider */}
            {isScentPanelCollapsed ? (
              <div className="p-2.5 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-sky-400 truncate">
                  <Wind className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">Downwind: {downwindDirText} ({Math.round(downwindDeg)}°)</span>
                </div>

                {/* Compact Hourly Range Slider */}
                <div className="pt-1 border-t border-slate-800/40">
                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 mb-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      <span>{selectedHour === 0 ? '12 AM' : selectedHour === 12 ? '12 PM' : selectedHour > 12 ? `${selectedHour - 12} PM` : `${selectedHour} AM`}</span>
                    </span>
                    <span className="text-emerald-400 font-extrabold truncate">
                      {windDirText} @ {displayWindSpeed}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="23"
                    value={selectedHour}
                    onChange={(e) => setSelectedHour(parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                  />
                </div>
              </div>
            ) : (
              /* Uncollapsed Expanded View with 3 Condensed TABS */
              <div className="p-3 space-y-3">
                {/* Segmented Tab Buttons */}
                <div className="flex border-b border-slate-800/40">
                  <button
                    onClick={() => setActiveForecasterTab('hourly')}
                    className={`flex-1 py-1.5 text-[11px] font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      activeForecasterTab === 'hourly'
                        ? 'border-emerald-500 text-emerald-400'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Hourly Scent</span>
                  </button>



                  <button
                    onClick={() => setActiveForecasterTab('details')}
                    className={`flex-1 py-1.5 text-[11px] font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      activeForecasterTab === 'details'
                        ? 'border-emerald-500 text-emerald-400'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Details & Notes</span>
                  </button>
                </div>

                {/* TAB 1: Hourly Forecast & Wind Vector Slider */}
                {activeForecasterTab === 'hourly' && (
                  <div className="space-y-3">
                    {/* Days Selector */}
                    <div className="flex gap-1 overflow-x-auto pb-1">
                      {activeForecasts.slice(0, 5).map((d, idx) => (
                        <button
                          key={d.date}
                          onClick={() => setSelectedDayIndex(idx)}
                          className={`px-2.5 py-1 text-[10px] font-black rounded-xl border transition-all cursor-pointer flex-shrink-0 ${
                            selectedDayIndex === idx
                              ? 'bg-emerald-600 border-emerald-500 text-white shadow-xs'
                              : isDark
                              ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                              : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {d.dayName}
                        </button>
                      ))}
                    </div>

                    {/* 24-Hour Range Slider */}
                    <div>
                      <div className="flex justify-between items-center mb-2 gap-2">
                        <span className={`text-sm font-black flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
                          isDark ? 'text-slate-100 bg-slate-950/40 border-slate-800/50' : 'text-slate-800 bg-slate-100/80 border-slate-200'
                        }`}>
                          <Clock className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          <span>Time: {selectedHour === 0 ? '12:00 AM' : selectedHour === 12 ? '12:00 PM' : selectedHour > 12 ? `${selectedHour - 12}:00 PM` : `${selectedHour}:00 AM`}</span>
                        </span>
                        <span className="text-[11px] text-emerald-400 font-black bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 whitespace-nowrap">
                          Wind: {windDirText} @ {displayWindSpeed}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="23"
                        value={selectedHour}
                        onChange={(e) => setSelectedHour(parseInt(e.target.value, 10))}
                        className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                      />
                    </div>

                    {/* Wind & Scent Cone Description Card */}
                    <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                      isDark ? 'border-slate-800/40 bg-slate-950/40' : 'border-slate-200 bg-slate-100/50'
                    }`}>
                      <div>
                        <span className="text-slate-400 text-[10px] block uppercase font-bold">Downwind Scent Vector:</span>
                        <span className="font-extrabold text-orange-400">
                          Blowing TO {downwindDirText} ({Math.round(downwindDeg)}°)
                        </span>
                      </div>

                      {/* Scent Spread Selector */}
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-400 font-bold mr-1">Spread:</span>
                        {[15, 45, 75].map((spread) => (
                          <button
                            key={spread}
                            onClick={() => setScentSpread(spread as 15 | 45 | 75)}
                            className={`px-1.5 py-0.5 text-[9px] font-black rounded border cursor-pointer transition-all ${
                              scentSpread === spread
                                ? 'bg-orange-600 border-orange-500 text-white'
                                : isDark
                                ? 'bg-slate-900 border-slate-800 text-slate-400'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {spread}°
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}



                {/* TAB 3: Marker Details & Notes */}
                {activeForecasterTab === 'details' && (
                  <div className="space-y-3">
                    <div className={`p-2.5 rounded-xl border space-y-1.5 text-xs ${
                      isDark ? 'border-slate-800/40 bg-slate-950/40' : 'border-slate-200 bg-slate-100/50'
                    }`}>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-400">GPS Coordinates:</span>
                        <span className={`font-mono font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                          {selectedPin.lat.toFixed(5)}°N, {selectedPin.lng.toFixed(5)}°W
                        </span>
                      </div>

                      {selectedPin.notes ? (
                        <p className={`text-[11px] italic border-l-2 border-emerald-500 pl-2 py-0.5 ${
                          isDark ? 'text-slate-300' : 'text-slate-600'
                        }`}>
                          "{selectedPin.notes}"
                        </p>
                      ) : (
                        <p className="text-[10px] italic text-slate-500">No notes added to this marker yet.</p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingPinId(selectedPin.id);
                          setEditName(selectedPin.name);
                          setEditType(selectedPin.type);
                          setEditNotes(selectedPin.notes || '');
                          setEditPreferredWindDeg(selectedPin.preferredWindDeg || 0);
                        }}
                        className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase rounded-xl transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" /> Edit Marker
                      </button>
                      <button
                        onClick={() => handleDeletePin(selectedPin.id)}
                        className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-600 border border-rose-500/30 text-rose-300 hover:text-white font-extrabold text-xs uppercase rounded-xl transition-all cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* CONDENSED BOTTOM FLOATING SELECTED POLYGON / BOUNDARY INFORMATION PANEL */}
        {selectedPolygon && !selectedPin && selectedPolyStats && (
          <div
            className={`absolute bottom-16 sm:bottom-3 left-3 right-14 sm:right-20 z-40 rounded-2xl border shadow-2xl transition-all duration-300 backdrop-blur-md pointer-events-auto ui-control overflow-hidden animate-fadeIn ${
              isDark ? 'bg-slate-950/95 border-slate-800 text-white' : 'bg-white/95 border-slate-200 text-slate-900'
            }`}
          >
            {/* Header Bar */}
            <div className={`flex items-center justify-between p-3 border-b ${
              isDark ? 'border-slate-800/30 bg-slate-950/20' : 'border-slate-200 bg-slate-100/60'
            }`}>
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="text-xl flex-shrink-0">
                  {POLYGON_METADATA[selectedPolygon.type]?.emoji || '🚩'}
                </span>
                <div className="truncate">
                  <h4 className="text-xs font-black truncate">{selectedPolygon.name}</h4>
                  <span
                    className="text-[10px] font-bold block truncate"
                    style={{ color: POLYGON_METADATA[selectedPolygon.type]?.color || '#eab308' }}
                  >
                    {POLYGON_METADATA[selectedPolygon.type]?.label || 'Land Zone'} • {selectedPolygon.points.length} Boundary Points
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => {
                    setEditingPolygonId(selectedPolygon.id);
                    setPolygonEditName(selectedPolygon.name);
                    setPolygonEditType(selectedPolygon.type);
                    setPolygonEditNotes(selectedPolygon.notes || '');
                  }}
                  className="p-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-xs font-bold flex items-center gap-1 px-2.5 cursor-pointer transition-colors border border-amber-500/30"
                  title="Edit Zone / Boundary Details"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Edit</span>
                </button>
                <button
                  onClick={() => setSelectedPolygonId(null)}
                  className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                  title="Close Panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Polygon Details Body */}
            <div className="p-3 space-y-2.5 text-xs">
              {/* Quick Metrics Grid */}
              <div className="grid grid-cols-3 gap-2">
                <div className={`p-2 rounded-xl border text-center ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-[9px] uppercase font-black text-slate-400 block">Total Area</span>
                  <span className="text-xs font-black text-amber-400">{selectedPolyStats.areaStr}</span>
                </div>

                <div className={`p-2 rounded-xl border text-center ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-[9px] uppercase font-black text-slate-400 block">Perimeter</span>
                  <span className="text-xs font-black text-emerald-400">{selectedPolyStats.perimeterStr}</span>
                </div>

                <div className={`p-2 rounded-xl border text-center ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-[9px] uppercase font-black text-slate-400 block">Current Wind</span>
                  <span className="text-xs font-black text-sky-400">{windDirText} @ {displayWindSpeed}</span>
                </div>
              </div>

              {/* Scouting Notes */}
              <div className={`p-2.5 rounded-xl border space-y-1 ${isDark ? 'bg-slate-900/40 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Scouting Strategy Notes</span>
                {selectedPolygon.notes ? (
                  <p className={`text-xs italic ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>"{selectedPolygon.notes}"</p>
                ) : (
                  <p className="text-xs text-slate-400 italic">No notes added to this boundary or zone yet.</p>
                )}
              </div>

              {/* Quick Action Footer */}
              <div className="flex gap-2 pt-0.5">
                <button
                  onClick={() => {
                    setEditingPolygonId(selectedPolygon.id);
                    setPolygonEditName(selectedPolygon.name);
                    setPolygonEditType(selectedPolygon.type);
                    setPolygonEditNotes(selectedPolygon.notes || '');
                  }}
                  className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-black text-xs uppercase rounded-xl transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit Zone / Boundary
                </button>
                <button
                  onClick={() => handleDeletePolygon(selectedPolygon.id)}
                  className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-600 border border-rose-500/30 text-rose-300 hover:text-white font-extrabold text-xs uppercase rounded-xl transition-all cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Save New Polygon Zone */}
      {isSavingNewPolygonModal && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fadeIn"
          onClick={() => setIsSavingNewPolygonModal(false)}
        >
          <div
            className={`w-full max-w-sm rounded-2xl p-5 border shadow-2xl space-y-4 relative ${
              isDark
                ? 'bg-slate-900 border-slate-800 text-white'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-2 border-slate-800/20">
              <h3 className="text-xs font-black uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                <Shapes className="w-3.5 h-3.5" />
                Save Land Polygon Zone
              </h3>
              <button
                onClick={() => setIsSavingNewPolygonModal(false)}
                className="text-slate-400 hover:text-rose-400 font-extrabold text-sm p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Zone Name
                </label>
                <input
                  type="text"
                  value={polygonEditName}
                  onChange={(e) => setPolygonEditName(e.target.value)}
                  placeholder="e.g. North Clover Food Plot"
                  className={`w-full rounded-xl border px-3 py-2 text-xs focus:outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-amber-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-amber-600'
                  }`}
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Zone Classification
                </label>
                <select
                  value={polygonEditType}
                  onChange={(e) => setPolygonEditType(e.target.value as PolygonType)}
                  className={`w-full rounded-xl border px-2.5 py-2 text-xs focus:outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-amber-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-amber-600'
                  }`}
                >
                  {Object.entries(POLYGON_METADATA).map(([typeKey, meta]) => (
                    <option key={typeKey} value={typeKey}>
                      {meta.emoji} {meta.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Scouting Notes
                </label>
                <textarea
                  value={polygonEditNotes}
                  onChange={(e) => setPolygonEditNotes(e.target.value)}
                  placeholder="e.g. Planted winter rye & clover..."
                  rows={3}
                  className={`w-full rounded-xl border px-3 py-2 text-xs focus:outline-none resize-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-amber-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-amber-600'
                  }`}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSaveNewPolygon}
                  className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" /> Save Zone
                </button>
                <button
                  onClick={() => setIsSavingNewPolygonModal(false)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold uppercase transition-colors cursor-pointer ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Edit Existing Polygon Details */}
      {editingPolygonId && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fadeIn"
          onClick={() => setEditingPolygonId(null)}
        >
          <div
            className={`w-full max-w-sm rounded-2xl p-5 border shadow-2xl space-y-4 relative ${
              isDark
                ? 'bg-slate-900 border-slate-800 text-white'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-2 border-slate-800/20">
              <h3 className="text-xs font-black uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                <Edit2 className="w-3.5 h-3.5" />
                Edit Polygon Zone
              </h3>
              <button
                onClick={() => setEditingPolygonId(null)}
                className="text-slate-400 hover:text-rose-400 font-extrabold text-sm p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Zone Name
                </label>
                <input
                  type="text"
                  value={polygonEditName}
                  onChange={(e) => setPolygonEditName(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2 text-xs focus:outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-amber-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-amber-600'
                  }`}
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Zone Classification
                </label>
                <select
                  value={polygonEditType}
                  onChange={(e) => setPolygonEditType(e.target.value as PolygonType)}
                  className={`w-full rounded-xl border px-2.5 py-2 text-xs focus:outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-amber-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-amber-600'
                  }`}
                >
                  {Object.entries(POLYGON_METADATA).map(([typeKey, meta]) => (
                    <option key={typeKey} value={typeKey}>
                      {meta.emoji} {meta.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Scouting Notes
                </label>
                <textarea
                  value={polygonEditNotes}
                  onChange={(e) => setPolygonEditNotes(e.target.value)}
                  rows={3}
                  className={`w-full rounded-xl border px-3 py-2 text-xs focus:outline-none resize-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-amber-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-amber-600'
                  }`}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSavePolygonEdit}
                  className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" /> Save Changes
                </button>
                <button
                  onClick={() => setEditingPolygonId(null)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold uppercase transition-colors cursor-pointer ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Configure Marker Details */}
      {editingPinId && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fadeIn"
          onClick={() => setEditingPinId(null)}
        >
          <div
            className={`w-full max-w-sm rounded-2xl p-5 border shadow-2xl space-y-4 relative ${
              isDark
                ? 'bg-slate-900 border-slate-800 text-white'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-2 border-slate-800/20">
              <h3 className="text-xs font-black uppercase tracking-wider text-emerald-500 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Configure Marker Details
              </h3>
              <button
                onClick={() => setEditingPinId(null)}
                className="text-slate-400 hover:text-rose-400 font-extrabold text-sm p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Pin Location Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Oak Ridge Stand"
                  className={`w-full rounded-xl border px-3 py-2 text-xs focus:outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-emerald-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-600'
                  }`}
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Marker Category
                </label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as PinType)}
                  className={`w-full rounded-xl border px-2.5 py-2 text-xs focus:outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-emerald-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-600'
                  }`}
                >
                  <option value="stand">🎯 Tree Stand</option>
                  <option value="trail_cam">📷 Trail Camera</option>
                  <option value="bedding">🦌 Bedding Sanctuary</option>
                  <option value="food_plot">🌾 Primary Food Plot</option>
                  <option value="scrape">🪵 Scrapeline / Rubbing Tree</option>
                  <option value="other">📍 Other Marker</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Preferred Wind Direction
                  </label>
                  <span className="text-xs font-black text-emerald-400">
                    {getWindDirectionText(editPreferredWindDeg)} ({Math.round(editPreferredWindDeg)}°)
                  </span>
                </div>

                {/* Interactive Wind Compass Dial & Scent Cone Arc Visualizer */}
                <div className={`flex items-center gap-3 p-2.5 rounded-xl border my-2 ${
                  isDark ? 'bg-slate-950/80 border-emerald-500/30' : 'bg-slate-50 border-emerald-200'
                }`}>
                  <div className="relative w-16 h-16 flex-shrink-0 flex items-center justify-center bg-slate-900 rounded-full border border-slate-700 shadow-inner">
                    <svg viewBox="0 0 100 100" className="w-full h-full">
                      <circle cx="50" cy="50" r="46" fill="none" stroke="#334155" strokeWidth="2" />
                      {(() => {
                        const downwind = (editPreferredWindDeg + 180) % 360;
                        const startAngle = (downwind - 70 + 360) % 360;
                        const endAngle = (downwind + 70 + 360) % 360;
                        return (
                          <path
                            d={getSvgArcPath(50, 50, 42, startAngle, endAngle)}
                            fill="#10b981"
                            fillOpacity="0.4"
                            stroke="#34d399"
                            strokeWidth="2"
                          />
                        );
                      })()}
                      <text x="50" y="15" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="900">N</text>
                      <text x="88" y="53" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="900">E</text>
                      <text x="50" y="92" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="900">S</text>
                      <text x="12" y="53" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="900">W</text>
                      
                      <circle cx="50" cy="50" r="4" fill="#10b981" />
                      {(() => {
                        const rad = ((editPreferredWindDeg - 90) * Math.PI) / 180;
                        const ax = 50 + 28 * Math.cos(rad);
                        const ay = 50 + 28 * Math.sin(rad);
                        return (
                          <line x1="50" y1="50" x2={ax} y2={ay} stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" />
                        );
                      })()}
                    </svg>
                  </div>
                  <div className="flex-1 text-[11px] space-y-0.5">
                    <div className="font-extrabold text-emerald-400">
                      Scent Sector: {getWindDirectionText(editPreferredWindDeg)}
                    </div>
                    <div className="text-[10px] text-slate-400 leading-tight">
                      Green arc displays the 140° safe wind angle sector blowing scent away from game trails.
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1 mb-2">
                  {['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((dir) => {
                    const deg = DIRECTION_DEGREES[dir];
                    const isSelected = Math.abs((editPreferredWindDeg - deg + 360) % 360) < 15;
                    return (
                      <button
                        key={dir}
                        type="button"
                        onClick={() => setEditPreferredWindDeg(deg)}
                        className={`py-1 text-[10px] font-extrabold rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 border-emerald-400 text-white shadow-xs'
                            : isDark
                            ? 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800'
                            : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {dir} ({deg}°)
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <input
                    type="range"
                    min="0"
                    max="355"
                    step="5"
                    value={editPreferredWindDeg}
                    onChange={(e) => setEditPreferredWindDeg(parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Scout Notes
                </label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Scouting strategy notes..."
                  rows={3}
                  className={`w-full rounded-xl border px-3 py-2 text-xs focus:outline-none resize-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-emerald-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-600'
                  }`}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSavePinDetails}
                  className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" /> Save Changes
                </button>
                <button
                  onClick={() => {
                    if (editingPinId) handleDeletePin(editingPinId);
                  }}
                  className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-600 border border-rose-500/30 text-rose-300 hover:text-white font-extrabold text-xs uppercase rounded-xl transition-all cursor-pointer"
                >
                  Delete
                </button>
                <button
                  onClick={() => setEditingPinId(null)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold uppercase transition-colors cursor-pointer ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
