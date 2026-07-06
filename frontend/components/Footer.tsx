// frontend/components/Footer.tsx
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-[#6B597F] mt-16 bg-[#C5BAC4]/50 backdrop-blur-sm">
      <div className="container py-8 flex flex-col sm:flex-row items-center justify-between gap-4">

        {/* Logo + Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#29104A] to-[#522C5D] flex items-center justify-center text-[#DEDCDC] font-bold">
            T
          </div>
          <span className="text-sm text-[#6B597F]">
            tiqr · © {new Date().getFullYear()}
          </span>
        </div>

        {/* Links */}
        <div className="flex items-center gap-6 text-sm text-[#6B597F]">
          <Link href="/about" className="hover:text-[#29104A] transition-colors">
            About
          </Link>
          <Link href="/privacy" className="hover:text-[#29104A] transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-[#29104A] transition-colors">
            Terms
          </Link>
          <Link href="/contact" className="hover:text-[#29104A] transition-colors">
            Contact
          </Link>
          <a
            href="mailto:support@tiqr.events"
            className="hover:text-[#29104A] transition-colors"
          >
            Support
          </a>
        </div>
      </div>
    </footer>
  );
}
