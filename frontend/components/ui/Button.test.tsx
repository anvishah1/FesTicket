import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Button from "@/components/ui/Button";

describe("Button", () => {
  it("renders its children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("applies solid variant styles by default", () => {
    render(<Button>Solid</Button>);
    const btn = screen.getByRole("button", { name: "Solid" });
    // base classes are always present
    expect(btn).toHaveClass("inline-flex", "rounded-md");
    // solid-specific classes (FE-11: token-driven)
    expect(btn).toHaveClass("bg-[var(--fill-plum)]", "text-white");
    // must NOT carry the outline border
    expect(btn.className).not.toContain("border-[var(--border-plum)]");
  });

  it("applies outline variant styles", () => {
    render(<Button variant="outline">Outline</Button>);
    const btn = screen.getByRole("button", { name: "Outline" });
    expect(btn).toHaveClass(
      "border",
      "border-[var(--border-plum)]",
      "text-[var(--text-primary)]",
      "bg-[var(--surface)]"
    );
    expect(btn.className).not.toContain("bg-[var(--fill-plum)]");
  });

  it("applies ghost variant styles", () => {
    render(<Button variant="ghost">Ghost</Button>);
    const btn = screen.getByRole("button", { name: "Ghost" });
    expect(btn).toHaveClass("text-[var(--text-primary)]", "hover:bg-[var(--surface-page)]", "px-3");
    expect(btn.className).not.toContain("bg-[var(--fill-plum)]");
    expect(btn.className).not.toContain("border-[var(--border-plum)]");
  });

  it("merges a custom className with the computed classes", () => {
    render(<Button className="my-custom-class">Custom</Button>);
    const btn = screen.getByRole("button", { name: "Custom" });
    expect(btn).toHaveClass("my-custom-class");
    // still keeps base + variant classes
    expect(btn).toHaveClass("inline-flex", "bg-[var(--fill-plum)]");
  });

  it("forwards native button props such as type and disabled", () => {
    render(
      <Button type="submit" disabled>
        Submit
      </Button>
    );
    const btn = screen.getByRole("button", { name: "Submit" });
    expect(btn).toHaveAttribute("type", "submit");
    expect(btn).toBeDisabled();
  });

  it("calls onClick when clicked", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Press</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Press" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Nope
      </Button>
    );
    await userEvent.click(screen.getByRole("button", { name: "Nope" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
