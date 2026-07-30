# Contributing to PartySafari

Engineering workflow, standards, and release process. Read
[`MASTERPLAN.md`](./MASTERPLAN.md) first — it explains *why* the product is built the way it is.
This document covers *how* we build it.

---

## Repository Layout

The deployable Next.js application lives in the repository-relative **`partysafari/`**
directory. The repository also carries an unused root-level `src/` shadow scaffold that nothing
imports:

```text
.
├── MASTERPLAN.md            # Product constitution
├── CONTRIBUTING.md          # This file
├── AI_CONTEXT.md            # Rules for AI coding agents
├── src/                     # Unused shadow scaffold — nothing imports it; never modify
└── partysafari/             # The application
    ├── db/                  # Numbered SQL migrations (001 … 017)
    ├── src/
    │   ├── app/             # Next.js App Router routes
    │   ├── components/      # Shared and feature components
    │   ├── hooks/           # Reusable React hooks
    │   └── lib/             # Business logic, Supabase clients, scoring
    ├── eslint.config.mjs
    ├── next.config.ts
    ├── package.json
    └── tsconfig.json
```

All commands below are run from `partysafari/` unless stated otherwise.

Two rules follow from this layout:

- **Make changes beneath `partysafari/`** unless the task explicitly concerns repository-level
  documentation or configuration — the root README, these root docs, or CI config.
- **Never modify the root-level `src/` scaffold.** It ships nothing; editing it produces code
  that looks live in an editor and never reaches users.

Refer to locations with repository-relative paths such as `partysafari/src/lib/` rather than
absolute filesystem paths. An absolute path like `/workspaces/partysafari/partysafari` is
specific to one Codespace or machine, varies between environments, and is not a portable
identifier for the project.

## Getting Started

```bash
cd partysafari
npm install
cp .env.local.example .env.local   # if present; otherwise create it
npm run dev                        # http://localhost:3000
```

Required environment variables:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key |

Never commit `.env` or `.env.local`. Never place a service-role key in any `NEXT_PUBLIC_*`
variable or in client-reachable code.

Available scripts:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local dev server (webpack) |
| `npm run build` | Production build — must pass before every PR |
| `npm run start` | Serve the production build locally |
| `npm run lint` | ESLint 9 flat config |

## Git Workflow

### Feature branches only — never commit directly to `main`

`main` is protected and always deployable. Every change arrives through a pull request.

```bash
git checkout main
git pull origin main
git checkout -b feat/lit-button
# ... work, committing in small increments ...
git push -u origin feat/lit-button
```

### Branch naming

`<type>/<short-kebab-description>`, using the same types as our commit convention:

| Prefix | Use |
| --- | --- |
| `feat/` | New user-facing capability |
| `fix/` | Bug fix |
| `perf/` | Performance work |
| `refactor/` | Internal restructuring, no behavior change |
| `docs/` | Documentation only |
| `chore/` | Tooling, dependencies, housekeeping |

Good: `feat/crowd-pulse-heat-layer`, `fix/party-score-cache-invalidation`.
Bad: `updates`, `johns-branch`, `fix2`.

### Keeping a branch current

Rebase onto `main` rather than merging `main` in, so history stays linear and reviewable:

```bash
git fetch origin
git rebase origin/main
```

Never force-push a branch someone else is reviewing or building on without telling them.

## Commit Message Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/).

```text
<type>(<optional scope>): <imperative summary>

<optional body — the WHY, wrapped at 72 characters>

<optional footer — Closes #123, BREAKING CHANGE: ...>
```

| Type | Use for |
| --- | --- |
| `feat:` | A new feature |
| `fix:` | A bug fix |
| `perf:` | A change that improves performance |
| `refactor:` | Restructuring with no behavior change |
| `docs:` | Documentation only |
| `style:` | Formatting only, no code meaning changed |
| `test:` | Adding or correcting tests |
| `build:` | Build system or dependency changes |
| `chore:` | Everything else (tooling, config, housekeeping) |

Rules:

- Summary in the imperative mood, lowercase, no trailing period: "add lit button cooldown", not
  "Added Lit Button Cooldown."
- Keep the summary under 72 characters.
- One logical change per commit. If the body needs the word "also," split the commit.
- Use the body to explain **why**. The diff already shows what.

Examples:

```text
feat(party-score): add lit signal to scoring engine

Lit taps now feed baseEnergy and recencyLift alongside check-ins.
Weight starts intentionally low (0.4) pending a week of real data
from the Ocean City beta cohort.

fix(realtime): unsubscribe venue check-in channel on unmount

Navigating between venue pages left channels open, so a session
accumulated one subscription per venue visited and eventually hit
the connection limit.

docs: establish PartySafari engineering blueprint
```

## Pull Request Workflow

### Before opening

1. Rebase on the latest `main`.
2. `npm run build` — passes.
3. `npm run lint` — no new warnings.
4. Self-review your own diff. Remove debug logging, commented-out code, and stray `TODO`s.
5. Confirm the change satisfies the Definition of Done in `MASTERPLAN.md`.

### PR size

**Aim for under 400 changed lines.** Large PRs receive shallow reviews, which is worse than no
review. If a feature is genuinely large, split it: schema migration first, then the data layer,
then the UI. Each part must leave the app deployable on its own.

### PR description

Every PR includes:

- **Summary** — what changed and, more importantly, why.
- **Masterplan alignment** — which pillar this serves, or which bug it fixes.
- **Screenshots or a screen recording** for any UI change, captured at a mobile viewport.
- **Testing** — what you actually verified, on which devices, including the preview URL.
- **Risk** — what could break, and how to roll back.
- **Migrations** — call out any new SQL file explicitly and state whether it is safe to re-run.

### Merging

- At least one approving review is required.
- All checks green and the Vercel preview building successfully.
- **Squash merge** into `main`, with the squash message following Conventional Commits.
- Delete the branch after merge.
- Do not merge your own PR without a review, and never approve your own.

## Vercel Preview Workflow

The app deploys to Vercel. The Vercel project's **Root Directory must be set to `partysafari`**,
since the deployable app is nested — this is the single most common deployment misconfiguration
in this repository.

Every pull request produces a **preview deployment** with production-like settings against the
configured Supabase environment.

**Preview review is mandatory, not optional:**

1. Wait for the preview build to succeed. A red preview blocks review.
2. Open the preview URL **on a real phone**, not a desktop browser with a narrow window.
   Emulated viewports do not reproduce touch targets, scroll physics, safe-area insets, or
   real network latency.
3. Walk the surfaces your change touches, plus Discover Tonight and the radar/map — these are
   the most fragile and most performance-sensitive screens.
4. Watch the browser console. New errors or warnings are review findings.
5. Paste the preview URL into the PR description.

If a preview build fails, fix it in the branch. Never merge on the assumption that production
will behave differently.

Environment variables must exist for Preview as well as Production in the Vercel dashboard. A
missing `NEXT_PUBLIC_SUPABASE_*` value in Preview produces a build that looks fine and fails at
runtime.

## Code Review Checklist

Reviewers work through this list. Authors should too, before requesting review.

### Correctness

- [ ] Does it do what the description says, and only that?
- [ ] Are loading, empty, error, and low-confidence states all handled?
- [ ] Are failures degraded rather than thrown? A failed query should cost a feature, not a page.
- [ ] Are `null` and `undefined` handled at every external data boundary?

### Reuse and single source of truth

- [ ] Does an existing hook, library function, or component already do this?
- [ ] Is any business logic duplicated from `src/lib/`?
- [ ] Does it introduce a parallel implementation of scoring, crowd levels, date formatting, or
      Supabase client creation? (It must not — see `AI_CONTEXT.md`.)

### Realtime

- [ ] Is every subscription torn down on unmount?
- [ ] Are channel names unique per subscription target?
- [ ] Is the subscription scoped to visible items via `useVisibleVenueIds` /
      `subscribeVisibleOnly` rather than to the entire dataset?
- [ ] Can a reconnect storm or duplicate channel occur?

### Performance

- [ ] Any new work inside a render, or an effect that can loop?
- [ ] Are dependency arrays correct and stable? Unstable object/array identities are the usual
      cause of runaway effects in this codebase.
- [ ] Are queries batched rather than issued per card?
- [ ] Does the change add measurable bundle weight? Is the import worth it?
- [ ] Are heavy client components (maps, viewers) dynamically imported?

### Data and security

- [ ] Is any new table covered by Row Level Security with explicit policies?
- [ ] Is the migration idempotent and appended with the next sequential number?
- [ ] Are user-scoped writes enforced server-side, not just in the UI?
- [ ] Are any secrets, keys, or internal URLs exposed to the client?
- [ ] Is user location handled per the privacy rules in `MASTERPLAN.md`?

