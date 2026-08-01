"use client";

import Link from "next/link";
import EventRsvpControls from "@/components/events/EventRsvpControls";
import SavedEventToggle from "@/components/SavedEventToggle";
import type { DiscoverEvent } from "@/hooks/useDiscoverTonightData";

type EventStartingSoonCardProps = {
  event: DiscoverEvent;
  countdownLabel: string;
  scheduleLabel: string;
};

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/75">{children}</span>
  );
}

export default function EventStartingSoonCard({ event, countdownLabel, scheduleLabel }: EventStartingSoonCardProps) {
  const imageUrl = event.imageUrl || event.venue?.imageUrl || event.venue?.photoUrl;

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-black/20 transition hover:border-violet-300/25">
      <div className="relative h-36 bg-[#120824] sm:h-40">
        {imageUrl ? (
          <img src={imageUrl} alt={event.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#12061d_0%,#221137_60%,#0b1b33_100%)] text-xs uppercase tracking-[0.28em] text-violet-100/80">
            Tonight
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
        <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-medium uppercase tracking-[0.22em] text-violet-200/75">
              {event.venue?.name || "Venue"}
            </p>
            <h3 className="mt-1 truncate text-lg font-semibold tracking-tight text-white sm:text-xl">{event.title}</h3>
          </div>
          <div className="shrink-0 rounded-2xl border border-orange-300/25 bg-orange-500/15 px-3 py-1.5 text-right text-sm font-semibold tabular-nums text-orange-100">
            {countdownLabel}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-2">
          <MetaChip>{event.rsvpCounts.going} RSVPs</MetaChip>
          <MetaChip>{event.friendAttendees.length} friends attending</MetaChip>
          <MetaChip>{event.storyCount} stories</MetaChip>
        </div>
        <p className="text-sm leading-relaxed text-white/65">
          {scheduleLabel} • {event.performerName || event.eventType || "Lineup TBA"}
        </p>
        <EventRsvpControls eventId={event.id} eventTitle={event.title} compact={true} />
        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
          <Link
            href={event.venue?.slug ? `/venues/${event.venue.slug}` : "/events"}
            className="inline-flex min-h-11 items-center rounded-full border border-violet-300/35 bg-violet-500/15 px-4 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/25"
          >
            Open Event
          </Link>
          <SavedEventToggle eventId={event.id} />
        </div>
      </div>
    </article>
  );
}
