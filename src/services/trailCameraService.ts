import { TrailCameraPhoto, TrailCameraFilterState, HistoricalWeatherData, TrailCameraLocation, TrailCameraTarget } from '../types';

const DB_NAME = 'LetsHuntTrailCams';
const DB_VERSION = 2;
const PHOTOS_STORE = 'photos';
const FULL_IMAGES_STORE = 'fullImages';
const WEATHER_CACHE_STORE = 'weatherCache';
const LOCATIONS_STORE = 'cameraLocations';
const TARGETS_STORE = 'targets';
const ANALYTICS_CACHE_STORE = 'analyticsCache';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PHOTOS_STORE)) {
        const store = db.createObjectStore(PHOTOS_STORE, { keyPath: 'id' });
        store.createIndex('dateTime', 'dateTime', { unique: false });
        store.createIndex('cameraLocationId', 'cameraLocationId', { unique: false });
        store.createIndex('isFavorite', 'isFavorite', { unique: false });
        store.createIndex('importedAt', 'importedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(FULL_IMAGES_STORE)) {
        db.createObjectStore(FULL_IMAGES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(WEATHER_CACHE_STORE)) {
        const store = db.createObjectStore(WEATHER_CACHE_STORE, { keyPath: 'cacheKey' });
        store.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains(LOCATIONS_STORE)) {
        db.createObjectStore(LOCATIONS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(TARGETS_STORE)) {
        db.createObjectStore(TARGETS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(ANALYTICS_CACHE_STORE)) {
        db.createObjectStore(ANALYTICS_CACHE_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllFromStore<T>(storeName: string): Promise<T[]> {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  }));
}

function getFromStore<T>(storeName: string, id: string): Promise<T | undefined> {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  }));
}

