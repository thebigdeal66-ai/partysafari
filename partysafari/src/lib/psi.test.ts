import assert from "node:assert/strict";
import test from "node:test";
import {
  attributePartyScore,
  buildPsiInsights,
  explainVenue,
  type PsiVenueContext,
} from "@/lib/psi";
import {
  buildPartyScoreFromSignals,
  emptyPartyScore,
  DEFAULT_PARTY_SCORE_WEIGHTS,
  type PartyScoreDetails,
  type PartyScoreSignals,
} from "@/lib/partyScore";

/**
 * Run with `npm test` (see package.json).
 *
 * PSI is an interpretation layer, so the tests split in two. The first group is
 * the drift guard: PSI's per-signal attribution is reconciled against the
 * `breakdown` the engine itself produced, which is what stops PSI from quietly
 * becoming a second scoring implementation when a weight moves or a signal is
 * added. The rest assert the two user-visible promises — a quiet venue reads as
 * a sentence rather than a zero, and every "why this venue" claim is traceable
 * to a signal value that actually exists.
 */

const VENUE = "venue-psi-1";
const UPDATED_AT = "2026-08-01T22:00:00.000Z";

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

function details(overrides: Partial<PartyScoreSignals> = {}, confidence = 0.9): PartyScoreDetails {
  return buildPartyScoreFromSignals({
    venueId: VENUE,
    signals: signals(overrides),
    confidence,
    updatedAt: UPDATED_AT,
  });
}

/**
 * The engine rounds each breakdown bucket to one decimal and PSI rounds each
 * signal the same way, so a bucket of several signals can disagree with the sum
 * of its parts by a few hundredths. Half a point is far tighter than any real
 * weight change and far looser than accumulated rounding.
 */
const ROUNDING_TOLERANCE = 0.5;

test("attribution reconciles with the engine's own breakdown", () => {
  const score = details({
    liveCheckins: 12,
    activeStories: 3,
    storyReactions: 7,
    activeEvents: 1,
    friendPresence: 2,
    goingRsvps: 9,
    interestedRsvps: 14,
    recentActivity: 6,
    recentCheckins: 4,
    recentStories: 2,
    recentStoryReactions: 3,
    recentRsvpActivity: 2,
    recentEventActivity: 1,
    recentFriendActivity: 1,
    litSignals: 5,
    recentLitSignals: 2,
  });

  const attributions = attributePartyScore(score);

  for (const group of ["baseEnergy", "socialLift", "eventLift", "recencyLift"] as const) {
    const attributed = attributions
      .filter((entry) => entry.group === group)
      .reduce((sum, entry) => sum + entry.points, 0);

    assert.ok(
      Math.abs(attributed - score.breakdown[group]) < ROUNDING_TOLERANCE,
      `${group}: PSI attributed ${attributed} but the engine reported ${score.breakdown[group]}`
    );
  }
});

test("attribution uses the canonical weights rather than its own", () => {
  const score = details({ friendPresence: 3 });
  const friends = attributePartyScore(score).find((entry) => entry.key === "friendPresence");

  assert.ok(friends);
  assert.equal(friends.value, 3);
  assert.ok(Math.abs(friends.points - 3 * DEFAULT_PARTY_SCORE_WEIGHTS.friendPresence) < 0.05);
});

test("attribution drops unset signals and ranks the loudest first", () => {
  const attributions = attributePartyScore(details({ liveCheckins: 4, friendPresence: 2, activeStories: 1 }));

  assert.deepEqual(
    attributions.map((entry) => entry.key),
    ["friendPresence", "activeStories", "liveCheckins"]
  );
  assert.ok(attributions.every((entry) => entry.value > 0));
});

test("litDecayWeight is momentum-only and never attributed to the score", () => {
  const score = details({ litDecayWeight: 4 });

  assert.ok(score.momentum > 0, "litDecayWeight should still drive momentum");
  assert.deepEqual(attributePartyScore(score), []);
});

test("a venue with no signals reads as a sentence, not a zero", () => {
  const insights = buildPsiInsights(emptyPartyScore(VENUE, UPDATED_AT));

  assert.ok(insights.length > 0, "PSI must always say something");
  const interpretation = insights.find((insight) => insight.kind === "interpretation");
  assert.ok(interpretation);
  assert.equal(interpretation.headline, "Quiet right now — check back later.");
  assert.doesNotMatch(interpretation.headline, /\b0\b/);
  assert.match(interpretation.detail, /Be the first/);
});

test("a quiet venue with RSVPs says people are planning to come", () => {
  const explanation = explainVenue(details({ goingRsvps: 3 }));

  assert.equal(explanation.hasEvidence, false, "3 going RSVPs is 0.7 points, under the reason bar");
  assert.equal(explanation.headline, "Quiet now, but people are planning to come.");
});

test("a quiet venue with a programmed event points at the lineup", () => {
  const context: PsiVenueContext = { programmedEvent: "Basement Set" };
  const insights = buildPsiInsights(emptyPartyScore(VENUE, UPDATED_AT), context);
  const interpretation = insights.find((insight) => insight.kind === "interpretation");

  assert.ok(interpretation);
  assert.equal(interpretation.headline, "Quiet now — the night here has not started.");
  assert.match(interpretation.detail, /Basement Set/);
});

test("quiet venues produce no reasons, so nothing is fabricated", () => {
  const explanation = explainVenue(emptyPartyScore(VENUE, UPDATED_AT));

  assert.deepEqual(explanation.reasons, []);
  assert.equal(explanation.hasEvidence, false);
});

