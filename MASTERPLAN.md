# PartySafari Masterplan

> The product constitution. When a decision is contested, this document wins.
> Amendments happen by pull request, not by Slack message.

---

## Mission

Make it impossible to miss a good night out.

PartySafari exists to answer one question, honestly and instantly: **where is it actually
popping right now, near me?** Not where it was popping last summer. Not where the sponsored
listing wants you to go. Right now.

## Vision

Every beach and college town in America runs on a shared, live nervous system for nightlife —
built by the people who are actually out, not by review aggregators, not by paid placement.
A visitor who has never been to a town should be able to open PartySafari at 10:40pm and be at
the right bar by 11:00pm.

## Core Product Philosophy

1. **Live beats accurate-on-average.** A four-star rating tells you what a venue is like in
   general. It tells you nothing about tonight. We optimize for the last 45 minutes.
2. **Signal comes from behavior, not opinion.** Check-ins, stories, RSVPs, and friend presence
   are costly-to-fake actions. Star ratings are cheap. We weight what people *do*.
3. **The map is the product.** Discovery is spatial and temporal. Lists are a fallback.
4. **Friends are the strongest ranking signal we have.** A venue with three of your friends in
   it outranks a venue with eighty strangers. The scoring engine already encodes this.
5. **Never lie about confidence.** When we don't have enough data, we say so. The Party Score
   carries an explicit `confidence` value and a `placeholders` list naming which signals were
   unavailable. That honesty is a feature, not an implementation detail.
6. **Nightlife is a phone-in-one-hand, 20%-battery, bad-LTE experience.** Every design and
   engineering tradeoff resolves in favor of the person standing on a boardwalk at midnight.

## Ocean City Launch Goal

PartySafari launches in **Ocean City, Maryland** first. Not nationally. Not "wherever we get
traction." Ocean City.

**Why Ocean City:**

- Dense, walkable nightlife concentrated along a narrow strip — high venue density per square
  mile means the map is always full and proximity ranking is meaningful.
- Extreme seasonality creates a hard, honest deadline and a natural cohort of visitors who
  *need* discovery because they don't know the town.
- A finite, knowable set of venues (dozens, not thousands) that a small team can onboard by
  hand and keep accurate.
- A tight local operator community where a Founder Program can realistically reach every
  meaningful venue owner in a single season.

**What winning Ocean City means:**

- Every venue on the strip that matters is in the app with correct hours, location, and imagery.
- On a peak Friday, the Party Score ranking of the top ten venues matches what a local bartender
  would tell you, verified by spot-check.
- Users open the app *at the moment of decision* — the usage curve should spike between 9pm and
  1am, not distribute evenly across the day.
- Word of mouth is local and organic: people hand their phone to a friend and say "check this."

We do not expand until Ocean City is genuinely solved. A mediocre product in ten towns is worth
less than an indispensable one in a single town.

## Technology Stack

This reflects what is actually in the repository today.

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | **Next.js 16.1.6** (App Router) | `partysafari/src/app/**` |
| UI runtime | **React 19.2.3** | Client components for all live surfaces |
| Language | **TypeScript 5** | `strict: true`, `noEmit`, `@/*` path alias to `src/*` |
| Styling | **Tailwind CSS v4** via `@tailwindcss/postcss` | Dark neon aesthetic, `src/app/globals.css` |
| Data / Auth / Realtime | **Supabase** (`@supabase/ssr`, `@supabase/supabase-js` v2) | Postgres + RLS + `postgres_changes` channels |
| Maps | **Leaflet 1.9 + react-leaflet 5** | `TonightNearMeMap.tsx`, `SafariRouteMap.tsx` |
| Linting | **ESLint 9** flat config + `eslint-config-next` | `partysafari/eslint.config.mjs` |
| Migrations | Hand-numbered SQL | `partysafari/db/001_*.sql` → `017_*.sql` |
| Hosting | **Vercel** | Project root directory must be set to `partysafari/` |

### Repository layout

