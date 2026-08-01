import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDiscoverCards,
  classifyVenue,
  computeDiscoverPriority,
  hasInsufficientData,
  strongestSignalLabel,
  DISCOVER_INTELLIGENCE_CONFIG,
  type DiscoverCardCategory,
  type DiscoverIntelligenceVenue,
} from "@/lib/discoverIntelligence";
import { buildPartyScoreFromSignals, type PartyScoreSignals } from "@/lib/partyScore";
import { explainVenue } from "@/lib/psi";
import { CROWD_THRESHOLDS } from "@/lib/venueCheckInUtils";
import { FEATURE_FLAG_DEFAULTS, isFeatureEnabled } from "@/lib/featureFlags";

/**
 * Run with `npm test`. `discoverIntelligence` is pure by design — no React, no
 * Supabase, no clock — so these cover the whole of it: every category rule, the
 * precedence that keeps a venue off two cards at once, the priority ordering,
 * both degradation paths (Crowd Pulse off, venue data thin) and determinism.
 *
 * Scores are built through `buildPartyScoreFromSignals` rather than written by
 * hand, so if the engine's weights move these tests move with it instead of
 * asserting against a frozen copy of numbers the engine no longer produces.
 */

const NOW = "2026-08-01T23:00:00.000Z";

function signals(overrides: Partial<PartyScoreSignals> = {}): PartyScoreSignals {
  return {
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
    ...overrides,
  };
}

/**
 * A venue with a real engine-produced score. `previousScore` drives momentum
 * through the engine's own delta term rather than being injected, so momentum
 * here is as real as it is in production.
 */
function venue(
  id: string,
  options: {
    signals?: Partial<PartyScoreSignals>;
    previousScore?: number;
    confidence?: number;
    placeholders?: string[];
    distanceMiles?: number | null;
    liveEventTypes?: string[];
    liveMusicTitle?: string | null;
    crowdPulseLevel?: DiscoverIntelligenceVenue["crowdPulseLevel"];
  } = {}
): DiscoverIntelligenceVenue {
  const resolved = signals(options.signals);
  const partyScore = buildPartyScoreFromSignals({
    venueId: id,
    signals: resolved,
    confidence: options.confidence ?? 0.95,
    updatedAt: NOW,
    placeholders: options.placeholders,
    previous:
      options.previousScore === undefined
        ? undefined
        : {
            score: options.previousScore,
            crowdLevel: "Quiet",
            momentum: 0,
            trend: "stable",
            confidence: 0.95,
            updatedAt: NOW,
          },
  });

  return {
    id,
    name: `Venue ${id}`,
    slug: id,
    partyScore,
    psiExplanation: explainVenue(partyScore, { distanceMiles: options.distanceMiles }),
    distanceMiles: options.distanceMiles ?? null,
    liveEventTypes: options.liveEventTypes,
    liveMusicTitle: options.liveMusicTitle,
    crowdPulseLevel: options.crowdPulseLevel ?? null,
  };
}

function categoryOf(input: DiscoverIntelligenceVenue): DiscoverCardCategory | null {
  return classifyVenue(input)?.category ?? null;
}

function cardFor(category: DiscoverCardCategory, venues: DiscoverIntelligenceVenue[]) {
  const card = buildDiscoverCards(venues).cards.find((entry) => entry.id === category);
  assert.ok(card, `expected a ${category} card`);
  return card;
}

/** A room that is high and accelerating: big crowd, live event, score jumped. */
function explodingVenue(id: string, extra: Partial<PartyScoreSignals> = {}) {
  return venue(id, {
    signals: { liveCheckins: 90, activeEvents: 1, activeStories: 4, recentActivity: 6, ...extra },
    previousScore: 0,
  });
}

// ---------------------------------------------------------------------------
// Category classification
// ---------------------------------------------------------------------------

test("a high, accelerating room is Exploding Right Now", () => {
  const subject = explodingVenue("exploding");

  assert.ok(subject.partyScore.score >= DISCOVER_INTELLIGENCE_CONFIG.explodingMinScore);
  assert.ok(subject.partyScore.momentum >= DISCOVER_INTELLIGENCE_CONFIG.explodingMinMomentum);
  assert.equal(categoryOf(subject), "explodingRightNow");
});

