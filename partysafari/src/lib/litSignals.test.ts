import assert from "node:assert/strict";
import test from "node:test";
import {
  cooldownRemainingMs,
  evaluateLitEligibility,
  formatCooldownLabel,
  hasRecentCheckin,
  isWithinCooldown,
  litBoostPoints,
  litDecayFactor,
  litIneligibilityMessage,
  summarizeLitActivity,
  LIT_CHECKIN_RECENCY_MINUTES,
  LIT_COOLDOWN_MINUTES,
  LIT_DECAY_HALF_LIFE_MINUTES,
  LIT_NIGHT_QUOTA_LIMIT,
  type LitActivityRow,
  type LitCheckin,
  type LitEligibilityInput,
} from "@/lib/litSignals";
import { buildPartyScoreFromSignals, emptyPartyScore, DEFAULT_PARTY_SCORE_WEIGHTS } from "@/lib/partyScore";

/**
 * Run with `npm test` (see package.json). These cover the eligibility gate, the
 * cooldown prediction and the decay curve — the pieces of Lit that live in
 * TypeScript.
 *
 * The eligibility assertions are assertions about the *client mirror* in
 * `litSignals.ts`. The rules that actually hold are `can_lit_venue()`,
 * `within_lit_night_quota()` and the GiST exclusion constraint in db/020, which
 * no test here can exercise — there is no Postgres in CI and db/020 is not
 * deployed. What these tests guarantee is that the mirror and the SQL say the
 * same thing, so the two cannot drift silently.
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

/**
 * A check-in as live `venue_checkins` writes it: `checked_in_at` now, and
 * `expires_at` six hours later from the column default. The six hours is the
 * whole point of these fixtures — an unexpired check-in is not automatically a
 * recent one.
 */
function checkin(ageMinutes: number, lifetimeHours = 6): LitCheckin {
  const checkedInMs = NOW - ageMinutes * MINUTE;
  return {
    checkedInAt: new Date(checkedInMs).toISOString(),
    expiresAt: new Date(checkedInMs + lifetimeHours * 60 * MINUTE).toISOString(),
  };
}

function eligibility(overrides: Partial<LitEligibilityInput> = {}) {
  return evaluateLitEligibility({
    isAuthenticated: true,
    checkin: null,
    viewerExpiresAt: null,
    litsInQuotaWindow: 0,
    now: NOW,
    ...overrides,
  });
}

test("an RSVP without a check-in does not unlock lit", () => {
  // A user who has RSVP'd 'going' to an event here, and done nothing else, is a
  // user with no check-in — which is all the eligibility gate sees. RSVP is not
  // an input to `evaluateLitEligibility` and, since the branch was removed, not
  // an input to `can_lit_venue()` either. It stays a Party Score signal only.
  const rsvpOnly = eligibility({ checkin: null });

  assert.equal(rsvpOnly.canLit, false);
  assert.equal(rsvpOnly.reason, "no-recent-checkin");

  // And the copy tells them the one thing that would change the answer.
  assert.match(litIneligibilityMessage("no-recent-checkin"), /check in at this venue/i);
  assert.match(litIneligibilityMessage("no-recent-checkin"), /90 minutes/);
});

test("a check-in inside the 90-minute window unlocks lit", () => {
  assert.equal(eligibility({ checkin: checkin(1) }).canLit, true);
  assert.equal(eligibility({ checkin: checkin(89) }).canLit, true);

  // Right at the boundary. The SQL is `checked_in_at > NOW() - INTERVAL '90
  // minutes'`, a strict comparison, so exactly 90 minutes old is already out.
  assert.equal(hasRecentCheckin(checkin(LIT_CHECKIN_RECENCY_MINUTES - 1), NOW), true);
  assert.equal(hasRecentCheckin(checkin(LIT_CHECKIN_RECENCY_MINUTES), NOW), false);
});

test("a stale or lapsed check-in does not unlock lit", () => {
  // Unexpired but old: `venue_checkins.expires_at` defaults to six hours, so this
  // row is still live by the table's own reckoning. It is the exact case the
  // 90-minute window exists to reject — `expires_at > NOW()` alone would pass it.
  const stale = eligibility({ checkin: checkin(120) });
  assert.equal(stale.canLit, false);
  assert.equal(stale.reason, "no-recent-checkin");

  // Recent but already expired: someone whose check-in was cut short.
  const lapsed = eligibility({ checkin: checkin(10, 0.1) });
  assert.equal(lapsed.canLit, false);
  assert.equal(lapsed.reason, "no-recent-checkin");

  assert.equal(hasRecentCheckin(null, NOW), false);
  assert.equal(hasRecentCheckin({ checkedInAt: "not-a-date", expiresAt: "not-a-date" }, NOW), false);
});

test("a second lit at the same venue inside 60 minutes is refused", () => {
  const justLit = summarizeLitActivity(VENUE, [row({ ageMinutes: 5, isViewer: true })], { now: NOW });

  // Checked in and under quota, so the cooldown is the only thing left to refuse.
  const blocked = eligibility({ checkin: checkin(5), viewerExpiresAt: justLit.viewerExpiresAt });
  assert.equal(blocked.canLit, false);
  assert.equal(blocked.reason, "cooling-down");

  // The same user at the same venue once the hour is up.
  const afterWindow = NOW + LIT_COOLDOWN_MINUTES * MINUTE;
  const freed = eligibility({
    checkin: checkin(5),
    viewerExpiresAt: justLit.viewerExpiresAt,
    now: afterWindow,
  });
  assert.equal(freed.canLit, true);
});

test("the eleventh lit in the rolling 12-hour window is refused", () => {
  const args = { checkin: checkin(5) };

  assert.equal(eligibility({ ...args, litsInQuotaWindow: 0 }).canLit, true);
  assert.equal(eligibility({ ...args, litsInQuotaWindow: LIT_NIGHT_QUOTA_LIMIT - 1 }).canLit, true);

  const overQuota = eligibility({ ...args, litsInQuotaWindow: LIT_NIGHT_QUOTA_LIMIT });
  assert.equal(overQuota.canLit, false);
  assert.equal(overQuota.reason, "night-quota-reached");
  assert.match(litIneligibilityMessage("night-quota-reached"), /all 10 lits/);
});

test("signed-out users are told to sign in rather than shown a dead button", () => {
  const signedOut = eligibility({ isAuthenticated: false, checkin: checkin(5) });
  assert.equal(signedOut.canLit, false);
  assert.equal(signedOut.reason, "unauthenticated");
  assert.match(litIneligibilityMessage("unauthenticated"), /sign in/i);
});

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
