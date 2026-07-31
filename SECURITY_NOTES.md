# Security Notes

Living record of security-relevant decisions and known gaps. Update when the underlying
behaviour changes — do not record aspirations here, only what is true today.

---

## Venue owner authorization

**Status:** application layer fixed and fail-closed (Sprint 001, branch
`fix/venue-owner-authorization`). Venue *metadata* is owner-gated in the database by
`partysafari/db/018_venue_ownership.sql` (Sprint 002 Part 1) and venue-scoped *event* content by
`partysafari/db/019_venue_content_rls.sql` (Sprint 002 Part 2) — both on branch
`fix/venue-owner-rls-enforcement`, neither yet applied anywhere.

**Both migrations were reconciled against a read-only snapshot of the live Supabase schema and
`pg_policies` taken 2026-07-31, and were corrected as a result.** The repo's numbered `db/001`–`017`
files were never applied to production, so live carries differently-named, looser policies that the
originals failed to drop — which made both migrations inert against the vulnerability they claim to
close. See "`db/001`–`017` were never applied to production" near the end of this section; read it
before writing any further migration. Claims below marked *verified live* were checked against that
snapshot; the rest describe the migration files only.

No venue-scoped table is left writable by the wrong party. `event_performers` is still absent from
`db/` but is fail-closed live — see "Remaining gaps".

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
venue in the database**. Live `venues` does carry two of those five columns (`owner_id` and
`created_by` — see below), but both are `NULL` on all 4 rows, so no probe ever matched and every
authenticated user was handed the same arbitrary venue with the dashboard's full edit surface.

### `venues.owner_id` — already exists live; 018's `ADD COLUMN` is a no-op there

Earlier revisions of this document stated that `public.venues` had **no ownership column at all**,
on the basis that `017_discover_tonight_stabilization.sql` defines the table without one. **That was
false against production.** Verified live 2026-07-31:

| Property | Live value |
|---|---|
| Column | `owner_id`, `uuid`, nullable — **already exists** |
| Foreign key | `venues_owner_id_fkey` → **`public.profiles.id`** |
| Index | `venues_owner_idx` on `(owner_id)` — already exists |
| Related | `created_by` (nullable `uuid`) also exists, separate from `owner_id` |
| Data | 4 venues; **0** with `owner_id`, **0** with `created_by` |

`018_venue_ownership.sql` still carries the column definition so a database built from `db/` alone
ends up equivalent, but against production it changes nothing:

```sql
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
```

`ADD COLUMN IF NOT EXISTS` skips the **entire** clause when the column is present, so the
`auth.users(id)` reference and the `ON DELETE SET NULL` rule written in 018 are **never applied to
production**. Live keeps its own FK to `public.profiles.id`. `profiles.id` in turn references
`auth.users.id`, so the chain is 1:1 — but the literal FK target differs, and that matters for
owner assignment: **any value written to `owner_id` must be an existing `public.profiles.id`.**
Assigning a raw `auth.users.id` for an account with no `profiles` row raises a foreign-key
violation. See "Backfill status".

018 no longer creates an index. An earlier revision created `idx_venues_owner_id`; because
`IF NOT EXISTS` matches on index *name*, that would have added a second redundant B-tree index
alongside live's `venues_owner_idx` rather than no-opping. The statement was removed.

The type is `uuid`, matching `auth.uid()` and the `userId` the dashboard passes to
`.eq("owner_id", userId)` — no application change was required to align them. Until an owner is
assigned (see "Backfill status"), the `owner_id` filter matches no row, the app treats that as
denial, and **every user still sees the empty state** — the intended fail-closed outcome.

There is still no `venue_owners` join table and no `venue_claims` table anywhere in `db/`. Live does
have a `venue_admins` table (SELECT-self only, no write policies, 0 rows) that the repo has never
tracked; it grants nothing today.

### RLS enforcement status

