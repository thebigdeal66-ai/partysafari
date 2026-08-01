import { createSupabaseBrowser, resolveCurrentUserId } from "@/lib/supabaseClient";
import {
  emptyLitVenueState,
  summarizeLitActivity,
  LIT_CHECKIN_RECENCY_MINUTES,
  LIT_NIGHT_QUOTA_WINDOW_HOURS,
  type LitActivityRow,
  type LitCheckin,
  type LitVenueState,
} from "@/lib/litSignals";
import { logSupabaseQueryError, normalizeUnknownError } from "@/lib/supabaseDiagnostics";

/**
 * Supabase I/O for the Lit Button, shaped after `partyScoreEngine` — short TTL
 * cache, de-duplicated concurrent reads for the same venue set — so a screen
 * full of venue cards costs one query rather than one per card.
 *
 * Every aggregate read goes through `public.venue_lit_activity`, the anonymising
 * view from db/020, which is what turns own-rows-only RLS into a public count
 * without disclosing who endorsed a venue. The base `venue_lit_signals` table is
 * only ever touched for the caller's own rows — the insert, and the quota count
 * in `fetchLitViewerContext` — never to read anyone else's history.
 *
 * `db/020` has not been applied to the live project, so the view is expected to
 * be missing in production. A missing view is reported as `available: false`
 * and read as "no lit signal", never as an error the user has to see.
 */

type SupabaseClientLike = ReturnType<typeof createSupabaseBrowser>;

export type LitFetchOptions = {
  supabase?: SupabaseClientLike;
  forceRefresh?: boolean;
  recentWindowMinutes?: number;
};

export type LitFetchResult = {
  statesByVenueId: Record<string, LitVenueState>;
  /** False when the view is absent or unreadable — callers degrade, they do not throw. */
  available: boolean;
};

export type LitSubmitOutcome =
  | { status: "ok" }
  | { status: "unauthenticated" }
  | { status: "cooling-down" }
  | { status: "ineligible" }
  | { status: "unavailable" }
  | { status: "error"; message: string };

type LitActivityQueryRow = {
  venue_id?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
  is_viewer?: boolean | null;
};

type CheckinQueryRow = {
  venue_id?: string | null;
  checked_in_at?: string | null;
  expires_at?: string | null;
};

type CacheEntry = {
  value: LitVenueState;
  expiresAt: number;
};

const CACHE_TTL_MS = 20_000;
const litCache = new Map<string, CacheEntry>();
const inflightByKey = new Map<string, Promise<LitFetchResult>>();

function uniqueIds(values: string[]) {
  return Array.from(new Set(values.filter((value) => typeof value === "string" && value.length > 0)));
}

export function getCachedLitState(venueId: string): LitVenueState | null {
  const cached = litCache.get(venueId);
  return cached && cached.expiresAt > Date.now() ? cached.value : null;
}

export function invalidateLitCache(venueId: string) {
  litCache.delete(venueId);
}

export async function fetchVenueLitStates(venueIdsInput: string[], options: LitFetchOptions = {}): Promise<LitFetchResult> {
  const venueIds = uniqueIds(venueIdsInput);
  if (venueIds.length === 0) {
    return { statesByVenueId: {}, available: true };
  }

  const forceRefresh = options.forceRefresh === true;
  const supabase = options.supabase || createSupabaseBrowser();
  const recentWindowMinutes = options.recentWindowMinutes ?? 45;

  const cachedResults: Record<string, LitVenueState> = {};
  const pendingVenueIds = venueIds.filter((venueId) => {
    const cached = !forceRefresh ? getCachedLitState(venueId) : null;
    if (cached) {
      cachedResults[venueId] = cached;
      return false;
    }
    return true;
  });

  if (pendingVenueIds.length === 0) {
    return { statesByVenueId: cachedResults, available: true };
  }

  const cacheKey = `${pendingVenueIds.slice().sort().join(",")}:${recentWindowMinutes}`;
  const existingInflight = inflightByKey.get(cacheKey);
  if (existingInflight) {
    const shared = await existingInflight;
    return {
      statesByVenueId: { ...cachedResults, ...shared.statesByVenueId },
      available: shared.available,
    };
  }

  const computation = (async (): Promise<LitFetchResult> => {
    const now = Date.now();
    const { data, error } = await supabase
      .from("venue_lit_activity")
      .select("venue_id, created_at, expires_at, is_viewer")
      .in("venue_id", pendingVenueIds);

    if (error) {
      logSupabaseQueryError({
        scope: "litEngine.fetchVenueLitStates",
        table: "venue_lit_activity",
        queryName: "loadLitActivity",
        query: "select venue_id, created_at, expires_at, is_viewer by venue ids",
        error: normalizeUnknownError(error, "Failed to fetch venue_lit_activity."),
      });

      // Expected until db/020 is deployed. Report unavailability and let callers
      // fall back to an empty state rather than surfacing a failure.
      return {
        statesByVenueId: Object.fromEntries(pendingVenueIds.map((venueId) => [venueId, emptyLitVenueState(venueId)])),
        available: false,
      };
    }

    const rowsByVenue = new Map<string, LitActivityRow[]>(pendingVenueIds.map((venueId) => [venueId, []]));
    for (const row of (data || []) as LitActivityQueryRow[]) {
      const venueId = row.venue_id || "";
      const bucket = rowsByVenue.get(venueId);
      if (!bucket || !row.created_at || !row.expires_at) {
        continue;
      }
      bucket.push({
        venueId,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        isViewer: row.is_viewer === true,
      });
    }

    const statesByVenueId: Record<string, LitVenueState> = {};
    for (const venueId of pendingVenueIds) {
      const state = summarizeLitActivity(venueId, rowsByVenue.get(venueId) || [], { now, recentWindowMinutes });
      statesByVenueId[venueId] = state;
      litCache.set(venueId, { value: state, expiresAt: now + CACHE_TTL_MS });
    }

    return { statesByVenueId, available: true };
  })();

  inflightByKey.set(cacheKey, computation);

  try {
    const fresh = await computation;
    return {
      statesByVenueId: { ...cachedResults, ...fresh.statesByVenueId },
      available: fresh.available,
    };
  } finally {
    inflightByKey.delete(cacheKey);
  }
}

