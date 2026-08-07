"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";

type PerformerLite = {
  slug: string | null;
  stage_name: string | null;
  performer_type: string | null;
};

type BookingRow = {
  id: string;
  performer_id: string;
  requester_id: string;
  event_date: string | null;
  event_type: string | null;
  location: string | null;
  budget_range: string | null;
  status: string;
  created_at: string;
  last_message_at: string | null;
  performers: PerformerLite | PerformerLite[] | null;
};

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatDate(value: string | null) {
  if (!value) return "Date TBD";
  const date = new Date(value + "T12:00:00");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function statusClass(status: string) {
  if (status === "accepted") return "border-emerald-400/25 bg-emerald-500/10 text-emerald-200";
  if (status === "declined") return "border-rose-400/25 bg-rose-500/10 text-rose-200";
  if (status === "contacted") return "border-sky-400/25 bg-sky-500/10 text-sky-200";
  return "border-amber-400/25 bg-amber-500/10 text-amber-100";
}

function BookingCard({ booking, direction }: { booking: BookingRow; direction: "sent" | "received" }) {
  const performer = firstOf(booking.performers);
  return (
    <Link
      href={`/bookings/${booking.id}`}
      className="block rounded-3xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-violet-300/30 hover:bg-white/[0.07]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">
            {direction === "received" ? "Incoming inquiry" : "Your inquiry"}
          </p>
          <h3 className="mt-2 text-xl font-bold text-white">{performer?.stage_name || "PartySafari Talent"}</h3>
          <p className="mt-1 text-sm text-white/55">
            {booking.event_type || "Event"} · {formatDate(booking.event_date)}
            {booking.location ? ` · ${booking.location}` : ""}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold capitalize ${statusClass(booking.status)}`}>
          {booking.status}
        </span>
      </div>
      {booking.budget_range ? <p className="mt-4 text-sm text-white/65">Budget: {booking.budget_range}</p> : null}
      <p className="mt-4 text-sm font-semibold text-violet-200">Open booking →</p>
    </Link>
  );
}

export default function BookingsPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [ownedPerformerIds, setOwnedPerformerIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      const { data: authData } = await supabase.auth.getUser();
      if (!mounted) return;

      const user = authData.user;
      if (!user) {
        setSignedOut(true);
        setLoading(false);
        return;
      }

      setUserId(user.id);
      const [ownerResult, bookingResult] = await Promise.all([
        supabase.from("performer_owners").select("performer_id").eq("profile_id", user.id),
        supabase
          .from("booking_requests")
          .select(`
            id,
            performer_id,
            requester_id,
            event_date,
            event_type,
            location,
            budget_range,
            status,
            created_at,
            last_message_at,
            performers:performer_id (slug, stage_name, performer_type)
          `)
          .order("created_at", { ascending: false }),
      ]);

      if (!mounted) return;

      if (ownerResult.error || bookingResult.error) {
        if (process.env.NODE_ENV === "development") {
          console.error("[bookings] Failed to load:", ownerResult.error || bookingResult.error);
        }
        setError("Unable to load bookings right now.");
        setLoading(false);
        return;
      }

      setOwnedPerformerIds(new Set((ownerResult.data ?? []).map((row: { performer_id: string }) => row.performer_id)));
      setBookings((bookingResult.data ?? []) as BookingRow[]);
      setLoading(false);
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [supabase]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#07070B] px-5 py-10 text-white">
        <div className="mx-auto h-80 max-w-5xl animate-pulse rounded-3xl border border-white/10 bg-white/5" />
      </main>
    );
  }

  if (signedOut) {
    return (
      <main className="min-h-screen bg-[#07070B] px-5 py-12 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-violet-300/20 bg-violet-500/10 p-7 text-center">
          <h1 className="text-3xl font-black">Your bookings live here</h1>
          <p className="mt-3 text-sm leading-6 text-white/65">Sign in to see inquiries you sent and, for claimed Talent profiles, incoming booking requests.</p>
          <Link href="/login" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-violet-600 px-5 text-sm font-bold">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-[#07070B] px-5 py-12 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-rose-400/25 bg-rose-500/10 p-6 text-rose-100">{error}</div>
      </main>
    );
  }

  const sent = bookings.filter((booking) => booking.requester_id === userId);
  const received = bookings.filter((booking) => ownedPerformerIds.has(booking.performer_id));

  return (
    <main className="min-h-screen bg-[#07070B] px-5 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-3xl border border-violet-300/15 bg-[radial-gradient(circle_at_top_right,_rgba(249,115,22,0.14),_transparent_34%),linear-gradient(145deg,_#16092b,_#0b0711)] p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-200">PartySafari Bookings</p>
          <h1 className="mt-2 text-4xl font-black">Booking hub</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">
            Keep every Talent inquiry, response, and booking decision attached to one private PartySafari thread.
          </p>
        </div>

        {ownedPerformerIds.size > 0 ? (
          <section className="mt-9">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-200">Talent inbox</p>
              <h2 className="mt-1 text-2xl font-black">Incoming inquiries</h2>
            </div>
            {received.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {received.map((booking) => <BookingCard key={booking.id} booking={booking} direction="received" />)}
              </div>
            ) : (
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-sm text-white/60">
                No booking inquiries have arrived for your claimed Talent profile yet.
              </div>
            )}
          </section>
        ) : (
          <section className="mt-9 rounded-3xl border border-orange-300/15 bg-orange-500/[0.06] p-6">
            <p className="text-sm font-bold text-orange-100">Talent inbox</p>
            <p className="mt-2 text-sm leading-6 text-white/60">
              Incoming booking management activates automatically when a Talent profile is connected to your account.
            </p>
          </section>
        )}

        <section className="mt-9">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Organizer view</p>
            <h2 className="mt-1 text-2xl font-black">Your booking inquiries</h2>
          </div>
          {sent.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {sent.map((booking) => <BookingCard key={booking.id} booking={booking} direction="sent" />)}
            </div>
          ) : (
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <p className="text-sm text-white/60">You have not sent a Talent booking inquiry yet.</p>
              <Link href="/talent" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-violet-600 px-5 text-sm font-bold">
                Browse Talent
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
