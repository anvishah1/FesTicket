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
});
