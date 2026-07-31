# Security Notes

Living record of security-relevant decisions and known gaps. Update when the underlying
behaviour changes — do not record aspirations here, only what is true today.

---

## Venue owner authorization

**Status:** application layer fixed and fail-closed. **Database layer: incomplete — see the gap
below.** Sprint 001, branch `fix/venue-owner-authorization`.

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

### `venues.owner_id` does not exist yet

`public.venues`, as defined by `partysafari/db/017_discover_tonight_stabilization.sql`, has **no
ownership column at all**:

```
id, slug, name, venue_type, city, state, latitude, longitude, image_url, photo_url,
current_status, music_genres, drink_specials, description, vip_available, food_available,
created_at, updated_at
```

There is also no `venue_owners` join table and no `venue_claims` table anywhere in `db/`.

Consequently, until the migration below is applied, the `owner_id` filter errors with PostgREST
`42703` (undefined column), the app treats that as denial, and **every user sees the empty state**.
That is the intended fail-closed outcome: with no ownership data in the schema, no user can be
proven to own a venue, so no user is treated as one.

> Caveat: every migration uses `CREATE TABLE IF NOT EXISTS`, so a Supabase project that predates
> 017 may have a `venues` shape that differs from the repo. The migrations are the only source of
> truth available in-repo; verify against the live database before concluding otherwise. If the
> live table already has `owner_id`, the dashboard works immediately with no code change.

### RLS enforcement status

| Table | RLS | Policies | Effect |
|---|---|---|---|
| `venues` | Enabled | `SELECT USING (TRUE)` only. No INSERT/UPDATE/DELETE policy. Grants are `SELECT` only to `anon`, `authenticated`. | Reads are fully public. **All writes are denied at the database level.** |
| `events` | Enabled | Four policies, all gated on `is_venue_owner(auth.uid(), venue_id)`, with `OR auth.uid() = created_by` on SELECT/UPDATE/DELETE. | See `is_venue_owner()` below. |
| `venue_checkins` | Enabled | Read is public for unexpired rows; writes restricted to `auth.uid() = profile_id`. | Per-venue live crowd counts are public data. |
| `stories` | Enabled | INSERT checks `auth.uid() = author_id` only — **not** venue ownership. | Any user can post a story tagged to any `venue_id`. |
| `event_performers` | **No migration in `db/`** | Unknown. | Unverified; the dashboard deletes and inserts rows here. |

### `is_venue_owner()` is currently a no-op

`db/012_live_events_system.sql` defines:

```sql
p_user_id::TEXT = ANY (ARRAY[
  COALESCE(to_jsonb(v) ->> 'owner_id', ''), ... four more ...
])
```

`to_jsonb(v) ->> 'owner_id'` returns `NULL` when the column is absent, which `COALESCE` turns into
`''`. A UUID string never equals `''`, so **`is_venue_owner()` returns `FALSE` for every user and
every venue.** The `to_jsonb` indirection means this fails silently instead of raising, so the
policies look enforced while granting nothing.

Downstream effect on `events`: `INSERT` requires `auth.uid() = created_by AND is_venue_owner(...)`,
so **event creation is currently denied for everyone**. `UPDATE`/`DELETE` still work through the
`OR auth.uid() = created_by` branch, meaning event mutation today is governed by *event*
authorship, not *venue* ownership.

### Residual risk

The application no longer leaks another venue's data through the dashboard, but the UI is not the
security boundary. `/venue-owner` is a client component; there is no `middleware.ts`, no
`app/api/**/route.ts`, and no server component in the venue-owner path. Every query goes directly
from the browser to PostgREST with the anon key, so an authenticated attacker can always bypass the
UI and call the REST API directly. What actually stops them today:

| Attack via direct API call | Blocked by | Real? |
|---|---|---|
| Read another venue's row | Nothing — `venues` SELECT is `USING (TRUE)` | Public by design; no fix needed |
| Modify another venue's row | No UPDATE policy + no UPDATE grant on `venues` | **Yes, DB-enforced** |
| Read another venue's events / check-ins | Nothing — both are publicly readable | Public by design |
| Create an event for a venue they don't own | `is_venue_owner()` returns FALSE, so the INSERT policy denies | Yes, but incidentally — it denies *everyone* |
| Modify an event they authored at someone else's venue | Nothing — `OR auth.uid() = created_by` | **Gap: authorship, not ownership** |
| Post a story tagged to a venue they don't own | Nothing — `stories` INSERT only checks `author_id` | **Gap** |
| Mutate `event_performers` for someone else's event | Unknown — no migration defines its RLS | **Unverified** |

Net: venue *metadata* is protected at the database level, but only as a side effect of `venues`
having no write policy at all. Venue-scoped *content* (events, stories, performers) is not gated on
venue ownership anywhere in the database, because the function that is supposed to do that always
returns false.

### Proposed migration — NOT APPLIED

Deliberately not applied in this sprint: it needs a backfill decision (who owns which existing
venue) that only a human can make, and applying it would silently flip access on for whoever the
backfill picks. Smallest change that makes the model real:

```sql
-- db/018_venue_ownership.sql (PROPOSAL — review the backfill before running)

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_venues_owner_id ON public.venues (owner_id);

-- Ownership must be a real column, not a jsonb probe over columns that do not exist.
CREATE OR REPLACE FUNCTION is_venue_owner(p_user_id UUID, p_venue_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.venues v
    WHERE v.id = p_venue_id
      AND p_user_id IS NOT NULL
      AND v.owner_id = p_user_id
  );
$$;

-- Owners may edit their own venue; the public SELECT policy is unchanged.
DROP POLICY IF EXISTS "Owners can update their venue" ON public.venues;
CREATE POLICY "Owners can update their venue"
  ON public.venues
  FOR UPDATE
  USING (owner_id IS NOT NULL AND auth.uid() = owner_id)
  WITH CHECK (owner_id IS NOT NULL AND auth.uid() = owner_id);

GRANT UPDATE ON public.venues TO authenticated;

-- Close the authorship loophole: venue ownership, not event authorship, governs venue content.
DROP POLICY IF EXISTS "Venue owners can update owned venue events" ON public.events;
CREATE POLICY "Venue owners can update owned venue events"
  ON public.events FOR UPDATE
  USING (is_venue_owner(auth.uid(), venue_id))
  WITH CHECK (is_venue_owner(auth.uid(), venue_id));

DROP POLICY IF EXISTS "Venue owners can delete owned venue events" ON public.events;
CREATE POLICY "Venue owners can delete owned venue events"
  ON public.events FOR DELETE
  USING (is_venue_owner(auth.uid(), venue_id));

-- Backfill deliberately omitted. Assign owners explicitly, e.g.:
--   UPDATE public.venues SET owner_id = '<auth.users.id>' WHERE slug = '<venue-slug>';
```

`owner_id IS NOT NULL` in the policies matters: without it, an unowned venue (`owner_id IS NULL`)
compared against a NULL `auth.uid()` yields NULL rather than false, which is not a grant but is
worth stating explicitly.

Still open after that migration: `stories` INSERT does not check venue ownership, and
`event_performers` has no migration defining its RLS at all.
