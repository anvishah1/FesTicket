"use client";

import Image from "next/image";
import { isOptimizablePoster } from "@/lib/images";

// FE-01: next/image poster wrapper. Uses `fill` (parent must be position:relative
// with a fixed height, which reserves the box before load → no CLS) and serves
// AVIF/WebP for allowlisted hosts. Non-allowlisted / data: / relative sources are
// rendered unoptimized (as-is) so an arbitrary organizer-pasted URL never
// hard-fails the render.
export default function PosterImage({
  src,
  alt,
  sizes,
  priority,
  className,
}: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      unoptimized={!isOptimizablePoster(src)}
      className={className}
    />
  );
}