The deployable application lives in the **`partysafari/`** subdirectory. The repository root
also contains a small legacy scaffold (`src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`,
`src/app/dashboard/page.tsx`, and a two-dependency `package.json`) that predates the real app.
That root-level `src/` tree is **not** the product and must not be extended. All feature work
happens under `partysafari/`.

## Product Pillars

1. **Discover Tonight** — the primary surface. What is happening, right now, near you.
2. **Party Score** — a single honest number for how alive a place is at this moment.
3. **Crowd Pulse** — the aggregate, anonymized city-level view of where energy is moving.
4. **Social Presence** — friends here, friends going, stories from inside the room.
5. **Community Events** — anyone can create and promote a night, not just venues.
6. **Venue Partnership** — venue owners get real tools and real data, not just a listing.

Every feature we ship must strengthen at least one pillar. Features that strengthen none get
cut, no matter how fun they were to build.

## PartySafari Intelligence (PSI)

PSI is the intelligence layer that sits **on top of** the existing signal pipeline. It is a
direction, not a rewrite.

**What PSI is:**

- **Ranking and personalization.** Given a user's friend graph, history, location, and stated
  vibe preferences, order the night's options for *them* rather than producing one global list.
- **Score interpretation.** Turn `PartyScoreDetails` — which already carries a `breakdown` of
  `baseEnergy`, `socialLift`, `eventLift`, and `recencyLift` — into human sentences.
  "Packed, and picking up fast — two of your friends just checked in" is worth more than "87."
- **Anomaly and momentum detection.** Identify venues whose momentum is inflecting before the
  raw score reflects it. Early detection is the entire value proposition of a nightlife app.
- **Trust and abuse scoring.** Weight signals by contributor reliability so a single coordinated
  group cannot manufacture a hotspot.
- **Forecasting.** "This place peaks around 12:30 on Saturdays" derived from historical curves.

**What PSI is not:**

- PSI is **not** a second scoring engine. `partysafari/src/lib/partyScore.ts` and
  `partysafari/src/lib/partyScoreEngine.ts` are the canonical implementation. PSI reads their
  output, adjusts weights, and adds interpretation. It never forks the math.
- PSI is not a reason to add a heavyweight model to the client. Anything expensive runs
  server-side or as a scheduled job; the phone stays fast.

**PSI design constraints:**

- Every PSI-driven recommendation must be explainable in one sentence to the user.
- PSI degrades gracefully. If the intelligence layer is unavailable, the app falls back to the
  raw Party Score ordering and remains fully usable.
- PSI never fabricates activity. If a venue is quiet, the app says it is quiet.

## Party Score Philosophy

The Party Score is a 0–100 answer to "how lit is this place *right now*."

It already exists. `partysafari/src/lib/partyScore.ts` defines the model — signals, weights,
breakdown, clamping — and `partysafari/src/lib/partyScoreEngine.ts` gathers those signals from
Supabase and caches results. `partysafari/src/hooks/usePartyScore.ts` exposes it to the UI.
**This is the single source of truth for venue energy. There is exactly one.**

### Principles

- **Recency dominates.** The engine evaluates a rolling recent window (45 minutes by default)
  and rewards activity inside it separately from standing totals. A venue that was packed at 9pm
  and empty at 12am must not read as hot.
- **Composite, never single-signal.** The score blends four groups:
  - `baseEnergy` — live check-ins, active stories, story reactions
  - `socialLift` — friends physically present, recent friend activity
  - `eventLift` — active events, going/interested RSVPs
  - `recencyLift` — everything that happened inside the recent window
  A venue cannot buy its way to the top by inflating one input.
- **Momentum is separate from magnitude.** `momentum` and `trend` (`up` / `down` / `stable`)
  are first-class outputs. "60 and climbing" is a different night than "60 and dying."
- **Confidence is published.** `confidence` (0–1) reflects how many signal sources were both
  available and active. `placeholders` names any signal we could not read. The UI must never
  present a low-confidence score with the same visual weight as a high-confidence one.
