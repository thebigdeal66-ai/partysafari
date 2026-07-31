# Security Notes

Living record of security-relevant decisions and known gaps. Update when the underlying
behaviour changes — do not record aspirations here, only what is true today.

---

## Venue owner authorization

**Status:** application layer fixed and fail-closed (Sprint 001, branch
`fix/venue-owner-authorization`). Venue *metadata* is owner-gated in the database by
`partysafari/db/018_venue_ownership.sql` (Sprint 002 Part 1) and venue-scoped *event* content by
`partysafari/db/019_venue_content_rls.sql` (Sprint 002 Part 2) — both on branch
`fix/venue-owner-rls-enforcement`. **Two venue-scoped tables remain unsecured because no migration
defines them — see "Remaining gaps" at the end of this section.**

### Canonical ownership mechanism

`/venue-owner` resolves the operator's venue through **exactly one** relationship:

```
venues.owner_id = auth.uid()
```

This is declared once in `src/app/venue-owner/page.tsx` as `VENUE_OWNER_COLUMN`. No other column,
table, role, or profile field grants venue-owner access. If that lookup returns an error or no
row, the dashboard renders the empty state ("No venue is connected to this account.") and no
venue-scoped query or mutation runs.

Prior behaviour, now removed: `findVenueForUser()` probed five speculative columns (`owner_id`,
`created_by`, `profile_id`, `manager_id`, `user_id`) and, when none matched, **returned the first
venue in the database**. Because none of those columns exist on `public.venues` (see below), every
authenticated user was handed the same arbitrary venue with the dashboard's full edit surface.

### `venues.owner_id` — added by migration 018

Re-verified in Sprint 002: through `017_discover_tonight_stabilization.sql`, `public.venues` had
**no ownership column at all**:

```
id, slug, name, venue_type, city, state, latitude, longitude, image_url, photo_url,
current_status, music_genres, drink_specials, description, vip_available, food_available,
created_at, updated_at
```

There is still no `venue_owners` join table and no `venue_claims` table anywhere in `db/`.

`partysafari/db/018_venue_ownership.sql` adds:

```sql
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_venues_owner_id ON public.venues (owner_id);
```

Nullable, `ON DELETE SET NULL` (a deleted auth user unowns the venue rather than deleting it).
The type is `uuid`, matching `auth.uid()` and the `userId` the dashboard passes to
`.eq("owner_id", userId)` — no application change was required to align them.

Until an owner is assigned (see "Backfill status"), the `owner_id` filter matches no row, the app
treats that as denial, and **every user still sees the empty state**. That remains the intended
fail-closed outcome; the difference is that the query now returns zero rows instead of erroring
with PostgREST `42703`.

> Caveat, still true: every migration uses `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT
> EXISTS`, so a Supabase project whose `venues` shape predates the repo may differ. The migrations
> are the only source of truth available in-repo; verify against the live database before
> concluding otherwise.

### RLS enforcement status

| Table | RLS | Policies | Effect |
|---|---|---|---|
| `venues` | Enabled | `SELECT USING (TRUE)` (unchanged) plus `UPDATE TO authenticated USING/WITH CHECK (owner_id IS NOT NULL AND owner_id = auth.uid())` from 018. No INSERT/DELETE policy. Grants are `SELECT` to `anon`, `authenticated` and `UPDATE` to `authenticated`. | Reads stay fully public. **Updates are restricted to the assigned owner; INSERT and DELETE remain service-role only.** |
| `events` | Enabled | Rewritten by 019 into two parallel branches per command — see "Venue-scoped content RLS" below. SELECT left as 012 wrote it. | Venue events are owner-only for INSERT/UPDATE/DELETE; community events stay creator-only. Reads unchanged. |
| `venue_checkins` | Enabled | Read is public for unexpired rows; writes restricted to `auth.uid() = profile_id`. | Per-venue live crowd counts are public data. Not owner-managed; left unchanged by 019. |
| `stories` | Enabled | INSERT and the soft-delete UPDATE check `auth.uid() = author_id`. No venue-ownership gate, by design. | `venue_id` is an author-chosen tag, not venue-managed content. Left unchanged by 019 — see the rationale below. |
| `event_performers` | **No migration in `db/`** | Unknown. | Unverified; the dashboard deletes and inserts rows here. Still unfixable — see "Remaining gaps". |