test("height alone does not explode — a flat high score is not on the fire card", () => {
  // Same standing signals, but the score did not move, so momentum stays low.
  const flat = venue("flat", {
    signals: { liveCheckins: 90, activeEvents: 1, activeStories: 4 },
    previousScore: 100,
  });

  assert.ok(flat.partyScore.score >= DISCOVER_INTELLIGENCE_CONFIG.explodingMinScore);
  assert.ok(flat.partyScore.momentum < DISCOVER_INTELLIGENCE_CONFIG.explodingMinMomentum);
  assert.notEqual(categoryOf(flat), "explodingRightNow");
});

test("Getting Busy uses the shared crowd thresholds rather than its own band", () => {
  assert.equal(DISCOVER_INTELLIGENCE_CONFIG.gettingBusyMinCheckins, CROWD_THRESHOLDS.gettingBusy.min);
  assert.equal(DISCOVER_INTELLIGENCE_CONFIG.gettingBusyMaxCheckins, CROWD_THRESHOLDS.gettingBusy.max);

  const rising = venue("busy", {
    signals: { liveCheckins: 20, recentCheckins: 6, recentActivity: 6 },
    previousScore: 0,
  });

  assert.ok(rising.partyScore.momentum >= DISCOVER_INTELLIGENCE_CONFIG.gettingBusyMinMomentum);
  assert.equal(categoryOf(rising), "gettingBusy");
});

test("a flat room inside the Getting Busy crowd band is not called Getting Busy", () => {
  // Right number of people, but nobody new arrived and the score did not move,
  // so the card that promises movement must not claim it.
  const flat = venue("flat-band", { signals: { liveCheckins: 20 } });

  assert.ok(flat.partyScore.signals.liveCheckins >= CROWD_THRESHOLDS.gettingBusy.min);
  assert.ok(flat.partyScore.signals.liveCheckins <= CROWD_THRESHOLDS.gettingBusy.max);
  assert.equal(flat.partyScore.momentum, 0);
  assert.notEqual(categoryOf(flat), "gettingBusy");
});

test("a room whose score is falling is not called Getting Busy on inflow alone", () => {
  // Momentum sums recent inflow and the score delta, so seven recent events can
  // hold momentum at the +4 floor while the score drops four points. The engine
  // calls that trend "down"; the card says "still rising", so it must not match.
  const declining = venue("declining", {
    signals: { liveCheckins: 20, recentActivity: 7 },
    previousScore: 26,
  });

  assert.equal(declining.partyScore.momentum, DISCOVER_INTELLIGENCE_CONFIG.gettingBusyMinMomentum);
  assert.equal(declining.partyScore.trend, "down");
  assert.notEqual(categoryOf(declining), "gettingBusy");
});

test("a crowd below the shared Getting Busy floor is not called Getting Busy", () => {
  const belowFloor = venue("thin", {
    signals: { liveCheckins: CROWD_THRESHOLDS.gettingBusy.min - 1, recentCheckins: 5, recentActivity: 5 },
    previousScore: 0,
  });

  assert.notEqual(categoryOf(belowFloor), "gettingBusy");
});

test("one friend checked in is enough for Friends Are Here", () => {
  const subject = venue("friends", { signals: { friendPresence: 1, liveCheckins: 4 } });

  assert.equal(categoryOf(subject), "friendsAreHere");
  assert.match(classifyVenue(subject)!.categoryReason, /1 friend is checked in/);
});

test("Friends Are Here counts the engine's friendPresence signal, not a separate tally", () => {
  const subject = venue("friends-many", { signals: { friendPresence: 3, liveCheckins: 12 } });

  assert.match(classifyVenue(subject)!.categoryReason, /3 friends are checked in/);
});

