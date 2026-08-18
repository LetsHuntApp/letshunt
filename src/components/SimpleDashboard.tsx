import React from 'react';
import {
  ArrowRight,
  Check,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudRainWind,
  CloudSun,
  Compass,
  Droplets,
  Gauge,
  Map,
  Moon,
  Settings,
  Snowflake,
  Sun,
  Sunrise,
  Sunset,
  Wind,
} from 'lucide-react';
import { DailyForecast, Location, PressureUnit, ThemeVariantMode, UnitSystem } from '../types';
import { getPeakHuntScore, getWeatherDetails, isPrimeDay } from '../utils/huntingEngine';

interface SimpleDashboardProps {
  day: DailyForecast;
  forecast: DailyForecast[];
  location: Location;
  units: UnitSystem;
  pressureUnit: PressureUnit;
  theme?: ThemeVariantMode;
  selectedHour: number;
  onSelectHour: (hour: number) => void;
  onSelectDate: (date: string) => void;
  onOpenDetails: (date: string) => void;
  onOpenMap: () => void;
  onOpenSettings: () => void;
}

const weatherIcon = (iconName: string) => {
  const props = { className: 'simple-weather-icon', strokeWidth: 1.8 };
  switch (iconName) {
    case 'Sun': return <Sun {...props} />;
    case 'SunMedium': return <Sun {...props} />;
    case 'CloudSun': return <CloudSun {...props} />;
    case 'CloudFog': return <CloudFog {...props} />;
    case 'CloudDrizzle': return <CloudDrizzle {...props} />;
    case 'CloudRain': return <CloudRain {...props} />;
    case 'CloudRainWind': return <CloudRainWind {...props} />;
    case 'Snowflake': return <Snowflake {...props} />;
    case 'CloudLightning': return <CloudLightning {...props} />;
    default: return <Cloud {...props} />;
  }
};

const scoreTone = (score: number) => {
  if (score >= 90) return 'excellent';
  if (score >= 76) return 'good';
  if (score >= 46) return 'fair';
  return 'poor';
};

const displayWind = (day: DailyForecast, units: UnitSystem) =>
  `${units === 'metric' ? day.windSpeedMaxKmh : day.windSpeedMaxMph} ${units === 'metric' ? 'km/h' : 'mph'} ${day.windDirectionText}`;

