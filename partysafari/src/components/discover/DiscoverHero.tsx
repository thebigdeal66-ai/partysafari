import Link from "next/link";

type DiscoverHeroProps = {
  peopleOutTonight: number;
  liveEvents: number;
  activeStories: number;
  trendingVenues: number;
  updatedLabel: string;
};

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5 backdrop-blur-md sm:px-4 sm:py-3">
      <p className="text-[10px] font-medium uppercase leading-tight tracking-[0.16em] text-white/50 sm:text-[11px] sm:tracking-[0.2em]">
        {label}
      </p>
      <p className="mt-1.5 text-lg font-semibold tabular-nums text-white sm:text-xl">{value}</p>
    </div>
  );
}

export default function DiscoverHero({
  peopleOutTonight,
  liveEvents,
  activeStories,
  trendingVenues,
  updatedLabel,
}: DiscoverHeroProps) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(124,58,237,0.18),rgba(14,165,233,0.12)_45%,rgba(249,115,22,0.14))] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.3)] backdrop-blur-xl sm:p-7 lg:p-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.12),transparent_18%),radial-gradient(circle_at_80%_0%,rgba(244,114,182,0.18),transparent_26%)]" />
      <div className="relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end lg:gap-8">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.28em] text-violet-100/75">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-300" />
            Live now
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">🌆 Discover Tonight</h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg">The nightlife is happening now.</p>

          <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-5">
            <StatPill label="👥 People Out" value={peopleOutTonight.toLocaleString()} />
            <StatPill label="🎉 Live Events" value={liveEvents.toLocaleString()} />
            <StatPill label="📸 Active Stories" value={activeStories.toLocaleString()} />
            <StatPill label="🔥 Trending" value={trendingVenues.toLocaleString()} />
            <StatPill label="🕒 Updated" value={updatedLabel.replace("Updated ", "")} />
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-lg sm:p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-violet-200/70">Live pulse</p>
          <p className="mt-2.5 text-xl font-semibold tracking-tight text-white sm:text-2xl">Realtime nightlife operating system</p>
          <p className="mt-2.5 text-sm leading-relaxed text-white/65">
            Crowds, stories, events, and friends stay in sync using the existing PartySafari realtime pipeline.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link
              href="/map"
              className="inline-flex min-h-11 items-center rounded-full border border-violet-300/35 bg-violet-500/15 px-4 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/25"
            >
              Open Live Map
            </Link>
            <Link
              href="/events"
              className="inline-flex min-h-11 items-center rounded-full border border-white/12 bg-white/8 px-4 text-sm font-semibold text-white/90 transition hover:bg-white/12"
            >
              Browse Events
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
