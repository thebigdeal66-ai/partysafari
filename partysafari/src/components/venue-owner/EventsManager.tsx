"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import { recordActivity } from "@/lib/activityFeed";

type ToastType = "success" | "error" | "info";

type EventRow = {
  id: string;
  venue_id: string;
  title: string;
  description: string | null;
  event_type: string | null;
  performer_name: string | null;
  start_time: string;
  end_time: string | null;
  cover_charge: number | null;
  age_requirement: string | null;
  drink_specials: string | null;
  image_url: string | null;
  ticket_url: string | null;
  featured: boolean;
  status: string;
};

type EventDraft = {
  id: string | null;
  title: string;
  description: string;
  eventType: string;
  performerName: string;
  startTime: string;
  endTime: string;
  coverCharge: string;
  ageRequirement: string;
  drinkSpecials: string;
  imageUrl: string;
  ticketUrl: string;
  featured: boolean;
  status: string;
};

const EMPTY_DRAFT: EventDraft = {
  id: null,
  title: "",
  description: "",
  eventType: "dj",
  performerName: "",
  startTime: "",
  endTime: "",
  coverCharge: "",
  ageRequirement: "21+",
  drinkSpecials: "",
  imageUrl: "",
  ticketUrl: "",
  featured: false,
  status: "published",
};

function logSupabaseQueryError(scope: string, error: { message?: string; code?: string; details?: string; hint?: string } | null) {
  if (!error) {
    return;
  }

  console.log("supabase_query_error", {
    scope,
    message: error.message ?? null,
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  });
}

function toInputDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  // Pad year to at least 4 digits so the datetime-local input never receives
  // a 3-digit year string that would round-trip back as the wrong century.
  const year = String(date.getFullYear()).padStart(4, "0");
  return `${year}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoString(value: string): string | null {
  if (!value) return null;
  // Parse datetime-local value ("YYYY-MM-DDTHH:mm") component by component
  // to avoid year-ambiguity bugs in the Date constructor.  Passing the raw
  // string to `new Date()` can silently produce year 0226 when the stored
  // value has a malformed year that rounds to a 2–3 digit string.
  const tIdx = value.indexOf("T");
  if (tIdx === -1) return null;
  const datePart = value.slice(0, tIdx);
  const timePart = value.slice(tIdx + 1);
  const [yearStr, monthStr, dayStr] = datePart.split("-");
  const [hoursStr, minutesStr] = timePart.split(":");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr || "0", 10);
  if (!Number.isFinite(year) || year < 2000 || year > 2200) return null;
  const date = new Date(year, month, day, hours, minutes);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildDraft(event: EventRow): EventDraft {
  return {
    id: event.id,
    title: event.title,
    description: event.description || "",
    eventType: event.event_type || "dj",
    performerName: event.performer_name || "",
    startTime: toInputDateTime(event.start_time),
    endTime: toInputDateTime(event.end_time),
    coverCharge: event.cover_charge !== null ? String(event.cover_charge) : "",
    ageRequirement: event.age_requirement || "21+",
    drinkSpecials: event.drink_specials || "",
    imageUrl: event.image_url || "",
    ticketUrl: event.ticket_url || "",
    featured: event.featured,
    status: event.status || "published",
  };
}

export default function EventsManager({
  venueId,
  pushToast,
}: {
  venueId: string;
  pushToast: (message: string, type?: ToastType) => void;
}) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<EventDraft>(EMPTY_DRAFT);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("venue_id", venueId)
      .order("created_at", { ascending: false });

    if (error) {
      logSupabaseQueryError("venue_owner.events_manager.load_events", error);
      pushToast("Unable to load events.", "error");
      setEvents([]);
      setLoading(false);
      return;
    }

    setEvents((data || []) as EventRow[]);
    setLoading(false);
  }, [pushToast, supabase, venueId]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    const channel = supabase.channel(`owner-events-${venueId}`);
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "events",
        filter: `venue_id=eq.${venueId}`,
      },
      () => {
        void loadEvents();
      }
    );

    void channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadEvents, supabase, venueId]);

  const saveEvent = useCallback(async () => {
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      pushToast("Please sign in again.", "error");
      setSaving(false);
      return;
    }

    // Validate start time before attempting to save
    if (draft.startTime && !toIsoString(draft.startTime)) {
      pushToast("Invalid start date — please check that the year is between 2000 and 2200.", "error");
      setSaving(false);
      return;
    }
    if (draft.endTime && !toIsoString(draft.endTime)) {
      pushToast("Invalid end date — please check that the year is between 2000 and 2200.", "error");
      setSaving(false);
      return;
    }

    const payload = {
      venue_id: venueId,
      title: draft.title || "Untitled Event",
      description: draft.description || null,
      event_type: draft.eventType || null,
      performer_name: draft.performerName || null,
      start_time: toIsoString(draft.startTime) || new Date().toISOString(),
      end_time: toIsoString(draft.endTime),
      cover_charge: draft.coverCharge ? Number(draft.coverCharge) : null,
      age_requirement: draft.ageRequirement || null,
      drink_specials: draft.drinkSpecials || null,
      image_url: draft.imageUrl || null,
      ticket_url: draft.ticketUrl || null,
      featured: draft.featured,
      status: draft.status || "published",
      created_by: user.id,
    };

    const legacyPayload = {
      venue_id: venueId,
      title: draft.title || "Untitled Event",
      description: draft.description || null,
      start_time: toIsoString(draft.startTime) || new Date().toISOString(),
      end_time: toIsoString(draft.endTime),
      cover_charge: draft.coverCharge ? Number(draft.coverCharge) : null,
      age_min: draft.ageRequirement ? Number(draft.ageRequirement.replace(/[^\d]/g, "")) || 21 : 21,
      cover_image: draft.imageUrl || null,
      ticket_link: draft.ticketUrl || null,
      genre: draft.eventType || null,
      created_by: user.id,
      status: draft.status || "published",
    };

    if (draft.id) {
      const { error } = await supabase.from("events").update(payload).eq("id", draft.id);
      if (error) {
        logSupabaseQueryError("venue_owner.events_manager.update_event", error);
        const { error: fallbackError } = await supabase.from("events").update(legacyPayload).eq("id", draft.id);
        if (fallbackError) {
          logSupabaseQueryError("venue_owner.events_manager.update_event_legacy", fallbackError);
          pushToast("Unable to update event.", "error");
          setSaving(false);
          return;
        }
      }
      pushToast("Event updated.", "success");
    } else {
      const { data: newEventData, error } = await supabase.from("events").insert(payload).select("id");
      if (error) {
        logSupabaseQueryError("venue_owner.events_manager.insert_event", error);
        const { error: fallbackError } = await supabase.from("events").insert(legacyPayload);
        if (fallbackError) {
          logSupabaseQueryError("venue_owner.events_manager.insert_event_legacy", fallbackError);
          pushToast("Unable to create event.", "error");
          setSaving(false);
          return;
        }
      }
      
      // Try to create activity feed entry for the new event
      if (newEventData && newEventData.length > 0) {
        const newEventId = newEventData[0].id;
        const venueData = await supabase
          .from("venues")
          .select("name, slug")
          .eq("id", venueId)
          .maybeSingle();
        
        const venueName = venueData?.data?.name || "Unknown Venue";
        const venueSlug = venueData?.data?.slug || venueId;
        
        await recordActivity({
          actorId: user.id,
          actionType: "event_created",
          eventId: newEventId,
          profileId: user.id,
          metadata: {
            event_title: draft.title || "Untitled Event",
            venue_name: venueName,
            venue_slug: venueSlug,
            start_time: toIsoString(draft.startTime) || new Date().toISOString(),
          },
        }).catch((err) => {
          if (process.env.NODE_ENV === "development") {
            console.error("Failed to record event creation in activity feed:", err);
          }
          // Don't fail event creation if activity feed fails
        });
      }
      
      pushToast("Event created.", "success");
    }

    setDraft(EMPTY_DRAFT);
    setSaving(false);
    void loadEvents();
  }, [draft, loadEvents, pushToast, supabase, venueId]);

  const deleteEvent = useCallback(async (eventId: string) => {
    const { error } = await supabase.from("events").delete().eq("id", eventId);
    if (error) {
      pushToast("Unable to delete event.", "error");
      return;
    }
    pushToast("Event deleted.", "success");
    void loadEvents();
  }, [loadEvents, pushToast, supabase]);

  const duplicateEvent = useCallback(async (event: EventRow) => {
    const payload = {
      venue_id: event.venue_id,
      title: `${event.title} Copy`,
      description: event.description,
      event_type: event.event_type,
      performer_name: event.performer_name,
      start_time: event.start_time,
      end_time: event.end_time,
      cover_charge: event.cover_charge,
      age_requirement: event.age_requirement,
      drink_specials: event.drink_specials,
      image_url: event.image_url,
      ticket_url: event.ticket_url,
      featured: false,
      status: "published",
    };

    const { error } = await supabase.from("events").insert(payload);
    if (error) {
      logSupabaseQueryError("venue_owner.events_manager.duplicate_event", error);
      const fallbackPayload = {
        venue_id: event.venue_id,
        title: `${event.title} Copy`,
        description: event.description,
        start_time: event.start_time,
        end_time: event.end_time,
        cover_charge: event.cover_charge,
        age_min: event.age_requirement ? Number(event.age_requirement.replace(/[^\d]/g, "")) || 21 : 21,
        cover_image: event.image_url,
        ticket_link: event.ticket_url,
        genre: event.event_type,
        status: "published",
      };
      const { error: fallbackError } = await supabase.from("events").insert(fallbackPayload);
      if (fallbackError) {
        logSupabaseQueryError("venue_owner.events_manager.duplicate_event_legacy", fallbackError);
        pushToast("Unable to duplicate event.", "error");
        return;
      }
    }

    pushToast("Event duplicated.", "success");
    void loadEvents();
  }, [loadEvents, pushToast, supabase]);

  const toggleFeatured = useCallback(async (event: EventRow) => {
    const { error } = await supabase.from("events").update({ featured: !event.featured }).eq("id", event.id);
    if (error) {
      logSupabaseQueryError("venue_owner.events_manager.toggle_featured", error);
      const { error: fallbackError } = await supabase.from("events").update({ is_featured: !event.featured }).eq("id", event.id);
      if (fallbackError) {
        logSupabaseQueryError("venue_owner.events_manager.toggle_featured_legacy", fallbackError);
        pushToast("Unable to update featured state.", "error");
        return;
      }
    }
    pushToast(!event.featured ? "Event featured." : "Event unfeatured.", "success");
    void loadEvents();
  }, [loadEvents, pushToast, supabase]);

  const cancelEvent = useCallback(async (event: EventRow) => {
    const { error } = await supabase.from("events").update({ status: "cancelled" }).eq("id", event.id);
    if (error) {
      pushToast("Unable to cancel event.", "error");
      return;
    }

    pushToast("Event cancelled.", "success");
    void loadEvents();
  }, [loadEvents, pushToast, supabase]);

  const uploadImage = useCallback(async (file: File) => {
    const extension = file.name.split(".").pop() || "jpg";
    const filePath = `${venueId}/events/${Date.now()}.${extension.replace(/[^a-zA-Z0-9]/g, "")}`;

    const { error } = await supabase.storage.from("party-media").upload(filePath, file, {
      contentType: file.type,
      upsert: true,
    });

    if (error) {
      pushToast(error.message || "Unable to upload image.", "error");
      return;
    }

    const { data } = supabase.storage.from("party-media").getPublicUrl(filePath);
    setDraft((current) => ({ ...current, imageUrl: data.publicUrl }));
    pushToast("Image uploaded.", "success");
  }, [pushToast, supabase, venueId]);

  return (
    <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-white">Events</h2>
          <p className="text-sm text-white/70">Create, edit, duplicate, feature, and cancel live events.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-white/75">
          Title
          <input value={draft.title} onChange={(e) => setDraft((c) => ({ ...c, title: e.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white" />
        </label>
        <label className="text-sm text-white/75">
          DJ / Performer
          <input value={draft.performerName} onChange={(e) => setDraft((c) => ({ ...c, performerName: e.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white" />
        </label>

        <label className="text-sm text-white/75">
          Event type
          <select value={draft.eventType} onChange={(e) => setDraft((c) => ({ ...c, eventType: e.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white">
            <option value="dj">DJ</option>
            <option value="live_music">Live Music</option>
            <option value="comedy">Comedy</option>
            <option value="trivia">Trivia</option>
            <option value="karaoke">Karaoke</option>
            <option value="happy_hour">Happy Hour</option>
          </select>
        </label>
        <label className="text-sm text-white/75">
          Cover
          <input value={draft.coverCharge} onChange={(e) => setDraft((c) => ({ ...c, coverCharge: e.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white" placeholder="0" />
        </label>

        <label className="text-sm text-white/75">
          Start time
          <input type="datetime-local" value={draft.startTime} onChange={(e) => setDraft((c) => ({ ...c, startTime: e.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white" />
        </label>
        <label className="text-sm text-white/75">
          End time
          <input type="datetime-local" value={draft.endTime} onChange={(e) => setDraft((c) => ({ ...c, endTime: e.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white" />
        </label>

        <label className="text-sm text-white/75 md:col-span-2">
          Description
          <textarea value={draft.description} onChange={(e) => setDraft((c) => ({ ...c, description: e.target.value }))} className="mt-2 min-h-28 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white" />
        </label>

        <label className="text-sm text-white/75 md:col-span-2">
          Drink specials
          <input value={draft.drinkSpecials} onChange={(e) => setDraft((c) => ({ ...c, drinkSpecials: e.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white" />
        </label>

        <label className="text-sm text-white/75">
          Ticket URL
          <input value={draft.ticketUrl} onChange={(e) => setDraft((c) => ({ ...c, ticketUrl: e.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white" placeholder="https://" />
        </label>
        <label className="text-sm text-white/75">
          Age requirement
          <input value={draft.ageRequirement} onChange={(e) => setDraft((c) => ({ ...c, ageRequirement: e.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white" />
        </label>

        <label className="text-sm text-white/75 md:col-span-2">
          Image URL
          <input value={draft.imageUrl} onChange={(e) => setDraft((c) => ({ ...c, imageUrl: e.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white" placeholder="https://" />
        </label>

        <label className="text-sm text-white/75 md:col-span-2">
          Image upload
          <input type="file" accept="image/*" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              void uploadImage(file);
            }
          }} className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white" />
        </label>

        <label className="flex items-center gap-2 text-sm text-white/80">
          <input type="checkbox" checked={draft.featured} onChange={(e) => setDraft((c) => ({ ...c, featured: e.target.checked }))} />
          Featured
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={() => void saveEvent()} disabled={saving} className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60">
          {saving ? "Saving..." : draft.id ? "Update Event" : "Create Event"}
        </button>
        <button type="button" onClick={() => setDraft(EMPTY_DRAFT)} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80">
          Reset
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-[#07070B] p-4">
        <p className="text-xs uppercase tracking-[0.24em] text-violet-300">Preview</p>
        <div className="mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#10061f]">
          {draft.imageUrl ? (
            <img src={draft.imageUrl} alt={draft.title || "Event"} className="h-40 w-full object-cover" />
          ) : (
            <div className="flex h-40 items-center justify-center bg-gradient-to-br from-violet-900/35 to-orange-800/25 text-violet-100">PartySafari Live Event</div>
          )}
          <div className="p-4">
            <h3 className="text-lg font-semibold text-white">{draft.title || "Untitled Event"}</h3>
            <p className="text-sm text-white/70">{draft.performerName || "Featured performer"}</p>
            <p className="mt-1 text-xs text-white/60">{draft.startTime ? new Date(draft.startTime).toLocaleString() : "Start time TBD"}</p>
          </div>
        </div>
      </div>

      <div className="mt-7">
        <h3 className="text-xl font-semibold text-white">Existing Events</h3>
        {loading ? (
          <p className="mt-3 text-sm text-white/65">Loading events...</p>
        ) : events.length === 0 ? (
          <p className="mt-3 text-sm text-white/65">No events yet.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {events.map((event) => (
              <article key={event.id} className="rounded-2xl border border-white/10 bg-[#0b0717] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-lg font-semibold text-white">{event.title}</h4>
                    <p className="text-sm text-white/70">{event.performer_name || "Performer TBA"}</p>
                    <p className="mt-1 text-xs text-white/60">{new Date(event.start_time).toLocaleString()} • {event.status}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setDraft(buildDraft(event))} className="rounded-full border border-violet-400/40 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-100">Edit</button>
                    <button type="button" onClick={() => void duplicateEvent(event)} className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80">Duplicate</button>
                    <button type="button" onClick={() => void toggleFeatured(event)} className="rounded-full border border-orange-300/30 bg-orange-500/10 px-3 py-1.5 text-xs font-semibold text-orange-100">{event.featured ? "Unfeature" : "Feature"}</button>
                    <button type="button" onClick={() => void cancelEvent(event)} className="rounded-full border border-amber-300/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100">Cancel</button>
                    <button type="button" onClick={() => void deleteEvent(event.id)} className="rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100">Delete</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
