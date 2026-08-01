import { clamp, DEFAULT_PARTY_SCORE_WEIGHTS, type PartyScoreWeights } from "@/lib/partyScore";
import type {
  CrowdPulseBucket,
  CrowdPulseCoordinate,
  CrowdPulseCountKey,
  CrowdPulseLevel,
  CrowdPulseResult,
  CrowdPulseSignalInput,
  CrowdPulseSignalKind,
  CrowdPulseSummary,
  CrowdPulseTrend,
  CrowdPulseVenueInput,
} from "@/lib/crowdPulseTypes";

/**
 * Crowd Pulse — the pure engine.
 *
 * No React, no Supabase, no `window`, no `Date.now()` unless the caller declines
 * to supply a clock. Given the same inputs and the same `now`, this module
 * returns the same object every time; that is what makes it testable and what
 * lets `useCrowdPulse` stay a thin read.
 *
 * Three rules, inherited from the discipline `psi.ts` established over
 * `partyScoreEngine.ts`:
 *
 * 1. **It does not fork the math.** Every weight comes out of
 *    `DEFAULT_PARTY_SCORE_WEIGHTS`. `CROWD_PULSE_CONFIG.weightKeys` maps a Crowd
 *    Pulse signal onto the Party Score weight it already has, so a check-in
 *    counts the same toward a cell's heat as it does toward its venue's score.
 *    Crowd Pulse never recomputes a Party Score and never rescales one.
 * 2. **It does not fabricate activity.** A malformed coordinate drops a venue, a
 *    malformed timestamp drops a signal, and neither is rounded up into
 *    something plausible.
 * 3. **It degrades rather than fails.** Missing inputs shrink the read; they do
 *    not throw. An empty city returns `emptyCrowdPulse`, not an exception.
 *
 * The privacy floor is the one rule that is not a matter of taste. MASTERPLAN
 * §"Crowd Pulse" calls minimum cohort size non-negotiable: a cell below the
 * floor publishes `level: "no-signal"` and zeroes, never a small precise number,
 * because small precise numbers are re-identifiable.
 */

