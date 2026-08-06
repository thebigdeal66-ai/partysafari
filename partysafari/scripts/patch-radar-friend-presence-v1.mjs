import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/components/radar/SafariRadarExperience.tsx");
let source = fs.readFileSync(filePath, "utf8");

const oldFriendsLine = "        const friendsHere = metrics?.friendsHere || 0;";
const newFriendsBlock = `        const visibleFriendsHere = livePresence.presences.filter((presence) => {
          if (presence.userId === livePresence.userId || presence.privacyMode !== "friends") return false;
          return getDistanceMiles(
            { lat: presence.lat, lng: presence.lng },
            { lat: venue.latitude, lng: venue.longitude }
          ) <= 0.2;
        }).length;
        const friendsHere = Math.max(metrics?.friendsHere || 0, visibleFriendsHere);`;

if (source.includes(oldFriendsLine)) {
  source = source.replace(oldFriendsLine, newFriendsBlock);
}

const oldDeps = "  }, [eventsByVenueId, liveMetrics.metricsByVenueId, mapCenter, partyScores.scoresByVenueId, userLocation, venues]);";
const newDeps = "  }, [eventsByVenueId, liveMetrics.metricsByVenueId, livePresence.presences, livePresence.userId, mapCenter, partyScores.scoresByVenueId, userLocation, venues]);";
if (source.includes(oldDeps)) {
  source = source.replace(oldDeps, newDeps);
}

const oldSignal = '{ key: "lit", icon: "🔥", label: "Lit Activity", value: null },';
const friendSignal = '{ key: "friends", icon: "🧭", label: "Friends Here", value: selectedHotspot.friendsHere },\n                    { key: "lit", icon: "🔥", label: "Lit Activity", value: null },';
if (source.includes(oldSignal) && !source.includes('label: "Friends Here"')) {
  source = source.replace(oldSignal, friendSignal);
}

const styleMarker = "        .radar-live-person.friend {";
if (source.includes(styleMarker) && !source.includes(".radar-live-person.friend::after")) {
  source = source.replace(
    styleMarker,
    `        .radar-live-person.friend::after {
          content: "FRIEND";
          position: absolute;
          left: 50%;
          top: -11px;
          transform: translateX(-50%);
          border: 1px solid rgba(240, 171, 252, 0.55);
          border-radius: 9999px;
          background: rgba(88, 28, 135, 0.92);
          padding: 1px 5px;
          font-size: 7px;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: #fae8ff;
          white-space: nowrap;
        }

${styleMarker}`
  );
  source = source.replace(
    "          width: 34px;",
    "          position: relative;\n          width: 34px;"
  );
}

fs.writeFileSync(filePath, source);
console.log("Applied opt-in friend presence venue integration.");
