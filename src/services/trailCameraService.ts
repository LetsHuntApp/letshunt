import { TrailCameraPhoto, TrailCameraFilterState, HistoricalWeatherData, TrailCameraLocation, TrailCameraTarget } from '../types';
import { notifyDataChanged } from '../utils/storage';

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
    tx.oncomplete = () => {
      notifyDataChanged();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  }));
}

function deleteFromStore(storeName: string, id: string): Promise<void> {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(id);
    tx.oncomplete = () => {
      notifyDataChanged();
      resolve();
    };
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

// ---- Thumbnail Generation ----
// Returns a JPEG data-URL directly (avoids the toBlob → FileReader round-trip
// that the old generateThumbnail + blobToDataURL pipeline required).
function createThumbnailDataURL(img: HTMLImageElement, maxWidth = 300): string | null {
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
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return null;
  }
}

function generateThumbnailDataURL(file: File, maxWidth = 300): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(createThumbnailDataURL(img, maxWidth));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

// Helper to parse OCR text into an ISO date string.
// Returns { iso, timeDefaulted } where timeDefaulted=true means no time
// was found in the text and 12:00 PM was used as a placeholder.
function parseOCRTextToISO(rawText: string): { iso: string; timeDefaulted: boolean } | undefined {
  if (!rawText) return undefined;

  const fixNumericTypos = (s: string) => {
    return s
      .replace(/(\d)T(\d)/g, '$1:$2')
      .replace(/(\d);(\d)/g, '$1:$2')
      .replace(/\bP\.?\s*M\.?\b/gi, 'PM')
      .replace(/\bA\.?\s*M\.?\b/gi, 'AM')
      .replace(/([0-9])[OoQqD]/g, '$10')
      .replace(/[OoQqD]([0-9])/g, '0$1')
      .replace(/([0-9])[lI!|]/g, '$11')
      .replace(/[lI!|]([0-9])/g, '1$1')
      .replace(/[lI!|]{2,}/g, (m) => '1'.repeat(m.length))
      .replace(/([0-9])[Zz]/g, '$12')
      .replace(/[Zz]([0-9])/g, '2$1')
      .replace(/([0-9])[Ss](?!\s*[Ee][Pp])/g, '$15')
      .replace(/[Ss]([0-9])/g, '5$1')
      .replace(/([0-9])[Bb]/g, '$18')
      .replace(/[Bb]([0-9])/g, '8$1')
      .replace(/[Aa]([0-9])/g, '4$1')
      .replace(/([0-9])[Aa](?![Mm])/g, '$14');
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

  // Collect ALL valid dates from ALL candidate texts, then pick the
  // one with the most time information. This implements majority-rule
  // consensus: a typo-fixed candidate with full time (e.g. "1:50AM")
  // beats a raw-text candidate with date-only (e.g. "1T50AM" which
  // fails the time portion of the regex).
  let bestISO: string | undefined;
  let bestScore = 0; // 1=date only, 2=date+hh:mm, 3=date+hh:mm+AM/PM

  for (let text of candidateTexts) {
    text = text.replace(/[\t\r]+/g, ' ').trim();

    // Helper: given regex match groups, return ISO string and its time-score, or null
    const buildISO = (m: RegExpExecArray, yIdx: number, moIdx: number, dIdx: number, hhIdx: number | null, mmIdx: number | null, ssIdx: number | null, apIdx: number | null): { iso: string; score: number } | null => {
      const y = parseInt(m[yIdx], 10);
      let mo = parseInt(m[moIdx], 10);
      let d = parseInt(m[dIdx], 10);
      const hasTime = hhIdx != null && m[hhIdx] !== undefined;
      let hh = hasTime ? parseInt(m[hhIdx], 10) : 12;
      let mm = mmIdx != null && m[mmIdx] !== undefined ? parseInt(m[mmIdx], 10) : 0;
      let ss = ssIdx != null && m[ssIdx] !== undefined ? parseInt(m[ssIdx], 10) : 0;
      const ap = apIdx != null && m[apIdx] !== undefined ? m[apIdx].toUpperCase() : null;

      // DD/MM vs MM/DD disambiguation for non-YYYY-first patterns.
      // Only swap when the month field is clearly invalid (>12) AND
      // the day field could be a valid month (<=12). Don't swap valid
      // MM/DD pairs like 12/21 just because day > 12.
      if (yIdx > moIdx && mo > 12 && d <= 12) {
        const tmp = d; d = mo; mo = tmp;
      }

      if (ap === 'PM' && hh < 12) hh += 12;
      if (ap === 'AM' && hh === 12) hh = 0;

      if (mo < 1 || mo > 12) return null;
      if (d < 1 || d > 31) return null;
      if (hh > 23 || mm > 59 || ss > 59) return null;

      const iso = `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
      if (isNaN(new Date(iso).getTime())) return null;

      // Score: 3 = full date+time+AM/PM, 2 = date+hh:mm, 1 = date only
      let score = 1;
      if (hasTime) score = 2;
      if (hasTime && ap) score = 3;
      return { iso, score };
    };

    // Pattern 1: YYYY/MM/DD HH:MM(:SS) (AM/PM), time optional
    const re1 = /\b(20\d{2})\s*[-/.:]\s*(\d{1,2})\s*[-/.:]\s*(\d{1,2})(?:\s+(\d{1,2})\s*[\s:.;]\s*(\d{1,2})(?:\s*[\s:.;]\s*(\d{1,2}))?\s*(AM|PM)?)?\b/i;
    const m1 = re1.exec(text);
    if (m1) {
      const r = buildISO(m1, 1, 2, 3, m1[4] !== undefined ? 4 : null, m1[4] !== undefined ? 5 : null, m1[4] !== undefined ? 6 : null, m1[4] !== undefined ? 7 : null);
      if (r && r.score > bestScore) { bestISO = r.iso; bestScore = r.score; }
    }

    // Pattern 2: MM/DD/YYYY HH:MM(:SS) (AM/PM), time optional
    const re2 = /\b(\d{1,2})\s*[-/.:]\s*(\d{1,2})\s*[-/.:]\s*(20\d{2})(?:\s+(\d{1,2})\s*[\s:.;]\s*(\d{1,2})(?:\s*[\s:.;]\s*(\d{1,2}))?\s*(AM|PM)?)?\b/i;
    const m2 = re2.exec(text);
    if (m2) {
      const r = buildISO(m2, 3, 1, 2, m2[4] !== undefined ? 4 : null, m2[4] !== undefined ? 5 : null, m2[4] !== undefined ? 6 : null, m2[4] !== undefined ? 7 : null);
      if (r && r.score > bestScore) { bestISO = r.iso; bestScore = r.score; }
    }

    // Pattern 3: MON DD YYYY with optional HH:MM(:SS) (AM/PM)
    const monthMap: Record<string, string> = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
    };
    const monRe = /\b([A-Za-z]{3,9})\s*[-/.\s]?\s*(\d{1,2})\s*[-/.\s]?\s*(20\d{2})(?:\s+(\d{1,2})\s*[\s:.;]\s*(\d{2})(?:\s*[\s:.;]\s*(\d{2}))?\s*(AM|PM)?)?\b/i;
    const m3 = monRe.exec(text);
    if (m3) {
      const monthStr = m3[1].toUpperCase().slice(0, 3);
      const monthNum = monthMap[monthStr];
      if (monthNum) {
        const d = parseInt(m3[2], 10), y = parseInt(m3[3], 10);
        const hasTime = m3[4] !== undefined;
        let hh = hasTime ? parseInt(m3[4], 10) : 12;
        let mm = m3[5] !== undefined ? parseInt(m3[5], 10) : 0;
        let ss = m3[6] !== undefined ? parseInt(m3[6], 10) : 0;
        const ap = m3[7]?.toUpperCase();
        if (ap === 'PM' && hh < 12) hh += 12;
        if (ap === 'AM' && hh === 12) hh = 0;
        if (d >= 1 && d <= 31 && hh <= 23 && mm <= 59) {
          const iso = `${y}-${monthNum}-${String(d).padStart(2,'0')}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
          if (!isNaN(new Date(iso).getTime())) {
            let score = 1;
            if (hasTime) score = 2;
            if (hasTime && ap) score = 3;
            if (score > bestScore) { bestISO = iso; bestScore = score; }
          }
        }
      }
    }

    // Pattern 4: YYYYMMDD_HHMMSS or YYYYMMDD (compact, no separators)

    // Try with time first
    const compactRe1 = /\b(20\d{2})(\d{2})(\d{2})[_\s]?(\d{2})[\s:.;]?(\d{2})(?:[\s:.;]?(\d{2}))?\b/;
    const mCompact1 = compactRe1.exec(text);
    if (mCompact1) {
      let y = parseInt(mCompact1[1], 10), mo = parseInt(mCompact1[2], 10), d = parseInt(mCompact1[3], 10);
      let hh = parseInt(mCompact1[4], 10), mm = parseInt(mCompact1[5], 10), ss = mCompact1[6] ? parseInt(mCompact1[6], 10) : 0;
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && hh <= 23 && mm <= 59) {
        const iso = `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
        if (!isNaN(new Date(iso).getTime()) && 2 > bestScore) { bestISO = iso; bestScore = 2; }
      }
    }

    // Date-only compact (YYYYMMDD)
    const compactRe2 = /\b(20\d{2})(\d{2})(\d{2})\b(?!\s*\d)/;
    const mCompact2 = compactRe2.exec(text);
    if (mCompact2) {
      let y = parseInt(mCompact2[1], 10), mo = parseInt(mCompact2[2], 10), d = parseInt(mCompact2[3], 10);
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        const iso = `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}T12:00:00`;
        if (!isNaN(new Date(iso).getTime()) && 1 > bestScore) { bestISO = iso; bestScore = 1; }
      }
    }
  }

  if (!bestISO) return undefined;
  return { iso: bestISO, timeDefaulted: bestScore < 2 };
}

function isDateReasonable(isoDate: string): boolean {
  const dt = new Date(isoDate);
  if (isNaN(dt.getTime())) return false;
  if (dt.getTime() > Date.now() + 24 * 60 * 60 * 1000) return false;
  return true;
}

function validateFilenameDate(isoDate: string | undefined): string | undefined {
  if (!isoDate) return undefined;
  return isDateReasonable(isoDate) ? isoDate : undefined;
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

// ---- Binarize a canvas region for OCR (adaptive threshold) ----
function binarizeForOCR(ctx: CanvasRenderingContext2D, w: number, h: number, threshold: number, invert: boolean): HTMLCanvasElement | null {
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const bw = gray > threshold ? (invert ? 0 : 255) : (invert ? 255 : 0);
    data[i] = bw;
    data[i + 1] = bw;
    data[i + 2] = bw;
  }
  ctx.putImageData(imgData, 0, 0);
  // Tesseract accepts HTMLCanvasElement directly. Avoid encoding every OCR
  // variant as a large base64 PNG; the pixels are unchanged and the caller
  // awaits recognition before mutating this canvas for the next variant.
  return ctx.canvas;
}

// ---- Adaptive (Otsu) binarization — finds the threshold that maximizes
// between-class variance. Picks the right cutoff no matter how dark or
// bright the timestamp bar is, instead of guessing from the image mean.
function computeOtsuThreshold(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const data = ctx.getImageData(0, 0, w, h).data;
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    histogram[gray]++;
  }

  const total = w * h;
  let sumAll = 0;
  for (let i = 0; i < histogram.length; i++) sumAll += i * histogram[i];

  let weightBackground = 0;
  let sumBackground = 0;
  let bestVariance = -1;
  let bestThreshold = 128;
  for (let threshold = 0; threshold < histogram.length; threshold++) {
    weightBackground += histogram[threshold];
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;
    sumBackground += threshold * histogram[threshold];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sumAll - sumBackground) / weightForeground;
    const betweenClassVariance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (betweenClassVariance > bestVariance) {
      bestVariance = betweenClassVariance;
      bestThreshold = threshold;
    }
  }
  return bestThreshold;
}

// ---- Focused OCR Date Extraction (timestamp bar only) ----
// Accept optional pre-created worker to avoid re-loading Tesseract per photo.
//
// THE KEY INSIGHT: trail-cam timestamps are WHITE TEXT on a DARK bar at the
// VERY BOTTOM of the image (last 3-12 %). Previous pipelines made two
// mistakes: (1) they cropped 30 % of the image and then tried to binarize
// the whole thing — the grass/sky behind the bar dominates the histogram so
// Otsu picks the wrong threshold, and (2) they scaled too conservatively.
//
// This rewrite: slice the thinnest possible strip from the bottom edge,
// up-scale it aggressively (480 px), INVERT it (white-on-black →
// black-on-white which Tesseract handles natively), then feed it through
// PSM 7 (single line) followed by PSM 3 (auto).
//
// Only failures are logged; per-variant logging made large imports needlessly
// expensive and flooded the console.
async function extractDateFromImageOCR(file: File, existingWorker?: any, sourceImage?: HTMLImageElement): Promise<{dateTime?: string, timeDefaulted?: boolean, rawTexts: string[]}> {
  const rawTexts: string[] = [];
  // The thumbnail and OCR used to decode each file independently. Reuse the
  // already-decoded image from the import worker when available.
  const img = sourceImage || await loadImageForOCR(file);
  if (!img) return { rawTexts };

  // Inline helper: invert every pixel of a canvas in-place (white↔black swap)
  const invertCanvas = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - d[i];
      d[i + 1] = 255 - d[i + 1];
      d[i + 2] = 255 - d[i + 2];
    }
    ctx.putImageData(imgData, 0, 0);
  };

  const checkResult = (result: { iso: string; timeDefaulted: boolean } | undefined): { dateTime: string; timeDefaulted: boolean } | undefined => {
    if (!result) return undefined;
    const dt = new Date(result.iso);
    if (isNaN(dt.getTime())) return undefined;
    if (dt.getFullYear() < 1990 || dt.getFullYear() > 2100) return undefined;
    return { dateTime: result.iso, timeDefaulted: result.timeDefaulted };
  };

  // Majority consensus: gather every valid result across all strips and
  // preprocessing strategies, then resolve the date and timestamp separately.
  // The timestamp vote is by minute so a camera's optional seconds field does
  // not split otherwise-identical reads into unrelated candidates.
  const resolveConsensus = (results: Array<{ dateTime: string; timeDefaulted: boolean; label: string }>): { dateTime: string; timeDefaulted: boolean } | undefined => {
    if (results.length === 0) return undefined;
    if (results.length === 1) return { dateTime: results[0].dateTime, timeDefaulted: results[0].timeDefaulted };

    const byDate = new Map<string, typeof results>();
    for (const r of results) {
      const dateKey = r.dateTime.slice(0, 10);
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      byDate.get(dateKey)!.push(r);
    }

    // Date consensus comes first. On ties, prefer the date with more
    // time-complete entries (not timeDefaulted).
    let bestDate = '';
    let bestCount = 0;
    let bestTimedCount = 0;
    for (const [date, entries] of byDate) {
      const timedCount = entries.filter(e => !e.timeDefaulted).length;
      if (entries.length > bestCount ||
          (entries.length === bestCount && timedCount > bestTimedCount) ||
          (entries.length === bestCount && timedCount === bestTimedCount && !bestDate)) {
        bestCount = entries.length;
        bestTimedCount = timedCount;
        bestDate = date;
      }
    }

    const bestEntries = byDate.get(bestDate)!;
    // A date-only read is useful for date consensus but must never outvote a
    // real time read. Only fall back to defaulted entries when every read for
    // the winning date is missing its time.
    const timedEntries = bestEntries.filter(entry => !entry.timeDefaulted);
    const entriesForTime = timedEntries.length > 0 ? timedEntries : bestEntries;
    const byTime = new Map<string, typeof bestEntries>();
    for (const entry of entriesForTime) {
      // Keep defaulted noon separate from a genuinely OCR-read 12:00 time.
      const timeKey = entry.timeDefaulted ? '__defaulted__' : entry.dateTime.slice(11, 16);
      if (!byTime.has(timeKey)) byTime.set(timeKey, []);
      byTime.get(timeKey)!.push(entry);
    }

    // Timestamp consensus is the most common hour/minute among real time reads.
    // Ties prefer a read with non-zero seconds because it contains more timestamp information.
    let winningTimeKey = '';
    let winningEntries: typeof bestEntries = [];
    for (const [timeKey, entries] of byTime) {
      const currentIsDefaulted = timeKey === '__defaulted__';
      const winningIsDefaulted = winningTimeKey === '__defaulted__';
      const currentHasSeconds = entries.some(e => e.dateTime.slice(17, 19) !== '00');
      const winningHasSeconds = winningEntries.some(e => e.dateTime.slice(17, 19) !== '00');
      if (entries.length > winningEntries.length ||
          (entries.length === winningEntries.length && winningIsDefaulted && !currentIsDefaulted) ||
          (entries.length === winningEntries.length && currentIsDefaulted === winningIsDefaulted && currentHasSeconds && !winningHasSeconds)) {
        winningTimeKey = timeKey;
        winningEntries = entries;
      }
    }

    // Within the winning minute, prefer a non-defaulted and most-specific read.
    const winner = [...winningEntries].sort((a, b) => {
      if (a.timeDefaulted !== b.timeDefaulted) return a.timeDefaulted ? 1 : -1;
      const aHasSeconds = a.dateTime.slice(17, 19) !== '00';
      const bHasSeconds = b.dateTime.slice(17, 19) !== '00';
      if (aHasSeconds !== bHasSeconds) return aHasSeconds ? -1 : 1;
      return 0;
    })[0];

    return { dateTime: winner.dateTime, timeDefaulted: winner.timeDefaulted };
  };

  // Try increasingly generous strips from the very bottom of the image.
  // Normally the bar fits in the last ~3 %, but some cameras use a taller
  // band. Tried shortest-first so the first OCR call has the highest
  // text-to-noise ratio.
  const strips: { hRatio: number; targetH: number; label: string }[] = [
    { hRatio: 0.03, targetH: 480, label: '3%-480' },
    { hRatio: 0.06, targetH: 360, label: '6%-360' },
    { hRatio: 0.12, targetH: 280, label: '12%-280' },
    // If those all miss, widen further but keep the up-scale high
    { hRatio: 0.18, targetH: 240, label: '18%-240' },
  ];

  // Run every preprocessing strategy for every strip so consensus can reject
  // a single noisy OCR read. This is intentionally exhaustive: the previous
  // speed optimization returned on the first valid parse and reduced timestamp
  // accuracy on roughly one in five photos.
  const tryStrip = async (
    worker: any,
    hRatio: number,
    targetH: number,
    label: string,
    results: Array<{ dateTime: string; timeDefaulted: boolean; label: string }>,
  ): Promise<void> => {
    const cropH = Math.round(img.height * hRatio);
    const cropY = img.height - cropH;

    // Cap the OCR strip at 4096px. The timestamp characters remain large
    // enough for Tesseract, while avoiding multi-megapixel recognition passes
    // on modern 4K/8K trail-cam photos.
    const MAX_CANVAS_W = 4096;
    let canvasW = Math.round(img.width * (targetH / cropH));
    if (canvasW > MAX_CANVAS_W) {
      const scale = MAX_CANVAS_W / canvasW;
      canvasW = MAX_CANVAS_W;
      targetH = Math.round(targetH * scale);
    }
    // Minimum dimension guard: Tesseract's internal scaler crashes on
    // images smaller than ~100px in either dimension.
    const MIN_DIM = 100;
    if (canvasW < MIN_DIM) canvasW = MIN_DIM;
    if (targetH < MIN_DIM) targetH = MIN_DIM;

    const tmp = document.createElement('canvas');
    tmp.width = canvasW;
    tmp.height = targetH;
    const ctx = tmp.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Draw the bottom strip of the ORIGINAL image at the up-scaled size
    ctx.drawImage(img, 0, cropY, img.width, cropH, 0, 0, canvasW, targetH);

    // A transient Tesseract recognition error on one preprocessing variant
    // must not discard the other variants or the remaining strips.
    const recognize = async (source: string | HTMLCanvasElement, stage: string): Promise<string> => {
      try {
        return (await worker.recognize(source)).data.text || '';
      } catch (error) {
        console.warn(`[OCR] ${stage} recognition failed; continuing with other variants:`, error);
        return '';
      }
    };

    // ─ Strategy A: raw (colour) image — works when contrast is high ─
    const rawText = await recognize(tmp, `${label} raw`);
    rawTexts.push(`[${label} raw] ${rawText.slice(0, 200)}`);
    let r = checkResult(parseOCRTextToISO(rawText));
    if (r) {
      results.push({ ...r, label: `${label} raw` });
    }

    // ─ Strategy B: invert (white-on-dark → black-on-white) ─
    invertCanvas(tmp, ctx);
    const invText = await recognize(tmp, `${label} inverted`);
    rawTexts.push(`[${label} inv] ${invText.slice(0, 200)}`);
    r = checkResult(parseOCRTextToISO(invText));
    if (r) {
      results.push({ ...r, label: `${label} inv` });
    }

    // ─ Strategy C: binarize the inverted image ─
    const thresh = computeOtsuThreshold(ctx, canvasW, targetH);
    const bwCanvas = binarizeForOCR(ctx, canvasW, targetH, thresh, false);
    if (bwCanvas) {
      const bwText = await recognize(bwCanvas, `${label} binarized`);
      rawTexts.push(`[${label} bw] ${bwText.slice(0, 200)}`);
      r = checkResult(parseOCRTextToISO(bwText));
      if (r) {
        results.push({ ...r, label: `${label} bw` });
      }
    }
  };

  // Setup the worker (reuse or create) then iterate PSMs × strips
  try {
    const worker = existingWorker
      ? existingWorker
      : (await (await import('tesseract.js')).createWorker('eng'));

    const shouldTerminate = !existingWorker;

    try {
      // ── Phase 1: PSM 7 (single uniform line — best for timestamp bars) ──
      // Run every strip and preprocessing strategy before resolving consensus.
      // A single valid result is not trusted over the other reads.
      await worker.setParameters({ tessedit_pageseg_mode: '7' });
      const psm7Results: Array<{ dateTime: string; timeDefaulted: boolean; label: string }> = [];
      for (let si = 0; si < strips.length; si++) {
        const { hRatio, targetH, label } = strips[si];
        await tryStrip(worker, hRatio, targetH, `PSM7 ${label}`, psm7Results);
        await new Promise((r) => setTimeout(r, 0));
      }

      const consensus = resolveConsensus(psm7Results);
      if (consensus) {
        return { dateTime: consensus.dateTime, timeDefaulted: consensus.timeDefaulted, rawTexts };
      }

      // ── Phase 2: PSM 3 (auto page segmentation — fallback for wider timestamp bars) ──
      // Use the same exhaustive collection and consensus fallback when PSM7
      // could not produce a valid timestamp.
      await worker.setParameters({ tessedit_pageseg_mode: '3' });
      const psm3Results: Array<{ dateTime: string; timeDefaulted: boolean; label: string }> = [];
      for (let si = 0; si < strips.length; si++) {
        const { hRatio, targetH, label } = strips[si];
        await tryStrip(worker, hRatio, targetH, `PSM3 ${label}`, psm3Results);
        await new Promise((r) => setTimeout(r, 0));
      }

      const consensus3 = resolveConsensus(psm3Results);
      if (consensus3) {
        return { dateTime: consensus3.dateTime, timeDefaulted: consensus3.timeDefaulted, rawTexts };
      }
    } finally {
      if (shouldTerminate) await worker.terminate();
    }
  } catch (e) {
    console.warn('[OCR] Failed to extract date:', e);
  }

  return { rawTexts };
}

// ---- Bulk re-OCR for previously failed photos ----
// Re-runs the improved OCR engine on photos that already failed (or have
// no dateTime). Updates IndexedDB in place; never touches file.lastModified.
export async function reRunOcrOnPhotos(
  photoIds: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<{ updated: number; stillFailed: number }> {
  let updated = 0;
  let stillFailed = 0;

  // Reuse the shared warm pool instead of creating (and re-downloading) a
  // fresh Tesseract worker — this flow had the same start-of-job stall.
  await ensureOcrPool(1);
  const ocrWorker = ocrPool[0];
  if (!ocrWorker) {
    console.warn('[OCR] reRunOcrOnPhotos: failed to init worker.');
    throw new Error(
      'Re-OCR unavailable: the OCR engine failed to initialize. Check Network for blocked CDN requests and try again.'
    );
  }

  for (let i = 0; i < photoIds.length; i++) {
    const id = photoIds[i];
    try {
      const blob = await getFullImageBlob(id);
      if (!blob) {
        stillFailed++;
        onProgress?.(i + 1, photoIds.length);
        continue;
      }
      const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      const file = new File([blob], `reocr_${id}.${ext}`, { type: blob.type });
      const ocrResult = await extractDateFromImageOCR(file, ocrWorker);
      if (ocrResult.dateTime) {
        await updatePhoto(id, { dateTime: ocrResult.dateTime, timeDefaulted: ocrResult.timeDefaulted });
        updated++;
      } else {
        stillFailed++;
      }
    } catch (e) {
      console.warn(`[OCR] reRunOcrOnPhotos: failed for "${id}":`, e);
      stillFailed++;
    }
    onProgress?.(i + 1, photoIds.length);
    // Yield to the event loop so the gallery stays responsive on long batches
    await new Promise((r) => setTimeout(r, 0));
  }

  // Pool workers are shared and kept warm for future batches — do not terminate.
  return { updated, stillFailed };
}

// ---- Filename Date Parsing (fallback when OCR fails) ----
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

// ---- Shared OCR worker pool ----
// Creating a Tesseract worker downloads the OCR core + English language data
// (~10+ MB on the first run) and takes several seconds. Previously the import
// awaited pool creation before touching a single photo — which is exactly the
// "waits for a few seconds, then suddenly everything processes at once" stall.
// The pool is created eagerly (warmUpOcrEngine), shared across imports, and
// grown on demand, so the import fast path never blocks on it.
const ocrPool: any[] = [];
let ocrPoolGrowing: Promise<void> | null = null;

async function ensureOcrPool(targetCount: number): Promise<void> {
  if (ocrPool.length >= targetCount) return;
  if (ocrPoolGrowing) {
    await ocrPoolGrowing;
    // The awaited grow may have been for a smaller target; top up if needed.
    if (ocrPool.length >= targetCount) return;
  }
  const missing = targetCount - ocrPool.length;
  if (missing <= 0) return;

  // Claim the grow slot synchronously so concurrent callers queue up instead
  // of creating duplicate workers.
  let resolveGrow!: () => void;
  ocrPoolGrowing = new Promise<void>((resolve) => { resolveGrow = resolve; });
  (async () => {
    try {
      const { createWorker } = await import('tesseract.js');
      const batch = await Promise.all(
        Array.from({ length: missing }, async (_, workerIndex) => {
          try {
            return await createWorker('eng');
          } catch (workerErr) {
            console.warn(`[OCR] Worker ${ocrPool.length + workerIndex + 1}/${targetCount} failed to initialize:`, workerErr);
            return null;
          }
        })
      );
      ocrPool.push(...batch.filter((worker): worker is any => worker !== null));
      if (ocrPool.length === 0) {
        console.error(
          '[OCR] ⚠️ TESSERACT.JS FAILED TO INITIALIZE — EVERY PHOTO WILL SHOW "OCR Failed".\n' +
          'Check the Network tab in DevTools for failed requests.\n' +
          'You can still tap any "OCR Failed" badge in the gallery to set the date manually.'
        );
      }
    } catch (ocrInitErr) {
      console.error('[OCR] Failed to load Tesseract.js:', ocrInitErr);
    } finally {
      ocrPoolGrowing = null;
      resolveGrow();
    }
  })();
  await ocrPoolGrowing;
}

/**
 * Start warming the shared OCR worker pool in the background (fire-and-forget).
 * Call it when the Trail Cams tab opens so the engine is usually ready by the
 * time the user picks files — eliminating the multi-second stall at the start
 * of the first import while Tesseract downloads its core + language data.
 */
export function warmUpOcrEngine(): void {
  const availableCores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  const maxWorkers = availableCores >= 8 ? 4 : availableCores >= 4 ? 3 : 2;
  void ensureOcrPool(maxWorkers).catch(() => {});
}

// ---- Import Photos ----
export async function importPhotos(files: FileList | File[], onProgress?: (completed: number, total: number) => void): Promise<TrailCameraPhoto[]> {
  const fileArray = Array.from(files);
  // Keep the returned list in file-selection order even though OCR workers
  // finish photos independently.
  const imported: Array<TrailCameraPhoto | undefined> = new Array(files.length);
  let completedCount = 0;

  // Warm up the shared OCR worker pool IN THE BACKGROUND. It must not gate the
  // import: photos whose filenames already carry a timestamp are processed
  // immediately, and only photos that genuinely need OCR wait for a worker —
  // by which time the pool is usually ready anyway (it also starts warming the
  // moment the Trail Cams tab opens, see warmUpOcrEngine).
  const availableCores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  const maxWorkers = availableCores >= 8 ? 4 : availableCores >= 4 ? 3 : 2;
  const filesNeedingOcr = fileArray.filter((file) => !validateFilenameDate(parseDateFromFilename(file.name))).length;
  const desiredWorkerCount = Math.min(maxWorkers, filesNeedingOcr, availableCores);
  const warmupPromise = desiredWorkerCount > 0
    ? ensureOcrPool(desiredWorkerCount)
    : Promise.resolve();

  // Open a single DB connection for the entire import batch.
  // Reusing one connection avoids the per-photo overhead of opening a new
  // connection + transaction pair for every IndexedDB write.
  let db: IDBDatabase | undefined;
  try {
    db = await openDB();
  } catch (dbErr) {
    console.error('[import] Failed to open IndexedDB:', dbErr);
  }

  // ---- Process photos with one dedicated worker per concurrent job ----
  // Each slot owns its pool worker for the whole batch, so parallel jobs
  // cannot interleave setParameters/recognize calls on a worker and
  // compromise OCR consensus. Slots run the filename-date fast path without
  // waiting for the pool to be ready.
  const CONCURRENCY = Math.max(1, desiredWorkerCount);
  let nextIndex = 0;

  const processOne = async (workerIndex: number): Promise<void> => {
    while (nextIndex < fileArray.length) {
      const i = nextIndex++;
      const file = fileArray[i];
      const id = `cam_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`;

      try {
        const filenameDate = validateFilenameDate(parseDateFromFilename(file.name));
        // Decode the source image once and share it between thumbnail and OCR.
        // The previous code created two object URLs and decoded every photo
        // twice before recognition even began.
        const decodedImage = await loadImageForOCR(file);
        const thumbnailPromise = decodedImage
          ? Promise.resolve().then(() => createThumbnailDataURL(decodedImage, 300))
          : generateThumbnailDataURL(file, 300);
        const [thumbnailDataUrl, ocrResult] = await Promise.all([
          thumbnailPromise,
          (async () => {
            // Date extraction: ONLY OCR reads the timestamp bar (or filename pattern).
            // We NEVER use file.lastModified as a fallback — it represents the file's
            // copy/download time, not the capture time.
            let dateTime: string | undefined = filenameDate;
            if (!dateTime) {
              // Only a photo that actually needs OCR waits on the pool — the
              // rest of the batch keeps flowing while it warms up.
              await warmupPromise;
              const ocrWorker = ocrPool[workerIndex];
              if (ocrWorker) {
                const result = await extractDateFromImageOCR(file, ocrWorker, decodedImage || undefined);
                return { dateTime: result.dateTime, timeDefaulted: result.timeDefaulted, rawTexts: result.rawTexts };
              }
            }
            return { dateTime, timeDefaulted: undefined as boolean | undefined, rawTexts: [] as string[] };
          })(),
        ]);

        const dateTime = ocrResult.dateTime;
        const timeDefaulted = ocrResult.timeDefaulted;
        // Only store raw OCR text when OCR fails (keep IndexedDB lean).
        // Cap at 8 entries / 1000 chars to avoid storing huge diagnostic strings.
        const rawOcrText = !dateTime && ocrResult.rawTexts.length > 0
          ? ocrResult.rawTexts.slice(0, 8).join(' | ').slice(0, 1000)
          : undefined;

        const photo: TrailCameraPhoto = {
          id,
          fileName: file.name,
          fileSize: file.size,
          importedAt: Date.now(),
          dateTime,
          timeDefaulted: dateTime ? timeDefaulted : undefined,
          isFavorite: false,
          rawOcrText,
        };

        // Write both stores in a SINGLE transaction instead of two
        // separate putInStore calls (each of which opened its own connection).
        // The File object IS a Blob — no need for new Blob([file]).
        if (db) {
          const tx = db.transaction([PHOTOS_STORE, FULL_IMAGES_STORE], 'readwrite');
          tx.objectStore(PHOTOS_STORE).put(photo);
          tx.objectStore(FULL_IMAGES_STORE).put({ id, blob: file, thumbnailUrl: thumbnailDataUrl || '' });
          await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => {
              notifyDataChanged();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          });
        } else {
          // Fallback: use the old helpers if DB connection failed
          await putInStore(PHOTOS_STORE, photo);
          await putInStore(FULL_IMAGES_STORE, { id, blob: file, thumbnailUrl: thumbnailDataUrl || '' });
        }

        imported[i] = photo;
      } catch (err) {
        console.warn(`Skipping file "${file.name}":`, err);
      }

      completedCount++;
      onProgress?.(completedCount, fileArray.length);
    }
  };

  // Run the bounded worker pool. The shared-index loop keeps progress updates
  // and cleanup behavior unchanged while preserving each photo's full OCR pass.
  await Promise.all(
    Array.from(
      { length: Math.min(CONCURRENCY, fileArray.length) },
      (_, workerIndex) => processOne(workerIndex)
    )
  );

  // Clean up. The shared OCR pool is intentionally NOT terminated here — it is
  // reused by the next import (and by reRunOcrOnPhotos) so the engine stays
  // warm instead of re-downloading the core + language data for every batch.
  try { db?.close(); } catch { /* ignore */ }

  return imported.filter((photo): photo is TrailCameraPhoto => photo !== undefined);
}

// ---- App-lifetime import coordinator ----
// TrailCameraView is mounted only while the Trail Cams app tab is selected. Keep
// the active import here instead of in the component so switching app tabs or
// minimizing the installed PWA does not tear down the upload/OCR job. Every
// completed photo is already durable in IndexedDB, so returning to Trail Cams
// can reload the gallery without losing work.
export interface PhotoImportStatus {
  importing: boolean;
  completed: number;
  total: number;
}

type PhotoImportListener = (status: PhotoImportStatus) => void;

let photoImportStatus: PhotoImportStatus = { importing: false, completed: 0, total: 0 };
let activePhotoImport: Promise<TrailCameraPhoto[]> | null = null;
const photoImportListeners = new Set<PhotoImportListener>();

function publishPhotoImportStatus(status: PhotoImportStatus): void {
  photoImportStatus = status;
  photoImportListeners.forEach((listener) => listener(status));
}

export function subscribeToPhotoImport(listener: PhotoImportListener): () => void {
  photoImportListeners.add(listener);
  listener(photoImportStatus);
  return () => photoImportListeners.delete(listener);
}

export function startPhotoImport(
  files: FileList | File[],
  defaultLocation?: TrailCameraLocation,
): Promise<TrailCameraPhoto[]> {
  if (activePhotoImport) return activePhotoImport;

  const fileArray = Array.from(files);
  publishPhotoImportStatus({ importing: true, completed: 0, total: fileArray.length });

  activePhotoImport = (async () => {
    try {
      const imported = await importPhotos(fileArray, (completed, total) => {
        publishPhotoImportStatus({ importing: true, completed, total });
      });

      // Assign as part of the app-lifetime job. This must not depend on the
      // TrailCameraView still being mounted when a user changes app tabs.
      if (defaultLocation) {
        for (const photo of imported) {
          if (!photo.cameraLocationId) {
            await updatePhoto(photo.id, {
              cameraLocationId: defaultLocation.id,
              cameraLocationName: defaultLocation.name,
              latitude: defaultLocation.latitude,
              longitude: defaultLocation.longitude,
            });
          }
        }
      }

      return imported;
    } finally {
      publishPhotoImportStatus({ importing: false, completed: fileArray.length, total: fileArray.length });
      activePhotoImport = null;
    }
  })();

  return activePhotoImport;
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

/** Store a full-resolution image while preserving its existing thumbnail. */
export async function saveFullImageBlob(id: string, blob: Blob): Promise<void> {
  const existing = await getFromStore<{ id: string; thumbnailUrl?: string }>(FULL_IMAGES_STORE, id);
  await putInStore(FULL_IMAGES_STORE, {
    ...existing,
    id,
    blob,
  });
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

// Restore a photo + its thumbnail entry from an imported backup. Full-res blobs
// aren't part of JSON backups, so the thumbnail keeps the gallery usable while
// the original file can be re-imported from the SD card if desired.
export async function savePhotoWithThumbnail(photo: TrailCameraPhoto, thumbnailUrl?: string): Promise<void> {
  await putInStore(PHOTOS_STORE, photo);
  // A backup contains metadata and a thumbnail, but a local device may already
  // have the original blob. Keep that blob while refreshing the lightweight
  // gallery preview instead of downgrading the local photo during a restore.
  const existing = await getFromStore<{ id: string; blob?: Blob; thumbnailUrl?: string }>(FULL_IMAGES_STORE, photo.id);
  await putInStore(FULL_IMAGES_STORE, {
    ...existing,
    id: photo.id,
    blob: existing?.blob,
    thumbnailUrl: thumbnailUrl || existing?.thumbnailUrl || '',
  });
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
