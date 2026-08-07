This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## PartySafari Intelligence (PSI) — Phase 1

PSI is the interpretation layer above the Party Score. The Party Score answers *how lit is this
place right now* with a number from 0–100; PSI answers *why*, in a sentence.

**PSI is not a second scoring engine.** `lib/partyScore.ts` and `lib/partyScoreEngine.ts` remain
the only implementation of the math, and their public API is unchanged. PSI reads the
`PartyScoreDetails` they already produced and derives everything from it.

### What Phase 1 ships

| Piece | Purpose |
| --- | --- |
| `lib/psi.ts` | Pure core: `attributePartyScore()`, `explainVenue()`, `buildPsiInsights()` |
| `hooks/useVenuePsi.ts` | React access. Takes a score the caller already has; performs no I/O |
| `components/discover/WhyThisVenue.tsx` | The "Why this venue?" disclosure |
| `components/discover/PsiInsights.tsx` | Ranking / interpretation / anomaly panel |

### Data sources

**No new tables, and no schema change.** Every input is a signal the Party Score engine already
gathers — `venue_checkins`, `stories`, `story_reactions`, `events`, `event_rsvps`, `friendships`,
and Lit endorsements — reached through `PartyScoreDetails.signals`. Three optional personalization
inputs (distance, a saved event, a genre match) come from data the Discover surface already holds.

### How "Why this venue?" is generated

Each reason is `signal value × the canonical weight from DEFAULT_PARTY_SCORE_WEIGHTS`, which is
that signal's real contribution to the score. Reasons are ranked by those points, so the
explanation orders itself the same way the score does, and each one carries the signal key and
raw value it came from — a claim on screen is always traceable to a row that exists. A signal
worth less than one point does not earn a sentence, and at most three are shown.

Because the weights are read rather than copied, PSI cannot drift from the engine: `psi.test.ts`
reconciles PSI's per-signal attribution against the engine's own `breakdown`, so adding a signal
to the score without teaching PSI about it fails the test suite.

### Empty states

A venue with no signals scores 0. That is accurate, but a bare "0" reads as a broken venue rather
than an early one, so no surface renders it. `describePartyScore()` decides whether the number is
worth showing at all, and PSI supplies the sentence that replaces it — "Quiet right now — check
back later", or, when there is something real to point at, "Quiet now, but people are planning to
come" for a venue with RSVPs. PSI never fabricates activity: a quiet venue is described as quiet
and produces no reasons.

Run the PSI tests with `npm test`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Production deployment

Production is deployed from the `main` branch through the connected Vercel project. Preview branches are validation artifacts; a launch change is complete only after the merged `main` commit is present on the production target and verified at `partysafari.live`.

Git-trigger health checks should use documentation-only commits so application behavior is unchanged.
