// frontend/components/Footer.tsx
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-[var(--border-mauve)] mt-16 bg-[color-mix(in_srgb,var(--surface-card)_50%,transparent)] backdrop-blur-sm">
      <div className="container py-8 flex flex-col sm:flex-row items-center justify-between gap-4">

        {/* Logo + Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#29104A] to-[#522C5D] flex items-center justify-center text-[#DEDCDC] font-bold">
            T
          </div>
          <span className="text-sm text-[var(--text-muted)]">
            FesTicket · © {new Date().getFullYear()}
          </span>
        </div>

        {/* Links */}
        <div className="flex items-center gap-6 text-sm text-[var(--text-muted)]">
          <Link href="/about" className="hover:text-[var(--text-primary)] transition-colors">
            About
          </Link>
          <Link href="/privacy" className="hover:text-[var(--text-primary)] transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-[var(--text-primary)] transition-colors">
            Terms
          </Link>
          <Link href="/contact" className="hover:text-[var(--text-primary)] transition-colors">
            Contact
          </Link>
          <a
            href="mailto:support@FesTicket.events"
            className="hover:text-[var(--text-primary)] transition-colors"
          >
            Support
          </a>
        </div>
      </div>
    </footer>
  );
}
