import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../src/components/radar/SafariRadarExperience.tsx");
let source = await readFile(target, "utf8");

const resetBlock = `      setMinScore(0);\n      setMaxDistanceMiles(20);\n      setFriendsOnly(false);\n      setOpenNowOnly(false);\n      setLiveStoriesOnly(false);\n      setLiveMusicOnly(false);\n      setVenueTypeFilter("All");\n      setCrowdFilter("All");\n      setOverlays({\n        friends: false,\n        stories: false,\n        events: false,\n        happyHour: false,\n        liveMusic: false,\n        lateNightFood: false,\n      });\n      setShowFilterSheet(false);`;

const localAnchor = `      setSelectedCity(localMatch);\n      setCityQuery(localMatch);\n      setSearchedCityCenter(center);\n      setSelectedHotspotId(null);`;
const localReplacement = `${localAnchor}\n${resetBlock}`;

if (!source.includes(localReplacement)) {
  if (!source.includes(localAnchor)) throw new Error("Radar local city-search anchor was not found.");
  source = source.replace(localAnchor, localReplacement);
}

const remoteAnchor = `      setSelectedCity(match.label);\n      setCityQuery(match.label);\n      setSearchedCityCenter(center);\n      setSelectedHotspotId(null);`;
const remoteReplacement = `${remoteAnchor}\n${resetBlock}`;

if (!source.includes(remoteReplacement)) {
  if (!source.includes(remoteAnchor)) throw new Error("Radar remote city-search anchor was not found.");
  source = source.replace(remoteAnchor, remoteReplacement);
}

await writeFile(target, source, "utf8");
console.log("Applied Radar city-change filter reset.");
