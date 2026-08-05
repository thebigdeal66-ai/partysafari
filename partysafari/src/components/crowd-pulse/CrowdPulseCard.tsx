"use client";

import Link from "next/link";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import type { CrowdPulseSnapshot } from "@/lib/discoverCrowdPulse";
import { getCrowdPulseToneClasses } from "@/lib/crowdPulsePresentation";
import CrowdPulseConfidence from "@/components/crowd-pulse/CrowdPulseConfidence";
import CrowdPulseMeter from "@/components/crowd-pulse/CrowdPulseMeter";
import CrowdPulseTrend from "@/components/crowd-pulse/CrowdPulseTrend";

type LiveSignal = {
  key: string;
  icon: string;
  label: string;
  value: number | null | undefined;
};

type CrowdPulseCardProps = {
  venueHref: string;
  venueName: string;
  venueCategory: string | null;
  statusLabel: string;
  distanceLabel: string;
  pulse: CrowdPulseSnapshot;
  friendsHereCount: number;
  currentVibe: string | null;
  peakPredictionLabel?: string | null;
  imageUrl?: string | null;
  currentEvent?: string | null;
  currentEntertainment?: string | null;
  liveSignals?: LiveSignal[];
  updatedLabel?: string | null;
  onJoinLabel?: string;
  footerAction?: ReactNode;
  insight?: ReactNode;
  supplementalContent?: ReactNode;
  compact?: boolean;
};

type AnimatedCountProps = {
  value: number;
};

function AnimatedCount({ value }: AnimatedCountProps) {
  const [display, setDisplay] = useState(value);
  const [reducedMotion, setReducedMotion] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => {
      media.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    if (display === value) {
      return;
    }

    if (reducedMotion) {
      return;
    }

    const start = performance.now();
    const from = display;
    const delta = value - from;
    const duration = 340;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + delta * eased));

      if (progress < 1) {
        rafRef.current = window.requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    rafRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [display, reducedMotion, value]);

  return <span className="tabular-nums">{reducedMotion ? value : display}</span>;
}

function CrowdPulseCardBase({
  venueHref,
  venueName,
  venueCategory,
  statusLabel,
  distanceLabel,
  pulse,
  friendsHereCount,
  currentVibe,
  peakPredictionLabel = null,
  imageUrl = null,
  currentEvent = null,
  currentEntertainment = null,
  liveSignals = [],
  updatedLabel = null,
  onJoinLabel = "View Venue",
  footerAction = null,
  insight = null,
  supplementalContent = null,
  compact = false,
}: CrowdPulseCardProps) {
  const tone = getCrowdPulseToneClasses(pulse.pulseScore);
  const visibleSignals = liveSignals.filter((signal) => typeof signal.value === "number" && signal.value > 0);
  const statusTone = statusLabel === "Closed"
    ? "border-white/15 bg-white/8 text-white/75"
    : statusLabel === "Closing Soon"
      ? "border-amber-300/35 bg-amber-500/12 text-amber-100"
      : "border-emerald-300/35 bg-emerald-500/12 text-emerald-100";

  return (
    <article className={`group flex h-full flex-col overflow-hidden rounded-[28px] border bg-[linear-gradient(180deg,rgba(8,10,18,0.98),rgba(8,9,18,0.94))] backdrop-blur-xl transition duration-300 ${tone.borderClass} ${tone.glowClass}`}>
      {!compact ? (
        <div className="relative h-36 overflow-hidden border-b border-white/8 bg-[#0c1020] sm:h-40">
          {imageUrl ? (
            <img src={imageUrl} alt={venueName} className="h-full w-full object-cover opacity-90 transition duration-500 group-hover:scale-[1.03]" />
          ) : (
            <div className={`h-full w-full bg-gradient-to-br ${tone.meterClass} opacity-25`} />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,5,10,0.18),rgba(3,5,10,0.82))]" />
          <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/62">{venueCategory || "Venue"}</p>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight text-white">{venueName}</h3>
            </div>
            <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${statusTone}`}>{statusLabel}</span>
          </div>
          <div className="absolute inset-x-4 bottom-4 flex items-center justify-between gap-3 text-xs text-white/72">
            <span>{distanceLabel}</span>
            <span>{pulse.stateLabel}</span>
          </div>
        </div>
      ) : null}

      <div className={`flex flex-1 flex-col ${compact ? "gap-3 p-4" : "gap-4 p-4 sm:p-5"}`}>
        {compact ? (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/62">{venueCategory || "Venue"}</p>
              <h3 className="truncate text-xl font-semibold tracking-tight text-white">{venueName}</h3>
              <p className="mt-1 text-xs text-white/62">{distanceLabel}</p>
            </div>
            <span className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${statusTone}`}>{statusLabel}</span>
          </div>
        ) : null}

        <CrowdPulseMeter score={pulse.pulseScore} compact={compact} />

        <div className="flex flex-wrap items-center gap-2">
          <CrowdPulseTrend trendDirection={pulse.trendDirection} trendLabel={pulse.trendLabel} momentum={pulse.momentum} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/58">Energy</p>
            <p className="mt-1 text-lg font-semibold text-white">{pulse.energyLabel}</p>
          </div>
          <CrowdPulseConfidence confidenceScore={pulse.confidenceScore} mode="detail" />
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/58">Live Signals</p>
          {visibleSignals.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {visibleSignals.map((signal) => (
                <div key={signal.key} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-[11px] text-white/60">{signal.icon} {signal.label}</p>
                  <p className="mt-1 text-lg font-semibold text-white"><AnimatedCount value={signal.value || 0} /></p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.03] p-3 text-sm text-white/62">
              Waiting for activity
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/58">Friends</p>
            <p className="mt-1 text-base font-semibold text-white">{friendsHereCount > 0 ? `${friendsHereCount} Friends Here` : "No friends here yet"}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/58">Current Vibe</p>
            <p className="mt-1 text-base font-semibold text-white">{currentVibe || "Learning tonight's vibe"}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/58">Peak Tonight</p>
            <p className="mt-1 text-base font-semibold text-white">{peakPredictionLabel || "Predicting..."}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/58">Party Score</p>
            <p className="mt-1 text-base font-semibold text-white"><AnimatedCount value={Math.round(pulse.partyScore)} /></p>
          </div>
        </div>

        {currentEvent || currentEntertainment ? (
          <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/58">Current Event</p>
              <p className="mt-1 text-sm font-medium text-white">{currentEvent || "Waiting on tonight's lineup"}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/58">Current Vibe Source</p>
              <p className="mt-1 text-sm font-medium text-white">{currentEntertainment || "Venue activity"}</p>
            </div>
          </div>
        ) : null}

        {pulse.source === "demo" && pulse.activity.total === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.03] p-3 text-sm text-white/68">
            <p className="font-semibold text-white">Building tonight&apos;s pulse</p>
            <p className="mt-1">The first check-ins, stories, events, and activity will bring this venue to life.</p>
          </div>
        ) : null}

        {insight ? <div>{insight}</div> : null}

        {supplementalContent ? <div>{supplementalContent}</div> : null}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-xs text-white/48">{updatedLabel || "Live signals updating"}</p>
          <div className="flex flex-wrap items-center gap-3">
            {footerAction}
            <Link
              href={venueHref}
              className={`inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold transition ${tone.chipClass}`}
            >
              {onJoinLabel}
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

const CrowdPulseCard = memo(CrowdPulseCardBase);

export default CrowdPulseCard;
