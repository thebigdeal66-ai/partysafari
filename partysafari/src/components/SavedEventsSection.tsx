"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabaseClient";

interface SavedEventRow {
  id: string;
  event_id: string;
  events: {
    id: string;
    title: string;
    venue_name: string | null;
    event_date: string | null;
    start_time: string | null;
    cover_image: string | null;
  } | null;
}

interface RawSavedEventRow {
  id: string;
  event_id: string;
  events:
    | {
        id: string;
        title: string;
        venue_name: string | null;
        event_date: string | null;
        start_time: string | null;
        cover_image: string | null;
      }
    | {
        id: string;
        title: string;
        venue_name: string | null;
        event_date: string | null;
        start_time: string | null;
        cover_image: string | null;
      }[]
    | null;
}

function normalizeSavedEventRow(row: RawSavedEventRow): SavedEventRow {
  const eventPayload = Array.isArray(row.events) ? row.events[0] : row.events;

  return {
    id: row.id,
    event_id: row.event_id,
    events: eventPayload
      ? {
          id: eventPayload.id,
          title: eventPayload.title,
          venue_name: eventPayload.venue_name ?? null,
          event_date: eventPayload.event_date ?? null,
          start_time: eventPayload.start_time ?? null,
          cover_image: eventPayload.cover_image ?? null,
        }
      : null,
  };
}

function formatDate(value: string | null) {
  if (!value) return "TBA";
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function formatTime(value: string | null) {
  if (!value) return "TBA";
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function SavedEventsSection() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [savedEvents, setSavedEvents] = useState<SavedEventRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadSavedEvents = async () => {
      setErrorMessage(null);
      setIsLoading(true);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        setErrorMessage("Unable to verify user session.");
        setIsLoading(false);
        return;
      }

      const userId = userData?.user?.id;
      if (!userId) {
        setSavedEvents([]);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("saved_events")
        .select("id, event_id, events(id, title, venue_name, event_date, start_time, cover_image)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!isMounted) return;

      if (error) {
        console.error("Failed to load saved events:", error);
        setErrorMessage("Unable to load saved events right now.");
        setSavedEvents([]);
      } else {
        setSavedEvents(((data ?? []) as RawSavedEventRow[]).map(normalizeSavedEventRow));
      }

      setIsLoading(false);
    };

    void loadSavedEvents();
    return () => {
      isMounted = false;
    };
  }, [supabase]);

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#10061f] p-6 text-white/70">
        Loading saved events...
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#10061f] p-6 text-rose-300">
        {errorMessage}
      </div>
    );
  }

  if (savedEvents.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#10061f] p-6 text-white/70">
        You haven't saved any events yet. Save one from an event page to see it here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {savedEvents.map((row) => {
        const event = row.events;
        if (!event) {
          return null;
        }
        return (
          <Link
            key={row.id}
            href={`/events/${event.id}`}
            className="block rounded-3xl border border-white/10 bg-[#10061f] p-4 transition hover:border-violet-400"
          >
            <div className="flex items-center gap-4">
              {event.cover_image ? (
                <img
                  src={event.cover_image}
                  alt={event.title}
                  className="h-20 w-20 rounded-3xl object-cover"
                />
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
                  {formatDate(event.event_date)} • {formatTime(event.start_time)}
                </p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
