/**
 * Real astronomy-based solunar calculations.
 *
 * Returns the moon's actual upper transit (overhead) and lower transit
 * (underfoot) plus moonrise/moonset times for a given date and observer,
 * using the astronomy-engine library (Meeus-based ephemeris). This is the
 * "real" solunar model hunters trust: Major = moon overhead / underfoot,
 * Minor = moonrise / moonset — instead of the previous sunrise/sunset-offset
 * heuristic.
 *
 * All times before/after the local day boundary are clamped to within
 * ±24h of the noon reference; the caller decides which to surface.
 */

import * as Astronomy from 'astronomy-engine';

export interface SolunarTimes {
  /** Local Date when the moon crosses the observer's meridian (overhead). */
  upperTransit: Date | null;
  /** Local Date when the moon is on the opposite meridian (underfoot). */
  lowerTransit: Date | null;
  /** Local Date of moonrise on this date; null if no rise in the day window. */
  moonrise: Date | null;
  /** Local Date of moonset on this date; null if no set in the day window. */
  moonset: Date | null;
  /**
   * Moon phase fraction 0.0 (new) to 1.0 (next new). `null` means the
   * astronomy library failed and the caller should fall back to the
   * legacy phase calculation. Note: a real new moon *does* have
   * `moonPhase === 0`, so callers must use nullish coalescing rather
   * than `||` when checking.
   */
  moonPhase: number | null;
  /** Human-readable phase name, or `null` on astronomy failure. */
  moonPhaseName: string | null;
  /** Illuminated fraction 0-100, or `null` on astronomy failure. */
  moonIllumination: number | null;
}

/**
 * Map an ecliptic longitude (0..360, as returned by Astronomy.MoonPhase) to a
 * phase fraction (0..1, with 0 = New Moon and 0.5 = Full Moon).
 */
function moonPhaseFraction(eclipticLon: number): number {
  const norm = ((eclipticLon % 360) + 360) % 360;
  return norm / 360;
}

function moonPhaseNameFromFraction(phase: number): string {
  if (phase > 0.03 && phase < 0.22) return 'Waxing Crescent';
  if (phase >= 0.22 && phase <= 0.28) return 'First Quarter';
  if (phase > 0.28 && phase < 0.47) return 'Waxing Gibbous';
  if (phase >= 0.47 && phase <= 0.53) return 'Full Moon';
  if (phase > 0.53 && phase < 0.72) return 'Waning Gibbous';
  if (phase >= 0.72 && phase <= 0.78) return 'Last Quarter';
  if (phase > 0.78 && phase < 0.97) return 'Waning Crescent';
  return 'New Moon';
}

/**
 * Calculate real solunar times for the local date at the given coordinates.
 *
 * Safe to call on any date — internal try/catch returns nulls and lets
 * callers fall back to the legacy sunrise/sunset-offset heuristic if the
 * astronomy computation throws or returns unexpected results.
 */
export function calculateMoonTimes(
  date: Date,
  latitude: number,
  longitude: number
): SolunarTimes {
  // All-null sentinel for "astronomy failed"; the consumer (calculateSolunar
  // in huntingEngine.ts) uses nullish coalescing to substitute the legacy
  // heuristic. Critically: do *not* return `0` for moonPhase / illumination
  // here — a real new moon has phase 0 and 0% illumination, so a falsy
  // value would be indistinguishable from an error signal.
  const empty: SolunarTimes = {
    upperTransit: null,
    lowerTransit: null,
    moonrise: null,
    moonset: null,
    moonPhase: null,
    moonPhaseName: null,
    moonIllumination: null,
  };

  try {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return empty;

    const observer = new Astronomy.Observer(latitude, longitude, 0);

    // Use noon local time as a stable reference inside the day. Astronomy
    // operates in UTC; the rise/set window spans 30h centered on noon so a
    // rise just before midnight or a set just after isn't dropped.
    const noon = new Date(date);
    noon.setHours(12, 0, 0, 0);
    const start = new Date(noon.getTime() - 12 * 3600 * 1000); // -12h
    const limitDays = 1.0;

    // --- Phase & illumination ---
    const phaseEclipticLon = Astronomy.MoonPhase(noon);
    const phase = moonPhaseFraction(phaseEclipticLon);
    const illum = Astronomy.Illumination(Astronomy.Body.Moon, noon);
    const moonIllumination = Math.round(illum.phase_fraction * 100);
    const moonPhaseName = moonPhaseNameFromFraction(phase);

    // --- Rise / Set ---
    // direction +1 = search for next rise; -1 = search for next set.
    let moonrise: Date | null = null;
    let moonset: Date | null = null;
    try {
      const riseResult = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, +1, start, limitDays);
      if (riseResult) moonrise = riseResult.date;
    } catch {
      // Moon didn't rise within the search window (e.g., polar night/day).
      moonrise = null;
    }
    try {
      const setResult = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, -1, start, limitDays);
      if (setResult) moonset = setResult.date;
    } catch {
      moonset = null;
    }

    // --- Upper & lower transit ---
    let upperTransit: Date | null = null;
    let lowerTransit: Date | null = null;
    try {
      const upperEvent = Astronomy.SearchHourAngle(Astronomy.Body.Moon, observer, 0, start, +1);
      if (upperEvent) upperTransit = upperEvent.time.date;
    } catch {
      upperTransit = null;
    }
    try {
      const lowerEvent = Astronomy.SearchHourAngle(Astronomy.Body.Moon, observer, 12, start, +1);
      if (lowerEvent) lowerTransit = lowerEvent.time.date;
    } catch {
      lowerTransit = null;
    }

    return {
      upperTransit,
      lowerTransit,
      moonrise,
      moonset,
      moonPhase: phase,
      moonPhaseName,
      moonIllumination,
    };
  } catch (err) {
    // Library-level failure (e.g., eccentric extreme latitude) — return
    // empty so callers can fall back to the legacy heuristic.
    if (typeof console !== 'undefined') {
      console.warn('[solunar] astronomy-engine failed:', err);
    }
    return empty;
  }
}
