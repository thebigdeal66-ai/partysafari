import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/components/radar/SafariRadarExperience.tsx");
let source = fs.readFileSync(filePath, "utf8");

if (source.includes("const recommendationLockActive =")) {
  console.log("Radar recommendation lock already applied.");
  process.exit(0);
}

const filterStart = "    return hotspots.filter((hotspot) => {";
if (!source.includes(filterStart)) {
  throw new Error("Could not locate Radar hotspot filter start.");
}
source = source.replace(
  filterStart,
  "    const matchingHotspots = hotspots.filter((hotspot) => {"
);

const filterEnd = `      return true;
    });
  }, [crowdFilter, friendsOnly, hotspots, liveMusicOnly, liveStoriesOnly, maxDistanceMiles, minScore, openNowOnly, overlays, selectedCity, venueTypeFilter]);`;

const lockedFilterEnd = `      return true;
    });

    const recommendationLockActive = Boolean(
      recommendationReason?.venueId && recommendationReason.venueId === selectedHotspotId
    );
    if (!recommendationLockActive || matchingHotspots.some((hotspot) => hotspot.id === selectedHotspotId)) {
      return matchingHotspots;
    }

    const pinnedRecommendation = hotspots.find((hotspot) => hotspot.id === selectedHotspotId);
    return pinnedRecommendation ? [pinnedRecommendation, ...matchingHotspots] : matchingHotspots;
  }, [crowdFilter, friendsOnly, hotspots, liveMusicOnly, liveStoriesOnly, maxDistanceMiles, minScore, openNowOnly, overlays, recommendationReason?.venueId, selectedCity, selectedHotspotId, venueTypeFilter]);`;

if (!source.includes(filterEnd)) {
  throw new Error("Could not locate Radar hotspot filter end.");
}
source = source.replace(filterEnd, lockedFilterEnd);

fs.writeFileSync(filePath, source);
console.log("Applied Radar recommendation lock across overlay changes.");
