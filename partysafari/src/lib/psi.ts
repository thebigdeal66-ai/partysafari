/**
 * PSI — PartySafari Intelligence, Phase 1.
 *
 * PSI is the interpretation layer that sits on top of the Party Score. It reads
 * the `PartyScoreDetails` that `partyScoreEngine` already produced and turns it
 * into sentences: why a venue is being surfaced, what its number means right
 * now, and when the room is moving faster than the score admits.
 *
 * Three rules hold this module in place, all of them from MASTERPLAN
 * §"PartySafari Intelligence (PSI)":
 *
 * 1. **PSI never forks the math.** Every point figure here is `signal value ×
 *    the canonical weight` read straight out of `DEFAULT_PARTY_SCORE_WEIGHTS`.
 *    There is no second scoring function, no rescaling, and no threshold that
 *    silently disagrees with the engine. `attributePartyScore` is checked
 *    against the engine's own `breakdown` in the unit tests, so if a weight
 *    changes or a signal is added, the tests fail rather than the two drifting.
 * 2. **PSI never fabricates activity.** Every reason carries the signal key and
 *    the raw observed value it came from, so a claim on screen is traceable to
 *    a row that exists. A quiet venue is described as quiet.
 * 3. **PSI degrades gracefully.** Given an empty score it returns a quiet read
 *    rather than nothing, and callers can ignore it entirely and fall back to
 *    the raw Party Score.
 *
 * Phase 1 needs no new tables. Everything below is derived from signals the
 * engine already gathers (`venue_checkins`, `stories`, `story_reactions`,
 * `events`, `event_rsvps`, `friendships`, and Lit) plus context the Discover
 * surface already holds.
 */

import {
  DEFAULT_PARTY_SCORE_WEIGHTS,
  type PartyScoreBreakdown,
  type PartyScoreDetails,
  type PartyScoreSignals,
  type PartyScoreWeights,
} from "@/lib/partyScore";

export type PsiInsightKind = "ranking" | "interpretation" | "anomaly";

export type PsiInsight = {
  id: string;
  kind: PsiInsightKind;
  /** One-line takeaway. */
  headline: string;
  /** Supporting sentence explaining the signal behind the takeaway. */
  detail: string;
};

/** A signal that contributes to the Party Score, and what it contributed. */
export type PsiAttribution = {
  /** Key on `PartyScoreSignals`, so a reason can be traced back to its input. */
  key: PsiSignalKey;
  /** Which `PartyScoreBreakdown` bucket the engine folds this into. */
  group: keyof PartyScoreBreakdown;
  /** Short noun phrase, e.g. "friends here". */
  label: string;
  /** Raw observed count. */
  value: number;
  /** `value × weight` — this signal's contribution to the score, before clamping. */
  points: number;
};

/** The traceable half of a reason: which signal said so, and how loudly. */
export type PsiEvidence = {
  key: PsiSignalKey | PsiContextKey;
  value: number;
  /** Party Score points contributed. Zero for context signals, which do not score. */
  points: number;
};

export type PsiReason = {
  id: string;
  /** One sentence, safe to render on its own. */
  text: string;
  evidence: PsiEvidence;
};

export type PsiExplanation = {
  venueId: string;
  /** The "Why this venue?" answer in one line. */
  headline: string;
  /** Ranked, strongest first. Empty when nothing cleared the bar. */
  reasons: PsiReason[];
  /** False when the venue is quiet — callers should show the quiet read instead. */
  hasEvidence: boolean;
  /** Set when the engine reported missing inputs, so the UI can hedge honestly. */
  caveat: string | null;
};

/**
 * Personalization inputs that are not Party Score signals. Every field is
 * already present on `DiscoverVenueCardData`; nothing new is fetched.
 */
export type PsiVenueContext = {
  distanceMiles?: number | null;
  /** Announced event or entertainment copy already rendered on the card. */
  programmedEvent?: string | null;
  /** The viewer saved an event at this venue. */
  savedEvent?: boolean;
  /** Genres shared between this venue and the viewer's save/RSVP history. */
  matchingGenres?: string[];
};

