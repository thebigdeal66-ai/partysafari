"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import {
  type Story,
  type StoryGroup,
  formatStoryTimeRemaining,
  getStoryDisplayName,
  getStoryHandle,
  getStoryInitials,
} from "@/lib/stories";

const IMAGE_STORY_DURATION_MS = 6000;

const QUICK_REACTIONS = ["🔥", "😍", "🎉", "🍻"] as const;

type StoryViewerProps = {
  groups: StoryGroup[];
  currentUserId: string | null;
  initialAuthorId: string | null;
  onClose: () => void;
  onRecordView: (storyId: string) => Promise<void>;
  onAddReaction: (storyId: string, emoji: string) => Promise<{ ok: boolean; duplicate: boolean; error: string | null }>;
  onDeleteStory?: (storyId: string) => Promise<{ ok: boolean; error: string | null }>;
};

type ReactionBurst = {
  id: number;
  emoji: string;
  left: number;
  lift: number;
  fading: boolean;
};

type MentionOption = {
  id: string;
  username: string;
  label: string;
};

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MediaFallback() {
  return (
    <div className="flex h-full min-h-[320px] w-full items-center justify-center rounded-[22px] border border-white/10 bg-white/5 text-sm text-white/55">
      This story could not be loaded.
    </div>
  );
}

function getNextStory(groups: StoryGroup[], currentGroupIndex: number, currentStoryIndex: number): Story | null {
  const group = groups[currentGroupIndex] || null;
  if (!group) {
    return null;
  }

  const nextInGroup = group.stories[currentStoryIndex + 1] || null;
  if (nextInGroup) {
    return nextInGroup;
  }

  const nextGroup = groups[currentGroupIndex + 1] || null;
  if (!nextGroup) {
    return null;
  }

  return nextGroup.stories[0] || null;
}

