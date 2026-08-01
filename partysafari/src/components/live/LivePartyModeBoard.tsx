"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import VenuePartyCard from "@/components/discover/VenuePartyCard";
import { usePartyScores } from "@/hooks/usePartyScore";
import { useLiveVenueMetrics } from "@/hooks/useLiveVenueMetrics";
import { useVisibleVenueIds } from "@/hooks/useVisibleVenueIds";
import { litOutcomeMessage, useVenueLit } from "@/hooks/useVenueLit";
import { litBoostPoints } from "@/lib/litSignals";

type VenueSummary = {
  id: string;
  slug: string;
  name: string;
  venueType: string | null;
  city: string | null;
  state: string | null;
};

export default function LivePartyModeBoard() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [venues, setVenues] = useState<VenueSummary[]>([]);
  const [loadingVenues, setLoadingVenues] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadingVenues(true);

      const { data } = await supabase
        .from("venues")
        .select("id, slug, name, venue_type, city, state")
        .order("name", { ascending: true })
        .limit(24);

      if (cancelled) {
        return;
      }

      const nextVenues = ((data || []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id || ""),
        slug: String(row.slug || row.id || ""),
        name: String(row.name || "Venue"),
        venueType: typeof row.venue_type === "string" ? row.venue_type : null,
        city: typeof row.city === "string" ? row.city : null,
        state: typeof row.state === "string" ? row.state : null,
      })).filter((venue) => venue.id.length > 0);

      setVenues(nextVenues);
      setLoadingVenues(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const { visibleVenueIds, registerVenueNode } = useVisibleVenueIds();
  const venueIds = useMemo(() => venues.map((venue) => venue.id), [venues]);

  const liveMetrics = useLiveVenueMetrics({
    venueIds,
    visibleVenueIds,
    subscribeVisibleOnly: true,
    enabled: venueIds.length > 0,
  });
  const partyScores = usePartyScores({
    venueIds,
    visibleVenueIds,
    subscribeVisibleOnly: true,
    enabled: venueIds.length > 0,
  });

  const venuesWithMetrics = useMemo(() => {
    return [...venues]
      .map((venue) => {
        const metrics = liveMetrics.metricsByVenueId[venue.id];
        const party = partyScores.scoresByVenueId[venue.id];
        return {
          ...venue,
          metrics,
          party,
        };
      })
      .sort((left, right) => {
        const leftScore = left.party?.score || 0;
        const rightScore = right.party?.score || 0;
        return rightScore - leftScore;
      });
  }, [liveMetrics.metricsByVenueId, partyScores.scoresByVenueId, venues]);

  const topVenues = venuesWithMetrics.slice(0, 12);

  const lit = useVenueLit({ venueIds, enabled: venueIds.length > 0 });
  const [litMessages, setLitMessages] = useState<Record<string, string | null>>({});
  const submitLit = lit.submitLit;
  const handleLit = useCallback(
    async (venueId: string) => {
      const outcome = await submitLit(venueId);
      setLitMessages((current) => ({ ...current, [venueId]: litOutcomeMessage(outcome) }));
    },
    [submitLit]
  );

  const setCardRef = useCallback(
    (venueId: string) => (node: HTMLDivElement | null) => {
      registerVenueNode(venueId, node);
    },
    [registerVenueNode]
  );

  return (
    <section className="rounded-3xl border border-violet-400/20 bg-[#10061f] p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-violet-300">Live Party Mode</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">Realtime Nightlife Pulse</h2>
          <p className="mt-2 text-sm text-white/65">Shared Party Score architecture powers this compact live board and Discover Tonight.</p>
        </div>
        <Link href="/map" className="rounded-full border border-violet-300/35 bg-violet-500/10 px-4 py-2 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/20">
          Open Live Map
        </Link>
      </div>

      {loadingVenues ? <p className="mt-4 text-sm text-white/60">Loading live venues...</p> : null}
      {liveMetrics.error || partyScores.error ? <p className="mt-4 text-sm text-rose-300">{liveMetrics.error || partyScores.error}</p> : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {topVenues.map((venue) => {
          const metrics = venue.metrics;

          return (
            <div
              key={venue.id}
              ref={setCardRef(venue.id)}
              className="[content-visibility:auto]"
            >
              <VenuePartyCard
                venueId={venue.id}
                venueHref={`/venues/${venue.slug}`}
                venueName={venue.name}
                venueType={venue.venueType}
                imageUrl={null}
                city={venue.city}
                state={venue.state}
                partyScore={venue.party}
                currentEvent={(metrics?.currentEvents || 0) > 0 ? `${metrics?.currentEvents || 0} event${metrics?.currentEvents === 1 ? "" : "s"} live` : null}
                currentEntertainment={null}
                distanceLabel="Live now"
                friendsHereCount={metrics?.friendsHere || 0}
                storyCount={metrics?.activeStories || 0}
                liveCheckins={metrics?.liveCheckins || 0}
                openNow={true}
                onJoinLabel="View Venue"
                litCount={lit.litByVenueId[venue.id]?.litCount ?? 0}
                litHasViewer={lit.litByVenueId[venue.id]?.viewerHasLit ?? false}
                litCooldownSeconds={Math.ceil((lit.cooldownMsByVenueId[venue.id] ?? 0) / 1000)}
                litBoost={litBoostPoints(lit.litByVenueId[venue.id]?.decayWeight ?? 0)}
                litPending={lit.pendingVenueIds.has(venue.id)}
                litAvailable={lit.available}
                litMessage={litMessages[venue.id] ?? null}
                onLit={handleLit}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