export type PsiContextKey = "distance" | "savedEvent" | "genreMatch";

export type PsiSignalKey =
  | "liveCheckins"
  | "activeStories"
  | "storyReactions"
  | "litSignals"
  | "friendPresence"
  | "recentFriendActivity"
  | "activeEvents"
  | "goingRsvps"
  | "interestedRsvps"
  | "recentActivity"
  | "recentCheckins"
  | "recentStories"
  | "recentStoryReactions"
  | "recentRsvpActivity"
  | "recentEventActivity"
  | "recentLitSignals";

type ContributionSpec = {
  key: PsiSignalKey;
  group: keyof PartyScoreBreakdown;
  label: string;
  /**
   * Prose for a "why this venue" reason. Omitted where a sentence would
   * double-count: `recentActivity` is an aggregate that every other recent
   * signal also increments, and the `recent*` counters restate their standing
   * counterparts. They still score, so they stay in the attribution — they just
   * do not get their own sentence.
   */
  sentence?: (value: number) => string;
};

/**
 * Mirrors `buildPartyScoreFromSignals` exactly: same signals, same buckets. The
 * unit tests reconcile the totals against the engine's `breakdown`, so this
 * table cannot fall out of step without CI noticing.
 */
const SCORE_CONTRIBUTIONS: ContributionSpec[] = [
  {
    key: "liveCheckins",
    group: "baseEnergy",
    label: "people checked in",
    sentence: (value) => (value === 1 ? "One person is checked in right now." : `${value} people are checked in right now.`),
  },
  {
    key: "activeStories",
    group: "baseEnergy",
    label: "live stories",
    sentence: (value) => (value === 1 ? "Someone is posting stories from here." : `${value} live stories are coming out of here.`),
  },
  {
    key: "storyReactions",
    group: "baseEnergy",
    label: "story reactions",
    sentence: (value) => `Stories from here picked up ${value} ${value === 1 ? "reaction" : "reactions"}.`,
  },
  {
    key: "litSignals",
    group: "baseEnergy",
    label: "Lit endorsements",
    sentence: (value) =>
      value === 1
        ? "Someone who was just here marked it Lit."
        : `${value} people who were just here marked it Lit.`,
  },
  {
    key: "friendPresence",
    group: "socialLift",
    label: "friends here",
    sentence: (value) => (value === 1 ? "One of your friends is here." : `${value} of your friends are here.`),
  },
  { key: "recentFriendActivity", group: "socialLift", label: "recent friend arrivals" },
  {
    key: "activeEvents",
    group: "eventLift",
    label: "events running",
    sentence: (value) => (value === 1 ? "An event is running right now." : `${value} events are running right now.`),
  },
  {
    key: "goingRsvps",
    group: "eventLift",
    label: "going RSVPs",
    sentence: (value) => (value === 1 ? "One person RSVP'd going tonight." : `${value} people RSVP'd going tonight.`),
  },
  {
    key: "interestedRsvps",
    group: "eventLift",
    label: "interested RSVPs",
    sentence: (value) => `${value} ${value === 1 ? "person is" : "people are"} interested in tonight's lineup.`,
  },
  { key: "recentActivity", group: "recencyLift", label: "recent activity" },
  { key: "recentCheckins", group: "recencyLift", label: "recent check-ins" },
  { key: "recentStories", group: "recencyLift", label: "recent stories" },
  { key: "recentStoryReactions", group: "recencyLift", label: "recent story reactions" },
  { key: "recentRsvpActivity", group: "recencyLift", label: "recent RSVPs" },
  { key: "recentEventActivity", group: "recencyLift", label: "recent event updates" },
  {
    key: "recentLitSignals",
    group: "recencyLift",
    label: "fresh Lit endorsements",
    sentence: (value) => `${value} ${value === 1 ? "person" : "people"} marked it Lit in the last stretch.`,
  },
];

/** A signal has to move the score by at least this much to earn a sentence. */
const MIN_REASON_POINTS = 1;

/** More than three reasons stops reading like an explanation and starts reading like a dump. */
const MAX_REASONS = 3;

/** Momentum this strong while the score is still low means the room is ahead of the number. */
const SURGE_MOMENTUM = 12;

