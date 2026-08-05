"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_PARTY_SCORE, type PartyScore } from "@/lib/partyScore";
import { describePartyScore, formatScoreUpdatedLabel } from "@/lib/partyScorePresentation";
import { getCrowdLevelColorClass, getCrowdLevelEmoji } from "@/lib/venueCheckInUtils";
import LitButton from "@/components/discover/LitButton";
import WhyThisVenue from "@/components/discover/WhyThisVenue";
import type { PsiExplanation } from "@/lib/psi";

type AnimatedValueProps = {
  value: number;
  suffix?: string;
  className?: string;
};

type VenuePartyCardProps = {
  /** Needed for the Lit write. Optional so the card still renders where lit is not wired. */
  venueId?: string;
  venueHref: string;
  venueName: string;
  venueType: string | null;
  imageUrl: string | null;
  city: string | null;
  state: string | null;
  partyScore?: Partial<PartyScore> | null;
  currentEvent: string | null;
  currentEntertainment: string | null;
  distanceLabel: string;
  friendsHereCount: number;
  storyCount: number;
  liveCheckins: number;
  openNow: boolean;
  onJoinLabel?: string;
  /** Active endorsements at this venue right now. */
  litCount?: number;
  /** Whether the signed-in user holds a live endorsement here. */
  litHasViewer?: boolean;
  /** Seconds until this user may endorse again. */
  litCooldownSeconds?: number;
  /** Momentum points the current endorsements are contributing. Decays; not part of the base score. */
  litBoost?: number;
  litPending?: boolean;
  /** False when db/020 is undeployed — the button is hidden rather than offered and refused. */
  litAvailable?: boolean;
  /** False when the viewer has no recent check-in here, is cooling down, or is over the nightly ceiling. */
  litEligible?: boolean;
  /** Why the button is locked, rendered beneath it so the lock is never silent. */
  litMessage?: string | null;
  onLit?: (venueId: string) => void | Promise<unknown>;
  /** PSI read on this venue. Omitted where PSI is not wired; the card renders without it. */
  psiExplanation?: PsiExplanation | null;
};

