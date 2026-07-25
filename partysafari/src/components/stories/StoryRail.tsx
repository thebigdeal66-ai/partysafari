"use client";

import { useMemo, useRef, useState } from "react";
import { type StoryAuthorSummary, type StoryGroup, getStoryDisplayName, getStoryHandle, getStoryInitials } from "@/lib/stories";

type StoryRailProps = {
  groups: StoryGroup[];
  currentUserId: string | null;
  currentUserProfile?: StoryAuthorSummary | null;
  loading?: boolean;
  error?: string | null;
  onAddStory?: () => void;
  onOpenGroup: (authorId: string) => void;
};

function StoryAvatar({
  author,
  hasUnseen,
  active,
}: {
  author: StoryAuthorSummary | null;
  hasUnseen: boolean;
  active?: boolean;
}) {
  const ringClass = hasUnseen
    ? "bg-[conic-gradient(from_40deg,rgba(249,115,22,1),rgba(236,72,153,1),rgba(147,51,234,1),rgba(249,115,22,1))]"
    : "bg-white/20";
  const pulseClass = hasUnseen ? "animate-pulse" : "";

  if (author?.avatar_url) {
    return (
      <div className={`rounded-full p-[3px] ${ringClass} ${pulseClass} ${active ? "shadow-[0_0_0_3px_rgba(255,255,255,0.12)]" : ""}`}>
        <img
          src={author.avatar_url}
          alt={getStoryDisplayName(author)}
          className="h-16 w-16 rounded-full border border-black/75 object-cover"
        />
      </div>
    );
  }

  return (
    <div className={`rounded-full p-[3px] ${ringClass} ${pulseClass} ${active ? "shadow-[0_0_0_3px_rgba(255,255,255,0.12)]" : ""}`}>
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-black/70 bg-gradient-to-br from-violet-500 to-orange-500 text-lg font-bold text-white">
        {getStoryInitials(author) || "PS"}
      </div>
    </div>
  );
}

export default function StoryRail({
  groups,
  currentUserId,
  currentUserProfile = null,
  loading = false,
  error = null,
  onAddStory,
  onOpenGroup,
}: StoryRailProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const ownGroup = currentUserId ? groups.find((group) => group.authorId === currentUserId) || null : null;
  const otherGroups = currentUserId ? groups.filter((group) => group.authorId !== currentUserId) : groups;
  const virtualItems = useMemo(
    () => [
      ...(currentUserId ? [{ kind: "own" as const, id: "own" }] : []),
      ...otherGroups.map((group) => ({ kind: "group" as const, id: group.authorId, group })),
    ],
    [currentUserId, otherGroups]
  );

  const ITEM_WIDTH = 102;
  const viewportWidth = 720;
  const visibleCount = Math.ceil(viewportWidth / ITEM_WIDTH);
  const startIndex = Math.max(0, Math.floor(scrollLeft / ITEM_WIDTH) - 6);
  const endIndex = Math.min(virtualItems.length, startIndex + visibleCount + 14);
  const leftSpacer = startIndex * ITEM_WIDTH;
  const rightSpacer = Math.max(0, (virtualItems.length - endIndex) * ITEM_WIDTH);

  return (
    <section className="rounded-[28px] border border-white/10 bg-[#10061f]/90 p-4 text-white shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Stories</h2>
          <p className="text-sm text-white/60">Quick drops from tonight.</p>
        </div>
        {onAddStory ? (
          <button
            type="button"
            onClick={onAddStory}
            className="rounded-full border border-violet-400/35 bg-violet-500/15 px-4 py-2 text-sm font-semibold text-violet-100 transition hover:border-violet-300 hover:bg-violet-500/25"
          >
            Add Story
          </button>
        ) : null}
      </div>

      {loading ? <p className="text-sm text-white/60">Loading stories...</p> : null}
      {!loading && error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {!loading && !error ? (
        <div
          ref={scrollRef}
          onScroll={(event) => setScrollLeft((event.currentTarget as HTMLDivElement).scrollLeft)}
          className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {leftSpacer > 0 ? <div aria-hidden="true" style={{ width: leftSpacer }} className="shrink-0" /> : null}

          {virtualItems.slice(startIndex, endIndex).map((entry) => {
            if (entry.kind === "own") {
              return (
                <button
                  key="own-story"
                  type="button"
                  onClick={() => {
                    if (ownGroup) {
                      onOpenGroup(ownGroup.authorId);
                      return;
                    }
                    onAddStory?.();
                  }}
                  className="flex min-w-[88px] snap-start flex-col items-center gap-2 text-center"
                >
                  <div className="relative">
                    <StoryAvatar author={ownGroup?.author || currentUserProfile} hasUnseen={Boolean(ownGroup?.hasUnseen)} />
                    {!ownGroup ? (
                      <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-[#10061f] bg-orange-500 text-sm font-bold text-white">
                        +
                      </span>
                    ) : null}
                  </div>
                  <div>
                    <p className="line-clamp-1 text-sm font-medium text-white">Your Story</p>
                    <p className="line-clamp-1 text-[11px] text-white/50">{ownGroup ? "New drops" : "Tap to post"}</p>
                  </div>
                </button>
              );
            }

            const group = entry.group;
            const displayName = getStoryDisplayName(group.author);
            const handle = getStoryHandle(group.author);
            return (
              <button
                key={group.authorId}
                type="button"
                onClick={() => onOpenGroup(group.authorId)}
                className="flex min-w-[88px] snap-start flex-col items-center gap-2 text-center [content-visibility:auto]"
              >
                <div className="relative">
                  <StoryAvatar author={group.author} hasUnseen={group.hasUnseen} />
                  {group.venue ? (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/80 px-2 py-0.5 text-[10px] font-semibold text-orange-200">
                      {group.venue.name}
                    </span>
                  ) : null}
                </div>
                <div>
                  <p className="line-clamp-1 text-sm font-medium text-white">{displayName}</p>
                  <p className="line-clamp-1 text-[11px] text-white/50">{handle || group.venue?.name || "Story"}</p>
                </div>
              </button>
            );
          })}

          {rightSpacer > 0 ? <div aria-hidden="true" style={{ width: rightSpacer }} className="shrink-0" /> : null}

          {!currentUserId && groups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-5 text-sm text-white/55">
              Sign in to post a story.
            </div>
          ) : null}

          {currentUserId && !ownGroup && otherGroups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-5 text-sm text-white/55">
              No active stories yet.
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}