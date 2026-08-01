import assert from "node:assert/strict";
import test from "node:test";
import {
  anonymizeContributor,
  buildCrowdPulse,
  computeCrowdPulseTrend,
  crowdPulseDecayFactor,
  describeCrowdPulseCell,
  emptyCrowdPulse,
  normalizeCrowdPulseSignals,
  resolveCrowdPulseLevel,
  toCrowdPulseCell,
  CROWD_PULSE_CONFIG,
} from "@/lib/crowdPulse";
import type { CrowdPulseSignalInput, CrowdPulseVenueInput } from "@/lib/crowdPulseTypes";
import { DEFAULT_PARTY_SCORE_WEIGHTS } from "@/lib/partyScore";
import { FEATURE_FLAG_DEFAULTS, isFeatureEnabled } from "@/lib/featureFlags";

/**
 * Run with `npm test`. These cover the whole of Crowd Pulse that lives in
 * TypeScript — binning, decay, the contributor floor, thresholds and trend —
 * because all of it is pure. There is no Supabase in CI and `useCrowdPulse` is
 * a read over tables that do not exist here, so the hook is out of scope; what
 * these guarantee is that the engine it feeds cannot drift.
 */

const MINUTE = 60_000;
const NOW = Date.parse("2026-08-01T23:00:00.000Z");

/** Ocean City boardwalk, near enough. Two venues 0.0005° apart share a 0.005° cell. */
const VENUE_A = { venueId: "venue-a", latitude: 38.3365, longitude: -75.0849 };
const VENUE_B = { venueId: "venue-b", latitude: 38.337, longitude: -75.0845 };
/** ~2 km north — a different cell at any sane bin size. */
const VENUE_FAR = { venueId: "venue-far", latitude: 38.3585, longitude: -75.0752 };

function checkin(venueId: string, ageMinutes: number, contributor: string): CrowdPulseSignalInput {
  return {
    venueId,
    kind: "checkin",
    occurredAt: new Date(NOW - ageMinutes * MINUTE).toISOString(),
    contributorToken: anonymizeContributor(contributor),
  };
}

/** Enough distinct contributors to clear the floor, all fresh. */
function crowd(venueId: string, count: number, ageMinutes = 1, prefix = "p"): CrowdPulseSignalInput[] {
  return Array.from({ length: count }, (_unused, index) => checkin(venueId, ageMinutes, `${prefix}-${index}`));
}

function build(venues: CrowdPulseVenueInput[], signals: CrowdPulseSignalInput[]) {
  return buildCrowdPulse({ venues, signals, now: NOW });
}

function bucketFor(venueId: string, venues: CrowdPulseVenueInput[], signals: CrowdPulseSignalInput[]) {
  const { buckets } = build(venues, signals);
  const bucket = buckets.find((candidate) => candidate.venueIds.includes(venueId));
  assert.ok(bucket, `expected a bucket containing ${venueId}`);
  return bucket;
}

test("venues close together fall into the same geographic bucket", () => {
  const { buckets } = build([VENUE_A, VENUE_B], crowd("venue-a", 3));

  assert.equal(buckets.length, 1);
  assert.deepEqual(buckets[0].venueIds, ["venue-a", "venue-b"]);
  assert.equal(
    toCrowdPulseCell(VENUE_A.latitude, VENUE_A.longitude)?.id,
    toCrowdPulseCell(VENUE_B.latitude, VENUE_B.longitude)?.id
  );
});

test("venues far apart fall into different buckets", () => {
  const { buckets } = build([VENUE_A, VENUE_FAR], [...crowd("venue-a", 3), ...crowd("venue-far", 3, 1, "q")]);

  assert.equal(buckets.length, 2);
  assert.notEqual(buckets[0].id, buckets[1].id);
  const cellIds = buckets.map((bucket) => bucket.id).sort();
  assert.deepEqual(
    cellIds,
    [
      toCrowdPulseCell(VENUE_A.latitude, VENUE_A.longitude)!.id,
      toCrowdPulseCell(VENUE_FAR.latitude, VENUE_FAR.longitude)!.id,
    ].sort()
  );
  // Every bucket centre is a cell centre, never a venue's own coordinate.
  for (const bucket of buckets) {
    assert.notEqual(bucket.center.lat, VENUE_A.latitude);
    assert.notEqual(bucket.center.lng, VENUE_A.longitude);
  }
});