/**
 * Everything the client needs to predict `can_lit_venue()` and
 * `within_lit_night_quota()` before the user taps, so an ineligible user is told
 * what to do instead of being handed a refusal after the fact.
 *
 * Both reads are scoped to the caller. The `venue_lit_signals` count is the
 * caller's own rows, which is all its RLS exposes anyway; the aggregate for
 * other users stays behind `venue_lit_activity`.
 *
 * A failed read degrades to "no check-in, no quota used" rather than throwing.
 * That biases towards showing the unlock instruction, which is the same thing
 * the server would do with the request.
 */
export type LitViewerContext = {
  userId: string | null;
  /** The viewer's live check-in per venue, empty where they have none. */
  checkinByVenueId: Record<string, LitCheckin>;
  /** The viewer's endorsements across all venues inside the rolling quota window. */
  litsInQuotaWindow: number;
};

export async function fetchLitViewerContext(
  venueIdsInput: string[],
  options: { supabase?: SupabaseClientLike } = {}
): Promise<LitViewerContext> {
  const venueIds = uniqueIds(venueIdsInput);
  const userId = await resolveCurrentUserId();
  const empty: LitViewerContext = { userId, checkinByVenueId: {}, litsInQuotaWindow: 0 };

  if (!userId || venueIds.length === 0) {
    return empty;
  }

  const supabase = options.supabase || createSupabaseBrowser();
  const now = Date.now();
  const checkinSinceIso = new Date(now - LIT_CHECKIN_RECENCY_MINUTES * 60_000).toISOString();
  const quotaSinceIso = new Date(now - LIT_NIGHT_QUOTA_WINDOW_HOURS * 3_600_000).toISOString();
  const nowIso = new Date(now).toISOString();

  const [checkinsSettled, quotaSettled] = await Promise.allSettled([
    supabase
      .from("venue_checkins")
      .select("venue_id, checked_in_at, expires_at")
      .eq("profile_id", userId)
      .in("venue_id", venueIds)
      .gt("checked_in_at", checkinSinceIso)
      .gt("expires_at", nowIso),
    supabase
      .from("venue_lit_signals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gt("created_at", quotaSinceIso),
  ]);

  const context: LitViewerContext = { userId, checkinByVenueId: {}, litsInQuotaWindow: 0 };

  if (checkinsSettled.status === "fulfilled" && !checkinsSettled.value.error) {
    for (const row of (checkinsSettled.value.data || []) as CheckinQueryRow[]) {
      if (!row.venue_id || !row.checked_in_at || !row.expires_at) {
        continue;
      }
      context.checkinByVenueId[row.venue_id] = {
        checkedInAt: row.checked_in_at,
        expiresAt: row.expires_at,
      };
    }
  }

  // Expected to fail until db/020 is deployed. The button is hidden in that
  // case anyway, so a zero here is never the thing that gates a real tap.
  if (quotaSettled.status === "fulfilled" && !quotaSettled.value.error) {
    context.litsInQuotaWindow = quotaSettled.value.count ?? 0;
  }

  return context;
}

/**
 * Record one endorsement.
 *
 * Only `venue_id` and `user_id` are sent. `created_at` and `expires_at` are left
 * to their column defaults on purpose — db/020's insert policy bounds both, so
 * a client that supplied them could only narrow its own window or get rejected.
 *
 * Every refusal below is a database refusal. The button's own cooldown display
 * is a prediction of this call, not a substitute for it.
 */
export async function submitVenueLit(venueId: string, options: { supabase?: SupabaseClientLike } = {}): Promise<LitSubmitOutcome> {
  const supabase = options.supabase || createSupabaseBrowser();
  const userId = await resolveCurrentUserId();

  if (!userId) {
    return { status: "unauthenticated" };
  }

  const { error } = await supabase.from("venue_lit_signals").insert({
    venue_id: venueId,
    user_id: userId,
  });

  invalidateLitCache(venueId);

  if (!error) {
    return { status: "ok" };
  }

  const code = error.code || "";
  const message = (error.message || "").toLowerCase();

  // 42P01 undefined_table — db/020 is not deployed to this project.
  if (code === "42P01" || message.includes("does not exist")) {
    return { status: "unavailable" };
  }

  // 23P01 exclusion_violation — the cooldown constraint rejected an overlapping endorsement.
  if (code === "23P01" || message.includes("venue_lit_signals_no_overlapping_cooldown")) {
    return { status: "cooling-down" };
  }

  // 42501 — the insert policy refused: no check-in inside the 90-minute recency window,
  // owns the venue, over the nightly ceiling, or inside the cooldown the policy also
  // mirrors. RLS cannot report which conjunct failed, so the caller names the reason from
  // the eligibility state it already holds.
  if (code === "42501" || message.includes("row-level security")) {
    return { status: "ineligible" };
  }

  logSupabaseQueryError({
    scope: "litEngine.submitVenueLit",
    table: "venue_lit_signals",
    queryName: "insertLitSignal",
    query: "insert venue_id, user_id",
    error: normalizeUnknownError(error, "Failed to record lit signal."),
  });

  return { status: "error", message: error.message || "Could not record that right now." };
}
