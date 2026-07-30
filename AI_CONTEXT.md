# AI_CONTEXT.md

**Read this before you write a single line of code in this repository.**

This file is written for AI coding agents — ChatGPT, GitHub Copilot, Claude, Cursor, and
whatever comes next. It exists because this codebase has already been damaged by well-meaning
generated code that duplicated logic, forked the scoring engine, and broke realtime
subscriptions. The rules below are not style preferences. They are load-bearing.

Human contributors should read [`CONTRIBUTING.md`](./CONTRIBUTING.md) and
[`MASTERPLAN.md`](./MASTERPLAN.md) too. Agents must read all three.

---

## 1. Project Boundaries

**The active project is this repository checkout. Nothing outside it may be modified, ever.**

Inside this checkout, the deployable Next.js application lives in the repository-relative
**`partysafari/`** directory. That is where all feature work happens. The repository also
contains an unused root-level `src/` shadow scaffold that nothing imports and that must never
be modified.

```text
<repo root>                  ← active project boundary
├── MASTERPLAN.md            ← product constitution
├── CONTRIBUTING.md          ← engineering workflow
├── AI_CONTEXT.md            ← this file
├── package.json             ← root stub, 2 deps — NOT the app
├── src/                     ← unused shadow scaffold — nothing imports it; NEVER MODIFY
│   ├── app/dashboard/page.tsx
│   └── lib/supabase/{client,server}.ts
└── partysafari/             ← THE APPLICATION
    ├── db/                  ← SQL migrations 001 … 017
    ├── src/app/             ← Next.js App Router
    ├── src/components/
    ├── src/hooks/
    ├── src/lib/
    ├── next.config.ts
    ├── package.json         ← the real dependency manifest
    └── tsconfig.json
```

### The shadow project problem

Some local development environments have a **nested or outer "shadow" project** — a second
checkout, an enclosing workspace folder, or a duplicate `partysafari/` one directory up. In this
repository the root-level `src/` tree and root `package.json` are a vestige of that situation:
they contain an old Supabase scaffold and a dashboard stub that the real application does not
use.

The nesting also shows up in absolute filesystem paths. A Codespace commonly reports the app as
`/workspaces/partysafari/partysafari` — the repository, then the application directory inside
it. The repeated segment is not a mistake, but the absolute prefix is environment-specific.
Read such a path as the repository-relative `partysafari/` and refer to it that way.

Rules:

- **Never modify anything outside this checkout's boundaries.** No writing to parent
  directories, no `../`, no touching a sibling clone, no editing global config.
- **Make your changes beneath `partysafari/`** unless the task explicitly concerns
  repository-level documentation or configuration — the root README, the root documents, or CI
  config.
- **Never modify or extend the root-level `src/` scaffold.** Nothing imports it. Adding to it
  produces code that appears to work in an editor and ships nothing.
- **The root `package.json` is not the app's manifest.** Dependencies belong to
  `partysafari/package.json`.
- If you find yourself uncertain which copy of a file is live, check whether it is under
  `partysafari/src/` and whether anything imports it via the `@/` alias. If neither, it is dead.
- **Use repository-relative paths**, such as `partysafari/src/hooks/`. An absolute path like
  `/workspaces/partysafari/partysafari` is an artifact of one Codespace or machine, varies
  between environments, and is not a portable identifier for the project. Never anchor
  instructions, imports, or configuration to one.
- The Vercel project's Root Directory is `partysafari`. Build and lint from there.

## 2. Repository Rules

These are absolute. A change that violates one of them will be rejected in review regardless of
how well it works.

### Always inspect existing architecture before implementing

Before writing anything, read the relevant existing code. Search `partysafari/src/lib/`,
`partysafari/src/hooks/`, and `partysafari/src/components/` for the concept you are about to
build. This codebase is more complete than it first appears — scoring, live metrics, discovery,
stories, friends, RSVPs, notifications, check-ins, and map surfaces all already exist. The most
common failure mode for an AI agent here is confidently building something that is already
present two directories away.

If you cannot state, in one sentence, how your change fits the existing architecture, you have
not inspected enough.

### Never duplicate business logic

Every domain concept has exactly one implementation. Crowd level thresholds, score computation,
date formatting, Supabase client construction, error normalization — one place each, listed in
the Single Source of Truth table in `CONTRIBUTING.md`.

Copying a function into a component "to avoid touching shared code" is the single most damaging
thing you can do here. Two implementations drift, two surfaces display different numbers for the
same venue, and the product's core claim — that the score is honest — quietly stops being true.

