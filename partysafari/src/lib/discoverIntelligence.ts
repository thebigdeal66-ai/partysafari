/**
 * Discover Intelligence — the classification and priority layer behind the AI
 * Discover Cards.
 *
 * This module answers two questions about a set of venues that have *already*
 * been scored and explained elsewhere:
 *
 * 1. **Which card does this venue belong on?** Six categories, mutually
 *    exclusive, resolved by a documented precedence order.
 * 2. **In what order should the venues on a card appear?** One deterministic
 *    priority score built from signals the Party Score engine already gathered.
 *
 * Four rules hold it in place:
 *
 * - **It does not score.** Every number it reads comes off `PartyScoreDetails`
 *   produced by `partyScoreEngine`. There is no second scoring path, no
 *   rescaling, and no threshold that contradicts the engine. The priority value
 *   here is a *sort key for one screen*, not a competing measure of how good a
 *   venue is.
 * - **It does not explain.** Every "why this venue" sentence on a card is the
 *   `PsiExplanation` that `psi.ts` produced, passed through untouched. This
 *   module adds only one sentence of its own — `categoryReason` — and that
 *   sentence states *which classification rule matched and at what threshold*,
 *   which is information PSI does not model. It never restates a signal claim
 *   in different words.
 * - **It does not fetch.** No React, no Supabase, no clock. Same inputs in,
 *   same output out, which is what makes it testable.
 * - **It does not shrug.** A venue with nothing to say still gets a sentence,
 *   and an empty card still gets a sentence. Per MASTERPLAN, "no empty states
 *   that shrug".
 *
 * Crowd Pulse is *corroboration only*. When its feature flag is off the caller
 * passes nothing, every venue's corroboration bonus is zero, and classification
 * and ordering are unchanged. Crowd Pulse can nudge a venue up a card; it can
 * never put one on a card or take one off.
 */

import { clamp, type PartyScoreDetails, type PartyScoreSignals } from "@/lib/partyScore";
import { attributePartyScore, explainVenue, type PsiExplanation, type PsiVenueContext } from "@/lib/psi";
import { CROWD_THRESHOLDS } from "@/lib/venueCheckInUtils";
import type { CrowdPulseLevel, CrowdPulseTrend } from "@/lib/crowdPulseTypes";

export type DiscoverCardCategory =
  | "explodingRightNow"
  | "gettingBusy"
  | "friendsAreHere"
  | "liveMusicNearby"
  | "hiddenGem"
  | "worthDrivingTo";

/**
 * One venue as this module needs to see it.
 *
 * Every scored quantity is read off `partyScore.signals` rather than being
 * passed in alongside it, deliberately: `friendPresence` is the
 * `friendships` × `venue_checkins` intersection that `partyScoreEngine` already
 * computes, `activeStories` is its story count, `liveCheckins` its check-in
 * count. Taking them from anywhere else would be a second, drift-prone copy of
 * work the engine has already done.
 *
 * What is passed in separately is only what the Party Score does not model:
 * distance, the event types actually running, and Crowd Pulse corroboration.
 */
export type DiscoverIntelligenceVenue = {
  id: string;
  name: string;
  slug?: string | null;
  /** The engine's full result. The single source of every count used below. */
  partyScore: PartyScoreDetails;
  /**
   * PSI's read on the room. Supplied by callers that already built one (the
   * Discover hook does), otherwise derived here via `explainVenue` so there is
   * still exactly one explanation generator in the codebase.
   */
  psiExplanation?: PsiExplanation | null;
  /** Real distance in miles, or null when geolocation was unavailable. */
  distanceMiles?: number | null;
  /** Lowercased `events.event_type` values live at this venue now. Real rows only. */
  liveEventTypes?: string[];
  /** Title or performer of the live music event, used in the card sentence. */
  liveMusicTitle?: string | null;
  /** Crowd Pulse cell level, when the flag is on. Corroboration only. */
  crowdPulseLevel?: CrowdPulseLevel | null;
  /** Crowd Pulse cell trend, when the flag is on. Corroboration only. */
  crowdPulseTrend?: CrowdPulseTrend | null;
  /** Personalization context forwarded to PSI when this module derives the explanation. */
  psiContext?: PsiVenueContext;
};

