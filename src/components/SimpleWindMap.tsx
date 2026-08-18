import React from 'react';
import { LocateFixed, MapPin, Wind } from 'lucide-react';
import { HourlyForecast, Location, UnitSystem } from '../types';
import { getHour12Label } from '../utils/huntingEngine';

interface SimpleWindMapProps {
  location: Location;
  hour: HourlyForecast;
  hourIndex: number;
  dayLabel: string;
  units: UnitSystem;
}

const getSvgArcPath = (cx: number, cy: number, radius: number, startAngle: number, endAngle: number) => {
  const startRad = ((startAngle - 90) * Math.PI) / 180;
  const endRad = ((endAngle - 90) * Math.PI) / 180;
  const x1 = cx + radius * Math.cos(startRad);
  const y1 = cy + radius * Math.sin(startRad);
  const x2 = cx + radius * Math.cos(endRad);
  const y2 = cy + radius * Math.sin(endRad);
  const angleDiff = (endAngle - startAngle + 360) % 360;
  const largeArcFlag = angleDiff <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
};

const latLngToTileCoords = (lat: number, lng: number, zoom: number) => {
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const scale = 2 ** zoom;
  const latRad = (clampedLat * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale,
  };
};

export const SimpleWindMap: React.FC<SimpleWindMapProps> = ({ location, hour, hourIndex, dayLabel, units }) => {
  const windFrom = ((hour.windDirectionDeg % 360) + 360) % 360;
  const downwind = (windFrom + 180) % 360;
  const radius = Math.min(126, 78 + Math.max(0, hour.windSpeedMph) * 2.4);
  const spread = hour.windSpeedMph >= 18 || (hour.windGustMph ?? 0) >= 25 ? 62 : 46;
  const startAngle = downwind - spread / 2;
  const endAngle = downwind + spread / 2;
  const centerX = 180;
  const centerY = 116;
  const arrowLength = Math.min(58, Math.max(34, hour.windSpeedMph * 3));
  const arrowRad = (downwind * Math.PI) / 180;
  const arrowX = centerX + Math.sin(arrowRad) * arrowLength;
  const arrowY = centerY - Math.cos(arrowRad) * arrowLength;
  const windSpeed = units === 'metric' ? hour.windSpeedKmh : hour.windSpeedMph;
  const windUnit = units === 'metric' ? 'km/h' : 'mph';
  const mapLabel = `${dayLabel}, ${getHour12Label(hourIndex)}. Scent blowing toward ${hour.windDirectionText} at ${windSpeed} ${windUnit}.`;
  const tileZoom = 13;
  const centerTile = latLngToTileCoords(location.latitude, location.longitude, tileZoom);
  const tileCount = 2 ** tileZoom;
  const mapTiles = [];
  for (let tileX = Math.floor(centerTile.x) - 1; tileX <= Math.floor(centerTile.x) + 1; tileX += 1) {
    for (let tileY = Math.floor(centerTile.y) - 1; tileY <= Math.floor(centerTile.y) + 1; tileY += 1) {
      if (tileY < 0 || tileY >= tileCount) continue;
      const wrappedX = ((tileX % tileCount) + tileCount) % tileCount;
      mapTiles.push({
        key: `${tileX}-${tileY}`,
        url: `https://tile.openstreetmap.org/${tileZoom}/${wrappedX}/${tileY}.png`,
        x: centerX + (tileX - centerTile.x) * 256,
        y: centerY + (tileY - centerTile.y) * 256,
      });
    }
  }

  return (
    <section className="simple-wind-card" aria-label={`Wind and scent map for ${mapLabel}`}>
      <div className="simple-wind-card-header">
        <div className="simple-wind-card-title">
          <div className="simple-wind-card-icon"><Wind size={17} /></div>
          <div>
            <p className="simple-eyebrow">Wind & scent · {dayLabel}</p>
            <h2>Know your downwind</h2>
          </div>
        </div>
        <div className="simple-wind-card-reading">
          <strong>{windSpeed} {windUnit}</strong>
          <span>{hour.windDirectionText} wind · {getHour12Label(hourIndex)}</span>
        </div>
      </div>

      <div className="simple-wind-map" role="img" aria-label={mapLabel}>
        <div className="simple-wind-map-grid" aria-hidden="true" />
        <svg viewBox="0 0 360 230" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="simple-scent-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#e78858" stopOpacity=".46" />
              <stop offset="55%" stopColor="#d97755" stopOpacity=".22" />
              <stop offset="100%" stopColor="#d97755" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="simple-location-glow">
              <stop offset="0%" stopColor="#2f8f68" stopOpacity=".34" />
              <stop offset="100%" stopColor="#2f8f68" stopOpacity="0" />
            </radialGradient>
          </defs>

          <g className="simple-wind-tiles">
            {mapTiles.map((tile) => <image key={tile.key} href={tile.url} x={tile.x} y={tile.y} width="256" height="256" preserveAspectRatio="none" />)}
          </g>
          <path className="simple-wind-terrain" d="M-12 54 C48 22 86 79 135 52 S235 23 372 61" />
          <path className="simple-wind-terrain" d="M-18 176 C44 134 88 193 145 163 S253 126 380 171" />
          <path className="simple-wind-terrain faint" d="M20 4 C74 43 91 8 142 29 S253 83 350 28" />
          <path className="simple-wind-creek" d="M12 211 C83 180 93 210 143 184 S254 177 348 127" />
          <path className="simple-wind-trail" d="M30 28 C84 74 111 88 158 111 S219 161 326 198" />
          <path className="simple-wind-field" d="M35 149 L88 119 L131 139 L116 187 L62 194 Z" />
          <path className="simple-wind-field second" d="M245 34 L319 46 L337 92 L281 106 L229 79 Z" />

          <path
            className="simple-wind-scent-cone"
            d={getSvgArcPath(centerX, centerY, radius, startAngle, endAngle)}
            transform="translate(0 0)"
          />
          <path
            className="simple-wind-scent-edge"
            d={getSvgArcPath(centerX, centerY, radius * .72, startAngle, endAngle)}
          />
          <circle cx={centerX} cy={centerY} r="38" fill="url(#simple-location-glow)" />
          <line className="simple-wind-arrow-line" x1={centerX} y1={centerY} x2={arrowX} y2={arrowY} />
          <path
            className="simple-wind-arrow-head"
            d={`M ${arrowX} ${arrowY} l -6 8 M ${arrowX} ${arrowY} l 8 -3`}
          />
          <circle className="simple-wind-location-ring" cx={centerX} cy={centerY} r="15" />
          <circle className="simple-wind-location-dot" cx={centerX} cy={centerY} r="6" />
        </svg>

        <div className="simple-wind-map-compass" aria-hidden="true"><span>N</span><span>E</span><span>S</span><span>W</span></div>
        <div className="simple-wind-map-location"><MapPin size={13} /><span>{location.name}</span></div>
        <div className="simple-wind-map-downwind"><LocateFixed size={12} /><span>Downwind · {hour.windDirectionText}</span></div>
        <span className="simple-wind-map-attribution">© OpenStreetMap</span>
      </div>

      <div className="simple-wind-card-footer">
        <span><i className="simple-wind-legend-scent" /> Your scent is carrying toward <strong>{hour.windDirectionText}</strong></span>
        <span>{location.latitude.toFixed(3)}°, {location.longitude.toFixed(3)}° · {Math.round(hour.windGustMph ?? hour.windSpeedMph)} mph gusts</span>
      </div>
    </section>
  );
};
