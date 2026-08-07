import Link from "next/link";

export default function LegalFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#07070B] px-5 py-6 text-white/55">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs">
        <span>© 2026 PartySafari.live</span>
        <Link href="/terms" className="hover:text-white">Terms</Link>
        <Link href="/privacy" className="hover:text-white">Privacy</Link>
        <Link href="/safety" className="hover:text-white">Safety</Link>
        <Link href="/privacy/request" className="hover:text-white">Privacy request</Link>
      </div>
    </footer>
  );
}
