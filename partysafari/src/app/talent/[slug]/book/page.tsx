"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabaseClient";

type PerformerLite = {
  id: string;
  slug: string;
  stage_name: string;
  performer_type: string;
};

type SubmitState = "idle" | "sending" | "sent" | "signin" | "error";

export default function PerformerBookingPage() {
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [performer, setPerformer] = useState<PerformerLite | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [eventDate, setEventDate] = useState("");
  const [eventType, setEventType] = useState("");
  const [location, setLocation] = useState("");
  const [budgetRange, setBudgetRange] = useState("");
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactOk, setContactOk] = useState(false);
  const [status, setStatus] = useState<SubmitState>("idle");

  useEffect(() => {
    if (!slug) return;
    let mounted = true;

    const load = async () => {
      setProfileLoading(true);
      setProfileError(null);

      const [{ data: performerData, error }, { data: authData }] = await Promise.all([
        supabase
          .from("performers")
          .select("id, slug, stage_name, performer_type")
          .eq("slug", slug)
          .maybeSingle(),
        supabase.auth.getUser(),
      ]);

      if (!mounted) return;

      if (error || !performerData) {
        setProfileError(error ? "Unable to load this performer right now." : "Performer not found.");
        setProfileLoading(false);
        return;
      }

      setPerformer(performerData as PerformerLite);
      if (authData.user?.email) setContactEmail(authData.user.email);
      setProfileLoading(false);
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [slug, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!performer || status === "sending") return;

    setStatus("sending");

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      setStatus("signin");
      return;
    }

    if (!eventType.trim() || !eventDate || !location.trim() || !message.trim()) {
      setStatus("error");
      return;
    }

    const { error } = await supabase.from("booking_requests").insert({
      performer_id: performer.id,
      requester_id: user.id,
      event_date: eventDate,
      event_type: eventType.trim().slice(0, 120),
      location: location.trim().slice(0, 180),
      budget_range: budgetRange.trim() ? budgetRange.trim().slice(0, 80) : null,
      message: message.trim().slice(0, 1500),
      contact_email: contactEmail.trim() ? contactEmail.trim().slice(0, 254) : user.email ?? null,
      contact_phone: contactPhone.trim() ? contactPhone.trim().slice(0, 40) : null,
      contact_ok: contactOk,
      status: "pending",
    });

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[performer-booking] Insert failed:", error);
      }
      setStatus("error");
      return;
    }

    setStatus("sent");
  }

  if (profileLoading) {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-12 text-white">
        <div className="mx-auto h-80 max-w-2xl animate-pulse rounded-3xl border border-white/10 bg-white/5" />
      </main>
    );
  }

  if (profileError || !performer) {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-12 text-white">
        <div className="mx-auto max-w-2xl rounded-3xl border border-rose-400/25 bg-rose-500/10 p-7">
          <p className="text-rose-100">{profileError || "Performer not found."}</p>
          <Link href="/talent" className="mt-5 inline-flex text-sm font-semibold underline underline-offset-4">
            Back to Talent
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07070B] px-5 py-10 text-white">
      <div className="mx-auto max-w-2xl">
        <Link href={`/talent/${performer.slug}`} className="text-sm font-semibold text-violet-300 hover:text-white">
          ← {performer.stage_name}
        </Link>

        <div className="mt-5 rounded-3xl border border-violet-300/15 bg-[radial-gradient(circle_at_top_right,_rgba(249,115,22,0.16),_transparent_35%),linear-gradient(145deg,_#16092b,_#0b0711)] p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-200">Booking inquiry</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">Book {performer.stage_name}</h1>
          <p className="mt-3 text-sm leading-6 text-white/65">
            Send the event details through PartySafari. Your inquiry will stay attached to this performer.
          </p>

          {status === "sent" ? (
            <div className="mt-8 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-6">
              <p className="text-lg font-bold text-emerald-200">Booking inquiry sent</p>
              <p className="mt-2 text-sm leading-6 text-white/70">
                Your request for {performer.stage_name} is saved in PartySafari.
              </p>
              <Link
                href={`/talent/${performer.slug}`}
                className="mt-5 inline-flex min-h-11 items-center rounded-full bg-violet-600 px-5 text-sm font-bold"
              >
                Back to performer
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold text-white/80">Event type *</span>
                  <input
                    required
                    value={eventType}
                    onChange={(event) => setEventType(event.target.value)}
                    maxLength={120}
                    placeholder="Birthday, club night, festival…"
                    className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-white placeholder:text-white/30"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-white/80">Event date *</span>
                  <input
                    required
                    type="date"
                    value={eventDate}
                    onChange={(event) => setEventDate(event.target.value)}
                    className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-white"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-semibold text-white/80">Location *</span>
                <input
                  required
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  maxLength={180}
                  placeholder="Venue or city"
                  className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-white placeholder:text-white/30"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-white/80">Budget range</span>
                <input
                  value={budgetRange}
                  onChange={(event) => setBudgetRange(event.target.value)}
                  maxLength={80}
                  placeholder="Example: $1,000–$1,500"
                  className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-white placeholder:text-white/30"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-white/80">Message *</span>
                <textarea
                  required
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={1500}
                  rows={6}
                  placeholder="Tell them about the event, timing, set length, and anything else they should know."
                  className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 p-3 text-white placeholder:text-white/30"
                />
              </label>

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold text-white/80">Contact email</span>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(event) => setContactEmail(event.target.value)}
                    maxLength={254}
                    className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-white"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-white/80">Contact phone</span>
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(event) => setContactPhone(event.target.value)}
                    maxLength={40}
                    className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-white"
                  />
                </label>
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
                <input
                  type="checkbox"
                  checked={contactOk}
                  onChange={(event) => setContactOk(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-violet-500"
                />
                <span>Allow this performer to use the contact details above to follow up about this booking.</span>
              </label>

              {status === "signin" ? (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                  Please <Link href="/login" className="font-bold underline underline-offset-4">sign in</Link> to send this booking inquiry.
                </div>
              ) : null}

              {status === "error" ? (
                <p className="text-sm text-rose-300">
                  We could not send the booking inquiry. Check the required fields and try again.
                </p>
              ) : null}

              <button
                type="submit"
                disabled={status === "sending"}
                className="min-h-12 w-full rounded-full bg-gradient-to-r from-violet-600 to-orange-500 px-6 font-black text-white transition hover:brightness-110 disabled:opacity-60"
              >
                {status === "sending" ? "Sending…" : "Send booking inquiry"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
