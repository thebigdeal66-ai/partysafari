"use client";

import { useId, useState } from "react";
import {
  CALIBRATION_NOTE_MAX_LENGTH,
  type CalibrationFeature,
  type CalibrationSubmitOutcome,
} from "@/lib/calibrationFeedback";

export type FounderCalibrationTarget = {
  feature: CalibrationFeature;
  label: string;
};

export type FounderCalibrationJudgment = {
  accurate: boolean;
  note: string | null;
};

export type FounderCalibrationControlProps = {
  targets: readonly FounderCalibrationTarget[];
  onSubmit: (feature: CalibrationFeature, judgment: FounderCalibrationJudgment) => Promise<CalibrationSubmitOutcome>;
};

function outcomeMessage(outcome: CalibrationSubmitOutcome): string {
  switch (outcome.status) {
    case "ok":
      return "Recorded.";
    case "unauthenticated":
      return "Sign in to record calibration.";
    case "unavailable":
      return "Not recorded — db/021 is not deployed yet.";
    case "invalid":
      return outcome.message;
    case "error":
      return outcome.message;
  }
}

export default function FounderCalibrationControl({ targets, onSubmit }: FounderCalibrationControlProps) {
  const noteId = useId();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  if (targets.length === 0) {
    return null;
  }

  const submit = async (feature: CalibrationFeature, accurate: boolean) => {
    const key = `${feature}:${accurate}`;
    setPending(key);
    setStatus(null);
    try {
      const outcome = await onSubmit(feature, { accurate, note: note.trim() || null });
      setStatus(outcomeMessage(outcome));
      if (outcome.status === "ok") {
        setNote("");
      }
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="mt-2 rounded-xl border border-dashed border-amber-200/25 bg-amber-100/[0.03] p-2.5">
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-amber-200/60">
        Founder calibration · internal
      </p>
      <div className="mt-2 flex flex-col gap-2">
        {targets.map((target) => (
          <div key={target.feature} className="flex flex-wrap items-center gap-2">
            <span className="min-w-12 text-[11px] font-semibold text-white/60">{target.label}</span>
            {[true, false].map((accurate) => (
              <button
                key={String(accurate)}
                type="button"
                disabled={pending !== null}
                onClick={() => void submit(target.feature, accurate)}
                aria-label={`Mark ${target.label} ${accurate ? "accurate" : "inaccurate"}`}
                className={`inline-flex min-h-11 items-center rounded-full border px-3.5 text-[11px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70 disabled:opacity-50 motion-reduce:transition-none ${
                  accurate
                    ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20"
                    : "border-rose-300/30 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20"
                }`}
              >
                {pending === `${target.feature}:${accurate}` ? "Saving…" : accurate ? "Accurate" : "Inaccurate"}
              </button>
            ))}
          </div>
        ))}
      </div>
      <label htmlFor={noteId} className="mt-2 block text-[10px] uppercase tracking-wide text-white/40">
        Note (optional)
      </label>
      <input
        id={noteId}
        type="text"
        value={note}
        maxLength={CALIBRATION_NOTE_MAX_LENGTH}
        onChange={(event) => setNote(event.target.value)}
        placeholder="What did the room actually look like?"
        className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-xs text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70"
      />
      <p aria-live="polite" className="mt-1 min-h-4 text-[11px] text-white/50">
        {status}
      </p>
    </div>
  );
}
