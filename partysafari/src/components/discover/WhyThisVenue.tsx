/**
 * "Why this venue?" — the explainable half of PSI.
 *
 * Every line rendered here comes from `explainVenue`, which builds its reasons
 * out of the same signals and weights the Party Score used. Nothing is
 * hardcoded per venue and nothing is inferred: if a reason says three friends
 * are here, `evidence.value` is three because `signals.friendPresence` is three.
 *
 * When a venue is quiet there are no reasons, and the component says so rather
 * than padding the list — a quiet venue reading as quiet is the intended
 * outcome, not a failure state.
 */

import type { PsiExplanation } from "@/lib/psi";

type WhyThisVenueProps = {
  explanation: PsiExplanation;
  /** Renders the reasons open by default, for surfaces with room for them. */
  defaultOpen?: boolean;
  className?: string;
};

export default function WhyThisVenue({ explanation, defaultOpen = false, className = "" }: WhyThisVenueProps) {
  return (
    <details open={defaultOpen} className={`group rounded-2xl border border-white/8 bg-black/25 ${className}`}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5 text-sm font-semibold text-violet-100">
        Why this venue?
        <span aria-hidden="true" className="text-xs text-white/45 transition group-open:rotate-180">
          ▼
        </span>
      </summary>

      <div className="space-y-2 px-3.5 pb-3.5">
        <p className="text-sm text-white/80">{explanation.headline}</p>

        {explanation.reasons.length > 0 ? (
          <ul className="space-y-1.5">
            {explanation.reasons.map((reason) => (
              <li key={reason.id} className="flex items-start gap-2 text-sm text-white/65">
                <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-300/70" />
                <span>
                  {reason.text}
                  {reason.evidence.points > 0 ? (
                    <span className="ml-1.5 text-xs tabular-nums text-violet-200/60">
                      +{reason.evidence.points} pts
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/45">No signals from here yet tonight.</p>
        )}

        {explanation.caveat ? <p className="text-xs text-white/40">{explanation.caveat}</p> : null}
      </div>
    </details>
  );
}
