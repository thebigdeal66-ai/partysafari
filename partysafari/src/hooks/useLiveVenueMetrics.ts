"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { createSupabaseBrowser, resolveCurrentUserId } from "@/lib/supabaseClient";
import { logSupabaseQueryError, normalizeUnknownError } from "@/lib/supabaseDiagnostics";
import { getCrowdLevel } from "@/lib/venueCheckInUtils";
import { TEMP_KILL_SWITCH } from "@/lib/runtimeKillSwitch";

export type VenueLiveMetrics = {
  venueId: string;
  crowdLevel: string;
  liveCheckins: number;
  activeStories: number;
  currentEvents: number;
  friendsHere: number;
  trendingScore: number;
  lastUpdated: string;
};

type UseLiveVenueMetricsOptions = {
  venueIds: string[];
  visibleVenueIds?: string[];
  enabled?: boolean;
  subscribeVisibleOnly?: boolean;
};

type UseLiveVenueMetricsResult = {
  metricsByVenueId: Record<string, VenueLiveMetrics>;
  loading: boolean;
  error: string | null;
  refresh: (venueIds?: string[]) => Promise<void>;
};

type CheckInRow = {
  venue_id?: string | null;
  profile_id?: string | null;
};

type StoryRow = {
  venue_id?: string | null;
};

type EventRow = {
  venue_id?: string | null;
  status?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

type FriendshipRow = {
  user_id?: string | null;
  friend_id?: string | null;
};

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.filter((id) => typeof id === "string" && id.length > 0)));
}

function emptyMetrics(venueId: string): VenueLiveMetrics {
  return {
    venueId,
    crowdLevel: getCrowdLevel(0),
    liveCheckins: 0,
    activeStories: 0,
    currentEvents: 0,
    friendsHere: 0,
    trendingScore: 0,
    lastUpdated: new Date().toISOString(),
  };
}

function isEventCurrent(event: EventRow, nowIso: string) {
  const status = (event.status || "").toLowerCase();
  const statusAllowed = ["published", "active", "live", "scheduled"].includes(status);
  if (!statusAllowed) {
    return false;
  }

  const nowMs = Date.parse(nowIso);
  const startMs = event.start_time ? Date.parse(event.start_time) : Number.NaN;
  const endMs = event.end_time ? Date.parse(event.end_time) : Number.NaN;

  const started = Number.isFinite(startMs) ? startMs <= nowMs : true;
  const notEnded = Number.isFinite(endMs) ? endMs > nowMs : true;

  return started && notEnded;
}

declare global {
  interface Window {
    __RADAR_TRACE__?: Array<Record<string, unknown>>;
    __RADAR_LAST_USER_INTERACTION__?: number;
  }
}

function radarTrace(source: string, event: string, detail: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  const payload = {
    ts: new Date().toISOString(),
    source,
    event,
    ...detail,
  };

  console.log(`[RadarTrace][${source}] ${event}`, payload);

  if (typeof window !== "undefined") {
    const bucket = window.__RADAR_TRACE__ || [];
    bucket.push(payload);
    window.__RADAR_TRACE__ = bucket;
  }
}

