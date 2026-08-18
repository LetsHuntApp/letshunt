import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
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
  Moon,
  Snowflake,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Target,
  Wind,
} from 'lucide-react';
import { DailyForecast, HourlyForecast, Location, PressureUnit, UnitSystem } from '../types';
import { DeerIcon } from './DeerIcon';
import { getHour12Label, getPeakHuntScore, getWeatherDetails } from '../utils/huntingEngine';

interface SimpleDashboardProps {
  day: DailyForecast;
  forecast: DailyForecast[];
  location: Location;
  units: UnitSystem;
  pressureUnit: PressureUnit;
  selectedHour: number;
  onSelectHour: (hour: number) => void;
  onSelectDate: (date: string) => void;
}

type ScoreTone = 'great' | 'good' | 'fair' | 'poor';

const getScoreTone = (score: number): ScoreTone => {
  if (score >= 90) return 'great';
  if (score >= 76) return 'good';
  if (score >= 46) return 'fair';
  return 'poor';
};

const getScoreLabel = (score: number) => {
  if (score >= 90) return 'Great deer movement';
  if (score >= 76) return 'Good deer movement';
  if (score >= 46) return 'Fair deer movement';
  return 'Slow deer movement';
};

const scoreColor = (score: number) => {
  switch (getScoreTone(score)) {
    case 'great': return '#2f8f68';
    case 'good': return '#69a86f';
    case 'fair': return '#d38a3a';
    default: return '#c45b53';
  }
};

