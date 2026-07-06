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
    // solid-specific classes
    expect(btn).toHaveClass("bg-primary-500", "text-white");
    // must NOT carry the outline border
    expect(btn.className).not.toContain("border-primary-500");
  });

  it("applies outline variant styles", () => {
    render(<Button variant="outline">Outline</Button>);
    const btn = screen.getByRole("button", { name: "Outline" });
    expect(btn).toHaveClass("border", "border-primary-500", "text-primary-700", "bg-white");
    expect(btn.className).not.toContain("bg-primary-500");
  });

  it("applies ghost variant styles", () => {
    render(<Button variant="ghost">Ghost</Button>);
    const btn = screen.getByRole("button", { name: "Ghost" });
    expect(btn).toHaveClass("text-primary-700", "hover:bg-primary-50", "px-3");
    expect(btn.className).not.toContain("bg-primary-500");
    expect(btn.className).not.toContain("border-primary-500");
  });

  it("merges a custom className with the computed classes", () => {
    render(<Button className="my-custom-class">Custom</Button>);
    const btn = screen.getByRole("button", { name: "Custom" });
    expect(btn).toHaveClass("my-custom-class");
    // still keeps base + variant classes
    expect(btn).toHaveClass("inline-flex", "bg-primary-500");
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