export type DiscoverCardVenue = {
  venueId: string;
  name: string;
  slug: string | null;
  category: DiscoverCardCategory;
  /** Deterministic sort key for this screen. Not a quality measure. */
  priority: number;
  /** PSI's explanation, passed through unmodified. */
  explanation: PsiExplanation;
  /** Which classification rule matched, and at what observed value. */
  categoryReason: string;
  /** Qualitative hedge when the read is thin. Null when the read is solid. */
  dataNote: string | null;
  /** True when a Crowd Pulse cell backed this venue up. False when the flag is off. */
  crowdPulseCorroborated: boolean;
};

export type DiscoverCard = {
  id: DiscoverCardCategory;
  emoji: string;
  label: string;
  /** One line of standing copy describing what the card is for. */
  description: string;
  venues: DiscoverCardVenue[];
  /** Qualitative line shown instead of an empty card. Null when the card has venues. */
  emptyMessage: string | null;
};

export type DiscoverIntelligenceResult = {
  cards: DiscoverCard[];
  /**
   * Venues that matched no card. Each carries a sentence rather than a zero —
   * PSI's own headline when there was evidence, a qualitative low-data line
   * when there was not.
   */
  unclassified: Array<{ venueId: string; name: string; message: string }>;
  /** False when no venue carried Crowd Pulse data, i.e. the flag is off. */
  crowdPulseAvailable: boolean;
};

