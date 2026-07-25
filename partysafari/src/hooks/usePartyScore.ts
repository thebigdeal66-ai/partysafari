"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calculatePartyScore, calculatePartyScores, getCachedPartyScore } from "@/lib/partyScoreEngine";
import { emptyPartyScore, type PartyScoreDetails } from "@/lib/partyScore";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import { normalizeUnknownError } from "@/lib/supabaseDiagnostics";

type UsePartyScoresOptions = {
  venueIds: string[];
  visibleVenueIds?: string[];
  enabled?: boolean;
  subscribeVisibleOnly?: boolean;
};

type UsePartyScoresResult = {
  scoresByVenueId: Record<string, PartyScoreDetails>;
  loading: boolean;
  error: string | null;
  refresh: (venueIds?: string[], forceRefresh?: boolean) => Promise<void>;
};

type UsePartyScoreResult = {
  partyScore: PartyScoreDetails;
  loading: boolean;
  error: string | null;
  refresh: (forceRefresh?: boolean) => Promise<void>;
};

function uniqueIds(values: string[]) {
  return Array.from(new Set(values.filter((value) => typeof value === "string" && value.length > 0)));
}

export function usePartyScores(options: UsePartyScoresOptions): UsePartyScoresResult {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [scoresByVenueId, setScoresByVenueId] = useState<Record<string, PartyScoreDetails>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshTimersRef = useRef<Map<string, number>>(new Map());

  const venueIds = useMemo(() => uniqueIds(options.venueIds || []), [options.venueIds]);
  const visibleVenueIds = useMemo(() => uniqueIds(options.visibleVenueIds || []), [options.visibleVenueIds]);

  const refresh = useCallback(
    async (venueIdsInput?: string[], forceRefresh = false) => {
      const targetVenueIds = uniqueIds(venueIdsInput || venueIds);
      if (targetVenueIds.length === 0) {
        setLoading(false);
        return;
      }

      setError(null);
      try {
        const nextScores = await calculatePartyScores(targetVenueIds, {
          supabase,
          forceRefresh,
        });
        setScoresByVenueId((current) => ({
          ...current,
          ...nextScores,
        }));
      } catch (cause) {
        const normalized = normalizeUnknownError(cause, "Unable to calculate Party Score right now.");
        if (process.env.NODE_ENV === "development") {
          console.error("[Supabase][DiscoverTonight] party score batch calculation failed", {
            venueIds: targetVenueIds,
            error: normalized.message,
          });
        }
        setError(normalized.message || "Unable to calculate Party Score right now.");
      } finally {
        setLoading(false);
      }
    },
    [supabase, venueIds]
  );

  useEffect(() => {
    setScoresByVenueId((current) => {
      const next = { ...current };
      for (const venueId of venueIds) {
        next[venueId] = getCachedPartyScore(venueId) || next[venueId] || emptyPartyScore(venueId);
      }
      return next;
    });
  }, [venueIds]);

  useEffect(() => {
    if (options.enabled === false || venueIds.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    void refresh();
  }, [options.enabled, refresh, venueIds.length]);

  useEffect(() => {
    if (options.enabled === false) {
      return;
    }

    const shouldSubscribeVisibleOnly = options.subscribeVisibleOnly !== false;
    const targetVenueIds = shouldSubscribeVisibleOnly ? (visibleVenueIds.length > 0 ? visibleVenueIds : venueIds) : venueIds;
    if (targetVenueIds.length === 0) {
      return;
    }

    const scheduleRefresh = (venueId: string) => {
      if (refreshTimersRef.current.has(venueId)) {
        return;
      }

      const timer = window.setTimeout(() => {
        refreshTimersRef.current.delete(venueId);
        void refresh([venueId], true);
      }, 150);
      refreshTimersRef.current.set(venueId, timer);
    };

    const channels = targetVenueIds.map((venueId) => {
      const channel = supabase.channel(`party-score:${venueId}`);
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "venue_checkins", filter: `venue_id=eq.${venueId}` },
        () => scheduleRefresh(venueId)
      );
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stories", filter: `venue_id=eq.${venueId}` },
        () => scheduleRefresh(venueId)
      );
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `venue_id=eq.${venueId}` },
        () => scheduleRefresh(venueId)
      );
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_rsvps" },
        () => scheduleRefresh(venueId)
      );
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "story_reactions" },
        () => scheduleRefresh(venueId)
      );
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        () => scheduleRefresh(venueId)
      );
      void channel.subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (process.env.NODE_ENV === "development") {
            console.warn("[DiscoverTonight] party score subscription status", { venueId, status });
          }
          window.setTimeout(() => {
            void refresh([venueId], true);
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
  }, [options.enabled, options.subscribeVisibleOnly, refresh, supabase, venueIds, visibleVenueIds]);

  useEffect(() => {
    if (options.enabled === false || venueIds.length === 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refresh();
    }, 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [options.enabled, refresh, venueIds.length]);

  return {
    scoresByVenueId,
    loading,
    error,
    refresh,
  };
}

export function usePartyScore(venueId: string | null, enabled = true): UsePartyScoreResult {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [partyScore, setPartyScore] = useState<PartyScoreDetails>(() => emptyPartyScore(venueId || ""));
  const [loading, setLoading] = useState(Boolean(enabled && venueId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (forceRefresh = false) => {
      if (!venueId || !enabled) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const next = await calculatePartyScore(venueId, {
          supabase,
          forceRefresh,
        });
        setPartyScore(next);
      } catch (cause) {
        const normalized = normalizeUnknownError(cause, "Unable to calculate Party Score right now.");
        if (process.env.NODE_ENV === "development") {
          console.error("[Supabase][DiscoverTonight] party score calculation failed", {
            venueId,
            error: normalized.message,
          });
        }
        setError(normalized.message || "Unable to calculate Party Score right now.");
      } finally {
        setLoading(false);
      }
    },
    [enabled, supabase, venueId]
  );

  useEffect(() => {
    if (!venueId || !enabled) {
      setPartyScore(emptyPartyScore(venueId || ""));
      setLoading(false);
      return;
    }

    setPartyScore(getCachedPartyScore(venueId) || emptyPartyScore(venueId));
    void refresh();
  }, [enabled, refresh, venueId]);

  useEffect(() => {
    if (!venueId || !enabled) {
      return;
    }

    const channel = supabase.channel(`party-score-single:${venueId}`);
    const forceRefresh = () => {
      void refresh(true);
    };

    channel.on("postgres_changes", { event: "*", schema: "public", table: "venue_checkins", filter: `venue_id=eq.${venueId}` }, forceRefresh);
    channel.on("postgres_changes", { event: "*", schema: "public", table: "stories", filter: `venue_id=eq.${venueId}` }, forceRefresh);
    channel.on("postgres_changes", { event: "*", schema: "public", table: "events", filter: `venue_id=eq.${venueId}` }, forceRefresh);
    channel.on("postgres_changes", { event: "*", schema: "public", table: "event_rsvps" }, forceRefresh);
    channel.on("postgres_changes", { event: "*", schema: "public", table: "story_reactions" }, forceRefresh);
    channel.on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, forceRefresh);
    void channel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        if (process.env.NODE_ENV === "development") {
          console.warn("[DiscoverTonight] single party score subscription status", { venueId, status });
        }
        window.setTimeout(() => {
          void refresh(true);
        }, 300);
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, refresh, supabase, venueId]);

  return {
    partyScore,
    loading,
    error,
    refresh,
  };
}