"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import { fetchVenueLitStates, invalidateLitCache, submitVenueLit, type LitSubmitOutcome } from "@/lib/litEngine";
import { cooldownRemainingMs, emptyLitVenueState, LIT_COOLDOWN_MINUTES, type LitVenueState } from "@/lib/litSignals";
import { TEMP_KILL_SWITCH } from "@/lib/runtimeKillSwitch";

/**
 * Lit state for a set of venues, plus the write.
 *
 * A new hook rather than an addition to `usePartyScore`: the existing hooks'
 * contracts are frozen this sprint, and lit needs a faster refresh cadence than
 * the score (the button has to un-cool while the user is looking at it).
 *
 * No realtime subscription. `venue_lit_signals` does not exist in the target
 * project, and subscribing to an absent table produces a CHANNEL_ERROR retry
 * loop; the write path refreshes on success and a 30s poll covers other people's
 * endorsements.
 */

const POLL_INTERVAL_MS = 30_000;
const COOLDOWN_TICK_MS = 1_000;

type UseVenueLitOptions = {
  venueIds: string[];
  enabled?: boolean;
};

type UseVenueLitResult = {
  litByVenueId: Record<string, LitVenueState>;
  /** False when db/020 is not deployed. The UI hides the button rather than offering a write that cannot succeed. */
  available: boolean;
  /** Milliseconds of cooldown left per venue, re-derived every second so labels count down. */
  cooldownMsByVenueId: Record<string, number>;
  /** Venue ids with an in-flight or optimistically-applied endorsement. */
  pendingVenueIds: Set<string>;
  submitLit: (venueId: string) => Promise<LitSubmitOutcome>;
  refresh: (forceRefresh?: boolean) => Promise<void>;
};

function uniqueIds(values: string[]) {
  return Array.from(new Set(values.filter((value) => typeof value === "string" && value.length > 0)));
}

/**
 * Refusals, in the user's terms. "ineligible" covers every conjunct of the
 * insert policy other than the cooldown, because RLS cannot report which one
 * failed — the copy names check-in because that is the path a user can act on.
 */
export function litOutcomeMessage(outcome: LitSubmitOutcome): string | null {
  switch (outcome.status) {
    case "ok":
      return null;
    case "unauthenticated":
      return "Sign in to mark a venue lit.";
    case "cooling-down":
      return "You already marked this one. Try again after it expires.";
    case "ineligible":
      return "Check in at this venue first — or you have hit tonight's limit.";
    case "unavailable":
      return null;
    case "error":
      return outcome.message;
  }
}

export function useVenueLit(options: UseVenueLitOptions): UseVenueLitResult {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const enabled = options.enabled !== false;
  // Keyed off the contents rather than the array identity: callers rebuild the
  // id array every render, and an identity-based memo would restart the poll
  // and the fetch on every one of those renders.
  const venueKey = uniqueIds(options.venueIds || []).sort().join(",");
  const venueIds = useMemo(() => (venueKey ? venueKey.split(",") : []), [venueKey]);

  const [litByVenueId, setLitByVenueId] = useState<Record<string, LitVenueState>>({});
  const [available, setAvailable] = useState(true);
  const [pendingVenueIds, setPendingVenueIds] = useState<Set<string>>(() => new Set());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(
    async (forceRefresh = false) => {
      if (!enabled || venueIds.length === 0) {
        return;
      }

      const result = await fetchVenueLitStates(venueIds, { supabase, forceRefresh });
      if (!mountedRef.current) {
        return;
      }
      setAvailable(result.available);
      setNowMs(Date.now());
      setLitByVenueId((current) => ({ ...current, ...result.statesByVenueId }));
    },
    [enabled, supabase, venueIds]
  );

  useEffect(() => {
    const load = async () => {
      await refresh();
    };
    void load();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || TEMP_KILL_SWITCH.disableSetInterval || venueIds.length === 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refresh(true);
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [enabled, refresh, venueIds.length]);

  // Cooldown labels are derived from `viewerExpiresAt`, which does not change
  // between polls — without a tick the button would sit at "60m" for a minute.
  const hasCooldown = venueIds.some((venueId) => Boolean(litByVenueId[venueId]?.viewerExpiresAt));
  useEffect(() => {
    if (!hasCooldown || TEMP_KILL_SWITCH.disableSetInterval) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, COOLDOWN_TICK_MS);

    return () => window.clearInterval(intervalId);
  }, [hasCooldown]);

  const cooldownMsByVenueId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const venueId of venueIds) {
      map[venueId] = cooldownRemainingMs(litByVenueId[venueId]?.viewerExpiresAt ?? null, nowMs);
    }
    return map;
  }, [litByVenueId, nowMs, venueIds]);

  const submitLit = useCallback(
    async (venueId: string): Promise<LitSubmitOutcome> => {
      setPendingVenueIds((current) => new Set(current).add(venueId));

      // Optimistic, per MASTERPLAN's "visual acknowledgement in under 150ms". The
      // real state replaces this on the refresh below, including when the insert
      // was refused — nothing here is treated as proof the write landed.
      const optimisticExpiry = new Date(Date.now() + LIT_COOLDOWN_MINUTES * 60_000).toISOString();
      setLitByVenueId((current) => {
        const existing = current[venueId] || emptyLitVenueState(venueId);
        if (existing.viewerHasLit) {
          return current;
        }
        return {
          ...current,
          [venueId]: {
            ...existing,
            litCount: existing.litCount + 1,
            recentLitCount: existing.recentLitCount + 1,
            decayWeight: Math.round((existing.decayWeight + 1) * 1000) / 1000,
            viewerHasLit: true,
            viewerExpiresAt: optimisticExpiry,
          },
        };
      });

      const outcome = await submitVenueLit(venueId, { supabase });

      invalidateLitCache(venueId);
      await refresh(true);

      if (mountedRef.current) {
        setPendingVenueIds((current) => {
          const next = new Set(current);
          next.delete(venueId);
          return next;
        });
      }

      return outcome;
    },
    [refresh, supabase]
  );

  return {
    litByVenueId,
    available,
    cooldownMsByVenueId,
    pendingVenueIds,
    submitLit,
    refresh,
  };
}
