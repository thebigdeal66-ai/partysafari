import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../src/components/radar/SafariRadarExperience.tsx");
const source = await readFile(target, "utf8");

const oldBlock = `        traceSetState("userLocation", 472, location);
        setUserLocation(location);
        traceSetState("geoError", 474, null);
        setGeoError(null);`;

const newBlock = `        traceSetState("userLocation", 472, location);
        setUserLocation(location);
        setSelectedCity("nearby");
        setViewMode("map");
        setFocusTarget({ lat: location.lat, lng: location.lng, zoom: 15 });
        traceSetState("geoError", 474, null);
        setGeoError(null);`;

if (!source.includes(oldBlock)) {
  if (source.includes(newBlock)) {
    console.log("Safari Radar Locate Me recenter patch already applied.");
    process.exit(0);
  }
  throw new Error("Safari Radar geolocation success block was not found.");
}

const patched = source.replace(oldBlock, newBlock);

await writeFile(target, patched, "utf8");
console.log("Applied Safari Radar Locate Me recenter patch without tying geolocation to map zoom changes.");
