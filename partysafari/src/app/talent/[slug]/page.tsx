"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";

type VenueLite = {
  slug: string | null;
  name: string | null;
  city: string | null;
  state: string | null;
};

type EventLite = {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  status: string | null;
  city: string | null;
  state: string | null;
  ticket_url: string | null;
  ticket_link: string | null;
  venues: VenueLite | VenueLite[] | null;
};

type AppearanceJoin = {
  billing_order: number | null;
  events: EventLite | EventLite[] | null;
};

type PerformerRow = {
  id: string;
  slug: string;
  stage_name: string;
  performer_type: string;
  bio: string | null;
  genres: string[] | null;
  instagram: string | null;
  photo_url: string | null;
  event_performers: AppearanceJoin[] | null;
};

type Appearance = EventLite & {
  venue: VenueLite | null;
};

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function safeExternalUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function TalentProfilePage() {
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [performer, setPerformer] = useState<PerformerRow | null>(null);
  const [appearances, setAppearances] = useState<Appearance[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    if (!slug) return;

    let mounted = true;

    const loadProfile = async () => {
      setLoading(true);
      setError(null);
      setNotFound(false);

      const { data, error: profileError } = await supabase
        .from("performers")
        .select(`
          id,
          slug,
          stage_name,
          performer_type,
          bio,
          genres,
          instagram,
          photo_url,
          event_performers (
            billing_order,
            events:event_id (
              id,
              title,
              description,
              start_time,
              status,
              city,
              state,
              ticket_url,
              ticket_link,
              venues:venue_id (
                slug,
                name,
                city,
                state
              )
            )
          )
        `)
        .eq("slug", slug)
        .maybeSingle();

      if (!mounted) return;

      if (profileError) {
        if (process.env.NODE_ENV === "development") {
          console.error("[talent-profile] Failed to load performer:", profileError);
        }
        setError("Unable to load this performer right now.");
        setLoading(false);
        return;
      }

      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const row = data as PerformerRow;
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let ownsProfile = false;
      if (user) {
        const { data: ownership } = await supabase
          .from("performer_owners")
          .select("performer_id")
          .eq("performer_id", row.id)
          .eq("profile_id", user.id)
          .maybeSingle();
        ownsProfile = Boolean(ownership);
      }

      if (!mounted) return;
      setIsOwner(ownsProfile);

      const now = Date.now();
      const upcoming = (row.event_performers ?? [])
        .map((link) => firstOf(link.events))
        .filter((event): event is EventLite => Boolean(event?.id && event.start_time))
        .filter((event) => event.status !== "cancelled" && new Date(event.start_time).getTime() >= now)
        .map((event) => ({
          ...event,
          venue: firstOf(event.venues),
        }))
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

      setPerformer(row);
      setAppearances(upcoming);
      setLoading(false);
    };

    void loadProfile();

    return () => {
      mounted = false;
    };
  }, [slug, supabase]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-12 text-white">
        <div className="mx-auto max-w-5xl">
          <div className="h-72 animate-pulse rounded-3xl border border-white/10 bg-white/5" />
        </div>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-12 text-white">
        <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
          <h1 className="text-3xl font-semibold">Performer not found</h1>
          <p className="mt-2 text-white/60">This PartySafari Talent profile is not available.</p>
          <Link href="/talent" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-violet-600 px-5 text-sm font-semibold">
            Browse Talent
          </Link>
        </div>
      </main>
    );
  }

  if (error || !performer) {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-12 text-white">
        <div className="mx-auto max-w-3xl rounded-3xl border border-rose-400/25 bg-rose-500/10 p-6 text-rose-100">
          <p>{error ?? "Unable to load this performer."}</p>
          <Link href="/talent" className="mt-4 inline-flex text-sm font-semibold underline underline-offset-4">
            Back to Talent
          </Link>
        </div>
      </main>
    );
  }

  const initials = performer.stage_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const photoUrl = safeExternalUrl(performer.photo_url);
  const instagramUrl = performer.instagram
    ? safeExternalUrl(
        performer.instagram.includes("instagram.com")
          ? performer.instagram
          : `https://instagram.com/${performer.instagram.replace(/^@/, "")}`
      )
    : null;

  return (
    <main className="min-h-screen bg-[#07070B] text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(124,58,237,0.3),_transparent_40%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.15),_transparent_35%)] px-6 py-10">
        <div className="mx-auto max-w-5xl">
          <Link href="/talent" className="text-sm font-semibold text-violet-200 hover:text-white">
            ← All Talent
          </Link>
          <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center">
            <div
              role={photoUrl ? "img" : undefined}
              aria-label={photoUrl ? `${performer.stage_name} profile photo` : undefined}
              className="flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-600 to-orange-500 bg-cover bg-center text-3xl font-black shadow-[0_0_45px_rgba(124,58,237,0.2)]"
              style={photoUrl ? { backgroundImage: `url(${JSON.stringify(photoUrl)})` } : undefined}
            >
              {photoUrl ? null : initials || "PS"}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-300">
                {performer.performer_type}
              </p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">{performer.stage_name}</h1>
              {performer.genres?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {performer.genres.map((genre) => (
                    <span key={genre} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/65">
                      {genre}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-8 px-6 py-8 lg:grid-cols-[0.8fr_1.2fr]">
        <aside className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-lg font-semibold">About</h2>
            <p className="mt-3 text-sm leading-6 text-white/65">
              {performer.bio || "This performer has been added from a verified PartySafari event lineup. Profile details will grow as the artist connects with PartySafari."}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href={`/talent/${performer.slug}/book`}
                className="inline-flex min-h-11 items-center rounded-full bg-gradient-to-r from-violet-600 to-orange-500 px-5 text-sm font-bold text-white shadow-[0_0_28px_rgba(124,58,237,0.2)] transition hover:brightness-110"
              >
                Request booking
              </Link>
              {instagramUrl ? (
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center rounded-full border border-violet-300/30 bg-violet-500/10 px-4 text-sm font-semibold text-violet-100"
                >
                  Instagram
                </a>
              ) : null}
            </div>
          </div>

          {isOwner ? (
            <div className="rounded-3xl border border-emerald-300/20 bg-emerald-500/[0.07] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200/80">Your Talent profile</p>
              <h2 className="mt-2 text-lg font-bold">You manage this page</h2>
              <p className="mt-2 text-sm leading-6 text-white/60">
                Update your artist details here. Booking inquiries remain in your private PartySafari inbox.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/talent/${performer.slug}/edit`}
                  className="inline-flex min-h-11 items-center rounded-full bg-emerald-500 px-4 text-sm font-bold text-black"
                >
                  Manage profile
                </Link>
                <Link
                  href="/bookings"
                  className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-sm font-semibold text-white/80"
                >
                  Booking inbox
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-violet-300/15 bg-violet-500/[0.07] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200/80">For artists & representatives</p>
              <h2 className="mt-2 text-lg font-bold">Is this you?</h2>
              <p className="mt-2 text-sm leading-6 text-white/60">
                Claim this Talent profile to manage its details and receive PartySafari booking inquiries after verification.
              </p>
              <Link
                href={`/talent/${performer.slug}/claim`}
                className="mt-4 inline-flex min-h-11 items-center rounded-full border border-violet-300/30 bg-violet-500/10 px-4 text-sm font-bold text-violet-100"
              >
                Claim this profile
              </Link>
            </div>
          )}

          <div className="rounded-3xl border border-orange-300/15 bg-orange-500/[0.07] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-200/80">PartySafari lineup data</p>
            <p className="mt-2 text-3xl font-semibold">{appearances.length}</p>
            <p className="text-sm text-white/55">upcoming appearance{appearances.length === 1 ? "" : "s"}</p>
          </div>
        </aside>

        <div>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">Where to see them</p>
              <h2 className="mt-1 text-3xl font-semibold">Upcoming appearances</h2>
            </div>
          </div>

          {appearances.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white/60">
              No upcoming PartySafari appearances are listed yet.
            </div>
          ) : (
            <div className="space-y-4">
              {appearances.map((event) => {
                const ticketUrl = safeExternalUrl(event.ticket_url || event.ticket_link);
                const venueLocation = [event.venue?.city || event.city, event.venue?.state || event.state]
                  .filter(Boolean)
                  .join(", ");

                return (
                  <article key={event.id} className="rounded-3xl border border-white/10 bg-gradient-to-r from-[#120824] to-[#0c0712] p-5">
                    <p className="text-sm font-semibold text-violet-200">{formatDate(event.start_time)}</p>
                    <h3 className="mt-2 text-2xl font-semibold">{event.title}</h3>
                    <p className="mt-2 text-sm text-white/60">
                      {event.venue?.name || "Venue TBA"}{venueLocation ? ` · ${venueLocation}` : ""}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {event.venue?.slug ? (
                        <Link
                          href={`/venues/${event.venue.slug}`}
                          className="inline-flex min-h-11 items-center rounded-full border border-violet-300/30 bg-violet-500/10 px-4 text-sm font-semibold text-violet-100"
                        >
                          View venue
                        </Link>
                      ) : null}
                      {ticketUrl ? (
                        <a
                          href={ticketUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-11 items-center rounded-full border border-orange-300/30 bg-orange-500/10 px-4 text-sm font-semibold text-orange-100"
                        >
                          Event tickets
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
