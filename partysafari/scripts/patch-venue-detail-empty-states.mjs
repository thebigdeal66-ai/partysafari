import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/app/venues/[slug]/page.tsx");
let source = fs.readFileSync(filePath, "utf8");

const replacements = [
  [
    '<p className="mt-3 text-white/70">No published events scheduled for tonight.</p>',
    '<div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4"><p className="font-medium text-white">Nothing announced for tonight yet</p><p className="mt-1 text-sm text-white/65">Check back closer to party time—new events can appear throughout the day.</p></div>',
  ],
  [
    '<p className="mt-3 text-white/70">No upcoming published events yet.</p>',
    '<div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4"><p className="font-medium text-white">More nights are coming</p><p className="mt-1 text-sm text-white/65">This venue has not posted its next event yet.</p></div>',
  ],
  [
    '<p className="mt-2 text-sm text-white/70">Hours not provided.</p>',
    '<div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4"><p className="font-medium text-white">Hours are not confirmed</p><p className="mt-1 text-sm text-white/65">Check the venue website or call before heading out.</p></div>',
  ],
  [
    '<p><span className="text-violet-300">Phone:</span> {venue.phone || "Not listed"}</p>',
    '<p><span className="text-violet-300">Phone:</span> {venue.phone || "Not provided yet"}</p>',
  ],
  [
    '<p><span className="text-violet-300">Website:</span> {venue.website_url ? <a href={venue.website_url} target="_blank" rel="noreferrer" className="text-violet-200 underline">Visit</a> : "Not listed"}</p>',
    '<p><span className="text-violet-300">Website:</span> {venue.website_url ? <a href={venue.website_url} target="_blank" rel="noreferrer" className="text-violet-200 underline">Visit venue website</a> : "Not provided yet"}</p>',
  ],
  [
    '<p><span className="text-violet-300">Address:</span> {venueAddress || "Not listed"}</p>',
    '<p><span className="text-violet-300">Address:</span> {venueAddress || "Location details coming soon"}</p>',
  ],
  [
    '<p><span className="text-violet-300">Drink Specials:</span> {venue.drink_specials || "None listed"}</p>',
    '<p><span className="text-violet-300">Drink Specials:</span> {venue.drink_specials || "No specials posted tonight"}</p>',
  ],
];

for (const [before, after] of replacements) {
  if (source.includes(before)) {
    source = source.replace(before, after);
  }
}

fs.writeFileSync(filePath, source);
console.log("Applied venue detail empty-state polish.");
