"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchLitViewerContext, fetchVenueLitStates, submitVenueLit } from "@/lib/litEngine";
import {
  cooldownRemainingMs,
  evaluateLitEligibility,
  formatCooldownLabel,
  litIneligibilityMessage,
  type LitVenueState,
} from "@/lib/litSignals";
import { createSupabaseBrowser } from "@/lib/supabaseClient";

type LitButtonProps = {
  venueId: string;
  onLit?: () => void;
  className?: string;
};

export default function LitButton({ venueId, onLit, className = "" }: LitButtonProps) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [litState, setLitState] = useState<LitVenueState | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [checkin, setCheckin] = useState<{ checkedInAt: string; expiresAt: string } | null>(null);
  const [quotaCount, setQuotaCount] = useState(0);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [, setClock] = useState(0);

  const refresh = useCallback(async () => {
    const [stateResult, viewer] = await Promise.all([
      fetchVenueLitStates([venueId], { supabase, forceRefresh: true }),
      fetchLitViewerContext([venueId], { supabase }),
    ]);

    setAvailable(stateResult.available);
    setLitState(stateResult.statesByVenueId[venueId] || null);
    setUserId(viewer.userId);
    setCheckin(viewer.checkinByVenueId[venueId] || null);
    setQuotaCount(viewer.litsInQuotaWindow);
  }, [supabase, venueId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = window.setInterval(() => setClock((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  if (!available || !litState) {
    return null;
  }

  const eligibility = evaluateLitEligibility({
    isAuthenticated: Boolean(userId),
    checkin,
    viewerExpiresAt: litState.viewerExpiresAt,
    litsInQuotaWindow: quotaCount,
  });
  const remaining = cooldownRemainingMs(litState.viewerExpiresAt);
  const label = litState.viewerHasLit && remaining > 0
    ? `Lit · ${formatCooldownLabel(remaining)}`
    : litState.litCount > 0
      ? `🔥 Lit ${litState.litCount}`
      : "🔥 Light It Up";

  const handleClick = async () => {
    if (!eligibility.canLit) {
      if (eligibility.reason === "unauthenticated") {
        window.location.href = "/login";
        return;
      }
      setMessage(eligibility.reason ? litIneligibilityMessage(eligibility.reason) : null);
      return;
    }

    setBusy(true);
    setMessage(null);
    const outcome = await submitVenueLit(venueId, { supabase });
    if (outcome.status === "ok") {
      navigator.vibrate?.(35);
      await refresh();
      onLit?.();
    } else if (outcome.status === "cooling-down") {
      setMessage("You already marked this venue lit. Try again when the timer ends.");
    } else if (outcome.status === "ineligible") {
      setMessage("Check in here first, then tap Lit while you are still at the venue.");
    } else if (outcome.status === "unauthenticated") {
      window.location.href = "/login";
    } else if (outcome.status === "error") {
      setMessage(outcome.message);
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={busy || (litState.viewerHasLit && remaining > 0)}
        aria-pressed={litState.viewerHasLit}
        title={!eligibility.canLit && eligibility.reason ? litIneligibilityMessage(eligibility.reason) : "Tell nearby users this venue is lit right now."}
        className={`rounded-full border px-4 py-2.5 text-sm font-bold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-65 ${
          litState.viewerHasLit
            ? "border-orange-200/60 bg-orange-500/30 text-orange-50 shadow-[0_0_28px_rgba(249,115,22,.35)]"
            : "border-orange-300/45 bg-orange-500/15 text-orange-100 hover:bg-orange-500/25"
        } ${className}`}
      >
        {busy ? "Lighting…" : label}
      </button>
      {message ? <p className="max-w-56 text-center text-[10px] leading-snug text-white/60">{message}</p> : null}
    </div>
  );
}