/** Below this score a venue has not established itself yet, matching the presentation layer. */
const QUIET_SCORE_CEILING = 25;

/** Momentum this negative on an established score means the night is winding down here. */
const FADE_MOMENTUM = -12;

/** Party Score's own low-confidence bar. Kept identical so the two never disagree. */
const LOW_CONFIDENCE_CEILING = 0.8;

/** Walkable enough to be worth saying out loud. */
const NEARBY_MILES = 1.5;

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function hasAnyScoredSignal(signals: PartyScoreSignals): boolean {
  return SCORE_CONTRIBUTIONS.some((spec) => (signals[spec.key as keyof PartyScoreSignals] || 0) > 0);
}

/**
 * Break a Party Score down into per-signal contributions, strongest first.
 *
 * This is the traceability substrate for everything else in the module: each
 * entry says "this many of this thing, worth this many points", using the same
 * weights the engine used. It reads `details.signals`, never the raw database.
 */
export function attributePartyScore(
  details: PartyScoreDetails,
  weights: PartyScoreWeights = DEFAULT_PARTY_SCORE_WEIGHTS
): PsiAttribution[] {
  const signals = details.signals;

  return SCORE_CONTRIBUTIONS.map(({ key, group, label }) => {
    const value = signals[key as keyof PartyScoreSignals] || 0;
    return {
      key,
      group,
      label,
      value,
      points: round(value * weights[key as keyof PartyScoreWeights]),
    };
  })
    .filter((entry) => entry.value > 0)
    .sort((left, right) => right.points - left.points);
}

function contextReasons(context: PsiVenueContext): PsiReason[] {
  const reasons: PsiReason[] = [];

  if (context.savedEvent) {
    reasons.push({
      id: "savedEvent",
      text: "You saved an event here.",
      evidence: { key: "savedEvent", value: 1, points: 0 },
    });
  }

  const genre = (context.matchingGenres || []).find((value) => value.trim().length > 0);
  if (genre) {
    reasons.push({
      id: "genreMatch",
      text: `Plays ${genre.trim()}, which you keep going out for.`,
      evidence: { key: "genreMatch", value: (context.matchingGenres || []).length, points: 0 },
    });
  }

  const miles = context.distanceMiles;
  if (typeof miles === "number" && Number.isFinite(miles) && miles > 0 && miles <= NEARBY_MILES) {
    reasons.push({
      id: "distance",
      text: `Only ${miles < 1 ? "under a mile" : `${round(miles)} miles`} from you.`,
      evidence: { key: "distance", value: round(miles), points: 0 },
    });
  }

  return reasons;
}

function buildCaveat(details: PartyScoreDetails): string | null {
  if (details.placeholders.length > 0) {
    const list = details.placeholders.slice(0, 2).join(" and ");
    return `Working without ${list} right now, so this read is partial.`;
  }
  if (details.confidence < LOW_CONFIDENCE_CEILING) {
    return `Early read — ${Math.round(details.confidence * 100)}% confidence.`;
  }
  return null;
}

function quietHeadline(details: PartyScoreDetails, context: PsiVenueContext): string {
  const signals = details.signals;
  if (signals.goingRsvps > 0 || signals.interestedRsvps > 0) {
    return "Quiet now, but people are planning to come.";
  }
  if (signals.activeEvents > 0 || context.programmedEvent) {
    return "Quiet now — the night here has not started.";
  }
  return "Quiet right now — check back later.";
}

/**
 * Answer "Why this venue?" in one line plus up to three traceable sentences.
 *
 * Reasons are ranked by the points each signal actually contributed to the
 * Party Score, so the explanation orders itself the same way the score does.
 * Context reasons (a saved event, a genre match, distance) carry zero points —
 * they explain relevance to *this viewer* rather than energy in the room — and
 * so they sit behind the scored signals.
 */
