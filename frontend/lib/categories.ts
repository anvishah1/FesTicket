// frontend/lib/categories.ts
//
// Single curated event-category taxonomy shared across the app (SEO-05 discover
// facets, SEO-10 create-form chips + landing pages) so categories don't drift.
// Event.category is stored as the LABEL string; slugs are used only for the
// /events/category/[slug] landing-page URLs (SEO-10). The backend validator
// mirrors these labels (SEO-10).

export type Category = { slug: string; label: string };

export const CATEGORIES: Category[] = [
  { slug: "workshop", label: "Workshop" },
  { slug: "networking", label: "Networking" },
  { slug: "conference", label: "Conference" },
  { slug: "meetup", label: "Meetup" },
  { slug: "hackathon", label: "Hackathon" },
  { slug: "concert", label: "Concert" },
  { slug: "cultural", label: "Cultural" },
  { slug: "technical", label: "Technical" },
  { slug: "sports", label: "Sports" },
  { slug: "other", label: "Other" },
];

// Ordered list of labels (what the API stores/filters on).
export const CATEGORY_LABELS: string[] = CATEGORIES.map((c) => c.label);

// Case-insensitive slug -> label. Returns undefined for an unknown slug so
// landing pages can notFound() (SEO-10).
export function slugToLabel(slug: string): string | undefined {
  const s = String(slug || "").toLowerCase();
  return CATEGORIES.find((c) => c.slug === s)?.label;
}

// Label (any casing) -> slug, for building landing-page links from stored values.
export function labelToSlug(label: string): string | undefined {
  const l = String(label || "").toLowerCase();
  return CATEGORIES.find((c) => c.label.toLowerCase() === l)?.slug;
}

export function isValidCategoryLabel(label: string): boolean {
  return CATEGORY_LABELS.some((l) => l.toLowerCase() === String(label || "").toLowerCase());
}
