/**
 * Variant: ONE of three visual themes. Orthogonal to light/dark — the same
 * variant renders in either mode via the global `dark` html class.
 *   - standard : clean Tailwind-aligned look (slate / emerald accents)
 *   - olive    : hunter-green moss palette
 *   - hunting  : rustic autumn-paper palette
 */
export type ThemeVariant = 'standard' | 'olive' | 'hunting';

/**
 * Mode: orthogonal to variant. App-wide light-vs-dark toggle.
 */
export type ThemeMode = 'light' | 'dark';

/**
 * Composite legacy string used by inline ternaries inside component files.
 * Derive via combineVariantMode() so feature code can keep doing
 * `theme === 'hunting'` etc. without caring about light/dark.
 *
 *   variant==='standard' + mode==='dark'  -> 'dark'
 *   variant==='standard' + mode==='light' -> 'light'
 *   variant==='olive'                     -> 'olive'
 *   variant==='hunting'                   -> 'hunting'
 */
export type ThemeVariantMode =
  | 'dark'
  | 'light'
  | 'olive'
  | 'hunting';

export function combineVariantMode(
  variant: ThemeVariant,
  mode: ThemeMode
): ThemeVariantMode {
  if (variant === 'standard') return mode === 'dark' ? 'dark' : 'light';
  return variant;
}

export interface Location {
  id?: string;
  name: string;
  admin1?: string; // State or region
  country?: string;
  latitude: number;
  longitude: number;
  isFavorite?: boolean;
}

export type UnitSystem = 'imperial' | 'metric';

export type PressureUnit = 'inHg' | 'hPa';

export type PressureTrend = 'rapid_rise' | 'rising' | 'steady' | 'falling' | 'rapid_drop';

export interface ScoreFactor {
  name: string;
  score: number; // contribution (-20 to +30)
  maxScore: number;
  description: string;
  status: 'optimal' | 'good' | 'neutral' | 'poor';
}

export interface SolunarInfo {
  moonPhase: number; // 0.0 - 1.0
  moonPhaseName: string;
  moonIllumination: number; // percentage
  major1: string; // e.g. "06:15 AM - 08:15 AM"
  major2: string; // e.g. "06:45 PM - 08:45 PM"
  minor1: string; // e.g. "12:10 AM - 01:10 AM"
  minor2: string; // e.g. "12:35 PM - 01:35 PM"
  sunrise: string;
  sunset: string;
}

export interface HourlyForecast {
  time: string; // ISO or HH:mm
  timestamp: number;
  temp: number; // °F or °C depending on system
  tempDrop24h?: number; // 24h temperature drop for this specific hour
  pressureHpa: number;
  pressureInHg: number;
  windSpeedMph: number;
  windSpeedKmh: number;
  windGustMph?: number; // 10m wind gust (optional, Batch 1)
  windGustKmh?: number; // 10m wind gust in km/h (optional, Batch 1)
  windDirectionDeg: number;
  windDirectionText: string;
  precipProbability: number;
  precipMm: number;
  humidity?: number; // 0-100 (optional, Batch 1)
  pressureTrend?: PressureTrend; // per-hour pressure trend used in the hourly score
  weatherCode: number;
  weatherDesc: string;
  huntScore: number; // 0-100
  isPrimeWindow: boolean;
  solunarRating: 'High' | 'Medium' | 'Normal';
}

export interface DailyForecast {
  date: string; // YYYY-MM-DD
  dayName: string; // e.g., "Today", "Mon", "Tue"
  dateFormatted: string; // e.g. "Oct 24"
  maxTemp: number;
  minTemp: number;
  tempDrop24h: number; // degree drop compared to prior 24h
  pressureAvgInHg: number;
  pressureAvgHpa: number;
  pressureTrend: PressureTrend;
  windSpeedMaxMph: number;
  windSpeedMaxKmh: number;
  windDirectionDeg: number;
  windDirectionText: string;
  precipSumMm: number;
  precipSumInches: number;
  weatherCode: number;
  weatherDesc: string;
  weatherIcon: string;
  isPostStorm: boolean;
  hasRainBreak?: boolean;
  /** Hour index (0-23) of the last hour with meaningful rain (> 0.2 mm). -1 if no rain. */
  lastRainHour?: number;
  humidityAvg?: number; // Average relative humidity 0-100 (optional, Batch 1)
  