export const SimpleDashboard: React.FC<SimpleDashboardProps> = ({
  day,
  forecast,
  location,
  units,
  pressureUnit,
  selectedHour,
  onSelectHour,
  onSelectDate,
  onOpenDetails,
  onOpenMap,
  onOpenSettings,
}) => {
  const hour = day.hourly?.[selectedHour];
  const score = hour?.huntScore ?? day.huntScore;
  const rating = hour?.huntScore !== undefined
    ? (score >= 90 ? 'Great' : score >= 76 ? 'Good' : score >= 46 ? 'Fair' : 'Poor')
    : day.rating;
  const weather = getWeatherDetails(hour?.weatherCode ?? day.weatherCode);
  const tone = scoreTone(score);
  const visibleHours = [6, 9, 12, 15, 18].filter((h) => day.hourly?.[h]);
  const bestDay = forecast.reduce((best, candidate) =>
    getPeakHuntScore(candidate) > getPeakHuntScore(best) ? candidate : best,
    forecast[0] || day,
  );

  return (
    <div className="simple-dashboard">
      <section className="simple-welcome">
        <div>
          <p className="simple-eyebrow">Simple mode</p>
          <h1>Today's hunt plan</h1>
          <p className="simple-location"><Compass size={15} /> {location.name}{location.admin1 ? `, ${location.admin1}` : ''}</p>
        </div>
        <div className="simple-welcome-actions">
          <button type="button" className="simple-icon-button" onClick={onOpenMap} aria-label="Open map" title="Open map"><Map size={18} /></button>
          <button type="button" className="simple-icon-button" onClick={onOpenSettings} aria-label="Open settings" title="Open settings"><Settings size={18} /></button>
        </div>
      </section>

      <section className={`simple-score-card ${tone}`} aria-label={`Hunt score ${score} out of 100`}>
        <div className="simple-score-ring"><strong>{score}</strong><span>/100</span></div>
        <div className="simple-score-copy">
          <p className="simple-eyebrow">Movement outlook</p>
          <h2>{rating} day to hunt</h2>
          <p>{day.verdict.replace(/^[^.!?]*[.!?]\s*/, '') || 'Use the best windows below and keep your approach simple.'}</p>
        </div>
        <div className="simple-weather-summary">
          {weatherIcon(weather.icon)}
          <strong>{hour?.temp ?? day.maxTemp}{units === 'metric' ? '°C' : '°F'}</strong>
          <span>{weather.desc}</span>
        </div>
      </section>

      <section className="simple-section simple-hour-section">
        <div className="simple-section-heading">
          <div><p className="simple-eyebrow">Quick check</p><h2>When should I go?</h2></div>
          <span className="simple-muted">{hour ? `${selectedHour}:00 selected` : 'Today'}</span>
        </div>
        <div className="simple-hour-row">
          {visibleHours.map((hourIndex) => {
            const item = day.hourly[hourIndex];
            const isSelected = selectedHour === hourIndex;
            const isPrime = item.isPrimeWindow;
            return (
              <button key={hourIndex} type="button" className={`simple-hour-button ${isSelected ? 'selected' : ''} ${isPrime ? 'prime' : ''}`} onClick={() => onSelectHour(hourIndex)}>
                <span>{hourIndex === 6 ? 'Dawn' : hourIndex === 18 ? 'Dusk' : `${hourIndex}:00`}</span>
                <strong>{item.huntScore}</strong>
                {isPrime && <Check size={13} aria-label="Prime window" />}
              </button>
            );
          })}
        </div>
        <button type="button" className="simple-text-button" onClick={() => onOpenDetails(day.date)}>See the full forecast <ArrowRight size={15} /></button>
      </section>

      <section className="simple-two-column">
        <div className="simple-section simple-windows">
          <div className="simple-section-heading"><div><p className="simple-eyebrow">Best windows</p><h2>Be in the woods</h2></div></div>
          <div className="simple-window-row"><Sunrise size={19} /><div><strong>Morning</strong><span>{day.morningPrime}</span></div></div>
          <div className="simple-window-row"><Sunset size={19} /><div><strong>Evening</strong><span>{day.eveningPrime}</span></div></div>
          <div className="simple-window-row"><Moon size={19} /><div><strong>Moon activity</strong><span>{day.solunar.major1}</span></div></div>
        </div>

        <div className="simple-section simple-conditions">
          <div className="simple-section-heading"><div><p className="simple-eyebrow">Keep it simple</p><h2>Conditions</h2></div></div>
          <div className="simple-condition-row"><Wind size={18} /><span>Wind</span><strong>{displayWind(day, units)}</strong></div>
          <div className="simple-condition-row"><Droplets size={18} /><span>Rain</span><strong>{day.precipSumMm > 0 ? `${Math.round(day.precipSumMm)} mm expected` : 'No rain expected'}</strong></div>
          <div className="simple-condition-row"><Gauge size={18} /><span>Pressure</span><strong>{pressureUnit === 'hPa' ? `${Math.round(day.pressureAvgHpa)} hPa` : `${day.pressureAvgInHg.toFixed(2)} inHg`} · {day.pressureTrend.replace('_', ' ')}</strong></div>
        </div>
      </section>

      <section className="simple-section simple-outlook">
        <div className="simple-section-heading">
          <div><p className="simple-eyebrow">Plan ahead</p><h2>Next few days</h2></div>
          {bestDay.date !== day.date && <span className="simple-best-badge">Best: {bestDay.dayName}</span>}
        </div>
        <div className="simple-outlook-list">
          {forecast.slice(0, 5).map((item) => {
            const itemScore = getPeakHuntScore(item);
            return (
              <button key={item.date} type="button" className={`simple-outlook-row ${item.date === day.date ? 'active' : ''}`} onClick={() => onSelectDate(item.date)}>
                <span className="simple-outlook-day">{item.dayName}</span>
                <span className="simple-outlook-weather">{weatherIcon(getWeatherDetails(item.weatherCode).icon)} {item.maxTemp}{units === 'metric' ? '°C' : '°F'}</span>
                <span className="simple-outlook-rating">{isPrimeDay(itemScore) ? 'Prime' : item.rating}</span>
                <span className={`simple-outlook-score ${scoreTone(itemScore)}`}>{itemScore}</span>
              </button>
            );
          })}
        </div>
      </section>

      <p className="simple-footer-note">Simple mode shows the essentials. You can switch back to the full dashboard anytime in Settings.</p>
    </div>
  );
};