### `is_venue_owner()` — was a no-op, fixed in 018

`db/012_live_events_system.sql` defined:

```sql
p_user_id::TEXT = ANY (ARRAY[
  COALESCE(to_jsonb(v) ->> 'owner_id', ''), ... four more ...
])
```

`to_jsonb(v) ->> 'owner_id'` returns `NULL` when the column is absent, which `COALESCE` turns into
`''`. A UUID string never equals `''`, so **`is_venue_owner()` returned `FALSE` for every user and
every venue.** The `to_jsonb` indirection meant this failed silently instead of raising, so the
policies looked enforced while granting nothing.

Migration 018 replaces it with a direct comparison. The signature
`is_venue_owner(p_user_id UUID, p_venue_id UUID)` is preserved, so all five call sites in 012's
`events` policies keep resolving with no policy rewrite:

```sql
CREATE OR REPLACE FUNCTION is_venue_owner(p_user_id UUID, p_venue_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.venues v
    WHERE auth.uid() IS NOT NULL
      AND p_user_id IS NOT NULL
      AND p_venue_id IS NOT NULL
      AND v.id = p_venue_id
      AND v.owner_id = p_user_id
  );
$$;
```

Properties: no `to_jsonb`/`COALESCE` probing; `EXISTS` guarantees a real boolean rather than
`NULL`; returns `FALSE` when the caller is unauthenticated (`auth.uid() IS NULL`) and when either
argument is `NULL`. `SECURITY DEFINER` with a pinned `search_path` is new — it keeps the lookup
working regardless of the caller's visibility of `venues` and prevents `search_path` shadowing. It
is not used in any `venues` policy, so there is no RLS recursion.

Downstream effect on `events`: while `is_venue_owner()` always returned false, `INSERT` (which
requires `auth.uid() = created_by AND is_venue_owner(...)`) was denied for everyone. After 018 it
succeeds for a user who is the assigned owner of the target venue — which is the intended
behaviour, and takes effect only once an owner is actually assigned. Part 2 (019) then removed the
`OR auth.uid() = created_by` branch from `UPDATE`/`DELETE`.

## Venue-scoped content RLS — migration 019

`partysafari/db/019_venue_content_rls.sql` (Sprint 002 Part 2). It changes policies on **one**
table, `events`, and adds no columns, tables or functions. It depends on 018 for `venues.owner_id`
and the corrected `is_venue_owner()`.

### Why `events` needed two models, not one

`events.venue_id` is nullable and the app writes two genuinely different kinds of row:

| Kind | `venue_id` | Written by |
|---|---|---|
| Venue event | NOT NULL | `/venue-owner` — `EventsManager.tsx` and the Tonight tab in `venue-owner/page.tsx`, both of which set `venue_id` to the dashboard's venue |
| Community event | NULL | `/events/create`, reachable by any signed-in user. It records the location as free-text `venue_name` and never sets `venue_id`. |

012 collapsed both into `is_venue_owner(auth.uid(), venue_id) OR auth.uid() = created_by`. That
single `OR` caused two distinct problems:

1. **Authorship outlived ownership.** Whoever inserted a venue's event held UPDATE and DELETE on it
   permanently, including after the venue changed hands.
2. **`venue_id` was spoofable.** The UPDATE policy repeated the same `OR` in `WITH CHECK`, so the
   creator of a community event could re-point it at *any* venue in the database — the resulting
   row still satisfied `auth.uid() = created_by`, and it then rendered on that venue's page.

