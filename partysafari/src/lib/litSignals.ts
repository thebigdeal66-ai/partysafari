import { DEFAULT_PARTY_SCORE_WEIGHTS } from "@/lib/partyScore";

/**
 * Pure model for the Lit Button — eligibility, windows, decay and cooldown
 * arithmetic, with no Supabase and no DOM, so it can be unit-tested directly
 * (see `litSignals.test.ts`) and reused by both the scoring engine and the UI.
 *
 * None of this is enforcement. The rules that actually hold are in
 * `db/020_create_venue_lit_signals.sql`: `can_lit_venue()` for eligibility,
 * `within_lit_night_quota()` for the ceiling, and a GiST exclusion constraint
 * for the cooldown. The functions here mirror those three so the button can
 * tell the user what the database is going to say before they tap it, per
 * MASTERPLAN's "cooldown is shown, not hidden". Every constant below has a
 * named counterpart in that file and the two must move together.
 */

/**
 * How long one endorsement stays active. Doubles as the cooldown: a user may
 * hold exactly one live endorsement per venue, so the signal expiring and the
 * user becoming eligible again are the same event. Mirrors the 60 minutes in
 * db/020 — change both together.
 */
export const LIT_COOLDOWN_MINUTES = 60;

/**
 * Half-life of an endorsement's pull on momentum. At 20 minutes a fresh tap is
 * worth 8x one from the end of its own window, which is what makes a Lit read
 * as "right now" rather than "sometime this hour".
 */
export const LIT_DECAY_HALF_LIFE_MINUTES = 20;

/**
 * How recently the user must have checked in at a venue for the Lit Button to
 * unlock there. Mirrors `checked_in_at > NOW() - INTERVAL '90 minutes'` in
 * `can_lit_venue()` — change both together.
 *
 * Deliberately shorter than a check-in's own six-hour `expires_at` default: an
 * unexpired check-in only proves the user was at the venue at some point this
 * evening, and Lit is a claim about right now.
 */
export const LIT_CHECKIN_RECENCY_MINUTES = 90;

/** Endorsements one user may make across all venues per rolling window. Mirrors `within_lit_night_quota()`. */
export const LIT_NIGHT_QUOTA_LIMIT = 10;

/** Rolling rather than per calendar night, so midnight does not hand out a fresh allowance. */
export const LIT_NIGHT_QUOTA_WINDOW_HOURS = 12;

const MINUTE_MS = 60_000;
const LIT_COOLDOWN_MS = LIT_COOLDOWN_MINUTES * MINUTE_MS;
const LIT_DECAY_HALF_LIFE_MS = LIT_DECAY_HALF_LIFE_MINUTES * MINUTE_MS;
const LIT_CHECKIN_RECENCY_MS = LIT_CHECKIN_RECENCY_MINUTES * MINUTE_MS;

/** One active endorsement, as published by the `venue_lit_activity` view. */
export type LitActivityRow = {
  venueId: string;
  createdAt: string;
  expiresAt: string;
  /** True when this row belongs to the signed-in caller. The view never says whose the others are. */
  isViewer: boolean;
};

export type LitVenueState = {
  venueId: string;
  /** Active endorsements, decayed or not. This is the number the button shows. */
  litCount: number;
  /** Subset laid down inside the Party Score recent window. */
  recentLitCount: number;
  /** Sum of per-row decay factors. Continuous, so it moves between polls. */
  decayWeight: number;
  /** Whether the caller holds a live endorsement here. */
  viewerHasLit: boolean;
  /** When the caller's endorsement expires and they may endorse again. */
  viewerExpiresAt: string | null;
};

export function emptyLitVenueState(venueId: string): LitVenueState {
  return {
    venueId,
    litCount: 0,
    recentLitCount: 0,
    decayWeight: 0,
    viewerHasLit: false,
    viewerExpiresAt: null,
  };
}

function parseIso(value: string | null | undefined) {
  if (!value) {
    return Number.NaN;
  }
  return Date.parse(value);
}

