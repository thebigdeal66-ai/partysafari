import { memo } from "react";

type CrowdPulseConfidenceProps = {
  confidenceScore: number;
  mode?: "chip" | "detail";
};

function resolveBand(confidenceScore: number) {
  if (confidenceScore >= 74) {
    return {
      label: "High Confidence",
      className: "text-emerald-100 border-emerald-300/35 bg-emerald-500/12",
    };
  }
  if (confidenceScore >= 45) {
    return {
      label: "Medium Confidence",
      className: "text-amber-100 border-amber-300/35 bg-amber-500/12",
    };
  }
  return {
    label: "Low Confidence",
    className: "text-white/85 border-white/20 bg-white/8",
  };
}

function CrowdPulseConfidenceBase({ confidenceScore, mode = "chip" }: CrowdPulseConfidenceProps) {
  const band = resolveBand(confidenceScore);

  if (mode === "detail") {
    return (
      <div className="space-y-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/58">Confidence</p>
            <p className="mt-1 text-lg font-semibold text-white">{confidenceScore}%</p>
          </div>
          <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${band.className}`}>
            {band.label}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-white/45 via-white/70 to-white"
            style={{ width: `${Math.max(8, confidenceScore)}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${band.className}`}>
      {band.label}
    </span>
  );
}

const CrowdPulseConfidence = memo(CrowdPulseConfidenceBase);

export default CrowdPulseConfidence;
