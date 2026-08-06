import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/components/radar/SafariRadarExperience.tsx");
let source = fs.readFileSync(filePath, "utf8");

if (!source.includes('VenueActivityTimeline from "@/components/radar/VenueActivityTimeline"')) {
  source = source.replace(
    'import VenueCheckInButton from "@/components/VenueCheckInButton";',
    'import VenueCheckInButton from "@/components/VenueCheckInButton";\nimport VenueActivityTimeline from "@/components/radar/VenueActivityTimeline";'
  );
}

if (!source.includes("<VenueActivityTimeline")) {
  const marker = '                    <div className="grid grid-cols-3 gap-2">';
  if (!source.includes(marker)) {
    throw new Error("Could not locate Radar venue supplemental actions for activity timeline.");
  }

  source = source.replace(
    marker,
    `                    <>\n                      <VenueActivityTimeline\n                        venueId={selectedHotspot.id}\n                        venueName={selectedHotspot.name}\n                        eventTitle={selectedHotspot.currentEvent}\n                        partyScore={selectedHotspot.partyScore.score}\n                        momentum={selectedHotspot.partyScore.momentum}\n                        scoreUpdatedAt={selectedHotspot.partyScore.updatedAt}\n                      />\n                      <div className="mt-2 grid grid-cols-3 gap-2">`
  );

  source = source.replace(
    '                    </div>\n                  }\n                />',
    '                      </div>\n                    </>\n                  }\n                />'
  );
}

fs.writeFileSync(filePath, source);
console.log("Applied live venue activity timeline to Safari Radar.");