/**
 * Weight of a single endorsement at `ageMs` old, on a 0-1 scale.
 *
 * Exponential rather than linear so the curve is steepest where it matters —
 * the difference between a tap 60 seconds ago and one 10 minutes ago is the
 * signal a nightlife ranking is actually made of. Returns 0 once the signal has
 * outlived its window so decay and expiry cannot disagree.
 */
export function litDecayFactor(ageMs: number): number {
  if (!Number.isFinite(ageMs) || ageMs <= 0) {
    return 1;
  }
  if (ageMs >= LIT_COOLDOWN_MS) {
    return 0;
  }
  return Math.pow(2, -ageMs / LIT_DECAY_HALF_LIFE_MS);
}

/**
 * Fold the active rows for one venue into the shape the score and the UI read.
 * Rows already expired are ignored rather than trusted, because the view's
 * `expires_at > NOW()` filter was evaluated on the server at fetch time and
 * this may run a poll interval later.
 */
export function summarizeLitActivity(
  venueId: string,
  rows: LitActivityRow[],
  options: { now?: number; recentWindowMinutes?: number } = {}
): LitVenueState {
  const now = options.now ?? Date.now();
  const recentSinceMs = now - (options.recentWindowMinutes ?? 45) * MINUTE_MS;
  const state = emptyLitVenueState(venueId);

  for (const row of rows) {
    const createdMs = parseIso(row.createdAt);
    const expiresMs = parseIso(row.expiresAt);
    if (!Number.isFinite(createdMs) || !Number.isFinite(expiresMs) || expiresMs <= now) {
      continue;
    }

    state.litCount += 1;
    state.decayWeight += litDecayFactor(now - createdMs);
    if (createdMs >= recentSinceMs) {
      state.recentLitCount += 1;
    }

    if (row.isViewer) {
      state.viewerHasLit = true;
      const current = parseIso(state.viewerExpiresAt);
      if (!Number.isFinite(current) || expiresMs > current) {
        state.viewerExpiresAt = row.expiresAt;
      }
    }
  }

  state.decayWeight = Math.round(state.decayWeight * 1000) / 1000;
  return state;
}

/**
 * Milliseconds until the caller may endorse this venue again. 0 means ready.
 */
export function cooldownRemainingMs(viewerExpiresAt: string | null, now = Date.now()): number {
  const expiresMs = parseIso(viewerExpiresAt);
  if (!Number.isFinite(expiresMs)) {
    return 0;
  }
  return Math.max(0, expiresMs - now);
}

/**
 * The client-side mirror of the exclusion constraint in db/020. A `true` here
 * predicts the database refusing the insert; it does not cause the refusal.
 */
export function isWithinCooldown(viewerExpiresAt: string | null, now = Date.now()): boolean {
  return cooldownRemainingMs(viewerExpiresAt, now) > 0;
}

/** The viewer's most recent check-in at one venue, as published by `venue_checkins`. */
export type LitCheckin = {
  checkedInAt: string;
  expiresAt: string;
};

/**
 * Why the button is locked. Ordered by how actionable the copy is, not by the
 * order `can_lit_venue()` evaluates its conjuncts — RLS refuses as a single
 * boolean and never says which part failed, so the client picks the one reason
 * worth showing.
 */
export type LitIneligibilityReason =
  | "unauthenticated"
  | "cooling-down"
  | "night-quota-reached"
  | "no-recent-checkin";

export type LitEligibility = {
  canLit: boolean;
  reason: LitIneligibilityReason | null;
};

export type LitEligibilityInput = {
  isAuthenticated: boolean;
  /** The viewer's live check-in at this venue, or null if they have none. */
  checkin: LitCheckin | null;
  /** Expiry of the viewer's own active endorsement here, from `summarizeLitActivity`. */
  viewerExpiresAt: string | null;
  /** How many endorsements the viewer has made across all venues in the rolling quota window. */
  litsInQuotaWindow: number;
  now?: number;
};

