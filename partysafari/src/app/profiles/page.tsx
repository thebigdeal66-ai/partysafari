import ProfileCard from "../../components/ProfileCard";

const profiles = [
  {
    id: "1",
    type: "user" as const,
    name: "Alex Rivera",
    username: "@alexr",
    avatar: "/api/placeholder/120/120",
    bio: "Nightlife enthusiast, amateur DJ, and party photographer. Always chasing the best beats and vibes in the city.",
    location: "Downtown District",
    stats: { followers: 1247, following: 892, eventsAttended: 156, photosShared: 89 },
  },
  {
    id: "2",
    type: "business" as const,
    name: "Luna Lounge",
    username: "@lunalounge",
    avatar: "/api/placeholder/120/120",
    bio: "Premier rooftop nightclub with stunning city views, VIP bottle service, and world-class entertainment.",
    location: "123 Nightlife Blvd, Downtown",
    stats: { followers: 5432, eventsHosted: 89, rating: 4.8, reviews: 1247 },
  },
  {
    id: "3",
    type: "entertainer" as const,
    name: "DJ Solstice",
    username: "@djsolstice",
    avatar: "/api/placeholder/120/120",
    bio: "Deep-house DJ with 10+ years experience crafting signature sets that keep crowds moving all night.",
    location: "Based in Downtown",
    stats: { followers: 8765, gigsPlayed: 234, rating: 4.9, tracks: 156 },
  },
  {
    id: "4",
    type: "user" as const,
    name: "Jordan Blake",
    username: "@jordieb",
    avatar: "/api/placeholder/120/120",
    bio: "Event planner and nightlife coordinator. Love bringing people together for epic experiences.",
    location: "Midtown",
    stats: { followers: 2156, following: 743, eventsAttended: 89, photosShared: 234 },
  },
  {
    id: "5",
    type: "business" as const,
    name: "The Prism Club",
    username: "@prismclub",
    avatar: "/api/placeholder/120/120",
    bio: "Cutting-edge nightclub featuring immersive lighting, guest DJs, and interactive entertainment.",
    location: "456 Party Street, Midtown",
    stats: { followers: 3876, eventsHosted: 156, rating: 4.6, reviews: 892 },
  },
  {
    id: "6",
    type: "entertainer" as const,
    name: "Luna Vibe",
    username: "@lunavibe",
    avatar: "/api/placeholder/120/120",
    bio: "Electro-soul vocalist and performer. Creating magical moments with live vocals and aerial performances.",
    location: "Downtown Area",
    stats: { followers: 4321, gigsPlayed: 178, rating: 4.7, tracks: 89 },
  },
];

export default function ProfilesPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#07070B] text-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Discover Profiles</h1>
          <p className="mt-2 text-base leading-relaxed text-white/70 sm:text-xl">
            Connect with users, businesses, and entertainers in the PartySafari community
          </p>
        </div>

        <div className="mb-6 flex max-w-full flex-wrap gap-2 sm:mb-8 sm:gap-4">
          <button className="min-h-11 rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 sm:px-6">
            All Profiles
          </button>
          <button className="min-h-11 rounded-full border border-violet-500/50 bg-violet-500/10 px-5 py-2 text-sm font-semibold text-violet-200 transition hover:border-violet-300 hover:bg-violet-500/20 sm:px-6">
            Users
          </button>
          <button className="min-h-11 rounded-full border border-violet-500/50 bg-violet-500/10 px-5 py-2 text-sm font-semibold text-violet-200 transition hover:border-violet-300 hover:bg-violet-500/20 sm:px-6">
            Businesses
          </button>
          <button className="min-h-11 rounded-full border border-violet-500/50 bg-violet-500/10 px-5 py-2 text-sm font-semibold text-violet-200 transition hover:border-violet-300 hover:bg-violet-500/20 sm:px-6">
            Entertainers
          </button>
        </div>

        <div className="grid min-w-0 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
          {profiles.map((profile) => (
            <ProfileCard key={profile.id} profile={profile} />
          ))}
        </div>
      </div>
    </main>
  );
}
