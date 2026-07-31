# Security Notes

Living record of security-relevant decisions and known gaps. Update when the underlying
behaviour changes — do not record aspirations here, only what is true today.

---

## Venue owner authorization

**Status:** application layer fixed and fail-closed (Sprint 001, branch
`fix/venue-owner-authorization`). Venue *metadata* is now owner-gated in the database by
`partysafari/db/018_venue_ownership.sql` (Sprint 002 Part 1, branch
`fix/venue-owner-rls-enforcement`). **Venue-scoped content tables are still ungated — see
"Not done yet" at the end of this section.**

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
| `events` | Enabled | Four policies, all gated on `is_venue_owner(auth.uid(), venue_id)`, with `OR auth.uid() = created_by` on SELECT/UPDATE/DELETE. | See `is_venue_owner()` below. |
| `venue_checkins` | Enabled | Read is public for unexpired rows; writes restricted to `auth.uid() = profile_id`. | Per-venue live crowd counts are public data. |
| `stories` | Enabled | INSERT checks `auth.uid() = author_id` only — **not** venue ownership. | Any user can post a story tagged to any `venue_id`. |
| `event_performers` | **No migration in `db/`** | Unknown. | Unverified; the dashboard deletes and inserts rows here. |

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
behaviour, and takes effect only once an owner is actually assigned. `UPDATE`/`DELETE` on `events`
are unchanged and still pass through the `OR auth.uid() = created_by` branch, so event mutation
remains governed by *event* authorship, not *venue* ownership. Closing that is Part 2.

### Residual risk

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
| Create an event for a venue they don't own | `is_venue_owner()` now compares `venues.owner_id`, so the INSERT policy denies non-owners | **Yes, DB-enforced** (previously denied everyone by accident) |
| Modify an event they authored at someone else's venue | Nothing — `OR auth.uid() = created_by` | **Gap: authorship, not ownership** |
| Post a story tagged to a venue they don't own | Nothing — `stories` INSERT only checks `author_id` | **Gap** |
| Mutate `event_performers` for someone else's event | Unknown — no migration defines its RLS | **Unverified** |

Net: venue *metadata* is now protected at the database level by an explicit owner-only UPDATE
policy rather than by the absence of any write policy. Venue-scoped *content* (events, stories,
performers, promotions) is still **not** gated on venue ownership, because 012's `events` policies
keep their `OR auth.uid() = created_by` escape hatch and `stories` never checked venue ownership at
all. Rewriting those is Part 2.

Two smaller risks introduced or left open by 018:

- `owner_id` is readable by `anon`. `venues` SELECT is `USING (TRUE)` and the dashboard calls
  `select("*")`, so the owning `auth.users.id` is now public. It is an opaque UUID, not a
  credential, but it does link a venue to an account identifier. Hiding it would require
  column-level grants, which would break `select("*")`; deliberately not attempted here.
- The `venues` UPDATE policy grants the whole row. An owner can edit any venue column, including
  ones the dashboard does not expose (`slug`, `latitude`/`longitude`, `city`). Narrowing that needs
  a column-level grant or a trigger; not in scope for this migration.

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

### Not done yet — RLS on venue-scoped content tables

Migration 018 covers the `venues` table only. RLS on the tables that hang off a venue is a
separate, **not-yet-done** follow-up sprint:

| Table | Outstanding work |
|---|---|
| `events` | Drop the `OR auth.uid() = created_by` branch from the UPDATE and DELETE policies so venue ownership, not event authorship, governs event mutation. |
| `stories` | INSERT checks `auth.uid() = author_id` only; any user can post a story tagged to any `venue_id`. Decide whether venue tagging requires ownership. |
| `event_performers` | No migration in `db/` defines the table or its RLS, yet the dashboard inserts and deletes rows in it. Needs a migration before it can be secured. |
| `promotions` | No migration in `db/` defines it. Confirm whether it exists in the live database and, if so, bring it under version control. |

`event_performers` and `promotions` are **assumptions pending verification against the live
database** — their absence from `db/` does not prove their absence from the project.

### Verification performed for migration 018

`018_venue_ownership.sql` was parsed with `libpg_query` (via `pglast`), the same grammar
PostgreSQL itself uses: 9 top-level statements plus the function body parse clean. **The migration
was not executed against a live or local database** — Docker is unavailable in the build
environment, so `supabase db start` / `supabase db lint` could not run. Syntax is verified;
runtime behaviour (policy evaluation, the `auth.users` foreign key, the `authenticated` grant) is
not.
