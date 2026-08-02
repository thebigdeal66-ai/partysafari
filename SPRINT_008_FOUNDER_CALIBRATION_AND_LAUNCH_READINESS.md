# Sprint 008 — Founder Calibration & Launch Readiness

**Status: planning and documentation only.** No application code, no migrations, and no deployments are part of this sprint. This document exists to turn four sprints of dark-shipped, unvalidated-against-real-traffic intelligence features (Party Score, PSI, Lit Button, Crowd Pulse, AI Discover Cards) into a founder-driven calibration and phased rollout process.

## Why this sprint exists

Every intelligence feature shipped so far was built and unit-tested against synthetic fixtures, not real Ocean City nightlife. That's the correct order of operations — get the architecture and privacy guarantees right before spending real usage on it — but it leaves every numeric constant in the system in the same state: internally consistent, individually justified, and **empirically unverified**. The code itself says so in multiple places already:

- Party Score's own weight table carries a comment that `litSignals`, `recentLitSignals`, and `litMomentum` are "unproven against real traffic: revisit after a week of Founding cohort data before treating these three as tuned" ([`partyScore.ts`](https://github.com/thebigdeal66-ai/partysafari/blob/main/partysafari/src/lib/partyScore.ts)).
- Crowd Pulse's `intensityReference` is explicitly commented as a "PROVISIONAL BETA CALIBRATION CONSTANT. Estimated, not measured. Retune from observed Ocean City activity before any public rollout" ([`crowdPulse.ts`](https://github.com/thebigdeal66-ai/partysafari/blob/main/partysafari/src/lib/crowdPulse.ts)).
- AI Discover Cards' PR #9 review closed with three explicitly unresolved calibration risks: `explodingMinScore`, `hiddenGemMinScore`, and `worthDrivingMinScore` are "reasoned rather than measured," and `worthDrivingMinMomentum: 0` is "nearly vacuous."

This sprint's job is to give the Founder cohort a structured way to generate the real data these constants need, and a concrete plan for what happens with that data at each rollout stage — without touching a single line of the calculation code itself.

---

## 1. Calibration Guide

### 1.1 Party Score

