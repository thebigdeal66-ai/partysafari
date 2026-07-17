export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[#07070B] text-white px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-bold">PartySafari</h1>
        <p className="mt-2 text-white/70">
          Welcome to your customer dashboard.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-semibold">Upcoming Events</h2>
            <p className="mt-2 text-sm text-white/60">
              Browse nightlife, parties, and special events near you.
            </p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-semibold">Featured Talent</h2>
            <p className="mt-2 text-sm text-white/60">
              Discover DJs, hosts, dancers, and live entertainment.
            </p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-semibold">My Requests</h2>
            <p className="mt-2 text-sm text-white/60">
              Track your booking requests and conversations.
            </p>
          </section>
        </div>

        <div className="mt-8 rounded-2xl border border-violet-400/20 bg-violet-500/10 p-6">
          <h2 className="text-2xl font-semibold">Need entertainment?</h2>
          <p className="mt-2 text-white/70">
            Post a talent request and let performers respond.
          </p>
          <button className="mt-4 rounded-xl bg-violet-600 px-5 py-3 font-medium">
            Post a Talent Request
          </button>
        </div>
      </div>
    </main>
  );
}