If shared logic doesn't fit your case: **change the shared logic and update all consumers**, in
the same pull request.

### Never create parallel scoring engines

**Party Score already exists.** It lives in:

| File | Responsibility |
| --- | --- |
| `partysafari/src/lib/partyScore.ts` | The model: `PartyScoreSignals`, `PartyScoreWeights`, `PartyScoreBreakdown`, `PartyScoreDetails`, `DEFAULT_PARTY_SCORE_WEIGHTS`, `buildPartyScoreFromSignals()`, `toSafePartyScore()`, `emptyPartyScore()`, `clamp()` |
| `partysafari/src/lib/partyScoreEngine.ts` | Data gathering from Supabase, 30-second TTL cache, in-flight request de-duplication, graceful degradation via `placeholders`, `calculatePartyScore()` / `calculatePartyScores()` / `getCachedPartyScore()` |
| `partysafari/src/hooks/usePartyScore.ts` | React access: `usePartyScores()` for a set of venues, `usePartyScore()` for one |
| `partysafari/src/lib/venueCheckInUtils.ts` | Crowd level thresholds and presentation (`Quiet` / `Getting Busy` / `Busy` / `Packed`) |

**Do not write a second scoring function. Not a "simplified version for this card," not a
"quick heat calculation," not a `vibeScore`, `venueRating`, `heatIndex`, or `energyLevel`.** If a
surface needs a number describing how alive a venue is, it calls `usePartyScores`.

All future **PartySafari Intelligence (PSI)** work must **evolve this implementation**, not
replace it:

- New inputs extend `PartyScoreSignals` **and** `PartyScoreWeights` together, with a default
  weight added to `DEFAULT_PARTY_SCORE_WEIGHTS`, and are consumed inside
  `buildPartyScoreFromSignals`.
- New data sources are gathered inside `calculatePartyScores`, following the existing
  `Promise.allSettled` + `selectWithOptionalCreatedAt` pattern so a missing table or column
  degrades to a `placeholders` entry instead of throwing.
- Personalization and ranking layers consume `PartyScoreDetails` — including `breakdown`,
  `momentum`, `trend`, and `confidence` — and reorder or annotate. They do not recompute.
- Weight changes are a product decision. Document before/after behavior on real venues in the PR.

### Reuse existing hooks whenever possible

Check this table before writing a hook:

| Hook | Use it for |
| --- | --- |
| `partysafari/src/hooks/usePartyScore.ts` | Party Scores for one venue or many (`usePartyScore`, `usePartyScores`) |
| `partysafari/src/hooks/useLiveVenueMetrics.ts` | Live check-in counts, active stories, current events, friends here, crowd level |
| `partysafari/src/hooks/useDiscoverTonightData.ts` | Composed Discover Tonight data — venues, events, friends, distance, RSVP state |
| `partysafari/src/hooks/useVisibleVenueIds.ts` | IntersectionObserver tracking of which venue cards are on screen (`visibleVenueIds`, `registerVenueNode`) |
| `partysafari/src/components/stories/useStories.ts` | Story loading, viewing, and reactions |

Supporting libraries you should reuse rather than reinvent:
`src/lib/supabaseClient.ts` (`createSupabaseBrowser`, `resolveCurrentUserId`),
`src/lib/supabaseDiagnostics.ts` (`logSupabaseQueryError`, `normalizeUnknownError`,
`isAuthLockAbortError`), `src/lib/activityFeed.ts`, `src/lib/stories.ts`,
`src/lib/friendSync.ts`, `src/lib/eventDateFormatter.ts`, `src/lib/venueCheckInUtils.ts`.

Note that `usePartyScores` and `useLiveVenueMetrics` both accept `venueIds`, `visibleVenueIds`,
`enabled`, and `subscribeVisibleOnly`. Use those options instead of writing new gating logic.

### Preserve UI contracts whenever possible

A component's props are a contract with every call site.

- **Add optional props with defaults.** Never make an existing prop required.
- **Never rename or remove a prop** without updating every consumer in the same change.
- **Never change the meaning of a prop** while keeping its name — that is worse than a rename,
  because it fails silently.
- **Preserve callback signatures** (`onCheckedIn`, `onCountChange`, and friends).
- **Keep exported type names stable.** Other modules import them with `import type`.
- **Do not restructure a component's DOM or class names** as a side effect of a logic change.
  Styling elsewhere may depend on it, and it makes the diff unreviewable.
- **Do not "improve" unrelated components** while implementing a feature. Stay in scope.

### Avoid breaking realtime subscriptions