export function explainVenue(details: PartyScoreDetails, context: PsiVenueContext = {}): PsiExplanation {
  const scored = attributePartyScore(details)
    .filter((entry) => entry.points >= MIN_REASON_POINTS)
    .map((entry): PsiReason | null => {
      const spec = SCORE_CONTRIBUTIONS.find((candidate) => candidate.key === entry.key);
      if (!spec?.sentence) {
        return null;
      }
      return {
        id: entry.key,
        text: spec.sentence(entry.value),
        evidence: { key: entry.key, value: entry.value, points: entry.points },
      };
    })
    .filter((reason): reason is PsiReason => reason !== null);

  const reasons = [...scored, ...contextReasons(context)].slice(0, MAX_REASONS);
  const hasEvidence = reasons.length > 0;

  return {
    venueId: details.venueId,
    headline: hasEvidence ? reasons[0].text : quietHeadline(details, context),
    reasons,
    hasEvidence,
    caveat: buildCaveat(details),
  };
}

function rankingInsight(details: PartyScoreDetails, explanation: PsiExplanation): PsiInsight | null {
  if (!explanation.hasEvidence) {
    return null;
  }

  const supporting = explanation.reasons
    .slice(1)
    .map((reason) => reason.text)
    .join(" ");

  return {
    id: `${details.venueId}:ranking`,
    kind: "ranking",
    headline: explanation.headline,
    detail: supporting || `That is what is putting this venue at ${details.score} tonight.`,
  };
}

function interpretationInsight(details: PartyScoreDetails, context: PsiVenueContext): PsiInsight {
  const signals = details.signals;
  const { score } = details;

  if (score <= 0 && !hasAnyScoredSignal(signals)) {
    return {
      id: `${details.venueId}:interpretation`,
      kind: "interpretation",
      headline: quietHeadline(details, context),
      detail: context.programmedEvent
        ? `Nothing live yet — ${context.programmedEvent} is what is on tonight.`
        : "No check-ins, stories, or RSVPs yet tonight. Be the first and the board will follow you.",
    };
  }

  if (score < QUIET_SCORE_CEILING) {
    return {
      id: `${details.venueId}:interpretation`,
      kind: "interpretation",
      headline: "Early, not empty.",
      detail:
        signals.goingRsvps > 0
          ? `${signals.goingRsvps} going ${signals.goingRsvps === 1 ? "RSVP has" : "RSVPs have"} landed but the room has not filled in yet.`
          : "The first signals are in. This is what the start of a night looks like.",
    };
  }

  const strongest = attributePartyScore(details)[0];
  return {
    id: `${details.venueId}:interpretation`,
    kind: "interpretation",
    headline: `${details.crowdLevel} — scoring ${details.score}.`,
    detail: strongest
      ? `Most of that is ${strongest.label} (${strongest.value}), worth ${strongest.points} points.`
      : `Holding at ${details.score}.`,
  };
}

function anomalyInsight(details: PartyScoreDetails): PsiInsight | null {
  if (details.momentum >= SURGE_MOMENTUM && details.score < QUIET_SCORE_CEILING) {
    return {
      id: `${details.venueId}:anomaly`,
      kind: "anomaly",
      headline: "Moving faster than its score.",
      detail: `Momentum is +${details.momentum} while the score is still ${details.score}. The room is filling in ahead of the number.`,
    };
  }

  if (details.momentum <= FADE_MOMENTUM && details.score >= QUIET_SCORE_CEILING) {
    return {
      id: `${details.venueId}:anomaly`,
      kind: "anomaly",
      headline: "Coming down from a bigger night.",
      detail: `The score still reads ${details.score}, but momentum is ${details.momentum} — this peaked earlier.`,
    };
  }

  return null;
}

/**
 * The full PSI read on a venue: why it is ranked here, what its score means,
 * and whether it is behaving unlike itself.
 *
 * Always returns at least one insight. That is the point — a venue with no
 * signals produces a sentence about being quiet rather than a bare zero.
 */
export function buildPsiInsights(details: PartyScoreDetails, context: PsiVenueContext = {}): PsiInsight[] {
  const explanation = explainVenue(details, context);
  const insights = [
    rankingInsight(details, explanation),
    interpretationInsight(details, context),
    anomalyInsight(details),
  ];

  return insights.filter((insight): insight is PsiInsight => insight !== null);
}
