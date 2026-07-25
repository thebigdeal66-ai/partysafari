export type StoryMediaType = "image" | "video";

export type StoryRecord = {
  id: string;
  author_id: string;
  media_url: string;
  media_type: StoryMediaType;
  caption: string | null;
  venue_id: string | null;
  event_id: string | null;
  created_at: string;
  expires_at: string;
  deleted_at: string | null;
};

export type StoryAuthorSummary = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  profile_type: string | null;
};

export type StoryVenueSummary = {
  id: string;
  slug: string | null;
  name: string;
};

export type StoryEventSummary = {
  id: string;
  title: string;
};

export type Story = StoryRecord & {
  author: StoryAuthorSummary | null;
  venue: StoryVenueSummary | null;
  event: StoryEventSummary | null;
  isSeen: boolean;
  viewCount: number | null;
  reactionCount: number | null;
};

export type StoryGroup = {
  authorId: string;
  author: StoryAuthorSummary | null;
  stories: Story[];
  hasUnseen: boolean;
  latestCreatedAt: string;
  venue: StoryVenueSummary | null;
};

export type VenueStoryGroup = {
  venueId: string;
  venue: StoryVenueSummary | null;
  stories: Story[];
};

export type StoryFileValidationResult = {
  ok: boolean;
  error: string | null;
  mediaType: StoryMediaType | null;
};

export const STORY_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const STORY_VIDEO_MIME_TYPES = ["video/mp4", "video/webm"];
export const STORY_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];
export const STORY_VIDEO_EXTENSIONS = ["mp4", "webm"];

export function isActiveStoryRecord(story: Pick<StoryRecord, "deleted_at" | "expires_at">, now = Date.now()) {
  if (story.deleted_at) {
    return false;
  }

  const expiresAt = new Date(story.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function filterActiveStories<T extends Pick<StoryRecord, "deleted_at" | "expires_at">>(stories: T[], now = Date.now()) {
  return stories.filter((story) => isActiveStoryRecord(story, now));
}

export function groupStoriesByAuthor(stories: Story[]) {
  const grouped = new Map<string, StoryGroup>();

  for (const story of [...stories].sort((left, right) => {
    return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
  })) {
    if (!story.author_id) {
      continue;
    }

    const existing = grouped.get(story.author_id);
    if (!existing) {
      grouped.set(story.author_id, {
        authorId: story.author_id,
        author: story.author,
        stories: [story],
        hasUnseen: !story.isSeen,
        latestCreatedAt: story.created_at,
        venue: story.venue,
      });
      continue;
    }

    existing.stories.push(story);
    existing.hasUnseen = existing.hasUnseen || !story.isSeen;
    if (new Date(story.created_at).getTime() >= new Date(existing.latestCreatedAt).getTime()) {
      existing.latestCreatedAt = story.created_at;
      existing.venue = story.venue;
    }
  }

  return Array.from(grouped.values());
}

export function groupStoriesByVenue(stories: Story[]) {
  const grouped = new Map<string, VenueStoryGroup>();

  for (const story of [...stories].sort((left, right) => {
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  })) {
    if (!story.venue_id) {
      continue;
    }

    const existing = grouped.get(story.venue_id);
    if (!existing) {
      grouped.set(story.venue_id, {
        venueId: story.venue_id,
        venue: story.venue,
        stories: [story],
      });
      continue;
    }

    existing.stories.push(story);
  }

  return Array.from(grouped.values());
}

export function formatStoryTimeRemaining(expiresAt: string, now = Date.now()) {
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(end)) {
    return "Ending soon";
  }

  const remainingMs = end - now;
  if (remainingMs <= 0) {
    return "Expired";
  }

  const totalMinutes = Math.ceil(remainingMs / 60000);
  if (totalMinutes < 60) {
    return `${totalMinutes}m left`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) {
    return `${hours}h left`;
  }

  return `${hours}h ${minutes}m left`;
}

export function getStoryFileExtension(fileName: string) {
  const parts = fileName.split(".");
  const raw = parts.length > 1 ? parts[parts.length - 1] : "";
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function validateStoryFile(file: File, maxBytes?: number): StoryFileValidationResult {
  const extension = getStoryFileExtension(file.name);
  const isImage = STORY_IMAGE_MIME_TYPES.includes(file.type) || STORY_IMAGE_EXTENSIONS.includes(extension);
  const isVideo = STORY_VIDEO_MIME_TYPES.includes(file.type) || STORY_VIDEO_EXTENSIONS.includes(extension);

  if (!isImage && !isVideo) {
    return {
      ok: false,
      error: "Choose a JPG, PNG, WebP, GIF, MP4, or WebM file.",
      mediaType: null,
    };
  }

  if (typeof maxBytes === "number" && Number.isFinite(maxBytes) && file.size > maxBytes) {
    const maxMb = Math.max(1, Math.round((maxBytes / (1024 * 1024)) * 10) / 10);
    return {
      ok: false,
      error: `Choose a file smaller than ${maxMb} MB.`,
      mediaType: null,
    };
  }

  return {
    ok: true,
    error: null,
    mediaType: isVideo ? "video" : "image",
  };
}

export function buildStoryUploadPath(userId: string, originalFileName: string, now = Date.now()) {
  const extension = getStoryFileExtension(originalFileName) || "bin";
  const random = Math.random().toString(36).slice(2, 10);
  return `${userId}/stories/story-${now}-${random}.${extension}`;
}

export function getStoryDisplayName(author: StoryAuthorSummary | null) {
  return author?.full_name || author?.username || "PartySafari member";
}

export function getStoryHandle(author: StoryAuthorSummary | null) {
  if (!author?.username) {
    return null;
  }

  return author.username.startsWith("@") ? author.username : `@${author.username}`;
}

export function getStoryInitials(author: StoryAuthorSummary | null) {
  const base = getStoryDisplayName(author);
  return base
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function sortStoryGroupsForRail(
  groups: StoryGroup[],
  currentUserId: string | null,
  friendIds: Set<string>,
  followedIds: Set<string>
) {
  const withIndex = groups.map((group, index) => ({ group, index }));

  const bucket = (group: StoryGroup) => {
    const isOwn = currentUserId !== null && group.authorId === currentUserId;
    const isFriend = friendIds.has(group.authorId);
    const isFollowed = followedIds.has(group.authorId);
    const seenRank = group.hasUnseen ? 0 : 10;

    if (isOwn) return 0 + seenRank;
    if (group.hasUnseen && isFriend) return 1;
    if (group.hasUnseen && isFollowed) return 2;
    if (group.hasUnseen) return 3;
    if (isFriend) return 11;
    if (isFollowed) return 12;
    return 13;
  };

  return withIndex
    .sort((left, right) => {
      const leftBucket = bucket(left.group);
      const rightBucket = bucket(right.group);
      if (leftBucket !== rightBucket) {
        return leftBucket - rightBucket;
      }

      const timeDelta = new Date(right.group.latestCreatedAt).getTime() - new Date(left.group.latestCreatedAt).getTime();
      if (timeDelta !== 0) {
        return timeDelta;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.group);
}