- **Personal, not universal.** `socialLift` depends on the viewer's friend graph, so two users
  can legitimately see different scores for the same venue at the same time. This is correct.
- **Crowd level stays human.** Raw numbers are translated through
  `partysafari/src/lib/venueCheckInUtils.ts` into `Quiet` / `Getting Busy` / `Busy` / `Packed`.
  Users think in words; the number is supporting detail.
- **Cheap to read.** Scores are cached with a short TTL and concurrent requests for the same
  venue set are de-duplicated. Score reads must never become the reason the map stutters.

### Evolution rules

Changing weights is a product decision, not a refactor. Weight changes ship in
`DEFAULT_PARTY_SCORE_WEIGHTS`, are documented in the pull request with before/after examples on
real venues, and are reviewed by whoever owns the score. New signals extend `PartyScoreSignals`
and `PartyScoreWeights` together, with a default weight, and must be safe when the underlying
table or column does not yet exist — the engine already degrades to placeholders rather than
throwing, and new signals must preserve that behavior.

## Lit Button Specification

The Lit Button is the fastest possible way for a person inside a venue to tell everyone else
that it is going off.

### Intent

Check-in says *I am here*. The Lit Button says *it is good here, come now*. These are different
claims and carry different weight. Check-in is presence; Lit is endorsement.

### UX behavior

- **One tap. No modal, no form, no confirmation step.** The button lives on the venue card, the
  venue detail page, and the live/radar surfaces.
- **Optimistic and instant.** The UI reflects the tap immediately and reconciles with the server
  afterward. A failed write reverts quietly with a small toast; it never blocks the user.
- **Haptic + visual acknowledgement.** A short pulse and a color/glow shift. The interaction
  should feel like striking a match, and should complete visually in under 150ms.
- **Reduced motion is respected.** The codebase already gates crowd animations on
  `prefers-reduced-motion`; Lit animations follow the same rule.
- **Decaying state.** A Lit signal is not permanent. The button returns to its inactive state
  once the user's signal expires, communicating that the endorsement is about *now*.
- **Cooldown is shown, not hidden.** If a user is inside their cooldown window, the button shows
  a subdued state with the time remaining. Silent no-ops are user-hostile.

### Eligibility and anti-abuse

The Lit Button is the highest-leverage input into ranking, which makes it the highest-value
target for abuse. Non-negotiable protections:

- **Authenticated users only.** Anonymous taps are not counted.
- **Proximity gating.** A Lit signal requires plausible physical presence — an active check-in
  at the venue, or a device location within a small radius. Venue coordinates already exist on
  the `venues` table. Users who deny location may still browse; they may not vote.
- **Per-user cooldown.** One Lit per user per venue per cooldown window (target: 60 minutes),
  enforced server-side with a unique constraint plus an expiry timestamp — the same pattern
  `venue_checkins` already uses. Client-side checks are UX, never enforcement.
- **Global rate limit.** A per-user ceiling across all venues per night bounds the damage a
  single compromised account can do.
- **Row Level Security.** Insert policies must restrict rows to the authenticated user's own id.
  Every table in `partysafari/db/` already enables RLS; Lit is no exception.
- **Trust weighting.** Signals from new, unverified, or previously flagged accounts contribute
  less. Venue-owned accounts cannot Lit their own venue.
- **Burst detection.** A sudden cluster of Lits from accounts with no prior activity, no friend
  graph, and identical timing is throttled and flagged rather than accepted.
- **Auditability.** Every Lit is a durable row with `user_id`, `venue_id`, `created_at`,
  `expires_at`, and coarse location metadata, so abuse can be reconstructed after the fact.

### Data it emits

A Lit event feeds three consumers:

1. **Party Score** — as a new signal in `PartyScoreSignals` with both a standing count and a
   recent-window count, so it participates in `baseEnergy` and `recencyLift` exactly like other
   signals. It must be added to the existing engine, never to a parallel one.
2. **Crowd Pulse** — as an anonymized, aggregated tick contributing to the city-level heat view.
3. **Notifications** — optional, throttled friend alerts ("three friends say Seacrets is lit").

