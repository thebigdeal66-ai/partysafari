# Sprint 014 — User Location Tracking

This branch adds a shared browser location tracker initialized from the root app shell.

## Behavior

- Starts a single `watchPosition` subscription for the application.
- Caches the latest valid coordinates for 15 minutes.
- Reuses the cached coordinates for subsequent `getCurrentPosition` calls.
- Shares updates through a browser event and subscription API.
- Never stores coordinates in Supabase or sends them to the server.
- Leaves permission and error presentation to the existing feature surfaces.

## Validation targets

- Production build succeeds from `partysafari/`.
- Existing Discover Tonight and Tonight Near Me location requests receive one shared recent position.
- Navigation between pages does not discard the latest valid coordinates.
- The global watcher is cleaned up when the root tracker unmounts.
