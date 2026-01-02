// frontend/components/Header.tsx
import Link from "next/link";

export default function Header() {
  return (
    <header className="sticky top-0 z-40 bg-gradient-to-r from-[#29104A] via-[#3D1B5C] to-[#522C5D] shadow-md">
      <div className="container flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-white font-bold shadow-md">t</div>
          <span className="font-bold text-white">tiqr</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
          <Link href="/fests" className="text-white/80 hover:text-white transition-colors">Discover</Link>
          <Link href="/fests" className="text-white/80 hover:text-white transition-colors">Fests</Link>
          <Link href="/about" className="text-white/80 hover:text-white transition-colors">About</Link>
        </nav>

        <div className="flex items-center gap-4">
          <button className="hidden sm:inline-flex px-4 py-2 text-sm font-medium text-white/80 border border-white/30 rounded-lg hover:bg-white/10 hover:text-white transition-colors">
            Support
          </button>
          <Link href="/signin" className="px-4 py-2 text-sm font-semibold text-[#2D1B4E] bg-white rounded-lg hover:bg-white/90 transition-all">
            Sign In
          </Link>
        </div>
      </div>
    </header>
  );
}
