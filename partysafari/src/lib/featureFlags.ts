/**
 * Feature flags — the smallest thing that keeps unfinished work dark.
 *
 * A typed constant plus an env-var override, and nothing else. No remote config
 * service, no database-backed flag table: the rollout plan for Crowd Pulse asks
 * for a flag so the code can merge to `main` without being visible, and a
 * service would be a second system to operate for a single boolean.
 *
 * Defaults are the source of truth and every one of them is `false`. Turning a
 * flag on is a deploy-time decision made by setting the env var, so a missing or
 * misspelled variable fails closed.
 *
 * `process.env.NEXT_PUBLIC_*` must be referenced by its literal name for Next to
 * inline it into the client bundle, which is why the lookups below are written
 * out rather than composed from the flag name.
 */

export type FeatureFlag = "crowdPulse";

export const FEATURE_FLAG_DEFAULTS: Readonly<Record<FeatureFlag, boolean>> = {
  /**
   * Crowd Pulse ships dark. The engine and its hook are complete and tested;
   * nothing renders. Flip this only after the Founder-cohort ground-truth pass
   * described in the rollout plan.
   */
  crowdPulse: false,
};

function readFlagEnv(flag: FeatureFlag): string | undefined {
  switch (flag) {
    case "crowdPulse":
      return process.env.NEXT_PUBLIC_FEATURE_CROWD_PULSE;
  }
}

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const raw = readFlagEnv(flag);
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return FEATURE_FLAG_DEFAULTS[flag];
  }
  return ["1", "true", "on", "yes"].includes(raw.trim().toLowerCase());
}
