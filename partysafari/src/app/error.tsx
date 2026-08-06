"use client";

import Link from "next/link";
import { useEffect } from "react";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.error("[PartySafari] Route error:", error);
    }
  }, [error]);

  return (
    <main className="flex min-h-[calc(100vh-72px)] items-center justify-center bg-[#07070B] px-4 py-10 text-white sm:px-6">
      <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-gradient-to-br from-[#1a0b2e] via-[#10061f] to-[#09030f] p-6 text-center shadow-2xl shadow-violet-950/40 sm:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-fuchsia-300/30 bg-fuchsia-500/10 text-3xl" aria-hidden="true">
          🦁
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.28em] text-fuchsia-300">PartySafari recovery</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">The party hit a temporary snag.</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-white/70 sm:text-base">
          Your account and activity are still safe. Try this screen again or jump back into Safari Radar.
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-gradient-to-r from-fuchsia-500 to-orange-400 px-5 py-3 font-bold text-white transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#10061f]"
          >
            Try Again
          </button>
          <Link
            href="/radar"
            className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-5 py-3 font-bold text-white transition hover:bg-white/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#10061f]"
          >
            Open Safari Radar
          </Link>
        </div>

        <Link
          href="/"
          className="mt-5 inline-flex min-h-11 items-center justify-center px-4 text-sm font-semibold text-white/65 underline-offset-4 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
        >
          Return home
        </Link>
      </section>
    </main>
  );
}
