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

const FOUNDER_PROFILE_ID = "02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f";
const OTHER_PROFILE_ID = "11111111-2222-4333-8444-555555555555";

const ENV_KEYS = [
  "NEXT_PUBLIC_FEATURE_CROWD_PULSE",
  "NEXT_PUBLIC_FEATURE_CROWD_PULSE_PROFILE_IDS",
  "NEXT_PUBLIC_FEATURE_CROWD_PULSE_CITY",
  "NEXT_PUBLIC_FEATURE_AI_DISCOVER_CARDS",
  "NEXT_PUBLIC_FEATURE_AI_DISCOVER_CARDS_PROFILE_IDS",
  "NEXT_PUBLIC_FEATURE_AI_DISCOVER_CARDS_CITY",
] as const;

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
    assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: OTHER_PROFILE_ID, city: "Ocean City" }), false);
  });
});

test("each flag carries its own allowlist", () => {
  withEnv({ NEXT_PUBLIC_FEATURE_CROWD_PULSE_PROFILE_IDS: FOUNDER_PROFILE_ID }, () => {
    assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: FOUNDER_PROFILE_ID }), true);
    assert.equal(isFeatureEnabledForViewer("aiDiscoverCards", { profileId: FOUNDER_PROFILE_ID }), false);
  });
});

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

      for (const city of ["Ocean City", "ocean city", " OCEAN CITY "]) {
        assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: null, city }), false);
        assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: "", city }), false);
        assert.equal(isApprovedTester("crowdPulse", { profileId: null, city }), false);
        assert.deepEqual(
          resolveFeatureAccess({
            globalEnabled: false,
            config: { approvedProfileIds: new Set<string>(), approvedCity: "ocean city" },
            viewer: { profileId: null, city },
          }),
          { enabled: false, grant: "none" }
        );
      }
    }
  );
});

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
  assert.equal(parseApprovedProfileIds(` ${FOUNDER_PROFILE_ID} , `).size, 1);
});

test("city targeting grants access only when a city is configured", () => {
  withEnv({ NEXT_PUBLIC_FEATURE_CROWD_PULSE_CITY: "Ocean City" }, () => {
    assert.equal(hasCityTargetingConfigured("crowdPulse"), true);
    assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: OTHER_PROFILE_ID, city: "Ocean City" }), true);
    assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: OTHER_PROFILE_ID, city: "ocean city " }), true);
    assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: OTHER_PROFILE_ID, city: "Rehoboth" }), false);
    assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: OTHER_PROFILE_ID, city: null }), false);
  });
});

test("a configured city makes every authenticated profile in it an approved tester", () => {
  withEnv({ NEXT_PUBLIC_FEATURE_CROWD_PULSE_CITY: "Ocean City" }, () => {
    assert.equal(isApprovedTester("crowdPulse", { profileId: OTHER_PROFILE_ID, city: "Ocean City" }), true);
    assert.equal(isApprovedTester("crowdPulse", { profileId: OTHER_PROFILE_ID, city: "Rehoboth" }), false);
    assert.equal(isApprovedTester("crowdPulse", { profileId: null, city: "Ocean City" }), false);
    assert.equal(isFeatureEnabledForViewer("crowdPulse", { profileId: null, city: "Ocean City" }), false);
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