function putInStore(storeName: string, value: any): Promise<void> {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function deleteFromStore(storeName: string, id: string): Promise<void> {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

// ---- Moon Phase Calculation ----
const MOON_PHASE_NAMES = [
  'New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
  'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent',
];

export function getMoonPhase(date: Date): { phase: number; illumination: number; name: string } {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  let c = 0;
  let e = 0;
  let jd = 0;
  if (month <= 2) {
    c = year;
    e = 0;
  } else {
    c = year;
    e = 0;
  }
  if (month <= 2) {
    jd = 365.25 * (year + 4716) + Math.floor(30.6001 * (month + 12)) + day - 1524.5;
  } else {
    jd = 365.25 * (year + 4716) + Math.floor(30.6001 * (month + 1)) + day - 1524.5;
  }
  const daysSinceNew = jd - 2451549.5;
  const newMoons = daysSinceNew / 29.53058867;
  const phase = newMoons - Math.floor(newMoons);
  const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const index = Math.round(phase * 8) % 8;
  return { phase, illumination: Math.round(illumination * 100), name: MOON_PHASE_NAMES[index] };
}

// ---- EXIF Parsing (robust) ----
function parseEXIFDate(buffer: ArrayBuffer): { dateTime?: string; cameraModel?: string; latitude?: number; longitude?: number } | undefined {
  try {
    const dv = new DataView(buffer);
    if (dv.byteLength < 4) return;

    // Scan for "Exif\0\0" marker inside JPEG APP1 segments
    let tiffStart = -1;
    if (dv.getUint16(0) === 0xFFD8) {
      // JPEG: walk APP markers to find EXIF APP1
      let pos = 2;
      while (pos + 4 < dv.byteLength) {
        if (dv.getUint16(pos) === 0xFFE1) {
          const segLen = dv.getUint16(pos + 2);
          if (segLen >= 8 && pos + 8 <= dv.byteLength) {
            // Check for "Exif\0\0"
            if (dv.getUint8(pos + 4) === 0x45 && dv.getUint8(pos + 5) === 0x78 &&
                dv.getUint8(pos + 6) === 0x69 && dv.getUint8(pos + 7) === 0x66 &&
                dv.getUint8(pos + 8) === 0x00 && dv.getUint8(pos + 9) === 0x00) {
              tiffStart = pos + 10;
              break;
            }
          }
          pos += 2 + segLen;
        } else if ((dv.getUint16(pos) & 0xFF00) === 0xFF00 && dv.getUint16(pos) !== 0xFFFF) {
          // Another APP / DQT / SOF etc marker
          const markerLen = (dv.getUint16(pos + 2) || 0) + 2;
          pos += markerLen > 2 ? markerLen : 2;
        } else {
          break;
        }
      }
    } else {
      // Possibly a TIFF file or raw EXIF
      if (dv.getUint16(0) === 0x4949 || dv.getUint16(0) === 0x4D4D) {
        tiffStart = 0;
      }
    }

    if (tiffStart < 0 || tiffStart + 8 > dv.byteLength) return;

    const endianMarker = dv.getUint16(tiffStart + 2);
    const le = endianMarker === 0x4949;

    const read16 = (off: number) => le ? dv.getUint16(off, true) : dv.getUint16(off, false);
    const read32 = (off: number) => le ? dv.getUint32(off, true) : dv.getUint32(off, false);
    const readSrat = (off: number) => {
      const num = read32(off);
      const den = read32(off + 4);
      return den ? num / den : 0;
    };

    // Sanity-check IFD offset
    const ifdOffset = read32(tiffStart + 4);
    if (ifdOffset < 0 || ifdOffset + 2 > dv.byteLength - tiffStart) return;
    let offset = tiffStart + ifdOffset;
    const entries = read16(offset);
    if (entries < 1 || entries > 200) return; // sanity

    let dateTimeOriginal: string | undefined;
    let cameraModel: string | undefined;
    let gpsLat: number | undefined;
    let gpsLon: number | undefined;
    let gpsLatRef = 'N';
    let gpsLonRef = 'E';
    let gpsLatData: number[] = [];
    let gpsLonData: number[] = [];
    let gpsIfdOffset: number | undefined;

    for (let i = 0; i < entries; i++) {
      const entryOffset = offset + 2 + i * 12;
      if (entryOffset + 12 > dv.byteLength) break;
      const tag = read16(entryOffset);
      const type = read16(entryOffset + 2);
      const count = read32(entryOffset + 4);
      const valueOffset = entryOffset + 8;

      if (tag === 0x0132 && type === 2) {
        const strOff = count <= 4 ? valueOffset : tiffStart + read32(valueOffset);
        if (strOff + count <= dv.byteLength) {
          dateTimeOriginal = readString(dv, strOff, count);
        }
      } else if (tag === 0x0110 && type === 2) {
        const strOff = count <= 4 ? valueOffset : tiffStart + read32(valueOffset);
        if (strOff + count <= dv.byteLength) {
          cameraModel = readString(dv, strOff, count);
        }
      } else if (tag === 0x8825) {
        gpsIfdOffset = read32(valueOffset);
      } else if (tag === 0x8769) {
        const exifOffsetVal = read32(valueOffset);
        if (exifOffsetVal > 0 && tiffStart + exifOffsetVal + 2 <= dv.byteLength) {
          const exifEntries = read16(tiffStart + exifOffsetVal);
          if (exifEntries > 0 && exifEntries <= 200) {
            for (let j = 0; j < exifEntries; j++) {
              const exifEntryOff = tiffStart + exifOffsetVal + 2 + j * 12;
              if (exifEntryOff + 12 > dv.byteLength) break;
              const exifTag = read16(exifEntryOff);
              const exifType = read16(exifEntryOff + 2);
              const exifCount = read32(exifEntryOff + 4);
              const exifValOff = exifEntryOff + 8;

              if (exifTag === 0x9003 && exifType === 2) {
                const strOff = exifCount <= 4 ? exifValOff : tiffStart + read32(exifValOff);
                if (strOff + exifCount <= dv.byteLength) {
                  dateTimeOriginal = readString(dv, strOff, exifCount);
                }
              } else if (exifTag === 0x9004 && exifType === 2) {
                const strOff = exifCount <= 4 ? exifValOff : tiffStart + read32(exifValOff);
                if (strOff + exifCount <= dv.byteLength && !dateTimeOriginal) {
                  dateTimeOriginal = readString(dv, strOff, exifCount);
                }
              }
            }
          }
        }
      }
    }

    if (gpsIfdOffset != null) {
      if (tiffStart + gpsIfdOffset + 2 <= dv.byteLength) {
        const gpsEntries = read16(tiffStart + gpsIfdOffset);
        if (gpsEntries > 0 && gpsEntries <= 50) {
          for (let i = 0; i < gpsEntries; i++) {
            const gpsOff = tiffStart + gpsIfdOffset + 2 + i * 12;
            if (gpsOff + 12 > dv.byteLength) break;
            const gpsTag = read16(gpsOff);
            const gpsType = read16(gpsOff + 2);
            const gpsCount = read32(gpsOff + 4);
            const gpsValOff = gpsOff + 8;

            if (gpsTag === 0x0001) {
              gpsLatRef = gpsCount <= 4 ? String.fromCharCode(dv.getUint8(gpsValOff)) : String.fromCharCode(dv.getUint8(tiffStart + read32(gpsValOff)));
            } else if (gpsTag === 0x0002 && gpsType === 5) {
              const ptr = gpsCount <= 4 ? gpsValOff : tiffStart + read32(gpsValOff);
              if (ptr + 24 <= dv.byteLength) {
                for (let k = 0; k < 3; k++) {
                  gpsLatData.push(readSrat(ptr + k * 8));
                }
              }
            } else if (gpsTag === 0x0003) {
              gpsLonRef = gpsCount <= 4 ? String.fromCharCode(dv.getUint8(gpsValOff)) : String.fromCharCode(dv.getUint8(tiffStart + read32(gpsValOff)));
            } else if (gpsTag === 0x0004 && gpsType === 5) {
              const ptr = gpsCount <= 4 ? gpsValOff : tiffStart + read32(gpsValOff);
              if (ptr + 24 <= dv.byteLength) {
                for (let k = 0; k < 3; k++) {
                  gpsLonData.push(readSrat(ptr + k * 8));
                }
              }
            }
          }
        }
      }
    }

    if (gpsLatData.length >= 3) {
      gpsLat = gpsLatData[0] + gpsLatData[1] / 60 + gpsLatData[2] / 3600;
      if (gpsLatRef === 'S') gpsLat = -gpsLat;
    }
    if (gpsLonData.length >= 3) {
      gpsLon = gpsLonData[0] + gpsLonData[1] / 60 + gpsLonData[2] / 3600;
      if (gpsLonRef === 'W') gpsLon = -gpsLon;
    }

    let dateTimeISO: string | undefined;
    if (dateTimeOriginal) {
      const parts = dateTimeOriginal.split(' ');
      if (parts.length === 2) {
        const dateParts = parts[0].split(':');
        if (dateParts.length === 3) {
          dateTimeISO = `${dateParts[0]}-${dateParts[1]}-${dateParts[2]}T${parts[1]}:00`;
        }
      }
    }

    return { dateTime: dateTimeISO, cameraModel, latitude: gpsLat, longitude: gpsLon };
  } catch {
    return;
  }
}

function readString(dv: DataView, offset: number, length: number) {
  const chars: string[] = [];
  for (let i = 0; i < length; i++) {
    const c = dv.getUint8(offset + i);
    if (c === 0) break;
    chars.push(String.fromCharCode(c));
  }
  return chars.join('');
}

// ---- Thumbnail Generation ----
function generateThumbnail(file: File, maxWidth = 300): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        // Downscale in steps for very large images to avoid browser canvas limits
        const MAX_DIM = 4096;
        if (w > MAX_DIM || h > MAX_DIM) {
          const scale = MAX_DIM / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const scale = maxWidth / Math.max(w, h);
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          resolve(blob || null);
        }, 'image/jpeg', 0.7);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

// ---- Historical Weather ----
async function fetchHistoricalWeather(lat: number, lon: number, dateTimeStr: string): Promise<HistoricalWeatherData | null> {
  try {
    const d = new Date(dateTimeStr);
    if (isNaN(d.getTime())) return null;
    const dateStr = d.toISOString().split('T')[0];
    const targetHour = d.getHours();
    const now = new Date();
    const diffDays = (now.getTime() - d.getTime()) / (1000 * 3600 * 24);

    const params = `latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,relativehumidity_2m,precipitation,weathercode,pressure_msl,windspeed_10m,winddirection_10m&timezone=auto`;
    const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?${params}`;
    const forecastUrl = `https://api.open-meteo.com/v1/forecast?${params}`;
    const url = diffDays > 5 ? archiveUrl : forecastUrl;

    let response = await fetch(url);
    if (!response.ok) {
      const altUrl = url.includes('archive-api') ? forecastUrl : archiveUrl;
      response = await fetch(altUrl);
      if (!response.ok) return null;
    }

    const data = await response.json();
    if (!data?.hourly?.time?.length) return null;

    const targetDate = dateStr;
    let closestIndex = -1;
    let minDiff = Infinity;
    for (let i = 0; i < data.hourly.time.length; i++) {
      const hDate = new Date(data.hourly.time[i]);
      if (hDate.toISOString().split('T')[0] !== targetDate) continue;
      const diff = Math.abs(hDate.getHours() - targetHour);
      if (diff < minDiff) { minDiff = diff; closestIndex = i; }
    }
    if (closestIndex === -1) return null;

    const idx = closestIndex;
    const celsiusToF = (c: number) => Math.round(c * 9 / 5 + 32);
    const kmhToMph = (k: number) => Math.round(k * 0.621371);
    const hpaToInHg = (h: number) => Math.round(h * 0.02953 * 100) / 100;

    const getWindDirText = (deg: number) => {
      const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
      return dirs[Math.round(deg / 22.5) % 16];
    };

    const rawPress = data.hourly.pressure_msl?.[idx];
    const moon = getMoonPhase(new Date(dateStr + 'T12:00:00'));

    const pressureTrend = () => {
      if (idx < 2) return 'steady';
      const cur = (data.hourly.pressure_msl?.[idx] || 0);
      const prev = (data.hourly.pressure_msl?.[idx - 2] || 0);
      const diff = cur - prev;
      if (diff > 2) return 'rising';
      if (diff < -2) return 'falling';
      return 'steady';
    };

    return {
      windDirection: getWindDirText(data.hourly.winddirection_10m?.[idx] || 0),
      windDirectionDeg: data.hourly.winddirection_10m?.[idx] || 0,
      windSpeedMph: kmhToMph(data.hourly.windspeed_10m?.[idx] || 0),
      windSpeedKmh: Math.round(data.hourly.windspeed_10m?.[idx] || 0),
      temperature: celsiusToF(data.hourly.temperature_2m?.[idx] || 50),
      pressureInHg: hpaToInHg(rawPress || 1013),
      pressureHpa: Math.round(rawPress || 1013),
      pressureTrend: pressureTrend(),
      humidity: data.hourly.relativehumidity_2m?.[idx] || 0,
      moonPhase: moon.phase,
      moonIllumination: moon.illumination,
      moonPhaseName: moon.name,
      weatherCode: data.hourly.weathercode?.[idx] || 0,
      weatherDesc: getWeatherDesc(data.hourly.weathercode?.[idx] || 0),
      precipitationMm: data.hourly.precipitation?.[idx] || 0,
    };
  } catch (e) {
    console.error('Historical weather fetch error:', e);
    return null;
  }
}

function getWeatherDesc(code: number): string {
  const map: Record<number, string> = {
    0: 'Clear', 1: 'Mostly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
    45: 'Foggy', 48: 'Depositing Rime Fog',
    51: 'Light Drizzle', 53: 'Moderate Drizzle', 55: 'Dense Drizzle',
    56: 'Light Freezing Drizzle', 57: 'Dense Freezing Drizzle',
    61: 'Slight Rain', 63: 'Moderate Rain', 65: 'Heavy Rain',
    66: 'Light Freezing Rain', 67: 'Heavy Freezing Rain',
    71: 'Slight Snow', 73: 'Moderate Snow', 75: 'Heavy Snow',
    77: 'Snow Grains',
    80: 'Slight Rain Showers', 81: 'Moderate Rain Showers', 82: 'Violent Rain Showers',
    85: 'Slight Snow Showers', 86: 'Heavy Snow Showers',
    95: 'Thunderstorm', 96: 'Thunderstorm with Hail', 99: 'Thunderstorm with Heavy Hail',
  };
  return map[code] || 'Unknown';
}

export async function matchWeatherForPhoto(photo: TrailCameraPhoto): Promise<HistoricalWeatherData | null> {
  if (photo.weather) return photo.weather;
  const lat = photo.latitude;
  const lon = photo.longitude;
  if (lat == null || lon == null || !photo.dateTime) return null;

  const cacheKey = `${lat.toFixed(2)}_${lon.toFixed(2)}_${photo.dateTime.slice(0, 10)}_${photo.dateTime.slice(11, 13)}`;
  const cached = await getFromStore<{ cacheKey: string; data: HistoricalWeatherData }>(WEATHER_CACHE_STORE, cacheKey);
  if (cached) return cached.data;

  const data = await fetchHistoricalWeather(lat, lon, photo.dateTime);
  if (data) {
    await putInStore(WEATHER_CACHE_STORE, { cacheKey, date: photo.dateTime.slice(0, 10), data });
  }
  return data;
}

// ---- Filename Date Parsing (fallback when EXIF stripped on mobile) ----
function parseDateFromFilename(fileName: string): string | undefined {
  const patterns: { re: RegExp; fmt: (m: RegExpExecArray) => string }[] = [
    // IMG_20260729_120000 or 20260729_120000
    { re: /(\d{4})(\d{2})(\d{2})[_\-](\d{2})(\d{2})(\d{2})/, fmt: (m) => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` },
    // 2026-07-29 12.00.00 (iPhone with dots)
    { re: /(\d{4})[-_]?(\d{2})[-_]?(\d{2})[\s._-]+(\d{2})\.(\d{2})\.(\d{2})/, fmt: (m) => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` },
    // 2026-07-29 (date only, no time)
    { re: /(\d{4})[-_](\d{2})[-_](\d{2})/, fmt: (m) => `${m[1]}-${m[2]}-${m[3]}T12:00:00` },
  ];

  for (const p of patterns) {
    const m = p.re.exec(fileName);
    if (m) {
      const iso = p.fmt(m);
      const d = new Date(iso);
      if (!isNaN(d.getTime())) return iso;
    }
  }
}

// ---- Import Photos ----
export async function importPhotos(files: FileList | File[], onProgress?: (completed: number, total: number) => void): Promise<TrailCameraPhoto[]> {
  const fileArray = Array.from(files);
  const imported: TrailCameraPhoto[] = [];
  let successCount = 0;

  for (let i = 0; i < fileArray.length; i++) {
    const file = fileArray[i];
    const id = `cam_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const buffer = await file.arrayBuffer();
      const exif = parseEXIFDate(buffer);

      const thumbnailBlob = await generateThumbnail(file, 300);
      const thumbnailDataUrl = thumbnailBlob ? await blobToDataURL(thumbnailBlob) : undefined;

      const fileBlob = new Blob([file], { type: file.type });

      // Best date: EXIF > filename > file.lastModified
      let dateTime = exif?.dateTime;
      if (!dateTime) {
        dateTime = parseDateFromFilename(file.name);
      }
      if (!dateTime) {
        const fallback = new Date(file.lastModified);
        dateTime = !isNaN(fallback.getTime()) ? fallback.toISOString() : new Date().toISOString();
      }

      const photo: TrailCameraPhoto = {
        id,
        fileName: file.name,
        fileSize: file.size,
        importedAt: Date.now(),
        dateTime,
        cameraModel: exif?.cameraModel,
        latitude: exif?.latitude,
        longitude: exif?.longitude,
        isFavorite: false,
      };

      if (!exif) {
        console.debug(`[cam] No EXIF for "${file.name}", using dateTime=${dateTime} (filename=${!!parseDateFromFilename(file.name)}, lastModified=${!!file.lastModified})`);
      }

      await putInStore(PHOTOS_STORE, photo);
      await putInStore(FULL_IMAGES_STORE, { id, blob: fileBlob, thumbnailUrl: thumbnailDataUrl || '' });
      imported.push(photo);
      successCount++;
    } catch (err) {
      console.warn(`Skipping file "${file.name}":`, err);
    }

    onProgress?.(i + 1, fileArray.length);
  }

  return imported;
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// ---- Photo CRUD ----
export async function getAllPhotos(): Promise<TrailCameraPhoto[]> {
  return getAllFromStore<TrailCameraPhoto>(PHOTOS_STORE);
}

export async function getPhoto(id: string): Promise<TrailCameraPhoto | undefined> {
  return getFromStore<TrailCameraPhoto>(PHOTOS_STORE, id);
}

export async function getThumbnailUrl(id: string): Promise<string | undefined> {
  const entry = await getFromStore<{ id: string; thumbnailUrl: string }>(FULL_IMAGES_STORE, id);
  return entry?.thumbnailUrl;
}

export async function getFullImageBlob(id: string): Promise<Blob | undefined> {
  const entry = await getFromStore<{ id: string; blob?: Blob }>(FULL_IMAGES_STORE, id);
  return entry?.blob;
}

export async function updatePhoto(id: string, updates: Partial<TrailCameraPhoto>): Promise<void> {
  const photo = await getPhoto(id);
  if (!photo) return;
  Object.assign(photo, updates);
  await putInStore(PHOTOS_STORE, photo);
  clearAnalyticsCache();
}

export async function deletePhoto(id: string): Promise<void> {
  await deleteFromStore(PHOTOS_STORE, id);
  await deleteFromStore(FULL_IMAGES_STORE, id);
  clearAnalyticsCache();
}

export async function deletePhotos(ids: string[]): Promise<void> {
  for (const id of ids) {
    await deleteFromStore(PHOTOS_STORE, id);
    await deleteFromStore(FULL_IMAGES_STORE, id);
  }
  clearAnalyticsCache();
}

// ---- Camera Locations ----
export async function getCameraLocations(): Promise<TrailCameraLocation[]> {
  return getAllFromStore<TrailCameraLocation>(LOCATIONS_STORE);
}

export async function saveCameraLocation(loc: TrailCameraLocation): Promise<void> {
  await putInStore(LOCATIONS_STORE, loc);
}

export async function deleteCameraLocation(id: string): Promise<void> {
  await deleteFromStore(LOCATIONS_STORE, id);
}

// ---- Targets ----
export async function getTargets(): Promise<TrailCameraTarget[]> {
  return getAllFromStore<TrailCameraTarget>(TARGETS_STORE);
}

export async function saveTarget(target: TrailCameraTarget): Promise<void> {
  await putInStore(TARGETS_STORE, target);
}

export async function deleteTarget(id: string): Promise<void> {
  await deleteFromStore(TARGETS_STORE, id);
}

// ---- Filtering ----
export function filterPhotos(photos: TrailCameraPhoto[], filter: TrailCameraFilterState): TrailCameraPhoto[] {
  return photos.filter((p) => {
    if (filter.dateStart && p.dateTime && p.dateTime < filter.dateStart) return false;
    if (filter.dateEnd && p.dateTime && p.dateTime > filter.dateEnd + 'T23:59:59') return false;
    if (filter.cameraLocationId && p.cameraLocationId !== filter.cameraLocationId) return false;
    if (filter.targetId && !(p.tags || []).includes(filter.targetId)) return false;
    if (filter.searchQuery) {
      const q = filter.searchQuery.toLowerCase();
      if (!p.fileName.toLowerCase().includes(q) && !p.notes?.toLowerCase().includes(q)) return false;
    }
    if (!p.weather) return true;

    if (filter.windDirection && p.weather.windDirection !== filter.windDirection) return false;
    if (filter.windSpeedMin != null && p.weather.windSpeedMph < filter.windSpeedMin) return false;
    if (filter.windSpeedMax != null && p.weather.windSpeedMph > filter.windSpeedMax) return false;
    if (filter.tempMin != null && p.weather.temperature < filter.tempMin) return false;
    if (filter.tempMax != null && p.weather.temperature > filter.tempMax) return false;
    if (filter.pressureMin != null && p.weather.pressureInHg < filter.pressureMin) return false;
    if (filter.pressureMax != null && p.weather.pressureInHg > filter.pressureMax) return false;
    if (filter.weatherConditions?.length && !filter.weatherConditions.includes(p.weather.weatherDesc)) return false;
    if (filter.moonPhase && p.weather.moonPhaseName !== filter.moonPhase) return false;

    return true;
  });
}

// ---- Analytics ----
export interface AnalyticsData {
  byWindDirection: { name: string; count: number }[];
  byTemperatureRange: { name: string; count: number }[];
  byWeatherCondition: { name: string; count: number }[];
  byPressureRange: { name: string; count: number }[];
  byMoonPhase: { name: string; count: number }[];
  byMonth: { name: string; count: number }[];
  byHourOfDay: { name: string; count: number }[];
  totalPhotos: number;
  withWeather: number;
}

const TEMP_RANGES = [
  { label: '< 20°F', min: -Infinity, max: 20 },
  { label: '20-35°F', min: 20, max: 35 },
  { label: '35-50°F', min: 35, max: 50 },
  { label: '50-65°F', min: 50, max: 65 },
  { label: '65-80°F', min: 65, max: 80 },
  { label: '> 80°F', min: 80, max: Infinity },
];

const PRESSURE_RANGES = [
  { label: '< 29.50 inHg', min: -Infinity, max: 29.5 },
  { label: '29.50-29.90 inHg', min: 29.5, max: 29.9 },
  { label: '29.90-30.20 inHg', min: 29.9, max: 30.2 },
  { label: '30.20-30.50 inHg', min: 30.2, max: 30.5 },
  { label: '> 30.50 inHg', min: 30.5, max: Infinity },
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WIND_DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export function computeAnalytics(photos: TrailCameraPhoto[]): AnalyticsData {
  const withWeather = photos.filter((p) => p.weather);
  const totalPhotos = photos.length;

  const byWindDir = new Map<string, number>();
  for (const p of withWeather) {
    const key = p.weather!.windDirection;
    byWindDir.set(key, (byWindDir.get(key) || 0) + 1);
  }
  const byWindDirection = WIND_DIRS.map((name) => ({ name, count: byWindDir.get(name) || 0 }));

  const byTemp = new Map<string, number>();
  for (const p of withWeather) {
    const t = p.weather!.temperature;
    for (const r of TEMP_RANGES) {
      if (t >= r.min && t < r.max) {
        byTemp.set(r.label, (byTemp.get(r.label) || 0) + 1);
        break;
      }
    }
  }
  const byTemperatureRange = TEMP_RANGES.map((r) => ({ name: r.label, count: byTemp.get(r.label) || 0 }));

  const byWeather = new Map<string, number>();
  for (const p of withWeather) {
    const key = p.weather!.weatherDesc;
    byWeather.set(key, (byWeather.get(key) || 0) + 1);
  }
  const byWeatherCondition = Array.from(byWeather.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const byPress = new Map<string, number>();
  for (const p of withWeather) {
    const pr = p.weather!.pressureInHg;
    for (const r of PRESSURE_RANGES) {
      if (pr >= r.min && pr < r.max) {
        byPress.set(r.label, (byPress.get(r.label) || 0) + 1);
        break;
      }
    }
  }
  const byPressureRange = PRESSURE_RANGES.map((r) => ({ name: r.label, count: byPress.get(r.label) || 0 }));

  const byMoon = new Map<string, number>();
  for (const p of withWeather) {
    const key = p.weather!.moonPhaseName;
    byMoon.set(key, (byMoon.get(key) || 0) + 1);
  }
  const byMoonPhase = MOON_PHASE_NAMES.map((name) => ({ name, count: byMoon.get(name) || 0 }));

  const byMonthMap = new Map<string, number>();
  for (const p of photos) {
    if (!p.dateTime) continue;
    const m = new Date(p.dateTime).getMonth();
    byMonthMap.set(MONTH_NAMES[m], (byMonthMap.get(MONTH_NAMES[m]) || 0) + 1);
  }
  const byMonth = MONTH_NAMES.map((name) => ({ name, count: byMonthMap.get(name) || 0 }));

  const byHour = new Map<string, number>();
  for (const p of photos) {
    if (!p.dateTime) continue;
    const h = new Date(p.dateTime).getHours();
    const label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
    byHour.set(label, (byHour.get(label) || 0) + 1);
  }
  const byHourOfDay = Array.from({ length: 24 }, (_, i) => {
    const label = i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`;
    return { name: label, count: byHour.get(label) || 0 };
  });

  return {
    byWindDirection,
    byTemperatureRange,
    byWeatherCondition,
    byPressureRange,
    byMoonPhase,
    byMonth,
    byHourOfDay,
    totalPhotos,
    withWeather: withWeather.length,
  };
}

