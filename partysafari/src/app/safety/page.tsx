import Link from "next/link";

export default function SafetyPage() {
  return (
    <main className="min-h-screen bg-[#07070B] px-5 py-10 text-white">
      <article className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-semibold text-violet-300">← PartySafari</Link>
        <h1 className="mt-5 text-4xl font-black">Safety on PartySafari</h1>
        <p className="mt-5 leading-7 text-white/70">
          PartySafari helps people find nightlife and connect around real-world places. Use good judgment, respect boundaries, and follow venue rules and local laws.
        </p>

        <div className="mt-10 space-y-8">
          <section>
            <h2 className="text-xl font-bold">Report a profile</h2>
            <p className="mt-2 leading-7 text-white/70">Open a member profile and choose Report. Reports are private and go to PartySafari’s review queue. Use reports for harassment, threats, impersonation, scams, unsafe behavior, illegal activity, or other serious concerns.</p>
          </section>
          <section>
            <h2 className="text-xl font-bold">Block unwanted contact</h2>
            <p className="mt-2 leading-7 text-white/70">Blocking removes the follow/friend relationship between the two accounts and prevents new follows, friend requests, direct conversations, and new direct messages between them. Unblocking is available from the same profile.</p>
          </section>
          <section>
            <h2 className="text-xl font-bold">Real-world safety</h2>
            <p className="mt-2 leading-7 text-white/70">Do not rely on PartySafari as an emergency service or as a guarantee that a venue or event is safe. Do not use the app while driving. If someone is in immediate danger, contact local emergency services.</p>
          </section>
          <section>
            <h2 className="text-xl font-bold">Privacy concerns</h2>
            <p className="mt-2 leading-7 text-white/70">For access, correction, deletion, copy, or other privacy requests, use the authenticated privacy-request form.</p>
            <Link href="/privacy/request" className="mt-3 inline-flex min-h-11 items-center rounded-full bg-violet-600 px-5 text-sm font-bold hover:bg-violet-500">
              Submit privacy request
            </Link>
          </section>
        </div>
      </article>
    </main>
  );
}
