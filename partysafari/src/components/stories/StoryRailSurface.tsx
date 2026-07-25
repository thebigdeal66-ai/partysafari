"use client";

import { useState } from "react";
import StoryComposer from "@/components/stories/StoryComposer";
import StoryRail from "@/components/stories/StoryRail";
import StoryViewer from "@/components/stories/StoryViewer";
import { useStories } from "@/components/stories/useStories";

type StoryRailSurfaceProps = {
  defaultVenueId?: string | null;
  defaultEventId?: string | null;
};

export default function StoryRailSurface({
  defaultVenueId = null,
  defaultEventId = null,
}: StoryRailSurfaceProps) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [viewerAuthorId, setViewerAuthorId] = useState<string | null>(null);
  const storyState = useStories({
    includeConnectionOrdering: true,
    includeOwnViewCounts: true,
    subscribeOwnStoryViewCounts: true,
  });

  return (
    <>
      <StoryRail
        groups={storyState.authorGroups}
        currentUserId={storyState.currentUserId}
        loading={storyState.loading}
        error={storyState.error}
        onAddStory={() => setComposerOpen(true)}
        onOpenGroup={(authorId) => setViewerAuthorId(authorId)}
      />

      <StoryComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        defaultVenueId={defaultVenueId}
        defaultEventId={defaultEventId}
        createStoryRecord={storyState.createStoryRecord}
      />

      {viewerAuthorId ? (
        <StoryViewer
          groups={storyState.authorGroups}
          currentUserId={storyState.currentUserId}
          initialAuthorId={viewerAuthorId}
          onClose={() => setViewerAuthorId(null)}
          onRecordView={storyState.recordView}
          onAddReaction={storyState.addReaction}
          onDeleteStory={storyState.softDeleteStory}
        />
      ) : null}
    </>
  );
}