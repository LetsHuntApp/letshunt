import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie } from 'recharts';
import { Wind, Thermometer, CloudRain, Gauge, Moon, Calendar, Clock, BarChart3 } from 'lucide-react';
import { ThemeMode } from '../types';
import { AnalyticsData } from '../services/trailCameraService';

interface TrailCameraAnalyticsProps {
  theme: ThemeMode;
  analytics: AnalyticsData;
}

const BAR_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'];

export const TrailCameraAnalytics: React.FC<TrailCameraAnalyticsProps> = ({
  theme,
  analytics,
}) => {
  const isDark = theme === 'dark';

  if (analytics.totalPhotos === 0) {
    return (
      <div className="text-center py-16 space-y-3 opacity-60">
        <BarChart3 className="w-12 h-12 mx-auto text-emerald-500" />
        <h3 className="text-base font-extrabold">No Analytics Available Yet</h3>
        <p className="text-xs max-w-sm mx-auto">
          Import trail camera photos to automatically unlock historical weather analytics, activity charts, and hunting patterns.
        </p>
      </div>
    );
  }

  const cardStyle = `rounded-2xl border p-4 sm:p-5 backdrop-blur-xl shadow-xl space-y-3 ${
    isDark
      ? 'bg-slate-900/80 border-slate-800 text-slate-100'
      : theme === 'hunting'
      ? 'bg-[#eae1cf] border-[#d4c4a8] text-[#2a1b0e]'
      : (theme === 'olive' || theme === 'hunting')
      ? 'bg-[#f7f5ed] border-[#d8d2c0] text-[#1e2e1b]'
      : 'bg-white border-slate-200 text-slate-900'
  }`;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-950 text-white border border-slate-700 p-2 rounded-xl text-xs font-bold shadow-2xl">
          <div>{label || payload[0].name}</div>
          <div className="text-emerald-400">{payload[0].value} photos</div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Top Overview Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={cardStyle}>
          <div className="text-xs font-bold opacity-70">Total Photos</div>
          <div className="text-xl sm:text-2xl font-black text-emerald-500">{analytics.totalPhotos}</div>
        </div>
        <div className={cardStyle}>
          <div className="text-xs font-bold opacity-70">Weather Matched</div>
          <div className="text-xl sm:text-2xl font-black text-sky-400">{analytics.withWeather}</div>
        </div>
        <div className={cardStyle}>
          <div className="text-xs font-bold opacity-70">Top Active Hour</div>
          <div className="text-base sm:text-lg font-black text-amber-400 truncate">
            {analytics.byHourOfDay.slice().sort((a, b) => b.count - a.count)[0]?.name || 'N/A'}
          </div>
        </div>
        <div className={cardStyle}>
          <div className="text-xs font-bold opacity-70">Top Active Month</div>
          <div className="text-base sm:text-lg font-black text-purple-400 truncate">
            {analytics.byMonth.slice().sort((a, b) => b.count - a.count)[0]?.name || 'N/A'}
          </div>
        </div>
      </div>

      {/* Grid of Visual Summary Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Hour of Day Activity */}
        <div className={cardStyle}>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-500" />
            <h3 className="font-extrabold text-xs uppercase tracking-wider">Activity by Hour of Day</h3>
          </div>
          <div className="h-48 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.byHourOfDay} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} interval={3} />
                <YAxis stroke="#94a3b8" fontSize={10} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. Wind Direction */}
        <div className={cardStyle}>
          <div className="flex items-center gap-2">
            <Wind className="w-4 h-4 text-sky-400" />
            <h3 className="font-extrabold text-xs uppercase tracking-wider">Photos by Wind Direction</h3>
          </div>
          <div className="h-48 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.byWindDirection} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} interval={1} />
                <YAxis stroke="#94a3b8" fontSize={10} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. Temperature Range */}
        <div className={cardStyle}>
          <div className="flex items-center gap-2">
            <Thermometer className="w-4 h-4 text-rose-400" />
            <h3 className="font-extrabold text-xs uppercase tracking-wider">Photos by Temperature Range</h3>
          </div>
          <div className="h-48 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.byTemperatureRange} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} />
                <YAxis stroke="#94a3b8" fontSize={10} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 4. Barometric Pressure Range */}
        <div className={cardStyle}>
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-amber-400" />
            <h3 className="font-extrabold text-xs uppercase tracking-wider">Photos by Barometric Pressure</h3>
          </div>
          <div className="h-48 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.byPressureRange} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={8} />
                <YAxis stroke="#94a3b8" fontSize={10} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 5. Moon Phase */}
        <div className={cardStyle}>
          <div className="flex items-center gap-2">
            <Moon className="w-4 h-4 text-purple-400" />
            <h3 className="font-extrabold text-xs uppercase tracking-wider">Photos by Moon Phase</h3>
          </div>
          <div className="h-48 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.byMoonPhase} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={8} interval={0} angle={-20} textAnchor="end" height={35} />
                <YAxis stroke="#94a3b8" fontSize={10} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 6. Activity by Month */}
        <div className={cardStyle}>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <h3 className="font-extrabold text-xs uppercase tracking-wider">Photos by Month</h3>
          </div>
          <div className="h-48 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.byMonth} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} />
                <YAxis stroke="#94a3b8" fontSize={10} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 7. Weather Condition Breakdown */}
        <div className={`${cardStyle} md:col-span-2`}>
          <div className="flex items-center gap-2">
            <CloudRain className="w-4 h-4 text-blue-400" />
            <h3 className="font-extrabold text-xs uppercase tracking-wider">Photos by Weather Condition</h3>
          </div>
          <div className="h-56 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.byWeatherCondition.slice(0, 8)} margin={{ top: 5, right: 10, left: -10, bottom: 15 }}>
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} angle={-15} textAnchor="end" interval={0} />
                <YAxis stroke="#94a3b8" fontSize={10} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {analytics.byWeatherCondition.slice(0, 8).map((_, index) => (
                    <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
