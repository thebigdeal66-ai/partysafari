"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabaseClient';
import { formatEventDateTime } from '@/lib/eventDateFormatter';
import RSVPSection from '@/components/RSVPSection';
import EventComments from '@/components/EventComments';
import SavedEventToggle from '@/components/SavedEventToggle';
import FriendsGoingSection from '@/components/social/FriendsGoingSection';
import StoryComposer from '@/components/stories/StoryComposer';
import StoryGrid from '@/components/stories/StoryGrid';
import StoryViewer from '@/components/stories/StoryViewer';
import { useStories } from '@/components/stories/useStories';

interface EventData {
  id: string;
  title: string;
  venue_id: string | null;
  venue_name: string;
  description: string | null;
  city: string | null;
  state: string | null;
  start_time: string | null;
  genre: string | null;
  cover_image: string | null;
  ticket_link: string | null;
}

interface VenueData {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
}

export default function EventPage() {
  const params = useParams();
  const eventId = params.id as string;
  const [event, setEvent] = useState<EventData | null>(null);
  const [venue, setVenue] = useState<VenueData | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [viewerAuthorId, setViewerAuthorId] = useState<string | null>(null);

  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const storyState = useStories({
    enabled: Boolean(event?.id),
    eventId: event?.id || undefined,
    includeOwnViewCounts: true,
    subscribeOwnStoryViewCounts: true,
  });

  useEffect(() => {
    if (!eventId) {
      return;
    }

    let isCancelled = false;

    const fetchEvent = async () => {
      setIsFetching(true);
      setEvent(null);
      setVenue(null);

      const { data, error } = await supabase
        .from('events')
        .select('id, title, venue_id, venue_name, description, start_time, city, state, genre, cover_image, ticket_link')
        .eq('id', eventId)
        .single();

      if (isCancelled) {
        return;
      }

      if (!error && data) {
        const eventData = data as EventData;
        setEvent(eventData);

        // Fetch venue details if venue_id exists
        if (eventData.venue_id) {
          const { data: venueData } = await supabase
            .from('venues')
            .select('id, name, slug, address, city, state, latitude, longitude')
            .eq('id', eventData.venue_id)
            .maybeSingle();

          if (venueData && !isCancelled) {
            setVenue(venueData as VenueData);
          }
        }
      }

      setIsFetching(false);
    };

    void fetchEvent();

    return () => {
      isCancelled = true;
    };
  }, [eventId, supabase]);

  const loadingFallback = (
    <main className="min-h-screen bg-[#07070B] px-6 py-16 text-white">
      <div className="mx-auto flex max-w-3xl items-center justify-center">
        <div className="w-full rounded-3xl border border-white/10 bg-[#10061f] p-10 text-center shadow-2xl shadow-black/20">
          <h1 className="mb-3 text-3xl font-semibold">Loading Event</h1>
          <p className="text-white/70">Please wait while we load the event details for you.</p>
        </div>
      </div>
    </main>
  );

  const notFoundFallback = (
    <main className="min-h-screen bg-[#07070B] px-6 py-16 text-white">
      <div className="mx-auto flex max-w-3xl items-center justify-center">
        <div className="w-full rounded-3xl border border-white/10 bg-[#10061f] p-10 text-center shadow-2xl shadow-black/20">
          <h1 className="mb-3 text-3xl font-semibold">Event Not Found</h1>
          <p className="text-white/70">The event you&apos;re looking for isn&apos;t available right now.</p>
        </div>
      </div>
    </main>
  );

  if (!eventId) return notFoundFallback;
  if (isFetching) return loadingFallback;
  if (!event) return notFoundFallback;

  const eventView = {
    id: event.id,
    title: event.title,
    venueId: event.venue_id,
    venueName: venue?.name || event.venue_name,
    venueSlug: venue?.slug || '',
    description: event.description?.trim() || '',
    address: venue?.address || '',
    city: venue?.city || event.city || '',
    state: venue?.state || event.state || '',
    dateTime: formatEventDateTime(event.start_time),
    genres: event.genre ? [event.genre] : [],
    ticketLink: event.ticket_link ?? '',
    coverImage: event.cover_image ?? '',
    latitude: venue?.latitude,
    longitude: venue?.longitude,
  };
  const eventStories = [...storyState.stories].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());

  return (
    <main className="min-h-screen bg-[#07070B] text-white">
      <section
        className="relative overflow-hidden bg-gradient-to-r from-violet-900/50 to-purple-900/50"
        style={
          eventView.coverImage
            ? {
                backgroundImage: `url(${eventView.coverImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : undefined
        }
      >
        <div className="absolute inset-0 bg-black/50"></div>
        <div className="relative z-10 h-full px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-3">
              <Link
                href="/events"
                className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/80 transition-colors hover:bg-white/10"
              >
                ← Back to Events
              </Link>
            </div>
            <div className="max-w-3xl">
              <h1 className="text-4xl font-bold text-white md:text-5xl">{eventView.title}</h1>
              <p className="mt-2 text-xl text-violet-100">{eventView.venueName}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
              <h2 className="mb-4 text-2xl font-semibold text-white">Venue Information</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.32em] text-violet-300">Venue</p>
                  {eventView.venueSlug && eventView.venueId ? (
                    <Link href={`/venues/${eventView.venueSlug}`} className="text-white hover:text-violet-300 transition underline">
                      {eventView.venueName}
                    </Link>
                  ) : (
                    <p className="text-white">{eventView.venueName || 'Venue TBA'}</p>
                  )}
                </div>
                {(eventView.address || eventView.city) && (
                  <div>
                    <p className="text-sm uppercase tracking-[0.32em] text-violet-300">Location</p>
                    <p className="text-white">
                      {[eventView.address, eventView.city, eventView.state].filter(Boolean).join(', ')}
                    </p>
                    {(eventView.latitude !== null && eventView.latitude !== undefined && eventView.longitude !== null && eventView.longitude !== undefined) && (
                      <Link
                        href={`https://www.google.com/maps/dir/?api=1&destination=${eventView.latitude},${eventView.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex rounded-full bg-orange-500/20 px-3 py-1 text-xs font-semibold text-orange-200 hover:bg-orange-500/30 transition"
                      >
                        Get Directions
                      </Link>
                    )}
                  </div>
                )}
                <div>
                  <p className="text-sm uppercase tracking-[0.32em] text-violet-300">Date & Time</p>
                  <p className="text-white">{eventView.dateTime}</p>
                </div>
              </div>
            </section>

            {eventView.coverImage && (
              <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#10061f]">
                <img
                  src={eventView.coverImage}
                  alt={eventView.title}
                  className="h-80 w-full object-cover"
                />
              </section>
            )}

            <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
              <h2 className="mb-4 text-2xl font-semibold text-white">About This Event</h2>
              {eventView.description ? (
                <p className="leading-relaxed text-white/70">{eventView.description}</p>
              ) : (
                <p className="leading-relaxed text-white/70">No description has been added for this event yet.</p>
              )}
            </section>

            <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold text-white">Event Stories</h2>
                  <p className="mt-1 text-sm text-white/65">Live stories tagged to this event.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setComposerOpen(true)}
                  className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-400"
                >
                  Add Story
                </button>
              </div>
              <StoryGrid
                stories={eventStories}
                emptyMessage="No active event stories yet."
                showAuthor={true}
                onOpenStory={(story) => setViewerAuthorId(story.author_id)}
              />
            </section>

            {eventView.genres.length > 0 && (
              <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
                <h2 className="mb-4 text-2xl font-semibold text-white">Vibe & Genres</h2>
                <div className="flex flex-wrap gap-2">
                  {eventView.genres.map((genre) => (
                    <span
                      key={genre}
                      className="rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-200"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              </section>
            )}

            <EventComments eventId={eventId} />
          </div>

          <div className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
              <h2 className="mb-4 text-xl font-semibold text-white">Tickets & Entry</h2>
              {eventView.ticketLink ? (
                <a
                  href={eventView.ticketLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full rounded-full bg-violet-600 px-6 py-3 text-center font-semibold text-white transition-colors hover:bg-violet-500"
                >
                  Get Tickets
                </a>
              ) : (
                <button className="w-full rounded-full bg-violet-600/30 px-6 py-3 font-semibold text-white/60" disabled>
                  No Tickets
                </button>
              )}
            </section>

            <SavedEventToggle eventId={eventId} />

            <FriendsGoingSection eventId={eventId} />

            <RSVPSection eventId={eventId} eventTitle={eventView.title} />
          </div>
        </div>
      </div>

      <StoryComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        defaultVenueId={eventView.venueId}
        defaultEventId={eventView.id}
        createStoryRecord={storyState.createStoryRecord}
      />

      {viewerAuthorId ? (
        <StoryViewer
          groups={storyState.authorGroups}
          currentUserId={storyState.currentUserId}
          initialAuthorId={viewerAuthorId}
          onClose={() => setViewerAuthorId(null)}
          onRecordView={storyState.recordView}
          onAddReaction={storyState.addReaction}
          onDeleteStory={storyState.softDeleteStory}
        />
      ) : null}
    </main>
  );
}