// ---- Pattern Discovery & Insights ----
export interface PatternInsight {
  label: string;
  detail: string;
  confidence: 'high' | 'medium' | 'low';
}

export function generateInsights(photos: TrailCameraPhoto[], analytics: AnalyticsData): PatternInsight[] {
  const insights: PatternInsight[] = [];
  const withWeather = photos.filter((p) => p.weather);
  if (withWeather.length < 5) {
    insights.push({ label: 'Not Enough Data', detail: 'Import at least 5 photos with weather data to generate insights.', confidence: 'low' });
    return insights;
  }

  const MIN_SAMPLES = 3;

  const topWind = analytics.byWindDirection.slice().sort((a, b) => b.count - a.count);
  if (topWind[0] && topWind[0].count >= MIN_SAMPLES) {
    insights.push({
      label: 'Most Common Wind Direction',
      detail: `${topWind[0].name} winds (${topWind[0].count} photos)`,
      confidence: topWind[0].count >= 10 ? 'high' : topWind[0].count >= 5 ? 'medium' : 'low',
    });
    if (topWind[1] && topWind[1].count >= MIN_SAMPLES) {
      insights.push({
        label: 'Secondary Wind Direction',
        detail: `${topWind[1].name} winds (${topWind[1].count} photos)`,
        confidence: topWind[1].count >= 10 ? 'high' : topWind[1].count >= 5 ? 'medium' : 'low',
      });
    }
  }

  const tempWithCount = analytics.byTemperatureRange.filter((t) => t.count >= MIN_SAMPLES);
  const topTemp = tempWithCount.sort((a, b) => b.count - a.count);
  if (topTemp[0]) {
    insights.push({
      label: 'Most Productive Temp Range',
      detail: `${topTemp[0].name} (${topTemp[0].count} photos)`,
      confidence: topTemp[0].count >= 10 ? 'high' : topTemp[0].count >= 5 ? 'medium' : 'low',
    });
  }

  const pressWithCount = analytics.byPressureRange.filter((p) => p.count >= MIN_SAMPLES);
  const topPress = pressWithCount.sort((a, b) => b.count - a.count);
  if (topPress[0]) {
    insights.push({
      label: 'Most Productive Pressure Range',
      detail: `${topPress[0].name} (${topPress[0].count} photos)`,
      confidence: topPress[0].count >= 10 ? 'high' : topPress[0].count >= 5 ? 'medium' : 'low',
    });
  }

  const moonWithCount = analytics.byMoonPhase.filter((m) => m.count >= MIN_SAMPLES);
  const topMoon = moonWithCount.sort((a, b) => b.count - a.count);
  if (topMoon[0]) {
    insights.push({
      label: 'Most Active Moon Phase',
      detail: `${topMoon[0].name} (${topMoon[0].count} photos)`,
      confidence: topMoon[0].count >= 10 ? 'high' : topMoon[0].count >= 5 ? 'medium' : 'low',
    });
  }

  const hourWithCount = analytics.byHourOfDay.filter((h) => h.count >= MIN_SAMPLES);
  const topHours = hourWithCount.sort((a, b) => b.count - a.count);
  if (topHours[0]) {
    insights.push({
      label: 'Peak Activity Time',
      detail: `${topHours[0].name} (${topHours[0].count} photos)`,
      confidence: topHours[0].count >= 10 ? 'high' : topHours[0].count >= 5 ? 'medium' : 'low',
    });
  }

  const monthWithCount = analytics.byMonth.filter((m) => m.count >= MIN_SAMPLES);
  const topMonth = monthWithCount.sort((a, b) => b.count - a.count);
  if (topMonth[0]) {
    insights.push({
      label: 'Most Active Month',
      detail: `${topMonth[0].name} (${topMonth[0].count} photos)`,
      confidence: topMonth[0].count >= 10 ? 'high' : topMonth[0].count >= 5 ? 'medium' : 'low',
    });
  }

  const rainyWeather = withWeather.filter((p) =>
    ['Slight Rain', 'Moderate Rain', 'Heavy Rain', 'Slight Rain Showers', 'Moderate Rain Showers', 'Violent Rain Showers',
     'Thunderstorm', 'Thunderstorm with Hail', 'Thunderstorm with Heavy Hail'].includes(p.weather?.weatherDesc || ''));
  const dryWeather = withWeather.filter((p) => rainyWeather.includes(p) === false);
  if (rainyWeather.length >= MIN_SAMPLES && dryWeather.length >= MIN_SAMPLES) {
    const rainyCount = rainyWeather.length;
    const dryCount = dryWeather.length;
    const moreAfterRain = rainyCount > dryCount;
    insights.push({
      label: moreAfterRain ? 'Higher Activity After Rain' : 'Higher Activity in Dry Conditions',
      detail: moreAfterRain
        ? `${rainyCount} photos during/after rain vs ${dryCount} in dry conditions`
        : `${dryCount} photos in dry conditions vs ${rainyCount} during/after rain`,
      confidence: Math.abs(rainyCount - dryCount) >= 10 ? 'high' : Math.abs(rainyCount - dryCount) >= 5 ? 'medium' : 'low',
    });
  }

  const pressureTrendCount = new Map<string, number>();
  for (const p of withWeather) {
    const trend = p.weather!.pressureTrend;
    pressureTrendCount.set(trend, (pressureTrendCount.get(trend) || 0) + 1);
  }
  const topTrend = Array.from(pressureTrendCount.entries())
    .map(([name, count]) => ({ name, count }))
    .filter((t) => t.count >= MIN_SAMPLES)
    .sort((a, b) => b.count - a.count);
  if (topTrend[0]) {
    insights.push({
      label: 'Pressure Trend Pattern',
      detail: `Most photos captured during ${topTrend[0].name} pressure (${topTrend[0].count} photos)`,
      confidence: topTrend[0].count >= 10 ? 'high' : topTrend[0].count >= 5 ? 'medium' : 'low',
    });
  }

  return insights;
}

// ---- Analytics Cache ----
let analyticsCache: { data: AnalyticsData; insights: PatternInsight[] } | null = null;

export function clearAnalyticsCache() {
  analyticsCache = null;
}

export function getCachedAnalytics(): { data: AnalyticsData; insights: PatternInsight[] } | null {
  return analyticsCache;
}

export function setCachedAnalytics(data: AnalyticsData, insights: PatternInsight[]) {
  analyticsCache = { data, insights };
}
