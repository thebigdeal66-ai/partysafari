"use client";

import { memo, useEffect, useRef, useState } from "react";
import { getCrowdPulseToneClasses } from "@/lib/crowdPulsePresentation";

type CrowdPulseMeterProps = {
  score: number;
  label?: string;
  compact?: boolean;
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

function CrowdPulseMeterBase({ score, label = "Crowd Pulse", compact = false }: CrowdPulseMeterProps) {
  const target = Math.round(clampPercent(score));
  const [display, setDisplay] = useState(target);
  const [reducedMotion, setReducedMotion] = useState(false);
  const rafRef = useRef<number | null>(null);
  const tone = getCrowdPulseToneClasses(target);

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
    if (display === target) {
      return;
    }

    if (reducedMotion) {
      return;
    }

    const start = performance.now();
    const startValue = display;
    const delta = target - startValue;
    const duration = 420;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(startValue + delta * eased));

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
  }, [display, reducedMotion, target]);

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/58">{label}</p>
          <p className={`mt-1 font-semibold tracking-tight text-white ${compact ? "text-xl" : "text-3xl"}`}>{reducedMotion ? target : display}%</p>
        </div>
      </div>
      <div className={`relative overflow-hidden rounded-full bg-white/12 ${compact ? "h-3" : "h-4"}`}>
        <div
          className={`crowd-pulse-meter-fill h-full rounded-full bg-gradient-to-r ${tone.meterClass}`}
          style={{ width: `${Math.max(6, reducedMotion ? target : display)}%` }}
        />
      </div>
      <style jsx>{`
        .crowd-pulse-meter-fill {
          background-size: 220% 100%;
          box-shadow: 0 0 18px rgba(255, 255, 255, 0.12), 0 0 28px rgba(251, 146, 60, 0.24);
          transition: width 420ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 320ms ease;
          animation: meter-shift 7s linear infinite;
          will-change: width, background-position;
        }

        @media (prefers-reduced-motion: reduce) {
          .crowd-pulse-meter-fill {
            animation: none;
            transition: none;
          }
        }

        @keyframes meter-shift {
          0% {
            background-position: 0% 50%;
          }
          100% {
            background-position: 100% 50%;
          }
        }
      `}</style>
    </div>
  );
}

const CrowdPulseMeter = memo(CrowdPulseMeterBase);

export default CrowdPulseMeter;
