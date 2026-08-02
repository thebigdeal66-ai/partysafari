# partysafari[text](partysafari/src/lib/supabase/client.ts)

## Supabase Repository Layout

- Official Supabase CLI project location: `supabase/`
- Legacy/custom SQL archive and validation location: `partysafari/db/`
- Supabase GitHub integration working directory: `.`
- Automatic production deployment must remain OFF while migration history is reconciled.
- Create future migrations with: `npx supabase migration new <name>`
- Never copy old numbered migrations into `supabase/migrations/` without a migration-history audit.