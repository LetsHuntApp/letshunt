export type ThemeMode = 'dark' | 'light' | 'olive' | 'hunting';

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
  windDirectionDeg: number;
  windDirectionText: string;
  precipProbability: number;
  precipMm: number;
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

export type PinType = 'stand' | 'trail_cam' | 'bedding' | 'food_plot' | 'scrape' | 'other';

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

export type TrailCameraTab = 'gallery' | 'analytics' | 'insights';

export interface TrailCameraLocation {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
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
  cameraModel?: string;
  latitude?: number;
  longitude?: number;
  cameraLocationId?: string;
  cameraLocationName?: string;
  notes?: string;
  isFavorite: boolean;
  weather?: HistoricalWeatherData;
}

export interface TrailCameraFilterState {
  dateStart?: string;
  dateEnd?: string;
  cameraLocationId?: string;
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
