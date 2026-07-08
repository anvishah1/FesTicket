import { describe, it, expect } from "vitest";
import { FALLBACK_POSTER, isOptimizablePoster } from "@/lib/images";

describe("images helpers (FE-01)", () => {
  it("FALLBACK_POSTER is an absolute Unsplash URL", () => {
    expect(FALLBACK_POSTER).toMatch(/^https:\/\/images\.unsplash\.com\//);
  });

  it("optimizes allowlisted hosts (Unsplash + the API host)", () => {
    expect(isOptimizablePoster("https://images.unsplash.com/photo-x?w=400")).toBe(true);
    // NEXT_PUBLIC_API_URL defaults to http://localhost:4000 in the test env.
    expect(isOptimizablePoster("http://localhost:4000/uploads/x.png")).toBe(true);
  });

  it("passes through (unoptimized) relative, data:, and arbitrary hosts", () => {
    expect(isOptimizablePoster("/uploads/x.png")).toBe(false);
    expect(isOptimizablePoster("data:image/png;base64,AAAA")).toBe(false);
    expect(isOptimizablePoster("https://evil.example.com/x.png")).toBe(false);
    expect(isOptimizablePoster("")).toBe(false);
    expect(isOptimizablePoster(null)).toBe(false);
    expect(isOptimizablePoster(undefined)).toBe(false);
  });
});
