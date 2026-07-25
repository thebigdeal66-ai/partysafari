"use client";

import dynamic from "next/dynamic";

const TonightNearMeMap = dynamic(() => import("@/components/TonightNearMeMap"), {
  ssr: false,
  loading: () => (
    <main className="min-h-screen bg-[#07070B] px-6 py-8 text-white">
      <div className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-[#10061f] p-8 text-white/70">
        Loading map experience...
      </div>
    </main>
  ),
});

export default function MapPage() {
  return <TonightNearMeMap />;
}
