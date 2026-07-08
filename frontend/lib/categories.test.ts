import { describe, it, expect } from "vitest";
import { CATEGORIES, CATEGORY_LABELS, slugToLabel, labelToSlug, isValidCategoryLabel } from "@/lib/categories";

describe("categories taxonomy (SEO-10)", () => {
  it("CATEGORY_LABELS mirrors CATEGORIES in order", () => {
    expect(CATEGORY_LABELS).toEqual(CATEGORIES.map((c) => c.label));
    expect(CATEGORY_LABELS).toContain("Concert");
  });

  it("slugToLabel maps a known slug (case-insensitive) and rejects unknown", () => {
    expect(slugToLabel("concert")).toBe("Concert");
    expect(slugToLabel("CONCERT")).toBe("Concert");
    expect(slugToLabel("not-a-category")).toBeUndefined();
  });

  it("labelToSlug maps a label of any casing to its slug", () => {
    expect(labelToSlug("Concert")).toBe("concert");
    expect(labelToSlug("concert")).toBe("concert");
    expect(labelToSlug("Nope")).toBeUndefined();
  });

  it("isValidCategoryLabel is case-insensitive", () => {
    expect(isValidCategoryLabel("workshop")).toBe(true);
    expect(isValidCategoryLabel("Workshop")).toBe(true);
    expect(isValidCategoryLabel("Bogus")).toBe(false);
  });
});