test("every reason is traceable to a real signal value", () => {
  const score = details({ friendPresence: 2, activeStories: 3, liveCheckins: 9 });
  const explanation = explainVenue(score);

  assert.ok(explanation.hasEvidence);
  for (const reason of explanation.reasons) {
    const key = reason.evidence.key as keyof PartyScoreSignals;
    assert.equal(
      reason.evidence.value,
      score.signals[key],
      `${reason.id} claims ${reason.evidence.value} but the signal is ${score.signals[key]}`
    );
    assert.ok(reason.evidence.points > 0, `${reason.id} should carry its score contribution`);
    assert.match(reason.text, new RegExp(String(reason.evidence.value)));
  }
});

test("reasons are ranked by what actually moved the score", () => {
  const explanation = explainVenue(details({ friendPresence: 1, liveCheckins: 6 }));

  // One friend (9.2) outranks six check-ins (2.04) because the engine weights it that way.
  assert.equal(explanation.reasons[0].id, "friendPresence");
  assert.equal(explanation.reasons[0].text, "One of your friends is here.");
  assert.equal(explanation.headline, "One of your friends is here.");
});

test("a signal too small to move the score does not earn a sentence", () => {
  const explanation = explainVenue(details({ liveCheckins: 2 }));

  assert.equal(explanation.hasEvidence, false, "2 check-ins is 0.68 points, under the bar");
});

test("explanations stay short enough to read", () => {
  const explanation = explainVenue(
    details({ friendPresence: 3, activeStories: 4, activeEvents: 2, litSignals: 6, liveCheckins: 20 }),
    { savedEvent: true, matchingGenres: ["house"], distanceMiles: 0.4 }
  );

  assert.equal(explanation.reasons.length, 3);
});

test("viewer context explains relevance and carries no score points", () => {
  const explanation = explainVenue(emptyPartyScore(VENUE, UPDATED_AT), {
    savedEvent: true,
    matchingGenres: ["Afrobeats"],
    distanceMiles: 0.4,
  });

  assert.deepEqual(
    explanation.reasons.map((reason) => reason.id),
    ["savedEvent", "genreMatch", "distance"]
  );
  assert.ok(explanation.reasons.every((reason) => reason.evidence.points === 0));
  assert.match(explanation.reasons[1].text, /Afrobeats/);
  assert.match(explanation.reasons[2].text, /under a mile/);
});

test("scored signals outrank viewer context", () => {
  const explanation = explainVenue(details({ friendPresence: 2 }), { savedEvent: true });

  assert.equal(explanation.reasons[0].id, "friendPresence");
  assert.equal(explanation.reasons[1].id, "savedEvent");
});

test("a venue climbing ahead of its score is flagged as an anomaly", () => {
  const score = buildPartyScoreFromSignals({
    venueId: VENUE,
    signals: signals({ recentActivity: 5, recentStories: 3, recentFriendActivity: 2, liveCheckins: 2 }),
    confidence: 0.9,
    updatedAt: UPDATED_AT,
  });

  assert.ok(score.momentum >= 12 && score.score < 25, "fixture should be low score, high momentum");
  const anomaly = buildPsiInsights(score).find((insight) => insight.kind === "anomaly");
  assert.ok(anomaly);
  assert.equal(anomaly.headline, "Moving faster than its score.");
  assert.match(anomaly.detail, new RegExp(`\\+${score.momentum}`));
});

test("a venue coming down from a peak is flagged as an anomaly", () => {
  const score = buildPartyScoreFromSignals({
    venueId: VENUE,
    signals: signals({ liveCheckins: 40, activeStories: 6 }),
    confidence: 0.9,
    updatedAt: UPDATED_AT,
    previous: { score: 90, crowdLevel: "Packed", momentum: 40, trend: "up", confidence: 0.9, updatedAt: UPDATED_AT },
  });

  assert.ok(score.momentum <= -12 && score.score >= 25, "fixture should be a falling established score");
  const anomaly = buildPsiInsights(score).find((insight) => insight.kind === "anomaly");
  assert.ok(anomaly);
  assert.equal(anomaly.headline, "Coming down from a bigger night.");
});

test("a steady venue is not flagged as an anomaly", () => {
  const anomaly = buildPsiInsights(details({ liveCheckins: 30 })).find((insight) => insight.kind === "anomaly");

  assert.equal(anomaly, undefined);
});

test("missing engine inputs surface as a caveat instead of silent confidence", () => {
  const score = buildPartyScoreFromSignals({
    venueId: VENUE,
    signals: signals({ friendPresence: 2 }),
    confidence: 0.9,
    updatedAt: UPDATED_AT,
    placeholders: ["lit signals", "recent story activity"],
  });

  assert.match(explainVenue(score).caveat || "", /lit signals and recent story activity/);
});

test("a low-confidence score is hedged rather than stated flat", () => {
  assert.match(explainVenue(details({ friendPresence: 2 }, 0.5)).caveat || "", /50% confidence/);
});

test("a confident, fully-sourced score carries no caveat", () => {
  assert.equal(explainVenue(details({ friendPresence: 2 }, 0.95)).caveat, null);
});

test("a busy venue explains where its score came from", () => {
  const insights = buildPsiInsights(details({ liveCheckins: 30, friendPresence: 2, activeStories: 4 }));
  const interpretation = insights.find((insight) => insight.kind === "interpretation");

  assert.ok(interpretation);
  assert.match(interpretation.detail, /worth .* points/);
});