### Privacy

Individual Lit events are never displayed attributed to a named user outside that user's own
friend graph. Publicly, Lit is always an aggregate.

## Crowd Pulse

Crowd Pulse is the city-scale view: the anonymized, aggregate rhythm of where energy is
concentrating and which direction it is moving.

**What it shows:**

- A live heat layer over the map — which blocks are hot, which are cooling.
- Directional movement: the strip is draining north, the boardwalk is filling.
- Time-of-night rhythm: where the night starts, where it peaks, where it ends.

**Composition.** Crowd Pulse aggregates the same underlying signals the Party Score consumes —
check-ins, Lits, stories, RSVPs, event activity — but at geographic rather than venue
granularity, over a rolling window.

**Privacy rules — non-negotiable:**

- Crowd Pulse is **always aggregate**. It never exposes an individual's location, path, or
  presence to anyone outside their explicit friend graph.
- **Minimum cohort size.** A geographic cell with fewer than a floor number of contributors
  renders as "no signal," never as a precise low number. Small counts are re-identifiable.
- **Coarse geography.** Pulse operates on binned cells, not raw coordinates.
- **No historical trails.** Pulse is a snapshot of now plus short-term trend. We do not build or
  expose per-user movement history.
- **Opt-out is honored everywhere.** A user who disables location contribution is excluded from
  aggregation, not merely hidden from the UI.

**Why it matters.** Party Score answers "should I go here?" Crowd Pulse answers "where is the
night happening?" The first is a decision; the second is orientation. Visitors need orientation
before they can make decisions, which is exactly the Ocean City visitor problem.

## Discover Tonight Philosophy

Discover Tonight is the home surface and the app's thesis in UI form. It already exists —
`partysafari/src/components/discover/DiscoverTonightExperience.tsx`, `VenuePartyCard.tsx`, and
`partysafari/src/hooks/useDiscoverTonightData.ts` — backed by migration
`017_discover_tonight_stabilization.sql`.

### Ranking priorities, in order

1. **Happening now** — live check-ins, active stories, events currently running.
2. **Momentum** — rising beats already-peaked. A `trend: "up"` venue outranks an equal-score
   `trend: "down"` venue.
3. **Proximity** — walkable beats a fifteen-minute drive, always. Distance is already computed
   per card.
4. **Friends** — friend presence is a strong boost, surfaced explicitly ("3 friends here").
5. **Fit** — genre, vibe, cover charge, food/VIP availability.
6. **Reputation** — last, and only as a tiebreaker.

### What Discover Tonight refuses to do

- **No generic star ratings as the primary sort.** Yelp already exists and it cannot tell you
  about tonight.
- **No paid placement in the organic ranking.** Venue partnerships buy tools, analytics, and
  event promotion — never a higher Party Score. This is a permanent policy. The moment ranking
  is purchasable, the product is worthless.
- **No stale cards.** Anything shown must have a visible freshness anchor: a timestamp, a live
  count, a story from the last hour.
- **No empty states that shrug.** A quiet Tuesday in April is a real answer. Show the best of a
  quiet night and say plainly that it's quiet, rather than padding the list.

### Interaction targets

Open to first meaningful card in under one second on a mid-range phone over LTE. The surface is
scroll-first, thumb-reachable, and legible in a dark room at arm's length.

## Community-Created Events

Anyone can create a night. `partysafari/src/app/events/create/page.tsx` already exists; venue
owners get richer tooling through `partysafari/src/components/venue-owner/EventsManager.tsx`.

**Why this matters.** In a beach town the best nights are often not venue-programmed — house
parties, beach bonfires, a DJ friend's pop-up, a bar crawl someone organized in a group chat.
If PartySafari only carries venue-programmed events, it is a listings site.

### Trust tiers

| Tier | Who | Reach |
| --- | --- | --- |
| Verified venue | Claimed and confirmed venue account | Full discovery, push-eligible |
| Founder / trusted creator | Established history, no violations | Full discovery |
| Standard user | Authenticated, some account history | Discovery with a community label |
| New account | Recently created | Visible to friends and followers only until first event completes cleanly |

