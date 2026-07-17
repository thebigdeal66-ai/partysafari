"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabaseClient";

interface MyRsvpRow {
  id: string;
  status: "going" | "interested";
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

interface RawRsvpRow {
  id: string;
  status: "going" | "interested";
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

function normalizeRsvpRow(row: RawRsvpRow): MyRsvpRow {
  const eventPayload = Array.isArray(row.events) ? row.events[0] : row.events;

  return {
    id: row.id,
    status: row.status,
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

export default function MyRsvpsSection() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [rsvps, setRsvps] = useState<MyRsvpRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadRsvps = async () => {
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
        setRsvps([]);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("event_rsvps")
        .select("id, status, event_id, events(id, title, venue_name, event_date, start_time, cover_image)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!isMounted) return;

      if (error) {
        console.error("Failed to load RSVPs:", error);
        setErrorMessage("Unable to load your RSVPs right now.");
        setRsvps([]);
      } else {
        setRsvps(((data ?? []) as RawRsvpRow[]).map(normalizeRsvpRow));
      }

      setIsLoading(false);
    };

    void loadRsvps();
    return () => {
      isMounted = false;
    };
  }, [supabase]);

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#10061f] p-6 text-white/70">
        Loading your RSVPs...
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

  if (rsvps.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#10061f] p-6 text-white/70">
        You haven&apos;t RSVP&apos;d to any events yet. Visit an event page to mark yourself as Going or Interested.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rsvps.map((row) => {
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
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm uppercase tracking-[0.24em] text-violet-300">My RSVP</p>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                      row.status === "going"
                        ? "bg-violet-500/20 text-violet-200"
                        : "bg-pink-500/20 text-pink-200"
                    }`}
                  >
                    {row.status === "going" ? "Going" : "Interested"}
                  </span>
                </div>
                <h3 className="mt-1 text-lg font-semibold text-white">{event.title}</h3>
                <p className="text-sm text-white/70">{event.venue_name || "Venue TBA"}</p>
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