export default function StoryViewer({
  groups,
  currentUserId,
  initialAuthorId,
  onClose,
  onRecordView,
  onAddReaction,
  onDeleteStory,
}: StoryViewerProps) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const initialGroupIndex = useMemo(() => {
    if (!initialAuthorId) {
      return -1;
    }
    return groups.findIndex((group) => group.authorId === initialAuthorId);
  }, [groups, initialAuthorId]);

  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [windowFocused, setWindowFocused] = useState(true);
  const [isVideoBuffering, setIsVideoBuffering] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reactionBursts, setReactionBursts] = useState<ReactionBurst[]>([]);
  const [reactionNotice, setReactionNotice] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyNotice, setReplyNotice] = useState<string | null>(null);
  const [mentionOptions, setMentionOptions] = useState<MentionOption[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    setGroupIndex(initialGroupIndex);
    setStoryIndex(0);
    setProgress(0);
    setMediaFailed(false);
    setMediaLoading(true);
    setIsVideoBuffering(false);
    setDeleteError(null);
    setReactionNotice(null);
    setReplyText("");
    setReplyNotice(null);
    setMentionOptions([]);
  }, [initialGroupIndex]);

  const activeGroup = groupIndex >= 0 ? groups[groupIndex] || null : null;
  const activeStory = activeGroup?.stories[storyIndex] || null;
  const pausedByBuffer = activeStory?.media_type === "video" && isVideoBuffering;
  const paused = isHolding || isHovering || pausedByBuffer || !windowFocused;

  const goToGroupStory = (nextGroupIndex: number, nextStoryIndex: number) => {
    const nextGroup = groups[nextGroupIndex] || null;
    if (!nextGroup) {
      onClose();
      return;
    }

    if (nextStoryIndex < 0) {
      const previousGroup = groups[nextGroupIndex - 1] || null;
      if (!previousGroup) {
        setGroupIndex(nextGroupIndex);
        setStoryIndex(0);
        setProgress(0);
        return;
      }

      setGroupIndex(nextGroupIndex - 1);
      setStoryIndex(Math.max(0, previousGroup.stories.length - 1));
      setProgress(0);
      setMediaFailed(false);
      setMediaLoading(true);
      setIsVideoBuffering(false);
      setReplyText("");
      setReplyNotice(null);
      return;
    }

    if (nextStoryIndex >= nextGroup.stories.length) {
      const upcomingGroup = groups[nextGroupIndex + 1] || null;
      if (!upcomingGroup) {
        onClose();
        return;
      }

      setGroupIndex(nextGroupIndex + 1);
      setStoryIndex(0);
      setProgress(0);
      setMediaFailed(false);
      setMediaLoading(true);
      setIsVideoBuffering(false);
      setReplyText("");
      setReplyNotice(null);
      return;
    }

    setGroupIndex(nextGroupIndex);
    setStoryIndex(nextStoryIndex);
    setProgress(0);
    setMediaFailed(false);
    setMediaLoading(true);
    setIsVideoBuffering(false);
    setReplyText("");
    setReplyNotice(null);
  };

  const goNext = () => {
    if (!activeGroup) {
      onClose();
      return;
    }
    goToGroupStory(groupIndex, storyIndex + 1);
  };

  const goPrevious = () => {
    if (!activeGroup) {
      onClose();
      return;
    }
    goToGroupStory(groupIndex, storyIndex - 1);
  };

  useEffect(() => {
    if (!activeStory) {
      return;
    }

    if (activeStory.author_id !== currentUserId) {
      void onRecordView(activeStory.id);
    }
  }, [activeStory, currentUserId, onRecordView]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "ArrowRight") {
        goNext();
        return;
      }
      if (event.key === "ArrowLeft") {
        goPrevious();
      }
    };

    const handleBlur = () => setWindowFocused(false);
    const handleFocus = () => setWindowFocused(true);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (!activeStory || activeStory.media_type !== "image" || paused || prefersReducedMotion) {
      return;
    }

    const tick = (timestamp: number) => {
      if (startRef.current === null) {
        startRef.current = timestamp;
      }

      const elapsed = timestamp - startRef.current;
      const nextProgress = Math.min(1, elapsed / IMAGE_STORY_DURATION_MS);
      setProgress(nextProgress);

      if (nextProgress >= 1) {
        startRef.current = null;
        goNext();
        return;
      }

      rafRef.current = window.requestAnimationFrame(tick);
    };

    startRef.current = null;
    rafRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      startRef.current = null;
    };
  }, [activeStory, paused, prefersReducedMotion]);

  useEffect(() => {
    if (!activeStory || activeStory.media_type !== "video" || !videoRef.current) {
      return;
    }

    const video = videoRef.current;
    const handleTimeUpdate = () => {
      if (!video.duration || !Number.isFinite(video.duration)) {
        setProgress(0);
        return;
      }
      setProgress(Math.min(1, video.currentTime / video.duration));
    };

    const handleEnded = () => {
      setProgress(1);
      goNext();
    };

    const handleWaiting = () => setIsVideoBuffering(true);
    const handlePlayable = () => setIsVideoBuffering(false);

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("stalled", handleWaiting);
    video.addEventListener("canplay", handlePlayable);
    video.addEventListener("playing", handlePlayable);

    if (paused) {
      void video.pause();
    } else {
      void video.play().catch(() => undefined);
    }

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("stalled", handleWaiting);
      video.removeEventListener("canplay", handlePlayable);
      video.removeEventListener("playing", handlePlayable);
    };
  }, [activeStory, paused]);

  useEffect(() => {
    setMediaFailed(false);
    setDeleteError(null);
    setProgress(0);
    setMediaLoading(true);
    setIsVideoBuffering(false);
  }, [activeStory?.id]);

  useEffect(() => {
    const next = getNextStory(groups, groupIndex, storyIndex);
    if (!next) {
      return;
    }

    if (next.media_type === "image") {
      const img = new Image();
      img.src = next.media_url;
      return;
    }

    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = next.media_url;
    return () => {
      video.src = "";
      video.load();
    };
  }, [groupIndex, groups, storyIndex]);

  useEffect(() => {
    const match = replyText.match(/@([a-zA-Z0-9_]{2,})$/);
    if (!match || !currentUserId) {
      setMentionOptions([]);
      return;
    }

    const term = match[1];
    let active = true;
    setMentionLoading(true);

    const run = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, full_name")
        .neq("id", currentUserId)
        .or(`username.ilike.%${term}%,full_name.ilike.%${term}%`)
        .limit(5);

      if (!active) {
        return;
      }

      if (error) {
        setMentionOptions([]);
        setMentionLoading(false);
        return;
      }

      const options = ((data || []) as Array<{ id: string; username?: string | null; full_name?: string | null }>)
        .filter((row) => typeof row.username === "string" && row.username.trim().length > 0)
        .map((row) => ({
          id: row.id,
          username: String(row.username),
          label: row.full_name || `@${row.username}`,
        }));

      setMentionOptions(options);
      setMentionLoading(false);
    };

    void run();

    return () => {
      active = false;
    };
  }, [currentUserId, replyText, supabase]);

  if (!activeStory || !activeGroup) {
    return null;
  }

  const isOwnStory = activeStory.author_id === currentUserId;
  const displayName = getStoryDisplayName(activeGroup.author);
  const handle = getStoryHandle(activeGroup.author);
  const storyCountLabel = `Story ${storyIndex + 1} of ${activeGroup.stories.length}`;
  const hasCaption = Boolean(activeStory.caption && activeStory.caption.trim().length > 0);
  const totalReactions = activeStory.reactionCount ?? 0;

  const addReaction = async (emoji: string) => {
    setReactionNotice(null);

    const result = await onAddReaction(activeStory.id, emoji);
    if (!result.ok) {
      if (result.duplicate) {
        setReactionNotice(`You already reacted with ${emoji}.`);
        return;
      }

      setReactionNotice(result.error || "Could not save reaction.");
      return;
    }

    const id = Date.now() + Math.floor(Math.random() * 1000);
    const burst: ReactionBurst = {
      id,
      emoji,
      left: 20 + Math.random() * 60,
      lift: 90 + Math.random() * 80,
      fading: false,
    };
    setReactionBursts((current) => [...current, burst]);

    window.setTimeout(() => {
      setReactionBursts((current) => current.map((item) => (item.id === id ? { ...item, fading: true } : item)));
    }, 60);

    window.setTimeout(() => {
      setReactionBursts((current) => current.filter((item) => item.id !== id));
    }, 980);
  };

  const handleSendReply = async () => {
    setReplyNotice(null);

    if (!currentUserId) {
      setReplyNotice("Sign in to send a reply.");
      return;
    }

    if (activeStory.author_id === currentUserId) {
      setReplyNotice("You cannot reply to your own story.");
      return;
    }

    const body = replyText.trim();
    if (!body) {
      setReplyNotice("Write a reply first.");
      return;
    }

    setReplySending(true);

    const { data, error } = await supabase.rpc("start_direct_conversation", {
      p_other_profile_id: activeStory.author_id,
    });

    if (error) {
      setReplyNotice(error.message || "Could not start a conversation.");
      setReplySending(false);
      return;
    }

    const conversationId = typeof data === "string" ? data : data?.toString();
    if (!conversationId) {
      setReplyNotice("Could not start a conversation.");
      setReplySending(false);
      return;
    }

    const { error: messageError } = await supabase.from("direct_messages").insert({
      conversation_id: conversationId,
      sender_id: currentUserId,
      body,
    });

    if (messageError) {
      setReplyNotice(messageError.message || "Could not send reply.");
      setReplySending(false);
      return;
    }

    setReplyText("");
    setMentionOptions([]);
    setReplyNotice("Reply sent.");
    setReplySending(false);
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/95 p-0 text-white sm:p-6"
      onTouchStart={(event) => {
        const touch = event.touches[0];
        touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={(event) => {
        const start = touchStartRef.current;
        const touch = event.changedTouches[0];
        if (!start || !touch) {
          return;
        }

        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;

        if (dy > 110 && Math.abs(dy) > Math.abs(dx)) {
          onClose();
          return;
        }

        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) {
            goNext();
          } else {
            goPrevious();
          }
        }
      }}
    >
      <div
        className="relative flex h-full w-full max-w-[900px] flex-col overflow-hidden bg-black shadow-[0_20px_70px_rgba(0,0,0,0.45)] sm:h-auto sm:rounded-[26px] sm:border sm:border-white/10"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {!mediaFailed ? (
          <div className="pointer-events-none absolute inset-0 z-0">
            {activeStory.media_type === "image" ? (
              <img
                src={activeStory.media_url}
                alt="Background story blur"
                className="h-full w-full scale-110 object-cover opacity-35 blur-2xl"
              />
            ) : (
              <video
                src={activeStory.media_url}
                muted
                playsInline
                autoPlay
                loop
                preload="metadata"
                className="h-full w-full scale-110 object-cover opacity-30 blur-2xl"
              />
            )}
          </div>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-44 bg-gradient-to-b from-black/90 via-black/50 to-transparent" />
        <div className="absolute inset-x-0 top-0 z-30 px-4 pt-5 sm:px-6">
          <div className="flex gap-1.5">
            {activeGroup.stories.map((story, index) => {
              const value = index < storyIndex ? 1 : index === storyIndex ? progress : 0;
              return (
                <div key={story.id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full rounded-full bg-white transition-[width] duration-150" style={{ width: `${value * 100}%` }} />
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {activeGroup.author?.avatar_url ? (
                <img src={activeGroup.author.avatar_url} alt={displayName} className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-orange-500 text-sm font-bold text-white">
                  {getStoryInitials(activeGroup.author) || "PS"}
                </div>
              )}
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-white">{displayName}</p>
                  {handle ? <span className="text-xs text-white/60">{handle}</span> : null}
                  <span className="rounded-full border border-white/15 bg-black/35 px-2 py-0.5 text-[11px] text-white/85">{storyCountLabel}</span>
                  <span className="text-xs text-white/50">{formatTimestamp(activeStory.created_at)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-white/75">{formatStoryTimeRemaining(activeStory.expires_at)}</span>
                  {activeStory.venue ? (
                    <Link
                      href={activeStory.venue.slug ? `/venues/${activeStory.venue.slug}` : "#"}
                      className="pointer-events-auto rounded-full bg-orange-500/20 px-2.5 py-1 text-orange-100 transition hover:bg-orange-500/30"
                    >
                      {activeStory.venue.name}
                    </Link>
                  ) : null}
                  {activeStory.event ? (
                    <Link
                      href={`/events/${activeStory.event.id}`}
                      className="pointer-events-auto rounded-full bg-violet-500/20 px-2.5 py-1 text-violet-100 transition hover:bg-violet-500/30"
                    >
                      {activeStory.event.title}
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="pointer-events-auto rounded-full border border-white/15 bg-black/45 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Close
            </button>
          </div>
        </div>

        <button
          type="button"
          aria-label="Previous story"
          onClick={goPrevious}
          onPointerDown={() => setIsHolding(true)}
          onPointerUp={() => setIsHolding(false)}
          onPointerCancel={() => setIsHolding(false)}
          className="absolute inset-y-0 left-0 z-10 w-1/2 cursor-w-resize"
        />
        <button
          type="button"
          aria-label="Next story"
          onClick={goNext}
          onPointerDown={() => setIsHolding(true)}
          onPointerUp={() => setIsHolding(false)}
          onPointerCancel={() => setIsHolding(false)}
          className="absolute inset-y-0 right-0 z-10 w-1/2 cursor-e-resize"
        />

        <div
          className="relative z-10 flex flex-1 items-center justify-center px-3 pb-32 pt-28 sm:px-6"
          onPointerDown={() => setIsHolding(true)}
          onPointerUp={() => setIsHolding(false)}
          onPointerCancel={() => setIsHolding(false)}
        >
          <div key={activeStory.id} className="relative flex w-full items-center justify-center overflow-hidden rounded-[22px] bg-black/35">
            {mediaLoading && !mediaFailed ? (
              <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/10 via-white/5 to-transparent" />
            ) : null}

            {!mediaFailed && activeStory.media_type === "image" ? (
              <img
                src={activeStory.media_url}
                alt={activeStory.caption || displayName}
                onLoad={() => setMediaLoading(false)}
                onError={() => setMediaFailed(true)}
                className={`max-h-[78vh] w-full object-contain transition-all duration-500 ${
                  mediaLoading ? "opacity-0" : "opacity-100"
                } ${!prefersReducedMotion ? "scale-[1.02]" : "scale-100"}`}
              />
            ) : null}

            {!mediaFailed && activeStory.media_type === "video" ? (
              <video
                ref={videoRef}
                key={activeStory.id}
                src={activeStory.media_url}
                onError={() => setMediaFailed(true)}
                onLoadedData={() => setMediaLoading(false)}
                playsInline
                preload="metadata"
                muted={false}
                controls={prefersReducedMotion}
                className={`max-h-[78vh] w-full object-contain transition-opacity duration-500 ${mediaLoading ? "opacity-0" : "opacity-100"}`}
              />
            ) : null}

            {mediaFailed ? <MediaFallback /> : null}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black via-black/88 to-transparent px-4 pb-6 pt-12 sm:px-6">
          {hasCaption ? <p className="mb-4 text-sm leading-relaxed text-white/90">{activeStory.caption}</p> : null}

          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-white/85">👁 {activeStory.viewCount ?? 0} views</span>
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-white/85">❤️ {totalReactions} reactions</span>
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-white/85">💬 reply</span>
            {isOwnStory && onDeleteStory ? (
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm("Delete this story?")) {
                    return;
                  }
                  const result = await onDeleteStory(activeStory.id);
                  if (!result.ok) {
                    setDeleteError(result.error || "Could not delete story.");
                    return;
                  }
                  setDeleteError(null);
                  goNext();
                }}
                className="rounded-full border border-rose-400/35 bg-rose-500/15 px-4 py-1.5 text-sm font-semibold text-rose-100 transition hover:border-rose-300 hover:bg-rose-500/25"
              >
                Delete Story
              </button>
            ) : null}
          </div>

          <div className="pointer-events-auto mt-3 flex flex-wrap items-center gap-2">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => void addReaction(emoji)}
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-lg transition hover:bg-white/20"
              >
                {emoji}
              </button>
            ))}
          </div>

          {!isOwnStory ? (
            <div className="pointer-events-auto mt-3 space-y-2">
              <div className="relative">
                <input
                  value={replyText}
                  onChange={(event) => {
                    setReplyText(event.target.value);
                    setReplyNotice(null);
                  }}
                  placeholder="Reply to story... use @username"
                  className="h-11 w-full rounded-full border border-white/20 bg-black/45 px-4 text-sm text-white outline-none placeholder:text-white/45 focus:border-violet-300"
                />
                <button
                  type="button"
                  onClick={() => void handleSendReply()}
                  disabled={replySending}
                  className="absolute right-1 top-1 h-9 rounded-full bg-violet-600 px-4 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
                >
                  {replySending ? "Sending" : "Send"}
                </button>
              </div>
              {mentionLoading ? <p className="text-xs text-white/55">Looking up mention...</p> : null}
              {mentionOptions.length > 0 ? (
                <div className="max-h-28 overflow-y-auto rounded-xl border border-white/10 bg-black/65 p-2">
                  {mentionOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setReplyText((current) => current.replace(/@([a-zA-Z0-9_]{2,})$/, `@${option.username} `));
                        setMentionOptions([]);
                      }}
                      className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-white/85 transition hover:bg-white/10"
                    >
                      @{option.username} <span className="text-white/55">{option.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {replyNotice ? <p className="pointer-events-auto mt-2 text-xs text-white/70">{replyNotice}</p> : null}
          {reactionNotice ? <p className="pointer-events-auto mt-2 text-xs text-white/70">{reactionNotice}</p> : null}
          {isVideoBuffering ? <p className="pointer-events-auto mt-2 text-xs text-white/65">Buffering...</p> : null}
          {deleteError ? <p className="pointer-events-auto mt-2 text-xs text-rose-300">{deleteError}</p> : null}
        </div>

        {reactionBursts.map((burst) => (
          <span
            key={burst.id}
            className="pointer-events-none absolute bottom-28 z-40 text-2xl transition-all duration-900 ease-out"
            style={{
              left: `${burst.left}%`,
              transform: `translate(-50%, ${burst.fading ? `-${burst.lift}px` : "0px"})`,
              opacity: burst.fading ? 0 : 1,
            }}
          >
            {burst.emoji}
          </span>
        ))}
      </div>
    </div>
  );
}
