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

type ClaimRow = {
  id: string;
  verification_method: string;
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  reviewed_at: string | null;
};

type LoadState = "loading" | "ready" | "signed-out" | "not-found" | "error";
type SubmitState = "idle" | "sending" | "sent" | "error";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}

function methodLabel(value: string) {
  if (value === "official_website") return "Official website";
  if (value === "business_email") return "Business email";
  if (value === "management") return "Management / booking contact";
  if (value === "instagram") return "Instagram";
  return "Other proof";
}

export default function PerformerClaimPage() {
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [performer, setPerformer] = useState<PerformerLite | null>(null);
  const [latestClaim, setLatestClaim] = useState<ClaimRow | null>(null);
  const [alreadyOwner, setAlreadyOwner] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [verificationMethod, setVerificationMethod] = useState("instagram");
  const [verificationDetail, setVerificationDetail] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;

    let mounted = true;

    const load = async () => {
      setLoadState("loading");
      setMessage(null);

      const [{ data: performerData, error: performerError }, { data: authData }] = await Promise.all([
        supabase
          .from("performers")
          .select("id, slug, stage_name, performer_type")
          .eq("slug", slug)
          .maybeSingle(),
        supabase.auth.getUser(),
      ]);

      if (!mounted) return;

      if (performerError) {
        if (process.env.NODE_ENV === "development") {
          console.error("[performer-claim] Performer load failed:", performerError);
        }
        setLoadState("error");
        return;
      }

      if (!performerData) {
        setLoadState("not-found");
        return;
      }

      const row = performerData as PerformerLite;
      setPerformer(row);

      const user = authData.user;
      if (!user) {
        setLoadState("signed-out");
        return;
      }

      const [ownerResult, claimResult] = await Promise.all([
        supabase
          .from("performer_owners")
          .select("performer_id")
          .eq("performer_id", row.id)
          .eq("profile_id", user.id)
          .maybeSingle(),
        supabase
          .from("performer_claims")
          .select("id, verification_method, status, submitted_at, reviewed_at")
          .eq("performer_id", row.id)
          .eq("claimant_id", user.id)
          .order("submitted_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!mounted) return;

      if (ownerResult.error || claimResult.error) {
        if (process.env.NODE_ENV === "development") {
          console.error("[performer-claim] Claim state load failed:", ownerResult.error || claimResult.error);
        }
        setLoadState("error");
        return;
      }

      setAlreadyOwner(Boolean(ownerResult.data));
      setLatestClaim((claimResult.data as ClaimRow | null) ?? null);
      setLoadState("ready");
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [slug, supabase]);

  async function submitClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!performer || submitState === "sending") return;

    const detail = verificationDetail.trim();
    if (detail.length < 10) {
      setMessage("Please include enough detail for PartySafari to verify that you represent this performer.");
      setSubmitState("error");
      return;
    }

    setSubmitState("sending");
    setMessage(null);

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      setLoadState("signed-out");
      setSubmitState("idle");
      return;
    }

    const { data, error } = await supabase
      .from("performer_claims")
      .insert({
        performer_id: performer.id,
        claimant_id: user.id,
        verification_method: verificationMethod,
        verification_detail: detail.slice(0, 1200),
        status: "pending",
      })
      .select("id, verification_method, status, submitted_at, reviewed_at")
      .single();

    if (error || !data) {
      if (process.env.NODE_ENV === "development") {
        console.error("[performer-claim] Claim submit failed:", error);
      }
      setMessage(
        error?.code === "23505"
          ? "You already have a pending claim for this performer."
          : "Your claim could not be submitted right now. Please try again."
      );
      setSubmitState("error");
      return;
    }

    setLatestClaim(data as ClaimRow);
    setVerificationDetail("");
    setSubmitState("sent");
    setMessage("Claim submitted. PartySafari will review the proof before profile ownership is activated.");
  }

  if (loadState === "loading") {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-12 text-white">
        <div className="mx-auto h-96 max-w-3xl animate-pulse rounded-3xl border border-white/10 bg-white/5" />
      </main>
    );
  }

  if (loadState === "not-found" || !performer) {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-12 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/5 p-7 text-center">
          <h1 className="text-3xl font-black">Performer not found</h1>
          <Link href="/talent" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-violet-600 px-5 text-sm font-bold">
            Browse Talent
          </Link>
        </div>
      </main>
    );
  }

  if (loadState === "signed-out") {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-12 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-violet-300/20 bg-violet-500/10 p-7 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-200">Claim {performer.stage_name}</p>
          <h1 className="mt-2 text-3xl font-black">Sign in to request ownership</h1>
          <p className="mt-3 text-sm leading-6 text-white/65">
            PartySafari reviews performer claims before connecting a Talent profile to an account.
          </p>
          <Link href="/login" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-violet-600 px-5 text-sm font-bold">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-12 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-rose-400/25 bg-rose-500/10 p-6 text-rose-100">
          <p>Unable to load the claim flow right now.</p>
          <Link href={`/talent/${performer.slug}`} className="mt-4 inline-flex text-sm font-bold underline underline-offset-4">
            Back to performer
          </Link>
        </div>
      </main>
    );
  }

  if (alreadyOwner) {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-12 text-white">
        <div className="mx-auto max-w-2xl rounded-3xl border border-emerald-300/20 bg-emerald-500/10 p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Profile connected</p>
          <h1 className="mt-2 text-3xl font-black">{performer.stage_name} is yours on PartySafari</h1>
          <p className="mt-3 text-sm leading-6 text-white/65">
            Your account can manage incoming booking inquiries for this Talent profile.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/bookings" className="inline-flex min-h-11 items-center rounded-full bg-emerald-600 px-5 text-sm font-bold">
              Open Talent inbox
            </Link>
            <Link href={`/talent/${performer.slug}`} className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-5 text-sm font-bold">
              View profile
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const hasPendingClaim = latestClaim?.status === "pending";
  const wasRejected = latestClaim?.status === "rejected";

  return (
    <main className="min-h-screen bg-[#07070B] px-6 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <Link href={`/talent/${performer.slug}`} className="text-sm font-semibold text-violet-300 hover:text-white">
          ← {performer.stage_name}
        </Link>

        <section className="mt-5 rounded-3xl border border-violet-300/15 bg-[radial-gradient(circle_at_top_right,_rgba(249,115,22,0.14),_transparent_34%),linear-gradient(145deg,_#16092b,_#0b0711)] p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-200">Talent ownership</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">Claim {performer.stage_name}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">
            Send proof that you are the performer or an authorized representative. PartySafari reviews every claim before ownership and booking access are activated.
          </p>
        </section>

        {latestClaim ? (
          <section className={`mt-6 rounded-3xl border p-5 ${
            latestClaim.status === "approved"
              ? "border-emerald-300/20 bg-emerald-500/10"
              : latestClaim.status === "rejected"
                ? "border-rose-300/20 bg-rose-500/10"
                : "border-amber-300/20 bg-amber-500/10"
          }`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">Latest claim</p>
                <p className="mt-1 text-lg font-bold capitalize">{latestClaim.status}</p>
              </div>
              <span className="rounded-full border border-white/15 bg-black/15 px-3 py-1 text-xs text-white/65">
                {methodLabel(latestClaim.verification_method)}
              </span>
            </div>
            <p className="mt-3 text-sm text-white/60">Submitted {formatDate(latestClaim.submitted_at)}</p>
            {hasPendingClaim ? (
              <p className="mt-3 text-sm leading-6 text-amber-50/80">
                No action is needed right now. Your profile stays protected while PartySafari reviews the claim.
              </p>
            ) : null}
            {latestClaim.status === "approved" ? (
              <p className="mt-3 text-sm leading-6 text-emerald-50/80">
                Approved. Refresh this page if the Talent inbox link has not appeared yet.
              </p>
            ) : null}
            {wasRejected ? (
              <p className="mt-3 text-sm leading-6 text-rose-50/80">
                We could not verify the last submission. You can send stronger proof below.
              </p>
            ) : null}
          </section>
        ) : null}

        {!hasPendingClaim && latestClaim?.status !== "approved" ? (
          <form onSubmit={submitClaim} className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-2xl font-black">{wasRejected ? "Submit new proof" : "Verify your connection"}</h2>
            <p className="mt-2 text-sm leading-6 text-white/55">
              Use a public account, official site, business email context, or management contact that PartySafari can independently verify.
            </p>

            <div className="mt-6">
              <label htmlFor="verification-method" className="text-sm font-semibold text-white/80">Verification method</label>
              <select
                id="verification-method"
                value={verificationMethod}
                onChange={(event) => setVerificationMethod(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-2xl border border-white/15 bg-[#0c0911] px-3 text-white"
              >
                <option value="instagram">Instagram</option>
                <option value="official_website">Official website</option>
                <option value="business_email">Business email</option>
                <option value="management">Management / booking contact</option>
                <option value="other">Other proof</option>
              </select>
            </div>

            <div className="mt-5">
              <label htmlFor="verification-detail" className="text-sm font-semibold text-white/80">Proof details</label>
              <textarea
                id="verification-detail"
                value={verificationDetail}
                onChange={(event) => setVerificationDetail(event.target.value)}
                maxLength={1200}
                minLength={10}
                required
                rows={6}
                placeholder="Example: I am the artist behind @yourhandle. You can verify me by contacting the booking email listed in that bio, or I can reply from that account."
                className="mt-2 w-full rounded-2xl border border-white/15 bg-black/30 p-3 text-white outline-none placeholder:text-white/30 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/20"
              />
              <p className="mt-1 text-xs text-white/35">Do not include passwords, access codes, or other sensitive credentials.</p>
            </div>

            {message ? (
              <p className={`mt-4 text-sm ${submitState === "sent" ? "text-emerald-300" : "text-rose-300"}`}>{message}</p>
            ) : null}

            <button
              type="submit"
              disabled={submitState === "sending"}
              className="mt-5 min-h-11 rounded-full bg-gradient-to-r from-violet-600 to-orange-500 px-5 text-sm font-black disabled:opacity-60"
            >
              {submitState === "sending" ? "Submitting…" : "Submit claim for review"}
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