019 splits the two models into separate policies per command. Postgres ORs permissive policies of
the same command together, and for UPDATE evaluates `USING` against the old row and `WITH CHECK`
against the new one, so each branch is self-contained: the venue branch never matches a NULL
`venue_id`, the community branch never matches a non-NULL one, and moving a row between them
requires satisfying the destination branch on its own terms.

### Policies after 019

| Command | Venue branch | Community branch |
|---|---|---|
| SELECT | **Unchanged from 012** — `status IN ('active','published','live','scheduled') OR is_venue_owner(...) OR auth.uid() = created_by`. Still public to `anon`. | same policy |
| INSERT | `WITH CHECK (venue_id IS NOT NULL AND created_by = auth.uid() AND is_venue_owner(auth.uid(), venue_id))` | `WITH CHECK (venue_id IS NULL AND created_by = auth.uid())` |
| UPDATE | `USING` **and** `WITH CHECK` = `venue_id IS NOT NULL AND is_venue_owner(auth.uid(), venue_id)` | `USING` **and** `WITH CHECK` = `venue_id IS NULL AND created_by = auth.uid()` |
| DELETE | `USING (venue_id IS NOT NULL AND is_venue_owner(auth.uid(), venue_id))` | `USING (venue_id IS NULL AND created_by = auth.uid())` |

All six write policies are `TO authenticated`. `auth.uid()` is NULL for `anon`, so every predicate
evaluates NULL → denied; the role clause makes that explicit rather than incidental.

SELECT was deliberately **not** touched. 012's policy is what Discover Tonight, venue pages and the
events listing read as `anon`, and restating it risked narrowing it. Grants are restated
(`SELECT` to `anon, authenticated`; `INSERT, UPDATE, DELETE` to `authenticated`) to match 018's
style; they do not widen anything, since RLS still decides which rows a grant reaches.

### Tables examined and deliberately left unchanged

- **`stories`** (nullable `venue_id`). Part 1 recorded "any user can post a story tagged to any
  `venue_id`" as a gap. On inspection it is **intended product behaviour**, not an escalation:
  `StoryComposer.tsx` shows a "Tag Venue" dropdown to every signed-in user, and the venue page,
  event page and feed all pre-seed it. Gating INSERT on `is_venue_owner()` would remove venue
  tagging for everyone except the (currently zero) assigned owners. The existing policies already
  stop posting or editing as another user, and the absence of a DELETE policy stops hard deletes.
  What is left is a *moderation* gap — a venue owner cannot take down a story tagged to their venue
  — which needs a product decision and UI, not an RLS rewrite. Reclassified below, not fixed.
- **`venue_checkins`** (`venue_id` NOT NULL). Self-service check-ins, already scoped to
  `auth.uid() = profile_id` on INSERT and DELETE with no UPDATE policy. A venue owner has no write
  interest in these rows.

### Tables with no promotions / analytics equivalent

There is **no** `promotions`, `venue_promotions`, `featured_venues`, `venue_analytics`,
`venue_stats` or `venue_metrics` table — not in `db/`, and no `.from()` call in the app references
one. Featured status is a `featured` boolean column on `events`, toggled from the dashboard and
therefore covered by 019's UPDATE policy. The dashboard's Analytics tab renders hardcoded
placeholder data and reads no table. Nothing here to secure.

---

## Sprint 002 — combined residual risk (Parts 1 and 2)

The application no longer leaks another venue's data through the dashboard, but the UI is not the
security boundary. `/venue-owner` is a client component; there is no `middleware.ts`, no
`app/api/**/route.ts`, and no server component in the venue-owner path. Every query goes directly
from the browser to PostgREST with the anon key, so an authenticated attacker can always bypass the
UI and call the REST API directly. What actually stops them today:

| Attack via direct API call | Blocked by | Real? |
|---|---|---|
| Read another venue's row | Nothing — `venues` SELECT is `USING (TRUE)` | Public by design; no fix needed |
| Modify another venue's row | 018's UPDATE policy: `owner_id = auth.uid()`, enforced in both `USING` and `WITH CHECK` | **Yes, DB-enforced** |
| Claim an unowned venue by setting `owner_id` on itself | Same policy — `USING` requires `owner_id = auth.uid()`, which no `NULL` row satisfies | **Yes, DB-enforced** |
| Hand their venue to another account | `WITH CHECK` requires the post-update `owner_id` to still be `auth.uid()` | **Yes, DB-enforced** |
| Insert or delete a venue | No INSERT/DELETE policy and no INSERT/DELETE grant | **Yes, DB-enforced** |
| Read another venue's events / check-ins | Nothing — both are publicly readable | Public by design |
| Create an event for a venue they don't own | 018's `is_venue_owner()` compares `venues.owner_id`; 019's INSERT policy also requires `venue_id IS NOT NULL AND created_by = auth.uid()` | **Yes, DB-enforced** (previously denied everyone by accident) |
| Modify or delete an event at a venue they don't own | 019 — the `OR auth.uid() = created_by` branch is gone from UPDATE and DELETE | **Yes, DB-enforced** |
| Re-point their own community event at someone else's venue | 019 — the community branch's `WITH CHECK` requires `venue_id IS NULL`, and the venue branch's requires ownership of the new venue | **Yes, DB-enforced** |
| Move an event they own from their venue to another venue | Same — `USING` passes on the old venue, `WITH CHECK` fails on the new one | **Yes, DB-enforced** |
| Create a community event (`venue_id IS NULL`) | Allowed for any signed-in user, `created_by = auth.uid()` only | Intended; grants no venue-owner rights |
| Post a story tagged to a venue they don't own | Nothing — `stories` INSERT only checks `author_id` | Intended (open venue tagging). **Moderation gap, not escalation** |
| Mutate `event_performers` for someone else's event | Unknown — no migration defines its RLS | **Unverified — still open** |

Net: venue *metadata* (018) and venue-attached *events* (019) are both protected at the database
level by explicit owner-scoped policies rather than by the absence of a write policy. Event
mutation is now governed by venue ownership, and the community-event model survives alongside it
without either path reaching the other's rows. The one venue-scoped table that remains genuinely
unprotected is `event_performers`, and it cannot be fixed from `db/` because nothing in `db/`
defines it.

Two smaller risks introduced or left open by 018:

- `owner_id` is readable by `anon`. `venues` SELECT is `USING (TRUE)` and the dashboard calls
  `select("*")`, so the owning `auth.users.id` is now public. It is an opaque UUID, not a
  credential, but it does link a venue to an account identifier. Hiding it would require
  column-level grants, which would break `select("*")`; deliberately not attempted here.
- The `venues` UPDATE policy grants the whole row. An owner can edit any venue column, including
  ones the dashboard does not expose (`slug`, `latitude`/`longitude`, `city`). Narrowing that needs
  a column-level grant or a trigger; not in scope for this migration.

And three left open by 019:

- **An owner can detach their own event from their venue.** Setting `venue_id` to NULL on an event
  they both own the venue for *and* created satisfies the community branch's `WITH CHECK`, turning
  it into their community event. It removes the row from the venue rather than exposing it to
  anyone else, so it is a data-integrity wrinkle, not an escalation. A trigger pinning `venue_id`
  after insert would close it.
- **Legacy rows are re-owned, not grandfathered.** Any existing event with a non-NULL `venue_id`
  now answers only to that venue's owner, regardless of who created it. Since `venues.owner_id` is
  NULL everywhere (see Backfill status), the practical effect today is that **no one can update or
  delete a venue-attached event** until an owner is assigned. That is fail-closed and intentional,
  but it is a behaviour change for anyone currently editing events through the dashboard.
- **`created_by` is not pinned on venue events.** The INSERT policy requires
  `created_by = auth.uid()`, but the UPDATE policy's venue branch does not re-assert it, so an
  owner can rewrite `created_by` on their own venue's events. It grants nothing — authorship no
  longer confers any right on a venue event — but it does let the audit field be falsified.

