"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import { logSupabaseQueryError, normalizeUnknownError } from "@/lib/supabaseDiagnostics";
import { fetchVenueLitStates } from "@/lib/litEngine";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { TEMP_KILL_SWITCH } from "@/lib/runtimeKillSwitch";
import {
  anonymizeContributor,
  buildCrowdPulse,
  emptyCrowdPulse,
  type CrowdPulseConfig,
} from "@/lib/crowdPulse";
import type {
  CrowdPulseBucket,
  CrowdPulseSignalInput,
  CrowdPulseSummary,
  CrowdPulseVenueInput,
} from "@/lib/crowdPulseTypes";

/**
 * Crowd Pulse for a city scope. Read-only, and dark by default.
 *
 * **No realtime subscription, deliberately.** `usePartyScores` and
 * `useLiveVenueMetrics` already hold `postgres_changes` channels on
 * `venue_checkins`, `stories`, `events` and `event_rsvps` for every venue on
 * screen. A third set over the same tables would double the socket traffic and
 * buy nothing — the same rows arrive either way. Instead this hook reads through
 * short-TTL caches (its own, plus `litEngine`'s) and exposes `refresh`, so the
 * surface that eventually mounts Crowd Pulse can drive it from the subscription
 * it already owns. That is the same choice `useVenuePsi` made: derive from what
 * the page already fetches rather than open a parallel pipeline.
 *
 * **No polling by default** either. `pollIntervalMs` is opt-in and off, because
 * nothing renders this yet and a timer nobody watches is pure cost. The mounting
 * PR turns it on or wires `refresh` to realtime, whichever the surface needs.
 *
 * **No raw rows leave.** Every row fetched below is folded into a signal the
 * pure engine can bin, and the identifiers on those rows are put through
 * `anonymizeContributor` at the point of read. `profile_id`, `author_id` and
 * `user_id` are never held in state and never returned; `buckets` and `summary`
 * are the entire surface.
 *
 * **No writes.** Every call here is a `select`.
 */

/** Long enough that a screen full of consumers costs one round trip, short enough to still read as "now". */
const CACHE_TTL_MS = 45_000;

/** Mirrors the statuses `partyScoreEngine` treats as live, applied server-side so inactive events never ship. */
const ACTIVE_EVENT_STATUSES = ["published", "active", "live", "scheduled"];

export type CrowdPulseCityScope = {
  city: string;
  state?: string | null;
};

export type UseCrowdPulseOptions = {
  scope: CrowdPulseCityScope | null;
  /** Defaults to the `crowdPulse` feature flag, which is off. */
  enabled?: boolean;
  /** Off by default. Set only on a surface that is actually rendering the pulse. */
  pollIntervalMs?: number;
  config?: Partial<CrowdPulseConfig>;
};

export type UseCrowdPulseResult = {
  buckets: CrowdPulseBucket[];
  summary: CrowdPulseSummary;
  loading: boolean;
  /** Set only when the venue read fails outright. A failed signal source degrades the read instead. */
  error: string | null;
  updatedAt: string | null;
  refresh: (forceRefresh?: boolean) => Promise<void>;
};

type SupabaseClientLike = ReturnType<typeof createSupabaseBrowser>;

type VenueRow = {
  id?: string | null;
  latitude?: unknown;
  longitude?: unknown;
};

type CheckinRow = {
  venue_id?: string | null;
  profile_id?: string | null;
  checked_in_at?: string | null;
  created_at?: string | null;
};

type StoryRow = {
  venue_id?: string | null;
  author_id?: string | null;
  created_at?: string | null;
};

type EventRow = {
  id?: string | null;
  venue_id?: string | null;
  start_time?: string | null;
};

