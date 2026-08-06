"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";

type TimelineItem = {
  id: string;
  kind: "checkin" | "story" | "lit" | "event" | "score";
  icon: string;
  title: string;
  detail: string;
  occurredAt: string;
};

type VenueActivityTimelineProps = {
  venueId: string;
  venueName: string;
  eventTitle?: string | null;
  eventStartTime?: string | null;
  partyScore: number;
  momentum: number;
  scoreUpdatedAt?: string | null;
};

function asTime(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function describeMomentum(momentum: number) {
  if (momentum >= 12) return "Energy is surging";
  if (momentum >= 4) return "Energy is climbing";
  if (momentum <= -8) return "Energy is cooling";
  return "Energy is holding steady";
}

export default function VenueActivityTimeline({
  venueId,
  venueName,
  eventTitle = null,
  eventStartTime = null,
  partyScore,
  momentum,
  scoreUpdatedAt = null,
}: VenueActivityTimelineProps) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const refresh = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

    const [checkinsResult, storiesResult, litResult] = await Promise.all([
      supabase
        .from("venue_checkins")
        .select("id, checked_in_at")
        .eq("venue_id", venueId)
        .gte("checked_in_at", since)
        .order("checked_in_at", { ascending: false })
        .limit(12),
      supabase
        .from("stories")
        .select("id, media_type, created_at")
        .eq("venue_id", venueId)
        .is("deleted_at", null)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("venue_lit_signals")
        .select("id, created_at")
        .eq("venue_id", venueId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    const next: TimelineItem[] = [];

    for (const row of checkinsResult.data || []) {
      next.push({
        id: `checkin-${row.id}`,
        kind: "checkin",
        icon: "👥",
        title: "Someone checked in",
        detail: `${venueName} gained live presence`,
        occurredAt: row.checked_in_at,
      });
    }

    for (const row of storiesResult.data || []) {
      const isVideo = row.media_type === "video";
      next.push({
        id: `story-${row.id}`,
        kind: "story",
        icon: isVideo ? "🎥" : "📸",
        title: isVideo ? "New live video" : "New live photo",
        detail: "Fresh venue story added",
        occurredAt: row.created_at,
      });
    }

    for (const row of litResult.data || []) {
      next.push({
        id: `lit-${row.id}`,
        kind: "lit",
        icon: "🔥",
        title: "Venue Lit up",
        detail: "An on-site guest endorsed the energy",
        occurredAt: row.created_at,
      });
    }

    if (eventTitle && eventStartTime && asTime(eventStartTime) >= asTime(since)) {
      next.push({
        id: `event-${venueId}-${eventStartTime}`,
        kind: "event",
        icon: "🎵",
        title: eventTitle,
        detail: "Live event activity",
        occurredAt: eventStartTime,
      });
    }

    if (scoreUpdatedAt) {
      next.push({
        id: `score-${venueId}-${scoreUpdatedAt}`,
        kind: "score",
        icon: momentum >= 4 ? "📈" : momentum <= -8 ? "📉" : "⚡",
        title: `Party Score ${Math.round(partyScore)}`,
        detail: describeMomentum(momentum),
        occurredAt: scoreUpdatedAt,
      });
    }

    next.sort((left, right) => asTime(right.occurredAt) - asTime(left.occurredAt));
    setItems(next.slice(0, 24));
    setLoading(false);
  }, [eventStartTime, eventTitle, momentum, partyScore, scoreUpdatedAt, supabase, venueId, venueName]);

  useEffect(() => {
    void refresh();

    const channel = supabase.channel(`venue-activity:${venueId}`);
    const handleChange = () => void refresh();

    for (const table of ["venue_checkins", "stories", "venue_lit_signals"] as const) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `venue_id=eq.${venueId}` },
        handleChange
      );
    }

    void channel.subscribe();
    const intervalId = window.setInterval(() => void refresh(), 30_000);

    return () => {
      window.clearInterval(intervalId);
      void supabase.removeChannel(channel);
    };
  }, [refresh, supabase, venueId]);

  const visibleItems = expanded ? items : items.slice(0, 4);

  return (
    <section className="rounded-2xl border border-white/10 bg-black/20 p-3" aria-label={`${venueName} live activity timeline`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-100/65">Live Timeline</p>
          <p className="mt-0.5 text-xs text-white/55">How tonight is building</p>
        </div>
        {items.length > 4 ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/75"
          >
            {expanded ? "Show less" : `View all ${items.length}`}
          </button>
        ) : null}
      </div>

      <div className="mt-3 space-y-2">
        {loading ? <p className="text-xs text-white/50">Loading live activity…</p> : null}
        {!loading && visibleItems.length === 0 ? (
          <p className="text-xs leading-relaxed text-white/50">No verified activity in the last six hours yet.</p>
        ) : null}
        {visibleItems.map((item, index) => (
          <div key={item.id} className="relative flex gap-2.5">
            {index < visibleItems.length - 1 ? <span className="absolute left-[13px] top-7 h-[calc(100%-12px)] w-px bg-white/10" /> : null}
            <span className="relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/15 bg-[#111827] text-sm">{item.icon}</span>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-xs font-semibold text-white">{item.title}</p>
                <time className="shrink-0 text-[10px] text-white/40" dateTime={item.occurredAt}>{formatTime(item.occurredAt)}</time>
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-white/50">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
