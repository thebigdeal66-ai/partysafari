/**
 * Crowd Pulse — domain types.
 *
 * Crowd Pulse is the city-scale read (MASTERPLAN §"Crowd Pulse"): where the
 * night's energy is concentrated and which way it is moving, aggregated over
 * geographic cells rather than venues.
 *
 * These types are the privacy boundary. Nothing below carries a user id, a
 * profile id, a coordinate belonging to a person, or anything that could be
 * replayed into a movement history:
 *
 * - The only per-person value that enters the engine is
 *   `CrowdPulseSignalInput.contributorToken`, an opaque digest produced by
 *   `anonymizeContributor`. It is counted and discarded; no output type has a
 *   field it could be written to.
 * - Every coordinate that leaves the engine is a *cell centre* derived from
 *   `venues.latitude/longitude` — a published venue attribute — never a
 *   position reported by a device.
 * - A bucket that has not cleared the contributor floor publishes no counts at
 *   all, so a cell with one person in it is indistinguishable from an empty one.
 */

/** Signals that mark a moment and therefore decay. */
export type CrowdPulseSignalKind = "checkin" | "story" | "rsvpGoing" | "rsvpInterested" | "event";

/**
 * Every kind a bucket reports a count for. `lit` is not a `CrowdPulseSignalKind`
 * because Lit never arrives as per-row input: the anonymising
 * `venue_lit_activity` view publishes no contributor identity, so Lit is
 * supplied per venue already decayed (see `CrowdPulseVenueInput.litDecayWeight`).
 */
export type CrowdPulseCountKey = CrowdPulseSignalKind | "lit";

export type CrowdPulseTrend = "rising" | "flat" | "falling";

/** `no-signal` is the below-the-floor state, never "zero people here". */
export type CrowdPulseLevel = "no-signal" | "quiet" | "building" | "busy" | "peak";

export type CrowdPulseCoordinate = {
  lat: number;
  lng: number;
};

/**
 * One venue's geographic anchor plus its pre-aggregated Lit heat.
 *
 * `latitude`/`longitude` are `unknown` rather than `number | null` on purpose:
 * they arrive straight off a nullable `float8` column through an untyped
 * Supabase row, and the engine is required to survive whatever actually turns
 * up there.
 */
export type CrowdPulseVenueInput = {
  venueId: string;
  latitude: unknown;
  longitude: unknown;
  /**
   * Sum of per-endorsement decay factors from `summarizeLitActivity`. Already
   * time-weighted, so the engine adds it at full value rather than decaying it
   * a second time.
   */
  litDecayWeight?: unknown;
  /** Active endorsement count, reported as `signalCounts.lit`. */
  litCount?: unknown;
};

/**
 * One venue-anchored signal event.
 *
 * There is no `userId` field and there will not be one. `contributorToken` is
 * an opaque digest whose only use is counting distinct contributors against the
 * privacy floor; it is never copied into a bucket or a summary.
 */
export type CrowdPulseSignalInput = {
  venueId: string;
  kind: CrowdPulseSignalKind;
  /** ISO-8601. Unparseable values drop the signal rather than dating it to now. */
  occurredAt: unknown;
  /**
   * Opaque digest from `anonymizeContributor`. Null for signals with no single
   * human behind them (a running event), which then add heat but cannot help a
   * cell clear the contributor floor.
   */
  contributorToken?: string | null;
};

export type CrowdPulseBucket = {
  /** Stable cell id derived from the binned coordinate. Same inputs, same id. */
  id: string;
  /** Coarse human label built from the cell centre, e.g. "38.34N, 75.08W". */
  label: string;
  /** Cell centre, for map rendering. Not a venue position and not a person's. */
  center: CrowdPulseCoordinate;
  /** Normalised 0–1 heat. Zero whenever `contributorFloorMet` is false. */
  intensity: number;
  /** Decayed, Party-Score-weighted signal total behind `intensity`. */
  weightedIntensity: number;
  level: CrowdPulseLevel;
  trend: CrowdPulseTrend;
  /** Per-kind counts. All zero whenever `contributorFloorMet` is false. */
  signalCounts: Record<CrowdPulseCountKey, number>;
  /**
   * Distinct contributors, reported only once the floor is cleared. Below the
   * floor this is 0 — publishing the real figure is the re-identification the
   * floor exists to prevent.
   */
  contributorCount: number;
  contributorFloorMet: boolean;
  /** 0–1 data sufficiency: how many signal kinds are present and how far past the floor the cell is. */
  confidence: number;
  /** Venues pooled into this cell. Venues are public entities; people are not. */
  venueIds: string[];
  updatedAt: string;
};

export type CrowdPulseSummary = {
  updatedAt: string;
  /** False when nothing cleared the floor — the caller's empty state. */
  hasSignal: boolean;
  /** Cells that cleared the contributor floor. */
  reportedBucketCount: number;
  /** Cells that exist but publish nothing. Exposed so the UI can say "too quiet to read" honestly. */
  suppressedBucketCount: number;
  /** Venues with a usable coordinate. */
  venueCount: number;
  /** Venues dropped for a missing or out-of-range coordinate. */
  excludedVenueCount: number;
  /** Sum of `weightedIntensity` across reported cells. */
  totalWeightedIntensity: number;
  /** Highest level any reported cell reached. */
  peakLevel: CrowdPulseLevel;
  /** City-wide direction, from the same two-window comparison the cells use. */
  trend: CrowdPulseTrend;
};

export type CrowdPulseResult = {
  buckets: CrowdPulseBucket[];
  summary: CrowdPulseSummary;
};