| Table | RLS | Policies | Effect |
|---|---|---|---|
| `venues` | Enabled | `SELECT USING (TRUE)` plus `UPDATE TO authenticated USING/WITH CHECK (owner_id IS NOT NULL AND owner_id = auth.uid())` from 018. 018 **drops** live's pre-existing `venues_owner_insert`, `venues_owner_update` and `venues_owner_delete` and creates no INSERT/DELETE policy in their place. Grants are `SELECT` to `anon`, `authenticated` and `UPDATE` to `authenticated`. | Reads stay fully public. **Updates are restricted to the assigned owner; INSERT and DELETE become service-role only** — see "Reconciling venues writes against live" below. |
| `events` | Enabled | Rewritten by 019 into two parallel branches per command — see "Venue-scoped content RLS" below. 019 **drops** live's pre-existing `"Authenticated users can create events"`. SELECT is left untouched. | Venue events are owner-only for INSERT/UPDATE/DELETE; community events stay creator-only. Reads unchanged. |
| `venue_checkins` | Enabled | Read is public for unexpired rows; writes restricted to `auth.uid() = profile_id`. | Per-venue live crowd counts are public data. Not owner-managed; left unchanged by 019. |
| `stories` | Enabled | INSERT and the soft-delete UPDATE check `auth.uid() = author_id`. No venue-ownership gate, by design. | `venue_id` is an author-chosen tag, not venue-managed content. Left unchanged by 019 — see the rationale below. |
| `event_performers` | Enabled (live; **no migration in `db/`**) | Verified live: only `event_performers_select_public` (SELECT, `qual = true`). **No INSERT/UPDATE/DELETE policy exists.** | Reads are public. Writes are **already fail-closed** for every role — RLS is on and no permissive write policy matches, so the dashboard's insert/delete paths are inert live. Not a gap being left open; adding policies would widen access. See "Remaining gaps". |

### Reconciling `venues` writes against live

Earlier revisions of this document and of 018 stated that `venues` had **"no INSERT/DELETE
policy"** and that creation and removal were already service-role only. **That was false against
production.** Verified live 2026-07-31, `venues` carried five policies, none of them named or
described anywhere in `db/`:

```
venues_public_read    SELECT  roles=public               qual = true
venues_select_public  SELECT  roles=anon,authenticated   qual = true
venues_owner_insert   INSERT  roles=authenticated        with_check = COALESCE(owner_id, created_by) = auth.uid()
venues_owner_update   UPDATE  roles=authenticated        qual/with_check = COALESCE(owner_id, created_by) = auth.uid()
venues_owner_delete   DELETE  roles=authenticated        qual = COALESCE(owner_id, created_by) = auth.uid()
```

Two consequences the repo had not accounted for:

- **Any authenticated user could create a venue** with `created_by = self` and later update or
  delete it. The "service-role only" claim was aspirational, not descriptive.
- **018's UPDATE policy would have been inert.** `owner_id IS NOT NULL AND owner_id = auth.uid()`
  is a strict logical *subset* of `COALESCE(owner_id, created_by) = auth.uid()`, and permissive
  policies of the same command are OR'd. Leaving `venues_owner_update` standing means the effective
  rule stays live's looser one and the `owner_id`-only model never takes effect.

018 therefore drops all three write policies by their **live** names before creating its own:

```sql
DROP POLICY IF EXISTS venues_owner_update ON public.venues;
DROP POLICY IF EXISTS venues_owner_insert ON public.venues;
DROP POLICY IF EXISTS venues_owner_delete ON public.venues;
```

This is a **deliberate behaviour change**, chosen so the documented posture and the enforced posture
match. After 018: ownership is `owner_id` and nothing else — the `created_by` fallback is gone — and
because no INSERT or DELETE policy is created in their place, venue creation and removal genuinely
are service-role only. No existing row is affected (all 4 live venues have both columns `NULL`, so
the `COALESCE` predicate already evaluates to `NULL` for every caller), but future rows can no
longer be claimed by whoever inserted them.