### Backfill status

**No backfill was performed. `venues.owner_id` is `NULL` on every existing row.**

Nothing in the repository maps an auth user to a venue: there is no `venue_owners` table, no
`venue_claims` table, no `INSERT INTO venues` seed anywhere in `db/`, and no fixture data. Guessing
an assignment would silently grant a real account write access to a real venue, so the migration
leaves the column empty and defers the decision.

**Owner assignment is required before any venue-owner functionality works.** Until then
`/venue-owner` renders the empty state for every user and `is_venue_owner()` returns false for
every venue — fail-closed, the same observable behaviour as before 018.

Assign owners one at a time, after confirming the pairing out of band. The UUID below is a
placeholder, not a real account:

```sql
UPDATE public.venues
   SET owner_id = '00000000-0000-0000-0000-000000000000'  -- replace with a real auth.users.id
 WHERE slug = 'replace-with-venue-slug';
```

Verify before and after:

```sql
SELECT id, slug, name, owner_id FROM public.venues ORDER BY name;
```

### Remaining gaps after Sprint 002

| Table | State | Outstanding work |
|---|---|---|
| `venues` | Fixed (018) | Owner assignment (see Backfill status). Column-level write scoping if the whole-row UPDATE grant proves too broad. |
| `events` | Fixed (019) | Optional: a trigger to pin `venue_id` and `created_by` after insert. |
| `stories` | Reclassified, not fixed | Venue tagging is open to all authors by design. If venue owners should be able to take down a story tagged to their venue, that needs a moderation UI and a policy — a product decision, not a bug fix. |
| `venue_checkins` | Correct as-is | None. |
| `event_performers` | **Blocked by schema drift** | No `CREATE TABLE` in `db/`, so its live columns and RLS state are unknown, yet `/venue-owner` reads, inserts and deletes rows in it. Enabling RLS blind would blank the table for every reader. Bring it under version control first, then gate writes through `event_id -> events.venue_id -> is_venue_owner()`. |
| `promotions` / analytics | Does not exist | Nothing to secure — confirmed absent from both `db/` and every `.from()` call in the app. |

Broader drift, unchanged by this sprint: PROJECT_INDEX.md §13.2 records that **ten of the
twenty-six tables the app queries have no `CREATE TABLE` anywhere in `db/`** (`profiles`,
`friend_requests`, `conversations`, `conversation_participants`, `direct_messages`, `requests`,
`request_responses`, `safari_plans`, `safari_stops`, `event_performers`), as do nine of the ten
RPCs it calls. `db/` cannot reproduce a working database; the schema of record lives only in the
hosted Supabase project. Every RLS claim in this document is therefore a claim about **the
migrations**, and holds against the live database only insofar as the two agree.

### Verification performed for migrations 018 and 019

Both files were parsed with `libpg_query` (via `pglast` v8.4), the same grammar PostgreSQL itself
uses. 018: 9 top-level statements plus the function body, clean. 019: 15 top-level statements
(1 `ALTER TABLE`, 6 `DROP POLICY`, 6 `CREATE POLICY`, 2 `GRANT`), clean.

**Neither migration was executed against a live or local database** — Docker is unavailable in the
build environment, so `supabase db start` / `supabase db lint` could not run. Syntax is verified;
runtime behaviour (policy evaluation, the `auth.users` foreign key, the grants) is not. The
policy-interaction reasoning in this document — in particular that Postgres ORs permissive policies
per command and evaluates UPDATE `USING` on the old row and `WITH CHECK` on the new one — is
derived from the documented semantics, not observed.

For 019 the application was also re-checked, since the events write paths are the thing the new
policies constrain: `tsc --noEmit` clean, `eslint` 0 errors (169 pre-existing warnings), and
`next build` successful across all 20 routes. No TypeScript changed in Part 2, so these confirm no
regression rather than validating the policies.