### UI contract

- [ ] Are component props backwards compatible, or is every call site updated in this PR?
- [ ] Does it respect `prefers-reduced-motion`?
- [ ] Contrast, touch target size (44px minimum), and thumb reachability?
- [ ] Does it reserve layout space for live-updating values to avoid layout shift?

### Hygiene

- [ ] Types are meaningful; no unexplained `any`.
- [ ] No leftover `console.log`, dead code, or commented-out blocks.
- [ ] Naming matches the conventions below.
- [ ] Commit messages follow Conventional Commits.

## Build Requirements

`npm run build` must pass from `partysafari/` before a PR is opened and must stay passing
through review.

- A build warning that is new to your change is treated as an error.
- Do not disable type checking or linting in `next.config.ts` to get a build green. If a build
  failure is genuinely a false positive, narrowly suppress it at the line with a comment
  explaining why.
- Do not add, remove, or upgrade dependencies casually. Every dependency is bundle weight, a
  supply-chain surface, and an upgrade obligation. Dependency changes need explicit reviewer
  sign-off and a justification in the PR.
- Never commit `node_modules/`, `.next/`, or `.env*`.

## TypeScript Requirements

The project runs TypeScript 5 with `strict: true`, `noEmit`, `isolatedModules`, and the `@/*`
path alias mapped to `partysafari/src/*`.

- **Everything is typed.** New files are `.ts` / `.tsx`. No new JavaScript.
- **`any` is a last resort.** Where it is unavoidable — such as loosely-shaped Supabase RPC
  responses — it must be narrowed immediately and carry a comment explaining the constraint.
  `@typescript-eslint/no-explicit-any` is set to `warn`, not `off`; do not let warnings pile up.
- **Type external data at the boundary.** Supabase rows arrive as untrusted shapes. Follow the
  established pattern: declare a row type with optional, nullable fields
  (`venue_id?: string | null`), then normalize into a strict domain type. `toSafePartyScore` in
  `src/lib/partyScore.ts` is the reference implementation.
- **Export the types other modules need.** Shared domain types live beside their logic in
  `src/lib/` and are imported with `import type`.
- **Discriminated unions over boolean soup.** `trend: "up" | "down" | "stable"` beats
  `isUp: boolean; isDown: boolean`.
- **No non-null assertions on user data.** `!` is acceptable only for values guaranteed by
  configuration, such as environment variables validated at startup.
- **Use `import type`** for type-only imports so `isolatedModules` transpiles cleanly.

## Mobile Testing Requirements

PartySafari is a phone app that happens to run in a browser. Desktop testing does not count as
testing.

**Minimum bar for any UI change:**

1. **A real device.** iOS Safari and Android Chrome. Not just a desktop emulator.
2. **375px width** as the smallest supported viewport. Nothing may overflow horizontally.
3. **Throttled network.** Test on "Fast 3G" or worse in DevTools, or on real cellular. The app
   must remain usable, not merely eventually load.
4. **Dark environment.** Look at it in an actually dark room. Brightness and contrast problems
   are invisible under office lighting.
5. **One-handed.** Reach every primary action with a thumb.
6. **Rotation and safe areas.** No content trapped behind a notch or a home indicator.
7. **Backgrounding.** Background the app for a minute, return, and confirm realtime data
   recovers and no error state is left on screen.
8. **Reduced motion.** Enable the OS setting and confirm animations degrade gracefully.

**For realtime surfaces**, additionally: open the same venue in two sessions and confirm an
action in one reflects in the other within about two seconds, then navigate away and confirm
subscriptions close.

## Peak-Hours Production Safety

Our users are out between roughly **8:00 p.m. and 2:00 a.m. Eastern Time**. That window is when
the app matters most and when a bad production deploy does the most damage. The policy below
governs **merging and deploying to production** — it is not a freeze on engineering work.

- **Routine production deployments wait for daytime.** Features, refactors, and non-urgent
  fixes are promoted to production outside the 8:00 p.m.–2:00 a.m. ET window.
- **Documentation-only changes are exempt.** They carry no runtime risk and may ship at any
  time.
- **Emergency hotfixes are permitted whenever they are needed** to restore availability,
  security, data integrity, or critical user functionality. A broken night is worse than an
  off-hours deploy.
- **An explicitly approved release may ship inside the window** when there is a justified
  operational reason. Record the approver and the reason in the PR or the release notes.