test("Friends Are Here is never inferred from an otherwise busy room", () => {
  // Everything a room can have except a friend in it.
  const noFriends = venue("no-friends", {
    signals: { liveCheckins: 30, activeStories: 3, storyReactions: 20, activeEvents: 1, litSignals: 6 },
    distanceMiles: 1,
    liveEventTypes: ["dj"],
  });

  assert.equal(noFriends.partyScore.signals.friendPresence, 0);
  assert.notEqual(categoryOf(noFriends), "friendsAreHere");
});

test("Live Music Nearby needs a real music event type", () => {
  const music = venue("music", {
    signals: { activeEvents: 1, liveCheckins: 6 },
    distanceMiles: 2,
    liveEventTypes: ["live_music"],
    liveMusicTitle: "The Boardwalk Trio",
  });
  const trivia = venue("trivia", {
    signals: { activeEvents: 1, liveCheckins: 6 },
    distanceMiles: 2,
    liveEventTypes: ["trivia"],
  });

  assert.equal(categoryOf(music), "liveMusicNearby");
  assert.match(classifyVenue(music)!.categoryReason, /The Boardwalk Trio is on now/);
  // Trivia is entertainment, but the card says music.
  assert.notEqual(categoryOf(trivia), "liveMusicNearby");
});

test("Live Music Nearby will not claim nearby without distance data", () => {
  const unknownDistance = venue("music-far", {
    signals: { activeEvents: 1, liveCheckins: 6 },
    distanceMiles: null,
    liveEventTypes: ["band"],
  });
  const tooFar = venue("music-away", {
    signals: { activeEvents: 1, liveCheckins: 6 },
    distanceMiles: DISCOVER_INTELLIGENCE_CONFIG.liveMusicMaxMiles + 1,
    liveEventTypes: ["band"],
  });

  assert.notEqual(categoryOf(unknownDistance), "liveMusicNearby");
  assert.notEqual(categoryOf(tooFar), "liveMusicNearby");
});

test("a Hidden Gem scores well on a small crowd, and needs an endorsement behind it", () => {
  const gem = venue("gem", { signals: { liveCheckins: 8, litSignals: 8, storyReactions: 16 } });

  assert.ok(gem.partyScore.score >= DISCOVER_INTELLIGENCE_CONFIG.hiddenGemMinScore);
  assert.ok(gem.partyScore.signals.liveCheckins <= DISCOVER_INTELLIGENCE_CONFIG.hiddenGemMaxCheckins);
  assert.equal(categoryOf(gem), "hiddenGem");
});

test("a quiet room with no endorsement is not a Hidden Gem", () => {
  // Same score band, but reached through story reactions with nobody vouching.
  const noise = venue("noise", { signals: { liveCheckins: 8, storyReactions: 30 } });

  assert.ok(noise.partyScore.score >= DISCOVER_INTELLIGENCE_CONFIG.hiddenGemMinScore);
  assert.equal(noise.partyScore.signals.litSignals, 0);
  assert.equal(noise.partyScore.signals.activeEvents, 0);
  assert.notEqual(categoryOf(noise), "hiddenGem");
});

test("Worth Driving To needs real distance, and enough score to justify the trip", () => {
  const worthIt = venue("far-good", {
    signals: { liveCheckins: 45, activeStories: 2, storyReactions: 20 },
    distanceMiles: 8,
  });
  const closeBy = venue("close-good", {
    signals: { liveCheckins: 45, activeStories: 2, storyReactions: 20 },
    distanceMiles: 1,
  });

  assert.ok(worthIt.partyScore.score >= DISCOVER_INTELLIGENCE_CONFIG.worthDrivingMinScore);
  assert.equal(categoryOf(worthIt), "worthDrivingTo");
  // Same venue nearby is not a drive.
  assert.notEqual(categoryOf(closeBy), "worthDrivingTo");
});

test("distance alone is not Worth Driving To — the score floor is required too", () => {
  const farButMediocre = venue("far-weak", {
    signals: { liveCheckins: 12, storyReactions: 4 },
    distanceMiles: 8,
  });

  assert.ok(farButMediocre.distanceMiles! >= DISCOVER_INTELLIGENCE_CONFIG.worthDrivingMinMiles);
  assert.ok(farButMediocre.partyScore.score < DISCOVER_INTELLIGENCE_CONFIG.worthDrivingMinScore);
  assert.notEqual(categoryOf(farButMediocre), "worthDrivingTo");
});

