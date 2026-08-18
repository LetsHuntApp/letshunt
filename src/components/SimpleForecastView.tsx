import React from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Gauge, Map, Settings, ShieldCheck, Wind } from 'lucide-react';
import { DailyForecast, Location, PressureUnit, UnitSystem } from '../types';
import { DeerIcon } from './DeerIcon';
import { SimpleFloatingHourlySlider, SimpleHourlyTimeline, SimpleScoreGraph } from './SimpleDashboard';
import { getPeakHuntScore, getWeatherDetails, isPrimeDay } from '../utils/huntingEngine';

interface SimpleForecastViewProps {
  day: DailyForecast;
  forecast: DailyForecast[];
  location: Location;
  units: UnitSystem;
  pressureUnit: PressureUnit;
  selectedDate: string;
  selectedHour: number;
  onSelectDate: (date: string) => void;
  onSelectHour: (hour: number) => void;
  onBack: () => void;
  onOpenMap: () => void;
  onOpenSettings: () => void;
}

const toneForScore = (score: number) => score >= 90 ? 'great' : score >= 76 ? 'good' : score >= 46 ? 'fair' : 'poor';
const scoreColorFor = (score: number) => score >= 90 ? '#2f8f68' : score >= 76 ? '#69a86f' : score >= 46 ? '#d38a3a' : '#c45b53';

export const SimpleForecastView: React.FC<SimpleForecastViewProps> = ({
  day,
  forecast,
  location,
  units,
  pressureUnit,
  selectedDate,
  selectedHour,
  onSelectDate,
  onSelectHour,
  onBack,
  onOpenMap,
  onOpenSettings,
}) => {
  const score = day.hourly?.[selectedHour]?.huntScore ?? day.huntScore;
  const tone = toneForScore(score);

  return (
    <div className="simple-full-forecast">
      <header className="simple-full-header">
        <button type="button" className="simple-full-back" onClick={onBack}><ArrowLeft size={16} /> <span>Back to today</span></button>
        <div className="simple-full-header-title"><DeerIcon /><div><p className="simple-eyebrow">Simple mode</p><h1>Full hunt forecast</h1></div></div>
        <div className="simple-full-header-actions"><button type="button" onClick={onOpenMap}><Map size={16} /><span>Map</span></button><button type="button" onClick={onOpenSettings}><Settings size={16} /><span>Settings</span></button></div>
      </header>

      <section className={`simple-full-hero ${tone}`}>
        <div className="simple-full-hero-heading"><div><p className="simple-eyebrow">{day.dayName} · {day.dateFormatted}</p><h2>{location.name} movement forecast</h2><p>{day.verdict}</p></div><div className="simple-full-score" style={{ '--simple-full-score': scoreColorFor(score) } as React.CSSProperties}><DeerIcon /><strong>{score}</strong><span>{day.rating} movement</span></div></div>
        <div className="simple-full-summary"><span><Gauge size={15} /> {pressureUnit === 'hPa' ? `${Math.round(day.pressureAvgHpa)} hPa` : `${day.pressureAvgInHg.toFixed(2)} inHg`} {day.pressureTrend.replace('_', ' ')}</span><span><Wind size={15} /> {units === 'metric' ? day.windSpeedMaxKmh : day.windSpeedMaxMph} {units === 'metric' ? 'km/h' : 'mph'} {day.windDirectionText}</span><span><ShieldCheck size={15} /> {day.morningPrime} / {day.eveningPrime}</span></div>
      </section>

      <SimpleScoreGraph hourly={day.hourly || []} selectedHour={selectedHour} onSelectHour={onSelectHour} />
      <SimpleHourlyTimeline hourly={day.hourly || []} units={units} selectedHour={selectedHour} onSelectHour={onSelectHour} />

      <section className="simple-full-section">
        <div className="simple-full-section-heading"><div><p className="simple-eyebrow">Forecast calendar</p><h2>Choose a day</h2></div><CalendarDays size={19} /></div>
        <div className="simple-full-day-list">
          {forecast.map((item) => {
            const itemScore = getPeakHuntScore(item);
            const itemTone = toneForScore(itemScore);
            return (
              <button key={item.date} type="button" className={`simple-full-day-card ${item.date === selectedDate ? 'active' : ''} ${itemTone}`} onClick={() => onSelectDate(item.date)}>
                <span className="simple-full-day-name">{item.dayName}<small>{item.dateFormatted}</small></span>
                <span className="simple-full-day-weather">{getWeatherDetails(item.weatherCode).desc}<small>{item.minTemp}° — {item.maxTemp}°</small></span>
                <span className="simple-full-day-score"><i style={{ backgroundColor: scoreColorFor(itemScore) }} /> {itemScore}<small>{isPrimeDay(itemScore) ? 'Prime' : item.rating}</small></span>
                <ArrowRight size={15} />
              </button>
            );
          })}
        </div>
      </section>

      <section className="simple-full-section">
        <div className="simple-full-section-heading"><div><p className="simple-eyebrow">Why this score</p><h2>Field factors</h2></div><ShieldCheck size={19} /></div>
        <div className="simple-full-factor-grid">
          {day.factors.slice(0, 6).map((factor) => {
            const factorTone = factor.score > 0 ? 'positive' : factor.score < 0 ? 'negative' : 'neutral';
            return <div key={factor.name} className={`simple-full-factor ${factorTone}`}><div><strong>{factor.name}</strong><span>{factor.score > 0 ? '+' : ''}{factor.score} signal</span></div><p>{factor.description}</p></div>;
          })}
        </div>
      </section>

      <SimpleFloatingHourlySlider hourly={day.hourly || []} selectedHour={selectedHour} onSelectHour={onSelectHour} />
    </div>
  );
};
