import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import HostOnboardingPage from "./page";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/host/onboarding",
}));

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));

beforeEach(() => {
  replace.mockClear();
});

describe("Host onboarding (redirect to real signup, no false confirmation)", () => {
  it("redirects to the real /signup editor flow", () => {
    render(<HostOnboardingPage />);
    expect(replace).toHaveBeenCalledWith("/signup");
  });

  it("never shows a fake 'Request Submitted' confirmation", () => {
    render(<HostOnboardingPage />);
    expect(screen.queryByText(/Request Submitted/i)).not.toBeInTheDocument();
  });
});
