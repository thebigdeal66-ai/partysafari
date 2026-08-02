import assert from "node:assert/strict";
import test from "node:test";
import {
  FEATURE_FLAG_DEFAULTS,
  hasCityTargetingConfigured,
  hasTargetingConfigured,
  isApprovedTester,
  isFeatureEnabled,
  isFeatureEnabledForViewer,
  parseApprovedCity,
  parseApprovedProfileIds,
  resolveFeatureAccess,
  type FeatureFlag,
} from "@/lib/featureFlags";

/**
 * Run with `npm test`. Targeted feature-flag resolution, which is the whole of
 * the "on for the Founder, off for everyone else" mechanism.
 *
 * The UUIDs below are fixtures. The Founder's real profile id appears here and
 * in the `featureFlags.ts` header comment documenting the env vars, and nowhere
 * in the resolver itself — the resolver takes an id and a parsed config and has
 * no opinion about whose id it is.
 */

/** `public.profiles.id` for `thebigdeal66`, confirmed against the live project. */
const FOUNDER_PROFILE_ID = "02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f";
/** Any other authenticated account. Not on any allowlist below. */
const OTHER_PROFILE_ID = "11111111-2222-4333-8444-555555555555";

const ENV_KEYS = [
  "NEXT_PUBLIC_FEATURE_CROWD_PULSE",
  "NEXT_PUBLIC_FEATURE_CROWD_PULSE_PROFILE_IDS",
  "NEXT_PUBLIC_FEATURE_CROWD_PULSE_CITY",
  "NEXT_PUBLIC_FEATURE_AI_DISCOVER_CARDS",
  "NEXT_PUBLIC_FEATURE_AI_DISCOVER_CARDS_PROFILE_IDS",
  "NEXT_PUBLIC_FEATURE_AI_DISCOVER_CARDS_CITY",
] as const;

/**
 * Every case runs against a known-empty environment and restores whatever was
 * there, so these cannot leak configuration into the pre-existing flag tests in
 * `crowdPulse.test.ts` / `discoverIntelligence.test.ts`.
 */
function withEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string>>, run: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }

  try {
    run();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

const FLAGS: FeatureFlag[] = ["crowdPulse", "aiDiscoverCards"];

// ---------------------------------------------------------------------------
// 1. Global OFF blocks everyone
// ---------------------------------------------------------------------------

test("with nothing configured, every flag is off for everyone", () => {
  withEnv({}, () => {
    for (const flag of FLAGS) {
      assert.equal(FEATURE_FLAG_DEFAULTS[flag], false);
      assert.equal(isFeatureEnabled(flag), false);
      assert.equal(isFeatureEnabledForViewer(flag, { profileId: FOUNDER_PROFILE_ID }), false);
      assert.equal(isFeatureEnabledForViewer(flag, { profileId: OTHER_PROFILE_ID }), false);
      assert.equal(isFeatureEnabledForViewer(flag, { profileId: null }), false);
      assert.equal(hasTargetingConfigured(flag), false);
    }
  });
});

// ---------------------------------------------------------------------------
// 2 & 3. The allowlist grants one profile and only that profile
// ---------------------------------------------------------------------------

test("an allowlisted profile is enabled while the global default stays off", () => {
  withEnv({ NEXT_PUBLIC_FEATURE_CROWD_PULSE_PROFILE_IDS: FOUNDER_PROFILE_ID }, () => {
    assert.equal(isFeatureEnabled("crowdPulse"), false);
    assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: FOUNDER_PROFILE_ID }), true);
    assert.equal(isApprovedTester("crowdPulse", { profileId: FOUNDER_PROFILE_ID }), true);
  });
});

test("allowlist matching is on profiles.id and is case-insensitive about hex casing", () => {
  withEnv({ NEXT_PUBLIC_FEATURE_CROWD_PULSE_PROFILE_IDS: FOUNDER_PROFILE_ID.toUpperCase() }, () => {
    assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: FOUNDER_PROFILE_ID }), true);
  });
});

test("an unrelated authenticated profile is denied", () => {
  withEnv({ NEXT_PUBLIC_FEATURE_CROWD_PULSE_PROFILE_IDS: FOUNDER_PROFILE_ID }, () => {
    assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: OTHER_PROFILE_ID }), false);
    assert.equal(isApprovedTester("crowdPulse", { profileId: OTHER_PROFILE_ID }), false);
    // A matching city is no help when no city is configured.
    assert.equal(
      isFeatureEnabledForViewer("crowdPulse", { profileId: OTHER_PROFILE_ID, city: "Ocean City" }),
      false
    );
  });
});

