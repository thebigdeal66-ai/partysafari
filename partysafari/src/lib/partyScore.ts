import { getCrowdLevel, type CrowdLevel } from "@/lib/venueCheckInUtils";

export type PartyScoreTrend = "up" | "down" | "stable";

export type PartyScore = {
  score: number;
  crowdLevel: CrowdLevel;
  momentum: number;
  trend: PartyScoreTrend;
  confidence: number;
  updatedAt: string;
};

export const DEFAULT_PARTY_SCORE: PartyScore = {
  score: 0,
  crowdLevel: "Quiet",
  momentum: 0,
  trend: "stable",
  confidence: 0,
  updatedAt: "",
};

function asFiniteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function toSafePartyScore(input: Partial<PartyScore> | null | undefined): PartyScore {
  if (!input) {
    return { ...DEFAULT_PARTY_SCORE };
  }

  return {
    score: asFiniteNumber(input.score, DEFAULT_PARTY_SCORE.score),
    crowdLevel: input.crowdLevel || DEFAULT_PARTY_SCORE.crowdLevel,
    momentum: asFiniteNumber(input.momentum, DEFAULT_PARTY_SCORE.momentum),
    trend: input.trend || DEFAULT_PARTY_SCORE.trend,
    confidence: asFiniteNumber(input.confidence, DEFAULT_PARTY_SCORE.confidence),
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : DEFAULT_PARTY_SCORE.updatedAt,
  };
}

export type PartyScoreSignals = {
  liveCheckins: number;
  activeStories: number;
  storyReactions: number;
  activeEvents: number;
  friendPresence: number;
  goingRsvps: number;
  interestedRsvps: number;
  recentActivity: number;
  recentCheckins: number;
  recentStories: number;
  recentStoryReactions: number;
  recentRsvpActivity: number;
  recentEventActivity: number;
  recentFriendActivity: number;
  /** Active Lit endorsements. Standing count, feeds baseEnergy. */
  litSignals: number;
  /** Lit endorsements inside the recent window. Feeds recencyLift. */
  recentLitSignals: number;
  /**
   * Sum of per-endorsement decay factors (see `litSignals.ts`). Continuous
   * rather than a count, and the only lit input to momentum: an endorsement
   * from an hour ago has to weigh less than one from a minute ago, which a
   * count cannot express.
   */
  litDecayWeight: number;
};

export type PartyScoreWeights = {
  liveCheckins: number;
  activeStories: number;
  storyReactions: number;
  activeEvents: number;
  friendPresence: number;
  goingRsvps: number;
  interestedRsvps: number;
  recentActivity: number;
  recentCheckins: number;
  recentStories: number;
  recentStoryReactions: number;
  recentRsvpActivity: number;
  recentEventActivity: number;
  recentFriendActivity: number;
  scoreDeltaMomentum: number;
  litSignals: number;
  recentLitSignals: number;
  litMomentum: number;
};

export type PartyScoreBreakdown = {
  baseEnergy: number;
  socialLift: number;
  eventLift: number;
  recencyLift: number;
};

export type PartyScoreDetails = PartyScore & {
  venueId: string;
  signals: PartyScoreSignals;
  breakdown: PartyScoreBreakdown;
  placeholders: string[];
};

