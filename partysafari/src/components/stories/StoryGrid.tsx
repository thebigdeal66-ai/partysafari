"use client";

import { type Story, formatStoryTimeRemaining, getStoryDisplayName } from "@/lib/stories";

type StoryGridProps = {
  stories: Story[];
  emptyMessage: string;
  showAuthor?: boolean;
  onOpenStory: (story: Story) => void;
};

export default function StoryGrid({
  stories,
  emptyMessage,
  showAuthor = false,
  onOpenStory,
}: StoryGridProps) {
  if (stories.length === 0) {
    return <p className="text-sm text-white/60">{emptyMessage}</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {stories.map((story) => (
        <button
          key={story.id}
          type="button"
          onClick={() => onOpenStory(story)}
          className="overflow-hidden rounded-[26px] border border-white/10 bg-[#120824] text-left transition hover:border-violet-300/40 hover:bg-[#16102a]"
        >
          <div className="relative aspect-[4/5] bg-black">
            {story.media_type === "image" ? (
              <img src={story.media_url} alt={story.caption || "Story"} className="h-full w-full object-cover" />
            ) : (
              <video src={story.media_url} preload="metadata" muted playsInline className="h-full w-full object-cover" />
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">{story.media_type}</p>
              <p className="mt-1 text-sm text-white/90">{formatStoryTimeRemaining(story.expires_at)}</p>
            </div>
          </div>
          <div className="space-y-2 p-4">
            {showAuthor ? <p className="text-sm font-semibold text-white">{getStoryDisplayName(story.author)}</p> : null}
            {story.caption ? <p className="line-clamp-2 text-sm text-white/75">{story.caption}</p> : <p className="text-sm text-white/45">No caption</p>}
            <div className="flex flex-wrap gap-2 text-xs">
              {story.venue ? <span className="rounded-full bg-orange-500/15 px-2.5 py-1 text-orange-100">{story.venue.name}</span> : null}
              {story.event ? <span className="rounded-full bg-violet-500/15 px-2.5 py-1 text-violet-100">{story.event.title}</span> : null}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}