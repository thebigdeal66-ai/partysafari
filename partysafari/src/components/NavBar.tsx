import Link from "next/link";
import NotificationCenter from "@/components/NotificationCenter";

export default function NavBar() {
  return (
    <nav className="bg-[#07070B] border-b border-white/10 px-6 py-4">
      <div className="mx-auto max-w-6xl flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold text-white">
          🔥 PartySafari
        </Link>
        <div className="flex items-center gap-6">
          <div className="hidden lg:flex items-center gap-6">
            <Link
              href="/"
              className="text-white/80 hover:text-violet-300 transition-colors"
            >
              Home
            </Link>
            <Link
              href="/feed"
              className="text-white/80 hover:text-violet-300 transition-colors"
            >
              Feed
            </Link>
            <Link
              href="/profiles"
              className="text-white/80 hover:text-violet-300 transition-colors"
            >
              Profiles
            </Link>
            <Link
              href="/requests"
              className="text-white/80 hover:text-violet-300 transition-colors"
            >
              Requests
            </Link>
            <Link
              href="/messages"
              className="text-white/80 hover:text-violet-300 transition-colors"
            >
              Messages
            </Link>
            <Link
              href="/dashboard"
              className="text-white/80 hover:text-violet-300 transition-colors"
            >
              Dashboard
            </Link>
          </div>
          <NotificationCenter />
        </div>
      </div>
    </nav>
  );
}