export type CrowdPulseConfig = {
  /**
   * Grid cell size in degrees. 0.005° is ~555 m north-south and ~440 m
   * east-west at Ocean City's latitude — a few blocks, deliberately coarser
   * than a single venue so that a cell is a place rather than a business.
   * MASTERPLAN calls for binned cells, not raw coordinates; this is that bin.
   */
  binSizeDegrees: number;
  /**
   * Distinct contributors a *cell* needs before it publishes anything. Three is
   * the smallest number at which "who was in that cell" stops being a guess
   * with even odds. Expect to raise it once real venue density is observed —
   * the rollout plan tunes this constant rather than the code.
   *
   * It is a floor on the cell, and deliberately not a second floor on each
   * venue inside it: Crowd Pulse reports how busy an area is, not how busy any
   * one business is, so three people spread across the venues on a block is a
   * legitimate read of that block.
   */
  minContributors: number;
  /**
   * Half-life of a momentary signal. At 30 minutes a check-in from two hours
   * ago is worth a sixteenth of one from just now, which is the difference
   * between "the boardwalk is filling" and "somebody was there after dinner".
   * Longer than Lit's 20-minute half-life on purpose: a check-in is a weaker,
   * slower claim than an endorsement.
   */
  decayHalfLifeMinutes: number;
  /**
   * Hard cut-off. Past this a signal contributes nothing, so decay and the
   * window can never disagree about whether something still counts. Two hours
   * covers the arc of a night's movement without dragging the early evening
   * into the late one.
   */
  signalWindowMinutes: number;
  /**
   * Length of each half of the two-window trend comparison. Twenty minutes is
   * short enough to catch a room filling and long enough that three arrivals in
   * a row do not read as a stampede.
   */
  trendWindowMinutes: number;
  /**
   * Relative change required to call a direction. Below ±20% the two windows
   * are treated as the same reading, which keeps arrows from flickering between
   * polls on noise.
   */
  trendChangeRatio: number;
  /**
   * Weighted points a window needs before a direction is claimed at all. One
   * point is roughly three check-ins; under that there is not enough happening
   * for "rising" to mean anything.
   */
  trendMinIntensity: number;
  /**
   * Weighted points that read as fully saturated.
   *
   * **Provisional beta calibration constant — not yet calibrated against real
   * production nightlife data.** The current value is an analytical estimate
   * (roughly one running event, three live stories and a dozen fresh check-ins
   * in one cell), not a figure measured from observed traffic. Read that as a
   * placeholder with a plausible magnitude, not as a validated threshold.
   *
   * What this does and does not compromise:
   *
   * - **Relative ordering and trend are trustworthy now.** `intensityReference`
   *   is a single positive divisor applied identically to every cell, so it
   *   cannot reorder them; and `trend` is a two-window comparison of undecayed
   *   weights that never touches this constant at all. Which block is hottest,
   *   and which way it is moving, are usable before calibration.
   * - **Absolute labels are provisional.** `intensity` and the `CrowdPulseLevel`
   *   it resolves to (`quiet` / `building` / `busy` / `peak`) are only as
   *   meaningful as this divisor. Until it is calibrated, treat any absolute
   *   claim — "this cell is busy" — as unverified, and do not put one in front
   *   of a user as fact.
   *
   * Tuning it is a prerequisite for public rollout: collect observed Ocean City
   * activity with the `crowdPulse` flag still off, take the weighted total that
   * genuinely corresponds to a packed cell, and set this to that. Normalising
   * against a fixed reference rather than the hottest cell of the moment is
   * itself deliberate — an adaptive percentile would make a quiet city's
   * least-quiet block read as `peak`, which is a worse failure than an
   * uncalibrated scale.
   */
  intensityReference: number;
  /**
   * Upper bound of `quiet`. Signals present, nothing you would cross town for.
   * Provisional along with `intensityReference`: these ceilings sit on the
   * normalised scale that constant defines, so they inherit its uncertainty.
   */
  quietCeiling: number;
  /** Upper bound of `building`. Provisional — see `intensityReference`. */
  buildingCeiling: number;
  /** Upper bound of `busy`; at or above it a cell is `peak`. Provisional — see `intensityReference`. */
  busyCeiling: number;
  /**
   * Most cells returned. Orientation is the point (MASTERPLAN: "the second is
   * orientation"); a list longer than this is a data dump, not a map read.
   */
  maxBuckets: number;
  /**
   * Kinds that describe a condition holding continuously rather than a moment.
   * A running event is on for as long as it runs, so it enters at full weight
   * and stays out of the trend windows, where it would otherwise read as a
   * fresh arrival every single poll.
   */
  standingKinds: readonly CrowdPulseSignalKind[];
  /**
   * The Party Score weight each Crowd Pulse signal borrows. This is a pointer
   * table, not a weight table — the numbers live in
   * `DEFAULT_PARTY_SCORE_WEIGHTS` and only there.
   */
  weightKeys: Readonly<Record<CrowdPulseCountKey, keyof PartyScoreWeights>>;
};

/**
 * Beta calibration status, as of this commit:
 *
 * `intensityReference` — and therefore `intensity` and every absolute level
 * label derived from it — is **provisional and uncalibrated**. It has never
 * been checked against real production nightlife data. Relative ordering
 * between cells and the `trend` direction are unaffected and can be relied on;
 * "this cell is `busy`" cannot, until the constant is tuned against observed
 * Ocean City activity. That tuning is a gate on public rollout, which is why
 * the `crowdPulse` feature flag ships off. See the field docs above.
 */
export const CROWD_PULSE_CONFIG: CrowdPulseConfig = {
  binSizeDegrees: 0.005,
  minContributors: 3,
  decayHalfLifeMinutes: 30,
  signalWindowMinutes: 120,
  trendWindowMinutes: 20,
  trendChangeRatio: 0.2,
  trendMinIntensity: 1,
  // PROVISIONAL BETA CALIBRATION CONSTANT. Estimated, not measured. Retune from
  // observed Ocean City activity before any public rollout.
  intensityReference: 40,
  quietCeiling: 0.2,
  buildingCeiling: 0.45,
  busyCeiling: 0.75,
  maxBuckets: 12,
  standingKinds: ["event"],
  weightKeys: {
    checkin: "liveCheckins",
    story: "activeStories",
    event: "activeEvents",
    rsvpGoing: "goingRsvps",
    rsvpInterested: "interestedRsvps",
    lit: "litSignals",
  },
};