function AnimatedValue({ value, suffix = "", className = "" }: AnimatedValueProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [active, setActive] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (displayValue === value) {
      return;
    }

    setActive(true);
    const startValue = displayValue;
    const delta = value - startValue;
    const start = performance.now();
    const duration = 360;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(startValue + delta * eased));

      if (progress < 1) {
        rafRef.current = window.requestAnimationFrame(tick);
        return;
      }

      rafRef.current = null;
      window.setTimeout(() => setActive(false), 220);
    };

    rafRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [displayValue, value]);

  return (
    <span className={`tabular-nums ${className} ${active ? "text-orange-100 drop-shadow-[0_0_8px_rgba(251,146,60,0.6)]" : ""}`}>
      {displayValue.toLocaleString()}
      {suffix}
    </span>
  );
}

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "up" | "down" }) {
  const toneClass =
    tone === "up"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
      : tone === "down"
        ? "border-rose-400/30 bg-rose-500/10 text-rose-100"
        : "border-white/10 bg-black/25 text-white/75";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${toneClass}`}>
      {children}
    </span>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/25 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase leading-tight tracking-[0.12em] text-white/50">{label}</p>
      <p className="mt-1.5 text-base font-semibold text-white sm:text-lg">
        <AnimatedValue value={value} />
      </p>
    </div>
  );
}

export default function VenuePartyCard({
  venueId,
  venueHref,
  venueName,
  venueType,
  imageUrl,
  city,
  state,
  partyScore,
  currentEvent,
  currentEntertainment,
  distanceLabel,
  friendsHereCount,
  storyCount,
  liveCheckins,
  openNow,
  onJoinLabel = "Join Party",
  litCount = 0,
  litHasViewer = false,
  litCooldownSeconds = 0,
  litBoost = 0,
  litPending = false,
  litAvailable = false,
  litEligible = false,
  litMessage = null,
  onLit,
  psiExplanation = null,
}: VenuePartyCardProps) {
  const score = describePartyScore(partyScore ?? DEFAULT_PARTY_SCORE, {
    liveCheckins,
    storyCount,
    friendsHereCount,
    hasProgrammedEvent: Boolean(currentEvent || currentEntertainment),
  });
  const updatedLabel = formatScoreUpdatedLabel(score.updatedAt);
  // The crowd badge already names the level, so the body only repeats it as prose
  // once there is a real crowd to describe.
  const showHeadline = score.state !== "live";

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/6 shadow-[0_20px_60px_rgba(0,0,0,0.26)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-violet-300/35 hover:shadow-[0_28px_70px_rgba(76,29,149,0.28)]">
      <div className="relative h-40 overflow-hidden bg-[#13091f] sm:h-48">
        {imageUrl ? (
          <img src={imageUrl} alt={venueName} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.34),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.22),transparent_30%),linear-gradient(135deg,#14081f_0%,#28103f_50%,#12061d_100%)] text-xs uppercase tracking-[0.28em] text-violet-100/85">
            PartySafari
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#08040f] via-[#08040f]/45 to-transparent" />

        <div className="absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2 sm:inset-x-4 sm:top-4">
          <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${getCrowdLevelColorClass(score.crowdLevel)}`}>
            {getCrowdLevelEmoji(score.crowdLevel)} {score.crowdLevel}
          </span>
          {openNow ? (
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-100">
              Open Now
            </span>
          ) : null}
        </div>

        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-3 sm:inset-x-4 sm:bottom-4">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-violet-200/75">{venueType || "Venue"}</p>
            <h3 className="mt-1 truncate text-xl font-semibold tracking-tight text-white sm:text-2xl">{venueName}</h3>
            <p className="mt-1 truncate text-xs text-white/70">{[city, state].filter(Boolean).join(", ") || "Location TBA"}</p>
          </div>
          {score.showScore ? (
            <div className="shrink-0 rounded-2xl border border-orange-300/25 bg-black/45 px-3.5 py-2 text-right backdrop-blur-md">
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-orange-100/80">Party Score</p>
              <p className="mt-0.5 text-2xl font-semibold leading-none text-white">
                <AnimatedValue value={score.score} />
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/75">Crowd Pulse State</p>
          {showHeadline ? <p className="text-sm font-semibold text-white">{score.headline}</p> : null}
          <p className={`text-sm text-white/65 ${showHeadline ? "mt-1" : ""}`}>{score.detail}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {score.showMomentum ? (
            <Chip tone={score.trend === "up" ? "up" : "down"}>
              <span aria-hidden="true">{score.trend === "up" ? "▲" : "▼"}</span>
              {score.momentumLabel}
            </Chip>
          ) : null}
          <Chip>{distanceLabel}</Chip>
          {score.showConfidence ? <Chip>Early read · {score.confidencePercent}% confidence</Chip> : null}
          {/* Temporary and separate from the Party Score above: this is what the live
              endorsements are adding to momentum right now, and it decays away on its own. */}
          {litAvailable && litBoost > 0 ? (
            <Chip tone="up">
              <span aria-hidden="true">🔥</span>+<AnimatedValue value={litBoost} /> lit boost · fading
            </Chip>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Stories" value={storyCount} />
          <StatTile label="Friends" value={friendsHereCount} />
          <StatTile label="Check-ins" value={liveCheckins} />
        </div>

        {psiExplanation ? <WhyThisVenue explanation={psiExplanation} /> : null}

        <div className="grid gap-3 rounded-2xl border border-white/8 bg-black/25 p-3.5">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/45">Current Event</p>
            <p className="mt-1 text-sm font-medium text-white">{currentEvent || "No event announced yet"}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/45">Entertainment</p>
            <p className="mt-1 text-sm font-medium text-white">{currentEntertainment || "Open format tonight"}</p>
          </div>
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-xs text-white/45">{updatedLabel ? `Updated ${updatedLabel}` : "Waiting on first signal"}</p>
          {litAvailable && venueId ? (
            <LitButton
              venueId={venueId}
              litCount={litCount}
              hasLit={litHasViewer}
              cooldownSecondsRemaining={litCooldownSeconds}
              pending={litPending}
              disabled={!litEligible}
              message={litMessage}
              onLit={onLit}
            />
          ) : null}
          <Link
            href={venueHref}
            className="inline-flex min-h-11 items-center rounded-full border border-violet-300/35 bg-violet-500/15 px-5 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/25"
          >
            {onJoinLabel}
          </Link>
        </div>
      </div>
    </article>
  );
}
