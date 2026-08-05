import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/components/radar/SafariRadarExperience.tsx");
let source = fs.readFileSync(filePath, "utf8");

if (source.includes("effect:venue-story-score-sync")) {
  console.log("Radar story score sync patch already applied.");
  process.exit(0);
}

const anchor = `  const partyScores = usePartyScores({\n    venueIds: allVenueIds,\n    enabled: allVenueIds.length > 0,\n    subscribeVisibleOnly: false,\n  });`;

if (!source.includes(anchor)) {
  throw new Error("Could not locate Party Score hook in Safari Radar.");
}

const replacement = `${anchor}\n\n  const venueStoryActivityKey = useMemo(() => {\n    return venueStoryState.stories\n      .map((story) => \`${'${story.id}:${story.created_at}:${story.reactionCount || 0}'}\`)\n      .join(\"|\");\n  }, [venueStoryState.stories]);\n\n  useEffect(() => {\n    if (!selectedHotspotId || venueStoryState.loading) {\n      return;\n    }\n\n    radarTrace(\"SafariRadarExperience\", \"effect:venue-story-score-sync\", {\n      venueId: selectedHotspotId,\n      storyCount: venueStoryState.stories.length,\n    });\n\n    void liveMetrics.refresh([selectedHotspotId]);\n    void partyScores.refresh([selectedHotspotId], true);\n  }, [\n    liveMetrics.refresh,\n    partyScores.refresh,\n    selectedHotspotId,\n    venueStoryActivityKey,\n    venueStoryState.loading,\n    venueStoryState.stories.length,\n  ]);`;

source = source.replace(anchor, replacement);
fs.writeFileSync(filePath, source);
console.log("Applied live story to Party Score sync in Safari Radar.");
