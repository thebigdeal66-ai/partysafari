import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/components/radar/SafariRadarExperience.tsx");
let source = fs.readFileSync(filePath, "utf8");

if (!source.includes('VenueMeetupActions from "@/components/radar/VenueMeetupActions"')) {
  source = source.replace(
    'import VenueCheckInButton from "@/components/VenueCheckInButton";',
    'import VenueCheckInButton from "@/components/VenueCheckInButton";\nimport VenueMeetupActions from "@/components/radar/VenueMeetupActions";'
  );
}

if (!source.includes("<VenueMeetupActions")) {
  const timelinePattern = /<VenueActivityTimeline\s+venueId=\{selectedHotspot\.id\}/;
  if (!timelinePattern.test(source)) {
    throw new Error("Could not locate venue activity timeline for meetup placement.");
  }

  source = source.replace(
    timelinePattern,
    '<VenueMeetupActions\n                        venueId={selectedHotspot.id}\n                        venueName={selectedHotspot.name}\n                        venueSlug={selectedHotspot.slug}\n                        friendsHereCount={selectedHotspot.friendsHere}\n                      />\n                      <VenueActivityTimeline\n                        venueId={selectedHotspot.id}'
  );
} else if (!source.includes("venueId={selectedHotspot.id}")) {
  source = source.replace(
    /<VenueMeetupActions\s+venueName=\{selectedHotspot\.name\}/,
    '<VenueMeetupActions\n                        venueId={selectedHotspot.id}\n                        venueName={selectedHotspot.name}'
  );
}

fs.writeFileSync(filePath, source);
console.log("Applied venue meetup actions to Safari Radar.");