test("a venue with almost no data behind it never becomes a Hidden Gem", () => {
  // One endorsement and nothing else clears the "somebody vouched" gate but
  // comes nowhere near the score floor, which is what keeps a blank venue off
  // the card rather than its emptiness reading as undiscovered quality.
  const bare = venue("bare", { signals: { litSignals: 1 } });

  assert.ok(bare.partyScore.signals.litSignals > 0);
  assert.ok(bare.partyScore.score < DISCOVER_INTELLIGENCE_CONFIG.hiddenGemMinScore);
  assert.equal(categoryOf(bare), null);
});

// ---------------------------------------------------------------------------
// Precedence and exclusivity
// ---------------------------------------------------------------------------

test("precedence resolves in the documented order, strongest classification first", () => {
  assert.deepEqual(DISCOVER_INTELLIGENCE_CONFIG.categoryPrecedence, [
    "explodingRightNow",
    "friendsAreHere",
    "liveMusicNearby",
    "gettingBusy",
    "hiddenGem",
    "worthDrivingTo",
  ]);
});

/**
 * Which categories a venue satisfies *independently*, found by running the real
 * classifier against a one-entry precedence list per category. That is the same
 * rule code the full classifier uses, so it cannot drift from it.
 */
function allMatchingCategories(input: DiscoverIntelligenceVenue): DiscoverCardCategory[] {
  return DISCOVER_INTELLIGENCE_CONFIG.categoryPrecedence.filter(
    (category) =>
      classifyVenue(input, { ...DISCOVER_INTELLIGENCE_CONFIG, categoryPrecedence: [category] }) !== null
  );
}

test("when several rules match, the winner is always the earliest in the precedence order", () => {
  const contenders = [
    // Exploding + friends + live music + in the Getting Busy band, all at once.
    venue("multi-a", {
      signals: { liveCheckins: 20, activeStories: 2, activeEvents: 1, friendPresence: 2, recentActivity: 6, litSignals: 4 },
      previousScore: 0,
      distanceMiles: 4,
      liveEventTypes: ["band"],
    }),
    // Live music and a drive-worthy score, no friends.
    venue("multi-b", {
      signals: { liveCheckins: 45, activeStories: 2, storyReactions: 20, activeEvents: 1 },
      distanceMiles: 6,
      liveEventTypes: ["dj"],
    }),
    // Hidden Gem and Worth Driving To together.
    venue("multi-c", {
      signals: { liveCheckins: 8, litSignals: 10, storyReactions: 20, activeStories: 1 },
      distanceMiles: 7,
    }),
    // Getting Busy and Hidden Gem together.
    venue("multi-d", {
      signals: { liveCheckins: 18, litSignals: 8, storyReactions: 14, recentActivity: 6 },
      previousScore: 0,
    }),
  ];

  for (const subject of contenders) {
    const matches = allMatchingCategories(subject);
    assert.ok(matches.length > 1, `${subject.id} should match more than one rule`);
    // `matches` is already in precedence order, so its head is the expected winner.
    assert.equal(categoryOf(subject), matches[0], `${subject.id} matched ${matches.join(", ")}`);
  }
});

test("a venue appears on exactly one card even when several rules match", () => {
  // Exploding, friends present, live music, all at once.
  const overlapping = explodingVenue("overlap", { friendPresence: 3 });
  overlapping.distanceMiles = 1;
  overlapping.liveEventTypes = ["dj"];

  const { cards } = buildDiscoverCards([overlapping]);
  const appearances = cards.flatMap((card) =>
    card.venues.filter((entry) => entry.venueId === "overlap").map(() => card.id)
  );

  assert.deepEqual(appearances, ["explodingRightNow"]);
});