const MINUTE_MS = 60_000;
const COUNT_KEYS: readonly CrowdPulseCountKey[] = ["checkin", "story", "event", "rsvpGoing", "rsvpInterested", "lit"];

function emptyCounts(): Record<CrowdPulseCountKey, number> {
  return { checkin: 0, story: 0, event: 0, rsvpGoing: 0, rsvpInterested: 0, lit: 0 };
}

function round(value: number, places: number) {
  const factor = Math.pow(10, places);
  return Math.round(value * factor) / factor;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function asNonNegative(value: unknown): number {
  const parsed = asFiniteNumber(value);
  return parsed !== null && parsed > 0 ? parsed : 0;
}

function parseIso(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveConfig(overrides?: Partial<CrowdPulseConfig>): CrowdPulseConfig {
  const merged = { ...CROWD_PULSE_CONFIG, ...(overrides || {}) };
  // A non-positive bin size would divide every coordinate into infinity and
  // collapse the whole city into one unusable cell id.
  if (!(merged.binSizeDegrees > 0)) {
    merged.binSizeDegrees = CROWD_PULSE_CONFIG.binSizeDegrees;
  }
  return merged;
}

/**
 * Turn a raw contributor identifier into an opaque token.
 *
 * Two FNV-1a passes under different salts, concatenated. This is a stable
 * pseudonym, not a cryptographic guarantee, and it does not need to be one: the
 * token exists so `buildCrowdPulse` can count *distinct* contributors, it is
 * never stored and there is no output field it could be written to. Callers
 * must run identifiers through this before handing them to the engine so that
 * raw ids never cross the boundary in the first place.
 *
 * A collision merges two contributors into one, which lowers a cell's count and
 * makes suppression more likely — the safe direction to be wrong in.
 */
export function anonymizeContributor(raw: string): string {
  if (typeof raw !== "string" || raw.length === 0) {
    return "";
  }

  const hash = (salt: number) => {
    let value = salt;
    for (let index = 0; index < raw.length; index += 1) {
      value ^= raw.charCodeAt(index);
      value = Math.imul(value, 16_777_619);
    }
    return (value >>> 0).toString(16).padStart(8, "0");
  };

  return `${hash(0x811c9dc5)}${hash(0x01000193)}`;
}

/**
 * Weight of a momentary signal at `ageMs` old, on a 0–1 scale.
 *
 * Exponential, matching `litDecayFactor` — the curve has to be steepest in the
 * first half hour, because that is where the difference between "filling" and
 * "filled" lives. Returns 0 past the window so nothing outlives its cut-off.
 */
export function crowdPulseDecayFactor(ageMs: number, config: Partial<CrowdPulseConfig> = {}): number {
  const { decayHalfLifeMinutes, signalWindowMinutes } = resolveConfig(config);
  if (!Number.isFinite(ageMs) || ageMs <= 0) {
    return 1;
  }
  if (ageMs >= signalWindowMinutes * MINUTE_MS) {
    return 0;
  }
  return Math.pow(2, -ageMs / (decayHalfLifeMinutes * MINUTE_MS));
}

export type CrowdPulseCell = {
  id: string;
  center: CrowdPulseCoordinate;
};

/**
 * Bin a venue coordinate into a grid cell, or reject it.
 *
 * Rejection covers the three ways `venues.latitude/longitude` disappoints:
 * null (the column is nullable), non-numeric (untyped rows), and out of range
 * (a swapped pair or a bad import). None of them get a guessed cell.
 */
export function toCrowdPulseCell(
  latitude: unknown,
  longitude: unknown,
  config: Partial<CrowdPulseConfig> = {}
): CrowdPulseCell | null {
  const { binSizeDegrees } = resolveConfig(config);
  const lat = asFiniteNumber(latitude);
  const lng = asFiniteNumber(longitude);

  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }

  const latIndex = Math.floor(lat / binSizeDegrees);
  const lngIndex = Math.floor(lng / binSizeDegrees);

  return {
    id: `cp:${latIndex}:${lngIndex}`,
    center: {
      lat: round((latIndex + 0.5) * binSizeDegrees, 6),
      lng: round((lngIndex + 0.5) * binSizeDegrees, 6),
    },
  };
}

/** "38.338° N, 75.083° W" — coarse, and the only place a cell gets a name until neighbourhoods exist. */
export function describeCrowdPulseCell(center: CrowdPulseCoordinate): string {
  const lat = `${Math.abs(center.lat).toFixed(3)}° ${center.lat >= 0 ? "N" : "S"}`;
  const lng = `${Math.abs(center.lng).toFixed(3)}° ${center.lng >= 0 ? "E" : "W"}`;
  return `${lat}, ${lng}`;
}

export type NormalizedCrowdPulseSignal = {
  cellId: string;
  kind: CrowdPulseSignalKind;
  /** Party-Score-weighted value after decay. */
  weight: number;
  /** Undecayed weight, used by the trend windows so recency is not counted twice. */
  rawWeight: number;
  /** Milliseconds before `now`. `null` for standing signals, which have no age. */
  ageMs: number | null;
  contributorToken: string | null;
};

/**
 * Resolve, validate and time-weight raw signals against the venue grid.
 *
 * Anything that cannot be placed is dropped: a signal for an unknown venue, a
 * signal for a venue with no usable coordinate, a momentary signal with an
 * unparseable or future-window-exceeding timestamp. Dropping is the correct
 * behaviour — an unplaceable signal has no cell to be heat in.
 */
export function normalizeCrowdPulseSignals(
  signals: readonly CrowdPulseSignalInput[],
  cellIdByVenueId: ReadonlyMap<string, string>,
  nowMs: number,
  config: Partial<CrowdPulseConfig> = {},
  weights: PartyScoreWeights = DEFAULT_PARTY_SCORE_WEIGHTS
): NormalizedCrowdPulseSignal[] {
  const resolved = resolveConfig(config);
  const standing = new Set<CrowdPulseSignalKind>(resolved.standingKinds);
  const normalized: NormalizedCrowdPulseSignal[] = [];

  for (const signal of signals || []) {
    if (!signal || typeof signal.venueId !== "string") {
      continue;
    }
    const cellId = cellIdByVenueId.get(signal.venueId);
    const weightKey = resolved.weightKeys[signal.kind];
    if (!cellId || !weightKey) {
      continue;
    }

    const rawWeight = asNonNegative(weights[weightKey]);
    const token = typeof signal.contributorToken === "string" && signal.contributorToken.length > 0
      ? signal.contributorToken
      : null;

    if (standing.has(signal.kind)) {
      normalized.push({ cellId, kind: signal.kind, weight: rawWeight, rawWeight, ageMs: null, contributorToken: token });
      continue;
    }

    const occurredMs = parseIso(signal.occurredAt);
    if (occurredMs === null) {
      continue;
    }

    // Clamped at zero rather than dropped: a row written a second in the future
    // by clock skew is a real signal, not a malformed one.
    const ageMs = Math.max(0, nowMs - occurredMs);
    const decay = crowdPulseDecayFactor(ageMs, resolved);
    if (decay <= 0) {
      continue;
    }

    normalized.push({ cellId, kind: signal.kind, weight: rawWeight * decay, rawWeight, ageMs, contributorToken: token });
  }

  return normalized;
}

/**
 * Two-window direction for one cell.
 *
 * Both figures are undecayed weighted sums — comparing decayed ones would tilt
 * every cell toward "rising", because the current window is younger by
 * construction. The dead band is symmetric so a cell cannot be described as
 * both filling and draining on consecutive polls over the same noise.
 */
export function computeCrowdPulseTrend(
  currentWindow: number,
  previousWindow: number,
  config: Partial<CrowdPulseConfig> = {}
): CrowdPulseTrend {
  const { trendChangeRatio, trendMinIntensity } = resolveConfig(config);
  const current = asNonNegative(currentWindow);
  const previous = asNonNegative(previousWindow);

  if (current < trendMinIntensity && previous < trendMinIntensity) {
    return "flat";
  }
  if (previous <= 0) {
    return current >= trendMinIntensity ? "rising" : "flat";
  }

  const ratio = (current - previous) / previous;
  if (ratio >= trendChangeRatio) {
    return "rising";
  }
  if (ratio <= -trendChangeRatio) {
    return "falling";
  }
  return "flat";
}

/** Level from normalised intensity. Below the floor there is only one answer. */
export function resolveCrowdPulseLevel(
  intensity: number,
  contributorFloorMet: boolean,
  config: Partial<CrowdPulseConfig> = {}
): CrowdPulseLevel {
  const { quietCeiling, buildingCeiling, busyCeiling } = resolveConfig(config);
  if (!contributorFloorMet) {
    return "no-signal";
  }
  const value = asNonNegative(intensity);
  if (value < quietCeiling) {
    return "quiet";
  }
  if (value < buildingCeiling) {
    return "building";
  }
  if (value < busyCeiling) {
    return "busy";
  }
  return "peak";
}

const LEVEL_ORDER: readonly CrowdPulseLevel[] = ["no-signal", "quiet", "building", "busy", "peak"];

/** The read for a city with nothing in it. A shape, never a null. */
export function emptyCrowdPulse(updatedAt: string, venueCount = 0, excludedVenueCount = 0): CrowdPulseResult {
  return {
    buckets: [],
    summary: {
      updatedAt,
      hasSignal: false,
      reportedBucketCount: 0,
      suppressedBucketCount: 0,
      venueCount,
      excludedVenueCount,
      totalWeightedIntensity: 0,
      peakLevel: "no-signal",
      trend: "flat",
    },
  };
}

type CellAccumulator = {
  id: string;
  center: CrowdPulseCoordinate;
  venueIds: string[];
  counts: Record<CrowdPulseCountKey, number>;
  weighted: number;
  currentWindow: number;
  previousWindow: number;
  contributors: Set<string>;
};

export type BuildCrowdPulseInput = {
  venues: readonly CrowdPulseVenueInput[];
  signals: readonly CrowdPulseSignalInput[];
  /** Epoch milliseconds. Supply it in tests; production passes the fetch time. */
  now?: number;
  config?: Partial<CrowdPulseConfig>;
  weights?: PartyScoreWeights;
};

/**
 * Build the city read: bin, weight, decay, threshold, and direct.
 *
 * The order matters. Contributors are counted before anything is published, so
 * suppression happens before a number exists rather than by blanking one
 * afterwards — a suppressed cell's counts are never assembled at all.
 */
export function buildCrowdPulse(input: BuildCrowdPulseInput): CrowdPulseResult {
  const config = resolveConfig(input.config);
  const weights = input.weights || DEFAULT_PARTY_SCORE_WEIGHTS;
  const nowMs = asFiniteNumber(input.now) ?? Date.now();
  const updatedAt = new Date(nowMs).toISOString();
  const litWeight = asNonNegative(weights[config.weightKeys.lit]);

  const cellIdByVenueId = new Map<string, string>();
  const cells = new Map<string, CellAccumulator>();
  let excludedVenueCount = 0;

  for (const venue of input.venues || []) {
    if (!venue || typeof venue.venueId !== "string" || venue.venueId.length === 0) {
      continue;
    }
    const cell = toCrowdPulseCell(venue.latitude, venue.longitude, config);
    if (!cell) {
      excludedVenueCount += 1;
      continue;
    }

    cellIdByVenueId.set(venue.venueId, cell.id);
    const accumulator = cells.get(cell.id) || {
      id: cell.id,
      center: cell.center,
      venueIds: [],
      counts: emptyCounts(),
      weighted: 0,
      currentWindow: 0,
      previousWindow: 0,
      contributors: new Set<string>(),
    };
    accumulator.venueIds.push(venue.venueId);

    // Lit arrives per venue and already decayed. It adds heat but never a
    // contributor: `venue_lit_activity` publishes no identity, by design, so
    // there is nobody here to count toward the floor.
    accumulator.weighted += asNonNegative(venue.litDecayWeight) * litWeight;
    accumulator.counts.lit += Math.round(asNonNegative(venue.litCount));

    cells.set(cell.id, accumulator);
  }

  const venueCount = cellIdByVenueId.size;
  if (cells.size === 0) {
    return emptyCrowdPulse(updatedAt, venueCount, excludedVenueCount);
  }

  const trendWindowMs = config.trendWindowMinutes * MINUTE_MS;
  for (const signal of normalizeCrowdPulseSignals(input.signals || [], cellIdByVenueId, nowMs, config, weights)) {
    const cell = cells.get(signal.cellId);
    if (!cell) {
      continue;
    }

    cell.counts[signal.kind] += 1;
    cell.weighted += signal.weight;
    if (signal.contributorToken) {
      cell.contributors.add(signal.contributorToken);
    }

    if (signal.ageMs === null) {
      continue;
    }
    if (signal.ageMs < trendWindowMs) {
      cell.currentWindow += signal.rawWeight;
    } else if (signal.ageMs < trendWindowMs * 2) {
      cell.previousWindow += signal.rawWeight;
    }
  }

  const buckets: CrowdPulseBucket[] = [];
  let suppressedBucketCount = 0;
  let totalWeightedIntensity = 0;
  let cityCurrentWindow = 0;
  let cityPreviousWindow = 0;
  let peakLevelIndex = 0;

  for (const cell of cells.values()) {
    const contributorCount = cell.contributors.size;
    const contributorFloorMet = contributorCount >= config.minContributors;
    const venueIds = cell.venueIds.slice().sort();
    const base = {
      id: cell.id,
      label: describeCrowdPulseCell(cell.center),
      center: cell.center,
      venueIds,
      updatedAt,
    };

    if (!contributorFloorMet) {
      suppressedBucketCount += 1;
      buckets.push({
        ...base,
        intensity: 0,
        weightedIntensity: 0,
        level: "no-signal",
        trend: "flat",
        signalCounts: emptyCounts(),
        contributorCount: 0,
        contributorFloorMet: false,
        confidence: 0,
      });
      continue;
    }

    const weightedIntensity = round(cell.weighted, 3);
    const intensity = round(clamp(weightedIntensity / config.intensityReference, 0, 1), 3);
    const level = resolveCrowdPulseLevel(intensity, true, config);
    const activeKinds = COUNT_KEYS.filter((key) => cell.counts[key] > 0).length;
    const floorHeadroom = clamp(contributorCount / (config.minContributors * 2), 0, 1);
    const confidence = round(0.3 + (activeKinds / COUNT_KEYS.length) * 0.4 + floorHeadroom * 0.3, 2);

    totalWeightedIntensity += weightedIntensity;
    cityCurrentWindow += cell.currentWindow;
    cityPreviousWindow += cell.previousWindow;
    peakLevelIndex = Math.max(peakLevelIndex, LEVEL_ORDER.indexOf(level));

    buckets.push({
      ...base,
      intensity,
      weightedIntensity,
      level,
      trend: computeCrowdPulseTrend(cell.currentWindow, cell.previousWindow, config),
      signalCounts: { ...cell.counts },
      contributorCount,
      contributorFloorMet: true,
      confidence,
    });
  }

  // Reported cells first, hottest first. Suppressed cells are ordered by id and
  // never by their hidden intensity — the ordering itself would leak the ranking
  // the floor is meant to withhold.
  buckets.sort((left, right) => {
    if (left.contributorFloorMet !== right.contributorFloorMet) {
      return left.contributorFloorMet ? -1 : 1;
    }
    if (left.contributorFloorMet && right.weightedIntensity !== left.weightedIntensity) {
      return right.weightedIntensity - left.weightedIntensity;
    }
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });

  const reportedBucketCount = buckets.length - suppressedBucketCount;
  const summary: CrowdPulseSummary = {
    updatedAt,
    hasSignal: reportedBucketCount > 0,
    reportedBucketCount,
    suppressedBucketCount,
    venueCount,
    excludedVenueCount,
    totalWeightedIntensity: round(totalWeightedIntensity, 3),
    peakLevel: LEVEL_ORDER[peakLevelIndex],
    trend: computeCrowdPulseTrend(cityCurrentWindow, cityPreviousWindow, config),
  };

  return { buckets: buckets.slice(0, config.maxBuckets), summary };
}
