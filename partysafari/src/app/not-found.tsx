import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[calc(100vh-72px)] items-center justify-center bg-[#07070B] px-5 py-12 text-white">
      <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-gradient-to-br from-[#160a2d] via-[#10061f] to-[#241008] p-7 text-center shadow-2xl shadow-violet-950/30 sm:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-300/25 bg-violet-500/15 text-3xl" aria-hidden="true">
          🦁
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.28em] text-violet-200/80">
          PartySafari.live
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
          This stop is not on the safari.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-white/65 sm:text-base">
          The page may have moved, expired, or the link may be incomplete. Head back to Safari Radar and find what is happening tonight.
        </p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <Link
            href="/radar"
            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-3 font-bold text-white shadow-lg shadow-violet-950/30 transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#10061f]"
          >
            Open Safari Radar
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-5 py-3 font-semibold text-white/90 transition hover:bg-white/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#10061f]"
          >
            Return Home
          </Link>
        </div>
      </section>
    </main>
  );
}