export type DiscoverIntelligenceConfig = {
  /**
   * 🔥 Exploding Right Now. Requires height *and* acceleration together: a
   * venue that is merely high has already arrived, and a venue that is merely
   * accelerating from nothing is `Getting Busy`. `explodingMinMomentum` is set
   * to PSI's own surge bar so the two modules cannot call the same room
   * different things.
   */
  explodingMinScore: number;
  explodingMinMomentum: number;

  /**
   * ⚡ Getting Busy. `Getting Busy` is existing product vocabulary owned by
   * `venueCheckInUtils.CROWD_THRESHOLDS` (10–39 live check-ins) and rendered
   * across the whole app; MASTERPLAN UI Principle 7 forbids surfaces inventing
   * synonyms for it. So this card does not define its own band — it binds
   * directly to the shared thresholds, and the label on screen means exactly
   * what it already means everywhere else. `gettingBusyMinMomentum` is the only
   * thing added on top, and only to keep a stalled mid-size room off a card
   * that promises movement.
   */
  gettingBusyMinCheckins: number;
  gettingBusyMaxCheckins: number;
  gettingBusyMinMomentum: number;

  /**
   * 👥 Friends Are Here. Counts `PartyScoreSignals.friendPresence`, which is
   * the accepted-`friendships` × active-`venue_checkins` intersection the
   * engine computes. One friend is enough — that is the whole point of the
   * card.
   */
  friendsMinPresent: number;

  /**
   * 🎵 Live Music Nearby. Matched against real `events.event_type` values only;
   * nothing is inferred from a venue's genre tags or its name. The list is
   * narrower than the Discover "live entertainment" filter, which also carries
   * trivia, karaoke and comedy — those are entertainment but they are not
   * music, and the card says music. "Nearby" is a claim about distance, so a
   * venue with unknown distance cannot make it.
   */
  liveMusicEventTypes: readonly string[];
  liveMusicMaxMiles: number;

  /**
   * 💎 Hidden Gem. Quality without visibility: a real score that is *not*
   * coming from a crowd. The check-in and story ceilings are what make it
   * hidden, and the endorsement requirement is what makes it a gem — at least
   * one Lit endorsement or one running event, so the score is backed by
   * somebody vouching rather than by noise.
   */
  hiddenGemMinScore: number;
  hiddenGemMaxCheckins: number;
  hiddenGemMaxStories: number;

  /**
   * 🌙 Worth Driving To. Needs real proximity data, and specifically needs the
   * venue to be far enough away that driving is the honest word. The score
   * floor is what justifies the trip; the momentum floor stops the card from
   * sending someone twenty minutes out to a room that is emptying.
   */
  worthDrivingMinMiles: number;
  worthDrivingMaxMiles: number;
  worthDrivingMinScore: number;
  worthDrivingMinMomentum: number;

  /**
   * Precedence. A venue appears on at most one card. When several rules match,
   * the earliest entry here wins.
   *
   * The order follows MASTERPLAN's Discover ranking priorities (happening now →
   * momentum → proximity → friends → fit → reputation), bent by one principle:
   * the winning card should be the one carrying information the viewer cannot
   * get from the others.
   *
   * 1. `explodingRightNow` — the loudest live fact there is.
   * 2. `friendsAreHere` — specific to this viewer and rare; a friend in the
   *    room outranks a generic reading of that same room.
   * 3. `liveMusicNearby` — a concrete programmed fact. "There is a band on"
   *    tells you something "it is filling up" does not.
   * 4. `gettingBusy` — the generic momentum read, once the specific ones fail.
   * 5. `hiddenGem` — fit and reputation rather than live activity.
   * 6. `worthDrivingTo` — the weakest claim, and the only one asking for effort,
   *    so it is the last resort rather than a competitor.
   */
  categoryPrecedence: readonly DiscoverCardCategory[];

  /**
   * Priority weights. Each contributing term is normalized to 0–1 first (see
   * the `*Reference` values below) so these weights are directly comparable to
   * each other, and the relative ordering mirrors MASTERPLAN's Discover
   * priorities: happening now, then momentum, then proximity, then friends,
   * then fit, then reputation.
   */
  priorityWeights: {
    activeEvent: number;
    momentum: number;
    proximity: number;
    friends: number;
    lit: number;
    stories: number;
  };

  /**
   * Saturation points for the normalized priority terms. A venue at or past a
   * reference contributes that term's full weight; nothing beyond it counts, so
   * one enormous signal cannot flatten every other consideration.
   */
  momentumReference: number;
  litReference: number;
  friendReference: number;
  storyReference: number;
  /** Distance at which the proximity term reaches zero. Beyond it, no penalty accrues. */
  proximityReferenceMiles: number;

  /**
   * Added to priority when a Crowd Pulse cell independently reads busy or peak.
   * Small on purpose. Crowd Pulse's `intensityReference` is an uncalibrated
   * provisional constant, so its absolute levels are not yet trustworthy enough
   * to move a venue far — and when its flag is off this term is simply zero.
   */
  crowdPulseCorroborationBonus: number;
  crowdPulseCorroboratingLevels: readonly CrowdPulseLevel[];

  /**
   * Below this score, with no scored signal at all, a venue has not reported
   * anything yet rather than reported quiet. Matches
   * `partyScorePresentation.BUILDING_SCORE_CEILING` so the card layer and the
   * score layer agree about where "no data" ends.
   */
  insufficientDataScoreCeiling: number;
  /**
   * Party Score's own low-confidence bar, kept identical here and in `psi.ts`
   * so a venue never reads confident on one surface and hedged on another.
   */
  lowConfidenceCeiling: number;

  /** More than this per card and the screen stops being a recommendation. */
  maxVenuesPerCard: number;
};

export const DISCOVER_INTELLIGENCE_CONFIG: DiscoverIntelligenceConfig = {
  explodingMinScore: 55,
  explodingMinMomentum: 12,

  gettingBusyMinCheckins: CROWD_THRESHOLDS.gettingBusy.min,
  gettingBusyMaxCheckins: CROWD_THRESHOLDS.gettingBusy.max,
  gettingBusyMinMomentum: 4,

  friendsMinPresent: 1,

  liveMusicEventTypes: ["dj", "band", "live_music"],
  liveMusicMaxMiles: 10,

  hiddenGemMinScore: 30,
  hiddenGemMaxCheckins: 25,
  hiddenGemMaxStories: 2,

  worthDrivingMinMiles: 3,
  worthDrivingMaxMiles: 25,
  worthDrivingMinScore: 45,
  worthDrivingMinMomentum: 0,

  categoryPrecedence: [
    "explodingRightNow",
    "friendsAreHere",
    "liveMusicNearby",
    "gettingBusy",
    "hiddenGem",
    "worthDrivingTo",
  ],

  priorityWeights: {
    activeEvent: 3,
    momentum: 2.5,
    proximity: 2,
    friends: 1.6,
    lit: 1.2,
    stories: 0.8,
  },

  momentumReference: 25,
  litReference: 5,
  friendReference: 3,
  storyReference: 4,
  proximityReferenceMiles: 5,

  crowdPulseCorroborationBonus: 0.5,
  crowdPulseCorroboratingLevels: ["busy", "peak"],

  insufficientDataScoreCeiling: 5,
  lowConfidenceCeiling: 0.8,

  maxVenuesPerCard: 4,
};

