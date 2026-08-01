/**
 * Lit Button — SCAFFOLDING ONLY, NOT WIRED UP.
 *
 * Planned behaviour (MASTERPLAN "Lit Button Specification"): a one-tap "it is
 * good here, come now" endorsement — no modal, optimistic acknowledgement, and
 * a visible cooldown before the same person can vouch again.
 *
 * This file intentionally ships the prop contract and the visual shell only.
 * There is no endorsement write, no optimistic state, and no cooldown timer;
 * `onLit` is declared for the future call site but is never invoked. The
 * component is not rendered anywhere yet — it renders as a disabled control so
 * that whoever implements it inherits the shape rather than a blank file.
 */

export type LitButtonProps = {
  /** Venue being endorsed. */
  venueId: string;
  /** Endorsements inside the current window. */
  litCount?: number;
  /** Whether the signed-in user has already vouched in this window. */
  hasLit?: boolean;
  /** Seconds until this user may vouch again; 0 means ready. */
  cooldownSecondsRemaining?: number;
  /** Reserved for the future implementation. Never called by this scaffold. */
  onLit?: (venueId: string) => void;
  className?: string;
};

export default function LitButton({ litCount = 0, hasLit = false, className = "" }: LitButtonProps) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title="Lit Button is not available yet"
      className={`inline-flex min-h-11 cursor-not-allowed items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/40 ${className}`}
    >
      <span aria-hidden="true">🔥</span>
      <span>{hasLit ? "Lit" : "Mark Lit"}</span>
      <span className="tabular-nums">{litCount}</span>
    </button>
  );
}
