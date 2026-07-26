"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calculatePartyScore, calculatePartyScores, getCachedPartyScore } from "@/lib/partyScoreEngine";
import { emptyPartyScore, type PartyScoreDetails } from "@/lib/partyScore";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import { normalizeUnknownError } from "@/lib/supabaseDiagnostics";
import { TEMP_KILL_SWITCH } from "@/lib/runtimeKillSwitch";

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

export function usePartyScores(options: UsePartyScoresOptions): UsePartyScoresResult {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [scoresByVenueId, setScoresByVenueId] = useState<Record<string, PartyScoreDetails>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshTimersRef = useRef<Map<string, number>>(new Map());
  const effectCountsRef = useRef<Record<string, number>>({});

  const traceEffect = useCallback((name: string, line: number, deps: string[]) => {
    const count = (effectCountsRef.current[name] || 0) + 1;
    effectCountsRef.current[name] = count;
    const sinceInteractionMs = typeof window !== "undefined"
      ? Date.now() - (window.__RADAR_LAST_USER_INTERACTION__ || 0)
      : Number.NaN;
    radarTrace("usePartyScores", `effect:${name}`, { line, count, deps, sinceInteractionMs });
    if (count > 10 && Number.isFinite(sinceInteractionMs) && sinceInteractionMs > 1500) {
      radarTrace("usePartyScores", "probable-infinite-effect-loop", { line, effect: name, deps, count });
    }
  }, []);

  const traceSetState = useCallback((state: string, line: number, updateKind: "value" | "updater") => {
    radarTrace("usePartyScores", "setState", { state, line, updateKind });
  }, []);

  const venueIds = useMemo(() => {
    radarTrace("usePartyScores", "memo:venueIds", { line: 70, inputCount: options.venueIds?.length || 0 });
    return uniqueIds(options.venueIds || []);
  }, [options.venueIds]);
  const visibleVenueIds = useMemo(() => {
    radarTrace("usePartyScores", "memo:visibleVenueIds", { line: 74, inputCount: options.visibleVenueIds?.length || 0 });
    return uniqueIds(options.visibleVenueIds || []);
  }, [options.visibleVenueIds]);

  const refresh = useCallback(
    async (venueIdsInput?: string[], forceRefresh = false) => {
      if (TEMP_KILL_SWITCH.disablePartyScorePolling) {
        setLoading(false);
        return;
      }

      radarTrace("usePartyScores", "callback:refresh:start", {
        line: 79,
        forceRefresh,
        requestedCount: venueIdsInput?.length || venueIds.length,
      });
      const targetVenueIds = uniqueIds(venueIdsInput || venueIds);
      if (targetVenueIds.length === 0) {
        traceSetState("loading", 87, "value");
        setLoading(false);
        return;
      }

      traceSetState("error", 92, "value");
      setError(null);
      try {
        const nextScores = await calculatePartyScores(targetVenueIds, {
          supabase,
          forceRefresh,
        });
        traceSetState("scoresByVenueId", 99, "updater");
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
        traceSetState("error", 113, "value");
        setError(normalized.message || "Unable to calculate Party Score right now.");
      } finally {
        traceSetState("loading", 116, "value");
        setLoading(false);
      }
    },
    [supabase, traceSetState, venueIds]
  );

  useEffect(() => {
    traceEffect("seed-cached-scores", 123, ["venueIds"]);
    traceSetState("scoresByVenueId", 124, "updater");
    setScoresByVenueId((current) => {
      const next = { ...current };
      for (const venueId of venueIds) {
        next[venueId] = getCachedPartyScore(venueId) || next[venueId] || emptyPartyScore(venueId);
      }
      return next;
    });
    return () => {
      radarTrace("usePartyScores", "cleanup:seed-cached-scores", { line: 132 });
    };
  }, [traceEffect, traceSetState, venueIds]);

  useEffect(() => {
    if (TEMP_KILL_SWITCH.disablePartyScorePolling) {
      setLoading(false);
      return;
    }

    traceEffect("initial-refresh", 136, ["options.enabled", "refresh", "venueIds.length"]);
    if (options.enabled === false || venueIds.length === 0) {
      traceSetState("loading", 138, "value");
      setLoading(false);
      return;
    }

    traceSetState("loading", 143, "value");
    setLoading(true);
    void refresh();
    return () => {
      radarTrace("usePartyScores", "cleanup:initial-refresh", { line: 146 });
    };
  }, [options.enabled, refresh, traceEffect, traceSetState, venueIds.length]);

  useEffect(() => {
    if (TEMP_KILL_SWITCH.disablePartyScorePolling || TEMP_KILL_SWITCH.disableSupabaseRealtime || TEMP_KILL_SWITCH.disablePresenceTracking) {
      return;
    }

    traceEffect("subscriptions", 150, ["options.enabled", "options.subscribeVisibleOnly", "refresh", "supabase", "venueIds", "visibleVenueIds"]);
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
      radarTrace("usePartyScores", "subscription:create", { line: 171, channel: `party-score:${venueId}`, venueId });
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
        radarTrace("usePartyScores", "subscription:status", { line: 201, channel: `party-score:${venueId}`, venueId, status });
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
      radarTrace("usePartyScores", "cleanup:subscriptions", { line: 218, count: channels.length });
      for (const timer of refreshTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      refreshTimersRef.current.clear();

      for (const channel of channels) {
        void supabase.removeChannel(channel);
      }
    };
  }, [options.enabled, options.subscribeVisibleOnly, refresh, supabase, traceEffect, venueIds, visibleVenueIds]);

  useEffect(() => {
    if (TEMP_KILL_SWITCH.disablePartyScorePolling || TEMP_KILL_SWITCH.disableSetInterval) {
      return;
    }

    traceEffect("polling-refresh", 232, ["options.enabled", "refresh", "venueIds.length"]);
    if (options.enabled === false || venueIds.length === 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refresh();
    }, 60000);

    return () => {
      window.clearInterval(intervalId);
      radarTrace("usePartyScores", "cleanup:polling-refresh", { line: 241 });
    };
  }, [options.enabled, refresh, traceEffect, venueIds.length]);

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
      if (TEMP_KILL_SWITCH.disablePartyScorePolling) {
        setLoading(false);
        return;
      }

      radarTrace("usePartyScore", "callback:refresh:start", { line: 257, venueId, enabled, forceRefresh });
      if (!venueId || !enabled) {
        radarTrace("usePartyScore", "setState", { line: 259, state: "loading", updateKind: "value" });
        setLoading(false);
        return;
      }

      radarTrace("usePartyScore", "setState", { line: 264, state: "loading", updateKind: "value" });
      setLoading(true);
      radarTrace("usePartyScore", "setState", { line: 265, state: "error", updateKind: "value" });
      setError(null);
      try {
        const next = await calculatePartyScore(venueId, {
          supabase,
          forceRefresh,
        });
        radarTrace("usePartyScore", "setState", { line: 272, state: "partyScore", updateKind: "value" });
        setPartyScore(next);
      } catch (cause) {
        const normalized = normalizeUnknownError(cause, "Unable to calculate Party Score right now.");
        if (process.env.NODE_ENV === "development") {
          console.error("[Supabase][DiscoverTonight] party score calculation failed", {
            venueId,
            error: normalized.message,
          });
        }
        radarTrace("usePartyScore", "setState", { line: 281, state: "error", updateKind: "value" });
        setError(normalized.message || "Unable to calculate Party Score right now.");
      } finally {
        radarTrace("usePartyScore", "setState", { line: 284, state: "loading", updateKind: "value" });
        setLoading(false);
      }
    },
    [enabled, supabase, venueId]
  );

  useEffect(() => {
    radarTrace("usePartyScore", "effect:seed-and-refresh", { line: 291, deps: ["enabled", "refresh", "venueId"], venueId, enabled });
    if (!venueId || !enabled) {
      radarTrace("usePartyScore", "setState", { line: 293, state: "partyScore", updateKind: "value" });
      setPartyScore(emptyPartyScore(venueId || ""));
      radarTrace("usePartyScore", "setState", { line: 294, state: "loading", updateKind: "value" });
      setLoading(false);
      return;
    }

    radarTrace("usePartyScore", "setState", { line: 299, state: "partyScore", updateKind: "value" });
    setPartyScore(getCachedPartyScore(venueId) || emptyPartyScore(venueId));
    void refresh();
    return () => {
      radarTrace("usePartyScore", "cleanup:seed-and-refresh", { line: 302, venueId });
    };
  }, [enabled, refresh, venueId]);

  useEffect(() => {
    if (TEMP_KILL_SWITCH.disablePartyScorePolling || TEMP_KILL_SWITCH.disableSupabaseRealtime || TEMP_KILL_SWITCH.disablePresenceTracking) {
      return;
    }

    radarTrace("usePartyScore", "effect:subscription", { line: 306, deps: ["enabled", "refresh", "supabase", "venueId"], venueId, enabled });
    if (!venueId || !enabled) {
      return;
    }

    const channel = supabase.channel(`party-score-single:${venueId}`);
    radarTrace("usePartyScore", "subscription:create", { line: 312, channel: `party-score-single:${venueId}` });
    const forceRefresh = () => {
      radarTrace("usePartyScore", "subscription:event", { line: 314, channel: `party-score-single:${venueId}` });
      void refresh(true);
    };

    channel.on("postgres_changes", { event: "*", schema: "public", table: "venue_checkins", filter: `venue_id=eq.${venueId}` }, forceRefresh);
    channel.on("postgres_changes", { event: "*", schema: "public", table: "stories", filter: `venue_id=eq.${venueId}` }, forceRefresh);
    channel.on("postgres_changes", { event: "*", schema: "public", table: "events", filter: `venue_id=eq.${venueId}` }, forceRefresh);
    channel.on("postgres_changes", { event: "*", schema: "public", table: "event_rsvps" }, forceRefresh);
    channel.on("postgres_changes", { event: "*", schema: "public", table: "story_reactions" }, forceRefresh);
    channel.on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, forceRefresh);
    void channel.subscribe((status: string) => {
      radarTrace("usePartyScore", "subscription:status", { line: 325, channel: `party-score-single:${venueId}`, status });
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
      radarTrace("usePartyScore", "cleanup:subscription", { line: 339, channel: `party-score-single:${venueId}` });
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