const weatherIcon = (iconName: string, className = 'simple-weather-icon') => {
  const props = { className, strokeWidth: 1.8 };
  switch (iconName) {
    case 'Sun':
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

const displayWind = (day: DailyForecast, units: UnitSystem) =>
  `${units === 'metric' ? day.windSpeedMaxKmh : day.windSpeedMaxMph} ${units === 'metric' ? 'km/h' : 'mph'} ${day.windDirectionText}`;

const hourLabel = (hour: number) => getHour12Label(Math.max(0, Math.min(23, hour))).replace(':00', '');

interface SimpleScoreGraphProps {
  hourly: HourlyForecast[];
  selectedHour: number;
  onSelectHour: (hour: number) => void;
  dayLabel?: string;
  forecast?: DailyForecast[];
  activeDate?: string;
  onSelectDate?: (date: string) => void;
}

export const SimpleScoreGraph: React.FC<SimpleScoreGraphProps> = ({ hourly, selectedHour, onSelectHour, dayLabel, forecast, activeDate, onSelectDate }) => {
  const tabDays = forecast?.slice(0, 5) || [];
  const activeTabDate = activeDate || tabDays[0]?.date;
  const tabDay = tabDays.find((item) => item.date === activeTabDate);
  const graphHourly = tabDay?.hourly || hourly;
  const graphDayLabel = tabDay ? `${tabDay.dayName} · ${tabDay.dateFormatted}` : dayLabel;

  return (
    <div className="simple-graph" aria-label="Hourly movement score graph">
      <div className="simple-graph-heading">
        <div>
          <p className="simple-eyebrow">Deer movement by hour{graphDayLabel ? ` · ${graphDayLabel}` : ''}</p>
          <h3>When the woods come alive</h3>
        </div>
        <div className="simple-score-legend" aria-label="Score color legend">
          <span className="great"><i /> 90+</span>
          <span className="good"><i /> 76–89</span>
          <span className="fair"><i /> 46–75</span>
          <span className="poor"><i /> &lt;46</span>
        </div>
      </div>
      {tabDays.length > 0 && onSelectDate && (
        <div className="simple-day-tabs" role="tablist" aria-label="Choose a forecast day">
          {tabDays.map((item) => {
            const itemScore = getPeakHuntScore(item);
            const isActive = item.date === activeTabDate;
            return (
              <button
                key={item.date}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`simple-day-tab ${isActive ? 'active' : ''}`}
                onClick={() => onSelectDate(item.date)}
              >
                <span>{item.dayName}</span>
                <small>{item.dateFormatted}</small>
                <b className={getScoreTone(itemScore)}>{itemScore}</b>
              </button>
            );
          })}
        </div>
      )}
      <div className="simple-graph-frame">
        <div className="simple-bar-chart" role="img" aria-label="Color-coded deer movement scores through the day">
          {graphHourly.map((item, index) => {
            const scoreHeight = Math.max(8, (item.huntScore / 100) * 100);
            return (
              <button
                key={index}
                type="button"
                className={`simple-bar-column ${index === selectedHour ? 'selected' : ''}`}
                onClick={() => onSelectHour(index)}
                aria-label={`${hourLabel(index)} movement score ${item.huntScore}`}
              >
                <span className="simple-bar-score">{item.huntScore}</span>
                <span className="simple-bar-track"><i style={{ height: `${scoreHeight}%`, backgroundColor: scoreColor(item.huntScore) }} /></span>
                <span className="simple-bar-label">{index % 3 === 0 ? hourLabel(index) : ''}</span>
              </button>
            );
          })}
        </div>
        <div className="simple-graph-axis"><span>12 AM</span><span>Dawn</span><span>Midday</span><span>Dusk</span><span>12 AM</span></div>
      </div>
    </div>
  );
};

interface SimpleHourlyTimelineProps {
  hourly: HourlyForecast[];
  units: UnitSystem;
  selectedHour: number;
  onSelectHour: (hour: number) => void;
  dayLabel?: string;
}

export const SimpleHourlyTimeline: React.FC<SimpleHourlyTimelineProps> = ({ hourly, units, selectedHour, onSelectHour, dayLabel }) => {
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());
  const maxHour = Math.max(0, Math.min(23, hourly.length - 1));
  const safeHour = Math.max(0, Math.min(maxHour, selectedHour));
  const selected = hourly[safeHour];

  useEffect(() => {
    const tick = () => setCurrentHour(new Date().getHours());
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!selected || hourly.length === 0) return null;

  return (
    <section className="simple-timeline" aria-label="Precision hourly hunt timeline">
      <div className="simple-timeline-header">
        <div className="simple-timeline-title">
          <div className="simple-timeline-icon"><Target size={17} /></div>
          <div><p className="simple-eyebrow">Hour-by-hour hunt{dayLabel ? ` · ${dayLabel}` : ''}</p><h2>Find your window</h2></div>
        </div>
        <div className="simple-timeline-selected">
          <strong>{hourLabel(safeHour)}</strong>
          <span>{selected.huntScore} movement</span>
        </div>
      </div>

      <div className="simple-timeline-control">
        <div className="simple-timeline-segments" aria-hidden="true">
          {hourly.map((item, index) => <span key={index} style={{ backgroundColor: scoreColor(item.huntScore), opacity: index === safeHour ? 1 : .72 }} />)}
        </div>
        <div className="simple-timeline-now" style={{ left: `${(currentHour / Math.max(1, maxHour)) * 100}%` }}><span>NOW</span></div>
        <div className="simple-timeline-thumb" style={{ left: `${(safeHour / Math.max(1, maxHour)) * 100}%`, backgroundColor: scoreColor(selected.huntScore) }} />
        <input
          type="range"
          min={0}
          max={maxHour}
          step={1}
          value={safeHour}
          onChange={(event) => onSelectHour(parseInt(event.target.value, 10))}
          aria-label="Choose a hunting hour"
        />
      </div>
      <div className="simple-timeline-labels"><span>12 AM</span><span>DAWN</span><span>NOON</span><span>DUSK</span><span>12 AM</span></div>

      <div className={`simple-timeline-detail ${getScoreTone(selected.huntScore)}`}>
        <div className="simple-timeline-detail-main">
          {weatherIcon(getWeatherDetails(selected.weatherCode).icon, 'simple-timeline-weather')}
          <div><span className="simple-timeline-time">{hourLabel(safeHour)}{safeHour === currentHour ? ' · Live' : ''}</span><strong>{getScoreLabel(selected.huntScore)}</strong></div>
        </div>
        <div className="simple-timeline-stat"><Wind size={15} /><span>{units === 'metric' ? selected.windSpeedKmh : selected.windSpeedMph} {units === 'metric' ? 'km/h' : 'mph'} {selected.windDirectionText}</span></div>
        <div className="simple-timeline-stat"><span className="simple-timeline-score-dot" style={{ backgroundColor: scoreColor(selected.huntScore) }} /> <strong>{selected.huntScore}</strong><span>/100</span></div>
        <button type="button" className="simple-timeline-step" onClick={() => onSelectHour(Math.max(0, safeHour - 1))} aria-label="Previous hour"><ChevronLeft size={17} /></button>
        <button type="button" className="simple-timeline-step" onClick={() => onSelectHour(Math.min(maxHour, safeHour + 1))} aria-label="Next hour"><ChevronRight size={17} /></button>
      </div>
    </section>
  );
};

export interface SimpleFloatingHourlySliderProps {
  hourly: HourlyForecast[];
  selectedHour: number;
  onSelectHour: (hour: number) => void;
  dayLabel?: string;
}

export const SimpleFloatingHourlySlider: React.FC<SimpleFloatingHourlySliderProps> = ({ hourly, selectedHour, onSelectHour, dayLabel }) => {
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());
  const maxHour = Math.max(0, Math.min(23, hourly.length - 1));
  const safeHour = Math.max(0, Math.min(maxHour, selectedHour));
  const selected = hourly[safeHour];

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentHour(new Date().getHours()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!selected || hourly.length === 0) return null;

  return (
    <div className="simple-floating-hourly" aria-label="Simple mode floating hourly slider">
      <div className="simple-floating-hourly-header"><span>Hourly movement{dayLabel ? ` · ${dayLabel}` : ''}</span><strong>{hourLabel(safeHour)} · {selected.huntScore} / 100</strong></div>
      <div className="simple-floating-hourly-rail">
        <div className="simple-floating-hourly-segments" aria-hidden="true">
          {hourly.map((item, index) => <span key={index} style={{ backgroundColor: scoreColor(item.huntScore), opacity: index === safeHour ? 1 : .72 }} />)}
        </div>
        <div className="simple-floating-hourly-thumb" style={{ left: `${(safeHour / Math.max(1, maxHour)) * 100}%`, backgroundColor: scoreColor(selected.huntScore) }} />
        <input type="range" min={0} max={maxHour} step={1} value={safeHour} onChange={(event) => onSelectHour(parseInt(event.target.value, 10))} aria-label="Choose an hourly movement score" />
      </div>
      <div className="simple-floating-hourly-labels"><span>12 AM</span><span>Dawn</span><span>Midday</span><span>Dusk</span><span>{currentHour === safeHour ? 'Live now' : '12 AM'}</span></div>
    </div>
  );
};

