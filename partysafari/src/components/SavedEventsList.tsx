import Link from 'next/link';

interface SavedEvent {
  id: string;
  event_id: string;
  title: string;
  venue_name: string | null;
  event_date: string | null;
  start_time: string | null;
  cover_image: string | null;
}

interface SavedEventsListProps {
  events: SavedEvent[];
}

export default function SavedEventsList({ events }: SavedEventsListProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#10061f] p-6 text-white/70">
        You haven't saved any events yet. Save one from an event page to see it here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {events.map((event) => (
        <Link
          key={event.id}
          href={`/events/${event.event_id}`}
          className="block rounded-3xl border border-white/10 bg-[#10061f] p-4 transition hover:border-violet-400"
        >
          <div className="flex items-center gap-4">
            {event.cover_image ? (
              <img src={event.cover_image} alt={event.title} className="h-20 w-20 rounded-3xl object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/5 text-xs uppercase tracking-[0.24em] text-violet-200">
                No Image
              </div>
            )}
            <div className="flex-1">
              <p className="text-sm uppercase tracking-[0.24em] text-violet-300">Saved Event</p>
              <h3 className="mt-1 text-lg font-semibold text-white">{event.title}</h3>
              <p className="text-sm text-white/70">{event.venue_name || 'Venue TBA'}</p>
              <p className="mt-2 text-sm text-white/60">
                {event.event_date ? new Date(event.event_date).toLocaleDateString() : 'Date TBA'} • {event.start_time ? new Date(event.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Time TBA'}
              </p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
