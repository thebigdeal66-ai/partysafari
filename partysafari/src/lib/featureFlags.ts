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
 *
 * ## Targeted access (Founder calibration)
 *
 * A flag can also be on for specific people while its global default stays off,
 * so Crowd Pulse and AI Discover Cards can be judged against a real night by one
 * account before anyone else sees them. Four modes, in strict precedence order:
 *
 * 1. **Global "everyone"** — `NEXT_PUBLIC_FEATURE_*`, exactly as it already
 *    worked. This is the only setting that constitutes a public rollout.
 * 2. **Approved-profile allowlist** — `NEXT_PUBLIC_FEATURE_*_PROFILE_IDS`, a
 *    comma-separated list of `public.profiles.id` UUIDs.
 * 3. **Approved city** — `NEXT_PUBLIC_FEATURE_*_CITY`, a single city string
 *    matched case-insensitively against the viewer's profile city. Unset means
 *    no city grants access; there is deliberately no default city. Like the
 *    allowlist, it grants only to an authenticated viewer — a city never admits
 *    a signed-out visitor.
 * 4. Otherwise off, per `FEATURE_FLAG_DEFAULTS`.
 *
 * Allowlist membership is never "enable globally": it grants one viewer access
 * and changes nothing for anyone else.
 *
 * ### Local/testing configuration
 *
 * There is no `.env.example` in this repo, so the exact variable names and an
 * example value live here, next to the code that reads them:
 *
 * ```
 * # Founder-only Crowd Pulse. Global default stays false.
 * NEXT_PUBLIC_FEATURE_CROWD_PULSE_PROFILE_IDS=02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f
 * NEXT_PUBLIC_FEATURE_AI_DISCOVER_CARDS_PROFILE_IDS=02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f
 *
 * # Optional city targeting. Leave unset unless a whole city is being tested.
 * # NEXT_PUBLIC_FEATURE_CROWD_PULSE_CITY=Ocean City
 * ```
 *
 * That UUID is the Founder's `profiles.id`. It appears in this comment and in
 * test fixtures only — never inside the resolver, which takes a profile id and a
 * parsed config and knows nothing about who is being targeted. Matching is
 * always against `profiles.id`; `username` is user-editable and is never
 * consulted.
 *
 * These are `NEXT_PUBLIC_*` because the check runs in the browser, so the
 * allowlist is readable in the client bundle. That is acceptable: a profile id
 * is already public (it is in `/profiles/[id]` URLs), and knowing an id grants
 * nothing — access is decided against the *viewer's own* authenticated id, and
 * every table this unlocks is still behind RLS.
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

/** Parsed targeting for one flag. Empty set plus null city means "global only". */
export type FeatureTargetingConfig = {
  approvedProfileIds: ReadonlySet<string>;
  /** Already lower-cased and trimmed, so callers compare like with like. */
  approvedCity: string | null;
};

/** What is known about the person the flag is being resolved for. */
export type FeatureViewerContext = {
  /** `public.profiles.id`. Null for a signed-out visitor. */
  profileId?: string | null;
  /** The viewer's city, when one is loaded. Only consulted for city targeting. */
  city?: string | null;
};

/**
 * Which rule granted access. `profileAllowlist` and `cityAllowlist` are the two
 * "approved tester" paths — the Founder calibration UI keys off those rather
 * than off `enabled`, so a global rollout never puts internal tooling on screen.
 */
export type FeatureGrant = "global" | "profileAllowlist" | "cityAllowlist" | "none";

export type FeatureAccess = {
  enabled: boolean;
  grant: FeatureGrant;
};

const DENIED: FeatureAccess = { enabled: false, grant: "none" };

