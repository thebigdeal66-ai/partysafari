import Link from "next/link";

/**
 * Shared shells for the Discover Tonight sections. Each section owns its own
 * loading, error, and empty state, so these primitives keep the type scale and
 * spacing rhythm identical across all eight of them.
 */

export function SectionShell({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/6 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.24)] backdrop-blur-xl sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-violet-200/70">{eyebrow}</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-white/10 bg-white/5 px-4 text-sm font-semibold text-violet-200 transition hover:border-violet-300/30 hover:bg-white/10"
    >
      {children}
    </Link>
  );
}

/**
 * Replaces a bare "nothing here" line. A quiet section is an opening rather
 * than a failure, so it always names the situation and offers the next move.
 */
export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: string;
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/12 bg-black/20 px-5 py-8 text-center sm:py-10">
      <span aria-hidden="true" className="text-2xl">
        {icon}
      </span>
      <p className="text-base font-semibold text-white">{title}</p>
      <p className="max-w-sm text-sm leading-relaxed text-white/60">{message}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function CardSkeleton() {
  return <div className="h-72 animate-pulse rounded-3xl border border-white/10 bg-white/6" />;
}

export function RowSkeleton() {
  return <div className="h-20 animate-pulse rounded-2xl border border-white/10 bg-white/6" />;
}

export function SectionError({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{message}</div>
  );
}