### Moderation

- **Post-moderation by default, pre-moderation on escalation.** We do not gate every event
  behind human review — that kills spontaneity, which is the point. We review fast when flagged.
- **Reporting is one tap** and available on every event.
- **Automated pre-screening** for known spam patterns, ticket-scalping links, off-platform
  payment solicitation, and prohibited content.
- **Venue consent.** An event cannot claim a venue as its host without that venue's confirmation.
  Unconfirmed events show a neutral location, not a venue endorsement.
- **Safety escalation.** Reports involving underage promotion, harassment, or physical safety
  bypass the queue and go straight to a human, with the event hidden pending review.
- **Consequences are graduated:** reduced reach → creation suspension → account removal.
- **Creator accountability is visible.** Every community event shows its creator. Anonymous
  event creation is not supported.

### Anti-abuse

Community events feed the Party Score through `eventLift`, so a fake event is a ranking attack.
Events from low-trust creators contribute reduced weight until the event demonstrates real
engagement (RSVPs from established accounts, check-ins at the location, stories).

## Founder Program

The Founder Program is how Ocean City gets built with its community rather than at it.

### Founding Users

The first cohort of Ocean City locals, seasonal workers, bartenders, DJs, and regulars.

- **Permanent Founder badge** on their profile, visible forever. Not purchasable, not
  transferable, never issued again after the cohort closes.
- **Roadmap voice.** A direct channel to the team and a real vote on what gets built next.
- **Early access** to features behind a flag before public rollout.
- **Elevated trust weighting** in scoring and moderation, because they have skin in the game.
- **Recognition in-product** — Founder contributions to Party Score and Crowd Pulse are
  acknowledged, and Founders are credited in the launch announcement.

### Founding Venues

The Ocean City venues that commit before public launch.

- **Verified partner status** and priority support with a named human contact.
- **Free access to venue analytics** — Party Score history, crowd curves, RSVP conversion,
  peak-hour data — permanently, not as a trial.
- **Event promotion tooling** at no cost through the first full season.
- **Input on the venue-owner product.** Founding venues review the venue dashboard roadmap.
- **Explicitly not included: ranking influence.** Founding venues get better tools and better
  data. They do not get a higher Party Score. We say this out loud in the partnership agreement
  so there is never an awkward conversation later.

### Program mechanics

The cohort is capped and closes at public Ocean City launch. Scarcity is the point: a Founder
badge means "was there before it worked," and that only stays true if we stop issuing them.

## Launch Roadmap

### Phase 0 — Foundation (current)

Engineering blueprint in place (this document, `CONTRIBUTING.md`, `AI_CONTEXT.md`). Party Score,
Discover Tonight, realtime presence, stories, RSVPs, and the radar/map surfaces exist and are
stabilized. Focus: performance, correctness, and removing the temporary runtime kill switches.

**Exit criteria:** clean build, clean lint, no runtime kill switch permanently enabled, Discover
Tonight stable under real data on a mid-range phone.

### Phase 1 — Private Beta, Ocean City

Invite-only. Founding Users and Founding Venues.

- Full venue coverage of the Ocean City strip with verified hours, location, and imagery.
- Lit Button shipped with full anti-abuse enforcement.
- Crowd Pulse v1 over the Ocean City map.
- Nightly ground-truth spot checks: does the ranking match reality?
- Direct feedback channel to the Founder cohort.

**Exit criteria:** on three consecutive peak nights, the top-ten ranking matches ground truth;
crash-free session rate above 99.5%; Founders report the app changed where they actually went.

### Phase 2 — Public Ocean City Launch

Open registration, no invite required.

- Community-created events open to all trust tiers with moderation staffed.
- Venue owner dashboard generally available.
- PSI v1: personalized ranking and one-sentence explanations.
- Push notifications for friend activity and rising venues, conservatively throttled.

**Exit criteria:** sustained peak-night active usage; organic (non-invited) users are a majority
of nightly actives; venues report inbound traffic they attribute to the app.

