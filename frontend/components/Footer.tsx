// frontend/components/Footer.tsx
export default function Footer() {
  return (
    <footer className="border-t mt-16 bg-white/70 backdrop-blur-sm">
      <div className="container py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        
        {/* Logo + Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary-500 flex items-center justify-center text-white font-bold">
            T
          </div>
          <span className="text-sm text-slate-600">
            tiqrdupe · © {new Date().getFullYear()}
          </span>
        </div>

        {/* Links */}
        <div className="flex items-center gap-6 text-sm text-slate-600">
          <a href="/privacy" className="hover:text-primary-600 hover:underline">
            Privacy
          </a>
          <a href="/terms" className="hover:text-primary-600 hover:underline">
            Terms
          </a>
          <a href="/contact" className="hover:text-primary-600 hover:underline">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
