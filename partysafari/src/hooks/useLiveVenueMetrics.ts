"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowser, resolveCurrentUserId } from "@/lib/supabaseClient";
import { logSupabaseQueryError, normalizeUnknownError } from "@/lib/supabaseDiagnostics";
import { getCrowdLevel } from "@/lib/venueCheckInUtils";

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

export function useLiveVenueMetrics(options: UseLiveVenueMetricsOptions): UseLiveVenueMetricsResult {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [metricsByVenueId, setMetricsByVenueId] = useState<Record<string, VenueLiveMetrics>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const refreshTimersRef = useRef<Map<string, number>>(new Map());
  const isRefreshingRef = useRef(false);
  const queuedRefreshRef = useRef(false);
  const queuedVenueIdsRef = useRef<Set<string>>(new Set());

  const allVenueIds = useMemo(() => uniqueIds(options.venueIds || []), [options.venueIds]);
  const visibleVenueIds = useMemo(() => uniqueIds(options.visibleVenueIds || []), [options.visibleVenueIds]);

  const refresh = useCallback(
    async (venueIdsInput?: string[]) => {
      const requestedVenueIds = uniqueIds(venueIdsInput || allVenueIds);
      if (requestedVenueIds.length === 0) {
        setLoading(false);
        return;
      }

      if (isRefreshingRef.current) {
        queuedRefreshRef.current = true;
        for (const venueId of requestedVenueIds) {
          queuedVenueIdsRef.current.add(venueId);
        }
        return;
      }

      isRefreshingRef.current = true;
      const venueIds = requestedVenueIds;

      try {
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
        if (!profileId || !friendIds.has(profileId)) {
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

      setLoading(false);
      } finally {
        isRefreshingRef.current = false;
        if (queuedRefreshRef.current) {
          queuedRefreshRef.current = false;
          const queuedVenueIds = Array.from(queuedVenueIdsRef.current);
          queuedVenueIdsRef.current.clear();
          void refresh(queuedVenueIds.length > 0 ? queuedVenueIds : undefined);
        }
      }
    },
    [allVenueIds, friendIds, supabase]
  );

  useEffect(() => {
    if (options.enabled === false) {
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

      if (!userId) {
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
      setFriendIds(nextFriendIds);
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [options.enabled, refresh, supabase]);

  useEffect(() => {
    if (options.enabled === false || allVenueIds.length === 0) {
      setLoading(false);
      return;
    }

    void refresh();
  }, [allVenueIds, options.enabled, refresh]);

  useEffect(() => {
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
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        () => {
          if (!currentUserId) {
            return;
          }
          void refresh([venueId]);
        }
      );

      void channel.subscribe((status: string) => {
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

    return () => {
      for (const timer of refreshTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      refreshTimersRef.current.clear();

      for (const channel of channels) {
        void supabase.removeChannel(channel);
      }
    };
  }, [allVenueIds, currentUserId, options.enabled, options.subscribeVisibleOnly, refresh, supabase, visibleVenueIds]);

  useEffect(() => {
    if (allVenueIds.length === 0 || options.enabled === false) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refresh();
    }, 45000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [allVenueIds, options.enabled, refresh]);

  useEffect(() => {
    setMetricsByVenueId((current) => {
      const next = { ...current };
      for (const venueId of allVenueIds) {
        if (!next[venueId]) {
          next[venueId] = emptyMetrics(venueId);
        }
      }
      return next;
    });
  }, [allVenueIds]);

  return {
    metricsByVenueId,
    loading,
    error,
    refresh,
  };
}