test("no venue is ever duplicated across the whole screen", () => {
  const population = [
    explodingVenue("a", { friendPresence: 2 }),
    venue("b", { signals: { friendPresence: 1, liveCheckins: 20, recentActivity: 6 }, previousScore: 0, distanceMiles: 1, liveEventTypes: ["band"] }),
    venue("c", { signals: { liveCheckins: 20, recentCheckins: 6, recentActivity: 6 }, previousScore: 0 }),
    venue("d", { signals: { liveCheckins: 8, litSignals: 8, storyReactions: 16 } }),
    venue("e", { signals: { liveCheckins: 45, activeStories: 2, storyReactions: 20 }, distanceMiles: 8 }),
  ];

  const { cards } = buildDiscoverCards(population);
  const placed = cards.flatMap((card) => card.venues.map((entry) => entry.venueId));

  assert.equal(placed.length, new Set(placed).size);
});

test("friends outrank the generic busy read for the same room", () => {
  const withFriends = venue("with-friends", {
    signals: { friendPresence: 2, liveCheckins: 20, recentCheckins: 6, recentActivity: 6 },
    previousScore: 0,
  });

  assert.equal(categoryOf(withFriends), "friendsAreHere");
});

test("precedence covers every category, so the order is total", () => {
  assert.equal(
    new Set(DISCOVER_INTELLIGENCE_CONFIG.categoryPrecedence).size,
    DISCOVER_INTELLIGENCE_CONFIG.categoryPrecedence.length
  );
  assert.equal(DISCOVER_INTELLIGENCE_CONFIG.categoryPrecedence.length, 6);
});

// ---------------------------------------------------------------------------
// Priority ordering
// ---------------------------------------------------------------------------

test("a closer venue outranks an identical one further away", () => {
  const near = venue("near", { signals: { liveCheckins: 20, recentCheckins: 6, recentActivity: 6 }, previousScore: 0, distanceMiles: 0.5 });
  const far = venue("far", { signals: { liveCheckins: 20, recentCheckins: 6, recentActivity: 6 }, previousScore: 0, distanceMiles: 4.5 });

  assert.ok(computeDiscoverPriority(near) > computeDiscoverPriority(far));

  const card = cardFor("gettingBusy", [far, near]);
  assert.deepEqual(card.venues.map((entry) => entry.venueId), ["near", "far"]);
});

test("card order does not depend on the order venues were passed in", () => {
  const one = venue("one", { signals: { liveCheckins: 20, recentCheckins: 6, recentActivity: 6 }, previousScore: 0, distanceMiles: 1 });
  const two = venue("two", { signals: { liveCheckins: 30, recentCheckins: 8, recentActivity: 8 }, previousScore: 0, distanceMiles: 3 });
  const three = venue("three", { signals: { liveCheckins: 15, recentCheckins: 6, recentActivity: 6 }, previousScore: 0, distanceMiles: 2 });

  const forward = cardFor("gettingBusy", [one, two, three]).venues.map((entry) => entry.venueId);
  const reversed = cardFor("gettingBusy", [three, two, one]).venues.map((entry) => entry.venueId);

  assert.deepEqual(forward, reversed);
});

test("equal-priority venues break the tie on venue id, never on input order", () => {
  const zed = venue("zed", { signals: { liveCheckins: 20, recentCheckins: 6, recentActivity: 6 }, previousScore: 0, distanceMiles: 2 });
  const abe = venue("abe", { signals: { liveCheckins: 20, recentCheckins: 6, recentActivity: 6 }, previousScore: 0, distanceMiles: 2 });

  assert.equal(computeDiscoverPriority(zed), computeDiscoverPriority(abe));
  assert.deepEqual(cardFor("gettingBusy", [zed, abe]).venues.map((entry) => entry.venueId), ["abe", "zed"]);
});

test("a card holds no more than the configured number of venues", () => {
  const many = Array.from({ length: DISCOVER_INTELLIGENCE_CONFIG.maxVenuesPerCard + 3 }, (_unused, index) =>
    venue(`busy-${index}`, {
      signals: { liveCheckins: 12 + index, recentCheckins: 6, recentActivity: 6 },
      previousScore: 0,
      distanceMiles: 1,
    })
  );

  assert.equal(cardFor("gettingBusy", many).venues.length, DISCOVER_INTELLIGENCE_CONFIG.maxVenuesPerCard);
});

