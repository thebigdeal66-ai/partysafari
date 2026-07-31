# PROJECT_INDEX.md

A repository-wide inventory of PartySafari, derived by direct inspection of the code on `main`.
This document is descriptive, not prescriptive: it records what exists today, including gaps,
dead code, and duplication. It does not propose changes.

Companion documents already on `main`:

- `MASTERPLAN.md` — product vision and forward-looking specifications.
- `AI_CONTEXT.md` — rules for AI agents working in this repo.
- `CONTRIBUTING.md` — contribution and review workflow.

> **Important distinction:** `MASTERPLAN.md` describes several features that are **specified but
> not yet built** (Lit Button, Crowd Pulse, PartySafari Intelligence / PSI). This index reports
> only what is present in code. See [§10 Feature Inventory](#10-feature-inventory).

---

## 1. Executive Summary

PartySafari is a **nightlife discovery and social application** built as a single Next.js App Router
project. It lets people see which bars, clubs, and lounges are busy *right now*, browse and RSVP to
events, post 24-hour stories, check in to venues, message and friend each other, plan multi-stop
"safari" routes across a night out, and — for venue operators — manage a venue profile and its events.

**Tech stack (as declared in `partysafari/package.json`):**

| Layer | Technology |
| --- | --- |
| Framework | Next.js `16.1.6` (App Router, `next dev --webpack`) |
| UI runtime | React `19.2.3` / React DOM `19.2.3` |
| Language | TypeScript `^5` (`strict: true`) |
| Styling | Tailwind CSS `^4.3.3` via `@tailwindcss/postcss` |
| Backend | Supabase — `@supabase/supabase-js ^2.98.0`, `@supabase/ssr ^0.9.0` |
| Maps | Leaflet `^1.9.4` + react-leaflet `^5.0.0` (OpenStreetMap tiles) |
| Linting | ESLint `^9` with `eslint-config-next` |

There is **no test framework, no CI configuration, no route handlers (`route.ts`), and no
middleware** anywhere in the repository.

**Scale:** ~23,200 lines of TypeScript/TSX across 20 routes, 34 components, 5 hooks, 10 library
modules, and 19 SQL migration files.

**Implementation maturity — mixed, and mostly further along than a prototype:**

- **Mature and real.** Almost every surface reads live Supabase data. Discover Tonight, Events,
  Stories, Messaging, Notifications, Venue Profiles, Check-ins, Friends, and the Safari route
  planner are all backed by real tables, real realtime subscriptions, and real writes. The Party
  Score engine is a genuine multi-signal scoring implementation with caching, in-flight
  deduplication, and confidence estimation.
- **Defensive to an unusual degree.** The codebase is visibly hardened against schema drift:
  `selectWithOptionalCreatedAt()` retries queries without `created_at` if the column is missing,
  helpers classify missing-column / missing-table / RLS-denied errors, and several fetches degrade
  to placeholder signals rather than failing. This suggests the production schema and the
  committed migrations have diverged in the past.
- **Carrying a visible incident scar.** `partysafari/src/lib/runtimeKillSwitch.ts` exports eleven
  boolean kill switches (realtime, `setInterval`, `requestAnimationFrame`, geolocation watch,
  presence tracking, router refresh, and more), and `GlobalRuntimeKillSwitch.tsx` monkey-patches
  browser globals at runtime to enforce them. All eleven are currently `false`. Alongside this,
  `usePartyScore.ts`, `useLiveVenueMetrics.ts`, and `SafariRadarExperience.tsx` carry several
  hundred lines of dev-only `radarTrace` instrumentation with explicit
  `probable-infinite-effect-loop` detection. Something went badly wrong with render/effect loops
  here, and the diagnostic scaffolding was never removed.
- **Notable gaps.** No global search, no user settings page, no admin tooling, no venue claim or
  ownership-verification flow, and no automated tests. `/profiles` renders hardcoded mock data.
  The venue-owner Analytics tab renders hardcoded placeholder numbers.
- **Duplication and dead weight.** Two parallel social graphs (friends and follows), two parallel
  activity-like tables (`activity_likes` and `activity_feed_likes`, both queried by the same
  component), six components totalling ~1,400 lines that are never imported, and a root-level
  `src/` shadow scaffold that is not part of the build.

---

## 2. Repository Layout

```
/                                    ← repository root (NOT the application)
├── .gitignore
├── package.json                     ← 2 deps only, no name/scripts — orphan of the shadow scaffold
├── package-lock.json
├── README.md                        ← 1 line, contains a stray markdown-link artifact
├── MASTERPLAN.md                    ← product vision (merged in PR #1)
├── AI_CONTEXT.md                    ← AI agent operating rules (merged in PR #1)
├── CONTRIBUTING.md                  ← contribution workflow (merged in PR #1)
├── FEED_IMPLEMENTATION.md           ← feature note: activity feed
├── RSVP_IMPLEMENTATION.md           ← feature note: RSVP system
│
├── src/                             ← ⚠️ UNUSED ROOT-LEVEL SHADOW SCAFFOLD — see below
│   ├── app/dashboard/page.tsx
│   └── lib/supabase/{client.ts,server.ts}
│
└── partysafari/                     ← ✅ THE ACTIVE NEXT.JS APPLICATION
    ├── package.json                 ← the real dependency manifest
    ├── next.config.ts               ← pins turbopack root + outputFileTracingRoot to this dir
    ├── tsconfig.json                ← `@/*` → `./src/*`
    ├── eslint.config.mjs            ← next core-web-vitals + typescript, most rules downgraded to "warn"
    ├── postcss.config.mjs
    ├── README.md                    ← unmodified create-next-app boilerplate
    ├── public/                      ← 5 default Next.js SVGs, all unused by app code
    ├── db/                          ← 19 hand-numbered SQL migrations (001–019)
    └── src/
        ├── app/                     ← App Router: 20 routes, 1 root layout
        ├── components/              ← 34 components + 1 co-located hook, grouped by feature
        ├── hooks/                   ← 4 shared hooks (live data / scoring / viewport)
        └── lib/                     ← 10 modules: Supabase client, Party Score, utilities
```

### Purpose of each major folder

| Path | Purpose |
| --- | --- |
| `partysafari/src/app/` | All routes. One root layout (`layout.tsx`) mounts `GlobalRuntimeKillSwitch` and `NavBar` around every page. No nested layouts, no `loading.tsx`, `error.tsx`, or `not-found.tsx`. |
| `partysafari/src/components/` | Feature-grouped UI. Subfolders: `discover/`, `events/`, `feed/`, `live/`, `radar/`, `safari/`, `social/`, `stories/`, `venue/`, `venue-owner/`. Sixteen components remain unsorted at the top level. |
| `partysafari/src/hooks/` | Cross-cutting live-data hooks. This is the performance-critical layer: every realtime subscription for venue metrics and Party Score originates here. |
| `partysafari/src/lib/` | Framework-free logic: the singleton Supabase browser client, the Party Score engine and its pure scoring functions, error diagnostics, the runtime kill switch, and display utilities. |
| `partysafari/db/` | Sequentially numbered SQL migrations applied by hand against Supabase. **Incomplete** relative to what the application actually queries — see [§13 Technical Debt](#13-technical-debt). |
| `partysafari/public/` | Only the five stock create-next-app SVGs (`file`, `globe`, `next`, `vercel`, `window`). No application code references them. |

### The root-level `src/` shadow scaffold

`/src/` at the repository root is **not part of the application** and is not compiled by any build.
The Next.js project root is pinned to `partysafari/` by `next.config.ts` (`turbopack.root` and
`outputFileTracingRoot`), and the `@/*` path alias resolves to `partysafari/src/*`. Nothing under
`partysafari/` imports anything from the root `src/`.

It contains three files, all superseded:

| File | Status |
| --- | --- |
| `src/app/dashboard/page.tsx` | A static marketing placeholder ("Upcoming Events", "Featured Talent", "My Requests" cards, a non-functional "Post a Talent Request" button). Entirely unrelated to the real `/dashboard`, which renders Discover Tonight. |
| `src/lib/supabase/client.ts` | Superseded by `partysafari/src/lib/supabaseClient.ts`. **This file is corrupted:** it contains a literal, un-executed shell heredoc fragment (`EOFmkdir -p src/lib/supabase && cat > src/lib/supabase/client.ts <<'EOF'`) in the middle of the file, followed by a duplicate of its own contents. It is not valid TypeScript. |
| `src/lib/supabase/server.ts` | An SSR client factory. Calls `cookies()` without `await`, which is incorrect for Next.js 16. The one place the app needs a server client (`app/feed/page.tsx`) inlines `createServerClient` itself rather than importing this. |

The root `package.json` (no `name`, no `scripts`, only the two Supabase dependencies) is the
leftover manifest for this scaffold. `AI_CONTEXT.md` §1 already names this "the shadow project
problem." **This index documents the scaffold; it does not touch it.**

---

## 3. App Router Index

Twenty routes, all under `partysafari/src/app/`. There is exactly **one layout file** —
`partysafari/src/app/layout.tsx` — which wraps every route with `GlobalRuntimeKillSwitch` and
`NavBar`. No route has its own layout.

| URL | Page component file | Layout | Status |
| --- | --- | --- | --- |
| `/` | `app/page.tsx` (515 ln, client) | `app/layout.tsx` | **Complete** — marketing home + live event rails (Featured, Starting Soon, Trending, Popular Venues, Upcoming DJs) + story rail. |
| `/dashboard` | `app/dashboard/page.tsx` (10 ln, server) | `app/layout.tsx` | **Complete** — thin `AuthGuard` wrapper around `DiscoverTonightExperience`. This is the real Discover Tonight surface. |
| `/events` | `app/events/page.tsx` (886 ln, client) | `app/layout.tsx` | **Complete** — live events browser with date / distance / genre / venue-type / event-type / crowd / cover filters, geolocation, search, and sectioned results. |
| `/events/[id]` | `app/events/[id]/page.tsx` (337 ln, client) | `app/layout.tsx` | **Complete** — event detail: cover, description, genres, stories, comments, RSVP, save toggle, friends-going. |
| `/events/create` | `app/events/create/page.tsx` (174 ln, client) | `app/layout.tsx` | **Complete** — `AuthGuard`-gated creation form; writes `events` and records an activity. Free-text venue name, not a venue picker. |
| `/feed` | `app/feed/page.tsx` (209 ln, **server**) | `app/layout.tsx` | **Complete** — the only server-side data fetch in the app. Reads `activity_feed`, dedupes RSVP rows, hydrates profiles/events, renders `FeedPageClient`. The "Load More Posts" button is inert. |
| `/friends` | `app/friends/page.tsx` (490 ln, client) | `app/layout.tsx` | **Complete** — incoming/sent friend requests, current friends, suggestions. |
| `/login` | `app/login/page.tsx` (99 ln, client) | `app/layout.tsx` | **Complete** — email + password sign-in; redirects to `/dashboard`. No OAuth, no password reset. |
| `/map` | `app/map/page.tsx` (5 ln, server) | `app/layout.tsx` | **Complete (redirect)** — permanently `redirect("/radar")`. Legacy URL kept alive; its former UI (`TonightNearMeMap.tsx`) is now orphaned. |
| `/messages` | `app/messages/page.tsx` (839 ln, client) | `app/layout.tsx` | **Complete** — 1:1 direct messaging with user search, history, unread counts, realtime inserts. |
| `/profile/edit` | `app/profile/edit/page.tsx` (396 ln, client) | `app/layout.tsx` | **Complete** — edit name, username, bio, location, profile type; avatar upload to the `party-media` bucket. |
| `/profiles` | `app/profiles/page.tsx` (99 ln, **server**) | `app/layout.tsx` | **Placeholder** — renders a hardcoded array of mock profiles through `ProfileCard`. The filter buttons (All / Users / Businesses / Entertainers) are static markup with no handlers. **No database query.** |
| `/profiles/[id]` | `app/profiles/[id]/page.tsx` (593 ln, client) | `app/layout.tsx` | **Complete** — real profile detail with bio, follower counts, stories grid, follow and friend buttons, type-specific sections. |
| `/radar` | `app/radar/page.tsx` (18 ln, server) | `app/layout.tsx` | **Complete** — `dynamic(..., { ssr: false })` wrapper around `SafariRadarExperience`. |
| `/request` | `app/request/page.tsx` (97 ln, client) | `app/layout.tsx` | **Complete** — form that inserts one row into `requests`. Not linked from `NavBar`. |
| `/requests` | `app/requests/page.tsx` (527 ln, client) | `app/layout.tsx` | **Complete** — talent-booking board: browse open requests, submit priced responses, accept an offer. Unrelated to friend requests. |
| `/safari` | `app/safari/page.tsx` (1,913 ln, client) | `app/layout.tsx` | **Complete** — the largest file in the repo. Route preferences, algorithmic multi-stop route generation (scoring + greedy nearest-neighbour), manual stop editing, save/load plans, live navigation with geolocation. |
| `/signup` | `app/signup/page.tsx` (100 ln, client) | `app/layout.tsx` | **Complete** — email + password registration with email-confirmation messaging. |
| `/venue-owner` | `app/venue-owner/page.tsx` (1,283 ln, client) | `app/layout.tsx` | **Partial** — seven-tab operator dashboard. Overview, Events, Tonight, Specials, Gallery, and Settings are functional; **Analytics is a placeholder** with hardcoded numbers. Ownership gating is fail-closed on `venues.owner_id`, added by migration 018 but not yet applied or backfilled (see [§13](#13-technical-debt)). |
| `/venues/[slug]` | `app/venues/[slug]/page.tsx` (631 ln, client) | `app/layout.tsx` | **Complete** — public venue page: info, tonight's and upcoming events, stories, live check-in metrics, Party Score, friends-here. |

**Routes reachable from `NavBar`:** `/`, `/dashboard`, `/feed`, `/friends`, `/messages`,
`/profiles`, `/radar`, `/requests`, `/safari`, `/venue-owner`. `/events`, `/request`,
`/profile/edit`, `/login`, and `/signup` are reachable only via in-page links or direct URL.

---

## 4. Components

Thirty-four components plus one co-located hook (`stories/useStories.ts`, catalogued in
[§5](#5-hooks)). "Reusable" below means the component is parameterised by props and is not bound
to a single page's data shape.

### Discover Tonight

| File | Purpose | Reusable | Parent feature |
| --- | --- | --- | --- |
| `components/discover/DiscoverTonightExperience.tsx` (435 ln) | The whole Discover Tonight page body. Renders eight sections (Hot Right Now, Events Starting Soon, Friends Out Tonight, Live Stories, Venues Heating Up, Live Entertainment, Happening Now, Recommendations) with per-section loading and error states. Consumes `useDiscoverTonightData()`. | No — takes no props | Discover Tonight |
| `components/discover/VenuePartyCard.tsx` (192 ln) | Venue card showing Party Score with an animated counter, crowd emoji/colour, momentum trend, friends-here count, story count, distance, and open/closed state. `memo`-ised. | **Yes** — 15 props | Discover Tonight / Party Score |

### Stories

| File | Purpose | Reusable | Parent feature |
| --- | --- | --- | --- |
| `components/stories/StoryRailSurface.tsx` (57 ln) | The drop-in Stories surface: composes `StoryRail` + `StoryComposer` + `StoryViewer` and owns their open/closed state, wired to its own `useStories()` instance. Mounted on `/`, `/feed`, and Discover Tonight. | **Yes** — optional default venue/event | Stories |
| `components/stories/StoryRail.tsx` (182 ln) | Horizontal avatar rail with unseen "rings" (gradient border + pulse) and an "add story" affordance. | **Yes** | Stories |
| `components/stories/StoryViewer.tsx` (812 ln) | Full-screen story player: 6,000 ms auto-advance for images, native duration for video, progress bars, tap/keyboard navigation, four quick reactions (🔥 😍 🎉 🍻), and owner delete. | **Yes** | Stories |
| `components/stories/StoryComposer.tsx` (378 ln) | Upload modal: file validation, venue/event tagging (events filtered to the chosen venue), upload to the `party-media` bucket, size cap from `NEXT_PUBLIC_PARTY_MEDIA_MAX_BYTES`. | **Yes** | Stories |
| `components/stories/StoryGrid.tsx` (53 ln) | Presentational grid of story thumbnails with time-remaining labels. Used on event, profile, and venue-owner pages. | **Yes** — 4 props | Stories |

### Events and RSVP

| File | Purpose | Reusable | Parent feature |
| --- | --- | --- | --- |
| `components/events/EventRsvpControls.tsx` (236 ln) | RSVP control with a `compact` mode; optimistic updates; records activity. Used inside venue event cards and Discover Tonight. | **Yes** — 3 props | Events |
| `components/RSVPSection.tsx` (253 ln) | Fuller RSVP block with a transient status message and all three counts. Used on `/events/[id]` and `/venues/[slug]`. | **Yes** — 2 props | Events |
| `components/EventComments.tsx` (351 ln) | Event comment thread with submission, per-comment likes, and profile hydration. | **Yes** — takes `eventId` | Events |
| `components/SavedEventToggle.tsx` (127 ln) | Save/unsave toggle writing to `saved_events`. | **Yes** | Events |
| `components/venue/VenueEventCard.tsx` (62 ln) | Compact event card (title, time, cover, age limit, ticket link) embedding `EventRsvpControls`. | **Yes** — 7 props | Venues / Events |

### Venues and check-ins

| File | Purpose | Reusable | Parent feature |
| --- | --- | --- | --- |
| `components/VenueCheckInButton.tsx` (230 ln) | Check in / check out via RPC, with live count display and active-check-in state. | **Yes** | Check-ins |
| `components/venue-owner/EventsManager.tsx` (550 ln) | Venue-owner event CRUD: create, edit, duplicate, feature, cancel, delete, plus image upload. | Partly — takes `venueId`, but only used by `/venue-owner` | Venue Owner |

### Maps and live discovery

| File | Purpose | Reusable | Parent feature |
| --- | --- | --- | --- |
| `components/radar/SafariRadarExperience.tsx` (1,475 ln) | Safari Radar: the live Leaflet hotspot map. Party-score-weighted markers with glow, zoom-dependent clustering, tier classification, overlay filters, and a list mode. Loaded via `dynamic(..., { ssr: false })` from `/radar`. Second-largest file in the repo. | No | Radar |
| `components/safari/SafariRouteMap.tsx` (152 ln) | Leaflet mini-map for a safari route: numbered stop markers and a staggered-reveal polyline. Dynamically imported by `/safari`. | **Yes** | Safari |
| `components/TonightNearMeMap.tsx` (545 ln) | Full-screen venue map with type/genre/status filters, emoji markers, popup detail, and check-in. | **Yes** | **⚠️ DEAD — zero references.** Superseded by Safari Radar when `/map` became a redirect. |
| `components/live/LivePartyModeBoard.tsx` (153 ln) | Grid of the top 12 venues ranked by live Party Score. Embedded in `/feed`. | No | Party Score / Feed |

### Social

| File | Purpose | Reusable | Parent feature |
| --- | --- | --- | --- |
| `components/social/FriendButton.tsx` (282 ln) | Full friend-request state machine: send, accept, decline, "friends" state, conflict handling, realtime sync. | **Yes** | Friends |
| `components/social/FriendsGoingSection.tsx` (155 ln) | Avatar bubbles for friends RSVP'd "going" to an event. | **Yes** | Friends / Events |
| `components/social/FriendsHereSection.tsx` (171 ln) | Avatar bubbles for friends currently checked in at a venue; realtime. | **Yes** | Friends / Check-ins |
| `components/social/FriendsDashboardSection.tsx` (197 ln) | Recent-friends dashboard widget. | Yes, in principle | **⚠️ DEAD — zero references.** |
| `components/FollowButton.tsx` (88 ln) | One-way follow/unfollow toggle on `follows`; records an activity. | **Yes** | Follows |
| `components/FollowingSection.tsx` (247 ln) | List of profiles the current user follows. | Yes, in principle | **⚠️ DEAD — zero references.** |
| `components/ProfileCard.tsx` (114 ln) | Profile summary card with role-based action buttons; supports a compact mode. | **Yes** | Profiles — currently fed only mock data |

### Messaging, notifications, navigation

| File | Purpose | Reusable | Parent feature |
| --- | --- | --- | --- |
| `components/NavBar.tsx` (270 ln) | Global nav. Renders `NotificationCenter` and two realtime badges: unread messages (via RPC) and pending friend requests. | No — global singleton | Navigation |
| `components/NotificationCenter.tsx` (552 ln) | Notification bell dropdown: ten typed notification kinds, per-item and mark-all read, realtime INSERT/UPDATE/DELETE, lazy actor-profile hydration. | No — global singleton | Notifications |

### Feed

| File | Purpose | Reusable | Parent feature |
| --- | --- | --- | --- |
| `components/feed/FeedPageClient.tsx` (40 ln) | Client shell for `/feed`: story rail, `LivePartyModeBoard`, and the post list. | **Yes** — takes `posts` | Feed |
| `components/FeedPost.tsx` (434 ln) | Activity feed post with like handling and realtime like counts. **Queries both `activity_likes` and `activity_feed_likes`** — see [§13](#13-technical-debt). | **Yes** — takes `post` | Feed |

### Infrastructure

| File | Purpose | Reusable | Parent feature |
| --- | --- | --- | --- |
| `components/AuthGuard.tsx` (79 ln) | Client-side session gate with a 4,000 ms `getSession` race-timeout; redirects to `/login`. Used by 5 routes. | **Yes** — wraps children | Authentication |
| `components/GlobalRuntimeKillSwitch.tsx` (48 ln) | Mounted in the root layout. Monkey-patches `window.setInterval`, `window.requestAnimationFrame`, and `navigator.geolocation.watchPosition` to no-ops when the corresponding `TEMP_KILL_SWITCH` flag is set, restoring the originals on unmount. | No — global singleton | Runtime safety |

### Dead components (never imported anywhere)

| File | Lines |
| --- | --- |
| `components/TonightNearMeMap.tsx` | 545 |
| `components/FollowingSection.tsx` | 247 |
| `components/MyRsvpsSection.tsx` — user's going/interested list | 208 |
| `components/social/FriendsDashboardSection.tsx` | 197 |
| `components/SavedEventsSection.tsx` — stateful saved-events container | 193 |
| `components/SavedEventsList.tsx` — presentational saved-events list | 55 |
| **Total** | **~1,445** |

Verified by searching the entire `partysafari/src` tree for each identifier, including
`dynamic(() => import(...))` forms. `SafariRadarExperience` and `SafariRouteMap` initially appear
unreferenced under a naive import grep but *are* live — both are loaded via `dynamic()`.

---

## 5. Hooks

Five hooks. Four live in `hooks/`; `useStories` is co-located in `components/stories/`.

### `hooks/usePartyScore.ts` (414 ln) — exports `usePartyScores` and `usePartyScore`

| Attribute | Value |
| --- | --- |
| Responsibility | Fetch, cache, and live-update Party Scores. `usePartyScores` handles a batch of venues; `usePartyScore` handles one. Both delegate computation to `lib/partyScoreEngine.ts`. |
| Consumers | `SafariRadarExperience`, `LivePartyModeBoard`, `TonightNearMeMap` (dead), `app/page.tsx`, `useDiscoverTonightData`, `app/venues/[slug]/page.tsx` |
| Critical infrastructure | **Yes** |
| Realtime | **Yes** — one channel per venue |
| Polling | **Yes** — `setInterval` every **60,000 ms** |
| Caching | **Yes** — reads the module-level cache in `partyScoreEngine`; seeds state from cache before fetching; coalesces per-venue refreshes behind a 150 ms debounce timer |

Guarded by `disablePartyScorePolling`, `disableSupabaseRealtime`, `disablePresenceTracking`, and
`disableSetInterval`. Carries `radarTrace` instrumentation including an explicit
`probable-infinite-effect-loop` heuristic (fires when an effect runs >10 times with no user
interaction in the last 1,500 ms).

### `hooks/useLiveVenueMetrics.ts` (635 ln)

| Attribute | Value |
| --- | --- |
| Responsibility | Per-venue live metrics: `liveCheckins`, `activeStories`, `currentEvents`, `friendsHere`, `crowdLevel`, `trendingScore`. Aggregates `venue_checkins`, `stories`, `events`, and `friendships`. |
| Consumers | `SafariRadarExperience`, `LivePartyModeBoard`, `TonightNearMeMap` (dead), `useDiscoverTonightData`, `app/venues/[slug]/page.tsx` |
| Critical infrastructure | **Yes** |
| Realtime | **Yes** — per-venue channels plus one global friendships channel |
| Polling | **Yes** — `setInterval` every **45,000 ms** |
| Caching | Partial — seeds empty metrics per venue and merges updates into existing state; no TTL cache |

Supports `subscribeVisibleOnly` so that only on-screen venues hold subscriptions.

### `hooks/useDiscoverTonightData.ts` (981 ln)

| Attribute | Value |
| --- | --- |
| Responsibility | The Discover Tonight aggregator. Resolves geolocation (falling back to Austin, TX at `30.2672, -97.7431`), loads venues/events/friendships/profiles/friend check-ins/RSVPs/saved events, then derives all eight page sections with per-section loading and error state. Composes `useStories`, `useLiveVenueMetrics`, and `usePartyScores`. |
| Consumers | `DiscoverTonightExperience` only |
| Critical infrastructure | **Yes** — single point of failure for `/dashboard` |
| Realtime | **Yes** — one channel, `discover-tonight-base` |
| Polling | No directly; inherits the 45 s and 60 s intervals from its child hooks |
| Caching | Partial — an in-flight refresh guard with a queued-refresh flag prevents overlapping fetches |

Uses `Promise.allSettled` throughout so a single failed query degrades one section rather than the
page, and detects PostgreSQL `42703` (undefined column) to survive schema drift.

### `hooks/useVisibleVenueIds.ts` (66 ln)

| Attribute | Value |
| --- | --- |
| Responsibility | `IntersectionObserver` (rootMargin 120 px, threshold 0.2) tracking which venue cards are on screen, so subscription-heavy hooks can subscribe to visible venues only. |
| Consumers | `LivePartyModeBoard` |
| Critical infrastructure | Supporting — it is the mechanism that bounds subscription count |
| Realtime | No |
| Polling | No |
| Caching | No |

Only one consumer despite `usePartyScores` and `useLiveVenueMetrics` both accepting
`visibleVenueIds`. Discover Tonight explicitly opts out with `subscribeVisibleOnly: false`.

### `components/stories/useStories.ts` (808 ln)

| Attribute | Value |
| --- | --- |
| Responsibility | The entire Stories data layer: load active (non-deleted, unexpired) stories, hydrate authors/venues/events, compute seen state and view/reaction counts, group by author and by venue, order the rail by relationship, and expose `recordView`, `addReaction`, `softDeleteStory`, and `createStoryRecord`. |
| Consumers | `StoryRailSurface`, `useDiscoverTonightData`, `app/events/[id]`, `app/profiles/[id]`, `app/venues/[slug]`, `app/venue-owner` |
| Critical infrastructure | **Yes** |
| Realtime | **Yes** — two channels (stories, story metrics) with globally-incremented unique topic suffixes to avoid collisions between concurrent instances |
| Polling | No fixed interval — instead schedules a **single `setTimeout` at the next story's exact expiry** (`expires_at - now + 250 ms`, floored at 1,000 ms) so the rail self-refreshes precisely when a story lapses |
| Caching | **Yes** — a per-session `viewedInSessionRef` set suppresses duplicate view writes; optimistic local updates for views and reactions |

The expiry-driven refresh is the most elegant piece of scheduling in the codebase.

---

## 6. Libraries

All under `partysafari/src/lib/`.

| File | Lines | Responsibility |
| --- | --- | --- |
| `supabaseClient.ts` | 124 | **The most depended-upon module in the repo (44 importers).** Returns a process-wide singleton browser client stashed on `globalThis.__partysafariSupabaseState__`, so exactly one client and one `onAuthStateChange` listener exist per tab. Also exports `resolveCurrentUserId()`, which caches the user id for 15,000 ms, deduplicates concurrent calls behind a shared promise, and retries once with 120–220 ms jitter when Supabase's auth lock throws an `AbortError`. When `disableSupabaseRealtime` is set it replaces `client.channel` / `client.removeChannel` with no-op stubs. |
| `partyScoreEngine.ts` | 476 | **The Party Score engine.** Batch-computes scores for a set of venues from six signal sources (`venue_checkins`, `stories`, `events`, `event_rsvps`, `story_reactions`, `friendships`) over a 45-minute recency window. Holds a 30,000 ms module-level TTL cache and an in-flight map keyed by venue-set so concurrent callers share one round trip. Derives a confidence value from how many sources were available versus active, and records `placeholders[]` naming any signal it could not compute. |
| `partyScore.ts` | 218 | **Pure scoring functions and types** — no I/O. Defines `PartyScoreSignals`, the tunable `DEFAULT_PARTY_SCORE_WEIGHTS` (14 weights plus a momentum coefficient), and `buildPartyScoreFromSignals()`, which combines base energy, social lift, event lift, and recency lift into a 0–100 score plus momentum and an up/down/stable trend. Also exports `toSafePartyScore()` for defensive coercion at UI boundaries. |
| `runtimeKillSwitch.ts` | 13 | **Runtime kill switches.** A single frozen `TEMP_KILL_SWITCH` object with eleven booleans: `disableSupabaseRealtime`, `disableAuthStateChangeListener`, `disableSetInterval`, `disableSetTimeout`, `disableRequestAnimationFrame`, `disableGeolocationWatchPosition`, `disablePartyScorePolling`, `disableLiveFeedPolling`, `disableNotificationRealtime`, `disablePresenceTracking`, `disableRouterRefresh`. All currently `false`. Read by 6 modules. |
| `supabaseDiagnostics.ts` | 116 | Development-only error formatting. Classifies Postgrest errors as missing-column / missing-table / RLS-denied, detects the auth-lock `AbortError` (`isAuthLockAbortError`), and normalises unknown throwables. Silent outside `NODE_ENV === "development"`. |
| `stories.ts` | 271 | Story domain model and pure helpers: active-story filtering, grouping by author and by venue, `sortStoryGroupsForRail()` (own → unseen-friend → unseen-followed → unseen → friend → followed → rest), time-remaining formatting, file-type/size validation, and storage path construction. |
| `venueCheckInUtils.ts` | 125 | Crowd-level model. `CROWD_THRESHOLDS` maps check-in counts to `Quiet` (0–9), `Getting Busy` (10–39), `Busy` (40–99), `Packed` (100+), with matching colour classes, emoji, descriptions, glow classes, and an animation class that respects `prefers-reduced-motion`. |
| `activityFeed.ts` | 102 | `recordActivity()` — the single write path into `activity_feed`. Suppresses duplicates by looking back 60,000 ms for a matching actor + action + event/profile row with deep-normalised, key-sorted metadata. Seven importers. |
| `friendSync.ts` | 111 | Friend-relationship query helpers plus the `partysafari:friend-state-sync` custom browser event, which lets friend UI across the page react to a friend action without a shared store. |
| `eventDateFormatter.ts` | 70 | `formatEventDateTime` / `formatEventDateOnly` / `formatEventTimeOnly`, each returning a graceful "unavailable" string on invalid input. |

**There is no PSI (PartySafari Intelligence) code.** `MASTERPLAN.md` §"PartySafari Intelligence
(PSI)" specifies it as a layer that would sit on top of `partyScore.ts` / `partyScoreEngine.ts`,
but no such module, type, or identifier exists anywhere in the repository.

---

## 7. Contexts and Providers

**There are no React contexts and no custom providers in this repository.**

Verified: no `createContext`, no `useContext`, no `*Provider` component, and no state-management
library in `package.json`. Cross-component coordination is achieved by four other mechanisms:

| Mechanism | Where | What it owns |
| --- | --- | --- |
| **Global singleton on `globalThis`** | `lib/supabaseClient.ts` (`__partysafariSupabaseState__`) | The one Supabase client, the auth-state subscription flag, the realtime-disabled patch flag, and the 15 s user-id cache. This is the de facto app-wide provider. |
| **Module-level cache** | `lib/partyScoreEngine.ts` (`partyScoreCache`, `inflightByKey`) | Party Scores with a 30 s TTL, shared across every component that asks for a score. |
| **Custom DOM events** | `lib/friendSync.ts` (`partysafari:friend-state-sync`), `app/messages/page.tsx` + `NavBar.tsx` (`partysafari:messages-read`) | Cross-tree invalidation without a store — e.g. accepting a friend request refreshes the `NavBar` badge. |
| **Prop drilling / hook re-instantiation** | Throughout | Each `StoryRailSurface` instance runs its own `useStories()`; multiple Discover surfaces each run their own metric hooks. |

The only component mounted globally is `GlobalRuntimeKillSwitch` in `app/layout.tsx`, and it
renders `null` — it is a side-effect component, not a provider.

---

## 8. Supabase Integration

> **No secrets appear in this document.** Only file paths and environment *variable names* are
> listed. No `.env` file is committed — `.env` and `.env.local` are ignored at the repository root
> and `.env*` is ignored inside `partysafari/`.

### Environment variables referenced by code

| Variable | Referenced in | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabaseClient.ts`, `app/feed/page.tsx`, root `src/lib/supabase/{client,server}.ts` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same as above | Supabase anon key |
| `NEXT_PUBLIC_PARTY_MEDIA_MAX_BYTES` | `components/stories/StoryComposer.tsx` | Optional story upload size cap |
| `NODE_ENV` | diagnostics and tracing throughout | Gates dev-only logging |

No service-role key is referenced anywhere. All access is through the anon key under RLS.

### Client setup

| Location | Kind |
| --- | --- |
| `partysafari/src/lib/supabaseClient.ts` | **Canonical browser client** — `createBrowserClient` from `@supabase/ssr`, singleton on `globalThis` |
| `partysafari/src/app/feed/page.tsx` (lines 8–22) | The only **server** client — `createServerClient` inlined with a cookie adapter whose `set`/`remove` are intentional no-ops |
| `/src/lib/supabase/client.ts`, `/src/lib/supabase/server.ts` | **Shadow scaffold, unused** — see [§2](#2-repository-layout) |

### Authentication

| Concern | Location |
| --- | --- |
| Sign in | `app/login/page.tsx` — `auth.signInWithPassword` |
| Sign up | `app/signup/page.tsx` — `auth.signUp` (email confirmation flow) |
| Session gating | `components/AuthGuard.tsx` — `auth.getSession` with a 4 s timeout race; used by `/dashboard`, `/events/create`, `/venue-owner`, and others (5 importers) |
| Current user | `lib/supabaseClient.ts` → `resolveCurrentUserId()` — `auth.getUser` behind a 15 s cache with auth-lock retry |
| Session invalidation | `lib/supabaseClient.ts` — a single `auth.onAuthStateChange` listener clears the user cache |

There is **no sign-out call anywhere in the codebase**, no OAuth provider, and no password reset.

### Storage

A single bucket, **`party-media`**, used in four places:

| File | Use |
| --- | --- |
| `components/stories/StoryComposer.tsx` | Story image/video upload |
| `app/profile/edit/page.tsx` | Avatar upload |
| `app/venue-owner/page.tsx` | Venue gallery upload |
| `components/venue-owner/EventsManager.tsx` | Event cover image upload |

All four upload and then call `getPublicUrl`, so the bucket is public-read.

### Database access — tables

Twenty-six distinct tables are queried via `.from(...)`:

`activity_feed`, `activity_feed_likes`, `activity_likes`, `comment_likes`, `conversation_participants`,
`conversations`, `direct_messages`, `event_comments`, `event_performers`, `event_rsvps`, `events`,
`follows`, `friend_requests`, `friendships`, `notifications`, `profiles`, `request_responses`,
`requests`, `safari_plans`, `safari_stops`, `saved_events`, `stories`, `story_reactions`,
`story_views`, `venue_checkins`, `venues`.

### Database access — RPCs

Ten RPCs are called. **Only one of them is defined in `partysafari/db/`:**

| RPC | Called from | Defined in `db/`? |
| --- | --- | --- |
| `check_out_of_venue` | `VenueCheckInButton` | ✅ `015_add_checkout_function.sql` |
| `check_in_to_venue` | `VenueCheckInButton` | ❌ |
| `get_venue_live_counts` | `VenueCheckInButton`, `app/events/page.tsx`, `app/safari/page.tsx` | ❌ |
| `get_event_rsvp_counts` | `app/events/page.tsx` | ❌ |
| `get_unread_message_counts` | `app/messages/page.tsx`, `NavBar` | ❌ |
| `mark_conversation_read` | `app/messages/page.tsx` | ❌ |
| `start_direct_conversation` | `app/messages/page.tsx` | ❌ |
| `send_friend_request` | `FriendButton` | ❌ |
| `respond_to_friend_request` | `FriendButton`, `app/friends/page.tsx` | ❌ |
| `soft_delete_story` | `useStories` | ❌ |

`db/` additionally defines `create_notification`, `is_venue_owner`, and `set_events_updated_at`,
none of which are called from application code (the first two are used inside SQL policies and
triggers).

### Migrations

| File | Creates / changes |
| --- | --- |
| `001_add_event_columns.sql` | `ALTER TABLE events` |
| `002_create_event_rsvps.sql` | `event_rsvps` + RLS |
| `003_create_event_comments.sql` | `event_comments` + RLS |
| `004_create_saved_events.sql` | `saved_events` + RLS |
| `005_create_follows.sql` | `follows` + RLS |
| `006_create_activity_feed.sql` | `activity_feed` + RLS |
| `007_create_activity_feed_likes.sql` | `activity_feed_likes` + RLS |
| `008_create_comment_likes.sql` | `comment_likes` + RLS |
| `009_create_activity_likes.sql` | `activity_likes` + RLS ← **parallel to 007** |
| `010_create_comment_likes.sql` | `comment_likes` again ← **duplicate of 008** |
| `011_create_notifications.sql` | `notifications` + RLS + `create_notification()` |
| `012_live_events_system.sql` | `events` table/columns, `is_venue_owner()`, `set_events_updated_at()` |
| `013_fix_event_status_and_dates.sql` | Data fix |
| `014_backfill_event_creation_activity.sql` | Backfill |
| `015_add_checkout_function.sql` | `check_out_of_venue()` |
| `016_create_story_metrics.sql` | `story_views`, `story_reactions` + RLS |
| `017_discover_tonight_stabilization.sql` | `venues`, `venue_checkins`, `stories`, `friendships` (351 ln, the largest migration) |
| `018_venue_ownership.sql` | `venues.owner_id`, corrected `is_venue_owner()`, owner-only UPDATE on `venues` |
| `019_venue_content_rls.sql` | `events` RLS rewrite — venue-owned vs community events split into separate policies |

**Tables with no migration in `db/`:** `profiles`, `friend_requests`, `conversations`,
`conversation_participants`, `direct_messages`, `requests`, `request_responses`, `safari_plans`,
`safari_stops`, `event_performers`.

---

## 9. Realtime Inventory

### Supabase realtime channels

Twenty-one distinct channel definitions. Channels marked *per-venue*, *per-event*, or *per-user*
instantiate one channel per entity, so the live channel count scales with what is on screen.

| # | Channel name (exact) | Defined in | Subscribed tables / events |
| --- | --- | --- | --- |
| 1 | `party-score:${venueId}` *(per-venue)* | `hooks/usePartyScore.ts:208` | `venue_checkins`, `stories`, `events` (filtered `venue_id=eq.`), plus unfiltered `event_rsvps`, `story_reactions`, `friendships` — all `event: "*"` |
| 2 | `party-score-single:${venueId}` *(per-venue)* | `hooks/usePartyScore.ts:375` | identical set to #1 |
| 3 | `live-venue-metrics:${venueId}` *(per-venue)* | `hooks/useLiveVenueMetrics.ts:469` | `venue_checkins`, `stories`, `events` filtered `venue_id=eq.`, `event: "*"` |
| 4 | `live-venue-metrics:friendships` *(global)* | `hooks/useLiveVenueMetrics.ts:541` | `friendships`, `event: "*"` |
| 5 | `discover-tonight-base` *(global)* | `hooks/useDiscoverTonightData.ts:670` | `events`, `event_rsvps`, `saved_events`, `venue_checkins`, `friendships` — all `event: "*"` |
| 6 | `stories:${authorId}:${venueId}:${eventId}:${n}` | `components/stories/useStories.ts:512` | `stories`. Suffix `n` from a `globalThis` counter, guaranteeing unique topics per hook instance |
| 7 | `story-metrics:${authorId}:${venueId}:${eventId}:${n}` | `components/stories/useStories.ts:559` | `story_views`, `story_reactions` |
| 8 | `notifications-${userId}` *(per-user)* | `components/NotificationCenter.tsx:304` | `notifications` INSERT / UPDATE / DELETE, filtered `user_id=eq.` |
| 9 | `direct-messages-realtime` *(global)* | `app/messages/page.tsx:525` | `direct_messages` INSERT |
| 10 | `navbar-messages-${userId}` *(per-user)* | `components/NavBar.tsx:82` | `direct_messages` INSERT; `conversation_participants` UPDATE filtered `profile_id=eq.`; `friend_requests` `*` |
| 11 | `friend-state-${currentUserId}-${targetUserId}` *(per-pair)* | `components/social/FriendButton.tsx:68` | `friend_requests`, `friendships`, `event: "*"` |
| 12 | `friends-page-${currentUserId}` *(per-user)* | `app/friends/page.tsx:255` | friend request / friendship changes |
| 13 | `friends-dashboard-section` *(global, static)* | `components/social/FriendsDashboardSection.tsx:125` | `friend_requests`, `friendships`, `*`. **In dead code**; also unfiltered by user, so it would refresh on any user's activity |
| 14 | `friends-here-${venueId}-${currentUserId}` | `components/social/FriendsHereSection.tsx:134` | `venue_checkins` filtered `venue_id=eq.`, `*` |
| 15 | `events-live-channel` *(global)* | `app/events/page.tsx:532` | `events` INSERT/UPDATE/DELETE; `event_rsvps` `*`; `venue_checkins` `*` |
| 16 | `event-rsvps-${eventId}` *(per-event)* | `components/RSVPSection.tsx:85` | `event_rsvps` filtered `event_id=eq.` |
| 17 | `event-rsvp-${eventId}` *(per-event)* | `components/events/EventRsvpControls.tsx:66` | `event_rsvps` filtered `event_id=eq.` — **near-identical to #16, one character apart** |
| 18 | `event-comment-likes-${eventId}` *(per-event)* | `components/EventComments.tsx:141` | `comment_likes`, `*` |
| 19 | `activity-likes-${post.activityId}` *(per-post)* | `components/FeedPost.tsx:115` | activity like changes |
| 20 | `venue-checkins-${venueId}` *(per-venue)* | `components/VenueCheckInButton.tsx:107` | `venue_checkins` filtered `venue_id=eq.` |
| 21 | `venue-events-${venue.id}` *(per-venue)* | `app/venues/[slug]/page.tsx:311` | `events` filtered `venue_id=eq.`; `event_rsvps` |
| 22 | `owner-events-${venueId}` *(per-venue)* | `components/venue-owner/EventsManager.tsx:165` | `events` filtered `venue_id=eq.` |
| 23 | `safari-live-checkins` *(global)* | `app/safari/page.tsx:1134` | `venue_checkins`, `*` |
| 24 | `safari-radar-events` *(global)* | `components/radar/SafariRadarExperience.tsx:667` | `events`, `*` |

All subscriptions are centrally disableable: `createSupabaseBrowser()` swaps `channel` and
`removeChannel` for no-ops when `TEMP_KILL_SWITCH.disableSupabaseRealtime` is set.

### Polling intervals

| Interval | Location | Purpose |
| --- | --- | --- |
| **60,000 ms** | `hooks/usePartyScore.ts:280` | Party Score safety-net refresh |
| **45,000 ms** | `hooks/useLiveVenueMetrics.ts:602` | Live venue metrics safety-net refresh |
| Dynamic — next story expiry, `max(1000, expires_at − now + 250)` ms | `components/stories/useStories.ts:626` | Refresh the rail exactly when a story lapses |
| 420 ms | `app/safari/page.tsx:1069` | Generation message carousel (UI animation) |
| 120 ms | `app/safari/page.tsx:1105` | Timeline reveal (UI animation) |
| 180 ms | `components/safari/SafariRouteMap.tsx:96` | Staggered marker reveal (UI animation) |

Only the first three poll for data; the rest are presentation timers. Debounce/backoff timers also
exist: 150 ms per-venue refresh coalescing and 300 ms resubscribe-failure retry in
`usePartyScore.ts`, and 3,000 ms message auto-dismiss in `RSVPSection.tsx`.

### Caches

| Cache | Location | TTL / scope |
| --- | --- | --- |
| Party Score cache (`partyScoreCache`) | `lib/partyScoreEngine.ts:57` | **30,000 ms**, module-level `Map`, keyed by venue id |
| In-flight request map (`inflightByKey`) | `lib/partyScoreEngine.ts:58` | Request lifetime, keyed by sorted venue-set + window |
| User id cache | `lib/supabaseClient.ts:15` | **15,000 ms**, on `globalThis`, invalidated by `onAuthStateChange` |
| Supabase client singleton | `lib/supabaseClient.ts:18` | Process lifetime, `globalThis.__partysafariSupabaseState__` |
| Activity duplicate window | `lib/activityFeed.ts:10` | **60,000 ms** look-back, query-time (not stored) |
| Seen-story set | `components/stories/useStories.ts` (`viewedInSessionRef`) | Component lifetime |
| Realtime topic counter | `components/stories/useStories.ts:76` | `globalThis.__partysafariRealtimeTopicCounter__` |
| Dev trace buffers | `usePartyScore.ts`, `useLiveVenueMetrics.ts`, `SafariRadarExperience.tsx` | `window.__RADAR_TRACE__`, `window.__RADAR_LAST_USER_INTERACTION__`, development only |

**No `localStorage` or `sessionStorage` is used anywhere in the application.** All caching is
in-memory and lost on reload.

---

## 10. Feature Inventory

| Feature | Status | Evidence |
| --- | --- | --- |
| **Discover Tonight** | **Complete** | `/dashboard` → `DiscoverTonightExperience` + `useDiscoverTonightData` (981 ln). Eight live sections with independent loading/error state, geolocation, Party Score and live metrics integration. |
| **Stories** | **Complete** | Full 24-hour lifecycle: `useStories` (808 ln), `lib/stories.ts`, composer, rail, viewer, grid. Upload, view tracking, reactions, soft delete, expiry-driven refresh, relationship-ordered rail. |
| **Messaging** | **Complete** | `/messages` (839 ln). 1:1 conversations over `conversations`, `conversation_participants`, `direct_messages`; user search; unread counts via `get_unread_message_counts` with a `last_read_at` fallback; realtime inserts; `NavBar` badge. No group chat, no attachments, no typing indicators. |
| **Notifications** | **Complete** | `NotificationCenter` (552 ln) over `notifications`. Ten types: `like_activity`, `like_comment`, `comment`, `follow`, `rsvp`, `booking_request`, `booking_accepted`, `direct_message`, `friend_request`, `friend_request_accepted`. Per-item and mark-all read; realtime INSERT/UPDATE/DELETE. |
| **Venue Profiles** | **Complete** | `/venues/[slug]` (631 ln) with events, stories, live metrics, Party Score, friends-here, check-in. |
| **Venue Claims** | **❌ Does not exist** | There is no claim flow, no claim table, no verification workflow, and no claim UI anywhere. `/venue-owner` resolves ownership through the single relationship `venues.owner_id = auth.uid()` and denies access on any miss. Migration 018 adds that column, but it is unapplied and unbackfilled, so nobody currently resolves as an owner ([SECURITY_NOTES.md](SECURITY_NOTES.md)). A `verified` field is read for display only; nothing in the app ever sets it. |
| **Events** | **Complete** | `/events` (886 ln) with multi-axis filtering, `/events/[id]` detail, `/events/create`, plus owner-side CRUD in `EventsManager`. |
| **Check-ins** | **Complete** | `VenueCheckInButton` + `check_in_to_venue` / `check_out_of_venue` RPCs, `venue_checkins` table with `expires_at`, crowd tiers in `lib/venueCheckInUtils.ts`. |
| **Maps** | **Complete** | Leaflet + OpenStreetMap in three places: Safari Radar (clustering, glow, tiers), Safari route map (numbered stops + polyline), and the orphaned `TonightNearMeMap`. All real maps; nothing simulated. |
| **Friends** | **Complete** | Request → accept/decline → friendship over `friend_requests` and `friendships`, with `send_friend_request` / `respond_to_friend_request` RPCs, `/friends` page, `FriendButton`, friends-here and friends-going widgets, and a `NavBar` badge. |
| **Follows** | **Partial** | The `follows` table and `FollowButton` work and are used on `/profiles/[id]`, and `useStories` reads follows for rail ordering. But `FollowingSection` (the only browse surface) is dead code, and there is no followers list. A second social graph running alongside Friends. |
| **Search** | **❌ No global search** | No search route, no search component, no `NavBar` search. What exists is scoped: filter/search controls inside `/events`, and user search inside `/messages`. |
| **Requests (talent booking)** | **Complete** | `/requests` browse-and-bid board over `requests` and `request_responses`; `/request` posts a new request. Note these are two unrelated pages despite near-identical URLs, and neither concerns friend requests. |
| **Responses (talent booking)** | **Complete** | Priced responses with an accept flow that flips a request to `booked`; `request_responses` table. Part of the same feature as Requests. |
| **Settings** | **❌ No user settings** | No `/settings` route and no account-preferences UI. The only "Settings" is a tab inside `/venue-owner` for venue metadata. Profile editing lives at `/profile/edit`. |
| **Admin tools** | **❌ Do not exist** | No admin route, no role checks, no moderation UI. The string "admin" does not appear in `partysafari/src`. The closest thing is `/venue-owner`'s permissive fallback, which is a gap rather than a feature. |
| **Party Score** | **Complete** | `lib/partyScore.ts` (pure) + `lib/partyScoreEngine.ts` (I/O, cache, confidence) + `hooks/usePartyScore.ts` (realtime + polling). Six signal sources, 14 tunable weights, momentum and trend, 0–100 output, explicit `placeholders[]` when a signal is unavailable. The most complete subsystem in the repo. |
| **Lit Button** | **❌ Does not exist** | Specified in `MASTERPLAN.md` §"Lit Button Specification" (line 184) as distinct from check-in — *"Check-in says I am here. The Lit Button says it is good here, come now."* **No implementation, no table, no component, no identifier exists in the codebase.** |
| **Crowd Pulse** | **❌ Does not exist** | Specified in `MASTERPLAN.md` (lines 101, 239, 247) as an anonymised city-level aggregate heat view. **No implementation of any kind exists.** |
| **PSI (PartySafari Intelligence)** | **❌ Does not exist** | Specified in `MASTERPLAN.md` §"PartySafari Intelligence (PSI)" (line 109) as an explainable layer above the Party Score. **No module, type, or reference exists in code.** |
| **Safari route planning** | **Complete** | `/safari` (1,913 ln): preferences, algorithmic generation, manual editing, persistence to `safari_plans` / `safari_stops`, live navigation. Not listed in the original brief but is the single largest feature in the repository. |
| **Safari Radar** | **Complete** | `/radar` → `SafariRadarExperience` (1,475 ln): live clustered hotspot map. Also the target of the `/map` redirect. |
| **Activity Feed** | **Partial** | `/feed` renders real `activity_feed` data server-side with RSVP dedupe, and likes work. But "Load More Posts" is inert (hard limit of 30 items), and like counts are split across two tables. |
| **Authentication** | **Partial** | Email + password sign-up and sign-in work, and `AuthGuard` gates five routes. **No sign-out exists anywhere in the app**, no OAuth, no password reset, and gating is client-side only (no middleware). |

---

## 11. Page Completion Matrix

Percentages are a judgement of how much of each feature's own evident intent is implemented, based
on the code as it stands.

| Feature | Completion % | Notes | Known Gaps |
| --- | --- | --- | --- |
| Party Score | 95% | Signals, weights, momentum, confidence, caching, realtime, polling all present. | Weights are compile-time constants with no tuning surface; `confidence` is computed but barely surfaced in UI. |
| Stories | 95% | Full lifecycle including expiry-precise refresh and relationship-ordered rail. | No story replies; view counts only visible on your own stories. |
| Discover Tonight | 90% | Eight sections, all live, per-section error isolation. | Opts out of `subscribeVisibleOnly`, so it subscribes to every loaded venue at once. |
| Events | 90% | Browse, filter, detail, create, comment, RSVP, save. | `/events/create` takes a free-text venue name rather than linking to a `venue_id`. Two near-duplicate RSVP components. |
| Messaging | 85% | Real 1:1 conversations, unread counts, realtime. | 1:1 only; no attachments, typing indicators, read receipts, or delete. `direct-messages-realtime` is a global unfiltered channel. |
| Notifications | 85% | Ten types, read/unread, realtime, actor hydration. | No preferences, no grouping, no pagination, no push. |
| Venue Profiles | 85% | Rich public page with live signals. | No hours, menu, or review surface. |
| Safari route planning | 85% | Generation, editing, persistence, live navigation. | 1,913 lines in one file; `safari_plans` / `safari_stops` have no migration in `db/`. |
| Safari Radar | 85% | Clustering, tiers, glow, filters, list mode. | ~200 lines of dev-only tracing shipped in the file; overlay filters overlap explicit filters. |
| Friends | 85% | Complete request lifecycle plus contextual widgets. | No blocking, no mutual-friends view; one of its dashboard widgets is dead code. |
| Check-ins | 85% | RPC-based in/out with expiry and crowd tiers. | No geofence verification — a user can check in anywhere. |
| Requests / Responses | 80% | Post, browse, bid, accept. | `/request` is unlinked from navigation; no request editing or withdrawal; no migration for either table. |
| Maps | 80% | Three real Leaflet surfaces. | Distances are miles in Safari/Discover but kilometres in `TonightNearMeMap`; the largest map component is dead. |
| Authentication | 70% | Sign-up, sign-in, client-side gating. | **No sign-out**, no OAuth, no password reset, no middleware — protection is client-side only. |
| Activity Feed | 70% | Real server-rendered feed with dedupe and likes. | "Load More" inert; 30-item cap; likes split across `activity_likes` and `activity_feed_likes`. |
| Venue Owner dashboard | 65% | Six of seven tabs functional; ownership resolution is fail-closed. | **Analytics tab is hardcoded placeholder data**; `venues.owner_id` exists only in unapplied migration 018 and has no owner assigned, so the dashboard resolves no venue for anyone. |
| Follows | 50% | Table, toggle, and story-ordering integration work. | Only browse surface (`FollowingSection`) is dead code; no followers list; duplicates the Friends graph. |
| Profiles (browse) | 20% | Layout and card component exist. | `/profiles` renders **hardcoded mock data**; filter buttons are inert; no query, no pagination. |
| Search | 0% | — | No global search of any kind. |
| Settings (user) | 0% | — | No user settings route or account preferences. |
| Admin tools | 0% | — | No admin surface, roles, or moderation. |
| Venue Claims | 0% | — | No claim or verification flow exists. |
| Lit Button | 0% | Specified in `MASTERPLAN.md` only. | Not implemented. |
| Crowd Pulse | 0% | Specified in `MASTERPLAN.md` only. | Not implemented. |
| PSI | 0% | Specified in `MASTERPLAN.md` only. | Not implemented. |

---

## 12. TODO Inventory

The whole repository was searched for `TODO`, `FIXME`, `HACK`, and `XXX`.

**Result: zero of these markers exist in application code.** There are exactly two matches
repository-wide, and neither is a code annotation:

| File:line | Match | Nature |
| --- | --- | --- |
| `CONTRIBUTING.md:174` | "Remove debug logging, commented-out code, and stray `TODO`s." | Prose in the contribution guide — an instruction *about* TODOs. |
| `RSVP_IMPLEMENTATION.md:21` | `Display format: "XXX people interested or attending"` | A string-format placeholder in documentation, not a code marker. |

| Marker | Count in `partysafari/src` | Count in `/src` | Count in docs |
| --- | --- | --- | --- |
| `TODO` | 0 | 0 | 1 (prose) |
| `FIXME` | 0 | 0 | 0 |
| `HACK` | 0 | 0 | 0 |
| `XXX` | 0 | 0 | 1 (format placeholder) |

**Read this carefully: a zero TODO count is not evidence of low technical debt here.** The debt in
this repository is real and substantial (see [§13](#13-technical-debt)); it is simply undocumented
in-line. Kill switches, dead components, duplicate tables, and placeholder UI all exist without a
single marker pointing at them. Anyone auditing this codebase by grepping for TODOs will conclude
it is clean, and will be wrong.

---

## 13. Technical Debt

Identified only. Nothing in this section has been modified.

### 1. Root-level `src/` shadow scaffold — includes a corrupted file

`/src/` is not compiled by any build, yet it persists alongside a root `package.json` that has no
`name` and no `scripts`. Worse, `/src/lib/supabase/client.ts` **is not valid TypeScript**: a shell
heredoc fragment (`EOFmkdir -p src/lib/supabase && cat > src/lib/supabase/client.ts <<'EOF'`) was
committed into the middle of the file, followed by a duplicate of its own body — the residue of a
terminal command pasted into a file write. `/src/lib/supabase/server.ts` calls `cookies()` without
`await`, which is wrong for Next.js 16. `/src/app/dashboard/page.tsx` is a static placeholder that
collides conceptually with the real `/dashboard`. `AI_CONTEXT.md` already flags this as "the shadow
project problem."

### 2. Migrations have drifted badly from the live schema

Ten of the twenty-six queried tables have no `CREATE TABLE` anywhere in `db/`: `profiles`,
`friend_requests`, `conversations`, `conversation_participants`, `direct_messages`, `requests`,
`request_responses`, `safari_plans`, `safari_stops`, `event_performers`. Nine of the ten RPCs the
app calls have no definition in `db/` either. `db/` cannot reproduce a working database — meaning
the schema of record lives only in the hosted Supabase project. This is almost certainly *why*
the codebase is so defensively written (see item 3).

Within `db/` itself: `008_create_comment_likes.sql` and `010_create_comment_likes.sql` both create
`comment_likes` with different policy names, and `007_create_activity_feed_likes.sql` and
`009_create_activity_likes.sql` create two parallel like tables.

### 3. Schema-drift defence woven through application code

`partyScoreEngine.selectWithOptionalCreatedAt()` issues every query twice on failure — once with
`created_at`, once without — and marks the affected signal as a "placeholder" when the column is
missing. `useDiscoverTonightData` detects PostgreSQL `42703`. `useStories` detects `PGRST205`.
`supabaseDiagnostics` classifies missing-column, missing-table, and RLS-denied errors. Individually
sensible; collectively, an admission that the code does not know what schema it is talking to. It
also doubles the query count on the degraded path.

### 4. Duplicate activity-like tables queried by a single component

`components/FeedPost.tsx` reads **`activity_likes`** (line 83), reads **`activity_feed_likes`**
(lines 97, 150), and inserts into **`activity_likes`** (line 165). One component, two backing
tables, split reads and writes. Like counts are therefore not reliably consistent.

### 5. Two parallel social graphs

**Friends** (`friend_requests` + `friendships`, bidirectional, request/accept) and **Follows**
(`follows`, unidirectional, instant) coexist with no defined relationship between them. Friends is
clearly primary — it drives `/friends`, the `NavBar` badge, friends-here, friends-going, Party
Score's `friendPresence` signal, and two notification types. Follows contributes only to story rail
ordering and profile pages, and its one browse surface is dead code. Two users can be friends,
follower/followee, both, or neither, and no code reconciles these states.

### 6. ~1,445 lines of dead components

Six components are never imported anywhere: `TonightNearMeMap.tsx` (545), `FollowingSection.tsx`
(247), `MyRsvpsSection.tsx` (208), `FriendsDashboardSection.tsx` (197), `SavedEventsSection.tsx`
(193), `SavedEventsList.tsx` (55). `TonightNearMeMap` is the notable one — a complete, working
Leaflet map with filters and check-in integration, orphaned when `/map` became a redirect to
`/radar`. `SavedEventsList` and `SavedEventsSection` are two unused takes on the same idea, while
the only live saved-events UI is the `SavedEventToggle` button.

### 7. Dev-only instrumentation shipped in production source

`usePartyScore.ts`, `useLiveVenueMetrics.ts`, and `SafariRadarExperience.tsx` carry extensive
`radarTrace` scaffolding: effect-run counters, set-state tracing, render-loop windows, and a
`probable-infinite-effect-loop` heuristic. It is gated on `NODE_ENV === "development"` so it does
not execute in production, but it remains in the source, inflates the files substantially, and
makes the real logic harder to follow.

### 8. Eleven runtime kill switches monkey-patching browser globals

`GlobalRuntimeKillSwitch` reassigns `window.setInterval`, `window.requestAnimationFrame`, and
`navigator.geolocation.watchPosition` on mount and restores them on unmount. `createSupabaseBrowser`
can stub out `channel` / `removeChannel` entirely. This is a global, invisible behaviour override:
a future contributor debugging a timer that never fires has no obvious path from the symptom to
`lib/runtimeKillSwitch.ts`. All eleven flags are currently `false`, and the `TEMP_` prefix suggests
they were never meant to be permanent.

### 9. Venue ownership has no canonical column

The application-layer hole is closed: `/venue-owner` now resolves the operator's venue through the
single relationship `venues.owner_id = auth.uid()` and denies access on any error or miss. The
five-column probe and the "first venue in the database" fallback are gone.

The schema gap is closed in `db/`. Migration `018_venue_ownership.sql` adds `venues.owner_id`,
replaces the `is_venue_owner()` `to_jsonb` probe (which always returned false, silently neutering
every `events` policy that depended on it) with a direct comparison, and makes `venues` UPDATE
owner-only. `019_venue_content_rls.sql` then rewrites the `events` policies so venue ownership —
not event authorship — governs writes to venue-attached events, while keeping user-created
community events (`venue_id IS NULL`) working under `created_by = auth.uid()`.

**Neither migration has been applied to the hosted database, and no owner has been assigned**, so
`venues.owner_id` is NULL everywhere and every user still sees the empty state. The behaviour is
unchanged in practice; what changed is that it is now fail-closed by design rather than by
accident. There is still no `venue_owners` or `venue_claims` table and no claim flow. See
[SECURITY_NOTES.md](SECURITY_NOTES.md) for the full RLS assessment.

### 10. Oversized files

| File | Lines |
| --- | --- |
| `app/safari/page.tsx` | 1,913 |
| `components/radar/SafariRadarExperience.tsx` | 1,475 |
| `app/venue-owner/page.tsx` | 1,283 |
| `hooks/useDiscoverTonightData.ts` | 981 |
| `app/events/page.tsx` | 886 |
| `app/messages/page.tsx` | 839 |
| `components/stories/StoryViewer.tsx` | 812 |
| `components/stories/useStories.ts` | 808 |

The top three alone are 4,671 lines — 20% of the codebase in three files. Each mixes data fetching,
derivation, and presentation with no separation.

### 11. Near-duplicate realtime channel names

`event-rsvps-${eventId}` (`RSVPSection.tsx:85`) and `event-rsvp-${eventId}`
(`EventRsvpControls.tsx:66`) differ by a single character and subscribe to the same filtered table.
When both components render for the same event, two channels do identical work. Similarly,
`party-score:${venueId}` and `party-score-single:${venueId}` register identical six-table listener
sets.

### 12. Unbounded and unfiltered global subscriptions

`discover-tonight-base` listens to five tables with no filters. `events-live-channel` listens to
three. `direct-messages-realtime` receives every `direct_messages` INSERT rather than filtering by
conversation. `friends-dashboard-section` (dead) uses a static channel name shared by all users.
Because Discover Tonight sets `subscribeVisibleOnly: false`, it also opens per-venue Party Score
and metrics channels for every loaded venue simultaneously — the likely origin of the kill switches
in item 8.

### 13. No tests, no CI, and lint rules downgraded to warnings

No test framework, no test files, no CI workflow. `eslint.config.mjs` downgrades
`react-hooks/rules-of-hooks`, `react-hooks/purity`, `react-hooks/immutability`,
`react-hooks/set-state-in-effect`, `@typescript-eslint/no-explicit-any`, and `prefer-const` from
error to **warn** — precisely the rules that catch the effect-loop class of bug this codebase
already instrumented itself against.

### 14. Smaller items

- `README.md` at the repository root is one line containing a stray artifact:
  `# partysafari[text](partysafari/src/lib/supabase/client.ts)`.
- `partysafari/README.md` is unmodified create-next-app boilerplate.
- No sign-out exists anywhere; a signed-in user cannot log out from the UI.
- Distance units are inconsistent — miles in Safari and Discover, kilometres in `TonightNearMeMap`.
- The default map centre (Austin, TX `30.2672, -97.7431`) is redefined independently in several files.
- `partysafari/public/` contains only the five stock Next.js SVGs, none referenced by app code.
- `useVisibleVenueIds` has one consumer despite two hooks being built to accept its output.
- `/feed`'s "Load More Posts" button has no handler.
- Raw `<img>` tags are used throughout instead of `next/image`.

---

## 14. AI Navigation Guide

Quick-reference reading lists. Paths are relative to `partysafari/` unless noted.

> **Before touching anything:** read `AI_CONTEXT.md` (repo root) — it defines hard stops, including
> not creating parallel scoring engines and not breaking realtime subscriptions. And remember the
> app lives in `partysafari/`; the root `src/` is a dead scaffold.

### Working on Discover Tonight
1. `src/hooks/useDiscoverTonightData.ts` — all data and section derivation (981 ln; start here)
2. `src/components/discover/DiscoverTonightExperience.tsx` — the eight sections
3. `src/components/discover/VenuePartyCard.tsx` — the card
4. `src/app/dashboard/page.tsx` — the 8-line `AuthGuard` entry point
5. Depends on: `usePartyScore.ts`, `useLiveVenueMetrics.ts`, `useStories.ts`

### Working on Stories
1. `src/components/stories/useStories.ts` — the entire data layer (808 ln)
2. `src/lib/stories.ts` — pure helpers, grouping, rail ordering, file validation
3. `src/components/stories/StoryRailSurface.tsx` — the composed drop-in surface
4. Then the piece you need: `StoryRail.tsx`, `StoryViewer.tsx`, `StoryComposer.tsx`, `StoryGrid.tsx`
5. Tables: `stories`, `story_views`, `story_reactions` (`db/016_create_story_metrics.sql`); RPC `soft_delete_story` (no migration); bucket `party-media`

### Working on Messaging
1. `src/app/messages/page.tsx` — the whole feature (839 ln)
2. `src/components/NavBar.tsx` — the unread badge
3. Tables: `conversations`, `conversation_participants`, `direct_messages` (**no migrations**)
4. RPCs: `start_direct_conversation`, `get_unread_message_counts`, `mark_conversation_read` (**none have migrations**)
5. Custom event: `partysafari:messages-read`

### Working on Party Score
1. `src/lib/partyScore.ts` — types, weights, pure scoring. Change scoring behaviour here.
2. `src/lib/partyScoreEngine.ts` — signal fetching, 30 s cache, in-flight dedupe, confidence
3. `src/hooks/usePartyScore.ts` — React binding, realtime, 60 s polling
4. `src/lib/venueCheckInUtils.ts` — crowd-level thresholds
5. Consumers: `VenuePartyCard`, `SafariRadarExperience`, `LivePartyModeBoard`, `useDiscoverTonightData`
6. ⚠️ `AI_CONTEXT.md` forbids creating a second scoring engine. Extend these files.

### Working on Venue Cards
1. `src/components/discover/VenuePartyCard.tsx` — the rich Party Score card (Discover, Live Board)
2. `src/components/venue/VenueEventCard.tsx` — the compact event card
3. `src/lib/venueCheckInUtils.ts` — colours, emoji, glow, animation classes
4. `src/lib/partyScore.ts` → `toSafePartyScore()` — always coerce before rendering

### Working on Authentication
1. `src/lib/supabaseClient.ts` — the singleton client and `resolveCurrentUserId()`
2. `src/components/AuthGuard.tsx` — the client-side gate (4 s timeout race)
3. `src/app/login/page.tsx`, `src/app/signup/page.tsx`
4. ⚠️ No middleware, no server-side protection, and **no sign-out anywhere**

### Working on Realtime
1. `src/lib/runtimeKillSwitch.ts` — check these flags first when something live is not updating
2. `src/lib/supabaseClient.ts` — `channel`/`removeChannel` may be stubbed out here
3. [§9 Realtime Inventory](#9-realtime-inventory) above — all 24 channels in one table
4. `src/hooks/useVisibleVenueIds.ts` — the mechanism for bounding subscription count
5. ⚠️ Every subscription must clean up on unmount; the tracing in `usePartyScore.ts` exists because this went wrong before

### Working on Events / RSVP
1. `src/app/events/page.tsx` — browse and filter (886 ln)
2. `src/app/events/[id]/page.tsx` — detail
3. `src/components/events/EventRsvpControls.tsx` (compact) **and** `src/components/RSVPSection.tsx` (full) — two similar components; check which surface you are on
4. `src/lib/eventDateFormatter.ts` — always format dates through this
5. `src/lib/activityFeed.ts` — RSVPs record activity here

### Working on Safari (route planning)
1. `src/app/safari/page.tsx` — everything (1,913 ln: preferences, generation, editing, navigation)
2. `src/components/safari/SafariRouteMap.tsx` — the Leaflet mini-map
3. Tables: `safari_plans`, `safari_stops` (**no migrations**)

### Working on Safari Radar / maps
1. `src/app/radar/page.tsx` — the `dynamic(..., { ssr: false })` wrapper
2. `src/components/radar/SafariRadarExperience.tsx` — the map (1,475 ln; ~200 are dev tracing)
3. `src/components/TonightNearMeMap.tsx` — **dead**, but the best reference for filter + popup patterns
4. ⚠️ Leaflet must never be server-rendered; always import dynamically with `ssr: false`

### Working on Friends / Follows
1. `src/lib/friendSync.ts` — helpers and the `partysafari:friend-state-sync` event
2. `src/components/social/FriendButton.tsx` — the full request state machine
3. `src/app/friends/page.tsx` — the management page
4. `src/components/FollowButton.tsx` — the separate, one-way follow graph
5. ⚠️ Decide which graph you mean. They are independent — see [§13](#13-technical-debt) item 5.

### Working on Notifications
1. `src/components/NotificationCenter.tsx` — the whole feature (552 ln)
2. `db/011_create_notifications.sql` — table, RLS, and `create_notification()`
3. The ten type strings are listed in [§10](#10-feature-inventory)

### Working on the Venue Owner dashboard
1. `src/app/venue-owner/page.tsx` — the seven-tab shell (1,283 ln)
2. `src/components/venue-owner/EventsManager.tsx` — event CRUD
3. ⚠️ Ownership resolves only via `venues.owner_id`, added by unapplied migration 018 and not yet assigned to any venue — so the dashboard is fail-closed and empty for every account ([SECURITY_NOTES.md](SECURITY_NOTES.md)). The Analytics tab is hardcoded placeholder data.

### Working on the Activity Feed
1. `src/app/feed/page.tsx` — the only server-side fetch in the app
2. `src/components/feed/FeedPageClient.tsx`, `src/components/FeedPost.tsx`
3. `src/lib/activityFeed.ts` — the single write path (60 s duplicate suppression)
4. ⚠️ `FeedPost` reads from both `activity_likes` and `activity_feed_likes`

### Adding a new page
1. `src/app/layout.tsx` — the only layout; `NavBar` + `GlobalRuntimeKillSwitch` are already global
2. Wrap in `src/components/AuthGuard.tsx` if the page requires a session
3. Use `createSupabaseBrowser()` from `src/lib/supabaseClient.ts` — never construct a client directly
4. Reuse `usePartyScore` / `useLiveVenueMetrics` / `useStories` rather than writing new fetches
5. Add the route to `src/components/NavBar.tsx` if it should be discoverable

### Where things are *not*
`/src` at the repo root (dead scaffold) · global search (does not exist) · user settings (does not
exist) · admin tools (do not exist) · venue claims (do not exist) · Lit Button, Crowd Pulse, PSI
(specified in `MASTERPLAN.md`, not implemented) · tests (none) · CI (none) · API route handlers
(none) · middleware (none).
