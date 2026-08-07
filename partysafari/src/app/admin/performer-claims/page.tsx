"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";

type ClaimStatus = "pending" | "approved" | "rejected";
type StatusFilter = "pending" | "all";

type PerformerLite = {
  id: string;
  stage_name: string;
  slug: string;
  performer_type: string;
};

type ProfileLite = {
  id: string;
  username: string | null;
  display_name: string | null;
  full_name: string | null;
};

type ClaimRow = {
  id: string;
  performer_id: string;
  claimant_id: string;
  verification_method: string;
  verification_detail: string;
  status: ClaimStatus;
  submitted_at: string;
  reviewed_at: string | null;
  updated_at: string;
  performer: PerformerLite | null;
  claimant: ProfileLite | null;
};

type PageState = "loading" | "ready" | "signed-out" | "forbidden" | "error";

function formatDateTime(value: string | null) {
  if (!value) return "Not reviewed";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function methodLabel(value: string) {
  if (value === "official_website") return "Official website";
  if (value === "business_email") return "Business email";
  if (value === "management") return "Management / booking contact";
  if (value === "instagram") return "Instagram";
  return "Other proof";
}

function claimantLabel(profile: ProfileLite | null, claimantId: string) {
  const named = profile?.display_name?.trim() || profile?.full_name?.trim();
  if (named) return named;
  if (profile?.username?.trim()) return "@" + profile.username.trim();
  return claimantId.slice(0, 8) + "…";
}

function statusClasses(status: ClaimStatus) {
  if (status === "approved") return "border-emerald-300/25 bg-emerald-500/10 text-emerald-100";
  if (status === "rejected") return "border-rose-300/25 bg-rose-500/10 text-rose-100";
  return "border-amber-300/25 bg-amber-500/10 text-amber-100";
}

export default function PerformerClaimAdminPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setPageState("loading");
      setMessage(null);

      const { data: authData } = await supabase.auth.getUser();
      if (!mounted) return;

      const user = authData.user;
      if (!user) {
        setPageState("signed-out");
        return;
      }

      const { data: adminRow, error: adminError } = await supabase
        .from("app_admins")
        .select("profile_id, role")
        .eq("profile_id", user.id)
        .maybeSingle();

      if (!mounted) return;

      if (adminError) {
        if (process.env.NODE_ENV === "development") {
          console.error("[claim-admin] Admin access check failed:", adminError);
        }
        setPageState("error");
        return;
      }

      if (!adminRow) {
        setPageState("forbidden");
        return;
      }

      const { data: rawClaims, error: claimsError } = await supabase
        .from("performer_claims")
        .select(
          "id, performer_id, claimant_id, verification_method, verification_detail, status, submitted_at, reviewed_at, updated_at"
        )
        .order("submitted_at", { ascending: false })
        .limit(100);

      if (!mounted) return;

      if (claimsError) {
        if (process.env.NODE_ENV === "development") {
          console.error("[claim-admin] Claim load failed:", claimsError);
        }
        setPageState("error");
        return;
      }

      const baseClaims = (rawClaims ?? []) as Omit<ClaimRow, "performer" | "claimant">[];
      const performerIds = [...new Set(baseClaims.map((claim) => claim.performer_id))];
      const claimantIds = [...new Set(baseClaims.map((claim) => claim.claimant_id))];

      const [performerResult, profileResult] = await Promise.all([
        performerIds.length
          ? supabase
              .from("performers")
              .select("id, stage_name, slug, performer_type")
              .in("id", performerIds)
          : Promise.resolve({ data: [] as PerformerLite[], error: null }),
        claimantIds.length
          ? supabase
              .from("profiles")
              .select("id, username, display_name, full_name")
              .in("id", claimantIds)
          : Promise.resolve({ data: [] as ProfileLite[], error: null }),
      ]);

      if (!mounted) return;

      if (performerResult.error || profileResult.error) {
        if (process.env.NODE_ENV === "development") {
          console.error(
            "[claim-admin] Claim context load failed:",
            performerResult.error || profileResult.error
          );
        }
        setPageState("error");
        return;
      }

      const performers = new Map(
        ((performerResult.data ?? []) as PerformerLite[]).map((performer) => [performer.id, performer])
      );
      const profiles = new Map(
        ((profileResult.data ?? []) as ProfileLite[]).map((profile) => [profile.id, profile])
      );

      setClaims(
        baseClaims.map((claim) => ({
          ...claim,
          performer: performers.get(claim.performer_id) ?? null,
          claimant: profiles.get(claim.claimant_id) ?? null,
        }))
      );
      setPageState("ready");
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  async function reviewClaim(claim: ClaimRow, nextStatus: Exclude<ClaimStatus, "pending">) {
    if (reviewingId || claim.status !== "pending") return;

    if (
      nextStatus === "approved" &&
      !window.confirm(
        "Approve this claim and give this account ownership of " +
          (claim.performer?.stage_name || "this performer profile") +
          "?"
      )
    ) {
      return;
    }

    setReviewingId(claim.id);
    setMessage(null);

    const { data, error } = await supabase
      .from("performer_claims")
      .update({ status: nextStatus })
      .eq("id", claim.id)
      .eq("status", "pending")
      .select("id, status, reviewed_at, updated_at")
      .maybeSingle();

    if (error || !data) {
      if (process.env.NODE_ENV === "development") {
        console.error("[claim-admin] Review failed:", error);
      }
      setMessage(
        error
          ? "The claim could not be reviewed. Your admin session may have expired."
          : "That claim is no longer pending. Refresh before reviewing it again."
      );
      setReviewingId(null);
      return;
    }

    setClaims((current) =>
      current.map((item) =>
        item.id === claim.id
          ? {
              ...item,
              status: data.status as ClaimStatus,
              reviewed_at: data.reviewed_at,
              updated_at: data.updated_at,
            }
          : item
      )
    );
    setMessage(
      nextStatus === "approved"
        ? "Claim approved. Performer ownership and booking-inbox access are now active."
        : "Claim rejected. No performer ownership was granted."
    );
    setReviewingId(null);
  }

  if (pageState === "loading") {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-10 text-white">
        <div className="mx-auto h-96 max-w-5xl animate-pulse rounded-3xl border border-white/10 bg-white/5" />
      </main>
    );
  }

  if (pageState === "signed-out") {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-12 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-violet-300/20 bg-violet-500/10 p-7 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-200">PartySafari admin</p>
          <h1 className="mt-2 text-3xl font-black">Sign in to review claims</h1>
          <Link href="/login" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-violet-600 px-5 text-sm font-bold">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  if (pageState === "forbidden") {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-12 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-rose-300/20 bg-rose-500/10 p-7 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-200">Restricted</p>
          <h1 className="mt-2 text-3xl font-black">Admin access required</h1>
          <p className="mt-3 text-sm leading-6 text-white/60">
            This account does not have PartySafari claim-review permission.
          </p>
          <Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-full border border-white/15 px-5 text-sm font-bold">
            Back to PartySafari
          </Link>
        </div>
      </main>
    );
  }

  if (pageState === "error") {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-12 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-rose-300/20 bg-rose-500/10 p-7">
          <h1 className="text-2xl font-black">Claim review is unavailable</h1>
          <p className="mt-3 text-sm text-white/65">Please refresh and try again.</p>
        </div>
      </main>
    );
  }

  const pendingCount = claims.filter((claim) => claim.status === "pending").length;
  const approvedCount = claims.filter((claim) => claim.status === "approved").length;
  const rejectedCount = claims.filter((claim) => claim.status === "rejected").length;
  const visibleClaims = filter === "pending" ? claims.filter((claim) => claim.status === "pending") : claims;

  return (
    <main className="min-h-screen bg-[#07070B] px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-5xl">
        <section className="rounded-3xl border border-violet-300/15 bg-[radial-gradient(circle_at_top_right,_rgba(249,115,22,0.16),_transparent_32%),linear-gradient(145deg,_#16092b,_#0b0711)] p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-200">PartySafari admin</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black sm:text-4xl">Performer claim review</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
                Verify the submitted proof before giving an account control of a Talent profile and access to its booking inbox.
              </p>
            </div>
            <Link href="/talent" className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-sm font-bold text-white/80">
              View Talent
            </Link>
          </div>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-amber-300/15 bg-amber-500/[0.07] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/75">Pending</p>
            <p className="mt-1 text-3xl font-black">{pendingCount}</p>
          </div>
          <div className="rounded-2xl border border-emerald-300/15 bg-emerald-500/[0.07] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/75">Approved</p>
            <p className="mt-1 text-3xl font-black">{approvedCount}</p>
          </div>
          <div className="rounded-2xl border border-rose-300/15 bg-rose-500/[0.07] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-200/75">Rejected</p>
            <p className="mt-1 text-3xl font-black">{rejectedCount}</p>
          </div>
        </section>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-full border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => setFilter("pending")}
              aria-pressed={filter === "pending"}
              className={"min-h-10 rounded-full px-4 text-sm font-bold transition " + (filter === "pending" ? "bg-violet-600 text-white" : "text-white/55 hover:text-white")}
            >
              Pending
            </button>
            <button
              type="button"
              onClick={() => setFilter("all")}
              aria-pressed={filter === "all"}
              className={"min-h-10 rounded-full px-4 text-sm font-bold transition " + (filter === "all" ? "bg-violet-600 text-white" : "text-white/55 hover:text-white")}
            >
              All claims
            </button>
          </div>
          {message ? <p aria-live="polite" className="text-sm text-violet-200">{message}</p> : null}
        </div>

        <section className="mt-5 space-y-4">
          {visibleClaims.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
              <p className="text-2xl font-black">{filter === "pending" ? "No claims waiting" : "No performer claims yet"}</p>
              <p className="mt-2 text-sm text-white/50">
                {filter === "pending"
                  ? "New artist verification requests will appear here automatically."
                  : "Claim history will appear here after artists begin submitting verification."}
              </p>
            </div>
          ) : (
            visibleClaims.map((claim) => (
              <article key={claim.id} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
                      {claim.performer?.performer_type || "performer"} claim
                    </p>
                    <h2 className="mt-1 text-2xl font-black">{claim.performer?.stage_name || "Unknown performer"}</h2>
                    <p className="mt-1 text-sm text-white/55">
                      Submitted by {claimantLabel(claim.claimant, claim.claimant_id)} · {formatDateTime(claim.submitted_at)}
                    </p>
                  </div>
                  <span className={"rounded-full border px-3 py-1 text-xs font-bold capitalize " + statusClasses(claim.status)}>
                    {claim.status}
                  </span>
                </div>

                <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Verification proof</p>
                    <span className="text-xs font-semibold text-violet-200">{methodLabel(claim.verification_method)}</span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-white/75">{claim.verification_detail}</p>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {claim.performer ? (
                    <Link
                      href={"/talent/" + claim.performer.slug}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-sm font-bold text-white/75 hover:text-white"
                    >
                      Open performer profile
                    </Link>
                  ) : null}

                  {claim.status === "pending" ? (
                    <>
                      <button
                        type="button"
                        disabled={reviewingId !== null}
                        onClick={() => void reviewClaim(claim, "approved")}
                        className="min-h-11 rounded-full bg-emerald-600 px-4 text-sm font-black text-white transition hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {reviewingId === claim.id ? "Reviewing…" : "Approve & activate"}
                      </button>
                      <button
                        type="button"
                        disabled={reviewingId !== null}
                        onClick={() => void reviewClaim(claim, "rejected")}
                        className="min-h-11 rounded-full border border-rose-300/30 bg-rose-500/10 px-4 text-sm font-bold text-rose-100 transition hover:bg-rose-500/20 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </>
                  ) : (
                    <p className="text-xs text-white/40">Reviewed {formatDateTime(claim.reviewed_at)}</p>
                  )}
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