The two duplicate public-SELECT policies are **not** dropped. All three SELECT policies (live's two
plus 018's `"Anyone can view venues"`) are `USING (TRUE)`, so the redundancy costs nothing and
removing it is outside the scope of a security fix. Recorded as a follow-up in "Remaining gaps".

Rollback caution: none of the three dropped policies can be reconstructed from `db/`. Take a
`pg_policies` snapshot before applying 018 — that snapshot is the only source for restoring them.

### `is_venue_owner()` — a repo-file bug that was never deployed; created fresh by 018

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

**But db/012 was never applied to production.** Verified live 2026-07-31: a `pg_proc` query for
`%venue_owner%` in the `public` schema returns **zero rows** — no such function exists live, and
neither do the `events` policies 012 defines. The "always returns FALSE" defect is real in the repo
file and was never deployed, so 018's `CREATE OR REPLACE` creates the function fresh against
production with no live dependents to break.

Migration 018 replaces it with a direct comparison, schema-qualified so 019's policy expressions
resolve unambiguously. The signature `is_venue_owner(p_user_id UUID, p_venue_id UUID)` is kept
identical to 012's so that any environment where 012 *was* applied keeps resolving:

```sql
CREATE OR REPLACE FUNCTION public.is_venue_owner(p_user_id UUID, p_venue_id UUID)
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

Downstream effect on `events`: 019's venue-branch policies gate INSERT, UPDATE and DELETE on this
function, so each succeeds only for the assigned owner of the target venue. **Live has 0 of 4
venues with `owner_id` set, so `is_venue_owner()` returns FALSE for every user and every venue
until an owner is assigned by hand** — the venue branch of every 019 policy is dead until then.
See "Backfill status".

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

The live baseline 019 actually starts from — verified 2026-07-31, and **not** what `db/012`
describes, since 012 was never applied:

```
"Authenticated users can create events"  INSERT  roles=authenticated  with_check = (auth.uid() = created_by)
"Anyone can view events"                 SELECT  roles=public              qual = true
events_select_published                  SELECT  roles=anon,authenticated  qual = (status = 'published')
```

**There is no UPDATE and no DELETE policy on `events` at all.** With RLS enabled and no matching
permissive policy, Postgres denies by default, so today nobody — not the creator, not a venue owner
— can update or delete any event through the API. That is fail-closed, and 019's UPDATE/DELETE work
is purely additive against it: it cannot narrow anything, only unblock the paths that are
currently broken.

The live INSERT policy is the one genuine, currently-exploitable hole: it constrains `created_by`
and says nothing about `venue_id`, so **any authenticated user can insert an event pointed at a
venue they do not own**, which then renders on that venue's page. This violates
`MASTERPLAN.md:339` ("An event cannot claim a venue as its host without that venue's
confirmation"). 019 drops that policy — see "Why the DROP in 019 is the whole fix" below.

`db/012` (unapplied) collapsed both event models into
`is_venue_owner(auth.uid(), venue_id) OR auth.uid() = created_by`. That single `OR` would have
caused two distinct problems, and 019 is shaped to avoid repeating them in any environment where
012 *was* applied:

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
| SELECT | **Untouched.** Live's `"Anyone can view events"` (`qual = true`) and `events_select_published` (`qual = status = 'published'`) both survive unchanged. Still public to `anon`. | same policies |
| INSERT | `WITH CHECK (venue_id IS NOT NULL AND created_by = auth.uid() AND is_venue_owner(auth.uid(), venue_id))` | `WITH CHECK (venue_id IS NULL AND created_by = auth.uid())` |
| UPDATE | `USING` **and** `WITH CHECK` = `venue_id IS NOT NULL AND is_venue_owner(auth.uid(), venue_id)` | `USING` **and** `WITH CHECK` = `venue_id IS NULL AND created_by = auth.uid()` |
| DELETE | `USING (venue_id IS NOT NULL AND is_venue_owner(auth.uid(), venue_id))` | `USING (venue_id IS NULL AND created_by = auth.uid())` |

All six write policies are `TO authenticated`. `auth.uid()` is NULL for `anon`, so every predicate
evaluates NULL → denied; the role clause makes that explicit rather than incidental.

### Why the DROP in 019 is the whole fix

019 issues one statement that earlier revisions of this branch did not:

```sql
DROP POLICY IF EXISTS "Authenticated users can create events" ON public.events;
```

Without it the migration is a **no-op against the only live vulnerability it claims to close**.
Permissive policies of the same command are OR'd, so with the live policy left standing the
effective INSERT rule would have been:

```
(auth.uid() = created_by)                                                            -- live, surviving
OR (venue_id IS NOT NULL AND created_by = auth.uid() AND is_venue_owner(...))        -- 019
OR (venue_id IS NULL AND created_by = auth.uid())                                    -- 019
```

which simplifies straight back to `created_by = auth.uid()`. The `venue_id` constraint is absorbed
entirely and venue_id spoofing on INSERT survives untouched. Every `DROP POLICY IF EXISTS` 019
already had targets a name from `db/012` — none of which exist live — so all of them silently
no-op there. Dropping the policy by its **live** name is what makes the venue-scoped check
reachable.

Rollback caution: once this DROP has run, the only INSERT policies on `events` are 019's two. A
rollback that removes them without restoring this one leaves `events` with no INSERT policy at all
and breaks event creation for everyone. Restore it verbatim:

```sql
CREATE POLICY "Authenticated users can create events" ON public.events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
```

### SELECT and grants

SELECT was deliberately **not** touched. Live's `"Anyone can view events"` (`qual = true`) is what
Discover Tonight, venue pages and the events listing read as `anon`; issuing any SELECT DDL here
could only narrow it. Because `qual = true` is OR'd with everything, it subsumes
`events_select_published` and **draft/unpublished events are already publicly readable regardless of
`status`**. That is a pre-existing live condition, unchanged by this PR, and tightening it is a
separate product decision — recorded in "Remaining gaps".

Grants are restated (`SELECT` to `anon, authenticated`; `INSERT, UPDATE, DELETE` to
`authenticated`) to match 018's style; they do not widen anything, since RLS still decides which
rows a grant reaches.

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
| Modify another venue's row | 018's UPDATE policy: `owner_id = auth.uid()`, in both `USING` and `WITH CHECK`. **Requires the DROP of live's `venues_owner_update`**, without which the looser `COALESCE(owner_id, created_by)` rule survives and OR's this one away | **Yes, DB-enforced** (only with the DROP) |
| Claim an unowned venue by setting `owner_id` on itself | Same policy — `USING` requires `owner_id = auth.uid()`, which no `NULL` row satisfies. Also requires the DROP: live's `COALESCE` predicate would let the `created_by` holder do exactly this | **Yes, DB-enforced** (only with the DROP) |
| Hand their venue to another account | `WITH CHECK` requires the post-update `owner_id` to still be `auth.uid()` | **Yes, DB-enforced** |
| Insert or delete a venue | 018 drops live's `venues_owner_insert` / `venues_owner_delete` and creates nothing in their place, leaving no policy and no grant | **Yes, DB-enforced** — but only after 018. Before it, live allowed both to any authenticated user |
| Read another venue's events / check-ins | Nothing — both are publicly readable | Public by design |
| Create an event for a venue they don't own | 019's INSERT policy requires `venue_id IS NOT NULL AND created_by = auth.uid() AND public.is_venue_owner(auth.uid(), venue_id)`. **Requires the DROP of live's `"Authenticated users can create events"`**, which constrains only `created_by` and would otherwise OR the venue check away entirely | **Yes, DB-enforced** (only with the DROP). This is the one live, currently-exploitable hole this PR closes |
| Modify or delete an event at a venue they don't own | 019's venue branch gates UPDATE/DELETE on `is_venue_owner()` with no `created_by` fallback. Live had no UPDATE or DELETE policy at all, so the prior state was deny-all | **Yes, DB-enforced** |
| Re-point their own community event at someone else's venue | 019 — the community branch's `WITH CHECK` requires `venue_id IS NULL`, and the venue branch's requires ownership of the new venue | **Yes, DB-enforced** |
| Move an event they own from their venue to another venue | Same — `USING` passes on the old venue, `WITH CHECK` fails on the new one | **Yes, DB-enforced** |
| Create a community event (`venue_id IS NULL`) | Allowed for any signed-in user, `created_by = auth.uid()` only | Intended; grants no venue-owner rights |
| Post a story tagged to a venue they don't own | Nothing — `stories` INSERT only checks `author_id` | Intended (open venue tagging). **Moderation gap, not escalation** |
| Mutate `event_performers` for someone else's event | RLS is enabled live with **no write policy of any kind**, so Postgres denies by default for every role | **Yes, DB-enforced** — by default-deny, not by an explicit policy. Verified live; previously recorded here as "Unknown" |

Net: venue *metadata* (018) and venue-attached *events* (019) are both protected at the database
level by explicit owner-scoped policies rather than by the absence of a write policy. Event
mutation is now governed by venue ownership, and the community-event model survives alongside it
without either path reaching the other's rows. Both guarantees depend on the two `DROP POLICY`
statements that remove live's looser pre-existing policies — without them each new policy is OR'd
into irrelevance. No venue-scoped table is left writable by the wrong party: `event_performers` is
the one still absent from `db/`, but it is fail-closed live (RLS on, zero write policies), so what
it needs is version control and feature enablement, not a security fix.

Three smaller risks introduced or left open by 018:

- **Dropping live's three `venues_owner_*` policies removes an ability authenticated users have
  today.** Venue creation and self-service deletion stop working through the API, and the
  `created_by` fallback for update access is gone. No live row is affected (all 4 venues have both
  columns `NULL`), and the change is deliberate — it is what makes the documented posture true —
  but it is a behaviour change, and the dropped policies are not reconstructable from `db/`. Take a
  `pg_policies` snapshot first.
- `owner_id` is readable by `anon`. `venues` SELECT is `USING (TRUE)` and the dashboard calls
  `select("*")`, so the owning `profiles.id` is public. It is an opaque UUID, not a credential, but
  it does link a venue to an account identifier. Hiding it would require column-level grants, which
  would break `select("*")`; deliberately not attempted here.
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

**No backfill was performed. Confirmed live: 4 venues, `owner_id` `NULL` on all of them, and
`created_by` `NULL` on all of them too.**

Nothing maps a user to a venue: there is no `venue_owners` table, no `venue_claims` table, no
`INSERT INTO venues` seed anywhere in `db/`, no fixture data, and live's `venue_admins` table is
empty. Guessing an assignment would silently grant a real account write access to a real venue, so
the migration leaves the column empty and defers the decision.

**Owner assignment is required before any venue-owner functionality works.** Until then
`/venue-owner` renders the empty state for every user and `is_venue_owner()` returns false for
every venue — fail-closed, the same observable behaviour as before 018.

Two live details govern how the assignment must be made:

1. **The value must be an existing `public.profiles.id`.** The live foreign key is
   `venues.owner_id → public.profiles.id`, *not* `auth.users(id)`. Assigning a raw `auth.users.id`
   for an account with no `profiles` row raises a foreign-key violation. Confirm the profile row
   exists first.
2. **It must be run with `service_role` / the SQL editor, not through the API.** After 018 the only
   UPDATE policy requires `owner_id = auth.uid()`, which no unowned row satisfies, so RLS-bypassing
   access is mandatory for the first assignment on each venue.

Assign owners one at a time, after confirming the pairing out of band. The UUID below is a
placeholder, not a real account:

```sql
UPDATE public.venues
   SET owner_id = '00000000-0000-0000-0000-000000000000'  -- an existing public.profiles.id
 WHERE slug = 'replace-with-venue-slug';
```

Verify before and after:

```sql
SELECT id, slug, name, owner_id FROM public.venues ORDER BY name;
SELECT public.is_venue_owner('<that profiles.id>'::uuid, '<the venue id>'::uuid);  -- expect true
```

### Remaining gaps after Sprint 002

| Table | State | Outstanding work |
|---|---|---|
| `venues` | Fixed (018) | Owner assignment (see Backfill status). Consolidate the three redundant public-SELECT policies (live's `venues_public_read` and `venues_select_public` plus 018's `"Anyone can view venues"`, all `USING (TRUE)`) into one — accepted redundancy, not a risk. Column-level write scoping if the whole-row UPDATE grant proves too broad. |
| `events` | Fixed (019) | Draft/unpublished events are publicly readable live (`"Anyone can view events"` has `qual = true`, which subsumes `events_select_published`) — pre-existing, untouched by this PR, needs a product decision. Optional: a trigger to pin `venue_id` and `created_by` after insert. |
| `stories` | Reclassified, not fixed | Venue tagging is open to all authors by design. If venue owners should be able to take down a story tagged to their venue, that needs a moderation UI and a policy — a product decision, not a bug fix. |
| `venue_checkins` | Correct as-is | None. |
| `event_performers` | Fail-closed live; **not under version control** | Verified live: columns `event_id`, `performer_id`, `billing_order`, `created_at`; composite PK on `(event_id, performer_id)`; RLS enabled; sole policy `event_performers_select_public` (SELECT, `qual = true`); **no write policies**; 0 rows. Writes are already denied by default, so `/venue-owner`'s performer insert/delete paths are inert. **Deliberately deferred, not blocked:** adding policies would *widen* access (feature enablement), and writing them from `db/` against a table this repo does not define would repeat the drift that made 018/019 need correcting. Bring the real table definition under version control first, then gate writes through `event_id -> events.venue_id -> public.is_venue_owner()`. |
| `promotions` / analytics | Does not exist | Nothing to secure — confirmed absent from both `db/` and every `.from()` call in the app. |

Broader drift, unchanged by this sprint: PROJECT_INDEX.md §13.2 records that **ten of the
twenty-six tables the app queries have no `CREATE TABLE` anywhere in `db/`** (`profiles`,
`friend_requests`, `conversations`, `conversation_participants`, `direct_messages`, `requests`,
`request_responses`, `safari_plans`, `safari_stops`, `event_performers`), as do nine of the ten
RPCs it calls. `db/` cannot reproduce a working database; the schema of record lives only in the
hosted Supabase project.

### `db/001`–`017` were never applied to production — read this before writing a migration

This is the single most important piece of context for any future schema or RLS work in this repo,
and it is why 018 and 019 needed correcting before merge.

The live Supabase project tracks its own migration history, and it is **timestamp-named**, not
numbered. All 14 entries, verified 2026-07-31:

```
20260717074819  create_notifications_system
20260717223455  security_cleanup_phase_1
20260717224000  secure_legacy_talent_requests
20260717232619  create_party_media_storage
20260718003417  add_realtime_direct_messaging
20260718012049  create_secure_follows_table
20260718014842  fix_conversation_participant_rls_recursion
20260718232958  direct_message_unread_notifications
20260719210740  expand_venues_and_add_live_checkins
20260720002549  add_safari_mode_plans
20260721053120  fix_birthday_party_event_status_and_date
20260721055912  expand_activity_feed_action_types
20260721071927  add_friend_requests_and_friendships
20260724074854  add_stories_system
```

**Not one of the repo's `partysafari/db/001_*.sql` – `017_*.sql` files appears in it.** This is not
partial drift — those files were simply never run against production. The live schema was built by
a separate, parallel history. Concrete consequences already confirmed:

- `venues.owner_id` exists live even though `db/017` defines `venues` without it, and its FK targets
  `profiles.id` rather than the `auth.users(id)` that `db/018` writes.
- `venues` already had owner-scoped INSERT/UPDATE/DELETE policies; `db/` describes only a public
  SELECT.
- `public.is_venue_owner()` does not exist live at all, so `db/012`'s much-cited "always returns
  FALSE" defect was never deployed.
- `event_performers`, `performers`, `venue_admins` and `performer_owners` exist live with RLS and
  have no `CREATE TABLE` anywhere in `db/`.
- **Live policy *names* differ from repo policy names on every shared table.** This is the trap that
  made 018 and 019 inert as originally written: their `DROP POLICY IF EXISTS` guards name policies
  from `db/012` and `db/017`, which do not exist live, so every guard silently no-ops and the
  older, looser live policy survives. Because permissive policies of the same command are OR'd, a
  surviving looser policy makes a new stricter one meaningless.

**Practical rule for the next migration:** never treat `partysafari/db/*.sql` as a description of
what is deployed. Take a live snapshot first —

```sql
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
  FROM pg_policies WHERE tablename IN ('venues','events');
```

— and assume a policy with a *different name* and a *looser* predicate already exists for the same
command. Drop it explicitly by its **live** name, or the new policy will be OR'd into irrelevance.
That snapshot is also the only possible source for a rollback script, since the prior state cannot
be reconstructed from `db/`.

Every RLS claim in this document that is not explicitly marked "verified live" is a claim about
**the migrations**, and holds against production only insofar as the two agree.

### Verification performed for migrations 018 and 019

Both files were parsed with `libpg_query` (via `pglast` v8.4), the same grammar PostgreSQL itself
uses. 018: 11 top-level statements (2 `ALTER TABLE`, 1 `CREATE FUNCTION`, 5 `DROP POLICY`,
2 `CREATE POLICY`, 1 `GRANT`) plus the function body, clean. 019: 16 top-level statements
(1 `ALTER TABLE`, 7 `DROP POLICY`, 6 `CREATE POLICY`, 2 `GRANT`), clean.

Both were additionally cross-checked, statement by statement, against a read-only snapshot of the
live schema, RLS state and `pg_policies` output taken through the Supabase connector on
2026-07-31. That cross-check is what produced the corrections recorded throughout this document:
the two `DROP POLICY` statements targeting live policy names, the removal of the redundant index,
and the `profiles.id` foreign-key correction.

**Neither migration was executed against a live or local database** — Docker is unavailable in the
build environment, so `supabase db start` / `supabase db lint` could not run. Syntax is verified
and the live policy set is verified; runtime behaviour (actual policy evaluation, the grants) is
not. The policy-interaction reasoning in this document — in particular that Postgres ORs permissive
policies per command and evaluates UPDATE `USING` on the old row and `WITH CHECK` on the new one —
is derived from the documented semantics, not observed.

**Execution order is mandatory: 018 first, then 019**, ideally inside a single `BEGIN; … COMMIT;`
(both are pure DDL and PostgreSQL DDL is transactional, so a mid-way failure rolls back cleanly).
019's policies reference `public.is_venue_owner()`, which does not exist live; running 019 alone
fails with `42883`. Take the `pg_policies` snapshot before starting, and re-run it afterwards to
confirm that `"Authenticated users can create events"` and the three `venues_owner_*` policies are
gone and only the intended policies remain.

For 019 the application was also re-checked, since the events write paths are the thing the new
policies constrain: `tsc --noEmit` clean, `eslint` 0 errors (169 pre-existing warnings), and
`next build` successful across all 20 routes. No TypeScript changed in Part 2, so these confirm no
regression rather than validating the policies.
