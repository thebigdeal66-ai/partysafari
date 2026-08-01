"use client";

import { useMemo } from "react";
import { buildPsiInsights, explainVenue, type PsiExplanation, type PsiInsight, type PsiVenueContext } from "@/lib/psi";
import type { PartyScoreDetails } from "@/lib/partyScore";

type UseVenuePsiResult = {
  insights: PsiInsight[];
  /** Null only when there is no score to explain yet. */
  explanation: PsiExplanation | null;
};

/**
 * React access to PSI.
 *
 * Deliberately takes a `PartyScoreDetails` the caller already has rather than
 * fetching its own. PSI is derivation, not data access: every input it needs is
 * already in that score, so a hook that re-fetched would open a second realtime
 * subscription per venue and redo work `usePartyScore` has already done. Pair
 * it with `usePartyScore` / `usePartyScores`.
 */
export function useVenuePsi(
  partyScore: PartyScoreDetails | null | undefined,
  context: PsiVenueContext = {}
): UseVenuePsiResult {
  const { distanceMiles, programmedEvent, savedEvent } = context;
  // Callers pass genres as a fresh array literal, so the array itself is never
  // referentially stable. Keying on its contents is what keeps the memo alive.
  const genreKey = (context.matchingGenres || []).join("|");

  return useMemo(() => {
    if (!partyScore) {
      return { insights: [], explanation: null };
    }

    const resolved: PsiVenueContext = {
      distanceMiles,
      programmedEvent,
      savedEvent,
      matchingGenres: genreKey ? genreKey.split("|") : [],
    };

    return {
      insights: buildPsiInsights(partyScore, resolved),
      explanation: explainVenue(partyScore, resolved),
    };
  }, [partyScore, distanceMiles, programmedEvent, savedEvent, genreKey]);
}
