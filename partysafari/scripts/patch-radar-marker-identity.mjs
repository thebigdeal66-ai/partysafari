import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../src/components/radar/SafariRadarExperience.tsx");
let source = await readFile(target, "utf8");

source = source.replace(
  'import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";',
  'import { Circle, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";',
);

const helpers = `
function venueCategoryIcon(venueType: string | null) {
  const value = (venueType || "").toLowerCase();
  if (value.includes("club") || value.includes("dance")) return "💃";
  if (value.includes("bar") || value.includes("pub") || value.includes("tavern")) return "🍸";
  if (value.includes("restaurant") || value.includes("food")) return "🍽️";
  if (value.includes("music") || value.includes("concert")) return "🎵";
  if (value.includes("brew") || value.includes("beer")) return "🍺";
  if (value.includes("lounge")) return "✨";
  return "📍";
}

function createUserLocationIcon() {
  return L.divIcon({
    className: "",
    html: '<div class="radar-user-location"><span></span><strong>You</strong></div>',
    iconSize: [54, 54],
    iconAnchor: [27, 27],
  });
}
`;

if (!source.includes("function venueCategoryIcon")) {
  source = source.replace("function createHotspotIcon(hotspot: RadarHotspot, selected: boolean) {", `${helpers}\nfunction createHotspotIcon(hotspot: RadarHotspot, selected: boolean) {`);
}

source = source.replace(
  '    html: `<button class="${style.className}${selected ? " selected" : ""}" style="width:${radius * 2}px;height:${radius * 2}px"><span>${score}</span></button>`,',
  '    html: `<button class="${style.className}${selected ? " selected" : ""}" style="width:${radius * 2}px;height:${radius * 2}px" aria-label="${hotspot.name}"><span class="radar-hotspot-icon" aria-hidden="true">${venueCategoryIcon(hotspot.venueType)}</span></button>`,',
);

source = source.replace(
  '    html: `<button class="radar-cluster ${style.className}"><span>${hotspots.length}</span></button>`,',
  '    html: `<button class="radar-cluster ${style.className}" aria-label="${hotspots.length} venues"><span>${hotspots.length}</span><small>places</small></button>`,',
);

if (!source.includes('icon={createUserLocationIcon()}')) {
  source = source.replace(
    "            <TileLayer\n",
    `            {userLocation ? (\n              <Marker position={[userLocation.lat, userLocation.lng]} icon={createUserLocationIcon()} zIndexOffset={1200}>\n                <Tooltip direction="top" offset={[0, -20]} opacity={0.96}>Your current location</Tooltip>\n              </Marker>\n            ) : null}\n\n            <TileLayer\n`,
  );
}

if (!source.includes("hotspot.name}</strong>")) {
  source = source.replace(
    `                  )}\n                </Marker>`,
    `                  )}\n                  <Tooltip direction="top" offset={[0, -18]} opacity={0.97}>\n                    <div className="min-w-[150px] text-xs">\n                      <strong className="block text-sm">{hotspot.name}</strong>\n                      <span className="opacity-75">{hotspot.venueType || "Venue"} · {formatMiles(hotspot.distanceMiles)}</span>\n                      <span className="mt-1 block font-semibold">{hotspot.tier} · Pulse {Math.round(hotspot.crowdPulse.pulseScore)}</span>\n                    </div>\n                  </Tooltip>\n                </Marker>`,
  );
}

const styles = `
        .radar-hotspot {
          flex-direction: column;
          gap: 0;
        }

        .radar-hotspot-icon {
          font-size: 16px !important;
          line-height: 1 !important;
        }

        .radar-cluster {
          flex-direction: column;
        }

        .radar-cluster small {
          margin-top: 2px;
          font-size: 8px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .radar-user-location {
          position: relative;
          width: 54px;
          height: 54px;
          display: grid;
          place-items: center;
        }

        .radar-user-location span {
          width: 18px;
          height: 18px;
          border: 3px solid white;
          border-radius: 9999px;
          background: #38bdf8;
          box-shadow: 0 0 0 8px rgba(56, 189, 248, 0.2), 0 0 28px rgba(56, 189, 248, 0.9);
          animation: radar-user-pulse 2s ease-out infinite;
        }

        .radar-user-location strong {
          position: absolute;
          top: 38px;
          border: 1px solid rgba(255,255,255,.25);
          border-radius: 9999px;
          background: rgba(5, 6, 13, .88);
          padding: 2px 7px;
          color: white;
          font-size: 9px;
          white-space: nowrap;
        }

        @keyframes radar-user-pulse {
          0%, 100% { box-shadow: 0 0 0 6px rgba(56, 189, 248, .18), 0 0 24px rgba(56, 189, 248, .75); }
          50% { box-shadow: 0 0 0 13px rgba(56, 189, 248, 0), 0 0 34px rgba(56, 189, 248, 1); }
        }
`;

if (!source.includes(".radar-user-location")) {
  source = source.replace("        .radar-map .leaflet-tile {", `${styles}\n        .radar-map .leaflet-tile {`);
}

await writeFile(target, source, "utf8");
console.log("Applied Safari Radar marker identity patch.");
