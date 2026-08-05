"use client";

import { memo } from "react";
import type { PartyScoreTrend } from "@/lib/partyScore";
import { getTrendArrow } from "@/lib/crowdPulsePresentation";

type CrowdPulseTrendProps = {
  trendDirection: PartyScoreTrend;
  trendLabel?: "Rising Fast" | "Building" | "Stable" | "Cooling" | "Emptying";
  momentum?: number;
};

function resolveTrendLabel(trendDirection: PartyScoreTrend, momentum: number) {
  if (trendDirection === "up") {
    return momentum >= 8 ? "Rising Fast" : "Building";
  }
  if (trendDirection === "down") {
    return momentum <= -8 ? "Emptying" : "Cooling";
  }
  return "Stable";
}

function resolveTone(trendDirection: PartyScoreTrend) {
  if (trendDirection === "up") {
    return "text-emerald-100 border-emerald-300/35 bg-emerald-500/12";
  }
  if (trendDirection === "down") {
    return "text-rose-100 border-rose-300/35 bg-rose-500/12";
  }
  return "text-white/85 border-white/20 bg-white/8";
}

function CrowdPulseTrendBase({ trendDirection, trendLabel, momentum = 0 }: CrowdPulseTrendProps) {
  const label = trendLabel || resolveTrendLabel(trendDirection, momentum);
  const glyph = getTrendArrow(label);
  const tone = resolveTone(trendDirection);

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${tone}`}>
      <span className={`trend-glyph trend-${trendDirection === "stable" ? "stable" : trendDirection}`} aria-hidden="true">{glyph}</span>
      {label}
      <style jsx>{`
        .trend-glyph {
          display: inline-block;
          will-change: transform;
        }

        .trend-up {
          animation: trend-up 1.7s ease-in-out infinite;
        }

        .trend-down {
          animation: trend-down 1.9s ease-in-out infinite;
        }

        .trend-stable {
          animation: none;
        }

        @media (prefers-reduced-motion: reduce) {
          .trend-up,
          .trend-down {
            animation: none;
          }
        }

        @keyframes trend-up {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-1.5px);
          }
        }

        @keyframes trend-down {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(1.5px);
          }
        }
      `}</style>
    </span>
  );
}

const CrowdPulseTrend = memo(CrowdPulseTrendBase);

export default CrowdPulseTrend;
