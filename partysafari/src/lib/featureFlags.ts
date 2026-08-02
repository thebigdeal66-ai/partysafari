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

export type FeatureFlag = "crowdPulse" | "aiDiscoverCards";

export const FEATURE_FLAG_DEFAULTS: Readonly<Record<FeatureFlag, boolean>> = {
  /**
   * Crowd Pulse ships dark. The engine and its hook are complete and tested;
   * nothing renders. Flip this only after the Founder-cohort ground-truth pass
   * described in the rollout plan.
   *
   * This flag is also what keeps the engine's provisional absolute labels
   * (`quiet` / `building` / `busy` / `peak`) away from users: they rest on an
   * uncalibrated reference constant, so the pass that flips this flag is the
   * same pass that calibrates `CROWD_PULSE_CONFIG.intensityReference`.
   */
  crowdPulse: false,

  /**
   * AI Discover Cards ship dark. The classification and priority model in
   * `discoverIntelligence.ts` is pure and tested, but its thresholds have never
   * been checked against a real Ocean City night — a card that claims a room is
   * "Exploding Right Now" when it is not is exactly the kind of confidence lie
   * MASTERPLAN forbids. Flip this only after those thresholds are validated
   * against observed traffic.
   *
   * Independent of `crowdPulse`. The cards treat Crowd Pulse as optional
   * corroboration, so this flag can be turned on first without turning that one
   * on, and turning that one on later changes only priority ordering.
   */
  aiDiscoverCards: false,
};

function readFlagEnv(flag: FeatureFlag): string | undefined {
  switch (flag) {
    case "crowdPulse":
      return process.env.NEXT_PUBLIC_FEATURE_CROWD_PULSE;
    case "aiDiscoverCards":
      return process.env.NEXT_PUBLIC_FEATURE_AI_DISCOVER_CARDS;
  }
}

function readProfileIdsEnv(flag: FeatureFlag): string | undefined {
  switch (flag) {
    case "crowdPulse":
      return process.env.NEXT_PUBLIC_FEATURE_CROWD_PULSE_PROFILE_IDS;
    case "aiDiscoverCards":
      return process.env.NEXT_PUBLIC_FEATURE_AI_DISCOVER_CARDS_PROFILE_IDS;
  }
}

function readCityEnv(flag: FeatureFlag): string | undefined {
  switch (flag) {
    case "crowdPulse":
      return process.env.NEXT_PUBLIC_FEATURE_CROWD_PULSE_CITY;
    case "aiDiscoverCards":
      return process.env.NEXT_PUBLIC_FEATURE_AI_DISCOVER_CARDS_CITY;
  }
}

export type FeatureTargetingConfig = {
  approvedProfileIds: ReadonlySet<string>;
  approvedCity: string | null;
};

export type FeatureViewerContext = {
  profileId?: string | null;
  city?: string | null;
};

export type FeatureGrant = "global" | "profileAllowlist" | "cityAllowlist" | "none";

export type FeatureAccess = {
  enabled: boolean;
  grant: FeatureGrant;
};

const EMPTY_TARGETING: FeatureTargetingConfig = {
  approvedProfileIds: new Set<string>(),
  approvedCity: null,
};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRUTHY_ENV_VALUES = ["1", "true", "on", "yes"];

export function parseApprovedProfileIds(raw: string | undefined | null): ReadonlySet<string> {
  if (typeof raw !== "string") {
    return EMPTY_TARGETING.approvedProfileIds;
  }

  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (entries.length === 0) {
    return EMPTY_TARGETING.approvedProfileIds;
  }

  const approved = new Set<string>();
  for (const entry of entries) {
    if (!UUID_PATTERN.test(entry)) {
      return EMPTY_TARGETING.approvedProfileIds;
    }
    approved.add(entry.toLowerCase());
  }

  return approved;
}

export function parseApprovedCity(raw: string | undefined | null): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function readFeatureTargetingConfig(flag: FeatureFlag): FeatureTargetingConfig {
  return {
    approvedProfileIds: parseApprovedProfileIds(readProfileIdsEnv(flag)),
    approvedCity: parseApprovedCity(readCityEnv(flag)),
  };
}

export function hasTargetingConfigured(flag: FeatureFlag): boolean {
  const config = readFeatureTargetingConfig(flag);
  return config.approvedProfileIds.size > 0 || config.approvedCity !== null;
}

export function hasCityTargetingConfigured(flag: FeatureFlag): boolean {
  return readFeatureTargetingConfig(flag).approvedCity !== null;
}

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const raw = readFlagEnv(flag);
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return FEATURE_FLAG_DEFAULTS[flag];
  }
  return TRUTHY_ENV_VALUES.includes(raw.trim().toLowerCase());
}

export function resolveFeatureAccess(input: {
  globalEnabled: boolean;
  config: FeatureTargetingConfig;
  viewer: FeatureViewerContext;
}): FeatureAccess {
  if (input.globalEnabled) {
    return { enabled: true, grant: "global" };
  }

  const profileId = typeof input.viewer.profileId === "string" ? input.viewer.profileId.trim().toLowerCase() : "";
  if (profileId.length > 0 && input.config.approvedProfileIds.has(profileId)) {
    return { enabled: true, grant: "profileAllowlist" };
  }

  const approvedCity = input.config.approvedCity;
  const viewerCity = typeof input.viewer.city === "string" ? input.viewer.city.trim().toLowerCase() : "";
  if (approvedCity !== null && profileId.length > 0 && viewerCity === approvedCity) {
    return { enabled: true, grant: "cityAllowlist" };
  }

  return { enabled: false, grant: "none" };
}

export function isApprovedTester(flag: FeatureFlag, viewer: FeatureViewerContext): boolean {
  const access = resolveFeatureAccess({
    globalEnabled: isFeatureEnabled(flag),
    config: readFeatureTargetingConfig(flag),
    viewer,
  });
  return access.enabled;
}

export function isFeatureEnabledForViewer(flag: FeatureFlag, viewer: FeatureViewerContext): boolean {
  return isApprovedTester(flag, viewer);
}