### Phase 3 — Expansion

Additional beach and college towns, chosen for the same density-plus-seasonality profile that
makes Ocean City work: Dewey Beach, Rehoboth, Virginia Beach, Myrtle Beach, and college towns
with concentrated bar districts.

Expansion is **town by town, never region by region**. Each new town repeats the Founder Program
from scratch. A town is not launched until it has local Founders and real venue coverage —
a cold, empty map in a new city damages the brand more than not being there at all.

## Engineering Principles

1. **One implementation per concept.** One scoring engine. One Supabase client factory. One
   crowd-level mapping. Duplicated logic is treated as a defect, not a style preference.
2. **Evolve, don't fork.** When existing code doesn't fit a new requirement, extend it or write
   an adapter. Parallel implementations are how the score silently drifts between surfaces.
3. **Degrade, never crash.** The Party Score engine already tolerates missing columns and failed
   queries by falling back and recording placeholders. Every data path holds this bar: a broken
   query loses a feature, not the page.
4. **Realtime is fragile — treat it as such.** Subscriptions must be scoped, deduplicated, and
   torn down on unmount. Channel names must be unique per subscription target.
5. **Subscribe to what's visible.** The `useVisibleVenueIds` IntersectionObserver hook plus the
   `subscribeVisibleOnly` option exist so that a fifty-venue list doesn't open fifty channels.
   Any new live surface uses this pattern.
6. **Cache deliberately, invalidate honestly.** Short TTLs, in-flight request de-duplication, and
   a visible `updatedAt` on anything time-sensitive.
7. **Types are the contract.** `strict` is on. `any` requires a comment explaining why.
8. **Migrations are append-only and idempotent.** New numbered file in `partysafari/db/`, written
   with `IF NOT EXISTS` / `DROP POLICY IF EXISTS` guards so it can be re-run safely. Never edit a
   migration that has been applied.
9. **RLS on every table, always.** Client-side checks are user experience. Row Level Security is
   the actual security boundary.
10. **Small commits, always deployable.** `main` is expected to be shippable at every commit.
11. **Kill switches are temporary.** `TEMP_KILL_SWITCH` in `partysafari/src/lib/runtimeKillSwitch.ts`
    is a debugging instrument. A flag left enabled is an open bug with a deadline.

## Performance Goals

Mobile-first is not a layout choice. It is the operating constraint: a mid-range Android phone,
one bar of LTE, 20% battery, midnight, outdoors.

| Metric | Target |
| --- | --- |
| Discover Tonight — first meaningful card | < 1.0s on mid-range mobile / LTE |
| Any tap → visible feedback | < 100ms (optimistic UI where the write is slow) |
| Party Score read (cached) | Instant; no network on cache hit |
| Party Score read (cold, batched) | < 500ms for a full viewport of venues |
| Realtime update → UI reflection | < 2s |
| Interaction to Next Paint | < 200ms |
| Cumulative Layout Shift | < 0.1 — live-updating numbers must reserve space |
| Crash-free sessions | > 99.5% |
| Open realtime channels per screen | Bounded by visible cards, never by total cards |

**Resilient realtime** means: exponential backoff on reconnect, no thundering herd after a
network blip, polling fallback when websockets are unavailable, and no unbounded state growth
from a long-lived subscription. Backgrounding the app must not leave subscriptions burning
battery.

**Performance is a release blocker, not a follow-up ticket.** A feature that regresses the
Discover Tonight interaction budget does not ship, however complete it is.

## UI Principles

1. **Dark by default.** The app is used in dark rooms and on dark streets. Bright surfaces are
   physically uncomfortable and destroy night vision.
2. **Glanceable.** The core answer — how lit is it, how far, who's there — must be readable in
   under two seconds, at arm's length, with one hand.
3. **Thumb-first.** Primary actions sit in the lower two-thirds of the screen. Nothing critical
   in a top corner.
4. **Motion means something.** Animation communicates energy level and state change, never
   decoration. `prefers-reduced-motion` is honored — the crowd-level utilities already do this
   and every new animation must follow.
