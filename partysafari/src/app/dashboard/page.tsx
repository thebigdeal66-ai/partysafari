import AuthGuard from "@/components/AuthGuard";
import FollowingSection from "@/components/FollowingSection";
import MyRsvpsSection from "@/components/MyRsvpsSection";
import SavedEventsSection from "@/components/SavedEventsSection";

export default function Dashboard() {
  return (
    <AuthGuard>
      <main className="min-h-screen bg-[#07070B] px-6 py-6 text-white">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
            <h1 className="text-5xl font-bold mb-4">PartySafari Dashboard</h1>
            <p className="text-xl text-white/70">
              You are logged in.
            </p>
          </div>

          <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-semibold text-white">My RSVPs</h2>
                <p className="mt-2 text-white/70">
                  Events you&apos;ve marked as Going or Interested are listed here.
                </p>
              </div>
            </div>
            <MyRsvpsSection />
          </section>

          <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-semibold text-white">Following</h2>
                <p className="mt-2 text-white/70">
                  Profiles you follow are listed here.
                </p>
              </div>
            </div>
            <FollowingSection />
          </section>

          <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-semibold text-white">Saved Events</h2>
                <p className="mt-2 text-white/70">
                  Events you saved for later are listed here.
                </p>
              </div>
            </div>
            <SavedEventsSection />
          </section>
        </div>
      </main>
    </AuthGuard>
  );
}
