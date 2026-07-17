import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

interface EventCardData {
  id: string;
  title: string;
  venue: string;
  city: string;
  state: string;
  date: string;
  time: string;
  genre: string;
  coverImage: string | null;
  commentCount: number;
}

function formatStartTime(value: string | null) {
  if (!value) return 'TBA';
  const parsed = new Date(value);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return value;
}

interface EventsLoadResult {
  events: EventCardData[];
  errorMessage: string | null;
  count: number;
}

async function loadEvents() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from('events')
    .select(
      'id, title, venue_name, event_date, start_time, city, state, genre, cover_image, created_at, event_comments(count)'
    )
    .order('created_at', { ascending: false });

  // Errors are handled by returning an error message; avoid console noise in production.

  const events = (data ?? []).map((event: any) => ({
    id: String(event.id),
    title: event.title || 'Untitled Event',
    venue: event.venue_name || 'Venue',
    city: event.city || '',
    state: event.state || '',
    date: event.event_date ? new Date(event.event_date).toLocaleDateString() : 'TBA',
    time: formatStartTime(event.start_time),
    genre: event.genre || 'Nightlife',
    coverImage: event.cover_image || null,
    commentCount: Number(event.event_comments?.length ?? 0),
  })) as EventCardData[];

  return {
    events,
    errorMessage: error?.message ?? null,
    count: data?.length ?? 0,
  } as EventsLoadResult;
}

export default async function EventsPage() {
  const { events, errorMessage, count } = await loadEvents();

  return (
    <main className="min-h-screen bg-[#07070B] text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8 flex flex-col gap-4 rounded-3xl border border-white/10 bg-[#10061f] p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-4xl font-bold">Nightlife Events</h1>
            <p className="mt-2 text-lg text-white/70">Browse upcoming PartySafari events and jump into the scene.</p>
          </div>
          <Link
            href="/events/create"
            className="inline-flex items-center justify-center rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-500"
          >
            Create Event
          </Link>
        </div>

        {/* Events page UI (no debug banners) */}

        {events.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-[#10061f] p-8 text-center text-white/70">
            No events available yet. Create the first one or check back soon.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {events.map((event) => {
              const location = event.city || event.state ? `${event.city}${event.city && event.state ? ', ' : ''}${event.state}` : 'Unknown Location';

              return (
                <article key={event.id} className="overflow-hidden rounded-3xl border border-white/10 bg-[#10061f] shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
                  <div className="relative h-48 overflow-hidden bg-slate-900/80">
                    {event.coverImage ? (
                      <img
                        src={event.coverImage}
                        alt={event.title}
                        className="h-full w-full object-cover transition duration-300 hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-violet-500/10 text-sm text-violet-200">
                        Nightlife Vibes
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent px-6 py-4">
                      <p className="text-xs uppercase tracking-[0.32em] text-violet-300">{location}</p>
                      <h2 className="mt-1 text-2xl font-semibold text-white">{event.title}</h2>
                      <p className="text-sm text-white/70">{event.venue}</p>
                    </div>
                  </div>

                  <div className="space-y-4 p-6">
                    <div className="grid gap-3 text-sm text-white/70 sm:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase tracking-[0.32em] text-violet-300">Date</p>
                        <p className="text-white">{event.date}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.32em] text-violet-300">Time</p>
                        <p className="text-white">{event.time}</p>
                      </div>
                      
                      <div>
                        <p className="text-xs uppercase tracking-[0.32em] text-violet-300">Genre</p>
                        <p className="text-white">{event.genre}</p>
                      </div>
                    </div>

                    

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <p className="text-sm text-white/70">
                        {event.commentCount} comment{event.commentCount !== 1 ? 's' : ''}
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <Link
                          href={`/events/${event.id}`}
                          className="inline-flex items-center justify-center rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500"
                        >
                          View Event
                        </Link>
                        <Link
                          href="/events/create"
                          className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-violet-300 hover:bg-violet-500/10"
                        >
                          Create Event
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