type CardDefinition = {
  emoji: string;
  label: string;
  description: string;
  /** Shown instead of an empty card. Qualitative, and honest about why. */
  emptyMessage: string;
};

const CARD_DEFINITIONS: Readonly<Record<DiscoverCardCategory, CardDefinition>> = {
  explodingRightNow: {
    emoji: "🔥",
    label: "Exploding Right Now",
    description: "High and still climbing.",
    emptyMessage: "Nothing has taken off yet tonight. This fills in as rooms start moving.",
  },
  gettingBusy: {
    emoji: "⚡",
    label: "Getting Busy",
    description: "Filling in, with the crowd to show for it.",
    emptyMessage: "No rooms in the Getting Busy range yet — check back closer to peak hours.",
  },
  friendsAreHere: {
    emoji: "👥",
    label: "Friends Are Here",
    description: "People you know, checked in right now.",
    emptyMessage: "None of your friends are checked in yet. This appears the moment one is.",
  },
  liveMusicNearby: {
    emoji: "🎵",
    label: "Live Music Nearby",
    description: "A DJ, a band, or live music on now, close by.",
    emptyMessage: "No live music running nearby right now.",
  },
  hiddenGem: {
    emoji: "💎",
    label: "Hidden Gem",
    description: "Scoring well without the crowd to match.",
    emptyMessage: "Nothing under the radar tonight — the good rooms are all busy ones so far.",
  },
  worthDrivingTo: {
    emoji: "🌙",
    label: "Worth Driving To",
    description: "Further out, and holding up anyway.",
    emptyMessage: "Nothing far enough out to be worth the drive tonight.",
  },
};

/** The qualitative stand-in for a zero. Tone matches PSI's quiet reads. */
const INSUFFICIENT_DATA_MESSAGE =
  "Not enough activity yet to call this one — check back closer to peak hours.";

function round(value: number, places = 2) {
  const factor = Math.pow(10, places);
  return Math.round(value * factor) / factor;
}

