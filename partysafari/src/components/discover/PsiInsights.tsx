/**
 * PSI insights — plain-language reads on top of an existing Party Score.
 *
 * Why a venue is ranked where it is, what the score means right now, and a
 * callout when a venue behaves unlike itself. The insights are produced by
 * `buildPsiInsights` in `@/lib/psi`; this component only renders them.
 *
 * PSI remains a *consumer* of the Party Score produced by `partyScoreEngine`
 * and never a second scoring implementation — see the module header in
 * `@/lib/psi` for the constraints that keeps.
 */

import type { PsiInsight, PsiInsightKind } from "@/lib/psi";

export type { PsiInsight, PsiInsightKind } from "@/lib/psi";

export type PsiInsightsProps = {
  /** Venue the insights describe. */
  venueId?: string;
  /** Insights from `buildPsiInsights`. */
  insights?: PsiInsight[];
  isLoading?: boolean;
  className?: string;
};

const KIND_LABEL: Record<PsiInsightKind, string> = {
  ranking: "Why it is here",
  interpretation: "What the score means",
  anomaly: "Worth knowing",
};

const KIND_TONE: Record<PsiInsightKind, string> = {
  ranking: "text-violet-200/70",
  interpretation: "text-sky-200/70",
  anomaly: "text-amber-200/80",
};

export default function PsiInsights({ insights = [], isLoading = false, className = "" }: PsiInsightsProps) {
  if (isLoading) {
    return (
      <section className={`rounded-2xl border border-white/8 bg-black/20 p-4 ${className}`}>
        <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-violet-200/60">PSI insights</p>
        <div className="mt-3 space-y-2" aria-hidden="true">
          <div className="h-3 w-2/3 animate-pulse rounded-full bg-white/10" />
          <div className="h-3 w-1/2 animate-pulse rounded-full bg-white/10" />
        </div>
      </section>
    );
  }

  if (insights.length === 0) {
    return null;
  }

  return (
    <section className={`rounded-2xl border border-white/8 bg-black/20 p-4 ${className}`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-violet-200/60">PSI insights</p>
      <ul className="mt-3 space-y-3">
        {insights.map((insight) => (
          <li key={insight.id}>
            <p className={`text-[10px] font-medium uppercase tracking-[0.18em] ${KIND_TONE[insight.kind]}`}>
              {KIND_LABEL[insight.kind]}
            </p>
            <p className="mt-1 text-sm font-semibold text-white">{insight.headline}</p>
            <p className="mt-0.5 text-sm text-white/60">{insight.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