test("identical inputs produce a byte-identical result", () => {
  const build = () =>
    buildDiscoverCards([
      explodingVenue("a"),
      venue("b", { signals: { friendPresence: 2, liveCheckins: 6 } }),
      venue("c", { signals: { liveCheckins: 8, litSignals: 6, storyReactions: 12 } }),
      venue("d", {}),
    ]);

  assert.deepEqual(build(), build());
});

// ---------------------------------------------------------------------------
// Graceful degradation — Crowd Pulse off
// ---------------------------------------------------------------------------

test("with Crowd Pulse off every venue still classifies the same way", () => {
  const withPulse = [
    explodingVenue("a"),
    venue("b", { signals: { friendPresence: 2, liveCheckins: 6 }, crowdPulseLevel: "peak" }),
    venue("c", { signals: { liveCheckins: 8, litSignals: 6, storyReactions: 12 }, crowdPulseLevel: "busy" }),
  ];
  const withoutPulse = withPulse.map((entry) => ({ ...entry, crowdPulseLevel: null, crowdPulseTrend: null }));

  const categories = (input: DiscoverIntelligenceVenue[]) =>
    buildDiscoverCards(input).cards.map((card) => [card.id, card.venues.map((v) => v.venueId)]);

  assert.deepEqual(categories(withPulse), categories(withoutPulse));
});

test("Crowd Pulse corroboration is a bounded nudge, and reports itself", () => {
  const plain = venue("plain", { signals: { liveCheckins: 20, recentCheckins: 6, recentActivity: 6 }, previousScore: 0 });
  const corroborated = venue("plain", {
    signals: { liveCheckins: 20, recentCheckins: 6, recentActivity: 6 },
    previousScore: 0,
    crowdPulseLevel: "peak",
  });

  assert.equal(
    computeDiscoverPriority(corroborated) - computeDiscoverPriority(plain),
    DISCOVER_INTELLIGENCE_CONFIG.crowdPulseCorroborationBonus
  );
  assert.equal(classifyVenue(plain)!.crowdPulseCorroborated, false);
  assert.equal(classifyVenue(corroborated)!.crowdPulseCorroborated, true);
});

test("a quiet Crowd Pulse cell corroborates nothing", () => {
  const quiet = venue("quiet-cell", {
    signals: { liveCheckins: 20, recentCheckins: 6, recentActivity: 6 },
    previousScore: 0,
    crowdPulseLevel: "quiet",
  });

  assert.equal(classifyVenue(quiet)!.crowdPulseCorroborated, false);
});

test("the result says out loud when no Crowd Pulse reading was available", () => {
  assert.equal(buildDiscoverCards([venue("a", {})]).crowdPulseAvailable, false);
  assert.equal(
    buildDiscoverCards([venue("a", { crowdPulseLevel: "busy" })]).crowdPulseAvailable,
    true
  );
});

// ---------------------------------------------------------------------------
// Graceful degradation — insufficient venue data
// ---------------------------------------------------------------------------

test("a venue with nothing behind it gets a sentence, not a zero", () => {
  const empty = venue("empty", { confidence: 0.35 });

  assert.equal(empty.partyScore.score, 0);
  assert.ok(hasInsufficientData(empty));

  const { unclassified } = buildDiscoverCards([empty]);
  assert.equal(unclassified.length, 1);
  assert.equal(unclassified[0].venueId, "empty");
  assert.ok(unclassified[0].message.length > 0);
  assert.match(unclassified[0].message, /check back/i);
});

test("an unclassified venue that does have evidence reuses PSI's own headline", () => {
  // Enough activity for PSI to have something to say, but no card rule matches.
  const evidenced = venue("evidenced", { signals: { liveCheckins: 6, activeStories: 1 } });

  assert.equal(categoryOf(evidenced), null);

  const { unclassified } = buildDiscoverCards([evidenced]);
  assert.equal(unclassified[0].message, evidenced.psiExplanation!.headline);
});

