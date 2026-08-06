"use client";

import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.error("[PartySafari] Global error:", error);
    }
  }, [error]);

  return (
    <html lang="en">
      <body className="m-0 bg-[#07070B] font-sans text-white">
        <main className="flex min-h-screen items-center justify-center px-4 py-10">
          <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-[#10061f] p-7 text-center shadow-2xl shadow-black/50 sm:p-10">
            <div className="text-5xl" aria-hidden="true">🦁</div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.28em] text-fuchsia-300">PartySafari.live</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">We need to restart this experience.</h1>
            <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-white/70 sm:text-base">
              A temporary app error interrupted the page. Reload PartySafari or return directly to Safari Radar.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={reset}
                className="min-h-12 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-orange-400 px-5 py-3 font-bold text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
              >
                Reload PartySafari
              </button>
              <a
                href="/radar"
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-5 py-3 font-bold text-white hover:bg-white/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
              >
                Open Safari Radar
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
