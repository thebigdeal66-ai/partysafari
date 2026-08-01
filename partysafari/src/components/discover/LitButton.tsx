"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { formatCooldownLabel } from "@/lib/litSignals";

/**
 * Lit Button — one tap, no modal, optimistic acknowledgement, visible cooldown.
 *
 * The prop contract is the one the earlier scaffold published, extended only
 * with additive optional props, so the shape callers were told to expect still
 * type-checks.
 *
 * Nothing here is enforcement. `cooldownSecondsRemaining` and `hasLit` are the
 * database's answer rendered back to the user; the insert is refused by RLS and
 * an exclusion constraint regardless of what this component allows.
 */

export type LitButtonProps = {
  /** Venue being endorsed. */
  venueId: string;
  /** Endorsements inside the current window. */
  litCount?: number;
  /** Whether the signed-in user has already vouched in this window. */
  hasLit?: boolean;
  /** Seconds until this user may vouch again; 0 means ready. */
  cooldownSecondsRemaining?: number;
  /** Called on tap. May be async; the button shows a pending state until it settles. */
  onLit?: (venueId: string) => void | Promise<unknown>;
  /** Write in flight. */
  pending?: boolean;
  /** Refusal to show beside the button — cooldown, ineligibility, sign-in. */
  message?: string | null;
  /** Locked for a reason the cooldown countdown does not cover: no recent check-in, nightly ceiling, signed out. */
  disabled?: boolean;
  className?: string;
};

const FLARE_MS = 900;

export default function LitButton({
  venueId,
  litCount = 0,
  hasLit = false,
  cooldownSecondsRemaining = 0,
  onLit,
  pending = false,
  message = null,
  disabled = false,
  className = "",
}: LitButtonProps) {
  const [flare, setFlare] = useState(false);
  const flareTimerRef = useRef<number | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const messageId = useId();

  useEffect(() => {
    return () => {
      if (flareTimerRef.current !== null) {
        window.clearTimeout(flareTimerRef.current);
      }
    };
  }, []);

  const coolingDown = cooldownSecondsRemaining > 0;
  const blocked = disabled || pending || hasLit || coolingDown;

  const handleClick = () => {
    if (blocked || !onLit) {
      return;
    }

    // Fires before the write so the acknowledgement is immediate, per
    // MASTERPLAN's sub-150ms requirement. It is an acknowledgement of the tap,
    // not of the result.
    if (!reducedMotion) {
      setFlare(true);
      if (flareTimerRef.current !== null) {
        window.clearTimeout(flareTimerRef.current);
      }
      flareTimerRef.current = window.setTimeout(() => setFlare(false), FLARE_MS);
    }

    void onLit(venueId);
  };

  const label = hasLit ? "Lit" : coolingDown ? formatCooldownLabel(cooldownSecondsRemaining * 1000) : "Lit it";

  const tone = hasLit
    ? "border-orange-400/60 bg-orange-500/25 text-orange-100"
    : coolingDown || disabled
      ? "border-white/10 bg-white/5 text-white/40"
      : "border-orange-400/30 bg-white/5 text-orange-100 hover:border-orange-400/60 hover:bg-orange-500/15";

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={blocked}
        aria-pressed={hasLit}
        // The reason the button is locked sits in a sibling span. Pointing at it
        // keeps a disabled button from reading as an unexplained dead control.
        aria-describedby={message ? messageId : undefined}
        aria-label={
          hasLit
            ? `You marked this venue lit. ${litCount} active right now.`
            : coolingDown
              ? `Lit again in ${formatCooldownLabel(cooldownSecondsRemaining * 1000)}. ${litCount} active right now.`
              : `Mark this venue lit. ${litCount} active right now.`
        }
        className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-all duration-200 ${tone} ${
          blocked ? "cursor-not-allowed" : "cursor-pointer active:scale-95"
        } ${flare && !reducedMotion ? "scale-105 shadow-lg shadow-orange-500/40" : ""}`}
      >
        <span
          aria-hidden="true"
          className={`inline-block transition-transform duration-200 ${
            flare && !reducedMotion ? "motion-safe:animate-bounce" : ""
          } ${hasLit ? "scale-110" : ""}`}
        >
          🔥
        </span>
        <span>{pending ? "…" : label}</span>
        <span className="tabular-nums text-white/70">{litCount}</span>
      </button>
      {message ? (
        <span id={messageId} className="px-1 text-[11px] leading-tight text-white/50">
          {message}
        </span>
      ) : null}
    </div>
  );
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {};
  }
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false
  );
}