Realtime is the product. It is also the most fragile part of this codebase, and it is
implemented across roughly two dozen files using Supabase `postgres_changes` channels — check-in
buttons, event pages, friends, messages, notifications, the radar experience, stories, RSVP
controls, and the venue detail pages all subscribe.

Hard rules:

- **Every `supabase.channel(...)` must be removed on unmount** via `supabase.removeChannel(...)`
  in the effect's cleanup function. A leaked channel accumulates per navigation and eventually
  exhausts the connection limit.
- **Channel names must be unique per subscription target** — the existing convention is
  `` `venue-checkins-${venueId}` ``. Two components sharing a channel name will fight.
- **Never create a channel outside a `useEffect`** or in a render path.
- **Always obtain the client from `createSupabaseBrowser()`.** It manages a global singleton, a
  single auth-state listener, and the realtime kill switch. Constructing your own
  `createBrowserClient` breaks all three.
- **Respect `TEMP_KILL_SWITCH`** in `partysafari/src/lib/runtimeKillSwitch.ts`. Flags such as
  `disableSupabaseRealtime`, `disablePartyScorePolling`, `disableLiveFeedPolling`,
  `disableNotificationRealtime`, and `disablePresenceTracking` exist so a runaway subscription
  can be contained in production. New live features check the relevant flag.
- **Scope subscriptions to what the user can see.** Use `useVisibleVenueIds` and pass
  `subscribeVisibleOnly` rather than subscribing to every row in a list.
- **A new table that must stream requires a realtime publication entry** in its migration.
  Follow the pattern in `partysafari/db/017_discover_tonight_stabilization.sql`.
- **Test realtime by navigating away and back.** Duplicate updates or console errors after
  navigation mean a subscription leaked.

### Favor adapters over rewrites

When existing code does not quite fit, the correct move is almost always an adapter — a thin
layer that translates between what exists and what you need — not a replacement.

- Need a different shape from the Party Score? Write a mapping function over
  `PartyScoreDetails`.
- Need different behavior from a hook? Add an option to it, or wrap it in a narrower hook that
  calls it.
- Need a different card layout? Add a variant prop or compose the existing card.

Rewrites are permitted only when explicitly requested by a human maintainer, scoped to a single
PR, and accompanied by removal of the old implementation and migration of every call site. An
agent must never decide on its own that a module should be rewritten.

### Protect mobile performance

The target device is a mid-range phone on weak LTE at midnight. Assume every regression you
introduce will be experienced outdoors on 20% battery.

- **Batch queries.** Fetch for a set of venue ids with `.in(...)`; never one request per card.
- **Use `Promise.allSettled`** for independent queries so a single failure does not cascade.
- **Respect the caches.** Party Scores are cached for 30 seconds and concurrent identical
  requests are de-duplicated. Do not add `forceRefresh: true` to routine reads.
- **No work in render.** Derive with `useMemo`; stabilize callbacks with `useCallback` when they
  feed effects.
- **Guard effect dependencies.** Unstable array/object identities cause runaway effect loops —
  this codebase has instrumentation (`radarTrace`, `probable-infinite-effect-loop`) precisely
  because that has happened before.
- **Dynamically import heavy client components** — Leaflet maps, story viewers, anything large.
- **Reserve layout space** for live-updating numbers so they don't cause layout shift.
- **Add no dependency** without explicit human approval. Bundle size is a product constraint.
- **Honor `prefers-reduced-motion`**, as the crowd-level utilities already do.

### Protect Vercel deployments

The app deploys to Vercel with **Root Directory set to `partysafari`**.

- **`npm run build` must pass from `partysafari/`.** Verify before you claim a task is done.
- **Never disable type checking or ESLint** in `next.config.ts` to force a green build.
- **Never edit `next.config.ts`** without explicit instruction. It contains deliberate
  `turbopack.root`, `outputFileTracingRoot`, and Tailwind resolution settings that exist to keep
  the nested-directory layout building correctly. Breaking them breaks deployment in ways that
  do not reproduce locally.
- **Never commit `.env`, `.env.local`, `node_modules/`, or `.next/`.**
- **All client-visible configuration must be `NEXT_PUBLIC_*`** and must be assumed possibly
  undefined in Preview environments. Never put a service-role key in a `NEXT_PUBLIC_*` variable.
- **Assume every PR gets a preview deployment.** Do not merge on a red preview.

### Always prefer backwards compatibility

Every change should be safe to deploy while the previous version is still running in users'
browsers and while the previous schema may still be live.

- **Migrations are additive and idempotent.** New numbered file in `partysafari/db/`, guarded
  with `IF NOT EXISTS` / `DROP POLICY IF EXISTS`. Never edit an applied migration.
