"use client";

/**
 * The AI Discover Cards surface.
 *
 * Six cards, one per category, always all six so the layout does not reflow as
 * the night changes. Everything rendered here comes from
 * `discoverIntelligence`; this file makes no decisions about which venue goes
 * where or in what order.
 *
 * It also deliberately renders **no metrics**. Party Score, momentum, crowd
 * level, friends-here and story counts are all already on `VenuePartyCard`
 * further up the page, and repeating them here would be two numbers competing
 * to describe one room. A card entry shows the rule that matched, the venue
 * name, and PSI's reasons behind a disclosure — nothing that is on screen twice.
 */

import Link from "next/link";
import { memo } from "react";
import WhyThisVenue from "@/components/discover/WhyThisVenue";
import { SectionShell } from "@/components/discover/DiscoverSection";
import type { DiscoverCard, DiscoverCardVenue } from "@/lib/discoverIntelligence";

function CardEntry({ venue }: { venue: DiscoverCardVenue }) {
  const heading = venue.slug ? (
    <Link
      href={`/venues/${venue.slug}`}
      className="text-sm font-semibold text-white transition-colors duration-150 hover:text-pink-200 motion-reduce:transition-none"
    >
      {venue.name}
    </Link>
  ) : (
    <span className="text-sm font-semibold text-white">{venue.name}</span>
  );

  return (
    <li className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {heading}
        {venue.crowdPulseCorroborated ? (
          <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/50">
            Pulse
          </span>
        ) : null}
      </div>

      <p className="mt-1 break-words text-xs leading-relaxed text-white/70">{venue.categoryReason}</p>

      {venue.dataNote ? (
        <p className="mt-1 break-words text-[11px] leading-relaxed text-amber-200/70">{venue.dataNote}</p>
      ) : null}

      <WhyThisVenue explanation={venue.explanation} className="mt-2" />
    </li>
  );
}

function IntelligenceCard({ card }: { card: DiscoverCard }) {
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:p-4">
      <header className="min-w-0">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-white sm:text-base">
          <span aria-hidden="true">{card.emoji}</span>
          <span className="break-words">{card.label}</span>
        </h3>
        <p className="mt-0.5 break-words text-xs text-white/50">{card.description}</p>
      </header>

      {card.emptyMessage ? (
        <p className="mt-3 break-words text-xs leading-relaxed text-white/45">{card.emptyMessage}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {card.venues.map((venue) => (
            <CardEntry key={venue.venueId} venue={venue} />
          ))}
        </ul>
      )}
    </section>
  );
}

export type AiDiscoverCardsProps = {
  cards: DiscoverCard[];
  /** Rendered as a footnote so the absence of Crowd Pulse is stated, not hidden. */
  crowdPulseAvailable?: boolean;
};

const AiDiscoverCards = memo(function AiDiscoverCards({
  cards,
  crowdPulseAvailable = false,
}: AiDiscoverCardsProps) {
  if (cards.length === 0) {
    return null;
  }

  return (
    <SectionShell
      eyebrow="✨ AI Discover Cards"
      title="Six reads on tonight"
      description="Every venue below appears on exactly one card, and every card says why."
    >
      <div className="grid min-w-0 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <IntelligenceCard key={card.id} card={card} />
        ))}
      </div>

      {crowdPulseAvailable ? null : (
        <p className="mt-3 text-[11px] leading-relaxed text-white/40">
          Crowd Pulse is off, so these are ranked on venue signals alone.
        </p>
      )}
    </SectionShell>
  );
});

export default AiDiscoverCards;
