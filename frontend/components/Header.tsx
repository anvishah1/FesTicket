// frontend/components/Header.tsx
import Link from "next/link";
import Button from "./ui/Button";

export default function Header() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur bg-white/60 border-b">
      <div className="container flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-primary-500 flex items-center justify-center text-white font-bold">t</div>
          <span className="font-semibold text-slate-900">tiqrdupe</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm text-slate-700">
          <Link href="/discover" className="hover:text-slate-900">Discover</Link>
          <Link href="/fests" className="hover:text-slate-900">Fests</Link>
          <Link href="/about" className="hover:text-slate-900">About</Link>
        </nav>

        <div className="flex items-center gap-3">
          <Button variant="outline" className="hidden sm:inline-flex">Support</Button>
          <Link href="/signin" className="text-sm text-slate-700 hover:underline">Sign In</Link>
        </div>
      </div>
    </header>
  );
}