- **Expand, migrate, contract.** Add the new column, backfill, ship code that reads both, and
  only remove the old column in a later release.
- **Tolerate missing data.** `partyScoreEngine.ts` already queries with an optional `created_at`
  and falls back when the column is absent. New code holds the same standard.
- **Keep exported function signatures stable.** Add optional parameters; do not reorder or
  remove existing ones.
- **Keep route paths stable.** Renaming a route breaks shared links, which for a
  word-of-mouth-driven local app is a real cost.
- **Default new behavior to off** when it changes an established interaction.

## 3. When Implementing New Features

Follow this sequence. Do not skip steps, and do not start at step 5.

1. **Read `MASTERPLAN.md`.** Understand the mission, the product pillars, the Ocean City launch
   context, and the Founder Test. If the feature fails the Founder Test — "would a founding user
   in Ocean City actually use this tonight?" — say so before building it. Check whether Launch
   Lock is in effect; if it is, only bug fixes and polish may proceed.
2. **Read `CONTRIBUTING.md`.** Follow the git workflow, the naming conventions, the TypeScript
   requirements, the Definition of Done, and Conventional Commits.
3. **Read `AI_CONTEXT.md`** — this file — and then inspect the actual code the feature touches.
   Identify which existing hooks, libraries, components, and tables are already involved.
4. **Explain your implementation plan before modifying code.** State: which files you will
   change and why; which existing hooks and libraries you will reuse; what data you will read or
   write; whether a migration is needed; which realtime subscriptions are affected; what could
   break. Wait for confirmation on anything ambiguous. An agent that starts editing before
   explaining will produce a diff nobody can review.
5. **Make small commits.** One logical change each, Conventional Commits format, explaining why
   in the body. A feature is a sequence of small commits, not one large one.
6. **Keep the application deployable after every commit.** `npm run build` and `npm run lint`
   pass from `partysafari/` at every point in the history. Schema before code. No commit that
   leaves `main` — or the branch — in a broken state, because someone may need to cut a release
   from it at any time.

## 4. Quick Orientation

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript 5 strict · Tailwind CSS v4 ·
Supabase (Postgres, Auth, Realtime) · Leaflet + react-leaflet · ESLint 9 flat config · Vercel.

**Key routes** (`partysafari/src/app/`): `/` · `/dashboard` · `/events` · `/events/[id]` ·
`/events/create` · `/feed` · `/friends` · `/map` · `/messages` · `/profiles` · `/profiles/[id]` ·
`/profile/edit` · `/radar` · `/requests` · `/safari` · `/venues/[slug]` · `/venue-owner` ·
`/login` · `/signup`.

**Key surfaces:** `components/discover/DiscoverTonightExperience.tsx`,
`components/discover/VenuePartyCard.tsx`, `components/radar/SafariRadarExperience.tsx`,
`components/live/LivePartyModeBoard.tsx`, `components/TonightNearMeMap.tsx`,
`components/stories/*`, `components/social/*`, `components/venue-owner/EventsManager.tsx`.

**Database:** `partysafari/db/001_*.sql` through `017_discover_tonight_stabilization.sql`,
applied in numeric order. Core tables include `venues`, `events`, `event_rsvps`,
`event_comments`, `venue_checkins`, `stories`, `story_reactions`, `friendships`, `follows`,
`saved_events`, `activity_feed`, and `notifications`. Row Level Security is enabled everywhere.

**Diagnostics:** `radarTrace` instrumentation in the hooks logs effect churn in development and
warns on `probable-infinite-effect-loop`. `partysafari/src/lib/supabaseDiagnostics.ts`
normalizes and logs query failures. `partysafari/src/components/GlobalRuntimeKillSwitch.tsx`
plus `src/lib/runtimeKillSwitch.ts` provide emergency containment for runaway realtime, timers,
and polling. If you see these, they are deliberate — do not remove them.

## 5. Hard Stops

Never do any of the following without explicit human instruction:

- Modify anything outside this repository checkout.
- Modify the unused root-level `src/` shadow scaffold.
- Add, remove, or upgrade a dependency.
- Edit `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, or `postcss.config.mjs`.
- Edit or delete an existing migration in `partysafari/db/`.
- Create a second scoring implementation.
- Disable type checking, linting, or an existing kill switch.
- Delete or rewrite a module rather than adapting it.
- Commit secrets, keys, or `.env*` files.
- Push directly to `main`, force-push a shared branch, or merge your own pull request.
- Approve a pull request. Agents create and comment; humans approve.
