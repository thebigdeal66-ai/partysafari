"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";

const requestTypes = ["Access my data", "Correct my data", "Delete my data", "Get a copy", "Appeal a decision", "Other"] as const;

export default function PrivacyRequestPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [requestType, setRequestType] = useState<(typeof requestTypes)[number]>("Access my data");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "signin" | "error">("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");

    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) {
      setStatus("signin");
      return;
    }

    const normalizedDetails = details.trim().slice(0, 850);
    const { error } = await supabase.from("content_reports").insert({
      reporter_id: userId,
      target_type: "other",
      target_id: null,
      reason: "other",
      details: `PRIVACY REQUEST — ${requestType}: ${normalizedDetails || "No additional details provided."}`,
    });

    setStatus(error ? "error" : "sent");
    if (!error) setDetails("");
  }

  return (
    <main className="min-h-screen bg-[#07070B] px-5 py-10 text-white">
      <div className="mx-auto max-w-xl">
        <Link href="/privacy" className="text-sm font-semibold text-violet-300">← Privacy Policy</Link>
        <h1 className="mt-5 text-3xl font-black">Privacy request</h1>
        <p className="mt-3 leading-7 text-white/70">
          Submit this while signed in so PartySafari can verify which account the request concerns.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5 rounded-3xl border border-white/10 bg-[#10061f] p-6">
          <label className="block">
            <span className="text-sm font-semibold text-white/80">Request</span>
            <select
              value={requestType}
              onChange={(event) => setRequestType(event.target.value as (typeof requestTypes)[number])}
              className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-white"
            >
              {requestTypes.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-white/80">Details (optional)</span>
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={850}
              rows={5}
              className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 p-3 text-white placeholder:text-white/35"
              placeholder="Tell us what you want us to review."
            />
          </label>

          <button
            type="submit"
            disabled={status === "sending" || status === "sent"}
            className="min-h-11 w-full rounded-full bg-violet-600 px-5 font-bold hover:bg-violet-500 disabled:opacity-60"
          >
            {status === "sending" ? "Submitting…" : status === "sent" ? "Request submitted" : "Submit request"}
          </button>

          {status === "signin" ? <p className="text-sm text-amber-300">Please <Link className="underline" href="/login">sign in</Link> and submit again.</p> : null}
          {status === "error" ? <p className="text-sm text-rose-300">We could not submit that request. Please try again.</p> : null}
          {status === "sent" ? <p className="text-sm text-emerald-300">Your request is in the private review queue.</p> : null}
        </form>
      </div>
    </main>
  );
}
