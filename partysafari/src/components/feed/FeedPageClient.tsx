"use client";

import FeedPost, { type FeedPostData } from "@/components/FeedPost";
import LivePartyModeBoard from "@/components/live/LivePartyModeBoard";
import StoryRailSurface from "@/components/stories/StoryRailSurface";

export default function FeedPageClient({ posts }: { posts: FeedPostData[] }) {
  return (
    <main className="min-h-screen bg-[#07070B] text-white">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-8 sticky top-0 z-20 -mx-6 bg-[#07070B] px-6 py-4">
          <h1 className="text-4xl font-bold text-white">Nightlife Feed</h1>
          <p className="mt-2 text-lg text-white/70">Stay connected with the PartySafari community</p>
        </div>

        <div className="space-y-4">
          <StoryRailSurface />
          <div className="rounded-full border border-orange-300/20 bg-orange-500/10 px-4 py-2 text-sm text-orange-100">
            New stories update here live.
          </div>
        </div>

        <div className="mt-6">
          <LivePartyModeBoard />
        </div>

        <div className="mt-8 space-y-6">
          {posts.map((post) => (
            <FeedPost key={post.id} post={post} />
          ))}
        </div>

        <div className="mt-8 pb-8 text-center">
          <button className="rounded-full border border-violet-500/50 bg-violet-500/10 px-8 py-3 text-sm font-semibold text-violet-200 transition hover:border-violet-300 hover:bg-violet-500/20">
            Load More Posts
          </button>
        </div>
      </div>
    </main>
  );
}