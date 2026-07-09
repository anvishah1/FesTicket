"use client";

import Link from "next/link";
import PosterImage from "@/components/PosterImage";

interface CardProps {
  title: string;
  description?: string;
  image?: string;
  subtitle?: string;
  onClick?: () => void;
  href?: string; // FE-09: when set, the card is a real <Link> anchor (prefetched, crawlable, new-tab-able)
  hoverText?: string; // Optional hover overlay text (e.g., "Register Now")
  discount?: number; // Percentage discount; when > 0 a "X% OFF" badge is shown
  going?: number; // SEO-08: COMPLETED-booking count; when > 0 an "N going" badge shows
}

export default function Card({ title, description, image, subtitle, onClick, href, hoverText, discount, going }: CardProps) {
  const hasDiscount = typeof discount === "number" && discount > 0;
  const hasGoing = typeof going === "number" && going > 0;
  const isButton = !href && typeof onClick === "function";

  // When the card acts as a control (no href), expose real button semantics so it
  // is keyboard-focusable (Tab), activates on Enter/Space, and has an accessible
  // name. With an href the <Link> anchor is natively focusable/activatable.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isButton) return;
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      onClick?.();
    }
  };

  const className = `
    group relative
    bg-white border border-[#C5BAC4] rounded-xl overflow-hidden
    transition-all duration-200
    hover:shadow-lg hover:-translate-y-1
    flex flex-col
    focus:outline-none focus-visible:ring-2 focus-visible:ring-[#522C5D] focus-visible:ring-offset-2
    ${href || isButton ? "cursor-pointer" : ""}
  `;

  const inner = (
    <>
      {/* Discount badge */}
      {hasDiscount && (
        <span
          data-testid="discount-badge"
          className="absolute top-2 right-2 z-10 rounded-full bg-[#E11D48] px-2.5 py-1 text-xs font-bold text-white shadow-md"
        >
          {discount}% OFF
        </span>
      )}

      {/* Image */}
      {image && (
        <div className="relative w-full h-80 bg-[#C5BAC4]/20 overflow-hidden">
          <PosterImage
            src={image}
            alt={title}
            sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
          {/* Hover Overlay */}
          {hoverText && (
            <div className="absolute inset-0 bg-[#29104A]/70 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
              <span className="text-white text-lg font-bold tracking-wide px-6 py-3 border-2 border-white rounded-full hover:bg-white hover:text-[#29104A] transition-colors duration-200">
                {hoverText}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="p-5 flex flex-col flex-grow">
        <h2 className="text-base font-semibold text-[#29104A] mb-1 line-clamp-2">{title}</h2>

        {subtitle && <p className="text-sm text-[#522C5D] mb-2">{subtitle}</p>}

        {description && <p className="text-sm text-[#6B597F] line-clamp-2">{description}</p>}

        {/* SEO-08: "N going" social proof — only when there are COMPLETED bookings */}
        {hasGoing && (
          <span
            data-testid="going-badge"
            className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-[#522C5D]/10 px-2.5 py-1 text-xs font-medium text-[#522C5D]"
          >
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {going} going
          </span>
        )}
      </div>
    </>
  );

  // FE-09: a navigational card is a real anchor (prefetched, ctrl/middle-click to
  // open in a new tab, crawlable). A non-navigational card keeps button semantics.
  if (href) {
    return (
      <Link href={href} className={className} aria-label={title}>
        {inner}
      </Link>
    );
  }

  return (
    <div
      onClick={onClick}
      onKeyDown={isButton ? handleKeyDown : undefined}
      role={isButton ? "button" : undefined}
      tabIndex={isButton ? 0 : undefined}
      aria-label={isButton ? title : undefined}
      className={className}
    >
      {inner}
    </div>
  );
}