test("a thin read is hedged on the card rather than stated flat", () => {
  const hedged = venue("hedged", {
    signals: { friendPresence: 1, liveCheckins: 3 },
    confidence: 0.5,
    placeholders: ["story reactions"],
  });

  const assignment = classifyVenue(hedged);
  assert.equal(assignment?.category, "friendsAreHere");
  assert.ok(assignment?.dataNote, "expected a qualitative note on a low-confidence read");
});

test("a confident, fully-sourced venue carries no hedge", () => {
  const confident = venue("confident", { signals: { friendPresence: 2, liveCheckins: 20 }, confidence: 0.95 });

  assert.equal(classifyVenue(confident)?.dataNote, null);
});

test("an empty card explains itself instead of vanishing", () => {
  const { cards } = buildDiscoverCards([]);

  assert.equal(cards.length, 6);
  for (const card of cards) {
    assert.equal(card.venues.length, 0);
    assert.ok(card.emptyMessage && card.emptyMessage.length > 0, `${card.id} needs an empty message`);
  }
});

// ---------------------------------------------------------------------------
// Claim safety
// ---------------------------------------------------------------------------

/** Forward-looking phrasing. No prediction model exists, so none of it may ship. */
const PREDICTIVE_PHRASING =
  /\b(will|going to|about to|expected|predict\w*|forecast\w*|likely|should be|any minute|due to)\b/i;

test("no card string claims anything about the future", () => {
  const population = [
    explodingVenue("a", { friendPresence: 2 }),
    venue("b", { signals: { liveCheckins: 20, recentCheckins: 6, recentActivity: 6 }, previousScore: 0 }),
    venue("c", { signals: { liveCheckins: 8, litSignals: 8, storyReactions: 16 } }),
    venue("d", { signals: { activeEvents: 1, liveCheckins: 6 }, distanceMiles: 2, liveEventTypes: ["band"], liveMusicTitle: "Night Shift" }),
    venue("e", { signals: { liveCheckins: 45, activeStories: 2, storyReactions: 20 }, distanceMiles: 8 }),
    venue("f", {}),
  ];

  const { cards, unclassified } = buildDiscoverCards(population);
  const strings: string[] = [];

  for (const card of cards) {
    strings.push(card.label, card.description);
    if (card.emptyMessage) {
      strings.push(card.emptyMessage);
    }
    for (const entry of card.venues) {
      strings.push(entry.categoryReason, entry.explanation.headline);
      if (entry.dataNote) {
        strings.push(entry.dataNote);
      }
      for (const reason of entry.explanation.reasons) {
        strings.push(reason.text);
      }
    }
  }
  for (const entry of unclassified) {
    strings.push(entry.message);
  }

  assert.ok(strings.length > 0, "expected some copy to check");
  for (const value of strings) {
    assert.doesNotMatch(value, PREDICTIVE_PHRASING, `predictive phrasing in: ${value}`);
  }
});

test("every category reason quotes a signal value the venue actually has", () => {
  // The reason sentence is the one string this module writes itself, so it is
  // the one that could drift into a claim no row supports.
  const friends = classifyVenue(venue("f", { signals: { friendPresence: 2, liveCheckins: 5 } }))!;
  assert.match(friends.categoryReason, /^2 friends are checked in here right now\.$/);

  const music = classifyVenue(
    venue("m", { signals: { activeEvents: 1, liveCheckins: 6 }, distanceMiles: 2.4, liveEventTypes: ["dj"] })
  )!;
  // No performer name supplied, so it does not invent one.
  assert.match(music.categoryReason, /^Live music is on now, 2\.4 miles away\.$/);
});

// ---------------------------------------------------------------------------
// Low-data production shape
// ---------------------------------------------------------------------------

