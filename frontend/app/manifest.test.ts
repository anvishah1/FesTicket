import { describe, it, expect } from "vitest";
import manifest from "./manifest";

describe("PWA manifest (TIX-08)", () => {
  const m = manifest();

  it("declares an installable standalone app with brand identity", () => {
    expect(m.name).toMatch(/FesTicket/i);
    expect(m.short_name).toBe("FesTicket");
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.theme_color).toBe("#522C5D");
  });

  it("ships 192 + 512 icons and a maskable variant", () => {
    const sizes = (m.icons ?? []).map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    const maskable = (m.icons ?? []).find((i) => i.purpose === "maskable");
    expect(maskable).toBeTruthy();
    expect(maskable?.sizes).toBe("512x512");
  });
});
