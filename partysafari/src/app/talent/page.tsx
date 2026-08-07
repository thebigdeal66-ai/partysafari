"use client";

import Link from "next/link";
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
  start_time: string;
  status: string | null;
  city: string | null;
  state: string | null;
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
  event_performers: AppearanceJoin[] | null;
};

type Appearance = {
  id: string;
  title: string;
  start_time: string;
  venue: VenueLite | null;
};

type PerformerCard = PerformerRow & {
  upcoming: Appearance[];
};

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatAppearanceDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function normalizePerformer(row: PerformerRow): PerformerCard {
  const now = Date.now();
  const upcoming = (row.event_performers ?? [])
    .map((link) => firstOf(link.events))
    .filter((event): event is EventLite => Boolean(event?.id && event.start_time))
    .filter((event) => event.status !== "cancelled" && new Date(event.start_time).getTime() >= now)
    .map((event) => ({
      id: event.id,
      title: event.title,
      start_time: event.start_time,
      venue: firstOf(event.venues),
    }))
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  return { ...row, upcoming };
}

export default function TalentPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [performers, setPerformers] = useState<PerformerCard[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadTalent = async () => {
      setLoading(true);
      setError(null);

      const { data, error: talentError } = await supabase
        .from("performers")
        .select(`
          id,
          slug,
          stage_name,
          performer_type,
          bio,
          genres,
          event_performers (
            billing_order,
            events:event_id (
              id,
              title,
              start_time,
              status,
              city,
              state,
              venues:venue_id (
                slug,
                name,
                city,
                state
              )
            )
          )
        `)
        .order("stage_name", { ascending: true });

      if (!mounted) return;

      if (talentError) {
        if (process.env.NODE_ENV === "development") {
          console.error("[talent] Failed to load performers:", talentError);
        }
        setError("Unable to load Talent right now.");
        setPerformers([]);
        setLoading(false);
        return;
      }

      setPerformers(((data ?? []) as PerformerRow[]).map(normalizePerformer));
      setLoading(false);
    };

    void loadTalent();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  const types = useMemo(
    () => ["All", ...Array.from(new Set(performers.map((performer) => performer.performer_type).filter(Boolean))).sort()],
    [performers]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return performers.filter((performer) => {
      const matchesType = typeFilter === "All" || performer.performer_type === typeFilter;
      const searchable = [
        performer.stage_name,
        performer.performer_type,
        ...(performer.genres ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return matchesType && (!needle || searchable.includes(needle));
    });
  }, [performers, query, typeFilter]);

  const appearanceCount = useMemo(
    () => performers.reduce((total, performer) => total + performer.upcoming.length, 0),
    [performers]
  );

  return (
    <main className="min-h-screen bg-[#07070B] text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(124,58,237,0.28),_transparent_38%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.16),_transparent_34%)] px-6 py-12">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-violet-300">PartySafari Talent</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Discover the DJs, bands, and artists playing your next night out.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-white/65">
            Real performers linked to current PartySafari event listings in Salisbury and Ocean City.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-violet-300/20 bg-violet-500/10 px-3 py-1.5 text-violet-100">
              {performers.length} performers
            </span>
            <span className="rounded-full border border-orange-300/20 bg-orange-500/10 px-3 py-1.5 text-orange-100">
              {appearanceCount} upcoming appearances
            </span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-4 md:grid-cols-[1fr_auto]">
          <label className="sr-only" htmlFor="talent-search">Search Talent</label>
          <input
            id="talent-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search performers, DJs, bands, or genres"
            className="min-h-11 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm text-white outline-none placeholder:text-white/35 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/20"
          />
          <div className="flex flex-wrap gap-2">
            {types.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setTypeFilter(type)}
                className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition ${
                  typeFilter === type
                    ? "border-violet-300/60 bg-violet-500/25 text-white"
                    : "border-white/10 bg-white/5 text-white/65 hover:border-white/20 hover:text-white"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-rose-100">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-64 animate-pulse rounded-3xl border border-white/10 bg-white/5" />
            ))}
          </div>
        ) : null}

        {!loading && !error && filtered.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-lg font-semibold">No performers match that search.</p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setTypeFilter("All");
              }}
              className="mt-4 rounded-full border border-violet-300/30 bg-violet-500/10 px-4 py-2 text-sm font-semibold text-violet-100"
            >
              Clear filters
            </button>
          </div>
        ) : null}

        {!loading && !error && filtered.length > 0 ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((performer) => {
              const next = performer.upcoming[0] ?? null;
              const initials = performer.stage_name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase())
                .join("");

              return (
                <article
                  key={performer.id}
                  className="flex min-h-64 flex-col rounded-3xl border border-white/10 bg-gradient-to-b from-[#120824] to-[#0c0712] p-5 transition hover:-translate-y-0.5 hover:border-violet-300/30"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-orange-500 text-lg font-black">
                      {initials || "PS"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">
                        {performer.performer_type}
                      </p>
                      <h2 className="mt-1 truncate text-2xl font-semibold">{performer.stage_name}</h2>
                    </div>
                  </div>

                  <div className="mt-5 flex-1">
                    {next ? (
                      <div className="rounded-2xl border border-orange-300/15 bg-orange-500/[0.07] p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-200/80">Next appearance</p>
                        <p className="mt-1 font-medium text-white">{next.title}</p>
                        <p className="mt-1 text-sm text-white/60">{formatAppearanceDate(next.start_time)}</p>
                        {next.venue?.name ? (
                          <p className="mt-1 text-sm text-white/60">{next.venue.name}</p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-white/50">More PartySafari appearances coming soon.</p>
                    )}
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-3">
                    <span className="text-xs text-white/45">
                      {performer.upcoming.length
                        ? `${performer.upcoming.length} upcoming`
                        : "Lineup profile"}
                    </span>
                    <Link
                      href={`/talent/${performer.slug}`}
                      className="inline-flex min-h-11 items-center rounded-full bg-violet-600 px-4 text-sm font-semibold text-white transition hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
                    >
                      View profile
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </main>
  );
}
