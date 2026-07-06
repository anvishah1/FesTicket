import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HeroIllustration from "@/components/HeroIllustration";

describe("HeroIllustration", () => {
  it("renders the hero image with descriptive alt text", () => {
    render(<HeroIllustration />);
    const img = screen.getByRole("img", { name: /campus festival/i });
    expect(img).toBeInTheDocument();
  });

  it("points the image at the hero illustration asset", () => {
    render(<HeroIllustration />);
    const img = screen.getByRole("img", { name: /campus festival/i });
    expect(img).toHaveAttribute("src", "/hero-illustration.png");
  });
});