type EventRsvpRow = {
  event_id?: string | null;
  user_id?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type CrowdPulseRead = {
  venues: CrowdPulseVenueInput[];
  signals: CrowdPulseSignalInput[];
  fetchedAtMs: number;
  /** Present only when the venue read itself failed. */
  error: string | null;
};

type CacheEntry = {
  value: CrowdPulseRead;
  expiresAt: number;
};

const readCache = new Map<string, CacheEntry>();
const inflightByKey = new Map<string, Promise<CrowdPulseRead>>();

function scopeKey(scope: CrowdPulseCityScope): string {
  return `${scope.city.trim().toLowerCase()}|${(scope.state || "").trim().toLowerCase()}`;
}

function emptyRead(fetchedAtMs: number, error: string | null = null): CrowdPulseRead {
  return { venues: [], signals: [], fetchedAtMs, error };
}

/**
 * One city-scoped read of every venue-anchored signal Crowd Pulse consumes.
 *
 * Shaped after `partyScoreEngine.calculatePartyScores`: `Promise.allSettled`
 * across the sources so a single unreadable table costs that signal and nothing
 * else, an in-flight map so concurrent callers share one round trip, and a TTL
 * cache because a city-wide read is heavier than a per-venue one.
 */
async function loadCrowdPulseRead(
  scope: CrowdPulseCityScope,
  options: { supabase: SupabaseClientLike; forceRefresh?: boolean }
): Promise<CrowdPulseRead> {
  const key = scopeKey(scope);
  const cached = options.forceRefresh ? null : readCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const existing = inflightByKey.get(key);
  if (existing) {
    return existing;
  }

  const supabase = options.supabase;
  const computation = (async (): Promise<CrowdPulseRead> => {
    const fetchedAtMs = Date.now();
    const nowIso = new Date(fetchedAtMs).toISOString();

    let venueQuery = supabase.from("venues").select("id, latitude, longitude").eq("city", scope.city);
    if (scope.state) {
      venueQuery = venueQuery.eq("state", scope.state);
    }

    const { data: venueData, error: venueError } = await venueQuery;
    if (venueError) {
      logSupabaseQueryError({
        scope: "useCrowdPulse.loadCrowdPulseRead",
        table: "venues",
        queryName: "loadCityVenues",
        query: "select id, latitude, longitude by city (and state)",
        error: venueError,
      });
      return emptyRead(fetchedAtMs, venueError.message || "Unable to read venues for Crowd Pulse.");
    }

    const venueRows = (venueData || []) as VenueRow[];
    const venueIds = venueRows
      .map((row) => row.id)
      .filter((value): value is string => typeof value === "string" && value.length > 0);

    if (venueIds.length === 0) {
      return emptyRead(fetchedAtMs);
    }

    const [checkinsSettled, storiesSettled, eventsSettled, litSettled] = await Promise.allSettled([
      supabase
        .from("venue_checkins")
        .select("venue_id, profile_id, checked_in_at, created_at")
        .in("venue_id", venueIds)
        .gt("expires_at", nowIso),
      supabase
        .from("stories")
        .select("venue_id, author_id, created_at")
        .in("venue_id", venueIds)
        .is("deleted_at", null)
        .gt("expires_at", nowIso),
      supabase
        .from("events")
        .select("id, venue_id, start_time")
        .in("venue_id", venueIds)
        .in("status", ACTIVE_EVENT_STATUSES)
        .lte("start_time", nowIso)
        .or(`end_time.is.null,end_time.gt.${nowIso}`),
      // Reuses `litEngine`'s own 20s cache and its `venue_lit_activity` read, so
      // Crowd Pulse costs nothing extra on a page that already renders Lit. The
      // view is absent until db/020 ships, which that call reports as
      // `available: false` and this one reads as "no lit heat", never an error.
      fetchVenueLitStates(venueIds, { supabase }),
    ]);

    if (checkinsSettled.status === "rejected") {
      logSupabaseQueryError({
        scope: "useCrowdPulse.loadCrowdPulseRead",
        table: "venue_checkins",
        queryName: "loadCheckIns",
        query: "select venue_id, profile_id, checked_in_at, created_at by venue ids where expires_at > now",
        error: normalizeUnknownError(checkinsSettled.reason, "Failed to fetch venue_checkins for Crowd Pulse."),
      });
    }
    if (storiesSettled.status === "rejected") {
      logSupabaseQueryError({
        scope: "useCrowdPulse.loadCrowdPulseRead",
        table: "stories",
        queryName: "loadStories",
        query: "select venue_id, author_id, created_at by venue ids where deleted_at is null and expires_at > now",
        error: normalizeUnknownError(storiesSettled.reason, "Failed to fetch stories for Crowd Pulse."),
      });
    }
    if (eventsSettled.status === "rejected") {
      logSupabaseQueryError({
        scope: "useCrowdPulse.loadCrowdPulseRead",
        table: "events",
        queryName: "loadActiveEvents",
        query: "select id, venue_id, start_time by venue ids where status is live and the event is running",
        error: normalizeUnknownError(eventsSettled.reason, "Failed to fetch events for Crowd Pulse."),
      });
    }

    const checkinRows = (checkinsSettled.status === "fulfilled" ? checkinsSettled.value.data || [] : []) as CheckinRow[];
    const storyRows = (storiesSettled.status === "fulfilled" ? storiesSettled.value.data || [] : []) as StoryRow[];
    const eventRows = (eventsSettled.status === "fulfilled" ? eventsSettled.value.data || [] : []) as EventRow[];
    const litStates = litSettled.status === "fulfilled" ? litSettled.value.statesByVenueId : {};

    const signals: CrowdPulseSignalInput[] = [];

    for (const row of checkinRows) {
      if (!row.venue_id) {
        continue;
      }
      signals.push({
        venueId: row.venue_id,
        kind: "checkin",
        occurredAt: row.checked_in_at || row.created_at,
        contributorToken: row.profile_id ? anonymizeContributor(row.profile_id) : null,
      });
    }

    for (const row of storyRows) {
      if (!row.venue_id) {
        continue;
      }
      signals.push({
        venueId: row.venue_id,
        kind: "story",
        occurredAt: row.created_at,
        contributorToken: row.author_id ? anonymizeContributor(row.author_id) : null,
      });
    }

    const venueIdByEventId = new Map<string, string>();
    for (const row of eventRows) {
      if (!row.venue_id || !row.id) {
        continue;
      }
      venueIdByEventId.set(row.id, row.venue_id);
      // An event has an organiser, not a crowd, so it carries no contributor
      // token: it adds heat but can never help a cell clear the privacy floor.
      signals.push({ venueId: row.venue_id, kind: "event", occurredAt: row.start_time, contributorToken: null });
    }

    if (venueIdByEventId.size > 0) {
      const { data: rsvpData, error: rsvpError } = await supabase
        .from("event_rsvps")
        .select("event_id, user_id, status, created_at")
        .in("event_id", Array.from(venueIdByEventId.keys()));

      if (rsvpError) {
        logSupabaseQueryError({
          scope: "useCrowdPulse.loadCrowdPulseRead",
          table: "event_rsvps",
          queryName: "loadRsvps",
          query: "select event_id, user_id, status, created_at by event ids",
          error: rsvpError,
        });
      }

      for (const row of (rsvpData || []) as EventRsvpRow[]) {
        const venueId = row.event_id ? venueIdByEventId.get(row.event_id) : undefined;
        const status = (row.status || "").toLowerCase();
        if (!venueId || (status !== "going" && status !== "interested")) {
          continue;
        }
        signals.push({
          venueId,
          kind: status === "going" ? "rsvpGoing" : "rsvpInterested",
          occurredAt: row.created_at,
          contributorToken: row.user_id ? anonymizeContributor(row.user_id) : null,
        });
      }
    }

    const venues: CrowdPulseVenueInput[] = venueRows
      .filter((row): row is VenueRow & { id: string } => typeof row.id === "string" && row.id.length > 0)
      .map((row) => ({
        venueId: row.id,
        latitude: row.latitude,
        longitude: row.longitude,
        litDecayWeight: litStates[row.id]?.decayWeight ?? 0,
        litCount: litStates[row.id]?.litCount ?? 0,
      }));

    return { venues, signals, fetchedAtMs, error: null };
  })();

  inflightByKey.set(key, computation);

  try {
    const result = await computation;
    if (!result.error) {
      readCache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return result;
  } finally {
    inflightByKey.delete(key);
  }
}

export function useCrowdPulse(options: UseCrowdPulseOptions): UseCrowdPulseResult {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const flagEnabled = isFeatureEnabled("crowdPulse");
  const enabled = (options.enabled ?? flagEnabled) === true;
  const pollIntervalMs = options.pollIntervalMs ?? 0;

  // Callers rebuild the scope object every render; keying the memo on its
  // contents is what stops the fetch from restarting on each one.
  const city = options.scope?.city?.trim() || "";
  const state = options.scope?.state?.trim() || "";
  const configKey = JSON.stringify(options.config || {});
  const config = useMemo(() => JSON.parse(configKey) as Partial<CrowdPulseConfig>, [configKey]);

  const [read, setRead] = useState<CrowdPulseRead | null>(null);
  const [loading, setLoading] = useState(enabled && city.length > 0);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(
    async (forceRefresh = false) => {
      if (!enabled || city.length === 0) {
        setLoading(false);
        return;
      }

      try {
        const next = await loadCrowdPulseRead({ city, state: state || null }, { supabase, forceRefresh });
        if (!mountedRef.current) {
          return;
        }
        setRead(next);
        setError(next.error);
      } catch (cause) {
        const normalized = normalizeUnknownError(cause, "Unable to read Crowd Pulse right now.");
        if (mountedRef.current) {
          setError(normalized.message);
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [city, enabled, state, supabase]
  );

  useEffect(() => {
    const load = async () => {
      await refresh();
    };
    void load();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || pollIntervalMs <= 0 || TEMP_KILL_SWITCH.disableSetInterval) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refresh(true);
    }, pollIntervalMs);

    return () => window.clearInterval(intervalId);
  }, [enabled, pollIntervalMs, refresh]);

  const result = useMemo(() => {
    if (!read) {
      // Before the first read there is nothing to date, so the summary carries
      // the epoch and `updatedAt` below stays null rather than implying a read
      // that has not happened.
      return emptyCrowdPulse(new Date(0).toISOString());
    }
    return buildCrowdPulse({
      venues: read.venues,
      signals: read.signals,
      now: read.fetchedAtMs,
      config,
    });
  }, [config, read]);

  return {
    buckets: result.buckets,
    summary: result.summary,
    loading,
    error,
    updatedAt: read ? result.summary.updatedAt : null,
    refresh,
  };
}