**Canonical weight table** (`DEFAULT_PARTY_SCORE_WEIGHTS` in [`partyScore.ts`](https://github.com/thebigdeal66-ai/partysafari/blob/main/partysafari/src/lib/partyScore.ts)) — this is the single source every downstream feature (PSI, Crowd Pulse, AI Discover) reads from, so calibrating it once calibrates all four:

| Signal | Weight | Calibration status |
|---|---|---|
| `liveCheckins` | 0.34 | Baseline, unflagged |
| `activeStories` | 5.4 | Baseline, unflagged |
| `storyReactions` | 1.2 | Baseline, unflagged |
| `activeEvents` | 8.6 | Baseline, unflagged |
| `friendPresence` | 9.2 | Baseline, unflagged — highest single weight in the table |
| `goingRsvps` / `interestedRsvps` | 0.24 / 0.10 | Baseline, unflagged |
| `recentActivity`, `recentCheckins`, `recentStories`, `recentStoryReactions`, `recentRsvpActivity`, `recentEventActivity`, `recentFriendActivity` | 0.9 – 2.4 | Baseline, unflagged |
| `scoreDeltaMomentum` | 2.6 | Baseline, unflagged |
| `litSignals` | 1.6 | **Explicitly flagged unproven in code** |
| `recentLitSignals` | 2.6 | **Explicitly flagged unproven in code** |
| `litMomentum` | 3.4 | **Explicitly flagged unproven in code** |

**Confidence formula:** `0.35 + (availableSources/7)*0.4 + (activeSources/7)*0.25` — a floor of 0.35 even with zero data, rising with both data availability and activity. This formula has not been validated against whether founders' subjective "does this score feel right" judgment tracks rising confidence — that's a direct calibration question for the Founder Testing Checklist (§2).

**What to calibrate:** whether the *relative* weight of Lit endorsements (1.6, roughly 4.7× a single check-in's 0.34) matches what founders observe — does one enthusiastic Lit tap actually carry that much more signal than one check-in, or is it currently over/under-weighted? This is the single highest-leverage calibration question in the whole system, because Lit's three weights cascade into PSI's reason attribution, Crowd Pulse's `weightKeys` mapping, and AI Discover's `litReference` normalization — all four features move together when this number moves.

### 1.2 PSI (`psi.ts`)

Three thresholds gate what becomes a visible "why" sentence:

| Constant | Value | What it controls |
|---|---|---|
| `MIN_REASON_POINTS` | 1 | A signal must move the score by at least 1 point to earn a sentence — filters out true noise |
| `MAX_REASONS` | 3 | More than three reasons "stops reading like an explanation and starts reading like a dump" (in-code comment) |
| `SURGE_MOMENTUM` | 12 | Momentum this strong while the score is still low means "the room is ahead of the number" |
| `QUIET_SCORE_CEILING` | 25 | Below this, a venue hasn't established itself yet |

PSI never forks Party Score's math — every reason is `signal value × the canonical weight`, checked against the engine's own breakdown in unit tests. This means **PSI calibration is not a separate exercise from Party Score calibration** — retuning the weight table automatically retunes which reasons surface and in what order. The only PSI-specific calibration question is whether `MAX_REASONS: 3` and `QUIET_SCORE_CEILING: 25` match founders' intuition for "how much explanation is enough" and "when does a venue stop feeling quiet."

### 1.3 Lit Button

Lit's own gating (referenced in the Party Score weight comment): a Lit endorsement is gated on a check-in from the last 90 minutes and capped at one per venue per hour. This means ten Lit signals in an hour genuinely represents ten distinct people, not one enthusiastic person tapping repeatedly — an important fact for founders to understand when judging whether the weight "feels right," since the raw count is already a de-duplicated proxy for headcount, not a raw tap count.

### 1.4 Crowd Pulse (`crowdPulse.ts`)

| Constant | Value | Status |
|---|---|---|
| `binSizeDegrees` | 0.005° (~440–555m at Ocean City's latitude) | Reasoned from map scale, not measured |
| `minContributors` | 3 | Privacy floor — MASTERPLAN calls this non-negotiable, not a tuning target, though the exact number (3 vs. 4 or 5) is open |
| `decayHalfLifeMinutes` | 30 | Deliberately longer than Lit's 20-minute half-life ("a check-in is a weaker, more durable signal than an endorsement" — in-code rationale) |
| `signalWindowMinutes` | 120 | Hard cutoff — signals older than 2 hours never contribute |
| `intensityReference` | 40 | **Explicitly marked provisional beta calibration constant in code** — this is the main calibration target |
| `quietCeiling` / `buildingCeiling` / `busyCeiling` | 0.2 / 0.45 / 0.75 | Downstream of `intensityReference`; move together with it |

**What to calibrate:** with only 4 venues in production today, `intensityReference: 40` was picked with no real distribution to measure against. The calibration guide's job at Founder-rollout time is to log the actual raw weighted-intensity values Crowd Pulse computes on real nights (even while the feature stays flag-gated off from public view) and set `intensityReference` to whatever value makes the busiest real observed night land around "busy," not "peak" — see §3 for the specific procedure.

### 1.5 AI Discover Cards (`discoverIntelligence.ts`)

| Constant | Value | Status |
|---|---|---|
| `explodingMinScore` / `explodingMinMomentum` | 55 / 12 | Reasoned, not measured |
| `gettingBusyMinCheckins/MaxCheckins` | 10 / 39 (reused from `CROWD_THRESHOLDS.gettingBusy`) | Reused, not new — inherits whatever calibration `CROWD_THRESHOLDS` itself gets |
| `gettingBusyMinMomentum` | 4 | Reasoned, not measured |
| `friendsMinPresent` | 1 | Definitional, not really a tuning target |
| `liveMusicEventTypes` | `["dj", "band", "live_music"]` | Coverage-limited by free-text `event_type` data hygiene, not a numeric constant |
| `hiddenGemMinScore` / `hiddenGemMaxCheckins` / `hiddenGemMaxStories` | 30 / 25 / 2 | Reasoned, not measured |
| `worthDrivingMinMiles` / `MaxMiles` / `MinScore` / `MinMomentum` | 3 / 25 / 45 / 0 | `MinMomentum: 0` flagged in PR #9 review as "nearly vacuous" — real gating is the score floor |
| `priorityWeights` | activeEvent 3, momentum 2.5, proximity 2, friends 1.6, lit 1.2, stories 0.8 | Reasoned ordering, not measured against founder judgment |
| `maxVenuesPerCard` | 4 | UI-driven, not a signal-quality constant |

**What to calibrate:** every score floor here (`explodingMinScore: 55`, `hiddenGemMinScore: 30`, `worthDrivingMinScore: 45`) is a threshold against Party Score, which is itself uncalibrated on the Lit weights. Calibrating AI Discover Cards is therefore a second-order exercise — it should happen *after* Party Score's Lit weights are adjusted from Founder data, not simultaneously, or the two calibration passes will chase each other.

### 1.6 Calibration ordering (do these in sequence, not in parallel)

1. Party Score weights (especially the three Lit weights) — everything else reads this table.
2. PSI's `MAX_REASONS`/`QUIET_SCORE_CEILING` — quick to re-check once Party Score settles, likely needs no change.
3. Crowd Pulse's `intensityReference` and level ceilings — independent of Party Score's absolute scale, but needs real multi-night data to set.
4. AI Discover's score floors (`explodingMinScore`, `hiddenGemMinScore`, `worthDrivingMinScore`) and `worthDrivingMinMomentum` — last, because these are thresholds against an already-recalibrated Party Score.

---

## 2. Founder Testing Checklist

A Founder is asking three questions every time they open the app during this sprint: *does this match what I see with my own eyes, does this explain itself, and does it ever lie to me.* The checklist operationalizes that.

### Per-session checklist (every time a Founder visits a venue)

- [ ] Open the venue in-app *before* walking in. Note the displayed Party Score, crowd level, and any AI Discover card it appears under (if the flag is enabled for you).
- [ ] Walk in. Do a gut-check headcount (rough — "quiet," "a few dozen," "packed").
- [ ] Does the app's crowd level (`Quiet`/`Getting Busy`/`Busy`/`Packed`) match your gut-check? Record yes/no and, if no, which direction it was wrong.
- [ ] If a PSI "Why this venue?" explanation was shown, does each bullet match something you can verify (an event is actually happening, you can actually see friends, the room does feel like it's filling)? Record any reason that felt fabricated or stale.
- [ ] If you tap Lit, does the score/level update in a way that feels proportionate (not a spike from one tap, not invisible)?
- [ ] If an AI Discover card labeled the venue (Exploding/Getting Busy/Friends Are Here/Live Music/Hidden Gem/Worth Driving To), does the label match your gut-check? Specifically flag any "Exploding" or "Getting Busy" label on a venue that felt flat in person — these are the two claim-safety-sensitive categories per the PR #9 review.
- [ ] Note the local time and rough weather/day-of-week context — Ocean City nightlife is seasonal and night-of-week dependent, and constants tuned on a Tuesday in the shoulder season will not hold on a Saturday in peak season.

### Per-night checklist (end of a testing night, across all venues visited)

- [ ] Did any two venues you visited get the same AI Discover label when they clearly felt different in person? (Tests deduplication/precedence quality, not just per-venue accuracy.)
- [ ] Did any venue with almost no visible activity get labeled "Hidden Gem"? (Direct claim-safety check from the PR #9 review — a low-data venue must not be mistaken for an undiscovered one.)
- [ ] Did Crowd Pulse (if visible to you) match the actual energy distribution across the area you walked through?
- [ ] Did anything feel "uncanny" — technically accurate but described in a way that felt like a machine talking, not a friend explaining? Note the exact wording.

### Weekly checklist (Founder cohort lead, aggregating across all founders)

- [ ] Collect all per-session "no" answers and group by category (crowd-level mismatch, PSI reason mismatch, Lit responsiveness, AI Discover label mismatch).
- [ ] For each group, identify whether the mismatch points at a specific constant (see §1 tables) or a data-completeness gap (e.g. `event_type` free text causing Live Music misses).
- [ ] Feed findings into the threshold tuning plan (§3) before the next rollout stage gate.

---

## 3. Threshold Tuning Plan (Based on Real Ocean City Activity)

This plan assumes the calibration ordering from §1.6 and turns the Founder checklist's qualitative "yes/no" data into specific constant changes — proposed as follow-up PRs, not applied in this sprint.

### Step 1 — Instrument before tuning

Before any constant changes, ensure the telemetry in §6 is live for at least one full weekend (Friday + Saturday night) of Founder-cohort usage. Tuning against fewer than ~2 real nights of data risks overfitting to one unusual night.

### Step 2 — Party Score weight pass

- Pull the raw signal inputs and resulting scores for every Founder-visited venue-night pair.
- Cross-reference against the Founder checklist's gut-check crowd level for that same visit.
- If Lit-weighted venues are systematically scoring higher or lower than their gut-check level relative to non-Lit-heavy venues, adjust `litSignals`/`recentLitSignals`/`litMomentum` proportionally (keep the *ratio* between the three intact unless a specific one is clearly the outlier — they were designed as a coherent trio).
- Re-run the full Party Score/PSI/Crowd Pulse/AI Discover test suites after any weight change — all four suites cross-reference the same weight table, so a change here is the one edit that touches every downstream test file.

### Step 3 — Crowd Pulse `intensityReference` pass

- Take the raw weighted-intensity values Crowd Pulse computed (even while flag-gated off — the pure calculation can still run and log in a backend job or founder-only debug view without exposing the UI) across the Step 1 data window.
- Set `intensityReference` so that the busiest real cell on the busiest real night lands at or just above `busyCeiling` (0.75), not at `1.0` — leaving headroom for a night busier than anything observed so far, consistent with the "no signal ever precisely maxes out" spirit of the privacy design.
- Re-check `quietCeiling`/`buildingCeiling` proportionally; they were set as fractions of `intensityReference`, so they may not need independent changes.

### Step 4 — AI Discover score-floor pass (last, only after Steps 2–3 are done)

- Re-run `explodingMinScore`, `hiddenGemMinScore`, and `worthDrivingMinScore` against the *recalibrated* Party Score output from Step 2.
- Specifically target the two flagged risks from the PR #9 review: confirm `worthDrivingMinMomentum: 0` is still nearly vacuous after recalibration (if so, consider whether a small positive floor, e.g. requiring non-negative trend rather than just non-negative momentum, better serves the claim-safety goal — this would be a follow-up PR, not this sprint) and confirm `gettingBusyMinMomentum: 4` still excludes the documented residual gap (mildly negative delta, −1 to −3, still passing the momentum floor) or whether real data shows this gap is rare enough to defer indefinitely.
- Re-verify precedence order (Exploding → Friends → Live Music → Getting Busy → Hidden Gem → Worth Driving To) still produces sensible single-category placement on real venues, not just synthetic fixtures.

### Step 5 — Freeze and document

Once a tuning pass is accepted, update the in-code comments (following the existing convention — e.g. `crowdPulse.ts`'s "PROVISIONAL BETA CALIBRATION CONSTANT" comment) to record the new value, the date, and the Founder-data window it was tuned against, so the *next* retuning pass knows what data justified the current number rather than re-deriving it from scratch.

---

## 4. Rollout Plan

Five stages, gated on the previous stage's success metrics (§5) before advancing. No stage flips a flag on for a broader audience than the plan specifies.

### Stage 1 — Internal testing

- **Audience:** engineering/product only (no real Founders yet).
- **Flags:** `crowdPulse` and `aiDiscoverCards` may be flipped on for internal accounts only (via whatever narrow per-account override the flag system supports — if the current `featureFlags.ts` has no per-account override, that's a small prerequisite piece worth flagging to engineering before Stage 2, not something to build in this documentation-only sprint).
- **Purpose:** confirm nothing crashes, confirm the manual visual-review checklist items (no overflow, no overlap, reduced motion, keyboard/screen-reader labels) hold on real devices, not just Vercel previews.
- **Duration:** short — days, not weeks. This stage exists to catch integration bugs, not to calibrate anything.

### Stage 2 — Founder-only rollout

- **Audience:** the Founder cohort (per MASTERPLAN's existing Phase 1 structure).
- **Flags:** `aiDiscoverCards` on for Founders; `crowdPulse` on for Founders (feeding AI Discover's corroboration bonus) but its UI surface (the `/radar` heat overlay) can stay off if the UI wiring for that surface isn't built yet — Crowd Pulse's *calculation* being live for AI Discover's internal use is independent from its own map UI being visible.
- **Purpose:** run the full Founder Testing Checklist (§2) across enough real nights to execute the Threshold Tuning Plan (§3).
- **Exit criteria:** at least one full weekend of checklist data collected, Step 2–4 tuning passes proposed (as follow-up PRs) and reviewed.

### Stage 3 — Beta venues

- **Audience:** a small set of opted-in venue owners/staff beyond the Founder cohort, per MASTERPLAN's existing venue-ownership model.
- **Flags:** same flags, same on-state, now visible to venue owners specifically so they can sanity-check whether their own venue's score/label matches their internal knowledge (a venue owner has ground truth a founder walking by doesn't — actual door count, actual event bookings).
- **Purpose:** validate against a second, independent source of ground truth (venue operators) before any public-facing exposure. Also the first stage where "Worth Driving To" and "Hidden Gem" claims about a *specific* venue reach that venue's own owner — a natural check against reputational risk from a mislabeled venue.
- **Exit criteria:** no unresolved venue-owner complaint about a specific mislabeling; threshold tuning from Stage 2 has been applied and re-validated.

### Stage 4 — Ocean City launch

- **Audience:** general public, Ocean City only (MASTERPLAN's existing Phase 1 geographic scope).
- **Flags:** `aiDiscoverCards` and `crowdPulse` both flip to public-default-on for the Ocean City user base specifically (if the flag system supports geographic scoping; otherwise, on for everyone, since the product itself is Ocean-City-only at this stage per PROJECT_INDEX).
- **Purpose:** the actual public debut of "this app understands what's happening tonight" — the sprint's primary objective, now backed by two calibration passes and two independent ground-truth checks (Founders, venue owners).
- **Exit criteria:** the success metrics in §5 for this stage are met for a sustained period (not just opening weekend, which will be anomalously high-traffic).

### Stage 5 — Regional expansion

- **Audience:** additional Delaware/Maryland beach towns beyond Ocean City (natural adjacency, consistent with the product's regional nightlife framing).
- **Flags:** same flags, now must be re-validated against a *new* city's venue density and signal volume before assuming Ocean-City-tuned constants transfer — a smaller or larger town will shift `intensityReference`, `binSizeDegrees` may need revisiting if venue density is very different, and score floors may need a second calibration pass specific to the new city.
- **Purpose:** prove the intelligence layer generalizes, not just that it was correctly tuned for one town.
- **Exit criteria:** a repeat of the Stage 2 Founder-checklist process for the new city, since "worked in Ocean City" is not evidence it works elsewhere.

---

## 5. Success Metrics Per Stage

| Stage | Primary metric | Supporting metrics | Guardrail metric |
|---|---|---|---|
| 1. Internal testing | Zero crashes/console errors across target devices | Visual QA checklist 100% pass (no overflow/overlap, reduced-motion respected, keyboard/screen-reader labels present) | N/A (no real users yet) |
| 2. Founder-only | Founder checklist "match" rate (gut-check agrees with app) ≥ 80% for crowd level | PSI reason accuracy rate; Lit responsiveness rated "proportionate" by ≥ 80% of founders | Zero "Exploding"/"Getting Busy" labels on venues founders rate as flat (claim-safety guardrail — any occurrence is investigated, not just counted) |
| 3. Beta venues | Venue-owner-reported label accuracy ≥ 85% for their own venue | Number of distinct venues with at least one owner check-in on accuracy | Zero unresolved venue-owner disputes about a specific mislabel at stage exit |
| 4. Ocean City launch | Discover Tonight session-to-venue-visit conversion (does seeing a card correlate with an eventual check-in/RSVP at that venue) | Time-to-first-card-interaction; "Why this venue?" expand rate (proxy for whether users trust/want the explanation) | Card mislabel complaint rate per 1,000 sessions stays flat or improves week over week, not rising as traffic scales |
| 5. Regional expansion | Same conversion metric as Stage 4, measured independently per new city | Constant-transfer delta (how much did `intensityReference`/score floors have to move from the Ocean City values) | Founder-checklist match rate in the new city reaches the same ≥ 80% bar before public flag flip in that city |

Note on the Stage 4/5 conversion metric: this requires connecting Discover Tonight card impressions to downstream check-in/RSVP events, which is a telemetry requirement (§6), not something the current codebase logs today.

---

## 6. Telemetry and Analytics to Collect

None of the following exists yet in the codebase (confirmed: no analytics/telemetry library or event-logging call sites were found in `partyScoreEngine.ts`, `psi.ts`, `crowdPulse.ts`, or `discoverIntelligence.ts`). This section is a requirements list for a future instrumentation sprint, not a claim that it's already wired up.

### Event-level (per interaction)

- Discover Tonight card impression: which category, which venue, at what score/intensity/momentum values, whether Crowd Pulse corroboration applied.
- Card interaction: expand "Why this venue?", tap through to venue detail, tap through to check in/RSVP from a card.
- Lit Button tap: venue, resulting score delta, time since last check-in (to validate the 90-minute gate is behaving as expected in practice).
- Crowd Pulse cell view (once any UI surface exists): which cell, at what intensity/level, whether the user's own subsequent check-in fell inside that cell (a natural, low-effort ground-truth signal — did the "hot" cell's own visitors agree it was hot).

### Session-level

- Time from opening Discover Tonight to first venue-related action (check-in, RSVP, Lit tap) — the primary "does this feel useful fast" proxy.
- Whether a session included any AI Discover Card interaction at all vs. only using the raw venue list (adoption signal for the new feature specifically).

### Aggregate/nightly rollups (for the tuning plan in §3)

- Distribution of raw Party Score values and raw Crowd Pulse weighted-intensity values across all venues/cells, per night — this is the actual dataset the tuning plan's Steps 2–3 need, and does not exist without this instrumentation.
- Category assignment counts per night (how many venues got each AI Discover label) — a sudden shift after a threshold change is the fastest regression signal available.
- Placeholder/degraded-data rate (how often `partyScoreEngine.ts`'s `Promise.allSettled` fallback fires) — a rising rate signals a Supabase reliability issue independent of calibration.

### Explicit non-goals for telemetry

Per every privacy guarantee already established for Crowd Pulse and PSI: no telemetry event should carry a raw user ID alongside a location/venue pairing in any analytics sink that isn't already covered by the app's existing Supabase RLS/privacy model. Aggregate counts and anonymized/hashed identifiers (the same `anonymizeContributor`-style pattern Crowd Pulse core already uses) are sufficient for every metric above — this sprint does not require or recommend adding any new form of individual tracking.

---

## 7. Feature Flag Enablement Recommendations

Current state on `main` (both confirmed `false` as of this sprint's start):

| Flag | Current default | Recommended first enablement | Condition |
|---|---|---|---|
| `crowdPulse` | `false` | Stage 1 (internal accounts only) | No condition beyond passing internal QA — it's a read-only calculation with a hard privacy floor already built in, so the risk of early internal enablement is low |
| `aiDiscoverCards` | `false` | Stage 1 (internal accounts only), then Stage 2 (Founder cohort) | Should not reach Founders until the claim-safety fixes already landed in PR #9's review are confirmed present on `main` (they are — the "Getting Busy" trend-guard fix merged in commit `9890037f91f94e57486a15b446ccf39288464b5d`) |

**Recommended sequencing (do not enable both simultaneously for a new audience without this order):**

1. `crowdPulse` first, alone, at each new audience tier — because AI Discover's corroboration bonus depends on Crowd Pulse data, verifying Crowd Pulse's own output looks sane *before* AI Discover starts consuming it makes any AI Discover anomaly easier to attribute (calculation-layer bug vs. corroboration-layer bug).
2. `aiDiscoverCards` second, at the same audience tier, once Crowd Pulse has run cleanly for at least a few days at that tier.
3. Never flip a flag to public-default-on (Stage 4+) without a completed Founder-checklist cycle (§2) and at least one applied threshold-tuning pass (§3) for the categories most likely to misfire on real data — specifically Exploding Right Now and Getting Busy, since these are the two categories the PR #9 claim-safety review treated as highest-risk for false positives.
4. If a per-account or per-city flag override does not currently exist in `featureFlags.ts` (it does not, as of this sprint — the flags are global booleans), building that scoping mechanism is a prerequisite *engineering* task for Stage 1, and should be scoped as its own small PR before Stage 2 begins, not bundled into a larger change.

---

## Summary

Every intelligence feature built in Sprints 002–007 is architecturally sound and internally consistent, but every numeric constant governing what counts as "exploding," "hot," "hidden," or "worth the drive" is an engineering estimate, not a measurement — and the code says so in its own comments. This sprint's calibration guide, founder checklist, tuning plan, rollout plan, success metrics, telemetry requirements, and flag sequencing turn that gap into a concrete, ordered process: calibrate Party Score's weight table first since everything else reads it, validate with Founders before venue owners before the public, and never advance a stage without the previous stage's specific exit criteria met. No code, migrations, or deployments were part of producing this plan.
