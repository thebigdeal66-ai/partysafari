import { memo } from "react";
import type { CrowdPulseSnapshot } from "@/lib/discoverCrowdPulse";
import CrowdPulseConfidence from "@/components/crowd-pulse/CrowdPulseConfidence";
import CrowdPulseMeter from "@/components/crowd-pulse/CrowdPulseMeter";
import CrowdPulseTrend from "@/components/crowd-pulse/CrowdPulseTrend";

type CrowdPulseSummaryProps = {
  pulse: CrowdPulseSnapshot;
  compact?: boolean;
};

function CrowdPulseSummaryBase({ pulse, compact = false }: CrowdPulseSummaryProps) {
  const hasLiveSignal = pulse.source === "live" && pulse.activity.total > 0;

  return (
    <div className={`rounded-2xl border border-white/15 bg-black/25 p-3.5 ${compact ? "space-y-2.5" : "space-y-3"}`}>
      <CrowdPulseMeter score={pulse.pulseScore} />

      <div className="flex flex-wrap items-center gap-2">
        <CrowdPulseTrend trendDirection={pulse.trendDirection} momentum={pulse.momentum} />
        <CrowdPulseConfidence confidenceScore={pulse.confidenceScore} />
        <span className="inline-flex items-center rounded-full border border-cyan-300/30 bg-cyan-400/12 px-3 py-1.5 text-xs font-semibold text-cyan-100">
          Energy {pulse.energyLabel}
        </span>
      </div>

      {hasLiveSignal ? (
        <p className="text-xs text-white/68">Based on live check-ins, stories, events, and venue activity.</p>
      ) : (
        <div className="space-y-1 text-xs text-white/68">
          <p>Building tonight&apos;s pulse...</p>
          <p>We&apos;re collecting live check-ins, stories, events, and venue activity.</p>
        </div>
      )}

      {!compact && (
        <p className="text-xs text-white/72">
          Party Score <span className="font-semibold text-white">{Math.round(pulse.partyScore)}</span>
        </p>
      )}
    </div>
  );
}

const CrowdPulseSummary = memo(CrowdPulseSummaryBase);

export default CrowdPulseSummary;