  // Hunting forecast metrics
  huntScore: number; // 0 - 100
  rating: 'Poor' | 'Fair' | 'Good' | 'Excellent';
  verdict: string;
  
  // Breakdown
  factors: ScoreFactor[];
  
  // Prime hunting time windows
  morningPrime: string; // e.g., "06:30 AM - 09:15 AM"
  eveningPrime: string; // e.g., "04:45 PM - 07:15 PM"
  
  solunar: SolunarInfo;
  hourly: HourlyForecast[];
}

export interface HuntingForecastResponse {
  location: Location;
  units: UnitSystem;
  updatedAt: string;
  daily: DailyForecast[];
}

export type PinType = 'stand' | 'trail_cam' | 'bedding' | 'food_plot' | 'scrape' | 'home' | 'other';

export interface SavedPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: PinType;
  notes?: string;
  preferredWind?: string[];
  preferredWindDeg?: number;
  createdAt: number;
}

export type PolygonType = 'crop_field' | 'food_plot' | 'bedding_zone' | 'water_source' | 'timber_woods' | 'custom' | 'property_boundary';

export interface PolygonPoint {
  lat: number;
  lng: number;
}

export interface SavedPolygon {
  id: string;
  name: string;
  type: PolygonType;
  points: PolygonPoint[];
  notes?: string;
  createdAt: number;
}

export type PathType = 'travel_route' | 'deer_trail' | 'fence_line' | 'creek' | 'ridge' | 'custom';

export interface SavedPath {
  id: string;
  name: string;
  type: PathType;
  points: PolygonPoint[];
  notes?: string;
  createdAt: number;
}

export type TrailCameraTab = 'gallery' | 'analytics' | 'insights';

export interface TrailCameraLocation {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
  _isMapPin?: boolean;
}

export interface HistoricalWeatherData {
  windDirection: string;
  windDirectionDeg: number;
  windSpeedMph: number;
  windSpeedKmh: number;
  temperature: number;
  pressureInHg: number;
  pressureHpa: number;
  pressureTrend: string;
  humidity: number;
  moonPhase: number;
  moonIllumination: number;
  moonPhaseName: string;
  weatherCode: number;
  weatherDesc: string;
  precipitationMm: number;
}

export interface TrailCameraPhoto {
  id: string;
  fileName: string;
  fileSize: number;
  importedAt: number;
  dateTime?: string;
  timeDefaulted?: boolean;
  cameraModel?: string;
  latitude?: number;
  longitude?: number;
  cameraLocationId?: string;
  cameraLocationName?: string;
  notes?: string;
  isFavorite: boolean;
  tags?: string[];
  weather?: HistoricalWeatherData;
  rawOcrText?: string;
}

export interface TrailCameraTarget {
  id: string;
  name: string;
  color: string;
}

export interface TrailCameraFilterState {
  dateStart?: string;
  dateEnd?: string;
  cameraLocationId?: string;
  targetId?: string;
  windDirection?: string;
  windSpeedMin?: number;
  windSpeedMax?: number;
  tempMin?: number;
  tempMax?: number;
  weatherConditions?: string[];
  pressureMin?: number;
  pressureMax?: number;
  moonPhase?: string;
  searchQuery?: string;
}

export type DeerGender = 'Buck' | 'Doe' | 'Button Buck' | 'Shed Buck' | 'Other';

export interface DeerKillLog {
  id: string;
  dateTime: string; // ISO string YYYY-MM-DDTHH:mm
  standId?: string; // ID from SavedPin if linked to a map pin
  standName: string; // Name of stand/spot
  gender: DeerGender;
  age?: string; // e.g., "3.5 yrs", "Fawn", "Mature (4.5+)"
  points?: number; // Antler points
  weightLbs?: number; // Dressed weight
  weapon?: string; // e.g., "Compound Bow", "Rifle (.30-06)", "Crossbow"
  temperature?: number; // temperature at harvest (°F or user standard)
  windSpeed?: number; // wind speed at harvest (mph or user standard)
  windDirection?: string; // e.g., "N", "NE", "E", "SE", "S", "SW", "W", "NW"
  photoUrl?: string; // Base64 image data URL
  notes?: string;
  createdAt: number;
}
