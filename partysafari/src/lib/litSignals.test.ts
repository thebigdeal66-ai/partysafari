import assert from "node:assert/strict";
import test from "node:test";
import {
  cooldownRemainingMs,
  formatCooldownLabel,
  isWithinCooldown,
  litBoostPoints,
  litDecayFactor,
  summarizeLitActivity,
  LIT_COOLDOWN_MINUTES,
  LIT_DECAY_HALF_LIFE_MINUTES,
  type LitActivityRow,
} from "@/lib/litSignals";
import { buildPartyScoreFromSignals, emptyPartyScore, DEFAULT_PARTY_SCORE_WEIGHTS } from "@/lib/partyScore";

/**
 * Run with `npm test` (see package.json). These cover the cooldown prediction
 * and the decay curve, which are the two pieces of Lit that live in TypeScript.
 * The cooldown that actually holds is the exclusion constraint in db/020 and is
 * not exercisable here — see the PR description for its manual walkthrough.
 */

const MINUTE = 60_000;
const VENUE = "venue-1";
const NOW = Date.parse("2026-08-01T22:00:00.000Z");

function row(overrides: Partial<LitActivityRow> & { ageMinutes: number }): LitActivityRow {
  const createdMs = NOW - overrides.ageMinutes * MINUTE;
  return {
    venueId: VENUE,
    createdAt: new Date(createdMs).toISOString(),
    expiresAt: new Date(createdMs + LIT_COOLDOWN_MINUTES * MINUTE).toISOString(),
    isViewer: overrides.isViewer ?? false,
  };
}

test("a second lit inside the cooldown window is refused, one after it is allowed", () => {
  const justLit = summarizeLitActivity(VENUE, [row({ ageMinutes: 1, isViewer: true })], { now: NOW });
  assert.equal(justLit.viewerHasLit, true);
  assert.equal(isWithinCooldown(justLit.viewerExpiresAt, NOW), true);
  assert.equal(cooldownRemainingMs(justLit.viewerExpiresAt, NOW), 59 * MINUTE);

  // One second before the window closes: still refused.
  const oneSecondEarly = NOW + 59 * MINUTE - 1_000;
  assert.equal(isWithinCooldown(justLit.viewerExpiresAt, oneSecondEarly), true);

  // At expiry and after it: allowed. The row has also dropped out of the venue's
  // active set, so expiring the signal and freeing the user are one event.
  const atExpiry = NOW + 59 * MINUTE;
  assert.equal(isWithinCooldown(justLit.viewerExpiresAt, atExpiry), false);
  assert.equal(cooldownRemainingMs(justLit.viewerExpiresAt, atExpiry + MINUTE), 0);

  const afterExpiry = summarizeLitActivity(VENUE, [row({ ageMinutes: 1, isViewer: true })], { now: atExpiry + MINUTE });
  assert.equal(afterExpiry.litCount, 0);
  assert.equal(afterExpiry.viewerHasLit, false);
  assert.equal(isWithinCooldown(afterExpiry.viewerExpiresAt, atExpiry + MINUTE), false);
});

test("the cooldown label counts down and never goes negative", () => {
  assert.equal(formatCooldownLabel(59 * MINUTE), "59m");
  assert.equal(formatCooldownLabel(90_000), "2m");
  assert.equal(formatCooldownLabel(45_000), "45s");
  assert.equal(formatCooldownLabel(0), "0s");
  assert.equal(formatCooldownLabel(-5_000), "0s");
});

test("decay halves every half-life and reaches zero at the window edge", () => {
  assert.equal(litDecayFactor(0), 1);
  assert.equal(litDecayFactor(-1), 1);
  assert.equal(litDecayFactor(LIT_DECAY_HALF_LIFE_MINUTES * MINUTE), 0.5);
  assert.equal(litDecayFactor(2 * LIT_DECAY_HALF_LIFE_MINUTES * MINUTE), 0.25);
  assert.equal(litDecayFactor(LIT_COOLDOWN_MINUTES * MINUTE), 0);
  assert.equal(litDecayFactor(Number.NaN), 1);

  // The requirement in prose: an hour-old lit counts for less than a minute-old one.
  assert.ok(litDecayFactor(59 * MINUTE) < litDecayFactor(MINUTE));
});

test("summarize splits standing, recent and decayed counts", () => {
  const rows = [
    row({ ageMinutes: 1 }),
    row({ ageMinutes: 20 }),
    row({ ageMinutes: 50, isViewer: true }),
    row({ ageMinutes: 90 }), // already expired — ignored even though the server sent it
  ];

  const state = summarizeLitActivity(VENUE, rows, { now: NOW, recentWindowMinutes: 45 });
  assert.equal(state.litCount, 3);
  assert.equal(state.recentLitCount, 2);
  assert.equal(state.viewerHasLit, true);
  assert.ok(state.decayWeight > 0.5 && state.decayWeight < 3);

  // Weight is dominated by the freshest row, not spread evenly across the three.
  const fresh = summarizeLitActivity(VENUE, [row({ ageMinutes: 1 })], { now: NOW });
  const stale = summarizeLitActivity(VENUE, [row({ ageMinutes: 50 })], { now: NOW });
  assert.ok(fresh.decayWeight > stale.decayWeight * 4);
});

test("lit contributes to momentum through the decaying weight and fades on its own", () => {
  const base = emptyPartyScore(VENUE).signals;

  const freshState = summarizeLitActivity(VENUE, [row({ ageMinutes: 1 })], { now: NOW });
  const staleState = summarizeLitActivity(VENUE, [row({ ageMinutes: 50 })], { now: NOW });

  const withFresh = buildPartyScoreFromSignals({
    venueId: VENUE,
    signals: { ...base, litSignals: 1, recentLitSignals: 1, litDecayWeight: freshState.decayWeight },
    confidence: 0.5,
    updatedAt: new Date(NOW).toISOString(),
  });
  const withStale = buildPartyScoreFromSignals({
    venueId: VENUE,
    signals: { ...base, litSignals: 1, recentLitSignals: 0, litDecayWeight: staleState.decayWeight },
    confidence: 0.5,
    updatedAt: new Date(NOW).toISOString(),
  });

  assert.ok(withFresh.momentum > withStale.momentum);
  assert.ok(withFresh.score > 0);
});

test("no lit rows leaves the party score bit-for-bit unchanged", () => {
  const signals = emptyPartyScore(VENUE).signals;
  const updatedAt = new Date(NOW).toISOString();

  const scored = buildPartyScoreFromSignals({ venueId: VENUE, signals, confidence: 0.5, updatedAt });
  assert.equal(scored.score, 0);
  assert.equal(scored.momentum, 0);
  assert.equal(scored.trend, "stable");
  assert.deepEqual(scored.breakdown, { baseEnergy: 0, socialLift: 0, eventLift: 0, recencyLift: 0 });
  assert.deepEqual(Object.keys(scored.breakdown), ["baseEnergy", "socialLift", "eventLift", "recencyLift"]);
});

test("the boost chip reports the real momentum contribution", () => {
  assert.equal(litBoostPoints(0), 0);
  assert.equal(litBoostPoints(-1), 0);
  assert.equal(litBoostPoints(2), Math.round(2 * DEFAULT_PARTY_SCORE_WEIGHTS.litMomentum));
});
