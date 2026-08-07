"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";

const reportReasons = [
  ["harassment", "Harassment or threats"],
  ["impersonation", "Impersonation"],
  ["spam", "Spam or scam"],
  ["unsafe", "Unsafe behavior"],
  ["illegal", "Illegal activity"],
  ["other", "Other"],
] as const;

export default function ProfileSafetyActions({ targetUserId }: { targetUserId: string }) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState<(typeof reportReasons)[number][0]>("harassment");
  const [details, setDetails] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id ?? null;
      if (!mounted) return;
      setCurrentUserId(userId);

      if (!userId || userId === targetUserId) return;
      const { data: block } = await supabase
        .from("profile_blocks")
        .select("blocked_id")
        .eq("blocker_id", userId)
        .eq("blocked_id", targetUserId)
        .maybeSingle();

      if (mounted) setIsBlocked(Boolean(block));
    })();

    return () => {
      mounted = false;
    };
  }, [supabase, targetUserId]);

  async function handleBlockToggle() {
    if (!currentUserId || isBusy) return;

    if (!isBlocked && !window.confirm("Block this profile? Existing follow/friend connections will be removed and new contact will be prevented.")) {
      return;
    }

    setIsBusy(true);
    setNotice(null);
    const request = isBlocked
      ? supabase.from("profile_blocks").delete().eq("blocker_id", currentUserId).eq("blocked_id", targetUserId)
      : supabase.from("profile_blocks").insert({ blocker_id: currentUserId, blocked_id: targetUserId });

    const { error } = await request;
    if (error) {
      setNotice("Could not update the block right now.");
    } else {
      setIsBlocked(!isBlocked);
      setNotice(isBlocked ? "Profile unblocked." : "Profile blocked. New contact is now prevented.");
    }
    setIsBusy(false);
  }

  async function handleReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUserId || isBusy) return;

    setIsBusy(true);
    setNotice(null);
    const { error } = await supabase.from("content_reports").insert({
      reporter_id: currentUserId,
      target_type: "profile",
      target_id: targetUserId,
      reason,
      details: details.trim().slice(0, 1000) || null,
    });

    if (error) {
      setNotice("Could not submit the report. Please try again.");
    } else {
      setReportOpen(false);
      setDetails("");
      setNotice("Report submitted privately for review.");
    }
    setIsBusy(false);
  }

  if (!currentUserId || currentUserId === targetUserId) return null;

  return (
    <div className="w-full sm:w-auto">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setReportOpen((open) => !open)}
          className="min-h-11 rounded-full border border-white/20 bg-white/5 px-4 text-sm font-semibold text-white/75 hover:bg-white/10"
        >
          Report
        </button>
        <button
          type="button"
          onClick={() => void handleBlockToggle()}
          disabled={isBusy}
          className="min-h-11 rounded-full border border-rose-400/30 bg-rose-500/10 px-4 text-sm font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-60"
        >
          {isBlocked ? "Unblock" : "Block"}
        </button>
      </div>

      {reportOpen ? (
        <form onSubmit={handleReport} className="mt-3 w-full min-w-[260px] space-y-3 rounded-2xl border border-white/10 bg-black/40 p-4 sm:w-80">
          <label className="block text-xs font-semibold text-white/70">
            Reason
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value as typeof reason)}
              className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-[#10061f] px-3 text-sm text-white"
            >
              {reportReasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-white/70">
            Details (optional)
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={1000}
              rows={3}
              className="mt-1 w-full rounded-xl border border-white/15 bg-[#10061f] p-3 text-sm text-white"
            />
          </label>
          <button type="submit" disabled={isBusy} className="min-h-11 w-full rounded-full bg-violet-600 px-4 text-sm font-bold hover:bg-violet-500 disabled:opacity-60">
            {isBusy ? "Submitting…" : "Submit report"}
          </button>
        </form>
      ) : null}

      {notice ? <p className="mt-2 max-w-xs text-xs text-white/65" role="status">{notice}</p> : null}
    </div>
  );
}
