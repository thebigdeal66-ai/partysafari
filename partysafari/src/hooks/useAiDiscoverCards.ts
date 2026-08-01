"use client";

/**
 * Binds the pure `discoverIntelligence` model to the Discover surface.
 *
 * This hook fetches nothing. Everything it needs — Party Scores, PSI
 * explanations, distances, running event types — is already on the
 * `DiscoverVenueCardData` values that `useDiscoverTonightData` composed, so the
 * cards cost zero extra round trips and cannot disagree with the venue cards
 * rendered beside them.
 *
 * Two flags gate it, independently:
 *
 * - `aiDiscoverCards` decides whether the cards exist at all. Off by default;
 *   when off the hook returns `enabled: false` and an empty result, and the
 *   surface renders nothing.
 * - `crowdPulse` decides whether Crowd Pulse corroboration is available.
 *   `useCrowdPulse` enforces that one itself, returning an empty reading when
 *   the flag is off, which lands here as venues with no pulse level. That is a
 *   normal degraded read, not an error: the model treats corroboration as a
 *   priority nudge, so ordering shifts slightly and classification does not
 *   change.
 */

import { useMemo } from "react";
import { useCrowdPulse } from "@/hooks/useCrowdPulse";
import type { DiscoverVenueCardData } from "@/hooks/useDiscoverTonightData";
import { isFeatureEnabled } from "@/lib/featureFlags";
import {
  buildDiscoverCards,
  type DiscoverIntelligenceResult,
  type DiscoverIntelligenceVenue,
} from "@/lib/discoverIntelligence";
import type { CrowdPulseLevel, CrowdPulseTrend } from "@/lib/crowdPulseTypes";

export type UseAiDiscoverCardsResult = {
  /** False whenever the `aiDiscoverCards` flag is off. Callers render nothing. */
  enabled: boolean;
  result: DiscoverIntelligenceResult;
  /** True while Crowd Pulse is still resolving. Never blocks the cards. */
  crowdPulseLoading: boolean;
};

const EMPTY_RESULT: DiscoverIntelligenceResult = {
  cards: [],
  unclassified: [],
  crowdPulseAvailable: false,
};

/**
 * The city Crowd Pulse should be asked about: whichever one most of the loaded
 * venues are in. Discover is a single-city surface in practice, and asking for
 * a city nobody is in would return an empty reading that reads identically to
 * the flag being off.
 */
function resolveScope(venues: DiscoverVenueCardData[]) {
  const counts = new Map<string, { city: string; state: string | null; count: number }>();

  for (const venue of venues) {
    const city = (venue.city || "").trim();
    if (!city) {
      continue;
    }
    const key = `${city.toLowerCase()}|${(venue.state || "").trim().toLowerCase()}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { city, state: venue.state, count: 1 });
    }
  }

  let best: { city: string; state: string | null; count: number } | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count || (entry.count === best.count && entry.city < best.city)) {
      best = entry;
    }
  }

  return best ? { city: best.city, state: best.state } : null;
}

export function useAiDiscoverCards(venues: DiscoverVenueCardData[]): UseAiDiscoverCardsResult {
  const enabled = isFeatureEnabled("aiDiscoverCards");

  const scope = useMemo(() => (enabled ? resolveScope(venues) : null), [enabled, venues]);
  const pulse = useCrowdPulse({ scope, enabled });

  const pulseByVenueId = useMemo(() => {
    const map = new Map<string, { level: CrowdPulseLevel; trend: CrowdPulseTrend }>();
    for (const bucket of pulse.buckets) {
      for (const venueId of bucket.venueIds) {
        map.set(venueId, { level: bucket.level, trend: bucket.trend });
      }
    }
    return map;
  }, [pulse.buckets]);

  const result = useMemo(() => {
    if (!enabled) {
      return EMPTY_RESULT;
    }

    const inputs: DiscoverIntelligenceVenue[] = venues.map((venue) => {
      const cell = pulseByVenueId.get(venue.id);
      return {
        id: venue.id,
        name: venue.name,
        slug: venue.slug,
        partyScore: venue.partyScore,
        // PSI already explained this venue upstream. Passing it through is what
        // keeps a card's "why" identical to the venue card's "why".
        psiExplanation: venue.psiExplanation,
        distanceMiles: venue.distanceMiles,
        liveEventTypes: venue.liveEventTypes,
        liveMusicTitle: venue.liveEventTitle,
        // Undefined when the `crowdPulse` flag is off. The model reads that as
        // "no corroboration available" and carries on.
        crowdPulseLevel: cell?.level ?? null,
        crowdPulseTrend: cell?.trend ?? null,
      };
    });

    return buildDiscoverCards(inputs);
  }, [enabled, venues, pulseByVenueId]);

  return { enabled, result, crowdPulseLoading: pulse.loading };
}
