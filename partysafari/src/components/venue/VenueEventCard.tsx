import Link from "next/link";
import EventRsvpControls from "@/components/events/EventRsvpControls";

type VenueEventCardProps = {
  eventId: string;
  title: string;
  timeLabel: string;
  imageUrl: string | null;
  coverCharge: string;
  ageMinimum: string;
  ticketLink: string | null;
};

export default function VenueEventCard({
  eventId,
  title,
  timeLabel,
  imageUrl,
  coverCharge,
  ageMinimum,
  ticketLink,
}: VenueEventCardProps) {
  return (
    <article className="overflow-hidden rounded-3xl border border-white/10 bg-[#10061f]">
      <div className="h-40 bg-[#0f0a19]">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm uppercase tracking-[0.2em] text-violet-200">
            PartySafari Event
          </div>
        )}
      </div>

      <div className="space-y-3 p-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="text-sm text-white/70">{timeLabel}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <p className="text-white/70"><span className="text-violet-300">Cover:</span> {coverCharge}</p>
          <p className="text-white/70"><span className="text-violet-300">Age:</span> {ageMinimum}</p>
        </div>
        <EventRsvpControls eventId={eventId} eventTitle={title} compact={true} />
        {ticketLink ? (
          <Link
            href={ticketLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500"
          >
            Tickets
          </Link>
        ) : (
          <span className="inline-flex rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white/60">
            Tickets Soon
          </span>
        )}
      </div>
    </article>
  );
}
