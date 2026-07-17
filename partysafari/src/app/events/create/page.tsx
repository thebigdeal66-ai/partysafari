"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { createSupabaseBrowser } from '@/lib/supabaseClient';
import { recordActivity } from '@/lib/activityFeed';

export default function CreateEventPage() {
  return (
    <AuthGuard>
      <CreateEventForm />
    </AuthGuard>
  );
}

function CreateEventForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [venueName, setVenueName] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [genre, setGenre] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [ticketLink, setTicketLink] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setSaving(true);

    const supabase = createSupabaseBrowser();
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData?.session?.user?.id) {
      setNotice('You must be logged in to create an event.');
      setSaving(false);
      return;
    }

    const userId = sessionData.session.user.id;

    const combinedStartTime = eventDate && startTime
      ? new Date(`${eventDate}T${startTime}`).toISOString()
      : null;

    const { data, error } = await supabase.from('events').insert({
      title,
      venue_name: venueName,
      description,
      event_date: eventDate || null,
      start_time: combinedStartTime,
      city,
      state,
      genre,
      cover_image: coverImage || null,
      ticket_link: ticketLink || null,
      created_by: userId,
      created_at: new Date().toISOString(),
    });

    if (error) {
      setNotice(error.message || 'Failed to create event.');
      setSaving(false);
      return;
    }

    const createdEventId = (data as any)?.[0]?.id ?? null;
    if (createdEventId) {
      await recordActivity({
        actorId: userId,
        actionType: 'created_event',
        eventId: createdEventId,
        metadata: { title, venue: venueName },
      });
    }

    // Navigate to event page
    const newId = (data as any)?.[0]?.id;
    if (newId) router.push(`/events/${newId}`);
    else router.push('/events');
  };

  return (
    <main className="min-h-screen bg-[#07070B] px-6 py-8 text-white">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
          <h1 className="text-3xl font-bold">Create Event</h1>
          <p className="mt-2 text-white/70">Add event details and publish to the feed.</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-3xl border border-white/10 bg-[#10061f] p-6 space-y-4">
          {notice && <div className="rounded-2xl border border-white/10 bg-violet-500/10 p-4 text-sm text-violet-100">{notice}</div>}

          <label className="block text-sm text-white/70">Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} required className="w-full rounded-3xl border border-white/10 bg-[#07070B] px-4 py-3 text-white mt-2" />
          </label>

          <label className="block text-sm text-white/70">Venue Name
            <input value={venueName} onChange={(e) => setVenueName(e.target.value)} required className="w-full rounded-3xl border border-white/10 bg-[#07070B] px-4 py-3 text-white mt-2" />
          </label>

          <label className="block text-sm text-white/70">Description
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-3xl border border-white/10 bg-[#07070B] px-4 py-3 text-white mt-2 min-h-[140px]" />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm text-white/70">Date
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="w-full rounded-3xl border border-white/10 bg-[#07070B] px-4 py-3 text-white mt-2" />
            </label>
            <label className="block text-sm text-white/70">Start Time
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full rounded-3xl border border-white/10 bg-[#07070B] px-4 py-3 text-white mt-2" />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm text-white/70">City
              <input value={city} onChange={(e) => setCity(e.target.value)} className="w-full rounded-3xl border border-white/10 bg-[#07070B] px-4 py-3 text-white mt-2" />
            </label>
            <label className="block text-sm text-white/70">State
              <input value={state} onChange={(e) => setState(e.target.value)} className="w-full rounded-3xl border border-white/10 bg-[#07070B] px-4 py-3 text-white mt-2" />
            </label>
          </div>

          <label className="block text-sm text-white/70">Genre
            <input value={genre} onChange={(e) => setGenre(e.target.value)} className="w-full rounded-3xl border border-white/10 bg-[#07070B] px-4 py-3 text-white mt-2" />
          </label>

          <label className="block text-sm text-white/70">Cover Image URL
            <input value={coverImage} onChange={(e) => setCoverImage(e.target.value)} placeholder="https://..." className="w-full rounded-3xl border border-white/10 bg-[#07070B] px-4 py-3 text-white mt-2" />
          </label>

          

          <label className="block text-sm text-white/70">Ticket Link
            <input value={ticketLink} onChange={(e) => setTicketLink(e.target.value)} placeholder="https://" className="w-full rounded-3xl border border-white/10 bg-[#07070B] px-4 py-3 text-white mt-2" />
          </label>

          <div className="flex items-center justify-between gap-4">
            <button type="submit" disabled={saving} className="rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50">{saving ? 'Publishing...' : 'Publish Event'}</button>
            <button type="button" onClick={() => router.push('/dashboard')} className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white">Cancel</button>
          </div>
        </form>
      </div>
    </main>
  );
}