test("each flag carries its own allowlist", () => {
  withEnv({ NEXT_PUBLIC_FEATURE_CROWD_PULSE_PROFILE_IDS: FOUNDER_PROFILE_ID }, () => {
    assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: FOUNDER_PROFILE_ID }), true);
    assert.equal(isFeatureEnabledForViewer("aiDiscoverCards", { profileId: FOUNDER_PROFILE_ID }), false);
  });
});

// ---------------------------------------------------------------------------
// 4. Anonymous callers
// ---------------------------------------------------------------------------

test("an anonymous caller is denied even when an allowlist and a city are configured", () => {
  withEnv(
    {
      NEXT_PUBLIC_FEATURE_CROWD_PULSE_PROFILE_IDS: FOUNDER_PROFILE_ID,
      NEXT_PUBLIC_FEATURE_CROWD_PULSE_CITY: "Ocean City",
    },
    () => {
      assert.equal(isFeatureEnabledForViewer("crowdPulse", {}), false);
      assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: null, city: null }), false);
      assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: "", city: "" }), false);
      assert.equal(isApprovedTester("crowdPulse", { profileId: null }), false);
    }
  );
});

// ---------------------------------------------------------------------------
// 5. Malformed configuration fails closed
// ---------------------------------------------------------------------------

test("a malformed allowlist grants nothing rather than throwing or granting broadly", () => {
  const malformed = [
    "not-a-uuid",
    "*",
    "all",
    "true",
    `${FOUNDER_PROFILE_ID},oops`,
    `${FOUNDER_PROFILE_ID} ${OTHER_PROFILE_ID}`,
    "02ed8330-6ca7-4cf0-ab16",
    "02ed8330:6ca7:4cf0:ab16:52f1b4feaa8f",
    "{}",
    '["02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f"]',
  ];

  for (const raw of malformed) {
    withEnv({ NEXT_PUBLIC_FEATURE_CROWD_PULSE_PROFILE_IDS: raw }, () => {
      assert.equal(parseApprovedProfileIds(raw).size, 0, `expected "${raw}" to be discarded`);
      assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: FOUNDER_PROFILE_ID }), false);
      assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: OTHER_PROFILE_ID }), false);
      assert.equal(isFeatureEnabled("crowdPulse"), false);
    });
  }
});

test("one bad entry discards the whole allowlist rather than half-applying it", () => {
  assert.equal(parseApprovedProfileIds(`${FOUNDER_PROFILE_ID},${OTHER_PROFILE_ID}`).size, 2);
  assert.equal(parseApprovedProfileIds(`${FOUNDER_PROFILE_ID},nonsense,${OTHER_PROFILE_ID}`).size, 0);
});

test("absent, empty and separator-only allowlists are all just empty", () => {
  for (const raw of [undefined, null, "", "   ", ",", ", ,"]) {
    assert.equal(parseApprovedProfileIds(raw).size, 0);
  }
  // Trailing separators around otherwise valid entries are tolerated.
  assert.equal(parseApprovedProfileIds(` ${FOUNDER_PROFILE_ID} , `).size, 1);
});

// ---------------------------------------------------------------------------
// 6. City targeting only when explicitly configured
// ---------------------------------------------------------------------------

test("city targeting grants access only when a city is configured", () => {
  withEnv({ NEXT_PUBLIC_FEATURE_CROWD_PULSE_CITY: "Ocean City" }, () => {
    assert.equal(hasCityTargetingConfigured("crowdPulse"), true);
    assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: OTHER_PROFILE_ID, city: "Ocean City" }), true);
    assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: OTHER_PROFILE_ID, city: "ocean city " }), true);
    assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: OTHER_PROFILE_ID, city: "Rehoboth" }), false);
    assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: OTHER_PROFILE_ID, city: null }), false);
  });
});

test("a profile whose city matches an unconfigured target is still denied", () => {
  withEnv({}, () => {
    assert.equal(hasCityTargetingConfigured("crowdPulse"), false);
    assert.equal(parseApprovedCity(undefined), null);
    assert.equal(parseApprovedCity("   "), null);
    for (const city of ["Ocean City", "Rehoboth", "", null]) {
      assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: OTHER_PROFILE_ID, city }), false);
    }
  });
});

test("an empty configured city does not become a wildcard", () => {
  withEnv({ NEXT_PUBLIC_FEATURE_CROWD_PULSE_CITY: "   " }, () => {
    assert.equal(hasCityTargetingConfigured("crowdPulse"), false);
    assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: OTHER_PROFILE_ID, city: "" }), false);
    assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: OTHER_PROFILE_ID, city: "Anywhere" }), false);
  });
});