const EMPTY_TARGETING: FeatureTargetingConfig = {
  approvedProfileIds: new Set<string>(),
  approvedCity: null,
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TRUTHY_ENV_VALUES = ["1", "true", "on", "yes"];

/**
 * An allowlist is all-or-nothing: one unparseable entry discards the whole list.
 *
 * The alternative — skipping bad entries and honouring the rest — turns a typo
 * into a silent partial rollout that nobody notices, and the failure mode of a
 * discarded list (a tester sees nothing and says so) is far cheaper than the
 * failure mode of a half-applied one.
 */
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

/** Null unless a city was explicitly configured. There is no default city. */
export function parseApprovedCity(raw: string | undefined | null): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function readGlobalFlagEnv(flag: FeatureFlag): string | undefined {
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

export function readFeatureTargetingConfig(flag: FeatureFlag): FeatureTargetingConfig {
  return {
    approvedProfileIds: parseApprovedProfileIds(readProfileIdsEnv(flag)),
    approvedCity: parseApprovedCity(readCityEnv(flag)),
  };
}

/** True when this deploy targets anyone at all beyond the global default. */
export function hasTargetingConfigured(flag: FeatureFlag): boolean {
  const config = readFeatureTargetingConfig(flag);
  return config.approvedProfileIds.size > 0 || config.approvedCity !== null;
}

/** True only when a city is configured, i.e. when the viewer's city is worth loading. */
export function hasCityTargetingConfigured(flag: FeatureFlag): boolean {
  return readFeatureTargetingConfig(flag).approvedCity !== null;
}

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const raw = readGlobalFlagEnv(flag);
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return FEATURE_FLAG_DEFAULTS[flag];
  }
  return TRUTHY_ENV_VALUES.includes(raw.trim().toLowerCase());
}

/**
 * The whole targeting decision, as a pure function of inputs.
 *
 * Deliberately generic: it takes a profile id and a parsed config and has no
 * idea whose id it is. Every real UUID lives in env configuration and test
 * fixtures, never here, so widening or revoking access is a config change
 * rather than a deploy of new logic.
 */
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

  // An unconfigured city is null, so an anonymous viewer whose city is also
  // unknown can never match by both sides being empty.
  //
  // A city grant additionally requires an authenticated profile id. Today's only
  // caller reads the city from the viewer's own `profiles.home_city` and so can
  // never supply one without an id, but this function is exported and generic:
  // without the check, any future caller that knows a city by some other route
  // (a picker, geolocation, a query param) would hand a signed-out visitor the
  // feature — and the calibration control with it, since `isApprovedTester`
  // counts a city grant. Anonymous is never targeted.
  const approvedCity = input.config.approvedCity;
  const viewerCity = typeof input.viewer.city === "string" ? input.viewer.city.trim().toLowerCase() : "";
  if (approvedCity !== null && profileId.length > 0 && viewerCity.length > 0 && viewerCity === approvedCity) {
    return { enabled: true, grant: "cityAllowlist" };
  }

  return DENIED;
}

/**
 * `resolveFeatureAccess` against this deploy's env configuration.
 *
 * Wrapped because this runs inside render paths: the global flag is the answer
 * of last resort if reading or parsing configuration ever fails, which keeps a
 * bad env value to "no extra access" rather than a crashed Discover page.
 */
export function resolveFeatureAccessForViewer(flag: FeatureFlag, viewer: FeatureViewerContext): FeatureAccess {
  const globalEnabled = isFeatureEnabled(flag);
  try {
    return resolveFeatureAccess({ globalEnabled, config: readFeatureTargetingConfig(flag), viewer });
  } catch {
    return globalEnabled ? { enabled: true, grant: "global" } : DENIED;
  }
}

export function isFeatureEnabledForViewer(flag: FeatureFlag, viewer: FeatureViewerContext): boolean {
  return resolveFeatureAccessForViewer(flag, viewer).enabled;
}

/**
 * True only for viewers who were individually targeted — never for a viewer who
 * merely rode in on a global rollout. This is the gate for internal calibration
 * tooling, which must stay invisible to the public even after the flag flips.
 *
 * Resolved with the global override forced off on purpose. Precedence exists to
 * answer "can this person see the feature", and by that rule `global` shadows
 * everything; the question here is the different one of whether this particular
 * viewer was named, which stays true once the feature also goes public.
 */
export function isApprovedTester(flag: FeatureFlag, viewer: FeatureViewerContext): boolean {
  let grant: FeatureGrant;
  try {
    grant = resolveFeatureAccess({
      globalEnabled: false,
      config: readFeatureTargetingConfig(flag),
      viewer,
    }).grant;
  } catch {
    return false;
  }
  return grant === "profileAllowlist" || grant === "cityAllowlist";
}
