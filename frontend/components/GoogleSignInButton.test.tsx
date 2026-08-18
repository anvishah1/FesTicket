import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GoogleSignInButton from "@/components/GoogleSignInButton";

// NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset in the test env, so the component must
// render the graceful disabled affordance (dev/E2E unaffected).
describe("GoogleSignInButton (AUTH-05)", () => {
  it("renders a disabled 'coming soon' button when the client id is unset", () => {
    render(<GoogleSignInButton onCredential={vi.fn()} />);
    const btn = screen.getByTestId("google-disabled");
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(/coming soon/i);
    expect(screen.queryByTestId("google-signin")).not.toBeInTheDocument();
  });

  it("uses the theme-following label color by default (correct on a theme-following card, e.g. signin)", () => {
    render(<GoogleSignInButton onCredential={vi.fn()} />);
    const label = screen.getByText(/coming soon/i);
    expect(label.className).toContain("text-[var(--text-primary)]");
  });

  it("forces a fixed light label color on an always-dark surface (e.g. the signup panel)", () => {
    render(<GoogleSignInButton onCredential={vi.fn()} onDarkSurface />);
    const label = screen.getByText(/coming soon/i);
    expect(label.className).toContain("text-[#DEDCDC]");
  });
});