test("venues with missing or malformed coordinates are excluded safely", () => {
  const broken: CrowdPulseVenueInput[] = [
    { venueId: "null-coords", latitude: null, longitude: null },
    { venueId: "string-coords", latitude: "38.34", longitude: "-75.08" },
    { venueId: "nan-coords", latitude: Number.NaN, longitude: 0 },
    { venueId: "out-of-range", latitude: 191, longitude: -75.08 },
    { venueId: "half-missing", latitude: 38.34, longitude: undefined },
  ];

  const { buckets, summary } = build([...broken, VENUE_A], crowd("venue-a", 3));

  assert.equal(summary.excludedVenueCount, broken.length);
  assert.equal(summary.venueCount, 1);
  assert.equal(buckets.length, 1);
  assert.deepEqual(buckets[0].venueIds, ["venue-a"]);

  // Signals for an unplaceable venue are dropped, not reassigned to a neighbour.
  const withOrphanSignals = build([...broken, VENUE_A], [...crowd("venue-a", 3), ...crowd("null-coords", 5, 1, "z")]);
  assert.equal(withOrphanSignals.buckets[0].signalCounts.checkin, 3);

  // Nothing placeable at all is an empty read, not a throw.
  const nothing = build(broken, crowd("null-coords", 5));
  assert.deepEqual(nothing.buckets, []);
  assert.equal(nothing.summary.hasSignal, false);
  assert.equal(nothing.summary.excludedVenueCount, broken.length);
});

test("stale signals decay toward zero and drop out at the window edge", () => {
  const { decayHalfLifeMinutes, signalWindowMinutes } = CROWD_PULSE_CONFIG;

  assert.equal(crowdPulseDecayFactor(0), 1);
  assert.equal(crowdPulseDecayFactor(-1), 1);
  assert.equal(crowdPulseDecayFactor(Number.NaN), 1);
  assert.equal(crowdPulseDecayFactor(decayHalfLifeMinutes * MINUTE), 0.5);
  assert.equal(crowdPulseDecayFactor(2 * decayHalfLifeMinutes * MINUTE), 0.25);
  assert.equal(crowdPulseDecayFactor(signalWindowMinutes * MINUTE), 0);
  assert.equal(crowdPulseDecayFactor(signalWindowMinutes * MINUTE + 1), 0);

  // A cell whose only signals sit past the window publishes nothing at all.
  const expired = build([VENUE_A], crowd("venue-a", 4, signalWindowMinutes + 10));
  assert.equal(expired.buckets[0].contributorFloorMet, false);
  assert.equal(expired.summary.hasSignal, false);

  const stale = bucketFor("venue-a", [VENUE_A], crowd("venue-a", 4, decayHalfLifeMinutes));
  const fresh = bucketFor("venue-a", [VENUE_A], crowd("venue-a", 4, 0));
  assert.ok(stale.weightedIntensity < fresh.weightedIntensity);
  assert.ok(Math.abs(stale.weightedIntensity - fresh.weightedIntensity / 2) < 0.001);
});

test("fresh signals outweigh stale signals of the same kind", () => {
  const freshCell = bucketFor("venue-a", [VENUE_A], crowd("venue-a", 5, 1));
  const staleCell = bucketFor("venue-a", [VENUE_A], crowd("venue-a", 5, 110));

  assert.equal(freshCell.signalCounts.checkin, staleCell.signalCounts.checkin);
  assert.ok(freshCell.weightedIntensity > staleCell.weightedIntensity * 4);
  assert.ok(freshCell.intensity > staleCell.intensity);
});

test("a bucket below the contributor floor reports no signal rather than a small number", () => {
  const belowFloor = CROWD_PULSE_CONFIG.minContributors - 1;
  const { buckets, summary } = build([VENUE_A], crowd("venue-a", belowFloor));
  const bucket = buckets[0];

  assert.equal(bucket.contributorFloorMet, false);
  assert.equal(bucket.level, "no-signal");
  assert.equal(bucket.contributorCount, 0);
  assert.equal(bucket.intensity, 0);
  assert.equal(bucket.weightedIntensity, 0);
  assert.equal(bucket.confidence, 0);
  assert.equal(bucket.trend, "flat");
  assert.deepEqual(Object.values(bucket.signalCounts), [0, 0, 0, 0, 0, 0]);
  assert.equal(summary.hasSignal, false);
  assert.equal(summary.suppressedBucketCount, 1);
  assert.equal(summary.reportedBucketCount, 0);
  assert.equal(summary.totalWeightedIntensity, 0);

  // The same person acting repeatedly is one contributor, so repetition cannot
  // buy a cell past the floor.
  const repeated = build([VENUE_A], [checkin("venue-a", 1, "solo"), checkin("venue-a", 2, "solo"), checkin("venue-a", 3, "solo")]);
  assert.equal(repeated.buckets[0].contributorFloorMet, false);

  // Neither can a running event, which carries no contributor at all.
  const eventOnly = build([VENUE_A], [
    { venueId: "venue-a", kind: "event", occurredAt: new Date(NOW).toISOString(), contributorToken: null },
  ]);
  assert.equal(eventOnly.buckets[0].contributorFloorMet, false);
  assert.equal(eventOnly.buckets[0].level, "no-signal");
});

