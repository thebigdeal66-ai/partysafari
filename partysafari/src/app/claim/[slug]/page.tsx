"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";

type VenueClaimStatus = "pending" | "verified" | "rejected" | "cancelled";

type VenueClaim = {
  id: string;
  status: VenueClaimStatus;
  verification_method: string;
};

type ClaimVenue = {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  website_url: string | null;
  verified: boolean;
  owner_id: string | null;
};

function readClaim(value: unknown): VenueClaim | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const row = candidate as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.status !== "string") {
    return null;
  }

  return {
    id: row.id,
    status: row.status as VenueClaimStatus,
    verification_method:
      typeof row.verification_method === "string" ? row.verification_method : "manual",
  };
}

export default function ClaimVenuePage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug || "";
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [venue, setVenue] = useState<ClaimVenue | null>(null);
  const [claim, setClaim] = useState<VenueClaim | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<"business_email" | "manual" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadClaimPage = useCallback(async () => {
    if (!slug) {
      return;
    }

    setLoading(true);
    setNotice(null);

    const venueResult = await supabase
      .from("venues")
      .select("id, slug, name, address, city, state, website_url, verified, owner_id")
      .eq("slug", slug)
      .maybeSingle();

    if (venueResult.error || !venueResult.data) {
      setVenue(null);
      setLoading(false);
      return;
    }

    const venueRow = venueResult.data as ClaimVenue;
    setVenue(venueRow);

    const { data: userData } = await supabase.auth.getUser();
    const currentUser = userData?.user || null;
    setUserId(currentUser?.id || null);
    setUserEmail(currentUser?.email || null);

    if (!currentUser?.id) {
      setClaim(null);
      setLoading(false);
      return;
    }

    const claimResult = await supabase
      .from("venue_claims")
      .select("id, status, verification_method")
      .eq("venue_id", venueRow.id)
      .eq("claimant_id", currentUser.id)
      .in("status", ["pending", "verified"])
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setClaim(claimResult.error ? null : readClaim(claimResult.data));
    setLoading(false);
  }, [slug, supabase]);

  useEffect(() => {
    void loadClaimPage();
  }, [loadClaimPage]);

  const submitClaim = useCallback(
    async (method: "business_email" | "manual") => {
      if (!venue?.id || !userId) {
        return;
      }

      setSubmitting(method);
      setNotice(null);

      const { data, error } = await supabase.rpc("submit_venue_claim", {
        p_venue_id: venue.id,
        p_verification_method: method,
      });

      if (error) {
        setNotice(error.message || "We could not submit this claim.");
        setSubmitting(null);
        return;
      }

      const nextClaim = readClaim(data);
      setClaim(nextClaim);

      if (nextClaim?.status === "verified") {
        setVenue((current) =>
          current ? { ...current, verified: true, owner_id: userId } : current
        );
        setNotice("Verified. Your venue dashboard is ready.");
      } else {
        setNotice("Claim received. We will review it online and keep your place in the queue.");
      }

      setSubmitting(null);
    },
    [supabase, userId, venue?.id]
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-[#07070B] px-5 py-12 text-white">
        <div className="mx-auto max-w-xl animate-pulse rounded-3xl border border-white/10 bg-white/5 p-7 text-white/65">
          Loading venue claim…
        </div>
      </main>
    );
  }

  if (!venue) {
    return (
      <main className="min-h-screen bg-[#07070B] px-5 py-12 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/5 p-7">
          <h1 className="text-3xl font-semibold">Venue not found</h1>
          <p className="mt-3 text-white/70">This listing is not available to claim yet.</p>
          <Link href="/radar" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-violet-600 px-5 text-sm font-semibold">
            Back to PartySafari
          </Link>
        </div>
      </main>
    );
  }

  const isOwner = Boolean(userId && venue.owner_id === userId);
  const isVerified = isOwner || claim?.status === "verified";
  const location = [venue.address, venue.city, venue.state].filter(Boolean).join(", ");
  const loginTarget = `/login?next=${encodeURIComponent(`/claim/${venue.slug}`)}`;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.22),_transparent_35%),#07070B] px-5 py-10 text-white">
      <div className="mx-auto max-w-xl space-y-5">
        <Link href={`/venues/${venue.slug}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-violet-200">
          ← Back to venue
        </Link>

        <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${venue.verified ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-violet-400/30 bg-violet-500/10 text-violet-200"}`}>
              {venue.verified ? "Verified Venue ✓" : "Listed Venue"}
            </span>
          </div>

          <h1 className="mt-4 text-4xl font-semibold tracking-tight">Claim {venue.name}</h1>
          <p className="mt-2 text-white/65">{location || "Venue location on PartySafari"}</p>

          {isVerified ? (
            <div className="mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-5">
              <p className="font-semibold text-emerald-100">Ownership verified</p>
              <p className="mt-1 text-sm text-emerald-50/75">You can now manage this venue, events, specials, photos, and tonight&apos;s details.</p>
              <Link href="/venue-owner" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-emerald-500 px-5 text-sm font-semibold text-black">
                Open Venue Dashboard
              </Link>
            </div>
          ) : claim?.status === "pending" ? (
            <div className="mt-6 rounded-2xl border border-amber-300/25 bg-amber-400/10 p-5">
              <p className="font-semibold text-amber-100">Claim pending</p>
              <p className="mt-1 text-sm text-amber-50/70">Your request is saved. No in-person meeting is required; it can be reviewed online.</p>
            </div>
          ) : !userId ? (
            <div className="mt-6 rounded-2xl border border-violet-400/25 bg-violet-500/10 p-5">
              <p className="font-semibold text-violet-100">Sign in to claim this venue</p>
              <p className="mt-1 text-sm text-white/70">Use your business email when possible for the fastest verification.</p>
              <Link href={loginTarget} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-violet-600 px-5 text-sm font-semibold text-white">
                Sign In to Continue
              </Link>
            </div>
          ) : venue.owner_id ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
              This venue has already been claimed. Contact PartySafari if the business has changed ownership.
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-violet-400/25 bg-violet-500/10 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">Fastest option</p>
                <h2 className="mt-2 text-xl font-semibold">Verify with business email</h2>
                <p className="mt-2 text-sm text-white/70">
                  Signed in as {userEmail || "your PartySafari account"}. If this confirmed email matches {venue.website_url || "the venue's official website"} domain, verification is automatic.
                </p>
                <button
                  type="button"
                  disabled={Boolean(submitting)}
                  onClick={() => void submitClaim("business_email")}
                  className="mt-4 min-h-11 w-full rounded-full bg-violet-600 px-5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
                >
                  {submitting === "business_email" ? "Checking business email…" : "Verify & Claim Venue"}
                </button>
              </div>

              <button
                type="button"
                disabled={Boolean(submitting)}
                onClick={() => void submitClaim("manual")}
                className="min-h-11 w-full rounded-full border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
              >
                {submitting === "manual" ? "Submitting…" : "Request Online Review Instead"}
              </button>
            </div>
          )}

          {notice ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80" aria-live="polite">
              {notice}
            </div>
          ) : null}
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold">How verification works</h2>
          <ol className="mt-4 space-y-3 text-sm text-white/70">
            <li><span className="font-semibold text-white">1.</span> Sign in with your PartySafari account.</li>
            <li><span className="font-semibold text-white">2.</span> We compare a confirmed business email with the venue&apos;s official website.</li>
            <li><span className="font-semibold text-white">3.</span> Matching claims unlock the dashboard immediately; other claims enter online review.</li>
          </ol>
        </section>
      </div>
    </main>
  );
}
