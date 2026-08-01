/**
 * PSI insights — SCAFFOLDING ONLY, NOT WIRED UP.
 *
 * Planned behaviour (MASTERPLAN "PartySafari Intelligence (PSI)"): plain-language
 * reads on top of an existing Party Score — why a venue is ranked where it is,
 * what the score means right now, and anomaly callouts when a venue behaves
 * unlike itself.
 *
 * This file ships the prop contract and an inert shell only. Critically, PSI is
 * a *consumer* of the Party Score produced by `partyScoreEngine`; it must never
 * become a second scoring implementation. Nothing here computes, infers, or
 * fetches, and the component is not rendered anywhere yet.
 */

export type PsiInsightKind = "ranking" | "interpretation" | "anomaly";

export type PsiInsight = {
  id: string;
  kind: PsiInsightKind;
  /** One-line takeaway. */
  headline: string;
  /** Supporting sentence explaining the signal behind the takeaway. */
  detail: string;
};

export type PsiInsightsProps = {
  /** Venue the insights describe. */
  venueId?: string;
  /** Insights supplied by a future PSI hook. Empty while unimplemented. */
  insights?: PsiInsight[];
  isLoading?: boolean;
  className?: string;
};

export default function PsiInsights({ className = "" }: PsiInsightsProps) {
  return (
    <section className={`rounded-2xl border border-dashed border-white/12 bg-black/20 p-4 opacity-60 ${className}`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-violet-200/60">PSI insights</p>
      <p className="mt-2 text-sm text-white/45">Score interpretation is not available yet.</p>
    </section>
  );
}