export function useLiveVenueMetrics(options: UseLiveVenueMetricsOptions): UseLiveVenueMetricsResult {
  const isDev = process.env.NODE_ENV === "development";
  const effectRunCountsRef = useRef<Record<string, number>>({});

  const logEffectRun = useCallback((effectName: string, line: number, dependencies: string[]) => {
    if (!isDev) {
      return;
    }

    const count = (effectRunCountsRef.current[effectName] || 0) + 1;
    effectRunCountsRef.current[effectName] = count;
    const lastInteraction = typeof window !== "undefined" ? (window.__RADAR_LAST_USER_INTERACTION__ || 0) : 0;

    radarTrace("useLiveVenueMetrics", `effect:${effectName}`, {
      line,
      count,
      dependencies,
      sinceInteractionMs: Date.now() - lastInteraction,
      venueCount: options.venueIds?.length || 0,
      visibleVenueCount: options.visibleVenueIds?.length || 0,
    });

    if (count > 10 && Date.now() - lastInteraction > 1500) {
      radarTrace("useLiveVenueMetrics", "probable-infinite-effect-loop", {
        line,
        effectName,
        count,
        dependencies,
      });
    }
  }, [isDev, options.venueIds, options.visibleVenueIds]);

  const traceSetState = useCallback(<T,>(stateName: string, line: number, nextValue: SetStateAction<T>) => {
    if (!isDev) {
      return;
    }
    radarTrace("useLiveVenueMetrics", "setState", {
      line,
      state: stateName,
      updateKind: typeof nextValue === "function" ? "updater" : "value",
    });
  }, [isDev]);

  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [metricsByVenueId, setMetricsByVenueId] = useState<Record<string, VenueLiveMetrics>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const friendIdsRef = useRef<Set<string>>(new Set());
  const refreshTimersRef = useRef<Map<string, number>>(new Map());
  const globalRefreshTimerRef = useRef<number | null>(null);
  const isRefreshingRef = useRef(false);
  const queuedRefreshRef = useRef(false);
  const queuedVenueIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    friendIdsRef.current = friendIds;
  }, [friendIds]);

  const allVenueIds = useMemo(() => {
    radarTrace("useLiveVenueMetrics", "memo:allVenueIds", {
      line: 148,
      inputVenueCount: options.venueIds?.length || 0,
    });
    return uniqueIds(options.venueIds || []);
  }, [options.venueIds]);
  const visibleVenueIds = useMemo(() => {
    radarTrace("useLiveVenueMetrics", "memo:visibleVenueIds", {
      line: 155,
      inputVenueCount: options.visibleVenueIds?.length || 0,
    });
    return uniqueIds(options.visibleVenueIds || []);
  }, [options.visibleVenueIds]);

  const refresh = useCallback(
    async (venueIdsInput?: string[]) => {
      if (TEMP_KILL_SWITCH.disableLiveFeedPolling) {
        setLoading(false);
        return;
      }

      radarTrace("useLiveVenueMetrics", "callback:refresh:start", {
        line: 163,
        requestedVenueCount: venueIdsInput?.length || allVenueIds.length,
      });
      const requestedVenueIds = uniqueIds(venueIdsInput || allVenueIds);
      if (requestedVenueIds.length === 0) {
        traceSetState("loading", 169, false);
        setLoading(false);
        return;
      }

      if (isRefreshingRef.current) {
        radarTrace("useLiveVenueMetrics", "callback:refresh:queue", {
          line: 175,
          requestedVenueCount: requestedVenueIds.length,
        });
        queuedRefreshRef.current = true;
        for (const venueId of requestedVenueIds) {
          queuedVenueIdsRef.current.add(venueId);
        }
        return;
      }

      isRefreshingRef.current = true;
      const venueIds = requestedVenueIds;

      try {
      traceSetState("error", 188, null);
      setError(null);
      const nowIso = new Date().toISOString();

      const [checkinsSettled, storiesSettled, eventsSettled] = await Promise.allSettled([
        supabase.from("venue_checkins").select("venue_id, profile_id").in("venue_id", venueIds).gt("expires_at", nowIso),
        supabase.from("stories").select("venue_id").in("venue_id", venueIds).is("deleted_at", null).gt("expires_at", nowIso),
        supabase.from("events").select("venue_id, status, start_time, end_time").in("venue_id", venueIds),
      ]);

      const checkinsResult = checkinsSettled.status === "fulfilled"
        ? checkinsSettled.value
        : { data: [] as CheckInRow[], error: normalizeUnknownError(checkinsSettled.reason, "Failed to fetch venue_checkins.") };
      const storiesResult = storiesSettled.status === "fulfilled"
        ? storiesSettled.value
        : { data: [] as StoryRow[], error: normalizeUnknownError(storiesSettled.reason, "Failed to fetch stories.") };
      const eventsResult = eventsSettled.status === "fulfilled"
        ? eventsSettled.value
        : { data: [] as EventRow[], error: normalizeUnknownError(eventsSettled.reason, "Failed to fetch events.") };

      if (checkinsResult.error) {
        logSupabaseQueryError({
          scope: "useLiveVenueMetrics.refresh",
          table: "venue_checkins",
          queryName: "loadCheckIns",
          query: "select venue_id, profile_id by venue ids where expires_at > now",
          error: checkinsResult.error,
        });
      }
      if (storiesResult.error) {
        logSupabaseQueryError({
          scope: "useLiveVenueMetrics.refresh",
          table: "stories",
          queryName: "loadStories",
          query: "select venue_id by venue ids where deleted_at is null and expires_at > now",
          error: storiesResult.error,
        });
      }
      if (eventsResult.error) {
        logSupabaseQueryError({
          scope: "useLiveVenueMetrics.refresh",
          table: "events",
          queryName: "loadEvents",
          query: "select venue_id, status, start_time, end_time by venue ids",
          error: eventsResult.error,
        });
      }

      traceSetState("error", 230, checkinsResult.error?.message || storiesResult.error?.message || eventsResult.error?.message || null);
      setError(
        checkinsResult.error?.message || storiesResult.error?.message || eventsResult.error?.message || null
      );

      const checkInRows = checkinsResult.data || [];
      const storyRows = storiesResult.data || [];
      const eventRows = eventsResult.data || [];

      const checkinsByVenue = new Map<string, number>();
      const friendSetsByVenue = new Map<string, Set<string>>();
      for (const row of (checkInRows || []) as CheckInRow[]) {
        const venueId = row.venue_id || null;
        if (!venueId) {
          continue;
        }

        checkinsByVenue.set(venueId, (checkinsByVenue.get(venueId) || 0) + 1);

        const profileId = row.profile_id || null;
        if (!profileId || !friendIdsRef.current.has(profileId)) {
          continue;
        }

        const set = friendSetsByVenue.get(venueId) || new Set<string>();
        set.add(profileId);
        friendSetsByVenue.set(venueId, set);
      }

      const storiesByVenue = new Map<string, number>();
      for (const row of (storyRows || []) as StoryRow[]) {
        const venueId = row.venue_id || null;
        if (!venueId) {
          continue;
        }
        storiesByVenue.set(venueId, (storiesByVenue.get(venueId) || 0) + 1);
      }

      const eventsByVenue = new Map<string, number>();
      for (const row of (eventRows || []) as EventRow[]) {
        const venueId = row.venue_id || null;
        if (!venueId || !isEventCurrent(row, nowIso)) {
          continue;
        }
        eventsByVenue.set(venueId, (eventsByVenue.get(venueId) || 0) + 1);
      }

      traceSetState("metricsByVenueId", 274, "updater");
      setMetricsByVenueId((current) => {
        const next = { ...current };
        for (const venueId of venueIds) {
          const liveCheckins = checkinsByVenue.get(venueId) || 0;
          const activeStories = storiesByVenue.get(venueId) || 0;
          const currentEvents = eventsByVenue.get(venueId) || 0;
          const friendsHere = friendSetsByVenue.get(venueId)?.size || 0;
          const trendingScore = liveCheckins * 3 + activeStories * 2 + currentEvents * 4 + friendsHere * 5;

          next[venueId] = {
            venueId,
            crowdLevel: getCrowdLevel(liveCheckins),
            liveCheckins,
            activeStories,
            currentEvents,
            friendsHere,
            trendingScore,
            lastUpdated: new Date().toISOString(),
          };
        }
        return next;
      });

      traceSetState("loading", 298, false);
      setLoading(false);
      } finally {
        isRefreshingRef.current = false;
        if (queuedRefreshRef.current) {
          queuedRefreshRef.current = false;
          const queuedVenueIds = Array.from(queuedVenueIdsRef.current);
          queuedVenueIdsRef.current.clear();
          radarTrace("useLiveVenueMetrics", "callback:refresh:dequeue", {
            line: 305,
            queuedVenueCount: queuedVenueIds.length,
          });
          void refresh(queuedVenueIds.length > 0 ? queuedVenueIds : undefined);
        }
      }
    },
    [allVenueIds, supabase]
  );

  useEffect(() => {
    if (TEMP_KILL_SWITCH.disableLiveFeedPolling) {
      setLoading(false);
      return;
    }

    logEffectRun("bootstrap", 313, ["options.enabled", "refresh", "supabase"]);
    if (options.enabled === false) {
      traceSetState("loading", 315, false);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      const userId = await resolveCurrentUserId();
      if (cancelled) {
        return;
      }

      setCurrentUserId(userId);
      traceSetState("currentUserId", 329, userId);

      if (!userId) {
        traceSetState("friendIds", 332, "new Set()" as unknown as Set<string>);
        setFriendIds(new Set());
        void refresh();
        return;
      }

      const { data: friendshipRows, error: friendshipError } = await supabase
        .from("friendships")
        .select("user_id, friend_id")
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

      if (friendshipError) {
        logSupabaseQueryError({
          scope: "useLiveVenueMetrics.bootstrap",
          table: "friendships",
          queryName: "loadFriendships",
          query: `select user_id, friend_id where user_id = ${userId} or friend_id = ${userId}`,
          error: friendshipError,
        });
      }

      if (cancelled) {
        return;
      }

      const nextFriendIds = new Set<string>();
      for (const row of (friendshipRows || []) as FriendshipRow[]) {
        if (row.user_id === userId && row.friend_id) {
          nextFriendIds.add(row.friend_id);
        }
        if (row.friend_id === userId && row.user_id) {
          nextFriendIds.add(row.user_id);
        }
      }
      traceSetState("friendIds", 364, nextFriendIds);
      setFriendIds(nextFriendIds);
    };

    void bootstrap();

    return () => {
      cancelled = true;
      radarTrace("useLiveVenueMetrics", "cleanup:bootstrap", { line: 372 });
    };
  }, [options.enabled, refresh, supabase]);

  useEffect(() => {
    if (TEMP_KILL_SWITCH.disableLiveFeedPolling) {
      setLoading(false);
      return;
    }

    logEffectRun("initial-refresh", 376, ["allVenueIds", "options.enabled", "refresh"]);
    if (options.enabled === false || allVenueIds.length === 0) {
      traceSetState("loading", 378, false);
      setLoading(false);
      return;
    }

    void refresh();
  }, [allVenueIds, options.enabled, refresh]);

  useEffect(() => {
    if (TEMP_KILL_SWITCH.disableLiveFeedPolling || TEMP_KILL_SWITCH.disableSupabaseRealtime || TEMP_KILL_SWITCH.disablePresenceTracking) {
      return;
    }

    logEffectRun("subscriptions", 386, ["allVenueIds", "currentUserId", "options.enabled", "options.subscribeVisibleOnly", "refresh", "supabase", "visibleVenueIds"]);
    if (options.enabled === false) {
      return;
    }

    const shouldSubscribeVisibleOnly = options.subscribeVisibleOnly !== false;
    const targetIds = shouldSubscribeVisibleOnly ? (visibleVenueIds.length > 0 ? visibleVenueIds : allVenueIds) : allVenueIds;

    if (targetIds.length === 0) {
      return;
    }

    const channels = targetIds.map((venueId) => {
      const channel = supabase.channel(`live-venue-metrics:${venueId}`);
      radarTrace("useLiveVenueMetrics", "subscription:create", {
        line: 398,
        channel: `live-venue-metrics:${venueId}`,
        venueId,
      });

      const triggerRefresh = () => {
        if (refreshTimersRef.current.has(venueId)) {
          return;
        }

        const timer = window.setTimeout(() => {
          refreshTimersRef.current.delete(venueId);
          void refresh([venueId]);
        }, 120);

        refreshTimersRef.current.set(venueId, timer);
      };

      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "venue_checkins", filter: `venue_id=eq.${venueId}` },
        triggerRefresh
      );
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stories", filter: `venue_id=eq.${venueId}` },
        triggerRefresh
      );
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `venue_id=eq.${venueId}` },
        triggerRefresh
      );

      void channel.subscribe((status: string) => {
        radarTrace("useLiveVenueMetrics", "subscription:status", {
          line: 430,
          channel: `live-venue-metrics:${venueId}`,
          venueId,
          status,
        });
        if (status === "SUBSCRIBED") {
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (process.env.NODE_ENV === "development") {
            console.warn("[DiscoverTonight] live venue metrics subscription status", { venueId, status });
          }
          window.setTimeout(() => {
            void refresh([venueId]);
          }, 300);
        }
      });
      return channel;
    });

    const scheduleGlobalRefresh = () => {
      if (!currentUserId) {
        return;
      }
      if (globalRefreshTimerRef.current !== null) {
        return;
      }

      globalRefreshTimerRef.current = window.setTimeout(() => {
        globalRefreshTimerRef.current = null;
        void refresh();
      }, 250);
    };

    const globalFriendshipChannel = supabase.channel("live-venue-metrics:friendships");
    radarTrace("useLiveVenueMetrics", "subscription:create", {
      line: 461,
      channel: "live-venue-metrics:friendships",
    });
    globalFriendshipChannel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "friendships" },
      scheduleGlobalRefresh
    );
    void globalFriendshipChannel.subscribe((status: string) => {
      radarTrace("useLiveVenueMetrics", "subscription:status", {
        line: 471,
        channel: "live-venue-metrics:friendships",
        status,
      });
      if (status === "SUBSCRIBED") {
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        if (process.env.NODE_ENV === "development") {
          console.warn("[DiscoverTonight] global live metrics subscription status", { status });
        }
        window.setTimeout(() => {
          void refresh();
        }, 300);
      }
    });

    return () => {
      radarTrace("useLiveVenueMetrics", "cleanup:subscriptions", {
        line: 485,
        venueSubscriptionCount: channels.length,
      });
      for (const timer of refreshTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      refreshTimersRef.current.clear();

      if (globalRefreshTimerRef.current !== null) {
        window.clearTimeout(globalRefreshTimerRef.current);
        globalRefreshTimerRef.current = null;
      }

      for (const channel of channels) {
        void supabase.removeChannel(channel);
      }
      void supabase.removeChannel(globalFriendshipChannel);
    };
  }, [allVenueIds, currentUserId, options.enabled, options.subscribeVisibleOnly, refresh, supabase, visibleVenueIds]);

  useEffect(() => {
    if (TEMP_KILL_SWITCH.disableLiveFeedPolling || TEMP_KILL_SWITCH.disableSetInterval) {
      return;
    }

    logEffectRun("polling-refresh", 507, ["allVenueIds", "options.enabled", "refresh"]);
    if (allVenueIds.length === 0 || options.enabled === false) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refresh();
    }, 45000);

    return () => {
      window.clearInterval(intervalId);
      radarTrace("useLiveVenueMetrics", "cleanup:polling-refresh", { line: 517 });
    };
  }, [allVenueIds, options.enabled, refresh]);

  useEffect(() => {
    logEffectRun("seed-empty-metrics", 521, ["allVenueIds"]);
    traceSetState("metricsByVenueId", 522, "updater");
    setMetricsByVenueId((current) => {
      const next = { ...current };
      for (const venueId of allVenueIds) {
        if (!next[venueId]) {
          next[venueId] = emptyMetrics(venueId);
        }
      }
      return next;
    });
    return () => {
      radarTrace("useLiveVenueMetrics", "cleanup:seed-empty-metrics", { line: 532 });
    };
  }, [allVenueIds]);

  return {
    metricsByVenueId,
    loading,
    error,
    refresh,
  };
}
