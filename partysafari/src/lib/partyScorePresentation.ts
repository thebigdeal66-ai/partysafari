import { toSafePartyScore, type PartyScore, type PartyScoreTrend } from "@/lib/partyScore";
import { getCrowdLevelDescription, type CrowdLevel } from "@/lib/venueCheckInUtils";

/**
 * Display layer for Party Score.
 *
 * This module never recomputes, rescales, or second-guesses a score — it reads
 * whatever `partyScoreEngine` produced and decides how that should read to a
 * human. A venue with no signals yet scores 0 with low confidence, which is
 * accurate but looks like a broken venue rather than an early one, so the
 * quiet end of the range is presented as an invitation instead of a number.
 */

/** Below this score, with no live signals at all, a venue has nothing to report yet. */
const BUILDING_SCORE_CEILING = 5;

/** Below this score a venue is genuinely early rather than busy. */
const WARMING_SCORE_CEILING = 25;

/** Party Score displays a confidence caveat below this, per the scoring spec. */
const LOW_CONFIDENCE_CEILING = 0.8;

export type PartyScoreDisplayState = "building" | "warming" | "live";

/**
 * Live signals used to tell "quiet tonight" apart from "no data yet". These are
 * the counts already rendered on the surface; nothing new is fetched for them.
 */
export type PartyScoreActivity = {
  liveCheckins?: number;
  storyCount?: number;
  friendsHereCount?: number;
  hasProgrammedEvent?: boolean;
};

export type PartyScorePresentation = {
  state: PartyScoreDisplayState;
  score: number;
  momentum: number;
  trend: PartyScoreTrend;
  confidence: number;
  confidencePercent: number;
  crowdLevel: CrowdLevel;
  /** Raw engine timestamp, passed through for `formatScoreUpdatedLabel`. */
  updatedAt: string;
  /** Short status line that replaces a bare "0" when there is nothing to show. */
  headline: string;
  /** Supporting sentence — an invitation while quiet, a read on the room once live. */
  detail: string;
  /** Momentum chip copy. Trend and momentum are one signal, so they render once. */
  momentumLabel: string;
  showScore: boolean;
  showMomentum: boolean;
  showConfidence: boolean;
};

function countActivity(activity: PartyScoreActivity): number {
  return (
    (activity.liveCheckins || 0) +
    (activity.storyCount || 0) +
    (activity.friendsHereCount || 0) +
    (activity.hasProgrammedEvent ? 1 : 0)
  );
}

function resolveState(score: number, activityTotal: number): PartyScoreDisplayState {
  if (activityTotal === 0 && score < BUILDING_SCORE_CEILING) {
    return "building";
  }
  if (score < WARMING_SCORE_CEILING) {
    return "warming";
  }
  return "live";
}

function buildHeadline(state: PartyScoreDisplayState, crowdLevel: CrowdLevel): string {
  if (state === "building") {
    return "Building Momentum";
  }
  if (state === "warming") {
    return "Warming Up";
  }
  return crowdLevel;
}

function buildDetail(state: PartyScoreDisplayState, crowdLevel: CrowdLevel, activityTotal: number): string {
  if (state === "building") {
    return "Be the first to check in tonight.";
  }
  if (state === "warming") {
    return activityTotal > 0 ? "Early crowd is arriving." : "First signals are landing.";
  }
  return getCrowdLevelDescription(crowdLevel);
}

function buildMomentumLabel(trend: PartyScoreTrend, momentum: number): string {
  if (trend === "up") {
    return `Climbing +${Math.abs(momentum)}`;
  }
  if (trend === "down") {
    return `Cooling -${Math.abs(momentum)}`;
  }
  return "Holding steady";
}

/**
 * Translate a Party Score into everything a surface needs to render it once.
 * Both the venue card and the Discover Tonight rows read from this so the same
 * score cannot disagree with itself in two places.
 */
export function describePartyScore(
  partyScore: Partial<PartyScore> | null | undefined,
  activity: PartyScoreActivity = {}
): PartyScorePresentation {
  const safe = toSafePartyScore(partyScore);
  const activityTotal = countActivity(activity);
  const state = resolveState(safe.score, activityTotal);
  const confidencePercent = Math.round(safe.confidence * 100);

  return {
    state,
    score: safe.score,
    momentum: safe.momentum,
    trend: safe.trend,
    confidence: safe.confidence,
    confidencePercent,
    crowdLevel: safe.crowdLevel,
    updatedAt: safe.updatedAt,
    headline: buildHeadline(state, safe.crowdLevel),
    detail: buildDetail(state, safe.crowdLevel, activityTotal),
    momentumLabel: buildMomentumLabel(safe.trend, safe.momentum),
    showScore: state !== "building",
    showMomentum: state !== "building" && safe.trend !== "stable",
    showConfidence: state !== "building" && safe.confidence < LOW_CONFIDENCE_CEILING,
  };
}

/**
 * Wall-clock freshness anchor for a score. Returns null when the engine has not
 * stamped the score yet, so callers can omit the line instead of printing "--".
 */
export function formatScoreUpdatedLabel(updatedAt: string): string | null {
  if (!updatedAt) {
    return null;
  }
  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
