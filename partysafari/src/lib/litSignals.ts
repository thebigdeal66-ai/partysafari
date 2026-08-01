import { DEFAULT_PARTY_SCORE_WEIGHTS } from "@/lib/partyScore";

/**
 * Pure model for the Lit Button — windows, decay and cooldown arithmetic, with
 * no Supabase and no DOM, so it can be unit-tested directly (see
 * `litSignals.test.ts`) and reused by both the scoring engine and the UI.
 *
 * None of this is enforcement. The cooldown that actually holds is the
 * exclusion constraint in `db/020_create_venue_lit_signals.sql`; the functions
 * here exist so the button can show the user what the database is going to say
 * before they tap it, per MASTERPLAN's "cooldown is shown, not hidden".
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

const MINUTE_MS = 60_000;
const LIT_COOLDOWN_MS = LIT_COOLDOWN_MINUTES * MINUTE_MS;
const LIT_DECAY_HALF_LIFE_MS = LIT_DECAY_HALF_LIFE_MINUTES * MINUTE_MS;

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
