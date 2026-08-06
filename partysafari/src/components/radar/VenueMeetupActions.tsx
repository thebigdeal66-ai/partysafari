"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";

type VenueMeetupActionsProps = {
  venueId: string;
  venueName: string;
  venueSlug: string;
  friendsHereCount: number;
};

type TonightPlan = {
  id: string;
};

function localDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function VenueMeetupActions({ venueId, venueName, venueSlug, friendsHereCount }: VenueMeetupActionsProps) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [plan, setPlan] = useState<TonightPlan | null>(null);
  const [stopId, setStopId] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(true);
  const [savingIntent, setSavingIntent] = useState(false);
  const headingHere = Boolean(stopId);

  const venueUrl = useMemo(() => {
    if (typeof window === "undefined") return `/venues/${venueSlug}`;
    return `${window.location.origin}/venues/${venueSlug}`;
  }, [venueSlug]);

  const socialHeadline = useMemo(() => {
    if (headingHere && friendsHereCount > 0) {
      return `You're heading here and ${friendsHereCount} ${friendsHereCount === 1 ? "friend is" : "friends are"} already nearby`;
    }
    if (headingHere) return `You're heading to ${venueName} tonight`;
    if (friendsHereCount > 0) {
      return `${friendsHereCount} ${friendsHereCount === 1 ? "friend is" : "friends are"} near this venue`;
    }
    return "Add this stop, then invite your group";
  }, [friendsHereCount, headingHere, venueName]);

  const showFeedback = useCallback((message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback(null), 2400);
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      setLoadingIntent(true);
      const userResult = await supabase.auth.getUser();
      const currentUserId = userResult.data.user?.id || null;
      if (!active) return;
      setUserId(currentUserId);

      if (!currentUserId) {
        setLoadingIntent(false);
        return;
      }

      const planResult = await supabase
        .from("safari_plans")
        .select("id")
        .eq("user_id", currentUserId)
        .eq("safari_date", localDateKey())
        .in("status", ["active", "draft"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!active) return;
      const tonightPlan = planResult.data?.id ? { id: String(planResult.data.id) } : null;
      setPlan(tonightPlan);

      if (tonightPlan) {
        const stopResult = await supabase
          .from("safari_stops")
          .select("id")
          .eq("safari_plan_id", tonightPlan.id)
          .eq("venue_id", venueId)
          .maybeSingle();
        if (active) setStopId(stopResult.data?.id ? String(stopResult.data.id) : null);
      } else {
        setStopId(null);
      }

      if (active) setLoadingIntent(false);
    })();

    return () => {
      active = false;
    };
  }, [supabase, venueId]);

  async function ensureTonightPlan() {
    if (plan) return plan;
    if (!userId) return null;

    const result = await supabase
      .from("safari_plans")
      .insert({
        user_id: userId,
        title: "Tonight on PartySafari",
        safari_date: localDateKey(),
        status: "active",
      })
      .select("id")
      .single();

    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message || "Could not create tonight's plan");
    }

    const nextPlan = { id: String(result.data.id) };
    setPlan(nextPlan);
    return nextPlan;
  }

  async function toggleHeadingHere() {
    if (!userId) {
      showFeedback("Sign in to save your meetup plan");
      return;
    }

    setSavingIntent(true);
    try {
      if (stopId) {
        const result = await supabase.from("safari_stops").delete().eq("id", stopId);
        if (result.error) throw result.error;
        setStopId(null);
        showFeedback("Removed from tonight's plan");
        return;
      }

      const tonightPlan = await ensureTonightPlan();
      if (!tonightPlan) throw new Error("Could not load tonight's plan");

      const orderResult = await supabase
        .from("safari_stops")
        .select("stop_order")
        .eq("safari_plan_id", tonightPlan.id)
        .order("stop_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (orderResult.error) throw orderResult.error;

      const nextOrder = Number(orderResult.data?.stop_order || 0) + 1;
      const insertResult = await supabase
        .from("safari_stops")
        .insert({
          safari_plan_id: tonightPlan.id,
          venue_id: venueId,
          stop_order: nextOrder,
          notes: "Heading here from Safari Radar",
        })
        .select("id")
        .single();
      if (insertResult.error || !insertResult.data?.id) {
        throw new Error(insertResult.error?.message || "Could not save meetup intent");
      }

      setStopId(String(insertResult.data.id));
      showFeedback("Added to tonight's plan");
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : "Could not update meetup plan");
    } finally {
      setSavingIntent(false);
    }
  }

  async function shareMeetup() {
    const text = headingHere
      ? `I'm heading to ${venueName} tonight. Meet me there on PartySafari.`
      : `Meet me at ${venueName} tonight on PartySafari.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Meet at ${venueName}`, text, url: venueUrl });
        showFeedback("Invite sent");
      } else {
        await navigator.clipboard.writeText(`${text} ${venueUrl}`);
        showFeedback("Meetup link copied");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      showFeedback("Could not share yet");
    }
  }

  return (
    <section className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-400/8 p-3" aria-label={`${venueName} meetup options`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fuchsia-100/70">Your crew</p>
          <p className="mt-0.5 text-xs text-white/65">{socialHeadline}</p>
        </div>
        {headingHere ? (
          <span className="shrink-0 rounded-full border border-emerald-200/30 bg-emerald-400/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-100">
            Heading here
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Venue social signals">
        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${friendsHereCount > 0 ? "border-fuchsia-200/30 bg-fuchsia-400/15 text-fuchsia-100" : "border-white/10 bg-white/5 text-white/45"}`}>
          {friendsHereCount > 0 ? `${friendsHereCount} ${friendsHereCount === 1 ? "friend" : "friends"} nearby` : "No friends nearby yet"}
        </span>
        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${headingHere ? "border-emerald-200/30 bg-emerald-400/15 text-emerald-100" : "border-white/10 bg-white/5 text-white/45"}`}>
          {headingHere ? "Saved to tonight" : "Not in your plan"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void toggleHeadingHere()}
          disabled={loadingIntent || savingIntent}
          className={`rounded-full border px-3 py-2 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-50 ${
            headingHere
              ? "border-emerald-200/35 bg-emerald-400/15 text-emerald-50 hover:bg-emerald-400/25"
              : "border-fuchsia-200/35 bg-fuchsia-400/15 text-fuchsia-50 hover:bg-fuchsia-400/25"
          }`}
        >
          {loadingIntent ? "Checking plan…" : savingIntent ? "Saving…" : headingHere ? "Change my mind" : "I'm heading here"}
        </button>
        <button
          type="button"
          onClick={() => void shareMeetup()}
          className="rounded-full border border-white/15 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/15"
        >
          Invite group
        </button>
      </div>

      {plan ? (
        <div className="mt-2 flex justify-end">
          <Link href="/safari" className="text-[11px] font-semibold text-fuchsia-100/70 transition hover:text-fuchsia-50">
            View tonight's plan →
          </Link>
        </div>
      ) : null}

      {feedback ? <p className="mt-2 text-[11px] font-medium text-fuchsia-100/80" role="status">{feedback}</p> : null}
    </section>
  );
}
