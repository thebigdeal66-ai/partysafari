import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/components/radar/SafariRadarExperience.tsx");
let source = fs.readFileSync(filePath, "utf8");

if (!source.includes("function formatVenueType")) {
  const anchor = `function cityLabel(venue: RadarVenue) {`;
  const helper = `function formatVenueType(value: string | null) {
  const normalized = (value || "venue").trim().toLowerCase();
  const known: Record<string, string> = {
    live_music_bar: "Live Music Bar",
    nightclub: "Nightclub",
    night_club: "Nightclub",
    cocktail_bar: "Cocktail Bar",
    sports_bar: "Sports Bar",
    beach_bar: "Beach Bar",
    rooftop_bar: "Rooftop Bar",
    dance_club: "Dance Club",
    music_venue: "Music Venue",
    restaurant_bar: "Restaurant & Bar",
  };

  if (known[normalized]) return known[normalized];

  return normalized
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ") || "Venue";
}

`;
  if (!source.includes(anchor)) throw new Error("Could not locate cityLabel helper anchor.");
  source = source.replace(anchor, helper + anchor);
}

source = source.replaceAll(
  '{hotspot.venueType || "Venue"}',
  '{formatVenueType(hotspot.venueType)}'
);

source = source.replaceAll(
  'venueCategory={selectedHotspot.venueType}',
  'venueCategory={formatVenueType(selectedHotspot.venueType)}'
);

source = source.replaceAll(
  '{selectedHotspot.venueType || "Venue"}',
  '{formatVenueType(selectedHotspot.venueType)}'
);

fs.writeFileSync(filePath, source);
console.log("Applied consumer-friendly Radar venue labels.");