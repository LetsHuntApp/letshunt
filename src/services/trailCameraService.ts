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
function parseEXIFMetadata(buffer: ArrayBuffer): { cameraModel?: string; latitude?: number; longitude?: number } | undefined {
  try {
    const dv = new DataView(buffer);
    if (dv.byteLength < 4) return;

    let tiffStart = -1;

    if (dv.getUint16(0) === 0xFFD8) {
      // JPEG format: scan APP segments for EXIF marker
      let pos = 2;
      while (pos + 4 < dv.byteLength) {
        const marker = dv.getUint16(pos);
        if (marker === 0xFFDA || marker === 0xFFD9) break;
        if (marker === 0xFFE1) {
          const segLen = dv.getUint16(pos + 2);
          if (segLen >= 8 && pos + 10 <= dv.byteLength) {
            if (dv.getUint8(pos + 4) === 0x45 && dv.getUint8(pos + 5) === 0x78 &&
                dv.getUint8(pos + 6) === 0x69 && dv.getUint8(pos + 7) === 0x66 &&
                dv.getUint8(pos + 8) === 0x00 && dv.getUint8(pos + 9) === 0x00) {
              tiffStart = pos + 10;
              break;
            }
          }
          pos += 2 + segLen;
        } else if ((marker & 0xFF00) === 0xFF00 && marker !== 0xFFFF) {
          if (marker >= 0xFFD0 && marker <= 0xFFD8) {
            pos += 2;
          } else {
            const markerLen = (dv.getUint16(pos + 2) || 0) + 2;
            pos += markerLen > 2 ? markerLen : 2;
          }
        } else {
          break;
        }
      }
    } else if (dv.getUint32(0) === 0x89504E47) {
      // PNG format: scan for eXIf chunk
      let pos = 8;
      while (pos + 8 < dv.byteLength) {
        const chunkLen = dv.getUint32(pos);
        const chunkType = String.fromCharCode(
          dv.getUint8(pos + 4), dv.getUint8(pos + 5), dv.getUint8(pos + 6), dv.getUint8(pos + 7)
        );
        if (chunkType === 'eXIf' && pos + 8 + chunkLen <= dv.byteLength) {
          tiffStart = pos + 8;
          break;
        }
        pos += 12 + chunkLen;
      }
    } else if (dv.getUint32(0) === 0x52494646 && dv.getUint32(8) === 0x57454250) {
      // WebP format
      let pos = 12;
      while (pos + 8 < dv.byteLength) {
        const fourcc = String.fromCharCode(
          dv.getUint8(pos), dv.getUint8(pos + 1), dv.getUint8(pos + 2), dv.getUint8(pos + 3)
        );
        const chunkLen = dv.getUint32(pos + 4, true);
        if (fourcc === 'EXIF' && pos + 8 + chunkLen <= dv.byteLength) {
          if (dv.getUint8(pos + 8) === 0x45 && dv.getUint8(pos + 9) === 0x78 &&
              dv.getUint8(pos + 10) === 0x69 && dv.getUint8(pos + 11) === 0x66) {
            tiffStart = pos + 14;
          } else {
            tiffStart = pos + 8;
          }
          break;
        }
        pos += 8 + chunkLen + (chunkLen % 2);
      }
    } else {
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

    const ifdOffset = read32(tiffStart + 4);
    if (ifdOffset < 0 || ifdOffset + 2 > dv.byteLength - tiffStart) return;
    let offset = tiffStart + ifdOffset;
    const entries = read16(offset);
    if (entries < 1 || entries > 300) return;

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

      if (tag === 0x0110 && type === 2) {
        const strOff = count <= 4 ? valueOffset : tiffStart + read32(valueOffset);
        if (strOff + count <= dv.byteLength) {
          cameraModel = readString(dv, strOff, count);
        }
      } else if (tag === 0x8825) {
        gpsIfdOffset = read32(valueOffset);
      }
    }

    if (gpsIfdOffset != null && tiffStart + gpsIfdOffset + 2 <= dv.byteLength) {
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
              for (let k = 0; k < 3; k++) gpsLatData.push(readSrat(ptr + k * 8));
            }
          } else if (gpsTag === 0x0003) {
            gpsLonRef = gpsCount <= 4 ? String.fromCharCode(dv.getUint8(gpsValOff)) : String.fromCharCode(dv.getUint8(tiffStart + read32(gpsValOff)));
          } else if (gpsTag === 0x0004 && gpsType === 5) {
            const ptr = gpsCount <= 4 ? gpsValOff : tiffStart + read32(gpsValOff);
            if (ptr + 24 <= dv.byteLength) {
              for (let k = 0; k < 3; k++) gpsLonData.push(readSrat(ptr + k * 8));
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

    return { cameraModel, latitude: gpsLat, longitude: gpsLon };
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

// Helper to parse OCR text into an ISO date string
function parseOCRTextToISO(rawText: string): string | undefined {
  if (!rawText) return undefined;

  const fixNumericTypos = (s: string) => {
    return s
      .replace(/([0-9])[OoQqD]/g, '$10')
      .replace(/[OoQqD]([0-9])/g, '0$1')
      .replace(/([0-9])[lI!|]/g, '$11')
      .replace(/[lI!|]([0-9])/g, '1$1')
      .replace(/([0-9])[Zz]/g, '$12')
      .replace(/[Zz]([0-9])/g, '2$1')
      .replace(/([0-9])[Ss]/g, '$15')
      .replace(/[Ss]([0-9])/g, '5$1')
      .replace(/([0-9])[Bb]/g, '$18')
      .replace(/[Bb]([0-9])/g, '8$1')
      .replace(/[Aa]([0-9])/g, '4$1')
      .replace(/([0-9])[Aa]/g, '$14');
  };

  const candidateTexts = [
    rawText,
    fixNumericTypos(rawText),
  ];

  // Also try each line individually (date and time may be on separate lines)
  const lines = rawText.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    for (let j = i; j < Math.min(i + 3, lines.length); j++) {
      const combined = lines.slice(i, j + 1).join(' ');
      if (combined !== rawText) {
        candidateTexts.push(combined);
        candidateTexts.push(fixNumericTypos(combined));
      }
    }
  }

  // Filter to only date-like segments as backup candidates
  const dateLikeLines = lines.filter(l => {
    const digits = (l.match(/\d/g) || []).length;
    return digits >= 3 && /[/.:\-]/.test(l);
  });
  if (dateLikeLines.length > 0) {
    const joined = dateLikeLines.join(' ');
    if (joined !== rawText) {
      candidateTexts.push(joined);
      candidateTexts.push(fixNumericTypos(joined));
    }
  }

  for (let text of candidateTexts) {
    text = text.replace(/[\t\r]+/g, ' ').trim();

    // Helper: if time capture groups are present, return parsed components; else null
    const parseTime = (text: string, re: RegExp): { y: number; mo: number; d: number; hh: number; mm: number; ss: number } | null => {
      const m = text.match(re);
      if (!m) return null;

      // Must have at least one non-date capture group to indicate time was present
      const hasTime = m[4] !== undefined;
      if (!hasTime) return null;

      let y = 0, mo = 0, d = 0;
      let hh = parseInt(m[4], 10);
      let mm = m[5] !== undefined ? parseInt(m[5], 10) : 0;
      let ss = m[6] !== undefined ? parseInt(m[6], 10) : 0;
      const ap = m[7]?.toUpperCase();

      if (re.source.includes('20\\d{2}')) {
        // YYYY first
        y = parseInt(m[1], 10);
        mo = parseInt(m[2], 10);
        d = parseInt(m[3], 10);
      } else {
        // MM/DD first; if DD>12 it's DD/MM
        mo = parseInt(m[2], 10);
        d = parseInt(m[1], 10);
        y = parseInt(m[3], 10);
        if (d > 12 && d <= 31 && mo >= 1 && mo <= 12) {
          // It's DD/MM, swap
          const tmp = d; d = mo; mo = tmp;
        }
      }

      if (ap === 'PM' && hh < 12) hh += 12;
      if (ap === 'AM' && hh === 12) hh = 0;

      if (mo < 1 || mo > 12) return null;
      if (d < 1 || d > 31) return null;
      if (hh > 23 || mm > 59 || ss > 59) return null;

      return { y, mo, d, hh, mm, ss };
    };

    // Pattern 1: YYYY/MM/DD HH:MM(:SS) (AM/PM)
    let result = parseTime(text, /\b(20\d{2})\s*[-/.:]\s*(\d{1,2})\s*[-/.:]\s*(\d{1,2})\s+(\d{1,2})\s*[:.]\s*(\d{2})(?:\s*[:.]\s*(\d{2}))?\s*(AM|PM)?\b/i);
    if (result) {
      const iso = `${result.y}-${String(result.mo).padStart(2,'0')}-${String(result.d).padStart(2,'0')}T${String(result.hh).padStart(2,'0')}:${String(result.mm).padStart(2,'0')}:${String(result.ss).padStart(2,'0')}`;
      if (!isNaN(new Date(iso).getTime())) return iso;
    }

    // Pattern 2: MM/DD/YYYY HH:MM(:SS) (AM/PM)
    result = parseTime(text, /\b(\d{1,2})\s*[-/.:]\s*(\d{1,2})\s*[-/.:]\s*(20\d{2})\s+(\d{1,2})\s*[:.]\s*(\d{2})(?:\s*[:.]\s*(\d{2}))?\s*(AM|PM)?\b/i);
    if (result) {
      const iso = `${result.y}-${String(result.mo).padStart(2,'0')}-${String(result.d).padStart(2,'0')}T${String(result.hh).padStart(2,'0')}:${String(result.mm).padStart(2,'0')}:${String(result.ss).padStart(2,'0')}`;
      if (!isNaN(new Date(iso).getTime())) return iso;
    }

    // Pattern 3: MON DD YYYY HH:MM(:SS) (AM/PM)
    const monthMap: Record<string, string> = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
    };
    const monRe = /\b([A-Za-z]{3,9})\s*[-/.\s]?\s*(\d{1,2})\s*[-/.\s]?\s*(20\d{2})(?:\s+(\d{1,2})\s*[:.]\s*(\d{2})(?:\s*[:.]\s*(\d{2}))?\s*(AM|PM)?)?\b/i;
    const mMon = text.match(monRe);
    if (mMon) {
      const monthStr = mMon[1].toUpperCase().slice(0, 3);
      const monthNum = monthMap[monthStr];
      if (monthNum && mMon[4] !== undefined) {
        let d = parseInt(mMon[2], 10), y = parseInt(mMon[3], 10);
        let hh = parseInt(mMon[4], 10), mm = parseInt(mMon[5], 10), ss = mMon[6] ? parseInt(mMon[6], 10) : 0;
        const ap = mMon[7]?.toUpperCase();
        if (ap === 'PM' && hh < 12) hh += 12;
        if (ap === 'AM' && hh === 12) hh = 0;
        if (d >= 1 && d <= 31 && hh <= 23 && mm <= 59) {
          const iso = `${y}-${monthNum}-${String(d).padStart(2,'0')}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
          if (!isNaN(new Date(iso).getTime())) return iso;
        }
      }
    }

    // Pattern 4: YYYYMMDD_HHMMSS (compact, no separators)
    const compactRe = /\b(20\d{2})(\d{2})(\d{2})[_\s]?(\d{2})[:.]?(\d{2})(?:[:.]?(\d{2}))?\b/;
    const mCompact = text.match(compactRe);
    if (mCompact) {
      let y = parseInt(mCompact[1], 10), mo = parseInt(mCompact[2], 10), d = parseInt(mCompact[3], 10);
      let hh = parseInt(mCompact[4], 10), mm = parseInt(mCompact[5], 10), ss = mCompact[6] ? parseInt(mCompact[6], 10) : 0;
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && hh <= 23 && mm <= 59) {
        const iso = `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
        if (!isNaN(new Date(iso).getTime())) return iso;
      }
    }
  }

  return undefined;
}

function isDateReasonable(isoDate: string, fileLastModified: number): boolean {
  const dt = new Date(isoDate);
  if (isNaN(dt.getTime())) return false;
  if (dt.getFullYear() < 2000) return false;
  if (dt.getTime() > Date.now()) return false;
  const fMod = new Date(fileLastModified);
  if (isNaN(fMod.getTime())) return true; // can't check, so accept
  const diffYears = Math.abs(dt.getFullYear() - fMod.getFullYear());
  return diffYears <= 3;
}

function loadImageForOCR(file: File): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

// ---- Binarize a canvas region for OCR ----
function binarizeForOCR(ctx: CanvasRenderingContext2D, w: number, h: number, threshold: number): string | null {
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const bw = gray > threshold ? 255 : 0;
    data[i] = bw;
    data[i + 1] = bw;
    data[i + 2] = bw;
  }
  ctx.putImageData(imgData, 0, 0);
  return ctx.canvas.toDataURL('image/png');
}

// ---- Focused OCR Date Extraction (timestamp bar only) ----
// Accept optional pre-created worker to avoid re-loading Tesseract per photo.
async function extractDateFromImageOCR(file: File, existingWorker?: any): Promise<string | undefined> {
  const img = await loadImageForOCR(file);
  if (!img) return undefined;

  const targetWidth = Math.min(1600, Math.max(800, img.width));
  const scale = targetWidth / img.width;

  // Bottom 6-10% — just two regions, most likely to contain the timestamp bar
  const cropRegions = [
    { yRatio: 0.92, hRatio: 0.08 },
    { yRatio: 0.94, hRatio: 0.06 },
  ];

  // Just 3 thresholds instead of 6
  const thresholds = [140, 120, 100];

  const tryWorker = async (worker: any): Promise<string | undefined> => {
    for (const region of cropRegions) {
      const cropH = Math.round(img.height * region.hRatio);
      const cropY = Math.round(img.height * region.yRatio);
      if (cropY + cropH > img.height) continue;

      const cw = targetWidth;
      const ch = Math.max(30, Math.round(cropH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      for (const thresh of thresholds) {
        ctx.drawImage(img, 0, cropY, img.width, cropH, 0, 0, cw, ch);
        const processed = binarizeForOCR(ctx, cw, ch, thresh);
        if (!processed) continue;
        const { data: { text } } = await worker.recognize(processed);
        for (const input of [text, stripNonDateText(text)]) {
          const iso = parseOCRTextToISO(input);
          if (iso) {
            const dt = new Date(iso);
            const fMod = new Date(file.lastModified);
            const diffYears = Math.abs(dt.getFullYear() - fMod.getFullYear());
            if (!isNaN(dt.getTime()) && dt.getTime() <= Date.now() && dt.getFullYear() >= 2000 && diffYears <= 3) {
              return iso;
            }
          }
        }
      }
    }
    return undefined;
  };

  try {
    if (existingWorker) {
      return await tryWorker(existingWorker);
    }
    // No existing worker supplied — create a temporary one
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    await worker.setParameters({ tessedit_pageseg_mode: '7' });
    const result = await tryWorker(worker);
    await worker.terminate();
    return result;
  } catch (e) {
    console.debug('[OCR] Failed to extract date:', e);
  }
  return undefined;
}

// ---- Remove known non-date text from OCR output ----
function stripNonDateText(text: string): string {
  // Remove lines that are mostly letters without numbers (camera names, model numbers, etc.)
  const lines = text.split(/[\r\n]+/);
  const cleaned = lines.filter((line) => {
    const s = line.trim();
    if (!s) return false;
    // Keep lines that contain at least 2 digits
    const digitCount = (s.match(/\d/g) || []).length;
    if (digitCount < 2) return false;
    // Skip lines that are all letters (camera names, descriptions)
    const letterCount = (s.match(/[A-Za-z]/g) || []).length;
    if (letterCount > 0 && digitCount === 0) return false;
    // Skip battery and temperature indicators
    if (/batt|temp|°[CF]|%|ir\s*on/i.test(s)) return false;
    return true;
  });
  return cleaned.join(' ');
}

// ---- Filename Date Parsing (fallback when EXIF stripped on mobile) ----
function parseDateFromFilename(fileName: string): string | undefined {
  const patterns: { re: RegExp; fmt: (m: RegExpExecArray) => string }[] = [
    // 20260729_120000 or IMG_20260729_120000 or 20260729-120000
    { re: /(20\d{2})(\d{2})(\d{2})[_\-](\d{2})(\d{2})(\d{2})/, fmt: (m) => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` },
    // 2026-07-29_12-00-00 or 2026.07.29_12.00.00
    { re: /(20\d{2})[-_.](\d{2})[-_.](\d{2})[\s._-]+(\d{2})[:._-](\d{2})[:._-](\d{2})/, fmt: (m) => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` },
    // 10-15-2024_06-30-45 or 10.15.2024_06.30.45
    { re: /(\d{2})[-_.](\d{2})[-_.](20\d{2})[\s._-]+(\d{2})[:._-](\d{2})[:._-](\d{2})/, fmt: (m) => `${m[3]}-${m[1]}-${m[2]}T${m[4]}:${m[5]}:${m[6]}` },
    // 20260729120000
    { re: /(20\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, fmt: (m) => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` },
    // 2026-07-29 or 2026_07_29 or 2026.07.29 (date only)
    { re: /(20\d{2})[-_.](\d{2})[-_.](\d{2})/, fmt: (m) => `${m[1]}-${m[2]}-${m[3]}T12:00:00` },
    // 10-15-2024 or 10_15_2024 (date only)
    { re: /(\d{2})[-_.](\d{2})[-_.](20\d{2})/, fmt: (m) => `${m[3]}-${m[1]}-${m[2]}T12:00:00` },
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

// ---- Historical Weather ----
async function fetchHistoricalWeather(lat: number, lon: number, dateTimeStr: string): Promise<HistoricalWeatherData | null> {
  try {
    // Parse date and hour directly from the string to avoid timezone side-effects
    const dateStr = dateTimeStr.slice(0, 10);
    const hourMatch = dateTimeStr.match(/T(\d{1,2})/);
    const targetHour = hourMatch ? parseInt(hourMatch[1], 10) : 12;
    const d = new Date(dateTimeStr);
    if (isNaN(d.getTime())) return null;

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

    // Find the hourly slot closest to the photo's hour using string-parsed hours
    let closestIndex = -1;
    let minDiff = Infinity;
    for (let i = 0; i < data.hourly.time.length; i++) {
      const apiTime = data.hourly.time[i];
      if (!apiTime || apiTime.slice(0, 10) !== dateStr) continue;
      const apiHour = parseInt(apiTime.slice(11, 13), 10);
      const diff = Math.abs(apiHour - targetHour);
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

// ---- Import Photos ----
export async function importPhotos(files: FileList | File[], onProgress?: (completed: number, total: number) => void): Promise<TrailCameraPhoto[]> {
  const fileArray = Array.from(files);
  const imported: TrailCameraPhoto[] = [];
  let successCount = 0;

  // Pre-create a single Tesseract worker to reuse across all photos
  let ocrWorker: any = undefined;
  try {
    const { createWorker } = await import('tesseract.js');
    ocrWorker = await createWorker('eng');
    await ocrWorker.setParameters({ tessedit_pageseg_mode: '7' });
  } catch {
    // OCR worker failed to init — proceed without it
  }

  for (let i = 0; i < fileArray.length; i++) {
    const file = fileArray[i];
    const id = `cam_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const buffer = await file.arrayBuffer();
      const exif = parseEXIFMetadata(buffer);

      const thumbnailBlob = await generateThumbnail(file, 300);
      const thumbnailDataUrl = thumbnailBlob ? await blobToDataURL(thumbnailBlob) : undefined;

      const fileBlob = new Blob([file], { type: file.type });

      // Date: filename > OCR > file.lastModified
      let dateTime = parseDateFromFilename(file.name);
      if (!dateTime && ocrWorker) {
        dateTime = await extractDateFromImageOCR(file, ocrWorker);
      }
      if (!dateTime || !isDateReasonable(dateTime, file.lastModified)) {
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

  // Clean up the shared OCR worker
  if (ocrWorker) {
    try { await ocrWorker.terminate(); } catch { /* ignore */ }
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
  byWindSpeed: { name: string; count: number }[];
  byTemperatureRange: { name: string; count: number }[];
  byWeatherCondition: { name: string; count: number }[];
  byPressureRange: { name: string; count: number }[];
  byMoonPhase: { name: string; count: number }[];
  byMonth: { name: string; count: number }[];
  byHourOfDay: { name: string; count: number }[];
  totalPhotos: number;
  withWeather: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WIND_DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const WIND_SPEED_RANGES_IMP = [
  { label: '0-5 mph', min: 0, max: 5 },
  { label: '5-10 mph', min: 5, max: 10 },
  { label: '10-15 mph', min: 10, max: 15 },
  { label: '15-20 mph', min: 15, max: 20 },
  { label: '20+ mph', min: 20, max: Infinity },
];
const WIND_SPEED_RANGES_MET = [
  { label: '0-8 km/h', min: 0, max: 8 },
  { label: '8-16 km/h', min: 8, max: 16 },
  { label: '16-24 km/h', min: 16, max: 24 },
  { label: '24-32 km/h', min: 24, max: 32 },
  { label: '32+ km/h', min: 32, max: Infinity },
];

export function computeAnalytics(photos: TrailCameraPhoto[], units: string = 'imperial', pressureUnit: string = 'inHg'): AnalyticsData {
  const isMetric = units === 'metric';
  const isHpa = pressureUnit === 'hPa';

  const tempRangeLabels = isMetric
    ? ['< -6°C', '-6 to 1°C', '1 to 10°C', '10 to 18°C', '18 to 26°C', '> 26°C']
    : ['< 20°F', '20-35°F', '35-50°F', '50-65°F', '65-80°F', '> 80°F'];

  const pressureRangeLabels = isHpa
    ? ['< 999 hPa', '999-1013 hPa', '1013-1023 hPa', '1023-1033 hPa', '> 1033 hPa']
    : ['< 29.50 inHg', '29.50-29.90 inHg', '29.90-30.20 inHg', '30.20-30.50 inHg', '> 30.50 inHg'];

  const windSpeedRanges = isMetric ? WIND_SPEED_RANGES_MET : WIND_SPEED_RANGES_IMP;

  const TEMP_RANGES = isMetric
    ? [
        { label: tempRangeLabels[0], min: -Infinity, max: -6 },
        { label: tempRangeLabels[1], min: -6, max: 1 },
        { label: tempRangeLabels[2], min: 1, max: 10 },
        { label: tempRangeLabels[3], min: 10, max: 18 },
        { label: tempRangeLabels[4], min: 18, max: 26 },
        { label: tempRangeLabels[5], min: 26, max: Infinity },
      ]
    : [
        { label: tempRangeLabels[0], min: -Infinity, max: 20 },
        { label: tempRangeLabels[1], min: 20, max: 35 },
        { label: tempRangeLabels[2], min: 35, max: 50 },
        { label: tempRangeLabels[3], min: 50, max: 65 },
        { label: tempRangeLabels[4], min: 65, max: 80 },
        { label: tempRangeLabels[5], min: 80, max: Infinity },
      ];

  const PRESSURE_RANGES = isHpa
    ? [
        { label: pressureRangeLabels[0], min: -Infinity, max: 999 },
        { label: pressureRangeLabels[1], min: 999, max: 1013 },
        { label: pressureRangeLabels[2], min: 1013, max: 1023 },
        { label: pressureRangeLabels[3], min: 1023, max: 1033 },
        { label: pressureRangeLabels[4], min: 1033, max: Infinity },
      ]
    : [
        { label: pressureRangeLabels[0], min: -Infinity, max: 29.5 },
        { label: pressureRangeLabels[1], min: 29.5, max: 29.9 },
        { label: pressureRangeLabels[2], min: 29.9, max: 30.2 },
        { label: pressureRangeLabels[3], min: 30.2, max: 30.5 },
        { label: pressureRangeLabels[4], min: 30.5, max: Infinity },
      ];

  const withWeather = photos.filter((p) => p.weather);
  const totalPhotos = photos.length;

  const byWindDir = new Map<string, number>();
  for (const p of withWeather) {
    const key = p.weather!.windDirection;
    byWindDir.set(key, (byWindDir.get(key) || 0) + 1);
  }
  const byWindDirection = WIND_DIRS.map((name) => ({ name, count: byWindDir.get(name) || 0 }));

  const byWindSpd = new Map<string, number>();
  for (const p of withWeather) {
    const s = isMetric ? p.weather!.windSpeedKmh : p.weather!.windSpeedMph;
    for (const r of windSpeedRanges) {
      if (s >= r.min && s < r.max) {
        byWindSpd.set(r.label, (byWindSpd.get(r.label) || 0) + 1);
        break;
      }
    }
  }
  const byWindSpeed = windSpeedRanges.map((r) => ({ name: r.label, count: byWindSpd.get(r.label) || 0 }));

  const byTemp = new Map<string, number>();
  for (const p of withWeather) {
    const t = isMetric ? Math.round((p.weather!.temperature - 32) * 5 / 9) : p.weather!.temperature;
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
    const pr = isHpa ? p.weather!.pressureHpa : p.weather!.pressureInHg;
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
    byWindSpeed,
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
export function clearAnalyticsCache() {
  // No-op - handled by React useMemo in TrailCameraView
}

export function getCachedAnalytics(): { data: AnalyticsData; insights: PatternInsight[] } | null {
  // No-op - handled by React useMemo in TrailCameraView
  return null;
}

export function setCachedAnalytics(_data: AnalyticsData, _insights: PatternInsight[]) {
  // No-op - handled by React useMemo in TrailCameraView
}