/**
 * The check-in half of `can_lit_venue()`. Both bounds are required and both are
 * strict, matching the SQL: `checked_in_at` carries the 90-minute recency rule,
 * and `expires_at` is still consulted so a lapsed check-in cannot unlock the
 * button. A check-in that is unexpired but three hours old is not enough — that
 * is the defect this window exists to close.
 */
export function hasRecentCheckin(checkin: LitCheckin | null, now = Date.now()): boolean {
  if (!checkin) {
    return false;
  }
  const checkedInMs = parseIso(checkin.checkedInAt);
  const expiresMs = parseIso(checkin.expiresAt);
  if (!Number.isFinite(checkedInMs) || !Number.isFinite(expiresMs)) {
    return false;
  }
  return checkedInMs > now - LIT_CHECKIN_RECENCY_MS && expiresMs > now;
}

/** The ceiling half, mirroring `within_lit_night_quota()`. */
export function withinNightQuota(litsInQuotaWindow: number): boolean {
  return litsInQuotaWindow < LIT_NIGHT_QUOTA_LIMIT;
}

/**
 * The client-side mirror of the whole server gate. A `canLit: false` predicts a
 * refusal; it does not cause one. Notably absent is an RSVP path — a 'going'
 * RSVP is intent declared in advance from anywhere and never unlocks Lit, here
 * or in `can_lit_venue()`.
 *
 * Venue self-endorsement is enforced server-side only. The client does not read
 * `venues.owner_id`, so it cannot predict that refusal and does not pretend to;
 * an owner who taps gets the post-hoc refusal instead.
 */
export function evaluateLitEligibility(input: LitEligibilityInput): LitEligibility {
  const now = input.now ?? Date.now();

  if (!input.isAuthenticated) {
    return { canLit: false, reason: "unauthenticated" };
  }
  if (isWithinCooldown(input.viewerExpiresAt, now)) {
    return { canLit: false, reason: "cooling-down" };
  }
  if (!withinNightQuota(input.litsInQuotaWindow)) {
    return { canLit: false, reason: "night-quota-reached" };
  }
  if (!hasRecentCheckin(input.checkin, now)) {
    return { canLit: false, reason: "no-recent-checkin" };
  }
  return { canLit: true, reason: null };
}

/** Why the button is locked, in the user's terms and naming the action that unlocks it. */
export function litIneligibilityMessage(reason: LitIneligibilityReason): string {
  switch (reason) {
    case "unauthenticated":
      return "Sign in to mark a venue lit.";
    case "cooling-down":
      return "You already marked this one lit. It unlocks again when your signal expires.";
    case "night-quota-reached":
      return `You've used all ${LIT_NIGHT_QUOTA_LIMIT} lits for the last ${LIT_NIGHT_QUOTA_WINDOW_HOURS} hours. They free up as that window rolls forward.`;
    case "no-recent-checkin":
      return `Check in at this venue to unlock Lit — a check-in counts for ${LIT_CHECKIN_RECENCY_MINUTES} minutes.`;
  }
}

/** "42m" / "3m" / "45s" — coarse on purpose, this sits inside a button label. */
export function formatCooldownLabel(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  if (totalSeconds >= 60) {
    return `${Math.ceil(totalSeconds / 60)}m`;
  }
  return `${totalSeconds}s`;
}

/**
 * The venue's current lit boost expressed in Party Score momentum points — the
 * same number `buildPartyScoreFromSignals` adds to momentum, so the "+N boost"
 * chip on a venue card is reporting the real contribution rather than a
 * decorative figure of its own.
 */
export function litBoostPoints(decayWeight: number, weight = DEFAULT_PARTY_SCORE_WEIGHTS.litMomentum): number {
  if (!Number.isFinite(decayWeight) || decayWeight <= 0) {
    return 0;
  }
  return Math.round(decayWeight * weight);
}
