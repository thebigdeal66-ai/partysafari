import { createSupabaseBrowser, resolveCurrentUserId } from "@/lib/supabaseClient";
import { buildPartyScoreFromSignals, emptyPartyScore, type PartyScore, type PartyScoreDetails, type PartyScoreSignals } from "@/lib/partyScore";
import { logSupabaseQueryError, normalizeUnknownError } from "@/lib/supabaseDiagnostics";
import { fetchVenueLitStates } from "@/lib/litEngine";
import { emptyLitVenueState } from "@/lib/litSignals";

type SupabaseClientLike = ReturnType<typeof createSupabaseBrowser>;

type CalculatePartyScoreOptions = {
  supabase?: SupabaseClientLike;
  forceRefresh?: boolean;
  recentWindowMinutes?: number;
};

type CheckinRow = {
  venue_id?: string | null;
  profile_id?: string | null;
  created_at?: string | null;
};

type StoryRow = {
  id?: string | null;
  venue_id?: string | null;
  created_at?: string | null;
};

type EventRow = {
  id?: string | null;
  venue_id?: string | null;
  status?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  created_at?: string | null;
};

type EventRsvpRow = {
  event_id?: string | null;
  user_id?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type StoryReactionRow = {
  story_id?: string | null;
  created_at?: string | null;
};

type FriendshipRow = {
  user_id?: string | null;
  friend_id?: string | null;
};

type CacheEntry = {
  value: PartyScoreDetails;
  expiresAt: number;
};

const CACHE_TTL_MS = 30_000;
const partyScoreCache = new Map<string, CacheEntry>();
const inflightByKey = new Map<string, Promise<Record<string, PartyScoreDetails>>>();

function uniqueIds(values: string[]) {
  return Array.from(new Set(values.filter((value) => typeof value === "string" && value.length > 0)));
}

function hasFreshCache(venueId: string) {
  const cached = partyScoreCache.get(venueId);
  return Boolean(cached && cached.expiresAt > Date.now());
}

export function getCachedPartyScore(venueId: string) {
  return hasFreshCache(venueId) ? partyScoreCache.get(venueId)?.value || null : null;
}

function cacheScore(score: PartyScoreDetails) {
  partyScoreCache.set(score.venueId, {
    value: score,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function parseIso(value: string | null | undefined) {
  if (!value) {
    return Number.NaN;
  }
  return Date.parse(value);
}

function isWithinWindow(value: string | null | undefined, sinceMs: number) {
  const parsed = parseIso(value);
  return Number.isFinite(parsed) && parsed >= sinceMs;
}

function isEventActive(event: EventRow, nowMs: number) {
  const status = (event.status || "").toLowerCase();
  if (!["published", "active", "live", "scheduled"].includes(status)) {
    return false;
  }

  const startMs = parseIso(event.start_time);
  const endMs = parseIso(event.end_time);
  const started = Number.isFinite(startMs) ? startMs <= nowMs : true;
  const notEnded = Number.isFinite(endMs) ? endMs > nowMs : true;
  return started && notEnded;
}

async function selectWithOptionalCreatedAt<T extends Record<string, unknown>>(
  supabase: SupabaseClientLike,
  table: string,
  selectColumns: string,
  apply: (query: any) => any
) {
  const withCreatedAt = await apply(supabase.from(table).select(`${selectColumns}, created_at`));
  if (!withCreatedAt.error) {
    return {
      rows: (withCreatedAt.data || []) as T[],
      hasCreatedAt: true,
    };
  }

  const fallback = await apply(supabase.from(table).select(selectColumns));
  return {
    rows: (fallback.data || []) as T[],
    hasCreatedAt: false,
  };
}

async function resolveFriendIds(supabase: SupabaseClientLike) {
  const userId = await resolveCurrentUserId();

  if (!userId) {
    return new Set<string>();
  }

  const { data } = await supabase
    .from("friendships")
    .select("user_id, friend_id")
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

  const ids = new Set<string>();
  for (const row of (data || []) as FriendshipRow[]) {
    if (row.user_id === userId && row.friend_id) {
      ids.add(row.friend_id);
    }
    if (row.friend_id === userId && row.user_id) {
      ids.add(row.user_id);
    }
  }

  return ids;
}

function createSignalSeed() {
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
  } as PartyScoreSignals;
}

export async function calculatePartyScores(venueIdsInput: string[], options: CalculatePartyScoreOptions = {}) {
  const venueIds = uniqueIds(venueIdsInput);
  if (venueIds.length === 0) {
    return {} as Record<string, PartyScoreDetails>;
  }

  const forceRefresh = options.forceRefresh === true;
  const supabase = options.supabase || createSupabaseBrowser();
  const recentWindowMinutes = options.recentWindowMinutes ?? 45;
  const cachedResults: Record<string, PartyScoreDetails> = {};
  const pendingVenueIds = venueIds.filter((venueId) => {
    const cached = !forceRefresh ? getCachedPartyScore(venueId) : null;
    if (cached) {
      cachedResults[venueId] = cached;
      return false;
    }
    return true;
  });

  if (pendingVenueIds.length === 0) {
    return cachedResults;
  }

  const cacheKey = `${pendingVenueIds.slice().sort().join(",")}:${recentWindowMinutes}`;
  const existingInflight = inflightByKey.get(cacheKey);
  if (existingInflight) {
    return {
      ...cachedResults,
      ...(await existingInflight),
    };
  }

  const computation = (async () => {
    const now = new Date();
    const nowIso = now.toISOString();
    const nowMs = now.getTime();
    const recentSinceMs = nowMs - recentWindowMinutes * 60 * 1000;
    const friendIds = await resolveFriendIds(supabase);

    const placeholdersByVenue = new Map<string, Set<string>>();
    const ensurePlaceholderSet = (venueId: string) => {
      const existing = placeholdersByVenue.get(venueId);
      if (existing) {
        return existing;
      }
      const created = new Set<string>();
      placeholdersByVenue.set(venueId, created);
      return created;
    };

    const [checkinsSettled, storiesSettled, eventsSettled] = await Promise.allSettled([
      selectWithOptionalCreatedAt<CheckinRow>(supabase, "venue_checkins", "venue_id, profile_id", (query) =>
        query.in("venue_id", pendingVenueIds).gt("expires_at", nowIso)
      ),
      selectWithOptionalCreatedAt<StoryRow>(supabase, "stories", "id, venue_id", (query) =>
        query.in("venue_id", pendingVenueIds).is("deleted_at", null).gt("expires_at", nowIso)
      ),
      selectWithOptionalCreatedAt<EventRow>(supabase, "events", "id, venue_id, status, start_time, end_time", (query) =>
        query.in("venue_id", pendingVenueIds)
      ),
    ]);

    const checkinsResult = checkinsSettled.status === "fulfilled"
      ? checkinsSettled.value
      : { rows: [] as CheckinRow[], hasCreatedAt: false };
    const storiesResult = storiesSettled.status === "fulfilled"
      ? storiesSettled.value
      : { rows: [] as StoryRow[], hasCreatedAt: false };
    const eventsResult = eventsSettled.status === "fulfilled"
      ? eventsSettled.value
      : { rows: [] as EventRow[], hasCreatedAt: false };

    if (checkinsSettled.status === "rejected") {
      logSupabaseQueryError({
        scope: "partyScoreEngine.calculatePartyScores",
        table: "venue_checkins",
        queryName: "loadCheckIns",
        query: "select venue_id, profile_id, created_at by venue ids where expires_at > now",
        error: normalizeUnknownError(checkinsSettled.reason, "Failed to fetch venue_checkins for party score."),
      });
    }
    if (storiesSettled.status === "rejected") {
      logSupabaseQueryError({
        scope: "partyScoreEngine.calculatePartyScores",
        table: "stories",
        queryName: "loadStories",
        query: "select id, venue_id, created_at by venue ids where deleted_at is null and expires_at > now",
        error: normalizeUnknownError(storiesSettled.reason, "Failed to fetch stories for party score."),
      });
    }
    if (eventsSettled.status === "rejected") {
      logSupabaseQueryError({
        scope: "partyScoreEngine.calculatePartyScores",
        table: "events",
        queryName: "loadEvents",
        query: "select id, venue_id, status, start_time, end_time, created_at by venue ids",
        error: normalizeUnknownError(eventsSettled.reason, "Failed to fetch events for party score."),
      });
    }

    if (!checkinsResult.hasCreatedAt) {
      pendingVenueIds.forEach((venueId) => ensurePlaceholderSet(venueId).add("recent check-in activity"));
    }
    if (!storiesResult.hasCreatedAt) {
      pendingVenueIds.forEach((venueId) => ensurePlaceholderSet(venueId).add("recent story activity"));
    }
    if (!eventsResult.hasCreatedAt) {
      pendingVenueIds.forEach((venueId) => ensurePlaceholderSet(venueId).add("recent event activity"));
    }

    const storyIds = (storiesResult.rows || []).map((row) => row.id).filter((value): value is string => typeof value === "string" && value.length > 0);
    const eventIds = (eventsResult.rows || []).map((row) => row.id).filter((value): value is string => typeof value === "string" && value.length > 0);

    const [rsvpSettled, reactionsSettled, litSettled] = await Promise.allSettled([
      eventIds.length > 0
        ? selectWithOptionalCreatedAt<EventRsvpRow>(supabase, "event_rsvps", "event_id, user_id, status", (query) => query.in("event_id", eventIds))
        : Promise.resolve({ rows: [] as EventRsvpRow[], hasCreatedAt: true }),
      storyIds.length > 0
        ? selectWithOptionalCreatedAt<StoryReactionRow>(supabase, "story_reactions", "story_id", (query) => query.in("story_id", storyIds))
        : Promise.resolve({ rows: [] as StoryReactionRow[], hasCreatedAt: true }),
      fetchVenueLitStates(pendingVenueIds, { supabase, recentWindowMinutes }),
    ]);

    const rsvpResult = rsvpSettled.status === "fulfilled"
      ? rsvpSettled.value
      : { rows: [] as EventRsvpRow[], hasCreatedAt: false };
    const reactionsResult = reactionsSettled.status === "fulfilled"
      ? reactionsSettled.value
      : { rows: [] as StoryReactionRow[], hasCreatedAt: false };

    if (rsvpSettled.status === "rejected") {
      logSupabaseQueryError({
        scope: "partyScoreEngine.calculatePartyScores",
        table: "event_rsvps",
        queryName: "loadRSVPs",
        query: "select event_id, user_id, status, created_at by event ids",
        error: normalizeUnknownError(rsvpSettled.reason, "Failed to fetch event_rsvps for party score."),
      });
    }
    if (reactionsSettled.status === "rejected") {
      logSupabaseQueryError({
        scope: "partyScoreEngine.calculatePartyScores",
        table: "story_reactions",
        queryName: "loadStoryReactions",
        query: "select story_id, created_at by story ids",
        error: normalizeUnknownError(reactionsSettled.reason, "Failed to fetch story_reactions for party score."),
      });
    }

    // db/020 is not deployed, so the lit view is expected to be missing. `available: false`
    // means "no lit signal here", never a failure — the engine keeps every other signal.
    const litResult = litSettled.status === "fulfilled"
      ? litSettled.value
      : { statesByVenueId: {} as Record<string, ReturnType<typeof emptyLitVenueState>>, available: false };

    if (litSettled.status === "rejected") {
      logSupabaseQueryError({
        scope: "partyScoreEngine.calculatePartyScores",
        table: "venue_lit_activity",
        queryName: "loadLitActivity",
        query: "select venue_id, created_at, expires_at, is_viewer by venue ids",
        error: normalizeUnknownError(litSettled.reason, "Failed to fetch venue_lit_activity for party score."),
      });
    }

    if (!rsvpResult.hasCreatedAt) {
      pendingVenueIds.forEach((venueId) => ensurePlaceholderSet(venueId).add("recent RSVP activity"));
    }
    if (!reactionsResult.hasCreatedAt) {
      pendingVenueIds.forEach((venueId) => ensurePlaceholderSet(venueId).add("story reactions recency"));
    }

    const signalsByVenue = new Map<string, PartyScoreSignals>(pendingVenueIds.map((venueId) => [venueId, createSignalSeed()]));
    const eventVenueById = new Map<string, string>();
    const storyVenueById = new Map<string, string>();
    const friendPresenceSets = new Map<string, Set<string>>();

    for (const row of checkinsResult.rows) {
      const venueId = row.venue_id || null;
      if (!venueId || !signalsByVenue.has(venueId)) {
        continue;
      }
      const signals = signalsByVenue.get(venueId)!;
      signals.liveCheckins += 1;
      if (isWithinWindow(row.created_at, recentSinceMs)) {
        signals.recentCheckins += 1;
        signals.recentActivity += 1;
      }
      if (row.profile_id && friendIds.has(row.profile_id)) {
        const set = friendPresenceSets.get(venueId) || new Set<string>();
        set.add(row.profile_id);
        friendPresenceSets.set(venueId, set);
        if (isWithinWindow(row.created_at, recentSinceMs)) {
          signals.recentFriendActivity += 1;
        }
      }
    }

    for (const row of storiesResult.rows) {
      const venueId = row.venue_id || null;
      const storyId = row.id || null;
      if (!venueId || !signalsByVenue.has(venueId)) {
        continue;
      }
      if (storyId) {
        storyVenueById.set(storyId, venueId);
      }
      const signals = signalsByVenue.get(venueId)!;
      signals.activeStories += 1;
      if (isWithinWindow(row.created_at, recentSinceMs)) {
        signals.recentStories += 1;
        signals.recentActivity += 1;
      }
    }

    for (const row of eventsResult.rows) {
      const venueId = row.venue_id || null;
      const eventId = row.id || null;
      if (!venueId || !signalsByVenue.has(venueId)) {
        continue;
      }
      if (eventId) {
        eventVenueById.set(eventId, venueId);
      }
      const signals = signalsByVenue.get(venueId)!;
      if (isEventActive(row, nowMs)) {
        signals.activeEvents += 1;
      }
      if (isWithinWindow(row.created_at, recentSinceMs)) {
        signals.recentEventActivity += 1;
        signals.recentActivity += 1;
      }
    }

    for (const row of rsvpResult.rows) {
      const eventId = row.event_id || null;
      const venueId = eventId ? eventVenueById.get(eventId) || null : null;
      if (!venueId || !signalsByVenue.has(venueId)) {
        continue;
      }
      const signals = signalsByVenue.get(venueId)!;
      const status = (row.status || "").toLowerCase();
      if (status === "going") {
        signals.goingRsvps += 1;
      } else if (status === "interested") {
        signals.interestedRsvps += 1;
      }
      if (isWithinWindow(row.created_at, recentSinceMs)) {
        signals.recentRsvpActivity += 1;
        signals.recentActivity += 1;
      }
    }

    for (const row of reactionsResult.rows) {
      const storyId = row.story_id || null;
      const venueId = storyId ? storyVenueById.get(storyId) || null : null;
      if (!venueId || !signalsByVenue.has(venueId)) {
        continue;
      }
      const signals = signalsByVenue.get(venueId)!;
      signals.storyReactions += 1;
      if (isWithinWindow(row.created_at, recentSinceMs)) {
        signals.recentStoryReactions += 1;
        signals.recentActivity += 1;
      }
    }

    const results: Record<string, PartyScoreDetails> = {};
    for (const venueId of pendingVenueIds) {
      const signals = signalsByVenue.get(venueId) || createSignalSeed();
      signals.friendPresence = friendPresenceSets.get(venueId)?.size || 0;

      const litState = litResult.statesByVenueId[venueId] || emptyLitVenueState(venueId);
      signals.litSignals = litState.litCount;
      signals.recentLitSignals = litState.recentLitCount;
      signals.litDecayWeight = litState.decayWeight;

      const placeholders = Array.from(ensurePlaceholderSet(venueId));
      const availableSources = [
        true,
        true,
        storyIds.length > 0,
        eventIds.length > 0,
        true,
        friendIds.size >= 0,
        placeholders.length === 0,
      ].filter(Boolean).length;
      const activeSources = [
        signals.liveCheckins > 0,
        signals.activeStories > 0,
        signals.storyReactions > 0,
        signals.activeEvents > 0,
        signals.friendPresence > 0,
        signals.goingRsvps + signals.interestedRsvps > 0,
        signals.recentActivity > 0,
      ].filter(Boolean).length;
      const confidence = 0.35 + (availableSources / 7) * 0.4 + (activeSources / 7) * 0.25;

      // Reported after `confidence` is computed, never before. `availableSources` reads
      // `placeholders.length === 0`, so folding the lit placeholder in above would drop
      // every venue's confidence for as long as db/020 stays undeployed — a regression
      // caused by adding a signal, which is exactly what the additive rule forbids.
      const publishedPlaceholders = litResult.available ? placeholders : [...placeholders, "lit signals"];
      const previous = getCachedPartyScore(venueId) as PartyScore | null;
      const score = buildPartyScoreFromSignals({
        venueId,
        signals,
        confidence,
        updatedAt: nowIso,
        placeholders: publishedPlaceholders,
        previous,
      });
      results[venueId] = score;
      cacheScore(score);
    }

    return results;
  })();

  inflightByKey.set(cacheKey, computation);

  try {
    const freshResults = await computation;
    return {
      ...cachedResults,
      ...freshResults,
    };
  } finally {
    inflightByKey.delete(cacheKey);
  }
}

export async function calculatePartyScore(venueId: string, options: CalculatePartyScoreOptions = {}) {
  const scores = await calculatePartyScores([venueId], options);
  return scores[venueId] || emptyPartyScore(venueId);
}