test("a production-shaped low-data night renders fewer than six cards' worth, and forces nothing", () => {
  // Four venues, barely any check-ins, no friends, no Lit, no events, no
  // distance — roughly what the Founding cohort looks like on a slow night.
  const population = [
    venue("v1", { signals: { liveCheckins: 2 }, confidence: 0.4 }),
    venue("v2", { signals: { liveCheckins: 1, activeStories: 1 }, confidence: 0.4 }),
    venue("v3", {}),
    venue("v4", { signals: { liveCheckins: 3 }, confidence: 0.45 }),
  ];

  const { cards, unclassified } = buildDiscoverCards(population);

  // All six cards still render so the layout holds…
  assert.equal(cards.length, 6);
  // …but nothing was promoted onto any of them.
  const placed = cards.flatMap((card) => card.venues);
  assert.equal(placed.length, 0);

  // Nothing is called Exploding or Getting Busy without the signal to back it.
  for (const card of cards) {
    assert.equal(card.venues.length, 0, `${card.id} should be empty on a low-data night`);
    assert.ok(card.emptyMessage, `${card.id} needs qualitative empty copy, not silence`);
    assert.doesNotMatch(card.emptyMessage!, PREDICTIVE_PHRASING);
  }

  // Every venue still gets a sentence rather than being dropped or zeroed.
  assert.equal(unclassified.length, 4);
  for (const entry of unclassified) {
    assert.ok(entry.message.trim().length > 0);
    assert.doesNotMatch(entry.message, /^0\b/);
    assert.doesNotMatch(entry.message, PREDICTIVE_PHRASING);
  }
});

test("a thin night is not padded up to six recommendations", () => {
  // One venue genuinely qualifies. The other five cards stay empty rather than
  // borrowing it or reaching down for weaker venues to fill themselves.
  const population = [
    venue("only-real", { signals: { friendPresence: 1, liveCheckins: 6 } }),
    venue("weak-1", { signals: { liveCheckins: 2 } }),
    venue("weak-2", {}),
  ];

  const { cards } = buildDiscoverCards(population);
  const populatedCards = cards.filter((card) => card.venues.length > 0);

  assert.equal(populatedCards.length, 1);
  assert.equal(populatedCards[0].id, "friendsAreHere");
  assert.deepEqual(populatedCards[0].venues.map((entry) => entry.venueId), ["only-real"]);
});

test("a night with no venues at all degrades to copy rather than silence", () => {
  const { cards, unclassified, crowdPulseAvailable } = buildDiscoverCards([]);

  assert.equal(unclassified.length, 0);
  assert.equal(crowdPulseAvailable, false);
  assert.equal(cards.length, 6);
  for (const card of cards) {
    assert.ok(card.emptyMessage && card.emptyMessage.trim().length > 0);
  }
});

// ---------------------------------------------------------------------------
// PSI reuse
// ---------------------------------------------------------------------------

test("a card entry carries PSI's explanation unmodified", () => {
  const subject = explodingVenue("psi");
  const assignment = classifyVenue(subject);

  assert.deepEqual(assignment?.explanation, subject.psiExplanation);
});

test("an explanation is derived through PSI when the caller did not supply one", () => {
  const subject = explodingVenue("derived");
  const supplied = subject.psiExplanation;
  const assignment = classifyVenue({ ...subject, psiExplanation: null });

  assert.deepEqual(assignment?.explanation, supplied);
});

test("the strongest-signal label comes from PSI's attribution", () => {
  const subject = venue("attributed", { signals: { friendPresence: 2, liveCheckins: 4 } });

  // friendPresence is weighted far above check-ins, so PSI ranks it first.
  assert.equal(strongestSignalLabel(subject), "2 friends here");
  assert.equal(strongestSignalLabel(venue("silent", {})), null);
});

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

test("the aiDiscoverCards flag ships off", () => {
  assert.equal(FEATURE_FLAG_DEFAULTS.aiDiscoverCards, false);
  assert.equal(isFeatureEnabled("aiDiscoverCards"), false);
});

test("adding the new flag did not turn Crowd Pulse on", () => {
  assert.equal(FEATURE_FLAG_DEFAULTS.crowdPulse, false);
  assert.equal(isFeatureEnabled("crowdPulse"), false);
});
