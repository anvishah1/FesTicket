import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Card from "@/components/card";

describe("Card", () => {
  it("renders the title as a heading", () => {
    render(<Card title="Music Fest" />);
    expect(screen.getByRole("heading", { name: "Music Fest" })).toBeInTheDocument();
  });

  it("renders the subtitle when provided", () => {
    render(<Card title="Music Fest" subtitle="Main Stage" />);
    expect(screen.getByText("Main Stage")).toBeInTheDocument();
  });

  it("renders the description when provided", () => {
    render(<Card title="Music Fest" description="A night of live bands" />);
    expect(screen.getByText("A night of live bands")).toBeInTheDocument();
  });

  it("does not render subtitle or description when omitted", () => {
    render(<Card title="Bare" />);
    expect(screen.queryByText("Main Stage")).not.toBeInTheDocument();
    expect(screen.queryByText("A night of live bands")).not.toBeInTheDocument();
  });

  it("renders an image with the title as alt text when image is provided", () => {
    render(<Card title="Music Fest" image="/poster.png" />);
    const img = screen.getByRole("img", { name: "Music Fest" });
    expect(img).toHaveAttribute("src", "/poster.png");
  });

  it("does not render an image when no image prop is passed", () => {
    render(<Card title="No Image" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders the hover overlay text only when both image and hoverText are provided", () => {
    render(<Card title="Fest" image="/poster.png" hoverText="Register Now" />);
    expect(screen.getByText("Register Now")).toBeInTheDocument();
  });

  it("does not render hoverText when there is no image", () => {
    // hover overlay lives inside the image block, so no image => no overlay
    render(<Card title="Fest" hoverText="Register Now" />);
    expect(screen.queryByText("Register Now")).not.toBeInTheDocument();
  });

  it("calls onClick when the card is clicked", async () => {
    const onClick = vi.fn();
    render(<Card title="Clickable" onClick={onClick} />);
    // clicking a child bubbles up to the container's onClick handler
    await userEvent.click(screen.getByRole("heading", { name: "Clickable" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not throw when clicked without an onClick handler", async () => {
    render(<Card title="Static" />);
    await userEvent.click(screen.getByRole("heading", { name: "Static" }));
    expect(screen.getByRole("heading", { name: "Static" })).toBeInTheDocument();
  });

  it("exposes button semantics with an accessible name when interactive", () => {
    render(<Card title="Music Fest" onClick={vi.fn()} />);
    const card = screen.getByRole("button", { name: "Music Fest" });
    // keyboard-focusable
    expect(card).toHaveAttribute("tabindex", "0");
  });

  it("is not a focusable control when no onClick is provided", () => {
    render(<Card title="Static" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("activates on Enter when focused", async () => {
    const onClick = vi.fn();
    render(<Card title="Keyboard" onClick={onClick} />);
    const card = screen.getByRole("button", { name: "Keyboard" });
    card.focus();
    expect(card).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("activates on Space when focused", async () => {
    const onClick = vi.fn();
    render(<Card title="Keyboard" onClick={onClick} />);
    screen.getByRole("button", { name: "Keyboard" }).focus();
    await userEvent.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows a discount badge when discount > 0", () => {
    render(<Card title="Deal" discount={25} />);
    const badge = screen.getByTestId("discount-badge");
    expect(badge).toHaveTextContent("25% OFF");
  });

  it("does not show a discount badge when discount is 0 or omitted", () => {
    const { rerender } = render(<Card title="No deal" discount={0} />);
    expect(screen.queryByTestId("discount-badge")).not.toBeInTheDocument();
    rerender(<Card title="No deal" />);
    expect(screen.queryByTestId("discount-badge")).not.toBeInTheDocument();
  });

  // FE-09: navigational cards render as real <a href> anchors.
  it("renders as an anchor with the href when href is provided", () => {
    render(<Card title="Music Fest" href="/fests/1/events" />);
    const link = screen.getByRole("link", { name: "Music Fest" });
    expect(link).toHaveAttribute("href", "/fests/1/events");
    // Not a button when it's a link.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("prefers href over onClick (renders a link, not a button)", () => {
    const onClick = vi.fn();
    render(<Card title="Music Fest" href="/x" onClick={onClick} />);
    expect(screen.getByRole("link", { name: "Music Fest" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  // SEO-08: "N going" social-proof badge.
  it("shows an 'N going' badge when going > 0", () => {
    render(<Card title="Popular" going={42} />);
    expect(screen.getByTestId("going-badge")).toHaveTextContent("42 going");
  });

  it("does not show the going badge when going is 0 or omitted", () => {
    const { rerender } = render(<Card title="Quiet" going={0} />);
    expect(screen.queryByTestId("going-badge")).not.toBeInTheDocument();
    rerender(<Card title="Quiet" />);
    expect(screen.queryByTestId("going-badge")).not.toBeInTheDocument();
  });
});