5. **Live things look live.** Anything realtime carries a visible indicator and a timestamp.
   Anything stale says so.
6. **Honest emptiness.** Empty and low-confidence states are designed deliberately, with a real
   next action. They are never an afterthought.
7. **Consistent vocabulary.** `Quiet` / `Getting Busy` / `Busy` / `Packed` is the crowd language
   across the entire product. Surfaces do not invent synonyms.
8. **Accessible contrast.** Neon on near-black still has to pass contrast requirements. Color is
   never the only carrier of meaning — pair it with text or an icon.
9. **Reuse the component library.** New one-off card variants are a review finding.

## Definition of Done

A change is done when **all** of the following are true:

- [ ] `npm run build` passes from `partysafari/` with no errors.
- [ ] `npm run lint` passes with no new warnings.
- [ ] TypeScript compiles clean under `strict`; no new `any` without a justifying comment.
- [ ] Tested on a real mobile viewport — 375px wide minimum — not just a desktop browser resize.
- [ ] Tested on the Vercel preview deployment, not only locally.
- [ ] Realtime subscriptions (if touched) are verified to unsubscribe on unmount, with no
      duplicate channels and no console errors after navigation.
- [ ] Loading, empty, error, and low-confidence states are all implemented.
- [ ] No existing UI contract broken: component props are backwards compatible or every call
      site is updated in the same change.
- [ ] No duplicated business logic; existing hooks and libraries were reused where they fit.
- [ ] Any new SQL is a new numbered, idempotent migration with RLS enabled and appropriate
      policies.
- [ ] No secrets, keys, or service-role credentials in client code.
- [ ] The pull request explains *why*, not only *what*.
- [ ] It passes the Founder Test.

## The Founder Test

Before shipping anything, answer this out loud:

> **"Would a founding user in Ocean City actually use this tonight?"**

Not "is this technically impressive." Not "did we say we'd build it." Not "is it on the roadmap."
Would a bartender finishing a shift at 1am, or a group of five deciding where to go at 10:30pm,
open this and get value from it *tonight*?

Supporting questions when the answer is unclear:

- Does it help someone decide where to go, or does it just add something to look at?
- Would they notice if we removed it?
- Does it work with one hand, in the dark, on bad LTE?
- Would they show it to a friend?

**If the answer is no, it does not ship.** Cut it, or cut it down until the answer is yes. This
test outranks personal attachment to the work, including the team's.

## Launch Lock

**Launch Lock** is a hard feature freeze that begins at a declared date before public Ocean City
launch and lifts after the launch has stabilized.

### The rule

After Launch Lock takes effect, **only bug fixes, performance work, copy corrections, content
and venue data updates, and visual polish may merge.** No new features. No new scope. No "it's
small." No exceptions for anyone, founders included.

### What is allowed during Launch Lock

- Fixes for crashes, data corruption, and incorrect scoring.
- Performance regressions and optimizations against the stated budgets.
- Copy, typo, and accessibility corrections.
- Venue and content data updates.
- Visual polish that changes no behavior.
- Security fixes and dependency patches for known vulnerabilities.

### What is not allowed

- New screens, new endpoints, new tables.
- New dependencies.
- Refactors "while we're in there."
- Changes to Party Score weights or ranking behavior.
- Anything that invalidates completed launch testing.

### Why

Every feature added in the final stretch is untested under real load and arrives with no time to
find out it was a mistake. The cost of shipping one week later with a solid product is small.
The cost of a broken launch weekend in a town where word of mouth is the entire distribution
strategy is not recoverable within the season.

### Mechanics

- The Launch Lock date is announced in advance and pinned in the repository.
- Anything not merged by the lock date moves to the post-launch milestone. It is not lost; it is
  scheduled.
- Breaking the lock requires explicit written sign-off from the product owner and a documented
  reason in the pull request. "It's basically done" is not a reason.
- The lock lifts only after the launch is declared stable against the Phase 2 exit criteria.