test("a bucket at the contributor floor publishes its counts", () => {
  const atFloor = CROWD_PULSE_CONFIG.minContributors;
  const bucket = bucketFor("venue-a", [VENUE_A], crowd("venue-a", atFloor));

  assert.equal(bucket.contributorFloorMet, true);
  assert.equal(bucket.contributorCount, atFloor);
  assert.equal(bucket.signalCounts.checkin, atFloor);
  assert.notEqual(bucket.level, "no-signal");
  assert.ok(bucket.weightedIntensity > 0);
  assert.ok(bucket.confidence > 0);

  // Contributors pool across the venues sharing a cell — the floor is a property
  // of the place, not of any one business inside it.
  const pooled = build([VENUE_A, VENUE_B], [
    ...crowd("venue-a", 2, 1, "a"),
    ...crowd("venue-b", 1, 1, "b"),
  ]);
  assert.equal(pooled.buckets.length, 1);
  assert.equal(pooled.buckets[0].contributorFloorMet, true);
  assert.equal(pooled.buckets[0].contributorCount, 3);
});

test("zero signals produce an empty state rather than a fabricated reading", () => {
  const withVenues = build([VENUE_A, VENUE_FAR], []);
  assert.equal(withVenues.summary.hasSignal, false);
  assert.equal(withVenues.summary.reportedBucketCount, 0);
  assert.equal(withVenues.summary.suppressedBucketCount, 2);
  assert.equal(withVenues.summary.peakLevel, "no-signal");
  assert.equal(withVenues.summary.trend, "flat");
  assert.ok(withVenues.buckets.every((bucket) => bucket.level === "no-signal"));

  const withNothing = build([], []);
  assert.deepEqual(withNothing.buckets, []);
  assert.equal(withNothing.summary.venueCount, 0);
  assert.deepEqual(withNothing, emptyCrowdPulse(withNothing.summary.updatedAt));
});

test("trend reads rising when the current window outweighs the previous one", () => {
  const { trendWindowMinutes } = CROWD_PULSE_CONFIG;
  const bucket = bucketFor("venue-a", [VENUE_A], [
    ...crowd("venue-a", 8, 2, "now"),
    ...crowd("venue-a", 2, trendWindowMinutes + 5, "before"),
  ]);

  assert.equal(bucket.trend, "rising");
  assert.equal(computeCrowdPulseTrend(10, 4), "rising");
  // No previous activity at all is a rise, provided there is enough of it to mean something.
  assert.equal(computeCrowdPulseTrend(5, 0), "rising");
});

test("trend reads flat when the two windows agree", () => {
  const { trendWindowMinutes } = CROWD_PULSE_CONFIG;
  const bucket = bucketFor("venue-a", [VENUE_A], [
    ...crowd("venue-a", 5, 2, "now"),
    ...crowd("venue-a", 5, trendWindowMinutes + 5, "before"),
  ]);

  assert.equal(bucket.trend, "flat");
  assert.equal(computeCrowdPulseTrend(10, 10), "flat");
  // Inside the dead band, so noise does not flip the arrow between polls.
  assert.equal(computeCrowdPulseTrend(11, 10), "flat");
  assert.equal(computeCrowdPulseTrend(9, 10), "flat");
  // Too little happening either side to claim a direction.
  assert.equal(computeCrowdPulseTrend(0.5, 0), "flat");
  assert.equal(computeCrowdPulseTrend(0, 0), "flat");
});

test("trend reads falling when the previous window outweighs the current one", () => {
  const { trendWindowMinutes } = CROWD_PULSE_CONFIG;
  const bucket = bucketFor("venue-a", [VENUE_A], [
    ...crowd("venue-a", 3, 2, "now"),
    ...crowd("venue-a", 12, trendWindowMinutes + 5, "before"),
  ]);

  assert.equal(bucket.trend, "falling");
  assert.equal(computeCrowdPulseTrend(4, 10), "falling");

  // A running event is a standing condition, so it stays out of the windows
  // entirely and cannot mask a cell that is draining.
  const withEvent = bucketFor("venue-a", [VENUE_A], [
    ...crowd("venue-a", 3, 2, "now"),
    ...crowd("venue-a", 12, trendWindowMinutes + 5, "before"),
    { venueId: "venue-a", kind: "event", occurredAt: new Date(NOW - 300 * MINUTE).toISOString(), contributorToken: null },
  ]);
  assert.equal(withEvent.trend, "falling");
  assert.equal(withEvent.signalCounts.event, 1);
});

