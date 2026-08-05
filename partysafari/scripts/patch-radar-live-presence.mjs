import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../src/components/radar/SafariRadarExperience.tsx");
let source = await readFile(target, "utf8");

const importLine = 'import { useLivePartyPresence } from "@/hooks/useLivePartyPresence";';
if (!source.includes(importLine)) {
  source = source.replace(
    'import VenueCheckInButton from "@/components/VenueCheckInButton";',
    `import VenueCheckInButton from "@/components/VenueCheckInButton";\n${importLine}`,
  );
}

const iconFunction = `
function createLivePresenceIcon(isFriend: boolean) {
  return L.divIcon({
    className: "",
    html: \`<div class="radar-live-person \${isFriend ? "friend" : "public"}"><span>👤</span></div>\`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}
`;

if (!source.includes("function createLivePresenceIcon")) {
  source = source.replace("function MapTracker({ onZoomChange }: MapTrackerProps) {", `${iconFunction}\nfunction MapTracker({ onZoomChange }: MapTrackerProps) {`);
}

const hookLine = "  const livePresence = useLivePartyPresence();";
if (!source.includes(hookLine)) {
  source = source.replace(
    "  const supabase = useMemo(() => createSupabaseBrowser(), []);",
    `  const supabase = useMemo(() => createSupabaseBrowser(), []);\n${hookLine}`,
  );
}

const controlBlock = `
        <label className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-100">
          <span className="mr-2 text-cyan-100/70">Live</span>
          <select
            value={livePresence.privacyMode}
            onChange={(event) => void livePresence.setPrivacyMode(event.target.value as "public" | "friends" | "invisible")}
            disabled={!livePresence.userId || livePresence.loading}
            className="bg-transparent text-cyan-50 outline-none disabled:opacity-50"
            aria-label="Live location privacy"
          >
            <option value="invisible" className="bg-[#0a0b14]">Invisible</option>
            <option value="friends" className="bg-[#0a0b14]">Friends</option>
            <option value="public" className="bg-[#0a0b14]">Public</option>
          </select>
          <span className="ml-2 rounded-full bg-cyan-300/15 px-1.5 py-0.5 text-[10px] text-cyan-100/80">
            {livePresence.presences.filter((presence) => presence.userId !== livePresence.userId).length} nearby
          </span>
        </label>
`;

if (!source.includes('aria-label="Live location privacy"')) {
  const locateButtonEnd = `        </button>\n\n        <label className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90">`;
  source = source.replace(locateButtonEnd, `        </button>\n${controlBlock}\n        <label className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90">`);
} else if (!source.includes("nearby\n          </span>")) {
  source = source.replace(
    '          </select>\n        </label>',
    '          </select>\n          <span className="ml-2 rounded-full bg-cyan-300/15 px-1.5 py-0.5 text-[10px] text-cyan-100/80">\n            {livePresence.presences.filter((presence) => presence.userId !== livePresence.userId).length} nearby\n          </span>\n        </label>',
  );
}

const markersBlock = `
            {livePresence.presences
              .filter((presence) => presence.userId !== livePresence.userId)
              .map((presence) => (
                <Marker
                  key={\`presence:\${presence.userId}\`}
                  position={[presence.lat, presence.lng]}
                  icon={createLivePresenceIcon(presence.privacyMode === "friends")}
                  zIndexOffset={900}
                />
              ))}
`;

if (!source.includes("presence.userId !== livePresence.userId")) {
  source = source.replace(
    "            <TileLayer\n",
    `${markersBlock}\n            <TileLayer\n`,
  );
}

const liveStyles = `
        .radar-live-person {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border-radius: 9999px;
          border: 2px solid rgba(255, 255, 255, 0.9);
          background: radial-gradient(circle at 30% 25%, #67e8f9, #0369a1 70%);
          box-shadow: 0 0 0 7px rgba(34, 211, 238, 0.14), 0 8px 24px rgba(0, 0, 0, 0.5);
          animation: live-person-pulse 2.4s ease-in-out infinite;
          transition: filter 250ms ease, opacity 250ms ease;
        }

        .radar-live-person:hover {
          filter: brightness(1.2);
        }

        .radar-live-person.friend {
          background: radial-gradient(circle at 30% 25%, #f0abfc, #a21caf 70%);
          box-shadow: 0 0 0 7px rgba(217, 70, 239, 0.16), 0 8px 24px rgba(0, 0, 0, 0.5);
        }

        .radar-live-person span { font-size: 16px; }

        @keyframes live-person-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
`;

if (!source.includes(".radar-live-person")) {
  source = source.replace("        .radar-map .leaflet-tile {", `${liveStyles}\n        .radar-map .leaflet-tile {`);
} else if (!source.includes("transition: filter 250ms ease")) {
  source = source.replace(
    "          animation: live-person-pulse 2.4s ease-in-out infinite;",
    "          animation: live-person-pulse 2.4s ease-in-out infinite;\n          transition: filter 250ms ease, opacity 250ms ease;",
  );
  source = source.replace(
    "        .radar-live-person.friend {",
    "        .radar-live-person:hover {\n          filter: brightness(1.2);\n        }\n\n        .radar-live-person.friend {",
  );
}

await writeFile(target, source, "utf8");
console.log("Applied Safari Radar live-presence integration patch.");
