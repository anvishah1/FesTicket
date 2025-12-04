// frontend/components/HeroIllustration.tsx
export default function HeroIllustration() {
  return (
    <div className="w-full">
      <svg viewBox="0 0 800 560" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="g1" x1="0" x2="1">
            <stop offset="0" stopColor="#eadcff" />
            <stop offset="1" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>

        <rect x="12" y="12" width="320" height="420" rx="20" fill="#fff" stroke="#E6F7F6"/>
        <rect x="80" y="60" width="420" height="280" rx="18" fill="url(#g1)" opacity="0.16"/>
        <circle cx="620" cy="120" r="38" fill="#ffb020" opacity="0.95"/>
        <rect x="520" y="200" width="200" height="120" rx="14" fill="#E6F7F6"/>
        <path d="M120 420c140-60 320-80 520-20" stroke="#CDEDF0" strokeWidth="26" strokeLinecap="round" fill="none"/>
      </svg>
    </div>
  );
}