// ---------------------------------------------------------------------------
// 7. Only the explicit global setting is a public rollout
// ---------------------------------------------------------------------------

test("allowlist or city membership is never read as a global rollout", () => {
  withEnv(
    {
      NEXT_PUBLIC_FEATURE_CROWD_PULSE_PROFILE_IDS: FOUNDER_PROFILE_ID,
      NEXT_PUBLIC_FEATURE_CROWD_PULSE_CITY: "Ocean City",
    },
    () => {
      // The global check — the one four pre-existing call sites already use — is untouched.
      assert.equal(isFeatureEnabled("crowdPulse"), false);
      assert.equal(FEATURE_FLAG_DEFAULTS.crowdPulse, false);
      // And nobody outside the two targeted paths gets in.
      assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: OTHER_PROFILE_ID, city: "Rehoboth" }), false);
      assert.equal(isFeatureEnabledForViewer("crowdPulse", {}), false);
    }
  );
});

test("the explicit global setting turns the flag on for everyone, including anonymous viewers", () => {
  withEnv({ NEXT_PUBLIC_FEATURE_CROWD_PULSE: "true" }, () => {
    assert.equal(isFeatureEnabled("crowdPulse"), true);
    assert.equal(isFeatureEnabledForViewer("crowdPulse", {}), true);
    assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: OTHER_PROFILE_ID }), true);
    // ...and a global rollout does not make the public an approved tester.
    assert.equal(isApprovedTester("crowdPulse", { profileId: OTHER_PROFILE_ID }), false);
  });
});

test("global on takes precedence over targeting without erasing who was targeted", () => {
  withEnv(
    {
      NEXT_PUBLIC_FEATURE_CROWD_PULSE: "1",
      NEXT_PUBLIC_FEATURE_CROWD_PULSE_PROFILE_IDS: FOUNDER_PROFILE_ID,
    },
    () => {
      assert.equal(
        resolveFeatureAccess({
          globalEnabled: true,
          config: { approvedProfileIds: new Set([FOUNDER_PROFILE_ID]), approvedCity: null },
          viewer: { profileId: FOUNDER_PROFILE_ID },
        }).grant,
        "global"
      );
      // The named tester keeps their calibration tooling once the feature goes public.
      assert.equal(isApprovedTester("crowdPulse", { profileId: FOUNDER_PROFILE_ID }), true);
      assert.equal(isApprovedTester("crowdPulse", { profileId: OTHER_PROFILE_ID }), false);
    }
  );
});

// ---------------------------------------------------------------------------
// The resolver itself, with no environment involved
// ---------------------------------------------------------------------------

test("the resolver reports which rule granted access, in precedence order", () => {
  const config = {
    approvedProfileIds: new Set([FOUNDER_PROFILE_ID]),
    approvedCity: "ocean city",
  };

  assert.deepEqual(
    resolveFeatureAccess({ globalEnabled: false, config, viewer: { profileId: FOUNDER_PROFILE_ID } }),
    { enabled: true, grant: "profileAllowlist" }
  );
  assert.deepEqual(
    resolveFeatureAccess({ globalEnabled: false, config, viewer: { profileId: OTHER_PROFILE_ID, city: "Ocean City" } }),
    { enabled: true, grant: "cityAllowlist" }
  );
  assert.deepEqual(
    resolveFeatureAccess({ globalEnabled: false, config, viewer: { profileId: OTHER_PROFILE_ID, city: "Rehoboth" } }),
    { enabled: false, grant: "none" }
  );
  assert.deepEqual(
    resolveFeatureAccess({
      globalEnabled: false,
      config: { approvedProfileIds: new Set<string>(), approvedCity: null },
      viewer: { profileId: FOUNDER_PROFILE_ID, city: "Ocean City" },
    }),
    { enabled: false, grant: "none" }
  );
});

test("the resolver never sees a username, only a profile id", () => {
  const config = { approvedProfileIds: new Set(["thebigdeal66"]), approvedCity: null };
  // A username can never reach the allowlist through the env parser, but even if
  // one were injected directly, the viewer is matched on profileId alone.
  assert.equal(
    resolveFeatureAccess({ globalEnabled: false, config, viewer: { profileId: FOUNDER_PROFILE_ID } }).enabled,
    false
  );
  assert.equal(parseApprovedProfileIds("thebigdeal66").size, 0);
});
