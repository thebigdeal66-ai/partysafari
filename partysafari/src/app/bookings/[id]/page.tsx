"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
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
  message: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_ok: boolean;
  status: string;
  created_at: string;
  performers: PerformerLite | PerformerLite[] | null;
};

type BookingMessage = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatDate(value: string | null) {
  if (!value) return "Date TBD";
  const date = new Date(value + "T12:00:00");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function BookingThreadPage() {
  const params = useParams<{ id: string }>();
  const bookingId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [booking, setBooking] = useState<BookingRow | null>(null);
  const [messages, setMessages] = useState<BookingMessage[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [isPerformerOwner, setIsPerformerOwner] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingId) return;
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

      const { data: bookingData, error: bookingError } = await supabase
        .from("booking_requests")
        .select(`
          id,
          performer_id,
          requester_id,
          event_date,
          event_type,
          location,
          budget_range,
          message,
          contact_email,
          contact_phone,
          contact_ok,
          status,
          created_at,
          performers:performer_id (slug, stage_name, performer_type)
        `)
        .eq("id", bookingId)
        .maybeSingle();

      if (!mounted) return;

      if (bookingError || !bookingData) {
        if (process.env.NODE_ENV === "development" && bookingError) {
          console.error("[booking-thread] Booking load failed:", bookingError);
        }
        setError("This booking is unavailable or you do not have access to it.");
        setLoading(false);
        return;
      }

      const row = bookingData as BookingRow;
      const [ownerResult, messageResult] = await Promise.all([
        supabase
          .from("performer_owners")
          .select("performer_id")
          .eq("performer_id", row.performer_id)
          .eq("profile_id", user.id)
          .maybeSingle(),
        supabase
          .from("booking_messages")
          .select("id, sender_id, body, created_at")
          .eq("booking_request_id", bookingId)
          .order("created_at", { ascending: true }),
      ]);

      if (!mounted) return;

      if (messageResult.error) {
        if (process.env.NODE_ENV === "development") {
          console.error("[booking-thread] Message load failed:", messageResult.error);
        }
        setError("The booking loaded, but its private messages are unavailable right now.");
        setLoading(false);
        return;
      }

      setBooking(row);
      setIsPerformerOwner(Boolean(ownerResult.data) && !ownerResult.error);
      setMessages((messageResult.data ?? []) as BookingMessage[]);
      setLoading(false);
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [bookingId, supabase]);

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bookingId || !userId || !reply.trim() || sending) return;

    setSending(true);
    const body = reply.trim().slice(0, 2000);
    const { data, error: insertError } = await supabase
      .from("booking_messages")
      .insert({ booking_request_id: bookingId, sender_id: userId, body })
      .select("id, sender_id, body, created_at")
      .single();

    if (insertError || !data) {
      if (process.env.NODE_ENV === "development") {
        console.error("[booking-thread] Message send failed:", insertError);
      }
      setError("Your message could not be sent. Please try again.");
      setSending(false);
      return;
    }

    setMessages((current) => [...current, data as BookingMessage]);
    setReply("");
    setError(null);
    setSending(false);
  }

  async function updateStatus(nextStatus: "contacted" | "accepted" | "declined") {
    if (!bookingId || !isPerformerOwner || updatingStatus) return;

    setUpdatingStatus(nextStatus);
    const { data, error: updateError } = await supabase
      .from("booking_requests")
      .update({ status: nextStatus })
      .eq("id", bookingId)
      .select("id, status")
      .maybeSingle();

    if (updateError || !data) {
      if (process.env.NODE_ENV === "development") {
        console.error("[booking-thread] Status update failed:", updateError);
      }
      setError("The booking status could not be updated.");
      setUpdatingStatus(null);
      return;
    }

    setBooking((current) => current ? { ...current, status: data.status } : current);
    setError(null);
    setUpdatingStatus(null);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#07070B] px-5 py-10 text-white">
        <div className="mx-auto h-96 max-w-4xl animate-pulse rounded-3xl border border-white/10 bg-white/5" />
      </main>
    );
  }

  if (signedOut) {
    return (
      <main className="min-h-screen bg-[#07070B] px-5 py-12 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-violet-300/20 bg-violet-500/10 p-7 text-center">
          <h1 className="text-3xl font-black">Sign in to view this booking</h1>
          <Link href="/login" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-violet-600 px-5 text-sm font-bold">Sign in</Link>
        </div>
      </main>
    );
  }

  if (!booking) {
    return (
      <main className="min-h-screen bg-[#07070B] px-5 py-12 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-rose-400/25 bg-rose-500/10 p-6 text-rose-100">
          <p>{error || "Booking not found."}</p>
          <Link href="/bookings" className="mt-4 inline-flex text-sm font-bold underline underline-offset-4">Back to bookings</Link>
        </div>
      </main>
    );
  }

  const performer = firstOf(booking.performers);
  const requesterView = booking.requester_id === userId;

  return (
    <main className="min-h-screen bg-[#07070B] px-5 py-10 text-white">
      <div className="mx-auto max-w-4xl">
        <Link href="/bookings" className="text-sm font-semibold text-violet-300 hover:text-white">← Booking hub</Link>

        <section className="mt-5 rounded-3xl border border-violet-300/15 bg-[radial-gradient(circle_at_top_right,_rgba(249,115,22,0.13),_transparent_34%),linear-gradient(145deg,_#16092b,_#0b0711)] p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-200">
                {isPerformerOwner && !requesterView ? "Incoming booking" : "Talent booking"}
              </p>
              <h1 className="mt-2 text-3xl font-black sm:text-4xl">{performer?.stage_name || "PartySafari Talent"}</h1>
              <p className="mt-2 text-sm text-white/60">
                {booking.event_type || "Event"} · {formatDate(booking.event_date)}
                {booking.location ? ` · ${booking.location}` : ""}
              </p>
            </div>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-bold capitalize text-white/80">{booking.status}</span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/40">Budget</p>
              <p className="mt-1 font-semibold">{booking.budget_range || "Not specified"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/40">Original inquiry</p>
              <p className="mt-1 text-sm leading-6 text-white/75">{booking.message || "No message provided."}</p>
            </div>
          </div>

          {isPerformerOwner ? (
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" disabled={Boolean(updatingStatus)} onClick={() => void updateStatus("accepted")} className="min-h-11 rounded-full bg-emerald-600 px-4 text-sm font-bold disabled:opacity-60">
                Accept
              </button>
              <button type="button" disabled={Boolean(updatingStatus)} onClick={() => void updateStatus("contacted")} className="min-h-11 rounded-full border border-sky-300/30 bg-sky-500/10 px-4 text-sm font-bold text-sky-100 disabled:opacity-60">
                Mark contacted
              </button>
              <button type="button" disabled={Boolean(updatingStatus)} onClick={() => void updateStatus("declined")} className="min-h-11 rounded-full border border-rose-300/30 bg-rose-500/10 px-4 text-sm font-bold text-rose-100 disabled:opacity-60">
                Decline
              </button>
            </div>
          ) : null}

          {isPerformerOwner && booking.contact_ok && (booking.contact_email || booking.contact_phone) ? (
            <div className="mt-5 rounded-2xl border border-emerald-300/15 bg-emerald-500/[0.07] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">Contact permission granted</p>
              <div className="mt-2 space-y-1 text-sm text-white/70">
                {booking.contact_email ? <p>{booking.contact_email}</p> : null}
                {booking.contact_phone ? <p>{booking.contact_phone}</p> : null}
              </div>
            </div>
          ) : null}
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Private thread</p>
              <h2 className="mt-1 text-2xl font-black">Booking messages</h2>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {messages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 p-5 text-sm text-white/50">
                No replies yet. Send the first message below.
              </div>
            ) : (
              messages.map((item) => {
                const mine = item.sender_id === userId;
                return (
                  <article key={item.id} className={`max-w-[85%] rounded-2xl px-4 py-3 ${mine ? "ml-auto bg-violet-600/80" : "bg-white/10"}`}>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-white">{item.body}</p>
                    <p className="mt-1 text-[11px] text-white/50">{formatTimestamp(item.created_at)}</p>
                  </article>
                );
              })
            )}
          </div>

          <form onSubmit={sendReply} className="mt-5">
            <label htmlFor="booking-reply" className="text-sm font-semibold text-white/80">Reply</label>
            <textarea
              id="booking-reply"
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="Write a message about this booking…"
              className="mt-2 w-full rounded-2xl border border-white/15 bg-black/30 p-3 text-white placeholder:text-white/30"
            />
            {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
            <button
              type="submit"
              disabled={sending || !reply.trim()}
              className="mt-3 min-h-11 rounded-full bg-gradient-to-r from-violet-600 to-orange-500 px-5 text-sm font-black disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send message"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