export const SimpleDashboard: React.FC<SimpleDashboardProps> = ({
  day,
  forecast,
  location,
  units,
  pressureUnit,
  selectedHour,
  onSelectHour,
  onSelectDate,
}) => {
  const hourly = day.hourly || [];
  const safeSelectedHour = hourly.length > 0 ? Math.max(0, Math.min(hourly.length - 1, selectedHour)) : 0;
  const hour = hourly[safeSelectedHour];
  const score = hour?.huntScore ?? day.huntScore;
  const tone = getScoreTone(score);
  const rating = score >= 90 ? 'Great' : score >= 76 ? 'Good' : score >= 46 ? 'Fair' : 'Poor';
  const weather = getWeatherDetails(hour?.weatherCode ?? day.weatherCode);
  const strongestFactor = useMemo(() => day.factors?.filter((factor) => factor.score > 0).sort((a, b) => b.score - a.score)[0], [day.factors]);
  const cautionFactor = useMemo(() => day.factors?.filter((factor) => factor.score < 0).sort((a, b) => a.score - b.score)[0], [day.factors]);

  return (
    <div className="simple-dashboard simple-dashboard-pro">
      <section className="simple-pro-topbar">
        <div className="simple-pro-identity">
          <div className="simple-pro-deer-mark"><DeerIcon className="simple-pro-deer" /></div>
          <div><p className="simple-eyebrow">Hunt brief · {day.dayName} · {day.dateFormatted}</p><h1>Today's hunt plan</h1><p><Compass size={14} /> {location.name}{location.admin1 ? `, ${location.admin1}` : ''}</p></div>
        </div>
      </section>

      <section className={`simple-pro-hero ${tone}`}>
        <div className="simple-pro-hero-main">
          <div className={`simple-pro-score ${tone}`} aria-label={`Hunt score ${score}`}>
            <svg className="simple-pro-score-orbit" viewBox="0 0 180 180" aria-hidden="true">
              <circle cx="90" cy="90" r="68" className="simple-pro-score-track" />
              <circle
                cx="90"
                cy="90"
                r="68"
                className="simple-pro-score-progress"
                stroke={scoreColor(score)}
                strokeDasharray={`${2 * Math.PI * 68}`}
                strokeDashoffset={`${2 * Math.PI * 68 * (1 - score / 100)}`}
              />
              {Array.from({ length: 12 }).map((_, index) => {
                const angle = (index / 12) * 360;
                return <circle key={index} cx="90" cy="14" r="1.8" className="simple-pro-score-tick" transform={`rotate(${angle} 90 90)`} />;
              })}
            </svg>
            <div className="simple-pro-score-content">
              <DeerIcon className="simple-pro-score-deer" />
              <strong>{score}</strong>
            </div>
          </div>
          <div className="simple-pro-hero-copy">
            <div className={`simple-pro-status ${tone}`}><i /> {getScoreLabel(score)}</div>
            <h2>{rating} time to hunt</h2>
            <p>{day.verdict.replace(/^[^.!?]*[.!?]\s*/, '') || 'Use the best windows below and keep your approach simple.'}</p>
            <div className="simple-pro-quick-stats">
              <span className="simple-pro-hero-weather">
                {weatherIcon(weather.icon, 'simple-pro-weather-icon')}
                <strong>{weather.desc}</strong>
                <small>{hour?.temp ?? day.maxTemp}{units === 'metric' ? '°C' : '°F'}</small>
              </span>
              <span><Wind size={14} /> {displayWind(day, units)}</span>
              <span><Droplets size={14} /> {day.precipSumMm > 0 ? `${Math.round(day.precipSumMm)} mm rain` : 'Dry woods'}</span>
            </div>
          </div>
        </div>
        <div className="simple-pro-brief-note">
          <Sparkles size={15} />
          <div><strong>Pro hunt tip</strong><span>{strongestFactor ? strongestFactor.description : cautionFactor ? cautionFactor.description : 'Watch wind direction and sit the edges of daylight.'}</span></div>
        </div>
      </section>

      <SimpleScoreGraph
        hourly={hourly}
        forecast={forecast}
        activeDate={day.date}
        selectedHour={safeSelectedHour}
        onSelectHour={onSelectHour}
        onSelectDate={onSelectDate}
        dayLabel={`${day.dayName} · ${day.dateFormatted}`}
      />
      <section className="simple-pro-grid">
        <div className="simple-pro-panel">
          <div className="simple-pro-panel-heading"><div><p className="simple-eyebrow">Best times to sit · {day.dayName}</p><h2>Be in the woods</h2></div><Sunrise size={19} /></div>
          <div className="simple-pro-window"><span className="simple-pro-window-icon morning"><Sunrise size={17} /></span><div><strong>Morning sit</strong><span>{day.morningPrime}</span></div><ArrowRight size={15} /></div>
          <div className="simple-pro-window"><span className="simple-pro-window-icon evening"><Sunset size={17} /></span><div><strong>Evening sit</strong><span>{day.eveningPrime}</span></div><ArrowRight size={15} /></div>
          <div className="simple-pro-window"><span className="simple-pro-window-icon moon"><Moon size={17} /></span><div><strong>Major moon window</strong><span>{day.solunar.major1}</span></div><Check size={15} /></div>
        </div>
        <div className="simple-pro-panel">
          <div className="simple-pro-panel-heading"><div><p className="simple-eyebrow">Woods check · {day.dayName}</p><h2>What to expect</h2></div><Gauge size={19} /></div>
          <div className="simple-pro-condition"><Wind size={17} /><span>Wind</span><strong>{displayWind(day, units)}</strong></div>
          <div className="simple-pro-condition"><Droplets size={17} /><span>Rain</span><strong>{day.precipSumMm > 0 ? `${Math.round(day.precipSumMm)} mm expected` : 'No rain expected'}</strong></div>
          <div className="simple-pro-condition"><Gauge size={17} /><span>Pressure</span><strong>{pressureUnit === 'hPa' ? `${Math.round(day.pressureAvgHpa)} hPa` : `${day.pressureAvgInHg.toFixed(2)} inHg`} · {day.pressureTrend.replace('_', ' ')}</strong></div>
        </div>
      </section>


      <p className="simple-pro-footer"><DeerIcon className="simple-pro-footer-deer" /> Built for the quiet hour before the woods wake up.</p>
      <SimpleFloatingHourlySlider hourly={hourly} selectedHour={safeSelectedHour} onSelectHour={onSelectHour} dayLabel={`${day.dayName} · ${day.dateFormatted}`} />
    </div>
  );
};
