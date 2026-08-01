/**
 * Crowd Pulse — SCAFFOLDING ONLY, NOT WIRED UP.
 *
 * Planned behaviour (MASTERPLAN "Crowd Pulse"): an anonymised, city-level view
 * of where the night's energy is concentrated right now, aggregated so that no
 * individual venue or person is identifiable from a single bucket.
 *
 * This file ships the prop contract and an inert shell only. It performs no
 * aggregation, subscribes to nothing, and is not rendered anywhere yet. When it
 * is implemented the buckets must arrive pre-aggregated from a hook — this
 * component should stay presentational.
 */

export type CrowdPulseBucket = {
  id: string;
  /** Human label for the slice, e.g. a neighbourhood or hour band. */
  label: string;
  /** Normalised 0–1 heat, already anonymised upstream. */
  intensity: number;
};

export type CrowdPulseProps = {
  /** City the pulse is scoped to. */
  cityLabel?: string;
  /** Pre-aggregated heat buckets. Empty while unimplemented. */
  buckets?: CrowdPulseBucket[];
  isLoading?: boolean;
  className?: string;
};

export default function CrowdPulse({ cityLabel = "Your city", className = "" }: CrowdPulseProps) {
  return (
    <section className={`rounded-2xl border border-dashed border-white/12 bg-black/20 p-4 opacity-60 ${className}`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-violet-200/60">Crowd Pulse</p>
      <p className="mt-2 text-base font-semibold text-white/70">{cityLabel}</p>
      <p className="mt-1 text-sm text-white/45">City-wide heat view is not available yet.</p>
    </section>
  );
}