test("no user-identifying data appears anywhere in the output", () => {
  const rawIds = ["profile-1111", "profile-2222", "profile-3333", "author-4444", "rsvp-5555"];
  const venues: CrowdPulseVenueInput[] = [{ ...VENUE_A, litDecayWeight: 2.5, litCount: 3 }];
  const signals: CrowdPulseSignalInput[] = [
    checkin("venue-a", 1, rawIds[0]),
    checkin("venue-a", 2, rawIds[1]),
    checkin("venue-a", 3, rawIds[2]),
    { venueId: "venue-a", kind: "story", occurredAt: new Date(NOW - MINUTE).toISOString(), contributorToken: anonymizeContributor(rawIds[3]) },
    { venueId: "venue-a", kind: "rsvpGoing", occurredAt: new Date(NOW - MINUTE).toISOString(), contributorToken: anonymizeContributor(rawIds[4]) },
  ];

  const result = build(venues, signals);
  const serialized = JSON.stringify(result);

  for (const rawId of rawIds) {
    assert.ok(!serialized.includes(rawId), `${rawId} leaked into the output`);
    assert.ok(!serialized.includes(anonymizeContributor(rawId)), "an anonymised token leaked into the output");
  }

  // The only fields on a bucket are the published contract — no stray passenger
  // can ride along on a spread.
  assert.deepEqual(Object.keys(result.buckets[0]).sort(), [
    "center",
    "confidence",
    "contributorCount",
    "contributorFloorMet",
    "id",
    "intensity",
    "label",
    "level",
    "signalCounts",
    "trend",
    "updatedAt",
    "venueIds",
    "weightedIntensity",
  ]);

  // Counting is all the token is for, and hashing is stable and one-way in practice.
  assert.equal(result.buckets[0].contributorCount, 5);
  assert.equal(anonymizeContributor(rawIds[0]), anonymizeContributor(rawIds[0]));
  assert.notEqual(anonymizeContributor(rawIds[0]), anonymizeContributor(rawIds[1]));
  assert.ok(!anonymizeContributor(rawIds[0]).includes(rawIds[0]));
  assert.equal(anonymizeContributor(""), "");
});

test("identical inputs produce identical output", () => {
  const venues: CrowdPulseVenueInput[] = [
    { ...VENUE_A, litDecayWeight: 1.25, litCount: 2 },
    VENUE_B,
    VENUE_FAR,
    { venueId: "no-coords", latitude: null, longitude: null },
  ];
  const signals: CrowdPulseSignalInput[] = [
    ...crowd("venue-a", 4, 3, "a"),
    ...crowd("venue-b", 3, 25, "b"),
    ...crowd("venue-far", 4, 1, "f"),
    { venueId: "venue-far", kind: "story", occurredAt: new Date(NOW - 6 * MINUTE).toISOString(), contributorToken: anonymizeContributor("s-1") },
    { venueId: "venue-far", kind: "event", occurredAt: new Date(NOW - 90 * MINUTE).toISOString(), contributorToken: null },
    { venueId: "venue-a", kind: "rsvpInterested", occurredAt: "not-a-date", contributorToken: anonymizeContributor("bad") },
  ];

  const first = build(venues, signals);
  const second = build(venues.slice(), signals.slice());
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));

  // Input order must not change the reading either.
  const reversed = build(venues.slice().reverse(), signals.slice().reverse());
  assert.deepEqual(reversed, first);

  // The malformed timestamp was dropped rather than dated to now.
  const hotCell = first.buckets.find((bucket) => bucket.venueIds.includes("venue-a"));
  assert.equal(hotCell?.signalCounts.rsvpInterested, 0);
});

