"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_PARTY_SCORE, toSafePartyScore, type PartyScore } from "@/lib/partyScore";
import { getCrowdLevelColorClass, getCrowdLevelEmoji, type CrowdLevel } from "@/lib/venueCheckInUtils";

type AnimatedValueProps = {
  value: number;
  suffix?: string;
  className?: string;
};

type VenuePartyCardProps = {
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

  return <span className={`${className} ${active ? "text-orange-100 drop-shadow-[0_0_8px_rgba(251,146,60,0.6)]" : ""}`}>{displayValue.toLocaleString()}{suffix}</span>;
}

function TrendBadge({ label, value }: { label: string; value: number }) {
  const positive = value >= 0;
  return (
    <div className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${positive ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border-rose-400/30 bg-rose-500/10 text-rose-100"}`}>
      <span className={`transition-transform duration-300 ${positive ? "translate-y-[-1px]" : "translate-y-[1px]"}`}>{positive ? "▲" : "▼"}</span>
      <span>{label}</span>
      <AnimatedValue value={Math.abs(value)} className="font-semibold" />
    </div>
  );
}

export default function VenuePartyCard({
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
}: VenuePartyCardProps) {
  const safePartyScore = toSafePartyScore(partyScore ?? DEFAULT_PARTY_SCORE);
  const trend = safePartyScore.trend ?? "stable";
  const momentum = safePartyScore.momentum ?? 0;
  const score = safePartyScore.score ?? 0;
  const confidence = safePartyScore.confidence ?? 0;
  const crowdLevel = (safePartyScore.crowdLevel ?? "Quiet") as CrowdLevel;
  const trendValue = trend === "up" ? Math.abs(momentum) : trend === "down" ? -Math.abs(momentum) : 0;
  const updatedDate = safePartyScore.updatedAt ? new Date(safePartyScore.updatedAt) : null;
  const updatedLabel = updatedDate && !Number.isNaN(updatedDate.getTime())
    ? updatedDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "--";

  return (
    <article className="group overflow-hidden rounded-[28px] border border-white/10 bg-white/6 shadow-[0_20px_60px_rgba(0,0,0,0.26)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-violet-300/35 hover:shadow-[0_28px_70px_rgba(76,29,149,0.28)]">
      <div className="relative h-44 overflow-hidden bg-[#13091f]">
        {imageUrl ? (
          <img src={imageUrl} alt={venueName} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.34),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.22),transparent_30%),linear-gradient(135deg,#14081f_0%,#28103f_50%,#12061d_100%)] text-sm uppercase tracking-[0.28em] text-violet-100/85">
            PartySafari
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#08040f] via-[#08040f]/35 to-transparent" />
        <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-3">
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getCrowdLevelColorClass(crowdLevel)}`}>
            {getCrowdLevelEmoji(crowdLevel)} {crowdLevel}
          </span>
          {openNow ? (
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-100">Open Now</span>
          ) : null}
        </div>
        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-violet-200/75">{venueType || "Venue"}</p>
            <h3 className="mt-1 text-2xl font-semibold text-white">{venueName}</h3>
            <p className="mt-1 text-xs text-white/70">{[city, state].filter(Boolean).join(", ") || "Location TBA"}</p>
          </div>
          <div className="rounded-2xl border border-orange-300/25 bg-black/40 px-4 py-2 text-right backdrop-blur-md">
            <p className="text-[10px] uppercase tracking-[0.22em] text-orange-100/80">Party Score</p>
            <p className="mt-1 text-2xl font-semibold text-white"><AnimatedValue value={score} /></p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          <TrendBadge label={trend === "stable" ? "Trend Stable" : "Trend"} value={trendValue} />
          <TrendBadge label="Momentum" value={momentum} />
          <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-white/75">{distanceLabel}</span>
          <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-white/75">Confidence {Math.round(confidence * 100)}%</span>
          <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-white/75">Party Score: {score}</span>
          <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-white/75">Trend: {trend === "up" ? "Up" : trend === "down" ? "Down" : "Stable"}</span>
          <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-white/75">Momentum: {momentum}</span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/55">Stories</p>
            <p className="mt-1 font-semibold text-white"><AnimatedValue value={storyCount} /></p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/55">Friends</p>
            <p className="mt-1 font-semibold text-white"><AnimatedValue value={friendsHereCount} /></p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/55">Check-ins</p>
            <p className="mt-1 font-semibold text-white"><AnimatedValue value={liveCheckins} /></p>
          </div>
        </div>

        <div className="grid gap-3 rounded-[22px] border border-white/8 bg-black/20 p-3 text-sm text-white/78">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">Current Event</p>
            <p className="mt-1 font-medium text-white">{currentEvent || "No event announced yet"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">Entertainment</p>
            <p className="mt-1 font-medium text-white">{currentEntertainment || "Open format tonight"}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-white/70">Friends currently here: <span className="font-semibold text-white">{friendsHereCount}</span></p>
          <Link href={venueHref} className="inline-flex items-center rounded-full border border-violet-300/35 bg-violet-500/15 px-4 py-2 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/25">
            {onJoinLabel}
          </Link>
        </div>
        <p className="text-xs text-white/45">Updated {updatedLabel}</p>
      </div>
    </article>
  );
}