export const DEFAULT_PARTY_SCORE_WEIGHTS: PartyScoreWeights = {
  liveCheckins: 0.34,
  activeStories: 5.4,
  storyReactions: 1.2,
  activeEvents: 8.6,
  friendPresence: 9.2,
  goingRsvps: 0.24,
  interestedRsvps: 0.1,
  recentActivity: 2.1,
  recentCheckins: 1.3,
  recentStories: 2.4,
  recentStoryReactions: 1.2,
  recentRsvpActivity: 0.9,
  recentEventActivity: 1.5,
  recentFriendActivity: 2.3,
  scoreDeltaMomentum: 2.6,
  // Lit is a stronger claim than presence — a check-in says "I am here", an
  // endorsement says "come now" — so one endorsement outweighs one check-in
  // (0.34) by a wide margin. It is also gated on an active check-in and capped
  // at one per venue per hour, so ten of them means ten distinct people in the
  // room. Unproven against real traffic: revisit after a week of Founding
  // cohort data before treating these three as tuned.
  litSignals: 1.6,
  recentLitSignals: 2.6,
  litMomentum: 3.4,
};

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function emptyPartyScore(venueId: string, updatedAt = new Date().toISOString()): PartyScoreDetails {
  return {
    venueId,
    score: 0,
    crowdLevel: getCrowdLevel(0),
    momentum: 0,
    trend: "stable",
    confidence: 0.35,
    updatedAt,
    signals: {
      liveCheckins: 0,
      activeStories: 0,
      storyReactions: 0,
      activeEvents: 0,
      friendPresence: 0,
      goingRsvps: 0,
      interestedRsvps: 0,
      recentActivity: 0,
      recentCheckins: 0,
      recentStories: 0,
      recentStoryReactions: 0,
      recentRsvpActivity: 0,
      recentEventActivity: 0,
      recentFriendActivity: 0,
      litSignals: 0,
      recentLitSignals: 0,
      litDecayWeight: 0,
    },
    breakdown: {
      baseEnergy: 0,
      socialLift: 0,
      eventLift: 0,
      recencyLift: 0,
    },
    placeholders: [],
  };
}

export function buildPartyScoreFromSignals({
  venueId,
  signals,
  confidence,
  updatedAt,
  placeholders = [],
  weights = DEFAULT_PARTY_SCORE_WEIGHTS,
  previous,
}: {
  venueId: string;
  signals: PartyScoreSignals;
  confidence: number;
  updatedAt: string;
  placeholders?: string[];
  weights?: PartyScoreWeights;
  previous?: PartyScore | null;
}): PartyScoreDetails {
  const baseEnergy =
    signals.liveCheckins * weights.liveCheckins +
    signals.activeStories * weights.activeStories +
    signals.storyReactions * weights.storyReactions +
    signals.litSignals * weights.litSignals;

  const socialLift =
    signals.friendPresence * weights.friendPresence +
    signals.recentFriendActivity * weights.recentFriendActivity;

  const eventLift =
    signals.activeEvents * weights.activeEvents +
    signals.goingRsvps * weights.goingRsvps +
    signals.interestedRsvps * weights.interestedRsvps;

  const recencyLift =
    signals.recentActivity * weights.recentActivity +
    signals.recentCheckins * weights.recentCheckins +
    signals.recentStories * weights.recentStories +
    signals.recentStoryReactions * weights.recentStoryReactions +
    signals.recentRsvpActivity * weights.recentRsvpActivity +
    signals.recentEventActivity * weights.recentEventActivity +
    signals.recentLitSignals * weights.recentLitSignals;

  const rawScore = baseEnergy + socialLift + eventLift + recencyLift;
  const score = Math.round(clamp(rawScore, 0, 100));
  const previousScore = previous?.score ?? score;
  const delta = score - previousScore;

  // Lit enters momentum through `litDecayWeight` and nowhere else. It is
  // deliberately kept out of `recentActivity` — every other signal increments
  // that counter, but doing so here would give an endorsement a flat momentum
  // step that persists unchanged for the whole 45-minute window, which is the
  // opposite of the decaying behaviour the endorsement is supposed to have.
  const momentumRaw =
    signals.recentActivity * weights.recentActivity +
    signals.recentStories * 2 +
    signals.recentStoryReactions * 1.4 +
    signals.recentFriendActivity * 2.1 +
    signals.litDecayWeight * weights.litMomentum +
    delta * weights.scoreDeltaMomentum;

  const momentum = Math.round(clamp(momentumRaw, -99, 99));
  const trend = momentum >= 8 || delta >= 4 ? "up" : momentum <= -8 || delta <= -4 ? "down" : "stable";

  return {
    venueId,
    score,
    crowdLevel: getCrowdLevel(signals.liveCheckins),
    momentum,
    trend,
    confidence: Math.round(clamp(confidence, 0, 1) * 100) / 100,
    updatedAt,
    signals,
    breakdown: {
      baseEnergy: Math.round(baseEnergy * 10) / 10,
      socialLift: Math.round(socialLift * 10) / 10,
      eventLift: Math.round(eventLift * 10) / 10,
      recencyLift: Math.round(recencyLift * 10) / 10,
    },
    placeholders,
  };
}