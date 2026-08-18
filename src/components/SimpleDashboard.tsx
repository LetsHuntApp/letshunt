import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
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
  ShieldCheck,
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
import { SimpleWindMap } from './SimpleWindMap';
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
  units: UnitSystem;
  dayLabel?: string;
  forecast?: DailyForecast[];
  activeDate?: string;
  onSelectDate?: (date: string) => void;
}

export const SimpleScoreGraph: React.FC<SimpleScoreGraphProps> = ({ hourly, selectedHour, onSelectHour, units, dayLabel, forecast, activeDate, onSelectDate }) => {
  const tabDays = forecast?.slice(0, 14) || [];
  const activeTabDate = activeDate || tabDays[0]?.date;
  const tabDay = tabDays.find((item) => item.date === activeTabDate);
  const graphHourly = tabDay?.hourly || hourly;
  const graphDayLabel = tabDay ? `${tabDay.dayName} · ${tabDay.dateFormatted}` : dayLabel;
  const graphSelectedHour = graphHourly.length > 0 ? Math.max(0, Math.min(graphHourly.length - 1, selectedHour)) : 0;
  const selectedMetric = graphHourly[graphSelectedHour];
  const [showWeatherOverlay, setShowWeatherOverlay] = useState(false);
  const pressureValues = graphHourly.map((item) => item.pressureHpa);
  const pressureMin = pressureValues.length > 0 ? Math.min(...pressureValues) : 0;
  const pressureRange = Math.max(1, (pressureValues.length > 0 ? Math.max(...pressureValues) : 0) - pressureMin);
  const windMax = Math.max(1, ...graphHourly.map((item) => item.windSpeedMph));

  return (
    <div className="simple-graph" aria-label="Hourly movement score graph">
      <div className="simple-graph-heading">
        <div>
          <p className="simple-eyebrow">Deer movement by hour{graphDayLabel ? ` · ${graphDayLabel}` : ''}</p>
          <h3>When the woods come alive</h3>
        </div>
        <div className="simple-graph-legends">
          <div className="simple-score-legend" aria-label="Deer movement score legend">
            <span className="great"><i /> 90+</span>
            <span className="good"><i /> 76–89</span>
            <span className="fair"><i /> 46–75</span>
            <span className="poor"><i /> &lt;46</span>
          </div>
          <button
            type="button"
            className={`simple-weather-toggle ${showWeatherOverlay ? 'active' : ''}`}
            onClick={() => setShowWeatherOverlay((visible) => !visible)}
            aria-expanded={showWeatherOverlay}
          >
            <CloudSun size={14} />
            <span>{showWeatherOverlay ? 'Hide conditions' : 'Conditions'}</span>
            <ChevronDown size={13} className={showWeatherOverlay ? 'open' : ''} />
          </button>
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
        <div className="simple-bar-chart" role="img" aria-label="Hourly deer movement score graph">
          {graphHourly.map((item, index) => (
            <button
              key={index}
              type="button"
              className={`simple-bar-column ${index === graphSelectedHour ? 'selected' : ''}`}
              onClick={() => onSelectHour(index)}
              aria-label={`${hourLabel(index)}: deer movement score ${item.huntScore}`}
            >
              <span className="simple-bar-score">{item.huntScore}</span>
              <span className="simple-bar-track"><i style={{ height: `${Math.max(7, item.huntScore)}%`, backgroundColor: scoreColor(item.huntScore) }} /></span>
              <span className="simple-bar-label">{index % 3 === 0 ? hourLabel(index) : ''}</span>
            </button>
          ))}
        </div>
        {selectedMetric && <div className="simple-movement-readout" aria-live="polite">
          <span><i style={{ backgroundColor: scoreColor(selectedMetric.huntScore) }} /> Movement score <strong>{selectedMetric.huntScore}</strong></span>
        </div>}
        <div className="simple-graph-axis"><span>12 AM</span><span>Dawn</span><span>Midday</span><span>Dusk</span><span>12 AM</span></div>
      </div>
      {showWeatherOverlay && (
        <div className="simple-weather-overlay" aria-label="Optional weather conditions by hour">
          <div className="simple-weather-overlay-heading">
            <div><p className="simple-eyebrow">Optional field conditions</p><strong>Weather behind the movement</strong></div>
            <span>{selectedMetric ? `${hourLabel(graphSelectedHour)} selected` : 'Choose an hour'}</span>
          </div>
          <div className="simple-weather-overlay-rows">
            <div className="simple-weather-overlay-row">
              <strong>Rain</strong>
              <div className="simple-weather-overlay-cells">
                {graphHourly.map((item, index) => (
                  <button key={index} type="button" className={index === graphSelectedHour ? 'selected' : ''} onClick={() => onSelectHour(index)} aria-label={`${hourLabel(index)} rain chance ${item.precipProbability}%`}>
                    <i style={{ height: `${Math.max(4, item.precipProbability)}%` }} />
                    <small>{item.precipProbability}%</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="simple-weather-overlay-row">
              <strong>Wind</strong>
              <div className="simple-weather-overlay-cells">
                {graphHourly.map((item, index) => {
                  const speed = units === 'metric' ? item.windSpeedKmh : item.windSpeedMph;
                  return <button key={index} type="button" className={index === graphSelectedHour ? 'selected' : ''} onClick={() => onSelectHour(index)} aria-label={`${hourLabel(index)} wind ${speed} ${units === 'metric' ? 'kilometers per hour' : 'miles per hour'} ${item.windDirectionText}`}><i style={{ width: `${Math.max(4, (item.windSpeedMph / windMax) * 100)}%` }} /><small>{Math.round(speed)}</small></button>;
                })}
              </div>
            </div>
            <div className="simple-weather-overlay-row">
              <strong>Baro</strong>
              <div className="simple-weather-overlay-cells">
                {graphHourly.map((item, index) => {
                  const pressureHeight = ((item.pressureHpa - pressureMin) / pressureRange) * 76 + 24;
                  return <button key={index} type="button" className={index === graphSelectedHour ? 'selected' : ''} onClick={() => onSelectHour(index)} aria-label={`${hourLabel(index)} pressure ${Math.round(item.pressureHpa)} hectopascals`}><i style={{ height: `${pressureHeight}%` }} /><small>{Math.round(item.pressureHpa)}</small></button>;
                })}
              </div>
            </div>
          </div>
        </div>
      )}
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
  const [showFactors, setShowFactors] = useState(false);
  const currentHourSummary = useMemo(() => {
    const movement = score >= 90 ? 'Deer movement looks great' : score >= 76 ? 'Deer movement looks good' : score >= 46 ? 'Deer movement looks fair' : 'Deer movement is slow';
    if (!hour) {
      return {
        subtitle: `${weather.desc}. ${movement} right now.`,
        tip: strongestFactor?.description || cautionFactor?.description || 'Watch the wind and stay on the edges of daylight.',
      };
    }

    const windSpeed = units === 'metric' ? hour.windSpeedKmh : hour.windSpeedMph;
    const windUnit = units === 'metric' ? 'km/h' : 'mph';
    const wind = `${windSpeed} ${windUnit} ${hour.windDirectionText} wind`;
    const precipitation = hour.precipProbability >= 60
      ? `${hour.precipProbability}% chance of rain`
      : hour.precipMm > 0.2
      ? 'rain in the woods'
      : 'dry woods';
    const pressureTrend = hour.pressureTrend || day.pressureTrend;
    const pressure = pressureTrend === 'rapid_rise' || pressureTrend === 'rising'
      ? 'barometer rising'
      : pressureTrend === 'rapid_drop' || pressureTrend === 'falling'
      ? 'barometer falling'
      : 'steady barometer';

    let tip = `${movement} right now. Stay settled and keep your approach quiet.`;
    if (hour.precipProbability >= 60 || hour.precipMm > 0.2) {
      tip = 'Rain is in the mix this hour. Hunt the breaks between showers and keep your scent gear dry.';
    } else if ((hour.windGustMph ?? 0) >= 25) {
      tip = 'Gusts are making the woods noisy this hour. Get tight to cover and favor a sheltered setup.';
    } else if (hour.windSpeedMph >= 18) {
      tip = 'Wind is up this hour. Tuck into cover and make sure your downwind side is clean.';
    } else if (pressureTrend === 'rapid_rise' || pressureTrend === 'rising') {
      tip = 'The barometer is climbing this hour. Be settled early and watch the downwind edge.';
    } else if (pressureTrend === 'rapid_drop' || pressureTrend === 'falling') {
      tip = 'The barometer is slipping this hour. Stay patient near food and bedding edges.';
    } else if (hour.isPrimeWindow || score >= 76) {
      tip = 'This is a solid movement window. Stay put, keep still, and let the woods work.';
    } else if (score < 46) {
      tip = 'Movement is slow this hour. Stay mobile if the wind allows and watch for the next window.';
    }

    return {
      subtitle: `${weather.desc} with ${wind}, ${precipitation}, and a ${pressure}. ${movement} right now.`,
      tip,
    };
  }, [cautionFactor, day.pressureTrend, hour, score, strongestFactor, units, weather.desc]);

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
            <p>{currentHourSummary.subtitle}</p>
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
          <div><strong>Pro hunt tip</strong><span>{currentHourSummary.tip}</span></div>
        </div>
      </section>

      <SimpleScoreGraph
        hourly={hourly}
        forecast={forecast}
        activeDate={day.date}
        selectedHour={safeSelectedHour}
        onSelectHour={onSelectHour}
        units={units}
        onSelectDate={onSelectDate}
        dayLabel={`${day.dayName} · ${day.dateFormatted}`}
      />
      {hour && <SimpleWindMap location={location} hour={hour} hourIndex={safeSelectedHour} dayLabel={`${day.dayName} · ${day.dateFormatted}`} units={units} />}
      <section className="simple-pro-grid">
        <div className="simple-pro-panel">
          <div className="simple-pro-panel-heading"><div><p className="simple-eyebrow">Best times to sit · {day.dayName}</p><h2>Be in the woods</h2></div><Sunrise size={19} /></div>
          <div className="simple-pro-window"><span className="simple-pro-window-icon morning"><Sunrise size={17} /></span><div><strong>Morning sit</strong><span>{day.morningPrime}</span></div></div>
          <div className="simple-pro-window"><span className="simple-pro-window-icon evening"><Sunset size={17} /></span><div><strong>Evening sit</strong><span>{day.eveningPrime}</span></div></div>
          <div className="simple-pro-window"><span className="simple-pro-window-icon moon"><Moon size={17} /></span><div><strong>Major moon window</strong><span>{day.solunar.major1}</span></div></div>
        </div>
        <div className="simple-pro-panel">
          <div className="simple-pro-panel-heading"><div><p className="simple-eyebrow">Woods check · {day.dayName}</p><h2>What to expect</h2></div><Gauge size={19} /></div>
          <div className="simple-pro-condition"><Wind size={17} /><span>Wind</span><strong>{displayWind(day, units)}</strong></div>
          <div className="simple-pro-condition"><Droplets size={17} /><span>Rain</span><strong>{day.precipSumMm > 0 ? `${Math.round(day.precipSumMm)} mm expected` : 'No rain expected'}</strong></div>
          <div className="simple-pro-condition"><Gauge size={17} /><span>Pressure</span><strong>{pressureUnit === 'hPa' ? `${Math.round(day.pressureAvgHpa)} hPa` : `${day.pressureAvgInHg.toFixed(2)} inHg`} · {day.pressureTrend.replace('_', ' ')}</strong></div>
          <button type="button" className="simple-pro-factor-button" onClick={() => setShowFactors((visible) => !visible)} aria-expanded={showFactors}>
            <ShieldCheck size={16} />
            <span><strong>{showFactors ? 'Hide movement factors' : 'View movement factors'}</strong><small>{day.dayName} · {day.dateFormatted}</small></span>
            <ChevronDown size={16} className={showFactors ? 'open' : ''} />
          </button>
        </div>
      </section>

      {showFactors && (
        <section className="simple-pro-panel simple-pro-factors" aria-label={`Movement factors for ${day.dayName} ${day.dateFormatted}`}>
          <div className="simple-pro-panel-heading"><div><p className="simple-eyebrow">Movement factors · {day.dayName}</p><h2>Why deer may move</h2></div><ShieldCheck size={19} /></div>
          <div className="simple-pro-factor-grid">
            {day.factors.slice(0, 6).map((factor) => {
              const factorTone = factor.score > 0 ? 'positive' : factor.score < 0 ? 'negative' : 'neutral';
              return <div key={factor.name} className={`simple-pro-factor ${factorTone}`}><div><strong>{factor.name}</strong><span>{factor.score > 0 ? '+' : ''}{factor.score} signal</span></div><p>{factor.description}</p></div>;
            })}
          </div>
        </section>
      )}

      <p className="simple-pro-footer"><DeerIcon className="simple-pro-footer-deer" /> Built for the quiet hour before the woods wake up.</p>
      <SimpleFloatingHourlySlider hourly={hourly} selectedHour={safeSelectedHour} onSelectHour={onSelectHour} dayLabel={`${day.dayName} · ${day.dateFormatted}`} />
    </div>
  );
};
