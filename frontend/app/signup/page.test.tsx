import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SignUpPage from "./page";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/signup",
}));

// Keep the layout chrome trivial so the test focuses on the form behaviour.
vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe("SignUpPage captcha (M4)", () => {
  it("keeps submit gated on the demo captcha checkbox and posts captchaToken", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: "ok" }),
    });

    render(<SignUpPage />);

    const submit = screen.getByRole("button", { name: /sign up with email/i });
    await userEvent.type(screen.getByPlaceholderText("you@school.edu"), "student@example.com");
    await userEvent.type(screen.getByPlaceholderText("At least 8 characters"), "Password1!");
    await userEvent.type(screen.getByPlaceholderText("Confirm password"), "Password1!");

    // A valid, matching password is not enough — the captcha checkbox still gates submit.
    expect(submit).toBeDisabled();

    await userEvent.click(screen.getByLabelText(/i'?m not a robot/i));
    expect(submit).toBeEnabled();

    await userEvent.click(submit);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain("/api/auth/signup");
    const body = JSON.parse(call[1].body);
    // Graceful placeholder token when NEXT_PUBLIC_CAPTCHA_SITE_KEY is unset.
    expect(body.captchaToken).toBe("dev");
    expect(body.email).toBe("student@example.com");
  });

  it("keeps submit disabled for a weak password even with captcha checked", async () => {
    render(<SignUpPage />);
    const submit = screen.getByRole("button", { name: /sign up with email/i });

    await userEvent.type(screen.getByPlaceholderText("you@school.edu"), "student@example.com");
    // Weak: lowercase + digits only (no uppercase, no special char).
    await userEvent.type(screen.getByPlaceholderText("At least 8 characters"), "password123");
    await userEvent.type(screen.getByPlaceholderText("Confirm password"), "password123");
    await userEvent.click(screen.getByLabelText(/i'?m not a robot/i));

    expect(submit).toBeDisabled();
  });

  it("keeps submit disabled when a valid password does not match its confirmation", async () => {
    render(<SignUpPage />);
    const submit = screen.getByRole("button", { name: /sign up with email/i });

    await userEvent.type(screen.getByPlaceholderText("you@school.edu"), "student@example.com");
    await userEvent.type(screen.getByPlaceholderText("At least 8 characters"), "Password1!");
    await userEvent.type(screen.getByPlaceholderText("Confirm password"), "Password1?");
    await userEvent.click(screen.getByLabelText(/i'?m not a robot/i));

    expect(submit).toBeDisabled();
  });

  it("enables submit once a fully-valid matching password is entered", async () => {
    render(<SignUpPage />);
    const submit = screen.getByRole("button", { name: /sign up with email/i });

    await userEvent.type(screen.getByPlaceholderText("you@school.edu"), "student@example.com");
    await userEvent.type(screen.getByPlaceholderText("At least 8 characters"), "Password1!");
    await userEvent.type(screen.getByPlaceholderText("Confirm password"), "Password1!");
    await userEvent.click(screen.getByLabelText(/i'?m not a robot/i));

    expect(submit).toBeEnabled();
  });

  it("renders the Google sign-up button disabled (coming soon) and never navigates", async () => {
    render(<SignUpPage />);
    const googleBtn = screen.getByRole("button", { name: /sign up with google/i });
    expect(googleBtn).toBeDisabled();
    await userEvent.click(googleBtn);
    expect(push).not.toHaveBeenCalled();
  });
});