- **Normal development is never blocked.** Feature work, branch pushes, pull requests, test
  runs, and Vercel Preview deployments are all unrestricted during the window. Only production
  merges and deploys are restricted.

## Production Deployment Checklist

Run through this before promoting to production.

**Pre-deploy**

- [ ] All PRs in the release are merged to `main` and `main` builds green.
- [ ] Migrations applied to the production Supabase project, in order, and verified.
- [ ] Migrations are backwards compatible with the currently deployed code — deploy schema
      first, code second.
- [ ] RLS policies verified on any new or altered table.
- [ ] Production environment variables present and correct in Vercel.
- [ ] No `TEMP_KILL_SWITCH` flag in `src/lib/runtimeKillSwitch.ts` left enabled unintentionally.
- [ ] Preview deployment of the release commit exercised on a real phone.

**Deploy**

- [ ] Deploy during a low-traffic window. For a nightlife app that means **daytime** — see
      Peak-Hours Production Safety above for the exemptions.
- [ ] Watch the build and the first minutes of runtime logs.

**Post-deploy smoke test (production, on a phone)**

- [ ] Sign-up and login work.
- [ ] Discover Tonight loads and shows live data with plausible Party Scores.
- [ ] Map and radar render with venue markers.
- [ ] Check-in writes and the live count updates in realtime.
- [ ] RSVP writes and persists across a reload.
- [ ] Stories load and the composer submits.
- [ ] Notifications arrive.
- [ ] No new console errors.

**Rollback**

- [ ] Know the previous good deployment before you start. Vercel instant rollback is the first
      response to a bad deploy.
- [ ] If a migration is implicated, the rollback plan must be written *before* the deploy —
      additive migrations are preferred precisely because they are trivially reversible.

## Coding Standards

### General

- Clarity over cleverness. Nightlife code is read at 2am during an incident.
- Functions do one thing. If you need "and" to describe it, split it.
- Early returns over nested conditionals.
- No commented-out code — git remembers it for you.
- Comments explain **why**, never **what**. If a comment explains what, rename things instead.

### React

- `"use client"` only where interactivity genuinely requires it. Server components by default.
- Effects synchronize with external systems. They are not a place to derive state — compute
  derived values during render or with `useMemo`.
- Every effect that subscribes, times, or observes returns a cleanup function.
- Stabilize dependencies with `useMemo` / `useCallback` when they feed effects. Unstable
  identities cause the effect loops this codebase has already been bitten by.
- Guard against setting state after unmount in async flows (the `let mounted = true` pattern
  used throughout the components directory).
- Keep components under roughly 300 lines. Beyond that, extract a hook or a subcomponent.

### Data access

- All browser Supabase access goes through `createSupabaseBrowser()` in
  `src/lib/supabaseClient.ts`. Never call `createBrowserClient` directly — the shared factory
  owns the singleton, auth listener, and kill-switch behavior.
- Batch queries with `.in(...)` across a set of ids rather than issuing one query per card.
- Use `Promise.allSettled` for independent queries so one failure does not take down the rest,
  and log failures through `logSupabaseQueryError` in `src/lib/supabaseDiagnostics.ts`.
- Select only the columns you need.

### Styling

- Tailwind utility classes. No new CSS files; shared animations belong in `src/app/globals.css`.
- Follow the existing dark neon palette. Do not introduce new accent colors without a design
  decision.
- Mobile-first: base styles target small screens, `sm:` / `md:` / `lg:` add from there.

### SQL and migrations

- New file, next sequential number, descriptive name:
  `018_create_venue_lit_signals.sql`.
- Idempotent throughout: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
  `DROP POLICY IF EXISTS` before `CREATE POLICY`.
- `ENABLE ROW LEVEL SECURITY` on every table, with explicit policies.
- Index every column used in a `WHERE`, `JOIN`, or ordering clause on a hot path.
- Additive changes only. Do not drop or rename a column in the same release that changes the
  code depending on it — expand, migrate, then contract in a later release.
- Never edit an already-applied migration.

## Reusable Component Philosophy

**Before writing a component, search for one that already exists.** This codebase already
contains the building blocks for most nightlife UI: venue cards, RSVP controls, follow and
friend buttons, story rails and viewers, check-in buttons, feed posts, and saved-event toggles.

Rules:

- **Extend before you create.** A new prop on an existing component beats a near-duplicate.
- **Props extend, they don't break.** New props are optional with sensible defaults. If a prop
  must become required, update every call site in the same PR.
- **Presentational components take data, not fetchers.** Components receive their data as props;
  hooks fetch. This keeps components testable and reusable across surfaces.
- **Feature folders for feature components** (`components/discover/`, `components/stories/`,
  `components/social/`), the top level for genuinely shared ones.
- **Three strikes.** The first time you need something, write it inline. The second, note the
  duplication. The third, extract it — and delete the first two copies in the same PR.
- **A "variant" is a prop, not a fork.** `compact`, `showCount`, and `className` on the existing
  check-in button are the model. Copying a component to change two lines is a review finding.

## Single Source of Truth Philosophy

Every concept in PartySafari has **exactly one** implementation. This is the most important
engineering rule in the project, because the failure mode is silent: two implementations drift,
two surfaces show different numbers for the same venue, and users stop trusting the app.

Current sources of truth:

| Concept | Owner |
| --- | --- |
| Party Score model, weights, breakdown | `partysafari/src/lib/partyScore.ts` |
| Party Score data gathering and caching | `partysafari/src/lib/partyScoreEngine.ts` |
| Party Score React access | `partysafari/src/hooks/usePartyScore.ts` |
| Crowd levels, thresholds, colors, emoji | `partysafari/src/lib/venueCheckInUtils.ts` |
| Live venue metrics | `partysafari/src/hooks/useLiveVenueMetrics.ts` |
| Discover Tonight data composition | `partysafari/src/hooks/useDiscoverTonightData.ts` |
| Viewport-scoped subscriptions | `partysafari/src/hooks/useVisibleVenueIds.ts` |
| Supabase browser client | `partysafari/src/lib/supabaseClient.ts` |
| Query error logging and normalization | `partysafari/src/lib/supabaseDiagnostics.ts` |
| Activity feed writes | `partysafari/src/lib/activityFeed.ts` |
| Stories data layer | `partysafari/src/lib/stories.ts` |
| Event date formatting | `partysafari/src/lib/eventDateFormatter.ts` |
| Friend graph synchronization | `partysafari/src/lib/friendSync.ts` |
| Runtime kill switches | `partysafari/src/lib/runtimeKillSwitch.ts` |
| Database schema | `partysafari/db/*.sql`, applied in numeric order |

If your change needs different behavior from one of these, **change it there** and update every
consumer. Do not add a local copy "just for this screen." If a copy seems unavoidable, that is a
signal to write an adapter around the existing implementation — and to raise it in review.

## Naming Conventions

| Thing | Convention | Example |
| --- | --- | --- |
| React component files | `PascalCase.tsx` | `VenuePartyCard.tsx` |
| Hook files | `useCamelCase.ts` | `useDiscoverTonightData.ts` |
| Library / utility files | `camelCase.ts` | `partyScoreEngine.ts` |
| Route folders | `kebab-case/` | `app/venue-owner/` |
| Dynamic route segments | `[camelCase]` | `app/events/[id]/` |
| Migration files | `NNN_snake_case.sql` | `017_discover_tonight_stabilization.sql` |
| Database tables and columns | `snake_case` | `venue_checkins`, `expires_at` |
| TypeScript types and interfaces | `PascalCase` | `PartyScoreDetails` |
| Variables and functions | `camelCase` | `calculatePartyScores` |
| Module constants | `SCREAMING_SNAKE_CASE` | `DEFAULT_PARTY_SCORE_WEIGHTS` |
| Booleans | `is` / `has` / `can` / `should` prefix | `isEventActive`, `hasCreatedAt` |
| Event handler props | `on` + event | `onCheckedIn`, `onCountChange` |
| Handler implementations | `handle` + event | `handleLitTap` |
| Async data functions | Verb-first | `fetchVenues`, `resolveFriendIds` |

Additional rules:

- **Database is `snake_case`, TypeScript is `camelCase`.** Convert at the boundary, in the
  normalization layer — never leak `venue_id` into a domain type that already has `venueId`.
- **Say what it is, not what it isn't.** `isVisible`, never `isNotHidden`.
- **No abbreviations** beyond established domain terms (`rsvp`, `psi`, `id`, `url`).
- **Match the domain vocabulary in `MASTERPLAN.md`.** The thing users call a Party Score is
  called `partyScore` in code — not `venueScore`, `heatIndex`, or `vibeRating`.