test("intensity, levels and confidence stay inside their declared ranges", () => {
  assert.equal(resolveCrowdPulseLevel(0.9, false), "no-signal");
  assert.equal(resolveCrowdPulseLevel(0, true), "quiet");
  assert.equal(resolveCrowdPulseLevel(CROWD_PULSE_CONFIG.quietCeiling, true), "building");
  assert.equal(resolveCrowdPulseLevel(CROWD_PULSE_CONFIG.buildingCeiling, true), "busy");
  assert.equal(resolveCrowdPulseLevel(CROWD_PULSE_CONFIG.busyCeiling, true), "peak");
  assert.equal(resolveCrowdPulseLevel(Number.NaN, true), "quiet");

  const packed = bucketFor("venue-a", [{ ...VENUE_A, litDecayWeight: 40, litCount: 40 }], crowd("venue-a", 60, 1));
  assert.equal(packed.intensity, 1);
  assert.equal(packed.level, "peak");
  assert.ok(packed.confidence <= 1);

  const quiet = bucketFor("venue-a", [VENUE_A], crowd("venue-a", 3, 1));
  assert.ok(quiet.intensity > 0 && quiet.intensity < 1);
  assert.ok(quiet.confidence >= 0.3 && quiet.confidence <= 1);
});

test("weights come from the canonical Party Score table and are never redefined", () => {
  for (const weightKey of Object.values(CROWD_PULSE_CONFIG.weightKeys)) {
    assert.equal(typeof DEFAULT_PARTY_SCORE_WEIGHTS[weightKey], "number");
  }

  const cellIdByVenueId = new Map([["venue-a", "cell-1"]]);
  const [normalized] = normalizeCrowdPulseSignals([checkin("venue-a", 0, "p")], cellIdByVenueId, NOW);
  assert.equal(normalized.rawWeight, DEFAULT_PARTY_SCORE_WEIGHTS.liveCheckins);

  // Swapping the table swaps the reading, which is what proves nothing is hard-coded.
  const doubled = { ...DEFAULT_PARTY_SCORE_WEIGHTS, liveCheckins: DEFAULT_PARTY_SCORE_WEIGHTS.liveCheckins * 2 };
  const base = buildCrowdPulse({ venues: [VENUE_A], signals: crowd("venue-a", 4, 0), now: NOW });
  const scaled = buildCrowdPulse({ venues: [VENUE_A], signals: crowd("venue-a", 4, 0), now: NOW, weights: doubled });
  assert.ok(Math.abs(scaled.buckets[0].weightedIntensity - base.buckets[0].weightedIntensity * 2) < 0.001);
});

test("cell binning and labelling are stable and coordinate-derived", () => {
  assert.equal(toCrowdPulseCell(null, null), null);
  assert.equal(toCrowdPulseCell(38.34, null), null);
  assert.equal(toCrowdPulseCell(38.34, -75.08, { binSizeDegrees: 0 })?.id, toCrowdPulseCell(38.34, -75.08)?.id);

  const coarse = toCrowdPulseCell(38.3365, -75.0849, { binSizeDegrees: 1 });
  assert.equal(coarse?.id, "cp:38:-76");
  assert.deepEqual(coarse?.center, { lat: 38.5, lng: -75.5 });
  assert.equal(describeCrowdPulseCell({ lat: 38.5, lng: -75.5 }), "38.500° N, 75.500° W");
  assert.equal(describeCrowdPulseCell({ lat: -12.25, lng: 4.5 }), "12.250° S, 4.500° E");

  // A coarser grid pools venues a finer one separates.
  const pooled = buildCrowdPulse({
    venues: [VENUE_A, VENUE_FAR],
    signals: [...crowd("venue-a", 2, 1, "a"), ...crowd("venue-far", 2, 1, "f")],
    now: NOW,
    config: { binSizeDegrees: 1 },
  });
  assert.equal(pooled.buckets.length, 1);
  assert.equal(pooled.buckets[0].contributorCount, 4);
});

test("the Crowd Pulse feature flag is off by default", () => {
  assert.equal(FEATURE_FLAG_DEFAULTS.crowdPulse, false);
  const previous = process.env.NEXT_PUBLIC_FEATURE_CROWD_PULSE;
  try {
    delete process.env.NEXT_PUBLIC_FEATURE_CROWD_PULSE;
    assert.equal(isFeatureEnabled("crowdPulse"), false);
    process.env.NEXT_PUBLIC_FEATURE_CROWD_PULSE = "";
    assert.equal(isFeatureEnabled("crowdPulse"), false);
    process.env.NEXT_PUBLIC_FEATURE_CROWD_PULSE = "false";
    assert.equal(isFeatureEnabled("crowdPulse"), false);
    process.env.NEXT_PUBLIC_FEATURE_CROWD_PULSE = "true";
    assert.equal(isFeatureEnabled("crowdPulse"), true);
    process.env.NEXT_PUBLIC_FEATURE_CROWD_PULSE = "1";
    assert.equal(isFeatureEnabled("crowdPulse"), true);
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_FEATURE_CROWD_PULSE;
    } else {
      process.env.NEXT_PUBLIC_FEATURE_CROWD_PULSE = previous;
    }
  }
});