function finiteDistance(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function resolveExplanation(venue: DiscoverIntelligenceVenue): PsiExplanation {
  if (venue.psiExplanation) {
    return venue.psiExplanation;
  }
  return explainVenue(venue.partyScore, venue.psiContext || { distanceMiles: venue.distanceMiles });
}

function hasMusicEvent(venue: DiscoverIntelligenceVenue, config: DiscoverIntelligenceConfig): boolean {
  return (venue.liveEventTypes || []).some((type) =>
    config.liveMusicEventTypes.includes((type || "").trim().toLowerCase())
  );
}

function plural(count: number, singular: string, pluralForm: string) {
  return count === 1 ? singular : pluralForm;
}

/**
 * Match a venue against one category rule.
 *
 * Returns the sentence naming the rule that matched, or null. The sentence
 * quotes the observed value and the threshold it cleared — it is a statement
 * about the classification, not a second description of the room, which is what
 * keeps it from competing with PSI's reasons.
 */
function matchCategory(
  category: DiscoverCardCategory,
  venue: DiscoverIntelligenceVenue,
  config: DiscoverIntelligenceConfig
): string | null {
  const { score, momentum, signals } = venue.partyScore;
  const distance = finiteDistance(venue.distanceMiles);

  switch (category) {
    case "explodingRightNow":
      return score >= config.explodingMinScore && momentum >= config.explodingMinMomentum
        ? `Scoring ${score} with momentum at +${momentum} — high and still climbing.`
        : null;

    case "friendsAreHere":
      return signals.friendPresence >= config.friendsMinPresent
        ? `${signals.friendPresence} ${plural(signals.friendPresence, "friend is", "friends are")} checked in here right now.`
        : null;

    case "liveMusicNearby": {
      if (!hasMusicEvent(venue, config) || distance === null || distance > config.liveMusicMaxMiles) {
        return null;
      }
      const what = venue.liveMusicTitle?.trim();
      return what
        ? `${what} is on now, ${round(distance, 1)} miles away.`
        : `Live music is on now, ${round(distance, 1)} miles away.`;
    }

    case "gettingBusy":
      return signals.liveCheckins >= config.gettingBusyMinCheckins &&
        signals.liveCheckins <= config.gettingBusyMaxCheckins &&
        momentum >= config.gettingBusyMinMomentum
        ? `${signals.liveCheckins} checked in — inside the Getting Busy range of ${config.gettingBusyMinCheckins}–${config.gettingBusyMaxCheckins}, and still rising.`
        : null;

    case "hiddenGem":
      return score >= config.hiddenGemMinScore &&
        signals.liveCheckins <= config.hiddenGemMaxCheckins &&
        signals.activeStories <= config.hiddenGemMaxStories &&
        (signals.litSignals > 0 || signals.activeEvents > 0)
        ? `Scoring ${score} on only ${signals.liveCheckins} ${plural(signals.liveCheckins, "check-in", "check-ins")} — good without being crowded.`
        : null;

    case "worthDrivingTo":
      return distance !== null &&
        distance >= config.worthDrivingMinMiles &&
        distance <= config.worthDrivingMaxMiles &&
        score >= config.worthDrivingMinScore &&
        momentum >= config.worthDrivingMinMomentum
        ? `${round(distance, 1)} miles out and still scoring ${score}.`
        : null;

    default:
      return null;
  }
}

/**
 * Priority is a sort key, nothing more. It exists so two venues on the same
 * card land in a defensible order, and it is deterministic by construction:
 * every term is a pure function of the inputs, and ties break on venue id.
 */
export function computeDiscoverPriority(
  venue: DiscoverIntelligenceVenue,
  config: DiscoverIntelligenceConfig = DISCOVER_INTELLIGENCE_CONFIG
): number {
  const { momentum, signals } = venue.partyScore;
  const weights = config.priorityWeights;
  const distance = finiteDistance(venue.distanceMiles);

  const total =
    (signals.activeEvents > 0 ? weights.activeEvent : 0) +
    clamp(momentum / config.momentumReference, 0, 1) * weights.momentum +
    (distance === null ? 0 : clamp(1 - distance / config.proximityReferenceMiles, 0, 1) * weights.proximity) +
    clamp(signals.friendPresence / config.friendReference, 0, 1) * weights.friends +
    clamp(signals.litSignals / config.litReference, 0, 1) * weights.lit +
    clamp(signals.activeStories / config.storyReference, 0, 1) * weights.stories +
    (isCrowdPulseCorroborated(venue, config) ? config.crowdPulseCorroborationBonus : 0);

  return round(total);
}

function isCrowdPulseCorroborated(
  venue: DiscoverIntelligenceVenue,
  config: DiscoverIntelligenceConfig
): boolean {
  if (!venue.crowdPulseLevel) {
    return false;
  }
  return config.crowdPulseCorroboratingLevels.includes(venue.crowdPulseLevel);
}

function hasAnyScoredSignal(signals: PartyScoreSignals): boolean {
  return (
    signals.liveCheckins > 0 ||
    signals.activeStories > 0 ||
    signals.storyReactions > 0 ||
    signals.activeEvents > 0 ||
    signals.friendPresence > 0 ||
    signals.goingRsvps > 0 ||
    signals.interestedRsvps > 0 ||
    signals.recentActivity > 0 ||
    signals.litSignals > 0
  );
}

/**
 * True when a venue has too little behind it to state anything flatly. Callers
 * hedge rather than hide: the venue still renders, with a qualitative note.
 */
export function hasInsufficientData(
  venue: DiscoverIntelligenceVenue,
  config: DiscoverIntelligenceConfig = DISCOVER_INTELLIGENCE_CONFIG
): boolean {
  const { score, confidence, signals, placeholders } = venue.partyScore;
  if (!hasAnyScoredSignal(signals) && score <= config.insufficientDataScoreCeiling) {
    return true;
  }
  return confidence < config.lowConfidenceCeiling || placeholders.length > 0;
}

/**
 * The qualitative line for a thin read. PSI already owns the vocabulary for
 * this — its caveat when it produced one, its own quiet headline otherwise —
 * so the only original sentence here is the fully-empty case.
 */
function buildDataNote(
  venue: DiscoverIntelligenceVenue,
  explanation: PsiExplanation,
  config: DiscoverIntelligenceConfig
): string | null {
  if (!hasInsufficientData(venue, config)) {
    return null;
  }
  if (explanation.caveat) {
    return explanation.caveat;
  }
  return explanation.hasEvidence ? explanation.headline : INSUFFICIENT_DATA_MESSAGE;
}

/**
 * Assign a venue to exactly one card, or to none.
 *
 * Exclusivity is enforced structurally: the precedence list is walked in order
 * and the first match returns. A venue therefore cannot be recommended twice on
 * one screen, which is the whole reason the list exists rather than each card
 * filtering the population independently.
 */
export function classifyVenue(
  venue: DiscoverIntelligenceVenue,
  config: DiscoverIntelligenceConfig = DISCOVER_INTELLIGENCE_CONFIG
): DiscoverCardVenue | null {
  for (const category of config.categoryPrecedence) {
    const categoryReason = matchCategory(category, venue, config);
    if (!categoryReason) {
      continue;
    }

    const explanation = resolveExplanation(venue);
    return {
      venueId: venue.id,
      name: venue.name,
      slug: venue.slug || null,
      category,
      priority: computeDiscoverPriority(venue, config),
      explanation,
      categoryReason,
      dataNote: buildDataNote(venue, explanation, config),
      crowdPulseCorroborated: isCrowdPulseCorroborated(venue, config),
    };
  }

  return null;
}

/**
 * Build the whole Discover Cards screen from venues that are already scored and
 * already explained.
 *
 * Cards come back in `categoryPrecedence` order and always all six of them, so
 * the surface layout does not reflow as the night changes; a card with nothing
 * to show carries an `emptyMessage` instead of disappearing.
 */
export function buildDiscoverCards(
  venues: DiscoverIntelligenceVenue[],
  config: DiscoverIntelligenceConfig = DISCOVER_INTELLIGENCE_CONFIG
): DiscoverIntelligenceResult {
  const classified: DiscoverCardVenue[] = [];
  const unclassified: DiscoverIntelligenceResult["unclassified"] = [];

  for (const venue of venues) {
    const assignment = classifyVenue(venue, config);
    if (assignment) {
      classified.push(assignment);
      continue;
    }

    const explanation = resolveExplanation(venue);
    unclassified.push({
      venueId: venue.id,
      name: venue.name,
      message: explanation.hasEvidence ? explanation.headline : INSUFFICIENT_DATA_MESSAGE,
    });
  }

  const cards = config.categoryPrecedence.map((category): DiscoverCard => {
    const definition = CARD_DEFINITIONS[category];
    const members = classified
      .filter((entry) => entry.category === category)
      // Ties break on venue id so identical inputs always produce an identical
      // screen, whatever order the caller happened to pass venues in.
      .sort((left, right) =>
        right.priority - left.priority || left.venueId.localeCompare(right.venueId)
      )
      .slice(0, config.maxVenuesPerCard);

    return {
      id: category,
      emoji: definition.emoji,
      label: definition.label,
      description: definition.description,
      venues: members,
      emptyMessage: members.length > 0 ? null : definition.emptyMessage,
    };
  });

  return {
    cards,
    unclassified,
    crowdPulseAvailable: venues.some((venue) => Boolean(venue.crowdPulseLevel)),
  };
}

/**
 * The single strongest scored signal behind a venue, straight out of PSI's
 * attribution. Re-exported as a helper so the UI can label a card entry without
 * importing `psi.ts` separately or, worse, recomputing the ranking itself.
 */
export function strongestSignalLabel(venue: DiscoverIntelligenceVenue): string | null {
  const strongest = attributePartyScore(venue.partyScore)[0];
  return strongest ? `${strongest.value} ${strongest.label}` : null;
}
