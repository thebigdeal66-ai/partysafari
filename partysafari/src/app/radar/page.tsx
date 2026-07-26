"use client";

import dynamic from "next/dynamic";

const SafariRadarExperience = dynamic(() => import("@/components/radar/SafariRadarExperience"), {
  ssr: false,
  loading: () => (
    <main className="min-h-screen bg-[#05060d] px-6 py-8 text-white">
      <div className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-white/5 p-8 text-white/70">
        Loading Safari Radar...
      </div>
    </main>
  ),
});

export default function RadarPage() {
  return <SafariRadarExperience />;
}
